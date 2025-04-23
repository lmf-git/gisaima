<script>
  import { slide } from "svelte/transition";
  import { onMount, onDestroy } from "svelte";
  import { currentPlayer } from "../../lib/stores/game.js";
  import Close from '../icons/Close.svelte';
  import Structure from '../icons/Structure.svelte';
  import Torch from '../icons/Torch.svelte';
  // Import race icons for race-specific structures
  import Human from '../icons/Human.svelte';
  import Elf from '../icons/Elf.svelte';
  import Dwarf from '../icons/Dwarf.svelte';
  import Goblin from '../icons/Goblin.svelte';
  import Fairy from '../icons/Fairy.svelte';

  // Props - using correct Svelte 5 runes syntax
  const { 
    x = 0, 
    y = 0, 
    tile = null, 
    onClose = () => {},
    onAchievement = () => {} // Add this to handle achievements
  } = $props();
  
  // Add state to track collapsed sections
  let collapsedSections = $state({
    items: false
  });
  
  // Add state for storage tab selection
  let activeTab = $state('shared');
  
  // Add a render counter to force fresh animation on each open
  let renderKey = $state(0);
  
  // Simplify animation control
  let isReady = $state(false);
  
  // Add a function to trigger the inspector achievement when component mounts
  onMount(() => {
    // Short timeout to ensure DOM is ready
    setTimeout(() => isReady = true, 10);
    
    // Trigger the inspector achievement when viewing structure details
    if (onAchievement && typeof onAchievement === 'function') {
      onAchievement('inspector');
    }
  });
  
  onDestroy(() => {
    isReady = false;
  });
  
  // Function to toggle section collapse state
  function toggleSection(sectionId) {
    collapsedSections[sectionId] = !collapsedSections[sectionId];
  }

  // Helper functions
  function formatCoords(x, y) {
    return `${x},${y}`;
  }
  
  function formatText(text) {
    if (!text) return '';
    return text.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  
  function isOwnedByCurrentPlayer(entity) {
    if (!entity || !$currentPlayer) return false;
    return entity.owner === $currentPlayer.id;
  }
  
  // Get rarity class from item rarity for consistent styling with grid
  function getRarityClass(rarity) {
    return rarity?.toLowerCase() || 'common';
  }
  
  // Get race icon component based on race
  function getRaceIcon(race) {
    if (!race) return null;
    
    const raceLower = race.toLowerCase();
    switch(raceLower) {
      case 'human': return Human;
      case 'elf': return Elf;
      case 'dwarf': return Dwarf;
      case 'goblin': return Goblin;
      case 'fairy': return Fairy;
      default: return null;
    }
  }
  
  // Reactive declarations using $derived
  let hasPersonalBank = $derived(
    $currentPlayer?.id && 
    tile?.structure?.banks && 
    tile?.structure?.banks[$currentPlayer.id] && 
    tile?.structure?.banks[$currentPlayer.id].length > 0
  );
  
  let displayItems = $derived(
    activeTab === 'shared' 
      ? (tile?.structure?.items || [])
      : (hasPersonalBank ? tile?.structure?.banks[$currentPlayer.id] : [])
  );
  
  let showStorageTabs = $derived(
    hasPersonalBank || 
    (tile?.structure?.items && tile?.structure?.items.length > 0)
  );
  
  // Add keyboard handler for the Escape key
  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose();
    }
  }
</script>

<!-- Add global keyboard event listener -->
<svelte:window on:keydown={handleKeyDown} />

