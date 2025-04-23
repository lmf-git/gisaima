<script>
  const { size = '5em' } = $props();
</script>

<div class="you-are-here-wrapper" style="--indicator-size: {size};">
  <div class="indicator-ring"></div>
  <span class="location-text">You are here</span>
</div>

<style>
  .you-are-here-wrapper {
    position: relative;
    width: var(--indicator-size);
    height: var(--indicator-size);
    pointer-events: none;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: appear 1s ease-out forwards;
  }

  .indicator-ring {
    position: absolute;
    width: 90%;
    height: 90%;
    border: 2px solid rgba(255, 215, 0, 0.8);
    border-radius: 50%;
    box-shadow: 
      0 0 15px rgba(255, 215, 0, 0.6),
      0 0 30px rgba(255, 215, 0, 0.3);
    animation: 
      pulse 2s infinite, 
      rotate 12s linear infinite,
      growIn 1s ease-out forwards;
    opacity: 0.9;
  }

  .location-text {
    position: absolute;
    bottom: -1.8em;
    left: 50%;
    transform: translateX(-50%);
    color: white;
    font-weight: bold;
    font-size: calc(var(--indicator-size) / 8.5);
    padding: 0.15em 0.5em;
    background: rgba(0, 0, 0, 0.7);
    border-radius: 0.3em;
    white-space: nowrap;
    text-shadow: 0 0 3px black;
    font-family: var(--font-heading, sans-serif);
    letter-spacing: 0.05em;
    animation: fadeInBottom 1.2s ease-out forwards;
    border: 1px solid rgba(255, 215, 0, 0.4);
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    z-index: 1101; /* Higher than structure label */
  }

  @keyframes pulse {
    0% { transform: scale(0.95); opacity: 0.8; }
    50% { transform: scale(1.05); opacity: 1; }
    100% { transform: scale(0.95); opacity: 0.8; }
  }

  @keyframes rotate {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
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

  @keyframes fadeInBottom {
    0% { opacity: 0; transform: translate(-50%, 0.5em); }
    50% { opacity: 0; }
    100% { opacity: 1; transform: translateX(-50%); }
  }
</style>
