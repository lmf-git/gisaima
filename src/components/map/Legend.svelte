<script>
  const { x = 0, y = 0, openDetails } = $props();
  
  // Handle keyboard interaction
  const keypress = e => ['Enter', ' '].includes(e.key) && e.preventDefault() && openDetails()
</script>

<div 
  class="legend-container" 
  onclick={openDetails}
  onkeypress={keypress}
  role="button" 
  tabindex="0">
  <div class="coordinates">({x}, {y})</div>
</div>

<style>
  .legend-container {
    position: absolute;
    top: 0.5em; /* Fixed: removed extra 'em' */
    right: 0.5em;
    z-index: 1001;
    cursor: pointer;
    border-radius: 0.3em;
    padding: 0.6em 1em;
    color: var(--color-text-primary);
    box-shadow: 0 0.1em 0.3em var(--color-shadow);
    text-align: center;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    border: 0.1em solid var(--color-panel-border);
    background-color: var(--color-panel-bg);
    
    /* Add animation for fade-in and slide-up */ /* Fixed: removed stray slash */
    animation: fadeInUp 0.7s ease-out forwards;
    animation-delay: 0.3s; /* Slightly faster than minimap */
    transform: translateY(20px);
    opacity: 0;
  }
  
  @keyframes fadeInUp {
    0% {
      transform: translateY(20px);
      opacity: 0;
    }
    100% {
      transform: translateY(0);
      opacity: 1;
    }
  }
  
  .legend-container:hover {
    transform: translateY(-2px);
    box-shadow: 0 0.2em 0.5em var(--color-shadow);
    border-color: var(--color-bright-accent);
  }
  
  .legend-container:active {
    transform: translateY(0);
  }
  
  .coordinates {
    font-size: 1.2em;
    font-weight: bold;
    color: var(--color-bright-accent);
  }
</style>
