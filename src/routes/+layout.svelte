<script>
    import { page } from '$app/stores';
    import { user, signOut } from '$lib/stores/authStore';
    import { browser } from '$app/environment';
    
    // Import analytics only on client side
    if (browser) {
        import('$lib/firebase/analytics')
            .then(module => {
                // Either method will work
                // 1. Use the function
                module.initializeAnalytics();
                // 2. Or the analytics object is already initialized
                // The module itself handles initialization
            })
            .catch(e => console.error('Analytics import failed:', e));
    }
    
    // Check if current page is the map page
    $: isMapPage = $page.url.pathname === '/map';

    // Handle sign out
    const handleSignOut = async () => {
        await signOut();
    };
</script>

<div class="app">
    <header class={isMapPage ? 'absolute' : ''}>
        <nav>
            <a href="/">Home</a>
            <a href="/map">Map</a>
            
            <div class="auth-links">
                {#if $user}
                    <span>Hello, {$user.email}</span>
                    <button on:click={handleSignOut}>Sign Out</button>
                {:else}
                    <a href="/login">Login</a>
                    <a href="/signup">Sign Up</a>
                {/if}
            </div>
        </nav>
    </header>

    <slot />
</div>

<style>
    :global(*) {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }

    .app {
        display: flex;
        flex-direction: column;
        height: 100dvh;
        overflow: hidden;
    }

    header {
        height: 3em;
        display: flex;
        align-items: center;
        z-index: 100;
    }

    header.absolute {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
    }

    nav {
        display: flex;
        gap: 1rem;
        padding: 0 1em;
        width: 100%;
    }

    a {
        color: white;
        text-decoration: none;
    }

    a:hover {
        text-decoration: underline;
    }
    
    .auth-links {
        margin-left: auto;
        display: flex;
        gap: 1rem;
        align-items: center;
    }
    
    button {
        padding: 0.25rem 0.5rem;
        cursor: pointer;
        background-color: transparent;
        color: white;
        border: 1px solid white;
        border-radius: 4px;
    }
</style>
