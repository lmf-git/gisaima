<script>
  import { onMount, onDestroy } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { entities, targetStore } from '../../lib/stores/map';
  import { game, currentPlayer } from '../../lib/stores/game';
  
  // Import race icon components
  import Human from '../../components/icons/Human.svelte';
  import Elf from '../../components/icons/Elf.svelte';
  import Dwarf from '../../components/icons/Dwarf.svelte';
  import Goblin from '../../components/icons/Goblin.svelte';
  import Fairy from '../../components/icons/Fairy.svelte';
  
  // Props
  const { closing = false } = $props();
  
  // Format text for display
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  // Timer for updating countdown
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
    
    // Access the reactive store directly without storing in a constant
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
  
  // Get status class from status
  function getStatusClass(status) {
    return status || 'idle';
  }
</script>

<div class="entities-wrapper" class:closing>
  <div class="entities-panel" transition:fly|local={{ y: 200, duration: 500, easing: cubicOut }}>
    <h3 class="title">Units & Structures</h3>
    
    <div class="entities-content">
      {#if $targetStore?.structure}
        <div class="entities-section">
          <h4>Structure</h4>
          <div class="entity structure">
            <div class="entity-name">{$targetStore.structure.name || _fmt($targetStore.structure.type) || "Unknown"}</div>
            <div class="entity-info">
              {#if $targetStore.structure.faction}
                <div class="entity-faction">{_fmt($targetStore.structure.faction)}</div>
              {/if}
              {#if $targetStore.structure.type}
                <div class="entity-type">{_fmt($targetStore.structure.type)}</div>
              {/if}
            </div>
          </div>
        </div>
      {/if}
      
      {#if $targetStore?.players && $targetStore.players.length > 0}
        <div class="entities-section">
          <h4>Players ({$targetStore.players.length})</h4>
          {#each $targetStore.players as entity (entity.id)}
            <div class="entity player" class:current={entity.id === $currentPlayer?.uid}>
              <div class="entity-race-icon">
                {#if entity.race?.toLowerCase() === 'human'}
                  <Human extraClass="race-icon-entity" />
                {:else if entity.race?.toLowerCase() === 'elf'}
                  <Elf extraClass="race-icon-entity" />
                {:else if entity.race?.toLowerCase() === 'dwarf'}
                  <Dwarf extraClass="race-icon-entity" />
                {:else if entity.race?.toLowerCase() === 'goblin'}
                  <Goblin extraClass="race-icon-entity" />
                {:else if entity.race?.toLowerCase() === 'fairy'}
                  <Fairy extraClass="race-icon-entity" />
                {/if}
              </div>
              <div class="entity-info">
                <div class="entity-name">{entity.displayName || 'Player'}</div>
                {#if entity.race}
                  <div class="entity-race">{_fmt(entity.race)}</div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
      
      {#if $targetStore?.groups && $targetStore.groups.length > 0}
        <div class="entities-section">
          <h4>Groups ({$targetStore.groups.length})</h4>
          {#each $targetStore.groups as entity (entity.id)}
            <div class="entity group">
              <div class="entity-race-icon">
                {#if entity.race?.toLowerCase() === 'human'}
                  <Human extraClass="race-icon-entity" />
                {:else if entity.race?.toLowerCase() === 'elf'}
                  <Elf extraClass="race-icon-entity" />
                {:else if entity.race?.toLowerCase() === 'dwarf'}
                  <Dwarf extraClass="race-icon-entity" />
                {:else if entity.race?.toLowerCase() === 'goblin'}
                  <Goblin extraClass="race-icon-entity" />
                {:else if entity.race?.toLowerCase() === 'fairy'}
                  <Fairy extraClass="race-icon-entity" />
                {/if}
              </div>
              <div class="entity-info">
                <div class="entity-name">{entity.name || entity.id}</div>
                <div class="entity-details">
                  <span class="unit-count">{entity.unitCount || entity.units?.length || "?"} units</span>
                  {#if entity.status === 'mobilizing' && entity.readyAt}
                    <span class="status mobilizing">
                      Mobilizing: {formatTimeRemaining(entity.readyAt)}
                    </span>
                  {:else if entity.status === 'moving' && entity.moveStarted}
                    <span class="status moving">
                      Moving: {formatTimeRemaining(calculateMoveCompletionTime(entity))}
                    </span>
                  {:else if entity.status && entity.status !== 'idle'}
                    <span class="status {entity.status}">{_fmt(entity.status)}</span>
                  {:else}
                    <span class="status idle">Idle</span>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      
      {#if !$targetStore?.structure && (!$targetStore?.players || $targetStore.players.length === 0) && (!$targetStore?.groups || $targetStore.groups.length === 0)}
        <div class="empty-state">
          No entities at this location
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .entities-wrapper {
    position: absolute;
    bottom: 2.5em;
    left: .5em;
    z-index: 998;
    transition: opacity 0.2s ease;
    font-size: 1.2em;
    font-family: var(--font-body);
    max-width: 95%;
  }
  
  .entities-wrapper.closing {
    pointer-events: none;
  }
  
  .entities-panel {
    background-color: rgba(255, 255, 255, 0.85);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.3em;
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(0.5em);
    -webkit-backdrop-filter: blur(0.5em);
    width: 100%;
    max-width: 22.5em;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: reveal 0.4s ease-out forwards;
    transform-origin: bottom left;
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
  
  .title {
    margin: 0;
    padding: 0.8em 1em;
    font-size: 1.1em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.8);
    background-color: rgba(0, 0, 0, 0.05);
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    font-family: var(--font-heading);
  }
  
  .entities-content {
    padding: 0.8em;
    max-height: 60vh;
    overflow-y: auto;
  }
  
  .entities-section {
    margin-bottom: 1.2em;
  }
  
  .entities-section:last-child {
    margin-bottom: 0;
  }
  
  h4 {
    margin: 0 0 0.5em 0;
    font-size: 0.9em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .entity {
    display: flex;
    align-items: flex-start;
    margin-bottom: 0.6em;
    padding: 0.5em 0.7em;
    border-radius: 0.3em;
    background-color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  .entity:last-child {
    margin-bottom: 0;
  }
  
  .entity.player.current {
    background-color: rgba(66, 133, 244, 0.05);
    border-color: rgba(66, 133, 244, 0.3);
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
  }
  
  .entity-race {
    font-size: 0.85em;
    font-style: italic;
    color: rgba(0, 0, 0, 0.6);
  }
  
  .entity-faction {
    font-size: 0.85em;
    background-color: rgba(0, 0, 0, 0.06);
    padding: 0.1em 0.4em;
    border-radius: 0.2em;
    margin-right: 0.5em;
    display: inline-block;
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
    background: rgba(30, 144, 255, 0.15);
    border: 1px solid rgba(30, 144, 255, 0.3);
    color: #1e90ff;
  }
  
  .status.scouting {
    background: rgba(148, 0, 211, 0.15);
    border: 1px solid rgba(148, 0, 211, 0.3);
    color: #9400d3;
  }
  
  .status.stationed {
    background: rgba(128, 128, 128, 0.15);
    border: 1px solid rgba(128, 128, 128, 0.3);
    color: #696969;
  }
  
  .status.idle {
    background: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.6);
  }
  
  .empty-state {
    padding: 2em;
    text-align: center;
    color: rgba(0, 0, 0, 0.5);
    font-style: italic;
  }
  
  /* Fix for mobile screens */
  @media (max-width: 480px) {
    .entities-wrapper {
      left: 0.5em;
      right: 0.5em;
      bottom: 1em;
      font-size: 1em;
    }
    
    .entities-panel {
      max-width: 100%;
    }
    
    .entity-details {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.3em;
    }
  }
</style>
