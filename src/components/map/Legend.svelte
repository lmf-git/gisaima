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
    bottom: 2.5em; /* Position above the axes */
    right: 0.5em;
    z-index: 1001;
    cursor: pointer;
    border-radius: 0.3em;
    padding: 0.6em 1em;
    /* Axes-like styling */
    color: rgba(0, 0, 0, 0.8);
    background-color: rgba(255, 255, 255, 0.4);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    border: 0.05em solid rgba(255, 255, 255, 0.1);
    box-shadow: none;
    font-weight: 500;
    
    /* Animation matching axes approach */
    animation: fadeInLegend 0.7s ease-out forwards;
    animation-delay: 0.3s;
    opacity: 0;
    transform: translateY(0);
  }
  
  @keyframes fadeInLegend {
    0% {
      opacity: 0;
      transform: translateY(1em);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .legend-container:hover {
    background-color: rgba(255, 255, 255, 0.6);
    border-color: rgba(255, 255, 255, 0.5);
    transform: none;
    box-shadow: none;
  }
  
  .legend-container:active {
    transform: scale(0.98);
  }
  
  .coordinates {
    font-size: 1.2em;
    font-weight: bold;
    color: rgba(0, 0, 0, 0.9);
  }
</style>
