<script>
  import { mapState, getTerrainData, updateHoveredTile, clearHoveredTile } from '../../lib/stores/map.js';
  
  // Fixed dimensions for the minimap - change to rectangular shape
  const MINI_TILE_SIZE_EM = 0.5;
  const MINIMAP_WIDTH_EM = 18; // Increased width for rectangular shape
  const MINIMAP_HEIGHT_EM = 12; // Keep height smaller than width
  const LOADING_THROTTLE = 200; // ms between minimap updates during interaction
  
  // Calculate how many tiles fit in our minimap dimensions
  const tileCountX = $derived(Math.floor(MINIMAP_WIDTH_EM / MINI_TILE_SIZE_EM));
  const tileCountY = $derived(Math.floor(MINIMAP_HEIGHT_EM / MINI_TILE_SIZE_EM));
  
  // Make them odd so we can center properly
  const viewRangeX = $derived(Math.floor(tileCountX / 2));
  const viewRangeY = $derived(Math.floor(tileCountY / 2));
  
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
      for (let y = -viewRangeY; y <= viewRangeY; y++) {
        for (let x = -viewRangeX; x <= viewRangeX; x++) {
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
            displayX: x + viewRangeX,
            displayY: y + viewRangeY,
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
    // Skip click handling if we were dragging or map isn't ready
    if (wasDragging || !$mapState.isReady) {
      event.stopPropagation();
      return;
    }
    
    const minimapRect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - minimapRect.left;
    const clickY = event.clientY - minimapRect.top;
    
    // Calculate coordinate in minimap tiles
    // Use relative units rather than hardcoded pixel approximation
    const tileX = Math.floor(clickX / (minimapRect.width / tileCountX));
    const tileY = Math.floor(clickY / (minimapRect.height / tileCountY));
    
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
      const centerTileX = Math.floor(tileCountX / 2);
      const centerTileY = Math.floor(tileCountY / 2);
      
      navigateToPosition(centerTileX, centerTileY);
    }
  }
  
  // Helper function to navigate to a position on the minimap
  function navigateToPosition(tileX, tileY) {
    // Convert to world coordinates
    const worldX = $mapState.targetCoord.x - viewRangeX + tileX;
    const worldY = $mapState.targetCoord.y - viewRangeY + tileY;
    
    // Update the map target coordinate
    mapState.update(state => ({
      ...state,
      targetCoord: { x: worldX, y: worldY },
      offsetX: state.centerX + worldX,
      offsetY: state.centerY + worldY
    }));
  }

  // Track hover state locally to prevent flickering
  let localHoveredTile = $state(null);
  let clearHoverTimeout = null;

  // Improved hover handler for minimap tiles
  function handleMiniTileHover(cell) {
    if (!$mapState.isDragging) {
      // Clear any pending timeouts
      if (clearHoverTimeout) {
        clearTimeout(clearHoverTimeout);
        clearHoverTimeout = null;
      }
      
      // Update local state immediately
      localHoveredTile = { x: cell.x, y: cell.y };
      
      // Update global state
      updateHoveredTile(cell.x, cell.y);
    }
  }
  
  function handleMiniTileLeave() {
    if (!$mapState.isDragging) {
      // Use timeout for global state but keep local state a bit longer
      clearHoverTimeout = setTimeout(() => {
        clearHoveredTile();
        localHoveredTile = null;
      }, 100); // Longer delay to prevent flickering
    }
  }
  
  // Enhanced tile hover check that uses both global and local state
  const isTileHovered = (cell) => {
    // Check local state first for immediate feedback
    if (localHoveredTile && cell.x === localHoveredTile.x && cell.y === localHoveredTile.y) {
      return true;
    }
    
    // Fall back to global state
    return $mapState.hoveredTile && 
           cell.x === $mapState.hoveredTile.x && 
           cell.y === $mapState.hoveredTile.y;
  };
  
  // Clean up timeout on component destroy
  $effect(() => {
    return () => {
      if (clearHoverTimeout) {
        clearTimeout(clearHoverTimeout);
      }
    };
  });

  // Add minimap drag state tracking
  let isMinimapDragging = $state(false);
  let dragStartX = $state(0);
  let dragStartY = $state(0);
  let minimapElement;
  
  // Add tracking for drag vs click distinction
  let wasDragging = $state(false);
  let dragDistance = $state(0);
  const DRAG_THRESHOLD = 5; // Minimum pixels to consider as a drag
  
  // Handle minimap drag start
  function handleMinimapDragStart(event) {
    if (event.button !== 0 || !$mapState.isReady) return;
    
    // Capture starting positions
    isMinimapDragging = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragDistance = 0;
    wasDragging = false; // Reset at start of potential new drag
    
    // Visual feedback
    if (minimapElement) {
      minimapElement.style.cursor = "grabbing";
      minimapElement.classList.add("dragging");
    }
    
    event.preventDefault();
  }
  
  // Handle minimap drag movement
  function handleMinimapDrag(event) {
    if (!isMinimapDragging || !$mapState.isReady) return;
    
    // Calculate drag deltas
    const deltaX = event.clientX - dragStartX;
    const deltaY = event.clientY - dragStartY;
    
    // Track total drag distance to distinguish drag from click
    dragDistance += Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // If we've moved past threshold, mark as a drag operation
    if (dragDistance > DRAG_THRESHOLD) {
      wasDragging = true;
    }
    
    // Get minimap dimensions for scaling
    const minimapRect = minimapElement.getBoundingClientRect();
    const pixelsPerTileX = minimapRect.width / tileCountX;
    const pixelsPerTileY = minimapRect.height / tileCountY;
    
    // Calculate world cells moved
    const cellsMovedX = Math.round(deltaX / pixelsPerTileX);
    const cellsMovedY = Math.round(deltaY / pixelsPerTileY);
    
    // Only update if we've moved at least one cell
    if (cellsMovedX === 0 && cellsMovedY === 0) return;
    
    // Update map position (opposite direction of drag)
    const newTargetX = $mapState.targetCoord.x - cellsMovedX;
    const newTargetY = $mapState.targetCoord.y - cellsMovedY;
    
    // Update map state
    mapState.update(state => ({
      ...state,
      targetCoord: { x: newTargetX, y: newTargetY },
      offsetX: state.centerX + newTargetX,
      offsetY: state.centerY + newTargetY
    }));
    
    // Update drag start positions for next movement
    dragStartX = event.clientX;
    dragStartY = event.clientY;
  }
  
  // Handle minimap drag end
  function handleMinimapDragEnd() {
    if (!isMinimapDragging) return;
    
    isMinimapDragging = false;
    
    // Visual feedback
    if (minimapElement) {
      minimapElement.style.cursor = "grab";
      minimapElement.classList.remove("dragging");
    }
    
    // Don't reset wasDragging here - it needs to persist until click is processed
    // It will be automatically cleared on the next mousedown
  }
  
  // Global mouse handlers for reliable drag ending
  function globalMinimapMouseUp() {
    if (isMinimapDragging) {
      handleMinimapDragEnd();
    }
  }
  
  function globalMinimapMouseMove(event) {
    if (isMinimapDragging) {
      handleMinimapDrag(event);
    }
  }
