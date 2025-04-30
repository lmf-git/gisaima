<script>
  import { fade, scale } from 'svelte/transition';
  import { highlightedStore, targetStore } from '../../lib/stores/map';
  import { currentPlayer, game, timeUntilNextTick } from '../../lib/stores/game';
  import Close from '../icons/Close.svelte';
  import { getFunctions, httpsCallable } from 'firebase/functions';
  
  const { onClose = () => {}, onDemobilize = () => {} } = $props();
  const functions = getFunctions();
  
  // Use $derived for tileData to prevent reactivity issues
  let tileData = $derived($targetStore || null);
  
  // Initialize state
  let availableGroups = $state([]);
  let selectedGroup = $state(null);
  let storageDestination = $state('shared');
  let error = $state(null);
  let statusMessage = $state('');
  let processing = $state(false);
  
  // Add a flag to prevent re-filtering groups once an operation has started
  let operationInProgress = $state(false);

  // Create a derived value for player ID to avoid direct reactive reads in the effect
  let playerId = $derived($currentPlayer?.id);

  // Fix the effect that was causing the infinite loop
  $effect(() => {
    // Don't update available groups if an operation is in progress
    // This prevents the UI from showing "No groups available" while closing
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
      if (group.owner === playerId && group.status === 'idle') {
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

  async function startDemobilize() {
    if (!selectedGroup || processing) return;
    processing = true;
    // Set the flag to prevent re-filtering groups
    operationInProgress = true;
    error = null;
    statusMessage = 'Starting demobilization...';

    try {
      const demobilizeFn = httpsCallable(functions, 'demobiliseUnits');
      const result = await demobilizeFn({
        groupId: selectedGroup.id,
        structureId: tileData.structure.id,
        locationX: tileData.x,
        locationY: tileData.y,
        worldId: $game.worldKey,
        storageDestination: storageDestination
      });

      console.log('Demobilization started:', result.data);
      const nextTickFormatted = timeUntilNextTick;
      statusMessage = `Demobilization started! Your group will be disbursed at the next game tick (in approximately ${nextTickFormatted}).`;

      onDemobilize({
        group: selectedGroup,
        structure: tileData.structure,
        location: { x: tileData.x, y: tileData.y },
        storageDestination: storageDestination
      });

      // We no longer set selectedGroup to null here to keep the UI stable
      setTimeout(() => {
        onClose(true);
      }, 3000);
    } catch (err) {
      console.error('Demobilization error:', err);
      error = err.message || 'An error occurred during demobilization.';
      statusMessage = '';
      // Reset the operation flag on error
      operationInProgress = false;
    } finally {
      processing = false;
      // We don't reset operationInProgress here because we want to keep
      // the UI stable until the modal is closed
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

<div class="demobilise-modal" transition:scale={{ start: 0.95, duration: 200 }}>
  <header class="modal-header">
    <h2>Demobilise Group - {tileData?.x}, {tileData?.y}</h2>
    <button class="close-btn" onclick={onClose} aria-label="Close demobilise dialog">
      <Close size="1.5em" />
    </button>
  </header>
  
  <div class="content">
    {#if tileData && tileData.structure}
      <p class="description">
        Select a group to demobilise at this structure. 
        The group will disband at the next game tick, and all units will join this location.
      </p>
      
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
                  <div class="group-units">{group.unitCount || 'Unknown'} units</div>
                </div>
              </button>
            {/each}
          </div>
        </div>
        
        {#if error}
          <div class="error">{error}</div>
        {/if}
        
        {#if statusMessage}
          <div class="status">{statusMessage}</div>
        {/if}
        
        <div class="structure-info">
          <h3>Destination Structure</h3>
          <div class="structure-name">
            {tileData.structure.name || _fmt(tileData.structure.type) || 'Structure'}
          </div>
          <div class="coordinates">{tileData.x}, {tileData.y}</div>
        </div>
        
        <div class="storage-options">
          <h3>Storage Options</h3>
          <div class="radio-options">
            <label class="radio-label">
              <input 
                type="radio" 
                name="storage" 
                value="shared" 
                checked={storageDestination === 'shared'}
                onchange={() => storageDestination = 'shared'}
                disabled={processing}
              />
              <span class="radio-text">Shared Storage</span>
              <span class="radio-description">Items will be accessible by anyone at this structure</span>
            </label>
            
            <label class="radio-label">
              <input 
                type="radio" 
                name="storage" 
                value="personal"
                checked={storageDestination === 'personal'} 
                onchange={() => storageDestination = 'personal'}
                disabled={processing}
              />
              <span class="radio-text">Personal Bank</span>
              <span class="radio-description">Items will only be accessible by you</span>
            </label>
          </div>
        </div>
        
        <div class="actions">
          <button 
            class="cancel-btn" 
            onclick={() => onClose()} 
            disabled={processing}
          >
            Cancel
          </button>
          
          <button 
            class="demobilise-btn" 
            onclick={startDemobilize} 
            disabled={!selectedGroup || processing}
          >
            {processing ? 'Processing...' : 'Demobilise'}
          </button>
        </div>
      {:else}
        <div class="empty-state">
          <p>No groups available to demobilise at this location.</p>
          <button class="close-btn-secondary" onclick={() => onClose()}>
            Close
          </button>
        </div>
      {/if}
    {:else}
      <p class="no-tile">No structure available for demobilization</p>
      <button class="close-btn-secondary" onclick={() => onClose()}>
        Close
      </button>
    {/if}
  </div>
</div>

<style>
  .demobilise-modal {
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

  .structure-info {
    background: #f5f5f5;
    padding: 1em;
    border-radius: 0.3em;
    margin-bottom: 1.5em;
  }

  .structure-name {
    font-weight: 500;
    margin-bottom: 0.2em;
    color: rgba(0, 0, 0, 0.85);
  }

  .coordinates {
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.75);
    font-family: var(--font-mono, monospace);
  }

  .storage-options {
    margin-bottom: 1.5em;
  }

  .radio-options {
    display: flex;
    flex-direction: column;
    gap: 0.8em;
  }

  .radio-label {
    display: flex;
    flex-direction: column;
    padding: 0.8em;
    border: 1px solid #ddd;
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    padding-left: 2.5em;
  }

  .radio-label:hover {
    background: #f9f9f9;
  }

  .radio-label input {
    position: absolute;
    left: 0.8em;
    top: 0.9em;
  }

  .radio-text {
    font-weight: 500;
    margin-bottom: 0.3em;
    color: rgba(0, 0, 0, 0.85);
  }

  .radio-description {
    font-size: 0.8em;
    color: rgba(0, 0, 0, 0.75);
  }

  .radio-label input:checked + .radio-text {
    color: #1e88e5;
  }

  .radio-label input:checked ~ .radio-description {
    color: #555;
  }

  .radio-label:has(input:checked) {
    border-color: rgba(33, 150, 243, 0.4);
    background: rgba(33, 150, 243, 0.05);
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

  .cancel-btn, .demobilise-btn {
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

  .demobilise-btn {
    background-color: #4285f4;
    color: white;
    border: none;
  }

  .demobilise-btn:hover:not(:disabled) {
    background-color: #3367d6;
  }

  .cancel-btn:disabled,
  .demobilise-btn:disabled {
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
