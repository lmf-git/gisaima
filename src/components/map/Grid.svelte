<script>
  import { onMount } from "svelte";
  import Legend from "./Legend.svelte";
  import Axes from "./Axes.svelte";
  import Details from "./Details.svelte";

  // Position state
  let isDragging = false,
    startX,
    startY;

  // Track the target coordinate at the center of the view
  let targetCoord = { x: 0, y: 0 };

  // Modal state
  let showDetailsModal = false;

  // Add keyboard navigation state
  let keysPressed = new Set();
  let keyboardNavigationInterval = null;
  const KEYBOARD_MOVE_SPEED = 200; // ms between moves

  // Derived position values
  let offsetX = 0,
    offsetY = 0;

  // Map configuration
  let mapElement;
  let cols = 0,
    rows = 0;
  let isReady = false;
  let resizeObserver;

  // Single parameter for tile size (now in em units)
  const tileSize = 7.5; // Changed from 120px to 7.5em

  // Options for axis bars
  const showAxisBars = true;

  // Chunk tracking
  const CHUNK_SIZE = 20; // 20x20 tiles per chunk
  let visibleChunks = new Set(); // Currently visible chunks

  // Calculate grid dimensions and update on resize - now as arrow function
  const resize = () => {
    // Calculate dimensions based on the element's size
    // Convert em to px for calculations using current font size
    const baseFontSize = parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    );
    const tileSizePx = tileSize * baseFontSize;
    const width = mapElement.clientWidth;
    const height = mapElement.clientHeight;

    // Apply the odd number logic inline instead of using a function
    cols = Math.ceil(width / tileSizePx);
    cols = cols % 2 === 0 ? cols - 1 : cols;

    rows = Math.ceil(height / tileSizePx);
    rows = rows % 2 === 0 ? rows - 1 : rows;

    // Update center values
    const centerX = Math.floor(cols / 2);
    const centerY = Math.floor(rows / 2);

    // Update offsets based on target coordinate
    offsetX = centerX + targetCoord.x;
    offsetY = centerY + targetCoord.y;

    // Mark as ready after first calculation
    if (!isReady) isReady = true;
  };

  // Initialize when mounted
  onMount(() => {
    // Set up ResizeObserver for the map element
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mapElement);

    // Initial calculation
    resize();

    // Set up keyboard navigation
    setupKeyboardNavigation();

    return () => {
      // Clean up observer on component destruction
      if (resizeObserver) {
        resizeObserver.disconnect();
      }

      // Clean up keyboard navigation
      if (keyboardNavigationInterval) {
        clearInterval(keyboardNavigationInterval);
      }
    };
  });

  // Setup keyboard navigation - converted to arrow function
  const setupKeyboardNavigation = () => {
    // Handle key down - add key to pressed keys
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowleft",
          "arrowdown",
          "arrowright",
        ].includes(key)
      ) {
        keysPressed.add(key);

        // Start interval if not already running
        if (!keyboardNavigationInterval) {
          moveMapByKeys(); // Move immediately on first press
          keyboardNavigationInterval = setInterval(
            moveMapByKeys,
            KEYBOARD_MOVE_SPEED,
          );
        }

        // Prevent default for arrow keys to avoid scrolling the page
        if (key.startsWith("arrow")) {
          event.preventDefault();
        }
      }
    });

    // Handle key up - remove key from pressed keys
    window.addEventListener("keyup", (event) => {
      const key = event.key.toLowerCase();
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowleft",
          "arrowdown",
          "arrowright",
        ].includes(key)
      ) {
        keysPressed.delete(key);

        // If no more navigation keys are pressed, stop the interval
        if (keysPressed.size === 0 && keyboardNavigationInterval) {
          clearInterval(keyboardNavigationInterval);
          keyboardNavigationInterval = null;
        }
      }
    });
  };

  // Move map based on current keys pressed - converted to arrow function
  const moveMapByKeys = () => {
    let xChange = 0;
    let yChange = 0;

    // Check for horizontal movement
    if (keysPressed.has("a") || keysPressed.has("arrowleft")) {
      xChange -= 1; // Move left (lower x value)
    }
    if (keysPressed.has("d") || keysPressed.has("arrowright")) {
      xChange += 1; // Move right (higher x value)
    }

    // Check for vertical movement
    if (keysPressed.has("w") || keysPressed.has("arrowup")) {
      yChange -= 1; // Move up (lower y value)
    }
    if (keysPressed.has("s") || keysPressed.has("arrowdown")) {
      yChange += 1; // Move down (higher y value)
    }

    // Apply movement if there is any
    if (xChange !== 0 || yChange !== 0) {
      targetCoord.x -= xChange;
      targetCoord.y -= yChange;

      // Update offsets
      offsetX = centerX + targetCoord.x;
      offsetY = centerY + targetCoord.y;

      // Trigger reactivity
      targetCoord = { ...targetCoord };
    }
  };

  // Helper function to get chunk key from tile coordinates - simplified to single line
  const getChunkKey = (x, y) =>
    `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;

  // Update visible chunks and log changes - simplified version without prevVisibleChunks
  const updateChunks = (gridArray) => {
    // Get chunk keys from all cells using map
    const newChunkKeys = gridArray.map((cell) => getChunkKey(cell.x, cell.y));
    const newVisibleChunks = new Set(newChunkKeys);

    // Find new chunks (in new but not in current)
    Array.from(newVisibleChunks)
      .filter((chunkKey) => !visibleChunks.has(chunkKey))
      .map((chunkKey) => console.log(`Chunk loaded: ${chunkKey}`));

    // Find removed chunks (in current but not in new)
    Array.from(visibleChunks)
      .filter((chunkKey) => !newVisibleChunks.has(chunkKey))
      .map((chunkKey) => console.log(`Chunk unloaded: ${chunkKey}`));

    // Update the visible chunks
    visibleChunks = newVisibleChunks;
  };

  // Generate grid array using the x - offsetX, y - offsetY calculation
  $: centerX = Math.floor(cols / 2);
  $: centerY = Math.floor(rows / 2);
  $: gridArray = isReady
    ? Array.from({ length: rows }, (_, y) =>
        Array.from({ length: cols }, (_, x) => {
          const globalX = x - offsetX;
          const globalY = y - offsetY;
          return {
            x: globalX,
            y: globalY,
            isCenter: x === centerX && y === centerY,
          };
        }),
      ).flat()
    : [];

  // React to changes in gridArray by updating chunks
  $: if (isReady && gridArray.length > 0) updateChunks(gridArray);

  // Generate axis coordinate arrays with center cell highlighted
  $: xAxisArray = isReady
    ? Array.from({ length: cols }, (_, x) => {
        const globalX = x - offsetX;
        return {
          value: globalX,
          isCenter: x === centerX,
        };
      })
    : [];

  $: yAxisArray = isReady
    ? Array.from({ length: rows }, (_, y) => {
        const globalY = y - offsetY;
        return {
          value: globalY,
          isCenter: y === centerY,
        };
      })
    : [];

  const startDrag = (event) => {
    // Always start drag regardless of modal state
    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    mapElement.style.cursor = "grabbing";
    event.preventDefault();
  };

  const stopDrag = () => {
    isDragging = false;
    if (mapElement) mapElement.style.cursor = "grab";
  };

  const handleDrag = (event) => {
    if (!isDragging) return;

    // Get current font size for conversion
    const baseFontSize = parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    );
    const tileSizePx = tileSize * baseFontSize;

    // Simplified drag calculation using pixel-converted value
    const deltaX = Math.round((event.clientX - startX) / tileSizePx);
    const deltaY = Math.round((event.clientY - startY) / tileSizePx);

    if (deltaX !== 0 || deltaY !== 0) {
      // Update the target coordinate
      targetCoord.x -= deltaX;
      targetCoord.y -= deltaY;

      // Update offsets
      offsetX = centerX + targetCoord.x;
      offsetY = centerY + targetCoord.y;

      startX = event.clientX;
      startY = event.clientY;
    }
  };

  // Handle legend click event - single line
  const handleOpenDetails = () => (showDetailsModal = true);

  // Add global mouse event handlers for map dragging - single line functions
  const handleGlobalMouseUp = () => stopDrag();

  const handleGlobalMouseMove = (event) => {
    if (isDragging) {
      handleDrag(event);
    }
  };
</script>

<svelte:window
  on:mouseup={handleGlobalMouseUp}
  on:mousemove={handleGlobalMouseMove}
/>

<div
  class="map-container"
  style="--tile-size: {tileSize}em;"
  class:modal-open={showDetailsModal}>
  <!-- Map takes full space -->
  <div
    class="map"
    bind:this={mapElement}
    on:mousedown={startDrag}
    on:mouseup={stopDrag}
    on:mousemove={handleDrag}
    on:mouseleave={stopDrag}
    role="grid"
    tabindex="0"
    aria-label="Interactive coordinate map. Use WASD or arrow keys to navigate."
  >
    {#if isReady}
      <div
        class="grid main-grid"
        style="--cols: {cols}; --rows: {rows};"
        role="presentation"
      >
        {#each gridArray as cell}
          <div
            class="tile"
            class:center={cell.isCenter}
            role="gridcell"
            aria-label="Coordinates {cell.x},{cell.y}"
            aria-current={cell.isCenter ? "location" : undefined}
          >
            {cell.x},{cell.y}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Use Legend component with renamed prop -->
  <Legend x={targetCoord.x} y={targetCoord.y} openDetails={handleOpenDetails} />

  <!-- Use Axes component -->
  {#if showAxisBars && isReady}
    <Axes {xAxisArray} {yAxisArray} {cols} {rows} />
  {/if}

  <!-- Details modal component -->
  <Details x={targetCoord.x} y={targetCoord.y} bind:show={showDetailsModal} />
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
    border: 0.05em solid var(--color-dark-gray-blue);
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 1.2em;
    color: var(--color-text);
    background: var(--color-dark-teal);
    user-select: none;
    -webkit-user-select: none; /* Safari */
    -moz-user-select: none; /* Firefox */
    -ms-user-select: none; /* IE10+/Edge */
  }

  .center {
    background: var(--color-bright-red);
  }

  .map-container.modal-open {
    cursor: grab;
  }

  .map-container.modal-open .map {
    pointer-events: all; /* Ensure map still receives pointer events when modal is open */
  }
</style>
