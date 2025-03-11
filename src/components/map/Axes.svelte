<script>
  const { 
    xAxisArray = [],
    yAxisArray = [],
    cols = 0,
    rows = 0
  } = $props()
</script>

<div class="axes">
  <!-- Replace nested divs with direct x -->
  <div class="x">
    {#each xAxisArray as coord}
      <div 
        class="label" 
        class:center={coord.isCenter} 
        style="width: calc(100% / {cols});">
        {coord.value}
      </div>
    {/each}
  </div>
  
  <!-- Replace nested divs with direct y -->
  <div class="y">
    {#each yAxisArray as coord}
      <div 
        class="label" 
        class:center={coord.isCenter} 
        style="height: calc(100% / {rows});">
        {coord.value}
      </div>
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
    animation: fadeIn 1.5s ease 2s forwards;
    opacity: 0;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
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
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9em;
    color: #333;
    background-color: rgba(255, 255, 255, 0.6);
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 0.05em solid rgba(255, 255, 255, 0.1);
    pointer-events: auto;
    transition: all 0.2s ease;
  }
  
  .label.center {
    font-weight: bold;
    background-color: rgba(192, 192, 192, 0.85);
    border-color: rgba(255, 255, 255, 0.3);
  }
  
  .label:hover {
    background-color: rgba(210, 210, 210, 0.9);
    border-color: rgba(255, 255, 255, 0.5);
  }
</style>
