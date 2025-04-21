/**
 * Firebase Cloud Functions for Gisaima game - Main Entry Point
 */

import { initializeApp } from 'firebase-admin/app';

// Initialize Firebase Admin SDK once at the entry point
initializeApp();

// Export all functions

// Action functions
export { mobilizeUnits } from './actions/mobilise.mjs';
export { demobiliseUnits } from './actions/demobilise.mjs';
export { moveGroup } from './actions/move.mjs';
export { attackGroups } from './actions/attackGroups.mjs';
export { startGathering } from './actions/gather.mjs';  // Add this export
export { joinBattle } from './actions/joinBattle.mjs';  // Add missing export for joinBattle

// Scheduled tasks
export { processGameTicks } from './tick.mjs';
