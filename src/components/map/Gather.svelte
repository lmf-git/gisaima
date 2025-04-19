<script>
  import { onMount } from 'svelte';
  import { functions } from "../../lib/firebase/firebase";
  import { httpsCallable } from "firebase/functions";
  import { currentPlayer } from '../../lib/stores/game.js';
  import Close from '../icons/Close.svelte';
  
  // Props with defaults using Svelte 5 $props() rune
  const { 
    tile = null, 
    onClose = () => {},
    onGather = () => {}
  } = $props();
  
  // Component state
  let loading = $state(false);
  let error = $state(null);
  let success = $state(false);
  let selectedGroup = $state(null);
  let availableGroups = $state([]);
  
  // Extract idle groups from the tile
  $effect(() => {
    if (!tile || !tile.groups || !$currentPlayer) return;
    
    // Filter for idle groups owned by the player
    const groups = Array.isArray(tile.groups) ? 
      tile.groups.filter(g => g.status === 'idle' && g.owner === $currentPlayer.uid) :
      Object.values(tile.groups).filter(g => g.status === 'idle' && g.owner === $currentPlayer.uid);
    
    availableGroups = groups;
    
    // Auto-select the first group if there's only one
    if (groups.length === 1) {
      selectedGroup = groups[0];
    }
  });
  
  // Handle gather start
  async function startGathering() {
    if (!selectedGroup) {
      error = "Please select a group to gather with";
      return;
    }
    
    loading = true;
    error = null;
    
    try {
      const startGatheringFn = httpsCallable(functions, 'startGathering');
      
      const result = await startGatheringFn({
        groupId: selectedGroup.id,
        locationX: tile.x,
        locationY: tile.y,
        worldId: $currentPlayer.world
      });
      
      console.log('Gathering started:', result.data);
      success = true;
      
      // Notify parent component
      onGather(result.data);
      
      // Close after a delay to show success message
      setTimeout(() => {
        onClose();
      }, 1500);
      
    } catch (err) {
      console.error('Error starting gathering:', err);
      error = err.message || 'Failed to start gathering';
    } finally {
      loading = false;
    }
  }
  
  function selectGroup(group) {
    selectedGroup = group;
    error = null;
  }
</script>

