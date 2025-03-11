<script>
    import { page } from '$app/stores';
    import { user, signOut } from '$lib/stores/auth';
    import Logo from '../components/Logo.svelte';
    

    // TODO: This needs refactoring to runes.
    $: isMapPage = $page.url.pathname === '/map';
</script>

<div class="app">
    <header class={`appheader ${isMapPage ? 'map-header' : ''}`}>
        <nav class="navbar">
            <!-- Separate logo container that's always visible -->
            <div class="logo-container">
                <a href="/" class="logolink">
                    <Logo extraClass="navlogo" />
                </a>
            </div>
            
            <!-- Only render navigation links when not on map page -->
            {#if !isMapPage}
                <div class="navlinks">
                    <a href="/map" class="button navlink">Map</a>
                    {#if !$user}
                        <a href="/login" class="button navlink">Login</a>
                        <a href="/signup" class="button navlink">Sign Up</a>
                    {/if}
                </div>
            {/if}
            
            <!-- Only render auth links when not on map page -->
            {#if !isMapPage && $user}
                <div class="authlinks">
                    <span class="greeting">Hello, {$user.email}</span>
                    <button class="button" onclick={() => signOut}>Sign Out</button>
                </div>
            {/if}
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
    
    .appheader.map-header {
        pointer-events: none;
        justify-content: center;
        padding: 2.2em 3.7em;
    }
    
    /* Ensure nav elements remain clickable */
    .navbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        pointer-events: all;
        width: 100%;
    }

    /* Logo container is always visible */
    .logo-container {
        display: flex;
        align-items: center;
    }

    /* Remove the .hidden class since we're not using it anymore */
    
    .navlinks {
        display: flex;
        gap: 1em;
        align-items: center;
        margin-left: 1em;
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
