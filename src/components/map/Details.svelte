<script>
  import { fly } from 'svelte/transition';
  
  const {
    x = 0,
    y = 0,
    show = false,
    biome = { name: "unknown", color: "#808080" },
    height = 0,
    moisture = 0,
    continent = 0,
    slope = 0,
    riverValue = 0,
    lakeValue = 0,
    displayColor = "#808080",
    onClose
  } = $props();
  
  let detailsElement = null;
  
  // Convert $effect blocks to $derived for elegance
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
    
  const resources = $derived(
    biome && biome.name ? getBiomeResources(biome.name) : ["Unknown"]
  );
  
  // Synchronize details element open state with show prop
  $effect(() => {
    if (detailsElement) {
      detailsElement.open = show;
    }
  });
  
  function formatPercent(value) {
    return `${Math.round(value * 100)}%`;
  }
  
  // Function to determine resources based on biome type
  function getBiomeResources(biomeName) {
    if (!biomeName) return ["Unknown"];
    
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
  
  function handleToggle(event) {
    if (!detailsElement.open) {
      onClose?.();
    }
  }
  
  function handleKeydown(event) {
    if (event.key === 'Escape' && show) {
      onClose?.();
    }
  }

  // Add the missing handleClose function
  function handleClose() {
    onClose?.();
  }
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
          <!-- Display the exact color that was passed from the map -->
          <div class="biome-color" style="background-color: {displayColor || biome.color};"></div>
          <p>{biome?.name?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown'}</p>
        </div>
      </div>
      
      <!-- Explicitly show the coordinates to confirm they're correct -->
      <div class="info-section">
        <h3>Location</h3>
        <p><strong>Coordinates:</strong> ({x}, {y})</p>
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
        {#if resources && resources.length > 0}
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
