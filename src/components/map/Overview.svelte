<script>
  import { onMount, onDestroy } from 'svelte';
  import { entities, targetStore, coordinates, moveTarget, setHighlighted } from '../../lib/stores/map';
  import { game, currentPlayer, calculateNextTickTime, formatTimeUntilNextTick, timeUntilNextTick } from '../../lib/stores/game';
  
  // Import race icon components
  import Human from '../icons/Human.svelte';
  import Elf from '../icons/Elf.svelte';
  import Dwarf from '../icons/Dwarf.svelte';
  import Goblin from '../icons/Goblin.svelte';
  import Fairy from '../icons/Fairy.svelte';
  import Structure from '../icons/Structure.svelte';
  import Torch from '../icons/Torch.svelte';
  import Close from '../icons/Close.svelte'; // Add Close icon import
  
  // Props
  const { 
    closing = false, 
    onShowStructure = null, 
    onClose = null,
    isActive = false, // New prop to determine z-index priority
    onMouseEnter = () => {} // Add prop for mouse enter event
  } = $props();
  
  // Format text for display
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  // Timer for updating countdown
  let updateTimer;
  // Counter to force updates
  let updateCounter = $state(0);
  
  // Add filter state
  let activeFilter = $state('all');
  
  // Filter definitions
  const filters = [
    { id: 'all', label: 'All' },
    { id: 'structures', label: 'Structures' },
    { id: 'players', label: 'Players' },
    { id: 'groups', label: 'Groups' },
    { id: 'items', label: 'Items' },
    { id: 'battles', label: 'Battles' }  // Add battles filter
  ];
  
  // Add state to track collapsed sections
  let collapsedSections = $state({
    structures: false,
    players: false,
    groups: false,
    items: false,
    battles: false  // Add battles section
  });

  // Add state to track sorting options
  let sortOptions = $state({
    structures: { by: 'distance', asc: true },
    players: { by: 'distance', asc: true },
    groups: { by: 'distance', asc: true },
    items: { by: 'distance', asc: true },
    battles: { by: 'distance', asc: true }  // Add battles sort options
  });
  
  // Function to toggle section collapse state
  function toggleSection(sectionId, event) {
    // Prevent event from bubbling if provided
    if (event) {
      event.stopPropagation();
    }
    
    // Toggle the collapsed state
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
          valueA = (section === 'structures' ? a.name || _fmt(a.type) : a.name || a.displayName || a.id || '').toLowerCase();
          valueB = (section === 'structures' ? b.name || _fmt(b.type) : b.name || b.displayName || b.id || '').toLowerCase();
          break;
        case 'type':
          valueA = (a.type || a.race || a.race || '').toLowerCase();
          valueB = (b.type || b.race || b.race || '').toLowerCase();
          break;
        case 'rarity':
          // For items
          const rarityOrder = { 'common': 0, 'uncommon': 1, 'rare': 2, 'epic': 3, 'legendary': 4, 'mythic': 5 };
          valueA = rarityOrder[a.rarity?.toLowerCase()] || 0;
          valueB = rarityOrder[b.rarity?.toLowerCase()] || 0;
          break;
        case 'status':
          // For groups
          valueA = a.status || 'idle';
          valueB = b.status || 'idle';
          break;
        case 'distance':
        default:
          valueA = a.distance;
          valueB = b.distance;
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
  const sortedStructures = $derived(sortEntities(allStructures, 'structures'));
  const sortedPlayers = $derived(sortEntities(allPlayers, 'players'));
  const sortedGroups = $derived(sortEntities(allGroups, 'groups'));
  const sortedItems = $derived(sortEntities(allItems, 'items'));
  const sortedBattles = $derived(sortEntities(allBattles, 'battles'));
  
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

  // Simplify the time remaining formatter to use store
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

  // Simplify move completion time calculation
  function calculateMoveCompletionTime(group) {
    if (!group || group.status !== 'moving' || !group.moveStarted) return null;
    
    // Use nextMoveTime from the server if available
    if (group.nextMoveTime) {
      return group.nextMoveTime;
    }
    
    const worldSpeed = $game.worlds[$game.worldKey]?.speed || 1.0;
    const moveStarted = group.moveStarted;
    
    // Basic calculation - 1 minute per movement step adjusted by world speed
    const baseTickInterval = 60000; // 1 minute in milliseconds
    const adjustedInterval = Math.round(baseTickInterval / worldSpeed);
    
    // If we have path information, use it to calculate steps remaining
    let stepsRemaining = 1; // Default to 1 step
    if (group.pathIndex !== undefined && group.movementPath && Array.isArray(group.movementPath)) {
      stepsRemaining = Math.max(1, group.movementPath.length - (group.pathIndex + 1));
    }
    
    // Estimate completion time based on remaining steps
    return moveStarted + (stepsRemaining * adjustedInterval);
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
  
  // Format distance for display
  function formatDistance(distance) {
    if (distance === undefined || distance === null) return '';
    if (distance === 0) return '• Here'; // Add dot character inline with the text
    return `${distance.toFixed(1)} tiles away`;
  }
  
  // Function to handle clicking on a structure
  function handleStructureClick(structure, x, y) {
    console.log('Structure clicked, showing structure overview:', structure);
    if (onShowStructure) {
      onShowStructure({ structure, x, y });
    } else {
      console.log('Structure clicked but no onShowStructure handler provided:', structure);
    }
  }
  
  // Function to handle close button click
  function handleClose() {
    if (onClose) onClose();
  }
  
  // Extract all entities from all visible coordinates - fixed $derived syntax
  const allStructures = $derived(
    $coordinates
      .map(cell => cell.structure ? {
        ...cell.structure,
        x: cell.x,
        y: cell.y,
        distance: cell.distance
      } : null)
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance)
  );
  
  const allPlayers = $derived(
    $coordinates
      .flatMap(cell => 
        (cell.players || []).map(player => ({
          ...player,
          x: cell.x,
          y: cell.y,
          distance: cell.distance
        }))
      )
      .sort((a, b) => a.distance - b.distance)
  );
  
  const allGroups = $derived(
    $coordinates
      .flatMap(cell => 
        (cell.groups || []).map(group => ({
          ...group,
          x: cell.x,
          y: cell.y,
          distance: cell.distance
        }))
      )
      .sort((a, b) => a.distance - b.distance)
  );
  
  const allItems = $derived(
    $coordinates
      .flatMap(cell => 
        (cell.items || []).map(item => ({
          ...item,
          x: cell.x,
          y: cell.y,
          distance: cell.distance
        }))
      )
      .sort((a, b) => a.distance - b.distance)
  );

  // Extract all battles from all visible coordinates - simplified to use direct battle data
  const allBattles = $derived(
    $coordinates || [])
      .flatMap(cell => cell.battles || [])distance - b.distance)
      .map(battle => ({
        ...battle,
        // Make sure we have consistent structure for UI displayd $derived syntax
        sides: {
          side1: battle.side1 || { groups: {}, casualties: 0 },reduce((chunks, cell) => {
          side2: battle.side2 || { groups: {}, casualties: 0 }cell.chunkKey) chunks.add(cell.chunkKey);
        }
      }))Set()).size
      .sort((a, b) => a.distance - b.distance)
  );
   Track non-empty filter types - fix $derived syntax
  // Helper function to process battle data for UI displayconst nonEmptyFilters = $derived([
  function processBattleData(battle, x, y, distance) {
    if (!battle) return null;
? ['groups'] : []),
    // Get groups for each side    ...(allItems.length > 0 ? ['items'] : []),
    const side1Groups = Object.entries(battle.side1?.groups || {}) ['battles'] : [])  // Add battles
      .filter(([_, value]) => value !== null)
      .map(([groupId, info]) => ({ id: groupId, ...info }));
      just multiple types
    const side2Groups = Object.entries(battle.side2?.groups || {})t showFilterTabs = $derived(nonEmptyFilters.length > 0);
      .filter(([_, value]) => value !== null)
      .map(([groupId, info]) => ({ id: groupId, ...info }));ype with content and expand that section

    // Create battle data object with all necessary information    if (nonEmptyFilters.length === 1) {
    return {
      id: battle.id,sedSections[nonEmptyFilters[0]] = false; // Ensure section is expanded
      type: 'battle',ptyFilters.length > 0 && !nonEmptyFilters.includes(activeFilter) && activeFilter !== 'all') {
      x,);
      y,
      distance,
      tickCount: battle.tickCount || 0,
      createdAt: battle.createdAt,le based on the active filter
      sides: {onType) {
        side1: {iveFilter === 'all' || activeFilter === sectionType;
          name: battle.side1?.name || 'Attackers',
          casualties: battle.side1?.casualties || 0,
          groups: side1Groups,d when selecting a specific filter
          count: side1Groups.length,
          power: battle.side1?.power
        },
        side2: {selecting a specific filter (not 'all'), make sure the section is expanded
          name: battle.side2?.name || 'Defenders', == 'all') {
          casualties: battle.side2?.casualties || 0,
          groups: side2Groups,
          count: side2Groups.length,
          power: battle.side2?.power
        } for a given filter
      },n hasContent(filter) {
      winner: battle.winner,ch(filter) {
      status: battle.winner ? 'resolved' : 'active',urn allStructures.length > 0;
      structureId: battle.structureId,
      structureInfo: battle.side2?.structureInfo,length > 0;
      
      // Calculate if current player is involvedcase 'battles': return allBattles.length > 0;
      isPlayerBattle: $currentPlayer && (0 || allPlayers.length > 0 || allGroups.length > 0 || allItems.length > 0 || allBattles.length > 0;
        (Object.values(battle.side1?.groups || {}).some(g => g && g.owner === $currentPlayer.id)) ||
        (Object.values(battle.side2?.groups || {}).some(g => g && g.owner === $currentPlayer.id))
      )
    };
  }alculate count for each filter
  unction getFilterCount(filter) {
  // Calculate visible chunks count - fixed $derived syntax  switch(filter) {
  const visibleChunks = $derived(
    $coordinates.reduce((chunks, cell) => {layers.length;
      if (cell.chunkKey) chunks.add(cell.chunkKey);h;
      return chunks;
    }, new Set()).size: return allBattles.length;
  );0;
  }
  // Track non-empty filter types - fix $derived syntax}
  const nonEmptyFilters = $derived([
    ...(allStructures.length > 0 ? ['structures'] : []),
    ...(allPlayers.length > 0 ? ['players'] : []),
    ...(allGroups.length > 0 ? ['groups'] : []),
    ...(allItems.length > 0 ? ['items'] : []),
    ...(allBattles.length > 0 ? ['battles'] : [])  // Add battles
  ]);
  ction isAtTarget(x, y) {
  // Always show filter tabs if there are any entities, not just multiple types  return $targetStore && $targetStore.x === x && $targetStore.y === y;
  const showFilterTabs = $derived(nonEmptyFilters.length > 0);
  
  // Auto-select filter if there's only one type with content and expand that section// Enhanced handler for entity clicks that supports keyboard events
  $effect(() => {
    if (nonEmptyFilters.length === 1) {ent propagation
      setFilter(nonEmptyFilters[0]);
      collapsedSections[nonEmptyFilters[0]] = false; // Ensure section is expanded
    } else if (nonEmptyFilters.length > 0 && !nonEmptyFilters.includes(activeFilter) && activeFilter !== 'all') {
      setFilter('all');
    }
  });
  
  // Check if a section should be visible based on the active filter  console.log('Navigating to entity at:', x, y);
  function shouldShowSection(sectionType) {
    return activeFilter === 'all' || activeFilter === sectionType;location
  }
   
  // Set active filter and ensure section is expanded when selecting a specific filter  // Also highlight the tile
  function setFilter(filter) {
    activeFilter = filter;
    
    // If selecting a specific filter (not 'all'), make sure the section is expanded Modified function to get sorted tabs with enabled ones first
    if (filter !== 'all') {
      collapsedSections[filter] = false; the first tab
    }d === 'all');
  }
   // Get other tabs and sort them - enabled first, then disabled
  // Calculate if any content exists for a given filter  const otherTabs = filters
  function hasContent(filter) {
    switch(filter) {
      case 'structures': return allStructures.length > 0;ntent = hasContent(a.id);
      case 'players': return allPlayers.length > 0;
      case 'groups': return allGroups.length > 0;
      case 'items': return allItems.length > 0;1;
      case 'battles': return allBattles.length > 0; 1;
      case 'all': return allStructures.length > 0 || allPlayers.length > 0 || allGroups.length > 0 || allItems.length > 0 || allBattles.length > 0;
      default: return false;
    }
  }/ Return all tab followed by sorted others
   return [allTab, ...otherTabs];
  // Calculate count for each filter}
  function getFilterCount(filter) {
    switch(filter) { for a group
      case 'structures': return allStructures.length;temCount(group) {
      case 'players': return allPlayers.length;
      case 'groups': return allGroups.length;tems.length : Object.keys(group.items).length;
      case 'items': return allItems.length;
      case 'battles': return allBattles.length;
      default: return 0;rent player
    }entPlayer(entity) {
  }f (!$currentPlayer || !entity) return false;
   
  // Format coordinates for display  // For player entities, compare the ID directly 
  function formatCoords(x, y) {fined && entity.id !== undefined && !entity.owner) {
    return `${x},${y}`;rentPlayer.id;
  }
   
  // Check if the entity is at the target location  // For other entities like groups or structures, check the owner property
  function isAtTarget(x, y) {ayer.id?.toString();
    return $targetStore && $targetStore.x === x && $targetStore.y === y;
  }
/ Format total power for each side
  // Enhanced handler for entity clicks that supports keyboard events  function formatPower(power) {
  function handleEntityAction(x, y, event) {
    // Prevent event propagation
    event.stopPropagation();
    
    // For keyboard events, only proceed if Enter or Space was pressed Determine winning side CSS class
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
      return;
    }ttle.winner === side ? 'winning-side' : 'losing-side';
    
    console.log('Navigating to entity at:', x, y);
    side
    // Move the map target to the entity's locationnction getParticipantCountBySide(battle, side) {
    moveTarget(x, y);ide]) return 0;
    es[side].groups?.length || 0;
    // Also highlight the tile
    setHighlighted(x, y);
  }yer is participating in battle
