import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, onIdTokenChanged } from 'firebase/auth';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getDatabase } from 'firebase/database';
import { browser } from '$app/environment';

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDzEj04-d7UJJTInOerz24uz1d_q1VNe74",
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

// Initialize services with improved auth configuration
export const auth = getAuth(app);

// Set persistence to LOCAL for better token handling (client-side only)
if (browser) {
  setPersistence(auth, browserLocalPersistence)
    .catch(error => {
      console.error("Auth persistence error:", error);
    });
  
  // Set up token refresh listener
  onIdTokenChanged(auth, async (user) => {
    if (user) {
      // Force token refresh when needed
      const currentToken = await user.getIdToken(true);
      console.log("Auth token refreshed");
    }
  });
}

export const db = getDatabase(app);
export const functions = getFunctions(app, 'us-central1'); 

// Create callable function wrapper with error handling
export const createCallable = (functionName) => {
  const callable = httpsCallable(functions, functionName);
  
  return async (data) => {
    try {
      // Ensure user is logged in before making call
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('No authenticated user found when calling function');
      }
      
      // Force refresh token before important function calls
      await currentUser.getIdToken(true);
      
      // Make the function call with refreshed token
      const result = await callable(data);
      return result.data;
    } catch (error) {
      console.error(`Error calling function ${functionName}:`, error);
      
      // Provide better error diagnostics
      if (error.code === 'functions/unauthenticated') {
        console.error('Authentication error details:', {
          userNull: auth.currentUser === null,
          userAnonymous: auth.currentUser?.isAnonymous,
          uid: auth.currentUser?.uid
        });
      }
      
      throw error;
    }
  };
};

// For development use - connect to functions emulator if needed
// Uncomment if you're using the Firebase emulator
// if (browser && window.location.hostname === "localhost") {
//   connectFunctionsEmulator(functions, "localhost", 5001);
// }

