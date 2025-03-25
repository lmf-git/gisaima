<script>
  // Optional imports if you need them
  import { onMount } from 'svelte';
  
  // State for active section
  let activeSection = $state('getting-started');
  
  function scrollToSection(sectionId) {
    activeSection = sectionId;
    const section = document.getElementById(sectionId);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
    }
  }
  
  onMount(() => {
    // Intersection observer to update active section based on scrolling
    const sections = document.querySelectorAll('.guide-section');
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          activeSection = entry.target.id;
        }
      });
    }, { threshold: 0.6 });
    
    sections.forEach(section => observer.observe(section));
    
    return () => {
      sections.forEach(section => observer.unobserve(section));
    };
  });
</script>

<svelte:head>
  <title>Gisaima - Game Guide</title>
  <meta name="description" content="Learn how to play Gisaima, a strategic territory control game with procedurally generated worlds, dynamic terrain, and multiplayer interactions." />
</svelte:head>

<div class="guide-container">
  <aside class="sidebar">
    <nav class="toc">
      <h2>Guide Contents</h2>
      <ul>
        <li>
          <button 
            class:active={activeSection === 'getting-started'}
            onclick={() => scrollToSection('getting-started')}
          >
            Getting Started
          </button>
        </li>
        <li>
          <button 
            class:active={activeSection === 'map-exploration'}
            onclick={() => scrollToSection('map-exploration')}
          >
            Map Exploration
          </button>
        </li>
        <li>
          <button 
            class:active={activeSection === 'terrain-biomes'}
            onclick={() => scrollToSection('terrain-biomes')}
          >
            Terrain & Biomes
          </button>
        </li>
        <li>
          <button 
            class:active={activeSection === 'structures'}
            onclick={() => scrollToSection('structures')}
          >
            Structures
          </button>
        </li>
        <li>
          <button 
            class:active={activeSection === 'units-groups'}
            onclick={() => scrollToSection('units-groups')}
          >
            Units & Groups
          </button>
        </li>
        <li>
          <button 
            class:active={activeSection === 'player-interaction'}
            onclick={() => scrollToSection('player-interaction')}
          >
            Player Interaction
          </button>
        </li>
        <li>
          <button 
            class:active={activeSection === 'strategy-tips'}
            onclick={() => scrollToSection('strategy-tips')}
          >
            Strategy Tips
          </button>
        </li>
        <li>
          <button 
            class:active={activeSection === 'faq'}
            onclick={() => scrollToSection('faq')}
          >
            FAQ
          </button>
        </li>
      </ul>
    </nav>
  </aside>

  <main class="guide-content">
    <h1>Gisaima Game Guide</h1>
    
    <section id="getting-started" class="guide-section">
      <h2>Getting Started</h2>
      <p>
        Welcome to Gisaima! This guide will help you learn the basics of gameplay and 
        strategy to get started on your journey of territorial conquest in our 
        procedurally generated worlds.
      </p>
      <h3>Creating an Account</h3>
      <p>
        To begin playing Gisaima, you'll need to create an account. Click the "Sign Up" button 
        in the top navigation bar and follow the instructions to create your account. You can also play as a guest,
        but your progress won't be saved between sessions.
      </p>
      <h3>Joining a World</h3>
      <p>
        After logging in, navigate to the "Worlds" page where you can browse available worlds
        or create your own. Each world has unique properties and terrain generated using a specific seed.
        Your position within each world is automatically saved and will be restored when you return.
      </p>
      <h3>Basic Controls</h3>

      <ul class="controls-list">
        <li><strong>WASD</strong> or <strong>Arrow Keys</strong>: Navigate around the map</li>
        <li><strong>Mouse Drag</strong>: Click and drag to move the map view</li>
        <li><strong>Click</strong> on a tile: Move to that location</li>
        <li><strong>Hover</strong> over a tile: View details about that location</li>
      </ul>

    </section>

    <section id="map-exploration" class="guide-section">
      <h2>Map Exploration</h2>
      <p>
        Gisaima features an infinite, procedurally generated world divided into a grid system.
        Exploration is a key aspect of gameplay and reveals new opportunities.
      </p>
      <h3>The Grid System</h3>
      <p>
        The world is divided into a coordinate grid, with each tile representing a unique location (x,y).
        The map is organized into "chunks" for efficient loading and processing. As you explore,
        new areas are revealed and loaded dynamically.
      </p>
      <h3>Navigation Tools</h3>

        <ul>
          <li><strong>Minimap View</strong>: Toggle between detailed and expanded views</li>
          <li><strong>Coordinates</strong>: Each tile displays its coordinates for precise navigation</li>
          <li><strong>URL Sharing</strong>: The URL updates with your current coordinates, making it easy to share locations</li>
          <li><strong>Map Entities Panel</strong>: View a list of all structures, players, and unit groups in the vicinity</li>
        </ul>

      <h3>Highlighted Tiles</h3>
      <p>
        When you hover over a tile, it becomes highlighted and the Details panel shows information 
        about that specific location. This allows you to scout areas before committing to move there.
      </p>
    </section>

    <section id="terrain-biomes" class="guide-section">
      <h2>Terrain & Biomes</h2>
      <p>
        The world of Gisaima contains diverse terrain types and biomes, each with unique properties
        that affect gameplay, resource generation, and strategic value.
      </p>
      <h3>Biome Types</h3>
      <p>
        Different biomes are visually distinguished by their colors on the map. Each biome has 
        different resource yields and strategic advantages:
      </p>
      <ul>
        <li><strong>Plains</strong>: Balanced terrain suitable for most activities</li>
        <li><strong>Mountains</strong>: Difficult terrain with valuable resources</li>
        <li><strong>Forests</strong>: Rich in natural resources, good for concealment</li>
        <li><strong>Water</strong>: Provides naval advantages but limits construction</li>
        <li><strong>Desert</strong>: Harsh conditions with unique resources</li>
      </ul>
      <h3>Terrain Rarity</h3>
      <p>
        Terrain is classified by rarity levels which indicate its value and resource potential:
      </p>
        <ul class="rarity-list">
          <li><span class="rarity-tag common">Common</span>: Standard terrain with basic resources</li>
          <li><span class="rarity-tag uncommon">Uncommon</span>: Better than average resources</li>
          <li><span class="rarity-tag rare">Rare</span>: Valuable resource-rich terrain</li>
          <li><span class="rarity-tag epic">Epic</span>: Highly valuable with strategic advantages</li>
          <li><span class="rarity-tag legendary">Legendary</span>: Exceptionally rare with premium resources</li>
          <li><span class="rarity-tag mythic">Mythic</span>: The most valuable terrain with unique properties</li>
        </ul>
      <p>
        Rare terrain types are highlighted on the map with a special glow effect proportional to their rarity.
      </p>
    </section>

    <section id="structures" class="guide-section">
      <h2>Structures</h2>
      <p>
        Structures form the backbone of your territorial presence, providing resources, defensive capabilities, 
        and other strategic advantages.
      </p>
      <h3>Types of Structures</h3>
        <ul>
          <li><strong>Spawn Points</strong> (🔵): Your starting location and respawn point if defeated</li>
          <li><strong>Watchtowers</strong> (🗼): Provide visibility over surrounding areas</li>
          <li><strong>Fortresses</strong> (🏰): Strong defensive positions that protect territory</li>
          <li><strong>Other Structures</strong> (🏛️): Various specialized buildings with unique functions</li>
        </ul>
      <h3>Building and Maintenance</h3>
      <p>
        Structures require resources to build and maintain. The structure details panel shows 
        health, level, resource requirements, and other critical information. Strategic placement 
        of structures is essential for efficient territory control.
      </p>
    </section>

    <section id="units-groups" class="guide-section">
      <h2>Units & Groups</h2>
      <p>
        Units are the mobile forces that allow you to expand territory, engage in combat, and gather resources.
        Units are organized into groups for easier management.
      </p>
      <h3>Unit Groups</h3>
      <p>
        Groups are collections of units that move and act together. The group system allows efficient 
        management of your forces across the map. Groups are represented by circular indicators on the map,
        with numbers showing the quantity of groups in a location.
      </p>
      <h3>Movement and Actions</h3>
      <p>
        Unit groups can be directed to:
      </p>
        <ul>
          <li>Move to new locations</li>
          <li>Gather resources from terrain</li>
          <li>Attack enemy units or structures</li>
          <li>Defend your territory</li>
          <li>Construct new buildings</li>
        </ul>
        <p>
        The effectiveness of these actions depends on terrain, unit types, and other factors.
      </p>
      <h3>Combat</h3>
      <p>
        When unit groups engage in combat, multiple factors influence the outcome:
      </p>
        <ul>
          <li>Unit quantity and quality</li>
          <li>Terrain advantages</li>
          <li>Strategic positioning</li>
          <li>Support from nearby structures</li>
        </ul>
    </section>

    <section id="player-interaction" class="guide-section">
      <h2>Player Interaction</h2>
      <p>
        Gisaima is an MMO where player interaction forms a core part of the experience.
        Understanding how to interact with other players is crucial for success.
      </p>
      <h3>Players on the Map</h3>
      <p>
        Other players are represented on the map with blue circular indicators. Your own
        position is marked with a gold highlight. The map entities panel shows all players
        in the vicinity and their distance from your current location.
      </p>
      <h3>Alliances and Diplomacy</h3>
      <p>
        Forming alliances with other players can provide mutual benefits through:
      </p>
        <ul>
          <li>Shared defense of territories</li>
          <li>Coordinated attacks against common enemies</li>
          <li>Resource trading and economic cooperation</li>
          <li>Knowledge sharing about valuable terrain locations</li>
        </ul>
      <h3>Territory Control</h3>
      <p>
        Competition for territory is a central aspect of player interaction. Control valuable
        areas by establishing structures, maintaining unit presence, and defending against
        rival players seeking to expand their influence.
      </p>
    </section>

    <section id="strategy-tips" class="guide-section">
      <h2>Strategy Tips</h2>
      <p>
        Here are some key strategies to help you dominate in Gisaima:
      </p>
      <ul class="strategy-list">
        <li>
          <strong>Focus on Rare Terrain:</strong> Prioritize locating and controlling rare and mythic 
          terrain tiles as they provide the most valuable resources.
        </li>
        <li>
          <strong>Secure Resources Early:</strong> Focus on capturing resource-rich territories
          early in the game to fuel your expansion.
        </li>
        <li>
          <strong>Defensive Network:</strong> Place watchtowers and fortresses strategically to create
          a defensive network that protects your key resource areas.
        </li>
        <li>
          <strong>Alliance Building:</strong> Form strategic alliances with other players to
          counter dominant forces on the map.
        </li>
        <li>
          <strong>Balance Expansion:</strong> Don't overextend your territory beyond what you
          can effectively defend with your available units.
        </li>
        <li>
          <strong>Map Awareness:</strong> Use the map entities panel to track nearby structures, 
          players, and unit groups for better strategic planning.
        </li>
      </ul>
    </section>

    <section id="faq" class="guide-section">
      <h2>Frequently Asked Questions</h2>
      <div class="faq-item">
        <h3>How do I identify my current position on the map?</h3>
        <p>
          Your current position is marked with a gold highlight and centered in the view.
          The coordinates are displayed in the details panel and in the URL.
        </p>
      </div>
      <div class="faq-item">
        <h3>What happens if I lose all my territory?</h3>
        <p>
          If you lose all your territory, you'll need to restart your empire from your spawn point.
          The game offers "rebirth" mechanics to help players who have been eliminated.
        </p>
      </div>
      <div class="faq-item">
        <h3>How do I find rare terrain types?</h3>
        <p>
          Rare terrain is visually distinct with a special glow effect. The color and intensity of the
          glow indicates the rarity level. Extensive exploration is the key to finding the most valuable terrain.
        </p>
      </div>
      <div class="faq-item">
        <h3>How does the chunk loading system work?</h3>
        <p>
          The world is divided into "chunks" that are loaded dynamically as you explore. This system
          ensures efficient performance while exploring an effectively infinite world.
        </p>
      </div>
      <div class="faq-item">
        <h3>Can I bookmark specific locations?</h3>
        <p>
          Yes! The URL automatically updates with your current coordinates. Simply bookmark the page
          to save important locations for later reference.
        </p>
      </div>
      <div class="faq-item">
        <h3>How often are new worlds created?</h3>
        <p>
          New worlds are generated regularly to provide fresh experiences. Check the Worlds page
          for announcements of new world openings.
        </p>
      </div>
      <div class="faq-item">
        <h3>Is there a way to change my player name?</h3>
        <p>
          Yes, you can update your display name in your account settings.
        </p>
      </div>
    </section>
  </main>
