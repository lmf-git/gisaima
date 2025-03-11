<script>
  // Remove fly import
  
  const { x = 0, y = 0, show = true, biomeName: rawBiomeName = "Unknown", onClose } = $props()
  
  // Format biome name to be readable (convert snake_case to Title Case)
  const biomeName = $derived(
    rawBiomeName?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown'
  )
  
  // Debug log when details are shown
  $effect(() => show && console.log(`Details shown for: (${x}, ${y}) - ${biomeName}`))
  
  // Handle escape key to close modal
  const handleKeydown = event => event.key === 'Escape' && show && onClose?.()
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="details-container" class:visible={show}>
  <!-- Always render the card but control visibility with CSS -->
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
    bottom: 0.5em;
    right: 7em; /* Move to the left of the Legend component */
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
    /* Axes-like styling */
    color: rgba(0, 0, 0, 0.8);
    background-color: rgba(255, 255, 255, 0.4);
    border: 0.05em solid rgba(255, 255, 255, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    box-shadow: none;
    font-weight: 500;
    min-width: 12.5em;
    
    /* Animation similar to axes components */
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
