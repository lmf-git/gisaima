<script>
  import { fade, fly } from 'svelte/transition';
  import { currentPlayer, game, savePlayerAchievement } from '../../lib/stores/game.js';
  import Close from '../icons/Close.svelte';
  import Trophy from '../icons/Trophy.svelte';
  import { onMount, onDestroy } from 'svelte';

  // Add onMouseEnter to props
  const { 
    onClose = () => {}, 
    closing = false,
    onMouseEnter = () => {}
  } = $props();

  // State variables using $state rune
  let visible = $state(true);
  let selectedCategory = $state('all');
  let recentUnlock = $state(null);
  
  // Animation constants
  const animationDuration = 300;

  // Achievement definitions directly in component - updated category names
  const achievementDefinitions = $state({
    // Exploration Achievements - removed first_steps
    'explorer': {
      title: 'Explorer',
      description: 'Visit 10 different tiles',
      category: 'explore',
    },
    'world_traveler': {
      title: 'World Traveler',
      description: 'Visit 50 different tiles',
      category: 'explore',
      hidden: true,
    },
    'structure_finder': {
      title: 'Structure Finder',
      description: 'Discover your first structure',
      category: 'explore',
    },
    'inspector': {
      title: 'Inspector',
      description: 'Inspect your first structure',
      category: 'explore',
    },
    
    // Combat Achievements
    'first_attack': {
      title: 'First Blood',
      description: 'Start your first attack',
      category: 'combat',
    },
    'first_battle': {
      title: 'Battle Hardened',
      description: 'Win your first battle',
      category: 'combat',
    },
    'battle_joiner': {
      title: 'Opportunist',
      description: 'Join an in-progress battle',
      category: 'combat',
    },
    'survivor': {
      title: 'Survivor',
      description: 'Survive 5 battles',
      category: 'combat',
      hidden: true,
    },
    
    // Resource Achievements - renamed to "items"
    'first_gather': {
      title: 'Gatherer',
      description: 'Gather resources for the first time',
      category: 'items',
    },
    'resource_master': {
      title: 'Resource Master',
      description: 'Gather resources 10 times',
      category: 'items',
    },
    'treasure_finder': {
      title: 'Treasure Finder',
      description: 'Find a rare resource',
      category: 'items',
      hidden: true,
    },
    
    // Group Management Achievements
    'mobilised': {
      title: 'Leader',
      description: 'Mobilize your first group',
      category: 'social',
    },
    'strategist': {
      title: 'Strategist',
      description: 'Move a group to another location',
      category: 'social',
    },
    'demobilizer': {
      title: 'Demobilizer',
      description: 'Demobilize a group at a structure',
      category: 'social',
    },
    'army_builder': {
      title: 'Army Builder',
      description: 'Create 5 groups simultaneously',
      category: 'social',
      hidden: true,
    },
    // New Chat Achievement
    'first_message': {
      title: 'Communicator',
      description: 'Send your first chat message',
      category: 'social',
    },
  });

  // Get player achievements for current world
  const playerAchievements = $derived($currentPlayer?.achievements || {});

  // Categories for filtering - updated labels
  const categories = [
    { id: 'all', label: 'All' },
    { id: 'explore', label: 'Explore' },
    { id: 'combat', label: 'Combat' },
    { id: 'items', label: 'Items' },
    { id: 'social', label: 'Social' }
  ];

  // Process achievements with player data - updated to show all non-hidden achievements
  const processedAchievements = $derived(
    Object.entries(achievementDefinitions).map(([id, achievement]) => {
      const isUnlocked = playerAchievements[id] === true;
      const isFiltered = selectedCategory === 'all' || achievement.category === selectedCategory;
      // Show all achievements that are either unlocked or not hidden
      const shouldShow = isUnlocked || !achievement.hidden;
      
      return {
        ...achievement,
        id,
        unlocked: isUnlocked,
        visible: isFiltered && shouldShow,
        date: playerAchievements[id + '_date'] || null
      };
    })
  );

  // Filtered achievements for display
  const filteredAchievements = $derived(
    processedAchievements.filter(a => a.visible)
  );

  // Count unlocked achievements
  const unlockedCount = $derived(
    Object.keys(playerAchievements).filter(key => !key.endsWith('_date')).length
  );

  // Calculate total count of non-hidden achievements
  const totalCount = $derived(
    Object.values(achievementDefinitions).filter(a => !a.hidden).length
  );

  // Use $effect for side effects based on closing prop
  $effect(() => {
    if (closing) {
      visible = false;
      onVisibilityChange(false);
    } else {
      visible = true;
      onVisibilityChange(true);
    }
  });

  // Handle achievement unlock notification
  function showUnlockNotification(achievementId) {
    const achievement = achievementDefinitions[achievementId];
    if (!achievement) return;
    
    recentUnlock = {
      id: achievementId,
      ...achievement
    };
    
    // Clear notification after a delay
    setTimeout(() => {
      recentUnlock = null;
    }, 5000);
  }

  // Export function for other components to trigger achievement unlocks
  export function unlockAchievement(id) {
    if (!$currentPlayer || !$game.worldKey || playerAchievements[id] === true) {
      return false;
    }
    
    savePlayerAchievement($game.worldKey, id, true)
      .then(() => {
        showUnlockNotification(id);
        return true;
      })
      .catch(error => {
        console.error('Failed to save achievement:', error);
        return false;
      });
  }

  function selectCategory(categoryId) {
    selectedCategory = categoryId;
  }

  // Simplify close function - add localStorage tracking
  function close() {
    // Save the closed state in localStorage
    localStorage.setItem('achievements_closed', 'true');
    onClose();
  }

  // Add missing onVisibilityChange function
  function onVisibilityChange(isVisible) {
    if (isVisible) {
      // If panel is becoming visible, clear the closed state
      localStorage.removeItem('achievements_closed');
    }
  }

  // Function to format date in a user-friendly way
  function formatDate(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  }

  // Handle mouse enter event
  function handleMouseEnter() {
    onMouseEnter();
  }

  // Initialize localStorage state on mount
  onMount(() => {
    // Check if this is the first time we're showing achievements
    const achievementsClosed = localStorage.getItem('achievements_closed') === 'true';
    if (!achievementsClosed) {
      // If never closed before, remove any stored closed state
      localStorage.removeItem('achievements_closed');
    }
  });

  // Handle escape key for Achievements component
  function handleKeyDown(event) {
    if (event.key === 'Escape' && visible && !closing) {
      event.preventDefault();
      close();
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });
</script>

