<script>
  import { onMount, onDestroy } from 'svelte';
  import { fade, fly, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { entities, targetStore, coordinates, moveTarget, setHighlighted } from '../../lib/stores/map';
  import { game, currentPlayer } from '../../lib/stores/game';
  
  // Import race icon components
  import Human from '../../components/icons/Human.svelte';
  import Elf from '../../components/icons/Elf.svelte';
  import Dwarf from '../../components/icons/Dwarf.svelte';
  import Goblin from '../../components/icons/Goblin.svelte';
  import Fairy from '../../components/icons/Fairy.svelte';
  import Structure from '../../components/icons/Structure.svelte';
  import Torch from '../../components/icons/Torch.svelte';
  
  // Props
  const { closing = false } = $props();
  
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
    { id: 'items', label: 'Items' }
  ];
  
  // Add state to track collapsed sections
  let collapsedSections = $state({
    structures: false,
    players: false,
    groups: false,
    items: false
  });

  // Add state to track sorting options
  let sortOptions = $state({
    structures: { by: 'distance', asc: true },
    players: { by: 'distance', asc: true },
    groups: { by: 'distance', asc: true },
    items: { by: 'distance', asc: true }
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
    const option = sortOptions[section];
    
    return [...entities].sort((a, b) => {
      let valueA, valueB;
      
      switch(option.by) {
        case 'name':
          valueA = (section === 'structures' ? a.name || _fmt(a.type) : a.name || a.displayName || a.id || '').toLowerCase();
          valueB = (section === 'structures' ? b.name || _fmt(b.type) : b.name || b.displayName || b.id || '').toLowerCase();
          break;
        case 'type':
          valueA = (a.type || a.race || a.faction || '').toLowerCase();
          valueB = (b.type || b.race || b.faction || '').toLowerCase();
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

  // Simplify the time remaining formatter
  function formatTimeRemaining(endTime) {
    if (!endTime) return '';
    
    updateCounter;
    
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
    
    const worldSpeed = $game.worldInfo[$game.currentWorld]?.speed || 1.0;
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
    if (distance === 0) return 'Here';
    return `${distance.toFixed(1)} tiles away`;
  }

  // Maps faction to race for icon display
  function getFactionRace(faction) {
    // Default mapping of factions to races for icon display
    const factionToRace = {
      human: 'human',
      elf: 'elf',
      dwarf: 'dwarf',
      goblin: 'goblin',
      fairy: 'fairy'
    };
    
    return factionToRace[faction?.toLowerCase()] || null;
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
  
  // Calculate visible chunks count - fixed $derived syntax
  const visibleChunks = $derived(
    $coordinates.reduce((chunks, cell) => {
      if (cell.chunkKey) chunks.add(cell.chunkKey);
      return chunks;
    }, new Set()).size
  );
  
  // Track non-empty filter types - fix $derived syntax
  const nonEmptyFilters = $derived([
    ...(allStructures.length > 0 ? ['structures'] : []),
    ...(allPlayers.length > 0 ? ['players'] : []),
    ...(allGroups.length > 0 ? ['groups'] : []),
    ...(allItems.length > 0 ? ['items'] : [])
  ]);
  
  // Always show filter tabs if there are any entities, not just multiple types
  const showFilterTabs = $derived(nonEmptyFilters.length > 0);
  
  // Auto-select filter if there's only one type with content
  $effect(() => {
    if (nonEmptyFilters.length === 1) {
      setFilter(nonEmptyFilters[0]);
    } else if (nonEmptyFilters.length > 0 && !nonEmptyFilters.includes(activeFilter) && activeFilter !== 'all') {
      setFilter('all');
    }
  });
  
  // Check if a section should be visible based on the active filter
  function shouldShowSection(sectionType) {
    return activeFilter === 'all' || activeFilter === sectionType;
  }
  
  // Set active filter and ensure section is expanded when selecting a specific filter
  function setFilter(filter) {
    activeFilter = filter;
    
    // If selecting a specific filter (not 'all'), make sure the section is expanded
    if (filter !== 'all') {
      collapsedSections[filter] = false;
    }
  }
  
  // Calculate if any content exists for a given filter
  function hasContent(filter) {
    switch(filter) {
      case 'structures': return allStructures.length > 0;
      case 'players': return allPlayers.length > 0;
      case 'groups': return allGroups.length > 0;
      case 'items': return allItems.length > 0;
      case 'all': return allStructures.length > 0 || allPlayers.length > 0 || allGroups.length > 0 || allItems.length > 0;
      default: return false;
    }
  }
  
  // Calculate count for each filter
  function getFilterCount(filter) {
    switch(filter) {
      case 'structures': return allStructures.length;
      case 'players': return allPlayers.length;
      case 'groups': return allGroups.length;
      case 'items': return allItems.length;
      default: return 0;
    }
  }
  
  // Format coordinates for display
  function formatCoords(x, y) {
    return `${x},${y}`;
  }
  
  // Check if the entity is at the target location
  function isAtTarget(x, y) {
    return $targetStore && $targetStore.x === x && $targetStore.y === y;
  }

  // Enhanced handler for entity clicks that supports keyboard events
  function handleEntityAction(x, y, event) {
    // Prevent event propagation
    event.stopPropagation();
    
    // For keyboard events, only proceed if Enter or Space was pressed
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    
    console.log('Navigating to entity at:', x, y);
    
    // Move the map target to the entity's location
    moveTarget(x, y);
    
    // Also highlight the tile
    setHighlighted(x, y);
  }

  // Modified function to get sorted tabs with enabled ones first
  function getSortedFilterTabs() {
    // Always keep "all" as the first tab
    const allTab = filters.find(f => f.id === 'all');
    
    // Get other tabs and sort them - enabled first, then disabled
    const otherTabs = filters
      .filter(f => f.id !== 'all')
      .sort((a, b) => {
        const aHasContent = hasContent(a.id);
        const bHasContent = hasContent(b.id);
        
        if (aHasContent && !bHasContent) return -1;
        if (!aHasContent && bHasContent) return 1;
        return 0;
      });
    
    // Return all tab followed by sorted others
    return [allTab, ...otherTabs];
  }

  // Function to display item count for a group
  function getGroupItemCount(group) {
    if (!group.items) return 0;
    return Array.isArray(group.items) ? group.items.length : Object.keys(group.items).length;
  }
</script>

<div class="entities-wrapper" class:closing>
  <div class="entities-panel" transition:fly|local={{ y: -200, duration: 500, easing: cubicOut }}>
    <h3 class="title">
      Map Entities
      <span class="subtitle">{visibleChunks} chunks visible</span>
    </h3>
    
    <!-- Force filter tabs to always display when any entities exist -->
    {#if nonEmptyFilters.length > 0}
      <div class="filter-tabs">
        {#each getSortedFilterTabs() as filter}
          <button 
            class="filter-tab" 
            class:active={activeFilter === filter.id}
            class:has-content={hasContent(filter.id)} 
            onclick={() => setFilter(filter.id)}
            disabled={!hasContent(filter.id)}
          >
            {filter.label}
            {#if filter.id !== 'all' && getFilterCount(filter.id) > 0}
              <span class="filter-count">{getFilterCount(filter.id)}</span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
    
    <div class="entities-content">
      {#if shouldShowSection('structures') && allStructures.length > 0}
        <div class="entities-section">
          <div 
            class="section-header" 
            onclick={() => toggleSection('structures')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.structures}
            onkeydown={(e) => e.key === 'Enter' && toggleSection('structures')}
          >
            <h4 class:visually-hidden={activeFilter === 'structures'}>
              Structures ({allStructures.length})
            </h4>
            <div class="section-controls">
              {#if !collapsedSections.structures}
                <div class="sort-controls">
                  <button 
                    class="sort-option" 
                    class:active={sortOptions.structures.by === 'distance'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('structures', 'distance'); }}
                    aria-label={`Sort by distance ${sortOptions.structures.by === 'distance' ? (sortOptions.structures.asc ? 'ascending' : 'descending') : ''}`}
                  >
                    <span>Distance</span>
                    {#if sortOptions.structures.by === 'distance'}
                      <span class="sort-direction">{sortOptions.structures.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                  <button 
                    class="sort-option" 
                    class:active={sortOptions.structures.by === 'name'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('structures', 'name'); }}
                    aria-label={`Sort by name ${sortOptions.structures.by === 'name' ? (sortOptions.structures.asc ? 'ascending' : 'descending') : ''}`}
                  >
                    <span>Name</span>
                    {#if sortOptions.structures.by === 'name'}
                      <span class="sort-direction">{sortOptions.structures.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                  <button 
                    class="sort-option" 
                    class:active={sortOptions.structures.by === 'type'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('structures', 'type'); }}
                    aria-label={`Sort by type ${sortOptions.structures.by === 'type' ? (sortOptions.structures.asc ? 'ascending' : 'descending') : ''}`}
                  >
                    <span>Type</span>
                    {#if sortOptions.structures.by === 'type'}
                      <span class="sort-direction">{sortOptions.structures.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                </div>
              {/if}
              <button class="collapse-button" aria-label={collapsedSections.structures ? "Expand structures" : "Collapse structures"}>
                {collapsedSections.structures ? '▼' : '▲'}
              </button>
            </div>
          </div>
          
          {#if !collapsedSections.structures}
            <div class="section-content" transition:slide|local={{ duration: 300 }}>
              {#each sortedStructures as structure (structure.type + ':' + structure.x + ':' + structure.y)}
                <div 
                  class="entity structure" 
                  class:at-target={isAtTarget(structure.x, structure.y)}
                  onclick={(e) => handleEntityAction(structure.x, structure.y, e)}
                  onkeydown={(e) => handleEntityAction(structure.x, structure.y, e)}
                  role="button"
                  tabindex="0"
                  aria-label="Navigate to {structure.name || _fmt(structure.type) || 'Structure'} at {structure.x},{structure.y}"
                >
                  <div class="entity-structure-icon">
                    {#if structure.type === 'spawn'}
                      <Torch size="1.4em" extraClass="structure-type-icon" />
                    {:else}
                      <Structure size="1.4em" extraClass="structure-type-icon {structure.type}-icon" />
                    {/if}
                  </div>
                  <div class="entity-info">
                    <div class="entity-name">
                      {structure.name || _fmt(structure.type) || "Unknown"}
                      <span class="entity-coords">{formatCoords(structure.x, structure.y)}</span>
                    </div>
                    <div class="entity-info">
                      {#if structure.type}
                        <div class="entity-type">{_fmt(structure.type)}</div>
                      {/if}
                      <div class="entity-distance">{formatDistance(structure.distance)}</div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      
      {#if shouldShowSection('players') && allPlayers.length > 0}
        <div class="entities-section">
          <div 
            class="section-header" 
            onclick={() => toggleSection('players')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.players}
            onkeydown={(e) => e.key === 'Enter' && toggleSection('players')}
          >
            <h4 class:visually-hidden={activeFilter === 'players'}>
              Players ({allPlayers.length})
            </h4>
            <div class="section-controls">
              {#if !collapsedSections.players}
                <div class="sort-controls">
                  <button 
                    class="sort-option" 
                    class:active={sortOptions.players.by === 'distance'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('players', 'distance'); }}
                    aria-label={`Sort by distance ${sortOptions.players.by === 'distance' ? (sortOptions.players.asc ? 'ascending' : 'descending') : ''}`}
                  >
                    <span>Distance</span>
                    {#if sortOptions.players.by === 'distance'}
                      <span class="sort-direction">{sortOptions.players.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                  <button 
                    class="sort-option" 
                    class:active={sortOptions.players.by === 'name'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('players', 'name'); }}
                    aria-label={`Sort by name ${sortOptions.players.by === 'name' ? (sortOptions.players.asc ? 'ascending' : 'descending') : ''}`}
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
                    aria-label={`Sort by race ${sortOptions.players.by === 'type' ? (sortOptions.players.asc ? 'ascending' : 'descending') : ''}`}
                  >
                    <span>Race</span>
                    {#if sortOptions.players.by === 'type'}
                      <span class="sort-direction">{sortOptions.players.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                </div>
              {/if}
              <button class="collapse-button" aria-label={collapsedSections.players ? "Expand players" : "Collapse players"}>
                {collapsedSections.players ? '▼' : '▲'}
              </button>
            </div>
          </div>
          
          {#if !collapsedSections.players}
            <div class="section-content" transition:slide|local={{ duration: 300 }}>
              {#each sortedPlayers as entity ('player:' + entity.id + ':' + entity.x + ':' + entity.y)}
                <div 
                  class="entity player" 
                  class:current={entity.id === $currentPlayer?.uid} 
                  class:at-target={isAtTarget(entity.x, entity.y)}
                  onclick={(e) => handleEntityAction(entity.x, entity.y, e)}
                  onkeydown={(e) => handleEntityAction(entity.x, entity.y, e)}
                  role="button"
                  tabindex="0"
                  aria-label="Navigate to player {entity.displayName || 'Player'} at {entity.x},{entity.y}"
                >
                  <div class="entity-race-icon">
                    {#if entity.race?.toLowerCase() === 'human'}
                      <Human extraClass="race-icon-entity" />
                    {:else if entity.race?.toLowerCase() === 'elf'}
                      <Elf extraClass="race-icon-entity" />
                    {:else if entity.race?.toLowerCase() === 'dwarf'}
                      <Dwarf extraClass="race-icon-entity" />
                    {:else if entity.race?.toLowerCase() === 'goblin'}
                      <Goblin extraClass="race-icon-entity" />
                    {:else if entity.race?.toLowerCase() === 'fairy'}
                      <Fairy extraClass="race-icon-entity" />
                    {/if}
                  </div>
                  <div class="entity-info">
                    <div class="entity-name">
                      {entity.displayName || 'Player'}
                      <span class="entity-coords">{formatCoords(entity.x, entity.y)}</span>
                    </div>
                    <div class="entity-details">
                      {#if entity.race}
                        <div class="entity-race">{_fmt(entity.race)}</div>
                      {/if}
                      <div class="entity-distance">{formatDistance(entity.distance)}</div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      
      {#if shouldShowSection('groups') && allGroups.length > 0}
        <div class="entities-section">
          <div 
            class="section-header" 
            onclick={() => toggleSection('groups')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.groups}
            onkeydown={(e) => e.key === 'Enter' && toggleSection('groups')}
          >
            <h4 class:visually-hidden={activeFilter === 'groups'}>
              Groups ({allGroups.length})
            </h4>
            <div class="section-controls">
              {#if !collapsedSections.groups}
                <div class="sort-controls">
                  <button 
                    class="sort-option" 
                    class:active={sortOptions.groups.by === 'distance'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('groups', 'distance'); }}
                    aria-label={`Sort by distance ${sortOptions.groups.by === 'distance' ? (sortOptions.groups.asc ? 'ascending' : 'descending') : ''}`}
                  >
                    <span>Distance</span>
                    {#if sortOptions.groups.by === 'distance'}
                      <span class="sort-direction">{sortOptions.groups.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                  <button 
                    class="sort-option" 
                    class:active={sortOptions.groups.by === 'name'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('groups', 'name'); }}
                    aria-label={`Sort by name ${sortOptions.groups.by === 'name' ? (sortOptions.groups.asc ? 'ascending' : 'descending') : ''}`}
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
                    aria-label={`Sort by status ${sortOptions.groups.by === 'status' ? (sortOptions.groups.asc ? 'ascending' : 'descending') : ''}`}
                  >
                    <span>Status</span>
                    {#if sortOptions.groups.by === 'status'}
                      <span class="sort-direction">{sortOptions.groups.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                </div>
              {/if}
              <button class="collapse-button" aria-label={collapsedSections.groups ? "Expand groups" : "Collapse groups"}>
                {collapsedSections.groups ? '▼' : '▲'}
              </button>
            </div>
          </div>
          
          {#if !collapsedSections.groups}
            <div class="section-content" transition:slide|local={{ duration: 300 }}>
              {#each sortedGroups as group ('group:' + group.id)}
                <div 
                  class="entity" 
                  class:at-target={isAtTarget(group.x, group.y)}
                  onclick={(e) => handleEntityAction(group.x, group.y, e)}
                  onkeydown={(e) => handleEntityAction(group.x, group.y, e)}
                  tabindex="0"
                  role="button"
                  aria-label="View group {group.name}"
                >
                  <div class="entity-race-icon">
                    {#if group.race === 'human'}
                      <Human class="race-icon-entity" />
                    {:else if group.race === 'elf'}
                      <Elf class="race-icon-entity" />
                    {:else if group.race === 'dwarf'}
                      <Dwarf class="race-icon-entity" />
                    {:else if group.race === 'goblin'}
                      <Goblin class="race-icon-entity" />
                    {:else if group.race === 'fairy'}
                      <Fairy class="race-icon-entity" />
                    {/if}
                  </div>
                  
                  <div class="entity-info">
                    <div class="entity-name">
                      {group.name || `Group ${group.id.slice(-4)}`}
                      <span class="entity-coords">({formatCoords(group.x, group.y)})</span>
                    </div>
                    
                    <div class="entity-details">
                      <span class="unit-count">
                        {group.unitCount || (group.units ? group.units.length : 0)} units
                        {#if getGroupItemCount(group) > 0}
                          • <span class="item-count">{getGroupItemCount(group)} items</span>
                        {/if}
                      </span>
                      
                      <span 
                        class="status {getStatusClass(group.status)}" 
                        class:pending-tick={isPendingTick(
                          group.status === 'moving' 
                            ? group.nextMoveTime 
                            : (group.status === 'gathering' || group.status === 'starting_to_gather' 
                                ? group.gatheringUntil 
                                : group.readyAt)
                        )}
                      >
                        {#if group.status === 'starting_to_gather'}
                          Preparing to gather
                        {:else if group.status === 'mobilizing' || group.status === 'demobilising'}
                          {_fmt(group.status)} {formatTimeRemaining(group.readyAt)}
                        {:else if group.status === 'moving'}
                          {#if isPendingTick(group.nextMoveTime)}
                            ↻
                          {:else}
                            ({formatTimeRemaining(calculateMoveCompletionTime(group))})
                          {/if}
                        {:else if group.status === 'gathering' || group.status === 'starting_to_gather'}
                          {#if isPendingTick(group.gatheringUntil)}
                            ↻
                          {:else}
                            ({formatTimeRemaining(group.gatheringUntil)})
                          {/if}
                        {:else}
                          {_fmt(group.status)}
                        {/if}
                      </span>
                      
                      <span class="entity-distance">
                        {formatDistance(group.distance)}
                      </span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if shouldShowSection('items') && allItems.length > 0}
        <div class="entities-section">
          <div 
            class="section-header" 
            onclick={() => toggleSection('items')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.items}
            onkeydown={(e) => e.key === 'Enter' && toggleSection('items')}
          >
            <h4 class:visually-hidden={activeFilter === 'items'}>
              Items ({allItems.length})
            </h4>
            <div class="section-controls">
              {#if !collapsedSections.items}
                <div class="sort-controls">
                  <button 
                    class="sort-option" 
                    class:active={sortOptions.items.by === 'distance'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('items', 'distance'); }}
                    aria-label={`Sort by distance ${sortOptions.items.by === 'distance' ? (sortOptions.items.asc ? 'ascending' : 'descending') : ''}`}
                  >
                    <span>Distance</span>
                    {#if sortOptions.items.by === 'distance'}
                      <span class="sort-direction">{sortOptions.items.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                  <button 
                    class="sort-option" 
                    class:active={sortOptions.items.by === 'name'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('items', 'name'); }}
                    aria-label={`Sort by name ${sortOptions.items.by === 'name' ? (sortOptions.items.asc ? 'ascending' : 'descending') : ''}`}
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
                    aria-label={`Sort by rarity ${sortOptions.items.by === 'rarity' ? (sortOptions.items.asc ? 'ascending' : 'descending') : ''}`}
                  >
                    <span>Rarity</span>
                    {#if sortOptions.items.by === 'rarity'}
                      <span class="sort-direction">{sortOptions.items.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                </div>
              {/if}
              <button class="collapse-button" aria-label={collapsedSections.items ? "Expand items" : "Collapse items"}>
                {collapsedSections.items ? '▼' : '▲'}
              </button>
            </div>
          </div>
          
          {#if !collapsedSections.items}
            <div class="section-content" transition:slide|local={{ duration: 300 }}>
              {#each sortedItems as item ('item:' + (item.id || `${item.x}:${item.y}:${item.name || item.type}`).replace(/\s+/g, '-'))}
                <div 
                  class="entity item {getRarityClass(item.rarity)}" 
                  class:at-target={isAtTarget(item.x, item.y)}
                  onclick={(e) => handleEntityAction(item.x, item.y, e)}
                  onkeydown={(e) => handleEntityAction(item.x, item.y, e)}
                  role="button"
                  tabindex="0"
                  aria-label="Navigate to {item.name || _fmt(item.type) || 'Item'} at {item.x},{item.y}"
                >
                  <div class="item-icon {item.type}"></div>
                  <div class="entity-info">
                    <div class="entity-name">
                      {item.name || _fmt(item.type) || "Unknown Item"}
                      <span class="entity-coords">{formatCoords(item.x, item.y)}</span>
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
                      <div class="entity-distance">{formatDistance(item.distance)}</div>
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
      
      {#if !hasContent(activeFilter)}
        <div class="empty-state">
          {#if activeFilter === 'all'}
            No entities visible on map
          {:else}
            No {activeFilter} visible on map
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .entities-wrapper {
    position: absolute;
    top: 0.5em;
    right: 0.5em;
    z-index: 998;
    transition: opacity 0.2s ease;
    font-size: 1.4em; /* Increased from 1.2em */
    font-family: var(--font-body);
    max-width: 95%;
  }
  
  .entities-wrapper.closing {
    pointer-events: none;
  }
  
  .subtitle {
    font-size: 0.7em;
    font-weight: normal;
    color: rgba(0, 0, 0, 0.5);
    margin-left: 0.6em;
  }
  
  .entity-coords {
    font-size: 0.7em;
    color: rgba(0, 0, 0, 0.5);
    margin-left: 0.6em;
    font-weight: normal;
  }
  
  .at-target {
    background-color: rgba(64, 158, 255, 0.1);
    border-color: rgba(64, 158, 255, 0.3);
    position: relative; /* Added for ::before positioning */
  }
  
  .at-target::before {
    content: '•';
    color: rgba(64, 158, 255, 0.8);
    position: absolute;
    left: 0.2em;
    font-size: 1.3em;
  }
  
  .entities-panel {
    background-color: rgba(255, 255, 255, 0.85);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.3em;
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(0.5em);
    -webkit-backdrop-filter: blur(0.5em);
    width: 100%;
    max-width: 28em; /* Increased from 22.5em */
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: reveal 0.4s ease-out forwards;
    transform-origin: top right;
  }

  .map-entities {
    position: fixed;
    top: 0;
    right: 0;
    padding: .5em;
    width: 100%;
    max-width: 25em;
    display: flex;
    flex-direction: column;
    gap: .5em;
    z-index: 1100; /* Increase z-index to be higher than the grid */
    transform: translateZ(0); /* Create own stacking context */
    will-change: transform; /* Optimize for transform changes */
    pointer-events: none; /* Allow clicks to pass through to map */
    max-height: 100vh;
    overflow: hidden;
  }
  
  /* Filter tabs styling */
  .filter-tabs {
    display: flex;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    background-color: rgba(0, 0, 0, 0.03);
    padding: 0 0.3em;
    width: 100%;
    overflow-x: auto;
  }
  
  .filter-tab {
    padding: 0.6em 0.8em;
    font-family: var(--font-heading);
    font-size: 0.8em;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    color: rgba(0, 0, 0, 0.5);
    transition: all 0.2s ease;
    flex: 1;
    text-align: center;
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    white-space: nowrap;
  }
  
  /* Hide headings when filter is specifically selected */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
  
  .filter-tab:hover:not(:disabled) {
    background-color: rgba(0, 0, 0, 0.03);
    color: rgba(0, 0, 0, 0.8);
  }
  
  .filter-tab.active {
    border-bottom: 2px solid #4285f4;
    color: rgba(0, 0, 0, 0.9);
    font-weight: 500;
  }
  
  .filter-tab:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  
  .filter-tab.has-content:not(.active) {
    color: rgba(0, 0, 0, 0.7);
  }
  
  .filter-count {
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 0.8em;
    padding: 0.1em 0.4em;
    font-size: 0.7em;
    min-width: 1.1em;
    text-align: center;
    margin-left: 0.4em;
    line-height: 1.1;
  }
  
  .filter-tab.active .filter-count {
    background-color: #4285f4;
    color: white;
  }
  
  @keyframes reveal {
    from {
      opacity: 0;
      transform: scale(0.95);
      border-color: transparent;
    }
    to {
      opacity: 1;
      transform: scale(1);
      border-color: rgba(255, 255, 255, 0.2);
    }
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
  }
  
  .entities-content {
    padding: 0.8em;
    max-height: 60vh;
    overflow-y: auto;
  }
  
  .entities-section {
    margin-bottom: 1.2em;
  }
  
  .entities-section:last-child {
    margin-bottom: 0;
  }
  
  h4 {
    margin: 0 0 0.5em 0;
    font-size: 0.9em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .entity {
    display: flex;
    align-items: flex-start;
    margin-bottom: 0.6em;
    padding: 0.5em 0.7em;
    border-radius: 0.3em;
    background-color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(0, 0, 0, 0.1);
    cursor: pointer;
    transition: background-color 0.2s ease;
  }
  
  .entity:hover {
    background-color: rgba(255, 255, 255, 0.8);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  .entity:focus {
    outline: 2px solid rgba(66, 133, 244, 0.6);
    box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.3);
  }
  
  .entity.player.current {
    background-color: rgba(66, 133, 244, 0.05);
    border-color: rgba(66, 133, 244, 0.3);
  }
  
  .entity-race-icon {
    margin-right: 0.7em;
    margin-top: 0.1em;
  }
  
  :global(.race-icon-entity) {
    width: 1.4em;
    height: 1.4em;
    fill: rgba(0, 0, 0, 0.7);
  }
  
  .entity-info {
    flex: 1;
  }
  
  .entity-name {
    font-weight: 500;
    color: rgba(0, 0, 0, 0.85);
    line-height: 1.2;
    margin-bottom: 0.2em;
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
  
  .entity-distance {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.5);
    margin-left: auto;
    white-space: nowrap;
  }
  
  .entity-race {
    font-size: 0.85em;
    font-style: italic;
    color: rgba(0, 0, 0, 0.6);
  }
  
  .entity-type {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.6);
  }
  
  .unit-count {
    color: rgba(0, 0, 0, 0.6);
  }
  
  .status {
    display: inline-block;
    font-size: 0.9em;
    padding: 0.1em 0.4em;
    border-radius: 0.3em;
    white-space: nowrap;
    font-weight: 500;
  }
  
  .status.mobilizing {
    background: rgba(255, 165, 0, 0.15);
    border: 1px solid rgba(255, 165, 0, 0.3);
    color: #ff8c00;
    animation: pulseMobilizing 2s infinite;
  }
  
  @keyframes pulseMobilizing {
    0% { box-shadow: 0 0 0 0 rgba(255, 165, 0, 0.4); }
    50% { box-shadow: 0 0 0 3px rgba(255, 165, 0, 0); }
    100% { box-shadow: 0 0 0 0 rgba(255, 165, 0, 0); }
  }
  
  .status.moving {
    background: rgba(0, 128, 0, 0.15);
    border: 1px solid rgba(0, 128, 0, 0.3);
    color: #008000;
    animation: pulseMoving 2s infinite;
  }
  
  @keyframes pulseMoving {
    0% { box-shadow: 0 0 0 0 rgba(0, 128, 0, 0.4); }
    50% { box-shadow: 0 0 0 3px rgba(0, 128, 0, 0); }
    100% { box-shadow: 0 0 0 0 rgba(0, 128, 0, 0); }
  }
  
  .status.gathering {
    background: rgba(75, 181, 67, 0.15);
    border: 1px solid rgba(75, 181, 67, 0.3);
    color: #2d8659;
  }

  .status.starting_to_gather {
    background: rgba(249, 168, 37, 0.15);
    border: 1px solid rgba(249, 168, 37, 0.3);
    color: #E65100;
    animation: pulseStartingGather 2s infinite;
  }
  
  @keyframes pulseStartingGather {
    0% { box-shadow: 0 0 0 0 rgba(249, 168, 37, 0.4); }
    50% { box-shadow: 0 0 0 3px rgba(249, 168, 37, 0); }
    100% { box-shadow: 0 0 0 0 rgba(249, 168, 37, 0); }
  }
  
  .status.scouting {
    background: rgba(148, 0, 211, 0.15);
    border: 1px solid rgba(148, 0, 211, 0.3);
    color: #9400d3;
  }
  
  .status.idle {
    background: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.6);
  }
  
  .status.demobilising {
    background: rgba(147, 112, 219, 0.15);
    border: 1px solid rgba(147, 112, 219, 0.3);
    color: #8a2be2;
    animation: pulseDemobilising 2s infinite;
  }
  
  @keyframes pulseDemobilising {
    0% { box-shadow: 0 0 0 0 rgba(147, 112, 219, 0.4); }
    50% { box-shadow: 0 0 0 3px rgba(147, 112, 219, 0); }
    100% { box-shadow: 0 0 0 0 rgba(147, 112, 219, 0); }
  }
  
  .status.fighting {
    background: rgba(139, 0, 0, 0.15);
    border: 1px solid rgba(139, 0, 0, 0.3);
    color: #8B0000;
    animation: pulseFighting 1.5s infinite;
  }
  
  @keyframes pulseFighting {
    0% { box-shadow: 0 0 0 0 rgba(139, 0, 0, 0.4); }
    50% { box-shadow: 0 0 0 3px rgba(139, 0, 0, 0); }
    100% { box-shadow: 0 0 0 0 rgba(139, 0, 0, 0); }
  }
  
  .battle-tag {
    font-size: 0.75em;
    padding: 0.1em 0.3em;
    border-radius: 0.2em;
    background-color: rgba(139, 0, 0, 0.07);
    border: 1px solid rgba(139, 0, 0, 0.15);
    color: #8B0000;
    white-space: nowrap;
    margin-left: 0.3em;
  }
  
  .battle-side-1 {
    background-color: rgba(0, 0, 255, 0.07);
    border: 1px solid rgba(0, 0, 255, 0.15);
    color: #00008B;
  }
  
  .battle-side-2 {
    background-color: rgba(139, 0, 0, 0.07);
    border: 1px solid rgba(139, 0, 0, 0.15);
    color: #8B0000;
  }
  
  .pending-tick {
    background: rgba(255, 215, 0, 0.2) !important;
    border-color: rgba(255, 215, 0, 0.5) !important;
    color: #b8860b !important;
    animation: pulseWaiting 1s infinite alternate !important;
  }
  
  @keyframes pulseWaiting {
    from { opacity: 0.7; }
    to { opacity: 1; }
  }
  
  .empty-state {
    padding: 2em;
    text-align: center;
    color: rgba(0, 0, 0, 0.5);
    font-style: italic;
  }
  
  /* Fix for mobile screens */
  @media (max-width: 480px) {
    .entities-wrapper {
      top: 0.5em;
      right: 0.5em;
      font-size: 1em;
    }
     
    .entities-panel {
      max-width: 100%;
    }
    
    .entity-details {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.3em;
    }
    
    .filter-tabs {
      overflow-x: auto;
      padding: 0;
    }
    
    .filter-tab {
      padding: 0.5em;
      font-size: 0.7em;
    }
  }

  /* Item styles */
  .item-icon {
    width: 1.4em;
    height: 1.4em;
    margin-right: 0.7em;
    margin-top: 0.1em;
    border-radius: 0.2em;
    background-color: rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .item-icon::before {
    content: '';
    position: absolute;
    width: 60%;
    height: 60%;
    background-color: rgba(0, 0, 0, 0.2);
  }

  .item-icon.resource::before {
    content: '♦';
    font-size: 0.9em;
    color: #228B22;
    background: none;
  }

  .item-icon.quest_item::before {
    content: '!';
    font-size: 0.9em;
    color: #FF8C00;
    background: none;
    font-weight: bold;
  }

  .item-icon.artifact::before {
    content: '★';
    font-size: 1em;
    color: #9932CC;
    background: none;
  }

  .item-icon.gem::before {
    content: '◆';
    font-size: 0.9em;
    color: #4169E1;
    background: none;
  }

  .item-icon.tool::before {
    content: '⚒';
    font-size: 0.8em;
    color: #696969;
    background: none;
  }

  .item-icon.currency::before {
    content: '⚜';
    font-size: 0.8em;
    color: #DAA520;
    background: none;
  }

  .item-icon.junk::before {
    content: '✽';
    font-size: 0.9em;
    color: #A9A9A9;
    background: none;
  }

  .item-icon.treasure::before {
    content: '❖';
    font-size: 0.9em;
    color: #FFD700;
    background: none;
  }

  .item-type {
    color: rgba(0, 0, 0, 0.6);
    white-space: nowrap;
  }

  .item-quantity {
    font-weight: 600;
    color: rgba(0, 0, 0, 0.7);
  }

  .item-description {
    font-size: 0.8em;
    font-style: italic;
    color: rgba(0, 0, 0, 0.6);
    margin-top: 0.3em;
  }

  .item-rarity {
    display: inline-block;
    font-size: 0.85em;
    padding: 0.1em 0.4em;
    border-radius: 0.3em;
    white-space: nowrap;
    font-weight: 500;
  }

  .item-rarity.uncommon {
    background: rgba(30, 255, 0, 0.15);
    border: 1px solid rgba(30, 255, 0, 0.3);
    color: #228B22;
  }

  .item-rarity.rare {
    background: rgba(0, 112, 221, 0.15);
    border: 1px solid rgba(0, 112, 221, 0.3);
    color: #0070DD;
  }

  .item-rarity.epic {
    background: rgba(148, 0, 211, 0.15);
    border: 1px solid rgba(148, 0, 211, 0.3);
    color: #9400D3;
  }

  .item-rarity.legendary {
    background: rgba(255, 165, 0, 0.15);
    border: 1px solid rgba(255, 165, 0, 0.3);
    color: #FF8C00;
  }

  .item-rarity.mythic {
    background: rgba(255, 128, 255, 0.15);
    border: 1px solid rgba(255, 128, 255, 0.3);
    color: #FF1493;
  }

  .entity.item.rare {
    border-color: rgba(0, 112, 221, 0.3);
    box-shadow: inset 0 0 0.2em rgba(0, 112, 221, 0.15);
  }

  .entity.item.epic {
    border-color: rgba(148, 0, 211, 0.3);
    box-shadow: inset 0 0 0.2em rgba(148, 0, 211, 0.15);
  }

  .entity.item.legendary {
    border-color: rgba(255, 165, 0, 0.3);
    box-shadow: inset 0 0 0.2em rgba(255, 165, 0, 0.15);
  }

  .entity.item.mythic {
    border-color: rgba(255, 128, 255, 0.3);
    box-shadow: inset 0 0 0.3em rgba(255, 128, 255, 0.15);
  }

  /* Collapsible section styles */
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    padding: 0.2em 0;
    user-select: none;
  }
  
  .section-header:hover {
    background-color: rgba(0, 0, 0, 0.03);
  }
  
  .section-header:focus {
    outline: 2px solid rgba(66, 133, 244, 0.6);
    border-radius: 0.3em;
  }
  
  .collapse-button {
    background: none;
    border: none;
    color: rgba(0, 0, 0, 0.5);
    font-size: 0.8em;
    cursor: pointer;
    padding: 0.2em 0.5em;
    transition: all 0.2s ease;
  }
  
  .collapse-button:hover {
    color: rgba(0, 0, 0, 0.8);
  }
  
  .section-content {
    overflow: hidden;
  }

  /* Section header controls styling */
  .section-controls {
    display: flex;
    align-items: center;
    gap: 0.5em;
  }
  
  .sort-controls {
    display: flex;
    gap: 0.2em;
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
  
  /* When in mobile view or narrow screens, hide sort buttons and show collapse button only */
  @media (max-width: 480px) {
    .sort-controls {
      display: none;
    }
    
    /* But show them when in active filter mode */
    .entities-section:has(h4.visually-hidden) .sort-controls {
      display: flex;
    }
  }

  .item-count {
    color: #2d8659;
    font-weight: 500;
  }

  .entity-structure-icon {
    margin-right: 0.7em;
    margin-top: 0.1em;
  }
  
  :global(.structure-type-icon) {
    width: 1.4em;
    height: 1.4em;
    fill: rgba(0, 0, 0, 0.7);
  }
  
  :global(.fortress-icon) {
    fill: #E6BE8A;
  }
  
  :global(.outpost-icon) {
    fill: #8AB0E6;
  }
  
  :global(.watchtower-icon) {
    fill: #A8E68A;
  }
  
  :global(.stronghold-icon) {
    fill: #E68A8A;
  }
  
  :global(.citadel-icon) {
    fill: #D18AE6;
  }
</style>
