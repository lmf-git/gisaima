<script>
    import Grid from '../../components/map/Grid.svelte';
</script>

<!-- TODO: 
    Control should be moved here grid/minimap pretty similar controls,
    Legend/Tutorial/Etc should be here instead of in Grid to lessen complexity of Grid
-->

<div class="map">
    <Grid />
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