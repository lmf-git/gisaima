<script>
  import { onMount } from 'svelte';
  import { ref, update } from "firebase/database";
  import { db } from '../../lib/firebase/database.js';
  import { user } from '../../lib/stores/user.js';
  import { game } from '../../lib/stores/game.js';
  import { map, moveTarget } from '../../lib/stores/map.js';

  // Export a close function prop to allow parent to close the component
  const { onSpawn = () => {} } = $props();
  
  // State variables
  let selectedSpot = $state(null);
  let spawnOptions = $state([]);
  let loading = $state(true);
  let spawning = $state(false);
  let error = $state(null);
  
  // Generate spawn options - typically a few points near center of map
  function generateSpawnOptions() {
    // Start with the current position
    const centerX = $map.target.x;
    const centerY = $map.target.y;
    
    // Generate 3-5 spawn points in vicinity of current location
    const points = [];
    const count = 3 + Math.floor(Math.random() * 3); // 3-5 options
    
    for (let i = 0; i < count; i++) {
      // Generate point within 10 tiles of center
      const offsetX = Math.floor(Math.random() * 21) - 10;
      const offsetY = Math.floor(Math.random() * 21) - 10;
      
      points.push({
        id: `spawn-${i}`,
        x: centerX + offsetX,
        y: centerY + offsetY,
        name: `Spawn Point ${i + 1}`
      });
    }
    
    return points;
  }
  
  // Select a spawn point
  function selectSpawn(spot) {
    selectedSpot = spot;
    // Move the map to the selected spot for preview
    moveTarget(spot.x, spot.y);
  }
  
  // Complete the spawn process
  async function confirmSpawn() {
    if (!selectedSpot || !$user?.uid || !$game.currentWorld) {
      error = "Unable to spawn: Missing required data";
      return;
    }
    
    spawning = true;
    error = null;
    
    try {
      // Update the player's spawn status in Firebase
      const playerWorldRef = ref(db, `players/${$user.uid}/worlds/${$game.currentWorld}`);
      await update(playerWorldRef, { 
        spawned: true,
        lastLocation: {
          x: selectedSpot.x,
          y: selectedSpot.y,
          timestamp: Date.now()
        }
      });
      
      // Notify parent that spawn has completed
      onSpawn(selectedSpot);
      
    } catch (err) {
      console.error('Error during spawn:', err);
      error = "Failed to spawn. Please try again.";
      spawning = false;
    }
  }
  
  onMount(() => {
    // Generate spawn options when component mounts
    spawnOptions = generateSpawnOptions();
    loading = false;
    
    // Select the first spawn point by default
    if (spawnOptions.length > 0) {
      selectSpawn(spawnOptions[0]);
    }
  });
</script>

<div class="spawn-menu">
  <div class="spawn-container">
    <h2>Welcome to {$game.worldInfo[$game.currentWorld]?.name || 'New World'}</h2>
    <p class="description">Select a location to begin your journey</p>
    
    {#if loading}
      <div class="loading">Preparing spawn options...</div>
    {:else if error}
      <div class="error">{error}</div>
    {:else}
      <div class="spawn-options">
        {#each spawnOptions as spot}
          <button 
            class="spawn-option" 
            class:selected={selectedSpot?.id === spot.id}
            onclick={() => selectSpawn(spot)}
            disabled={spawning}
          >
            <span class="option-name">{spot.name}</span>
            <span class="option-coords">Coordinates: {spot.x},{spot.y}</span>
          </button>
        {/each}
      </div>
      
      <button 
        class="spawn-button" 
        onclick={confirmSpawn} 
        disabled={!selectedSpot || spawning}
      >
        {#if spawning}
          <div class="spinner"></div> Spawning...
        {:else}
          Confirm Spawn
        {/if}
      </button>
      
      <p class="hint">You can explore the world after spawning</p>
    {/if}
  </div>
</div>

<style>
  .spawn-menu {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    z-index: 100;
    display: flex;
    justify-content: center;
    align-items: center;
    backdrop-filter: blur(4px);
  }
  
  .spawn-container {
    background: var(--color-dark-navy);
    border: 2px solid var(--color-teal);
    border-radius: 8px;
    padding: 2rem;
    width: 90%;
    max-width: 500px;
    color: white;
    box-shadow: 0 0 20px rgba(0, 150, 150, 0.3);
    text-align: center;
  }
  
  h2 {
    margin-top: 0;
    color: var(--color-teal);
    margin-bottom: 0.5rem;
    font-family: var(--font-heading);
  }
  
  .description {
    margin-bottom: 1.5rem;
    opacity: 0.8;
  }
  
  .spawn-options {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }
  
  .spawn-option {
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    display: flex;
    flex-direction: column;
    transition: all 0.2s;
    color: white;
  }
  
  .spawn-option:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
  }
  
  .spawn-option.selected {
    background: rgba(0, 150, 150, 0.2);
    border-color: var(--color-teal);
    box-shadow: 0 0 8px rgba(0, 150, 150, 0.4);
  }
  
  .option-name {
    font-weight: bold;
    margin-bottom: 0.25rem;
  }
  
  .option-coords {
    font-size: 0.85rem;
    opacity: 0.7;
  }
  
  .spawn-button {
    background: var(--color-teal);
    color: #ffffff;
    border: none;
    padding: 0.875rem 1.5rem;
    border-radius: 4px;
    font-weight: bold;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin: 0 auto;
  }
  
  .spawn-button:hover:not(:disabled) {
    background: var(--color-bright-teal);
    transform: translateY(-2px);
  }
  
  .spawn-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .loading, .error {
    padding: 1rem;
    margin: 1rem 0;
    border-radius: 4px;
  }
  
  .loading {
    background: rgba(255, 255, 255, 0.1);
  }
  
  .error {
    background: rgba(255, 0, 0, 0.15);
    color: #ff7070;
  }
  
  .hint {
    font-size: 0.8rem;
    opacity: 0.6;
    margin-top: 1rem;
  }
  
  .spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: white;
    animation: spin 1s ease-in-out infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* Responsive adjustments */
  @media (max-width: 480px) {
    .spawn-container {
      padding: 1.5rem;
      width: 95%;
    }
    
    h2 {
      font-size: 1.5rem;
    }
  }
</style>
