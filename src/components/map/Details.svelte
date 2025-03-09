<script>
  import { fly } from 'svelte/transition';
  import { getBiomeResources } from '../../lib/map/biomes.js';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  // Use correct runes syntax for props
  const { 
    x = 0, 
    y = 0, 
    show = false,
    biome = { name: "unknown", displayName: "Unknown", color: "#808080" },
    height = 0,
    moisture = 0,
    continent = 0,
    riverValue = 0,
    lakeValue = 0, 
    displayColor = "#808080",
    slope = 0 
  } = $props();
  
  // Replace $events with standard event dispatch
  function updateShow(value) {
    dispatch('showChange', value);
  }
  
  // State for biomeName tracking
  const state = $state({
    lastBiomeName: '',
    resourcesList: []
  });

  // Convert reactive declarations to derived values
  const biomeDisplayName = $derived(
    biome?.displayName || (biome?.name || "Unknown").replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  );

  const elevationCategory = $derived(
    height < 0.1 ? "Very Low" :
    height < 0.3 ? "Low" :
    height < 0.5 ? "Medium" :
    height < 0.7 ? "High" :
    height < 0.85 ? "Very High" : "Extreme"
  );
  
  const moistureCategory = $derived(
    moisture < 0.2 ? "Very Dry" :
    moisture < 0.4 ? "Dry" :
    moisture < 0.6 ? "Moderate" :
    moisture < 0.8 ? "Wet" : "Very Wet"
  );

  const waterFeature = $derived(
    riverValue > 0.4 ? "River" :
    lakeValue > 0.5 ? "Lake" :
    riverValue > 0.25 ? "Stream" :
    riverValue > 0.2 ? "Riverbank" :
    lakeValue > 0.2 ? "Lake Shore" : "None"
  );

  const slopeCategory = $derived(
    slope < 0.05 ? "Flat" :
    slope < 0.1 ? "Gentle" :
    slope < 0.2 ? "Moderate" :
    slope < 0.3 ? "Steep" : "Extreme"
  );

  // Use effect for biome resources update
  $effect(() => {
    if (biome?.name && biome.name !== state.lastBiomeName) {
      state.lastBiomeName = biome.name;
      state.resourcesList = getBiomeResources(biome.name);
    }
  });

  // Handle close action
  function handleClose() {
    updateShow(false);
  }
  
  // Helper function to format percentage
  const formatPercent = (value) => `${Math.round(value * 100)}%`;
  
  // Handle the toggle event to keep the show prop in sync
  function handleToggle(event) {
    updateShow(event.target.open);
  }
  
  // Allow ESC key to close the details
  function handleKeydown(event) {
    if (event.key === 'Escape' && show) {
      updateShow(false);
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="details-container" class:visible={show} aria-hidden={!show}>
  <details 
    class="location-details" 
    open={show}
    ontoggle={handleToggle}
  >
    <summary class="details-summary">
      <h2>Location Details: ({x}, {y})</h2>
    </summary>
    
    <div class="details-content" transition:fly={{ y: -10, duration: 200 }}>
      <div class="info-section">
        <h3>Biome</h3>
        <div class="biome-info">
          <div class="biome-color" style="background-color: {displayColor}"></div>
          <p>{biomeDisplayName}</p>
        </div>
      </div>
      
      <div class="info-grid">
        <div class="info-section">
          <h3>Elevation</h3>
          <p>{elevationCategory} ({formatPercent(height)})</p>
        </div>
        
        <div class="info-section">
          <h3>Moisture</h3>
          <p>{moistureCategory} ({formatPercent(moisture)})</p>
        </div>
        
        <div class="info-section">
          <h3>Continent</h3>
          <p>{formatPercent(continent)}</p>
        </div>
        
        <div class="info-section">
          <h3>Water Feature</h3>
          <p>{waterFeature}</p>
        </div>
      </div>
      
      <div class="info-section">
        <h3>Resources</h3>
        {#if state.resourcesList.length > 0}
          <ul>
            {#each state.resourcesList as resource}
              <li>{resource}</li>
            {/each}
          </ul>
        {:else}
          <p>No resources found</p>
        {/if}
      </div>
      
      <div class="info-section">
        <h3>Terrain</h3>
        <p>{slopeCategory}</p>
      </div>
      
      <div class="details-footer">
        <button class="close-button" onclick={handleClose}>Close</button>
      </div>
    </div>
  </details>
</div>

<style>
  .details-container {
    position: fixed;
    top: 3.5em; /* Position below the header */
    right: 1em;
    max-width: 25em;
    width: 90%;
    z-index: 1000;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }
  
  .details-container.visible {
    opacity: 1;
    pointer-events: all;
  }
  
  .location-details {
    background: var(--color-dark-teal);
    border-radius: 0.5em;
    box-shadow: 0 0.5em 1.5em var(--color-shadow);
    overflow: hidden;
    width: 100%;
    color: var(--color-text);
    border: 0.0625em solid var(--color-card-border);
  }
  
  .details-summary {
    padding: 1em 1.5em;
    background: var(--color-deep-blue);
    border-bottom: 0.0625em solid var(--color-dark-gray-blue);
    cursor: pointer;
    user-select: none;
    list-style: none; /* Remove default marker */
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
  }
  
  /* Remove the default disclosure triangle */
  .details-summary::-webkit-details-marker {
    display: none;
  }
  
  /* Add custom disclosure triangle */
  .details-summary::after {
    content: "▼";
    font-size: 0.8em;
    color: var(--color-muted-teal);
    transition: transform 0.2s ease;
  }
  
  /* Rotate arrow when open */
  details[open] .details-summary::after {
    transform: rotate(180deg);
  }
  
  .details-summary h2 {
    margin: 0;
    font-size: 1.3em;
    color: var(--color-heading);
  }
  
  .details-content {
    padding: 1.5em;
  }
  
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1em;
    margin-bottom: 1.5em;
  }
  
  .biome-info {
    display: flex;
    align-items: center;
    gap: 0.8em;
  }
  
  .biome-color {
    width: 1.5em;
    height: 1.5em;
    border-radius: 0.25em;
    border: 0.0625em solid var(--color-card-border);
  }
  
  .info-section {
    margin-bottom: 1.5em;
  }
  
  .info-section h3 {
    font-size: 1.1em;
    margin: 0 0 0.5em 0;
    color: var(--color-subheading);
  }
  
  .info-section p {
    margin: 0;
    color: var(--color-text);
  }
  
  .info-section ul {
    margin: 0;
    padding-left: 1.2em;
    color: var(--color-text);
  }
  
  .details-footer {
    margin-top: 1em;
    display: flex;
    justify-content: flex-end;
    border-top: 0.0625em solid var(--color-dark-gray-blue);
    padding-top: 1em;
  }
  
  .close-button {
    background: var(--color-button-secondary);
    color: var(--color-text);
    border: none;
    padding: 0.5em 1.2em;
    border-radius: 0.3em;
    cursor: pointer;
    font-size: 0.9em;
    transition: background 0.2s ease;
  }
  
  .close-button:hover {
    background: var(--color-button-secondary-hover);
    transform: translateY(-0.125em);
  }

  /* Ensure focus styles for keyboard accessibility */
  .close-button:focus {
    outline: 2px solid var(--color-button-secondary-hover);
    outline-offset: 2px;
  }
</style>
