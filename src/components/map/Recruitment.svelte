<script>
    import { onMount, onDestroy } from "svelte";
    import { get } from "svelte/store";
    import { game, currentPlayer } from "../../lib/stores/game.js";
    import { getFunctions, httpsCallable } from "firebase/functions";
    import Close from "../icons/Close.svelte";
    import Human from "../icons/Human.svelte";
    import Elf from "../icons/Elf.svelte";
    import Dwarf from "../icons/Dwarf.svelte";
    import Goblin from "../icons/Goblin.svelte";
    import Fairy from "../icons/Fairy.svelte";
    import Shield from "../icons/Shield.svelte";
    import Sword from "../icons/Sword.svelte";
    import Bow from "../icons/Bow.svelte";

    // Props
    const {
        structure = null,
        x = 0,
        y = 0,
        onClose = () => {},
        onRecruitStart = () => {},
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
            
            // Load available units first
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

    // Function to get available units without modifying state
    function getAvailableUnits(structure) {
        const race = structure.race?.toLowerCase();
        const playerResources = getPlayerResources();
        const structureLevel = structure.level || 1;

        // Default units available to all races
        const baseUnits = [
            {
                id: "basic_warrior",
                name: "Basic Warrior",
                description: "Basic melee fighter with sword and shield",
                type: "warrior",
                race: race || "neutral",
                cost: { wood: 2, stone: 1 },
                timePerUnit: 60, // seconds per unit
                icon: "sword",
                power: 1,
                requirements: {
                    structureLevel: 1
                }
            },
            {
                id: "scout",
                name: "Scout",
                description: "Fast unit with high visibility",
                type: "scout",
                race: race || "neutral",
                cost: { wood: 1, leather: 1 },
                timePerUnit: 45, // seconds per unit
                icon: "bow",
                power: 0.5,
                requirements: {
                    structureLevel: 1
                }
            },
        ];

        // Race-specific units
        const raceUnits = [];
        if (race === "human") {
            raceUnits.push({
                id: "human_knight",
                name: "Knight",
                description: "Heavily armored warrior with high defense",
                type: "knight",
                race: "human",
                cost: { wood: 1, stone: 2, iron: 1 },
                timePerUnit: 90,
                icon: "shield",
                power: 2,
                requirements: {
                    structureLevel: 2,
                    race: "human"
                }
            });
        } else if (race === "elf") {
            raceUnits.push({
                id: "elf_archer",
                name: "Elven Archer",
                description: "Skilled ranged fighter with deadly accuracy",
                type: "archer",
                race: "elf",
                cost: { wood: 3, leather: 1 },
                timePerUnit: 75,
                icon: "bow",
                power: 1.5,
                requirements: {
                    structureLevel: 2,
                    race: "elf"
                }
            });
        } else if (race === "dwarf") {
            raceUnits.push({
                id: "dwarf_defender",
                name: "Dwarven Defender",
                description: "Sturdy warrior specialized in defense",
                type: "defender",
                race: "dwarf",
                cost: { stone: 2, iron: 2 },
                timePerUnit: 90,
                icon: "shield",
                power: 2,
                requirements: {
                    structureLevel: 2,
                    race: "dwarf"
                }
            });
        } else if (race === "goblin") {
            raceUnits.push({
                id: "goblin_raider",
                name: "Goblin Raider",
                description: "Quick but weak fighter, good in groups",
                type: "raider",
                race: "goblin",
                cost: { wood: 1 },
                timePerUnit: 30,
                icon: "sword",
                power: 0.75,
                requirements: {
                    structureLevel: 2,
                    race: "goblin"
                }
            });
        } else if (race === "fairy") {
            raceUnits.push({
                id: "fairy_enchanter",
                name: "Fairy Enchanter",
                description: "Magical unit with support abilities",
                type: "enchanter",
                race: "fairy",
                cost: { herbs: 2, crystal: 1 },
                timePerUnit: 60,
                icon: "staff",
                power: 1.5,
                requirements: {
                    structureLevel: 2,
                    race: "fairy"
                }
            });
        }

        // Add additional race units that could be unlockable
        if (race) {
            // Add advanced unit for each race
            const advancedUnit = {
                id: `${race}_elite`,
                name: `Elite ${formatRaceName(race)}`,
                description: "Advanced unit with special abilities",
                type: "elite",
                race: race,
                cost: { wood: 2, stone: 2, iron: 1, crystal: 1 },
                timePerUnit: 120,
                icon: race === "elf" ? "bow" : "sword",
                power: 2.5,
                requirements: {
                    structureLevel: 3,
                    race: race
                }
            };
            raceUnits.push(advancedUnit);
        }

        // Add structure-specific units based on structure type
        const structureUnits = [];
        if (structure.type === "fortress" || structure.type === "stronghold") {
            structureUnits.push({
                id: "elite_guard",
                name: "Elite Guard",
                description: "Highly trained soldier with advanced combat skills",
                type: "elite",
                race: race || "neutral",
                cost: { wood: 2, stone: 2, iron: 2 },
                timePerUnit: 120,
                icon: "shield",
                power: 3,
                requirements: {
                    structureType: ["fortress", "stronghold"],
                    structureLevel: 2
                }
            });
            
            // Add a siege unit
            structureUnits.push({
                id: "siege_ram",
                name: "Battering Ram",
                description: "Siege unit effective against structures",
                type: "siege",
                race: "neutral",
                cost: { wood: 5, stone: 3, iron: 2 },
                timePerUnit: 180,
                icon: "shield",
                power: 1.5,
                requirements: {
                    structureType: ["fortress", "stronghold"],
                    structureLevel: 3,
                    research: "siegecraft"
                }
            });
        }

        // Combine all units and check availability
        const allUnits = [...baseUnits, ...raceUnits, ...structureUnits];
        
        // Process each unit to determine availability
        return allUnits.map(unit => {
            // Check requirements
            let available = true;
            let unavailableReason = "";
            
            // Structure level check
            if (unit.requirements.structureLevel > structureLevel) {
                available = false;
                unavailableReason = `Requires structure level ${unit.requirements.structureLevel}`;
            }
            
            // Race check
            if (unit.requirements.race && unit.requirements.race !== race) {
                available = false;
                unavailableReason = `Requires ${formatRaceName(unit.requirements.race)} structure`;
            }
            
            // Structure type check
            if (unit.requirements.structureType && 
                !unit.requirements.structureType.includes(structure.type)) {
                available = false;
                unavailableReason = `Requires ${formatStructureTypeName(unit.requirements.structureType[0])}`;
            }
            
            // Research check
            if (unit.requirements.research) {
                // Assuming we need to check if research is completed
                const researchCompleted = structure.research && 
                    structure.research[unit.requirements.research];
                if (!researchCompleted) {
                    available = false;
                    unavailableReason = `Requires ${formatResearchName(unit.requirements.research)} research`;
                }
            }
            
            // Return modified copy of the unit with availability info
            return {
                ...unit,
                available,
                unavailableReason
            };
        });
    }

    // Load available units - keeping for compatibility, but refactored to use getAvailableUnits
    function loadAvailableUnits(structure) {
        availableUnits = getAvailableUnits(structure);
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

    // Calculate estimated completion time - modified to avoid state changes
    function calculateCompletionTime() {
        if (!selectedUnit) return null;

        const now = Date.now();
        const secondsPerUnit = selectedUnit.timePerUnit || 60;
        const totalSeconds = secondsPerUnit * quantity;

        // Add time for existing queue items
        let queueTimeSeconds = 0;
        queue.forEach((item) => {
            if (item.completesAt && item.completesAt > now) {
                queueTimeSeconds += (item.completesAt - now) / 1000;
            }
        });

        // Total time including queue
        const totalTimeSeconds = queueTimeSeconds + totalSeconds;
        const completionDate = new Date(now + totalTimeSeconds * 1000);

        return {
            seconds: totalSeconds,
            totalSeconds: totalTimeSeconds,
            date: completionDate,
            queueSeconds: queueTimeSeconds,
            ticksRequired: Math.ceil(totalSeconds / 60), // Assuming 1 tick = 60 seconds
        };
    }

    // Format a number with commas
    function formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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

    // Format a resource name
    function formatResource(name) {
        return name.charAt(0).toUpperCase() + name.slice(1);
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

<div class="recruitment-modal">
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
                        <label for="unit-select">Unit Type</label>
                        <div class="unit-select-container">
                            {#each availableUnits as unit}
                                {@const IconComponent = getUnitIcon(unit)}
                                <button
                                    class="unit-option {selectedUnit?.id === unit.id ? 'selected' : ''} {!unit.available ? 'unavailable' : ''}"
                                    onclick={() => selectUnit(unit)}
                                    title={unit.available ? unit.description : `${unit.description} - ${unit.unavailableReason}`}
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
                                    <span class="stat-value">{formatTime(
                                        selectedUnit.timePerUnit,
                                    )} each</span>
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
                                            {@const playerResource =
                                                getPlayerResources()[
                                                    resource
                                                ] || 0}
                                            <div
                                                class="total-item {playerResource <
                                                amount
                                                    ? 'insufficient'
                                                    : ''}"
                                                title={`You have ${playerResource} ${formatResource(resource)}`}
                                            >
                                                {formatResource(resource)}: {amount}
                                                <span class="player-has"
                                                    >({playerResource})</span
                                                >
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                                <div class="total-section">
                                    <h6>Time Required:</h6>
                                    <div class="time-info">
                                        <div>
                                            Production: {formatTime(
                                                completionInfo?.seconds || 0,
                                            )}
                                        </div>
                                        {#if completionInfo?.queueSeconds > 0}
                                            <div>
                                                Queue wait: {formatTime(
                                                    completionInfo?.queueSeconds ||
                                                        0,
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
        color: rgba(0, 0, 0, 0.6); /* Increased from 0.5 for better contrast */
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
    }

    .queue-item-time {
        font-size: 0.85rem;
        color: rgba(0, 0, 0, 0.6); /* Increased from potentially lighter value */
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
        background-color: rgba(52, 199, 89, 0.8);
        transition: width 0.3s ease;
    }

    .form-content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    label {
        font-weight: 500;
        font-size: 0.9rem;
        color: rgba(0, 0, 0, 0.7);
    }

    .unit-select-container {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        max-height: 10rem;
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
    }

    .unit-option-power {
        font-size: 0.75rem;
        color: rgba(0, 0, 0, 0.7); /* Increased from 0.6 for better contrast */
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
        color: rgba(0, 0, 0, 0.9); /* Add explicit color with strong contrast */
    }

    .unit-description {
        margin: 0 0 1rem 0;
        font-size: 0.9rem;
        color: rgba(0, 0, 0, 0.7); /* Ensuring good contrast */
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
        color: rgba(0, 0, 0, 0.7); /* Increased from 0.6 for better contrast */
    }
    
    .stat-value {
        color: rgba(0, 0, 0, 0.8); /* Add explicit color with good contrast */
    }

    .unit-cost h6,
    .total-section h6 {
        margin: 0 0 0.5rem 0;
        font-size: 0.9rem;
        font-weight: 600;
        color: rgba(0, 0, 0, 0.7);
    }

    .cost-items,
    .total-items {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .cost-item,
    .total-item {
        font-size: 0.85rem;
        padding: 0.2rem 0.5rem;
        background-color: rgba(0, 0, 0, 0.05);
        border-radius: 0.2rem;
        color: rgba(0, 0, 0, 0.8); /* Add explicit color with good contrast */
    }

    .total-item.insufficient {
        background-color: rgba(255, 59, 48, 0.1);
        color: rgb(168, 36, 28);
    }

    .player-has {
        font-size: 0.75rem;
        color: rgba(0, 0, 0, 0.6); /* Increased from 0.5 for better contrast */
        margin-left: 0.2rem;
    }

    .quantity-control {
        display: flex;
        align-items: center;
        width: fit-content;
    }

    .quantity-button {
        width: 2rem;
        height: 2rem;
        background-color: rgba(0, 0, 0, 0.05);
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 0.3rem;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 1.2rem;
        font-weight: 600;
        color: rgba(0, 0, 0, 0.7);
    }

    .quantity-button:hover:not(:disabled) {
        background-color: rgba(0, 0, 0, 0.1);
    }

    input[type="number"] {
        width: 3rem;
        height: 2rem;
        text-align: center;
        font-size: 1rem;
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 0;
        margin: 0 0.5rem;
    }

    input[type="number"]::-webkit-inner-spin-button,
    input[type="number"]::-webkit-outer-spin-button {
        opacity: 0;
    }

    .totals {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1rem;
        background-color: rgba(0, 0, 0, 0.03);
        border-radius: 0.3rem;
    }

    .time-info {
        font-size: 0.85rem;
        color: rgba(0, 0, 0, 0.8); /* Added explicit color with good contrast */
    }

    .completion-estimate {
        margin-top: 0.5rem;
        font-weight: 500;
        color: rgba(0, 0, 0, 0.9); /* Added explicit color with strong contrast */
    }

    .error-message {
        padding: 0.8rem;
        background-color: rgba(255, 59, 48, 0.1);
        border: 1px solid rgba(255, 59, 48, 0.2);
        border-radius: 0.3rem;
        color: rgb(168, 36, 28);
        font-size: 0.9rem;
    }

    .success-message {
        padding: 0.8rem;
        background-color: rgba(52, 199, 89, 0.1);
        border: 1px solid rgba(52, 199, 89, 0.2);
        border-radius: 0.3rem;
        color: rgb(20, 128, 56);
        font-size: 0.9rem;
    }

    .form-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 1rem;
    }

    .recruit-button {
        padding: 0.7rem 1.2rem;
        background-color: rgba(0, 122, 255, 0.8);
        color: white;
        border: none;
        border-radius: 0.3rem;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .recruit-button:hover:not(:disabled) {
        background-color: rgba(0, 122, 255, 0.9);
    }

    .recruit-button:disabled {
        background-color: rgba(0, 0, 0, 0.2);
        cursor: not-allowed;
    }

    @media (max-width: 768px) {
        .unit-option {
            width: 100%;
        }
    }

    .unit-option.unavailable {
        opacity: 0.7;
        background-color: rgba(0, 0, 0, 0.05);
        border-color: rgba(0, 0, 0, 0.1);
        cursor: help;
    }

    .unit-option.unavailable:hover {
        background-color: rgba(0, 0, 0, 0.08);
    }

    .unit-option.unavailable .unit-icon {
        opacity: 0.5;
    }

    .locked-icon {
        display: inline-block;
        font-size: 0.7em;
        margin-left: 0.3rem;
        color: rgba(0, 0, 0, 0.6); /* Increased from 0.5 for better contrast */
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
</style>
