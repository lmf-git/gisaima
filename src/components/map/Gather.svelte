<script>
  import { fade, scale } from 'svelte/transition';
  import { currentPlayer, game, timeUntilNextTick } from '../../lib/stores/game';
  import { targetStore } from '../../lib/stores/map';
  import Close from '../icons/Close.svelte';
  import { getFunctions, httpsCallable } from 'firebase/functions';

  // Props with default empty function to avoid destructuring errors - only need callbacks
  const { onClose = () => {}, onGather = () => {} } = $props();
  
  // Get functions instance
  const functions = getFunctions();
  
  // Track selected entities
  let selectedGroup = $state(null);
  let selectedItems = $state([]);
  
  // Available groups and items
  let availableGroups = $state([]);
  let availableItems = $state([]);
  
  // Status messages
  let error = $state(null);
  let statusMessage = $state('');
  
  // Processing flag
  let processing = $state(false);

  // Process data directly from targetStore when it changes
  $effect(() => {
    // Reset if no target data
    if (!$targetStore) {
      availableGroups = [];
      availableItems = [];
      return;
    }
    
    // Filter only groups owned by the current player and with idle status
    const groups = $targetStore.groups;
    
    if (groups && $currentPlayer?.uid) {
      // Handle both array and object formats of groups
      const groupsArray = Array.isArray(groups) ? groups : Object.values(groups);
      
      availableGroups = groupsArray
        .filter(group => 
          group.owner === $currentPlayer.uid && 
          group.status === 'idle' &&
          !group.inBattle
        )
        .map(group => ({
          ...group,
          selected: false
        }));
    } else {
      availableGroups = [];
    }
    
    // Process items - even if there are none, we'll handle that case
    const items = $targetStore.items || [];
    
    // Handle both array and object formats of items
    const itemsArray = Array.isArray(items) ? items : Object.values(items);
    
    availableItems = itemsArray.map(item => ({
      ...item,
      selected: false
    }));
      
    // Clear selections when available data changes
    selectedGroup = null;
    selectedItems = [];
  });
  
  // Select a group
  function selectGroup(group) {
    if (processing) return;
    selectedGroup = group;
  }
  
  // Toggle item selection
  function toggleItem(item) {
    if (processing) return;
    
    if (selectedItems.some(i => i.id === item.id)) {
      selectedItems = selectedItems.filter(i => i.id !== item.id);
    } else {
      selectedItems = [...selectedItems, item];
    }
  }
  
  // Start gathering process
  async function startGather() {
    if (!selectedGroup || processing) return;
    // Note: Removed check for selectedItems.length to allow gathering even without items
    
    processing = true;
    error = null;
    statusMessage = 'Starting gathering...';
    
    try {
      // Create the function reference
      const gatherFn = httpsCallable(functions, 'startGathering');
      
      // Call with the required parameters
      const result = await gatherFn({
        groupId: selectedGroup.id,
        itemIds: selectedItems.map(item => item.id),
        locationX: $targetStore.x,
        locationY: $targetStore.y,
        worldId: $game.currentWorld
      });
      
      console.log('Gathering started:', result.data);
      
      // Show a success message with the next game tick time
      statusMessage = `Gathering started! Your group will collect items at the next game tick (in approximately ${$timeUntilNextTick}).`;
      
      // Notify the parent of the successful gathering
      onGather({
        group: selectedGroup,
        items: selectedItems,
        location: { x: $targetStore.x, y: $targetStore.y }
      });
      
      // Wait a bit then close
      setTimeout(() => {
        onClose(true);
      }, 3000);
    } catch (err) {
      console.error('Gathering error:', err);
      error = err.message || 'An error occurred during gathering.';
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
     aria-labelledby="gather-title"
     transition:fade={{ duration: 150 }}>
  
  <section 
       class="popup"
       role="document" 
       transition:scale={{ start: 0.95, duration: 200 }}>
    <div class="header">
      <h2 id="gather-title">Gather Items</h2>
      <button class="close-btn" onclick={() => onClose()} aria-label="Close gather dialog">
        <Close size="1.5em" />
      </button>
    </div>
    
    <div class="content">
      <p class="description">
        Select a group to gather resources from this location. The group will collect items at the next game tick.
      </p>
      
      {#if availableGroups.length > 0}
        <div class="group-selection">
          <h3>Step 1: Select Your Group</h3>
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
        
        {#if selectedGroup}
          {#if availableItems.length > 0}
            <div class="item-selection">
              <h3>Step 2: Select Items to Gather (Optional)</h3>
              <div class="items-list">
                {#each availableItems as item}
                  <button 
                    class="item-entry" 
                    class:selected={selectedItems.some(i => i.id === item.id)}
                    disabled={processing}
                    onclick={() => toggleItem(item)}
                    aria-pressed={selectedItems.some(i => i.id === item.id)}
                  >
                    <div class="item-details">
                      <div class="item-name">
                        {item.name || _fmt(item.type) || 'Item'}
                        {#if item.rarity && item.rarity !== 'common'}
                          <span class="item-rarity {item.rarity.toLowerCase()}">{_fmt(item.rarity)}</span>
                        {/if}
                      </div>
                      
                      {#if item.quantity > 1}
                        <div class="item-quantity">Quantity: {item.quantity}</div>
                      {/if}
                    </div>
                  </button>
                {/each}
              </div>
              
              <div class="selection-summary">
                Selected: {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''}
              </div>
            </div>
          {:else}
            <div class="info-box">
              <p>No specific items available on this tile, but your group can still gather resources from the surrounding area.</p>
            </div>
          {/if}
        {/if}
        
        {#if error}
          <div class="error">{error}</div>
        {/if}
        
        {#if statusMessage}
          <div class="status">{statusMessage}</div>
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
            onclick={startGather} 
            disabled={!selectedGroup || processing}
          >
            {processing ? 'Processing...' : 'Gather Resources'}
          </button>
        </div>
      {:else}
        <div class="empty-state">
          <p>No groups available to gather resources at this location.</p>
          <button class="close-btn-secondary" onclick={() => onClose()}>
            Close
          </button>
        </div>
      {/if}
    </div>
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
  
  h3 {
    font-size: 1.1em;
    margin: 0 0 0.8em 0;
    font-family: var(--font-heading);
  }
  
  .content {
    padding: 1em;
  }
  
  .description {
    margin-bottom: 1.5em;
    color: #555;
  }
  
  .group-selection, .item-selection {
    margin-bottom: 1.5em;
  }
  
  .groups-list, .items-list {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    max-height: 12em;
    overflow-y: auto;
  }
  
  .group-item, .item-entry {
    display: flex;
    align-items: center;
    padding: 0.8em;
    border: 1px solid #ddd;
    border-radius: 0.3em;
    cursor: pointer;
    background: white;
    transition: all 0.2s;
    text-align: left;
    font-family: inherit;
    font-size: inherit;
  }
  
  .group-item:hover:not(:disabled), .item-entry:hover:not(:disabled) {
    background: #f9f9f9;
    border-color: #ccc;
  }
  
  .group-item.selected, .item-entry.selected {
    background: rgba(66, 133, 244, 0.1);
    border-color: rgba(66, 133, 244, 0.4);
  }
  
  .group-item:disabled, .item-entry:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .group-info, .item-details {
    flex: 1;
  }
  
  .group-name, .item-name {
    font-weight: 500;
    margin-bottom: 0.2em;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5em;
  }
  
  .group-units {
    font-size: 0.8em;
    color: #666;
  }
  
  .item-quantity {
    font-size: 0.8em;
    color: #666;
  }
  
  .item-rarity {
    font-size: 0.7em;
    padding: 0.2em 0.4em;
    border-radius: 0.2em;
    font-weight: 500;
  }
  
  .item-rarity.uncommon {
    background-color: rgba(76, 175, 80, 0.2);
    color: #2e7d32;
    border: 1px solid rgba(76, 175, 80, 0.3);
  }
  
  .item-rarity.rare {
    background-color: rgba(33, 150, 243, 0.2);
    color: #0277bd;
    border: 1px solid rgba(33, 150, 243, 0.3);
  }
  
  .item-rarity.epic {
    background-color: rgba(156, 39, 176, 0.2);
    color: #7b1fa2;
    border: 1px solid rgba(156, 39, 176, 0.3);
  }
  
  .item-rarity.legendary {
    background-color: rgba(255, 152, 0, 0.2);
    color: #ef6c00;
    border: 1px solid rgba(255, 152, 0, 0.3);
  }
  
  .item-rarity.mythic {
    background-color: rgba(233, 30, 99, 0.2);
    color: #c2185b;
    border: 1px solid rgba(233, 30, 99, 0.3);
  }
  
  .selection-summary {
    margin-top: 0.5em;
    font-size: 0.9em;
    color: #555;
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
  
  .info-box {
    padding: 0.8em;
    margin-bottom: 1em;
    background-color: rgba(33, 150, 243, 0.1);
    border-radius: 0.3em;
    color: #0277bd;
    border-left: 3px solid #2196f3;
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
  
  .cancel-btn, .gather-btn {
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
  
  .gather-btn {
    background: #2196f3;
    border: 1px solid #1e88e5;
    color: white;
  }
  
  .cancel-btn:hover:not(:disabled) {
    background: #eee;
  }
  
  .gather-btn:hover:not(:disabled) {
    background: #1e88e5;
  }
  
  .cancel-btn:disabled,
  .gather-btn:disabled {
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
</style>
