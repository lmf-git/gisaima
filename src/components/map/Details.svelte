<script>
  import { fade, fly } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  
  // Props for the modal
  export let x = 0;
  export let y = 0;
  export let show = false;
  
  // Sample data for the location - this would come from your data store in a real app
  const locationInfo = {
    terrain: "Plains",
    resources: ["Wood", "Stone"],
    structures: [],
    notes: "Unexplored territory"
  };
  
  // Handle close button click
  function handleClose() {
    show = false;
  }
  
  // Handle click outside the modal content but inside the backdrop
  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      show = false;
    }
  }
  
  // Handle escape key
  function handleKeydown(event) {
    if (event.key === 'Escape') {
      show = false;
    }
  }
  
  // Stop propagation of mouse events to prevent interference with map dragging
  function stopPropagation(event) {
    event.stopPropagation();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
  <div 
    class="modal-backdrop" 
    on:click={handleBackdropClick}
    on:mousedown={stopPropagation}
    transition:fade={{ duration: 200 }}
  >
    <div 
      class="modal-container" 
      on:mousedown|stopPropagation
      on:mouseup|stopPropagation
      on:mousemove|stopPropagation
      transition:fly={{ y: -20, duration: 300, easing: quintOut }}
      role="dialog"
      aria-labelledby="modal-title"
      aria-modal="true"
    >
      <div class="modal-header">
        <h2 id="modal-title">Location Details: ({x}, {y})</h2>
        <button class="close-button" on:click={handleClose} aria-label="Close details">×</button>
      </div>
      
      <div class="modal-body">
        <div class="info-section">
          <h3>Terrain</h3>
          <p>{locationInfo.terrain}</p>
        </div>
        
        <div class="info-section">
          <h3>Resources</h3>
          {#if locationInfo.resources.length > 0}
            <ul>
              {#each locationInfo.resources as resource}
                <li>{resource}</li>
              {/each}
            </ul>
          {:else}
            <p>No resources found</p>
          {/if}
        </div>
        
        <div class="info-section">
          <h3>Structures</h3>
          {#if locationInfo.structures.length > 0}
            <ul>
              {#each locationInfo.structures as structure}
                <li>{structure}</li>
              {/each}
            </ul>
          {:else}
            <p>No structures present</p>
          {/if}
        </div>
        
        <div class="info-section">
          <h3>Notes</h3>
          <p>{locationInfo.notes}</p>
        </div>
      </div>
      
      <div class="modal-footer">
        <button class="primary-button" on:click={handleClose}>Close</button>
        <!-- Additional action buttons could go here -->
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5); /* Less opacity for a more transparent backdrop */
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    pointer-events: none; /* Let events pass through backdrop */
  }
  
  .modal-container {
    background: #1a1a2e;
    border-radius: 0.5em;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 0.5em 1.5em rgba(0, 0, 0, 0.5);
    color: white;
    display: flex;
    flex-direction: column;
    user-select: none; /* Prevent text selection */
    pointer-events: auto; /* Restore pointer events for modal content */
  }
  
  .modal-header {
    padding: 1em 1.5em;
    border-bottom: 1px solid #333;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #252547;
  }
  
  .modal-header h2 {
    margin: 0;
    font-size: 1.3rem;
    color: #fff;
  }
  
  .close-button {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #aaa;
    padding: 0;
    width: 1.5em;
    height: 1.5em;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s ease;
  }
  
  .close-button:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
  }
  
  .modal-body {
    padding: 1.5em;
    overflow-y: auto;
    user-select: text; /* Allow text selection only in modal body */
  }
  
  .info-section {
    margin-bottom: 1.5em;
  }
  
  .info-section h3 {
    font-size: 1.1rem;
    margin: 0 0 0.5em 0;
    color: #aaf;
  }
  
  .info-section p {
    margin: 0;
    color: #ddd;
  }
  
  .info-section ul {
    margin: 0;
    padding-left: 1.2em;
    color: #ddd;
  }
  
  .modal-footer {
    padding: 1em 1.5em;
    border-top: 1px solid #333;
    display: flex;
    justify-content: flex-end;
    background: #252547;
  }
  
  .primary-button {
    background: #3a3a8c;
    color: white;
    border: none;
    padding: 0.5em 1.2em;
    border-radius: 0.3em;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background 0.2s ease;
  }
  
  .primary-button:hover {
    background: #4a4ab8;
  }
</style>
