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
        onclick={handleClose} 
        aria-label="Close map entities panel"
        onkeydown={(e) => e.key === 'Escape' && handleClose()}
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
              {#each sortedGroups as group ('group:' + group.id)}
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
                    {#if group.race}
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
                    </div>
                    
                    <div class="entity-details">
                      <span class="unit-count">
                        {(group.units ? group.units.length : 0)} units
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
                        {#if group.status === 'starting_to_gather'}
                          Preparing to gather
                        {:else if group.status === 'mobilizing' || group.status === 'demobilising'}
                          {_fmt(group.status)} {formatTimeRemaining(group.readyAt, group.status)}
                        {:else if group.status === 'moving'}
                          {_fmt(group.status)} 
                          {#if !isPendingTick(group.nextMoveTime)}
                            ({formatTimeRemaining(calculateMoveCompletionTime(group))})
                          {/if}
                        {:else if group.status === 'gathering'}
                          {_fmt(group.status)} 
                          {#if !isPendingTick(group.gatheringUntil)}
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
                  class="entity item {getRarityClass(item.rarity)}" 
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
                              {#if battle.side1.units}
                                 ({Object.keys(battle.side1.units).length} units)
                              {/if}
                              
                              {#if battle.side1.casualties > 0}
                                <span class="casualties-tag">
                                  -{battle.side1.casualties}
                                </span>
                              {/if}
                            {/if}
                          </div>
                        {/if}
                      </div>-- Add detailed groups display -->
                    </div><div class="battle-groups-details">
                    <div class="battle-vs">vs</div>attle.side1.groups) as [groupId, group]}
                    <div class="battle-side side2" class:winning-side={battle?.side2?.power > battle?.side1?.power}>
                      <div class="side-name">{battle?.side2?.name || 'Defenders'}</div>
                      <div class="side-units">"group-type">{_fmt(group.type || 'unknown')}</span>
                        {#if battle?.side2?.groups}
                          <div class="unit-count">roup-race">{_fmt(group.race)}</span>
                            {#if Object.keys(battle.side2.groups).length > 0}
                              Groups: {Object.keys(battle.side2.groups).length}
                                
                              <!-- Show units detail if available -->.units).length > 0}
                              {#if battle.side2.units}nits">
                                 ({Object.keys(battle.side2.units).length} units), unit]}
                              {/if}   <div class="battle-unit">
                                        <span class="unit-name">{unit.displayName || unitId.slice(-4)}</span>
                              {#if battle.side2.casualties > 0}
                                <span class="casualties-tag">ace">{_fmt(unit.race)}</span>
                                  -{battle.side2.casualties}
                                </span> {#if unit.type && unit.type !== 'player'}
                              {/if}       <span class="unit-type">{_fmt(unit.type)}</span>
                            {/if}       {/if}
                          </div>      </div>
                        {/if}       {/each}
                      </div>      </div>
                    </div>      {/if}
                  </div>      </div>
                            {/each}
                  <div class="entity-details">
                    <div class="battle-status">
                      {#if battle.tickCount > 0}
                        <span class="battle-status-tag">Active</span>
                      {:else}s="battle-vs">vs</div>
                        <span class="battle-status-tag new">New</span>{battle?.side2?.power > battle?.side1?.power}>
                      {/if}class="side-name">{battle?.side2?.name || 'Defenders'}</div>
                    </div> class="side-units">
                    <div class="entity-distance">{formatDistance(battle.distance)}</div>
                  </div>  <div class="unit-count">
                            {#if Object.keys(battle.side2.groups).length > 0}
                  <div class="battle-timer">t.keys(battle.side2.groups).length}
                    Started {Math.floor((Date.now() - (battle.createdAt || Date.now())) / 60000) || 0} minutes ago
                    • Tick: {battle.tickCount || 0}l if available -->
                  </div>      {#if battle.side2.units}
                                 ({Object.keys(battle.side2.units).length} units)
                  <!-- Battle progress bar -->
                  <div class="battle-progress">
                    <div class="progress-bar">2.casualties > 0}
                      <div class="progress-fill side1" -tag">
                        style="width: {battle.side1?.power && (battle.side1.power + battle.side2?.power) > 0 ? 
                          (battle.side1.power / (battle.side1.power + battle.side2?.power) * 100) : 50}%">
                      </div>  {/if}
                    </div>  {/if}
                  </div>  </div>
                </div>    
              </div>      <!-- Add detailed groups display for side 2 -->
            {/each}       <div class="battle-groups-details">
          </div>            {#each Object.entries(battle.side2.groups) as [groupId, group]}
        </div>                <div class="battle-group">
      {/if}                     <div class="group-info">
                                  <span class="group-type">{_fmt(group.type || 'unknown')}</span>
      {#if !hasContent(activeFilter)}f group.race}
        <div class="empty-state">   <span class="group-race">{_fmt(group.race)}</span>
          {#if activeFilter === 'all'}}
            No entities visible on map
          {:else}               
            No {activeFilter} visible on mapnits && Object.keys(group.units).length > 0}
          {/if}                   <div class="battle-units">
        </div>                      {#each Object.entries(group.units) as [unitId, unit]}
      {/if}                           <div class="battle-unit">
    </div>                              <span class="unit-name">{unit.displayName || unitId.slice(-4)}</span>
  </div>                                {#if unit.race}
</section>                                <span class="unit-race">{_fmt(unit.race)}</span>
                                        {/if}
<style>                                 {#if unit.type && unit.type !== 'player'}
  .entities-wrapper {                     <span class="unit-type">{_fmt(unit.type)}</span>
    position: absolute;                 {/if}
    bottom: 0.5em;                    </div>
    left: 0.5em;                    {/each}
    z-index: 998;                 </div>
    transition: opacity 0.2s ease, z-index 0s;
    font-size: 1.4em;         </div>
    font-family: var(--font-body);}
    max-width: 95%;       </div>
    outline: none;      {/if}
  }                   </div>
                    </div>
                  </div>
  .entities-wrapper.active {
    z-index: 1001; div class="entity-details">
  }                 <div class="battle-status">
                      {#if battle.tickCount > 0}
  .entities-wrapper.closing { class="battle-status-tag">Active</span>
    pointer-events: none;lse}
  }                     <span class="battle-status-tag new">New</span>
                      {/if}
  .entities-panel { </div>
    background-color: rgba(255, 255, 255, 0.85);>{formatDistance(battle.distance)}</div>
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.3em;
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7); (battle.createdAt || Date.now())) / 60000) || 0} minutes ago
    backdrop-filter: blur(0.5em);le.tickCount || 0}
    -webkit-backdrop-filter: blur(0.5em);
    width: 100%;  
    max-width: 28em;-- Battle progress bar -->
    display: flex;<div class="battle-progress">
    flex-direction: column;ass="progress-bar">
    overflow: hidden; <div class="progress-fill side1" 
    animation: slideInFromBottom 0.8s ease-out forwards;er && (battle.side1.power + battle.side2?.power) > 0 ? 
    transform-origin: bottom left;side1.power / (battle.side1.power + battle.side2?.power) * 100) : 50}%">
  }                   </div>
                    </div>
                  </div>
  .entities-wrapper.closing .entities-panel {
    animation: slideOutToBottom 0.8s ease-in forwards;
  }         {/each}
          </div>
  @keyframes slideInFromBottom {
    0% {if}
      transform: translateY(100%);
      opacity: 0;ntent(activeFilter)}
    }   <div class="empty-state">
    100% {{#if activeFilter === 'all'}
      transform: translateY(0); on map
      opacity: 1;
    }       No {activeFilter} visible on map
  }       {/if}
        </div>
  @keyframes slideOutToBottom {
    0% {v>
      transform: translateY(0);
      opacity: 1;
    }
    100% {
      transform: translateY(100%);
      opacity: 0;olute;
    }ottom: 0.5em;
  } left: 0.5em;
    z-index: 998; 
  .subtitle {n: opacity 0.2s ease, z-index 0s;
    font-size: 0.7em;
    font-weight: normal;ont-body);
    color: rgba(0, 0, 0, 0.5);
    margin-left: 0.6em;
  }

  .entity-coords {
    font-size: 0.7em;ctive {
    color: rgba(0, 0, 0, 0.5);
    margin-left: 0.6em;
    font-weight: normal;
  }entities-wrapper.closing {
    pointer-events: none;
  .at-target {
    background-color: rgba(64, 158, 255, 0.1);
    border-color: rgba(64, 158, 255, 0.3);
    position: relative;gba(255, 255, 255, 0.85);
  } border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.3em;
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
  .is-here {dow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    background-color: rgba(64, 158, 255, 0.1);
    border-color: rgba(64, 158, 255, 0.3);
    position: relative;
  } max-width: 28em;
    display: flex;
    flex-direction: column;
  .is-here .entity-distance {
    color: rgba(64, 158, 255, 0.9);8s ease-out forwards;
    font-weight: 500; bottom left;
    font-size: 0.9em;
  }
  
  .entities-wrapper.closing .entities-panel {
  .at-target.is-here .entity-distance {se-in forwards;
    color: rgba(64, 158, 255, 1.0);
    font-weight: 600;
  }keyframes slideInFromBottom {
    0% {
  .entity-distance {nslateY(100%);
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.5);
    margin-left: auto;
    white-space: nowrap;teY(0);
    display: flex;
    align-items: center;
  }
  
  @keyframes slideOutToBottom {
  .is-here .entity-distance::first-letter {
    font-size: 1.8em;slateY(0);
    line-height: 0;
    margin-right: 0.1em;
    vertical-align: middle;
    color: rgba(64, 158, 255, 1.0);
  }   opacity: 0;
    }
  .map-entities {
    position: fixed;
    top: 0; {
    right: 0;: 0.7em;
    padding: .5em;ormal;
    width: 100%;0, 0, 0, 0.5);
    max-width: 25em;em;
    display: flex;
    flex-direction: column;
    gap: .5em;ds {
    z-index: 1100;em;
    transform: translateZ(0);;
    will-change: transform;
    pointer-events: none;
    max-height: 100vh;
    overflow: hidden;
  }at-target {
    background-color: rgba(64, 158, 255, 0.1);
  .filter-tabs {: rgba(64, 158, 255, 0.3);
    display: flex;tive;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    background-color: rgba(0, 0, 0, 0.03);
    padding: 0 0.3em;
    width: 100%;
    overflow-x: auto; rgba(64, 158, 255, 0.1);
  } border-color: rgba(64, 158, 255, 0.3);
    position: relative;
  .filter-tab {
    padding: 0.6em 0.8em;
    font-family: var(--font-heading);
    font-size: 0.8em;stance {
    background: none;58, 255, 0.9);
    border: none;500;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    color: rgba(0, 0, 0, 0.5);
    transition: all 0.2s ease;
    flex: 1;.is-here .entity-distance {
    text-align: center;, 255, 1.0);
    display: flex;00;
    justify-content: center;
    align-items: center;
    position: relative;
    white-space: nowrap;
  } color: rgba(0, 0, 0, 0.5);
    margin-left: auto;
  .filter-tab:hover:not(:disabled) {
    background-color: rgba(0, 0, 0, 0.03);
    color: rgba(0, 0, 0, 0.8);
  }
  
  .filter-tab.active {
    border-bottom: 2px solid #4285f4;tter {
    color: rgba(0, 0, 0, 0.9);
    font-weight: 500;
  } margin-right: 0.1em;
    vertical-align: middle;
  .filter-tab:disabled { 255, 1.0);
    opacity: 0.4;
    cursor: not-allowed;
  }map-entities {
    position: fixed;
  .filter-tab.has-content:not(.active) {
    color: rgba(0, 0, 0, 0.7);
  } padding: .5em;
    width: 100%;
  .filter-count {em;
    display: flex;
    align-items: center;mn;
    justify-content: center;
    border-radius: 50%;
    width: 1.2em;anslateZ(0);
    height: 1.2em;ransform;
    font-size: 0.7em;one;
    font-weight: bold;
    margin-left: 0.4em;
    line-height: 1;
    background: rgba(0, 0, 0, 0.2);
    color: white;
    border: 1px solid rgba(0, 0, 0, 0.1);
    box-shadow: 0 0 0.15em rgba(255, 255, 255, 0.2);
  } background-color: rgba(0, 0, 0, 0.03);
    padding: 0 0.3em;
    width: 100%;
  .filter-count-structures {
    background: rgba(0, 0, 0, 0.9);
    box-shadow: 0 0 0.15em rgba(0, 0, 0, 0.6);
    color: rgba(255, 255, 255, 0.9); 
  } padding: 0.6em 0.8em;
    font-family: var(--font-heading);
  .filter-count-groups {
    background: rgba(255, 100, 100, 0.9);
    box-shadow: 0 0 0.15em rgba(255, 100, 100, 0.6);
  } border-bottom: 2px solid transparent;
    cursor: pointer;
  .filter-count-players {0.5);
    background: rgba(100, 100, 255, 0.9);
    box-shadow: 0 0 0.15em rgba(100, 100, 255, 0.6);
  } text-align: center;
    display: flex;
  .filter-count-items {nter;
    background: rgba(255, 215, 0, 0.9);
    box-shadow: 0 0 0.15em rgba(255, 215, 0, 0.6);
  } white-space: nowrap;
  }
  .filter-count-battles {
    background: rgba(139, 0, 0, 0.8);
    box-shadow: 0 0 0.15em rgba(139, 0, 0, 0.6);
  } color: rgba(0, 0, 0, 0.8);
  }
  .filter-tab.active .filter-count {
    background: rgba(255, 255, 255, 0.9);
    color: rgba(0, 0, 0, 0.8);4285f4;
    box-shadow: 0 0 0.2em rgba(0, 0, 0, 0.2);
  } font-weight: 500;
  }
  .title {
    margin: 0;disabled {
    padding: 0.8em 1em;
    font-size: 1.1em;ed;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.8);
    background-color: rgba(0, 0, 0, 0.05);
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    font-family: var(--font-heading);
    display: flex;
    align-items: center;
    justify-content: space-between;
  } align-items: center;
    justify-content: center;
  .close-button {: 50%;
    background: none;
    border: none;;
    cursor: pointer;;
    padding: 0.4em;  ;
    display: flex;.4em;
    align-items: center;
    justify-content: center;, 0.2);
    border-radius: 50%;
    margin-left: auto;rgba(0, 0, 0, 0.1);
    transition: background-color 0.2s;55, 255, 0.2);
    color: rgba(0, 0, 0, 0.6);
  }
  
  .close-button:hover {res {
    background-color: rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.9);a(0, 0, 0, 0.6);
  } color: rgba(255, 255, 255, 0.9); 
  }
  .entities-content {
    padding: 0.8em;ups {
    max-height: 70vh;255, 100, 100, 0.9);
    overflow-y: auto;.15em rgba(255, 100, 100, 0.6);
  }
  
  .entities-section {rs {
    margin-bottom: 1.2em; 100, 255, 0.9);
    border-radius: 0.3em;m rgba(100, 100, 255, 0.6);
    overflow: hidden;
    max-height: unset;
  }filter-count-items {
    background: rgba(255, 215, 0, 0.9);
  .section-content.expanded {ba(255, 215, 0, 0.6);
    max-height: 13em;
    overflow: auto;
    padding: 0;-battles {
    transition: max-height 0.3s ease-in, padding 0.3s ease, opacity 0.2s ease 0.1s;
    opacity: 1; 0 0 0.15em rgba(139, 0, 0, 0.6);
  }

  .section-content.collapsed {ount {
    max-height: 0;ba(255, 255, 255, 0.9);
    padding-top: 0;0, 0, 0.8);
    padding-bottom: 0;2em rgba(0, 0, 0, 0.2);
    opacity: 0;
    overflow: hidden;
    transition: max-height 0.3s ease-out, padding 0.3s ease;
  } margin: 0;
    padding: 0.8em 1em;
  .entity {ze: 1.1em;
    display: flex;00;
    align-items: flex-start;);
    margin-bottom: 0.6em;a(0, 0, 0, 0.05);
    padding: 0.5em 0.7em;lid rgba(0, 0, 0, 0.1);
    border-radius: 0.3em;nt-heading);
    background-color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(0, 0, 0, 0.1);
    cursor: pointer; space-between;
    transition: background-color 0.2s ease;
  }
  .close-button {
  .entity:hover {one;
    background-color: rgba(255, 255, 255, 0.8);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  } padding: 0.4em;  
    display: flex;
  .entity:focus {center;
    outline: 2px solid rgba(66, 133, 244, 0.6);
    box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.3);
  } margin-left: auto;
    transition: background-color 0.2s;
  .entity.player.current {.6);
    background-color: rgba(66, 133, 244, 0.05);
    border-color: rgba(66, 133, 244, 0.3);
  }close-button:hover {
    background-color: rgba(0, 0, 0, 0.1);
  .entity-icon {0, 0, 0, 0.9);
    margin-right: 0.7em;
    margin-top: 0.1em;
    flex-shrink: 0; {
    display: flex;;
    align-items: center;
    justify-content: center;
  }

  .entity-structure-icon {
    margin-right: 0.7em;;
    margin-top: 0.1em;em;
    flex-shrink: 0;n;
    display: flex;set;
    align-items: center;
    justify-content: center;
  }section-content.expanded {
    max-height: 13em;
  .entity-info {to;
    flex: 1; 0;
  } transition: max-height 0.3s ease-in, padding 0.3s ease, opacity 0.2s ease 0.1s;
    opacity: 1;
  .entity-name {
    font-weight: 500;
    color: rgba(0, 0, 0, 0.85);
    line-height: 1.2;
    margin-bottom: 0.2em;
  } padding-bottom: 0;
    opacity: 0;
  .entity-details {n;
    display: flex;x-height 0.3s ease-out, padding 0.3s ease;
    flex-wrap: wrap;
    gap: 0.6em;
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.7);
    width: 100%; flex-start;
    justify-content: space-between;
  } padding: 0.5em 0.7em;
    border-radius: 0.3em;
    background-color: rgba(255, 255, 255, 0.5);
  :global(.race-icon-overview) { 0, 0.1);
    width: 1.4em;er;
    height: 1.4em;ckground-color 0.2s ease;
    opacity: 0.85;
    fill: rgba(0, 0, 0, 0.7);
  }entity:hover {
    background-color: rgba(255, 255, 255, 0.8);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  :global(.race-icon-overview.fairy-icon path) {
    fill: rgba(138, 43, 226, 0.8);
  }entity:focus {
    outline: 2px solid rgba(66, 133, 244, 0.6);
  :global(.race-icon-overview.goblin-icon path) {;
    fill: rgba(0, 128, 0, 0.8);
  }
  .entity.player.current {
    background-color: rgba(66, 133, 244, 0.05);
  :global(.overview-structure-icon) {0.3);
    opacity: 0.9;
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.7));
  }entity-icon {
    margin-right: 0.7em;
  :global(.overview-spawn-icon) {
    filter: drop-shadow(0 0 3px rgba(0, 255, 255, 0.8)) !important;
    opacity: 1 !important;
  } align-items: center;
    justify-content: center;
  }
  .entity.battle {
    background-color: rgba(139, 0, 0, 0.05);
    border: 1px solid rgba(139, 0, 0, 0.2);
  } margin-top: 0.1em;
    flex-shrink: 0;
  .entity-battle-icon {
    display: flex;enter;
    align-items: center;ter;
    justify-content: center;
    width: 1.4em;
    height: 1.4em;
    margin-right: 0.7em;
    margin-top: 0.1em;
    font-size: 1.2em;
  }entity-name {
    font-weight: 500;
    color: rgba(0, 0, 0, 0.85);
  .entity-status-badge {
    display: inline-block;
    font-size: 0.8em;
    font-weight: 500;
    padding: 0.1em 0.5em;
    border-radius: 0.3em;
    white-space: nowrap;
    text-transform: capitalize;
  } font-size: 0.85em;
    color: rgba(0, 0, 0, 0.7);
  .entity-status-badge.idle {
    background: rgba(128, 128, 128, 0.15);
    border: 1px solid rgba(128, 128, 128, 0.3);
    color: rgba(0, 0, 0, 0.7);
  }
  :global(.race-icon-overview) {
  .entity-status-badge.moving {
    background: rgba(0, 128, 0, 0.15);
    border: 1px solid rgba(0, 128, 0, 0.3);
    color: #006400;, 0, 0.7);
  }
  
  .entity-status-badge.mobilizing {
    background: rgba(255, 140, 0, 0.15); path) {
    border: 1px solid rgba(255, 140, 0, 0.3);
    color: #d06000;
  }
  :global(.race-icon-overview.goblin-icon path) {
  .entity-status-badge.demobilising {
    background: rgba(138, 43, 226, 0.15);
    border: 1px solid rgba(138, 43, 226, 0.3);
    color: #6a1b9a;
  }global(.overview-structure-icon) {
    opacity: 0.9;
  .entity-status-badge.gathering, ba(255, 255, 255, 0.7));
  .entity-status-badge.starting_to_gather {
    background: rgba(138, 43, 226, 0.15);
    border: 1px solid rgba(138, 43, 226, 0.3);
    color: #8a2be2;adow(0 0 3px rgba(0, 255, 255, 0.8)) !important;
  } opacity: 1 !important;
  }
  .entity-status-badge.fighting {
    background: rgba(220, 20, 60, 0.15);
    border: 1px solid rgba(220, 20, 60, 0.3);
    color: #c62828;r: rgba(139, 0, 0, 0.05);
  } border: 1px solid rgba(139, 0, 0, 0.2);
  }
  .entity-status-badge.active {
    background: rgba(255, 0, 0, 0.15);
    border: 1px solid rgba(255, 0, 0, 0.3);
    color: #d32f2f;nter;
  } justify-content: center;
    width: 1.4em;
  .entity-status-badge.resolved {
    background: rgba(0, 128, 0, 0.15);
    border: 1px solid rgba(0, 128, 0, 0.3);
    color: #2e7d32;m;
  }
  
  .entity-status-badge.pending-tick {
    position: relative;{
    animation: pulse 1s infinite alternate;
  } font-size: 0.8em;
    font-weight: 500;
  .entity-status-badge.pending-tick::after {
    content: '↻';: 0.3em;
    margin-left: 0.3em;;
    font-weight: bold;pitalize;
  }
  
  .entity-status-badge.idle {
  .section-header {a(128, 128, 128, 0.15);
    display: flex;lid rgba(128, 128, 128, 0.3);
    justify-content: space-between;
    align-items: center;
    padding: 0.5em 1em;  
    cursor: pointer;ge.moving {
    user-select: none;, 128, 0, 0.15);
    position: relative;gba(0, 128, 0, 0.3);
    width: 100%;00;
    background-color: rgba(0, 0, 0, 0.03);
    border-radius: 0.3em 0.3em 0 0;
    transition: background-color 0.2s ease;
  } background: rgba(255, 140, 0, 0.15);
    border: 1px solid rgba(255, 140, 0, 0.3);
  .section-header:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }
  .entity-status-badge.demobilising {
  .section-controls {138, 43, 226, 0.15);
    display: flex;lid rgba(138, 43, 226, 0.3);
    align-items: center;
    gap: 0.5em;
    margin-left: auto;
  }entity-status-badge.gathering, 
  .entity-status-badge.starting_to_gather {
  .section-title {ba(138, 43, 226, 0.15);
    margin: 0;x solid rgba(138, 43, 226, 0.3);
    font-size: 0.9em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.6);
    text-transform: uppercase;g {
    letter-spacing: 0.05em;0, 60, 0.15);
    display: flex;lid rgba(220, 20, 60, 0.3);
    align-items: center;
    gap: 0.3em;
  }
  .entity-status-badge.active {
  .collapse-button {(255, 0, 0, 0.15);
    background: none; rgba(255, 0, 0, 0.3);
    border: none;f;
    color: rgba(0, 0, 0, 0.5);
    font-size: 0.8em;
    cursor: pointer;ge.resolved {
    padding: 0.2em 0.5em;28, 0, 0.15);
    transition: all 0.2s ease;128, 0, 0.3);
    display: flex;;
    align-items: center;
    justify-content: center;
    min-width: 1.5em;e.pending-tick {
    min-height: 1.5em;;
  } animation: pulse 1s infinite alternate;
  }
  .collapse-button:hover {
    color: rgba(0, 0, 0, 0.8);-tick::after {
    background-color: rgba(0, 0, 0, 0.05);
    border-radius: 50%;
  } font-weight: bold;
  }
  
  .sort-controls {
    display: flex;{
    gap: 0.2em;ex;
    margin-right: 0.5em;ce-between;
  } align-items: center;
    padding: 0.5em 1em;  
  .sort-option {ter;
    background: none;;
    border: none;ative;
    font-size: 0.7em;
    color: rgba(0, 0, 0, 0.5);0, 0, 0.03);
    padding: 0.2em 0.4em;0.3em 0 0;
    border-radius: 0.3em;d-color 0.2s ease;
    cursor: pointer;
    display: flex;
    align-items: center;{
    gap: 0.2em;color: rgba(0, 0, 0, 0.05);
    transition: all 0.2s ease;
  }
  .section-controls {
  .sort-option:hover {
    background-color: rgba(0, 0, 0, 0.05);
    color: rgba(0, 0, 0, 0.8);
  } margin-left: auto;
  }
  .sort-option.active {
    background-color: rgba(66, 133, 244, 0.1);
    color: rgba(66, 133, 244, 0.9);
  } font-size: 0.9em;
    font-weight: 600;
  .sort-direction {0, 0, 0.6);
    font-size: 0.9em;ppercase;
    font-weight: bold;05em;
  } display: flex;
    align-items: center;
  .tab-sort-controls {
    display: flex;
    justify-content: center; 
    margin-bottom: 0.5em;
    padding: 0.3em 0;
  } border: none;
    color: rgba(0, 0, 0, 0.5);
    font-size: 0.8em;
  .entity-badge {er;
    font-size: 0.7em;5em;
    padding: 0.2em 0.4em;ease;
    border-radius: 0.3em;
    font-weight: 500;er;
  } justify-content: center;
    min-width: 1.5em;
  .owner-badge {1.5em;
    background-color: rgba(76, 175, 80, 0.2);
    color: #2e7d32;
    border: 1px solid rgba(76, 175, 80, 0.4);
  } color: rgba(0, 0, 0, 0.8);
    background-color: rgba(0, 0, 0, 0.05);
  .current-player-owned {
    border-color: var(--color-bright-accent, #64ffda);
    background-color: rgba(100, 255, 218, 0.05);
    position: relative;
  }sort-controls {
    display: flex;
  .current-player-owned::after {
    content: '';: 0.5em;
    position: absolute;
    left: 0;
    top: 0;ion {
    bottom: 0;: none;
    width: 3px;e;
    background-color: var(--color-bright-accent, #64ffda);
  } color: rgba(0, 0, 0, 0.5);
    padding: 0.2em 0.4em;
    border-radius: 0.3em;
  .battle-winner {r;
    color: #ff9800;
    font-weight: bold;r;
    margin-left: 0.5em;
  } transition: all 0.2s ease;
  }
  .battle-sides {
    display: flex;er {
    flex-direction: row;ba(0, 0, 0, 0.05);
    gap: 0.3em;(0, 0, 0, 0.8);
    font-size: 0.85em;
    margin-top: 0.4em;
    align-items: center;
  } background-color: rgba(66, 133, 244, 0.1);
    color: rgba(66, 133, 244, 0.9);
  .battle-side {
    flex: 1;
    padding: 0.3em 0.5em;
    border-radius: 0.3em;
  } font-weight: bold;
  }
  .battle-side.side1 {
    background-color: rgba(0, 0, 255, 0.07);
    border: 1px solid rgba(0, 0, 255, 0.15);
    color: #00008B;: center; 
  } margin-bottom: 0.5em;
    padding: 0.3em 0;
  .battle-side.side2 {
    background-color: rgba(139, 0, 0, 0.07);
    border: 1px solid rgba(139, 0, 0, 0.15);
    color: #8B0000;
  } font-size: 0.7em;
    padding: 0.2em 0.4em;
  .side-name {ius: 0.3em;
    font-weight: 500;
    font-size: 0.95em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;6, 175, 80, 0.2);
  } color: #2e7d32;
    border: 1px solid rgba(76, 175, 80, 0.4);
  .side-units {
    font-size: 0.9em;
    margin-top: 0.1em;d {
  } border-color: var(--color-bright-accent, #64ffda);
    background-color: rgba(100, 255, 218, 0.05);
  .battle-vs {relative;
    font-weight: bold;
    font-size: 0.9em;
    display: flex;owned::after {
    align-items: center;
    color: rgba(0, 0, 0, 0.6);
  } left: 0;
    top: 0;
  .winning-side {
    box-shadow: 0 0 0 1px rgba(255, 215, 0, 0.5);
    background-color: rgba(255, 215, 0, 0.07);t, #64ffda);
  }
  
  .battle-timer {
    font-family: var(--font-mono, monospace);
    font-size: 0.8em;
    color: rgba(0, 0, 0, 0.6);
    margin-top: 0.3em;;
  }
  
  .battle-progress {
    margin-top: 0.4em;
    width: 100%;on: row;
  } gap: 0.3em;
    font-size: 0.85em;
  .progress-bar {.4em;
    height: 0.4em;enter;
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 0.25em;
    overflow: hidden;
    margin-bottom: 0.2em;
  } padding: 0.3em 0.5em;
    border-radius: 0.3em;
  .progress-fill {
    height: 100%;
    transition: width 1s ease;
  } background-color: rgba(0, 0, 255, 0.07);
    border: 1px solid rgba(0, 0, 255, 0.15);
  .progress-fill.side1 {
    background-color: rgba(0, 0, 255, 0.5);
  }
  .battle-side.side2 {
  .casualties-tag {r: rgba(139, 0, 0, 0.07);
    display: inline-block;(139, 0, 0, 0.15);
    font-size: 0.85em;
    padding: 0.1em 0.3em;
    border-radius: 0.2em;
    margin-left: 0.2em;
    background-color: rgba(220, 20, 60, 0.1);
    border: 1px solid rgba(220, 20, 60, 0.2);
    color: #c62828;wrap;
  } overflow: hidden;
    text-overflow: ellipsis;
  .battle-status-tag {
    display: inline-block;
    font-size: 0.85em;
    padding: 0.2em 0.4em;
    border-radius: 0.2em;
    background-color: rgba(255, 140, 0, 0.15);
    border: 1px solid rgba(255, 140, 0, 0.3);
    color: #d06000;
    font-weight: 500;;
  } font-size: 0.9em;
    display: flex;
  .battle-status-tag.new {
    background-color: rgba(76, 175, 80, 0.15);
    border: 1px solid rgba(76, 175, 80, 0.3);
    color: #2e7d32;
  }winning-side {
    box-shadow: 0 0 0 1px rgba(255, 215, 0, 0.5);
    background-color: rgba(255, 215, 0, 0.07);
  .unit-count {
    color: rgba(0, 0, 0, 0.7);
    font-weight: 500;
  } font-family: var(--font-mono, monospace);
    font-size: 0.8em;
  .item-count {(0, 0, 0, 0.6);
    color: #2d8659;em;
    font-weight: 500;
  }
  .battle-progress {
    margin-top: 0.4em;
  .empty-state {
    padding: 2em;
    text-align: center;
    color: rgba(0, 0, 0, 0.5);
    font-style: italic;
  } background-color: rgba(0, 0, 0, 0.1);
    border-radius: 0.25em;
    overflow: hidden;
  @keyframes pulse {.2em;
    from { opacity: 0.8; }
    to { opacity: 1; }
  }progress-fill {
  ht: 100%;
  /* New styles for battle details */    transition: width 1s ease;









































































</style>  }    border-left-color: rgba(139, 0, 0, 0.1);  .side2 .battle-units {    }    background-color: rgba(139, 0, 0, 0.03);  .side2 .battle-group {    }    border-left-color: rgba(0, 0, 255, 0.1);  .side1 .battle-units {    }    background-color: rgba(0, 0, 255, 0.03);  .side1 .battle-group {    }    border-radius: 0.2em;    padding: 0 0.3em;    background-color: rgba(0, 0, 0, 0.05);    font-size: 0.9em;    opacity: 0.8;  .unit-race, .unit-type {    }    font-weight: 500;  .unit-name {    }    align-items: center;    margin-bottom: 0.1em;    font-size: 0.85em;    gap: 0.3em;    display: flex;  .battle-unit {    }    border-left: 2px solid rgba(0, 0, 0, 0.05);    padding-left: 0.4em;    margin-top: 0.2em;  .battle-units {    }    opacity: 0.8;    font-style: italic;  .group-race {    }    font-weight: 500;  .group-type {    }    font-size: 0.9em;    gap: 0.4em;    display: flex;  .group-info {    }    background-color: rgba(0, 0, 0, 0.04);    border-radius: 0.2em;    margin-bottom: 0.2em;    padding: 0.2em 0.3em;  .battle-group {    }    padding-right: 0.2em;    overflow-y: auto;    max-height: 7em;    font-size: 0.9em;    margin-top: 0.3em;  .battle-groups-details {  }
  
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
</style>
