<script>
  import { onMount } from 'svelte';
  import { currentPlayer, game, hasAchievement, savePlayerAchievement } from '../../lib/stores/game';
  import { targetStore } from '../../lib/stores/map';
  import Close from '../icons/Close.svelte';
  import Compass from '../icons/Compass.svelte';
  
  // Props using $props() rune
  const { 
    onClose = () => {}, 
    onStartPathDrawing = () => {},  // Fix the prop name to match how it's used
    groupData = null,  // Add groupData prop if it's passed in
    x, 
    y, 
    tile 
  } = $props();

  // States
  let selectedGroupId = $state(null);
  let processing = $state(false); // Add processing state
  let isSubmitting = $state(false);
  let error = $state(null);
  
  // Derived states
  const currentTile = $derived($targetStore);
  const eligibleGroups = $derived(getEligibleGroups());
  
  onMount(() => {
    // If there's only one eligible group, auto-select it and start path drawing
    if (eligibleGroups.length === 1) {
      // Auto-select the group
      selectedGroupId = eligibleGroups[0].id;
      
      // Use a small timeout to ensure component initialization is complete
      setTimeout(() => {
        // Auto-start path drawing if we still only have one eligible group
        if (eligibleGroups.length === 1 && !processing) {
          console.log('Only one eligible group, auto-starting path drawing');
          startPathDrawing();
        }
      }, 100);
    }
  });

  function getEligibleGroups() {
    // Get groups owned by current player that are idle and not in battle
    if (!currentTile?.groups || !$currentPlayer) return [];
    
    return currentTile.groups.filter(group => 
      group.owner === $currentPlayer.id && 
      group.status === 'idle' &&
      !group.inBattle
    );
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      onClose();
    }
  }

  function startPathDrawing() {
    if (!selectedGroupId || processing) return;
    
    processing = true; // Set processing state
    
    try {
      const group = eligibleGroups.find(g => g.id === selectedGroupId);
      if (!group) {
        error = "Selected group not found";
        processing = false;
        return;
      }
      
      // Add the current position as startPoint to the group object
      const groupWithStartPoint = {
        ...group,
        startPoint: {
          x: currentTile.x,
          y: currentTile.y
        }
      };
      
      // Check and unlock the first_steps achievement
      unlockFirstStepsAchievement();
      
      // Call onDrawPath with the group data to start path drawing mode
      onStartPathDrawing(groupWithStartPoint);
      
      // Close this modal, passing true as second parameter to indicate we're starting path drawing
      onClose();
    } catch (e) {
      error = e.message || "An error occurred";
      processing = false;
    }
  }

  // New function to unlock first_steps achievement
  async function unlockFirstStepsAchievement() {
    const worldId = $game.worldKey;
    if (!worldId || !$currentPlayer) return;

    // Check if the user already has the achievement
    const hasFirstStepsAchievement = hasAchievement(worldId, 'first_steps');
    
    // If not, unlock it
    if (!hasFirstStepsAchievement) {
      console.log('Unlocking first_steps achievement for path drawing');
      try {
        await savePlayerAchievement(worldId, 'first_steps', true);
      } catch (error) {
        console.error('Error saving first_steps achievement:', error);
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="move-modal" transition:scale={{ start: 0.95, duration: 200 }}>
  <header class="modal-header">
    <h3>Move Group</h3>
    <button class="close-button" onclick={onClose}>
      <Close size="1.6em" extraClass="close-icon-dark" />
    </button>
  </header>

  <div class="modal-body">
    {#if eligibleGroups.length === 0}
      <div class="message error">
        You don't have any idle groups on this tile that can move.
      </div>
    {:else}
      <div class="section">
        <h4>Select Group to Move</h4>
        <div class="groups-list">
          {#each eligibleGroups as group}
            <label class="group-option {selectedGroupId === group.id ? 'selected' : ''}">
              <input 
                type="radio" 
                name="groupSelect" 
                value={group.id} 
                bind:group={selectedGroupId} 
              />
              <div class="group-details">
                <div class="group-name">{group.name || `Group ${group.id.substring(0, 5)}`}</div>
                <div class="group-units">{group.units?.length || 1} units</div>
              </div>
            </label>
          {/each}
        </div>
      </div>

      {#if error}
        <div class="message error">{error}</div>
      {/if}

      <div class="info-box">
        <p>Select a group to move and draw a path on the map.</p>
      </div>
    {/if}
  </div>

  <footer class="modal-footer">
    <button 
      class="cancel-button" 
      onclick={onClose}
      disabled={processing}
    >
      Cancel
    </button>
    
    <button 
      class="action-button" 
      onclick={startPathDrawing}
      disabled={!selectedGroupId || processing || isSubmitting}
    >
      <Compass extraClass="compass-icon" />
      {processing ? 'PROCESSING...' : 'PLOT YOUR JOURNEY'}
    </button>
  </footer>
</div>

<style>
  .move-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 30em;
    max-height: 85vh;
    background: white;
    border-radius: 0.5em;
    box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 1000;
    font-family: var(--font-body);
  }

  .modal-header {
    padding: 0.8em 1em;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
    font-family: var(--font-heading);
  }

  h3 {
    margin: 0;
    font-size: 1.2em;
    font-weight: 600;
    color: #333;
  }

  .close-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.4em;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background-color 0.2s;
    color: rgba(0, 0, 0, 0.6);
  }

  .close-button:hover {
    background-color: rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.9);
  }

  .modal-body {
    padding: 1em;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1em;
  }

  .section {
    margin-bottom: 1em;
  }

  h4 {
    margin: 0 0 0.5em 0;
    font-size: 1em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.8);  /* Improved contrast from rgba(0, 0, 0, 0.7) */
  }

  .groups-list {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
  }

  .group-option {
    display: flex;
    align-items: center;
    padding: 0.5em;
    border-radius: 0.3em;
    cursor: pointer;
    background-color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;
  }

  .group-option:hover {
    background-color: rgba(255, 255, 255, 0.7);
  }

  .group-option.selected {
    background-color: rgba(66, 133, 244, 0.1);
    border-color: rgba(66, 133, 244, 0.3);
  }

  .group-option input {
    margin-right: 0.5em;
  }

  .group-details {
    display: flex;
    flex-direction: column;
    gap: 0.2em;
  }

  .group-name {
    font-weight: 500;
    color: rgba(0, 0, 0, 0.85);  /* Improved contrast */
  }

  .group-units {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.75);  /* Improved contrast from rgba(0, 0, 0, 0.7) */
  }

  .info-box {
    padding: 0.6em;
    background-color: rgba(0, 0, 0, 0.05);
    border-radius: 0.3em;
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.8);  /* Improved contrast from rgba(0, 0, 0, 0.7) */
    text-align: center;
  }

  .message {
    padding: 0.7em;
    border-radius: 0.3em;
    font-size: 0.9em;
    text-align: center;
    color: rgba(0, 0, 0, 0.85);  /* Added explicit color with good contrast */
  }

  .message.error {
    background-color: rgba(244, 67, 54, 0.1);
    border: 1px solid rgba(244, 67, 54, 0.3);
    color: #d32f2f;
  }

  .modal-footer {
    display: flex;
    justify-content: space-between;
    gap: 1em;
    padding: 0.8em 1em;
    background-color: #f5f5f5;
    border-top: 1px solid #e0e0e0;
  }

  .cancel-button, .action-button {
    padding: 0.5em 1em;
    border-radius: 0.3em;
    font-size: 1em;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .cancel-button {
    background-color: #f1f3f4;
    color: #3c4043;
    border: 1px solid #dadce0;
  }

  .cancel-button:hover:not(:disabled) {
    background-color: #e8eaed;
  }

  .action-button {
    background-color: #4285f4;
    color: white;
    border: none;
    flex-grow: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5em;
  }

  .action-button:hover:not(:disabled) {
    background-color: #3367d6;
    transform: translateY(-1px);
  }

  .action-button:disabled, .cancel-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
  }

  :global(.compass-icon) {
    width: 1.2em;
    fill: currentColor;
  }

  @media (max-width: 768px) {
    .move-modal {
      width: 95%;
      max-width: none;
    }
  }
</style>
