<script>
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Close from '../icons/Close.svelte';
  import { currentPlayer } from '../../lib/stores/game.js';
  import { coordinates } from '../../lib/stores/map.js';
  
  // Only take the minimum props needed for lookup
  const { x = 0, y = 0, onClose = () => {} } = $props();
  
  // Format text for display
  function formatText(text) {
    if (!text) return '';
    return text.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
  
  // Get rarity class name
  function getRarityClass(rarity) {
    return rarity?.toLowerCase() || 'common';
  }
  
  // Find the tile data directly from coordinates store
  const tileData = $derived(() => {
    return $coordinates.find(tile => tile.x === x && tile.y === y) || null;
  });
  
  // Get structure data directly from the found tile
  const structure = $derived(() => tileData?.structure || null);
  
  // Check if current player owns this structure
  const isOwned = $derived(structure?.owner === $currentPlayer?.uid);
  
  // Extract shared items directly - with safety checks
  const sharedItems = $derived(() => {
    if (!structure) return [];
    return Array.isArray(structure.items) ? structure.items : [];
  });
  
  // Extract personal bank items directly - with safety checks 
  const personalItems = $derived(() => {
    if (!structure || !structure.banks || !$currentPlayer?.uid) return [];
    const playerBank = structure.banks[$currentPlayer.uid];
    return Array.isArray(playerBank) ? playerBank : [];
  });
  
  // Group shared items by type - with safety check
  const groupedSharedItems = $derived(() => {
    if (!sharedItems || !sharedItems.length) return {};
    
    const grouped = {};
    for (const item of sharedItems) {
      const type = item.type || 'misc';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push({
        ...item,
        isShared: true
      });
    }
    
    return grouped;
  });
  
  // Group personal items by type - with safety check
  const groupedPersonalItems = $derived(() => {
    if (!personalItems || !personalItems.length) return {};
    
    const grouped = {};
    for (const item of personalItems) {
      const type = item.type || 'misc';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push({
        ...item,
        isPersonal: true
      });
    }
    
    return grouped;
  });
  
  // Simple derived values for item counts and flags
  const hasSharedItems = $derived(sharedItems.length > 0);
  const hasPersonalItems = $derived(personalItems.length > 0);
  
  const itemCounts = $derived({
    shared: sharedItems.length,
    personal: personalItems.length,
    total: sharedItems.length + personalItems.length
  });
  
  // Get structure capacity information
  const capacity = $derived({
    current: itemCounts.total,
    max: structure?.capacity || 100,
    percentage: Math.min(100, Math.round((itemCounts.total / (structure?.capacity || 100)) * 100))
  });
</script>

<div class="overlay" transition:fade={{ duration: 150 }}>
  <div class="structure-overview" transition:scale={{ start: 0.95, duration: 300, easing: cubicOut }}>
    <div class="header">
      <div class="header-content">
        <h2>{structure?.name || formatText(structure?.type) || "Structure"}</h2>
        <div class="location">Location: {x}, {y}</div>
      </div>
      <button class="close-btn" onclick={onClose} aria-label="Close structure overview">
        <Close size="1.5em" />
      </button>
    </div>
    
    <div class="content">
      <!-- Structure info section -->
      <div class="structure-info">
        <div class="info-row">
          <span class="info-label">Type:</span>
          <span class="info-value">{formatText(structure?.type)}</span>
        </div>
        
        {#if structure?.faction}
          <div class="info-row">
            <span class="info-label">Faction:</span>
            <span class="info-value">{formatText(structure.faction)}</span>
          </div>
        {/if}
        
        {#if structure?.owner}
          <div class="info-row">
            <span class="info-label">Owner:</span>
            <span class="info-value owner {isOwned ? 'current-player' : ''}">
              {structure.ownerName || (isOwned ? "You" : structure.owner)}
              {#if isOwned}
                <span class="owner-tag">You</span>
              {/if}
            </span>
          </div>
        {/if}
        
        <div class="info-row">
          <span class="info-label">Storage:</span>
          <div class="capacity-bar-container">
            <div class="capacity-bar" style="width: {capacity.percentage}%"></div>
            <span class="capacity-text">
              {capacity.current} / {capacity.max}
              {#if itemCounts.shared > 0 && itemCounts.personal > 0}
                ({itemCounts.shared} shared, {itemCounts.personal} personal)
              {/if}
            </span>
          </div>
        </div>
      </div>
      
      <!-- Shared Structure Items -->
      <div class="section-header">
        <h3>Shared Structure Storage</h3>
        {#if hasSharedItems}
          <span class="item-count">{itemCounts.shared} items</span>
        {/if}
      </div>
      
      {#if hasSharedItems}
        <div class="items-container">
          {#each Object.entries(groupedSharedItems) as [type, items]}
            <div class="item-group shared-items">
              <h4 class="item-group-header">{formatText(type)}</h4>
              <div class="items-grid">
                {#each items as item}
                  <div class="item {getRarityClass(item.rarity)}">
                    <div class="item-icon {item.type}"></div>
                    <div class="item-details">
                      <div class="item-name">{item.name}</div>
                      {#if item.quantity > 1}
                        <div class="item-quantity">×{item.quantity}</div>
                      {/if}
                      <div class="item-tags">
                        {#if item.rarity && item.rarity !== 'common'}
                          <div class="item-rarity-tag">{formatText(item.rarity)}</div>
                        {/if}
                        <div class="item-shared-tag">Shared</div>
                      </div>
                    </div>
                    {#if item.description}
                      <div class="item-description">{item.description}</div>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-items">
          <p>No shared items in this structure</p>
        </div>
      {/if}
      
      <!-- Personal Bank Items -->
      {#if $currentPlayer}
        <div class="section-header">
          <h3>Your Personal Bank</h3>
          {#if hasPersonalItems}
            <span class="item-count">{itemCounts.personal} items</span>
          {/if}
        </div>
        
        {#if hasPersonalItems}
          <div class="items-container">
            {#each Object.entries(groupedPersonalItems) as [type, items]}
              <div class="item-group bank-items">
                <h4 class="item-group-header">{formatText(type)}</h4>
                <div class="items-grid">
                  {#each items as item}
                    <div class="item {getRarityClass(item.rarity)} bank-item">
                      <div class="item-icon {item.type}"></div>
                      <div class="item-details">
                        <div class="item-name">{item.name}</div>
                        {#if item.quantity > 1}
                          <div class="item-quantity">×{item.quantity}</div>
                        {/if}
                        <div class="item-tags">
                          {#if item.rarity && item.rarity !== 'common'}
                            <div class="item-rarity-tag">{formatText(item.rarity)}</div>
                          {/if}
                          <div class="item-personal-tag">Personal</div>
                        </div>
                      </div>
                      {#if item.description}
                        <div class="item-description">{item.description}</div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty-items bank-empty">
            <p>Your personal bank is empty</p>
          </div>
        {/if}
      {/if}
      
      {#if structure?.features && structure.features.length > 0}
        <h3>Structure Features</h3>
        <div class="features-list">
          {#each structure.features as feature}
            <div class="feature">
              <div class="feature-icon">{feature.icon || '🏗️'}</div>
              <div class="feature-details">
                <div class="feature-name">{feature.name}</div>
                <div class="feature-description">{feature.description}</div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .structure-overview {
    background: white;
    border-radius: 0.5em;
    width: 90%;
    max-width: 30em;
    max-height: 80vh;
    box-shadow: 0 0.5em 2em rgba(0, 0, 0, 0.3);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1em;
    background: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
  }

  .header-content {
    flex: 1;
  }

  h2 {
    margin: 0;
    font-size: 1.3em;
    font-family: var(--font-heading);
    font-weight: 600;
    color: #333;
  }

  .location {
    font-size: 0.9em;
    color: #666;
    margin-top: 0.2em;
  }

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

  .content {
    padding: 1em;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1.2em;
  }

  .structure-info {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    background: #f9f9f9;
    padding: 1em;
    border-radius: 0.5em;
    border: 1px solid #eee;
  }

  .info-row {
    display: flex;
    align-items: center;
    gap: 0.8em;
  }

  .info-label {
    font-weight: bold;
    color: #555;
    min-width: 5em;
  }

  .info-value {
    color: #333;
  }

  .owner.current-player {
    color: #4285f4;
    font-weight: 500;
  }

  .owner-tag {
    background: #4285f4;
    color: white;
    font-size: 0.7em;
    padding: 0.1em 0.4em;
    border-radius: 1em;
    margin-left: 0.5em;
  }

  h3 {
    margin: 0.5em 0;
    font-size: 1.1em;
    color: #333;
    font-family: var(--font-heading);
    border-bottom: 1px solid #eee;
    padding-bottom: 0.5em;
  }

  .capacity-bar-container {
    flex: 1;
    height: 1em;
    background: #eee;
    border-radius: 0.5em;
    overflow: hidden;
    position: relative;
  }

  .capacity-bar {
    height: 100%;
    background: linear-gradient(to right, #4CAF50, #8BC34A);
    border-radius: 0.5em;
    transition: width 0.3s ease;
  }

  .capacity-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 0.8em;
    color: #333;
    text-shadow: 0 0 2px white;
  }

  .items-container {
    display: flex;
    flex-direction: column;
    gap: 1em;
  }

  .item-group {
    border: 1px solid #eee;
    border-radius: 0.5em;
    overflow: hidden;
  }

  .item-group-header {
    background: #f5f5f5;
    margin: 0;
    padding: 0.5em 1em;
    font-size: 0.9em;
    font-weight: 600;
    color: #555;
  }

  .items-grid {
    padding: 0.5em;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(10em, 1fr));
    gap: 0.5em;
  }

  .item {
    display: flex;
    align-items: center;
    padding: 0.5em;
    border: 1px solid #eee;
    border-radius: 0.3em;
    background: white;
    transition: all 0.2s;
  }

  .item:hover {
    background: #f9f9f9;
    transform: translateY(-2px);
    box-shadow: 0 3px 5px rgba(0,0,0,0.1);
  }

  .item.uncommon {
    border-color: rgba(30, 255, 0, 0.3);
  }

  .item.rare {
    border-color: rgba(0, 112, 221, 0.3);
  }

  .item.epic {
    border-color: rgba(148, 0, 211, 0.3);
  }

  .item.legendary {
    border-color: rgba(255, 165, 0, 0.3);
  }

  .item.mythic {
    border-color: rgba(255, 128, 255, 0.3);
  }

  .item-icon {
    width: 2em;
    height: 2em;
    margin-right: 0.7em;
    border-radius: 0.2em;
    background-color: rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .item-icon::before {
    content: '';
    position: absolute;
    width: 60%;
    height: 60%;
    background-color: rgba(0, 0, 0, 0.2);
  }

  .item-icon.resource::before {
    content: '♦';
    font-size: 0.9em;
    color: #228B22;
    background: none;
  }

  .item-icon.quest_item::before {
    content: '!';
    font-size: 0.9em;
    color: #FF8C00;
    background: none;
    font-weight: bold;
  }

  .item-icon.artifact::before {
    content: '★';
    font-size: 1em;
    color: #9932CC;
    background: none;
  }

  .item-icon.gem::before {
    content: '◆';
    font-size: 0.9em;
    color: #4169E1;
    background: none;
  }

  .item-icon.tool::before {
    content: '⚒';
    font-size: 0.8em;
    color: #696969;
    background: none;
  }

  .item-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.2em;
  }

  .item-name {
    font-size: 0.9em;
    font-weight: 500;
  }

  .item-quantity {
    font-size: 0.8em;
    color: #666;
  }

  .item-rarity-tag {
    font-size: 0.7em;
    padding: 0.1em 0.3em;
    border-radius: 0.2em;
    display: inline-block;
    background: #f0f0f0;
    color: #333;
  }

  .item.uncommon .item-rarity-tag {
    background: rgba(30, 255, 0, 0.15);
    color: #228B22;
  }

  .item.rare .item-rarity-tag {
    background: rgba(0, 112, 221, 0.15);
    color: #0070DD;
  }

  .item.epic .item-rarity-tag {
    background: rgba(148, 0, 211, 0.15);
    color: #9400D3;
  }

  .item.legendary .item-rarity-tag {
    background: rgba(255, 165, 0, 0.15);
    color: #FF8C00;
  }

  .item.mythic .item-rarity-tag {
    background: rgba(255, 128, 255, 0.15);
    color: #FF1493;
  }

  .item-description {
    font-size: 0.8em;
    color: #666;
    margin-top: 0.3em;
    font-style: italic;
  }

  .empty-items {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 2em;
    background: #f9f9f9;
    border-radius: 0.5em;
    border: 1px dashed #ccc;
    color: #999;
    font-style: italic;
  }

  .features-list {
    display: flex;
    flex-direction: column;
    gap: 0.8em;
  }

  .feature {
    display: flex;
    align-items: flex-start;
    padding: 0.8em;
    background: #f9f9f9;
    border-radius: 0.5em;
    border: 1px solid #eee;
  }

  .feature-icon {
    font-size: 1.5em;
    margin-right: 0.7em;
  }

  .feature-details {
    flex: 1;
  }

  .feature-name {
    font-weight: 500;
    margin-bottom: 0.3em;
  }

  .feature-description {
    font-size: 0.9em;
    color: #666;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 0.5em 0;
    border-bottom: 1px solid #eee;
    padding-bottom: 0.5em;
  }

  .section-header h3 {
    margin: 0;
    border-bottom: none;
    padding-bottom: 0;
  }

  .item-count {
    font-size: 0.85em;
    color: #666;
    background: #f0f0f0;
    padding: 0.2em 0.5em;
    border-radius: 1em;
  }

  .item-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3em;
    margin-top: 0.3em;
  }
  
  .shared-items {
    border-color: #e2f2ff;
    background-color: #f9fcff;
  }
  
  .item-shared-tag {
    font-size: 0.7em;
    padding: 0.1em 0.3em;
    border-radius: 0.2em;
    display: inline-block;
    background: #e1f5fe;
    color: #0277bd;
  }

  .item-personal-tag {
    font-size: 0.7em;
    padding: 0.1em 0.3em;
    border-radius: 0.2em;
    display: inline-block;
    background: #e8f5e9;
    color: #2e7d32;
  }
  
  .bank-empty {
    background-color: #f8f9ff;
    border-color: #e1e2ff;
  }

  @media (max-width: 480px) {
    .structure-overview {
      width: 95%;
      max-height: 85vh;
    }
    
    .items-grid {
      grid-template-columns: repeat(auto-fill, minmax(8em, 1fr));
    }
  }
</style>
