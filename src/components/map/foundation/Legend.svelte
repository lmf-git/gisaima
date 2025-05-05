<script>
  import { targetStore, ready } from "../../../lib/stores/map";

  const { openDetails } = $props();
  
  const keypress = e => ['Enter', ' '].includes(e.key) && e.preventDefault() && openDetails();

  function formatTerrainName(name) {
    return name ? name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : "Unknown";
  }

  // Add a helper to determine if rarity should be shown
  function shouldShowRarity(rarity) {
    return rarity && rarity !== 'common';
  }
  
  // Format rarity text
  function formatRarity(rarity) {
    return rarity ? rarity.charAt(0).toUpperCase() + rarity.slice(1) : '';
  }
</script>

<div 
  class="legend"
  class:ready={$ready} 
  onclick={openDetails}
  onkeypress={keypress}
  role="button" 
  tabindex="0">
  <div class="coordinates">{$targetStore.x} | {$targetStore.y}</div>  
  <div class="terrain">
    <div class="terrain-name">{formatTerrainName($targetStore.biome?.name)}</div>
    {#if shouldShowRarity($targetStore.terrain?.rarity)}
      <div class="rarity {$targetStore.terrain?.rarity || ''}">{formatRarity($targetStore.terrain?.rarity)}</div>
    {/if}
  </div>
</div>

<style>
  .legend {
    position: absolute;
    bottom: 1.95em;
    left: 50%;
    transform: translateX(-50%);
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
    transform: translate(-50%, 1em);
    min-width: 8em;
    text-align: center;
    font-family: var(--font-body); /* Add body font */
    display: none; /* Hide by default on mobile */
  }
  
  /* Only show on larger screens */
  @media (min-width: 768px) {
    .legend {
      display: block; /* Make visible on tablets and larger */
    }
  }
  
  /* Only animate when grid is ready */
  .legend.ready {
    animation: reveal 0.7s ease-out 0.4s forwards;
  }
  
  .coordinates {
    font-size: 1.2em;
    font-weight: bold;
    color: rgba(0, 0, 0, 0.9);
    font-family: var(--font-heading); /* Add heading font for coordinates */
  }
  
  .terrain {
    font-size: 0.9em;
    margin-top: 0.2em;
    color: rgba(0, 0, 0, 0.8);
    font-family: var(--font-body); /* Add body font */
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  
  .terrain-name {
    margin-bottom: 0.1em;
  }
  
  .rarity {
    margin-left: 0.5em;
    font-size: 0.85em;
    font-weight: bold;
    padding: 0.1em 0.4em;
    border-radius: 0.3em;
    display: inline-block;
    line-height: 1.1;
  }
  
  .uncommon {
    color: #228B22;
    background: rgba(30, 255, 0, 0.15);
  }
  
  .rare {
    color: #0070DD;
    background: rgba(0, 112, 221, 0.15);
  }
  
  .epic {
    color: #9400D3;
    background: rgba(148, 0, 211, 0.15);
  }
  
  .legendary {
    color: #FF8C00;
    background: rgba(255, 165, 0, 0.15);
  }
  
  .mythic {
    color: #FF1493;
    background: rgba(255, 128, 255, 0.15);
  }

  @keyframes reveal {
    0% {
      opacity: 0;
      transform: translate(-50%, 1em);
    }
    100% {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
</style>
