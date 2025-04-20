<script>
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { fly, slide } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { highlightedStore, coordinates, targetStore, moveTarget } from "../../lib/stores/map.js";
  import { game, currentPlayer, calculateNextTickTime, formatTimeUntilNextTick, timeUntilNextTick } from "../../lib/stores/game.js";
  import { getFunctions, httpsCallable } from 'firebase/functions';
  import Close from '../icons/Close.svelte';
  
  // Props
  const { onClose = () => {}, onShowModal = null } = $props();

  // Add state to track collapsed sections
  let collapsedSections = $state({
    actions: false,
    structures: false,
    players: false,
    groups: false,
    items: false,
    battles: false
  });
  
  // Function to toggle section collapse state
  function toggleSection(sectionId) {
    collapsedSections[sectionId] = !collapsedSections[sectionId];
  }

  // Function to execute action
  function executeAction(action, data = null) {
    console.log("Executing action:", action, data);
    
    // If we don't have a callback to show modals, log an error
    if (!onShowModal) {
      console.error("No onShowModal handler provided to Details component");
      return;
    }

    // Get the current highlighted tile if needed
    const highlightedTile = get(highlightedStore);
    if (!highlightedTile) {
      console.error("No highlighted tile available for action:", action);
      return;
    }

    // Find complete tile data from coordinates
    const tileData = get(coordinates).find(c => 
      c.x === highlightedTile.x && c.y === highlightedTile.y
    );

    if (!tileData) {
      console.error("Could not find tile data for action:", action);
      return;
    }

    switch (action) {
      case 'mobilize':
        onShowModal({ type: 'mobilize', data: tileData });
        break;
        
      case 'move':
        onShowModal({ type: 'move', data: data ? { ...tileData, group: data.group } : tileData });
        break;
        
      case 'attack':
        onShowModal({ type: 'attack', data: tileData });
        break;
        
      case 'gather':
        onShowModal({ type: 'gather', data: data ? { ...tileData, group: data.group } : tileData });
        break;
        
      case 'demobilize':
        onShowModal({ type: 'demobilize', data: tileData });
        break;
        
      case 'joinBattle':
        onShowModal({ type: 'joinBattle', data: data ? { ...tileData, group: data.group } : tileData });
        break;
        
      case 'inspect':
        // For structure inspection, pass both the structure and its location
        if (!tileData.structure) {
          console.error("No structure to inspect on this tile");
          return;
        }
        
        // Pass the complete tile data for rendering in StructureOverview
        onShowModal({ 
          type: 'inspect', 
          data: { 
            x: tileData.x, 
            y: tileData.y, 
            tile: tileData 
          } 
        });
        break;
        
      default:
        console.warn("Unknown action:", action);
    }
  }

  // Format entity name
  function formatEntityName(entity) {
    if (!entity) return "Unknown";
    return entity.name || entity.displayName || entity.type || "Unnamed";
  }

  // Format text with proper capitalization
  function _fmt(text) {
    if (!text) return '';
    return text.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // Check if current player owns an entity
  function isOwnedByCurrentPlayer(entity) {
    if (!entity || !$currentPlayer) return false;
    return entity.owner === $currentPlayer.uid || entity.uid === $currentPlayer.uid;
  }
  
  // Functions to check what actions are available
  function canMobilize(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if player is on the tile
    const playerOnTile = tile.players?.some(p => p.id === $currentPlayer.uid || p.uid === $currentPlayer.uid);
    
    // Check if player is not already in a mobilizing/demobilising group
    const inProcessGroup = tile.groups?.some(g => 
      (g.status === 'mobilizing' || g.status === 'demobilising') && 
      g.owner === $currentPlayer.uid
    );
    
    return playerOnTile && !inProcessGroup;
  }
  
  function canDemobilize(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if there are any player-owned groups that are idle
    return tile.groups?.some(g => 
      g.owner === $currentPlayer.uid && 
      g.status === 'idle' &&
      !g.inBattle
    );
  }
  
  function canMove(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if there are any player-owned groups that are idle
    return tile.groups?.some(g => 
      g.owner === $currentPlayer.uid && 
      g.status === 'idle' &&
      !g.inBattle
    );
  }
  
  function canGather(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if there are any player-owned groups that are idle and items on the tile
    return tile.groups?.some(g => 
      g.owner === $currentPlayer.uid && 
      g.status === 'idle' &&
      !g.inBattle
    ) && tile.items?.length > 0;
  }
  
  function canJoinBattle(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if there's an active battle and player has idle groups
    return tile.battles?.some(b => b.status === 'active') &&
           tile.groups?.some(g => 
             g.owner === $currentPlayer.uid && 
             g.status === 'idle' &&
             !g.inBattle
           );
  }

  // Get status class from status
  function getStatusClass(status) {
    return status || 'idle';
  }
  
  // Get rarity class from item rarity
  function getRarityClass(rarity) {
    return rarity?.toLowerCase() || 'common';
  }
  
  // Format distance for display
  function formatDistance(distance) {
    if (distance === undefined || distance === null) return '';
    if (distance === 0) return 'Here';
    return `${distance.toFixed(1)} tiles away`;
  }

  // Format coordinates for display
  function formatCoords(x, y) {
    return `${x},${y}`;
  }

  // Timer for updating countdown
  let updateTimer;
  // Counter to force updates
  let updateCounter = $state(0);

  // Set up timer to update countdown values
  onMount(() => {
    updateTimer = setInterval(() => {
      updateCounter++;
    }, 1000);
    
    return () => {
      if (updateTimer) clearInterval(updateTimer);
    };
  });

  // Function to handle time remaining display
  function formatTimeRemaining(endTime, status) {
    if (!endTime) return '';
    
    updateCounter; // Keep the reactive dependency
    
    // If mobilizing or demobilising, show next tick countdown instead
    if (status === 'mobilizing' || status === 'demobilising') {
      return $timeUntilNextTick;
    }
    
    // For other statuses, use the existing calculation
    const now = Date.now();
    const remaining = endTime - now;
    
    // If time is up or less than a minute remains, show simplified message
    if (remaining <= 60000) {
      return '< 1m';
    }
    
    // Normal countdown calculation for time remaining
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

  // Function to display item count for a group
  function getGroupItemCount(group) {
    if (!group.items) return 0;
    return Array.isArray(group.items) ? group.items.length : Object.keys(group.items).length;
  }

  // Enhanced battle-specific functions
  function formatBattleTimeRemaining(battle) {
    if (!battle) return '';
    
    updateCounter; // Keep reactive dependency
    
    // Handle different battle statuses
    if (battle.status === 'resolved') {
      return 'Completed';
    }
    
    if (!battle.endTime) {
      return 'In progress';
    }
    
    const now = Date.now();
    const remaining = battle.endTime - now;
    
    if (remaining <= 0) {
      return 'Resolving...';
    } else if (remaining <= 60000) {
      return '< 1m';
    }
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    return `${minutes}m ${seconds}s`;
  }
  
  // Calculate battle progress percentage
  function calculateBattleProgress(battle) {
    if (!battle || !battle.startTime || !battle.endTime || battle.status === 'resolved') {
      return 100;
    }
    
    const now = Date.now();
    const total = battle.endTime - battle.startTime;
    const elapsed = now - battle.startTime;
    
    // Cap at 100%
    return Math.min(100, Math.floor((elapsed / total) * 100));
  }
  
  // Format total power for each side
  function formatPower(power) {
    if (!power && power !== 0) return '?';
    return power.toLocaleString();
  }

  // Determine winning side CSS class
  function getWinningSideClass(battle, side) {
    if (!battle || battle.status !== 'resolved') return '';
    return battle.winner === side ? 'winning-side' : 'losing-side';
  }

  // Get battle participant groups count for each side
  function getParticipantCountBySide(battle, side) {
    if (!battle || !battle.sides || !battle.sides[side]) return 0;
    return battle.sides[side].groups?.length || 0;
  }
</script>

<div class="modal-wrapper" transition:fly|local={{ y: 20, duration: 300, easing: quintOut }}>
  <div class="modal details-modal">
    <header class="modal-header">
      <h3>Tile Details {$highlightedStore ? `(${$highlightedStore.x},${$highlightedStore.y})` : ''}</h3>
      <button class="close-button" onclick={onClose}>
        <Close size="1.6em" extraClass="close-icon-dark" />
      </button>
    </header>
    
    <div class="modal-content">
      <!-- Combined terrain and actions in a single core section -->
      <div class="core-section">
        <div class="section-content">
          <!-- Terrain Information -->
          <div class="attribute">
            <span class="attribute-label">Type</span>
            <span class="attribute-value">
              <span class="terrain-color" style="background-color: {$highlightedStore?.terrain?.color || $highlightedStore?.color || '#cccccc'}"></span>
              {_fmt($highlightedStore?.terrain?.biome?.name || 'Unknown')}
            </span>
          </div>
          
          {#if $highlightedStore?.terrain?.rarity || $highlightedStore?.rarity}
            <div class="attribute">
              <span class="attribute-label">Rarity</span>
              <span class="attribute-value">
                <span class="rarity-badge {($highlightedStore?.terrain?.rarity || $highlightedStore?.rarity)?.toLowerCase()}">
                  {_fmt($highlightedStore?.terrain?.rarity || $highlightedStore?.rarity)}
                </span>
              </span>
            </div>
          {/if}
          
          <div class="attribute">
            <span class="attribute-label">Coordinates</span>
            <span class="attribute-value">{$highlightedStore ? formatCoords($highlightedStore.x, $highlightedStore.y) : ''}</span>
          </div>
          
          <!-- Available actions section in same container -->
          {#if $highlightedStore}
            <div class="core-actions">
              <div class="actions-grid">
                {#if $highlightedStore.structure}
                  <button class="action-button" onclick={() => executeAction('inspect')}>
                    Inspect Structure
                  </button>
                {/if}
                
                {#if canMobilize($highlightedStore)}
                  <button class="action-button" onclick={() => executeAction('mobilize')}>
                    Mobilize
                  </button>
                {/if}
                
                {#if canMove($highlightedStore)}
                  <button class="action-button" onclick={() => executeAction('move')}>
                    Move
                  </button>
                {/if}
                
                {#if canGather($highlightedStore)}
                  <button class="action-button" onclick={() => executeAction('gather')}>
                    Gather
                  </button>
                {/if}
                
                {#if canJoinBattle($highlightedStore)}
                  <button class="action-button" onclick={() => executeAction('joinBattle')}>
                    Join Battle
                  </button>
                {/if}
                
                {#if canDemobilize($highlightedStore)}
                  <button class="action-button" onclick={() => executeAction('demobilize')}>
                    Demobilize
                  </button>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>
      
      <!-- Structure section -->
      {#if $highlightedStore.structure}
        <div class="entities-section">
          <div 
            class="section-header"
            onclick={() => toggleSection('structures')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.structures}
          >
            <h4>Structure</h4>
            <div class="section-controls">
              <button class="collapse-button">
                {collapsedSections.structures ? '▼' : '▲'}
              </button>
            </div>
          </div>
          
          {#if !collapsedSections.structures}
            <div class="section-content" transition:slide|local={{ duration: 300 }}>
              <div class="entity structure">
                <div class="entity-info">
                  <div class="entity-name">
                    {$highlightedStore.structure.name || _fmt($highlightedStore.structure.type) || 'Unnamed'}
                    {#if isOwnedByCurrentPlayer($highlightedStore.structure)}
                      <span class="entity-badge owner-badge">Yours</span>
                    {/if}
                  </div>
                  <div class="entity-details">
                    <div class="entity-type">{_fmt($highlightedStore.structure.type)}</div>
                  </div>
                </div>
                <button class="inspect-button" onclick={() => executeAction('inspect')}>
                  Inspect
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/if}
      
      <!-- Groups section -->
      {#if $highlightedStore.groups?.length > 0}
        <div class="entities-section">
          <div 
            class="section-header"
            onclick={() => toggleSection('groups')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.groups}
          >
            <h4>Groups ({$highlightedStore.groups.length})</h4>
            <div class="section-controls">
              <button class="collapse-button">
                {collapsedSections.groups ? '▼' : '▲'}
              </button>
            </div>
          </div>
          
          {#if !collapsedSections.groups}
            <div class="section-content" transition:slide|local={{ duration: 300 }}>
              {#each $highlightedStore.groups as group}
                <div class="entity group {isOwnedByCurrentPlayer(group) ? 'player-owned' : ''}">
                  <div class="entity-info">
                    <div class="entity-name">
                      {formatEntityName(group)}
                      {#if isOwnedByCurrentPlayer(group)}
                        <span class="entity-badge owner-badge">Yours</span>
                      {/if}
                    </div>
                    
                    <div class="entity-details">
                      <span class="unit-count">
                        {group.unitCount || (group.units ? group.units.length : 0)} units
                        {#if getGroupItemCount(group) > 0}
                          • <span class="item-count">{getGroupItemCount(group)} items</span>
                        {/if}
                      </span>
                      
                      <span class="entity-status-badge {getStatusClass(group.status)}"
                        class:pending-tick={isPendingTick(
                          group.status === 'moving' 
                            ? group.nextMoveTime 
                            : (group.status === 'gathering' || group.status === 'starting_to_gather' 
                                ? group.gatheringUntil 
                                : group.readyAt)
                        )}
                      >
                        {_fmt(group.status)}
                        {#if (group.status === 'mobilizing' || group.status === 'demobilising') && group.readyAt}
                          ({formatTimeRemaining(group.readyAt, group.status)})
                        {/if}
                      </span>
                    </div>
                  </div>
                  
                  {#if isOwnedByCurrentPlayer(group) && group.status === 'idle' && !group.inBattle}
                    <div class="entity-actions">
                      <button class="entity-action" onclick={() => executeAction('move', { group })}>
                        Move
                      </button>
                      {#if $highlightedStore.items?.length > 0}
                        <button class="entity-action" onclick={() => executeAction('gather', { group })}>
                          Gather
                        </button>
                      {/if}
                      {#if $highlightedStore.battles?.some(b => b.status === 'active')}
                        <button class="entity-action" onclick={() => executeAction('joinBattle', { group })}>
                          Join Battle
                        </button>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      
      <!-- Players section -->
      {#if $highlightedStore.players?.length > 0}
        <div class="entities-section">
          <div 
            class="section-header"
            onclick={() => toggleSection('players')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.players}
          >
            <h4>Players ({$highlightedStore.players.length})</h4>
            <div class="section-controls">
              <button class="collapse-button">
                {collapsedSections.players ? '▼' : '▲'}
              </button>
            </div>
          </div>
          
          {#if !collapsedSections.players}
            <div class="section-content" transition:slide|local={{ duration: 300 }}>
              {#each $highlightedStore.players as player}
                <div class="entity player {player.id === $currentPlayer?.uid ? 'current' : ''} {isOwnedByCurrentPlayer(player) ? 'player-owned' : ''}">
                  <div class="entity-info">
                    <div class="entity-name">
                      {player.displayName || 'Player'}
                      {#if player.id === $currentPlayer?.uid}
                        <span class="entity-badge owner-badge">You</span>
                      {/if}
                    </div>
                    <div class="entity-details">
                      {#if player.race}
                        <div class="entity-race">{_fmt(player.race)}</div>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      
      <!-- Items section -->
      {#if $highlightedStore.items?.length > 0}
        <div class="entities-section">
          <div 
            class="section-header"
            onclick={() => toggleSection('items')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.items}
          >
            <h4>Items ({$highlightedStore.items.length})</h4>
            <div class="section-controls">
              <button class="collapse-button">
                {collapsedSections.items ? '▼' : '▲'}
              </button>
            </div>
          </div>
          
          {#if !collapsedSections.items}
            <div class="section-content" transition:slide|local={{ duration: 300 }}>
              {#each $highlightedStore.items as item}
                <div class="entity item {getRarityClass(item.rarity)}">
                  <div class="entity-info">
                    <div class="entity-name">
                      {item.name || _fmt(item.type) || "Unknown Item"}
                    </div>
                    <div class="entity-details">
                      {#if item.type}
                        <span class="item-type">{_fmt(item.type)}</span>
                      {/if}
                      {#if item.quantity > 1}
                        <span class="item-quantity">×{item.quantity}</span>
                      {/if}
                      {#if item.rarity && item.rarity !== 'common'}
                        <span class="item-rarity {item.rarity}">{_fmt(item.rarity)}</span>
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
        </div>
      {/if}
      
      <!-- Battles section -->
      {#if $highlightedStore.battles?.length > 0}
        <div class="entities-section">
          <div 
            class="section-header"
            onclick={() => toggleSection('battles')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.battles}
          >
            <h4>Battles ({$highlightedStore.battles.length})</h4>
            <div class="section-controls">
              <button class="collapse-button">
                {collapsedSections.battles ? '▼' : '▲'}
              </button>
            </div>
          </div>
          
          {#if !collapsedSections.battles}
            <div class="section-content" transition:slide|local={{ duration: 300 }}>
              {#each $highlightedStore.battles as battle}
                <div class="entity battle">
                  <div class="entity-info">
                    <div class="entity-name">
                      Battle {battle.id.substring(battle.id.lastIndexOf('_') + 1)}
                      <span class="entity-status-badge {battle.status === 'resolved' ? 'resolved' : 'active'}">
                        {battle.status === 'resolved' ? 'Resolved' : 'Active'}
                      </span>
                    </div>
                    
                    <div class="entity-details">
                      <div class="battle-sides">
                        <div class="battle-side side1 {getWinningSideClass(battle, 1)}">
                          <span class="side-name">Side 1:</span> 
                          {getParticipantCountBySide(battle, 1)} groups
                          ({formatPower(battle.sides?.[1]?.power || battle.power?.[1])})
                          {#if battle.status === 'resolved' && battle.winner === 1}
                            <span class="battle-winner">Winner</span>
                          {/if}
                        </div>
                        
                        <div class="battle-side side2 {getWinningSideClass(battle, 2)}">
                          <span class="side-name">Side 2:</span> 
                          {getParticipantCountBySide(battle, 2)} groups
                          ({formatPower(battle.sides?.[2]?.power || battle.power?.[2])})
                          {#if battle.status === 'resolved' && battle.winner === 2}
                            <span class="battle-winner">Winner</span>
                          {/if}
                        </div>
                      </div>
                      
                      {#if battle.status === 'active' && battle.startTime && battle.endTime}
                        <div class="battle-progress">
                          <div class="progress-bar">
                            <div class="progress-fill" style="width: {calculateBattleProgress(battle)}%"></div>
                          </div>
                          <div class="battle-timer">
                            {formatBattleTimeRemaining(battle)}
                          </div>
                        </div>
                      {/if}
                    </div>
                  </div>
                  
                  {#if battle.status === 'active' && canJoinBattle($highlightedStore)}
                    <button class="join-battle-btn" onclick={() => executeAction('joinBattle')}>
                      Join Battle
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
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
    font-size: 1.4em;
    font-family: var(--font-body);
  }

  .modal {
    background-color: rgba(255, 255, 255, 0.85);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.3em;
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(0.5em);
    -webkit-backdrop-filter: blur(0.5em);
    width: 90%;
    max-width: 28em;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    animation: appear 0.3s ease-out;
    overflow: hidden;
  }

  .modal-header {
    padding: 0.8em 1em;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: rgba(0, 0, 0, 0.05);
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    font-family: var(--font-heading);
  }

  h3 {
    margin: 0;
    font-size: 1.1em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.8);
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
    transition: background-color 0.2s;
    color: rgba(0, 0, 0, 0.6);
  }

  .close-button:hover {
    background-color: rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.9);
  }

  .modal-content {
    padding: 0.8em;
    overflow-y: auto;
  }

  /* Core section styling */
  .core-section {
    margin-bottom: 1.2em;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid rgba(0, 0, 0, 0.1);
    background-color: rgba(255, 255, 255, 0.5);
  }

  .core-actions {
    margin-top: 1em;
  }

  /* Entities section styling */
  .entities-section {
    margin-bottom: 1.2em;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid rgba(0, 0, 0, 0.1);
    background-color: rgba(255, 255, 255, 0.5);
  }
  
  .entities-section:last-child {
    margin-bottom: 0;
  }
  
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5em 1em;
    background-color: rgba(0, 0, 0, 0.03);
    cursor: pointer;
    user-select: none;
  }
  
  .section-header:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }
  
  .section-controls {
    display: flex;
    align-items: center;
    gap: 0.5em;
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
  
  .section-content {
    padding: 0.8em;
    overflow: hidden;
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

  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.5em;
  }

  .action-button {
    padding: 0.6em;
    background-color: rgba(66, 133, 244, 0.1);
    border: 1px solid rgba(66, 133, 244, 0.3);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.8);
    font-family: var(--font-body);
    transition: all 0.2s;
  }

  .action-button:hover {
    background-color: rgba(66, 133, 244, 0.2);
    transform: translateY(-1px);
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

  .entity:last-child {
    margin-bottom: 0;
  }

  .entity:hover {
    background-color: rgba(255, 255, 255, 0.8);
  }

  .entity.player.current {
    background-color: rgba(66, 133, 244, 0.05);
    border-color: rgba(66, 133, 244, 0.3);
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
  
  .entity-status-badge.mobilizing {
    background: rgba(255, 140, 0, 0.15);
    border: 1px solid rgba(255, 140, 0, 0.3);
    color: #d06000;
  }
  
  .entity-status-badge.demobilising {
    background: rgba(138, 43, 226, 0.15);
    border: 1px solid rgba(138, 43, 226, 0.3);
    color: #6a1b9a;
  }
  
  .entity-status-badge.gathering, 
  .entity-status-badge.starting_to_gather {
    background: rgba(138, 43, 226, 0.15);
    border: 1px solid rgba(138, 43, 226, 0.3);
    color: #8a2be2;
  }
  
  .entity-status-badge.fighting {
    background: rgba(220, 20, 60, 0.15);
    border: 1px solid rgba(220, 20, 60, 0.3);
    color: #c62828;
  }
  
  .entity-status-badge.active {
    background: rgba(255, 0, 0, 0.15);
    border: 1px solid rgba(255, 0, 0, 0.3);
    color: #d32f2f;
  }
  
  .entity-status-badge.resolved {
    background: rgba(0, 128, 0, 0.15);
    border: 1px solid rgba(0, 128, 0, 0.3);
    color: #2e7d32;
  }
  
  .entity-status-badge.pending-tick {
    position: relative;
    animation: pulse 1s infinite alternate;
  }
  
  .entity-status-badge.pending-tick::after {
    content: '↻';
    margin-left: 0.3em;
    font-weight: bold;
  }

  .entity-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
    margin-top: 0.5em;
  }

  .entity-action {
    padding: 0.3em 0.6em;
    font-size: 0.8em;
    background-color: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s;
  }

  .entity-action:hover {
    background-color: rgba(0, 0, 0, 0.1);
  }

  .player-owned {
    border-color: var(--color-bright-accent, #64ffda);
    background-color: rgba(100, 255, 218, 0.05);
    position: relative;
  }
  
  .player-owned::after {
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
  
  .item-count {
    color: #2d8659;
    font-weight: 500;
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

  .item-quantity {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.6);
    margin-left: 0.2em;
  }

  /* Battle styles */
  .entity.battle {
    background-color: rgba(139, 0, 0, 0.05);
    border: 1px solid rgba(139, 0, 0, 0.2);
  }

  .battle-sides {
    display: flex;
    flex-direction: column;
    gap: 0.3em;
    font-size: 0.85em;
    margin-top: 0.4em;
  }
  
  .battle-side {
    padding: 0.2em 0.5em;
    border-radius: 0.3em;
  }
  
  .battle-side.side1 {
    background-color: rgba(0, 0, 255, 0.07);
    border: 1px solid rgba(0, 0, 255, 0.15);
    color: #00008B;
  }
  
  .battle-side.side2 {
    background-color: rgba(139, 0, 0, 0.07);
    border: 1px solid rgba(139, 0, 0, 0.15);
    color: #8B0000;
  }

  .battle-side.winning-side {
    border-color: rgba(255, 152, 0, 0.4);
    background-color: rgba(255, 152, 0, 0.1);
  }
  
  .battle-side.losing-side {
    opacity: 0.8;
  }
  
  .side-name {
    font-weight: 500;
  }

  .battle-winner {
    color: #ff9800;
    font-weight: bold;
    margin-left: 0.5em;
  }

  .battle-progress {
    margin-top: 0.4em;
    width: 100%;
  }
  
  .progress-bar {
    height: 0.5em;
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 0.25em;
    overflow: hidden;
    margin-bottom: 0.2em;
  }
  
  .progress-fill {
    height: 100%;
    background-color: rgba(139, 0, 0, 0.7);
    transition: width 1s ease;
  }

  .battle-timer {
    font-family: var(--font-mono, monospace);
    font-size: 0.85em;
    color: #d32f2f;
    text-align: center;
  }

  .join-battle-btn {
    margin-top: 0.5em;
    padding: 0.4em 0.8em;
    background-color: #d32f2f;
    color: white;
    border: none;
    border-radius: 0.3em;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s;
    align-self: flex-end;
  }
  
  .join-battle-btn:hover {
    background-color: #b71c1c;
  }

  .inspect-button {
    padding: 0.3em 0.7em;
    background-color: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.3em;
    cursor: pointer;
    font-size: 0.8em;
    align-self: center;
    margin-left: 0.5em;
    transition: all 0.2s;
  }
  
  .inspect-button:hover {
    background-color: rgba(0, 0, 0, 0.1);
  }

  .rarity-badge {
    display: inline-block;
    font-size: 0.9em;
    padding: 0.1em 0.5em;
    border-radius: 0.3em;
    font-weight: 500;
  }
  
  .rarity-badge.common {
    background-color: rgba(158, 158, 158, 0.2);
    color: #616161;
    border: 1px solid rgba(158, 158, 158, 0.4);
  }
  
  .rarity-badge.uncommon {
    background-color: rgba(76, 175, 80, 0.2);
    color: #2e7d32;
    border: 1px solid rgba(76, 175, 80, 0.4);
  }
  
  .rarity-badge.rare {
    background-color: rgba(33, 150, 243, 0.2);
    color: #0277bd;
    border: 1px solid rgba(33, 150, 243, 0.4);
  }
  
  .rarity-badge.epic {
    background-color: rgba(156, 39, 176, 0.2);
    color: #7b1fa2;
    border: 1px solid rgba(156, 39, 176, 0.4);
  }
  
  .rarity-badge.legendary {
    background-color: rgba(255, 152, 0, 0.2);
    color: #ef6c00;
    border: 1px solid rgba(255, 152, 0, 0.4);
  }
  
  .rarity-badge.mythic {
    background-color: rgba(233, 30, 99, 0.2);
    color: #c2185b;
    border: 1px solid rgba(233, 30, 99, 0.4);
  }

  @keyframes pulse {
    from { opacity: 0.7; }
    to { opacity: 1; }
  }

  @keyframes pulseMythic {
    from {
      box-shadow: 0 0 0 0 rgba(233, 30, 99, 0.1);
    }
    to {
      box-shadow: 0 0 10px 2px rgba(233, 30, 99, 0.3);
    }
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
</style>