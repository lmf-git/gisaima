<script>
  import Logo from '../components/Logo.svelte';
</script>

<svelte:head>
  <title>Gisaima - A Territory Control Strategy Game</title>
  <meta name="description" content="A territory control strategy game based on ancient board games" />
</svelte:head>

<main class="container">
  <section class="showcase">
    <Logo extraClass="logo" />
    <h1 class="title">GISAIMA</h1>
    <p class="subtitle">A territory control strategy game inspired by ancient board games</p>
    <div class="actions">
      <a href="/play" class="button primary">Play Now</a>
      <a href="/learn" class="button secondary">Learn How to Play</a>
    </div>
  </section>

  <section class="features">
    <h2 class="heading">Game Features</h2>
    <div class="grid">
      <div class="card">
        <h3 class="subheading">Territory Control</h3>
        <p class="text">Capture territory and expand your influence across the board</p>
      </div>
      <div class="card">
        <h3 class="subheading">Strategic Depth</h3>
        <p class="text">Plan several moves ahead and outmaneuver your opponents</p>
      </div>
      <div class="card">
        <h3 class="subheading">Ancient Inspiration</h3>
        <p class="text">Based on traditional board game concepts with modern twists</p>
      </div>
      <div class="card">
        <h3 class="subheading">Multiplayer</h3>
        <p class="text">Challenge friends or match with opponents online</p>
      </div>
    </div>
  </section>

  <section class="howto">
    <h2 class="heading">How To Play</h2>
    <div class="overview">
      <div class="content">
        <p class="text">Gisaima is played on a grid where players take turns placing stones to capture territory. 
        The goal is to control the most territory by the end of the game.</p>
        <p class="text">Players can capture opponent's pieces by surrounding them, adding strategic depth to each move.</p>
        <a href="/rules" class="link">Read the full rules →</a>
      </div>
      <div class="visual">
        <!-- Game board placeholder -->
        <div class="preview">
          <p class="text">Game Board Preview</p>
        </div>
      </div>
    </div>
  </section>
</main>

<style>
  .container {
    max-width: 75em;
    margin: 0 auto;
    padding: 2em;
    color: var(--color-text);
  }

  .showcase {
    text-align: center;
    padding: 3em 1em;
  }

  .title {
    font-size: 3.5em;
    margin: 0.5em 0;
    letter-spacing: 0.2em;
    color: var(--color-heading);
    text-shadow: 0 0 0.625em rgba(193, 19, 22, 0.5);
  }

  .subtitle {
    font-size: 1.2em;
    color: var(--color-text-secondary);
    margin-bottom: 2em;
  }

  .actions {
    display: flex;
    justify-content: center;
    gap: 1.5em;
    margin-top: 2.5em;
  }

  /* Hero CTA buttons styling - make them more imposing */
  .actions :global(.button) {
    font-size: 1.5em;
    padding: 0.8em 1.8em;
    font-weight: 700;
    letter-spacing: 0.05em;
    transition: all 0.3s ease;
    box-shadow: 0 0.3em 0.8em var(--color-shadow);
    text-transform: uppercase;
  }
  
  .actions :global(.button:hover) {
    transform: translateY(-0.2em) scale(1.05);
    box-shadow: 0 0.5em 1em var(--color-shadow);
  }
  
  .actions :global(.button.primary) {
    border: 0.05em solid rgba(255, 255, 255, 0.3);
  }
  
  .actions :global(.button.secondary) {
    border: 0.05em solid rgba(255, 255, 255, 0.1);
  }

  .features, .howto {
    padding: 3em 0;
  }

  .heading {
    text-align: center;
    margin-bottom: 2em;
    color: var(--color-pale-green);
    text-shadow: 0 0 0.3125em rgba(12, 8, 33, 0.7);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15em, 1fr));
    gap: 2em;
  }

  .card {
    padding: 1.5em;
    border-radius: 0.5em;
    background-color: var(--color-card-bg);
    box-shadow: 0 0.25em 0.375em var(--color-shadow);
    border: 0.0625em solid var(--color-card-border);
  }

  .subheading {
    color: var(--color-subheading);
    margin-bottom: 0.75em;
  }

  .text {
    color: var(--color-text);
  }

  .overview {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2em;
  }

  .content, .visual {
    flex: 1 1 18.75em;
  }

  .link {
    color: var(--color-link);
    text-decoration: none;
    font-weight: 500;
  }

  .link:hover {
    text-decoration: underline;
    color: var(--color-link-hover);
  }

  .preview {
    height: 18.75em;
    background: linear-gradient(135deg, var(--color-deep-blue), var(--color-dark-teal-blue));
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.5em;
    border: 0.125em dashed var(--color-muted-teal);
  }

  @media (max-width: 768px) {
    .title {
      font-size: 2.5em;
    }
  }

  .showcase :global(.logo) {
    width: 7.5em;
    height: auto;
    margin: 0 auto;
    filter: drop-shadow(0 0 0.5em rgba(193, 19, 22, 0.6));
  }
</style>