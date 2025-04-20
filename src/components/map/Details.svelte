<script>
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { fly } from "svelte/transition";
  import { slide } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { highlightedStore, coordinates, targetStore, moveTarget } from "../../lib/stores/map.js";
  import { game, currentPlayer, calculateNextTickTime, formatTimeUntilNextTick, timeUntilNextTick } from "../../lib/stores/game.js";
  import { getFunctions, httpsCallable } from 'firebase/functions';
  import Close from '../icons/Close.svelte';
  
  // Props
  const { onClose = () => {}, onShowModal = null } = $props();

  // State for the component
  let activeTab = $state('overview');

  // Add state to track collapsed sections
  let collapsedSections = $state({
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

  // Keep executeAction function for compatibility with MapEntities
  // and other components that may expect this interface
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

  // Function to format entity name
  function formatEntityName(entity) {
    if (!entity) return "Unknown";
    return entity.name || entity.displayName || entity.type || "Unnamed";
  }

  // Function to format text with proper capitalization
  function _fmt(text) {
    if (!text) return '';
    return text.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // Check if current player owns a group
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
    
    <!-- Tab navigation -->
    <div class="tabs">
      <button 
        class="tab-button" 
        class:active={activeTab === 'overview'} 
        onclick={() => activeTab = 'overview'}>
        Overview
      </button>
      {#if $highlightedStore?.structure}
        <button 
          class="tab-button" 
          class:active={activeTab === 'structure'} 
          onclick={() => activeTab = 'structure'}>
          Structure
        </button>
      {/if}
      {#if $highlightedStore?.groups?.length}
        <button 
          class="tab-button" 
          class:active={activeTab === 'groups'} 
          onclick={() => activeTab = 'groups'}>
          Groups ({$highlightedStore.groups.length})
        </button>
      {/if}
      {#if $highlightedStore?.players?.length}
        <button 
          class="tab-button" 
          class:active={activeTab === 'players'} 
          onclick={() => activeTab = 'players'}>
          Players ({$highlightedStore.players.length})
        </button>
      {/if}
      {#if $highlightedStore?.items?.length}
        <button 
          class="tab-button" 
          class:active={activeTab === 'items'} 
          onclick={() => activeTab = 'items'}>
          Items ({$highlightedStore.items.length})
        </button>
      {/if}
      {#if $highlightedStore?.battles?.length}
        <button 
          class="tab-button" 
          class:active={activeTab === 'battles'} 
          onclick={() => activeTab = 'battles'}>
          Battles ({$highlightedStore.battles.length})
        </button>
      {/if}
    </div>
    
    <div class="modal-content">
      {#if activeTab === 'overview'}
        <div class="section">
          <h4>Terrain</h4>
          <div class="attribute">
            <span class="attribute-label">Type</span>
            <span class="attribute-value">{$highlightedStore?.terrain?.biome || 'Unknown'}</span>
          </div>
          
          <!-- Available actions section -->
          {#if $highlightedStore}
            <div class="entities-section">
              <div 
                class="section-header"
                onclick={() => toggleSection('actions')}
                role="button"
                tabindex="0"
                aria-expanded={!collapsedSections.actions}
              >
                <h4>Available Actions</h4>
                <div class="section-controls">
                  <button class="collapse-button">
                    {collapsedSections.actions ? '▼' : '▲'}
                  </button>
                </div>
              </div>
              
              {#if !collapsedSections.actions}
                <div class="section-content" transition:slide|local={{ duration: 300 }}>
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
            
            <!-- Structure quick view section -->
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
            
            <!-- Groups quick view section -->
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
            
            <!-- Players quick view section -->
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
            
            <!-- Items quick view section -->
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
            
            <!-- Battles quick view section -->
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
          {/if}
        </div>
      {/if}
      
      <!-- Structure Tab -->
      {#if activeTab === 'structure' && $highlightedStore?.structure}
        <div class="section">
          <h4>Structure Details</h4>
          <div class="entity structure detailed">
            <div class="entity-info">
              <div class="entity-name">
                {$highlightedStore.structure.name || _fmt($highlightedStore.structure.type) || 'Unnamed'}
                {#if isOwnedByCurrentPlayer($highlightedStore.structure)}
                  <span class="entity-badge owner-badge">Yours</span>
                {/if}
              </div>
              
              <div class="structure-attributes">
                <div class="attribute">
                  <span class="attribute-label">Type</span>
                  <span class="attribute-value">{_fmt($highlightedStore.structure.type)}</span>
                </div>
                
                {#if $highlightedStore.structure.owner}
                  <div class="attribute">
                    <span class="attribute-label">Owner</span>
                    <span class="attribute-value">
                      {isOwnedByCurrentPlayer($highlightedStore.structure) ? 'You' : $highlightedStore.structure.ownerName || 'Unknown player'}
                    </span>
                  </div>
                {/if}
                
                {#if $highlightedStore.structure.level !== undefined}
                  <div class="attribute">
                    <span class="attribute-label">Level</span>
                    <span class="attribute-value">{$highlightedStore.structure.level}</span>
                  </div>
                {/if}
                
                {#if $highlightedStore.structure.capacity !== undefined}
                  <div class="attribute">
                    <span class="attribute-label">Capacity</span>
                    <span class="attribute-value">{$highlightedStore.structure.capacity}</span>
                  </div>
                {/if}
                
                {#if $highlightedStore.structure.hp !== undefined && $highlightedStore.structure.maxHp !== undefined}
                  <div class="attribute">
                    <span class="attribute-label">Health</span>
                    <span class="attribute-value">{$highlightedStore.structure.hp} / {$highlightedStore.structure.maxHp}</span>
                  </div>
                {/if}
              </div>
              
              {#if $highlightedStore.structure.description}
                <div class="structure-description">
                  {$highlightedStore.structure.description}
                </div>
              {/if}
            </div>
          </div>
          
          <button class="action-button full" onclick={() => executeAction('inspect')}>
            View Structure Details
          </button>
        </div>
      {/if}
      
      <!-- Groups Tab -->
      {#if activeTab === 'groups' && $highlightedStore?.groups?.length}
        <div class="section">
          <h4>Groups ({$highlightedStore.groups.length})</h4>
          
          <div class="entity-list">
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
                    <div class="attribute">
                      <span class="attribute-label">Units</span>
                      <span class="attribute-value">{group.unitCount || 'Unknown'}</span>
                    </div>
                    
                    <div class="attribute">
                      <span class="attribute-label">Status</span>
                      <span class="attribute-value status-{group.status || 'idle'}">{_fmt(group.status || 'Idle')}</span>
                    </div>
                    
                    {#if group.race}
                      <div class="attribute">
                        <span class="attribute-label">Race</span>
                        <span class="attribute-value">{_fmt(group.race)}</span>
                      </div>
                    {/if}
                    
                    {#if group.inBattle}
                      <div class="attribute">
                        <span class="attribute-label">In Battle</span>
                        <span class="attribute-value battle-status">Yes</span>
                      </div>
                    {/if}
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
        </div>
      {/if}
      
      <!-- Players Tab -->
      {#if activeTab === 'players' && $highlightedStore?.players?.length}
        <div class="section">
          <h4>Players ({$highlightedStore.players.length})</h4>
          
          <div class="entity-list">
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
                      <div class="attribute">
                        <span class="attribute-label">Race</span>
                        <span class="attribute-value">{_fmt(player.race)}</span>
                      </div>
                    {/if}
                    
                    {#if player.faction}
                      <div class="attribute">
                        <span class="attribute-label">Faction</span>
                        <span class="attribute-value">{_fmt(player.faction)}</span>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
      
      <!-- Items Tab -->
      {#if activeTab === 'items' && $highlightedStore?.items?.length}
        <div class="section">
          <h4>Items ({$highlightedStore.items.length})</h4>
          
          <div class="entity-list">
            {#each $highlightedStore.items as item}
              <div class="entity item {getRarityClass(item.rarity)}">
                <div class="entity-info">
                  <div class="entity-name">
                    {item.name || _fmt(item.type) || "Unknown Item"}
                    {#if item.quantity > 1}
                      <span class="item-quantity">×{item.quantity}</span>
                    {/if}
                  </div>
                  <div class="entity-details">
                    {#if item.type}
                      <div class="attribute">
                        <span class="attribute-label">Type</span>
                        <span class="attribute-value">{_fmt(item.type)}</span>
                      </div>
                    {/if}
                    
                    {#if item.rarity && item.rarity !== 'common'}
                      <div class="attribute">
                        <span class="attribute-label">Rarity</span>
                        <span class="attribute-value item-rarity {item.rarity}">{_fmt(item.rarity)}</span>
                      </div>
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
        </div>
      {/if}
      
      <!-- Battles Tab -->
      {#if activeTab === 'battles' && $highlightedStore?.battles?.length}
        <div class="section">
          <h4>Battles ({$highlightedStore.battles.length})</h4>
          
          <div class="entity-list">
            {#each $highlightedStore.battles as battle}
              <div class="entity battle {battle.status}">
                <div class="entity-info">
                  <div class="entity-name">
                    Battle {battle.id.substring(battle.id.lastIndexOf('_') + 1)}
                    <span class="entity-status-badge {battle.status === 'resolved' ? 'resolved' : 'active'}">
                      {battle.status === 'resolved' ? 'Resolved' : 'Active'}
                    </span>
                  </div>
                  
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
                
                {#if battle.status === 'active' && canJoinBattle($highlightedStore)}
                  <div class="battle-actions">
                    <button class="join-battle-btn" onclick={() => executeAction('joinBattle')}>
                      Join Battle
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
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
    animation: appear 0.3s ease-out;
    overflow: hidden;
  }

  .modal-header {
    padding: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #eee;
    background-color: #f9f9f9;
  }

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #333;
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
    background-color: rgba(0, 0, 0, 0.1);
  }

  .tabs {
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

  .section {
    margin-bottom: 24px;
  }

  h4 {
    margin: 0 0 12px;
    font-size: 16px;
    color: #555;
    font-weight: 500;
  }

  .attribute {
    display: flex;
    margin-bottom: 8px;
    font-size: 14px;
  }

  .attribute-label {
    width: 100px;
    color: #666;
    font-weight: 500;
  }

  .attribute-value {
    flex-grow: 1;
    color: #333;
  }

  /* Entities section styling similar to MapEntities */
  .entities-section {
    margin-bottom: 20px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #eee;
    background-color: rgba(255, 255, 255, 0.8);
  }
  
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    background-color: #f5f5f5;
    cursor: pointer;
    user-select: none;
  }
  
  .section-header:hover {
    background-color: #efefef;
  }
  
  .section-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .collapse-button {
    background: none;
    border: none;
    color: #666;
    font-size: 14px;
    cursor: pointer;
    padding: 4px;
  }
  
  .collapse-button:hover {
    color: #333;
  }
  
  .section-content {
    padding: 8px 16px;
    overflow: hidden;
  }

  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
    margin-top: 8px;
  }

  .action-button {
    padding: 10px;
    background-color: #f0f0f0;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
    text-align: center;
  }

  .action-button:hover {
    background-color: #e0e0e0;
  }

  .action-button.full {
    width: 100%;
    margin-top: 12px;
    padding: 12px;
    font-weight: 500;
    background-color: #4a90e2;
    color: white;
    border: none;
  }

  .action-button.full:hover {
    background-color: #3a80d2;
  }

  /* Entity styling */
  .entity {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 10px;
    border-radius: 4px;
    margin-bottom: 8px;
    background-color: white;
    border: 1px solid #eee;
  }

  .entity:last-child {
    margin-bottom: 0;
  }

  .entity-info {
    flex-grow: 1;
    min-width: 0; /* to allow text truncation */
  }

  .entity-name {
    font-weight: 500;
    margin-bottom: 4px;
    color: #333;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .entity-badge {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 500;
  }
  
  .owner-badge {
    background-color: #4caf50;
    color: white;
  }
  
  .entity-details {
    font-size: 12px;
    color: #666;
  }

  .player-owned {
    border-left: 3px solid #4caf50;
  }

  .entity-actions {
    display: flex;
    gap: 6px;
    margin-left: 8px;
  }

  .entity-action {
    padding: 4px 10px;
    font-size: 12px;
    background-color: #f0f0f0;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }

  .entity-action:hover {
    background-color: #e0e0e0;
  }

  .inspect-button {
    padding: 6px 12px;
    background-color: #4a90e2;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .inspect-button:hover {
    background-color: #3a80d2;
  }

  /* Status badge styling */
  .entity-status-badge {
    display: inline-block;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 3px;
    background-color: #f0f0f0;
  }

  .status-idle {
    background-color: #f0f0f0;
    color: #666;
  }

  .status-moving {
    background-color: rgba(0, 128, 0, 0.1);
    color: #2e7d32;
  }

  .status-mobilizing {
    background-color: rgba(255, 152, 0, 0.1);
    color: #ef6c00;
  }

  .status-demobilising {
    background-color: rgba(156, 39, 176, 0.1);
    color: #7b1fa2;
  }

  .status-fighting {
    background-color: rgba(211, 47, 47, 0.1);
    color: #c62828;
  }

  .status-gathering {
    background-color: rgba(103, 58, 183, 0.1);
    color: #512da8;
  }

  .entity-status-badge.pending-tick {
    position: relative;
    animation: pulse 1s infinite alternate;
  }
  
  .entity-status-badge.pending-tick::after {
    content: '↻';
    margin-left: 3px;
    font-weight: bold;
  }

  /* Item styling */
  .item-description {
    font-size: 12px;
    margin-top: 4px;
    color: #666;
    font-style: italic;
  }
  
  .item-rarity {
    padding: 1px 5px;
    border-radius: 3px;
  }
  
  .item-rarity.uncommon {
    background-color: rgba(76, 175, 80, 0.1);
    color: #2e7d32;
  }
  
  .item-rarity.rare {
    background-color: rgba(33, 150, 243, 0.1);
    color: #0277bd;
  }
  
  .item-rarity.epic {
    background-color: rgba(156, 39, 176, 0.1);
    color: #7b1fa2;
  }
  
  .item-rarity.legendary {
    background-color: rgba(255, 152, 0, 0.1);
    color: #ef6c00;
  }
  
  .item-rarity.mythic {
    background-color: rgba(233, 30, 99, 0.1);
    color: #c2185b;
  }

  /* Battle styling */
  .battle-sides {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
    margin-bottom: 8px;
  }
  
  .battle-side {
    padding: 4px 8px;
    border-radius: 3px;
    font-size: 12px;
    background-color: #f5f5f5;
  }
  
  .battle-side.side1 {
    border-left: 3px solid #2196f3;
  }
  
  .battle-side.side2 {
    border-left: 3px solid #f44336;
  }

  .battle-winner {
    color: #ff9800;
    font-weight: bold;
    margin-left: 4px;
  }

  .battle-progress {
    margin-top: 8px;
  }
  
  .progress-bar {
    height: 4px;
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 4px;
  }
  
  .progress-fill {
    height: 100%;
    background-color: #f44336;
    transition: width 1s ease;
  }
  
  .battle-timer {
    font-size: 11px;
    color: #d32f2f;
    text-align: right;
  }

  .join-battle-btn {
    padding: 6px 12px;
    background-color: #f44336;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    margin-top: 8px;
    align-self: flex-end;
  }
  
  .join-battle-btn:hover {
    background-color: #d32f2f;
  }

  .entity-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .unit-count {
    color: #555;
    font-weight: 500;
  }
  
  .item-count {
    color: #2d8659;
  }
  
  .item-quantity {
    color: #555;
    font-weight: 500;
    margin-left: 4px;
  }
  
  /* Enhanced structure details */
  .structure-attributes {
    margin-bottom: 12px;
  }
  
  .structure-description {
    font-size: 12px;
    color: #666;
    margin-top: 8px;
    font-style: italic;
  }
  
  .entity.structure.detailed {
    padding: 16px;
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
  
  @keyframes pulse {
    from { opacity: 0.8; }
    to { opacity: 1; }
  }
</style>