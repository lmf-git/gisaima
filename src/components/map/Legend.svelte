<script>
  import { targetTileStore } from "../../lib/stores/map";

  const { x = 0, y = 0, openDetails } = $props();
  
  const keypress = e => ['Enter', ' '].includes(e.key) && e.preventDefault() && openDetails()

  // Format terrain name for display
  const formatTerrainName = (name) => {
    if (!name) return "Unknown";
    return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
</script>

<div 
  class="legend" 
  onclick={openDetails}
  onkeypress={keypress}
  role="button" 
  tabindex="0">
  <div class="coordinates">{$targetTileStore.x} | {$targetTileStore.y}</div>
  <div class="terrain">{formatTerrainName($targetTileStore.biome?.name)}</div>
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
    font-family: var(--font-body);
    
    animation: reveal 0.7s ease-out forwards;
    opacity: 0;
    transform: translateY(0);
    min-width: 8em;
    text-align: center;
  }
  
  .coordinates {
    font-size: 1.2em;
    font-weight: 700; /* Bolder for important coordinates */
    color: rgba(0, 0, 0, 0.9);
    font-family: var(--font-heading);
  }
  
  .terrain {
    font-size: 0.9em;
    margin-top: 0.2em;
    color: rgba(0, 0, 0, 0.8);
    font-weight: 400; /* Regular for descriptive text */
  }
  
  .legend:hover {
    background-color: rgba(255, 255, 255, 0.6);
    border-color: rgba(255, 255, 255, 0.5);
    transform: none;
    box-shadow: none;
  }

  @keyframes reveal {
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
