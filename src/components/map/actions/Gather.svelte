<script>
  import { getFunctions, httpsCallable } from 'firebase/functions';
  import { scale } from 'svelte/transition';

  import { currentPlayer, game } from '../../../lib/stores/game';
  import { targetStore } from '../../../lib/stores/map';

  import Close from '../../icons/Close.svelte';

  const { 
    onClose = () => {}, 
    onGather = () => {},
    isActive = false, // Add prop for z-index control
    onMouseEnter = () => {} // Add prop for mouse enter event
  } = $props();
  const functions = getFunctions();
  
  // Use $derived for tileData to prevent reactivity issues
  let tileData = $derived($targetStore || null);
  
  // Initialize state
  let availableGroups = $state([]);
  let selectedGroup = $state(null);
  let error = $state(null);
  let statusMessage = $state('');
  let processing = $state(false);
  
  // Add a flag to prevent re-filtering groups once an operation has started
  let operationInProgress = $state(false);
  
  // Create a derived value for player ID to avoid direct reactive reads in the effect
  let playerId = $derived($currentPlayer?.id);
  
  $effect(() => {
    // Don't update available groups if an operation is in progress
    if (operationInProgress) return;
    
    // Reset groups list if we don't have valid data
    if (!tileData || !tileData.groups || !playerId) {
      availableGroups = [];
      selectedGroup = null;
      return;
    }
    
    // Create a new array without directly referencing reactively accessed properties inside filter
    const filteredGroups = [];
    
    // Manually iterate instead of using filter/map to prevent reactivity issues
    for (let i = 0; i < tileData.groups.length; i++) {
      const group = tileData.groups[i];
      if (group.owner === playerId && group.status === 'idle' && !group.inBattle) {
        filteredGroups.push({
          ...group,
          selected: false
        });
      }
    }
    
    // Update state only once
    availableGroups = filteredGroups;
    
    // Auto-select only after setting availableGroups
    if (filteredGroups.length === 1 && !selectedGroup) {
      selectedGroup = filteredGroups[0];
    } else if (filteredGroups.length === 0) {
      selectedGroup = null;
    }
  });
  
  function selectGroup(group) {
    if (processing) return;
    selectedGroup = group;
    error = null;
    statusMessage = '';
  }
  
  async function startGathering() {
    if (!selectedGroup || processing) return;
    processing = true;
    // Set the flag to prevent re-filtering groups
    operationInProgress = true;
    error = null;
    statusMessage = 'Starting gathering...';
    
    try {
      const gatherFn = httpsCallable(functions, 'startGathering');
      const result = await gatherFn({
        groupId: selectedGroup.id,
        locationX: tileData.x,
        locationY: tileData.y,
        worldId: $game.worldKey
      });
      
      console.log('Gathering started:', result.data);
      // Update message to indicate multiple ticks
      statusMessage = `Gathering started! Resources will be collected in 2 game ticks.`;
      
      if (onGather) {
        onGather({
          group: selectedGroup,
          location: { x: tileData.x, y: tileData.y }
        });
      }
      
      onClose(true);

    } catch (err) {
      console.error('Gathering error:', err);
      error = err.message || 'An error occurred during gathering.';
      statusMessage = '';
      // Reset the operation flag on error
      operationInProgress = false;
    } finally {
      processing = false;
      // We don't reset operationInProgress here to keep the UI stable
    }
  }
  
  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose();
    }
  }
  
  function _fmt(t) {
    if (!t) return '';
    return t.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div 
  class="gather-modal" 
  class:active={isActive}
  onmouseenter={onMouseEnter}
  transition:scale={{ start: 0.95, duration: 200 }}
>
  <header class="modal-header">
    <h2>Gather Resources - {tileData?.x}, {tileData?.y}</h2>
    <button class="close-btn" onclick={onClose} aria-label="Close gather dialog">
      <Close size="1.5em" />
    </button>
  </header>
  
  <div class="content">
    {#if tileData}
      <p class="description">
        Select a group to gather resources at this location.
        Gathering will complete after 2 game ticks.
      </p>
      
      <div class="location-info">
        <div class="terrain">
          <div class="terrain-color" style="background-color: {tileData.color}"></div>
          <span class="terrain-name">{_fmt(tileData.biome?.name) || "Unknown"}</span>
        </div>
      </div>
      
      {#if availableGroups.length > 0}
        <div class="group-selection">
          <h3>Available Groups</h3>
          <div class="groups-list">
            {#each availableGroups as group}
              <button 
                class="group-item" 
                class:selected={selectedGroup?.id === group.id}
                disabled={processing}
                onclick={() => selectGroup(group)}
                aria-pressed={selectedGroup?.id === group.id}
              >
                <div class="group-info">
                  <div class="group-name">{group.name || `Group ${group.id.slice(-4)}`}</div>
                  <div class="group-units">{group.units?.length || 'Unknown'} units</div>
                </div>
              </button>
            {/each}
          </div>
        </div>
        
        {#if error}
          <div class="error">{error}</div>
        {/if}
        
        {#if statusMessage}
          <div class="status">
            {statusMessage}
            {#if !processing}
              <button class="close-now-btn" onclick={() => onClose(true)}>
                Close
              </button>
            {/if}
          </div>
        {/if}
        
        <div class="actions">
          <button 
            class="cancel-btn" 
            onclick={() => onClose()} 
            disabled={processing}
          >
            Cancel
          </button>
          
          <button 
            class="gather-btn" 
            onclick={startGathering} 
            disabled={!selectedGroup || processing}
          >
            {processing ? 'Processing...' : 'Gather Resources'}
          </button>
        </div>
      {:else}
        <div class="empty-state">
          <p>No groups available to gather at this location.</p>
          <button class="close-btn-secondary" onclick={() => onClose()}>
            Close
          </button>
        </div>
      {/if}
    {:else}
      <p class="no-tile">No location selected</p>
      <button class="close-btn-secondary" onclick={() => onClose()}>
        Close
      </button>
    {/if}
  </div>
</div>

<style>
  .gather-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 36em;
    max-height: 90vh;
    background: white;
    border-radius: 0.5em;
    box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.3);
    overflow: hidden;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    font-family: var(--font-body);
    transition: z-index 0s;
  }

  .gather-modal.active {
    z-index: 1001;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
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

  .content {
    padding: 1em;
    overflow-y: auto;
    max-height: calc(90vh - 4em);
  }
  
  .description {
    margin-bottom: 1.5em;
    color: rgba(0, 0, 0, 0.8);
  }
  
  .location-info {
    margin-bottom: 1.5em;
    background: #f5f5f5;
    padding: 1em;
    border-radius: 0.3em;
    border: 1px solid rgba(0, 0, 0, 0.1);
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
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
  }
  
  .terrain-name {
    color: rgba(0, 0, 0, 0.8);
    font-weight: 500;
  }

  .group-selection {
    margin-bottom: 1.5em;
  }

  h3 {
    font-size: 1.1em;
    margin: 0 0 0.8em 0;
    font-family: var(--font-heading);
    color: rgba(0, 0, 0, 0.8);
  }

  .groups-list {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    max-height: 12em;
    overflow-y: auto;
  }

  .group-item {
    display: flex;
    align-items: center;
    padding: 0.8em;
    border: 1px solid #ddd;
    border-radius: 0.3em;
    cursor: pointer;
    background: white;
    transition: all 0.2s;
    text-align: left;
  }

  .group-item:hover:not(:disabled) {
    background: #f9f9f9;
    border-color: #ccc;
  }

  .group-item.selected {
    background: rgba(66, 133, 244, 0.1);
    border-color: rgba(66, 133, 244, 0.4);
  }

  .group-item:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .group-info {
    flex: 1;
  }

  .group-name {
    font-weight: 500;
    margin-bottom: 0.2em;
    color: rgba(0, 0, 0, 0.85);
  }

  .group-units {
    font-size: 0.8em;
    color: rgba(0, 0, 0, 0.75);
  }

  .error {
    padding: 0.8em;
    margin-bottom: 1em;
    background-color: rgba(255, 0, 0, 0.1);
    border-left: 3px solid #f44336;
    border-radius: 0.3em;
    color: #d32f2f;
  }

  .status {
    padding: 0.8em;
    margin-bottom: 1em;
    background-color: rgba(33, 150, 243, 0.1);
    border-left: 3px solid #2196f3;
    border-radius: 0.3em;
    color: #0277bd;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.8em;
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

  .close-btn-secondary {
    padding: 0.6em 1em;
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 0.3em;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    transition: all 0.2s;
  }

  .close-btn-secondary:hover {
    background: #eee;
  }

  .cancel-btn, .gather-btn {
    padding: 0.7em 1.2em;
    border-radius: 0.3em;
    cursor: pointer;
    font-family: inherit;
    font-size: 1em;
    transition: all 0.2s;
  }

  .cancel-btn {
    background-color: #f1f3f4;
    color: #3c4043;
    border: 1px solid #dadce0;
  }

  .cancel-btn:hover:not(:disabled) {
    background-color: #e8eaed;
  }

  .gather-btn {
    background-color: #4285f4;
    color: white;
    border: none;
  }

  .gather-btn:hover:not(:disabled) {
    background-color: #3367d6;
  }

  .cancel-btn:disabled,
  .gather-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .empty-state {
    text-align: center;
    padding: 2em 1em;
    color: #777;
  }

  .empty-state p {
    margin-bottom: 1em;
    color: rgba(0, 0, 0, 0.8);
  }

  .no-tile {
    padding: 2em 1em;
    text-align: center;
    color: rgba(0, 0, 0, 0.8);
  }
</style>
