<script>
  import Logo from './Logo.svelte';
  import { user, loading as userLoading } from '$lib/stores/user';
  import { game, isAuthReady } from '$lib/stores/game';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  
  // Update to use $props() runes API - keep only the extraClass prop
  const { extraClass = '' } = $props();
  
  // Simplified background image state with runes
  let bgIndex = $state(0);
  let nextBgIndex = $state(1);
  let bgTransitioning = $state(false);
  let rotationInterval = $state(null);
  
  // Track image loading states
  let loadedImages = $state(new Set());
  let currentImageLoading = $state(true);
  let nextImageLoading = $state(true);
  let initialLoadStarted = $state(false);
  
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

  // Preload an image and track its loading state
  function preloadImage(src) {
    return new Promise((resolve, reject) => {
      // Skip if already loaded
      if (loadedImages.has(src)) {
        resolve(src);
        return;
      }
      
      const img = new Image();
      img.src = src;
      
      img.onload = () => {
        loadedImages.add(src);
        resolve(src);
      };
      
      img.onerror = () => {
        reject(`Failed to load image: ${src}`);
      };
    });
  }

  // Simple function to handle the background transition
  async function rotateBackground() {
    if (bgTransitioning) return;
    
    // Calculate next index
    const nextIndex = (bgIndex + 1) % backgroundImages.length;
    nextBgIndex = nextIndex;
    
    // Preload the next image before transitioning
    nextImageLoading = true;
    try {
      // Preload the current next image
      await preloadImage(backgroundImages[nextIndex]);
      nextImageLoading = false;
      
      // Start transition to next image
      bgTransitioning = true;
      
      // After transition completes, update the current index and reset state
      setTimeout(() => {
        bgIndex = nextBgIndex;
        bgTransitioning = false;
        
        // Preload the next image after transition
        const futureIndex = (nextIndex + 1) % backgroundImages.length;
        preloadImage(backgroundImages[futureIndex]).catch(console.error);
      }, 3000); // Match the longer CSS transition duration (3s)
    } catch (error) {
      console.error(error);
      nextImageLoading = false;
      // Continue rotation even if image failed to load
      setTimeout(rotateBackground, 5000);
    }
  }
  
  onMount(async () => {
    // Start loading first image immediately
    initialLoadStarted = true;
    
    // Start preloading in parallel - don't block showing the first image
    Promise.all([
      // Preload first image
      preloadImage(backgroundImages[bgIndex]).then(() => {
        currentImageLoading = false;
      }).catch(error => {
        console.error(error);
        currentImageLoading = false;
      }),
      
      // Preload second image
      preloadImage(backgroundImages[nextBgIndex]).then(() => {
        nextImageLoading = false;
      }).catch(console.error)
    ]);
    
    // Start rotation after component is mounted, with initial delay
    const initialDelay = setTimeout(() => {
      // Only start rotation when both initial images are loaded
      const startRotation = () => {
        rotationInterval = setInterval(rotateBackground, 15000);
      };
      
      if (!currentImageLoading && !nextImageLoading) {
        startRotation();
      } else {
        // Check again in a second if images aren't loaded yet
        const checkInterval = setInterval(() => {
          if (!currentImageLoading && !nextImageLoading) {
            clearInterval(checkInterval);
            startRotation();
          }
        }, 1000);
        
        // Fallback - start rotation after max wait time even if images aren't loaded
        setTimeout(() => {
          clearInterval(checkInterval);
          startRotation();
        }, 5000);
      }
    }, 3000);
    
    // Preload other images in the background
    for (let i = 2; i < backgroundImages.length; i++) {
      preloadImage(backgroundImages[i]).catch(console.error);
    }
    
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
      class:loading={currentImageLoading}
      class:initial-load={!initialLoadStarted || currentImageLoading}>
      <!-- Always set the background image to allow progressive loading -->
      <div class="bg-image" style={`background-image: url('${backgroundImages[bgIndex]}');`}></div>
      
      <!-- Loading indicator only for first image -->
      {#if !initialLoadStarted || currentImageLoading}
        <div class="loading-indicator"></div>
      {/if}
    </div>
    
    <div 
      class="bg-layer next"
      class:active={bgTransitioning}
      class:loading={nextImageLoading}
      style={nextImageLoading ? 'background-image: none;' : `background-image: url('${backgroundImages[nextBgIndex]}');`}>
    </div>
  </div>
  
  <div class="content-container">
    <Logo extraClass="logo" />
    <h1 class="title">Gisaima Realm</h1>
    <p class="subtitle">
      Real-time multiplayer territory game where you create and explore infinite worlds, free to play across all devices with no pay-to-win mechanics and fully <a href="https://github.com/lmf-git/gisaima" target="_blank" rel="noopener noreferrer" class="github-link">open source</a>.
    </p>
    <div class="actions-wrapper">
      <div class="actions" class:loaded={!actionsLoading}>
        {#if !actionsLoading}
          {#if $user}
            {#if $game.worldKey}
              <a href={`/map?world=${$game.worldKey}`} class="button primary">Resume</a>
            {/if}
            <a href="/worlds" class="button secondary">See Worlds</a>
          {:else}
            <a href="/login" class="button primary">Play</a>
            <a href="/guide" class="button secondary">Guide</a>
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
    font-size: 2.5em; /* Increased from 2em */
    margin: 0; /* Remove margins */
    letter-spacing: 0.2em;
    color: #e24144;
    text-shadow: 0 0 0.625em rgba(193, 19, 22, 0.5);
    font-weight: 400;
    font-family: var(--font-heading);
  }

  .subtitle {
    font-size: 1.4em; /* Increased from 1.2em */
    color: var(--color-text-secondary);
    margin: 0; /* Remove margins */
    font-weight: 300;
    font-family: var(--font-body);
    line-height: 1.6;
    max-width: 90%;
  }

  .github-link {
    color: var(--color-pale-green);
    text-decoration: none;
    position: relative;
    transition: color 0.2s ease;
  }

  .github-link::after {
    content: '';
    position: absolute;
    width: 100%;
    height: 1px;
    bottom: 0;
    left: 0;
    background-color: var(--color-pale-green);
    transform: scaleX(0);
    transform-origin: bottom right;
    transition: transform 0.3s ease;
  }

  .github-link:hover {
    color: #9FFFEA;
  }

  .github-link:hover::after {
    transform: scaleX(1);
    transform-origin: bottom left;
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
    max-width: 90%; /* Add max-width to prevent overflow */
  }

  .actions.loaded {
    opacity: 1;
  }

  /* Remove button placeholders - rely on opacity transition */

  /* At mobile sizes */
  @media (max-width: 768px) {
    /* Remove button placeholder styles */
  }

  /* Correct global selector for logo */
  :global(.showcase .logo) {
    width: 9em; /* Increased from 7.5em */
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
    min-width: 120px; /* Add minimum width */
    max-width: 200px; /* Add maximum width */
    width: auto; /* Change from 100% to auto */
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
    will-change: opacity;
  }
  
  /* Inner background image container for progressive loading */
  .bg-image {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center center;
    background-repeat: no-repeat;
    opacity: 0.15;
  }
  
  /* Current background layer */
  .bg-layer.current {
    opacity: 1;
    transition: opacity 3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  /* Current layer fades out during transition */
  .bg-layer.current.fading .bg-image {
    opacity: 0;
  }
  
  /* Next background layer */
  .bg-layer.next {
    opacity: 0;
    transition: opacity 3s cubic-bezier(0.4, 0, 0.2, 1);
    background-size: cover;
    background-position: center center;
    background-repeat: no-repeat;
  }
  
  /* Next layer fades in during transition */
  .bg-layer.next.active {
    opacity: 0.15;
  }

  /* Loading state styling */
  .bg-layer.loading {
    background: var(--color-bg);
  }
  
  /* Initial loading state - subtle pulse animation */
  .bg-layer.initial-load .bg-image {
    opacity: 0.05;
  }
  
  /* Loading indicator for first image */
  .loading-indicator {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 60px;
    height: 60px;
    border-radius: 50%;
    border: 3px solid rgba(226, 65, 68, 0.2);
    border-top-color: rgba(226, 65, 68, 0.8);
    animation: spin 1.5s linear infinite;
    opacity: 0.5;
  }
  
  @keyframes spin {
    to { transform: translate(-50%, -50%) rotate(360deg); }
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
      font-size: 3em; /* Increased from 2.5em */
    }
    
    .subtitle {
      font-size: 1.5em; /* Increased from 1.3em */
    }

    .actions-wrapper {
      height: 9em; /* More space for tablet */
    }
    
    /* Remove button placeholder styles */
    
    :global(.showcase .button) {
      width: auto; /* Ensure buttons use auto width on tablet */
      min-width: 150px; /* Larger minimum width for tablet */
    }
    
    .actions {
      max-width: 90%;
      gap: 1.2em; /* Reduce gap slightly for better fit */
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
      font-size: 4.2em; /* Increased from 3.5em */
    }
    
    .subtitle {
      font-size: 1.6em; /* Increased from 1.4em */
      max-width: 80%;
    }

    :global(.showcase .logo) {
      width: 12em; /* Increased size for desktop */
    }

    /* Remove button placeholder styles */
    
    :global(.showcase .button) {
      font-size: 1.5em;
      padding: 0.6em 1.8em;
      width: auto; /* Ensure buttons are auto width */
      min-width: 180px; /* Larger minimum width for desktop */
      max-width: 280px; /* Larger maximum width for desktop */
    }

    .actions {
      max-width: 80%;
      gap: 1.5em; /* Restore gap for desktop */
    }
  }
</style>
