<script>
  // Change categories with their items
  const changeCategories = [
    {
      title: "World Generation",
      changes: [
        "Enhanced procedural terrain generation with more diverse biome transitions",
        "Added 12 new rare terrain types with unique resource yields",
        "Improved map loading performance by 35%",
        "Added new volcanic biome with special resources"
      ]
    },
    {
      title: "Battle System",
      changes: [
        "Redesigned combat mechanics for more strategic depth",
        "Added terrain advantages in battle",
        "Implemented progressive battle resolution over multiple ticks",
        "Added ability to join ongoing battles with reinforcements"
      ]
    },
    {
      title: "Economy & Trading",
      changes: [
        "New banking system with loans and interest rates",
        "Resource transportation mechanics with risk/reward options",
        "Expanded city resource management system",
        "Added fluctuating market prices based on resource availability"
      ]
    },
    {
      title: "User Interface",
      changes: [
        "Completely redesigned the main map interface",
        "Added detailed tooltips throughout the UI",
        "New minimap with toggle between detailed and expanded views",
        "Improved mobile responsiveness"
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
