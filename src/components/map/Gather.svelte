<script>
  import { fade, scale } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { currentPlayer, game, formatTimeUntilNextTick, timeUntilNextTick } from '../../lib/stores/game';
  import { highlightedStore, targetStore } from '../../lib/stores/map';
  import { getFunctions, httpsCallable } from 'firebase/functions';
  import Close from '../icons/Close.svelte';
  
  // Props
  const { onClose = () => {}, onGather = () => {}, data = null } = $props();

  // States
  let selectedGroupId = $state(null);
  let isSubmitting = $state(false);
  let error = $state(null);

  // Derived states - fix how we determine the currentTile
  const currentTile = $derived(() => {
    // Start with data passed from parent components
    if (data) {
      console.log('Raw data received:', JSON.stringify(data));
      
      // Preserve the groups array from data if it exists
      const groups = data.groups || 
                    (data.tile?.groups) || 
                    ($highlightedStore?.groups) || 
                    ($targetStore?.groups) || 
                    [];
                    
      return {
        ...$targetStore,
        ...$highlightedStore,
        ...data,
        ...data.tile, // Extract tile data if nested
        groups  // Ensure we have the groups array
      };
    }
    
    // Fallback to highlighted or target store
    return $highlightedStore || $targetStore || {};
  });
  
  const eligibleGroups = $derived(getEligibleGroups());
  const availableItems = $derived(getAvailableItems());
  
  onMount(() => {
    console.log('Gather component mounted with tile:', currentTile);
    console.log('Current tile coordinates:', currentTile.x, currentTile.y);
    
    if (currentTile.groups) {
      console.log('All groups on tile:', currentTile.groups.length); 
      
      // Log each group's key details for debugging
      currentTile.groups.forEach(g => {
        console.log(`Group ${g.id || 'unknown'}: owner=${g.owner}, status=${g.status}, inBattle=${g.inBattle}`);
      });
    }
    
    console.log('Eligible groups found:', eligibleGroups.length);
    console.log('Available items:', availableItems.length);
    
    // Auto-select the group if provided in data
    if (data?.group?.id) {
      selectedGroupId = data.group.id;
      console.log('Auto-selected group by passed data:', selectedGroupId);
    }
    // Auto-select first group if there's only one
    else if (eligibleGroups.length === 1) {
      selectedGroupId = eligibleGroups[0].id;
      console.log('Auto-selected only available group:', selectedGroupId);
    }
  });

  function getEligibleGroups() {
    if (!currentTile) return [];
    if (!$currentPlayer) return [];
    
    // Ensure groups is an array
    let groups = currentTile.groups || [];
    
    // Handle case where groups might be an object
    if (groups && !Array.isArray(groups) && typeof groups === 'object') {
      groups = Object.values(groups);
    }
    
    // Simple filtering to match other components
    return groups.filter(group => 
      group && 
      group.owner === $currentPlayer.uid && 
      group.status === 'idle' && 
      !group.inBattle
    );
  }

  function getAvailableItems() {
    // Get items on the current tile
    const items = currentTile?.items || [];
    console.log('Available items on tile:', items.length);
    return items;
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      onClose();
    }
  }

  async function startGathering() {
    if (!selectedGroupId || isSubmitting) return;

    try {
      isSubmitting = true;
      error = null;

      const group = eligibleGroups.find(g => g.id === selectedGroupId);
      if (!group) {
        throw new Error("Selected group not found");
      }

      if (availableItems.length === 0) {
        throw new Error("No items to gather");
      }

      // Call the cloud function to start gathering
      const functions = getFunctions();
      const gatherFn = httpsCallable(functions, 'gather');
      
      const result = await gatherFn({
        groupId: selectedGroupId,
        tileX: currentTile.x,
        tileY: currentTile.y,
        worldId: $game.currentWorld
      });

      // Call the onGather callback with the result
      onGather({
        group,
        tile: currentTile,
        result: result.data
      });

      // Close the modal
      onClose();
    } catch (err) {
      console.error("Error gathering:", err);
      error = err.message || "Failed to start gathering";
      isSubmitting = false;
    }
  }

  function formatItemName(item) {
    return item.name || 
      item.type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 
      "Item";
  }

  function getRarityClass(rarity) {
    return rarity?.toLowerCase() || 'common';
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="modal-container">
  <div class="modal-content">
    <header class="modal-header">
      <h3>Gather Items</h3>
      <button class="close-button" onclick={onClose}>
        <Close size="1.6em" extraClass="close-icon-dark" />
      </button>
    </header>

    <div class="modal-body">
      {#if eligibleGroups.length === 0}
        <div class="message error">
          You don't have any idle groups on this tile that can gather items.
        </div>
      {:else if availableItems.length === 0}
        <div class="message error">
          There are no items to gather on this tile.
        </div>
      {:else}
        <div class="section">
          <h4>Available Items</h4>
          <div class="items-list">
            {#each availableItems as item}
              <div class="item {getRarityClass(item.rarity)}">
                <div class="item-name">
                  {formatItemName(item)}
                  {#if item.quantity > 1}
                    <span class="item-quantity">×{item.quantity}</span>
                  {/if}
                </div>
                {#if item.rarity && item.rarity !== 'common'}
                  <div class="item-rarity {item.rarity.toLowerCase()}">{item.rarity}</div>
                {/if}
                {#if item.description}
                  <div class="item-description">{item.description}</div>
                {/if}
              </div>
            {/each}
          </div>
        </div>

        <div class="section">
          <h4>Select Group to Gather</h4>
          <div class="groups-list">
            {#each eligibleGroups as group}
              <label class="group-option {selectedGroupId === group.id ? 'selected' : ''}">
                <input 
                  type="radio" 
                  name="groupSelect" 
                  value={group.id} 
                  bind:group={selectedGroupId} 
                />
                <div class="group-details">
                  <div class="group-name">{group.name || `Group ${group.id.substring(0, 5)}`}</div>
                  <div class="group-units">{group.unitCount || 1} units</div>
                </div>
              </label>
            {/each}
          </div>
        </div>

        {#if error}
          <div class="message error">{error}</div>
        {/if}

        <div class="info-box">
          <p>Gathering will complete on the next tick. ({$timeUntilNextTick})</p>
        </div>
      {/if}
    </div>

    <footer class="modal-footer">
      <button 
        class="cancel-button" 
        onclick={onClose}
        disabled={isSubmitting}
      >
        Cancel
      </button>
      
      <button 
        class="action-button" 
        onclick={startGathering}
        disabled={!selectedGroupId || isSubmitting || availableItems.length === 0}
      >
        {isSubmitting ? 'Starting...' : 'Start Gathering'}
      </button>
    </footer>
  </div>
  
  <div class="overlay-backdrop" onclick={onClose}></div>
</div>

<style>
  .modal-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }
  
  .overlay-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
    z-index: -1;
    cursor: pointer;
    pointer-events: auto;
  }

  .modal-content {
    pointer-events: auto;
    width: 90%;
    max-width: 30em;
    max-height: 85vh;
    background-color: rgba(255, 255, 255, 0.85);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.3em;
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    font-family: var(--font-body);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: modalAppear 0.3s ease-out forwards;
  }

  @keyframes modalAppear {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .modal-header {
    padding: 0.8em 1em;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: rgba(0, 0, 0, 0.05);
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    font-family: var(--font-heading);
  }

  h3 {
    margin: 0;
    font-size: 1.2em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.8);
  }

  .close-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.4em;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background-color 0.2s;
    color: rgba(0, 0, 0, 0.6);
  }

  .close-button:hover {
    background-color: rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.9);
  }

  .modal-body {
    padding: 1em;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1em;
  }

  .section {
    margin-bottom: 1em;
  }

  h4 {
    margin: 0 0 0.5em 0;
    font-size: 1em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.7);
  }

  .items-list {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    margin-bottom: 1em;
  }

  .item {
    border-radius: 0.3em;
    padding: 0.5em;
    background-color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(0, 0, 0, 0.1);
  }

  .item.uncommon {
    border-color: rgba(76, 175, 80, 0.3);
    background-color: rgba(76, 175, 80, 0.05);
  }

  .item.rare {
    border-color: rgba(33, 150, 243, 0.3);
    background-color: rgba(33, 150, 243, 0.05);
  }

  .item.epic {
    border-color: rgba(156, 39, 176, 0.3);
    background-color: rgba(156, 39, 176, 0.05);
  }

  .item.legendary {
    border-color: rgba(255, 152, 0, 0.3);
    background-color: rgba(255, 152, 0, 0.05);
  }

  .item.mythic {
    border-color: rgba(233, 30, 99, 0.3);
    background-color: rgba(233, 30, 99, 0.05);
    animation: pulseMythic 2s infinite alternate;
  }

  .item-name {
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.4em;
  }

  .item-quantity {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.6);
  }

  .item-rarity {
    font-size: 0.8em;
    margin-top: 0.3em;
    padding: 0.1em 0.4em;
    border-radius: 0.2em;
    display: inline-block;
  }

  .item-rarity.uncommon {
    background-color: rgba(76, 175, 80, 0.2);
    color: #2e7d32;
  }

  .item-rarity.rare {
    background-color: rgba(33, 150, 243, 0.2);
    color: #0277bd;
  }

  .item-rarity.epic {
    background-color: rgba(156, 39, 176, 0.2);
    color: #7b1fa2;
  }

  .item-rarity.legendary {
    background-color: rgba(255, 152, 0, 0.2);
    color: #ef6c00;
  }

  .item-rarity.mythic {
    background-color: rgba(233, 30, 99, 0.2);
    color: #c2185b;
    border: 1px solid rgba(233, 30, 99, 0.4);
  }

  .item-description {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.6);
    font-style: italic;
    margin-top: 0.4em;
  }

  .groups-list {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
  }

  .group-option {
    display: flex;
    align-items: center;
    padding: 0.5em;
    border-radius: 0.3em;
    cursor: pointer;
    background-color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;
  }

  .group-option:hover {
    background-color: rgba(255, 255, 255, 0.7);
  }

  .group-option.selected {
    background-color: rgba(66, 133, 244, 0.1);
    border-color: rgba(66, 133, 244, 0.3);
  }

  .group-option input {
    margin-right: 0.5em;
  }

  .group-details {
    display: flex;
    flex-direction: column;
    gap: 0.2em;
  }

  .group-name {
    font-weight: 500;
  }

  .group-units {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.7);
  }

  .info-box {
    padding: 0.6em;
    background-color: rgba(0, 0, 0, 0.05);
    border-radius: 0.3em;
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.7);
    text-align: center;
  }

  .message {
    padding: 0.7em;
    border-radius: 0.3em;
    font-size: 0.9em;
    text-align: center;
  }

  .message.error {
    background-color: rgba(244, 67, 54, 0.1);
    border: 1px solid rgba(244, 67, 54, 0.3);
    color: #d32f2f;
  }

  .modal-footer {
    display: flex;
    justify-content: space-between;
    gap: 1em;
    padding: 0.8em 1em;
    background-color: rgba(0, 0, 0, 0.05);
    border-top: 1px solid rgba(0, 0, 0, 0.1);
  }

  .cancel-button, .action-button {
    padding: 0.5em 1em;
    border-radius: 0.3em;
    font-size: 1em;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
  }

  .cancel-button {
    background-color: #f1f3f4;
    color: #3c4043;
    border: 1px solid #dadce0;
  }

  .cancel-button:hover:not(:disabled) {
    background-color: #e8eaed;
  }

  .action-button {
    background-color: rgba(138, 43, 226, 0.8);
    color: white;
    flex-grow: 1;
  }

  .action-button:hover:not(:disabled) {
    background-color: rgba(138, 43, 226, 0.9);
    transform: translateY(-1px);
  }

  .action-button:disabled, .cancel-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
  }

  @keyframes pulseMythic {
    from {
      box-shadow: 0 0 0 0 rgba(233, 30, 99, 0.1);
    }
    to {
      box-shadow: 0 0 10px 2px rgba(233, 30, 99, 0.3);
    }
  }

  @media (max-width: 768px) {
    .modal-content {
      width: 95%;
      max-height: 80vh;
    }
  }
</style>
