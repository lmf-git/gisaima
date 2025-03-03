<script>
  import { onMount } from 'svelte';
  
  // Position state
  let isDragging = false, startX, startY;
  
  // Track the target coordinate at the center of the view
  let targetCoord = { x: 0, y: 0 };
  
  // Derived position values
  let offsetX = 0, offsetY = 0;
  
  // Map configuration
  let mapElement;
  let cols = 0, rows = 0;
  let isReady = false;
  let resizeObserver;
  
  // Single parameter for tile size (in pixels)
  const tileSize = 120;
  
  // Calculate grid dimensions and update on resize - now as arrow function
  const resize = () => {
    if (!mapElement) return;
    
    // Calculate dimensions based on the element's size
    const width = mapElement.clientWidth;
    const height = mapElement.clientHeight;
    
    // Apply the odd number logic inline instead of using a function
    cols = Math.ceil(width / tileSize);
    cols = cols % 2 === 0 ? cols - 1 : cols;
    
    rows = Math.ceil(height / tileSize);
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
        isCenter: x === centerX && y === centerY,
        isOrigin: globalX === 0 && globalY === 0
      };
    })
  ).flat() : [];
  
  const startDrag = event => {
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
    
    // Simplified drag calculation
    const deltaX = Math.round((event.clientX - startX) / tileSize);
    const deltaY = Math.round((event.clientY - startY) / tileSize);
    
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
</script>

<div 
  class="map" 
  bind:this={mapElement}
  on:mousedown={startDrag}
  on:mouseup={stopDrag}
  on:mousemove={handleDrag}
  on:mouseleave={stopDrag}
  style="--tile-size: {tileSize}px;"
  role="grid"
  tabindex="0"
  aria-label="Interactive coordinate map"
>
  {#if isReady}
    <div 
      class="grid" 
      style="--cols: {cols}; --rows: {rows};"
      role="presentation"
    >
      {#each gridArray as cell}
        <div 
          class="tile" 
          class:center={cell.isCenter}
          class:origin={cell.isOrigin}
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

<style>
  .map {
    position: absolute;
    inset: 0;
    cursor: grab;
    overflow: hidden;
    background: #0e0c22;
    user-select: none;
  }
  
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-template-rows: repeat(var(--rows), 1fr);
    width: 100%;
    height: 100%;
  }
  
  .tile {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    color: #fff;
    background: #2a2a40;
    border: 0.05em solid #3a3a50;
    user-select: none;
    text-overflow: ellipsis;
  }
  
  .center {
    background: #ff4444;
  }
  
  .origin {
    background: #4444ff;
  }
</style>
