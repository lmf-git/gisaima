<script>
  import { fade, scale } from 'svelte/transition';
  import { currentPlayer, game } from '../../lib/stores/game';
  import { highlightedStore, targetStore } from '../../lib/stores/map';
  import Close from '../icons/Close.svelte';
  import { getFunctions, httpsCallable } from 'firebase/functions';

  const { onClose = () => {}, onJoinBattle = () => {} } = $props();

  // Get tile data directly from the targetStore (same as current player location)
  // This makes more sense as players can only join battles at their current location
  let tileData = $derived($targetStore || null);

  // Format text for display
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Get functions instance directly
  const functions = getFunctions();
  
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
  
  // Improved battle detection logic
  $effect(() => {
    if (!tileData) return;
    
    const playerId = $currentPlayer?.uid;
    if (!playerId) return;
    
    // Find groups that can join battles
    availableGroups = tileData.groups
      ? tileData.groups.filter(group => 
          group.owner === playerId && 
          group.status === 'idle' &&
          !group.inBattle
        ).map(group => ({
          ...group,
          selected: false
        }))
      : [];
    
    // Find active battles with improved detection
    const battles = new Map();
    
    // First handle direct battle references in tileData.battles
    if (tileData.battles && tileData.battles.length > 0) {
      tileData.battles.forEach(battle => {
        if (battle && battle.id && (battle.status !== 'resolved')) {
          battles.set(battle.id, {
            ...battle,
            sides: battle.sides || {
              1: { groups: [], power: battle.side1Power || 0 },
              2: { groups: [], power: battle.side2Power || 0 }
            },
            selected: false
          });
        }
      });
    }
    
    // Also look for groups in battle as a fallback
    if (tileData.groups) {
      tileData.groups.forEach(group => {
        if (group.inBattle && group.battleId) {
          if (!battles.has(group.battleId)) {
            battles.set(group.battleId, {
              id: group.battleId,
              sides: {
                1: { groups: [], power: 0 },
                2: { groups: [], power: 0 }
              },
              status: group.battleStatus || 'active',
              selected: false
            });
          }
          
          // Add group to appropriate side
          const side = group.battleSide || 1;
          const battleData = battles.get(group.battleId);
          
          if (!battleData.sides[side].groups.includes(group.id)) {
            battleData.sides[side].groups.push(group.id);
            battleData.sides[side].power += (group.unitCount || 1);
          }
        }
      });
    }
    
    // Convert map to array
    activeBattles = Array.from(battles.values());
    
    console.log('Found battles:', activeBattles.length, activeBattles);
    console.log('Available groups:', availableGroups.length);
  });
  
  // Join a battle
  async function joinBattle() {
    if (!selectedGroup || !selectedBattle || !selectedSide) return;
    
    loading = true;
    errorMessage = '';
    
    try {
      console.log('Joining battle with params:', {
        groupId: selectedGroup.id,
        battleId: selectedBattle.id,
        side: parseInt(selectedSide),
        locationX: tileData.x,
        locationY: tileData.y,
        worldId: $game.currentWorld
      });
      
      // Use the functions instance from above
      const joinBattleFn = httpsCallable(functions, 'joinBattle');
      const result = await joinBattleFn({
        groupId: selectedGroup.id,
        battleId: selectedBattle.id,
        side: parseInt(selectedSide),
        locationX: tileData.x,
        locationY: tileData.y,
        worldId: $game.currentWorld
      });
      
      if (result.data.success) {
        console.log('Joined battle:', result.data);
        
        // Call the callback function if provided
        if (onJoinBattle) {
          onJoinBattle({
            groupId: selectedGroup.id,
            battleId: selectedBattle.id,
            side: parseInt(selectedSide),
            tile: tileData
          });
        }
        
        onClose(true);
      } else {
        errorMessage = result.data.error || 'Failed to join battle';
      }
    } catch (error) {
      console.error('Error joining battle:', error);
      // More specific error handling
      if (error.code === 'unauthenticated') {
        errorMessage = 'Authentication error: Please log in again.';
      } else if (error.code === 'not-found') {
        errorMessage = 'Battle not found. It may have ended.';
      } else {
        errorMessage = error.message || 'Failed to join battle';
      }
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

<svelte:window onkeydown={handleKeyDown} />

<div class="modal-container">
  <div class="join-battle-modal" transition:scale={{ start: 0.95, duration: 200 }}>
    <header class="modal-header">
      <h3>Join Battle - {tileData?.x}, {tileData?.y}</h3>
      <button class="close-button" onclick={onClose} aria-label="Close dialog">
        <Close size="1.6em" extraClass="close-icon-dark" />
      </button>
    </header>
    
    <div class="modal-body">
      {#if availableGroups.length === 0 || activeBattles.length === 0}
        <div class="message error">
          <p>No battles available to join at this location, or you don't have any groups that can join.</p>
          <button class="cancel-button" onclick={onClose}>Close</button>
        </div>
      {:else}
        {#if errorMessage}
          <div class="message error">{errorMessage}</div>
        {/if}
        
        <div class="battle-join">
          <div class="selection-section">
            <h4>Select Your Group</h4>
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
            <h4>Select Battle to Join</h4>
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
              <h4>Choose Side</h4>
              <div class="sides">
                <button 
                  class="side-button" 
                  class:selected={selectedSide === "1"}
                  onclick={() => selectSide("1")}
                  onkeydown={(e) => e.key === 'Enter' && selectSide("1")}
                  type="button"
                  aria-pressed={selectedSide === "1"}
                >
                  <div class="side-content">
                    <span class="side-name">Side 1</span>
                    <span class="side-count">({selectedBattle.sides[1].groups.length} groups)</span>
                  </div>
                </button>
                <button 
                  class="side-button" 
                  class:selected={selectedSide === "2"}
                  onclick={() => selectSide("2")}
                  onkeydown={(e) => e.key === 'Enter' && selectSide("2")}
                  type="button"
                  aria-pressed={selectedSide === "2"}
                >
                  <div class="side-content">
                    <span class="side-name">Side 2</span>
                    <span class="side-count">({selectedBattle.sides[2].groups.length} groups)</span>
                  </div>
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <footer class="modal-footer">
      <button class="cancel-button" onclick={onClose} disabled={loading}>Cancel</button>
      <button 
        class="action-button" 
        onclick={joinBattle}
        disabled={!canJoin}
      >
        {loading ? 'Joining...' : 'Join Battle'}
      </button>
    </footer>
  </div>
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
    background: rgba(0, 0, 0, 0.5);
  }

  .join-battle-modal {
    width: 90%;
    max-width: 36em;
    max-height: 85vh;
    background-color: rgba(255, 255, 255, 0.85);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5em;
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    font-family: var(--font-body);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 1010;
    color: rgba(0, 0, 0, 0.8);
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

  h4 {
    margin: 0 0 0.5em 0;
    font-size: 1em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.7);
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
    max-height: calc(85vh - 8em);
  }

  .battle-join {
    display: flex;
    flex-direction: column;
    gap: 1em;
  }

  .selection-section {
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.4em;
    padding: 1em;
    background-color: rgba(255, 255, 255, 0.5);
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
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s;
    background-color: rgba(255, 255, 255, 0.5);
    text-align: left;
    display: block;
    width: 100%;
    font-family: var(--font-body);
    font-size: 1em;
    color: rgba(0, 0, 0, 0.8);
  }

  .group-item:hover, .battle-item:hover {
    background-color: rgba(255, 255, 255, 0.7);
  }

  .group-item.selected, .battle-item.selected {
    background-color: rgba(66, 133, 244, 0.1);
    border-color: rgba(66, 133, 244, 0.3);
  }

  .group-name, .battle-name {
    font-weight: 500;
    margin-bottom: 0.3em;
    color: rgba(0, 0, 0, 0.85);
  }

  .group-details, .battle-sides {
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .battle-sides {
    display: flex;
    justify-content: space-between;
  }
  
  .side-info {
    font-size: 0.85em;
  }
  
  .side-selection {
    margin-top: 0.5em;
  }
  
  .sides {
    display: flex;
    gap: 1em;
  }
  
  .side-button {
    flex: 1;
    padding: 0.8em;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.3em;
    background: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition: all 0.2s;
    font-family: var(--font-body);
    font-size: 1em;
    color: rgba(0, 0, 0, 0.8);
  }

  .side-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3em;
  }
  
  .side-name {
    font-weight: 500;
  }
  
  .side-count {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .side-button:hover {
    background-color: rgba(255, 255, 255, 0.7);
  }
  
  .side-button.selected {
    background-color: rgba(66, 133, 244, 0.1);
    border-color: rgba(66, 133, 244, 0.3);
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
    background-color: rgba(66, 133, 244, 0.8);
    color: white;
    flex-grow: 1;
  }

  .action-button:hover:not(:disabled) {
    background-color: rgba(66, 133, 244, 0.9);
    transform: translateY(-1px);
  }

  .action-button:disabled, .cancel-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
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
    display: flex;
    flex-direction: column;
    gap: 1em;
    align-items: center;
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
