<script>
  const { 
    xAxisArray = [],
    yAxisArray = [],
    cols = 0,
    rows = 0
  } = $props();
</script>

<div class="axes-container">
  <div class="x-grid">
    {#each xAxisArray as coord}
      <div 
        class="axis-label" 
        class:center={coord.isCenter} 
        style="width: calc(100% / {cols});"
      >
        {coord.value}
      </div>
    {/each}
  </div>
  
  <div class="y-grid">
    {#each yAxisArray as coord}
      <div 
        class="axis-label" 
        class:center={coord.isCenter} 
        style="height: calc(100% / {rows});"
      >
        {coord.value}
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
    z-index: 3;
  }
  
  .x-grid, .y-grid {
    display: flex;
    position: absolute;
    background: transparent;
    box-shadow: none;
  }
  
  .x-grid {
    bottom: 0;
    left: 0;
    right: 0;
    height: 2em;
    flex-direction: row;
  }
  
  .y-grid {
    top: 0;
    left: 0;
    width: 2em;
    height: 100%;
    flex-direction: column;
  }
  
  .axis-label {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9em;
    color: var(--color-text);
    /* background-color: rgba(20, 30, 50, 0.6); */
    backdrop-filter: blur(0.125em);
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 0.05em solid rgba(255, 255, 255, 0.1);
    pointer-events: auto;
    transition: all 0.2s ease;
    text-shadow: 0 0 0.1875em rgba(0, 0, 0, 0.7);
  }
  
  .y-grid .axis-label {
    padding: 0.1em;
  }
  
  .axis-label.center {
    font-weight: bold;
    background-color: rgba(50, 100, 150, 0.7);
    text-shadow: 0 0 0.1875em rgba(0, 0, 0, 0.8);
    border-color: rgba(255, 255, 255, 0.3);
  }
  
  .axis-label:hover {
    filter: brightness(1.2);
    background-color: rgba(60, 80, 120, 0.8);
    border-color: rgba(255, 255, 255, 0.5);
  }
</style>
