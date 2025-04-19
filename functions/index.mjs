/**
 * Firebase Cloud Functions for Gisaima game - Main Entry Point
 */

import { initializeApp } from 'firebase-admin/app';

// Import all cloud functions from their specific files
import { processGameTicks } from './tick.mjs';
import { startMobilization } from './actions/mobilize.mjs';
import { demobiliseUnits } from './actions/demobilize.mjs';
import { attackGroups } from './actions/attackGroups.mjs';
import { joinBattle } from './actions/joinBattle.mjs';
import { startGathering } from './actions/gather.mjs';
import { moveGroup } from './actions/move.mjs';

// Initialize Firebase Admin SDK once at the entry point
initializeApp();

// Export all functions
export {
  processGameTicks,
  startMobilization,
  demobiliseUnits,
  attackGroups,
  joinBattle,
  startGathering,
  moveGroup
};
