<script>
  import { fly } from 'svelte/transition';
  import { mapState } from '../../lib/stores/map.js';
  
  const {
    x = 0,
    y = 0,
    show = false,
    displayColor = "#808080",
    biomeName: rawBiomeName = "Unknown",
    onClose
  } = $props();
  
  // Format the biomeName
  const biomeName = $derived(
    rawBiomeName?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown'
  );
  
  // Force render log to debug visibility
  $effect(() => {
    console.log(`Details visibility changed: ${show}`);
    if (show) {
      console.log(`Details shown for: (${x}, ${y}) - ${biomeName}`);
    }
  });
  
  function handleKeydown(event) {
    if (event.key === 'Escape' && show) {
      onClose?.();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Simplified markup with better visibility control -->
<div class="details-container" class:visible={show}>
  {#if show}
    <div 
      class="details-card"
      style="background-color: {displayColor};"
      transition:fly={{ y: -10, duration: 200 }}
    >
      <div class="content">
        <h2>Coordinates ({x}, {y})</h2>
        <p>Biome: {biomeName}</p>
      </div>
      <button class="close-button" on:click={onClose}>×</button>
    </div>
  {/if}
</div>

<style>
  .details-container {
    position: fixed;
    top: 3.5em;
    right: 1em;
    z-index: 1000; /* Higher z-index to ensure visibility */
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }
  
  .details-container.visible {
    opacity: 1;
    pointer-events: all;
  }
  
  .details-card {
    display: flex;
    align-items: flex-start;
    gap: 1em;
    padding: 1em;
    border-radius: 0.5em;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    box-shadow: 0 0.3em 0.8em rgba(0, 0, 0, 0.5);
    border: 0.3em solid rgba(255, 255, 255, 0.4); /* More visible border */
    backdrop-filter: brightness(1.1) saturate(1.2);
    min-width: 200px; /* Ensure the card has a minimum size */
  }
  
  .content {
    flex: 1;
  }
  
  h2 {
    margin: 0;
    font-size: 1.3em;
    font-weight: bold;
  }
  
  p {
    margin: 0.3em 0 0;
    font-size: 1.1em;
  }
  
  .close-button {
    background: none;
    border: none;
    color: white;
    font-size: 1.5em;
    line-height: 1;
    padding: 0;
    cursor: pointer;
    opacity: 0.8;
    transition: opacity 0.2s;
  }
  
  .close-button:hover {
    opacity: 1;
  }
</style>
