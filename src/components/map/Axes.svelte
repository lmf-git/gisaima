<script>
  // Use correct runes syntax for props
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
      <div class="axis-label" class:center={coord.isCenter} style="width: calc(100% / {cols});">
        {coord.value}
      </div>
    {/each}
  </div>
  
  <div class="y-grid">
    {#each yAxisArray as coord}
      <div class="axis-label" class:center={coord.isCenter} style="height: calc(100% / {rows});">
        {coord.value}
      </div>
    {/each}
  </div>
</div>

<style>
  .axes-container {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  
  .x-grid, .y-grid {
    display: flex;
    position: absolute;
    background: var(--color-deep-blue);
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
    background: var(--color-dark-teal);
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 0.05em solid var(--color-card-border);
  }
  
  .axis-label.center {
    background: var(--color-button-primary);
    font-weight: bold;
  }
</style>
