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
  
  // Initialize available groups based on tile content
  $effect(() => {
    if (!tile) return;
    
    const groups = [];
    
    // Find player groups on this tile that aren't already moving
    if (tile.groups && tile.groups.length > 0) {
      tile.groups.forEach(group => {
        if (group.owner === $currentPlayer?.uid && group.status !== 'moving') {
          groups.push(group);
        }
      });
    }
    
    availableGroups = groups;
    
    // Auto-select the first group if there's only one
    if (groups.length === 1) {
      selectedGroup = groups[0];
    }
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
    targetY = tile.y + dy;
  }
  
  // Clear movement target
  function clearTarget() {
    targetX = null;
    targetY = null;
  }
  
  // Start movement
  function startMovement() {
    if (!selectedGroup || targetX === null || targetY === null) return;
    
    // Dispatch move event with data
    dispatch('move', {
      groupId: selectedGroup.id,
      from: {
        x: tile.x, 
        y: tile.y
      },
      to: {
        x: targetX, 
        y: targetY
      }
    });
    
    onClose();
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
     transition:fade={{ duration: 200 }}>
  
  <section 
       class="popup"
       role="document" 
       transition:scale={{ start: 0.95, duration: 200 }}>
    <div class="header">
      <h2 id="move-title">Move Group - {tile?.x}, {tile?.y}</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close move dialog">
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
          
          <div class="movement-grid">
            <h3>Select Direction</h3>
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
            
            <div class="target-info">
              {#if targetX !== null && targetY !== null}
                <p>Target: {targetX}, {targetY}</p>
              {:else}
                <p>Select a direction to move</p>
              {/if}
            </div>
            
            <div class="movement-info">
              <p>
                Group will be marked as "moving" until the next world tick.
                Movement time varies based on world speed.
              </p>
            </div>
          </div>
          
          <div class="button-row">
            <button 
              class="cancel-btn" 
              onclick={onClose}
            >
              Cancel
            </button>
            <button 
              class="move-btn" 
              disabled={!canMove}
              onclick={startMovement}
            >
              Start Movement
            </button>
          </div>
        {:else}
          <div class="no-groups">
            <p>You have no groups that can move from this location.</p>
            <button class="close-btn wide" onclick={onClose}>Close</button>
          </div>
        {/if}
      </div>
    {:else}
      <p class="no-tile">No tile selected</p>
    {/if}
  </section>
  
  <button 
    class="overlay-dismiss-button"
    onclick={onClose}
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
  
  .movement-grid {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1em;
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
