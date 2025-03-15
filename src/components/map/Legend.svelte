<script>
  import { targetStore, ready } from "../../lib/stores/map";  // Changed from centerTileStore to targetStore

  const { openDetails } = $props();
  
  const keypress = e => ['Enter', ' '].includes(e.key) && e.preventDefault() && openDetails();

  function formatTerrainName(name) {
    return name ? name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : "Unknown";
  }
</script>

<div 
  class="legend"
  class:ready={$ready} 
  onclick={openDetails}
  onkeypress={keypress}
  role="button" 
  tabindex="0">
  <div class="coordinates">{$targetStore.x} | {$targetStore.y}</div>  <!-- Changed from centerTileStore to targetStore -->
  <div class="terrain">{formatTerrainName($targetStore.biome?.name)}</div>  <!-- Changed from centerTileStore to targetStore -->
</div>

<style>
  .legend {
    position: absolute;
    bottom: 2.5em;
    right: 0.5em;
    z-index: 1001;
    cursor: pointer;
    border-radius: 0.3em;
    padding: 0.8em 1em; /* Standardize padding */
    color: rgba(0, 0, 0, 0.8);
    background-color: rgba(255, 255, 255, 0.85); /* Increased opacity from 0.6 to 0.85 */
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    box-shadow: none;
    font-weight: 500;
    backdrop-filter: blur(0.5em);
    -webkit-backdrop-filter: blur(0.5em);
    transition: all 0.2s ease;
    opacity: 0;
    transform: translateY(1em);
    min-width: 8em;
    text-align: center;
  }
  
  /* Only animate when grid is ready */
  .legend.ready {
    animation: reveal 0.7s ease-out 0.4s forwards;
  }
  
  .coordinates {
    font-size: 1.2em;
    font-weight: bold;
    color: rgba(0, 0, 0, 0.9);
  }
  
  .terrain {
    font-size: 0.9em;
    margin-top: 0.2em;
    color: rgba(0, 0, 0, 0.8);
  }
  
  /* Removed the hover styles */

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
