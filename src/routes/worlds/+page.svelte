<script>
  import { ref, onValue } from "firebase/database";
  import { httpsCallable } from "firebase/functions";

  import { functions, db } from '../../lib/firebase.js';

  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';

  import { user, loading as userLoading } from '../../lib/stores/user.js';
  import { 
    game, 
    setCurrentWorld, 
    getWorldInfo,
    getWorldCenterCoordinates,
    loadJoinedWorlds,
    listenToPlayerWorldData,
    getAvailableWorlds,
    getWorldMetadata
  } from '../../lib/stores/game.js';
  import { clearSavedTargetPosition } from '../../lib/stores/map.js';

  import JoinConfirmation from '../../components/specific/worlds/JoinConfirmation.svelte';
  import WorldCard from '../../components/specific/worlds/WorldCard.svelte';
  
  let selectedWorld = $state(null);
  let showConfirmation = $state(false);
  let animatingOut = $state(false);
  let worlds = $state([]);
  let loading = $state(true);
  let loadError = $state(null);
  let loadingInitiated = $state(false);
  let loadedWorldCards = $state(new Set());
  let loadingQueue = $state([]);
  let currentlyLoading = $state(false);
  const worldCenters = $state({});
  let joinedWorldIds = $state([]);

  $effect(() => {
    if ($game && $game.joinedWorlds) {
      console.log('📊 Worlds page received updated joined worlds:', $game.joinedWorlds);
      joinedWorldIds = [...$game.joinedWorlds];
    }
  });


  $effect(() => {
    if (!browser) return;
    
    if (!$userLoading) {
      if ($user === null) {
        console.log('No user, redirecting to login');
        goto('/login?redirect=/worlds');
      } else if ($user && !loadingInitiated) {
        console.log('User authenticated, loading worlds');
        loadWorlds();
      }
    }
  });

  function getCoordinateParams() {
    if (!browser) return '';
    const url = $page?.url;
    if (!url) return '';
    
    const x = url.searchParams.get('x');
    const y = url.searchParams.get('y');
    
    if (x !== null && y !== null) {
      return `&x=${x}&y=${y}`;
    }
    return '';
  }

  function selectWorld(world) {
    const coordParams = getCoordinateParams();
    
    if (isWorldJoined(world.id)) {
      setCurrentWorld(world.id, world);
      goto(`/map?world=${world.id}${coordParams}`);
      return;
    }
    selectedWorld = world;
    showConfirmation = true;
  }
  
  async function handleJoinWorld(world, race, name) {
    if (!$user || !selectedWorld) {
      return;
    }
    
    const coordParams = getCoordinateParams();
    
    try {
      // Set loading state
      game.update(state => ({ ...state, loading: true, error: null }));
      
      // Clear any saved target position when joining a world
      if (browser) {
        clearSavedTargetPosition(selectedWorld.id);
      }
      
      // Call the Cloud Function directly
      const joinWorldFn = httpsCallable(functions, 'joinWorld');
      const result = await joinWorldFn({
        worldId: selectedWorld.id,
        race,
        displayName: name,
        spawnPosition: selectedWorld.center || worldCenters[selectedWorld.id] || { x: 0, y: 0 }
      });
      
      const { success, coordinates } = result.data;
      
      if (!success) {
        throw new Error('Failed to join world');
      }
      
      // Update local state to include this world
      game.update(state => {
        const joinedWorlds = [...(state.joinedWorlds || [])];
        
        // Only add if not already in the list
        if (!joinedWorlds.includes(selectedWorld.id)) {
          joinedWorlds.push(selectedWorld.id);
        }
        
        return {
          ...state,
          joinedWorlds,
          worldKey: selectedWorld.id,
          loading: false,
        };
      });
      
      // Wait for the world info to be fully loaded
      let worldInfo = await getWorldInfo(selectedWorld.id);
      
      if (!worldInfo) {
        console.log(`No world info returned for ${selectedWorld.id}, retrying...`);
        worldInfo = await getWorldInfo(selectedWorld.id);
      }
      
      // Save to localStorage
      if (browser) {
        try {
          localStorage.setItem('gisaima-current-world', selectedWorld.id);
        } catch (e) {
          console.error('Failed to save world to localStorage:', e);
        }
      }
      
      // Set up listener for player data in this world
      if ($user.uid) {
        listenToPlayerWorldData($user.uid, selectedWorld.id);
      }

      await setCurrentWorld(selectedWorld.id);
      
      console.log(`Successfully joined world ${selectedWorld.id}, preparing navigation...`);
      console.log(`Navigating to map page for world ${selectedWorld.id}`);

      goto(`/map?world=${selectedWorld.id}${coordParams}`);
    } catch (error) {
      console.error('Failed to join world:', error);
      game.update(state => ({ 
        ...state, 
        loading: false, 
        error: `Failed to join world: ${error.message}` 
      }));
      closeConfirmation();
    }
  }

  async function loadWorlds() {
    if (!browser || !$user) {
      console.log('Cannot load worlds: browser or user not available');
      return;
    }
    
    if (loadingInitiated) {
      console.log('Worlds loading already initiated, skipping duplicate call');
      return;
    }
    
    loadingInitiated = true;
    console.log('Attempting to load available worlds');
    loading = true;
    loadError = null;
    
    try {
      if ($user?.uid) {
        loadJoinedWorlds($user.uid);
      }
      
      // First, load the available worlds array
      const availableWorldIds = await getAvailableWorlds();
      
      if (!availableWorldIds || availableWorldIds.length === 0) {
        console.log('No available worlds found');
        worlds = [];
        loading = false;
        return;
      }
      
      console.log(`Found ${availableWorldIds.length} available worlds:`, availableWorldIds);
      
      // Initialize the world list with placeholders for each world ID
      worlds = availableWorldIds.map(worldId => ({
        id: worldId,
        name: worldId, // Temporary until we load metadata
        loading: true,
        joined: isWorldJoined(worldId)
      }));
      
      // Track already loaded worlds to avoid duplicate requests
      const processedWorlds = new Set();
      
      // Start loading metadata for each world
      for (const worldId of availableWorldIds) {
        if ($game.worlds[worldId]) {
          // World data already exists in the store, use it directly
          const worldData = $game.worlds[worldId];
          const metadata = {
            id: worldId,
            name: worldData.name || worldId,
            description: worldData.description || '',
            playerCount: worldData.playerCount || 0,
            seed: worldData.seed || 0,
            center: worldData.center || { x: 0, y: 0 },
            created: worldData.created || Date.now(),
            speed: worldData.speed || 1.0,
            size: worldData.size || 'medium',
            loading: false,
            joined: isWorldJoined(worldId)
          };
          
          // Update this world in the list without triggering a duplicate fetch
          worlds = worlds.map(world => 
            world.id === worldId ? metadata : world
          );
          
          if (worldData.center) {
            worldCenters[worldId] = worldData.center;
          }
          
          processedWorlds.add(worldId);
          console.log(`Using cached data for world ${worldId}`);
          
          // Add to loaded world cards immediately since we already have the data
          loadedWorldCards = new Set([...loadedWorldCards, worldId]);
          continue;
        }
        
        // Need to fetch this world's metadata
        try {
          const metadata = await getWorldMetadata(worldId);
          
          if (metadata) {
            // Update this world's entry in the list
            worlds = worlds.map(world => 
              world.id === worldId 
                ? { 
                    ...metadata,
                    loading: false,
                    joined: isWorldJoined(worldId)
                  } 
                : world
            );
            
            if (metadata.center) {
              worldCenters[worldId] = metadata.center;
            }
            
            processedWorlds.add(worldId);
            console.log(`Loaded metadata for world ${worldId}:`, metadata);
          } else {
            console.warn(`No metadata found for world ${worldId}`);
            // Mark as error but keep in the list
            worlds = worlds.map(world => 
              world.id === worldId 
                ? { ...world, loading: false, error: 'No data available' } 
                : world
            );
          }
        } catch (err) {
          console.error(`Error loading world ${worldId}:`, err);
          worlds = worlds.map(world => 
            world.id === worldId 
              ? { ...world, loading: false, error: err.message } 
              : world
          );
        }
      }
      
      // Update loading queue to only include worlds not already fully processed
      loadingQueue = availableWorldIds.filter(id => !processedWorlds.has(id));
      console.log(`Worlds requiring terrain generation: ${loadingQueue.length}`);
      
      if (loadingQueue.length > 0) {
        // Start loading world cards after a short delay
        setTimeout(startLoadingQueue, 500);
      }
      
      // Mark overall loading as complete once we have the list
      loading = false;
    } catch (error) {
      console.error('Exception during worlds loading:', error);
      loadError = `Exception: ${error.message}`;
      loading = false;
    }
  }
  
  function processWorldsData(data) {
    // This function is no longer used with the new approach
  }

  async function preloadWorldInfoForWorlds(worldIds) {
    if (!Array.isArray(worldIds) || worldIds.length === 0) return;
    
    console.log('Preloading world info for selected worlds');
    const promises = [];
    
    for (const worldId of worldIds) {
      if (!$game.worlds[worldId]) {
        console.log(`Preloading info for world ${worldId}`);
        promises.push(getWorldInfo(worldId)
          .then(info => {
            if (info && info.center) {
              worldCenters[worldId] = info.center;
              console.log(`Updated center for ${worldId}:`, info.center);
            }
            return info;
          })
          .catch(err => {
            console.warn(`Error preloading world ${worldId}:`, err);
          })
        );
      }
    }
    
    if (promises.length > 0) {
      try {
        await Promise.all(promises);
        console.log('All world info preloading complete');
      } catch (error) {
        console.error('Error during world info preloading:', error);
      }
    }
  }
  
  function startLoadingQueue() {
    if (loadingQueue.length > 0 && !currentlyLoading) {
      console.log(`Starting world card loading queue with ${loadingQueue.length} cards`);
      loadNextWorldCard();
    }
  }
  
  function loadNextWorldCard() {
    if (loadingQueue.length === 0 || currentlyLoading) {
      return;
    }
    
    currentlyLoading = true;
    const nextWorldId = loadingQueue[0];
    console.log(`Loading world card for: ${nextWorldId}`);
    
    // Check if we already have this world's data before making a new request
    const world = $game.worlds[nextWorldId];
    
    if (world) {
      console.log(`Using existing data for ${nextWorldId} terrain`);
      setTimeout(() => {
        loadedWorldCards = new Set([...loadedWorldCards, nextWorldId]);
        loadingQueue = loadingQueue.filter(id => id !== nextWorldId);
        currentlyLoading = false;
        
        if (loadingQueue.length > 0) {
          const delay = 300 + Math.random() * 200;
          setTimeout(() => loadNextWorldCard(), delay);
        } else {
          console.log('All world cards loaded successfully');
        }
      }, 400);
    } else {
      console.log(`Fetching new terrain data for ${nextWorldId}`);
      getWorldInfo(nextWorldId)
        .then(info => {
          if (info) {
            worldCenters[nextWorldId] = getWorldCenterCoordinates(nextWorldId, info);
          }
          
          setTimeout(() => {
            loadedWorldCards = new Set([...loadedWorldCards, nextWorldId]);
            loadingQueue = loadingQueue.filter(id => id !== nextWorldId);
            currentlyLoading = false;
            
            if (loadingQueue.length > 0) {
              const delay = 300 + Math.random() * 200;
              setTimeout(() => loadNextWorldCard(), delay);
            } else {
              console.log('All world cards loaded successfully');
            }
          }, 400);
        })
        .catch(err => {
          console.error(`Error loading info for ${nextWorldId}:`, err);
          loadingQueue = loadingQueue.filter(id => id !== nextWorldId);
          currentlyLoading = false;
          
          if (loadingQueue.length > 0) {
            loadNextWorldCard();
          }
        });
    }
  }
  
  function isWorldJoined(worldId) {
    return joinedWorldIds.includes(worldId) || $game.joinedWorlds?.includes(worldId) || false;
  }
  

  function closeConfirmation() {
    animatingOut = true;
    setTimeout(() => {
      showConfirmation = false;
      selectedWorld = null;
      animatingOut = false;
    }, 300);
  }


