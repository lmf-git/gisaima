import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { auth } from '$lib/firebase/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut
} from 'firebase/auth';

export const user = writable(null);
export const loading = writable(true);

// Initialize auth state listener
export const initAuthListener = () => {
  if (!browser) return loading.set(false);
  
  try {
    onAuthStateChanged(auth, userData => {
      console.log('Auth state changed:', userData ? 'User logged in' : 'No user');
      user.set(userData);
      loading.set(false);
    });
  } catch (error) {
    console.error('Error initializing auth listener:', error);
    loading.set(false);
  }
};

// Auth helper functions
export const signIn = async (email, password) => {
  if (!browser) return { success: false, error: 'Cannot sign in on server' };
  
  try {
    console.log('Attempting sign in for:', email);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log('Sign in successful:', userCredential.user.uid);
    return { success: true };
  } catch (error) {
    console.error('Sign in error:', error.code, error.message);
    return { 
      success: false, 
      error: error.message || 'Failed to sign in. Please check your credentials.'
    };
  }
};

export const signUp = async (email, password) => {
  if (!browser) return { success: false, error: 'Cannot sign up on server' };
  
  try {
    console.log('Attempting sign up for:', email);
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    console.log('Sign up successful:', userCredential.user.uid);
    return { success: true };
  } catch (error) {
    console.error('Sign up error:', error.code, error.message);
    return { 
      success: false, 
      error: error.message || 'Failed to create account. Please try again.'
    };
  }
};

export const signOut = async () => {
  if (!browser) return { success: false, error: 'Cannot sign out on server' };
  
  try {
    await firebaseSignOut(auth);
    console.log('Sign out successful');
    return { success: true };
  } catch (error) {
    console.error('Sign out error:', error);
    return { success: false, error: error.message };
  }
};
