<script>
  import { onMount } from 'svelte';
  import Legend from './Legend.svelte';
  import Axes from './Axes.svelte';
  import Details from './Details.svelte';
  
  // Position state
  let isDragging = false, startX, startY;
  
  // Track the target coordinate at the center of the view
  let targetCoord = { x: 0, y: 0 };
  
  // Modal state
  let showDetailsModal = false;
  
  // Derived position values
  let offsetX = 0, offsetY = 0;
  
  // Map configuration
  let mapElement;
  let cols = 0, rows = 0;
  let isReady = false;
  let resizeObserver;
  
  // Single parameter for tile size (now in em units)
  const tileSize = 7.5; // Changed from 120px to 7.5em
  
  // Options for axis bars
  const showAxisBars = true;
  
  // Calculate grid dimensions and update on resize - now as arrow function
  const resize = () => {
    if (!mapElement) return;
    
    // Calculate dimensions based on the element's size
    // Convert em to px for calculations using current font size
    const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
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
    
    return () => {
      // Clean up observer on component destruction
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  });
  
  // Generate grid array using the x - offsetX, y - offsetY calculation
  $: centerX = Math.floor(cols / 2);
  $: centerY = Math.floor(rows / 2);
  $: gridArray = isReady ? Array.from({ length: rows }, (_, y) => 
    Array.from({ length: cols }, (_, x) => {
      const globalX = x - offsetX;
      const globalY = y - offsetY;
      return {
        x: globalX,
        y: globalY,
        isCenter: x === centerX && y === centerY
      };
    })
  ).flat() : [];
  
  // Generate axis coordinate arrays with center cell highlighted
  $: xAxisArray = isReady ? Array.from({ length: cols }, (_, x) => {
    const globalX = x - offsetX;
    return {
      value: globalX,
      isCenter: x === centerX
    };
  }) : [];
  
  $: yAxisArray = isReady ? Array.from({ length: rows }, (_, y) => {
    const globalY = y - offsetY;
    return {
      value: globalY,
      isCenter: y === centerY
    };
  }) : [];
  
  // Add a flag to track if modal is open for event handling logic
  $: isModalOpen = showDetailsModal;

  const startDrag = event => {
    // Always start drag regardless of modal state
    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    mapElement.style.cursor = 'grabbing';
    event.preventDefault();
  };
  
  const stopDrag = () => {
    isDragging = false;
    if (mapElement) mapElement.style.cursor = 'grab';
  };
  
  const handleDrag = event => {
    if (!isDragging) return;
    
    // Get current font size for conversion
    const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
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
  
  // Handle legend click event
  function handleLegendClick() {
    // Show modal regardless of dragging state - removed the isDragging check
    showDetailsModal = true;
  }
  
  // Add global mouse event handlers for map dragging
  function handleGlobalMouseUp() {
    stopDrag();
  }
  
  function handleGlobalMouseMove(event) {
    if (isDragging) {
      handleDrag(event);
    }
  }
</script>

<svelte:window 
  on:mouseup={handleGlobalMouseUp}
  on:mousemove={handleGlobalMouseMove}
/>

<div 
  class="map-container"
  style="--tile-size: {tileSize}em;"
  class:modal-open={showDetailsModal}
>
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
    aria-label="Interactive coordinate map"
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
            aria-current={cell.isCenter ? 'location' : undefined}
          >
            {cell.x},{cell.y}
          </div>
        {/each}
      </div>
    {/if}
  </div>
  
  <!-- Use Legend component with click handler -->
  <Legend 
    x={targetCoord.x} 
    y={targetCoord.y} 
    on:click={handleLegendClick} 
  />
  
  <!-- Use Axes component -->
  {#if showAxisBars && isReady}
    <Axes {xAxisArray} {yAxisArray} {cols} {rows} />
  {/if}
  
  <!-- Details modal component -->
  <Details 
    x={targetCoord.x} 
    y={targetCoord.y}
    bind:show={showDetailsModal} 
  />
</div>

<style>
  .map-container {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: #0e0c22;
    user-select: none;
  }
  
  /* Map takes full container space */
  .map {
    width: 100%;
    height: 100%;
    cursor: grab;
    overflow: hidden;
    box-sizing: border-box;
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
    border: 0.05em solid #3a3a50;
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 1.2rem;
    color: #fff;
    background: #2a2a40;
    user-select: none;
    -webkit-user-select: none;  /* Safari */
    -moz-user-select: none;     /* Firefox */
    -ms-user-select: none;      /* IE10+/Edge */
  }
  
  .center {
    background: #ff4444;
  }

  .map-container.modal-open {
    cursor: grab;
  }
  
  .map-container.modal-open .map {
    pointer-events: all; /* Ensure map still receives pointer events when modal is open */
  }
</style>
