<script>
  import { fade, scale } from 'svelte/transition';
  import { currentPlayer, game } from '../../lib/stores/game';
  import { highlightedStore, targetStore } from '../../lib/stores/map';
  import Close from '../icons/Close.svelte';
  import { getFunctions, httpsCallable } from 'firebase/functions';

  // Import race icon components
  import Human from '../icons/Human.svelte';
  import Elf from '../icons/Elf.svelte';
  import Dwarf from '../icons/Dwarf.svelte';
  import Goblin from '../icons/Goblin.svelte';
  import Fairy from '../icons/Fairy.svelte';

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
  
  // Use arrays for selected groups instead of single selections
  let selectedPlayerGroups = $state([]);
  let selectedEnemyGroups = $state([]);
  
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
      
      // Auto-select first group if there's only one player group
      if (myGroups.length === 1) {
        selectedPlayerGroups = [myGroups[0]];
      } else {
        // Reset selections when groups change
        selectedPlayerGroups = [];
      }
    }
    
    if (enemyGroups.length !== enemies.length || !enemyGroups.every((g, i) => g.id === enemies[i]?.id)) {
      enemyGroups = enemies;
      // Reset selections when groups change
      selectedEnemyGroups = [];
    }
  });
  
  // Toggle selection of a player group
  function togglePlayerGroup(group) {
    if (loading) return; // Prevent selection during loading
    
    const index = selectedPlayerGroups.findIndex(g => g.id === group.id);
    if (index >= 0) {
      // Remove from selection
      selectedPlayerGroups = [...selectedPlayerGroups.slice(0, index), ...selectedPlayerGroups.slice(index + 1)];
    } else {
      // Add to selection
      selectedPlayerGroups = [...selectedPlayerGroups, group];
    }
  }
  
  // Toggle selection of an enemy group
  function toggleEnemyGroup(group) {
    if (loading) return; // Prevent selection during loading
    
    const index = selectedEnemyGroups.findIndex(g => g.id === group.id);
    if (index >= 0) {
      // Remove from selection
      selectedEnemyGroups = [...selectedEnemyGroups.slice(0, index), ...selectedEnemyGroups.slice(index + 1)];
    } else {
      // Add to selection
      selectedEnemyGroups = [...selectedEnemyGroups, group];
    }
  }
  
  // Add keyboard handlers to support accessibility
  function handlePlayerGroupKeyDown(event, group) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      togglePlayerGroup(group);
    }
  }
  
  function handleEnemyGroupKeyDown(event, group) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleEnemyGroup(group);
    }
  }
  
  // Calculate total power for selected groups
  function calculateTotalPower(groups) {
    return groups.reduce((total, group) => {
      return total + (group.unitCount || group.units?.length || 1);
    }, 0);
  }
  
  // Start an attack
  async function startAttack() {
    if (selectedPlayerGroups.length === 0 || selectedEnemyGroups.length === 0) return;
    
    loading = true;
    errorMessage = '';
    
    try {
      // Get arrays of IDs for both sides
      const attackerGroupIds = selectedPlayerGroups.map(g => g.id);
      const defenderGroupIds = selectedEnemyGroups.map(g => g.id);
      
      console.log('Starting attack with params:', {
        worldId: $game.worldKey,
        attackerGroupIds,
        defenderGroupIds,
        locationX: tileData.x,
        locationY: tileData.y,
      });
      
      // Call the cloud function with the updated parameter names
      const attackFunction = httpsCallable(functions, 'attack');
      const result = await attackFunction({
        worldId: $game.worldKey,
        attackerGroupIds,
        defenderGroupIds,
        locationX: tileData.x,
        locationY: tileData.y
      });
      
      if (result.data.success) {
        console.log('Attack started:', result.data);
        
        // Call the callback function if provided
        onAttack({
          attackerGroupIds,
          defenderGroupIds,
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
  
  // Check if a player group is selected
  function isPlayerGroupSelected(groupId) {
    return selectedPlayerGroups.some(g => g.id === groupId);
  }
  
  // Check if an enemy group is selected
  function isEnemyGroupSelected(groupId) {
    return selectedEnemyGroups.some(g => g.id === groupId);
  }
  
  // Check if attack is possible - need at least one group on each side
  let canAttack = $derived(
    selectedPlayerGroups.length > 0 && 
    selectedEnemyGroups.length > 0 &&
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
          <h3>Select Your Groups</h3>
          <div class="selection-count">({selectedPlayerGroups.length} selected)</div>
          <div class="groups-list">
            {#each playerGroups as group}
              <div 
                class="group-item" 
                class:selected={isPlayerGroupSelected(group.id)}
                onclick={() => togglePlayerGroup(group)}
                onkeydown={(e) => handlePlayerGroupKeyDown(e, group)}
                aria-disabled={loading}
                role="checkbox"
                aria-checked={isPlayerGroupSelected(group.id)}
                tabindex="0"
              >
                <div class="custom-checkbox" class:checked={isPlayerGroupSelected(group.id)}></div>
                <div class="entity-icon">
                  {#if group.race}
                    {#if group.race.toLowerCase() === 'human'}
                      <Human extraClass="race-icon-attack" />
                    {:else if group.race.toLowerCase() === 'elf'}
                      <Elf extraClass="race-icon-attack" />
                    {:else if group.race.toLowerCase() === 'dwarf'}
                      <Dwarf extraClass="race-icon-attack" />
                    {:else if group.race.toLowerCase() === 'goblin'}
                      <Goblin extraClass="race-icon-attack" />
                    {:else if group.race.toLowerCase() === 'fairy'}
                      <Fairy extraClass="race-icon-attack" />
                    {/if}
                  {/if}
                </div>
                <div class="group-info">
                  <div class="group-name">{group.name || `Group ${group.id.slice(-4)}`}</div>
                  <div class="group-details">
                    <span class="unit-count">Units: {group.unitCount || group.units?.length || 1}</span>
                    {#if group.race}
                      <span class="group-race">{_fmt(group.race)}</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
        
        <div class="selection-section">
          <h3>Select Enemies to Attack</h3>
          <div class="selection-count">({selectedEnemyGroups.length} selected)</div>
          <div class="groups-list">
            {#each enemyGroups as group}
              <div 
                class="group-item enemy-group" 
                class:selected={isEnemyGroupSelected(group.id)}
                onclick={() => toggleEnemyGroup(group)}
                onkeydown={(e) => handleEnemyGroupKeyDown(e, group)}
                aria-disabled={loading}
                role="checkbox"
                aria-checked={isEnemyGroupSelected(group.id)}
                tabindex="0"
              >
                <div class="custom-checkbox" class:checked={isEnemyGroupSelected(group.id)}></div>
                <div class="entity-icon">
                  {#if group.race}
                    {#if group.race.toLowerCase() === 'human'}
                      <Human extraClass="race-icon-attack" />
                    {:else if group.race.toLowerCase() === 'elf'}
                      <Elf extraClass="race-icon-attack" />
                    {:else if group.race.toLowerCase() === 'dwarf'}
                      <Dwarf extraClass="race-icon-attack" />
                    {:else if group.race.toLowerCase() === 'goblin'}
                      <Goblin extraClass="race-icon-attack" />
                    {:else if group.race.toLowerCase() === 'fairy'}
                      <Fairy extraClass="race-icon-attack" />
                    {/if}
                  {/if}
                </div>
                <div class="group-info">
                  <div class="group-name">
                    {group.name || `Group ${group.id.slice(-4)}`}
                  </div>
                  <div class="group-details">
                    <span class="unit-count">Units: {group.unitCount || group.units?.length || 1}</span>
                    {#if group.race}
                      <span class="group-race">{_fmt(group.race)}</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
      
      <div class="actions">
        <button class="cancel-btn" onclick={onClose} disabled={loading}>Cancel</button>
        <button 
          class="attack-btn" 
          onclick={startAttack}
          disabled={!canAttack || loading}
        >
          {loading ? 'Processing...' : 'Start Attack'}
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

  .selection-count {
    font-size: 0.8em;
    color: #666;
    font-weight: normal;
    margin-bottom: 0.8em;
    margin-top: -0.5em;
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
    display: flex;
    align-items: center;
    gap: 0.8em;
    width: 100%;
    font-family: var(--font-body);
    font-size: 1em;
  }

  /* Custom checkbox styling */
  .custom-checkbox {
    width: 1.2em;
    height: 1.2em;
    border: 2px solid #ccc;
    border-radius: 0.3em;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.2s;
    position: relative;
  }

  .custom-checkbox.checked {
    background-color: #4285F4;
    border-color: #4285F4;
  }

  .custom-checkbox.checked::after {
    content: "✓";
    color: white;
    font-size: 0.9em;
    font-weight: bold;
  }

  /* Enemy group checkbox styling */
  .enemy-group .custom-checkbox.checked {
    background-color: #d32f2f;
    border-color: #d32f2f;
  }

  .group-info {
    flex: 1;
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
    font-weight: 600;
    margin-bottom: 0.3em;
    color: rgba(0, 0, 0, 0.87);
  }

  .group-details {
    font-size: 0.9em;
    color: #555;
    display: flex;
    justify-content: space-between;
  }
  
  .unit-count {
    color: rgba(0, 0, 0, 0.75);
    font-weight: 500;
  }
  
  .group-race {
    color: #3e6bbf;
    font-weight: 500;
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

  /* Entity icon styling */
  .entity-icon {
    margin-right: 0.4em;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Global styles for race icons - improved colors */
  :global(.race-icon-attack) {
    width: 1.4em;
    height: 1.4em;
    opacity: 0.85;
    fill: #3e6bbf; /* Default blue color for all race icons */
  }
  
  /* Race-specific styling with better colors */
  :global(.race-icon-attack.human-icon path) {
    fill: #3e6bbf; /* Blue for humans */
  }
  
  :global(.race-icon-attack.elf-icon path) {
    fill: #2d8659; /* Teal for elves */
  }
  
  :global(.race-icon-attack.dwarf-icon path) {
    fill: #8B4513; /* Brown for dwarves */
  }
  
  :global(.race-icon-attack.fairy-icon path) {
    fill: #9c27b0; /* Purple for fairy */
  }
  
  :global(.race-icon-attack.goblin-icon path) {
    fill: #7D5D3B; /* Earthy tone for goblin instead of bright green */
  }

  @media (min-width: 768px) {
    .attack-selection {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-gap: 1em;
    }
  }
</style>
