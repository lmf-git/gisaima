<script>
    import { browser } from '$app/environment';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { get } from 'svelte/store';
    import { user, isAuthReady } from '../../lib/stores/user.js'; 
    import { 
      game, 
      getWorldInfo,
      getWorldCenterCoordinates,
      setCurrentWorld,
      savePlayerAchievement
    } from "../../lib/stores/game.js";
    
    import { 
        map, 
        ready,
        targetStore,
        initialize,
        moveTarget,
        cleanup,
        isInternalUrlChange,
        setHighlighted,
        coordinates,
        handleKeyboardEvent
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
    import Map from '../../components/icons/Map.svelte';
    import Spyglass from '../../components/icons/Spyglass.svelte';
    import Recenter from '../../components/map/Recenter.svelte';
    import Chat from '../../components/map/Chat.svelte';
    import BirdActive from '../../components/icons/BirdActive.svelte';
    import { unreadMessages } from "../../lib/stores/chat.js";
    import Bird from '../../components/icons/Bird.svelte';
    import Achievements from '../../components/map/Achievements.svelte';
    import AchievementIcon from '../../components/icons/Trophy.svelte';

    const DEBUG_MODE = true;
    const debugLog = (...args) => DEBUG_MODE && console.log(...args);

    let isTutorialVisible = $state(false);
    let detailed = $state(false);
    let loading = $state(true);
    let error = $state(null);
    
    let urlProcessingComplete = $state(false);
    
    let isPathDrawingMode = $state(false);

    const combinedLoading = $derived(loading || $game.worldLoading || !$isAuthReady);
    
    const isDragging = $derived($map.isDragging);
    
    let isProcessingClick = false;

    let isTransitioningToPathDrawing = $state(false);

    let structureRenderCount = $state(0);

    let pathDrawingGroup = $state(null);
    let currentPath = $state([]);

    let modalState = $state({
        type: null,
        data: null,
        visible: false
    });

    const isAnyModalOpen = $derived(
        modalState.visible || 
        !$game?.player?.alive || 
        detailed || 
        isTutorialVisible
    );

    let showMinimap = $state(true);
    let showEntities = $state(false); // Changed from true to false - default closed
    let showChat = $state(true);
    let showAchievements = $state(false);
    const ANIMATION_DURATION = 800;

    let initialized = $state(false);
    let initializationRetries = $state(0);
    const MAX_INIT_RETRIES = 3;
    
    let ignoreNextUrlChange = $state(false);
    let lastProcessedLocation = $state(null);

    let lastActivePanel = $state('none'); // 'none', 'details', 'overview', 'chat', 'achievements'
    let shouldShowAchievementsAfterSpawn = $state(true); // New state to track if achievements should show after spawn

    const unreadCount = $derived($unreadMessages);

    const spawnMenuVisible = $derived(!$game?.player?.alive);

    let worldMembershipChecked = $state(false);

    function handlePanelHover(panelType) {
        if (panelType && ((panelType === 'chat' && showChat) || 
                        (panelType === 'achievements' && showAchievements) || 
                        (panelType === 'details' && detailed) || 
                        (panelType === 'overview' && showEntities))) {
            console.log(`Setting active panel to: ${panelType}`);
            lastActivePanel = panelType;
        }
    }

    // Handle keyboard events for all panels
    function handleKeyDown(event) {
        if (event.key === 'Escape') {
            // Handle only one panel at a time, in order of priority
            if (modalState.visible) {
                closeModal();
                event.preventDefault();
                event.stopPropagation();
                return; // Exit after handling one panel
            } else if (lastActivePanel === 'chat' && showChat) {
                showChat = false;
                event.preventDefault();
                event.stopPropagation();
            } else if (lastActivePanel === 'achievements' && showAchievements) {
                showAchievements = false;
                event.preventDefault();
                event.stopPropagation();
            } else if (lastActivePanel === 'details' && detailed) {
                detailed = false;
                event.preventDefault();
                event.stopPropagation();
            } else if (lastActivePanel === 'overview' && showEntities) {
                toggleEntities();
                event.preventDefault();
                event.stopPropagation();
            } else {
                // If no specific panel is active or the last active is closed,
                // close any open panel in a consistent order (only one)
                // Only check panels that are actually open
                if (showChat) {
                    showChat = false;
                    event.preventDefault();
                    event.stopPropagation();
                } else if (showAchievements) {
                    showAchievements = false;
                    event.preventDefault();
                    event.stopPropagation();
                } else if (detailed) {
                    detailed = false;
                    event.preventDefault();
                    event.stopPropagation();
                } else if (showEntities) {
                    toggleEntities();
                    event.preventDefault();
                    event.stopPropagation();
                }
                // Don't do anything if no panels are open
            }
        }
    }

    // Add new effect to handle showing achievements after spawn
    $effect(() => {
        // Check if player just spawned (alive changed from false to true)
        if ($game?.player?.alive && shouldShowAchievementsAfterSpawn) {
            console.log('Player spawned, checking if achievements should show');
            // Check if achievements aren't manually closed in localStorage
            const achievementsClosed = localStorage.getItem('achievements_closed') === 'true';
            if (!achievementsClosed) {
                // Ensure chat is closed before showing achievements
                showChat = false;
                showAchievements = true;
                lastActivePanel = 'achievements';
                console.log('Showing achievements after spawn');
            } else {
                console.log('Achievements closed by user preference, not showing after spawn');
            }
            shouldShowAchievementsAfterSpawn = false; // Reset for next time
        }
    });

    // Add function to handle spawn completion
    function handleSpawnComplete() {
        console.log('Spawn complete, flagging achievements to show');
        shouldShowAchievementsAfterSpawn = true;
    }

    function parseUrlCoordinates() {
        if (!browser || !page) return null;
        
        const url = get(page).url;
        const x = url.searchParams.get('x');
        const y = url.searchParams.get('y');
        
        if (x !== null && y !== null) {
            const parsedX = parseInt(x, 10);
            const parsedY = parseInt(y, 10);
            
            if (!isNaN(parsedX) && !isNaN(parsedY)) {
                return { x: parsedX, y: parsedY };
            }
        }
        
        return null;
    }
    
    if (browser) {
        window.addEventListener('popstate', () => {
            if (isInternalUrlChange()) return;
            urlProcessingComplete = false;
        });
    }
    
    $effect(() => {
        if (!browser || !$ready || urlProcessingComplete) return;
        
        const coords = parseUrlCoordinates();
        if (coords) {
            debugLog(`Applying URL coordinates: ${coords.x},${coords.y}`);
            moveTarget(coords.x, coords.y);
            urlProcessingComplete = true;
            return;
        }
            
        if ($game.player?.lastLocation) {
            const location = $game.player.lastLocation;
            moveTarget(location.x, location.y);
        } else if ($game.worldKey) {
            const worldCenter = getWorldCenterCoordinates($game.worldKey);
            moveTarget(worldCenter.x, worldCenter.y);
        }
        
        urlProcessingComplete = true;
    });

    $effect(() => {
        if ($game.worldKey && $game.worlds[$game.worldKey]) {
            const worldData = $game.worlds[$game.worldKey];
            console.log(`World data for ${$game.worldKey}:`, {
                hasSeed: worldData.seed !== undefined,
                seedType: typeof worldData.seed,
                seedValue: worldData.seed,
                hasCenter: !!worldData.center,
            });
        }
    });

    $effect(() => {
        if (initialized || !browser) return;
        
        debugLog("Map initialization starting, checking dependencies...");
        
        document.body.classList.add('map-page-active');
        
        if (!$isAuthReady) {
            debugLog("Auth not ready yet, waiting...");
            return;
        }
        
        // First check: user must be logged in - KEEP THIS CHECK
        if (!$user) {
            debugLog("User not authenticated, redirecting to login page");
            const currentUrl = get(page).url.pathname + get(page).url.search;
            goto(`/login?redirect=${encodeURIComponent(currentUrl)}`);
            return;
        }
        
        if (!$game.initialized) {
            debugLog("Game store not ready yet, waiting...");
            return;
        }
        
        debugLog("Auth and game store are ready, proceeding with map initialization");
        
        const url = get(page).url;
        const worldIdFromUrl = url.searchParams.get('world');
        const currentWorldId = $game.worldKey;
        
        let worldToUse;
        
        if (worldIdFromUrl) {
            worldToUse = worldIdFromUrl;
            debugLog(`Using world ID from URL: ${worldToUse}`);
            
            // REMOVED world membership check - now handled in SpawnMenu

            if (worldToUse !== currentWorldId) {
                debugLog(`Setting current world from URL: ${worldToUse} (was: ${currentWorldId})`);
                setCurrentWorld(worldToUse);
            }
        } else if (currentWorldId) {
            worldToUse = currentWorldId;
            debugLog(`Using current world from store: ${worldToUse}`);
            
            // REMOVED world membership check - now handled in SpawnMenu
        } else {
            console.error('No world ID available from URL or game store');
            goto('/worlds');
            return;
        }
        
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

        window.addEventListener('beforeunload', cleanup);
        
        return () => {
            if (browser) {
                document.body.classList.remove('map-page-active');
                cleanup();
                window.removeEventListener('beforeunload', cleanup);
            }
        };
    });

    $effect(() => {
        if (!$game?.player?.alive && isTutorialVisible) {
            isTutorialVisible = false;
        }
    });

    $effect(() => {
        if (browser) {
            const handleChatLocationClick = (event) => {
                const { x, y } = event.detail;
                if (typeof x === 'number' && typeof y === 'number') {
                    console.log(`Navigating to chat location: ${x},${y}`);
                    moveTarget(x, y);
                    
                    const clickedTile = $coordinates.find(c => c.x === x && c.y === y);
                    
                    if (clickedTile && hasTileContent(clickedTile)) {
                        setHighlighted(x, y);
                        toggleDetailsModal(true);
                    }
                }
            };
            
            window.addEventListener('goto-location', handleChatLocationClick);
            
            return () => {
                window.removeEventListener('goto-location', handleChatLocationClick);
            };
        }
    });

    $effect(() => {
        if (spawnMenuVisible && showAchievements) {
            showAchievements = false;
        }
    });

    $effect(() => {
        if (browser && initialized) {
            const savedChatState = localStorage.getItem('chat');
            const savedAchievementsState = localStorage.getItem('achievements');
            const achievementsClosed = localStorage.getItem('achievements_closed') === 'true';
            
            // Add handling for minimap and overview states
            const savedMinimapState = localStorage.getItem('minimap');
            const savedOverviewState = localStorage.getItem('overview');
            
            // Set minimap state based on localStorage (default to true if not set)
            showMinimap = savedMinimapState !== 'false';
            
            // Set overview/entities state based on localStorage (default to false if not set)
            showEntities = savedOverviewState === 'true'; // Changed to only show if explicitly true

            // First handle achievements since it has higher priority
            if (savedAchievementsState === 'true' && !achievementsClosed) {
                showAchievements = true;
                showChat = false; // Ensure chat is closed if achievements is open
                return; // Exit early to avoid further changes
            }
            
            // If achievements isn't open, then handle chat
            if (savedChatState !== 'false') { // Default to true unless explicitly set to false
                showChat = true;
                showAchievements = false; // Ensure achievements is closed if chat is open
            } else {
                showChat = false;
            }
        }
    });

    $effect(() => {
        if ($game.player?.alive && isTutorialVisible) {
            // Close achievements and details when tutorial becomes visible
            showAchievements = false;
            detailed = false;
        }
    });

    $effect(() => {
        // Close chat if tutorial becomes visible
        if (isTutorialVisible && showChat) {
            showChat = false;
        }
    });

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
        if (detailed) {
            lastActivePanel = 'details';
        }
    }

    async function ensureWorldDataLoaded(worldId) {
        if (!worldId) return false;
        
        if ($game.worlds[worldId]?.seed !== undefined) {
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

    function checkAndInitializeMap() {
        if (!browser || !$game.worldKey || !$user) {
            console.error('Cannot initialize map yet: missing browser context, worldId or user');
            return;
        }
        
        const worldData = $game.worlds[$game.worldKey];
        
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
            
            initialize({
                seed: worldData.seed,
                worldId: $game.worldKey,
                initialX,
                initialY
            });
            
            loading = false;
        } catch (err) {
            console.error('Error initializing map:', err);
            loading = false;
            error = `Error initializing map: ${err.message}`;
        }
    }

    function handleMapKeyDown(event) {
      if (event.key !== 'Escape') return;
      
      const componentState = {
        structureOverview: modalState.type === 'inspect' && modalState.visible,
        details: detailed,
        pathDrawing: isPathDrawingMode,
        anyOtherModal: modalState.visible && modalState.type !== 'inspect',
        minimap: showMinimap,
        overview: showEntities
      };
      
      const actionTarget = handleKeyboardEvent(event, componentState);
      
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
    
    function toggleMinimap() {
      if (!$game?.player?.alive || isTutorialVisible) {
        return;
      }
      
      showMinimap = !showMinimap;
      if (browser) {
        localStorage.setItem('minimap', showMinimap.toString());
      }
    }

    function toggleEntities() {
      if (!$game?.player?.alive || isTutorialVisible) {
        return;
      }
      
      showEntities = !showEntities;
      if (showEntities) {
        lastActivePanel = 'overview';
      }
      if (browser) {
        localStorage.setItem('overview', showEntities.toString());
      }
    }

    function toggleChat() {
      if (!$game?.player?.alive || isTutorialVisible) {
        return;
      }
      
      // If chat is currently closed and we're about to open it
      if (!showChat) {
        // Always close achievements when opening chat
        showAchievements = false;
        showChat = true;
      } else {
        // Simply close chat if it's already open
        showChat = false;
      }
      
      // Set as active panel when opened
      if (showChat) {
        lastActivePanel = 'chat';
      }
      
      if (browser) {
        localStorage.setItem('chat', showChat.toString());
      }
    }

    function toggleAchievements() {
      if (!$game?.player?.alive || isTutorialVisible || spawnMenuVisible) {
        return;
      }
      
      // If achievements is currently closed and we're about to open it
      if (!showAchievements) {
        // Always close chat when opening achievements
        showChat = false;
        showAchievements = true;
      } else {
        // Simply close achievements if it's already open
        showAchievements = false;
      }
      
      // Set as active panel when opened
      if (showAchievements) {
        lastActivePanel = 'achievements';
      }
      
      if (browser) {
        localStorage.setItem('achievements', showAchievements.toString());
      }
    }

    function handleTutorialToggle() {
      console.log('Tutorial visibility toggled');
    }
    
    function toggleTutorial() {
      window.dispatchEvent(new CustomEvent('tutorial:toggle'));
    }

    function handleTutorialVisibility(isVisible) {
        if (!$game?.player?.alive && isVisible) {
            return;
        }
        
        isTutorialVisible = isVisible;
        
        if (isTutorialVisible) {
            // Close other panels when tutorial opens
            showMinimap = false;
            showEntities = false;
            showAchievements = false; // Also close achievements
            detailed = false; // Close details panel
            showChat = false; // Close chat panel
        }
    }

    // Add a function to directly open the achievements panel from tutorial
    function openAchievementsFromTutorial() {
        if (!$game?.player?.alive) return;
        
        // Close tutorial if open
        if (isTutorialVisible) {
            isTutorialVisible = false;
        }
        
        // Short delay to allow tutorial to close
        setTimeout(() => {
            // Show achievements panel
            showAchievements = true;
            lastActivePanel = 'achievements';
            
            // Save state to localStorage
            localStorage.removeItem('achievements_closed');
        }, 300);
    }

    // Updated to check if spawn menu is open
    function handleGridClick(coords) {
        // Skip processing if spawn menu is open (player not alive)
        if (!$game?.player?.alive) {
            return;
        }
        
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

    // Function to calculate path between points for path drawing
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

    // Missing methods for path drawing and achievements
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
        
        // Initialize with starting point if available
        if (group.startPoint && group.startPoint.x !== undefined && group.startPoint.y !== undefined) {
            currentPath = [{ x: group.startPoint.x, y: group.startPoint.y }];
        } else if (group.x !== undefined && group.y !== undefined) {
            currentPath = [{ x: group.x, y: group.y }];
        } else {
            const target = $map.target;
            if (target && target.x !== undefined && target.y !== undefined) {
                currentPath = [{ x: target.x, y: target.y }];
            } else {
                currentPath = [];
                console.warn('No valid starting coordinates for path drawing');
            }
        }
        
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
            isPathDrawingMode = false;
            pathDrawingGroup = null;
            currentPath = [];
        })
        .catch((error) => {
            console.error('Error starting path movement:', error);
            alert(`Error: ${error.message || 'Failed to start movement'}`);
        });
    }

    // Replace the wrapper function with a direct implementation
    function unlockAchievement(achievementId) {
        if ($game?.worldKey) {
            savePlayerAchievement($game.worldKey, achievementId, true)
                .then(() => {
                    console.log(`Achievement unlocked: ${achievementId}`);
                })
                .catch(error => {
                    console.error('Failed to save achievement:', error);
                });
        }
    }

    // Achievement trigger handlers - use the direct function
    function handleMobilise() {
        unlockAchievement('mobilised');
        closeModal();
    }

    function handleAttack(data) {
        unlockAchievement('first_attack');
        console.log('Attack started:', data);
        closeModal();
    }

    function handleJoinBattle(data) {
        unlockAchievement('battle_joiner');
        console.log('Joined battle:', data);
        closeModal();
    }

    function handleGather(result) {
        unlockAchievement('first_gather');
        closeModal();
    }

    function handleDemobilize(data) {
        unlockAchievement('demobilizer');
        console.log('Demobilization started:', data);
        closeModal();
    }

    function handlePathConfirm(path) {
        unlockAchievement('strategist');
        confirmPathDrawing(path);
    }
