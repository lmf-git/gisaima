<script>
  import { onMount } from 'svelte';
  import { TerrainGenerator } from '../lib/map/noise.js';
  
  // Props with defaults
  const { 
    worldId = '', 
    seed = 0, 
    tileSize = 0.5, // Larger tile size since we're summarizing
    summaryFactor = 2  // Each rendered tile summarizes a 2x2 area (4 tiles)
  } = $props();
  
  // Local state
  let terrainGrid = $state([]);
  let mounted = $state(false);
  let cardElement;
  let resizeObserver;
  let cols = $state(0);
  let rows = $state(0);
  
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
    
    // Calculate tile counts based on available space
    let newCols = Math.floor(width / tileSizePx);
    let newRows = Math.floor(height / tileSizePx);
    
    // Ensure odd number of columns and rows for proper centering
    newCols = ensureOdd(Math.max(newCols, 17)); // Fewer columns due to summarization
    newRows = ensureOdd(Math.max(newRows, 17)); // Fewer rows due to summarization
    
    // Update state if dimensions have changed
    if (newCols !== cols || newRows !== rows) {
      cols = newCols;
      rows = newRows;
      
      // Regenerate the grid with new dimensions
      if (mounted && seed) {
        terrainGrid = generateTerrainGrid(seed);
      }
    }
  }

  // Generate terrain data for the grid with summarization
  function generateTerrainGrid(seed) {
    if (!seed || typeof seed !== 'number' || cols <= 0 || rows <= 0) return [];
    
    try {
      const generator = new TerrainGenerator(seed, cols * rows * summaryFactor * summaryFactor);
      const grid = [];
      
      const centerX = Math.floor(cols / 2);
      const centerY = Math.floor(rows / 2);
      
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          // Calculate the base world coordinates for this summarized tile
          const baseWorldX = (x - centerX) * summaryFactor;
          const baseWorldY = (y - centerY) * summaryFactor;
          
          // Sample multiple terrain points and average the colors
          const samples = [];
          
          for (let sy = 0; sy < summaryFactor; sy++) {
            for (let sx = 0; sx < summaryFactor; sx++) {
              const worldX = baseWorldX + sx;
              const worldY = baseWorldY + sy;
              const terrainData = generator.getTerrainData(worldX, worldY);
              samples.push(terrainData);
            }
          }
          
          // Get the representative color (predominant biome)
          // For simplicity, we'll use the first sample's color
          // A more sophisticated approach would analyze all samples
          const representativeColor = samples[0].color;
          
          grid.push({
            x,
            y,
            worldX: baseWorldX,
            worldY: baseWorldY,
            color: representativeColor,
            isCenter: x === centerX && y === centerY
          });
        }
      }
      
      return grid;
    } catch (err) {
      console.error('Error generating terrain grid:', err);
      return [];
    }
  }
  
  onMount(() => {
    if (cardElement) {
      // Calculate grid dimensions
      resizeWorldGrid();
      
      // Generate initial terrain grid
      terrainGrid = generateTerrainGrid(seed);
      mounted = true;
      
      // Setup resize observer
      resizeObserver = new ResizeObserver(resizeWorldGrid);
      resizeObserver.observe(cardElement);
    }
    
    return () => {
      if (resizeObserver) resizeObserver.disconnect();
    };
  });
  
  // Update terrain when seed changes
  $effect(() => {
    if (mounted && seed && cols > 0 && rows > 0) {
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
  {#if mounted && terrainGrid.length > 0}
    <div 
      class="terrain-grid"
      style="--grid-cols: {cols}; --grid-rows: {rows};"
    >
      {#each terrainGrid as tile (tile.x + ',' + tile.y)}
        <div 
          class="terrain-tile" 
          class:center={tile.isCenter}
          style="background-color: {tile.color};"
        ></div>
      {/each}
    </div>
  {:else}
    <div class="loading-placeholder">
      <span>Loading world...</span>
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
  }
  
  .terrain-grid {
    display: grid;
    grid-template-columns: repeat(var(--grid-cols), 1fr);
    grid-template-rows: repeat(var(--grid-rows), 1fr);
    width: 100%;
    height: 100%;
  }
  
  .terrain-tile {
    width: 100%;
    height: 100%;
  }
  
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
  
  .loading-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.8rem;
    background-color: var(--color-dark-blue);
  }
</style>
