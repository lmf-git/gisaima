<script>
  import { scale, fly } from 'svelte/transition';
  import { elasticOut, cubicOut } from 'svelte/easing';
  import { currentPlayer } from '../../lib/stores/game.js';
  import { targetStore } from '../../lib/stores/map.js';
  import Close from '../icons/Close.svelte';
  import Eye from '../icons/Eye.svelte';
  import Rally from '../icons/Rally.svelte';
  import Compass from '../icons/Compass.svelte';
  import Attack from '../icons/Attack.svelte';
  import Hammer from '../icons/Hammer.svelte';
  import Crop from '../icons/Crop.svelte';
  import Structure from '../icons/Structure.svelte';
  import Torch from '../icons/Torch.svelte';
  import Info from '../icons/Info.svelte';

  // Define props with simplified approach
  const {
    onClose = (() => {}),
    onAction = (() => {}),
    onShowDetails = (() => {}),
    isOpen = false
  } = $props();
  
  // Access current tile data for action display
  const currentTileData = $derived($targetStore);

  // Fixed set of actions - always show these core actions
  const availableActions = [
    { id: 'details', label: 'Details', icon: Info },
    { id: 'build', label: 'Build', icon: Hammer },
    { id: 'move', label: 'Move', icon: Compass },
    { id: 'mobilise', label: 'Mobilise', icon: Rally },
    { id: 'gather', label: 'Gather', icon: Crop },
    { id: 'attack', label: 'Attack', icon: Attack }
  ];

  // Add inspect action if there's a structure
  $effect(() => {
    if (isOpen && currentTileData?.structure) {
      // Add inspect action at the beginning if there's a structure
      if (!availableActions.some(a => a.id === 'inspect')) {
        availableActions.unshift({ id: 'inspect', label: 'Inspect', icon: Eye });
      }
    }
  });

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

  // Create a combined array with all items including the close button for animation sequencing
  const allItems = $derived([
    ...availableActions.map((action, index) => ({
      type: 'action',
      action,
      position: calculatePosition(index, totalItems),
      index
    })),
    {
      type: 'close',
      position: closePosition,
      index: availableActions.length
    }
  ]);

  function handleActionClick(actionId, event) {
    // Prevent event from bubbling to parent elements
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    
    // Special handling for details action
    if (actionId === 'details') {
      handleShowDetails(event);
      return;
    }
    
    onAction(actionId);
  }
  
  function handleShowDetails(event) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    
    onShowDetails();
    onClose(); // Also close the peek view
  }

  // Custom transition function that ensures proper staggering
  function staggeredFly(node, { delay = 0, duration = 300, y = 20 }) {
    return {
      delay,
      duration,
      css: t => `
        opacity: ${t};
        transform: translate(calc(-50% + var(--x, 0em)), calc(-50% + var(--y, 0em) + ${(1 - t) * y}px));
      `
    };
  }
</script>

