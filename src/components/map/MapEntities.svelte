<script>
  import { 
    map,
    targetStore,
    moveTarget,
    chunks,
    coordinates
  } from '../../lib/stores/map.js';
  import { onMount } from 'svelte';
  import Torch from '../icons/Torch.svelte';
  
  // Accept closing prop from parent
  const { closing = false } = $props();
  
  // State variables
  let activeTab = $state('all');
  let visibleChunkCount = $state(0);
  let entityList = $state([]);
  let structuresCount = $state(0);
  let playersCount = $state(0);
  let groupsCount = $state(0);
  let totalEntityCount = $state(0);
  
  // Simple filtered entities function
  function getFilteredEntities() {
    if (activeTab === 'all') return entityList;
    const entityType = activeTab.slice(0, -1); // 'structures' -> 'structure'
    return entityList.filter(entity => entity.entityType === entityType);
  }
  
  // Track chunks count
  $effect(() => {
    visibleChunkCount = $chunks?.size || 0;
  });

  // Process coordinates to extract entities
  $effect(() => {
    if (!$map.ready || !$coordinates || $coordinates.length === 0) return;
    
    // Extract entities from coordinates
    const entities = [];
    
    $coordinates.forEach(coord => {
      // Add structure if present
      if (coord.structure) {
        entities.push({
          entityType: 'structure',
          entityId: `structure-${coord.x}-${coord.y}`,
          x: coord.x, 
          y: coord.y,
          distance: coord.distance,
          ...coord.structure
        });
      }
      
      // Add players if present
      if (coord.players && Array.isArray(coord.players)) {
        coord.players.forEach((player, idx) => {
          if (!player) return;
          entities.push({
            entityType: 'player',
            entityId: player.uid || `player-${coord.x}-${coord.y}-${idx}`,
            x: coord.x,
            y: coord.y,
            distance: coord.distance,
            ...player
          });
        });
      }
      
      // Add groups if present
      if (coord.groups && Array.isArray(coord.groups)) {
        coord.groups.forEach((group, idx) => {
          if (!group) return;
          entities.push({
            entityType: 'group',
            entityId: group.id || `group-${coord.x}-${coord.y}-${idx}`,
            x: coord.x,
            y: coord.y,
            distance: coord.distance,
            ...group
          });
        });
      }
    });
    
    // Sort entities by distance
    entities.sort((a, b) => a.distance - b.distance);
    
    // Update counts
    structuresCount = entities.filter(e => e.entityType === 'structure').length;
    playersCount = entities.filter(e => e.entityType === 'player').length;
    groupsCount = entities.filter(e => e.entityType === 'group').length;
    totalEntityCount = entities.length;
    
    // Update the entity list
    entityList = entities;
  });
  
  // Format distance for display
  function formatDistance(distance) {
    return distance === 0 ? 'here' : Math.round(distance * 10) / 10;
  }
  
  // Navigate to entity location
  function goToEntity(entity) {
    if (entity?.x !== undefined && entity?.y !== undefined) {
      moveTarget(entity.x, entity.y);
    }
  }
  
  // Entity display helpers
  function getPlayerDisplayName(player) {
    if (player.isAnonymous || player.guest) {
      return `Guest ${player.id?.substring(0, 4) || 'User'}`;
    }
    return player.displayName || 
           player.email?.split('@')[0] || 
           `User ${player.id?.substring(0, 4)}`;
  }

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

  function formatStructureName(entity) {
    if (entity.name) {
      return `${entity.name} (${entity.type || 'structure'})`;
    }
    return entity.type ? entity.type.charAt(0).toUpperCase() + entity.type.slice(1) : 'Structure';
  }
</script>

