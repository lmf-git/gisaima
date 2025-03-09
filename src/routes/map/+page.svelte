<script>
    import Grid from '../../components/map/Grid.svelte';
    import Minimap from '../../components/map/Minimap.svelte';
    import { TerrainGenerator } from '../../lib/map/noise.js';
    
    // Initialize the terrain generator at the page level
    const WORLD_SEED = 532534;

    // IMPROVED: Memoize terrain data to reduce recalculations during HMR
    if (!globalThis.cachedTerrainGenerator || globalThis.cachedWorldSeed !== WORLD_SEED) {
        globalThis.cachedTerrainGenerator = new TerrainGenerator(WORLD_SEED);
        globalThis.cachedWorldSeed = WORLD_SEED;
        console.log("Created new terrain generator");
    }
    const terrain = globalThis.cachedTerrainGenerator;
    
    // Create a shared terrain cache at the page level - use existing cache during HMR if available
    const terrainCache = globalThis.persistentTerrainCache || new Map();
    if (!globalThis.persistentTerrainCache) {
        globalThis.persistentTerrainCache = terrainCache;
    }
    
    // Shared target coordinate state
    let targetCoord = { x: 0, y: 0 };
    let minimapVisible = true;
    let minimapPosition = "top-right";
    let mainViewportSize = { cols: 0, rows: 0 };
    
    // Handle position changes with consistent precision - FIXED
    function handlePositionChange(event) {
        // ENHANCED debugging
        console.log(`Position change received at Page:`, event.detail);
        
        // Ensure consistent coordinate handling
        const newCoords = { 
            x: Math.floor(event.detail.x), 
            y: Math.floor(event.detail.y)
        };
        
        // Update the shared target coordinates
        targetCoord = newCoords;
        console.log(`Page updated targetCoord to:`, targetCoord);
    }
    
    // Update viewport size from grid
    function handleViewportSizeChange(event) {
        mainViewportSize = event.detail;
    }
    
    // Toggle minimap visibility
    function toggleMinimap() {
        minimapVisible = !minimapVisible;
    }
    
    // Handle minimap close
    function handleMinimapClose() {
        minimapVisible = false;
    }

    // ENHANCED: Handle keyboard shortcuts for map navigation
    function handleKeydown(e) {
        // Toggle minimap with 'M' key
        if (e.key === 'm' && !e.repeat) {
            toggleMinimap();
        }
        
        // Add other keyboard shortcuts here as needed
    }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="mappage">
    <Grid 
        {terrain}
        {terrainCache}
        bind:targetCoord
        on:positionchange={handlePositionChange}
        on:viewportsizechange={handleViewportSizeChange}
    />
    
    {#if minimapVisible}
        <Minimap 
            {terrain}
            {terrainCache}
            bind:targetCoord
            {mainViewportSize}
            position={minimapPosition}
            size="20%"
            on:positionchange={handlePositionChange}
            on:close={handleMinimapClose}
        />
    {/if}
</div>

<style>
    .mappage {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100vh;
    }
</style>