</script>

<svelte:window on:keydown={handleKeyDown} />

<div class="map" class:dragging={isDragging} class:path-drawing={isPathDrawingMode} class:spawn-menu-open={!$game?.player?.alive}>
    {#if combinedLoading}
        <div class="loading-overlay">
            <div class="loading-spinner"></div>
            <div class="loading-message">
                {#if !$isAuthReady}
                    Loading user data...
                {:else if !$game.initialized}
                    Initializing game data...
                {:else if $game.worldLoading}
                    Loading world data...
                {:else if !$ready}
                    Initializing map...
                {:else}
                    Preparing world...
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
                }
            }}
        />
        
        <div class="map-controls">
            {#if !isTutorialVisible}
                <button 
                    class="control-button help-button" 
                    onclick={toggleTutorial}
                    aria-label="Show tutorial"
                    disabled={!$game?.player?.alive}>
                    ?
                </button>
            {/if}
            <button 
                class="control-button minimap-button" 
                onclick={toggleMinimap}
                aria-label={showMinimap ? "Hide minimap" : "Show minimap"}
                disabled={!$game?.player?.alive || isTutorialVisible}>
                {#if showMinimap}
                    <Close size="1.2em" extraClass="close-icon-dark" />
                {:else}
                    <Map extraClass="button-icon" />
                {/if}
            </button>
        </div>
        
        {#if !showEntities}
            <div class="entity-controls">
                <button 
                    class="control-button entity-button" 
                    onclick={toggleEntities}
                    aria-label="Show entities"
                    disabled={!$game?.player?.alive || isTutorialVisible}>
                    <Spyglass extraClass="button-icon" />
                </button>
            </div>
        {/if}
        
        <div class="controls-right">
            {#if !showChat && $game?.player?.alive && !isTutorialVisible}
                <button 
                    class="control-button chat-button" 
                    onclick={toggleChat}
                    aria-label="Show chat">
                    {#if unreadCount > 0}
                        <BirdActive extraClass="button-icon" />
                        <span class="message-badge">{unreadCount}</span>
                    {:else}
                        <Bird extraClass="button-icon" />
                    {/if}
                </button>
            {/if}

            {#if !showAchievements && $game?.player?.alive && !isTutorialVisible && !spawnMenuVisible}
                <button 
                    class="control-button achievements-button" 
                    onclick={toggleAchievements}
                    aria-label="Show achievements">
                    <AchievementIcon extraClass="button-icon" />
                </button>
            {/if}
        </div>

        {#if showChat && !showAchievements && $game?.player?.alive && !isTutorialVisible}
            <div class="controls-middle-right">
                <button 
                    class="control-button achievements-button" 
                    onclick={toggleAchievements}
                    aria-label="Show achievements">
                    <AchievementIcon extraClass="button-icon" />
                </button>
            </div>
        {/if}

        {#if $ready && $game?.player?.alive}
            <div class="chat-wrapper" 
                class:visible={showChat && !isTutorialVisible} 
                class:active={lastActivePanel === 'chat'}
                onmouseenter={() => handlePanelHover('chat')}
                role="region"
                aria-label="Chat panel container"
            >
                {#if showChat && !isTutorialVisible}
                    <Chat 
                        isActive={lastActivePanel === 'chat'} 
                        closing={!showChat}
                        onClose={toggleChat} 
                        onMouseEnter={() => handlePanelHover('chat')}
                    />
                {/if}
            </div>

            {#if showAchievements && !isTutorialVisible}
                <div class="achievements-wrapper" 
                    class:visible={true}
                    class:active={lastActivePanel === 'achievements'}
                    onmouseenter={() => handlePanelHover('achievements')}
                    role="region"
                    aria-label="Achievements panel container"
                >
                    <Achievements 
                      onClose={toggleAchievements} 
                      onMouseEnter={() => handlePanelHover('achievements')}
                    />
                </div>
            {/if}
        {/if}

        {#if showMinimap}
            <Minimap />
        {/if}
        
        {#if showEntities}
            <Overview 
              isActive={lastActivePanel === 'overview'}
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
              onMouseEnter={() => handlePanelHover('overview')}
            />
        {/if}

        {#if detailed && !isTutorialVisible}
            <Details 
                onClose={() => toggleDetailsModal(false)} 
                onShowModal={showModal} 
                isActive={lastActivePanel === 'details'}
                onMouseEnter={() => handlePanelHover('details')}
            />
        {:else if $ready && !isPathDrawingMode && !isTutorialVisible && !(modalState.visible && modalState.type === 'inspect')}
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

        {#if $ready && $game?.player?.alive}
            <Tutorial 
                onVisibilityChange={handleTutorialVisibility}
                hideToggleButton={true}
                onToggle={handleTutorialToggle}
                onOpenAchievements={openAchievementsFromTutorial}
            />
            <Recenter />
        {/if}
        
        {#if ($user && !$game.player?.alive)}
            <SpawnMenu onSpawnComplete={handleSpawnComplete} />
        {/if}

        {#if modalState.visible}
          {#if modalState.type === 'inspect' && modalState.data}
            <StructureOverview 
              x={modalState.data.x}
              y={modalState.data.y}
              tile={modalState.data.tile}
              onClose={closeModal}
              onAchievement={unlockAchievement}
              key={structureRenderCount}
            />
          {:else if modalState.type === 'mobilise'}
            <Mobilise
              onClose={closeModal}
              onMobilize={() => {
                unlockAchievement('mobilised');
                closeModal();
              }}
            />
          {:else if modalState.type === 'move'}
            <Move
              onClose={(complete = true, startingPathDraw = false) => {
                closeModal();
              }}
              onPathDrawingStart={handlePathDrawingStart}
              onPathDrawingCancel={handlePathDrawingCancel}
              onConfirmPath={(path) => {
                unlockAchievement('strategist');
                handlePathConfirm(path);
              }}
              pathDrawingGroup={pathDrawingGroup}
              currentPath={currentPath}
            />
          {:else if modalState.type === 'attack'}
            <AttackGroups
              onClose={closeModal}
              onAttack={(data) => {
                unlockAchievement('first_attack');
                handleAttack(data);
              }}
            />
          {:else if modalState.type === 'joinBattle'}
            <JoinBattle
              onClose={closeModal}
              onJoinBattle={(data) => {
                unlockAchievement('battle_joiner');
                handleJoinBattle(data);
              }}
            />
          {:else if modalState.type === 'gather'}
            <Gather 
              onClose={() => closeModal()} 
              onGather={(result) => {
                unlockAchievement('first_gather');
                handleGather(result);
              }}
              data={modalState.data}
            />
          {:else if modalState.type === 'demobilise'}
            <Demobilise
              onClose={closeModal}
              onDemobilize={(data) => {
                unlockAchievement('demobilizer');
                handleDemobilize(data);
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
    
    .map.spawn-menu-open {
        pointer-events: none; /* Disable pointer events on the map when spawn menu is open */
    }
    
    .map.spawn-menu-open :global(.spawn-menu-wrapper) {
        pointer-events: all; /* Allow pointer events on the spawn menu itself */
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

    .loading-message {
        font-size: 1.1em;
        text-align: center;
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

    .controls-right {
        position: fixed;
        bottom: 1em;
        right: 1em;
        z-index: 1001;
        display: flex;
        gap: 0.5em;
    }
    
    .controls-middle-right {
        position: fixed;
        top: 50%;
        right: 1em;
        transform: translateY(-50%);
        z-index: 1001;
        display: flex;
        flex-direction: column;
        gap: 0.5em;
    }

    .control-button {
        min-width: 2em;
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

    :global(.button-icon) {
        height: 1.2em;
        width: 1.2em;
        fill: rgba(0, 0, 0, 0.8);
    }

    .minimap-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.3em;
        min-width: 2em;
        width: 2em;
    }

    .minimap-button :global(.close-icon-dark) {
        height: 1.2em;
        width: 1.2em;
    }

    .entity-button {
        padding: 0.3em;
        min-width: 2em;
        width: 2em;
    }

    .chat-button,
    .achievements-button {
        position: relative;
        padding: 0.3em;
        min-width: 2em;
        width: 2em;
        height: 2em;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .message-badge {
        position: absolute;
        top: -0.5em;
        right: -0.5em;
        background-color: #e74c3c;
        color: white;
        border-radius: 1em;
        padding: 0.2em 0.5em;
        font-size: 0.7em;
        min-width: 1.4em;
        text-align: center;
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.8);
    }

    /* Create a unified z-index system for all panels */
    .chat-wrapper,
    .achievements-wrapper,
    :global(.modal-container),
    :global(.overview-container) {
        position: fixed;
        z-index: 1500; /* Base z-index for all panels above minimap */
        transition: opacity 300ms ease, z-index 0s linear;
    }
    
    .chat-wrapper.visible,
    .achievements-wrapper.visible {
        opacity: 1;
        pointer-events: all;
        /* Add display property to ensure the wrapper is visible */
        display: block;
    }

    /* When not visible, hide completely after transition */
    .chat-wrapper:not(.visible),
    .achievements-wrapper:not(.visible) {
        opacity: 0;
        pointer-events: none;
        /* Add a small delay before hiding completely to allow animations to complete */
        transition: opacity 300ms ease, z-index 0s linear 300ms;
    }
    
    /* Active state for any panel will raise it to top */
    .chat-wrapper.active,
    .achievements-wrapper.active,
    :global(.modal-container.active),
    :global(.overview-container.active) {
        z-index: 1600 !important; /* Force highest z-index when active */
    }
    
    /* Minimap should be below all panels */
    :global(.minimap-container) {
        z-index: 1000 !important; /* Always below panels */
    }
    
    /* Original positioning for each panel */
    .chat-wrapper {
        bottom: 1em;
        right: 1em;
        opacity: 0;
        /* Remove pointer-events: none so the component can be interacted with */
        /* pointer-events: none; */
    }

    /* ...existing code... */
</style>