<dialog open>
  <div class="modal gather-modal">
    <div class="modal-header">
      <h3>Gather Resources</h3>
      <button class="close-button" onclick={onClose} aria-label="Close">
        <Close size="1.2em" />
      </button>
    </div>
    
    <div class="modal-content">
      {#if success}
        <div class="success-message">
          <div class="success-icon">✓</div>
          <p>Gathering has started!</p>
          <p class="info">Your group will gather resources until the next game tick.</p>
        </div>
      {:else}
        <p class="location">Location: {tile?.x}, {tile?.y}</p>
        
        {#if availableGroups.length === 0}
          <div class="error-message">
            <p>No idle groups available to gather resources</p>
          </div>
        {:else}
          <div class="group-selection">
            <h4>Select Group to Gather With</h4>
            
            <div class="groups-list">
              {#each availableGroups as group}
                <div 
                  class="group-option" 
                  class:selected={selectedGroup?.id === group.id}
                  onclick={() => selectGroup(group)}
                >
                  <div class="group-info">
                    <div class="group-name">{group.name || `Group ${group.id.substring(0,4)}`}</div>
                    <div class="group-units">{group.unitCount || (group.units ? Object.keys(group.units).length : 0)} units</div>
                  </div>
                </div>
              {/each}
            </div>
            
            {#if error}
              <div class="error-message">
                <p>{error}</p>
              </div>
            {/if}
            
            <div class="gather-info">
              <p>Groups will gather various materials based on the local environment.</p>
              <p>Gathering takes approximately one minute but can vary based on world speed.</p>
            </div>
            
            <div class="action-buttons">
              <button class="cancel-button" onclick={onClose} disabled={loading}>Cancel</button>
              <button 
                class="gather-button" 
                onclick={startGathering}
                disabled={loading || !selectedGroup}
              >
                {#if loading}
                  <div class="spinner"></div> Starting...
                {:else}
                  Begin Gathering
                {/if}
              </button>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</dialog>

<style>
  dialog {
    border: none;
    padding: 0;
    background: transparent;
    max-width: 30em;
    width: 90%;
    margin: auto;
    box-shadow: 0 0 10em rgba(0, 0, 0, 0.5);
  }
  
  .modal {
    background-color: var(--color-navy);
    color: var(--color-text);
    border-radius: 0.5em;
    box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.3);
    overflow: hidden;
    animation: modal-appear 0.3s ease-out forwards;
    border: 0.15em solid var(--color-dark-navy);
    font-family: var(--font-body);
  }
  
  .modal-header {
    padding: 1em;
    background-color: var(--color-dark-navy);
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 0.1em solid var(--color-navy-highlight);
  }
  
  h3 {
    margin: 0;
    color: var(--color-bright-accent);
    font-family: var(--font-heading);
    font-size: 1.4em;
    text-shadow: 0 0 0.3em rgba(100, 255, 218, 0.2);
  }
  
  h4 {
    margin: 0.5em 0 1em;
    color: var(--color-text);
    font-family: var(--font-heading);
  }
  
  .modal-content {
    padding: 1.5em;
  }
  
  .location {
    margin: 0 0 1.5em;
    font-size: 0.9em;
    font-family: var(--font-mono, monospace);
    color: var(--color-muted);
  }
  
  .close-button {
    background: transparent;
    border: none;
    color: var(--color-text);
    cursor: pointer;
    padding: 0.3em;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  
  .close-button:hover {
    background-color: rgba(255, 255, 255, 0.1);
    color: var(--color-bright-accent);
  }
  
  .group-selection {
    margin-bottom: 1em;
  }
  
  .groups-list {
    display: flex;
    flex-direction: column;
    gap: 0.8em;
    margin-bottom: 1.5em;
    max-height: 12em;
    overflow-y: auto;
  }
  
  .group-option {
    padding: 0.8em;
    border-radius: 0.3em;
    background-color: var(--color-dark-navy);
    border: 0.1em solid var(--color-navy-highlight);
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .group-option:hover {
    background-color: var(--color-navy-highlight);
  }
  
  .group-option.selected {
    background-color: var(--color-navy-highlight);
    border-color: var(--color-bright-accent);
    box-shadow: 0 0 0.5em rgba(100, 255, 218, 0.3);
  }
  
  .group-name {
    font-weight: bold;
    margin-bottom: 0.3em;
  }
  
  .group-units {
    font-size: 0.85em;
    color: var(--color-muted);
  }
  
  .gather-info {
    margin: 1.5em 0;
    font-size: 0.9em;
    color: var(--color-muted);
    line-height: 1.4;
    background-color: var(--color-dark-navy);
    padding: 1em;
    border-radius: 0.3em;
  }
  
  .gather-info p {
    margin: 0.5em 0;
  }
  
  .action-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 1em;
    margin-top: 2em;
  }
  
  .cancel-button {
    background-color: transparent;
    color: var(--color-text);
    border: 0.1em solid var(--color-navy-highlight);
    padding: 0.7em 1.2em;
    border-radius: 0.3em;
    cursor: pointer;
    font-family: var(--font-heading);
    transition: all 0.2s;
  }
  
  .cancel-button:hover:not(:disabled) {
    background-color: var(--color-navy-highlight);
  }
  
  .gather-button {
    background-color: var(--color-teal);
    color: var(--color-dark-navy);
    border: none;
    padding: 0.7em 1.5em;
    border-radius: 0.3em;
    cursor: pointer;
    font-weight: bold;
    font-family: var(--font-heading);
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5em;
  }
  
  .gather-button:hover:not(:disabled) {
    background-color: var(--color-bright-accent);
    transform: translateY(-0.1em);
    box-shadow: 0 0.2em 0.5em rgba(0, 0, 0, 0.3);
  }
  
  .gather-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .spinner {
    width: 1em;
    height: 1em;
    border: 0.15em solid rgba(0, 0, 0, 0.3);
    border-top-color: var(--color-dark-navy);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  .error-message {
    padding: 1em;
    border-radius: 0.3em;
    background-color: rgba(255, 0, 0, 0.1);
    border: 0.1em solid rgba(255, 0, 0, 0.3);
    color: #f88;
    margin: 1em 0;
  }
  
  .error-message p {
    margin: 0;
  }
  
  .success-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2em;
    text-align: center;
  }
  
  .success-icon {
    font-size: 3em;
    color: var(--color-bright-accent);
    background-color: var(--color-dark-navy);
    width: 1.5em;
    height: 1.5em;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 0.5em;
    animation: pop 0.5s ease-out;
    box-shadow: 0 0 1em rgba(100, 255, 218, 0.5);
  }
  
  .success-message p {
    margin: 0.5em 0;
    font-size: 1.2em;
    font-weight: bold;
  }
  
  .success-message .info {
    font-size: 0.9em;
    color: var(--color-muted);
  }
  
  @keyframes modal-appear {
    0% {
      opacity: 0;
      transform: translateY(1em) scale(0.95);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  @keyframes pop {
    0% {
      transform: scale(0.5);
      opacity: 0;
    }
    50% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
