<script>
  import { fade, scale } from 'svelte/transition';
  import { highlightedStore } from '../../lib/stores/map';
  import { currentPlayer, game, timeUntilNextTick } from '../../lib/stores/game';
  import Close from '../icons/Close.svelte';
  import { getFunctions, httpsCallable } from 'firebase/functions';
  
  // Props with default empty function to avoid destructuring errors
  const { onClose = () => {}, onDemobilize = () => {} } = $props();
  
  // Get functions instance directly
  const functions = getFunctions();
  
  // Get tile data directly from the highlightedStore
  let tileData = $derived($highlightedStore || null);
  
  // Available groups for demobilization
  let availableGroups = $state([]);
  
  // Selected group to demobilize
  let selectedGroup = $state(null);
  
  // Error state
  let error = $state(null);
  
  // Status message
  let statusMessage = $state('');
  
  // Processing flag
  let processing = $state(false);
  
  // Initialize available groups based on tile content
  $effect(() => {
    if (!tileData || !tileData.groups) {
      availableGroups = [];
      return;
    }
    
    // Filter only groups owned by the current player and with idle status
    availableGroups = tileData.groups
      .filter(group => {
        return group.owner === $currentPlayer?.uid && group.status === 'idle';
      })
      .map(group => ({
        ...group,
        selected: false
      }));
    
    // Clear selected group when data changes
    selectedGroup = null;
  });
  
  // Handle group selection
  function selectGroup(group) {
    if (processing) return;
    selectedGroup = group;
    error = null;
    statusMessage = '';
  }
  
  // Start demobilization process
  async function startDemobilize() {
    if (!selectedGroup || processing) return;
    
    processing = true;
    error = null;
    statusMessage = 'Starting demobilization...';
    
    try {
      // Create the function reference
      const demobilizeFn = httpsCallable(functions, 'demobilizeGroup');
      
      // Call with the required parameters
      const result = await demobilizeFn({
        groupId: selectedGroup.id,
        structureId: tileData.structure.id,
        locationX: tileData.x,
        locationY: tileData.y,
        worldId: $game.currentWorld
      });
      
      console.log('Demobilization started:', result.data);
      
      // Show a success message with the next game tick time
      const nextTickFormatted = timeUntilNextTick;
      statusMessage = `Demobilization started! Your group will be disbursed at the next game tick (in approximately ${nextTickFormatted}).`;
      
      // Notify the parent of the successful demobilization
      onDemobilize({
        group: selectedGroup,
        structure: tileData.structure,
        location: { x: tileData.x, y: tileData.y }
      });
      
      // Clear selected group
      selectedGroup = null;
      
      // Wait a bit then close
      setTimeout(() => {
        onClose(true);
      }, 3000);
    } catch (err) {
      console.error('Demobilization error:', err);
      error = err.message || 'An error occurred during demobilization.';
      statusMessage = '';
    } finally {
      processing = false;
    }
  }
  
  // Close on escape key
  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  // Helper function for formatting text
  function _fmt(t) {
    if (!t) return '';
    return t.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<dialog 
     class="overlay"
     open
     aria-modal="true" 
     aria-labelledby="demobilize-title"
     transition:fade={{ duration: 150 }}>
  
  <section 
       class="popup"
       role="document" 
       transition:scale={{ start: 0.95, duration: 200 }}>
    <div class="header">
      <h2 id="demobilize-title">Demobilize Group</h2>
      <button class="close-btn" onclick={() => onClose()} aria-label="Close demobilize dialog">
        <Close size="1.5em" />
      </button>
    </div>
    
    {#if tileData && tileData.structure}
      <div class="content">
        <p class="description">
          Select a group to demobilize at this structure. 
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
          
          <div class="actions">
            <button 
              class="cancel-btn" 
              onclick={() => onClose()} 
              disabled={processing}
            >
              Cancel
            </button>
            
            <button 
              class="demobilize-btn" 
              onclick={startDemobilize} 
              disabled={!selectedGroup || processing}
            >
              {processing ? 'Processing...' : 'Demobilize'}
            </button>
          </div>
        {:else}
          <div class="empty-state">
            <p>No groups available to demobilize at this location.</p>
            <button class="close-btn-secondary" onclick={() => onClose()}>
              Close
            </button>
          </div>
        {/if}
      </div>
    {:else}
      <p class="no-tile">No structure available for demobilization</p>
      <button class="close-btn-secondary" onclick={() => onClose()}>
        Close
      </button>
    {/if}
  </section>
  
  <button 
    class="overlay-dismiss-button"
    onclick={() => onClose()}
    aria-label="Close dialog">
  </button>
</dialog>

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    padding: 1em;
    box-sizing: border-box;
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
  }
  
  .overlay-dismiss-button {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: transparent;
    border: none;
    cursor: default;
  }
  
  .popup {
    background: #fff;
    border-radius: 0.5em;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    width: 100%;
    max-width: 32em;
    max-height: 90vh;
    overflow-y: auto;
    position: relative;
    z-index: 1001;
    font-family: var(--font-body);
  }
  
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1em;
    border-bottom: 1px solid #eee;
  }
  
  h2 {
    margin: 0;
    font-size: 1.5em;
    font-weight: 600;
    font-family: var(--font-heading);
  }
  
  .content {
    padding: 1em;
  }
  
  .description {
    margin-bottom: 1.5em;
    color: #555;
  }
  
  .group-selection {
    margin-bottom: 1.5em;
  }
  
  h3 {
    font-size: 1.1em;
    margin: 0 0 0.8em 0;
    font-family: var(--font-heading);
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
  }
  
  .group-units {
    font-size: 0.8em;
    color: #666;
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
  }
  
  .coordinates {
    font-size: 0.9em;
    color: #555;
    font-family: var(--font-mono, monospace);
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
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0.5em;
    color: #666;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }
  
  .close-btn:hover {
    background: rgba(0, 0, 0, 0.05);
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
  
  .cancel-btn, .demobilize-btn {
    padding: 0.7em 1.2em;
    border-radius: 0.3em;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    transition: all 0.2s;
  }
  
  .cancel-btn {
    background: #f5f5f5;
    border: 1px solid #ddd;
  }
  
  .demobilize-btn {
    background: #2196f3;
    border: 1px solid #1e88e5;
    color: white;
  }
  
  .cancel-btn:hover:not(:disabled) {
    background: #eee;
  }
  
  .demobilize-btn:hover:not(:disabled) {
    background: #1e88e5;
  }
  
  .cancel-btn:disabled,
  .demobilize-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .empty-state {
    text-align: center;
    padding: 2em 1em;
    color: #777;
  }
  
  .empty-state p {
    margin-bottom: 1em;
  }
  
  .no-tile {
    padding: 2em 1em;
    text-align: center;
    color: #777;
  }
</style>
