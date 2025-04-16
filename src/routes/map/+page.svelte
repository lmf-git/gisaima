<script>
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { user, loading as userLoading } from '../../lib/stores/user.js'; 
    import { 
      game, 
      getWorldInfo,
      getWorldCenterCoordinates,
      setCurrentWorld,
      isAuthReady,
      needsSpawn 
    } from "../../lib/stores/game.js";
    
    import { 
        map, 
        ready,
        targetStore,
        targetPosition,
        initialize,
        setup,
        moveTarget,
        setupFromWorldInfo,
        setupFromGameStore,
        cleanup,
        isInternalUrlChange,
        setHighlighted
    } from "../../lib/stores/map.js";
    
    // Import Firebase database
    import { ref, update } from "firebase/database";
    import { db } from "../../lib/firebase/database";
    
    import Tutorial from '../../components/map/Tutorial.svelte';
    import Grid from '../../components/map/Grid.svelte';
    import Minimap from '../../components/map/Minimap.svelte';
    import Axes from '../../components/map/Axes.svelte';
    import Legend from '../../components/map/Legend.svelte';
    import Details from '../../components/map/Details.svelte';
    import SpawnMenu from '../../components/map/SpawnMenu.svelte';
    import MapEntities from '../../components/map/MapEntities.svelte';
    import Close from '../../components/icons/Close.svelte';
    import Actions from '../../components/map/Actions.svelte';
    import Mobilize from '../../components/map/Mobilize.svelte';
    import Move from '../../components/map/Move.svelte';

    // Use $state for local component state
    let detailed = $state(false);
    let loading = $state(true);
    let error = $state(null);
    
    // URL coordinates handling
    let urlCoordinates = $state(null);
    let urlProcessingComplete = $state(false);
    
    // Flag to track initialization attempts
    let initAttempted = $state(false);
    
    // Enhanced loading state that includes auth and game loading
    const combinedLoading = $derived(loading || $game.worldLoading || !$isAuthReady);
    
    // Simplified derived state
    const isDragging = $derived($map.isDragging);
    
    // Updated UI state management function
    function toggleDetailsModal(show) {
        detailed = show;
    }
    
    // Track the source of URL coordinate changes
    let ignoreNextUrlChange = $state(false);
    let lastProcessedLocation = $state(null);
    
    // Enhanced URL coordinates handling
    let urlCoordinatesProcessing = $state(false);
    let urlCoordinatesLastProcessed = $state({ x: null, y: null });
    
    // Track processing state more effectively
    let coordinateProcessingState = $state({
        processing: false,
        processed: new Set(), // Track which coordinates have been processed
        lastProcessedTime: 0
    });
    
    // Simplified URL coordinates parsing with caching
    function parseUrlCoordinates() {
        if (!browser || !$page.url) return null;
        
        const x = $page.url.searchParams.get('x');
        const y = $page.url.searchParams.get('y');
        
        if (x !== null && y !== null) {
            const parsedX = parseInt(x, 10);
            const parsedY = parseInt(y, 10);
            
            if (!isNaN(parsedX) && !isNaN(parsedY)) {
                const coordKey = `${parsedX},${parsedY}`;
                
                // Skip if we've already processed these coordinates recently
                const now = Date.now();
                if (coordinateProcessingState.processed.has(coordKey) && 
                    now - coordinateProcessingState.lastProcessedTime < 2000) {
                    return null;
                }
                
                return { x: parsedX, y: parsedY, key: coordKey };
            }
        }
        
        return null;
    }
    
    // Listen for URL changes, including those caused by browser back/forward
    if (browser) {
        window.addEventListener('popstate', () => {
            // If this URL change was caused by our own update, ignore it
            if (isInternalUrlChange()) {
                ignoreNextUrlChange = true;
                return;
            }
            
            // Reset processing flag to handle external URL changes (like browser navigation)
            urlProcessingComplete = false;
        });
    }
    
    // Simplified effect for URL coordinate monitoring with localStorage consideration
    $effect(() => {
        // Skip if we're currently processing coordinates or if we're not in the browser
        if (coordinateProcessingState.processing || !browser || !$page.url) return;
        
        const newCoords = parseUrlCoordinates();
        
        if (newCoords && !isInternalUrlChange()) {
            console.log(`Found URL coordinates: ${newCoords.x},${newCoords.y}`);
            
            // Mark that we're processing coordinates
            coordinateProcessingState.processing = true;
            
            // Only apply coordinates if map is ready, otherwise store for later
            if ($ready) {
                console.log(`Applying URL coordinates: ${newCoords.x},${newCoords.y}`);
                moveTarget(newCoords.x, newCoords.y);
                
                // Record that we processed these coordinates
                coordinateProcessingState.processed.add(newCoords.key);
                coordinateProcessingState.lastProcessedTime = Date.now();
            } else {
                urlCoordinates = { x: newCoords.x, y: newCoords.y };
            }
            
            // Reset processing flag after a delay
            setTimeout(() => {
                coordinateProcessingState.processing = false;
            }, 100);
        }
    });
    
    // Simplified effect for applying URL coordinates after map is ready
    $effect(() => {
        if (!$ready || !urlCoordinates || coordinateProcessingState.processing) return;
        
        const coordKey = `${urlCoordinates.x},${urlCoordinates.y}`;
        
        // Skip if we've already processed these coordinates
        if (coordinateProcessingState.processed.has(coordKey)) {
            urlCoordinates = null;
            return;
        }
        
        coordinateProcessingState.processing = true;
        
        console.log(`Applying URL coordinates after map ready: ${urlCoordinates.x},${urlCoordinates.y}`);
        moveTarget(urlCoordinates.x, urlCoordinates.y);
        
        // Record that we processed these coordinates
        coordinateProcessingState.processed.add(coordKey);
        coordinateProcessingState.lastProcessedTime = Date.now();
        urlCoordinates = null;
        
        setTimeout(() => {
            coordinateProcessingState.processing = false;
        }, 100);
    });
    
    // Improved effect for applying URL coordinates
    $effect(() => {
        if (!$ready || urlProcessingComplete) return;
        
        if (urlCoordinates) {
            console.log(`Applying URL coordinates: ${urlCoordinates.x},${urlCoordinates.y}`);
            moveTarget(urlCoordinates.x, urlCoordinates.y);
            urlProcessingComplete = true;
            lastProcessedLocation = { ...urlCoordinates };
        } else if ($game.playerWorldData?.lastLocation && !$needsSpawn) {
            // Fall back to player location
            const location = $game.playerWorldData.lastLocation;
            moveTarget(location.x, location.y);
            urlProcessingComplete = true;
            lastProcessedLocation = { ...location };
        } else if ($game.currentWorld) {
            // If no player location, try to get world center
            const worldCenter = getWorldCenterCoordinates($game.currentWorld);
            moveTarget(worldCenter.x, worldCenter.y);
            urlProcessingComplete = true;
            lastProcessedLocation = { ...worldCenter };
        }
    });
    
    // No need for extra watching effect since the map store handles URL updates now

    // Handle spawn completion
    function handleSpawnComplete(spawnLocation) {
        if (spawnLocation) {
            moveTarget(spawnLocation.x, spawnLocation.y);
        }
    }
    
    // Initialize map function with improved URL coordinate handling and clearer priority
    async function initializeMap(worldId) {
        // Skip if world ID matches current world and map is already ready
        if ($ready && $map.world === worldId) {
            console.log(`Map already initialized for world ${worldId}, skipping redundant initialization`);
            
            // Still process URL coordinates if needed
            const startingCoords = parseUrlCoordinates();
            if (startingCoords && !urlProcessingComplete) {
                console.log(`Applying URL coordinates to existing map: ${startingCoords.x},${startingCoords.y}`);
                moveTarget(startingCoords.x, startingCoords.y);
                urlProcessingComplete = true;
            }
            
            return;
        }
        
        try {
            loading = true;
            error = null;
            
            // Wait for auth to be ready
            if (!$isAuthReady) {
                await new Promise(resolve => {
                    const unsubscribe = isAuthReady.subscribe(ready => {
                        if (ready) {
                            unsubscribe();
                            resolve();
                        }
                    });
                });
            }
            
            // Set current world and get world info
            await setCurrentWorld(worldId);
            const worldInfo = await getWorldInfo(worldId);
            
            if (!worldInfo) {
                throw new Error(`World info not found for ${worldId}`);
            }
            if (worldInfo.seed === undefined) {
                throw new Error(`World ${worldId} has no seed defined`);
            }
            
            // Establish clear priority order for coordinates:
            // 1. URL parameters (highest)
            // 2. localStorage saved position
            // 3. Player's last location in this world
            // 4. World center coordinates
            // 5. Default (0,0)
            
            let initialCoords = null;
            
            // 1. URL parameters
            const urlCoords = parseUrlCoordinates();
            if (urlCoords) {
                console.log(`Using URL coordinates: ${urlCoords.x},${urlCoords.y}`);
                initialCoords = urlCoords;
                urlProcessingComplete = true;
            } 
            // 2. localStorage saved position (handled internally in initialize)
            // 3. Player's last location
            else if ($game.playerWorldData?.lastLocation) {
                const location = $game.playerWorldData.lastLocation;
                console.log(`Using player's last location: ${location.x},${location.y}`);
                initialCoords = { x: location.x, y: location.y };
            } 
            // 4. World center coordinates
            else {
                const worldCenter = getWorldCenterCoordinates(worldId, worldInfo);
                console.log(`Using world center: ${worldCenter.x},${worldCenter.y}`);
                initialCoords = worldCenter;
            }
            
            // Initialize the map with the chosen coordinates
            if (!initialize({ 
                worldId,
                worldInfo,
                initialX: initialCoords.x,
                initialY: initialCoords.y
            })) {
                throw new Error('Failed to initialize map with world data');
            }
            
            loading = false;
            
        } catch (err) {
            error = err.message || 'Failed to load world';
            loading = false;
            console.error('Error initializing map:', err);
        }
    }
    
    // Auto-initialize when world data is ready
    $effect(() => {
        if (initAttempted || error || !$isAuthReady) return;
        
        if (!$game.worldLoading && $game.currentWorld && $game.worldInfo[$game.currentWorld]?.seed !== undefined) {
            initAttempted = true;
            
            try {
                const startingCoords = urlCoordinates;
                
                if (initialize({ 
                    gameStore: game,
                    initialX: startingCoords?.x,
                    initialY: startingCoords?.y
                })) {
                    loading = false;
                    error = null;
                    
                    if (startingCoords) {
                        urlProcessingComplete = true;
                    }
                } else {
                    error = 'Failed to initialize map with world data';
                    loading = false;
                }
            } catch (err) {
                console.error('Error initializing map:', err);
                error = err.message || 'Failed to initialize map';
            }
        }
    });
    
    // Handle auth state changes
    $effect(() => {
      if (browser && !$userLoading && $user === null) {
        const worldId = $page.url.searchParams.get('world') || $game.currentWorld;
        const redirectPath = worldId ? `/map?world=${worldId}` : '/map';
        goto(`/login?redirect=${encodeURIComponent(redirectPath)}`);
      }
    });
    
    // Get world ID from URL or store
    let currentWorldId = $state(null);
    
    $effect(() => {
        if (!browser) return;
        
        const worldFromUrl = $page.url.searchParams.get('world');
        const worldFromStore = $game?.currentWorld;
        
        currentWorldId = worldFromUrl || worldFromStore || null;
    });
    
    // Component lifecycle - optimize to prevent redundant initialization
    onMount(() => {
        if (!browser) return;
        
        document.body.classList.add('map-page-active');
        
        // Get world ID and coordinates once and store them
        const worldId = $page.url.searchParams.get('world') || $game.currentWorld;
        const coords = parseUrlCoordinates();
        
        if (coords) {
            urlCoordinates = { x: coords.x, y: coords.y };
        }
        
        if (!worldId) {
            goto('/worlds');
            return;
        }
        
        // First try to initialize from existing world info to avoid extra fetches
        if (!$ready && currentWorldId && $game.worldInfo[currentWorldId]?.seed !== undefined) {
            console.log(`Initializing map from existing world info for ${currentWorldId}`);
            
            initialize({ 
                worldId: currentWorldId, 
                worldInfo: $game.worldInfo[currentWorldId],
                initialX: urlCoordinates?.x,
                initialY: urlCoordinates?.y
            });
            
            if (urlCoordinates) {
                urlProcessingComplete = true;
                
                // Record processed coordinates
                const coordKey = `${urlCoordinates.x},${urlCoordinates.y}`;
                coordinateProcessingState.processed.add(coordKey);
                coordinateProcessingState.lastProcessedTime = Date.now();
            }
        } else {
            // Otherwise do a full initialization
            initializeMap(worldId).catch(err => {
                console.error(`Failed to initialize map:`, err); 
                error = err.message || `Failed to load world`;
                loading = false;
            });
        }
    });
    
    onDestroy(() => {
        if (browser) {
            document.body.classList.remove('map-page-active');
            cleanup();
        }
    });

    // UI component visibility state
    let showMinimap = $state(true);
    let showEntities = $state(true);
    let minimapClosing = $state(false);
    let entitiesClosing = $state(false);
    
    const ANIMATION_DURATION = 800;
    
    // Initialize UI visibility from localStorage
    $effect(() => {
        if (browser) {
            const storedMinimapVisibility = localStorage.getItem('minimap');
            const defaultMinimapVisibility = window.innerWidth >= 768;
            
            showMinimap = storedMinimapVisibility === 'false' ? false : 
                          storedMinimapVisibility === 'true' ? true : 
                          defaultMinimapVisibility;
            
            const storedEntitiesVisibility = localStorage.getItem('mapEntities');
            showEntities = storedEntitiesVisibility !== 'false';
            
            map.update(state => ({
                ...state,
                minimap: showMinimap
            }));
        }
    });
    
    // Toggle visibility functions
    function toggleMinimap() {
        if (showMinimap) {
            minimapClosing = true;
            setTimeout(() => {
                showMinimap = false;
                minimapClosing = false;
                map.update(state => ({ ...state, minimap: false }));
                if (browser) {
                    localStorage.setItem('minimap', 'false');
                }
            }, ANIMATION_DURATION);
        } else {
            if (showEntities) {
                entitiesClosing = true;
                setTimeout(() => {
                    showEntities = false;
                    entitiesClosing = false;
                    if (browser) {
                        localStorage.setItem('mapEntities', 'false');
                    }
                }, ANIMATION_DURATION);
            }
            
            showMinimap = true;
            map.update(state => ({ ...state, minimap: true }));
            if (browser) {
                localStorage.setItem('minimap', 'true');
            }
        }
    }
    
    function toggleEntities() {
        if (showEntities) {
            entitiesClosing = true;
            setTimeout(() => {
                showEntities = false;
                entitiesClosing = false;
                if (browser) {
                    localStorage.setItem('mapEntities', 'false');
                }
            }, ANIMATION_DURATION);
        } else {
            if (showMinimap) {
                minimapClosing = true;
                setTimeout(() => {
                    showMinimap = false;
                    minimapClosing = false;
                    map.update(state => ({ ...state, minimap: false }));
                    if (browser) {
                        localStorage.setItem('minimap', 'false');
                    }
                }, ANIMATION_DURATION);
            }
            
            showEntities = true;
            if (browser) {
                localStorage.setItem('mapEntities', 'true');
            }
        }
    }

    // State for actions popup
    let showActions = $state(false);
    let selectedTile = $state(null);
    
    // State for mobilize popup
    let showMobilize = $state(false);
    
    // State for move popup
    let showMove = $state(false);
    
    // Renamed to be more semantic - opens actions for a tile
    function openActionsForTile(cell) {
        selectedTile = cell;
        showActions = true;
    }
    
    // Close the actions popup
    function closeActionsPopup() {
        showActions = false;
        // Clear highlight when popup closes
        setHighlighted(null, null);
    }
    
    // Open mobilize popup
    function openMobilizePopup() {
        showMobilize = true;
        showActions = false; // Close actions when opening mobilize
    }
    
    // Close mobilize popup
    function closeMobilizePopup() {
        showMobilize = false;
        // Clear highlight when popup closes
        setHighlighted(null, null);
    }
    
    // Open move popup
    function openMovePopup() {
        showMove = true;
        showActions = false; // Close actions when opening move
    }
    
    // Close move popup
    function closeMovePopup() {
        showMove = false;
        // Clear highlight when popup closes
        setHighlighted(null, null);
    }
    
    // Handle action execution from the Actions component
    function handleAction(event) {
        const { action, tile } = event.detail;
        console.log('Action selected:', action, 'for tile:', tile);
        
        // Check if action is mobilize
        if (action === 'mobilize') {
            openMobilizePopup();
            return;
        }
        
        // Check if action is move
        if (action === 'move') {
            openMovePopup();
            return;
        }
        
        // Handle other action types
        switch(action) {
            case 'explore':
                console.log(`Exploring ${tile.x}, ${tile.y}`);
                // Implement explore logic
                break;
            // Handle other action types
        }
    }
    
    // Handle move event from the Move component
    function handleMove(event) {
        const { groupId, from, to } = event.detail;
        console.log('Moving group:', { groupId, from, to });
        
        // Direct database write for the move
        const worldId = $game.currentWorld;
        const uid = $user.uid;
        
        // Calculate chunk coordinates for source tile
        const chunkSize = 20;
        const chunkX = Math.floor(from.x / chunkSize);
        const chunkY = Math.floor(from.y / chunkSize);
        const chunkKey = `${chunkX},${chunkY}`;
        const tileKey = `${from.x},${from.y}`;
        
        // Get current time and set movement speed based on world speed
        const now = Date.now();
        const moveSpeed = 1; // Base movement speed in tiles per hour
        const worldSpeed = $game.worldInfo[worldId]?.speed || 1.0;
        
        // Create the updates object to write to the database
        const updates = {};
        
        // Update the group status to 'moving' and add target coordinates
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/status`] = 'moving';
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/targetX`] = to.x;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/targetY`] = to.y;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/moveStarted`] = now;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/moveSpeed`] = moveSpeed * worldSpeed;
        updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}/lastUpdated`] = now;
        
        // Apply the update
        update(ref(db), updates)
            .then(() => {
                console.log('Movement started:', { groupId, to });
            })
            .catch(error => {
                console.error('Movement error:', error);
            });
    }
