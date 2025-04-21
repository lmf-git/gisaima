<script>
  import { ref, update } from 'firebase/database';
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

  // Get spawn points ONLY from world info.spawns - no fallbacks or alternatives
  const spawnPoints = $derived(() => {
    if (!$game.currentWorld || !$game.world[$game.currentWorld]?.info?.spawns) {
      return [];
    }
    
    return Object.values($game.world[$game.currentWorld].info.spawns);
  });

  // Get the selected spawn
  const selectedSpawn = $derived(() => {
    if (!selectedSpawnId || !spawnPoints.length) return null;
    return spawnPoints.find(s => s.id === selectedSpawnId);
  });
  
  // Simplified initialization effect - runs once when world data is available
  $effect(() => {
    // Only process when world data becomes available and we're still in loading state
    if ($game?.currentWorld && $game.world[$game.currentWorld] && loading) {
      loading = false;
      
      // Select first spawn point if available
      if (spawnPoints.length > 0) {
        selectedSpawnId = spawnPoints[0].id;
        
        // Auto-move to the spawn location if there's only one
        if (spawnPoints.length === 1 && !movedToSpawn) {
          moveTarget(spawnPoints[0].position.x, spawnPoints[0].position.y);
          movedToSpawn = true;
        }
      }
    }
  });

  // Move when selection changes
  $effect(() => {
    if (selectedSpawnId && !movedToSpawn && spawnPoints.length) {
      const spawn = spawnPoints.find(s => s.id === selectedSpawnId);
      if (spawn?.position) {
        moveTarget(spawn.position.x, spawn.position.y);
        movedToSpawn = true;
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
      </div>
    {:else if !spawnPoints.length}
      <div class="error-message">
        <p>No spawn points available in this world</p>
        
        <!-- Show debug info for development - will help identify missing spawns -->
        <details class="debug-info">
          <summary>Debug Info</summary>
          <pre>
            Current World: {$game.currentWorld || 'None'}
            World Info Available: {$game.world[$game.currentWorld]?.info ? 'Yes' : 'No'}
            Spawns Path Available: {$game.world[$game.currentWorld]?.info?.spawns ? 'Yes' : 'No'}
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
