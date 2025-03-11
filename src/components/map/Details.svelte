<script>
  const { x = 0, y = 0, show = true, biomeName: rawBiomeName = "Unknown", onClose } = $props()
  
  const biomeName = $derived(
    rawBiomeName?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown'
  )
  
  $effect(() => show && console.log(`Details shown for: (${x}, ${y}) - ${biomeName}`))
  
  const handleKeydown = event => event.key === 'Escape' && show && onClose?.()
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="details-container" class:visible={show}>
  <div class="details-card">
    <div class="content">
      <h2>Coordinates ({x}, {y})</h2>
      <p>Biome: {biomeName}</p>
    </div>
    <button class="close-button" onclick={onClose}>×</button>
  </div>
</div>

<style>
  .details-container {
    position: absolute;
    bottom: 2.5em;
    right: 0.5em;
    z-index: 1001;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
    max-width: 50vw;
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
    border-radius: 0.3em;
    color: rgba(0, 0, 0, 0.8);
    background-color: rgba(255, 255, 255, 0.4);
    border: 0.05em solid rgba(255, 255, 255, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    box-shadow: none;
    font-weight: 500;
    min-width: 12.5em;
    
    animation: fadeInDetails 0.4s ease-out forwards;
    transform-origin: bottom right;
  }
  
  @keyframes fadeInDetails {
    from {
      opacity: 0;
      transform: scale(0.95);
      border-color: transparent;
    }
    to {
      opacity: 1;
      transform: scale(1);
      border-color: rgba(255, 255, 255, 0.1);
    }
  }
  
  .content {
    flex: 1;
  }
  
  h2 {
    margin: 0;
    font-size: 1.3em;
    font-weight: bold;
    color: rgba(0, 0, 0, 0.9);
    text-shadow: 0 0 0.1875em rgba(255, 255, 255, 0.8);
  }
  
  p {
    margin: 0.3em 0 0;
    font-size: 1.1em;
    color: rgba(0, 0, 0, 0.8);
  }
  
  .close-button {
    background: none;
    border: none;
    color: rgba(0, 0, 0, 0.8);
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
