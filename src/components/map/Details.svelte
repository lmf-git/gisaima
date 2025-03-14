<script>
  // Update import to use targetStore instead of centerTileStore
  import { targetStore, ready } from "../../lib/stores/map";
  import Close from '../../components/icons/Close.svelte';
  
  const { x = 0, y = 0, terrain, onClose } = $props()
  
  const _fmt = t => t?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Use either passed terrain or check targetStore directly
  const formattedName = $derived(
    _fmt(terrain || $targetStore.biome?.name) || "Unknown"
  );
  
  // Access entity data from targetStore
  const structure = $derived($targetStore.structure);
  const players = $derived($targetStore.players || []);
  const groups = $derived($targetStore.groups || []);
  
  const escape = event => event.key === 'Escape' && onClose?.();
</script>

<svelte:window onkeydown={escape} />

<div class="details">
  <div class="info">
    <div class="content">
      <h2>Details {x}, {y}</h2>
      <p>Terrain: {formattedName}</p>
      
      {#if structure}
        <div class="section">
          <h3>Structure</h3>
          <p>{structure.name || "Unknown structure"}</p>
        </div>
      {/if}
      
      {#if players.length > 0}
        <div class="section">
          <h3>Players ({players.length})</h3>
          <ul>
            {#each players as player}
              <li>{player.name || player.id}</li>
            {/each}
          </ul>
        </div>
      {/if}
      
      {#if groups.length > 0}
        <div class="section">
          <h3>Unit Groups ({groups.length})</h3>
          <ul>
            {#each groups as group}
              <li>{group.name || group.id} - Units: {group.unitCount || "?"}</li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
    <button class="close-btn" onclick={onClose}>
      <Close size="2.2em" color="rgba(0, 0, 0, 0.8)" />
    </button>
  </div>
</div>

<style>
  .details {
    position: absolute;
    bottom: 2.5em;
    right: .5em;
    z-index: 1001; /* Standardize z-index to 1001 */
    transition: opacity 0.2s ease;
    font-size: 1.2em;
    font-family: var(--font-body);
    max-width: calc(100% - 1em); /* Ensure it doesn't overflow screen width */
  }
  
  .info {
    display: flex;
    align-items: flex-start;
    gap: 1em;
    padding: 0.8em 1em;
    border-radius: 0.3em;
    color: rgba(0, 0, 0, 0.8);
    background-color: rgba(255, 255, 255, 0.85); /* Increased opacity from 0.6 to 0.85 */
    border: 0.05em solid rgba(255, 255, 255, 0.2); /* Standardize border */
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    font-weight: 500;
    width: 100%;
    max-width: 22.5em; /* Maximum width on larger screens */
    box-sizing: border-box;
    backdrop-filter: blur(0.5em); /* Add consistent backdrop blur */
    -webkit-backdrop-filter: blur(0.5em);
    animation: reveal 0.4s ease-out forwards;
    transform-origin: bottom right;
    transition: all 0.2s ease; /* Add smooth transition for hover states */
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
    font-weight: 700; /* Bold for important headers */
    color: rgba(0, 0, 0, 0.9);
    text-shadow: 0 0 0.1875em rgba(255, 255, 255, 0.8);
    font-family: var(--font-heading);
  }
  
  p {
    margin: 0.3em 0 0;
    font-size: 1.1em;
    color: rgba(0, 0, 0, 0.8);
    font-family: var(--font-body);
    font-weight: 400; /* Regular for details text */
  }
  
  .close-btn {
    background: none;
    border: none;
    height: 3em;
    padding: 0.3em;
    cursor: pointer;
    opacity: 0.8;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.3em;
  }
  
  .close-btn:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.1);
  }

  /* Mobile optimizations */
  @media (max-width: 480px) {
    .details {
      left: 0.5em;
      right: 0.5em;
      bottom: 1em;
      font-size: 1em;
    }
    
    .info {
      width: 100%;
      padding: 0.8em;
    }
    
    h2 {
      font-size: 1.2em;
    }
    
    p {
      font-size: 1em;
    }
  }

  .section {
    margin-top: 1em;
    padding-top: 0.8em;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  h3 {
    margin: 0 0 0.5em 0;
    font-size: 1.1em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.7);
  }
  
  ul {
    margin: 0.5em 0;
    padding-left: 1.5em;
    font-size: 0.9em;
  }
  
  li {
    margin-bottom: 0.3em;
  }
</style>
