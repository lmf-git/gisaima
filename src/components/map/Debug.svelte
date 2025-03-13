<script>
  import { mapState, getEntitiesInChunk, getChunkCoordinates, forceLoadChunk, scanEntityData, getRawChunkData, inspectTile, logAllEntities, detectStructureFormat } from "../../lib/stores/map.js";
  
  // Toggle debug visibility
  let visible = $state(false);
  let manualChunkKey = $state("0,0");
  let showRawData = $state(false);
  let scanResults = $state(null);
  let tileX = $state(0);
  let tileY = $state(0);

  // Remove the effect that was calling checkForTestData
  // This eliminates the root subscription
  
  // Toggle debug panel
  function toggleDebug() {
    visible = !visible;
  }

  // Handle manual entity scan
  function handleScanEntities() {
    scanResults = scanEntityData();
  }
  
  // Handle manual tile inspection
  function handleInspectTile() {
    inspectTile(manualChunkKey, parseInt(tileX), parseInt(tileY));
  }

  // Get active chunk details - updated to use singular structure
  function getChunkDetails(chunkKey) {
    const entities = getEntitiesInChunk(chunkKey);
    const bounds = getChunkCoordinates(chunkKey);
    const rawData = getRawChunkData(chunkKey);
    
    return {
      key: chunkKey,
      entities,
      bounds,
      rawData,
      structureCount: Object.keys(entities.structure).length, // Changed from structures to structure
      groupCount: Object.keys(entities.groups).length,
      playerCount: Object.keys(entities.players).length,
      hasEntities: Object.keys(entities.structure).length > 0 || // Changed from structures to structure
                  Object.keys(entities.groups).length > 0 || 
                  Object.keys(entities.players).length > 0
    };
  }

  // Format tile coordinates from location key
  function formatTileLocation(locationKey) {
    return locationKey; // Already in "x,y" format
  }

  // Handle manual chunk loading for testing
  function handleManualChunkLoad() {
    forceLoadChunk(manualChunkKey);
  }
  
  // Toggle raw data display
  function toggleRawData() {
    showRawData = !showRawData;
  }

  // Add function to check specific location without using debugCheckEntityAt - updated to use singular structure
  function checkSpecificLocation() {
    const x = parseInt(tileX);
    const y = parseInt(tileY);
    const locationKey = `${x},${y}`;
    const state = $mapState;
    
    const hasStructure = !!state.entities.structure[locationKey]; // Changed from structures to structure
    const hasUnitGroup = !!state.entities.groups[locationKey];
    const hasPlayer = !!state.entities.players[locationKey];
    const hasEntity = hasStructure || hasUnitGroup || hasPlayer;
    
    console.log(`Location check for (${x},${y}):`);
    console.log(` - Structure: ${hasStructure ? 'Present' : 'None'}`);
    console.log(` - Unit Group: ${hasUnitGroup ? 'Present' : 'None'}`);
    console.log(` - Player: ${hasPlayer ? 'Present' : 'None'}`);
    console.log(`Result: ${hasEntity ? 'Has entities' : 'No entities'}`);
  }

  // Add a new function to help debug entity data
  function handleDebugEntities() {
    logAllEntities();
  }

  // Add button to detect structure format
  function handleDetectFormat() {
    detectStructureFormat();
  }
</script>

