<script>
  import { createEventDispatcher } from 'svelte';
  
  // Accept target coordinates as props
  export let x = 0;
  export let y = 0;
  export let title = "Current Position";
  
  // Initialize the dispatcher
  const dispatch = createEventDispatcher();
  
  // Function to handle clicks on the legend
  function handleClick() {
    dispatch('click', { x, y });
  }
</script>

<div 
  class="coordinate-legend"
  on:click={handleClick}
  on:keypress={e => e.key === 'Enter' && handleClick()}
  role="button"
  tabindex="0"
  aria-label="Show location details"
>
  <div class="legend-content">
    <div class="legend-title">{title}</div>
    <div class="legend-value">X: {x}, Y: {y}</div>
    <div class="legend-hint">(Click for details)</div>
  </div>
</div>

<style>
  .coordinate-legend {
    position: absolute;
    top: 1em;
    right: 1em;
    background: rgba(20, 20, 40, 0.85);
    border: 0.05em solid rgba(58, 58, 80, 0.8);
    border-radius: 0.3em;
    padding: 0.75em;
    color: white;
    z-index: 10;
    box-shadow: 0 0.2em 0.4em rgba(0, 0, 0, 0.3);
    min-width: 10em;
    cursor: pointer;
    transition: transform 0.2s ease, background-color 0.2s ease;
    user-select: none;
  }
  
  .coordinate-legend:hover {
    background: rgba(30, 30, 60, 0.9);
    transform: scale(1.03);
  }
  
  .coordinate-legend:active {
    transform: scale(0.98);
  }
  
  .legend-content {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  
  .legend-title {
    font-size: 0.9rem;
    font-weight: bold;
    margin-bottom: 0.3em;
    color: #aaa;
  }
  
  .legend-value {
    font-size: 1.1rem;
    font-weight: bold;
    color: #fff;
    margin-bottom: 0.3em;
  }
  
  .legend-hint {
    font-size: 0.8rem;
    color: #aaa;
    font-style: italic;
  }
</style>
