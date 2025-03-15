<script>
    import Grid from '../../components/map/Grid.svelte';
    import Minimap from '../../components/map/Minimap.svelte';
    import Axes from '../../components/map/Axes.svelte';
    import Legend from '../../components/map/Legend.svelte';
    import Details from '../../components/map/Details.svelte';
    import Tutorial from '../../components/map/Tutorial.svelte';
    import { 
        map, 
        mapReady,
        targetStore, // Renamed from centerTileStore
        setup
    } from "../../lib/stores/map.js";
    import { get } from 'svelte/store';
    
    const isDragging = $derived($map.isDragging);
    
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    
    // UI state management functions
    function openDetailsModal() {
        map.update(state => ({
            ...state,
            showDetails: true
        }));
    }
    
    function closeDetailsModal() {
        map.update(state => ({
            ...state,
            showDetails: false
        }));
    }
    
    // Add locally implemented cleanupInternalIntervals function
    function cleanupInternalIntervals() {
      try {
        const state = get(map);
        
        if (state.keyboardNavigationInterval) {
          clearInterval(state.keyboardNavigationInterval);
          map.update(state => ({ ...state, keyboardNavigationInterval: null }));
        }
        
        return true;
      } catch (err) {
        console.error("Error cleaning up intervals:", err);
        return false;
      }
    }
    
    onMount(() => {
        if (browser) document.body.classList.add('map-page-active');
        setup(); // Call setup once when the page loads to initialize the map
    });
    
    onDestroy(() => {
        if (browser) {
            document.body.classList.remove('map-page-active');
            cleanupInternalIntervals(); // Now using local function
        }
    });
</script>

<div class="map" class:dragging={isDragging}>
    <Grid />
    <Minimap />

    {#if $map.showDetails}
        <Details 
        x={$targetStore.x} 
        y={$targetStore.y} 
        terrain={$targetStore.biome?.name} 
        onClose={closeDetailsModal}
        />
    {:else}
        <Legend 
        x={$targetStore.x}  
        y={$targetStore.y}  
        openDetails={openDetailsModal} 
        />
    {/if}

    {#if $mapReady}
        <Axes />
    {/if}

    <Tutorial />
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
</style>