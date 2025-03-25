<script>
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { user, loading as userLoading } from '../../lib/stores/user.js'; 
    import { 
      game, 
      getWorldInfo, 
      setCurrentWorld,
      isAuthReady,
      needsSpawn 
    } from "../../lib/stores/game.js";
    
    import { 
        map, 
        ready,
        targetStore,
        initialize,   // Add the new unified function
        setup,
        moveTarget,
        setupFromWorldInfo,
        setupFromGameStore,
        cleanup
    } from "../../lib/stores/map.js";
    
    import Tutorial from '../../components/map/Tutorial.svelte';
    import Grid from '../../components/map/Grid.svelte';
    import Minimap from '../../components/map/Minimap.svelte';
    import Axes from '../../components/map/Axes.svelte';
    import Legend from '../../components/map/Legend.svelte';
    import Details from '../../components/map/Details.svelte';
    import SpawnMenu from '../../components/map/SpawnMenu.svelte';
    import MapEntities from '../../components/map/MapEntities.svelte';
    import Close from '../../components/icons/Close.svelte';

    
    // Use $state for local component state
    let detailed = $state(false);
    let loading = $state(true);
    let error = $state(null);
    
    // Flag to track initialization attempts
    let initAttempted = $state(false);
    
    // Enhanced loading state that includes auth and game loading
    const combinedLoading = $derived(loading || $game.worldLoading || !$isAuthReady);
    
    // Simplified derived state
    const isDragging = $derived($map.isDragging);
    
    // Updated UI state management function
    function toggleDetailsModal(show) {
        detailed = show;
    }
    
    // Handle spawn completion
    function handleSpawnComplete(spawnLocation) {
        // Move to the spawn location
        if (spawnLocation) {
            moveTarget(spawnLocation.x, spawnLocation.y);
        }
    }
    
    // Effect to handle player location data from game store
    $effect(() => {
        // If we have player location data in the game store, use it to position the map
        if ($game.playerWorldData?.lastLocation && !$needsSpawn) {
            const location = $game.playerWorldData.lastLocation;
            moveTarget(location.x, location.y);
        }
    });
    
    // Simplified initialize map function that uses game store
    async function initializeMap(worldId) {
        try {
            loading = true;
            error = null;
            
            // First, wait for auth to be ready
            if (!$isAuthReady) {
                await new Promise(resolve => {
                    const unsubscribe = isAuthReady.subscribe(ready => {
                        if (ready) {
                            unsubscribe();
                            resolve();
                        }
                    });
                });
            }
            
            // Make sure the game store has the current world set
            await setCurrentWorld(worldId);
            
            // Force a fresh world info fetch to ensure we have the seed
            const worldInfo = await getWorldInfo(worldId, true);
            
            // Check that we have the world data with a seed
            if (!worldInfo) {
                throw new Error(`World info not found for ${worldId}`);
            }
            if (worldInfo.seed === undefined) {
                throw new Error(`World ${worldId} has no seed defined`);
            }
            
            // Use new unified initialize function
            if (!initialize({ worldId, worldInfo })) {
                throw new Error('Failed to initialize map with world data');
            }
            
            loading = false;
            
        } catch (err) {
            error = err.message || 'Failed to load world';
            loading = false;
            console.error('Error initializing map:', err);
        }
    }
    
    // Use the reactive statement to initialize map when world data is ready
    $effect(() => {
        // Skip if we've already tried to initialize or if there's an error
        if (initAttempted || error || !$isAuthReady) return;
        
        // Check if world data is fully loaded from Firebase with valid seed
        if (!$game.worldLoading && $game.currentWorld && $game.worldInfo[$game.currentWorld]?.seed !== undefined) {
            initAttempted = true;
            
            try {
                // Use the new unified initialize function
                if (initialize({ gameStore: game })) {
                    loading = false;
                    error = null;
                } else {
                    error = 'Failed to initialize map with world data';
                    loading = false;
                }
            } catch (err) {
                console.error('Error initializing map:', err);
                error = err.message || 'Failed to initialize map';
            }
        }
    });
    
    // Use $effect to handle auth state changes
    $effect(() => {
      // Only redirect if user state is determined and user is not authenticated
      if (browser && !$userLoading && $user === null) {
        const worldId = $page.url.searchParams.get('world') || $game.currentWorld;
        const redirectPath = worldId ? `/map?world=${worldId}` : '/map';
        goto(`/login?redirect=${encodeURIComponent(redirectPath)}`);
      }
    });
    
    // Add a safe way to get world ID with SSR guard
    let currentWorldId = $state(null);
    
    // Use effect to detect world ID from URL or game store safely
    $effect(() => {
        if (!browser) return; // Don't run during SSR
        
        // Try to get world ID from URL first
        const worldFromUrl = $page.url.searchParams.get('world');
        
        // Fall back to game store if available
        const worldFromStore = $game?.currentWorld;
        
        // Set the world ID safely with null checks
        currentWorldId = worldFromUrl || worldFromStore || null;
        
        console.log('Map page world ID:', currentWorldId);
        
        // Other initialization logic that depends on world ID
        // ...
    });
    
    onMount(() => {
        if (!browser) return; // Safety check
        
        if (browser) document.body.classList.add('map-page-active');
        
        // Initialize map with current world data if available
        if (!$ready && currentWorldId && $game.worldInfo[currentWorldId]) {
            console.log('Initializing map from onMount with world info from game store');
            initialize({ 
                worldId: currentWorldId, 
                worldInfo: $game.worldInfo[currentWorldId] 
            });
        }
        
        // Get world ID from URL or current world
        const worldId = $page.url.searchParams.get('world') || $game.currentWorld;
        
        // Auth check is now handled in the effect above
        
        if (!worldId) {
            // No world ID, redirect to worlds page
            goto('/worlds');
            return;
        }

        // Initialize the map with the worldId - this will properly coordinate with auth
        initializeMap(worldId)
            .catch(err => {
                console.error(`Failed to initialize map:`, err); 
                error = err.message || `Failed to load world`;
                loading = false;
            });
    });
    
    onDestroy(() => {
        if (browser) {
            document.body.classList.remove('map-page-active');
            
            // Clean up map resources to prevent memory leaks
            cleanup();
        }
    });

    // Add state for component visibility
    let showMinimap = $state(true);
    let showEntities = $state(true);
    let minimapClosing = $state(false);
    let entitiesClosing = $state(false);
    
    // Constants
    const ANIMATION_DURATION = 800;
    
    // Initialize visibility from localStorage
    $effect(() => {
        if (browser) {
            // Initialize minimap visibility
            const storedMinimapVisibility = localStorage.getItem('minimap');
            // Default to true for large screens, false for small
            const defaultMinimapVisibility = window.innerWidth >= 768;
            showMinimap = storedMinimapVisibility === 'false' ? false : 
                           storedMinimapVisibility === 'true' ? true : 
                           defaultMinimapVisibility;
                
            // Initialize entities visibility
            const storedEntitiesVisibility = localStorage.getItem('mapEntities');
            // Default to showing entities
            showEntities = storedEntitiesVisibility !== 'false';
            
            // Also set minimap visibility in the map store
            map.update(state => ({
                ...state,
                minimap: showMinimap
            }));
        }
    });
    
    // Function to toggle minimap with animation
    function toggleMinimap() {
        if (showMinimap) {
            // Handle closing with animation
            minimapClosing = true;
            setTimeout(() => {
                showMinimap = false;
                minimapClosing = false;
                // Update map store
                map.update(state => ({ ...state, minimap: false }));
                if (browser) {
                    localStorage.setItem('minimap', 'false');
                }
            }, ANIMATION_DURATION);
        } else {
            // Show immediately, but first close entities if open
            if (showEntities) {
                entitiesClosing = true;
                setTimeout(() => {
                    showEntities = false;
                    entitiesClosing = false;
                    if (browser) {
                        localStorage.setItem('mapEntities', 'false');
                    }
                }, ANIMATION_DURATION);
            }
            
            showMinimap = true;
            // Update map store
            map.update(state => ({ ...state, minimap: true }));
            if (browser) {
                localStorage.setItem('minimap', 'true');
            }
        }
    }
    
    // Function to toggle entities with animation
    function toggleEntities() {
        if (showEntities) {
            // Handle closing with animation
            entitiesClosing = true;
            setTimeout(() => {
                showEntities = false;
                entitiesClosing = false;
                if (browser) {
                    localStorage.setItem('mapEntities', 'false');
                }
            }, ANIMATION_DURATION);
        } else {
            // Show immediately, but first close minimap if open
            if (showMinimap) {
                minimapClosing = true;
                setTimeout(() => {
                    showMinimap = false;
                    minimapClosing = false;
                    // Update map store
                    map.update(state => ({ ...state, minimap: false }));
                    if (browser) {
                        localStorage.setItem('minimap', 'false');
                    }
                }, ANIMATION_DURATION);
            }
            
            showEntities = true;
            if (browser) {
                localStorage.setItem('mapEntities', 'true');
            }
        }
    }
