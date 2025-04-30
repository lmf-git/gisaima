import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

export const joinWorld = onCall({
  region: 'us-central1',
  minInstances: 0
}, async (request) => {
  // Get authenticated user
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to join a world');
  }
  
  // Get data from request
  const { worldId, race, displayName, spawnPosition } = request.data;
  
  // Validate required parameters
  if (!worldId) {
    throw new HttpsError('invalid-argument', 'worldId is required');
  }
  
  if (!race) {
    throw new HttpsError('invalid-argument', 'race is required');
  }
  
  // Optional displayName, but if provided, validate length
  if (displayName && (displayName.length < 2 || displayName.length > 20)) {
    throw new HttpsError('invalid-argument', 'displayName must be between 2 and 20 characters');
  }
  
  // Determine coordinates - either use provided spawn position or default to 0,0
  const coordinates = spawnPosition && typeof spawnPosition.x === 'number' && typeof spawnPosition.y === 'number'
    ? { x: spawnPosition.x, y: spawnPosition.y }
    : { x: 0, y: 0 };
  
  try {
    logger.info(`User ${uid} joining world ${worldId} as ${race} at coordinates ${coordinates.x},${coordinates.y}`);
    
    // Get database reference
    const db = getDatabase();
    
    // Create player entry in world
    const playerData = {
      joined: Date.now(),
      race: race,
      alive: false,
      displayName: displayName || '',
      id: uid,
      lastLocation: {
        x: coordinates.x,
        y: coordinates.y,
        timestamp: Date.now()
      }
    };
    
    // Check if the player already joined this world to avoid duplicate increments
    const playerWorldRef = db.ref(`players/${uid}/worlds/${worldId}`);
    const playerSnapshot = await playerWorldRef.once('value');
    const isNewPlayer = !playerSnapshot.exists();
    
    // Write player data to database
    await playerWorldRef.set(playerData);
    
    // Only increment playerCount if this is a new player joining
    if (isNewPlayer) {
      // Increment playerCount in world info using a transaction for atomicity
      const worldInfoRef = db.ref(`worlds/${worldId}/info`);
      await worldInfoRef.transaction(currentData => {
        if (currentData === null) {
          return { playerCount: 1 };
        }
        
        return {
          ...currentData,
          playerCount: (currentData.playerCount || 0) + 1
        };
      });
      
      logger.info(`Incremented player count for world ${worldId}`);
    }
    
    return {
      success: true,
      worldId,
      coordinates,
      isNewPlayer
    };
  } catch (error) {
    logger.error('Error joining world:', error);
    throw new HttpsError('internal', 'Failed to join world: ' + (error.message || 'Unknown error'));
  }
});
