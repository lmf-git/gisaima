<script>
  import Logo from '../components/Logo.svelte';
  import { user, loading as userLoading } from '$lib/stores/user';
  import { game, isAuthReady } from '$lib/stores/game';
  import { onMount, onDestroy } from 'svelte';
  
  // Media gallery state
  let currentMediaIndex = $state(0);
  let fadeOut = $state(false);
  let galleryInterval;
  // Fix the reactivity issue by declaring videoElement with $state
  let videoElement = $state(null);
  
  // Array of media items (both videos and images) to display in the gallery
  const mediaItems = [
    { type: 'video', src: '/media/1.mp4', alt: 'Gameplay Video' },
    { type: 'image', src: '/media/2.png', alt: 'Game Board Screenshot' }
  ];
  
  // Function to advance to the next media item with crossfade
  function nextMedia() {
    fadeOut = true;
    
    setTimeout(() => {
      currentMediaIndex = (currentMediaIndex + 1) % mediaItems.length;
      fadeOut = false;
      
      // If we switched to a video, we need to let it render first
      setTimeout(() => {
        if (mediaItems[currentMediaIndex].type === 'video' && videoElement) {
          videoElement.play().catch(err => console.error("Video playback error:", err));
        }
      }, 50);
    }, 750); // Half of the total transition time
  }
  
  // Function to handle video end event
  function handleVideoEnd() {
    // Only auto-advance if this is still the current media item
    if (mediaItems[currentMediaIndex].type === 'video') {
      nextMedia();
    }
  }
  
  // Function to manually select a media item
  function selectMedia(index) {
    if (currentMediaIndex !== index) {
      // Clear any scheduled transitions
      if (galleryInterval) {
        clearInterval(galleryInterval);
        galleryInterval = null;
      }
      
      fadeOut = true;
      setTimeout(() => {
        currentMediaIndex = index;
        fadeOut = false;
        
        // If we switched to a video, play it
        setTimeout(() => {
          if (mediaItems[currentMediaIndex].type === 'video' && videoElement) {
            videoElement.play().catch(err => console.error("Video playback error:", err));
          } else {
            // For images, restart the interval
            startImageInterval();
          }
        }, 50);
      }, 750);
    }
  }
  
  // Function to start interval for image rotation
  function startImageInterval() {
    // Only set up interval for images, not videos
    if (mediaItems[currentMediaIndex].type === 'image') {
      // Clear any existing interval first
      if (galleryInterval) {
        clearInterval(galleryInterval);
      }
      // Change image every 5 seconds
      galleryInterval = setInterval(nextMedia, 5000);
    }
  }
  
  // Set up media handling on mount
  onMount(() => {
    // Video should start playing automatically (first item is video)
    setTimeout(() => {
      if (mediaItems[0].type === 'video' && videoElement) {
        videoElement.play().catch(err => {
          console.error("Initial video playback error:", err);
          // If autoplay fails (common on mobile), set up the gallery interval
          startImageInterval();
        });
      }
    }, 100);
    
    return () => {
      // Clean up interval on component destruction
      if (galleryInterval) {
        clearInterval(galleryInterval);
      }
    };
  });
  
  // Effect to manage the interval based on the current media type
  $effect(() => {
    // When the media changes, reset the interval appropriately
    if (mediaItems[currentMediaIndex].type === 'image') {
      startImageInterval();
    } else if (galleryInterval) {
      clearInterval(galleryInterval);
      galleryInterval = null;
    }
  });

  // Derived state for UI loading conditions
  const actionsLoading = $derived($userLoading || !$isAuthReady || $game.loading);

  // New state to track feature content loading
  let featuresLoaded = $state(true); // Assume loaded initially
</script>

<svelte:head>
  <title>Gisaima - Territory Strategy MMO</title>
  <meta name="description" content="A territory control strategy game based on ancient board games" />
</svelte:head>

