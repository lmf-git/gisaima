<script>
  import { derived } from 'svelte/store';
  import { 
    map,
    targetStore,
    entities,
    moveTarget
  } from '../../lib/stores/map.js';
  
  // Accept closing prop from parent
  const { closing = false } = $props();
  
  // Keep state for active tab but not visibility
  let activeTab = $state('all'); // 'all', 'structures', 'players', 'groups'
  
  // Constants
  const ANIMATION_DURATION = 800;

  // Calculate distance from target to another point
  function calculateDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  // Format distance for display
  function formatDistance(distance) {
    return distance === 0 ? 'here' : Math.round(distance * 10) / 10;
  }
  
  // Get entity type icon/symbol
  function getEntitySymbol(type) {
    switch(type) {
      case 'structure': return '🏛️';
      case 'structure-spawn': return '🔵';
      case 'structure-watchtower': return '🗼';
      case 'structure-fortress': return '🏰';
      case 'player': return '👤';
      case 'group': return '👥';
      default: return '•';
    }
  }

  // Helper function to get player display name - matches Details.svelte
  function getPlayerDisplayName(player) {
    // For anonymous or guest users
    if (player.isAnonymous || player.guest) {
      return `Guest ${player.id?.substring(0, 4) || 'User'}`;
    }
    
    // For registered users - match the pattern used in game.js
    return player.displayName || 
           player.email?.split('@')[0] || 
           `User ${player.id?.substring(0, 4)}`;
  }

  // Get entity color class
  function getEntityColorClass(entity) {
    if (entity.entityType === 'structure') {
      switch(entity.type) {
        case 'spawn': return 'entity-spawn';
        case 'watchtower': return 'entity-watchtower';
        case 'fortress': return 'entity-fortress';
        default: return 'entity-structure';
      }
    } else if (entity.entityType === 'player') {
      return 'entity-player';
    } else {
      return 'entity-group';
    }
  }

  // Define a derived store for sorted entities
  const sortedEntities = derived(
    [entities, targetStore, map],
    ([$entities, $targetStore, $map]) => {
      if (!$targetStore || !$map.ready) return [];
      
      const allEntities = [];
      const target = { x: $targetStore.x, y: $targetStore.y };
      
      // Process structures
      Object.values($entities.structure).forEach(structure => {
        if (!structure) return;
        const distance = calculateDistance(
          target.x, target.y, 
          structure.x, structure.y
        );
        
        allEntities.push({
          entityType: 'structure',
          entityId: `structure-${structure.x}-${structure.y}`,
          ...structure,
          distance
        });
      });
      
      // Process player entities
      Object.entries($entities.players).forEach(([locationKey, playersList]) => {
        if (!playersList || !playersList.length) return;
        
        const [x, y] = locationKey.split(',').map(Number);
        const distance = calculateDistance(target.x, target.y, x, y);
        
        playersList.forEach(player => {
          allEntities.push({
            entityType: 'player',
            entityId: player.id || `player-${x}-${y}-${playersList.indexOf(player)}`,
            x, y,
            name: player.name || 'Unknown Player',
            distance,
            ...player
          });
        });
      });
      
      // Process groups (enemy units)
      Object.entries($entities.groups).forEach(([locationKey, groupsList]) => {
        if (!groupsList || !groupsList.length) return;
        
        const [x, y] = locationKey.split(',').map(Number);
        const distance = calculateDistance(target.x, target.y, x, y);
        
        groupsList.forEach(group => {
          allEntities.push({
            entityType: 'group',
            entityId: group.id || `group-${x}-${y}-${groupsList.indexOf(group)}`,
            x, y,
            name: group.name || 'Enemy Group',
            size: group.size || '?',
            distance,
            ...group
          });
        });
      });
      
      // Sort all entities by distance
      return allEntities.sort((a, b) => a.distance - b.distance);
    },
    []
  );
  
  // Filter entities based on active tab
  const filteredEntities = derived(
    [sortedEntities],
    ([$sortedEntities]) => {
      if (activeTab === 'all') {
        return $sortedEntities;
      } else {
        return $sortedEntities.filter(entity => {
          if (activeTab === 'structures') return entity.entityType === 'structure';
          if (activeTab === 'players') return entity.entityType === 'player';
          if (activeTab === 'groups') return entity.entityType === 'group';
          return true;
        });
      }
    },
    []
  );

  // Navigate to entity location with keyboard support
  function goToEntity(entity) {
    if (entity && typeof entity.x === 'number' && typeof entity.y === 'number') {
      moveTarget(entity.x, entity.y);
    }
  }

  // Handle keyboard navigation for entity items
  function handleKeyDown(event, entity) {
    // Execute on Enter or Space key
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      goToEntity(entity);
    }
  }

  // Update the tab selection function
  function setActiveTab(tabName) {
    activeTab = tabName;
  }
