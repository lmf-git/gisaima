<script>
  // Update to use $props() runes API
  const { extraClass = '' } = $props();

  // Features data using state for potential future reactivity
  const features = $state([
    {
      title: 'Infinite Worlds',
      description: 'Explore endless procedurally generated realms, each with unique challenges and opportunities'
    },
    {
      title: 'Territory Control',
      description: 'Capture territory and expand your influence across the board'
    },
    {
      title: 'Strategic Depth',
      description: 'Plan several moves ahead and outmaneuver your opponents'
    },
    {
      title: 'Open Source',
      description: 'Community-driven development with full transparency and collaboration'
    },
    {
      title: 'No Pay-to-Win',
      description: 'Equal playing field for all - success depends solely on skill and strategy'
    },
    {
      title: 'Cross-Device Sync',
      description: 'Real-time gameplay synchronization across all your devices'
    },
    {
      title: 'Procedural Maps',
      description: 'Every game board is uniquely generated, ensuring fresh experiences every time'
    },
    {
      title: 'Ancient Inspiration',
      description: 'Based on traditional board game concepts with modern twists'
    },
    {
      title: 'Multiplayer',
      description: 'Challenge friends or match with opponents online'
    }
  ]);
  
  // For potential future feature filtering/sorting functionality
  let filterTag = $state('');
  
  // Derived state to support potential feature filtering
  const filteredFeatures = $derived(
    filterTag ? features.filter(f => f.title.toLowerCase().includes(filterTag.toLowerCase())) 
              : features
  );
</script>

<section class="features {extraClass}">
  <h2 class="heading">Game Features</h2>
  <div class="grid">
    {#each filteredFeatures as feature}
      <div class="card">
        <h3 class="subheading">{feature.title}</h3>
        <p class="text">{feature.description}</p>
      </div>
    {/each}
  </div>
</section>

<style>
  .features {
    padding: 4em 0 6em;
    margin-bottom: 0;
  }

  .heading {
    text-align: center;
    margin-bottom: 1.5em;
    color: var(--color-pale-green);
    text-shadow: 0 0 0.3125em rgba(12, 8, 33, 0.7);
    font-family: var(--font-heading);
    font-weight: 400;
    font-size: 1.8em;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1em;
    grid-auto-rows: minmax(10em, auto);
    max-width: 1200px;
    margin: 0 auto;
    width: 90%;
  }

  .card {
    padding: 1.5em;
    border-radius: 0.5em;
    background-color: var(--color-panel-bg);
    box-shadow: 0 0.25em 0.375em var(--color-shadow);
    border: 0.0625em solid var(--color-panel-border);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    display: flex;
    flex-direction: column;
    min-height: 10em;
    height: 100%;
  }
  
  .card:hover {
    transform: translateY(-0.2em);
    box-shadow: 0 0.4em 0.6em var(--color-shadow);
  }

  .subheading {
    color: var(--color-muted-teal);
    margin-bottom: 0.75em;
    font-family: var(--font-heading);
    font-weight: 400;
    font-size: 1.6em;
    min-height: 1.5em;
    display: flex;
    align-items: center;
  }

  .text {
    color: var(--color-text);
    flex: 1;
    line-height: 1.5;
    font-size: 1em;
    font-family: var(--font-body);
  }

  /* Responsive styles */
  @media (min-width: 481px) {
    .heading {
      font-size: 2.2em;
    }
  }

  @media (min-width: 769px) {
    .heading {
      font-size: 2.6em;
    }
    
    .grid {
      grid-template-columns: repeat(3, 1fr);
      gap: 2em;
      grid-auto-rows: minmax(12em, auto);
      width: 100%;
    }
    
    .card {
      min-height: 12em;
    }
    
    .features {
      padding: 4em 0 6em;
    }
  }
</style>
