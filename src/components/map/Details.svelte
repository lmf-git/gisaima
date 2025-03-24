<script>
  import { map, coordinates, targetStore } from "../../lib/stores/map";
  import Close from '../../components/icons/Close.svelte';
  import { user } from "../../lib/stores/user";
  
  const { x = 0, y = 0, terrain, onClose } = $props()
  
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Get display tile - either highlighted or target
  const displayTile = $derived(() => {
    // First check if there's a highlighted tile
    if ($map.highlighted) {
      const highlighted = $coordinates.find(
        c => c.x === $map.highlighted.x && c.y === $map.highlighted.y
      );
      if (highlighted) return highlighted;
    }
    
    // Otherwise fall back to target tile
    return $targetStore;
  });
  
  // Use either passed terrain or get from the display tile
  const formattedName = $derived(
    _fmt(terrain || displayTile.biome?.name) || "Unknown"
  );
  
  // Access entity data from the display tile
  const structure = $derived(displayTile.structure);
  const players = $derived(displayTile.players || []);
  const groups = $derived(displayTile.groups || []);
  
  // Get current x,y coordinates from the display tile
  const currentX = $derived(displayTile.x);
  const currentY = $derived(displayTile.y);
  
  // Track if we're showing a highlighted tile (vs target)
  const isHighlighted = $derived(
    $map.highlighted && 
    displayTile.x === $map.highlighted.x && 
    displayTile.y === $map.highlighted.y
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
</script>

<svelte:window onkeydown={escape} />

<div class="details">
  <div class="info" class:highlighted={isHighlighted}>
    <div class="content">
      <h2>Details {currentX}, {currentY} {#if isHighlighted}<span class="highlighted-label">(Highlighted)</span>{/if}</h2>
      <p>Terrain: {formattedName}</p>
      
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
      
      {#if players.length > 0}
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
      
      {#if groups.length > 0}
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
</style>
