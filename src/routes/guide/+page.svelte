<script>
  // Optional imports if you need them
  import { onMount } from 'svelte';
  
  // Import game definition files
  import UNITS from "gisaima-shared/definitions/UNITS.js";
  import { ITEMS, ITEM_CATEGORIES } from "gisaima-shared/definitions/ITEMS.js";
  import { STRUCTURES, STRUCTURE_TYPES } from "gisaima-shared/definitions/STRUCTURES.js";
  import { BUILDINGS } from "gisaima-shared/definitions/BUILDINGS.js";
  
  // State for active section
  let activeSection = $state('getting-started');
  
  function scrollToSection(sectionId) {
    activeSection = sectionId;
    const section = document.getElementById(sectionId);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
    }
  }
  
  // Helper functions for processing game data
  
  // Process structures data
  function getStructureExamples(count = 3) {
    return Object.entries(STRUCTURES)
      .filter(([_, structure]) => !structure.monster) // Filter out monster structures for player guide
      .slice(0, count)
      .map(([id, structure]) => ({
        id,
        name: structure.name,
        description: structure.description,
        type: structure.type,
        icon: getStructureIcon(structure.type),
        subtitle: getStructureCategory(structure.type),
        durability: structure.durability,
        capacity: structure.capacity,
        sightRange: structure.sightRange,
        resources: structure.requiredResources || [],
        features: structure.features || []
      }));
  }
  
  function getStructureIcon(type) {
    const icons = {
      'watchtower': '🏰',
      'storage': '📦',
      'workshop': '🔨',
      'outpost': '🏕️',
      'basic_shelter': '🏠',
      'fortress': '🏰'
    };
    return icons[type] || '🏛️';
  }
  
  function getStructureCategory(type) {
    const categories = {
      'watchtower': 'Defensive Structure',
      'storage': 'Utility Structure',
      'workshop': 'Production Structure',
      'outpost': 'Expansion Structure',
      'basic_shelter': 'Basic Structure',
      'fortress': 'Military Structure'
    };
    return categories[type] || 'Building';
  }
  
  // Process unit data
  function getUnitExamples(count = 3) {
    // Get player units, not monster units
    return Object.entries(UNITS)
      .filter(([_, unit]) => unit.category === 'player' && unit.type !== 'player')
      .sort((a, b) => {
        // Sort by basic units first, then by race
        if (a[1].requirements?.structureLevel !== b[1].requirements?.structureLevel) {
          return (a[1].requirements?.structureLevel || 0) - (b[1].requirements?.structureLevel || 0);
        }
        return (a[1].power || 0) - (b[1].power || 0);
      })
      .slice(0, count)
      .map(([id, unit]) => ({
        id,
        name: unit.name,
        description: unit.description || `A ${unit.type} unit`,
        subtitle: getUnitCategory(unit),
        icon: getUnitIconEmoji(unit),
        power: unit.power,
        time: unit.timePerUnit,
        cost: unit.cost || {},
        requirements: unit.requirements || {},
        tooltip: unit.recruitment?.tooltip || "",
        race: unit.race
      }));
  }
  
  function getUnitCategory(unit) {
    if (!unit.type) return "Military Unit";
    
    const typeMap = {
      'warrior': 'Military Unit',
      'scout': 'Scout Unit',
      'archer': 'Ranged Unit',
      'knight': 'Elite Unit',
      'defender': 'Defensive Unit',
      'raider': 'Fast Attack Unit',
      'enchanter': 'Magic Unit',
      'support': 'Support Unit',
      'elite': 'Elite Unit',
      'siege': 'Siege Unit',
      'worker': 'Worker Unit',
      'gatherer': 'Gathering Unit'
    };
    
    return typeMap[unit.type] || "Military Unit";
  }
  
  function getUnitIconEmoji(unit) {
    if (!unit.icon && !unit.type) return "⚔️";
    
    const iconMap = {
      'sword': '⚔️',
      'bow': '🏹',
      'shield': '🛡️',
      'axe': '🪓',
      'dagger': '🗡️',
      'blades': '⚔️',
      'eye': '👁️',
      'wing': '🧚',
      'thorn': '🌵',
      'hammer': '🔨',
      'pick': '⛏️',
      'cross': '➕',
      'staff': '🪄',
      'gear': '⚙️',
      'boots': '👢',
      'pickaxe': '⛏️'
    };
    
    return iconMap[unit.icon] || "⚔️";
  }
  
  // Process building data
  function getBuildingExamples(count = 3) {
    return Object.entries(BUILDINGS.types)
      .filter(([_, building]) => !building.monster) // Filter out monster buildings
      .slice(0, count)
      .map(([id, building]) => {
        // Get benefits for level 2 and 3
        const level2Benefits = BUILDINGS.benefits[id]?.[2] || [];
        const level3Benefits = BUILDINGS.benefits[id]?.[3] || [];
        
        return {
          id,
          name: building.name,
          description: building.description,
          icon: building.icon,
          subtitle: getBuildingCategory(id),
          resources: building.baseRequirements || [],
          benefits: {
            level2: level2Benefits,
            level3: level3Benefits
          }
        };
      });
  }
  
  function getBuildingCategory(type) {
    const categories = {
      'smithy': 'Production Building',
      'barracks': 'Military Building',
      'mine': 'Resource Building',
      'wall': 'Defensive Building',
      'academy': 'Research Building',
      'market': 'Economy Building',
      'farm': 'Resource Building'
    };
    return categories[type] || "Utility Building";
  }
  
  // Process item data
  function getItemExamples() {
    const examples = [];
    
    // Get one common resource
    const commonResource = Object.entries(ITEMS)
      .find(([_, item]) => item.type === 'resource' && item.rarity === 'common');
    
    if (commonResource) {
      examples.push({
        id: commonResource[0],
        ...commonResource[1],
        subtitle: "Common Resource"
      });
    }
    
    // Get one uncommon weapon with recipe
    const craftedWeapon = Object.entries(ITEMS)
      .find(([_, item]) => item.type === 'weapon' && item.recipe && item.rarity === 'uncommon');
    
    if (craftedWeapon) {
      examples.push({
        id: craftedWeapon[0],
        ...craftedWeapon[1],
        subtitle: "Uncommon Weapon"
      });
    }
    
    // Get one rare gem
    const rareGem = Object.entries(ITEMS)
      .find(([_, item]) => item.type === 'gem' && item.rarity === 'rare');
    
    if (rareGem) {
      examples.push({
        id: rareGem[0],
        ...rareGem[1],
        subtitle: "Rare Gem"
      });
    }
    
    return examples;
  }
  
  // Prepare examples for each category
  const structureExamples = getStructureExamples();
  const unitExamples = getUnitExamples();
  const buildingExamples = getBuildingExamples();
  const itemExamples = getItemExamples();

  onMount(() => {
    // Check for URL hash on page load and set active section
    if (window.location.hash) {
      const sectionId = window.location.hash.substring(1); // Remove the # character
      const section = document.getElementById(sectionId);
      if (section) {
        activeSection = sectionId;
        section.scrollIntoView({ behavior: 'smooth' });
      }
    }
    
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

  import Elf from '../../components/icons/Elf.svelte';
  import Dwarf from '../../components/icons/Dwarf.svelte';
  import Goblin from '../../components/icons/Goblin.svelte';
  import Fairy from '../../components/icons/Fairy.svelte';
  import Human from '../../components/icons/Human.svelte';
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
            Map & Exploration
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
            class:active={activeSection === 'units-groups'}
            onclick={() => scrollToSection('units-groups')}
          >
            Units & Groups
          </button>
        </li>
        <li>
          <button 
            class:active={activeSection === 'structures'}
            onclick={() => scrollToSection('structures')}
          >
            Structures & Building
          </button>
        </li>
        <li>
          <button 
            class:active={activeSection === 'activities'}
            onclick={() => scrollToSection('activities')}
          >
            Activities
          </button>
        </li>
        <li>
          <button 
            class:active={activeSection === 'battles'}
            onclick={() => scrollToSection('battles')}
          >
            Battles & Combat
          </button>
        </li>
        <li>
          <button 
            class:active={activeSection === 'trade-economy'}
            onclick={() => scrollToSection('trade-economy')}
          >
            Trade & Economy
          </button>
        </li>
        <li>
          <button 
            class:active={activeSection === 'character-development'}
            onclick={() => scrollToSection('character-development')}
          >
            Character Development
          </button>
        </li>
        <li>
          <button 
            class:active={activeSection === 'community-politics'}
            onclick={() => scrollToSection('community-politics')}
          >
            Community & Politics
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
        <li>
          <button 
            class:active={activeSection === 'items-inventory'}
            onclick={() => scrollToSection('items-inventory')}
          >
            Items & Inventory
          </button>
        </li>
        <li>
          <button 
            class:active={activeSection === 'morality-system'}
            onclick={() => scrollToSection('morality-system')}
          >
            Morality System
          </button>
        </li>
        <li>
          <button 
            class:active={activeSection === 'reports-rankings'}
            onclick={() => scrollToSection('reports-rankings')}
          >
            Reports & Rankings
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
    
    <!-- Keep existing sections -->
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

      <h3>Map Interface & Features</h3>
      <p>
        The map is one of the core mechanics of Gisaima. Understanding how to effectively use it is crucial.
      </p>
      <ul>
        <li>Move via map by clicking or using controls</li>
        <li>When reloading the map, you'll return to your last viewed location</li>
        <li>Information buttons provide details about locations and entities</li>
        <li>Minimap helps you maintain overall positional awareness</li>
      </ul>
      
      <h3>Visibility & Knowledge</h3>
      <p>
        Vision and knowledge of the map changes based on distance:
      </p>
      <ul>
        <li>At longer distances, scouts only know something is present</li>
        <li>At medium distances, scouts can identify what is present</li>
        <li>At close distances, scouts can determine where entities are moving</li>
        <li>Actions that draw attention (especially negative ones) increase your visibility to others</li>
      </ul>
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
      <h3>Geography & Terrain Effects</h3>
      <p>
        Different biomes affect gameplay in various ways:
      </p>
      <ul>
        <li><strong>Plains:</strong> Offer faster movement but less cover</li>
        <li><strong>Mountains:</strong> Slow movement but provide defensive advantages and valuable resources</li>
        <li><strong>Forests:</strong> Moderate movement with good resource gathering and some concealment</li>
        <li><strong>Water:</strong> Requires ships or special abilities to cross, but enables naval advantages</li>
        <li><strong>Desert:</strong> Challenging environment with unique but sparse resources</li>
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

      <!-- Dynamic structure display using actual game data -->
      <div class="info-box">
        <h4>Structure Types Overview</h4>
        <p>Structures vary in purpose, cost, and strategic value. Here are some examples:</p>

        <div class="element-grid structure-grid">
          {#each structureExamples as structure}
            <div class="element-card">
              <div class="element-header">
                <div class="element-icon">{structure.icon}</div>
                <div class="element-title">
                  <h5>{structure.name}</h5>
                  <div class="element-subtitle">{structure.subtitle}</div>
                </div>
              </div>
              <div class="element-body">
                <p class="element-desc">{structure.description}</p>
                <div class="attributes-grid">
                  {#if structure.durability}
                    <div class="attribute">
                      <span class="attribute-label">Durability</span>
                      <span class="attribute-value">{structure.durability}</span>
                    </div>
                  {/if}
                  {#if structure.sightRange}
                    <div class="attribute">
                      <span class="attribute-label">Sight Range</span>
                      <span class="attribute-value">{structure.sightRange}</span>
                    </div>
                  {/if}
                  {#if structure.capacity}
                    <div class="attribute">
                      <span class="attribute-label">Capacity</span>
                      <span class="attribute-value">{structure.capacity}</span>
                    </div>
                  {/if}
                </div>
                
                {#if structure.resources && structure.resources.length > 0}
                  <div class="resources-list">
                    {#each structure.resources as resource}
                      <div class="resource-item">
                        <span class="resource-name">{resource.id}</span>
                        <span class="resource-amount">{resource.quantity}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
                
                {#if structure.features && structure.features.length > 0}
                  <div class="features-list">
                    {#each structure.features as feature}
                      <div class="feature">
                        <span class="feature-icon">{feature.icon || '✨'}</span>
                        <span class="feature-text">{feature.name}: {feature.description}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>

      <h3>Building & Upgrading Structures</h3>
      <p>
        Structures are built and improved through a tick-based progression system:
      </p>
      <ul>
        <li><strong>Building:</strong> Construction requires specific resources and takes several ticks to complete</li>
        <li><strong>Upgrading:</strong> Existing structures can be upgraded using shared resources</li>
        <li><strong>Durability:</strong> Structures have health points that decrease when damaged in battle</li>
        <li><strong>Battle Indicators:</strong> Structures under attack display their current health percentage</li>
        <li><strong>Race Restrictions:</strong> Some structures have race-specific interactions and limitations</li>
        <li><strong>Ownership:</strong> Building actions are restricted to buildings you own or your race controls</li>
      </ul>

      <h3>Buildings</h3>
      <p>
        Within settlements, various buildings can be constructed to provide specific benefits:
      </p>
      <ul>
        <li><strong>Banks:</strong> Store wealth and offer financial services including loans and interest</li>
        <li><strong>Warehouses:</strong> Increase storage capacity for resources and items</li>
        <li><strong>Barracks:</strong> Improve military unit training and recruitment</li>
        <li><strong>Smithy:</strong> Enable metal crafting and equipment production</li>
        <li><strong>Workshop:</strong> Support general crafting activities</li>
        <li><strong>Harbor:</strong> Provide naval construction and trade capabilities</li>
        <li><strong>Stables:</strong> Support mounted units and animal husbandry</li>
      </ul>

      <h3>Structure Capacity</h3>
      <p>
        Structures have limited capacity for units and resources:
      </p>
      <ul>
        <li>Capacity can be increased through upgrades</li>
        <li>Capacity limits apply to all units regardless of owner</li>
        <li>Strategic planning is required to maximize limited space</li>
        <li>Structure levels affect available crafting recipes and activities</li>
      </ul>
      
      <h3>Recruitment</h3>
      <p>
        Structures enable the recruitment of new units:
      </p>
      <ul>
        <li>Recruitment requires resources based on unit type</li>
        <li>Units are restricted to your character's race</li>
        <li>Higher-level structures allow for more advanced unit types</li>
        <li>Recruitment takes place over one or more ticks depending on unit complexity</li>
      </ul>
      
      <h3>Structure Storage Systems</h3>
      <p>
        Structures offer multiple storage options:
      </p>
      <ul>
        <li><strong>Shared Storage:</strong> Resources accessible to all users of the structure</li>
        <li><strong>Bank Storage:</strong> Private items accessible only to the owner</li>
        <li><strong>Building Materials:</strong> Resources dedicated to structure improvements</li>
      </ul>
    </section>

    <section id="units-groups" class="guide-section">
      <h2>Units & Groups</h2>
      <p>
        Units are the mobile forces that allow you to expand territory, engage in combat, and gather resources.
        Units are organized into groups for easier management.
      </p>

      <!-- Dynamic unit display using actual game data -->
      <div class="info-box">
        <h4>Unit Types Overview</h4>
        <p>Units vary in abilities, cost, and power. Here are some examples:</p>

        <div class="element-grid unit-grid">
          {#each unitExamples as unit}
            <div class="element-card unit-card {unit.requirements && Object.keys(unit.requirements).length > 0 ? 'elite' : ''}">
              <div class="element-header">
                <div class="element-icon">{unit.icon}</div>
                <div class="element-title">
                  <h5>{unit.race ? `${unit.race.charAt(0).toUpperCase() + unit.race.slice(1)} ` : ''}{unit.name}</h5>
                  <div class="element-subtitle">{unit.subtitle}</div>
                </div>
              </div>
              <div class="element-body">
                <p class="element-desc">{unit.description}</p>
                <div class="attributes-grid">
                  <div class="attribute">
                    <span class="attribute-label">Power</span>
                    <span class="attribute-value battle-stat">{unit.power}</span>
                  </div>
                  <div class="attribute">
                    <span class="attribute-label">Time</span>
                    <span class="attribute-value">{unit.time} ticks</span>
                  </div>
                </div>
                
                {#if unit.cost && Object.keys(unit.cost).length > 0}
                  <div class="resources-list">
                    {#each Object.entries(unit.cost) as [resourceId, amount]}
                      <div class="resource-item">
                        <span class="resource-name">{resourceId}</span>
                        <span class="resource-amount">{amount}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
                
                {#if unit.requirements && unit.requirements.structureLevel}
                  <div class="requirements-tag">Requires structure level {unit.requirements.structureLevel}</div>
                {/if}
                
                {#if unit.requirements && Object.keys(unit.requirements).length > 0}
                  <div class="requirements-list">
                    {#if unit.requirements.structureLevel}
                      <div class="requirement-item">
                        <span class="requirement-label">Structure Level</span>
                        <span class="requirement-value">{unit.requirements.structureLevel}</span>
                      </div>
                    {/if}
                    {#if unit.requirements.race}
                      <div class="requirement-item">
                        <span class="requirement-label">Race</span>
                        <span class="requirement-value">{unit.requirements.race.charAt(0).toUpperCase() + unit.requirements.race.slice(1)}</span>
                      </div>
                    {/if}
                    {#if unit.requirements.buildingType}
                      <div class="requirement-item">
                        <span class="requirement-label">Building</span>
                        <span class="requirement-value">
                          {unit.requirements.buildingType.charAt(0).toUpperCase() + unit.requirements.buildingType.slice(1)} 
                          {unit.requirements.buildingLevel ? `(Lvl ${unit.requirements.buildingLevel})` : ''}
                        </span>
                      </div>
                    {/if}
                  </div>
                {/if}
                
                {#if unit.tooltip}
                  <div class="unit-tooltip">
                    <span class="tooltip-text">{unit.tooltip}</span>
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
      
      <!-- Keep existing content... -->
    </section>

    <section id="buildings" class="guide-section">
      <h2>Buildings</h2>
      <p>
        Buildings are specialized structures that provide specific bonuses and capabilities within your settlements.
        They can be constructed, upgraded, and managed to enhance your strategic operations.
      </p>

      <!-- Dynamic building display using actual game data -->
      <div class="info-box">
        <h4>Building Types Overview</h4>
        <p>Buildings can be constructed within your structures to provide specialized capabilities:</p>

        <div class="element-grid building-grid">
          {#each buildingExamples as building}
            <div class="element-card">
              <div class="element-header">
                <div class="element-icon">{building.icon}</div>
                <div class="element-title">
                  <h5>{building.name}</h5>
                  <div class="element-subtitle">{building.subtitle}</div>
                </div>
              </div>
              <div class="element-body">
                <p class="element-desc">{building.description}</p>
                
                {#if building.resources && building.resources.length > 0}
                  <div class="resources-list">
                    {#each building.resources as resource}
                      <div class="resource-item">
                        <span class="resource-name">{resource.name}</span>
                        <span class="resource-amount">{resource.quantity}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
                
                {#if building.benefits && (building.benefits.level2.length > 0 || building.benefits.level3.length > 0)}
                  <div class="building-benefits">
                    <h6>Upgrade Benefits</h6>
                    {#each building.benefits.level2 as benefit}
                      <div class="benefit-item">
                        <div class="benefit-level">Level 2</div>
                        <div class="benefit-desc">{benefit.name}: {benefit.description}</div>
                      </div>
                    {/each}
                    {#each building.benefits.level3 as benefit}
                      <div class="benefit-item">
                        <div class="benefit-level">Level 3</div>
                        <div class="benefit-desc">{benefit.name}: {benefit.description}</div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>

      <h3>Building Upgrades & Management</h3>
      <p>
        Buildings can be upgraded to enhance their capabilities and unlock new features:
      </p>
      <ul>
        <li>Each upgrade level requires specific resources and time</li>
        <li>Higher levels unlock new crafting recipes, unit types, or bonuses</li>
        <li>Building synergies can provide additional benefits when certain buildings are paired together</li>
        <li>Some buildings have race-specific variations with unique bonuses</li>
      </ul>
    </section>

    <section id="items-inventory" class="guide-section">
      <h2>Items & Inventory</h2>
      <p>
        Items in Gisaima range from common resources to mythical artifacts, each with unique properties and values.
      </p>

      <!-- Dynamic item display using actual game data -->
      <div class="info-box">
        <h4>Item Types Overview</h4>
        <p>Items vary in rarity, purpose, and value. Here are some examples:</p>

        <div class="element-grid item-grid">
          {#each itemExamples as item}
            <div class="element-card item-card {item.rarity}">
              <div class="element-header">
                <div class="element-title">
                  <h5>{item.name}</h5>
                  <div class="element-subtitle">{item.subtitle}</div>
                </div>
              </div>
              <div class="element-body">
                <p class="element-desc">{item.description}</p>
                <div class="item-attributes">
                  <div class="item-attribute">
                    <span class="attribute-label">Type</span>
                    <span class="attribute-value">{item.type.charAt(0).toUpperCase() + item.type.slice(1)}</span>
                  </div>
                  
                  {#if item.biomes && item.biomes.length > 0}
                    <div class="item-attribute">
                      <span class="attribute-label">Found in</span>
                      <span class="attribute-value">{item.biomes.map(b => b.charAt(0).toUpperCase() + b.slice(1)).join(', ')}</span>
                    </div>
                  {/if}
                  
                  {#if item.power}
                    <div class="item-attribute">
                      <span class="attribute-label">Power</span>
                      <span class="attribute-value battle-stat">{item.power}</span>
                    </div>
                  {/if}
                </div>
                
                {#if item.recipe}
                  <div class="crafting-recipe">
                    <h6>Crafting Recipe</h6>
                    <div class="resources-list">
                      {#each Object.entries(item.recipe.materials) as [materialId, amount]}
                        <div class="resource-item">
                          <span class="resource-name">{materialId}</span>
                          <span class="resource-amount">{amount}</span>
                        </div>
                      {/each}
                    </div>
                    <div class="crafting-time">
                      <span class="time-icon">⏱️</span>
                      <span class="time-value">{item.recipe.ticksRequired} ticks</span>
                    </div>
                  </div>
                  
                  <div class="crafting-requirements">
                    {#if item.recipe.requiredLevel}
                      <div class="requirement-item">
                        <span class="requirement-label">Required Level</span>
                        <span class="requirement-value">{item.recipe.requiredLevel}</span>
                      </div>
                    {/if}
                    {#if item.recipe.requiredBuilding}
                      <div class="requirement-item">
                        <span class="requirement-label">Required Building</span>
                        <span class="requirement-value">
                          {item.recipe.requiredBuilding.type.charAt(0).toUpperCase() + item.recipe.requiredBuilding.type.slice(1)} 
                          (Lvl {item.recipe.requiredBuilding.level})
                        </span>
                      </div>
                    {/if}
                  </div>
                {/if}
                
                {#if !item.recipe && item.biomes && item.biomes.length > 0}
                  <div class="item-uses">
                    <h6>Used For</h6>
                    <ul class="uses-list">
                      <li>Basic crafting recipes</li>
                      <li>Building structures</li>
                      <li>Trade goods</li>
                    </ul>
                  </div>
                {/if}
              </div>
              <div class="item-rarity {item.rarity}">{item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)}</div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Keep existing content... -->
    </section>

    <section id="activities" class="guide-section">
      <h2>Activities</h2>
      <p>
        Beyond combat and construction, Gisaima offers various activities that enhance gameplay and resource acquisition.
      </p>

      <h3>Gathering</h3>
      <p>
        Gathering resources from the environment is essential for building and crafting:
      </p>
      <ul>
        <li><strong>Woodcutting:</strong> Harvesting wood using hatchets</li>
        <li><strong>Farming:</strong> Growing food from seeds in suitable terrain</li>
        <li><strong>Mining:</strong> Extracting ores and gems using pickaxes</li>
        <li><strong>Tick-based:</strong> Gathering takes 2 ticks to complete with progress tracked</li>
        <li><strong>Cancelable:</strong> Gathering actions can be canceled before completion</li>
      </ul>
      <p>
        Gathering affects the abundance of resources in an area. Lower abundance reduces gathering effectiveness, 
        but areas refresh over time. Different terrain rarities produce different quality and quantity of resources.
      </p>

      <h3>Crafting</h3>
      <p>
        Converting raw materials into useful items through specialized processes:
      </p>
      <ul>
        <li><strong>Alchemy:</strong> Creating potions, elixirs, and magical items</li>
        <li><strong>Smithing:</strong> Forging metal goods from ores and wood</li>
        <li><strong>Crafting:</strong> Creating finished goods from fabrics, gems, pelts, and other materials</li>
        <li><strong>Structure Enhanced:</strong> Crafting options expand based on available building levels</li>
        <li><strong>Tick-based:</strong> Crafting takes varying amounts of ticks based on item complexity</li>
      </ul>
      
      <h3>Item Storage & Transfer</h3>
      <p>
        Managing items is a key part of resource management:
      </p>
      <ul>
        <li>Transfer items between groups and structures during mobilization/demobilization</li>
        <li>Access shared storage at structures for community resources</li>
        <li>Use personal bank storage for private item security</li>
        <li>Combine identical items automatically when storing them</li>
        <li>Track item distribution after battles through notifications</li>
      </ul>

      <h3>Special Activities</h3>
      <p>
        Beyond basic resource gathering, other activities offer unique opportunities:
      </p>
      <ul>
        <li><strong>Treasure Trails:</strong> Follow clues and maps to discover hidden treasures</li>
        <li><strong>Bounty Hunting:</strong> Track down and capture other players with bounties on their heads</li>
      </ul>
    </section>

    <section id="battles" class="guide-section">
      <h2>Battles & Combat</h2>
      <p>
        Combat in Gisaima is strategic and consequential, with multiple ways to engage enemies.
      </p>

      <h3>Attacking Units</h3>
      <p>
        When encountering enemy unit groups, you have several combat options:
      </p>
      <ul>
        <li>Direct attacks against enemy unit groups</li>
        <li>Joining ongoing battles to support allies</li>
        <li>Setting retreat conditions based on percentage of losses</li>
        <li>Fleeing from battles after the next tick is processed</li>
      </ul>
      <p>
        Combat factors include unit sizes, types, and environmental conditions. Smaller groups may 
        flee from larger forces, while sufficiently large groups may be forced into battle.
      </p>

      <h3>Attacking Structures</h3>
      <p>
        Structures can be attacked, besieged, or captured:
      </p>
      <ul>
        <li>Destroy enemy structures through direct attacks</li>
        <li>Capture structures after defeating defenders</li>
        <li>Siege structures to weaken them over time</li>
        <li>Structures under siege for 15 game days may be destroyed</li>
        <li>Continuous trebuchet attacks for 3 days can turn structures to ruins</li>
        <li>Structure durability decreases as they take damage in combat</li>
      </ul>

      <h3>Battle Outcomes</h3>
      <p>
        After battles, the victors have several options:
      </p>
      <ul>
        <li><strong>Automatic Looting:</strong> All items carried by defeated groups are automatically collected</li>
        <li><strong>Loot Distribution:</strong> If multiple groups are on the winning side, items are randomly distributed among them</li>
        <li><strong>Loot Notification:</strong> Groups receive messages indicating how many items they looted from battle</li>
        <li><strong>Scavenging:</strong> Beyond automatic looting, additional equipment may be salvageable from the battlefield</li>
        <li><strong>Capture:</strong> Take defeated enemies prisoner</li>
        <li><strong>Ransom:</strong> Negotiate the release of captives for payment</li>
      </ul>
      <p>
        A player's morality affects these options - low morality players may have their units turned against them, 
        while good morality players' units must be captured or ransomed.
      </p>
      
      <div class="tip-box">
        <h4>Strategic Tip: Item Management</h4>
        <p>
          Consider what items your groups carry into battle. Valuable items might be lost if your group is defeated,
          so leave precious cargo behind when heading into dangerous situations. Conversely, be aware that defeating
          enemy groups with valuable items can be quite profitable!
        </p>
      </div>

      <h3>Battle Duration & Resolution</h3>
      <p>
        Battles in Gisaima don't resolve instantly - they take time to play out, with larger battles 
        taking longer to resolve than smaller ones. The game simulates this through a tick-based system:
      </p>
      
      <div class="info-box">
        <h4>How Battle Duration Works:</h4>
        <ul>
          <li><strong>Small battles</strong> (5 or fewer units) typically resolve in 1-3 ticks</li>
          <li><strong>Medium battles</strong> (6-20 units) may take 2-5 ticks to complete</li>
          <li><strong>Large battles</strong> (21-50 units) often extend to 4-8 ticks</li>
          <li><strong>Massive battles</strong> (50+ units) can last 6-12+ ticks or more</li>
        </ul>
        <p class="note">Note: Each tick is approximately 1-2 minutes of real time, depending on world speed settings.</p>
      </div>
      
      <h3>Battle Casualties</h3>
      <p>
        When a battle concludes, casualties are calculated based on the relative power of each side.
        Battles that are evenly matched generally result in higher casualty rates for both sides.
      </p>
      
      <div class="info-box">
        <h4>Notable Battle Mechanics:</h4>
        <ul>
          <li><strong>Player Protection:</strong> Player units have special protection in battles against non-player units:
            <ul>
              <li>Non-player units are lost first in battle</li>
              <li>Players only face risk of death when casualties exceed 80%</li>
              <li>Even when defeated, players have a chance to escape as "Battle Survivors"</li>
            </ul>
          </li>
          <li><strong>One-sided Victories:</strong> When one side greatly outnumbers the other, the stronger side will suffer fewer casualties:
            <ul>
              <li>Overwhelming advantage (5:1 ratio): 1-5% casualties for winner</li>
              <li>Strong advantage (3:1 ratio): 3-10% casualties for winner</li>
              <li>Moderate advantage (1.5:1 ratio): 5-15% casualties for winner</li>
              <li>Close match: 10-25% casualties for winner</li>
            </ul>
          </li>
          <li><strong>Player vs. Player:</strong> In battles exclusively between players, the special protection rules do not apply - these battles are always to the death.</li>
          <li><strong>Joining Battles:</strong> Groups can join ongoing battles on either side, potentially turning the tide of combat.</li>
          <li><strong>Fleeing:</strong> Groups can attempt to flee battles, which will be processed after the next tick. Successful fleeing removes the group from combat.</li>
        </ul>
      </div>
      
      <h3>Example Scenarios</h3>
      <div class="scenario-box">
        <h4>Small Skirmish</h4>
        <p><strong>Forces:</strong> 3 player units vs. 2 NPC units</p>
        <p><strong>Duration:</strong> Likely 1-2 ticks</p>
        <p><strong>Outcome:</strong> If player side wins, expects 5-15% casualties. Players would survive unless it's a close battle.</p>
      </div>
      
      <div class="scenario-box">
        <h4>Medium Battle</h4>
        <p><strong>Forces:</strong> 8 player units (including 2 players) vs. 10 NPC units</p>
        <p><strong>Duration:</strong> Likely 3-4 ticks</p>
        <p><strong>Outcome:</strong> Casualties would be higher (10-25%), with non-player units lost first. If defeated, the players have a 20% chance to escape and form a new "Battle Survivors" group.</p>
      </div>
      
      <div class="scenario-box">
        <h4>Large-scale Conflict</h4>
        <p><strong>Forces:</strong> 30 player units vs. 25 NPC units</p>
        <p><strong>Duration:</strong> Likely 5-7 ticks</p>
        <p><strong>Outcome:</strong> Battle would progress slowly with multiple ticks, giving players time to potentially bring reinforcements.</p>
      </div>
    </section>

    <section id="trade-economy" class="guide-section">
      <h2>Trade & Economy</h2>
      <p>
        Gisaima features a robust economic system that allows players to trade, create wealth, and establish financial institutions.
      </p>

      <h3>Basic Trade</h3>
      <p>
        Trade begins with simple exchanges:
      </p>
      <ul>
        <li>Trade directly with other players in the same location</li>
        <li>Exchange goods stored in the same property or warehouse</li>
        <li>Set up trade offers that others can accept</li>
      </ul>

      <h3>Advanced Economic Systems</h3>
      <p>
        As cities develop, more complex economic activities become available:
      </p>
      <ul>
        <li>Establish official currencies for cities or regions</li>
        <li>Create your own currency backed by resources</li>
        <li>Set trade taxes within controlled territories</li>
        <li>Implement building taxes where a percentage of produced items go to the ruler</li>
      </ul>

      <h3>Transportation & Logistics</h3>
      <p>
        Moving goods across the map creates additional economic opportunities:
      </p>
      <ul>
        <li>Transport goods between distant markets for profit</li>
        <li>Rent caravans to other players with different risk/reward options</li>
        <li>Secure valuable goods during transport for higher fees</li>
        <li>Specialize in different goods based on their transport properties (e.g., beef moves slowly, processed goods move quickly)</li>
      </ul>

      <h3>Banking</h3>
      <p>
        Establish or use banking services:
      </p>
      <ul>
        <li>Offer interest rates to attract deposits</li>
        <li>Request loans with negotiable terms</li>
        <li>Build bank credibility through consistent performance</li>
        <li>View public debt information to make informed decisions</li>
      </ul>
    </section>

    <section id="character-development" class="guide-section">
      <h2>Character Development</h2>
      <p>
        Your character in Gisaima can develop in various ways, gaining experience, skills, and reputation.
      </p>

      <h3>Lives & Reproduction</h3>
      <p>
        Characters in Gisaima have limited lives:
      </p>
      <ul>
        <li>Characters can die permanently under certain conditions</li>
        <li>Reproduction mechanics allow for new generations</li>
        <li>Various factors influence offspring characteristics</li>
        <li>Spawn points provide safe havens for new characters</li>
      </ul>

      <h3>Development & Progression</h3>
      <p>
        Characters can advance through several systems:
      </p>
      <ul>
        <li>Experience points earned through activities</li>
        <li>Levels that unlock new capabilities</li>
        <li>Skills and abilities that improve performance</li>
        <li>Specialized knowledge that provides advantages</li>
      </ul>

      <h3>Profile & Finances</h3>
      <p>
        Your character maintains a public and private profile:
      </p>
      <ul>
        <li>Public information includes reputation, achievements, and publicly disclosed wealth</li>
        <li>Financial records track assets by location</li>
        <li>Debt information is typically public</li>
        <li>Players can choose to display or hide wealth measurements</li>
      </ul>

      <h3>Character Metrics</h3>
      <p>
        Various metrics track your character's accomplishments:
      </p>
      <ul>
        <li>Distance traveled across the world</li>
        <li>Combat statistics including wins, losses, and kills</li>
        <li>Wealth accumulation and management</li>
        <li>Resource gathering and crafting achievements</li>
      </ul>
    </section>

    <section id="community-politics" class="guide-section">
      <h2>Community & Politics</h2>
      <p>
        Gisaima features complex social systems that allow players to form communities and engage in political activities.
      </p>

      <h3>Leadership & Governance</h3>
      <p>
        Communities need leadership and governance structures:
      </p>
      <ul>
        <li>Control of cities and regions through various means</li>
        <li>Tax systems to generate revenue</li>
        <li>Management of community coffers</li>
        <li>Decision-making powers over community policies</li>
      </ul>

      <h3>Alliances & Groups</h3>
      <p>
        Players can form various types of associations:
      </p>
      <ul>
        <li>Structures and locations can be owned by individuals, alliances, or groups</li>
        <li>Communication forums for community interaction</li>
        <li>Reputation systems similar to StackExchange with visible actions and contributions</li>
      </ul>

      <h3>Political Systems</h3>
      <p>
        Communities can implement various political mechanisms:
      </p>
      <ul>
        <li><strong>Voting:</strong> Electoral systems for leadership positions</li>
        <li><strong>Arbitration:</strong> Decision-making for community issues like naming regions</li>
        <li><strong>Citizenship:</strong> Systems to determine who belongs to the community</li>
        <li><strong>Laws:</strong> Community rules including speech regulations, customs, and taxes</li>
      </ul>

      <h3>Political Transitions</h3>
      <p>
        Power can change hands through several mechanisms:
      </p>
      <ul>
        <li><strong>Seizing Power:</strong> Forceful takeover that takes time and carries risks</li>
        <li><strong>Elections:</strong> Formal voting process for leadership positions</li>
        <li><strong>Votes of No Confidence:</strong> Community mechanisms to remove leaders</li>
        <li><strong>Revolution:</strong> Organized opposition to existing leadership</li>
        <li><strong>Resignation/Exile:</strong> Voluntary or forced removal from power</li>
      </ul>
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

    <section id="items-inventory" class="guide-section">
      <h2>Items & Inventory</h2>
      <p>
        Items in Gisaima range from common resources to mythical artifacts, each with unique properties and values.
      </p>

      <!-- New compact item display -->
      <div class="info-box">
        <h4>Item Types Overview</h4>
        <p>Items vary in rarity, purpose, and value. Here are some examples:</p>

        <div class="element-grid item-grid">
          <!-- Item Card Example - Resource -->
          <div class="element-card item-card common">
            <div class="element-header">
              <div class="element-title">
                <h5>Wooden Sticks</h5>
                <div class="element-subtitle">Common Resource</div>
              </div>
            </div>
            <div class="element-body">
              <p class="element-desc">Basic building material found in most areas</p>
              <div class="item-attributes">
                <div class="item-attribute">
                  <span class="attribute-label">Type</span>
                  <span class="attribute-value">Resource</span>
                </div>
                <div class="item-attribute">
                  <span class="attribute-label">Found in</span>
                  <span class="attribute-value">Plains, Forest, Mountains</span>
                </div>
              </div>
            </div>
            <div class="item-rarity common">Common</div>
          </div>

          <!-- Item Card Example - Crafted Item -->
          <div class="element-card item-card uncommon">
            <div class="element-header">
              <div class="element-title">
                <h5>Iron Sword</h5>
                <div class="element-subtitle">Uncommon Weapon</div>
              </div>
            </div>
            <div class="element-body">
              <p class="element-desc">A well-crafted iron sword. Standard issue for many fighters.</p>
              <div class="item-attributes">
                <div class="item-attribute">
                  <span class="attribute-label">Power</span>
                  <span class="attribute-value battle-stat">10</span>
                </div>
                <div class="item-attribute">
                  <span class="attribute-label">Type</span>
                  <span class="attribute-value">Weapon</span>
                </div>
              </div>
              <div class="crafting-recipe">
                <h6>Crafting Recipe</h6>
                <div class="resources-list">
                  <div class="resource-item">
                    <span class="resource-name">Wooden Sticks</span>
                    <span class="resource-amount">2</span>
                  </div>
                  <div class="resource-item">
                    <span class="resource-name">Iron Ore</span>
                    <span class="resource-amount">3</span>
                  </div>
                </div>
                <div class="crafting-time">
                  <span class="time-icon">⏱️</span>
                  <span class="time-value">18 ticks</span>
                </div>
              </div>
              <div class="crafting-requirements">
                <div class="requirement-item">
                  <span class="requirement-label">Required Level</span>
                  <span class="requirement-value">3</span>
                </div>
                <div class="requirement-item">
                  <span class="requirement-label">Required Building</span>
                  <span class="requirement-value">Smithy (Lvl 2)</span>
                </div>
              </div>
            </div>
            <div class="item-rarity uncommon">Uncommon</div>
          </div>

          <!-- Item Card Example - Special Item -->
          <div class="element-card item-card rare">
            <div class="element-header">
              <div class="element-title">
                <h5>Mountain Crystal</h5>
                <div class="element-subtitle">Rare Gem</div>
              </div>
            </div>
            <div class="element-body">
              <p class="element-desc">Beautiful crystal formed deep within mountains</p>
              <div class="item-attributes">
                <div class="item-attribute">
                  <span class="attribute-label">Type</span>
                  <span class="attribute-value">Gem</span>
                </div>
                <div class="item-attribute">
                  <span class="attribute-label">Found in</span>
                  <span class="attribute-value">Mountains</span>
                </div>
              </div>
              <div class="item-uses">
                <h6>Used For</h6>
                <ul class="uses-list">
                  <li>Advanced crafting recipes</li>
                  <li>Magic item enchantments</li>
                  <li>Valuable trade good</li>
                </ul>
              </div>
            </div>
            <div class="item-rarity rare">Rare</div>
          </div>
        </div>
      </div>

      <!-- Keep existing content... -->
      <!-- ...existing code... -->
    </section>

    <section id="activities" class="guide-section">
      <h2>Activities</h2>
      <p>
        Beyond combat and construction, Gisaima offers various activities that enhance gameplay and resource acquisition.
      </p>

      <h3>Gathering</h3>
      <p>
        Gathering resources from the environment is essential for building and crafting:
      </p>
      <ul>
        <li><strong>Woodcutting:</strong> Harvesting wood using hatchets</li>
        <li><strong>Farming:</strong> Growing food from seeds in suitable terrain</li>
        <li><strong>Mining:</strong> Extracting ores and gems using pickaxes</li>
        <li><strong>Tick-based:</strong> Gathering takes 2 ticks to complete with progress tracked</li>
        <li><strong>Cancelable:</strong> Gathering actions can be canceled before completion</li>
      </ul>
      <p>
        Gathering affects the abundance of resources in an area. Lower abundance reduces gathering effectiveness, 
        but areas refresh over time. Different terrain rarities produce different quality and quantity of resources.
      </p>

      <h3>Crafting</h3>
      <p>
        Converting raw materials into useful items through specialized processes:
      </p>
      <ul>
        <li><strong>Alchemy:</strong> Creating potions, elixirs, and magical items</li>
        <li><strong>Smithing:</strong> Forging metal goods from ores and wood</li>
        <li><strong>Crafting:</strong> Creating finished goods from fabrics, gems, pelts, and other materials</li>
        <li><strong>Structure Enhanced:</strong> Crafting options expand based on available building levels</li>
        <li><strong>Tick-based:</strong> Crafting takes varying amounts of ticks based on item complexity</li>
      </ul>
      
      <h3>Item Storage & Transfer</h3>
      <p>
        Managing items is a key part of resource management:
      </p>
      <ul>
        <li>Transfer items between groups and structures during mobilization/demobilization</li>
        <li>Access shared storage at structures for community resources</li>
        <li>Use personal bank storage for private item security</li>
        <li>Combine identical items automatically when storing them</li>
        <li>Track item distribution after battles through notifications</li>
      </ul>

      <h3>Special Activities</h3>
      <p>
        Beyond basic resource gathering, other activities offer unique opportunities:
      </p>
      <ul>
        <li><strong>Treasure Trails:</strong> Follow clues and maps to discover hidden treasures</li>
        <li><strong>Bounty Hunting:</strong> Track down and capture other players with bounties on their heads</li>
      </ul>
    </section>

    <section id="battles" class="guide-section">
      <h2>Battles & Combat</h2>
      <p>
        Combat in Gisaima is strategic and consequential, with multiple ways to engage enemies.
      </p>

      <h3>Attacking Units</h3>
      <p>
        When encountering enemy unit groups, you have several combat options:
      </p>
      <ul>
        <li>Direct attacks against enemy unit groups</li>
        <li>Joining ongoing battles to support allies</li>
        <li>Setting retreat conditions based on percentage of losses</li>
        <li>Fleeing from battles after the next tick is processed</li>
      </ul>
      <p>
        Combat factors include unit sizes, types, and environmental conditions. Smaller groups may 
        flee from larger forces, while sufficiently large groups may be forced into battle.
      </p>

      <h3>Attacking Structures</h3>
      <p>
        Structures can be attacked, besieged, or captured:
      </p>
      <ul>
        <li>Destroy enemy structures through direct attacks</li>
        <li>Capture structures after defeating defenders</li>
        <li>Siege structures to weaken them over time</li>
        <li>Structures under siege for 15 game days may be destroyed</li>
        <li>Continuous trebuchet attacks for 3 days can turn structures to ruins</li>
        <li>Structure durability decreases as they take damage in combat</li>
      </ul>

      <h3>Battle Outcomes</h3>
      <p>
        After battles, the victors have several options:
      </p>
      <ul>
        <li><strong>Automatic Looting:</strong> All items carried by defeated groups are automatically collected</li>
        <li><strong>Loot Distribution:</strong> If multiple groups are on the winning side, items are randomly distributed among them</li>
        <li><strong>Loot Notification:</strong> Groups receive messages indicating how many items they looted from battle</li>
        <li><strong>Scavenging:</strong> Beyond automatic looting, additional equipment may be salvageable from the battlefield</li>
        <li><strong>Capture:</strong> Take defeated enemies prisoner</li>
        <li><strong>Ransom:</strong> Negotiate the release of captives for payment</li>
      </ul>
      <p>
        A player's morality affects these options - low morality players may have their units turned against them, 
        while good morality players' units must be captured or ransomed.
      </p>
      
      <div class="tip-box">
        <h4>Strategic Tip: Item Management</h4>
        <p>
          Consider what items your groups carry into battle. Valuable items might be lost if your group is defeated,
          so leave precious cargo behind when heading into dangerous situations. Conversely, be aware that defeating
          enemy groups with valuable items can be quite profitable!
        </p>
      </div>

      <h3>Battle Duration & Resolution</h3>
      <p>
        Battles in Gisaima don't resolve instantly - they take time to play out, with larger battles 
        taking longer to resolve than smaller ones. The game simulates this through a tick-based system:
      </p>
      
      <div class="info-box">
        <h4>How Battle Duration Works:</h4>
        <ul>
          <li><strong>Small battles</strong> (5 or fewer units) typically resolve in 1-3 ticks</li>
          <li><strong>Medium battles</strong> (6-20 units) may take 2-5 ticks to complete</li>
          <li><strong>Large battles</strong> (21-50 units) often extend to 4-8 ticks</li>
          <li><strong>Massive battles</strong> (50+ units) can last 6-12+ ticks or more</li>
        </ul>
        <p class="note">Note: Each tick is approximately 1-2 minutes of real time, depending on world speed settings.</p>
      </div>
      
      <h3>Battle Casualties</h3>
      <p>
        When a battle concludes, casualties are calculated based on the relative power of each side.
        Battles that are evenly matched generally result in higher casualty rates for both sides.
      </p>
      
      <div class="info-box">
        <h4>Notable Battle Mechanics:</h4>
        <ul>
          <li><strong>Player Protection:</strong> Player units have special protection in battles against non-player units:
            <ul>
              <li>Non-player units are lost first in battle</li>
              <li>Players only face risk of death when casualties exceed 80%</li>
              <li>Even when defeated, players have a chance to escape as "Battle Survivors"</li>
            </ul>
          </li>
          <li><strong>One-sided Victories:</strong> When one side greatly outnumbers the other, the stronger side will suffer fewer casualties:
            <ul>
              <li>Overwhelming advantage (5:1 ratio): 1-5% casualties for winner</li>
              <li>Strong advantage (3:1 ratio): 3-10% casualties for winner</li>
              <li>Moderate advantage (1.5:1 ratio): 5-15% casualties for winner</li>
              <li>Close match: 10-25% casualties for winner</li>
            </ul>
          </li>
          <li><strong>Player vs. Player:</strong> In battles exclusively between players, the special protection rules do not apply - these battles are always to the death.</li>
          <li><strong>Joining Battles:</strong> Groups can join ongoing battles on either side, potentially turning the tide of combat.</li>
          <li><strong>Fleeing:</strong> Groups can attempt to flee battles, which will be processed after the next tick. Successful fleeing removes the group from combat.</li>
        </ul>
      </div>
      
      <h3>Example Scenarios</h3>
      <div class="scenario-box">
        <h4>Small Skirmish</h4>
        <p><strong>Forces:</strong> 3 player units vs. 2 NPC units</p>
        <p><strong>Duration:</strong> Likely 1-2 ticks</p>
        <p><strong>Outcome:</strong> If player side wins, expects 5-15% casualties. Players would survive unless it's a close battle.</p>
      </div>
      
      <div class="scenario-box">
        <h4>Medium Battle</h4>
        <p><strong>Forces:</strong> 8 player units (including 2 players) vs. 10 NPC units</p>
        <p><strong>Duration:</strong> Likely 3-4 ticks</p>
        <p><strong>Outcome:</strong> Casualties would be higher (10-25%), with non-player units lost first. If defeated, the players have a 20% chance to escape and form a new "Battle Survivors" group.</p>
      </div>
      
      <div class="scenario-box">
        <h4>Large-scale Conflict</h4>
        <p><strong>Forces:</strong> 30 player units vs. 25 NPC units</p>
        <p><strong>Duration:</strong> Likely 5-7 ticks</p>
        <p><strong>Outcome:</strong> Battle would progress slowly with multiple ticks, giving players time to potentially bring reinforcements.</p>
      </div>
    </section>

    <section id="trade-economy" class="guide-section">
      <h2>Trade & Economy</h2>
      <p>
        Gisaima features a robust economic system that allows players to trade, create wealth, and establish financial institutions.
      </p>

      <h3>Basic Trade</h3>
      <p>
        Trade begins with simple exchanges:
      </p>
      <ul>
        <li>Trade directly with other players in the same location</li>
        <li>Exchange goods stored in the same property or warehouse</li>
        <li>Set up trade offers that others can accept</li>
      </ul>

      <h3>Advanced Economic Systems</h3>
      <p>
        As cities develop, more complex economic activities become available:
      </p>
      <ul>
        <li>Establish official currencies for cities or regions</li>
        <li>Create your own currency backed by resources</li>
        <li>Set trade taxes within controlled territories</li>
        <li>Implement building taxes where a percentage of produced items go to the ruler</li>
      </ul>

      <h3>Transportation & Logistics</h3>
      <p>
        Moving goods across the map creates additional economic opportunities:
      </p>
      <ul>
        <li>Transport goods between distant markets for profit</li>
        <li>Rent caravans to other players with different risk/reward options</li>
        <li>Secure valuable goods during transport for higher fees</li>
        <li>Specialize in different goods based on their transport properties (e.g., beef moves slowly, processed goods move quickly)</li>
      </ul>

      <h3>Banking</h3>
      <p>
        Establish or use banking services:
      </p>
      <ul>
        <li>Offer interest rates to attract deposits</li>
        <li>Request loans with negotiable terms</li>
        <li>Build bank credibility through consistent performance</li>
        <li>View public debt information to make informed decisions</li>
      </ul>
    </section>

    <section id="character-development" class="guide-section">
      <h2>Character Development</h2>
      <p>
        Your character in Gisaima can develop in various ways, gaining experience, skills, and reputation.
      </p>

      <h3>Lives & Reproduction</h3>
      <p>
        Characters in Gisaima have limited lives:
      </p>
      <ul>
        <li>Characters can die permanently under certain conditions</li>
        <li>Reproduction mechanics allow for new generations</li>
        <li>Various factors influence offspring characteristics</li>
        <li>Spawn points provide safe havens for new characters</li>
      </ul>

      <h3>Development & Progression</h3>
      <p>
        Characters can advance through several systems:
      </p>
      <ul>
        <li>Experience points earned through activities</li>
        <li>Levels that unlock new capabilities</li>
        <li>Skills and abilities that improve performance</li>
        <li>Specialized knowledge that provides advantages</li>
      </ul>

      <h3>Profile & Finances</h3>
      <p>
        Your character maintains a public and private profile:
      </p>
      <ul>
        <li>Public information includes reputation, achievements, and publicly disclosed wealth</li>
        <li>Financial records track assets by location</li>
        <li>Debt information is typically public</li>
        <li>Players can choose to display or hide wealth measurements</li>
      </ul>

      <h3>Character Metrics</h3>
      <p>
        Various metrics track your character's accomplishments:
      </p>
      <ul>
        <li>Distance traveled across the world</li>
        <li>Combat statistics including wins, losses, and kills</li>
        <li>Wealth accumulation and management</li>
        <li>Resource gathering and crafting achievements</li>
      </ul>
    </section>

    <section id="community-politics" class="guide-section">
      <h2>Community & Politics</h2>
      <p>
        Gisaima features complex social systems that allow players to form communities and engage in political activities.
      </p>

      <h3>Leadership & Governance</h3>
      <p>
        Communities need leadership and governance structures:
      </p>
      <ul>
        <li>Control of cities and regions through various means</li>
        <li>Tax systems to generate revenue</li>
        <li>Management of community coffers</li>
        <li>Decision-making powers over community policies</li>
      </ul>

      <h3>Alliances & Groups</h3>
      <p>
        Players can form various types of associations:
      </p>
      <ul>
        <li>Structures and locations can be owned by individuals, alliances, or groups</li>
        <li>Communication forums for community interaction</li>
        <li>Reputation systems similar to StackExchange with visible actions and contributions</li>
      </ul>

      <h3>Political Systems</h3>
      <p>
        Communities can implement various political mechanisms:
      </p>
      <ul>
        <li><strong>Voting:</strong> Electoral systems for leadership positions</li>
        <li><strong>Arbitration:</strong> Decision-making for community issues like naming regions</li>
        <li><strong>Citizenship:</strong> Systems to determine who belongs to the community</li>
        <li><strong>Laws:</strong> Community rules including speech regulations, customs, and taxes</li>
      </ul>

      <h3>Political Transitions</h3>
      <p>
        Power can change hands through several mechanisms:
      </p>
      <ul>
        <li><strong>Seizing Power:</strong> Forceful takeover that takes time and carries risks</li>
        <li><strong>Elections:</strong> Formal voting process for leadership positions</li>
        <li><strong>Votes of No Confidence:</strong> Community mechanisms to remove leaders</li>
        <li><strong>Revolution:</strong> Organized opposition to existing leadership</li>
        <li><strong>Resignation/Exile:</strong> Voluntary or forced removal from power</li>
      </ul>
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

    <section id="items-inventory" class="guide-section">
      <h2>Items & Inventory</h2>
      <p>
        Items in Gisaima range from common resources to mythical artifacts, each with unique properties and values.
      </p>

      <!-- New compact item display -->
      <div class="info-box">
        <h4>Item Types Overview</h4>
        <p>Items vary in rarity, purpose, and value. Here are some examples:</p>

        <div class="element-grid item-grid">
          <!-- Item Card Example - Resource -->
          <div class="element-card item-card common">
            <div class="element-header">
              <div class="element-title">
                <h5>Wooden Sticks</h5>
                <div class="element-subtitle">Common Resource</div>
              </div>
            </div>
            <div class="element-body">
              <p class="element-desc">Basic building material found in most areas</p>
              <div class="item-attributes">
                <div class="item-attribute">
                  <span class="attribute-label">Type</span>
                  <span class="attribute-value">Resource</span>
                </div>
                <div class="item-attribute">
                  <span class="attribute-label">Found in</span>
                  <span class="attribute-value">Plains, Forest, Mountains</span>
                </div>
              </div>
            </div>
            <div class="item-rarity common">Common</div>
          </div>
        </div>
      </div>

      <!-- Keep existing content... -->
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

      <div class="faq-item">
        <h3>What are the next steps in development?</h3>
        <p>
          The development team is currently working on several features including:
        </p>
        <ul>
          <li>Map page loader improvements</li>
          <li>Enhanced unit group details and actions</li>
          <li>UI improvements for game mode</li>
          <li>Map zoom functionality</li>
          <li>Improved handling of pending events and activities</li>
          <li>Ship capacity calculations for water movement</li>
        </ul>
      </div>
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
    max-height: calc(100vh - 8em);
    overflow: auto;
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
    color: #fffc;
    margin-bottom: 1em;
    text-align: center;
    font-family: var(--font-heading);
    font-weight: 600;
    text-shadow: 0 0 0.1em rgba(255, 255, 255, 0.8); /* Added shadow for better legibility */
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
    list-style-type: none;
    padding-left: 0;
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
