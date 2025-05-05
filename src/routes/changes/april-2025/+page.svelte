<script>
  // Change categories with their items
  const changeCategories = [
    {
      title: "Combat & Battles",
      changes: [
        { text: "Implemented progressive battle resolution over multiple ticks (small battles: 1-3 ticks, large battles: 6-12+ ticks)", link: { section: "battles", label: "Learn more" } },
        { text: "Created battle casualty calculations based on relative power of each side with detailed reporting", link: { section: "battles", label: "Learn more" } },
        { text: "Added fleeing system allowing groups to escape battles after the next tick is processed" },
        { text: "Implemented joining ongoing battles with reinforcements on either side", link: { section: "game-mechanics", label: "Learn more" } },
        { text: "Created automatic item distribution among victorious groups after battles", link: { section: "battles", label: "Learn more" } },
        { text: "Added battle indicators for structures under attack with durability system" },
        { text: "Fixed monster groups to properly engage in combat with player groups and structures" },
        { text: "Added battle power calculations for more accurate combat outcomes" },
        { text: "Improved battle feedback with detailed casualty reporting in both Details and Overview panels" },
        { text: "Added notifications for battle events in chat interface with player deaths and battle starts" },
        { text: "Enhanced battle information display in Details and Overview panels showing units and casualties" },
        { text: "Implemented functionality for attacking structures with damage indicators", link: { section: "battles", label: "Learn more" } },
        { text: "Added colored indicators for battle status in entity lists and grid" },
        { text: "Created consistent status styling for groups in combat across all panels" },
        { text: "Added player death and respawn system when killed in battle", link: { section: "character-development", label: "Learn more" } },
        { text: "Implemented structure damage indicators showing health percentage during attacks" }
      ]
    },
    {
      title: "Unit Groups & Movement",
      changes: [
        { text: "Added intuitive movement path visualization with optimized waypoints" },
        { text: "Implemented mobilise/demobilise system for creating and disbanding unit groups", link: { section: "units-groups", label: "Learn more" } },
        { text: "Created path drawing controls with PLOT YOUR JOURNEY interface and compass icon" },
        { text: "Added ability to cancel pending movements" },
        { text: "Implemented map following for player movement for better navigation", link: { section: "map-exploration", label: "Learn more" } },
        { text: "Fixed unit movement across negative coordinates" },
        { text: "Enhanced monster group behaviors with merging and strategic movement" },
        { text: "Added status indicators showing group states (moving, fighting, gathering, mobilising, demobilising)", link: { section: "units-groups", label: "Learn more" } },
        { text: "Made movement paths draw from nearest corner for more natural path visualization" },
        { text: "Optimized path points for shorter routes during movement planning" },
        { text: "Added chat notifications for group movement and actions" },
        { text: "Improved group naming with automatic player force names" },
        { text: "Added You-Are-Here indicator that shows player location even when in a moving group", link: { section: "map-exploration", label: "Learn more" } },
        { text: "Enhanced movement animations with smooth transitions on grid tiles" },
        { text: "Added ability to cancel gathering actions" },
        { text: "Implemented drag functionality for map navigation while in path drawing mode" },
        { text: "Created monster group strategic behavior that targets nearby structures" },
        { text: "Added notifications in chat for movement completion" }
      ]
    },
    {
      title: "Structures & Building",
      changes: [
        { text: "Added comprehensive structure building and upgrading system using shared resources", link: { section: "structures", label: "Learn more" } },
        { text: "Implemented tick-based building progression" },
        { text: "Created structure durability system for battles with damage indicators" },
        { text: "Added recruitment system for adding units based on player race", link: { section: "races", label: "Learn more" } },
        { text: "Created StructureOverview interface for inspecting buildings and items" },
        { text: "Added structure names visible on grid tiles" },
        { text: "Implemented subdivided structure visualization for larger buildings" },
        { text: "Created building ownership validation to prevent actions on buildings you don't own" },
        { text: "Added structure upgrade buttons with clear resource requirements" },
        { text: "Implemented race-specific structure interactions and limitations", link: { section: "races", label: "Learn more" } },
        { text: "Fixed structure name placement on grid tiles" },
        { text: "Added structure battle status indicators showing when structures are under attack" },
        { text: "Created system for structures to show their building levels and upgrade paths" },
        { text: "Added race-specific recruitment restrictions for proper unit composition" },
        { text: "Implemented building levels that affect available crafting recipes", link: { section: "structures", label: "Learn more" } },
        { text: "Created distinct structure visuals for different races" }
      ]
    },
    {
      title: "User Interface",
      changes: [
        { text: "Added race icons throughout the interface for all races (Humans, Elves, Dwarves, Goblins, Fairies)", link: { section: "races", label: "Learn more" } },
        { text: "Created new Peek action menu for quick access to all tile actions" },
        { text: "Improved Details panel with terrain information, biome color indicators, and action buttons" },
        { text: "Enhanced Overview panel with collapsible sections and consistent styling" },
        { text: "Added world tick countdown indicator showing time until next game cycle", link: { section: "game-mechanics", label: "Learn more" } },
        { text: "Fixed mobile interface issues including scrolling and zooming" },
        { text: "Improved map entity indicators with consistent colors across panels" },
        { text: "Created chat interface with message notifications and display names", link: { section: "community-politics", label: "Learn more" } },
        { text: "Implemented achievements system with unlock notifications" },
        { text: "Added escape key functionality to close various UI elements" },
        { text: "Created collapsible tutorial sections for better mobile experience" },
        { text: "Enhanced zoom functionality with debounced recalculations to prevent lag" },
        { text: "Added ability to hide legend on mobile devices" },
        { text: "Improved contrast on all modal interfaces" },
        { text: "Enhanced consistency of entity indicators across all panels and the grid" },
        { text: "Created context menu system for quick actions" },
        { text: "Added achievements panel with unlocked and locked achievements display" },
        { text: "Implemented sorting of player-owned groups and entities to the top of lists" },
        { text: "Added map controls with return/recenter map function to quickly navigate to spawn points" },
        { text: "Improved modal z-index management for better UI layering when multiple components are open" },
        { text: "Enhanced notification system for unread chat messages" },
        { text: "Added hover states for collapsible section headers" }
      ]
    },
    {
      title: "Economy & Items",
      changes: [
        { text: "Added crafting system with recipes and required resources", link: { section: "activities", label: "Learn more" } },
        { text: "Implemented storage system for items at structures with separate bank and shared access", link: { section: "items-inventory", label: "Learn more" } },
        { text: "Created item transfer system between groups and structures" },
        { text: "Added resource gathering with 2-tick countdown timers", link: { section: "activities", label: "Learn more" } },
        { text: "Implemented tick-based crafting progression" },
        { text: "Enhanced item management when demobilizing groups with improved UI" },
        { text: "Added context-sensitive crafting based on structure building levels" },
        { text: "Improved item distribution after successful battles", link: { section: "battles", label: "Learn more" } },
        { text: "Created item visibility in map entities and details panels" },
        { text: "Fixed combining identical items when demobilizing to structures" },
        { text: "Added dedicated bank storage at structures for private items", link: { section: "trade-economy", label: "Learn more" } },
        { text: "Created shared storage areas for collaborative resource management" },
        { text: "Implemented crafting UI with clear resource requirements" },
        { text: "Developed resource-based recruitment system tied to structure levels" },
        { text: "Created gather action available on all tiles with appropriate resources", link: { section: "activities", label: "Learn more" } },
        { text: "Added ability to combine identical items in structure storage" },
        { text: "Enhanced crafting with location-specific recipes depending on available structures" }
      ]
    },
    {
      title: "World Generation & Environment",
      changes: [
        { text: "Added rivers with improved generation algorithms" },
        { text: "Rebalanced water features with thinner streams and larger oceans" },
        { text: "Enhanced biome transitions with fixed terrain and moisture reference system", link: { section: "terrain-biomes", label: "Learn more" } },
        { text: "Added water cutting through continents for more realistic geography" },
        { text: "Fixed structure name placement on grid tiles" },
        { text: "Improved tile transition animations based on distance from center" },
        { text: "Enhanced world center persistence for more reliable map loading" },
        { text: "Added terrain color indicators in tile details for better identification", link: { section: "terrain-biomes", label: "Learn more" } },
        { text: "Implemented target tile persistence with local storage" },
        { text: "Added race-specific spawn points with proper coordinate selection", link: { section: "races", label: "Learn more" } },
        { text: "Fixed deep ocean generation to create larger water bodies" },
        { text: "Implemented improved terrain loading performance for better map exploration" },
        { text: "Added tile rarity indicators in terrain details", link: { section: "terrain-biomes", label: "Learn more" } },
        { text: "Created race-specific starting areas with appropriate terrain for each race" },
        { text: "Improved transition animations for revealing grid tiles based on distance from center" }
      ]
    },
    {
      title: "Game Systems",
      changes: [
        { text: "Implemented tick-based world processing for moves, battles, gathering, and building", link: { section: "game-mechanics", label: "Learn more" } },
        { text: "Added world speed settings displayed on world cards" },
        { text: "Created race selection system with race-specific advantages", link: { section: "races", label: "Learn more" } },
        { text: "Implemented player display names throughout the interface" },
        { text: "Added automatic monster spawning relatively near player positions" },
        { text: "Created monster strategies for movement, merging, and structure interaction" },
        { text: "Added achievements system with various unlock conditions" },
        { text: "Improved map loading performance with query coordinates" },
        { text: "Implemented a You-Are-Here indicator that respects group membership" },
        { text: "Created multiple spawn points for each race with appropriate placement" },
        { text: "Added Firebase integration for real-time updates and persistence" },
        { text: "Implemented world joining system with race selection" },
        { text: "Added temporary account warning with email upgrade option" },
        { text: "Created chat system with notifications for game events", link: { section: "communication-social", label: "Learn more" } },
        { text: "Added achievement notification system" },
        { text: "Implemented player death and respawn system", link: { section: "character-development", label: "Learn more" } },
        { text: "Created dynamic monster group behavior that targets structures and merges with other monster groups" },
        { text: "Added automatic notification system for important game events in chat" },
        { text: "Enhanced player progression with achievement unlocks for key actions" },
        { text: "Added monster group strategic AI that attacks structures and groups" }
      ]
    },
    {
      title: "Communication & Social",
      changes: [
        { text: "Implemented chat system with unread message indicators", link: { section: "communication-social", label: "Learn more" } },
        { text: "Added automatic notifications for key game events in chat" },
        { text: "Created player display names for improved social interaction", link: { section: "community-politics", label: "Learn more" } },
        { text: "Added achievement announcements in chat feed" },
        { text: "Implemented battle event reporting in chat with casualty details" },
        { text: "Added movement notifications in chat when groups complete journeys" },
        { text: "Created building completion notifications in chat" },
        { text: "Added system messages for important game events" },
        { text: "Implemented chat message persistence across sessions" },
        { text: "Created visual unread message indicators" }
      ]
    },
    {
      title: "Mobile Experience",
      changes: [
        { text: "Created manifest for adding game as mobile app with icons" },
        { text: "Improved mobile menu functionality with automatic closing when links clicked" },
        { text: "Enhanced mobile styles for header and layout" },
        { text: "Fixed mobile scrolling and zooming issues" },
        { text: "Optimized tutorial for mobile devices with collapsible sections" },
        { text: "Added proper padding and spacing for mobile forms" },
        { text: "Fixed media playback on iOS Safari" },
        { text: "Improved responsive design throughout the application" },
        { text: "Enhanced touch interactions for map navigation" },
        { text: "Fixed layout shifting issues on mobile devices" },
        { text: "Improved UI element placement for smaller screens" },
        { text: "Optimized modal sizes and positions for mobile devices" },
        { text: "Added ability to hide legend on mobile for better screen space utilization" },
        { text: "Improved drag functionality on mobile devices" }
      ]
    }
  ];
