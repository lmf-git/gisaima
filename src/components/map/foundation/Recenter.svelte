<script>
  import { moveTarget, targetStore } from '../../../lib/stores/map';
  import { game } from '../../../lib/stores/game';
  import Torch from '../../icons/Torch.svelte';
  // Import race icons
  import Human from '../../icons/Human.svelte';
  import Elf from '../../icons/Elf.svelte';
  import Dwarf from '../../icons/Dwarf.svelte';
  import Goblin from '../../icons/Goblin.svelte';
  import Fairy from '../../icons/Fairy.svelte';
  
  // Calculate distance between two points
  function getDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }
  
  // Track recenter target info
  let recenterTarget = $state(null);
  let distance = $state(0);
  let targetType = $state('spawn'); // 'player' or 'spawn'
  const DISTANCE_THRESHOLD = 20;
  
  // Store player race for icon selection
  let playerRace = $state(null);
  
  $effect(() => {
    // Update player race whenever game state changes
    playerRace = $game.player?.race?.toLowerCase() || null;
  });
  
  $effect(() => {
    // Get current target coordinates
    const tx = $targetStore.x;
    const ty = $targetStore.y;
    
    // Check for player location first
    const playerLocation = $game.player?.lastLocation;
    if ($game?.player?.alive && playerLocation && 
        typeof playerLocation.x === 'number' && 
        typeof playerLocation.y === 'number') {
      
      // Calculate distance to player
      const dist = getDistance(tx, ty, playerLocation.x, playerLocation.y);
      
      // Update state with player as target
      recenterTarget = { 
        x: playerLocation.x, 
        y: playerLocation.y,
        type: 'player'
      };
      distance = dist;
      targetType = 'player';
      return;
    }
    
    // Fall back to spawn points if player location not available
    const playerRaceValue = $game.player?.race?.toLowerCase();
    const world = $game.worlds[$game.worldKey];
    
    // Skip if data is missing
    if (!world || !playerRaceValue) {
      recenterTarget = null;
      distance = 0;
      return;
    }
    
    // Get spawns from world data
    const spawns = world.spawns ? Object.values(world.spawns) : [];
    
    // Filter spawns by race
    const raceSpawns = spawns.filter(spawn => 
      spawn.race?.toLowerCase() === playerRaceValue
    );
    
    if (raceSpawns.length === 0) {
      // No spawns for this race found
      recenterTarget = null;
      distance = 0;
      return;
    }
    
    // Find nearest spawn
    let closest = null;
    let minDistance = Infinity;
    
    for (const spawn of raceSpawns) {
      // Get spawn coordinates
      const spawnX = spawn.x ?? spawn.position?.x ?? 0;
      const spawnY = spawn.y ?? spawn.position?.y ?? 0;
      
      const dist = getDistance(tx, ty, spawnX, spawnY);
      
      if (dist < minDistance) {
        minDistance = dist;
        closest = spawn;
      }
    }
    
    // Update state with spawn as target
    if (closest) {
      const spawnX = closest.x ?? closest.position?.x ?? 0;
      const spawnY = closest.y ?? closest.position?.y ?? 0;
      
      recenterTarget = {
        x: spawnX,
        y: spawnY,
        spawn: closest,
        type: 'spawn'
      };
      distance = minDistance;
      targetType = 'spawn';
    } else {
      recenterTarget = null;
      distance = 0;
    }
  });
  
  // Handle recenter click
  function recenter() {
    if (!recenterTarget) return;
    moveTarget(recenterTarget.x, recenterTarget.y);
  }
</script>

{#if recenterTarget && distance > DISTANCE_THRESHOLD && $game?.player?.alive}
  <button 
    class="recenter-button" 
    onclick={recenter}
    aria-label={targetType === 'player' ? "Return to player" : "Return to spawn point"}>
    
    {#if targetType === 'player' && playerRace}
      {#if playerRace === 'human'}
        <Human extraClass="race-icon-button" size="1.2em" />
      {:else if playerRace === 'elf'}
        <Elf extraClass="race-icon-button" size="1.2em" />
      {:else if playerRace === 'dwarf'}
        <Dwarf extraClass="race-icon-button" size="1.2em" />
      {:else if playerRace === 'goblin'}
        <Goblin extraClass="race-icon-button" size="1.2em" />
      {:else if playerRace === 'fairy'}
        <Fairy extraClass="race-icon-button" size="1.2em" />
      {:else}
        <Torch extraClass="torch-icon-button" size="1.2em" />
      {/if}
    {:else}
      <Torch extraClass="torch-icon-button" size="1.2em" />
    {/if}
    
    <span>{targetType === 'player' ? 'Return to player' : 'Return to spawn'}</span>
  </button>
{/if}

<style>
  .recenter-button {
    position: fixed;
    top: 35%;
    right: 1em;
    transform: translateY(-50%);
    background-color: rgba(255, 255, 255, 0.85);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.3em;
    color: rgba(0, 0, 0, 0.8);
    padding: 0.6em 1em;
    font-size: 0.9em;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5em;
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    transition: all 0.2s ease;
    backdrop-filter: blur(0.5em);
    -webkit-backdrop-filter: blur(0.5em);
    z-index: 998;
    box-shadow: 0 0.1em 0.5em rgba(0, 0, 0, 0.2);
    animation: pulseButton 2s infinite alternate;
  }
  
  .recenter-button:hover {
    background-color: rgba(255, 255, 255, 0.95);
    transform: translateY(-50%) translateY(-0.1em);
  }
  
  @keyframes pulseButton {
    0% {
      transform: translateY(-50%) scale(1);
    }
    100% {
      transform: translateY(-50%) scale(1.05);
    }
  }
  
  :global(.torch-icon-button) {
    width: 1.2em;
    height: 1.2em;
    fill: rgba(0, 0, 0, 0.8);
    filter: drop-shadow(0 0 2px rgba(255, 140, 0, 0.4));
  }
  
  :global(.race-icon-button) {
    width: 1.2em;
    height: 1.2em;
    fill: rgba(0, 0, 0, 0.8);
    filter: drop-shadow(0 0 2px rgba(100, 100, 255, 0.4));
  }
</style>
