<script>
    import { browser } from '$app/environment';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { get } from 'svelte/store';
    import { user, loading as userLoading, isAuthReady } from '../../lib/stores/user.js'; 
    import { 
      game, 
      getWorldInfo,
      getWorldCenterCoordinates,
      setCurrentWorld,
      needsSpawn,
      currentPlayer,
      refreshWorldInfo,
      currentWorldKey
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
        setHighlighted,
        highlightedStore,
        coordinates,
        handleKeyboardEvent,
        updateModalState,
        initializeMapForWorld
    } from "../../lib/stores/map.js";
    
    import { getFunctions, httpsCallable } from 'firebase/functions'; 
    
    import Tutorial from '../../components/map/Tutorial.svelte';
    import Grid from '../../components/map/Grid.svelte';
    import Minimap from '../../components/map/Minimap.svelte';
    import Axes from '../../components/map/Axes.svelte';
    import Legend from '../../components/map/Legend.svelte';
    import Details from '../../components/map/Details.svelte';
    import SpawnMenu from '../../components/map/SpawnMenu.svelte';
    import Overview from '../../components/map/Overview.svelte';
    import Close from '../../components/icons/Close.svelte';
    import Mobilise from '../../components/map/Mobilise.svelte';
    import Move from '../../components/map/Move.svelte';
    import AttackGroups from '../../components/map/AttackGroups.svelte';
    import JoinBattle from '../../components/map/JoinBattle.svelte';
    import Demobilise from '../../components/map/Demobilise.svelte';
    import StructureOverview from '../../components/map/StructureOverview.svelte';
    import Gather from '../../components/map/Gather.svelte';

    const DEBUG_MODE = true;
    const debugLog = (...args) => DEBUG_MODE && console.log(...args);

    const DEBUG_LOADING = true;

    let isTutorialVisible = $state(false);
    let detailed = $state(false);
    let loading = $state(true);
    let error = $state(null);
    
    let urlCoordinates = $state(null);
    let urlProcessingComplete = $state(false);
    
    let initAttempted = $state(false);
    
    let isPathDrawingMode = $state(false);
    
    let authReadyState = $state(false);
    let gameInitializedState = $state(false);
    let mapReadyState = $state(false);

    const combinedLoading = $derived(loading || $game.worldLoading || !$isAuthReady);
    
    const isDragging = $derived($map.isDragging);
    
    let isProcessingClick = false;

    let isTransitioningToPathDrawing = $state(false);

    let structureRenderCount = $state(0);

    let processedCoordinates = $state(new Set());
    let coordinateProcessingDebounce = null;
    const COORDINATE_DEBOUNCE_TIME = 300;

    let showAttack = $state(false);
    let showJoinBattle = $state(false);
    let showMobilize = $state(false);
    let showMove = $state(false);
    let showDemobilize = $state(false);
    let showGather = $state(false);
    let isReady = $state(true);

    let mobilizeData = $state(null);
    let moveData = $state(null);
    let attackData = $state(null);
    let joinBattleData = $state(null);
    let demobilizeData = $state(null);
    let gatherData = $state(null);
    let selectedStructure = $state(null);
    let structureLocation = $state({ x: 0, y: 0 });
    let selectedTile = $state(null);
    let pathDrawingGroup = $state(null);
    let currentPath = $state([]);

    let modalState = $state({
        type: null,
        data: null,
        visible: false
    });

    const isAnyModalOpen = $derived(
        modalState.visible || 
        $needsSpawn || 
        detailed || 
        isTutorialVisible
    );

    function showModal(options) {
        if (!options) return;
        
        console.log('Opening modal:', options.type, options.data);
        
        if (['inspect', 'mobilise', 'move', 'gather', 'demobilise', 'joinBattle', 'attack'].includes(options.type)) {
            if (detailed) {
                toggleDetailsModal(false);
            }
        }
        
        modalState = {
            type: options.type,
            data: options.data,
            visible: true
        };
    }

    function closeModal() {
        modalState.visible = false;
        
        setTimeout(() => {
            modalState.type = null;
            modalState.data = null;
        }, 300);
    }

    function toggleDetailsModal(show) {
        detailed = show === undefined ? !detailed : show;
    }
    
    let ignoreNextUrlChange = $state(false);
    let lastProcessedLocation = $state(null);
    
    let coordinateProcessingState = $state({
        processing: false,
        processed: new Set(),
        lastProcessedTime: 0
    });

    function parseUrlCoordinates() {
        if (!browser || !page) return null;
        
        const url = get(page).url;
        const x = url.searchParams.get('x');
        const y = url.searchParams.get('y');
        
        if (x !== null && y !== null) {
            const parsedX = parseInt(x, 10);
            const parsedY = parseInt(y, 10);
            
            if (!isNaN(parsedX) && !isNaN(parsedY)) {
                const coordKey = `${parsedX},${parsedY}`;
                
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
    
    if (browser) {
        window.addEventListener('popstate', () => {
            if (isInternalUrlChange()) {
                ignoreNextUrlChange = true;
                return;
            }
            
            urlProcessingComplete = false;
        });
    }
    
    $effect(() => {
        if (coordinateProcessingState.processing || !browser || !page) return;
        
        if (coordinateProcessingDebounce) {
            clearTimeout(coordinateProcessingDebounce);
        }
        
        coordinateProcessingDebounce = setTimeout(() => {
            const url = get(page).url;
            const newCoords = parseUrlCoordinates();
            
            if (newCoords && !isInternalUrlChange()) {
                debugLog(`Found URL coordinates: ${newCoords.x},${newCoords.y}`);
                
                coordinateProcessingState.processing = true;
                
                if ($ready) {
                    console.log(`Applying URL coordinates: ${newCoords.x},${newCoords.y}`);
                    moveTarget(newCoords.x, newCoords.y);
                    
                    coordinateProcessingState.processed.add(newCoords.key);
                    coordinateProcessingState.lastProcessedTime = Date.now();
                    urlProcessingComplete = true;
                } else {
                    urlCoordinates = { x: newCoords.x, y: newCoords.y };
                }
                
                setTimeout(() => {
                    coordinateProcessingState.processing = false;
                }, 100);
            }
            coordinateProcessingDebounce = null;
        }, COORDINATE_DEBOUNCE_TIME);
    });
    
    let initialized = $state(false);
    let initializationRetries = $state(0);
    const MAX_INIT_RETRIES = 3;

    let retryDelays = $state([1000, 1500, 2000, 3000, 5000]);

    let lastRefreshTime = $state(0);
    
    $effect(() => {
        if ($game.worldKey && $game.world[$game.worldKey]) {
            const worldData = $game.world[$game.worldKey];
            console.log(`World data for ${$game.worldKey}:`, {
                hasSeed: worldData.seed !== undefined,
                seedType: typeof worldData.seed,
                seedValue: worldData.seed,
                hasCenter: !!worldData.center,
            });
        }
    });

    async function ensureWorldDataLoaded(worldId) {
        if (!worldId) return false;
        
        if ($game.world[worldId]?.seed !== undefined) {
            debugLog(`World data already available for ${worldId}`);
            return true;
        }
        
        debugLog(`World data not available for ${worldId}, actively loading it...`);
        try {
            loading = true;
            const worldData = await getWorldInfo(worldId);
            if (worldData?.seed !== undefined) {
                debugLog(`Successfully loaded world data for ${worldId}, seed: ${worldData.seed}`);
                return true;
            } else {
                console.error(`Failed to load required world data for ${worldId}`);
                error = "Failed to load world data - seed missing";
                return false;
            }
        } catch (err) {
            console.error(`Error loading world data for ${worldId}:`, err);
            error = `Error loading world: ${err.message || err}`;
            return false;
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        if (initialized || !browser) return;
        
        debugLog("Map initialization starting, checking dependencies...");
        
        document.body.classList.add('map-page-active');
        
        if (!$isAuthReady || !$game.initialized) {
            debugLog("Auth or game store not ready yet, waiting...");
            return;
        }
        
        debugLog("Auth and game store are ready, proceeding with map initialization");
        
        const url = get(page).url;
        const worldIdFromUrl = url.searchParams.get('world');
        const currentWorldId = $game.worldKey || $game.currentWorld;
        
        let worldToUse;
        
        if (worldIdFromUrl) {
            worldToUse = worldIdFromUrl;
            debugLog(`Using world ID from URL: ${worldToUse}`);
            
            if (worldToUse !== currentWorldId) {
                debugLog(`Setting current world from URL: ${worldToUse} (was: ${currentWorldId})`);
                setCurrentWorld(worldToUse);
            }
        } else if (currentWorldId) {
            worldToUse = currentWorldId;
            debugLog(`Using current world from store: ${worldToUse}`);
        } else {
            console.error('No world ID available from URL or game store');
            goto('/worlds');
            return;
        }
        
        // Mark as initialized early to prevent multiple initialization attempts
        initialized = true;
        
        ensureWorldDataLoaded(worldToUse).then(success => {
            if (success) {
                debugLog("World data loaded successfully, proceeding with map initialization");
                checkAndInitializeMap();
            } else {
                console.error("Failed to load world data, cannot initialize map");
                error = "Failed to load world data";
                loading = false;
            }
        });
        
        const coords = parseUrlCoordinates();
        if (coords) {
            urlCoordinates = { x: coords.x, y: coords.y };
        }

        window.addEventListener('beforeunload', cleanup);
        
        return () => {
            if (browser) {
                document.body.classList.remove('map-page-active');
                cleanup();
                window.removeEventListener('beforeunload', cleanup);
            }
        };
    });

    function checkAndInitializeMap() {
        if (!browser || !$game.worldKey || !$user) {
            console.error('Cannot initialize map yet: missing browser context, worldId or user');
            return;
        }
        
        const worldData = $game.world[$game.worldKey];
        
        debugLog(`Initializing map for world: ${$game.worldKey}, seed available: ${worldData?.seed !== undefined}`);
        
        if (initializationRetries >= MAX_INIT_RETRIES) {
            console.error(`Failed to initialize map after ${MAX_INIT_RETRIES} attempts`);
            loading = false;
            error = `Failed to initialize map after ${MAX_INIT_RETRIES} attempts`;
            return;
        }
        
        initializationRetries++;
        
        if ($ready && $map.world === $game.worldKey) {
            console.log('Map already initialized with correct world');
            loading = false;
            return;
        }
        
        if (!worldData || worldData.seed === undefined) {
            console.error(`Required world data missing for ${$game.worldKey}, can't initialize map`);
            error = "Missing required world data (seed)";
            loading = false;
            return;
        }
        
        try {
            if (typeof worldData.seed !== 'number' && typeof worldData.seed !== 'string') {
                console.error(`Invalid seed type for world ${$game.worldKey}:`, typeof worldData.seed);
                error = `Invalid seed data: ${typeof worldData.seed}`;
                loading = false;
                return;
            }
            
            debugLog('Initializing map with world data:', {
                worldId: $game.worldKey,
                seed: worldData.seed,
                seedType: typeof worldData.seed,
                hasCenter: !!worldData.center
            });
            
            const initialX = parseInt($page.url.searchParams.get('x')) || undefined;
            const initialY = parseInt($page.url.searchParams.get('y')) || undefined;
            
            if (initialX !== undefined && initialY !== undefined) {
                debugLog(`Initializing map with URL position: ${initialX},${initialY}`);
                initialize({
                    seed: worldData.seed,
                    worldId: $game.worldKey, // Make sure to use worldId instead of world property
                    initialX,
                    initialY
                });
            } else {
                debugLog(`Initializing map with world data`);
                initializeMapForWorld($game.worldKey, worldData);
            }
            
            loading = false;
        } catch (err) {
            console.error('Error initializing map:', err);
            loading = false;
            error = `Error initializing map: ${err.message}`;
        }
    }

    $effect(() => {
        if (!$ready || urlProcessingComplete) return;
        
        if (urlCoordinates) {
            debugLog(`Applying URL coordinates: ${urlCoordinates.x},${urlCoordinates.y}`);
            moveTarget(urlCoordinates.x, urlCoordinates.y);
            urlProcessingComplete = true;
            lastProcessedLocation = { ...urlCoordinates };
        } else if ($game.playerData?.lastLocation && !$needsSpawn) {
            const location = $game.playerData.lastLocation;
            moveTarget(location.x, location.y);
            urlProcessingComplete = true;
            lastProcessedLocation = { ...location };
        } else if ($game.worldKey) {
            const worldCenter = getWorldCenterCoordinates($game.worldKey);
            moveTarget(worldCenter.x, worldCenter.y);
            urlProcessingComplete = true;
            lastProcessedLocation = { ...worldCenter };
        }
    });
    
    $effect(() => {
        authReadyState = $isAuthReady;
        gameInitializedState = $game.initialized;
        mapReadyState = $ready;

        if (DEBUG_LOADING) {
            console.log('Loading state dependencies:', {
                userAuthReady: $isAuthReady,
                gameInitialized: $game.initialized,
                gameWorldLoading: $game.worldLoading,
                mapReady: $ready,
                componentLoading: loading,
                currentWorld: $game.currentWorld,
                worldDataAvailable: $game.currentWorld ? !!$game.world[$game.currentWorld] : false
            });
        }
    });

    // Enhanced keyboard event handler for the page 
    function handleMapKeyDown(event) {
      if (event.key !== 'Escape') return;
      
      // Update the global modal hierarchy state
      const componentState = {
        structureOverview: modalState.type === 'inspect' && modalState.visible,
        details: detailed,
        pathDrawing: isPathDrawingMode,
        anyOtherModal: modalState.visible && modalState.type !== 'inspect',
        minimap: showMinimap && !minimapClosing,
        overview: showEntities && !entitiesClosing
      };
      
      // Process the keyboard event based on component hierarchy
      const actionTarget = handleKeyboardEvent(event, componentState);
      
      // Handle closing components in order of priority
      if (actionTarget === 'minimap') {
        toggleMinimap();
        event.preventDefault();
        event.stopPropagation();
      } else if (actionTarget === 'overview') {
        toggleEntities();
        event.preventDefault();
        event.stopPropagation();
      }
    }

    // Missing variables that handleMapKeyDown references
    let showMinimap = $state(true);
    let showEntities = $state(true);
    let minimapClosing = $state(false);
    let entitiesClosing = $state(false);
    const ANIMATION_DURATION = 800;
    
    function toggleMinimap() {
      if ($needsSpawn || isTutorialVisible) {
        return;
      }
      
      if (showMinimap) {
        minimapClosing = true;
        setTimeout(() => {
          showMinimap = false;
          minimapClosing = false;
          if (browser) {
            localStorage.setItem('minimap', 'false');
          }
        }, ANIMATION_DURATION);
      } else {
        showMinimap = true;
        if (browser) {
          localStorage.setItem('minimap', 'true');
        }
      }
    }

    function toggleEntities() {
      if ($needsSpawn || isTutorialVisible) {
        return;
      }
      
      if (showEntities) {
        entitiesClosing = true;
        setTimeout(() => {
          showEntities = false;
          entitiesClosing = false;
          if (browser) {
            localStorage.setItem('overview', 'false');
          }
        }, ANIMATION_DURATION);
      } else {
        showEntities = true;
        if (browser) {
          localStorage.setItem('overview', 'true');
        }
      }
    }

    function handleTutorialToggle() {
      console.log('Tutorial visibility toggled');
    }
    
    function toggleTutorial() {
      // Dispatch the custom event to toggle tutorial
      window.dispatchEvent(new CustomEvent('tutorial:toggle'));
    }

    // Add missing function for grid clicking
    function handleGridClick(coords) {
        // Check if this is a path confirmation action
        if (coords && coords.confirmPath === true) {
            confirmPathDrawing(currentPath);
            return;
        }

        // Simple debounce
        if (isProcessingClick) return;
        isProcessingClick = true;

        // If we're in path drawing mode and have coordinates, add them to the path
        if (isPathDrawingMode && coords && coords.x !== undefined && coords.y !== undefined) {
            // Add the point to the path
            handlePathPoint(coords);
            
            // Reset debounce flag with short timeout for responsiveness in drawing mode
            setTimeout(() => {
                isProcessingClick = false;
            }, 100);
            return;
        }

        // Regular grid click handling (not in path drawing mode)
        if (coords) {
            // First move the target to the clicked location
            moveTarget(coords.x, coords.y);

            // Get the tile data after moving
            const clickedTile = $coordinates.find(c => c.x === coords.x && c.y === coords.y);
            
            // Only highlight and open details if there's meaningful content and not in path drawing mode
            if (clickedTile && hasTileContent(clickedTile) && !isPathDrawingMode) {
                setHighlighted(coords.x, coords.y);
                toggleDetailsModal(true);
            } else if (!isPathDrawingMode) {
                // If there's no content and not in path drawing mode, just ensure nothing is highlighted
                setHighlighted(null, null);
                toggleDetailsModal(false);
            }
        }

        // Reset debounce flag
        setTimeout(() => {
            isProcessingClick = false;
        }, 300);
    }

    // Function to check if a tile has meaningful content
    function hasTileContent(tile) {
        if (!tile) return false;
        
        return (
            // Check for any meaningful content on the tile
            (tile.structure && Object.keys(tile.structure).length > 0) ||
            (tile.groups && tile.groups.length > 0) ||
            (tile.players && tile.players.length > 0) ||
            (tile.items && tile.items.length > 0) ||
            (tile.battles && tile.battles.length > 0)
        );
    }

    // Add function for handling path points
    function handlePathPoint(point) {
        if (!isPathDrawingMode) return;
        
        // Validate that point has valid coordinates
        if (!point || point.x === undefined || point.y === undefined) {
            console.error('Invalid point in handlePathPoint:', point);
            return;
        }
        
        console.log('Adding path point:', point);
        
        if (currentPath.length > 0) {
            // Get the last point in the path
            const lastPoint = currentPath[currentPath.length - 1];
            
            // Check if this is a duplicate point (avoid adding same point twice)
            if (lastPoint.x === point.x && lastPoint.y === point.y) {
                return;
            }
            
            // Calculate all intermediate steps between the last point and new point
            const intermediatePoints = calculatePathBetweenPoints(
                lastPoint.x, 
                lastPoint.y, 
                point.x, 
                point.y
            );
            
            // Add all intermediate points (except the first which would duplicate the last point)
            if (intermediatePoints.length > 1) {
                // Skip the first point as it duplicates the last point in currentPath
                const pathAddition = intermediatePoints.slice(1);
                currentPath = [...currentPath, ...pathAddition];
                console.log(`Path extended with ${pathAddition.length} interpolated points`);
            }
        } else {
            // First point in the path
            currentPath = [{ x: point.x, y: point.y }];
        }
    }

    // Function for path drawing mode
    function handlePathDrawingStart(group) {
        if (!group) return;
        
        console.log('Starting path drawing for group:', group.id || group.groupId);
        
        // Close any open modals or details that might interfere
        toggleDetailsModal(false);
        setHighlighted(null, null);
        
        // Set flag to prevent details panel from opening
        isTransitioningToPathDrawing = true;
        
        // Store the group information for later use
        pathDrawingGroup = {
            id: group.id || group.groupId,
            name: group.name,
            unitCount: group.unitCount,
            status: group.status
        };
        
        // Set path drawing mode ON
        isPathDrawingMode = true;
        
        // Initialize with starting point if available, with proper coordinate validation
        if (group.startPoint && group.startPoint.x !== undefined && group.startPoint.y !== undefined) {
            currentPath = [{ x: group.startPoint.x, y: group.startPoint.y }];
        } else if (group.x !== undefined && group.y !== undefined) {
            currentPath = [{ x: group.x, y: group.y }];
        } else {
            // Default to current target if no starting point is provided, with validation
            const target = $map.target;
            if (target && target.x !== undefined && target.y !== undefined) {
                currentPath = [{ x: target.x, y: target.y }];
            } else {
                currentPath = [];
                console.warn('No valid starting coordinates for path drawing');
            }
        }
        
        // Log the initial path point for debugging
        if (currentPath.length > 0) {
            console.log('Initial path point:', currentPath[0]);
        }
        
        // Reset the transition flag after a delay to allow state to settle
        setTimeout(() => {
            isTransitioningToPathDrawing = false;
        }, 500);
    }

    // Function to handle path drawing cancellation
    function handlePathDrawingCancel() {
        isPathDrawingMode = false;
        pathDrawingGroup = null;
        currentPath = [];
    }
    
    // Function to confirm a drawn path
    function confirmPathDrawing(path) {
        if (!path || path.length < 2 || !pathDrawingGroup) {
            console.error('Cannot confirm path: Invalid path or missing group');
            return;
        }
        
        console.log('Confirming path for group:', pathDrawingGroup.id);
        
        // Execute the move with the path
        const functions = getFunctions();
        const moveGroupFn = httpsCallable(functions, 'moveGroup');
        
        const startPoint = path[0];
        const endPoint = path[path.length - 1];
        
        moveGroupFn({
            groupId: pathDrawingGroup.id,
            fromX: startPoint.x,
            fromY: startPoint.y,
            toX: endPoint.x,
            toY: endPoint.y,
            path: path,
            worldId: $game.worldKey
        })
        .then((result) => {
            console.log('Path movement started:', result.data);
            // Reset path drawing mode
            isPathDrawingMode = false;
            pathDrawingGroup = null;
            currentPath = [];
        })
        .catch((error) => {
            console.error('Error starting path movement:', error);
            alert(`Error: ${error.message || 'Failed to start movement'}`);
        });
    }
    
    // Function to handle spawn completion from SpawnMenu
    function handleSpawnComplete(spawnLocation) {
        if (spawnLocation) {
            console.log('Spawn complete at:', spawnLocation);
            
            // Since the SpawnMenu already moved the map to this location,
            // we just need to ensure states are updated properly
            moveTarget(spawnLocation.x, spawnLocation.y);
            
            // Mark URL coords as processed
            urlProcessingComplete = true;
            lastProcessedLocation = { ...spawnLocation };
            
            // Ensure highlighted coordinates are cleared
            setHighlighted(null, null);
            
            // Force an instantiation of state variables (helps with Svelte 5 reactivity)
            structureRenderCount++;
        }
    }
    
    // Add missing function for tutorial visibility
    $effect(() => {
        // If spawn menu appears, ensure tutorial is hidden
        if ($needsSpawn && isTutorialVisible) {
            isTutorialVisible = false;
        }
    });

    function handleTutorialVisibility(isVisible) {
        // Don't show tutorial if spawn menu is active
        if ($needsSpawn && isVisible) {
            return;
        }
        
        isTutorialVisible = isVisible;
        
        if (isTutorialVisible && (showMinimap || showEntities)) {
            showMinimap = false;
            showEntities = false;
        }
    }
    
    // Add the missing function for calculating path between points
    function calculatePathBetweenPoints(startX, startY, endX, endY) {
        const path = [];
        
        // Calculate steps using Bresenham's line algorithm
        const dx = Math.abs(endX - startX);
        const dy = Math.abs(endY - startY);
        const sx = startX < endX ? 1 : -1;
        const sy = startY < endY ? 1 : -1;
        
        let err = dx - dy;
        let x = startX;
        let y = startY;
        
        // Add start point
        path.push({ x, y });
        
        // Generate steps
        while (!(x === endX && y === endY)) {
            const e2 = 2 * err;
            
            if (e2 > -dy) {
                err -= dy;
                x += sx;
            }
            
            if (e2 < dx) {
                err += dx;
                y += sy;
            }
            
            // Add intermediate point
            path.push({ x, y });
            
            // Safety check
            if (path.length > 1000) {
                console.warn('Path too long, truncating');
                break;
            }
        }
        
        return path;
    }
</script>

<svelte:window on:keydown={handleMapKeyDown} />

<div class="map" class:dragging={isDragging} class:path-drawing={isPathDrawingMode}>
    {#if combinedLoading}
        <div class="loading-overlay">
            <div class="loading-spinner"></div>
            <div>
                {#if !$isAuthReady}
                    Loading user data...
                {:else if !$game.initialized}
                    Initializing game data...
                {:else if $game.worldLoading}
                    Loading world data...
                {:else if !$ready}
                    Initializing map...
                {:else}
                    Initializing world...
                {/if}
            </div>
            {#if DEBUG_LOADING && combinedLoading}
                <div class="debug-info">
                    <p>Auth Ready: {authReadyState ? 'Yes' : 'No'}</p>
                    <p>Game Initialized: {gameInitializedState ? 'Yes' : 'No'}</p>
                    <p>World Loading: {$game.worldLoading ? 'Yes' : 'No'}</p>
                    <p>Map Ready: {mapReadyState ? 'Yes' : 'No'}</p>
                    <p>Component Loading: {loading ? 'Yes' : 'No'}</p>
                    <p>World Key: {$game.worldKey || 'None'}</p>
                    <p>Has World Data: {$game.worldKey && $game.world[$game.worldKey]?.seed !== undefined ? 'Yes' : 'No'}</p>
                    <p>Initialize Attempted: {initializationRetries} time(s)</p>
                </div>
            {/if}
        </div>
    {:else if error || $game.error}
        <div class="error-overlay">
            <h3>Error</h3>
            <p>{error || $game.error}</p>
            <button onclick={() => goto('/worlds')}>Go to Worlds</button>
        </div>
    {:else}
        <Grid 
            detailed={detailed}
            onClick={handleGridClick}
            isPathDrawingMode={isPathDrawingMode}
            onAddPathPoint={handlePathPoint}
            customPathPoints={currentPath}
            modalOpen={isAnyModalOpen}
            onClose={() => {
                if (isPathDrawingMode) {
                    handlePathDrawingCancel();
                } else {
                }
            }}
        />
        
        <div class="map-controls">
            <button 
                class="control-button help-button" 
                onclick={toggleTutorial}
                aria-label="Show tutorial"
                disabled={$needsSpawn}>
                ?
            </button>
            <button 
                class="control-button minimap-button" 
                onclick={toggleMinimap}
                aria-label={showMinimap ? "Hide minimap" : "Show minimap"}
                disabled={$needsSpawn || isTutorialVisible}>
                {#if showMinimap || minimapClosing}
                    <Close size="1.2em" extraClass="close-icon-dark" />
                {:else}
                    <span class="button-text">MINIMAP</span>
                {/if}
            </button>
        </div>
        
        {#if !(showEntities || entitiesClosing)}
            <div class="entity-controls">
                <button 
                    class="control-button entity-button" 
                    onclick={toggleEntities}
                    aria-label="Show entities"
                    disabled={$needsSpawn || isTutorialVisible}>
                    <span class="button-text">OVERVIEW</span>
                </button>
            </div>
        {/if}
        
        {#if showMinimap || minimapClosing}
            <Minimap closing={minimapClosing} />
        {/if}
        
        {#if showEntities || entitiesClosing}
            <Overview 
              closing={entitiesClosing} 
              onShowStructure={({ structure, x, y }) => {
                modalState = {
                  type: 'inspect',
                  data: {
                    x,
                    y,
                    tile: {
                      x,
                      y,
                      structure,
                    }
                  },
                  visible: true
                };
                if (window.innerWidth < 768) {
                  toggleEntities();
                }
              }}
              onClose={() => toggleEntities()}
            />
        {/if}

        {#if detailed}
            <Details 
                onClose={() => toggleDetailsModal(false)} 
                onShowModal={showModal} 
            />
        {:else if $ready}
            <Legend 
                x={$targetStore.x}  
                y={$targetStore.y}  
                openDetails={() => {
                    setHighlighted($targetStore.x, $targetStore.y);
                    toggleDetailsModal(true);
                }} 
            />
        {/if}

        {#if $ready}
            <Axes />
        {/if}

        {#if $ready && !$needsSpawn}
            <Tutorial 
                onVisibilityChange={handleTutorialVisibility}
                hideToggleButton={true}
                onToggle={handleTutorialToggle}
            />
        {/if}
        
        {#if $needsSpawn && $user}
            <SpawnMenu onSpawn={handleSpawnComplete} />
        {/if}

        {#if modalState.visible}
          {#if modalState.type === 'inspect' && modalState.data}
            <StructureOverview 
              x={modalState.data.x}
              y={modalState.data.y}
              tile={modalState.data.tile}
              onClose={closeModal}
              key={structureRenderCount}
            />
          {:else if modalState.type === 'mobilise'}
            <Mobilise
              onClose={closeModal}
            />
          {:else if modalState.type === 'move'}
            <Move
              onClose={(complete = true, startingPathDraw = false) => {
                closeModal();
              }}
              onPathDrawingStart={handlePathDrawingStart}
              onPathDrawingCancel={handlePathDrawingCancel}
              onConfirmPath={confirmPathDrawing}
              {pathDrawingGroup}
              {currentPath}
            />
          {:else if modalState.type === 'attack'}
            <AttackGroups
              onClose={closeModal}
              onAttack={(data) => {
                console.log('Attack started:', data);
                closeModal();
              }}
            />
          {:else if modalState.type === 'joinBattle'}
            <JoinBattle
              onClose={closeModal}
              onJoinBattle={(data) => {
                console.log('Joined battle:', data);
                closeModal();
              }}
            />
          {:else if modalState.type === 'gather'}
            <Gather 
              onClose={() => closeModal()} 
              onGather={(result) => {
                closeModal();
              }}
              data={modalState.data}
            />
          {:else if modalState.type === 'demobilise'}
            <Demobilise
              onClose={closeModal}
              onDemobilize={(data) => {
                console.log('Demobilization started:', data);
                closeModal();
              }}
            />
          {/if}
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
    
    .map.path-drawing {
        cursor: crosshair !important;
        box-shadow: inset 0 0 0 4px rgba(255, 255, 0, 0.5);
    }
    
    :global(body.map-page-active) {
        overflow: hidden;
        overscroll-behavior: none;
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
    
    .entity-controls {
        position: absolute;
        bottom: 1em;
        left: 1em;
        z-index: 1001;
    }
    
    .control-button {
        height: 2em;
        background-color: rgba(255, 255, 255, 0.85);
        border: 0.05em solid rgba(255, 255, 255, 0.2);
        border-radius: 0.3em;
        color: rgba(0, 0, 0, 0.8);
        padding: 0.3em 0.8em;
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
    
    .control-button:hover:not(:disabled) {
        background-color: rgba(255, 255, 255, 0.95);
        border-color: rgba(255, 255, 255, 0.5);
    }
    
    .control-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
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

    .debug-info {
        margin-top: 1rem;
        font-size: 0.8rem;
        opacity: 0.7;
        text-align: left;
        background: rgba(0, 0, 0, 0.5);
        padding: 0.5rem;
        border-radius: 0.25rem;
    }
    
    .debug-info p {
        margin: 0.2rem 0;
    }
</style>