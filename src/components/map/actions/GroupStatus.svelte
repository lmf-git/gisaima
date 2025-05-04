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
  
  // Simplified function to determine if waiting for tick
  function isPendingTick(endTime) {
    if (!endTime) return false;
    const now = Date.now();
    return endTime <= now;
  }
  
  // Function to get the relevant endTime for the status
  function getStatusEndTime(group) {
    if (!group) return null;
    
    if (group.status === 'moving') {
      return group.nextMoveTime;
    } else if (group.status === 'gathering') {
      return 'GATHERING';
    } else {
      return 'Unkown';
    }
  }
  
  // Format time remaining for display
  function formatTimeRemaining(endTime) {
    if (!endTime) return '';
    
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
  
  // Calculate completion time for movement
  function calculateMoveCompletionTime(group) {
    if (!group || group.status !== 'moving' || !group.moveStarted) return null;
    
    // Use nextMoveTime from the server if available
    if (group.nextMoveTime) {
      return group.nextMoveTime;
    }
    
    // Basic calculation for estimated time
    const worldSpeed = 1.0; // Default if not available
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
  
  // Self-contained state for the component
  let currentTime = $state(Date.now());
  let tickTimer;
  
  // Create individual derived variables instead of an object
  let isPending = $derived(isPendingTick(getStatusEndTime(group)));
  let countdown = $derived(group.status === 'mobilizing' || group.status === 'demobilising' ? 
    $timeUntilNextTick : '');
  let moveTime = $derived(group.status === 'moving' ? 
    calculateMoveCompletionTime(group) : null);
  let gatherTime = $derived(group.status === 'gathering' ? 
    group.gatheringUntil : null);
  
  // Set up a timer to update the current time every second
  onMount(() => {
    // Update immediately once
    currentTime = Date.now();
    
    // Then set up interval
    tickTimer = setInterval(() => {
      currentTime = Date.now();
    }, 1000);
  });
  
  // Clean up timer when component is unmounted
  onDestroy(() => {
    if (tickTimer) clearInterval(tickTimer);
  });

  // Calculate gathering time countdown based on ticks remaining
  function getGatheringCountdown(group) {
    if (group.status !== 'gathering') return '';
    
    const ticksRemaining = group.gatheringTicksRemaining || 0;
    
    // If 0 or negative ticks, show pending message
    if (ticksRemaining <= 0) {
      return 'Pending';
    }
    
    // Use the timeUntilTick function to get formatted time for this many ticks
    return timeUntilTick(ticksRemaining);
  }
</script>

<span 
  class="entity-status-badge {getStatusClass(group.status)}"
  class:pending-tick={isPending}
>
  {#if group.status === 'starting_to_gather'}
    Preparing to gather
  {:else if group.status === 'mobilizing' || group.status === 'demobilising'}
    {_fmt(group.status)} {countdown}
  {:else if group.status === 'moving'}
    {_fmt(group.status)} 
    {#if !isPendingTick(group.nextMoveTime)}
      ({formatTimeRemaining(moveTime)})
    {/if}
  {:else if group.status === 'gathering'}
    {_fmt(group.status)} 
    {#if group.gatheringTicksRemaining}
      ({group.gatheringTicksRemaining} ticks - {getGatheringCountdown(group)})
    {:else}
      (Pending)
    {/if}
  {:else}
    {_fmt(group.status)}
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
  
  @keyframes pulse {
    from { opacity: 0.8; }
    to { opacity: 1; }
  }
</style>
