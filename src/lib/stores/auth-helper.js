/**
 * Auth helper functions to ensure proper token refresh
 */
import { auth } from '../firebase/firebase';
import { onIdTokenChanged } from 'firebase/auth';
import { browser } from '$app/environment';

// Keep track of token refresh state
let refreshPromise = null;

/**
 * Gets a fresh ID token, refreshing if necessary
 */
export async function getIdToken(forceRefresh = false) {
  if (!browser || !auth.currentUser) {
    return null;
  }
  
  try {
    if (refreshPromise) {
      // If a refresh is already in progress, wait for it
      return await refreshPromise;
    }
    
    refreshPromise = auth.currentUser.getIdToken(forceRefresh);
    const token = await refreshPromise;
    refreshPromise = null;
    return token;
  } catch (error) {
    console.error("Error getting auth token:", error);
    refreshPromise = null;
    return null;
  }
}

/**
 * Sets up a token refresh listener
 */
export function setupTokenRefresh(callback) {
  if (!browser) return () => {};
  
  return onIdTokenChanged(auth, async (user) => {
    if (user) {
      try {
        // Get fresh token
        await getIdToken(true);
        if (callback) callback(user);
      } catch (error) {
        console.error("Token refresh error:", error);
      }
    }
  });
}

/**
 * Forces a token refresh - useful before important operations
 */
export async function forceTokenRefresh() {
  return getIdToken(true);
}

/**
 * Gets the current auth state with fresh token
 */
export async function getCurrentAuthState() {
  if (!browser || !auth.currentUser) {
    return null;
  }
  
  try {
    const token = await getIdToken(true);
    return {
      user: auth.currentUser,
      token,
      isAnonymous: auth.currentUser.isAnonymous,
    };
  } catch (error) {
    console.error("Error getting auth state:", error);
    return null;
  }
}
