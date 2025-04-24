<script>
  import { fly, scale } from 'svelte/transition';
  import { elasticOut } from 'svelte/easing';
  import Close from '../icons/Close.svelte';
  import Eye from '../icons/Eye.svelte';
  import Rally from '../icons/Rally.svelte';
  import Compass from '../icons/Compass.svelte';
  import Attack from '../icons/Attack.svelte';
  import Hammer from '../icons/Hammer.svelte';
  import Crop from '../icons/Crop.svelte';
  import Structure from '../icons/Structure.svelte';

  // Props with improved defaults using runes
  const { 
    onClose = () => {},
    onAction = () => {},
    isOpen = false,
    actions = [],
    tileData = null
  } = $props();

  // Use derived values for action rendering logic
  // Default actions if none provided
  const availableActions = $derived(actions.length > 0 ? actions : [
    { id: 'inspect', label: 'Inspect', icon: Eye },
    { id: 'mobilise', label: 'Mobilise', icon: Rally },
    { id: 'move', label: 'Move', icon: Compass },
    { id: 'attack', label: 'Attack', icon: Attack },
    { id: 'build', label: 'Build', icon: Hammer },
    { id: 'gather', label: 'Gather', icon: Crop },
    { id: 'demobilise', label: 'Demobilise', icon: Structure }
  ]);

  // Include close button as part of the circle
  const totalItems = $derived(availableActions.length + 1); // +1 for close button
  
  // Calculate positions in a circle for each action
  function calculatePosition(index, total) {
    const radius = 6; // em units
    const angleStep = (2 * Math.PI) / total;
    const angle = index * angleStep - Math.PI / 2; // Start from top (-90 degrees)
    
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  }
  
  // Calculate close button position
  const closePosition = $derived(calculatePosition(availableActions.length, totalItems));

  function handleActionClick(actionId) {
    onAction(actionId);
    onClose();
  }
</script>

{#if isOpen}
  <div 
    class="peek-container" 
    transition:scale|local={{ duration: 300, start: 0.5, opacity: 0, easing: elasticOut }}
    role="dialog"
    aria-label="Quick actions menu"
  >
    <div class="action-circle">
      <!-- Actions in a circle -->
      {#each availableActions as action, index}
        {@const position = calculatePosition(index, totalItems)}
        <button 
          class="action-button {action.id}-button" 
          style="transform: translate({position.x}em, {position.y}em);"
          onclick={() => handleActionClick(action.id)}
          aria-label={action.label}
          transition:fly|local={{ delay: 50 * index, duration: 300, y: 20, opacity: 0 }}
        >
          {#if action.icon}
            <svelte:component this={action.icon} extraClass="action-icon" />
          {/if}
          <span class="action-label">{action.label}</span>
        </button>
      {/each}
      
      <!-- Close button -->
      <button 
        class="action-button close-button" 
        style="transform: translate({closePosition.x}em, {closePosition.y}em);"
        onclick={onClose}
        aria-label="Close menu"
        transition:fly|local={{ delay: 50 * availableActions.length, duration: 300, y: 20, opacity: 0 }}
      >
        <Close extraClass="action-icon close-icon" />
      </button>
    </div>
  </div>
{/if}

<style>
  .peek-container {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 20em;
    height: 20em;
    z-index: 800;
    pointer-events: none;
  }
  
  .action-circle {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    pointer-events: none;
  }
  
  .action-button {
    position: absolute;
    top: 50%;
    left: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0.6em;
    border-radius: 50%;
    width: 4.5em;  /* Increased from 4em */
    height: 4.5em; /* Increased from 4em */
    background-color: rgba(255, 255, 255, 0.95); /* Increased opacity */
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35); /* Enhanced shadow */
    cursor: pointer;
    transition: all 0.2s ease;
    border: 3px solid rgba(255, 255, 255, 0.8); /* Thicker more visible border */
    pointer-events: auto;
    font-family: var(--font-body);
  }
  
  .action-button:hover {
    transform: translate(calc(-50% + var(--x, 0em)), calc(-50% + var(--y, 0em))) scale(1.1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4); /* Enhanced hover shadow */
  }
  
  .action-label {
    font-size: 0.75em; /* Slightly larger */
    margin-top: 0.3em;
    color: rgba(0, 0, 0, 0.9); /* Darker text for better contrast */
    font-weight: 600; /* Bolder */
    white-space: nowrap;
  }
  
  :global(.action-icon) {
    width: 1.4em; /* Larger icons */
    height: 1.4em;
    fill: rgba(0, 0, 0, 0.9); /* Darker for better visibility */
  }

  :global(.close-icon) {
    width: 1.8em; /* Even larger close icon since it has no label */
    height: 1.8em;
  }
  
  /* Style different action types with more vibrant colors */
  .inspect-button {
    background-color: rgba(33, 150, 243, 0.25); /* More visible */
    border-color: rgba(33, 150, 243, 0.7);
  }
  
  .mobilise-button {
    background-color: rgba(63, 81, 181, 0.25);
    border-color: rgba(63, 81, 181, 0.7);
  }
  
  .move-button {
    background-color: rgba(76, 175, 80, 0.25);
    border-color: rgba(76, 175, 80, 0.7);
  }
  
  .attack-button {
    background-color: rgba(244, 67, 54, 0.25);
    border-color: rgba(244, 67, 54, 0.7);
  }
  
  .build-button {
    background-color: rgba(121, 85, 72, 0.25);
    border-color: rgba(121, 85, 72, 0.7);
  }
  
  .gather-button {
    background-color: rgba(255, 193, 7, 0.25);
    border-color: rgba(255, 193, 7, 0.7);
  }
  
  .demobilise-button {
    background-color: rgba(0, 150, 136, 0.25);
    border-color: rgba(0, 150, 136, 0.7);
  }
  
  .close-button {
    background-color: rgba(158, 158, 158, 0.25);
    border-color: rgba(158, 158, 158, 0.7);
  }
</style>
