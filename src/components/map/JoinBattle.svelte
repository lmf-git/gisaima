<script>
  import { fade, scale } from 'svelte/transition';
  import { currentPlayer, game } from '../../lib/stores/game';
  import Close from '../icons/Close.svelte';
  // Import the new function helper
  import { callFunction } from '../../lib/firebase/functions';

  // Props with default empty object to avoid destructuring errors
  const { tile = {}, onClose = () => {}, onJoinBattle = () => {} } = $props();

  // Format text for display
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Available groups and battles
  let availableGroups = $state([]);
  let activeBattles = $state([]);
  
  // Selected entities
  let selectedGroup = $state(null);
  let selectedBattle = $state(null);
  let selectedSide = $state(null);
  
  // Loading state
  let loading = $state(false);
  let errorMessage = $state('');
  
  // Find active battles at this location
  $effect(() => {
    if (!tile || !tile.groups) return;
    
    const playerId = $currentPlayer?.uid;
    if (!playerId) return;
    
    // Find groups that can join battles
    availableGroups = tile.groups
      .filter(group => 
        group.owner === playerId && 
        group.status === 'idle' &&
        !group.inBattle
      )
      .map(group => ({
        ...group,
        selected: false
      }));
    
    // Find active battles
    const battles = new Map();
    let battlingGroups = [];
    
    // First identify all groups in battle
    tile.groups.forEach(group => {
      if (group.inBattle && group.battleId) {
        battlingGroups.push(group);
        
        if (!battles.has(group.battleId)) {
          battles.set(group.battleId, {
            id: group.battleId,
            sides: {
              1: { groups: [], power: 0 },
              2: { groups: [], power: 0 }
            },
            selected: false
          });
        }
        
        // Add group to appropriate side
        const side = group.battleSide || 1;
        const battleData = battles.get(group.battleId);
        
        battleData.sides[side].groups.push(group);
        battleData.sides[side].power += (group.unitCount || 1);
      }
    });
    
    // Convert map to array
    activeBattles = Array.from(battles.values());
  });
  
  // Join a battle
  async function joinBattle() {
    if (!selectedGroup || !selectedBattle || !selectedSide) return;
    
    loading = true;
    errorMessage = '';
    
    try {
      // Use our helper function instead of direct Firebase call
      const result = await callFunction('joinBattle', {
        groupId: selectedGroup.id,
        battleId: selectedBattle.id,
        side: parseInt(selectedSide),
        locationX: tile.x,
        locationY: tile.y,
        worldId: $game.currentWorld
      });
      
      if (result.success) {
        console.log('Joined battle:', result);
        
        // Call the callback function if provided
        if (onJoinBattle) {
          onJoinBattle({
            groupId: selectedGroup.id,
            battleId: selectedBattle.id,
            side: parseInt(selectedSide),
            tile
          });
        }
        
        onClose(true);
      } else {
        errorMessage = result.error || 'Failed to join battle';
      }
    } catch (error) {
      console.error('Error joining battle:', error);
      errorMessage = error.message || 'Failed to join battle';
    } finally {
      loading = false;
    }
  }

  // Select a group
  function selectGroup(group) {
    selectedGroup = group;
  }
  
  // Select a battle
  function selectBattle(battle) {
    selectedBattle = battle;
    selectedSide = null;  // Reset side selection
  }
  
  // Select a side
  function selectSide(side) {
    selectedSide = side;
  }
  
  // Check if joining is possible
  const canJoin = $derived(
    selectedGroup !== null && 
    selectedBattle !== null && 
    selectedSide !== null &&
    !loading
  );
  
  // Handle keyboard events
  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose();
    }
  }
</script>

