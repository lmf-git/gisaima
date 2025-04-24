<script>
  import { onMount, onDestroy } from 'svelte';
  import { nextWorldTick, timeUntilNextTick, game } from '../../lib/stores/game.js';
  
  // Optional props with defaults
  const { 
    extraClass = '',
    showLabel = true,
    compact = false
  } = $props();
  
  // Local state variables
  let isPending = $state(false);
  let isProcessing = $state(false);
  let secondsRemaining = $state(0);
  let updateCounter = $state(0); // Forces reactivity on interval
  let intervalId;
  
  // Calculate if tick is pending or processing
  function updateTickState() {
    if (!$game.worldKey || !$game.worlds[$game.worldKey]) return;
    
    const now = Date.now();
    const world = $game.worlds[$game.worldKey];
    const lastTick = world.lastTick || now;
    const worldSpeed = world.speed || 1;
    
    // Base tick interval (1 minute) adjusted for world speed
    const baseTickInterval = 60000;
    const adjustedInterval = Math.round(baseTickInterval / worldSpeed);
    
    // Time since last tick
    const timeSinceLastTick = now - lastTick;
    
    // Time until next expected tick
    const expectedNextTick = lastTick + adjustedInterval;
    const timeRemaining = expectedNextTick - now;
    
    // We're in "processing" state when more time has passed than the expected interval
    isProcessing = timeSinceLastTick > adjustedInterval;
    
    // We're in "pending" state when we're within 5 seconds of the next expected tick
    isPending = timeRemaining < 5000 && timeRemaining >= 0;
    
    // Calculate seconds for display
    secondsRemaining = Math.max(0, Math.ceil(timeRemaining / 1000));
  }
  
  // Format time for display
  function formatTimeDisplay() {
    if (!$game.worldKey || !$game.worlds[$game.worldKey]) return "Unknown";
    
    updateCounter; // Keep reactive dependency on the counter
    
    const world = $game.worlds[$game.worldKey];
    const now = Date.now();
    const lastTick = world.lastTick || now;
    const worldSpeed = world.speed || 1;
    
    // Check if we're in processing state
    if (isProcessing) return "Processing";
    
    // If we're within a minute, show seconds countdown
    const baseTickInterval = 60000; 
    const adjustedInterval = Math.round(baseTickInterval / worldSpeed);
    const expectedNextTick = lastTick + adjustedInterval;
    const timeRemaining = expectedNextTick - now;
    
    if (timeRemaining <= 60000) {
      return `${Math.max(0, Math.ceil(timeRemaining / 1000))}s`;
    }
    
    // Otherwise use the store's formatted time
    return $timeUntilNextTick;
  }
  
  // Set up interval timer to update every second
  onMount(() => {
    updateTickState(); // Initial update
    intervalId = setInterval(() => {
      updateTickState();
      updateCounter++; // Force reactivity
    }, 1000);
  });
  
  // Clean up interval on component destruction
  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
  });
</script>

<div class="next-tick-container {extraClass}" class:compact={compact} class:pending={isPending} class:processing={isProcessing}>
  {#if showLabel}
    <span class="next-tick-label">Next tick:</span>
  {/if}
  
  <span class="next-tick-time">
    {#if isProcessing}
      <span class="spinner"></span> Processing
    {:else if isPending}
      <span class="spinner"></span> {secondsRemaining}s
    {:else}
      {formatTimeDisplay()}
    {/if}
  </span>
  
  {#if !compact && $game.worlds[$game.worldKey]?.speed && $game.worlds[$game.worldKey].speed !== 1.0}
    <span class="speed-indicator">
      {$game.worlds[$game.worldKey].speed}x
    </span>
  {/if}
</div>

<style>
  .next-tick-container {
    display: flex;
    align-items: center;
    gap: 0.4em;
    font-size: 0.9em;
    background-color: rgba(255, 255, 255, 0.85);
    border-radius: 0.3em;
    padding: 0.3em 0.6em;
    color: rgba(0, 0, 0, 0.85);
    font-family: var(--font-body);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    transition: background-color 0.3s, box-shadow 0.3s;
    min-width: 5em;
  }
  
  .next-tick-container.compact {
    font-size: 0.8em;
    padding: 0.25em 0.5em;
    min-width: 3em;
  }

  .next-tick-container.pending {
    background-color: rgba(255, 230, 190, 0.9);
    animation: pulse 1.5s infinite alternate;
  }
  
  .next-tick-container.processing {
    background-color: rgba(255, 190, 170, 0.9);
    animation: pulse 1s infinite alternate;
  }

  @keyframes pulse {
    0% { box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1); }
    100% { box-shadow: 0 2px 8px rgba(255, 160, 0, 0.4); }
  }

  .next-tick-label {
    color: rgba(0, 0, 0, 0.7);
    white-space: nowrap;
  }

  .next-tick-time {
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.3em;
  }

  .speed-indicator {
    font-size: 0.8em;
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 0.3em;
    padding: 0.1em 0.4em;
    margin-left: 0.2em;
  }

  /* Spinner animation for pending state */
  .spinner {
    width: 1em;
    height: 1em;
    border: 0.12em solid rgba(0, 0, 0, 0.2);
    border-radius: 50%;
    border-top-color: rgba(0, 0, 0, 0.8);
    animation: spin 1s linear infinite;
    display: inline-block;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
