<script>
  import { fade, scale } from 'svelte/transition';
  import { currentPlayer, game } from '../../lib/stores/game';
  import Close from '../icons/Close.svelte';
  import { getFunctions, httpsCallable } from 'firebase/functions';

  // Props with default empty object to avoid destructuring errors
  const { tile = {}, onClose = () => {} } = $props();

  // Format text for display
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Available groups for attack/defense
  let attackerGroups = $state([]);
  let defenderGroups = $state([]);
  // Selected groups
  let selectedAttacker = $state(null);
  let selectedDefender = $state(null);
  
  // Loading state
  let loading = $state(false);
  let errorMessage = $state('');
  
  // Initialize available groups based on tile content
  $effect(() => {
    if (!tile || !tile.groups) return;
    
    const playerId = $currentPlayer?.uid;
    if (!playerId) return;
    
    // Filter player's groups that can attack
    attackerGroups = tile.groups
      .filter(group => 
        group.owner === playerId && 
        group.status === 'idle' &&
        !group.inBattle
      )
      .map(group => ({
        ...group,
        selected: false
      }));
    
    // Filter other groups that can be attacked
    defenderGroups = tile.groups
      .filter(group => 
        group.owner !== playerId && 
        !group.inBattle
      )
      .map(group => ({
        ...group,
        selected: false
      }));
  });
  
  // Start an attack
  async function startAttack() {
    if (!selectedAttacker || !selectedDefender) return;
    
    loading = true;
    errorMessage = '';
    
    try {
      const functions = getFunctions();
      const attackGroupFn = httpsCallable(functions, 'attackGroup');
      
      const result = await attackGroupFn({
        attackerGroupId: selectedAttacker.id,
        defenderGroupId: selectedDefender.id,
        locationX: tile.x,
        locationY: tile.y,
        worldId: $game.currentWorld
      });
      
      if (result.data.success) {
        console.log('Battle started:', result.data);
        onClose(true);
      } else {
        errorMessage = result.data.error || 'Failed to start attack';
      }
    } catch (error) {
      console.error('Error starting attack:', error);
      errorMessage = error.message || 'Failed to start attack';
    } finally {
      loading = false;
    }
  }

  // Select attacker group
  function selectAttacker(group) {
    selectedAttacker = group;
  }
  
  // Select defender group
  function selectDefender(group) {
    selectedDefender = group;
  }
  
  // Check if attack is possible
  const canAttack = $derived(
    selectedAttacker !== null && selectedDefender !== null && !loading
  );
</script>

<div class="overlay" transition:fade={{ duration: 150 }}>
  <div class="popup" transition:scale={{ start: 0.95, duration: 200 }}>
    <div class="header">
      <h2>Attack Group - {tile?.x}, {tile?.y}</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close dialog">
        <Close size="1.5em" />
      </button>
    </div>
    
    <div class="content">
      {#if attackerGroups.length === 0 || defenderGroups.length === 0}
        <div class="no-battle">
          <p>Cannot initiate battle at this location. You need at least one group that can attack and one enemy group to attack.</p>
          <button class="close-action" onclick={onClose}>Close</button>
        </div>
      {:else}
        {#if errorMessage}
          <div class="error-message">{errorMessage}</div>
        {/if}
        
        <div class="battle-setup">
          <div class="selection-section">
            <h3>Select Your Group</h3>
            <div class="groups-list">
              {#each attackerGroups as group}
                <div 
                  class="group-item" 
                  class:selected={selectedAttacker?.id === group.id}
                  onclick={() => selectAttacker(group)}
                >
                  <div class="group-info">
                    <div class="group-name">{group.name || group.id}</div>
                    <div class="group-details">Units: {group.unitCount || group.units?.length || 1}</div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
          
          <div class="vs-indicator">VS</div>
          
          <div class="selection-section">
            <h3>Select Target Group</h3>
            <div class="groups-list">
              {#each defenderGroups as group}
                <div 
                  class="group-item" 
                  class:selected={selectedDefender?.id === group.id}
                  onclick={() => selectDefender(group)}
                >
                  <div class="group-info">
                    <div class="group-name">{group.name || group.id}</div>
                    <div class="group-details">Units: {group.unitCount || group.units?.length || 1}</div>
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
            disabled={!canAttack}
          >
            {loading ? 'Starting Battle...' : 'Begin Attack'}
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

  .battle-setup {
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

  .groups-list {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    max-height: 20em;
    overflow-y: auto;
  }

  .group-item {
    padding: 0.8em;
    border: 1px solid #e0e0e0;
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s;
  }

  .group-item:hover {
    background-color: #f9f9f9;
  }

  .group-item.selected {
    background-color: rgba(255, 0, 0, 0.05);
    border-color: rgba(255, 0, 0, 0.2);
  }

  .group-name {
    font-weight: 600;
    margin-bottom: 0.3em;
  }

  .group-details {
    font-size: 0.9em;
    opacity: 0.8;
  }

  .vs-indicator {
    text-align: center;
    font-weight: bold;
    font-size: 1.2em;
    padding: 0.5em;
    color: #d32f2f;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 1em;
    margin-top: 1.5em;
  }

  .cancel-btn, .attack-btn, .close-action {
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

  .attack-btn {
    background-color: #d32f2f;
    color: white;
  }

  .attack-btn:disabled {
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
    .battle-setup {
      flex-direction: row;
    }
  }
</style>
