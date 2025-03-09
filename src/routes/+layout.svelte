<script>
    import { page } from '$app/stores';
    import { user, signOut } from '$lib/stores/authStore';
    import { browser } from '$app/environment';
    import Logo from '../components/Logo.svelte';
    
    // Check if current page is the map page
    $: isMapPage = $page.url.pathname === '/map';

    // Handle sign out
    const handleSignOut = async () => {
        await signOut();
    };
</script>

<div class="app">
    <header class={`appheader ${isMapPage ? 'absolute' : ''}`}>
        <nav class="navbar">
            <div class="navlinks">
                <a href="/" class="logolink">
                    <Logo extraClass="navlogo" />
                </a>
                <a href="/map" class="button navlink">Map</a>
                {#if !$user}
                    <a href="/login" class="button navlink">Login</a>
                    <a href="/signup" class="button navlink">Sign Up</a>
                {/if}
            </div>
            
            <div class="authlinks">
                {#if $user}
                    <span class="greeting">Hello, {$user.email}</span>
                    <button class="button" on:click={handleSignOut}>Sign Out</button>
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
    
    :global(:root) {
        /* Base colors from palette */
        --color-dark-navy: #15263C;
        --color-dark-red: #260602;
        --color-dark-blue: #0C0821;
        --color-bright-red: #C11316;
        --color-dark-teal: #16393F;
        --color-muted-teal: #6F9490;
        --color-muted-blue-gray: #456163;
        --color-dark-gray-blue: #38424E;
        --color-deep-blue: #1A2738;
        --color-dark-teal-blue: #122A38;
        --color-soft-green: #A7BC9D;
        --color-pale-green: #DAFBEA;
        --color-light-yellow: #F9F8E2;
        --color-cream-white: #FBFBD8;
        
        /* Semantic color assignments */
        --color-background: var(--color-dark-navy);
        --color-background-gradient-start: var(--color-dark-navy);
        --color-background-gradient-end: var(--color-dark-red);
        --color-text: var(--color-cream-white);
        --color-text-secondary: var(--color-soft-green);
        --color-heading: var(--color-light-yellow);
        --color-subheading: var(--color-muted-teal);
        
        --color-button: var(--color-dark-teal);
        --color-button-hover: var(--color-dark-gray-blue);
        --color-button-primary: var(--color-bright-red);
        --color-button-primary-hover: #9c1012;
        --color-button-secondary: var(--color-muted-blue-gray);
        --color-button-secondary-hover: #38504f;
        
        --color-card-bg: var(--color-dark-teal);
        --color-card-border: rgba(111, 148, 144, 0.3);
        --color-link: var(--color-soft-green);
        --color-link-hover: var(--color-pale-green);
        --color-shadow: rgba(0, 0, 0, 0.4);
    }
    
    :global(body) {
        background: var(--color-background);
        color: var(--color-text);
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }

    .app {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        background: linear-gradient(to bottom, 
                   var(--color-background-gradient-start), 
                   var(--color-background-gradient-end));
    }

    .appheader {
        display: flex;
        align-items: center;
        z-index: 100;
        padding: 2.2em 1.7em;
        box-sizing: border-box;
    }

    .appheader.absolute {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        justify-content: center;
    }

    .navbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .navlinks {
        display: flex;
        gap: 1em;
        align-items: center;
    }
    
    .authlinks {
        display: flex;
        gap: 1em;
        align-items: center;
    }
    
    :global(.button) {
        padding: 0.4em 1em;
        cursor: pointer;
        background-color: var(--color-button);
        color: var(--color-text);
        border: 0.0625em solid rgba(193, 19, 22, 0.3);
        border-radius: 0.25em;
        transition: all 0.2s ease;
        font-size: 1.1em;
        font-weight: 500;
        box-shadow: 0 0.0625em 0.1875em var(--color-shadow);
        text-decoration: none;
        display: inline-block;
    }
    
    :global(.button:hover) {
        background-color: var(--color-button-hover);
        transform: translateY(-0.125em);
        box-shadow: 0 0.1875em 0.3125em var(--color-shadow);
    }

    .navlink {
        border: none;
        font-size: 1.3em;
    }
    
    .greeting {
        color: var(--color-heading);
        margin-right: 0.5em;
    }

    /* Button variations - make global */
    :global(.button.primary) {
        background-color: var(--color-button-primary);
        border: none;
    }
    
    :global(.button.primary:hover) {
        background-color: var(--color-button-primary-hover);
    }
    
    :global(.button.secondary) {
        background-color: var(--color-button-secondary);
        color: var(--color-text);
        border: none;
    }
    
    :global(.button.secondary:hover) {
        background-color: var(--color-button-secondary-hover);
    }

    .logolink {
        background-color: transparent;
        padding: 0;
        box-shadow: none;
        height: 2.5em;
        display: flex;
        align-items: center;
        margin-right: 0.5em;
    }
    
    .logolink:hover {
        background-color: transparent;
        transform: none;
        box-shadow: none;
    }
    
    :global(.navlogo) {
        height: 4em;
    }
</style>
