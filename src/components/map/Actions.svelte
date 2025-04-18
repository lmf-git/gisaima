<script>
  import { fade, scale } from 'svelte/transition';
  import Close from '../icons/Close.svelte';
  import { currentPlayer, game } from '../../lib/stores/game.js';

  // Props with default empty object to avoid destructuring errors
  const { tile = {}, onClose = () => {}, onAction = () => {} } = $props();
  
  // Available actions based on tile content
  let actions = $state([]);
  
  // Function to check if there's a group with specific status on the tile
  function hasGroupWithStatus(tile, playerId, status) {
    return tile.groups && tile.groups.some(group => 
      group.owner === playerId && group.status === status
    );
  }
  
  // Function to check if player is available (not in a demobilising group)
  function isPlayerAvailableOnTile(tile, playerId) {
    if (!tile.players || !tile.players.some(p => p.id === playerId)) {
      return false; // Player not on tile at all
    }
    
    // Check if the player is in any demobilising group
    if (tile.groups) {
      const playerInDemobilisingGroup = tile.groups.some(group => 
        group.status === 'demobilising' && 
        group.owner === playerId && 
        group.units && 
        group.units.some(unit => unit.id === playerId && unit.type === 'player')
      );
      
      // Player is only available if they're not in a demobilising group
      return !playerInDemobilisingGroup;
    }
    
    return true; // Player is on tile and not in any group
  }
  
  // Function to check if there are valid units that can be mobilized at this location
  function hasValidUnitsForMobilization(tile, playerId) {
    if (!tile || !tile.groups) return false;
    
    // Check for units that belong to the player and are not already being mobilized
    return tile.groups.some(group => 
      group.owner === playerId && 
      group.status !== 'mobilizing' &&
      group.status !== 'moving' &&
      group.status !== 'demobilising' &&
      group.status !== 'fighting' &&
      group.units && 
      group.units.some(unit => unit.type !== 'player')
    );
  }
  
  // Function to check if there are groups that can be demobilized at this location
  function hasValidGroupsForDemobilization(tile, playerId) {
    if (!tile || !tile.groups || !tile.structure) return false;
    
    // Check for groups that belong to the player and can be demobilized
    return tile.groups.some(group => 
      group.owner === playerId && 
      group.status !== 'mobilizing' && 
      group.status !== 'moving' &&
      group.status !== 'demobilising' &&
      group.status !== 'fighting'
    );
  }
  
  // Function to check if there are idle groups owned by the player
  function hasIdleGroups(tile, playerId) {
    return tile.groups && tile.groups.some(group => 
      group.owner === playerId && group.status === 'idle'
    );
  }
  
  // Check if there are groups that can attack other groups
  function hasValidGroupsForAttack(tile, playerId) {
    if (!tile || !tile.groups || tile.groups.length < 2) return false;
    
    // Check if the player has any group that can attack
    const playerGroups = tile.groups.filter(group => 
      group.owner === playerId && 
      group.status !== 'mobilizing' && 
      group.status !== 'moving' &&
      group.status !== 'demobilising' &&
      group.status !== 'fighting' &&
      !group.inBattle
    );
    
    if (playerGroups.length === 0) return false;
    
    // Check if there are any non-player groups to attack
    const enemyGroups = tile.groups.filter(group => 
      group.owner !== playerId && 
      group.status !== 'fighting' &&
      !group.inBattle
    );
    
    return enemyGroups.length > 0;
  }
  
  // Check if there are ongoing battles that can be joined
  function hasOngoingBattlesToJoin(tile, playerId) {
    if (!tile || !tile.groups) return false;
    
    // Look for active battles
    const battlesInProgress = new Set();
    let hasJoinableGroups = false;
    
    // Find battles in progress
    for (const group of tile.groups) {
      if (group.inBattle && group.battleId && group.status === 'fighting') {
        battlesInProgress.add(group.battleId);
      }
    }
    
    // If no battles, can't join any
    if (battlesInProgress.size === 0) return false;
    
    // Check if player has groups that can join
    const canJoin = tile.groups.some(group => 
      group.owner === playerId && 
      group.status !== 'mobilizing' && 
      group.status !== 'moving' &&
      group.status !== 'demobilising' &&
      group.status !== 'fighting' &&
      !group.inBattle
    );
    
    return canJoin;
  }
  
  // Process the actions available for this tile
  $effect(() => {
    if (!tile) {
      actions = [];
      return;
    }
    
    // Define base actions
    const availableActions = [];
    const playerId = $currentPlayer?.uid;
    
    if (!playerId) {
      // No player ID available, just show explore
      availableActions.push({
        id: 'explore',
        label: 'Explore Area',
        description: 'Search the area for items or information',
        icon: '🔍',
      });
      
      actions = availableActions;
      return;
    }
    
    // Add "inspect" action if there's a structure
    if (tile.structure) {
      availableActions.push({
        id: 'inspect',
        label: 'Inspect Structure',
        description: 'View details about this structure and its contents',
        icon: '🏛️',
      });
    }
    
    // Check if there's a group currently demobilising (only affects mobilize action)
    const hasDemobilisingGroup = hasGroupWithStatus(tile, playerId, 'demobilising');
    
    // Only show "move" and "gather" actions if the tile has idle groups owned by the player
    const hasOwnedIdleGroups = hasIdleGroups(tile, playerId);
    
    if (hasOwnedIdleGroups) {
      availableActions.push({
        id: 'move',
        label: 'Move Group',
        description: 'Move selected group to another location',
        icon: '➡️',
      });
      
      // Add gather option for idle groups owned by the player
      availableActions.push({
        id: 'gather',
        label: 'Gather Resources',
        description: 'Collect resources from this area',
        icon: '🧺',
      });
    }
    
    // Only show mobilize if no group is demobilising and either:
    // 1. The player is present AND available (not in a demobilising group) at the tile, OR
    // 2. There are valid units to mobilize
    const playerAvailableOnTile = isPlayerAvailableOnTile(tile, playerId);
    const hasValidUnits = hasValidUnitsForMobilization(tile, playerId);
    
    if (!hasDemobilisingGroup && (playerAvailableOnTile || hasValidUnits)) {
      availableActions.push({
        id: 'mobilize',
        label: 'Mobilize Forces',
        description: 'Create a new group from available units',
        icon: '🏕️',
      });
    }

    // Add demobilize action if there are valid groups to demobilize
    const hasValidGroups = hasValidGroupsForDemobilization(tile, playerId);
    if (hasValidGroups) {
      availableActions.push({
        id: 'demobilize',
        label: 'Demobilize Group',
        description: 'Return units to the structure',
        icon: '🏠',
      });
    }

    // Add attack action if there are valid groups to attack
    const hasAttackGroups = hasValidGroupsForAttack(tile, playerId);
    if (hasAttackGroups) {
      availableActions.push({
        id: 'attack',
        label: 'Attack',
        description: 'Attack another group with your forces',
        icon: '⚔️',
      });
    }

    // Add join battle action if there are ongoing battles to join
    const hasBattlesToJoin = hasOngoingBattlesToJoin(tile, playerId);
    if (hasBattlesToJoin) {
      availableActions.push({
        id: 'joinBattle',
        label: 'Join Battle',
        description: 'Join an ongoing battle on either side',
        icon: '➕',
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
    // Use direct function call instead of event forwarding
    if (onAction) {
      onAction({ action: actionId, tile });
    }
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
