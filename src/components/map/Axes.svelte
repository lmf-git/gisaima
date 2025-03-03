<script>
  // Accept arrays of coordinates for x and y axes
  export let xAxisArray = [];
  export let yAxisArray = [];
  export let cols = 0;
  export let rows = 0;
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
    background: rgba(20, 20, 40, 0.85);
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
    font-size: 0.9rem;
    color: white;
    background: rgba(32, 32, 52, 0.9);
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 0.05em solid rgba(58, 58, 80, 0.3);
  }
  
  .axis-label.center {
    background: rgba(255, 68, 68, 0.7);
    font-weight: bold;
  }
</style>
