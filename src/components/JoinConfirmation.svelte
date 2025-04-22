<script>
  import Close from './icons/Close.svelte';
  import Human from './icons/Human.svelte';
  import Elf from './icons/Elf.svelte';
  import Dwarf from './icons/Dwarf.svelte';
  import Goblin from './icons/Goblin.svelte';
  import Fairy from './icons/Fairy.svelte';

  // Props for the component
  const { 
    world, 
    onClose, 
    onConfirm, 
    animatingOut = false,
    initialName = ''
  } = $props();

  // Available races with icon components mapping
  const races = [
    {
      id: 'human',
      name: 'Humans',
      description: 'Versatile and adaptable, humans excel at diplomacy and trade.',
      traits: ['Diplomatic', 'Fast Learners', 'Resource Efficient'],
      icon: Human
    },
    {
      id: 'elf',
      name: 'Elves',
      description: 'Ancient forest dwellers with deep connections to nature and magic.',
      traits: ['Magical Affinity', 'Forest Advantage', 'Long-range Combat'],
      icon: Elf
    },
    {
      id: 'dwarf',
      name: 'Dwarves',
      description: 'Sturdy mountain folk, master craftsmen and miners.',
      traits: ['Mining Bonus', 'Strong Defense', 'Mountain Advantage'],
      icon: Dwarf
    },
    {
      id: 'goblin',
      name: 'Goblins',
      description: 'Cunning and numerous, goblins thrive in harsh environments.',
      traits: ['Fast Production', 'Night Advantage', 'Scavenging Bonus'],
      icon: Goblin
    },
    {
      id: 'fairy',
      name: 'Fairies',
      description: 'Magical beings with flight capabilities and illusion powers.',
      traits: ['Flight', 'Illusion Magic', 'Small Size Advantage'],
      icon: Fairy
    }
  ];

  // Selected race
  let selectedRace = $state(null);
  let displayName = $state(initialName); // Add display name state
  let displayNameError = $state(''); // Add validation error state
  let submitting = $state(false);
  
  // Track expanded state for each race on mobile
  let expandedRaces = $state({});
  
  // Detect if we're on mobile
  let isMobile = $state(false);
  
  // Check window size on mount
  $effect(() => {
    if (typeof window !== 'undefined') {
      const checkMobile = () => {
        isMobile = window.innerWidth <= 768;
      };
      
      checkMobile();
      window.addEventListener('resize', checkMobile);
      
      return () => {
        window.removeEventListener('resize', checkMobile);
      };
    }
  });

  // Handle race selection
  function selectRace(race) {
    selectedRace = race;
  }
  
  // Toggle race description on mobile
  function toggleRaceDetails(raceId, event) {
    if (!isMobile) return;
    event.stopPropagation();
    expandedRaces = {
      ...expandedRaces,
      [raceId]: !expandedRaces[raceId]
    };
  }

  // Handle keyboard interaction for race selection
  function handleRaceKeydown(race, event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectRace(race);
    }
  }

  // Add validation for display name
  function validateDisplayName() {
    if (!displayName || displayName.trim().length < 2) {
      displayNameError = 'Display name must be at least 2 characters';
      return false;
    }
    if (displayName.trim().length > 20) {
      displayNameError = 'Display name must be less than 20 characters';
      return false;
    }
    displayNameError = '';
    return true;
  }

  // Handle confirmation
  async function handleConfirm() {
    if (!selectedRace) return;
    if (!validateDisplayName()) return;
    
    submitting = true;
    try {     
      // Include spawn information if available
      await onConfirm(world.id, selectedRace.id, displayName.trim());

    } catch (error) {
      console.error('Error joining world:', error);
      submitting = false;
    }
  }
</script>

<!-- Add backdrop that covers the full screen -->
<div class={`confirmation-backdrop ${animatingOut ? 'animate-out' : 'animate-in'}`}>
</div>

