<script>
  import { fly, slide } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { coordinates, targetStore } from "../../lib/stores/map.js";
  import { game, currentPlayer } from "../../lib/stores/game.js";
  import { getFunctions, httpsCallable } from 'firebase/functions';
  import Close from '../icons/Close.svelte';
  import Structure from '../icons/Structure.svelte';
  import Torch from '../icons/Torch.svelte';
  import Human from '../icons/Human.svelte';
  import Elf from '../icons/Elf.svelte';
  import Dwarf from '../icons/Dwarf.svelte';
  import Goblin from '../icons/Goblin.svelte';
  import Fairy from '../icons/Fairy.svelte';

  // Props
  const { x = 0, y = 0, tile = null, onClose = () => {} } = $props();
  
  // Get the structure and its location from the tile data
  const targetStructure = $derived(tile?.structure || null);
  const structureLocation = $derived({
    x: tile?.x || x,
    y: tile?.y || y
  });
  
  // Extract items from the structure
  const structureItems = $derived(targetStructure?.items || []);
  
  // Add state to track collapsed sections
  let collapsedSections = $state({
    items: false,
    groups: false,
    players: false
  });
  
  // Function to toggle section collapse state
  function toggleSection(sectionId) {
    collapsedSections[sectionId] = !collapsedSections[sectionId];
  }

  // Helper functions
  function formatCoords(x, y) {
    return `${x}, ${y}`;
  }
  
  function formatText(text) {
    if (!text) return '';
    return text.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  
  function isOwnedByCurrentPlayer() {
    if (!targetStructure || !$currentPlayer) return false;
    return targetStructure.owner === $currentPlayer.uid;
  }
  
  // Format entity name for display
  function formatEntityName(entity) {
    if (!entity) return "Unknown";
    return entity.name || entity.displayName || entity.type || "Unnamed";
  }

  // Get status class from status
  function getStatusClass(status) {
    return status || 'idle';
  }
  
  // Get rarity class from item rarity
  function getRarityClass(rarity) {
    return rarity?.toLowerCase() || 'common';
  }

  // Function to handle structure action with error handling
  async function handleStructureAction(action) {
    if (!targetStructure) {
      console.error("No structure data available");
      return;
    }
    
    try {
      console.log(`Attempting ${action} action on structure:`, targetStructure);
      
      // Getting the functions instance
      const functions = getFunctions();
      
      // Creating the callable function reference
      const structureActionFn = httpsCallable(functions, 'structureAction');
      
      // Prepare the payload with all required fields
      const payload = {
        action,
        structureId: targetStructure.id,
        x: structureLocation.x,
        y: structureLocation.y,
        worldId: $game.currentWorld
      };
      
      console.log('Sending structure action payload:', payload);
      
      // Call the function
      const result = await structureActionFn(payload);
      
      console.log('Structure action result:', result.data);
      
      if (action === 'dismantle') {
        onClose();
      }
    } catch (error) {
      console.error('Error executing structure action:', error);
      
      // Improved error message
      let errorMessage = 'An error occurred';
      if (error.code === 'functions/not-found') {
        errorMessage = 'Function not found. The server may be updating.';
      } else if (error.code === 'functions/internal') {
        errorMessage = 'Internal server error. Please try again later.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(`Error: ${errorMessage}`);
    }
  }
</script>

<div class="entities-wrapper">
  <div class="entities-panel" transition:fly|local={{ y: 20, duration: 500, easing: quintOut }}>
    <h3 class="title">
      <div class="structure-icon">
        {#if targetStructure?.type === 'spawn'}
          <Torch size="1.6em" extraClass="structure-type-icon" />
        {:else}
          <Structure size="1.6em" extraClass="structure-type-icon {targetStructure?.type}-icon" />
        {/if}
      </div>
      {targetStructure?.name || formatText(targetStructure?.type) || 'Structure'}
      <button class="close-button" onclick={onClose}>
        <Close size="1.6em" extraClass="close-icon-dark" />
      </button>
    </h3>
    
    <div class="entities-content">
      <!-- Structure Details Section - Always visible -->
      <div class="entities-section">
        <div class="section-content">
          <div class="structure-details">
            <div class="attribute">
              <span class="attribute-label">Type</span>
              <span class="attribute-value">{formatText(targetStructure?.type) || 'Unknown'}</span>
            </div>
            
            <div class="attribute">
              <span class="attribute-label">Location</span>
              <span class="attribute-value">{formatCoords(structureLocation.x, structureLocation.y)}</span>
            </div>
            
            {#if targetStructure?.owner}
              <div class="attribute">
                <span class="attribute-label">Owner</span>
                <span class="attribute-value">
                  {#if isOwnedByCurrentPlayer()}
                    <span class="entity-badge owner-badge">You</span>
                  {:else}
                    {targetStructure.ownerName || 'Unknown player'}
                  {/if}
                </span>
              </div>
            {/if}
            
            {#if targetStructure?.faction}
              <div class="attribute">
                <span class="attribute-label">Faction</span>
                <span class="attribute-value">{formatText(targetStructure.faction)}</span>
              </div>
            {/if}
            
            {#if targetStructure?.level !== undefined}
              <div class="attribute">
                <span class="attribute-label">Level</span>
                <span class="attribute-value">{targetStructure.level}</span>
              </div>
            {/if}
            
            {#if targetStructure?.capacity !== undefined}
              <div class="attribute">
                <span class="attribute-label">Capacity</span>
                <span class="attribute-value">{targetStructure.capacity}</span>
              </div>
            {/if}
            
            {#if targetStructure?.hp !== undefined && targetStructure?.maxHp !== undefined}
              <div class="attribute">
                <span class="attribute-label">Health</span>
                <span class="attribute-value">{targetStructure.hp} / {targetStructure.maxHp}</span>
              </div>
            {/if}
            
            {#if targetStructure?.durability !== undefined && targetStructure?.maxDurability !== undefined}
              <div class="attribute">
                <span class="attribute-label">Durability</span>
                <span class="attribute-value">{targetStructure.durability} / {targetStructure.maxDurability}</span>
              </div>
            {/if}
            
            {#if targetStructure?.description}
              <div class="structure-description">
                {targetStructure.description}
              </div>
            {/if}
          </div>
        </div>
      </div>
      
      <!-- Structure Actions Section -->
      <div class="entities-section">
        <div class="structure-actions">
          {#if isOwnedByCurrentPlayer() && targetStructure?.type !== 'spawn'}
            <button class="action-button" onclick={() => handleStructureAction('manage')}>
              Manage Structure
            </button>
            
            {#if targetStructure?.canUpgrade}
              <button class="action-button" onclick={() => handleStructureAction('upgrade')}>
                Upgrade Structure
              </button>
            {/if}
            
            <button class="action-button danger" onclick={() => handleStructureAction('dismantle')}>
              Dismantle
            </button>
          {/if}
        </div>
      </div>
      
      <!-- Items Section - Collapsible -->
      {#if structureItems?.length > 0}
        <div class="entities-section">
          <div 
            class="section-header"
            onclick={() => toggleSection('items')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.items}
          >
            <h4>Items ({structureItems.length})</h4>
            <div class="section-controls">
              <button class="collapse-button">
                {collapsedSections.items ? '▼' : '▲'}
              </button>
            </div>
          </div>
          
          {#if !collapsedSections.items}
            <div class="section-content" transition:slide|local={{ duration: 300 }}>
              {#each structureItems as item}
                <div class="entity item {getRarityClass(item.rarity)}">
                  <div class="item-icon {item.type}"></div>
                  <div class="entity-info">
                    <div class="entity-name">
                      {item.name || formatText(item.type) || 'Unknown Item'}
                      {#if item.quantity > 1}
                        <span class="item-quantity">×{item.quantity}</span>
                      {/if}
                    </div>
                    
                    <div class="entity-details">
                      {#if item.type}
                        <span class="item-type">{formatText(item.type)}</span>
                      {/if}
                      
                      {#if item.rarity && item.rarity !== 'common'}
                        <span class="item-rarity {item.rarity}">{formatText(item.rarity)}</span>
                      {/if}
                    </div>
                    
                    {#if item.description}
                      <div class="item-description">
                        {item.description}
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      
      <!-- Groups Section - Collapsible -->
      {#if tile?.groups && tile.groups.length > 0}
        <div class="entities-section">
          <div 
            class="section-header"
            onclick={() => toggleSection('groups')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.groups}
          >
            <h4>Groups ({tile.groups.length})</h4>
            <div class="section-controls">
              <button class="collapse-button">
                {collapsedSections.groups ? '▼' : '▲'}
              </button>
            </div>
          </div>
          
          {#if !collapsedSections.groups}
            <div class="section-content" transition:slide|local={{ duration: 300 }}>
              {#each tile.groups as group}
                <div class="entity group" class:current-player-owned={group.owner === $currentPlayer?.uid}>
                  <div class="entity-race-icon">
                    {#if group.race === 'human'}
                      <Human extraClass="race-icon-entity" />
                    {:else if group.race === 'elf'}
                      <Elf extraClass="race-icon-entity" />
                    {:else if group.race === 'dwarf'}
                      <Dwarf extraClass="race-icon-entity" />
                    {:else if group.race === 'goblin'}
                      <Goblin extraClass="race-icon-entity" />
                    {:else if group.race === 'fairy'}
                      <Fairy extraClass="race-icon-entity" />
                    {/if}
                  </div>
                  
                  <div class="entity-info">
                    <div class="entity-name">
                      {formatEntityName(group)}
                      {#if group.owner === $currentPlayer?.uid}
                        <span class="entity-badge owner-badge">Yours</span>
                      {/if}
                    </div>
                    
                    <div class="entity-details">
                      <span class="unit-count">
                        {group.unitCount || (group.units ? Object.keys(group.units).length : 0)} units
                      </span>
                      
                      <span class="entity-status-badge {getStatusClass(group.status)}">
                        {formatText(group.status || 'idle')}
                      </span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      
      <!-- Players Section - Collapsible -->
      {#if tile?.players && tile.players.length > 0}
        <div class="entities-section">
          <div 
            class="section-header"
            onclick={() => toggleSection('players')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.players}
          >
            <h4>Players ({tile.players.length})</h4>
            <div class="section-controls">
              <button class="collapse-button">
                {collapsedSections.players ? '▼' : '▲'}
              </button>
            </div>
          </div>
          
          {#if !collapsedSections.players}
            <div class="section-content" transition:slide|local={{ duration: 300 }}>
              {#each tile.players as player}
                <div class="entity player" class:current={player.uid === $currentPlayer?.uid}>
                  <div class="entity-race-icon">
                    {#if player.race === 'human'}
                      <Human extraClass="race-icon-entity" />
                    {:else if player.race === 'elf'}
                      <Elf extraClass="race-icon-entity" />
                    {:else if player.race === 'dwarf'}
                      <Dwarf extraClass="race-icon-entity" />
                    {:else if player.race === 'goblin'}
                      <Goblin extraClass="race-icon-entity" />
                    {:else if player.race === 'fairy'}
                      <Fairy extraClass="race-icon-entity" />
                    {/if}
                  </div>
                  
                  <div class="entity-info">
                    <div class="entity-name">
                      {player.displayName || 'Player'}
                      {#if player.uid === $currentPlayer?.uid}
                        <span class="entity-badge owner-badge">You</span>
                      {/if}
                    </div>
                    
                    {#if player.race}
                      <div class="entity-details">
                        <span class="entity-race">{formatText(player.race)}</span>
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      
      <!-- Empty State for no Groups or Players -->
      {#if (!tile?.groups || tile.groups.length === 0) && (!tile?.players || tile.players.length === 0) && (!structureItems || structureItems.length === 0)}
        <div class="empty-state">
          No additional entities or items at this structure
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .entities-wrapper {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    font-size: 1.4em;
    font-family: var(--font-body);
  }

  .entities-panel {
    background-color: rgba(255, 255, 255, 0.85);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.3em;
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(0.5em);
    -webkit-backdrop-filter: blur(0.5em);
    width: 90%;
    max-width: 28em;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: reveal 0.4s ease-out forwards;
    transform-origin: center;
    max-height: 85vh;
  }

  .title {
    margin: 0;
    padding: 0.8em 1em;
    font-size: 1.1em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.8);
    background-color: rgba(0, 0, 0, 0.05);
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    font-family: var(--font-heading);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .structure-icon {
    margin-right: 0.7em;
  }

  .close-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.4em;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    margin-left: auto;
    transition: background-color 0.2s;
    color: rgba(0, 0, 0, 0.6);
  }

  .close-button:hover {
    background-color: rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.9);
  }

  .entities-content {
    padding: 0.8em;
    max-height: 70vh;
    overflow-y: auto;
  }

  .entities-section {
    margin-bottom: 1.2em;
  }

  .entities-section:last-child {
    margin-bottom: 0;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5em 0;
    cursor: pointer;
    margin-bottom: 0.5em;
    user-select: none;
    position: relative;
    width: 100%;
  }
  
  .section-header:hover {
    background-color: rgba(0, 0, 0, 0.03);
  }
  
  .section-controls {
    display: flex;
    align-items: center;
    gap: 0.5em;
    margin-left: auto;
  }
  
  .collapse-button {
    background: none;
    border: none;
    color: rgba(0, 0, 0, 0.5);
    font-size: 0.8em;
    cursor: pointer;
    padding: 0.2em 0.5em;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5em;
    min-height: 1.5em;
  }
  
  .collapse-button:hover {
    color: rgba(0, 0, 0, 0.8);
    background-color: rgba(0, 0, 0, 0.05);
    border-radius: 50%;
  }

  h4 {
    margin: 0;
    font-size: 0.9em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .attribute {
    display: flex;
    margin-bottom: 0.6em;
    font-size: 0.9em;
  }

  .attribute-label {
    width: 120px;
    color: rgba(0, 0, 0, 0.6);
    font-weight: 500;
  }

  .attribute-value {
    flex-grow: 1;
    color: rgba(0, 0, 0, 0.8);
  }

  .structure-description {
    margin-top: 1em;
    font-size: 0.85em;
    line-height: 1.5;
    color: rgba(0, 0, 0, 0.7);
    font-style: italic;
  }

  .entity {
    display: flex;
    align-items: flex-start;
    margin-bottom: 0.6em;
    padding: 0.5em 0.7em;
    border-radius: 0.3em;
    background-color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(0, 0, 0, 0.1);
    transition: background-color 0.2s ease;
  }

  .entity:hover {
    background-color: rgba(255, 255, 255, 0.8);
  }

  .entity.player.current {
    background-color: rgba(66, 133, 244, 0.05);
    border-color: rgba(66, 133, 244, 0.3);
  }

  .entity-race-icon {
    margin-right: 0.7em;
    margin-top: 0.1em;
  }

  .entity-info {
    flex: 1;
  }

  .entity-name {
    font-weight: 500;
    color: rgba(0, 0, 0, 0.85);
    line-height: 1.2;
    margin-bottom: 0.2em;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5em;
  }

  .entity-details {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6em;
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.7);
    width: 100%;
    justify-content: space-between;
  }

  .entity-badge {
    font-size: 0.7em;
    padding: 0.2em 0.4em;
    border-radius: 0.3em;
    font-weight: 500;
  }

  .owner-badge {
    background-color: rgba(76, 175, 80, 0.2);
    color: #2e7d32;
    border: 1px solid rgba(76, 175, 80, 0.4);
  }

  .entity-status-badge {
    display: inline-block;
    font-size: 0.8em;
    font-weight: 500;
    padding: 0.1em 0.5em;
    border-radius: 0.3em;
    white-space: nowrap;
    text-transform: capitalize;
  }
  
  .entity-status-badge.idle {
    background: rgba(128, 128, 128, 0.15);
    border: 1px solid rgba(128, 128, 128, 0.3);
    color: rgba(0, 0, 0, 0.7);
  }
  
  .entity-status-badge.moving {
    background: rgba(0, 128, 0, 0.15);
    border: 1px solid rgba(0, 128, 0, 0.3);
    color: #006400;
  }

  .current-player-owned {
    border-color: var(--color-bright-accent, #64ffda);
    background-color: rgba(100, 255, 218, 0.05);
    position: relative;
  }
  
  .current-player-owned::after {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background-color: var(--color-bright-accent, #64ffda);
  }

  .unit-count {
    color: rgba(0, 0, 0, 0.7);
    font-weight: 500;
  }

  .item-icon {
    width: 1em;
    height: 1em;
    background-color: rgba(255, 215, 0, 0.3);
    border-radius: 50%;
    margin-right: 0.7em;
    margin-top: 0.2em;
  }

  .item-type {
    font-weight: 500;
  }

  .item-rarity {
    font-size: 0.8em;
    padding: 0.1em 0.4em;
    border-radius: 0.2em;
  }

  .item-rarity.uncommon {
    background-color: rgba(76, 175, 80, 0.2);
    color: #2e7d32;
  }

  .item-rarity.rare {
    background-color: rgba(33, 150, 243, 0.2);
    color: #0277bd;
  }

  .item-rarity.epic {
    background-color: rgba(156, 39, 176, 0.2);
    color: #7b1fa2;
  }

  .item-rarity.legendary {
    background-color: rgba(255, 152, 0, 0.2);
    color: #ef6c00;
  }

  .item-rarity.mythic {
    background-color: rgba(233, 30, 99, 0.2);
    color: #c2185b;
  }

  .item-description {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.6);
    font-style: italic;
    margin-top: 0.4em;
  }

  .entity.item.uncommon {
    border-color: rgba(76, 175, 80, 0.3);
    background-color: rgba(76, 175, 80, 0.05);
  }

  .entity.item.rare {
    border-color: rgba(33, 150, 243, 0.3);
    background-color: rgba(33, 150, 243, 0.05);
  }

  .entity.item.epic {
    border-color: rgba(156, 39, 176, 0.3);
    background-color: rgba(156, 39, 176, 0.05);
  }

  .entity.item.legendary {
    border-color: rgba(255, 152, 0, 0.3);
    background-color: rgba(255, 152, 0, 0.05);
  }

  .entity.item.mythic {
    border-color: rgba(233, 30, 99, 0.3);
    background-color: rgba(233, 30, 99, 0.05);
    animation: pulseMythic 2s infinite alternate;
  }

  .item-quantity {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.6);
    margin-left: 0.2em;
  }

  .empty-state {
    padding: 2em;
    text-align: center;
    color: rgba(0, 0, 0, 0.5);
    font-style: italic;
  }

  .structure-actions {
    display: flex;
    flex-direction: column;
    gap: 0.6em;
    margin-top: 0.8em;
  }

  .action-button {
    padding: 0.8em;
    font-size: 0.9em;
    background-color: #4285f4;
    color: white;
    border: none;
    border-radius: 0.3em;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s;
    font-family: var(--font-body);
  }

  .action-button:hover {
    background-color: #357ae8;
    transform: translateY(-0.05em);
  }

  .action-button.danger {
    background-color: #db4437;
  }

  .action-button.danger:hover {
    background-color: #c53929;
  }

  @keyframes reveal {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes pulseMythic {
    from {
      box-shadow: 0 0 0 0 rgba(233, 30, 99, 0.1);
    }
    to {
      box-shadow: 0 0 10px 2px rgba(233, 30, 99, 0.3);
    }
  }
</style>
