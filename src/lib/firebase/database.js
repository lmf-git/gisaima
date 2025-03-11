import { ref, get } from "firebase/database";
import { getDatabase } from "firebase/database";
import { app } from "./firebase.js";

// Initialize database
const db = getDatabase(app);

/**
 * Get a single snapshot of data without subscribing
 * @param {string} path - The database path
 * @returns {Promise<Object>} The data at the path
 */
export async function getDataSnapshot(path) {
  try {
    const dataRef = ref(db, path);
    const snapshot = await get(dataRef);
    
    if (snapshot.exists()) {
      return snapshot.val();
    }
    
    return null;
  } catch (error) {
    console.error(`Error getting data at ${path}:`, error);
    throw error;
  }
}

/**
 * Get the Firebase database reference
 * @param {string} path - Optional path within the database
 * @returns {Object} Firebase database reference
 */
export function getDatabaseRef(path = null) {
  return path ? ref(db, path) : db;
}
