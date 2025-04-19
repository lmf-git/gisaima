/**
 * Firebase Cloud Functions for Gisaima game - Main Entry Point
 */

import { initializeApp } from 'firebase-admin/app';

// Import all cloud functions from their specific files
import { processGameTicks } from './tick.mjs';
import { mobilizeUnits } from './actions/mobilize.mjs'; // Fix: import the correct function name
import { demobiliseUnits } from './actions/demobilize.mjs';
import { attackGroups } from './actions/attackGroups.mjs';
import { joinBattle } from './actions/joinBattle.mjs';
import { startGathering } from './actions/gather.mjs';
import { moveGroup } from './actions/move.mjs';

// Initialize Firebase Admin SDK once at the entry point
initializeApp();

// Export all functions

// Action functions
export { mobilizeUnits } from './actions/mobilize.mjs';
export { demobiliseUnits } from './actions/demobilize.mjs';
export { moveGroup } from './actions/move.mjs';
export { attackGroups } from './actions/attackGroups.mjs';
export { startGathering } from './actions/gather.mjs';  // Add this export

// Scheduled tasks
export { processGameTicks } from './tick.mjs';
