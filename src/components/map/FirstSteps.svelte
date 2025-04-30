<script>
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { currentPlayer, game, savePlayerAchievement } from '../../lib/stores/game.js';
  import Close from '../icons/Close.svelte';
  import Trophy from '../icons/Trophy.svelte';
  import Compass from '../icons/Compass.svelte';
  import Map from '../icons/Map.svelte';

  // Props with default values
  const { 
    onClose = () => {}, 
    onAchievementsDismissed = () => {}
  } = $props();

  // Local state
  let visible = $state(true);
  let dismissed = $state(false);
  let localStorageKey = 'firstSteps-dismissed';

  // Check for any player achievements
  const hasAchievements = $derived(
    $currentPlayer?.achievements && 
    Object.keys($currentPlayer.achievements).filter(key => !key.includes('_date')).length > 0
  );

  // Check if this component should be shown
  const shouldShow = $derived(!hasAchievements && !dismissed && $game?.player?.alive);

  // On mount, check if we've previously dismissed this
  onMount(() => {
    try {
      if (localStorage.getItem(localStorageKey) === 'true') {
        dismissed = true;
      }
    } catch (e) {
      console.error('Error accessing localStorage:', e);
    }
  });

  // Handle dismissal of the first steps guidance
  function handleDismiss() {
    visible = false;

    // After transition completes, set dismissed state
    setTimeout(() => {
      dismissed = true;
      
      // Store in localStorage so it doesn't reappear on refresh
      try {
        localStorage.setItem(localStorageKey, 'true');
      } catch (e) {
        console.error('Error saving to localStorage:', e);
      }
      
      // Notify parent component
      onClose();
    }, 300);
  }

  // Function to open achievements panel
  function showAchievements() {
    onAchievementsDismissed();
    handleDismiss();
  }

  // Record first_steps achievement when the component is shown
  $effect(() => {
    if (shouldShow && $game?.worldKey && !hasAchievements) {
      // Small delay to ensure player has loaded properly
      setTimeout(() => {
        savePlayerAchievement($game.worldKey, 'first_steps', true)
          .then(() => console.log('First steps achievement recorded'))
          .catch(err => console.error('Error saving first steps achievement:', err));
      }, 1500);
    }
  });
</script>

{#if shouldShow && visible}
  <div 
    class="first-steps-container"
    transition:fly={{ y: 30, duration: 500 }}
    role="complementary"
    aria-label="Getting started guide"
  >
    <div class="first-steps-content">
      <header>
        <h2>First Steps:</h2>
        <button class="close-btn" onclick={handleDismiss} aria-label="Close guide">
          <Close />
        </button>
      </header>
      
      <div class="steps-content">
        <p class="intro">
          You've just entered a world of exploration and strategy. Here are a few things to get you started:
        </p>
        
        <div class="steps">
          <div class="step">
            <div class="step-number">1</div>
            <div class="step-details">
              <h3><Compass extraClass="step-icon" /> Explore the Map</h3>
              <p>Click and drag to move around the world. Each tile has different resources and opportunities.</p>
            </div>
          </div>
          
          <div class="step">
            <div class="step-number">2</div>
            <div class="step-details">
              <h3><Map extraClass="step-icon" /> Click on Tiles</h3>
              <p>Click on tiles to interact with them. You can gather resources, build structures, and more.</p>
            </div>
          </div>
          
          <div class="step">
            <div class="step-number">3</div>
            <div class="step-details">
              <h3><Trophy extraClass="step-icon" /> Unlock Achievements</h3>
              <p>Complete actions in the world to earn achievements and track your progress.</p>
            </div>
          </div>
        </div>
        
        <div class="actions">
          <button class="primary-btn" onclick={showAchievements}>
            View Achievements
          </button>
          <button class="secondary-btn" onclick={handleDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .first-steps-container {
    position: fixed;
    bottom: 6em;
    left: 50%;
    transform: translateX(-50%);
    width: 90%;
    max-width: 500px;
    z-index: 950;
    pointer-events: all;
  }
  
  .first-steps-content {
    background-color: rgba(255, 255, 255, 0.97);
    border-radius: 0.75rem;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
    overflow: hidden;
    border: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  header {
    background-color: #4285f4;
    color: white;
    padding: 0.8rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  
  h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 1.3rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  :global(.header-icon) {
    width: 1.4rem;
    height: 1.4rem;
    fill: white;
  }
  
  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.3rem;
    border-radius: 50%;
  }
  
  .close-btn:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }
  
  .steps-content {
    padding: 1rem;
  }
  
  .intro {
    margin-top: 0;
    font-size: 1rem;
    color: #333;
  }
  
  .steps {
    margin: 1.5rem 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .step {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
  }
  
  .step-number {
    width: 1.8rem;
    height: 1.8rem;
    background-color: #4285f4;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    flex-shrink: 0;
  }
  
  .step-details {
    flex-grow: 1;
  }
  
  .step-details h3 {
    margin: 0 0 0.3rem 0;
    font-size: 1.1rem;
    color: #222;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  
  :global(.step-icon) {
    width: 1.2rem;
    height: 1.2rem;
    fill: #4285f4;
  }
  
  .step-details p {
    margin: 0;
    font-size: 0.9rem;
    color: #444;
  }
  
  .actions {
    display: flex;
    gap: 0.8rem;
    justify-content: flex-end;
    margin-top: 1.5rem;
  }
  
  .primary-btn, .secondary-btn {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-family: var(--font-body);
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: background-color 0.2s;
  }
  
  .primary-btn {
    background-color: #4285f4;
    color: white;
  }
  
  .primary-btn:hover {
    background-color: #3367d6;
  }
  
  .secondary-btn {
    background-color: #f1f3f4;
    color: #333;
  }
  
  .secondary-btn:hover {
    background-color: #e8eaed;
  }
  
  @media (max-width: 600px) {
    .first-steps-container {
      width: 95%;
      bottom: 4.5em;
    }
    
    h2 {
      font-size: 1.1rem;
    }
    
    .steps {
      margin: 1rem 0;
    }
    
    .actions {
      margin-top: 1rem;
    }
  }
</style>
