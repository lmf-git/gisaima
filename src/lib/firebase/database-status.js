import { db } from './database.js';
import { ref, onValue, serverTimestamp, set } from 'firebase/database';
import { writable } from 'svelte/store';

// Store to track database connection state
export const dbConnectionStatus = writable({
  connected: false,
  lastChecked: null,
  error: null
});

// Initialize a connection status listener
export function initDatabaseConnectionCheck() {
  try {
    // Use Firebase's built-in .info/connected path to check connection status
    const connectedRef = ref(db, '.info/connected');
    
    return onValue(connectedRef, (snap) => {
      const connected = !!snap.val();
      console.log(`Database connection status: ${connected ? 'Connected' : 'Disconnected'}`);
      
      dbConnectionStatus.set({
        connected,
        lastChecked: new Date(),
        error: null
      });
    });
  } catch (error) {
    console.error('Failed to initialize database connection check:', error);
    dbConnectionStatus.set({
      connected: false,
      lastChecked: new Date(),
      error: error.message
    });
    
    return () => {}; // Return empty cleanup function
  }
}

// Test function to write a small piece of data to verify permissions
export async function testDatabaseWrite() {
  try {
    const testRef = ref(db, `__connection_test/${Date.now()}`);
    await set(testRef, {
      timestamp: serverTimestamp(),
      test: true
    });
    console.log('Database write test successful');
    return true;
  } catch (error) {
    console.error('Database write test failed:', error);
    return false;
  }
}

// Function to check if Firebase database is properly initialized
export function isDatabaseInitialized() {
  return !!db;
}
