<script>
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { 
      game, 
      getWorldInfo, 
      setCurrentWorld, 
      currentWorldInfo, 
      currentWorldSeed 
    } from "../../lib/stores/game.js";
    
    import { 
        map, 
        ready,
        targetStore,
        setup,
        setupFromGameStore
    } from "../../lib/stores/map.js";

    import Tutorial from '../../components/map/Tutorial.svelte';
    import Grid from '../../components/map/Tutorial.svelte';
    import Minimap from '../../components/map/Tutorial.svelte';
    import Axes from '../../components/map/Tutorial.svelte';
    import Legend from '../../components/map/Tutorial.svelte';
    import Details from '../../components/map/Tutorial.svelte';

    
    // Use $state for local component state
    let detailed = $state(false);
    let loading = $state(true);
    let error = $state(null);
    
    // Simplified derived state
    const isDragging = $derived($map.isDragging);
    
    // Convert $: statement to $derived runes syntax
    const combinedLoading = $derived(loading || $game.worldLoading);
    
    // Updated UI state management function
    function toggleDetailsModal(show) {
        detailed = show;
    }
    
    // Simplified initialize map function that uses game store
    async function initializeMap(worldId) {
        try {
            loading = true;
            error = null;
            console.log('Initializing map for world:', worldId);
            
            // Make sure the game store has the current world set
            await setCurrentWorld(worldId);
            
            // Wait for world data to be loaded
            if ($game.worldLoading) {
                console.log('Waiting for world data to load...');
                
                // Create a promise to wait for world loading to finish
                await new Promise((resolve, reject) => {
                    const unsubscribe = game.subscribe(gameState => {
                        if (!gameState.worldLoading) {
                            unsubscribe();
                            
                            if (gameState.error) {
                                reject(new Error(gameState.error));
                            } else if (
                                !gameState.worldInfo[worldId] || 
                                gameState.worldInfo[worldId].seed === undefined
                            ) {
                                reject(new Error(`Missing seed data for world ${worldId}`));
                            } else {
                                resolve();
                            }
                        }
                    });
                    
                    // Add a timeout to prevent hanging
                    setTimeout(() => {
                        unsubscribe();
                        reject(new Error('Timed out waiting for world data'));
                    }, 10000); // 10 second timeout
                });
            }
            
            // Check that we have the world data with a seed
            const worldInfo = $game.worldInfo[worldId];
            if (!worldInfo) {
                throw new Error(`World info not found for ${worldId}`);
            }
            if (worldInfo.seed === undefined) {
                throw new Error(`World ${worldId} has no seed defined`);
            }
            
            console.log('World info loaded:', worldInfo);
            console.log('World seed:', worldInfo.seed, typeof worldInfo.seed);
            
            // Initialize map with data from the game store
            setupFromGameStore();
            loading = false;
            
        } catch (err) {
            error = err.message || 'Failed to load world';
            loading = false;
            console.error('Error initializing map:', err);
        }
    }
    
    onMount(() => {
        if (browser) document.body.classList.add('map-page-active');
        
        // Get world ID from URL or current world
        const worldId = $page.url.searchParams.get('world') || $game.currentWorld;
        
        if (!worldId) {
            // No world ID, redirect to worlds page
            console.log('No world selected, redirecting to worlds page');
            goto('/worlds');
            return;
        }
        
        // Check if the worldId is in joined worlds
        if ($game.joinedWorlds.length > 0 && !$game.joinedWorlds.includes(worldId)) {
            console.log('World not in joined list, redirecting to worlds page');
            goto('/worlds');
            return;
        }
        
        // Add loading state indicator
        let mapInitialized = false;
        
        // Only initialize map if we have a valid world ID, and do it asynchronously
        console.log('Initializing map with world ID:', worldId);
        setupFromGameStore()
            .then(() => {
                console.log('Map initialization complete');
                mapInitialized = true;
            })
            .catch(error => {
                console.error('Error initializing map:', error);
                // Set error state to display to the user
            });
        
        // Only initialize map if we have a valid world ID
        initializeMap(worldId);
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
            <div>Loading world{#if $game.worldLoading} data{/if}...</div>
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
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top: 4px solid white;
        width: 40px;
        height: 40px;
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
        border-radius: 4px;
        cursor: pointer;
    }
</style>