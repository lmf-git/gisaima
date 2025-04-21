/**
 * Gathering function for Gisaima
 * Allows groups to gather resources from their surroundings
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDatabase } from 'firebase-admin/database';
import { logger } from "firebase-functions";

/**
 * Cloud function to start gathering items with a group
 * 
 * @param {Object} data Function payload
 * @param {string} data.groupId ID of the group to gather with
 * @param {number} data.tileX X coordinate of the tile to gather from
 * @param {number} data.tileY Y coordinate of the tile to gather from
 * @param {string} data.worldId ID of the world
 * @param {Object} context Auth context
 * @returns {Object} Result of the action
 */
export async function startGathering(data, context) {
  // Validate authentication
  if (!context.auth) {
    throw new Error('Unauthorized');
  }

  const userId = context.auth.uid;
  const { groupId, tileX, tileY, worldId } = data;

  // Validate required parameters
  if (!groupId || tileX === undefined || tileY === undefined || !worldId) {
    throw new Error('Missing required parameters');
  }

  const db = getDatabase();
  const chunkSize = 20;
  const chunkX = Math.floor(tileX / chunkSize);
  const chunkY = Math.floor(tileY / chunkSize);
  const chunkKey = `${chunkX},${chunkY}`;
  
  // Reference to the tile we're gathering from
  const tileRef = db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileX},${tileY}`);
  
  try {
    // Get the current state of the tile
    const tileSnapshot = await tileRef.once('value');
    const tileData = tileSnapshot.val() || {};

    // Check if there are any items to gather
    if (!tileData.items || tileData.items.length === 0) {
      throw new Error('No items to gather on this tile');
    }

    // Check if the group exists on this tile and is owned by the user
    if (!tileData.groups || !tileData.groups[groupId]) {
      throw new Error('Group not found on this tile');
    }

    const group = tileData.groups[groupId];
    
    if (group.owner !== userId) {
      throw new Error('You do not own this group');
    }

    if (group.status !== 'idle') {
      throw new Error('Group is not idle and cannot gather');
    }

    if (group.inBattle) {
      throw new Error('Group is in battle and cannot gather');
    }

    // Calculate next tick time for gathering completion
    const now = Date.now();
    const nextTickTime = getNextTickTime();

    // Update group status to gathering
    await db.ref(`worlds/${worldId}/chunks/${chunkKey}/${tileX},${tileY}/groups/${groupId}`).update({
      status: 'gathering',
      gatheringStarted: now,
      gatheringUntil: nextTickTime,
      itemsBeingGathered: [...tileData.items]
    });

    return {
      success: true,
      message: 'Gathering started',
      readyAt: nextTickTime
    };
  } catch (error) {
    console.error(`Error in gather function:`, error);
    throw new Error(error.message || 'Failed to start gathering');
  }
}

/**
 * Calculate the next tick time
 * @returns {number} Timestamp of the next tick
 */
function getNextTickTime() {
  const now = Date.now();
  const TICK_INTERVAL = 10 * 60 * 1000; // 10 minutes in milliseconds
  return now + (TICK_INTERVAL - (now % TICK_INTERVAL));
}