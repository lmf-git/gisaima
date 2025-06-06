<script>
  import { getFunctions, httpsCallable } from 'firebase/functions';
  import { scale, fade } from 'svelte/transition';

  import { BUILDINGS } from 'gisaima-shared';
  import { 
    getItemCategories, 
    getAllRecipes
  } from 'gisaima-shared/definitions/ITEMS.js';
  import { game, currentPlayer } from '../../../lib/stores/game.js';
  
  import Close from '../../icons/Close.svelte';
  import Back from '../../icons/Back.svelte';

  // Props
  const {
    structure = null,
    x = 0,
    y = 0,
    onClose = () => {},
    onCraftStart = () => {},
    isActive = false,
    onMouseEnter = () => {}
  } = $props();

  // Use $state() for reactive variables
  let recipes = $state(getAllRecipes());
  let loading = $state(false); 
  let error = $state(null);
  let selectedCategory = $state(null);
  let selectedRecipe = $state(null);
  let craftingInProgress = $state(false);
  let successMessage = $state(null);
  let playerInventory = $state([]);
  let currentBuildingLevels = $state({});
  
  // Navigation state - new variable to track current view
  let currentView = $state('categories'); // 'categories', 'recipes', 'details'

  // Replace the hardcoded categories array with the imported function
  const categories = getItemCategories();

  // Simpler effect to just handle player inventory and building levels
  $effect(() => {
    // Get player inventory
    playerInventory = Array.isArray($currentPlayer?.inventory) 
      ? [...$currentPlayer.inventory] 
      : [];
    
    // Extract building levels from structure
    if (structure) {
      const newLevels = {};
      
      // Extract structure level for basic crafting
      newLevels.crafting = structure.level || 1;
      
      // Extract structure features and buildings
      if (structure.features) {
        structure.features.forEach(feature => {
          switch(feature.name) {
            case 'Basic Workshop':
            case 'Advanced Workshop':
              newLevels.workshop = feature.level || 1;
              break;
            case 'Basic Forge':
            case 'Advanced Forge':
              newLevels.smithy = feature.level || 1;
              break;
            case 'Alchemy Lab':
              newLevels.alchemy = feature.level || 1;
              break;
          }
        });
      }
      
      // Set structure type bonuses
      if (structure.type === 'stronghold') {
        newLevels.crafting = Math.max(2, newLevels.crafting);
      } else if (structure.type === 'outpost') {
        newLevels.crafting = Math.max(1, newLevels.crafting);
      }
      
      // Process buildings
      if (structure.buildings) {
        Object.values(structure.buildings).forEach(building => {
          newLevels[building.type] = Math.max(
            newLevels[building.type] || 0,
            building.level || 1
          );
        });
      }
      
      currentBuildingLevels = newLevels;
    }
  });

  // Use $derived for computed values - filter recipes by selected category
  const filteredRecipes = $derived(
    selectedCategory ? recipes.filter(recipe => recipe.category === selectedCategory) : []
  );

  // Navigation functions
  function goToCategories() {
    currentView = 'categories';
    selectedCategory = null;
    selectedRecipe = null;
    successMessage = null;
  }
  
  function selectCategory(categoryId) {
    selectedCategory = categoryId;
    currentView = 'recipes';
    selectedRecipe = null;
    successMessage = null;
  }
  
  function viewRecipeDetails(recipe) {
    selectedRecipe = recipe;
    currentView = 'details';
    successMessage = null;
  }
  
  function goBack() {
    if (currentView === 'details') {
      currentView = 'recipes';
      selectedRecipe = null;
      successMessage = null;
    } else if (currentView === 'recipes') {
      currentView = 'categories';
      selectedCategory = null;
    }
  }

  // Regular functions (not reactive)
  function hasRequiredResources(recipe) {
    if (!recipe?.materials) return false;
    
    // Convert object materials to array format for checking
    const materialsList = Object.entries(recipe.materials).map(([name, quantity]) => ({ 
      name, quantity 
    }));
    
    return materialsList.every(material => {
      const playerItem = playerInventory.find(item => item.name === material.name);
      return playerItem && playerItem.quantity >= material.quantity;
    });
  }
  
  function meetsBuildingLevelRequirements(recipe) {
    // If no building requirements, always return true
    if (!recipe?.requiredBuilding) return true;
    
    // If requirements exist but player is not at a structure, return false
    if (!structure) return false;
    
    const { type, level } = recipe.requiredBuilding;
    const currentLevel = currentBuildingLevels[type] || 0;
    
    return currentLevel >= level;
  }
  
  function getCraftingBlockReason(recipe) {
    if (!recipe) return "No recipe selected";
    
    // Check player crafting level
    const playerCraftingLevel = $currentPlayer?.skills?.crafting?.level || 1;
    if (recipe.requiredLevel && playerCraftingLevel < recipe.requiredLevel) {
      return `Requires crafting level ${recipe.requiredLevel}`;
    }
    
    if (!hasRequiredResources(recipe)) {
      return "Missing required materials";
    }
    
    if (!meetsBuildingLevelRequirements(recipe)) {
      const buildingType = BUILDINGS.getBuildingName(recipe.requiredBuilding?.type);
      const requiredLevel = recipe.requiredBuilding?.level || 1;
      return `Requires a ${buildingType} (Level ${requiredLevel})`;
    }
    
    return null;
  }

  // Update the craftItem function to handle tick-based crafting response
  async function craftItem() {
    if (!selectedRecipe || !canCraft(selectedRecipe)) return;
    
    craftingInProgress = true;
    successMessage = null;
    error = null;
    
    try {
      const functions = getFunctions();
      const craftFunction = httpsCallable(functions, 'startCrafting');
      
      // Convert materials object format to what the API expects
      const apiMaterials = {};
      if (typeof selectedRecipe.materials === 'object') {
        Object.entries(selectedRecipe.materials).forEach(([name, quantity]) => {
          apiMaterials[name] = quantity;
        });
      }
      
      const result = await craftFunction({
        recipeId: selectedRecipe.id,
        worldId: $game.worldKey,
        x,
        y,
        materials: apiMaterials,
        result: selectedRecipe.result
      });
      
      if (result.data?.success) {
        // Update local inventory
        if (selectedRecipe.materials) {
          Object.entries(selectedRecipe.materials).forEach(([name, quantity]) => {
            const inventoryItem = playerInventory.find(item => item.name === name);
            if (inventoryItem) {
              inventoryItem.quantity -= quantity;
            }
          });
        }
        
        // Use ticksRequired from the response for the success message
        const ticksRequired = result.data.ticksRequired || selectedRecipe.craftingTime;
        successMessage = `Successfully started crafting ${selectedRecipe.name}! Will complete in ${formatCraftingTicks(ticksRequired)}.`;
        
        // Trigger any achievement tracking
        onCraftStart(
          $game.worldKey,
          'first_craft',
          true
        );
      } else {
        error = result.data?.error || 'Unknown crafting error';
      }
    } catch (err) {
      console.error('Error crafting item:', err);
      error = err.message || 'Failed to craft item';
    } finally {
      craftingInProgress = false;
    }
  }
  
  // Format tick formatter
  function formatCraftingTicks(ticks) {
    if (!ticks) return "Instant";
    return ticks === 1 ? `${ticks} tick` : `${ticks} ticks`;
  }
  
  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      if (currentView === 'details') {
        goBack();
      } else if (currentView === 'recipes') {
        goBack();
      } else {
        onClose();
      }
    }
  }
  
  function canCraft(recipe) {
    if (!recipe) return false;
    
    // Check player crafting level
    const playerCraftingLevel = $currentPlayer?.skills?.crafting?.level || 1;
    if (recipe.requiredLevel && playerCraftingLevel < recipe.requiredLevel) {
      return false;
    }
    
    if (!hasRequiredResources(recipe)) {
      return false;
    }
    
    if (!meetsBuildingLevelRequirements(recipe)) {
      return false;
    }
    
    return true;
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div 
  class="crafting-modal"
  class:active={isActive}
  onmouseenter={onMouseEnter}
  transition:scale={{ start: 0.95, duration: 200 }}>
  
  <header class="modal-header">
    <div class="header-content">
      {#if currentView !== 'categories'}
        <button class="back-btn" onclick={goBack} aria-label="Go back">
          <Back size="1.2em" />
        </button>
      {/if}
      <h2 id="crafting-title">
        {#if currentView === 'categories'}
          Crafting
        {:else if currentView === 'recipes'}
          {categories.find(c => c.id === selectedCategory)?.label || 'Select Recipe'}
        {:else}
          {selectedRecipe?.name || 'Recipe Details'}
        {/if}
      </h2>
    </div>
    <button class="close-btn" onclick={onClose} aria-label="Close crafting dialog">
      <Close size="1.5em" />
    </button>
  </header>
  
  <div class="content">
    {#if loading}
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <p>Loading recipes...</p>
      </div>
    {:else if error}
      <div class="error-message">
        {error}
        <button class="try-again-btn" onclick={() => error = null}>Try Again</button>
      </div>
    {:else}
      <div class="crafting-container">
        <!-- Categories View -->
        {#if currentView === 'categories'}
          <div class="categories-grid" transition:fade={{ duration: 200 }}>
            {#each categories as category}
              <button 
                class="category-card" 
                onclick={() => selectCategory(category.id)}
              >
                <div class="category-icon">{category.icon || '🔨'}</div>
                <div class="category-name">{category.label}</div>
              </button>
            {/each}
          </div>
        {/if}
        
        <!-- Recipes View -->
        {#if currentView === 'recipes'}
          <div class="recipe-list" transition:fade={{ duration: 200 }}>
            {#if filteredRecipes.length === 0}
              <div class="empty-message">No recipes available in this category.</div>
            {:else}
              {#each filteredRecipes as recipe}
                <div 
                  class="recipe-item" 
                  class:disabled={!canCraft(recipe)}
                  onclick={() => viewRecipeDetails(recipe)}
                  onkeydown={(e) => e.key === 'Enter' && viewRecipeDetails(recipe)}
                  tabindex="0"
                  role="button"
                  aria-disabled={!canCraft(recipe)}
                >
                  <div class="recipe-header">
                    <div class="recipe-name">{recipe.name}</div>
                    <div class="recipe-rarity {recipe.result.rarity || 'common'}">{recipe.result.rarity || 'common'}</div>
                  </div>
                  <div class="recipe-description">{recipe.result.description}</div>
                  
                  {#if !canCraft(recipe)}
                    <div class="recipe-blocked">{getCraftingBlockReason(recipe)}</div>
                  {/if}
                  
                  <div class="recipe-time">
                    <span class="time-icon">⏱</span>
                    {formatCraftingTicks(recipe.craftingTime)}
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        {/if}
        
        <!-- Recipe Details View -->
        {#if currentView === 'details' && selectedRecipe}
          <div class="recipe-details" transition:fade={{ duration: 200 }}>
            <h3>{selectedRecipe.name}</h3>
            <p class="recipe-description">{selectedRecipe.result.description}</p>
            
            <div class="recipe-rarity-badge {selectedRecipe.result.rarity || 'common'}">
              {selectedRecipe.result.rarity || 'common'}
            </div>
            
            <h4>Required Materials:</h4>
            <div class="materials-list">
              {#if typeof selectedRecipe.materials === 'object'}
                {#each Object.entries(selectedRecipe.materials) as [name, quantity]}
                  <div 
                    class="material-item"
                    class:insufficient={
                      !playerInventory.find(item => item.name === name && item.quantity >= quantity)
                    }
                  >
                    <span class="material-name">{name}</span>
                    <span class="material-quantity">
                      {(playerInventory.find(item => item.name === name)?.quantity || 0)} / {quantity}
                    </span>
                  </div>
                {/each}
              {/if}
            </div>
            
            {#if selectedRecipe.requiredBuilding}
              <div class="building-requirement">
                <h4>Required Building:</h4>
                <div class="building-info">
                  <span class="building-name">
                    {BUILDINGS.getBuildingName(selectedRecipe.requiredBuilding.type)}
                  </span>
                  <span class="level-info">
                    Level {selectedRecipe.requiredBuilding.level}
                  </span>
                  <span class="status-indicator {meetsBuildingLevelRequirements(selectedRecipe) ? 'available' : 'unavailable'}">
                    {meetsBuildingLevelRequirements(selectedRecipe) ? '✓ Available' : '✗ Not Available'}
                  </span>
                </div>
                <div class="building-icon">{BUILDINGS.getBuildingIcon(selectedRecipe.requiredBuilding.type)}</div>
                <div class="building-description">
                  {BUILDINGS.getBuildingDescription(selectedRecipe.requiredBuilding.type)}
                </div>
              </div>
            {/if}
            
            <div class="crafting-time-info">
              <h4>Crafting Time:</h4>
              <div class="time-display">
                <span class="tick-count">{formatCraftingTicks(selectedRecipe.craftingTime)}</span>
              </div>
            </div>
            
            {#if successMessage}
              <div class="success-message">{successMessage}</div>
            {/if}
            
            <button 
              class="craft-btn" 
              onclick={craftItem}
              disabled={!canCraft(selectedRecipe) || craftingInProgress}
            >
              {#if craftingInProgress}
                <div class="button-spinner"></div>
                Crafting...
              {:else}
                Craft Item
              {/if}
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  /* Base modal styles */
  .crafting-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 36em;
    max-height: 85vh;
    background-color: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 0.05em solid rgba(255, 255, 255, 0.3);
    border-radius: 0.5rem;
    box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    z-index: 1000;
    overflow: hidden;
    font-family: var(--font-body);
    transition: z-index 0s;
  }
  
  .crafting-modal.active {
    z-index: 1001;
  }
  
  /* Header styles */
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.8em 1em;
    background: rgba(0, 0, 0, 0.05);
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  .header-content {
    display: flex;
    align-items: center;
    gap: 0.5em;
  }
  
  .back-btn {
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.3em;
    border-radius: 50%;
    transition: background 0.2s;
  }
  
  .back-btn:hover {
    background: rgba(0, 0, 0, 0.1);
  }
  
  h2 {
    margin: 0;
    font-size: 1.3em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.8);
    font-family: var(--font-heading);
  }
  
  .content {
    padding: 1em;
    overflow-y: auto;
    max-height: calc(90vh - 4em);
    color: rgba(0, 0, 0, 0.8);
  }
  
  /* Close button */
  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.3em;
    display: flex;
    border-radius: 50%;
    transition: background-color 0.2s;
  }
  
  .close-btn:hover {
    background-color: rgba(0, 0, 0, 0.1);
  }
  
  /* Categories grid styles */
  .categories-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8em, 1fr));
    gap: 1em;
    padding: 0.5em;
  }
  
  .category-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.5em;
    padding: 1.5em 1em;
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
  }
  
  .category-card:hover {
    background: rgba(0, 0, 0, 0.08);
    transform: translateY(-2px);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.1);
  }
  
  .category-icon {
    font-size: 1.8em;
    margin-bottom: 0.5em;
  }
  
  .category-name {
    font-weight: 500;
    font-size: 0.9em;
  }

  /* Recipe list */
  .recipe-list {
    overflow-y: auto;
    max-height: 65vh;
    padding: 0.5em;
  }
  
  .recipe-item {
    padding: 0.75rem;
    background: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.25rem;
    margin-bottom: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .recipe-item:hover {
    background: rgba(0, 0, 0, 0.08);
    transform: translateY(-2px);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.05);
  }
  
  .recipe-item.disabled {
    opacity: 0.7;
    border-color: rgba(255, 0, 0, 0.2);
  }
  
  /* Recipe header */
  .recipe-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
  }
  
  .recipe-name {
    font-weight: 600;
    font-size: 0.95rem;
    color: rgba(0, 0, 0, 0.8);
  }
  
  /* Rarity badges */
  .recipe-rarity {
    font-size: 0.75rem;
    padding: 0.1rem 0.3rem;
    border-radius: 0.2rem;
    text-transform: capitalize;
  }
  
  .recipe-rarity.common {
    background: rgba(158, 158, 158, 0.2);
    color: #616161;
  }
  
  .recipe-rarity.uncommon {
    background: rgba(76, 175, 80, 0.2);
    color: #2e7d32;
  }
  
  .recipe-rarity.rare {
    background: rgba(33, 150, 243, 0.2);
    color: #0277bd;
  }
  
  .recipe-rarity.epic {
    background: rgba(156, 39, 176, 0.2);
    color: #7b1fa2;
  }
  
  .recipe-rarity.legendary {
    background: rgba(255, 152, 0, 0.2);
    color: #ef6c00;
  }
  
  /* Recipe descriptions */
  .recipe-description {
    font-size: 0.85rem;
    color: rgba(0, 0, 0, 0.7);
    margin-bottom: 0.5rem;
    line-height: 1.3;
  }
  
  /* Recipe status and requirements */
  .recipe-blocked {
    font-size: 0.8rem;
    color: #ff6666;
    margin: 0.5rem 0;
    font-weight: 500;
  }
  
  .recipe-requires {
    font-size: 0.8rem;
    color: #ffcc66;
    margin-top: 0.25rem;
    font-style: italic;
  }
  
  .recipe-craft-level {
    font-size: 0.8rem;
    color: #66ccff;
    margin-top: 0.25rem;
    font-style: italic;
  }
  
  .recipe-time {
    font-size: 0.8rem;
    color: #666666;
    margin-top: 0.5rem;
    display: flex;
    align-items: center;
  }
  
  .time-icon {
    margin-right: 0.3rem;
  }
  
  /* Recipe details */
  .recipe-details {
    padding: 0.5rem;
  }
  
  .recipe-details h3 {
    margin-top: 0;
    margin-bottom: 0.5rem;
    font-size: 1.2rem;
    color: rgba(0, 0, 0, 0.85);
  }
  
  .recipe-details h4 {
    margin: 1.2rem 0 0.5rem;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.05rem;
    color: rgba(0, 0, 0, 0.6);
  }

  .recipe-rarity-badge {
    display: inline-block;
    font-size: 0.8rem;
    padding: 0.2rem 0.5rem;
    border-radius: 0.2rem;
    text-transform: capitalize;
    margin: 0.5rem 0;
  }
  
  /* Materials list */
  .materials-list {
    margin-bottom: 1rem;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 0.3rem;
    padding: 0.5rem;
  }
  
  .material-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.3rem 0.5rem;
    font-size: 0.9rem;
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  }
  
  .material-item:last-child {
    border-bottom: none;
  }
  
  .material-item.insufficient {
    color: #ff6666;
  }

  .material-quantity {
    font-family: var(--font-mono, monospace);
    font-size: 0.85rem;
  }
  
  /* Building requirements */
  .building-requirement {
    margin-bottom: 1rem;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 0.3rem;
    padding: 0.5rem;
  }
  
  .building-info {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  
  .building-name {
    font-weight: 500;
  }
  
  .level-info {
    color: #ffcc66;
    font-weight: 500;
  }
  
  .status-indicator {
    padding: 0.1rem 0.3rem;
    border-radius: 0.2rem;
    font-size: 0.8rem;
    margin-left: auto;
  }
  
  .status-indicator.available {
    color: #4caf50;
    background: rgba(76, 175, 80, 0.1);
  }
  
  .status-indicator.unavailable {
    color: #f44336;
    background: rgba(244, 67, 54, 0.1);
  }
  
  .building-icon {
    font-size: 1.5rem;
    text-align: center;
    margin: 0.5rem 0;
  }
  
  .building-description {
    font-size: 0.85rem;
    color: rgba(0, 0, 0, 0.7);
    font-style: italic;
  }
  
  /* Crafting time info */
  .crafting-time-info {
    margin-top: 1rem;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 0.3rem;
    padding: 0.5rem;
  }
  
  .time-display {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 0.5rem;
  }
  
  .tick-count {
    font-size: 1.2rem;
    font-weight: 600;
    color: #ffcc66;
    text-shadow: 0 0 5px rgba(255, 204, 102, 0.5);
  }
  
  /* Message styles */
  .success-message {
    background-color: rgba(0, 255, 0, 0.1);
    border: 1px solid rgba(0, 255, 0, 0.3);
    color: #4caf50;
    padding: 0.8rem;
    border-radius: 0.25rem;
    margin: 1rem 0;
    text-align: center;
    font-weight: 500;
  }
  
  .empty-message {
    padding: 2rem 1rem;
    text-align: center;
    color: rgba(0, 0, 0, 0.5);
    font-style: italic;
  }
  
  /* Loading styles */
  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 12rem;
    gap: 1rem;
  }
  
  .loading-spinner {
    width: 2rem;
    height: 2rem;
    border: 0.25rem solid rgba(0, 0, 0, 0.1);
    border-top: 0.25rem solid #4285f4;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  /* Error message */
  .error-message {
    padding: 1rem;
    text-align: center;
    color: #ff6666;
    background: rgba(255, 0, 0, 0.1);
    border-radius: 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .try-again-btn {
    padding: 0.5rem 1rem;
    background: #f1f3f4;
    border: 1px solid #dadce0;
    border-radius: 0.25rem;
    color: #3c4043;
    font-family: var(--font-body);
    cursor: pointer;
    font-size: 0.9rem;
    transition: background-color 0.2s;
  }
  
  .try-again-btn:hover {
    background-color: #e8eaed;
  }
  
  /* Craft button */
  .craft-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 0.8rem;
    font-size: 1rem;
    font-weight: 500;
    color: white;
    background-color: #4285f4;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: background-color 0.2s, transform 0.2s;
    margin-top: 1.5rem;
  }
  
  .craft-btn:hover:not(:disabled) {
    background-color: #3367d6;
    transform: translateY(-2px);
  }
  
  .craft-btn:disabled {
    background-color: #9e9e9e;
    cursor: not-allowed;
    opacity: 0.7;
  }
  
  .button-spinner {
    width: 1rem;
    height: 1rem;
    border: 0.15rem solid rgba(255, 255, 255, 0.3);
    border-top: 0.15rem solid white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-right: 0.5rem;
  }
</style>