<div class="modal-container" class:ready={isReady}>
  <!-- Use key binding to force re-render on each open -->
  <div class="structure-modal" key={renderKey}>
    <header class="modal-header">
      <h3>
        {formatText(tile?.structure?.type || 'Structure')} 
        {tile ? `(${formatCoords(tile.x, tile.y)})` : ''}
      </h3>
      <button class="close-button" onclick={onClose}>
        <Close size="1.6em" extraClass="close-icon-dark" />
      </button>
    </header>

    <div class="modal-content">
      <div class="structure-container">
        <div class="structure-icon-container">
          {#if tile?.structure?.type === 'spawn'}
            <Torch size="3.5em" extraClass="structure-type-icon spawn-icon" />
          {:else}
            <Structure size="3.5em" extraClass="structure-type-icon {tile?.structure?.type || ''}-icon" />
          {/if}
        </div>
        
        <div class="structure-info">
          <div class="structure-name">
            <h2>{tile?.structure?.name || formatText(tile?.structure?.type) || 'Unknown'}</h2>
            {#if isOwnedByCurrentPlayer(tile?.structure)}
              <span class="entity-badge owner-badge">Yours</span>
            {/if}
            
            {#if tile?.structure?.race}
              <span class="entity-badge race-badge">
                <!-- Race icon in race badge is kept -->
                {#if tile?.structure?.race.toLowerCase() === 'human'}
                  <Human extraClass="race-icon-badge" />
                {:else if tile?.structure?.race.toLowerCase() === 'elf'}
                  <Elf extraClass="race-icon-badge" />
                {:else if tile?.structure?.race.toLowerCase() === 'dwarf'}
                  <Dwarf extraClass="race-icon-badge" />
                {:else if tile?.structure?.race.toLowerCase() === 'goblin'}
                  <Goblin extraClass="race-icon-badge" />
                {:else if tile?.structure?.race.toLowerCase() === 'fairy'}
                  <Fairy extraClass="race-icon-badge" />
                {/if}
                <span>{formatText(tile?.structure?.race)}</span>
              </span>
            {/if}
          </div>
          
          {#if tile?.structure?.description}
            <div class="structure-description">
              {tile.structure.description}
            </div>
          {/if}
        </div>
      </div>
      
      <!-- Storage section - includes both shared and personal items -->
      {#if showStorageTabs}
        <div class="entities-section">
          <div 
            class="section-header"
            onclick={() => toggleSection('items')}
            onkeydown={(e) => {
              if (e.key === 'Escape' && !collapsedSections.items) {
                toggleSection('items');
                e.preventDefault();
              }
            }}
            role="button"
            tabindex="0"
            aria-expanded={!collapsedSections.items}
          >
            <h4>Storage <span class="entity-count items-count">{displayItems.length}</span></h4>
            <button class="collapse-button">
              {collapsedSections.items ? '▼' : '▲'}
            </button>
          </div>
          
          {#if !collapsedSections.items}
            <div class="section-content">
              {#if hasPersonalBank || (tile?.structure?.items && tile?.structure?.items.length > 0)}
                <div class="storage-tabs">
                  <button 
                    class="tab-button {activeTab === 'shared' ? 'active' : ''}" 
                    onclick={() => activeTab = 'shared'}
                  >
                    Shared Storage
                    {#if tile?.structure?.items && tile?.structure?.items.length > 0}
                      <span class="tab-count">{tile?.structure?.items.length}</span>
                    {/if}
                  </button>
                  
                  {#if hasPersonalBank}
                    <button 
                      class="tab-button {activeTab === 'personal' ? 'active' : ''}"
                      onclick={() => activeTab = 'personal'}
                    >
                      Your Bank
                      <span class="tab-count">{tile?.structure?.banks[$currentPlayer.id].length}</span>
                    </button>
                  {/if}
                </div>
              {/if}
              
              {#if displayItems.length === 0}
                <div class="empty-state">
                  {activeTab === 'shared' ? 
                    'No items in shared storage' : 
                    'Your personal bank is empty'}
                </div>
              {:else}
                {#each displayItems as item}
                  <div class="entity item {getRarityClass(item.rarity)}">
                    <div class="item-info">
                      <div class="item-name">
                        {item.name || formatText(item.type) || "Unknown Item"}
                      </div>
                      <div class="item-details">
                        {#if item.type}
                          <span class="item-type">{formatText(item.type)}</span>
                        {/if}
                        {#if item.quantity > 1}
                          <span class="item-quantity">×{item.quantity}</span>
                        {/if}
                        {#if item.rarity && item.rarity !== 'common'}
                          <span class="item-rarity {item.rarity}">{formatText(item.rarity)}</span>
                        {/if}
                      </div>
                      {#if item.description}
                        <div class="item-description">{item.description}</div>
                      {/if}
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .modal-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s ease-out;
  }
  
  .modal-container.ready {
    opacity: 1;
  }

  .structure-modal {
    pointer-events: auto;
    width: 90%;
    max-width: 34em;
    max-height: 85vh;
    background-color: rgba(255, 255, 255, 0.85);
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    border-radius: 0.3em;
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    text-shadow: 0 0 0.15em rgba(255, 255, 255, 0.7);
    z-index: 1000;
    font-size: 1.4em;
    font-family: var(--font-body);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    /* Use transform animation for better performance */
    transform: scale(0.95);
    opacity: 0;
    animation: modalAppear 0.3s ease-out forwards;
  }

  @keyframes modalAppear {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .modal-header {
    padding: 0.8em 1em;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: rgba(0, 0, 0, 0.05);
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    font-family: var(--font-heading);
  }

  h3 {
    margin: 0;
    font-size: 1.1em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.8);
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

  .modal-content {
    padding: 0.8em;
    overflow-y: auto;
  }

  .structure-container {
    display: flex;
    align-items: center;
    gap: 1em;
    padding: 0.5em 0 1em 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    margin-bottom: 1em;
  }

  .structure-icon-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-width: 4em;
  }
  
  .structure-info {
    flex: 1;
  }
  
  .structure-name {
    display: flex;
    align-items: center;
    gap: 0.5em;
    flex-wrap: wrap;
    margin-bottom: 0.5em;
  }
  
  .structure-name h2 {
    margin: 0;
    font-size: 1.2em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.8);
    font-family: var(--font-heading);
  }
  
  .structure-description {
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.7);
    line-height: 1.4;
  }

  /* Entity badge styling */
  .entity-badge {
    font-size: 0.7em;
    padding: 0.2em 0.4em;
    border-radius: 0.3em;
    font-weight: 500;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 0.3em;
  }

  .owner-badge {
    background-color: rgba(76, 175, 80, 0.2);
    color: #2e7d32;
    border: 1px solid rgba(76, 175, 80, 0.4);
  }
  
  .race-badge {
    background-color: rgba(33, 150, 243, 0.2);
    color: #0277bd;
    border: 1px solid rgba(33, 150, 243, 0.4);
  }

  /* Race icon styling inside the badge */
  :global(.race-icon-badge) {
    width: 1em;
    height: 1em;
    fill: #000000 !important;
  }

  /* Section styling */
  .entities-section {
    margin-bottom: 1.2em;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid rgba(0, 0, 0, 0.1);
    background-color: rgba(255, 255, 255, 0.5);
  }
  
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5em 1em;
    background-color: rgba(0, 0, 0, 0.03);
    cursor: pointer;
    user-select: none;
  }
  
  .section-header:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }

  .collapse-button {
    background: none;
    border: none;
    color: rgba(0, 0, 0, 0.5);
    font-size: 0.8em;
    cursor: pointer;
    padding: 0.2em 0.5em;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5em;
    min-height: 1.5em;
  }

  .collapse-button:hover {
    color: rgba(0, 0, 0, 0.8);
    background-color: rgba(0, 0, 0, 0.05);
    border-radius: 50%;
  }

  h4 {
    margin: 0;
    font-size: 0.9em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    gap: 0.3em;
  }

  .section-content {
    padding: 0.8em;
  }

  /* Tab system for shared/personal storage */
  .storage-tabs {
    display: flex;
    margin-bottom: 1em;
    border-radius: 0.3em;
    overflow: hidden;
    border: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  .tab-button {
    flex: 1;
    padding: 0.6em 0.8em;
    background: rgba(255, 255, 255, 0.5);
    border: none;
    border-right: 1px solid rgba(0, 0, 0, 0.1);
    font-family: inherit;
    font-size: 0.85em;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4em;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .tab-button:last-child {
    border-right: none;
  }
  
  .tab-button.active {
    background: rgba(66, 133, 244, 0.1);
    color: rgba(0, 0, 0, 0.85);
    font-weight: 600;
  }
  
  .tab-button:hover:not(.active) {
    background: rgba(0, 0, 0, 0.03);
  }
  
  .tab-count {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 1em;
    padding: 0.1em 0.5em;
    font-size: 0.85em;
    min-width: 1.2em;
    text-align: center;
  }
  
  /* Empty state styling */
  .empty-state {
    padding: 2em 0;
    text-align: center;
    color: rgba(0, 0, 0, 0.5);
    font-style: italic;
    font-size: 0.9em;
  }

  /* Item styling */
  .entity {
    display: flex;
    align-items: flex-start;
    margin-bottom: 0.6em;
    padding: 0.5em 0.7em;
    border-radius: 0.3em;
    background-color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(0, 0, 0, 0.1);
    transition: background-color 0.2s ease;
  }

  .entity:last-child {
    margin-bottom: 0;
  }

  .entity:hover {
    background-color: rgba(255, 255, 255, 0.8);
  }

  .item-info {
    flex: 1;
  }

  .item-name {
    font-weight: 500;
    color: rgba(0, 0, 0, 0.85);
    line-height: 1.2;
    margin-bottom: 0.2em;
  }

  .item-details {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6em;
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.7);
    width: 100%;
    justify-content: space-between;
  }

  .item-type {
    font-weight: 500;
  }

  .item-description {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.6);
    font-style: italic;
    margin-top: 0.4em;
  }

  .item-quantity {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.6);
    margin-left: 0.2em;
  }

  /* Item rarity styling */
  .entity.item.uncommon {
    border-color: rgba(76, 175, 80, 0.3);
    background-color: rgba(76, 175, 80, 0.05);
  }

  .entity.item.rare {
    border-color: rgba(33, 150, 243, 0.3);
    background-color: rgba(33, 150, 243, 0.05);
  }

  .entity.item.epic {
    border-color: rgba(156, 39, 176, 0.3);
    background-color: rgba(156, 39, 176, 0.05);
  }

  .entity.item.legendary {
    border-color: rgba(255, 152, 0, 0.3);
    background-color: rgba(255, 152, 0, 0.05);
  }

  .entity.item.mythic {
    border-color: rgba(233, 30, 99, 0.3);
    background-color: rgba(233, 30, 99, 0.05);
    animation: pulseMythic 2s infinite alternate;
  }

  .item-rarity {
    font-size: 0.8em;
    padding: 0.1em 0.4em;
    border-radius: 0.2em;
  }

  .item-rarity.uncommon {
    background-color: rgba(76, 175, 80, 0.2);
    color: #2e7d32;
  }

  .item-rarity.rare {
    background-color: rgba(33, 150, 243, 0.2);
    color: #0277bd;
  }

  .item-rarity.epic {
    background-color: rgba(156, 39, 176, 0.2);
    color: #7b1fa2;
  }

  .item-rarity.legendary {
    background-color: rgba(255, 152, 0, 0.2);
    color: #ef6c00;
  }

  .item-rarity.mythic {
    background-color: rgba(233, 30, 99, 0.2);
    color: #c2185b;
    border: 1px solid rgba(233, 30, 99, 0.4);
  }

  @keyframes pulseMythic {
    from {
      box-shadow: 0 0 0 0 rgba(233, 30, 99, 0.1);
    }
    to {
      box-shadow: 0 0 10px 2px rgba(233, 30, 99, 0.3);
    }
  }

  /* Entity count styling consistent with Details and Grid components */
  .entity-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 1em;
    font-size: 0.8em;
    font-weight: 500;
    padding: 0.1em 0.6em;
    margin-left: 0.3em;
    color: rgba(255, 255, 255, 0.95);
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 0 0.15em rgba(255, 255, 255, 0.2);
  }
  
  .items-count {
    background: rgba(255, 215, 0, 0.8);
    border-color: rgba(255, 215, 0, 0.5);
    box-shadow: 0 0 0.15em rgba(255, 215, 0, 0.6);
  }

  :global(.structure-type-icon) {
    opacity: 0.8;
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.5));
  }
  
  :global(.spawn-icon) {
    filter: drop-shadow(0 0 2px rgba(0, 255, 255, 0.6));
  }
  
  :global(.fortress-icon) {
    filter: drop-shadow(0 0 2px rgba(230, 190, 138, 0.7));
  }
  
  :global(.outpost-icon) {
    filter: drop-shadow(0 0 2px rgba(138, 176, 230, 0.7));
  }
  
  :global(.watchtower-icon) {
    filter: drop-shadow(0 0 2px rgba(168, 230, 138, 0.7));
  }
  
  :global(.stronghold-icon) {
    filter: drop-shadow(0 0 2px rgba(230, 138, 138, 0.7));
  }
  
  :global(.citadel-icon) {
    filter: drop-shadow(0 0 2px rgba(209, 138, 230, 0.7));
  }
</style>
