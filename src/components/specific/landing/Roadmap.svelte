<script>
  // Define props similar to other components
  const { extraClass = '' } = $props();
  
  // Roadmap items with title, description, and icon
  const roadmapItems = [
    {
      title: "Boats",
      description: "Navigate across oceans and rivers with custom boats, discover new islands and trade with distant territories.",
      icon: "🚤"
    },
    {
      title: "Quests",
      description: "Engage in challenging missions, earn rewards and special abilities by completing tasks and solving puzzles.",
      icon: "📜"
    },
    {
      title: "Command Chaining",
      description: "Create complex action sequences for your units, automate routines and execute sophisticated strategies.",
      icon: "⛓️"
    },
    {
      title: "Global Banks & Inventory",
      description: "Store and access your resources across different regions, enabling seamless gameplay and strategic resource management.",
      icon: "🏦"
    },
    {
      title: "Recruitment",
      description: "Build training camps and recruit specialized units with unique abilities to strengthen your forces.",
      icon: "👥"
    },
    {
      title: "Structure Upgrading",
      description: "Enhance your buildings for improved efficiency, defense capabilities, and resource production.",
      icon: "🏗️"
    },
    {
      title: "Crafting",
      description: "Create weapons, tools, and special items using resources gathered from the world to gain tactical advantages.",
      icon: "⚒️"
    },
    {
      title: "Battle Destruction",
      description: "Witness the impact of warfare as structures can be damaged or destroyed during battles, adding strategic depth to conflicts.",
      icon: "💥"
    }
  ];
</script>

<section class="roadmap-section {extraClass}">
  <div class="content-container">
    <h2 class="section-title">Roadmap</h2>
    <p class="section-subtitle">Upcoming features that will expand the Gisaima universe</p>
    
    <div class="roadmap-items">
      {#each roadmapItems as item}
        <div class="roadmap-item">
          <div class="icon-container">
            <span class="item-icon">{item.icon}</span>
          </div>
          <h3 class="item-title">{item.title}</h3>
          <p class="item-description">{item.description}</p>
        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  .roadmap-section {
    padding: 4em 1em;
    text-align: center;
    background-color: var(--color-bg);
    border-bottom: 1px solid var(--color-panel-border);
  }

  .content-container {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2.5em;
  }

  .section-title {
    font-size: 2.5em;
    margin: 0;
    letter-spacing: 0.1em;
    color: var(--color-text);
    font-family: var(--font-heading);
    font-weight: 500;
  }

  .section-subtitle {
    font-size: 1.2em;
    color: var(--color-text-secondary);
    margin: -1.5em 0 0;
    font-weight: 300;
    max-width: 80%;
  }

  .roadmap-items {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2em;
    width: 100%;
    max-width: 90%;
  }

  .roadmap-item {
    background-color: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--color-panel-border);
    border-radius: 8px;
    padding: 2em;
    display: flex;
    flex-direction: column;
    align-items: center;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
  }

  .roadmap-item:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
    border-color: var(--color-muted-teal);
  }

  .icon-container {
    background-color: rgba(193, 19, 22, 0.2);
    width: 80px;
    height: 80px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 1em;
    border: 2px solid var(--color-muted-teal);
  }

  .item-icon {
    font-size: 2.5em;
  }

  .item-title {
    font-size: 1.8em;
    margin: 0.5em 0;
    color: var(--color-pale-green);
    font-family: var(--font-heading);
  }

  .item-description {
    font-size: 1.1em;
    line-height: 1.6;
    color: var(--color-text-secondary);
    margin: 0;
  }

  /* Responsive styles */
  @media (min-width: 768px) {
    .roadmap-items {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (min-width: 1024px) {
    .roadmap-items {
      grid-template-columns: repeat(3, 1fr);
      max-width: 80%;
    }

    .section-title {
      font-size: 3em;
    }

    .section-subtitle {
      font-size: 1.4em;
    }
  }
</style>
