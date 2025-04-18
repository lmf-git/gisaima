<script>
  import { fade, fly, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { targetStore, coordinates } from '../../lib/stores/map';
  import { game, currentPlayer, calculateNextTickTime, formatTimeUntilNextTick, timeUntilNextTick } from '../../lib/stores/game';
  import { onMount, onDestroy } from 'svelte';
  import { getFunctions, httpsCallable } from "firebase/functions";

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

  // Add state to track collapsed sections
  let collapsedSections = $state({
    terrain: false,
    structure: false,
    players: false,
    groups: false,
    items: false
  });

  // Add state to track sorting options
  let sortOptions = $state({
    structures: { by: 'type', asc: true },
    players: { by: 'name', asc: true },
    groups: { by: 'status', asc: true },
    items: { by: 'name', asc: true }
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

  // Direct Firebase function calls
  async function executeAction(actionId, tile) {
    const functions = getFunctions();
    
    try {
      switch(actionId) {
        case 'mobilize':
          // Open mobilize modal instead of directly calling function
          if (onAction) {
            onAction({ action: actionId, tile });
          }
          break;
          
        case 'move':
          // Open move modal instead of directly calling function
          if (onAction) {
            onAction({ action: actionId, tile });
          }
          break;
          
        case 'attack':
          // Open attack modal instead of directly calling function  
          if (onAction) {
            onAction({ action: actionId, tile });
          }
          break;
          
        case 'joinBattle':
          // Open join battle modal instead of directly calling function
          if (onAction) {
            onAction({ action: actionId, tile });
          }
          break;
          
        case 'demobilize':
          // Open demobilize modal instead of directly calling function
          if (onAction) {
            onAction({ action: actionId, tile });
          }
          break;
          
        case 'inspect':
          // This is UI-only action - delegate to parent component
          if (onAction) {
            onAction({ action: actionId, tile });
          }
          break;
          
        case 'explore':
          // This would directly call the explore function
          const exploreFunction = httpsCallable(functions, 'exploreLocation');
          const result = await exploreFunction({ 
            x: tile.x, 
            y: tile.y,
            worldId: $game.currentWorld
          });
          console.log('Explore result:', result.data);
          break;
          
        case 'gather':
          // This would directly call the gather function
          const gatherFunction = httpsCallable(functions, 'startGathering');
          const gatherResult = await gatherFunction({
            x: tile.x,
            y: tile.y,
            worldId: $game.currentWorld,
            groupId: tile.groups.find(g => g.owner === $currentPlayer?.uid)?.id
          });
          console.log('Gather result:', gatherResult.data);
          break;
          
        default:
          console.log(`Unhandled action: ${actionId}`);
      }
    } catch (error) {
      console.error(`Error executing action ${actionId}:`, error);
      // Could add error handling/display here
    }
    
    // Close the details modal
    onClose();
  }

  // Handle action selection
  function selectAction(actionId, event) {
    // Only call preventDefault if it's a function (it's a DOM event)
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    
    // Execute the action directly for simple actions, or delegate complex ones to parent
    executeAction(actionId, currentTile);
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
        <div 
          class="section-header"
          onclick={() => toggleSection('terrain')}
          role="button"
          tabindex="0"
          aria-expanded={!collapsedSections.terrain}
          onkeydown={(e) => e.key === 'Enter' && toggleSection('terrain')}
        >
          <h4 class="section-title">Terrain</h4>
          <button class="collapse-button" aria-label={collapsedSections.terrain ? "Expand terrain" : "Collapse terrain"}>
            {collapsedSections.terrain ? '▼' : '▲'}
          </button>
        </div>
        
        {#if !collapsedSections.terrain}
          <div class="section-content" transition:slide|local={{ duration: 300 }}>
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
          <div 
            class="section-header"
            onclick={() => toggleSection('structure')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.structure}
            onkeydown={(e) => e.key === 'Enter' && toggleSection('structure')}
          >
            <h4 class="section-title">Structure</h4>
            <button class="collapse-button" aria-label={collapsedSections.structure ? "Expand structure" : "Collapse structure"}>
              {collapsedSections.structure ? '▼' : '▲'}
            </button>
          </div>
          
          {#if !collapsedSections.structure}
            <div class="section-content" transition:slide|local={{ duration: 300 }}>
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
        </div>
      {/if}
      
      {#if currentTile?.players?.length > 0}
        <div class="section players-section">
          <div 
            class="section-header"
            onclick={() => toggleSection('players')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.players}
            onkeydown={(e) => e.key === 'Enter' && toggleSection('players')}
          >
            <h4 class="section-title">Players ({currentTile.players.length})</h4>
            <div class="section-controls">
              {#if !collapsedSections.players}
                <div class="sort-controls">
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
              {#each sortedPlayers as player}
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
        </div>
      {/if}
      
      {#if currentTile?.groups?.length > 0}
        <div class="section groups-section">
          <div 
            class="section-header"
            onclick={() => toggleSection('groups')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.groups}
            onkeydown={(e) => e.key === 'Enter' && toggleSection('groups')}
          >
            <h4 class="section-title">Groups ({currentTile.groups.length})</h4>
            <div class="section-controls">
              {#if !collapsedSections.groups}
                <div class="sort-controls">
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
                  <button 
                    class="sort-option" 
                    class:active={sortOptions.groups.by === 'type'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('groups', 'type'); }}
                    aria-label={`Sort by race ${sortOptions.groups.by === 'type' ? (sortOptions.groups.asc ? 'ascending' : 'descending') : ''}`}
                  >
                    <span>Race</span>
                    {#if sortOptions.groups.by === 'type'}
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
              {#each sortedGroups as group}
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
        </div>
      {/if}
      
      {#if currentTile?.items?.length > 0}
        <div class="section items-section">
          <div 
            class="section-header"
            onclick={() => toggleSection('items')}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.items}
            onkeydown={(e) => e.key === 'Enter' && toggleSection('items')}
          >
            <h4 class="section-title">Items ({currentTile.items.length})</h4>
            <div class="section-controls">
              {#if !collapsedSections.items}
                <div class="sort-controls">
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
                    class:active={sortOptions.items.by === 'type'}
                    onclick={(e) => { e.stopPropagation(); setSortOption('items', 'type'); }}
                    aria-label={`Sort by type ${sortOptions.items.by === 'type' ? (sortOptions.items.asc ? 'ascending' : 'descending') : ''}`}
                  >
                    <span>Type</span>
                    {#if sortOptions.items.by === 'type'}
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
              {#each sortedItems as item}
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
                onclick={(e) => selectAction(action.id, e)}
                aria-label={action.label}
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
    background-color: rgba(0, 0, 0, 0.08);
    border-bottom: 1px solid rgba(0, 0, 0, 0.15);
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
    background: none;
    border: none;
    color: rgba(0, 0, 0, 0.6);
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
    border-radius: 50%;
  }
  
  .close-button:hover {
    color: rgba(0, 0, 0, 0.9);
    background-color: rgba(0, 0, 0, 0.1);
  }
  
  .details-content {
    padding: 1em;
    max-height: calc(90vh - 4em);
    overflow-y: auto;
  }
  
  /* Collapsible section styles */
  .section {
    margin-bottom: 1.5em;
    position: relative;
    border-radius: 0.3em;
    background-color: rgba(255, 255, 255, 0.7);
    border: 1px solid rgba(0, 0, 0, 0.08);
    overflow: hidden;
  }
  
  .section:last-child {
    margin-bottom: 0;
  }
  
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    padding: 0.7em 1em;
    background-color: rgba(0, 0, 0, 0.03);
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    user-select: none;
  }
  
  .section-header:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }
  
  .section-header:focus {
    outline: 2px solid rgba(66, 133, 244, 0.6);
  }
  
  .section-title {
    margin: 0;
    font-size: 1em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.75);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-family: var(--font-heading);
  }
  
  .section-content {
    padding: 0.8em 1em;
    background-color: rgba(255, 255, 255, 0.5);
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
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 0.3em;
    background-color: rgba(255, 255, 255, 0.8);
    transition: all 0.2s;
    cursor: pointer;
    flex-grow: 1;
    max-width: calc(50% - 0.25em);
    font-family: var(--font-body);
    text-align: left;
  }
  
  .action-button:hover {
    background-color: rgba(255, 255, 255, 0.9);
    border-color: rgba(0, 0, 0, 0.25);
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
    color: rgba(0, 0, 0, 0.85);
    margin-bottom: 0.2em;
  }
  
  .action-description {
    font-size: 0.8em;
    color: rgba(0, 0, 0, 0.7);
  }

  .terrain-info {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
  }
  
  .terrain-name {
    font-size: 1.1em;
    font-weight: 500;
    color: rgba(0, 0, 0, 0.85);
  }
  
  .terrain-rarity {
    display: inline-block;
    font-size: 0.8em;
    padding: 0.2em 0.5em;
    border-radius: 0.3em;
    background: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.7);
  }
  
  .entity {
    display: flex;
    align-items: flex-start;
    margin-bottom: 0.6em;
    padding: 0.8em;
    border-radius: 0.3em;
    background-color: rgba(255, 255, 255, 0.75);
    border: 1px solid rgba(0, 0, 0, 0.1);
    transition: background-color 0.2s ease;
  }
  
  .entity:last-child {
    margin-bottom: 0;
  }
  
  .entity:hover {
    background-color: rgba(255, 255, 255, 0.9);
  }
  
  .entity.player.current {
    background-color: rgba(66, 133, 244, 0.08);
    border-color: rgba(66, 133, 244, 0.3);
    position: relative;
  }
  
  .entity.player.current::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background-color: rgba(66, 133, 244, 0.8);
  }
  
  .entity-race-icon {
    margin-right: 0.8em;
    margin-top: 0.2em;
  }
  
  :global(.race-icon-entity) {
    width: 1.4em;
    height: 1.4em;
    fill: rgba(0, 0, 0, 0.8);
  }
  
  .entity-structure-icon {
    margin-right: 0.8em;
    margin-top: 0.1em;
  }
  
  :global(.structure-type-icon) {
    width: 1.4em;
    height: 1.4em;
    fill: #a0d6e7;
  }
  
  :global(.fortress-icon) {
    fill: #ffdf9e !important;
  }
  
  :global(.outpost-icon) {
    fill: #9dc3ff !important;
  }
  
  :global(.watchtower-icon) {
    fill: #b9ff9e !important;
  }
  
  :global(.stronghold-icon) {
    fill: #ff9e9e !important;
  }
  
  :global(.citadel-icon) {
    fill: #e09eff !important;
  }
  
  .entity-info {
    flex: 1;
  }
  
  .entity-name {
    font-weight: 500;
    color: rgba(0, 0, 0, 0.9);
    line-height: 1.3;
    margin-bottom: 0.3em;
    font-size: 1em;
  }
  
  .entity-details {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6em;
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.75);
    width: 100%;
    justify-content: space-between;
  }
  
  .entity-type {
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .entity-race {
    font-size: 0.9em;
    font-style: italic;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .unit-count {
    color: rgba(0, 0, 0, 0.7);
    font-weight: 500;
  }
  
  .item-count {
    color: #2d8659;
    font-weight: 500;
  }
  
  .status {
    display: inline-block;
    font-size: 0.9em;
    padding: 0.2em 0.5em;
    border-radius: 0.3em;
    white-space: nowrap;
    font-weight: 500;
  }
  
  .status.mobilizing {
    background: rgba(255, 165, 0, 0.15);
    border: 1px solid rgba(255, 165, 0, 0.3);
    color: #dd7500;
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
    color: #006400;
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
    color: #226644;
  }
  
  .status.idle {
    background: rgba(0, 0, 0, 0.08);
    border: 1px solid rgba(0, 0, 0, 0.12);
    color: rgba(0, 0, 0, 0.7);
  }
  
  .status.demobilising {
    background: rgba(147, 112, 219, 0.15);
    border: 1px solid rgba(147, 112, 219, 0.3);
    color: #6a1fc8;
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
    padding: 0.2em 0.4em;
    border-radius: 0.2em;
    background-color: rgba(139, 0, 0, 0.1);
    border: 1px solid rgba(139, 0, 0, 0.2);
    color: #8B0000;
    white-space: nowrap;
    margin-left: 0.3em;
  }
  
  .battle-side-1 {
    background-color: rgba(0, 0, 255, 0.1);
    border: 1px solid rgba(0, 0, 255, 0.2);
    color: #00008B;
  }
  
  .battle-side-2 {
    background-color: rgba(139, 0, 0, 0.1);
    border: 1px solid rgba(139, 0, 0, 0.2);
    color: #8B0000;
  }
  
  .pending-tick {
    background: rgba(255, 215, 0, 0.2) !important;
    border-color: rgba(255, 215, 0, 0.5) !important;
    color: #b8860b !important;
    animation: pulseWaiting 1s infinite alternate !important;
  }
  
  .empty-state {
    padding: 2em;
    text-align: center;
    color: rgba(0, 0, 0, 0.6);
    font-style: italic;
  }
  
  /* Item styles */
  .item-icon {
    width: 1.4em;
    height: 1.4em;
    margin-right: 0.8em;
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
  
  .item-type {
    color: rgba(0, 0, 0, 0.7);
    white-space: nowrap;
  }
  
  .item-quantity {
    font-weight: 600;
    color: rgba(0, 0, 0, 0.8);
    margin-left: 0.3em;
  }
  
  .item-description {
    font-size: 0.85em;
    font-style: italic;
    color: rgba(0, 0, 0, 0.7);
    margin-top: 0.4em;
    line-height: 1.3;
  }
  
  .item-rarity {
    display: inline-block;
    font-size: 0.85em;
    padding: 0.2em 0.5em;
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
  
  .entity.item.uncommon {
    border-color: rgba(30, 255, 0, 0.3);
    box-shadow: inset 0 0 0.2em rgba(30, 255, 0, 0.15);
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

  .your-entity-badge {
    display: inline-block;
    background: var(--color-bright-accent, #64ffda);
    color: var(--color-dark-navy, #0a192f);
    font-size: 0.7em;
    padding: 0.1em 0.4em;
    border-radius: 0.3em;
    margin-left: 0.5em;
    font-weight: bold;
    vertical-align: middle;
  }
  
  .current-player-owned {
    border-color: var(--color-bright-accent, #64ffda);
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
    background-color: var(--color-bright-accent, #64ffda);
  }
  
  .countdown {
    font-size: 0.8em;
    margin-left: 0.3em;
    font-family: var(--font-mono, monospace);
    white-space: nowrap;
  }
  
  @media (max-width: 480px) {
    .details-panel {
      max-width: 100%;
      margin: 0.5em;
    }
    
    .entity-details {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.3em;
    }
    
    .action-button {
      max-width: 100%;
    }
    
    .sort-controls {
      display: none;
    }
    
    .sort-controls button {
      padding: 0.3em;
      font-size: 0.65em;
    }
  }
</style>