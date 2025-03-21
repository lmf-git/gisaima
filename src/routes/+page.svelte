<script>
  import Logo from '../components/Logo.svelte';
  import { user, loading as userLoading } from '$lib/stores/user';
  import { game, isAuthReady } from '$lib/stores/game';
  import { onMount, onDestroy } from 'svelte';
  
  // Array of media items (both videos and images) to display in the gallery
  const mediaItems = [
    { type: 'video', src: '/media/1.mp4', alt: 'Gameplay Video' },
    { type: 'image', src: '/media/2.png', alt: 'Game Board Screenshot' }
  ];
  
  // Media gallery state
  let currentMediaIndex = $state(0);
  let fadeOut = $state(false);
  let galleryInterval;
  let videoElement = $state(null);
  
  // Add states for graceful loading
  let mediaLoaded = $state(Array(mediaItems.length).fill(false));
  let mediaLoading = $state(false);
  let videoPlaying = $state(false); // Track if video is currently playing
  let minVideoPlayTime = 5000; // Minimum time to show video in ms
  let videoStartTime = 0; // Track when video started playing
  
  // Function to preload gallery media
  function preloadGalleryMedia() {
    // Preload images
    mediaItems.forEach((item, index) => {
      if (item.type === 'image') {
        const img = new Image();
        img.onload = () => {
          mediaLoaded[index] = true;
        };
        img.src = item.src;
      }
    });
  }
  
  // Function to handle image load events
  function handleImageLoad() {
    if (mediaItems[currentMediaIndex].type === 'image') {
      mediaLoaded[currentMediaIndex] = true;
    }
  }
  
  // Function to handle video loadeddata events
  function handleVideoLoaded() {
    if (mediaItems[currentMediaIndex].type === 'video') {
      mediaLoaded[currentMediaIndex] = true;
    }
  }
  
  // Function to handle video play events
  function handleVideoPlay() {
    if (mediaItems[currentMediaIndex].type === 'video') {
      videoPlaying = true;
      videoStartTime = Date.now();
      console.log("Video started playing");
    }
  }
  
  // Updated function to advance to the next media item with crossfade
  function nextMedia() {
    // If video is currently playing and hasn't played for minimum time, don't advance
    if (videoPlaying && Date.now() - videoStartTime < minVideoPlayTime) {
      console.log("Video playing for less than minimum time, not advancing");
      return;
    }
    
    mediaLoading = true;
    fadeOut = true;
    videoPlaying = false;
    
    setTimeout(() => {
      currentMediaIndex = (currentMediaIndex + 1) % mediaItems.length;
      
      // If we switched to a video, we need to prepare it
      if (mediaItems[currentMediaIndex].type === 'video' && videoElement) {
        // Reset the video element
        videoElement.currentTime = 0;
        videoElement.load();
        
        // Don't start the fade-in transition until video can start playing
        videoElement.oncanplay = () => {
          console.log("Video can play now");
          fadeOut = false;
          
          // Start playing the video
          const playPromise = videoElement.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                // Video successfully started playing
                console.log("Video playback started");
              })
              .catch(err => {
                console.error("Video playback error:", err);
                // Still fade in even if video can't play
                fadeOut = false;
                // If video can't play, consider it loaded and not loading
                mediaLoaded[currentMediaIndex] = true;
                setTimeout(() => {
                  mediaLoading = false;
                }, 700);
              });
          }
        };
      } else {
        // For images, just fade in
        fadeOut = false;
        // Restart interval for images
        if (mediaItems[currentMediaIndex].type === 'image') {
          startImageInterval();
        }
      }
      
      // Wait for fade-in to complete before allowing next transition
      setTimeout(() => {
        mediaLoading = false;
      }, 1000);
    }, 750);
  }
  
  // Function to handle video end event
  function handleVideoEnd() {
    // Only auto-advance if this is still the current media item and we're not already transitioning
    if (mediaItems[currentMediaIndex].type === 'video' && !mediaLoading) {
      videoPlaying = false;
      console.log("Video ended, advancing");
      nextMedia();
    }
  }
  
  // Updated function to manually select a media item
  function selectMedia(index) {
    if (currentMediaIndex !== index && !mediaLoading) {
      // Clear any scheduled transitions
      if (galleryInterval) {
        clearInterval(galleryInterval);
        galleryInterval = null;
      }
      
      mediaLoading = true;
      fadeOut = true;
      videoPlaying = false;
      
      setTimeout(() => {
        currentMediaIndex = index;
        
        // If we switched to a video, prepare it
        if (mediaItems[currentMediaIndex].type === 'video' && videoElement) {
          // Reset video
          videoElement.currentTime = 0;
          videoElement.load();
          
          videoElement.oncanplay = () => {
            fadeOut = false;
            
            // Start playing the video
            const playPromise = videoElement.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  console.log("Video playing after manual selection");
                })
                .catch(err => {
                  console.error("Video playback error:", err);
                  mediaLoaded[currentMediaIndex] = true;
                  setTimeout(() => {
                    mediaLoading = false;
                  }, 700);
                });
            }
          };
        } else {
          // For images, just fade in and restart interval
          fadeOut = false;
          if (mediaItems[currentMediaIndex].type === 'image') {
            startImageInterval();
          }
        }
        
        // Wait for the fade-in to complete before allowing next transition
        setTimeout(() => {
          mediaLoading = false;
        }, 1000);
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
    // Preload the first background image
    preloadFirstBackground();
    
    // Preload gallery media
    preloadGalleryMedia();
    
    // Video should start playing automatically (first item is video)
    setTimeout(() => {
      if (mediaItems[0].type === 'video' && videoElement) {
        // Set up oncanplay handler for initial video
        videoElement.oncanplay = () => {
          const playPromise = videoElement.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log("Initial video playing");
                videoPlaying = true;
                videoStartTime = Date.now();
              })
              .catch(err => {
                console.error("Initial video playback error:", err);
                // If autoplay fails (common on mobile), set up the gallery interval
                startImageInterval();
              });
          }
        };
        
        // Load the video
        videoElement.load();
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

  // Background image state - simplified approach
  let currentBgIndex = $state(0);
  let bgFadeOut = $state(false);
  let bgLoaded = $state(false); // Track initial background load
  // Update paths to the correct banner locations
  const backgroundImages = [
    '/banners/1.jpeg',
    '/banners/2.jpeg',
    '/banners/3.jpeg',
    '/banners/4.jpeg',
    '/banners/5.jpeg',
    '/banners/6.jpeg',
    '/banners/7.jpeg'
  ];
  
  // Function to preload the first background image
  function preloadFirstBackground() {
    const img = new Image();
    img.onload = () => {
      bgLoaded = true; // Mark as loaded once the image is ready
    };
    img.src = backgroundImages[0];

    // Preload the rest of the images in the background
    backgroundImages.slice(1).forEach((src) => {
      const bgImg = new Image();
      bgImg.src = src;
    });
  }
  
  // Effect to handle background crossfade - simplified
  $effect(() => {
    if (!bgLoaded) return; // Wait for first image to load
    
    const interval = setInterval(() => {
      bgFadeOut = true;
      
      setTimeout(() => {
        currentBgIndex = (currentBgIndex + 1) % backgroundImages.length;
        bgFadeOut = false;
      }, 1000); // Wait for fade-out to complete
    }, 8000); // Change background every 8 seconds
    
    return () => clearInterval(interval);
  });
</script>

<svelte:head>
  <title>Gisaima - Territory Strategy MMO</title>
  <meta name="description" content="An open source territory control strategy game with infinite procedurally generated worlds. No pay-to-win mechanics, based on ancient board games with modern twists." />
</svelte:head>

<main class="container">
  <section class="showcase">
    <!-- Simplified background handling with just two layers -->
    <div class="bg-wrapper">
      {#if bgLoaded}
        <div 
          class="bg-overlay" 
          style={`background-image: url('${backgroundImages[currentBgIndex]}'); 
                opacity: ${bgFadeOut ? 0 : 0.15};`}>
        </div>
        <div 
          class="bg-overlay next-bg" 
          style={`background-image: url('${backgroundImages[(currentBgIndex + 1) % backgroundImages.length]}'); 
                opacity: ${bgFadeOut ? 0.15 : 0};`}>
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

  <section class="media">
    <h2 class="heading">Media</h2>
    
    <div class="media-container">
      <div class="media-intro">
        <p class="media-desc">
          Journey into the realm of Gisaima through our immersive media gallery. As an open source project, Gisaima offers infinite procedurally generated worlds with a fair and balanced gaming environment - no pay-to-win mechanics ever. Watch as territories fall and empires rise in real-time strategic gameplay that synchronizes instantly across all your devices. These visuals showcase the dynamic worlds where resource management, tactical combat, and territorial conquest blend together in a unique gaming experience inspired by ancient board game principles.
        </p>
      </div>
      
      <div class="gallery">
        <div class="gallery-container">
          <div class={`gallery-media ${fadeOut ? 'fade-out' : 'fade-in'}`}>
            {#if mediaItems[currentMediaIndex].type === 'video'}
              <div class="media-wrapper video-wrapper">
                <div class="loader" class:hidden={mediaLoaded[currentMediaIndex]}></div>
                <video 
                  bind:this={videoElement}
                  class="media-content video"
                  src={mediaItems[currentMediaIndex].src}
                  muted
                  playsInline
                  preload="auto"
                  onloadeddata={handleVideoLoaded}
                  onplay={handleVideoPlay}
                  onended={handleVideoEnd}
                  class:visible={mediaLoaded[currentMediaIndex]}
                ></video>
              </div>
            {:else}
              <div class="media-wrapper image-wrapper">
                <div class="loader" class:hidden={mediaLoaded[currentMediaIndex]}></div>
                <img 
                  src={mediaItems[currentMediaIndex].src} 
                  alt={mediaItems[currentMediaIndex].alt} 
                  class="media-content screenshot"
                  onload={handleImageLoad}
                  class:visible={mediaLoaded[currentMediaIndex]} 
                />
              </div>
            {/if}
          </div>
          
          <div class="gallery-dots">
            {#each mediaItems as _, index}
              <button 
                class="gallery-dot {currentMediaIndex === index ? 'active' : ''}" 
                aria-label={`View media ${index + 1}`}
                onclick={() => selectMedia(index)}
                disabled={mediaLoading}
              ></button>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="features">
    <h2 class="heading">Game Features</h2>
    <div class="grid">
        <div class="card">
            <h3 class="subheading">Infinite Worlds</h3>
            <p class="text">Explore endless procedurally generated realms, each with unique challenges and opportunities</p>
        </div>
        <div class="card">
            <h3 class="subheading">Territory Control</h3>
            <p class="text">Capture territory and expand your influence across the board</p>
        </div>
        <div class="card">
            <h3 class="subheading">Strategic Depth</h3>
            <p class="text">Plan several moves ahead and outmaneuver your opponents</p>
        </div>
        <div class="card">
            <h3 class="subheading">Open Source</h3>
            <p class="text">Community-driven development with full transparency and collaboration</p>
        </div>
        <div class="card">
            <h3 class="subheading">No Pay-to-Win</h3>
            <p class="text">Equal playing field for all - success depends solely on skill and strategy</p>
        </div>
        <div class="card">
            <h3 class="subheading">Cross-Device Sync</h3>
            <p class="text">Real-time gameplay synchronization across all your devices</p>
        </div>
        <div class="card">
            <h3 class="subheading">Procedural Maps</h3>
            <p class="text">Every game board is uniquely generated, ensuring fresh experiences every time</p>
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
</main>

<style>
  .container {
    width: calc(100% - 1.5em);
    margin: 0 auto;
    color: var(--color-text);
  }

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
    font-weight: 400; /* Reduced font weight */
    font-family: var(--font-heading); /* Added heading font */
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
    margin-top: auto;
    padding-bottom: 2em;
    flex-wrap: wrap;
    min-height: 5em; /* Ensure consistent height during loading */
    opacity: 0;
    transition: opacity 0.5s ease;
  }

  .actions.loaded {
    opacity: 1;
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
    padding: 4em 0 4em; /* Increased padding from 3em to 4em */
    margin-bottom: 3em; /* Increased margin from 2em to 3em */
  }

  /* Add specific styling for media section since it's now in the middle */
  .media {
    border-bottom: 1px solid var(--color-panel-border);
  }

  /* Remove border and update features section */
  .features {
    border-bottom: none;
    padding-bottom: 6em; /* Increase bottom padding since it's the last section */
    margin-bottom: 0; /* Remove margin since it's the last section */
  }

  .heading {
    text-align: center;
    margin-bottom: 1.5em; /* Reduced from 2em to 1.5em */
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
    /* Limit width and center */
    max-width: 1200px;
    margin: 0 auto;
    width: 90%; /* Use percentage width for small screens */
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
  
  /* Media container needs display flex and proper responsive behavior */
  .media-container {
    display: flex;
    flex-direction: column;
    gap: 2em;
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1em;
    box-sizing: border-box;
  }
  
  /* Media section introduction styling */
  .media-intro {
    display: flex;
    flex-direction: column;
    width: 100%;
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  
  .media-desc {
    color: var(--color-text);
    font-size: 1.3em; /* Increased from 1.1em */
    line-height: 1.6;
    margin: 0;
    font-family: var(--font-body);
    text-align: left;
    font-weight: 300; /* Added lighter font weight */
  }

  /* Gallery styles */
  .gallery {
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    box-sizing: border-box;
    padding: 0;
  }
  
  .gallery-container {
    width: 100%;
    position: relative;
    border-radius: 0.5em;
    overflow: hidden;
    box-shadow: 0 0.3em 1em var(--color-shadow);
    background: linear-gradient(135deg, var(--color-dark-blue), var(--color-dark-navy));
    aspect-ratio: 16 / 9;
    box-sizing: border-box;
  }
  
  .gallery-media {
    position: absolute;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: opacity 1.5s ease; /* Extended transition time for smoother fades */
  }
  
  /* Enhanced fade transitions */
  .fade-in {
    opacity: 1;
  }
  
  .fade-out {
    opacity: 0;
  }
  
  /* Media wrapper for positioning content and loaders */
  .media-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  
  /* Updated media content styles with visibility transitions */
  .media-content {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 0.3em;
    opacity: 0;
    transition: opacity 0.7s ease; /* Smooth fade-in transition */
  }
  
  .media-content.visible {
    opacity: 1;
  }
  
  .media-content.video {
    width: 100%;
    height: 100%;
    object-fit: cover; /* Video fills the container */
  }
  
  /* Loading spinner styles */
  .loader {
    position: absolute;
    width: 3em;
    height: 3em;
    border: 0.3em solid var(--color-panel-border);
    border-top: 0.3em solid var(--color-pale-green);
    border-radius: 50%;
    animation: spin 1.5s linear infinite;
    z-index: 2;
  }
  
  .loader.hidden {
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  /* Gallery dots enhanced styling */
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
  
  .gallery-dot:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.5);
  }
  
  .gallery-dot:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }
  
  .gallery-dot.active:hover {
    background-color: var(--color-pale-green);
  }

  .bg-wrapper {
    position: absolute;
    inset: 0;
    overflow: hidden;
    z-index: -1;
  }
  
  .bg-overlay {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    transition: opacity 1.5s ease;
    will-change: opacity; /* Performance optimization for smoother transitions */
  }
  
  .bg-overlay.next-bg {
    z-index: -2;
  }

  /* Tablet (medium devices) */
  @media (min-width: 481px) {
    .container {
      width: calc(100% - 2.5em);
    }
    
    .showcase {
      padding: 4em 1em 2em; /* Maintaining 4em top padding */
    }
    
    .title {
      font-size: 2.5em;
    }
    
    .subtitle {
      font-size: 1.3em;
    }
    
    .tagline {
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
      padding: 3em;
    }
    
    .title {
      font-size: 3.5em;
    }
    
    .subtitle {
      font-size: 1.4em;
      margin: 1.5em 0 3em;
    }
    
    .tagline {
      font-size: 1.2em;
      margin-bottom: 2em;
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
      grid-template-columns: repeat(3, 1fr);
      gap: 2em;
      grid-auto-rows: minmax(12em, auto);
      width: 100%; /* Full width within the max-width constraint */
    }
    
    .card {
      min-height: 12em;
    }
    
    .features {
      padding: 4em 0 6em; /* Increased bottom padding from 5em to 6em */
    }
    
    .media {
      padding: 4em 0 5em; /* Increased padding at bottom to 5em for desktop */
    }
    
    .gallery-dot {
      width: 0.8em;
      height: 0.8em;
    }

    /* Media section becomes a row on desktop */
    .media-container {
      flex-direction: row;
      align-items: flex-start;
      gap: 3em;
      padding: 0;
    }
    
    .media-intro {
      flex: 0 0 40%;
      max-width: 40%;
    }
    
    .gallery {
      flex: 0 0 60%;
      max-width: 60%;
    }
    
    .media-desc {
      font-size: 1.4em; /* Increased from 1.2em for desktop */
    }
  }
  
  /* Extra large devices */
  @media (min-width: 1200px) {
    .media-container {
      gap: 5em;
      padding: 0; /* Remove padding at large screens */
    }
    
    .media-intro {
      flex: 0 0 35%; /* Reduce intro width on very large screens */
      max-width: 35%;
    }
    
    .gallery {
      flex: 0 0 65%; /* Increase gallery width on very large screens */
      max-width: 65%;
    }
  }
</style>