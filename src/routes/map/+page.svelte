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
      needsSpawn,
      currentPlayer
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
        updateModalState 
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
    import Mobilize from '../../components/map/Mobilize.svelte';
    import Move from '../../components/map/Move.svelte';
    import AttackGroups from '../../components/map/AttackGroups.svelte';
    import JoinBattle from '../../components/map/JoinBattle.svelte';
    import Demobilize from '../../components/map/Demobilize.svelte';
    import StructureOverview from '../../components/map/StructureOverview.svelte';
    import Gather from '../../components/map/Gather.svelte';

    let isTutorialVisible = $state(false);

    let detailed = $state(false);
    let loading = $state(true);
    let error = $state(null);
    
    let urlCoordinates = $state(null);
    let urlProcessingComplete = $state(false);
    
    let initAttempted = $state(false);
    
    const combinedLoading = $derived(loading || $game.worldLoading || !$isAuthReady);
    
    const isDragging = $derived($map.isDragging);
    
    // Add a flag to prevent multiple click handling and debounce
    let isProcessingClick = false;

    // Add flag to track path drawing transition
    let isTransitioningToPathDrawing = $state(false);

    // Add a counter to ensure proper re-rendering
    let structureRenderCount = $state(0);

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
    
    // Modal visibility state variables - consolidated to avoid redeclarations
    let showAttack = $state(false);
    let showJoinBattle = $state(false);
    let showMobilize = $state(false);
    let showMove = $state(false);
    let showDemobilize = $state(false);
    let showGather = $state(false);
    let isPathDrawingMode = $state(false);
    let isReady = $state(true); // Add missing isReady state

    // Modal data state
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

    // Modal management state - single source of truth
    let modalState = $state({
        type: null,
        data: null,
        visible: false
    });

    // Add a derived value to check if any modal is open
    const isAnyModalOpen = $derived(
        modalState.visible || 
        $needsSpawn || 
        detailed || 
        isTutorialVisible
    );

    // Function to show modal content
    function showModal(options) {
        if (!options) return;
        
        console.log('Opening modal:', options.type, options.data);
        
        // Close Details modal when opening structure overview or action modals
        if (['inspect', 'mobilize', 'move', 'gather', 'demobilize', 'joinBattle'].includes(options.type)) {
            // Close details if it's open
            if (detailed) {
                toggleDetailsModal(false);
            }
        }
        
        if (options.type === 'inspect' && options.data) {
            // Increment render count for proper animation
            structureRenderCount++;
            
            // Update modal state for structure inspection
            modalState = {
                type: 'inspect',
                data: options.data,
                visible: true
            };

            // Store structure data in state variables
            selectedStructure = options.data.tile?.structure || null;
            structureLocation = { 
                x: options.data.x || 0, 
                y: options.data.y || 0
            };
            selectedTile = options.data.tile || null;
        } else if (options.type) {
            // Handle other modal types
            modalState = {
                type: options.type,
                data: options.data,
                visible: true
            };
        }
    }

    // Function to close modal
    function closeModal() {
        // Reset modal state
        modalState.visible = false;
        
        // Reset modal data after animation completes
        setTimeout(() => {
            modalState.type = null;
            modalState.data = null;
        }, 300);
    }

    function parseUrlCoordinates() {
        if (!browser || !$page.url) return null;
        
        const x = $page.url.searchParams.get('x');
        const y = $page.url.searchParams.get('y');
        
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
        if (coordinateProcessingState.processing || !browser || !$page.url) return;
        
        const newCoords = parseUrlCoordinates();
        
        if (newCoords && !isInternalUrlChange()) {
            console.log(`Found URL coordinates: ${newCoords.x},${newCoords.y}`);
            
            coordinateProcessingState.processing = true;
            
            if ($ready) {
                console.log(`Applying URL coordinates: ${newCoords.x},${newCoords.y}`);
                moveTarget(newCoords.x, newCoords.y);
                
                coordinateProcessingState.processed.add(newCoords.key);
                coordinateProcessingState.lastProcessedTime = Date.now();
            } else {
                urlCoordinates = { x: newCoords.x, y: newCoords.y };
            }
            
            setTimeout(() => {
                coordinateProcessingState.processing = false;
            }, 100);
        }
    });
    
    $effect(() => {
        if (!$ready || !urlCoordinates || coordinateProcessingState.processing) return;
        
        const coordKey = `${urlCoordinates.x},${urlCoordinates.y}`;
        
        if (coordinateProcessingState.processed.has(coordKey)) {
            urlCoordinates = null;
            return;
        }
        
        coordinateProcessingState.processing = true;
        
        console.log(`Applying URL coordinates after map ready: ${urlCoordinates.x},${urlCoordinates.y}`);
        moveTarget(urlCoordinates.x, urlCoordinates.y);
        
        coordinateProcessingState.processed.add(coordKey);
        coordinateProcessingState.lastProcessedTime = Date.now();
        urlCoordinates = null;
        
        setTimeout(() => {
            coordinateProcessingState.processing = false;
        }, 100);
    });
    
    $effect(() => {
        if (!$ready || urlProcessingComplete) return;
        
        if (urlCoordinates) {
            console.log(`Applying URL coordinates: ${urlCoordinates.x},${urlCoordinates.y}`);
            moveTarget(urlCoordinates.x, urlCoordinates.y);
            urlProcessingComplete = true;
            lastProcessedLocation = { ...urlCoordinates };
        } else if ($game.playerWorldData?.lastLocation && !$needsSpawn) {
            const location = $game.playerWorldData.lastLocation;
            moveTarget(location.x, location.y);
            urlProcessingComplete = true;
            lastProcessedLocation = { ...location };
        } else if ($game.currentWorld) {
            const worldCenter = getWorldCenterCoordinates($game.currentWorld);
            moveTarget(worldCenter.x, worldCenter.y);
            urlProcessingComplete = true;
            lastProcessedLocation = { ...worldCenter };
        }
    });

    $effect(() => {
        if (!$ready || !$game.playerWorldData?.lastLocation) return;
        
        if (!urlProcessingComplete && $game.playerWorldData.alive === true) {
            const location = $game.playerWorldData.lastLocation;
            console.log('Centering map on player location:', location);
            moveTarget(location.x, location.y);
            urlProcessingComplete = true;
            lastProcessedLocation = { ...location };
        }
    });

    $effect(() => {
      console.log("Player data status:", {
        ready: $ready,
        currentWorld: $game.currentWorld,
        playerData: $game.playerWorldData,
        alive: $game.playerWorldData?.alive,
        lastLocation: $game.playerWorldData?.lastLocation
      });
    });

    $effect(() => {
      if ($ready && $game.currentWorld && $user?.uid && !$game.playerWorldData) {
        console.log("Requesting player data reload for", $user.uid, $game.currentWorld);
        const userId = $user.uid;
        const worldId = $game.currentWorld;
        
        import("../../lib/stores/game.js").then(module => {
          module.loadPlayerWorldData(userId, worldId);
        });
      }
    });

    function handleSpawnComplete(spawnLocation) {
        if (spawnLocation) {
            moveTarget(spawnLocation.x, spawnLocation.y);
        }
    }
    
    async function initializeMap(worldId) {
        if ($ready && $map.world === worldId) {
            console.log(`Map already initialized for world ${worldId}, skipping redundant initialization`);
            
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
            
            await setCurrentWorld(worldId);
            const worldInfo = await getWorldInfo(worldId);
            
            if (!worldInfo) {
                throw new Error(`World info not found for ${worldId}`);
            }
            if (worldInfo.seed === undefined) {
                throw new Error(`World ${worldId} has no seed defined`);
            }
            
            let initialCoords = null;
            
            const urlCoords = parseUrlCoordinates();
            if (urlCoords) {
                console.log(`Using URL coordinates: ${urlCoords.x},${urlCoords.y}`);
                initialCoords = urlCoords;
                urlProcessingComplete = true;
            } 
            else if ($game.playerWorldData?.lastLocation) {
                const location = $game.playerWorldData.lastLocation;
                console.log(`Using player's last location: ${location.x},${location.y}`);
                initialCoords = { x: location.x, y: location.y };
            } 
            else {
                const worldCenter = getWorldCenterCoordinates(worldId, worldInfo);
                console.log(`Using world center: ${worldCenter.x},${worldCenter.y}`);
                initialCoords = worldCenter;
            }
            
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
    
    $effect(() => {
      if (browser && !$userLoading && $user === null) {
        const worldId = $page.url.searchParams.get('world') || $game.currentWorld;
        const redirectPath = worldId ? `/map?world=${worldId}` : '/map';
        goto(`/login?redirect=${encodeURIComponent(redirectPath)}`);
      }
    });
    
    let currentWorldId = $state(null);
    
    $effect(() => {
        if (!browser) return;
        
        const worldFromUrl = $page.url.searchParams.get('world');
        const worldFromStore = $game?.currentWorld;
        
        currentWorldId = worldFromUrl || worldFromStore || null;
    });

    onMount(() => {
        if (!browser) return;
        
        document.body.classList.add('map-page-active');
        
        const worldId = $page.url.searchParams.get('world') || $game.currentWorld;
        const coords = parseUrlCoordinates();
        
        if (coords) {
            urlCoordinates = { x: coords.x, y: coords.y };
        }
        
        if (!worldId) {
            goto('/worlds');
            return;
        }
        
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
                
                const coordKey = `${urlCoordinates.x},${urlCoordinates.y}`;
                coordinateProcessingState.processed.add(coordKey);
                coordinateProcessingState.lastProcessedTime = Date.now();
            }
        } else {
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

    let showMinimap = $state(true);
    let showEntities = $state(true);
    let minimapClosing = $state(false);
    let entitiesClosing = $state(false);
    
    const ANIMATION_DURATION = 800;

    function toggleTutorial() {
        // Dispatch the custom event to toggle tutorial
        window.dispatchEvent(new CustomEvent('tutorial:toggle'));
    }
    
    // Function to handle tutorial state changes
    function handleTutorialVisibility(isVisible) {
        isTutorialVisible = isVisible;
        
        if (isTutorialVisible && (showMinimap || showEntities)) {
            showMinimap = false;
            showEntities = false;
        }
    }
    
    // Add the missing function that was referenced in the Tutorial component
    function handleTutorialToggle(isVisible) {
        console.log('Tutorial visibility toggled:', isVisible);
        // This function is called when the tutorial is opened or closed manually
        // You can add any additional logic needed when tutorial state changes
    }
    
    $effect(() => {
        if (browser) {
            if ($needsSpawn || isTutorialVisible) {
                showMinimap = false;
                showEntities = false;
            } else {
                const storedMinimapVisibility = localStorage.getItem('minimap');
                const defaultMinimapVisibility = window.innerWidth >= 768;
                
                showMinimap = storedMinimapVisibility === 'false' ? false : 
                              storedMinimapVisibility === 'true' ? true : 
                              defaultMinimapVisibility;
                
                const storedEntitiesVisibility = localStorage.getItem('overview');
                showEntities = storedEntitiesVisibility !== 'false';
            }
        }
    });
    
    $effect(() => {
        if ($needsSpawn && (showMinimap || showEntities)) {
            showMinimap = false;
            showEntities = false;
        }
    });
    
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

    // Improved function to check if a tile has meaningful content
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

    // Add the path calculation function that matches what's in Move.svelte and Grid.svelte
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

    function handlePathDrawingCancel() {
        isPathDrawingMode = false;
        pathDrawingGroup = null;
        currentPath = [];
    }

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
            worldId: $game.currentWorld
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
    
    // Update modal state when components change visibility
    $effect(() => {
        if (browser) {
            updateModalState({
                structureOverview: modalState.type === 'inspect' && modalState.visible,
                details: detailed,
                pathDrawing: isPathDrawingMode,
                anyOtherModal: modalState.visible && modalState.type !== 'inspect',
                minimap: showMinimap && !minimapClosing,
                overview: showEntities && !entitiesClosing
            });
        }
    });
</script>

<!-- Add global keyboard event handler -->
<svelte:window on:keydown={handleMapKeyDown} />

<div class="map" class:dragging={isDragging} class:path-drawing={isPathDrawingMode}>
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
                    // Handle regular close if needed
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
        {/if}

        {#if detailed && $highlightedStore}
            <Details 
                onClose={() => toggleDetailsModal(false)}
                onShowModal={showModal}
            />
        {:else}
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

        <Tutorial 
            onVisibilityChange={handleTutorialVisibility}
            hideToggleButton={true}
            onToggle={handleTutorialToggle}
        />
        
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
          {:else if modalState.type === 'mobilize'}
            <Mobilize
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
              onClose={closeModal}
              onGather={(data) => {
                console.log('Gathering started:', data);
                closeModal();
              }}
            />
          {:else if modalState.type === 'demobilize'}
            <Demobilize
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
        bottom: 1em; /* Changed from 2em to 1em to reduce the gap at the bottom */
        left: 1em;
        z-index: 1001;
    }
    
    .control-button {
        height: 2em;
        background-color: rgba(255, 255, 255, 0.85);
        border: 0.05em solid rgba(255, 255, 255, 0.2);
        border-radius: 0.3em;
        color: rgba(0, 0, 0, 0.8);
        padding: 0.3em 0.8em; /* Increased horizontal padding to fit text */
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

</style>