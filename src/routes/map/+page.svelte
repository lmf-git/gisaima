<script>
    import Grid from '../../components/map/Grid.svelte';
    import Minimap from '../../components/map/Minimap.svelte';
    import { TerrainGenerator } from '../../lib/map/noise.js';
    import { onDestroy } from 'svelte';
    import { getTerrainCache } from '../../lib/map/minimapcontrols.js';
    
    // Centralized state management using $state
    const state = $state({
        // Target location and coordinate tracking
        targetCoord: { x: 0, y: 0 },
        highlightedCoord: null,
        
        // Map configuration
        minimapVisible: true,
        minimapPosition: "top-right",
        detailsVisible: false,
        
        // Viewport data
        mainViewportSize: { 
            cols: 0, 
            rows: 0,
            visibleLeft: 0,
            visibleRight: 0,
            visibleTop: 0,
            visibleBottom: 0,
            centerX: 0,
            centerY: 0,
            worldWidth: 0,
            worldHeight: 0
        },
        
        // Cache for currently viewed terrain
        currentTileData: null
    });
    
    // Initialize the terrain generator at the page level
    const WORLD_SEED = 532534;

    // IMPROVED: Memoize terrain data to reduce recalculations during HMR
    if (!globalThis.cachedTerrainGenerator || globalThis.cachedWorldSeed !== WORLD_SEED) {
        globalThis.cachedTerrainGenerator = new TerrainGenerator(WORLD_SEED);
        globalThis.cachedWorldSeed = WORLD_SEED;
        console.log("Created new terrain generator");
    }
    
    // Share the terrain generator with all components via props
    const terrain = globalThis.cachedTerrainGenerator;
    
    // Use the centralized terrain cache
    const terrainCache = getTerrainCache();
    
    // OPTIMIZED: Move terrain data pre-caching to page level
    function getCachedTerrainData(x, y) {
        const intX = Math.floor(x);
        const intY = Math.floor(y);
        const key = `${intX},${intY}`;
        
        if (terrainCache.has(key)) {
            return terrainCache.get(key);
        }
        
        const terrainData = terrain.getTerrainData(intX, intY);
        
        const stableData = {
            biome: {
                ...terrainData.biome,
                displayName: terrainData.biome.displayName || 
                    terrainData.biome.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
            },
            color: terrainData.color,
            height: terrainData.height,
            moisture: terrainData.moisture,
            continent: terrainData.continent,
            riverValue: terrainData.riverValue,
            lakeValue: terrainData.lakeValue,
            slope: terrainData.slope
        };
        
        terrainCache.set(key, stableData);
        return stableData;
    }
    
    // Update current tile data when position changes
    function updateCurrentTileData() {
        if (!state.targetCoord) return;
        
        const intX = Math.floor(state.targetCoord.x);
        const intY = Math.floor(state.targetCoord.y);
        
        state.currentTileData = getCachedTerrainData(intX, intY);
    }
    
    // IMPROVED: Single position change handler used by both components
    function handlePositionChange(event) {
        const intX = Math.floor(event.detail.x);
        const intY = Math.floor(event.detail.y);
        
        // Pre-cache terrain data for new position
        getCachedTerrainData(intX, intY);
        
        // Update target coordinates
        state.targetCoord = { x: intX, y: intY };
        
        // Reset highlight when position changes
        state.highlightedCoord = null;
        
        // Update current tile data for details panel
        updateCurrentTileData();
    }
    
    function handleTileHighlight(event) {
        state.highlightedCoord = event.detail || null;
    }
    
    function handleViewportSizeChange(event) {
        // Update viewport data
        state.mainViewportSize = {
            cols: event.detail.cols || 0,
            rows: event.detail.rows || 0,
            visibleLeft: event.detail.visibleLeft,
            visibleRight: event.detail.visibleRight,
            visibleTop: event.detail.visibleTop,
            visibleBottom: event.detail.visibleBottom,
            centerX: event.detail.centerX,
            centerY: event.detail.centerY,
            worldWidth: (event.detail.visibleRight - event.detail.visibleLeft + 1),
            worldHeight: (event.detail.visibleBottom - event.detail.visibleTop + 1),
        };
    }
    
    // UI state management
    function toggleMinimap() {
        state.minimapVisible = !state.minimapVisible;
    }
    
    function handleMinimapClose() {
        state.minimapVisible = false;
    }
    
    function handleDetailsChange(value) {
        state.detailsVisible = value;
    }
    
    function openDetails() {
        updateCurrentTileData();
        state.detailsVisible = true;
    }

    function handleKeydown(e) {
        if (e.key === 'm' && !e.repeat) {
            toggleMinimap();
        }
    }

    // Memory management
    onDestroy(() => {
        if (terrainCache.size > 10000) {
            console.log(`Clearing terrain cache with ${terrainCache.size} entries`);
            terrainCache.clear();
        }
    });
    
    // Initial data fetch
    updateCurrentTileData();
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="mappage">
    <Grid 
        {terrain}
        {terrainCache}
        targetCoord={state.targetCoord}
        highlightedCoord={state.highlightedCoord}
        on:positionchange={handlePositionChange}
        on:viewportsizechange={handleViewportSizeChange}
        on:tilehighlight={handleTileHighlight}
        {openDetails}
        detailsVisible={state.detailsVisible}
        onDetailsChange={handleDetailsChange}
    />
    
    {#if state.minimapVisible}
        <Minimap 
            {terrain}
            {terrainCache}
            targetCoord={state.targetCoord}
            highlightedCoord={state.highlightedCoord}
            mainViewportSize={state.mainViewportSize}
            position={state.minimapPosition}
            size="20%"
            on:positionchange={handlePositionChange}
            on:tilehighlight={handleTileHighlight}
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