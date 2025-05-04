<script>
  // Replace size prop with hasStructure
  const { hasStructure = false } = $props();
</script>

<!-- Remove redundant wrapper -->
<div class="indicator-ring" class:has-structure={hasStructure}></div>
<span class="location-text" class:has-structure={hasStructure}>You are here</span>

<style>
  .indicator-ring {
    position: absolute;
    width: min(calc(var(--indicator-size, 4.2em) * 0.95), 95%);
    height: min(calc(var(--indicator-size, 4.2em) * 0.95), 95%); /* Use height instead of padding-bottom */
    border: 2px solid rgba(255, 215, 0, 0.8);
    border-radius: 50%;
    box-shadow: 
      0 0 15px rgba(255, 215, 0, 0.6),
      0 0 30px rgba(255, 215, 0, 0.3);
    animation: 
      pulse 2s infinite, 
      growIn 1s ease-out forwards;
    opacity: 0.9;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1000;
    pointer-events: none;
    /* Set default size without relying on wrapper */
    --indicator-size: 4.2em;
  }

  /* Ring is even larger for structure tiles */
  .indicator-ring.has-structure {
    --indicator-size: 11em;
    width: min(calc(var(--indicator-size) * 0.98), 98%);
    height: min(calc(var(--indicator-size) * 0.98), 98%);
    border-width: 3px;
    box-shadow: 
      0 0 20px rgba(255, 215, 0, 0.7),
      0 0 40px rgba(255, 215, 0, 0.4);
  }

  .location-text {
    position: absolute;
    bottom: calc(-3.1em + 50%);
    left: 50%;
    transform: translateX(-50%);
    /* Change to dark text on gold background */
    color: rgba(50, 30, 0, 0.95);
    font-weight: bold;
    font-size: calc(var(--indicator-size, 4.2em) / 6);
    padding: 0.2em 0.6em;
    /* Gold background matching ring color scheme */
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
    pointer-events: none;
  }

  /* Make text for structures smaller with matching style */
  .location-text.has-structure {
    font-size: calc(var(--indicator-size, 11em) / 12);
    bottom: calc(-2.7em + 50%);
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
    0% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.8; }
    50% { transform: translate(-50%, -50%) scale(1.05); opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.8; }
  }

  @keyframes appear {
    0% { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
    40% { opacity: 0.4; }
    100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
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
      text-shadow: 0 0 2px rgba(255, 255, 255, 0.7);
    }
    50% { 
      transform: translateX(-50%) translateY(-0.3em); 
      text-shadow: 0 0 3px rgba(255, 255, 255, 0.9);
    }
  }
</style>
