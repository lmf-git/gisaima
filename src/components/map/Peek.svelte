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

  // Props
  const { 
    onClose = () => {},
    onAction = () => {},
    isOpen = false,
    actions = []
  } = $props();

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
            <action.icon extraClass="action-icon" />
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
        <Close extraClass="action-icon" />
        <span class="action-label">Close</span>
      </button>
      
      <!-- Center indicator -->
      <div class="center-indicator"></div>
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
  
  .center-indicator {
    position: absolute;
    width: 1.5em;
    height: 1.5em;
    border-radius: 50%;
    background-color: rgba(255, 255, 255, 0.8);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.8), 
                0 0 20px rgba(255, 255, 255, 0.5);
    z-index: 2;
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
    width: 4em;
    height: 4em;
    background-color: rgba(255, 255, 255, 0.9);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    cursor: pointer;
    transition: all 0.2s ease;
    border: 2px solid rgba(255, 255, 255, 0.6);
    pointer-events: auto;
    font-family: var(--font-body);
  }
  
  .action-button:hover {
    transform: translate(calc(-50% + var(--x, 0em)), calc(-50% + var(--y, 0em))) scale(1.1);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
  }
  
  .action-label {
    font-size: 0.7em;
    margin-top: 0.3em;
    color: rgba(0, 0, 0, 0.8);
    font-weight: 500;
    white-space: nowrap;
  }
  
  :global(.action-icon) {
    width: 1.2em;
    height: 1.2em;
    fill: rgba(0, 0, 0, 0.8);
  }
  
  /* Style different action types */
  .inspect-button {
    background-color: rgba(33, 150, 243, 0.15);
    border-color: rgba(33, 150, 243, 0.5);
  }
  
  .mobilise-button {
    background-color: rgba(63, 81, 181, 0.15);
    border-color: rgba(63, 81, 181, 0.5);
  }
  
  .move-button {
    background-color: rgba(76, 175, 80, 0.15);
    border-color: rgba(76, 175, 80, 0.5);
  }
  
  .attack-button {
    background-color: rgba(244, 67, 54, 0.15);
    border-color: rgba(244, 67, 54, 0.5);
  }
  
  .build-button {
    background-color: rgba(121, 85, 72, 0.15);
    border-color: rgba(121, 85, 72, 0.5);
  }
  
  .gather-button {
    background-color: rgba(255, 193, 7, 0.15);
    border-color: rgba(255, 193, 7, 0.5);
  }
  
  .demobilise-button {
    background-color: rgba(0, 150, 136, 0.15);
    border-color: rgba(0, 150, 136, 0.5);
  }
  
  .close-button {
    background-color: rgba(158, 158, 158, 0.15);
    border-color: rgba(158, 158, 158, 0.5);
  }
</style>
