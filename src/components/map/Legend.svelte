<script>
  // Use $props() syntax for Svelte 5's runes mode
  const { x = 0, y = 0, title = "Current Position", openDetails } = $props();
  
  // Function to handle the view details button click
  function handleViewDetails() {
    // Call the openDetails prop
    openDetails?.();
  }
</script>

<!-- Use native <details> element for accessible disclosure widget -->
<div class="legend-container">
  <details class="coordinate-legend" open>
    <summary class="legend-summary">
      <span class="legend-title">{title}</span>
      <span class="legend-value">X: {x}, Y: {y}</span>
    </summary>
    
    <div class="legend-details">
      <div class="legend-keyboard-hint">WASD/Arrows to Navigate</div>
      <button 
        class="details-button" 
        onclick={handleViewDetails}
        type="button"
      >
        View Full Details
      </button>
    </div>
  </details>
</div>

<style>
  .legend-container {
    position: absolute;
    top: 1em;
    right: 1em;
    z-index: 10;
  }
  
  .coordinate-legend {
    background: rgba(20, 20, 40, 0.85);
    border: 0.05em solid rgba(58, 58, 80, 0.8);
    border-radius: 0.3em;
    padding: 0;
    color: white;
    box-shadow: 0 0.2em 0.4em rgba(0, 0, 0, 0.3);
    min-width: 10em;
    cursor: pointer;
    user-select: none;
    transition: background-color 0.2s ease;
  }
  
  .coordinate-legend:hover {
    background: rgba(30, 30, 60, 0.9);
  }
  
  /* Style the summary element (clickable header) */
  .legend-summary {
    padding: 0.75em;
    display: flex;
    flex-direction: column;
    align-items: center;
    list-style: none; /* Remove default marker */
  }
  
  /* Remove the default disclosure triangle in WebKit */
  .legend-summary::-webkit-details-marker {
    display: none;
  }
  
  /* Add custom indicator */
  .legend-summary::after {
    content: '▼';
    font-size: 0.7em;
    margin-top: 0.3em;
    color: #aaa;
    transition: transform 0.2s;
  }
  
  /* Rotate indicator when open */
  details[open] .legend-summary::after {
    transform: rotate(180deg);
  }
  
  .legend-title {
    font-size: 0.9rem;
    font-weight: bold;
    color: #aaa;
  }
  
  .legend-value {
    font-size: 1.1rem;
    font-weight: bold;
    color: #fff;
    margin-top: 0.3em;
  }
  
  .legend-details {
    padding: 0 0.75em 0.75em;
    display: flex;
    flex-direction: column;
    align-items: center;
    border-top: 1px solid rgba(80, 80, 120, 0.4);
    padding-top: 0.75em;
    margin-top: 0.2em;
  }
  
  .legend-keyboard-hint {
    font-size: 0.75rem;
    color: #88a;
    font-style: italic;
    margin-bottom: 0.8em;
  }
  
  .details-button {
    background: #3a3a8c;
    color: white;
    border: none;
    padding: 0.5em 1em;
    border-radius: 0.3em;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background 0.2s ease;
    width: 100%;
  }
  
  .details-button:hover {
    background: #4a4ab8;
  }
</style>
