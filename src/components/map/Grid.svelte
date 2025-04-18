<script>
  import { onMount, onDestroy } from "svelte";
  import { derived } from "svelte/store";
  import { browser } from '$app/environment';
  import { 
    map, 
    ready,
    coordinates,
    TILE_SIZE,
    EXPANDED_COLS_FACTOR,
    EXPANDED_ROWS_FACTOR,
    moveTarget,
    targetStore,
    highlightedStore,
    setHighlighted
  } from "../../lib/stores/map.js";
  import { game, currentPlayer } from "../../lib/stores/game.js";
  import Torch from '../icons/Torch.svelte';
  import Structure from '../icons/Structure.svelte';
  
  // Props with defaults to avoid destructuring errors
  const { 
    detailed = false, 
    openActions = null, 
    isPathDrawingMode = false, 
    moveComponentRef = null,
    onAddPathPoint = null,
    onClick = null // Add onClick to the props destructuring
  } = $props();
  
  let mapElement = null;
  let resizeObserver = null;
  let introduced = $state(false);
  let keysPressed = $state(new Set());
  let keyboardNavigationInterval = $state(null);
  let wasDrag = $state(false);
  let dist = $state(0);
  
  const DRAG_THRESHOLD = 5;
  
  const isMoving = $derived($map.isDragging || keyboardNavigationInterval !== null);
  
  const gridArray = derived(
    coordinates,
    $coordinates => $coordinates?.filter(cell => cell.isInMainView) || []
  );
  
  let customPathPoints = $state([]);
  
  $effect(() => {
    if (isPathDrawingMode) {
      console.log('Path drawing mode activated in Grid component');
      // Only initialize customPathPoints if it's empty and we're starting path drawing mode
      if (customPathPoints.length === 0 && $map.target) {
        // Initialize with current tile as first point
        customPathPoints = [{ x: $map.target.x, y: $map.target.y }];
        
        // Notify parent about initial path point
        if (onAddPathPoint) {
          onAddPathPoint({ x: $map.target.x, y: $map.target.y });
        }
      }
    } else {
      // Reset when path drawing ends
      customPathPoints = [];
    }
  });

  function resizeMap(mapElement) {
    if (!mapElement) return;
    
    map.update(state => {
      const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const tileSizePx = TILE_SIZE * baseFontSize;
      const width = mapElement.clientWidth;
      const height = mapElement.clientHeight;

      // Calculate how many tiles can fit in the viewport
      // Add 1 to ensure we fill the entire viewport plus a bit more
      let cols = Math.ceil(width / tileSizePx) + 1;
      let rows = Math.ceil(height / tileSizePx) + 1;
      
      // Ensure we have odd numbers for centered target
      cols = cols % 2 === 0 ? cols + 1 : cols;
      rows = rows % 2 === 0 ? rows + 1 : rows;

      cols = Math.max(cols, 7); // Increased minimum
      rows = Math.max(rows, 7); // Increased minimum

      return {
        ...state,
        cols,
        rows,
      };
    });
  }
  
  let lastDragUpdateTime = 0;
  const DRAG_THROTTLE = 50;
  
  function handleDragAction(event, sensitivity = 1) {
    const state = $map;
    
    if (event.type === 'dragstart' || event.type === 'touchstart') {
      const clientX = event.clientX || event.touches?.[0]?.clientX || 0;
      const clientY = event.clientY || event.touches?.[0]?.clientY || 0;
      
      dist = 0;
      wasDrag = false;
      
      setHighlighted(null, null);
      
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
    
    else if (event.type === 'dragmove' || event.type === 'touchmove') {
      if (!state.isDragging || state.dragSource !== 'map') return false;
      
      const currentTime = Date.now();
      
      if (currentTime - lastDragUpdateTime < DRAG_THROTTLE) {
        return false;
      }
      
      const clientX = event.clientX || event.touches?.[0]?.clientX || 0;
      const clientY = event.clientY || event.touches?.[0]?.clientY || 0;
      
      const deltaX = clientX - state.dragStartX;
      const deltaY = clientY - state.dragStartY;

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

      lastDragUpdateTime = currentTime;

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
    }, 1.5);
  }
  
  function handleTouchEnd() {
    if ($map.isDragging && $map.dragSource === 'map') {
      handleDragAction({ type: 'touchend' });
    }
  }
  
  let hoverTimeout = null;
  function handleTileHover(cell) {
    if (detailed || isPathDrawingMode) {
      // Only set highlight in path drawing mode, not when details is open
      if (isPathDrawingMode && !detailed) {
        setHighlighted(cell.x, cell.y);
      }
      return;
    }
    
    if (isMoving || $map.isDragging) return;
    
    if (hoverTimeout) clearTimeout(hoverTimeout);
    
    hoverTimeout = setTimeout(() => {
      if (!detailed && !$map.isDragging && (!$highlightedStore || $highlightedStore.x !== cell.x || $highlightedStore.y !== cell.y)) {
        setHighlighted(cell.x, cell.y);
      }
      hoverTimeout = null;
    }, 50);
  }
  
  $effect(() => {
    // Clear highlight when dragging, but not when details is open
    if (!detailed && (isMoving || $map.isDragging) && $highlightedStore) {
      setHighlighted(null, null);
    }
  });
  
  // Add a new function to check if a tile has any content
  function hasTileContent(tile) {
    if (!tile) return false;
    
    return (
      tile.structure || 
      (tile.groups && tile.groups.length > 0) || 
      (tile.players && tile.players.length > 0) || 
      (tile.items && tile.items.length > 0)
    );
  }

  // Keep the existing hasMeaningfulActions function for deciding which actions to show
  function hasMeaningfulActions(tile) {
    if (!tile || !$currentPlayer?.uid) return false;
    
    const playerId = $currentPlayer.uid;
    
    // Check for player-owned groups (enables move and gather)
    const hasOwnedGroups = tile.groups && tile.groups.some(group => 
      group.owner === playerId && group.status === 'idle'
    );
    
    // Check for mobilization candidates
    const playerOnTile = tile.players && tile.players.some(p => p.id === playerId);
    const hasValidUnits = tile.groups && tile.groups.some(group => 
      group.owner === playerId && 
      group.status !== 'mobilizing' &&
      group.status !== 'moving' &&
      group.status !== 'demobilising' &&
      group.status !== 'fighting' &&
      group.units && 
      group.units.some(unit => unit.type !== 'player')
    );
    
    // Check for demobilization candidates
    const hasValidGroupsForDemob = tile.groups && tile.structure && tile.groups.some(group => 
      group.owner === playerId && 
      group.status !== 'mobilizing' && 
      group.status !== 'moving' &&
      group.status !== 'demobilising' &&
      group.status !== 'fighting'
    );
    
    // Check for attack candidates
    const hasPlayerCombatGroups = tile.groups && tile.groups.some(group => 
      group.owner === playerId && 
      group.status !== 'mobilizing' && 
      group.status !== 'moving' &&
      group.status !== 'demobilising' &&
      group.status !== 'fighting' &&
      !group.inBattle
    );
    
    const hasEnemyGroups = tile.groups && tile.groups.some(group => 
      group.owner !== playerId && 
      group.status !== 'fighting' &&
      !group.inBattle
    );
    
    // Check for ongoing battles
    const hasBattles = tile.groups && tile.groups.some(group => 
      group.inBattle && group.battleId && group.status === 'fighting'
    );
    
    const playerCanJoinBattle = tile.groups && tile.groups.some(group => 
      group.owner === playerId && 
      group.status !== 'mobilizing' && 
      group.status !== 'moving' &&
      group.status !== 'demobilising' &&
      group.status !== 'fighting' &&
      !group.inBattle
    );
    
    // Return true if any meaningful action is available
    return hasOwnedGroups || 
           (playerOnTile || hasValidUnits) || 
           hasValidGroupsForDemob || 
           (hasPlayerCombatGroups && hasEnemyGroups) ||
           (hasBattles && playerCanJoinBattle);
  }

  function handleGridClick(event) {
    clickCount++;
    lastClickTime = Date.now();
    
    if (wasDrag || !$ready || detailed) {
        console.log('Click ignored: wasDrag, map not ready, or details open');
        return;
    }
    
    let tileX, tileY;
    
    let tileElement = event.target.closest('.tile');
    
    if (!tileElement) {
        const gridElement = event.currentTarget.querySelector('.main-grid');
        if (!gridElement) {
            console.log('Click ignored: grid not found');
            return;
        }
        
        const rect = gridElement.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        const tileWidth = rect.width / $map.cols;
        const tileHeight = rect.height / $map.rows;
        
        const col = Math.floor(x / tileWidth);
        const row = Math.floor(y / tileHeight);
        
        if (col < 0 || col >= $map.cols || row < 0 || row >= $map.rows) {
            console.log('Click ignored: outside grid bounds');
            return;
        }
        
        const centerCol = Math.floor($map.cols / 2);
        const centerRow = Math.floor($map.rows / 2);
        
        tileX = $map.target.x - centerCol + col;
        tileY = $map.target.y - centerRow + row;
        
    } 
    else {
        const ariaLabel = tileElement.getAttribute('aria-label');
        const coordsMatch = ariaLabel ? ariaLabel.match(/Coordinates (-?\d+),(-?\d+)/) : null;
        
        if (!coordsMatch) {
            console.log('Click ignored: no coordinates found in tile');
            return;
        }
        
        tileX = parseInt(coordsMatch[1], 10);
        tileY = parseInt(coordsMatch[2], 10);
    }
    
    if (tileX !== undefined && tileY !== undefined) {
        if (isPathDrawingMode) {
            const point = { x: tileX, y: tileY };
            console.log('Grid click in path drawing mode:', point);
            handlePathPoint(point);
        } else {
            console.log('Grid click on tile:', { x: tileX, y: tileY });
            
            // Dispatch a custom event with the tile coordinates
            const clickEvent = new CustomEvent('gridclick', { 
                detail: { x: tileX, y: tileY }
            });
            dispatchEvent(clickEvent);
            
            // Check if we need to pass to parent click handler
            if (onClick) {
                onClick({ detail: { x: tileX, y: tileY } });
            }
            
            // Move target (this should be handled by the parent)
            moveTarget(tileX, tileY);
        }
    }
    
    // Only call preventDefault if it's a function
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }
  }

  function handlePathPoint(point) {
    if (!isPathDrawingMode) {
        console.log('Not in path drawing mode, ignoring point');
        return;
    }
    
    console.log('Grid: Adding path point:', point);
    
    // Check if point already exists in path
    if (customPathPoints.length > 0) {
        const lastPoint = customPathPoints[customPathPoints.length - 1];
        
        // Don't add if it's the same as the last point
        if (lastPoint.x === point.x && lastPoint.y === point.y) {
            console.log('Point is duplicate of last point, skipping');
            return;
        }
        
        // Check if point already exists in path
        const pointExists = customPathPoints.some(p => p.x === point.x && p.y === point.y);
        if (pointExists) {
            console.log('Point already in path');
            return;
        }
        
        const dx = Math.abs(point.x - lastPoint.x);
        const dy = Math.abs(point.y - lastPoint.y);
        
        // For non-adjacent points, calculate path between them
        if (dx > 1 || dy > 1) {
            console.log('Calculating path to non-adjacent point');
            const intermediatePath = calculatePathBetweenPoints(
                lastPoint.x, lastPoint.y, 
                point.x, point.y
            );
            
            // Check if adding these points would exceed 20 steps
            if (customPathPoints.length + intermediatePath.length > 20) {
                console.log('Path exceeds 20 steps limit, truncating...');
                
                // Calculate how many points we can add without exceeding limit
                const pointsToAdd = 20 - customPathPoints.length;
                if (pointsToAdd <= 0) {
                    console.log('Path already at maximum length');
                    return;
                }
                
                // Add only allowed number of points
                customPathPoints = [
                    ...customPathPoints,
                    ...intermediatePath.slice(0, pointsToAdd)
                ];
            } else {
                // Add all intermediate points
                customPathPoints = [...customPathPoints, ...intermediatePath];
            }
        } else {
            // Check if adding this point would exceed 20 steps
            if (customPathPoints.length >= 20) {
                console.log('Maximum path length reached (20 steps)');
                return;
            }
            
            // For adjacent or first point, add directly
            customPathPoints = [...customPathPoints, point];
        }
    } else {
        // First point in path
        customPathPoints = [point];
    }
    
    console.log('Updated path points:', customPathPoints);
    
    // Call the parent function with the entire path, not just the new point
    if (onAddPathPoint) {
        onAddPathPoint(point);
    }
    
    // Update move component
    if (moveComponentRef && typeof moveComponentRef.updateCustomPath === 'function') {
        moveComponentRef.updateCustomPath(customPathPoints);
    }
  }

  function handleKeyDown(event) {
    // Handle clicking with keyboard (Enter or Space)
    if ((event.key === 'Enter' || event.key === ' ') && !isMoving) {
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      handleGridClick(event);
    }
    
    // Original keyboard handler for Escape key
    if (event.key === 'Escape') {
      onClose();
    }
  }

  let lastClickTime = $state(0);
  let clickCount = $state(0);

  onMount(() => {
    resizeObserver = new ResizeObserver(() => {
      if (mapElement) {
        setTimeout(() => resizeMap(mapElement), 100); // Add slight delay for more reliable sizing
      }
    });
    
    if (mapElement) {
      resizeObserver.observe(mapElement);
      // Call resize immediately and then again after a short delay
      resizeMap(mapElement);
      setTimeout(() => resizeMap(mapElement), 200);
    }
    
    const keyboardCleanup = setupKeyboardNavigation();
    
    setTimeout(() => introduced = true, 1000);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      if (keyboardCleanup) keyboardCleanup();
      if (keyboardNavigationInterval) {
        clearInterval(keyboardNavigationInterval);
      }
    };
  });

  onDestroy(() => {
    if (hoverTimeout) clearTimeout(hoverTimeout);
  });

  const backgroundColor = $derived($targetStore?.color || "var(--color-dark-blue)");

  function getStructureClass(structure) {
    if (!structure) return '';
    
    switch(structure.type) {
      case 'spawn': return 'spawn-structure';
      case 'watchtower': return 'watchtower-structure';
      case 'fortress': return 'fortress-structure';
      default: return '';
    }
  }

  const playerPosition = $derived(() => {
    if ($game.playerWorldData?.lastLocation) {
      return {
        x: $game.playerWorldData.lastLocation.x,
        y: $game.playerWorldData.lastLocation.y
      };
    }
    return null;
  });
  
  function isPlayerPosition(x, y) {
    return playerPosition && playerPosition.x === x && playerPosition.y === y;
  }
  
  const currentPlayerId = $derived($currentPlayer?.uid);
  
  function isCurrentPlayer(playerEntity) {
    return playerEntity && playerEntity.uid === currentPlayerId;
  }
  
  function hasCurrentPlayer(players) {
    return players && players.some(player => isCurrentPlayer(player));
  }

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
  
  function getRarityColor(rarity) {
    switch(rarity) {
      case 'mythic': return 'rgba(255, 128, 255, 0.5)';
      case 'legendary': return 'rgba(255, 165, 0, 0.5)';
      case 'epic': return 'rgba(148, 0, 211, 0.4)';
      case 'rare': return 'rgba(0, 112, 221, 0.4)';
      case 'uncommon': return 'rgba(30, 255, 0, 0.3)';
      default: return 'transparent';
    }
  }
  
  function getHighestRarityItem(items) {
    if (!items || !items.length) return null;
    
    const rarityOrder = {
      'common': 0,
      'uncommon': 1,
      'rare': 2,
      'epic': 3,
      'legendary': 4,
      'mythic': 5
    };
    
    return items.reduce((highest, current) => {
      const highestRank = rarityOrder[highest?.rarity || 'common'] || 0;
      const currentRank = rarityOrder[current?.rarity || 'common'] || 0;
      return currentRank > highestRank ? current : highest;
    }, null);
  }

  function calculatePathsForDisplay($coordinates) {
    const paths = [];
    
    for (const cell of $coordinates) {
      if (cell.groups && cell.groups.length > 0) {
        for (const group of cell.groups) {
          if (group.status === 'moving' && group.movementPath && Array.isArray(group.movementPath)) {
            const currentPath = group.movementPath;
            const currentPathIndex = group.pathIndex || 0;
            
            if (currentPathIndex < currentPath.length - 1) {
              paths.push({
                id: `path-${group.id}`,
                owner: group.owner,
                group: group,
                points: currentPath.slice(currentPathIndex),
                color: getPathColor(group)
              });
            }
          }
        }
      }
    }
    
    return paths;
  }
  
  function getPathColor(group) {
    let baseColor = "rgba(255, 255, 255, 0.6)";
    
    if (group.faction) {
      switch(group.faction.toLowerCase()) {
        case 'human': 
          baseColor = "rgba(255, 230, 150, 0.7)";
          break;
        case 'elf': 
          baseColor = "rgba(150, 255, 150, 0.7)";
          break;
        case 'dwarf': 
          baseColor = "rgba(230, 180, 150, 0.7)";
          break;
        case 'goblin': 
          baseColor = "rgba(150, 255, 230, 0.7)";
          break;
        case 'fairy': 
          baseColor = "rgba(230, 150, 255, 0.7)";
          break;
        default:
          baseColor = "rgba(255, 255, 255, 0.6)";
      }
    }
    
    if (group.owner === $currentPlayer?.uid) {
      return baseColor.replace('0.7', '0.9');
    }
    
    return baseColor;
  }
  
  const movementPaths = $derived(calculatePathsForDisplay($coordinates));
  
  const currentDrawnPath = $derived({
    id: 'custom-path-drawing',
    points: customPathPoints,
    color: 'rgba(255, 255, 255, 0.9)'
  });
  
  const hasCurrentPath = $derived(customPathPoints.length > 0);

  function coordToPosition(x, y) {
    const state = $map;
    const viewportCenterX = Math.floor(state.cols * (state.minimap ? EXPANDED_COLS_FACTOR : 1) / 2);
    const viewportCenterY = Math.floor(state.rows * (state.minimap ? EXPANDED_ROWS_FACTOR : 1) / 2);
    
    const offsetX = x - state.target.x;
    const offsetY = y - state.target.y;
    
    // Calculate position as decimal values from 0 to 1 instead of percentages
    const posX = (viewportCenterX + offsetX + 0.5) / state.cols;
    const posY = (viewportCenterY + offsetY + 0.5) / state.rows;
    
    return { posX, posY };
  }
  
  function createPathData(points) {
    if (!points || points.length < 2) return '';
    
    let pathData = '';
    
    for (let i = 0; i < points.length; i++) {
      const { posX, posY } = coordToPosition(points[i].x, points[i].y);
      
      // Convert to SVG coordinate space (multiply by 100 to use the whole SVG space)
      const svgX = posX * 100;
      const svgY = posY * 100;
      
      if (i === 0) {
        pathData += `M${svgX} ${svgY}`;  // Remove percentage signs, add proper spacing
      } else {
        pathData += ` L${svgX} ${svgY}`;  // Remove percentage signs, add proper spacing
      }
    }
    
    return pathData;
  }

  // Add a function to calculate path between two points using a simplified line algorithm
  function calculatePathBetweenPoints(startX, startY, endX, endY) {
    const path = [];
    
    // Calculate steps using Bresenham's line algorithm
    const dx = Math.abs(endX - startX);
    const dy = Math.abs(endY - startY);
    const sx = startX < endX ? 1 : -1;
    const sy = startY < endY ? 1 : -1;
    
    let err = dx - dy;
    let x = startX;
    let y = startY;
    
    // Generate intermediate steps (excluding start point which is already in the path)
    while (x !== endX || y !== endY) {
      const e2 = 2 * err;
      
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
      
      // Add intermediate point
      path.push({ x, y });
    }
    
    return path;
  }
