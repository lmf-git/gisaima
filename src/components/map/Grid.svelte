<script>
  import { onMount, onDestroy } from "svelte";
  import { derived, get } from "svelte/store";  // Add get import
  import { browser } from '$app/environment';
  import { 
    map, 
    ready,
    coordinates,
    TILE_SIZE,
    moveTarget,
    targetStore,
    highlightedStore,
    setHighlighted,
    getChunkKey
  } from "../../lib/stores/map.js";
  import { game, currentPlayer } from "../../lib/stores/game.js";
  import { user } from '../../lib/stores/user';
  import Torch from '../icons/Torch.svelte';
  import Structure from '../icons/Structure.svelte';
  import Human from '../icons/Human.svelte';
  import Elf from '../icons/Elf.svelte';
  import Dwarf from '../icons/Dwarf.svelte';
  import Goblin from '../icons/Goblin.svelte';
  import Fairy from '../icons/Fairy.svelte';
  import Compass from '../icons/Compass.svelte';
  import YouAreHere from '../icons/YouAreHere.svelte'; // Add YouAreHere import
  
  // Props with defaults using Svelte 5 $props() rune
  const { 
    detailed = false, 
    isPathDrawingMode = false, 
    onAddPathPoint = null,
    onClick = null,
    onClose = () => {},
    customPathPoints = [], // Accept path points directly as a prop instead of using a ref
    modalOpen = false // Add new prop to indicate if any modal is open
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
  
  $effect(() => {
    if (isPathDrawingMode) {
      console.log('Path drawing mode activated in Grid component');
      console.log('Current customPathPoints:', customPathPoints.length > 0 ? customPathPoints : 'empty');
      
      // Only initialize if empty and we have a target position
      if (customPathPoints.length === 0 && $map.target) {
        console.log('Initializing path with starting point:', $map.target);
        if (onAddPathPoint) {
          onAddPathPoint({ x: $map.target.x, y: $map.target.y });
        }
      }
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
      // Skip navigation when a modal is open or map isn't introduced
      if (!introduced || modalOpen) return;
      
      const key = event.key.toLowerCase();
      const isNavigationKey = ["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(key);
      
      if (!isNavigationKey) return;
      
      // Check if the event target is an input, textarea, or other editable element
      const target = event.target;
      if (target && (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable
      )) {
        return; // Don't handle navigation keys when typing in input fields
      }
      
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
    
    // Don't initiate dragging in path drawing mode
    if (isPathDrawingMode) {
      // In path drawing mode, we only want clicks, not drags
      return;
    }
    
    // Reset the drag state on each mousedown
    wasDrag = false;
    dist = 0;
    
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
    // Skip drag handling when in path drawing mode
    if (isPathDrawingMode) return;
    
    if ($map.isDragging && $map.dragSource === 'map') {
      handleDragAction({ 
        type: 'dragmove', 
        clientX: event.clientX, 
        clientY: event.clientY 
      });
    }
  }
  
  function handleMouseUp() {
    // Skip drag handling when in path drawing mode
    if (isPathDrawingMode) return;
    
    if ($map.isDragging && $map.dragSource === 'map') {
      handleDragAction({ type: 'dragend' });
      if (mapElement) mapElement.style.cursor = "grab";
    }
  }
  
  function handleTouchStart(event) {
    if (!introduced || !$map.ready) return;
    
    // Don't initiate dragging in path drawing mode
    if (isPathDrawingMode) {
      // Allow single touch for path points but prevent default
      // to avoid scrolling the page
      event.preventDefault();
      return;
    }
    
    event.preventDefault();
    
    const touch = event.touches[0];
    handleDragAction({ 
      type: 'touchstart', 
      touches: [touch] 
    });
  }
  
  function handleTouchMove(event) {
    // Skip drag handling when in path drawing mode
    if (isPathDrawingMode) return;
    
    if (!$map.isDragging || $map.dragSource !== 'map') return;
    event.preventDefault();
    
    handleDragAction({ 
      type: 'touchmove', 
      touches: event.touches 
    }, 1.5);
  }
  
  function handleTouchEnd() {
    // Skip drag handling when in path drawing mode
    if (isPathDrawingMode) return;
    
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
  
  // Simplified player position logic
  const playerPosition = $derived(() => {
    const gameState = get(game);  // Get current game state
    // Only use lastLocation when needed
    return gameState.player?.alive ? gameState.player?.lastLocation : null;
  });
  
  function isCurrentPlayer(playerEntity) {
    if (!playerEntity || !$currentPlayer) return false;
    return $currentPlayer?.id === playerEntity.id;
  }

  function hasCurrentPlayerEntity(cell) {
    return cell.players && cell.players.some(p => isCurrentPlayer(p));
  }
  
  // New function to check if player's group is on this tile
  function hasCurrentPlayerGroupOnTile(cell) {
    if (!cell.groups || !$currentPlayer?.groups) return false;
    
    // Get the player's group IDs
    const playerGroupIds = Object.keys($currentPlayer.groups || {});
    
    // Check if any group on this tile belongs to the player
    return cell.groups.some(group => 
      playerGroupIds.includes(group.id) && 
      group.owner === $currentPlayer.id
    );
  }
  
  function shouldShowPlayerPosition(cell) {
    // Show player marker if either:
    // 1. This cell contains the current player entity
    // 2. This is where lastLocation says the player should be (as fallback)
    // 3. This cell contains a group that the player is in
    return hasCurrentPlayerEntity(cell) || 
           (playerPosition && cell.x === playerPosition.x && cell.y === playerPosition.y) ||
           hasCurrentPlayerGroupOnTile(cell);
  }
  
  function getPlayerCount(cell) {
    return cell.players ? cell.players.length : 0;
  }

  // Enhanced function to identify if a tile contains the current player
  function containsCurrentPlayer(tile) {
    if (!tile?.players || !$user?.uid) return false;
    return tile.players.some(p => p.id?.toString() === $user.uid?.toString());
  }

  function handleGridClick(event) {
    clickCount++;
    lastClickTime = Date.now();
    
    if (wasDrag) {
      console.log('Click ignored: drag detected');
      wasDrag = false; // Reset drag state for next click
      return;
    }
    
    if (!$ready) {
      console.log('Click ignored: map not ready');
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
      console.log('Grid: valid click detected at', { x: tileX, y: tileY });
      
      // First handle path drawing if in that mode
      if (isPathDrawingMode) {
        handlePathPoint({ x: tileX, y: tileY });
        return; // Exit early to prevent other click behaviors
      }
      
      // For regular mode, handle as before
      if (onClick) {
        const tileData = $coordinates.find(cell => cell.x === tileX && cell.y === tileY);
        onClick({ 
          x: tileX, 
          y: tileY,
          tileData: tileData || null
        });
      }
    }
  }

  function handlePathPoint(point) {
    if (!isPathDrawingMode) {
      console.log('Not in path drawing mode, ignoring point');
      return;
    }
    
    console.log('Grid: Adding path point:', point);
    
    // Simply call the parent function with the new point
    if (onAddPathPoint) {
      onAddPathPoint(point);
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
    
    if (group.race) {
      switch(group.race.toLowerCase()) {
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
  
  // Modify the currentDrawnPath to use the raw path points directly
  // since they're now already interpolated in the parent component
  const currentDrawnPath = $derived({
    id: 'custom-path-drawing',
    // No need to interpolate here anymore - it's done when points are added
    points: customPathPoints,
    color: 'rgba(255, 255, 255, 0.9)'
  });
  
  const hasCurrentPath = $derived(customPathPoints.length > 0);

  function coordToPosition(x, y) {
    const state = $map;
    const viewportCenterX = Math.floor(state.cols / 2);
    const viewportCenterY = Math.floor(state.rows / 2);
    
    const offsetX = x - state.target.x;
    const offsetY = y - state.target.y;
    
    // Calculate position as decimal values from 0 to 1
    // Changed from 0.5 (center) to 0.2, 0.8 (bottom left)
    const posX = (viewportCenterX + offsetX + 0.2) / state.cols;
    const posY = (viewportCenterY + offsetY + 0.8) / state.rows;
    
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
        pathData += `M${svgX} ${svgY}`;
      } else {
        pathData += ` L${svgX} ${svgY}`;
      }
    }
    
    return pathData;
  }

  function getCoordinateChunkKey(x, y) {
    return getChunkKey(x, y);
  }

  // Helper function to check if a tile has an active battle
  function hasBattle(tile) {
    // First check direct battle references
    if (tile.battles && tile.battles.length > 0) {
      return true;
    }
    
    // Fallback to checking groups for backwards compatibility
    if (tile.groups) {
      return tile.groups.some(group => group.inBattle && group.battleId);
    }
    
    return false;
  }
  
  // Optional: Get battle count
  function getBattleCount(tile) {
    if (tile.battles) {
      return tile.battles.length;
    }
    
    // Fallback using groups
    if (tile.groups) {
      const battleIds = new Set();
      tile.groups.forEach(group => {
        if (group.inBattle && group.battleId) {
          battleIds.add(group.battleId);
        }
      });
      return battleIds.size;
    }
    
    return 0;
  }

  // Function to determine the dominant race on a tile
  function getDominantRace(cell) {
    if (!cell) return null;
    
    // Create a map to count each race
    const raceCounts = {};
    
    // Count races in player entities
    if (cell.players && cell.players.length > 0) {
      cell.players.forEach(player => {
        if (player.race) {
          raceCounts[player.race.toLowerCase()] = (raceCounts[player.race.toLowerCase()] || 0) + 1;
        }
      });
    }
    
    // Count races in group entities (groups often have more weight)
    if (cell.groups && cell.groups.length > 0) {
      cell.groups.forEach(group => {
        if (group.race) {
          // Give groups slightly more weight than individual players
          raceCounts[group.race.toLowerCase()] = (raceCounts[group.race.toLowerCase()] || 0) + 1.5;
        }
      });
    }
    
    // Find the race with the highest count
    let dominantRace = null;
    let highestCount = 0;
    
    for (const [race, count] of Object.entries(raceCounts)) {
      if (count > highestCount) {
        highestCount = count;
        dominantRace = race;
      }
    }
    
    return dominantRace;
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
    style="--tile-size: {TILE_SIZE}em; --center-tile-color: {backgroundColor};" 
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
      <svg class="path-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
        <!-- Custom path drawing group -->
        {#if isPathDrawingMode && customPathPoints && customPathPoints.length > 0}
          {@const pathData = createPathData(customPathPoints)}
          <g class="path-group custom-path-group" aria-label="Custom movement path">
            <path 
              d={pathData} 
              stroke="rgba(255, 255, 255, 0.9)"
              stroke-width="0.6"
              stroke-dasharray="4,3"
              stroke-linejoin="round" 
              stroke-linecap="round"
              fill="none"
              opacity="0.8"
            >
              <animate 
                attributeName="stroke-dashoffset" 
                from="0" 
                to="-7" 
                dur="20s" 
                repeatCount="indefinite"
              />
            </path>
            
            <!-- Draw direction dots along the path -->
            {#each customPathPoints as point, i}
              {@const pos = coordToPosition(point.x, point.y)}
              
              <!-- Draw point markers with consistent colors -->
              <circle 
                cx="{pos.posX * 100}" 
                cy="{pos.posY * 100}" 
                r="{i === 0 || i === customPathPoints.length - 1 ? '0.7' : '0.5'}" 
                fill="{i === 0 ? 'rgba(255, 255, 255, 0.3)' : i === customPathPoints.length - 1 ? 'rgba(255, 255, 255, 0.3)' : 'rgba(200, 200, 255, 0.2)'}" 
                stroke="{i === 0 ? 'rgba(66, 133, 244, 0.9)' : i === customPathPoints.length - 1 ? 'rgba(66, 133, 244, 0.9)' : 'rgba(200, 200, 255, 0.8)'}"
                stroke-width="0.4"
              />
              
              <!-- Draw connection dots between points -->
              {#if i < customPathPoints.length - 1}
                {@const nextPos = coordToPosition(customPathPoints[i+1].x, customPathPoints[i+1].y)}
                {@const midX = (pos.posX * 100 + nextPos.posX * 100) / 2}
                {@const midY = (pos.posY * 100 + nextPos.posY * 100) / 2}
                
                {#if Math.abs(nextPos.posX - pos.posX) > 0.02 || Math.abs(nextPos.posY - pos.posY) > 0.02}
                  <circle 
                    cx="{midX}" 
                    cy="{midY}" 
                    r="0.3" 
                    fill="transparent"
                    stroke="rgba(200, 200, 255, 0.7)"
                    stroke-width="0.3"
                    opacity="0.7"
                  />
                {/if}
              {/if}
            {/each}
          </g>
        {/if}
        
        <!-- Movement paths group -->
        <g class="movement-paths-group" aria-label="Active movement paths">
          {#each movementPaths as path}
            <g class="path-group" class:current-player-path={path.owner === $currentPlayer?.uid}>
              <path 
                d={createPathData(path.points)} 
                stroke={path.color}
                stroke-width="0.5"
                stroke-dasharray="6,4"
                stroke-linejoin="round"
                stroke-linecap="round"
                fill="none"
                opacity="0.7"
                class="animated-path"
                aria-label={`Movement path for ${path.owner === $currentPlayer?.uid ? 'your' : 'another'} group`}
              >
                <animate 
                  attributeName="stroke-dashoffset" 
                  from="0" 
                  to="-10" 
                  dur="20s" 
                  repeatCount="indefinite"
                />
              </path>
              
              <!-- Draw direction dots along the path with better performance -->
              {#each path.points.filter((_, i) => i === 0 || i === path.points.length - 1 || i % 3 === 0) as point, i}
                {@const pos = coordToPosition(point.x, point.y)}
                
                <circle 
                  cx="{pos.posX * 100}" 
                  cy="{pos.posY * 100}" 
                  r="{i === 0 || i === path.points.length - 1 ? '0.35' : '0.2'}" 
                  fill="transparent" 
                  stroke={path.color}
                  stroke-width="0.3"
                  opacity="{i === 0 || i === path.points.length - 1 ? '0.9' : '0.7'}"
                />
              {/each}
            </g>
          {/each}
        </g>
      </svg>
      
      <div class="grid main-grid" 
        style="--cols: {$map.cols}; --rows: {$map.rows};" 
        role="grid"
        class:animated={!introduced}
      >
        {#each $gridArray as cell (cell.x + ':' + cell.y)}
          {@const highestRarityItem = getHighestRarityItem(cell.items)}
          {@const hasPlayers = cell.players && cell.players.length > 0}
          {@const isCurrentPlayerHere = shouldShowPlayerPosition(cell)}
          {@const playerCount = getPlayerCount(cell)}
          {@const dominantRace = getDominantRace(cell)}
          <div
            class="tile {getStructureClass(cell.structure)} {cell.terrain?.rarity || 'common'}"
            class:center={cell.isCenter}
            tabindex="-1"
            class:highlighted={cell.highlighted}
            class:has-structure={cell.structure}
            class:has-groups={cell.groups?.length > 0}
            class:has-players={hasPlayers}
            class:has-items={cell.items?.length > 0}
            class:player-position={isCurrentPlayerHere}
            class:current-player={containsCurrentPlayer(cell)}
            class:from-world-data={playerPosition && cell.x === playerPosition.x && cell.y === playerPosition.y && !hasCurrentPlayerEntity(cell)}
            style="
              background-color: {cell.isCenter ? 'var(--center-tile-color)' : cell.color || 'var(--terrain-color)'};
              transition-delay: {cell.isCenter ? 0 : Math.min(0.5, cell.distance * 0.03) + 's'};
            "
            onmouseenter={() => handleTileHover(cell)}
            aria-label={`Coordinates ${cell.x},${cell.y}`}
            role="gridcell"
          >
            <!-- Add YouAreHere component for player's position -->
            {#if isCurrentPlayerHere && $ready}
              <div class="you-are-here-container">
                <YouAreHere hasStructure={!!cell.structure} />
              </div>
            {/if}

            <!-- Add structure name display -->
            {#if cell.structure && cell.structure.name}
              <div class="structure-name-label">
                { cell.structure.name.length > 20 ? cell.structure.name.substring(0, 20) + '...' : cell.structure.name }
              </div>
            {/if}
            
            {#if dominantRace}
              <div class="race-background-icon">
                {#if dominantRace === 'human'}
                  <Human extraClass="race-icon-tile" />
                {:else if dominantRace === 'elf'}
                  <Elf extraClass="race-icon-tile" />
                {:else if dominantRace === 'dwarf'}
                  <Dwarf extraClass="race-icon-tile" />
                {:else if dominantRace === 'goblin'}
                  <Goblin extraClass="race-icon-tile" />
                {:else if dominantRace === 'fairy'}
                  <Fairy extraClass="race-icon-tile" />
                {/if}
              </div>
            {/if}

            {#if cell.structure}
              <div class="structure-icon-container">
                {#if cell.structure.type === 'spawn'}
                  <Torch size="70%" extraClass="spawn-icon" />
                {:else}
                  <Structure size="70%" extraClass="structure-icon {cell.structure.type}-icon" />
                {/if}
              </div>
            {/if}

            <!-- Battle indicator -->
            {#if hasBattle(cell)}
              <div class="battle-indicator" title="Active battle in progress">
                ⚔️
              </div>
            {/if}
            
            <!-- Entity indicators -->
            <div class="entity-indicators">
              {#if hasPlayers}
                <div class="entity-indicator player-indicator" 
                     class:current-player-indicator={isCurrentPlayerHere}>
                  {#if playerCount > 1}
                    <span class="count">{playerCount}</span>
                  {/if}
                </div>
              {/if}
              
              {#if cell.groups?.length > 0}
                <div class="entity-indicator group-indicator">
                  {#if cell.groups.length > 1}
                    <span class="count">{cell.groups.length}</span>
                  {/if}
                </div>
              {/if}
              
              {#if cell.items?.length > 0}
                <div class="entity-indicator item-indicator {highestRarityItem?.rarity || 'common'}" 
                  style="--glow-size: {getRarityGlowSize(highestRarityItem?.rarity)}; 
                         --glow-color: {getRarityColor(highestRarityItem?.rarity)}">
                  {#if cell.items.length > 1}
                    <span class="count">{cell.items.length}</span>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
  
  {#if isPathDrawingMode}
    <div class="path-controls">
      <div class="path-point-counter">
        <span class="group-name">{customPathPoints?.length > 0 ? 'Plotting path: ' : ''}{customPathPoints?.length || 0} points</span>
      </div>
      <div class="path-buttons">
        <button class="path-control-btn cancel-btn" onclick={() => onClose()} aria-label="Cancel path drawing">
          Cancel
        </button>
        {#if customPathPoints?.length >= 2}
          <button 
            class="path-control-btn confirm-btn" 
            onclick={() => {
              console.log('Grid: Path confirm button clicked, notifying parent');
              // Pass the confirmPath flag directly to ensure it's recognized
              onClick?.({ confirmPath: true });
            }} 
            aria-label="Confirm path"
          >
            <Compass extraClass="compass-icon-path" />
            Confirm
          </button>
        {/if}
      </div>
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
  
  /* Remove animation from center tile completely */
  .main-grid.animated .tile.center {
    z-index: 3;
    position: relative;
    /* Remove animation and replace with direct styles */
    animation: none;
    opacity: 1;
    transform: scale(1.05);
    box-shadow: 
      inset 0 0 0.5em rgba(255, 255, 255, 0.3),
      0 0 1em rgba(255, 255, 255, 0.2);
    /* Keep the transition for background-color */
    transition: background-color 0.3s ease;
  }
  
  .main-grid:not(.animated) .tile.center {
    position: relative;
    border: 0.12em solid rgba(255, 255, 255, 0.5);
    box-shadow: 
      inset 0 0 0 2px rgba(255, 255, 255, 0.7),
      inset 0 0 0.5em rgba(255, 255, 255, 0.3),
      0 0 1em rgba(255, 255, 255, 0.2);
    z-index: 3;
    /* Keep the transition for background-color */
    transition: background-color 0.3s ease;
  }

  .tile {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    overflow: visible; /* Changed from hidden to visible */
    text-overflow: ellipsis;
    font-size: 1em;
    color: rgba(255, 255, 255, 0.7);
    text-shadow: 0 0 0.1875em rgba(0, 0, 0, 0.5);
    user-select: none;
    z-index: 1;
    font-family: var(--font-body);
    position: relative; /* Ensure this is set for absolute positioning */
    transition: background-color 0.3s ease; /* Add explicit transition property */
  }

  .tile.has-structure {
    z-index: 10;
  }

  .tile.center {
    z-index: 3;
    position: relative;
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.7);
    border: 0.12em solid rgba(255, 255, 255, 0.5);
    /* Ensure color transition works */
    transition: background-color 0.3s ease; 
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
    position: relative; /* Ensure proper positioning for count */
  }
  
  .count {
    font-size: 0.6em;
    font-weight: bold;
    color: rgba(0, 0, 0, 0.8);
    line-height: 1;
    font-family: var(--font-heading);
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-shadow: 
      0px 0px 2px white,
      0px 0px 1px white;
  }
  
  /* Enhanced indicator styles to match path elements */
  .player-position-indicator {
    background: radial-gradient(circle, gold, #e6c200);
    box-shadow: 
      0 0 0.2em gold,
      0 0 0.5em rgba(255, 215, 0, 0.3);
    border: 0.08em solid rgba(255, 255, 255, 0.8);
    z-index: 11;
  }
  
  .player-position-indicator.from-world-data {
    background: radial-gradient(circle, #ffdd33, #cc9900);
    box-shadow: 
      0 0 0.3em gold,
      0 0 0.8em rgba(255, 215, 0, 0.6);
    border: 0.08em solid rgba(255, 255, 255, 1);
    animation: pulse-player 3s infinite;
  }
  
  @keyframes pulse-player {
    0% { box-shadow: 0 0 0.2em gold, 0 0 0.4em rgba(255, 215, 0, 0.3); }
    50% { box-shadow: 0 0 0.3em gold, 0 0 0.8em rgba(255, 215, 0, 0.6); }
    100% { box-shadow: 0 0 0.2em gold, 0 0 0.4em rgba(255, 215, 0, 0.3); }
  }
  
  .player-indicator {
    background: radial-gradient(circle, rgba(130, 130, 255, 0.9), rgba(80, 80, 225, 0.9));
    box-shadow: 0 0 0.2em rgba(100, 100, 255, 0.6);
    border: 0.08em solid rgba(180, 180, 255, 0.7);
  }
  
  .group-indicator {
    background: radial-gradient(circle, rgba(255, 130, 130, 0.9), rgba(225, 80, 80, 0.9));
    box-shadow: 0 0 0.2em rgba(255, 100, 100, 0.6);
    border: 0.08em solid rgba(255, 180, 180, 0.7);
  }
  
  .item-indicator {
    background: radial-gradient(circle, rgba(255, 225, 60, 0.9), rgba(255, 195, 0, 0.9));
    box-shadow: 0 0 0.2em rgba(255, 215, 0, 0.6);
    border: 0.08em solid rgba(255, 235, 150, 0.7);
  }
  
  .item-indicator.uncommon {
    background: radial-gradient(circle, rgba(60, 255, 30, 0.9), rgba(30, 205, 0, 0.9));
    box-shadow: 0 0 0.2em rgba(30, 255, 0, 0.6);
    border: 0.08em solid rgba(150, 255, 150, 0.7);
  }
  
  .item-indicator.rare {
    background: radial-gradient(circle, rgba(30, 150, 255, 0.9), rgba(0, 100, 221, 0.9));
    box-shadow: 0 0 0.2em rgba(0, 112, 221, 0.6);
    border: 0.08em solid rgba(150, 200, 255, 0.7);
  }
  
  .item-indicator.epic {
    background: radial-gradient(circle, rgba(180, 30, 255, 0.9), rgba(128, 0, 191, 0.9));
    box-shadow: 0 0 0.2em rgba(148, 0, 211, 0.6);
    border: 0.08em solid rgba(200, 150, 255, 0.7);
  }
  
  .item-indicator.legendary {
    background: radial-gradient(circle, rgba(255, 195, 60, 0.9), rgba(225, 145, 0, 0.9));
    box-shadow: 0 0 0.2em rgba(255, 165, 0, 0.6);
    border: 0.08em solid rgba(255, 215, 150, 0.7);
  }
  
  .item-indicator.mythic {
    background: radial-gradient(circle, rgba(255, 158, 255, 0.9), rgba(225, 98, 225, 0.9));
    box-shadow: 0 0 0.2em rgba(255, 128, 255, 0.6);
    border: 0.08em solid rgba(255, 180, 255, 0.7);
    animation: pulseItemMythic 2s infinite;
  }
  
  .current-player-indicator {
    transform: scale(1.1);
    animation: pulse 2s infinite;
    background: radial-gradient(circle, rgba(84, 234, 218, 0.9), rgba(44, 184, 168, 0.9));
    border-color: rgba(255, 255, 255, 0.7);
    box-shadow: 0 0 0.2em turquoise;
  }
  
  /* Remove the old player position styles that conflict */
  .player-position {
    position: relative;
    /* Removed the box-shadow with gold color */
    z-index: 2;
  }
  
  .player-position:before {
    /* Remove the content and border completely */
    content: none;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    /* Removed the gold border */
    pointer-events: none;
    z-index: 2;
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
    filter: drop-shadow(0 0 6px rgba(0, 0, 0, 0.8));
    /* Changed from cyan drop shadow to dark shadow */
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
    filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.7));
    /* Changed from light cyan drop shadow to dark shadow */
    fill: rgba(40, 40, 40, 0.9); /* Added dark fill color */
  }
  
  :global(.structure-icon) {
    opacity: 0.8;
    filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.6));
    /* Changed from white drop shadow to dark shadow */
    fill: rgba(40, 40, 40, 0.9); /* Added dark fill color */
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
    z-index: 500;
    overflow: visible;
    transform: translateZ(0);
    will-change: transform;
    
    /* Improve SVG rendering performance */
    shape-rendering: geometricPrecision;
  }
  
  .path-group {
    /* Keep opacity transition only - this won't cause rasterization */
    transition: opacity 0.3s ease;
    pointer-events: none;
  }
  
  .custom-path-group {
    z-index: 600;
  }
  
  /* Remove all CSS styling that would affect path animation rendering */
  /* All animation should be handled by SVG <animate> elements instead */
  .custom-path-group path {
    /* Only keep non-animation related styling */
    stroke-width: 0.6;
  }

  .map-container.path-drawing-mode .map:not(.moving) .tile:hover {
    box-shadow: inset 0 0 0 2px rgba(66, 133, 244, 0.9) !important;
    position: relative;
    z-index: 45;
    transition: box-shadow 0.2s ease;
  }

  .map-container.path-drawing-mode .map:not(.moving) .tile:hover::after {
    content: "";
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 0.3em rgba(66, 133, 244, 0.6);
    pointer-events: none;
    z-index: 10;
  }

  .path-controls {
    position: fixed; /* Change from absolute to fixed for better isolation */
    bottom: 1.5em;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(255, 255, 255, 0.85);
    border-radius: 0.5em;
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    backdrop-filter: blur(0.5em);
    -webkit-backdrop-filter: blur(0.5em);
    z-index: 1000;
    padding: 0.6em 0.8em;
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    font-family: var(--font-heading);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5em;
    min-width: 12em;
    max-width: 90%;
    animation: slide-up 0.4s ease-out forwards;
    pointer-events: auto; /* Ensure controls are clickable */
  }
  
  .path-point-counter {
    font-weight: 600;
    font-size: 1em;
    color: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    gap: 0.5em;
  }
  
  .path-point-counter::before {
    content: ""; /* Completely removed emoji */
    font-size: 1.1em;
  }
  
  .group-name {
    font-weight: 500;
    white-space: nowrap;
  }
  
  .path-buttons {
    display: flex;
    gap: 0.8em;
    width: 100%;
    justify-content: center;
  }
  
  .path-control-btn {
    padding: 0.5em 1em;
    border-radius: 0.3em;
    border: none;
    cursor: pointer;
    font-size: 0.9em;
    font-weight: 500;
    transition: all 0.2s;
    font-family: var(--font-body);
  }
  
  .path-control-btn.cancel-btn {
    background-color: #f1f3f4;
    color: #3c4043;
    border: 1px solid #dadce0;
  }
  
  .path-control-btn.cancel-btn:hover {
    background-color: #e8eaed;
  }
  
  .path-control-btn.confirm-btn {
    background-color: rgba(66, 133, 244, 0.9);
    color: white;
    border: 1px solid rgba(66, 133, 244, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5em;
  }
  
  .path-control-btn.confirm-btn:hover {
    background-color: rgba(66, 133, 244, 1);
    transform: translateY(-1px);
    box-shadow: 0 0.2em 0.4em rgba(66, 133, 244, 0.2);
  }
  
  .path-control-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
  }
  
  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translate(-50%, 1em);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
  
  @media (max-width: 480px) {
    .path-controls {
      padding: 0.5em 0.6em;
      min-width: 10em;
      bottom: 1em;
    }
    
    .path-control-btn {
      padding: 0.4em 0.7em;
      font-size: 0.9em;
    }
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
    opacity: 0.6;
  }
  
  :global(.structure-icon) {
    opacity: 0.8;
    filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.6));
    /* Changed from white drop shadow to dark shadow */
    fill: rgba(40, 40, 40, 0.9); /* Added dark fill color */
  }
  
  .battle-indicator {
    position: absolute;
    top: 0.2em;
    right: 0.2em;
    font-size: 0.8em;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1em;
    height: 1em;
    border-radius: 50%;
    background-color: rgba(255, 0, 0, 0.2);
    box-shadow: 0 0 0.3em rgba(255, 0, 0, 0.4);
    pointer-events: none;
    animation: pulse-battle 2s infinite;
  }
  
  @keyframes pulse-battle {
    0% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.4); }
    70% { box-shadow: 0 0 0 0.4em rgba(255, 0, 0, 0); }
    100% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0); }
  }

  .race-background-icon {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1; /* Lower than structure icons (z-index: 2) */
    pointer-events: none;
    opacity: 0.6; /* Increased from 0.3 to 0.6 for better visibility */
  }

  :global(.race-icon-tile) {
    width: 70%; /* Slightly smaller for better proportion */
    height: 70%; /* Slightly smaller for better proportion */
    opacity: 0.7; /* Increased from 0.3 to 0.7 for better visibility */
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.3)); /* Add subtle glow */
    fill: rgba(255, 255, 255, 0.7); /* Brighter base fill */
  }
  
  /* Enhanced race-specific styling with more vibrant colors for better contrast */
  :global(.race-icon-tile.fairy-icon path) {
    fill: rgba(228, 160, 255, 0.9); /* Much brighter purple for fairy */
    filter: drop-shadow(0 0 3px rgba(228, 160, 255, 0.5));
  }
  
  :global(.race-icon-tile.goblin-icon path) {
    fill: rgba(120, 255, 120, 0.9); /* Much brighter green for goblin */
    filter: drop-shadow(0 0 3px rgba(120, 255, 120, 0.5));
  }
  
  :global(.race-icon-tile.human-icon path) {
    fill: rgba(255, 220, 180, 0.9); /* Warmer, brighter tone for humans */
    filter: drop-shadow(0 0 3px rgba(255, 220, 180, 0.5));
  }
  
  :global(.race-icon-tile.elf-icon path) {
    fill: rgba(180, 255, 180, 0.9); /* Brighter leafy green for elves */
    filter: drop-shadow(0 0 3px rgba(180, 255, 180, 0.5));
  }
  
  :global(.race-icon-tile.dwarf-icon path) {
    fill: rgba(255, 200, 140, 0.9); /* Brighter earthy tone for dwarves */
    filter: drop-shadow(0 0 3px rgba(255, 200, 140, 0.5));
  }
  
  /* Add special animation for center tile with race icon */
  .tile.center .race-background-icon :global(.race-icon-tile) {
    opacity: 0.8;
    filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.6));
  }

  :global(.compass-icon-path) {
    width: 1.2em;
    fill: currentColor;
  }

  .structure-name-label {
    position: absolute;
    top: -1.6em; /* Changed from -1.285em to -1.6em to position it higher */
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    font-size: 0.85em; /* Increased from 0.7em to 0.85em */
    font-weight: 700; /* Increased from 600 to 700 for better visibility */
    color: rgba(255, 255, 255, 0.95);
    text-shadow: 
      0 0 0.2em rgba(0, 0, 0, 0.8),
      0 0 0.4em rgba(0, 0, 0, 0.5);
    pointer-events: none;
    z-index: 1100;
    white-space: nowrap;
    font-family: var(--font-heading);
    padding: 0.25em 0.6em; /* Slightly larger padding */
    line-height: 1.1;
    letter-spacing: 0.02em;
    background: rgba(0, 0, 0, 0.6); /* Slightly darker background for better contrast */
    border-radius: 0.3em;
    backdrop-filter: blur(2px);
    width: auto;
    overflow: visible;
    border: 1px solid rgba(255, 255, 255, 0.3); /* Slightly more visible border */
    box-shadow: 0 0 0.4em rgba(0, 0, 0, 0.8); /* Enhanced shadow */
  }

  /* Make structure name more prominent on hover */
  .tile:hover .structure-name-label {
    background: rgba(0, 0, 0, 0.75); /* Darker background on hover */
    z-index: 1200;
    transform: translateX(-50%) scale(1.1); /* Larger scale on hover */
    transition: all 0.2s ease;
  }

  .you-are-here-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    pointer-events: none;
  }
</style>
