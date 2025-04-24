import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { db } from '../firebase/firebase.js';
import { ref, onValue, push, serverTimestamp, query, orderByChild, limitToLast } from "firebase/database";
import { user } from './user.js';
import { game } from './game.js';

// Maximum number of messages to retain in memory (client-side)
const MAX_MESSAGES = 100;

// Maximum messages to keep per world (server-side cleanup)
export const MAX_CHAT_HISTORY = 500;

// Chat store
export const chatStore = writable({
  messages: [],
  loading: false,
  error: null,
  unreadCount: 0,
  currentWorldId: null,
  lastReadTime: Date.now() // Add this line
});

// Derived store to get messages sorted by timestamp
export const messages = derived(
  chatStore,
  $chat => $chat.messages.slice().sort((a, b) => a.timestamp - b.timestamp)
);

// Add a derived store for unread messages that considers time
export const unreadMessages = derived(
  [chatStore, user],  // Include user store to check message ownership
  ([$chat, $user]) => {
    const now = Date.now();
    const UNREAD_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    const currentUserId = $user?.uid;
    
    // Only count messages from last 5 minutes that haven't been read
    // AND were not sent by the current user
    return $chat.messages.filter(msg => {
      const isRecent = (now - msg.timestamp) < UNREAD_THRESHOLD;
      const isUnread = msg.timestamp > $chat.lastReadTime;
      const isNotOwnMessage = msg.userId !== currentUserId; // Exclude own messages
      return isRecent && isUnread && isNotOwnMessage;
    }).length;
  }
);

// Track active subscriptions
let activeChatSubscription = null;

/**
 * Initialize the chat system for a specific world
 * @param {string} worldId World ID to connect to
 * @returns {Function} Cleanup function to unsubscribe
 */
export function initializeChat(worldId) {
  if (!browser || !worldId) return () => {};
  
  // Clean up any existing subscription
  if (activeChatSubscription) {
    activeChatSubscription();
    activeChatSubscription = null;
  }
  
  // Update loading state and track current world
  chatStore.update(state => ({
    ...state,
    loading: true,
    error: null,
    currentWorldId: worldId,
    messages: [] // Clear previous world's messages
  }));
  
  try {
    console.log(`Setting up chat subscription for world: ${worldId}`);
    
    // Reference to the world's chat messages, ordered by timestamp and limited to last messages
    // Note: Add ".indexOn": "timestamp" rule to Firebase database rules for this path
    const chatRef = query(
      ref(db, `worlds/${worldId}/chat`),
      orderByChild('timestamp'),
      limitToLast(MAX_MESSAGES)
    );
    
    // Subscribe to chat messages with additional logging
    activeChatSubscription = onValue(chatRef, (snapshot) => {
      const messages = [];
      
      if (snapshot.exists()) {
        // Process Firebase object format into array format with proper ID
        snapshot.forEach((childSnapshot) => {
          const messageData = childSnapshot.val();
          const messageId = childSnapshot.key; // This is the Firebase-generated unique ID
          
          // Ensure all required fields exist with defaults
          const message = {
            id: messageId, // Preserve the Firebase ID
            text: messageData.text || '',
            type: messageData.type || 'system',
            timestamp: messageData.timestamp || Date.now(),
            userName: messageData.userName || 'System',
            userId: messageData.userId || 'system',
            location: messageData.location || null
          };
          
          messages.push(message);
        });
        
        console.log(`Loaded ${messages.length} chat messages for world ${worldId}`);
        if (messages.length > 0) {
          console.log(`Sample message ID: ${messages[0].id}, type: ${messages[0].type}`);
        }
      } else {
        console.log(`No messages found for world ${worldId}`);
      }
      
      // Update the store with messages
      chatStore.update(state => ({
        ...state,
        messages,
        loading: false
      }));
    }, (error) => {
      console.error('Chat subscription error:', error);
      chatStore.update(state => ({
        ...state,
        loading: false,
        error: error.message
      }));
    });
    
    // Return cleanup function
    return () => {
      if (activeChatSubscription) {
        console.log(`Cleaning up chat subscription for world: ${worldId}`);
        activeChatSubscription();
        activeChatSubscription = null;
      }
    };
  } catch (error) {
    console.error('Chat initialization error:', error);
    chatStore.update(state => ({
      ...state,
      loading: false,
      error: error.message
    }));
    return () => {};
  }
}

/**
 * Send a chat message
 * @param {string} text Message text
 * @param {string} messageType Type of message (user, system, event)
 * @returns {Promise<boolean>} Success status
 */
export async function sendMessage(text, messageType = 'user') {
  if (!browser || !text || text.trim().length === 0) {
    return false;
  }
  
  try {
    const currentUser = get(user);
    const gameState = get(game);
    const currentWorld = gameState.worldKey;
    
    if (!currentUser || !currentWorld) {
      console.error('Cannot send message: user or world not available');
      return false;
    }
    
    const chatRef = ref(db, `worlds/${currentWorld}/chat`);
    
    // Use in-game display name first, then Firebase Auth display name, then 'Anonymous' as fallback
    const playerDisplayName = gameState.player?.displayName || currentUser.displayName || 'Anonymous';
    
    // Create message object (Firebase will generate the unique ID)
    const message = {
      text: text.trim(),
      type: messageType,
      timestamp: Date.now(),
      userId: currentUser.uid,
      userName: playerDisplayName,
      // Include location if available
      location: gameState.player?.lastLocation || null
    };
    
    // Push to Firebase - this will generate a unique ID automatically
    const newMessageRef = await push(chatRef, message);
    console.log(`Message sent with ID: ${newMessageRef.key}`);
    return true;
  } catch (error) {
    console.error('Error sending message:', error);
    return false;
  }
}

/**
 * Mark all messages as read
 */
export function markAllAsRead() {
  chatStore.update(state => ({
    ...state,
    unreadCount: 0,
    lastReadTime: Date.now()
  }));
}

/**
 * Increment the unread count
 */
export function incrementUnreadCount() {
  chatStore.update(state => ({
    ...state,
    unreadCount: state.unreadCount + 1
  }));
}

/**
 * Get the formatted time for a message
 * @param {number} timestamp Message timestamp
 * @returns {string} Formatted time
 */
export function getMessageTime(timestamp) {
  if (!timestamp) return '';
  
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
