<script>
  import { map, targetStore, entities, highlightedStore } from "../../lib/stores/map";
  import Close from '../../components/icons/Close.svelte';
  import { user } from "../../lib/stores/user";
  import { onMount } from "svelte";
  
  // Only keep onClose as a prop, removing x, y, and terrain
  const { onClose } = $props()
  
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Determine if we're showing a highlighted tile that's different from the target
  const isHighlighted = $derived($highlightedStore != null && 
    ($highlightedStore.x !== $targetStore?.x || $highlightedStore.y !== $targetStore?.y));
  
  // Use either the highlighted tile if present, or targetStore
  const currentTile = $derived(isHighlighted ? $highlightedStore : $targetStore);
  
  // Remove redundant state variables for coordinates
  
  // Entity data with fallbacks from entities store
  let structure = $state(null);
  let players = $state([]);
  let groups = $state([]);
  
  // Update entity data when current tile changes
  $effect(() => {
    // First try to get entities directly from the current tile
    structure = currentTile?.structure || null;
    players = currentTile?.players || [];
    groups = currentTile?.groups || [];
    
    // If no direct entities on the tile, try to get from the entities store
    if (!structure && !players.length && !groups.length && currentTile?.x != null && currentTile?.y != null) {
      const locationKey = `${currentTile.x},${currentTile.y}`;
      structure = $entities.structure[locationKey] || null;
      players = $entities.players[locationKey] || [];
      groups = $entities.groups[locationKey] || [];
    }
    
    console.log('Entity data refreshed:', {
      coords: currentTile?.x != null ? `${currentTile.x},${currentTile.y}` : 'unknown',
      source: isHighlighted ? 'highlighted' : 'target',
      hasDirectStructure: !!currentTile?.structure,
      hasDirectPlayers: currentTile?.players?.length > 0,
      hasDirectGroups: currentTile?.groups?.length > 0,
      finalStructure: !!structure,
      finalPlayers: players.length,
      finalGroups: groups.length
    });
  });
  
  // Use terrain from the current tile
  const formattedName = $derived(
    _fmt(currentTile?.biome?.name) || "Unknown"
  );
  
  // Format structure properties for display
  const structureProps = $derived(() => {
    if (!structure) return [];
    
    const props = [];
    
    // Basic properties
    if (structure.type) props.push({ label: "Type", value: _fmt(structure.type) });
    if (structure.faction) props.push({ label: "Faction", value: _fmt(structure.faction) });
    if (structure.level) props.push({ label: "Level", value: structure.level });
    if (structure.health !== undefined) {
      props.push({ 
        label: "Health", 
        value: structure.health, 
        extra: structure.maxHealth ? `/${structure.maxHealth}` : '' 
      });
    }
    
    // Owner information
    if (structure.owner) props.push({ label: "Owner", value: structure.owner });
    
    // Resources if available
    if (structure.resources) {
      Object.entries(structure.resources).forEach(([key, value]) => {
        props.push({ label: _fmt(key), value });
      });
    }
    
    return props;
  });
  
  const escape = event => event.key === 'Escape' && onClose?.();

  // Simplified helper function to get player display name - matches game.js convention
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
  
  // Check if a player is the current user
  function isCurrentUser(player) {
    return player.id === $user?.uid;
  }

  // Force a refresh when component mounts
  onMount(() => {
    // Small delay to ensure stores are initialized
    setTimeout(() => {
      // Only proceed if we have valid coordinates
      if (currentTile?.x != null && currentTile?.y != null) {
        const locationKey = `${currentTile.x},${currentTile.y}`;
        // Double-check entities store for current location
        if (!structure) {
          structure = $entities.structure[locationKey] || null;
        }
        if (!players.length) {
          players = $entities.players[locationKey] || [];
        }
        if (!groups.length) {
          groups = $entities.groups[locationKey] || [];
        }
      }
    }, 100);
  });

  // Add helper function to format rarity
  function formatRarity(rarity) {
    return rarity ? rarity.charAt(0).toUpperCase() + rarity.slice(1) : '';
  }

  // Determine if rarity should be displayed
  const hasRarity = $derived(
    currentTile?.terrain?.rarity && currentTile.terrain.rarity !== 'common'
  );