</div>

<style>
  .guide-container {
    display: flex;
    flex-direction: column;
    max-width: 1200px;
    margin: 7em auto 2em;
    padding: 0 1em;
    color: var(--color-text);
  }
  
  .sidebar {
    width: 100%;
    margin-bottom: 2em;
    position: relative;
  }
  
  .toc {
    background-color: var(--color-panel-bg);
    padding: 1.5em;
    border-radius: 0.5em;
    border: 1px solid var(--color-panel-border);
    box-shadow: 0 0.25em 0.5em var(--color-shadow);
  }
  
  .toc h2 {
    color: var(--color-pale-green);
    margin-bottom: 1em;
    font-family: var(--font-heading);
    font-weight: 400;
    font-size: 1.5em;
  }
  
  .toc ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  .toc li {
    margin-bottom: 0.5em;
  }
  
  .toc button {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    font-size: 1em;
    cursor: pointer;
    padding: 0.5em;
    width: 100%;
    text-align: left;
    border-radius: 0.25em;
    transition: all 0.2s ease;
    font-family: var(--font-body);
  }
  
  .toc button:hover {
    color: var(--color-pale-green);
    background-color: rgba(100, 255, 218, 0.05);
  }
  
  .toc button.active {
    color: var(--color-pale-green);
    background-color: rgba(100, 255, 218, 0.1);
  }
  
  .guide-content {
    flex: 1;
  }
  
  .guide-content h1 {
    font-size: 2.5em;
    color: var(--color-pale-green);
    margin-bottom: 1em;
    text-align: center;
    font-family: var(--font-heading);
    font-weight: 400;
  }
  
  .guide-section {
    margin-bottom: 3em;
    padding: 1em;
    background-color: var(--color-panel-bg);
    border-radius: 0.5em;
    border: 1px solid var(--color-panel-border);
  }
  
  .guide-section h2 {
    font-size: 1.8em;
    color: var(--color-pale-green);
    margin-bottom: 0.5em;
    font-family: var(--font-heading);
    font-weight: 400;
  }
  
  .guide-section h3 {
    font-size: 1.4em;
    color: var(--color-muted-teal);
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    font-family: var(--font-heading);
    font-weight: 400;
  }
  
  .guide-section p {
    margin-bottom: 1.2em;
    line-height: 1.6;
    font-family: var(--font-body);
  }
  
  .strategy-list, .controls-list {
    padding-left: 1.5em;
    line-height: 1.6;
  }
  
  .strategy-list li, .controls-list li {
    margin-bottom: 1em;
  }
  
  .controls-list {
    list-style-type: none;
    padding-left: 0.5em;
  }
  
  .faq-item {
    margin-bottom: 1.5em;
  }
  
  .faq-item h3 {
    font-size: 1.2em;
    color: var(--color-pale-green);
  }
  
  /* Rarity tags styling */
  .rarity-list {
    list-style-type: none;
    padding-left: 0.5em;
  }
  
  .rarity-list li {
    margin-bottom: 0.5em;
    display: flex;
    align-items: center;
  }
  
  .rarity-tag {
    display: inline-block;
    padding: 0.2em 0.5em;
    border-radius: 0.3em;
    margin-right: 0.8em;
    font-weight: bold;
    font-size: 0.9em;
  }
  
  .common {
    color: #AAAAAA;
    background: rgba(170, 170, 170, 0.1);
    border: 1px solid rgba(170, 170, 170, 0.3);
  }
  
  .uncommon {
    color: #228B22;
    background: rgba(30, 255, 0, 0.15);
    border: 1px solid rgba(30, 255, 0, 0.3);
  }
  
  .rare {
    color: #0070DD;
    background: rgba(0, 112, 221, 0.15);
    border: 1px solid rgba(0, 112, 221, 0.3);
  }
  
  .epic {
    color: #9400D3;
    background: rgba(148, 0, 211, 0.15);
    border: 1px solid rgba(148, 0, 211, 0.3);
  }
  
  .legendary {
    color: #FF8C00;
    background: rgba(255, 165, 0, 0.15);
    border: 1px solid rgba(255, 165, 0, 0.3);
  }
  
  .mythic {
    color: #FF1493;
    background: rgba(255, 128, 255, 0.15);
    border: 1px solid rgba(255, 128, 255, 0.3);
  }
  
  @media (min-width: 768px) {
    .guide-container {
      flex-direction: row;
      gap: 2em;
      padding: 0 2em;
    }
    
    .sidebar {
      flex: 0 0 25%;
      margin-bottom: 0;
    }
    
    .toc {
      position: sticky;
      top: 7em;
    }
    
    .guide-content {
      flex: 0 0 75%;
    }
  }
  
  @media (min-width: 1024px) {
    .guide-container {
      padding: 0 3em;
    }
    
    .sidebar {
      flex: 0 0 20%;
    }
    
    .guide-content {
      flex: 0 0 80%;
    }
  }
</style>
