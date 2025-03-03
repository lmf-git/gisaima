import { app } from './firebase';

// Export a dummy analytics object by default
export const analytics = {};

// Create a function to initialize analytics
export const initializeAnalytics = async () => {
  try {
    const { getAnalytics } = await import('firebase/analytics');
    const analyticsInstance = getAnalytics(app);
    
    // Copy properties to our exported object
    Object.assign(analytics, analyticsInstance);
    
    return analyticsInstance;
  } catch (error) {
    console.error("Analytics initialization failed:", error);
    return analytics;
  }
};

// Auto-initialize in browser environments
if (typeof window !== 'undefined') {
  initializeAnalytics().catch(error => {
    console.error("Auto-initialization of analytics failed:", error);
  });
}
