<script>
  import { onMount } from 'svelte';
  import { getFunctions, httpsCallable } from 'firebase/functions';
  import { game, currentPlayer } from '../../lib/stores/game.js';
  import { coordinates } from '../../lib/stores/map.js';
  import Modal from '../ui/Modal.svelte';
  import Button from '../ui/Button.svelte';
  import Tabs from '../ui/Tabs.svelte';
  import Spinner from '../ui/Spinner.svelte';

  // Define props using $props() rune
  const {
    structure = null,
    x = 0,
    y = 0,
    onClose = () => {},
    onCraftStart = () => {},
  } = $props();

  // Use $state() for reactive variables
  let recipes = $state([]);
  let loading = $state(true);
  let error = $state(null);
  let selectedTab = $state('weapon');
  let selectedRecipe = $state(null);
  let craftingInProgress = $state(false);
  let successMessage = $state(null);
  let playerInventory = $state([]);
  let currentBuildingLevels = $state({});

  // Define crafting categories with proper naming
  const categories = [
    { id: 'weapon', label: 'Weapons' },
    { id: 'tool', label: 'Tools' },
    { id: 'consumable', label: 'Consumables' },
    { id: 'document', label: 'Documents' },
    { id: 'artifact', label: 'Artifacts' },
    { id: 'material', label: 'Materials' },
    { id: 'scroll', label: 'Scrolls' },
    { id: 'trade_good', label: 'Trade Goods' }
  ];

  // Use $effect() for initialization logic (replaces onMount)
  $effect(() => {
    loadRecipesAndInventory();
  });

  // Use $derived for computed values - filter recipes by selected category
  const filteredRecipes = $derived(
    recipes.filter(recipe => recipe.category === selectedTab)
  );

  // Extract API call to a separate function
  async function loadRecipesAndInventory() {
    try {
      // Get player inventory
      const inventory = $currentPlayer?.inventory || [];
      playerInventory = Array.isArray(inventory) ? inventory : [];
      
      // Determine building levels from structure
      if (structure) {
        // Extract structure capabilities into building levels
        const newLevels = {};
        
        // Extract structure level for basic crafting
        newLevels.crafting = structure.level || 1;
        
        // Extract features from the structure
        const features = structure.features || [];
        
        // Map features to building levels
        features.forEach(feature => {
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
            // Add more cases as needed
          }
        });
        
        // Check for structure level/type-based building levels
        if (structure.type === 'stronghold') {
          newLevels.crafting = Math.max(2, newLevels.crafting); 
        } else if (structure.type === 'outpost') {
          newLevels.crafting = Math.max(1, newLevels.crafting);
        }
        
        // Extract buildings directly
        if (structure.buildings) {
          Object.values(structure.buildings).forEach(building => {
            // If we already have a level from a feature, use the higher value
            newLevels[building.type] = Math.max(
              newLevels[building.type] || 0,
              building.level || 1
            );
          });
        }
        
        // Update the state with all changes at once
        currentBuildingLevels = newLevels;
      }
      
      // Load hardcoded recipes instead of fetching
      recipes = getHardcodedRecipes();
      
      // Attempt to fetch recipes from server as a backup
      try {
        const functions = getFunctions();
        const getRecipes = httpsCallable(functions, 'getRecipes');
        const result = await getRecipes({
          worldId: $game.worldKey,
          position: { x, y }
        });
        
        if (result.data && Array.isArray(result.data) && result.data.length > 0) {
          recipes = result.data;
        }
      } catch (err) {
        console.log('Using hardcoded recipes as server fetch failed:', err);
      }
    } catch (err) {
      console.error('Error loading recipes and inventory:', err);
      error = err.message || 'Failed to load recipes';
    } finally {
      loading = false;
    }
  }

  // Function to get hardcoded recipes from craft.mjs
  function getHardcodedRecipes() {
    return [
      // WEAPONS - SMITHY RELATED ITEMS
      {
        id: 'wooden_sword',
        name: 'Wooden Sword',
        category: 'weapon',
        materials: {
          'Wooden Sticks': 5
        },
        result: {
          name: 'Wooden Sword',
          type: 'weapon',
          rarity: 'common',
          quantity: 1,
          description: 'A basic wooden sword. Not very durable but better than nothing.'
        },
        craftingTime: 60, // 1 minute
        requiredLevel: 1
      },
      {
        id: 'stone_sword',
        name: 'Stone Sword',
        category: 'weapon',
        materials: {
          'Wooden Sticks': 2,
          'Stone Pieces': 5
        },
        result: {
          name: 'Stone Sword',
          type: 'weapon',
          rarity: 'common',
          quantity: 1,
          description: 'A stone-bladed sword. More durable than wood.'
        },
        craftingTime: 120, // 2 minutes
        requiredLevel: 2
      },
      {
        id: 'iron_sword',
        name: 'Iron Sword',
        category: 'weapon',
        materials: {
          'Wooden Sticks': 2,
          'Iron Ingot': 3
        },
        result: {
          name: 'Iron Sword',
          type: 'weapon',
          rarity: 'uncommon',
          quantity: 1,
          description: 'A well-crafted iron sword. Standard issue for many fighters.'
        },
        craftingTime: 180, // 3 minutes
        requiredLevel: 3,
        requiredBuilding: {
          type: 'smithy',
          level: 2
        }
      },
      
      // FARM RELATED ITEMS
      {
        id: 'herbal_tea',
        name: 'Herbal Tea',
        category: 'consumable',
        materials: {
          'Medicinal Herb': 2,
          'Water Vial': 1
        },
        result: {
          name: 'Herbal Tea',
          type: 'consumable',
          rarity: 'common',
          quantity: 2,
          description: 'A soothing tea that provides minor healing and stamina recovery.'
        },
        craftingTime: 45, // 45 seconds
        requiredLevel: 1,
        requiredBuilding: {
          type: 'farm',
          level: 1
        }
      },
      {
        id: 'hearty_stew',
        name: 'Hearty Stew',
        category: 'consumable',
        materials: {
          'Vegetables': 3,
          'Meat': 2,
          'Water Vial': 1
        },
        result: {
          name: 'Hearty Stew',
          type: 'consumable',
          rarity: 'uncommon',
          quantity: 2,
          description: 'A filling meal that provides substantial stamina recovery and temporary health boost.'
        },
        craftingTime: 90, // 1.5 minutes
        requiredLevel: 2,
        requiredBuilding: {
          type: 'farm',
          level: 2
        }
      },
      {
        id: 'growth_fertilizer',
        name: 'Growth Fertilizer',
        category: 'consumable',
        materials: {
          'Plant Residue': 5,
          'Bone Meal': 2
        },
        result: {
          name: 'Growth Fertilizer',
          type: 'consumable',
          rarity: 'uncommon',
          quantity: 3,
          description: 'Accelerates plant growth when applied to farmland. Used in advanced farming.'
        },
        craftingTime: 120, // 2 minutes
        requiredLevel: 3,
        requiredBuilding: {
          type: 'farm',
          level: 3
        }
      },
      {
        id: 'golden_apple',
        name: 'Golden Apple',
        category: 'consumable',
        materials: {
          'Apple': 1,
          'Gold Dust': 5,
          'Magical Essence': 1
        },
        result: {
          name: 'Golden Apple',
          type: 'consumable',
          rarity: 'rare',
          quantity: 1,
          description: 'A mystical fruit imbued with healing energy. Greatly restores health and provides temporary regeneration.'
        },
        craftingTime: 240, // 4 minutes
        requiredLevel: 5,
        requiredBuilding: {
          type: 'farm',
          level: 4
        }
      },
      
      // ACADEMY RELATED ITEMS
      {
        id: 'minor_mana_potion',
        name: 'Minor Mana Potion',
        category: 'consumable',
        materials: {
          'Blue Herb': 3,
          'Crystal Water': 1
        },
        result: {
          name: 'Minor Mana Potion',
          type: 'consumable',
          rarity: 'common',
          quantity: 2,
          description: 'A simple potion that restores a small amount of magical energy.'
        },
        craftingTime: 60, // 1 minute
        requiredLevel: 2,
        requiredBuilding: {
          type: 'academy',
          level: 1
        }
      },
      {
        id: 'scroll_of_identify',
        name: 'Scroll of Identify',
        category: 'scroll',
        materials: {
          'Parchment': 1,
          'Magic Ink': 1,
          'Crystal Dust': 2
        },
        result: {
          name: 'Scroll of Identify',
          type: 'scroll',
          rarity: 'uncommon',
          quantity: 1,
          description: 'A magical scroll that reveals the true nature and properties of an item when read.'
        },
        craftingTime: 120, // 2 minutes
        requiredLevel: 3,
        requiredBuilding: {
          type: 'academy',
          level: 2
        }
      },
      
      // MARKET RELATED ITEMS
      {
        id: 'trading_contract',
        name: 'Trading Contract',
        category: 'document',
        materials: {
          'Parchment': 2,
          'Ink': 1
        },
        result: {
          name: 'Trading Contract',
          type: 'document',
          rarity: 'common',
          quantity: 3,
          description: 'A basic document used to formalize trading agreements.'
        },
        craftingTime: 60, // 1 minute
        requiredLevel: 1,
        requiredBuilding: {
          type: 'market',
          level: 1
        }
      },
      
      // MINE RELATED ITEMS
      {
        id: 'miners_lamp',
        name: 'Miner\'s Lamp',
        category: 'tool',
        materials: {
          'Iron Ingot': 1,
          'Oil': 2,
          'Glass': 1
        },
        result: {
          name: 'Miner\'s Lamp',
          type: 'tool',
          rarity: 'common',
          quantity: 1,
          description: 'A sturdy lamp designed for mining in dark places. Improves resource gathering in caves.'
        },
        craftingTime: 90, // 1.5 minutes
        requiredLevel: 2,
        requiredBuilding: {
          type: 'mine',
          level: 1
        }
      },
      {
        id: 'prospectors_pick',
        name: 'Prospector\'s Pick',
        category: 'tool',
        materials: {
          'Iron Ingot': 3,
          'Hardwood': 2,
          'Leather Strips': 1
        },
        result: {
          name: 'Prospector\'s Pick',
          type: 'tool',
          rarity: 'uncommon',
          quantity: 1,
          description: 'A specialized pickaxe designed to detect valuable minerals. Increases chance of finding rare ores.'
        },
        craftingTime: 180, // 3 minutes
        requiredLevel: 3,
        requiredBuilding: {
          type: 'mine',
          level: 2
        }
      }
    ];
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
  
  // Combined check if recipe can be crafted
  function canCraftRecipe(recipe) {
    if (!recipe) return false;
    
    // Check if player meets skill level requirement
    const playerCraftingLevel = $currentPlayer?.skills?.crafting?.level || 1;
    if (recipe.requiredLevel && playerCraftingLevel < recipe.requiredLevel) {
      return false;
    }
    
    return hasRequiredResources(recipe) && meetsBuildingLevelRequirements(recipe);
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
      const buildingType = formatBuildingType(recipe.requiredBuilding?.type);
      const requiredLevel = recipe.requiredBuilding?.level || 1;
      return `Requires a ${buildingType} (Level ${requiredLevel})`;
    }
    
    return null;
  }
  
  // Helper function to format building type names
  function formatBuildingType(type) {
    if (!type) return '';
    return type.replace(/_/g, ' ')
               .split(' ')
               .map(word => word.charAt(0).toUpperCase() + word.slice(1))
               .join(' ');
  }

  async function craftItem() {
    if (!selectedRecipe || !canCraftRecipe(selectedRecipe)) return;
    
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
        
        successMessage = `Successfully started crafting ${selectedRecipe.name}!`;
        
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
  
  // Format crafting time to human-readable string
  function formatCraftingTime(seconds) {
    if (!seconds) return "Instant";
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0 
        ? `${minutes}m ${remainingSeconds}s` 
        : `${minutes} minutes`;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 
      ? `${hours}h ${minutes}m` 
      : `${hours} hours`;
  }
</script>

<Modal title="Crafting" onClose={onClose} width="35rem">
  {#if loading}
    <div class="loading-container">
      <Spinner size="2rem" />
      <p>Loading recipes...</p>
    </div>
  {:else if error}
    <div class="error-message">
      {error}
      <Button onClick={() => error = null}>Try Again</Button>
    </div>
  {:else}
    <div class="crafting-container">
      <Tabs 
        items={categories} 
        bind:selected={selectedTab}
        extraClass="crafting-tabs"
      />
      
      <div class="recipe-list">
        {#if filteredRecipes.length === 0}
          <div class="empty-message">No recipes available in this category.</div>
        {:else}
          {#each filteredRecipes as recipe}
            <div 
              class="recipe-item" 
              class:selected={selectedRecipe?.id === recipe.id}
              class:disabled={!canCraftRecipe(recipe)}
              on:click={() => selectedRecipe = recipe}
            >
              <div class="recipe-header">
                <div class="recipe-name">{recipe.name}</div>
                <div class="recipe-rarity {recipe.result.rarity || 'common'}">{recipe.result.rarity || 'common'}</div>
              </div>
              <div class="recipe-description">{recipe.result.description}</div>
              
              {#if !canCraftRecipe(recipe)}
                <div class="recipe-blocked">{getCraftingBlockReason(recipe)}</div>
              {/if}
              
              {#if recipe.requiredBuilding}
                <div class="recipe-requires">
                  Requires: 
                  {formatBuildingType(recipe.requiredBuilding.type)} (Level {recipe.requiredBuilding.level})
                </div>
              {/if}
              
              {#if recipe.requiredLevel && recipe.requiredLevel > 1}
                <div class="recipe-craft-level">
                  Crafting Level: {recipe.requiredLevel}
                </div>
              {/if}
              
              <div class="recipe-time">
                <span class="time-icon">⏱</span>
                {formatCraftingTime(recipe.craftingTime)}
              </div>
            </div>
          {/each}
        {/if}
      </div>
      
      {#if selectedRecipe}
        <div class="recipe-details">
          <h3>{selectedRecipe.name}</h3>
          <p>{selectedRecipe.result.description}</p>
          
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
                  {formatBuildingType(selectedRecipe.requiredBuilding.type)}
                </span>
                <span class="level-info">
                  Level {selectedRecipe.requiredBuilding.level}
                </span>
                <span class="status-indicator {meetsBuildingLevelRequirements(selectedRecipe) ? 'available' : 'unavailable'}">
                  {meetsBuildingLevelRequirements(selectedRecipe) ? '✓ Available' : '✗ Not Available'}
                </span>
              </div>
            </div>
          {/if}
          
          {#if successMessage}
            <div class="success-message">{successMessage}</div>
          {/if}
          
          <Button 
            onClick={craftItem}
            disabled={!canCraftRecipe(selectedRecipe) || craftingInProgress}
            loading={craftingInProgress}
          >
            Craft Item
          </Button>
        </div>
      {:else}
        <div class="empty-details">
          <p>Select a recipe to view details.</p>
        </div>
      {/if}
    </div>
  {/if}
</Modal>

<style>
  .crafting-container {
    display: grid;
    grid-template-columns: 14rem 1fr;
    gap: 1rem;
    max-height: 70vh;
  }
  
  .crafting-tabs {
    grid-column: span 2;
    margin-bottom: 0.5rem;
  }
  
  .recipe-list {
    overflow-y: auto;
    max-height: 50vh;
    padding-right: 0.5rem;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .recipe-item {
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.25rem;
    margin-bottom: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .recipe-item:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  
  .recipe-item.selected {
    border-color: rgba(255, 215, 0, 0.6);
    background: rgba(255, 215, 0, 0.1);
  }
  
  .recipe-item.disabled {
    opacity: 0.6;
    border-color: rgba(255, 0, 0, 0.3);
  }
  
  .recipe-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
  }
  
  .recipe-name {
    font-weight: 600;
    font-size: 0.95rem;
  }
  
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
  
  .recipe-description {
    font-size: 0.85rem;
    opacity: 0.8;
    margin-bottom: 0.5rem;
    line-height: 1.2;
  }
  
  .recipe-blocked {
    font-size: 0.8rem;
    color: #ff6666;
    margin-top: 0.5rem;
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
    color: #999999;
    margin-top: 0.5rem;
    display: flex;
    align-items: center;
  }
  
  .time-icon {
    margin-right: 0.3rem;
  }
  
  .recipe-details {
    padding: 0 0.5rem;
  }
  
  .recipe-details h3 {
    margin-top: 0;
    margin-bottom: 0.5rem;
    font-size: 1.2rem;
  }
  
  .recipe-details h4 {
    margin: 1rem 0 0.5rem;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.05rem;
    color: #aaaaaa;
  }
  
  .materials-list {
    margin-bottom: 1rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 0.3rem;
    padding: 0.5rem;
  }
  
  .material-item {
    display: flex;
    justify-content: space-between;
    padding: 0.25rem 0;
    font-size: 0.9rem;
  }
  
  .material-item.insufficient {
    color: #ff6666;
  }
  
  .building-requirement {
    margin-bottom: 1rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 0.3rem;
    padding: 0.5rem;
  }
  
  .building-info {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
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
  
  .success-message {
    background-color: rgba(0, 255, 0, 0.1);
    border: 1px solid rgba(0, 255, 0, 0.3);
    color: lightgreen;
    padding: 0.5rem;
    border-radius: 0.25rem;
    margin: 1rem 0;
    text-align: center;
  }
  
  .empty-message,
  .empty-details {
    padding: 1rem;
    text-align: center;
    color: rgba(255, 255, 255, 0.5);
    font-style: italic;
  }
  
  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 12rem;
    gap: 1rem;
  }
  
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
</style>
