<script>
  import { onMount } from "svelte";
  import Legend from "./Legend.svelte";
  import Axes from "./Axes.svelte";
  import Details from "./Details.svelte";
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
    getTerrainData  // Import the function properly
  } from "../../lib/stores/map.js";
  
  // Local component state as separate constants
  let mapElement = null;
  let resizeObserver = null;
  let dragStateCheckInterval = null;
  let keyboardNavigationInterval = null;
  
  // Display settings
  const showAxisBars = true;
  
  // Initialize when mounted
  onMount(() => {
    resizeObserver = new ResizeObserver(() => resizeMap(mapElement));
    resizeObserver.observe(mapElement);
    resizeMap(mapElement);
    setupKeyboardNavigation();
    dragStateCheckInterval = setInterval(checkDragState, DRAG_CHECK_INTERVAL);

    return () => {
      // Proper cleanup to prevent memory leaks
      if (resizeObserver) resizeObserver.disconnect();
      if (keyboardNavigationInterval) clearInterval(keyboardNavigationInterval);
      if (dragStateCheckInterval) clearInterval(dragStateCheckInterval);
      if ($mapState.keyboardNavigationInterval) {
        clearInterval($mapState.keyboardNavigationInterval);
        mapState.update(state => ({...state, keyboardNavigationInterval: null}));
      }
    };
  });

  // Setup keyboard navigation
  const setupKeyboardNavigation = () => {
    window.addEventListener("keydown", event => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(key)) {
        $mapState.keysPressed.add(key);

        if (!$mapState.keyboardNavigationInterval) {
          moveMapByKeys();
          $mapState.keyboardNavigationInterval = setInterval(moveMapByKeys, 200);
        }

        if (key.startsWith("arrow")) event.preventDefault();
      }
    });

    window.addEventListener("keyup", event => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(key)) {
        $mapState.keysPressed.delete(key);

        if ($mapState.keysPressed.size === 0 && $mapState.keyboardNavigationInterval) {
          clearInterval($mapState.keyboardNavigationInterval);
          $mapState.keyboardNavigationInterval = null;
        }
      }
    });
  };

  // Drag handling
  const handleStartDrag = event => {
    if (startMapDrag(event)) {
      if (mapElement) {
        mapElement.style.cursor = "grabbing";
        mapElement.classList.add("dragging");
      }
    }
    event.preventDefault();
  };

  const handleStopDrag = () => {
    if (stopMapDrag() && mapElement) {
      mapElement.style.cursor = "grab";
      mapElement.classList.remove("dragging");
    }
  };

  // Global mouse events
  const globalMouseDown = () => $mapState.isMouseActuallyDown = true;
  const globalMouseUp = () => {
    $mapState.isMouseActuallyDown = false;
    if ($mapState.isDragging) handleStopDrag();
    document.body.style.cursor = "default";
  };
  const globalMouseMove = event => {
    if ($mapState.isMouseActuallyDown && $mapState.isDragging) dragMap(event);
    else if (!$mapState.isMouseActuallyDown && $mapState.isDragging) handleStopDrag();
  };
  const globalMouseLeave = () => { if ($mapState.isDragging) handleStopDrag(); };
  const visibilityChange = () => { 
    if (document.visibilityState === 'hidden' && $mapState.isDragging) handleStopDrag(); 
  };

  // Effect for tracking map changes
  $effect(() => {
    if ($mapState.isReady && $gridArray.length > 0) {
      // Log updates
      console.log(`Map updated: ${$mapState.targetCoord.x}, ${$mapState.targetCoord.y}`);
    }
  });
  
  // Fix dragging class effect
  $effect(() => {
    if (!$mapState.isDragging && mapElement && mapElement.classList.contains('dragging'))
      mapElement.classList.remove('dragging');
  });

  // Effect to update center tile data whenever target coordinates change
  $effect(() => {
    // When target coordinates change, make sure center tile data is updated
    if ($mapState.isReady) {
      const coords = $mapState.targetCoord;
      
      // Log the update to help with debugging
      console.log(`Target coordinates updated: (${coords.x}, ${coords.y})`);
    }
  });

  // Modified effect - use a local variable to store coordinates to avoid recursive updates
  $effect(() => {
    if ($mapState.isReady && $mapState.targetCoord) {
      // Store coordinates locally instead of triggering new data fetch here
      const target = $mapState.targetCoord;
      console.log(`Target coordinates updated: (${target.x}, ${target.y})`);
    }
  });

  // Remove the problematic effect that was causing recursive updates
  // $effect(() => {
  //   if ($mapState.isReady && $mapState.targetCoord) {
  //     const target = $mapState.targetCoord;
  //     requestAnimationFrame(() => {
  //       const terrainData = getTerrainData(target.x, target.y);
  //       console.log(`Grid component updating terrain data for: (${target.x}, ${target.y}) - Biome: ${terrainData.biome.name}`);
  //     });
  //   }
  // });
