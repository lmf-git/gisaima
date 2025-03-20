<script>
    import { page } from '$app/stores';
    import { user, signOut } from '$lib/stores/user';
    import Logo from '../components/Logo.svelte';
    import SignOut from '../components/icons/SignOut.svelte'; // Import the new SignOut component
    import MobileMenu from '../components/MobileMenu.svelte';
    import { onMount, onDestroy } from 'svelte';
    import { initGameStore, game } from '../lib/stores/game.js';
    import { ref, onValue } from "firebase/database";
    import { db } from '../lib/firebase/database.js';

    const { children } = $props();

    // Manage mobile menu state at the layout level with correct $state syntax
    let mobileMenuOpen = $state(false);
    
    // Player data state
    let playerData = $state(null);
    let playerLoading = $state(false);
    let playerUnsubscribe = null;
    
    function toggleMobileMenu() {
        mobileMenuOpen = !mobileMenuOpen;
    }
    
    function closeMobileMenu() {
        mobileMenuOpen = false;
    }

    let gameUnsubscribe;
    
    // Subscribe to player data when auth changes
    $effect(() => {
        if ($user?.uid) {
            playerLoading = true;
            
            // Clean up any existing subscription
            if (playerUnsubscribe) {
                playerUnsubscribe();
                playerUnsubscribe = null;
            }
            
            // Subscribe to player profile data
            const playerRef = ref(db, `players/${$user.uid}/profile`);
            playerUnsubscribe = onValue(playerRef, (snapshot) => {
                if (snapshot.exists()) {
                    playerData = snapshot.val();
                } else {
                    playerData = null;
                }
                playerLoading = false;
            }, (error) => {
                console.error("Error fetching player data:", error);
                playerLoading = false;
            });
        } else {
            // Reset player data when user logs out
            playerData = null;
            if (playerUnsubscribe) {
                playerUnsubscribe();
                playerUnsubscribe = null;
            }
        }
    });
    
    onMount(() => {
        // Initialize the game store without localStorage dependency
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
    
    // Format date for display
    function formatDate(timestamp) {
        if (!timestamp) return 'N/A';
        return new Date(timestamp).toLocaleDateString();
    }
</script>

<div class={`app ${$page.url.pathname === '/map' ? 'map' : ''}`}>
    <header class="site-header">
        <div class="logo-container">
            <a href="/" class="logo-link" aria-label="Gisaima Home">
                <Logo extraClass="header-logo" />
            </a>
        </div>
        
        <nav class="main-nav">
            <ul class="nav-links">
                <li><a href="/worlds" class:active={$page.url.pathname === '/worlds'}>Worlds</a></li>
                <li><a href="/map" class:active={$page.url.pathname === '/map'}>Map</a></li>
                <li><a href="/about" class:active={$page.url.pathname === '/about'}>About</a></li>
            </ul>
        </nav>
        
        <div class="auth-container">
            {#if $user}
                <div class="user-greeting">Hello, {$user.displayName || $user.email.split('@')[0]}</div>
                <button class="sign-out-btn" onclick={signOut} aria-label="Sign Out">
                    <SignOut size="1.2em" color="var(--color-pale-green)" />
                </button>
            {:else}
                <a href="/login" class="login-link">Log In</a>
                <a href="/signup" class="signup-link">Sign Up</a>
            {/if}
        </div>
    </header>

    {@render children?.()}
</div>

<style>
    :global(*) {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }
    
    :global(:root) {
        /* Modern color palette */
        --color-dark-navy: #0A192F;       /* Darker navy for backgrounds */
        --color-dark-blue: #112240;       /* Deep blue for panels */
        --color-bright-accent: #64FFDA;   /* Bright teal accent */
        --color-accent-dark: #388F7F;     /* Darker version of accent */
        --color-muted-accent: #8892B0;    /* Muted blue-gray */
        --color-text-primary: #E6F1FF;    /* Bright white-blue text */
        --color-text-secondary: #A8B2D1;  /* Secondary text */
        --color-panel-bg: rgba(17, 34, 64, 0.8); /* Panel background */
        --color-panel-border: rgba(100, 255, 218, 0.3); /* Panel border */
        
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
        --color-subheading: var(--color-muted-accent);
        
        --color-button: var(--color-dark-blue);
        --color-button-hover: #233554;
        --color-button-primary: var(--color-accent-dark);
        --color-button-primary-hover: var(--color-bright-accent);
        --color-button-secondary: var(--color-muted-accent);
        --color-button-secondary-hover: #6D7A99;
        
        --color-card-bg: var(--color-panel-bg);
        --color-card-border: var(--color-panel-border);
        --color-link: var(--color-bright-accent);
        --color-link-hover: #9FFFEA;
        --color-shadow: rgba(0, 0, 0, 0.4);

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

    .header {
        display: flex;
        align-items: center;
        z-index: 100;
        box-sizing: border-box;
    }
    
    .navbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        pointer-events: all;
        width: 100%;
    }

    .logo-container {
        display: flex;
        align-items: center;
    }

    .navlinks {
        display: flex;
        gap: 1em;
        align-items: center;
        margin-left: auto;
    }
    
    .authlinks {
        display: flex;
        gap: 1em;
        align-items: center;
    }

    .navlink {
        border: none;
        font-size: 1.3em;
    }
    
    .greeting {
        color: var(--color-heading);
        margin-right: 0.5em;
    }


    .logolink {
        display: flex;
        align-items: center;
        padding: 1em;
    }

    :global(.navlogo) {
        height: 3em;
    }

    .mobile-menu-container {
        display: block;
        margin-left: auto;
    }

    .desktop-only {
        display: none;
    }

    /* Apply responsive grid styles based on screen size */
    @media (min-width: 640px) {
        :global(:root) {
            --grid-tile-size: var(--grid-tile-size-sm);
        }

        .header {
            padding: 2.2em 1.7em;
        }
        
        .desktop-only {
            display: flex;
        }
        
        .mobile-menu-container {
            display: none;
        }
    }
    
    @media (min-width: 1024px) {
        :global(:root) {
            --grid-tile-size: var(--grid-tile-size-md);
        }
    }
    
    @media (min-width: 1440px) {
        :global(:root) {
            --grid-tile-size: var(--grid-tile-size-lg);
        }
    }

    /* Common styles for re-use across app. */

    
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

    .player-info {
        display: flex;
        flex-direction: column;
        margin-right: 1em;
    }
    
    .player-details {
        display: flex;
        gap: 1em;
        font-size: 0.8em;
        color: var(--color-text-secondary);
    }
    
    .greeting {
        color: var(--color-heading);
        margin-right: 0.5em;
    }
    
    .authlinks {
        display: flex;
        align-items: center;
    }

    .auth-container {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    
    .sign-out-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.4em;
        background-color: var(--color-dark-navy);
        color: var(--color-pale-green);
        border: 1px solid var(--color-muted-teal);
        border-radius: 50%;
        font-size: 0.9em;
        cursor: pointer;
        transition: all 0.2s ease;
        width: 2.2em;
        height: 2.2em;
    }
    
    .sign-out-btn:hover {
        background-color: var(--color-deep-blue);
        transform: translateY(-2px);
        box-shadow: 0 2px 5px var(--color-shadow);
    }
    
    .user-greeting {
        font-size: 0.9em;
        color: var(--color-pale-green);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 150px;
        order: -1; /* This makes the greeting appear before the sign out button */
    }
    
    .login-link, .signup-link {
        padding: 0.4em 0.8em;
        font-size: 0.9em;
        text-decoration: none;
        border-radius: 4px;
        transition: all 0.2s ease;
    }
    
    .login-link {
        color: var(--color-pale-green);
        border: 1px solid var(--color-muted-teal);
    }
    
    .signup-link {
        background-color: var(--color-button-primary);
        color: var (--color-text);
        border: 1px solid var(--color-muted-teal);
    }
    
    .login-link:hover, .signup-link:hover {
        transform: translateY(-2px);
        box-shadow: 0 2px 5px var(--color-shadow);
    }
    
    @media (max-width: 768px) {
        .site-header {
            flex-direction: column;
            padding: 0.5rem;
        }
        
        .logo-container, .main-nav, .auth-container {
            margin: 0.3rem 0;
        }
        
        .nav-links {
            gap: 1rem;
        }
        
        .user-greeting {
            max-width: 120px;
        }
    }
    
    @media (max-width: 480px) {
        .auth-container {
            flex-direction: column;
            gap: 0.5rem;
        }
        
        .user-greeting {
            font-size: 0.8em;
        }
    }
</style>
