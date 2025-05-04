<script>
  import { onMount, onDestroy } from 'svelte';
  import { timeUntilNextTick, timeUntilTick } from '../../../lib/stores/game';

  // Props for the component
  const {
    group
  } = $props();
  
  // Format text for display
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Function to get status class 
  function getStatusClass(status) {
    return status || 'idle';
  }
  
  // Local state variables
  let updateCounter = $state(0); // Forces reactivity on interval
  let intervalId;
  
  // Simplified function to format time remaining
  function formatTime(endTime) {
    if (!endTime) return '';
    
    updateCounter; // React to counter updates
    
    const now = Date.now();
    const remaining = endTime - now;
    
    // If time has passed, show pending
    if (remaining <= 0) return 'Pending';
    
    // If less than a minute remains, show seconds
    if (remaining < 60000) {
      return `${Math.max(0, Math.ceil(remaining / 1000))}s`;
    }
    
    // Otherwise show minutes and seconds
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    return `${minutes}m ${seconds}s`;
  }
  
  // Simplified pending check
  function isPending(endTime) {
    if (!endTime) return false;
    updateCounter; // React to counter updates
    return Date.now() >= endTime;
  }

  // Set up interval timer to update every second
  onMount(() => {
    intervalId = setInterval(() => {
      updateCounter++; // Force reactivity
    }, 1000);
  });
  
  // Clean up interval on component destruction
  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
  });
  
  // Functions to get relevant time values for each status
  function getRelevantTime() {
    if (!group) return null;
    
    switch(group.status) {
      case 'moving':
        return group.nextMoveTime;
      case 'mobilizing':
      case 'demobilising':
        return null; // Will use nextTick instead
      default:
        return null;
    }
  }
  
  // Calculate if pending based on status
  let isPendingTick = $derived(isPending(getRelevantTime()));
  
  // Get status-specific time display
  function getStatusTimeDisplay() {
    if (!group) return '';
    
    switch(group.status) {
      case 'moving':
        const moveTime = group.nextMoveTime;
        return isPending(moveTime) ? 'Pending' : formatTime(moveTime);
      case 'mobilizing':
      case 'demobilising':
        return $timeUntilNextTick;
      case 'gathering':
        return timeUntilTick(group.gatheringTicksRemaining);
      default:
        return '?s';
    }
  }
</script>

<span 
  class="entity-status-badge {getStatusClass(group.status)}"
  class:pending-tick={isPendingTick}
>
  {_fmt(group.status)}
  
  {#if group.status === 'moving' || group.status === 'mobilizing' || group.status === 'demobilising'}
    <span class="time-display">
      {#if isPendingTick}
        <span class="spinner"></span>
      {:else}
        ({getStatusTimeDisplay()})
      {/if}
    </span>
  {:else if group.status === 'gathering' && group.gatheringTicksRemaining !== undefined}
    <span class="time-display">
      ({group.gatheringTicksRemaining} ticks - {getStatusTimeDisplay()})
    </span>
  {/if}
</span>

<style>
  .entity-status-badge {
    display: inline-block;
    font-size: 0.8em;
    font-weight: 500;
    padding: 0.1em 0.5em;
    border-radius: 0.3em;
    white-space: nowrap;
    text-transform: capitalize;
  }
  
  .entity-status-badge.idle {
    background: rgba(128, 128, 128, 0.15);
    border: 1px solid rgba(128, 128, 128, 0.3);
    color: rgba(0, 0, 0, 0.7);
  }
  
  .entity-status-badge.moving {
    background: rgba(0, 128, 0, 0.15);
    border: 1px solid rgba(0, 128, 0, 0.3);
    color: #006400;
  }
  
  .entity-status-badge.mobilizing {
    background: rgba(255, 140, 0, 0.15);
    border: 1px solid rgba(255, 140, 0, 0.3);
    color: #d06000;
  }
  
  .entity-status-badge.demobilising {
    background: rgba(138, 43, 226, 0.15);
    border: 1px solid rgba(138, 43, 226, 0.3);
    color: #6a1b9a;
  }
  
  .entity-status-badge.gathering {
    background: rgba(138, 43, 226, 0.15);
    border: 1px solid rgba(138, 43, 226, 0.3);
    color: #8a2be2;
  }
  
  .entity-status-badge.fighting {
    background: rgba(220, 20, 60, 0.15);
    border: 1px solid rgba(220, 20, 60, 0.3);
    color: #c62828;
  }
  
  .entity-status-badge.active {
    background: rgba(255, 0, 0, 0.15);
    border: 1px solid rgba(255, 0, 0, 0.3);
    color: #d32f2f;
  }
  
  .entity-status-badge.resolved {
    background: rgba(0, 128, 0, 0.15);
    border: 1px solid rgba(0, 128, 0, 0.3);
    color: #2e7d32;
  }
  
  .entity-status-badge.pending-tick {
    position: relative;
    animation: pulse 1s infinite alternate;
  }
  
  .entity-status-badge.pending-tick::after {
    content: '↻';
    margin-left: 0.3em;
    font-weight: bold;
  }
  
  .time-display {
    display: inline-flex;
    align-items: center;
    margin-left: 0.3em;
  }
  
  .spinner {
    width: 0.8em;
    height: 0.8em;
    border: 0.12em solid rgba(0, 0, 0, 0.2);
    border-radius: 50%;
    border-top-color: rgba(0, 0, 0, 0.8);
    animation: spin 1s linear infinite;
    display: inline-block;
    margin-right: 0.3em;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  @keyframes pulse {
    from { opacity: 0.8; }
    to { opacity: 1; }
  }
</style>
