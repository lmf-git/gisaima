<script>
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { slide } from "svelte/transition";
  import { highlightedStore, coordinates, targetStore, moveTarget } from "../../lib/stores/map.js";
  import { game, currentPlayer, calculateNextTickTime, formatTimeUntilNextTick, timeUntilNextTick } from "../../lib/stores/game.js";
  import { getFunctions, httpsCallable } from 'firebase/functions';
  import Close from '../icons/Close.svelte';
  import Torch from '../icons/Torch.svelte';
  import Structure from '../icons/Structure.svelte';

  // Import race icon components
  import Human from '../icons/Human.svelte';
  import Elf from '../icons/Elf.svelte';
  import Dwarf from '../icons/Dwarf.svelte';
  import Goblin from '../icons/Goblin.svelte';
  import Fairy from '../icons/Fairy.svelte';

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

  // Add state to track sorting options
  let sortOptions = $state({
    groups: { by: 'name', asc: true },
    players: { by: 'name', asc: true },
    items: { by: 'name', asc: true },
    battles: { by: 'status', asc: true }
  });

  // Add a render counter to force fresh animation on each open
  let renderKey = $state(0);
  
  // Add a flag to track if component is ready to render
  let isReady = $state(false);
  
  // Use simpler mounting animation control
  onMount(() => {
    // Short timeout to ensure DOM is ready
    setTimeout(() => isReady = true, 10);
  });
  
  onDestroy(() => {
    isReady = false;
  });
  
  // Function to toggle section collapse state
  function toggleSection(sectionId) {
    collapsedSections[sectionId] = !collapsedSections[sectionId];
  }

  // Function to change sort option for a section
  function setSortOption(section, by) {
    sortOptions[section] = { 
      by, 
      asc: sortOptions[section].by === by ? !sortOptions[section].asc : true 
    };
  }
  
  // Function to sort entities based on current sort options
  function sortEntities(entities, section) {
    if (!entities || !entities.length) return [];
    
    const option = sortOptions[section];
    
    return [...entities].sort((a, b) => {
      // First check if either entity is owned by the current player
      const aOwned = isOwnedByCurrentPlayer(a);
      const bOwned = isOwnedByCurrentPlayer(b);
      
      // If ownership differs, prioritize owned entities
      if (aOwned !== bOwned) {
        return aOwned ? -1 : 1;
      }
      
      // Regular sorting logic for entities with the same ownership status
      let valueA, valueB;
      
      switch(option.by) {
        case 'name':
          valueA = (a.name || a.displayName || formatEntityName(a) || '').toLowerCase();
          valueB = (b.name || b.displayName || formatEntityName(b) || '').toLowerCase();
          break;
        case 'type':
          valueA = (a.type || a.race || '').toLowerCase();
          valueB = (b.type || b.race || '').toLowerCase();
          break;
        case 'rarity':
          // For items
          const rarityOrder = { 'common': 0, 'uncommon': 1, 'rare': 2, 'epic': 3, 'legendary': 4, 'mythic': 5 };
          valueA = rarityOrder[a.rarity?.toLowerCase()] || 0;
          valueB = rarityOrder[b.rarity?.toLowerCase()] || 0;
          break;
        case 'status':
          valueA = a.status || '';
          valueB = b.status || '';
          break;
        case 'power':
          // For battles/groups
          valueA = a.power || 0;
          valueB = b.power || 0;
          break;
        default:
          valueA = a.id || '';
          valueB = b.id || '';
      }
      
      // Handle numeric comparisons
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return option.asc ? valueA - valueB : valueB - valueA;
      }
      
      // Handle string comparisons
      return option.asc ? 
        valueA.localeCompare(valueB) : 
        valueB.localeCompare(valueA);
    });
  }

  // Create sorted entity lists 
  $effect(() => {
    // These will be recalculated whenever highlightedStore or sortOptions changes
    if (!$highlightedStore) return;
    
    sortedGroups = sortEntities($highlightedStore.groups || [], 'groups');
    sortedPlayers = sortEntities($highlightedStore.players || [], 'players');
    sortedItems = sortEntities($highlightedStore.items || [], 'items');
    sortedBattles = sortEntities($highlightedStore.battles || [], 'battles');
  });

  // Define the sorted arrays
  let sortedGroups = $state([]);
  let sortedPlayers = $state([]);
  let sortedItems = $state([]);
  let sortedBattles = $state([]);

  // Function to execute action
  function executeAction(action, data = null) {
    if (!onShowModal || !$highlightedStore) return;

    const tileData = get(coordinates).find(c => 
      c.x === $highlightedStore.x && c.y === $highlightedStore.y
    );

    if (!tileData) return;

    switch (action) {
      case 'mobilise':
        onShowModal({ type: 'mobilise', data: tileData });
        break;
        
      case 'move':
        onShowModal({ type: 'move', data: data ? { ...tileData, group: data.group } : tileData });
        break;
        
      case 'attack':
        onShowModal({ type: 'attack', data: tileData });
        break;
        
      case 'gather':
        console.log('Starting gather action with data:', data);
        console.log('Tile data:', tileData);
        
        // Fix: Ensure we always include the tileData, regardless of whether a specific group was selected
        const gatherData = data && data.group 
          ? { ...tileData, group: data.group } 
          : { ...tileData };
          
        onShowModal({ type: 'gather', data: gatherData });
        break;
        
      case 'demobilise':
        onShowModal({ type: 'demobilise', data: tileData });
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

    // Check if any ID matches between the two sets
    return entity.owner === $currentPlayer.id;
  }
  
  function canMobilize(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if player is on the tile
    const playerOnTile = tile.players?.some(p => p.id === $currentPlayer.id);
    
    // Check if player is not already in a mobilizing/demobilising group
    const inProcessGroup = tile.groups?.some(g => 
      (g.status === 'mobilizing' || g.status === 'demobilising') && 
      g.owner === $currentPlayer.id
    );
    
    return playerOnTile && !inProcessGroup;
  }
  
  function canDemobilize(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if there are any player-owned groups that are idle
    return tile.groups?.some(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle' &&
      !g.inBattle
    );
  }
  
  function canMove(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if there are any player-owned groups that are idle
    return tile.groups?.some(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle' &&
      !g.inBattle
    );
  }
  
  // Add new function to check if attack is possible
  function canAttack(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if there are any player-owned groups that are idle
    const playerGroups = tile.groups?.filter(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle' &&
      !g.inBattle
    );
    
    // Check if there are any enemy groups on the tile
    const enemyGroups = tile.groups?.filter(g => 
      g.owner !== $currentPlayer.id && 
      g.status === 'idle' &&
      !g.inBattle
    );
    
    // Can attack if player has at least one group and there's at least one enemy group
    return playerGroups?.length > 0 && enemyGroups?.length > 0;
  }
  
  function canGather(tile) {
    if (!tile || !$currentPlayer) {
      return false;
    }
    
    // Only check if there are any player-owned groups that are idle and not in battle
    // (Similar to canDemobilize, but don't check for items)
    return tile.groups?.some(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle' &&
      !g.inBattle
    );
  }
  
  function canJoinBattle(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if there's an active battle and player has idle groups
    return tile.battles?.some(b => b.status === 'active') &&
           tile.groups?.some(g => 
             g.owner === $currentPlayer.id && 
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

  // Add keyboard handler for the Escape key
  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose();
    }
  }
  
  // Function to handle keyboard events on interactive elements
  function handleSectionKeyDown(event, sectionId) {
    // Toggle section on Enter or Space key
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); // Prevent page scroll on space
      toggleSection(sectionId);
    }
  }
