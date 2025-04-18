<script>
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { targetStore, coordinates } from '../../lib/stores/map';
  import { game, currentPlayer, calculateNextTickTime, formatTimeUntilNextTick, timeUntilNextTick } from '../../lib/stores/game';
  
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
    onClose = () => {} 
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
    // Default mapping of factions to races for icon display
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
  
  import { onMount, onDestroy } from 'svelte';
</script>

<div class="details-wrapper">
  <div class="details-panel" transition:fly|local={{ y: 20, duration: 500, easing: cubicOut }}>
    <div class="header">
      <h3 class="title">Tile Details</h3>
      <div class="coords">{formatCoords(x, y)}</div>
      <button class="close-button" on:click={onClose} aria-label="Close">×</button>
    </div>
    
    <div class="details-content">
      <div class="section terrain-section">
        <h4 class="section-title">Terrain</h4>
        <div class="terrain-info">
          <div class="terrain-name">{_fmt(currentTile?.biome?.name || terrain)}</div>
          {#if currentTile?.terrain?.rarity && currentTile.terrain.rarity !== 'common'}
            <div class="terrain-rarity {currentTile.terrain.rarity}">
              {_fmt(currentTile.terrain.rarity)}
            </div>
          {/if}
        </div>
      </div>
      
      {#if currentTile?.structure}
        <div class="section structure-section">
          <h4 class="section-title">Structure</h4>
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
      
      {#if currentTile?.players?.length > 0}
        <div class="section players-section">
          <h4 class="section-title">Players ({currentTile.players.length})</h4>
          {#each currentTile.players as player}
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
      
      {#if currentTile?.groups?.length > 0}
        <div class="section groups-section">
          <h4 class="section-title">Groups ({currentTile.groups.length})</h4>
          {#each currentTile.groups as group}
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
      
      {#if currentTile?.items?.length > 0}
        <div class="section items-section">
          <h4 class="section-title">Items ({currentTile.items.length})</h4>
          {#each currentTile.items as item}
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
      
      {#if !currentTile?.structure && !currentTile?.players?.length && !currentTile?.groups?.length && !currentTile?.items?.length}
        <div class="empty-state">
          <p>No additional details available for this tile.</p>
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
    background-color: rgba(255, 255, 255, 0.85);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5em;
    box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.2);
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
    background-color: rgba(0, 0, 0, 0.05);
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  .title {
    flex: 1;
    margin: 0;
    font-size: 1.2em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.8);
    font-family: var(--font-heading);
  }
  
  .coords {
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.6);
    margin-right: 1em;
    font-weight: 500;
    font-family: var(--font-mono, monospace);
  }
  
  .close-button {
    background: none;
    border: none;
    color: rgba(0, 0, 0, 0.5);
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
  }
  
  .close-button:hover {
    color: rgba(0, 0, 0, 0.8);
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 50%;
  }
  
  .details-content {
    padding: 1em;
    max-height: calc(90vh - 4em);
    overflow-y: auto;
  }
  
  .section {
    margin-bottom: 1.5em;
    position: relative;
  }
  
  .section:last-child {
    margin-bottom: 0;
  }
  
  .section-title {
    margin: 0 0 0.5em 0;
    font-size: 1em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-family: var(--font-heading);
  }
  
  .terrain-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.3em;
    padding: 0.7em 1em;
  }
  
  .terrain-name {
    font-weight: 500;
    color: rgba(0, 0, 0, 0.85);
  }
  
  .terrain-rarity {
    font-size: 0.85em;
    padding: 0.1em 0.4em;
    border-radius: 0.3em;
    white-space: nowrap;
    font-weight: 500;
  }
  
  .terrain-rarity.uncommon {
    background: rgba(30, 255, 0, 0.15);
    border: 1px solid rgba(30, 255, 0, 0.3);
    color: #228B22;
  }
  
  .terrain-rarity.rare {
    background: rgba(0, 112, 221, 0.15);
    border: 1px solid rgba(0, 112, 221, 0.3);
    color: #0070DD;
  }
  
  .terrain-rarity.epic {
    background: rgba(148, 0, 211, 0.15);
    border: 1px solid rgba(148, 0, 211, 0.3);
    color: #9400D3;
  }
  
  .terrain-rarity.legendary {
    background: rgba(255, 165, 0, 0.15);
    border: 1px solid rgba(255, 165, 0, 0.3);
    color: #FF8C00;
  }
  
  .terrain-rarity.mythic {
    background: rgba(255, 128, 255, 0.15);
    border: 1px solid rgba(255, 128, 255, 0.3);
    color: #FF1493;
  }

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
  
  .entity:last-child {
    margin-bottom: 0;
  }
  
  .entity:hover {
    background-color: rgba(255, 255, 255, 0.8);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .entity-race-icon, .entity-structure-icon, .item-icon {
    margin-right: 0.7em;
    margin-top: 0.1em;
    flex-shrink: 0;
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
  
  .unit-count {
    color: rgba(0, 0, 0, 0.6);
  }
  
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
    color: #008000;
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
    color: #2d8659;
  }
  
  .status.idle {
    background: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.6);
  }
  
  .status.demobilising {
    background: rgba(147, 112, 219, 0.15);
    border: 1px solid rgba(147, 112, 219, 0.3);
    color: #8a2be2;
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
    padding: 0.1em 0.3em;
    border-radius: 0.2em;
    background-color: rgba(139, 0, 0, 0.07);
    border: 1px solid rgba(139, 0, 0, 0.15);
    color: #8B0000;
    white-space: nowrap;
    margin-left: 0.3em;
  }
  
  .battle-side-1 {
    background-color: rgba(0, 0, 255, 0.07);
    border: 1px solid rgba(0, 0, 255, 0.15);
    color: #00008B;
  }
  
  .battle-side-2 {
    background-color: rgba(139, 0, 0, 0.07);
    border: 1px solid rgba(139, 0, 0, 0.15);
    color: #8B0000;
  }
  
  .pending-tick {
    background: rgba(255, 215, 0, 0.2) !important;
    border-color: rgba(255, 215, 0, 0.5) !important;
    color: #b8860b !important;
    animation: pulseWaiting 1s infinite alternate !important;
  }
  
  .empty-state {
    padding: 1em;
    text-align: center;
    color: rgba(0, 0, 0, 0.5);
    font-style: italic;
  }
  
  .item-icon {
    width: 1.4em;
    height: 1.4em;
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

  .item-icon.gem::before {
    content: '◆';
    font-size: 0.9em;
    color: #4169E1;
    background: none;
  }

  .item-icon.tool::before {
    content: '⚒';
    font-size: 0.8em;
    color: #696969;
    background: none;
  }

  .item-icon.currency::before {
    content: '⚜';
    font-size: 0.8em;
    color: #DAA520;
    background: none;
  }

  .item-icon.junk::before {
    content: '✽';
    font-size: 0.9em;
    color: #A9A9A9;
    background: none;
  }

  .item-icon.treasure::before {
    content: '❖';
    font-size: 0.9em;
    color: #FFD700;
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

  .item-count {
    color: #2d8659;
    font-weight: 500;
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
    
    .details-content {
      padding: 0.8em;
    }
    
    .entity-details {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.3em;
    }
  }
</style>