<main class="container">
  <section class="showcase">
    <Logo extraClass="logo" />
    <h1 class="title">Gisaima Realm</h1>
    <p class="subtitle">A territory control strategy game inspired by ancient board games</p>
    <div class="actions">
      {#if actionsLoading}
        <!-- Placeholder buttons with same dimensions to prevent layout shift -->
        <div class="button-placeholder primary"></div>
        <div class="button-placeholder secondary"></div>
      {:else if $user}
        {#if $game.currentWorld}
          <a href={`/map?world=${$game.currentWorld}`} class="button primary">Return to Game</a>
        {/if}
        <a href="/worlds" class="button secondary">See Worlds</a>
      {:else}
        <a href="/login" class="button primary">Play Now</a>
        <a href="/signup" class="button secondary">Register Here</a>
      {/if}
    </div>
  </section>

  <section class="features">
    <h2 class="heading">Game Features</h2>
    <div class="grid">
      <div class="card">
        <h3 class="subheading">Territory Control</h3>
        <p class="text">Capture territory and expand your influence across the board</p>
      </div>
      <div class="card">
        <h3 class="subheading">Strategic Depth</h3>
        <p class="text">Plan several moves ahead and outmaneuver your opponents</p>
      </div>
      <div class="card">
        <h3 class="subheading">Ancient Inspiration</h3>
        <p class="text">Based on traditional board game concepts with modern twists</p>
      </div>
      <div class="card">
        <h3 class="subheading">Multiplayer</h3>
        <p class="text">Challenge friends or match with opponents online</p>
      </div>
    </div>
  </section>

  <section class="media">
    <h2 class="heading">Media</h2>
    <div class="media-intro">
      <div class="highlight-item">
        <span class="highlight-icon">▶️</span>
        <span class="highlight-text">Real gameplay footage</span>
      </div>
      <div class="highlight-item">
        <span class="highlight-icon">🌍</span>
        <span class="highlight-text">World map views</span>
      </div>
      <div class="highlight-item">
        <span class="highlight-icon">⚔️</span>
        <span class="highlight-text">Strategic battles</span>
      </div>
    </div>
    <div class="gallery">
      <div class="gallery-container">
        <div class={`gallery-media ${fadeOut ? 'fade-out' : 'fade-in'}`}>
          {#if mediaItems[currentMediaIndex].type === 'video'}
            <video 
              bind:this={videoElement}
              class="media-content video"
              src={mediaItems[currentMediaIndex].src}
              muted
              playsInline
              onended={handleVideoEnd}
            ></video>
          {:else}
            <img 
              src={mediaItems[currentMediaIndex].src} 
              alt={mediaItems[currentMediaIndex].alt} 
              class="media-content screenshot" 
            />
          {/if}
        </div>
        
        <div class="gallery-dots">
          {#each mediaItems as _, index}
            <button 
              class="gallery-dot {currentMediaIndex === index ? 'active' : ''}" 
              aria-label={`View media ${index + 1}`}
              onclick={() => selectMedia(index)}
            ></button>
          {/each}
        </div>
      </div>
    </div>
  </section>
  
  <!-- Footer removed -->
</main>

<style>
  .container {
    width: calc(100% - 1.5em);
    margin: 0 auto;
    color: var(--color-text);
  }

  .showcase {
    text-align: center;
    padding: 0 0.5em 2.5em; /* Increased padding at bottom from 2em to 2.5em */
    border-bottom: 1px solid var(--color-panel-border);
    margin-bottom: 2em; /* Increased margin from 1em to 2em */
  }

  .title {
    font-size: 2em;
    margin: 0.5em 0;
    letter-spacing: 0.2em;
    color: #e24144;
    text-shadow: 0 0 0.625em rgba(193, 19, 22, 0.5);
    font-weight: 400; /* Reduced font weight */
    font-family: var(--font-heading); /* Added heading font */
  }

  .subtitle {
    font-size: 1em;
    color: var(--color-text-secondary);
    margin-bottom: 2em;
    font-weight: 300; /* Added leaner font weight */
    font-family: var(--font-body); /* Add body font */
  }

  .actions {
    display: flex;
    justify-content: center;
    gap: 1.5em;
    margin-top: 2.5em;
    flex-wrap: wrap;
    min-height: 5em; /* Ensure consistent height during loading */
  }

  /* Remove the .actions.loading class and separate the loading styles */
  .button-placeholder {
    width: 12em;
    height: 4em;
    border-radius: 0.25em;
    background: linear-gradient(90deg, 
      var(--color-panel-bg) 0%, 
      var(--color-dark-blue) 50%, 
      var(--color-panel-bg) 100%);
    background-size: 200% 100%;
    animation: loading-pulse 1.5s infinite;
    opacity: 0.7;
  }

  .button-placeholder.primary {
    border: 0.05em solid var(--color-muted-teal);
  }

  .button-placeholder.secondary {
    border: 0.05em solid var(--color-panel-border);
  }

  @keyframes loading-pulse {
    0% { background-position: 100% 0; }
    100% { background-position: -100% 0; }
  }

  /* Hero CTA buttons styling - update to fix vertical alignment */
  .actions > :global(.button) {
    font-size: 1.2em;
    padding: 0.6em 1.5em;  /* Reduced vertical padding from 0.8em to 0.6em */
    font-weight: 700;
    letter-spacing: 0.05em;
    transition: all 0.3s ease;
    box-shadow: 0 0.3em 0.8em var(--color-shadow);
    text-transform: uppercase;
    text-decoration: none;
    font-family: var(--font-heading);
    line-height: 1;  /* Add line-height to normalize text spacing */
    display: inline-flex;  /* Change to inline-flex for better content alignment */
    align-items: center;  /* Center content vertically */
    justify-content: center;  /* Center content horizontally */
    width: 100%;
  }
  
  .actions > :global(.button):hover {
    transform: translateY(-0.2em) scale(1.05);
    box-shadow: 0 0.5em 1em var(--color-shadow);
  }
  
  .actions > :global(.button).primary {
    background-color: var(--color-button-primary);
    color: var(--color-text);
    border: 0.05em solid var(--color-muted-teal);
    text-shadow: 0 0 0.5em rgba(0, 0, 0, 0.5); /* Add text shadow to improve contrast */
  }
  
  .actions > :global(.button).primary:hover {
    background-color: var(--color-button-primary-hover);
    color: #ffffff; /* Brighter text on hover for better contrast */
    text-shadow: 0 0 0.8em rgba(0, 0, 0, 0.7); /* Enhanced text shadow on hover */
  }
  
  .actions > :global(.button).secondary {
    background-color: rgba(0, 0, 0, 0.3);
    color: var(--color-text);
    border: 0.05em solid var(--color-panel-border);
  }
  
  .actions > :global(.button).secondary:hover {
    background-color: rgba(0, 0, 0, 0.4);
    border-color: var(--color-muted-teal); /* Match the primary button's border on hover */
    text-shadow: 0 0 0.5em rgba(0, 0, 0, 0.5); /* Add text shadow for consistency */
  }

  .features, .media {
    padding: 3em 0 3em; /* Increased padding at the bottom */
    border-bottom: 1px solid var(--color-panel-border);
    margin-bottom: 2em; /* Increased margin at the bottom */
  }
  
  /* Add specific bottom margin to the media section and remove border */
  .media {
    padding: 3em 0 4em; /* Increased padding at the bottom to 4em */
    margin-bottom: 5em; /* Keep the large bottom margin */
    border-bottom: none; /* No border since it's the last section */
  }

  .heading {
    text-align: center;
    margin-bottom: 2em;
    color: var(--color-pale-green);
    text-shadow: 0 0 0.3125em rgba(12, 8, 33, 0.7);
    font-family: var(--font-heading); /* Added heading font */
    font-weight: 400; /* Reduced font weight */
    font-size: 1.8em; /* Increased from default h2 size */
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1em;
    /* Add these properties to maintain consistent card sizing */
    grid-auto-rows: minmax(10em, auto);
  }

  .card {
    padding: 1.5em;
    border-radius: 0.5em;
    background-color: var(--color-panel-bg);
    box-shadow: 0 0.25em 0.375em var(--color-shadow);
    border: 0.0625em solid var(--color-panel-border);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    /* Add these properties to prevent layout shift */
    display: flex;
    flex-direction: column;
    min-height: 10em; /* Set minimum height */
    height: 100%;
  }
  
  .card:hover {
    transform: translateY(-0.2em);
    box-shadow: 0 0.4em 0.6em var(--color-shadow);
  }

  .subheading {
    color: var(--color-muted-teal);
    margin-bottom: 0.75em;
    font-family: var(--font-heading); /* Added heading font */
    font-weight: 400; /* Reduced font weight */
    font-size: 1.6em; /* Increased from default h3 size */
    /* Add min-height to heading so it takes consistent space */
    min-height: 1.5em;
    display: flex;
    align-items: center;
  }

  .text {
    color: var(--color-text);
    /* Ensure text takes up the remaining height in the card */
    flex: 1;
    /* Set line height and other text properties to control height */
    line-height: 1.5;
    /* Fix text size to prevent resizing */
    font-size: 1em;
    font-family: var(--font-body); /* Add body font */
  }

  .overview {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2em;
  }

  .content, .preview {
    flex: 1 1 20em;
  }

  .link {
    color: var(--color-pale-green);
    text-decoration: none;
    font-weight: 500;
    transition: color 0.2s ease;
  }

  .link:hover {
    text-decoration: underline;
    color: var(--color-muted-teal);
  }

  .preview {
    height: 18.75em;
    background: linear-gradient(135deg, var(--color-deep-blue), var(--color-dark-teal-blue));
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.5em;
    border: 0.125em dashed var(--color-muted-teal);
    overflow: hidden; /* Ensure image doesn't overflow rounded corners */
  }
  
  .preview-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain; /* Maintain aspect ratio */
    border-radius: 0.3em; /* Add slight border radius to the image */
  }

  /* Update the logo selector to be more specific with child selector */
  .showcase > :global(.logo) {
    width: 7.5em;
    height: auto;
    margin: 0 auto;
    filter: drop-shadow(0 0 0.5em rgba(193, 19, 22, 0.6));
  }
  
  /* Tablet (medium devices) */
  @media (min-width: 481px) {
    .container {
      width: calc(100% - 2.5em);
    }
    
    .showcase {
      padding: 0 1em 2em;
    }
    
    .title {
      font-size: 2.5em;
    }
    
    .subtitle {
      font-size: 1.1em;
    }
    
    .heading {
      font-size: 2.2em;
    }
    
    .gallery-dot {
      width: 0.7em;
      height: 0.7em;
    }
  }

  /* Desktop (large devices) */
  @media (min-width: 769px) {
    .container {
      width: calc(100% - 5em);
      padding: 0;
    }
    
    .showcase {
      padding: 0 3em 3em; /* Increased padding at bottom from 2em to 3em for desktop */
    }
    
    .title {
      font-size: 3.5em;
    }
    
    .subtitle {
      font-size: 1.2em;
    }
    
    .actions > :global(.button) {
      font-size: 1.5em;
      padding: 0.6em 1.8em;
      width: auto;
    }
    
    .heading {
      font-size: 2.6em;
    }
    
    .grid {
      grid-template-columns: repeat(auto-fit, minmax(15em, 1fr));
      gap: 2em;
      grid-auto-rows: minmax(12em, auto);
    }
    
    .card {
      min-height: 12em;
    }
    
    .features {
      padding: 4em 0 5em; /* Increased padding at bottom from 4em to 5em for desktop */
    }
    
    .media {
      padding: 4em 0 5em; /* Increased padding at bottom to 5em for desktop */
    }
    
    .gallery-dot {
      width: 0.8em;
      height: 0.8em;
    }
  }

  /* Gallery styles */
  .gallery {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0 1em;
  }
  
  .gallery-container {
    width: 100%;
    max-width: 960px;
    position: relative;
    border-radius: 0.5em;
    overflow: hidden;
    box-shadow: 0 0.3em 1em var(--color-shadow);
    background: linear-gradient(135deg, var(--color-dark-blue), var(--color-dark-navy));
    aspect-ratio: 16 / 9;
  }
  
  .gallery-media {
    position: absolute;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: opacity 1.5s ease;
  }
  
  .fade-in {
    opacity: 1;
  }
  
  .fade-out {
    opacity: 0;
  }
  
  .media-content {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 0.3em;
  }
  
  .media-content.video {
    width: 100%;
    height: 100%;
    object-fit: cover; /* Video fills the container */
  }
  
  .gallery-dots {
    position: absolute;
    bottom: 1em;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    gap: 0.8em;
    z-index: 5;
  }
  
  .gallery-dot {
    width: 0.8em;
    height: 0.8em;
    border-radius: 50%;
    background-color: rgba(255, 255, 255, 0.3);
    border: none;
    cursor: pointer;
    transition: background-color 0.3s ease, transform 0.2s ease;
    padding: 0;
  }
  
  .gallery-dot.active {
    background-color: var(--color-pale-green);
    transform: scale(1.2);
  }
  
  .gallery-dot:hover {
    background-color: rgba(255, 255, 255, 0.5);
  }
  
  .gallery-dot.active:hover {
    background-color: var(--color-pale-green);
  }

  /* Media section introduction styling - simplified */
  .media-intro {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    gap: 1.5em;
    margin-bottom: 2em;
    padding: 0 1em;
  }
  
  .highlight-item {
    display: flex;
    align-items: center;
    gap: 0.8em;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 0.5em;
    border: 1px solid var(--color-panel-border);
    padding: 0.7em 1em;
    min-width: 12em;
  }
  
  .highlight-icon {
    font-size: 1.2em;
  }
  
  .highlight-text {
    color: var(--color-pale-green);
    font-size: 1em;
    font-weight: 400;
    font-family: var(--font-body); /* Add body font */
  }
</style>