<script>
    import Grid from '../../components/map/Grid.svelte';
    import Minimap from '../../components/map/Minimap.svelte';
    import Axes from '../../components/map/Axes.svelte';
    import Legend from '../../components/map/Legend.svelte';
    import Details from '../../components/map/Details.svelte';
    import Tutorial from '../../components/map/Tutorial.svelte';
    import { 
        mapState, 
        xAxisArray, 
        yAxisArray,
        openDetailsModal,
        closeDetailsModal,
        centerTileStore,
        cleanupInternalIntervals
    } from "../../lib/stores/map.js";
    
    // Track drag state
    const isDragging = $derived($mapState.isDragging);
    
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    
    onMount(() => {
        if (browser) document.body.classList.add('map-page-active');
    });
    
    onDestroy(() => {
        if (browser) {
            document.body.classList.remove('map-page-active');
            cleanupInternalIntervals();
        }
    });
</script>

<div class="map" class:dragging={isDragging}>
    <Grid />
    <Minimap />

    {#if $mapState.showDetails}
        <Details 
        x={$centerTileStore.x}
        y={$centerTileStore.y}
        terrain={$centerTileStore.biome?.name}
        onClose={closeDetailsModal}
        />
    {:else}
        <Legend 
        x={$centerTileStore.x} 
        y={$centerTileStore.y}
        openDetails={openDetailsModal} 
        />
    {/if}

    {#if $mapState.isReady}
        <Axes 
        xAxisArray={$xAxisArray}
        yAxisArray={$yAxisArray}
        cols={$mapState.cols}
        rows={$mapState.rows}
        />
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