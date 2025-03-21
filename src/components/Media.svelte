<script>
  import { onMount, onDestroy } from 'svelte';
  
  // Update to use $props() runes API
  const { extraClass = '' } = $props();
  
  // Media items array with state for potential future dynamic updates
  const mediaItems = $state([
    { type: 'video', src: '/media/1.mp4', alt: 'Gameplay Video' },
    { type: 'image', src: '/media/2.png', alt: 'Game Board Screenshot' }
  ]);
  
  // Media gallery state
  let currentMediaIndex = $state(0);
  let fadeOut = $state(false);
  let galleryInterval;
  let videoElement = $state(null);
  
  // Add states for graceful loading
  let mediaLoaded = $state(Array(mediaItems.length).fill(false));
  let mediaLoading = $state(false);
  let videoPlaying = $state(false);
  let minVideoPlayTime = $state(5000);
  let videoStartTime = $state(0);
  
  // Add mobile detection and fallback state
  let isMobileBrowser = $state(false);
  let videoPlaybackFailed = $state(false);
  let userInteracted = $state(false);
  
  // Derived state
  const currentMedia = $derived(mediaItems[currentMediaIndex]);
  const isCurrentVideo = $derived(currentMedia.type === 'video');
  const isCurrentImage = $derived(currentMedia.type === 'image');
  const canAdvance = $derived(!videoPlaying || Date.now() - videoStartTime >= minVideoPlayTime);
  const showPlayButton = $derived(isCurrentVideo && (isMobileBrowser || videoPlaybackFailed) && !videoPlaying);
  
  // Function to detect mobile browsers
  function detectMobileBrowser() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
  }
  
  // Function to preload gallery media
  function preloadGalleryMedia() {
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
    if (isCurrentImage) {
      mediaLoaded[currentMediaIndex] = true;
    }
  }
  
  // Function to handle video loadeddata events
  function handleVideoLoaded() {
    if (isCurrentVideo) {
      mediaLoaded[currentMediaIndex] = true;
    }
  }
  
  // Function to handle video play events
  function handleVideoPlay() {
    if (isCurrentVideo) {
      videoPlaying = true;
      videoPlaybackFailed = false;
      videoStartTime = Date.now();
      console.log("Video started playing");
    }
  }
  
  // Function to handle video play error
  function handleVideoPlayError(error) {
    console.error("Video playback error:", error);
    videoPlaybackFailed = true;
    videoPlaying = false;
    mediaLoaded[currentMediaIndex] = true;
  }
  
  // Function to manually play video when button is clicked
  function handlePlayButtonClick() {
    if (videoElement && isCurrentVideo) {
      userInteracted = true;
      
      // iOS requires user interaction
      const playPromise = videoElement.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            videoPlaybackFailed = false;
            console.log("Video playing after user interaction");
          })
          .catch(err => {
            handleVideoPlayError(err);
          });
      }
    }
  }
  
  // Function to advance to the next media item
  function nextMedia() {
    // If video is currently playing and hasn't played for minimum time, don't advance
    if (!canAdvance) {
      console.log("Video playing for less than minimum time, not advancing");
      return;
    }
    
    mediaLoading = true;
    fadeOut = true;
    videoPlaying = false;
    videoPlaybackFailed = false;
    
    setTimeout(() => {
      currentMediaIndex = (currentMediaIndex + 1) % mediaItems.length;
      
      // If we switched to a video, we need to prepare it
      if (isCurrentVideo && videoElement) {
        // Reset the video element
        videoElement.currentTime = 0;
        videoElement.load();
        
        // Don't start the fade-in transition until video can start playing
        videoElement.oncanplay = () => {
          console.log("Video can play now");
          fadeOut = false;
          
          // Only try to autoplay if not on mobile or user has interacted
          if (!isMobileBrowser || userInteracted) {
            // Start playing the video
            const playPromise = videoElement.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  console.log("Video playback started");
                })
                .catch(err => {
                  handleVideoPlayError(err);
                  setTimeout(() => {
                    mediaLoading = false;
                  }, 700);
                });
            }
          } else {
            // On mobile without interaction, just show the play button
            mediaLoaded[currentMediaIndex] = true;
            setTimeout(() => {
              mediaLoading = false;
            }, 700);
          }
        };
      } else {
        // For images, just fade in
        fadeOut = false;
        // Restart interval for images
        if (isCurrentImage) {
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
    if (isCurrentVideo && !mediaLoading) {
      videoPlaying = false;
      console.log("Video ended, advancing");
      nextMedia();
    }
  }
  
  // Function to manually select a media item
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
      videoPlaybackFailed = false;
      
      setTimeout(() => {
        currentMediaIndex = index;
        
        // If we switched to a video, prepare it
        if (isCurrentVideo && videoElement) {
          // Reset video
          videoElement.currentTime = 0;
          videoElement.load();
          
          videoElement.oncanplay = () => {
            fadeOut = false;
            
            // Only try to autoplay if not on mobile or user has interacted
            if (!isMobileBrowser || userInteracted) {
              // Start playing the video
              const playPromise = videoElement.play();
              if (playPromise !== undefined) {
                playPromise
                  .then(() => {
                    console.log("Video playing after manual selection");
                  })
                  .catch(err => {
                    handleVideoPlayError(err);
                    setTimeout(() => {
                      mediaLoading = false;
                    }, 700);
                  });
              }
            } else {
              // On mobile without interaction, just show the play button
              mediaLoaded[currentMediaIndex] = true;
              setTimeout(() => {
                mediaLoading = false;
              }, 700);
            }
          };
        } else {
          // For images, just fade in and restart interval
          fadeOut = false;
          if (isCurrentImage) {
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
    if (isCurrentImage) {
      // Clear any existing interval first
      if (galleryInterval) {
        clearInterval(galleryInterval);
      }
      // Change image every 5 seconds
      galleryInterval = setInterval(nextMedia, 5000);
    }
  }
  
  // Effect to manage the interval based on the current media type
  $effect(() => {
    // When the media changes, reset the interval appropriately
    if (isCurrentImage) {
      startImageInterval();
    } else if (galleryInterval) {
      clearInterval(galleryInterval);
      galleryInterval = null;
    }
  });
  
  onMount(() => {
    // Detect if we're on a mobile device
    isMobileBrowser = detectMobileBrowser();
    console.log("Mobile browser detected:", isMobileBrowser);
    
    // Preload gallery media
    preloadGalleryMedia();
    
    // Video should start playing automatically (first item is video)
    setTimeout(() => {
      if (mediaItems[0].type === 'video' && videoElement) {
        // Set up oncanplay handler for initial video
        videoElement.oncanplay = () => {
          // Only try auto-playing if not on mobile or if user has interacted
          if (!isMobileBrowser || userInteracted) {
            const playPromise = videoElement.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  console.log("Initial video playing");
                  videoPlaying = true;
                  videoStartTime = Date.now();
                })
                .catch(err => {
                  handleVideoPlayError(err);
                  startImageInterval();
                });
            }
          } else {
            // On mobile, mark as loaded but don't auto-play
            mediaLoaded[currentMediaIndex] = true;
          }
        };
        
        // Load the video
        videoElement.load();
      }
    }, 100);
    
    // Add document-level click handler to detect user interaction
    document.addEventListener('click', () => {
      userInteracted = true;
    }, {once: true});
  });
  
  onDestroy(() => {
    if (galleryInterval) {
      clearInterval(galleryInterval);
    }
  });
</script>

<section class="media {extraClass}">
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
          {#if isCurrentVideo}
            <div class="media-wrapper video-wrapper">
              <div class="loader" class:hidden={mediaLoaded[currentMediaIndex]}></div>
              <video 
                bind:this={videoElement}
                class="media-content video"
                src={currentMedia.src}
                muted
                playsinline
                preload="auto"
                autoplay={!isMobileBrowser}
                onloadeddata={handleVideoLoaded}
                onplay={handleVideoPlay}
                onended={handleVideoEnd}
                class:visible={mediaLoaded[currentMediaIndex]}
              ></video>
              
              <!-- Play button overlay for mobile devices -->
              {#if showPlayButton}
                <button 
                  class="play-button"
                  aria-label="Play video"
                  onclick={handlePlayButtonClick}
                >
                  <span class="play-icon">▶</span>
                </button>
              {/if}
            </div>
          {:else}
            <div class="media-wrapper image-wrapper">
              <div class="loader" class:hidden={mediaLoaded[currentMediaIndex]}></div>
              <img 
                src={currentMedia.src} 
                alt={currentMedia.alt} 
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

<style>
  .media {
    padding: 4em 0 4em;
    margin-bottom: 3em;
    border-bottom: 1px solid var(--color-panel-border);
  }

  .heading {
    text-align: center;
    margin-bottom: 1.5em;
    color: var(--color-pale-green);
    text-shadow: 0 0 0.3125em rgba(12, 8, 33, 0.7);
    font-family: var(--font-heading);
    font-weight: 400;
    font-size: 1.8em;
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
    font-size: 1.3em;
    line-height: 1.6;
    margin: 0;
    font-family: var(--font-body);
    text-align: left;
    font-weight: 300;
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
    transition: opacity 1.5s ease;
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
    transition: opacity 0.7s ease;
  }
  
  .media-content.visible {
    opacity: 1;
  }
  
  .media-content.video {
    width: 100%;
    height: 100%;
    object-fit: cover;
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

  /* Play button styles for mobile devices */
  .play-button {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 5em;
    height: 5em;
    border-radius: 50%;
    background-color: rgba(0, 0, 0, 0.6);
    border: 2px solid var(--color-pale-green);
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    z-index: 10;
    transition: all 0.3s ease;
    padding: 0;
  }
  
  .play-button:hover {
    background-color: rgba(0, 0, 0, 0.8);
    transform: translate(-50%, -50%) scale(1.1);
  }
  
  .play-icon {
    color: var(--color-pale-green);
    font-size: 2em;
    margin-left: 0.2em; /* Adjust for visual centering of triangle */
  }

  /* Responsive styles */
  @media (min-width: 481px) {
    .heading {
      font-size: 2.2em;
    }
    
    .gallery-dot {
      width: 0.7em;
      height: 0.7em;
    }
    
    .play-button {
      width: 6em;
      height: 6em;
    }
    
    .play-icon {
      font-size: 2.2em;
    }
  }

  @media (min-width: 769px) {
    .heading {
      font-size: 2.6em;
    }
    
    .media {
      padding: 4em 0 5em;
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
      font-size: 1.4em;
    }
  }
  
  /* Extra large devices */
  @media (min-width: 1200px) {
    .media-container {
      gap: 5em;
      padding: 0;
    }
    
    .media-intro {
      flex: 0 0 35%;
      max-width: 35%;
    }
    
    .gallery {
      flex: 0 0 65%;
      max-width: 65%;
    }
  }
</style>
