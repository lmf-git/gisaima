<script>
  import { onMount, onDestroy } from "svelte";
  import { 
    mapState, 
    gridArray, 
    TILE_SIZE,
    resizeMap,
    startDrag,
    stopDrag,
    drag,
    checkDragState,
    moveMapByKeys,
    targetTileStore,
    updateHoveredTile,
    cleanupChunkSubscriptions,
    getEntitiesAt
  } from "../../lib/stores/map.js";
  
  // Local component state
  let mapElement = null;
  let resizeObserver = null;
  let dragStateCheckInterval = null;
  
  // Add flag to track initial animation state
  let introduced = $state(false);
  
  // Add touch support state variables
  let isTouching = $state(false);
  let touchStartX = $state(0);
  let touchStartY = $state(0);
  
  // Add memoization for entity indicators to prevent unnecessary recalculations
  const entityIndicatorsCache = new Map();
  
  // Only define isMoving once - remove the duplicate declaration
  const isMoving = $derived($mapState.isDragging || $mapState.keyboardNavigationInterval !== null || isTouching);
  
  // Rather than tracking entity count, track entity change counter directly from the store
  const entityChangeCounter = $derived($mapState._entityChangeCounter || 0);
  
  // Only clear the cache when absolutely necessary - when entities change or location changes
  $effect(() => {
    if (entityChangeCounter > 0 || $mapState.targetCoord) {
      entityIndicatorsCache.clear();
    }
  });

  // Simplified entity indicator check that doesn't create new objects on each call
  function checkEntityIndicators(x, y) {
    const cacheKey = `${x},${y}`;
    
    if (entityIndicatorsCache.has(cacheKey)) {
      return entityIndicatorsCache.get(cacheKey);
    }
    
    const entities = getEntitiesAt(x, y);
    const result = {
      hasStructure: !!entities.structure,
      hasUnitGroup: !!entities.unitGroup,
      hasPlayer: !!entities.player
    };
    
    entityIndicatorsCache.set(cacheKey, result);
    return result;
  }
  
  // Initialize when mounted
  onMount(() => {
    // Setup resize observer
    resizeObserver = new ResizeObserver(() => resizeMap(mapElement));
    resizeObserver.observe(mapElement);
    resizeMap(mapElement);
    
    // Setup keyboard navigation
    const keyboardCleanup = setupKeyboardNavigation();
    
    // Tiles should not animate into view after the introduction completes.
    setTimeout(() => introduced = true, 1200);

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
  
  // Make sure to clean up Firebase subscriptions when component is destroyed
  onDestroy(() => cleanupChunkSubscriptions());
  
  // Simplify keyboard navigation without redundant hover clearing
  const setupKeyboardNavigation = () => {
    const keyHandler = event => {
      // Prevent keyboard navigation until introduction completes
      if (!introduced) return;
      
      const key = event.key.toLowerCase();
      const isNavigationKey = ["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(key);
      
      if (!isNavigationKey) return;
      
      if (event.type === "keydown") {       
        $mapState.keysPressed.add(key);
        
        if (!$mapState.keyboardNavigationInterval) {
          moveMapByKeys(); // This will use our unified moveMapTo function now
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
    // Prevent drag until introduction completes
    if (!introduced) return;
    
    if (event.button !== 0) return;
    
    if (startDrag(event) && mapElement) {
      mapElement.style.cursor = "grabbing";
      mapElement.classList.add("dragging");
    }
    event.preventDefault();
  };

  const handleStopDrag = () => {
    if (stopDrag() && mapElement) {
      mapElement.style.cursor = "grab";
      mapElement.classList.remove("dragging");
    }
  };
  
  // Add a check after mouse/touch operations instead of continuous interval
  function checkDragStateManually() {
    checkDragState();
  }
  
  // Simplified global event handlers
  const globalMouseDown = () => $mapState.isMouseActuallyDown = true;
  const globalMouseUp = () => {
    $mapState.isMouseActuallyDown = false;
    if ($mapState.isDragging) handleStopDrag();
    checkDragStateManually(); // Check once after mouse up
  };
  const globalMouseMove = event => {
    if ($mapState.isMouseActuallyDown && $mapState.isDragging) drag(event);
    else if (!$mapState.isMouseActuallyDown && $mapState.isDragging) {
      handleStopDrag();
      checkDragStateManually(); // Check once after state change
    }
  };

  // Touch handling functions
  function handleTouchStart(event) {
    // Prevent touch actions until introduction completes
    if (!introduced || !$mapState.isReady) return;
    
    // Prevent default to stop page scrolling immediately
    event.preventDefault();
    
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    isTouching = true;
    
    // Update the map state similar to mouse drag start
    if (startDrag({
      clientX: touch.clientX,
      clientY: touch.clientY,
      button: 0, // Simulate left button
      preventDefault: () => {}
    }) && mapElement) {
      mapElement.style.cursor = "grabbing";
      mapElement.classList.add("dragging");
    }
  }
  
  function handleTouchMove(event) {
    if (!isTouching || !$mapState.isReady) return;
    event.preventDefault(); // Prevent scrolling when dragging
    
    // Increase touch sensitivity by applying a multiplier to touch movements
    const touchSensitivity = 1.5; // Increase sensitivity for touch dragging
    const touch = event.touches[0];
    
    // Apply the sensitivity multiplier to make touch movement more responsive
    const adjustedClientX = touchStartX + (touch.clientX - touchStartX) * touchSensitivity;
    const adjustedClientY = touchStartY + (touch.clientY - touchStartY) * touchSensitivity;
    
    // Update the map via the drag function with enhanced sensitivity
    drag({
      clientX: adjustedClientX,
      clientY: adjustedClientY
    });
  }
  
  function handleTouchEnd() {
    if (!isTouching) return;
    isTouching = false;
    
    if (mapElement) {
      mapElement.style.cursor = "grab";
      mapElement.classList.remove("dragging");
    }
    
    // End the drag and check state once
    stopDrag();
    checkDragStateManually();
  }

  // Add improved functions to track hover state
  function higlight(cell) {
    if (!isMoving) updateHoveredTile(cell.x, cell.y);
  }
  
  // Track if a tile is currently hovered - for minimap sync
  const isHighlighted = (cell) => 
    !isMoving && $mapState.hoveredTile && 
    cell.x === $mapState.hoveredTile.x && 
    cell.y === $mapState.hoveredTile.y;
  
  // Only clear hover on movement when necessary
  $effect(() => {
    if (isMoving && $mapState.hoveredTile) {
      updateHoveredTile(null, null);
    }
  });

  // Track the background color based on target tile
  const backgroundColor = $derived(
    $targetTileStore && $targetTileStore.color ? $targetTileStore.color : "var(--color-dark-blue)"
  );

</script>

<svelte:window
  onmousedown={globalMouseDown}
  onmouseup={globalMouseUp}
  onmousemove={globalMouseMove}
  onmouseleave={handleStopDrag}
  onblur={() => $mapState.isDragging && handleStopDrag()}
  onvisibilitychange={() => document.visibilityState === 'hidden' && handleStopDrag()}
/>

<div class="map-container" style="--tile-size: {TILE_SIZE}em;" class:modal-open={$mapState.showDetails} class:touch-active={isTouching}>
  <div
    class="map"
    bind:this={mapElement}
    onmousedown={handleStartDrag}
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
    {#if $mapState.isReady}
      <div class="grid main-grid" 
        style="--cols: {$mapState.cols}; --rows: {$mapState.rows};" 
        role="presentation"
        class:animated={!introduced}
      >
        {#each $gridArray as cell (cell.x + ':' + cell.y)}
          {@const distance = Math.sqrt(
            Math.pow(cell.x - $mapState.targetCoord.x, 2) + 
            Math.pow(cell.y - $mapState.targetCoord.y, 2)
          )}
          {@const entityIndicators = checkEntityIndicators(cell.x, cell.y)}
          <div
            class="tile"
            class:center={cell.isCenter}
            class:highlighted={isHighlighted(cell)}
            class:has-structure={entityIndicators.hasStructure}
            class:has-unit-group={entityIndicators.hasUnitGroup}
            class:has-player={entityIndicators.hasPlayer}
            onmouseenter={() => higlight(cell)}
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

            {#if entityIndicators.hasStructure}
              <div class="entity-indicator structure-indicator" aria-hidden="true"></div>
            {/if}
            {#if entityIndicators.hasUnitGroup}
              <div class="entity-indicator unit-group-indicator" aria-hidden="true"></div>
            {/if}
            {#if entityIndicators.hasPlayer}
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
    /* No need to specify delay here, it's calculated for each tile */
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
    bottom: 0.2em;
    left: 0.2em;
    width: 0.6em; /* Slightly larger */
    height: 0.6em; /* Slightly larger */
    background: rgba(255, 255, 255, 0.9); /* Increased opacity */
    border: 0.0625em solid rgba(0, 0, 0, 0.3);
    box-shadow: 0 0 0.15em rgba(255, 255, 255, 0.6); /* Added glow */
  }
  
  .unit-group-indicator {
    top: 0.2em;
    right: 0.2em;
    width: 0.5em; /* Slightly larger */
    height: 0.5em; /* Slightly larger */
    border-radius: 50%;
    background: rgba(255, 100, 100, 0.9); /* Increased opacity */
    border: 0.0625em solid rgba(0, 0, 0, 0.3);
    box-shadow: 0 0 0.15em rgba(255, 100, 100, 0.6); /* Added red glow */
  }
  
  .player-indicator {
    top: 0.2em;
    left: 0.2em;
    width: 0.5em; /* Slightly larger */
    height: 0.5em; /* Slightly larger */
    background: rgba(100, 100, 255, 0.9); /* Increased opacity */
    border-radius: 50%;
    border: 0.0625em solid rgba(0, 0, 0, 0.3);
    box-shadow: 0 0 0.15em rgba(100, 100, 255, 0.6); /* Added blue glow */
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
