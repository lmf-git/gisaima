import { initAuthListener } from '$lib/stores/authStore';
import { browser } from '$app/environment';

export const load = () => {
    // Only initialize auth listener in the browser
    if (browser) {
        initAuthListener();
        
        // Initialize analytics
        import('$lib/firebase/analytics')
            .then(module => {
                module.initializeAnalytics();
            })
            .catch(e => console.error('Analytics import failed:', e));
    }
    
    return {};
};