</script>

<svelte:window
  on:mousedown={globalMouseDown}
  on:mouseup={globalMouseUp}
  on:mousemove={globalMouseMove}
  on:mouseleave={globalMouseLeave}
  on:blur={() => $mapState.isDragging && handleStopDrag()}
  on:visibilitychange={visibilityChange}
/>

<div class="map-container" style="--tile-size: {TILE_SIZE}em;" class:modal-open={$mapState.showDetailsModal}>
  <div
    class="map"
    bind:this={mapElement}
    on:mousedown={handleStartDrag}
    class:dragging={$mapState.isDragging}
    role="grid"
    tabindex="0"
    aria-label="Interactive coordinate map. Use WASD or arrow keys to navigate."
  >
    {#if $mapState.isReady}
      <div class="grid main-grid" style="--cols: {$mapState.cols}; --rows: {$mapState.rows};" role="presentation">
        {#each $gridArray as cell}
          <div
            class="tile"
            class:center={cell.isCenter}
            role="gridcell"
            aria-label="Coordinates {cell.x},{cell.y}, biome: {cell.biome.name}"
            aria-current={cell.isCenter ? "location" : undefined}
            style="background-color: {cell.color};"
            title="{cell.biome.name} ({cell.x},{cell.y})"
          >
            <span class="coords">{cell.x},{cell.y}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <Legend x={$mapState.targetCoord.x} y={$mapState.targetCoord.y} openDetails={openDetailsModal} />

  {#if showAxisBars && $mapState.isReady}
    <Axes xAxisArray={$xAxisArray} yAxisArray={$yAxisArray} cols={$mapState.cols} rows={$mapState.rows} />
  {/if}

  <Details 
    x={$mapState.targetCoord.x} 
    y={$mapState.targetCoord.y} 
    show={$mapState.showDetailsModal}
    biome={$mapState.centerTileData?.biome || { name: "unknown", color: "#808080" }}
    height={$mapState.centerTileData?.height || 0}
    moisture={$mapState.centerTileData?.moisture || 0}
    continent={$mapState.centerTileData?.continent || 0}
    slope={$mapState.centerTileData?.slope || 0}
    riverValue={$mapState.centerTileData?.riverValue || 0}
    lakeValue={$mapState.centerTileData?.lakeValue || 0}
    displayColor={$mapState.centerTileData?.color || "#808080"}
    onClose={closeDetailsModal}
  />
</div>

<style>
  .map-container {
    position: relative;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: var(--color-dark-blue);
    user-select: none;
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
    transition: filter 0.1s ease-in-out, transform 0.1s ease-in-out;
  }

  /* Replace the hover and dragstate CSS */
  .map:not(.dragging) .tile:hover {
    z-index: 2;
    filter: brightness(1.2);
  }
  
  .map.dragging .tile {
    pointer-events: none;
    cursor: grabbing;
    filter: none;
    transform: none;
    z-index: auto;
  }

  /* Enhanced center tile styling */
  .center {
    z-index: 3;
    position: relative;
    filter: brightness(1.1);
    border: 0.12em solid rgba(255, 255, 255, 0.5) !important;
    box-shadow: 
      inset 0 0 0.5em rgba(255, 255, 255, 0.3),
      0 0 1em rgba(255, 255, 255, 0.2);
    transform: scale(1.05);
  }

  /* Create a subtle pulsing animation for the center tile */
  @keyframes pulse {
    0% { box-shadow: inset 0 0 0.5em rgba(255, 255, 255, 0.3), 0 0 1em rgba(255, 255, 255, 0.2); }
    50% { box-shadow: inset 0 0 0.8em rgba(255, 255, 255, 0.4), 0 0 1.5em rgba(255, 255, 255, 0.3); }
    100% { box-shadow: inset 0 0 0.5em rgba(255, 255, 255, 0.3), 0 0 1em rgba(255, 255, 255, 0.2); }
  }

  .center {
    animation: pulse 2s infinite ease-in-out;
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
</style>
