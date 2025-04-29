/**
 * Firebase Cloud Functions for Gisaima game - Main Entry Point
 */

import { initializeApp } from 'firebase-admin/app';

// Initialize Firebase Admin SDK once at the entry point
initializeApp();

// Export all functions

// Action functions
export { mobiliseUnits } from './actions/mobilise.mjs';
export { demobiliseUnits } from './actions/demobilise.mjs';
export { moveGroup } from './actions/move.mjs';
export { cancelMove } from './actions/cancelMove.mjs'; // Add the new cancelMove function
export { attack } from './actions/attack.mjs';
export { startGathering } from './actions/gather.mjs';
export { joinBattle } from './actions/joinBattle.mjs';
export { buildStructure } from './actions/build.mjs';

// Scheduled tasks
export { processGameTicks } from './tick.mjs';
export { cleanup } from './cleanup.mjs';
