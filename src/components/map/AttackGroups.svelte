<script>
  import { fade, scale } from 'svelte/transition';
  import { currentPlayer, game } from '../../lib/stores/game';
  import Close from '../icons/Close.svelte';
  import Human from '../icons/Human.svelte';
  import Elf from '../icons/Elf.svelte';
  import Dwarf from '../icons/Dwarf.svelte';
  import Goblin from '../icons/Goblin.svelte';
  import Fairy from '../icons/Fairy.svelte';

  // Props with default empty object to avoid destructuring errors
  const { tile = {}, onClose = () => {}, onAttack = () => {} } = $props();
  
  // Format text for display
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Available groups for attack
  let ownGroups = $state([]);
  let enemyGroups = $state([]);
  
  // Selected groups to attack with and target
  let selectedAttackerGroups = $state([]);
  let selectedTargetGroup = $state(null);
  
  // Initialize available groups based on tile content
  $effect(() => {
    if (!tile) return;
    
    const attackers = [];
    const targets = [];
    const playerId = $currentPlayer?.uid;
    
    // Check for groups on this tile
    if (tile.groups && tile.groups.length > 0) {
      tile.groups.forEach(group => {
        if (group.owner === playerId && 
            group.status !== 'mobilizing' && 
            group.status !== 'moving' &&
            group.status !== 'demobilising' &&
            group.status !== 'fighting' &&
            !group.inBattle) {
          // Own groups that can attack
          attackers.push({
            ...group,
            selected: false
          });
        } else if (group.owner !== playerId && 
                  group.status !== 'fighting' &&
                  !group.inBattle) {
          // Enemy groups that can be attacked
          targets.push({
            ...group,
            selected: false
          });
        }
      });
    }
    
    ownGroups = attackers;
    enemyGroups = targets;
    selectedAttackerGroups = [];
    selectedTargetGroup = null;
  });
  
  // Toggle attacker group selection (multiple allowed)
  function toggleAttackerGroup(groupId) {
    const groupIndex = selectedAttackerGroups.findIndex(g => g === groupId);
    
    // Update the groups UI state
    ownGroups = ownGroups.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          selected: !group.selected
        };
      }
      return group;
    });
    
    // Update the selectedAttackerGroups array
    if (groupIndex >= 0) {
      // Remove from selection
      selectedAttackerGroups = selectedAttackerGroups.filter(g => g !== groupId);
    } else {
      // Add to selection
      selectedAttackerGroups = [...selectedAttackerGroups, groupId];
    }
  }
  
  // Set selected target group (only one target allowed)
  function selectTargetGroup(groupId) {
    enemyGroups = enemyGroups.map(group => {
      return {
        ...group,
        selected: group.id === groupId
      };
    });
    
    selectedTargetGroup = enemyGroups.find(g => g.id === groupId) || null;
  }

  // Add keyboard handling for group selection
  function handleAttackerGroupKeyDown(event, groupId) {
    // Handle Enter or Space key to toggle selection
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleAttackerGroup(groupId);
    }
  }

  function handleTargetGroupKeyDown(event, groupId) {
    // Handle Enter or Space key to select
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectTargetGroup(groupId);
    }
  }
  
  // Function to handle attack
  function startAttack() {
    // Check if we have both attacker(s) and target selected
    if (selectedAttackerGroups.length === 0 || !selectedTargetGroup) {
      return;
    }
    
    // Use direct function call
    if (onAttack) {
      onAttack({
        attackerGroupIds: selectedAttackerGroups,
        defenderGroupId: selectedTargetGroup.id,
        tile
      });
    }
    
    onClose();
  }
  
  // Get the selected attacker groups as full objects
  function getSelectedAttackerGroups() {
    return ownGroups.filter(group => selectedAttackerGroups.includes(group.id));
  }
  
  // Calculate total strength of selected attackers
  function getTotalAttackerStrength() {
    return getSelectedAttackerGroups().reduce((total, group) => {
      return total + (group.unitCount || (group.units ? group.units.length : 0) || 1);
    }, 0);
  }
  
  // Helper to check if attack is possible
  let canAttack = $derived(selectedAttackerGroups.length > 0 && selectedTargetGroup !== null);

  // Close on escape key
  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  // Determine unit race icon component
  function getRaceIcon(race) {
    if (!race) return null;
    
    const raceKey = race.toLowerCase();
    switch (raceKey) {
      case 'human': return Human;
      case 'elf': return Elf;
      case 'dwarf': return Dwarf;
      case 'goblin': return Goblin;
      case 'fairy': return Fairy;
      default: return null;
    }
  }
  
  // Get owner display name
  function getOwnerName(group) {
    if (!group || !group.ownerName) return 'Unknown';
    return group.ownerName;
  }
  
  // Format strength value
  function formatStrength(group) {
    if (!group) return '?';
    
    // Use unitCount as strength if available
    if (group.unitCount) {
      return group.unitCount;
    }
    
    // Otherwise use the number of units
    if (group.units && Array.isArray(group.units)) {
      return group.units.length;
    }
    
    return '?';
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<dialog 
     class="overlay"
     open
     aria-modal="true" 
     aria-labelledby="attack-title"
     transition:fade={{ duration: 200 }}>
  
  <section 
       class="popup"
       role="document" 
       transition:scale={{ start: 0.95, duration: 200 }}>
    <div class="header">
      <h2 id="attack-title">Attack Groups - {tile?.x}, {tile?.y}</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close attack dialog">
        <Close size="1.5em" />
      </button>
    </div>
    
    {#if tile}
      <div class="location-info">
        <div class="terrain">
          <div class="terrain-color" style="background-color: {tile.color}"></div>
          <span>{_fmt(tile.biome?.name) || "Unknown"}</span>
          
          {#if tile.structure}
            <span class="structure-tag">
              {tile.structure.name || _fmt(tile.structure.type)}
            </span>
          {/if}
        </div>
      </div>
      
      <div class="attack-content">
        <div class="attack-info">
          <p>Select one or more of your groups to attack with and an enemy group to attack.</p>
          <p class="warning">
            <span class="warning-icon">⚠️</span>
            Battles can result in casualties and loss of units. Choose wisely.
          </p>
        </div>
        
        <div class="battle-selection">
          <div class="selection-column">
            <h3>Your Forces <span class="selection-count">{selectedAttackerGroups.length} selected</span></h3>
            {#if ownGroups.length > 0}
              <div class="groups-list">
                {#each ownGroups as group}
                  <div 
                    class="group-item" 
                    class:selected={group.selected}
                    onclick={() => toggleAttackerGroup(group.id)}
                    onkeydown={(e) => handleAttackerGroupKeyDown(e, group.id)}
                    role="button"
                    tabindex="0"
                    aria-pressed={group.selected}
                    aria-label={`${group.selected ? 'Deselect' : 'Select'} ${group.name || group.id} as attacker`}
                  >
                    <input 
                      type="checkbox" 
                      checked={group.selected} 
                      name="attacker-selection"
                      id={`attacker-${group.id}`}
                      tabindex="-1"
                    />
                    <div class="group-icon">
                      {#if group.race}
                        {#if group.race.toLowerCase() === 'human'}
                          <Human extraClass="race-icon-small" />
                        {:else if group.race.toLowerCase() === 'elf'}
                          <Elf extraClass="race-icon-small" />
                        {:else if group.race.toLowerCase() === 'dwarf'}
                          <Dwarf extraClass="race-icon-small" />
                        {:else if group.race.toLowerCase() === 'goblin'}
                          <Goblin extraClass="race-icon-small" />
                        {:else if group.race.toLowerCase() === 'fairy'}
                          <Fairy extraClass="race-icon-small" />
                        {/if}
                      {/if}
                    </div>
                    <div class="group-info">
                      <div class="group-name">{group.name || `Group ${group.id.slice(-4)}`}</div>
                      <div class="group-details">
                        {#if group.race}
                          <span class="race-tag">{_fmt(group.race)}</span>
                        {/if}
                        <span class="strength-tag">Strength: {formatStrength(group)}</span>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="no-groups">
                <p>You have no groups that can attack.</p>
              </div>
            {/if}
          </div>
          
          <div class="battle-vs">VS</div>
          
          <div class="selection-column">
            <h3>Enemy Forces</h3>
            {#if enemyGroups.length > 0}
              <div class="groups-list">
                {#each enemyGroups as group}
                  <div 
                    class="group-item" 
                    class:selected={group.selected}
                    onclick={() => selectTargetGroup(group.id)}
                    onkeydown={(e) => handleTargetGroupKeyDown(e, group.id)}
                    role="button"
                    tabindex="0"
                    aria-pressed={group.selected}
                    aria-label={`Select ${group.name || group.id} as target`}
                  >
                    <input 
                      type="radio" 
                      checked={group.selected} 
                      name="target-selection"
                      id={`target-${group.id}`}
                      tabindex="-1"
                    />
                    <div class="group-icon">
                      {#if group.race}
                        {#if group.race.toLowerCase() === 'human'}
                          <Human extraClass="race-icon-small" />
                        {:else if group.race.toLowerCase() === 'elf'}
                          <Elf extraClass="race-icon-small" />
                        {:else if group.race.toLowerCase() === 'dwarf'}
                          <Dwarf extraClass="race-icon-small" />
                        {:else if group.race.toLowerCase() === 'goblin'}
                          <Goblin extraClass="race-icon-small" />
                        {:else if group.race.toLowerCase() === 'fairy'}
                          <Fairy extraClass="race-icon-small" />
                        {/if}
                      {/if}
                    </div>
                    <div class="group-info">
                      <div class="group-name">{group.name || `Group ${group.id.slice(-4)}`}</div>
                      <div class="group-details">
                        {#if group.race}
                          <span class="race-tag">{_fmt(group.race)}</span>
                        {/if}
                        <span class="owner-tag">Owner: {getOwnerName(group)}</span>
                        <span class="strength-tag">Strength: {formatStrength(group)}</span>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="no-groups">
                <p>There are no enemy groups to attack.</p>
              </div>
            {/if}
          </div>
        </div>
        
        <div class="battle-summary">
          {#if selectedAttackerGroups.length > 0 && selectedTargetGroup}
            <h3>Battle Summary</h3>
            <div class="summary-content">
              <p>
                <strong>Your Forces</strong> ({selectedAttackerGroups.length} group{selectedAttackerGroups.length !== 1 ? 's' : ''}, 
                Total Strength: {getTotalAttackerStrength()}) 
                will attack 
                <strong>{selectedTargetGroup.name || `Enemy Group`}</strong>
                (Strength: {formatStrength(selectedTargetGroup)})
              </p>
              <p class="estimate">
                {#if getTotalAttackerStrength() > formatStrength(selectedTargetGroup) * 1.5}
                  Your forces have a significant advantage in numbers.
                {:else if getTotalAttackerStrength() > formatStrength(selectedTargetGroup)}
                  Your forces appear to have an advantage in numbers.
                {:else if getTotalAttackerStrength() < formatStrength(selectedTargetGroup) * 0.75}
                  Enemy forces significantly outnumber you. Consider gathering more forces.
                {:else if getTotalAttackerStrength() < formatStrength(selectedTargetGroup)}
                  Enemy forces appear to outnumber you. Consider adding more groups.
                {:else}
                  Forces appear to be evenly matched. Battle outcome is uncertain.
                {/if}
              </p>
            </div>
          {/if}
        </div>
        
        <div class="button-row">
          <button 
            class="cancel-btn" 
            onclick={onClose}
          >
            Retreat
          </button>
          <button 
            class="attack-btn" 
            disabled={!canAttack}
            onclick={startAttack}
          >
            Begin Attack
          </button>
        </div>
      </div>
    {:else}
      <p class="no-tile">No tile selected</p>
    {/if}
  </section>
  
  <button 
    class="overlay-dismiss-button"
    onclick={onClose}
    aria-label="Close dialog">
  </button>
</dialog>

<style>
  .overlay-dismiss-button {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    background: transparent;
    border: none;
    z-index: -1;
  }

  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1200;
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
    padding: 0;
    margin: 0;
    border: none;
  }
  
  .popup {
    background: white;
    border-radius: 0.5em;
    box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.3);
    width: 90%;
    max-width: 40em;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: var(--font-body);
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
    font-size: 1.3em;
    font-weight: 600;
    color: #333;
    font-family: var(--font-heading);
  }
  
  h3 {
    margin: 0 0 0.8em 0;
    font-size: 1.1em;
    font-weight: 600;
    color: #333;
    text-align: center;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5em;
  }
  
  .selection-count {
    font-size: 0.8em;
    font-weight: normal;
    color: #666;
    background-color: rgba(0, 0, 0, 0.08);
    padding: 0.2em 0.5em;
    border-radius: 1em;
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
  
  .location-info {
    padding: 1em;
    border-bottom: 1px solid #e0e0e0;
  }
  
  .terrain {
    display: flex;
    align-items: center;
    font-size: 1.1em;
  }
  
  .terrain-color {
    width: 1em;
    height: 1em;
    border-radius: 0.2em;
    margin-right: 0.5em;
    border: 1px solid rgba(0, 0, 0, 0.2);
  }
  
  .structure-tag {
    margin-left: 0.8em;
    font-size: 0.8em;
    font-weight: bold;
    padding: 0.2em 0.5em;
    border-radius: 0.3em;
    background: rgba(30, 144, 255, 0.15);
    border: 1px solid rgba(30, 144, 255, 0.3);
    color: #1e90ff;
  }
  
  .attack-content {
    padding: 1em;
    display: flex;
    flex-direction: column;
    gap: 1em;
    max-height: 60vh;
    overflow-y: auto;
  }
  
  .attack-info {
    padding: 0.8em;
    background-color: rgba(200, 0, 0, 0.08);
    border-radius: 0.3em;
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.7);
    line-height: 1.4;
    border-left: 3px solid rgba(200, 0, 0, 0.5);
  }
  
  .attack-info p {
    margin: 0 0 0.5em 0;
  }
  
  .attack-info p:last-child {
    margin-bottom: 0;
  }
  
  .warning {
    display: flex;
    align-items: center;
    gap: 0.5em;
    font-weight: 500;
    color: #d32f2f;
  }
  
  .warning-icon {
    font-size: 1.2em;
  }

  .battle-selection {
    display: flex;
    gap: 1em;
    margin: 1em 0;
  }
  
  .selection-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    border: 1px solid #e0e0e0;
    border-radius: 0.3em;
    padding: 0.8em;
    background-color: rgba(0, 0, 0, 0.02);
  }
  
  .selection-column:first-child {
    background-color: rgba(0, 100, 255, 0.05);
    border-color: rgba(0, 100, 255, 0.2);
  }
  
  .selection-column:last-child {
    background-color: rgba(255, 0, 0, 0.05);
    border-color: rgba(255, 0, 0, 0.2);
  }
  
  .battle-vs {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2em;
    font-weight: bold;
    color: #d32f2f;
    min-width: 3em;
  }
  
  .groups-list {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    overflow-y: auto;
    max-height: 15em;
  }
  
  .group-item {
    display: flex;
    align-items: center;
    padding: 0.6em 0.8em;
    border: 1px solid #e0e0e0;
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s;
    background-color: white;
  }
  
  .group-item:hover {
    background-color: #f9f9f9;
  }
  
  .selection-column:first-child .group-item.selected {
    background-color: rgba(0, 100, 255, 0.1);
    border-color: rgba(0, 100, 255, 0.3);
  }
  
  .selection-column:last-child .group-item.selected {
    background-color: rgba(255, 0, 0, 0.1);
    border-color: rgba(255, 0, 0, 0.3);
  }
  
  .group-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 0.6em;
  }
  
  .group-info {
    flex: 1;
  }
  
  .group-name {
    font-weight: 500;
    margin-bottom: 0.2em;
  }
  
  .group-details {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
    font-size: 0.8em;
  }
  
  .race-tag, .strength-tag, .owner-tag {
    padding: 0.1em 0.4em;
    border-radius: 0.2em;
    background-color: rgba(0, 0, 0, 0.06);
    color: rgba(0, 0, 0, 0.7);
  }
  
  .strength-tag {
    color: #b71c1c;
    background-color: rgba(183, 28, 28, 0.06);
  }
  
  .owner-tag {
    color: #0d47a1;
    background-color: rgba(13, 71, 161, 0.06);
  }
  
  .battle-summary {
    padding: 1em;
    background-color: rgba(0, 0, 0, 0.04);
    border-radius: 0.3em;
    border: 1px dashed rgba(0, 0, 0, 0.2);
  }
  
  .battle-summary h3 {
    margin-top: 0;
    text-align: center;
    margin-bottom: 0.5em;
  }
  
  .summary-content {
    text-align: center;
  }
  
  .estimate {
    font-style: italic;
    margin-top: 0.5em;
    font-size: 0.9em;
    color: #666;
  }
  
  .button-row {
    display: flex;
    justify-content: space-between;
    gap: 0.8em;
    margin-top: 1em;
  }
  
  .cancel-btn, .attack-btn {
    padding: 0.8em 1.2em;
    border-radius: 0.3em;
    border: none;
    cursor: pointer;
    font-size: 1em;
    font-weight: 500;
    transition: all 0.2s;
    flex: 1;
  }
  
  .cancel-btn {
    background-color: #f1f3f4;
    color: #3c4043;
    border: 1px solid #dadce0;
  }
  
  .cancel-btn:hover {
    background-color: #e8eaed;
  }
  
  .attack-btn {
    background-color: #d32f2f;
    color: white;
  }
  
  .attack-btn:hover:not(:disabled) {
    background-color: #b71c1c;
  }
  
  .attack-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .no-groups, .no-tile {
    text-align: center;
    padding: 2em 0;
    color: #666;
    font-style: italic;
  }
  
  @media (max-width: 768px) {
    .popup {
      width: 95%;
      max-height: 85vh;
    }
    
    h2 {
      font-size: 1.1em;
    }
    
    .battle-selection {
      flex-direction: column;
    }
    
    .battle-vs {
      margin: 0.5em 0;
    }
    
    .button-row {
      flex-direction: column;
    }
    
    .button-row button {
      width: 100%;
    }
  }
</style>
