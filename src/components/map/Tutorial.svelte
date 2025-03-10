<script>
  import { onMount } from 'svelte';
  
  const { show = true } = $props();
  let isClosed = $state(false);
  
  onMount(() => isClosed = localStorage.getItem('tutorial-closed') === 'true');
  
  const closeTutorial = () => (isClosed = true, localStorage.setItem('tutorial-closed', 'true'));
  const reopenTutorial = () => (isClosed = false, localStorage.setItem('tutorial-closed', 'false'));
</script>

{#if !isClosed}
  <div class="tutorial-container" class:hidden={!show}>
    <div class="tutorial-content">
      <button class="close-button" aria-label="Close tutorial" on:click={closeTutorial}>×</button>
      <div class="tutorial-item">
        <span class="key-hint">WASD</span> or <span class="key-hint">↑←↓→</span> to navigate
      </div>
    </div>
  </div>
{:else if show}
  <!-- Show a minimized indicator when closed -->
  <button class="reopen-button" on:click={reopenTutorial} aria-label="Show tutorial">
    ?
  </button>
{/if}

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
    position: relative;
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
  
  /* Close button styling */
  .close-button {
    position: absolute;
    top: 0.2em;
    right: 0.2em;
    background: transparent;
    border: none;
    color: var(--color-text);
    font-size: 1.2em;
    line-height: 1;
    cursor: pointer;
    padding: 0 0.3em;
    opacity: 0.7;
    transition: opacity 0.2s ease;
  }
  
  .close-button:hover {
    opacity: 1;
  }
  
  /* Reopen button styling */
  .reopen-button {
    position: absolute;
    bottom: 1.5em;
    left: 1.5em;
    width: 1.8em;
    height: 1.8em;
    background-color: rgba(0, 0, 0, 0.6);
    color: var(--color-text);
    border: none;
    border-radius: 50%;
    font-size: 1em;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.8;
    transition: opacity 0.2s, transform 0.2s;
    z-index: 10;
    box-shadow: 0 0.1em 0.3em var(--color-shadow);
  }
  
  .reopen-button:hover {
    opacity: 1;
    transform: scale(1.1);
  }
</style>
