<script>
  import { ref, get as dbGet, update } from 'firebase/database';
  import { db } from '../../lib/firebase/database.js';
  import { game, currentPlayer, needsSpawn } from '../../lib/stores/game.js';
  import { moveTarget } from '../../lib/stores/map.js';
  import Torch from '../icons/Torch.svelte';

  // Using Svelte 5 $props rune
  const { onSpawn = () => {} } = $props();

  // Component state using $state rune
  let selectedSpawnId = $state(null);
  let loading = $state(true);
  let spawning = $state(false);
  let error = $state(null);
  let movedToSpawn = $state(false);

  // Function to consistently calculate chunk key
  function getChunkKey(x, y) {
    const CHUNK_SIZE = 20;
    return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;
  }

  // Add debug logging to understand game store state
  let gameWorldState = $state(null);

  // Better derivation directly accessing the structure from backup.json
  const allSpawnPoints = $derived(() => {
    // Store the game state in a variable for debugging
    gameWorldState = $game.worldInfo[$game.currentWorld];
    
    // Return early if required data isn't available
    if (!$game.currentWorld || !$game.worldInfo[$game.currentWorld]) {
      console.log('No world or world info available yet', {
        currentWorld: $game.currentWorld,
        hasWorldInfo: !!$game.worldInfo[$game.currentWorld]
      });
      return [];
    }

    const worldInfo = $game.worldInfo[$game.currentWorld];
    // Check for the exact path structure as seen in backup.json
    if (!worldInfo.info || !worldInfo.info.spawns) {
      console.log('World info lacks spawn data', {
        hasInfo: !!worldInfo.info,
        hasSpawns: !!worldInfo.info?.spawns,
        worldInfo
      });
      return [];
    }

    const spawnsData = worldInfo.info.spawns;
    console.log('Found spawn data:', spawnsData);
    
    // Map the spawns object to an array of spawn points
    return Object.entries(spawnsData).map(([locationKey, spawnData]) => {
      if (spawnData && typeof spawnData === 'object' && spawnData.id) {
        return {
          id: spawnData.id,
          name: spawnData.name || `Spawn ${locationKey}`,
          description: spawnData.description || "A place to enter the world",
          race: spawnData.race,
          x: spawnData.position.x,
          y: spawnData.position.y,
          locationKey
        };
      }
      return null;
    }).filter(spawn => spawn !== null);
  });

  // Add a fallback for when no spawns are available from the game store
  const fallbackSpawns = $derived(() => {
    if (allSpawnPoints.length > 0) return allSpawnPoints;
    
    // If no spawns are found in the store but we know the world, provide some fallbacks
    // based on the structure in backup.json
    if ($game.currentWorld === 'ancient-lands') {
      console.log('Using fallback spawns for ancient-lands');
      return [
        {
          id: 'structure_al_human_spawn',
          name: 'Stoneguard Citadel',
          description: 'A rugged frontier settlement where hardy humans carve out a living',
          race: 'human',
          x: 5,
          y: 5
        },
        {
          id: 'structure_al_elf_spawn',
          name: 'Ancient Arborium',
          description: 'An elven city built around the oldest living trees in the realm',
          race: 'elf',
          x: -4,
          y: 6
        },
        {
          id: 'structure_al_goblin_spawn',
          name: 'Boneridge Camp',
          description: 'A resourceful goblin settlement built from the remains of ancient beasts',
          race: 'goblin',
          x: 15,
          y: -3
        },
        {
          id: 'structure_al_dwarf_spawn',
          name: 'Deepforge Stronghold',
          description: 'The ancestral mountain home of the dwarf clans',
          race: 'dwarf',
          x: 12,
          y: 4
        },
        {
          id: 'structure_al_fairy_spawn',
          name: 'Whisperwind Circle',
          description: 'A fairy settlement where the ancient spirits still speak',
          race: 'fairy',
          x: 10,
          y: 8
        }
      ];
    }
    
    return [];
  });

  // Filter spawn points to match player's race - now using fallback spawns
  function getFilteredSpawns(spawns) {
    if (!$currentPlayer || !$currentPlayer.race) return spawns;
    
    const playerRace = $currentPlayer.race.toLowerCase();
    const filtered = spawns.filter(spawn => 
      !spawn.race || spawn.race.toLowerCase() === playerRace
    );
    
    console.log(`Filtering ${spawns.length} spawns for race "${playerRace}":`, filtered);
    return filtered;
  }

  const filteredSpawnPoints = $derived(getFilteredSpawns(fallbackSpawns));
  const selectedSpawn = $derived(allSpawnPoints.find(s => s.id === selectedSpawnId));
  
  // Initialize component
  $effect(() => {
    console.log('SpawnMenu component initializing...', {
      worldInfo: $game.worldInfo,
      currentWorld: $game.currentWorld,
      gameStoreState: $game
    });
    loading = true;
    error = null;
    
    // The data loading happens through the reactivity system now, 
    // just check if we have data available
    if (fallbackSpawns.length > 0) {
      console.log(`Found ${fallbackSpawns.length} spawn points:`, fallbackSpawns);
      
      // Filter spawns by race and select the first one
      if (filteredSpawnPoints.length > 0) {
        selectedSpawnId = filteredSpawnPoints[0].id;
        console.log(`Selected spawn: ${selectedSpawnId}`);
        
        // If there's only one spawn option, automatically move the map there
        if (filteredSpawnPoints.length === 1) {
          moveTarget(filteredSpawnPoints[0].x, filteredSpawnPoints[0].y);
          movedToSpawn = true;
          console.log(`Automatically moved to spawn: ${filteredSpawnPoints[0].x}, ${filteredSpawnPoints[0].y}`);
        }
      } else {
        console.warn('No spawn points available for race:', $currentPlayer?.race);
      }
      
      loading = false;
    } else if (!$game.worldInfo[$game.currentWorld]) {
      // Still waiting for world info to load
      console.log('Waiting for world info to be available...');
      // The loading state stays true until data is available
    } else {
      // We have world info but no spawn points
      console.error('No spawn points available in this world', {
        worldInfo: $game.worldInfo[$game.currentWorld],
        hasInfo: !!$game.worldInfo[$game.currentWorld]?.info,
        hasSpawns: !!$game.worldInfo[$game.currentWorld]?.info?.spawns
      });
      error = "No spawn points available in this world";
      loading = false;
    }
  });
  
  // Move when selection changes
  $effect(() => {
    if (selectedSpawnId && !movedToSpawn) {
      const spawn = allSpawnPoints.find(s => s.id === selectedSpawnId);
      if (spawn) {
        moveTarget(spawn.x, spawn.y);
        movedToSpawn = true;
        console.log(`Moved to selected spawn: ${spawn.x}, ${spawn.y}`);
      }
    }
  });

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
      const spawn = allSpawnPoints.find(s => s.id === selectedSpawnId);
      if (!spawn) {
        throw new Error("Selected spawn point not found");
      }
      
      // Ensure map is moved to the spawn location
      if (!movedToSpawn) {
        moveTarget(spawn.x, spawn.y);
        movedToSpawn = true;
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
        displayName: $currentPlayer.displayName || $currentPlayer.email,
        race: $currentPlayer.race || 'human',
        lastActive: Date.now()
      });
      
      // Notify parent component of successful spawn
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

  // Format text with proper capitalization
  function formatText(text) {
    if (!text) return '';
    return text.toString().replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
</script>

{#if $needsSpawn}
<div class="spawn-overlay">
  <div class="spawn-container">
    <h2>Choose Your Starting Location</h2>
    
    {#if $currentPlayer}
      <div class="race-info">
        Playing as: <strong>{formatText($currentPlayer.race)}</strong>
      </div>
    {/if}
    
    {#if loading}
      <div class="loading-indicator">
        <div class="spinner"></div>
        <p>Loading spawn points...</p>
      </div>
    {:else if error}
      <div class="error-message">
        <p>{error}</p>
        <button class="retry-button" on:click={() => location.reload()}>Retry</button>
      </div>
    {:else if filteredSpawnPoints.length === 0}
      <div class="error-message">
        <p>No spawn points available for your race: {formatText($currentPlayer?.race || 'Unknown')}</p>
        <button class="retry-button" on:click={() => location.reload()}>Retry</button>
      </div>
    {:else}
      <div class="spawn-list">
        {#each filteredSpawnPoints as spawn (spawn.id)}
          <div 
            class="spawn-option" 
            class:selected={selectedSpawnId === spawn.id}
            on:click={() => {
              selectedSpawnId = spawn.id;
              movedToSpawn = false;
            }}
          >
            <div class="spawn-icon">
              <Torch size="1.4em" extraClass="torch-icon" />
            </div>
            <div class="spawn-info">
              <div class="spawn-name">{spawn.name}</div>
              {#if spawn.race}
                <div class="spawn-race">{formatText(spawn.race)} Territory</div>
              {/if}
              <div class="spawn-coords">({spawn.x}, {spawn.y})</div>
            </div>
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
          <div class="spinner"></div> Spawning...
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
    background: var(--color-dark-navy, #1a2635);
    border: 2px solid var(--color-blue, #4a90e2);
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
    color: var(--color-blue-light, #66a6ff);
    font-family: var(--font-heading, sans-serif);
  }
  
  .race-info {
    text-align: center;
    margin-bottom: 15px;
    padding: 10px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
  }
  
  .spawn-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 15px 0;
    max-height: 300px;
    overflow-y: auto;
  }
  
  .spawn-option {
    padding: 12px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.2s;
    background: rgba(0, 20, 40, 0.5);
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .spawn-option:hover {
    background: rgba(0, 60, 120, 0.3);
    border-color: rgba(255, 255, 255, 0.4);
    transform: translateY(-2px);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  }
  
  .spawn-option.selected {
    background: rgba(0, 100, 200, 0.3);
    border-color: var(--color-blue, #4a90e2);
    box-shadow: 0 0 8px rgba(0, 100, 255, 0.5);
  }
  
  .spawn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-blue-light, #66a6ff);
  }
  
  :global(.torch-icon) {
    filter: drop-shadow(0 0 5px rgba(0, 200, 255, 0.7));
  }
  
  .spawn-info {
    flex: 1;
  }
  
  .spawn-name {
    font-weight: bold;
    font-size: 1.1em;
    margin-bottom: 3px;
    color: var(--color-blue-light, #66a6ff);
  }
  
  .spawn-race {
    font-style: italic;
    margin-bottom: 5px;
    opacity: 0.8;
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
    border-left: 3px solid var(--color-blue, #4a90e2);
  }
  
  .selected-spawn-details h3 {
    margin-top: 0;
    color: var(--color-blue-light, #66a6ff);
  }
  
  .coordinates {
    margin-top: 10px;
    font-family: monospace;
    color: rgba(255, 255, 255, 0.8);
  }
  
  .spawn-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 12px;
    border: none;
    border-radius: 5px;
    background: var(--color-blue, #4a90e2);
    color: white;
    font-size: 1.1em;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
    margin-top: 15px;
    gap: 8px;
  }
  
  .spawn-button:hover:not(:disabled) {
    background: var(--color-blue-light, #66a6ff);
    transform: translateY(-2px);
  }
  
  .spawn-button:disabled {
    background: #555;
    cursor: not-allowed;
    opacity: 0.7;
  }
  
  .loading-indicator, .error-message {
    padding: 20px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  
  .error-message {
    color: #ff6b6b;
  }
  
  .retry-button {
    margin-top: 10px;
    padding: 8px 16px;
    background: #555;
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;
  }
  
  .spinner {
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top: 3px solid white;
    width: 20px;
    height: 20px;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>
