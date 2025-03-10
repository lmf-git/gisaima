<script>
  import { onMount, createEventDispatcher } from "svelte";
  import { browser } from "$app/environment";
  import Legend from "./Legend.svelte";
  import Axes from "./Axes.svelte";
  import Details from "./Details.svelte";
  import { setupKeyboardNavigation, calculateKeyboardMove, startDrag, stopDrag, checkDragState, createMouseEventHandlers } from "../../lib/map/controls.js";

  const dispatch = createEventDispatcher();
  
  // Props using correct runes syntax
  const { 
    terrain,
    terrainCache,
    targetCoord,
    highlightedCoord = null,
    openDetails, // This is the external prop
    detailsVisible = false,
    onDetailsChange
  } = $props();

  // REFACTORED: Separate internal state from external props
  const state = $state({
    isDragging: false,
    isMouseDown: false,
    dragStartX: 0,
    dragStartY: 0,
    showDetailsModal: false,
    showMinimap: true,
    keysPressed: new Set(),
    navInterval: null,
    dragCheckInterval: null,
    mapElement: null,
    cols: 0, 
    rows: 0,
    isReady: false,
    resizeObserver: null,
    offsetX: 0,
    offsetY: 0,
    visibleChunks: new Set(),
    centerX: 0,
    centerY: 0,
    gridArray: [],
    xAxisArray: [],
    yAxisArray: [],
    centerTileData: null,
    lastTargetX: 0,
    lastTargetY: 0
  });
  
  // Configuration
  const KEYBOARD_MOVE_SPEED = 200;
  const CHUNK_SIZE = 20;
  const tileSize = 7.5;
  const showAxisBars = true;
  const DRAG_CHECK_INTERVAL = 500;
  
  // Get terrain data with caching
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

  // Controls state object with coordinate update function
  const controlsState = {
    isDragging: false,
    isMouseDown: false,
    dragStartX: 0,
    dragStartY: 0,
    keysPressed: new Set(),
    navInterval: null,
    tileSize,
    updateCoordinates: (xChange, yChange) => {
      if (xChange !== 0 || yChange !== 0) {
        const newX = targetCoord.x + xChange;
        const newY = targetCoord.y + yChange;
        
        // Dispatch event with source information for better tracking
        dispatch('positionchange', { 
          x: newX, 
          y: newY,
          source: state.isDragging ? 'drag' : 'keyboard'
        });
      }
    }
  };
  
  const resize = () => {
    if (!browser || !state.mapElement) return;
    
    const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const tileSizePx = tileSize * baseFontSize;
    const width = state.mapElement.clientWidth;
    const height = state.mapElement.clientHeight;

    // Ensure odd numbers for proper center tile
    state.cols = Math.ceil(width / tileSizePx);
    if (state.cols % 2 === 0) state.cols += 1; 

    state.rows = Math.ceil(height / tileSizePx);
    if (state.rows % 2 === 0) state.rows += 1; 

    state.centerX = Math.floor(state.cols / 2);
    state.centerY = Math.floor(state.rows / 2);
    state.offsetX = state.centerX + targetCoord.x;
    state.offsetY = state.centerY + targetCoord.y;
    
    // Send viewport information
    const viewportInfo = { 
      cols: state.cols, 
      rows: state.rows,
      centerX: state.centerX, 
      centerY: state.centerY,
      visibleLeft: Math.floor(targetCoord.x - state.centerX),
      visibleRight: Math.floor(targetCoord.x + (state.cols - state.centerX - 1)),
      visibleTop: Math.floor(targetCoord.y - state.centerY),
      visibleBottom: Math.floor(targetCoord.y + (state.rows - state.centerY - 1))
    };
    
    viewportInfo.worldWidth = viewportInfo.visibleRight - viewportInfo.visibleLeft + 1;
    viewportInfo.worldHeight = viewportInfo.visibleBottom - viewportInfo.visibleTop + 1;
    
    dispatch('viewportsizechange', viewportInfo);
    
    if (!state.isReady) state.isReady = true;
    
    // Rebuild grid arrays
    rebuildGridArrays();
  };
  
  function rebuildGridArrays() {
    if (!state.isReady) return;
    
    // Build grid array
    state.gridArray = Array.from({ length: state.rows }, (_, y) =>
      Array.from({ length: state.cols }, (_, x) => {
        const globalX = Math.floor(x - state.offsetX);
        const globalY = Math.floor(y - state.offsetY);
        
        // Special case for center tile
        if (x === state.centerX && y === state.centerY && state.centerTileData) {
          return {
            x: globalX,
            y: globalY,
            isCenter: true,
            ...state.centerTileData
          };
        }
        
        const terrainData = getCachedTerrainData(globalX, globalY);
        
        return {
          x: globalX,
          y: globalY,
          isCenter: x === state.centerX && y === state.centerY,
          ...terrainData
        };
      })
    ).flat();
    
    // Build axis arrays
    state.xAxisArray = Array.from({ length: state.cols }, (_, x) => ({
      value: x - state.offsetX,
      isCenter: x === state.centerX
    }));

    state.yAxisArray = Array.from({ length: state.rows }, (_, y) => ({
      value: y - state.offsetY,
      isCenter: y === state.centerY
    }));
    
    // Update visible chunks
    updateChunks(state.gridArray);
  }
  
  // Get chunk key from coordinates
  const getChunkKey = (x, y) => `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;

  // Update visible chunks log
  const updateChunks = gridArray => {
    const newChunkKeys = gridArray.map(cell => getChunkKey(cell.x, cell.y));
    const newVisibleChunks = new Set(newChunkKeys);

    state.visibleChunks = newVisibleChunks;
  };

  onMount(() => {
    state.resizeObserver = new ResizeObserver(resize);
    state.resizeObserver.observe(state.mapElement);
    resize();
    
    setupKeyboardNavigation(moveMapByKeys, controlsState, KEYBOARD_MOVE_SPEED);
    state.dragCheckInterval = setInterval(() => checkDragState(controlsState), DRAG_CHECK_INTERVAL);

    return () => {
      if (state.resizeObserver) state.resizeObserver.disconnect();
      if (controlsState.navInterval) clearInterval(controlsState.navInterval);
      if (state.dragCheckInterval) clearInterval(state.dragCheckInterval);
    };
  });

  // Move map based on keyboard input
  const moveMapByKeys = () => {
    const { xChange, yChange } = calculateKeyboardMove(controlsState.keysPressed);
    controlsState.updateCoordinates(-xChange, -yChange);
  };

  // OPTIMIZED: Only update grid when targetCoord changes
  $effect(() => {
    if (!state.isReady) return;
    
    // Skip update if coordinates haven't changed
    if (state.lastTargetX === targetCoord.x && state.lastTargetY === targetCoord.y) return;
    
    // Update last known values
    state.lastTargetX = targetCoord.x;
    state.lastTargetY = targetCoord.y;
    
    // Update offsets and center data
    state.offsetX = state.centerX + targetCoord.x;
    state.offsetY = state.centerY + targetCoord.y;
    
    // Update center tile data
    updateCenterTileData();
    
    // Rebuild grid arrays
    rebuildGridArrays();
  });

  // Drag handlers
  const handleStartDrag = (event) => {
    // Prevent drag from non-primary clicks
    if (event.button !== 0) return;
    
    
    startDrag(event, controlsState, state.mapElement);
    
    // Update the component state from control state
    state.isDragging = true;
    state.isMouseDown = true;
    state.dragStartX = event.clientX;
    state.dragStartY = event.clientY;
    
    // Prevent default to avoid text selection during drag
    event.preventDefault();
  };

  const handleStopDrag = () => {
    stopDrag(controlsState, state.mapElement);
    
    // Update the component state
    state.isDragging = false;
    state.isMouseDown = false;
    
    if (state.mapElement) {
      state.mapElement.style.cursor = 'grab';
      state.mapElement.classList.remove('dragging');
    }
  };

  // Create mouse event handlers
  const eventHandlers = createMouseEventHandlers(controlsState, state.mapElement);

  // Renamed to handleOpenDetails to avoid the name collision
  const handleOpenDetails = () => {
    updateCenterTileData();
    if (openDetails) {
      // Call the prop function if provided
      openDetails();
    } else {
      // Fall back to local behavior
      state.showDetailsModal = true;
    }
  };

  function updateCenterTileData() {
    if (!state.isReady) return;
    
    const intX = Math.floor(targetCoord.x);
    const intY = Math.floor(targetCoord.y);
    
    state.centerTileData = getCachedTerrainData(intX, intY);
  }

  // Event handlers
  function handleTileHover(cell) {
    dispatch('tilehighlight', { x: cell.x, y: cell.y });
  }
  
  function handleTileLeave() {
    dispatch('tilehighlight', null);
  }

  // SIMPLIFIED: Handle Detail component show/hide using parent callback
  function handleDetailUpdate(event) {
    if (onDetailsChange) {
      onDetailsChange(event.detail);
    }
  }

  // FIXED: Sync control state with component state
  $effect(() => {
    controlsState.isDragging = state.isDragging;
    controlsState.isMouseDown = state.isMouseDown;
    controlsState.dragStartX = state.dragStartX;
    controlsState.dragStartY = state.dragStartY;
  });
</script>

<svelte:window
  on:mousedown={eventHandlers.globalMouseDown}
  on:mouseup={eventHandlers.globalMouseUp}
  on:mousemove={eventHandlers.globalMouseMove}
  on:mouseleave={eventHandlers.globalMouseLeave}
  on:blur={() => state.isDragging && handleStopDrag()}
  on:visibilitychange={eventHandlers.visibilityChange}
/>

<div class="map-container" style="--tile-size: {tileSize}em;" class:modal-open={state.showDetailsModal}>
  <div
    class="map"
    bind:this={state.mapElement}
    onmousedown={handleStartDrag}
    class:dragging={state.isDragging}
    role="grid"
    tabindex="0"
    aria-label="Interactive coordinate map. Use WASD or arrow keys to navigate."
  >
    {#if state.isReady}
      <div class="grid main-grid" style="--cols: {state.cols}; --rows: {state.rows};" role="presentation">
        {#each state.gridArray as cell}
          <button
            class="tile"
            class:center={cell.isCenter}
            class:highlighted={highlightedCoord && cell.x === highlightedCoord.x && cell.y === highlightedCoord.y}
            role="gridcell"
            tabindex="0"
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                dispatch('positionchange', { x: cell.x, y: cell.y });
              }
            }}
            onmouseover={() => handleTileHover(cell)}
            onmouseleave={handleTileLeave}
            onfocus={() => handleTileHover(cell)}
            onblur={handleTileLeave}
            aria-label="Coordinates {cell.x},{cell.y}, biome: {cell.biome.name}"
            aria-current={cell.isCenter ? "location" : undefined}
            style="background-color: {cell.color};"
            title="{cell.biome.name} ({cell.x},{cell.y})"
          >
            <span class="coords">{cell.x},{cell.y}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if !state.showDetailsModal}
    <Legend 
      x={targetCoord.x} 
      y={targetCoord.y} 
      openDetails={handleOpenDetails} 
    />
  {/if}

  {#if showAxisBars && state.isReady}
    <Axes xAxisArray={state.xAxisArray} yAxisArray={state.yAxisArray} cols={state.cols} rows={state.rows} />
  {/if}

  <Details 
    x={targetCoord.x} 
    y={targetCoord.y} 
    show={detailsVisible || state.showDetailsModal}
    on:showChange={handleDetailUpdate}
    biome={state.centerTileData?.biome || { name: "unknown", displayName: "Unknown", color: "#808080" }}
    height={state.centerTileData?.height || 0}
    moisture={state.centerTileData?.moisture || 0}
    continent={state.centerTileData?.continent || 0}
    slope={state.centerTileData?.slope || 0}
    riverValue={state.centerTileData?.riverValue || 0}
    lakeValue={state.centerTileData?.lakeValue || 0}
    displayColor={state.centerTileData?.color || "#808080"}
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
    transition: filter 0.1s ease-in-out, transform 0.1s ease-in-out, border 0.1s ease-in-out;
    padding: 0;
    background: none;
    cursor: pointer !important; /* Force cursor to always be pointer */
  }

  /* Add focus styles for keyboard navigation */
  .tile:focus {
    outline: 0.15em solid rgba(255, 255, 255, 0.7);
    z-index: 5;
  }

  /* Replace the hover and drag state CSS */
  .map:not(.dragging) .tile:hover {
    z-index: 2;
    filter: brightness(1.2);
  }
  
  .map.dragging .tile {
    pointer-events: none;
    cursor: grabbing !important;
  }
  
  .map:not(.dragging) .tile {
    pointer-events: auto;
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

  /* Debug info */
  .debug-grid-info {
    position: absolute;
    top: 0.5em;
    left: 0.5em;
    color: white;
    font-size: 0.8em;
    background: rgba(0,0,0,0.3);
    padding: 0.3em 0.6em;
    border-radius: 0.3em;
    z-index: 10;
    pointer-events: none; 
    opacity: 0.7;
  }

  /* ADDED: Highlighted tile style */
  .highlighted {
    z-index: 4;
    filter: brightness(1.3) !important;
    box-shadow: 0 0 0.8em rgba(255, 255, 255, 0.7), inset 0 0 0.5em rgba(255, 255, 255, 0.5);
    border: 0.12em solid rgba(255, 255, 255, 0.8) !important;
  }
</style>
