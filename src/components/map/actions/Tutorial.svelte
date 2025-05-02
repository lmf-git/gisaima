<script>
  import { onMount } from 'svelte'
  import { browser } from '$app/environment'
  import { slide } from 'svelte/transition'
  import Close from '../../icons/Close.svelte';
  import { map } from "../../../lib/stores/map.js";
  import Trophy from '../../icons/Trophy.svelte'; // Import the Trophy icon

  const { 
    onVisibilityChange = () => {},
    hideToggleButton = false,
    onToggle = () => {},
    onOpenAchievements = () => {} // New prop for opening achievements
  } = $props();
  
  let closed = $state(false);
  let ready = $state(false);
  
  let worldExpanded = $state(false)
  let terrainExpanded = $state(false)
  let structuresExpanded = $state(false)
  let unitsExpanded = $state(false)
  let controlsExpanded = $state(false)
  
  function initializeTutorialState() {
    if (browser) {
      closed = localStorage.getItem('tutorial-state') === 'closed'
      ready = true
      onVisibilityChange(ready && !closed);
    }
  }
  
  onMount(initializeTutorialState);
  
  const close = () => {
    closed = true
    localStorage.setItem('tutorial-state', 'closed')
    onVisibilityChange(false);
  }
  
  const open = () => {
    closed = false
    localStorage.setItem('tutorial-state', 'open')
    onVisibilityChange(true);
  }
  
  const toggleWorld = () => worldExpanded = !worldExpanded
  const toggleTerrain = () => terrainExpanded = !terrainExpanded
  const toggleStructures = () => structuresExpanded = !structuresExpanded
  const toggleUnits = () => unitsExpanded = !unitsExpanded
  const toggleControls = () => controlsExpanded = !controlsExpanded

  function handleToggle() {
    if (closed) {
      open();
    } else {
      close();
    }
    onToggle(!closed);
  }

  export function toggle() {
    handleToggle();
  }

  $effect(() => {
    if (ready && window) {
      window.addEventListener('tutorial:toggle', () => handleToggle());
    }
    return () => {
      if (window) {
        window.removeEventListener('tutorial:toggle', () => handleToggle());
      }
    };
  });

  function handleSectionKeyDown(event, sectionId) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      switch (sectionId) {
        case 'world': toggleWorld(); break;
        case 'terrain': toggleTerrain(); break;
        case 'structures': toggleStructures(); break;
        case 'units': toggleUnits(); break;
        case 'controls': toggleControls(); break;
      }
    }
  }

  function openAchievements() {
    // Close the tutorial first
    close();
    // Then open achievements panel via callback
    onOpenAchievements();
  }
</script>

