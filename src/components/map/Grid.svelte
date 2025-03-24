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
    setHighlighted
  } from "../../lib/stores/map.js";
  import { game, currentPlayer } from "../../lib/stores/game.js";
  
  // Convert to $props syntax
  const { detailed = false } = $props();
  
  // Local component state
  let mapElement = null;
  let resizeObserver = null;
  let introduced = $state(false);
  let keysPressed = $state(new Set());
  let keyboardNavigationInterval = $state(null);
  let wasDrag = $state(false);
  let dist = $state(0);
  
  // Constants
  const DRAG_THRESHOLD = 5;
  
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
      
      // Reset drag tracking on start
      dist = 0;
      wasDrag = false;
      
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

      // Calculate distance moved to determine if this is a drag
      dist += Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      
      if (dist > DRAG_THRESHOLD) {
        wasDrag = true;
      }

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
  let hoverTimeout = null;
  function handleTileHover(cell) {
    if (isMoving) return;
    
    // Clear any pending hover updates
    if (hoverTimeout) clearTimeout(hoverTimeout);
    
    // Set a short timeout before updating the highlighted tile
    hoverTimeout = setTimeout(() => {
      const prevHighlight = $map.highlighted;
      if (!prevHighlight || prevHighlight.x !== cell.x || prevHighlight.y !== cell.y) {
        console.log('Highlighting tile:', { x: cell.x, y: cell.y });
        setHighlighted(cell.x, cell.y);
      }
      hoverTimeout = null;
    }, 50); // 50ms debounce
  }
  
  // Clear highlight state when moving
  $effect(() => {
    if (isMoving && $map.highlighted) {  // Renamed from hoveredTile
      setHighlighted(null, null);  // Renamed from updateHoveredTile
    }
  });
  
  // Modify handleGridClick function to handle clicks on the grid or its children
  function handleGridClick(event) {
    // Increment click counter for debugging
    clickCount++;
    lastClickTime = Date.now();
    
    console.log('Grid click detected:', { 
      clickCount, 
      wasDrag, 
      ready: $ready,
      event: {
        target: event.target.className,
      }
    });
    
    if (wasDrag) {
      console.log('Click ignored: wasDrag is true');
      return;
    }
    
    if (!$ready) {
      console.log('Click ignored: map not ready');
      return;
    }
    
    // First try to find if we clicked directly on a tile
    let tileElement = event.target.closest('.tile');
    
    // If we didn't click directly on a tile, find the tile at the click position
    if (!tileElement) {
      // Get click position relative to the grid
      const gridElement = event.currentTarget.querySelector('.main-grid');
      if (!gridElement) {
        console.log('Click ignored: grid not found');
        return;
      }
      
      const rect = gridElement.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      // Calculate which tile was clicked based on position
      const tileWidth = rect.width / $map.cols;
      const tileHeight = rect.height / $map.rows;
      
      const col = Math.floor(x / tileWidth);
      const row = Math.floor(y / tileHeight);
      
      // Bounds check
      if (col < 0 || col >= $map.cols || row < 0 || row >= $map.rows) {
        console.log('Click ignored: outside grid bounds');
        return;
      }
      
      // Calculate the global coordinates of the clicked tile
      // The center of the grid is the target position
      const centerCol = Math.floor($map.cols / 2);
      const centerRow = Math.floor($map.rows / 2);
      
      const clickedX = $map.target.x - centerCol + col;
      const clickedY = $map.target.y - centerRow + row;
      
      console.log('Moving to calculated tile:', { x: clickedX, y: clickedY });
      moveTarget(clickedX, clickedY);
    } 
    else {
      // Handle direct tile click using aria-label
      const ariaLabel = tileElement.getAttribute('aria-label');
      const coordsMatch = ariaLabel ? ariaLabel.match(/Coordinates (-?\d+),(-?\d+)/) : null;
      
      if (!coordsMatch) {
        console.log('Click ignored: no coordinates found in tile');
        return;
      }
      
      const tileX = parseInt(coordsMatch[1], 10);
      const tileY = parseInt(coordsMatch[2], 10);
      
      console.log('Moving to clicked tile:', { x: tileX, y: tileY });
      moveTarget(tileX, tileY);
    }
    
    // Clear highlighted tile after moving
    setHighlighted(null, null);
    
    event.preventDefault();
  }

  // Add debug state for click tracking
  let lastClickTime = $state(0);
  let clickCount = $state(0);

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

  // Clean up hover timeout on component destroy
  onDestroy(() => {
    if (hoverTimeout) clearTimeout(hoverTimeout);
  });

  // Get background color from target tile
  const backgroundColor = $derived($targetStore?.color || "var(--color-dark-blue)");

  // Add a function to determine structure type class
  function getStructureClass(structure) {
    if (!structure) return '';
    
    switch(structure.type) {
      case 'spawn': return 'spawn-structure';
      case 'watchtower': return 'watchtower-structure';
      case 'fortress': return 'fortress-structure';
      default: return '';
    }
  }

  // Get player position from game store
  const playerPosition = $derived(() => {
    if ($game.playerWorldData?.lastLocation) {
      return {
        x: $game.playerWorldData.lastLocation.x,
        y: $game.playerWorldData.lastLocation.y
      };
    }
    return null;
  });
  
  // Function to check if a tile is the player's position
  function isPlayerPosition(x, y) {
    return playerPosition && playerPosition.x === x && playerPosition.y === y;
  }
  
  // Get current player info from the currentPlayer store for grid display
  const currentPlayerId = $derived($currentPlayer?.uid);
  
  // Function to check if a player entity is the current player
  function isCurrentPlayer(playerEntity) {
    return playerEntity && playerEntity.uid === currentPlayerId;
  }
  
  // Check if any players on a tile represent the current player
  function hasCurrentPlayer(players) {
    return players && players.some(player => isCurrentPlayer(player));
  }

  // Helper function to get rarity glow size
  function getRarityGlowSize(rarity) {
    switch(rarity) {
      case 'mythic': return '1.2em';
      case 'legendary': return '0.9em';
      case 'epic': return '0.7em';
      case 'rare': return '0.5em';
      case 'uncommon': return '0.3em';
      default: return '0';
    }
  }
  
  // Helper function to get rarity color
  function getRarityColor(rarity) {
    switch(rarity) {
      case 'mythic': return 'rgba(255, 128, 255, 0.5)'; // Pink/Purple
      case 'legendary': return 'rgba(255, 165, 0, 0.5)'; // Orange
      case 'epic': return 'rgba(148, 0, 211, 0.4)'; // Purple
      case 'rare': return 'rgba(0, 112, 221, 0.4)'; // Blue
      case 'uncommon': return 'rgba(30, 255, 0, 0.3)'; // Green
      default: return 'transparent';
    }
  }
  
  // Add debug effect to track highlighted tile changes
  $effect(() => {
    console.log('Highlighted tile changed to:', $map.highlighted);
  });
