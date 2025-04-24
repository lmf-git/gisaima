<script>
  import { fade, scale } from 'svelte/transition';
  import { currentPlayer, game, formatTimeUntilNextTick, timeUntilNextTick } from '../../lib/stores/game';
  import { highlightedStore, targetStore } from '../../lib/stores/map';
  import Close from '../icons/Close.svelte';
  import Structure from '../icons/Structure.svelte';
  import { getFunctions, httpsCallable } from 'firebase/functions';

  const { 
    onClose = () => {},
    onBuild = () => {}
  } = $props();

  let tileData = $derived($targetStore || null);

  const _fmt = t => {
    if (typeof t !== 'string') return t || '';
    return t.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };
  
  // Available structure templates
  let structureOptions = $state([
    {
      id: 'outpost',
      name: 'Outpost',
      description: 'A small defensive position that allows scouting and monitoring of the area',
      requiredResources: [
        { name: 'Wooden Sticks', quantity: 5, type: 'resource' },
        { name: 'Stone Pieces', quantity: 3, type: 'resource' }
      ],
      buildTime: 1, // in ticks
      capacity: 10,
      features: [
        {
          name: 'Lookout',
          description: 'Allows spotting of approaching forces',
          icon: '👁️'
        }
      ]
    },
    {
      id: 'stronghold',
      name: 'Stronghold',
      description: 'A fortified position that provides protection and resources',
      requiredResources: [
        { name: 'Wooden Sticks', quantity: 10, type: 'resource' },
        { name: 'Stone Pieces', quantity: 8, type: 'resource' }
      ],
      buildTime: 2, // in ticks
      capacity: 30,
      features: [
        {
          name: 'Forge',
          description: 'Allows crafting of basic items',
          icon: '🔨'
        }
      ]
    },
    {
      id: 'fortress',
      name: 'Fortress',
      description: 'A massive fortification that dominates the surrounding area',
      requiredResources: [
        { name: 'Wooden Sticks', quantity: 20, type: 'resource' },
        { name: 'Stone Pieces', quantity: 15, type: 'resource' },
        { name: 'Mysterious Artifact', quantity: 1, type: 'artifact' }
      ],
      buildTime: 3, // in ticks
      capacity: 60,
      features: [
        {
          name: 'Armory',
          description: 'Allows crafting of advanced weapons',
          icon: '⚔️'
        },
        {
          name: 'Watchtower',
          description: 'Provides early warning of attacks',
          icon: '🏯'
        }
      ]
    }
  ]);

  // State variables
  let availableGroups = $state([]);
  let selectedGroup = $state(null);
  let selectedStructure = $state(null);
  let structureName = $state("");
  let buildError = $state(null);
  let processing = $state(false);
  let availableResources = $state({});

  // Set default structure name when component loads
  $effect(() => {
    if ($currentPlayer?.displayName && selectedStructure) {
      structureName = `${$currentPlayer.displayName}'s ${selectedStructure.name}`;
    }
  });

  $effect(() => {
    if (!tileData || !$currentPlayer) return;
    
    const groups = [];
    
    if (tileData.groups && tileData.groups.length > 0) {
      tileData.groups.forEach(group => {
        if (group.owner === $currentPlayer.id && group.status === 'idle' && !group.inBattle) {
          groups.push({
            ...group,
            selected: false
          });
        }
      });
    }
    
    availableGroups = groups;
  });

  // Update available resources when group changes
  $effect(() => {
    if (!selectedGroup) {
      availableResources = {};
      return;
    }
    
    // Aggregate resources from the selected group
    const resources = {};
    
    if (selectedGroup.items && Array.isArray(selectedGroup.items)) {
      selectedGroup.items.forEach(item => {
        if (item.type === 'resource' || item.type === 'artifact') {
          if (!resources[item.name]) {
            resources[item.name] = {
              quantity: 0,
              type: item.type,
              rarity: item.rarity || 'common'
            };
          }
          resources[item.name].quantity += item.quantity || 1;
        }
      });
    }
    
    availableResources = resources;
  });
  
  function selectGroup(group) {
    selectedGroup = group;
  }

  function selectStructure(structure) {
    selectedStructure = structure;
    
    // Update default structure name
    if ($currentPlayer?.displayName) {
      structureName = `${$currentPlayer.displayName}'s ${structure.name}`;
    }
  }

  function handleGroupKeyDown(event, group) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectGroup(group);
    }
  }
  
  function handleStructureKeyDown(event, structure) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectStructure(structure);
    }
  }
  
  async function startBuilding() {
    if (buildError || !selectedGroup || !selectedStructure || !structureName) {
      return;
    }

    buildError = null;
    processing = true;
    
    try {
      const functions = getFunctions();
      const buildFunction = httpsCallable(functions, 'buildStructure');
      
      const result = await buildFunction({
        worldId: $game.worldKey,
        groupId: selectedGroup.id,
        tileX: tileData.x,
        tileY: tileData.y,
        structureType: selectedStructure.id,
        structureName: structureName
      });
      
      if (result.data.success) {
        onBuild(result.data);
        onClose();
      } else {
        buildError = result.data.error || 'Failed to start building';
      }
    } catch (error) {
      console.error('Error during building:', error);
      buildError = error.message || 'An unexpected error occurred';
    } finally {
      processing = false;
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose();
    }
    
    if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
      event.preventDefault();
      if (canBuild) {
        startBuilding();
      }
    }
  }

  function hasRequiredResources() {
    if (!selectedStructure || !selectedGroup) return false;
    
    return selectedStructure.requiredResources.every(required => {
      const available = availableResources[required.name];
      return available && available.quantity >= required.quantity;
    });
  }
  
  let canBuild = $derived(
    selectedGroup && 
    selectedStructure && 
    structureName && 
    hasRequiredResources()
  );
