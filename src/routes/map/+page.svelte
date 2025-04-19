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
        coordinates 
    } from "../../lib/stores/map.js";
    
    import { getFunctions, httpsCallable } from 'firebase/functions'; 
    
    import Tutorial from '../../components/map/Tutorial.svelte';
    import Grid from '../../components/map/Grid.svelte';
    import Minimap from '../../components/map/Minimap.svelte';
    import Axes from '../../components/map/Axes.svelte';
    import Legend from '../../components/map/Legend.svelte';
    import Details from '../../components/map/Details.svelte';
    import SpawnMenu from '../../components/map/SpawnMenu.svelte';
    import MapEntities from '../../components/map/MapEntities.svelte';
    import Close from '../../components/icons/Close.svelte';
    import Mobilize from '../../components/map/Mobilize.svelte';
    import Move from '../../components/map/Move.svelte';
    import AttackGroups from '../../components/map/AttackGroups.svelte';
    import JoinBattle from '../../components/map/JoinBattle.svelte';
    import Demobilize from '../../components/map/Demobilize.svelte';
    import StructureOverview from '../../components/map/StructureOverview.svelte';
    import Gather from '../../components/map/Gather.svelte';

    let detailed = $state(false);
    let loading = $state(true);
    let error = $state(null);
    
    let urlCoordinates = $state(null);
    let urlProcessingComplete = $state(false);
    
    let initAttempted = $state(false);
    
    const combinedLoading = $derived(loading || $game.worldLoading || !$isAuthReady);
    
    const isDragging = $derived($map.isDragging);
    
    function toggleDetailsModal(show, displayTile = null) {
        if (show) {
            if (displayTile) {
                setHighlighted(displayTile.x, displayTile.y);
            }
            detailed = true;
        } else {
            detailed = false;
            setHighlighted(null, null);
        }
    }
    
    let ignoreNextUrlChange = $state(false);
    let lastProcessedLocation = $state(null);
    
    let coordinateProcessingState = $state({
        processing: false,
        processed: new Set(),
        lastProcessedTime: 0
    });
    
    let isPathDrawingMode = $state(false);
    let pathDrawingGroup = $state(null);
    let currentPath = $state([]);

    // Modal visibility state variables
    let showAttack = $state(false);
    let showJoinBattle = $state(false);
    let showMobilize = $state(false);
    let showMove = $state(false);
    let showDemobilize = $state(false);
    let showGather = $state(false);
    let showStructureOverview = $state(false);

    // Data for each modal
    let mobilizeData = $state(null);
    let moveData = $state(null);
    let attackData = $state(null);
    let joinBattleData = $state(null);
    let demobilizeData = $state(null);
    let gatherData = $state(null);
    let selectedStructure = $state(null);
    let structureLocation = $state({ x: 0, y: 0 });
    let selectedTile = $state(null);

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
    let isTutorialVisible = $state(false);
    
    const ANIMATION_DURATION = 800;
    
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
                
                const storedEntitiesVisibility = localStorage.getItem('mapEntities');
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
    
    function handleTutorialVisibility(isVisible) {
        isTutorialVisible = isVisible;
        
        if (isTutorialVisible && (showMinimap || showEntities)) {
            showMinimap = false;
            showEntities = false;
        }
    }
    
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

    function handleGridClick(coords) {
        const { x, y } = coords;
        
        if (x === undefined || y === undefined || detailed) {
            return;
        }

        if (isPathDrawingMode) {
            const point = { x, y };
            handlePathPoint(point);
        } else {
            console.log('Moving to clicked tile:', { x, y });
            
            moveTarget(x, y);
            
            setHighlighted(x, y);
            
            setTimeout(() => {
                // Fix accessing coordinates by using $coordinates properly - it's imported as a store
                const clickedTile = $coordinates.find(cell => cell.x === x && cell.y === y);
                
                if (clickedTile && hasTileContent(clickedTile)) {
                    toggleDetailsModal(true, clickedTile);
                }
            }, 50);
        }
    }

    function hasTileContent(tile) {
        if (!tile) return false;
        
        return (
            tile.structure || 
            (tile.groups && tile.groups.length > 0) || 
            (tile.players && tile.players.length > 0) || 
            (tile.items && tile.items.length > 0)
        );
    }

    function handlePathPoint(point) {
        if (!isPathDrawingMode) {
            console.log('Not in path drawing mode, ignoring point');
            return;
        }
        
        console.log('Page: Adding path point:', point);
        
        if (currentPath.length > 0) {
            const lastPoint = currentPath[currentPath.length - 1];
            
            if (lastPoint.x === point.x && lastPoint.y === point.y) {
                console.log('Point is duplicate of last point, skipping');
                return;
            }
            
            const dx = Math.abs(point.x - lastPoint.x);
            const dy = Math.abs(point.y - lastPoint.y);
            
            if (dx > 1 || dy > 1) {
                console.log('Calculating path to non-adjacent point');
                const intermediatePath = calculatePathBetweenPoints(
                    lastPoint.x, lastPoint.y, 
                    point.x, point.y
                );
                
                if (currentPath.length + intermediatePath.length > 20) {
                    console.log('Path exceeds 20 steps limit, truncating...');
                    
                    const pointsToAdd = 20 - currentPath.length;
                    if (pointsToAdd <= 0) {
                        console.log('Path already at maximum length');
                        return;
                    }
                    
                    currentPath = [
                        ...currentPath,
                        ...intermediatePath.slice(0, pointsToAdd)
                    ];
                } else {
                    currentPath = [...currentPath, ...intermediatePath];
                }
            } else {
                if (currentPath.length >= 20) {
                    console.log('Maximum path length reached (20 steps)');
                    return;
                }
                
                currentPath = [...currentPath, point];
            }
        } else {
            const newPath = [point];
            currentPath = newPath;
            console.log('Created new path with first point:', newPath);
        }
        
        // Important: Force reactivity update by creating a new array
        currentPath = [...currentPath];
        console.log('Current path updated:', currentPath);
    }

    function handlePathDrawingStart(group) {
        console.log('Starting path drawing for group:', group);
        isPathDrawingMode = true;
        
        // Make sure we store the proper group ID for later use
        pathDrawingGroup = {
            id: group.id || group.groupId,  // Handle both id formats
            groupId: group.id || group.groupId, // Store both for compatibility
            startPoint: group.startPoint || { x: group.x, y: group.y },
            x: group.x,
            y: group.y
        };
        
        // Log the created path drawing group for debugging
        console.log("Path drawing group data:", pathDrawingGroup);
        
        if (group && group.startPoint) {
            currentPath = [group.startPoint];
            console.log("Initialized path with starting point:", group.startPoint);
        } else if (group && group.x !== undefined && group.y !== undefined) {
            currentPath = [{ x: group.x, y: group.y }];
            console.log("Initialized path with group position:", { x: group.x, y: group.y });
        } else if ($targetStore) {
            currentPath = [{ x: $targetStore.x, y: $targetStore.y }];
            console.log("Initialized path with current target position:", { x: $targetStore.x, y: $targetStore.y });
        } else {
            currentPath = [];
            console.warn("No starting point available for path");
        }
    }

    function handlePathDrawingCancel() {
        console.log('Path drawing cancelled');
        isPathDrawingMode = false;
        pathDrawingGroup = null;
        currentPath = [];
        showMove = false;
    }

    function confirmPathDrawing(path) {
        console.log('Path drawing confirmed with path:', path || currentPath);
        
        if (path) {
            currentPath = [...path];
        }
        
        // Ensure we have a valid path and group ID
        if (currentPath.length < 2 || !pathDrawingGroup) {
            console.error("Cannot confirm path: Invalid path or missing group data", {
                pathLength: currentPath.length,
                pathDrawingGroup
            });
            alert("Error: Cannot confirm path - missing data");
            return;
        }
        
        // Extract group ID, handling both possible formats
        const groupId = pathDrawingGroup.id || pathDrawingGroup.groupId;
        
        if (!groupId) {
            console.error("Cannot confirm path: Missing group ID", pathDrawingGroup);
            alert("Error: Cannot confirm path - missing group ID");
            return;
        }
        
        try {
            // Get Firebase functions instance
            const functions = getFunctions();
            const moveGroupFn = httpsCallable(functions, 'moveGroup');
            
            const startPoint = currentPath[0];
            const endPoint = currentPath[currentPath.length - 1];
            
            console.log('Calling moveGroup function with params:', {
                groupId: groupId,
                fromX: startPoint.x,
                fromY: startPoint.y,
                toX: endPoint.x,
                toY: endPoint.y,
                path: currentPath,
                worldId: $game.currentWorld
            });
            
            // Call the cloud function directly
            moveGroupFn({
                groupId: groupId,
                fromX: startPoint.x,
                fromY: startPoint.y,
                toX: endPoint.x,
                toY: endPoint.y,
                path: currentPath,
                worldId: $game.currentWorld
            }).then(result => {
                console.log('Movement started successfully:', result.data);
                showMove = false;
            }).catch(error => {
                console.error('Error confirming path with cloud function:', error);
                alert('Error: ' + (error.message || 'Failed to start movement'));
            });
        } catch (error) {
            console.error('Exception in path confirmation:', error);
            alert('Error confirming path: ' + (error.message || 'Unknown error'));
        }
        
        isPathDrawingMode = false;
        setTimeout(() => {
            // Clear path only after transition completes
            if (!isPathDrawingMode) {
                pathDrawingGroup = null;
                currentPath = [];
            }
        }, 500);
    }

    function calculatePathBetweenPoints(startX, startY, endX, endY) {
        const path = [];
        
        const dx = Math.abs(endX - startX);
        const dy = Math.abs(endY - startY);
        const sx = startX < endX ? 1 : -1;
        const sy = startY < endY ? 1 : -1;
        
        let err = dx - dy;
        let x = startX;
        let y = startY;
        
        while (x !== endX || y !== endY) {
            const e2 = 2 * err;
            
            if (e2 > -dy) {
                err -= dy;
                x += sx;
            }
            
            if (e2 < dx) {
                err += dx;
                y += sy;
            }
            
            path.push({ x, y });
        }
        
        return path;
    }
