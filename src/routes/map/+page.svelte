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
        targetTileStore
    } from "../../lib/stores/map.js";
    
    // Add reactive variable to track if any drag is happening
    const isDragging = $derived($mapState.isDragging);
    
    // Add onMount to apply body styles only when this page is active
    import { onMount, onDestroy } from 'svelte';
    
    // Apply map-specific body styles when component mounts
    onMount(() => document.body.classList.add('map-page-active'));
    
    // Remove map-specific body styles when component is destroyed
    onDestroy(() => document.body.classList.remove('map-page-active'));
</script>

<div class="map" class:dragging={isDragging}>
    <Grid />
    <Minimap />

    <!-- Show either Legend or Details in the same position -->
    {#if $mapState.showDetails}
        <Details 
        x={$targetTileStore.x}
        y={$targetTileStore.y}
        terrain={$targetTileStore.biome?.name}
        onClose={closeDetailsModal}
        />
    {:else}
        <Legend 
        x={$targetTileStore.x} 
        y={$targetTileStore.y}
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
    
    /* Prevent any scrolling of the page when dragging is active */
    .map.dragging {
        overflow: hidden;
        touch-action: none;
    }
    
    /* Apply map-specific body styles using a global selector, 
       but only when the map-page-active class is present */
    :global(body.map-page-active) {
        overscroll-behavior: none;
        overflow: hidden;
        position: fixed;
        width: 100%;
        height: 100%;
    }
</style>