<script>
    import { Grid, Minimap, Axes, Legend, Details, Tutorial } from '../../components/map/';
    import { 
        map, 
        ready,
        targetStore,
        setup
    } from "../../lib/stores/map.js";
    import { browser } from '$app/environment';
    import { onMount, onDestroy } from 'svelte';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { game, getWorldInfo, setCurrentWorld } from "../../lib/stores/game.js";
    
    // Use $state for local component state
    let detailed = $state(false);
    let loading = $state(true);
    let error = $state(null);
    
    // Simplified derived state
    const isDragging = $derived($map.isDragging);
    
    // Updated UI state management function
    function toggleDetailsModal(show) {
        detailed = show;
    }
    
    async function initializeMap(worldId) {
        try {
            loading = true;
            error = null;
            
            // Check if we already have this world's info in the store
            let worldInfo;
            if ($game.worldInfo && $game.worldInfo[worldId]) {
                worldInfo = $game.worldInfo[worldId];
            } else {
                // Fetch world info if not already cached
                worldInfo = await getWorldInfo(worldId);
            }
            
            // Update the current world in the game store with info
            setCurrentWorld(worldId, worldInfo);
            
            // Initialize the map with world ID and seed
            setup({ 
                seed: worldInfo.seed || 454232, 
                world: worldId 
            });
            
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
            goto('/worlds');
            return;
        }
        
        // Check if the worldId is in joined worlds
        if ($game.joinedWorlds.length > 0 && !$game.joinedWorlds.includes(worldId)) {
            // If we have joined worlds but this one isn't in the list, redirect
            // This prevents accessing worlds the user hasn't joined
            goto('/worlds');
            return;
        }
        
        initializeMap(worldId);
    });
    
    onDestroy(() => {
        if (browser) {
            document.body.classList.remove('map-page-active');
        }
    });
</script>

<div class="map" class:dragging={isDragging}>
    {#if loading}
        <div class="loading-overlay">
            <div class="loading-spinner"></div>
            <div>Loading world...</div>
        </div>
    {:else if error}
        <div class="error-overlay">
            <h3>Error</h3>
            <p>{error}</p>
            <button on:click={() => goto('/worlds')}>Go to Worlds</button>
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