{#if isOpen}
  <div 
    class="peek-container"
    role="dialog"
    aria-label="Quick actions menu"
    transition:scale={{
      duration: 300,
      easing: elasticOut,
      start: 0.5,
      opacity: 0
    }}
  >
    <div class="action-circle">
      <!-- Render all items in sequence for consistent animation -->
      {#each allItems as item}
        {#if item.type === 'action'}
          <button 
            class="action-button {item.action.id}-button" 
            style="--x:{item.position.x}em; --y:{item.position.y}em;"
            onclick={(e) => handleActionClick(item.action.id, e)}
            use:staggeredFly={{ delay: 100 * item.index, duration: 300 }}
            out:staggeredFly={{ delay: 100 * (totalItems - item.index - 1), duration: 300 }}
          >
            {#if item.action.icon}
              <item.action.icon />
            {/if}
            <span class="action-label">{item.action.label}</span>
          </button>
        {:else if item.type === 'close'}
          <button 
            class="action-button close-button" 
            style="--x:{item.position.x}em; --y:{item.position.y}em;"
            onclick={onClose}
            use:staggeredFly={{ delay: 100 * item.index, duration: 300 }}
            out:staggeredFly={{ delay: 100 * (totalItems - item.index - 1), duration: 300 }}
          >
            <Close extraClass="close-icon" />
          </button>
        {/if}
      {/each}
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
    padding: 0.4em;
    border-radius: 50%;
    width: 4.6em;
    height: 4.6em;
    background-color: rgba(255, 255, 255, 0.97);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    transition: box-shadow 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275),
                border-color 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    border: 3px solid rgba(255, 255, 255, 0.9);
    pointer-events: auto;
    font-family: var(--font-body);
  }
  
  .action-button:hover {
    /* No scale transform, just enhanced shadow */
    box-shadow: 0 5px 14px rgba(0, 0, 0, 0.45);
    border-color: currentColor; /* Uses the color of the button */
  }
  
  .action-button:active {
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.4);
  }
  
  .action-label {
    font-size: 0.9em; /* Base size */
    margin-top: 0.25em;
    color: white; /* Changed to white */
    font-weight: 700;
    white-space: nowrap;
    transition: font-size 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
  
  .action-button:hover .action-label {
    font-size: 1.05em; /* Grow text on hover */
  }
  
  :global(.action-icon) {
    width: 1.8em;
    height: 1.8em;
    fill: white; /* Changed to white */
    stroke: white; /* For outlined icons */
    transition: width 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), 
                height 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }

  .action-button:hover :global(.action-icon) {
    width: 2.2em; /* Grow icon width on hover */
    height: 2.2em; /* Grow icon height on hover */
  }

  :global(.close-icon) {
    width: 2em;
    height: 2em;
  }
  
  .action-button:hover :global(.close-icon) {
    width: 2.4em;
    height: 2.4em;
  }
  
  /* Style different action types with better contrast colors */
  .inspect-button {
    background-color: rgba(33, 150, 243, 0.65);
    border-color: rgba(33, 150, 243, 0.85);
    color: white;
  }
  
  .mobilise-button {
    background-color: rgba(63, 81, 181, 0.65);
    border-color: rgba(63, 81, 181, 0.85);
    color: white;
  }
  
  .move-button {
    background-color: rgba(76, 175, 80, 0.65);
    border-color: rgba(76, 175, 80, 0.85);
    color: white;
  }
  
  .attack-button {
    background-color: rgba(244, 67, 54, 0.65);
    border-color: rgba(244, 67, 54, 0.85);
    color: white;
  }
  
  .build-button {
    background-color: rgba(121, 85, 72, 0.65);
    border-color: rgba(121, 85, 72, 0.85);
    color: white;
  }
  
  .gather-button {
    background-color: rgba(255, 193, 7, 0.65);
    border-color: rgba(255, 193, 7, 0.85);
    color: white;
  }
  
  .demobilise-button {
    background-color: rgba(0, 150, 136, 0.65);
    border-color: rgba(0, 150, 136, 0.85);
    color: white;
  }
  
  .close-button {
    background-color: rgba(117, 117, 117, 0.65);
    border-color: rgba(117, 117, 117, 0.85);
    color: white;
  }
  
  .details-button {
    background-color: rgba(90, 200, 250, 0.65);
    border-color: rgba(90, 200, 250, 0.85);
    color: white;
  }
  
  /* Specific hover effects for each button type */
  .inspect-button:hover {
    background-color: rgba(33, 150, 243, 0.8);
  }
  
  .mobilise-button:hover {
    background-color: rgba(63, 81, 181, 0.8);
  }
  
  .move-button:hover {
    background-color: rgba(76, 175, 80, 0.8);
  }
  
  .attack-button:hover {
    background-color: rgba(244, 67, 54, 0.8);
  }
  
  .build-button:hover {
    background-color: rgba(121, 85, 72, 0.8);
  }
  
  .gather-button:hover {
    background-color: rgba(255, 193, 7, 0.8);
  }
  
  .demobilise-button:hover {
    background-color: rgba(0, 150, 136, 0.8);
  }
  
  .close-button:hover {
    background-color: rgba(117, 117, 117, 0.8);
  }
  
  .details-button:hover {
    background-color: rgba(90, 200, 250, 0.8);
  }
</style>
