<script>
  import { moveTarget, targetStore } from '../../lib/stores/map';
  import { game } from '../../lib/stores/game';
  import Torch from '../icons/Torch.svelte';
  
  // Calculate distance between two points
  function getDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }
  
  // Find nearest spawn for player's race
  let nearestSpawn = $state(null);
  let distance = $state(0);
  const DISTANCE_THRESHOLD = 20;
  
  $effect(() => {
    // Get current target coordinates
    const targetX = $targetStore.x;
    const targetY = $targetStore.y;
    
    // Get player race and world data
    const playerRace = $game.player?.race?.toLowerCase();
    const world = $game.worlds[$game.worldKey];
    
    // Skip if data is missing
    if (!world || !playerRace) {
      nearestSpawn = null;
      distance = 0;
      return;
    }
    
    // Get spawns from world data
    const spawns = world.spawns ? Object.values(world.spawns) : [];
    
    // Filter spawns by race
    const raceSpawns = spawns.filter(spawn => 
      spawn.race?.toLowerCase() === playerRace
    );
    
    if (raceSpawns.length === 0) {
      // No spawns for this race found
      nearestSpawn = null;
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
      
      const dist = getDistance(targetX, targetY, spawnX, spawnY);
      
      if (dist < minDistance) {
        minDistance = dist;
        closest = spawn;
      }
    }
    
    // Update state
    nearestSpawn = closest;
    distance = minDistance;
  });
  
  // Handle recenter click
  function recenter() {
    if (!nearestSpawn) return;
    
    const spawnX = nearestSpawn.x ?? nearestSpawn.position?.x ?? 0;
    const spawnY = nearestSpawn.y ?? nearestSpawn.position?.y ?? 0;
    
    moveTarget(spawnX, spawnY);
  }
</script>

{#if nearestSpawn && distance > DISTANCE_THRESHOLD && $game?.player?.alive}
  <button 
    class="recenter-button" 
    on:click={recenter}
    aria-label="Return to spawn point">
    <Torch extraClass="torch-icon-button" size="1.2em" />
    <span>Return to spawn</span>
  </button>
{/if}

<style>
  .recenter-button {
    position: fixed;
    top: 50%;
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
</style>
