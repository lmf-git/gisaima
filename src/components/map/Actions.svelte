<script>
  import { createEventDispatcher } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import Close from '../icons/Close.svelte';
  import { currentPlayer } from '../../lib/stores/game.js';

  // Props
  const { tile, onClose } = $props();
  
  // Event dispatch
  const dispatch = createEventDispatcher();
  
  // Available actions based on tile content
  let actions = $state([]);
  
  // Function to check if the player is already in a group on this tile
  function isPlayerInGroup(tile, playerId) {
    if (!tile || !tile.groups || !playerId) return false;
    
    // Check all groups on the tile
    return tile.groups.some(group => {
      // Check if the player is in any group's units
      return group.units && group.units.some(unit => 
        unit.type === 'player' && unit.id === playerId
      );
    });
  }
  
  // Process the actions available for this tile
  $effect(() => {
    if (!tile) {
      actions = [];
      return;
    }
    
    // Define base actions
    const availableActions = [];
    
    // Only show "move" action if the tile has groups owned by the player
    const hasOwnedGroups = tile.groups && tile.groups.some(group => 
      group.owner === $currentPlayer?.uid && group.status === 'idle'
    );
    
    if (hasOwnedGroups) {
      availableActions.push({
        id: 'move',
        label: 'Move Group',
        description: 'Move selected group to another location',
        icon: '➡️',
      });
    }
    
    // Add "mobilize" action ONLY if:
    // 1. The player is present at the tile
    // 2. The player is NOT already part of a group at this tile
    // 3. The player is not already being mobilized in a group at this tile
    const playerIsPresent = tile.players && tile.players.some(player => 
      player.uid === $currentPlayer?.uid
    );
    
    const playerInGroup = isPlayerInGroup(tile, $currentPlayer?.uid);
    
    const playerBeingMobilized = tile.groups && tile.groups.some(group => 
      group.status === 'mobilizing' && 
      group.units && 
      group.units.some(unit => unit.type === 'player' && unit.id === $currentPlayer?.uid)
    );
    
    if (playerIsPresent && !playerInGroup && !playerBeingMobilized) {
      availableActions.push({
        id: 'mobilize',
        label: 'Mobilize Forces',
        description: 'Create a new group from available units',
        icon: '🏕️',
      });
    }
    
    // Add explore action for any tile
    availableActions.push({
      id: 'explore',
      label: 'Explore Area',
      description: 'Search the area for items or information',
      icon: '🔍',
    });
    
    // Update the actions list
    actions = availableActions;
  });
  
  // Handle action selection
  function selectAction(actionId) {
    dispatch('action', { action: actionId, tile });
    onClose();
  }
</script>

<div class="overlay" transition:fade={{ duration: 150 }}>
  <div class="popup" transition:scale={{ start: 0.95, duration: 200 }}>
    <div class="header">
      <h2>Actions - ({tile?.x}, {tile?.y})</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close actions">
        <Close size="1.5em" />
      </button>
    </div>
    
    <div class="content">
      {#if actions.length > 0}
        <div class="actions-list">
          {#each actions as action}
            <button 
              class="action-button" 
              onclick={() => selectAction(action.id)}
              aria-label={action.label}
            >
              <span class="action-icon">{action.icon}</span>
              <div class="action-text">
                <div class="action-label">{action.label}</div>
                <div class="action-desc">{action.description}</div>
              </div>
            </button>
          {/each}
        </div>
      {:else}
        <p class="no-actions">No actions available for this location</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .popup {
    background: white;
    border-radius: 0.5em;
    width: 80%;
    max-width: 24em;
    box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.3);
    overflow: hidden;
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
    font-size: 1.2em;
    font-family: var(--font-heading);
    font-weight: 600;
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
    max-height: 60vh;
    overflow-y: auto;
  }

  .actions-list {
    display: flex;
    flex-direction: column;
    gap: 0.7em;
  }

  .action-button {
    display: flex;
    align-items: center;
    gap: 1em;
    width: 100%;
    text-align: left;
    padding: 0.8em 1em;
    border: 1px solid #e0e0e0;
    border-radius: 0.4em;
    background-color: white;
    transition: all 0.2s;
    cursor: pointer;
  }

  .action-button:hover {
    background-color: #f9f9f9;
    border-color: #d0d0d0;
    transform: translateY(-2px);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.1);
  }

  .action-icon {
    font-size: 1.5em;
  }

  .action-text {
    flex: 1;
  }

  .action-label {
    font-weight: 600;
    margin-bottom: 0.2em;
  }

  .action-desc {
    font-size: 0.9em;
    opacity: 0.7;
  }

  .no-actions {
    text-align: center;
    color: #666;
    font-style: italic;
    padding: 1em 0;
  }
</style>
