<script>
  import { fade, scale } from 'svelte/transition';
  import { currentPlayer, game, formatTimeUntilNextTick, timeUntilNextTick } from '../../lib/stores/game';
  import { highlightedStore, targetStore } from '../../lib/stores/map';
  import { getFunctions, httpsCallable } from 'firebase/functions';
  import Close from '../icons/Close.svelte';
  
  // Props
  const { 
    onClose = () => {}, 
    onPathDrawingStart = () => {},
    onPathDrawingCancel = () => {},
    onConfirmPath = () => {},
    pathDrawingGroup = null,
    currentPath = []
  } = $props();

  // States
  let selectedGroupId = $state(null);
  let isSubmitting = $state(false);
  let error = $state(null);
  
  // Dialog reference
  let dialog;
  
  // Derived states
  const currentTile = $derived($highlightedStore || $targetStore);
  const eligibleGroups = $derived(getEligibleGroups());
  
  onMount(() => {
    dialog?.showModal();
    
    // Auto-select first group if there's only one
    if (eligibleGroups.length === 1) {
      selectedGroupId = eligibleGroups[0].id;
    }
  });

  function getEligibleGroups() {
    // Get groups owned by current player that are idle and not in battle
    if (!currentTile?.groups || !$currentPlayer) return [];
    
    return currentTile.groups.filter(group => 
      group.owner === $currentPlayer.uid && 
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
    if (!selectedGroupId) return;
    
    const group = eligibleGroups.find(g => g.id === selectedGroupId);
    if (!group) {
      error = "Selected group not found";
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
    
    onPathDrawingStart(groupWithStartPoint);
    onClose(false, true); // Close this modal, but indicate we're starting path drawing
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<dialog 
  bind:this={dialog} 
  class="move-dialog"
  transition:fade={{ duration: 200 }}
>
  <div class="modal-content" transition:scale={{ duration: 200, start: 0.95 }}>
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
                  <div class="group-units">{group.unitCount || 1} units</div>
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
        disabled={isSubmitting}
      >
        Cancel
      </button>
      
      <button 
        class="action-button" 
        onclick={startPathDrawing}
        disabled={!selectedGroupId || isSubmitting}
      >
        Draw Path
      </button>
    </footer>
  </div>
</dialog>

<style>
  /* Styles would go here - similar to Gather.svelte */
</style>
