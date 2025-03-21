import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { auth } from '$lib/firebase/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  signInAnonymously as firebaseSignInAnonymously
} from 'firebase/auth';

export const user = writable(undefined);  // Start as undefined (not determined)
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

// Make sure the user store properly signals when auth state is determined
onAuthStateChanged(auth, (firebaseUser) => {
  if (firebaseUser) {
    // User is signed in
    user.set(firebaseUser);
  } else {
    // User is signed out
    user.set(null);  // Set to null (not undefined) to indicate "determined, but not logged in"
  }
});

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

export const signInAnonymously = async () => {
  if (!browser) return { success: false, error: 'Cannot sign in on server' };
  
  try {
    console.log('Attempting anonymous sign in');
    const userCredential = await firebaseSignInAnonymously(auth);
    console.log('Anonymous sign in successful:', userCredential.user.uid);
    return { success: true };
  } catch (error) {
    console.error('Anonymous sign in error:', error.code, error.message);
    return { 
      success: false, 
      error: error.message || 'Failed to sign in anonymously. Please try again.'
    };
  }
};
