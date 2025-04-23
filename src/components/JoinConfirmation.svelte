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
      icon: Human
    },
    {
      id: 'elf',
      name: 'Elves',
      description: 'Ancient forest dwellers with deep connections to nature and magic.',
      icon: Elf
    },
    {
      id: 'dwarf',
      name: 'Dwarves',
      description: 'Sturdy mountain folk, master craftsmen and miners.',
      icon: Dwarf
    },
    {
      id: 'goblin',
      name: 'Goblins',
      description: 'Cunning and numerous, goblins thrive in harsh environments.',
      icon: Goblin
    },
    {
      id: 'fairy',
      name: 'Fairies',
      description: 'Magical beings with flight capabilities and illusion powers.',
      icon: Fairy
    }
  ];

  // Component state
  let selectedRace = $state(null);
  let displayName = $state(initialName);
  let displayNameError = $state('');
  let submitting = $state(false);
  let currentStep = $state(1); // Added step tracker: 1 = race selection, 2 = name input
  
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

  // Move to next step (name input)
  function goToNameInput() {
    if (selectedRace) {
      currentStep = 2;
    }
  }

  // Go back to race selection
  function goBackToRaceSelection() {
    currentStep = 1;
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

  // Helper function to convert race name to singular form
  function getSingularRaceName(race) {
    if (!race) return '';
    
    // Map race IDs to their singular forms
    const singularForms = {
      'human': 'Human',
      'elf': 'Elf',
      'dwarf': 'Dwarf',
      'goblin': 'Goblin',
      'fairy': 'Fairy'
    };
    
    return singularForms[race.id] || race.id.charAt(0).toUpperCase() + race.id.slice(1);
  }
</script>

<!-- Add backdrop that covers the full screen -->
<div class={`confirmation-backdrop ${animatingOut ? 'animate-out' : 'animate-in'}`} onclick={onClose}>
</div>

<div class={`join-confirmation ${animatingOut ? 'animate-out' : 'animate-in'}`}>
  <div class="confirmation-content">
    <!-- Step 1: Race Selection -->
    {#if currentStep === 1}
      <h2 class="step-title">Select Your Race</h2>
      
      <div class="race-selection">
        {#each races as race (race.id)}
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
                <Human extraClass="confirmation-race-icon" />
              {:else if race.id === 'elf'}
                <Elf extraClass="confirmation-race-icon" />
              {:else if race.id === 'dwarf'}
                <Dwarf extraClass="confirmation-race-icon" />
              {:else if race.id === 'goblin'}
                <Goblin extraClass="confirmation-race-icon" />
              {:else if race.id === 'fairy'}
                <Fairy extraClass="confirmation-race-icon" />
              {/if}
            </div>
            <h3>{race.name}</h3>
            <div class="race-description">
              <p>{race.description}</p>
            </div>
          </div>
        {/each}
      </div>
      
      <div class="confirmation-actions">
        <button class="cancel-button" onclick={onClose}>
          Cancel
        </button>
        <button 
          class="next-button" 
          disabled={!selectedRace} 
          onclick={goToNameInput}
        >
          Next
        </button>
      </div>
      
    <!-- Step 2: Name Input -->
    {:else if currentStep === 2}
      <h2 class="step-title">
        Choose Your Name
        <span class="race-header-info">
          <span class="race-name">{getSingularRaceName(selectedRace)}</span>
          <div class="race-icon-container inline">
            {#if selectedRace?.id === 'human'}
              <Human extraClass="confirmation-race-icon header" />
            {:else if selectedRace?.id === 'elf'}
              <Elf extraClass="confirmation-race-icon header" />
            {:else if selectedRace?.id === 'dwarf'}
              <Dwarf extraClass="confirmation-race-icon header" />
            {:else if selectedRace?.id === 'goblin'}
              <Goblin extraClass="confirmation-race-icon header" />
            {:else if selectedRace?.id === 'fairy'}
              <Fairy extraClass="confirmation-race-icon header" />
            {/if}
          </div>
        </span>
      </h2>
      
      <div class="name-input-container">
        <input 
          type="text" 
          id="display-name" 
          placeholder="Enter your display name" 
          bind:value={displayName} 
          onblur={validateDisplayName}
          class:error={displayNameError}
          disabled={submitting}
          autofocus
        />
        {#if displayNameError}
          <div class="input-error">{displayNameError}</div>
        {/if}
      </div>
      
      <div class="confirmation-actions">
        <button class="back-button" onclick={goBackToRaceSelection} disabled={submitting}>
          Back
        </button>
        <button 
          class="confirm-button" 
          onclick={handleConfirm} 
          disabled={!displayName || submitting || displayNameError}
        >
          {#if submitting}
            <div class="spinner"></div>
            Joining...
          {:else}
            Join World
          {/if}
        </button>
      </div>
    {/if}
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
    max-width: 40em;
    max-height: 90vh;
    background: rgba(21, 38, 60, 0.95);
    border: 2px solid var(--color-muted-teal);
    border-radius: 0.5em;
    box-shadow: 0 0.3em 1em rgba(0, 0, 0, 0.5);
    padding: 1.5em;
    overflow-y: auto;
    z-index: 1000;
    color: var(--color-text);
    font-family: var(--font-body);
  }
  
  .step-title {
    color: var(--color-pale-green);
    margin: 0 0 1em 0;
    font-family: var(--font-heading);
    font-weight: 400;
    letter-spacing: 0.05em;
    font-size: 1.6em;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.4em;
  }
  
  .race-header-info {
    display: flex;
    align-items: center;
    gap: 0.4em;
    margin-left: 0.3em;
  }
  
  .race-name {
    font-weight: 500;
    color: var(--color-bright-accent);
  }
  
  .race-icon-container.inline {
    margin: 0;
    display: inline-flex;
  }
  
  :global(.confirmation-race-icon.header) {
    width: 1.5em;
    height: 1.5em;
    margin-top: 0.15em;
  }
  
  .confirmation-content {
    display: flex;
    flex-direction: column;
    gap: 1em;
  }
  
  .race-selection {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9em, 1fr));
    gap: 1em;
    margin: 0.5em 0 1em 0;
  }
  
  .race-option {
    background-color: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--color-panel-border);
    border-radius: 0.5em;
    padding: 1em 0.8em;
    cursor: pointer;
    text-align: center;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
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
    margin-bottom: 0.5em;
  }

  .race-icon-container.large {
    margin: 0.5em auto;
  }
  
  :global(.confirmation-race-icon) {
    width: 2.5em;
    height: 2.5em;
    fill: #64FFDA;
    transition: all 0.2s ease;
  }

  :global(.confirmation-race-icon.large) {
    width: 4em;
    height: 4em;
  }
  
  .race-option.selected :global(.confirmation-race-icon) {
    fill: #9EFFEA;
    transform: scale(1.05);
  }
  
  .race-option:hover :global(.confirmation-race-icon) {
    fill: #9EFFEA;
  }
  
  .race-option h3 {
    font-family: var(--font-heading);
    font-weight: 600;
    margin: 0 0 0.5em 0;
    color: var(--color-muted-teal);
    font-size: 1em;
  }
  
  .race-option.selected h3 {
    color: var(--color-pale-green);
  }
  
  .race-description {
    font-size: 0.8em;
    max-height: 5em;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }
  
  .race-option p {
    margin: 0;
    text-align: center;
    color: rgba(255, 255, 255, 0.7);
  }
  
  .race-option:focus {
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
  .back-button {
    background: transparent;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-panel-border);
    padding: 0.8em 1.5em;
    border-radius: 0.25em;
    cursor: pointer;
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 1em;
    transition: all 0.2s ease;
  }
  
  .next-button,
  .confirm-button {
    background-color: #64FFDA;
    color: #0A192F;
    border: none;
    min-width: 10em;
    font-weight: 500;
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
  
  .cancel-button:hover:not(:disabled),
  .back-button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.05);
  }
  
  .next-button:hover:not(:disabled),
  .confirm-button:hover:not(:disabled) {
    background-color: #9EFFEA;
    transform: translateY(-0.125em);
    box-shadow: 0 0.2em 0.5em rgba(100, 255, 218, 0.3);
  }
  
  .next-button:disabled,
  .confirm-button:disabled,
  .cancel-button:disabled,
  .back-button:disabled {
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
  
  .selected-race-display {
    text-align: center;
    margin-bottom: 1em;
  }
  
  .selected-race-display h3 {
    color: var(--color-pale-green);
    font-family: var(--font-heading);
    font-size: 1.4em;
    margin: 0.2em 0 0 0;
  }
  
  .name-input-container {
    margin: 1em 0;
    text-align: center;
    padding: 0 1em;
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
  
  @media (max-width: 768px) {
    .join-confirmation {
      padding: 1.2em;
      width: 95%;
    }
    
    .step-title {
      font-size: 1.2em;
      margin-bottom: 0.8em;
      flex-direction: column;
      gap: 0.2em;
    }
    
    .race-header-info {
      margin-left: 0;
    }
    
    :global(.confirmation-race-icon.header) {
      width: 1.3em;
      height: 1.3em;
    }
    
    .race-selection {
      grid-template-columns: repeat(2, 1fr);
      gap: 0.8em;
    }
    
    .confirmation-actions {
      flex-direction: column;
      width: 100%;
    }
    
    .cancel-button,
    .back-button,
    .next-button,
    .confirm-button {
      width: 100%;
    }
    
    .race-option h3 {
      font-size: 0.9em;
    }
    
    .race-description {
      display: none;
    }
    
    .race-option {
      padding: 0.6em;
    }
    
    :global(.confirmation-race-icon) {
      width: 2.2em;
      height: 2.2em;
    }

    :global(.confirmation-race-icon.large) {
      width: 3.5em;
      height: 3.5em;
    }
  }
</style>
