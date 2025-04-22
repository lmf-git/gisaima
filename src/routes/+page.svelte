<script>
  import Showcase from '../components/Showcase.svelte';
  import Features from '../components/Features.svelte';
  import Media from '../components/Media.svelte';
</script>

<svelte:head>
  <title>Gisaima - Strategic Territory Control MMO</title>
  <meta name="description" content="Explore infinite procedurally generated worlds in this strategic MMO. Discover rare terrain, build structures, command unit groups, and forge alliances in an ever-expanding universe." />
</svelte:head>

<div class="container">
  <!-- Showcase component -->
  <Showcase />
  
  <!-- Add a brief introduction section -->
  <section class="intro">
    <div class="intro-content">
      <h2>Welcome to Infinite Worlds</h2>
      <p>
        Gisaima is an open-world strategic MMO where you explore procedurally generated landscapes,
        discover rare resources, construct strategic outposts, and engage with other players
        across an effectively infinite universe.
      </p>
      <p>
        Every coordinate is unique, every biome holds secrets, and every decision shapes your journey.
        Will you build a vast empire, forge powerful alliances, or become a legendary explorer of the unknown?
      </p>
      <div class="cta-container">
        <a href="/play" class="cta-button">Start Your Journey</a>
        <a href="/guide" class="cta-button secondary">Read the Guide</a>
      </div>
    </div>
  </section>
  
  <Media />
  <Features />
</div>

<style>
  .container {
    color: var(--color-text);
  }
  
  .intro {
    padding: 3em 1em 4em;
    background: linear-gradient(180deg, 
      var(--color-bg-dark) 0%, 
      var(--color-bg) 100%);
    text-align: center;
  }
  
  .intro-content {
    max-width: 800px;
    margin: 0 auto;
  }
  
  .intro h2 {
    color: var(--color-pale-green);
    font-size: 2.5em;
    margin-bottom: 0.5em;
    font-family: var(--font-heading);
    font-weight: 400;
  }
  
  .intro p {
    font-size: 1.2em;
    line-height: 1.6;
    margin-bottom: 1em;
    color: var(--color-text);
    font-family: var(--font-body);
  }
  
  .cta-container {
    margin-top: 2em;
    display: flex;
    flex-wrap: wrap;
    gap: 1em;
    justify-content: center;
  }
  
  .cta-button {
    display: inline-block;
    padding: 0.8em 2em;
    background-color: var(--color-button-primary);
    color: var(--color-text);
    border-radius: 0.3em;
    font-size: 1.1em;
    text-decoration: none;
    font-weight: 600;
    transition: all 0.2s ease;
    border: 0.05em solid transparent;
    font-family: var(--font-heading);
  }
  
  .cta-button:hover {
    transform: translateY(-0.2em);
    box-shadow: 0 0.4em 0.6em var(--color-shadow);
  }
  
  .cta-button.secondary {
    background-color: transparent;
    border-color: var(--color-muted-teal);
    color: var(--color-muted-teal);
  }
  
  .cta-button.secondary:hover {
    background-color: rgba(100, 255, 218, 0.1);
  }
  
  @media (max-width: 768px) {
    .intro h2 {
      font-size: 2em;
    }
    
    .intro p {
      font-size: 1.1em;
    }
    
    .cta-button {
      width: 100%;
    }
  }
</style>