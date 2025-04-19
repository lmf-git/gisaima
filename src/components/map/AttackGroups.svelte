<script>
  import { fade, scale } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { functions } from "../../lib/firebase/firebase";
  import { httpsCallable } from "firebase/functions";
  import { currentPlayer, game } from '../../lib/stores/game';
  import Close from '../icons/Close.svelte';

  // Props with default empty object to avoid destructuring errors
  const { tile = {}, onClose = () => {}, onAttack = () => {} } = $props();
  
  // Format text for display
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Available groups for attack/defense
  let yourGroups = $state([]);
  let enemyGroups = $state([]);
  
  // Selected groups - now arrays for multi-select
  let selectedAttackers = $state([]);
  let selectedDefenders = $state([]);
  
  // Loading state
  let loading = $state(false);
  let errorMessage = $state('');
  
  // Initialize available groups based on tile content
  $effect(() => {
    if (!tile) return;
    
    const userGroups = [];
    const targetGroups = [];
    const playerId = $currentPlayer?.uid;
    
    // Check for groups on this tile
    if (tile.groups && Object.values(tile.groups).length > 0) {
      Object.values(tile.groups).forEach(group => {
        // Skip groups that are already in battle
        if (group.inBattle) return;
        
        // Skip groups that are moving or mobilizing/demobilising
        if (['moving', 'mobilizing', 'demobilising'].includes(group.status)) return;
        
        if (group.owner === playerId) {
          userGroups.push({
            ...group,
            selected: false
          });
        } else {
          targetGroups.push({
            ...group,
            selected: false
          });
        }
      });
    }
    
    yourGroups = userGroups;
    enemyGroups = targetGroups;
    selectedAttackers = [];
    selectedDefenders = [];
  });
  
  // Toggle attacker selection
  function toggleAttacker(groupId) {
    yourGroups = yourGroups.map(group => {
      if (group.id === groupId) {
        return { ...group, selected: !group.selected };
      }
      return group;
    });
    
    // Update selected attackers
    selectedAttackers = yourGroups.filter(g => g.selected).map(g => g.id);
  }
  
  // Toggle defender selection
  function toggleDefender(groupId) {
    enemyGroups = enemyGroups.map(group => {
      if (group.id === groupId) {
        return { ...group, selected: !group.selected };
      }
      return group;
    });
    
    // Update selected defenders
    selectedDefenders = enemyGroups.filter(g => g.selected).map(g => g.id);
  }
  
  // Handle keyboard interactions
  function handleAttackerKeyDown(event, groupId) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleAttacker(groupId);
    }
  }
  
  function handleDefenderKeyDown(event, groupId) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleDefender(groupId);
    }
  }

  // Function to initiate attack
  async function startAttack() {
    if (selectedAttackers.length === 0 || selectedDefenders.length === 0) {
      return;
    }
    
    loading = true;
    errorMessage = '';
    
    try {
      console.log('Starting attack with params:', {
        attackerGroupIds: selectedAttackers, 
        defenderGroupIds: selectedDefenders,
        locationX: tile.x,
        locationY: tile.y,
        worldId: $game.currentWorld
      });
      
      const attackGroupsFn = httpsCallable(functions, 'attackGroups');
      const result = await attackGroupsFn({
        attackerGroupIds: selectedAttackers, 
        defenderGroupIds: selectedDefenders,
        locationX: tile.x,
        locationY: tile.y,
        worldId: $game.currentWorld
      });
      
      if (result.data.success) {
        console.log('Battle started:', result.data);
        
        if (onAttack) {
          onAttack({
            attackerGroupIds: selectedAttackers,
            defenderGroupIds: selectedDefenders,
            tile
          });
        }
        
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
        errorMessage = 'One of the groups was not found. They may have moved or been disbanded.';
      } else {
        errorMessage = error.message || 'Failed to start attack';
      }
    } finally {
      loading = false;
    }
  }
  
  // Helper to check if attack is possible
  const canAttack = $derived(
    selectedAttackers.length > 0 && selectedDefenders.length > 0 && !loading
  );