</script>

<svelte:window
  onmouseup={handleMouseUp}
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseUp}
  onblur={() => $map.isDragging && handleMouseUp()}
  onvisibilitychange={() => document.visibilityState === 'hidden' && handleMouseUp()}
/>

<div class="map-container" 
    style="--tile-size: {TILE_SIZE}em;" 
    class:modal-open={detailed} 
    class:touch-active={$map.isDragging && $map.dragSource === 'map'}
    class:path-drawing-mode={!!isPathDrawingMode}>
  <div
    class="map"
    bind:this={mapElement}
    onmousedown={handleMouseDown}
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
    ontouchcancel={handleTouchEnd}
    onclick={handleGridClick}
    onkeydown={handleKeyDown}
    class:moving={isMoving}
    class:path-drawing={!!isPathDrawingMode}
    style="--terrain-color: {backgroundColor};"
    role="grid"
    tabindex="0"
    aria-label={isPathDrawingMode 
      ? "Click on tiles to create a movement path" 
      : "Interactive coordinate map. Use WASD or arrow keys to navigate."}
  >    
    {#if $ready}
      <svg class="path-layer" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
        {#if isPathDrawingMode && hasCurrentPath}
          <g class="path-group custom-path-group">
            <path 
              d={createPathData(customPathPoints)} 
              stroke="rgba(255, 255, 255, 0.9)"
              stroke-width="1.5"
              stroke-dasharray="6,4"
              stroke-linejoin="round" 
              stroke-linecap="round"
              fill="none"
              opacity="0.9"
            />
            
            <!-- Draw direction dots along the path -->
            {#each customPathPoints as point, i}
              {@const pos = coordToPosition(point.x, point.y)}
              {#if i < customPathPoints.length - 1 && i % 2 === 0}
                {@const nextPos = coordToPosition(customPathPoints[i+1].x, customPathPoints[i+1].y)}
                {@const midX = (pos.posX * 100 + nextPos.posX * 100) / 2}
                {@const midY = (pos.posY * 100 + nextPos.posY * 100) / 2}
                {#if Math.abs(nextPos.posX - pos.posX) > 0.02 || Math.abs(nextPos.posY - pos.posY) > 0.02}
                  <circle 
                    cx="{midX}" 
                    cy="{midY}" 
                    r="0.4" 
                    fill="rgba(255, 255, 255, 0.9)"
                    opacity="0.9"
                  />
                {/if}
              {/if}
            {/each}
            
            <!-- Always render all points, including first point -->
            {#each customPathPoints as point, i}
              {@const pos = coordToPosition(point.x, point.y)}
              <circle 
                cx="{pos.posX * 100}" 
                cy="{pos.posY * 100}" 
                r="{i === 0 || i === customPathPoints.length - 1 ? '0.7' : '0.4'}" 
                fill="{i === 0 ? 'rgba(50, 205, 50, 0.9)' : i === customPathPoints.length - 1 ? 'rgba(220, 20, 60, 0.9)' : 'white'}" 
                stroke="rgba(0, 0, 0, 0.5)"
                stroke-width="0.5"
              />
            {/each}
          </g>
        {/if}
        
        {#each movementPaths as path}
          <g class="path-group" class:current-player-path={path.owner === $currentPlayer?.uid}>
            <path 
              d={createPathData(path.points)} 
              stroke={path.color}
              stroke-width="1"
              stroke-dasharray="8,5"
              stroke-linejoin="round"
              stroke-linecap="round"
              fill="none"
              opacity="0.8"
            />
            
            <!-- Draw direction dots along the path -->
            {#each path.points as point, i}
              {@const pos = coordToPosition(point.x, point.y)}
              {#if i < path.points.length - 1 && i % 2 === 0}
                {@const nextPos = coordToPosition(path.points[i+1].x, path.points[i+1].y)}
                {@const midX = (pos.posX * 100 + nextPos.posX * 100) / 2}
                {@const midY = (pos.posY * 100 + nextPos.posY * 100) / 2}
                {#if Math.abs(nextPos.posX - pos.posX) > 0.02 || Math.abs(nextPos.posY - pos.posY) > 0.02}
                  <circle 
                    cx="{midX}" 
                    cy="{midY}" 
                    r="0.35" 
                    fill={path.color}
                    opacity="0.9"
                  />
                {/if}
              {/if}
              
              <circle 
                cx="{pos.posX * 100}" 
                cy="{pos.posY * 100}" 
                r="{i === 0 || i === path.points.length - 1 ? '0.5' : '0.25'}" 
                fill={path.color} 
                stroke="rgba(0,0,0,0.3)"
                stroke-width="0.5"
                opacity="{i === 0 || i === path.points.length - 1 ? '1' : '0.6'}"
              />
            {/each}
          </g>
        {/each}
      </svg>
      
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
          {@const highestRarityItem = getHighestRarityItem(cell.items)}
          <div
            class="tile {getStructureClass(cell.structure)} {cell.terrain?.rarity || 'common'}"
            class:center={cell.isCenter}
            class:highlighted={cell.highlighted}
            class:has-structure={cell.structure}
            class:has-groups={cell.groups?.length > 0}
            class:has-players={cell.players?.length > 0}
            class:has-items={cell.items?.length > 0}
            class:player-position={isPlayerPosition(cell.x, cell.y)}
            class:current-player-tile={isCurrentPlayerTile}
            onmouseenter={() => handleTileHover(cell)}
            role="gridcell"
            tabindex="-1"
            aria-label="Tile {isPlayerPosition(cell.x, cell.y) ? 'containing your position' : ''}{isCurrentPlayerTile ? ', your character' : ''}{cell.structure ? ', has ' + (cell.structure.type || 'structure') : ''}{cell.groups?.length ? ', has ' + cell.groups.length + ' groups' : ''}{cell.players?.length ? ', has ' + cell.players.length + ' players' : ''}{cell.items?.length ? ', has ' + cell.items.length + ' items' : ''}"
            aria-current={cell.isCenter ? "location" : undefined}
            style="
              background-color: {cell.color};
              animation-delay: {!introduced && cell.isCenter ? 0 : (!introduced ? 0.05 * distance : 0)}s;
              {cell.terrain?.rarity && cell.terrain.rarity !== 'common' ? `box-shadow: inset 0 0 ${getRarityGlowSize(cell.terrain.rarity)} ${getRarityColor(cell.terrain.rarity)};` : ''}
              {highestRarityItem ? `box-shadow: inset 0 0 ${getRarityGlowSize(highestRarityItem.rarity)} ${getRarityColor(highestRarityItem.rarity)};` : ''}
            "
          >
            {#if cell.structure && cell.structure.type === 'spawn'}
              <div class="spawn-icon-container">
                <Torch size="85%" extraClass="spawn-icon" />
              </div>
            {:else if cell.structure}
              <div class="structure-icon-container {cell.structure.type}-container">
                <Structure size="75%" extraClass="{cell.structure.type}-icon structure-icon" />
              </div>
            {/if}

            {#if isPlayerPosition(cell.x, cell.y)}
              <div class="entity-indicator player-position-indicator" aria-hidden="true"></div>
            {/if}

            <!-- Entity indicators container -->
            <div class="entity-indicators">
              {#if cell.players?.length > 0}
                <div class="entity-indicator player-indicator" class:current-player-indicator={isCurrentPlayerTile} aria-hidden="true">
                  <span class="count">{cell.players.length}</span>
                </div>
              {/if}

              {#if cell.groups?.length > 0}
                <div class="entity-indicator group-indicator" aria-hidden="true">
                  <span class="count">{cell.groups.length}</span>
                </div>
              {/if}
              
              {#if cell.items?.length > 0}
                <div class="entity-indicator item-indicator {highestRarityItem?.rarity || 'common'}" aria-hidden="true">
                  <span class="count">{cell.items.length}</span>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
  
  {#if isPathDrawingMode}
    <div class="path-drawing-indicator">
      Path Drawing Mode
    </div>
  {/if}
</div>

<style>
  .map-container {
    position: relative;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: var(--color-dark-blue);
    user-select: none;
    z-index: 1; /* Keep this z-index low */
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    transform: translateZ(0);
    will-change: transform;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }

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
    /* Ensure map consistency during movement */
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    margin: 0;
    padding: 0;
  }

  .grid {
    display: grid;
    box-sizing: border-box;
    z-index: 2; /* Keep grid z-index lower than UI components */
    /* Fix for grid wobbling during drag */
    transform: translateZ(0);
    will-change: transform;
    touch-action: manipulation;
  }

  .main-grid {
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-template-rows: repeat(var(--rows), 1fr);
    width: 100%;
    height: 100%;
    /* Ensure grid is always positioned the same way */
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  .main-grid.animated .tile {
    opacity: 0;
    transform: scale(0.8);
    animation: revealTile 0.5s ease-out forwards;
    animation-fill-mode: both;
  }
  
  .main-grid:not(.animated) .tile {
    opacity: 1;
    transform: scale(1);
  }
  
  .main-grid.animated .tile.center {
    z-index: 3;
    position: relative;
    animation: revealCenterTile 0.6s ease-out forwards;
    animation-delay: 0s;
    animation-fill-mode: both;
  }
  
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
    font-size: 1em;
    color: rgba(255, 255, 255, 0.7);
    text-shadow: 0 0 0.1875em rgba(0, 0, 0, 0.5);
    user-select: none;
    z-index: 1;
    font-family: var(--font-body);
  }

  .tile.center {
    z-index: 3;
    position: relative;
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.7);
    border: 0.12em solid rgba(255, 255, 255, 0.5);
  }
  
  .map:not(.moving) .tile:hover::after,
  .tile.highlighted::after {
    content: "";
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.9);
    pointer-events: none;
    z-index: 10;
  }
  
  .map.moving {
    cursor: grabbing;
    /* Add these properties to ensure no layout changes during movement */
    will-change: transform;
  }

  .map.moving .tile {
    pointer-events: none;
    cursor: grabbing;
  }

  .map-container.modal-open {
    cursor: grab;
  }

  .map-container.modal-open .map {
    pointer-events: all;
  }

  .entity-indicators {
    position: absolute;
    display: flex;
    gap: 0.15em;
    bottom: 0.2em;
    right: 0.2em;
    z-index: 4;
    pointer-events: none;
  }

  .entity-indicator {
    width: 0.5em;
    height: 0.5em;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 0.0625em solid rgba(0, 0, 0, 0.3);
    box-shadow: 0 0 0.15em rgba(255, 255, 255, 0.3);
  }
  
  .structure-indicator {
    background: rgba(255, 255, 255, 0.9);
    border-radius: 0;
  }
  
  .group-indicator {
    background: rgba(255, 100, 100, 0.9);
    box-shadow: 0 0 .15em rgba(255, 100, 100, 0.6);
  }
  
  .player-indicator {
    background: rgba(100, 100, 255, 0.9);
    box-shadow: 0 0 .15em rgba(100, 100, 255, 0.6);
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
  }

  .count {
    font-size: 0.6em;
    font-weight: bold;
    color: rgba(0, 0, 0, 0.8);
    line-height: 1;
    font-family: var(--font-heading);
  }

  .item-indicator {
    background: rgba(255, 215, 0, 0.9);
    box-shadow: 0 0 .15em rgba(255, 215, 0, 0.6);
  }

  .tile.has-structure {
    box-shadow: inset 0 -0.1em 0.3em rgba(255, 255, 255, 0.3);
  }
  
  .tile.has-groups {
    box-shadow: inset 0 0 0.3em rgba(255, 100, 100, 0.4);
  }
  
  .tile.has-players {
    box-shadow: inset 0 0 0.3em rgba(100, 100, 255, 0.4);
  }
  
  .tile.has-items {
    box-shadow: inset 0 0 0.3em rgba(255, 215, 0, 0.4);
  }
  
  .tile.has-structure.has-groups,
  .tile.has-structure.has-players,
  .tile.has-structure.has-items,
  .tile.has-groups.has-players,
  .tile.has-groups.has-items,
  .tile.has-players.has-items {
    box-shadow: inset 0 0 0.4em rgba(255, 255, 255, 0.5);
  }

  @media (hover: none) {
    .map {
      cursor: default;
    }
    
    .map.moving {
      cursor: default;
    }
  }

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

  @media (max-width: 768px) {
    .tile {
      font-size: 0.9em;
    }
  }

  @media (max-width: 480px) {
    .tile {
      font-size: 0.7em;
    }
  }

  @media (min-width: 640px) {
    .tile {
      font-size: 1.1em;
    }
  }

  @media (min-width: 1024px) {
    .tile {
      font-size: 1.2em;
    }
  }

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

  .spawn-structure {
    box-shadow: inset 0 0 0.5em rgba(0, 255, 255, 0.4);
  }
  
  .spawn-indicator {
    background: rgba(0, 255, 255, 0.9);
    box-shadow: 0 0 .25em rgba(0, 255, 255, 0.8);
    border-radius: 50%;
  }

  .spawn-indicator {
    background: rgba(0, 255, 255, 0.9);
    box-shadow: 0 0 .25em rgba(0, 255, 255, 0.8);
    border-radius: 50%;
  }

  .tile.spawn-structure:hover .spawn-icon-container :global(svg) {
    filter: drop-shadow(0 0 6px rgba(0, 255, 255, 0.8));
    opacity: 0.9;
  }
  
  .entity-indicator {
    z-index: 4;
  }
  
  .spawn-icon-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    pointer-events: none;
    opacity: 0.6;
  }
  
  :global(.spawn-icon) {
    opacity: 0.8;
    filter: drop-shadow(0 0 4px rgba(0, 255, 255, 0.6));
  }

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
  
  .tile.has-structure.has-groups.spawn-structure,
  .tile.has-structure.has-players.spawn-structure {
    box-shadow: inset 0 0 0.5em rgba(0, 255, 255, 0.6);
  }

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
  
  .current-player-tile .player-indicator {
    background: rgba(64, 224, 208, 0.9);
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
  
  .tile.player-position.has-structure,
  .tile.player-position.has-groups,
  .tile.player-position.has-players,
  .tile.player-position.spawn-structure {
    box-shadow: inset 0 0 0.6em rgba(255, 215, 0, 0.7);
  }

  .tile.mythic {
    z-index: 5;
  }
  
  .tile.legendary {
    z-index: 4;
  }
  
  .tile.epic {
    z-index: 3;
  }

  .tile.mythic.highlighted::after,
  .tile.legendary.highlighted::after,
  .tile.epic.highlighted::after,
  .tile.rare.highlighted::after,
  .tile.uncommon.highlighted::after {
    box-shadow: inset 0 0 0 2px white, inset 0 0 4px 1px rgba(255, 255, 255, 0.8);
    z-index: 15;
  }
  
  .tile.highlighted .entity-indicator {
    z-index: 16;
  }

  .item-indicator {
    bottom: .2em;
    right: .2em;
    width: .5em;
    height: .5em;
    background: rgba(255, 215, 0, 0.9);
    border: .0625em solid rgba(0, 0, 0, 0.3);
    box-shadow: 0 0 .15em rgba(255, 215, 0, 0.6);
    border-radius: 50%;
  }
  
  .item-indicator.uncommon {
    background: rgba(30, 255, 0, 0.9);
    box-shadow: 0 0 .15em rgba(30, 255, 0, 0.6);
  }
  
  .item-indicator.rare {
    background: rgba(0, 112, 221, 0.9);
    box-shadow: 0 0 .15em rgba(0, 112, 221, 0.6);
  }
  
  .item-indicator.epic {
    background: rgba(148, 0, 211, 0.9);
    box-shadow: 0 0 .15em rgba(148, 0, 211, 0.6);
  }
  
  .item-indicator.legendary {
    background: rgba(255, 165, 0, 0.9);
    box-shadow: 0 0 .15em rgba(255, 165, 0, 0.6);
  }
  
  .item-indicator.mythic {
    background: rgba(255, 128, 255, 0.9);
    box-shadow: 0 0 .15em rgba(255, 128, 255, 0.6);
    animation: pulseItemMythic 2s infinite;
  }
  
  @keyframes pulseItemMythic {
    0% { box-shadow: 0 0 0 0 rgba(255, 128, 255, 0.8); }
    70% { box-shadow: 0 0 0 0.4em rgba(255, 128, 255, 0); }
    100% { box-shadow: 0 0 0 0 rgba(255, 128, 255, 0); }
  }

  .path-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 50; /* Increased from 5 to ensure it's above tiles but below UI */
    overflow: visible;
    transform: translateZ(0);
    will-change: transform;
    touch-action: none;
  }
  
  .path-group {
    transition: opacity 0.3s ease;
    pointer-events: none; /* Ensure paths don't block clicks */
  }
  
  .path-group:hover {
    opacity: 1;
  }
  
  .current-player-path {
    z-index: 55; /* Ensure current player paths are more visible */
  }
  
  @keyframes dash {
    to {
      stroke-dashoffset: -26; 
    }
  }
  
  .path-layer path {
    animation: dash 40s linear infinite;
    stroke-linejoin: round;  
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
    stroke-width: 1;
    pointer-events: none;
  }
  
  .custom-path-group path {
    animation: dash 16s linear infinite;
    stroke-dasharray: 6,4;
    stroke-width: 2; /* Make custom path thicker */
    filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.5)); /* Add glow effect */
  }
  
  .current-player-path path {
    animation: dash 30s linear infinite;
    stroke-dasharray: 8,4;
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.3));
  }
  
  .map-container {
    position: relative;
  }
  
  .grid {
    position: relative;
    z-index: 2;
  }

  .custom-path-group {
    z-index: 60; /* Ensure custom path is on top */
  }
  
  .path-drawing-mode .map {
    cursor: crosshair !important;
  }
  
  .map-container.path-drawing-mode .map:not(.moving) .tile:hover {
    box-shadow: inset 0 0 0 3px rgba(255, 255, 0, 0.8) !important;
    position: relative;
    z-index: 45; /* Lower than path layer but higher than other tiles */
  }
  
  .path-drawing-indicator {
    position: absolute;
    top: 1em;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(255, 255, 255, 0.85);
    color: rgba(0, 0, 0, 0.8);
    padding: 0.5em 1em;
    border-radius: 0.3em;
    font-weight: 500;
    pointer-events: none;
    z-index: 1000;
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(0.5em);
    -webkit-backdrop-filter: blur(0.5em);
    animation: reveal 0.4s ease-out forwards;
    font-family: var(--font-heading);
    font-size: 0.9em;
    box-sizing: border-box;
    margin: 0;
  }
  
  @keyframes reveal {
    from {
      opacity: 0;
      transform: translate(-50%, -1em);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  /* Make sure tiles don't block paths */
  .tile {
    /* ...existing tile styles... */
    z-index: 1;
  }

  /* Make center tile appear above other tiles */
  .tile.center {
    z-index: 3;
  }

  .structure-icon-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    pointer-events: none;
    opacity: 0.7;
  }
  
  :global(.structure-icon) {
    opacity: 0.8;
    filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.5));
  }
  
  :global(.fortress-icon) {
    filter: drop-shadow(0 0 3px rgba(230, 190, 138, 0.7));
  }
  
  :global(.outpost-icon) {
    filter: drop-shadow(0 0 3px rgba(138, 176, 230, 0.7));
  }
  
  :global(.watchtower-icon) {
    filter: drop-shadow(0 0 3px rgba(168, 230, 138, 0.7));
  }
  
  :global(.stronghold-icon) {
    filter: drop-shadow(0 0 3px rgba(230, 138, 138, 0.7));
  }
  
  :global(.citadel-icon) {
    filter: drop-shadow(0 0 3px rgba(209, 138, 230, 0.7));
  }
  
  .fortress-structure:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border: 0.15em double rgba(230, 190, 138, 0.6);
    pointer-events: none;
    z-index: 3;
  }
  
  .outpost-structure:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border: 0.15em double rgba(138, 176, 230, 0.6);
    pointer-events: none;
    z-index: 3;
  }
  
  .watchtower-structure:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border: 0.15em double rgba(168, 230, 138, 0.6);
    pointer-events: none;
    z-index: 3;
  }
  
  .stronghold-structure:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border: 0.15em double rgba(230, 138, 138, 0.6);
    pointer-events: none;
    z-index: 3;
  }
  
  .citadel-structure:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border: 0.15em double rgba(209, 138, 230, 0.6);
    pointer-events: none;
    z-index: 3;
  }
  
  .tile.fortress-structure {
    box-shadow: inset 0 0 0.5em rgba(230, 190, 138, 0.4);
  }
  
  .tile.outpost-structure {
    box-shadow: inset 0 0 0.5em rgba(138, 176, 230, 0.4);
  }
  
  .tile.watchtower-structure {
    box-shadow: inset 0 0 0.5em rgba(168, 230, 138, 0.4);
  }
  
  .tile.stronghold-structure {
    box-shadow: inset 0 0 0.5em rgba(230, 138, 138, 0.4);
  }
  
  .tile.citadel-structure {
    box-shadow: inset 0 0 0.5em rgba(209, 138, 230, 0.4);
  }
</style>
