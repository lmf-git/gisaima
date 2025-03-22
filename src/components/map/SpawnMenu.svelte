<script>
  import { onMount } from 'svelte';
  import { ref, get as dbGet, update } from "firebase/database";
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
  
  // Load spawn points from the database instead of generating random ones
  async function loadSpawnPoints() {
    if (!$game.currentWorld) {
      error = "No world selected";
      return [];
    }
    
    try {
      // Get the list of spawn IDs from the world info
      const worldSpawnListRef = ref(db, `worlds/${$game.currentWorld}/spawns`);
      const spawnListSnapshot = await dbGet(worldSpawnListRef);
      
      let spawnPoints = [];
      
      if (spawnListSnapshot.exists()) {
        // If we have a list of spawn IDs, fetch each one
        const spawnIds = Object.keys(spawnListSnapshot.val());
        
        // For each spawn ID, get the location data
        for (const spawnId of spawnIds) {
          try {
            // Parse the location from the spawn ID (format: "chunkX:chunkY:x:y")
            const [chunkX, chunkY, x, y] = spawnId.split(':');
            const chunkKey = `${chunkX},${chunkY}`;
            const locationKey = `${x},${y}`;
            
            // Get the spawn structure data
            const spawnRef = ref(db, `worlds/${$game.currentWorld}/chunks/${chunkKey}/${locationKey}/structure`);
            const spawnSnapshot = await dbGet(spawnRef);
            
            if (spawnSnapshot.exists() && spawnSnapshot.val().type === 'spawn') {
              const spawnData = spawnSnapshot.val();
              
              spawnPoints.push({
                id: spawnId,
                x: parseInt(x),
                y: parseInt(y),
                name: spawnData.name || `Spawn Point ${spawnPoints.length + 1}`,
                description: spawnData.description
              });
            }
          } catch (err) {
            console.error(`Error loading spawn ${spawnId}:`, err);
          }
        }
      } else {
        // No spawns found in world data
        error = "No spawn points found in this world";
      }
      
      if (spawnPoints.length === 0) {
        error = "No valid spawn points available";
      }
      
      return spawnPoints;
    } catch (err) {
      console.error('Error loading spawn points:', err);
      error = "Failed to load spawn points. Please try again later.";
      return [];
    }
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
        lastSpawn: selectedSpot.id,
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
  
  onMount(async () => {
    // Load real spawn options when component mounts
    spawnOptions = await loadSpawnPoints();
    loading = false;
    
    // Select the first spawn point by default if available
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
      <div class="loading">Loading spawn locations...</div>
    {:else if error}
      <div class="error">
        <p>{error}</p>
        <button class="secondary-button" onclick={() => goto('/worlds')}>Return to World Selection</button>
      </div>
    {:else if spawnOptions.length === 0}
      <div class="error">
        <p>No spawn points available in this world.</p>
        <button class="secondary-button" onclick={() => goto('/worlds')}>Return to World Selection</button>
      </div>
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
            {#if spot.description}
              <span class="option-desc">{spot.description}</span>
            {/if}
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
          Enter World
        {/if}
      </button>
      
      <p class="hint">You can explore other areas after spawning</p>
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
  
  .option-desc {
    font-size: 0.8rem;
    font-style: italic;
    opacity: 0.8;
    margin-top: 0.25rem;
  }

  .secondary-button {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.3);
    padding: 0.6rem 1rem;
    border-radius: 4px;
    font-size: 0.9rem;
    cursor: pointer;
    margin-top: 1rem;
    transition: all 0.2s;
  }
  
  .secondary-button:hover {
    background: rgba(255, 255, 255, 0.3);
  }
</style>
