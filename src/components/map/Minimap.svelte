<script>
  import { derived } from 'svelte/store';
  import { 
    map, 
    ready,
    coordinates,
    highlightedStore,
    EXPANDED_COLS_FACTOR,
    EXPANDED_ROWS_FACTOR,
    setHighlighted,
    moveTarget
  } from '../../lib/stores/map.js';
  import { getChunkKey } from 'gisaima-shared/map/cartography.js';
  import { onDestroy } from "svelte";
  
  // Accept closing prop from parent
  const { closing = false } = $props();
  
  // Only keep state needed for functionality, not visibility
  let isDrag = $state(false);
  let dragX = $state(0);
  let dragY = $state(0);
  let minimap = $state(null);
  let wasDrag = $state(false);
  let dist = $state(0);
  let isTouching = $state(false);

  // Constants
  const DRAG_THRESHOLD = 5;
  
  // Calculate minimap dimensions
  const tileCountX = $derived($ready ? $map.cols * EXPANDED_COLS_FACTOR : 48);
  const tileCountY = $derived($ready ? $map.rows * EXPANDED_ROWS_FACTOR : 32);
  const viewRangeX = $derived(Math.floor(tileCountX / 2));
  const viewRangeY = $derived(Math.floor(tileCountY / 2));
  
  // Filter coordinates for minimap
  const grid = $derived(coordinates);
  
  // Add minimapDragAction for Minimap-specific logic
  // Add a throttle mechanism for drag updates
  let lastDragUpdate = 0;
  const DRAG_THROTTLE = 50; // ms
  
  // Process drag with throttling
  function minimapDragAction(event) {
    if (event.button !== undefined && event.button !== 0) return false;
    
    // Start drag
    if (event.type === 'dragstart' || event.type === 'touchstart') {
      isDrag = true;
      dragX = event.clientX || event.touches?.[0]?.clientX;
      dragY = event.clientY || event.touches?.[0]?.clientY;
      dist = 0;
      wasDrag = false;
      
      // Clear highlighted tile when drag starts
      setHighlighted(null, null);
      
      return true;
    }
    
    // Process drag with throttling to prevent excessive updates
    else if ((event.type === 'dragmove' || event.type === 'touchmove') && isDrag) {
      const currentTime = Date.now();
      
      // Skip updates that come too quickly
      if (currentTime - lastDragUpdate < DRAG_THROTTLE) {
        return false;
      }
      
      const currentX = event.clientX || event.touches?.[0]?.clientX;
      const currentY = event.clientY || event.touches?.[0]?.clientY;
      
      const deltaX = currentX - dragX;
      const deltaY = currentY - dragY;
      
      dist += Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      
      if (dist > DRAG_THRESHOLD) {
        wasDrag = true;
      }
      
      const minimapRect = minimap.getBoundingClientRect();
      const pixelsPerTileX = minimapRect.width / tileCountX;
      const pixelsPerTileY = minimapRect.height / tileCountY;
      
      const cellsMovedX = Math.round(deltaX / pixelsPerTileX);
      const cellsMovedY = Math.round(deltaY / pixelsPerTileY);
      
      if (cellsMovedX === 0 && cellsMovedY === 0) return false;
      
      // Update timestamp for throttling
      lastDragUpdate = currentTime;
      
      moveTarget($map.target.x - cellsMovedX, $map.target.y - cellsMovedY);
      
      dragX = currentX;
      dragY = currentY;
      
      return true;
    }
    
    // End drag
    else if (event.type === 'dragend' || event.type === 'touchend') {
      const wasDragging = isDrag;
      isDrag = false;
      return wasDragging;
    }
    
    return false;
  }
  
  // Drag handling
  function handleMinimapDragStart(event) {
    if (event.button !== 0 || !$ready) return;
    
    // Create a new event object with only the properties we need
    // Instead of trying to call preventDefault on the synthetic event
    minimapDragAction({
      type: 'dragstart',
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.button
    });
    
    // Call preventDefault on the original DOM event
    if (event.preventDefault) {
      event.preventDefault();
    }
  }
  
  function handleMinimapDrag(event) {
    if (!isDrag || !$ready) return;
    
    // Create a new event object with only the properties we need
    minimapDragAction({
      type: 'dragmove',
      clientX: event.clientX,
      clientY: event.clientY
    });
  }
  
  function handleMinimapDragEnd() {
    if (!isDrag) return;
    minimapDragAction({ type: 'dragend' });
  }
  
  function globalMinimapMouseUp() {
    if (isDrag) handleMinimapDragEnd();
  }
  
  function globalMinimapMouseMove(event) {
    if (isDrag) handleMinimapDrag(event);
  }

  // Touch handling
  function handleTouchStart(event) {
    if (!$ready) return;
    
    // Always use the original DOM event's preventDefault
    if (event.preventDefault) {
      event.preventDefault();
    }
    
    isTouching = true;
    
    minimapDragAction({
      type: 'touchstart',
      touches: event.touches
    });
  }
  
  function handleTouchMove(event) {
    if (!isTouching || !$ready) return;
    
    // Always use the original DOM event's preventDefault
    if (event.preventDefault) {
      event.preventDefault();
    }
    
    minimapDragAction({
      type: 'touchmove',
      touches: event.touches
    });
  }
  
  function handleTouchEnd() {
    minimapDragAction({ type: 'dragend' });
    isTouching = false;
  }

  // Updated click handler for the minimap
  function handleMinimapClick(event) {
    if (wasDrag || !$ready) return;
    
    // First check if there's a highlighted tile and use it
    if ($highlightedStore) {
      console.log('Moving to highlighted minimap tile:', { x: $highlightedStore.x, y: $highlightedStore.y });
      moveTarget($highlightedStore.x, $highlightedStore.y);
      setHighlighted(null, null);
      return;
    }
    
    // If no highlighted tile, find the tile directly clicked
    // Get the minimap grid element and its dimensions
    const gridElement = minimap.querySelector('.minimap-grid');
    if (!gridElement) return;
    
    const rect = gridElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Calculate which tile was clicked based on position
    const tileWidth = rect.width / tileCountX;
    const tileHeight = rect.height / tileCountY;
    
    const relativeCol = Math.floor(x / tileWidth);
    const relativeRow = Math.floor(y / tileHeight);
    
    // Bounds check
    if (relativeCol < 0 || relativeCol >= tileCountX || relativeRow < 0 || relativeRow >= tileCountY) {
      return;
    }
    
    // Calculate global coordinates
    const globalX = relativeCol - viewRangeX + $map.target.x;
    const globalY = relativeRow - viewRangeY + $map.target.y;
    
    console.log('Moving to clicked minimap tile:', { x: globalX, y: globalY });
    moveTarget(globalX, globalY);
  }

  // Add hover timeout variable
  let minimapHoverTimeout = $state(null);
  
  // Add a consistent hover handler
  function handleTileHover(cell) {
    if (isDrag || isTouching) return;
    
    // Clear any pending hover updates
    if (minimapHoverTimeout) clearTimeout(minimapHoverTimeout);
    
    // Use a small timeout to match Grid behavior
    minimapHoverTimeout = setTimeout(() => {
      if (!isDrag && !isTouching && (!$highlightedStore || $highlightedStore.x !== cell.x || $highlightedStore.y !== cell.y)) {
        setHighlighted(cell.x, cell.y);
      }
      minimapHoverTimeout = null;
    }, 50);
  }

  // Cleanup hover timeout on component destroy
  onDestroy(() => {
    if (minimapHoverTimeout) clearTimeout(minimapHoverTimeout);
  });
