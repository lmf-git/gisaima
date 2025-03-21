<script>
    import { page } from '$app/stores';
    import { user, signOut, loading as userLoading } from '$lib/stores/user';
    import Logo from '../components/Logo.svelte';
    import SignOut from '../components/icons/SignOut.svelte';
    import XIcon from '../components/icons/XIcon.svelte';
    import DiscordIcon from '../components/icons/DiscordIcon.svelte';
    import MobileMenu from '../components/MobileMenu.svelte';
    import { onMount, onDestroy } from 'svelte';
    import { initGameStore, game, isAuthReady } from '../lib/stores/game.js';
    import { ref, onValue } from "firebase/database";
    import { db } from '../lib/firebase/database.js';
    import HamburgerIcon from '../components/icons/HamburgerIcon.svelte';

    const { children } = $props();

    // State
    let mobileMenuOpen = $state(false);
    let menuAnimatingOut = $state(false);
    let logoAnimatingOut = $state(false);
    let playerData = $state(null);
    let playerLoading = $state(false);
    let playerUnsubscribe = null;
    
    // Computed values for conditional rendering
    const isHomePage = $derived($page.url.pathname === '/');
    const isMapPage = $derived($page.url.pathname === '/map');
    const isLoginPage = $derived($page.url.pathname === '/login');
    const isSignupPage = $derived($page.url.pathname === '/signup');
    const isGuidePage = $derived($page.url.pathname === '/guide');
    
    function toggleMobileMenu() {
        if (mobileMenuOpen) {
            // Start close animation
            menuAnimatingOut = true;
            logoAnimatingOut = true;
            
            // Hide logo more quickly (after 150ms)
            setTimeout(() => {
                logoAnimatingOut = false;
            }, 150);
            
            // Remove menu after animation completes with additional time for staggered items
            setTimeout(() => {
                mobileMenuOpen = false;
                menuAnimatingOut = false;
            }, 500); // Extended to account for staggered animations
        } else {
            mobileMenuOpen = true;
        }
    }
    
    function closeMobileMenu() {
        if (mobileMenuOpen) {
            menuAnimatingOut = true;
            logoAnimatingOut = true;
            
            // Hide logo more quickly
            setTimeout(() => {
                logoAnimatingOut = false;
            }, 150);
            
            setTimeout(() => {
                mobileMenuOpen = false;
                menuAnimatingOut = false;
            }, 500); // Match the delay in toggleMobileMenu
        }
    }

    let gameUnsubscribe;
    
    // Subscribe to player data when auth changes
    $effect(() => {
        if ($user?.uid) {
            playerLoading = true;
            
            if (playerUnsubscribe) {
                playerUnsubscribe();
                playerUnsubscribe = null;
            }
            
            const playerRef = ref(db, `players/${$user.uid}/profile`);
            playerUnsubscribe = onValue(playerRef, (snapshot) => {
                playerData = snapshot.exists() ? snapshot.val() : null;
                playerLoading = false;
            }, (error) => {
                console.error("Error fetching player data:", error);
                playerLoading = false;
            });
        } else {
            playerData = null;
            if (playerUnsubscribe) {
                playerUnsubscribe();
                playerUnsubscribe = null;
            }
        }
    });
    
    onMount(() => {
        try {
            gameUnsubscribe = initGameStore();
        } catch (e) {
            console.error('Error initializing game store:', e);
        }
    });
    
    onDestroy(() => {
        if (typeof gameUnsubscribe === 'function') {
            gameUnsubscribe();
        }
        if (playerUnsubscribe) {
            playerUnsubscribe();
        }
    });

    // Derived state for UI loading conditions
    const headerLoading = $derived($userLoading || !$isAuthReady);
</script>