</script>

<div class="build-modal" transition:scale={{ start: 0.95, duration: 200 }}>
  <header class="modal-header">
    <h2 id="build-title">Build Structure - {tileData?.x}, {tileData?.y}</h2>
    <button class="close-btn" onclick={onClose} aria-label="Close build dialog">
      <Close size="1.5em" />
    </button>
  </header>

  <div class="content">
    {#if tileData}
      <div class="location-info">
        <div class="terrain">
          <div class="attribute">
            <span class="attribute-label">Type</span>
            <span class="attribute-value">
              <span class="terrain-color" style="background-color: {tileData.color || tileData.terrain?.color || '#555'}"></span>
              {_fmt(tileData.biome.name)}
            </span>
          </div>
          
          {#if tileData.structure}
            <div class="attribute">
              <span class="attribute-label">Structure</span>
              <span class="attribute-value">
                <span class="structure-tag">
                  {tileData.structure.name || _fmt(tileData.structure.type)}
                </span>
              </span>
            </div>
          {/if}
        </div>
      </div>
      
      <div class="build-content">
        <div class="group-selection-section">
          <h3>Select a group to build</h3>
          {#if availableGroups.length > 0}
            <div class="groups-list">
              {#each availableGroups as group}
                <div 
                  class="group-item {group === selectedGroup ? 'selected' : ''}"
                  onclick={() => selectGroup(group)}
                  onkeydown={(e) => handleGroupKeyDown(e, group)}
                  tabindex="0"
                  role="button"
                  aria-pressed={group === selectedGroup}
                >
                  <div class="group-info">
                    <div class="group-name">{group.name || 'Group'}</div>
                    <div class="group-details">
                      <span class="race-tag">{_fmt(group.race || 'Unknown')}</span>
                      <span class="strength-tag">{group.unitCount || 1} units</span>
                      {#if group.items && group.items.length > 0}
                        <span class="resources-tag">{group.items.length} items</span>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="no-groups">No available groups on this tile. Groups must be idle to build.</p>
          {/if}
        </div>
        
        {#if selectedGroup}
          <div class="structure-selection-section">
            <h3>Select a structure to build</h3>
            <div class="structures-list">
              {#each structureOptions as structure}
                <div 
                  class="structure-item {structure === selectedStructure ? 'selected' : ''} {!hasRequiredResources() && structure === selectedStructure ? 'missing-resources' : ''}"
                  onclick={() => selectStructure(structure)}
                  onkeydown={(e) => handleStructureKeyDown(e, structure)}
                  tabindex="0"
                  role="button"
                  aria-pressed={structure === selectedStructure}
                >
                  <div class="structure-info">
                    <div class="structure-name">{structure.name}</div>
                    <div class="structure-description">{structure.description}</div>
                    
                    <div class="structure-features">
                      {#each structure.features as feature}
                        <div class="feature">
                          <span class="feature-icon">{feature.icon}</span>
                          <span class="feature-name">{feature.name}</span>
                        </div>
                      {/each}
                    </div>
                    
                    <div class="required-resources">
                      <div class="required-title">Required Resources:</div>
                      {#each structure.requiredResources as resource}
                        <div class="resource-requirement {availableResources[resource.name]?.quantity >= resource.quantity ? 'has-resource' : 'missing-resource'}">
                          <span class="resource-name">{resource.name}</span>
                          <span class="resource-quantity">
                            {availableResources[resource.name]?.quantity || 0}/{resource.quantity}
                          </span>
                        </div>
                      {/each}
                    </div>
                    
                    <div class="build-time">
                      Build Time: {structure.buildTime} {structure.buildTime === 1 ? 'tick' : 'ticks'}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
        
        {#if selectedStructure && selectedGroup}
          <div class="structure-details-section">
            <h3>Structure Details</h3>
            
            <div class="group-name-row">
              <label for="structure-name">Structure Name:</label>
              <input 
                id="structure-name"
                class="text-input"
                type="text" 
                bind:value={structureName} 
                placeholder="Enter structure name" 
              />
            </div>
            
            <div class="next-tick-info">
              <div class="next-tick-time">
                Next Tick: {$timeUntilNextTick}
              </div>
              <div class="completion-time">
                Estimated Completion: {selectedStructure.buildTime} {selectedStructure.buildTime === 1 ? 'tick' : 'ticks'}
              </div>
            </div>
          </div>
        {/if}
      </div>
      
      {#if buildError}
        <div class="build-error">
          {buildError}
        </div>
      {/if}
      
      <div class="button-row">
        <button class="cancel-btn" onclick={onClose}>Cancel</button>
        <button 
          class="build-btn" 
          disabled={!canBuild || processing}
          onclick={startBuilding}
        >
          {processing ? 'Starting...' : 'Start Building'}
        </button>
      </div>
    {:else}
      <p class="no-tile">No tile selected</p>
    {/if}
  </div>
</div>

<style>
  .build-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 36em;
    max-height: 90vh;
    background: white;
    text-shadow: none;
    border-radius: 0.5em;
    box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.3);
    overflow: hidden;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    font-family: var(--font-body);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
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
    background-color: rgba(255, 255, 255, 0.5);
    border-radius: 0.3em;
    border: 1px solid rgba(0, 0, 0, 0.1);
    padding: 0.8em;
  }

  .attribute {
    display: flex;
    margin-bottom: 0.6em;
    font-size: 0.9em;
    gap: 0.8em;
    align-items: flex-start;
  }

  .attribute-label {
    color: rgba(0, 0, 0, 0.6);
    font-weight: 500;
    min-width: 40px;
    flex-shrink: 0;
  }

  .attribute-value {
    flex-grow: 1;
    color: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
  }
  
  .terrain-color {
    display: inline-block;
    width: 1em;
    height: 1em;
    border-radius: 0.2em;
    margin-right: 0.5em;
    vertical-align: middle;
    border: 1px solid rgba(0, 0, 0, 0.2);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
  }
  
  .structure-tag {
    display: inline-block;
    font-size: 0.9em;
    padding: 0.2em 0.5em;
    border-radius: 0.3em;
    background: rgba(30, 144, 255, 0.15);
    border: 1px solid rgba(30, 144, 255, 0.3);
    color: #1e90ff;
  }

  .content {
    padding: 1em 1.5em 1.5em;
    overflow-y: auto;
    max-height: calc(90vh - 4em);
    color: rgba(0, 0, 0, 0.8);
  }
  
  .build-content {
    margin-bottom: 1em;
  }
  
  h3 {
    margin: 0 0 0.8em 0;
    font-size: 1em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .group-selection-section,
  .structure-selection-section,
  .structure-details-section {
    margin-bottom: 1.2em;
    padding: 1em;
    background: white;
    border-radius: 0.3em;
    border: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  .groups-list {
    display: flex;
    flex-direction: column;
    gap: 0.7em;
  }
  
  .group-item {
    display: flex;
    align-items: center;
    padding: 0.7em;
    background: white;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s;
    color: rgba(0, 0, 0, 0.87); /* Base text color for better contrast */
  }
  
  .group-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    background: rgba(255, 255, 255, 0.8);
  }
  
  .group-item.selected {
    border-color: #4285f4;
    background: rgba(66, 133, 244, 0.1);
    box-shadow: 0 0 0 1px #4285f4;
  }
  
  .group-info {
    flex-grow: 1;
  }
  
  .group-name {
    font-weight: 600;
    font-size: 1.05em;
    margin-bottom: 0.3em;
  }
  
  .group-details {
    display: flex;
    gap: 0.8em;
    font-size: 0.9em;
    color: #666;
  }
  
  .race-tag,
  .strength-tag,
  .resources-tag {
    padding: 0.2em 0.5em;
    border-radius: 0.3em;
    font-size: 0.8em;
  }
  
  .race-tag {
    background: rgba(107, 114, 128, 0.15);
    color: #4b5563;
  }
  
  .strength-tag {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    color: rgb(185, 28, 28);
  }
  
  .resources-tag {
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.2);
    color: rgb(180, 83, 9);
  }
  
  .structures-list {
    display: flex;
    flex-direction: column;
    gap: 1em;
  }
  
  .structure-item {
    padding: 0.8em;
    background: white;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .structure-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    background: rgba(255, 255, 255, 0.8);
  }
  
  .structure-item.selected {
    border-color: #4285f4;
    background: rgba(66, 133, 244, 0.1);
    box-shadow: 0 0 0 1px #4285f4;
  }
  
  .structure-item.missing-resources.selected {
    border-color: #f44336;
    background: rgba(244, 67, 54, 0.05);
    box-shadow: 0 0 0 1px #f44336;
  }
  
  .structure-name {
    font-weight: 600;
    font-size: 1.1em;
    margin-bottom: 0.4em;
    color: rgba(0, 0, 0, 0.87); /* Improved contrast */
  }
  
  .structure-description {
    font-size: 0.9em;
    margin-bottom: 0.8em;
    color: rgba(0, 0, 0, 0.75); /* Improved contrast from #555 */
    line-height: 1.4;
  }

  .structure-features {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6em;
    margin-bottom: 1em;
  }
  
  .feature {
    display: flex;
    align-items: center;
    padding: 0.3em 0.6em;
    background: rgba(79, 70, 229, 0.15);
    color: #4338ca;
    border-radius: 0.3em;
    font-size: 0.9em;
  }
  
  .feature-icon {
    margin-right: 0.4em;
    font-size: 1em;
  }
  
  .required-resources {
    margin: 0.8em 0;
  }
  
  .required-title {
    font-weight: 600;
    font-size: 0.9em;
    margin-bottom: 0.4em;
    color: #333;
  }
  
  .resource-requirement {
    display: flex;
    justify-content: space-between;
    padding: 0.4em 0.6em;
    margin: 0.3em 0;
    border-radius: 0.3em;
    font-size: 0.85em;
  }
  
  .has-resource {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.2);
    color: rgb(6, 95, 70);
  }
  
  .missing-resource {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    color: rgb(185, 28, 28);
  }
  
  .build-time {
    font-size: 0.9em;
    padding: 0.4em 0;
    color: #555;
  }
  
  .group-name-row {
    display: flex;
    flex-direction: column;
    gap: 0.3em;
    margin-bottom: 1em;
  }
  
  .group-name-row label {
    font-size: 0.9em;
    font-weight: 500;
    color: #333;
  }
  
  .text-input {
    padding: 0.6em;
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 0.3em;
    font-size: 1em;
    width: 100%;
    background: white;
  }
  
  .text-input:focus {
    outline: none;
    border-color: #4285f4;
    box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.3);
  }
  
  .next-tick-info {
    margin-top: 1em;
    padding: 0.8em;
    background: #f5f5f5;
    border-radius: 0.3em;
  }
  
  .next-tick-time {
    font-size: 0.9em;
    margin-bottom: 0.3em;
    color: #555;
  }
  
  .completion-time {
    font-weight: 500;
    color: #3367d6;
    font-size: 0.9em;
  }
  
  .build-error {
    padding: 0.7em 1em;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: rgb(185, 28, 28);
    border-radius: 0.3em;
    font-size: 0.9em;
    margin-bottom: 1em;
  }
  
  .button-row {
    display: flex;
    justify-content: flex-end;
    gap: 0.8em;
    margin-top: 1em;
    padding: 0.5em 0;
  }
  
  .cancel-btn, .build-btn {
    padding: 0.7em 1.5em;
    border-radius: 0.3em;
    cursor: pointer;
    font-size: 1em;
    font-weight: 500;
    transition: all 0.2s;
    min-width: 8em;
  }
  
  .cancel-btn {
    background-color: #f1f3f4;
    color: #3c4043;
    border: 1px solid #dadce0;
  }
  
  .cancel-btn:hover {
    background-color: #e8eaed;
  }
  
  .build-btn {
    background-color: #4285f4;
    color: white;
    border: none;
  }
  
  .build-btn:hover:not(:disabled) {
    background-color: #3367d6;
  }
  
  .build-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .no-groups,
  .no-tile {
    text-align: center;
    color: #666;
    font-size: 0.9em;
    padding: 1em;
  }
</style>
