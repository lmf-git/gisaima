<script>
  import { mapState } from "../../lib/stores/map.js";
  
  const { 
    xAxisArray = [],
    yAxisArray = [],
    xData = {},
    yData = {},
    cols = 0,
    rows = 0
  } = $props();
  
  // Get axis data with fallback
  function getAxisData(value, isXAxis) {
    const dataMap = isXAxis ? xData : yData;
    return dataMap[value] || { color: "#444444", biomeName: "Unknown" };
  }
  
  // Format biome name for display
  function formatBiomeName(name) {
    return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
</script>

<div class="axes-container">
  <div class="x-grid">
    {#each xAxisArray as coord}
      {@const data = getAxisData(coord.value, true)}
      <div 
        class="axis-label" 
        class:center={coord.isCenter} 
        style="
          width: calc(100% / {cols}); 
          background-color: {data.color};
        "
        title={formatBiomeName(data.biomeName)}
      >
        <span class="coord-value">{coord.value}</span>
        <span class="biome-name">{formatBiomeName(data.biomeName)}</span>
      </div>
    {/each}
  </div>
  
  <div class="y-grid">
    {#each yAxisArray as coord}
      {@const data = getAxisData(coord.value, false)}
      <div 
        class="axis-label" 
        class:center={coord.isCenter} 
        style="
          height: calc(100% / {rows}); 
          background-color: {data.color};
        "
        title={formatBiomeName(data.biomeName)}
      >
        <span class="coord-value">{coord.value}</span>
        <span class="biome-name">{formatBiomeName(data.biomeName)}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .axes-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 3; /* Ensure axes appear above grid */
  }
  
  .x-grid, .y-grid {
    display: flex;
    position: absolute;
    background: var(--color-deep-blue);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4);  /* Match other components */
  }
  
  .x-grid {
    bottom: 0;
    left: 0;
    right: 0;
    height: 2em;
    flex-direction: row;
    border-radius: 4px 4px 0 0;  /* Match radius on top edges */
  }
  
  .y-grid {
    top: 0;
    left: 0;
    width: 2em;
    height: 100%;
    flex-direction: column;
    border-radius: 0 4px 0 0;  /* Match radius on top-right corner */
  }
  
  .axis-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: 0.9em;
    color: var(--color-text);
    /* Remove fixed background color as we set it dynamically now */
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 0.05em solid var(--color-card-border);
    pointer-events: auto;
    transition: all 0.2s ease;
    position: relative;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
  }
  
  .y-grid .axis-label {
    padding: 0.1em;
  }
  
  .axis-label.center {
    font-weight: bold;
    /* Keep bold for center but don't force background color */
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.4);
  }
  
  .coord-value {
    display: block;
    font-weight: bold;
  }
  
  .biome-name {
    display: none;
    font-size: 0.8em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  
  /* Add hover effect for better visual feedback */
  .axis-label:hover {
    filter: brightness(1.1);
    border-color: rgba(255, 255, 255, 0.5);
    z-index: 10;
    overflow: visible;
  }
  
  .axis-label:hover .biome-name {
    display: block;
    position: absolute;
    background: rgba(0, 0, 0, 0.7);
    padding: 0.2em 0.4em;
    border-radius: 0.2em;
    z-index: 10;
  }
  
  .x-grid .axis-label:hover .biome-name {
    bottom: 100%;
    margin-bottom: 0.2em;
  }
  
  .y-grid .axis-label:hover .biome-name {
    left: 100%;
    margin-left: 0.2em;
    white-space: nowrap;
  }
</style>
