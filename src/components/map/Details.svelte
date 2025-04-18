<script>
  import { map, targetStore, entities, highlightedStore } from "../../lib/stores/map";
  import Close from '../../components/icons/Close.svelte';
  import { user } from "../../lib/stores/user";
  import { onMount, onDestroy } from 'svelte';
  import { game, currentPlayer } from "../../lib/stores/game.js";
  import { calculateNextTickTime, formatTimeUntilNextTick } from '../../lib/stores/game.js';
  
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

  // Add derived property for items
  const items = $derived(currentTile?.items || []);
  
  // Helper function to get item type icon
  function getItemTypeIcon(type) {
    switch(type?.toLowerCase()) {
      case 'resource': return '♦';
      case 'quest_item': return '!';
      case 'artifact': return '★';
      case 'gem': return '◆';
      case 'tool': return '⚒';
      case 'currency': return '⚜';
      case 'junk': return '✽';
      case 'treasure': return '❖';
      default: return '•';
    }
  }

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

  // Simplify the time remaining formatter
  function formatTimeRemaining(endTime) {
    if (!endTime) return '';
    
    // Force re-evaluation when counter updates
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

  // Function to check if entity belongs to current player
  function isOwnedByCurrentPlayer(entity) {
    if (!$currentPlayer || !entity) return false;
    return entity.owner === $currentPlayer.uid || entity.uid === $currentPlayer.uid;
  }

  // Add a helper function to format group status with appropriate time info
  function formatGroupStatus(group) {
    if (!group) return "";
    
    let statusText = _fmt(group.status) || "Idle";
    
    // For mobilizing or demobilising groups, show next tick info
    if (group.status === 'mobilizing' || group.status === 'demobilising') {
      const nextTickInfo = formatTimeUntilNextTick($game.currentWorld);
      statusText += ` (Ready: ${nextTickInfo})`;
    }
    // For other statuses with readyAt times
    else if (group.readyAt && group.status !== 'idle') {
      // Existing time formatting
      const now = Date.now();
      const remaining = group.readyAt - now;
      
      if (remaining > 0) {
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        statusText += ` (${minutes}m ${seconds}s)`;
      } else {
        statusText += " (Pending update)";
      }
    }
    
    return statusText;
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
      
      {#if items?.length > 0}
        <div class="section">
          <h3>Items ({items.length})</h3>
          <ul class="item-list">
            {#each items as item}
              <li class="item {item.rarity || 'common'}">
                <span class="item-icon {item.type || 'default'}">{getItemTypeIcon(item.type)}</span>
                <div class="item-info">
                  <span class="item-name">
                    {item.name || _fmt(item.type) || "Unknown item"}
                    {#if item.quantity > 1}
                      <span class="item-quantity">×{item.quantity}</span>
                    {/if}
                  </span>
                  <div class="item-details">
                    {#if item.type}
                      <span class="item-type">{_fmt(item.type)}</span>
                    {/if}
                    {#if item.rarity && item.rarity !== 'common'}
                      <span class="item-rarity {item.rarity}">{formatRarity(item.rarity)}</span>
                    {/if}
                  </div>
                  {#if item.description}
                    <div class="item-description">{item.description}</div>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
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
                      <span class="mobilizing" class:pending-tick={isPendingTick(group.readyAt)}>
                        Mobilizing: {formatTimeRemaining(group.readyAt)}
                      </span>
                    {:else if group.status === 'moving' && group.moveStarted}
                      <span class="moving" class:pending-tick={isPendingTick(calculateMoveCompletionTime(group))}>
                        Moving: {formatTimeRemaining(calculateMoveCompletionTime(group))}
                      </span>
                    {:else if group.status === 'demobilising' && group.readyAt}
                      <span class="demobilising" class:pending-tick={isPendingTick(group.readyAt)}>
                        Demobilising: {formatTimeRemaining(group.readyAt)}
                      </span>
                    {:else if group.status === 'fighting'}
                      <span class="fighting">
                        Fighting
                      </span>
                    {:else if group.status && group.status !== 'idle'}
                      <span class="status-tag {group.status}">{_fmt(group.status)}</span>
                    {:else}
                      <span class="status-tag idle">Idle</span>
                    {/if}
                  </div>
                  {#if group.status === 'fighting' && group.battle}
                    <div class="battle-info">
                      <div class="battle-sides">
                        <div class="battle-side battle-side-1">
                          <div class="battle-side-header">Side 1</div>
                          {#each group.battle.side1 as side1Group, i (group.battleId + '-side1-' + i)}
                            <div class="battle-group">
                              {side1Group.name || side1Group.id}
                              {#if side1Group.role}
                                <span class="battle-role {side1Group.role}">{_fmt(side1Group.role)}</span>
                              {/if}
                            </div>
                          {/each}
                        </div>
                        <div class="battle-side battle-side-2">
                          <div class="battle-side-header">Side 2</div>
                          {#each group.battle.side2 as side2Group, i (group.battleId + '-side2-' + i)}
                            <div class="battle-group">
                              {side2Group.name || side2Group.id}
                              {#if side2Group.role}
                                <span class="battle-role {side2Group.role}">{_fmt(side2Group.role)}</span>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      </div>
                      {#if group.battle.endsAt}
                        <div class="battle-timer">
                          Battle ends in: {formatTimeRemaining(group.battle.endsAt)}
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- Player details section -->
      {#if detailType === 'player' && selectedEntity}
        <div class="player-details detail-section">
          <h3>
            {selectedEntity.displayName || 'Player'}
            {#if isOwnedByCurrentPlayer(selectedEntity)}
              <span class="ownership-tag current-user">You</span>
            {/if}
          </h3>
          
          <!-- Rest of player details -->
        </div>
      {/if}

      <!-- Structure details section -->
      {#if detailType === 'structure' && selectedEntity}
        <div class="structure-details detail-section">
          <h3>
            {selectedEntity.name || _fmt(selectedEntity.type) || 'Structure'}
            {#if isOwnedByCurrentPlayer(selectedEntity)}
              <span class="ownership-tag">Your Structure</span>
            {/if}
          </h3>
          
          <!-- Owner information -->
          {#if selectedEntity.owner}
            <div class="detail-row">
              <span class="detail-label">Owner:</span>
              <span class="detail-value">
                {selectedEntity.ownerName || 'Unknown Player'}
                {#if isOwnedByCurrentPlayer(selectedEntity)}
                  <span class="ownership-indicator">(You)</span>
                {/if}
              </span>
            </div>
          {/if}
          
          <!-- Rest of structure details -->
        </div>
      {/if}

      <!-- Group details section -->
      {#if detailType === 'group' && selectedEntity}
        <div class="group-details detail-section">
          <h3>
            {selectedEntity.name || `Group ${selectedEntity.id}` || 'Group'}
            {#if isOwnedByCurrentPlayer(selectedEntity)}
              <span class="ownership-tag">Your Group</span>
            {/if}
          </h3>
          
          <!-- Owner information -->
          {#if selectedEntity.owner}
            <div class="detail-row">
              <span class="detail-label">Owner:</span>
              <span class="detail-value">
                {selectedEntity.ownerName || 'Unknown Player'}
                {#if isOwnedByCurrentPlayer(selectedEntity)}
                  <span class="ownership-indicator">(You)</span>
                {/if}
              </span>
            </div>
          {/if}

          <div class="detail-row">
            <span class="detail-label">Status:</span>
            <span class="detail-value status {selectedEntity.status || 'idle'}">
              {formatGroupStatus(selectedEntity)}
            </span>
          </div>
          
          <!-- Rest of group details -->
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
    z-index: 1200; /* Increased z-index to be higher than MapEntities */
    transition: opacity 0.2s ease;
    font-size: 1.2em;
    font-family: var(--font-body);
    max-width: calc(100% - 1em); /* Ensure it doesn't overflow screen width */
    transform: translateZ(0); /* Create own stacking context */
    will-change: transform; /* Optimize for transform changes */
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
    0% { opacity: 0.9; }
    50% { opacity: 1; }
    100% { opacity: 0.9; }
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
    0% { opacity: 0.9; }
    50% { opacity: 1; }
    100% { opacity: 0.9; }
  }
  
  .demobilising {
    display: inline-block;
    background: rgba(147, 112, 219, 0.15);
    color: #8a2be2;
    font-size: 0.85em;
    padding: 0.1em 0.4em;
    border-radius: 0.3em;
    margin-left: 0.5em;
    border: 1px solid rgba(147, 112, 219, 0.3);
    font-weight: 500;
    animation: pulseDemobilising 2s infinite;
  }
  
  @keyframes pulseDemobilising {
    0% { opacity: 0.9; }
    50% { opacity: 1; }
    100% { opacity: 0.9; }
  }
  
  .fighting {
    display: inline-block;
    background: rgba(139, 0, 0, 0.15);
    color: #8B0000;
    font-size: 0.85em;
    padding: 0.1em 0.4em;
    border-radius: 0.3em;
    margin-left: 0.5em;
    border: 1px solid rgba(139, 0, 0, 0.3);
    font-weight: 500;
    animation: pulseFighting 2s infinite;
  }
  
  @keyframes pulseFighting {
    0% { opacity: 0.9; }
    50% { opacity: 1; box-shadow: 0 0 5px rgba(139, 0, 0, 0.5); }
    100% { opacity: 0.9; }
  }
  
  .battle-info {
    margin-top: 0.5em;
    padding: 0.5em;
    border-radius: 0.3em;
    background-color: rgba(139, 0, 0, 0.07);
    border: 1px dashed rgba(139, 0, 0, 0.2);
    font-size: 0.85em;
  }
  
  .battle-sides {
    display: flex;
    gap: 0.5em;
    margin-top: 0.3em;
  }
  
  .battle-side {
    flex: 1;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.3em;
    padding: 0.3em;
    background-color: rgba(255, 255, 255, 0.5);
  }
  
  .battle-side-header {
    font-weight: 500;
    font-size: 0.9em;
    padding-bottom: 0.2em;
    margin-bottom: 0.2em;
    border-bottom: 1px dashed rgba(0, 0, 0, 0.1);
    text-align: center;
  }
  
  .battle-side-1 .battle-side-header {
    color: #00008B;
  }
  
  .battle-side-2 .battle-side-header {
    color: #8B0000;
  }
  
  .battle-group {
    display: flex;
    align-items: center;
    gap: 0.3em;
    margin-bottom: 0.2em;
    font-size: 0.9em;
  }
  
  .battle-role {
    font-size: 0.8em;
    background-color: rgba(0, 0, 0, 0.07);
    border-radius: 0.2em;
    padding: 0.1em 0.3em;
    margin-left: auto;
  }
  
  .battle-role.attacker, .battle-role.defender {
    font-weight: 500;
  }
  
  .battle-timer {
    text-align: center;
    margin-top: 0.5em;
    font-style: italic;
    color: #8B0000;
    font-weight: 500;
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

  /* Item styles */
  .item-list {
    list-style-type: none;
    padding: 0;
    margin: 0.5em 0;
  }

  .item {
    display: flex;
    align-items: flex-start;
    padding: 0.5em;
    margin-bottom: 0.5em;
    border-radius: 0.3em;
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(0, 0, 0, 0.1);
  }

  .item-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2em;
    height: 2em;
    border-radius: 0.3em;
    background: rgba(0, 0, 0, 0.1);
    margin-right: 0.8em;
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.7);
  }

  .item-info {
    flex: 1;
  }

  .item-name {
    display: block;
    font-weight: 500;
    margin-bottom: 0.2em;
    color: rgba(0, 0, 0, 0.85);
  }

  .item-quantity {
    font-weight: 600;
    margin-left: 0.4em;
    color: rgba(0, 0, 0, 0.7);
  }

  .item-details {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6em;
    font-size: 0.85em;
    margin-bottom: 0.2em;
  }

  .item-type {
    color: rgba(0, 0, 0, 0.6);
  }

  .item-description {
    font-size: 0.85em;
    font-style: italic;
    color: rgba(0, 0, 0, 0.6);
    line-height: 1.3;
  }

  .item-rarity {
    padding: 0.1em 0.4em;
    border-radius: 0.3em;
    font-size: 0.85em;
    font-weight: 500;
  }

  .item.uncommon {
    border-color: rgba(30, 255, 0, 0.3);
    box-shadow: inset 0 0 0.2em rgba(30, 255, 0, 0.15);
  }

  .item.rare {
    border-color: rgba(0, 112, 221, 0.3);
    box-shadow: inset 0 0 0.2em rgba(0, 112, 221, 0.15);
  }

  .item.epic {
    border-color: rgba(148, 0, 211, 0.3);
    box-shadow: inset 0 0 0.3em rgba(148, 0, 211, 0.2);
  }

  .item.legendary {
    border-color: rgba(255, 165, 0, 0.3);
    box-shadow: inset 0 0 0.3em rgba(255, 165, 0, 0.2);
  }

  .item.mythic {
    border-color: rgba(255, 128, 255, 0.3);
    box-shadow: inset 0 0 0.4em rgba(255, 128, 255, 0.25);
  }

  .item-icon.resource {
    color: #228B22;
  }

  .item-icon.quest_item {
    color: #FF8C00;
  }

  .item-icon.artifact {
    color: #9932CC;
  }

  .item-icon.gem {
    color: #4169E1;
  }
  
  .item-icon.tool {
    color: #696969;
  }
  
  .item-icon.currency {
    color: #DAA520;
  }
  
  .item-icon.junk {
    color: #A9A9A9;
  }
  
  .item-icon.treasure {
    color: #FFD700;
  }

  /* Rarity styles for tags */
  .uncommon {
    background: rgba(30, 255, 0, 0.15);
    border: 1px solid rgba(30, 255, 0, 0.3);
    color: #228B22;
  }
  
  .rare {
    background: rgba(0, 112, 221, 0.15);
    border: 1px solid rgba(0, 112, 221, 0.3);
    color: #0070DD;
  }
  
  .epic {
    background: rgba(148, 0, 211, 0.15);
    border: 1px solid rgba(148, 0, 211, 0.3);
    color: #9400D3;
  }
  
  .legendary {
    background: rgba(255, 165, 0, 0.15);
    border: 1px solid rgba(255, 165, 0, 0.3);
    color: #FF8C00;
  }
  
  .mythic {
    background: rgba(255, 128, 255, 0.15);
    border: 1px solid rgba(255, 128, 255, 0.3);
    color: #FF1493;
  }

  /* Add styling for pending tick state */
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

  .ownership-tag {
    display: inline-block;
    background-color: var(--color-bright-accent);
    color: var(--color-dark-navy);
    font-size: 0.7em;
    padding: 0.1em 0.5em;
    border-radius: 0.3em;
    margin-left: 0.5em;
    font-weight: bold;
    vertical-align: middle;
  }
  
  .ownership-indicator {
    color: var(--color-bright-accent);
    font-weight: 500;
    margin-left: 0.3em;
  }
  
  .current-user {
    background-color: var(--color-bright-teal);
  }
</style>