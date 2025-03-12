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
      <a href="/map" class="button primary">Play Now</a>
      <a href="/map" class="button secondary">Learn How to Play</a>
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
  
  <footer class="footer">
    <div class="links">
      <a href="/login">Login</a>
      <a href="/signup">Sign Up</a>
      <a href="/map">Play</a>
    </div>
    <p class="copyright">© 2023 Gisaima</p>
  </footer>
</main>

<style>
  .container {
    max-width: 75em;
    margin: 0 auto;
    padding: 2em;
    color: var(--color-text);
    font-family: var(--font-body);
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
    font-family: var(--font-heading);
    font-weight: 700; /* Bold for main title */
  }

  .subtitle {
    font-size: 1.2em;
    color: var(--color-text-secondary);
    margin-bottom: 2em;
    font-family: var(--font-body);
    font-weight: 500; /* Medium for subtitle */
  }

  .actions {
    display: flex;
    justify-content: center;
    gap: 1.5em;
    margin-top: 2.5em;
    flex-wrap: wrap;
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
    text-decoration: none;
  }
  
  .actions :global(.button:hover) {
    transform: translateY(-0.2em) scale(1.05);
    box-shadow: 0 0.5em 1em var(--color-shadow);
  }
  
  .actions :global(.button.primary) {
    background-color: var(--color-button-primary);
    color: var(--color-text);
    border: 0.05em solid var(--color-muted-teal);
  }
  
  .actions :global(.button.primary:hover) {
    background-color: var(--color-button-primary-hover);
  }
  
  .actions :global(.button.secondary) {
    background-color: rgba(0, 0, 0, 0.3);
    color: var(--color-text);
    border: 0.05em solid var(--color-panel-border);
  }
  
  .actions :global(.button.secondary:hover) {
    background-color: rgba(0, 0, 0, 0.4);
  }

  .features, .howto {
    padding: 3em 0;
  }

  .heading {
    text-align: center;
    margin-bottom: 2em;
    color: var(--color-pale-green);
    text-shadow: 0 0 0.3125em rgba(12, 8, 33, 0.7);
    font-weight: 700; /* Bold for section headers */
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15em, 1fr));
    gap: 2em;
  }

  .card {
    padding: 1.5em;
    border-radius: 0.5em;
    background-color: var(--color-panel-bg);
    box-shadow: 0 0.25em 0.375em var(--color-shadow);
    border: 0.0625em solid var(--color-panel-border);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  
  .card:hover {
    transform: translateY(-0.2em);
    box-shadow: 0 0.4em 0.6em var(--color-shadow);
  }

  .subheading {
    color: var(--color-muted-teal);
    margin-bottom: 0.75em;
    font-family: var(--font-heading);
    font-weight: 600; /* Semi-bold for card headers */
  }

  .text {
    color: var(--color-text);
    font-family: var(--font-body);
    font-weight: 400; /* Regular for most text */
  }

  .overview {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2em;
  }

  .content, .visual {
    flex: 1 1 20em;
  }

  .link {
    color: var(--color-pale-green);
    text-decoration: none;
    font-weight: 500;
    transition: color 0.2s ease;
  }

  .link:hover {
    text-decoration: underline;
    color: var(--color-muted-teal);
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

  .footer {
    margin-top: 3em;
    padding-top: 2em;
    border-top: 1px solid var(--color-panel-border);
    text-align: center;
  }
  
  .links {
    display: flex;
    justify-content: center;
    gap: 2em;
    margin-bottom: 1em;
    flex-wrap: wrap;
  }
  
  .footer a {
    color: var(--color-pale-green);
    text-decoration: none;
  }
  
  .footer a:hover {
    color: var(--color-muted-teal);
    text-decoration: underline;
  }
  
  .copyright {
    color: var(--color-text-secondary);
    font-size: 0.9em;
    font-weight: 300; /* Light weight for footer text */
  }

  .showcase :global(.logo) {
    width: 7.5em;
    height: auto;
    margin: 0 auto;
    filter: drop-shadow(0 0 0.5em rgba(193, 19, 22, 0.6));
  }
  
  @media (max-width: 768px) {
    .container {
      padding: 1em;
    }
    
    .title {
      font-size: 2.5em;
    }
    
    .actions :global(.button) {
      font-size: 1.2em;
      padding: 0.8em 1.5em;
      width: 100%;
    }
    
    .grid {
      gap: 1em;
    }
    
    .links {
      gap: 1em;
    }
  }
  
  @media (max-width: 480px) {
    .showcase {
      padding: 2em 0.5em;
    }
    
    .title {
      font-size: 2em;
    }
    
    .subtitle {
      font-size: 1em;
    }
  }
</style>