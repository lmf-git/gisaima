/**
 * Shared utility functions for Gisaima tick events
 */

// Define CHUNK_SIZE constant for consistent usage across modules
export const CHUNK_SIZE = 20;

/**
 * Calculate chunk key from coordinates consistently
 * Used by multiple tick modules
 * 
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {string} Chunk key in format "chunkX,chunkY"
 */
export function getChunkKey(x, y) {
  // Simple integer division works for both positive and negative coordinates
  const chunkX = Math.floor(x / CHUNK_SIZE);
  const chunkY = Math.floor(y / CHUNK_SIZE);
  return `${chunkX},${chunkY}`;
}

/**
 * Get local coordinates within a chunk
 * 
 * @param {number} x - Global X coordinate
 * @param {number} y - Global Y coordinate
 * @returns {Object} Local coordinates {x, y}
 */
export function getLocalCoordinates(x, y) {
  // Use modulo arithmetic for both positive and negative coordinates
  // Add CHUNK_SIZE before modulo to handle negative coordinates correctly
  const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const localY = ((y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return { x: localX, y: localY };
}
