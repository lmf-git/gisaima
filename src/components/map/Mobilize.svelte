<script>
  import { fade, scale } from 'svelte/transition';
  import { currentPlayer, game, formatTimeUntilNextTick, timeUntilNextTick } from '../../lib/stores/game';
  import Close from '../icons/Close.svelte';
  import Human from '../icons/Human.svelte';
  import Elf from '../icons/Elf.svelte';
  import Dwarf from '../icons/Dwarf.svelte';
  import Goblin from '../icons/Goblin.svelte';
  import Fairy from '../icons/Fairy.svelte';
  // Import functions and httpsCallable directly
  import { functions } from "../../lib/firebase/firebase";
  import { httpsCallable } from "firebase/functions";

  // Props with default empty object - removed onMobilize
  const { tile = {}, onClose = () => {} } = $props();
  
  // Format text for display
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Available units for mobilization
  let availableUnits = $state([]);
  // Selected units to mobilize
  let selectedUnits = $state([]);
  // Include player in mobilization
  let includePlayer = $state(true);
  // Group name
  let groupName = $state("New Force");
  
  // Initialize available units based on tile content
  $effect(() => {
    if (!tile) return;
    
    const units = [];
    const playerId = $currentPlayer?.uid;
    
    // Check for groups owned by the player on this tile
    if (tile.groups && tile.groups.length > 0) {
      tile.groups.forEach(group => {
        if (group.owner === playerId && group.status !== 'mobilizing' && group.status !== 'moving') {
          // Extract individual units from each group
          if (group.units) {
            group.units.forEach(unit => {
              // Skip player units, we'll handle those separately
              if (unit.type !== 'player') {
                units.push({
                  ...unit,
                  group: group.name || group.id,
                  selected: false
                });
              }
            });
          }
        }
      });
    }
    
    // Check if the player themselves is on this tile
    const playerOnTile = tile.players?.some(p => p.id === playerId);
    
    // Only enable includePlayer if player is on this tile
    includePlayer = playerOnTile;
    
    availableUnits = units;
  });
  
  // Toggle unit selection
  function toggleUnit(unitId) {
    availableUnits = availableUnits.map(unit => {
      if (unit.id === unitId) {
        return { ...unit, selected: !unit.selected };
      }
      return unit;
    });
    
    // Update selectedUnits based on selection
    selectedUnits = availableUnits.filter(u => u.selected);
  }

  // Add keyboard handling for unit item selection
  function handleUnitKeyDown(event, unitId) {
    // Handle Enter or Space key to toggle selection
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleUnit(unitId);
    }
  }
  
  // Function to handle mobilization
  async function startMobilization() {
    const selectedUnitIds = availableUnits
      .filter(u => u.selected)
      .map(u => u.id);
    
    // Check if we're mobilizing anything
    if (selectedUnitIds.length === 0 && !includePlayer) {
      // Nothing to mobilize
      return;
    }

    try {
      console.log("Preparing mobilization request with:", {
        worldId: $game.currentWorld,
        tileX: tile.x,
        tileY: tile.y,
        units: selectedUnitIds,
        includePlayer,
        name: groupName,
        race: $currentPlayer?.race
      });
      
      // First ensure we have a current user
      if (!$currentPlayer || !$currentPlayer.uid) {
        alert('You must be logged in to mobilize units.');
        return;
      }
      
      // Call function directly instead of using the wrapper
      const startMobilizationFn = httpsCallable(functions, 'startMobilization');
      const result = await startMobilizationFn({
        worldId: $game.currentWorld,
        tileX: tile.x,
        tileY: tile.y,
        units: selectedUnitIds,
        includePlayer,
        name: groupName,
        race: $currentPlayer?.race
      });
      
      console.log('Mobilization result:', result.data);
      onClose(); // Close only after success
    } catch (error) {
      console.error("Exception in startMobilization:", error);
      alert(`Error: ${error.message || 'Unknown error occurred'}`);
    }
  }
  
  // Helper to check if mobilization is possible
  let canMobilize = $derived(
    (selectedUnits.length > 0) || 
    (includePlayer && tile?.players?.some(p => p.id === $currentPlayer?.uid))
  );

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
</script>

