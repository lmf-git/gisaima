import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { auth } from '$lib/firebase/firebase';

export const user = writable(null);
export const loading = writable(true);

// Initialize auth state listener
export const initAuthListener = async () => {
  if (!browser) return loading.set(false);
  
  const { onAuthStateChanged } = await import('firebase/auth');
  onAuthStateChanged(auth, userData => {
    user.set(userData);
    loading.set(false);
  });
};

// Auth helper functions
export const signIn = async (email, password) => {
  if (!browser) return { success: false, error: 'Cannot sign in on server' }
  
  try {
    const { signInWithEmailAndPassword } = await import('firebase/auth')
    await signInWithEmailAndPassword(auth, email, password)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
};

export const signUp = async (email, password) => {
  if (!browser) return { success: false, error: 'Cannot sign up on server' }
  
  try {
    const { createUserWithEmailAndPassword } = await import('firebase/auth')
    await createUserWithEmailAndPassword(auth, email, password)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
};

export const signOut = async () => {
  if (!browser) return { success: false, error: 'Cannot sign out on server' }
  
  try {
    const { signOut: firebaseSignOut } = await import('firebase/auth')
    await firebaseSignOut(auth)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
};
