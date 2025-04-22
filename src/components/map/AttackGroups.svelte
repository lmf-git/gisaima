<script>
  import { fade, scale } from 'svelte/transition';
  import { currentPlayer, game } from '../../lib/stores/game';
  import { highlightedStore, targetStore } from '../../lib/stores/map';
  import Close from '../icons/Close.svelte';
  import { getFunctions, httpsCallable } from 'firebase/functions';

  // Props
  const { onClose = () => {}, onAttack = () => {} } = $props();

  // Get tile data directly from the targetStore (same as current player location)
  let tileData = $derived($targetStore || null);

  // Format text for display
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Get functions instance
  const functions = getFunctions();
  
  // Available groups and enemy groups
  let playerGroups = $state([]);
  let enemyGroups = $state([]);
  
  // Selected entities
  let selectedPlayerGroup = $state(null);
  let selectedEnemyGroup = $state(null);
  
  // Loading state
  let loading = $state(false);
  let errorMessage = $state('');
  
  // Memoize player ID to reduce calculations
  let currentPlayerId = $derived($currentPlayer?.id);
  
  // Helper function to normalize groups data - handles both array and object formats
  function normalizeGroupsData(groupsData) {
    if (!groupsData) return [];
    
    // If it's already an array, return it
    if (Array.isArray(groupsData)) return groupsData;
    
    // If it's an object with keys, convert to array
    if (typeof groupsData === 'object') {
      return Object.keys(groupsData).map(key => {
        const data = groupsData[key];
        return {
          ...data,
          id: data.id || key
        };
      });
    }
    
    return [];
  }
  
  // Calculate available groups just once when tile data changes
  $effect(() => {
    if (!tileData || !currentPlayerId || !tileData.groups) return;
    
    // Only recalculate when tile data or player ID changes
    const groups = normalizeGroupsData(tileData.groups);
    
    // Find player groups that can attack (idle groups)
    const myGroups = groups.filter(group => 
      group.owner === currentPlayerId && 
      group.status === 'idle' &&
      !group.inBattle
    );
    
    // Find enemy groups that can be attacked (idle groups not owned by player)
    const enemies = groups.filter(group => 
      group.owner !== currentPlayerId && 
      group.status === 'idle' &&
      !group.inBattle
    );

    // Update only if changes detected (length check is faster than deep comparison)
    if (playerGroups.length !== myGroups.length || !playerGroups.every((g, i) => g.id === myGroups[i]?.id)) {
      playerGroups = myGroups;
    }
    
    if (enemyGroups.length !== enemies.length || !enemyGroups.every((g, i) => g.id === enemies[i]?.id)) {
      enemyGroups = enemies;
    }
    
    // Reset selections if the selected groups are no longer available
    if (selectedPlayerGroup && !myGroups.some(g => g.id === selectedPlayerGroup.id)) {
      selectedPlayerGroup = null;
    }
    
    if (selectedEnemyGroup && !enemies.some(g => g.id === selectedEnemyGroup.id)) {
      selectedEnemyGroup = null;
    }
  });
  
  // Start an attack
  async function startAttack() {
    if (!selectedPlayerGroup || !selectedEnemyGroup) return;
    
    loading = true;
    errorMessage = '';
    
    try {
      console.log('Starting attack with params:', {
        worldId: $game.worldKey,
        attackerGroupIds: [selectedPlayerGroup.id],
        defenderGroupIds: [selectedEnemyGroup.id],
        locationX: tileData.x,
        locationY: tileData.y,
      });
      
      // Call the cloud function with the updated parameter names
      const attackFunction = httpsCallable(functions, 'attackGroups');
      const result = await attackFunction({
        worldId: $game.worldKey,
        attackerGroupIds: [selectedPlayerGroup.id],
        defenderGroupIds: [selectedEnemyGroup.id],
        locationX: tileData.x,
        locationY: tileData.y
      });
      
      if (result.data.success) {
        console.log('Attack started:', result.data);
        
        // Call the callback function if provided
        onAttack({
          attackerGroupId: selectedPlayerGroup.id,
          defenderGroupId: selectedEnemyGroup.id,
          battleId: result.data.battleId,
          tile: tileData
        });
        
        onClose(true);
      } else {
        errorMessage = result.data.error || 'Failed to start attack';
      }
    } catch (error) {
      console.error('Error starting attack:', error);
      // More specific error handling
      if (error.code === 'unauthenticated') {
        errorMessage = 'Authentication error: Please log in again.';
      } else if (error.code === 'not-found') {
        errorMessage = 'One of the groups was not found. It may have moved.';
      } else {
        errorMessage = error.message || 'Failed to start attack';
      }
    } finally {
      loading = false;
    }
  }

  // Select a player group
  function selectPlayerGroup(group) {
    selectedPlayerGroup = group;
  }
  
  // Select an enemy group
  function selectEnemyGroup(group) {
    selectedEnemyGroup = group;
  }
  
  // Check if attack is possible
  let canAttack = $derived(
    selectedPlayerGroup !== null && 
    selectedEnemyGroup !== null &&
    !loading
  );
  
  // Handle keyboard events
  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  // Format owner name for display
  function formatOwnerName(group) {
    return group.ownerName || "Unknown Player";
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="attack-modal" transition:scale={{ start: 0.95, duration: 200 }}>
  <header class="modal-header">
    <h2>Attack Enemy Groups - {tileData?.x}, {tileData?.y}</h2>
    <button class="close-btn" onclick={onClose} aria-label="Close dialog">
      <Close size="1.5em" />
    </button>
  </header>
  
  <div class="content">
    {#if playerGroups.length === 0 || enemyGroups.length === 0}
      <div class="message error">
        <p>
          {#if playerGroups.length === 0}
            You don't have any available groups that can attack.
          {:else if enemyGroups.length === 0}
            There are no enemy groups available to attack at this location.
          {:else}
            No groups available for combat.
          {/if}
        </p>
        <button class="cancel-btn" onclick={onClose}>Close</button>
      </div>
    {:else}
      {#if errorMessage}
        <div class="error-message">{errorMessage}</div>
      {/if}
      
      <div class="attack-selection">
        <div class="selection-section">
          <h3>Select Your Group</h3>
          <div class="groups-list">
            {#each playerGroups as group}
              <button 
                class="group-item" 
                class:selected={selectedPlayerGroup?.id === group.id}
                onclick={() => selectPlayerGroup(group)}
                onkeydown={(e) => e.key === 'Enter' && selectPlayerGroup(group)}
                type="button"
                aria-pressed={selectedPlayerGroup?.id === group.id}
                aria-label={`Select your group ${group.name || group.id}`}
              >
                <div class="group-info">
                  <div class="group-name">{group.name || `Group ${group.id.slice(-4)}`}</div>
                  <div class="group-details">
                    <span class="unit-count">Units: {group.unitCount || group.units?.length || 1}</span>
                    {#if group.race}
                      <span class="group-race">{_fmt(group.race)}</span>
                    {/if}
                  </div>
                </div>
              </button>
            {/each}
          </div>
        </div>
        
        <div class="selection-section">
          <h3>Select Enemy to Attack</h3>
          <div class="groups-list">
            {#each enemyGroups as group}
              <button 
                class="group-item enemy-group" 
                class:selected={selectedEnemyGroup?.id === group.id}
                onclick={() => selectEnemyGroup(group)}
                onkeydown={(e) => e.key === 'Enter' && selectEnemyGroup(group)}
                type="button"
                aria-pressed={selectedEnemyGroup?.id === group.id}
                aria-label={`Select enemy group ${group.name || group.id}`}
              >
                <div class="group-info">
                  <div class="group-name">
                    {group.name || `Group ${group.id.slice(-4)}`}
                    <span class="owner-name">({formatOwnerName(group)})</span>
                  </div>
                  <div class="group-details">
                    <span class="unit-count">Units: {group.unitCount || group.units?.length || 1}</span>
                    {#if group.race}
                      <span class="group-race">{_fmt(group.race)}</span>
                    {/if}
                  </div>
                </div>
              </button>
            {/each}
          </div>
        </div>
      </div>
      
      <div class="battle-preview">
        {#if selectedPlayerGroup && selectedEnemyGroup}
          <h3>Battle Preview</h3>
          <div class="battle-sides">
            <div class="battle-side attacker">
              <div class="side-name">Your Group</div>
              <div class="side-info">
                <strong>{selectedPlayerGroup.name || `Group ${selectedPlayerGroup.id.slice(-4)}`}</strong>
                <div>{selectedPlayerGroup.unitCount || selectedPlayerGroup.units?.length || 1} units</div>
              </div>
            </div>
            
            <div class="vs-indicator">VS</div>
            
            <div class="battle-side defender">
              <div class="side-name">Enemy Group</div>
              <div class="side-info">
                <strong>{selectedEnemyGroup.name || `Group ${selectedEnemyGroup.id.slice(-4)}`}</strong>
                <div>{selectedEnemyGroup.unitCount || selectedEnemyGroup.units?.length || 1} units</div>
              </div>
            </div>
          </div>
          
          <div class="battle-note">
            <p>Starting this attack will create a battle that other players can join.</p>
          </div>
        {/if}
      </div>
      
      <div class="actions">
        <button class="cancel-btn" onclick={onClose} disabled={loading}>Cancel</button>
        <button 
          class="attack-btn" 
          onclick={startAttack}
          disabled={!canAttack || loading}
        >
          {loading ? 'Starting Attack...' : 'Start Attack'}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .attack-modal {
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
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 1000;
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

  .attack-selection {
    display: flex;
    flex-direction: column;
    gap: 1em;
    margin-bottom: 1.5em;
  }

  .selection-section {
    flex: 1;
    border: 1px solid #e0e0e0;
    border-radius: 0.4em;
    padding: 1em;
  }

  .groups-list {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    max-height: 15em;
    overflow-y: auto;
  }

  .group-item {
    padding: 0.8em;
    border: 1px solid #e0e0e0;
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s;
    background: white;
    text-align: left;
    display: block;
    width: 100%;
    font-family: var(--font-body);
    font-size: 1em;
  }

  .group-item:hover {
    background-color: #f9f9f9;
  }

  .group-item.selected {
    background-color: rgba(66, 133, 244, 0.1);
    border-color: rgba(66, 133, 244, 0.3);
  }

  .group-item.enemy-group {
    border-color: rgba(220, 20, 60, 0.3);
  }
  
  .group-item.enemy-group:hover {
    background-color: rgba(220, 20, 60, 0.05);
  }
  
  .group-item.enemy-group.selected {
    background-color: rgba(220, 20, 60, 0.1);
    border-color: rgba(220, 20, 60, 0.3);
  }

  .group-name {
    font-weight: 500;
    margin-bottom: 0.3em;
  }

  .owner-name {
    font-size: 0.85em;
    color: #666;
    font-weight: normal;
    margin-left: 0.5em;
  }

  .group-details {
    font-size: 0.9em;
    color: #666;
    display: flex;
    justify-content: space-between;
  }
  
  .unit-count {
    color: rgba(0, 0, 0, 0.7);
    font-weight: 500;
  }
  
  .group-race {
    color: #2d8659;
    font-weight: 500;
  }
  
  .battle-preview {
    margin-top: 1.5em;
    margin-bottom: 1.5em;
  }
  
  .battle-sides {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1em;
    margin-bottom: 1em;
  }
  
  .battle-side {
    flex: 1;
    padding: 0.8em;
    border-radius: 0.3em;
    text-align: center;
  }
  
  .battle-side.attacker {
    background-color: rgba(0, 0, 255, 0.07);
    border: 1px solid rgba(0, 0, 255, 0.15);
    color: #00008B;
  }
  
  .battle-side.defender {
    background-color: rgba(139, 0, 0, 0.07);
    border: 1px solid rgba(139, 0, 0, 0.15);
    color: #8B0000;
  }
  
  .side-name {
    font-weight: 500;
    margin-bottom: 0.5em;
  }
  
  .side-info {
    font-size: 0.9em;
  }
  
  .vs-indicator {
    font-weight: bold;
    font-size: 1.2em;
    color: #666;
  }
  
  .battle-note {
    background-color: rgba(255, 152, 0, 0.1);
    border-left: 3px solid rgba(255, 152, 0, 0.5);
    padding: 0.8em;
    font-size: 0.9em;
    color: #666;
  }
  
  .battle-note p {
    margin: 0;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 1em;
    margin-top: 1em;
  }

  .cancel-btn, .attack-btn {
    padding: 0.7em 1.2em;
    border-radius: 0.3em;
    cursor: pointer;
    font-size: 1em;
    font-weight: 500;
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

  .attack-btn {
    background-color: #d32f2f;
    color: white;
    border: none;
  }

  .attack-btn:hover:not(:disabled) {
    background-color: #b71c1c;
  }

  .attack-btn:disabled, .cancel-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .error-message {
    padding: 0.8em;
    background-color: rgba(255, 0, 0, 0.1);
    border-left: 3px solid #ff3232;
    margin-bottom: 1em;
    color: #d32f2f;
  }

  .message.error {
    padding: 0.8em;
    background-color: rgba(255, 0, 0, 0.1);
    border-left: 3px solid #ff3232;
    margin-bottom: 1em;
    color: #d32f2f;
    display: flex;
    flex-direction: column;
    gap: 1em;
    align-items: center;
  }

  @media (min-width: 768px) {
    .attack-selection {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-gap: 1em;
    }
  }
</style>
