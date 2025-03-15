<script>
    import Grid from '../../components/map/Grid.svelte';
    import Minimap from '../../components/map/Minimap.svelte';
    import Axes from '../../components/map/Axes.svelte';
    import Legend from '../../components/map/Legend.svelte';
    import Details from '../../components/map/Details.svelte';
    import Tutorial from '../../components/map/Tutorial.svelte';
    import { 
        map, 
        ready,
        targetStore,
        setup
    } from "../../lib/stores/map.js";
    import { browser } from '$app/environment';
    import { onMount, onDestroy } from 'svelte';
    
    // Use $state for local component state
    let detailed = $state(false);
    
    // Could set a different seed from URL parameters or other sources
    let seed = $state(454232);
    
    // Simplified derived state
    const isDragging = $derived($map.isDragging);
    
    // Updated UI state management function
    function toggleDetailsModal(show) {
        detailed = show;
    }
    
    onMount(() => {
        if (browser) document.body.classList.add('map-page-active');
        
        // Pass the seed to setup
        setup({ seed });
    });
    
    onDestroy(() => {
        if (browser) {
            document.body.classList.remove('map-page-active');
        }
    });
</script>

<div class="map" class:dragging={isDragging}>
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