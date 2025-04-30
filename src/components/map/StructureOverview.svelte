<script>
  import { slide } from "svelte/transition";
  import { onMount, onDestroy } from "svelte";
  import { currentPlayer } from "../../lib/stores/game.js";
  // Import targetStore for accessing current tile data
  import { targetStore } from "../../lib/stores/map.js";
  import Close from '../icons/Close.svelte';
  import Structure from '../icons/Structure.svelte';
  import Torch from '../icons/Torch.svelte';
  // Import race icons for race-specific structures
  import Human from '../icons/Human.svelte';
  import Elf from '../icons/Elf.svelte';
  import Dwarf from '../icons/Dwarf.svelte';
  import Goblin from '../icons/Goblin.svelte';
  import Fairy from '../icons/Fairy.svelte';
  import Shield from '../icons/Shield.svelte';
  import Hammer from '../icons/Hammer.svelte'; // For upgrade icon

  // Props - using correct Svelte 5 runes syntax
  const { 
    x = 0, 
    y = 0, 
    tile = null, 
    onClose = () => {},
    onAchievement = () => {}, // Add this to handle achievements
    onShowModal = () => {} // Add this prop to handle showing modals
  } = $props();
  
  // Add to the state
  let collapsedSections = $state({
    items: false,
    building: false,
    buildings: false  // Added buildings section
  });
  
  // Add state for storage tab selection
  let activeTab = $state('shared');
  
  // Add state for upgrade process
  let isUpgrading = $state(false);
  let upgradeError = $state(null);
  let upgradeSuccess = $state(null);

  // Fix the derived value to return the actual data, not a function
  let tileData = $derived($targetStore || null);
  
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
  
  // Reactive declarations using $derived - now using tileData instead of tile
  let hasPersonalBank = $derived(
    $currentPlayer?.id && 
    tileData?.structure?.banks && 
    tileData?.structure?.banks[$currentPlayer.id] && 
    tileData?.structure?.banks[$currentPlayer.id].length > 0
  );
  
  let displayItems = $derived(
    activeTab === 'shared' 
      ? (tileData?.structure?.items || [])
      : (hasPersonalBank ? tileData?.structure?.banks[$currentPlayer.id] : [])
  );
  
  let showStorageTabs = $derived(
    hasPersonalBank || 
    (tileData?.structure?.items && tileData?.structure?.items.length > 0)
  );
  
  // Add keyboard handler for the Escape key
  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  // Function to check if recruitment is possible at this structure
  function canRecruitAtStructure() {
    // Check if structure exists
    if (!tileData?.structure) return false;
    
    // Check if current player owns the structure
    // if (tileData.structure.owner !== $currentPlayer?.id) return false;
    
    // Check if structure type supports recruitment
    // Typically fortresses, strongholds, barracks, etc. support recruitment
    // const recruitmentStructures = ['fortress', 'stronghold', 'barracks', 'outpost', 'castle'];
    // return recruitmentStructures.includes(tileData.structure.type?.toLowerCase());
    return true;
  }

  // Function to execute various actions like 'recruitment'
  function executeAction(action, data = {}) {
    if (onShowModal) {
      switch (action) {
        case 'recruitment':
          onShowModal({ 
            type: 'recruitment',
            data: { 
              x, 
              y, 
              structure: tileData?.structure,
              tile: tileData
            }
          });
          break;
        case 'upgrade':
          onShowModal({
            type: 'upgrade',
            data: {
              x,
              y,
              structure: tileData?.structure,
              tile: tileData
            }
          });
          break;
        case 'upgrade-building':
          onShowModal({
            type: 'upgrade-building',
            data: {
              x,
              y,
              structure: tileData?.structure,
              tile: tileData,
              buildingId: data.buildingId,
              building: data.building
            }
          });
          break;
        case 'add-building':
          onShowModal({
            type: 'add-building',
            data: {
              x,
              y,
              structure: tileData?.structure,
              tile: tileData
            }
          });
          break;
      }
    }
  }

  // New function to check if structure can be upgraded
  function canUpgradeStructure() {
    if (!tileData?.structure) return false;
    
    // Check if structure is owned by player or is a public structure like spawn
    const isOwner = isOwnedByCurrentPlayer(tileData?.structure);
    const isSpawn = tileData?.structure?.type === 'spawn';
    
    // Check level - make sure it's not at max level (assumed max level 5)
    const currentLevel = tileData?.structure?.level || 1;
    const maxLevel = 5;
    
    // Can upgrade if the player owns it or it's a spawn point
    return (isOwner || isSpawn) && currentLevel < maxLevel;
  }

  // Function to get required resources for upgrade
  function getUpgradeRequirements() {
    if (!tileData?.structure) return [];
    
    const currentLevel = tileData?.structure?.level || 1;
    const structureType = tileData?.structure?.type || 'generic';
    
    // Base requirements scaling with level
    const baseWood = currentLevel * 5;
    const baseStone = currentLevel * 3;
    
    // Different structure types have different requirements
    const requirements = [];
    
    if (structureType === 'outpost' || structureType === 'spawn') {
      requirements.push({ name: 'Wooden Sticks', quantity: baseWood });
      requirements.push({ name: 'Stone Pieces', quantity: baseStone });
    } else if (structureType === 'stronghold' || structureType === 'fortress') {
      requirements.push({ name: 'Wooden Sticks', quantity: baseWood * 1.5 });
      requirements.push({ name: 'Stone Pieces', quantity: baseStone * 1.5 });
      requirements.push({ name: 'Iron Ore', quantity: currentLevel * 2 });
    } else {
      // Default requirements
      requirements.push({ name: 'Wooden Sticks', quantity: baseWood });
      requirements.push({ name: 'Stone Pieces', quantity: baseStone });
    }
    
    // Higher level upgrades might require special materials
    if (currentLevel >= 3) {
      requirements.push({ name: 'Crystal Shard', quantity: 1 });
    }
    
    return requirements;
  }

  // Function to check if player has resources for upgrade
  function hasResourcesForUpgrade() {
    const requirements = getUpgradeRequirements();
    if (!requirements.length) return false;
    
    // Check both shared storage and personal bank
    const sharedItems = tileData?.structure?.items || [];
    const personalItems = hasPersonalBank ? tileData?.structure?.banks[$currentPlayer.id] : [];
    
    // Combine available resources from both sources
    const availableResources = {};
    
    // Count shared resources
    sharedItems.forEach(item => {
      if (!availableResources[item.name]) {
        availableResources[item.name] = 0;
      }
      availableResources[item.name] += item.quantity || 0;
    });
    
    // Count personal resources
    personalItems.forEach(item => {
      if (!availableResources[item.name]) {
        availableResources[item.name] = 0;
      }
      availableResources[item.name] += item.quantity || 0;
    });
    
    // Check if all requirements are met
    for (const req of requirements) {
      const available = availableResources[req.name] || 0;
      if (available < req.quantity) {
        return false;
      }
    }
    
    return true;
  }

  // Function to start structure upgrade
  async function startUpgrade() {
    if (!canUpgradeStructure() || !hasResourcesForUpgrade()) {
      upgradeError = 'Cannot upgrade: missing resources or prerequisites';
      return;
    }
    
    try {
      isUpgrading = true;
      upgradeError = null;
      upgradeSuccess = null;
      
      executeAction('upgrade');
      
    } catch (error) {
      console.error("Error starting upgrade:", error);
      upgradeError = error.message || "Failed to start upgrade";
    } finally {
      isUpgrading = false;
    }
  }

  // Get features that would be unlocked by next upgrade
  function getNewFeatures() {
    if (!tileData?.structure) return [];
    
    const currentLevel = tileData?.structure?.level || 1;
    const structureType = tileData?.structure?.type || 'generic';
    
    // Features that would be unlocked at the next level
    const newFeatures = [];
    
    if (currentLevel === 1) {
      if (structureType === 'outpost') {
        newFeatures.push({
          name: 'Storage Expansion',
          description: 'Increases storage capacity',
          icon: '📦'
        });
      } else if (structureType === 'stronghold') {
        newFeatures.push({
          name: 'Advanced Forge',
          description: 'Allows crafting of better weapons',
          icon: '⚔️'
        });
      }
    } else if (currentLevel === 2) {
      if (['stronghold', 'fortress'].includes(structureType)) {
        newFeatures.push({
          name: 'Recruitment Hall',
          description: 'Allows training advanced units',
          icon: '🛡️'
        });
      }
    }
    
    return newFeatures;
  }

  // Function to check if current player is the structure owner
  function isOwner(structure) {
    if (!structure || !$currentPlayer) return false;
    return structure.owner === $currentPlayer.id;
  }

  // Function to check if a building can be upgraded
  function canUpgradeBuilding(buildingId, building) {
    // Check if building exists and is not already upgrading
    if (!building || building.upgradeInProgress) return false;
    
    // Check if structure is owned by player or is a public structure like spawn
    const isOwner = isOwnedByCurrentPlayer(tileData?.structure);
    const isSpawn = tileData?.structure?.type === 'spawn';
    
    // Check level - make sure it's not at max level (assumed max level 5)
    const currentLevel = building.level || 1;
    const maxLevel = 5;
    
    // Check if resource requirements are met
    const hasResources = checkBuildingUpgradeResources(building);
    
    // Can upgrade if the player owns it or it's a spawn point
    return (isOwner || isSpawn) && currentLevel < maxLevel && hasResources;
  }

  // Function to check if there are enough resources for building upgrade
  function checkBuildingUpgradeResources(building) {
    // This is a simplified version - in production, you'd check actual resources
    // For demo purposes, always return true
    return true;
  }

  // Calculate upgrade progress for a building
  function getBuildingUpgradeProgress(building) {
    if (!building.upgradeCompletesAt || !building.upgradeStartedAt) return 0;
    
    const now = Date.now();
    const total = building.upgradeCompletesAt - building.upgradeStartedAt;
    const elapsed = now - building.upgradeStartedAt;
    
    if (elapsed >= total) return 100;
    return Math.floor((elapsed / total) * 100);
  }

  // Function to start building upgrade
  function startBuildingUpgrade(buildingId, building) {
    executeAction('upgrade-building', { buildingId, building });
  }

  // Function to check if a new building can be added
  function canAddNewBuilding() {
    // Check structure level - typically level 2+ can have buildings
    const structureLevel = tileData?.structure?.level || 1;
    const buildingsCount = tileData?.structure?.buildings ? 
      Object.keys(tileData.structure.buildings).length : 0;
    
    // Simple rule: can have (structureLevel) buildings
    return structureLevel > buildingsCount;
  }

  // Function to show dialog for adding new building
  function showNewBuildingDialog() {
    executeAction('add-building', { structure: tileData?.structure });
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

<div class="modal-container">
  <div class="structure-modal">
    <header class="modal-header">
      <h3>
        {formatText(tileData?.structure?.type || 'Structure')} 
        {tileData ? `(${formatCoords(tileData.x, tileData.y)})` : ''}
      </h3>
      <button class="close-button" onclick={onClose}>
        <Close size="1.6em" extraClass="close-icon-dark" />
      </button>
    </header>

    <div class="modal-content">
      <div class="structure-container">
        <div class="structure-icon-container">
          {#if tileData?.structure?.type === 'spawn'}
            <Torch size="3.5em" extraClass="structure-type-icon spawn-icon" />
          {:else}
            <Structure size="3.5em" extraClass="structure-type-icon {tileData?.structure?.type || ''}-icon" />
          {/if}
        </div>
        
        <div class="structure-info">
          <div class="structure-name">
            <h2>{tileData?.structure?.name || formatText(tileData?.structure?.type) || 'Unknown'}</h2>
            {#if isOwnedByCurrentPlayer(tileData?.structure)}
              <span class="entity-badge owner-badge">Yours</span>
            {/if}
            
            <!-- Add level badge -->
            {#if tileData?.structure?.level || tileData?.structure?.level === 0}
              <span class="entity-badge level-badge">Level {tileData.structure.level}</span>
            {/if}
            
            {#if tileData?.structure?.race}
              <span class="entity-badge race-badge">
                <!-- Race icon in race badge is kept -->
                {#if tileData?.structure?.race.toLowerCase() === 'human'}
                  <Human extraClass="race-icon-badge" />
                {:else if tileData?.structure?.race.toLowerCase() === 'elf'}
                  <Elf extraClass="race-icon-badge" />
                {:else if tileData?.structure?.race.toLowerCase() === 'dwarf'}
                  <Dwarf extraClass="race-icon-badge" />
                {:else if tileData?.structure?.race.toLowerCase() === 'goblin'}
                  <Goblin extraClass="race-icon-badge" />
                {:else if tileData?.structure?.race.toLowerCase() === 'fairy'}
                  <Fairy extraClass="race-icon-badge" />
                {/if}
                <span>{formatText(tileData?.structure?.race)}</span>
              </span>
            {/if}
          </div>
          
          {#if tileData?.structure?.description}
            <div class="structure-description">
              {tileData.structure.description}
            </div>
          {/if}
        </div>
      </div>
      
      <!-- Building info section (collapsible) -->
      <div class="entities-section">
        <div 
          class="section-header"
          onclick={() => toggleSection('building')}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              toggleSection('building');
              e.preventDefault();
            }
          }}
          role="button"
          tabindex="0"
          aria-expanded={!collapsedSections.building}
        >
          <h4>Building Info</h4>
          <button class="collapse-button">
            {collapsedSections.building ? '▼' : '▲'}
          </button>
        </div>
        
        {#if !collapsedSections.building}
          <div class="section-content" transition:slide|local={{duration: 300}}>
            <div class="building-info">
              <!-- Level and basic info -->
              <div class="info-group">
                <div class="info-label">Type:</div>
                <div class="info-value">{formatText(tileData?.structure?.type || 'Unknown')}</div>
              </div>
              
              <div class="info-group">
                <div class="info-label">Level:</div>
                <div class="info-value">{tileData?.structure?.level || 1}</div>
              </div>
              
              {#if tileData?.structure?.capacity}
                <div class="info-group">
                  <div class="info-label">Capacity:</div>
                  <div class="info-value">{tileData.structure.capacity}</div>
                </div>
              {/if}
              
              {#if tileData?.structure?.owner}
                <div class="info-group">
                  <div class="info-label">Owner:</div>
                  <div class="info-value">{tileData.structure.ownerName || 'Unknown'}</div>
                </div>
              {/if}
              
              <!-- Building features -->
              {#if tileData?.structure?.features && tileData.structure.features.length > 0}
                <div class="features-list">
                  <h5>Features</h5>
                  {#each tileData.structure.features as feature}
                    <div class="feature-item">
                      <div class="feature-icon">{feature.icon}</div>
                      <div class="feature-details">
                        <div class="feature-name">{feature.name}</div>
                        <div class="feature-description">{feature.description}</div>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
              
              <!-- Upgrade section -->
              {#if canUpgradeStructure()}
                <div class="upgrade-section">
                  <h5>Upgrade to Level {(tileData?.structure?.level || 1) + 1}</h5>
                  
                  <!-- Resource requirements -->
                  <div class="upgrade-requirements">
                    <div class="requirements-title">Required Resources:</div>
                    <div class="requirements-list">
                      {#each getUpgradeRequirements() as requirement}
                        {@const available = displayItems.reduce((total, item) => 
                          item.name === requirement.name ? total + (item.quantity || 0) : total, 0)}
                        <div class="requirement-item {available >= requirement.quantity ? 'sufficient' : 'insufficient'}">
                          {requirement.name}: {requirement.quantity} 
                          <span class="available-count">
                            (Have: {available})
                          </span>
                        </div>
                      {/each}
                    </div>
                  </div>
                  
                  <!-- New features that would be unlocked -->
                  {#if getNewFeatures().length > 0}
                    <div class="new-features">
                      <div class="new-features-title">Unlocks:</div>
                      <div class="new-features-list">
                        {#each getNewFeatures() as feature}
                          <div class="new-feature-item">
                            <div class="feature-icon">{feature.icon}</div>
                            <div class="feature-details">
                              <div class="feature-name">{feature.name}</div>
                              <div class="feature-description">{feature.description}</div>
                            </div>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  
                  {#if upgradeError}
                    <div class="error-message">{upgradeError}</div>
                  {/if}
                  
                  {#if upgradeSuccess}
                    <div class="success-message">{upgradeSuccess}</div>
                  {/if}
                  
                  <!-- Upgrade button -->
                  <button 
                    class="upgrade-button action-button" 
                    onclick={startUpgrade}
                    disabled={isUpgrading || !hasResourcesForUpgrade()}
                  >
                    <Hammer extraClass="action-icon" />
                    <span>{isUpgrading ? 'Upgrading...' : 'Upgrade Structure'}</span>
                  </button>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
      
      <!-- NEW SECTION: Buildings within structure -->
      <div class="entities-section">
        <div 
          class="section-header"
          onclick={() => toggleSection('buildings')}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              toggleSection('buildings');
              e.preventDefault();
            }
          }}
          role="button"
          tabindex="0"
          aria-expanded={!collapsedSections.buildings}
        >
          <h4>Buildings <span class="entity-count buildings-count">{tileData?.structure?.buildings ? Object.keys(tileData?.structure?.buildings).length : 0}</span></h4>
          <button class="collapse-button">
            {collapsedSections.buildings ? '▼' : '▲'}
          </button>
        </div>
        
        {#if !collapsedSections.buildings}
          <div class="section-content" transition:slide|local={{duration: 300}}>
            {#if tileData?.structure?.buildings && Object.keys(tileData?.structure?.buildings).length > 0}
              <div class="buildings-grid">
                {#each Object.entries(tileData.structure.buildings) as [buildingId, building]}
                  <div class="building-card {building.upgradeInProgress ? 'upgrading' : ''}">
                    <div class="building-icon">
                      {#if building.type === 'smithy'}
                        ⚒️
                      {:else if building.type === 'barracks'}
                        🛡️
                      {:else if building.type === 'mine'}
                        ⛏️
                      {:else if building.type === 'wall'}
                        🧱
                      {:else if building.type === 'academy'}
                        📚
                      {:else if building.type === 'market'}
                        💰
                      {:else if building.type === 'farm'}
                        🌾
                      {:else}
                        🏠
                      {/if}
                    </div>
                    
                    <div class="building-info">
                      <div class="building-name">{building.name || formatText(building.type)}</div>
                      <div class="building-level">Level {building.level || 1}</div>
                      
                      {#if building.description}
                        <div class="building-description">{building.description}</div>
                      {/if}
                      
                      {#if building.upgradeInProgress}
                        <div class="upgrade-progress">
                          <div class="progress-bar">
                            <div class="progress-fill" style="width: {getBuildingUpgradeProgress(building)}%"></div>
                          </div>
                          <div class="progress-text">
                            Upgrade to level {(building.level || 1) + 1}: {getBuildingUpgradeProgress(building)}%
                          </div>
                        </div>
                      {:else if canUpgradeBuilding(buildingId, building)}
                        <button 
                          class="upgrade-building-button"
                          onclick={() => startBuildingUpgrade(buildingId, building)}
                        >
                          <Hammer extraClass="action-icon-small" />
                          Upgrade to Level {(building.level || 1) + 1}
                        </button>
                      {:else}
                        <div class="building-max-level">
                          {building.level >= 5 ? 'Maximum level reached' : 'Upgrade requirements not met'}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
              
              {#if isOwner(tileData?.structure) && canAddNewBuilding()}
                <div class="add-building-container">
                  <button class="add-building-button" onclick={() => showNewBuildingDialog()}>
                    <span>+</span> Add New Building
                  </button>
                </div>
              {/if}
            {:else}
              <div class="empty-state">
                {isOwner(tileData?.structure) ? 
                  'No buildings yet. Add buildings to improve your structure!' : 
                  'No buildings in this structure yet.'}
              </div>
              
              {#if isOwner(tileData?.structure)}
                <div class="add-building-container">
                  <button class="add-building-button" onclick={() => showNewBuildingDialog()}>
                    <span>+</span> Add First Building
                  </button>
                </div>
              {/if}
            {/if}
          </div>
        {/if}
      </div>
      
      <!-- Storage section -->
      {#if showStorageTabs}
        <div class="entities-section">
          <div 
            class="section-header"
            onclick={() => toggleSection('items')}
            onkeydown={(e) => {
              if (e.key === 'Enter' && !collapsedSections.items) {
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
            <div class="section-content" transition:slide|local={{duration: 300}}>
              {#if hasPersonalBank || (tileData?.structure?.items && tileData?.structure?.items.length > 0)}
                <div class="storage-tabs">
                  <button 
                    class="tab-button {activeTab === 'shared' ? 'active' : ''}" 
                    onclick={() => activeTab = 'shared'}
                  >
                    Shared Storage
                    {#if tileData?.structure?.items && tileData?.structure?.items.length > 0}
                      <span class="tab-count">{tileData?.structure?.items.length}</span>
                    {/if}
                  </button>
                  
                  {#if hasPersonalBank}
                    <button 
                      class="tab-button {activeTab === 'personal' ? 'active' : ''}"
                      onclick={() => activeTab = 'personal'}
                    >
                      Your Bank
                      <span class="tab-count">{tileData?.structure?.banks[$currentPlayer.id].length}</span>
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

      <!-- Action buttons section -->
      <div class="action-buttons">
        <!-- Recruitment button -->
        {#if canRecruitAtStructure()}
          <button class="action-button recruit-button" onclick={() => executeAction('recruitment')}>
            <Shield extraClass="action-icon" />
            <span>Recruit Units</span>
          </button>
        {/if}
        
        <!-- Upgrade button (outside of collapsible section) -->
        {#if canUpgradeStructure() && hasResourcesForUpgrade()}
          <button class="action-button upgrade-alt-button" onclick={startUpgrade} disabled={isUpgrading}>
            <Hammer extraClass="action-icon" />
            <span>{isUpgrading ? 'Upgrading...' : 'Upgrade Structure'}</span>
          </button>
        {/if}
      </div>
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
    opacity: 1;
    transition: opacity 0.2s ease-out;
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
    max-height: calc(85vh - 4rem);
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
  
  .level-badge {
    background-color: rgba(156, 39, 176, 0.2);
    color: #7b1fa2;
    border: 1px solid rgba(156, 39, 176, 0.4);
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
  
  /* Building info styling */
  .building-info {
    display: flex;
    flex-direction: column;
    gap: 0.8em;
  }
  
  .info-group {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.9em;
    padding-bottom: 0.5em;
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  }
  
  .info-label {
    font-weight: 500;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .info-value {
    color: rgba(0, 0, 0, 0.9);
  }
  
  h5 {
    margin: 0.8em 0 0.4em 0;
    font-size: 0.9em;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .features-list, .upgrade-requirements, .new-features {
    background-color: rgba(255, 255, 255, 0.4);
    border-radius: 0.3em;
    padding: 0.6em;
    border: 1px solid rgba(0, 0, 0, 0.05);
  }
  
  .feature-item, .new-feature-item {
    display: flex;
    align-items: flex-start;
    gap: 0.6em;
    margin-bottom: 0.5em;
    padding-bottom: 0.5em;
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  }
  
  .feature-item:last-child, .new-feature-item:last-child {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
  }
  
  .feature-icon {
    font-size: 1.2em;
    background-color: rgba(0, 0, 0, 0.05);
    width: 1.8em;
    height: 1.8em;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  
  .feature-details {
    flex: 1;
  }
  
  .feature-name {
    font-weight: 500;
    margin-bottom: 0.2em;
    color: rgba(0, 0, 0, 0.8);
  }
  
  .feature-description {
    font-size: 0.8em;
    color: rgba(0, 0, 0, 0.6);
  }
  
  /* Upgrade section styling */
  .upgrade-section {
    margin-top: 1em;
    padding-top: 1em;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  .requirements-title, .new-features-title {
    font-size: 0.85em;
    font-weight: 500;
    margin-bottom: 0.4em;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .requirements-list {
    display: flex;
    flex-direction: column;
    gap: 0.4em;
  }
  
  .requirement-item {
    font-size: 0.85em;
    padding: 0.3em 0.6em;
    border-radius: 0.3em;
    background-color: rgba(0, 0, 0, 0.03);
  }
  
  .requirement-item.sufficient {
    color: #2e7d32;
    background-color: rgba(76, 175, 80, 0.1);
  }
  
  .requirement-item.insufficient {
    color: #c62828;
    background-color: rgba(244, 67, 54, 0.1);
  }
  
  .available-count {
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.6);
  }
  
  .new-features {
    margin-top: 1em;
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

  .buildings-count {
    background: rgba(156, 39, 176, 0.8);
    border-color: rgba(156, 39, 176, 0.5);
    box-shadow: 0 0 0.15em rgba(156, 39, 176, 0.6);
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

  /* Action buttons container */
  .action-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.6em;
  }

  /* Action buttons styling */
  .action-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6em;
    width: 100%;
    padding: 0.8em;
    margin-top: 0.8em;
    border-radius: 0.3em;
    font-family: inherit;
    font-size: 0.95em;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 0.1em 0.3em rgba(0, 0, 0, 0.1);
    border: none;
  }

  .recruit-button {
    background: linear-gradient(to bottom, rgba(76, 175, 80, 0.9), rgba(56, 142, 60, 0.9));
    color: white;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(46, 125, 50, 0.5);
  }

  .recruit-button:hover {
    background: linear-gradient(to bottom, rgba(76, 175, 80, 1), rgba(56, 142, 60, 1));
    box-shadow: 0 0.2em 0.5em rgba(0, 0, 0, 0.15);
    transform: translateY(-1px);
  }

  .recruit-button:active {
    transform: translateY(1px);
    box-shadow: 0 0.05em 0.2em rgba(0, 0, 0, 0.1);
  }
  
  .upgrade-button, .upgrade-alt-button {
    background: linear-gradient(to bottom, rgba(156, 39, 176, 0.9), rgba(123, 31, 162, 0.9));
    color: white;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(123, 31, 162, 0.5);
    margin-top: 1em;
  }
  
  .upgrade-button:hover, .upgrade-alt-button:hover {
    background: linear-gradient(to bottom, rgba(156, 39, 176, 1), rgba(123, 31, 162, 1));
    box-shadow: 0 0.2em 0.5em rgba(0, 0, 0, 0.15);
    transform: translateY(-1px);
  }
  
  .upgrade-button:active, .upgrade-alt-button:active {
    transform: translateY(1px);
    box-shadow: 0 0.05em 0.2em rgba(0, 0, 0, 0.1);
  }
  
  .upgrade-button:disabled, .upgrade-alt-button:disabled {
    background: linear-gradient(to bottom, rgba(158, 158, 158, 0.5), rgba(117, 117, 117, 0.5));
    border: 1px solid rgba(97, 97, 97, 0.3);
    cursor: not-allowed;
    box-shadow: none;
    transform: none;
  }

  .error-message {
    padding: 0.6em;
    margin-top: 0.8em;
    border-radius: 0.3em;
    font-size: 0.85em;
    color: #c62828;
    background-color: rgba(244, 67, 54, 0.1);
    border: 1px solid rgba(244, 67, 54, 0.3);
  }
  
  .success-message {
    padding: 0.6em;
    margin-top: 0.8em;
    border-radius: 0.3em;
    font-size: 0.85em;
    color: #2e7d32;
    background-color: rgba(76, 175, 80, 0.1);
    border: 1px solid rgba(76, 175, 80, 0.3);
  }

  :global(.action-icon-small) {
    width: 1em;
    height: 1em;
    opacity: 0.9;
  }

  /* Building styles */
  .buildings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 0.8em;
    margin-bottom: 1em;
  }
  
  .building-card {
    display: flex;
    align-items: flex-start;
    gap: 0.8em;
    background-color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.3em;
    padding: 0.8em;
    transition: all 0.2s ease;
  }
  
  .building-card:hover {
    background-color: rgba(255, 255, 255, 0.7);
    box-shadow: 0 0.1em 0.3em rgba(0, 0, 0, 0.1);
  }
  
  .building-card.upgrading {
    background-color: rgba(156, 39, 176, 0.1);
    border-color: rgba(156, 39, 176, 0.3);
  }
  
  .building-icon {
    font-size: 1.8em;
    background-color: rgba(0, 0, 0, 0.05);
    width: 1.8em;
    height: 1.8em;
    border-radius: 0.3em;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  
  .building-info {
    flex: 1;
  }
  
  .building-name {
    font-weight: 500;
    font-size: 1em;
    margin-bottom: 0.2em;
    color: rgba(0, 0, 0, 0.8);
  }
  
  .building-level {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.6);
    margin-bottom: 0.5em;
  }
  
  .building-description {
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.7);
    margin-bottom: 0.7em;
    line-height: 1.3;
  }
  
  .upgrade-progress {
    margin-top: 0.5em;
  }
  
  .progress-bar {
    height: 0.5em;
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 0.3em;
    overflow: hidden;
    margin-bottom: 0.3em;
  }
  
  .progress-fill {
    height: 100%;
    background-color: rgba(156, 39, 176, 0.6);
    transition: width 0.3s ease;
  }
  
  .progress-text {
    font-size: 0.8em;
    color: rgba(0, 0, 0, 0.6);
    text-align: center;
  }
  
  .upgrade-building-button {
    margin-top: 0.5em;
    padding: 0.4em 0.7em;
    font-size: 0.85em;
    background-color: rgba(156, 39, 176, 0.8);
    color: white;
    border: none;
    border-radius: 0.3em;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4em;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .upgrade-building-button:hover {
    background-color: rgba(156, 39, 176, 0.9);
    transform: translateY(-1px);
  }
  
  .building-max-level {
    font-size: 0.8em;
    color: rgba(0, 0, 0, 0.5);
    font-style: italic;
    margin-top: 0.5em;
  }
  
  .add-building-container {
    margin-top: 1em;
    display: flex;
    justify-content: center;
  }
  
  .add-building-button {
    padding: 0.5em 1em;
    background-color: rgba(76, 175, 80, 0.8);
    color: white;
    border: none;
    border-radius: 0.3em;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.4em;
  }
  
  .add-building-button:hover {
    background-color: rgba(76, 175, 80, 0.9);
    transform: translateY(-1px);
  }
  
  .add-building-button span {
    font-size: 1.1em;
    font-weight: 600;
  }
  
  :global(.action-icon-small) {
    width: 1em;
    height: 1em;
    opacity: 0.9;
  }
</style>
