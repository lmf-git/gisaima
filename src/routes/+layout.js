import { initAuthListener } from '$lib/stores/user';
import { browser } from '$app/environment';

// Only initialise auth listener in the browser.
export const load = () => {
    if (browser) {
        initAuthListener();
        
        // Initialize analytics
        // import('$lib/firebase/analytics')
        //     .then(module => module.initializeAnalytics())
        //     .catch(e => console.error('Analytics import failed:', e));
    }
    
    return {};
};