{#if $mapState.isReady}
    <div class="debug-toggle" onclick={toggleDebug}>
      <h3>Firebase Test Data</h3>
      {#if $mapState.entities.test !== null && $mapState.entities.test !== undefined}
        <div class="test-data">
          <p>Test value: <strong>{JSON.stringify($mapState.entities.test)}</strong></p>
        </div>
      {:else}
        <p class="no-data">No test data found in Firebase</p>
      {/if}
      
      <div class="manual-chunk-load">
        <h4>Manual Controls</h4>
        <div class="input-row">
          <input type="text" bind:value={manualChunkKey} placeholder="0,0" />
          <button onclick={handleManualChunkLoad}>Load Chunk</button>
        </div>
        <div class="input-row">
          <input type="number" bind:value={tileX} placeholder="Tile X" />
          <input type="number" bind:value={tileY} placeholder="Tile Y" />
          <button onclick={handleInspectTile}>Inspect Tile</button>
          <button onclick={checkSpecificLocation} class="check-button">Check Location</button>
        </div>
        <div class="button-row">
          <button class="scan-button" onclick={handleScanEntities}>Scan Entities</button>
          <button class="toggle-button" onclick={toggleRawData}>
            {showRawData ? 'Hide Raw Data' : 'Show Raw Data'}
          </button>
          <!-- Add new debug button -->
          <button class="debug-button" onclick={handleDebugEntities}>Debug Entities</button>
          <button class="debug-button" onclick={handleDetectFormat}>Detect Format</button>
        </div>
        
        {#if scanResults}
          <div class="scan-results">
            <p>Entity scan found: 
              <strong>{scanResults.structures}</strong> structures, 
              <strong>{scanResults.groups}</strong> unit groups, 
              <strong>{scanResults.players}</strong> players
            </p>
          </div>
        {/if}
      </div>
      
      <h3>Active Chunks (Loaded: {$mapState.chunks.size})</h3>
      
      <!-- Chunk visualization grid -->
      <div class="chunk-grid">
        {#each [...$mapState.chunks] as chunkKey}
          {@const chunkData = getChunkDetails(chunkKey)}
          <div class="chunk-cell" class:has-entities={chunkData.hasEntities} title={`Chunk ${chunkKey} - Contains ${chunkData.structureCount + chunkData.groupCount + chunkData.playerCount} entities`}>
            {chunkKey}
            <span class="entity-count">{chunkData.structureCount + chunkData.groupCount + chunkData.playerCount}</span>
          </div>
        {/each}
      </div>
      
      <p class="chunk-help">Each chunk contains tiles within a 20x20 area. Chunk "0,0" contains tiles from (0,0) to (19,19).</p>
      
      <!-- Chunk Details -->
      <div class="accordion-container">
        {#each [...$mapState.chunks] as chunkKey}
          {@const chunkData = getChunkDetails(chunkKey)}
          <details class="accordion" class:has-entities={chunkData.hasEntities}>
            <summary>
              <strong>Chunk {chunkKey}</strong> - Contains tiles ({chunkData.bounds.minX},{chunkData.bounds.minY}) to ({chunkData.bounds.maxX},{chunkData.bounds.maxY})
              {#if chunkData.hasEntities}
                <span class="entity-tag">{chunkData.structureCount + chunkData.groupCount + chunkData.playerCount} entities</span>
              {/if}
            </summary>
            
            <div class="chunk-data">
              <!-- Raw data section -->
              {#if showRawData && chunkData.rawData}
                <div class="raw-data">
                  <h5>Raw Data from Firebase</h5>
                  <pre>{JSON.stringify(chunkData.rawData, null, 2)}</pre>
                </div>
              {/if}
            
              {#if chunkData.structureCount > 0}
                <h5>Structures ({chunkData.structureCount})</h5>
                <ul class="entity-list">
                  {#each Object.entries(chunkData.entities.structure) as [locationKey, structure]}
                    <li>
                      <strong>Tile {locationKey}</strong>: {structure.type} ({structure.name}) - Level {structure.level}
                    </li>
                  {/each}
                </ul>
              {/if}
              
              {#if chunkData.groupCount > 0}
                <h5>Unit Groups ({chunkData.groupCount})</h5>
                <ul class="entity-list">
                  {#each Object.entries(chunkData.entities.groups) as [locationKey, group]}
                    <li>
                      <strong>Tile {formatTileLocation(locationKey)}</strong>: {group.type} ({group.units} units)
                    </li>
                  {/each}
                </ul>
              {/if}
              
              {#if chunkData.playerCount > 0}
                <h5>Players ({chunkData.playerCount})</h5>
                <ul class="entity-list">
                  {#each Object.entries(chunkData.entities.players) as [locationKey, player]}
                    <li>
                      <strong>Tile {formatTileLocation(locationKey)}</strong>: {player.displayName}
                    </li>
                  {/each}
                </ul>
              {/if}
              
              {#if !chunkData.hasEntities}
                <p class="empty-chunk">No entities in this chunk</p>
              {/if}
            </div>
          </details>
        {/each}
      </div>
      
      <h3>Entity Summary</h3>
      <p>Structures: {Object.keys($mapState.entities.structure).length}</p> <!-- Changed from structures to structure -->
      <p>Unit groups: {Object.keys($mapState.entities.groups).length}</p>
      <p>Players: {Object.keys($mapState.entities.players).length}</p>
      
      <h4>Structure Details:</h4>
      <ul class="entity-list">
        {#each Object.entries($mapState.entities.structure) as [locationKey, structure]} <!-- Changed from structures to structure -->
          <li>
            <strong>Tile {locationKey}</strong>: {structure.type} ({structure.name}) - Level {structure.level}
          </li>
        {/each}
      </ul>
      
      <h4>Unit Groups:</h4>
      <ul class="entity-list">
        {#each Object.entries($mapState.entities.groups) as [locationKey, group]}
          <li>
            <strong>Tile {locationKey}</strong>: {group.type} ({group.units} units)
          </li>
        {/each}
      </ul>
      
      <h4>Players:</h4>
      <ul class="entity-list">
        {#each Object.entries($mapState.entities.players) as [locationKey, player]}
          <li>
            <strong>Tile {locationKey}</strong>: {player.displayName}
          </li>
        {/each}
      </ul>
    </div>
{/if}


<style>
  .debug-toggle {
    position: absolute;
    bottom: 2em;
    right: 2em;
    z-index: 2000;
    background: rgba(50, 50, 50, 0.8);
    color: #fff;
    border: none;
    padding: 0.5em 1em;
    border-radius: 0.3em;
    cursor: pointer;
    font-family: monospace;
    font-size: 0.9em;
  }
  
  .debug-panel {
    position: absolute;
    bottom: 4.5em;
    right: 2em;
    width: 28em;
    max-height: 65vh;
    overflow-y: auto;
    background: rgba(10, 10, 10, 0.9);
    color: #fff;
    padding: 1em;
    border-radius: 0.3em;
    z-index: 1999;
    font-family: monospace;
    font-size: 0.8em;
    box-shadow: 0 0 1em rgba(0, 0, 0, 0.5);
    border: 1px solid #444;
  }
  
  h3, h4, h5 {
    margin-top: 0.5em;
    margin-bottom: 0.5em;
    color: #8ff;
  }
  
  p {
    margin: 0.3em 0;
  }
  
  ul {
    padding-left: 1em;
    margin: 0.3em 0 1em 0;
  }
  
  .entity-list {
    max-height: 10em;
    overflow-y: auto;
    border: 1px solid #444;
    padding: 0.5em;
    background: rgba(30, 30, 30, 0.6);
  }
  
  li {
    margin-bottom: 0.3em;
  }
  
  /* Chunk visualization styles */
  .chunk-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
    margin: 0.5em 0 1em 0;
  }
  
  .chunk-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    width: 5em;
    height: 3em;
    background: rgba(40, 60, 100, 0.6);
    border: 1px solid #558;
    border-radius: 0.3em;
    font-size: 0.85em;
    color: #adf;
    cursor: help;
  }
  
  .chunk-cell.has-entities {
    background: rgba(60, 100, 60, 0.7);
    border-color: #6a6;
    color: #dfd;
  }
  
  .entity-count {
    position: absolute;
    top: 0.2em;
    right: 0.2em;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    width: 1.2em;
    height: 1.2em;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8em;
  }
  
  .chunk-help {
    font-size: 0.8em;
    font-style: italic;
    opacity: 0.7;
    margin-bottom: 1em;
  }
  
  /* Accordion styles */
  .accordion-container {
    margin: 1em 0;
  }
  
  .accordion {
    background: rgba(30, 40, 50, 0.6);
    border: 1px solid #556;
    border-radius: 0.3em;
    margin-bottom: 0.5em;
  }
  
  .accordion.has-entities {
    border-color: #6a6;
  }
  
  .accordion summary {
    padding: 0.5em;
    cursor: pointer;
    user-select: none;
    position: relative;
  }
  
  .accordion summary:hover {
    background: rgba(50, 60, 70, 0.6);
  }
  
  .entity-tag {
    display: inline-block;
    background: rgba(100, 200, 100, 0.3);
    color: #dfd;
    padding: 0.1em 0.4em;
    border-radius: 0.2em;
    font-size: 0.8em;
    margin-left: 0.5em;
  }
  
  .chunk-data {
    padding: 0.5em;
    background: rgba(20, 30, 40, 0.6);
  }
  
  .empty-chunk {
    color: #999;
    font-style: italic;
    text-align: center;
    padding: 0.5em;
  }

  /* New styles */
  .test-data {
    background: rgba(20, 120, 40, 0.2);
    border: 1px solid rgba(20, 150, 40, 0.5);
    padding: 0.5em;
    margin-bottom: 1em;
    border-radius: 0.3em;
  }
  
  .no-data {
    color: #f99;
    font-style: italic;
  }
  
  .manual-chunk-load {
    margin: 1em 0;
    background: rgba(50, 50, 80, 0.3);
    padding: 0.5em;
    border-radius: 0.3em;
  }
  
  .input-row {
    display: flex;
    gap: 0.5em;
    margin-top: 0.5em;
  }
  
  .input-row input {
    flex-grow: 1;
    background: rgba(30, 30, 40, 0.8);
    color: white;
    border: 1px solid #558;
    padding: 0.3em;
    border-radius: 0.2em;
  }
  
  .input-row button {
    background: rgba(40, 60, 120, 0.8);
    color: white;
    border: none;
    padding: 0.3em 0.6em;
    border-radius: 0.2em;
    cursor: pointer;
  }
  
  .input-row button:hover {
    background: rgba(50, 80, 150, 0.8);
  }

  .button-row {
    display: flex;
    gap: 0.5em;
    margin-top: 0.5em;
  }
  
  .scan-button, .toggle-button {
    flex: 1;
    background: rgba(40, 60, 120, 0.8);
    color: white;
    border: none;
    padding: 0.3em;
    border-radius: 0.2em;
    cursor: pointer;
    font-size: 0.9em;
  }
  
  .scan-button {
    background: rgba(60, 100, 60, 0.8);
  }
  
  .scan-button:hover {
    background: rgba(70, 120, 70, 0.8);
  }
  
  .toggle-button:hover {
    background: rgba(50, 80, 150, 0.8);
  }
  
  .scan-results {
    margin-top: 0.5em;
    padding: 0.5em;
    background: rgba(40, 70, 40, 0.3);
    border-radius: 0.2em;
  }
  
  .raw-data {
    margin: 0.5em 0;
    padding: 0.5em;
    background: rgba(30, 30, 40, 0.6);
    border-radius: 0.2em;
  }
  
  .raw-data pre {
    max-height: 15em;
    overflow: auto;
    font-size: 0.85em;
    white-space: pre-wrap;
    word-break: break-all;
    color: #bbb;
    background: rgba(20, 20, 25, 0.6);
    padding: 0.5em;
    border-radius: 0.2em;
  }

  /* Add styles for new tile inspection inputs */
  input[type="number"] {
    width: 4em;
    flex-grow: 0;
    background: rgba(30, 30, 40, 0.8);
    color: white;
    border: 1px solid #558;
    padding: 0.3em;
    border-radius: 0.2em;
  }

  .check-button {
    background: rgba(100, 70, 150, 0.8);
    color: white;
    border: none;
    padding: 0.3em 0.6em;
    border-radius: 0.2em;
    cursor: pointer;
    font-size: 0.8em;
  }
  
  .check-button:hover {
    background: rgba(120, 90, 170, 0.8);
  }

  .debug-button {
    background: rgba(80, 80, 140, 0.8);
    color: white;
    border: none;
    padding: 0.3em 0.6em;
    border-radius: 0.2em;
    cursor: pointer;
    font-size: 0.8em;
    margin-left: 0.5em;
  }
  
  .debug-button:hover {
    background: rgba(100, 100, 170, 0.8);
  }
</style>