</script>

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
        />
        
        <div class="map-controls">
            <button 
                class="control-button minimap-button" 
                onclick={toggleMinimap}
                aria-label={showMinimap ? "Hide minimap" : "Show minimap"}
                disabled={$needsSpawn || isTutorialVisible}>
                {#if showMinimap || minimapClosing}
                    <Close size="1.2em" extraClass="close-icon-dark" />
                {:else}
                    <span class="button-text">M</span>
                {/if}
            </button>
        </div>
        
        <div class="entity-controls">
            <button 
                class="control-button entity-button" 
                onclick={toggleEntities}
                aria-label={showEntities ? "Hide entities" : "Show entities"}
                disabled={$needsSpawn || isTutorialVisible}>
                {#if showEntities || entitiesClosing}
                    <Close size="1.2em" extraClass="close-icon-dark" />
                {:else}
                    <span class="button-text">E</span>
                {/if}
            </button>
        </div>
        
        {#if showMinimap || minimapClosing}
            <Minimap closing={minimapClosing} />
        {/if}
        
        {#if showEntities || entitiesClosing}
            <MapEntities 
              closing={entitiesClosing} 
              onShowStructure={({ structure, x, y }) => {
                showStructureOverview = true;
                selectedStructure = structure;
                structureLocation = { x, y };
              }}
            />
        {/if}

        {#if detailed && highlightedStore}
            <Details 
                x={highlightedStore.x} 
                y={highlightedStore.y} 
                terrain={highlightedStore.biome?.name} 
                onClose={() => toggleDetailsModal(false)}
                onShowModal={({ type, data }) => {
                    // Close the details first
                    toggleDetailsModal(false);
                    
                    // Then show the appropriate modal
                    switch(type) {
                        case 'mobilize':
                            showMobilize = true;
                            mobilizeData = data;
                            break;
                        case 'move':
                            showMove = true;
                            moveData = data;
                            break;
                        case 'attack':
                            showAttack = true;
                            attackData = data;
                            break;
                        case 'joinBattle':
                            showJoinBattle = true;
                            joinBattleData = data;
                            break;
                        case 'demobilize':
                            showDemobilize = true;
                            demobilizeData = data;
                            break;
                        case 'gather':
                            showGather = true;
                            gatherData = data;
                            break;
                        case 'inspect':
                            showStructureOverview = true;
                            selectedStructure = data.structure;
                            structureLocation = { x: data.x, y: data.y };
                            selectedTile = data.tile;
                            break;
                        default:
                            console.log(`Unhandled modal type: ${type}`);
                    }
                }}
            />
        {:else}
            <Legend 
                x={$targetStore.x}  
                y={$targetStore.y}  
                openDetails={() => {
                    toggleDetailsModal(true, $targetStore);
                }} 
            />
        {/if}

        {#if $ready}
            <Axes />
        {/if}

        <Tutorial onVisibilityChange={handleTutorialVisibility} />
        
        {#if $needsSpawn && $user}
            <SpawnMenu onSpawn={handleSpawnComplete} />
        {/if}

        {#if showMobilize && mobilizeData}
            <Mobilize
                tile={mobilizeData}
                onClose={() => {
                    showMobilize = false;
                    setHighlighted(null, null);
                }}
            />
        {/if}

        {#if showMove && moveData}
            <div class="move-dialog-container">
                <Move
                    tile={moveData}
                    onClose={(complete = true, startingPathDraw = false) => {
                        showMove = false;
                        
                        if (!complete && startingPathDraw) {
                            return;
                        }
                        
                        isPathDrawingMode = false;
                        pathDrawingGroup = null;
                        currentPath = [];
                        setHighlighted(null, null);
                    }}
                    onPathDrawingStart={handlePathDrawingStart}
                    onPathDrawingCancel={handlePathDrawingCancel}
                    onConfirmPath={confirmPathDrawing}
                    {pathDrawingGroup}
                    {currentPath}
                />
            </div>
        {/if}

        {#if showAttack && attackData}
            <AttackGroups
                tile={attackData}
                onClose={() => {
                    showAttack = false;
                    setHighlighted(null, null);
                }}
                onAttack={(tile) => {
                    showAttack = true;
                    attackData = tile;
                }}
            />
        {/if}

        {#if showJoinBattle && joinBattleData}
            <JoinBattle
                tile={joinBattleData}
                onClose={() => {
                    showJoinBattle = false;
                    setHighlighted(null, null);
                }}
                onJoinBattle={(tile) => {
                    showJoinBattle = true;
                    joinBattleData = tile;
                }}
            />
        {/if}

        {#if showGather && gatherData}
            <Gather
                tile={gatherData}
                onClose={() => {
                    showGather = false;
                    setHighlighted(null, null);
                }}
                onGather={(data) => {
                    console.log('Gathering started:', data);
                    showGather = false;
                }}
            />
        {/if}

        {#if showDemobilize && demobilizeData}
            <Demobilize
                tile={demobilizeData}
                onClose={() => {
                    showDemobilize = false;
                    setHighlighted(null, null);
                }}
                onDemobilize={(data) => {
                    console.log('Demobilization started:', data);
                    showDemobilize = false;
                }}
            />
        {/if}

        {#if isPathDrawingMode}
            <div class="path-drawing-controls">
                <div class="path-info path-drawing-active">
                    <span>Drawing path: {currentPath.length} points</span>
                    <span class="path-hint">Click on map to add points</span>
                </div>
                <div class="path-buttons">
                    <button 
                        class="cancel-path-btn" 
                        onclick={handlePathDrawingCancel}
                    >
                        Cancel
                    </button>
                    <button 
                        class="confirm-path-btn" 
                        disabled={currentPath.length < 2}
                        onclick={() => confirmPathDrawing()}
                    >
                        Confirm Path
                    </button>
                </div>
            </div>
        {/if}

        {#if showStructureOverview && selectedStructure}
            <StructureOverview 
                structure={selectedStructure}
                x={structureLocation.x}
                y={structureLocation.y}
                tile={selectedTile}
                onClose={() => {
                    showStructureOverview = false;
                    setTimeout(() => {
                        selectedStructure = null;
                        selectedTile = null;
                    }, 300);
                }}
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
        bottom: 2em;
        left: 4em;
        z-index: 1001;
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

    .move-dialog-container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1150;
        pointer-events: none;
    }
    
    .move-dialog-container :global(dialog) {
        pointer-events: auto;
    }

    .path-drawing-controls {
        position: absolute;
        bottom: 1em;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(255, 255, 255, 0.95);
        border: 0.05em solid rgba(255, 255, 255, 0.3);
        border-radius: 0.5em;
        padding: 1em;
        display: flex;
        flex-direction: column;
        gap: 0.8em;
        z-index: 1500;
        min-width: 18em;
        backdrop-filter: blur(0.5em);
        -webkit-backdrop-filter: blur(0.5em);
        color: rgba(0, 0, 0, 0.8);
        text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
        box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.3);
        font-family: var(--font-body);
        animation: reveal 0.4s ease-out forwards;
    }
    
    .path-info {
        text-align: center;
        font-size: 0.9em;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.4em;
        font-weight: 500;
    }
    
    .path-hint {
        font-size: 0.8em;
        opacity: 0.7;
    }
    
    .path-drawing-active {
        color: rgba(0, 0, 0, 0.8);
        font-weight: 600;
    }
    
    .path-buttons {
        display: flex;
        gap: 0.8em;
    }
    
    .cancel-path-btn, .confirm-path-btn {
        flex: 1;
        padding: 0.6em;
        border: none;
        border-radius: 0.3em;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        font-family: var(--font-heading);
    }
    
    .cancel-path-btn {
        background-color: rgba(0, 0, 0, 0.1);
        color: rgba(0, 0, 0, 0.7);
        border: 1px solid rgba(0, 0, 0, 0.2);
    }
    
    .confirm-path-btn {
        background-color: var(--color-teal);
        color: white;
        border: 1px solid var(--color-muted-teal);
    }
    
    .cancel-path-btn:hover {
        background-color: rgba(0, 0, 0, 0.2);
        transform: translateY(-0.1em);
    }
    
    .confirm-path-btn:hover:not(:disabled) {
        background-color: var(--color-bright-teal);
        transform: translateY(-0.1em);
        box-shadow: 0 0.2em 0.4em rgba(0, 150, 150, 0.3);
    }
    
    .confirm-path-btn:disabled {
        opacity: 0.65;
        cursor: not-allowed;
    }

    @keyframes reveal {
        from {
            opacity: 0;
            transform: translateY(1em) translateX(-50%);
        }
        to {
            opacity: 1;
            transform: translateY(0) translateX(-50%);
        }
    }
</style>