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
        setHighlighted
    } from "../../lib/stores/map.js";
    
    import { ref, update } from "firebase/database";
    import { db } from "../../lib/firebase/database";
    import { getFunctions, httpsCallable } from "firebase/functions";
    
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
    import AttackGroups from '../../components/map/AttackGroups.svelte';
    import JoinBattle from '../../components/map/JoinBattle.svelte';
    import Demobilize from '../../components/map/Demobilize.svelte';
    import StructureOverview from '../../components/map/StructureOverview.svelte';

    let detailed = $state(false);
    let loading = $state(true);
    let error = $state(null);
    
    let urlCoordinates = $state(null);
    let urlProcessingComplete = $state(false);
    
    let initAttempted = $state(false);
    
    const combinedLoading = $derived(loading || $game.worldLoading || !$isAuthReady);
    
    const isDragging = $derived($map.isDragging);
    
    function toggleDetailsModal(show) {
        detailed = show;
    }
    
    let ignoreNextUrlChange = $state(false);
    let lastProcessedLocation = $state(null);
    
    let urlCoordinatesProcessing = $state(false);
    let urlCoordinatesLastProcessed = $state({ x: null, y: null });
    
    let coordinateProcessingState = $state({
        processing: false,
        processed: new Set(),
        lastProcessedTime: 0
    });
    
    let isPathDrawingMode = $state(false);
    let pathDrawingGroup = $state(null);
    let currentPath = $state([]);
    let moveComponentRef = $state(null);
    let optimizePath = $state(true); // Add state for path optimization

    let showAttack = $state(false);
    let showJoinBattle = $state(false);

    let showActions = $state(false);
    let selectedTile = $state(null);
    
    let showMobilize = $state(false);
    let showMove = $state(false);
    let showDemobilize = $state(false); // Add state for demobilize dialog

    // State for structure overview
    let showStructureOverview = $state(false);
    let selectedStructure = $state(null);
    let structureLocation = $state({ x: 0, y: 0 });

    // Add new effect to watch optimizePath changes
    $effect(() => {
        // When optimize path setting changes and we're in path drawing mode with a path
        if (isPathDrawingMode && currentPath.length > 1) {
            if (optimizePath) {
                // Optimize the current path immediately when checkbox is toggled on
                const optimized = optimizePathPoints([...currentPath]);
                
                // Only update if optimization actually reduced the path
                if (optimized.length < currentPath.length) {
                    currentPath = optimized;
                    
                    if (moveComponentRef) {
                        moveComponentRef.updateCustomPath(currentPath);
                    }
                }
            }
        }
    });

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

    function openActionsForTile(cell) {
        selectedTile = cell;
        showActions = true;
    }
    
    function closeActionsPopup() {
        showActions = false;
        setHighlighted(null, null);
    }
    
    function openMobilizePopup() {
        showMobilize = true;
        showActions = false;
    }
    
    function closeMobilizePopup() {
        showMobilize = false;
        setHighlighted(null, null);
    }
    
    function openMovePopup() {
        showMove = true;
        showActions = false;
    }
    
    function closeMovePopup(complete = true, startingPathDraw = false) {
        // Always hide the dialog first
        showMove = false;
        
        if (!complete && startingPathDraw) {
            // Don't do anything else - path drawing mode will be enabled by handlePathDrawingStart
            return;
        }
        
        // Normal closing behavior
        isPathDrawingMode = false;
        pathDrawingGroup = null;
        currentPath = [];
        setHighlighted(null, null);
    }
    
    function openAttackPopup() {
        showAttack = true;
        showActions = false;
    }
    
    function closeAttackPopup() {
        showAttack = false;
        setHighlighted(null, null);
    }
    
    function openJoinBattlePopup() {
        showJoinBattle = true;
        showActions = false;
    }
    
    function closeJoinBattlePopup() {
        showJoinBattle = false;
        setHighlighted(null, null);
    }
    
    function openDemobilizePopup() {
        showDemobilize = true;
        showActions = false;
    }
    
    function closeDemobilizePopup() {
        showDemobilize = false;
        setHighlighted(null, null);
    }
    
    function handlePathDrawingStart(eventData) {
        console.log('Starting path drawing:', eventData);
        const { groupId, startPoint } = eventData;
        
        // Always reset first
        isPathDrawingMode = false;
        currentPath = [];
        
        // Ensure move dialog is closed
        showMove = false;
        
        // Initialize with a slight delay to ensure dialog is gone
        setTimeout(() => {
            // Initialize the path with the start point
            currentPath = [startPoint];
            
            // Then activate path drawing mode
            isPathDrawingMode = true;
            pathDrawingGroup = groupId;
            
            console.log('Path drawing mode activated with group:', groupId);
            console.log('Initial path:', currentPath);
            
            // Update move component ref if it exists
            if (moveComponentRef && typeof moveComponentRef.updateCustomPath === 'function') {
                moveComponentRef.updateCustomPath(currentPath);
            }
        }, 100);
    }

    function handlePathPoint(point) {
        if (!isPathDrawingMode) {
            console.log('Not in path drawing mode, ignoring point');
            return;
        }
        
        console.log('Page: Received path point:', point);
        
        if (currentPath.length > 0) {
            const lastPoint = currentPath[currentPath.length - 1];
            const dx = Math.abs(point.x - lastPoint.x);
            const dy = Math.abs(point.y - lastPoint.y);
            
            // Don't add the same point twice
            if (lastPoint.x === point.x && lastPoint.y === point.y) {
                console.log('Point is duplicate of last point, skipping');
                return;
            }
            
            // Check if point already exists in path
            const pointExists = currentPath.some(p => p.x === point.x && p.y === point.y);
            if (pointExists) {
                console.log('Point already in path');
                return;
            }
            
            // For non-adjacent points, calculate path between them
            if (dx > 1 || dy > 1) {
                console.log('Calculating path to non-adjacent point');
                const intermediatePath = calculatePathBetweenPoints(
                    lastPoint.x, lastPoint.y, 
                    point.x, point.y
                );
                
                // Check if adding these points would exceed 20 steps
                if (currentPath.length + intermediatePath.length > 20) {
                    console.log('Path exceeds 20 steps limit, truncating...');
                    
                    // Calculate how many points we can add without exceeding limit
                    const pointsToAdd = 20 - currentPath.length;
                    if (pointsToAdd <= 0) {
                        console.log('Path already at maximum length');
                        return;
                    }
                    
                    // Add only allowed number of points
                    currentPath = [
                        ...currentPath,
                        ...intermediatePath.slice(0, pointsToAdd)
                    ];
                } else {
                    // Add all intermediate points
                    currentPath = [...currentPath, ...intermediatePath];
                }
            } else {
                // Check if adding this point would exceed 20 steps
                if (currentPath.length >= 20) {
                    console.log('Maximum path length reached (20 steps)');
                    return;
                }
                
                // For adjacent point, add directly
                currentPath = [...currentPath, point];
            }
        } else {
            // First point in path
            currentPath = [point];
        }
        
        console.log('Updated path in page component:', currentPath);
        
        // Update move component ref with new path data
        if (moveComponentRef && typeof moveComponentRef.updateCustomPath === 'function') {
            moveComponentRef.updateCustomPath(currentPath);
        }
    }

    // Add helper function to calculate path between points
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
        
        // First point is already in the path, so we skip it
        
        // Generate intermediate steps
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
            
            // Add intermediate point
            path.push({ x, y });
        }
        
        return path;
    }

    function confirmPathDrawing() {
        if (!isPathDrawingMode || !pathDrawingGroup || currentPath.length < 2) {
            console.warn('Cannot confirm path drawing: Invalid state or path too short');
            return;
        }
        
        console.log('Confirming path drawing with', currentPath.length, 'points');
        
        // Call the Cloud Function directly
        const functions = getFunctions();
        const moveGroup = httpsCallable(functions, 'moveGroup');
        
        const startPoint = currentPath[0];
        const endPoint = currentPath[currentPath.length - 1];
        
        console.log('Calling moveGroup with path:', {
            groupId: pathDrawingGroup,
            fromX: startPoint.x,
            fromY: startPoint.y,
            toX: endPoint.x,
            toY: endPoint.y,
            path: currentPath,
            worldId: $game.currentWorld
        });
        
        moveGroup({
            groupId: pathDrawingGroup,
            fromX: startPoint.x,
            fromY: startPoint.y,
            toX: endPoint.x,
            toY: endPoint.y,
            path: currentPath,
            worldId: $game.currentWorld
        })
        .then((result) => {
            console.log('Path movement started:', result.data);
        })
        .catch((error) => {
            console.error('Path movement error:', error);
            alert(`Error: ${error.message || 'Failed to start movement'}`);
        });
        
        // Also call moveComponentRef.confirmCustomPath() for UI updates
        if (moveComponentRef && typeof moveComponentRef.confirmCustomPath === 'function') {
            moveComponentRef.confirmCustomPath();
        }
        
        // Reset path drawing state
        isPathDrawingMode = false;
        pathDrawingGroup = null;
        currentPath = [];
    }

    function cancelPathDrawing() {
        isPathDrawingMode = false;
        pathDrawingGroup = null;
        currentPath = [];
        
        if (moveComponentRef) {
            moveComponentRef.cancelPathDrawing();
        }
    }

    function handlePathDrawingCancel() {
        console.log('Path drawing cancelled');
        isPathDrawingMode = false;
        pathDrawingGroup = null;
        currentPath = [];
        
        // If we have a reference to the Move component, call its cancelPathDrawing method
        if (moveComponentRef && typeof moveComponentRef.cancelPathDrawing === 'function') {
            moveComponentRef.cancelPathDrawing();
        }
    }
    
    function handleAction(eventData) {
        const { action, tile } = eventData; // Direct destructuring of the passed object
        console.log('Action selected:', action, 'for tile:', tile);
        
        if (action === 'mobilize') {
            openMobilizePopup();
            return;
        }
        
        if (action === 'move') {
            openMovePopup();
            return;
        }
        
        if (action === 'attack') {
            openAttackPopup();
            return;
        }
        
        if (action === 'joinBattle') {
            openJoinBattlePopup();
            return;
        }
        
        if (action === 'demobilize') {
            openDemobilizePopup();
            return;
        }

        if (action === 'inspect') {
            // Show structure overview
            if (tile && tile.structure) {
                selectedStructure = tile.structure;
                structureLocation = { x: tile.x, y: tile.y };
                showStructureOverview = true;
            }
            return;
        }
        
        switch(action) {
            case 'explore':
                console.log(`Exploring ${tile.x}, ${tile.y}`);
                break;
        }
    }

    // Function to close structure overview
    function closeStructureOverview() {
        showStructureOverview = false;
        // Keep selected structure data for animation closing
        setTimeout(() => {
            selectedStructure = null;
        }, 300);
    }
    
    // Handle attack action
    function handleAttack(eventData) {
        const { attackerGroupId, defenderGroupId, tile } = eventData;
        console.log('Attacking:', { attackerGroupId, defenderGroupId, tile });
        
        const functions = getFunctions();
        const attackGroup = httpsCallable(functions, 'attackGroup');
        
        attackGroup({
            attackerGroupId,
            defenderGroupId,
            locationX: tile.x,
            locationY: tile.y,
            worldId: $game.currentWorld
        })
        .then((result) => {
            console.log('Attack started:', result.data);
            // Optionally show a success message
        })
        .catch((error) => {
            console.error('Attack error:', error);
            // Show error message to player
        });
    }
    
    // Handle join battle action
    function handleJoinBattle(eventData) {
        const { groupId, battleId, side, tile } = eventData;
        console.log('Joining battle:', { groupId, battleId, side, tile });
        
        const functions = getFunctions();
        const joinBattle = httpsCallable(functions, 'joinBattle');
        
        joinBattle({
            groupId,
            battleId, 
            side,
            locationX: tile.x,
            locationY: tile.y,
            worldId: $game.currentWorld
        })
        .then((result) => {
            console.log('Joined battle:', result.data);
            // Optionally show a success message
        })
        .catch((error) => {
            console.error('Join battle error:', error);
            // Show error message to player
        });
    }
    
    function handleMove(eventData) {
        const { groupId, from, to, path } = eventData;
        console.log('Moving group:', { groupId, from, to, path });
        
        const functions = getFunctions();
        const moveGroup = httpsCallable(functions, 'moveGroup');
        
        moveGroup({
            groupId: groupId,
            fromX: from.x,
            fromY: from.y,
            toX: to.x,
            toY: to.y,
            path: path,
            worldId: $game.currentWorld
        })
        .then((result) => {
            console.log('Movement started:', result.data);
        })
        .catch((error) => {
            console.error('Movement error:', error);
        });
    }

    function handleMobilize(eventData) {
        const { tile, units, includePlayer, name, race } = eventData;
        console.log('Mobilizing:', { tile, units, includePlayer, name, race });
        
        const chunkSize = 20;
        const chunkX = Math.floor(tile.x / chunkSize);
        const chunkY = Math.floor(tile.y / chunkSize);
        const chunkKey = `${chunkX},${chunkY}`;
        const tileKey = `${tile.x},${tile.y}`;
        
        const now = Date.now();
        
        // Calculate the next world tick time
        const worldSpeed = $game.worldInfo[$game.currentWorld]?.speed || 1.0;
        
        const tickIntervalMs = 300000; // 5 minutes in milliseconds
        const adjustedInterval = Math.round(tickIntervalMs / worldSpeed);
        
        const msIntoCurrentInterval = now % adjustedInterval;
        const msToNextTick = adjustedInterval - msIntoCurrentInterval;
        
        const readyAt = now + msToNextTick;
        
        const playerUid = $currentPlayer?.uid;
        
        if (!playerUid) {
            console.error('Cannot mobilize: No user ID available');
            return;
        }
        
        const newGroupId = `group_${playerUid}_${now}`;
        
        const selectedUnits = [];
        
        if (units && units.length > 0) {
            if (tile.groups && tile.groups.length > 0) {
                for (const group of tile.groups) {
                    if (group.units && Array.isArray(group.units)) {
                        for (const unit of group.units) {
                            if (units.includes(unit.id)) {
                                selectedUnits.push({
                                    ...unit,
                                    lastUpdated: now
                                });
                            }
                        }
                    }
                }
            }
        }
        
        if (includePlayer && $currentPlayer) {
            selectedUnits.push({
                id: playerUid,
                type: 'player',
                race: $currentPlayer.race,
                name: $currentPlayer.displayName || 'Player',
                strength: 10,
                lastUpdated: now
            });
        }
        
        const updates = {};
        
        updates[`worlds/${$game.currentWorld}/chunks/${chunkKey}/${tileKey}/groups/${newGroupId}`] = {
            id: newGroupId,
            name: name || "New Force",
            owner: playerUid,
            unitCount: selectedUnits.length,
            race: race || $currentPlayer?.race,
            created: now,
            lastUpdated: now,
            x: tile.x,
            y: tile.y,
            status: 'mobilizing',
            readyAt: readyAt,
            lastProcessed: now,
            units: selectedUnits
        };
        
        if (includePlayer) {
            const playerIndex = tile.players?.findIndex(p => p.id === playerUid);
            
            if (playerIndex !== undefined && playerIndex >= 0 && tile.players) {
                const updatedPlayers = [...tile.players];
                updatedPlayers.splice(playerIndex, 1);
                
                if (updatedPlayers.length > 0) {
                    updates[`worlds/${$game.currentWorld}/chunks/${chunkKey}/${tileKey}/players`] = updatedPlayers;
                } else {
                    updates[`worlds/${$game.currentWorld}/chunks/${chunkKey}/${tileKey}/players`] = null;
                }
                
                updates[`players/${playerUid}/worlds/${$game.currentWorld}/inGroup`] = newGroupId;
                updates[`players/${playerUid}/worlds/${$game.currentWorld}/lastGroupJoin`] = now;
            }
        }
        
        update(ref(db), updates)
            .then(() => {
                console.log('Mobilization started:', { 
                    groupId: newGroupId, 
                    readyAt, 
                    playerIncluded: includePlayer,
                    unitCount: selectedUnits.length
                });
            })
            .catch(error => {
                console.error('Mobilization error:', error);
            });
    }

    function handleDemobilize(eventData) {
        const { groupId, targetStructureId, locationX, locationY, worldId, tile } = eventData;
        console.log('Demobilizing:', { groupId, targetStructureId, locationX, locationY, worldId });
        
        const functions = getFunctions();
        const demobiliseUnits = httpsCallable(functions, 'demobiliseUnits');
        
        demobiliseUnits({
            groupId,
            targetStructureId,
            locationX,
            locationY,
            worldId: $game.currentWorld
        })
        .then((result) => {
            console.log('Demobilization started:', result.data);
        })
        .catch((error) => {
            console.error('Demobilization error:', error);
            alert(`Error: ${error.message || 'Failed to demobilize group'}`);
        });
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
            {detailed} 
            openActions={openActionsForTile} 
            isPathDrawingMode={!!isPathDrawingMode}
            {moveComponentRef}
            onAddPathPoint={handlePathPoint}
        />
        
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
                onAction={handleAction} 
            />
        {/if}

        {#if showMobilize && selectedTile}
            <Mobilize
                tile={selectedTile}
                onClose={closeMobilizePopup}
                onMobilize={handleMobilize}
            />
        {/if}

        {#if showMove && selectedTile}
            <div class="move-dialog-container">
                <Move
                    tile={selectedTile}
                    onClose={closeMovePopup}
                    onMove={handleMove}
                    onPathDrawingStart={handlePathDrawingStart}
                    onPathDrawingCancel={handlePathDrawingCancel}
                    bind:this={moveComponentRef}
                />
            </div>
        {/if}

        {#if showAttack && selectedTile}
            <AttackGroups
                tile={selectedTile}
                onClose={closeAttackPopup}
                onAttack={handleAttack}
            />
        {/if}

        {#if showJoinBattle && selectedTile}
            <JoinBattle
                tile={selectedTile}
                onClose={closeJoinBattlePopup}
                onJoinBattle={handleJoinBattle}
            />
        {/if}

        {#if showDemobilize && selectedTile}
            <Demobilize
                tile={selectedTile}
                onClose={closeDemobilizePopup}
                onDemobilize={handleDemobilize}
            />
        {/if}

        {#if isPathDrawingMode}
            <div class="path-drawing-controls">
                <div class="path-info path-drawing-active">
                    <span>Drawing path: {currentPath.length} points</span>
                    <label class="optimize-path-checkbox">
                        <input type="checkbox" bind:checked={optimizePath}>
                        Optimize path
                    </label>
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
                        onclick={confirmPathDrawing}
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
                onClose={closeStructureOverview} 
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
        background-color: rgba(0, 0, 0, 0.85);
        border-radius: 0.5em;
        padding: 1em;
        display: flex;
        flex-direction: column;
        gap: 0.8em;
        z-index: 1500; /* Ensure highest visibility */
        min-width: 18em;
        backdrop-filter: blur(5px);
        box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.5), 0 0 0 2px rgba(255, 255, 255, 0.3);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .path-info {
        text-align: center;
        font-size: 0.9em;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.4em;
    }
    
    .path-drawing-active {
        color: #ffff99;
        font-weight: 500;
    }
    
    .optimize-path-checkbox {
        display: flex;
        align-items: center;
        gap: 0.4em;
        font-size: 0.9em;
        cursor: pointer;
    }
    
    .optimize-path-checkbox input {
        margin: 0;
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
    }
    
    .cancel-path-btn {
        background-color: #6c757d;
        color: white;
    }
    
    .confirm-path-btn {
        background-color: #28a745;
        color: white;
    }
    
    .cancel-path-btn:hover {
        background-color: #5a6268;
    }
    
    .confirm-path-btn:hover:not(:disabled) {
        background-color: #218838;
    }
    
    .confirm-path-btn:disabled {
        opacity: 0.65;
        cursor: not-allowed;
    }
</style>