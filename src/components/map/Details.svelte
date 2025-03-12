<script>
  import { targetTileStore } from "../../lib/stores/map";
  
  const { x = 0, y = 0, terrain, onClose } = $props()
  
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Use either passed terrain or check targetTileStore directly
  const formattedName = $derived(
    _fmt(terrain || $targetTileStore.biome?.name) || "Unknown"
  );
  
  const escape = event => event.key === 'Escape' && onClose?.();
</script>

<svelte:window onkeydown={escape} />

<div class="details">
  <div class="info">
    <div class="content">
      <h2>Details {x}, {y}</h2>
      <p>Terrain: {formattedName}</p>
    </div>
    <button class="close" onclick={onClose}>
      X
    </button>
  </div>
</div>

<style>
  .details {
    position: absolute;
    bottom: 2.5em;
    right: .5em;
    z-index: 2;
    transition: opacity 0.2s ease;
    font-size: 1.2em;
  }
  
  .info {
    display: flex;
    align-items: flex-start;
    gap: 1em;
    padding: 1em;
    border-radius: 0.3em;
    color: rgba(0, 0, 0, 0.8);
    background-color: rgba(255, 255, 255, 0.4);
    border: 0.05em solid rgba(255, 255, 255, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    font-weight: 500;
    width: 22.5em;
    
    animation: reveal 0.4s ease-out forwards;
    transform-origin: bottom right;
  }
  
  @keyframes reveal {
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
  
  .close {
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
  
  .close:hover {
    opacity: 1;
  }
</style>
