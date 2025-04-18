<script>
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { targetStore, coordinates } from '../../lib/stores/map';
  import { game, currentPlayer, calculateNextTickTime, formatTimeUntilNextTick, timeUntilNextTick } from '../../lib/stores/game';
  import { onMount, onDestroy } from 'svelte';

  // Import race icon components
  import Human from '../../components/icons/Human.svelte';
  import Elf from '../../components/icons/Elf.svelte';
  import Dwarf from '../../components/icons/Dwarf.svelte';
  import Goblin from '../../components/icons/Goblin.svelte';
  import Fairy from '../../components/icons/Fairy.svelte';
  import Structure from '../../components/icons/Structure.svelte';
  import Torch from '../../components/icons/Torch.svelte';

  // Props with defaults using Svelte 5 $props() rune
  const { 
    x = 0, 
    y = 0, 
    terrain = 'Unknown', 
    onClose = () => {},
    onAction = () => {}
  } = $props();

  // Format text for display
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  // Timer for updating countdown
  let updateTimer;
  let updateCounter = $state(0);

  // Set up timer to update countdown values
  onMount(() => {
    updateTimer = setInterval(() => {
      updateCounter++;
    }, 1000);
  });

  // Clean up timer when component is destroyed
  onDestroy(() => {
    if (updateTimer) {
      clearInterval(updateTimer);
    }
  });

  // Get current tile data from coordinates store based on x,y props
  const currentTile = $derived(
    $coordinates.find(cell => cell.x === x && cell.y === y) || { x, y, biome: { name: terrain } }
  );

  // Format coordinates for display
  function formatCoords(x, y) {
    return `${x},${y}`;
  }

  // Format distance for display
  function formatDistance(distance) {
    if (distance === undefined || distance === null) return '';
    if (distance === 0) return 'Here';
    return `${distance.toFixed(1)} tiles away`;
  }

  // Maps faction to race for icon display
  function getFactionRace(faction) {
    const factionToRace = {
      human: 'human',
      elf: 'elf',
      dwarf: 'dwarf',
      goblin: 'goblin',
      fairy: 'fairy'
    };

    return factionToRace[faction?.toLowerCase()] || null;
  }

  // Function to display item count for a group
  function getGroupItemCount(group) {
    if (!group.items) return 0;
    return Array.isArray(group.items) ? group.items.length : Object.keys(group.items).length;
  }

  // Simplify the time remaining formatter to use store
  function formatTimeRemaining(endTime, status) {
    if (!endTime) return '';

    updateCounter; // Keep the reactive dependency

    if (status === 'mobilizing' || status === 'demobilising') {
      return $timeUntilNextTick;
    }

    const now = Date.now();
    const remaining = endTime - now;

    if (remaining <= 60000) {
      return '< 1m';
    }

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    return `${minutes}m ${seconds}s`;
  }

  // Simplified function to determine if waiting for tick
  function isPendingTick(endTime) {
    if (!endTime) return false;
    const now = Date.now();
    return endTime <= now;
  }

  // Get status class from status
  function getStatusClass(status) {
    return status || 'idle';
  }

  // Get rarity class from item rarity
  function getRarityClass(rarity) {
    return rarity?.toLowerCase() || 'common';
  }

  // Function to check if entity belongs to current player
  function isOwnedByCurrentPlayer(entity) {
    if (!$currentPlayer || !entity) return false;
    return entity.owner === $currentPlayer.uid || entity.uid === $currentPlayer.uid;
  }

  // Available actions based on tile content
  let actions = $state([]);

  // Action helper functions
  function hasGroupWithStatus(tile, playerId, status) {
    return tile.groups && tile.groups.some(group => 
      group.owner === playerId && group.status === status
    );
  }

  function isPlayerAvailableOnTile(tile, playerId) {
    if (!tile.players || !tile.players.some(p => p.id === playerId || p.uid === playerId)) {
      return false;
    }
    
    if (tile.groups) {
      const playerInDemobilisingGroup = tile.groups.some(group => 
        group.status === 'demobilising' && 
        group.owner === playerId && 
        group.units && 
        group.units.some(unit => (unit.id === playerId || unit.uid === playerId) && unit.type === 'player')
      );
      return !playerInDemobilisingGroup;
    }
    
    return true;
  }

  function hasValidUnitsForMobilization(tile, playerId) {
    if (!tile || !tile.groups) return false;
    
    return tile.groups.some(group => 
      group.owner === playerId && 
      group.status !== 'mobilizing' &&
      group.status !== 'moving' &&
      group.status !== 'demobilising' &&
      group.status !== 'fighting' &&
      group.units && 
      group.units.some(unit => unit.type !== 'player')
    );
  }

  function hasMobilizableResources(tile, playerId) {
    const playerOnTile = isPlayerAvailableOnTile(tile, playerId);
    const hasValidUnits = hasValidUnitsForMobilization(tile, playerId);
    return playerOnTile || hasValidUnits;
  }

  // Process the actions available for this tile
  $effect(() => {
    if (!currentTile) {
      actions = [];
      return;
    }

    const availableActions = [];
    const playerId = $currentPlayer?.uid;
    
    if (!playerId) {
      actions = [];
      return;
    }

    // Check for mobilization action
    if (hasMobilizableResources(currentTile, playerId)) {
      availableActions.push({
        id: 'mobilize',
        label: 'Mobilize',
        icon: '⚔️',
        description: 'Form a group from available units'
      });
    }
    
    // Check for movement (player groups that are idle)
    if (hasGroupWithStatus(currentTile, playerId, 'idle')) {
      availableActions.push({
        id: 'move',
        label: 'Move',
        icon: '➡️',
        description: 'Move your group to another location'
      });
    }
    
    // Check for demobilization (player groups can demobilize at structures)
    if (currentTile.structure && currentTile.groups && 
        currentTile.groups.some(g => g.owner === playerId && 
                               g.status !== 'demobilising' && 
                               g.status !== 'mobilizing')) {
      availableActions.push({
        id: 'demobilize',
        label: 'Demobilize',
        icon: '🏠',
        description: 'Disband your group at this structure'
      });
    }
    
    // Check for attack opportunity (player groups can attack enemy groups)
    const hasPlayerGroups = currentTile.groups && 
                           currentTile.groups.some(g => g.owner === playerId && !g.inBattle);
    const hasEnemyGroups = currentTile.groups && 
                          currentTile.groups.some(g => g.owner !== playerId && !g.inBattle);
                          
    if (hasPlayerGroups && hasEnemyGroups) {
      availableActions.push({
        id: 'attack',
        label: 'Attack',
        icon: '⚔️',
        description: 'Attack an enemy group'
      });
    }
    
    // Check for joinable battles
    const hasBattles = currentTile.groups && 
                      currentTile.groups.some(g => g.inBattle && g.battleId);
    const canJoinBattle = hasPlayerGroups && hasBattles;
    
    if (canJoinBattle) {
      availableActions.push({
        id: 'joinBattle',
        label: 'Join Battle',
        icon: '🗡️',
        description: 'Join an ongoing battle'
      });
    }
    
    // Check for structures to inspect
    if (currentTile.structure) {
      availableActions.push({
        id: 'inspect',
        label: 'Inspect Structure',
        icon: '🔍',
        description: 'View details about this structure'
      });
    }
    
    // For resources - add gather action
    const hasResources = currentTile.items && 
                       currentTile.items.length > 0 && 
                       currentTile.items.some(i => i.type === 'resource');
                       
    if (hasPlayerGroups && hasResources) {
      availableActions.push({
        id: 'gather',
        label: 'Gather Resources',
        icon: '📦',
        description: 'Collect resources from this location'
      });
    }

    // Add explore action if player is present
    if (isPlayerAvailableOnTile(currentTile, playerId)) {
      availableActions.push({
        id: 'explore',
        label: 'Explore',
        icon: '🔭',
        description: 'Explore this location'
      });
    }

    actions = availableActions;
  });

  // Handle action selection
  function selectAction(actionId) {
    if (onAction) {
      onAction({ action: actionId, tile: currentTile });
    }
    onClose();
  }
