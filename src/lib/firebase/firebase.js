import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import { browser } from '$app/environment';

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDzEj04-d7UJJTInOerz24uz1VNe74",
  authDomain: "gisaima.firebaseapp.com",
  databaseURL: "https://gisaima-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "gisaima",
  storageBucket: "gisaima.firebasestorage.app",
  messagingSenderId: "1068822985331",
  appId: "1:1068822985331:web:7b90bd253b6d8aaa554806",
  measurementId: "G-28GWSL466C"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getDatabase(app);
export const firestore = getFirestore(app);
export const functions = getFunctions(app, 'us-central1'); // Explicitly set region
export const storage = getStorage(app);

/**
 * Calls a Firebase Cloud Function with minimal wrapper
 * @param {string} functionName - Name of the Firebase function to call
 * @param {object} data - Data to pass to the function
 * @returns {Promise} - Promise resolving to the function result
 */
export async function callFunction(functionName, data = {}) {
  try {
    // Create callable with the functions instance from firebase.js
    const functionCall = httpsCallable(functions, functionName);
    
    // Let Firebase SDK handle authentication - it should work with anonymous users
    const result = await functionCall(data);
    return result.data;
  } catch (error) {

    console.error(`Error calling function ${functionName}:`, error);
    throw error;
  }
}
