<script>
  import { fade, scale } from 'svelte/transition';
  import { currentPlayer, game, formatTimeUntilNextTick, timeUntilNextTick } from '../../lib/stores/game';
  import { highlightedStore, targetStore } from '../../lib/stores/map';
  import Close from '../icons/Close.svelte';
  import Human from '../icons/Human.svelte';
  import Elf from '../icons/Elf.svelte';
  import Dwarf from '../icons/Dwarf.svelte';
  import Goblin from '../icons/Goblin.svelte';
  import Fairy from '../icons/Fairy.svelte';
  import { getFunctions, httpsCallable } from 'firebase/functions';

  const { 
    onClose = () => {}
  } = $props();

  let tileData = $derived($targetStore || null);

  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  let availableUnits = $state([]);
  let selectedUnits = $state([]);
  let includePlayer = $state(true);
  // Initialize with empty string and will set later in effect
  let groupName = $state("");
  let mobilizeError = $state(null);
  let processing = $state(false);

  // Set default group name when component loads, based on player's name
  $effect(() => {
    if ($currentPlayer?.displayName) {
      groupName = `${$currentPlayer.displayName}'s Force`;
    } else {
      groupName = "New Force";
    }
  });

  function isPlayerOnTile(tile, playerId) {
    if (!tile || !tile.players) return false;
    
    if (Array.isArray(tile.players)) {
      return tile.players.some(p => p.id === playerId);
    } else if (typeof tile.players === 'object') {
      return Object.values(tile.players).some(p => p.id === playerId);
    }
    
    return false;
  }

  $effect(() => {
    if (!tileData) return;
    
    const units = [];
    const playerId = $currentPlayer?.id;
    
    if (tileData.groups && tileData.groups.length > 0) {
      tileData.groups.forEach(group => {
        if (group.owner === playerId && group.status !== 'mobilizing' && group.status !== 'moving') {
          if (group.units) {
            group.units.forEach(unit => {
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
    
    if (!$currentPlayer) {
      mobilizeError = 'You need to be logged in to mobilise units.';
      return;
    }
    
    if (!isPlayerOnTile(tileData, $currentPlayer.id)) {
      console.warn('Player not found on tile. Players data:', tileData.players);
      mobilizeError = 'Player not found on this tile.';
      return;
    }
    
    includePlayer = isPlayerOnTile(tileData, playerId);
    availableUnits = units;
  });
  
  function toggleUnit(unitId) {
    availableUnits = availableUnits.map(unit => {
      if (unit.id === unitId) {
        return { ...unit, selected: !unit.selected };
      }
      return unit;
    });
    
    selectedUnits = availableUnits.filter(u => u.selected);
  }

  function handleUnitKeyDown(event, unitId) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleUnit(unitId);
    }
  }
  
  async function startMobilization() {
    if (mobilizeError || (selectedUnits.length === 0 && !includePlayer)) {
      return;
    }

    mobilizeError = null;
    processing = true;
    
    try {
      console.log("Preparing mobilization request with:", {
        worldId: $game.worldKey,
        tileX: tileData.x,
        tileY: tileData.y,
        units: selectedUnits.map(u => u.id),
        includePlayer,
        name: groupName,
        race: $currentPlayer?.race
      });
      
      const mobilizeFn = httpsCallable(getFunctions(), 'mobiliseUnits');
      
      const result = await mobilizeFn({
        worldId: $game.worldKey,
        tileX: tileData.x,
        tileY: tileData.y,
        units: selectedUnits.map(u => u.id),
        includePlayer,
        name: groupName,
        race: $currentPlayer?.race
      });
      
      console.log('Mobilization result:', result.data);
      onClose();
    } catch (error) {
      console.error('Error during mobilization:', error);
      if (error.code === 'unauthenticated') {
         mobilizeError = 'Authentication error: Please log in again.';
      } else {
         mobilizeError = error.message || "Failed to mobilise forces";
      }
    } finally {
      processing = false;
    }
  }
  
  let canMobilize = $derived(
    (selectedUnits.length > 0) || 
    (includePlayer && (
      Array.isArray(tileData?.players)
        ? tileData.players.some(p => p.id === $currentPlayer?.id || p.id === $currentPlayer?.id)
        : tileData?.players && (
            tileData.players[$currentPlayer?.id] !== undefined || 
            Object.values(tileData.players).some(p => p.id === $currentPlayer?.id || p.id === $currentPlayer?.id)
          )
    ))
  );

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose();
    }
    
    if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
      event.preventDefault();
    }
  }
  
  function toggleCheckbox() {
    includePlayer = !includePlayer;
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div 
  class="mobilise-modal" 
  transition:scale={{ start: 0.95, duration: 200 }}>
  
  <header class="modal-header">
    <h2 id="mobilise-title">Mobilise Forces - {tileData?.x}, {tileData?.y}</h2>
    <button class="close-btn" onclick={onClose} aria-label="Close mobilise dialog">
      <Close size="1.5em" />
    </button>
  </header>
  
  <div class="content">
    {#if tileData}
      <div class="location-info">
        <div class="terrain">
          <div class="terrain-color" style="background-color: {tileData.color}"></div>
          <span>{_fmt(tileData.biome?.name) || "Unknown"}</span>
          
          {#if tileData.structure}
            <span class="structure-tag">
              {tileData.structure.name || _fmt(tileData.structure.type)}
            </span>
          {/if}
        </div>
      </div>
      
      <div class="mobilise-content">
        <div class="group-details">
          <div class="group-name-row">
            <label for="group-name">Group Name:</label>
            <input 
              type="text" 
              id="group-name" 
              bind:value={groupName} 
              placeholder="Enter group name"
              class="text-input"
              onkeydown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                }
              }}
            />
          </div>
        </div>
        
        <div class="options">
          {#if Array.isArray(tileData?.players)
              ? tileData.players.some(p => p.id === $currentPlayer?.id || p.id === $currentPlayer?.id)
              : tileData?.players && (
                  tileData.players[$currentPlayer?.id] !== undefined || 
                  Object.values(tileData.players).some(p => p.id === $currentPlayer?.id || p.id === $currentPlayer?.id)
                )}
            <div class="option-row">
              <label class="custom-checkbox-label" for="include-player">
                <div 
                  class="custom-checkbox" 
                  class:checked={includePlayer}
                  onclick={toggleCheckbox}
                  tabindex="0"
                  role="checkbox"
                  aria-checked={includePlayer}
                  onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? toggleCheckbox() : null}
                >
                  {#if includePlayer}
                    <svg viewBox="0 0 24 24" class="checkbox-icon">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  {/if}
                </div>
                <input 
                  type="checkbox" 
                  id="include-player" 
                  bind:checked={includePlayer} 
                  class="visually-hidden"
                />
                <span class="checkbox-text">Include yourself in mobilization</span>
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
        
        {#if mobilizeError}
          <div class="mobilise-error">
            {mobilizeError}
          </div>
        {/if}
        
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
                  <div class="custom-checkbox" class:checked={unit.selected}>
                    {#if unit.selected}
                      <svg viewBox="0 0 24 24" class="checkbox-icon">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    {/if}
                  </div>
                  <input 
                    type="checkbox" 
                    checked={unit.selected} 
                    id={`unit-${unit.id}`}
                    tabindex="-1"
                    class="visually-hidden"
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
            {#if includePlayer && tileData?.players?.some(p => p.id === $currentPlayer?.id)}
              + You
            {/if}
          </p>
        </div>
        
        <div class="button-row">
          <button 
            class="cancel-btn" 
            onclick={onClose}
            disabled={processing}
          >
            Cancel
          </button>
          <button 
            class="mobilise-btn" 
            disabled={!canMobilize || processing}
            onclick={startMobilization}
          >
            {processing ? 'Processing...' : 'Mobilise Forces'}
          </button>
        </div>
      </div>
    {:else}
      <p class="no-tile">No tile selected</p>
    {/if}
  </div>
</div>

<style>
  .mobilise-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 36em;
    max-height: 90vh;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 0.5em;
    box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.3);
    overflow: hidden;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    font-family: var(--font-body);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
  }
  
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.8em 1em;
    background: rgba(0, 0, 0, 0.05);
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  h2 {
    margin: 0;
    font-size: 1.3em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.8);
    font-family: var(--font-heading);
  }
  
  .content {
    padding: 1em;
    overflow-y: auto;
    max-height: calc(90vh - 4em);
    color: rgba(0, 0, 0, 0.8);
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
    padding-bottom: 1em;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    margin-bottom: 1em;
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
  
  .mobilise-content {
    display: flex;
    flex-direction: column;
    gap: 1em;
  }
  
  .group-details {
    padding-bottom: 1em;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  .group-name-row {
    display: flex;
    align-items: center;
    gap: 1em;
    width: 100%;
  }

  .group-name-row label {
    font-weight: 500;
    min-width: 6em;
    color: rgba(0, 0, 0, 0.8);
  }
  
  .text-input {
    flex: 1;
    padding: 0.7em;
    border: 1px solid #ccc;
    border-radius: 0.3em;
    font-family: var(--font-body);
    font-size: 0.95em;
    background-color: rgba(255, 255, 255, 0.7);
    transition: all 0.2s ease;
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);
    color: rgba(0, 0, 0, 0.8);
  }
  
  .text-input:focus {
    outline: none;
    border-color: #4285f4;
    box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.2);
    background-color: #fff;
  }
  
  .visually-hidden {
    border: 0;
    clip: rect(0 0 0 0);
    height: 1px;
    margin: -1px;
    overflow: hidden;
    padding: 0;
    position: absolute;
    width: 1px;
  }
  
  .custom-checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5em;
    cursor: pointer;
    user-select: none;
  }
  
  .custom-checkbox {
    width: 1.2em;
    height: 1.2em;
    border: 2px solid rgba(0, 0, 0, 0.5);
    border-radius: 0.2em;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    background-color: rgba(255, 255, 255, 0.5);
    position: relative;
    flex-shrink: 0;
    cursor: pointer;
  }
  
  .custom-checkbox:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.4);
  }
  
  .custom-checkbox.checked {
    background-color: #4285f4;
    border-color: #4285f4;
  }
  
  .checkbox-icon {
    width: 100%;
    height: 100%;
    fill: white;
  }
  
  .checkbox-text {
    color: rgba(0, 0, 0, 0.85);
    font-weight: 500;
  }
  
  .units-section {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    max-height: 30vh;
    overflow-y: auto;
    padding: 0.5em 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
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
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s;
    background-color: rgba(255, 255, 255, 0.5);
  }
  
  .unit-item:hover {
    background-color: rgba(255, 255, 255, 0.8);
  }
  
  .unit-item.selected {
    background-color: rgba(66, 133, 244, 0.1);
    border-color: rgba(66, 133, 244, 0.3);
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
    color: rgba(0, 0, 0, 0.85);
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
    color: rgba(0, 0, 0, 0.85);
  }
  
  .summary h3 {
    margin: 0 0 0.5em 0;
    font-size: 1em;
    color: rgba(0, 0, 0, 0.7);
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
    border-top: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  .option-row {
    display: flex;
    align-items: center;
    gap: 0.5em;
    margin-bottom: 0.6em;
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
  
  .mobilise-error {
    background-color: rgba(255, 0, 0, 0.1);
    border: 1px solid rgba(255, 0, 0, 0.3);
    color: #ff5757;
    padding: 0.8em;
    margin: 1em 0;
    border-radius: 0.3em;
    font-size: 0.9em;
  }
  
  .button-row {
    display: flex;
    justify-content: flex-end;
    gap: 0.8em;
    margin-top: 1.5em;
  }
  
  .cancel-btn, .mobilise-btn {
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
  
  .cancel-btn:hover {
    background-color: #e8eaed;
  }
  
  .mobilise-btn {
    background-color: #4285f4;
    color: white;
    border: none;
  }
  
  .mobilise-btn:hover:not(:disabled) {
    background-color: #3367d6;
  }
  
  .mobilise-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .no-units, .no-tile {
    text-align: center;
    padding: 2em 0;
    color: rgba(0, 0, 0, 0.6);
    font-style: italic;
  }
  
  h3 {
    margin: 0 0 0.8em 0;
    font-size: 1.1em;
    font-weight: 500;
    color: rgba(0, 0, 0, 0.7);
  }
  
  @media (max-width: 480px) {
    .mobilise-modal {
      width: 95%;
      max-height: 80vh;
    }
    
    h2 {
      font-size: 1.1em;
    }
    
    .group-name-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5em;
    }
    
    .button-row {
      flex-direction: column;
    }
    
    .button-row button {
      width: 100%;
    }
  }
</style>