</script>

<div class="map" class:dragging={isDragging}>
    {#if combinedLoading}
        <div class="loading-overlay">
            <div class="loading-spinner"></div>
            <div>
                {#if !$isAuthReady}
                    Loading user data...
                {:else if $game.worldLoading}
                    Loading world data...
                {:else}
                    Initializing world...
                {/if}
            </div>
        </div>
    {:else if error || $game.error}
        <div class="error-overlay">
            <h3>Error</h3>
            <p>{error || $game.error}</p>
            <button onclick={() => goto('/worlds')}>Go to Worlds</button>
        </div>
    {:else}
        <Grid {detailed} openActions={openActionsForTile} />
        
        <div class="map-controls">
            <button 
                class="control-button entity-button" 
                onclick={toggleEntities}
                aria-label={showEntities ? "Hide entities" : "Show entities"}>
                {#if showEntities || entitiesClosing}
                    <Close size="1.2em" extraClass="close-icon-dark" />
                {:else}
                    <span class="button-text">E</span>
                {/if}
            </button>
            
            <button 
                class="control-button minimap-button" 
                onclick={toggleMinimap}
                aria-label={showMinimap ? "Hide minimap" : "Show minimap"}>
                {#if showMinimap || minimapClosing}
                    <Close size="1.2em" extraClass="close-icon-dark" />
                {:else}
                    <span class="button-text">M</span>
                {/if}
            </button>
        </div>
        
        {#if showMinimap || minimapClosing}
            <Minimap closing={minimapClosing} />
        {/if}
        
        {#if showEntities || entitiesClosing}
            <MapEntities closing={entitiesClosing} />
        {/if}

        {#if detailed}
            <Details 
                x={$targetStore.x} 
                y={$targetStore.y} 
                terrain={$targetStore.biome?.name} 
                onClose={() => toggleDetailsModal(false)}
            />
        {:else}
            <Legend 
                x={$targetStore.x}  
                y={$targetStore.y}  
                openDetails={() => toggleDetailsModal(true)} 
            />
        {/if}

        {#if $ready}
            <Axes />
        {/if}

        <Tutorial />
        
        {#if $needsSpawn}
            <SpawnMenu onSpawn={handleSpawnComplete} />
        {/if}

        {#if showActions && selectedTile}
            <Actions 
                tile={selectedTile} 
                onClose={closeActionsPopup}
                on:action={handleAction} 
            />
        {/if}

        {#if showMobilize && selectedTile}
            <Mobilize
                tile={selectedTile}
                onClose={closeMobilizePopup}
                on:mobilize={handleMobilize}
            />
        {/if}

        {#if showMove && selectedTile}
            <Move
                tile={selectedTile}
                onClose={closeMovePopup}
                on:move={handleMove}
            />
        {/if}
    {/if}
</div>

<style>
    .map {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100dvh;
    }
    
    .map.dragging {
        overflow: hidden;
        touch-action: none;
    }
    
    :global(body.map-page-active) {
        overscroll-behavior: none;
        overflow: hidden;
        position: fixed;
        width: 100%;
        height: 100%;
    }
    
    .loading-overlay,
    .error-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        z-index: 1000;
    }
    
    .loading-spinner {
        border: 0.25em solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top: 0.25em solid white;
        width: 2.5em;
        height: 2.5em;
        animation: spin 1s linear infinite;
        margin-bottom: 1rem;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .error-overlay button {
        margin-top: 1rem;
        padding: 0.5rem 1rem;
        background: #4A90E2;
        color: white;
        border: none;
        border-radius: 0.25em;
        cursor: pointer;
    }

    .map-controls {
        position: absolute;
        top: 0.5em;
        right: 0.5em;
        display: flex;
        gap: 0.5em;
        z-index: 999;
    }
    
    .control-button {
        width: 2em;
        height: 2em;
        background-color: rgba(255, 255, 255, 0.85);
        border: 0.05em solid rgba(255, 255, 255, 0.2);
        border-radius: 0.3em;
        color: rgba(0, 0, 0, 0.8);
        padding: 0.3em;
        font-size: 1em;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
        transition: all 0.2s ease;
        backdrop-filter: blur(0.5em);
        -webkit-backdrop-filter: blur(0.5em);
        opacity: 0;
        transform: translateY(-1em);
        animation: fadeInButton 0.7s ease-out 0.5s forwards;
    }
    
    .control-button:hover {
        background-color: rgba(255, 255, 255, 0.95);
        border-color: rgba(255, 255, 255, 0.5);
    }
    
    .button-text {
        font-weight: bold;
        color: rgba(0, 0, 0, 0.8);
    }
    
    @keyframes fadeInButton {
        0% {
            opacity: 0;
            transform: translateY(-1em);
        }
        100% {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .control-button:focus-visible {
        outline: 0.15em solid rgba(0, 0, 0, 0.6);
        outline-offset: 0.1em;
    }
</style>