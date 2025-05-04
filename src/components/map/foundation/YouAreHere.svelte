<script>
  const { hasStructure = false } = $props();
</script>

<!-- Restore the wrapper for proper positioning context -->
<div class="you-are-here-wrapper" class:has-structure={hasStructure}>
  <div class="indicator-ring"></div>
  <span class="location-text">You are here</span>
</div>

<style>
  .you-are-here-wrapper {
    position: absolute;
    inset: 0; /* Fill the entire container */
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 1000;
    /* Define base size for regular tiles */
    --indicator-size: 4.2em;
  }

  /* Make structure indicator larger */
  .you-are-here-wrapper.has-structure {
    --indicator-size: 11em;
  }

  .indicator-ring {
    position: absolute;
    width: min(calc(var(--indicator-size) * 0.95), 95%);
    aspect-ratio: 1/1; /* Maintain perfect circle */
    border: 2px solid rgba(255, 215, 0, 0.8);
    border-radius: 50%;
    box-shadow: 
      0 0 15px rgba(255, 215, 0, 0.6),
      0 0 30px rgba(255, 215, 0, 0.3);
    animation: 
      pulse 2s infinite, 
      growIn 1s ease-out forwards;
    opacity: 0.9;
  }

  /* Ring is larger for structure tiles */
  .has-structure .indicator-ring {
    width: min(calc(var(--indicator-size) * 0.98), 98%);
    border-width: 3px;
    box-shadow: 
      0 0 20px rgba(255, 215, 0, 0.7),
      0 0 40px rgba(255, 215, 0, 0.4);
  }

  .location-text {
    position: absolute;
    /* Position below the ring based on indicator size */
    top: calc(50% + var(--indicator-size) * 0.55);
    left: 50%;
    transform: translateX(-50%);
    color: rgba(50, 30, 0, 0.95);
    font-weight: bold;
    font-size: calc(var(--indicator-size) / 6);
    padding: 0.2em 0.6em;
    background: linear-gradient(to bottom, rgba(255, 215, 0, 0.9), rgba(218, 165, 32, 0.85));
    border-radius: 0.3em;
    white-space: nowrap;
    text-shadow: 0 0 2px rgba(255, 255, 255, 0.7);
    font-family: var(--font-heading, sans-serif);
    letter-spacing: 0.05em;
    animation: bounce 2s infinite;
    border: 1px solid rgba(255, 215, 0, 0.9);
    box-shadow: 
      0 0 4px rgba(0, 0, 0, 0.5), 
      0 0 8px rgba(255, 215, 0, 0.4), 
      inset 0 0 2px rgba(255, 255, 255, 0.8);
    z-index: 1101;
  }

  /* Make text for structures smaller with matching style */
  .has-structure .location-text {
    font-size: calc(var(--indicator-size) / 12);
    top: calc(50% + var(--indicator-size) * 0.6); /* Adjust position for structure size */
    padding: 0.25em 0.7em;
    background: linear-gradient(to bottom, rgba(255, 215, 0, 0.85), rgba(218, 165, 32, 0.8));
    border: 1px solid rgba(255, 215, 0, 0.7);
    box-shadow: 
      0 0 3px rgba(0, 0, 0, 0.5), 
      0 0 6px rgba(255, 215, 0, 0.3), 
      inset 0 0 2px rgba(255, 255, 255, 0.7);
    font-weight: 600;
  }

  @keyframes pulse {
    0% { transform: scale(0.95); opacity: 0.8; }
    50% { transform: scale(1.05); opacity: 1; }
    100% { transform: scale(0.95); opacity: 0.8; }
  }

  @keyframes appear {
    0% { transform: scale(0.2); opacity: 0; }
    40% { opacity: 0.4; }
    100% { transform: scale(1); opacity: 1; }
  }

  @keyframes growIn {
    0% { transform: scale(0.2); opacity: 0; }
    50% { transform: scale(1.1); opacity: 0.7; }
    70% { transform: scale(0.95); opacity: 0.8; }
    100% { transform: scale(1); opacity: 0.9; }
  }

  @keyframes bounce {
    0%, 100% { 
      transform: translateX(-50%) translateY(0); 
      text-shadow: 0 0 2px rgba(255, 255, 255, 0.7);
    }
    50% { 
      transform: translateX(-50%) translateY(-0.3em); 
      text-shadow: 0 0 3px rgba(255, 255, 255, 0.9);
    }
  }
</style>
