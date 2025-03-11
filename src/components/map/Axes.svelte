<script>
  const { 
    xAxisArray = [],
    yAxisArray = [],
    cols = 0,
    rows = 0
  } = $props();
</script>

<div class="axes">
  <div class="x">
    {#each xAxisArray as coord, i}
      <div 
        class="label" 
        class:center={coord.isCenter} 
        style="width: calc(100% / {cols}); --index: {i};">
        {coord.value}
      </div>
    {/each}
  </div>
  
  <div class="y">
    {#each yAxisArray as coord, i}
      <div 
        class="label" 
        class:center={coord.isCenter} 
        style="height: calc(100% / {rows}); --index: {i};">
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
    /* Remove opacity: 0 and animation - make axes visible immediately */
    opacity: 1;
  }
  
  /* Remove the fadeIn animation keyframes and references */
  
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
    color: rgba(0, 0, 0, 0.8); /* Changed to dark text color for better contrast */
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 0.05em solid rgba(255, 255, 255, 0.1); /* Show border immediately */
    pointer-events: auto;
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7); /* Reversed shadow for dark text */
    background-color: rgba(255, 255, 255, 0.4); /* Increased opacity for better readability */
    font-weight: 500; /* Slightly bolder text for better readability */
    
    /* Remove animation delays and opacity:0 - show immediately */
    opacity: 1;
    
    /* Keep the transition for hover effects */
    transition: background-color 0.2s ease, border-color 0.2s ease;
  }
  
  /* Remove fadeIn animations */
  
  .label.center {
    font-weight: bold;
    background-color: rgba(192, 192, 192, 0.7); /* Changed from blue to silver */
    color: rgba(0, 0, 0, 0.9); /* Changed to dark text for better contrast on silver */
    text-shadow: 0 0 0.1875em rgba(255, 255, 255, 0.8); /* Reversed shadow for dark text */
    /* Set border color immediately */
    border-color: rgba(255, 255, 255, 0.5);
    /* Remove animation */
  }
  
  /* Remove fadeInCenterLabel animation */
  
  .label:hover {
    /* Remove filter: brightness */
    background-color: rgba(255, 255, 255, 0.6); /* Even brighter on hover */
    border-color: rgba(255, 255, 255, 0.5);
  }
  
  /* Remove duplicate animation on container */
  :global(.axes-container) {
    z-index: 3;
    pointer-events: none;
  }
  
  /* Also adjust the axis animations to be in sync with container */
  :global(.x-axis),
  :global(.y-axis) {
    opacity: 1; /* Show immediately */
  }
</style>