<div class="entities-container">
  <div 
    class="entities-panel" 
    class:closing={closing} 
    role="region" 
    aria-label="Map entities list">
    <div class="entities-header">
      <h3>Map Entities {totalEntityCount > 0 ? `(${totalEntityCount})` : ''}</h3>
      <div class="tabs" role="tablist">
        <button 
          role="tab"
          aria-selected={activeTab === 'all'}
          class:active={activeTab === 'all'} 
          onclick={() => activeTab = 'all'}>
          All
          {#if totalEntityCount > 0}
            <span class="count">({totalEntityCount})</span>
          {/if}
        </button>
        <button 
          role="tab"
          aria-selected={activeTab === 'structures'}
          class:active={activeTab === 'structures'} 
          onclick={() => activeTab = 'structures'}>
          Structures
          {#if structuresCount > 0}
            <span class="count">({structuresCount})</span>
          {/if}
        </button>
        <button 
          role="tab"
          aria-selected={activeTab === 'players'}
          class:active={activeTab === 'players'} 
          onclick={() => activeTab = 'players'}>
          Players
          {#if playersCount > 0}
            <span class="count">({playersCount})</span>
          {/if}
        </button>
        <button 
          role="tab"
          aria-selected={activeTab === 'groups'}
          class:active={activeTab === 'groups'} 
          onclick={() => activeTab = 'groups'}>
          Groups
          {#if groupsCount > 0}
            <span class="count">({groupsCount})</span>
          {/if}
        </button>
      </div>
    </div>

    <div class="entities-list" role="tabpanel" aria-label={`${activeTab} entities`}>
      {#key activeTab}
        {#if getFilteredEntities().length > 0}
          {#each getFilteredEntities() as entity (entity.entityId)}
            <button 
              class="entity-item {getEntityColorClass(entity)}" 
              onclick={() => goToEntity(entity)}
              onkeydown={(e) => e.key === 'Enter' && goToEntity(entity)}
              tabindex="0"
              aria-label={`Go to ${entity.entityType} ${entity.name || entity.type || ''} at coordinates ${entity.x},${entity.y}, ${formatDistance(entity.distance)} tiles away`}
            >
              <div class="entity-icon">
                {#if entity.entityType === 'structure' && entity.type === 'spawn'}
                  <Torch size="1.2em" />
                {:else if entity.entityType === 'structure'}
                  {getEntitySymbol(`structure-${entity.type}`)}
                {:else}
                  {getEntitySymbol(entity.entityType)}
                {/if}
              </div>
              <div class="entity-info">
                <div class="entity-name">
                  {#if entity.entityType === 'structure'}
                    {formatStructureName(entity)}
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
        {:else if totalEntityCount > 0}
          <div class="entity-empty">
            No {activeTab} found in the current area
          </div>
        {:else if visibleChunkCount > 0}
          <div class="entity-empty">
            Loading entities from {visibleChunkCount} visible chunks...
          </div>
        {:else}
          <div class="entity-empty">
            {!$map.ready ? 'Waiting for map to initialize...' : `No ${activeTab === 'all' ? 'entities' : activeTab} found`}
          </div>
        {/if}
      {/key}
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
    margin-top: 0;  /* No margin gap at top */
    padding-top: 1.25em;
    background-color: rgba(255, 255, 255, 0.85); /* Match Details panel background */
    color: rgba(0, 0, 0, 0.8); /* Match Details panel text color */
    border: 0.05em solid rgba(255, 255, 255, 0.2); /* Match Details panel border */
    border-radius: 0.3em;
    box-shadow: 0 0.2em 0.7em rgba(0, 0, 0, 0.2); /* Softer shadow like Details */
    backdrop-filter: blur(0.5em); /* Add backdrop blur like Details */
    -webkit-backdrop-filter: blur(0.5em);
    animation: reveal 0.4s ease-out forwards; /* Match Details animation */
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform-origin: top right;
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7); /* Match Details text shadow */
    font-family: var(--font-body);
  }

  .entities-panel.closing {
    animation: closeReveal 0.3s ease-in forwards;
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

  @keyframes closeReveal {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(0.95);
    }
  }

  .entities-header {
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }

  .entities-header h3 {
    margin: 0;
    padding: 0.3em;
    font-size: 1.1em;
    font-weight: 600;
    text-align: center;
    color: rgba(0, 0, 0, 0.9);
    font-family: var(--font-heading);
  }

  .tabs {
    display: flex;
    gap: 0.2em;
    justify-content: center;
    padding: 0 0.3em 0.3em 0.3em;
  }

  .tabs button {
    padding: 0.2em 0.5em;
    background: rgba(0, 0, 0, 0.05);
    border: 0.05em solid rgba(0, 0, 0, 0.1);
    border-radius: 0.2em;
    color: rgba(0, 0, 0, 0.7);
    font-size: 0.8em;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: var(--font-body);
  }

  .tabs button.active {
    background: rgba(0, 0, 0, 0.1);
    font-weight: bold;
    color: rgba(0, 0, 0, 0.9);
  }

  .tabs button:hover {
    background: rgba(0, 0, 0, 0.08);
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
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
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
    background-color: rgba(0, 0, 0, 0.05);
    outline: none;
  }
  
  .entity-item:focus-visible {
    box-shadow: inset 0 0 0 0.15em rgba(0, 0, 0, 0.1);
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
    color: rgba(0, 0, 0, 0.85);
  }

  .entity-location {
    font-size: 0.8em;
    opacity: 0.7;
    display: flex;
    justify-content: space-between;
    color: rgba(0, 0, 0, 0.7);
  }

  .entity-action {
    font-size: 1.2em;
    color: rgba(0, 0, 0, 0.5);
  }

  .entity-empty, .entity-more {
    padding: 1em;
    text-align: center;
    font-style: italic;
    color: rgba(0, 0, 0, 0.5);
    font-size: 0.9em;
  }

  .entity-structure {
    border-left: 0.2em solid rgba(80, 80, 120, 0.6);
  }

  .entity-spawn {
    border-left: 0.2em solid rgba(0, 180, 180, 0.6);
  }

  .entity-watchtower {
    border-left: 0.2em solid rgba(180, 180, 0, 0.6);
  }

  .entity-fortress {
    border-left: 0.2em solid rgba(180, 120, 0, 0.6);
  }

  .entity-player {
    border-left: 0.2em solid rgba(0, 100, 200, 0.6);
  }

  .entity-group {
    border-left: 0.2em solid rgba(200, 0, 50, 0.6);
  }

  @media (max-width: 640px) {
    .entities-panel {
      width: 100%;
      max-width: 100%;
      right: 0;
      margin-top: 2.5em;
      padding-top: 0; /* Reset padding for mobile view */
      border-radius: 0.3em;
      border-top-left-radius: 0;
      border-top-right-radius: 0;
    }
  }

  .tabs button:focus-visible {
    outline: 0.15em solid rgba(0, 0, 0, 0.2);
    outline-offset: 0.1em;
  }

  .entities-list::-webkit-scrollbar {
    width: 0.4em;
  }
  
  .entities-list::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.05);
  }
  
  .entities-list::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 10px;
  }

  .count {
    font-size: 0.8em;
    opacity: 0.7;
    margin-left: 0.2em;
  }

  .refresh-button {
    background: rgba(0, 0, 0, 0.1);
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 4px;
    padding: 0.3em 0.8em;
    margin-top: 0.5em;
    font-size: 0.9em;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .refresh-button:hover {
    background: rgba(0, 0, 0, 0.15);
  }

  .raw-entities {
    margin-top: 1em;
    text-align: left;
    background: rgba(0, 0, 0, 0.05);
    padding: 0.5em;
    border-radius: 0.3em;
  }
  
  .raw-section {
    margin-bottom: 0.5em;
  }
  
  .raw-label {
    font-weight: bold;
    font-size: 0.8em;
  }
  
  .raw-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3em;
    margin-top: 0.2em;
  }
  
  .raw-item {
    font-size: 0.7em;
    padding: 0.1em 0.4em;
    background: rgba(0, 0, 0, 0.1);
    border: none;
    border-radius: 0.2em;
    color: rgba(0, 0, 0, 0.7);
    cursor: pointer;
  }
  
  .raw-item:hover {
    background: rgba(0, 0, 0, 0.2);
  }

  .entity-icon :global(svg) {
    vertical-align: middle;
  }
</style>
