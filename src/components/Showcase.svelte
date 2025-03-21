<script>
  import Logo from './Logo.svelte';
  import { user, loading as userLoading } from '$lib/stores/user';
  import { game, isAuthReady } from '$lib/stores/game';
  import { onMount } from 'svelte';
  
  // Update to use $props() runes API
  const { extraClass = '' } = $props();
  
  // Simplified background image state with runes
  let bgIndex = $state(0);
  let nextBgIndex = $state(1);
  let bgTransitioning = $state(false);
  let rotationInterval = $state(null);
  
  // Derived state for UI loading conditions 
  const actionsLoading = $derived($userLoading || !$isAuthReady || $game.loading);
  
  // Background images array
  const backgroundImages = [
    '/banners/1.jpeg',
    '/banners/2.jpeg',
    '/banners/3.jpeg',
    '/banners/4.jpeg',
    '/banners/5.jpeg',
    '/banners/6.jpeg',
    '/banners/7.jpeg'
  ];

  // Simple function to handle the background transition
  function rotateBackground() {
    if (bgTransitioning) return;
    
    // Start transition to next image
    bgTransitioning = true;
    nextBgIndex = (bgIndex + 1) % backgroundImages.length;
    
    // After transition completes, update the current index and reset state
    setTimeout(() => {
      bgIndex = nextBgIndex;
      bgTransitioning = false;
    }, 1000); // Match CSS transition duration
  }
  
  onMount(() => {
    // Start rotation after component is mounted, with initial delay
    // This prevents any issues with reactivity before the component is ready
    const initialDelay = setTimeout(() => {
      // Setup interval to rotate backgrounds every 10 seconds
      rotationInterval = setInterval(rotateBackground, 10000);
    }, 1000);
    
    // Cleanup function
    return () => {
      clearTimeout(initialDelay);
      clearInterval(rotationInterval);
    };
  });
</script>

<section class="showcase {extraClass}">
  <!-- Fixed background handling with always-present layers -->
  <div class="bg-wrapper">
    <!-- Both layers always present, opacity controls visibility -->
    <div 
      class="bg-layer current"
      class:fading={bgTransitioning}
      style={`background-image: url('${backgroundImages[bgIndex]}');`}>
    </div>
    
    <div 
      class="bg-layer next"
      class:active={bgTransitioning}
      style={`background-image: url('${backgroundImages[nextBgIndex]}');`}>
    </div>
  </div>
  
  <Logo extraClass="logo" />
  <h1 class="title">Gisaima Realm</h1>
  <p class="subtitle">
    Open source territory control game with infinite worlds<br>
    Play for free across all devices • No pay-to-win • Real-time multiplayer
  </p>
  <div class="actions" class:loaded={!actionsLoading}>
    {#if !actionsLoading}
      {#if $user}
        {#if $game.currentWorld}
          <a href={`/map?world=${$game.currentWorld}`} class="button primary">Return to Game</a>
        {/if}
        <a href="/worlds" class="button secondary">See Worlds</a>
      {:else}
        <a href="/login" class="button primary">Play Now</a>
        <a href="/signup" class="button secondary">Register Here</a>
      {/if}
    {/if}
  </div>
</section>

<style>
  .showcase {
    text-align: center;
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    border-bottom: 1px solid var(--color-panel-border);
    margin-bottom: 3em;
    position: relative;
    overflow: hidden;
    isolation: isolate;
    box-sizing: border-box;
    padding: 2em;
  }

  .title {
    font-size: 2em;
    margin: 0.5em 0;
    letter-spacing: 0.2em;
    color: #e24144;
    text-shadow: 0 0 0.625em rgba(193, 19, 22, 0.5);
    font-weight: 400;
    font-family: var(--font-heading);
  }

  .subtitle {
    font-size: 1.2em;
    color: var(--color-text-secondary);
    margin: 1em 0 2em;
    font-weight: 300;
    font-family: var(--font-body);
    line-height: 1.6;
  }

  .actions {
    display: flex;
    justify-content: center;
    gap: 1.5em;
    padding-bottom: 2em;
    flex-wrap: wrap;
    min-height: 5em; /* Ensure consistent height during loading */
    opacity: 0;
    transition: opacity 0.5s ease;
  }

  .actions.loaded {
    opacity: 1;
  }

  :global(.showcase > .logo) {
    width: 7.5em;
    height: auto;
    margin: 0 auto;
    filter: drop-shadow(0 0 0.5em rgba(193, 19, 22, 0.6));
  }

  /* Hero CTA buttons styling */
  :global(.showcase .button) {
    font-size: 1.2em;
    padding: 0.6em 1.5em;
    font-weight: 700;
    letter-spacing: 0.05em;
    transition: all 0.3s ease;
    box-shadow: 0 0.3em 0.8em var(--color-shadow);
    text-transform: uppercase;
    text-decoration: none;
    font-family: var(--font-heading);
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }
  
  :global(.showcase .button:hover) {
    transform: translateY(-0.2em) scale(1.05);
    box-shadow: 0 0.5em 1em var(--color-shadow);
  }
  
  :global(.showcase .button.primary) {
    background-color: var(--color-button-primary);
    color: var(--color-text);
    border: 0.05em solid var(--color-muted-teal);
    text-shadow: 0 0 0.5em rgba(0, 0, 0, 0.5);
  }
  
  :global(.showcase .button.primary:hover) {
    background-color: var(--color-button-primary-hover);
    color: #ffffff;
    text-shadow: 0 0 0.8em rgba(0, 0, 0, 0.7);
  }
  
  :global(.showcase .button.secondary) {
    background-color: rgba(0, 0, 0, 0.3);
    color: var(--color-text);
    border: 0.05em solid var(--color-panel-border);
  }
  
  :global(.showcase .button.secondary:hover) {
    background-color: rgba(0, 0, 0, 0.4);
    border-color: var(--color-muted-teal);
    text-shadow: 0 0 0.5em rgba(0, 0, 0, 0.5);
  }

  .bg-wrapper {
    position: absolute;
    inset: 0;
    overflow: hidden;
    z-index: -1;
    background-color: var(--color-bg);
  }
  
  /* Improved background layers for smooth transitions */
  .bg-layer {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center center;
    background-repeat: no-repeat;
    will-change: opacity;
  }
  
  /* Current background layer */
  .bg-layer.current {
    opacity: 0.15;
    transition: opacity 1s ease-in-out;
  }
  
  /* Current layer fades out during transition */
  .bg-layer.current.fading {
    opacity: 0;
  }
  
  /* Next background layer */
  .bg-layer.next {
    opacity: 0;
    transition: opacity 1s ease-in-out;
  }
  
  /* Next layer fades in during transition */
  .bg-layer.next.active {
    opacity: 0.15;
  }

  /* Responsive styles */
  @media (min-width: 481px) {
    .showcase {
      padding: 4em 1em 2em;
    }
    
    .title {
      font-size: 2.5em;
    }
    
    .subtitle {
      font-size: 1.3em;
    }
  }

  @media (min-width: 769px) {
    .showcase {
      padding: 3em;
    }
    
    .title {
      font-size: 3.5em;
    }
    
    .subtitle {
      font-size: 1.4em;
      margin: 1.5em 0 3em;
    }

    :global(.showcase .button) {
      font-size: 1.5em;
      padding: 0.6em 1.8em;
      width: auto;
    }
  }
</style>