</script>

<svelte:window
  onmouseup={handleMouseUp}
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseUp}
  onblur={() => $map.isDragging && handleMouseUp()}
  onvisibilitychange={() => document.visibilityState === 'hidden' && handleMouseUp()}
/>

<!-- Add onclick handler to the map div -->
<div class="map-container" style="--tile-size: {TILE_SIZE}em;" class:modal-open={detailed} class:touch-active={$map.isDragging && $map.dragSource === 'map'}>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="map"
    bind:this={mapElement}
    onmousedown={handleMouseDown}
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
    ontouchcancel={handleTouchEnd}
    onclick={handleGridClick}
    class:moving={isMoving}
    style="--terrain-color: {backgroundColor};"
    role="grid"
    tabindex="0"
    aria-label="Interactive coordinate map. Use WASD or arrow keys to navigate."
  >
    <!-- Add debug display in the corner -->
    <div class="debug-info" role="status" aria-live="polite">
      Clicks: {clickCount} | Last: {lastClickTime > 0 ? new Date(lastClickTime).toLocaleTimeString() : 'none'}
      <br>
      wasDrag: {wasDrag} | dist: {dist.toFixed(1)}
    </div>
    
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
          {@const isCurrentPlayerTile = hasCurrentPlayer(cell.players)}
          <div
            class="tile {getStructureClass(cell.structure)} {cell.terrain?.rarity || 'common'}"
            class:center={cell.isCenter}
            class:highlighted={cell.highlighted}
            class:has-structure={cell.structure}
            class:has-groups={cell.groups?.length > 0}
            class:has-players={cell.players?.length > 0}
            class:player-position={isPlayerPosition(cell.x, cell.y)}
            class:current-player-tile={isCurrentPlayerTile}
            onmouseenter={() => handleTileHover(cell)}
            role="gridcell"
            tabindex="-1"
            aria-label="Coordinates {cell.x},{cell.y}, biome: {cell.biome.name}{cell.terrain?.rarity ? ', '+cell.terrain.rarity : ''}{isPlayerPosition(cell.x, cell.y) ? ', your position' : ''}{isCurrentPlayerTile ? ', your character' : ''}"
            aria-current={cell.isCenter ? "location" : undefined}
            style="
              background-color: {cell.color};
              animation-delay: {!introduced && cell.isCenter ? 0 : (!introduced ? 0.05 * distance : 0)}s;
              {cell.terrain?.rarity && cell.terrain.rarity !== 'common' ? `box-shadow: inset 0 0 ${getRarityGlowSize(cell.terrain.rarity)} ${getRarityColor(cell.terrain.rarity)};` : ''}
            "
          >
            <span class="coords">{cell.x},{cell.y}</span>

            <!-- Add player position indicator -->
            {#if isPlayerPosition(cell.x, cell.y)}
              <div class="entity-indicator player-position-indicator" aria-hidden="true"></div>
            {/if}

            {#if cell.structure}
              <div class="entity-indicator structure-indicator {cell.structure.type}-indicator" aria-hidden="true"></div>
            {/if}

            {#if cell.players?.length > 0}
              <div class="entity-indicator player-indicator" class:current-player-indicator={isCurrentPlayerTile} aria-hidden="true">
                {#if cell.players.length > 1}
                  <span class="count">{cell.players.length}</span>
                {/if}
              </div>
            {/if}

            {#if cell.groups?.length > 0}
              <div class="entity-indicator group-indicator" aria-hidden="true">
                {#if cell.groups.length > 1}
                  <span class="count">{cell.groups.length}</span>
                {/if}
              </div>
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
    font-family: var(--font-body); /* Add body font for any text in tiles */
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
    font-family: var(--font-heading); /* Add heading font for coordinates */
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
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .structure-indicator {
    bottom: .2em;
    left: .2em;
    width: .6em;
    height: .6em;
    background: rgba(255, 255, 255, 0.9);
    border: .0625em solid rgba(0, 0, 0, 0.3);
    box-shadow: 0 0 .15em rgba(255, 255, 255, 0.6);
  }
  
  .group-indicator {
    top: .2em;
    right: .2em;
    width: .5em;
    height: .5em;
    border-radius: 50%;
    background: rgba(255, 100, 100, 0.9);
    border: .0625em solid rgba(0, 0, 0, 0.3);
    box-shadow: 0 0 .15em rgba(255, 100, 100, 0.6);
    position: relative;
  }
  
  .player-indicator {
    top: .2em;
    left: .2em;
    width: .5em;
    height: .5em;
    background: rgba(100, 100, 255, 0.9);
    border-radius: 50%;
    border: .0625em solid rgba(0, 0, 0, 0.3);
    box-shadow: 0 0 .15em rgba(100, 100, 255, 0.6);
    position: relative;
  }

  /* Style for count text inside indicators */
  .count {
    font-size: 0.6em;
    font-weight: bold;
    color: rgba(0, 0, 0, 0.8);
    line-height: 1;
    font-family: var(--font-heading); /* Add heading font for counts */
  }
  
  /* Remove the pseudo element styles for data-count */
  
  .tile.has-structure {
    box-shadow: inset 0 -0.1em 0.3em rgba(255, 255, 255, 0.3);
  }
  
  .tile.has-groups {
    box-shadow: inset 0 0 0.3em rgba(255, 100, 100, 0.4);
  }
  
  .tile.has-players {
    box-shadow: inset 0 0 0.3em rgba(100, 100, 255, 0.4);
  }
  
  /* Combined entity indicator styles for better visibility */
  .tile.has-structure.has-groups,
  .tile.has-structure.has-players,
  .tile.has-groups.has-players {
    box-shadow: inset 0 0 0.4em rgba(255, 255, 255, 0.5);
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

  /* Special styles for structure types */
  .spawn-structure {
    box-shadow: inset 0 0 0.5em rgba(0, 255, 255, 0.6);
  }
  
  .spawn-indicator {
    background: rgba(0, 255, 255, 0.9) !important;
    box-shadow: 0 0 .25em rgba(0, 255, 255, 0.8) !important;
    border-radius: 50% !important;
  }
  
  .watchtower-structure {
    box-shadow: inset 0 0 0.4em rgba(255, 255, 150, 0.4);
  }
  
  .fortress-structure {
    box-shadow: inset 0 0 0.4em rgba(255, 200, 100, 0.5);
  }
  
  /* Make spawn structures more prominent */
  .tile.spawn-structure:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border: 0.15em double rgba(0, 255, 255, 0.6);
    pointer-events: none;
    z-index: 3;
  }
  
  /* Override box-shadow styles when multiple features exist */
  .tile.has-structure.has-groups.spawn-structure,
  .tile.has-structure.has-players.spawn-structure {
    box-shadow: inset 0 0 0.5em rgba(0, 255, 255, 0.6);
  }

  /* Player position indicator */
  .player-position {
    position: relative;
    box-shadow: inset 0 0 0.6em rgba(255, 215, 0, 0.7);
    z-index: 2;
  }
  
  .player-position:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border: 0.15em solid gold;
    pointer-events: none;
    z-index: 2;
  }
  
  .player-position-indicator {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 0.7em;
    height: 0.7em;
    background: gold;
    border: 0.1em solid rgba(0, 0, 0, 0.5);
    border-radius: 50%;
    box-shadow: 0 0 0.3em gold;
    z-index: 10;
    pointer-events: none;
  }
  
  /* Style for when the player character is on a tile */
  .current-player-tile .player-indicator {
    background: rgba(64, 224, 208, 0.9); /* Turquoise to distinguish current player */
    border-color: rgba(255, 255, 255, 0.7);
    box-shadow: 0 0 0.2em turquoise;
  }
  
  .current-player-indicator {
    transform: scale(1.1);
    animation: pulse 2s infinite;
  }
  
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(64, 224, 208, 0.7); }
    70% { box-shadow: 0 0 0 0.4em rgba(64, 224, 208, 0); }
    100% { box-shadow: 0 0 0 0 rgba(64, 224, 208, 0); }
  }
  
  /* Make sure player position indicator works with other indicators */
  .tile.player-position.has-structure,
  .tile.player-position.has-groups,
  .tile.player-position.has-players,
  .tile.player-position.spawn-structure {
    box-shadow: inset 0 0 0.6em rgba(255, 215, 0, 0.7);
  }

  /* Rarity styles */
  .tile.mythic {
    z-index: 5; /* Make mythic tiles appear on top */
  }
  
  .tile.legendary {
    z-index: 4;
  }
  
  .tile.epic {
    z-index: 3;
  }

  /* Add debug info display */
  .debug-info {
    position: absolute;
    top: 10px;
    left: 10px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 5px;
    font-size: 12px;
    border-radius: 4px;
    z-index: 100;
    pointer-events: none;
    user-select: none;
  }
</style>