<div class={`app ${isMapPage ? 'map' : ''}`}>
    <header class="header">
        <!-- Simplified logo visibility - never show on home page -->
        {#if !isHomePage}
            <div class="logo">
                <a href="/" aria-label="Gisaima Home">
                    <Logo extraClass="nav-logo" />
                </a>
            </div>
        {/if}
        
        <!-- Modified condition: Show hamburger menu on all pages except map page -->
        {#if !isMapPage}
            <button class="mobile-menu-toggle" aria-label="Toggle Menu" onclick={toggleMobileMenu}>
                <HamburgerIcon 
                    size="2em"
                    extraClass="hamburger-icon" 
                    active={mobileMenuOpen} 
                />
            </button>
        {/if}
        
        <!-- Show nav and auth everywhere except map page -->
        {#if !isMapPage}
            <nav class="nav">
                <div class="links">
                    {#if !isGuidePage}
                        <a href="/guide" class:active={$page.url.pathname === '/guide'}>Guide</a>
                    {/if}
                    {#if $user && $page.url.pathname !== '/worlds' && !headerLoading}
                        <a href="/worlds" class:active={$page.url.pathname === '/worlds'}>Worlds</a>
                    {/if}
                </div>
            </nav>
            
            <div class="auth" class:loading={headerLoading}>
                {#if !headerLoading}
                    {#if $user}
                        <div class="greeting">Hello, {$user.displayName || $user.email.split('@')[0]}</div>
                        <button class="signout" onclick={signOut} aria-label="Sign Out">
                            <SignOut size="1.2em" extraClass="icon-pale-green" />
                        </button>
                    {:else}
                        <!-- Only show login link if not on login page and not on home page -->
                        {#if !isLoginPage && !isHomePage}
                            <a href="/login" class="login">Log In</a>
                        {/if}
                        
                        <!-- Only show signup link if not on signup page and not on home page -->
                        {#if !isSignupPage && !isHomePage}
                            <a href="/signup" class="signup">Sign Up</a>
                        {/if}
                    {/if}
                {/if}
            </div>
        {/if}

        {#if (mobileMenuOpen || menuAnimatingOut) && !isMapPage}
            <MobileMenu 
                onClose={closeMobileMenu} 
                currentPath={$page.url.pathname} 
                user={$user}
                signOut={signOut}
                animatingOut={menuAnimatingOut}
                class={menuAnimatingOut ? 'animate-out' : 'animate-in'}
            />
        {/if}
    </header>

    <main class="main-content">
        {@render children?.()}
    </main>
    
    <!-- Add footer if not on map page -->
    {#if !isMapPage}
        <footer class="footer">
            <div class="footer-content">
                <div class="footer-section branding">
                    <div class="brand">
                        <a href="/" class="footer-logo">
                            <Logo extraClass="footer-logo-icon" />
                        </a>
                        <h2 class="footer-title">isaima Realm</h2>
                    </div>
                    <p class="footer-tagline">Explore and create worlds together</p>
                </div>
                
                <div class="footer-nav">
                    <div class="footer-section">
                        <h3>Navigation</h3>
                        <div class="footer-links">
                            <a href="/">Home</a>
                            <a href="/guide">Guide</a>
                            {#if $user}
                                <a href="/worlds">Worlds</a>
                                {#if $game.currentWorld}
                                    <a href={`/map?world=${$game.currentWorld}`}>Return to Game</a>
                                {/if}
                            {/if}
                        </div>
                    </div>
                    
                    <div class="footer-section">
                        <h3>Account</h3>
                        <div class="footer-links">
                            {#if $user}
                                <button class="footer-signout" onclick={signOut}>Sign Out</button>
                            {:else}
                                <a href="/login">Log In</a>
                                <a href="/signup">Sign Up</a>
                            {/if}
                        </div>
                    </div>
                    
                    <div class="footer-section">
                        <h3>Socials</h3>
                        <div class="footer-links">
                            <a href="https://x.com/GisaimaGame" target="_blank" rel="noopener noreferrer" class="social-link">
                                <XIcon size="16px" extraClass="social-icon" />
                                <span>X (Twitter)</span>
                            </a>
                            <a href="https://discord.gg/ugmRXWNXbA" target="_blank" rel="noopener noreferrer" class="social-link">
                                <DiscordIcon size="18px" extraClass="social-icon" />
                                <span>Discord</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="footer-bottom">
                <p>&copy; {new Date().getFullYear()} Gisaima. All Knights Declared.</p>
            </div>
        </footer>
    {/if}
</div>

<style>
    :global(*) {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }
    
    :global(:root) {
        /* Modern color palette */
        --color-dark-navy: #0A192F;
        --color-dark-blue: #112240;
        --color-bright-accent: #64FFDA;
        --color-accent-dark: #388F7F;
        --color-muted-accent: #8892B0;
        --color-text-primary: #E6F1FF;
        --color-text-secondary: #A8B2D1;
        --color-panel-bg: rgba(17, 34, 64, 0.8);
        --color-panel-border: rgba(100, 255, 218, 0.3);
        
        /* Keep existing biome colors */
        /* Water biomes */
        --color-biome-ocean: #0066cc;
        --color-biome-deep-ocean: #000080;
        --color-biome-abyssal-ocean: #000033;
        --color-biome-ocean-trench: #00004d;
        
        /* River biomes */
        --color-biome-wide-river: #4a91d6;
        --color-biome-river: #689ad3;
        --color-biome-rocky-river: #75a5d1;
        --color-biome-mountain-stream: #8fbbde;
        --color-biome-stream: #a3c7e8;
        --color-biome-highland-stream: #a8cbe9;
        --color-biome-tributary: #8bb5dd;
        --color-biome-creek: #b5d5ed;
        
        /* Wetland biomes */
        --color-biome-riverbank: #82a67d;
        --color-biome-flood-plain: #789f6a;
        --color-biome-riverine-forest: #2e593f;
        --color-biome-wetland: #517d46;
        --color-biome-lakeshore: #6a9b5e;
        --color-biome-swamp: #2f4d2a;
        --color-biome-marsh: #3d6d38;
        --color-biome-bog: #4f5d40;
        
        /* Beach biomes */
        --color-biome-sandy-beach: #f5e6c9;
        --color-biome-pebble-beach: #d9c8a5;
        --color-biome-rocky-shore: #9e9e83;
        
        /* Mountain biomes */
        --color-biome-snow-cap: #ffffff;
        --color-biome-alpine: #e0e0e0;
        --color-biome-mountain: #7d7d7d;
        --color-biome-dry-mountain: #8b6b4c;
        --color-biome-desert-mountains: #9c6b4f;
        
        /* Highland biomes */
        --color-biome-glacier: #c9eeff;
        --color-biome-highland-forest: #1d6d53;
        --color-biome-highland: #5d784c;
        --color-biome-rocky-highland: #787c60;
        --color-biome-mesa: #9e6b54;
        
        /* Forest biomes */
        --color-biome-tropical-rainforest: #0e6e1e;
        --color-biome-temperate-forest: #147235;
        --color-biome-woodland: #448d37;
        
        /* Grassland biomes */
        --color-biome-shrubland: #8d9c4c;
        --color-biome-grassland: #68a246;
        --color-biome-plains: #7db356;
        --color-biome-savanna: #c4b257;
        --color-biome-dry-plains: #c3be6a;
        
        /* Arid biomes */
        --color-biome-badlands: #9c7450;
        --color-biome-desert-scrub: #d1ba70;
        --color-biome-desert: #e3d59e;
        
        /* Volcanic biomes */
        --color-biome-active-volcano: #FF4400;
        --color-biome-lava-flow: #FF6600;
        --color-biome-volcanic-rock: #783C28;
        --color-biome-volcanic-soil: #9A5D42;
        
        /* Semantic color assignments */
        --color-background: var(--color-dark-navy);
        --color-background-gradient-start: var(--color-dark-navy);
        --color-background-gradient-end: var(--color-dark-blue);
        --color-text: var(--color-text-primary);
        --color-text-secondary: var(--color-text-secondary);
        --color-heading: var(--color-bright-accent);
        --color-subheading: var (--color-muted-accent);
        
        --color-button: var(--color-dark-blue);
        --color-button-hover: #233554;
        --color-button-primary: var(--color-accent-dark);
        --color-button-primary-hover: var(--color-bright-accent);
        --color-button-secondary: var (--color-muted-accent);
        --color-button-secondary-hover: #6D7A99;
        
        --color-card-bg: var(--color-panel-bg);
        --color-card-border: var(--color-panel-border);
        --color-link: var(--color-bright-accent);
        --color-link-hover: #9FFFEA;
        --color-shadow: rgba(0, 0, 0, 0.4);

        --color-pale-green: var(--color-bright-accent);
        --color-muted-teal: var(--color-accent-dark);

        /* Font family definitions */
        --font-heading: 'Cormorant Unicase', serif;
        --font-body: 'Fira Sans Condensed', sans-serif;
    }
    
    :global(body) {
        background: var(--color-background);
        color: var(--color-text);
        font-family: var(--font-body);
        font-weight: 400;
        line-height: 1.5;
    }

    .app {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        background: linear-gradient(to bottom, 
                   var(--color-background-gradient-start), 
                   var(--color-background-gradient-end));
    }

    .app.map {
        height: 100%;
    }

    /* Main content area with padding for absolute header */
    .main-content {
        flex: 1;
        display: flex;
        flex-direction: column;
    }

    /* Position header as absolute for all pages */
    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1em 2em;
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: 100;
        height: 6em;
        gap: 1em; /* Add gap between header elements */
    }

    /* Simplified header styling - no background or shadow */
    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1em 2em;
        z-index: 100;
        height: 6em;
        gap: 1em; /* Add gap between header elements */
    }

    /* Logo styling */
    .logo {
        display: flex;
        align-items: center;
        animation: fadeIn 0.15s ease-in-out;
    }

    .logo a {
        display: flex;
        align-items: center;
        text-decoration: none;
    }

    /* Target the logo component directly in the header using stronger specificity */
    .header .logo :global(.nav-logo) {
        width: 40px;
        height: 40px;
    }

    /* Navigation styling */
    .nav {
        display: flex;
        margin-right: auto; /* Changed from 2em to auto to push other elements to the right */
    }

    .links {
        display: flex;
        gap: 2.5em; /* Increased from 1.5em to 2.5em */
    }

    .links a {
        color: var(--color-text-secondary);
        text-decoration: none;
        font-size: 1.1em;
        transition: color 0.2s ease;
        position: relative;
        padding: 0.3em 0;
    }

    .links a:hover,
    .links a.active {
        color: var(--color-bright-accent);
    }

    .links a::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        width: 0;
        height: 2px;
        background-color: var(--color-bright-accent);
        transition: width 0.3s ease;
    }

    .links a:hover::after,
    .links a.active::after {
        width: 100%;
    }

    /* Auth container styling */
    .auth {
        display: flex;
        align-items: center;
        gap: 1.5em; /* Increased from 1em to 1.5em */
        height: 2.5em; /* Add minimum height to prevent layout shifting */
        transition: opacity 0.3s ease; /* Smooth transition for loading state */
        min-width: 8em; /* Ensure minimum width for auth area */
        justify-content: flex-end;
        opacity: 0;
        transition: opacity 0.3s ease;
    }
    
    .auth:not(.loading) {
        opacity: 1;
    }
    
    .greeting {
        font-size: 0.9em;
        color: var (--color-pale-green);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 150px;
        order: -1;
    }
    
    .signout {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        background-color: transparent;
        color: var(--color-pale-green);
        border: none;
        border-radius: 50%;
        cursor: pointer;
        transition: all 0.2s ease;
        width: 2.6em;
        height: 2.6em;
    }
    
    .signout:hover {
        transform: translateY(-0.125em);
        box-shadow: 0 0.125em 0.3125em var(--color-shadow);
    }
    
    .login, .signup {
        padding: 0.4em 0.8em;
        font-size: 0.9em;
        text-decoration: none;
        border-radius: 0.25em;
        transition: all 0.2s ease;
    }
    
    .login {
        color: var(--color-pale-green);
        border: 1px solid var(--color-muted-teal);
    }
    
    .signup {
        /* Update background color for better contrast */
        background-color: var(--color-pale-green);
        color: var(--color-dark-navy);
        font-weight: 500;
        border: 1px solid var(--color-pale-green);
    }
    
    .login:hover, .signup:hover {
        transform: translateY(-0.125em);
        box-shadow: 0 0.125em 0.3125em var(--color-shadow);
    }
    
    /* Add specific hover effect for signup */
    .signup:hover {
        background-color: #7AFFDF; /* Brighter version of pale green */
        border-color: #7AFFDF;
    }

    /* Common button styles - make more specific with child selector */
    :global(.button) > * {
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
    
    :global(.button):hover {
        background-color: var(--color-button-hover);
        transform: translateY(-0.125em);
        box-shadow: 0 0.1875em 0.3125em var(--color-shadow);
    }

    :global(.button).primary {
        background-color: var(--color-button-primary);
        border: none;
    }
    
    :global(.button).primary:hover {
        background-color: var(--color-button-primary-hover);
    }
    
    :global(.button).secondary {
        background-color: var(--color-button-secondary);
        color: var(--color-text);
        border: none;
    }
    
    :global(.button).secondary:hover {
        background-color: var(--color-button-secondary-hover);
    }
    
    /* Responsive image styling with child selectors */
    :global(.screenshot-container) {
        width: 100%;
        max-height: 80vh;
        overflow: hidden;
        border-radius: 0.5em;
        margin: 1em 0;
        box-shadow: 0 0.3em 1em var(--color-shadow);
    }
    
    /* Responsive adjustments */
    @media (max-width: 768px) {
        .header {
            padding: 0.8em 1.5em; /* Increased horizontal padding from 1em to 1.5em */
            justify-content: space-between; /* Ensure good spacing in mobile view */
        }
        
        .logo {
            flex: 1;
        }
        
        /* Remove the mobile-menu-toggle style since it's now handled above */
        
        .nav {
            display: none; /* Hide on mobile */
        }
        
        .auth {
            flex: 1;
            justify-content: flex-end;
            min-height: 2.2em;
            gap: 1.2em; /* Increase gap in mobile view */
        }
        
        .greeting {
            max-width: 100px;
            font-size: 0.8em;
        }

        .mobile-menu-toggle {
            margin-left: 1.5em; /* Increased spacing on mobile */
        }
    }

    /* Mobile Menu Toggle Button - Updated CSS */
    .mobile-menu-toggle {
        display: flex; /* Show by default */
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        cursor: pointer;
        z-index: 110;
        padding: 0.5em;
        order: 3; /* Position after other elements */
        margin-left: 2em; /* Increased from 1em to 2em */
    }
    
    /* Hide menu toggle on larger screens */
    @media (min-width: 769px) {
        .mobile-menu-toggle {
            display: none;
        }
    }

    /* Remove the hamburger styles since they're now in the component */

    :global(.icon-pale-green) {
        color: var(--color-pale-green);
        fill: var(--color-pale-green);
        stroke: var(--color-pale-green);
    }
    
    :global(.hamburger-icon span) {
        background-color: var(--color-pale-green);
    }

    /* Animation for mobile menu - moved from container to component */
    :global(.mobile-menu.animate-in) {
        animation-name: slideDown;
        animation-duration: 0.3s;
        animation-fill-mode: forwards;
    }
    
    :global(.mobile-menu.animate-out) {
        animation-name: slideUp;
        animation-duration: 0.3s;
        animation-fill-mode: forwards;
    }

    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    @keyframes slideUp {
        from {
            opacity: 1;
            transform: translateY(0);
        }
        to {
            opacity: 0;
            transform: translateY(-10px);
        }
    }

    /* Footer styles */
    .footer {
        margin-top: auto; /* Push footer to the bottom of flex container */
        padding: 2em 0 1em;
        background-color: var(--color-dark-blue);
        border-top: 1px solid var(--color-panel-border);
    }
    
    .footer-content {
        width: 90%;
        max-width: 1200px;
        margin: 0 auto;
        display: flex;
        justify-content: space-between;
        padding-bottom: 2em;
    }
    
    .footer-section {
        margin-bottom: 2em;
    }
    
    .footer-nav {
        display: flex;
        justify-content: flex-end;
        gap: 2.5em; /* Increased from 1.5em to 2.5em for more spacing between categories */
        flex-wrap: wrap;
        /* Default layout is columns for mobile first approach */
        flex-direction: column;
    }
    
    .footer-section.branding {
        flex: 0 0 40%;
        max-width: 400px;
        padding-right: 2em;
    }
    
    .footer-section h3 {
        color: var(--color-pale-green);
        font-family: var(--font-heading);
        font-weight: 400;
        margin-bottom: 1em;
        font-size: 1.2em;
        letter-spacing: 0.05em;
        text-align: left;
    }
    
    /* Update the footer title and logo to be properly aligned with brand container */
    .brand {
        display: flex;
        align-items: center;
        margin-bottom: 1em;
    }
    
    .footer-logo {
        display: inline-flex;
        align-items: center;
        text-decoration: none;
        margin: 0; /* Remove margins */
    }
    
    .footer-logo :global(.footer-logo-icon) {
        width: 40px;
        height: 40px;
    }
    
    .footer-title {
        font-size: 2em; /* Updated from 1.5em to 2em */
        letter-spacing: 0.2em;
        color: #e24144;
        text-shadow: 0 0 0.625em rgba(193, 19, 22, 0.5);
        font-weight: 400;
        font-family: var(--font-heading);
        margin: 0; /* Removed all margins */
    }
    
    .footer-tagline {
        color: rgba(255, 255, 255, 0.6); /* Reduced from full white to 60% opacity */
        font-style: italic;
        margin-bottom: 1em;
    }
    
    .footer-links {
        display: flex;
        flex-direction: column;
        gap: 0.8em;
        text-align: left;
    }
    
    .social-link {
        display: flex;
        align-items: center;
        gap: 0.5em;
    }
    
    .social-icon {
        color: rgba(255, 255, 255, 0.7);
        transition: color 0.2s ease;
    }
    
    .footer-links a, .footer-signout {
        color: rgba(255, 255, 255, 0.7);
        text-decoration: none;
        transition: color 0.2s ease;
        font-size: 1em;
        display: inline-block;
    }
    
    .footer-links a:hover, .footer-signout:hover {
        color: var(--color-pale-green);
    }
    
    .footer-signout {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        text-align: left;
        font-family: var(--font-body);
    }
    
    .footer-bottom {
        padding-top: 1em;
        text-align: center;
        font-size: 0.8em;
        color: var(--color-text-secondary);
        border-top: 1px solid rgba(100, 255, 218, 0.1);
    }
    
    @media (max-width: 768px) {
        .footer-content {
            flex-direction: column;
            text-align: center;
        }
        
        .footer-nav {
            justify-content: center;
            gap: 1.5em;
            /* Explicitly set column direction on mobile */
            flex-direction: column;
        }
        
        .footer-section.branding {
            flex: 1 1 100%;
            max-width: none;
            padding-right: 0;
            margin-bottom: 2em;
        }
        
        .footer-section h3 {
            text-align: center;
        }
        
        .footer-links {
            align-items: center;
        }
        
        .footer-signout {
            text-align: center;
        }
        
        .brand {
            justify-content: center; /* Center the brand on mobile */
        }
        
        :global(.screenshot-container) {
            border-radius: 0.25em;
            max-height: 50vh;
        }
        
        .social-link {
            justify-content: center;
        }
    }
    
    /* Desktop layout for footer nav */
    @media (min-width: 769px) {
        .footer-nav {
            flex-direction: row; /* Change to horizontal layout on desktop */
            align-items: flex-start; /* Align items to the top in the row */
        }
    }
</style>