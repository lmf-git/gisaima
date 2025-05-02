/**
 * Chat cleanup scheduled function for Gisaima
 * Handles cleaning up chat messages per world
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

// Maximum number of chat messages to keep per world
const MAX_CHAT_HISTORY = 500;

// Process chat cleanup for all worlds every 5 minutes
export const cleanup = onSchedule({
  schedule: "every 5 minutes",
  timeZone: "UTC",
  retryConfig: {
    maxRetryAttempts: 2,
    minBackoffSeconds: 60,
  },
}, async (event) => {
  console.log("Running chat cleanup...");
  const db = getDatabase();
  
  try {
    // Get all world IDs
    const worldsRef = db.ref('worlds');
    const worldsSnapshot = await worldsRef.once('value');
    const worlds = worldsSnapshot.val();
    
    if (!worlds) {
      console.log("No worlds found for chat cleanup");
      return null;
    }
    
    let totalMessagesRemoved = 0;
    
    // Process each world
    for (const worldId in worlds) {
      const messagesRemoved = await cleanupChatMessages(db, worldId);
      totalMessagesRemoved += messagesRemoved;
    }
    
    console.log(`Chat cleanup completed: ${totalMessagesRemoved} messages removed across all worlds`);
    return null;
  } catch (error) {
    console.error("Error during chat cleanup:", error);
    return null;
  }
});

/**
 * Process chat cleanup for a given world
 * 
 * @param {Object} db Database reference
 * @param {string} worldId The ID of the world to process
 * @returns {Promise<number>} Number of messages cleaned up
 */
async function cleanupChatMessages(db, worldId) {
  try {
    const chatRef = db.ref(`worlds/${worldId}/chat`);
    
    // Query all messages ordered by timestamp
    const snapshot = await chatRef.orderByChild('timestamp').once('value');
    
    if (!snapshot.exists()) {
      logger.debug(`No chat messages found for world ${worldId}`);
      return 0;
    }
    
    const messages = [];
    snapshot.forEach((childSnapshot) => {
      messages.push({
        id: childSnapshot.key,
        timestamp: childSnapshot.val().timestamp || 0
      });
    });
    
    // Sort messages by timestamp (oldest first)
    messages.sort((a, b) => a.timestamp - b.timestamp);
    
    // If we have more than the maximum allowed messages, remove the oldest ones
    const messagesToRemove = messages.length - MAX_CHAT_HISTORY;
    
    if (messagesToRemove <= 0) {
      logger.debug(`Chat cleanup for world ${worldId}: ${messages.length} messages (under limit)`);
      return 0;
    }
    
    logger.info(`Chat cleanup for world ${worldId}: removing ${messagesToRemove} oldest messages`);
    
    // Batch deletion for better performance
    const updates = {};
    for (let i = 0; i < messagesToRemove; i++) {
      updates[`worlds/${worldId}/chat/${messages[i].id}`] = null;
    }
    
    // Apply the batch update
    await db.ref().update(updates);
    
    return messagesToRemove;
  } catch (error) {
    logger.error(`Error cleaning up chat for world ${worldId}:`, error);
    return 0;
  }
}
