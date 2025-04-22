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

  // Import race icons
  import Human from '$components/icons/Human.svelte';
  import Elf from '$components/icons/Elf.svelte';
  import Dwarf from '$components/icons/Dwarf.svelte';
  import Goblin from '$components/icons/Goblin.svelte';
  import Fairy from '$components/icons/Fairy.svelte';
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
        <li>
          <button 
            class:active={activeSection === 'game-mechanics'}
            onclick={() => scrollToSection('game-mechanics')}
          >
            Game Mechanics
          </button>
        </li>
        <li>
          <button 
            class:active={activeSection === 'races'}
            onclick={() => scrollToSection('races')}
          >
            Races
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

    <section id="races" class="guide-section">
      <h2>Races</h2>
      <p>
        When joining a world in Gisaima, you'll choose one of five distinct races. 
        Each race has unique traits and advantages that influence your gameplay strategy.
      </p>
      
      <div class="race-grid">
        <div class="race-card">
          <div class="race-header">
            <div class="race-icon">
              <Human size="2.5em" extraClass="race-icon-guide human-icon" />
            </div>
            <h3>Humans</h3>
          </div>
          <p class="race-desc">Versatile and adaptable, humans excel at diplomacy and trade.</p>
          <div class="race-traits">
            <span class="race-trait">Diplomatic</span>
            <span class="race-trait">Fast Learners</span>
            <span class="race-trait">Resource Efficient</span>
          </div>
          <p class="race-tip">
            <strong>Best For:</strong> New players and those who prefer balanced gameplay with 
            flexibility to adapt to different situations.
          </p>
        </div>

        <div class="race-card">
          <div class="race-header">
            <div class="race-icon">
              <Elf size="2.5em" extraClass="race-icon-guide elf-icon" />
            </div>
            <h3>Elves</h3>
          </div>
          <p class="race-desc">Ancient forest dwellers with deep connections to nature and magic.</p>
          <div class="race-traits">
            <span class="race-trait">Magical Affinity</span>
            <span class="race-trait">Forest Advantage</span>
            <span class="race-trait">Long-range Combat</span>
          </div>
          <p class="race-tip">
            <strong>Best For:</strong> Players who prefer ranged combat and excel in 
            forest environments with magical advantage.
          </p>
        </div>

        <div class="race-card">
          <div class="race-header">
            <div class="race-icon">
              <Dwarf size="2.5em" extraClass="race-icon-guide dwarf-icon" />
            </div>
            <h3>Dwarves</h3>
          </div>
          <p class="race-desc">Sturdy mountain folk, master craftsmen and miners.</p>
          <div class="race-traits">
            <span class="race-trait">Mining Bonus</span>
            <span class="race-trait">Strong Defense</span>
            <span class="race-trait">Mountain Advantage</span>
          </div>
          <p class="race-tip">
            <strong>Best For:</strong> Players focused on resource gathering and 
            defensive strategies in mountainous regions.
          </p>
        </div>

        <div class="race-card">
          <div class="race-header">
            <div class="race-icon">
              <Goblin size="2.5em" extraClass="race-icon-guide goblin-icon" />
            </div>
            <h3>Goblins</h3>
          </div>
          <p class="race-desc">Cunning and numerous, goblins thrive in harsh environments.</p>
          <div class="race-traits">
            <span class="race-trait">Fast Production</span>
            <span class="race-trait">Night Advantage</span>
            <span class="race-trait">Scavenging Bonus</span>
          </div>
          <p class="race-tip">
            <strong>Best For:</strong> Players who enjoy aggressive expansion and 
            quick production with night operations.
          </p>
        </div>

        <div class="race-card">
          <div class="race-header">
            <div class="race-icon">
              <Fairy size="2.5em" extraClass="race-icon-guide fairy-icon" />
            </div>
            <h3>Fairies</h3>
          </div>
          <p class="race-desc">Magical beings with flight capabilities and illusion powers.</p>
          <div class="race-traits">
            <span class="race-trait">Flight</span>
            <span class="race-trait">Illusion Magic</span>
            <span class="race-trait">Small Size Advantage</span>
          </div>
          <p class="race-tip">
            <strong>Best For:</strong> Players who prefer stealth, mobility, and 
            deception over direct confrontation.
          </p>
        </div>
      </div>
      
      <p>
        Once you've chosen a race, you'll start at your race's specific spawn point in the world. 
        Each race's spawn is located in a biome that complements their natural advantages.
      </p>
    </section>

    <section id="game-mechanics" class="guide-section">
      <h2>Game Mechanics</h2>
      <p>
        Gisaima uses several core mechanics that drive gameplay. Understanding these systems 
        is essential for effective strategy.
      </p>
      
      <h3>Tick-Based Gameplay</h3>
      <p>
        The game world operates on a "tick" system - regular time intervals when various actions 
        are processed. World speeds can vary, affecting how frequently ticks occur:
      </p>
      <ul>
        <li>Standard worlds: 1x speed (ticks every minute)</li>
        <li>Fast worlds: Higher speeds mean more frequent ticks</li>
        <li>The time until the next tick is displayed in the interface</li>
      </ul>
      
      <h3>Group Management</h3>
      <p>
        Managing your units through the group system is essential for effective gameplay:
      </p>
      
      <h4>Mobilization & Demobilization</h4>
      <p>
        <strong>Mobilization</strong> allows a player to form their individual units into an organized group:
      </p>
      <ul>
        <li>Creating a group takes one tick cycle to complete</li>
        <li>Mobilized groups can move, gather resources, and engage in battles</li>
        <li>Groups have greater strategic flexibility than individual units</li>
      </ul>
      <p>
        <strong>Demobilization</strong> is the opposite process, disbanding a group back into individual units:
      </p>
      <ul>
        <li>Useful when you want to separate from your group</li>
        <li>Takes one tick cycle to complete</li>
        <li>Allows units to act independently again</li>
      </ul>
      
      <h4>Movement System</h4>
      <p>
        Groups can be directed to move across the map:
      </p>
      <ul>
        <li>Movement occurs in steps, with each step taking one tick</li>
        <li>You can plot complex paths with multiple waypoints</li>
        <li>Different terrain types may affect movement speed</li>
      </ul>
      
      <h3>Resource Gathering</h3>
      <p>
        Gathering resources is crucial for building and upgrading:
      </p>
      <ul>
        <li>Groups can gather resources from terrain and special resource nodes</li>
        <li>Gathering takes time, with progress tracked across ticks</li>
        <li>Different terrain types yield different resources</li>
        <li>Rarer terrain produces more valuable resources</li>
        <li>Gathered resources can be stored in your inventory or at structures</li>
      </ul>
      
      <h3>Battle System</h3>
      <p>
        Battles in Gisaima occur when hostile groups encounter each other:
      </p>
      
      <h4>Starting an Attack</h4>
      <p>
        You can initiate battles with enemy groups at your current location:
      </p>
      <ol>
        <li>Select one or more of your groups to participate in the attack</li>
        <li>Select one or more enemy groups as your targets</li>
        <li>Review the battle preview showing the relative strength of both sides</li>
        <li>Confirm the attack, which creates a battle at that location</li>
      </ol>
      <p>
        When a battle is initiated, it becomes accessible to other players who can choose to
        join either side with their own groups.
      </p>
      
      <h4>Joining a Battle</h4>
      <p>
        You can join ongoing battles in your current location:
      </p>
      <ol>
        <li>Select one of your groups to join the battle</li>
        <li>Choose which battle to join if multiple are occurring</li>
        <li>Select which side you want to support (Side 1 or Side 2)</li>
        <li>Your group will join the selected side, adding its strength to that faction</li>
      </ol>
      
      <p>
        Battles involve two opposing sides:
      </p>
      <ul>
        <li>Each side can contain multiple groups from different players</li>
        <li>The total power of each side is calculated based on unit quantity and quality</li>
        <li>Battles progress over time, with resolution occurring on a tick</li>
        <li>Victory is determined by many factors including total power, terrain advantages, and tactics</li>
        <li>Winners may claim resources, territory, or other rewards</li>
      </ul>
      
      <h4>Battle Outcomes</h4>
      <p>
        When a battle concludes:
      </p>
      <ul>
        <li>Victorious units may capture items from defeated enemies</li>
        <li>Defeated units may be lost or reduced in number</li>
        <li>Territory control may shift based on battle outcome</li>
        <li>Strategic resources or structures may change ownership</li>
      </ul>
      
      <div class="tip-box">
        <h4>Strategic Tip</h4>
        <p>
          Use battles strategically by considering terrain advantages and forming 
          alliances with other players. Sometimes joining an ongoing battle on the
          winning side is more advantageous than starting your own!
        </p>
      </div>
      
      <h3>Items and Inventory</h3>
      <p>
        Items come in various types and rarity levels:
      </p>
      <ul class="rarity-list">
        <li><span class="rarity-tag common">Common</span> Basic resources and items</li>
        <li><span class="rarity-tag uncommon">Uncommon</span> Enhanced items with slight advantages</li>
        <li><span class="rarity-tag rare">Rare</span> Valuable items with significant benefits</li>
        <li><span class="rarity-tag epic">Epic</span> Powerful items that can change gameplay</li>
        <li><span class="rarity-tag legendary">Legendary</span> Extremely rare items with major advantages</li>
        <li><span class="rarity-tag mythic">Mythic</span> The rarest and most powerful items</li>
      </ul>
      <p>
        Items can be carried by groups, stored at structures, or used for various purposes including
        crafting, building, and enhancing abilities.
      </p>
      
      <h3>Advanced Structure Features</h3>
      <p>
        Structures can have special features that provide unique advantages:
      </p>
      <ul>
        <li><strong>Banks:</strong> Store items safely at some structures</li>
        <li><strong>Specialized Facilities:</strong> Some structures contain facilities like forges or breweries</li>
        <li><strong>Resource Production:</strong> Certain structures may produce resources over time</li>
        <li><strong>Strategic Bonuses:</strong> Structures can provide defensive or offensive bonuses</li>
      </ul>
    </section>
  </main>
