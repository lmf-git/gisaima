<script>
  import { ref, get as dbGet, update } from 'firebase/database';
  import { db } from '../../lib/firebase/database.js';
  import { game, currentPlayer } from '../../lib/stores/game.js';
  import { moveTarget } from '../../lib/stores/map.js';

  // Using the Svelte 5 $props rune
  const { onSpawn = () => {} } = $props();

  // Component state using $state rune
  let spawnPoints = $state([]);
  let selectedSpawnId = $state(null);
  let loading = $state(true);
  let spawning = $state(false);
  let error = $state(null);
  let movedToSpawn = $state(false);

  // Function to consistently calculate chunk key
  function getChunkKey(x, y) {
    const CHUNK_SIZE = 20;
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkY = Math.floor(y / CHUNK_SIZE);
    return `${chunkX},${chunkY}`;
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
  
  // Move map to the selected spawn location
  function moveToSelectedSpawn() {
    if (!selectedSpawnId) return;
    
    const spawn = spawnPoints.find(s => s.id === selectedSpawnId);
    if (!spawn) return;
    
    console.log(`Moving map to spawn location: ${spawn.x}, ${spawn.y}`);
    moveTarget(spawn.x, spawn.y);
    movedToSpawn = true;
  }
  
  // Load spawn points from the database and filter by race
  async function loadSpawnPoints() {
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
        
        for (const [locationKey, structureId] of Object.entries(spawns)) {
          const location = parseSpawnLocation(locationKey);
          if (!location) continue;
          
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
      console.error("Error loading spawn points:", err);
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
      
      const spawn = spawnPoints.find(s => s.id === selectedSpawnId);
      if (!spawn) {
        throw new Error("Selected spawn point not found");
      }
      
      if (!movedToSpawn) {
        console.log(`Ensuring map is positioned at spawn location: ${spawn.x}, ${spawn.y}`);
        moveTarget(spawn.x, spawn.y);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      const playerRef = ref(db, `players/${$currentPlayer.uid}/worlds/${$game.currentWorld}`);
      
      await update(playerRef, {
        alive: true,
        lastLocation: {
          x: spawn.x,
          y: spawn.y,
          timestamp: Date.now()
        }
      });
      
      const chunkKey = getChunkKey(spawn.x, spawn.y);
      const tileKey = `${spawn.x},${spawn.y}`;
      const worldPlayerRef = ref(db, `worlds/${$game.currentWorld}/chunks/${chunkKey}/${tileKey}/players/${$currentPlayer.uid}`);
      
      await update(worldPlayerRef, {
        uid: $currentPlayer.uid,
        displayName: $currentPlayer.displayName,
        race: $currentPlayer.race,
        lastActive: Date.now()
      });

      game.update(state => {
        if (state.playerWorldData) {
          return {
            ...state,
            playerWorldData: {
              ...state.playerWorldData,
              alive: true,
              lastLocation: {
                x: spawn.x,
                y: spawn.y,
                timestamp: Date.now()
              }
            }
          };
        }
        return state;
      });
      
      onSpawn({ x: spawn.x, y: spawn.y });
      
      return true;
    } catch (err) {
      console.error("Error spawning player:", err);
      error = "Failed to spawn player: " + err.message;
      return false;
    } finally {
      spawning = false;
    }
  }
  
  // Initialize loading of spawn points - simplified without redundant guards
  $effect(async () => {
    loading = true;
    error = null;
    
    try {
      spawnPoints = await loadSpawnPoints();
      
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
  
  // Using $derived for reactive calculations instead of $:
  const filteredSpawnPoints = $derived(getFilteredSpawns(spawnPoints));
  const selectedSpawn = $derived(spawnPoints.find(spawn => spawn.id === selectedSpawnId));
  
  // Auto-move to spawn location when there's only one option
  $effect(() => {
    if (filteredSpawnPoints.length === 1 && !movedToSpawn && !loading) {
      console.log('Single spawn option detected, auto-focusing map');
      // Auto-select the only spawn point
      selectedSpawnId = filteredSpawnPoints[0].id;
      // Move map to that location immediately
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
