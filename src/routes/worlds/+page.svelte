<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, loading as userLoading } from '../../lib/stores/user.js';
  import { game, joinWorld, setCurrentWorld, initGameStore } from '../../lib/stores/game.js';
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
  let loadError = $state(null);
  
  // Function to load worlds data - improved with better error handling
  function loadWorlds() {
    if (!browser || !$user) {
      console.log('Cannot load worlds: browser or user not available');
      return;
    }
    
    console.log('Attempting to load worlds for user:', $user.uid);
    loading = true;
    loadError = null;
    
    try {
      const worldsRef = ref(db, 'worlds');
      console.log('Database reference created for:', worldsRef.toString());
      
      // Check if database is initialized
      if (!db) {
        console.error('Firebase database not initialized');
        loadError = 'Firebase database not initialized';
        loading = false;
        return;
      }
      
      // Add a one-time listener first to check connection
      const checkListener = onValue(worldsRef, 
        (snapshot) => {
          console.log('Initial worlds check completed:', 
            snapshot.exists() ? `Found ${Object.keys(snapshot.val()).length} worlds` : 'No worlds data');
          
          if (snapshot.exists()) {
            const data = snapshot.val();
            console.log('World IDs found:', Object.keys(data));
            
            // Process the data
            processWorldsData(data);
          } else {
            console.log('No worlds data found in database');
            worlds = [];
            loading = false;
          }
        }, 
        (error) => {
          console.error('Firebase error loading worlds:', error);
          loadError = `Database error: ${error.message}`;
          loading = false;
        }
      );
      
      return () => {
        // Cleanup function
        checkListener && checkListener();
      };
    } catch (error) {
      console.error('Exception during worlds loading:', error);
      loadError = `Exception: ${error.message}`;
      loading = false;
    }
  }
  
  // Separate function to process worlds data
  function processWorldsData(data) {
    try {
      // Filter out worlds without info and map to our format
      const validWorlds = Object.keys(data)
        .filter(key => data[key] && data[key].info)  // Ensure world has info object
        .map(key => {
          const worldInfo = data[key].info;
          return {
            id: key,
            name: worldInfo.name || key,
            description: worldInfo.description || '',
            playerCount: worldInfo.playerCount || 0,
            created: worldInfo.created || Date.now(),
            joined: $game.joinedWorlds.includes(key)
          };
        });
      
      console.log(`Processed ${validWorlds.length} valid worlds`);
      worlds = validWorlds;
    } catch (err) {
      console.error('Error processing worlds data:', err);
      loadError = `Data processing error: ${err.message}`;
    } finally {
      loading = false;
    }
  }
  
  // Initialize game store on component mount to ensure proper setup
  let unsubGameStore;
  
  onMount(() => {
    console.log('Worlds page mounted');
    
    // Make sure game store is initialized before attempting to load worlds
    if (!unsubGameStore) {
      unsubGameStore = initGameStore();
      console.log('Game store initialized on mount');
    }
    
    // Small delay to ensure auth state is properly processed
    setTimeout(() => {
      if (browser && !$userLoading && $user) {
        console.log('Auth ready on mount, loading worlds after delay');
        loadWorlds();
      }
    }, 500);
    
    return () => {
      // Clean up subscriptions
      if (unsubGameStore) unsubGameStore();
    };
  });
  
  // Effect to handle authentication and redirection
  $effect(() => {
    if (!browser) return;
    
    console.log('Auth state updated:', $userLoading ? 'loading' : ($user ? 'authenticated' : 'not authenticated'));
    
    if (!$userLoading) {
      // Auth has been determined
      if ($user === null) {
        console.log('No user, redirecting to login');
        goto('/login?redirect=/worlds');
      } else if ($user) {
        console.log('User authenticated, loading worlds');
        loadWorlds();
      }
    }
  });

  function selectWorld(world) {
    // If already joined, just go to the world
    if ($game.joinedWorlds.includes(world.id)) {
      // Use setCurrentWorld to ensure it's saved to localStorage
      setCurrentWorld(world.id, world);
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
      // joinWorld already saves to localStorage, so we don't need to call setCurrentWorld
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
  {:else if loadError}
    <div class="error-message">
      Error loading worlds: {loadError}
      <button class="retry-button" onclick={loadWorlds}>Retry</button>
    </div>
  {:else if worlds.length === 0}
    <div class="no-worlds">
      <p>No worlds available</p>
      <button class="retry-button" onclick={loadWorlds}>Refresh</button>
    </div>
  {:else}
    <div class="worlds-grid">
      {#each worlds as world}
        <div class="world-card">
          <h2>{world.name || world.id}</h2>
          <p>{world.description || 'No description available'}</p>
          <div class="world-stats">
            <div class="stat-item">
              <span class="stat-label">Players:</span>
              <span class="stat-value">{world.playerCount || 0}</span>
            </div>
            <div class="stat-item">
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
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 1rem;
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
    gap: 1.5rem; /* Slightly reduced gap on mobile */
    padding: 0 0.5rem; /* Reduced side padding to make cards wider */
    width: 100%; /* Ensure grid takes full width */
  }
  
  .world-card {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1.25rem; /* Slightly less padding on mobile */
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    width: 100%; /* Full width on mobile */
  }
  
  @media (min-width: 640px) {
    .worlds-page {
      margin: 3rem auto;
      padding: 1.5rem;
    }
    
    .worlds-grid {
      padding: 0 1.5rem;
      gap: 2rem;
    }
    
    .world-card {
      padding: 1.5rem;
    }
  }
  
  @media (min-width: 768px) {
    .worlds-grid {
      flex-direction: row; /* Switch to horizontal on larger screens */
      flex-wrap: wrap; /* Allow wrapping to next row */
      justify-content: center; /* Center the cards */
      padding: 0 2rem;
    }
    
    .world-card {
      flex: 0 0 calc(50% - 1.5rem); /* Two cards per row with gap */
      max-width: calc(50% - 1.5rem);
    }
  }
  
  @media (min-width: 1024px) {
    .worlds-page {
      margin: 4rem auto;
      padding: 2rem;
    }
    
    .worlds-grid {
      padding: 0 3rem;
    }
    
    .world-card {
      flex: 0 0 calc(33.333% - 2rem); /* Three cards per row with gap */
      max-width: calc(33.333% - 2rem);
    }
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
    background-color: rgba(42, 107, 122, 0.15);
  }
  
  .stat-label {
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    margin-right: 0.5rem;
  }
  
  .stat-value {
    margin-left: auto;
    color: rgba(255, 255, 255, 0.95);
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
  
  .error-message {
    text-align: center;
    margin: 3rem 0;
    padding: 1rem;
    color: #dc3545;
    background-color: rgba(220, 53, 69, 0.1);
    border: 1px solid rgba(220, 53, 69, 0.3);
    border-radius: 8px;
  }
  
  .retry-button {
    display: inline-block;
    margin-top: 1rem;
    padding: 0.5rem 1.5rem;
    background-color: #2a6b7a;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    transition: all 0.2s ease;
  }
  
  .retry-button:hover {
    background-color: #3a7d8c;
  }
</style>
