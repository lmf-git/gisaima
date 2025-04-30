import { getDatabase } from 'firebase-admin/database';
import { logger } from 'firebase-functions';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

export const spawnPlayer = onCall({
  region: 'us-central1',
  minInstances: 0
}, async (request) => {
  // Get authenticated user
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to spawn');
  }
  
  // Get data from request
  const { worldId, spawnId, spawnX, spawnY } = request.data;
  
  // Validate required parameters
  if (!worldId) {
    throw new HttpsError('invalid-argument', 'worldId is required');
  }
  
  if (typeof spawnX !== 'number' || typeof spawnY !== 'number') {
    throw new HttpsError('invalid-argument', 'Valid spawn coordinates (spawnX, spawnY) are required');
  }
  
  try {
    logger.info(`User ${uid} spawning in world ${worldId} at coordinates ${spawnX},${spawnY}`);
    
    // Get database reference
    const db = getDatabase();
    
    // Get player data to ensure we have race and displayName
    const playerRef = db.ref(`players/${uid}/worlds/${worldId}`);
    const playerSnapshot = await playerRef.once('value');
    
    if (!playerSnapshot.exists()) {
      throw new HttpsError('not-found', `Player is not a member of world ${worldId}`);
    }
    
    const playerData = playerSnapshot.val();
    const displayName = playerData.displayName || uid.substring(0, 8);
    const race = playerData.race || 'human';
    
    // 1. Update the player data to set them as alive at the spawn location
    await playerRef.update({
      alive: true,
      lastLocation: {
        x: spawnX,
        y: spawnY,
        timestamp: Date.now()
      }
    });
    
    // 2. Calculate chunk coordinates for the player entity
    const CHUNK_SIZE = 20;
    const chunkX = Math.floor(spawnX / CHUNK_SIZE);
    const chunkY = Math.floor(spawnY / CHUNK_SIZE);
    const chunkKey = `${chunkX},${chunkY}`;
    const tileKey = `${spawnX},${spawnY}`;
    
    // 3. Create a player entity in the world at the spawn location
    const playerEntityRef = db.ref(
      `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/players/${uid}`
    );
    
    await playerEntityRef.set({
      displayName,
      lastActive: Date.now(),
      id: uid,
      race
    });
    
    logger.info(`Player spawned successfully at ${tileKey} in chunk ${chunkKey} with race ${race}`);
    
    return {
      success: true,
      location: { x: spawnX, y: spawnY },
      timestamp: Date.now()
    };
  } catch (error) {
    logger.error('Error spawning player:', error);
    throw new HttpsError('internal', 'Failed to spawn player: ' + (error.message || 'Unknown error'));
  }
});