</script>

<div class="worlds-page">
  <h1>Available Worlds</h1>
  
  {#if loading}
    <div class="loading">Loading worlds...</div>
  {:else if loadError}
    <div class="error-message">
      Error loading worlds: {loadError}
      <button class="retry-button" onclick={() => {loadingInitiated = false; loadWorlds();}}>Retry</button>
    </div>
  {:else if worlds.length === 0}
    <div class="no-worlds">
      <p>No worlds available</p>
      <button class="retry-button" onclick={() => {loadingInitiated = false; loadWorlds();}}>Refresh</button>
    </div>
  {:else}
    <div class="worlds-grid">
      {#each worlds as world}
        <div class="world-card">
          <div class="world-preview">
            {#if world.loading}
              <div class="card-loading-overlay">
                <div class="loading-spinner"></div>
              </div>
            {:else}
              <WorldCard 
                worldId={world.id}
                seed={world.seed}
                tileSize={2}
                joined={isWorldJoined(world.id)}
                world={$game.worlds[world.id]}
                worldCenter={world.center || worldCenters[world.id]}
                debug={true}
                loaded={(event) => {
                  // Add the world to loaded cards when the WorldCard emits loaded event
                  loadedWorldCards = new Set([...loadedWorldCards, event.worldId]);
                }}
              />
              <!-- Only show loading overlay if not in loadedWorldCards -->
              {#if !loadedWorldCards.has(world.id)}
                <div class="card-loading-overlay">
                  <div class="loading-spinner"></div>
                </div>
              {/if}
            {/if}
          </div>
          <div class="world-info">
            <h2>{world.error ? `${world.name} (Error)` : world.name || world.id}</h2>
            <p class="world-description">
              {#if world.error}
                <span class="error-text">Error loading world data: {world.error}</span>
              {:else if world.loading}
                Loading world information...
              {:else}
                {world.description || 'No description available'}
              {/if}
            </p>
            <div class="world-stats">
              <div class="stat-item">
                <span class="stat-label">Players:</span>
                <span class="stat-value">{world.loading ? '...' : world.playerCount || 0}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Speed:</span>
                <span class="stat-value">{world.loading ? '...' : (world.speed || $game.worlds[world.id]?.speed || 1.0).toFixed(1)}x</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Created:</span>
                <span class="stat-value">{world.loading ? '...' : new Date(world.created || Date.now()).toLocaleDateString()}</span>
              </div>
            </div>
            
            <button 
              class="world-action-button" 
              class:joined={isWorldJoined(world.id)}
              onclick={() => selectWorld(world)}
              disabled={world.loading || world.error}
            >
              {world.loading ? "Loading..." : isWorldJoined(world.id) ? "Enter World" : "Join World"}
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
    width: 100%;
    margin: 0;
    padding: 1rem;
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
    width: 100%;
    align-items: center;
  }
  
  .world-card {
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    background-color: var(--color-dark-blue);
    width: 100%;
    will-change: transform;
  }

  .world-preview {
    position: relative;
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
    height: 3.5em;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    text-overflow: ellipsis;
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
    width: 100%;
    background-color: rgba(42, 107, 122, 0.9);
    border: 0.05em solid var(--color-muted-teal);
    box-shadow: 0 0.3em 0.8em rgba(0, 0, 0, 0.4);
    padding: 0.8em 1.2em;
    color: white;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s ease, transform 0.2s ease;
    border-radius: 4px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-family: var(--font-heading);
    will-change: transform, background-color;
    position: relative;
    z-index: 10;
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

  .card-loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background-color: rgba(0, 0, 0, 0.5);
    color: white;
    font-size: 0.9rem;
    z-index: 5;
    pointer-events: none;
  }
  
  .loading-spinner {
    width: 30px;
    height: 30px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: var(--color-pale-green);
    animation: spin 1s linear infinite;
    will-change: transform;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (min-width: 640px) {
    .worlds-page {
      padding: 1.5rem;
    }
    
    .worlds-grid {
      gap: 2rem;
    }
    
    .world-card {
      flex-direction: row;
      align-items: stretch;
    }
    
    .world-preview {
      width: 40%;
      aspect-ratio: 1 / 1;
      border-right: 1px solid rgba(255, 255, 255, 0.1);
      border-bottom: none;
    }
      
    .world-info {
      flex: 1;
      padding: 1.25rem;
    }

    .world-action-button {
      width: auto;
      padding: 0.8em 2em;
    }
  }
  
  @media (min-width: 768px) {
    .worlds-page {
      padding: 2rem;
      width: 90%;
      margin: 0 auto;
    }
    
    .worlds-grid {
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: center;
    }

    .world-card {
      flex: 0 1 calc(50% - 2rem);
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
      width: 85%;
      margin: 2rem auto;
    }
    
    .world-card {
      flex: 0 1 calc(33.333% - 2rem);
    }
  }

  @media (min-width: 1280px) {
    .worlds-page {
      width: 80%;
      max-width: 1400px;
    }
  }

  .error-text {
    color: #ff6b6b;
  }
</style>