</script>

<div class="entities-container">
  <div 
    class="entities-panel" 
    class:closing={closing} 
    role="region" 
    aria-label="Map entities list">
    <div class="entities-header">
      <h3>Map Entities</h3>
      <div class="tabs" role="tablist">
        <button 
          role="tab"
          aria-selected={activeTab === 'all'}
          class:active={activeTab === 'all'} 
          onclick={() => setActiveTab('all')}>
          All
        </button>
        <button 
          role="tab"
          aria-selected={activeTab === 'structures'}
          class:active={activeTab === 'structures'} 
          onclick={() => setActiveTab('structures')}>
          Structures
        </button>
        <button 
          role="tab"
          aria-selected={activeTab === 'players'}
          class:active={activeTab === 'players'} 
          onclick={() => setActiveTab('players')}>
          Players
        </button>
        <button 
          role="tab"
          aria-selected={activeTab === 'groups'}
          class:active={activeTab === 'groups'} 
          onclick={() => setActiveTab('groups')}>
          Groups
        </button>
      </div>
    </div>

    <div class="entities-list" role="tabpanel" aria-label={`${activeTab} entities`}>
      {#if $filteredEntities.length > 0}
        {#each $filteredEntities as entity (entity.entityId)}
          <button 
            class="entity-item {getEntityColorClass(entity)}" 
            onclick={() => goToEntity(entity)}
            onkeydown={(e) => handleKeyDown(e, entity)}
            tabindex="0"
            aria-label={`Go to ${entity.entityType} ${entity.name || entity.type || ''} at coordinates ${entity.x},${entity.y}, ${formatDistance(entity.distance)} tiles away`}
          >
            <div class="entity-icon">
              {#if entity.entityType === 'structure'}
                {getEntitySymbol(`structure-${entity.type}`)}
              {:else}
                {getEntitySymbol(entity.entityType)}
              {/if}
            </div>
            <div class="entity-info">
              <div class="entity-name">
                {#if entity.entityType === 'structure'}
                  {entity.type || 'Structure'} 
                {:else if entity.entityType === 'player'}
                  {getPlayerDisplayName(entity)}
                {:else}
                  {entity.name || 'Group'} ({entity.size || '?'})
                {/if}
              </div>
              <div class="entity-location">
                <span class="coords">{entity.x},{entity.y}</span>
                <span class="distance">
                  {formatDistance(entity.distance)} {entity.distance !== 0 ? 'tiles away' : ''}
                </span>
              </div>
            </div>
            <div class="entity-action" aria-hidden="true">→</div>
          </button>
        {/each}
      {:else}
        <div class="entity-empty">
          No {activeTab === 'all' ? 'entities' : activeTab} found
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .entities-container {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 997;
  }

  .entities-panel {
    position: relative;
    width: 20em;
    max-width: calc(100vw - 2em);
    max-height: calc(100vh - 3em);
    margin-top: 2.5em;  /* Position below control buttons */
    background: rgba(35, 35, 45, 0.92);  /* Darker background than Details */
    border: 0.0625em solid rgba(100, 120, 230, 0.4);  /* Bluish border */
    border-radius: 0.3em;
    box-shadow: 0 0.2em 1em rgba(20, 20, 40, 0.5);  /* Deeper shadow */
    animation: slideInFromTop 0.8s ease-out forwards;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform-origin: top right;
    color: rgba(255, 255, 255, 0.9);  /* Light text color */
  }

  .entities-panel.closing {
    animation: slideOutToTop 0.8s ease-in forwards;
  }

  @keyframes slideInFromTop {
    0% {
      transform: translateY(-100%);
      opacity: 0;
    }
    100% {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes slideOutToTop {
    0% {
      transform: translateY(0);
      opacity: 1;
    }
    100% {
      transform: translateY(-100%);
      opacity: 0;
    }
  }

  .entities-header {
    padding: 0.5em 1em;
    background-color: rgba(80, 100, 200, 0.2);  /* Bluish header background */
    border-bottom: 0.0625em solid rgba(100, 120, 230, 0.3);
  }

  .entities-header h3 {
    margin: 0 0 0.5em 0;
    font-size: 1em;
    text-align: center;
    color: rgba(255, 255, 255, 0.95);
    text-shadow: 0 0 0.3em rgba(100, 150, 255, 0.5);  /* Subtle blue glow */
  }

  .tabs {
    display: flex;
    gap: 0.2em;
    justify-content: center;
  }

  .tabs button {
    padding: 0.2em 0.5em;
    background: rgba(70, 90, 190, 0.2);  /* Bluish tab background */
    border: 0.0625em solid rgba(100, 120, 230, 0.3);
    border-radius: 0.2em;
    color: rgba(255, 255, 255, 0.8);
    font-size: 0.8em;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .tabs button.active {
    background: rgba(80, 120, 230, 0.4);  /* More vibrant when active */
    border-color: rgba(100, 150, 255, 0.5);
    font-weight: bold;
    color: white;
  }

  .tabs button:hover {
    background: rgba(80, 120, 230, 0.3);
  }

  .entities-list {
    flex: 1;
    overflow-y: auto;
    max-height: 15em;
  }

  .entity-item {
    display: flex;
    align-items: center;
    padding: 0.5em 1em;
    border: none;
    border-bottom: 0.0625em solid rgba(100, 120, 230, 0.2);
    background: transparent;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    text-align: left;
    width: 100%;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .entity-item:hover,
  .entity-item:focus {
    background-color: rgba(100, 120, 230, 0.15);
    outline: none;
  }
  
  .entity-item:focus-visible {
    box-shadow: inset 0 0 0 0.15em rgba(100, 150, 255, 0.5);
  }

  .entity-icon {
    margin-right: 0.8em;
    font-size: 1.2em;
    width: 1.5em;
    text-align: center;
  }

  .entity-info {
    flex: 1;
  }

  .entity-name {
    font-weight: bold;
    font-size: 0.9em;
  }

  .entity-location {
    font-size: 0.8em;
    opacity: 0.7;
    display: flex;
    justify-content: space-between;
  }

  .entity-action {
    font-size: 1.2em;
    color: rgba(150, 180, 255, 0.7);  /* Blueish arrow */
  }

  .entity-empty, .entity-more {
    padding: 1em;
    text-align: center;
    font-style: italic;
    color: rgba(180, 190, 230, 0.5);
    font-size: 0.9em;
  }

  /* Entity type styling with more distinct colors */
  .entity-structure {
    border-left: 0.2em solid rgba(200, 200, 255, 0.7);
  }

  .entity-spawn {
    border-left: 0.2em solid rgba(0, 255, 255, 0.7);
  }

  .entity-watchtower {
    border-left: 0.2em solid rgba(255, 255, 150, 0.7);
  }

  .entity-fortress {
    border-left: 0.2em solid rgba(255, 200, 100, 0.7);
  }

  .entity-player {
    border-left: 0.2em solid rgba(100, 150, 255, 0.8);  /* More vibrant blue */
  }

  .entity-group {
    border-left: 0.2em solid rgba(255, 100, 120, 0.8);  /* More vibrant red */
  }

  /* Responsive adjustments */
  @media (max-width: 640px) {
    .entities-panel {
      width: 100%;
      max-width: 100%;
      right: 0;
      margin-top: 2.5em;
      border-radius: 0.3em;
      border-top-left-radius: 0;
      border-top-right-radius: 0;
    }
  }

  /* Tab styles update for better focus states */
  .tabs button:focus-visible {
    outline: 0.15em solid rgba(120, 170, 255, 0.7);
    outline-offset: 0.1em;
  }

  /* Add scrollbar styling for the entities list */
  .entities-list::-webkit-scrollbar {
    width: 0.4em;
  }
  
  .entities-list::-webkit-scrollbar-track {
    background: rgba(50, 50, 70, 0.3);
  }
  
  .entities-list::-webkit-scrollbar-thumb {
    background-color: rgba(100, 120, 230, 0.5);
    border-radius: 10px;
  }
</style>