</script>

<svelte:window
  onmouseup={globalMinimapMouseUp}
  onmousemove={globalMinimapMouseMove}
  onmouseleave={globalMinimapMouseUp}
/>

<div class="minimap-container">
  <div 
    class="minimap" 
    style="width: {MINIMAP_WIDTH_EM}em; height: {MINIMAP_HEIGHT_EM}em;"
    bind:this={minimapElement}
    onclick={handleMinimapClick}
    onmousedown={handleMinimapDragStart}
    onkeydown={handleKeyDown}
    tabindex="0"
    role="button"
    aria-label="Mini map for navigation"
    class:dragging={isMinimapDragging}
  >
    {#if $mapState.isReady && minimapGrid.length > 0}
      {#each minimapGrid as cell}
        <div
          class="mini-tile"
          class:center={cell.isCenter}
          class:visible={cell.isVisible}
          class:hovered={isTileHovered(cell)}
          style="
            background-color: {cell.color};
            width: {MINI_TILE_SIZE_EM}em;
            height: {MINI_TILE_SIZE_EM}em;
            left: {cell.displayX * MINI_TILE_SIZE_EM}em;
            top: {cell.displayY * MINI_TILE_SIZE_EM}em;
          "
          onmouseenter={() => handleMiniTileHover(cell)}
          onmouseleave={handleMiniTileLeave}
          role="presentation"
          aria-hidden="true"
        ></div>
      {/each}
      
      <!-- Visible area indicator frame -->
      <div 
        class="visible-area-frame"
        style="
          left: {(viewRangeX + visibleArea.startX - $mapState.targetCoord.x) * MINI_TILE_SIZE_EM}em;
          top: {(viewRangeY + visibleArea.startY - $mapState.targetCoord.y) * MINI_TILE_SIZE_EM}em;
          width: {visibleArea.width * MINI_TILE_SIZE_EM}em;
          height: {visibleArea.height * MINI_TILE_SIZE_EM}em;
        "
        aria-hidden="true"
      ></div>
    {/if}
    
    <!-- Remove loading indicator -->
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
    cursor: grab; /* Default to grab cursor */
    transition: box-shadow 0.2s ease; /* Remove transform from transition */
    outline: none; /* Remove default focus outline */
  }
  
  .minimap:hover {
    /* Remove transform: scale(1.02) to keep consistent size */
    box-shadow: 0 0.15em 0.3em rgba(0,0,0,0.6); /* Add subtle shadow instead */
  }
  
  /* Add custom focus styles for accessibility */
  .minimap:focus {
    box-shadow: 0 0 0 0.2em rgba(255, 255, 255, 0.5);
    /* Remove transform: scale(1.02) */
  }
  
  .minimap.dragging {
    cursor: grabbing;
  }

  .mini-tile {
    position: absolute;
    box-sizing: border-box;
    transition: background-color 0.2s ease;
    /* Remove any transformations or filters that might cause glitches */
  }
  
  .mini-tile.center {
    z-index: 3;
    /* Make center tile use white background like hovered tiles */
    background-color: rgba(255, 255, 255, 0.7) !important;
  }
  
  .mini-tile.visible {
    /* Use a slight background overlay instead of filter */
    z-index: 2;
  }
  
  /* Replace brightness filter with background color change */
  .mini-tile.hovered {
    z-index: 4; /* Keep higher z-index */
    /* Add white overlay instead of brightness filter */
    background-color: rgba(255, 255, 255, 0.7) !important;
  }
  
  /* Remove any problematic ::after pseudo-elements */
  
  .visible-area-frame {
    position: absolute;
    border: 0.125em solid white; /* Changed from 2px to 0.125em */
    box-shadow: 0 0 0 0.0625em rgba(0,0,0,0.5); /* Changed from 1px to 0.0625em */
    pointer-events: none;
    z-index: 4;
  }
  
  /* Delete loading-indicator class and keyframes */

</style>