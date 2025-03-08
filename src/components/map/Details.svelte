<script>
  import { fly } from 'svelte/transition';
  import { onMount } from 'svelte';
  
  // Props for the component
  export let x = 0;
  export let y = 0;
  export let show = false;
  
  // Props for terrain data
  export let biome = { name: "unknown", color: "#808080" };
  export let height = 0;
  export let moisture = 0;
  export let continent = 0;
  export let slope = 0;
  export let riverValue = 0; // Added river value
  export let lakeValue = 0;  // Added lake value
  export let displayColor = "#808080"; // New prop for the processed color
  
  // Add debugging to verify correct data is received when props change
  $: if (biome) {
    console.log(`Details component receiving biome: ${biome?.name} at coordinates (${x}, ${y})`);
  }
  
  // Log when details are shown with current terrain data
  $: if (show) {
    console.log(`Details visible with biome: ${biome?.name}, moisture: ${moisture}, height: ${height}`);
  }
  
  // Handle close action
  function handleClose() {
    show = false;
  }
  
  // Helper function to format percentage
  const formatPercent = (value) => `${Math.round(value * 100)}%`;
  
  // Get elevation category based on height
  $: elevationCategory = 
    height < 0.1 ? "Very Low" :
    height < 0.3 ? "Low" :
    height < 0.5 ? "Medium" :
    height < 0.7 ? "High" :
    height < 0.85 ? "Very High" : "Extreme";
  
  // Get moisture category based on moisture
  $: moistureCategory = 
    moisture < 0.2 ? "Very Dry" :
    moisture < 0.4 ? "Dry" :
    moisture < 0.6 ? "Moderate" :
    moisture < 0.8 ? "Wet" : "Very Wet";
  
  // Determine potential resources based on biome
  $: resources = getBiomeResources(biome.name);
  
  // Function to determine resources based on biome type
  function getBiomeResources(biomeName) {
    const resourceMap = {
      // Water biomes
      "abyssal_ocean": ["Deep Sea Fish", "Rare Minerals"],
      "deep_ocean": ["Fish", "Salt"],
      "ocean": ["Fish", "Salt", "Seaweed"],
      "ocean_trench": ["Rare Minerals", "Deep Sea Creatures"],
      
      // River biomes
      "mountain_stream": ["Fresh Water", "Gold Deposits", "Trout"],
      "river": ["Fresh Water", "Clay", "River Fish"],
      "wide_river": ["Fresh Water", "Clay", "River Fish", "Reeds"],
      "riverbank": ["Fertile Soil", "Clay", "Reeds"],
      "riverine_forest": ["Hardwood", "Medicinal Plants", "Game"],
      "flood_plain": ["Fertile Soil", "Rice", "Flax"],
      
      // Add new river types
      "stream": ["Fresh Water", "Small Fish", "Pebbles"],
      "tributary": ["Fresh Water", "Clay", "Small Fish"],
      
      // Lake biomes
      "highland_lake": ["Fresh Water", "Trout", "Minerals"],
      "lake": ["Fresh Water", "Lake Fish", "Clay"],
      "lowland_lake": ["Fresh Water", "Lake Fish", "Reeds"],
      "lakeshore": ["Clay", "Reeds", "Waterfowl"],
      
      // Coastal biomes
      "sandy_beach": ["Sand", "Shells", "Coconuts"],
      "pebble_beach": ["Stones", "Clay"],
      "rocky_shore": ["Rocks", "Shellfish"],
      
      // Mountain biomes
      "snow_cap": ["Snow", "Crystal"],
      "alpine": ["Ice", "Rare Herbs"],
      "mountain": ["Stone", "Iron", "Gems"],
      "dry_mountain": ["Stone", "Copper", "Gold"],
      "desert_mountains": ["Stone", "Gold", "Minerals"],
      
      // Highland biomes
      "glacier": ["Ice", "Pure Water"],
      "highland_forest": ["Wood", "Game", "Herbs"],
      "highland": ["Stone", "Berries", "Game"],
      "rocky_highland": ["Stone", "Ore"],
      "mesa": ["Red Clay", "Minerals"],
      
      // Mid-elevation biomes
      "tropical_rainforest": ["Exotic Wood", "Fruits", "Medicinal Plants"],
      "temperate_forest": ["Wood", "Game", "Berries"],
      "woodland": ["Wood", "Game"],
      "shrubland": ["Herbs", "Berries", "Small Game"],
      "badlands": ["Clay", "Minerals"],
      
      // Lower elevation biomes
      "swamp": ["Reed", "Herbs", "Mushrooms"],
      "marsh": ["Reed", "Clay", "Herbs"],
      "grassland": ["Hay", "Game", "Herbs"],
      "savanna": ["Fibers", "Game"],
      "desert_scrub": ["Cactus", "Minerals"],
      
      // Low land biomes
      "bog": ["Peat", "Special Plants"],
      "wetland": ["Reed", "Herbs", "Fish"],
      "plains": ["Crops", "Game"],
      "dry_plains": ["Grains", "Game"],
      "desert": ["Sand", "Rare Herbs"]
    };
    
    return resourceMap[biomeName] || ["Unknown"];
  }
  
  // Watch for show prop changes to open/close the details element
  let detailsElement;
  $: if (detailsElement) {
    if (show && !detailsElement.open) detailsElement.open = true;
    else if (!show && detailsElement.open) detailsElement.open = false;
  }
  
  // Handle the toggle event to keep the show prop in sync
  function handleToggle(event) {
    show = detailsElement.open;
  }
  
  // Allow ESC key to close the details
  function handleKeydown(event) {
    if (event.key === 'Escape' && show) {
      show = false;
    }
  }
  
  // Add water feature categories with enhanced river detection
  $: waterFeature = 
    riverValue > 0.4 ? "River" :
    lakeValue > 0.5 ? "Lake" :
    riverValue > 0.25 ? "Stream" :
    riverValue > 0.2 ? "Riverbank" :
    lakeValue > 0.2 ? "Lake Shore" : "None";
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="details-container" class:visible={show}>
  <details 
    class="location-details" 
    bind:this={detailsElement}
    on:toggle={handleToggle}
  >
    <summary class="details-summary">
      <h2>Location Details: ({x}, {y})</h2>
      <!-- Custom toggle icon added in CSS -->
    </summary>
    
    <div class="details-content" transition:fly={{ y: -10, duration: 200 }}>
      <div class="info-section">
        <h3>Biome</h3>
        <div class="biome-info">
          <!-- Use the processed color from the map instead of the raw biome color -->
          <div class="biome-color" style="background-color: {displayColor}"></div>
          <p>{biome.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
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
        {#if resources.length > 0}
          <ul>
            {#each resources as resource}
              <li>{resource}</li>
            {/each}
          </ul>
        {:else}
          <p>No resources found</p>
        {/if}
      </div>
      
      <div class="details-footer">
        <button class="close-button" on:click={handleClose}>Close</button>
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
</style>
