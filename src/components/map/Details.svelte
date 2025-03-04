<script>
  import { fly } from 'svelte/transition';
  
  // Props for the component
  export let x = 0;
  export let y = 0;
  export let show = false;
  
  // Sample data for the location
  const locationInfo = {
    terrain: "Plains",
    resources: ["Wood", "Stone"],
    structures: [],
    notes: "Unexplored territory"
  };
  
  // Handle close action
  function handleClose() {
    show = false;
  }
  
  // Watch for show prop changes to open/close the details element
  let detailsElement;
  $: if (detailsElement) {
    if (show && !detailsElement.open) detailsElement.open = true;
    else if (!show && detailsElement.open) detailsElement.open = false;
  }
  
  // Handle the toggle event to keep the show prop in sync
  function handleToggle(event) {
    show = detailsElement.open;
  }
  
  // Allow ESC key to close the details
  function handleKeydown(event) {
    if (event.key === 'Escape' && show) {
      show = false;
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="details-container" class:visible={show}>
  <details 
    class="location-details" 
    bind:this={detailsElement}
    on:toggle={handleToggle}
  >
    <summary class="details-summary">
      <h2>Location Details: ({x}, {y})</h2>
      <!-- Custom toggle icon added in CSS -->
    </summary>
    
    <div class="details-content" transition:fly={{ y: -10, duration: 200 }}>
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
      
      <div class="details-footer">
        <button class="close-button" on:click={handleClose}>Close</button>
      </div>
    </div>
  </details>
</div>

<style>
  .details-container {
    position: fixed;
    top: 3.5em; /* Position below the header */
    right: 1em;
    max-width: 400px;
    width: 90%;
    z-index: 1000;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }
  
  .details-container.visible {
    opacity: 1;
    pointer-events: all;
  }
  
  .location-details {
    background: #1a1a2e;
    border-radius: 0.5em;
    box-shadow: 0 0.5em 1.5em rgba(0, 0, 0, 0.5);
    overflow: hidden;
    width: 100%;
    color: white;
  }
  
  .details-summary {
    padding: 1em 1.5em;
    background: #252547;
    border-bottom: 1px solid #333;
    cursor: pointer;
    user-select: none;
    list-style: none; /* Remove default marker */
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
  }
  
  /* Remove the default disclosure triangle */
  .details-summary::-webkit-details-marker {
    display: none;
  }
  
  /* Add custom disclosure triangle */
  .details-summary::after {
    content: "▼";
    font-size: 0.8em;
    color: #aaa;
    transition: transform 0.2s ease;
  }
  
  /* Rotate arrow when open */
  details[open] .details-summary::after {
    transform: rotate(180deg);
  }
  
  .details-summary h2 {
    margin: 0;
    font-size: 1.3rem;
    color: #fff;
  }
  
  .details-content {
    padding: 1.5em;
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
  
  .details-footer {
    margin-top: 1em;
    display: flex;
    justify-content: flex-end;
    border-top: 1px solid #333;
    padding-top: 1em;
  }
  
  .close-button {
    background: #3a3a8c;
    color: white;
    border: none;
    padding: 0.5em 1.2em;
    border-radius: 0.3em;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background 0.2s ease;
  }
  
  .close-button:hover {
    background: #4a4ab8;
  }
</style>
