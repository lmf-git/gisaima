<script>
  const { x = 0, y = 0, open, terrainColour = "#16393F" } = $props();
  const keypress = e => ['Enter', ' '].includes(e.key) && (e.preventDefault(), open());
</script>

<!-- Make the entire component clickable with explicit handlers -->
<div 
  class="legend-container" 
  onclick={open}
  onkeypress={keypress}
  role="button" 
  tabindex="0"
  style="background-color: {terrainColour};">
  <div class="coordinates">({x}, {y})</div>
</div>

<style>
  .legend-container {
    position: absolute;
    top: 0.5em;    /* Small offset from very top */
    right: 0.5em;  /* Small offset from very right */
    z-index: 1001;
    cursor: pointer;
    border-radius: 0.3em;
    padding: 0.6em 1em;
    color: var(--color-text);
    box-shadow: 0 0.1em 0.3em var(--color-shadow);
    text-align: center;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    border: 0.1em solid rgba(255, 255, 255, 0.15);
  }
  
  .legend-container:hover {
    transform: translateY(-2px);
    box-shadow: 0 0.2em 0.5em var(--color-shadow);
  }
  
  .legend-container:active {
    transform: translateY(0);
  }
  
  .coordinates {
    font-size: 1.2em;
    font-weight: bold;
    color: var(--color-heading);
  }
</style>
