<script>
  import { onMount } from 'svelte';
  import { TerrainGenerator } from '../lib/map/noise.js';
  
  // Props with defaults
  const { 
    worldId = '', 
    seed = 0, 
    tileSize = 1.25, 
    summaryFactor = 50,
    delayed = false
  } = $props();
  
  // Local state
  let terrainGrid = $state([]);
  let mounted = $state(false);
  let cardElement;
  let resizeObserver;
  let cols = $state(0);
  let rows = $state(0);
  let isActive = $state(!delayed);
  
  // Ensure odd number of columns/rows for proper centering
  const ensureOdd = (num) => num % 2 === 0 ? num + 1 : num;
  
  // Calculate grid dimensions based on container size
  function resizeWorldGrid() {
    if (!cardElement) return;
    
    const style = getComputedStyle(document.documentElement);
    const baseFontSize = parseFloat(style.fontSize);
    const tileSizePx = tileSize * baseFontSize;
    
    // Get actual dimensions of container element
    const width = cardElement.clientWidth;
    const height = cardElement.clientHeight;
    
    // Calculate tile counts based purely on available space and tile size
    let newCols = Math.max(3, Math.floor(width / tileSizePx));
    let newRows = Math.max(3, Math.floor(height / tileSizePx));
    
    // Force odd number for proper centering
    newCols = ensureOdd(newCols);
    newRows = ensureOdd(newRows);
    
    // Only update if dimensions have changed
    if (newCols !== cols || newRows !== rows) {
      cols = newCols;
      rows = newRows;
      
      // Directly generate grid if active - no need for requestAnimationFrame
      if (mounted && seed && isActive) {
        terrainGrid = generateTerrainGrid(seed);
      }
    }
  }

  // Generate terrain data for the grid with simplified sampling
  function generateTerrainGrid(seed) {
    if (!seed || typeof seed !== 'number' || cols <= 0 || rows <= 0) return [];
    
    try {
      // Create a small cache based on grid size for better performance
      const generator = new TerrainGenerator(seed, cols * rows * 2);
      const grid = [];
      
      const centerX = Math.floor(cols / 2);
      const centerY = Math.floor(rows / 2);
      
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          // Calculate the base world coordinates for this summarized tile
          const baseWorldX = (x - centerX) * summaryFactor;
          const baseWorldY = (y - centerY) * summaryFactor;
          
          // Simply sample from the center of the area - much more efficient
          const centerSampleX = baseWorldX + Math.floor(summaryFactor / 2);
          const centerSampleY = baseWorldY + Math.floor(summaryFactor / 2);
          const terrainData = generator.getTerrainData(centerSampleX, centerSampleY);
          
          grid.push({
            x,
            y,
            worldX: baseWorldX,
            worldY: baseWorldY,
            color: terrainData.color,
            isCenter: x === centerX && y === centerY,
            biomeName: terrainData.biome?.name || 'unknown'
          });
        }
      }
      
      return grid;
    } catch (err) {
      console.error('Error generating terrain grid:', err);
      return [];
    }
  }
  
  // Initialize with a simple placeholder grid for immediate display
  function createPlaceholderGrid() {
    if (cols <= 0 || rows <= 0) return [];
    
    const placeholderColors = [
      "#1A4F76", "#4A91AA", "#5A6855", "#607D55", "#7B8F5D", 
      "#8DAD70", "#91A86E", "#A8A76C"
    ];
    
    const centerX = Math.floor(cols / 2);
    const centerY = Math.floor(rows / 2);
    
    // Create a very simple placeholder grid
    const grid = [];
    const placeholderSeed = seed || worldId.length;
    
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const colorIndex = Math.abs((x * 3 + y * 7 + placeholderSeed) % placeholderColors.length);
        
        grid.push({
          x, 
          y,
          color: placeholderColors[colorIndex],
          isCenter: x === centerX && y === centerY,
          biomeName: 'loading'
        });
      }
    }
    
    return grid;
  }
  
  // Activate the card when delayed loading is ready
  function activateCard() {
    if (!isActive) {
      isActive = true;
      if (mounted && seed && cols > 0 && rows > 0) {
        terrainGrid = generateTerrainGrid(seed);
      }
    }
  }
  
  onMount(() => {
    if (cardElement) {
      // Calculate grid dimensions
      resizeWorldGrid();
      
      // Generate initial terrain grid only if not delayed
      if (!delayed) {
        // Show placeholder immediately, then generate actual grid
        terrainGrid = createPlaceholderGrid();
        
        // Generate the actual terrain (once, no animation frame needed)
        setTimeout(() => {
          if (isActive && mounted) {
            terrainGrid = generateTerrainGrid(seed);
          }
        }, 10);
      }
      
      mounted = true;
      
      // Setup resize observer - this only triggers when actual resizing happens
      resizeObserver = new ResizeObserver(resizeWorldGrid);
      resizeObserver.observe(cardElement);
    }
    
    return () => {
      if (resizeObserver) resizeObserver.disconnect();
    };
  });
  
  // When delayed prop changes to false, activate the card
  $effect(() => {
    if (!delayed && !isActive && mounted) {
      // Show placeholder immediately
      terrainGrid = createPlaceholderGrid();
      activateCard();
    }
  });
  
  // Update terrain when seed changes and card is active
  $effect(() => {
    if (mounted && seed && isActive && cols > 0 && rows > 0) {
      terrainGrid = generateTerrainGrid(seed);
    }
  });
</script>

<div 
  class="world-card-container"
  bind:this={cardElement}
  data-world-id={worldId}
  aria-label="World terrain preview"
>
  {#if mounted && (isActive || !delayed) && terrainGrid.length > 0}
    <div 
      class="terrain-grid"
      style="--grid-cols: {cols}; --grid-rows: {rows};"
    >
      {#each terrainGrid as tile (tile.x + ',' + tile.y)}
        <div 
          class="terrain-tile" 
          class:center={tile.isCenter}
          style="background-color: {tile.color};"
          aria-label={tile.biomeName}
          title={tile.biomeName}
        ></div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .world-card-container {
    width: 100%;
    height: 100%;
    background-color: var(--color-dark-blue);
    border-radius: 4px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    will-change: transform;
  }
  
  .terrain-grid {
    display: grid;
    grid-template-columns: repeat(var(--grid-cols), 1fr);
    grid-template-rows: repeat(var(--grid-rows), 1fr);
    width: 100%;
    height: 100%;
    transform: translate3d(0, 0, 0);
  }
  
  .terrain-tile {
    width: 100%;
    height: 100%;
  }
  
  /* Remove hover animation effects to improve performance */
  .terrain-tile.center {
    position: relative;
    z-index: 2;
  }
  
  .terrain-tile.center::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border: 2px solid rgba(255, 255, 255, 0.8);
    z-index: 3;
  }
</style>
