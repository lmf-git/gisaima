/**
 * Minimap controls module
 * Handles minimap-specific functionality
 */

// Singleton cache for terrain data to ensure consistency across components
let terrainCache;

/**
 * Get terrain cache singleton
 * @returns {Map} - The terrain cache map
 */
export function getTerrainCache() {
  if (!terrainCache) {
    terrainCache = new Map();
  }
  return terrainCache;
}

/**
 * Setup minimap controls
 * @param {Object} state - Minimap state object
 * @param {number} tileSize - Tile size in em
 * @param {number} tilesRatio - Ratio of minimap tiles to grid tiles
 * @param {Map} cache - Terrain cache
 * @param {Object} terrain - Terrain generator
 * @param {Object} targetCoord - Target coordinates
 * @param {Object} mainViewportSize - Main viewport size information
 * @returns {Object} - Controls object with helper functions
 */
export function setupMinimapControls(state, tileSize, tilesRatio, cache, terrain, targetCoord, mainViewportSize) {
  /**
   * Get cached terrain data for a position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {Object} - Terrain data
   */
  function getCachedTerrainData(x, y) {
    const intX = Math.floor(x);
    const intY = Math.floor(y);
    const key = `${intX},${intY}`;
    
    if (cache.has(key)) {
      return cache.get(key);
    }
    
    const terrainData = terrain.getTerrainData(intX, intY);
    
    const stableData = {
      biome: {
        ...terrainData.biome,
        displayName: terrainData.biome.displayName || 
          terrainData.biome.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      },
      color: terrainData.color,
      height: terrainData.height,
      moisture: terrainData.moisture,
      continent: terrainData.continent,
      riverValue: terrainData.riverValue,
      lakeValue: terrainData.lakeValue,
      slope: terrainData.slope
    };
    
    cache.set(key, stableData);
    return stableData;
  }
  
  /**
   * Handle minimap resize
   * @param {HTMLElement} element - Minimap DOM element
   */
  function handleResize(element) {
    const width = element.clientWidth;
    const height = element.clientHeight;
    const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const tileSizePx = tileSize * baseFontSize;

    if (mainViewportSize?.cols > 0 && mainViewportSize?.rows > 0) {
      state.cols = Math.floor(mainViewportSize.cols * tilesRatio);
      state.rows = Math.floor(mainViewportSize.rows * tilesRatio);
      
      const maxCols = Math.floor(width / tileSizePx);
      const maxRows = Math.floor(height / tileSizePx);
      
      state.cols = Math.min(state.cols, maxCols);
      state.rows = Math.min(state.rows, maxRows);
    } else {
      state.cols = Math.floor(width / tileSizePx);
      state.rows = Math.floor(height / tileSizePx);
    }
    
    if (state.cols % 2 === 0) state.cols -= 1;
    if (state.rows % 2 === 0) state.rows -= 1;
    
    state.cols = Math.max(state.cols, 11);
    state.rows = Math.max(state.rows, 11);

    state.centerX = Math.floor(state.cols / 2);
    state.centerY = Math.floor(state.rows / 2);
    
    state.offsetX = state.centerX + targetCoord.x;
    state.offsetY = state.centerY + targetCoord.y;
    
    updateViewportIndicator();
    
    state.isReady = true;
  }
  
  /**
   * Update viewport indicator
   */
  function updateViewportIndicator() {
    if (!state.isReady || !mainViewportSize?.cols || !mainViewportSize?.rows) {
      state.viewportWidth = 5;
      state.viewportHeight = 5;
      state.viewportLeft = state.centerX;
      state.viewportTop = state.centerY;
      return;
    }
    
    const mainToMiniRatio = 1 / tilesRatio;
    
    state.viewportWidth = Math.max(3, Math.round(state.cols * mainToMiniRatio));
    state.viewportHeight = Math.max(3, Math.round(state.rows * mainToMiniRatio));
    
    if (state.viewportWidth % 2 === 0) state.viewportWidth += 1;
    if (state.viewportHeight % 2 === 0) state.viewportHeight += 1;
    
    state.viewportLeft = state.centerX;
    state.viewportTop = state.centerY;
  }
  
  /**
   * Build grid array for minimap
   * @param {number} cols - Number of columns
   * @param {number} rows - Number of rows
   * @param {number} centerX - X center position
   * @param {number} centerY - Y center position
   * @param {number} offsetX - X offset
   * @param {number} offsetY - Y offset
   * @returns {Array} - Array of grid cells
   */
  function buildGridArray(cols, rows, centerX, centerY, offsetX, offsetY) {
    if (!cols || !rows) return [];
    
    try {
      return Array.from({ length: rows }, (_, y) =>
        Array.from({ length: cols }, (_, x) => {
          const globalX = Math.floor(x - offsetX);
          const globalY = Math.floor(y - offsetY);
          
          const terrainData = getCachedTerrainData(globalX, globalY);
          
          return {
            x: globalX,
            y: globalY,
            gridX: x,
            gridY: y,
            isCenter: x === centerX && y === centerY,
            ...terrainData
          };
        })
      ).flat();
    } catch (error) {
      console.error('Error building grid array:', error);
      return [];
    }
  }
  
  /**
   * Handle minimap background click
   * @param {MouseEvent} event - Mouse event
   * @param {Function} handleTileClick - Function to handle tile click
   * @param {Function} dispatch - Function to dispatch events
   */
  function handleBackgroundClick(event, handleTileClick, dispatch) {
    // FIXED: Simplified click handling with direct world coordinate calculation
    const rect = state.minimapElement.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    
    // Calculate the percentage position in the minimap
    const percentX = clickX / rect.width;
    const percentY = clickY / rect.height;
    
    // Calculate tile position within grid
    const tileX = Math.floor(percentX * state.cols);
    const tileY = Math.floor(percentY * state.rows);
    
    // Ensure click is within grid bounds
    if (tileX >= 0 && tileX < state.cols && tileY >= 0 && tileY < state.rows) {
      // Calculate world coordinates
      const worldX = Math.floor(targetCoord.x - state.centerX + tileX);
      const worldY = Math.floor(targetCoord.y - state.centerY + tileY);
      
      console.log(`Minimap background click: grid(${tileX},${tileY}) → world(${worldX},${worldY})`);
      
      // Try to find exact cell in grid array
      const clickedCell = state.minimapGridArray.find(cell => 
        cell.gridX === tileX && cell.gridY === tileY);
      
      if (clickedCell) {
        handleTileClick(clickedCell);
      } else {
        // Fallback to calculated coordinates
        dispatch('positionchange', { 
          x: worldX, 
          y: worldY,
          fromMinimap: true
        });
      }
    }
  }
  
  /**
   * Handle minimap keyboard navigation
   * @param {KeyboardEvent} event - Keyboard event
   */
  function handleMinimapKeydown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      
      const globalX = Math.floor(state.centerX - state.offsetX);
      const globalY = Math.floor(state.centerY - state.offsetY);
      
      const dispatch = event.target.dispatchEvent 
        ? (name, detail) => {
            const evt = new CustomEvent(name, { detail });
            event.target.dispatchEvent(evt);
          }
        : () => {};
      
      dispatch('positionchange', { 
        x: globalX, 
        y: globalY,
        fromMinimap: true
      });
    }
  }
  
  /**
   * Setup tile interaction action
   * @param {HTMLElement} node - DOM node
   * @param {Object} cell - Cell data
   * @param {Function} handleTileClick - Function to handle tile click
   * @param {Function} dispatch - Function to dispatch events
   * @returns {Object} - Svelte action object
   */
  function setupTileInteraction(node, cell, handleTileClick, dispatch) {
    if (node.__setupComplete) {
      node.__data = cell;
      return {};
    }
    
    node.__data = cell;
    node.__setupComplete = true;
    
    function clickHandler(event) {
      event.stopPropagation();
      event.preventDefault();
      
      // FIXED: Ensure we're using the most current cell data
      const currentX = node.dataset.x !== undefined ? parseInt(node.dataset.x) : cell.x;
      const currentY = node.dataset.y !== undefined ? parseInt(node.dataset.y) : cell.y;
      
      // Create a clean cell object with just the coordinates
      const cellData = {
        x: currentX,
        y: currentY
      };
      
      handleTileClick(cellData);
    }
    
    function mouseoverHandler(event) {
      // FIXED: Directly use the coordinates from the node's dataset when available
      if (!event.buttons) {
        const currentX = node.dataset.x !== undefined ? parseInt(node.dataset.x) : cell.x;
        const currentY = node.dataset.y !== undefined ? parseInt(node.dataset.y) : cell.y;
        
        dispatch('tilehighlight', { x: currentX, y: currentY });
      }
    }
    
    function mouseleaveHandler() {
      dispatch('tilehighlight', null);
    }
    
    node.addEventListener('click', clickHandler);
    node.addEventListener('mouseover', mouseoverHandler);
    node.addEventListener('mouseleave', mouseleaveHandler);
    
    return {
      update(newCell) {
        node.__data = newCell;
      },
      destroy() {
        node.removeEventListener('click', clickHandler);
        node.removeEventListener('mouseover', mouseoverHandler);
        node.removeEventListener('mouseleave', mouseleaveHandler);
        delete node.__data;
        delete node.__setupComplete;
      }
    };
  }

  return {
    handleResize,
    updateViewportIndicator,
    buildGridArray,
    handleBackgroundClick,
    handleMinimapKeydown,
    setupTileInteraction
  };
}
