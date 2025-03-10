<script>
  const { x = 0, y = 0, openDetails, displayColor = "#16393F" } = $props();

  const handleClick = e => (e.stopPropagation(), openDetails());
  const handleKeyPress = e => ['Enter', ' '].includes(e.key) && (e.preventDefault(), openDetails());
</script>

<!-- Make the entire component clickable with explicit handlers -->
<div 
  class="legend-container" 
  onclick={handleClick}
  onkeypress={handleKeyPress}
  role="button" 
  tabindex="0"
  style="background-color: {displayColor};"
>
  <div class="coordinates">({x}, {y})</div>
</div>

<style>
  .legend-container {
    position: absolute;
    top: -2.5em;  /* Position above minimap */
    right: 0;     /* Align with minimap right edge */
    margin-right: 1em;
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
