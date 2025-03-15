<script>
  import { onMount, onDestroy } from "svelte";
  import { derived } from "svelte/store";
  import { 
    map, 
    ready,
    coordinates,
    TILE_SIZE,
    moveTarget,
    targetStore,
    updateHoveredTile
  } from "../../lib/stores/map.js";
  
  // Convert to $props syntax
  const { detailed = false } = $props();
  
  // Local component state
  let mapElement = null;
  let resizeObserver = null;
  let introduced = $state(false);
  let keysPressed = $state(new Set());
  let keyboardNavigationInterval = $state(null);
  
  // Simplified derived state
  const isMoving = $derived($map.isDragging || keyboardNavigationInterval !== null);
  
  // Only include grid cells that are in the main view
  const gridArray = derived(
    coordinates,
    $coordinates => $coordinates?.filter(cell => cell.isInMainView) || []
  );
  
  // Add resizeMap function here
  function resizeMap(mapElement) {
    if (!mapElement) return;
    
    map.update(state => {
      const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const tileSizePx = TILE_SIZE * baseFontSize;
      const width = mapElement.clientWidth;
      const height = mapElement.clientHeight;

      // Ensure odd numbers for centered positioning
      let cols = Math.ceil(width / tileSizePx);
      cols = cols % 2 === 0 ? cols - 1 : cols;

      let rows = Math.ceil(height / tileSizePx);
      rows = rows % 2 === 0 ? rows - 1 : rows;

      cols = Math.max(cols, 5);
      rows = Math.max(rows, 5);

      return {
        ...state,
        cols,
        rows,
        // Remove offsetX and offsetY calculation
      };
    });
  }
  
  // Add handleDragAction for Grid
  function handleDragAction(event, sensitivity = 1) {
    const state = $map;
    
    // Start drag
    if (event.type === 'dragstart' || event.type === 'touchstart') {
      const clientX = event.clientX || event.touches?.[0]?.clientX || 0;
      const clientY = event.clientY || event.touches?.[0]?.clientY || 0;
      
      map.update(state => ({
        ...state,
        isDragging: true,
        dragStartX: clientX,
        dragStartY: clientY,
        dragAccumX: 0,
        dragAccumY: 0,
        dragSource: 'map'
      }));
      
      return true;
    }
    
    // Process drag
    else if (event.type === 'dragmove' || event.type === 'touchmove') {
      if (!state.isDragging || state.dragSource !== 'map') return false;
      
      const clientX = event.clientX || event.touches?.[0]?.clientX || 0;
      const clientY = event.clientY || event.touches?.[0]?.clientY || 0;
      
      const deltaX = clientX - state.dragStartX;
      const deltaY = clientY - state.dragStartY;

      const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const tileSizePx = TILE_SIZE * baseFontSize;
      const adjustedTileSize = tileSizePx * sensitivity;

      const dragAccumX = (state.dragAccumX || 0) + deltaX;
      const dragAccumY = (state.dragAccumY || 0) + deltaY;

      const cellsMovedX = Math.round(dragAccumX / adjustedTileSize);
      const cellsMovedY = Math.round(dragAccumY / adjustedTileSize);

      if (cellsMovedX === 0 && cellsMovedY === 0) {
        map.update(state => ({
          ...state,
          dragStartX: clientX,
          dragStartY: clientY,
          dragAccumX,
          dragAccumY
        }));
        return false;
      }

      const newX = state.target.x - cellsMovedX;
      const newY = state.target.y - cellsMovedY;
      const remainderX = dragAccumX - (cellsMovedX * adjustedTileSize);
      const remainderY = dragAccumY - (cellsMovedY * adjustedTileSize);

      moveTarget(newX, newY);

      map.update(state => ({
        ...state,
        dragStartX: clientX,
        dragStartY: clientY,
        dragAccumX: remainderX,
        dragAccumY: remainderY
      }));

      return true;
    }
    
    // End drag
    else if (event.type === 'dragend' || event.type === 'touchend' || event.type === 'touchcancel') {
      if (!state.isDragging || state.dragSource !== 'map') return false;
      
      map.update(state => ({
        ...state,
        isDragging: false,
        dragAccumX: 0,
        dragAccumY: 0,
        dragSource: null
      }));
      
      return true;
    }
    
    return false;
  }

  // Simplified keyboard navigation
  function moveMapByKeys() {
    let xChange = 0;
    let yChange = 0;

    if (keysPressed.has("a") || keysPressed.has("arrowleft")) xChange += 1;
    if (keysPressed.has("d") || keysPressed.has("arrowright")) xChange -= 1;
    if (keysPressed.has("w") || keysPressed.has("arrowup")) yChange += 1;
    if (keysPressed.has("s") || keysPressed.has("arrowdown")) yChange -= 1;

    if (xChange === 0 && yChange === 0) return;

    moveTarget($map.target.x - xChange, $map.target.y - yChange);
  }

  // Set up keyboard events
  function setupKeyboardNavigation() {
    const keyHandler = event => {
      if (!introduced) return;
      
      const key = event.key.toLowerCase();
      const isNavigationKey = ["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(key);
      
      if (!isNavigationKey) return;
      
      if (event.type === "keydown") {       
        keysPressed.add(key);
        
        if (!keyboardNavigationInterval) {
          moveMapByKeys();
          keyboardNavigationInterval = setInterval(moveMapByKeys, 200);
        }
        
        if (key.startsWith("arrow")) event.preventDefault();
      } else if (event.type === "keyup") {
        keysPressed.delete(key);
        
        if (keysPressed.size === 0 && keyboardNavigationInterval) {
          clearInterval(keyboardNavigationInterval);
          keyboardNavigationInterval = null;
        }
      }
    };
    
    window.addEventListener("keydown", keyHandler);
    window.addEventListener("keyup", keyHandler);
    
    return () => {
      window.removeEventListener("keydown", keyHandler);
      window.removeEventListener("keyup", keyHandler);
    };
  }
  
  // Unified drag event handlers
  function handleMouseDown(event) {
    if (!introduced || event.button !== 0) return;
    
    if (handleDragAction({ 
      type: 'dragstart', 
      clientX: event.clientX, 
      clientY: event.clientY, 
      button: event.button 
    }) && mapElement) {
      mapElement.style.cursor = "grabbing";
    }
    
    event.preventDefault();
  }
  
  function handleMouseMove(event) {
    if ($map.isDragging && $map.dragSource === 'map') {
      handleDragAction({ 
        type: 'dragmove', 
        clientX: event.clientX, 
        clientY: event.clientY 
      });
    }
  }
  
  function handleMouseUp() {
    if ($map.isDragging && $map.dragSource === 'map') {
      handleDragAction({ type: 'dragend' });
      if (mapElement) mapElement.style.cursor = "grab";
    }
  }
  
  // Touch event handlers
  function handleTouchStart(event) {
    if (!introduced || !$map.ready) return;
    event.preventDefault();
    
    const touch = event.touches[0];
    handleDragAction({ 
      type: 'touchstart', 
      touches: [touch] 
    });
  }
  
  function handleTouchMove(event) {
    if (!$map.isDragging || $map.dragSource !== 'map') return;
    event.preventDefault();
    
    handleDragAction({ 
      type: 'touchmove', 
      touches: event.touches 
    }, 1.5); // Higher sensitivity for touch
  }
  
  function handleTouchEnd() {
    if ($map.isDragging && $map.dragSource === 'map') {
      handleDragAction({ type: 'touchend' });
    }
  }
  
  // Tile hover handling
  function handleTileHover(cell) {
    if (!isMoving) updateHoveredTile(cell.x, cell.y);
  }
  
  // Clear hover state when moving
  $effect(() => {
    if (isMoving && $map.hoveredTile) {
      updateHoveredTile(null, null);
    }
  });
  
  // Component initialization
  onMount(() => {
    // Setup resize observer
    resizeObserver = new ResizeObserver(() => {
      if (mapElement) resizeMap(mapElement);
    });
    
    if (mapElement) {
      resizeObserver.observe(mapElement);
      resizeMap(mapElement);
    }
    
    // Setup keyboard navigation
    const keyboardCleanup = setupKeyboardNavigation();
    
    // Show grid after a short delay
    setTimeout(() => introduced = true, 1000);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      if (keyboardCleanup) keyboardCleanup();
      if (keyboardNavigationInterval) {
        clearInterval(keyboardNavigationInterval);
      }
    };
  });

  // Get background color from target tile
  const backgroundColor = $derived($targetStore?.color || "var(--color-dark-blue)");