</script>

<svelte:head>
  <title>Gisaima - April 2025 Update Notes</title>
  <meta name="description" content="April 2025 update brings major improvements to world generation, battle systems, economy, and user interface in Gisaima." />
</svelte:head>

<div class="update-container">
  <div class="header">
    <a href="/changes" class="back-link">← All Updates</a>
    <h1>April 2025 Update</h1>
    <div class="release-info">
      <span class="release-date">Released on April 15, 2025</span>
      <span class="version">v1.2.0</span>
    </div>
    <p class="update-summary">
      This major update focuses on enhancing the world generation system, improving battle mechanics, 
      expanding economic options, and refining the user interface.
    </p>
    
    <div class="guide-info">
      <span class="info-icon">ℹ️</span>
      <span>Items with <a href="/guide" class="guide-link">Learn more</a> links will take you to relevant sections of our game guide for detailed information.</span>
    </div>
  </div>

  <div class="update-content">
    {#each changeCategories as category}
      <div class="category">
        <h2>{category.title}</h2>
        <ul class="changes-list">
          {#each category.changes as change}
            <li>
              {change.text}
              {#if change.link}
                <a href="/guide#{change.link.section}" class="guide-link">{change.link.label}</a>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/each}

    <div class="additional-notes">
      <h2>Additional Notes</h2>
      <p>
        This update also includes numerous bug fixes, performance optimizations, and quality-of-life 
        improvements. We've addressed over 50 reported issues and improved server stability during peak usage periods.
      </p>
      <p>
        Thank you for your continued support and feedback that helps make Gisaima better with each update!
      </p>
    </div>

    <div class="feedback-section">
      <h3>Share Your Thoughts</h3>
      <p>
        Have feedback about this update? Join us on 
        <a href="https://discord.gg/ugmRXWNXbA" target="_blank" rel="noopener noreferrer">Discord</a> 
        to discuss with developers and the community.
      </p>
    </div>
  </div>
</div>

<style>
  .update-container {
    max-width: 900px;
    margin: 7em auto 4em;
    padding: 0 1.5em;
  }

  .header {
    margin-bottom: 3em;
  }

  .back-link {
    display: inline-block;
    color: var(--color-bright-accent);
    text-decoration: none;
    margin-bottom: 1em;
    font-weight: 500;
    transition: color 0.2s ease;
  }

  .back-link:hover {
    color: var(--color-text-primary);
  }

  h1 {
    font-family: var(--font-heading);
    font-size: 3em;
    color: var(--color-heading);
    margin-bottom: 0.3em;
    font-weight: 500;
  }

  .release-info {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5em;
    margin-bottom: 1.5em;
    color: var(--color-text-secondary);
  }

  .release-date, .version {
    font-size: 0.95em;
  }

  .version {
    background: rgba(100, 255, 218, 0.1);
    color: var(--color-bright-accent);
    padding: 0.2em 0.8em;
    border-radius: 2em;
    font-weight: 500;
  }

  .update-summary {
    font-size: 1.2em;
    line-height: 1.6;
    color: var(--color-text-secondary);
    max-width: 800px;
  }
  
  .guide-info {
    display: flex;
    align-items: center;
    background: rgba(100, 255, 218, 0.05);
    border: 1px solid rgba(100, 255, 218, 0.2);
    border-radius: 0.5em;
    padding: 0.8em 1em;
    margin-top: 1.5em;
    font-size: 0.9em;
    color: var(--color-text-secondary);
  }
  
  .info-icon {
    font-size: 1.2em;
    margin-right: 0.8em;
  }
  
  .guide-link {
    display: inline-flex;
    align-items: center;
    color: var(--color-bright-accent);
    font-size: 0.85em;
    text-decoration: none;
    padding: 0.1em 0.6em;
    border-radius: 0.3em;
    background: rgba(100, 255, 218, 0.1);
    transition: all 0.2s ease;
    margin-left: 0.5em;
    font-weight: 500;
  }
  
  .guide-link:before {
    content: "📚";
    margin-right: 0.3em;
    font-size: 0.9em;
  }
  
  .guide-link:hover {
    background: rgba(100, 255, 218, 0.2);
    color: var(--color-text-primary);
    transform: translateY(-1px);
  }

  .category {
    margin-bottom: 3em;
    background: rgba(17, 34, 64, 0.6);
    border: 1px solid var(--color-panel-border);
    border-radius: 0.5em;
    padding: 2em;
    box-shadow: 0 0.3em 1em rgba(0, 0, 0, 0.15);
  }

  h2 {
    font-family: var(--font-heading);
    font-size: 1.6em;
    color: var(--color-text-primary);
    margin-bottom: 1em;
    font-weight: 500;
  }

  .changes-list {
    padding-left: 1.5em;
  }

  .changes-list li {
    margin-bottom: 1em;
    line-height: 1.5;
    position: relative;
  }

  .changes-list li:before {
    content: "•";
    color: var(--color-bright-accent);
    font-weight: bold;
    display: inline-block;
    width: 1em;
    margin-left: -1em;
    position: absolute;
  }

  .additional-notes {
    background: rgba(17, 34, 64, 0.6);
    border: 1px solid var(--color-panel-border);
    border-radius: 0.5em;
    padding: 2em;
    margin-bottom: 3em;
  }

  .additional-notes p {
    margin-bottom: 1em;
    line-height: 1.6;
    color: var(--color-text-secondary);
  }

  .feedback-section {
    text-align: center;
    margin-top: 4em;
    padding: 2em;
    border-top: 1px solid var(--color-panel-border);
  }

  .feedback-section h3 {
    color: var(--color-text-primary);
    font-family: var(--font-heading);
    font-size: 1.4em;
    margin-bottom: 0.8em;
  }

  .feedback-section p {
    color: var(--color-text-secondary);
    max-width: 600px;
    margin: 0 auto;
    line-height: 1.6;
  }

  .feedback-section a {
    color: var(--color-bright-accent);
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .feedback-section a:hover {
    color: var(--color-text-primary);
    text-decoration: underline;
  }

  @media (max-width: 768px) {
    h1 {
      font-size: 2.3em;
    }

    .category {
      padding: 1.5em;
    }
  }
</style>