<svelte:window onkeydown={handleKeyDown} />

<dialog 
     class="overlay"
     open
     aria-modal="true" 
     aria-labelledby="mobilize-title"
     transition:fade={{ duration: 200 }}>
  
  <section 
       class="popup"
       role="document" 
       transition:scale={{ start: 0.95, duration: 200 }}>
    <div class="header">
      <h2 id="mobilize-title">Mobilize Forces - {tile?.x}, {tile?.y}</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close mobilize dialog">
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
      
      <div class="mobilize-content">
        <div class="group-details">
          <div class="option-row">
            <label for="group-name" class="full-width">
              <span>Group Name:</span>
              <input 
                type="text" 
                id="group-name" 
                bind:value={groupName} 
                placeholder="Enter group name"
                class="text-input"
              />
            </label>
          </div>
        </div>
        
        <div class="options">
          {#if tile.players?.some(p => p.id === $currentPlayer?.uid)}
            <div class="option-row">
              <label for="include-player">
                <input 
                  type="checkbox" 
                  id="include-player" 
                  bind:checked={includePlayer} 
                />
                Include yourself in mobilization
              </label>
            </div>
          {/if}
          
          <div class="mobilization-info">
            <p>
              Selected units will form a new group at this location.
              <br>
              Mobilization will complete on the next world update
              <span class="next-tick-time">({$timeUntilNextTick})</span>
            </p>
          </div>
        </div>
        
        {#if availableUnits.length > 0}
          <div class="units-section">
            <h3>Available Units</h3>
            <div class="units-list">
              {#each availableUnits as unit}
                <div 
                  class="unit-item" 
                  class:selected={unit.selected}
                  onclick={() => toggleUnit(unit.id)}
                  onkeydown={(e) => handleUnitKeyDown(e, unit.id)}
                  role="button"
                  tabindex="0"
                  aria-pressed={unit.selected}
                  aria-label={`Select ${unit.name || unit.id}`}
                >
                  <input 
                    type="checkbox" 
                    checked={unit.selected} 
                    id={`unit-${unit.id}`}
                    tabindex="-1"
                  />
                  <div class="unit-icon">
                    {#if unit.race}
                      {#if unit.race.toLowerCase() === 'human'}
                        <Human extraClass="race-icon-small" />
                      {:else if unit.race.toLowerCase() === 'elf'}
                        <Elf extraClass="race-icon-small" />
                      {:else if unit.race.toLowerCase() === 'dwarf'}
                        <Dwarf extraClass="race-icon-small" />
                      {:else if unit.race.toLowerCase() === 'goblin'}
                        <Goblin extraClass="race-icon-small" />
                      {:else if unit.race.toLowerCase() === 'fairy'}
                        <Fairy extraClass="race-icon-small" />
                      {/if}
                    {/if}
                  </div>
                  <div class="unit-info">
                    <div class="unit-name">{unit.name || unit.id}</div>
                    <div class="unit-details">
                      {#if unit.race}
                        <span class="race-tag">{_fmt(unit.race)}</span>
                      {/if}
                      {#if unit.strength}
                        <span class="strength-tag">STR: {unit.strength}</span>
                      {/if}
                      {#if unit.group}
                        <span class="group-tag">From: {unit.group}</span>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <div class="no-units">
            <p>You have no units that can be mobilized at this location.</p>
          </div>
        {/if}
        
        <div class="summary">
          <h3>Summary</h3>
          <p>
            Units selected: {selectedUnits.length}
            {#if includePlayer && tile?.players?.some(p => p.id === $currentPlayer?.uid)}
              + You
            {/if}
          </p>
        </div>
        
        <div class="button-row">
          <button 
            class="cancel-btn" 
            onclick={onClose}
          >
            Cancel
          </button>
          <button 
            class="mobilize-btn" 
            disabled={!canMobilize}
            onclick={startMobilization}
          >
            Mobilize Forces
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
    z-index: -1; /* Behind the popup but above the overlay backdrop */
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
    max-width: 30em;
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
  
  .mobilize-content {
    padding: 1em;
    display: flex;
    flex-direction: column;
    gap: 1em;
    max-height: 60vh;
    overflow-y: auto;
  }
  
  .group-details {
    padding-bottom: 1em;
    border-bottom: 1px solid #e0e0e0;
  }
  
  .text-input {
    flex: 1;
    padding: 0.5em;
    border: 1px solid #ccc;
    border-radius: 0.3em;
    font-family: var(--font-body);
  }
  
  .full-width {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.5em;
  }
  
  .units-section {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    max-height: 30vh;
    overflow-y: auto;
    padding: 0.5em 0;
    border-bottom: 1px solid #e0e0e0;
  }
  
  .units-list {
    display: flex;
    flex-direction: column;
    gap: 0.4em;
  }
  
  .unit-item {
    display: flex;
    align-items: center;
    padding: 0.6em 0.8em;
    border: 1px solid #e0e0e0;
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .unit-item:hover {
    background-color: #f9f9f9;
  }
  
  .unit-item.selected {
    background-color: rgba(30, 144, 255, 0.1);
    border-color: rgba(30, 144, 255, 0.3);
  }
  
  .unit-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 0.6em;
  }
  
  .unit-info {
    flex: 1;
  }
  
  .unit-name {
    font-weight: 500;
    margin-bottom: 0.2em;
  }
  
  .unit-details {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
    font-size: 0.8em;
  }
  
  .race-tag, .strength-tag, .group-tag {
    padding: 0.1em 0.4em;
    border-radius: 0.2em;
    background-color: rgba(0, 0, 0, 0.06);
    color: rgba(0, 0, 0, 0.7);
  }
  
  .strength-tag {
    color: #b71c1c;
    background-color: rgba(183, 28, 28, 0.06);
  }
  
  .group-tag {
    color: #0d47a1;
    background-color: rgba(13, 71, 161, 0.06);
  }
  
  .summary {
    margin-top: 1em;
    padding: 1em;
    background-color: rgba(0, 0, 0, 0.03);
    border-radius: 0.3em;
  }
  
  .summary h3 {
    margin: 0 0 0.5em 0;
    font-size: 1em;
  }
  
  .summary p {
    margin: 0;
    font-weight: 500;
  }
  
  .options {
    display: flex;
    flex-direction: column;
    gap: 0.8em;
    padding-top: 1em;
    border-top: 1px solid #e0e0e0;
  }
  
  .option-row {
    display: flex;
    align-items: center;
    gap: 0.5em;
    margin-bottom: 0.6em;
  }
  
  .option-row label {
    display: flex;
    align-items: center;
    gap: 0.5em;
    cursor: pointer;
    flex: 1;
  }
  
  input[type="checkbox"] {
    width: 1.2em;
    height: 1.2em;
  }
  
  .mobilization-info {
    padding: 0.8em;
    background-color: rgba(66, 133, 244, 0.08);
    border-radius: 0.3em;
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.7);
    line-height: 1.4;
    margin: 0.5em 0;
    border-left: 3px solid rgba(66, 133, 244, 0.5);
  }
  
  .mobilization-info p {
    margin: 0;
  }

  .next-tick-time {
    font-family: var(--font-mono, monospace);
    font-weight: 500;
    color: var(--color-bright-accent);
  }
  
  .button-row {
    display: flex;
    justify-content: flex-end;
    gap: 0.8em;
    margin-top: 1.5em;
  }
  
  .cancel-btn, .mobilize-btn {
    padding: 0.7em 1.2em;
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
  
  .mobilize-btn {
    background-color: #4285f4;
    color: white;
  }
  
  .mobilize-btn:hover:not(:disabled) {
    background-color: #3367d6;
  }
  
  .mobilize-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .no-units, .no-tile {
    text-align: center;
    padding: 2em 0;
    color: #666;
    font-style: italic;
  }
  
  @media (max-width: 480px) {
    .popup {
      width: 95%;
      max-height: 80vh;
    }
    
    h2 {
      font-size: 1.1em;
    }
    
    .button-row {
      flex-direction: column;
    }
    
    .button-row button {
      width: 100%;
    }
  }
</style>