</script>

<!-- Add global keyboard event listener -->
<svelte:window on:keydown={handleKeyDown} />

<div class="modal-container" class:ready={isReady}>
  <div class="details-modal" key={renderKey}>
    <header class="modal-header">
      <h3>
        Tile Details {$highlightedStore ? `(${$highlightedStore.x},${$highlightedStore.y})` : ''}
      </h3>
      <button class="close-button" onclick={onClose}>
        <Close size="1.6em" extraClass="close-icon-dark" />
      </button>
    </header>
    
    <div class="modal-content">
      <!-- Combined terrain and actions in a single core section -->
      <div class="core-section">
        <div class="core-content">
          <!-- Desktop two-column layout container -->
          <div class="tile-info-container">
            <!-- Left column: Structure information (if available) -->
            {#if $highlightedStore?.structure}
              <div class="structure-column">
                <div class="attribute">
                  <span class="attribute-label">Name</span>
                  <span class="attribute-value structure-name">
                    {$highlightedStore.structure.name || _fmt($highlightedStore.structure.type) || 'Unnamed Structure'}
                    {#if isOwnedByCurrentPlayer($highlightedStore.structure)}
                      <span class="entity-badge owner-badge">Yours</span>
                    {/if}
                  </span>
                </div>
                
                <div class="attribute">
                  <span class="attribute-label">Type</span>
                  <span class="attribute-value structure-type">
                    <span class="structure-type-icon-container">
                      {#if $highlightedStore.structure.type === 'spawn'}
                        <Torch size="1.2em" extraClass="structure-type-icon" />
                      {:else}
                        <Structure size="1.2em" extraClass="structure-type-icon {$highlightedStore.structure.type}-icon" />
                      {/if}
                    </span>
                    {_fmt($highlightedStore.structure.type)}
                  </span>
                </div>
              </div>
            {/if}
            
            <!-- Right column: Terrain Information -->
            <div class="terrain-column">
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
            </div>
          </div>
          
          <!-- Available actions section in same container -->
          {#if $highlightedStore}
            <div class="core-actions">
              <div class="actions-grid">
                {#if $highlightedStore.structure}
                  <button class="action-button inspect-button" onclick={() => executeAction('inspect')}>
                    Inspect
                  </button>
                {/if}
                
                {#if canMobilize($highlightedStore)}
                  <button class="action-button" onclick={() => executeAction('mobilise')}>
                    Mobilise
                  </button>
                {/if}
                
                {#if canMove($highlightedStore)}
                  <button class="action-button" onclick={() => executeAction('move')}>
                    Move
                  </button>
                {/if}
                
                {#if canAttack($highlightedStore)}
                  <button class="action-button attack-button" onclick={() => executeAction('attack')}>
                    Attack
                  </button>
                {/if}
                
                {#if canGather($highlightedStore)}
                  <button class="action-button" onclick={() => executeAction('gather', { source: 'details' })}>
                    Gather
                  </button>
                {/if}
                
                {#if canJoinBattle($highlightedStore)}
                  <button class="action-button" onclick={() => executeAction('joinBattle')}>
                    Join Battle
                  </button>
                {/if}
                
                {#if canDemobilize($highlightedStore)}
                  <button class="action-button" onclick={() => executeAction('demobilise')}>
                    Demobilise
                  </button>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>
      
      <!-- Groups section with styled count -->
      {#if $highlightedStore.groups?.length > 0}
        <div class="entities-section">
          <div 
            class="section-header"
            onclick={(e) => toggleSection('groups', e)}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.groups}
            onkeydown={(e) => e.key === 'Enter' && toggleSection('groups', e)}
          >
            <div class="section-title">
              <h4>Groups <span class="entity-count groups-count">{$highlightedStore.groups.length}</span></h4>
            </div>
            <div class="section-controls">
              {#if !collapsedSections.groups}
                <div class="sort-controls">
                  <button 
                    class="sort-option"
                    class:active={sortOptions.groups.by === 'name'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('groups', 'name'); }}
                  >
                    <span>Name</span>
                    {#if sortOptions.groups.by === 'name'}
                      <span class="sort-direction">{sortOptions.groups.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                  <button 
                    class="sort-option" 
                    class:active={sortOptions.groups.by === 'status'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('groups', 'status'); }}
                  >
                    <span>Status</span>
                    {#if sortOptions.groups.by === 'status'}
                      <span class="sort-direction">{sortOptions.groups.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                </div>
              {/if}
              <button class="collapse-button">
                {collapsedSections.groups ? '▼' : '▲'}
              </button>
            </div>
          </div>
          
          {#if !collapsedSections.groups}
            <div class="section-content" transition:slide|local={{ duration: 300 }}>
              {#each sortedGroups as group}
                <div class="entity group {isOwnedByCurrentPlayer(group) ? 'player-owned' : ''}">
                  <div class="entity-icon">
                    {#if group.race}
                      {#if group.race.toLowerCase() === 'human'}
                        <Human extraClass="race-icon-details" />
                      {:else if group.race.toLowerCase() === 'elf'}
                        <Elf extraClass="race-icon-details" />
                      {:else if group.race.toLowerCase() === 'dwarf'}
                        <Dwarf extraClass="race-icon-details" />
                      {:else if group.race.toLowerCase() === 'goblin'}
                        <Goblin extraClass="race-icon-details" />
                      {:else if group.race.toLowerCase() === 'fairy'}
                        <Fairy extraClass="race-icon-details" />
                      {/if}
                    {/if}
                  </div>
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
      
      <!-- Players section with styled count -->
      {#if $highlightedStore.players?.length > 0}
        <div class="entities-section">
          <div 
            class="section-header"
            onclick={(e) => toggleSection('players', e)}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.players}
            onkeydown={(e) => e.key === 'Enter' && toggleSection('players', e)}
          >
            <div class="section-title">
              <h4>Players <span class="entity-count players-count">{$highlightedStore.players.length}</span></h4>
            </div>
            <div class="section-controls">
              {#if !collapsedSections.players}
                <div class="sort-controls">
                  <button 
                    class="sort-option"
                    class:active={sortOptions.players.by === 'name'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('players', 'name'); }}
                  >
                    <span>Name</span>
                    {#if sortOptions.players.by === 'name'}
                      <span class="sort-direction">{sortOptions.players.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                  <button 
                    class="sort-option" 
                    class:active={sortOptions.players.by === 'type'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('players', 'type'); }}
                  >
                    <span>Race</span>
                    {#if sortOptions.players.by === 'type'}
                      <span class="sort-direction">{sortOptions.players.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                </div>
              {/if}
              <button class="collapse-button">
                {collapsedSections.players ? '▼' : '▲'}
              </button>
            </div>
          </div>
          
          {#if !collapsedSections.players}
            <div class="section-content" transition:slide|local={{ duration: 300 }}>
              {#each sortedPlayers as player}
                <div class="entity player {player.id === $currentPlayer?.id ? 'current' : ''} {isOwnedByCurrentPlayer(player) ? 'player-owned' : ''}">
                  <div class="entity-icon">
                    {#if player.race}
                      {#if player.race.toLowerCase() === 'human'}
                        <Human extraClass="race-icon-details" />
                      {:else if player.race.toLowerCase() === 'elf'}
                        <Elf extraClass="race-icon-details" />
                      {:else if player.race.toLowerCase() === 'dwarf'}
                        <Dwarf extraClass="race-icon-details" />
                      {:else if player.race.toLowerCase() === 'goblin'}
                        <Goblin extraClass="race-icon-details" />
                      {:else if player.race.toLowerCase() === 'fairy'}
                        <Fairy extraClass="race-icon-details" />
                      {/if}
                    {/if}
                  </div>
                  <div class="entity-info">
                    <div class="entity-name">
                      {player.displayName || 'Player'}
                      {#if player.id === $currentPlayer?.id}
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
      
      <!-- Items section with styled count -->
      {#if $highlightedStore.items?.length > 0}
        <div class="entities-section">
          <div 
            class="section-header"
            onclick={(e) => toggleSection('items', e)}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.items}
            onkeydown={(e) => e.key === 'Enter' && toggleSection('items', e)}
          >
            <div class="section-title">
              <h4>Items <span class="entity-count items-count">{$highlightedStore.items.length}</span></h4>
            </div>
            <div class="section-controls">
              {#if !collapsedSections.items}
                <div class="sort-controls">
                  <button 
                    class="sort-option"
                    class:active={sortOptions.items.by === 'name'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('items', 'name'); }}
                  >
                    <span>Name</span>
                    {#if sortOptions.items.by === 'name'}
                      <span class="sort-direction">{sortOptions.items.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                  <button 
                    class="sort-option" 
                    class:active={sortOptions.items.by === 'rarity'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('items', 'rarity'); }}
                  >
                    <span>Rarity</span>
                    {#if sortOptions.items.by === 'rarity'}
                      <span class="sort-direction">{sortOptions.items.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                </div>
              {/if}
              <button class="collapse-button">
                {collapsedSections.items ? '▼' : '▲'}
              </button>
            </div>
          </div>
          
          {#if !collapsedSections.items}
            <div class="section-content" transition:slide|local={{ duration: 300 }}>
              {#each sortedItems as item}
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
      
      <!-- Battles section with styled count -->
      {#if $highlightedStore.battles?.length > 0}
        <div class="entities-section battles-section">
          <div 
            class="section-header"
            onclick={(e) => toggleSection('battles', e)}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.battles}
            onkeydown={(e) => e.key === 'Enter' && toggleSection('battles', e)}
          >
            <div class="section-title">
              <h4>Battles <span class="entity-count battles-count">{$highlightedStore.battles.length}</span></h4>
            </div>
            <div class="section-controls">
              {#if !collapsedSections.battles}
                <div class="sort-controls">
                  <button 
                    class="sort-option"
                    class:active={sortOptions.battles.by === 'status'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('battles', 'status'); }}
                  >
                    <span>Status</span>
                    {#if sortOptions.battles.by === 'status'}
                      <span class="sort-direction">{sortOptions.battles.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                  <button 
                    class="sort-option" 
                    class:active={sortOptions.battles.by === 'power'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('battles', 'power'); }}
                  >
                    <span>Power</span>
                    {#if sortOptions.battles.by === 'power'}
                      <span class="sort-direction">{sortOptions.battles.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                </div>
              {/if}
              <button class="collapse-button">
                {collapsedSections.battles ? '▼' : '▲'}
              </button>
            </div>
          </div>
          
          {#if !collapsedSections.battles}
            <div class="section-content" transition:slide|local={{ duration: 300 }}>
              {#each sortedBattles as battle}
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
  .modal-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s ease-out;
  }
  
  .modal-container.ready {
    opacity: 1;
  }

  .details-modal {
    pointer-events: auto;
    width: 90%;
    max-width: 34em;
    max-height: 85vh;
    background-color: rgba(255, 255, 255, 0.85);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.3em;
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    font-size: 1.4em;
    font-family: var(--font-body);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transform: scale(0.95);
    opacity: 0;
    animation: modalAppear 0.3s ease-out forwards;
  }

  @keyframes modalAppear {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
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
    max-height: calc(85vh - 4em); /* Account for header space */
  }

  /* Core section styling */
  .core-section {
    margin-bottom: 1.2em;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid rgba(0, 0, 0, 0.1);
    background-color: rgba(255, 255, 255, 0.5);
  }

  .core-content {
    padding: 0.8em;
  }

  .core-actions {
    margin-top: 1em;
  }
  
  .section-content {
    padding: 0.8em;
    overflow-y: auto; /* Enable vertical scrolling */
    max-height: 30vh; /* Create a reasonable height limit for sections */
  }

  h4 {
    margin: 0;
    font-size: 0.9em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    gap: 0.3em;
  }

  .attribute {
    display: flex;
    margin-bottom: 0.6em;
    font-size: 0.9em;
    gap: 0.8em; /* Add gap between label and value */
    align-items: flex-start;
  }

  .attribute-label {
    /* Remove fixed width */
    color: rgba(0, 0, 0, 0.6);
    font-weight: 500;
    min-width: 40px; /* Just a small minimum width to prevent very narrow labels */
    flex-shrink: 0; /* Prevents the label from shrinking */
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
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5em;
  }

  .action-button:hover {
    background-color: rgba(66, 133, 244, 0.2);
    transform: translateY(-1px);
  }
  
  .inspect-button {
    background-color: rgba(0, 150, 136, 0.1);
    border-color: rgba(0, 150, 136, 0.3);
  }
  
  .inspect-button:hover {
    background-color: rgba(0, 150, 136, 0.2);
  }

  .attack-button {
    background-color: rgba(255, 0, 0, 0.1);
    border-color: rgba(255, 0, 0, 0.3);
  }

  .attack-button:hover {
    background-color: rgba(255, 0, 0, 0.2);
  }

  :global(.action-icon) {
    opacity: 0.8;
    vertical-align: middle;
  }
  
  :global(.spawn-icon) {
    filter: drop-shadow(0 0 2px rgba(0, 255, 255, 0.4));
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
    border: 1px solid rgba(233, 30, 99, 0.4);
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

  /* Add styles for the integrated structure elements */
  .structure-name {
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.5em;
  }
  
  .structure-type {
    display: flex;
    align-items: center;
  }

  .structure-type-icon-container {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-right: 0.5em;
    vertical-align: middle;
  }
  
  :global(.structure-type-icon) {
    opacity: 0.9;
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.7));
  }
  
  :global(.entity-race-icon path) {
    fill: rgba(0, 0, 0, 0.7);
  }
  
  :global(.spawn-icon) {
    filter: drop-shadow(0 0 3px rgba(0, 255, 255, 0.7));
  }
  
  :global(.fortress-icon) {
    filter: drop-shadow(0 0 2px rgba(230, 190, 138, 0.7));
  }
  
  :global(.outpost-icon) {
    filter: drop-shadow(0 0 2px rgba(138, 176, 230, 0.7));
  }
  
  :global(.watchtower-icon) {
    filter: drop-shadow(0 0 2px rgba(168, 230, 138, 0.7));
  }
  
  :global(.stronghold-icon) {
    filter: drop-shadow(0 0 2px rgba(230, 138, 138, 0.7));
  }
  
  :global(.citadel-icon) {
    filter: drop-shadow(0 0 2px rgba(209, 138, 230, 0.7));
  }

  /* New styles for desktop two-column layout */
  .tile-info-container {
    display: flex;
    flex-direction: column;
    gap: 0.8em;
  }
  
  /* Desktop layout - structure on left, terrain on right */
  @media (min-width: 640px) {
    .tile-info-container {
      flex-direction: row;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1.5em;
    }
    
    .structure-column,
    .terrain-column {
      flex: 1;
      min-width: 0;
    }
    
    .tile-info-container:has(.terrain-column:only-child) .terrain-column {
      width: 100%;
    }
  }

  /* Sort controls styling */
  .sort-controls {
    display: flex;
    gap: 0.2em;
    margin-right: 0.5em;
  }
  
  .sort-option {
    background: none;
    border: none;
    font-size: 0.7em;
    color: rgba(0, 0, 0, 0.5);
    padding: 0.2em 0.4em;
    border-radius: 0.3em;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.2em;
    transition: all 0.2s ease;
  }
  
  .sort-option:hover {
    background-color: rgba(0, 0, 0, 0.05);
    color: rgba(0, 0, 0, 0.8);
  }
  
  .sort-option.active {
    background-color: rgba(66, 133, 244, 0.1);
    color: rgba(66, 133, 244, 0.9);
  }
  
  .sort-direction {
    font-size: 0.9em;
    font-weight: bold;
  }
  
  /* Replace the old section-count styling with this new entity-count styling */
  .entity-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 1em;
    font-size: 0.8em;
    font-weight: 500;
    padding: 0.1em 0.6em;
    margin-left: 0.3em;
    color: rgba(255, 255, 255, 0.95);
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 0 0.15em rgba(255, 255, 255, 0.2);
  }
  
  /* Entity-specific count styling to match Overview and Grid */
  .groups-count {
    background: rgba(255, 100, 100, 0.8);
    border-color: rgba(255, 100, 100, 0.5);
    box-shadow: 0 0 0.15em rgba(255, 100, 100, 0.6);
  }
  
  .players-count {
    background: rgba(100, 100, 255, 0.8);
    border-color: rgba(100, 100, 255, 0.5);
    box-shadow: 0 0 0.15em rgba(100, 100, 255, 0.6);
  }
  
  .items-count {
    background: rgba(255, 215, 0, 0.8);
    border-color: rgba(255, 215, 0, 0.5);
    box-shadow: 0 0 0.15em rgba(255, 215, 0, 0.6);
  }
  
  .battles-count {
    background: rgba(139, 0, 0, 0.8);
    border-color: rgba(139, 0, 0, 0.5);
    box-shadow: 0 0 0.15em rgba(139, 0, 0, 0.6);
    color: white;
  }

  /* Remove the old section-count style that we're replacing */
  .section-count {
    display: none;
  }
  
  .entity-race-icon {
    margin-right: 0.7em;
    margin-top: 0.1em;
    flex-shrink: 0;
  }

  .entity-icon {
    margin-right: 0.7em;
    margin-top: 0.1em;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  /* Add global styles for race icons in details view */
  :global(.race-icon-details) {
    width: 1.4em;
    height: 1.4em;
    opacity: 0.85;
    fill: rgba(0, 0, 0, 0.7);
  }
  
  /* Race-specific styling */
  :global(.race-icon-details.fairy-icon path) {
    fill: rgba(138, 43, 226, 0.8); /* Brighter purple for fairy */
  }
  
  :global(.race-icon-details.goblin-icon path) {
    fill: rgba(0, 128, 0, 0.8); /* Brighter green for goblin */
  }

  /* Updated section header and controls to match Overview.svelte */
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5em 1em;  /* Add horizontal padding */
    cursor: pointer;
    user-select: none;
    position: relative;
    width: 100%;
    background-color: rgba(0, 0, 0, 0.03);
    border-radius: 0.3em 0.3em 0 0;
    transition: background-color 0.2s ease;
  }
  
  .section-header:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }
  
  .section-title {
    margin: 0;
    font-size: 0.9em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    gap: 0.3em;
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

  /* Add missing entities-section styling */
  .entities-section {
    margin-bottom: 1.2em;
    border-radius: 0.3em;
    overflow: hidden;
  }

  .entities-section:last-child {
    margin-bottom: 0;
  }
</style>