</div>

<style>
  /* Base container styling similar to Overview and Details */
  .guide-container {
    display: flex;
    flex-direction: column;
    max-width: 1200px;
    margin: 7em auto 2em;
    padding: 0 1em;
    color: var(--color-text);
  }
  
  /* Sidebar styling - make it match Details panel */
  .sidebar {
    width: 100%;
    margin-bottom: 2em;
    position: relative;
  }
  
  .toc {
    background-color: rgba(255, 255, 255, 0.85);
    padding: 1.5em;
    border-radius: 0.5em;
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
  }
  
  .toc h2 {
    color: rgba(0, 0, 0, 0.8);
    margin-bottom: 1em;
    font-family: var(--font-heading);
    font-weight: 600;
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
    color: rgba(0, 0, 0, 0.7);
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
    background-color: rgba(0, 0, 0, 0.05);
    color: rgba(0, 0, 0, 0.9);
  }
  
  .toc button.active {
    background-color: rgba(66, 133, 244, 0.1);
    color: rgba(66, 133, 244, 0.9);
  }
  
  /* Guide content styling - match Details panel */
  .guide-content {
    flex: 1;
  }
  
  .guide-content h1 {
    font-size: 2.5em;
    color: rgba(0, 0, 0, 0.8);
    margin-bottom: 1em;
    text-align: center;
    font-family: var(--font-heading);
    font-weight: 600;
  }
  
  /* Section styling similar to Details panel */
  .guide-section {
    margin-bottom: 3em;
    padding: 1em;
    background-color: rgba(255, 255, 255, 0.85);
    border-radius: 0.5em;
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    color: rgba(0, 0, 0, 0.8);
  }
  
  .guide-section h2 {
    font-size: 1.8em;
    color: rgba(0, 0, 0, 0.8);
    margin-bottom: 0.8em;
    font-family: var(--font-heading);
    font-weight: 600;
  }
  
  .guide-section h3 {
    font-size: 1.4em;
    color: rgba(0, 0, 0, 0.7);
    margin-top: 1.5em;
    margin-bottom: 0.8em;
    font-family: var(--font-heading);
    font-weight: 600;
  }

  .guide-section h4 {
    font-size: 1.2em;
    color: rgba(0, 0, 0, 0.7);
    margin-top: 1.2em;
    margin-bottom: 0.6em;
    font-family: var(--font-heading);
    font-weight: 500;
  }
  
  .guide-section p {
    margin-bottom: 1.2em;
    line-height: 1.6;
    font-family: var(--font-body);
    color: rgba(0, 0, 0, 0.8);
  }
  
  /* List styling to match Details */
  .guide-section ul {
    list-style-position: inside;
    padding-left: 0;
    margin: 1em 0;
  }

  .guide-section li {
    margin-bottom: 0.5em;
    line-height: 1.6;
    color: rgba(0, 0, 0, 0.8);
  }

  .strategy-list, .controls-list {
    padding-left: 0;
    list-style-type: none;
  }

  .guide-section ol {
    list-style-position: inside;
    padding-left: 0;
    margin: 1em 0;
  }

  .guide-section ol li {
    margin-bottom: 0.5em;
    line-height: 1.6;
  }
  
  /* FAQ section styling */
  .faq-item {
    background-color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.5em;
    padding: 1em;
    margin-bottom: 1em;
    transition: background-color 0.2s ease;
  }
  
  .faq-item:hover {
    background-color: rgba(255, 255, 255, 0.8);
  }
  
  .faq-item h3 {
    color: rgba(0, 0, 0, 0.85);
    margin-top: 0;
    font-size: 1.2em;
  }
  
  .faq-item p {
    margin: 0.5em 0 0;
  }
  
  /* Race icon styling with :global selector */
  :global(.race-icon-guide) {
    width: 2.5em;
    height: 2.5em;
    opacity: 0.9;
    fill: rgba(0, 0, 0, 0.7);
  }
  
  :global(.race-icon-guide.human-icon) {
    fill: #8B4513; /* Brown for humans */
  }
  
  :global(.race-icon-guide.elf-icon) {
    fill: #228B22; /* Forest green for elves */
  }
  
  :global(.race-icon-guide.dwarf-icon) {
    fill: #696969; /* Stone gray for dwarves */
  }
  
  :global(.race-icon-guide.goblin-icon) {
    fill: #6B8E23; /* Olive green for goblins */
  }
  
  :global(.race-icon-guide.fairy-icon) {
    fill: #9370DB; /* Medium purple for fairies */
  }
  
  /* Race section styles */
  .race-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5em;
    margin: 2em 0;
  }
  
  .race-card {
    background-color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.5em;
    padding: 1.2em;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  
  .race-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
  }
  
  .race-header {
    display: flex;
    align-items: center;
    margin-bottom: 0.8em;
  }
  
  .race-icon {
    margin-right: 1em;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .race-card h3 {
    margin: 0;
    color: rgba(0, 0, 0, 0.8);
    font-weight: 600;
  }
  
  .race-desc {
    margin: 0.5em 0 1em;
    line-height: 1.4;
  }
  
  .race-traits {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
    margin-bottom: 1em;
  }
  
  .race-trait {
    background: rgba(66, 133, 244, 0.1);
    color: rgba(66, 133, 244, 0.9);
    padding: 0.3em 0.8em;
    border-radius: 1em;
    font-size: 0.9em;
    border: 1px solid rgba(66, 133, 244, 0.3);
  }
  
  .race-tip {
    font-size: 0.95em;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
    padding-top: 0.8em;
    margin: 0;
  }
  
  /* Rarity tags styling - use specific colors from Details */
  .rarity-list {
    list-style-type: none !important;
    padding-left: 0 !important;
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
    background-color: rgba(158, 158, 158, 0.2);
    color: #616161;
    border: 1px solid rgba(158, 158, 158, 0.4);
  }
  
  .uncommon {
    background-color: rgba(76, 175, 80, 0.2);
    color: #2e7d32;
    border: 1px solid rgba(76, 175, 80, 0.4);
  }
  
  .rare {
    background-color: rgba(33, 150, 243, 0.2);
    color: #0277bd;
    border: 1px solid rgba(33, 150, 243, 0.4);
  }
  
  .epic {
    background-color: rgba(156, 39, 176, 0.2);
    color: #7b1fa2;
    border: 1px solid rgba(156, 39, 176, 0.4);
  }
  
  .legendary {
    background-color: rgba(255, 152, 0, 0.2);
    color: #ef6c00;
    border: 1px solid rgba(255, 152, 0, 0.4);
  }
  
  .mythic {
    background-color: rgba(233, 30, 99, 0.2);
    color: #c2185b;
    border: 1px solid rgba(233, 30, 99, 0.4);
  }
  
  /* Tip box styling similar to Details panel */
  .tip-box {
    background: rgba(66, 133, 244, 0.05);
    border-left: 3px solid rgba(66, 133, 244, 0.5);
    padding: 1em 1.5em;
    margin: 1.5em 0;
    border-radius: 0 0.3em 0.3em 0;
  }
  
  .tip-box h4 {
    color: rgba(66, 133, 244, 0.9);
    margin-top: 0;
    margin-bottom: 0.5em;
  }
  
  .tip-box p {
    margin: 0;
    color: rgba(0, 0, 0, 0.8);
  }

  /* Strong tag styling */
  .guide-section strong {
    color: rgba(0, 0, 0, 0.85);
    font-weight: 600;
  }
  
  /* Responsive layout */
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
    
    .race-grid {
      grid-template-columns: 1fr 1fr;
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
  
  @media (min-width: 1200px) {
    .race-grid {
      grid-template-columns: 1fr 1fr 1fr;
    }
  }
</style>
