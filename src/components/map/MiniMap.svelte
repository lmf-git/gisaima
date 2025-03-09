<script>
  import { mapState, getTerrainData } from '../../lib/stores/map.js';
  
  // Fixed dimensions for the minimap
  const MINI_TILE_SIZE_EM = 0.5;
  const MINIMAP_SIZE_EM = 15; // Fixed physical size
  
  // Calculate how many tiles fit in our fixed minimap size
  const tileCount = $derived(Math.floor(MINIMAP_SIZE_EM / MINI_TILE_SIZE_EM));
  // Make it odd so we can center properly
  const viewRange = $derived(Math.floor(tileCount / 2));
  
  // Calculate the visible area in the main grid
  const visibleArea = $derived({
    startX: $mapState.targetCoord.x - Math.floor($mapState.cols / 2),
    startY: $mapState.targetCoord.y - Math.floor($mapState.rows / 2),
    width: $mapState.cols,
    height: $mapState.rows
  });
  
  // Simple direct grid generation - only generate what we need
  let minimapGrid = $state([]);
  
  function generateMinimapGrid() {
    if (!$mapState.isReady) return [];
    
    const result = [];
    const centerX = $mapState.targetCoord.x;
    const centerY = $mapState.targetCoord.y;
    
    // Only generate the exact tiles needed for the minimap
    for (let y = -viewRange; y <= viewRange; y++) {
      for (let x = -viewRange; x <= viewRange; x++) {
        const globalX = centerX + x;
        const globalY = centerY + y;
        const terrainData = getTerrainData(globalX, globalY);
        
        // Is this cell in the visible area?
        const isVisible = 
          globalX >= visibleArea.startX && 
          globalX < visibleArea.startX + visibleArea.width &&
          globalY >= visibleArea.startY && 
          globalY < visibleArea.startY + visibleArea.height;
        
        const isCenter = x === 0 && y === 0;
        
        result.push({
          x: globalX,
          y: globalY,
          displayX: x + viewRange,
          displayY: y + viewRange,
          isCenter,
          isVisible,
          color: terrainData.color
        });
      }
    }
    
    return result;
  }
  
  // Update grid when map state changes
  $effect(() => {
    if ($mapState.isReady) {
      minimapGrid = generateMinimapGrid();
    }
  });
</script>

<div class="minimap-container">
  <div class="minimap" style="width: {MINIMAP_SIZE_EM}em; height: {MINIMAP_SIZE_EM}em;">
    {#if $mapState.isReady && minimapGrid.length > 0}
      {#each minimapGrid as cell}
        <div
          class="mini-tile"
          class:center={cell.isCenter}
          class:visible={cell.isVisible}
          style="
            background-color: {cell.color};
            width: {MINI_TILE_SIZE_EM}em;
            height: {MINI_TILE_SIZE_EM}em;
            left: {cell.displayX * MINI_TILE_SIZE_EM}em;
            top: {cell.displayY * MINI_TILE_SIZE_EM}em;
          "
        ></div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .minimap-container {
    position: absolute;
    bottom: 1.5em;
    right: 1.5em;
    z-index: 1000;
    /* Removed padding, background-color, and border-radius */
  }
  
  .minimap {
    position: relative;
    overflow: hidden;
    /* Removed border-radius */
    background-color: transparent;
  }
  
  .mini-tile {
    position: absolute;
    box-sizing: border-box;
  }
  
  .mini-tile.center {
    z-index: 3;
    box-shadow: 0 0 0.15em rgba(255, 255, 255, 0.9);
  }
  
  .mini-tile.visible {
    filter: brightness(1.3);
    /* Removed inset box shadow for cleaner look */
    z-index: 2;
  }
</style>