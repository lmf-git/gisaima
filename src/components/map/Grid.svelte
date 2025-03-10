<script>
  import { onMount } from "svelte";
  import Legend from "./Legend.svelte";
  import Axes from "./Axes.svelte";
  import Details from "./Details.svelte";
  import MiniMap from "./MiniMap.svelte";
  import Tutorial from "./Tutorial.svelte";

  import { 
    mapState, 
    gridArray, 
    xAxisArray, 
    yAxisArray,
    TILE_SIZE,
    DRAG_CHECK_INTERVAL,
    resizeMap,
    startDrag as startMapDrag,
    stopDrag as stopMapDrag,
    drag as dragMap,
    checkDragState,
    moveMapByKeys,
    openDetailsModal,
    closeDetailsModal,
    targetTileStore,
    updateHoveredTile,
    clearHoveredTile
  } from "../../lib/stores/map.js";
  
  // Local component state
  let mapElement = null;
  let resizeObserver = null;
  let dragStateCheckInterval = null;
  
  // Display settings
  const showAxisBars = true;
  
  // Initialize when mounted
  onMount(() => {
    // Setup resize observer
    resizeObserver = new ResizeObserver(() => resizeMap(mapElement));
    resizeObserver.observe(mapElement);
    resizeMap(mapElement);
    
    // Setup keyboard navigation
    const keyboardCleanup = setupKeyboardNavigation();
    
    // Setup drag state check interval
    dragStateCheckInterval = setInterval(checkDragState, DRAG_CHECK_INTERVAL);

    // Define cleanup function properly
    return function() {
      if (resizeObserver) resizeObserver.disconnect();
      if (keyboardCleanup) keyboardCleanup();
      if ($mapState.keyboardNavigationInterval) {
        clearInterval($mapState.keyboardNavigationInterval);
        mapState.update(state => ({...state, keyboardNavigationInterval: null}));
      }
      if (dragStateCheckInterval) clearInterval(dragStateCheckInterval);
    };
  });
  
  // Setup keyboard navigation with simplified handlers
  const setupKeyboardNavigation = () => {
    const keyHandler = event => {
      const key = event.key.toLowerCase();
      const isNavigationKey = ["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(key);
      
      if (!isNavigationKey) return;
      
      if (event.type === "keydown") {
        $mapState.keysPressed.add(key);
        
        if (!$mapState.keyboardNavigationInterval) {
          moveMapByKeys();
          $mapState.keyboardNavigationInterval = setInterval(moveMapByKeys, 200);
        }
        
        if (key.startsWith("arrow")) event.preventDefault();
      } else if (event.type === "keyup") {
        $mapState.keysPressed.delete(key);
        
        if ($mapState.keysPressed.size === 0 && $mapState.keyboardNavigationInterval) {
          clearInterval($mapState.keyboardNavigationInterval);
          $mapState.keyboardNavigationInterval = null;
        }
      }
    };
    
    window.addEventListener("keydown", keyHandler);
    window.addEventListener("keyup", keyHandler);
    
    return () => {
      window.removeEventListener("keydown", keyHandler);
      window.removeEventListener("keyup", keyHandler);
    };
  };

  // Simplified drag handlers
  const handleStartDrag = event => {
    if (event.button !== 0) return;
    
    // Clear any hover state when drag begins
    localHoveredTile = null;
    clearHoveredTile();
    
    if (startMapDrag(event) && mapElement) {
      mapElement.style.cursor = "grabbing";
      mapElement.classList.add("dragging");
    }
    event.preventDefault();
  };

  const handleStopDrag = () => {
    if (stopMapDrag() && mapElement) {
      mapElement.style.cursor = "grab";
      mapElement.classList.remove("dragging");
    }
  };
  
  // Simplified global event handlers
  const globalMouseDown = () => $mapState.isMouseActuallyDown = true;
  const globalMouseUp = () => {
    $mapState.isMouseActuallyDown = false;
    if ($mapState.isDragging) handleStopDrag();
  };
  const globalMouseMove = event => {
    if ($mapState.isMouseActuallyDown && $mapState.isDragging) dragMap(event);
    else if (!$mapState.isMouseActuallyDown && $mapState.isDragging) handleStopDrag();
  };
  
  // Simple derived value for dragging class
  const isDragging = $derived($mapState.isDragging);
  const targetCoord = $derived({
    x: $mapState.targetCoord.x,
    y: $mapState.targetCoord.y
  });

  // Cache grid data
  const grid = $derived($gridArray);

  // Use the optimized target tile store
  const targetTileData = $derived($targetTileStore);
  
  // Fix prop names for Legend and Details
  const legendProps = $derived({
    x: targetTileData.x,
    y: targetTileData.y,
    terrainColour: targetTileData.color || '#16393F'  // Using terrainColour as preferred
  });
  
  const detailsProps = $derived({
    x: targetTileData.x,
    y: targetTileData.y,
    show: $mapState.showDetailsModal,
    terrainColour: targetTileData.color,  // Using terrainColour as preferred
    biomeName: targetTileData.biome?.name
  });

  // Add a visible derived state to track and expose for MiniMap synchronization
  const visibleGridState = $derived({
    centerX: $mapState.targetCoord.x,
    centerY: $mapState.targetCoord.y,
    width: $mapState.cols,
    height: $mapState.rows
  });

  // Make the visibleGridState changes available to other components
  $effect(() => {
    if ($mapState.isReady) {
      document.dispatchEvent(new CustomEvent('gridViewChanged', {
        detail: visibleGridState
      }));
    }
  });

  // Add keyboard movement tracking
  const isMoving = $derived($mapState.isDragging || $mapState.keyboardNavigationInterval !== null);

  // Track hover state locally to prevent flickering
  let localHoveredTile = $state(null);
  let clearHoverTimeout = null;

  // Add improved functions to track hover state
  function handleTileHover(cell) {
    if (isMoving) {
      // Clear any hover state immediately when moving
      if (localHoveredTile) localHoveredTile = null;
      clearHoveredTile();
      return;
    }
    
    // Only process hover when not moving
    if (clearHoverTimeout) {
      clearTimeout(clearHoverTimeout);
      clearHoverTimeout = null;
    }
    
    // Update local state immediately
    localHoveredTile = { x: cell.x, y: cell.y };
    
    // Update global state
    updateHoveredTile(cell.x, cell.y);
  }
  
  function handleTileLeave() {
    if (isMoving) {
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
  
  // Track if a tile is currently hovered - for minimap sync
  const isHovered = (cell) => {
    // Never show hover effects when moving
    if (isMoving) return false;
    
    // Check local state first for immediate feedback
    if (localHoveredTile && cell.x === localHoveredTile.x && cell.y === localHoveredTile.y) {
      return true;
    }
    
    // Fall back to global state
    return !isMoving && $mapState.hoveredTile && 
           cell.x === $mapState.hoveredTile.x && 
           cell.y === $mapState.hoveredTile.y;
  };
  
  // More aggressive clearing of hover state when movement begins or ends
  $effect(() => {
    // When movement state changes (either begins or ends), clear all hover states
    localHoveredTile = null;
    clearHoveredTile();
  });
  
  // Clean up hover state when movement begins
  $effect(() => {
    if (isMoving && (localHoveredTile || $mapState.hoveredTile)) {
      localHoveredTile = null;
      clearHoveredTile();
    }
  });
  
  // Clean up timeout on component unmount
  $effect(() => {
    return () => {
      if (clearHoverTimeout) {
        clearTimeout(clearHoverTimeout);
      }
    };
  });
</script>

<svelte:window
  onmousedown={globalMouseDown}
  onmouseup={globalMouseUp}
  onmousemove={globalMouseMove}
  onmouseleave={handleStopDrag}
  onblur={() => $mapState.isDragging && handleStopDrag()}
  onvisibilitychange={() => document.visibilityState === 'hidden' && handleStopDrag()}
/>

<div class="map-container" style="--tile-size: {TILE_SIZE}em;" class:modal-open={$mapState.showDetailsModal}>
  <div
    class="map"
    bind:this={mapElement}
    onmousedown={handleStartDrag}
    class:moving={isMoving}
    role="grid"
    tabindex="0"
    aria-label="Interactive coordinate map. Use WASD or arrow keys to navigate."
  >
    {#if $mapState.isReady}
      <div class="grid main-grid" style="--cols: {$mapState.cols}; --rows: {$mapState.rows};" role="presentation">
        {#each grid as cell (cell.x + ':' + cell.y)}
          <div
            class="tile"
            class:center={cell.isCenter}
            class:hovered={isHovered(cell)}
            onmouseenter={() => handleTileHover(cell)}
            onmouseleave={handleTileLeave}
            role="gridcell"
            tabindex="-1"
            aria-label="Coordinates {cell.x},{cell.y}, biome: {cell.biome.name}"
            aria-current={cell.isCenter ? "location" : undefined}
            style="background-color: {cell.color};"
          >
            <span class="coords">{cell.x},{cell.y}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if !$mapState.showDetailsModal}
    <!-- Show Legend only when Details modal is not shown -->
    <Legend 
      x={legendProps.x} 
      y={legendProps.y}
      terrainColour={legendProps.terrainColour}
      openDetails={openDetailsModal} 
    />
  {/if}

  <!-- Axes component should appear above the grid - move it after the grid for proper layering -->
  {#if showAxisBars && $mapState.isReady}
    <Axes 
      xAxisArray={$xAxisArray}
      yAxisArray={$yAxisArray}
      cols={$mapState.cols}
      rows={$mapState.rows}
    />
  {/if}

  <Details 
    x={detailsProps.x}
    y={detailsProps.y}
    show={detailsProps.show}
    terrainColour={detailsProps.terrainColour}
    biomeName={detailsProps.biomeName}
    onClose={closeDetailsModal}
  />

  <!-- Add the Tutorial component at the bottom left -->
  <Tutorial show={true} />

  <MiniMap />
</div>

<style>
  .map-container {
    position: relative;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: var(--color-dark-blue);
    user-select: none;
    z-index: 1; /* Set base z-index for proper layering */
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  }

  /* Map takes full container space */
  .map {
    width: 100%;
    height: 100%;
    cursor: grab;
    overflow: hidden;
    box-sizing: border-box;
    background: linear-gradient(
      135deg,
      var(--color-dark-navy),
      var(--color-dark-blue)
    );
  }

  .grid {
    display: grid;
    box-sizing: border-box;
    z-index: 1; /* Set grid z-index lower than axes */
  }

  .main-grid {
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-template-rows: repeat(var(--rows), 1fr);
    width: 100%;
    height: 100%;
  }

  .tile {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0.05em solid rgba(0, 0, 0, 0.1);
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 1.2em;
    color: rgba(255, 255, 255, 0.7);
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    -webkit-touch-callout: none;
    z-index: 1;
  }
  
  /* Center tile style */
  .map .grid .tile.center {
    z-index: 3;
    position: relative;
    filter: brightness(1.1);
    border: 0.12em solid rgba(255, 255, 255, 0.5);
    box-shadow: 
      inset 0 0 0.5em rgba(255, 255, 255, 0.3),
      0 0 1em rgba(255, 255, 255, 0.2);
    transform: scale(1.05);
  }
  
  /* Hover effects */
  .map:not(.moving) .tile:hover,
  .tile.hovered {
    z-index: 2;
    filter: brightness(1.2);
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.7);
  }
  
  /* Moving state */
  .map.moving .tile {
    pointer-events: none;
    cursor: grabbing;
    filter: none;
    z-index: auto;
  }

  /* Additional styles to ensure no hover effects during movement */
  .map.moving .tile.hovered {
    filter: none;
    box-shadow: none;
  }

  .coords {
    font-size: 0.7em;
    opacity: 0.6;
  }

  .map-container.modal-open {
    cursor: grab;
  }

  .map-container.modal-open .map {
    pointer-events: all; /* Ensure map still receives pointer events when modal is open */
  }

  /* Ensure MiniMap container doesn't interfere with grid interactions */
  :global(.minimap-container) {
    pointer-events: none; /* Let events pass through to grid by default */
  }
  
  :global(.minimap) {
    pointer-events: auto; /* But enable events on the minimap itself */
  }

  /* Ensure Axes appear above the grid */
  :global(.axes-container) {
    z-index: 3 !important; /* Ensure axes are above grid tiles */
    pointer-events: none; /* Allow clicking through to tiles */
  }
  
  :global(.axis) {
    pointer-events: auto; /* But enable clicks on axis labels */
  }
</style>