<div class={`join-confirmation ${animatingOut ? 'animate-out' : 'animate-in'}`}>
  <div class="confirmation-header">
    <h2>Join {world?.name || 'World'}</h2>
    <button class="close-btn" aria-label="Close dialog" onclick={onClose}>
      <Close size="2.2em" extraClass="close-icon-light" />
    </button>
  </div>
  
  <div class="confirmation-content">
    <!-- Add display name input field -->
    <div class="name-input-container">
      <label for="display-name">Choose your Display Name:</label>
      <input 
        type="text" 
        id="display-name" 
        placeholder="Enter your name" 
        bind:value={displayName} 
        onblur={validateDisplayName}
        class:error={displayNameError}
        disabled={submitting}
      />
      {#if displayNameError}
        <div class="input-error">{displayNameError}</div>
      {/if}
    </div>

    <p>Before joining this world, select your race:</p>
    
    <div class="race-selection">
      {#each races as race}
        <div 
          class="race-option" 
          class:selected={selectedRace?.id === race.id}
          onclick={() => selectRace(race)}
          onkeydown={(e) => handleRaceKeydown(race, e)}
          tabindex="0"
          role="button"
          aria-pressed={selectedRace?.id === race.id}
        >
          <div class="race-icon-container">
            {#if race.id === 'human'}
              <Human extraClass={`race-icon ${selectedRace?.id === race.id ? 'race-icon-selected' : ''}`} />
            {:else if race.id === 'elf'}
              <Elf extraClass={`race-icon ${selectedRace?.id === race.id ? 'race-icon-selected' : ''}`} />
            {:else if race.id === 'dwarf'}
              <Dwarf extraClass={`race-icon ${selectedRace?.id === race.id ? 'race-icon-selected' : ''}`} />
            {:else if race.id === 'goblin'}
              <Goblin extraClass={`race-icon ${selectedRace?.id === race.id ? 'race-icon-selected' : ''}`} />
            {:else if race.id === 'fairy'}
              <Fairy extraClass={`race-icon ${selectedRace?.id === race.id ? 'race-icon-selected' : ''}`} />
            {/if}
          </div>
          
          <div class="race-name-container">
            <h3>{race.name}</h3>
            {#if isMobile}
              <div 
                class="toggle-icon" 
                aria-label="Toggle race details"
                role="button"
                tabindex="0" 
                onclick={(e) => toggleRaceDetails(race.id, e)}
                onkeydown={(e) => e.key === 'Enter' && toggleRaceDetails(race.id, e)}
              >
                {expandedRaces[race.id] ? '−' : '+'}
              </div>
            {/if}
          </div>
          
          <div class="race-details" class:expanded={!isMobile || expandedRaces[race.id]}>
            <p>{race.description}</p>
            <div class="traits">
              {#each race.traits as trait}
                <span class="trait">{trait}</span>
              {/each}
            </div>
          </div>
        </div>
      {/each}
    </div>
    
    <div class="confirmation-actions">
      <button class="cancel-button" onclick={onClose} disabled={submitting}>
        Cancel
      </button>
      <button 
        class="confirm-button" 
        onclick={handleConfirm} 
        disabled={!selectedRace || submitting || displayNameError}
      >
        {#if submitting}
          <div class="spinner"></div>
          Joining...
        {:else}
          Join as {selectedRace?.name || 'Selected Race'}
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .confirmation-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(10, 25, 47, 0.85);
    z-index: 999;
    cursor: pointer;
  }
  
  .join-confirmation {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 50em;
    max-height: 90vh;
    background: rgba(21, 38, 60, 0.95);
    border: 2px solid var(--color-muted-teal);
    border-radius: 0.5em;
    box-shadow: 0 0.3em 1em rgba(0, 0, 0, 0.5);
    padding: 2em;
    overflow-y: auto;
    z-index: 1000;
    color: var(--color-text);
    font-family: var(--font-body);
  }
  
  .confirmation-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5em;
    padding-bottom: 1em;
    border-bottom: 0.0625em solid var(--color-panel-border);
  }
  
  .confirmation-header h2 {
    color: var(--color-pale-green);
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 400;
    letter-spacing: 0.1em;
    font-size: 2em;
  }
  
  .close-btn {
    height: 3em;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.2s ease;
    padding: 0;
  }
  
  .close-btn:hover {
    opacity: 1;
  }
  
  .close-btn > :global(.close-icon-light) {
    color: var(--color-text);
    stroke: var(--color-text);
  }
  
  .confirmation-content {
    display: flex;
    flex-direction: column;
    gap: 1.5em;
  }
  
  .confirmation-content p {
    font-size: 1.1em;
    text-align: center;
  }
  
  .race-selection {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(18em, 1fr));
    gap: 1em;
    margin: 1em 0;
  }
  
  .race-option {
    background-color: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--color-panel-border);
    border-radius: 0.5em;
    padding: 1em;
    cursor: pointer;
    text-align: center;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--color-text);
  }
  
  .race-option:hover {
    background-color: rgba(0, 0, 0, 0.3);
    transform: translateY(-0.125em);
    box-shadow: 0 0.25em 0.5em var(--color-shadow);
  }
  
  .race-option.selected {
    border: 2px solid var(--color-bright-accent);
    background-color: rgba(100, 255, 218, 0.05);
  }
  
  .race-icon-container {
    display: flex;
    justify-content: center;
    margin-bottom: 0.8em;
  }
  
  :global(.race-icon) {
    width: 4em;
    height: 4em;
    fill: #64FFDA; /* Changed from var(--color-muted-teal) to a brighter color */
    transition: all 0.2s ease;
  }
  
  :global(.race-icon-selected) {
    fill: #9EFFEA; /* Lighten the selected state for even better contrast */
    transform: scale(1.05);
  }
  
  .race-option:hover :global(.race-icon) {
    fill: #9EFFEA; /* Changed from var(--color-pale-green) to a brighter color */
  }
  
  .race-name-container {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 0.7em;
  }
  
  .race-option h3 {
    font-family: var(--font-heading);
    font-weight: 600;
    margin: 0;
    color: var(--color-muted-teal);
    font-size: 1.3em;
  }
  
  .race-option.selected h3 {
    color: var(--color-pale-green);
  }
  
  .race-details {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  
  .race-option p {
    font-size: 0.95em;
    margin: 0 0 1em 0;
    text-align: left;
  }
  
  .traits {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
    margin-top: auto;
  }
  
  .trait {
    background: rgba(0, 0, 0, 0.3);
    padding: 0.25em 0.5em;
    border-radius: 0.25em;
    font-size: 0.8em;
    color: var(--color-bright-accent);
  }
  
  .race-option.selected .trait {
    background: rgba(100, 255, 218, 0.1);
  }
  
  .toggle-icon {
    font-size: 1.2em;
    font-weight: bold;
    color: var(--color-pale-green);
    width: 1.5em;
    height: 1.5em;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.2);
    cursor: pointer;
  }
  
  /* Add focus styles for accessibility */
  .race-option:focus,
  .toggle-icon:focus {
    outline: 2px solid var(--color-bright-accent);
    outline-offset: 2px;
  }
  
  .confirmation-actions {
    display: flex;
    justify-content: center;
    gap: 1em;
    margin-top: 1em;
    flex-wrap: wrap;
  }
  
  .cancel-button,
  .confirm-button {
    padding: 0.8em 1.5em;
    border-radius: 0.25em;
    cursor: pointer;
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1em;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .cancel-button {
    background: transparent;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-panel-border);
  }
  
  .confirm-button {
    background-color: var(--color-button-primary);
    color: var(--color-text);
    border: 1px solid var(--color-muted-teal);
  }
  
  .cancel-button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.05);
  }
  
  .confirm-button:hover:not(:disabled) {
    background-color: var(--color-button-primary-hover);
    transform: translateY(-0.125em);
    box-shadow: 0 0.2em 0.5em var(--color-shadow);
  }
  
  .confirm-button:disabled,
  .cancel-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
  
  .spinner {
    display: inline-block;
    width: 1em;
    height: 1em;
    border: 0.2em solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: white;
    animation: spin 1s ease-in-out infinite;
    margin-right: 0.5em;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* Animation classes */
  .animate-in {
    animation: fadeIn 0.3s ease forwards;
  }
  
  .animate-out {
    animation: fadeOut 0.3s ease forwards;
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  
  @keyframes fadeOut {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  
  /* Mobile adjustments */
  @media (max-width: 768px) {
    .join-confirmation {
      padding: 1.5em;
      width: 95%;
    }
    
    .confirmation-header h2 {
      font-size: 1.5em;
    }
    
    .race-selection {
      grid-template-columns: 1fr;
    }
    
    .confirmation-actions {
      flex-direction: column;
      width: 100%;
    }
    
    .cancel-button,
    .confirm-button {
      width: 100%;
    }
    
    .race-option h3 {
      font-size: 1.5em;  /* Even bigger on mobile */
    }
    
    .race-details {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease-out;
    }
    
    .race-details.expanded {
      max-height: 20em; /* Adjust based on content needs */
    }
    
    .race-option {
      padding: 0.8em;
    }
    
    :global(.race-icon) {
      width: 3.5em;
      height: 3.5em;
    }
    
    .race-name-container {
      justify-content: space-between; /* Restore space-between on mobile for toggle button */
      align-items: center;
    }
  }

  /* Add styles for the display name input */
  .name-input-container {
    margin-bottom: 1.5em;
    text-align: center;
  }
  
  .name-input-container label {
    display: block;
    margin-bottom: 0.5em;
    color: var(--color-pale-green);
    font-family: var(--font-heading);
    font-size: 1.1em;
  }
  
  .name-input-container input {
    width: 100%;
    max-width: 400px;
    padding: 0.8em;
    font-size: 1em;
    background-color: rgba(255, 255, 255, 0.1);
    border: 1px solid var(--color-panel-border);
    border-radius: 0.3em;
    color: var(--color-text);
    font-family: var(--font-body);
    transition: all 0.2s ease;
  }
  
  .name-input-container input:focus {
    outline: none;
    border-color: var(--color-bright-accent);
    box-shadow: 0 0 0 2px rgba(100, 255, 218, 0.3);
  }
  
  .name-input-container input.error {
    border-color: #e24144;
    box-shadow: 0 0 0 2px rgba(226, 65, 68, 0.3);
  }
  
  .input-error {
    color: #e24144;
    font-size: 0.8em;
    margin-top: 0.5em;
  }
</style>
