<script>
  import { ref, set, update } from 'firebase/database';
  import { db } from '../../lib/firebase/database';
  import { game, currentPlayer } from '../../lib/stores/game';
  import { moveTarget } from '../../lib/stores/map';
  import { user } from '../../lib/stores/user';

  // Component state using Svelte 5 runes
  let selectedSpawn = $state(null);
  let loading = $state(false);
  let error = $state(null);

  // Use $derived correctly following the Features.svelte pattern
  const spawnList = $derived((() => {
    // Get spawns from world data
    const world = $game.world[$game.worldKey];
    const spawns = world.spawns ? Object.values(world.spawns) : [];

    return spawns.filter(spawn => {
      if (!$game.playerData?.race) return true;
      return spawn.race?.toLowerCase() === $game.playerData.race.toLowerCase();
    });
  })());

  // Log game store state when open
  console.log('🎮 Game store in SpawnMenu:', $game);
  console.log('👤 Current player in SpawnMenu:', $currentPlayer);
  console.log('🌍 Current world key in SpawnMenu:', $game.worldKey);
  console.log('📊 Player data in SpawnMenu:', $game.playerData);

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
  }

  // Handle spawn selection
  function selectSpawn(spawn) {
    selectedSpawn = spawn;
    // Preview the spawn location on the map
    if (spawn.x !== undefined && spawn.y !== undefined) {
      moveTarget(spawn.x, spawn.y);
    } else if (spawn.position) {
      moveTarget(spawn.position.x, spawn.position.y);
    }
  }

  // Core function for handling spawn confirmation
  async function confirm(spawn) {
    if (!spawn || !$user || !$game.worldKey) {
      setError('Missing required data for spawn selection');
      return;
    }

    try {
      setLoading(true);
      
      // Get the correct coordinates from the spawn data
      const spawnX = spawn.x ?? spawn.position?.x ?? 0;
      const spawnY = spawn.y ?? spawn.position?.y ?? 0;

      console.log(`Spawning player at ${spawnX},${spawnY} for spawn ID: ${spawn.id}`);
      
      // 1. Update the player data in the database
      const playerWorldRef = ref(db, `players/${$user.uid}/worlds/${$game.worldKey}`);
      
      await update(playerWorldRef, {
        alive: true,
        lastLocation: {
          x: spawnX,
          y: spawnY,
          timestamp: Date.now()
        },
        spawnId: spawn.id || null,
        id: $user.uid, // Explicitly store the user ID
      });

      // 2. Calculate chunk coordinates for the player entity
      const CHUNK_SIZE = 20;
      const chunkX = Math.floor(spawnX / CHUNK_SIZE);
      const chunkY = Math.floor(spawnY / CHUNK_SIZE);
      const chunkKey = `${chunkX},${chunkY}`;
      const tileKey = `${spawnX},${spawnY}`;
      
      // 3. Create a player entity in the world at the spawn location
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
        id: $user.uid,
        race: $game.playerData?.race || 'human'
      });
      
      console.log(`Player spawned at ${tileKey} in chunk ${chunkKey} with uid ${$user.uid}`);
    
    } catch (error) {
      console.error('Error selecting spawn point:', error);
      setError(`Failed to select spawn: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }
</script>

<div class="spawn-menu-wrapper" class:loading={loading}>
  <div class="spawn-menu">
    <h2>Choose Your Spawn Point</h2>
    
    {#if error}
      <div class="error-message">{error}</div>
    {/if}
    
    <div class="spawn-container">
      <div class="spawn-list">
        {#each spawnList as spawn (spawn.id)}
          <div 
            class="spawn-item" 
            class:selected={selectedSpawn?.id === spawn.id}
            onclick={() => selectSpawn(spawn)}
          >
            <h3>{spawn.name || 'Unnamed Spawn'}</h3>
            {#if spawn.description}
              <p class="spawn-description">{spawn.description}</p>
            {/if}
            <div class="spawn-meta">
              <span class="spawn-race">{spawn.race || 'any'}</span>
              <span class="spawn-coords">
                {#if spawn.x !== undefined && spawn.y !== undefined}
                  ({spawn.x}, {spawn.y})
                {:else if spawn.position}
                  ({spawn.position.x}, {spawn.position.y})
                {/if}
              </span>
            </div>
          </div>
        {/each}
      </div>
        
      <div class="spawn-actions">
        <button 
          class="spawn-button" 
          disabled={loading || !selectedSpawn} 
          onclick={() => confirm(selectedSpawn)}
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

  .spawn-coords {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-size: 0.85em;
  }

  .chunk-coords {
    font-size: 0.9em;
    color: #666;
    margin-top: 3px;
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
