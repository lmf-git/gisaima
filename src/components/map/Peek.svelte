<script>
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
  import { onDestroy } from 'svelte';

  // Define props with simplified approach
  const {
    onClose = (() => {}),
    onAction = (() => {}),
    onShowDetails = (() => {}),
    isOpen = false
  } = $props();
  
  // Access current tile data for action display
  const currentTileData = $derived($targetStore);

  // Check functions for action availability - similar to Details.svelte
  function canMobilize(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if player is on the tile
    const playerOnTile = tile.players?.some(p => p.id === $currentPlayer.id);
    
    // Check if player is not already in a mobilizing/demobilising group
    const inProcessGroup = tile.groups?.some(g => 
      (g.status === 'mobilizing' || g.status === 'demobilising') && 
      g.owner === $currentPlayer.id
    );
    
    return playerOnTile && !inProcessGroup;
  }
  
  function canDemobilize(tile) {
    if (!tile || !$currentPlayer || !tile.structure) return false;
    
    // Check if there are any player-owned groups that are idle
    return tile.groups?.some(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle' &&
      !g.inBattle
    );
  }
  
  function canMove(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if there are any player-owned groups that are idle
    return tile.groups?.some(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle' &&
      !g.inBattle
    );
  }
  
  function canAttack(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if there are any player-owned groups that are idle
    const playerGroups = tile.groups?.filter(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle' &&
      !g.inBattle
    );
    
    // Check if there are any enemy groups on the tile
    const enemyGroups = tile.groups?.filter(g => 
      g.owner !== $currentPlayer.id && 
      g.status === 'idle' &&
      !g.inBattle
    );
    
    // Can attack if player has at least one group and there's at least one enemy group
    return playerGroups?.length > 0 && enemyGroups?.length > 0;
  }
  
  function canGather(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Only check if there are any player-owned groups that are idle and not in battle
    return tile.groups?.some(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle' &&
      !g.inBattle
    ) && 
    // And there are items to gather
    tile.items?.length > 0;
  }
  
  function canJoinBattle(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if there's battle and player has idle groups
    return tile.battles?.length > 0 &&
           tile.groups?.some(g => 
             g.owner === $currentPlayer.id && 
             g.status === 'idle' &&
             !g.inBattle
           );
  }

  // Define all possible actions
  const allActions = [
    { id: 'details', label: 'Details', icon: Info, condition: () => true }, // Always show details
    { id: 'inspect', label: 'Inspect', icon: Eye, condition: (tile) => tile?.structure },
    { id: 'build', label: 'Build', icon: Hammer, condition: () => true }, // Always allow build option
    { id: 'move', label: 'Move', icon: Compass, condition: canMove },
    { id: 'mobilise', label: 'Mobilise', icon: Rally, condition: canMobilize },
    { id: 'gather', label: 'Gather', icon: Crop, condition: canGather },
    { id: 'attack', label: 'Attack', icon: Attack, condition: canAttack },
    { id: 'demobilise', label: 'Demobilise', icon: Structure, condition: canDemobilize },
    { id: 'joinBattle', label: 'Join Battle', icon: Attack, condition: canJoinBattle }
  ];

  // Filter actions based on conditions
  const availableActions = $derived(
    currentTileData 
      ? allActions.filter(action => action.condition(currentTileData))
      : [allActions[0]] // Always show at least the details button
  );

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

  // Added for exit animation tracking
  let isExiting = false;
  let exitTimeout;

  // Handle close with animation
  function handleClose() {
    isExiting = true;
    exitTimeout = setTimeout(() => {
      onClose();
      isExiting = false;
    }, 400);
  }

  // Clean up on component destroy
  onDestroy(() => {
    if (exitTimeout) clearTimeout(exitTimeout);
  });
</script>

{#if isOpen}
  <div 
    class="peek-container"
    class:exiting={isExiting}
    role="dialog"
    aria-label="Quick actions menu"
  >
    <div class="action-circle">
      <!-- Render all items in sequence for consistent animation -->
      {#each allItems as item}
        {#if item.type === 'action'}
          <button 
            class="action-button {item.action.id}-button" 
            style="--x:{item.position.x}em; --y:{item.position.y}em; --index:{item.index}; --total:{totalItems};"
            on:click={(e) => handleActionClick(item.action.id, e)}
          >
            {#if item.action.icon}
              <item.action.icon extraClass="action-icon" />
            {/if}
            <span class="action-label">{item.action.label}</span>
          </button>
        {:else if item.type === 'close'}
          <button 
            class="action-button close-button" 
            style="--x:{item.position.x}em; --y:{item.position.y}em; --index:{item.index}; --total:{totalItems};"
            on:click={handleClose}
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
    animation: container-in 300ms cubic-bezier(0.5, 0, 0.25, 1.5) forwards;
  }
  
  .peek-container.exiting {
    animation: container-out 300ms cubic-bezier(0.5, 0, 0.25, 1.5) forwards;
  }
  
  @keyframes container-in {
    0% {
      transform: translate(-50%, -50%) scale(0.5);
      opacity: 0;
    }
    100% {
      transform: translate(-50%, -50%) scale(1);
      opacity: 1;
    }
  }
  
  @keyframes container-out {
    0% {
      transform: translate(-50%, -50%) scale(1);
      opacity: 1;
    }
    100% {
      transform: translate(-50%, -50%) scale(0.5);
      opacity: 0;
    }
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
    border: 3px solid rgba(255, 255, 255, 0.9);
    pointer-events: auto;
    font-family: var(--font-body);
    
    /* CSS animation for staggered entry */
    opacity: 0;
    transform: translate(calc(-50% + var(--x, 0em)), calc(-50% + var(--y, 0em) + 20px));
    animation: action-in 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    animation-delay: calc(var(--index) * 100ms);
  }
  
  .peek-container.exiting .action-button {
    animation: action-out 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    animation-delay: calc((var(--total) - var(--index) - 1) * 50ms);
  }
  
  @keyframes action-in {
    0% {
      opacity: 0;
      transform: translate(calc(-50% + var(--x, 0em)), calc(-50% + var(--y, 0em) + 20px));
    }
    100% {
      opacity: 1;
      transform: translate(calc(-50% + var(--x, 0em)), calc(-50% + var(--y, 0em)));
    }
  }
  
  @keyframes action-out {
    0% {
      opacity: 1;
      transform: translate(calc(-50% + var(--x, 0em)), calc(-50% + var(--y, 0em)));
    }
    100% {
      opacity: 0;
      transform: translate(calc(-50% + var(--x, 0em)), calc(-50% + var(--y, 0em) + 20px));
      pointer-events: none; /* Disable pointer events while fading out */
    }
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
