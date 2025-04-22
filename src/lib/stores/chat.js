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
  currentWorldId: null
});

// Derived store to get messages sorted by timestamp
export const messages = derived(
  chatStore,
  $chat => $chat.messages.slice().sort((a, b) => a.timestamp - b.timestamp)
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
    // Reference to the world's chat messages, ordered by timestamp and limited to last 100
    const chatRef = query(
      ref(db, `worlds/${worldId}/chat`),
      orderByChild('timestamp'),
      limitToLast(MAX_MESSAGES)
    );
    
    // Subscribe to chat messages
    activeChatSubscription = onValue(chatRef, (snapshot) => {
      const messages = [];
      
      if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
          const message = {
            id: childSnapshot.key,
            ...childSnapshot.val()
          };
          messages.push(message);
        });
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
    const currentWorld = get(game).worldKey;
    
    if (!currentUser || !currentWorld) {
      console.error('Cannot send message: user or world not available');
      return false;
    }
    
    const chatRef = ref(db, `worlds/${currentWorld}/chat`);
    
    // Create message object
    const message = {
      text: text.trim(),
      type: messageType,
      timestamp: Date.now(),
      userId: currentUser.uid,
      userName: currentUser.displayName || 'Anonymous',
      // Include location if available
      location: get(game).player?.lastLocation || null
    };
    
    // Push to Firebase
    await push(chatRef, message);
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
    unreadCount: 0
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
