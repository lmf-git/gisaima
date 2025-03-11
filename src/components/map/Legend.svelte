<script>
  const { x = 0, y = 0, openDetails } = $props();
  
  const keypress = e => ['Enter', ' '].includes(e.key) && e.preventDefault() && openDetails()
</script>

<div 
  class="legend" 
  onclick={openDetails}
  onkeypress={keypress}
  role="button" 
  tabindex="0">
  {x}, {y}
</div>

<style>
  .legend {
    position: absolute;
    bottom: 2.5em;
    right: 0.5em;
    z-index: 1001;
    cursor: pointer;
    border-radius: 0.3em;
    padding: 0.6em 1em;
    color: rgba(0, 0, 0, 0.8);
    background-color: rgba(255, 255, 255, 0.4);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    border: 0.05em solid rgba(255, 255, 255, 0.1);
    box-shadow: none;
    font-weight: 500;

    font-size: 1.2em;
    font-weight: bold;
    color: rgba(0, 0, 0, 0.9);
    
    animation: fadeInLegend 0.7s ease-out forwards;
    opacity: 0;
    transform: translateY(0);
  }
  
  .legend:hover {
    background-color: rgba(255, 255, 255, 0.6);
    border-color: rgba(255, 255, 255, 0.5);
    transform: none;
    box-shadow: none;
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
</style>
