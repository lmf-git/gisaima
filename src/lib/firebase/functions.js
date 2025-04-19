import { getAuth } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { get } from 'svelte/store';
import { user } from '../stores/user';
// Import auth and functions from firebase.js and also the app
import { auth, functions, app } from './firebase';

/**
 * Calls a Firebase Cloud Function with proper authentication handling
 * @param {string} functionName - Name of the Firebase function to call
 * @param {object} data - Data to pass to the function
 * @returns {Promise} - Promise resolving to the function result
 */
export async function callFunction(functionName, data = {}) {
  try {
    // Use the auth instance from firebase.js
    if (!auth.currentUser) {
      const currentUser = get(user);
      console.warn('No user in auth object, checking store:', currentUser ? 'User in store' : 'No user in store');
      
      // If no user in store either, throw error
      if (!currentUser) {
        throw new Error('User not authenticated. Please sign in to continue.');
      }
      
      // Force token refresh to ensure we have a valid token
      try {
        // Force a fresh token
        await auth.currentUser.getIdToken(true);
        console.log('Refreshed authentication token');
      } catch (refreshError) {
        console.error('Failed to refresh authentication token:', refreshError);
        throw new Error('Authentication failed. Please try signing in again.');
      }
    }
    
    // Get user ID for logging
    const userId = auth.currentUser?.uid || 'unknown';
    const isAnonymous = auth.currentUser?.isAnonymous || false;
    
    console.log(`Calling function ${functionName} as user ${userId} (${isAnonymous ? 'anonymous' : 'registered'})`);
    
    // Use the imported functions instance from firebase.js
    const functionCall = httpsCallable(functions, functionName);
    
    // Call the function with data
    const result = await functionCall(data);
    return result.data;
  } catch (error) {
    console.error(`Error calling function ${functionName}:`, error);
    
    // Check for specific auth errors
    if (error.code?.includes('auth/') || 
        error.message?.includes('authentication') || 
        error.message?.includes('logged in') ||
        error.code === 'unauthenticated' || 
        error.code === 'permission-denied') {
      
      throw new Error(`Authentication error: ${error.message || 'Please try signing in again'}`);
    }
    
    throw error;
  }
}

/**
 * Gets Firebase functions instance
 * Returns the singleton instance from firebase.js
 */
export function getFirebaseFunctions() {
  // Return the imported functions instance
  return functions;
}
