<script>
  import { createEventDispatcher } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { currentPlayer } from '../../lib/stores/game';
  import Close from '../icons/Close.svelte';

  // Props
  const { tile, onClose } = $props();
  
  const dispatch = createEventDispatcher();
  
  // Format text for display
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Available groups for movement
  let availableGroups = $state([]);
  // Selected group to move
  let selectedGroup = $state(null);
  // Movement target coordinates
  let targetX = $state(null);
  let targetY = $state(null);
  
  // New: Add calculated path for visualization
  let movementPath = $state([]);
  
  // Add state for path drawing mode
  let isPathDrawingMode = $state(false);
  
  // Add state to store the current custom path being drawn
  let customPath = $state([]);
  
  // Initialize available groups based on tile content
  $effect(() => {
    if (!tile || !tile.groups) {
      availableGroups = [];
      return;
    }
    
    // Filter only groups owned by the current player and with idle status
    availableGroups = tile.groups
      .filter(group => {
        // Direct access to group status instead of using getGroupStatusInfo
        return group.owner === $currentPlayer?.uid && group.status === 'idle';
      })
      .map(group => ({
        ...group,
        selected: false
      }));
  });
  
  // Calculate movement directions (3x3 grid with center being current position)
  const moveDirections = [
    { x: -1, y: -1, label: '↖', name: 'Northwest' },
    { x: 0, y: -1, label: '↑', name: 'North' },
    { x: 1, y: -1, label: '↗', name: 'Northeast' },
    { x: -1, y: 0, label: '←', name: 'West' },
    { x: 0, y: 0, label: '•', name: 'Current' },
    { x: 1, y: 0, label: '→', name: 'East' },
    { x: -1, y: 1, label: '↙', name: 'Southwest' },
    { x: 0, y: 1, label: '↓', name: 'South' },
    { x: 1, y: 1, label: '↘', name: 'Southeast' },
  ];
  
  // Set movement target
  function setTarget(dx, dy) {
    if (dx === 0 && dy === 0) return; // Can't move to current position
    
    targetX = tile.x + dx;
    targetY = tile.y;
    
    // Calculate path when target changes
    calculatePath();
  }
  
  // Clear movement target
  function clearTarget() {
    targetX = null;
    targetY = null;
    movementPath = [];
  }
  
  // Calculate movement path between start and end points
  function calculatePath() {
    if (!tile || targetX === null || targetY === null) {
      movementPath = [];
      return;
    }
    
    const startX = tile.x;
    const startY = tile.y;
    const endX = targetX;
    const endY = targetY;
    
    // For simple adjacent movement, the path is just two points
    if (Math.abs(endX - startX) <= 1 && Math.abs(endY - startY) <= 1) {
      movementPath = [
        { x: startX, y: startY },
        { x: endX, y: endY }
      ];
      return;
    }
    
    // For longer paths, use a simplified version of Bresenham's line algorithm
    // to create a step-by-step path between points
    const path = [];
    
    // Start point
    path.push({ x: startX, y: startY });
    
    const dx = Math.abs(endX - startX);
    const dy = Math.abs(endY - startY);
    const sx = startX < endX ? 1 : -1;
    const sy = startY < endY ? 1 : -1;
    
    let err = dx - dy;
    let x = startX;
    let y = startY;
    
    // Generate steps along the path
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
    
    movementPath = path;
  }
  
  // Function to switch to path drawing mode
  function enablePathDrawing() {
    if (!selectedGroup) return;
    
    // Initialize custom path with starting position
    const startPoint = { x: tile.x, y: tile.y };
    customPath = [startPoint];
    
    // First close the dialog completely to avoid obstruction
    onClose(false, true);
    
    // AFTER dialog is closed, notify parent component to start path drawing mode
    setTimeout(() => {
      // Notify parent component with the starting point
      dispatch('pathDrawingStart', {
        groupId: selectedGroup.id,
        startPoint
      });
    }, 10);
  }
  
  // Function to update the path with new points
  export function updateCustomPath(newPoints) {
    customPath = newPoints;
  }
  
  // Function to confirm the custom path
  export function confirmCustomPath() {
    if (customPath.length < 2) return; // Need at least start and end
    
    // Create the move event with the custom path
    dispatch('move', {
      groupId: selectedGroup.id,
      from: {
        x: tile.x, 
        y: tile.y
      },
      to: {
        x: customPath[customPath.length - 1].x, 
        y: customPath[customPath.length - 1].y
      },
      path: customPath
    });
    
    // Reset states
    isPathDrawingMode = false;
    customPath = [];
    
    // Properly close the dialog
    onClose(true);
  }
  
  // Function to cancel path drawing
  export function cancelPathDrawing() {
    isPathDrawingMode = false;
    customPath = [];
    
    // Notify parent component
    dispatch('pathDrawingCancel');
  }
  
  // Override the start movement function to handle both modes
  function startMovement() {
    if (!selectedGroup) return;
    
    if (isPathDrawingMode) {
      confirmCustomPath();
    } else if (targetX !== null && targetY !== null) {
      // Original direction-based movement
      dispatch('move', {
        groupId: selectedGroup.id,
        from: {
          x: tile.x, 
          y: tile.y
        },
        to: {
          x: targetX, 
          y: targetY
        },
        path: movementPath
      });
      
      onClose(true);
    }
  }
  
  // Close on escape key
  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose();
    }
  }
  
  // Handle keyboard navigation for group selection
  function handleGroupKeyDown(event, group) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectedGroup = group;
    }
  }
  
  // Calculate if we can start moving
  const canMove = $derived(
    selectedGroup !== null && 
    targetX !== null && 
    targetY !== null
  );