<div class="overlay" transition:fade={{ duration: 150 }}>
  <div class="popup" transition:scale={{ start: 0.95, duration: 200 }}>
    <div class="header">
      <h2>Join Battle - {tile?.x}, {tile?.y}</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close dialog">
        <Close size="1.5em" />
      </button>
    </div>
    
    <div class="content">
      {#if availableGroups.length === 0 || activeBattles.length === 0}
        <div class="no-battle">
          <p>No battles available to join at this location, or you don't have any groups that can join.</p>
          <button class="close-action" onclick={onClose}>Close</button>
        </div>
      {:else}
        {#if errorMessage}
          <div class="error-message">{errorMessage}</div>
        {/if}
        
        <div class="battle-join">
          <div class="selection-section">
            <h3>Select Your Group</h3>
            <div class="groups-list">
              {#each availableGroups as group}
                <button 
                  class="group-item" 
                  class:selected={selectedGroup?.id === group.id}
                  onclick={() => selectGroup(group)}
                  onkeydown={(e) => e.key === 'Enter' && selectGroup(group)}
                  type="button"
                  aria-pressed={selectedGroup?.id === group.id}
                  aria-label={`Select group ${group.name || group.id}`}
                >
                  <div class="group-info">
                    <div class="group-name">{group.name || group.id}</div>
                    <div class="group-details">Units: {group.unitCount || group.units?.length || 1}</div>
                  </div>
                </button>
              {/each}
            </div>
          </div>
          
          <div class="selection-section">
            <h3>Select Battle to Join</h3>
            <div class="battles-list">
              {#each activeBattles as battle}
                <button 
                  class="battle-item" 
                  class:selected={selectedBattle?.id === battle.id}
                  onclick={() => selectBattle(battle)}
                  onkeydown={(e) => e.key === 'Enter' && selectBattle(battle)}
                  type="button"
                  aria-pressed={selectedBattle?.id === battle.id}
                  aria-label={`Select battle ${battle.id.substring(battle.id.lastIndexOf('_') + 1)}`}
                >
                  <div class="battle-info">
                    <div class="battle-name">Battle {battle.id.substring(battle.id.lastIndexOf('_') + 1)}</div>
                    <div class="battle-sides">
                      <div class="side-info">
                        Side 1: {battle.sides[1].groups.length} groups ({battle.sides[1].power} strength)
                      </div>
                      <div class="side-info">
                        Side 2: {battle.sides[2].groups.length} groups ({battle.sides[2].power} strength)
                      </div>
                    </div>
                  </div>
                </button>
              {/each}
            </div>
          </div>
          
          {#if selectedBattle}
            <div class="side-selection">
              <h3>Choose Side</h3>
              <div class="sides">
                <button 
                  class="side-button" 
                  class:selected={selectedSide === "1"}
                  onclick={() => selectSide("1")}
                  onkeydown={(e) => e.key === 'Enter' && selectSide("1")}
                  type="button"
                  aria-pressed={selectedSide === "1"}
                >
                  Side 1 ({selectedBattle.sides[1].groups.length} groups)
                </button>
                <button 
                  class="side-button" 
                  class:selected={selectedSide === "2"}
                  onclick={() => selectSide("2")}
                  onkeydown={(e) => e.key === 'Enter' && selectSide("2")}
                  type="button"
                  aria-pressed={selectedSide === "2"}
                >
                  Side 2 ({selectedBattle.sides[2].groups.length} groups)
                </button>
              </div>
            </div>
          {/if}
        </div>
        
        <div class="actions">
          <button class="cancel-btn" onclick={onClose} disabled={loading}>Cancel</button>
          <button 
            class="join-btn" 
            onclick={joinBattle}
            disabled={!canJoin}
          >
            {loading ? 'Joining...' : 'Join Battle'}
          </button>
        </div>
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
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .popup {
    background: white;
    border-radius: 0.5em;
    width: 90%;
    max-width: 40em;
    box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1em;
    background: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
  }

  h2, h3 {
    margin: 0;
    font-family: var(--font-heading);
  }
  
  h3 {
    margin-bottom: 0.5em;
    font-size: 1.1em;
  }

  .content {
    padding: 1em;
    max-height: 70vh;
    overflow-y: auto;
  }

  .battle-join {
    display: flex;
    flex-direction: column;
    gap: 1em;
  }

  .selection-section {
    flex: 1;
    border: 1px solid #e0e0e0;
    border-radius: 0.4em;
    padding: 1em;
  }

  .groups-list, .battles-list {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    max-height: 15em;
    overflow-y: auto;
  }

  .group-item, .battle-item {
    padding: 0.8em;
    border: 1px solid #e0e0e0;
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s;
  }

  .group-item:hover, .battle-item:hover {
    background-color: #f9f9f9;
  }

  .group-item.selected, .battle-item.selected {
    background-color: rgba(0, 0, 255, 0.05);
    border-color: rgba(0, 0, 255, 0.2);
  }

  .group-name, .battle-name {
    font-weight: 600;
    margin-bottom: 0.3em;
  }

  .group-details, .battle-sides {
    font-size: 0.9em;
    opacity: 0.8;
  }
  
  .battle-sides {
    display: flex;
    justify-content: space-between;
  }
  
  .side-info {
    font-size: 0.85em;
  }
  
  .side-selection {
    margin-top: 1em;
  }
  
  .sides {
    display: flex;
    gap: 1em;
  }
  
  .side-button {
    flex: 1;
    padding: 0.8em;
    border: 1px solid #e0e0e0;
    border-radius: 0.3em;
    background: white;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .side-button:hover {
    background-color: #f9f9f9;
  }
  
  .side-button.selected {
    background-color: rgba(0, 0, 255, 0.1);
    border-color: blue;
    color: blue;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 1em;
    margin-top: 1.5em;
  }

  .cancel-btn, .join-btn, .close-action {
    padding: 0.7em 1.2em;
    border-radius: 0.3em;
    border: none;
    cursor: pointer;
    font-size: 1em;
    font-weight: 500;
  }

  .cancel-btn {
    background-color: #f1f3f4;
    color: #3c4043;
    border: 1px solid #dadce0;
  }

  .join-btn {
    background-color: #1a73e8;
    color: white;
  }

  .join-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error-message {
    padding: 0.8em;
    background-color: rgba(255, 0, 0, 0.1);
    border-left: 3px solid #d32f2f;
    margin-bottom: 1em;
    color: #d32f2f;
  }

  .no-battle {
    text-align: center;
    padding: 2em 1em;
  }

  .close-action {
    margin-top: 1em;
    background-color: #f1f3f4;
    color: #3c4043;
    border: 1px solid #dadce0;
  }

  @media (min-width: 768px) {
    .battle-join {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-gap: 1em;
    }
    
    .side-selection {
      grid-column: 1 / 3;
    }
  }
</style>
