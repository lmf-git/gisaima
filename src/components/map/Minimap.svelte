<script>
  import { onMount, createEventDispatcher } from "svelte";
  import { browser } from "$app/environment";
  import Close from "../icons/Close.svelte";
  import { setupMinimapControls } from "../../lib/map/minimapcontrols.js";

  const dispatch = createEventDispatcher();

  // Props using $props
  const { 
    terrain,
    terrainCache,
    targetCoord = { x: 0, y: 0 },
    highlightedCoord = null,
    mainViewportSize = { cols: 0, rows: 0 },
    position = "bottom-right",
    size = "20%" 
  } = $props();

  // FIXED: Simplify state management to prevent infinite re-renders
  const state = $state({
    minimapElement: null,
    cols: 11,
    rows: 11,
    isReady: false,
    centerX: 5,
    centerY: 5,
    offsetX: 5,
    offsetY: 5,
    minimapGridArray: [],
    viewportWidth: 5,
    viewportHeight: 5,
    viewportLeft: 0,
    viewportTop: 0,
    resizeObserver: null,
    // ADDED: Separate last known values to prevent unnecessary recalculations
    lastTargetX: 0,
    lastTargetY: 0,
    lastViewportCols: 0,
    lastViewportRows: 0
  });

  // Minimap settings
  const tileSize = 0.5;
  const tilesRatio = 2.5;
  
  // REMOVED: Move terrain data fetching to the page component
  // Only keep the grid array building here
  
  const controls = setupMinimapControls(
    state,
    tileSize, 
    tilesRatio, 
    terrainCache,
    terrain,
    targetCoord,
    mainViewportSize
  );

  const resize = () => {
    if (!browser || !state.minimapElement) return;
    
    // Let the controls handle the resize calculations
    controls.handleResize(state.minimapElement);
    
    // Rebuild grid array
    rebuildGridArray();
  };
  
  // FIXED: Simplify grid generation to be more reliable
  function rebuildGridArray() {
    if (!state.cols || !state.rows) return [];
    
    // Calculate world coordinates of top-left corner of minimap
    const topLeftX = Math.floor(targetCoord.x - state.centerX);
    const topLeftY = Math.floor(targetCoord.y - state.centerY);
    
    // Build grid from sequential world coordinates without using offset calculation
    state.minimapGridArray = Array.from({ length: state.rows }, (_, y) =>
      Array.from({ length: state.cols }, (_, x) => {
        // Direct mapping from grid position to world coordinates
        const globalX = topLeftX + x;
        const globalY = topLeftY + y;
        
        // Get terrain data for this coordinate
        const terrainData = controls.getCachedTerrainData(globalX, globalY);
        
        return {
          x: globalX,
          y: globalY,
          gridX: x,
          gridY: y,
          isCenter: x === state.centerX && y === state.centerY,
          ...terrainData
        };
      })
    ).flat();
  }

  onMount(() => {
    if (!state.minimapElement) {
      console.error("minimapElement is not defined on mount");
      return;
    }
    
    resize();
    
    state.resizeObserver = new ResizeObserver(() => {
      resize();
    });
    
    state.resizeObserver.observe(state.minimapElement);

    return () => {
      if (state.resizeObserver) {
        state.resizeObserver.disconnect();
        state.resizeObserver = null;
      }
      
      state.minimapGridArray = [];
      state.isReady = false;
    };
  });

  // OPTIMIZED: Only update when target coordinates actually change
  $effect(() => {
    if (!state.isReady) return;
    
    // Skip update if coordinates haven't changed
    if (state.lastTargetX === targetCoord.x && state.lastTargetY === targetCoord.y) return;
    
    // Update last known values
    state.lastTargetX = targetCoord.x;
    state.lastTargetY = targetCoord.y;
    
    // Update internal state
    state.offsetX = state.centerX + targetCoord.x;
    state.offsetY = state.centerY + targetCoord.y;
    
    // Update viewport and rebuild grid
    controls.updateViewportIndicator();
    rebuildGridArray();
  });
  
  // OPTIMIZED: Only update when viewport size changes
  $effect(() => {
    if (!state.isReady || !mainViewportSize?.cols) return;
    
    // Skip update if viewport hasn't changed
    if (state.lastViewportCols === mainViewportSize.cols && 
        state.lastViewportRows === mainViewportSize.rows) return;
    
    // Update last known values
    state.lastViewportCols = mainViewportSize.cols;
    state.lastViewportRows = mainViewportSize.rows;
    
    // Update viewport indicator
    controls.updateViewportIndicator();
    
    // Only resize if the viewport proportions changed significantly
    if (Math.abs(state.lastViewportCols - mainViewportSize.cols) > 2 ||
        Math.abs(state.lastViewportRows - mainViewportSize.rows) > 2) {
      resize();
    }
  });

  // Event handlers
  // FIXED: Improved tile click handler that uses absolute coordinates
  function handleTileClick(cell) {
    // Use the exact world coordinates stored in the cell
    const x = cell.x;
    const y = cell.y;
    
    console.log('Dispatching position change from minimap:', x, y);
    
    dispatch('positionchange', { 
      x,
      y,
      fromMinimap: true
    });
  }
  
  function handleMinimapClick(event) {
    if (event.target === state.minimapElement || !event.target.classList.contains('mini-tile')) {
      controls.handleBackgroundClick(event, handleTileClick, dispatch);
    }
  }
  
  function setupTileInteraction(node, cell) {
    return controls.setupTileInteraction(node, cell, handleTileClick, dispatch);
  }

  // FIXED: Make sure minimap grid stays in sync with target coordinates
  $effect(() => {
    if (!state.isReady) return;
    
    // Force full grid rebuild when target coordinates change
    state.offsetX = state.centerX + targetCoord.x;
    state.offsetY = state.centerY + targetCoord.y;
    
    // Update viewport indicator
    controls.updateViewportIndicator();
    
    // Rebuild the grid array completely
    rebuildGridArray();
  });