unction isPlayerInBattle(battle) {
  // Modified function to get sorted tabs with enabled ones first    if (!battle || !battle.participants || !$currentPlayer) return false;
  function getSortedFilterTabs() {
    // Always keep "all" as the first tabrticipants list
    const allTab = filters.find(f => f.id === 'all');
    Player.id
    // Get other tabs and sort them - enabled first, then disabled);
    const otherTabs = filters
      .filter(f => f.id !== 'all')
      .sort((a, b) => {PlayerAvailableOnTile
        const aHasContent = hasContent(a.id);lableOnTile(tile, playerId) {
        const bHasContent = hasContent(b.id);rs.some(p => p.id === playerId || p.id === playerId)) {
        
        if (aHasContent && !bHasContent) return -1;
        if (!aHasContent && bHasContent) return 1;
        return 0;
      });rInDemobilisingGroup = tile.groups.some(group => 
    roup.status === 'demobilising' && 
    // Return all tab followed by sorted others    group.owner === playerId && 
    return [allTab, ...otherTabs];
  }
   return !playerInDemobilisingGroup;
  // Function to display item count for a group    }
  function getGroupItemCount(group) {
    if (!group.items) return 0;
    return Array.isArray(group.items) ? group.items.length : Object.keys(group.items).length;
  }
/ Add helper function if it's not already defined
  // Function to check if entity belongs to current player  function hasPlayerUnit(group, playerId) {
  function isOwnedByCurrentPlayer(entity) {
    if (!$currentPlayer || !entity) return false;
    
    // For player entities, compare the ID directly   return group.units.some(unit => 
    if (entity.displayName !== undefined && entity.id !== undefined && !entity.owner) {d) && unit.type === 'player'
      return entity.id === $currentPlayer.id;
    }
    
    // For other entities like groups or structures, check the owner propertyreturn Object.values(group.units).some(unit => 
    return entity.owner?.toString() === $currentPlayer.id?.toString();'
  }

  // Format total power for each side  
  function formatPower(power) {ecific tile
    if (!power && power !== 0) return '?';tile, playerId) {
    return power.toLocaleString();) return false;
  }=> 
   group.owner === playerId && 
  // Determine winning side CSS class      group.status === 'idle' && 
  function getWinningSideClass(battle, side) {
    if (!battle) return '';
    return battle.winner === side ? 'winning-side' : 'losing-side';
  }
/ Handle battle-specific actions
  // Get battle participant groups count for each side - simplified  function handleBattleAction(actionType, battle) {
  function getParticipantCountBySide(battle, side) {le:`, battle);
    const sideKey = side === 1 ? 'side1' : 'side2';
    if (!battle || !battle[sideKey] || !battle[sideKey].groups) return 0;
    return Object.keys(battle[sideKey].groups).length;
  } setHighlighted(battle.x, battle.y);
    
  // Check if current player is participating in battle
  function isPlayerInBattle(battle) {{
    if (!battle || !$currentPlayer) return false;
      const tile = $coordinates.find(c => c.x === battle.x && c.y === battle.y);
    // Check if player owns any groups in either side
    const isInSide1 = battle.side1?.groups && Object.keys(battle.side1.groups)', data: tile });
      .some(groupId => {
        const group = $coordinates
          .flatMap(c => c.groups || [])
          .find(g => g.id === groupId);
        return group && group.owner === $currentPlayer.id;
      });
      
    const isInSide2 = battle.side2?.groups && Object.keys(battle.side2.groups)Default();
      .some(groupId => { event.stopPropagation();
        const group = $coordinates  handleClose();
          .flatMap(c => c.groups || [])
          .find(g => g.id === groupId);
        return group && group.owner === $currentPlayer.id;
      });
    
    return isInSide1 || isInSide2;"entities-wrapper" 
  }
ss:active={isActive}
  // Add the missing function - isPlayerAvailableOnTilemouseenter={onMouseEnter}
  function isPlayerAvailableOnTile(tile, playerId) {
    if (!tile || !tile.players || !tile.players.some(p => p.id === playerId || p.id === playerId)) {ria-label="Map entities overview"
      return false;  aria-modal="true"
    }
    
    if (tile.groups) {
      const playerInDemobilisingGroup = tile.groups.some(group =>   Map Entities
        group.status === 'demobilising' && Chunks} chunks visible</span>
        group.owner === playerId && 
        hasPlayerUnit(group, playerId)
      );utton 
      return !playerInDemobilisingGroup;  class="close-button" 
    }    onclick={handleClose} 
    
    return true;
  }>
     <Close size="1.6em" extraClass="close-icon-dark" />
  // Add helper function if it's not already defined    </button>
  function hasPlayerUnit(group, playerId) {
    if (!group || !group.units) return false;
    ities exist -->
    if (Array.isArray(group.units)) {
      return group.units.some(unit => 
        (unit.id === playerId || unit.id === playerId) && unit.type === 'player's() as filter}
      );
    }       class="filter-tab {filter.id === activeFilter ? 'active' : ''} {hasContent(filter.id) ? 'has-content' : ''}"
             onclick={() => setFilter(filter.id)}
    return Object.values(group.units).some(unit =>           disabled={!hasContent(filter.id)}
      (unit.id === playerId || unit.id === playerId) && unit.type === 'player'
    );
  }
            <span class="filter-count" class:filter-count-structures={filter.id === 'structures'} class:filter-count-players={filter.id === 'players'} class:filter-count-groups={filter.id === 'groups'} class:filter-count-items={filter.id === 'items'} class:filter-count-battles={filter.id === 'battles'}>
  // Check if a group is idle on a specific tile
  function hasIdlePlayerGroups(tile, playerId) {
    if (!tile || !tile.groups || !playerId) return false;
    return tile.groups.some(group =>       </button>
      group.owner === playerId && 
      group.status === 'idle' && 
      !group.inBattle
    );
  }ntities-content"> 
  
  // Handle battle-specific actions#if shouldShowSection('structures') && allStructures.length > 0}
  function handleBattleAction(actionType, battle) {   <div class="entities-section">
    console.log(`Battle action: ${actionType} for battle:`, battle);       <!-- Only show section header when on "all" tab -->
              {#if activeFilter === 'all'}
    // Navigate to the battle location first
    moveTarget(battle.x, battle.y);er"
    setHighlighted(battle.x, battle.y);gleSection('structures', e)}
    
    // For join battle, also show the join battle modal
    if (actionType === 'joinBattle') {xpanded={!collapsedSections.structures}
      // Find the tile data for this location         onkeydown={(e) => e.key === 'Enter' && toggleSection('structures', e)}
      const tile = $coordinates.find(c => c.x === battle.x && c.y === battle.y);         >
      if (tile) {     <div class="section-title">
        onShowModal?.({ type: 'joinBattle', data: tile });                Structures <span class="section-count filter-count filter-count-structures">{allStructures.length}</span>
      }     </div>
    }ection-controls">
  }{#if !collapsedSections.structures}
ass="sort-controls">
  // Add function to handle keyboard events
  function handleKeyDown(event) {       class="sort-option"
    if (event.key === 'Escape') {sortOptions.structures.by === 'distance'}
      event.preventDefault();   onclick={(e) => { e.stopPropagation(); setSortOption('structures', 'distance'); }}
      event.stopPropagation();                   >
      handleClose();stance</span>
    }{#if sortOptions.structures.by === 'distance'}
  }      <span class="sort-direction">{sortOptions.structures.asc ? '↑' : '↓'}</span>
</script>
              </button>
<section 
  class="entities-wrapper"         class="sort-option" 
  class:closing ctive={sortOptions.structures.by === 'name'}
  class:active={isActive}{(e) => { e.stopPropagation(); setSortOption('structures', 'name'); }}
  onmouseenter={onMouseEnter}
  role="dialog"
  aria-label="Map entities overview"               {#if sortOptions.structures.by === 'name'}
  aria-modal="true"ptions.structures.asc ? '↑' : '↓'}</span>
>       {/if}
  <div class="entities-panel">           </button>
    <h3 class="title">                <button 
      Map Entities
      <span class="subtitle">{visibleChunks} chunks visible</span>sortOptions.structures.by === 'type'}
      (e) => { e.stopPropagation(); setSortOption('structures', 'type'); }}
      <!-- Replace the close button to match the size in Details component -->
      <button     <span>Type</span>
        class="close-button" 
        onclick={handleClose} ion">{sortOptions.structures.asc ? '↑' : '↓'}</span>
        aria-label="Close map entities panel"
        onkeydown={(e) => e.key === 'Escape' && handleClose()}         </button>
      >
        <Close size="1.6em" extraClass="close-icon-dark" />
      </button>
    </h3>ures ? '▼' : '▲'}
    ton>
    <!-- Force filter tabs to always display when any entities exist -->iv>
    {#if nonEmptyFilters.length > 0}
      <div class="filter-tabs">e}
        {#each getSortedFilterTabs() as filter}<!-- Just show sort controls on specific tabs -->
          <button    <div class="tab-sort-controls">
            class="filter-tab {filter.id === activeFilter ? 'active' : ''} {hasContent(filter.id) ? 'has-content' : ''}"          <div class="sort-controls">
            onclick={() => setFilter(filter.id)}
            disabled={!hasContent(filter.id)}ion"
          >'}
            {filter.label}rtOption('structures', 'distance')}
            {#if getFilterCount(filter.id) > 0}
              <span class="filter-count" class:filter-count-structures={filter.id === 'structures'} class:filter-count-players={filter.id === 'players'} class:filter-count-groups={filter.id === 'groups'} class:filter-count-items={filter.id === 'items'} class:filter-count-battles={filter.id === 'battles'}>>
                {getFilterCount(filter.id)} {#if sortOptions.structures.by === 'distance'}
              </span>t-direction">{sortOptions.structures.asc ? '↑' : '↓'}</span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
         onclick={() => setSortOption('structures', 'name')}
    <div class="entities-content"> 
      <!-- Structures Section -->
      {#if shouldShowSection('structures') && allStructures.length > 0}if sortOptions.structures.by === 'name'}
        <div class="entities-section">ion">{sortOptions.structures.asc ? '↑' : '↓'}</span>
          <!-- Only show section header when on "all" tab -->
          {#if activeFilter === 'all'}
            <div 
              class="section-header"
              onclick={(e) => toggleSection('structures', e)}
              role="button"
              tabindex="0"
              aria-expanded={!collapsedSections.structures}
              onkeydown={(e) => e.key === 'Enter' && toggleSection('structures', e)}
            >
              <div class="section-title">
                Structures <span class="section-count filter-count filter-count-structures">{allStructures.length}</span>
              </div>
              <div class="section-controls">
                {#if !collapsedSections.structures}
                  <div class="sort-controls">
                    <button "section-content" 
                      class="sort-option"lter !== 'all' || !collapsedSections.structures} 
                      class:active={sortOptions.structures.by === 'distance'}sedSections.structures}>
                      onclick={(e) => { e.stopPropagation(); setSortOption('structures', 'distance'); }}
                    >Structures as structure (structure.type + ':' + structure.x + ':' + structure.y)}
                      <span>Distance</span>
                      {#if sortOptions.structures.by === 'distance'}ity structure {isAtTarget(structure.x, structure.y) ? 'at-target' : ''} {isOwnedByCurrentPlayer(structure) ? 'current-player-owned' : ''}"
                        <span class="sort-direction">{sortOptions.structures.asc ? '↑' : '↓'}</span>.distance === 0}
                      {/if}ture.y, e)}
                    </button>
                    <button index="0"
                      class="sort-option" to {structure.name || _fmt(structure.type) || 'Structure'} at {structure.x},{structure.y}"
                      class:active={sortOptions.structures.by === 'name'}
                      onclick={(e) => { e.stopPropagation(); setSortOption('structures', 'name'); }}
                    >tructureClick(structure, structure.x, structure.y);
                      <span>Name</span>
                      {#if sortOptions.structures.by === 'name'}
                        <span class="sort-direction">{sortOptions.structures.asc ? '↑' : '↓'}</span>v class="entity-structure-icon">
                      {/if}wn'}
                    </button>ew-structure-icon overview-spawn-icon" />
                    <button e}
                      class="sort-option"   <Structure size="1.4em" extraClass={`overview-structure-icon ${structure.type}-icon`} />
                      class:active={sortOptions.structures.by === 'type'}  {/if}
                      onclick={(e) => { e.stopPropagation(); setSortOption('structures', 'type'); }} </div>
                    >
                      <span>Type</span>">
                      {#if sortOptions.structures.by === 'type'}_fmt(structure.type) || "Unknown"}
                        <span class="sort-direction">{sortOptions.structures.asc ? '↑' : '↓'}</span>if isOwnedByCurrentPlayer(structure)}
                      {/if}entity-badge owner-badge">Yours</span>
                    </button>
                  </div>.x, structure.y)}</span>
                {/if}   </div>
                <button class="collapse-button">details">
                  {collapsedSections.structures ? '▼' : '▲'}
                </button>
              </div>/if}
            </div>v class="entity-distance">{formatDistance(structure.distance)}</div>
          {:else}v>
            <!-- Just show sort controls on specific tabs -->
            <div class="tab-sort-controls">
              <div class="sort-controls">
                <button 
                  class="sort-option"
                  class:active={sortOptions.structures.by === 'distance'}
                  onclick={() => setSortOption('structures', 'distance')}
                >
                  <span>Distance</span>n -->
                  {#if sortOptions.structures.by === 'distance'}tion('players') && allPlayers.length > 0}
                    <span class="sort-direction">{sortOptions.structures.asc ? '↑' : '↓'}</span>
                  {/if}
                </button>
                <button ss="section-header"
                  class="sort-option" eSection('players', e)}
                  class:active={sortOptions.structures.by === 'name'}
                  onclick={() => setSortOption('structures', 'name')}
                >nded={!collapsedSections.players}
                  <span>Name</span>(e) => e.key === 'Enter' && toggleSection('players', e)}
                  {#if sortOptions.structures.by === 'name'}
                    <span class="sort-direction">{sortOptions.structures.asc ? '↑' : '↓'}</span> class="section-title">
                  {/if} Players <span class="section-count filter-count filter-count-players">{allPlayers.length}</span>
                </button>    </div>
                <button ols">
                  class="sort-option" 
                  class:active={sortOptions.structures.by === 'type'}
                  onclick={() => setSortOption('structures', 'type')}
                >
                  <span>Type</span> class:active={sortOptions.players.by === 'distance'}
                  {#if sortOptions.structures.by === 'type'}
                    <span class="sort-direction">{sortOptions.structures.asc ? '↑' : '↓'}</span>
                  {/if}
                </button>Options.players.by === 'distance'}
              </div>class="sort-direction">{sortOptions.players.asc ? '↑' : '↓'}</span>
            </div>
          {/if}
          
          <div class="section-content" 
               class:expanded={activeFilter !== 'all' || !collapsedSections.structures}   class:active={sortOptions.players.by === 'name'}
               class:collapsed={activeFilter === 'all' && collapsedSections.structures}>     onclick={(e) => { e.stopPropagation(); setSortOption('players', 'name'); }}
            {#if activeFilter !== 'all' || !collapsedSections.structures}
              {#each sortedStructures as structure (structure.type + ':' + structure.x + ':' + structure.y)}
                <div 
                  class="entity structure {isAtTarget(structure.x, structure.y) ? 'at-target' : ''} {isOwnedByCurrentPlayer(structure) ? 'current-player-owned' : ''}"an class="sort-direction">{sortOptions.players.asc ? '↑' : '↓'}</span>
                  class:is-here={structure.distance === 0}
                  onkeydown={(e) => handleEntityAction(structure.x, structure.y, e)}ton>
                  role="button"ton 
                  tabindex="0"
                  aria-label="Navigate to {structure.name || _fmt(structure.type) || 'Structure'} at {structure.x},{structure.y}"ns.players.by === 'type'}
                  onclick={(e) => {'players', 'type'); }}
                    e.stopPropagation();
                    handleStructureClick(structure, structure.x, structure.y);
                  }}sortOptions.players.by === 'type'}
                >
                  <div class="entity-structure-icon">}
                    {#if structure.type === 'spawn'}
                      <Torch size="1.4em" extraClass="overview-structure-icon overview-spawn-icon" />
                    {:else}
                      <Structure size="1.4em" extraClass={`overview-structure-icon ${structure.type}-icon`} />ss="collapse-button">
                    {/if}
                  </div>
                  <div class="entity-info">
                    <div class="entity-name">
                      {structure.name || _fmt(structure.type) || "Unknown"}
                      {#if isOwnedByCurrentPlayer(structure)}class="tab-sort-controls">
                        <span class="entity-badge owner-badge">Yours</span>iv class="sort-controls">
                      {/if}  <button 
                      <span class="entity-coords">{formatCoords(structure.x, structure.y)}</span>       class="sort-option"
                    </div>           class:active={sortOptions.players.by === 'distance'}
                    <div class="entity-details">=> setSortOption('players', 'distance')}
                      {#if structure.type}
                        <div class="entity-type">{_fmt(structure.type)}</div>>
                      {/if}yers.by === 'distance'}
                      <div class="entity-distance">{formatDistance(structure.distance)}</div>   <span class="sort-direction">{sortOptions.players.asc ? '↑' : '↓'}</span>
                    </div>
                  </div>
                </div>
              {/each}ort-option" 
            {/if}== 'name'}
          </div>
        </div>   >
      {/if}
       
      <!-- Players Section --><span class="sort-direction">{sortOptions.players.asc ? '↑' : '↓'}</span>
      {#if shouldShowSection('players') && allPlayers.length > 0}
        <div class="entities-section">
          {#if activeFilter === 'all'}
            <div t-option" 
              class="section-header"ns.players.by === 'type'}
              onclick={(e) => toggleSection('players', e)}
              role="button"
              tabindex="0"an>Race</span>
              aria-expanded={!collapsedSections.players}by === 'type'}
              onkeydown={(e) => e.key === 'Enter' && toggleSection('players', e)}yers.asc ? '↑' : '↓'}</span>
            >
              <div class="section-title">
                Players <span class="section-count filter-count filter-count-players">{allPlayers.length}</span>
              </div>
              <div class="section-controls">
                {#if !collapsedSections.players}
                  <div class="sort-controls">
                    <button expanded={activeFilter !== 'all' || !collapsedSections.players}
                      class="sort-option"ilter === 'all' && collapsedSections.players}>
                      class:active={sortOptions.players.by === 'distance'}.players}
                      onclick={(e) => { e.stopPropagation(); setSortOption('players', 'distance'); }}ty.y)}
                    >
                      <span>Distance</span>ty player {entity.id === $currentPlayer?.id ? 'current' : ''} {isAtTarget(entity.x, entity.y) ? 'at-target' : ''} {isOwnedByCurrentPlayer(entity) ? 'current-player-owned' : ''}"
                      {#if sortOptions.players.by === 'distance'}ere={entity.distance === 0}
                        <span class="sort-direction">{sortOptions.players.asc ? '↑' : '↓'}</span>tityAction(entity.x, entity.y, e)}
                      {/if}y.y, e)}
                    </button>
                    <button index="0"
                      class="sort-option" to player {entity.displayName || 'Player'} at {entity.x},{entity.y}"
                      class:active={sortOptions.players.by === 'name'}
                      onclick={(e) => { e.stopPropagation(); setSortOption('players', 'name'); }}
                    >tity.race}
                      <span>Name</span>tity.race.toLowerCase() === 'human'}
                      {#if sortOptions.players.by === 'name'}<Human extraClass="race-icon-overview" />
                        <span class="sort-direction">{sortOptions.players.asc ? '↑' : '↓'}</span> {:else if entity.race.toLowerCase() === 'elf'}
                      {/if}on-overview" />
                    </button> === 'dwarf'}
                    <button Dwarf extraClass="race-icon-overview" />
                      class="sort-option"   {:else if entity.race.toLowerCase() === 'goblin'}
                      class:active={sortOptions.players.by === 'type'}      <Goblin extraClass="race-icon-overview" />
                      onclick={(e) => { e.stopPropagation(); setSortOption('players', 'type'); }}     {:else if entity.race.toLowerCase() === 'fairy'}
                    >race-icon-overview" />
                      <span>Race</span>
                      {#if sortOptions.players.by === 'type'}}
                        <span class="sort-direction">{sortOptions.players.asc ? '↑' : '↓'}</span>
                      {/if}
                    </button>
                  </div>     {entity.displayName || 'Player'}
                {/if}rentPlayer(entity)}
                <button class="collapse-button">">You</span>
                  {collapsedSections.players ? '▼' : '▲'}
                </button>span class="entity-coords">{formatCoords(entity.x, entity.y)}</span>
              </div>>
            </div> class="entity-details">
          {:else}}
            <div class="tab-sort-controls">)}</div>
              <div class="sort-controls">
                <button      <div class="entity-distance">{formatDistance(entity.distance)}</div>
                  class="sort-option"
                  class:active={sortOptions.players.by === 'distance'}
                  onclick={() => setSortOption('players', 'distance')}
                >
                  <span>Distance</span>
                  {#if sortOptions.players.by === 'distance'}
                    <span class="sort-direction">{sortOptions.players.asc ? '↑' : '↓'}</span>
                  {/if}
                </button>
                <button  Section -->
                  class="sort-option" s') && allGroups.length > 0}
                  class:active={sortOptions.players.by === 'name'}
                  onclick={() => setSortOption('players', 'name')}
                >
                  <span>Name</span>ion-header"
                  {#if sortOptions.players.by === 'name'}k={(e) => toggleSection('groups', e)}
                    <span class="sort-direction">{sortOptions.players.asc ? '↑' : '↓'}</span>="button"
                  {/if}abindex="0"
                </button>    aria-expanded={!collapsedSections.groups}
                <button === 'Enter' && toggleSection('groups', e)}
                  class="sort-option" 
                  class:active={sortOptions.players.by === 'type'}
                  onclick={() => setSortOption('players', 'type')}count-groups">{allGroups.length}</span>
                >
                  <span>Race</span>ass="section-controls">
                  {#if sortOptions.players.by === 'type'}
                    <span class="sort-direction">{sortOptions.players.asc ? '↑' : '↓'}</span>
                  {/if}
                </button>
              </div>ive={sortOptions.groups.by === 'distance'}
            </div>{(e) => { e.stopPropagation(); setSortOption('groups', 'distance'); }}
          {/if}
               <span>Distance</span>
          <div class="section-content"ps.by === 'distance'}
               class:expanded={activeFilter !== 'all' || !collapsedSections.players}sort-direction">{sortOptions.groups.asc ? '↑' : '↓'}</span>
               class:collapsed={activeFilter === 'all' && collapsedSections.players}>
            {#if activeFilter !== 'all' || !collapsedSections.players}
              {#each sortedPlayers as entity ('player:' + entity.id + ':' + entity.x + ':' + entity.y)}
                <div 
                  class="entity player {entity.id === $currentPlayer?.id ? 'current' : ''} {isAtTarget(entity.x, entity.y) ? 'at-target' : ''} {isOwnedByCurrentPlayer(entity) ? 'current-player-owned' : ''}"
                  class:is-here={entity.distance === 0}ortOption('groups', 'name'); }}
                  onclick={(e) => handleEntityAction(entity.x, entity.y, e)}
                  onkeydown={(e) => handleEntityAction(entity.x, entity.y, e)}
                  role="button"
                  tabindex="0".groups.asc ? '↑' : '↓'}</span>
                  aria-label="Navigate to player {entity.displayName || 'Player'} at {entity.x},{entity.y}"
                >ton>
                  <div class="entity-icon">ton 
                    {#if entity.race}
                      {#if entity.race.toLowerCase() === 'human'}ns.groups.by === 'status'}
                        <Human extraClass="race-icon-overview" />ion(); setSortOption('groups', 'status'); }}
                      {:else if entity.race.toLowerCase() === 'elf'}
                        <Elf extraClass="race-icon-overview" />
                      {:else if entity.race.toLowerCase() === 'dwarf'}sortOptions.groups.by === 'status'}
                        <Dwarf extraClass="race-icon-overview" />span>
                      {:else if entity.race.toLowerCase() === 'goblin'}}
                        <Goblin extraClass="race-icon-overview" />
                      {:else if entity.race.toLowerCase() === 'fairy'}
                        <Fairy extraClass="race-icon-overview" />
                      {/if}ss="collapse-button">
                    {/if}
                  </div>
                  <div class="entity-info">
                    <div class="entity-name">
                      {entity.displayName || 'Player'}
                      {#if isOwnedByCurrentPlayer(entity)}class="tab-sort-controls">
                        <span class="entity-badge owner-badge">You</span>iv class="sort-controls">
                      {/if}  <button 
                      <span class="entity-coords">{formatCoords(entity.x, entity.y)}</span>       class="sort-option"
                    </div>           class:active={sortOptions.groups.by === 'distance'}
                    <div class="entity-details"> => setSortOption('groups', 'distance')}
                      {#if entity.race}
                        <div class="entity-race">{_fmt(entity.race)}</div>>
                      {/if}ups.by === 'distance'}
                      <div class="entity-distance">{formatDistance(entity.distance)}</div>   <span class="sort-direction">{sortOptions.groups.asc ? '↑' : '↓'}</span>
                    </div>
                  </div>
                </div>
              {/each}ort-option" 
            {/if}== 'name'}
          </div>
        </div>   >
      {/if}
       
      <!-- Groups Section --><span class="sort-direction">{sortOptions.groups.asc ? '↑' : '↓'}</span>
      {#if shouldShowSection('groups') && allGroups.length > 0}
        <div class="entities-section">
          {#if activeFilter === 'all'}
            <div t-option" 
              class="section-header"ns.groups.by === 'status'}
              onclick={(e) => toggleSection('groups', e)}
              role="button"
              tabindex="0"an>Status</span>
              aria-expanded={!collapsedSections.groups}y === 'status'}
              onkeydown={(e) => e.key === 'Enter' && toggleSection('groups', e)}oups.asc ? '↑' : '↓'}</span>
            >
              <div class="section-title">
                Groups <span class="section-count filter-count filter-count-groups">{allGroups.length}</span>
              </div>
              <div class="section-controls">
                {#if !collapsedSections.groups}
                  <div class="sort-controls">
                    <button expanded={activeFilter !== 'all' || !collapsedSections.groups}
                      class="sort-option"ilter === 'all' && collapsedSections.groups}>
                      class:active={sortOptions.groups.by === 'distance'}s.groups}
                      onclick={(e) => { e.stopPropagation(); setSortOption('groups', 'distance'); }}
                    >
                      <span>Distance</span>ty {isAtTarget(group.x, group.y) ? 'at-target' : ''} {isOwnedByCurrentPlayer(group) ? 'current-player-owned' : ''}"
                      {#if sortOptions.groups.by === 'distance'}ere={group.distance === 0}
                        <span class="sort-direction">{sortOptions.groups.asc ? '↑' : '↓'}</span>tityAction(group.x, group.y, e)}
                      {/if}, e)}
                    </button>
                    <button e="button"
                      class="sort-option" {group.name}"
                      class:active={sortOptions.groups.by === 'name'}
                      onclick={(e) => { e.stopPropagation(); setSortOption('groups', 'name'); }}
                    >oup.race}
                      <span>Name</span>oup.race.toLowerCase() === 'human'}
                      {#if sortOptions.groups.by === 'name'}<Human extraClass="race-icon-overview" />
                        <span class="sort-direction">{sortOptions.groups.asc ? '↑' : '↓'}</span> {:else if group.race.toLowerCase() === 'elf'}
                      {/if}on-overview" />
                    </button> === 'dwarf'}
                    <button Dwarf extraClass="race-icon-overview" />
                      class="sort-option"   {:else if group.race.toLowerCase() === 'goblin'}
                      class:active={sortOptions.groups.by === 'status'}      <Goblin extraClass="race-icon-overview" />
                      onclick={(e) => { e.stopPropagation(); setSortOption('groups', 'status'); }}     {:else if group.race.toLowerCase() === 'fairy'}
                    >race-icon-overview" />
                      <span>Status</span>
                      {#if sortOptions.groups.by === 'status'}}
                        <span class="sort-direction">{sortOptions.groups.asc ? '↑' : '↓'}</span>
                      {/if}
                    </button>
                  </div>   <div class="entity-name">
                {/if}roup ${group.id.slice(-4)}`}
                <button class="collapse-button">
                  {collapsedSections.groups ? '▼' : '▲'}
                </button>/if}
              </div>an class="entity-coords">({formatCoords(group.x, group.y)})</span>
            </div>v>
          {:else}
            <div class="tab-sort-controls">
              <div class="sort-controls">
                <button        {(group.units ? group.units.length : 0)} units
                  class="sort-option"upItemCount(group) > 0}
                  class:active={sortOptions.groups.by === 'distance'}tGroupItemCount(group)} items</span>
                  onclick={() => setSortOption('groups', 'distance')}
                >/span>
                  <span>Distance</span>
                  {#if sortOptions.groups.by === 'distance'}pan class="entity-status-badge {getStatusClass(group.status)}"
                    <span class="sort-direction">{sortOptions.groups.asc ? '↑' : '↓'}</span>tick={isPendingTick(
                  {/if}
                </button>
                <button            : (group.status === 'gathering' || group.status === 'starting_to_gather' 
                  class="sort-option" up.gatheringUntil 
                  class:active={sortOptions.groups.by === 'name'}
                  onclick={() => setSortOption('groups', 'name')}
                >
                  <span>Name</span>#if group.status === 'starting_to_gather'}
                  {#if sortOptions.groups.by === 'name'}      Preparing to gather
                    <span class="sort-direction">{sortOptions.groups.asc ? '↑' : '↓'}</span>      {:else if group.status === 'mobilizing' || group.status === 'demobilising'}
                  {/if}           {_fmt(group.status)} {formatTimeRemaining(group.readyAt, group.status)}
                </button>              {:else if group.status === 'moving'}
                <button status)} 
                  class="sort-option" 
                  class:active={sortOptions.groups.by === 'status'})})
                  onclick={() => setSortOption('groups', 'status')}
                >
                  <span>Status</span>     {_fmt(group.status)} 
                  {#if sortOptions.groups.by === 'status'}
                    <span class="sort-direction">{sortOptions.groups.asc ? '↑' : '↓'}</span>p.gatheringUntil)})
                  {/if}
                </button>
              </div>t(group.status)}
            </div>
          {/if}
               
          <div class="section-content"istance">
               class:expanded={activeFilter !== 'all' || !collapsedSections.groups}nce(group.distance)}
               class:collapsed={activeFilter === 'all' && collapsedSections.groups}>
            {#if activeFilter !== 'all' || !collapsedSections.groups}
              {#each sortedGroups as group ('group:' + group.id)}
                <div 
                  class="entity {isAtTarget(group.x, group.y) ? 'at-target' : ''} {isOwnedByCurrentPlayer(group) ? 'current-player-owned' : ''}"
                  class:is-here={group.distance === 0}
                  onclick={(e) => handleEntityAction(group.x, group.y, e)}
                  onkeydown={(e) => handleEntityAction(group.x, group.y, e)}
                  tabindex="0"
                  role="button"
                  aria-label="View group {group.name}">
                >ion('items') && allItems.length > 0}
                  <div class="entity-icon">ties-section">
                    {#if group.race}iveFilter === 'all'}
                      {#if group.race.toLowerCase() === 'human'}
                        <Human extraClass="race-icon-overview" />
                      {:else if group.race.toLowerCase() === 'elf'}
                        <Elf extraClass="race-icon-overview" />
                      {:else if group.race.toLowerCase() === 'dwarf'}
                        <Dwarf extraClass="race-icon-overview" />={!collapsedSections.items}
                      {:else if group.race.toLowerCase() === 'goblin'}
                        <Goblin extraClass="race-icon-overview" />
                      {:else if group.race.toLowerCase() === 'fairy'}lass="section-title">
                        <Fairy extraClass="race-icon-overview" /> filter-count filter-count-items">{allItems.length}</span>
                      {/if}
                    {/if}
                  </div>
                  
                  <div class="entity-info">
                    <div class="entity-name">sort-option"
                      {group.name || `Group ${group.id.slice(-4)}`}class:active={sortOptions.items.by === 'distance'}
                      {#if isOwnedByCurrentPlayer(group)}istance'); }}
                        <span class="entity-badge owner-badge">Yours</span>
                      {/if}
                      <span class="entity-coords">({formatCoords(group.x, group.y)})</span>== 'distance'}
                    </div>
                    
                    <div class="entity-details">
                      <span class="unit-count">n 
                        {(group.units ? group.units.length : 0)} unitslass="sort-option" 
                        {#if getGroupItemCount(group) > 0}}
                          • <span class="item-count">{getGroupItemCount(group)} items</span>pPropagation(); setSortOption('items', 'name'); }}
                        {/if}
                      </span>
                      
                      <span class="entity-status-badge {getStatusClass(group.status)}"tion">{sortOptions.items.asc ? '↑' : '↓'}</span>
                        class:pending-tick={isPendingTick(
                          group.status === 'moving' 
                            ? group.nextMoveTime 
                            : (group.status === 'gathering' || group.status === 'starting_to_gather' 
                                ? group.gatheringUntil .items.by === 'rarity'}
                                : group.readyAt)Option('items', 'rarity'); }}
                        )}
                      >ity</span>
                        {#if group.status === 'starting_to_gather'}Options.items.by === 'rarity'}
                          Preparing to gatherction">{sortOptions.items.asc ? '↑' : '↓'}</span>
                        {:else if group.status === 'mobilizing' || group.status === 'demobilising'}
                          {_fmt(group.status)} {formatTimeRemaining(group.readyAt, group.status)}
                        {:else if group.status === 'moving'}v>
                          {_fmt(group.status)} 
                          {#if !isPendingTick(group.nextMoveTime)}
                            ({formatTimeRemaining(calculateMoveCompletionTime(group))})ections.items ? '▼' : '▲'}
                          {/if}
                        {:else if group.status === 'gathering'}
                          {_fmt(group.status)} 
                          {#if !isPendingTick(group.gatheringUntil)}
                            ({formatTimeRemaining(group.gatheringUntil)})class="tab-sort-controls">
                          {/if}iv class="sort-controls">
                        {:else}  <button 
                          {_fmt(group.status)}       class="sort-option"
                        {/if}                  class:active={sortOptions.items.by === 'distance'}
                      </span>) => setSortOption('items', 'distance')}
                      
                      <span class="entity-distance">>
                        {formatDistance(group.distance)}ms.by === 'distance'}
                      </span>   <span class="sort-direction">{sortOptions.items.asc ? '↑' : '↓'}</span>
                    </div>
                  </div>
                </div>
              {/each}ort-option" 
            {/if}== 'name'}
          </div>
        </div>   >
      {/if}

      <!-- Items Section --><span class="sort-direction">{sortOptions.items.asc ? '↑' : '↓'}</span>
      {#if shouldShowSection('items') && allItems.length > 0}
        <div class="entities-section">
          {#if activeFilter === 'all'}
            <div t-option" 
              class="section-header"ns.items.by === 'rarity'}
              onclick={(e) => toggleSection('items', e)}
              role="button"
              tabindex="0"an>Rarity</span>
              aria-expanded={!collapsedSections.items} === 'rarity'}
              onkeydown={(e) => e.key === 'Enter' && toggleSection('items', e)}tems.asc ? '↑' : '↓'}</span>
            >
              <div class="section-title">
                Items <span class="section-count filter-count filter-count-items">{allItems.length}</span>
              </div>
              <div class="section-controls">
                {#if !collapsedSections.items}
                  <div class="sort-controls">
                    <button expanded={activeFilter !== 'all' || !collapsedSections.items}
                      class="sort-option"ilter === 'all' && collapsedSections.items}>
                      class:active={sortOptions.items.by === 'distance'}ns.items}
                      onclick={(e) => { e.stopPropagation(); setSortOption('items', 'distance'); }}e || item.type}`).replace(/\s+/g, '-'))}
                    >
                      <span>Distance</span>ty item {getRarityClass(item.rarity)}" 
                      {#if sortOptions.items.by === 'distance'}arget={isAtTarget(item.x, item.y)}
                        <span class="sort-direction">{sortOptions.items.asc ? '↑' : '↓'}</span>ance === 0}
                      {/if})}
                    </button>
                    <button e="button"
                      class="sort-option" 
                      class:active={sortOptions.items.by === 'name'}item.type) || 'Item'} at {item.x},{item.y}"
                      onclick={(e) => { e.stopPropagation(); setSortOption('items', 'name'); }}
                    >s="item-icon {item.type}"></div>
                      <span>Name</span>"entity-info">
                      {#if sortOptions.items.by === 'name'} class="entity-name">
                        <span class="sort-direction">{sortOptions.items.asc ? '↑' : '↓'}</span> {item.name || _fmt(item.type) || "Unknown Item"}
                      {/if}">{formatCoords(item.x, item.y)}</span>
                    </button>
                    <button class="entity-details">
                      class="sort-option"   {#if item.type}
                      class:active={sortOptions.items.by === 'rarity'}      <span class="item-type">{_fmt(item.type)}</span>
                      onclick={(e) => { e.stopPropagation(); setSortOption('items', 'rarity'); }}     {/if}
                    >1}
                      <span>Rarity</span>-quantity">×{item.quantity}</span>
                      {#if sortOptions.items.by === 'rarity'}if}
                        <span class="sort-direction">{sortOptions.items.asc ? '↑' : '↓'}</span>y && item.rarity !== 'common'}
                      {/if}t(item.rarity)}</span>
                    </button>
                  </div>     <div class="entity-distance">{formatDistance(item.distance)}</div>
                {/if}
                <button class="collapse-button">
                  {collapsedSections.items ? '▼' : '▲'}
                </button>f}
              </div>
            </div>
          {:else}
            <div class="tab-sort-controls">
              <div class="sort-controls">
                <button 
                  class="sort-option"
                  class:active={sortOptions.items.by === 'distance'}
                  onclick={() => setSortOption('items', 'distance')}
                >ction('battles') && sortedBattles.length > 0}
                  <span>Distance</span>ies-section">
                  {#if sortOptions.items.by === 'distance'}ction-header" on:click={e => toggleSection('battles', e)}>
                    <span class="sort-direction">{sortOptions.items.asc ? '↑' : '↓'}</span>Battles ({sortedBattles.length})</h4>
                  {/if}
                </button>
                <button div class="sort-controls">
                  class="sort-option" 
                  class:active={sortOptions.items.by === 'name'}
                  onclick={() => setSortOption('items', 'name')}
                >lick={() => setSortOption('battles', 'distance')}
                  <span>Name</span>
                  {#if sortOptions.items.by === 'name'}<span>Distance</span>
                    <span class="sort-direction">{sortOptions.items.asc ? '↑' : '↓'}</span>  {#if sortOptions.battles.by === 'distance'}
                  {/if}       <span class="sort-direction">{sortOptions.battles.asc ? '↑' : '↓'}</span>
                </button>          {/if}
                <button 
                  class="sort-option" 
                  class:active={sortOptions.items.by === 'rarity'}
                  onclick={() => setSortOption('items', 'rarity')}'}
                >
                  <span>Rarity</span>
                  {#if sortOptions.items.by === 'rarity'}
                    <span class="sort-direction">{sortOptions.items.asc ? '↑' : '↓'}</span>
                  {/if}ortOptions.battles.asc ? '↑' : '↓'}</span>
                </button>
              </div>
            </div>
          {/if}
          
          <div class="section-content"collapsedSections.battles ? '▼' : '▲'}
               class:expanded={activeFilter !== 'all' || !collapsedSections.items}
               class:collapsed={activeFilter === 'all' && collapsedSections.items}>
            {#if activeFilter !== 'all' || !collapsedSections.items}
              {#each sortedItems as item ('item:' + (item.id || `${item.x}:${item.y}:${item.name || item.type}`).replace(/\s+/g, '-'))}
                <div ded'}">
                  class="entity item {getRarityClass(item.rarity)}" attles as battle (battle.id)}
                  class:at-target={isAtTarget(item.x, item.y)}
                  class:is-here={item.distance === 0}
                  onclick={(e) => handleEntityAction(item.x, item.y, e)}
                  onkeydown={(e) => handleEntityAction(item.x, item.y, e)}rget={isAtTarget(battle.x, battle.y)}
                  role="button"tyAction(battle.x, battle.y, event)}
                  tabindex="0" event)}
                  aria-label="Navigate to {item.name || _fmt(item.type) || 'Item'} at {item.x},{item.y}""
                >
                  <div class="item-icon {item.type}"></div>
                  <div class="entity-info">"entity-info">
                    <div class="entity-name">
                      {item.name || _fmt(item.type) || "Unknown Item"} {battle.isPlayerBattle ? '🔥 ' : ''} 
                      <span class="entity-coords">{formatCoords(item.x, item.y)}</span>ords">({battle.x}, {battle.y})</span>
                    </div>
                    <div class="entity-details">
                      {#if item.type}lass="battle-sides">
                        <span class="item-type">{_fmt(item.type)}</span>iv class="battle-side side1" class:winning-side={battle.winner === 1} class:losing-side={battle.winner === 2}>
                      {/if} <div class="side-name">{battle.sides.side1.name}</div>
                      {#if item.quantity > 1}     <div class="unit-count">Groups: {battle.sides.side1.groups.length}</div>
                        <span class="item-quantity">×{item.quantity}</span>      {#if battle.sides.side1.casualties > 0}
                      {/if}          <div class="casualties">Lost: {battle.sides.side1.casualties}</div>
                      {#if item.rarity && item.rarity !== 'common'}           {/if}
                        <span class="item-rarity {item.rarity}">{_fmt(item.rarity)}</span>                    </div>
                      {/if}="battle-vs">vs</div>
                      <div class="entity-distance">{formatDistance(item.distance)}</div>e={battle.winner === 2} class:losing-side={battle.winner === 1}>
                    </div>-name">{battle.sides.side2.name}</div>
                    {#if item.description}
                      <div class="item-description">{item.description}</div>
                    {/if}ureInfo}
                  </div>
                </div>
              {/each}v>
            {/if}.side2.casualties > 0}
          </div>2.casualties}</div>
        </div>
      {/if} </div>

      <!-- Battles Section -->
      {#if shouldShowSection('battles') && sortedBattles.length > 0}
        <div class="entities-section">class="entity-status">
          <div class="section-header" on:click={e => toggleSection('battles', e)}> class="entity-status-badge {battle.status}">
            <h4 class="section-title">Battles ({sortedBattles.length})</h4>attle.status === 'active' ? 'Ongoing' : 'Concluded'}
            <div class="section-controls">er}
              <div class="tab-sort-controls">.name : battle.sides.side2.name} won
                <div class="sort-controls">
                  <button    </span>
                    class="sort-option"
                    class:active={sortOptions.battles.by === 'distance'}nce(battle.distance)}</div>
                    onclick={() => setSortOption('battles', 'distance')}
                  >
                    <span>Distance</span>s="battle-timer">
                    {#if sortOptions.battles.by === 'distance'}if battle.createdAt}
                      <span class="sort-direction">{sortOptions.battles.asc ? '↑' : '↓'}</span>  Started {Math.floor((Date.now() - battle.createdAt) / 60000)} minutes ago
                    {/if}
                  </button>
                  <button >
                    class="sort-option" 
                    class:active={sortOptions.battles.by === 'status'}  <!-- Battle progress bar -->
                    onclick={() => setSortOption('battles', 'status')}        <div class="battle-progress">
                  >
                    <span>Status</span>
                    {#if sortOptions.battles.by === 'status'}     style="width: {battle.sides.side1.power ? 
                      <span class="sort-direction">{sortOptions.battles.asc ? '↑' : '↓'}</span>es.side1.power / (battle.sides.side1.power + battle.sides.side2.power) * 100) : 50}%">
                    {/if}
                  </button>
                </div>
              </div>
              <button class="collapse-button" aria-label="Toggle battles section">
                {collapsedSections.battles ? '▼' : '▲'}ach}
              </button>
            </div>
          </div>
          
          <div class="section-content {collapsedSections.battles ? 'collapsed' : 'expanded'}">
            {#each sortedBattles as battle (battle.id)}y-state">
              <div iveFilter === 'all'}
                class="entity battle"
                class:is-here={battle.distance === 0}
                class:at-target={isAtTarget(battle.x, battle.y)}
                on:click={event => handleEntityAction(battle.x, battle.y, event)}
                on:keydown={event => handleEntityAction(battle.x, battle.y, event)}
                tabindex="0"
              >
                <div class="entity-battle-icon">⚔️</div>
                <div class="entity-info">
                  <div class="entity-name">
                    Battle {battle.isPlayerBattle ? '🔥 ' : ''} 
                    <span class="entity-coords">({battle.x}, {battle.y})</span>
                  </div>
                  
                  <div class="battle-sides">
                    <div class="battle-side side1" class:winning-side={battle.winner === 1} class:losing-side={battle.winner === 2}>
                      <div class="side-name">{battle.sides.side1.name}</div> ease, z-index 0s;
                      <div class="unit-count">Groups: {battle.sides.side1.groups.length}</div>
                      {#if battle.sides.side1.casualties > 0}
                        <div class="casualties">Lost: {battle.sides.side1.casualties}</div>
                      {/if}
                    </div>
                    <div class="battle-vs">vs</div>
                    <div class="battle-side side2" class:winning-side={battle.winner === 2} class:losing-side={battle.winner === 1}>
                      <div class="side-name">{battle.sides.side2.name}</div>
                      <div class="unit-count">
                        Groups: {battle.sides.side2.groups.length}
                        {#if battle.structureInfo}
                          + Structure
                        {/if}
                      </div>
                      {#if battle.sides.side2.casualties > 0}
                        <div class="casualties">Lost: {battle.sides.side2.casualties}</div>
                      {/if}ba(255, 255, 255, 0.85);
                    </div> solid rgba(255, 255, 255, 0.2);
                  </div>
                  0.1);
                  <div class="entity-details">
                    <div class="entity-status">(0.5em);
                      <span class="entity-status-badge {battle.status}">
                        {battle.status === 'active' ? 'Ongoing' : 'Concluded'}
                        {#if battle.winner}m;
                           - {battle.winner === 1 ? battle.sides.side1.name : battle.sides.side2.name} won
                        {/if}
                      </span>
                    </div>rwards;
                    <div class="entity-distance">{formatDistance(battle.distance)}</div>
                  </div>
                  
                  <div class="battle-timer">
                    {#if battle.createdAt}ing .entities-panel {
                      Started {Math.floor((Date.now() - battle.createdAt) / 60000)} minutes agotToBottom 0.8s ease-in forwards;
                    {/if}
                    • Tick: {battle.tickCount || 0}
                  </div>deInFromBottom {
                  
                  <!-- Battle progress bar -->form: translateY(100%);
                  <div class="battle-progress">      opacity: 0;
                    <div class="progress-bar">
                      <div class="progress-fill" 
                        style="width: {battle.sides.side1.power ? 
                          (battle.sides.side1.power / (battle.sides.side1.power + battle.sides.side2.power) * 100) : 50}%">
                      </div>
                    </div>
                  </div>
                </div>lideOutToBottom {
              </div>
            {/each}sform: translateY(0);
          </div>acity: 1;
        </div>
      {/if}    100% {
ransform: translateY(100%);
      {#if !hasContent(activeFilter)}
        <div class="empty-state">
          {#if activeFilter === 'all'}
            No entities visible on map
          {:else}
            No {activeFilter} visible on map
          {/if}al;
        </div>
      {/if}6em;
    </div>
  </div>
</section>  .entity-coords {
  font-size: 0.7em;
<style>);
  .entities-wrapper {6em;
    position: absolute; font-weight: normal;
    bottom: 0.5em;  }
    left: 0.5em;
    z-index: 998; 
    transition: opacity 0.2s ease, z-index 0s; background-color: rgba(64, 158, 255, 0.1);
    font-size: 1.4em;    border-color: rgba(64, 158, 255, 0.3);
    font-family: var(--font-body);ive;
    max-width: 95%;
    outline: none; 
  }

  
  .entities-wrapper.active {55, 0.3);
    z-index: 1001; 
  }

  .entities-wrapper.closing {
    pointer-events: none; {
  }58, 255, 0.9);

  .entities-panel {
    background-color: rgba(255, 255, 255, 0.85);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.3em;
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(0.5em); font-weight: 600;
    -webkit-backdrop-filter: blur(0.5em);}
    width: 100%;
    max-width: 28em;y-distance {
    display: flex;
    flex-direction: column;, 0, 0, 0.5);
    overflow: hidden;argin-left: auto;
    animation: slideInFromBottom 0.8s ease-out forwards;space: nowrap;
    transform-origin: bottom left;
  }center;
  
  
  .entities-wrapper.closing .entities-panel {
    animation: slideOutToBottom 0.8s ease-in forwards;rst-letter {
  }-size: 1.8em;
  
  @keyframes slideInFromBottom { 0.1em;
    0% {ertical-align: middle;
      transform: translateY(100%); rgba(64, 158, 255, 1.0);
      opacity: 0;
    }
    100% {p-entities {
      transform: translateY(0); position: fixed;
      opacity: 1;    top: 0;
    }
  }
  
  @keyframes slideOutToBottom {
    0% {
      transform: translateY(0); flex-direction: column;
      opacity: 1;    gap: .5em;
    }
    100% {ateZ(0);
      transform: translateY(100%);
      opacity: 0;e;
    }
  } overflow: hidden;
  }
  .subtitle {
    font-size: 0.7em;
    font-weight: normal;
    color: rgba(0, 0, 0, 0.5);solid rgba(0, 0, 0, 0.1);
    margin-left: 0.6em; background-color: rgba(0, 0, 0, 0.03);
  }    padding: 0 0.3em;
  width: 100%;
  .entity-coords {-x: auto;
    font-size: 0.7em;
    color: rgba(0, 0, 0, 0.5);
    margin-left: 0.6em;
    font-weight: normal; padding: 0.6em 0.8em;
  }  font-family: var(--font-heading);
  font-size: 0.8em;
  .at-target {
    background-color: rgba(64, 158, 255, 0.1);
    border-color: rgba(64, 158, 255, 0.3);x solid transparent;
    position: relative;
  } color: rgba(0, 0, 0, 0.5);
    transition: all 0.2s ease;
    flex: 1;
  .is-here {
    background-color: rgba(64, 158, 255, 0.1);
    border-color: rgba(64, 158, 255, 0.3);center;
    position: relative; align-items: center;
  }    position: relative;
  rap;
  
  .is-here .entity-distance {
    color: rgba(64, 158, 255, 0.9);t(:disabled) {
    font-weight: 500;ba(0, 0, 0, 0.03);
    font-size: 0.9em; 0, 0, 0.8);
  }

  .filter-tab.active {
  .at-target.is-here .entity-distance {  border-bottom: 2px solid #4285f4;
    color: rgba(64, 158, 255, 1.0);
    font-weight: 600;
  }

  .entity-distance {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.5); cursor: not-allowed;
    margin-left: auto;  }
    white-space: nowrap;
    display: flex;ntent:not(.active) {
    align-items: center;rgba(0, 0, 0, 0.7);
  }
  
  {
  .is-here .entity-distance::first-letter {
    font-size: 1.8em;enter;
    line-height: 0;;
    margin-right: 0.1em;ius: 50%;
    vertical-align: middle;
    color: rgba(64, 158, 255, 1.0);
  }

  .map-entities {;
    position: fixed;
    top: 0; background: rgba(0, 0, 0, 0.2);
    right: 0;    color: white;
    padding: .5em;solid rgba(0, 0, 0, 0.1);
    width: 100%;0 0.15em rgba(255, 255, 255, 0.2);
    max-width: 25em;
    display: flex;
    flex-direction: column;
    gap: .5em;structures {
    z-index: 1100;0, 0, 0, 0.9);
    transform: translateZ(0); box-shadow: 0 0 0.15em rgba(0, 0, 0, 0.6);
    will-change: transform;    color: rgba(255, 255, 255, 0.9); 
    pointer-events: none;
    max-height: 100vh;
    overflow: hidden;
  }255, 100, 100, 0.9);
.15em rgba(255, 100, 100, 0.6);
  .filter-tabs {
    display: flex;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);ers {
    background-color: rgba(0, 0, 0, 0.03); 255, 0.9);
    padding: 0 0.3em;a(100, 100, 255, 0.6);
    width: 100%;
    overflow-x: auto;
  }ems {
5, 0, 0.9);
  .filter-tab {em rgba(255, 215, 0, 0.6);
    padding: 0.6em 0.8em;
    font-family: var(--font-heading);
    font-size: 0.8em;filter-count-battles {
    background: none;    background: rgba(139, 0, 0, 0.8);
    border: none; 0, 0, 0.6);
    border-bottom: 2px solid transparent;
    cursor: pointer;
    color: rgba(0, 0, 0, 0.5);filter-tab.active .filter-count {
    transition: all 0.2s ease;    background: rgba(255, 255, 255, 0.9);
    flex: 1;0, 0.8);
    text-align: center;0, 0.2);
    display: flex;
    justify-content: center;
    align-items: center;title {
    position: relative;    margin: 0;
    white-space: nowrap;
  }1em;

  .filter-tab:hover:not(:disabled) { color: rgba(0, 0, 0, 0.8);
    background-color: rgba(0, 0, 0, 0.03);    background-color: rgba(0, 0, 0, 0.05);
    color: rgba(0, 0, 0, 0.8);0, 0.1);
  }ading);
 display: flex;
  .filter-tab.active {    align-items: center;
    border-bottom: 2px solid #4285f4;nt: space-between;
    color: rgba(0, 0, 0, 0.9);
    font-weight: 500;
  }

  .filter-tab:disabled {
    opacity: 0.4;r;
    cursor: not-allowed;
  }
;
  .filter-tab.has-content:not(.active) {: center;
    color: rgba(0, 0, 0, 0.7);
  }auto;

  .filter-count {
    display: flex;
    align-items: center;
    justify-content: center;.close-button:hover {
    border-radius: 50%;, 0, 0, 0.1);
    width: 1.2em;
    height: 1.2em;
    font-size: 0.7em;
    font-weight: bold;entities-content {
    margin-left: 0.4em;  padding: 0.8em;
    line-height: 1;
    background: rgba(0, 0, 0, 0.2);
    color: white;
    border: 1px solid rgba(0, 0, 0, 0.1);
    box-shadow: 0 0 0.15em rgba(255, 255, 255, 0.2);.entities-section {
  }

  
  .filter-count-structures { max-height: unset;
    background: rgba(0, 0, 0, 0.9);}
    box-shadow: 0 0 0.15em rgba(0, 0, 0, 0.6);
    color: rgba(255, 255, 255, 0.9); 
  }
   overflow: auto;
  .filter-count-groups {  padding: 0;
    background: rgba(255, 100, 100, 0.9);t 0.3s ease-in, padding 0.3s ease, opacity 0.2s ease 0.1s;
    box-shadow: 0 0 0.15em rgba(255, 100, 100, 0.6);
  }
  
  .filter-count-players {  .section-content.collapsed {
    background: rgba(100, 100, 255, 0.9);
    box-shadow: 0 0 0.15em rgba(100, 100, 255, 0.6);
  }
  
  .filter-count-items { overflow: hidden;
    background: rgba(255, 215, 0, 0.9);    transition: max-height 0.3s ease-out, padding 0.3s ease;
    box-shadow: 0 0 0.15em rgba(255, 215, 0, 0.6);
  }
  
  .filter-count-battles {
    background: rgba(139, 0, 0, 0.8);-start;
    box-shadow: 0 0 0.15em rgba(139, 0, 0, 0.6);
  }

  .filter-tab.active .filter-count {255, 0.5);
    background: rgba(255, 255, 255, 0.9);lid rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.8);
    box-shadow: 0 0 0.2em rgba(0, 0, 0, 0.2);2s ease;
  }

  .title {
    margin: 0; rgba(255, 255, 255, 0.8);
    padding: 0.8em 1em; 2px 4px rgba(0, 0, 0, 0.1);
    font-size: 1.1em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.8);
    background-color: rgba(0, 0, 0, 0.05);gba(66, 133, 244, 0.6);
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);ba(66, 133, 244, 0.3);
    font-family: var(--font-heading);
    display: flex;
    align-items: center;
    justify-content: space-between; 133, 244, 0.05);
  } border-color: rgba(66, 133, 244, 0.3);
  }
  .close-button {
    background: none;
    border: none;
    cursor: pointer; margin-top: 0.1em;
    padding: 0.4em;      flex-shrink: 0;
    display: flex;
    align-items: center;nter;
    justify-content: center;center;
    border-radius: 50%;
    margin-left: auto;
    transition: background-color 0.2s;  .entity-structure-icon {
    color: rgba(0, 0, 0, 0.6);em;
  }

  .close-button:hover {
    background-color: rgba(0, 0, 0, 0.1);r;
    color: rgba(0, 0, 0, 0.9); justify-content: center;
  }  }

  .entities-content {
    padding: 0.8em;
    max-height: 70vh;
    overflow-y: auto;
  }{
 font-weight: 500;
  .entities-section {    color: rgba(0, 0, 0, 0.85);
    margin-bottom: 1.2em;
    border-radius: 0.3em; 0.2em;
    overflow: hidden;
    max-height: unset;
  }ls {

  .section-content.expanded {
    max-height: 13em; gap: 0.6em;
    overflow: auto;    font-size: 0.85em;
    padding: 0;rgba(0, 0, 0, 0.7);
    transition: max-height 0.3s ease-in, padding 0.3s ease, opacity 0.2s ease 0.1s;
    opacity: 1;etween;
  }

  .section-content.collapsed {
    max-height: 0;
    padding-top: 0;
    padding-bottom: 0;
    opacity: 0;
    overflow: hidden; fill: rgba(0, 0, 0, 0.7);
    transition: max-height 0.3s ease-out, padding 0.3s ease;  }
  }

  .entity {) {
    display: flex; fill: rgba(138, 43, 226, 0.8);
    align-items: flex-start;  }
    margin-bottom: 0.6em;
    padding: 0.5em 0.7em; {
    border-radius: 0.3em;
    background-color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(0, 0, 0, 0.1);
    cursor: pointer;
    transition: background-color 0.2s ease;
  }
 filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.7));
  .entity:hover {  }
    background-color: rgba(255, 255, 255, 0.8);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);n-icon) {
  }w(0 0 3px rgba(0, 255, 255, 0.8)) !important;
ortant;
  .entity:focus {
    outline: 2px solid rgba(66, 133, 244, 0.6);
    box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.3);
  }entity.battle {
    background-color: rgba(139, 0, 0, 0.05);
  .entity.player.current {(139, 0, 0, 0.2);
    background-color: rgba(66, 133, 244, 0.05);
    border-color: rgba(66, 133, 244, 0.3);
  }on {

  .entity-icon {
    margin-right: 0.7em;
    margin-top: 0.1em; width: 1.4em;
    flex-shrink: 0;    height: 1.4em;
    display: flex;: 0.7em;
    align-items: center;op: 0.1em;
    justify-content: center; font-size: 1.2em;
  }  }

  .entity-structure-icon {
    margin-right: 0.7em;
    margin-top: 0.1em;lock;
    flex-shrink: 0;
    display: flex; font-weight: 500;
    align-items: center;    padding: 0.1em 0.5em;
    justify-content: center;0.3em;
  }owrap;
capitalize;
  .entity-info {
    flex: 1;
  }
rgba(128, 128, 128, 0.15);
  .entity-name {, 128, 0.3);
    font-weight: 500; color: rgba(0, 0, 0, 0.7);
    color: rgba(0, 0, 0, 0.85);  }
    line-height: 1.2;
    margin-bottom: 0.2em;
  }gba(0, 128, 0, 0.15);
lid rgba(0, 128, 0, 0.3);
  .entity-details {;
    display: flex;
    flex-wrap: wrap;
    gap: 0.6em;.entity-status-badge.mobilizing {
    font-size: 0.85em;  background: rgba(255, 140, 0, 0.15);
    color: rgba(0, 0, 0, 0.7);
    width: 100%;
    justify-content: space-between;
  }

  26, 0.15);
  :global(.race-icon-overview) { border: 1px solid rgba(138, 43, 226, 0.3);
    width: 1.4em;    color: #6a1b9a;
    height: 1.4em;}
    opacity: 0.85;
    fill: rgba(0, 0, 0, 0.7);badge.gathering, 
  }
   background: rgba(138, 43, 226, 0.15);
    border: 1px solid rgba(138, 43, 226, 0.3);
  :global(.race-icon-overview.fairy-icon path) {
    fill: rgba(138, 43, 226, 0.8);
  }
  entity-status-badge.fighting {
  :global(.race-icon-overview.goblin-icon path) {    background: rgba(220, 20, 60, 0.15);
    fill: rgba(0, 128, 0, 0.8);  border: 1px solid rgba(220, 20, 60, 0.3);
  };

  
  :global(.overview-structure-icon) {entity-status-badge.active {
    opacity: 0.9;    background: rgba(255, 0, 0, 0.15);
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.7));gba(255, 0, 0, 0.3);
  };
  
  :global(.overview-spawn-icon) {
    filter: drop-shadow(0 0 3px rgba(0, 255, 255, 0.8)) !important;badge.resolved {
    opacity: 1 !important;ba(0, 128, 0, 0.15);
  }ba(0, 128, 0, 0.3);

  
  .entity.battle {
    background-color: rgba(139, 0, 0, 0.05);  .entity-status-badge.pending-tick {
    border: 1px solid rgba(139, 0, 0, 0.2);  position: relative;
  }infinite alternate;

  .entity-battle-icon {
    display: flex;e.pending-tick::after {
    align-items: center;
    justify-content: center;
    width: 1.4em;
    height: 1.4em;
    margin-right: 0.7em;
    margin-top: 0.1em;
    font-size: 1.2em;
  }

  
  .entity-status-badge { padding: 0.5em 1em;  
    display: inline-block;  cursor: pointer;
    font-size: 0.8em;
    font-weight: 500;
    padding: 0.1em 0.5em;
    border-radius: 0.3em;r: rgba(0, 0, 0, 0.03);
    white-space: nowrap; border-radius: 0.3em 0.3em 0 0;
    text-transform: capitalize;  transition: background-color 0.2s ease;
  }
  
  .entity-status-badge.idle {
    background: rgba(128, 128, 128, 0.15);r: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(128, 128, 128, 0.3);
    color: rgba(0, 0, 0, 0.7);
  }
  
  .entity-status-badge.moving {
    background: rgba(0, 128, 0, 0.15);
    border: 1px solid rgba(0, 128, 0, 0.3); margin-left: auto;
    color: #006400;}
  }
  
  .entity-status-badge.mobilizing {
    background: rgba(255, 140, 0, 0.15);
    border: 1px solid rgba(255, 140, 0, 0.3);0;
    color: #d06000; color: rgba(0, 0, 0, 0.6);
  }  text-transform: uppercase;
  
  .entity-status-badge.demobilising {
    background: rgba(138, 43, 226, 0.15);
    border: 1px solid rgba(138, 43, 226, 0.3);
    color: #6a1b9a;
  }
  
  .entity-status-badge.gathering, 
  .entity-status-badge.starting_to_gather {
    background: rgba(138, 43, 226, 0.15);0, 0, 0.5);
    border: 1px solid rgba(138, 43, 226, 0.3); font-size: 0.8em;
    color: #8a2be2;  cursor: pointer;
  }
  
  .entity-status-badge.fighting {
    background: rgba(220, 20, 60, 0.15);nter;
    border: 1px solid rgba(220, 20, 60, 0.3); justify-content: center;
    color: #c62828;  min-width: 1.5em;
  }
  
  .entity-status-badge.active {
    background: rgba(255, 0, 0, 0.15);collapse-button:hover {
    border: 1px solid rgba(255, 0, 0, 0.3);  color: rgba(0, 0, 0, 0.8);
    color: #d32f2f;
  }: 50%;
  
  .entity-status-badge.resolved {
    background: rgba(0, 128, 0, 0.15);
    border: 1px solid rgba(0, 128, 0, 0.3);  .sort-controls {
    color: #2e7d32;  display: flex;
  }
  0.5em;
  .entity-status-badge.pending-tick {
    position: relative;
    animation: pulse 1s infinite alternate;
  };
  
  .entity-status-badge.pending-tick::after {
    content: '↻';0, 0, 0, 0.5);
    margin-left: 0.3em;
    font-weight: bold;
  }
 display: flex;
    align-items: center;
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5em 1em;  {
    cursor: pointer;or: rgba(0, 0, 0, 0.05);
    user-select: none; 0.8);
    position: relative;
    width: 100%;
    background-color: rgba(0, 0, 0, 0.03);sort-option.active {
    border-radius: 0.3em 0.3em 0 0;    background-color: rgba(66, 133, 244, 0.1);
    transition: background-color 0.2s ease;, 133, 244, 0.9);
  }
  
  .section-header:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }
  
  .section-controls {
    display: flex;
    align-items: center;ex;
    gap: 0.5em; justify-content: center; 
    margin-left: auto;    margin-bottom: 0.5em;
  };

  .section-title {
    margin: 0;
    font-size: 0.9em;
    font-weight: 600;;
    color: rgba(0, 0, 0, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.05em;00;
    display: flex;
    align-items: center;
    gap: 0.3em;
  }rgba(76, 175, 80, 0.2);
 color: #2e7d32;
  .collapse-button {  border: 1px solid rgba(76, 175, 80, 0.4);
    background: none;
    border: none;
    color: rgba(0, 0, 0, 0.5);
    font-size: 0.8em;-color-bright-accent, #64ffda);
    cursor: pointer; background-color: rgba(100, 255, 218, 0.05);
    padding: 0.2em 0.5em;    position: relative;
    transition: all 0.2s ease;}
    display: flex;
    align-items: center;owned::after {
    justify-content: center;;
    min-width: 1.5em;
    min-height: 1.5em; left: 0;
  }  top: 0;
  
  .collapse-button:hover {
    color: rgba(0, 0, 0, 0.8);lor: var(--color-bright-accent, #64ffda);
    background-color: rgba(0, 0, 0, 0.05);
    border-radius: 50%;
  }

  
  .sort-controls {old;
    display: flex;
    gap: 0.2em;
    margin-right: 0.5em;
  }battle-sides {
    display: flex;
  .sort-option {lumn;
    background: none;
    border: none;
    font-size: 0.7em; margin-top: 0.4em;
    color: rgba(0, 0, 0, 0.5);}
    padding: 0.2em 0.4em;
    border-radius: 0.3em;
    cursor: pointer;
    display: flex; border-radius: 0.3em;
    align-items: center;}
    gap: 0.2em;
    transition: all 0.2s ease;{
  }rgba(0, 0, 255, 0.07);
   border: 1px solid rgba(0, 0, 255, 0.15);
  .sort-option:hover {    color: #00008B;
    background-color: rgba(0, 0, 0, 0.05);
    color: rgba(0, 0, 0, 0.8);
  }
  a(139, 0, 0, 0.07);
  .sort-option.active { rgba(139, 0, 0, 0.15);
    background-color: rgba(66, 133, 244, 0.1); color: #8B0000;
    color: rgba(66, 133, 244, 0.9);  }
  }
  
  .sort-direction {
    font-size: 0.9em;
    font-weight: bold;
  }
 font-family: var(--font-mono, monospace);
  .tab-sort-controls {    font-size: 0.85em;
    display: flex;2f;
    justify-content: center; 
    margin-bottom: 0.5em;
    padding: 0.3em 0;
  }battle-progress {
    margin-top: 0.4em;
  
  .entity-badge {
    font-size: 0.7em;
    padding: 0.2em 0.4em;
    border-radius: 0.3em; height: 0.5em;
    font-weight: 500;  background-color: rgba(0, 0, 0, 0.1);
  }
dden;
  .owner-badge {m;
    background-color: rgba(76, 175, 80, 0.2);
    color: #2e7d32;
    border: 1px solid rgba(76, 175, 80, 0.4);ll {
  }%;

  .current-player-owned { transition: width 1s ease;
    border-color: var(--color-bright-accent, #64ffda);  }
    background-color: rgba(100, 255, 218, 0.05);
    position: relative;
  }
  0, 0.7);
  .current-player-owned::after {
    content: '';
    position: absolute;
    left: 0;
    top: 0;;
    bottom: 0;
    width: 3px;
    background-color: var(--color-bright-accent, #64ffda);
  }
empty-state {
    padding: 2em;
  .battle-winner {center;
    color: #ff9800;0.5);
    font-weight: bold;
    margin-left: 0.5em;
  }
  
  .battle-sides {
    display: flex;
    flex-direction: column;; }
    gap: 0.3em;
    font-size: 0.85em;style>
    margin-top: 0.4em;  }    .battle-side {    padding: 0.2em 0.5em;    border-radius: 0.3em;  }    .battle-side.side1 {    background-color: rgba(0, 0, 255, 0.07);    border: 1px solid rgba(0, 0, 255, 0.15);    color: #00008B;  }    .battle-side.side2 {    background-color: rgba(139, 0, 0, 0.07);    border: 1px solid rgba(139, 0, 0, 0.15);    color: #8B0000;  }    .side-name {    font-weight: 500;  }  .battle-timer {    font-family: var(--font-mono, monospace);    font-size: 0.85em;    color: #d32f2f;    margin-top: 0.3em;  }  .battle-progress {    margin-top: 0.4em;    width: 100%;  }    .progress-bar {    height: 0.5em;    background-color: rgba(0, 0, 0, 0.1);    border-radius: 0.25em;    overflow: hidden;    margin-bottom: 0.2em;  }    .progress-fill {    height: 100%;    background-color: rgba(139, 0, 0, 0.7);    transition: width 1s ease;  }    .unit-count {    color: rgba(0, 0, 0, 0.7);    font-weight: 500;  }    .item-count {    color: #2d8659;    font-weight: 500;  }  
  .empty-state {
    padding: 2em;
    text-align: center;
    color: rgba(0, 0, 0, 0.5);
    font-style: italic;
  }

  
  @keyframes pulse {
    from { opacity: 0.8; }
    to { opacity: 1; }
  }
</style>
