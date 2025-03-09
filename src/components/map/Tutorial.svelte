<script>
  // Component to display game controls and hints
  const { show = true } = $props();
</script>

<div class="tutorial-container" class:hidden={!show}>
  <div class="tutorial-content">
    <div class="tutorial-item">
      <span class="key-hint">WASD</span> or <span class="key-hint">↑←↓→</span> to navigate
    </div>
  </div>
</div>

<style>
  .tutorial-container {
    position: absolute;
    bottom: 1.5em;
    left: 1.5em;
    z-index: 10;
    opacity: 0.8;
    transition: opacity 0.3s ease;
  }
  
  .tutorial-container:hover {
    opacity: 1;
  }
  
  .tutorial-container.hidden {
    display: none;
  }
  
  .tutorial-content {
    background-color: rgba(0, 0, 0, 0.6);
    padding: 0.6em 1em;
    border-radius: 0.3em;
    box-shadow: 0 0.1em 0.3em var(--color-shadow);
    font-size: 0.9em;
    color: var(--color-text);
  }
  
  .tutorial-item {
    display: flex;
    align-items: center;
    gap: 0.5em;
  }
  
  .key-hint {
    color: var(--color-accent);
    font-weight: bold;
    letter-spacing: 0.05em;
  }
</style>
