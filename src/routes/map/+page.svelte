<script>
    import { getFunctions, httpsCallable } from 'firebase/functions'; 
    import { get } from 'svelte/store';
    import { onMount, onDestroy } from 'svelte'; // Add this import

    import { browser } from '$app/environment';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';

    import { user, isAuthReady } from '../../lib/stores/user.js'; 
    
    import { 
      game, 
      getWorldInfo,
      setCurrentWorld,
      savePlayerAchievement,
      subscribeToWorldInfo
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
        hasTileContent
    } from "../../lib/stores/map.js";
    
    import { unreadMessages } from "../../lib/stores/chat.js";

    import Chat from '../../components/features/Chat.svelte';
    import Achievements from '../../components/features/feedback/Achievements.svelte';
    import AchievementUnlocked from '../../components/features/feedback/AchievementUnlocked.svelte';
    import Notices from '../../components/features/feedback//Notices.svelte';
    import NextWorldTick from '../../components/features/feedback//NextWorldTick.svelte';

    import Grid from '../../components/map/foundation/Grid.svelte';
    import Axes from '../../components/map/foundation/Axes.svelte';
    import Legend from '../../components/map/foundation/Legend.svelte';
    import Minimap from '../../components/map/foundation/Minimap.svelte';
    import Recenter from '../../components/map/foundation/Recenter.svelte';
    
    import Details from '../../components/map/actions/Details.svelte';
    import Overview from '../../components/map/actions/Overview.svelte';
    import StructureOverview from '../../components/map/actions/StructureOverview.svelte';
    import SpawnMenu from '../../components/map/actions/SpawnMenu.svelte';
    import Mobilise from '../../components/map/actions/Mobilise.svelte';
    import Move from '../../components/map/actions/Move.svelte';
    import Gather from '../../components/map/actions/Gather.svelte';
    import Demobilise from '../../components/map/actions/Demobilise.svelte';
    import Recruitment from '../../components/map/actions/Recruitment.svelte';
    import Attack from '../../components/map/actions/Attack.svelte';
    import Build from '../../components/map/actions/Build.svelte'; 
    import JoinBattle from '../../components/map/actions/JoinBattle.svelte';
    import Crafting from '../../components/map/actions/Crafting.svelte';
    import Tutorial from '../../components/map/actions/Tutorial.svelte';
    
    import Map from '../../components/icons/Map.svelte';
    import Close from '../../components/icons/Close.svelte';
    import Spyglass from '../../components/icons/Spyglass.svelte';
    import AchievementIcon from '../../components/icons/Trophy.svelte';
    import BirdActive from '../../components/icons/BirdActive.svelte';
    import Bird from '../../components/icons/Bird.svelte';
    import BoundIcon from '../../components/icons/BoundIcon.svelte';
    import UnboundIcon from '../../components/icons/UnboundIcon.svelte';
    import Logo from '../../components/Logo.svelte';
    
    
    const DEBUG_MODE = true;
    const debugLog = (...args) => DEBUG_MODE && console.log(...args);

    let isTutorialVisible = $state(false);
    let detailed = $state(false);
    let loading = $state(true);
    let error = $state(null);
    
    let urlProcessingComplete = $state(false);
    let playerPositionSet = $state(false); // New flag to track if player position has been set
    let isPathDrawingMode = $state(false);
    let followPlayerPosition = $state(true); // Add new state to control position following
    let lastKnownPlayerPosition = $state(null); // Track the last known player position

    const combinedLoading = $derived(loading || $game.worldLoading || !$isAuthReady);
    
    const isDragging = $derived($map.isDragging);
    
    let isProcessingClick = false;


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

    let showMinimap = $state(false); // Changed from true to false - default closed
    let showEntities = $state(false);
    let showChat = $state(true);
    let showAchievements = $state(false);

    let initialized = $state(false);
    let initializationRetries = $state(0);
    const MAX_INIT_RETRIES = 3;
    
    let lastActivePanel = $state('none'); // 'none', 'details', 'overview', 'chat', 'achievements'
    let shouldShowAchievementsAfterSpawn = $state(true); // New state to track if achievements should show after spawn

    const unreadCount = $derived($unreadMessages);

    const spawnMenuVisible = $derived(!$game?.player?.alive);

    let peekOpen = $state(false);
    let peekTile = $state(null);
    
    function handlePanelHover(panelType) {
        if (panelType && ((panelType === 'chat' && showChat) || 
                        (panelType === 'achievements' && showAchievements) || 
                        (panelType === 'details' && detailed) || 
                        (panelType === 'overview' && showEntities) ||
                        (modalState.visible && modalState.type === panelType))) {
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
            playerPositionSet = true; // Mark that we've set the player position
        }
        
        urlProcessingComplete = true;
    });
    
    // New effect to handle player position updates
    $effect(() => {
        // Skip if not ready or if position already set from URL
        if (!browser || !$ready) return;
        
        // If URL had coordinates, don't override with player position
        const coords = parseUrlCoordinates();
        if (coords) return;
        
        // If player data becomes available and position not already set from URL
        if ($game.player?.lastLocation && !playerPositionSet) {
            debugLog(`Setting position from player data: ${$game.player.lastLocation.x},${$game.player.lastLocation.y}`);
            const location = $game.player.lastLocation;
            moveTarget(location.x, location.y);
            playerPositionSet = true;
        }
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

    onMount(() => {
        if (browser) document.body.classList.add('map-page-active');
    })
    onDestroy(() => {
        if (browser) {
            document.body.classList.remove('map-page-active');
            cleanup();
        }
    });
    
    $effect(() => {
        if (initialized || !browser) return;
        
        debugLog("Map initialization starting, checking dependencies...");
        
        
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
                // After loading world data, explicitly subscribe to world info updates
                if (worldToUse) {
                    subscribeToWorldInfo(worldToUse);
                }
                checkAndInitializeMap();
            } else {
                console.error("Failed to load world data, cannot initialize map");
                error = "Failed to load world data";
                loading = false;
            }
        });

    });

    $effect(() => {
        if ($game?.player?.alive && isTutorialVisible) {
            isTutorialVisible = false;
        }
    });

    $effect(() => {
        if (browser) {
            const handleChatLocationClick = (event) => {
                const { x, y } = event.detail;
                if (typeof x === 'number' && typeof y === 'number') {
                    console.log(`Navigating to chat location: ${x},${y}`);
                    // Remove URL update for chat location clicks
                    moveTarget(x, y, false);
                    
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
        const savedFollow = localStorage.getItem('follow_player_position');
        
        // Set minimap state based on localStorage (default to false if not set)
        showMinimap = savedMinimapState === 'true';
        
        // Set overview/entities state based on localStorage (default to false if not set)
        showEntities = savedOverviewState === 'true'; // Changed to only show if explicitly true

        // Set follow player position state based on localStorage
        if (savedFollow !== null) {
          followPlayerPosition = savedFollow === 'true';
        }

        // First handle achievements since it has higher priority
        if (savedAchievementsState === 'true' && !achievementsClosed) {
          showAchievements = true;
          showChat = false; // Ensure chat is closed if achievements is open
          return; // Exit early to avoid further changes
        }
        
        // If achievements isn't open, then handle chat - Default to false unless explicitly true
        showChat = savedChatState === 'true';
      }
    });

    $effect(() => {
        if ($game?.player?.alive && isTutorialVisible) {
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

    $effect(() => {
      if (!browser || !$ready || !$game.player?.lastLocation) return;
      
      const currentPosition = $game.player.lastLocation;
      
      // Store initial position
      if (!lastKnownPlayerPosition) {
        lastKnownPlayerPosition = {...currentPosition};
        return;
      }
      
      // Check if position actually changed
      if (currentPosition.x !== lastKnownPlayerPosition.x || 
          currentPosition.y !== lastKnownPlayerPosition.y) {
        
        console.log(`Player position changed from (${lastKnownPlayerPosition.x},${lastKnownPlayerPosition.y}) to (${currentPosition.x},${currentPosition.y})`);
        
        // Update the stored position
        lastKnownPlayerPosition = {...currentPosition};
        
        // Only move the map if auto-follow is enabled
        if (followPlayerPosition) {
          console.log('Auto-following player to new location');
          moveTarget(currentPosition.x, currentPosition.y);
        }
      }
    });

    function showModal(options) {
        if (!options) return;
        
        console.log('Opening modal:', options.type, options.data);
        
        // Don't close details panel for inspect, recruitment, or craft modals
        // since these are considered "detail" type views
        if (['mobilise', 'move', 'gather', 'demobilise', 'joinBattle', 'attack', 'build'].includes(options.type)) {
            if (detailed) {
                toggleDetailsModal(false);
            }
        }
        
        lastActivePanel = options.type;
        
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
        const wasDetailed = detailed;
        detailed = show === undefined ? !detailed : show;
        
        // If we're opening the details panel, close any open modals
        if (detailed && !wasDetailed && modalState.visible) {
            closeModal();
        }
        
        // Always update lastActivePanel when opening details
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
            
            // Get player's last location if available
            const playerLocation = $game.player?.lastLocation || null;
            if (playerLocation) {
                debugLog(`Player's last location: ${playerLocation.x},${playerLocation.y}`);
            }
            
            initialize({
                seed: worldData.seed,
                worldId: $game.worldKey,
                initialX,
                initialY,
                playerLocation  // Pass player location to initialize function
            });
            
            loading = false;
        } catch (err) {
            console.error('Error initializing map:', err);
            loading = false;
            error = `Error initializing map: ${err.message}`;
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
        if (isTutorialVisible) isTutorialVisible = false;
        
        // Show achievements panel
        showAchievements = true;
        lastActivePanel = 'achievements';
        
        // Save state to localStorage
        localStorage.removeItem('achievements_closed');
    }

    // Updated to handle Peek actions
    function handleGridClick(coords) {
        if (!$game?.player?.alive) return;

        // Disable auto-follow when clicking on the grid
        if (coords && coords.x !== undefined && coords.y !== undefined &&
            $game.player?.lastLocation &&
            (coords.x !== $game.player.lastLocation.x || coords.y !== $game.player.lastLocation.y)) {
          handleManualPositionChange();
        }

        // Check if this is a path confirmation action
        if (coords && coords.confirmPath === true) {
            confirmPathDrawing(currentPath);
            return;
        }
        
        // Handle undo path action
        if (coords && coords.undoPath === true) {
            undoLastPathPoint();
            return;
        }

        // Check if this is a Peek action
        if (coords && coords.action) {
            // Ensure we're passing the complete data when handling a Peek action
            handlePeekAction(coords.action, coords);
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
            // Always close peek if it's open
            if (peekOpen) {
                console.log('Closing previously open Peek');
                peekOpen = false;
                peekTile = null;
            }
            
            // Always move to the clicked location, regardless of peek state
            moveTarget(coords.x, coords.y, false);
            
            // Find the clicked tile
            const clickedTile = $coordinates.find(
                c => c.x === coords.x && c.y === coords.y
            );
            
            // Only show peek if:
            // 1. The tile has content 
            // 2. We're not in path drawing mode
            // 3. It's not the same tile we just closed peek for
            // 4. It's not the center tile
            if (clickedTile && 
                hasTileContent(clickedTile) && 
                !isPathDrawingMode &&
                (!peekTile || peekTile.x !== clickedTile.x || peekTile.y !== clickedTile.y) &&
                !(clickedTile.x === $map.target.x && clickedTile.y === $map.target.y)) {
                
                setTimeout(() => {
                    peekTile = clickedTile;
                    peekOpen = true;
                }, 50);
            }
        }

        // Reset debounce flag
        setTimeout(() => {
            isProcessingClick = false;
        }, 200); // Reduced from 300ms to 200ms for better responsiveness
    }

    // Add the missing function to handle path points
    function handlePathPoint(point) {
      if (!isPathDrawingMode) {
        console.log('Not in path drawing mode, ignoring point');
        return;
      }
      
      console.log('Page: Adding path point:', point);
      
      // If this is the first point, just add it
      if (currentPath.length === 0) {
        currentPath = [...currentPath, point];
        return;
      }
      
      const lastPoint = currentPath[currentPath.length - 1];
      const dx = Math.abs(point.x - lastPoint.x);
      const dy = Math.abs(point.y - lastPoint.y);
      
      // If points are adjacent, just add the new point
      if (dx <= 1 && dy <= 1) {
        currentPath = [...currentPath, point];
        return;
      }
      
      // For distant points, use Bresenham's line algorithm to interpolate
      console.log('Interpolating path between', lastPoint, 'and', point);
      
      const interpolatedPoints = interpolatePath(lastPoint, point);
      currentPath = [...currentPath, ...interpolatedPoints];
    }

    // Helper function to interpolate points using Bresenham's line algorithm
    function interpolatePath(start, end) {
      const points = [];
      let x = start.x;
      let y = start.y;
      
      const dx = Math.abs(end.x - start.x);
      const dy = Math.abs(end.y - start.y);
      const sx = start.x < end.x ? 1 : -1;
      const sy = start.y < end.y ? 1 : -1;
      let err = dx - dy;
      
      // Skip the first point as it's already in the path
      while (x !== end.x || y !== end.y) {
        const e2 = err * 2;
        
        if (e2 > -dy) {
          err -= dy;
          x += sx;
        }
        
        if (e2 < dx) {
          err += dx;
          y += sy;
        }
        
        // Add intermediate point to the result
        points.push({ x, y });
      }
      
      return points;
    }

    // Add a new function to handle Peek actions
    function handlePeekAction(actionId, actionData) {
      console.log(`Handling peek action: ${actionId}`, actionData);
      
      // If we have actionData containing coordinates and tile data, use it
      if (actionData && actionData.x !== undefined && actionData.y !== undefined) {
        // Set highlighted to the correct tile
        setHighlighted(actionData.x, actionData.y);
        
        // Handle each action type
        switch(actionId) {
          case 'details':
            // Toggle the details panel when "Details" is clicked from Peek
            toggleDetailsModal(true);
            break;
              
          case 'inspect':
            showModal({
              type: 'inspect',
              data: {
                x: actionData.x,
                y: actionData.y,
                tile: actionData.tile
              }
            });
            break;
              
          case 'mobilise':
            showModal({
              type: 'mobilise',
              data: actionData
            });
            break;
              
          case 'move':
            showModal({
              type: 'move',
              data: actionData
            });
            break;
              
          case 'attack':
            showModal({
              type: 'attack',
              data: actionData
            });
            break;
              
          case 'build':
            showModal({
              type: 'build',
              data: actionData
            });
            break;
              
          case 'gather':
            showModal({
              type: 'gather',
              data: actionData
            });
            break;
              
          case 'joinBattle':
            showModal({
              type: 'joinBattle',
              data: actionData
            });
            break;
              
          case 'demobilise':
            showModal({
              type: 'demobilise',
              data: actionData
            });
            break;
              
          case 'craft':
            showModal({
              type: 'craft',
              data: {
                x: actionData.x,
                y: actionData.y,
                structure: actionData.tile.structure,
                tile: actionData.tile
              }
            });
            break;

          case 'recruitment': // Handle recruitment action
            showModal({
              type: 'recruitment',
              data: {
                x: actionData.x,
                y: actionData.y,
                structure: actionData.tile.structure,
                tile: actionData.tile
              }
            });
            break;
              
          default:
            console.warn(`Unknown action type: ${actionId}`);
            break;
        }
      } else {
        console.error("No valid action data for peek action");
      }
    }

    // Add a function to handle removing the last path point
    function undoLastPathPoint() {
        console.log('Undoing last path point');
        if (currentPath.length > 0) {
            // Remove the last point from the path
            currentPath = currentPath.slice(0, -1);
        }
    }

    // Function to start path drawing mode with the selected group
    function startPathDrawing(groupData) {
      console.log('Starting path drawing mode with group:', groupData);
      
      // Store the group we're drawing a path for
      pathDrawingGroup = groupData;
      
      // Reset the current path
      currentPath = [];
      
      // If we have a start point, add it as the first point in the path
      if (groupData?.startPoint) {
        console.log('Adding initial point from group start location:', groupData.startPoint);
        currentPath = [groupData.startPoint];
      }
      
      // Enable path drawing mode
      isPathDrawingMode = true;
    }
    
    // Function to handle cancellation of path drawing
    function handlePathDrawingCancel() {
        console.log('Path drawing cancelled');
        isPathDrawingMode = false;
        pathDrawingGroup = null;
        currentPath = [];
    }
    
    // Function to confirm the path that was drawn
    function confirmPathDrawing(path) {
        if (!pathDrawingGroup || path.length < 2) {
            console.log('Cannot confirm path: missing group data or path too short');
            return;
        }
        
        console.log('Path confirmed:', path);
        console.log('For group:', pathDrawingGroup);
        
        // Exit path drawing mode immediately to improve UX
        isPathDrawingMode = false;
        
        // Get the first and last points of the path
        const startPoint = path[0];
        const endPoint = path[path.length - 1];
        
        // Get the functions instance
        const functions = getFunctions();
        const moveGroupFunction = httpsCallable(functions, 'moveGroup');
        
        // Create a loading modal or some visual indicator
        // You could modify modalState to show a loading state
        modalState = {
            type: 'loading',
            data: { message: 'Sending movement orders...' },
            visible: true
        };
        
        // Call the Firebase function to move the group
        moveGroupFunction({
            groupId: pathDrawingGroup.id,
            fromX: startPoint.x,
            fromY: startPoint.y,
            toX: endPoint.x,
            toY: endPoint.y,
            path: path,  // Send the full path we've drawn
            worldId: $game.worldKey  // Get the current world ID from the game store
        })
        .then((result) => {
            console.log('Group movement initiated successfully:', result.data);
            
            // Show success modal
            modalState = {
                type: 'success',
                data: { 
                    message: 'Movement orders sent!',
                    details: `Your group will move to (${endPoint.x}, ${endPoint.y}) in ${result.data.totalSteps} steps.`
                },
                visible: true
            };
            
            // Close success modal after a delay
            setTimeout(() => {
                closeModal();
            }, 2000);
        })
        .catch((error) => {
            console.error('Error moving group:', error);
            
            // Show error modal
            modalState = {
                type: 'error',
                data: { 
                    message: 'Failed to send movement orders',
                    details: error.message
                },
                visible: true
            };
        })
        .finally(() => {
            // Reset path drawing state
            pathDrawingGroup = null;
            currentPath = [];
        });
    }

    // Add a function to toggle position following
    function toggleFollowPlayerPosition() {
      followPlayerPosition = !followPlayerPosition;
      if (followPlayerPosition && $game.player?.lastLocation) {
        // Immediately move to player's position when re-enabling following
        moveTarget($game.player.lastLocation.x, $game.player.lastLocation.y);
      }
      // Save preference to localStorage
      if (browser) {
        localStorage.setItem('follow_player_position', followPlayerPosition.toString());
      }
    }

    // Simplify to just toggle followPlayerPosition
    function handleManualPositionChange() {
      if (followPlayerPosition) {
        followPlayerPosition = false;
        console.log('Manual position change detected, disabling auto-follow');
      }
    }

    // Add state for showing notices
    let showNotices = $state(true);
</script>

<svelte:window on:keydown={handleKeyDown} />

<div class="map" class:dragging={isDragging} class:path-drawing={isPathDrawingMode} class:spawn-menu-open={!$game?.player?.alive}>
    {#if combinedLoading}
        <div class="loading-overlay">
            <div class="loading-logo">
                <Logo extraClass="animated-logo" />
            </div>
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
            onUndoPoint={undoLastPathPoint}
            customPathPoints={currentPath}
            modalOpen={isAnyModalOpen}
            pathDrawingGroup={pathDrawingGroup}
            onClose={() => {
                if (isPathDrawingMode) handlePathDrawingCancel();
            }}
        />

        {#if $ready}
            <Axes />
        {/if}

        {#if showMinimap}
            <Minimap />
        {/if}
        

        <!-- Controls -->
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
            
            <!-- Show NextWorldTick in map-controls when Overview is open -->
            {#if showEntities && $game?.player?.alive && !isTutorialVisible}
                <NextWorldTick extraClass="control-button-like" compact={window.innerWidth < 768} />
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
        
        {#if $game?.player?.alive && !isTutorialVisible}
            <div class="left-controls">               
                {#if !showEntities}
                    <button 
                        class="control-button entity-button" 
                        onclick={toggleEntities}
                        aria-label="Show entities"
                        disabled={!$game?.player?.alive || isTutorialVisible}>
                        <Spyglass extraClass="button-icon" />
                    </button>
                {/if}

                <button 
                    class="control-button follow-button" 
                    onclick={toggleFollowPlayerPosition}
                    aria-label={followPlayerPosition ? "Stop following player" : "Follow player"}
                    disabled={!$game?.player?.alive || isTutorialVisible}>
                    {#if followPlayerPosition}
                        <BoundIcon extraClass="button-icon" />
                    {:else}
                        <UnboundIcon extraClass="button-icon" />
                    {/if}
                </button>

                <!-- Show NextWorldTick in left-controls when Overview is not open -->
                {#if !showEntities}
                    <NextWorldTick extraClass="control-button-like" compact={window.innerWidth < 768} />
                {/if}
            </div>
        {:else if !showEntities}
            <div class="left-controls">
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

        <AchievementUnlocked />


        <!-- Modals -->

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
            
            <!-- Add Notices component -->
            {#if showNotices && !isTutorialVisible}
                <Notices maxNotices={3} />
            {/if}
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

        {#if detailed && !isTutorialVisible && $game?.player?.alive}
            <Details 
                onClose={() => toggleDetailsModal(false)} 
                onShowModal={showModal} 
                isActive={lastActivePanel === 'details'}
                onMouseEnter={() => handlePanelHover('details')}
            />
        {:else if $ready && !isPathDrawingMode && !isTutorialVisible && !modalState.visible}
            <Legend 
                x={$targetStore.x}  
                y={$targetStore.y}  
                openDetails={() => {
                    setHighlighted($targetStore.x, $targetStore.y);
                    toggleDetailsModal(true);
                }} 
            />
        {/if}

        {#if modalState.visible}
          {#if modalState.type === 'inspect' && modalState.data}
            <StructureOverview 
              x={modalState.data.x}
              y={modalState.data.y}
              tile={modalState.data.tile}
              onClose={closeModal}
              onAchievement={savePlayerAchievement}
              onShowModal={showModal}
              isActive={lastActivePanel === modalState.type}
              onMouseEnter={() => handlePanelHover(modalState.type)}
            />
          {:else if modalState.type === 'mobilise'}
            <Mobilise 
              onClose={closeModal}
              isActive={lastActivePanel === modalState.type}
              onMouseEnter={() => handlePanelHover(modalState.type)}
            />
          {:else if modalState.type === 'craft' && modalState.data}
            <Crafting
              structure={modalState.data.structure}
              x={modalState.data.x}
              y={modalState.data.y}
              onClose={closeModal}
              onCraftStart={savePlayerAchievement}
              isActive={lastActivePanel === modalState.type}
              onMouseEnter={() => handlePanelHover(modalState.type)}
            />
          {:else if modalState.type === 'build' && modalState.data}
            <Build 
              x={modalState.data.x}
              y={modalState.data.y}
              tile={modalState.data.tile}
              onClose={closeModal}
              isActive={lastActivePanel === modalState.type}
              onMouseEnter={() => handlePanelHover(modalState.type)}
            />
          {:else if modalState.type === 'move' && modalState.data}
            <Move
              x={modalState.data.x}
              y={modalState.data.y}
              tile={modalState.data.tile}
              onStartPathDrawing={startPathDrawing}
              onClose={closeModal}
              isActive={lastActivePanel === modalState.type}
              onMouseEnter={() => handlePanelHover(modalState.type)}
            />
          {:else if modalState.type === 'attack' && modalState.data}
            <Attack
              x={modalState.data.x}
              y={modalState.data.y}
              tile={modalState.data.tile} 
              onClose={closeModal}
              isActive={lastActivePanel === modalState.type}
              onMouseEnter={() => handlePanelHover(modalState.type)}
            />
          {:else if modalState.type === 'joinBattle' && modalState.data}
            <JoinBattle
              x={modalState.data.x}
              y={modalState.data.y}
              tile={modalState.data.tile}
              onClose={closeModal}
              isActive={lastActivePanel === modalState.type}
              onMouseEnter={() => handlePanelHover(modalState.type)}
            />
          {:else if modalState.type === 'gather' && modalState.data}
            <Gather
              x={modalState.data.x}
              y={modalState.data.y}
              tile={modalState.data.tile}
              onClose={closeModal}
              isActive={lastActivePanel === modalState.type}
              onMouseEnter={() => handlePanelHover(modalState.type)}
            />
          {:else if modalState.type === 'demobilise' && modalState.data}
            <Demobilise
              x={modalState.data.x}
              y={modalState.data.y}
              tile={modalState.data.tile}
              onClose={closeModal}
              isActive={lastActivePanel === modalState.type}
              onMouseEnter={() => handlePanelHover(modalState.type)}
            />
          {:else if modalState.type === 'recruitment' && modalState.data}
            <Recruitment
              structure={modalState.data.structure}
              x={modalState.data.x}
              y={modalState.data.y}
              onClose={closeModal}
              onRecruitStart={savePlayerAchievement}
              isActive={lastActivePanel === modalState.type}
              onMouseEnter={() => handlePanelHover(modalState.type)}
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
    
    .loading-logo {
        width: 5em;
        height: 5em;
        margin-bottom: 1rem;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    :global(.animated-logo) {
        width: 100%;
        height: 100%;
        animation: pulse 1.5s ease-in-out infinite;
    }
    
    @keyframes pulse {
        0% {
            opacity: 0.6;
            transform: scale(0.95);
        }
        50% {
            opacity: 1;
            transform: scale(1.05);
        }
        100% {
            opacity: 0.6;
            transform: scale(0.95);
        }
    }

    .loading-message {
        font-size: 1.1em;
        text-align: center;
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
    
    .left-controls {
        position: absolute;
        bottom: 2em;
        left: 3em;
        z-index: 998;
        display: flex;
        flex-direction: row;
        gap: 0.5em;
        align-items: center;
    }

    .controls-right {
        position: fixed;
        bottom: 2em;
        right: 3em;
        z-index: 1001;
        display: flex;
        gap: 0.5em;
    }
    
    .controls-middle-right {
        position: fixed;
        right: 1em;
        top: 44%;
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

    .help-button {
        font-family: var(--font-heading);
        font-weight: 700;
        padding: 0;
        width: 2em;
        height: 2em;
    }
</style>