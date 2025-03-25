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
        targetPosition,
        initialize,
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
    
    // URL coordinates handling
    let urlCoordinates = $state(null);
    let urlProcessingComplete = $state(false);
    
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
    
    // Function to extract coordinates from URL parameters
    function parseUrlCoordinates() {
        if (!browser || !$page.url) return null;
        
        const x = $page.url.searchParams.get('x');
        const y = $page.url.searchParams.get('y');
        
        if (x !== null && y !== null) {
            const parsedX = parseInt(x, 10);
            const parsedY = parseInt(y, 10);
            
            if (!isNaN(parsedX) && !isNaN(parsedY)) {
                return { x: parsedX, y: parsedY };
            }
        }
        
        return null;
    }
    
    // Monitor URL for coordinate changes
    $effect(() => {
        if (browser && $page.url) {
            const newCoords = parseUrlCoordinates();
            
            if (newCoords) {
                console.log(`Found URL coordinates: ${newCoords.x},${newCoords.y}`);
                urlCoordinates = newCoords;
                urlProcessingComplete = false;
            } else if (urlCoordinates) {
                // Clear coordinates if URL no longer has them
                urlCoordinates = null;
            }
        }
    });
    
    // Apply URL coordinates when map is ready
    $effect(() => {
        if (!$ready || urlProcessingComplete) return;
        
        if (urlCoordinates) {
            console.log(`Applying URL coordinates: ${urlCoordinates.x},${urlCoordinates.y}`);
            moveTarget(urlCoordinates.x, urlCoordinates.y);
            urlProcessingComplete = true;
        } else if ($game.playerWorldData?.lastLocation && !$needsSpawn) {
            // Fall back to player location
            const location = $game.playerWorldData.lastLocation;
            moveTarget(location.x, location.y);
            urlProcessingComplete = true;
        }
    });
    
    // Reset processing flag when URL coordinates change
    $effect(() => {
        if (browser && $page.url) {
            const newCoords = parseUrlCoordinates();
            if (newCoords && urlProcessingComplete) {
                const mapTarget = $targetPosition;
                if (newCoords.x !== mapTarget.x || newCoords.y !== mapTarget.y) {
                    console.log(`URL coordinates changed manually: ${newCoords.x},${newCoords.y}`);
                    urlProcessingComplete = false;
                }
            }
        }
    });

    // Handle spawn completion
    function handleSpawnComplete(spawnLocation) {
        if (spawnLocation) {
            moveTarget(spawnLocation.x, spawnLocation.y);
        }
    }
    
    // Initialize map function with improved URL coordinate handling
    async function initializeMap(worldId) {
        try {
            loading = true;
            error = null;
            
            // Wait for auth to be ready
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
            
            // Set current world and get world info
            await setCurrentWorld(worldId);
            const worldInfo = await getWorldInfo(worldId, true);
            
            if (!worldInfo) {
                throw new Error(`World info not found for ${worldId}`);
            }
            if (worldInfo.seed === undefined) {
                throw new Error(`World ${worldId} has no seed defined`);
            }
            
            // Get URL coordinates for initialization
            const startingCoords = urlCoordinates;
            const shouldApplyCoords = !!startingCoords && !urlProcessingComplete;
            
            // Initialize with coordinates if available
            if (!initialize({ 
                worldId, 
                worldInfo,
                initialX: shouldApplyCoords ? startingCoords.x : undefined,
                initialY: shouldApplyCoords ? startingCoords.y : undefined
            })) {
                throw new Error('Failed to initialize map with world data');
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            loading = false;
            
            if (shouldApplyCoords) {
                urlProcessingComplete = true;
            }
            
        } catch (err) {
            error = err.message || 'Failed to load world';
            loading = false;
            console.error('Error initializing map:', err);
        }
    }
    
    // Auto-initialize when world data is ready
    $effect(() => {
        if (initAttempted || error || !$isAuthReady) return;
        
        if (!$game.worldLoading && $game.currentWorld && $game.worldInfo[$game.currentWorld]?.seed !== undefined) {
            initAttempted = true;
            
            try {
                const startingCoords = urlCoordinates;
                
                if (initialize({ 
                    gameStore: game,
                    initialX: startingCoords?.x,
                    initialY: startingCoords?.y
                })) {
                    loading = false;
                    error = null;
                    
                    if (startingCoords) {
                        urlProcessingComplete = true;
                    }
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
    
    // Handle auth state changes
    $effect(() => {
      if (browser && !$userLoading && $user === null) {
        const worldId = $page.url.searchParams.get('world') || $game.currentWorld;
        const redirectPath = worldId ? `/map?world=${worldId}` : '/map';
        goto(`/login?redirect=${encodeURIComponent(redirectPath)}`);
      }
    });
    
    // Get world ID from URL or store
    let currentWorldId = $state(null);
    
    $effect(() => {
        if (!browser) return;
        
        const worldFromUrl = $page.url.searchParams.get('world');
        const worldFromStore = $game?.currentWorld;
        
        currentWorldId = worldFromUrl || worldFromStore || null;
    });
    
    // Component lifecycle
    onMount(() => {
        if (!browser) return;
        
        document.body.classList.add('map-page-active');
        
        // Try to initialize from existing world info
        if (!$ready && currentWorldId && $game.worldInfo[currentWorldId]) {
            initialize({ 
                worldId: currentWorldId, 
                worldInfo: $game.worldInfo[currentWorldId],
                initialX: urlCoordinates?.x,
                initialY: urlCoordinates?.y
            });
            
            if (urlCoordinates) {
                urlProcessingComplete = true;
            }
        }
        
        // Get world ID and initialize map
        const worldId = $page.url.searchParams.get('world') || $game.currentWorld;
        
        if (!worldId) {
            goto('/worlds');
            return;
        }

        initializeMap(worldId).catch(err => {
            console.error(`Failed to initialize map:`, err); 
            error = err.message || `Failed to load world`;
            loading = false;
        });
    });
    
    onDestroy(() => {
        if (browser) {
            document.body.classList.remove('map-page-active');
            cleanup();
        }
    });

    // UI component visibility state
    let showMinimap = $state(true);
    let showEntities = $state(true);
    let minimapClosing = $state(false);
    let entitiesClosing = $state(false);
    
    const ANIMATION_DURATION = 800;
    
    // Initialize UI visibility from localStorage
    $effect(() => {
        if (browser) {
            const storedMinimapVisibility = localStorage.getItem('minimap');
            const defaultMinimapVisibility = window.innerWidth >= 768;
            
            showMinimap = storedMinimapVisibility === 'false' ? false : 
                          storedMinimapVisibility === 'true' ? true : 
                          defaultMinimapVisibility;
            
            const storedEntitiesVisibility = localStorage.getItem('mapEntities');
            showEntities = storedEntitiesVisibility !== 'false';
            
            map.update(state => ({
                ...state,
                minimap: showMinimap
            }));
        }
    });
    
    // Toggle visibility functions
    function toggleMinimap() {
        if (showMinimap) {
            minimapClosing = true;
            setTimeout(() => {
                showMinimap = false;
                minimapClosing = false;
                map.update(state => ({ ...state, minimap: false }));
                if (browser) {
                    localStorage.setItem('minimap', 'false');
                }
            }, ANIMATION_DURATION);
        } else {
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
            map.update(state => ({ ...state, minimap: true }));
            if (browser) {
                localStorage.setItem('minimap', 'true');
            }
        }
    }
    
    function toggleEntities() {
        if (showEntities) {
            entitiesClosing = true;
            setTimeout(() => {
                showEntities = false;
                entitiesClosing = false;
                if (browser) {
                    localStorage.setItem('mapEntities', 'false');
                }
            }, ANIMATION_DURATION);
        } else {
            if (showMinimap) {
                minimapClosing = true;
                setTimeout(() => {
                    showMinimap = false;
                    minimapClosing = false;
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
        <Grid {detailed} />
        
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

        <Tutorial />
        
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