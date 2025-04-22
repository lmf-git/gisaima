<script>
  import { onMount } from 'svelte';
  import { ref, set, update } from 'firebase/database';
  import { db } from '../../lib/firebase/database';
  import { 
    game, 
    currentPlayer,
    worldSpawnPoints,
    getWorldCenterCoordinates 
  } from '../../lib/stores/game';
  import { 
    moveTarget,
    map,
    getChunkKey
  } from '../../lib/stores/map';
  import { user } from '../../lib/stores/user';

  // Get component props
  const { onSpawn = () => {} } = $props();

  // Component state using Svelte 5 runes
  let selectedSpawn = $state(null);
  let loading = $state(false);
  let error = $state(null);
  let spawnList = $state([]);

  // Helper state variables
  let wasLoading = $state(false);
  let hasSpawnsData = $state(false);
  let autoTargeted = $state(false);

  // Helper function for setting/clearing errors
  function setError(message) {
    error = message;
    console.error(message);
    
    // Auto-clear error after 5 seconds
    setTimeout(() => {
      if (error === message) {
        error = null;
      }
    }, 5000);
  }

  // Helper function for setting loading state
  function setLoading(isLoading) {
    loading = isLoading;
    if (isLoading) {
      wasLoading = true;
    }
  }

  // Function to get spawn location in world coordinates
  function getSpawnLocation(spawn) {
    if (!spawn) return { x: 0, y: 0 };
    
    // Check for spawn with position info in various formats
    if (spawn.position) {
      // Format 1: position with chunkX,chunkY,x,y (from info.spawns)
      const CHUNK_SIZE = 20; // Make sure this matches your chunk size
      
      // If position has chunkX/Y and x/y, calculate global coordinates
      if (spawn.position.chunkX !== undefined && 
          spawn.position.chunkY !== undefined && 
          spawn.position.x !== undefined && 
          spawn.position.y !== undefined) {
        
        return {
          x: (spawn.position.chunkX * CHUNK_SIZE) + spawn.position.x,
          y: (spawn.position.chunkY * CHUNK_SIZE) + spawn.position.y
        };
      }
      
      // Format 2: position with direct x,y (from directly stored position)
      if (spawn.position.x !== undefined && spawn.position.y !== undefined) {
        return {
          x: spawn.position.x,
          y: spawn.position.y
        };
      }
    }
    
    // Format 3: direct x,y properties
    if (spawn.x !== undefined && spawn.y !== undefined) {
      return {
        x: spawn.x,
        y: spawn.y
      };
    }
    
    // Raw spawn data access - if position is stored differently
    if (spawn.raw?.position) {
      if (spawn.raw.position.x !== undefined && spawn.raw.position.y !== undefined) {
        return {
          x: spawn.raw.position.x,
          y: spawn.raw.position.y
        };
      } else if (spawn.raw.position.chunkX !== undefined && 
                spawn.raw.position.chunkY !== undefined &&
                spawn.raw.position.x !== undefined &&
                spawn.raw.position.y !== undefined) {
        const CHUNK_SIZE = 20;
        return {
          x: (spawn.raw.position.chunkX * CHUNK_SIZE) + spawn.raw.position.x,
          y: (spawn.raw.position.chunkY * CHUNK_SIZE) + spawn.raw.position.y
        };
      }
    }
    
    // Fallback: Use world center coordinates if no valid position found
    console.warn('No valid position found for spawn', spawn);
    return getWorldCenterCoordinates($game.worldKey);
  }

  // Process spawn data into a consistent format for display
  function processSpawnData() {
    if (!$game.worldKey || !$game.world[$game.worldKey]) {
      spawnList = [];
      hasSpawnsData = false;
      return;
    }

    const spawns = $worldSpawnPoints || [];
    if (!spawns || spawns.length === 0) {
      console.log('No spawns found in world data');
      spawnList = [];
      hasSpawnsData = false;
      return;
    }

    console.log(`Found ${spawns.length} spawns in world data`);
    hasSpawnsData = true;
    
    // Process each spawn with race filtering
    spawnList = spawns
      .filter(spawn => {
        // If player has a race, only show spawns for that race
        if ($game.playerData?.race) {
          return spawn.race?.toLowerCase() === $game.playerData.race.toLowerCase();
        }
        return true;
      })
      .map(spawn => {
        const pos = getSpawnLocation(spawn);
        return {
          id: spawn.id,
          name: spawn.name || `Spawn at ${pos.x},${pos.y}`,
          description: spawn.description || '',
          race: spawn.race || 'any',
          position: pos,
          x: pos.x,
          y: pos.y,
          // Keep original raw data for reference
          raw: spawn
        };
      });

    // Set the first spawn as selected if none is selected yet and we have spawns
    if (!selectedSpawn && spawnList.length > 0) {
      selectedSpawn = spawnList[0];
      
      // REMOVED: Auto-targeting for single spawn option that was causing incorrect coordinates
      // Now the user must explicitly click "Spawn Here" regardless of spawn count
    }
  }

  // Handle spawn selection
  function selectSpawn(spawn) {
    selectedSpawn = spawn;
  }

  // Core function for handling spawn confirmation - fully updated to ensure consistent player identity
  async function handleSpawnSelect(spawn) {
    if (!spawn || !$user || !$game.worldKey) {
      setError('Missing required data for spawn selection');
      return;
    }

    try {
      setLoading(true);

      // Get the spawn location, ensuring valid coordinates
      const spawnPosition = getSpawnLocation(spawn);
      console.log(`Spawning player at ${spawnPosition.x},${spawnPosition.y} for spawn ID: ${spawn.id}`);
      
      // 1. Update the player data in the database (players/[uid]/worlds/[worldId])
      const playerWorldRef = ref(db, `players/${$user.uid}/worlds/${$game.worldKey}`);
      
      // Update player data according to the correct structure
      // Store both user ID and spawn ID consistently
      await update(playerWorldRef, {
        alive: true,  // Mark player as alive after spawn
        lastLocation: {
          x: spawnPosition.x,
          y: spawnPosition.y,
          timestamp: Date.now()
        },
        spawnId: spawn.id || null,
        id: $user.uid, // Explicitly store the user ID
        uid: $user.uid  // Ensure UID is explicitly stored
      });

      // 2. Calculate chunk coordinates for the player entity
      const CHUNK_SIZE = 20;
      const chunkX = Math.floor(spawnPosition.x / CHUNK_SIZE);
      const chunkY = Math.floor(spawnPosition.y / CHUNK_SIZE);
      const chunkKey = `${chunkX},${chunkY}`;
      const tileKey = `${spawnPosition.x},${spawnPosition.y}`;
      
      // 3. Create a player entity in the world at the spawn location
      // This ensures the player is visible on the map
      const playerEntityRef = ref(db, 
        `worlds/${$game.worldKey}/chunks/${chunkKey}/${tileKey}/players/${$user.uid}`
      );
      
      // Get display name from player data or user
      const displayName = $game.playerData?.displayName || 
        $user.displayName || 
        ($user.email ? $user.email.split('@')[0] : `Player ${$user.uid.substring(0, 4)}`);
      
      // Create player entity data with consistent ID fields
      await set(playerEntityRef, {
        displayName,
        lastActive: Date.now(),
        uid: $user.uid,
        id: $user.uid, // Add explicit id field matching uid
        playerId: $user.uid, // Add explicit playerId field
        race: $game.playerData?.race || 'human',
        isCurrentPlayer: true // Add explicit flag for identifying current player
      });
      
      console.log(`Player spawned at ${tileKey} in chunk ${chunkKey} with uid ${$user.uid}`);

      // Move the map to the spawn location
      moveTarget(spawnPosition.x, spawnPosition.y);
      
      // Execute callback
      onSpawn(spawnPosition);
    } catch (error) {
      console.error('Error selecting spawn point:', error);
      setError(`Failed to select spawn: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  // Process spawn data when game state changes
  $effect(() => {
    processSpawnData();
  });

  // Component lifecycle hook
  onMount(() => {
    // Process spawn data on mount
    processSpawnData();
  });
</script>

<div class="spawn-menu-wrapper" class:loading={loading}>
  <div class="spawn-menu">
    <h2>Choose Your Spawn Point</h2>
    
    {#if error}
      <div class="error-message">{error}</div>
    {/if}
    
    <div class="spawn-container">
      {#if spawnList.length === 0}
        <div class="loading-message">
          {hasSpawnsData ? 'No spawn points available for your race' : 'Loading spawn points...'}
        </div>
      {:else}
        <div class="spawn-list">
          {#each spawnList as spawn (spawn.id)}
            <div 
              class="spawn-item" 
              class:selected={selectedSpawn?.id === spawn.id}
              onclick={() => selectSpawn(spawn)}
            >
              <h3>{spawn.name}</h3>
              {#if spawn.description}
                <p class="spawn-description">{spawn.description}</p>
              {/if}
              <div class="spawn-meta">
                <span class="spawn-race">{spawn.race}</span>
                <span class="spawn-coords">({spawn.x}, {spawn.y})</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
        
      <div class="spawn-actions">
        <button 
          class="spawn-button" 
          disabled={loading || !selectedSpawn} 
          onclick={() => handleSpawnSelect(selectedSpawn)}
        >
          {#if loading}
            <span class="spinner"></span> Spawning...
          {:else}
            Spawn Here
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .spawn-menu-wrapper {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .spawn-menu {
    width: 90%;
    max-width: 500px;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    color: #333;
  }

  h2 {
    margin: 0 0 20px;
    text-align: center;
    color: #222;
    font-size: 1.5em;
  }

  .error-message {
    background: rgba(255, 0, 0, 0.1);
    color: darkred;
    padding: 10px;
    margin: 10px 0;
    border-radius: 4px;
    border: 1px solid rgba(255, 0, 0, 0.3);
    text-align: center;
  }

  .spawn-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 300px;
    overflow-y: auto;
    padding: 5px;
    margin-bottom: 15px;
  }

  .spawn-item {
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .spawn-item:hover {
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }

  .spawn-item.selected {
    background: rgba(66, 133, 244, 0.1);
    border-color: #4285F4;
    box-shadow: 0 0 0 1px #4285F4;
  }

  .spawn-item h3 {
    margin: 0 0 8px;
    font-size: 1.1em;
    color: #333;
  }

  .spawn-description {
    font-size: 0.9em;
    margin: 0 0 10px;
    color: #555;
  }

  .spawn-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.85em;
    color: #777;
  }

  .spawn-race {
    background: rgba(0, 0, 0, 0.05);
    padding: 2px 8px;
    border-radius: 10px;
    text-transform: capitalize;
  }

  .spawn-actions {
    display: flex;
    justify-content: center;
    margin-top: 20px;
  }

  .spawn-button {
    background: #4285F4;
    color: white;
    border: none;
    padding: 12px 25px;
    border-radius: 4px;
    font-size: 1em;
    font-weight: bold;
    cursor: pointer;
    transition: background 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .spawn-button:hover:not(:disabled) {
    background: #3367D6;
  }

  .spawn-button:disabled {
    background: #999;
    cursor: not-allowed;
    opacity: 0.7;
  }

  .loading-message {
    text-align: center;
    padding: 20px;
    color: #555;
    font-style: italic;
  }

  .spawn-menu-wrapper.loading {
    cursor: wait;
  }

  /* Spinner animation for loading state */
  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: white;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Add styles for auto-target indicator */
  .auto-targeted {
    margin-top: 8px;
    font-size: 0.85em;
    color: #4285F4;
    font-style: italic;
    background: rgba(66, 133, 244, 0.1);
    padding: 4px 8px;
    border-radius: 4px;
    text-align: center;
  }
</style>
