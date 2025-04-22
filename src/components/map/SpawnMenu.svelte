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
  
  // Function to calculate chunk key
  function getChunkKey(x, y) {
    const CHUNK_SIZE = 20;
    return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;
  }

  // Create derived values with proper separation from side effects
  
  // 1. World Data - clean computation without logging
  const worldData = $derived(
    $game.currentWorld && $game.world[$game.currentWorld] 
      ? $game.world[$game.currentWorld] 
      : null
  );
  
  // 2. Spawn data sources - properly derived without side effects
  const spawnDataSource = $derived({
    // Check direct spawns property first
    directSpawns: worldData?.spawns || null,
    // Check info.spawns next (from backup.json format)
    infoSpawns: worldData?.info?.spawns || null,
    // Check if we have any spawns at all
    hasSpawns: !!(worldData?.spawns || worldData?.info?.spawns),
    // Track world keys for debugging
    worldKeys: worldData ? Object.keys(worldData) : [],
    // Track info keys if available
    infoKeys: worldData?.info ? Object.keys(worldData.info) : []
  });
  
  // 3. Raw spawn data - use direct expression form instead of function form
  const spawnData = $derived(
    !worldData ? null :
    spawnDataSource.directSpawns ? {
      source: 'direct',
      data: spawnDataSource.directSpawns,
      keys: Object.keys(spawnDataSource.directSpawns)
    } :
    spawnDataSource.infoSpawns ? {
      source: 'info',
      data: spawnDataSource.infoSpawns,
      keys: Object.keys(spawnDataSource.infoSpawns)
    } : null
  );
  
  // 4. Process spawn points - use direct expression form where possible
  const spawnPoints = $derived(
    !spawnData || !spawnData.data ? [] :
    (() => {
      try {
        const spawns = Object.values(spawnData.data);
        
        // Validate each spawn has the required fields
        const validSpawns = spawns.filter(spawn => 
          spawn && spawn.id && spawn.name && spawn.position
        );
        
        // Sort spawns: player's race first, then alphabetically
        const playerRace = $currentPlayer?.race || 'unknown';
        return validSpawns.sort((a, b) => {
          // Player race spawns first
          if (a.race === playerRace && b.race !== playerRace) return -1;
          if (a.race !== playerRace && b.race === playerRace) return 1;
          // Then sort by name
          return a.name.localeCompare(b.name);
        });
      } catch (err) {
        console.error('Error processing spawn points:', err);
        return [];
      }
    })()
  );
  
  // 5. Spawn stats - derived from spawn points
  const spawnStats = $derived(
    spawnPoints.length === 0 ? null : {
      totalSpawns: spawnPoints.length,
      playerRace: $currentPlayer?.race || 'unknown',
      matchingRaceSpawns: spawnPoints.filter(s => s.race === $currentPlayer?.race).length,
      spawnsWithoutRace: spawnPoints.filter(s => !s.race).length,
      spawnsByRace: spawnPoints.reduce((acc, s) => {
        acc[s.race || 'unknown'] = (acc[s.race || 'unknown'] || 0) + 1;
        return acc;
      }, {}),
      firstSpawn: spawnPoints[0] || null
    }
  );

  // 6. Selected spawn - derived from selection state
  const selectedSpawn = $derived(
    !selectedSpawnId || !spawnPoints.length ? null :
    spawnPoints.find(s => s.id === selectedSpawnId)
  );
  
  // For debug view, create serializable versions of our data
  // This avoids trying to stringify functions from derived values
  const debugData = $derived({
    worldData: worldData ? { 
      id: $game.currentWorld,
      hasInfo: !!worldData.info,
      hasSpawns: !!worldData.spawns,
      hasInfoSpawns: !!worldData?.info?.spawns
    } : null,
    spawnSource: spawnData?.source || null,
    spawnCount: spawnPoints.length,
    spawnKeys: spawnData?.keys || []
  });
  
  // Now add effects for side effects (logging, loading status, etc)
  
  // Log world data when it changes
  $effect(() => {
    if (worldData) {
      debugLog('SpawnMenu - World data loaded:', {
        worldId: $game.currentWorld,
        hasSpawns: spawnDataSource.hasSpawns,
        hasInfoProperty: !!worldData.info,
        hasSpawnsProperty: !!worldData.spawns,
        hasInfoSpawnsProperty: !!worldData?.info?.spawns,
        worldKeys: spawnDataSource.worldKeys,
        infoKeys: spawnDataSource.infoKeys,
        playerRace: $currentPlayer?.race || 'unknown'
      });
    }
  });

  // Log spawn data details
  $effect(() => {
    if (spawnData) {
      debugLog('SpawnMenu - Spawn data source:', {
        source: spawnData.source,
        keysCount: spawnData.keys.length,
        keys: spawnData.keys
      });
      
      // Log first spawn entry as example
      if (spawnData.keys.length > 0) {
        const firstKey = spawnData.keys[0];
        debugLog('SpawnMenu - Example spawn entry:', {
          key: firstKey,
          data: spawnData.data[firstKey]
        });
      }
    }
  });
  
  // Handle initialization and auto-selection
  $effect(() => {
    // Only process when world data becomes available and we're still in loading state
    if (worldData && loading) {
      loading = false;
      
      // Select first spawn point matching player's race if available
      if (spawnPoints.length > 0) {
        const playerRace = $currentPlayer?.race || 'unknown';
        const matchingRaceSpawn = spawnPoints.find(s => s.race === playerRace);
        
        if (matchingRaceSpawn) {
          debugLog('Found spawn matching player race:', matchingRaceSpawn);
          selectedSpawnId = matchingRaceSpawn.id;
        } else {
          // Fall back to first spawn
          selectedSpawnId = spawnPoints[0].id;
        }
        
        // Auto-move to the spawn location if there's only one or we selected a race match
        if (spawnPoints.length === 1 || matchingRaceSpawn) {
          const targetSpawn = matchingRaceSpawn || spawnPoints[0];
          moveTarget(targetSpawn.position.x, targetSpawn.position.y);
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

  // Toggle debug view
  function toggleDebugView() {
    showDebugView = !showDebugView;
  }

  // Spawn player at the selected location
  async function spawnPlayer() {
    if (!selectedSpawnId || !$currentPlayer || !$game.currentWorld) {
      error = "Please select a spawn point first";
      return false;
    }
    
    debugLog('SpawnMenu - Spawning player with race:', {
      race: $currentPlayer.race,
      displayName: $currentPlayer.displayName,
      uid: $currentPlayer.uid,
      selectedSpawnId,
      selectedSpawnRace: spawnPoints.find(s => s.id === selectedSpawnId)?.race
    });
    
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
  
  // Check if spawn matches player's race
  function isPlayerRaceSpawn(spawn) {
    return spawn.race === $currentPlayer?.race;
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
        
        <!-- Enhanced debug info with properly serialized data -->
        <details class="debug-info" open>
          <summary>Debug Info</summary>
          <pre>
Current World: {$game.currentWorld || 'None'}
World Info Available: {worldData?.info ? 'Yes' : 'No'}
Spawns in info.spawns: {worldData?.info?.spawns ? 'Yes' : 'No'}
Spawns at root level: {worldData?.spawns ? 'Yes' : 'No'}
Player Race: {$currentPlayer?.race || 'Unknown'}
World Keys: {JSON.stringify(spawnDataSource.worldKeys)}
Info Keys: {JSON.stringify(spawnDataSource.infoKeys)}

Spawn Data:
Source: {debugData.spawnSource}
Keys Count: {debugData.spawnKeys.length}
          </pre>
          
          {#if spawnData && spawnData.keys.length > 0}
            <div class="spawn-data-debug">
              <h4>Raw Spawn Entries:</h4>
              {#each spawnData.keys as key}
                <div class="spawn-debug-entry">
                  <strong>Key: {key}</strong>
                  <pre>{JSON.stringify(spawnData.data[key], null, 2)}</pre>
                </div>
              {/each}
            </div>
          {/if}
        </details>
      </div>
    {:else}
      <div class="spawn-list">
        {#each spawnPoints as spawn (spawn.id)}
          <button 
            type="button"
            class="spawn-option" 
            class:selected={selectedSpawnId === spawn.id}
            class:race-match={isPlayerRaceSpawn(spawn)}
            onclick={() => {
              selectedSpawnId = spawn.id;
              movedToSpawn = false;
            }}
          >
            <div class="spawn-icon">
              <Torch size="1.4em" extraClass="torch-icon" />
            </div>
            <div class="spawn-info">
              <div class="spawn-name">
                {spawn.name}
                {#if isPlayerRaceSpawn(spawn)}
                  <span class="recommended-tag">Recommended</span>
                {/if}
              </div>
              <div class="spawn-race">{formatText(spawn.race)} Territory</div>
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
          <div class="spawn-race-note">
            {#if isPlayerRaceSpawn(selectedSpawn)}
              <span class="race-match-note">✓ This is your race's territory</span>
            {:else}
              <span class="race-mismatch-note">⚠ This is {formatText(selectedSpawn.race)} territory, not your race's homeland</span>
            {/if}
          </div>
        </div>
      {/if}
      
      <button 
        class="spawn-button" 
        onclick={spawnPlayer} 
        disabled={spawning || !selectedSpawnId}
      >
        {#if spawning}
          <div class="spinner"></div> Spawning...
        {:else}
          Spawn Here
        {/if}
      </button>
      
      <!-- Add debug button and view -->
      <button class="debug-toggle" onclick={toggleDebugView}>
        {showDebugView ? 'Hide' : 'Show'} Debug Info
      </button>
      
      {#if showDebugView}
        <div class="detailed-debug">
          <h4>Spawn Points Found: {spawnPoints.length}</h4>
          <div class="spawn-data-table">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Race</th>
                  <th>Position</th>
                </tr>
              </thead>
              <tbody>
                {#each spawnPoints as spawn}
                  <tr class:race-match={isPlayerRaceSpawn(spawn)}>
                    <td>{spawn.id}</td>
                    <td>{spawn.name}</td>
                    <td>{formatText(spawn.race || 'unknown')}</td>
                    <td>({spawn.position.x}, {spawn.position.y})</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          
          <h4>Raw Spawn Data in Store:</h4>
          <div class="raw-data">
            <!-- Use debugData instead of directly stringifying spawnData -->
            <pre>{JSON.stringify({
              source: spawnData?.source || null,
              keys: spawnData?.keys || [],
              data: spawnData?.data ? Object.fromEntries(
                Object.entries(spawnData.data).slice(0, 3) // Only show first 3 entries to avoid overflow
              ) : null
            }, null, 2)}</pre>
          </div>
        </div>
      {/if}
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
  
  .spawn-option.race-match {
    background: rgba(0, 128, 0, 0.2);
    border-color: rgba(0, 255, 0, 0.3);
  }
  
  .spawn-option.race-match:hover {
    background: rgba(0, 128, 0, 0.3);
    border-color: rgba(0, 255, 0, 0.5);
  }
  
  .spawn-option.race-match.selected {
    background: rgba(0, 128, 0, 0.35);
    border-color: rgba(0, 255, 0, 0.7);
    box-shadow: 0 0 8px rgba(0, 255, 128, 0.5);
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
  
  .recommended-tag {
    font-size: 0.7em;
    background: rgba(0, 255, 0, 0.3);
    color: white;
    padding: 2px 6px;
    border-radius: 10px;
    margin-left: 8px;
    vertical-align: middle;
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
  
  .spawn-race-note {
    margin-top: 10px;
  }
  
  .race-match-note {
    color: #7cfc00;
    display: block;
  }
  
  .race-mismatch-note {
    color: #ffcc00;
    display: block;
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
  .debug-toggle {
    margin-top: 1rem;
    padding: 0.5rem;
    background: rgba(0, 50, 100, 0.4);
    color: #ddd;
    border: 1px solid rgba(100, 200, 255, 0.3);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
  }
  
  .debug-toggle:hover {
    background: rgba(0, 50, 100, 0.6);
  }
  
  .detailed-debug {
    margin-top: 1rem;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    font-size: 0.8rem;
    text-align: left;
    overflow: auto;
    max-height: 300px;
  }
  
  .detailed-debug h4 {
    margin-top: 0;
    margin-bottom: 0.5rem;
    color: #aadaff;
  }
  
  .spawn-data-table {
    margin-bottom: 1rem;
  }
  
  .spawn-data-table table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1rem;
  }
  
  .spawn-data-table th,
  .spawn-data-table td {
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 0.3rem 0.5rem;
  }
  
  .spawn-data-table th {
    background: rgba(0, 50, 100, 0.5);
    text-align: left;
  }
  
  .spawn-data-table tr.race-match {
    background: rgba(0, 128, 0, 0.2);
  }
  
  .spawn-data-debug {
    margin-top: 1rem;
  }
  
  .spawn-debug-entry {
    margin-bottom: 1rem;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.2);
    border-left: 3px solid #4a90e2;
  }
  
  .raw-data pre {
    font-size: 0.7rem;
    overflow: auto;
    max-height: 200px;
    background: rgba(0, 0, 0, 0.2);
    padding: 0.5rem;
  }
</style>
