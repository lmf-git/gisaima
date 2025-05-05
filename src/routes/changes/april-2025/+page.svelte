<script>
  // Change categories with their items
  const changeCategories = [
    {
      title: "Combat & Battles",
      changes: [
        "Implemented progressive battle resolution over multiple ticks (small battles: 1-3 ticks, large battles: 6-12+ ticks)",
        "Created battle casualty calculations based on relative power of each side with detailed reporting",
        "Added fleeing system allowing groups to escape battles after the next tick is processed",
        "Implemented joining ongoing battles with reinforcements on either side",
        "Created automatic item distribution among victorious groups after battles",
        "Added battle indicators for structures under attack with durability system",
        "Fixed monster groups to properly engage in combat with player groups and structures",
        "Added battle power calculations for more accurate combat outcomes",
        "Improved battle feedback with detailed casualty reporting in both Details and Overview panels",
        "Added notifications for battle events in chat interface with player deaths and battle starts",
        "Enhanced battle information display in Details and Overview panels showing units and casualties",
        "Implemented functionality for attacking structures with damage indicators"
      ]
    },
    {
      title: "Unit Groups & Movement",
      changes: [
        "Added intuitive movement path visualization with optimized waypoints",
        "Implemented mobilise/demobilise system for creating and disbanding unit groups",
        "Created path drawing controls with PLOT YOUR JOURNEY interface and compass icon",
        "Added ability to cancel pending movements",
        "Implemented map following for player movement for better navigation",
        "Fixed unit movement across negative coordinates",
        "Enhanced monster group behaviors with merging and strategic movement",
        "Added status indicators showing group states (moving, fighting, gathering, mobilising, demobilising)",
        "Made movement paths draw from nearest corner for more natural path visualization",
        "Optimized path points for shorter routes during movement planning",
        "Added chat notifications for group movement and actions",
        "Improved group naming with automatic player force names",
        "Added You-Are-Here indicator that shows player location even when in a moving group",
        "Enhanced movement animations with smooth transitions on grid tiles"
      ]
    },
    {
      title: "Structures & Building",
      changes: [
        "Added comprehensive structure building and upgrading system using shared resources",
        "Implemented tick-based building progression",
        "Created structure durability system for battles with damage indicators",
        "Added recruitment system for adding units based on player race",
        "Created StructureOverview interface for inspecting buildings and items",
        "Added structure names visible on grid tiles",
        "Implemented subdivided structure visualization for larger buildings",
        "Created building ownership validation to prevent actions on buildings you don't own",
        "Added structure upgrade buttons with clear resource requirements",
        "Implemented race-specific structure interactions and limitations",
        "Fixed structure name placement on grid tiles",
        "Added structure battle status indicators showing when structures are under attack"
      ]
    },
    {
      title: "User Interface",
      changes: [
        "Added race icons throughout the interface for all races (Humans, Elves, Dwarves, Goblins, Fairies)",
        "Created new Peek action menu for quick access to all tile actions",
        "Improved Details panel with terrain information, biome color indicators, and action buttons",
        "Enhanced Overview panel with collapsible sections and consistent styling",
        "Added world tick countdown indicator showing time until next game cycle",
        "Fixed mobile interface issues including scrolling and zooming",
        "Improved map entity indicators with consistent colors across panels",
        "Created chat interface with message notifications and display names",
        "Implemented achievements system with unlock notifications",
        "Added escape key functionality to close various UI elements",
        "Created collapsible tutorial sections for better mobile experience",
        "Enhanced zoom functionality with debounced recalculations to prevent lag",
        "Added ability to hide legend on mobile devices",
        "Improved contrast on all modal interfaces",
        "Enhanced consistency of entity indicators across all panels and the grid"
      ]
    },
    {
      title: "Economy & Items",
      changes: [
        "Added crafting system with recipes and required resources",
        "Implemented storage system for items at structures with separate bank and shared access",
        "Created item transfer system between groups and structures",
        "Added resource gathering with 2-tick countdown timers",
        "Implemented tick-based crafting progression",
        "Enhanced item management when demobilizing groups with improved UI",
        "Added context-sensitive crafting based on structure building levels",
        "Improved item distribution after successful battles",
        "Created item visibility in map entities and details panels",
        "Fixed combining identical items when demobilizing to structures",
        "Added dedicated bank storage at structures for private items",
        "Created shared storage areas for collaborative resource management",
        "Implemented crafting UI with clear resource requirements"
      ]
    },
    {
      title: "World Generation & Environment",
      changes: [
        "Added rivers with improved generation algorithms",
        "Rebalanced water features with thinner streams and larger oceans",
        "Enhanced biome transitions with fixed terrain and moisture reference system",
        "Added water cutting through continents for more realistic geography",
        "Fixed structure name placement on grid tiles",
        "Improved tile transition animations based on distance from center",
        "Enhanced world center persistence for more reliable map loading",
        "Added terrain color indicators in tile details for better identification",
        "Implemented target tile persistence with local storage",
        "Added race-specific spawn points with proper coordinate selection",
        "Fixed deep ocean generation to create larger water bodies",
        "Implemented improved terrain loading performance for better map exploration",
        "Added tile rarity indicators in terrain details"
      ]
    },
    {
      title: "Game Systems",
      changes: [
        "Implemented tick-based world processing for moves, battles, gathering, and building",
        "Added world speed settings displayed on world cards",
        "Created race selection system with race-specific advantages",
        "Implemented player display names throughout the interface",
        "Added automatic monster spawning relatively near player positions",
        "Created monster strategies for movement, merging, and structure interaction",
        "Added achievements system with various unlock conditions",
        "Improved map loading performance with query coordinates",
        "Implemented a You-Are-Here indicator that respects group membership",
        "Created multiple spawn points for each race with appropriate placement",
        "Added Firebase integration for real-time updates and persistence",
        "Implemented world joining system with race selection",
        "Added temporary account warning with email upgrade option",
        "Created chat system with notifications for game events",
        "Added achievement notification system"
      ]
    },
    {
      title: "Mobile Experience",
      changes: [
        "Created manifest for adding game as mobile app with icons",
        "Improved mobile menu functionality with automatic closing when links clicked",
        "Enhanced mobile styles for header and layout",
        "Fixed mobile scrolling and zooming issues",
        "Optimized tutorial for mobile devices with collapsible sections",
        "Added proper padding and spacing for mobile forms",
        "Fixed media playback on iOS Safari",
        "Improved responsive design throughout the application",
        "Enhanced touch interactions for map navigation",
        "Fixed layout shifting issues on mobile devices"
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
  </div>

  <div class="update-content">
    {#each changeCategories as category}
      <div class="category">
        <h2>{category.title}</h2>
        <ul class="changes-list">
          {#each category.changes as change}
            <li>{change}</li>
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