</script>

<div 
  class="minimap-container" 
  class:top-left={position === "top-left"}
  class:top-right={position === "top-right"}
  class:bottom-left={position === "bottom-left"}
  class:bottom-right={position === "bottom-right"}
  style="--minimap-size: {size};"
  role="region"
  aria-label="Minimap"
>
  <button 
    class="minimap-close-button" 
    aria-label="Close minimap"
    onclick={(e) => {
      e.preventDefault();
      dispatch('close');
    }}
  >
    <Close size="0.8em" color="white" />
  </button>
  
  <div 
    class="minimap"
    bind:this={state.minimapElement}
    style="--tile-size: {tileSize}em; --cols: {state.cols || 1}; --rows: {state.rows || 1};"
    onclick={handleMinimapClick}
    onkeydown={controls.handleMinimapKeydown}
    role="grid"
    tabindex="0"
    aria-label="Minimap grid"
  >
    {#if state.minimapGridArray.length > 0}
      <!-- FIXED: Added data attributes for debugging -->
      <!-- FIXED: Simplified grid layout with no translations -->
      <div class="grid" role="presentation">
        {#each state.minimapGridArray as cell (cell.gridX + '-' + cell.gridY)}
          <!-- FIXED: Ensure grid-column/row is properly set for exact positioning -->
          <div
            class="mini-tile"
            class:center={cell.isCenter}
            class:highlighted={highlightedCoord && cell.x === highlightedCoord.x && cell.y === highlightedCoord.y}
            style="background-color: {cell.color}; grid-column: {cell.gridX + 1}; grid-row: {cell.gridY + 1};"
            use:setupTileInteraction={cell}
            title="{cell.biome.name} ({cell.x},{cell.y})"
            aria-label="Map position {cell.x},{cell.y}"
            role="gridcell"
            data-x={cell.x}
            data-y={cell.y}
          ></div>
        {/each}
      </div>
      
      <div 
        class="viewport-indicator"
        style="
          width: {state.viewportWidth * tileSize}em;
          height: {state.viewportHeight * tileSize}em;
          --viewport-left: {state.viewportLeft};
          --viewport-top: {state.viewportTop};
        "
        title="Current view area"
        role="presentation"
        aria-hidden="true"
      ></div>
    {:else}
      <div class="minimap-loading">Loading minimap...</div>
    {/if}
  </div>
</div>

<style>
  .minimap-container {
    position: absolute;
    width: var(--minimap-size);
    height: var(--minimap-size);
    background: rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    z-index: 100;
    overflow: hidden;
  }
  
  /* Close button styling */
  .minimap-close-button {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    z-index: 101;
    opacity: 0.7;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  
  .minimap-close-button:hover {
    opacity: 1;
    transform: scale(1.1);
  }
  
  /* Positioning classes */
  .top-left {
    top: 10px;
    left: 10px;
  }
  
  .top-right {
    top: 10px;
    right: 10px;
  }
  
  .bottom-left {
    bottom: 10px;
    left: 10px;
  }
  
  .bottom-right {
    bottom: 10px;
    right: 10px;
  }
  
  .minimap {
    width: 100%;
    height: 100%;
    position: relative;
    cursor: pointer;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  /* Focus style for keyboard accessibility */
  .minimap:focus {
    outline: 2px solid rgba(255, 255, 255, 0.6);
    outline-offset: -2px;
  }
  
  /* FIXED: Grid styling to properly fill the container */
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), var(--tile-size));
    grid-template-rows: repeat(var(--rows), var(--tile-size));
    width: 100%;
    height: 100%;
    position: relative;
  }
  
  .mini-tile {
    width: 100%;
    height: 100%;
    border: none;
    box-sizing: border-box;
    transition: transform 0.1s ease-in-out, filter 0.1s ease-in-out;
    cursor: pointer;
    will-change: transform;
    padding: 0;
    margin: 0;
    outline: none;
  }
  
  /* Hover effect */
  .mini-tile:hover {
    filter: brightness(1.3);
    z-index: 1;
    outline: 0.05em solid rgba(255, 255, 255, 0.7);
  }
  
  /* Center tile style */
  .mini-tile.center {
    outline: 0.1em solid white;
    box-shadow: 0 0 0.3em white, inset 0 0 0.2em white;
    z-index: 5;
    position: relative;
    filter: brightness(1.2);
    transform: scale(1.2);
  }
  
  .viewport-indicator {
    position: absolute;
    border: 2px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 0 5px rgba(0, 0, 0, 0.7), inset 0 0 3px rgba(255, 255, 255, 0.3);
    pointer-events: none;
    border-radius: 3px;
    animation: pulse 2s infinite ease-in-out;
    background-color: rgba(255, 255, 255, 0.1);
    z-index: 3;
    transform: translate(-50%, -50%);
    margin-left: 50%;
    margin-top: 50%;
    left: calc(var(--tile-size) * var(--viewport-left));
    top: calc(var(--tile-size) * var(--viewport-top));
  }
  
  @keyframes pulse {
    0% { box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.8), inset 0 0 3px rgba(255, 255, 255, 0.3); }
    50% { box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.4), inset 0 0 8px rgba(255, 255, 255, 0.1); }
    100% { box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.8), inset 0 0 3px rgba(255, 255, 255, 0.3); }
  }
  
  .minimap-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: white;
    font-size: 0.8em;
    text-align: center;
    background: rgba(0, 0, 0, 0.3);
  }
  
  /* Highlighted tile style */
  .mini-tile.highlighted {
    z-index: 4;
    filter: brightness(1.3) !important;
    outline: 0.08em solid rgba(255, 255, 255, 0.8) !important;
    box-shadow: 0 0 0.3em rgba(255, 255, 255, 0.7);
    transform: scale(1.15);
  }
</style>