</script>

<svelte:window
  onmouseup={globalMinimapMouseUp}
  onmousemove={globalMinimapMouseMove}
  onmouseleave={globalMinimapMouseUp}
/>

<div class="map-container" class:touch-active={isTouching} class:ready={$ready}>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div 
    class="minimap"
    class:ready={$ready}
    class:closing={closing}
    aria-hidden="true"
    bind:this={minimap}
    onclick={handleMinimapClick}
    onmousedown={handleMinimapDragStart}
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
    ontouchcancel={handleTouchEnd}
    class:drag={isDrag}
    class:touch-drag={isTouching}>
    {#if $ready && $grid.length > 0}
      <div class="minimap-grid" style="--grid-cols: {tileCountX}; --grid-rows: {tileCountY};">
        {#each $grid as cell}
          {@const relativeX = cell.x - $map.target.x + viewRangeX} 
          {@const relativeY = cell.y - $map.target.y + viewRangeY} 
          {@const isTarget = cell.x === $map.target.x && cell.y === $map.target.y}
          <div
            class="tile"
            class:center={isTarget} 
            class:visible={cell.isInMainView}
            class:highlighted={cell.highlighted}
            class:has-structure={cell.structure}
            class:has-spawn={cell.structure?.type === 'spawn'}
            class:has-players={cell.players?.length > 0}
            class:has-groups={cell.groups?.length > 0}
            style="
              --tile-color: {cell.color};
              grid-column-start: {relativeX + 1};
              grid-row-start: {relativeY + 1};
            "
            onmouseenter={() => handleTileHover(cell)}
            role="presentation"
            aria-hidden="true">
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .map-container {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 998;
  }
  
  /* Remove the toggle-button styles */
  
  .minimap {
    position: absolute;
    top: 0;
    right: 0;
    overflow: hidden;
    background: var(--color-panel-bg);
    border: 0.0625em solid var(--color-panel-border);
    box-shadow: 0 0.1875em 0.625em var(--color-shadow);
    cursor: grab;
    transition: box-shadow 0.2s ease;
    outline: none;
    opacity: 1; /* Always visible within container */
    animation: slideInFromRight 0.8s ease-out forwards;
  }

  .minimap.closing {
    animation: slideOutToRight 0.8s ease-in forwards;
  }
  
  .minimap-grid {
    display: grid;
    grid-template-columns: repeat(var(--grid-cols), var(--mini-tile-size, 0.5em));
    grid-template-rows: repeat(var(--grid-rows), var(--mini-tile-size, 0.5em));
    --mini-tile-size: 0.5em;
  }
  
  @keyframes slideInFromRight {
    0% {
      transform: translateX(100%);
      opacity: 0;
    }
    100% {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOutToRight {
    0% {
      transform: translateX(0);
      opacity: 1;
    }
    100% {
      transform: translateX(100%);
      opacity: 0;
    }
  }
  
  .tile {
    width: var(--mini-tile-size);
    height: var(--mini-tile-size);
    box-sizing: border-box;
    position: relative;
    z-index: 1;
    background-color: var(--tile-color); /* Set background from CSS var instead of inline */
  }
  
  .tile.has-structure {
    border-bottom: 0.15em solid rgba(255, 255, 255, 0.6);
    border-left: 0.15em solid rgba(255, 255, 255, 0.6);
  }
  
  .tile.has-players {
    border-top: 0.15em solid rgba(100, 100, 255, 0.7);
    border-left: 0.15em solid rgba(100, 100, 255, 0.7);
  }
  
  .tile.has-groups {
    border-top: 0.15em solid rgba(255, 100, 100, 0.7);
    border-right: 0.15em solid rgba(255, 100, 100, 0.7);
  }
  
  .tile.has-spawn {
    border: 0.15em solid rgba(0, 255, 255, 0.8);
    border-radius: 50%;
  }
  
  .tile.visible::before {
    content: "";
    position: absolute;
    inset: 0;
    background-color: rgba(255, 255, 255, 0.2);
    z-index: 2;
    pointer-events: none;
  }
  
  .tile.highlighted::after {
    content: "";
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 0 0.1em white, 0 0 0.2em white;
    z-index: 3;
    pointer-events: none;
  }
  
  .tile.center {
    z-index: 5;
    border: 0.125em solid white;
  }
  
  .tile.center::after {
    content: '';
    position: absolute;
    inset: 0;
    box-shadow: 0 0 0.25em rgba(255, 255, 255, 0.8);
    pointer-events: none;
    z-index: 5;
  }
  
  .tile.visible {
    z-index: 2;
  }
  
  .tile.highlighted {
    z-index: 4;
  }
  
  .tile.has-structure.has-players {
    border-left: 0.15em solid rgba(177, 177, 255, 0.7);
  }
  
  .tile.has-structure.has-spawn {
    border: 0.15em solid rgba(0, 255, 255, 0.8);
    border-radius: 50%;
  }
  
  .tile.has-spawn.has-players,
  .tile.has-spawn.has-groups,
  .tile.has-spawn.has-players.has-groups {
    border: 0.15em solid rgba(0, 255, 255, 0.8);
    border-radius: 50%;
  }
  
  .minimap.drag,
  .minimap.touch-drag {
    cursor: grabbing;
  }

  @media (hover: none) {
    .minimap {
      cursor: default; /* Remove grab cursor on touch devices */
    }
    
    .minimap.drag,
    .minimap.touch-drag {
      cursor: default;
    }
  }

  .map-container.touch-active {
    touch-action: none;
  }
</style>