</script>

<div class="details-wrapper">
  <div class="details-panel" transition:fly|local={{ y: 20, duration: 500, easing: cubicOut }}>
    <div class="header">
      <h3 class="title">Tile Details</h3>
      <div class="coords">{formatCoords(x, y)}</div>
      <button class="close-button" onclick={onClose} aria-label="Close">×</button>
    </div>
    
    <div class="details-content">
      <div class="section terrain-section">
        <h4 class="section-title">Terrain</h4>
        <div class="terrain-info">
          <div class="terrain-name">{_fmt(currentTile?.biome?.name || terrain)}</div>
          {#if currentTile?.terrain?.rarity && currentTile.terrain.rarity !== 'common'}
            <div class="terrain-rarity {currentTile.terrain.rarity}">
              {_fmt(currentTile.terrain.rarity)}
            </div>
          {/if}
        </div>
      </div>
      
      {#if currentTile?.structure}
        <div class="section structure-section">
          <h4 class="section-title">Structure</h4>
          <div class="entity structure" class:current-player-owned={isOwnedByCurrentPlayer(currentTile.structure)}>
            <div class="entity-structure-icon">
              <Structure size="1.4em" extraClass="{currentTile.structure.type}-icon structure-type-icon" />
            </div>
            <div class="entity-info">
              <div class="entity-name">
                {_fmt(currentTile.structure.name || currentTile.structure.type)}
                {#if isOwnedByCurrentPlayer(currentTile.structure)}
                  <span class="your-entity-badge">Yours</span>
                {/if}
              </div>
              <div class="entity-details">
                <span class="entity-type">{_fmt(currentTile.structure.type)}</span>
              </div>
            </div>
          </div>
        </div>
      {/if}
      
      {#if currentTile?.players?.length > 0}
        <div class="section players-section">
          <h4 class="section-title">Players ({currentTile.players.length})</h4>
          {#each currentTile.players as player}
            {@const race = getFactionRace(player.race)}
            <div class="entity player" class:current={player.uid === $currentPlayer?.uid}>
              <div class="entity-race-icon">
                {#if race === 'human'}
                  <Human size="1.2em" extraClass="race-icon-entity" />
                {:else if race === 'elf'}
                  <Elf size="1.2em" extraClass="race-icon-entity" />
                {:else if race === 'dwarf'}
                  <Dwarf size="1.2em" extraClass="race-icon-entity" />
                {:else if race === 'goblin'}
                  <Goblin size="1.2em" extraClass="race-icon-entity" />
                {:else if race === 'fairy'}
                  <Fairy size="1.2em" extraClass="race-icon-entity" />
                {/if}
              </div>
              <div class="entity-info">
                <div class="entity-name">
                  {player.name || player.displayName || `Player ${player.uid?.substring(0, 4)}`}
                  {#if player.uid === $currentPlayer?.uid}
                    <span class="your-entity-badge">You</span>
                  {/if}
                </div>
                <div class="entity-details">
                  <span class="entity-race">{_fmt(player.race)}</span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      
      {#if currentTile?.groups?.length > 0}
        <div class="section groups-section">
          <h4 class="section-title">Groups ({currentTile.groups.length})</h4>
          {#each currentTile.groups as group}
            {@const race = getFactionRace(group.race)}
            {@const readyAt = group.readyAt}
            {@const isPending = isPendingTick(readyAt)}
            <div class="entity group" class:current-player-owned={isOwnedByCurrentPlayer(group)}>
              <div class="entity-race-icon">
                {#if race === 'human'}
                  <Human size="1.2em" extraClass="race-icon-entity" />
                {:else if race === 'elf'}
                  <Elf size="1.2em" extraClass="race-icon-entity" />
                {:else if race === 'dwarf'}
                  <Dwarf size="1.2em" extraClass="race-icon-entity" />
                {:else if race === 'goblin'}
                  <Goblin size="1.2em" extraClass="race-icon-entity" />
                {:else if race === 'fairy'}
                  <Fairy size="1.2em" extraClass="race-icon-entity" />
                {/if}
              </div>
              <div class="entity-info">
                <div class="entity-name">
                  {group.name}
                  {#if isOwnedByCurrentPlayer(group)}
                    <span class="your-entity-badge">Yours</span>
                  {/if}
                  {#if group.inBattle}
                    <span class="battle-tag battle-side-{group.battleSide || '1'}">
                      ⚔️ Battle
                    </span>
                  {/if}
                </div>
                <div class="entity-details">
                  <div>
                    <span class="unit-count">{group.unitCount || 0} units</span>
                    {#if getGroupItemCount(group) > 0}
                      <span class="item-count">• {getGroupItemCount(group)} items</span>
                    {/if}
                  </div>
                  <div>
                    <span class="status {getStatusClass(group.status)} {isPending ? 'pending-tick' : ''}">
                      {_fmt(group.status || 'idle')}
                      {#if readyAt && !isPending}
                        <span class="countdown">{formatTimeRemaining(readyAt, group.status)}</span>
                      {/if}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      
      {#if currentTile?.items?.length > 0}
        <div class="section items-section">
          <h4 class="section-title">Items ({currentTile.items.length})</h4>
          {#each currentTile.items as item}
            <div class="entity item {getRarityClass(item.rarity)}">
              <div class="item-icon {item.type || 'resource'}"></div>
              <div class="entity-info">
                <div class="entity-name">{item.name}</div>
                <div class="entity-details">
                  <div>
                    <span class="item-type">{_fmt(item.type || 'resource')}</span>
                    {#if item.quantity > 1}
                      <span class="item-quantity">× {item.quantity}</span>
                    {/if}
                  </div>
                  {#if item.rarity && item.rarity !== 'common'}
                    <span class="item-rarity {getRarityClass(item.rarity)}">{_fmt(item.rarity)}</span>
                  {/if}
                </div>
                {#if item.description}
                  <div class="item-description">{item.description}</div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
      
      {#if !currentTile?.structure && !currentTile?.players?.length && !currentTile?.groups?.length && !currentTile?.items?.length}
        <div class="empty-state">
          <p>No additional details available for this tile.</p>
        </div>
      {/if}
      
      {#if actions.length > 0}
        <div class="section actions-section">
          <h4 class="section-title">Available Actions</h4>
          <div class="actions-list">
            {#each actions as action}
              <button 
                class="action-button" 
                onclick={() => selectAction(action.id)}
                aria-label={action.label}
              >
                <span class="action-icon">{action.icon}</span>
                <div class="action-text">
                  <div class="action-label">{action.label}</div>
                  {#if action.description}
                    <div class="action-description">{action.description}</div>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  @keyframes pulseWaiting {
    from { opacity: 0.7; }
    to { opacity: 1; }
  }
  
  .details-wrapper {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
  }
  
  .details-panel {
    background-color: rgba(255, 255, 255, 0.85);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5em;
    box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.2);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(0.5em);
    -webkit-backdrop-filter: blur(0.5em);
    width: 100%;
    max-width: 30em;
    margin: 1em;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: reveal 0.4s ease-out forwards;
    transform-origin: center;
    font-family: var(--font-body);
    max-height: 90vh;
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
  
  .header {
    display: flex;
    align-items: center;
    padding: 0.8em 1em;
    background-color: rgba(0, 0, 0, 0.05);
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  .title {
    flex: 1;
    margin: 0;
    font-size: 1.2em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.8);
    font-family: var(--font-heading);
  }
  
  .coords {
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.6);
    margin-right: 1em;
    font-weight: 500;
    font-family: var(--font-mono, monospace);
  }
  
  .close-button {
    background: none;
    border: none;
    color: rgba(0, 0, 0, 0.5);
    font-size: 1.5em;
    cursor: pointer;
    padding: 0;
    width: 1.2em;
    height: 1.2em;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    line-height: 1;
  }
  
  .close-button:hover {
    color: rgba(0, 0, 0, 0.8);
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 50%;
  }
  
  .details-content {
    padding: 1em;
    max-height: calc(90vh - 4em);
    overflow-y: auto;
  }
  
  .section {
    margin-bottom: 1.5em;
    position: relative;
  }
  
  .section:last-child {
    margin-bottom: 0;
  }
  
  .section-title {
    margin: 0 0 0.5em 0;
    font-size: 1em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-family: var(--font-heading);
  }

  .actions-section {
    margin-top: 1.5em;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
    padding-top: 1em;
  }
  
  .actions-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
  }
  
  .action-button {
    display: flex;
    align-items: center;
    gap: 0.5em;
    padding: 0.8em;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.3em;
    background-color: rgba(255, 255, 255, 0.7);
    transition: all 0.2s;
    cursor: pointer;
    flex-grow: 1;
    max-width: calc(50% - 0.25em);
    font-family: var(--font-body);
    text-align: left;
  }
  
  .action-button:hover {
    background-color: rgba(255, 255, 255, 0.9);
    border-color: rgba(0, 0, 0, 0.2);
    transform: translateY(-2px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  .action-icon {
    font-size: 1.2em;
  }
  
  .action-text {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  
  .action-label {
    font-weight: 600;
    font-size: 0.95em;
    color: rgba(0, 0, 0, 0.8);
    margin-bottom: 0.2em;
  }
  
  .action-description {
    font-size: 0.8em;
    color: rgba(0, 0, 0, 0.6);
  }
  
  @media (max-width: 480px) {
    .action-button {
      max-width: 100%;
    }
  }
</style>