<div 
  class="achievements-container"
  class:closing
  onmouseenter={handleMouseEnter}
  in:fade={{ duration: animationDuration }}
  out:fade={{ duration: animationDuration }}
  role="dialog"
  aria-labelledby="achievements-heading"
>
  <div class="achievements-panel" class:closing>
    <header class="achievements-header">
      <h2 id="achievements-heading">
        <Trophy extraClass="trophy-icon" />
        Achievements
        <span class="achievement-count">
          {unlockedCount} / {totalCount}
        </span>
      </h2>
      <button class="close-btn" onclick={close} aria-label="Close achievements">
        <Close size="1.5em" />
      </button>
    </header>
    
    <div class="categories">
      {#each categories as category}
        <button 
          class="category-btn"
          class:active={selectedCategory === category.id}
          onclick={() => selectCategory(category.id)}
        >
          {category.label}
        </button>
      {/each}
    </div>
    
    <div class="achievements-content">
      {#if filteredAchievements.length === 0}
        <div class="empty-state">
          No achievements to display in this category.
        </div>
      {:else}
        <div class="achievements-list">
          {#each filteredAchievements as achievement}
            <div
              class="achievement-item"
              class:unlocked={achievement.unlocked}
              class:locked={!achievement.unlocked}
            >
              <div class="achievement-icon">
                {#if achievement.unlocked}
                  <Trophy extraClass="achievement-trophy" />
                {:else}
                  <div class="lock-icon">?</div>
                {/if}
              </div>
              <div class="achievement-details">
                <h3 class="achievement-name">
                  {achievement.unlocked || !achievement.hiddenTitle ? achievement.title : 'Hidden Achievement'}
                </h3>
                <p class="achievement-description">
                  {achievement.unlocked || !achievement.hiddenDesc ? achievement.description : 'Complete this hidden achievement to reveal its details.'}
                </p>
                {#if achievement.unlocked && achievement.date}
                  <div class="achievement-date">
                    Unlocked: {formatDate(achievement.date)}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

{#if recentUnlock}
  <div class="achievement-notification" in:fly={{ y: 50, duration: 500 }} out:fade>
    <Trophy extraClass="notification-trophy" />
    <div class="notification-content">
      <h3>Achievement Unlocked!</h3>
      <p>{recentUnlock.title}</p>
    </div>
  </div>
{/if}

<style>
  .achievements-container {
    position: fixed;
    bottom: -8em; /* Changed from top: 50% to bottom: -8em */
    right: 1em;
    width: 25em; /* Increased from 22em to 25em for wider container */
    height: 30em;
    z-index: 1010;
    display: flex;
    flex-direction: column;
  }
  
  .achievements-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background-color: rgba(255, 255, 255, 0.95);
    border-left: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.5rem;
    box-shadow: -2px 0 10px rgba(0, 0, 0, 0.2);
  }
  
  .achievements-panel.closing {
    transform: translateX(100%);
    opacity: 0; /* Fade out panel */
    box-shadow: none; /* Remove shadow during exit */
  }
  
  .achievements-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1em;
    background-color: rgba(0, 0, 0, 0.05);
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  h2 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5em;
    font-family: var(--font-heading);
    font-size: 1.4em;
    font-weight: 600;
    color: #333;
  }
  
  .achievement-count {
    font-size: 0.7em;
    background-color: rgba(66, 133, 244, 0.15);
    color: #4285f4;
    padding: 0.2em 0.6em;
    border-radius: 1em;
    margin-left: 0.5em;
  }
  
  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.3em;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: #666;
    transition: background-color 0.2s;
  }
  
  .close-btn:hover {
    background-color: rgba(0, 0, 0, 0.1);
    color: #333;
  }
  
  .categories {
    display: flex;
    gap: 0.5em;
    padding: 0.8em;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    flex-wrap: wrap;
  }
  
  .category-btn {
    padding: 0.5em 1em;
    background-color: #f1f3f4;
    border: none;
    border-radius: 1.5em;
    font-size: 0.9em;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .category-btn.active {
    background-color: #4285f4;
    color: white;
  }
  
  .category-btn:hover:not(.active) {
    background-color: #e8eaed;
  }
  
  .achievements-content {
    flex: 1;
    overflow-y: auto;
    padding: 1em;
  }
  
  .achievements-list {
    display: flex;
    flex-direction: column;
    gap: 1em;
  }
  
  .achievement-item {
    display: flex;
    align-items: flex-start;
    padding: 1em;
    border-radius: 0.5em;
    background-color: #f5f5f5;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  
  .achievement-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }
  
  .achievement-item.unlocked {
    background-color: rgba(66, 133, 244, 0.1);
    border-left: 3px solid #4285f4;
  }
  
  .achievement-item.locked {
    opacity: 0.85; /* Slightly increased opacity for better contrast */
    filter: grayscale(40%); /* Reduced grayscale for better readability */
  }
  
  .achievement-icon {
    width: 2.5em;
    height: 2.5em;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 1em;
    flex-shrink: 0;
  }
  
  .lock-icon {
    width: 2em;
    height: 2em;
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(0, 0, 0, 0.5);
    font-weight: bold;
  }
  
  .achievement-details {
    flex: 1;
  }
  
  .achievement-name {
    margin: 0 0 0.3em 0;
    font-family: var(--font-heading);
    font-size: 1.1em;
    font-weight: 600;
    color: #222; /* Darker text color for better contrast */
  }
  
  .achievement-description {
    margin: 0;
    font-size: 0.9em;
    color: #333; /* Darker text color for better contrast */
    line-height: 1.4;
  }
  
  .achievement-date {
    margin-top: 0.5em;
    font-size: 0.8em;
    color: #777;
  }
  
  .empty-state {
    padding: 2em 0;
    text-align: center;
    color: #777;
    font-style: italic;
  }
  
  .achievement-notification {
    position: fixed;
    bottom: 2em;
    right: 2em;
    background-color: rgba(255, 255, 255, 0.95);
    border-left: 4px solid #4285f4;
    border-radius: 0.5em;
    padding: 1em;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    gap: 1em;
    z-index: 1050;
    max-width: 24em;
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
  
  .notification-content p {
    margin: 0.3em 0 0 0;
    font-size: 1em;
  }
  
  :global(.trophy-icon) {
    width: 1.5em;
    height: 1.5em;
    fill: #ffa000;
  }
  
  :global(.achievement-trophy) {
    width: 2em;
    height: 2em;
    fill: #ffa000;
  }
  
  :global(.notification-trophy) {
    width: 2.5em;
    height: 2.5em;
    fill: #ffa000;
    filter: drop-shadow(0 0 4px rgba(255, 160, 0, 0.5));
  }
  
  @media (max-width: 768px) {
    .achievements-container {
      right: 0;
      width: 25em; /* Keep consistent with the larger width */
    }
  }
</style>