</script>

<svelte:window onkeydown={escape} />

<div class="details">
  <div class="info" class:highlighted={isHighlighted}>
    <div class="content">
      <h2>Details {currentTile?.x != null ? `${currentTile.x}, ${currentTile.y}` : ''} 
        {#if isHighlighted}
          <span class="highlighted-label">(Highlighted)</span>
        {/if}
      </h2>
      
      <div class="terrain-info">
        <p>
          Terrain: {formattedName}
          {#if hasRarity}
            <span class="rarity-tag {currentTile.terrain.rarity}">{formatRarity(currentTile.terrain.rarity)}</span>
          {/if}
        </p>
      </div>
      
      {#if structure}
        <div class="section">
          <h3>{structure.name || _fmt(structure.type) || "Unknown structure"}</h3>
          
          {#if structure.description}
            <p class="description">{structure.description}</p>
          {/if}
          
          {#if structureProps.length > 0}
            <div class="props-grid">
              {#each structureProps as prop}
                <div class="prop-label">{prop.label}:</div>
                <div class="prop-value">{prop.value}{prop.extra || ''}</div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      
      {#if players?.length > 0}
        <div class="section">
          <h3>Players ({players.length})</h3>
          <ul class="player-list">
            {#each players as player}
              <li>
                <span class="player-name" class:current-user={isCurrentUser(player)}>
                  {getPlayerDisplayName(player)}
                </span>
                {#if player.race}
                  <span class="player-race">[{_fmt(player.race)}]</span>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      
      {#if groups?.length > 0}
        <div class="section">
          <h3>Unit Groups ({groups.length})</h3>
          <ul>
            {#each groups as group}
              <li>{group.name || group.id} - Units: {group.unitCount || "?"}</li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
    <button class="close-btn" onclick={onClose}>
      <Close size="2.2em" extraClass="close-icon-dark" />
    </button>
  </div>
</div>

<style>
  .details {
    position: absolute;
    bottom: 2.5em;
    right: .5em;
    z-index: 1001; /* Standardize z-index to 1001 */
    transition: opacity 0.2s ease;
    font-size: 1.2em;
    font-family: var(--font-body);
    max-width: calc(100% - 1em); /* Ensure it doesn't overflow screen width */
  }
  
  .info {
    display: flex;
    align-items: flex-start;
    gap: 1em;
    padding: 0.8em 1em;
    border-radius: 0.3em;
    color: rgba(0, 0, 0, 0.8);
    background-color: rgba(255, 255, 255, 0.85); /* Increased opacity from 0.6 to 0.85 */
    border: 0.05em solid rgba(255, 255, 255, 0.2); /* Standardize border */
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    font-weight: 500;
    width: 100%;
    max-width: 22.5em; /* Maximum width on larger screens */
    box-sizing: border-box;
    backdrop-filter: blur(0.5em); /* Add consistent backdrop blur */
    -webkit-backdrop-filter: blur(0.5em);
    animation: reveal 0.4s ease-out forwards;
    transform-origin: bottom right;
    transition: all 0.2s ease; /* Add smooth transition for hover states */
  }

  /* Add minimum dimensions for desktop screens */
  @media (min-width: 768px) {
    .info {
      min-height: 8em;
      min-width: 22em;
    }
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
      border-color: rgba(255, 255, 255, 0.1);
    }
  }
  
  .content {
    flex: 1;
  }
  
  h2 {
    margin: 0;
    font-size: 1.3em;
    font-weight: 700; /* Bold for important headers */
    color: rgba(0, 0, 0, 0.9);
    text-shadow: 0 0 0.1875em rgba(255, 255, 255, 0.8);
    font-family: var(--font-heading);
  }
  
  p {
    margin: 0.3em 0 0;
    font-size: 1.1em;
    color: rgba(0, 0, 0, 0.8);
    font-family: var(--font-body);
    font-weight: 400; /* Regular for details text */
  }
  
  .description {
    font-size: 0.9em;
    font-style: italic;
    margin: 0.5em 0 0.8em;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .close-btn {
    background: none;
    border: none;
    height: 3em;
    padding: 0.3em;
    cursor: pointer;
    opacity: 0.8;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.3em;
  }
  
  .close-btn:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.1);
  }

  /* Mobile optimizations */
  @media (max-width: 480px) {
    .details {
      left: 0.5em;
      right: 0.5em;
      bottom: 1em;
      font-size: 1em;
    }
    
    .info {
      width: 100%;
      padding: 0.8em;
    }
    
    h2 {
      font-size: 1.2em;
    }
    
    p {
      font-size: 1em;
    }
  }

  .section {
    margin-top: 1em;
    padding-top: 0.8em;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  h3 {
    margin: 0 0 0.5em 0;
    font-size: 1.1em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.7);
    font-family: var(--font-heading); /* Add heading font */
  }
  
  ul {
    margin: 0.5em 0;
    padding-left: 1.5em;
    font-size: 0.9em;
    font-family: var(--font-body); /* Add body font */
  }
  
  li {
    margin-bottom: 0.3em;
  }

  .close-btn > :global(.close-icon-dark) {
    color: rgba(0, 0, 0, 0.8);
    stroke: rgba(0, 0, 0, 0.8);
  }
  
  /* New styles for structure properties */
  .props-grid {
    display: grid;
    grid-template-columns: minmax(5em, auto) 1fr;
    gap: 0.3em 0.8em;
    margin: 0.8em 0 0.3em;
    font-size: 0.9em;
  }
  
  .prop-label {
    font-weight: 600;
    color: rgba(0, 0, 0, 0.7);
    text-align: right;
  }
  
  .prop-value {
    color: rgba(0, 0, 0, 0.85);
  }

  .player-list {
    margin: 0.5em 0;
    padding-left: 1.5em;
    font-size: 0.9em;
    font-family: var(--font-body);
  }
  
  .player-name {
    font-weight: 500;
    color: rgba(0, 0, 0, 0.85);
  }
  
  .player-name.current-user {
    font-weight: 700;
    color: rgba(0, 0, 0, 0.95);
    position: relative;
  }
  
  .player-name.current-user::after {
    content: " (You)";
    font-weight: 400;
    font-style: italic;
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.6);
  }
  
  .player-race {
    font-style: italic;
    margin-left: 0.3em;
    color: rgba(0, 0, 0, 0.6);
    font-size: 0.95em;
  }

  /* Add styling for highlighted state */
  .info.highlighted {
    border-left: 0.3em solid rgba(255, 215, 0, 0.8);
    padding-left: 0.8em;
    background-color: rgba(255, 255, 255, 0.9);
    box-shadow: 0 0 0.8em rgba(255, 215, 0, 0.4);
  }
  
  .highlighted-label {
    font-size: 0.7em;
    font-weight: normal;
    color: rgba(255, 165, 0, 0.9);
    background: rgba(255, 215, 0, 0.15);
    padding: 0.1em 0.4em;
    border-radius: 0.3em;
    vertical-align: middle;
    margin-left: 0.4em;
  }

  .terrain-info {
    display: flex;
    align-items: center;
    margin: 0.3em 0 0.8em;
  }

  .rarity-tag {
    margin-left: 0.8em;
    font-size: 0.9em;
    font-weight: bold;
    padding: 0.2em 0.5em;
    border-radius: 0.3em;
    display: inline-block;
    vertical-align: middle;
  }
  
  .uncommon {
    color: #228B22;
    background: rgba(30, 255, 0, 0.15);
    border: 1px solid rgba(30, 255, 0, 0.3);
  }
  
  .rare {
    color: #0070DD;
    background: rgba(0, 112, 221, 0.15);
    border: 1px solid rgba(0, 112, 221, 0.3);
  }
  
  .epic {
    color: #9400D3;
    background: rgba(148, 0, 211, 0.15);
    border: 1px solid rgba(148, 0, 211, 0.3);
  }
  
  .legendary {
    color: #FF8C00;
    background: rgba(255, 165, 0, 0.15);
    border: 1px solid rgba(255, 165, 0, 0.3);
  }
  
  .mythic {
    color: #FF1493;
    background: rgba(255, 128, 255, 0.15);
    border: 1px solid rgba(255, 128, 255, 0.3);
  }
</style>
