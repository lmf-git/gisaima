import { initAuthListener } from '$lib/stores/authStore';
import { browser } from '$app/environment';

export const load = () => {
    // Only initialize auth listener in the browser
    if (browser) {
        initAuthListener();
    }
    
    return {};
};
