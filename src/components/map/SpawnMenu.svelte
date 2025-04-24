<script>
  import { scale } from 'svelte/transition';
  import { ref, set, update } from 'firebase/database';
  import { db } from '../../lib/firebase/firebase.js';
  import { game, currentPlayer } from '../../lib/stores/game';
  import { moveTarget, map, targetStore, clearSavedTargetPosition } from '../../lib/stores/map';
  import { user } from '../../lib/stores/user';
  import { goto } from '$app/navigation';

  // Import torch and race icons
  import Torch from '../icons/Torch.svelte';
  import Human from '../icons/Human.svelte';
  import Elf from '../icons/Elf.svelte';
  import Dwarf from '../icons/Dwarf.svelte';
  import Goblin from '../icons/Goblin.svelte';
  import Fairy from '../icons/Fairy.svelte';

  // Accept onClose and add onSpawnComplete prop
  const {
    onClose = () => {},
    onSpawnComplete = () => {} 
  } = $props();

  // Component state using Svelte 5 runes
  let selectedSpawn = $state(null);
  let loading = $state(false);
  let error = $state(null);
  
  // Simplify player status detection using $derived
  const playerDied = $derived(!$game.player?.alive);
  const deathMessage = $derived($game.player?.lastMessage?.text || '');
  
  // Extract player display name from game store
  const playerDisplayName = $derived($game.player?.displayName || '');

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
      selectSpawn(preferredSpawn, false); // Pass false to avoid auto-moving the map
      
      // Get the correct coordinates
      const spawnX = preferredSpawn.x ?? preferredSpawn.position?.x ?? 0;
      const spawnY = preferredSpawn.y ?? preferredSpawn.position?.y ?? 0;
      
      // Always move to exact spawn coordinates when there's only one spawn
      // No distance check needed - we want exact positioning
      const currentX = $targetStore.x;
      const currentY = $targetStore.y;
      
      if (currentX !== spawnX || currentY !== spawnY) {
        console.log(`Moving map view to spawn point: ${spawnX},${spawnY} (from ${currentX},${currentY})`);
        moveTarget(spawnX, spawnY);
      } else {
        console.log(`Map already centered at spawn coordinates: ${spawnX},${spawnY}`);
      }
    }
  });

  // Enhanced effect to handle unauthorized world access with better timing
  $effect(() => {
    // Wait until we have enough information to make a decision
    if (!$user || !$game.worldKey) return;
    
    // Check if joinedWorlds data is available - this means game store is ready
    if (Array.isArray($game.joinedWorlds)) {
      if (!$game.joinedWorlds.includes($game.worldKey)) {
        console.log(`SpawnMenu detected user is not a member of world ${$game.worldKey}, redirecting to worlds page`);
        goto('/worlds');
        return;
      }
      
      // If we have player data but no spawns available for the player's race,
      // it means they can't spawn in this world
      if (spawnList.length === 0 && $game.player?.race) {
        console.log(`No available spawns for player race: ${$game.player.race}, redirecting to worlds page`);
        goto('/worlds');
        return;
      }
    }
  });

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
  function selectSpawn(spawn, shouldMoveMap = true) {
    selectedSpawn = spawn;
    console.log(`Selected spawn: ${spawn.name || spawn.id} at ${spawn.position?.x},${spawn.position?.y}`);
    
    if (!shouldMoveMap) return;
    
    // Get coordinates safely with null coalescing
    const spawnX = spawn.x ?? spawn.position?.x ?? 0;
    const spawnY = spawn.y ?? spawn.position?.y ?? 0;
    
    // Store original coordinates before moving
    const originalX = $map.target.x;
    const originalY = $map.target.y;
    
    // Only move if we're not already at these coordinates
    if (originalX !== spawnX || originalY !== spawnY) {
      console.log(`Moving map view from ${originalX},${originalY} to spawn at ${spawnX},${spawnY}`);
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
      
      // Store the spawn coordinates to ensure we use consistent values throughout
      const spawnX = spawn.x ?? spawn.position?.x ?? 0;
      const spawnY = spawn.y ?? spawn.position?.y ?? 0;

      // Clear any saved target position to prevent it overriding spawn location
      clearSavedTargetPosition($game.worldKey);

      console.log(`Spawning player at ${spawnX},${spawnY} for spawn ID: ${spawn.id || 'unknown'}`);
      
      // 1. Update the player data in the database
      const playerWorldRef = ref(db, `players/${$user.uid}/worlds/${$game.worldKey}`);
      
      // Use the display name from the player data in the game store
      const displayName = $game.player?.displayName || 
        $user.displayName || 
        ($user.email ? $user.email.split('@')[0] : `Player ${$user.uid.substring(0, 4)}`);
        
      await update(playerWorldRef, {
        alive: true,
        lastLocation: {
          x: spawnX,
          y: spawnY,
          timestamp: Date.now()
        },
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
      
      // Create player entity data with consistent ID fields and use the display name
      await set(playerEntityRef, {
        displayName,
        lastActive: Date.now(),
        id: $user.uid,
        race: $game.player?.race || 'human'
      });
      
      console.log(`Player spawned at ${tileKey} in chunk ${chunkKey} with uid ${$user.uid} and name ${displayName}`);
      
      // Ensure map is still focused on spawn location before closing
      if ($map.target.x !== spawnX || $map.target.y !== spawnY) {
        console.log(`Re-centering map on spawn location before closing: ${spawnX},${spawnY}`);
        moveTarget(spawnX, spawnY);
      }
      
      // Notify about spawn completion first
      onSpawnComplete();
      
      setTimeout(() => onClose(), 300); // Small delay before closing to ensure map update completes
    
    } catch (error) {
      console.error('Error selecting spawn point:', error);
      setError(`Failed to select spawn: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      // Do nothing for Escape key as we don't want to close the spawn menu
      // Only proceed once player has chosen a spawn point
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div 
  class="spawn-menu-wrapper" 
  class:loading={loading} 
  transition:scale={{ start: 0.95, duration: 200 }}
>
  <div class="spawn-menu">
    <header class="modal-header">
      <h2 id="spawn-title">
        {#if deathMessage}
          You have fallen
        {:else}
          Choose Spawn Point
        {/if}
      </h2>
    </header>
    
    <div class="content">
      <!-- Death message or race header -->
      {#if deathMessage}
        <div class="death-message-container">
          <p class="death-message">
            {deathMessage || "You were defeated in battle."}
          </p>
        </div>
      {:else}
        <div class="race-header">
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
            <span class="welcome-text">
              Welcome {formatRace($game.player.race)} 
              {#if playerDisplayName}
                <strong>{playerDisplayName}</strong>
              {/if}
            </span>
          {/if}
        </div>
      {/if}
      
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
            {:else if deathMessage}
              Respawn
            {:else}
              Spawn Here
            {/if}
          </button>
        </div>
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
    pointer-events: all; /* Ensure clicks are captured by this element */
  }

  .spawn-menu {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    background: white;
    border-radius: 0.5em;
    box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.3);
    overflow: hidden;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    font-family: var(--font-body);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: center; /* Center the header text since there's no close button */
    padding: 0.8em 1em;
    background-color: rgba(0, 0, 0, 0.05);
    border-bottom: 1px solid #e0e0e0;
  }
  
  h2 {
    margin: 0;
    font-size: 1.3em;
    font-weight: 600;
    color: #333;
    font-family: var(--font-heading);
  }
  
  .content {
    padding: 1em;
    overflow-y: auto;
    max-height: calc(90vh - 4em);
  }

  .race-header {
    display: flex;
    align-items: center;
    margin-bottom: 1.2em;
    padding-bottom: 0.8em;
    border-bottom: 1px solid #e0e0e0;
  }
  
  .death-message-container {
    margin-bottom: 1.2em;
    padding: 1em;
    background-color: rgba(220, 53, 69, 0.1);
    border: 1px solid rgba(220, 53, 69, 0.2);
    border-radius: 0.5em;
    text-align: center;
    animation: pulse 2s infinite alternate;
  }
  
  @keyframes pulse {
    from { background-color: rgba(220, 53, 69, 0.05); }
    to { background-color: rgba(220, 53, 69, 0.15); }
  }
  
  .death-message {
    font-size: 1.1em;
    margin: 0;
    font-style: italic;
    color: #dc3545;
  }
  
  .race-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 0.8em;
  }

  .welcome-text {
    font-size: 1.1em;
    font-weight: 500;
    color: rgba(0, 0, 0, 0.8);
  }

  :global(.spawn-race-icon) {
    width: 2em;
    height: 2em;
    fill: rgba(0, 0, 0, 0.85);
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
    justify-content: center; /* Center the spawn button without cancel button */
    margin-top: 1.5em;
  }

  .spawn-button {
    position: relative;
    background-color: #4285f4;
    color: white;
    border: none;
    padding: 0.7em 1.2em;
    border-radius: 0.3em;
    font-size: 1em;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 10em; /* Give the button a minimum width for better appearance when centered */
  }

  .spawn-button:hover:not(:disabled) {
    background-color: #3367d6;
  }

  .spawn-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
    display: inline-block;
    margin-right: 0.5em;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  @media (max-width: 480px) {
    .spawn-menu {
      width: 95%;
      max-height: 80vh;
    }
    
    h2 {
      font-size: 1.1em;
    }
  }
</style>
