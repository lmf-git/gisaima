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
        setup,
        moveTarget,
        setupFromGameStore
    } from "../../lib/stores/map.js";
    
    import Tutorial from '../../components/map/Tutorial.svelte';
    import Grid from '../../components/map/Grid.svelte';
    import Minimap from '../../components/map/Minimap.svelte';
    import Axes from '../../components/map/Axes.svelte';
    import Legend from '../../components/map/Legend.svelte';
    import Details from '../../components/map/Details.svelte';
    import SpawnMenu from '../../components/map/SpawnMenu.svelte';

    
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
            
            // Initialize map with data from the game store
            if (!setupFromGameStore()) {
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
                if (setupFromGameStore()) {
                    loading = false;
                    error = null;
                    
                    // No need to check player spawn status manually anymore
                    // It's now handled through the game store and needsSpawn derived store
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
    
    onMount(() => {
        if (browser) document.body.classList.add('map-page-active');
        
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
        }
    });
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
        <Minimap />

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
</style>