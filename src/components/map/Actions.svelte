<script>
  import { createEventDispatcher } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { currentPlayer } from '../../lib/stores/game';
  import Close from '../icons/Close.svelte';
  import Human from '../icons/Human.svelte';
  import Elf from '../icons/Elf.svelte';
  import Dwarf from '../icons/Dwarf.svelte';
  import Goblin from '../icons/Goblin.svelte';
  import Fairy from '../icons/Fairy.svelte';

  // Props
  const { tile, onClose } = $props();
  
  const dispatch = createEventDispatcher();
  
  // Format text for display
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Actions available for this tile
  let actions = $state([]);
  
  // Function to check if the player is already in a group on this tile
  function isPlayerInGroup(tile, playerId) {
    if (!tile || !tile.groups || !playerId) return false;
    
    // Check all groups on the tile
    return tile.groups.some(group => {
      // Check if the player is in any group's units
      return group.units && group.units.some(unit => 
        unit.type === 'player' && unit.id === playerId
      );
    });
  }
  
  // Generate actions based on tile content
  $effect(() => {
    const newActions = [];
    
    if (!tile) return;
    
    // Basic actions for any tile
    newActions.push({
      id: 'explore',
      label: 'Explore Area',
      icon: '🔍',
      description: 'Search this area for resources and information',
      primary: !tile.structure && tile.terrain.height > 0.31, // Primary if not water and no structure
      disabled: tile.terrain.height <= 0.31, // Disable if underwater
      disabledReason: tile.terrain.height <= 0.31 ? 'Cannot explore underwater areas' : null
    });
    
    // Add Move action if player has IDLE groups at this location
    // Changed to specifically check for idle status
    const playerHasIdleGroups = $currentPlayer && 
                          tile.groups && 
                          tile.groups.some(g => g.owner === $currentPlayer.uid && g.status === 'idle');
    
    if (playerHasIdleGroups) {
      newActions.push({
        id: 'move',
        label: 'Move Group',
        icon: '👣',
        description: 'Move a group to an adjacent location',
        primary: true
      });
    }
    
    // Movement action to current tile (different from Move Group)
    newActions.push({
      id: 'move_to',
      label: 'Move Here',
      icon: '🧭',
      description: 'Travel to this location',
      primary: false, // Not primary action
      // Disable if current player is already there
      disabled: $currentPlayer && tile.players && tile.players.some(p => p.id === $currentPlayer.uid),
      disabledReason: 'You are already at this location'
    });
    
    // Add Mobilize action if player has groups or is on this tile
    // AND player is not already in a group
    const playerIsOnTile = $currentPlayer && 
                           tile.players && 
                           tile.players.some(p => p.id === $currentPlayer.uid);
                          
    // Only show mobilize if player isn't already in a group on this tile
    const playerInGroup = isPlayerInGroup(tile, $currentPlayer?.uid);
    
    if (($currentPlayer && (playerHasIdleGroups || playerIsOnTile) && !playerInGroup)) {
      newActions.push({
        id: 'mobilize',
        label: 'Mobilize Forces',
        icon: '⚔️',
        description: 'Prepare units for action',
        primary: !playerHasIdleGroups // Make primary if no move action available
      });
    }
    
    // Resource gathering based on terrain
    if (tile.terrain.height > 0.31) {
      // Forest areas - wood gathering
      if (tile.biome.name.includes('forest') || 
          tile.biome.name.includes('grove') || 
          tile.biome.name.includes('woodland')) {
        newActions.push({
          id: 'gather_wood',
          label: 'Gather Wood',
          icon: '🪓',
          description: 'Collect wood resources from this forest',
          primary: false
        });
      }
      
      // Mining in mountains
      if (tile.terrain.height > 0.65 || 
          tile.biome.name.includes('mountain') || 
          tile.biome.name.includes('cliff') || 
          tile.biome.name.includes('peak')) {
        newActions.push({
          id: 'mine',
          label: 'Mine Resources',
          icon: '⛏️',
          description: 'Extract mineral resources from this area',
          primary: false
        });
      }
      
      // Hunting in various terrains
      if (tile.biome.name.includes('forest') || 
          tile.biome.name.includes('grassland') || 
          tile.biome.name.includes('savanna') ||
          tile.biome.name.includes('plains')) {
        newActions.push({
          id: 'hunt',
          label: 'Hunt',
          icon: '🏹',
          description: 'Hunt for food and animal resources',
          primary: false
        });
      }
    }
    
    // Structure-specific actions
    if (tile.structure) {
      const structureType = tile.structure.type?.toLowerCase();
      
      // Generic interaction
      newActions.push({
        id: 'interact',
        label: `Interact with ${_fmt(structureType) || 'Structure'}`,
        icon: '🔮',
        description: 'Examine and interact with this structure',
        primary: true
      });
      
      // Building-specific actions
      if (structureType === 'settlement' || structureType === 'town' || structureType === 'city') {
        newActions.push({
          id: 'trade',
          label: 'Trade',
          icon: '💰',
          description: 'Trade resources and items with local merchants',
          primary: false
        });
        
        newActions.push({
          id: 'rest',
          label: 'Rest',
          icon: '🏠',
          description: 'Recover health and energy',
          primary: false
        });
      }
    }
    
    // Rare/special terrain actions
    if (tile.terrain.rarity && tile.terrain.rarity !== 'common') {
      newActions.push({
        id: 'investigate',
        label: 'Investigate Anomaly',
        icon: '✨',
        description: `Examine this rare ${tile.terrain.rarity} terrain feature`,
        primary: !tile.structure, // Primary if no structure present
      });
    }
    
    actions = newActions;
  });
  
  // Function to handle action selection
  function selectAction(action) {
    if (action.disabled) return;
    
    dispatch('action', {
      action: action.id,
      tile
    });
    
    onClose();
  }
  
  // Close on escape key
  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<dialog 
     class="overlay"
     open
     aria-modal="true" 
     aria-labelledby="actions-title"
     transition:fade={{ duration: 200 }}>
  
  <section 
       class="popup"
       role="document" 
       transition:scale={{ start: 0.95, duration: 200 }}>
    <div class="header">
      <h2 id="actions-title">Actions - {tile?.x}, {tile?.y}</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close actions dialog">
        <Close size="1.5em" />
      </button>
    </div>
    
    {#if tile}
      <div class="location-info">
        <div class="terrain">
          <div class="terrain-color" style="background-color: {tile.color}"></div>
          <span>{_fmt(tile.biome?.name) || "Unknown"}</span>
          
          {#if tile.terrain.rarity && tile.terrain.rarity !== 'common'}
            <span class="rarity-tag {tile.terrain.rarity}">
              {tile.terrain.rarity.charAt(0).toUpperCase() + tile.terrain.rarity.slice(1)}
            </span>
          {/if}
        </div>
        
        {#if tile.players?.length}
          <div class="players">
            <span class="label">Players: {tile.players.length}</span>
            <div class="player-icons">
              {#each tile.players.slice(0, 3) as player}
                <div class="player-icon" title={player.displayName || player.id}>
                  {#if player.race?.toLowerCase() === 'human'}
                    <Human extraClass="race-icon-small" />
                  {:else if player.race?.toLowerCase() === 'elf'}
                    <Elf extraClass="race-icon-small" />
                  {:else if player.race?.toLowerCase() === 'dwarf'}
                    <Dwarf extraClass="race-icon-small" />
                  {:else if player.race?.toLowerCase() === 'goblin'}
                    <Goblin extraClass="race-icon-small" />
                  {:else if player.race?.toLowerCase() === 'fairy'}
                    <Fairy extraClass="race-icon-small" />
                  {/if}
                </div>
              {/each}
              {#if tile.players.length > 3}
                <div class="player-icon more">+{tile.players.length - 3}</div>
              {/if}
            </div>
          </div>
        {/if}
        
        {#if tile.structure}
          <div class="structure">
            <span class="label">Structure:</span>
            <span>{tile.structure.name || _fmt(tile.structure.type) || "Unknown structure"}</span>
          </div>
        {/if}
      </div>
      
      <div class="actions">
        {#each actions.filter(action => action.primary) as action}
          <button 
            class="action-btn primary" 
            disabled={action.disabled}
            onclick={() => selectAction(action)}
            aria-label={action.label}
            title={action.disabled ? action.disabledReason : action.description}
          >
            <span class="action-icon">{action.icon}</span>
            <span class="action-label">{action.label}</span>
          </button>
        {/each}
        
        {#each actions.filter(action => !action.primary) as action}
          <button 
            class="action-btn secondary" 
            disabled={action.disabled}
            onclick={() => selectAction(action)}
            aria-label={action.label}
            title={action.disabled ? action.disabledReason : action.description}
          >
            <span class="action-icon">{action.icon}</span>
            <span class="action-label">{action.label}</span>
          </button>
        {/each}
        
        {#if actions.length === 0}
          <p class="no-actions">No actions available for this location</p>
        {/if}
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
    margin-bottom: 0.8em;
    font-size: 1.1em;
  }
  
  .terrain-color {
    width: 1em;
    height: 1em;
    border-radius: 0.2em;
    margin-right: 0.5em;
    border: 1px solid rgba(0, 0, 0, 0.2);
  }
  
  .rarity-tag {
    margin-left: 0.8em;
    font-size: 0.8em;
    font-weight: bold;
    padding: 0.2em 0.5em;
    border-radius: 0.3em;
    display: inline-block;
  }
  
  .uncommon {
    color: #228B22;
    background: rgba(30, 255, 0, 0.15);
    border: 1px solid rgba(30, 255, 0, 0.3);
  }
  
  .rare {
    color: #0070DD;
    background: rgba(0, 112, 221, 0.15);
    border: 1px solid rgba(0, 112, 221, 0.3);
  }
  
  .epic {
    color: #9400D3;
    background: rgba(148, 0, 211, 0.15);
    border: 1px solid rgba(148, 0, 211, 0.3);
  }
  
  .legendary {
    color: #FF8C00;
    background: rgba(255, 165, 0, 0.15);
    border: 1px solid rgba(255, 165, 0, 0.3);
  }
  
  .mythic {
    color: #FF1493;
    background: rgba(255, 128, 255, 0.15);
    border: 1px solid rgba(255, 128, 255, 0.3);
  }
  
  .players, .structure {
    display: flex;
    align-items: center;
    margin-bottom: 0.5em;
    font-size: 0.95em;
  }
  
  .label {
    font-weight: 600;
    margin-right: 0.5em;
    color: #555;
  }
  
  .player-icons {
    display: flex;
    align-items: center;
    gap: 0.3em;
  }
  
  .player-icon {
    width: 1.8em;
    height: 1.8em;
    border-radius: 50%;
    background: #f0f0f0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #ddd;
  }
  
  .player-icon.more {
    font-size: 0.7em;
    font-weight: bold;
    color: #666;
  }
  
  .actions {
    padding: 1em;
    display: flex;
    flex-direction: column;
    gap: 0.7em;
    max-height: 50vh;
    overflow-y: auto;
  }
  
  .action-btn {
    display: flex;
    align-items: center;
    padding: 0.8em 1em;
    border-radius: 0.3em;
    border: none;
    cursor: pointer;
    font-size: 1em;
    text-align: left;
    transition: all 0.2s;
  }
  
  .action-btn.primary {
    background-color: #4285f4;
    color: white;
  }
  
  .action-btn.primary:hover:not(:disabled) {
    background-color: #3367d6;
  }
  
  .action-btn.secondary {
    background-color: #f8f9fa;
    color: #3c4043;
    border: 1px solid #dadce0;
  }
  
  .action-btn.secondary:hover:not(:disabled) {
    background-color: #f1f3f4;
  }
  
  .action-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .action-icon {
    font-size: 1.4em;
    margin-right: 0.8em;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  
  .action-label {
    font-weight: 500;
  }
  
  .no-actions, .no-tile {
    text-align: center;
    color: #666;
    font-style: italic;
    padding: 2em 0;
  }
  
  :global(.race-icon-small) {
    width: 1.2em;
    height: 1.2em;
    fill: rgba(0, 0, 0, 0.7);
  }
  
  @media (max-width: 480px) {
    .popup {
      width: 95%;
      max-height: 80vh;
    }
    
    h2 {
      font-size: 1.1em;
    }
    
    .action-btn {
      padding: 0.7em 0.8em;
    }
  }
</style>
