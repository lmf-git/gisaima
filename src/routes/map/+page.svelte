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
        targetStore,
        setup,
        cleanupChunkSubscriptions
    } from "../../lib/stores/map.js";
    import { browser } from '$app/environment';
    import { onMount, onDestroy } from 'svelte';
    
    // Simplified derived state
    const isDragging = $derived($map.isDragging);
    
    // UI state management functions
    function toggleDetailsModal(show) {
        map.update(state => ({ ...state, showDetails: show }));
    }
    
    onMount(() => {
        if (browser) document.body.classList.add('map-page-active');
        setup();
    });
    
    onDestroy(() => {
        if (browser) {
            document.body.classList.remove('map-page-active');
            cleanupChunkSubscriptions();
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
            onClose={() => toggleDetailsModal(false)}
        />
    {:else}
        <Legend 
            x={$targetStore.x}  
            y={$targetStore.y}  
            openDetails={() => toggleDetailsModal(true)} 
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