<script>
  import { onDestroy } from 'svelte';
  
  import { currentPlayer } from '../../../lib/stores/game.js';
  import { targetStore } from '../../../lib/stores/map.js';

  import Logo from '../../Logo.svelte';

  import Close from '../../icons/Close.svelte';
  import Eye from '../../icons/Eye.svelte';
  import Rally from '../../icons/Rally.svelte';
  import Compass from '../../icons/Compass.svelte';
  import Sword from '../../icons/Sword.svelte';
  import Hammer from '../../icons/Hammer.svelte';
  import Crop from '../../icons/Crop.svelte';
  import Structure from '../../icons/Structure.svelte';
  import Info from '../../icons/Info.svelte';
  import Horn from '../../icons/Horn.svelte';
  
  

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
  function canMobilize() {
    if (!currentTileData || !$currentPlayer) return false;
    
    // Check if player is on the tile
    const playerOnTile = currentTileData.players?.some(p => p.id === $currentPlayer.id);
    
    // Check if player is not already in a mobilizing/demobilising group
    const inProcessGroup = currentTileData.groups?.some(g => 
      (g.status === 'mobilizing' || g.status === 'demobilising') && 
      g.owner === $currentPlayer.id
    );
    
    return playerOnTile && !inProcessGroup;
  }
  
  function canDemobilize() {
    if (!currentTileData || !$currentPlayer || !currentTileData.structure) return false;
    
    // Check if there are any player-owned groups that are idle
    return currentTileData.groups?.some(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle'
    );
  }
  
  // Add canBuild function to check for player-owned idle groups
  function canBuild() {
    if (!currentTileData || !$currentPlayer) return false;
    
    // Can only build if player has at least one idle group on the tile
    return !currentTileData?.structure && currentTileData.groups?.some(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle'
    );
  }
  
  function canMove() {
    if (!currentTileData || !$currentPlayer) return false;
    
    // Check if there are any player-owned groups that are idle
    return currentTileData.groups?.some(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle'
    );
  }
  
  function canAttack() {
    if (!currentTileData || !$currentPlayer) return false;
    
    // Check if there are any player-owned groups that are idle
    const playerGroups = currentTileData.groups?.filter(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle'
    );
    
    // Check if there are any enemy groups on the tile
    // Now includes idle, gathering, building, and moving status
    const enemyGroups = currentTileData.groups?.filter(g => 
      g.owner !== $currentPlayer.id && 
      (g.status === 'idle' || g.status === 'gathering' || g.status === 'building' || g.status === 'moving')
    );
    
    // Can attack if player has at least one group and there's at least one enemy group
    return playerGroups?.length > 0 && enemyGroups?.length > 0;
  }
  
  function canGather() {
    if (!currentTileData || !$currentPlayer) return false;
    
    // Check if player is in an idle group
    const playerInIdleGroup = currentTileData.groups?.some(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle'
    );
    
    // Can gather if player is in an idle group
    return playerInIdleGroup;
  }
  
  function canJoinBattle() {
    if (!currentTileData || !$currentPlayer) return false;
    
    // Check if there's battle and player has idle groups
    return currentTileData.battles?.length > 0 &&
           currentTileData.groups?.some(g => 
             g.owner === $currentPlayer.id && 
             g.status === 'idle'
           );
  }

  function canCraft() {
    if (!currentTileData || !$currentPlayer) return false;
    
    // Check if player is at a structure
    const hasStructure = !!currentTileData.structure;
    const playerOnTile = currentTileData.players?.some(p => p.id === $currentPlayer.id);
    
    // Check if player is in an idle group
    const playerInIdleGroup = currentTileData.groups?.some(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle'
    );
    
    // Can craft if player is at a structure OR in an idle group
    return (hasStructure && playerOnTile) || playerInIdleGroup;
  }

  // Add function to check if recruitment is possible
  function canRecruit() {
    if (!currentTileData || !$currentPlayer || !currentTileData.structure) return false;
    
    // Player must be on tile as an entity
    const playerOnTile = currentTileData.players?.some(p => p.id === $currentPlayer.id);
    
    // Check if player is in ANY group (not just mobilizing/demobilizing)
    const isInAnyGroup = currentTileData.groups?.some(g => 
      g.owner === $currentPlayer.id || 
      (g.members && g.members[$currentPlayer.id]) ||
      (g.memberIds && Array.isArray(g.memberIds) && g.memberIds.includes($currentPlayer.id))
    );
    
    // Check if player is on tile but not in any group
    return playerOnTile && !isInAnyGroup;
  }

  // Define all possible actions
  const allActions = [
    { id: 'details', label: 'Details', icon: Info, condition: () => true }, // Always show details
    { id: 'inspect', label: 'Inspect', icon: Eye, condition: () => currentTileData?.structure },
    { id: 'build', label: 'Build', icon: Hammer, condition: canBuild },
    { id: 'craft', label: 'Craft', icon: Hammer, condition: canCraft },
    { id: 'move', label: 'Move', icon: Compass, condition: canMove },
    { id: 'mobilise', label: 'Mobilise', icon: Rally, condition: canMobilize },
    { id: 'gather', label: 'Gather', icon: Crop, condition: canGather },
    { id: 'attack', label: 'Attack', icon: Sword, condition: canAttack },
    { id: 'demobilise', label: 'Demobilise', icon: Structure, condition: canDemobilize },
    { id: 'joinBattle', label: 'Join Battle', icon: Sword, condition: canJoinBattle },
    // Change Rally to Horn for the Recruit action
    { id: 'recruitment', label: 'Recruit', icon: Horn, condition: canRecruit }
  ];

  // Filter actions based on conditions
  const availableActions = $derived(
    currentTileData 
      ? allActions.filter(action => action.condition())
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
    
    // Special handling for inspect action to include tile data
    if (actionId === 'inspect' && currentTileData) {
      onAction(actionId, {
        x: currentTileData.x,
        y: currentTileData.y,
        tile: currentTileData
      });
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

  // VISIBILITY MANAGEMENT
  let isExiting = $state(false);
  let isVisible = $state(false);
  let exitTimeout;
  
  // Track which buttons are currently visible
  let visibleButtons = $state([]);
  
  // Simple handler for the close button - calls parent's onClose
  function handleClose() {
    // Simply call the parent's onClose handler
    // This will set isOpen to false, which will trigger our effect
    onClose();
  }
  
  // Watch isOpen prop changes to trigger animations
  $effect(() => {
    if (isOpen && !isVisible && !isExiting) {
      // Set component as visible immediately but start with no buttons
      isVisible = true;
      visibleButtons = [];
      
      // Add buttons one by one with staggered animation
      const showInterval = 80; // Same interval as removal for consistency
      
      // First add all action buttons in sequence
      for (let i = 0; i < totalItems - 1; i++) {
        setTimeout(() => {
          visibleButtons = [...visibleButtons, i];
        }, i * showInterval);
      }
      
      // Add the close button last
      setTimeout(() => {
        visibleButtons = [...Array(totalItems).keys()];
      }, (totalItems - 1) * showInterval);
      
    } else if (!isOpen && isVisible && !isExiting) {
      // Start closing animation
      isExiting = true;
      
      // Remove buttons in REVERSE sequence (last to first)
      let currentButtons = [...visibleButtons];
      const removeInterval = 80; // Time between button removals (ms)
      
      // Schedule removal of each action button in REVERSE order
      // Start from highest index (totalItems - 2) down to 0
      // We exclude the close button (totalItems - 1) which is removed separately
      for (let i = totalItems - 2; i >= 0; i--) {
        setTimeout(() => {
          if (currentButtons.includes(i)) {
            currentButtons = currentButtons.filter(btn => btn !== i);
            visibleButtons = currentButtons;
          }
        }, (totalItems - 2 - i) * removeInterval);
      }
      
      // Remove the close button last
      setTimeout(() => {
        visibleButtons = [];
        
        // Finally, hide the entire component
        setTimeout(() => {
          isVisible = false;
          isExiting = false;
        }, 100);
      }, (totalItems - 1) * removeInterval);
    }
  });

  // Clean up on component destroy
  onDestroy(() => {
    if (exitTimeout) clearTimeout(exitTimeout);
  });
</script>

{#if isVisible}
  <div 
    class="peek-container"
    role="dialog"
    aria-label="Quick actions menu"
  >
    <div class="action-circle">
      <!-- Render only visible buttons -->
      {#each allItems as item}
        <!-- Remove the conditional rendering but add a class based on visibility -->
        {#if item.type === 'action'}
          <button 
            class="action-button {item.action.id}-button {!visibleButtons.includes(item.index) ? 'hidden' : ''}" 
            style="--x:{item.position.x}em; --y:{item.position.y}em; --index:{item.index}; --total:{totalItems};"
            onclick={(e) => handleActionClick(item.action.id, e)}
          >
            {#if item.action.icon}
              <item.action.icon extraClass="action-icon" />
            {/if}
            <span class="action-label">{item.action.label}</span>
          </button>
        {:else if item.type === 'close'}
          <button 
            class="action-button close-button {!visibleButtons.includes(item.index) ? 'hidden' : ''}" 
            style="--x:{item.position.x}em; --y:{item.position.y}em; --index:{item.index}; --total:{totalItems};"
            onclick={handleClose}
          >
            {#if isExiting}
              <Logo extraClass="logo-icon" />
            {:else}
              <Close extraClass="close-icon" />
            {/if}
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
    border: 3px solid rgba(255, 255, 255, 0.9);
    pointer-events: auto;
    font-family: var(--font-body);
    transform: translate(calc(-50% + var(--x, 0em)), calc(-50% + var(--y, 0em)));
    transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275),
                opacity 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275),
                box-shadow 0.3s ease;
    will-change: transform;
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
  
  .peek-container :global(.action-icon) {
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
  
  :global(.logo-icon) {
    width: 2.2em;
    height: 2.2em;
    transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
  
  .action-button:hover :global(.close-icon),
  .action-button:hover :global(.logo-icon) {
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
  
  /* Add craft button styling with pinkish color */
  .craft-button {
    background-color: rgba(233, 30, 99, 0.65);
    border-color: rgba(233, 30, 99, 0.85);
    color: white;
  }

  /* Add recruitment button styling */
  .recruitment-button {
    background-color: rgba(156, 39, 176, 0.65);
    border-color: rgba(156, 39, 176, 0.85);
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
  
  /* Add hover effect for craft button */
  .craft-button:hover {
    background-color: rgba(233, 30, 99, 0.8);
  }

  /* Add hover effect for recruitment button */
  .recruitment-button:hover {
    background-color: rgba(156, 39, 176, 0.8);
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

  /* Add this new class for hidden buttons */
  .action-button.hidden {
    opacity: 0;
    transform: translate(calc(-50% + var(--x, 0em)), calc(-50% + var(--y, 0em))) scale(0.5);
    pointer-events: none;
  }
</style>
