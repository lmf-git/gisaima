import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { browser } from '$app/environment';

// Your Firebase configuration - use the same one for all services
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

// Initialize Firebase - make sure to export the app
export const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getDatabase(app);
export const firestore = getFirestore(app);
export const functions = getFunctions(app, 'us-central1'); // Explicitly set region
export const storage = getStorage(app);

// Force token refresh on page load to ensure we always have a fresh token
if (browser && auth.currentUser) {
  auth.currentUser.getIdToken(true).catch(err => {
    console.error("Error refreshing token on init:", err);
  });
}

// Setup auth state changed listener for token refresh
if (browser) {
  // Listen for auth state changes to ensure token refreshes
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // Get a fresh token when user logs in or token changes
      user.getIdToken(true).catch(err => {
        console.error("Error refreshing token on auth change:", err);
      });
    }
  });
}

// Connect to emulators in development if needed
// This code should already exist if you're using emulators
