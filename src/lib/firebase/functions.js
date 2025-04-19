import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';

/**
 * Calls a Firebase Cloud Function with minimal wrapper
 * @param {string} functionName - Name of the Firebase function to call
 * @param {object} data - Data to pass to the function
 * @returns {Promise} - Promise resolving to the function result
 */
export async function callFunction(functionName, data = {}) {
  try {
    // Simple logging to help with debugging
    console.log(`Calling function ${functionName}`);
    
    // Create callable and execute function
    const functionCall = httpsCallable(functions, functionName);
    const result = await functionCall(data);
    return result.data;
  } catch (error) {
    console.error(`Error calling function ${functionName}:`, error);
    
    // Simple categorization of errors for UI feedback
    if (error.code?.includes('auth/') || 
        error.message?.includes('auth') || 
        error.message?.includes('login') ||
        error.message?.includes('logged in') ||
        error.code === 'unauthenticated' || 
        error.code === 'permission-denied') {
      throw new Error(`Authentication error: ${error.message}`);
    }
    
    throw error;
  }
}

/**
 * Gets Firebase functions instance
 * Simple pass-through to the singleton in firebase.js
 */
export function getFirebaseFunctions() {
  return functions;
}
