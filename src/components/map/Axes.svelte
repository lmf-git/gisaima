<script>
  const { 
    xAxisArray = [],
    yAxisArray = [],
    cols = 0,
    rows = 0,
    onXAxisClick = () => {},
    onYAxisClick = () => {}
  } = $props();
</script>

<div class="axes">
  <div class="x">
    {#each xAxisArray as coord, i}
      <button 
        class="label" 
        class:center={coord.isCenter} 
        onclick={() => onXAxisClick(coord.value)}
        style="width: calc(100% / {cols}); --index: {i};">
        {coord.value}
      </button>
    {/each}
  </div>
  
  <div class="y">
    {#each yAxisArray as coord, i}
      <button 
        class="label" 
        class:center={coord.isCenter} 
        onclick={() => onYAxisClick(coord.value)}
        style="height: calc(100% / {rows}); --index: {i};">
        {coord.value}
      </button>
    {/each}
  </div>
</div>

<style>
  .axes {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 3;
    opacity: 1;
  }
  
  /* x positioning and style */
  .x {
    display: flex;
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2em;
    flex-direction: row;
    background: transparent;
  }
  
  /* y positioning and style */
  .y {
    display: flex;
    position: absolute;
    top: 0;
    left: 0;
    width: 2em;
    height: 100%;
    flex-direction: column;
    background: transparent;
  }
  
  .label {
    /* Reset button styling */
    appearance: none;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
    text-align: inherit;
    cursor: pointer;
    
    /* Existing label styling */
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.8);
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 0.05em solid rgba(255, 255, 255, 0.1);
    pointer-events: auto;
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    background-color: rgba(255, 255, 255, 0.4);
    font-weight: 500;
    opacity: 1;
    transition: background-color 0.2s ease, border-color 0.2s ease;
    cursor: pointer;
  }
  
  .label.center {
    font-weight: bold;
    background-color: rgba(192, 192, 192, 0.7);
    color: rgba(0, 0, 0, 0.9);
    text-shadow: 0 0 0.1875em rgba(255, 255, 255, 0.8);
    border-color: rgba(255, 255, 255, 0.5);
  }
  
  .label:hover {
    background-color: rgba(255, 255, 255, 0.7);
    border-color: rgba(255, 255, 255, 0.7);
    box-shadow: 0 0 0.3em rgba(255, 255, 255, 0.5);
  }
  
  :global(.axes-container) {
    z-index: 3;
    pointer-events: none;
  }
  
  :global(.x-axis),
  :global(.y-axis) {
    opacity: 1;
  }
</style>


