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
  let debugLogged = $state(false);

  // Function to consistently calculate chunk key
  function getChunkKey(x, y) {
    const CHUNK_SIZE = 20;
    return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;
  }

  // Get spawn points directly from world info - FIXED to handle Firebase data structure
  const spawnPoints = $derived(() => {
    if (!$game.currentWorld) return [];
    
    const worldData = $game.world[$game.currentWorld];
    if (!worldData) return [];
    
    console.log('[SpawnMenu DEBUG] Full world data:', worldData);
    
    // Debug log the complete world structure
    if (!debugLogged) {
      console.log('[SpawnMenu DEBUG] Complete world data structure:', worldData);
      debugLogged = true;
    }
    
    // Try different places where spawns might be located
    let spawns = null;
    
    // Case 1: Directly at world.spawns (most common in real Firebase data)
    if (worldData.spawns) {
      console.log('[SpawnMenu] Found spawns directly at world.spawns');
      spawns = Object.values(worldData.spawns);
    }
    // Case 2: Check inside info.spawns (where it should be according to data model)
    else if (worldData.info?.spawns) {
      console.log('[SpawnMenu] Found spawns in world.info.spawns');
      spawns = Object.values(worldData.info.spawns);
    }
    // Case 3: Look for spawn objects directly in the world (based on type)
    else if (Object.values(worldData).some(v => v?.type === 'spawn')) {
      console.log('[SpawnMenu] Found spawns as objects with type=spawn');
      spawns = Object.values(worldData).filter(item => item?.type === 'spawn');
    }
    // Case 4: Check if the spawns might be in chunks data
    else if (worldData.chunks) {
      console.log('[SpawnMenu] Attempting to find spawns in chunks data');
      
      // Look through chunks to find structures marked as spawns
      const foundSpawns = [];
      
      try {
        Object.values(worldData.chunks).forEach(chunk => {
          if (!chunk) return;
          
          Object.values(chunk).forEach(tile => {
            if (tile?.structure?.type === 'spawn') {
              // Convert tile structure to spawn format with position
              const coords = tile.structure.position || 
                             { x: parseInt(Object.keys(chunk)[0]?.split(',')[0]), 
                               y: parseInt(Object.keys(chunk)[0]?.split(',')[1]) };
              
              foundSpawns.push({
                ...tile.structure,
                position: coords,
                id: tile.structure.id || `spawn_${coords.x}_${coords.y}`
              });
            }
          });
        });
        
        if (foundSpawns.length > 0) {
          spawns = foundSpawns;
        }
      } catch (e) {
        console.error('[SpawnMenu] Error parsing chunks for spawns:', e);
      }
    }
    
    if (spawns && spawns.length > 0) {
      console.log('[SpawnMenu] Found spawns:', {
        count: spawns.length,
        firstSpawn: spawns[0],
      });
      return spawns;
    }
    
    // Last resort: Check if the world object itself contains the required fields
    if (worldData.seed && !spawns) {
      console.log('[SpawnMenu DEBUG] Checking backup.json structure...');
      
      // Read from Firebase at a different path as a last resort
      const worldRef = ref(db, `worlds/${$game.currentWorld}`);
      dbGet(worldRef).then(snapshot => {
        if (snapshot.exists()) {
          const fullWorld = snapshot.val();
          console.log('[SpawnMenu] Found full world data:', {
            hasInfo: !!fullWorld.info,
            hasInfoSpawns: !!fullWorld.info?.spawns,
            spawnCount: fullWorld.info?.spawns ? Object.keys(fullWorld.info.spawns).length : 0
          });
          
          // If we found spawns in the full data, update the game store
          if (fullWorld.info?.spawns) {
            const spawnsArray = Object.values(fullWorld.info.spawns);
            game.update(state => ({
              ...state,
              world: {
                ...state.world,
                [$game.currentWorld]: {
                  ...state.world[$game.currentWorld],
                  spawns: fullWorld.info.spawns // Add spawns directly to world data
                }
              }
            }));
            console.log('[SpawnMenu] Updated game store with spawns from Firebase');
          }
        }
      }).catch(err => {
        console.error('[SpawnMenu] Error fetching full world data:', err);
      });
    }
    
    console.log('[SpawnMenu DEBUG] No spawns found:', {
      currentWorld: $game.currentWorld,
      worldKeys: worldData ? Object.keys(worldData) : [],
      worldInfoKeys: worldData?.info ? Object.keys(worldData.info) : ['info not found'],
    });
    
    return [];
  });

  // Get the selected spawn
  const selectedSpawn = $derived(() => {
    if (!selectedSpawnId || !Array.isArray(spawnPoints)) return null;
    return spawnPoints.find(s => s.id === selectedSpawnId);
  });
  
  // Initialize component
  $effect(() => {
    // Reset loading when data is available
    if ($game?.currentWorld && $game.world[$game.currentWorld]) {
      loading = false;
      
      // Log full world data structure once for debugging
      if (!debugLogged && $game.world[$game.currentWorld]) {
        const worldData = $game.world[$game.currentWorld];
        console.log('[SpawnMenu DEBUG] World data structure:', {
          worldId: $game.currentWorld,
          hasInfo: !!worldData.info,
          hasInfoSpawns: !!(worldData.info?.spawns),
          infoKeys: worldData.info ? Object.keys(worldData.info) : [],
          worldKeys: Object.keys(worldData),
        });
        // Try to access spawns directly for debugging
        if (worldData.info?.spawns) {
          console.log('Direct inspection of info.spawns:', Object.values(worldData.info.spawns));
        }
        debugLogged = true;
      }
      
      // Select first spawn point if available
      if (spawnPoints.length > 0) {
        selectedSpawnId = spawnPoints[0].id;
        console.log(`Selected spawn: ${selectedSpawnId}`);
        
        // Auto-move to the spawn location
        if (spawnPoints.length === 1) {
          moveTarget(spawnPoints[0].position.x, spawnPoints[0].position.y);
          movedToSpawn = true;
        }
      } else {
        console.warn('[SpawnMenu DEBUG] No spawn points available after loading completed');
        
        // Force reload world info to ensure we have fresh data
        if ($game.refreshWorldInfo) {
          console.log('Attempting to refresh world info to find spawns');
          $game.refreshWorldInfo($game.currentWorld).catch(err => 
            console.error('Failed to refresh world info:', err)
          );
        }
      }
    }
  });

  // Move when selection changes
  $effect(() => {
    if (selectedSpawnId && !movedToSpawn && Array.isArray(spawnPoints)) {
      const spawn = spawnPoints.find(s => s.id === selectedSpawnId);
      if (spawn?.position) {
        moveTarget(spawn.position.x, spawn.position.y);
        movedToSpawn = true;
        console.log(`Moved to selected spawn: ${spawn.position.x}, ${spawn.position.y}`);
      }
    }
  });

  // Add debugging for player race information
  $effect(() => {
    console.log('Current player data in SpawnMenu:', {
      playerExists: !!$currentPlayer,
      playerRace: $currentPlayer?.race,
      worldData: $currentPlayer?.worldData,
      playerData: $game.playerData, // Updated reference
    });
  });
  
  // Add debugging for world data changes
  $effect(() => {
    if ($game?.currentWorld) {
      console.log('[SpawnMenu DEBUG] World data updated:', {
        worldId: $game.currentWorld,
        hasWorldData: !!$game.world[$game.currentWorld],
        hasInfo: !!$game.world[$game.currentWorld]?.info,
        hasSpawns: !!$game.world[$game.currentWorld]?.info?.spawns,
        spawnCount: $game.world[$game.currentWorld]?.info?.spawns ? 
          Object.keys($game.world[$game.currentWorld].info.spawns).length : 0
      });
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
      const spawn = spawnPoints.find(s => s.id === selectedSpawnId);
      if (!spawn || !spawn.position) {
        throw new Error("Selected spawn point not found or invalid");
      }
      
      const x = spawn.position.x;
      const y = spawn.position.y;
      
      // Ensure map is moved to the spawn location
      if (!movedToSpawn) {
        moveTarget(x, y);
        movedToSpawn = true;
      }
      
      // Update player status in the database
      const playerRef = ref(db, `players/${$currentPlayer.uid}/worlds/${$game.currentWorld}`);
      
      await update(playerRef, {
        alive: true,
        lastLocation: {
          x: x,
          y: y,
          timestamp: Date.now()
        }
      });
      
      // Add player to the chunk in the world database
      const chunkKey = getChunkKey(x, y);
      const tileKey = `${x},${y}`;
      const worldPlayerRef = ref(db, `worlds/${$game.currentWorld}/chunks/${chunkKey}/${tileKey}/players/${$currentPlayer.uid}`);
      
      await update(worldPlayerRef, {
        uid: $currentPlayer.uid,
        displayName: $currentPlayer.displayName || $currentPlayer.email,
        race: $currentPlayer.race || 'human',
        lastActive: Date.now()
      });
      
      // Notify parent component of successful spawn
      onSpawn({ x, y });
      
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
    {:else if !Array.isArray(spawnPoints) || spawnPoints.length === 0}
      <div class="error-message">
        <p>No spawn points available in this world</p>
        <button class="retry-button" on:click={() => {
          debugLogged = false;
          // Force direct fetch from backup.json structure
          const worldRef = ref(db, `worlds/${$game.currentWorld}/info/spawns`);
          dbGet(worldRef).then(snapshot => {
            if (snapshot.exists()) {
              const spawns = snapshot.val();
              console.log('[SpawnMenu] Direct fetch found spawns:', spawns);
              // Update the game store with these spawns
              game.update(state => ({
                ...state,
                world: {
                  ...state.world,
                  [$game.currentWorld]: {
                    ...state.world[$game.currentWorld],
                    spawns: spawns  // Add spawns directly to world data
                  }
                }
              }));
            } else {
              console.log('[SpawnMenu] No spawns found in direct fetch');
            }
            location.reload();
          }).catch(err => {
            console.error('[SpawnMenu] Error in direct fetch:', err);
            location.reload();
          });
        }}>Retry</button>
        
        <!-- Add debug information for development -->
        <details class="debug-info">
          <summary>Debug Info</summary>
          <pre>
            Current World: {$game.currentWorld || 'None'}
            World Data: {$game.world[$game.currentWorld] ? 'Available' : 'Missing'}
            Info Exists: {$game.world[$game.currentWorld]?.info ? 'Yes' : 'No'}
            Spawns Exists: {$game.world[$game.currentWorld]?.info?.spawns ? 'Yes' : 'No'}
          </pre>
        </details>
      </div>
    {:else}
      <div class="spawn-list">
        {#each spawnPoints as spawn (spawn.id)}
          <button 
            type="button"
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
              <div class="spawn-coords">({spawn.position.x}, {spawn.position.y})</div>
            </div>
          </button>
        {/each}
      </div>
      
      {#if selectedSpawn}
        <div class="selected-spawn-details">
          <h3>{selectedSpawn.name}</h3>
          <p>{selectedSpawn.description}</p>
          <div class="coordinates">
            Location: ({selectedSpawn.position.x}, {selectedSpawn.position.y})
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
    text-align: left;
    width: 100%;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    box-sizing: border-box;
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

  /* Add style for debug info */
  .debug-info {
    margin-top: 1rem;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    text-align: left;
    font-size: 0.8rem;
  }
  
  .debug-info summary {
    cursor: pointer;
    color: #aaa;
  }
  
  .debug-info pre {
    margin: 0.5rem 0 0;
    white-space: pre-wrap;
    color: #ddd;
  }
</style>