</script>

<svelte:window onkeydown={handleKeyDown} />

<dialog 
     class="overlay"
     open
     aria-modal="true" 
     aria-labelledby="move-title"
     transition:fade={{ duration: 150 }}>
  
  <section 
       class="popup"
       role="document" 
       transition:scale={{ start: 0.95, duration: 200 }}>
    <div class="header">
      <h2 id="move-title">Move Group - {tile?.x}, {tile?.y}</h2>
      <button class="close-btn" onclick={() => onClose(true)} aria-label="Close move dialog">
        <Close size="1.5em" />
      </button>
    </div>
    
    {#if tile}
      <div class="location-info">
        <div class="terrain">
          <div class="terrain-color" style="background-color: {tile.color}"></div>
          <span>{_fmt(tile.biome?.name) || "Unknown"}</span>
          
          {#if tile.structure}
            <span class="structure-tag">
              {tile.structure.name || _fmt(tile.structure.type)}
            </span>
          {/if}
        </div>
      </div>
      
      <div class="move-content">
        {#if availableGroups.length > 0}
          <div class="group-selection">
            <h3>Select Group to Move</h3>
            <div class="groups-list">
              {#each availableGroups as group}
                <div 
                  class="group-item" 
                  class:selected={selectedGroup === group}
                  onclick={() => selectedGroup = group}
                  role="button"
                  tabindex="0"
                  aria-pressed={selectedGroup === group}
                  aria-label={`Select group ${group.name || group.id}`}
                  onkeydown={(e) => handleGroupKeyDown(e, group)}
                >
                  <input 
                    type="radio" 
                    name="group-select" 
                    checked={selectedGroup === group} 
                    id={`group-${group.id}`}
                    tabindex="-1"
                  />
                  <div class="group-info">
                    <div class="group-name">{group.name || group.id}</div>
                    <div class="group-details">
                      Units: {group.unitCount || group.units?.length || "?"}
                      {#if group.faction}
                        <span class="faction-tag">{_fmt(group.faction)}</span>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
          
          <div class="movement-options">
            <h3>Choose Movement Method</h3>
            <div class="method-buttons">
              <button 
                class="path-btn" 
                class:selected={isPathDrawingMode}
                disabled={!selectedGroup}
                onclick={enablePathDrawing}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 3L9 9M3 21L21 3M15 15L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                Draw Path (Starting Here)
              </button>
              
              <div class="divider">OR</div>
              
              <div class="direction-section">
                <h4>Choose Direction</h4>
                <div class="grid">
                  {#each moveDirections as dir, i}
                    <button 
                      class="direction-btn" 
                      class:center={dir.x === 0 && dir.y === 0}
                      class:selected={targetX === tile.x + dir.x && targetY === tile.y + dir.y}
                      disabled={dir.x === 0 && dir.y === 0 || !selectedGroup}
                      onclick={() => dir.x === 0 && dir.y === 0 ? clearTarget() : setTarget(dir.x, dir.y)}
                      aria-label={`Move ${dir.name}`}
                      aria-disabled={dir.x === 0 && dir.y === 0 || !selectedGroup}
                    >
                      {dir.label}
                    </button>
                  {/each}
                </div>
              </div>
            </div>
            
            <div class="target-info">
              {#if targetX !== null && targetY !== null}
                <p>Target: {targetX}, {targetY}</p>
              {:else if isPathDrawingMode}
                <p>Click on the map to draw your path</p>
              {:else}
                <p>Select a direction to move</p>
              {/if}
            </div>
            
            {#if movementPath.length > 0 && !isPathDrawingMode}
              <div class="path-info">
                <h4>Movement Path</h4>
                <div class="path-steps">
                  {#each movementPath as point, index}
                    <div class="path-point">
                      {index + 1}: ({point.x}, {point.y})
                    </div>
                  {/each}
                </div>
                <div class="path-summary">
                  Total steps: {movementPath.length - 1}
                </div>
              </div>
            {/if}
            
            <div class="movement-info">
              <p>
                Group will move step-by-step along the path.
                {#if isPathDrawingMode}
                  Click on the map to create waypoints.
                {:else}
                  Movement speed varies based on world speed settings.
                {/if}
              </p>
            </div>
          </div>
          
          <div class="button-row">
            <button 
              class="cancel-btn" 
              onclick={() => onClose(true)}
            >
              Cancel
            </button>
            <button 
              class="move-btn" 
              disabled={!canMove && !isPathDrawingMode}
              onclick={startMovement}
            >
              {isPathDrawingMode ? 'Draw Path on Map' : 'Start Movement'}
            </button>
          </div>
        {:else}
          <div class="no-groups">
            <p>You have no groups that can move from this location.</p>
            <button class="close-btn wide" onclick={() => onClose(true)}>Close</button>
          </div>
        {/if}
      </div>
    {:else}
      <p class="no-tile">No tile selected</p>
    {/if}
  </section>
  
  <button 
    class="overlay-dismiss-button"
    onclick={() => onClose(true)}
    aria-label="Close dialog">
  </button>
</dialog>

<style>
  .overlay-dismiss-button {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    background: transparent;
    border: none;
    z-index: -1;
  }

  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1200;
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
    padding: 0;
    margin: 0;
    border: none;
  }
  
  .popup {
    background: white;
    border-radius: 0.5em;
    box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.3);
    width: 90%;
    max-width: 30em;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: var(--font-body);
  }
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.8em 1em;
    background: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
  }
  
  h2 {
    margin: 0;
    font-size: 1.3em;
    font-weight: 600;
    color: #333;
    font-family: var(--font-heading);
  }
  
  h3 {
    margin: 0 0 0.8em 0;
    font-size: 1.1em;
    font-weight: 500;
    color: #333;
  }
  
  h4 {
    margin: 0 0 0.5em 0;
    font-size: 1em;
    font-weight: 500;
  }
  
  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.3em;
    display: flex;
    border-radius: 50%;
    transition: background-color 0.2s;
  }
  
  .close-btn:hover {
    background-color: rgba(0, 0, 0, 0.1);
  }
  
  .close-btn.wide {
    width: 100%;
    justify-content: center;
    padding: 0.7em;
    background: #f1f3f4;
    border: 1px solid #dadce0;
    border-radius: 0.3em;
    margin-top: 1em;
  }
  
  .close-btn.wide:hover {
    background-color: #e8eaed;
  }
  
  .location-info {
    padding: 1em;
    border-bottom: 1px solid #e0e0e0;
  }
  
  .terrain {
    display: flex;
    align-items: center;
    font-size: 1.1em;
  }
  
  .terrain-color {
    width: 1em;
    height: 1em;
    border-radius: 0.2em;
    margin-right: 0.5em;
    border: 1px solid rgba(0, 0, 0, 0.2);
  }
  
  .structure-tag {
    margin-left: 0.8em;
    font-size: 0.8em;
    font-weight: bold;
    padding: 0.2em 0.5em;
    border-radius: 0.3em;
    background: rgba(30, 144, 255, 0.15);
    border: 1px solid rgba(30, 144, 255, 0.3);
    color: #1e90ff;
  }
  
  .move-content {
    padding: 1em;
    display: flex;
    flex-direction: column;
    gap: 1.5em;
    max-height: 60vh;
    overflow-y: auto;
  }
  
  .group-selection {
    padding-bottom: 1em;
    border-bottom: 1px solid #e0e0e0;
  }
  
  .groups-list {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
  }
  
  .group-item {
    display: flex;
    align-items: center;
    padding: 0.6em 0.8em;
    border: 1px solid #e0e0e0;
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .group-item:hover {
    background-color: #f9f9f9;
  }
  
  .group-item.selected {
    background-color: rgba(30, 144, 255, 0.1);
    border-color: rgba(30, 144, 255, 0.3);
  }
  
  .group-info {
    flex: 1;
    margin-left: 0.8em;
  }
  
  .group-name {
    font-weight: 500;
    margin-bottom: 0.2em;
  }
  
  .group-details {
    display: flex;
    align-items: center;
    gap: 0.5em;
    font-size: 0.9em;
    color: #555;
  }
  
  .faction-tag {
    padding: 0.1em 0.4em;
    border-radius: 0.2em;
    background-color: rgba(0, 0, 0, 0.06);
    color: rgba(0, 0, 0, 0.7);
    font-size: 0.9em;
  }
  
  .movement-options {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1em;
  }
  
  .method-buttons {
    display: flex;
    flex-direction: column;
    gap: 1em;
    width: 100%;
    margin-bottom: 1em;
  }
  
  .path-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6em;
    padding: 0.8em;
    background-color: #f0f7ff;
    border: 1px solid #4285f4;
    border-radius: 0.3em;
    color: #4285f4;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .path-btn:hover:not(:disabled) {
    background-color: #e3f1ff;
  }
  
  .path-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .path-btn.selected {
    background-color: #4285f4;
    color: white;
  }
  
  .divider {
    display: flex;
    align-items: center;
    text-align: center;
    color: #666;
    font-size: 0.9em;
    margin: 0.5em 0;
  }
  
  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    border-bottom: 1px solid #ddd;
  }
  
  .divider::before {
    margin-right: 0.5em;
  }
  
  .divider::after {
    margin-left: 0.5em;
  }
  
  .direction-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }
  
  .direction-section h4 {
    margin: 0 0 0.5em 0;
    align-self: flex-start;
  }
  
  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(3em, 5em));
    grid-template-rows: repeat(3, minmax(3em, 5em));
    gap: 0.3em;
    margin: 0 auto;
  }
  
  .direction-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5em;
    border: 1px solid #ccc;
    background: white;
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s ease;
    aspect-ratio: 1;
  }
  
  .direction-btn:hover:not(:disabled) {
    background-color: #f0f7ff;
    border-color: #4285f4;
  }
  
  .direction-btn.center {
    background-color: rgba(0, 0, 0, 0.05);
    font-weight: bold;
    cursor: default;
  }
  
  .direction-btn.selected {
    background-color: #4285f4;
    color: white;
    border-color: #4285f4;
  }
  
  .direction-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .target-info {
    text-align: center;
    font-weight: 500;
    margin-top: 0.5em;
  }
  
  .movement-info {
    padding: 0.8em;
    background-color: rgba(66, 133, 244, 0.08);
    border-radius: 0.3em;
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.7);
    line-height: 1.4;
    margin: 0.5em 0;
    border-left: 3px solid rgba(66, 133, 244, 0.5);
  }
  
  .movement-info p {
    margin: 0;
  }
  
  .path-info {
    margin-top: 1em;
    padding: 0.8em;
    background-color: rgba(66, 133, 244, 0.08);
    border-radius: 0.3em;
    font-size: 0.9em;
  }
  
  .path-steps {
    max-height: 8em;
    overflow-y: auto;
    margin: 0.5em 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4em;
  }
  
  .path-point {
    font-family: var(--font-mono, monospace);
    font-size: 0.9em;
    color: #333;
    padding: 0.2em 0.4em;
    background: rgba(255, 255, 255, 0.7);
    border-radius: 0.2em;
    text-align: center;
  }
  
  .path-summary {
    margin-top: 0.5em;
    font-weight: 500;
    text-align: center;
  }
  
  .button-row {
    display: flex;
    justify-content: flex-end;
    gap: 0.8em;
    margin-top: 1.5em;
  }
  
  .cancel-btn, .move-btn {
    padding: 0.7em 1.2em;
    border-radius: 0.3em;
    border: none;
    cursor: pointer;
    font-size: 1em;
    font-weight: 500;
    transition: all 0.2s;
  }
  
  .cancel-btn {
    background-color: #f1f3f4;
    color: #3c4043;
    border: 1px solid #dadce0;
  }
  
  .cancel-btn:hover {
    background-color: #e8eaed;
  }
  
  .move-btn {
    background-color: #4285f4;
    color: white;
  }
  
  .move-btn:hover:not(:disabled) {
    background-color: #3367d6;
  }
  
  .move-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .no-groups, .no-tile {
    text-align: center;
    padding: 2em 0;
    color: #666;
    font-style: italic;
  }
  
  @media (max-width: 480px) {
    .popup {
      width: 95%;
      max-height: 80vh;
    }
    
    h2 {
      font-size: 1.1em;
    }
    
    .grid {
      grid-template-columns: repeat(3, 3.5em);
      grid-template-rows: repeat(3, 3.5em);
    }
    
    .button-row {
      flex-direction: column;
    }
    
    .button-row button {
      width: 100%;
    }
  }
</style>
