<script>
  // Replace size prop with hasStructure
  const { hasStructure = false } = $props();
</script>

<div class="you-are-here-wrapper" class:has-structure={hasStructure}>
  <div class="indicator-ring"></div>
  <span class="location-text">You are here</span>
</div>

<style>
  .you-are-here-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: appear 1s ease-out forwards;
    /* Default size for regular tiles */
    --indicator-size: 3.5em;
  }

  /* Larger size for structure tiles */
  .you-are-here-wrapper.has-structure {
    --indicator-size: 9em;
  }

  .indicator-ring {
    position: absolute;
    width: min(calc(var(--indicator-size) * 0.95), 95%);
    height: 0;
    padding-bottom: min(calc(var(--indicator-size) * 0.95), 95%);
    aspect-ratio: 1/1;
    border: 2px solid rgba(255, 215, 0, 0.8);
    border-radius: 50%;
    box-shadow: 
      0 0 15px rgba(255, 215, 0, 0.6),
      0 0 30px rgba(255, 215, 0, 0.3);
    animation: 
      pulse 2s infinite, 
      growIn 1s ease-out forwards;
    opacity: 0.9;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  /* Ring is even larger for structure tiles */
  .has-structure .indicator-ring {
    width: min(calc(var(--indicator-size) * 0.98), 98%);
    padding-bottom: min(calc(var(--indicator-size) * 0.98), 98%);
    border-width: 3px;
    box-shadow: 
      0 0 20px rgba(255, 215, 0, 0.7),
      0 0 40px rgba(255, 215, 0, 0.4);
  }

  .location-text {
    position: absolute;
    bottom: -2.2em;
    left: 50%;
    transform: translateX(-50%);
    color: white;
    font-weight: bold;
    /* Make text larger when there's no structure (default case) */
    font-size: calc(var(--indicator-size) / 10);
    padding: 0.15em 0.5em;
    background: rgba(0, 0, 0, 0.7);
    border-radius: 0.3em;
    white-space: nowrap;
    text-shadow: 0 0 3px black;
    font-family: var(--font-heading, sans-serif);
    letter-spacing: 0.05em;
    animation: bounce 2s infinite;
    border: 1px solid rgba(255, 215, 0, 0.4);
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    z-index: 1101;
  }

  /* Make text for structures smaller (reversed from before) */
  .has-structure .location-text {
    font-size: calc(var(--indicator-size) / 15);
    bottom: -1.8em;
    padding: 0.2em 0.6em;
  }

  @keyframes pulse {
    0% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.8; }
    50% { transform: translate(-50%, -50%) scale(1.05); opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.8; }
  }

  @keyframes appear {
    0% { transform: scale(0.2); opacity: 0; }
    40% { opacity: 0.4; }
    100% { transform: scale(1); opacity: 1; }
  }

  @keyframes growIn {
    0% { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
    50% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.7; }
    70% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.8; }
    100% { transform: translate(-50%, -50%) scale(1); opacity: 0.9; }
  }

  @keyframes bounce {
    0%, 100% { 
      transform: translateX(-50%) translateY(0); 
      text-shadow: 0 0 3px black;
    }
    50% { 
      transform: translateX(-50%) translateY(-0.3em); 
      text-shadow: 0 0 5px black;
    }
  }
</style>
