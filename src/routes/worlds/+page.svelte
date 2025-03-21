<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, loading as userLoading } from '../../lib/stores/user.js';
  import { game, joinWorld, setCurrentWorld } from '../../lib/stores/game.js';
  import { ref, onValue } from "firebase/database";
  import { db } from '../../lib/firebase/database.js';
  import { browser } from '$app/environment';
  
  // Add state variables
  let joiningWorldId = $state(null);
  let worlds = $state([]);
  let loading = $state(true);
  
  // Effect to handle authentication and redirection
  $effect(() => {
    if (browser && !$userLoading) {
      // Auth has been determined
      if ($user === null) {
        console.log('User is not authenticated, redirecting to login');
        goto('/login?redirect=/worlds');
      } else {
        console.log('User is authenticated:', $user.uid);
        loadWorlds();
      }
    }
  });
  
  // Function to load worlds data
  function loadWorlds() {
    if (!browser || !$user) return;
    
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
      }
      loading = false;
    });
    
    return unsubscribe;
  }
  
  onMount(() => {
    // We'll use the effect for auth check and loading worlds
    return () => {
      // Any cleanup when component unmounts
    };
  });
  
  function handleJoinWorld(worldId) {
    if (!$user) {
      // Redirect to login if not authenticated
      goto('/login?redirect=/worlds');
      return;
    }
    
    joiningWorldId = worldId; // Set the joining state
    
    joinWorld(worldId, $user.uid)
      .then(() => {
        joiningWorldId = null; // Clear joining state
        goto(`/map?world=${worldId}`);
      })
      .catch(error => {
        console.error('Failed to join world:', error);
        joiningWorldId = null; // Clear joining state on error
      });
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
          
          <button 
            class="world-action-button" 
            class:joined={$game.joinedWorlds.includes(world.id)}
            onclick={() => $game.joinedWorlds.includes(world.id) 
              ? goto(`/map?world=${world.id}`) 
              : handleJoinWorld(world.id)}
            disabled={joiningWorldId === world.id}
          >
            {#if joiningWorldId === world.id}
              <div class="spinner"></div>
              Joining...
            {:else}
              {$game.joinedWorlds.includes(world.id) ? "Enter World" : "Join World"}
            {/if}
          </button>
        </div>
      {/each}
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
    transition: all 0.3s ease;
    font-family: var(--font-heading);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .world-action-button {
    background-color: #2a6b7a;  /* Solid color instead of using var */
    color: white;
    border: 0.05em solid var(--color-muted-teal);
    text-shadow: 0 0 0.5em rgba(0, 0, 0, 0.5);
    box-shadow: 0 0.3em 0.8em var(--color-shadow);
    padding: 0.8em 1.2em;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }
  
  .world-action-button:hover {
    transform: translateY(-0.1em);
    background-color: #3a7d8c;
    box-shadow: 0 0.4em 1em var(--color-shadow);
    color: #ffffff;
    text-shadow: 0 0 0.8em rgba(0, 0, 0, 0.7);
  }
  
  .world-action-button.joined {
    background-color: #2e8b57;  /* Solid sea green for "Enter World" */
    border-color: #3c9f68;
    color: white;
  }
  
  .world-action-button.joined:hover {
    background-color: #39a367;
  }
  
  .world-action-button:disabled {
    background-color: #6c757d;
    border-color: #5a6268;
    cursor: not-allowed;
    opacity: 0.8;
    transform: none;
    box-shadow: 0 0.2em 0.4em rgba(0, 0, 0, 0.2);
  }
  
  .world-action-button:active {
    transform: translateY(0.05em);
    box-shadow: 0 0.1em 0.3em var(--color-shadow);
  }
  
  .spinner {
    display: inline-block;
    width: 1em;
    height: 1em;
    border: 0.2em solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: white;
    animation: spin 1s ease-in-out infinite;
    margin-right: 0.5em;
    vertical-align: middle;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .user-info {
    background: var(--color-card-bg);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }
</style>