</script>

<svelte:window
  onmouseup={handleMouseUp}
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseUp}
  onblur={() => $map.isDragging && handleMouseUp()}
  onvisibilitychange={() => document.visibilityState === 'hidden' && handleMouseUp()}
/>

<!-- Update class binding to use prop instead of store value -->
<div class="map-container" style="--tile-size: {TILE_SIZE}em;" class:modal-open={detailed} class:touch-active={$map.isDragging && $map.dragSource === 'map'}>
  <div
    class="map"
    bind:this={mapElement}
    onmousedown={handleMouseDown}
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
    ontouchcancel={handleTouchEnd}
    class:moving={isMoving}
    style="--terrain-color: {backgroundColor};"
    role="grid"
    tabindex="0"
    aria-label="Interactive coordinate map. Use WASD or arrow keys to navigate."
  >
    {#if $ready}
      <div class="grid main-grid" 
        style="--cols: {$map.cols}; --rows: {$map.rows};" 
        role="presentation"
        class:animated={!introduced}
      >
        {#each $gridArray as cell (cell.x + ':' + cell.y)}
          {@const distance = Math.sqrt(
            Math.pow(cell.x - $map.target.x, 2) + 
            Math.pow(cell.y - $map.target.y, 2)
          )}
          <div
            class="tile"
            class:center={cell.isCenter}
            class:highlighted={cell.highlighted}
            class:has-structure={cell.hasStructure}
            class:has-unit-group={cell.hasUnitGroup}
            class:has-player={cell.hasPlayer}
            onmouseenter={() => handleTileHover(cell)}
            role="gridcell"
            tabindex="-1"
            aria-label="Coordinates {cell.x},{cell.y}, biome: {cell.biome.name}"
            aria-current={cell.isCenter ? "location" : undefined}
            style="
              background-color: {cell.color};
              animation-delay: {!introduced && cell.isCenter ? 0 : (!introduced ? 0.05 * distance : 0)}s;
            "
          >
            <span class="coords">{cell.x},{cell.y}</span>

            {#if cell.hasStructure}
              <div class="entity-indicator structure-indicator" aria-hidden="true"></div>
            {/if}
            {#if cell.hasUnitGroup}
              <div class="entity-indicator unit-group-indicator" aria-hidden="true"></div>
            {/if}
            {#if cell.hasPlayer}
              <div class="entity-indicator player-indicator" aria-hidden="true"></div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
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

  /* Map takes full container space with dynamic background */
  .map {
    width: 100%;
    height: 100%;
    cursor: grab;
    overflow: hidden;
    box-sizing: border-box;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--terrain-color) 30%, var(--color-dark-navy)),
      color-mix(in srgb, var(--terrain-color) 15%, var(--color-dark-blue))
    );
    transition: background 1s ease;
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

  /* Only animate tiles within animated grid */
  .main-grid.animated .tile {
    opacity: 0;
    transform: scale(0.8);
    animation: revealTile 0.5s ease-out forwards;
    animation-fill-mode: both; /* Ensures final state is maintained */
  }
  
  /* For non-animated grid, tiles are always visible */
  .main-grid:not(.animated) .tile {
    opacity: 1;
    transform: scale(1);
  }
  
  /* Center tile style - make it appear first */
  .main-grid.animated .tile.center {
    z-index: 3;
    position: relative;
    animation: revealCenterTile 0.6s ease-out forwards;
    animation-delay: 0s;
    animation-fill-mode: both; /* Ensures final state is maintained */
  }
  
  /* For non-animated grid, center tile is styled without animation */
  .main-grid:not(.animated) .tile.center {
    position: relative;
    border: 0.12em solid rgba(255, 255, 255, 0.5);
    box-shadow: 
      inset 0 0 0 2px rgba(255, 255, 255, 0.7),
      inset 0 0 0.5em rgba(255, 255, 255, 0.3),
      0 0 1em rgba(255, 255, 255, 0.2);
    z-index: 3;
  }
  
  .tile {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 1em; /* Base size for mobile */
    color: rgba(255, 255, 255, 0.7);
    text-shadow: 0 0 0.1875em rgba(0, 0, 0, 0.5);
    user-select: none;
    z-index: 1;
  }

  /* All center tiles need the border */
  .tile.center {
    z-index: 3;
    position: relative;
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.7);
    border: 0.12em solid rgba(255, 255, 255, 0.5);
  }
  
  /* Hover effects - renamed to highlight */
  .map:not(.moving) .tile:hover,
  .tile.highlighted {
    z-index: 2;
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.7);
  }
  
  /* Moving state */
  .map.moving .tile {
    pointer-events: none;
    cursor: grabbing;
    z-index: auto;
  }

  .map.moving .tile.highlighted {
    box-shadow: none;
  }

  .coords {
    font-size: 0.6em; /* Smaller coords for mobile */
    opacity: 0.5;
  }

  .map-container.modal-open {
    cursor: grab;
  }

  .map-container.modal-open .map {
    pointer-events: all;
  }

  .entity-indicator {
    position: absolute;
    pointer-events: none;
    z-index: 4; /* Increased z-index to ensure visibility */
  }
  
  .structure-indicator {
    bottom: .2em;
    left: .2em;
    width: .6em; /* Slightly larger */
    height: .6em; /* Slightly larger */
    background: rgba(255, 255, 255, 0.9); /* Increased opacity */
    border: .0625em solid rgba(0, 0, 0, 0.3);
    box-shadow: 0 0 .15em rgba(255, 255, 255, 0.6); /* Added glow */
  }
  
  .unit-group-indicator {
    top: .2em;
    right: .2em;
    width: .5em; /* Slightly larger */
    height: .5em; /* Slightly larger */
    border-radius: 50%;
    background: rgba(255, 100, 100, 0.9); /* Increased opacity */
    border: .0625em solid rgba(0, 0, 0, 0.3);
    box-shadow: 0 0 .15em rgba(255, 100, 100, 0.6); /* Added red glow */
  }
  
  .player-indicator {
    top: .2em;
    left: .2em;
    width: .5em; /* Slightly larger */
    height: .5em; /* Slightly larger */
    background: rgba(100, 100, 255, 0.9); /* Increased opacity */
    border-radius: 50%;
    border: .0625em solid rgba(0, 0, 0, 0.3);
    box-shadow: 0 0 .15em rgba(100, 100, 255, 0.6); /* Added blue glow */
  }
  
  .tile.has-structure {
    box-shadow: inset 0 -0.1em 0.3em rgba(255, 255, 255, 0.3); /* Enhanced glow */
  }
  
  .tile.has-unit-group {
    box-shadow: inset 0 0 0.3em rgba(255, 100, 100, 0.4); /* Enhanced glow */
  }
  
  .tile.has-player {
    box-shadow: inset 0 0 0.3em rgba(100, 100, 255, 0.4); /* Enhanced glow */
  }
  
  /* Combined entity indicator styles for better visibility */
  .tile.has-structure.has-unit-group,
  .tile.has-structure.has-player,
  .tile.has-unit-group.has-player {
    box-shadow: inset 0 0 0.4em rgba(255, 255, 255, 0.5); /* Enhanced combined glow */
  }

  @media (hover: none) {
    .map {
      cursor: default; /* Better default for touch devices */
    }
    
    .map.moving {
      cursor: default;
    }
  }

  /* Prevent scrolling while dragging */
  .map-container.touch-active {
    touch-action: none;
    overflow: hidden;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
  }

  /* Make tile sizes responsive for mobile devices */
  @media (max-width: 768px) {
    .tile {
      font-size: 0.9em;
    }
    
    .coords {
      font-size: 0.6em;
    }
  }

  @media (max-width: 480px) {
    .tile {
      font-size: 0.7em;
    }
    
    .coords {
      opacity: 0.5;
      font-size: 0.5em;
    }
  }

  /* Medium screens */
  @media (min-width: 640px) {
    .tile {
      font-size: 1.1em;
    }
    
    .coords {
      font-size: 0.65em;
      opacity: 0.55;
    }
  }

  /* Large screens */
  @media (min-width: 1024px) {
    .tile {
      font-size: 1.2em;
    }
    
    .coords {
      font-size: 0.7em;
      opacity: 0.6;
    }
  }

  /* Very large screens */
  @media (min-width: 1440px) {
    .tile {
      font-size: 1.3em;
    }
  }

  @keyframes revealTile {
    0% {
      opacity: 0;
      transform: scale(0.8);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes revealCenterTile {
    0% {
      opacity: 0;
      transform: scale(0.8);
      box-shadow: 
        inset 0 0 1em rgba(255, 255, 255, 0.6),
        0 0 2em rgba(255, 255, 255, 0.4);
    }
    30% {
      opacity: 1;
      transform: scale(1.1);
      box-shadow: 
        inset 0 0 1em rgba(255, 255, 255, 0.6),
        0 0 2em rgba(255, 255, 255, 0.4);
    }
    100% {
      opacity: 1;
      transform: scale(1.05);
      box-shadow: 
        inset 0 0 0.5em rgba(255, 255, 255, 0.3),
        0 0 1em rgba(255, 255, 255, 0.2);
    }
  }
</style>
