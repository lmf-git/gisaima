<script>
  import { fly } from "svelte/transition";
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
  
  // We need to get the structure and its location from the tile data
  const targetStructure = $derived(tile?.structure || null);
  const structureLocation = $derived({
    x: tile?.x || x,
    y: tile?.y || y
  });
  
  // Extract items from the structure (we need to ensure this works)
  const structureItems = $derived(targetStructure?.items || []);
  
  // Active tab state
  let activeTab = $state('overview');

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

  // Function to handle structure action with better error handling
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

<div class="modal-wrapper" transition:fly|local={{ y: 20, duration: 300, easing: quintOut }}>
  <div class="modal structure-modal">
    <header class="modal-header {targetStructure?.type || ''}">
      <div class="structure-icon">
        {#if targetStructure?.type === 'spawn'}
          <Torch size="2em" extraClass="structure-type-icon" />
        {:else}
          <Structure size="2em" extraClass="structure-type-icon {targetStructure?.type}-icon" />
        {/if}
      </div>
      <h3>{targetStructure?.name || formatText(targetStructure?.type) || 'Structure'}</h3>
      <button class="close-button" onclick={onClose}>
        <Close size="1.6em" extraClass="close-icon-light" />
      </button>
    </header>
    
    <!-- Tab navigation -->
    <div class="structure-tabs">
      <button 
        class="tab-button" 
        class:active={activeTab === 'overview'} 
        onclick={() => activeTab = 'overview'}>
        Overview
      </button>
      
      <button 
        class="tab-button" 
        class:active={activeTab === 'items'} 
        onclick={() => activeTab = 'items'}>
        Items ({structureItems?.length || 0})
      </button>
      
      {#if tile?.groups?.length || tile?.players?.length}
        <button 
          class="tab-button" 
          class:active={activeTab === 'entities'} 
          onclick={() => activeTab = 'entities'}>
          Entities
        </button>
      {/if}
    </div>
    
    <div class="modal-content">
      {#if activeTab === 'overview'}
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
                  <span class="owner-badge">You</span>
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
          
          {#if targetStructure?.type === 'spawn'}
            <button class="action-button" onclick={() => handleStructureAction('viewSpawn')}>
              View Spawn Area
            </button>
          {/if}
        </div>
      {/if}
      
      {#if activeTab === 'items'}
        <div class="items-list">
          {#if structureItems?.length > 0}
            {#each structureItems as item}
              <div class="item {getRarityClass(item.rarity)}">
                <div class="item-info">
                  <div class="item-name">
                    {item.name || formatText(item.type) || 'Unknown Item'}
                    {#if item.quantity > 1}
                      <span class="item-quantity">×{item.quantity}</span>
                    {/if}
                  </div>
                  
                  <div class="item-details">
                    {#if item.type}
                      <span class="item-type">{formatText(item.type)}</span>
                    {/if}
                    
                    {#if item.rarity && item.rarity !== 'common'}
                      <span class="item-rarity-badge {item.rarity}">{formatText(item.rarity)}</span>
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
          {:else}
            <div class="empty-state">
              No items in this structure
            </div>
          {/if}
        </div>
      {/if}
      
      {#if activeTab === 'entities'}
        {#if tile?.groups && tile.groups.length > 0}
          <div class="entities-section">
            <h4>Groups ({tile.groups.length})</h4>
            
            <div class="entities-list">
              {#each tile.groups as group}
                <div class="entity group" class:player-owned={group.owner === $currentPlayer?.uid}>
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
          </div>
        {/if}
        
        {#if tile?.players && tile.players.length > 0}
          <div class="entities-section">
            <h4>Players ({tile.players.length})</h4>
            
            <div class="entities-list">
              {#each tile.players as player}
                <div class="entity player" class:current-player={player.uid === $currentPlayer?.uid}>
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
          </div>
        {/if}
        
        {#if (!tile?.groups || tile.groups.length === 0) && (!tile?.players || tile.players.length === 0)}
          <div class="empty-state">
            No entities at this structure
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .modal-wrapper {
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
  }

  .modal {
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    max-width: 500px;
    width: 90%;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    animation: appear 0.3s ease-out forwards;
    overflow: hidden;
  }

  .modal-header {
    padding: 16px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    background-color: #3a3a3a;
    color: white;
  }
  
  .modal-header.spawn {
    background-color: #00acc1;
  }
  
  .modal-header.fortress {
    background-color: #8d6e63;
  }
  
  .modal-header.watchtower {
    background-color: #7cb342;
  }
  
  .modal-header.outpost {
    background-color: #5c6bc0;
  }

  .structure-icon {
    margin-right: 16px;
  }

  h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    flex-grow: 1;
  }

  h4 {
    margin: 0 0 12px;
    font-size: 16px;
    color: #555;
    font-weight: 500;
  }

  .close-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background-color 0.2s;
  }

  .close-button:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }

  .structure-tabs {
    display: flex;
    overflow-x: auto;
    background-color: #f5f5f5;
    border-bottom: 1px solid #eee;
  }

  .tab-button {
    padding: 12px 16px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    white-space: nowrap;
    color: #666;
    transition: all 0.2s;
  }

  .tab-button:hover {
    background-color: rgba(0, 0, 0, 0.05);
    color: #333;
  }

  .tab-button.active {
    border-bottom-color: #4a90e2;
    color: #333;
    font-weight: 500;
  }

  .modal-content {
    padding: 16px;
    overflow-y: auto;
  }

  .structure-details {
    margin-bottom: 24px;
  }

  .attribute {
    display: flex;
    margin-bottom: 12px;
    font-size: 15px;
  }

  .attribute-label {
    width: 120px;
    color: #666;
    font-weight: 500;
  }

  .attribute-value {
    flex-grow: 1;
    color: #333;
  }

  .owner-badge {
    background-color: #4caf50;
    color: white;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }

  .structure-description {
    margin-top: 16px;
    font-size: 14px;
    line-height: 1.5;
    color: #555;
  }

  .structure-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .action-button {
    padding: 12px;
    font-size: 15px;
    background-color: #4a90e2;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s;
  }

  .action-button:hover {
    background-color: #3a80d2;
  }

  .action-button.danger {
    background-color: #f44336;
  }

  .action-button.danger:hover {
    background-color: #d32f2f;
  }

  /* Items styling */
  .items-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .item {
    padding: 12px;
    border-radius: 6px;
    background-color: #f9f9f9;
    border: 1px solid #eee;
  }

  .item.uncommon {
    border-color: rgba(76, 175, 80, 0.3);
    background-color: rgba(76, 175, 80, 0.05);
  }

  .item.rare {
    border-color: rgba(33, 150, 243, 0.3);
    background-color: rgba(33, 150, 243, 0.05);
  }

  .item.epic {
    border-color: rgba(156, 39, 176, 0.3);
    background-color: rgba(156, 39, 176, 0.05);
  }

  .item.legendary {
    border-color: rgba(255, 152, 0, 0.3);
    background-color: rgba(255, 152, 0, 0.05);
  }

  .item.mythic {
    border-color: rgba(233, 30, 99, 0.3);
    background-color: rgba(233, 30, 99, 0.05);
    animation: pulseMythic 2s infinite alternate;
  }

  .item-name {
    font-weight: 500;
    font-size: 16px;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
  }

  .item-quantity {
    margin-left: 6px;
    font-size: 14px;
    color: #666;
  }

  .item-details {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }

  .item-type {
    font-size: 14px;
    color: #666;
  }

  .item-rarity-badge {
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 500;
  }

  .item-rarity-badge.uncommon {
    background-color: rgba(76, 175, 80, 0.2);
    color: #2e7d32;
  }

  .item-rarity-badge.rare {
    background-color: rgba(33, 150, 243, 0.2);
    color: #0277bd;
  }

  .item-rarity-badge.epic {
    background-color: rgba(156, 39, 176, 0.2);
    color: #7b1fa2;
  }

  .item-rarity-badge.legendary {
    background-color: rgba(255, 152, 0, 0.2);
    color: #ef6c00;
  }

  .item-rarity-badge.mythic {
    background-color: rgba(233, 30, 99, 0.2);
    color: #c2185b;
  }

  .item-description {
    font-size: 14px;
    color: #666;
    font-style: italic;
    margin-top: 4px;
  }

  /* Entities styling */
  .entities-section {
    margin-bottom: 20px;
  }

  .entities-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .entity {
    padding: 12px;
    border-radius: 6px;
    background-color: #f9f9f9;
    border: 1px solid #eee;
    display: flex;
    align-items: flex-start;
  }

  .entity-race-icon {
    margin-right: 12px;
    margin-top: 2px;
  }

  .entity-info {
    flex: 1;
  }

  .entity-name {
    font-weight: 500;
    font-size: 16px;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .entity-details {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 14px;
    color: #666;
  }

  .entity-badge {
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 500;
  }

  .entity-race {
    color: #555;
  }

  .unit-count {
    font-weight: 500;
  }

  .entity.player-owned {
    border-color: rgba(76, 175, 80, 0.3);
    background-color: rgba(76, 175, 80, 0.05);
  }

  .entity.current-player {
    border-color: rgba(33, 150, 243, 0.3);
    background-color: rgba(33, 150, 243, 0.05);
  }

  .entity-status-badge {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }

  .entity-status-badge.idle {
    background-color: rgba(158, 158, 158, 0.2);
    color: #616161;
  }

  .entity-status-badge.moving {
    background-color: rgba(0, 150, 136, 0.2);
    color: #00796b;
  }

  .entity-status-badge.mobilizing {
    background-color: rgba(255, 152, 0, 0.2);
    color: #ef6c00;
  }

  .entity-status-badge.demobilising {
    background-color: rgba(156, 39, 176, 0.2);
    color: #7b1fa2;
  }

  .entity-status-badge.fighting {
    background-color: rgba(244, 67, 54, 0.2);
    color: #d32f2f;
  }

  .empty-state {
    text-align: center;
    padding: 24px;
    color: #666;
    font-style: italic;
  }

  @keyframes appear {
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
