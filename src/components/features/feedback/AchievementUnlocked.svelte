<script>
  import { fly, fade } from 'svelte/transition';
  import { onMount, onDestroy } from 'svelte';
  import { recentUnlock } from '../../../lib/stores/game.js';
  import Trophy from '../../icons/Trophy.svelte';

  // Local state
  let visible = $state(false);
  let achievement = $state(null);
  let timer = null;

  // Effect to handle recentUnlock changes
  $effect(() => {
    if ($recentUnlock) {
      achievement = $recentUnlock;
      visible = true;

      // Clear any existing timer
      if (timer) clearTimeout(timer);
      
      // Set a timer to hide the notification after a few seconds
      timer = setTimeout(() => {
        visible = false;
      }, 5000);
    }
  });

  // Clean up timer when component is destroyed
  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

{#if visible && achievement}
  <div 
    class="achievement-notification" 
    in:fly={{ y: -50, duration: 500 }} 
    out:fade={{ duration: 300 }}
  >
    <Trophy extraClass="notification-trophy" />
    <div class="notification-content">
      <h3>Achievement Unlocked!</h3>
      <p class="achievement-title">{achievement.title}</p>
      <p class="achievement-description">{achievement.description}</p>
    </div>
  </div>
{/if}

<style>
  .achievement-notification {
    position: fixed;
    top: 2em;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(255, 255, 255, 0.95);
    border-bottom: 4px solid #4285f4;
    border-radius: 0.5em;
    padding: 1em;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    gap: 1em;
    z-index: 2000; /* Higher z-index to appear above other UI components */
    max-width: 24em;
    min-width: 20em;
    text-align: center;
    animation: pulse 2s infinite;
  }
  
  @keyframes pulse {
    0% {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    50% {
      box-shadow: 0 4px 20px rgba(66, 133, 244, 0.4);
    }
    100% {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
  }
  
  .notification-content {
    flex: 1;
  }
  
  .notification-content h3 {
    margin: 0;
    font-family: var(--font-heading);
    color: #4285f4;
    font-size: 1.1em;
  }
  
  .achievement-title {
    margin: 0.3em 0 0.2em 0;
    font-size: 1.1em;
    font-weight: bold;
    color: #222; /* Darker text for better contrast */
    text-shadow: 0 0 2px rgba(255, 255, 255, 0.8); /* Text shadow for improved readability */
  }
  
  .achievement-description {
    margin: 0;
    font-size: 0.9em;
    color: #555; /* Medium dark for the description */
    font-style: italic;
  }
  
  :global(.notification-trophy) {
    width: 2.5em;
    height: 2.5em;
    fill: #ffa000;
    filter: drop-shadow(0 0 4px rgba(255, 160, 0, 0.5));
  }
</style>
