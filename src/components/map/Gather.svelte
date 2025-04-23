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
    
    if (groups && $currentPlayer?.id) {
      // Handle both array and object formats of groups
      const groupsArray = Array.isArray(groups) ? groups : Object.values(groups);
      
      availableGroups = groupsArray
        .filter(group => 
          group.owner === $currentPlayer.id && 
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
  
  // Toggle item selection - prevent during processing
  function toggleItem(item) {
    if (processing) return;
    
    if (selectedItems.some(i => i.id === item.id)) {
      selectedItems = selectedItems.filter(i => i.id !== item.id);
    } else {
      selectedItems = [...selectedItems, item];
    }
  }

  // Add this function to handle keyboard events for items
  function handleItemKeyDown(event, item) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); // Prevent page scroll on space
      toggleItem(item);
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
        worldId: $game.worldKey
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

<div class="gather-modal" transition:scale={{ start: 0.95, duration: 200 }}>
  <header class="modal-header">
    <h2>Gather Resources - {$targetStore?.x}, {$targetStore?.y}</h2>
    <button class="close-btn" onclick={onClose} aria-label="Close dialog">
      <Close size="1.5em" />
    </button>
  </header>
  
  <div class="content">
    <!-- Modified to show instructions even without items available -->
    {#if availableGroups.length === 0}
      <div class="message error">
        <p>You don't have any idle groups at this location that can gather resources.</p>
        <button class="cancel-btn" onclick={onClose}>Close</button>
      </div>
    {:else}
      {#if error}
        <div class="error">{error}</div>
      {/if}
      
      {#if statusMessage}
        <div class="status">{statusMessage}</div>
      {/if}
      
      <p class="description">
        Select a group to gather resources from this location. 
        {#if availableItems.length > 0}
          You can pick specific items to collect, or gather general resources from the surrounding area.
        {:else}
          Your group will collect resources from the surrounding area.
        {/if}
        Gathering will complete at the next game tick.
      </p>
      
      <div class="group-selection">
        <h3>Select Group</h3>
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
      
      {#if availableItems.length > 0}
        <div class="items-section">
          <h3>Available Items (Optional)</h3>
          <div class="items-list">
            {#each availableItems as item}
              <div 
                class="item-selector" 
                class:selected={selectedItems.includes(item)}
                onclick={() => toggleItem(item)}
                onkeydown={(e) => handleItemKeyDown(e, item)}
                role="checkbox"
                tabindex="0"
                aria-checked={selectedItems.includes(item)}
              >
                <input 
                  type="checkbox" 
                  checked={selectedItems.includes(item)} 
                  id={`item-${item.id}`}
                  tabindex="-1"
                />
                <div class="item {item.rarity ? item.rarity.toLowerCase() : 'common'}">
                  <div class="item-name">{item.name || _fmt(item.type) || "Unknown Item"}</div>
                  <div class="item-details">
                    {#if item.type}
                      <span class="item-type">{_fmt(item.type)}</span>
                    {/if}
                    {#if item.rarity && item.rarity !== 'common'}
                      <span class="item-rarity">{_fmt(item.rarity)}</span>
                    {/if}
                    {#if item.quantity > 1}
                      <span class="item-quantity">×{item.quantity}</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
          <div class="selection-summary">
            <strong>{selectedItems.length}</strong> item{selectedItems.length !== 1 ? 's' : ''} selected
          </div>
        </div>
      {:else}
        <div class="info-box">
          <p>No specific items available on this tile, but your group can still gather resources from the surrounding area.</p>
        </div>
      {/if}
      
      <div class="actions">
        <button 
          class="cancel-btn" 
          onclick={onClose} 
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
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.8em 1em;
    background: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
  }

  h2, h3 {
    margin: 0;
    font-family: var(--font-heading);
  }
  
  h2 {
    font-size: 1.3em;
    font-weight: 600;
    color: #333;
  }
  
  h3 {
    margin-bottom: 0.8em;
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

  .content {
    padding: 1em;
    overflow-y: auto;
    max-height: calc(90vh - 4em);
  }

  .description {
    margin-bottom: 1em;
    color: #555;
    line-height: 1.4;
  }

  .group-selection {
    margin-bottom: 1.5em;
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
    width: 100%;
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

  .items-section {
    margin-bottom: 1.5em;
  }

  .items-list {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    max-height: 18em;
    overflow-y: auto;
  }

  .item-selector {
    display: flex;
    align-items: center;
    padding: 0.6em 0.8em;
    border: 1px solid #e0e0e0;
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s;
    background: white;
  }

  .item-selector:hover {
    background: #f9f9f9;
  }

  .item-selector.selected {
    background: rgba(66, 133, 244, 0.1);
    border-color: rgba(66, 133, 244, 0.4);
  }

  .item-selector input[type="checkbox"] {
    margin-right: 1em;
  }

  .item {
    flex: 1;
  }

  .item-name {
    font-weight: 500;
    margin-bottom: 0.3em;
  }

  .item-details {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
    font-size: 0.85em;
  }

  .item-type {
    color: #555;
  }

  .item-rarity {
    font-weight: 500;
  }

  .item.rare .item-rarity {
    color: #2196f3;
  }

  .item.epic .item-rarity {
    color: #9c27b0;
  }

  .item.legendary .item-rarity {
    color: #ff9800;
  }

  .item.mythic .item-rarity {
    color: #e91e63;
  }

  .item-quantity {
    font-weight: 500;
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

  .message {
    padding: 1em;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1em;
  }

  .message.error {
    background-color: rgba(255, 0, 0, 0.1);
    border-left: 3px solid #ff3232;
    color: #d32f2f;
  }

  .selection-summary {
    margin-top: 0.5em;
    font-size: 0.9em;
    color: #555;
  }

  .info-box {
    padding: 0.8em;
    margin-bottom: 1.5em;
    background-color: rgba(33, 150, 243, 0.1);
    border-left: 3px solid #2196f3;
    border-radius: 0.3em;
    color: #0277bd;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.8em;
    margin-top: 1em;
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
</style>
