/**
 * Firebase Cloud Functions for Gisaima game - Main Entry Point
 */

// Import the Firebase Admin SDK
import { initializeApp } from 'firebase-admin/app';
import { getFunctions } from 'firebase-admin/functions';
import { getDatabase } from 'firebase-admin/database';
import { defineSecret } from 'firebase-functions/params';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

// Import custom functions
import { startStructureUpgrade, cancelStructureUpgrade } from './upgrade.mjs';
import { processUpgrades, upgradeTickProcessor } from './upgradeTick.mjs';

// Initialize Firebase Admin
initializeApp();

// Create and export a function to handle structure upgrades
export const requestStructureUpgrade = onCall({ timeoutSeconds: 60 }, async (request) => {
  try {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be logged in');
    }

    const playerId = request.auth.uid;
    
    // Add player ID to request data
    const data = {
      ...request.data,
      playerId
    };
    
    return await startStructureUpgrade(data);
    
  } catch (error) {
    console.error('Error in requestStructureUpgrade:', error);
    throw new HttpsError('internal', error.message);
  }
});

// Create and export a function to cancel structure upgrades
export const cancelUpgrade = onCall({ timeoutSeconds: 60 }, async (request) => {
  try {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be logged in');
    }

    const playerId = request.auth.uid;
    
    // Add player ID to request data
    const data = {
      ...request.data,
      playerId
    };
    
    return await cancelStructureUpgrade(data);
    
  } catch (error) {
    console.error('Error in cancelUpgrade:', error);
    throw new HttpsError('internal', error.message);
  }
});

// Create and export a scheduled function to process upgrades
export const processStructureUpgrades = onSchedule({
  schedule: 'every 1 minutes',
  timeoutSeconds: 120,
  memory: '256MiB'
}, async (event) => {
  try {
    return await upgradeTickProcessor();
  } catch (error) {
    console.error('Error in processStructureUpgrades:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Define an administrative endpoint to manually trigger upgrade processing
export const manualProcessUpgrades = onCall({ 
  timeoutSeconds: 120,
  memory: '256MiB',
  enforceAppCheck: false
}, async (request) => {
  try {
    // Only allow admin users
    if (!request.auth || !request.auth.token.admin) {
      throw new HttpsError('permission-denied', 'Only admins can trigger manual processing');
    }
    
    return await upgradeTickProcessor();
    
  } catch (error) {
    console.error('Error in manualProcessUpgrades:', error);
    throw new HttpsError('internal', error.message);
  }
});