</script>

<div class="map" class:dragging={isDragging}>
    {#if combinedLoading}
        <div class="loading-overlay">
            <div class="loading-spinner"></div>
            <div>
                {#if !$isAuthReady}
                    Loading user data...
                {:else if $game.worldLoading}
                    Loading world data...
                {:else}
                    Initializing world...
                {/if}
            </div>
        </div>
    {:else if error || $game.error}
        <div class="error-overlay">
            <h3>Error</h3>
            <p>{error || $game.error}</p>
            <button onclick={() => goto('/worlds')}>Go to Worlds</button>
        </div>
    {:else}
        <!-- Use prop binding with runes syntax -->
        <Grid {detailed} />
        
        <!-- Add toggle controls at the top -->
        <div class="map-controls">
            <button 
                class="control-button entity-button" 
                onclick={toggleEntities}
                aria-label={showEntities ? "Hide entities" : "Show entities"}>
                {#if showEntities || entitiesClosing}
                    <Close size="1.2em" extraClass="close-icon-dark" />
                {:else}
                    <span class="button-text">E</span>
                {/if}
            </button>
            
            <button 
                class="control-button minimap-button" 
                onclick={toggleMinimap}
                aria-label={showMinimap ? "Hide minimap" : "Show minimap"}>
                {#if showMinimap || minimapClosing}
                    <Close size="1.2em" extraClass="close-icon-dark" />
                {:else}
                    <span class="button-text">M</span>
                {/if}
            </button>
        </div>
        
        <!-- Conditionally render components based on state -->
        {#if showMinimap || minimapClosing}
            <Minimap closing={minimapClosing} />
        {/if}
        
        {#if showEntities || entitiesClosing}
            <MapEntities closing={entitiesClosing} />
        {/if}

        {#if detailed}
            <Details 
                x={$targetStore.x} 
                y={$targetStore.y} 
                terrain={$targetStore.biome?.name} 
                onClose={() => toggleDetailsModal(false)}
            />
        {:else}
            <Legend 
                x={$targetStore.x}  
                y={$targetStore.y}  
                openDetails={() => toggleDetailsModal(true)} 
            />
        {/if}

        {#if $ready}
            <Axes />
        {/if}

        <!-- Use prop binding with runes syntax -->
        <Tutorial {detailed} />
        
        <!-- Show spawn menu when needed based on the derived store -->
        {#if $needsSpawn}
            <SpawnMenu onSpawn={handleSpawnComplete} />
        {/if}
    {/if}
</div>

<style>
    .map {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100dvh;
    }
    
    .map.dragging {
        overflow: hidden;
        touch-action: none;
    }
    
    :global(body.map-page-active) {
        overscroll-behavior: none;
        overflow: hidden;
        position: fixed;
        width: 100%;
        height: 100%;
    }
    
    .loading-overlay,
    .error-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        z-index: 1000;
    }
    
    .loading-spinner {
        border: 0.25em solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top: 0.25em solid white;
        width: 2.5em;
        height: 2.5em;
        animation: spin 1s linear infinite;
        margin-bottom: 1rem;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .error-overlay button {
        margin-top: 1rem;
        padding: 0.5rem 1rem;
        background: #4A90E2;
        color: white;
        border: none;
        border-radius: 0.25em;
        cursor: pointer;
    }

    .map-controls {
        position: absolute;
        top: 0.5em;
        right: 0.5em;
        display: flex;
        gap: 0.5em;
        z-index: 999;
    }
    
    .control-button {
        width: 2em;
        height: 2em;
        background-color: rgba(255, 255, 255, 0.85);
        border: 0.05em solid rgba(255, 255, 255, 0.2);
        border-radius: 0.3em;
        color: rgba(0, 0, 0, 0.8);
        padding: 0.3em;
        font-size: 1em;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
        transition: all 0.2s ease;
        backdrop-filter: blur(0.5em);
        -webkit-backdrop-filter: blur(0.5em);
        opacity: 0;
        transform: translateY(-1em);
        animation: fadeInButton 0.7s ease-out 0.5s forwards;
    }
    
    .control-button:hover {
        background-color: rgba(255, 255, 255, 0.95);
        border-color: rgba(255, 255, 255, 0.5);
    }
    
    .button-text {
        font-weight: bold;
        color: rgba(0, 0, 0, 0.8);
    }
    
    @keyframes fadeInButton {
        0% {
            opacity: 0;
            transform: translateY(-1em);
        }
        100% {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .control-button:focus-visible {
        outline: 0.15em solid rgba(0, 0, 0, 0.6);
        outline-offset: 0.1em;
    }
</style>