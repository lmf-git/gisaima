<script>
  import { onMount, onDestroy } from 'svelte';
  import { targetStore, coordinates, moveTarget, setHighlighted } from '../../../lib/stores/map';
  import { game, currentPlayer, timeUntilNextTick } from '../../../lib/stores/game';
  
  import { calculateGroupPower } from 'gisaima-shared/war/battles.js';

  import Human from '../../icons/Human.svelte';
  import Elf from '../../icons/Elf.svelte';
  import Dwarf from '../../icons/Dwarf.svelte';
  import Goblin from '../../icons/Goblin.svelte';
  import Fairy from '../../icons/Fairy.svelte';
  import Structure from '../../icons/Structure.svelte';
  import Torch from '../../icons/Torch.svelte';
  import Close from '../../icons/Close.svelte';
  import Monster from '../../icons/Monster.svelte';
  
  // Import the new GroupStatus component
  import GroupStatus from './GroupStatus.svelte';
  

  const { 
    closing = false, 
    onShowStructure = null, 
    onClose = null,

    // Used to position above other map UI.
    isActive = false,
    onMouseEnter = () => {}
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

  // Add state to track expanded group details
  let expandedGroups = $state({});
  
  // Function to toggle section collapse state
  function toggleSection(sectionId, event) {
    // Prevent event from bubbling if provided
    if (event) {
      event.stopPropagation();
    }
    
    // Toggle the collapsed state
    collapsedSections[sectionId] = !collapsedSections[sectionId];
  }

  // Function to toggle group expansion
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
  
  // Format distance for display
  function formatDistance(distance) {
    if (distance === 0) return '• Here';
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
  
  // Extract all entities from all visible coordinates - simplified battle extraction
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

  // Simplified battles extraction - directly from coordinates
  const allBattles = $derived(
    $coordinates
      .flatMap(cell => 
        (cell.battles || []).map(battle => ({
          ...battle,
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
    ...(allItems.length > 0 ? ['items'] : []),
    ...(allBattles.length > 0 ? ['battles'] : [])  // Add battles
  ]);
  
  // Auto-select filter if there's only one type with content and expand that section
  $effect(() => {
    if (nonEmptyFilters.length === 1) {
      setFilter(nonEmptyFilters[0]);
      collapsedSections[nonEmptyFilters[0]] = false; // Ensure section is expanded
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
      case 'battles': return allBattles.length > 0;
      case 'all': return allStructures.length > 0 || allPlayers.length > 0 || allGroups.length > 0 || allItems.length > 0 || allBattles.length > 0;
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
      case 'battles': return allBattles.length;
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

  // Function to count units in a group
  function getGroupUnitCount(group) {
    if (!group.units) return 0;
    return Array.isArray(group.units) ? group.units.length : Object.keys(group.units).length;
  }

  // Function to check if entity belongs to current player
  function isOwnedByCurrentPlayer(entity) {
    if (!$currentPlayer || !entity) return false;
    
    // For player entities, compare the ID directly 
    if (entity.displayName !== undefined && entity.id !== undefined && !entity.owner) {
      return entity.id === $currentPlayer.id;
    }
    
    // For other entities like groups or structures, check the owner property
    return entity.owner?.toString() === $currentPlayer.id?.toString();
  }

  // Format total power for each side
  function formatPower(power) {
    if (!power && power !== 0) return '?';
    return power.toLocaleString();
  }
</script>

<section 
  class="entities-wrapper" 
  class:closing 
  class:active={isActive}
  onmouseenter={onMouseEnter}
  role="dialog"
  aria-label="Map entities overview"
  aria-modal="true"
>
  <div class="entities-panel">
    <h3 class="title">
      Map Entities
      <span class="subtitle">{visibleChunks} chunks visible</span>
      
      <!-- Replace the close button to match the size in Details component -->
      <button 
        class="close-button" 
        onclick={onClose} 
        aria-label="Close map entities panel"
        onkeydown={(e) => e.key === 'Escape' && onClose()}
      >
        <Close size="1.6em" extraClass="close-icon-dark" />
      </button>
    </h3>
    
    <!-- Force filter tabs to always display when any entities exist -->
    {#if nonEmptyFilters.length > 0}
      <div class="filter-tabs">
        {#each getSortedFilterTabs() as filter}
          <button 
            class="filter-tab {filter.id === activeFilter ? 'active' : ''} {hasContent(filter.id) ? 'has-content' : ''}"
            onclick={() => setFilter(filter.id)}
            disabled={!hasContent(filter.id)}
          >
            {filter.label}
            {#if getFilterCount(filter.id) > 0}
              <span class="filter-count" class:filter-count-structures={filter.id === 'structures'} class:filter-count-players={filter.id === 'players'} class:filter-count-groups={filter.id === 'groups'} class:filter-count-items={filter.id === 'items'} class:filter-count-battles={filter.id === 'battles'}>
                {getFilterCount(filter.id)}
              </span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
    
    <div class="entities-content"> 
      <!-- Structures Section -->
      {#if shouldShowSection('structures') && allStructures.length > 0}
        <div class="entities-section">
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
                    <button 
                      class="sort-option"
                      class:active={sortOptions.structures.by === 'distance'}
                      onclick={(e) => { e.stopPropagation(); setSortOption('structures', 'distance'); }}
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
                    >
                      <span>Type</span>
                      {#if sortOptions.structures.by === 'type'}
                        <span class="sort-direction">{sortOptions.structures.asc ? '↑' : '↓'}</span>
                      {/if}
                    </button>
                  </div>
                {/if}
                <button class="collapse-button">
                  {collapsedSections.structures ? '▼' : '▲'}
                </button>
              </div>
            </div>
          {:else}
            <!-- Just show sort controls on specific tabs -->
            <div class="tab-sort-controls">
              <div class="sort-controls">
                <button 
                  class="sort-option"
                  class:active={sortOptions.structures.by === 'distance'}
                  onclick={() => setSortOption('structures', 'distance')}
                >
                  <span>Distance</span>
                  {#if sortOptions.structures.by === 'distance'}
                    <span class="sort-direction">{sortOptions.structures.asc ? '↑' : '↓'}</span>
                  {/if}
                </button>
                <button 
                  class="sort-option" 
                  class:active={sortOptions.structures.by === 'name'}
                  onclick={() => setSortOption('structures', 'name')}
                >
                  <span>Name</span>
                  {#if sortOptions.structures.by === 'name'}
                    <span class="sort-direction">{sortOptions.structures.asc ? '↑' : '↓'}</span>
                  {/if}
                </button>
                <button 
                  class="sort-option" 
                  class:active={sortOptions.structures.by === 'type'}
                  onclick={() => setSortOption('structures', 'type')}
                >
                  <span>Type</span>
                  {#if sortOptions.structures.by === 'type'}
                    <span class="sort-direction">{sortOptions.structures.asc ? '↑' : '↓'}</span>
                  {/if}
                </button>
              </div>
            </div>
          {/if}
          
          <div class="section-content" 
               class:expanded={activeFilter !== 'all' || !collapsedSections.structures} 
               class:collapsed={activeFilter === 'all' && collapsedSections.structures}>
            {#if activeFilter !== 'all' || !collapsedSections.structures}
              {#each sortedStructures as structure (structure.type + ':' + structure.x + ':' + structure.y)}
                <div 
                  class="entity structure {isAtTarget(structure.x, structure.y) ? 'at-target' : ''} {isOwnedByCurrentPlayer(structure) ? 'current-player-owned' : ''}"
                  class:is-here={structure.distance === 0}
                  onkeydown={(e) => handleEntityAction(structure.x, structure.y, e)}
                  role="button"
                  tabindex="0"
                  aria-label="Navigate to {structure.name || _fmt(structure.type) || 'Structure'} at {structure.x},{structure.y}"
                  onclick={(e) => {
                    e.stopPropagation();
                    handleStructureClick(structure, structure.x, structure.y);
                  }}
                >
                  <div class="entity-structure-icon">
                    {#if structure.type === 'spawn'}
                      <Torch size="1.4em" extraClass="overview-structure-icon overview-spawn-icon" />
                    {:else}
                      <Structure size="1.4em" extraClass={`overview-structure-icon ${structure.type}-icon`} />
                    {/if}
                  </div>
                  <div class="entity-info">
                    <div class="entity-name">
                      {structure.name || _fmt(structure.type) || "Unknown"}
                      {#if isOwnedByCurrentPlayer(structure)}
                        <span class="entity-badge owner-badge">Yours</span>
                      {/if}
                      {#if structure.battleId}
                        <span class="entity-badge fighting">Under Attack</span>
                      {/if}
                      {#if structure.status === 'building'}
                        <span class="entity-badge building-badge">Building</span>
                      {/if}
                      <span class="entity-coords">{formatCoords(structure.x, structure.y)}</span>
                    </div>
                    <div class="entity-details">
                      {#if structure.type}
                        <div class="entity-type">{_fmt(structure.type)}</div>
                      {/if}
                      <div class="entity-distance">{formatDistance(structure.distance)}</div>
                    </div>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      {/if}
       
      <!-- Players Section -->
      {#if shouldShowSection('players') && allPlayers.length > 0}
        <div class="entities-section">
          {#if activeFilter === 'all'}
            <div 
              class="section-header"
              onclick={(e) => toggleSection('players', e)}
              role="button"
              tabindex="0"
              aria-expanded={!collapsedSections.players}
              onkeydown={(e) => e.key === 'Enter' && toggleSection('players', e)}
            >
              <div class="section-title">
                Players <span class="section-count filter-count filter-count-players">{allPlayers.length}</span>
              </div>
              <div class="section-controls">
                {#if !collapsedSections.players}
                  <div class="sort-controls">
                    <button 
                      class="sort-option"
                      class:active={sortOptions.players.by === 'distance'}
                      onclick={(e) => { e.stopPropagation(); setSortOption('players', 'distance'); }}
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
          {:else}
            <div class="tab-sort-controls">
              <div class="sort-controls">
                <button 
                  class="sort-option"
                  class:active={sortOptions.players.by === 'distance'}
                  onclick={() => setSortOption('players', 'distance')}
                >
                  <span>Distance</span>
                  {#if sortOptions.players.by === 'distance'}
                    <span class="sort-direction">{sortOptions.players.asc ? '↑' : '↓'}</span>
                  {/if}
                </button>
                <button 
                  class="sort-option" 
                  class:active={sortOptions.players.by === 'name'}
                  onclick={() => setSortOption('players', 'name')}
                >
                  <span>Name</span>
                  {#if sortOptions.players.by === 'name'}
                    <span class="sort-direction">{sortOptions.players.asc ? '↑' : '↓'}</span>
                  {/if}
                </button>
                <button 
                  class="sort-option" 
                  class:active={sortOptions.players.by === 'type'}
                  onclick={() => setSortOption('players', 'type')}
                >
                  <span>Race</span>
                  {#if sortOptions.players.by === 'type'}
                    <span class="sort-direction">{sortOptions.players.asc ? '↑' : '↓'}</span>
                  {/if}
                </button>
              </div>
            </div>
          {/if}
          
          <div class="section-content"
               class:expanded={activeFilter !== 'all' || !collapsedSections.players}
               class:collapsed={activeFilter === 'all' && collapsedSections.players}>
            {#if activeFilter !== 'all' || !collapsedSections.players}
              {#each sortedPlayers as entity ('player:' + entity.id + ':' + entity.x + ':' + entity.y)}
                <div 
                  class="entity player {entity.id === $currentPlayer?.id ? 'current' : ''} {isAtTarget(entity.x, entity.y) ? 'at-target' : ''} {isOwnedByCurrentPlayer(entity) ? 'current-player-owned' : ''}"
                  class:is-here={entity.distance === 0}
                  onclick={(e) => handleEntityAction(entity.x, entity.y, e)}
                  onkeydown={(e) => handleEntityAction(entity.x, entity.y, e)}
                  role="button"
                  tabindex="0"
                  aria-label="Navigate to player {entity.displayName || 'Player'} at {entity.x},{entity.y}"
                >
                  <div class="entity-icon">
                    {#if entity.race}
                      {#if entity.race.toLowerCase() === 'human'}
                        <Human extraClass="race-icon-overview" />
                      {:else if entity.race.toLowerCase() === 'elf'}
                        <Elf extraClass="race-icon-overview" />
                      {:else if entity.race.toLowerCase() === 'dwarf'}
                        <Dwarf extraClass="race-icon-overview" />
                      {:else if entity.race.toLowerCase() === 'goblin'}
                        <Goblin extraClass="race-icon-overview" />
                      {:else if entity.race.toLowerCase() === 'fairy'}
                        <Fairy extraClass="race-icon-overview" />
                      {/if}
                    {/if}
                  </div>
                  <div class="entity-info">
                    <div class="entity-name">
                      {entity.displayName || 'Player'}
                      {#if isOwnedByCurrentPlayer(entity)}
                        <span class="entity-badge owner-badge">You</span>
                      {/if}
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
            {/if}
          </div>
        </div>
      {/if}
       
      <!-- Groups Section -->
      {#if shouldShowSection('groups') && allGroups.length > 0}
        <div class="entities-section">
          {#if activeFilter === 'all'}
            <div 
              class="section-header"
              onclick={(e) => toggleSection('groups', e)}
              role="button"
              tabindex="0"
              aria-expanded={!collapsedSections.groups}
              onkeydown={(e) => e.key === 'Enter' && toggleSection('groups', e)}
            >
              <div class="section-title">
                Groups <span class="section-count filter-count filter-count-groups">{allGroups.length}</span>
              </div>
              <div class="section-controls">
                {#if !collapsedSections.groups}
                  <div class="sort-controls">
                    <button 
                      class="sort-option"
                      class:active={sortOptions.groups.by === 'distance'}
                      onclick={(e) => { e.stopPropagation(); setSortOption('groups', 'distance'); }}
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
          {:else}
            <div class="tab-sort-controls">
              <div class="sort-controls">
                <button 
                  class="sort-option"
                  class:active={sortOptions.groups.by === 'distance'}
                  onclick={() => setSortOption('groups', 'distance')}
                >
                  <span>Distance</span>
                  {#if sortOptions.groups.by === 'distance'}
                    <span class="sort-direction">{sortOptions.groups.asc ? '↑' : '↓'}</span>
                  {/if}
                </button>
                <button 
                  class="sort-option" 
                  class:active={sortOptions.groups.by === 'name'}
                  onclick={() => setSortOption('groups', 'name')}
                >
                  <span>Name</span>
                  {#if sortOptions.groups.by === 'name'}
                    <span class="sort-direction">{sortOptions.groups.asc ? '↑' : '↓'}</span>
                  {/if}
                </button>
                <button 
                  class="sort-option" 
                  class:active={sortOptions.groups.by === 'status'}
                  onclick={() => setSortOption('groups', 'status')}
                >
                  <span>Status</span>
                  {#if sortOptions.groups.by === 'status'}
                    <span class="sort-direction">{sortOptions.groups.asc ? '↑' : '↓'}</span>
                  {/if}
                </button>
              </div>
            </div>
          {/if}
          
          <div class="section-content"
               class:expanded={activeFilter !== 'all' || !collapsedSections.groups}
               class:collapsed={activeFilter === 'all' && collapsedSections.groups}>
            {#if activeFilter !== 'all' || !collapsedSections.groups}
              {#each sortedGroups as group (`group:${group.x},${group.y}:${group.id}`)}
                <div 
                  class="entity {isAtTarget(group.x, group.y) ? 'at-target' : ''} {isOwnedByCurrentPlayer(group) ? 'current-player-owned' : ''}"
                  class:is-here={group.distance === 0}
                  onclick={(e) => handleEntityAction(group.x, group.y, e)}
                  onkeydown={(e) => handleEntityAction(group.x, group.y, e)}
                  tabindex="0"
                  role="button"
                  aria-label="View group {group.name}"
                >
                  <div class="entity-icon">
                    {#if group.type === 'monster'}
                      <Monster extraClass="race-icon-overview" />
                    {:else if group.race}
                      {#if group.race.toLowerCase() === 'human'}
                        <Human extraClass="race-icon-overview" />
                      {:else if group.race.toLowerCase() === 'elf'}
                        <Elf extraClass="race-icon-overview" />
                      {:else if group.race.toLowerCase() === 'dwarf'}
                        <Dwarf extraClass="race-icon-overview" />
                      {:else if group.race.toLowerCase() === 'goblin'}
                        <Goblin extraClass="race-icon-overview" />
                      {:else if group.race.toLowerCase() === 'fairy'}
                        <Fairy extraClass="race-icon-overview" />
                      {/if}
                    {/if}
                  </div>
                  
                  <div class="entity-info">
                    <div class="entity-name">
                      {group.name || `Group ${group.id.slice(-4)}`}
                      {#if isOwnedByCurrentPlayer(group)}
                        <span class="entity-badge owner-badge">Yours</span>
                      {/if}
                      <span class="entity-coords">({formatCoords(group.x, group.y)})</span>
                      <span class="group-power">({formatPower(calculateGroupPower(group))})</span>
                    </div>
                    
                    <div class="entity-details">
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
                      
                      <!-- Pass the updateCounter to GroupStatus -->
                      <GroupStatus group={group} updateCounter={updateCounter} />
                      
                      <span class="entity-distance">
                        {formatDistance(group.distance)}
                      </span>
                    </div>
                    
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
              {/each}
            {/if}
          </div>
        </div>
      {/if}

      <!-- Items Section -->
      {#if shouldShowSection('items') && allItems.length > 0}
        <div class="entities-section">
          {#if activeFilter === 'all'}
            <div 
              class="section-header"
              onclick={(e) => toggleSection('items', e)}
              role="button"
              tabindex="0"
              aria-expanded={!collapsedSections.items}
              onkeydown={(e) => e.key === 'Enter' && toggleSection('items', e)}
            >
              <div class="section-title">
                Items <span class="section-count filter-count filter-count-items">{allItems.length}</span>
              </div>
              <div class="section-controls">
                {#if !collapsedSections.items}
                  <div class="sort-controls">
                    <button 
                      class="sort-option"
                      class:active={sortOptions.items.by === 'distance'}
                      onclick={(e) => { e.stopPropagation(); setSortOption('items', 'distance'); }}
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
          {:else}
            <div class="tab-sort-controls">
              <div class="sort-controls">
                <button 
                  class="sort-option"
                  class:active={sortOptions.items.by === 'distance'}
                  onclick={() => setSortOption('items', 'distance')}
                >
                  <span>Distance</span>
                  {#if sortOptions.items.by === 'distance'}
                    <span class="sort-direction">{sortOptions.items.asc ? '↑' : '↓'}</span>
                  {/if}
                </button>
                <button 
                  class="sort-option" 
                  class:active={sortOptions.items.by === 'name'}
                  onclick={() => setSortOption('items', 'name')}
                >
                  <span>Name</span>
                  {#if sortOptions.items.by === 'name'}
                    <span class="sort-direction">{sortOptions.items.asc ? '↑' : '↓'}</span>
                  {/if}
                </button>
                <button 
                  class="sort-option" 
                  class:active={sortOptions.items.by === 'rarity'}
                  onclick={() => setSortOption('items', 'rarity')}
                >
                  <span>Rarity</span>
                  {#if sortOptions.items.by === 'rarity'}
                    <span class="sort-direction">{sortOptions.items.asc ? '↑' : '↓'}</span>
                  {/if}
                </button>
              </div>
            </div>
          {/if}
          
          <div class="section-content"
               class:expanded={activeFilter !== 'all' || !collapsedSections.items}
               class:collapsed={activeFilter === 'all' && collapsedSections.items}>
            {#if activeFilter !== 'all' || !collapsedSections.items}
              {#each sortedItems as item ('item:' + (item.id || `${item.x}:${item.y}:${item.name || item.type}`).replace(/\s+/g, '-'))}
                <div 
                  class="entity item {item.rarity}" 
                  class:at-target={isAtTarget(item.x, item.y)}
                  class:is-here={item.distance === 0}
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
            {/if}
          </div>
        </div>
      {/if}

      <!-- Battles Section -->
      {#if shouldShowSection('battles') && sortedBattles.length > 0}
        <div class="entities-section">
          <div class="section-header" onclick={e => toggleSection('battles', e)}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.battles}
            onkeydown={(e) => e.key === 'Enter' && toggleSection('battles', e)}>
            <h4 class="section-title">Battles ({sortedBattles.length})</h4>
            <div class="section-controls">
              <div class="tab-sort-controls">
                <div class="sort-controls">
                  <button 
                    class="sort-option"
                    class:active={sortOptions.battles.by === 'distance'}
                    onclick={() => setSortOption('battles', 'distance')}
                  >
                    <span>Distance</span>
                    {#if sortOptions.battles.by === 'distance'}
                      <span class="sort-direction">{sortOptions.battles.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                  <button 
                    class="sort-option" 
                    class:active={sortOptions.battles.by === 'status'}
                    onclick={() => setSortOption('battles', 'status')}
                  >
                    <span>Status</span>
                    {#if sortOptions.battles.by === 'status'}
                      <span class="sort-direction">{sortOptions.battles.asc ? '↑' : '↓'}</span>
                    {/if}
                  </button>
                </div>
              </div>
              <button class="collapse-button" aria-label="Toggle battles section">
                {collapsedSections.battles ? '▼' : '▲'}
              </button>
            </div>
          </div>
          
          <div class="section-content {collapsedSections.battles ? 'collapsed' : 'expanded'}">
            {#each sortedBattles as battle (battle.id)}
              <div 
                class="entity battle"
                class:is-here={battle.distance === 0}
                class:at-target={isAtTarget(battle.x, battle.y)}
                onclick={event => handleEntityAction(battle.x, battle.y, event)}
                onkeydown={event => handleEntityAction(battle.x, battle.y, event)}
                tabindex="0"
                role="button"
              >
                <div class="entity-battle-icon">⚔️</div>
                <div class="entity-info">
                  <div class="entity-name">
                    Battle ({battle.x}, {battle.y})
                    <span class="entity-coords"></span>
                  </div>
                  
                  <div class="battle-sides">
                    <div class="battle-side side1" class:winning-side={battle?.side1?.power > battle?.side2?.power}>
                      <div class="side-name">{battle?.side1?.name || 'Attackers'}</div>
                      <div class="side-units">
                        {#if battle?.side1?.groups}
                          <div class="unit-count">
                            {#if Object.keys(battle.side1.groups).length > 0}
                              Groups: {Object.keys(battle.side1.groups).length}
                              
                              <!-- Show units detail if available -->
                              {#if battle.side1.units || Object.values(battle.side1.groups).some(g => g.units)}
                                ({Object.values(battle.side1.groups).reduce((count, g) => count + (g.units ? Object.keys(g.units).length : 0), 0)} units)
                              {/if}
                              
                              {#if battle.side1.casualties > 0}
                                <span class="casualties-tag">
                                  -{battle.side1.casualties}
                                </span>
                              {/if}
                            {/if}
                          </div>
                          
                          <!-- Add detailed groups display -->
                          <div class="battle-groups-details">
                            {#each Object.entries(battle.side1.groups) as [groupId, group]}
                              <div class="battle-group">
                                <div class="group-info">
                                  <span class="group-race">{_fmt(group.race || 'unknown')}</span>
                                  <span class="group-type">{_fmt(group.type || 'group')}</span>
                                </div>
                                
                                {#if group.units && Object.keys(group.units).length > 0}
                                  <div class="battle-units">
                                    {#each Object.entries(group.units) as [unitId, unit]}
                                      <div class="battle-unit">
                                        <span class="unit-name">{unit.displayName || unitId.slice(-4)}</span>
                                        {#if unit.race}
                                          <span class="unit-race">{_fmt(unit.race)}</span>
                                        {/if}
                                        {#if unit.type && unit.type !== 'player'}
                                          <span class="unit-type">{_fmt(unit.type)}</span>
                                        {/if}
                                      </div>
                                    {/each}
                                  </div>
                                {/if}
                              </div>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    </div>
                    <div class="battle-vs">vs</div>
                    <div class="battle-side side2" class:winning-side={battle?.side2?.power > battle?.side1?.power}>
                      <div class="side-name">{battle?.side2?.name || 'Defenders'}</div>
                      <div class="side-units">
                        {#if battle?.side2?.groups}
                          <div class="unit-count">
                            {#if Object.keys(battle.side2.groups).length > 0}
                              Groups: {Object.keys(battle.side2.groups).length}
                              
                              <!-- Show units detail if available -->
                              {#if battle.side2.units || Object.values(battle.side2.groups).some(g => g.units)}
                                ({Object.values(battle.side2.groups).reduce((count, g) => count + (g.units ? Object.keys(g.units).length : 0), 0)} units)
                              {/if}
                              
                              {#if battle.side2.casualties > 0}
                                <span class="casualties-tag">
                                  -{battle.side2.casualties}
                                </span>
                              {/if}
                            {/if}
                          </div>
                          
                          <!-- Add detailed groups display for side 2 -->
                          <div class="battle-groups-details">
                            {#each Object.entries(battle.side2.groups) as [groupId, group]}
                              <div class="battle-group">
                                <div class="group-info">
                                  <span class="group-race">{_fmt(group.race || 'unknown')}</span>
                                  <span class="group-type">{_fmt(group.type || 'group')}</span>
                                </div>
                                
                                {#if group.units && Object.keys(group.units).length > 0}
                                  <div class="battle-units">
                                    {#each Object.entries(group.units) as [unitId, unit]}
                                      <div class="battle-unit">
                                        <span class="unit-name">{unit.displayName || unitId.slice(-4)}</span>
                                        {#if unit.race}
                                          <span class="unit-race">{_fmt(unit.race)}</span>
                                        {/if}
                                        {#if unit.type && unit.type !== 'player'}
                                          <span class="unit-type">{_fmt(unit.type)}</span>
                                        {/if}
                                      </div>
                                    {/each}
                                  </div>
                                {/if}
                              </div>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    </div>
                  </div>
                  
                  <div class="entity-details">
                    <div class="battle-status">
                      {#if battle.tickCount > 0}
                        <span class="battle-status-tag">Active</span>
                      {:else}
                        <span class="battle-status-tag new">New</span>
                      {/if}
                    </div>
                    <div class="entity-distance">{formatDistance(battle.distance)}</div>
                  </div>
                  
                  <div class="battle-timer">
                    • Tick: {battle.tickCount || 0}
                  </div>
                  
                  <!-- Battle progress bar -->
                  <div class="battle-progress">
                    <div class="progress-bar">
                      <div class="progress-fill side1" 
                        style="width: {battle.side1?.power && (battle.side1.power + battle.side2?.power) > 0 ? 
                          (battle.side1.power / (battle.side1.power + battle.side2?.power) * 100) : 50}%">
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
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
</section>

<style>
  .entities-wrapper {
    position: absolute;
    bottom: 0.5em;
    left: 0.5em;
    z-index: 998; 
    transition: opacity 0.2s ease, z-index 0s;
    font-size: 1.4em;
    font-family: var(--font-body);
    max-width: 95%;
    outline: none; 
  }

  
  .entities-wrapper.active {
    z-index: 1001; 
  }

  .entities-wrapper.closing {
    pointer-events: none;
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
    max-width: 28em;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideInFromBottom 0.8s ease-out forwards;
    transform-origin: bottom left;
  }
  
  
  .entities-wrapper.closing .entities-panel {
    animation: slideOutToBottom 0.8s ease-in forwards;
  }
  
  @keyframes slideInFromBottom {
    0% {
      transform: translateY(100%);
      opacity: 0;
    }
    100% {
      transform: translateY(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOutToBottom {
    0% {
      transform: translateY(0);
      opacity: 1;
    }
    100% {
      transform: translateY(100%);
      opacity: 0;
    }
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
    position: relative;
  }

  
  .is-here {
    background-color: rgba(64, 158, 255, 0.1);
    border-color: rgba(64, 158, 255, 0.3);
    position: relative;
  }
  
  
  .is-here .entity-distance {
    color: rgba(64, 158, 255, 0.9);
    font-weight: 500;
    font-size: 0.9em;
  }

  
  .at-target.is-here .entity-distance {
    color: rgba(64, 158, 255, 1.0);
    font-weight: 600;
  }

  .entity-distance {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.5);
    margin-left: auto;
    white-space: nowrap;
    display: flex;
    align-items: center;
  }
  
  
  .is-here .entity-distance::first-letter {
    font-size: 1.8em;
    line-height: 0;
    margin-right: 0.1em;
    vertical-align: middle;
    color: rgba(64, 158, 255, 1.0);
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
    z-index: 1100;
    transform: translateZ(0);
    will-change: transform;
    pointer-events: none;
    max-height: 100vh;
    overflow: hidden;
  }

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
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    width: 1.2em;
    height: 1.2em;
    font-size: 0.7em;
    font-weight: bold;
    margin-left: 0.4em;
    line-height: 1;
    background: rgba(0, 0, 0, 0.2);
    color: white;
    border: 1px solid rgba(0, 0, 0, 0.1);
    box-shadow: 0 0 0.15em rgba(255, 255, 255, 0.2);
  }

  
  .filter-count-structures {
    background: rgba(0, 0, 0, 0.9);
    box-shadow: 0 0 0.15em rgba(0, 0, 0, 0.6);
    color: rgba(255, 255, 255, 0.9); 
  }
  
  .filter-count-groups {
    background: rgba(255, 100, 100, 0.9);
    box-shadow: 0 0 0.15em rgba(255, 100, 100, 0.6);
  }
  
  .filter-count-players {
    background: rgba(100, 100, 255, 0.9);
    box-shadow: 0 0 0.15em rgba(100, 100, 255, 0.6);
  }
  
  .filter-count-items {
    background: rgba(255, 215, 0, 0.9);
    box-shadow: 0 0 0.15em rgba(255, 215, 0, 0.6);
  }
  
  .filter-count-battles {
    background: rgba(139, 0, 0, 0.8);
    box-shadow: 0 0 0.15em rgba(139, 0, 0, 0.6);
  }

  .filter-tab.active .filter-count {
    background: rgba(255, 255, 255, 0.9);
    color: rgba(0, 0, 0, 0.8);
    box-shadow: 0 0 0.2em rgba(0, 0, 0, 0.2);
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
    border-radius: 0.3em;
    overflow: hidden;
    max-height: unset;
  }

  .section-content.expanded {
    max-height: 13em;
    overflow: auto;
    padding: 0;
    transition: max-height 0.3s ease-in, padding 0.3s ease, opacity 0.2s ease 0.1s;
    opacity: 1;
  }

  .section-content.collapsed {
    max-height: 0;
    padding-top: 0;
    padding-bottom: 0;
    opacity: 0;
    overflow: hidden;
    transition: max-height 0.3s ease-out, padding 0.3s ease;
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

  .entity-icon {
    margin-right: 0.7em;
    margin-top: 0.1em;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .entity-structure-icon {
    margin-right: 0.7em;
    margin-top: 0.1em;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
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

  
  :global(.race-icon-overview) {
    width: 1.4em;
    height: 1.4em;
    opacity: 0.85;
    fill: rgba(0, 0, 0, 0.7);
  }
  
  
  :global(.race-icon-overview.fairy-icon path) {
    fill: rgba(138, 43, 226, 0.8);
  }
  
  :global(.race-icon-overview.goblin-icon path) {
    fill: rgba(0, 128, 0, 0.8);
  }

  
  :global(.overview-structure-icon) {
    opacity: 0.9;
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.7));
  }
  
  :global(.overview-spawn-icon) {
    filter: drop-shadow(0 0 3px rgba(0, 255, 255, 0.8));
    opacity: 1;
  }

  
  .entity.battle {
    background-color: rgba(139, 0, 0, 0.05);
    border: 1px solid rgba(139, 0, 0, 0.2);
  }

  .entity-battle-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.4em;
    height: 1.4em;
    margin-right: 0.7em;
    margin-top: 0.1em;
    font-size: 1.2em;
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
  
  .section-controls {
    display: flex;
    align-items: center;
    gap: 0.5em;
    margin-left: auto;
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

  .tab-sort-controls {
    display: flex;
    justify-content: center; 
    margin-bottom: 0.5em;
    padding: 0.3em 0;
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

  
  .battle-winner {
    color: #ff9800;
    font-weight: bold;
    margin-left: 0.5em;
  }
  
  .battle-sides {
    display: flex;
    flex-direction: row;
    gap: 0.3em;
    font-size: 0.85em;
    margin-top: 0.4em;
    align-items: center;
  }
  
  .battle-side {
    flex: 1;
    padding: 0.3em 0.5em;
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
  
  .side-name {
    font-weight: 500;
    font-size: 0.95em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .side-units {
    font-size: 0.9em;
    margin-top: 0.1em;
  }
  
  .battle-vs {
    font-weight: bold;
    font-size: 0.9em;
    display: flex;
    align-items: center;
    color: rgba(0, 0, 0, 0.6);
  }

  .winning-side {
    box-shadow: 0 0 0 1px rgba(255, 215, 0, 0.5);
    background-color: rgba(255, 215, 0, 0.07);
  }
  
  .battle-timer {
    font-family: var(--font-mono, monospace);
    font-size: 0.8em;
    color: rgba(0, 0, 0, 0.6);
    margin-top: 0.3em;
  }

  .battle-progress {
    margin-top: 0.4em;
    width: 100%;
  }
  
  .progress-bar {
    height: 0.4em;
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 0.25em;
    overflow: hidden;
    margin-bottom: 0.2em;
  }
  
  .progress-fill {
    height: 100%;
    transition: width 1s ease;
  }
  
  .progress-fill.side1 {
    background-color: rgba(0, 0, 255, 0.5);
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
  
  .battle-status-tag {
    display: inline-block;
    font-size: 0.85em;
    padding: 0.2em 0.4em;
    border-radius: 0.2em;
    background-color: rgba(255, 140, 0, 0.15);
    border: 1px solid rgba(255, 140, 0, 0.3);
    color: #d06000;
    font-weight: 500;
  }
  
  .battle-status-tag.new {
    background-color: rgba(76, 175, 80, 0.15);
    border: 1px solid rgba(76, 175, 80, 0.3);
    color: #2e7d32;
  }

  
  .unit-count {
    color: rgba(0, 0, 0, 0.7);
    font-weight: 500;
  }
  
  .item-count {
    color: #2d8659;
    font-weight: 500;
  }

  
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
  }
  
  .group-race, .group-type {
    font-size: 0.85em;
    padding: 0.1em 0.3em;
    border-radius: 0.2em;
    background-color: rgba(0, 0, 0, 0.05);
    color: rgba(0, 0, 0, 0.7);
  }
  
  .battle-units {
    margin-left: 0.5em;
    margin-top: 0.1em;
  }
  
  .battle-unit {
    display: flex;
    gap: 0.3em;
    align-items: center;
    margin-bottom: 0.1em;
  }
  
  .unit-name {
    font-weight: 500;
  }
  
  .unit-race, .unit-type {
    font-size: 0.8em;
    color: rgba(0, 0, 0, 0.6);
    background-color: rgba(0, 0, 0, 0.03);
    padding: 0.05em 0.2em;
    border-radius: 0.15em;
  }

  /* Add styles for units list */
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

  .group-power {
    font-weight: 500;
    color: #d32f2f;
    margin-left: 0.3em;
    font-size: 0.9em;
  }
</style>
