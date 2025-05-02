import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { db } from '$lib/firebase';
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
  lastReadTime: Date.now(),
  subscriberCount: 0,
  readMessageIds: new Set()
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
    // AND are not in the readMessageIds Set
    return $chat.messages.filter(msg => {
      const isRecent = (now - msg.timestamp) < UNREAD_THRESHOLD;
      const isUnread = msg.timestamp > $chat.lastReadTime && !$chat.readMessageIds.has(msg.id);
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

  // Update subscriber count
  chatStore.update(state => ({
    ...state,
    subscriberCount: state.subscriberCount + 1
  }));
  
  // If there's already an active subscription for this world, just return a cleanup function
  if (activeChatSubscription && get(chatStore).currentWorldId === worldId) {
    console.log(`Chat subscription already active for world: ${worldId}, subscriber count: ${get(chatStore).subscriberCount}`);
    
    // Return a cleanup function that decreases the subscriber count
    return () => {
      chatStore.update(state => {
        const newCount = Math.max(0, state.subscriberCount - 1);
        console.log(`Removing chat subscriber, count now: ${newCount}`);
        
        // If no more subscribers, clean up the subscription
        if (newCount === 0 && activeChatSubscription) {
          console.log(`Last subscriber removed, cleaning up chat subscription`);
          activeChatSubscription();
          activeChatSubscription = null;
        }
        
        return {
          ...state,
          subscriberCount: newCount
        };
      });
    };
  }
  
  // Clean up any existing subscription if it's for a different world
  if (activeChatSubscription) {
    console.log(`Cleaning up existing chat subscription for different world`);
    activeChatSubscription();
    activeChatSubscription = null;
  }
  
  // Update loading state and track current world
  chatStore.update(state => ({
    ...state,
    loading: true,
    error: null,
    currentWorldId: worldId,
    messages: state.currentWorldId !== worldId ? [] : state.messages // Clear messages only if world changed
  }));
  
  try {
    console.log(`Setting up chat subscription for world: ${worldId}`);
    
    // Reference to the world's chat messages, ordered by timestamp and limited to last messages
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
    
    // Return cleanup function that decreases subscriber count
    return () => {
      chatStore.update(state => {
        const newCount = Math.max(0, state.subscriberCount - 1);
        console.log(`Removing chat subscriber, count now: ${newCount}`);
        
        // If no more subscribers, clean up the subscription
        if (newCount === 0 && activeChatSubscription) {
          console.log(`Last subscriber removed, cleaning up chat subscription`);
          activeChatSubscription();
          activeChatSubscription = null;
        }
        
        return {
          ...state,
          subscriberCount: newCount
        };
      });
    };
  } catch (error) {
    console.error('Chat initialization error:', error);
    chatStore.update(state => ({
      ...state,
      loading: false,
      error: error.message,
      subscriberCount: state.subscriberCount - 1 // Decrement since this subscriber failed
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
    
    // Create message object with server timestamp for consistent ordering
    const message = {
      text: text.trim(),
      type: messageType,
      timestamp: serverTimestamp(), // Use Firebase server timestamp for consistent ordering
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
  chatStore.update(state => {
    // Create a Set of all message IDs
    const allMessageIds = new Set(state.messages.map(msg => msg.id));
    
    return {
      ...state,
      unreadCount: 0,
      lastReadTime: Date.now(),
      readMessageIds: allMessageIds // Mark all messages as read
    };
  });
}

/**
 * Mark specific messages as read
 * @param {string[]} messageIds Array of message IDs to mark as read
 */
export function markMessagesAsRead(messageIds) {
  if (!messageIds || messageIds.length === 0) return;
  
  chatStore.update(state => {
    // Create a new Set with existing read messages plus the new ones
    const updatedReadIds = new Set(state.readMessageIds);
    messageIds.forEach(id => updatedReadIds.add(id));
    
    return {
      ...state,
      readMessageIds: updatedReadIds
    };
  });
}

/**
 * Get the formatted time for a message
 * @param {number} timestamp Message timestamp
 * @returns {string} Formatted time
 */
export function getMessageTime(timestamp) {
  if (!timestamp) return '';
  
  // Handle Firebase server timestamp objects (they come as objects before resolving)
  if (typeof timestamp === 'object' && timestamp !== null) {
    timestamp = Date.now(); // Just use current time if server timestamp hasn't resolved yet
  }
  
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
