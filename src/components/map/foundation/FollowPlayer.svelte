<script>
  import { browser } from '$app/environment';
  import { game } from '../../../lib/stores/game';
  import { moveTarget } from '../../../lib/stores/map';
  import BoundIcon from '../../icons/BoundIcon.svelte';
  import UnboundIcon from '../../icons/UnboundIcon.svelte';
  
  // Props using Svelte 5 runes approach
  let { disabled = false, onFollowToggle = undefined } = $props();
  
  // Track state internally using runes
  let followPlayerPosition = $state(true);
  
  // Sync with localStorage on component init
  $effect(() => {
    if (browser && $game?.initialized) {
      const savedFollow = localStorage.getItem('follow_player_position');
      if (savedFollow !== null) {
        followPlayerPosition = savedFollow === 'true';
      }
    }
  });
  
  // Function to handle toggle
  function toggleFollow() {
    followPlayerPosition = !followPlayerPosition;
    
    if (followPlayerPosition && $game.player?.lastLocation) {
      // Immediately move to player's position when re-enabling following
      moveTarget($game.player.lastLocation.x, $game.player.lastLocation.y);
    }
    
    // Save preference to localStorage
    if (browser) {
      localStorage.setItem('follow_player_position', followPlayerPosition.toString());
    }
    
    // Call the callback if provided
    if (typeof onFollowToggle === 'function') {
      onFollowToggle(followPlayerPosition);
    }
  }
</script>

<button 
  class="control-button follow-button" 
  on:click={toggleFollow}
  aria-label={followPlayerPosition ? "Stop following player" : "Follow player"}
  {disabled}>
  
  {#if followPlayerPosition}
    <BoundIcon extraClass="button-icon" />
  {:else}
    <UnboundIcon extraClass="button-icon" />
  {/if}
  
</button>

<style>
  .control-button {
    min-width: 2em;
    height: 2em;
    background-color: rgba(255, 255, 255, 0.85);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.3em;
    color: rgba(0, 0, 0, 0.8);
    padding: 0.3em 0.8em;
    font-size: 1em;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    transition: all 0.2s ease;
    backdrop-filter: blur(0.5em);
    -webkit-backdrop-filter: blur(0.5em);
    opacity: 0;
    transform: translateY(-1em);
    animation: fadeInButton 0.7s ease-out 0.5s forwards;
  }
  
  .control-button:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.95);
    border-color: rgba(255, 255, 255, 0.5);
  }
  
  .control-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  @keyframes fadeInButton {
    0% {
      opacity: 0;
      transform: translateY(-1em);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .control-button:focus-visible {
    outline: 0.15em solid rgba(0, 0, 0, 0.6);
    outline-offset: 0.1em;
  }
  
  .follow-button {
    padding: 0.3em;
    min-width: 2em;
    width: 2em;
    display: flex;
  }
</style>
