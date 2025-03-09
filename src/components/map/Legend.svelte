<script>
  // Use correct runes syntax for props
  const { 
    x = 0, 
    y = 0, 
    title = "Current Position", 
    openDetails 
  } = $props();
  
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
    bottom: 1em; /* Changed from top: 1em to bottom: 1em */
    right: 1em;
    z-index: 10;
  }
  
  .coordinate-legend {
    background: var(--color-dark-teal);
    border: 0.05em solid var(--color-card-border);
    border-radius: 0.3em;
    padding: 0;
    color: var(--color-text);
    box-shadow: 0 0.2em 0.4em var(--color-shadow);
    min-width: 10em;
    cursor: pointer;
    user-select: none;
    transition: background-color 0.2s ease;
  }
  
  .coordinate-legend:hover {
    background: var(--color-deep-blue);
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
    color: var(--color-muted-teal);
    transition: transform 0.2s;
  }
  
  /* Rotate indicator when open */
  details[open] .legend-summary::after {
    transform: rotate(180deg);
  }
  
  .legend-title {
    font-size: 0.9em;
    font-weight: bold;
    color: var(--color-subheading);
  }
  
  .legend-value {
    font-size: 1.1em;
    font-weight: bold;
    color: var(--color-heading);
    margin-top: 0.3em;
  }
  
  .legend-details {
    padding: 0 0.75em 0.75em;
    display: flex;
    flex-direction: column;
    align-items: center;
    border-top: 0.0625em solid var(--color-card-border);
    padding-top: 0.75em;
    margin-top: 0.2em;
  }
  
  .legend-keyboard-hint {
    font-size: 0.75em;
    color: var(--color-text-secondary);
    font-style: italic;
    margin-bottom: 0.8em;
  }
  
  .details-button {
    background: var(--color-button-primary);
    color: var(--color-text);
    border: none;
    padding: 0.5em 1em;
    border-radius: 0.3em;
    cursor: pointer;
    font-size: 0.9em;
    transition: all 0.2s ease;
    width: 100%;
  }
  
  .details-button:hover {
    background: var(--color-button-primary-hover);
    transform: translateY(-0.125em);
    box-shadow: 0 0.1875em 0.3125em var(--color-shadow);
  }
</style>
