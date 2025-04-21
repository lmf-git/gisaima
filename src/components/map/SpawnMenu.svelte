<script>
  import { onMount } from 'svelte';
  import { ref, get as dbGet, update, set } from "firebase/database";
  import { db } from '../../lib/firebase/database.js';
  import { user } from '../../lib/stores/user.js';
  import { game } from '../../lib/stores/game.js';
  import { map, moveTarget } from '../../lib/stores/map.js';
  import { goto } from '$app/navigation';
  import Torch from '../icons/Torch.svelte';
  
  // Import race icon components
  import Human from '../icons/Human.svelte';
  import Elf from '../icons/Elf.svelte';
  import Dwarf from '../icons/Dwarf.svelte';
  import Goblin from '../icons/Goblin.svelte';
  import Fairy from '../icons/Fairy.svelte';

  // Export a close function prop to allow parent to close the component
  const { onSpawn = () => {} } = $props();
  
  // State variables
  let selectedSpot = $state(null);
  let spawnOptions = $state([]);
  let loading = $state(true);
  let spawning = $state(false);
  let error = $state(null);
  
  // Get player's race from game store
  const playerRace = $derived($game.playerWorldData?.race || 'human');
  
  // Get the displayName directly from game store
  const playerDisplayName = $derived($game.playerWorldData?.displayName || '');
  
  // Function to safely check if a value is valid
  function isValidValue(value) {
    return value !== undefined && value !== null && value !== '';
  }
  
  // Function to consistently calculate chunk key
  function getChunkKey(x, y) {
    const CHUNK_SIZE = 20;
    // Simple integer division works for both positive and negative coordinates
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkY = Math.floor(y / CHUNK_SIZE);
    return `${chunkX},${chunkY}`;
  }
  
  // Load spawn points from the database and filter by race
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
            // These are the exact coordinates we need to preserve
            const [chunkX, chunkY, x, y] = spawnId.split(':');
            const chunkKey = `${chunkX},${chunkY}`;
            const locationKey = `${x},${y}`;
            
            // Get the spawn structure data
            const spawnRef = ref(db, `worlds/${$game.currentWorld}/chunks/${chunkKey}/${locationKey}/structure`);
            const spawnSnapshot = await dbGet(spawnRef);
            
            if (spawnSnapshot.exists() && spawnSnapshot.val().type === 'spawn') {
              const spawnData = spawnSnapshot.val();
              
              // Only add spawn points that match the player's race
              if (spawnData.faction === playerRace) {
                spawnPoints.push({
                  id: spawnId,
                  x: parseInt(x),
                  y: parseInt(y),
                  // Store the exact chunk information to ensure consistency
                  chunkX: parseInt(chunkX),
                  chunkY: parseInt(chunkY),
                  name: spawnData.name || `Spawn Point ${spawnPoints.length + 1}`,
                  description: spawnData.description,
                  faction: spawnData.faction
                });
              }
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
        error = `No spawn points available for ${playerRace}s in this world`;
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
      // Update the player's spawn status in user record with alive:true
      const playerWorldRef = ref(db, `players/${$user.uid}/worlds/${$game.currentWorld}`);
      await update(playerWorldRef, { 
        alive: true,
        lastLocation: {
          x: selectedSpot.x,
          y: selectedSpot.y
        }
      });
      
      // IMPORTANT: Use the exact chunk coordinates from the spawn point
      // NOT calculated from the coordinates, to ensure consistency
      const chunkKey = `${selectedSpot.chunkX},${selectedSpot.chunkY}`;
      const locationKey = `${selectedSpot.x},${selectedSpot.y}`;
      
      // Create a player entity in the world in the exact same chunk as the spawn structure
      const playerEntityRef = ref(
        db, 
        `worlds/${$game.currentWorld}/chunks/${chunkKey}/${locationKey}/players/${$user.uid}`
      );
      
      // Simply use the displayName from the world data - no fallback needed
      // This ensures we consistently use what was entered in JoinConfirmation
      const displayName = playerDisplayName || 'Player'; // Just add a minimal fallback
      
      console.log(`Setting player entity with displayName: ${displayName} (from world data)`);
      
      // Set player data in the world, including race and timestamp
      await set(playerEntityRef, {
        displayName,
        lastActive: Date.now(),
        uid: $user.uid,
        race: playerRace
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
    // Load race-filtered spawn options when component mounts
    spawnOptions = await loadSpawnPoints();
    loading = false;
    
    // Select the first spawn point by default if available
    if (spawnOptions.length > 0) {
      selectSpawn(spawnOptions[0]);
    }

    // Debug output to verify displayName access
    console.log('Player data available in SpawnMenu:', {
      displayName: playerDisplayName,
      race: playerRace, 
      worldData: $game.playerWorldData
    });
  });
</script>

<div class="spawn-menu">
  <div class="spawn-container">
    <div class="title-with-icon">
      <div class="race-icon-container">
        {#if playerRace === 'human'}
          <Human extraClass="race-icon-menu" />
        {:else if playerRace === 'elf'}
          <Elf extraClass="race-icon-menu" />
        {:else if playerRace === 'dwarf'}
          <Dwarf extraClass="race-icon-menu" />
        {:else if playerRace === 'goblin'}
          <Goblin extraClass="race-icon-menu" />
        {:else if playerRace === 'fairy'}
          <Fairy extraClass="race-icon-menu" />
        {/if}
      </div>
      <h2>Welcome {playerRace.charAt(0).toUpperCase() + playerRace.slice(1)} to {$game.worldInfo[$game.currentWorld]?.name || 'New World'}</h2>
    </div>
    <p class="description">Select a settlement to begin your journey</p>
    
    {#if loading}
      <div class="loading">Loading spawn locations...</div>
    {:else if error}
      <div class="error">
        <p>{error}</p>
        <button class="secondary-button" onclick={() => goto('/worlds')}>Return to World Selection</button>
      </div>
    {:else if spawnOptions.length === 0}
      <div class="error">
        <p>No spawn points available for {playerRace}s in this world.</p>
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
            <div class="option-icon">
              <Torch size="2em" extraClass="torch-icon" />
            </div>
            <div class="option-content">
              <span class="option-name">{spot.name}</span>
              <span class="option-coords">Coordinates: {spot.x},{spot.y}</span>
              <span class="faction-tag">{playerRace.charAt(0).toUpperCase() + playerRace.slice(1)} Settlement</span>
              {#if spot.description}
                <span class="option-desc">{spot.description}</span>
              {/if}
            </div>
          </button>
        {/each}
      </div>
      
      <div class="action-container">
        <button 
          class="cta-button spawn-button" 
          onclick={confirmSpawn} 
          disabled={!selectedSpot || spawning}
        >
          {#if spawning}
            <div class="spinner"></div> Spawning...
          {:else}
            <span class="button-text">Confirm Spawn</span>
          {/if}
        </button>
      </div>
      
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
    background: rgba(0, 0, 0, 0.7);
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
    backdrop-filter: blur(4px);
  }
  
  .spawn-container {
    background-color: rgba(255, 255, 255, 0.85);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.3em;
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(0.5em);
    -webkit-backdrop-filter: blur(0.5em);
    padding: 2rem;
    width: 90%;
    max-width: 500px;
    color: rgba(0, 0, 0, 0.8);
    animation: fadeIn 0.8s ease-out forwards;
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-1em);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  h2 {
    margin-top: 0;
    color: rgba(0, 0, 0, 0.85);
    margin-bottom: 0.5rem;
    font-family: var(--font-heading);
    font-size: 1.6em;
  }
  
  .description {
    margin-bottom: 1.5rem;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .title-with-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 0.5rem;
  }

  .race-icon-container {
    margin-right: 1rem;
  }
  
  :global(.race-icon-menu) {
    width: 3em;
    height: 3em;
    fill: rgba(0, 0, 0, 0.8);
  }
  
  :global(.torch-icon) {
    width: 2.2em;
    height: 2.2em;
    fill: rgba(0, 0, 0, 0.8);
  }

  .spawn-options {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }
  
  .spawn-option {
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.3em;
    cursor: pointer;
    text-align: left;
    display: flex;
    align-items: center;
    transition: all 0.2s;
    color: rgba(0, 0, 0, 0.8);
  }
  
  .spawn-option:hover {
    background: rgba(255, 255, 255, 0.8);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transform: translateY(-1px);
  }
  
  .spawn-option.selected {
    background: rgba(64, 158, 255, 0.1);
    border-color: rgba(64, 158, 255, 0.3);
    box-shadow: 0 0 8px rgba(64, 158, 255, 0.2);
  }
  
  .option-icon {
    margin-right: 0.8rem;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 2.5rem;
    padding: 0.4em;
  }
  
  .option-content {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  
  .option-name {
    font-weight: 600;
    margin-bottom: 0.25rem;
    color: rgba(0, 0, 0, 0.85);
  }
  
  .option-coords {
    font-size: 0.85rem;
    color: rgba(0, 0, 0, 0.6);
  }
  
  .action-container {
    display: flex;
    justify-content: center;
    margin: 1.5rem 0 1rem;
  }

  .cta-button {
    display: inline-block;
    padding: 0.8em 2em;
    background-color: rgba(64, 158, 255, 0.1);
    color: rgba(0, 0, 0, 0.8);
    border-radius: 0.3em;
    border: 1px solid rgba(64, 158, 255, 0.3);
    font-size: 1.1em;
    text-decoration: none;
    font-weight: 600;
    transition: all 0.3s ease;
    font-family: var(--font-heading);
    cursor: pointer;
    position: relative;
    overflow: hidden;
  }

  .spawn-button {
    min-width: 200px;
    background: rgba(64, 158, 255, 0.8);
    color: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(64, 158, 255, 0.6);
    box-shadow: 0 0.3em 0.6em rgba(64, 158, 255, 0.3);
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    text-shadow: 0 0 0.2em rgba(0, 0, 0, 0.3);
  }
  
  .spawn-button::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
    transition: all 0.6s;
  }
  
  .spawn-button:hover:not(:disabled) {
    transform: translateY(-0.2em);
    box-shadow: 0 0.4em 0.8em rgba(64, 158, 255, 0.4);
    background: rgba(64, 158, 255, 0.9);
  }
  
  .spawn-button:hover:not(:disabled)::before {
    left: 100%;
  }
  
  .button-text {
    position: relative;
    z-index: 1;
  }
  
  .spawn-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .loading, .error {
    padding: 1rem;
    margin: 1rem 0;
    border-radius: 0.3em;
  }
  
  .loading {
    background: rgba(0, 0, 0, 0.05);
    color: rgba(0, 0, 0, 0.7);
  }
  
  .error {
    background: rgba(255, 0, 0, 0.1);
    color: rgba(220, 53, 69, 0.9);
    border: 1px solid rgba(220, 53, 69, 0.2);
  }
  
  .hint {
    font-size: 0.85rem;
    color: rgba(0, 0, 0, 0.5);
    margin-top: 1rem;
    font-style: italic;
  }
  
  .spinner {
    display: inline-block;
    width: 1.2rem;
    height: 1.2rem;
    border: 0.2em solid rgba(255, 255, 255, 0.3);
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
    
    .cta-button {
      width: 100%;
      padding: 0.7em 1em;
    }
  }
  
  .option-desc {
    font-size: 0.8rem;
    font-style: italic;
    color: rgba(0, 0, 0, 0.6);
    margin-top: 0.25rem;
  }

  .secondary-button {
    background: rgba(0, 0, 0, 0.05);
    color: rgba(0, 0, 0, 0.7);
    border: 1px solid rgba(0, 0, 0, 0.1);
    padding: 0.8em 1.5em;
    border-radius: 0.3em;
    font-size: 0.95em;
    cursor: pointer;
    margin-top: 1rem;
    transition: all 0.2s ease;
    font-family: var(--font-heading);
    font-weight: 500;
  }
  
  .secondary-button:hover {
    background: rgba(0, 0, 0, 0.1);
    transform: translateY(-0.1em);
    box-shadow: 0 0.2em 0.5em rgba(0, 0, 0, 0.1);
  }

  .faction-tag {
    font-size: 0.8rem;
    background: rgba(64, 158, 255, 0.1);
    color: rgba(64, 158, 255, 0.9);
    padding: 0.2rem 0.5rem;
    border-radius: 0.3em;
    display: inline-block;
    margin-top: 0.25rem;
    font-weight: 500;
    border: 1px solid rgba(64, 158, 255, 0.2);
  }
</style>
