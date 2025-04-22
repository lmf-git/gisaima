<script>
  import { ref, update } from 'firebase/database';
  import { db } from '../../lib/firebase/database.js';
  import { game, currentPlayer, needsSpawn } from '../../lib/stores/game.js';
  import { moveTarget } from '../../lib/stores/map.js';
  import Torch from '../icons/Torch.svelte';
  
  // Import race icon components
  import Human from '../icons/Human.svelte';
  import Elf from '../icons/Elf.svelte';
  import Dwarf from '../icons/Dwarf.svelte';
  import Goblin from '../icons/Goblin.svelte';
  import Fairy from '../icons/Fairy.svelte';

  // Using Svelte 5 $props rune
  const { onSpawn = () => {} } = $props();

  // Component state using $state rune
  let selectedSpawnId = $state(null);
  let loading = $state(true);
  let spawning = $state(false);
  let error = $state(null);
  let movedToSpawn = $state(false);
  
  // Add a state variable to track world data
  let worldData = $state(null);
  let spawnPoints = $state([]);
  let filteredSpawnPoints = $state([]);
  let currentPlayerRace = $state(null);
  
  // Function to calculate chunk key
  function getChunkKey(x, y) {
    const chunkX = Math.floor(x / 20);
    const chunkY = Math.floor(y / 20);
    return `${chunkX},${chunkY}`;
  }

  const CHUNK_SIZE = 20;

  // First effect: Handle world data changes and extract spawn points 
  $effect(() => {
    // Initialize with current game world data when it changes
    const currentWorldId = $game.worldKey || $game.currentWorld;
    const currentWorldData = currentWorldId ? $game.world[currentWorldId] : null;
    
    if (currentWorldData) {
      worldData = currentWorldData;
      loading = true; // Reset loading state when world data changes
      
      // Extract spawn points
      let foundSpawns = [];
      
      // Case 1: Check info.spawns (as in backup.json)
      if (worldData.info?.spawns) {
        foundSpawns = Object.entries(worldData.info.spawns).map(([key, spawn]) => ({
          key,
          ...spawn
        }));
      }
      // Case 2: Check direct spawns property
      else if (worldData.spawns) {
        foundSpawns = Object.entries(worldData.spawns).map(([key, spawn]) => ({
          key,
          ...spawn
        }));
      }
      
      // Update all spawns
      spawnPoints = foundSpawns;
      loading = foundSpawns.length > 0 ? false : false;
      error = foundSpawns.length > 0 ? null : 'No spawn points found in this world';
    }
  });

  // Second effect: Track player race changes independently to avoid circular dependencies
  $effect(() => {
    if ($currentPlayer?.race) {
      currentPlayerRace = $currentPlayer.race.toLowerCase();
    } else {
      currentPlayerRace = null;
    }
  });

  // Third effect: Filter spawn points when source data changes
  $effect(() => {
    // Don't attempt to filter if no spawn points or world data isn't loaded yet
    if (!spawnPoints.length) {
      filteredSpawnPoints = [];
      return;
    }
    
    // If no player race, show all spawn points
    if (!currentPlayerRace) {
      filteredSpawnPoints = [...spawnPoints];
      return;
    }
    
    // Filter by race if specified in spawn data
    const raceFiltered = spawnPoints.filter(spawn => 
      !spawn.race || spawn.race.toLowerCase() === currentPlayerRace
    );
    
    // Only use race filtering if we found matches
    if (raceFiltered.length > 0) {
      filteredSpawnPoints = raceFiltered;
    } else {
      // Fall back to all spawns if no race matches
      filteredSpawnPoints = [...spawnPoints];
    }
  });

  // Fourth effect: Auto-select if only one spawn point is available
  $effect(() => {
    if (filteredSpawnPoints.length === 1 && !selectedSpawnId) {
      selectedSpawnId = filteredSpawnPoints[0].id || filteredSpawnPoints[0].key;
      moveToSpawnLocation(filteredSpawnPoints[0]);
    }
  });
  
  // Function to move map to spawn location
  function moveToSpawnLocation(spawnPoint) {
    if (!spawnPoint) return;
    
    // Get position from spawn point - handle different formats
    let position = { x: 0, y: 0 };
    
    if (spawnPoint.x !== undefined && spawnPoint.y !== undefined) {
      position = { x: spawnPoint.x, y: spawnPoint.y };
    } else if (spawnPoint.position?.x !== undefined && spawnPoint.position?.y !== undefined) {
      position = { x: spawnPoint.position.x, y: spawnPoint.position.y };
    } else if (spawnPoint.position?.chunkX !== undefined) {
      position = { 
        x: (spawnPoint.position.chunkX * CHUNK_SIZE) + (spawnPoint.position.x || 0),
        y: (spawnPoint.position.chunkY * CHUNK_SIZE) + (spawnPoint.position.y || 0)
      };
    }
    
    // Move the map target to this position
    moveTarget(position.x, position.y);
    movedToSpawn = true;
  }

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
  
  // Format text with proper capitalization
  function _fmt(text) {
    if (!text) return '';
    return text.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  
  // Get selected spawn point
  function getSelectedSpawn() {
    if (!selectedSpawnId) return null;
    return filteredSpawnPoints.find(s => (s.id || s.key) === selectedSpawnId);
  }
</script>

{#if $needsSpawn}
<div class="modal-container">
  <div class="spawn-modal">
    <header class="modal-header">
      <div class="header-content">
        <div class="race-icon">
          {#if $currentPlayer?.race}
            {#if $currentPlayer.race.toLowerCase() === 'human'}
              <Human extraClass="spawn-race-icon" />
            {:else if $currentPlayer.race.toLowerCase() === 'elf'}
              <Elf extraClass="spawn-race-icon" />
            {:else if $currentPlayer.race.toLowerCase() === 'dwarf'}
              <Dwarf extraClass="spawn-race-icon" />
            {:else if $currentPlayer.race.toLowerCase() === 'goblin'}
              <Goblin extraClass="spawn-race-icon" />
            {:else if $currentPlayer.race.toLowerCase() === 'fairy'}
              <Fairy extraClass="spawn-race-icon" />
            {/if}
          {/if}
        </div>
        <div class="header-text">
          <h3>Select Spawn Location</h3>
          <div class="race-display">
            Playing as <span class="race-name">{_fmt($currentPlayer?.race || '')}</span>
            {#if filteredSpawnPoints.length < spawnPoints.length}
              <span class="race-info">(showing {filteredSpawnPoints.length} race-specific locations)</span>
            {/if}
          </div>
        </div>
      </div>
    </header>
    
    <div class="modal-content">
      {#if loading}
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <p>Loading spawn points...</p>
        </div>
      {:else if error}
        <div class="error-state">
          <p class="error-message">{error}</p>
          <button class="action-button retry-button" onclick={() => { error = null; loading = true; }}>
            Retry
          </button>
        </div>
      {:else if spawning}
        <div class="spawning-state">
          <div class="loading-spinner"></div>
          <p>Spawning your character...</p>
        </div>
      {:else if filteredSpawnPoints.length === 0}
        <div class="no-spawns-state">
          <p>No spawn points available in this world.</p>
        </div>
      {:else}
        <div class="spawn-points">
          {#each filteredSpawnPoints as spawn}
            <div 
              class="spawn-point entity" 
              class:selected={selectedSpawnId === (spawn.id || spawn.key)}
              onclick={() => {
                selectedSpawnId = spawn.id || spawn.key;
                moveToSpawnLocation(spawn);
              }}
            >
              <div class="entity-icon">
                <Torch size="1.4em" extraClass="spawn-icon-detail" />
              </div>
              <div class="entity-info">
                <div class="entity-name">
                  {spawn.name || `Spawn ${spawn.id || spawn.key}`}
                  {#if spawn.race && spawn.race.toLowerCase() === $currentPlayer?.race?.toLowerCase()}
                    <span class="entity-badge race-match-badge">{_fmt(spawn.race)}</span>
                  {/if}
                </div>
                <div class="entity-details">
                  <span class="entity-location">
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
                  </span>
                  {#if spawn.type}
                    <span class="entity-type">{_fmt(spawn.type)}</span>
                  {/if}
                </div>
                {#if spawn.description}
                  <p class="spawn-description">{spawn.description}</p>
                {/if}
              </div>
            </div>
          {/each}
        </div>
        
        <!-- Add central spawn confirmation button -->
        {#if selectedSpawnId}
          <div class="confirm-spawn-container">
            <button 
              class="confirm-spawn-button"
              disabled={spawning}
              onclick={() => {
                const selectedSpawn = getSelectedSpawn();
                if (selectedSpawn) {
                  spawnAtLocation(selectedSpawn);
                }
              }}
            >
              {spawning ? 'Spawning...' : 'Confirm Spawn Location'}
            </button>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>
{/if}

<style>
  .modal-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999; /* Increased from 1000 to 9999 to be above all other components */
    background-color: rgba(0, 0, 0, 0.5);
    padding: 1rem;
  }
  
  .spawn-modal {
    width: 90%;
    max-width: 34em;
    max-height: 85vh;
    background-color: rgba(255, 255, 255, 0.85);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.3em;
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    font-size: 1.4em;
    font-family: var(--font-body);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transform: scale(0.95);
    opacity: 0;
    animation: modalAppear 0.3s ease-out forwards;
    backdrop-filter: blur(0.5em);
    -webkit-backdrop-filter: blur(0.5em);
  }

  @keyframes modalAppear {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .modal-header {
    padding: 0.8em 1em;
    background-color: rgba(0, 0, 0, 0.05);
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    font-family: var(--font-heading);
  }
  
  .header-content {
    display: flex;
    align-items: center;
    gap: 0.8em;
  }
  
  .header-text {
    flex: 1;
  }
  
  .race-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5em;
    height: 2.5em;
    background: rgba(255, 255, 255, 0.5);
    border-radius: 50%;
    box-shadow: 0 0 0.5em rgba(0, 0, 0, 0.1);
  }
  
  .race-display {
    font-size: 0.8em;
    color: rgba(0, 0, 0, 0.7);
    margin-top: 0.2em;
  }
  
  .race-name {
    font-weight: 600;
    color: var(--color-bright-accent, #3a8eff);
  }
  
  .race-info {
    opacity: 0.7;
    font-style: italic;
    font-size: 0.9em;
    margin-left: 0.5em;
  }

  h3 {
    margin: 0;
    font-size: 1.1em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.8);
  }

  .modal-content {
    padding: 0.8em;
    overflow-y: auto;
    max-height: calc(85vh - 4em); /* Account for header space */
  }
  
  /* Loading state */
  .loading-state,
  .error-state,
  .spawning-state,
  .no-spawns-state {
    text-align: center;
    padding: 2rem;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .loading-spinner {
    display: inline-block;
    width: 2rem;
    height: 2rem;
    border: 0.25rem solid rgba(0, 0, 0, 0.1);
    border-top-color: rgba(0, 0, 0, 0.5);
    border-radius: 50%;
    animation: spinner 1s linear infinite;
    margin-bottom: 1rem;
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
  
  .action-button {
    padding: 0.6em;
    background-color: rgba(66, 133, 244, 0.1);
    border: 1px solid rgba(66, 133, 244, 0.3);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.8);
    font-family: var(--font-body);
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5em;
  }
  
  .action-button:hover {
    background-color: rgba(66, 133, 244, 0.2);
    transform: translateY(-1px);
  }
  
  .retry-button {
    margin: 0 auto;
    display: inline-flex;
  }
  
  /* Spawn points list */
  .spawn-points {
    display: flex;
    flex-direction: column;
    gap: 0.6em;
  }
  
  .entity {
    display: flex;
    align-items: flex-start;
    margin-bottom: 0.6em;
    padding: 0.5em 0.7em;
    border-radius: 0.3em;
    background-color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(0, 0, 0, 0.1);
    transition: background-color 0.2s ease;
  }

  .entity:last-child {
    margin-bottom: 0;
  }

  .entity:hover {
    background-color: rgba(255, 255, 255, 0.8);
  }

  .spawn-point {
    cursor: pointer;
    position: relative;
  }
  
  .spawn-point.selected {
    background-color: rgba(66, 133, 244, 0.05);
    border-color: rgba(66, 133, 244, 0.3);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .entity-icon {
    margin-right: 0.7em;
    margin-top: 0.1em;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .entity-info {
    flex: 1;
  }
  
  .entity-name {
    font-weight: 500;
    color: rgba(0, 0, 0, 0.85);
    line-height: 1.2;
    margin-bottom: 0.2em;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5em;
  }
  
  .entity-details {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6em;
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.7);
    width: 100%;
    justify-content: space-between;
  }
  
  .entity-location {
    font-family: var(--font-mono, monospace);
  }
  
  .entity-type {
    color: rgba(0, 0, 0, 0.6);
  }
  
  .spawn-description {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.6);
    font-style: italic;
    margin: 0.4em 0 0;
  }
  
  .spawn-button {
    background-color: rgba(76, 175, 80, 0.1);
    border: 1px solid rgba(76, 175, 80, 0.3);
    color: rgba(76, 175, 80, 0.9);
    padding: 0.3em 0.8em;
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 500;
    white-space: nowrap;
    margin-left: 0.5em;
    align-self: center;
  }
  
  .spawn-button:hover:not([disabled]) {
    background-color: rgba(76, 175, 80, 0.2);
    transform: translateY(-1px);
  }
  
  .spawn-button[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  /* Race icon styling with global selectors */
  :global(.spawn-race-icon) {
    width: 2em;
    height: 2em;
    opacity: 0.85;
    fill: rgba(0, 0, 0, 0.7);
  }
  
  :global(.spawn-race-icon.fairy-icon path) {
    fill: rgba(138, 43, 226, 0.8); /* Brighter purple for fairy */
  }
  
  :global(.spawn-race-icon.goblin-icon path) {
    fill: rgba(0, 128, 0, 0.8); /* Brighter green for goblin */
  }
  
  :global(.spawn-icon-detail) {
    opacity: 0.9;
    filter: drop-shadow(0 0 3px rgba(0, 255, 255, 0.8));
  }
  
  /* New styles for confirm button */
  .confirm-spawn-container {
    margin-top: 1.2em;
    text-align: center;
  }

  .confirm-spawn-button {
    background-color: rgba(76, 175, 80, 0.8);
    color: white;
    padding: 0.6em 1.2em;
    border: none;
    border-radius: 0.3em;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 1em;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .confirm-spawn-button:hover:not([disabled]) {
    background-color: rgba(76, 175, 80, 1);
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }

  .confirm-spawn-button[disabled] {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Race match badge */
  .race-match-badge {
    font-size: 0.7em;
    padding: 0.2em 0.4em;
    border-radius: 0.3em;
    background-color: rgba(76, 175, 80, 0.2);
    color: #2e7d32;
    border: 1px solid rgba(76, 175, 80, 0.4);
  }
  
  /* Responsive styles */
  @media (max-width: 640px) {
    .spawn-point {
      flex-direction: column;
      align-items: stretch;
    }
    
    .entity-icon {
      margin-right: 0;
      margin-bottom: 0.7em;
    }
    
    .confirm-spawn-button {
      width: 100%;
    }
  }
</style>
