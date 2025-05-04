<script>
  import { getFunctions, httpsCallable } from 'firebase/functions';
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { slide } from "svelte/transition";
  
  import { calculateGroupPower } from 'gisaima-shared/war/battles.js';

  import { coordinates, targetStore } from "../../../lib/stores/map.js";
  import { game, currentPlayer, timeUntilNextTick } from "../../../lib/stores/game.js";
  
  import Close from '../../icons/Close.svelte';
  import Torch from '../../icons/Torch.svelte';
  import Structure from '../../icons/Structure.svelte';
  import Cancel from '../../icons/Close.svelte';
  import Horn from '../../icons/Horn.svelte';
  import Human from '../../icons/Human.svelte';
  import Elf from '../../icons/Elf.svelte';
  import Dwarf from '../../icons/Dwarf.svelte';
  import Goblin from '../../icons/Goblin.svelte';
  import Fairy from '../../icons/Fairy.svelte';
  import Monster from '../../icons/Monster.svelte';
  import Compass from '../../icons/Compass.svelte';
  import Eye from '../../icons/Eye.svelte';
  import Crop from '../../icons/Crop.svelte';
  import Rally from '../../icons/Rally.svelte';
  import Sword from '../../icons/Sword.svelte';
  import Hammer from '../../icons/Hammer.svelte';
  import GroupStatus from './GroupStatus.svelte';

  const { 
    onClose = () => {}, 
    onShowModal = null,
    isActive = false, // New prop to determine z-index priority
    onMouseEnter = () => {} // Add prop for mouse enter event
  } = $props();

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
    battles: { by: 'power', asc: true }
  });

  // Add a render counter to force fresh animation on each open
  let renderKey = $state(0);
  
  // Add a flag to track if component is ready to render
  let isReady = $state(false);
  
  // Add state to track expanded group units
  let expandedGroups = $state({});
  
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

  // Function to toggle group details expansion
  function toggleGroupDetails(groupId, event) {
    if (event) {
      event.stopPropagation();
    }
    expandedGroups[groupId] = !expandedGroups[groupId];
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
      // First check if either entity is the current player (highest priority)
      if (section === 'players') {
        if (a.id === $currentPlayer?.id) return -1;
        if (b.id === $currentPlayer?.id) return 1;
      }
      
      // Then check if either entity is owned by the current player
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

  // Use targetStore instead of highlightedStore for details data
  // This ensures hovering over the minimap doesn't change the displayed information
  const detailsData = $derived($targetStore || null);

  // Create sorted entity lists based on detailsData instead of $highlightedStore
  $effect(() => {
    if (!detailsData) return;
    
    sortedGroups = sortEntities(detailsData.groups || [], 'groups');
    sortedPlayers = sortEntities(detailsData.players || [], 'players');
    sortedItems = sortEntities(detailsData.items || [], 'items');
    sortedBattles = sortEntities(detailsData.battles || [], 'battles');
  });

  // Define the sorted arrays
  let sortedGroups = $state([]);
  let sortedPlayers = $state([]);
  let sortedItems = $state([]);
  let sortedBattles = $state([]);

  // Function to execute action
  function executeAction(action, data = null) {
    if (!onShowModal || !detailsData) return;

    const tileData = get(coordinates).find(c => 
      c.x === detailsData.x && c.y === detailsData.y
    );

    if (!tileData) return;

    switch (action) {
      case 'mobilise':
        onShowModal({ type: 'mobilise', data: tileData });
        onClose(); // Close details panel when opening another modal
        break;
        
      case 'move':
        onShowModal({ type: 'move', data: data ? { ...tileData, group: data.group } : tileData });
        onClose(); // Close details panel
        break;

      case 'build':
        onShowModal({ type: 'build', data: tileData });
        onClose(); // Close details panel
        break;
        
      case 'attack':
        onShowModal({ type: 'attack', data: tileData });
        onClose(); // Close details panel
        break;
        
      case 'gather':
        console.log('Starting gather action with data:', data);
        console.log('Tile data:', tileData);
        
        // Fix: Ensure we always include the tileData, regardless of whether a specific group was selected
        const gatherData = data && data.group 
          ? { ...tileData, group: data.group } 
          : { ...tileData };
          
        onShowModal({ type: 'gather', data: gatherData });
        onClose(); // Close details panel
        break;
        
      case 'demobilise':
        onShowModal({ type: 'demobilise', data: tileData });
        onClose(); // Close details panel
        break;
        
      case 'joinBattle':
        onShowModal({ type: 'joinBattle', data: data ? { ...tileData, group: data.group } : tileData });
        onClose(); // Close details panel
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
        onClose(); // Close details panel
        break;
        
      // Change 'recruit' to 'recruitment' to match what +page.svelte expects
      case 'recruit':
        onShowModal({ type: 'recruitment', data: tileData });
        onClose(); // Close details panel
        break;
        
      case 'craft':
        onShowModal({ 
          type: 'craft', 
          data: { 
            x: tileData.x, 
            y: tileData.y, 
            structure: tileData.structure,
            tile: tileData
          } 
        });
        onClose(); // Close details panel
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
    if (!tile || !$currentPlayer || !tile.structure) return false;
    
    // Check if there are any player-owned groups that are idle
    return tile.groups?.some(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle'
    );
  }

  function canBuild(tile) {
    return !tile?.structure && tile.groups?.some(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle'
    );
  };
  
  function canMove(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if there are any player-owned groups that are idle
    return tile.groups?.some(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle'
    );
  }
  
  // Add new function to check if attack is possible
  function canAttack(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if there are any player-owned groups that are idle
    const playerGroups = tile.groups?.filter(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle'
    );
    
    // Check if there are any enemy groups on the tile
    // Now includes both idle and gathering status
    const enemyGroups = tile.groups?.filter(g => 
      g.owner !== $currentPlayer.id && 
      (g.status === 'idle' || g.status === 'gathering')
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
      g.status === 'idle'
    );
  }
  
  function canCraft(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if player is at a structure
    const hasStructure = !!tile.structure;
    const playerOnTile = tile.players?.some(p => p.id === $currentPlayer.id);
    
    // Check if player is in an idle group
    const playerInIdleGroup = tile.groups?.some(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle'
    );
    
    // Can craft if player is at a structure OR in an idle group
    return (hasStructure && playerOnTile) || playerInIdleGroup;
  }
  
  function canJoinBattle(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if there's battle and player has idle groups
    return tile.battles?.length > 0 &&
           tile.groups?.some(g => 
             g.owner === $currentPlayer.id && 
             g.status === 'idle'
           );
  }

  // Add function to check if recruitment is possible
  function canRecruit(tile) {
    if (!tile || !$currentPlayer || !tile.structure) return false;
    
    // Player must be on tile as an entity
    const playerOnTile = tile.players?.some(p => p.id === $currentPlayer.id);
    
    // Player should not be in a mobilizing or demobilising group
    const inProcessGroup = tile.groups?.some(g => 
      (g.status === 'mobilizing' || g.status === 'demobilising') && 
      g.owner === $currentPlayer.id
    );
    
    // Check if player is on tile but not already in a group
    return playerOnTile && !inProcessGroup;
  }
  
  // Add function to check if player can be mobilized
  function canMobilizePlayer(player) {
    if (!player || !$currentPlayer || player.id !== $currentPlayer.id) return false;
    
    // Check if player is not already in a mobilizing/demobilising group
    const inProcessGroup = detailsData?.groups?.some(g => 
      (g.status === 'mobilizing' || g.status === 'demobilising') && 
      g.owner === $currentPlayer.id
    );
    
    return !inProcessGroup;
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
  
  // Function to count units in a group
  function getGroupUnitCount(group) {
    if (!group.units) return 0;
    return Array.isArray(group.units) ? group.units.length : Object.keys(group.units).length;
  }

  // Format total power for each side
  function formatPower(power) {
    if (!power && power !== 0) return '?';
    return power.toLocaleString();
  }

  // Determine winning side CSS class
  function getWinningSideClass(battle, side) {
    if (!battle) return '';
    return battle.winner === side ? 'winning-side' : 'losing-side';
  }

  // Get battle participant groups count for each side
  function getParticipantCountBySide(battle, side) {
    if (!battle) return 0;
    return side === 1 ? 
      (battle.side1?.groups ? Object.keys(battle.side1.groups).length : 0) : 
      (battle.side2?.groups ? Object.keys(battle.side2.groups).length : 0);
  }

  // Get unit count for a side in battle
  function getUnitCountForSide(battle, side) {
    if (!battle) return 0;
    const sideData = side === 1 ? battle.side1 : battle.side2;
    if (!sideData?.groups) return 0;
    
    return Object.values(sideData.groups).reduce((count, g) => 
      count + (g.units ? Object.keys(g.units).length : 0), 0);
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

  // Track cancellation state
  let cancellingGroupId = $state(null);

  // Function to cancel group movement
  async function cancelGroupMove(group, event) {
    if (!group || !$currentPlayer || cancellingGroupId) {
      return;
    }
    
    // Stop event propagation to prevent other click handlers from triggering
    if (event) {
      event.stopPropagation();
    }
    
    // Set cancelling state
    cancellingGroupId = group.id;
    
    try {
      // Get Firebase functions
      const functions = getFunctions();
      const cancelMoveFunction = httpsCallable(functions, 'cancelMove');
      
      // Call the cancelMove function with group and location data
      const result = await cancelMoveFunction({
        groupId: group.id,
        x: group.x,
        y: group.y,
        worldId: $game.worldKey
      });
      
      console.log('Movement cancelled successfully:', result.data);
      
      // No need to update UI here as Firebase will trigger changes via subscription
    } catch (error) {
      console.error('Error cancelling movement:', error);
    } finally {
      // Clear cancelling state
      cancellingGroupId = null;
    }
  }

  // Add state to track fleeing group ID
  let fleeingGroupId = $state(null);

  // Add function to check if a group can flee from battle
  function canFleeFromBattle(group) {
    if (!group || !$currentPlayer) return false;
    
    // Group must be owned by current player, in battle, and not already fleeing
    return group.owner === $currentPlayer.id && 
           group.battleId && 
           fleeingGroupId !== group.id;
  }

  // Function to handle fleeing from battle
  async function handleFleeBattle(group, event) {
    if (!group || !$currentPlayer || fleeingGroupId) {
      return;
    }
    
    // Stop event propagation
    if (event) {
      event.stopPropagation();
    }
    
    // Set fleeing state
    fleeingGroupId = group.id;
    
    try {
      // Get Firebase functions
      const functions = getFunctions();
      const fleeBattleFunction = httpsCallable(functions, 'fleeBattle');
      
      // Call the fleeBattle function with group data
      const result = await fleeBattleFunction({
        groupId: group.id,
        x: group.x,
        y: group.y,
        worldId: $game.worldKey
      });
      
      console.log('Successfully fled from battle:', result.data);
      
      // No need to update UI manually as Firebase will trigger changes
    } catch (error) {
      console.error('Error fleeing from battle:', error);
    } finally {
      // Clear fleeing state
      fleeingGroupId = null;
    }
  }
</script>

<!-- Add global keyboard event listener -->
<svelte:window on:keydown={handleKeyDown} />

<div 
  class="modal-container" 
  class:ready={isReady} 
  class:active={isActive}
  onmouseenter={onMouseEnter}
  role="dialog"
  aria-label="Tile details"
  aria-modal="true"
>
  <div class="details-modal" key={renderKey}>
    <header class="modal-header">
      <h3>
        Tile Details {detailsData ? `(${detailsData.x},${detailsData.y})` : ''}
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
            {#if detailsData?.structure}
              <div class="structure-column">
                <div class="attribute">
                  <span class="attribute-label">Name</span>
                  <span class="attribute-value structure-name">
                    {detailsData.structure.name || _fmt(detailsData.structure.type) || 'Unnamed Structure'}
                    {#if isOwnedByCurrentPlayer(detailsData.structure)}
                      <span class="entity-badge owner-badge">Yours</span>
                    {/if}
                    {#if detailsData.structure.status === 'building'}
                      <span class="entity-badge building-badge">Building</span>
                    {/if}
                  </span>
                </div>
                
                <div class="attribute">
                  <span class="attribute-label">Type</span>
                  <span class="attribute-value structure-type">
                    <span class="structure-type-icon-container">
                      {#if detailsData.structure.type === 'spawn'}
                        <Torch size="1.2em" extraClass="structure-type-icon" />
                      {:else}
                        <Structure size="1.2em" extraClass="structure-type-icon {detailsData.structure.type}-icon" />
                      {/if}
                    </span>
                    {_fmt(detailsData.structure.type)}
                  </span>
                </div>
              </div>
            {/if}
            
            <!-- Right column: Terrain Information -->
            <div class="terrain-column">
              <div class="attribute">
                <span class="attribute-label">Type</span>
                <span class="attribute-value">
                  <span class="terrain-color" style="background-color: {detailsData?.terrain?.color || detailsData?.color || '#cccccc'}"></span>
                  {_fmt(detailsData?.terrain?.biome?.name || 'Unknown')}
                </span>
              </div>
              
              {#if detailsData?.terrain?.rarity || detailsData?.rarity}
                <div class="attribute">
                  <span class="attribute-label">Rarity</span>
                  <span class="attribute-value">
                    <span class="rarity-badge {(detailsData?.terrain?.rarity || detailsData?.rarity)?.toLowerCase()}">
                      {_fmt(detailsData?.terrain?.rarity || detailsData?.rarity)}
                    </span>
                  </span>
                </div>
              {/if}
              
              <div class="attribute">
                <span class="attribute-label">Coordinates</span>
                <span class="attribute-value">{detailsData ? formatCoords(detailsData.x, detailsData.y) : ''}</span>
              </div>
            </div>
          </div>
          
          <!-- Available actions section in same container -->
          {#if detailsData}
            <div class="core-actions">
              <div class="actions-grid">
                {#if detailsData.structure}
                  <button class="action-button inspect-button" onclick={() => executeAction('inspect')}>
                    <Eye extraClass="action-icon eye-icon" />
                    Inspect
                  </button>
                {/if}
                
                {#if canMobilize(detailsData)}
                  <button class="action-button" onclick={() => executeAction('mobilise')}>
                    <Rally extraClass="action-icon rally-icon" />
                    Mobilise
                  </button>
                {/if}
                
                {#if canRecruit(detailsData)}
                  <button class="action-button" onclick={() => executeAction('recruit')}>
                    <Horn extraClass="action-icon horn-icon" />
                    Recruit
                  </button>
                {/if}
                
                {#if canMove(detailsData)}
                  <button class="action-button" onclick={() => executeAction('move')}>
                    <Compass extraClass="action-icon compass-icon" />
                    Move
                  </button>
                {/if}
                
                {#if canAttack(detailsData)}
                  <button class="action-button attack-button" onclick={() => executeAction('attack')}>
                    <Sword extraClass="action-icon attack-icon" />
                    Attack
                  </button>
                {/if}

                {#if canBuild(detailsData)}
                  <button class="action-button" onclick={() => executeAction('build')}>
                    <Hammer extraClass="action-icon hammer-icon" />
                    Build
                  </button>
                {/if}
                
                {#if canCraft(detailsData)}
                  <button class="action-button craft-button" onclick={() => executeAction('craft')}>
                    <Hammer extraClass="action-icon hammer-icon" />
                    Craft
                  </button>
                {/if}
                
                {#if canGather(detailsData)}
                  <button class="action-button" onclick={() => executeAction('gather', { source: 'details' })}>
                    <Crop extraClass="action-icon crop-icon" />
                    Gather
                  </button>
                {/if}
                
                {#if canJoinBattle(detailsData)}
                  <button class="action-button" onclick={() => executeAction('joinBattle')}>
                    Join Battle
                  </button>
                {/if}
                
                {#if canDemobilize(detailsData)}
                  <button class="action-button" onclick={() => executeAction('demobilise')}>
                    {#if detailsData.structure?.type === 'spawn'}
                      <Torch extraClass="action-icon torch-icon" />
                    {:else}
                      <Structure extraClass="action-icon structure-icon" />
                    {/if}
                    Demobilise
                  </button>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>
      
      <!-- Groups section with styled count -->
      {#if detailsData.groups?.length > 0}
        <div class="entities-section">
          <div 
            class="section-header"
            onclick={() => toggleSection('groups')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.groups}
            onkeydown={(e) => handleSectionKeyDown(e, 'groups')}
          >
            <div class="section-title">
              Groups <span class="entity-count groups-count">{detailsData.groups.length}</span>
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
                  <button 
                    class="sort-option" 
                    class:active={sortOptions.groups.by === 'power'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('groups', 'power'); }}
                  >
                    <span>Power</span>
                    {#if sortOptions.groups.by === 'power'}
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
                  <div class="entity-left">
                    <div class="entity-icon">
                      {#if group.type === 'monster'}
                        <Monster extraClass="race-icon-details" />
                      {:else if group.race}
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
                        <span class="group-power">({formatPower(calculateGroupPower(group))})</span>
                        {#if isOwnedByCurrentPlayer(group)}
                          <span class="entity-badge owner-badge">Yours</span>
                        {/if}
                        <span class="entity-coords">({formatCoords(group.x, group.y)})</span>
                      </div>
                      
                      <div class="entity-details">
                        <div class="entity-details-left">
                          <span class="unit-count">
                            {getGroupUnitCount(group)} units
                            {#if getGroupItemCount(group) > 0}
                              • <span class="item-count">{getGroupItemCount(group)} items</span>
                            {/if}
                            {#if getGroupUnitCount(group) > 0}
                              <button 
                                class="toggle-units-btn"
                                onclick={(e) => toggleGroupDetails(group.id, e)}
                                aria-expanded={!!expandedGroups[group.id]}
                              >
                                {expandedGroups[group.id] ? 'Hide' : 'Show'}
                              </button>
                            {/if}
                          </span>
                          
                          <!-- Replace manual status rendering with GroupStatus component -->
                          <GroupStatus {group} />
                        </div>
                      </div>
                      
                      <!-- Add expandable units list -->
                      {#if expandedGroups[group.id] && group.units && getGroupUnitCount(group) > 0}
                        <div class="group-units-list">
                          {#each Object.entries(group.units) as [unitId, unit]}
                            <div class="group-unit">
                              <div class="unit-icon">
                                {#if unit.type === 'monster'}
                                  <Monster extraClass="unit-race-icon" />
                                {:else if unit.race}
                                  {#if unit.race.toLowerCase() === 'human'}
                                    <Human extraClass="unit-race-icon" />
                                  {:else if unit.race.toLowerCase() === 'elf'}
                                    <Elf extraClass="unit-race-icon" />
                                  {:else if unit.race.toLowerCase() === 'dwarf'}
                                    <Dwarf extraClass="unit-race-icon" />
                                  {:else if unit.race.toLowerCase() === 'goblin'}
                                    <Goblin extraClass="unit-race-icon" />
                                  {:else if unit.race.toLowerCase() === 'fairy'}
                                    <Fairy extraClass="unit-race-icon" />
                                  {/if}
                                {/if}
                              </div>
                              <div class="unit-info">
                                <div class="unit-name">
                                  {unit.displayName || unit.name || unit.type || unitId.slice(-5)}
                                  {#if unit.id === $currentPlayer?.id}
                                    <span class="entity-badge owner-badge">You</span>
                                  {/if}
                                </div>
                                <div class="unit-details">
                                  {#if unit.race}
                                    <span class="unit-race-tag">{_fmt(unit.race)}</span>
                                  {/if}
                                  {#if unit.type && unit.type !== 'player'}
                                    <span class="unit-type-tag">{_fmt(unit.type)}</span>
                                  {/if}
                                  {#if unit.type === 'player'}
                                    <span class="unit-type-tag player">Player</span>
                                  {/if}
                                </div>
                              </div>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </div>
                  
                  {#if isOwnedByCurrentPlayer(group) && group.status === 'idle'}
                    <div class="entity-actions">
                      <button class="entity-action" onclick={() => executeAction('move', { group })}>
                        <Compass extraClass="action-icon-small compass-icon" />
                        Move
                      </button>
                      {#if detailsData.items?.length > 0}
                        <button class="entity-action" onclick={() => executeAction('gather', { group })}>
                          <Crop extraClass="action-icon-small crop-icon" />
                          Gather
                        </button>
                      {/if}
                      {#if detailsData.battles?.length > 0}
                        <button class="entity-action" onclick={() => executeAction('joinBattle', { group })}>
                          Join Battle
                        </button>
                      {/if}
                    </div>
                  {:else if isOwnedByCurrentPlayer(group) && group.status === 'moving'}
                    <div class="entity-actions">
                      <button 
                        class="entity-action cancel-action" 
                        onclick={(e) => cancelGroupMove(group, e)}
                        disabled={cancellingGroupId === group.id}
                      >
                        <Cancel extraClass="action-icon-small cancel-icon" />
                        {cancellingGroupId === group.id ? 'Cancelling...' : 'Cancel Move'}
                      </button>
                    </div>
                  {:else if canFleeFromBattle(group)}
                    <!-- Add new flee button for groups in battle -->
                    <div class="entity-actions">
                      <button 
                        class="entity-action flee-action" 
                        onclick={(e) => handleFleeBattle(group, e)}
                        disabled={fleeingGroupId === group.id}
                      >
                        <Cancel extraClass="action-icon-small flee-icon" />
                        {fleeingGroupId === group.id ? 'Fleeing...' : 'Flee Battle'}
                      </button>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      
      <!-- Players section with styled count -->
      {#if detailsData.players?.length > 0}
        <div class="entities-section">
          <div 
            class="section-header"
            onclick={() => toggleSection('players')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.players}
            onkeydown={(e) => handleSectionKeyDown(e, 'players')}
          >
            <div class="section-title">
              Players <span class="entity-count players-count">{detailsData.players.length}</span>
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
                      <span class="entity-coords">({formatCoords(player.x, player.y)})</span>
                    </div>
                    <div class="entity-details">
                      <div class="entity-details-left">
                        {#if player.race}
                          <div class="entity-race">{_fmt(player.race)}</div>
                        {/if}
                        
                        {#if player.status}
                          <span class="entity-badge {getStatusClass(player.status)}">
                            {_fmt(player.status)}
                          </span>
                        {/if}
                      </div>
                    </div>
                    
                    <!-- Add mobilise action for idle current player -->
                    {#if canMobilizePlayer(player)}
                      <div class="entity-actions">
                        <button class="entity-action" onclick={() => executeAction('mobilise')}>
                          <Rally extraClass="action-icon-small rally-icon" />
                          Mobilise
                        </button>
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      
      <!-- Items section with styled count -->
      {#if detailsData.items?.length > 0}
        <div class="entities-section">
          <div 
            class="section-header"
            onclick={() => toggleSection('items')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.items}
            onkeydown={(e) => handleSectionKeyDown(e, 'items')}
          >
            <div class="section-title">
              Items <span class="entity-count items-count">{detailsData.items.length}</span>
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
                      <span class="entity-coords">({formatCoords(item.x, item.y)})</span>
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
      {#if detailsData.battles?.length > 0}
        <div class="entities-section">
          <div 
            class="section-header"
            onclick={() => toggleSection('battles')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.battles}
            onkeydown={(e) => handleSectionKeyDown(e, 'battles')}
          >
            <div class="section-title">
              Battles <span class="entity-count battles-count">{detailsData.battles.length}</span>
            </div>
            <div class="section-controls">
              {#if !collapsedSections.battles}
                <div class="sort-controls">
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
                    </div>
                    
                    <div class="entity-details">
                      <div class="battle-sides">
                        <div class="battle-side side1 {getWinningSideClass(battle, 1)}">
                          <span class="side-name">Side 1:</span> 
                          {getParticipantCountBySide(battle, 1)} groups
                          ({formatPower(battle.side1?.power)})
                          {#if battle.winner === 1}
                            <span class="battle-winner">Winner</span>
                          {/if}
                        </div>
                        
                        <div class="battle-side side2 {getWinningSideClass(battle, 2)}">
                          <span class="side-name">Side 2:</span> 
                          {getParticipantCountBySide(battle, 2)} groups
                          ({formatPower(battle.side2?.power)})
                          {#if battle.winner === 2}
                            <span class="battle-winner">Winner</span>
                          {/if}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {#if canJoinBattle(detailsData)}
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
    transition: opacity 0.2s ease-out, z-index 0s;
  }

  .modal-container.active {
    z-index: 1001;
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.8em 1em;
    background: rgba(0, 0, 0, 0.05);
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }

  h3 {
    margin: 0;
    font-size: 1.3em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.8);
    font-family: var(--font-heading);
  }

  .close-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.3em;
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
    padding: 1em 1.5em 1.5em;
    overflow-y: auto;
    max-height: calc(85vh - 4em);
    color: rgba(0, 0, 0, 0.8);
  }

  .core-section {
    padding-bottom: 1em;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    margin-bottom: 1em;
    background-color: rgba(255, 255, 255, 0.5);
    border-radius: 0.3em;
    border: 1px solid rgba(0, 0, 0, 0.1);
    padding: 0.8em;
  }

  .core-content {
    padding: 0;
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

  .core-actions {
    margin-top: 1em;
  }
  
  .entities-section {
    margin-bottom: 1.2em;
    border-radius: 0.3em;
    overflow: hidden;
  }
  
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5em 1em;
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

  
  .entity-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 1em;
    font-size: 0.7em;
    font-weight: bold;
    padding: 0.1em 0.6em;
    margin-left: 0.3em;
    line-height: 1;
    background: rgba(0, 0, 0, 0.2);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 0 0.15em rgba(255, 255, 255, 0.2);
  }

  /* Add specific entity count colors to match Overview.svelte */
  .entity-count.groups-count {
    background: rgba(255, 100, 100, 0.9);
    box-shadow: 0 0 0.15em rgba(255, 100, 100, 0.6);
  }

  .entity-count.players-count {
    background: rgba(100, 100, 255, 0.9);
    box-shadow: 0 0 0.15em rgba(100, 100, 255, 0.6);
  }

  .entity-count.items-count {
    background: rgba(255, 215, 0, 0.9);
    box-shadow: 0 0 0.15em rgba(255, 215, 0, 0.6);
  }

  .entity-count.battles-count {
    background: rgba(139, 0, 0, 0.8);
    box-shadow: 0 0 0.15em rgba(139, 0, 0, 0.6);
  }

  .entity-count.structures-count {
    background: rgba(0, 0, 0, 0.9);
    box-shadow: 0 0 0.15em rgba(0, 0, 0, 0.6);
    color: rgba(255, 255, 255, 0.9);
  }

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
  
  
  .section-content {
    padding: 0.5em;
  }

  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.5em;
  }

  
  .action-button {
    padding: 0.6em;
    background-color: rgba(200, 200, 200, 0.1); 
    border: 1px solid rgba(200, 200, 200, 0.3);
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
    background-color: rgba(200, 200, 200, 0.2);
    transform: translateY(-1px);
  }
  
  
  .inspect-button {
    background-color: rgba(33, 150, 243, 0.1);
    border-color: rgba(33, 150, 243, 0.3);
  }
  
  .inspect-button:hover {
    background-color: rgba(33, 150, 243, 0.2);
  }

  
  .action-button:has(.compass-icon) {
    background-color: rgba(76, 175, 80, 0.1);
    border-color: rgba(76, 175, 80, 0.3);
    color: rgba(0, 0, 0, 0.8); 
  }
  
  .action-button:has(.compass-icon):hover {
    background-color: rgba(76, 175, 80, 0.2);
  }
  
  
  .action-button:has(.crop-icon) {
    background-color: rgba(255, 193, 7, 0.1);
    border-color: rgba(255, 193, 7, 0.3);
  }
  
  .action-button:has(.crop-icon):hover {
    background-color: rgba(255, 193, 7, 0.2);
  }

  
  .action-button:has(.structure-icon),
  .action-button:has(.torch-icon) {
    background-color: rgba(0, 150, 136, 0.1);
    border-color: rgba(0, 150, 136, 0.3);
  }
  
  .action-button:has(.structure-icon):hover,
  .action-button:has(.torch-icon):hover {
    background-color: rgba(0, 150, 136, 0.2);
  }

  
  .attack-button {
    background-color: rgba(244, 67, 54, 0.1);
    border-color: rgba(244, 67, 54, 0.3);
  }

  .attack-button:hover {
    background-color: rgba(244, 67, 54, 0.2);
  }

  
  .action-button:has(.rally-icon) {
    background-color: rgba(63, 81, 181, 0.1);
    border-color: rgba(63, 81, 181, 0.3);
  }
  
  .action-button:has(.rally-icon):hover {
    background-color: rgba(63, 81, 181, 0.2);
  }
  
  /* Add styling for horn icon (recruit action) */
  .action-button:has(.horn-icon) {
    background-color: rgba(156, 39, 176, 0.1);
    border-color: rgba(156, 39, 176, 0.3);
  }
  
  .action-button:has(.horn-icon):hover {
    background-color: rgba(156, 39, 176, 0.2);
  }

  
  .action-button:not(:has(.action-icon)) {
    background-color: rgba(183, 28, 28, 0.1);
    border-color: rgba(183, 28, 28, 0.3);
  }
  
  .action-button:not(:has(.action-icon)):hover {
    background-color: rgba(183, 28, 28, 0.2);
  }

  
  .entity-action:has(.compass-icon) {
    background-color: rgba(76, 175, 80, 0.1);
    border-color: rgba(76, 175, 80, 0.3);
  }
  
  .entity-action:has(.compass-icon):hover {
    background-color: rgba(76, 175, 80, 0.2);
  }
  
  .entity-action:has(.crop-icon) {
    background-color: rgba(255, 193, 7, 0.1);
    border-color: rgba(255, 193, 7, 0.3);
  }
  
  .entity-action:has(.crop-icon):hover {
    background-color: rgba(255, 193, 7, 0.2);
  }
  
  .entity-action:has(.rally-icon) {
    background-color: rgba(63, 81, 181, 0.1);
    border-color: rgba(63, 81, 181, 0.3);
  }
  
  .entity-action:has(.rally-icon):hover {
    background-color: rgba(63, 81, 181, 0.2);
  }

  /* Add styling for horn icon in entity actions */
  .entity-action:has(.horn-icon) {
    background-color: rgba(156, 39, 176, 0.1);
    border-color: rgba(156, 39, 176, 0.3);
  }
  
  .entity-action:has(.horn-icon):hover {
    background-color: rgba(156, 39, 176, 0.2);
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
    margin-right: 0.5em;
  }

  .item-quantity {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.6);
    margin-left: 0.2em;
    margin-right: 0.5em;
  }

  
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
    width: 100%;
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

  /* Consolidated entity-badge styles */
  .entity-badge {
    display: inline-block;
    font-size: 0.8em;
    font-weight: 500;
    padding: 0.1em 0.5em;
    border-radius: 0.3em;
    white-space: nowrap;
    text-transform: capitalize;
    flex-shrink: 0; 
    align-self: flex-start; 
  }
  
  .entity-badge.idle {
    background: rgba(128, 128, 128, 0.15);
    border: 1px solid rgba(128, 128, 128, 0.3);
    color: rgba(0, 0, 0, 0.7);
  }
  
  .entity-badge.moving {
    background: rgba(0, 128, 0, 0.15);
    border: 1px solid rgba(0, 128, 0, 0.3);
    color: #006400;
  }
  
  .entity-badge.mobilizing {
    background: rgba(255, 140, 0, 0.15);
    border: 1px solid rgba(255, 140, 0, 0.3);
    color: #d06000;
  }
  
  .entity-badge.demobilising {
    background: rgba(138, 43, 226, 0.15);
    border:1px solid rgba(138, 43, 226, 0.3);
    color: #6a1b9a;
  }
  
  .entity-badge.gathering {
    background: rgba(138, 43, 226, 0.15);
    border: 1px solid rgba(138, 43, 226, 0.3);
    color: #8a2be2;
  }
  
  .entity-badge.fighting {
    background: rgba(220, 20, 60, 0.15);
    border: 1px solid rgba(220, 20, 60, 0.3);
    color: #c62828;
  }
  
  .entity-badge.active {
    background: rgba(255, 0, 0, 0.15);
    border: 1px solid rgba(255, 0, 0, 0.3);
    color: #d32f2f;
  }
  
  .entity-badge.resolved {
    background: rgba(0, 128, 0, 0.15);
    border: 1px solid rgba(0, 128, 0, 0.3);
    color: #2e7d32;
  }
  
  .entity-badge.pending-tick {
    position: relative;
    animation: pulse 1s infinite alternate;
  }
  
  .entity-badge.pending-tick::after {
    content: '↻';
    margin-left: 0.3em;
    font-weight: bold;
  }

  .entity-badge.owner-badge {
    background-color: rgba(76, 175, 80, 0.2);
    color: #2e7d32;
    border: 1px solid rgba(76, 175, 80, 0.4);
  }

  /* Consolidated rarity-badge styles */
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
  }
  
  .rarity-badge.rare {
    background-color: rgba(33, 150, 243, 0.2);
    color: #0277bd;
  }
  
  .rarity-badge.epic {
    background-color: rgba(156, 39, 176, 0.2);
    color: #7b1fa2;
  }
  
  .rarity-badge.legendary {
    background-color: rgba(255, 152, 0, 0.2);
    color: #ef6c00;
  }
  
  .rarity-badge.mythic {
    background-color: rgba(233, 30, 99, 0.2);
    color: #c2185b;
    border: 1px solid rgba(233, 30, 99, 0.4);
  }

  /* Consolidated animations */
  @keyframes pulse {
    from { opacity: 0.8; }
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

  .structure-name {
    color: rgba(0, 0, 0, 1); 
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
  
  
  :global(.race-icon-details) {
    width: 1.4em;
    height: 1.4em;
    opacity: 0.85;
    fill: rgba(0, 0, 0, 0.7);
  }
  
  
  :global(.race-icon-details.fairy-icon path) {
    fill: rgba(138, 43, 226, 0.8);
  }
  
  :global(.race-icon-details.goblin-icon path) {
    fill: rgba(0, 128, 0, 0.8);
  }
  
  :global(.entity-race-icon) {
    margin-right: 0.7em;
    margin-top: 0.1em;
    flex-shrink: 0;
  }

  
  .tile-info-container {
    display: flex;
    flex-direction: column;
    gap: 0.8em;
  }
  
  
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

  
  .entity {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.6em;
    padding: 0.5em 0.7em;
    border-radius: 0.3em;
    background-color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(0, 0, 0, 0.1);
    transition: background-color 0.2s ease;
    position: relative;
    cursor: pointer;
  }

  .entity-left {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    gap: 1em; /* Add 1em gap between icon and content */
  }
  
  /* Add spacing for player entity icons to match the gap in entity-left */
  .entity.player .entity-icon {
    margin-right: 1em;
  }
  
  .entity-info {
    flex: 1;
    min-width: 0;
    margin-right: 0.5em  }

  .entity-actions {
    width: auto;
    margin-left: auto;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4em;
    align-self: center;
  }

  
  .entity-name, .entity-details {
    width: 100%;
  }

  
  .entity-details {
    display: flex;
    flex-wrap: wrap;
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.7);
  }
  
  /* Add styling for cancel button */
  .entity-action.cancel-action {
    background-color: rgba(244, 67, 54, 0.1);
    border-color: rgba(244, 67, 54, 0.3);
    color: rgba(244, 67, 54, 0.9);
  }
  
  .entity-action.cancel-action:hover:not(:disabled) {
    background-color: rgba(244, 67, 54, 0.2);
    transform: translateY(-1px);
  }
  
  .entity-action.cancel-action:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  /* Add the flee-action button style */
  .entity-action.flee-action {
    background-color: rgba(156, 39, 176, 0.1);
    border-color: rgba(156, 39, 176, 0.3);
    color: rgba(156, 39, 176, 0.9);
  }
  
  .entity-action.flee-action:hover:not(:disabled) {
    background-color: rgba(156, 39, 176, 0.2);
    transform: translateY(-1px);
  }
  
  .entity-action.flee-action:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .group-power {
    font-weight: 500;
    color: #d32f2f;
    margin-left: 0.3em;
    font-size: 0.9em;
  }
  
  .side-power {
    color: #d32f2f;
    font-weight: 500;
    font-size: 0.9em;
    margin-left: 0.3em;
  }
  
  /* Group units list styling */
  .toggle-units-btn {
    background: none;
    border: none;
    color: rgba(66, 133, 244, 0.9);
    cursor: pointer;
    font-size: 0.9em;
    margin-left: 0.5em;
    padding: 0.1em 0.3em;
    border-radius: 0.2em;
    transition: background-color 0.2s ease;
  }
  
  .toggle-units-btn:hover {
    background-color: rgba(66, 133, 244, 0.1);
    text-decoration: underline;
  }
  
  .group-units-list {
    margin-top: 0.5em;
    padding: 0.5em;
    background-color: rgba(0, 0, 0, 0.02);
    border-radius: 0.3em;
    border: 1px solid rgba(0, 0, 0, 0.05);
    font-size: 0.9em;
    max-height: 10em;
    overflow-y: auto;
  }
  
  .group-unit {
    display: flex;
    align-items: center;
    padding: 0.2em 0;
    border-bottom: 1px dashed rgba(0, 0, 0, 0.05);
  }
  
  .group-unit:last-child {
    border-bottom: none;
  }
  
  .unit-icon {
    margin-right: 0.5em;
    display: flex;
    align-items: center;
  }
  
  :global(.unit-race-icon) {
    width: 1em;
    height: 1em;
    opacity: 0.7;
  }
  
  .unit-info {
    flex: 1;
  }
  
  .unit-name {
    font-weight: 500;
    font-size: 0.9em;
    display: flex;
    align-items: center;
    gap: 0.4em;
  }
  
  .unit-details {
    display: flex;
    gap: 0.3em;
    font-size: 0.8em;
    margin-top: 0.1em;
  }
  
  .unit-race-tag, .unit-type-tag {
    padding: 0.1em 0.3em;
    border-radius: 0.2em;
    background-color: rgba(0, 0, 0, 0.05);
    color: rgba(0, 0, 0, 0.7);
  }
  
  .unit-type-tag.player {
    background-color: rgba(66, 133, 244, 0.1);
    color: rgba(66, 133, 244, 0.9);
  }
  
  /* Enhanced battle styling */
  .battle-groups-details {
    margin-top: 0.3em;
    font-size: 0.9em;
  }
  
  .battle-group {
    margin-bottom: 0.2em;
  }
  
  .group-info {
    display: flex;
    gap: 0.3em;
    align-items: center;
  }
  
  .group-name {
    font-weight: 500;
  }
  
  .group-race, .group-type {
    font-size: 0.85em;
    padding: 0.1em 0.3em;
    border-radius: 0.2em;
    background-color: rgba(0, 0, 0, 0.05);
    color: rgba(0, 0, 0, 0.7);
  }
  
  .casualties-tag {
    display: inline-block;
    font-size: 0.85em;
    padding: 0.1em 0.3em;
    border-radius: 0.2em;
    margin-left: 0.2em;
    background-color: rgba(220, 20, 60, 0.1);
    border: 1px solid rgba(220, 20, 60, 0.2);
    color: #c62828;
  }
</style>