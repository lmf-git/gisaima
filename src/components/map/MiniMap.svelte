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
  let area = $state({
    startX: 0,
    startY: 0,
    width: 0,
    height: 0,
    centerX: 0,
    centerY: 0
  });
  
  // Track loading state
  let isLoad = $state(false);
  let loadTimer = null;
  
  // Add minimap drag state tracking - MOVED UP to define before use
  let isDrag = $state(false);
  let dragX = $state(0);
  let dragY = $state(0);
  let map;
  
  // Add tracking for drag vs click distinction
  let wasDrag = $state(false);
  let dist = $state(0);
  const DRAG_THRESHOLD = 5; // Minimum pixels to consider as a drag
  
  // Listen for grid updates from Grid component
  function setupGridViewListener() {
    document.addEventListener('gridViewChanged', (e) => {
      area = {
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
    
    isLoad = true;
    const now = Date.now();
    
    // Throttle updates during drag or other operations
    if (now - lastUpdateTime < LOADING_THROTTLE && $mapState.isDragging) {
      if (loadTimer) clearTimeout(loadTimer);
      loadTimer = setTimeout(() => generateMinimapGrid(), LOADING_THROTTLE);
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
            globalX >= area.startX && 
            globalX < area.startX + area.width &&
            globalY >= area.startY && 
            globalY < area.startY + area.height;
          
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
      isLoad = false;
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
    if (wasDrag || !$mapState.isReady) {
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

  // Check if any movement/dragging is happening - now isMinimapDragging is defined
  const isAnyMovementActive = $derived(
    $mapState.isDragging || 
    $mapState.keyboardNavigationInterval !== null || 
    isDrag
  );

  // Improved hover handler for minimap tiles
  function handleMiniTileHover(cell) {
    if (isAnyMovementActive) {
      // Clear any hover state immediately when moving
      if (localHoveredTile) localHoveredTile = null;
      clearHoveredTile();
      return;
    }
    
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
  
  function handleMiniTileLeave() {
    if (isAnyMovementActive) {
      // When moving, clear state immediately
      localHoveredTile = null;
      clearHoveredTile();
      return;
    }
    
    // Use timeout for global state but keep local state a bit longer
    clearHoverTimeout = setTimeout(() => {
      clearHoveredTile();
      localHoveredTile = null;
    }, 100); // Longer delay to prevent flickering
  }
  
  // Enhanced tile hover check that uses both global and local state
  const isTileHovered = (cell) => {
    // Never show hover effects when any movement is happening
    if (isAnyMovementActive) return false;
    
    // Check local state first for immediate feedback
    if (localHoveredTile && cell.x === localHoveredTile.x && cell.y === localHoveredTile.y) {
      return true;
    }
    
    // Fall back to global state
    return !isAnyMovementActive && $mapState.hoveredTile && 
           cell.x === $mapState.hoveredTile.x && 
           cell.y === $mapState.hoveredTile.y;
  };
  
  // Clear hover state when movement begins
  $effect(() => {
    if (isAnyMovementActive && (localHoveredTile || $mapState.hoveredTile)) {
      localHoveredTile = null;
      clearHoveredTile();
    }
  });

  // Clean up timeout on component destroy
  $effect(() => {
    return () => {
      if (clearHoverTimeout) {
        clearTimeout(clearHoverTimeout);
      }
    };
  });

  // Handle minimap drag start - leave this function in its original position
  function handleMinimapDragStart(event) {
    if (event.button !== 0 || !$mapState.isReady) return;
    
    // Clear hover states immediately
    localHoveredTile = null;
    clearHoveredTile();
    
    // Capture starting positions
    isDrag = true;
    dragX = event.clientX;
    dragY = event.clientY;
    dist = 0;
    wasDrag = false; // Reset at start of potential new drag
    
    // Visual feedback
    if (map) {
      map.style.cursor = "grabbing";
      map.classList.add("dragging");
    }
    
    event.preventDefault();
  }
  
  // Handle minimap drag movement
  function handleMinimapDrag(event) {
    if (!isDrag || !$mapState.isReady) return;
    
    // Calculate drag deltas
    const deltaX = event.clientX - dragX;
    const deltaY = event.clientY - dragY;
    
    // Track total drag distance to distinguish drag from click
    dist += Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // If we've moved past threshold, mark as a drag operation
    if (dist > DRAG_THRESHOLD) {
      wasDrag = true;
    }
    
    // Get minimap dimensions for scaling
    const minimapRect = map.getBoundingClientRect();
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
    dragX = event.clientX;
    dragY = event.clientY;
  }
  
  // Handle minimap drag end
  function handleMinimapDragEnd() {
    if (!isDrag) return;
    
    isDrag = false;
    
    // Visual feedback
    if (map) {
      map.style.cursor = "grab";
      map.classList.remove("dragging");
    }
    
    // Don't reset wasDragging here - it needs to persist until click is processed
    // It will be automatically cleared on the next mousedown
  }
  
  // Global mouse handlers for reliable drag ending
  function globalMinimapMouseUp() {
    if (isDrag) {
      handleMinimapDragEnd();
    }
  }
  
  function globalMinimapMouseMove(event) {
    if (isDrag) {
      handleMinimapDrag(event);
    }
  }
</script>

<svelte:window
  onmouseup={globalMinimapMouseUp}
  onmousemove={globalMinimapMouseMove}
  onmouseleave={globalMinimapMouseUp}
/>

<div class="map">
  <div 
    class="mini" 
    style="width: {MINIMAP_WIDTH_EM}em; height: {MINIMAP_HEIGHT_EM}em;"
    bind:this={map}
    onclick={handleMinimapClick}
    onmousedown={handleMinimapDragStart}
    onkeydown={handleKeyDown}
    tabindex="0"
    role="button"
    aria-label="Mini map for navigation"
    class:drag={isDrag}
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
          left: {(viewRangeX + area.startX - $mapState.targetCoord.x) * MINI_TILE_SIZE_EM}em;
          top: {(viewRangeY + area.startY - $mapState.targetCoord.y) * MINI_TILE_SIZE_EM}em;
          width: {area.width * MINI_TILE_SIZE_EM}em;
          height: {area.height * MINI_TILE_SIZE_EM}em;
        "
        aria-hidden="true"
      ></div>
    {/if}
    
    <!-- Remove loading indicator -->
  </div>
</div>

<style>
  .map {
    position: absolute;
    bottom: 4em;
    right: 1.5em;
    z-index: 1000;
    border-radius: 4px;
    overflow: hidden;
    box-shadow: 0 3px 10px rgba(0,0,0,0.4);
  }
  
  .mini {
    position: relative;
    overflow: hidden;
    background: rgba(0,0,0,0.2);
    border: 1px solid rgba(255,255,255,0.2);
    cursor: grab;
    transition: box-shadow 0.2s ease;
    outline: none;
  }
  
  .mini:hover {
    box-shadow: 0 0.15em 0.3em rgba(0,0,0,0.6);
  }
  
  .mini:focus {
    box-shadow: 0 0 0 0.2em rgba(255, 255, 255, 0.5);
  }
  
  .mini-tile {
    position: absolute;
    box-sizing: border-box;
    transition: background-color 0.2s ease;
  }
  
  .mini-tile.center {
    z-index: 3;
    background-color: rgba(255, 255, 255, 0.7) !important;
  }
  
  .mini-tile.visible {
    z-index: 2;
  }
  
  .mini-tile.hovered {
    z-index: 4;
    background-color: rgba(255, 255, 255, 0.7) !important;
  }
  
  .mini.drag {
    cursor: grabbing;
  }

  .visible-area-frame {
    position: absolute;
    border: 0.125em solid white;
    box-shadow: 0 0 0 0.0625em rgba(0,0,0,0.5);
    pointer-events: none;
    z-index: 4;
  }
</style>