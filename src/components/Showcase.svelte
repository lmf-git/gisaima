<script>
  import Logo from './Logo.svelte';
  import { user, loading as userLoading } from '$lib/stores/user';
  import { game, isAuthReady } from '$lib/stores/game';
  import { onMount } from 'svelte';
  
  // Update to use $props() runes API
  const { extraClass = '' } = $props();
  
  // Background image state with runes
  let currentBgIndex = $state(0);
  let nextBgIndex = $state(1);
  let activeBgLayer = $state(1);
  let bgTransitioning = $state(false);
  let bgImagesLoaded = $state(Array(7).fill(false));
  let initialBgLoaded = $state(false);
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
  
  // Function to preload the background images
  function preloadBackgroundImages() {
    // Load the first image with priority
    const firstImg = new Image();
    firstImg.onload = () => {
      bgImagesLoaded[0] = true;
      initialBgLoaded = true;
    };
    firstImg.src = backgroundImages[0];

    // Preload the rest of the images in the background
    backgroundImages.slice(1).forEach((src, idx) => {
      const bgImg = new Image();
      bgImg.onload = () => {
        bgImagesLoaded[idx + 1] = true;
      };
      bgImg.src = src;
    });
  }
  
  // Function to transition to the next background image
  function transitionToNextBg() {
    // Don't transition if already in progress
    if (bgTransitioning) {
      return;
    }
    
    // Calculate next image index
    const newNextIndex = (nextBgIndex + 1) % backgroundImages.length;
    
    // Only proceed if the next image is loaded
    if (!bgImagesLoaded[nextBgIndex]) {
      return;
    }
    
    // Start the transition
    bgTransitioning = true;
    
    // Toggle which layer is active (this triggers the CSS transition)
    activeBgLayer = activeBgLayer === 1 ? 2 : 1;
    
    // After transition completes, update the indices and clear the transition flag
    setTimeout(() => {
      currentBgIndex = nextBgIndex;
      nextBgIndex = newNextIndex;
      bgTransitioning = false;
    }, 1500); // Match this to the CSS transition time
  }
  
  // Start/stop background rotation
  function startBackgroundRotation() {
    if (rotationInterval) clearInterval(rotationInterval);
    rotationInterval = setInterval(transitionToNextBg, 10000);
  }
  
  function stopBackgroundRotation() {
    if (rotationInterval) {
      clearInterval(rotationInterval);
      rotationInterval = null;
    }
  }
  
  // Effect to handle automatic background rotation
  $effect(() => {
    if (!initialBgLoaded) return;
    
    // Start rotation when initial image is loaded
    startBackgroundRotation();
    
    // Cleanup on component destroy
    return stopBackgroundRotation;
  });
  
  onMount(() => {
    preloadBackgroundImages();
  });
</script>

<section class="showcase {extraClass}">
  <!-- Improved background handling with explicit layers -->
  <div class="bg-wrapper">
    {#if initialBgLoaded}
      <!-- Layer 1: Shows either current or next image depending on which is active -->
      <div 
        class="bg-overlay"
        class:active={activeBgLayer === 1}
        style={`background-image: url('${backgroundImages[activeBgLayer === 1 ? currentBgIndex : nextBgIndex]}');`}>
      </div>
      
      <!-- Layer 2: Shows the other image -->
      <div 
        class="bg-overlay"
        class:active={activeBgLayer === 2}
        style={`background-image: url('${backgroundImages[activeBgLayer === 2 ? currentBgIndex : nextBgIndex]}');`}>
      </div>
    {/if}
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
  
  .bg-overlay {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    transition: opacity 1.5s ease-in-out;
    opacity: 0;
    z-index: -10;
    will-change: opacity;
  }
  
  .bg-overlay.active {
    opacity: 0.15;
    z-index: -5;
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
