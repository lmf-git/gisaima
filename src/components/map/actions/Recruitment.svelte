<script>
    import { getFunctions, httpsCallable } from "firebase/functions";

    import { onMount } from "svelte";
    import { get } from "svelte/store";
    
    import UNITS from "gisaima-shared/definitions/UNITS.js";
    import { ITEMS } from "gisaima-shared/definitions/ITEMS.js";

    import { game, currentPlayer } from "../../../lib/stores/game.js";

    import Close from "../../icons/Close.svelte";
    import Human from "../../icons/Human.svelte";
    import Elf from "../../icons/Elf.svelte";
    import Dwarf from "../../icons/Dwarf.svelte";
    import Goblin from "../../icons/Goblin.svelte";
    import Fairy from "../../icons/Fairy.svelte";
    import Shield from "../../icons/Shield.svelte";
    import Sword from "../../icons/Sword.svelte";
    import Bow from "../../icons/Bow.svelte";

    // Props - Add isActive and onMouseEnter props
    const {
        structure = null,
        x = 0,
        y = 0,
        onClose = () => {},
        onRecruitStart = () => {},
        isActive = false, // Add prop for z-index control
        onMouseEnter = () => {} // Add prop for mouse enter event
    } = $props();

    // Component state
    let isLoading = $state(false);
    let error = $state(null);
    let success = $state(null);
    let selectedUnit = $state(null);
    let quantity = $state(1);
    let availableUnits = $state([]);
    let structureData = $state(null);
    let queue = $state([]);
    let maxUnits = $state(10); // Default max queue size
    let completionInfo = $state(null);
    
    // Flag to track initial setup
    let initialSetupDone = $state(false);

    // Set initial data from props - modified to avoid infinite loops
    $effect(() => {
        if (structure && !initialSetupDone) {
            structureData = structure;

            // Set max units based on structure capacity
            maxUnits = structure.capacity || 10;
            
            // Load available units directly from UNITS
            const units = getAvailableUnits(structure);
            availableUnits = units;
            
            // Update queue
            if (structure.recruitmentQueue) {
                queue = Object.values(structure.recruitmentQueue)
                    .filter((item) => item && typeof item === "object")
                    .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
            }
            
            // Set initial selected unit AFTER setting available units
            const firstAvailable = units.find(unit => unit.available);
            if (firstAvailable) {
                selectedUnit = firstAvailable;
            } else if (units.length > 0) {
                selectedUnit = units[0];
            }
            
            // Mark setup as complete to avoid re-running
            initialSetupDone = true;
        }
    });

    // Update completion info when selectedUnit or quantity changes
    $effect(() => {
        if (selectedUnit && quantity > 0) {
            // Create a new object without modifying state
            completionInfo = calculateCompletionTime();
        } else {
            completionInfo = null;
        }
    });

    // Function to get available units directly from UNITS
    function getAvailableUnits(structure) {
        const race = structure.race?.toLowerCase();
        const structureLevel = structure.level || 1;
        const structureType = structure.type;
        
        // Get buildings inside the structure (if any)
        const buildings = structure.buildings || {};
        
        // Filter units from UNITS that are player recruitable units 
        // But exclude units with type 'player' (the player character)
        return Object.entries(UNITS)
            .filter(([_, unit]) => unit.category === 'player' && unit.type !== 'player')
            .map(([id, unit]) => {
                // Create a clean unit object with recruitment properties
                const cleanUnit = {
                    id,
                    name: unit.name,
                    description: unit.description,
                    type: unit.type,
                    race: unit.race || 'neutral',
                    cost: unit.cost || {},
                    timePerUnit: unit.timePerUnit || 60,
                    icon: unit.icon,
                    power: unit.power,
                    requirements: unit.requirements || {},
                    sortOrder: unit.recruitment?.sortOrder || 999,
                    tooltip: unit.recruitment?.tooltip || ''
                };
                
                // Calculate availability based on requirements
                const reqs = unit.requirements || {};
                let available = true;
                let unavailableReason = "";
                
                // Use provided unavailable text if available
                if (unit.recruitment?.unavailableText) {
                    unavailableReason = unit.recruitment.unavailableText;
                }
                
                // Structure level check
                if (reqs.structureLevel > structureLevel) {
                    available = false;
                    if (!unavailableReason) {
                        unavailableReason = `Requires structure level ${reqs.structureLevel}`;
                    }
                }
                
                // Race check
                if (reqs.race && reqs.race !== race) {
                    available = false;
                    if (!unavailableReason) {
                        unavailableReason = `Requires ${formatRaceName(reqs.race)} structure`;
                    }
                }
                
                // Structure type check
                if (reqs.structureType && 
                    !reqs.structureType.includes(structureType)) {
                    available = false;
                    if (!unavailableReason) {
                        unavailableReason = `Requires ${formatStructureTypeName(reqs.structureType[0])}`;
                    }
                }
                
                // Building type and level check
                if (reqs.buildingType) {
                    const requiredBuilding = buildings[reqs.buildingType];
                    const requiredLevel = reqs.buildingLevel || 1;
                    
                    if (!requiredBuilding || requiredBuilding.level < requiredLevel) {
                        available = false;
                        if (!unavailableReason) {
                            const buildingName = formatStructureTypeName(reqs.buildingType);
                            unavailableReason = `Requires ${buildingName} level ${requiredLevel}`;
                        }
                    }
                }
                
                // Research check
                if (reqs.research) {
                    // Check if research is completed in structure
                    const researchCompleted = structure.research && 
                        structure.research[reqs.research];
                    
                    // Or check if research is completed in any building
                    const buildingWithResearch = Object.values(buildings).some(
                        building => building.research && building.research[reqs.research]
                    );
                    
                    if (!researchCompleted && !buildingWithResearch) {
                        available = false;
                        if (!unavailableReason) {
                            unavailableReason = `Requires ${formatResearchName(reqs.research)} research`;
                        }
                    }
                }
                
                // Return the unit with availability info
                return {
                    ...cleanUnit,
                    available,
                    unavailableReason
                };
            })
            .sort((a, b) => a.sortOrder - b.sortOrder); // Sort by recruitment order
    }

    // Helpers for unit requirements
    function formatRaceName(race) {
        if (!race) return "";
        return race.charAt(0).toUpperCase() + race.slice(1);
    }
    
    function formatStructureTypeName(type) {
        if (!type) return "";
        return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    
    function formatResearchName(research) {
        if (!research) return "";
        return research.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    // Select a unit - modified to allow selecting unavailable units for info display
    function selectUnit(unit) {
        selectedUnit = unit;
        error = null;
    }

    // Calculate total resources needed
    function calculateTotalCost() {
        if (!selectedUnit) return {};

        const totalCost = {};
        Object.entries(selectedUnit.cost).forEach(([resource, amount]) => {
            totalCost[resource] = amount * quantity;
        });

        return totalCost;
    }

    // Calculate estimated completion time - modified to work with ticks
    function calculateCompletionTime() {
        if (!selectedUnit) return null;

        const now = Date.now();
        const ticksPerUnit = selectedUnit.timePerUnit || 1;
        const totalTicks = ticksPerUnit * quantity;

        // Add time for existing queue items
        let queueTicks = 0;
        queue.forEach((item) => {
            if (item.completesAt && item.completesAt > now) {
                // Convert remaining time to ticks
                queueTicks += (item.completesAt - now) / (60 * 1000); // 1 tick = 60 seconds
            }
        });

        // Total time including queue
        const totalTicksWithQueue = queueTicks + totalTicks;
        const tickDuration = 60 * 1000; // 60 seconds per tick in milliseconds
        const completionDate = new Date(now + totalTicksWithQueue * tickDuration);

        return {
            ticks: totalTicks,
            totalTicks: totalTicksWithQueue,
            date: completionDate,
            queueTicks: queueTicks,
            ticksRequired: Math.ceil(totalTicks)
        };
    }

    // Format time in ticks to readable format
    function formatTicks(ticks) {
        if (ticks < 1) return `${Math.round(ticks * 10) / 10} ticks`;
        if (ticks === 1) return "1 tick";
        return `${Math.round(ticks * 10) / 10} ticks`;
    }

    // Format a number with commas
    function formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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

    // Format a resource name using ITEMS definition
    function formatResource(resourceId) {
        // Convert to uppercase for consistency with ITEMS keys
        const upperResourceId = resourceId.toUpperCase();
        
        // If the resource exists in ITEMS, use its defined name
        if (ITEMS[upperResourceId]) {
            return ITEMS[upperResourceId].name;
        }
        
        // Fallback to simple formatting if not found in ITEMS
        return resourceId.charAt(0).toUpperCase() + resourceId.slice(1);
    }

    // Get player's resources - updated to use player's personal bank
    function getPlayerResources() {
        const player = get(currentPlayer);
        if (!player || !player.id) return {};
        
        // Use player's personal bank at this structure
        if (structureData && structureData.banks && structureData.banks[player.id]) {
            const resources = {};
            structureData.banks[player.id].forEach(item => {
                if (item.type === 'resource') {
                    // Convert item name to lowercase for consistency
                    const resourceName = item.name.toLowerCase();
                    resources[resourceName] = (resources[resourceName] || 0) + item.quantity;
                }
            });
            return resources;
        }
        
        // If no player bank, return empty object
        return {};
    }

    // Check if player has enough resources
    function hasEnoughResources() {
        if (!selectedUnit) return false;

        const playerResources = getPlayerResources();
        const totalCost = calculateTotalCost();

        for (const [resource, amount] of Object.entries(totalCost)) {
            const playerAmount = playerResources[resource] || 0;
            if (playerAmount < amount) return false;
        }

        return true;
    }

    // Start recruitment
    async function startRecruitment() {
        if (!selectedUnit) {
            error = "No unit type selected";
            return;
        }

        if (quantity < 1) {
            error = "Quantity must be at least 1";
            return;
        }

        if (!hasEnoughResources()) {
            error = "Not enough resources";
            return;
        }

        if (queue.length >= maxUnits) {
            error = "Recruitment queue is full";
            return;
        }

        try {
            isLoading = true;
            error = null;

            const functions = getFunctions();
            const recruitUnitsFn = httpsCallable(functions, "recruitUnits");

            const result = await recruitUnitsFn({
                structureId: structureData.id,
                x,
                y,
                worldId: get(game).worldKey,
                unitType: selectedUnit.id,
                quantity: quantity,
                cost: calculateTotalCost(),
            });

            console.log("Recruitment started:", result.data);
            success = `Started recruiting ${quantity} ${selectedUnit.name} units`;

            // Refresh queue from the result
            if (result.data.queue) {
                queue = Object.values(result.data.queue).sort(
                    (a, b) => (a.startedAt || 0) - (b.startedAt || 0),
                );
            }

            // Trigger the achievement callback
            onRecruitStart(result.data);
        } catch (err) {
            console.error("Error starting recruitment:", err);
            error = err.message || "Failed to start recruitment";
        } finally {
            isLoading = false;
        }
    }

    // Cancel a recruitment item
    async function cancelRecruitment(recruitmentId) {
        try {
            isLoading = true;
            error = null;

            const functions = getFunctions();
            const cancelRecruitmentFn = httpsCallable(
                functions,
                "cancelRecruitment",
            );

            await cancelRecruitmentFn({
                recruitmentId,
                structureId: structureData.id,
                x,
                y,
                worldId: get(game).worldKey,
            });

            // Remove from local queue
            queue = queue.filter((item) => item.id !== recruitmentId);
            success = "Recruitment cancelled";
        } catch (err) {
            console.error("Error cancelling recruitment:", err);
            error = err.message || "Failed to cancel recruitment";
        } finally {
            isLoading = false;
        }
    }

    // Get icon component for unit type
    function getUnitIcon(unit) {
        if (!unit) return null;

        // First check icon property
        if (unit.icon) {
            if (unit.icon === "sword") return Sword;
            if (unit.icon === "bow") return Bow;
            if (unit.icon === "shield") return Shield;
        }

        // Fall back to race icons
        if (unit.race) {
            const race = unit.race.toLowerCase();
            if (race === "human") return Human;
            if (race === "elf") return Elf;
            if (race === "dwarf") return Dwarf;
            if (race === "goblin") return Goblin;
            if (race === "fairy") return Fairy;
        }

        // Default
        return Sword;
    }

    // Get progress percentage for a queue item
    function getProgressPercentage(item) {
        if (!item || !item.startedAt || !item.completesAt) return 0;

        const now = Date.now();
        const total = item.completesAt - item.startedAt;
        const elapsed = now - item.startedAt;

        if (elapsed >= total) return 100;
        return Math.floor((elapsed / total) * 100);
    }

    // Add keyboard handler for the Escape key
    function handleKeyDown(event) {
        if (event.key === "Escape" && !isLoading) {
            onClose();
        }
    }

    // Initialize
    onMount(() => {
        // Refresh queue on interval
        const interval = setInterval(() => {
            // Force update of progress calculations
            queue = [...queue];
        }, 1000);

        return () => clearInterval(interval);
    });
</script>

<svelte:window on:keydown={handleKeyDown} />

<div 
    class="recruitment-modal" 
    class:active={isActive}
    onmouseenter={onMouseEnter}>
    <header class="modal-header">
        <h3>
            Recruitment at {structureData?.name || "Structure"} ({x}, {y})
        </h3>
        <button class="close-button" onclick={onClose} disabled={isLoading}>
            <Close size="1.6em" extraClass="close-icon-dark" />
        </button>
    </header>

    <div class="modal-content">
        <!-- Queue section -->
        <div class="section queue-section">
            <h4>
                Recruitment Queue
                <span class="entity-count">{queue.length}/{maxUnits}</span>
            </h4>

            {#if queue.length === 0}
                <div class="empty-state">
                    No units currently being recruited
                </div>
            {:else}
                <div class="queue-list">
                    {#each queue as item}
                        <div class="queue-item">
                            <div class="queue-item-header">
                                <div class="queue-item-icon">
                                    <!-- Get the appropriate icon based on unit type -->
                                    {#if item.unitType}
                                        {#key item.unitType}
                                            {#if item.icon === "sword"}
                                                <Sword
                                                    extraClass="unit-icon"
                                                />
                                            {:else if item.icon === "bow"}
                                                <Bow
                                                    extraClass="unit-icon"
                                                />
                                            {:else if item.icon === "shield"}
                                                <Shield
                                                    extraClass="unit-icon"
                                                />
                                            {:else if item.race === "human"}
                                                <Human
                                                    extraClass="unit-icon"
                                                />
                                            {:else if item.race === "elf"}
                                                <Elf
                                                    extraClass="unit-icon"
                                                />
                                            {:else if item.race === "dwarf"}
                                                <Dwarf
                                                    extraClass="unit-icon"
                                                />
                                            {:else if item.race === "goblin"}
                                                <Goblin
                                                    extraClass="unit-icon"
                                                />
                                            {:else if item.race === "fairy"}
                                                <Fairy
                                                    extraClass="unit-icon"
                                                />
                                            {:else}
                                                <Sword
                                                    extraClass="unit-icon"
                                                />
                                            {/if}
                                        {/key}
                                    {/if}
                                </div>
                                <div class="queue-item-info">
                                    <div class="queue-item-name">
                                        {item.unitName || "Unknown Unit"} x{item.quantity}
                                    </div>
                                    <div class="queue-item-time">
                                        Completes: {formatDate(
                                            new Date(item.completesAt),
                                        )}
                                    </div>
                                </div>
                                {#if item.owner === $currentPlayer?.id}
                                    <button
                                        class="cancel-button"
                                        onclick={() =>
                                            cancelRecruitment(item.id)}
                                        disabled={isLoading}
                                    >
                                        ✕
                                    </button>
                                {/if}
                            </div>

                            <div class="progress-bar">
                                <div
                                    class="progress-fill"
                                    style={`width: ${getProgressPercentage(item)}%`}
                                ></div>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Recruitment form -->
        <div class="section recruitment-form">
            <h4>Recruit New Units</h4>

            {#if availableUnits.length === 0}
                <div class="empty-state">
                    No units available for recruitment
                </div>
            {:else}
                <div class="form-content">
                    <!-- Unit selection -->
                    <div class="form-group">
                        <div class="unit-select-container">
                            {#each availableUnits as unit}
                                {@const IconComponent = getUnitIcon(unit)}
                                <button
                                    class="unit-option {selectedUnit?.id === unit.id ? 'selected' : ''} {!unit.available ? 'unavailable' : ''}"
                                    onclick={() => selectUnit(unit)}
                                    title={unit.available ? (unit.tooltip || unit.description) : `${unit.description} - ${unit.unavailableReason}`}
                                >
                                    <div class="unit-option-icon">
                                        {#if IconComponent}
                                            <IconComponent extraClass="unit-icon" />
                                        {/if}
                                    </div>
                                    <div class="unit-option-info">
                                        <div class="unit-option-name">
                                            {unit.name}
                                            {#if !unit.available}
                                                <span class="locked-icon">🔒</span>
                                            {/if}
                                        </div>
                                        <div class="unit-option-power">
                                            Power: {unit.power}
                                            {#if unit.tooltip}
                                                <span class="unit-tooltip-hint">ℹ️</span>
                                            {/if}
                                        </div>
                                    </div>
                                </button>
                            {/each}
                        </div>
                    </div>

                    {#if selectedUnit}
                        <!-- Unit details -->
                        <div class="unit-details {!selectedUnit.available ? 'unavailable' : ''}">
                            <h5>{selectedUnit.name}</h5>
                            <p class="unit-description">
                                {selectedUnit.description}
                            </p>
                            
                            <!-- Requirements Section -->
                            <div class="unit-requirements">
                                <h6>Requirements:</h6>
                                <div class="requirements-list">
                                    {#if selectedUnit.requirements.structureLevel}
                                        <div class="requirement-item {structureData.level >= selectedUnit.requirements.structureLevel ? 'met' : 'unmet'}">
                                            <span class="requirement-icon">🏛️</span>
                                            <span class="requirement-text">Structure Level {selectedUnit.requirements.structureLevel}</span>
                                            <span class="requirement-status">{structureData.level >= selectedUnit.requirements.structureLevel ? '✓' : '✗'}</span>
                                        </div>
                                    {/if}
                                    
                                    {#if selectedUnit.requirements.race}
                                        <div class="requirement-item {structureData.race === selectedUnit.requirements.race ? 'met' : 'unmet'}">
                                            <span class="requirement-icon">👥</span>
                                            <span class="requirement-text">{formatRaceName(selectedUnit.requirements.race)} Structure</span>
                                            <span class="requirement-status">{structureData.race === selectedUnit.requirements.race ? '✓' : '✗'}</span>
                                        </div>
                                    {/if}
                                    
                                    {#if selectedUnit.requirements.structureType}
                                        {@const hasCorrectType = selectedUnit.requirements.structureType.includes(structureData.type)}
                                        <div class="requirement-item {hasCorrectType ? 'met' : 'unmet'}">
                                            <span class="requirement-icon">🏠</span>
                                            <span class="requirement-text">Structure Type: {selectedUnit.requirements.structureType.map(formatStructureTypeName).join(' or ')}</span>
                                            <span class="requirement-status">{hasCorrectType ? '✓' : '✗'}</span>
                                        </div>
                                    {/if}
                                    
                                    {#if selectedUnit.requirements.buildingType}
                                        {@const building = (structureData.buildings || {})[selectedUnit.requirements.buildingType]}
                                        {@const requiredLevel = selectedUnit.requirements.buildingLevel || 1}
                                        {@const hasBuilding = building && building.level >= requiredLevel}
                                        <div class="requirement-item {hasBuilding ? 'met' : 'unmet'}">
                                            <span class="requirement-icon">🔨</span>
                                            <span class="requirement-text">{formatStructureTypeName(selectedUnit.requirements.buildingType)} (Level {requiredLevel}+)</span>
                                            <span class="requirement-status">{hasBuilding ? '✓' : '✗'}</span>
                                        </div>
                                    {/if}
                                    
                                    {#if selectedUnit.requirements.research}
                                        {@const researchCompleted = structureData.research && structureData.research[selectedUnit.requirements.research]}
                                        {@const buildingWithResearch = Object.values(structureData.buildings || {}).some(
                                            b => b.research && b.research[selectedUnit.requirements.research]
                                        )}
                                        {@const hasResearch = researchCompleted || buildingWithResearch}
                                        <div class="requirement-item {hasResearch ? 'met' : 'unmet'}">
                                            <span class="requirement-icon">📚</span>
                                            <span class="requirement-text">Research: {formatResearchName(selectedUnit.requirements.research)}</span>
                                            <span class="requirement-status">{hasResearch ? '✓' : '✗'}</span>
                                        </div>
                                    {/if}
                                </div>
                            </div>
                            
                            {#if !selectedUnit.available}
                                <div class="unavailable-reason">
                                    <span class="locked-icon">🔒</span> {selectedUnit.unavailableReason}
                                </div>
                            {/if}

                            <div class="unit-stats">
                                <div class="unit-stat">
                                    <span class="stat-label">Power:</span>
                                    <span class="stat-value">{selectedUnit.power}</span>
                                </div>
                                <div class="unit-stat">
                                    <span class="stat-label">Time:</span>
                                    <span class="stat-value">{formatTicks(
                                        selectedUnit.timePerUnit,
                                    )} per unit</span>
                                </div>
                            </div>

                            <div class="unit-cost">
                                <h6>Cost per unit:</h6>
                                <div class="cost-items">
                                    {#each Object.entries(selectedUnit.cost) as [resource, amount]}
                                        <div class="cost-item">
                                            {formatResource(resource)}: {amount}
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        </div>

                        <!-- Only show quantity selection and recruitment UI if the unit is available -->
                        {#if selectedUnit.available}
                            <!-- Quantity selection -->
                            <div class="form-group">
                                <label for="quantity">Quantity</label>
                                <div class="quantity-control">
                                    <button
                                        class="quantity-button"
                                        onclick={() => (quantity = Math.max(1, quantity - 1))}
                                        disabled={isLoading || quantity <= 1}
                                    >
                                        -
                                    </button>
                                    <input
                                        type="number"
                                        id="quantity"
                                        bind:value={quantity}
                                        min="1"
                                        max="100"
                                        disabled={isLoading}
                                    />
                                    <button
                                        class="quantity-button"
                                        onclick={() => (quantity = Math.min(100, quantity + 1))}
                                        disabled={isLoading || quantity >= 100}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>

                            <!-- Total cost and time -->
                            <div class="totals">
                                <div class="total-section">
                                    <h6>Total Cost:</h6>
                                    <div class="total-items">
                                        {#each Object.entries(calculateTotalCost()) as [resource, amount]}
                                            {@const playerResource = getPlayerResources()[resource] || 0}
                                            <div class="total-item {playerResource >= amount ? 'sufficient' : 'insufficient'}"
                                                 title={`You have ${playerResource} ${formatResource(resource)}`}>
                                                <span class="resource-name">{formatResource(resource)}:</span>
                                                <span class="resource-amount">
                                                    <span class="current">{playerResource}</span>
                                                    <span class="separator">/</span>
                                                    <span class="needed">{amount}</span>
                                                </span>
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                                
                                <div class="total-section">
                                    <h6>Time Required:</h6>
                                    <div class="time-info">
                                        <div>
                                            Production: {formatTicks(
                                                completionInfo?.ticks || 0,
                                            )}
                                        </div>
                                        {#if completionInfo?.queueTicks > 0}
                                            <div>
                                                Queue wait: {formatTicks(
                                                    completionInfo?.queueTicks || 0,
                                                )}
                                            </div>
                                            <div class="completion-estimate">
                                                Estimated completion: {formatDate(
                                                    completionInfo?.date,
                                                )}
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            </div>

                            {#if error}
                                <div class="error-message">{error}</div>
                            {/if}

                            {#if success}
                                <div class="success-message">{success}</div>
                            {/if}

                            <!-- Submit button -->
                            <div class="form-actions">
                                <button
                                    class="recruit-button"
                                    onclick={startRecruitment}
                                    disabled={isLoading || !hasEnoughResources() || queue.length >= maxUnits}
                                >
                                    {isLoading ? "Processing..." : "Start Recruitment"}
                                </button>
                            </div>
                        {/if}
                    {/if}
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .recruitment-modal {
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
        transition: z-index 0s;
    }

    .recruitment-modal.active {
        z-index: 1001;
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
        display: flex;
        align-items: center;
        font-family: var(--font-heading);
    }

    .entity-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 1em;
        font-size: 0.8em;
        font-weight: 500;
        padding: 0.1em 0.6em;
        margin-left: 0.5rem;
        color: rgba(255, 255, 255, 0.95);
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 0 0.15em rgba(255, 255, 255, 0.2);
    }

    .empty-state {
        padding: 2rem 0;
        text-align: center;
        color: rgba(0, 0, 0, 0.7); /* Improved from 0.6 to 0.7 for better contrast */
        font-style: italic;
    }

    .queue-list {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
    }

    .queue-item {
        padding: 0.8rem;
        background-color: rgba(255, 255, 255, 0.6);
        border-radius: 0.3rem;
        border: 1px solid rgba(0, 0, 0, 0.1);
    }

    .queue-item-header {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        margin-bottom: 0.5rem;
    }

    .queue-item-icon {
        width: 2.5rem;
        height: 2.5rem;
        background-color: rgba(0, 0, 0, 0.05);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    :global(.unit-icon) {
        width: 1.5rem;
        height: 1.5rem;
        opacity: 0.8;
    }

    .queue-item-info {
        flex-grow: 1;
    }

    .queue-item-name {
        font-weight: 500;
        margin-bottom: 0.2rem;
        color: rgba(0, 0, 0, 0.9); /* Improved contrast */
    }

    .queue-item-time {
        font-size: 0.85rem;
        color: rgba(0, 0, 0, 0.7); /* Improved from 0.6 to 0.7 */
    }

    .cancel-button {
        width: 1.8rem;
        height: 1.8rem;
        border-radius: 50%;
        background-color: rgba(255, 59, 48, 0.1);
        border: 1px solid rgba(255, 59, 48, 0.2);
        color: rgb(255, 59, 48);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 0.9rem;
        transition: all 0.2s;
    }

    .cancel-button:hover:not(:disabled) {
        background-color: rgba(255, 59, 48, 0.2);
    }

    .progress-bar {
        height: 0.5rem;
        background-color: rgba(0, 0, 0, 0.1);
        border-radius: 0.25rem;
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        background-color: rgba(76, 175, 80, 0.7); /* Added missing background-color */
    }

    .unit-select-container {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        max-height: 16rem;
        overflow-y: auto;
        padding: 0.5rem;
        background-color: rgba(255, 255, 255, 0.5);
        border-radius: 0.3rem;
        border: 1px solid rgba(0, 0, 0, 0.1);
    }

    .unit-option {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem;
        background-color: rgba(255, 255, 255, 0.7);
        border-radius: 0.3rem;
        border: 1px solid rgba(0, 0, 0, 0.1);
        cursor: pointer;
        transition: all 0.2s;
        width: calc(50% - 0.25rem);
        text-align: left;
    }

    .unit-option:hover {
        background-color: rgba(255, 255, 255, 0.9);
        border-color: rgba(0, 0, 0, 0.2);
    }

    .unit-option.selected {
        background-color: rgba(0, 122, 255, 0.1);
        border-color: rgba(0, 122, 255, 0.3);
        box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.2);
    }

    .unit-option-icon {
        width: 2rem;
        height: 2rem;
        background-color: rgba(0, 0, 0, 0.05);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .unit-option-info {
        flex-grow: 1;
        font-size: 0.85rem;
    }

    .unit-option-name {
        font-weight: 500;
        margin-bottom: 0.2rem;
        color: rgba(0, 0, 0, 0.9); /* Improved contrast */
    }

    .unit-option-power {
        font-size: 0.75rem;
        color: rgba(0, 0, 0, 0.8); /* Improved from 0.7 to 0.8 */
    }

    .unit-details {
        padding: 1rem;
        background-color: rgba(255, 255, 255, 0.5);
        border-radius: 0.3rem;
        border: 1px solid rgba(0, 0, 0, 0.1);
    }

    h5 {
        margin: 0 0 0.5rem 0;
        font-size: 1rem;
        font-weight: 600;
        color: rgba(0, 0, 0, 0.9);
    }

    .unit-description {
        margin: 0 0 1rem 0;
        font-size: 0.9rem;
        color: rgba(0, 0, 0, 0.8); /* Improved from 0.7 to 0.8 */
    }

    .unit-stats {
        display: flex;
        gap: 1rem;
        margin-bottom: 1rem;
    }

    .unit-stat {
        font-size: 0.85rem;
    }

    .stat-label {
        font-weight: 500;
        color: rgba(0, 0, 0, 0.8); /* Improved from 0.7 to 0.8 */
    }
    
    .stat-value {
        color: rgba(0, 0, 0, 0.9); /* Improved contrast */
    }

    .unit-cost h6,
    .total-section h6 {
        margin: 0 0 0.5rem 0;
        font-size: 0.9rem;
        font-weight: 600;
        color: rgba(0, 0, 0, 0.8); /* Improved from 0.7 to 0.8 */
    }

    .cost-items,
    .total-items {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .cost-item,
    .total-item {
        display: flex;
        justify-content: space-between;
        font-size: 0.85rem;
        padding: 0.3rem 0.6rem;
        background-color: rgba(0, 0, 0, 0.05);
        border-radius: 0.2rem;
        width: calc(50% - 0.25rem);
        color: rgba(0, 0, 0, 0.8); /* Added explicit text color */
    }

    .total-item.sufficient {
        background-color: rgba(52, 199, 89, 0.1);
        border: 1px solid rgba(52, 199, 89, 0.2);
        color: rgb(20, 128, 56);
    }

    .total-item.insufficient {
        background-color: rgba(255, 59, 48, 0.1);
        border: 1px solid rgba(255, 59, 48, 0.2);
        color: rgb(168, 36, 28);
    }

    .resource-name {
        font-weight: 500;
    }

    .resource-amount {
        display: inline-flex;
        align-items: center;
        gap: 0.15rem;
        font-weight: 500;
    }

    .separator {
        opacity: 0.7;
        margin: 0 0.1rem;
    }

    /* Make sure we're responsive on small screens */
    @media (max-width: 500px) {
        .unit-option, .total-item {
            width: 100%;
        }
    }

    .unit-option.unavailable {
        opacity: 0.8; /* Improved from 0.7 to 0.8 for better visibility */
        background-color: rgba(0, 0, 0, 0.05);
        border-color: rgba(0, 0, 0, 0.1);
        cursor: help;
    }

    .unit-option.unavailable:hover {
        background-color: rgba(0, 0, 0, 0.08);
    }

    .locked-icon {
        display: inline-block;
        font-size: 0.7em;
        margin-left: 0.3rem;
        color: rgba(0, 0, 0, 0.7); /* Improved from 0.6 to 0.7 */
    }

    .unit-details.unavailable {
        background-color: rgba(0, 0, 0, 0.05);
        border-color: rgba(0, 0, 0, 0.15);
    }

    .unavailable-reason {
        margin: 0.5rem 0 1rem;
        padding: 0.5rem;
        background-color: rgba(255, 152, 0, 0.1);
        border: 1px solid rgba(255, 152, 0, 0.3);
        border-radius: 0.3rem;
        color: rgb(196, 98, 0);
        font-size: 0.85rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .unavailable-reason .locked-icon {
        font-size: 1em;
        color: rgb(196, 98, 0);
    }

    .unit-requirements {
        margin-bottom: 1rem;
    }

    .requirements-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .requirement-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        padding: 0.5rem;
        background-color: rgba(0, 0, 0, 0.05);
        border-radius: 0.3rem;
    }

    .requirement-item.met {
        background-color: rgba(52, 199, 89, 0.1);
        color: rgb(20, 128, 56);
        border: 1px solid rgba(52, 199, 89, 0.2); /* Added border for better visibility */
    }

    .requirement-item.unmet {
        background-color: rgba(255, 59, 48, 0.1);
        color: rgb(168, 36, 28);
        border: 1px solid rgba(255, 59, 48, 0.2); /* Added border for better visibility */
    }

    .requirement-icon {
        font-size: 1.2rem;
    }

    .requirement-text {
        flex-grow: 1;
    }

    .requirement-status {
        margin-left: auto;
        font-weight: bold;
    }

    h6 {
        margin: 0.8rem 0 0.5rem 0;
        font-size: 0.9rem;
        font-weight: 600;
        color: rgba(0, 0, 0, 0.8); /* Improved from 0.7 to 0.8 */
    }

    /* Add styles for quantity control and input */
    .form-group {
        margin-bottom: 1rem;
    }

    label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
        color: rgba(0, 0, 0, 0.8); /* Added explicit color */
    }

    .quantity-control {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .quantity-button {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 0.3rem;
        background-color: rgba(0, 0, 0, 0.05);
        border: 1px solid rgba(0, 0, 0, 0.1);
        color: rgba(0, 0, 0, 0.8); /* Improved text contrast */
        font-size: 1.2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
    }

    .quantity-button:hover:not(:disabled) {
        background-color: rgba(0, 0, 0, 0.1);
        border-color: rgba(0, 0, 0, 0.2);
    }

    .quantity-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    input[type="number"] {
        width: 4rem;
        height: 2.5rem;
        text-align: center;
        padding: 0 0.5rem;
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 0.3rem;
        font-size: 1rem;
        color: rgba(0, 0, 0, 0.9); /* Improved text contrast */
        background-color: rgba(255, 255, 255, 0.8);
    }

    input[type="number"]:focus {
        outline: none;
        border-color: rgba(0, 122, 255, 0.5);
        box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.2);
    }

    /* Add styles for time info */
    .time-info {
        font-size: 0.85rem;
        color: rgba(0, 0, 0, 0.8); /* Improved text contrast */
    }

    .completion-estimate {
        margin-top: 0.5rem;
        font-weight: 500;
    }

    /* Add styles for error and success messages */
    .error-message {
        margin: 1rem 0;
        padding: 0.8rem;
        background-color: rgba(255, 59, 48, 0.1);
        border: 1px solid rgba(255, 59, 48, 0.3);
        border-radius: 0.3rem;
        color: rgb(168, 36, 28);
        font-weight: 500;
    }

    .success-message {
        margin: 1rem 0;
        padding: 0.8rem;
        background-color: rgba(52, 199, 89, 0.1);
        border: 1px solid rgba(52, 199, 89, 0.3);
        border-radius: 0.3rem;
        color: rgb(20, 128, 56);
        font-weight: 500;
    }

    /* Add styles for the recruit button */
    .form-actions {
        margin-top: 1.5rem;
        display: flex;
        justify-content: center;
    }

    .recruit-button {
        padding: 0.8rem 2rem;
        background-color: rgba(0, 122, 255, 0.8); /* Increased from 0.7 to 0.8 for better contrast */
        color: white;
        border: none;
        border-radius: 0.3rem;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .recruit-button:hover:not(:disabled) {
        background-color: rgba(0, 122, 255, 0.9);
        transform: translateY(-1px);
    }

    .recruit-button:disabled {
        background-color: rgba(0, 0, 0, 0.2);
        color: rgba(255, 255, 255, 0.7);
        cursor: not-allowed;
    }

    /* Add styles for unit tooltip hint */
    .unit-tooltip-hint {
        font-size: 0.9em;
        margin-left: 0.3rem;
        opacity: 0.8;
    }

    /* Improve visibility of the unit-option when selected */
    .unit-option.selected .unit-option-name {
        color: rgba(0, 122, 255, 0.9);
    }
</style>
