<script>
  import { ref, update } from 'firebase/database';
  import { db } from '../../lib/firebase/database.js';
  import { game, currentPlayer, needsSpawn } from '../../lib/stores/game.js';
  import { moveTarget } from '../../lib/stores/map.js';
  import Torch from '../icons/Torch.svelte';

  // Add debug logging flag first to avoid initialization issues
  const DEBUG_MODE = true;
  const debugLog = (...args) => DEBUG_MODE && console.log(...args);

  // Using Svelte 5 $props rune
  const { onSpawn = () => {} } = $props();

  // Component state using $state rune
  let selectedSpawnId = $state(null);
  let loading = $state(true);
  let spawning = $state(false);
  let error = $state(null);
  let movedToSpawn = $state(false);
  let showDebugView = $state(DEBUG_MODE);
  let spawnCheckComplete = $state(false);
  
  // Add tracking for player data initialization
  let playerDataInitialized = $state(false);
  let initializationAttempts = $state(0);
  const MAX_INIT_ATTEMPTS = 5;
  
  // Add a state variable to track world data
  let worldData = $state(null);
  let spawnDataSource = $state({ source: 'none', keys: [], worldKeys: [], infoKeys: [] });
  let spawnPoints = $state([]);
  let debugData = $state({ playerData: {}, spawnSource: '', spawnKeys: [], initState: {} });
  
  // Function to calculate chunk key
  function getChunkKey(x, y) {
    const chunkX = Math.floor(x / 20);
    const chunkY = Math.floor(y / 20);
    return `${chunkX},${chunkY}`;
  }

  const CHUNK_SIZE = 20;

  // Create derived values with proper separation from side effects
  $effect(() => {
    // Initialize with current game world data when it changes
    const currentWorldId = $game.worldKey || $game.currentWorld;
    const currentWorldData = currentWorldId ? $game.world[currentWorldId] : null;
    
    if (currentWorldData) {
      worldData = currentWorldData;
      debugLog('World data loaded:', {
        worldId: currentWorldId,
        hasSpawns: !!currentWorldData.spawns,
        hasInfoProperty: !!currentWorldData.info,
        hasSpawnsProperty: !!currentWorldData.spawns,
        hasInfoSpawnsProperty: !!currentWorldData.info?.spawns,
      });
    } else {
      debugLog('No world data available yet');
    }
  });

  // Separate effect for player data initialization
  $effect(() => {
    // Check if player data is available when currentPlayer changes
    if ($currentPlayer && $game.currentWorld) {
      const initialized = !!$currentPlayer.uid && 
                          !!$currentPlayer.race && 
                          $currentPlayer.world === $game.currentWorld;
      
      if (initialized && !playerDataInitialized) {
        debugLog('Player data initialized:', {
          uid: $currentPlayer.uid,
          world: $currentPlayer.world,
          race: $currentPlayer.race,
          alive: $currentPlayer.alive,
          hasLocation: !!$currentPlayer.lastLocation
        });
        playerDataInitialized = true;
      }
      
      // Update debug data
      debugData.playerData = {
        uid: $currentPlayer.uid,
        world: $currentPlayer.world,
        race: $currentPlayer.race,
        alive: $currentPlayer.alive || false,
        hasLastLocation: !!$currentPlayer.lastLocation
      };
      
      debugData.initState = {
        playerDataInitialized,
        attemptsLeft: MAX_INIT_ATTEMPTS - initializationAttempts,
        needsSpawn: $needsSpawn
      };
    }
  });
  
  // Separate effect for spawn points
  $effect(() => {
    // Find available spawn points when world data changes
    if (worldData) {
      let foundSpawns = [];
      let source = 'none';
      let spawnKeys = [];
      
      // Case 1: Check info.spawns (as in backup.json)
      if (worldData.info?.spawns) {
        foundSpawns = Object.entries(worldData.info.spawns).map(([key, spawn]) => ({
          key,
          ...spawn
        }));
        source = 'info.spawns';
        spawnKeys = Object.keys(worldData.info.spawns);
      }
      // Case 2: Check direct spawns property
      else if (worldData.spawns) {
        foundSpawns = Object.entries(worldData.spawns).map(([key, spawn]) => ({
          key,
          ...spawn
        }));
        source = 'direct';
        spawnKeys = Object.keys(worldData.spawns);
      }
      // Case 3: Look in chunks (early exit if found elsewhere)
      else if (worldData.chunks && foundSpawns.length === 0) {
        // This would be more complex - omitting for brevity
        source = 'chunks';
      }
      
      if (foundSpawns.length > 0) {
        debugLog('SpawnMenu - Spawn data source:', {
          source,
          keysCount: spawnKeys.length,
          keys: spawnKeys
        });
        
        if (foundSpawns.length > 0) {
          debugLog('SpawnMenu - Example spawn entry:', {
            key: spawnKeys[0],
            data: foundSpawns[0]
          });
        }
        
        // Update component state
        spawnPoints = foundSpawns;
        spawnDataSource = { 
          source, 
          keys: spawnKeys,
          worldKeys: worldData ? Object.keys(worldData) : [],
          infoKeys: worldData?.info ? Object.keys(worldData.info) : []
        };
        
        // Update debug tracking
        debugData.spawnSource = source;
        debugData.spawnKeys = spawnKeys;
        
        // We found spawn points, we're done loading
        loading = false;
      } else {
        debugLog('No spawn points found in world data');
        loading = false;
        error = 'No spawn points found in this world';
      }
    }
  });
  
  // Function to spawn player at selected location
  async function spawnAtLocation(spawnPoint) {
    if (!spawnPoint || !$game.worldKey || !$currentPlayer?.uid) {
      error = 'Missing required data for spawning';
      return;
    }
    
    try {
      spawning = true;
      
      // Get position from spawn point - handle different formats
      let position = { x: 0, y: 0 };
      
      if (spawnPoint.x !== undefined && spawnPoint.y !== undefined) {
        // Use direct x,y properties if available
        position = { x: spawnPoint.x, y: spawnPoint.y };
      } else if (spawnPoint.position) {
        // Handle position object with direct x,y coordinates
        if (spawnPoint.position.x !== undefined && spawnPoint.position.y !== undefined) {
          position = { x: spawnPoint.position.x, y: spawnPoint.position.y };
        } 
        // Handle chunk-based coordinates (from "chunkX:chunkY:tileX:tileY" format)
        else if (
          spawnPoint.position.chunkX !== undefined && 
          spawnPoint.position.chunkY !== undefined &&
          spawnPoint.position.x !== undefined &&
          spawnPoint.position.y !== undefined
        ) {
          // Calculate global position from chunk coordinates
          position = { 
            x: (spawnPoint.position.chunkX * CHUNK_SIZE) + spawnPoint.position.x,
            y: (spawnPoint.position.chunkY * CHUNK_SIZE) + spawnPoint.position.y
          };
        }
      }
      
      // Move map to spawn position first for better UX
      moveTarget(position.x, position.y);
      movedToSpawn = true;
      
      // Reference to player's world data
      const playerWorldRef = ref(db, `players/${$currentPlayer.uid}/worlds/${$game.worldKey}`);
      
      // Update the player data to include position and mark as alive
      await update(playerWorldRef, {
        alive: true,
        lastLocation: {
          x: position.x,
          y: position.y,
          timestamp: Date.now()
        },
        // Include any other spawn-related data here
        spawnId: spawnPoint.id || spawnPoint.key
      });
      
      // Also create the player entity in the world - this is the missing step
      const tileRef = ref(db, `worlds/${$game.worldKey}/chunks/${getChunkKey(position.x, position.y)}/${position.x % CHUNK_SIZE},${position.y % CHUNK_SIZE}/players/${$currentPlayer.uid}`);
      
      await update(tileRef, {
        uid: $currentPlayer.uid,
        race: $currentPlayer.race,
        displayName: $currentPlayer.displayName || '',
        timestamp: Date.now()
      });
      
      // Wait a moment for the data to propagate
      setTimeout(() => {
        spawning = false;
        
        // Call the onSpawn callback to notify parent components
        if (typeof onSpawn === 'function') {
          onSpawn({
            position,
            spawnId: spawnPoint.id || spawnPoint.key
          });
        }
      }, 1000);
      
    } catch (err) {
      console.error('Error spawning player:', err);
      error = `Failed to spawn: ${err.message}`;
      spawning = false;
    }
  }
