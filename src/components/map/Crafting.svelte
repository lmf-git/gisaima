<script>
    import { onMount, onDestroy } from "svelte";
    import { get } from "svelte/store";
    import { game, currentPlayer } from "../../lib/stores/game.js";
    import { getFunctions, httpsCallable } from "firebase/functions";
    import Close from "../icons/Close.svelte";
    import Human from "../icons/Human.svelte";
    import Sword from "../icons/Sword.svelte";
    import Shield from "../icons/Shield.svelte";
    import Bow from "../icons/Bow.svelte";
    import Axe from "../icons/Axe.svelte";
    import Potion from "../icons/Potion.svelte";
    import Armor from "../icons/Armor.svelte";

    // Props
    const {
        structure = null,
        x = 0,
        y = 0,
        onClose = () => {},
        onCraftStart = () => {},
    } = $props();

    // Component state
    let isLoading = $state(false);
    let error = $state(null);
    let success = $state(null);
    let selectedRecipe = $state(null);
    let availableRecipes = $state([]);
    let structureData = $state(null);
    let playerInventory = $state([]);
    let craftingInProgress = $state(null);
    let categories = $state(['all']);
    let activeCategory = $state('all');
    let playerCraftingLevel = $state(1);
    let craftingBonus = $state(0);
    
    // Flag to track if component is ready
    let isReady = $state(false);

    // Load data when component mounts
    onMount(async () => {
        isLoading = true;
        try {
            structureData = structure;
            
            // Fetch player's crafting status
            await loadPlayerCraftingStatus();
            
            // Fetch available recipes
            await loadAvailableRecipes();
            
            // Load player inventory
            await loadPlayerInventory();
            
            isReady = true;
        } catch (err) {
            console.error("Error initializing crafting:", err);
            error = err.message || "Failed to initialize crafting";
        } finally {
            isLoading = false;
        }
    });

    // Load player's current crafting status
    async function loadPlayerCraftingStatus() {
        const player = get(currentPlayer);
        if (player && player.crafting) {
            // Player is already crafting something
            craftingInProgress = player.crafting;
        }
    }

    // Load available recipes from cloud function
    async function loadAvailableRecipes() {
        const functions = getFunctions();
        const getRecipesFn = httpsCallable(functions, "getAvailableRecipes");

        const result = await getRecipesFn({
            worldId: get(game).worldKey,
            x,
            y,
            structureId: structure?.id
        });

        if (result.data.success) {
            // Set available recipes
            availableRecipes = result.data.recipes;
            
            // Extract unique categories
            const uniqueCategories = ['all'];
            availableRecipes.forEach(recipe => {
                if (recipe.category && !uniqueCategories.includes(recipe.category)) {
                    uniqueCategories.push(recipe.category);
                }
            });
            categories = uniqueCategories;
            
            // Set player crafting level
            playerCraftingLevel = result.data.playerCraftingLevel || 1;
            
            // Set crafting bonus if available
            if (result.data.structureBonuses) {
                craftingBonus = result.data.structureBonuses.timeReduction || 0;
            }
            
            // Set initial selected recipe (the first available one)
            const firstAvailable = availableRecipes.find(r => r.available);
            if (firstAvailable) {
                selectedRecipe = firstAvailable;
            }
        }
    }

    // Load player inventory
    async function loadPlayerInventory() {
        const player = get(currentPlayer);
        if (player && player.inventory) {
            playerInventory = player.inventory;
        }
    }

    // Filter recipes by category
    $effect(() => {
        // This will re-run whenever activeCategory or availableRecipes changes
        if (activeCategory !== 'all' && selectedRecipe && selectedRecipe.category !== activeCategory) {
            // If we switch to a category and the current selected recipe is not in that category,
            // try to select the first available recipe in the new category
            const firstInCategory = availableRecipes.find(r => 
                r.category === activeCategory && r.available);
            
            if (firstInCategory) {
                selectedRecipe = firstInCategory;
            }
        }
    });

    // Function to get filtered recipes based on active category
    function getFilteredRecipes() {
        if (activeCategory === 'all') {
            return availableRecipes;
        }
        return availableRecipes.filter(r => r.category === activeCategory);
    }

    // Select a recipe
    function selectRecipe(recipe) {
        selectedRecipe = recipe;
        error = null;
    }

    // Check if player has enough materials for the selected recipe
    function hasEnoughMaterials() {
        if (!selectedRecipe || !selectedRecipe.materials) return false;

        // Go through each required material and check inventory
        for (const [material, requiredAmount] of Object.entries(selectedRecipe.materials)) {
            const normalizedMaterial = material.replace(/_/g, ' ');
            const availableAmount = getAvailableMaterial(normalizedMaterial);
            
            if (availableAmount < requiredAmount) {
                return false;
            }
        }

        return true;
    }

    // Get available amount of a specific material
    function getAvailableMaterial(materialName) {
        let total = 0;
        
        // Normalize the material name for comparison
        const normalizedName = materialName.toLowerCase().replace(/_/g, ' ');
        
        // Check player's inventory
        if (playerInventory && playerInventory.length) {
            playerInventory.forEach(item => {
                if (item && item.name && item.name.toLowerCase() === normalizedName) {
                    total += item.quantity || 0;
                }
            });
        }
        
        return total;
    }

    // Format text with proper capitalization
    function formatText(text) {
        if (!text) return '';
        return text.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    // Format time from seconds to readable format
    function formatTime(seconds) {
        if (seconds < 60) return `${Math.ceil(seconds)}s`;
        if (seconds < 3600)
            return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
        return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    }

    // Format date to human-readable format
    function formatDate(date) {
        if (!date) return "";
        const now = new Date();
        const diff = date - now;

        // If less than a day, show relative time
        if (diff < 86400000) {
            // 24 hours in ms
            return `Today at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        }

        return date.toLocaleString();
    }

    // Get appropriate icon component for a recipe
    function getRecipeIcon(recipe) {
        if (!recipe || !recipe.category) return Sword;
        
        switch (recipe.category.toLowerCase()) {
            case 'weapon':
                if (recipe.type === 'bow') return Bow;
                return Sword;
            case 'armor':
                return Armor;
            case 'tool':
                if (recipe.type === 'axe') return Axe;
                return Shield;
            case 'consumable':
                return Potion;
            default:
                return Sword;
        }
    }

    // Start crafting the selected recipe
    async function startCrafting() {
        if (!selectedRecipe) {
            error = "No recipe selected";
            return;
        }

        if (!hasEnoughMaterials()) {
            error = "Not enough materials";
            return;
        }

        try {
            isLoading = true;
            error = null;

            const functions = getFunctions();
            const startCraftingFn = httpsCallable(functions, "startCrafting");

            const result = await startCraftingFn({
                recipeId: selectedRecipe.id,
                x,
                y,
                worldId: get(game).worldKey,
                structureId: structure?.id
            });

            console.log("Crafting started:", result.data);
            
            // Update local state with crafting data
            craftingInProgress = result.data;
            success = `Started crafting ${selectedRecipe.name}`;

            // Trigger achievement callback if provided
            if (onCraftStart) {
                onCraftStart(result.data);
            }
        } catch (err) {
            console.error("Error starting crafting:", err);
            error = err.message || "Failed to start crafting";
        } finally {
            isLoading = false;
        }
    }

    // Cancel current crafting
    async function cancelCrafting() {
        try {
            isLoading = true;
            error = null;

            const functions = getFunctions();
            const cancelCraftingFn = httpsCallable(functions, "cancelCrafting");

            await cancelCraftingFn({
                worldId: get(game).worldKey
            });

            craftingInProgress = null;
            success = "Crafting cancelled";
        } catch (err) {
            console.error("Error cancelling crafting:", err);
            error = err.message || "Failed to cancel crafting";
        } finally {
            isLoading = false;
        }
    }

    // Calculate progress percentage for ongoing crafting
    function getProgressPercentage() {
        if (!craftingInProgress || !craftingInProgress.startedAt || !craftingInProgress.completesAt) {
            return 0;
        }

        const now = Date.now();
        const total = craftingInProgress.completesAt - craftingInProgress.startedAt;
        const elapsed = now - craftingInProgress.startedAt;

        if (elapsed >= total) return 100;
        return Math.floor((elapsed / total) * 100);
    }

    // Format material name for display
    function formatMaterialName(material) {
        return material.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    // Add keyboard handler for the Escape key
    function handleKeyDown(event) {
        if (event.key === "Escape" && !isLoading) {
            onClose();
        }
    }

    // Timer for updating progress bar
    let progressTimer;
    
    onMount(() => {
        // Set up timer to update progress
        progressTimer = setInterval(() => {
            if (craftingInProgress) {
                // Force a state update to recalculate progress
                craftingInProgress = { ...craftingInProgress };
            }
        }, 1000);
    });

    onDestroy(() => {
        if (progressTimer) {
            clearInterval(progressTimer);
        }
    });
</script>

<svelte:window on:keydown={handleKeyDown} />

<div class="crafting-modal">
    <header class="modal-header">
        <h3>
            Crafting {structure ? `at ${structure.name}` : ""} ({x}, {y})
        </h3>
        <button class="close-button" onclick={onClose} disabled={isLoading}>
            <Close size="1.6em" extraClass="close-icon-dark" />
        </button>
    </header>

    <div class="modal-content">
        {#if isLoading && !isReady}
            <div class="loading-state">
                Loading crafting data...
            </div>
        {:else if craftingInProgress}
            <!-- Ongoing crafting section -->
            <div class="section crafting-progress-section">
                <h4>Crafting in Progress</h4>
                
                <div class="crafting-item">
                    <div class="crafting-item-header">
                        <div class="recipe-icon">
                            {#if craftingInProgress.category === 'weapon'}
                                {#if craftingInProgress.type === 'bow'}
                                    <Bow extraClass="recipe-icon-svg" />
                                {:else}
                                    <Sword extraClass="recipe-icon-svg" />
                                {/if}
                            {:else if craftingInProgress.category === 'armor'}
                                <Armor extraClass="recipe-icon-svg" />
                            {:else if craftingInProgress.category === 'consumable'}
                                <Potion extraClass="recipe-icon-svg" />
                            {:else if craftingInProgress.category === 'tool'}
                                {#if craftingInProgress.type === 'axe'}
                                    <Axe extraClass="recipe-icon-svg" />
                                {:else}
                                    <Shield extraClass="recipe-icon-svg" />
                                {/if}
                            {:else}
                                <Sword extraClass="recipe-icon-svg" />
                            {/if}
                        </div>
                        
                        <div class="crafting-info">
                            <div class="crafting-name">
                                {craftingInProgress.recipeName}
                            </div>
                            <div class="crafting-time">
                                Completes: {formatDate(new Date(craftingInProgress.completesAt))}
                            </div>
                        </div>
                    </div>
                    
                    <div class="progress-container">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: {getProgressPercentage()}%"></div>
                        </div>
                        <div class="progress-text">
                            {getProgressPercentage()}% complete
                        </div>
                    </div>
                    
                    <div class="crafting-actions">
                        <button class="cancel-button" onclick={cancelCrafting} disabled={isLoading}>
                            Cancel Crafting
                        </button>
                    </div>
                </div>
            </div>
        {:else}
            <!-- Recipe selection and crafting form -->
            <div class="section categories-section">
                <div class="category-tabs">
                    {#each categories as category}
                        <button 
                            class="category-tab {activeCategory === category ? 'active' : ''}"
                            onclick={() => activeCategory = category}
                        >
                            {formatText(category)}
                        </button>
                    {/each}
                </div>
            </div>
            
            <div class="section recipes-section">
                <h4>Available Recipes</h4>
                
                {#if getFilteredRecipes().length === 0}
                    <div class="empty-state">
                        No recipes available in this category
                    </div>
                {:else}
                    <div class="recipes-grid">
                        {#each getFilteredRecipes() as recipe}
                            {@const IconComponent = getRecipeIcon(recipe)}
                            <button 
                                class="recipe-card {selectedRecipe?.id === recipe.id ? 'selected' : ''} {!recipe.available ? 'unavailable' : ''}"
                                onclick={() => selectRecipe(recipe)}
                                disabled={!recipe.available}
                                title={recipe.available ? recipe.description : `${recipe.description} (${recipe.unavailableReason})`}
                            >
                                <div class="recipe-icon-container">
                                    {#if IconComponent}
                                        <IconComponent extraClass="recipe-icon-svg" />
                                    {/if}
                                    {#if !recipe.available}
                                        <div class="locked-overlay">
                                            🔒
                                        </div>
                                    {/if}
                                </div>
                                <div class="recipe-name">
                                    {recipe.name}
                                </div>
                                <div class="recipe-level">
                                    Level {recipe.level || 1}
                                </div>
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
            
            {#if selectedRecipe}
                <div class="section recipe-details">
                    <h4>{selectedRecipe.name}</h4>
                    
                    <div class="recipe-description">
                        {selectedRecipe.description}
                    </div>
                    
                    {#if !selectedRecipe.available}
                        <div class="unavailable-reason">
                            {selectedRecipe.unavailableReason}
                        </div>
                    {/if}
                    
                    <div class="recipe-stats">
                        <div class="recipe-stat">
                            <span class="stat-label">Category:</span>
                            <span class="stat-value">{formatText(selectedRecipe.category)}</span>
                        </div>
                        
                        <div class="recipe-stat">
                            <span class="stat-label">Type:</span>
                            <span class="stat-value">{formatText(selectedRecipe.type)}</span>
                        </div>
                        
                        <div class="recipe-stat">
                            <span class="stat-label">Crafting time:</span>
                            <span class="stat-value">
                                {formatTime(selectedRecipe.timeToCraft)}
                                {#if selectedRecipe.bonusApplied}
                                    <span class="bonus-text">
                                        (includes {Math.round((1 - craftingBonus) * 100)}% speed bonus)
                                    </span>
                                {/if}
                            </span>
                        </div>
                        
                        {#if selectedRecipe.level > 1}
                            <div class="recipe-stat">
                                <span class="stat-label">Required level:</span>
                                <span class="stat-value {selectedRecipe.level > playerCraftingLevel ? 'insufficient' : ''}">
                                    {selectedRecipe.level} {selectedRecipe.level > playerCraftingLevel ? `(You: ${playerCraftingLevel})` : ''}
                                </span>
                            </div>
                        {/if}
                        
                        {#if selectedRecipe.effects}
                            <div class="recipe-stat effects-stat">
                                <span class="stat-label">Effects:</span>
                                <div class="effects-list">
                                    {#each Object.entries(selectedRecipe.effects) as [effect, value]}
                                        <div class="effect-item">
                                            {formatText(effect)}: {typeof value === 'number' ? (value > 1 ? `+${Math.round((value-1)*100)}%` : value) : value}
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                    
                    <div class="materials-section">
                        <h5>Required materials:</h5>
                        <div class="materials-list">
                            {#each Object.entries(selectedRecipe.materials) as [material, amount]}
                                {@const available = getAvailableMaterial(material.replace(/_/g, ' '))}
                                <div class="material-item {available < amount ? 'insufficient' : ''}">
                                    <span class="material-name">{formatMaterialName(material)}</span>
                                    <span class="material-amount">{amount} / {available}</span>
                                </div>
                            {/each}
                        </div>
                    </div>
                    
                    {#if error}
                        <div class="error-message">{error}</div>
                    {/if}
                    
                    {#if success}
                        <div class="success-message">{success}</div>
                    {/if}
                    
                    {#if selectedRecipe.available}
                        <div class="crafting-actions">
                            <button 
                                class="craft-button" 
                                onclick={startCrafting} 
                                disabled={isLoading || !hasEnoughMaterials()}
                            >
                                {isLoading ? "Processing..." : "Start Crafting"}
                            </button>
                        </div>
                    {/if}
                </div>
            {/if}
        {/if}
    </div>
</div>

<style>
    .crafting-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        max-width: 36rem;
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
    }

    .modal-header {
        padding: 0.8rem 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background-color: rgba(0, 0, 0, 0.05);
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    }

    h3 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
        color: rgba(0, 0, 0, 0.8);
        font-family: var(--font-heading);
    }

    .close-button {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.4rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background-color 0.2s;
    }

    .close-button:hover:not(:disabled) {
        background-color: rgba(0, 0, 0, 0.1);
    }

    .modal-content {
        padding: 1rem;
        overflow-y: auto;
        max-height: calc(85vh - 3.5rem);
    }

    .loading-state {
        padding: 2rem;
        text-align: center;
        color: rgba(0, 0, 0, 0.6);
        font-style: italic;
    }

    .section {
        margin-bottom: 1.5rem;
        padding: 1rem;
        background-color: rgba(255, 255, 255, 0.7);
        border-radius: 0.3rem;
        border: 1px solid rgba(0, 0, 0, 0.1);
    }

    h4 {
        margin: 0 0 1rem 0;
        font-size: 1rem;
        font-weight: 600;
        color: rgba(0, 0, 0, 0.8);
        font-family: var(--font-heading);
    }

    h5 {
        margin: 0 0 0.5rem 0;
        font-size: 0.9rem;
        font-weight: 600;
        color: rgba(0, 0, 0, 0.8);
    }

    .empty-state {
        padding: 2rem 0;
        text-align: center;
        color: rgba(0, 0, 0, 0.6);
        font-style: italic;
    }

    .categories-section {
        padding: 0.5rem;
    }

    .category-tabs {
        display: flex;
        overflow-x: auto;
        gap: 0.3rem;
        padding-bottom: 0.3rem;
    }

    .category-tab {
        padding: 0.5rem 1rem;
        border: none;
        background-color: rgba(0, 0, 0, 0.05);
        border-radius: 0.3rem;
        cursor: pointer;
        white-space: nowrap;
        font-size: 0.9rem;
        transition: all 0.2s;
    }

    .category-tab:hover {
        background-color: rgba(0, 0, 0, 0.1);
    }

    .category-tab.active {
        background-color: rgba(0, 122, 255, 0.2);
        color: rgba(0, 72, 171, 0.9);
        font-weight: 500;
    }

    .recipes-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
        gap: 0.8rem;
    }

    .recipe-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 0.8rem 0.5rem;
        background-color: rgba(255, 255, 255, 0.5);
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 0.3rem;
        cursor: pointer;
        transition: all 0.2s;
        font-family: inherit;
    }

    .recipe-card:hover:not(.unavailable) {
        background-color: rgba(255, 255, 255, 0.8);
        transform: translateY(-2px);
    }

    .recipe-card.selected {
        background-color: rgba(0, 122, 255, 0.1);
        border-color: rgba(0, 122, 255, 0.3);
        box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.2);
    }

    .recipe-icon-container {
        width: 3rem;
        height: 3rem;
        background-color: rgba(0, 0, 0, 0.05);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        margin-bottom: 0.5rem;
    }

    :global(.recipe-icon-svg) {
        width: 1.8rem;
        height: 1.8rem;
        opacity: 0.8;
        color: rgba(0, 0, 0, 0.7);
    }

    .recipe-name {
        font-weight: 500;
        font-size: 0.85rem;
        text-align: center;
        margin-bottom: 0.3rem;
    }

    .recipe-level {
        font-size: 0.75rem;
        color: rgba(0, 0, 0, 0.6);
    }

    .recipe-card.unavailable {
        opacity: 0.7;
        cursor: default;
    }

    .locked-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: rgba(0, 0, 0, 0.3);
        border-radius: 50%;
        font-size: 1.2rem;
    }

    .recipe-description {
        margin-bottom: 1rem;
        font-size: 0.9rem;
        line-height: 1.4;
        color: rgba(0, 0, 0, 0.7);
    }

    .unavailable-reason {
        padding: 0.7rem;
        background-color: rgba(255, 152, 0, 0.1);
        border: 1px solid rgba(255, 152, 0, 0.3);
        border-radius: 0.3rem;
        color: rgba(196, 98, 0, 0.9);
        font-size: 0.85rem;
        margin-bottom: 1rem;
    }

    .recipe-stats {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        margin-bottom: 1.5rem;
    }

    .recipe-stat {
        display: flex;
        font-size: 0.9rem;
        align-items: baseline;
    }

    .stat-label {
        width: 7rem;
        font-weight: 500;
        color: rgba(0, 0, 0, 0.7);
        flex-shrink: 0;
    }

    .stat-value {
        color: rgba(0, 0, 0, 0.8);
    }

    .bonus-text {
        font-size: 0.8rem;
        color: rgb(0, 122, 255);
        margin-left: 0.5rem;
    }

    .effects-stat {
        align-items: flex-start;
    }

    .effects-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .effect-item {
        font-size: 0.85rem;
        padding: 0.2rem 0.5rem;
        background-color: rgba(0, 122, 255, 0.1);
        border-radius: 0.2rem;
        white-space: nowrap;
    }

    .materials-section {
        margin-bottom: 1.5rem;
    }

    .materials-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .material-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.6rem 0.8rem;
        background-color: rgba(0, 0, 0, 0.03);
        border-radius: 0.3rem;
        font-size: 0.9rem;
    }

    .material-item.insufficient {
        background-color: rgba(255, 59, 48, 0.1);
        color: rgb(168, 36, 28);
    }

    .error-message {
        padding: 0.8rem;
        background-color: rgba(255, 59, 48, 0.1);
        border: 1px solid rgba(255, 59, 48, 0.2);
        border-radius: 0.3rem;
        color: rgb(168, 36, 28);
        font-size: 0.9rem;
        margin-bottom: 1rem;
    }

    .success-message {
        padding: 0.8rem;
        background-color: rgba(52, 199, 89, 0.1);
        border: 1px solid rgba(52, 199, 89, 0.2);
        border-radius: 0.3rem;
        color: rgb(20, 128, 56);
        font-size: 0.9rem;
        margin-bottom: 1rem;
    }

    .crafting-actions {
        display: flex;
        justify-content: flex-end;
    }

    .craft-button {
        padding: 0.7rem 1.2rem;
        background-color: rgba(0, 122, 255, 0.8);
        color: white;
        border: none;
        border-radius: 0.3rem;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .craft-button:hover:not(:disabled) {
        background-color: rgba(0, 122, 255, 0.9);
    }

    .craft-button:disabled {
        background-color: rgba(0, 0, 0, 0.2);
        cursor: not-allowed;
    }

    .cancel-button {
        padding: 0.7rem 1.2rem;
        background-color: rgba(255, 59, 48, 0.8);
        color: white;
        border: none;
        border-radius: 0.3rem;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .cancel-button:hover:not(:disabled) {
        background-color: rgba(255, 59, 48, 0.9);
    }

    .crafting-item {
        padding: 1rem;
        background-color: rgba(255, 255, 255, 0.5);
        border-radius: 0.3rem;
        border: 1px solid rgba(0, 0, 0, 0.1);
    }

    .crafting-item-header {
        display: flex;
        gap: 1rem;
        margin-bottom: 1rem;
        align-items: center;
    }

    .crafting-info {
        flex-grow: 1;
    }

    .crafting-name {
        font-weight: 500;
        margin-bottom: 0.3rem;
    }

    .crafting-time {
        font-size: 0.85rem;
        color: rgba(0, 0, 0, 0.6);
    }

    .recipe-icon {
        width: 2.5rem;
        height: 2.5rem;
        background-color: rgba(0, 0, 0, 0.05);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .progress-container {
        margin-bottom: 1rem;
    }

    .progress-bar {
        height: 0.6rem;
        background-color: rgba(0, 0, 0, 0.1);
        border-radius: 0.3rem;
        overflow: hidden;
        margin-bottom: 0.5rem;
    }

    .progress-fill {
        height: 100%;
        background-color: rgba(52, 199, 89, 0.8);
        transition: width 0.3s ease;
    }

    .progress-text {
        text-align: center;
        font-size: 0.85rem;
        color: rgba(0, 0, 0, 0.6);
    }

    .insufficient {
        color: rgb(168, 36, 28);
    }

    /* Responsive styles */
    @media (max-width: 480px) {
        .recipe-stats {
            gap: 0.8rem;
        }
        
        .recipe-stat {
            flex-direction: column;
            gap: 0.2rem;
        }
        
        .stat-label {
            width: auto;
        }
    }
</style>
