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
</script>

<svelte:head>
  <title>Gisaima - Game Guide</title>
  <meta name="description" content="Learn how to play Gisaima, a strategy territory control game with procedurally generated worlds." />
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
            class:active={activeSection === 'game-concepts'}
            onclick={() => scrollToSection('game-concepts')}
          >
            Game Concepts
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
        in the top navigation bar and follow the instructions to create your account.
      </p>
      <h3>Joining a World</h3>
      <p>
        After logging in, navigate to the "Worlds" page where you can browse available worlds
        or create your own. Each world has unique properties and terrain.
      </p>
    </section>

    <section id="game-concepts" class="guide-section">
      <h2>Game Concepts</h2>
      <p>
        Gisaima is a territory control game where players compete to expand their influence
        across procedurally generated maps. Understanding these core concepts will help you
        master the game.
      </p>
      <h3>Territory</h3>
      <p>
        Territory is the primary measure of power in Gisaima. The more territory you control,
        the more resources you can gather and the stronger your position becomes.
      </p>
      <h3>Resources</h3>
      <p>
        Different terrain types yield different resources. Managing your resource collection
        and allocation is key to successful expansion.
      </p>
    </section>

    <section id="game-mechanics" class="guide-section">
      <h2>Game Mechanics</h2>
      <p>
        Understanding how the game works mechanically will give you the edge against other players.
      </p>
      <h3>Turn Structure</h3>
      <p>
        Gisaima operates on a turn-based system where players make strategic decisions about
        expansion, defense, and resource allocation.
      </p>
      <h3>Movement</h3>
      <p>
        Units can move across the map according to terrain restrictions. Different unit types
        have different movement capabilities.
      </p>
    </section>

    <section id="strategy-tips" class="guide-section">
      <h2>Strategy Tips</h2>
      <p>
        Here are some key strategies to help you dominate in Gisaima:
      </p>
      <ul class="strategy-list">
        <li>
          <strong>Secure Resources Early:</strong> Focus on capturing resource-rich territories
          early in the game to fuel your expansion.
        </li>
        <li>
          <strong>Defensive Positioning:</strong> Use natural terrain features like mountains and rivers
          to create defensive boundaries for your territory.
        </li>
        <li>
          <strong>Alliance Building:</strong> Form strategic alliances with other players to
          counter dominant forces on the map.
        </li>
        <li>
          <strong>Balance Expansion:</strong> Don't overextend your territory beyond what you
          can effectively defend.
        </li>
      </ul>
    </section>

    <section id="faq" class="guide-section">
      <h2>Frequently Asked Questions</h2>
      <div class="faq-item">
        <h3>What happens if I lose all my territory?</h3>
        <p>
          If you lose all your territory, you'll need to restart your empire in a new location.
          The game offers "rebirth" mechanics to help players who have been eliminated.
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
  </main>
</div>

<style>
  .guide-container {
    display: flex;
    flex-direction: column;
    max-width: 1200px;
    margin: 7em auto 2em;
    padding: 0 1em;
    color: var(--color-text);
  }
  
  .sidebar {
    width: 100%;
    margin-bottom: 2em;
    position: relative;
  }
  
  .toc {
    background-color: var(--color-panel-bg);
    padding: 1.5em;
    border-radius: 0.5em;
    border: 1px solid var(--color-panel-border);
    box-shadow: 0 0.25em 0.5em var(--color-shadow);
  }
  
  .toc h2 {
    color: var(--color-pale-green);
    margin-bottom: 1em;
    font-family: var(--font-heading);
    font-weight: 400;
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
    color: var(--color-text-secondary);
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
    color: var(--color-pale-green);
    background-color: rgba(100, 255, 218, 0.05);
  }
  
  .toc button.active {
    color: var(--color-pale-green);
    background-color: rgba(100, 255, 218, 0.1);
  }
  
  .guide-content {
    flex: 1;
  }
  
  .guide-content h1 {
    font-size: 2.5em;
    color: var(--color-pale-green);
    margin-bottom: 1em;
    text-align: center;
    font-family: var(--font-heading);
    font-weight: 400;
  }
  
  .guide-section {
    margin-bottom: 3em;
    padding: 1em;
    background-color: var(--color-panel-bg);
    border-radius: 0.5em;
    border: 1px solid var(--color-panel-border);
  }
  
  .guide-section h2 {
    font-size: 1.8em;
    color: var(--color-pale-green);
    margin-bottom: 0.5em;
    font-family: var(--font-heading);
    font-weight: 400;
  }
  
  .guide-section h3 {
    font-size: 1.4em;
    color: var(--color-muted-teal);
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    font-family: var(--font-heading);
    font-weight: 400;
  }
  
  .guide-section p {
    margin-bottom: 1.2em;
    line-height: 1.6;
    font-family: var(--font-body);
  }
  
  .strategy-list {
    padding-left: 1.5em;
  }
  
  .strategy-list li {
    margin-bottom: 1em;
    line-height: 1.6;
  }
  
  .faq-item {
    margin-bottom: 1.5em;
  }
  
  .faq-item h3 {
    font-size: 1.2em;
    color: var(--color-pale-green);
  }
  
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
</style>
