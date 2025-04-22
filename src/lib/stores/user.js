import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { auth } from '$lib/firebase/firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  signInAnonymously as firebaseSignInAnonymously,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink as firebaseSignInWithEmailLink,
  linkWithCredential,
  EmailAuthProvider,
  updateProfile
} from 'firebase/auth';

// New constants for controlling debug output
const DEBUG_MODE = false; // Set to true to enable verbose logging
const debugLog = (...args) => DEBUG_MODE && console.log(...args);

// Create the user store
export const user = writable(null); // Initialize with null instead of undefined
export const loading = writable(true);
export const isAuthReady = writable(false); // Add explicit isAuthReady store

// Track initialization to prevent duplicate listeners
let authUnsubscribe = null;

// Initialize auth state listener with better state tracking
export const setup = () => {
  if (!browser) {
    loading.set(false);
    isAuthReady.set(true); // Mark as ready even in SSR
    return null;
  }
  
  onAuthStateChanged(auth, firebaseUser => {
    user.set(firebaseUser);
    loading.set(false);
    isAuthReady.set(true);
  });
};

// Auth helper functions
export const signIn = async (email, password) => {
  if (!browser) return { success: false, error: 'Cannot sign in on server' };
  
  try {
    debugLog('Attempting sign in for:', email);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    debugLog('Sign in successful:', userCredential.user.uid);
    return { success: true };
  } catch (error) {
    console.error('Sign in error:', error.code, error.message);
    return { 
      success: false, 
      error: error.message || 'Failed to sign in. Please check your credentials.'
    };
  }
};

// Enhanced signUp function to handle email-only registration and guest upgrades
export const signUp = async (email, password, isGuestUpgrade = false) => {
  if (!browser) return { success: false, error: 'Cannot sign up on server' };
  
  try {
    console.log(`Attempting ${isGuestUpgrade ? 'guest upgrade' : 'sign up'} for:`, email);
    
    // Handle anonymous account upgrade if user is already logged in anonymously
    if (isGuestUpgrade && auth.currentUser?.isAnonymous) {
      if (password) {
        // Link anonymous account with email and password
        const credential = EmailAuthProvider.credential(email, password);
        await linkWithCredential(auth.currentUser, credential);
        
        // Update profile
        await updateProfile(auth.currentUser, {
          displayName: email.split('@')[0]
        });
        
        console.log('Anonymous account upgraded with email/password');
      } else {
        // Email-only login - send sign-in link
        const actionCodeSettings = {
          url: window.location.origin + '/email-action',  // Dedicated page for handling email actions
          handleCodeInApp: true
        };
        
        await sendSignInLinkToEmail(auth, email, actionCodeSettings);
        
        // Save email to localStorage for later use
        localStorage.setItem('emailForSignIn', email);
        
        console.log('Sign-in link sent for anonymous account upgrade');
      }
      
      return { success: true, emailLink: !password };
    }
    
    // Regular sign-up with email and password
    if (password) {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log('Sign up successful:', userCredential.user.uid);
      return { success: true };
    } 
    // Passwordless email sign-up
    else {
      const actionCodeSettings = {
        url: window.location.origin + '/email-action',  // Dedicated page for handling email actions
        handleCodeInApp: true
      };
      
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      
      // Save email to localStorage for later use
      localStorage.setItem('emailForSignIn', email);
      
      console.log('Sign-in link sent');
      return { success: true, emailLink: true };
    }
  } catch (error) {
    console.error('Sign up error:', error.code, error.message);
    return { 
      success: false, 
      error: error.message || 'Failed to create account. Please try again.'
    };
  }
};

// Add function to handle email sign-in links
export const handleEmailLink = async () => {
  if (!browser) return { success: false, error: 'Cannot handle email links on server' };
  
  try {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = localStorage.getItem('emailForSignIn');
      
      if (!email) {
        // If email is not found in storage, prompt user
        email = window.prompt('Please provide your email for confirmation');
      }
      
      if (!email) {
        return { success: false, error: 'Email confirmation required' };
      }
      
      // If user is already signed in anonymously, link accounts
      if (auth.currentUser?.isAnonymous) {
        // Handle linking process (implementation depends on Firebase version)
        // This might require custom handling based on your Firebase setup
        console.log('Attempting to link anonymous account with email');
      } else {
        // Otherwise sign in normally with email link
        await firebaseSignInWithEmailLink(auth, email, window.location.href);
        localStorage.removeItem('emailForSignIn');
      }
      
      return { success: true };
    }
    
    return { success: false, notEmailLink: true };
  } catch (error) {
    console.error('Email link error:', error.code, error.message);
    return {
      success: false,
      error: error.message || 'Failed to sign in with email link. Please try again.'
    };
  }
};

// Function for passwordless sign in (email link)
export const signInWithEmailLink = async (email = null) => {
  if (!browser) return { success: false, error: 'Cannot handle email links on server' };
  
  try {
    // Check if current URL is a sign-in link
    if (isSignInWithEmailLink(auth, window.location.href)) {
      // Get email from storage or parameter
      let emailForSignIn = email || localStorage.getItem('emailForSignIn');
      
      if (!emailForSignIn) {
        // If email is not found in storage, return error (will be handled by UI)
        return { 
          success: false, 
          error: 'Email not found. Please enter the email you used for sign-in.', 
          needsEmail: true 
        };
      }
      
      // If user is already signed in anonymously, link accounts
      if (auth.currentUser?.isAnonymous) {
        // We need to implement special case for linking anonymous account
        console.log('Attempting to link anonymous account with email link');
        
        // Advanced linking implementation would go here
        // For now, we'll just sign in with the email link
        await firebaseSignInWithEmailLink(auth, emailForSignIn, window.location.href);
        
        // Remove email from storage
        localStorage.removeItem('emailForSignIn');
        
        return { success: true };
      }
      
      // Otherwise sign in normally with email link
      await firebaseSignInWithEmailLink(auth, emailForSignIn, window.location.href);
      localStorage.removeItem('emailForSignIn');
      
      return { success: true };
    }
    
    return { success: false, notEmailLink: true };
  } catch (error) {
    console.error('Email link error:', error.code, error.message);
    return {
      success: false,
      error: error.message || 'Failed to sign in with email link. Please try again.'
    };
  }
};

// Start passwordless sign-in flow (send email)
export const sendSignInLink = async (email) => {
  if (!browser) return { success: false, error: 'Cannot send email from server' };
  
  try {
    const actionCodeSettings = {
      url: window.location.origin + '/email-action',
      handleCodeInApp: true
    };
    
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    localStorage.setItem('emailForSignIn', email);
    
    return { success: true };
  } catch (error) {
    console.error('Send sign-in link error:', error.code, error.message);
    return {
      success: false,
      error: error.message || 'Failed to send sign-in link. Please try again.'
    };
  }
};

export const signOut = async () => {
  if (!browser) return { success: false, error: 'Cannot sign out on server' };
  
  try {
    // Clear current world directly instead of importing game.js
    if (browser) {
      localStorage.removeItem('gisaima-current-world');
    }
    
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
    
    // Return success but let the auth state listener update the store naturally
    // This prevents potential race conditions with duplicate store updates
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
