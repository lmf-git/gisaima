<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, loading as userLoading } from '../../lib/stores/user.js';
  import { game, joinWorld, setCurrentWorld } from '../../lib/stores/game.js';
  import { ref, onValue } from "firebase/database";
  import { db } from '../../lib/firebase/database.js';
  import { browser } from '$app/environment';
  import JoinConfirmation from '../../components/JoinConfirmation.svelte';
  
  // Add state variables
  let selectedWorld = $state(null);
  let showConfirmation = $state(false);
  let animatingOut = $state(false);
  let worlds = $state([]);
  let loading = $state(true);
  
  // Effect to handle authentication and redirection
  $effect(() => {
    if (browser && !$userLoading) {
      // Auth has been determined
      if ($user === null) {
        goto('/login?redirect=/worlds');
      } else {
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
  
  function selectWorld(world) {
    // If already joined, just go to the world
    if ($game.joinedWorlds.includes(world.id)) {
      goto(`/map?world=${world.id}`);
      return;
    }
    
    // Otherwise, show the confirmation dialog
    selectedWorld = world;
    showConfirmation = true;
  }
  
  function closeConfirmation() {
    animatingOut = true;
    setTimeout(() => {
      showConfirmation = false;
      selectedWorld = null;
      animatingOut = false;
    }, 300); // Match animation duration
  }
  
  async function handleJoinWorld(race) {
    if (!$user || !selectedWorld) {
      return;
    }
    
    try {
      // Join the world with race information (lowercase ID)
      await joinWorld(selectedWorld.id, $user.uid, race.id.toLowerCase());
      goto(`/map?world=${selectedWorld.id}`);
    } catch (error) {
      console.error('Failed to join world:', error);
      closeConfirmation();
    }
  }
</script>

<div class="worlds-page">
  <h1>Available Worlds</h1>
  
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
            <div class="stat-item">
              <span class="stat-icon">👥</span>
              <span class="stat-label">Players:</span>
              <span class="stat-value">{world.playerCount || 0}</span>
            </div>
            <div class="stat-item">
              <span class="stat-icon">📅</span>
              <span class="stat-label">Created:</span>
              <span class="stat-value">{new Date(world.created || Date.now()).toLocaleDateString()}</span>
            </div>
          </div>
          
          <button 
            class="world-action-button" 
            class:joined={$game.joinedWorlds.includes(world.id)}
            onclick={() => selectWorld(world)}
          >
            {$game.joinedWorlds.includes(world.id) ? "Enter World" : "Join World"}
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showConfirmation && selectedWorld}
  <JoinConfirmation
    world={selectedWorld}
    onClose={closeConfirmation}
    onConfirm={handleJoinWorld}
    animatingOut={animatingOut}
  />
{/if}

<style>
  .worlds-page {
    max-width: 1200px;
    margin: 4rem auto; /* Added top and bottom margin */
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
    display: flex;
    flex-direction: column; /* Mobile first: stacked vertically */
    gap: 2rem;
    padding: 0 3em; /* Added 3em padding on sides */
  }
  
  @media (min-width: 768px) {
    .worlds-grid {
      flex-direction: row; /* Switch to horizontal on larger screens */
      flex-wrap: wrap; /* Allow wrapping to next row */
      justify-content: center; /* Center the cards */
    }
    
    .world-card {
      flex: 0 0 calc(50% - 2rem); /* Two cards per row with gap */
      max-width: calc(50% - 2rem);
    }
  }
  
  @media (min-width: 1024px) {
    .world-card {
      flex: 0 0 calc(33.333% - 2rem); /* Three cards per row with gap */
      max-width: calc(33.333% - 2rem);
    }
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
    margin: 1.25rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    font-size: 0.9rem;
  }
  
  .stat-item {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    background-color: rgba(42, 107, 122, 0.08);
  }
  
  .stat-icon {
    margin-right: 0.5rem;
    font-size: 0.9rem;
  }
  
  .stat-label {
    font-weight: 600;
    color: #555;
    margin-right: 0.5rem;
  }
  
  .stat-value {
    margin-left: auto;
    color: #333;
    font-weight: 500;
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
  
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
