<script>
  import { map, targetStore, entities, highlightedStore } from "../../lib/stores/map";
  import Close from '../../components/icons/Close.svelte';
  import { user } from "../../lib/stores/user";
  import { onMount, onDestroy } from 'svelte';
  import { game } from "../../lib/stores/game";
  
  // Import race icon components
  import Human from '../../components/icons/Human.svelte';
  import Elf from '../../components/icons/Elf.svelte';
  import Dwarf from '../../components/icons/Dwarf.svelte';
  import Goblin from '../../components/icons/Goblin.svelte';
  import Fairy from '../../components/icons/Fairy.svelte';
  
  // Only keep onClose as a prop, removing x, y, and terrain
  const { onClose } = $props()
  
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Determine if we're showing a highlighted tile that's different from the target
  const isHighlighted = $derived($highlightedStore != null && 
    ($highlightedStore.x !== $targetStore?.x || $highlightedStore.y !== $targetStore?.y));
  
  // Use either the highlighted tile if present, or targetStore
  const currentTile = $derived(isHighlighted ? $highlightedStore : $targetStore);
  
  // Replace manual entity tracking with derived values directly from the current tile
  const structure = $derived(currentTile?.structure || null);
  const players = $derived(currentTile?.players || []);
  const groups = $derived(currentTile?.groups || []);
  
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

  // Add helper function to format rarity
  function formatRarity(rarity) {
    return rarity ? rarity.charAt(0).toUpperCase() + rarity.slice(1) : '';
  }

  // Determine if rarity should be displayed
  const hasRarity = $derived(
    currentTile?.terrain?.rarity && currentTile.terrain.rarity !== 'common'
  );

  // Get a formatted race name for a group
  function getGroupRaceName(group) {
    if (!group) return '';
    
    // Use the race directly from the group object if available
    if (group.race) return _fmt(group.race);
    
    // Fallback to faction if race isn't set
    if (group.faction) return _fmt(group.faction);
    
    // If no race or faction, try to determine from units (legacy support)
    if (group.units && group.units.length > 0) {
      // Check if player is in the group
      const playerUnit = group.units.find(unit => unit.type === 'player');
      if (playerUnit && playerUnit.race) {
        return _fmt(playerUnit.race);
      }
      
      // Use the race of the first unit with a race
      for (const unit of group.units) {
        if (unit.race) {
          return _fmt(unit.race);
        }
      }
    }
    
    return 'Mixed';
  }

  // Timer for updating mobilization countdown
  let updateTimer;
  // Counter to force updates
  let updateCounter = $state(0);
  
  // Set up timer to update countdown values
  onMount(() => {
    // Update every second to keep countdown accurate
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

  // Calculate estimated arrival time for moving groups
  function calculateMoveCompletionTime(group) {
    if (!group || group.status !== 'moving' || !group.moveStarted) return null;
    
    // Use reactive value directly instead of storing in a constant
    const worldSpeed = $game.worldInfo[$game.currentWorld]?.speed || 1.0;
    
    const moveStarted = group.moveStarted;
    const moveSpeed = group.moveSpeed || 1.0;
    const adjustedSpeed = moveSpeed * worldSpeed;
    const moveTime = (1000 * 60) / adjustedSpeed; // Base 1 minute per tile, adjusted by speed
    
    return moveStarted + moveTime;
  }

  // Format time remaining for mobilizing or moving groups
  function formatTimeRemaining(endTime) {
    if (!endTime) return '';
    
    // Force this function to re-evaluate on updateCounter change
    updateCounter;
    
    const now = Date.now();
    const remaining = endTime - now;
    
    if (remaining <= 0) return 'Ready';
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }
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
                {#if player.race}
                  <div class="player-race-icon">
                    {#if player.race.toLowerCase() === 'human'}
                      <Human extraClass="race-icon-small" />
                    {:else if player.race.toLowerCase() === 'elf'}
                      <Elf extraClass="race-icon-small" />
                    {:else if player.race.toLowerCase() === 'dwarf'}
                      <Dwarf extraClass="race-icon-small" />
                    {:else if player.race.toLowerCase() === 'goblin'}
                      <Goblin extraClass="race-icon-small" />
                    {:else if player.race.toLowerCase() === 'fairy'}
                      <Fairy extraClass="race-icon-small" />
                    {/if}
                  </div>
                {/if}
                <span class="player-info">
                  <span class="player-name" class:current-user={isCurrentUser(player)}>
                    {getPlayerDisplayName(player)}
                  </span>
                  {#if player.race}
                    <span class="player-race">[{_fmt(player.race)}]</span>
                  {/if}
                </span>
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
              <li class="group-item">
                <div class="group-race-icon">
                  {#if group.race?.toLowerCase() === 'human'}
                    <Human extraClass="race-icon-small" />
                  {:else if group.race?.toLowerCase() === 'elf'}
                    <Elf extraClass="race-icon-small" />
                  {:else if group.race?.toLowerCase() === 'dwarf'}
                    <Dwarf extraClass="race-icon-small" />
                  {:else if group.race?.toLowerCase() === 'goblin'}
                    <Goblin extraClass="race-icon-small" />
                  {:else if group.race?.toLowerCase() === 'fairy'}
                    <Fairy extraClass="race-icon-small" />
                  {:else if group.faction?.toLowerCase() === 'human'}
                    <Human extraClass="race-icon-small" />
                  {:else if group.faction?.toLowerCase() === 'elf'}
                    <Elf extraClass="race-icon-small" />
                  {:else if group.faction?.toLowerCase() === 'dwarf'}
                    <Dwarf extraClass="race-icon-small" />
                  {:else if group.faction?.toLowerCase() === 'goblin'}
                    <Goblin extraClass="race-icon-small" />
                  {:else if group.faction?.toLowerCase() === 'fairy'}
                    <Fairy extraClass="race-icon-small" />
                  {/if}
                </div>
                <div class="group-content">
                  <div class="group-header">
                    <span class="group-name">{group.name || group.id}</span>
                    <span class="group-race">[{getGroupRaceName(group)}]</span>
                  </div>
                  <div class="group-info">
                    <span>Units: {group.unitCount || group.units?.length || "?"}</span>
                    {#if group.status === 'mobilizing' && group.readyAt}
                      <span class="mobilizing">
                        Mobilizing: {formatTimeRemaining(group.readyAt)}
                      </span>
                    {:else if group.status === 'moving' && group.moveStarted}
                      <span class="moving">
                        Moving: {formatTimeRemaining(calculateMoveCompletionTime(group))}
                      </span>
                    {:else if group.status && group.status !== 'idle'}
                      <span class="status-tag {group.status}">{_fmt(group.status)}</span>
                    {:else}
                      <span class="status-tag idle">Idle</span>
                    {/if}
                  </div>
                </div>
              </li>
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
  
  .player-list li {
    display: flex;
    align-items: center;
    margin-bottom: 0.5em;
  }
  
  .player-race-icon {
    margin-right: 0.6em;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  :global(.race-icon-small) {
    width: 1.5em;
    height: 1.5em;
    fill: rgba(0, 0, 0, 0.7);
  }
  
  .player-info {
    display: flex;
    flex-direction: column;
  }
  
  .player-name {
    font-weight: 500;
    color: rgba(0, 0, 0, 0.85);
    line-height: 1.2;
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
    color: rgba(0, 0, 0, 0.6);
    font-size: 0.85em;
    line-height: 1.2;
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

  .group-item {
    display: flex;
    align-items: flex-start;
    margin-bottom: 0.6em;
    gap: 0.6em;
  }
  
  .group-race-icon {
    margin-top: 0.2em;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .group-content {
    flex: 1;
  }
  
  .group-header {
    display: flex;
    align-items: center;
    gap: 0.6em;
    margin-bottom: 0.2em;
  }
  
  .group-name {
    font-weight: 600;
    color: rgba(0, 0, 0, 0.85);
    line-height: 1.2;
  }
  
  .group-race {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.6);
    font-style: italic;
  }
  
  .group-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6em;
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .mobilizing {
    display: inline-block;
    background: rgba(255, 165, 0, 0.15);
    color: #ff8c00;
    font-size: 0.85em;
    padding: 0.1em 0.4em;
    border-radius: 0.3em;
    margin-left: 0.5em;
    border: 1px solid rgba(255, 165, 0, 0.3);
    font-weight: 500;
    animation: pulseMobilizing 2s infinite;
  }
  
  @keyframes pulseMobilizing {
    0% { box-shadow: 0 0 0 0 rgba(255, 165, 0, 0.4); }
    50% { box-shadow: 0 0 0 4px rgba(255, 165, 0, 0); }
    100% { box-shadow: 0 0 0 0 rgba(255, 165, 0, 0); }
  }

  .moving {
    display: inline-block;
    background: rgba(0, 128, 0, 0.15);
    color: #008000;
    font-size: 0.85em;
    padding: 0.1em 0.4em;
    border-radius: 0.3em;
    margin-left: 0.5em;
    border: 1px solid rgba(0, 128, 0, 0.3);
    font-weight: 500;
    animation: pulseMoving 2s infinite;
  }
  
  @keyframes pulseMoving {
    0% { box-shadow: 0 0 0 0 rgba(0, 128, 0, 0.4); }
    50% { box-shadow: 0 0 0 4px rgba(0, 128, 0, 0); }
    100% { box-shadow: 0 0 0 0 rgba(0, 128, 0, 0); }
  }
  
  .status-tag {
    display: inline-block;
    font-size: 0.85em;
    padding: 0.1em 0.4em;
    border-radius: 0.3em;
    font-weight: 500;
  }
  
  .gathering {
    background: rgba(30, 144, 255, 0.15);
    border: 1px solid rgba(30, 144, 255, 0.3);
    color: #1e90ff;
  }
  
  .moving {
    background: rgba(0, 128, 0, 0.15);
    border: 1px solid rgba(0, 128, 0, 0.3);
    color: #008000;
  }
  
  .scouting {
    background: rgba(148, 0, 211, 0.15);
    border: 1px solid rgba(148, 0, 211, 0.3);
    color: #9400d3;
  }
  
  .stationed {
    background: rgba(128, 128, 128, 0.15);
    border: 1px solid rgba(128, 128, 128, 0.3);
    color: #696969;
  }
  
  .idle {
    background: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.6);
  }
  
  .group-owner {
    font-size: 0.8em;
    color: rgba(0, 0, 0, 0.6);
    font-style: italic;
  }
  
  .group-owner.current-user::after {
    content: " (You)";
    font-weight: 400;
    font-style: italic;
    color: rgba(0, 0, 0, 0.6);
  }
  
  @media (max-width: 480px) {
    .group-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.2em;
    }
    
    .group-race {
      margin-left: 0;
    }
    
    .group-info {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.3em;
    }
  }
</style>