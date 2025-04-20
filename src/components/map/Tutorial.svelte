<script>
  import { onMount } from 'svelte'
  import { browser } from '$app/environment'
  import Close from '../../components/icons/Close.svelte';
  import { map } from "../../lib/stores/map.js";

  // Use proper Svelte 5 props
  const { 
    onVisibilityChange = () => {},
    hideToggleButton = false,
    onToggle = () => {} // Function to call when toggling
  } = $props();
  
  let closed = $state(false);
  let ready = $state(false);
  
  // Track expanded state for each section
  let worldExpanded = $state(false)
  let terrainExpanded = $state(false)
  let structuresExpanded = $state(false)
  let unitsExpanded = $state(false)
  let controlsExpanded = $state(false)
  
  function initializeTutorialState() {
    if (browser) {
      closed = localStorage.getItem('tutorial-state') === 'closed'
      ready = true
      
      // Notify parent of initial tutorial visibility state using the prop function
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
  
  // Toggle functions for each section
  const toggleWorld = () => worldExpanded = !worldExpanded
  const toggleTerrain = () => terrainExpanded = !terrainExpanded
  const toggleStructures = () => structuresExpanded = !structuresExpanded
  const toggleUnits = () => unitsExpanded = !unitsExpanded
  const toggleControls = () => controlsExpanded = !controlsExpanded

  // Toggle function that will be called by parent component
  function handleToggle() {
    if (closed) {
      open();
    } else {
      close();
    }
    onToggle(!closed); // Let parent know about the new state
  }

  // Make toggle function accessible from outside via event dispatch
  export function toggle() {
    handleToggle();
  }

  // Expose the API to the parent
  $effect(() => {
    if (ready && window) {
      // Make toggle function available via custom event
      window.addEventListener('tutorial:toggle', () => handleToggle());
    }
    return () => {
      if (window) {
        window.removeEventListener('tutorial:toggle', () => handleToggle());
      }
    };
  });
</script>

{#if ready && !closed}
  <div class="tut tutorial-container">
    <div class="box">
      <button class="close-btn" aria-label="Close tutorial" onclick={close}>
        <Close size="2.2em" color="var(--color-text)" />
      </button>
      <h2>Welcome to Gisaima</h2>
      
      <div class="content">
        <p class="summary">
          Gisaima is a strategic, open-world MMO with procedurally generated maps, territory control, 
          and real-time interaction. Explore infinite worlds, establish structures, and compete with other players.
        </p>
        
        <div class="features">
          <div class="feature collapsible">
            <button class="section-header" onclick={toggleWorld} aria-expanded={worldExpanded}>
              <h3>Map Exploration</h3>
              <span class="toggle-icon">{worldExpanded ? '−' : '+'}</span>
            </button>
            <div class="section-content" class:expanded={worldExpanded}>
              <ul>
                <li>Explore an infinite procedurally generated world</li>
                <li>Grid-based coordinate system for precise navigation</li>
                <li>URL updates with coordinates for location sharing</li>
                <li>Hover over tiles to view detailed information</li>
              </ul>
            </div>
          </div>
          
          <div class="feature collapsible">
            <button class="section-header" onclick={toggleTerrain} aria-expanded={terrainExpanded}>
              <h3>Terrain & Biomes</h3>
              <span class="toggle-icon">{terrainExpanded ? '−' : '+'}</span>
            </button>
            <div class="section-content" class:expanded={terrainExpanded}>
              <ul>
                <li>Multiple biomes with unique resource characteristics</li>
                <li>Terrain rarity system: common to mythic quality</li>
                <li>Rare terrain provides strategic advantages</li>
                <li>Special visual effects indicate valuable terrain</li>
              </ul>
            </div>
          </div>
          
          <div class="feature collapsible">
            <button class="section-header" onclick={toggleStructures} aria-expanded={structuresExpanded}>
              <h3>Structures</h3>
              <span class="toggle-icon">{structuresExpanded ? '−' : '+'}</span>
            </button>
            <div class="section-content" class:expanded={structuresExpanded}>
              <ul>
                <li>Build spawn points (🔵), watchtowers (🗼), and fortresses (🏰)</li>
                <li>Structures provide territorial control and strategic advantages</li>
                <li>Different structures have unique functions and requirements</li>
                <li>Strategic placement is key to efficient expansion</li>
              </ul>
            </div>
          </div>
          
          <div class="feature collapsible">
            <button class="section-header" onclick={toggleUnits} aria-expanded={unitsExpanded}>
              <h3>Units & Combat</h3>
              <span class="toggle-icon">{unitsExpanded ? '−' : '+'}</span>
            </button>
            <div class="section-content" class:expanded={unitsExpanded}>
              <ul>
                <li>Command unit groups for expansion and resource gathering</li>
                <li>Combat factors: unit strength, terrain, and positioning</li>
                <li>Form alliances with other players for mutual benefits</li>
                <li>Balance expansion with defensive capabilities</li>
              </ul>
            </div>
          </div>
        </div>
        
        <div class="controls collapsible">
          <button class="section-header" onclick={toggleControls} aria-expanded={controlsExpanded}>
            <h3>Controls</h3>
            <span class="toggle-icon">{controlsExpanded ? '−' : '+'}</span>
          </button>
          <div class="section-content" class:expanded={controlsExpanded}>
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
  .tut {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1010; /* Increase from 1000 to be higher than legend's 1001 */
    background-color: rgba(0, 0, 0, 0.7);

    transition: opacity 0.3s ease;
  }
  
  .box {
    position: relative;
    background: rgba(21, 38, 60, 0.95);
    border: 2px solid var(--color-muted-teal);
    border-radius: 0.5em;
    box-shadow: 0 0.3em 1em rgba(0, 0, 0, 0.5);
    padding: 2em;
    max-width: 50em;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch; /* Enable momentum scrolling on iOS */
    overscroll-behavior: contain; /* Prevent scroll chaining */
    color: var(--color-text);
  }
  
  h2 {
    color: var(--color-pale-green);
    text-align: center;
    font-size: 2em;
    margin: 0 0 0.8em 0;
    text-shadow: 0 0 0.5em rgba(0, 0, 0, 0.5);
    font-family: var(--font-heading);
    font-weight: 700; /* Bold for main tutorial header */
  }
  
  h3 {
    color: var(--color-muted-teal);
    margin: 0 0 0.5em 0;
    font-family: var(--font-heading);
    font-weight: 600; /* Semi-bold for section headers */
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
    font-weight: 500; /* Medium weight for important summary */
  }
  
  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(20em, 1fr));
    gap: 2em;
  }
  
  .feature ul {
    margin: 0;
    padding-left: 1.5em;
    line-height: 1.4;
    font-weight: 400; /* Regular weight for list items */
  }
  
  .feature li {
    margin-bottom: 0.5em;
  }
  
  .controls {
    text-align: center;
    margin: 1em 0;
    padding: 1em;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 0.3em;
  }
  
  .key {
    display: inline-block;
    background: var(--color-dark-teal);
    color: var(--color-text);
    font-weight: bold;
    padding: 0.2em 0.5em;
    border-radius: 0.2em;
    border: 1px solid var(--color-muted-teal);
    box-shadow: 0 0.1em 0.2em rgba(0, 0, 0, 0.3);
    font-family: var(--font-heading);
  }
  
  .close-btn {
    position: absolute;
    top: 0.8em;
    right: 0.8em;
    height: 3em;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    color: var(--color-text);
    cursor: pointer;
    opacity: 0.7;
    transition: all 0.2s ease;
    padding: 0;
  }
  
  .close-btn:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.1);
    transform: scale(1.05);
  }
  
  .start-button {
    align-self: center;
    background-color: var(--color-button-primary);
    color: var(--color-text);
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
    background-color: var(--color-button-primary-hover);
    transform: translateY(-0.125em);
    box-shadow: 0 0.2em 0.5em var(--color-shadow);
  }
  
  .help {
    display: none; /* Hide by default since we'll use the button in map-controls */
  }
  
  @keyframes fadeInHelp {
    0% {
      opacity: 0;
      transform: translateY(1em);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  @media (max-width: 768px) {
    .box {
      padding: 1.5em;
      max-height: 80vh; /* Slightly smaller height on mobile for better visibility of scrollable area */
      margin: 1em 0;
    }
    
    .features {
      grid-template-columns: 1fr;
    }
    
    h2 {
      font-size: 1.6em;
    }
    
    /* Additional padding for better touch area when scrolling */
    .content {
      padding-bottom: 1.5em;
    }
  }

  .tutorial-container {
    animation: fadeInTutorial 0.7s ease-out forwards;
    opacity: 0;
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

  .collapsible {
    margin-bottom: 0.8em;
    border: 1px solid rgba(var(--color-muted-teal-rgb), 0.3);
    border-radius: 0.4em;
    overflow: hidden;
  }
  
  .section-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(0, 0, 0, 0.2);
    border: none;
    color: inherit;
    padding: 0.8em 1em;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .section-header:hover {
    background: rgba(0, 0, 0, 0.3);
  }
  
  .section-header h3 {
    margin: 0;
    font-size: 1.1em;
  }
  
  .toggle-icon {
    font-size: 1.2em;
    font-weight: bold;
    color: var(--color-pale-green);
    width: 1.5em;
    height: 1.5em;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.2);
  }
  
  .section-content {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease-out;
  }
  
  .section-content.expanded {
    max-height: 20em; /* Adjust based on content needs */
  }
  
  .controls {
    text-align: left;
    margin: 1em 0;
    padding: 0;
    background: transparent;
    border-radius: 0.3em;
  }
  
  .feature ul {
    margin: 0;
    padding: 1em 1em 1em 2.5em;
    line-height: 1.4;
    font-weight: 400;
  }

  .controls-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10em, 1fr));
    gap: 0.8em;
    padding: 1em;
    background: rgba(0, 0, 0, 0.2);
  }
  
  .control-item {
    display: flex;
    align-items: center;
    gap: 0.5em;
    font-size: 0.9em;
  }

  .guide-link-container {
    text-align: center;
    margin: 1.5em 0;
    padding: 1em;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 0.4em;
    border: 1px solid rgba(var(--color-muted-teal-rgb), 0.2);
  }
  
  .guide-link-container p {
    margin: 0 0 0.8em 0;
    font-size: 0.95em;
    color: var(--color-pale-green);
  }
  
  .guide-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    background-color: rgba(100, 255, 218, 0.1);
    color: var(--color-pale-green);
    text-decoration: none;
    padding: 0.6em 1.2em;
    border-radius: 0.3em;
    border: 1px solid rgba(var(--color-muted-teal-rgb), 0.3);
    transition: all 0.2s ease;
    font-weight: 500;
  }
  
  .guide-link:hover {
    background-color: rgba(100, 255, 218, 0.2);
    transform: translateY(-0.1em);
  }
  
  .external-icon {
    font-size: 1.1em;
    line-height: 1;
  }
  
  .feature ul {
    margin: 0;
    padding: 1em 1em 1em 2.5em;
    line-height: 1.4;
    font-weight: 400;
  }
</style>
