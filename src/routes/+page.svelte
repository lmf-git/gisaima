<script>
  import Logo from '$lib/components/Logo.svelte';
</script>

<svelte:head>
  <title>Gisaima - A Territory Control Strategy Game</title>
  <meta name="description" content="A territory control strategy game based on ancient board games" />
</svelte:head>

<main class="container">
  <section class="showcase">
    <Logo size="large" />
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
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  }

  .showcase {
    text-align: center;
    padding: 3rem 1rem;
  }

  .title {
    font-size: 3.5rem;
    margin: 0.5rem 0;
    letter-spacing: 0.2rem;
    color: #2a4365;
  }

  .subtitle {
    font-size: 1.2rem;
    color: #4a5568;
    margin-bottom: 2rem;
  }

  .actions {
    display: flex;
    justify-content: center;
    gap: 1rem;
    margin-top: 2rem;
  }

  .button {
    padding: 0.8rem 1.8rem;
    border-radius: 0.25rem;
    text-decoration: none;
    font-weight: bold;
    transition: background-color 0.3s ease;
  }

  .primary {
    background-color: #4299e1;
    color: white;
  }

  .primary:hover {
    background-color: #3182ce;
  }

  .secondary {
    background-color: #e2e8f0;
    color: #2d3748;
  }

  .secondary:hover {
    background-color: #cbd5e0;
  }

  .features, .howto {
    padding: 3rem 0;
  }

  .heading {
    text-align: center;
    margin-bottom: 2rem;
    color: #2a4365;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 2rem;
  }

  .card {
    padding: 1.5rem;
    border-radius: 0.5rem;
    background-color: #edf2f7;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .subheading {
    color: #2c5282;
    margin-bottom: 0.75rem;
  }

  .overview {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2rem;
  }

  .content, .visual {
    flex: 1 1 300px;
  }

  .link {
    color: #4299e1;
    text-decoration: none;
    font-weight: 500;
  }

  .link:hover {
    text-decoration: underline;
  }

  .preview {
    height: 300px;
    background-color: #edf2f7;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.5rem;
    border: 2px dashed #a0aec0;
  }

  @media (max-width: 768px) {
    .title {
      font-size: 2.5rem;
    }
  }
</style>
