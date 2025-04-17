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
  const { tile = {}, onClose = () => {}, onJoinBattle = () => {} } = $props();
  
  // Format text for display
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Available groups for joining battle
  let ownGroups = $state([]);
  // Active battles
  let activeBattles = $state([]);
  
  // Selected values
  let selectedGroup = $state(null);
  let selectedBattle = $state(null);
  let selectedSide = $state(null);
  
  // Initialize available groups based on tile content
  $effect(() => {
    if (!tile) return;
    
    const joinableGroups = [];
    const battles = {};
    const playerId = $currentPlayer?.uid;
    
    // Find all active battles on this tile
    if (tile.groups && tile.groups.length > 0) {
      // First identify all battles
      tile.groups.forEach(group => {
        if (group.inBattle && group.battleId && group.status === 'fighting') {
          if (!battles[group.battleId]) {
            battles[group.battleId] = {
              id: group.battleId,
              sides: {
                1: { groups: [], leader: null },
                2: { groups: [], leader: null }
              },
              selected: false
            };
          }
          
          // Add group to appropriate side
          const side = group.battleSide || 1;
          battles[group.battleId].sides[side].groups.push({
            ...group,
            isCurrentPlayer: group.owner === playerId
          });
          
          // Check if this is a battle leader
          if (group.battleRole === 'attacker' || group.battleRole === 'defender') {
            battles[group.battleId].sides[side].leader = group;
          }
        }
      });
      
      // Then find player groups that can join
      tile.groups.forEach(group => {
        if (group.owner === playerId && 
            group.status !== 'mobilizing' &&
            group.status !== 'moving' &&
            group.status !== 'demobilising' &&
            group.status !== 'fighting' &&
            !group.inBattle) {
          joinableGroups.push({
            ...group,
            selected: false
          });
        }
      });
    }
    
    ownGroups = joinableGroups;
    activeBattles = Object.values(battles);
    
    // Reset selections
    selectedGroup = null;
    selectedBattle = null;
    selectedSide = null;
  });
  
  // Set selected group to join with
  function selectGroup(groupId) {
    ownGroups = ownGroups.map(group => {
      return {
        ...group,
        selected: group.id === groupId
      };
    });
    
    selectedGroup = ownGroups.find(g => g.id === groupId) || null;
  }
  
  // Set selected battle
  function selectBattle(battleId) {
    activeBattles = activeBattles.map(battle => {
      return {
        ...battle,
        selected: battle.id === battleId
      };
    });
    
    selectedBattle = activeBattles.find(b => b.id === battleId) || null;
    
    // Reset side selection when battle changes
    selectedSide = null;
  }
  
  // Select which side to join
  function selectSide(side) {
    selectedSide = side;
  }

  // Add keyboard handling for selection
  function handleGroupKeyDown(event, groupId) {
    // Handle Enter or Space key to select
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectGroup(groupId);
    }
  }
  
  function handleBattleKeyDown(event, battleId) {
    // Handle Enter or Space key to select
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectBattle(battleId);
    }
  }
  
  // Function to handle joining the battle
  function joinBattle() {
    // Check if we have all the required selections
    if (!selectedGroup || !selectedBattle || !selectedSide) {
      return;
    }
    
    // Use direct function call
    if (onJoinBattle) {
      onJoinBattle({
        groupId: selectedGroup.id,
        battleId: selectedBattle.id,
        side: selectedSide,
        tile
      });
    }
    
    onClose();
  }
  
  // Helper to check if joining is possible
  let canJoin = $derived(
    selectedGroup !== null && 
    selectedBattle !== null && 
    selectedSide !== null
  );

  // Close on escape key
  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  // Get race icon component
  function getRaceIcon(race) {
    if (!race) return null;
    
    const raceKey = race?.toLowerCase();
    switch (raceKey) {
      case 'human': return Human;
      case 'elf': return Elf;
      case 'dwarf': return Dwarf;
      case 'goblin': return Goblin;
      case 'fairy': return Fairy;
      default: return null;
    }
  }
  
  // Format strength value (unit count)
  function formatStrength(group) {
    if (!group) return '?';
    
    if (group.unitCount) {
      return group.unitCount;
    }
    
    if (group.units && Array.isArray(group.units)) {
      return group.units.length;
    }
    
    return '?';
  }
  
  // Calculate total strength for a side
  function calculateSideStrength(side) {
    if (!side || !side.groups || !Array.isArray(side.groups)) {
      return 0;
    }
    
    return side.groups.reduce((total, group) => {
      const strength = parseInt(formatStrength(group)) || 0;
      return total + strength;
    }, 0);
  }
  
  // Get owner display name
  function getOwnerName(group) {
    if (!group || !group.ownerName) return 'Unknown';
    return group.ownerName;
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<dialog 
     class="overlay"
     open
     aria-modal="true" 
     aria-labelledby="join-battle-title"
     transition:fade={{ duration: 200 }}>
  
  <section 
       class="popup"
       role="document" 
       transition:scale={{ start: 0.95, duration: 200 }}>
    <div class="header">
      <h2 id="join-battle-title">Join Battle - {tile?.x}, {tile?.y}</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close join battle dialog">
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
      
      <div class="join-content">
        <div class="join-info">
          <p>Select one of your groups to join an ongoing battle. You can choose which side to support.</p>
          <p class="warning">
            <span class="warning-icon">⚠️</span>
            Joining a battle will immediately engage your units in combat. This can result in casualties.
          </p>
        </div>
        
        <!-- Your Groups Section -->
        <div class="selection-section">
          <h3>Select Your Group</h3>
          {#if ownGroups.length > 0}
            <div class="groups-list">
              {#each ownGroups as group}
                <div 
                  class="group-item" 
                  class:selected={group.selected}
                  onclick={() => selectGroup(group.id)}
                  onkeydown={(e) => handleGroupKeyDown(e, group.id)}
                  role="button"
                  tabindex="0"
                  aria-pressed={group.selected}
                  aria-label={`Select ${group.name || group.id} to join battle`}
                >
                  <input 
                    type="radio" 
                    checked={group.selected} 
                    name="group-selection"
                    id={`group-${group.id}`}
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
              <p>You have no groups that can join battles.</p>
            </div>
          {/if}
        </div>
        
        <!-- Active Battles Section -->
        {#if activeBattles.length > 0}
          <div class="selection-section">
            <h3>Select Battle to Join</h3>
            <div class="battles-list">
              {#each activeBattles as battle}
                <div 
                  class="battle-item" 
                  class:selected={battle.selected}
                  onclick={() => selectBattle(battle.id)}
                  onkeydown={(e) => handleBattleKeyDown(e, battle.id)}
                  role="button"
                  tabindex="0"
                  aria-pressed={battle.selected}
                  aria-label={`Select battle ${battle.id}`}
                >
                  <input 
                    type="radio" 
                    checked={battle.selected} 
                    name="battle-selection"
                    id={`battle-${battle.id}`}
                    tabindex="-1"
                  />
                  <div class="battle-content">
                    <div class="battle-header">
                      <div class="battle-id">Battle {battle.id.slice(-6)}</div>
                    </div>
                    
                    <div class="battle-sides">
                      <div class="battle-side">
                        <div class="side-header">
                          Side 1 ({battle.sides[1].groups.length} units)
                        </div>
                        <div class="side-groups">
                          {#each battle.sides[1].groups.slice(0, 3) as group}
                            <div class="battle-group-tag">
                              {#if group.race}
                                {#if group.race.toLowerCase() === 'human'}
                                  <Human extraClass="race-icon-tiny" />
                                {:else if group.race.toLowerCase() === 'elf'}
                                  <Elf extraClass="race-icon-tiny" />
                                {:else if group.race.toLowerCase() === 'dwarf'}
                                  <Dwarf extraClass="race-icon-tiny" />
                                {:else if group.race.toLowerCase() === 'goblin'}
                                  <Goblin extraClass="race-icon-tiny" />
                                {:else if group.race.toLowerCase() === 'fairy'}
                                  <Fairy extraClass="race-icon-tiny" />
                                {/if}
                              {/if}
                              <span class="battle-group-name">{group.name || `Group ${group.id.slice(-4)}`}</span>
                              {#if group.isCurrentPlayer}
                                <span class="your-group-tag">Your group</span>
                              {/if}
                            </div>
                          {/each}
                          {#if battle.sides[1].groups.length > 3}
                            <div class="more-tag">+{battle.sides[1].groups.length - 3} more</div>
                          {/if}
                        </div>
                      </div>
                      
                      <div class="vs">VS</div>
                      
                      <div class="battle-side">
                        <div class="side-header">
                          Side 2 ({battle.sides[2].groups.length} units)
                        </div>
                        <div class="side-groups">
                          {#each battle.sides[2].groups.slice(0, 3) as group}
                            <div class="battle-group-tag">
                              {#if group.race}
                                {#if group.race.toLowerCase() === 'human'}
                                  <Human extraClass="race-icon-tiny" />
                                {:else if group.race.toLowerCase() === 'elf'}
                                  <Elf extraClass="race-icon-tiny" />
                                {:else if group.race.toLowerCase() === 'dwarf'}
                                  <Dwarf extraClass="race-icon-tiny" />
                                {:else if group.race.toLowerCase() === 'goblin'}
                                  <Goblin extraClass="race-icon-tiny" />
                                {:else if group.race.toLowerCase() === 'fairy'}
                                  <Fairy extraClass="race-icon-tiny" />
                                {/if}
                              {/if}
                              <span class="battle-group-name">{group.name || `Group ${group.id.slice(-4)}`}</span>
                              {#if group.isCurrentPlayer}
                                <span class="your-group-tag">Your group</span>
                              {/if}
                            </div>
                          {/each}
                          {#if battle.sides[2].groups.length > 3}
                            <div class="more-tag">+{battle.sides[2].groups.length - 3} more</div>
                          {/if}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <div class="no-battles">
            <p>There are no active battles to join at this location.</p>
          </div>
        {/if}
        
        {#if selectedBattle}
          <div class="side-selection">
            <h3>Choose a Side</h3>
            <div class="sides-container">
              <button 
                class="side-button" 
                class:selected={selectedSide === 1}
                onclick={() => selectSide(1)}
                aria-pressed={selectedSide === 1}
              >
                <div class="side-title">Side 1</div>
                <div class="side-groups-summary">
                  {#each selectedBattle.sides[1].groups.slice(0, 3) as group}
                    <div class="side-group-icon">
                      {#if group.race?.toLowerCase() === 'human'}
                        <Human extraClass="race-icon-small" />
                      {:else if group.race?.toLowerCase() === 'elf'}
                        <Elf extraClass="race-icon-small" />
                      {:else if group.race?.toLowerCase() === 'dwarf'}
                        <Dwarf extraClass="race-icon-small" />
                      {:else if group.race?.toLowerCase() === 'goblin'}
                        <Goblin extraClass="race-icon-small" />
                      {:else if group.race?.toLowerCase() === 'fairy'}
                        <Fairy extraClass="race-icon-small" />
                      {/if}
                    </div>
                  {/each}
                </div>
                <div class="side-strength">
                  Strength: {calculateSideStrength(selectedBattle.sides[1])}
                </div>
              </button>
              
              <button 
                class="side-button" 
                class:selected={selectedSide === 2}
                onclick={() => selectSide(2)}
                aria-pressed={selectedSide === 2}
              >
                <div class="side-title">Side 2</div>
                <div class="side-groups-summary">
                  {#each selectedBattle.sides[2].groups.slice(0, 3) as group}
                    <div class="side-group-icon">
                      {#if group.race?.toLowerCase() === 'human'}
                        <Human extraClass="race-icon-small" />
                      {:else if group.race?.toLowerCase() === 'elf'}
                        <Elf extraClass="race-icon-small" />
                      {:else if group.race?.toLowerCase() === 'dwarf'}
                        <Dwarf extraClass="race-icon-small" />
                      {:else if group.race?.toLowerCase() === 'goblin'}
                        <Goblin extraClass="race-icon-small" />
                      {:else if group.race?.toLowerCase() === 'fairy'}
                        <Fairy extraClass="race-icon-small" />
                      {/if}
                    </div>
                  {/each}
                </div>
                <div class="side-strength">
                  Strength: {calculateSideStrength(selectedBattle.sides[2])}
                </div>
              </button>
            </div>
          </div>
        {/if}
        
        <div class="battle-summary">
          {#if selectedGroup && selectedBattle && selectedSide}
            <h3>Battle Summary</h3>
            <div class="summary">
              <p>
                <strong>{selectedGroup.name || `Your group`}</strong> will join 
                <strong>Side {selectedSide}</strong> in the battle.
              </p>
              <p class="estimate">
                Side {selectedSide} has {calculateSideStrength(selectedBattle.sides[selectedSide])} total strength.
                Your group contributes {formatStrength(selectedGroup)} additional strength.
              </p>
            </div>
          {/if}
        </div>
        
        <div class="button-row">
          <button 
            class="cancel-btn" 
            onclick={onClose}
          >
            Flee
          </button>
          <button 
            class="join-btn" 
            disabled={!canJoin}
            onclick={joinBattle}
          >
            Join Battle
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
    max-width: 35em;
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
  
  .join-content {
    padding: 1em;
    display: flex;
    flex-direction: column;
    gap: 1em;
    max-height: 60vh;
    overflow-y: auto;
  }
  
  .join-info {
    padding: 0.8em;
    background-color: rgba(139, 0, 0, 0.08);
    border-radius: 0.3em;
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.7);
    line-height: 1.4;
    border-left: 3px solid rgba(139, 0, 0, 0.5);
  }
  
  .join-info p {
    margin: 0 0 0.5em 0;
  }
  
  .join-info p:last-child {
    margin-bottom: 0;
  }
  
  .warning {
    display: flex;
    align-items: center;
    gap: 0.5em;
    font-weight: 500;
    color: #8B0000;
  }
  
  .warning-icon {
    font-size: 1.2em;
  }

  .selection-section {
    border: 1px solid #e0e0e0;
    border-radius: 0.3em;
    padding: 0.8em;
    background-color: rgba(0, 0, 0, 0.02);
  }
  
  .groups-list {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    max-height: 12em;
    overflow-y: auto;
  }
  
  .group-item {
    display: flex;
    align-items: center;
    padding: 0.6em 0.8em;
    border: 1px solid #e0e0e0;
    border-radius: 0.3em;
    background: white;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .group-item:hover {
    background-color: #f9f9f9;
  }
  
  .group-item.selected {
    background-color: rgba(66, 133, 244, 0.1);
    border-color: rgba(66, 133, 244, 0.3);
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
  
  .race-tag {
    padding: 0.1em 0.4em;
    border-radius: 0.2em;
    background-color: rgba(0, 0, 0, 0.06);
    color: rgba(0, 0, 0, 0.7);
  }
  
  .strength-tag {
    padding: 0.1em 0.4em;
    border-radius: 0.2em;
    background-color: rgba(139, 0, 0, 0.06);
    color: #8B0000;
  }
  
  .no-groups, .no-battles, .no-tile {
    text-align: center;
    padding: 1em 0;
    color: #666;
    font-style: italic;
  }
  
  .battles-list {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    max-height: 15em;
    overflow-y: auto;
  }
  
  .battle-item {
    display: flex;
    align-items: flex-start;
    padding: 0.6em 0.8em;
    border: 1px solid #e0e0e0;
    border-radius: 0.3em;
    background: white;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .battle-item:hover {
    background-color: #f9f9f9;
  }
  
  .battle-item.selected {
    background-color: rgba(139, 0, 0, 0.1);
    border-color: rgba(139, 0, 0, 0.3);
  }
  
  .battle-content {
    flex: 1;
    margin-left: 0.8em;
  }
  
  .battle-header {
    font-weight: 500;
    margin-bottom: 0.5em;
  }
  
  .battle-id {
    font-size: 1em;
    color: #8B0000;
  }
  
  .battle-sides {
    display: flex;
    gap: 0.5em;
    align-items: stretch;
    font-size: 0.9em;
  }
  
  .battle-side {
    flex: 1;
    border: 1px solid #e0e0e0;
    border-radius: 0.3em;
    padding: 0.4em;
    background-color: rgba(0, 0, 0, 0.02);
  }
  
  .side-header {
    text-align: center;
    font-weight: 500;
    padding-bottom: 0.3em;
    border-bottom: 1px dashed #e0e0e0;
    margin-bottom: 0.3em;
    font-size: 0.85em;
  }
  
  .side-groups {
    display: flex;
    flex-direction: column;
    gap: 0.3em;
  }
  
  .vs {
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    color: #8B0000;
    padding: 0 0.5em;
    font-size: 0.8em;
  }
  
  .battle-group-tag {
    display: flex;
    align-items: center;
    gap: 0.3em;
    font-size: 0.8em;
    background-color: rgba(0, 0, 0, 0.03);
    padding: 0.2em 0.4em;
    border-radius: 0.2em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .battle-group-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .your-group-tag {
    font-size: 0.75em;
    background-color: rgba(66, 133, 244, 0.1);
    color: rgb(66, 133, 244);
    padding: 0.1em 0.3em;
    border-radius: 0.2em;
    white-space: nowrap;
  }
  
  :global(.race-icon-tiny) {
    width: 1em;
    height: 1em;
    fill: rgba(0, 0, 0, 0.7);
  }
  
  .more-tag {
    text-align: center;
    font-size: 0.75em;
    color: #666;
    font-style: italic;
    padding-top: 0.2em;
  }
  
  .side-selection {
    display: flex;
    flex-direction: column;
    gap: 0.8em;
    margin-top: 0.5em;
  }
  
  .sides-container {
    display: flex;
    gap: 1em;
  }
  
  .side-button {
    flex: 1;
    padding: 0.8em;
    border: 2px solid #e0e0e0;
    border-radius: 0.3em;
    background-color: white;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5em;
  }
  
  .side-button:hover {
    background-color: #f9f9f9;
  }
  
  .side-button:first-child.selected {
    background-color: rgba(0, 0, 255, 0.05);
    border-color: rgba(0, 0, 255, 0.3);
  }
  
  .side-button:last-child.selected {
    background-color: rgba(255, 0, 0, 0.05);
    border-color: rgba(255, 0, 0, 0.3);
  }
  
  .side-title {
    font-weight: 600;
    font-size: 1.1em;
  }
  
  .side-groups-summary {
    display: flex;
    gap: 0.5em;
    margin: 0.3em 0;
  }
  
  .side-group-icon {
    width: 1.8em;
    height: 1.8em;
    background-color: rgba(0, 0, 0, 0.03);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .side-strength {
    font-size: 0.9em;
    font-weight: 500;
  }
  
  .battle-summary {
    margin-top: 0.5em;
    border: 1px dashed #e0e0e0;
    border-radius: 0.3em;
    padding: 0.8em;
    background-color: rgba(0, 0, 0, 0.02);
    text-align: center;
  }
  
  .summary {
    font-size: 0.9em;
  }
  
  .summary p {
    margin: 0 0 0.5em 0;
  }
  
  .summary p:last-child {
    margin-bottom: 0;
  }
  
  .estimate {
    font-style: italic;
    color: #666;
  }
  
  .button-row {
    display: flex;
    justify-content: space-between;
    gap: 0.8em;
    margin-top: 1em;
  }
  
  .cancel-btn, .join-btn {
    flex: 1;
    padding: 0.8em 1em;
    border-radius: 0.3em;
    border: none;
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
  
  .cancel-btn:hover {
    background-color: #e8eaed;
  }
  
  .join-btn {
    background-color: #8B0000;
    color: white;
  }
  
  .join-btn:hover:not(:disabled) {
    background-color: #7b0000;
  }
  
  .join-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  @media (max-width: 768px) {
    .popup {
      width: 95%;
      max-width: 95%;
      max-height: 80vh;
    }
    
    .battle-sides {
      flex-direction: column;
    }
    
    .vs {
      padding: 0.3em 0;
    }
    
    .sides-container {
      flex-direction: column;
    }
    
    .button-row {
      flex-direction: column;
    }
  }
</style>
