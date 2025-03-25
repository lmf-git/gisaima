<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, loading as userLoading } from '../../lib/stores/user.js';
  import { game, joinWorld, setCurrentWorld, initGameStore } from '../../lib/stores/game.js';
  import { ref, onValue } from "firebase/database";
  import { db } from '../../lib/firebase/database.js';
  import { browser } from '$app/environment';
  import JoinConfirmation from '../../components/JoinConfirmation.svelte';
  import WorldCard from '../../components/WorldCard.svelte';
  
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
            joined: $game.joinedWorlds.includes(key),
            seed: worldInfo.seed || 0  // Add seed for the WorldCard component
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
          <div class="world-preview">
            <WorldCard 
              worldId={world.id}
              seed={world.seed}
              tileSize={0.5}
            />
          </div>
          
          <div class="world-info">
            <h2>{world.name || world.id}</h2>
            <p class="world-description">{world.description || 'No description available'}</p>
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
    flex-direction: column;
    gap: 1.5rem;
    padding: 0 0.5rem;
    width: 100%;
  }
  
  .world-card {
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    background-color: var(--color-dark-blue);
    width: 100%;
  }
  
  .world-preview {
    width: 100%;
    aspect-ratio: 2 / 1;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .world-info {
    padding: 1rem;
    display: flex;
    flex-direction: column;
  }
  
  .world-info h2 {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
    color: var(--color-pale-green);
  }
  
  .world-description {
    margin-bottom: 1rem;
    opacity: 0.9;
    font-size: 0.95rem;
  }
  
  .world-stats {
    margin: 0.75rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.9rem;
  }
  
  .stat-item {
    display: flex;
    align-items: center;
    padding: 0.4rem 0.6rem;
    border-radius: 4px;
    background-color: rgba(0, 0, 0, 0.2);
  }
  
  .stat-label {
    font-weight: 600;
    color: var(--color-pale-green);
    margin-right: 0.5rem;
  }
  
  .stat-value {
    margin-left: auto;
    color: rgba(255, 255, 255, 0.95);
    font-weight: 500;
  }
  
  .world-action-button {
    align-self: center;
    margin-top: 1rem;
    min-width: 180px;
    background-color: rgba(42, 107, 122, 0.9);
    border: 0.05em solid var(--color-muted-teal);
    box-shadow: 0 0.3em 0.8em rgba(0, 0, 0, 0.4);
    padding: 0.8em 1.2em;
    color: white;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    border-radius: 4px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-family: var(--font-heading);
  }
  
  .world-action-button:hover {
    transform: translateY(-0.1em);
    background-color: rgba(58, 125, 140, 0.9);
    box-shadow: 0 0.4em 1em rgba(0, 0, 0, 0.5);
  }
  
  .world-action-button.joined {
    background-color: rgba(46, 139, 87, 0.9);
    border-color: rgba(60, 159, 104, 0.8);
  }
  
  .world-action-button.joined:hover {
    background-color: rgba(57, 163, 103, 0.9);
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
      flex-direction: row;
      align-items: stretch;
    }
    
    .world-preview {
      width: 40%;
      min-width: 200px;
      aspect-ratio: 1 / 1;
      border-right: 1px solid rgba(255, 255, 255, 0.1);
      border-bottom: none;
    }
    
    .world-info {
      flex: 1;
      padding: 1.25rem;
    }
  }
  
  @media (min-width: 768px) {
    .worlds-grid {
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: center;
      padding: 0 2rem;
      gap: 2rem;
    }
    
    .world-card {
      flex: 0 0 calc(50% - 1rem);
      max-width: calc(50% - 1rem);
      flex-direction: column;
    }
    
    .world-preview {
      width: 100%;
      aspect-ratio: 2 / 1;
      border-right: none;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
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
      flex: 0 0 calc(33.333% - 1.333rem);
      max-width: calc(33.333% - 1.333rem);
    }
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
