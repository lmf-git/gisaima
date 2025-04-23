<script>
  const { size = '6em' } = $props();
</script>

<div class="you-are-here-wrapper" style="--indicator-size: {size};">
  <div class="indicator-ring"></div>
  <div class="text-container">
    <span class="text-content">You are here</span>
  </div>
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
    width: 100%;
    height: 100%;
    border: 3px solid rgba(255, 215, 0, 0.8);
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

  .text-container {
    background: rgba(0, 0, 0, 0.7);
    padding: 0.3em 0.5em;
    border-radius: 0.3em;
    transform: translateY(calc(var(--indicator-size) / 2 + 0.2em));
    white-space: nowrap;
    border: 1px solid rgba(255, 215, 0, 0.4);
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    animation: fadeIn 1.2s ease-out forwards;
  }

  .text-content {
    color: white;
    font-weight: bold;
    font-size: calc(var(--indicator-size) / 7);
    white-space: nowrap;
    text-shadow: 
      0 0 5px rgba(0, 0, 0, 0.8),
      0 0 10px rgba(0, 0, 0, 0.5);
    font-family: var(--font-heading, sans-serif);
    letter-spacing: 0.05em;
    animation: textPulse 2s ease-in-out infinite;
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

  @keyframes textPulse {
    0% { opacity: 0.8; }
    50% { opacity: 1; }
    100% { opacity: 0.8; }
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

  @keyframes fadeIn {
    0% { opacity: 0; transform: translateY(calc(var(--indicator-size) / 2 + 0.8em)) scale(0.8); }
    50% { opacity: 0; }
    100% { opacity: 1; transform: translateY(calc(var(--indicator-size) / 2 + 0.2em)) scale(1); }
  }
</style>
