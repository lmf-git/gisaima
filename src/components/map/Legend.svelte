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
    bottom: 0.5em; /* Changed from top to bottom */
    right: 0.5em;
    z-index: 1001;
    cursor: pointer;
    border-radius: 0.3em;
    padding: 0.6em 1em;
    color: var(--color-text);
    box-shadow: 0 0.1em 0.3em var(--color-shadow);
    text-align: center;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    border: 0.1em solid rgba(255, 255, 255, 0.15);
    background-color: rgba(0, 0, 0, 0.6);
    
    /* Adjust animation for coming from bottom */
    animation: fadeInUp 0.7s ease-out forwards;
    animation-delay: 0.3s;
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
