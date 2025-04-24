<script>
  import { fly, scale } from 'svelte/transition';
  import { elasticOut } from 'svelte/easing';
  import { get } from 'svelte/store';
  import { currentPlayer } from '../../lib/stores/game.js';
  import { targetStore, highlightedStore } from '../../lib/stores/map.js';
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

  // Props with improved defaults using runes
  const { 
    onClose = () => {},
    onAction = () => {},
    onShowDetails = () => {}, // Prop to handle opening details view
    isOpen = false,
    actions = [],
    tileData = null
  } = $props();

  // More direct way to get current tile data - prioritize tileData prop, fallback to targetStore
  const currentTileData = $derived(tileData || $targetStore || null);
  
  // Add direct debug logging every time the component opens
  $effect(() => {
    if (isOpen && currentTileData) {
      console.log("Peek opened with currentTileData:", currentTileData);
      console.log("Current player:", $currentPlayer);
      
      if (currentTileData.groups && currentTileData.groups.length > 0) {
        console.log("Groups on tile:", currentTileData.groups.length);
        currentTileData.groups.forEach(group => {
          console.log(`Group ${group.id}: owner=${group.owner}, current player id=${$currentPlayer?.id}, equal=${group.owner === $currentPlayer?.id}, status=${group.status}, inBattle=${group.inBattle}`);
        });
      } else {
        console.log("No groups on this tile");
      }
    }
  });

  // SIMPLIFIED CONDITION FUNCTIONS
  
  function canMobilize(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if player is on the tile
    const playerOnTile = tile.players?.some(p => p.id === $currentPlayer.id);
    
    // Check if player is not already in a mobilizing/demobilising group
    const inProcessGroup = tile.groups?.some(g => 
      (g.status === 'mobilizing' || g.status === 'demobilising') && 
      g.owner === $currentPlayer.id
    );
    
    const result = playerOnTile && !inProcessGroup;
    console.log(`canMobilize: ${result}`);
    return result;
  }
  
  function canDemobilize(tile) {
    if (!tile || !$currentPlayer || !tile.structure) return false;
    
    // Check if there are any player-owned groups that are idle
    const result = tile.groups?.some(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle' &&
      !g.inBattle
    );
    
    console.log(`canDemobilize: ${result}`);
    return result;
  }

  function canBuild(tile) {
    // Always allow build for now
    return true;
  }
  
  function canMove(tile) {
    if (!tile || !$currentPlayer) return false;
    
    if (!tile.groups || !Array.isArray(tile.groups) || tile.groups.length === 0) {
      console.log("canMove: false (no groups)");
      return false;
    }
    
    // Simple direct check for player owned idle groups
    const hasIdleGroups = tile.groups.some(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle' && 
      !g.inBattle
    );
    
    console.log(`canMove: ${hasIdleGroups}`);
    return hasIdleGroups;
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
    
    const result = playerGroups?.length > 0 && enemyGroups?.length > 0;
    console.log(`canAttack: ${result}`);
    return result;
  }
  
  function canGather(tile) {
    if (!tile || !$currentPlayer) {
      console.log("canGather: false (no tile or player)");
      return false;
    }
    
    // Check if there are items to gather
    if (!tile.items || !tile.items.length) {
      console.log("canGather: false (no items)");
      return false;
    }
    
    // Check if player has idle groups
    const hasIdleGroups = tile.groups?.some(g => 
      g.owner === $currentPlayer.id && 
      g.status === 'idle' &&
      !g.inBattle
    );
    
    console.log(`canGather: ${hasIdleGroups}`);
    return hasIdleGroups;
  }
  
  function canJoinBattle(tile) {
    if (!tile || !$currentPlayer) return false;
    
    // Check if there's battle and player has idle groups
    const result = tile.battles?.length > 0 &&
                  tile.groups?.some(g => 
                    g.owner === $currentPlayer.id && 
                    g.status === 'idle' &&
                    !g.inBattle
                  );
    
    console.log(`canJoinBattle: ${result}`);
    return result;
  }

  // Define actions with their conditions
  // Always show the details button
  const allPossibleActions = [
    { id: 'details', label: 'Details', icon: Info, condition: () => true },
    { id: 'inspect', label: 'Inspect', icon: Eye, condition: tile => tile?.structure },
    { id: 'mobilise', label: 'Mobilise', icon: Rally, condition: canMobilize },
    { id: 'move', label: 'Move', icon: Compass, condition: canMove },
    { id: 'attack', label: 'Attack', icon: Attack, condition: canAttack },
    { id: 'build', label: 'Build', icon: Hammer, condition: canBuild },
    { id: 'gather', label: 'Gather', icon: Crop, condition: canGather },
    { id: 'joinBattle', label: 'Join Battle', icon: Attack, condition: canJoinBattle },
    { 
      id: 'demobilise', 
      label: 'Demobilise', 
      icon: tile => tile?.structure?.type === 'spawn' ? Torch : Structure, 
      condition: canDemobilize 
    }
  ];

  // Filter actions based on provided actions or the conditions applied to tileData
  const availableActions = $derived(() => {
    // CRITICAL: Remove this check to always use our own filtering based on conditions
    // instead of using pre-defined actions passed from parent
    // if (actions.length > 0) return actions;
    
    // Always filter based on conditions
    if (!currentTileData) {
      console.log("No currentTileData available for action filtering");
      return [{id: 'details', label: 'Details', icon: Info}]; // Always allow Details action
    }
    
    console.log("Filtering actions with currentTileData:", currentTileData);
    
    const filtered = allPossibleActions.filter(action => {
      try {
        const conditionMet = action.condition(currentTileData);
        console.log(`Action ${action.id} condition result: ${conditionMet}`);
        return conditionMet;
      } catch (error) {
        console.error(`Error checking condition for action ${action.id}:`, error);
        return action.id === 'details'; // Always include details action even on error
      }
    });
    
    console.log("Final filtered actions:", filtered.map(a => a.id));
    return filtered.length > 0 ? filtered : [{id: 'details', label: 'Details', icon: Info}];
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

  function handleActionClick(actionId, event) {
    // Prevent event from bubbling to parent elements (especially center tile)
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    
    console.log('Peek action clicked:', actionId);
    
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
    
    console.log('Show details clicked, calling onShowDetails');
    onShowDetails();
    onClose(); // Also close the peek view
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
          style="--x:{position.x}em; --y:{position.y}em"
          onclick={(e) => handleActionClick(action.id, e)}
          transition:fly|local={{ delay: 50 * index, duration: 300, y: 20, opacity: 0 }}
        >
          {#if typeof action.icon === 'function'}
            <svelte:component this={action.icon(currentTileData)} extraClass="action-icon" />
          {:else}
            <svelte:component this={action.icon} extraClass="action-icon" />
          {/if}
          <span class="action-label">{action.label}</span>
        </button>
      {/each}
      
      <!-- Close button -->
      <button 
        class="action-button close-button" 
        style="--x:{closePosition.x}em; --y:{closePosition.y}em"
        onclick={onClose}
        transition:fly|local={{ delay: 50 * availableActions.length, duration: 300, y: 20, opacity: 0 }}
      >
        <Close extraClass="close-icon" />
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
    padding: 0.4em; /* Reduced padding */
    border-radius: 50%;
    width: 4.6em;
    height: 4.6em;
    background-color: rgba(255, 255, 255, 0.97);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); /* Improved easing */
    border: 3px solid rgba(255, 255, 255, 0.9);
    pointer-events: auto;
    font-family: var(--font-body);
    /* Position transform only, no scale */
    transform: translate(calc(-50% + var(--x, 0em)), calc(-50% + var(--y, 0em)));
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
