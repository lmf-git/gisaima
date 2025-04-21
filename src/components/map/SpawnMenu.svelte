<script>
  import { ref, get as dbGet, update } from 'firebase/database';
  import { db } from '../../lib/firebase/database.js';
  import { game, currentPlayer, needsSpawn } from '../../lib/stores/game.js';
  import { moveTarget } from '../../lib/stores/map.js';

  // Using Svelte 5 $props rune
  const { onSpawn = () => {} } = $props();

  // Component state using $state rune
  let spawnPoints = $state([]);
  let selectedSpawnId = $state(null);
  let loading = $state(true);
  let spawning = $state(false);
  let error = $state(null);
  let movedToSpawn = $state(false);
  let unmounting = $state(false); // Add the missing unmounting state variable

  // Function to consistently calculate chunk key
  function getChunkKey(x, y) {
    const CHUNK_SIZE = 20;
    return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;
  }

  // Parse spawn location string (format: "chunkX:chunkY:tileX:tileY")
  function parseSpawnLocation(locationStr) {
    const parts = locationStr.split(':').map(Number);
    if (parts.length !== 4) return null;
    
    return {
      chunkX: parts[0],
      chunkY: parts[1],
      x: parts[2],
      y: parts[3],
    };
  }
  
  // Move map to selected spawn location
  function moveToSelectedSpawn() {
    if (!selectedSpawnId) return;
    
    const spawn = spawnPoints.find(s => s.id === selectedSpawnId);
    if (!spawn) return;
    
    console.log(`Moving map to spawn location: ${spawn.x}, ${spawn.y}`);
    moveTarget(spawn.x, spawn.y);
    movedToSpawn = true;
  }

  // Get spawn points directly from the game store if possible
  async function getSpawnPoints() {
    if (!$game.currentWorld) {
      error = "No world selected";
      return [];
    }

    // Check if spawn information exists in the game store
    const worldInfo = $game.worldInfo[$game.currentWorld];
    if (!worldInfo) {
      error = "World info not available";
      return [];
    }

    // Get the spawns data from world info
    const spawns = worldInfo.spawns || {};
    if (Object.keys(spawns).length === 0) {
      console.log("No spawns found in world info, using fallback method");
      // Use fallback method if spawns aren't in the game store
      return await loadSpawnPointsFromDatabase();
    }

    try {
      const spawnPoints = [];
      
      // Process spawns from the game store
      for (const [locationKey, structureId] of Object.entries(spawns)) {
        const location = parseSpawnLocation(locationKey);
        if (!location) continue;
        
        // We still need to get the structure details from the database
        // as these might not be in the game store
        const chunkKey = `${location.chunkX},${location.chunkY}`;
        const structureRef = ref(db, `worlds/${$game.currentWorld}/chunks/${chunkKey}/${location.x},${location.y}/structure`);
        const structureSnapshot = await dbGet(structureRef);
        
        if (structureSnapshot.exists()) {
          const structure = structureSnapshot.val();
          
          if (structure.type === 'spawn') {
            spawnPoints.push({
              id: structure.id,
              name: structure.name,
              description: structure.description,
              faction: structure.faction,
              x: location.x,
              y: location.y,
              locationKey
            });
          }
        }
      }
      
      return spawnPoints;
    } catch (err) {
      console.error("Error processing spawn points:", err);
      error = "Failed to load spawn points";
      return [];
    }
  }
  
  // Fallback method to load spawn points directly from database
  async function loadSpawnPointsFromDatabase() {
    if (!$game.currentWorld) {
      error = "No world selected";
      return [];
    }
    
    try {
      const worldSpawnListRef = ref(db, `worlds/${$game.currentWorld}/spawns`);
      const spawnListSnapshot = await dbGet(worldSpawnListRef);
      
      let spawnPoints = [];
      
      if (spawnListSnapshot.exists()) {
        const spawns = spawnListSnapshot.val();
        
        // Process each spawn location
        for (const [locationKey, structureId] of Object.entries(spawns)) {
          const location = parseSpawnLocation(locationKey);
          if (!location) continue;
          
          // Look up the structure in the database
          const chunkKey = `${location.chunkX},${location.chunkY}`;
          const structureRef = ref(db, `worlds/${$game.currentWorld}/chunks/${chunkKey}/${location.x},${location.y}/structure`);
          const structureSnapshot = await dbGet(structureRef);
          
          if (structureSnapshot.exists()) {
            const structure = structureSnapshot.val();
            
            if (structure.type === 'spawn') {
              spawnPoints.push({
                id: structure.id,
                name: structure.name,
                description: structure.description,
                faction: structure.faction,
                x: location.x,
                y: location.y,
                locationKey
              });
            }
          }
        }
      }
      
      return spawnPoints;
    } catch (err) {
      console.error("Error loading spawn points from database:", err);
      error = "Failed to load spawn points";
      return [];
    }
  }
  
  // Filter spawn points to match player's race
  function getFilteredSpawns(spawns) {
    if (!$currentPlayer || !$currentPlayer.race) return spawns;
    
    const playerRace = $currentPlayer.race.toLowerCase();
    
    return spawns.filter(spawn => {
      return !spawn.faction || spawn.faction.toLowerCase() === playerRace;
    });
  }

  // Spawn player at the selected location
  async function spawnPlayer() {
    if (!selectedSpawnId || !$currentPlayer || !$game.currentWorld) {
      error = "Please select a spawn point first";
      return false;
    }
    
    try {
      spawning = true;
      error = null;
      
      // Find the selected spawn point
      const spawn = spawnPoints.find(s => s.id === selectedSpawnId);
      if (!spawn) {
        throw new Error("Selected spawn point not found");
      }
      
      // Move to spawn location first if needed
      if (!movedToSpawn) {
        console.log(`Moving map to spawn location before spawning: ${spawn.x}, ${spawn.y}`);
        moveTarget(spawn.x, spawn.y);
        movedToSpawn = true;
        // Give a moment for the map to update
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Update player status in the database
      const playerRef = ref(db, `players/${$currentPlayer.uid}/worlds/${$game.currentWorld}`);
      
      await update(playerRef, {
        alive: true,
        lastLocation: {
          x: spawn.x,
          y: spawn.y,
          timestamp: Date.now()
        }
      });
      
      // Add player to the chunk in the world database
      const chunkKey = getChunkKey(spawn.x, spawn.y);
      const tileKey = `${spawn.x},${spawn.y}`;
      const worldPlayerRef = ref(db, `worlds/${$game.currentWorld}/chunks/${chunkKey}/${tileKey}/players/${$currentPlayer.uid}`);
      
      await update(worldPlayerRef, {
        uid: $currentPlayer.uid,
        displayName: $currentPlayer.displayName,
        race: $currentPlayer.race,
        lastActive: Date.now()
      });
      
      // Set flag to handle unmounting gracefully
      unmounting = true;
      
      // Return success - component will auto-close via effect
      return true;
    } catch (err) {
      console.error("Error spawning player:", err);
      error = "Failed to spawn player: " + err.message;
      return false;
    } finally {
      spawning = false;
    }
  }
  
  // Initialize loading of spawn points
  $effect(async () => {
    loading = true;
    error = null;
    
    try {
      // Use getSpawnPoints which tries game store first, then falls back to direct database query
      spawnPoints = await getSpawnPoints();
      
      // Select the first matching spawn point by default
      const filteredSpawns = getFilteredSpawns(spawnPoints);
      if (filteredSpawns.length > 0) {
        selectedSpawnId = filteredSpawns[0].id;
        
        // If there's only one spawn option, immediately move the map there
        if (filteredSpawns.length === 1) {
          console.log('Only one spawn option available, immediately focusing map');
          moveToSelectedSpawn();
        }
      }
    } catch (err) {
      console.error("Error in SpawnMenu component:", err);
      error = "Failed to load spawn points";
    } finally {
      loading = false;
    }
  });
  
  // Using $derived for reactive calculations
  const filteredSpawnPoints = $derived(getFilteredSpawns(spawnPoints));
  const selectedSpawn = $derived(spawnPoints.find(spawn => spawn.id === selectedSpawnId));
  
  // Auto-move to spawn location when there's only one option
  $effect(() => {
    if (filteredSpawnPoints.length === 1 && !movedToSpawn && !loading) {
      selectedSpawnId = filteredSpawnPoints[0].id;
      moveToSelectedSpawn();
    }
  });
  
  // Move when selection changes manually
  $effect(() => {
    if (selectedSpawnId && !movedToSpawn) {
      moveToSelectedSpawn();
    }
  });
</script>

{#if !unmounting && $needsSpawn}
<div class="spawn-overlay">
  <div class="spawn-container">
    <h2>Choose Your Starting Location</h2>
    
    {#if $currentPlayer}
      <div class="race-info">
        Playing as: <strong>{$currentPlayer.race}</strong>
      </div>
    {/if}
    
    {#if loading}
      <div class="loading">Loading spawn points...</div>
    {:else if error}
      <div class="error">
        <p>{error}</p>
        <button on:click={() => location.reload()}>Retry</button>
      </div>
    {:else if filteredSpawnPoints.length === 0}
      <div class="error">
        <p>No spawn points available for your race.</p>
        <button on:click={() => location.reload()}>Retry</button>
      </div>
    {:else}
      <div class="spawn-list">
        {#each filteredSpawnPoints as spawn}
          <div 
            class="spawn-option" 
            class:selected={selectedSpawnId === spawn.id}
            on:click={() => {
              selectedSpawnId = spawn.id;
              moveToSelectedSpawn();
            }}
          >
            <div class="spawn-name">{spawn.name}</div>
            <div class="spawn-faction">{spawn.faction || 'Any'} Territory</div>
            <div class="spawn-coords">({spawn.x}, {spawn.y})</div>
          </div>
        {/each}
      </div>
      
      {#if selectedSpawn}
        <div class="selected-spawn-details">
          <h3>{selectedSpawn.name}</h3>
          <p>{selectedSpawn.description}</p>
          <div class="coordinates">
            Location: ({selectedSpawn.x}, {selectedSpawn.y})
          </div>
        </div>
      {/if}
      
      <button 
        class="spawn-button" 
        on:click={spawnPlayer} 
        disabled={spawning || !selectedSpawnId}
      >
        {#if spawning}
          Spawning...
        {:else}
          Spawn Here
        {/if}
      </button>
    {/if}
  </div>
</div>
{/if}

<style>
  .spawn-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }
  
  .spawn-container {
    background: var(--color-dark-navy);
    border: 2px solid var(--color-blue);
    border-radius: 8px;
    width: 90%;
    max-width: 600px;
    padding: 20px;
    box-shadow: 0 0 20px rgba(0, 100, 255, 0.5);
    color: white;
    max-height: 90vh;
    overflow-y: auto;
    animation: spawn-appear 0.3s ease-out;
  }
  
  @keyframes spawn-appear {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  h2 {
    margin-top: 0;
    text-align: center;
    color: var(--color-blue-light);
    font-family: var(--font-heading);
  }
  
  .race-info {
    text-align: center;
    margin-bottom: 15px;
    padding: 5px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
  }
  
  .spawn-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 10px;
    margin: 15px 0;
  }
  
  .spawn-option {
    padding: 10px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.2s;
    background: rgba(0, 20, 40, 0.5);
  }
  
  .spawn-option:hover {
    background: rgba(0, 60, 120, 0.3);
    border-color: rgba(255, 255, 255, 0.4);
  }
  
  .spawn-option.selected {
    background: rgba(0, 100, 200, 0.3);
    border-color: var(--color-blue);
    box-shadow: 0 0 8px rgba(0, 100, 255, 0.5);
  }
  
  .spawn-name {
    font-weight: bold;
    font-size: 1.1em;
    margin-bottom: 3px;
    color: var(--color-blue-light);
  }
  
  .spawn-faction {
    font-style: italic;
    margin-bottom: 5px;
  }
  
  .spawn-coords {
    font-family: monospace;
    color: rgba(255, 255, 255, 0.7);
  }
  
  .selected-spawn-details {
    margin: 20px 0;
    padding: 15px;
    background: rgba(0, 40, 80, 0.5);
    border-radius: 5px;
    border-left: 3px solid var(--color-blue);
  }
  
  .selected-spawn-details h3 {
    margin-top: 0;
    color: var(--color-blue-light);
  }
  
  .coordinates {
    margin-top: 10px;
    font-family: monospace;
    color: rgba(255, 255, 255, 0.8);
  }
  
  .spawn-button {
    display: block;
    width: 100%;
    padding: 12px;
    border: none;
    border-radius: 5px;
    background: var(--color-blue);
    color: white;
    font-size: 1.1em;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
    margin-top: 15px;
  }
  
  .spawn-button:hover:not(:disabled) {
    background: var(--color-blue-light);
    transform: translateY(-2px);
  }
  
  .spawn-button:disabled {
    background: #555;
    cursor: not-allowed;
    opacity: 0.7;
  }
  
  .loading, .error {
    padding: 20px;
    text-align: center;
  }
  
  .error {
    color: #ff6b6b;
  }
  
  .error button {
    margin-top: 10px;
    padding: 8px 16px;
    background: #555;
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;
  }
  
  @media (max-width: 600px) {
    .spawn-list {
      grid-template-columns: 1fr;
    }
  }
</style>
