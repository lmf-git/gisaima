<script>
    import { page } from '$app/stores';
    import { user, signOut } from '$lib/stores/authStore';
    import { browser } from '$app/environment';
    
    // Import analytics only on client side
    if (browser) {
        import('$lib/firebase/analytics')
            .then(module => {
                module.initializeAnalytics();
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
            <div class="navlinks">
                <a href="/">Home</a>
                <a href="/map">Map</a>
                {#if !$user}
                    <a href="/login">Login</a>
                    <a href="/signup">Sign Up</a>
                {/if}
            </div>
            
            <div class="authlinks">
                {#if $user}
                    <span class="greeting">Hello, {$user.email}</span>
                    <button class="signout" on:click={handleSignOut}>Sign Out</button>
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
        min-height: 100vh; /* Allow content to expand naturally */
    }

    header {
        height: 3.5em;
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
        justify-content: space-between;
        padding: 0 1em;
        width: 100%;
        align-items: center;
    }

    .navlinks {
        display: flex;
        gap: 1em;
        align-items: center;
    }

    a {
        color: white;
        text-decoration: none;
        background-color: rgba(0, 0, 0, 0.4);
        padding: 0.4em 1em;
        border-radius: 4px;
        transition: all 0.2s ease;
        display: inline-block;
        font-size: 1.1em;
        font-weight: 500;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    a:hover {
        text-decoration: none;
        background-color: rgba(0, 0, 0, 0.6);
        transform: translateY(-2px);
        box-shadow: 0 3px 5px rgba(0, 0, 0, 0.3);
    }
    
    .authlinks {
        display: flex;
        gap: 1em;
        align-items: center;
    }
    
    button {
        padding: 0.4em 1em;
        cursor: pointer;
        background-color: rgba(0, 0, 0, 0.4);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        transition: all 0.2s ease;
        font-size: 1.1em;
        font-weight: 500;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }
    
    button:hover {
        background-color: rgba(0, 0, 0, 0.6);
        transform: translateY(-2px);
        box-shadow: 0 3px 5px rgba(0, 0, 0, 0.3);
    }
    
    .greeting {
        color: white;
        margin-right: 0.5em;
    }
</style>
