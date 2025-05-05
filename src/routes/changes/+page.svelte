<script>
  // Array of update periods - we can expand this as new updates are released
  const updates = [
    {
      date: "April 2025",
      title: "World Generation & Battle Mechanics",
      description: "Major improvements to world generation, terrain types, and battle system enhancements.",
      link: "/changes/april-2025"
    },
    // Future updates would be added here
  ];
</script>

<svelte:head>
  <title>Gisaima - Changelog</title>
  <meta name="description" content="Keep track of all updates, improvements, and new features added to Gisaima over time." />
</svelte:head>

<div class="changelog-container">
  <div class="header">
    <h1>Changelog</h1>
    <p class="subtitle">Track the evolution of Gisaima through our regular updates and improvements</p>
  </div>

  <div class="updates-timeline">
    {#each updates as update}
      <div class="update-card">
        <div class="update-date">
          <span class="month-year">{update.date}</span>
        </div>
        <div class="update-content">
          <h2>{update.title}</h2>
          <p>{update.description}</p>
          <a href={update.link} class="read-more">Read Update Notes</a>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .changelog-container {
    max-width: 900px;
    margin: 7em auto 4em;
    padding: 0 1.5em;
  }

  .header {
    text-align: center;
    margin-bottom: 3em;
  }

  h1 {
    font-family: var(--font-heading);
    font-size: 3em;
    color: var(--color-heading);
    margin-bottom: 0.5em;
    font-weight: 500;
  }

  .subtitle {
    color: var(--color-text-secondary);
    font-size: 1.1em;
    max-width: 600px;
    margin: 0 auto;
  }

  .updates-timeline {
    position: relative;
  }

  .updates-timeline:before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 1.5em;
    width: 2px;
    background: var(--color-panel-border);
    z-index: -1;
  }

  .update-card {
    display: grid;
    grid-template-columns: 5em 1fr;
    gap: 2em;
    margin-bottom: 3em;
    position: relative;
  }

  .update-date {
    position: relative;
    text-align: center;
  }

  .update-date:before {
    content: '';
    position: absolute;
    width: 1.5em;
    height: 1.5em;
    background: var(--color-bright-accent);
    border-radius: 50%;
    left: 0.75em;
    transform: translateX(-50%);
    box-shadow: 0 0 0 0.5em rgba(100, 255, 218, 0.1);
  }

  .month-year {
    display: block;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-left: 2em;
    white-space: nowrap;
  }

  .update-content {
    background: rgba(17, 34, 64, 0.6);
    border: 1px solid var(--color-panel-border);
    border-radius: 0.5em;
    padding: 1.5em;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
  }

  .update-content:hover {
    transform: translateY(-3px);
    box-shadow: 0 0.5em 1em rgba(0, 0, 0, 0.15);
  }

  .update-content h2 {
    font-family: var(--font-heading);
    font-size: 1.5em;
    color: var(--color-text-primary);
    margin-bottom: 0.8em;
    font-weight: 500;
  }

  .update-content p {
    color: var(--color-text-secondary);
    line-height: 1.6;
    margin-bottom: 1.5em;
  }

  .read-more {
    display: inline-block;
    color: var(--color-bright-accent);
    text-decoration: none;
    font-weight: 500;
    position: relative;
    transition: color 0.2s ease;
  }

  .read-more:after {
    content: '';
    position: absolute;
    bottom: -3px;
    left: 0;
    width: 0;
    height: 2px;
    background: var(--color-bright-accent);
    transition: width 0.3s ease;
  }

  .read-more:hover:after {
    width: 100%;
  }

  @media (max-width: 600px) {
    .updates-timeline:before {
      left: 1em;
    }

    .update-card {
      grid-template-columns: 3em 1fr;
      gap: 1em;
    }

    .update-date:before {
      left: 0.5em;
    }

    .month-year {
      margin-left: 1em;
      font-size: 0.9em;
    }
  }
</style>
