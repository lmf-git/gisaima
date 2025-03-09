/**
 * Grid controls module for keyboard and mouse navigation
 */

/**
 * Setup keyboard navigation for the grid
 * @param {Function} moveMapByKeys - Function to handle movement
 * @param {Object} state - State reference containing keysPressed and keyboardNavigationInterval
 * @param {number} keyboardMoveSpeed - Interval for continuous movement in ms
 */
export function setupKeyboardNavigation(moveMapByKeys, state, keyboardMoveSpeed) {
  // Handle keydown events
  window.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(key)) {
      state.keysPressed.add(key);

      if (!state.keyboardNavigationInterval) {
        moveMapByKeys();
        state.keyboardNavigationInterval = setInterval(moveMapByKeys, keyboardMoveSpeed);
      }

      if (key.startsWith("arrow")) event.preventDefault();
    }
  });

  // Handle keyup events
  window.addEventListener("keyup", event => {
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(key)) {
      state.keysPressed.delete(key);

      if (state.keysPressed.size === 0 && state.keyboardNavigationInterval) {
        clearInterval(state.keyboardNavigationInterval);
        state.keyboardNavigationInterval = null;
      }
    }
  });
}

/**
 * Calculate map movement based on pressed keys
 * @param {Set} keysPressed - Set of currently pressed keys
 * @returns {Object} - The x and y coordinate changes
 */
export function calculateKeyboardMove(keysPressed) {
  let xChange = 0;
  let yChange = 0;

  if (keysPressed.has("a") || keysPressed.has("arrowleft")) xChange -= 1;
  if (keysPressed.has("d") || keysPressed.has("arrowright")) xChange += 1;
  if (keysPressed.has("w") || keysPressed.has("arrowup")) yChange -= 1;
  if (keysPressed.has("s") || keysPressed.has("arrowdown")) yChange += 1;

  return { xChange, yChange };
}

/**
 * Start dragging the map
 * @param {MouseEvent} event - The mouse event
 * @param {Object} state - The drag state object
 * @param {HTMLElement} mapElement - The map DOM element
 */
export function startDrag(event, state, mapElement) {
  if (event.button !== 0) return;
  
  state.isDragging = true;
  state.isMouseActuallyDown = true;
  state.dragStartX = event.clientX;
  state.dragStartY = event.clientY;
  
  document.body.style.cursor = "grabbing";
  if (mapElement) {
    mapElement.style.cursor = "grabbing";
    mapElement.classList.add("dragging");
  }
  
  event.preventDefault();
}

/**
 * Handle map dragging
 * @param {MouseEvent} event - The mouse event
 * @param {Object} state - The drag state object
 * @param {number} tileSize - The size of each tile in em
 * @param {Function} updateCoordinates - Function to update target coordinates
 */
export function drag(event, state, tileSize, updateCoordinates) {
  if (!state.isDragging) return;

  const deltaX = event.clientX - state.dragStartX;
  const deltaY = event.clientY - state.dragStartY;
  
  const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const tileSizePx = tileSize * baseFontSize;
  
  const cellsMovedX = Math.round(deltaX / tileSizePx);
  const cellsMovedY = Math.round(deltaY / tileSizePx);
  
  if (cellsMovedX !== 0 || cellsMovedY !== 0) {
    updateCoordinates(-cellsMovedX, -cellsMovedY);
    state.dragStartX = event.clientX;
    state.dragStartY = event.clientY;
  }
}

/**
 * Stop dragging the map
 * @param {Object} state - The drag state object
 * @param {HTMLElement} mapElement - The map DOM element
 */
export function stopDrag(state, mapElement) {
  if (!state.isDragging) return;
  
  state.isDragging = false;
  state.isMouseActuallyDown = false; // ADDED: Also reset this flag
  document.body.style.cursor = "default";
  
  if (mapElement) {
    mapElement.style.cursor = "grab";
    mapElement.classList.remove("dragging");
    
    // ADDED: Force restore pointer events to all tiles
    const tiles = mapElement.querySelectorAll('.tile');
    tiles.forEach(tile => {
      tile.style.pointerEvents = 'auto';
    });
  }
}

/**
 * Check if drag state is consistent
 * @param {Object} state - The drag state object
 */
export function checkDragState(state) {
  if (!state.isMouseActuallyDown && state.isDragging) {
    stopDrag(state, null);
  }
}

/**
 * Setup global mouse event handlers
 * @param {Object} state - The drag state object
 * @param {HTMLElement} mapElement - The map DOM element
 * @returns {Object} - Object with event handlers
 */
export function createMouseEventHandlers(state, mapElement) {
  return {
    globalMouseDown: () => state.isMouseActuallyDown = true,
    
    globalMouseUp: () => {
      state.isMouseActuallyDown = false;
      if (state.isDragging) {
        stopDrag(state, mapElement);
      }
      document.body.style.cursor = "default";
      
      // ADDED: Ensure map is grabbable again after drag
      if (mapElement) {
        mapElement.style.cursor = "grab";
      }
    },
    
    globalMouseMove: (event) => {
      if (state.isMouseActuallyDown && state.isDragging) {
        drag(event, state, state.tileSize, state.updateCoordinates);
      }
      else if (!state.isMouseActuallyDown && state.isDragging) {
        stopDrag(state, mapElement);
      }
    },
    
    globalMouseLeave: () => { 
      if (state.isDragging) stopDrag(state, mapElement); 
    },
    
    visibilityChange: () => { 
      if (document.visibilityState === 'hidden' && state.isDragging) {
        stopDrag(state, mapElement); 
      }
    }
  };
}
