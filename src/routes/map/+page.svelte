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
</script>

<div class="map">
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
</style>