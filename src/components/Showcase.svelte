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
    }, 3000); // Match the longer CSS transition duration (3s)
  }
  
  onMount(() => {
    // Start rotation after component is mounted, with initial delay
    // This prevents any issues with reactivity before the component is ready
    const initialDelay = setTimeout(() => {
      // Setup interval to rotate backgrounds every 15 seconds (longer to enjoy each image)
      rotationInterval = setInterval(rotateBackground, 15000);
    }, 3000); // Longer initial delay for first viewing
    
    // Cleanup function
    return () => {
      clearTimeout(initialDelay);
      clearInterval(rotationInterval);
    };
  });
</script>

<section class="showcase {extraClass}">
  <div class="bg-wrapper">
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
  
  <div class="content-container">
    <Logo extraClass="logo" />
    <h1 class="title">Gisaima Realm</h1>
    <p class="subtitle">
      Open source territory control game with infinite worlds<br>
      Play for free across all devices • No pay-to-win • Real-time multiplayer
    </p>
    <div class="actions-wrapper">
      <div class="actions" class:loaded={!actionsLoading}>
        {#if actionsLoading}
          <div class="button-placeholder"></div>
          <div class="button-placeholder"></div>
        {:else}
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
    </div>
  </div>
</section>

<style>
  .showcase {
    text-align: center;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-bottom: 1px solid var(--color-panel-border);
    margin-bottom: 3em;
    position: relative;
    overflow: hidden;
    isolation: isolate;
    box-sizing: border-box;
    padding: 2em;
  }

  /* New content container with consistent spacing using gap instead of margins */
  .content-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    max-height: 36em;
    gap: 1.5em; /* Use gap for consistent spacing */
  }

  .title {
    font-size: 2em;
    margin: 0; /* Remove margins */
    letter-spacing: 0.2em;
    color: #e24144;
    text-shadow: 0 0 0.625em rgba(193, 19, 22, 0.5);
    font-weight: 400;
    font-family: var(--font-heading);
  }

  .subtitle {
    font-size: 1.2em;
    color: var(--color-text-secondary);
    margin: 0; /* Remove margins */
    font-weight: 300;
    font-family: var(--font-body);
    line-height: 1.6;
  }

  /* Wrapper with fixed height to prevent layout shifts */
  .actions-wrapper {
    margin: 0; /* Remove margin */
    width: 100%;
    height: 8em;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .actions {
    display: flex;
    justify-content: center;
    gap: 1.5em;
    flex-wrap: wrap;
    width: 100%;
    opacity: 0;
    transition: opacity 0.5s ease;
    position: absolute; /* Take out of document flow */
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%); /* Center precisely */
  }

  .actions.loaded {
    opacity: 1;
  }

  /* Button placeholders to maintain layout during loading */
  .button-placeholder {
    display: inline-block;
    height: 3.4em; /* Slightly taller to ensure enough space */
    width: 10em; /* Approximate button width */
    background: rgba(0, 0, 0, 0.1);
    border-radius: 0.25em;
  }

  /* At mobile sizes, make placeholders take full width */
  @media (max-width: 768px) {
    .button-placeholder {
      width: 100%;
      height: 3.8em; /* Taller for mobile */
    }
  }

  /* Correct global selector for logo */
  :global(.showcase .logo) {
    width: 7.5em;
    height: auto;
    margin: 0; /* Remove margin */
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
    transition: opacity 3s cubic-bezier(0.4, 0, 0.2, 1); /* Smoother easing function with longer duration */
  }
  
  /* Current layer fades out during transition */
  .bg-layer.current.fading {
    opacity: 0;
  }
  
  /* Next background layer */
  .bg-layer.next {
    opacity: 0;
    transition: opacity 3s cubic-bezier(0.4, 0, 0.2, 1); /* Matching transition for next layer */
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
    
    .content-container {
      max-height: 40em;
      gap: 2em; /* Increase spacing for tablet */
    }
    
    .title {
      font-size: 2.5em;
    }
    
    .subtitle {
      font-size: 1.3em;
    }

    .actions-wrapper {
      height: 9em; /* More space for tablet */
    }
    
    .button-placeholder {
      width: 12em; /* Slightly wider placeholders for tablet */
    }
  }

  @media (min-width: 769px) {
    .showcase {
      padding: 3em;
    }
    
    .content-container {
      max-height: 44em;
      gap: 2.5em; /* Increase spacing for desktop */
    }
    
    .title {
      font-size: 3.5em;
    }
    
    .subtitle {
      font-size: 1.4em;
      /* Remove margin: 1.5em 0 3em; and use container gap instead */
    }

    .actions-wrapper {
      height: 10em; /* More space for desktop */
    }
    
    :global(.showcase .button) {
      font-size: 1.5em;
      padding: 0.6em 1.8em;
      width: auto;
    }

    .button-placeholder {
      width: 14em; /* Wider placeholders for desktop */
    }
  }
</style>
