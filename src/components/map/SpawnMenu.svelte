<script>
  import { ref, set, update } from 'firebase/database';
  import { db } from '../../lib/firebase/firebase.js';
  import { game, currentPlayer } from '../../lib/stores/game';
  import { moveTarget, map, targetStore } from '../../lib/stores/map';
  import { user } from '../../lib/stores/user';

  // Import torch and race icons
  import Torch from '../icons/Torch.svelte';
  import Human from '../icons/Human.svelte';
  import Elf from '../icons/Elf.svelte';
  import Dwarf from '../icons/Dwarf.svelte';
  import Goblin from '../icons/Goblin.svelte';
  import Fairy from '../icons/Fairy.svelte';

  // Component state using Svelte 5 runes
  let selectedSpawn = $state(null);
  let loading = $state(false);
  let error = $state(null);

  // Use $derived correctly following the Features.svelte pattern
  const spawnList = $derived((() => {
    // Get spawns from world data
    const world = $game.worlds[$game.worldKey];
    const spawns = world.spawns ? Object.values(world.spawns) : [];

    return spawns.filter(spawn => {
      if (!$game.player?.race) return true;
      return spawn.race?.toLowerCase() === $game.player.race.toLowerCase();
    });
  })());

  // Add a helper function to format text with proper capitalization
  function formatRace(text) {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  // Enhanced effect to handle spawn selection and map movement
  $effect(() => {
    // Skip if no spawns available
    if (spawnList.length === 0 || selectedSpawn) return;
    
    // Auto-select spawn if it's the only option or single match for player race
    let preferredSpawn = null;
    
    if (spawnList.length === 1) {
      // Single spawn case
      preferredSpawn = spawnList[0];
    } else if ($game.player?.race) {
      // Multiple spawns - check for single race match
      const raceMatches = spawnList.filter(spawn => 
        spawn.race?.toLowerCase() === $game.player.race.toLowerCase()
      );
      
      if (raceMatches.length === 1) {
        preferredSpawn = raceMatches[0];
      }
    }
    
    if (preferredSpawn) {
      // Auto-select the preferred spawn
      selectSpawn(preferredSpawn);
      
      // Get the correct coordinates and move map
      const spawnX = preferredSpawn.x ?? preferredSpawn.position?.x ?? 0;
      const spawnY = preferredSpawn.y ?? preferredSpawn.position?.y ?? 0;
      
      // Check if we need to move the map view
      if ($targetStore.x !== spawnX || $targetStore.y !== spawnY) {
        console.log(`Moving map view to spawn point: ${spawnX},${spawnY}`);
        moveTarget(spawnX, spawnY);
      }
    }
  });

  // Log game store state when open
  console.log('🎮 Game store in SpawnMenu:', $game);
  console.log('👤 Current player in SpawnMenu:', $currentPlayer);
  console.log('🌍 Current world key in SpawnMenu:', $game.worldKey);
  console.log('📊 Player data in SpawnMenu:', $game.player);

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

    console.log(spawn);
    
    // Get coordinates from spawn
    let spawnX, spawnY;
    if (spawn.x !== undefined && spawn.y !== undefined) {
      spawnX = spawn.x;
      spawnY = spawn.y;
    } else if (spawn.position) {
      spawnX = spawn.position.x;
      spawnY = spawn.position.y;
    }
    
    // Only move if coordinates exist and we're not already at these coordinates
    if (spawnX !== undefined && spawnY !== undefined && 
        ($map.target.x !== spawnX || $map.target.y !== spawnY)) {
      moveTarget(spawnX, spawnY);
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

      console.log(spawn, spawn.position);

      
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
      const displayName = $game.player?.displayName || 
        $user.displayName || 
        ($user.email ? $user.email.split('@')[0] : `Player ${$user.uid.substring(0, 4)}`);
      
      // Create player entity data with consistent ID fields
      await set(playerEntityRef, {
        displayName,
        lastActive: Date.now(),
        id: $user.uid,
        race: $game.player?.race || 'human'
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
    <h2>
      {#if $game.player?.race}
        <div class="race-icon">
          {#if $game.player.race.toLowerCase() === 'human'}
            <Human extraClass="spawn-race-icon" />
          {:else if $game.player.race.toLowerCase() === 'elf'}
            <Elf extraClass="spawn-race-icon" />
          {:else if $game.player.race.toLowerCase() === 'dwarf'}
            <Dwarf extraClass="spawn-race-icon" />
          {:else if $game.player.race.toLowerCase() === 'goblin'}
            <Goblin extraClass="spawn-race-icon" />
          {:else if $game.player.race.toLowerCase() === 'fairy'}
            <Fairy extraClass="spawn-race-icon" />
          {/if}
        </div>
      {/if}
      <span class="welcome-text">
        Welcome {$game.player?.race ? formatRace($game.player.race) : ''} 
        <br>Choose a Spawn Point
      </span>
    </h2>
    
    {#if error}
      <div class="error-message">{error}</div>
    {/if}
    
    <div class="spawn-container">
      <div class="spawn-list">
        {#each spawnList as spawn (spawn.id)}
          <button 
            class="spawn-item" 
            class:selected={selectedSpawn?.id === spawn.id}
            onclick={() => selectSpawn(spawn)}
            aria-pressed={selectedSpawn?.id === spawn.id}
            type="button"
          >
            <Torch size="2.4em" extraClass="spawn-icon" />
            <div class="spawn-item-content">
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
          </button>
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
    z-index: 1010; /* Increased from 1000 to 1010 to be above Legend's z-index of 1001 */
  }

  .spawn-menu {
    width: 90%;
    max-width: 500px;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 0.3em;
    padding: 1.5em;
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    color: rgba(0, 0, 0, 0.8);
    font-family: var(--font-body);
    font-size: 1em;
  }

  h2 {
    margin: 0 0 1.2em;
    color: rgba(0, 0, 0, 0.8);
    font-size: 1.3em;
    font-weight: 600;
    display: flex;
    align-items: flex-start;
    position: relative;
    padding-left: 2.8em;
    font-family: var(--font-heading);
  }

  .race-icon {
    position: absolute;
    left: 0;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .welcome-text {
    text-align: center;
    width: 100%;
    line-height: 1.3;
  }

  :global(.header-race-icon.spawn-header-icon) {
    width: 2em;
    height: 2em;
    opacity: 0.85;
  }

  .error-message {
    background: rgba(255, 0, 0, 0.1);
    color: darkred;
    padding: 0.6em;
    margin: 0.6em 0;
    border-radius: 0.3em;
    border: 1px solid rgba(255, 0, 0, 0.3);
    text-align: center;
    font-size: 0.9em;
  }

  .spawn-list {
    display: flex;
    flex-direction: column;
    gap: 0.6em;
    max-height: 18em;
    overflow-y: auto;
    padding: 0.3em;
    margin-bottom: 1em;
  }

  .spawn-item {
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.3em;
    padding: 0.8em;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    width: 100%;
    display: flex;
    align-items: center;
    font-family: inherit;
    gap: 0.8em;
  }

  .spawn-item-content {
    flex: 1;
  }

  :global(.spawn-icon) {
    color: rgba(0, 0, 0, 0.8);
    margin-left: 0.3em;
    margin-right: 0.3em;
  }

  .spawn-item:hover {
    background: rgba(255, 255, 255, 0.8);
    box-shadow: 0 0.1em 0.4em rgba(0, 0, 0, 0.1);
    transform: translateY(-0.1em);
  }

  .spawn-item:focus {
    outline: 2px solid #4285F4;
    outline-offset: 2px;
  }

  .spawn-item.selected {
    background: rgba(66, 133, 244, 0.1);
    border-color: #4285F4;
    box-shadow: 0 0 0 1px #4285F4;
  }

  .spawn-item h3 {
    margin: 0 0 0.4em;
    font-size: 1.1em;
    font-weight: 500;
    color: rgba(0, 0, 0, 0.85);
    line-height: 1.2;
  }

  .spawn-description {
    font-size: 0.9em;
    margin: 0 0 0.5em;
    color: rgba(0, 0, 0, 0.7);
  }

  .spawn-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.7);
  }

  .spawn-race {
    background: rgba(0, 0, 0, 0.05);
    padding: 0.2em 0.5em;
    border-radius: 1em;
    text-transform: capitalize;
  }

  .spawn-coords {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-size: 0.85em;
  }

  .spawn-actions {
    display: flex;
    justify-content: center;
    margin-top: 1.2em;
  }

  .spawn-button {
    position: relative;
    background: #4285F4;
    color: white;
    border: none;
    padding: 0.7em 1.5em;
    border-radius: 0.3em;
    font-size: 1em;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5em;
    overflow: hidden;
  }

  .spawn-button:hover:not(:disabled) {
    background: #3367D6;
  }
  
  /* Sheen effect on hover */
  .spawn-button:hover:not(:disabled)::after {
    content: '';
    position: absolute;
    top: -50%;
    left: -60%;
    width: 20%;
    height: 200%;
    background: rgba(255, 255, 255, 0.2);
    transform: rotate(30deg);
    animation: sheen 1.5s forwards;
  }

  @keyframes sheen {
    0% {
      left: -60%;
    }
    100% {
      left: 160%;
    }
  }

  .spawn-button:disabled {
    background: #999;
    cursor: not-allowed;
    opacity: 0.7;
  }

  .spawn-menu-wrapper.loading {
    cursor: wait;
  }

  /* Spinner animation for loading state */
  .spinner {
    width: 1em;
    height: 1em;
    border: 0.12em solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: white;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Single specific class selector for spawn menu race icons */
  :global(.spawn-race-icon) {
    width: 2em;
    height: 2em;
    fill: rgba(0, 0, 0, 0.85);
    opacity: 0.85;
  }
</style>
