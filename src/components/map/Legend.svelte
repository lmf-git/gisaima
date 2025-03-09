<script>
  const { x = 0, y = 0, openDetails } = $props();
</script>

<!-- Make the entire component clickable -->
<div class="legend-container" on:click={openDetails} role="button" tabindex="0">
  <div class="coordinate-legend">
    <div class="coordinates">({x}, {y})</div>
  </div>
</div>

<style>
  .legend-container {
    position: absolute;
    top: 1em;
    right: 1em;
    z-index: 10;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  
  .legend-container:hover {
    transform: translateY(-2px);
  }
  
  .legend-container:active {
    transform: translateY(0);
  }
  
  .coordinate-legend {
    background: var(--color-dark-teal);
    border-radius: 0.3em;
    padding: 0.6em 1em;
    color: var(--color-text);
    box-shadow: 0 0.1em 0.3em var(--color-shadow);
    text-align: center;
  }
  
  .coordinates {
    font-size: 1.2em;
    font-weight: bold;
    color: var(--color-heading);
  }
</style>