{#if ready && !closed}
  <div class="tutorial-container">
    <div class="box">
      <button class="close-btn" aria-label="Close tutorial" onclick={close}>
        <Close size="2.2em" color="rgba(0, 0, 0, 0.6)" />
      </button>
      <h2>Welcome to Gisaima</h2>
      
      <div class="content">
        <p class="summary">
          Gisaima is a strategic, open-world MMO with procedurally generated maps, territory control, 
          and real-time interaction. Explore infinite worlds, establish structures, and compete with other players.
        </p>
        
        <div class="features">
          <div class="feature collapsible">
            <div 
              class="section-header"
              onclick={toggleWorld}
              onkeydown={(e) => handleSectionKeyDown(e, 'world')}
              role="button"
              tabindex="0"
              aria-expanded={worldExpanded}
            >
              <h3>Map Exploration</h3>
              <div class="collapse-button">
                {worldExpanded ? '▲' : '▼'}
              </div>
            </div>
            {#if worldExpanded}
              <div class="section-content" transition:slide|local={{ duration: 300 }}>
                <ul>
                  <li>Explore an infinite procedurally generated world</li>
                  <li>Grid-based coordinate system for precise navigation</li>
                  <li>URL updates with coordinates for location sharing</li>
                  <li>Hover over tiles to view detailed information</li>
                </ul>
              </div>
            {/if}
          </div>
          
          <div class="feature collapsible">
            <div 
              class="section-header"
              onclick={toggleTerrain}
              onkeydown={(e) => handleSectionKeyDown(e, 'terrain')}
              role="button"
              tabindex="0"
              aria-expanded={terrainExpanded}
            >
              <h3>Terrain & Biomes</h3>
              <div class="collapse-button">
                {terrainExpanded ? '▲' : '▼'}
              </div>
            </div>
            {#if terrainExpanded}
              <div class="section-content" transition:slide|local={{ duration: 300 }}>
                <ul>
                  <li>Multiple biomes with unique resource characteristics</li>
                  <li>Terrain rarity system: common to mythic quality</li>
                  <li>Rare terrain provides strategic advantages</li>
                  <li>Special visual effects indicate valuable terrain</li>
                </ul>
              </div>
            {/if}
          </div>
          
          <div class="feature collapsible">
            <div 
              class="section-header"
              onclick={toggleStructures}
              onkeydown={(e) => handleSectionKeyDown(e, 'structures')}
              role="button"
              tabindex="0"
              aria-expanded={structuresExpanded}
            >
              <h3>Structures</h3>
              <div class="collapse-button">
                {structuresExpanded ? '▲' : '▼'}
              </div>
            </div>
            {#if structuresExpanded}
              <div class="section-content" transition:slide|local={{ duration: 300 }}>
                <ul>
                  <li>Build spawn points (🔵), watchtowers (🗼), and fortresses (🏰)</li>
                  <li>Structures provide territorial control and strategic advantages</li>
                  <li>Different structures have unique functions and requirements</li>
                  <li>Strategic placement is key to efficient expansion</li>
                </ul>
              </div>
            {/if}
          </div>
          
          <div class="feature collapsible">
            <div 
              class="section-header"
              onclick={toggleUnits}
              onkeydown={(e) => handleSectionKeyDown(e, 'units')}
              role="button"
              tabindex="0"
              aria-expanded={unitsExpanded}
            >
              <h3>Units & Combat</h3>
              <div class="collapse-button">
                {unitsExpanded ? '▲' : '▼'}
              </div>
            </div>
            {#if unitsExpanded}
              <div class="section-content" transition:slide|local={{ duration: 300 }}>
                <ul>
                  <li>Command unit groups for expansion and resource gathering</li>
                  <li>Combat factors: unit strength, terrain, and positioning</li>
                  <li>Form alliances with other players for mutual benefits</li>
                  <li>Balance expansion with defensive capabilities</li>
                </ul>
              </div>
            {/if}
          </div>
        </div>
        
        <div class="controls collapsible">
          <div 
            class="section-header"
            onclick={toggleControls}
            onkeydown={(e) => handleSectionKeyDown(e, 'controls')}
            role="button"
            tabindex="0"
            aria-expanded={controlsExpanded}
          >
            <h3>Controls</h3>
            <div class="collapse-button">
              {controlsExpanded ? '▲' : '▼'}
            </div>
          </div>
          {#if controlsExpanded}
            <div class="section-content" transition:slide|local={{ duration: 300 }}>
              <div class="controls-grid">
                <div class="control-item">
                  <span class="key">WASD</span> or <span class="key">↑←↓→</span> Navigate map
                </div>
                <div class="control-item">
                  <span class="key">Click</span> Move to location
                </div>
                <div class="control-item">
                  <span class="key">Drag</span> Pan map view
                </div>
                <div class="control-item">
                  <span class="key">Hover</span> View tile details
                </div>
              </div>
            </div>
          {/if}
        </div>
        
        <div class="achievements-section">
          <h3>Track Your Progress</h3>
          <p>Check your achievements to see your progress in the game and discover challenges to complete.</p>
          <button class="achievements-button" onclick={openAchievements}>
            <Trophy extraClass="button-icon" />
            View Achievements
          </button>
        </div>
        
        <div class="guide-link-container">
          <p>Want to learn more about the game?</p>
          <a href="/guide" target="_blank" rel="noopener noreferrer" class="guide-link">
            Read the Complete Guide
            <span class="external-icon">↗</span>
          </a>
        </div>
        
        <button class="start-button" onclick={close}>Start Exploring</button>
      </div>
    </div>
  </div>
{:else if ready && closed && !hideToggleButton}
  <button class="help" onclick={handleToggle} aria-label="Show tutorial">?</button>
{/if}

<style>
  .tutorial-container {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1010;
    pointer-events: none;
    animation: fadeInTutorial 0.7s ease-out forwards;
    opacity: 0;
  }
  
  .box {
    position: relative;
    background-color: rgba(255, 255, 255, 0.85);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.3em;
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(0.5em);
    -webkit-backdrop-filter: blur(0.5em);
    padding: 2em;
    max-width: 50em;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    color: rgba(0, 0, 0, 0.8);
    pointer-events: auto;
    animation: appear 0.3s ease-out;
  }
  
  @keyframes appear {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes fadeInTutorial {
    0% {
      opacity: 0;
      transform: translateY(1em);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  h2 {
    color: rgba(0, 0, 0, 0.8);
    text-align: center;
    font-size: 2em;
    margin: 0 0 0.8em 0;
    font-family: var(--font-heading);
    font-weight: 700;
  }
  
  h3 {
    color: rgba(0, 0, 0, 0.7);
    margin: 0 0 0.5em 0;
    font-family: var(--font-heading);
    font-weight: 600;
  }
  
  .content {
    display: flex;
    flex-direction: column;
    gap: 1.5em;
    font-family: var(--font-body);
  }
  
  .summary {
    font-size: 1.1em;
    line-height: 1.5;
    text-align: center;
    margin: 0;
    font-weight: 500;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .close-btn {
    position: absolute;
    top: 0.8em;
    right: 0.8em;
    height: 3em;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.05);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    opacity: 0.7;
    transition: all 0.2s ease;
    padding: 0;
    color: rgba(0, 0, 0, 0.6);
  }
  
  .close-btn:hover {
    opacity: 1;
    background-color: rgba(0, 0, 0, 0.1);
    transform: scale(1.05);
  }
  
  .start-button {
    align-self: center;
    background-color: var(--color-button-primary, #4285f4);
    color: white;
    border: none;
    border-radius: 0.3em;
    padding: 0.8em 2em;
    font-size: 1.2em;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-top: 1em;
    font-family: var(--font-heading);
    font-weight: 600;
  }
  
  .start-button:hover {
    background-color: var(--color-button-primary-hover, #3367d6);
    transform: translateY(-0.125em);
    box-shadow: 0 0.2em 0.5em rgba(0, 0, 0, 0.2);
  }
  
  .help {
    display: none;
  }
  
  .collapsible {
    margin-bottom: 0.8em;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.4em;
    overflow: hidden;
  }
  
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(0, 0, 0, 0.05);
    border: none;
    color: inherit;
    padding: 0.8em 1em;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.2s;
    width: 100%;
    user-select: none;
  }
  
  .section-header:hover {
    background: rgba(0, 0, 0, 0.08);
  }
  
  .section-header:focus {
    outline: 2px solid rgba(66, 133, 244, 0.6);
    outline-offset: -2px;
  }
  
  .section-header h3 {
    margin: 0;
    font-size: 1.1em;
  }
  
  .collapse-button {
    background: none;
    border: none;
    color: rgba(0, 0, 0, 0.5);
    font-size: 0.8em;
    cursor: pointer;
    padding: 0.2em 0.5em;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5em;
    min-height: 1.5em;
    border-radius: 50%;
  }
  
  .section-header:hover .collapse-button {
    color: rgba(0, 0, 0, 0.8);
    background-color: rgba(0, 0, 0, 0.05);
  }
  
  .section-content {
    background: rgba(255, 255, 255, 0.5);
    padding: 1em;
  }
  
  .feature ul {
    margin: 0;
    padding: 0em 0em 0em 1.5em;
    line-height: 1.4;
    font-weight: 400;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .controls-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10em, 1fr));
    gap: 0.8em;
    padding: 0;
    background: transparent;
  }

  .achievements-section {
    margin-top: 1em;
    padding: 1em;
    background-color: rgba(255, 255, 255, 0.5);
    border-radius: 0.5em;
    border: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  .achievements-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5em;
    background-color: rgba(255, 213, 79, 0.2);
    color: #d4a017;
    border: 1px solid rgba(255, 213, 79, 0.5);
    border-radius: 0.3em;
    font-family: var(--font-heading);
    font-weight: 600;
    padding: 0.6em 1em;
    margin-top: 0.8em;
    cursor: pointer;
    transition: all 0.2s;
    width: 100%;
  }
  
  .achievements-button:hover {
    background-color: rgba(255, 213, 79, 0.3);
    transform: translateY(-2px);
  }
  
  :global(.achievements-button .button-icon) {
    width: 1.2em;
    height: 1.2em;
    fill: #d4a017;
  }

  @media (max-width: 768px) {
    .features {
      display: flex;
      flex-direction: column;
      gap: 0.8em;
    }
  }
</style>