</script>

<dialog class="overlay" open aria-modal="true" aria-labelledby="attack-title">
  <div class="popup" transition:scale={{ start: 0.95, duration: 200 }}>
    <div class="header">
      <h2 id="attack-title">Attack Group - {tile?.x}, {tile?.y}</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close dialog">
        <Close size="1.5em" />
      </button>
    </div>
    
    <div class="content">
      {#if yourGroups.length === 0 || enemyGroups.length === 0}
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
            <h3>Your Forces</h3>
            <div class="groups-list">
              {#each yourGroups as group}
                <div 
                  class="group-item" 
                  class:selected={group.selected}
                  onclick={() => toggleAttacker(group.id)}
                  onkeydown={(e) => handleAttackerKeyDown(e, group.id)}
                  role="checkbox"
                  tabindex="0"
                  aria-checked={group.selected}
                >
                  <div class="selection-indicator">
                    {#if group.selected}
                      <div class="checkbox checked">✓</div>
                    {:else}
                      <div class="checkbox"></div>
                    {/if}
                  </div>
                  <div class="group-info">
                    <div class="group-name">{group.name || `Group ${group.id.slice(-5)}`}</div>
                    <div class="group-details">
                      <span class="unit-count">Units: {group.unitCount || (group.units?.length || 0)}</span>
                      {#if group.race}
                        <span class="race-tag">{_fmt(group.race)}</span>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
            <div class="selection-summary">
              Selected: {selectedAttackers.length} group{selectedAttackers.length !== 1 ? 's' : ''}
            </div>
          </div>
          
          <div class="vs-indicator">VS</div>
          
          <div class="selection-section">
            <h3>Enemy Forces</h3>
            <div class="groups-list">
              {#each enemyGroups as group}
                <div 
                  class="group-item" 
                  class:selected={group.selected}
                  onclick={() => toggleDefender(group.id)}
                  onkeydown={(e) => handleDefenderKeyDown(e, group.id)}
                  role="checkbox"
                  tabindex="0"
                  aria-checked={group.selected}
                >
                  <div class="selection-indicator">
                    {#if group.selected}
                      <div class="checkbox checked">✓</div>
                    {:else}
                      <div class="checkbox"></div>
                    {/if}
                  </div>
                  <div class="group-info">
                    <div class="group-name">{group.name || `Group ${group.id.slice(-5)}`}</div>
                    <div class="group-details">
                      <span class="unit-count">Units: {group.unitCount || (group.units?.length || 0)}</span>
                      {#if group.race}
                        <span class="race-tag">{_fmt(group.race)}</span>
                      {/if}
                      {#if group.owner}
                        <span class="owner-tag">Owner: {group.ownerName || group.owner.slice(0, 5)}</span>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
            <div class="selection-summary">
              Selected: {selectedDefenders.length} group{selectedDefenders.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        
        <div class="battle-preview">
          {#if selectedAttackers.length > 0 && selectedDefenders.length > 0}
            <div class="battle-odds">
              <div class="side attacker">
                <span class="side-label">Your Force</span>
                <span class="strength">{selectedAttackers.length} groups</span>
              </div>
              <div class="odds-indicator">vs</div>
              <div class="side defender">
                <span class="side-label">Enemy</span>
                <span class="strength">{selectedDefenders.length} groups</span>
              </div>
            </div>
          {/if}
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
</dialog>

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
    backdrop-filter: blur(2px);
  }

  .popup {
    background: var(--color-dark-navy);
    border: 2px solid var(--color-panel-border);
    border-radius: 0.5em;
    width: 90%;
    max-width: 42em;
    box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.5);
    overflow: hidden;
    color: var(--color-text);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1em;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid var(--color-panel-border);
  }

  h2, h3 {
    margin: 0;
    font-family: var(--font-heading);
    color: var(--color-bright-accent);
  }
  
  h3 {
    margin-bottom: 0.8em;
    font-size: 1.1em;
    display: flex;
    align-items: center;
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
    border: 1px solid var(--color-panel-border);
    border-radius: 0.4em;
    padding: 1em;
    background: rgba(0, 0, 0, 0.2);
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
    border: 1px solid var(--color-panel-border);
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.05);
    display: flex;
    align-items: center;
  }

  .group-item:hover {
    background-color: rgba(255, 255, 255, 0.1);
    transform: translateY(-1px);
  }

  .group-item:focus {
    outline: 2px solid var(--color-bright-accent);
    outline-offset: 2px;
  }
  
  .group-item.selected {
    background-color: rgba(100, 255, 218, 0.1);
    border-color: var(--color-bright-accent);
  }

  .selection-indicator {
    margin-right: 1em;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .checkbox {
    width: 1.2em;
    height: 1.2em;
    border: 1px solid var(--color-muted-teal);
    border-radius: 0.2em;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .checkbox.checked {
    background-color: var(--color-bright-accent);
    border-color: var(--color-bright-accent);
  }

  .group-info {
    flex: 1;
  }

  .group-name {
    font-weight: 600;
    margin-bottom: 0.3em;
    color: var(--color-text);
  }

  .group-details {
    font-size: 0.9em;
    color: var(--color-text-secondary);
  }

  .vs-indicator {
    text-align: center;
    font-weight: bold;
    font-size: 1.2em;
    padding: 0.5em;
    color: var(--color-bright-accent);
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
    cursor: pointer;
    font-size: 1em;
    font-weight: 500;
    font-family: var(--font-heading);
    transition: all 0.2s;
  }

  .cancel-btn {
    background-color: rgba(255, 255, 255, 0.1);
    color: var(--color-text);
    border: 1px solid var(--color-panel-border);
  }

  .cancel-btn:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.15);
  }

  .attack-btn {
    background-color: var(--color-button-primary);
    color: white;
    border: 1px solid var(--color-muted-teal);
  }

  .attack-btn:hover:not(:disabled) {
    background-color: var(--color-button-primary-hover);
    transform: translateY(-2px);
    box-shadow: 0 0.2em 0.5em rgba(0, 150, 150, 0.3);
  }

  .attack-btn:disabled, .cancel-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .error-message {
    padding: 0.8em;
    background-color: rgba(255, 50, 50, 0.2);
    border-left: 3px solid #ff3232;
    margin-bottom: 1em;
    color: #ff9090;
  }

  .no-battle {
    text-align: center;
    padding: 2em 1em;
  }

  .close-action {
    margin-top: 1em;
    background-color: rgba(255, 255, 255, 0.1);
    color: var(--color-text);
    border: 1px solid var(--color-panel-border);
  }

  .selection-summary {
    display: flex;
    justify-content: space-between;
    margin-top: 0.8em;
    padding-top: 0.8em;
    border-top: 1px dashed var(--color-panel-border);
    color: var(--color-bright-accent);
    font-size: 0.9em;
  }

  .battle-preview {
    margin-top: 1.5em;
  }

  .battle-odds {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1em;
    border: 1px solid var(--color-panel-border);
    border-radius: 0.3em;
    background: rgba(0, 0, 0, 0.2);
  }

  .side {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .side-label {
    font-size: 0.9em;
    opacity: 0.8;
    margin-bottom: 0.3em;
  }

  .strength {
    font-weight: bold;
    color: var(--color-bright-accent);
  }

  .odds-indicator {
    font-size: 1.2em;
    font-weight: bold;
  }

  .attacker .strength {
    color: #64FFDA;
  }

  .defender .strength {
    color: #FF6464;
  }

  @media (min-width: 768px) {
    .battle-setup {
      flex-direction: row;
    }
  }
</style>
