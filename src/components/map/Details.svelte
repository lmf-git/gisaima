<script>
  import { fade, fly, slide } from 'svelte/transition'; // Still import for section toggles
  import { cubicOut, elasticOut } from 'svelte/easing';
  import { targetStore, coordinates } from '../../lib/stores/map';
  import { game, currentPlayer, calculateNextTickTime, formatTimeUntilNextTick, timeUntilNextTick } from '../../lib/stores/game';
  import { onMount, onDestroy } from 'svelte';
  // Import the functions instance from firebase.js
  import { functions } from '../../lib/firebase/firebase.js';
  // Import httpsCallable
  import { httpsCallable } from 'firebase/functions';

  // Import race icon components
  import Human from '../../components/icons/Human.svelte';
  import Elf from '../../components/icons/Elf.svelte';
  import Dwarf from '../../components/icons/Dwarf.svelte';
  import Goblin from '../../components/icons/Goblin.svelte';
  import Fairy from '../../components/icons/Fairy.svelte';
  import Structure from '../../components/icons/Structure.svelte';
  import Torch from '../../components/icons/Torch.svelte';
  import Close from '../icons/Close.svelte';

  // Props with defaults using Svelte 5 $props() rune
  const { 
    x = 0, 
    y = 0, 
    terrain = 'Unknown', 
    onClose = () => {},
    onShowModal = () => {} // Replace onAction with onShowModal for clarity
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

  // Add state to track collapsed sections (add battles)
  let collapsedSections = $state({
    terrain: false,
    structure: false,
    players: false,
    groups: false,
    items: false,
    battles: false  // Add battles section
  });

  // Add state to track sorting options
  let sortOptions = $state({
    structures: { by: 'type', asc: true },
    players: { by: 'name', asc: true },
    groups: { by: 'status', asc: true },
    items: { by: 'name', asc: true },
    battles: { by: 'id', asc: true }  // Add battles sort options
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
        default:
          valueA = a;
          valueB = b;
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
  const sortedPlayers = $derived(currentTile.players ? sortEntities(currentTile.players, 'players') : []);
  const sortedGroups = $derived(currentTile.groups ? sortEntities(currentTile.groups, 'groups') : []);
  const sortedItems = $derived(currentTile.items ? sortEntities(currentTile.items, 'items') : []);

  // Use battles directly from currentTile, falling back to extracting from groups if needed
  const tileBattles = $derived(() => {
    if (!currentTile) return [];
    
    // First check if we have direct battle references
    if (currentTile.battles && currentTile.battles.length > 0) {
      return currentTile.battles;
    }
    
    // Fallback to extracting from groups
    if (!currentTile.groups) return [];
    
    const battlingGroups = currentTile.groups.filter(g => g.inBattle && g.battleId);
    if (battlingGroups.length === 0) return [];
    
    // Create a map of unique battles
    const battlesMap = new Map();
    
    battlingGroups.forEach(group => {
      if (!battlesMap.has(group.battleId)) {
        // Create initial battle info
        battlesMap.set(group.battleId, {
          id: group.battleId,
          sides: {
            1: { groups: [], power: 0 },
            2: { groups: [], power: 0 }
          }
        });
      }
      
      // Add group to appropriate side
      const side = group.battleSide || 1;
      const battleInfo = battlesMap.get(group.battleId);
      
      battleInfo.sides[side].groups.push(group);
      battleInfo.sides[side].power += (group.unitCount || 1);
    });
    
    return Array.from(battlesMap.values());
  });

  // Create sorted battles list
  const sortedBattles = $derived(sortEntities(tileBattles, 'battles'));

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

  // Helper function to safely check if a group has units of a specific type
  function hasUnitType(group, type, checkNotType = false) {
    if (!group || !group.units) return false;
    
    if (Array.isArray(group.units)) {
      return checkNotType 
        ? group.units.some(unit => unit.type !== type)
        : group.units.some(unit => unit.type === type);
    } 
    
    // If units is an object
    return checkNotType 
      ? Object.values(group.units).some(unit => unit.type !== type)
      : Object.values(group.units).some(unit => unit.type === type);
  }
  
  // Helper function to check if a group has a specific player
  function hasPlayerUnit(group, playerId) {
    if (!group || !group.units) return false;
    
    if (Array.isArray(group.units)) {
      return group.units.some(unit => 
        (unit.id === playerId || unit.uid === playerId) && unit.type === 'player'
      );
    } 
    
    // If units is an object
    return Object.values(group.units).some(unit => 
      (unit.id === playerId || unit.uid === playerId) && unit.type === 'player'
    );
  }

  // Function to count units in a group handling both array and object formats
  function countUnits(group) {
    if (!group || !group.units) return 0;
    
    if (group.unitCount !== undefined) return group.unitCount;
    
    if (Array.isArray(group.units)) {
      return group.units.length;
    }
    
    return Object.keys(group.units).length;
  }

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
        hasPlayerUnit(group, playerId)
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
      hasUnitType(group, 'player', true) // Check for any non-player units
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
    
    // Check for movement and gathering (if player has idle groups)
    if (hasGroupWithStatus(currentTile, playerId, 'idle')) {
      availableActions.push({
        id: 'move',
        label: 'Move',
        icon: '➡️',
        description: 'Move your group to another location'
      });
      
      // Add gather action for any idle group - no item check needed
      availableActions.push({
        id: 'gather',
        label: 'Gather',
        icon: '🧺',
        description: 'Gather resources from this area'
      });
    }
    
    // Check for demobilization (player groups can demobilize at structures)
    if (currentTile.structure && currentTile.groups && 
        hasGroupWithStatus(currentTile, playerId, 'idle')) {
      availableActions.push({
        id: 'demobilize',
        label: 'Demobilize',
        icon: '🏠',
        description: 'Disband your group at this structure'
      });
    }
    
    // Check for attack opportunity (player groups can attack enemy groups)
    const hasIdlePlayerGroups = hasGroupWithStatus(currentTile, playerId, 'idle');
    const hasEnemyGroups = currentTile.groups && 
                          currentTile.groups.some(g => g.owner !== playerId && !g.inBattle);
                          
    if (hasIdlePlayerGroups && hasEnemyGroups) {
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
    const canJoinBattle = hasIdlePlayerGroups && hasBattles;
    
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

  // Direct Firebase function calls
  async function executeAction(actionId, tile) {
    // Initialize error variable so it's available outside the catch block
    let actionError = null;
    
    try {
      switch(actionId) {
        case 'mobilize':
        case 'move':
        case 'attack':
        case 'joinBattle':
        case 'demobilize':
          // For modal-based actions, use the onShowModal callback
          onShowModal({ type: actionId, data: tile });
          return; // Early return - no need to close the dialog here
        
        case 'inspect':
          // For structure inspection
          onShowModal({ type: actionId, data: tile });
          return; // Early return - no need to close the dialog here
          
        case 'explore':
          try {
            // Call explore function using the imported functions instance and httpsCallable
            const exploreFn = httpsCallable(functions, 'exploreLocation');
            const result = await exploreFn({ 
              x: tile.x, 
              y: tile.y,
              worldId: $game.currentWorld
            });
            console.log('Explore result:', result.data);
          } catch (error) {
            actionError = error; // Store error for later check
            console.error('Error exploring location:', error);
            // Check for specific auth error code
            if (error.code === 'unauthenticated') {
              alert('Error exploring: You are not logged in.');
            } else {
              alert(`Error exploring: ${error.message || 'Unknown error'}`);
            }
          }
          break;
          
        case 'gather':
          try {
            // Find an idle group owned by the current player
            const groupToGather = tile.groups?.find(g => 
              g.owner === $currentPlayer?.uid && 
              g.status === 'idle'
            );
            
            if (!groupToGather) {
              alert('No idle group available for gathering');
              return;
            }
            
            // Call gather function using the imported functions instance and httpsCallable
            const gatherFn = httpsCallable(functions, 'startGathering');
            const gatherResult = await gatherFn({
              groupId: groupToGather.id,
              locationX: tile.x, // Using locationX instead of x to match cloud function
              locationY: tile.y, // Using locationY instead of y to match cloud function
              worldId: $game.currentWorld
            });
            console.log('Gather result:', gatherResult.data);
          } catch (error) {
            actionError = error; // Store error for later check
            console.error('Error gathering resources:', error);
             // Check for specific auth error code
            if (error.code === 'unauthenticated') {
              alert('Error gathering: You are not logged in.');
            } else {
              alert(`Error gathering: ${error.message || 'Unknown error'}`);
            }
          }
          break;
          
        default:
          console.log(`Unhandled action: ${actionId}`);
      }
    } catch (error) {
      actionError = error; // Store error for later check
      console.error(`Error executing action ${actionId}:`, error);
       // Check for specific auth error code
      if (error.code === 'unauthenticated') {
        alert(`Error: You are not logged in.`);
      } else {
        alert(`Error: ${error.message || 'Failed to perform action'}`);
      }
    }
    
    // Close the details modal only if the action didn't fail due to auth
    if (!(actionError && actionError.code === 'unauthenticated')) {
      onClose();
    }
  }

  // Handle action selection with improved event handling
  function selectAction(actionId) {
    // No preventDefault needed - we're using button elements with proper onclick
    // Execute the action directly for simple actions, or delegate complex ones to parent
    executeAction(actionId, currentTile);
  }

  // Add keyboard event handler for action buttons
  function handleActionKeydown(action, event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      executeAction(action.id, currentTile);
    }
  }

  // Add state to track animation status
  let mounted = $state(false);
  let closing = $state(false);

  onMount(() => {
    // Short timeout to ensure DOM is ready before animation
    setTimeout(() => {
      mounted = true;
    }, 10);
  });
  
  // Function to safely close the modal with proper event handling
  function handleClose(event) {
    // No preventDefault needed - it can interfere with normal click behavior
    // First set closing flag to trigger exit animation
    closing = true;
    
    // Then wait for animation to complete before calling onClose
    setTimeout(() => {
      onClose();
    }, 300); // Match this with the transition duration
  }

  // Handle keyboard events for accessibility
  function handleEscapeKey(event) {
    if (event.key === 'Escape') {
      handleClose(event);
    }
  }

  // Function to get entity icon type
  function getEntityIconType(entity) {
    if (!entity.race && !entity.faction) return null;
    
    const race = entity.race?.toLowerCase() || 
                getFactionRace(entity.faction?.toLowerCase());
                
    return race || null;
  }

  // Function to handle key events for the wrapper to match click handling
  function handleWrapperKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); // Prevent page scrolling on space
      handleClose();
    }
  }

  // Helper function to get the display name for a battle
  function getBattleDisplayName(battleId) {
    if (!battleId) return 'Unknown Battle';
    const idParts = battleId.split('_');
    return `Battle ${idParts[idParts.length - 1]}`;
  }
