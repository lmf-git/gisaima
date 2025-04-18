<script>
  import { fade, scale } from 'svelte/transition';
  import { currentPlayer, game, formatTimeUntilNextTick, timeUntilNextTick } from '../../lib/stores/game';
  import Close from '../icons/Close.svelte';
  import Human from '../icons/Human.svelte';
  import Elf from '../icons/Elf.svelte';
  import Dwarf from '../icons/Dwarf.svelte';
  import Goblin from '../icons/Goblin.svelte';
  import Fairy from '../icons/Fairy.svelte';
  import { getFunctions, httpsCallable } from 'firebase/functions';

  const { tile = {}, onClose = () => {}, onDemobilize = () => {} } = $props();
  
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  let availableGroups = $state([]);
  let selectedGroup = $state(null);
  let selectedStorageDestination = $state('shared');
  let error = $state(null);
  let isLoading = $state(false);
  
  const functions = getFunctions();
  
  $effect(() => {
    if (!tile) return;
    
    const groups = [];
    const playerId = $currentPlayer?.uid;
    
    if (tile.groups && tile.groups.length > 0 && tile.structure) {
      tile.groups.forEach(group => {
        if (group.owner === playerId && 
            group.status !== 'mobilizing' && 
            group.status !== 'moving' && 
            group.status !== 'demobilising') {
          groups.push({
            ...group,
            selected: false
          });
        }
      });
    }
    
    availableGroups = groups;
    selectedGroup = null;
    error = null;
  });
  
  function selectGroup(groupId) {
    availableGroups = availableGroups.map(group => {
      return {
        ...group,
        selected: group.id === groupId
      };
    });
    
    selectedGroup = availableGroups.find(g => g.id === groupId) || null;
  }

  function handleGroupKeyDown(event, groupId) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectGroup(groupId);
    }
  }
  
  async function startDemobilization() {
    if (!selectedGroup || !tile?.structure) {
      error = "Please select a group and ensure there's a structure.";
      return;
    }
    
    if (!selectedGroup.id) {
      error = "Invalid group selection. Group ID is missing.";
      return;
    }
    
    if (typeof tile.x === 'undefined' || typeof tile.y === 'undefined') {
      error = "Location coordinates are invalid.";
      return;
    }
    
    if (!$game?.currentWorld) {
      error = "World information is missing.";
      return;
    }
    
    error = null;
    isLoading = true;
    
    try {
      const demobiliseFn = httpsCallable(functions, 'demobiliseUnits');
      
      const params = {
        groupId: selectedGroup.id,
        locationX: tile.x,
        locationY: tile.y,
        worldId: $game.currentWorld,
        storageDestination: selectedStorageDestination
      };
      
      console.log('Calling demobiliseUnits with params:', params);
      
      const result = await demobiliseFn(params);
      
      console.log('Demobilization started:', result.data);
      
      const message = document.createElement('div');
      message.className = 'success-toast';
      message.textContent = 'Demobilization started!';
      document.body.appendChild(message);
      
      setTimeout(() => {
        message.classList.add('fade-out');
        setTimeout(() => message.remove(), 500);
      }, 2000);
      
      if (onDemobilize) {
        onDemobilize(true);
      }
      
      onClose();
      
    } catch (err) {
      console.error('Error during demobilization:', err);
      error = err.message || 'Failed to start demobilization';
    } finally {
      isLoading = false;
    }
  }
  
  let canDemobilize = $derived(selectedGroup !== null && !isLoading);

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose();
    }
  }

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
     aria-labelledby="demobilize-title"
     transition:fade={{ duration: 200 }}>
  
  <section 
       class="popup"
       role="document" 
       transition:scale={{ start: 0.95, duration: 200 }}>
    <div class="header">
      <h2 id="demobilize-title">Demobilize Group - {tile?.x}, {tile?.y}</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close demobilize dialog">
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
      
      <div class="demobilize-content">
        <div class="demobilize-info">
          <p>Select a group to demobilize into {tile.structure?.name || _fmt(tile.structure?.type) || "this structure"}.</p>
          <p class="note">
            Units will be marked as "demobilising" until the next world tick.
            Demobilization time varies based on world speed.
          </p>
        </div>
        
        <div class="demobilization-info">
          <p>
            The group will be disbanded and units will return to this structure.
            <br>
            Demobilization will complete on the next world update
            <span class="next-tick-time">({$timeUntilNextTick})</span>
          </p>
        </div>
        
        {#if error}
          <div class="error-message">
            <p>{error}</p>
          </div>
        {/if}
        
        {#if availableGroups.length > 0}
          <div class="groups-section">
            <h3>Available Groups</h3>
            <div class="groups-list">
              {#each availableGroups as group}
                <div 
                  class="group-item" 
                  class:selected={group.selected}
                  onclick={() => selectGroup(group.id)}
                  onkeydown={(e) => handleGroupKeyDown(e, group.id)}
                  role="button"
                  tabindex="0"
                  aria-pressed={group.selected}
                  aria-label={`Select ${group.name || group.id}`}
                >
                  <input 
                    type="radio" 
                    checked={group.selected} 
                    name="group-selection"
                    id={`group-${group.id}`}
                    tabindex="-1"
                  />
                  <div class="group-info">
                    <div class="group-name">{group.name || `Group ${group.id.slice(-4)}`}</div>
                    <div class="group-details">
                      {#if group.race}
                        <span class="race-tag">{_fmt(group.race)}</span>
                      {/if}
                      {#if group.unitCount || (group.units && group.units.length)}
                        <span class="unit-count">Units: {group.unitCount || group.units.length}</span>
                      {/if}
                      {#if group.items && Object.keys(group.items).length > 0}
                        <span class="item-count">Items: {Object.keys(group.items).length}</span>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
          
          {#if availableGroups.some(group => group.items && Object.keys(group.items).length > 0)}
            <div class="storage-selection">
              <h3>Storage Destination</h3>
              <div class="storage-options">
                <label class="storage-option">
                  <input 
                    type="radio" 
                    name="storage" 
                    value="shared" 
                    checked={selectedStorageDestination === 'shared'} 
                    onchange={() => selectedStorageDestination = 'shared'}
                  />
                  <div class="storage-info">
                    <div class="storage-name">Shared Storage</div>
                    <div class="storage-desc">Items available to all structure users</div>
                  </div>
                </label>
                
                <label class="storage-option">
                  <input 
                    type="radio" 
                    name="storage" 
                    value="personal" 
                    checked={selectedStorageDestination === 'personal'} 
                    onchange={() => selectedStorageDestination = 'personal'}
                  />
                  <div class="storage-info">
                    <div class="storage-name">Personal Bank</div>
                    <div class="storage-desc">Items only accessible by you</div>
                  </div>
                </label>
              </div>
            </div>
          {/if}
        {:else}
          <div class="no-groups">
            <p>You have no groups that can be demobilized at this location.</p>
            <p>Groups may only be demobilized at structures.</p>
          </div>
        {/if}
        
        <div class="button-row">
          <button 
            class="cancel-btn" 
            onclick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button 
            class="demobilize-btn" 
            disabled={!canDemobilize}
            onclick={startDemobilization}
          >
            {isLoading ? 'Processing...' : 'Demobilize Group'}
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
  
  .demobilize-content {
    padding: 1em;
    display: flex;
    flex-direction: column;
    gap: 1em;
    overflow: auto;
  }
  
  .demobilize-info {
    padding: 0.8em;
    background-color: rgba(147, 112, 219, 0.08);
    border-radius: 0.3em;
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.7);
    line-height: 1.4;
    border-left: 3px solid rgba(147, 112, 219, 0.5);
  }
  
  .demobilize-info p {
    margin: 0 0 0.5em 0;
  }
  
  .demobilize-info p:last-child {
    margin-bottom: 0;
  }
  
  .note {
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.6);
    font-style: italic;
  }

  .demobilization-info {
    padding: 0.8em;
    background-color: rgba(147, 112, 219, 0.08);
    border-radius: 0.3em;
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.7);
    line-height: 1.4;
    border-left: 3px solid rgba(147, 112, 219, 0.5);
  }

  .demobilization-info p {
    margin: 0;
  }

  .next-tick-time {
    font-family: var(--font-mono, monospace);
    font-weight: 500;
    color: var(--color-bright-accent);
  }

  .groups-section {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    max-height: 40vh; /* Increased from 30vh for a larger scroll area */
    overflow-y: auto;
    padding: 0.5em 0;
    border-bottom: 1px solid #e0e0e0;
  }
  
  .groups-list {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    padding-right: 0.5em; /* Add padding for scrollbar to avoid content being cut off */
  }
  
  .group-item {
    display: flex;
    align-items: center;
    padding: 0.6em 0.8em;
    border: 1px solid #e0e0e0;
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .group-item:hover {
    background-color: #f9f9f9;
  }
  
  .group-item.selected {
    background-color: rgba(147, 112, 219, 0.1);
    border-color: rgba(147, 112, 219, 0.3);
  }
  
  .group-info {
    flex: 1;
    margin-left: 0.8em;
  }
  
  .group-name {
    font-weight: 500;
    margin-bottom: 0.2em;
  }
  
  .group-details {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
    font-size: 0.9em;
    color: #555;
  }
  
  .race-tag {
    padding: 0.1em 0.4em;
    border-radius: 0.2em;
    background-color: rgba(0, 0, 0, 0.06);
    color: rgba(0, 0, 0, 0.7);
  }
  
  .unit-count {
    color: rgba(0, 0, 0, 0.7);
  }
  
  .item-count {
    color: #2d8659;
    font-weight: 500;
    padding: 0.1em 0.4em;
    border-radius: 0.2em;
    background-color: rgba(45, 134, 89, 0.1);
    border: 1px solid rgba(45, 134, 89, 0.2);
  }
  
  .storage-selection {
    padding: 1em 0;
  }
  
  .storage-options {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
  }
  
  .storage-option {
    display: flex;
    align-items: center;
    padding: 0.6em 0.8em;
    border: 1px solid #e0e0e0;
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .storage-option:hover {
    background-color: #f9f9f9;
  }
  
  .storage-option input {
    margin-right: 0.6em;
  }
  
  .storage-info {
    display: flex;
    flex-direction: column;
  }
  
  .storage-name {
    font-weight: 500;
  }
  
  .storage-desc {
    font-size: 0.8em;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .button-row {
    display: flex;
    justify-content: flex-end;
    gap: 0.8em;
    margin-top: 1.5em;
  }
  
  .cancel-btn, .demobilize-btn {
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
  
  .demobilize-btn {
    background-color: #8a2be2;
    color: white;
  }
  
  .demobilize-btn:hover:not(:disabled) {
    background-color: #7b1fa2;
  }
  
  .demobilize-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .no-groups, .no-tile {
    text-align: center;
    padding: 2em 0;
    color: #666;
    font-style: italic;
  }

  .error-message {
    padding: 0.8em;
    background-color: rgba(255, 0, 0, 0.1);
    border: 1px solid rgba(255, 0, 0, 0.3);
    color: #ff5757;
    border-radius: 0.3em;
    margin: 0.5em 0;
    font-size: 0.9em;
  }
  
  .error-message p {
    margin: 0;
  }
  
  :global(.success-toast) {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(46, 204, 113, 0.9);
    color: white;
    padding: 10px 20px;
    border-radius: 4px;
    z-index: 10000;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    font-family: var(--font-heading);
    animation: fadeIn 0.3s ease-out;
  }
  
  :global(.success-toast.fade-out) {
    animation: fadeOut 0.5s ease-out forwards;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translate(-50%, -20px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }
  
  @keyframes fadeOut {
    from { opacity: 1; transform: translate(-50%, 0); }
    to { opacity: 0; transform: translate(-50%, -20px); }
  }
  
  @media (max-width: 480px) {
    .popup {
      width: 95%;
      max-height: 85vh; /* Slightly increased for mobile */
    }
    
    .demobilize-content {
      height: 70vh; /* Adjust height for mobile screens */
    }
    
    .groups-section {
      max-height: 45vh; /* Even taller on mobile where vertical space is limited */
    }
    
    .button-row {
      flex-direction: column;
    }
    
    .button-row button {
      width: 100%;
    }
  }
  
  @media (min-height: 800px) {
    .groups-section {
      max-height: 50vh; /* More space on taller screens */
    }
  }
</style>