</script>

{#if $needsSpawn}
<div class="spawn-overlay">
  <div class="spawn-container">
    <h2>Select Spawn Location</h2>
    
    {#if loading}
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading spawn points...</p>
      </div>
    {:else if error}
      <div class="error-state">
        <p class="error-message">{error}</p>
        <button class="retry-button" onclick={() => { error = null; loading = true; }}>
          Retry
        </button>
      </div>
    {:else if spawning}
      <div class="spawning-state">
        <div class="loading-spinner"></div>
        <p>Spawning your character...</p>
      </div>
    {:else if spawnPoints.length === 0}
      <div class="no-spawns-state">
        <p>No spawn points available in this world.</p>
      </div>
    {:else}
      <div class="spawn-points">
        {#each spawnPoints as spawn}
          <div 
            class="spawn-point" 
            class:selected={selectedSpawnId === (spawn.id || spawn.key)}
            onclick={() => selectedSpawnId = spawn.id || spawn.key}
          >
            <div class="spawn-icon">
              <Torch />
            </div>
            <div class="spawn-details">
              <h3>{spawn.name || `Spawn ${spawn.id || spawn.key}`}</h3>
              <p class="spawn-location">
                Location: 
                {#if spawn.x !== undefined && spawn.y !== undefined}
                  {spawn.x},{spawn.y}
                {:else if spawn.position?.x !== undefined && spawn.position?.y !== undefined}
                  {spawn.position.x},{spawn.position.y}
                {:else if spawn.position?.chunkX !== undefined}
                  {(spawn.position.chunkX * CHUNK_SIZE) + (spawn.position.x || 0)},
                  {(spawn.position.chunkY * CHUNK_SIZE) + (spawn.position.y || 0)}
                {:else}
                  Unknown
                {/if}
              </p>
              {#if spawn.description}
                <p class="spawn-description">{spawn.description}</p>
              {/if}
            </div>
            <button 
              class="spawn-button"
              disabled={spawning}
              onclick={() => spawnAtLocation(spawn)}
            >
              Spawn Here
            </button>
          </div>
        {/each}
      </div>
    {/if}
    
    {#if showDebugView}
      <div class="debug-section">
        <h3>Debug Info</h3>
        <div class="debug-content">
          <div class="debug-row">
            <span class="debug-label">Current World:</span>
            <span class="debug-value">{$game.worldKey || 'None'}</span>
          </div>
          <div class="debug-row">
            <span class="debug-label">World Info Available:</span>
            <span class="debug-value">{worldData?.info ? 'Yes' : 'No'}</span>
          </div>
          <div class="debug-row">
            <span class="debug-label">Spawns in info.spawns:</span>
            <span class="debug-value">{worldData?.info?.spawns ? 'Yes' : 'No'}</span>
          </div>
          <div class="debug-row">
            <span class="debug-label">Spawns at root level:</span>
            <span class="debug-value">{worldData?.spawns ? 'Yes' : 'No'}</span>
          </div>
          <div class="debug-row">
            <span class="debug-label">Player Race:</span>
            <span class="debug-value">{$currentPlayer?.race || 'Unknown'}</span>
          </div>
          
          <h4>World Keys:</h4>
          <pre>{JSON.stringify(spawnDataSource.worldKeys, null, 2)}</pre>
          
          <h4>Info Keys:</h4>
          <pre>{JSON.stringify(spawnDataSource.infoKeys, null, 2)}</pre>
          
          <h4>Player Data:</h4>
          <pre>{JSON.stringify(debugData.playerData, null, 2)}</pre>
          
          <h4>Initialization:</h4>
          <pre>{JSON.stringify(debugData.initState, null, 2)}</pre>
          
          <h4>Spawn Data:</h4>
          <div class="debug-row">
            <span class="debug-label">Source:</span>
            <span class="debug-value">{debugData.spawnSource}</span>
          </div>
          <div class="debug-row">
            <span class="debug-label">Keys Count:</span>
            <span class="debug-value">{debugData.spawnKeys.length}</span>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
{/if}

<style>
  .spawn-overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    padding: 1rem;
  }
  
  .spawn-container {
    background-color: var(--color-dark-blue);
    border: 1px solid var(--color-panel-border);
    border-radius: 0.5rem;
    padding: 2rem;
    width: 100%;
    max-width: 40rem;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.5);
  }
  
  h2 {
    color: var(--color-pale-green);
    margin: 0 0 1.5rem;
    text-align: center;
    font-family: var(--font-heading);
  }
  
  .loading-state,
  .error-state,
  .spawning-state,
  .no-spawns-state {
    text-align: center;
    padding: 2rem;
  }
  
  .loading-spinner {
    display: inline-block;
    width: 2.5rem;
    height: 2.5rem;
    border: 0.25rem solid rgba(100, 255, 218, 0.3);
    border-top-color: var(--color-pale-green);
    border-radius: 50%;
    animation: spinner 1s linear infinite;
  }
  
  @keyframes spinner {
    to {
      transform: rotate(360deg);
    }
  }
  
  .error-message {
    color: #e74c3c;
    margin-bottom: 1rem;
  }
  
  .retry-button {
    background-color: var(--color-button-primary);
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  
  .spawn-points {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .spawn-point {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    border: 1px solid var(--color-panel-border);
    border-radius: 0.5rem;
    background-color: rgba(0, 0, 0, 0.2);
    cursor: pointer;
    transition: all 0.2s ease;
    align-items: center;
  }
  
  .spawn-point:hover {
    background-color: rgba(100, 255, 218, 0.05);
  }
  
  .spawn-point.selected {
    background-color: rgba(100, 255, 218, 0.1);
    border-color: var(--color-bright-accent);
  }
  
  .spawn-icon {
    width: 3rem;
    height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .spawn-details {
    flex: 1;
  }
  
  .spawn-details h3 {
    color: var(--color-pale-green);
    margin: 0 0 0.5rem;
    font-size: 1.2rem;
    font-family: var(--font-heading);
  }
  
  .spawn-location {
    color: var(--color-muted-teal);
    font-family: monospace;
    margin: 0.25rem 0;
    font-size: 0.9rem;
  }
  
  .spawn-description {
    color: var(--color-text-secondary);
    font-size: 0.9rem;
    margin: 0.5rem 0 0;
  }
  
  .spawn-button {
    background-color: var(--color-button-primary);
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }
  
  .spawn-button:hover:not([disabled]) {
    background-color: var(--color-button-primary-hover);
  }
  
  .spawn-button[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .debug-section {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-panel-border);
  }
  
  .debug-section h3 {
    color: var(--color-pale-green);
    margin: 0 0 1rem;
  }
  
  .debug-content {
    background-color: rgba(0, 0, 0, 0.3);
    padding: 1rem;
    border-radius: 0.25rem;
    font-family: monospace;
    overflow: auto;
    max-height: 30rem;
    font-size: 0.8rem;
  }
  
  .debug-row {
    display: flex;
    margin-bottom: 0.5rem;
  }
  
  .debug-label {
    color: var(--color-pale-green);
    width: 12rem;
    flex-shrink: 0;
  }
  
  pre {
    overflow: auto;
    background-color: rgba(0, 0, 0, 0.2);
    padding: 0.5rem;
    border-radius: 0.25rem;
    margin: 0.5rem 0 1rem;
  }
  
  h4 {
    color: var(--color-muted-teal);
    margin: 1rem 0 0.5rem;
    font-size: 0.9rem;
  }
  
  /* Responsive styles */
  @media (max-width: 768px) {
    .spawn-container {
      padding: 1.5rem;
    }
    
    .spawn-point {
      flex-direction: column;
      align-items: flex-start;
    }
    
    .spawn-button {
      margin-top: 1rem;
      width: 100%;
    }
  }
</style>
