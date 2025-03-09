<script>
  import { fly } from 'svelte/transition';
  
  const {
    x = 0,
    y = 0,
    show = false,
    biome = { name: "unknown", color: "#808080" },
    displayColor = "#808080",
    onClose
  } = $props();
  
  let detailsElement = null;
  
  // Synchronize details element open state with show prop
  $effect(() => {
    if (detailsElement) {
      detailsElement.open = show;
    }
  });
  
  function handleKeydown(event) {
    if (event.key === 'Escape' && show) {
      onClose?.();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="details-container" class:visible={show}>
  <div 
    class="details-card"
    style="background-color: {displayColor};"
    transition:fly={{ y: -10, duration: 200 }}
  >
    <div class="content">
      <h2>({x}, {y})</h2>
      <p>{biome?.name?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown'}</p>
    </div>
    <button class="close-button" onclick={onClose}>×</button>
  </div>
</div>

<style>
  .details-container {
    position: fixed;
    top: 3.5em;
    right: 1em;
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
    box-shadow: 0 0.2em 0.6em rgba(0, 0, 0, 0.3);
    border: 0.0625em solid rgba(255, 255, 255, 0.2);
    backdrop-filter: brightness(1.1) saturate(1.2);
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
