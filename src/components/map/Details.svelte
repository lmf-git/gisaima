<script>
  import { fly } from 'svelte/transition';
  
  const { x = 0, y = 0, show = true, terrainColour = "#808080", biomeName: rawBiomeName = "Unknown", onClose } = $props();
  
  const biomeName = $derived(rawBiomeName?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown');
  
  $effect(() => show && console.log(`Details shown for: (${x}, ${y}) - ${biomeName}`));
  
  const handleKeydown = event => event.key === 'Escape' && show && onClose?.();
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Simplified markup with better visibility control -->
<div class="details-container" class:visible={show}>
  {#if show}
    <div 
      class="details-card"
      style="background-color: {terrainColour};"
      transition:fly={{ y: 10, duration: 200 }}
    >
      <div class="content">
        <h2>Coordinates ({x}, {y})</h2>
        <p>Biome: {biomeName}</p>
      </div>
      <button class="close-button" onclick={onClose}>×</button>
    </div>
  {/if}
</div>

<style>
  .details-container {
    position: absolute;
    bottom: 0.5em; /* Position at bottom edge with small offset */
    right: 0.5em;  /* Position at right edge with small offset */
    z-index: 1001;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
    max-width: 50vw; /* Limit width to half the viewport */
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
    border-radius: 4px;  /* Match minimap border-radius */
    color: white;
    text-shadow: 0 0.0625em 0.125em rgba(0, 0, 0, 0.5); /* Changed from px to em */
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4);  /* Match minimap shadow */
    border: 0.3em solid rgba(255, 255, 255, 0.4); /* More visible border */
    backdrop-filter: brightness(1.1) saturate(1.2);
    min-width: 12.5em; /* Changed from 200px to 12.5em */
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
