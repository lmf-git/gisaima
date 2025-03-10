<script>
  import { onMount } from 'svelte';
  
  const { show = true } = $props();
  let closed = $state(false);
  
  onMount(() => closed = localStorage.getItem('tutorial-closed') === 'true');
  
  const close = () => (closed = true, localStorage.setItem('tutorial-closed', 'true'));
  const open = () => (closed = false, localStorage.setItem('tutorial-closed', 'false'));
</script>

{#if !closed}
  <div class="tut" class:hide={!show}>
    <div class="box">
      <button class="close" aria-label="Close tutorial" on:click={close}>×</button>
      <div class="item">
        <span class="key">WASD</span> or <span class="key">↑←↓→</span> to move
      </div>
    </div>
  </div>
{:else if show}
  <button class="help" on:click={open} aria-label="Show tutorial">?</button>
{/if}

<style>
  .tut {
    position: absolute;
    bottom: 1.5em;
    left: 1.5em;
    z-index: 10;
    opacity: 0.8;
    transition: opacity 0.3s ease;
  }
  
  .tut:hover {
    opacity: 1;
  }
  
  .tut.hide {
    display: none;
  }
  
  .box {
    position: relative;
    background: rgba(0, 0, 0, 0.6);
    padding: 0.6em 1em;
    border-radius: 0.3em;
    box-shadow: 0 0.1em 0.3em var(--color-shadow);
    font-size: 0.9em;
    color: var(--color-text);
  }
  
  .item {
    display: flex;
    align-items: center;
    gap: 0.5em;
  }
  
  .key {
    color: var(--color-accent);
    font-weight: bold;
    letter-spacing: 0.05em;
  }
  
  .close {
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
  
  .close:hover {
    opacity: 1;
  }
  
  .help {
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
  
  .help:hover {
    opacity: 1;
    transform: scale(1.1);
  }
</style>
