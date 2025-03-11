<script>
  import { fly } from 'svelte/transition'
  
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
  {#if show}
    <div 
      class="details-card"
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
    bottom: 0.5em;
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
    border-radius: 4px;
    color: var(--color-text-primary);
    text-shadow: 0 0.0625em 0.125em rgba(0, 0, 0, 0.5);
    box-shadow: 0 3px 10px var(--color-shadow);
    border: 0.15em solid var(--color-panel-border);
    backdrop-filter: blur(5px);
    min-width: 12.5em;
    background-color: var(--color-panel-bg);
  }
  
  .content {
    flex: 1;
  }
  
  h2 {
    margin: 0;
    font-size: 1.3em;
    font-weight: bold;
    color: var(--color-bright-accent);
  }
  
  p {
    margin: 0.3em 0 0;
    font-size: 1.1em;
    color: var(--color-text-secondary);
  }
  
  .close-button {
    background: none;
    border: none;
    color: var(--color-bright-accent);
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
