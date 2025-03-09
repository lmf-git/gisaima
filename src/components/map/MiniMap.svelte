<script>
  import { mapState, getTerrainData } from '../../lib/stores/map.js';
  
  // Fixed dimensions for the minimap
  const MINI_TILE_SIZE_EM = 0.5;
  const MINIMAP_SIZE_EM = 15; // Fixed physical size
  const LOADING_THROTTLE = 200; // ms between minimap updates during interaction
  
  // Calculate how many tiles fit in our fixed minimap size
  const tileCount = $derived(Math.floor(MINIMAP_SIZE_EM / MINI_TILE_SIZE_EM));
  // Make it odd so we can center properly
  const viewRange = $derived(Math.floor(tileCount / 2));
  
  // Track visible area with default values
  let visibleArea = $state({
    startX: 0,
    startY: 0,
    width: 0,
    height: 0,
    centerX: 0,
    centerY: 0
  });
  
  // Track loading state
  let isLoading = $state(false);
  let loadingTimer = null;
  
  // Listen for grid updates from Grid component
  function setupGridViewListener() {
    document.addEventListener('gridViewChanged', (e) => {
      visibleArea = {
        startX: e.detail.centerX - Math.floor(e.detail.width / 2),
        startY: e.detail.centerY - Math.floor(e.detail.height / 2),
        width: e.detail.width,
        height: e.detail.height,
        centerX: e.detail.centerX,
        centerY: e.detail.centerY
      };
    });
    
    return () => document.removeEventListener('gridViewChanged', () => {});
  }
  
  // Run once on component mount
  let cleanup = null;
  $effect(() => {
    cleanup = setupGridViewListener();
    return cleanup;
  });
  
  // Simple direct grid generation - only generate what we need
  let minimapGrid = $state([]);
  let lastUpdateTime = 0;
  
  function generateMinimapGrid() {
    if (!$mapState.isReady) return [];
    
    isLoading = true;
    const now = Date.now();
    
    // Throttle updates during drag or other operations
    if (now - lastUpdateTime < LOADING_THROTTLE && $mapState.isDragging) {
      if (loadingTimer) clearTimeout(loadingTimer);
      loadingTimer = setTimeout(() => generateMinimapGrid(), LOADING_THROTTLE);
      return minimapGrid; // Return existing grid while loading
    }
    
    const result = [];
    const centerX = $mapState.targetCoord.x;
    const centerY = $mapState.targetCoord.y;
    
    try {
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
      
      lastUpdateTime = now;
      minimapGrid = result;
    } catch (error) {
      console.error("Error generating minimap grid:", error);
    } finally {
      isLoading = false;
    }
    
    return result;
  }
  
  // Update grid when map state changes - with better dependency tracking
  $effect(() => {
    const { targetCoord } = $mapState;
    
    if ($mapState.isReady && (targetCoord.x !== undefined)) {
      generateMinimapGrid();
    }
  });

  // Allow clicking and keyboard navigation on the minimap
  function handleMinimapClick(event) {
    if (!$mapState.isReady) return;
    
    const minimapRect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - minimapRect.left;
    const clickY = event.clientY - minimapRect.top;
    
    // Calculate coordinate in minimap tiles
    const tileX = Math.floor(clickX / (MINI_TILE_SIZE_EM * 16)); // 16 is approx. 1em in px
    const tileY = Math.floor(clickY / (MINI_TILE_SIZE_EM * 16));
    
    navigateToPosition(tileX, tileY);
    
    // Prevent default to avoid interfering with grid events
    event.stopPropagation();
  }

  // Add keyboard event handler for accessibility
  function handleKeyDown(event) {
    if (!$mapState.isReady) return;
    
    if (event.key === 'Enter' || event.key === ' ') {
      // For Enter or Space keys, navigate to center or handle focus
      event.preventDefault();
      
      // Since we can't directly get cursor position with keyboard,
      // use the center of the current visible area as reference
      const centerTileX = Math.floor(tileCount / 2);
      const centerTileY = Math.floor(tileCount / 2);
      
      navigateToPosition(centerTileX, centerTileY);
    }
  }
  
  // Helper function to navigate to a position on the minimap
  function navigateToPosition(tileX, tileY) {
    // Convert to world coordinates
    const worldX = $mapState.targetCoord.x - viewRange + tileX;
    const worldY = $mapState.targetCoord.y - viewRange + tileY;
    
    // Update the map target coordinate
    mapState.update(state => ({
      ...state,
      targetCoord: { x: worldX, y: worldY },
      offsetX: state.centerX + worldX,
      offsetY: state.centerY + worldY
    }));
  }
</script>

<div class="minimap-container">
  <div 
    class="minimap" 
    style="width: {MINIMAP_SIZE_EM}em; height: {MINIMAP_SIZE_EM}em;"
    onclick={handleMinimapClick}
    onkeydown={handleKeyDown}
    class:loading={isLoading}
    tabindex="0"
    role="button"
    aria-label="Mini map for navigation"
  >
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
      
      <!-- Visible area indicator frame -->
      <div 
        class="visible-area-frame"
        style="
          left: {(viewRange + visibleArea.startX - $mapState.targetCoord.x) * MINI_TILE_SIZE_EM}em;
          top: {(viewRange + visibleArea.startY - $mapState.targetCoord.y) * MINI_TILE_SIZE_EM}em;
          width: {visibleArea.width * MINI_TILE_SIZE_EM}em;
          height: {visibleArea.height * MINI_TILE_SIZE_EM}em;
        "
        aria-hidden="true"
      ></div>
    {/if}
    
    <!-- Loading indicator -->
    {#if isLoading}
      <div class="loading-indicator" aria-hidden="true"></div>
    {/if}
  </div>
</div>

<style>
  .minimap-container {
    position: absolute;
    bottom: 4em;
    right: 1.5em;
    z-index: 1000;
    border-radius: 4px;
    overflow: hidden;
    box-shadow: 0 3px 10px rgba(0,0,0,0.4);
  }
  
  .minimap {
    position: relative;
    overflow: hidden;
    background-color: rgba(0,0,0,0.2);
    border: 1px solid rgba(255,255,255,0.2);
    cursor: pointer;
    transition: transform 0.2s ease;
    outline: none; /* Remove default focus outline */
  }
  
  .minimap:hover {
    transform: scale(1.02);
  }
  
  .minimap.loading {
    opacity: 0.8;
  }
  
  /* Add custom focus styles for accessibility */
  .minimap:focus {
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.5);
    transform: scale(1.02);
  }
  
  .mini-tile {
    position: absolute;
    box-sizing: border-box;
    transition: filter 0.1s ease;
  }
  
  .mini-tile.center {
    z-index: 3;
    box-shadow: 0 0 0.15em rgba(255, 255, 255, 0.9);
  }
  
  .mini-tile.visible {
    filter: brightness(1.3);
    z-index: 2;
  }
  
  .visible-area-frame {
    position: absolute;
    border: 2px solid white;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.5);
    pointer-events: none;
    z-index: 4;
  }
  
  .loading-indicator {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 20px;
    height: 20px;
    margin: -10px 0 0 -10px;
    border: 3px solid rgba(255,255,255,0.3);
    border-radius: 50%;
    border-top-color: white;
    animation: spin 1s linear infinite;
    z-index: 5;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>