</script>

{#if mounted}
  <div 
    class="details-wrapper" 
    class:mounted
    class:closing
    role="presentation"
  >
    <button 
      class="modal-backdrop"
      aria-label="Close details"
      onclick={handleClose}
    ></button>
    
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="details-panel"
      class:mounted
      class:closing
      role="dialog"
      aria-modal="true"
      aria-labelledby="details-title"
      tabindex="-1"
      onkeydown={handleEscapeKey}
    >
      <header class="details-header">
        <h3 id="details-title" class="title">Tile Details</h3>
        <div class="coords">{formatCoords(x, y)}</div>
        <button class="close-button" onclick={handleClose} aria-label="Close">
          <Close size="1.8em" extraClass="close-icon-light" />
        </button>
      </header>
      
      <div class="details-content">
        <div class="section terrain-section">
          <button 
            class="section-header" 
            onclick={() => toggleSection('terrain')}
            aria-expanded={!collapsedSections.terrain}
            type="button"
          >
            <h4 class="section-title">Terrain</h4>
            <span class="collapse-button" aria-hidden="true">
              {collapsedSections.terrain ? '▼' : '▲'}
            </span>
          </button>
          
          {#if !collapsedSections.terrain}
            <div class="section-content">
              <div class="terrain-info">
                <div class="terrain-name">{_fmt(currentTile?.biome?.name || terrain)}</div>
                {#if currentTile?.terrain?.rarity && currentTile.terrain.rarity !== 'common'}
                  <div class="terrain-rarity {currentTile.terrain.rarity}">
                    {_fmt(currentTile.terrain.rarity)}
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
        
        {#if currentTile?.structure}
          <div class="section structure-section">
            <button 
              class="section-header" 
              onclick={() => toggleSection('structure')}
              aria-expanded={!collapsedSections.structure}
              type="button"
            >
              <h4 class="section-title">Structure</h4>
              <span class="collapse-button" aria-hidden="true">
                {collapsedSections.structure ? '▼' : '▲'}
              </span>
            </button>
            
            {#if !collapsedSections.structure}
              <div class="section-content">
                <div class="entity structure {isOwnedByCurrentPlayer(currentTile.structure) ? 'current-player-owned' : ''}">
                  <div class="entity-structure-icon">
                    {#if currentTile.structure.type === 'spawn'}
                      <Torch size="1.4em" extraClass="structure-type-icon" />
                    {:else}
                      <Structure size="1.4em" extraClass="structure-type-icon {currentTile.structure.type}-icon" />
                    {/if}
                  </div>
                  <div class="entity-info">
                    <div class="entity-name">
                      {currentTile.structure.name || _fmt(currentTile.structure.type) || "Unknown"}
                      {#if isOwnedByCurrentPlayer(currentTile.structure)}
                        <span class="your-entity-badge">Yours</span>
                      {/if}
                    </div>
                    <div class="entity-details">
                      {#if currentTile.structure.type}
                        <div class="entity-type">{_fmt(currentTile.structure.type)}</div>
                      {/if}
                      {#if currentTile.structure.description}
                        <div class="entity-description">{currentTile.structure.description}</div>
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        {/if}
        
        {#if currentTile?.players?.length > 0}
          <div class="section players-section">
            <button 
              class="section-header" 
              onclick={() => toggleSection('players')}
              aria-expanded={!collapsedSections.players}
              type="button"
            >
              <h4 class="section-title">Players ({currentTile.players.length})</h4>
              <span class="collapse-button" aria-hidden="true">
                {collapsedSections.players ? '▼' : '▲'}
              </span>
            </button>
            
            {#if !collapsedSections.players}
              <div class="section-content">
                {#each sortedPlayers as player}
                  <div class="entity player {player.id === $currentPlayer?.uid ? 'current' : ''} {isOwnedByCurrentPlayer(player) ? 'current-player-owned' : ''}">
                    <div class="entity-race-icon">
                      {#if player.race}
                        {#if player.race?.toLowerCase() === 'human'}
                          <Human extraClass="race-icon-entity" />
                        {:else if player.race?.toLowerCase() === 'elf'}
                          <Elf extraClass="race-icon-entity" />
                        {:else if player.race?.toLowerCase() === 'dwarf'}
                          <Dwarf extraClass="race-icon-entity" />
                        {:else if player.race?.toLowerCase() === 'goblin'}
                          <Goblin extraClass="race-icon-entity" />
                        {:else if player.race?.toLowerCase() === 'fairy'}
                          <Fairy extraClass="race-icon-entity" />
                        {/if}
                      {/if}
                    </div>
                    <div class="entity-info">
                      <div class="entity-name">
                        {player.displayName || 'Player'}
                        {#if isOwnedByCurrentPlayer(player)}
                          <span class="your-entity-badge">You</span>
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
        
        {#if currentTile?.groups?.length > 0}
          <div class="section groups-section">
            <button 
              class="section-header" 
              onclick={() => toggleSection('groups')}
              aria-expanded={!collapsedSections.groups}
              type="button"
            >
              <h4 class="section-title">Groups ({currentTile.groups.length})</h4>
              <span class="collapse-button" aria-hidden="true">
                {collapsedSections.groups ? '▼' : '▲'}
              </span>
            </button>
            
            {#if !collapsedSections.groups}
              <div class="section-content">
                {#each sortedGroups as group}
                  {#if group}
                    <div class="entity {group.status || 'idle'} {isOwnedByCurrentPlayer(group) ? 'current-player-owned' : ''}">
                      <div class="entity-race-icon">
                        {#if getEntityIconType(group)}
                          {#if getEntityIconType(group) === 'human'}
                            <Human class="race-icon-entity" />
                          {:else if getEntityIconType(group) === 'elf'}
                            <Elf class="race-icon-entity" />
                          {:else if getEntityIconType(group) === 'dwarf'}
                            <Dwarf class="race-icon-entity" />
                          {:else if getEntityIconType(group) === 'goblin'}
                            <Goblin class="race-icon-entity" />
                          {:else if getEntityIconType(group) === 'fairy'}
                            <Fairy class="race-icon-entity" />
                          {/if}
                        {/if}
                      </div>
                      <div class="entity-info">
                        <div class="entity-name">
                          {group.name || `Group ${group.id.slice(-4)}`}
                          {#if isOwnedByCurrentPlayer(group)}
                            <span class="your-entity-badge">Yours</span>
                          {/if}
                        </div>
                        
                        <div class="entity-details">
                          <span class="unit-count">
                            {countUnits(group)} units
                            {#if getGroupItemCount(group) > 0}
                              • <span class="item-count">{getGroupItemCount(group)} items</span>
                            {/if}
                          </span>
                          
                          <span class="status {getStatusClass(group.status)}" class:pending-tick={isPendingTick(
                            group.status === 'moving' 
                              ? group.nextMoveTime 
                              : (group.status === 'gathering' || group.status === 'starting_to_gather' 
                                  ? group.gatheringUntil 
                                  : group.readyAt)
                          )}>
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
                        </div>
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>
        {/if}
        
        {#if tileBattles.length > 0}
          <div class="section battles-section">
            <button 
              class="section-header" 
              onclick={() => toggleSection('battles')}
              aria-expanded={!collapsedSections.battles}
              type="button"
            >
              <h4 class="section-title">Battles ({tileBattles.length})</h4>
              <span class="collapse-button" aria-hidden="true">
                {collapsedSections.battles ? '▼' : '▲'}
              </span>
            </button>
            
            {#if !collapsedSections.battles}
              <div class="section-content">
                {#each sortedBattles as battle}
                  <div class="entity battle">
                    <div class="entity-battle-icon">⚔️</div>
                    <div class="entity-info">
                      <div class="entity-name">
                        {getBattleDisplayName(battle.id)}
                      </div>
                      
                      <div class="battle-sides">
                        <div class="battle-side side1">
                          <div class="side-header">Side 1</div>
                          <div class="side-stats">
                            {battle.sides[1].groups.length} groups ({battle.sides[1].power} strength)
                          </div>
                        </div>
                        
                        <div class="battle-side side2">
                          <div class="side-header">Side 2</div>
                          <div class="side-stats">
                            {battle.sides[2].groups.length} groups ({battle.sides[2].power} strength)
                          </div>
                        </div>
                      </div>
                      
                      {#if isPlayerAvailableOnTile(currentTile, $currentPlayer?.uid) && hasIdlePlayerGroups}
                        <div class="battle-actions">
                          <button 
                            class="join-battle-btn"
                            onclick={() => executeAction('joinBattle', currentTile)}
                          >
                            Join Battle
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
        
        {#if currentTile?.items?.length > 0}
          <div class="section items-section">
            <button 
              class="section-header" 
              onclick={() => toggleSection('items')}
              aria-expanded={!collapsedSections.items}
              type="button"
            >
              <h4 class="section-title">Items ({currentTile.items.length})</h4>
              <span class="collapse-button" aria-hidden="true">
                {collapsedSections.items ? '▼' : '▲'}
              </span>
            </button>
            
            {#if !collapsedSections.items}
              <div class="section-content">
                {#each sortedItems as item}
                  <div class="entity item {getRarityClass(item.rarity)}">
                    <div class="item-icon {item.type}"></div>
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
        
        {#if actions.length > 0}
          <div class="section actions-section">
            <h4 class="section-title">Available Actions</h4>
            <div class="actions-list">
              {#each actions as action}
                <button 
                  class="action-button" 
                  onclick={() => selectAction(action.id)}
                  onkeydown={(event) => handleActionKeydown(action, event)}
                  aria-label={action.label}
                  type="button"
                >
                  <span class="action-icon">{action.icon}</span>
                  <div class="action-text">
                    <div class="action-label">{action.label}</div>
                    <div class="action-description">{action.description}</div>
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .details-wrapper {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    opacity: 0;
    pointer-events: none;
  }
  
  .details-wrapper.mounted {
    opacity: 1;
    pointer-events: auto;
  }
  
  .details-wrapper.closing {
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
  }

  .modal-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    margin: 0;
    transition: 
      background-color 0.3s ease,
      backdrop-filter 0.3s ease;
  }
  
  .details-wrapper.mounted .modal-backdrop {
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
  }
  
  .details-wrapper.closing .modal-backdrop {
    background-color: rgba(0, 0, 0, 0);
    backdrop-filter: blur(0);
    -webkit-backdrop-filter: blur(0);
    transition: 
      background-color 0.3s ease,
      backdrop-filter 0.3s ease;
  }

  .details-panel {
    background-color: rgba(255, 255, 255, 0.95);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5em;
    box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.3);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(0.5em);
    -webkit-backdrop-filter: blur(0.5em);
    width: 100%;
    max-width: 30em;
    margin: 1em;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform-origin: center;
    font-family: var(--font-body);
    max-height: 90vh;
    transform: translateY(-20px) scale(0.95);
    opacity: 0;
    transition: 
      transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275),
      opacity 0.3s ease;
  }
  
  .details-panel.mounted {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
  
  .details-panel.closing {
    transform: translateY(20px) scale(0.95);
    opacity: 0;
    transition: 
      transform 0.3s cubic-bezier(0.6, -0.28, 0.735, 0.045),
      opacity 0.3s ease;
  }
  
  .details-header {
    display: flex;
    align-items: center;
    padding: 0.8em 1em;
    background-color: rgba(0, 0, 0, 0.08);
    border-bottom: 1px solid rgba(0, 0, 0, 0.15);
    justify-content: space-between;
  }
  
  .title {
    flex: 1;
    margin: 0;
    font-size: 1.2em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.9);
    font-family: var(--font-heading);
  }
  
  .coords {
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.7);
    margin-right: 1em;
    font-weight: 500;
    font-family: var(--font-mono, monospace);
  }
  
  .close-button {
    background: transparent;
    border: none;
    color: var(--color-text);
    padding: 0.3em;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .close-button:hover {
    opacity: 0.8;
  }
  
  .close-button:focus-visible {
    outline: 2px solid var(--color-bright-accent);
    outline-offset: 2px;
    border-radius: 0.25em;
  }
  
  .details-content {
    padding: 1em;
    max-height: calc(90vh - 4em);
    overflow-y: auto;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.7em 1em;
    margin: -0.7em -1em 0.5em -1em;
    background-color: rgba(0, 0, 0, 0.03);
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    user-select: none;
    font-family: inherit;
    color: inherit;
    font-size: inherit;
  }
  
  .section-header:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }
  
  .section-header:focus {
    outline: 2px solid rgba(66, 133, 244, 0.6);
  }
  
  .collapse-button {
    color: rgba(0, 0, 0, 0.5);
    font-size: 0.8em;
    padding: 0.2em 0.5em;
    transition: all 0.2s ease;
  }
  
  .section {
    margin-bottom: 1.2em;
  }
  
  .section:last-child {
    margin-bottom: 0;
  }
  
  .section-title {
    margin: 0;
    font-size: 0.9em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.7);
    font-family: var(--font-heading);
  }

  /* Action buttons styling */
  .actions-list {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    margin-top: 0.5em;
  }
  
  .action-button {
    display: flex;
    align-items: center;
    padding: 0.8em;
    margin-bottom: 0.5em;
    background: rgba(0, 0, 0, 0.25);
    border-radius: 0.3em;
    cursor: pointer;
    border: none;
    width: 100%;
    font-family: inherit;
    font-size: inherit;
    color: inherit;
    text-align: left;
    transition: all 0.2s ease;
  }
  
  .action-button:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.4);
    transform: translateY(-2px);
  }
  
  .action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .action-button:focus-visible {
    outline: 2px solid var(--color-bright-accent);
    outline-offset: 2px;
  }
  
  .action-icon {
    font-size: 1.2em;
    margin-right: 0.8em;
  }
  
  .action-text {
    flex: 1;
  }
  
  .action-label {
    font-weight: 500;
    margin-bottom: 0.2em;
  }
  
  .action-description {
    font-size: 0.8em;
    color: rgba(0, 0, 0, 0.6);
  }

  /* Add missing entity styles from MapEntities */
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
  
  .entity-race {
    font-size: 0.85em;
    font-style: italic;
    color: rgba(0, 0, 0, 0.6);
  }
  
  .entity-type {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.6);
  }
  
  .entity-structure-icon {
    margin-right: 0.7em;
    margin-top: 0.1em;
  }
  
  :global(.structure-type-icon) {
    width: 1.4em;
    height: 1.4em;
    fill: #a0d6e7;
  }
  
  .your-entity-badge {
    display: inline-block;
    background: var(--color-bright-accent);
    color: var(--color-dark-navy);
    font-size: 0.7em;
    padding: 0.1em 0.4em;
    border-radius: 0.3em;
    margin-left: 0.5em;
    font-weight: bold;
    vertical-align: middle;
  }
  
  .current-player-owned {
    border-color: var(--color-bright-accent);
    background-color: rgba(100, 255, 218, 0.1);
    position: relative;
  }
  
  .current-player-owned::after {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background-color: var(--color-bright-accent);
  }
  
  /* Status styles */
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
  }
  
  .status.moving {
    background: rgba(0, 128, 0, 0.15);
    border: 1px solid rgba(0, 128, 0, 0.3);
    color: #008000;
  }
  
  .status.idle {
    background: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.6);
  }
  
  .unit-count {
    color: rgba(0, 0, 0, 0.6);
  }
  
  .item-count {
    color: #2d8659;
    font-weight: 500;
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
  
  .battle-sides {
    display: flex;
    flex-direction: column;
    gap: 0.6em;
    margin: 0.5em 0;
    width: 100%;
  }
  
  .battle-side {
    padding: 0.5em 0.7em;
    border-radius: 0.3em;
  }
  
  .battle-side.side1 {
    background-color: rgba(0, 0, 255, 0.07);
    border: 1px solid rgba(0, 0, 255, 0.15);
  }
  
  .battle-side.side2 {
    background-color: rgba(139, 0, 0, 0.07);
    border: 1px solid rgba(139, 0, 0, 0.15);
  }
  
  .side-header {
    font-weight: 600;
    font-size: 0.9em;
    margin-bottom: 0.2em;
  }
  
  .side-stats {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .battle-actions {
    margin-top: 0.8em;
  }
  
  .join-battle-btn {
    background-color: rgba(0, 0, 0, 0.7);
    color: white;
    border: none;
    padding: 0.5em 1em;
    border-radius: 0.3em;
    font-size: 0.9em;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .join-battle-btn:hover {
    background-color: rgba(0, 0, 0, 0.85);
  }

  /* Replace the existing .pending-tick style with a more subtle one */
  .pending-tick {
    position: relative;
    animation: pulse 1s infinite alternate !important;
  }

  .pending-tick::after {
    content: '↻';
    margin-left: 0.3em;
    font-weight: bold;
  }

  @keyframes pulse {
    from { opacity: 0.7; }
    to { opacity: 1; }
  }

  @media (max-width: 480px) {
    .details-panel {
      margin: 0.5em;
      max-width: calc(100% - 1em);
      max-height: calc(100% - 1em);
    }
    
    .details-content {
      padding: 0.8em;
    }
    
    .section-header {
      padding: 0.6em 0.8em;
      margin: -0.6em -0.8em 0.5em -0.8em;
    }
  }
</style>