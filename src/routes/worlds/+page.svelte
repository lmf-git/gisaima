<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user } from '../../lib/stores/user.js';
  import { game, joinWorld, setCurrentWorld } from '../../lib/stores/game.js';
  import { ref, onValue } from "firebase/database";
  import { db } from '../../lib/firebase/database.js';
  
  let worlds = $state([]);
  let loading = $state(true);
  let debugInfo = $state({});
  
  // Debug function to view current player data
  function refreshDebugInfo() {
    if ($user?.uid) {
      const playerRef = ref(db, `players/${$user.uid}`);
      onValue(playerRef, (snapshot) => {
        if (snapshot.exists()) {
          debugInfo = snapshot.val();
        } else {
          debugInfo = { error: 'No player data found' };
        }
      }, { onlyOnce: true });
    } else {
      debugInfo = { error: 'Not logged in' };
    }
  }
  
  onMount(() => {
    // Load all available worlds
    const worldsRef = ref(db, 'worlds');
    const unsubscribe = onValue(worldsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        worlds = Object.keys(data)
          .filter(key => data[key].info) // Make sure world has info
          .map(key => ({
            id: key,
            ...data[key].info,
            joined: $game.joinedWorlds.includes(key)
          }));
        
        refreshDebugInfo();
      }
      loading = false;
    });
    
    return unsubscribe;
  });
  
  function handleJoinWorld(worldId) {
    if (!$user) {
      // Redirect to login if not authenticated
      goto('/login?redirect=/worlds');
      return;
    }
    
    joinWorld(worldId, $user.uid)
      .then(() => {
        refreshDebugInfo();
        goto(`/map?world=${worldId}`);
      })
      .catch(error => {
        console.error('Failed to join world:', error);
      });
  }
  
  function handleEnterWorld(worldId) {
    setCurrentWorld(worldId);
    goto(`/map?world=${worldId}`);
  }
</script>

<div class="worlds-page">
  <h1>Available Worlds</h1>
  
  {#if $user}
    <div class="user-info">
      <p>Logged in as: {$user.email}</p>
      <p>Joined worlds: {$game.joinedWorlds.join(', ') || 'None'}</p>
    </div>
  {/if}
  
  {#if loading}
    <div class="loading">Loading worlds...</div>
  {:else if worlds.length === 0}
    <div class="no-worlds">No worlds available</div>
  {:else}
    <div class="worlds-grid">
      {#each worlds as world}
        <div class="world-card">
          <h2>{world.name || world.id}</h2>
          <p>{world.description || 'No description available'}</p>
          <div class="world-stats">
            <span>Players: {world.playerCount || 0}</span>
            <span>Created: {new Date(world.created || Date.now()).toLocaleDateString()}</span>
          </div>
          
          {#if world.joined}
            <button class="enter-btn" onclick={() => handleEnterWorld(world.id)}>
              Enter World
            </button>
          {:else}
            <button class="join-btn" onclick={() => handleJoinWorld(world.id)}>
              Join World
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
  
  <!-- Debug panel (only show in development) -->
  {#if import.meta.env?.DEV && $user}
    <div class="debug-panel">
      <h3>Debug Info</h3>
      <button class="button small" onclick={refreshDebugInfo}>Refresh Data</button>
      <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
    </div>
  {/if}
</div>

<style>
  .worlds-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }
  
  h1 {
    margin-bottom: 2rem;
    text-align: center;
  }
  
  .loading, .no-worlds {
    text-align: center;
    margin: 3rem 0;
    font-size: 1.2rem;
  }
  
  .worlds-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 2rem;
  }
  
  .world-card {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
  }
  
  .world-stats {
    margin: 1rem 0;
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
    color: #666;
  }
  
  button {
    margin-top: auto;
    padding: 0.75rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    transition: background-color 0.3s;
  }
  
  .enter-btn {
    background-color: #4A90E2;
    color: white;
  }
  
  .join-btn {
    background-color: #50C878;
    color: white;
  }
  
  button:hover {
    opacity: 0.9;
  }
  
  .user-info {
    background: var(--color-card-bg);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }
  
  .debug-panel {
    margin-top: 2rem;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    overflow: auto;
  }
  
  .debug-panel pre {
    background: rgba(0, 0, 0, 0.2);
    padding: 0.5rem;
    border-radius: 4px;
    overflow: auto;
    font-size: 0.8rem;
    max-height: 300px;
  }
  
  .button.small {
    font-size: 0.8rem;
    padding: 0.3rem 0.6rem;
    margin-bottom: 0.5rem;
  }
</style>
