<script>
    import Grid from '../../components/map/Grid.svelte';
    import MiniMap from '../../components/map/MiniMap.svelte';
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

    const detailsProps = $derived({
        x: targetTileStore.x,
        y: targetTileStore.y,
        show: $mapState.showDetails,
        biomeName: targetTileStore.biome?.name
    });
</script>

<div class="map">
    <Grid />

    <Tutorial show={true} />

    <!-- Show either Legend or Details in the same position -->
    {#if $mapState.showDetails}
        <Details 
        x={targetTileStore.x}
        y={targetTileStore.y}
        terrain={detailsProps.biomeName}
        onClose={closeDetailsModal}
        />
    {:else}
        <Legend 
        x={targetTileStore.x} 
        y={targetTileStore.y}
        openDetails={openDetailsModal} 
        />
    {/if}

    <!-- Axes component should appear above the grid -->
    {#if $mapState.isReady}
        <Axes 
        xAxisArray={$xAxisArray}
        yAxisArray={$yAxisArray}
        cols={$mapState.cols}
        rows={$mapState.rows}
        />
    {/if}

    <MiniMap />
</div>

<style>
    .map {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100vh;
    }
</style>