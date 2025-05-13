<script>
  import { onMount } from 'svelte';
  import UNITS from 'gisaima-shared/definitions/UNITS.js';
  import { ITEMS, getItemPower } from 'gisaima-shared/definitions/ITEMS.js';
  import { STRUCTURES } from 'gisaima-shared/definitions/STRUCTURES.js';
  import { 
    calculateGroupPower, 
    calculatePowerRatios, 
    calculateAttrition,
    processPvPCombat,
    selectUnitsForCasualties
  } from 'gisaima-shared/war/battles.js';

  // Battle configuration
  let side1 = {
    name: 'Attackers',
    groups: {},
    casualties: 0,
    power: 0
  };
  
  let side2 = {
    name: 'Defenders',
    groups: {},
    casualties: 0,
    power: 0
  };

  // Create a simple Group class for the UI
  class Group {
    constructor(id, name, side) {
      this.id = id;
      this.name = name;
      this.units = {};
      this.items = {};
      this.side = side;
      this.power = 0;
    }

    addUnit(type, level = 1, isPlayer = false) {
      const unitId = `unit_${Object.keys(this.units).length + 1}`;
      const unitType = type || 'warrior';
      let unitData = {
        id: unitId,
        type: unitType, 
        level: level
      };

      if (isPlayer) {
        unitData.type = 'player';
        unitData.displayName = `Player ${Object.keys(this.units).length + 1}`;
      }

      this.units[unitId] = unitData;
      return unitId;
    }

    addItem(itemId, quantity = 1) {
      const newItemId = `item_${Object.keys(this.items).length + 1}`;
      this.items[newItemId] = {
        id: itemId,
        quantity: quantity
      };
    }

    calculatePower() {
      this.power = calculateGroupPower(this);
      return this.power;
    }
  }

  // Simulation state
  let simulationResults = null;
  let battleTickCount = 1;
  let showingDetailedResults = false;
  let loading = false;
  let availableUnitTypes = [];
  let availableItems = [];
  
  // New step-by-step battle simulation variables
  let stepMode = false;
  let currentTick = 0;
  let maxTicks = 0;
  let intermediateResults = [];
  let currentStepState = null;
  
  // UI state
  let selectedSide = 'side1';
  let selectedGroupId = null;
  let newGroupName = '';
  let selectedUnitType = '';
  let selectedItemId = '';
  let itemQuantity = 1;
  let unitLevel = 1;
  let battleLog = [];

  // Initialize component
  onMount(() => {
    // Get unit types from UNITS (excluding player type and monster units)
    availableUnitTypes = Object.entries(UNITS)
      .filter(([_, unit]) => unit.category === 'player' && unit.type !== 'player')
      .map(([id, unit]) => ({
        id,
        name: unit.name,
        type: unit.type
      }));
    
    // Sort unit types by name
    availableUnitTypes.sort((a, b) => a.name.localeCompare(b.name));
    
    // Add player unit type
    availableUnitTypes.unshift({
      id: 'player',
      name: 'Player Character',
      type: 'player'
    });
    
    if (availableUnitTypes.length > 0) {
      selectedUnitType = availableUnitTypes[0].id;
    }

    // Get item list (weapons and accessories first)
    availableItems = Object.entries(ITEMS)
      .filter(([_, item]) => item.power && item.power > 0)
      .map(([id, item]) => ({
        id,
        name: item.name,
        type: item.type,
        power: item.power || 0,
        rarity: item.rarity || 'common'
      }));
    
    // Sort by power descending
    availableItems.sort((a, b) => b.power - a.power);
    
    if (availableItems.length > 0) {
      selectedItemId = availableItems[0].id;
    }
    
    // Create initial groups
    addGroup('side1');
    addGroup('side2');
  });

  // Helper functions
  function addGroup(sideId) {
    const side = sideId === 'side1' ? side1 : side2;
    const newGroupId = `group_${sideId}_${Object.keys(side.groups).length + 1}`;
    const groupName = newGroupName || `${side.name} Group ${Object.keys(side.groups).length + 1}`;
    
    side.groups[newGroupId] = new Group(newGroupId, groupName, sideId === 'side1' ? 1 : 2);
    
    // Auto select the new group
    selectedSide = sideId;
    selectedGroupId = newGroupId;
    newGroupName = '';
    
    // Calculate side power
    calculateSidePowers();
  }

  function getSelectedGroup() {
    if (!selectedGroupId) return null;
    const side = selectedSide === 'side1' ? side1 : side2;
    return side.groups[selectedGroupId];
  }

  function addUnitToGroup() {
    const group = getSelectedGroup();
    if (!group) return;
    
    // Determine if it's a player character based on dropdown selection
    const isPlayerUnit = selectedUnitType === 'player';
    
    group.addUnit(selectedUnitType, unitLevel, isPlayerUnit);
    
    // Recalculate power
    calculateSidePowers();
    
    // Reset unit level to default
    unitLevel = 1;
  }

  function addItemToGroup() {
    const group = getSelectedGroup();
    if (!group) return;
    
    group.addItem(selectedItemId, itemQuantity);
    
    // Recalculate power
    calculateSidePowers();
    
    // Reset quantity
    itemQuantity = 1;
  }

  function deleteGroup(sideId, groupId) {
    const side = sideId === 'side1' ? side1 : side2;
    if (side.groups[groupId]) {
      delete side.groups[groupId];
      
      // If deleted group was selected, clear selection
      if (selectedGroupId === groupId) {
        selectedGroupId = null;
      }
      
      // Recalculate power
      calculateSidePowers();
    }
  }

  function calculateSidePowers() {
    // Calculate power for side 1
    side1.power = 0;
    Object.values(side1.groups).forEach(group => {
      side1.power += group.calculatePower();
    });
    
    // Calculate power for side 2
    side2.power = 0;
    Object.values(side2.groups).forEach(group => {
      side2.power += group.calculatePower();
    });
  }
  
  function getUnitName(unitType) {
    if (unitType === 'player') return 'Player Character';
    
    for (const [id, unit] of Object.entries(UNITS)) {
      if (id === unitType || unit.type === unitType) {
        return unit.name;
      }
    }
    return unitType.charAt(0).toUpperCase() + unitType.slice(1);
  }
  
  function getItemName(itemId) {
    return ITEMS[itemId]?.name || itemId;
  }
  
  function getRarityClass(rarity) {
    return rarity || 'common';
  }
  
  // Simulation functions
  function runBattleSimulation() {
    loading = true;
    battleLog = [];
    stepMode = false;
    currentTick = 0;
    maxTicks = battleTickCount;
    intermediateResults = [];
    
    // Clear previous results
    simulationResults = {
      winner: null,
      side1: {
        initialPower: side1.power,
        finalPower: 0,
        casualties: 0
      },
      side2: {
        initialPower: side2.power,
        finalPower: 0,
        casualties: 0
      },
      tickCount: battleTickCount,
      criticalHits: {
        side1: [],
        side2: []
      }
    };

    // Create deep copies of sides to avoid modifying original data
    const battleSide1 = JSON.parse(JSON.stringify(side1));
    const battleSide2 = JSON.parse(JSON.stringify(side2));
    
    // Add log entry
    logBattle(`Battle simulation started: ${side1.name} (${side1.power.toFixed(1)} power) vs ${side2.name} (${side2.power.toFixed(1)} power)`);
    
    if (stepMode) {
      // In step mode, we'll only process the first tick and save the state
      processNextBattleTick(battleSide1, battleSide2);
    } else {
      // In regular mode, process all ticks at once
      processAllBattleTicks(battleSide1, battleSide2);
    }
    
    loading = false;
  }
  
  // Process a single battle tick and save the state
  function processNextBattleTick(battleSide1, battleSide2) {
    if (currentTick >= maxTicks) {
      // If we've reached max ticks, finalize the battle
      finalizeBattle(intermediateResults[intermediateResults.length - 1]);
      return;
    }
    
    currentTick++;
    logBattle(`Tick ${currentTick}: Processing battle calculations`);
    
    // Current power values
    let currentSide1Power = currentTick === 1 ? side1.power : intermediateResults[currentTick - 2].powers.side1Final;
    let currentSide2Power = currentTick === 1 ? side2.power : intermediateResults[currentTick - 2].powers.side2Final;
    
    // Deep clone the current state of both sides
    const currentBattleSide1 = currentTick === 1 ? 
      JSON.parse(JSON.stringify(battleSide1)) : 
      JSON.parse(JSON.stringify(intermediateResults[currentTick - 2].sides.side1));
      
    const currentBattleSide2 = currentTick === 1 ? 
      JSON.parse(JSON.stringify(battleSide2)) : 
      JSON.parse(JSON.stringify(intermediateResults[currentTick - 2].sides.side2));
    
    // Calculate power ratios
    const { side1Ratio, side2Ratio } = calculatePowerRatios(currentSide1Power, currentSide2Power);
    logBattle(`Power ratios: Side 1: ${(side1Ratio * 100).toFixed(1)}%, Side 2: ${(side2Ratio * 100).toFixed(1)}%`);
    
    // Apply PvP combat effects if players are present
    const { side1: updatedSide1, side2: updatedSide2 } = processPvPCombat(currentBattleSide1, currentBattleSide2, currentTick);
    currentBattleSide1.groups = updatedSide1.groups;
    currentBattleSide2.groups = updatedSide2.groups;
    
    // Find critical hits
    const side1Crits = findCriticalHits(currentBattleSide1);
    const side2Crits = findCriticalHits(currentBattleSide2);
    
    // Register critical hits in results
    if (side1Crits.length > 0) {
      simulationResults.criticalHits.side1.push(...side1Crits);
      side1Crits.forEach(crit => {
        logBattle(`Critical hit: ${crit.name} on side 1!`, 'critical');
      });
    }
    
    if (side2Crits.length > 0) {
      simulationResults.criticalHits.side2.push(...side2Crits);
      side2Crits.forEach(crit => {
        logBattle(`Critical hit: ${crit.name} on side 2!`, 'critical');
      });
    }
    
    // Calculate attrition for each side
    const side1Attrition = calculateAttrition(currentSide1Power, side1Ratio, side2Ratio);
    const side2Attrition = calculateAttrition(currentSide2Power, side2Ratio, side1Ratio);
    
    logBattle(`Attrition calculated - Side 1: ${side1Attrition}, Side 2: ${side2Attrition}`);
    
    // Track casualties for this tick
    let side1Casualties = 0;
    let side2Casualties = 0;
    
    // Apply casualties to side 1
    let side1UnitsBefore = countUnits(currentBattleSide1);
    let side1RemovedUnits = 0;
    
    for (const groupId in currentBattleSide1.groups) {
      const group = currentBattleSide1.groups[groupId];
      // Calculate group's share of attrition proportional to its power
      const groupPower = calculateGroupPower(group);
      const groupShare = currentSide1Power > 0 ? groupPower / currentSide1Power : 0;
      const groupAttrition = Math.round(side1Attrition * groupShare);
      
      if (groupAttrition > 0) {
        // Select units to remove
        const { unitsToRemove } = selectUnitsForCasualties(group.units, groupAttrition);
        
        // Remove units
        unitsToRemove.forEach(unitId => {
          delete group.units[unitId];
          side1RemovedUnits++;
          side1Casualties++;
        });
        
        if (unitsToRemove.length > 0) {
          logBattle(`Side 1, Group ${group.name}: ${unitsToRemove.length} units lost`);
        }
      }
    }
    
    // Apply casualties to side 2
    let side2UnitsBefore = countUnits(currentBattleSide2);
    let side2RemovedUnits = 0;
    
    for (const groupId in currentBattleSide2.groups) {
      const group = currentBattleSide2.groups[groupId];
      // Calculate group's share of attrition proportional to its power
      const groupPower = calculateGroupPower(group);
      const groupShare = currentSide2Power > 0 ? groupPower / currentSide2Power : 0;
      const groupAttrition = Math.round(side2Attrition * groupShare);
      
      if (groupAttrition > 0) {
        // Select units to remove
        const { unitsToRemove } = selectUnitsForCasualties(group.units, groupAttrition);
        
        // Remove units
        unitsToRemove.forEach(unitId => {
          delete group.units[unitId];
          side2RemovedUnits++;
          side2Casualties++;
        });
        
        if (unitsToRemove.length > 0) {
          logBattle(`Side 2, Group ${group.name}: ${unitsToRemove.length} units lost`);
        }
      }
    }
    
    // Recalculate power after casualties
    let newSide1Power = 0;
    for (const groupId in currentBattleSide1.groups) {
      newSide1Power += calculateGroupPower(currentBattleSide1.groups[groupId]);
    }
    
    let newSide2Power = 0;
    for (const groupId in currentBattleSide2.groups) {
      newSide2Power += calculateGroupPower(currentBattleSide2.groups[groupId]);
    }
    
    logBattle(`End of tick ${currentTick} - Power levels: Side 1: ${newSide1Power.toFixed(1)}, Side 2: ${newSide2Power.toFixed(1)}`);
    
    // Determine current battle state
    let currentWinningState;
    if (newSide1Power > newSide2Power * 1.1) {
      currentWinningState = 1; // Side 1 is winning
    } else if (newSide2Power > newSide1Power * 1.1) {
      currentWinningState = 2; // Side 2 is winning
    } else {
      currentWinningState = 0; // Approximately even / draw
    }
    
    // Store the results of this tick
    const tickResult = {
      tick: currentTick,
      sides: {
        side1: currentBattleSide1,
        side2: currentBattleSide2
      },
      powers: {
        side1Initial: currentSide1Power,
        side2Initial: currentSide2Power,
        side1Final: newSide1Power,
        side2Final: newSide2Power
      },
      casualties: {
        side1: side1Casualties,
        side2: side2Casualties,
        side1Total: (currentTick === 1 ? 0 : intermediateResults[currentTick - 2].casualties.side1Total) + side1Casualties,
        side2Total: (currentTick === 1 ? 0 : intermediateResults[currentTick - 2].casualties.side2Total) + side2Casualties
      },
      criticalHits: {
        side1: side1Crits,
        side2: side2Crits
      },
      winningState: currentWinningState,
      defeated: {
        side1: countUnits(currentBattleSide1) === 0,
        side2: countUnits(currentBattleSide2) === 0
      }
    };
    
    // Add to the intermediate results
    intermediateResults.push(tickResult);
    
    // Update current state for UI
    currentStepState = tickResult;
    
    // Check for battle end conditions
    const side1Defeated = countUnits(currentBattleSide1) === 0;
    const side2Defeated = countUnits(currentBattleSide2) === 0;
    
    if (side1Defeated || side2Defeated) {
      let winner;
      if (side1Defeated && side2Defeated) {
        winner = 0; // Draw
        logBattle("Battle ended in a draw - both sides defeated!", 'important');
      } else if (side1Defeated) {
        winner = 2; // Side 2 wins
        logBattle(`${side2.name} wins the battle!`, 'important');
      } else {
        winner = 1; // Side 1 wins
        logBattle(`${side1.name} wins the battle!`, 'important');
      }
      
      // Finalize the battle with the current result
      finalizeBattle(tickResult, winner);
    }
  }
  
  // Process all ticks at once for regular mode
  function processAllBattleTicks(battleSide1, battleSide2) {
    let currentSide1Power = side1.power;
    let currentSide2Power = side2.power;
    let side1Casualties = 0;
    let side2Casualties = 0;
    let winner = null;
    
    try {
      // Simulate battle ticks
      for (let tick = 1; tick <= battleTickCount; tick++) {
        // Similar code to processNextBattleTick but without saving intermediate states
        // ...existing simulation logic from the original runBattleSimulation...
        
        logBattle(`Tick ${tick}: Processing battle calculations`);
        
        // Calculate power ratios
        const { side1Ratio, side2Ratio } = calculatePowerRatios(currentSide1Power, currentSide2Power);
        logBattle(`Power ratios: Side 1: ${(side1Ratio * 100).toFixed(1)}%, Side 2: ${(side2Ratio * 100).toFixed(1)}%`);
        
        // Apply PvP combat effects if players are present
        const { side1: updatedSide1, side2: updatedSide2 } = processPvPCombat(battleSide1, battleSide2, tick);
        battleSide1.groups = updatedSide1.groups;
        battleSide2.groups = updatedSide2.groups;
        
        // Find critical hits
        const side1Crits = findCriticalHits(battleSide1);
        const side2Crits = findCriticalHits(battleSide2);
        
        // Register critical hits in results
        if (side1Crits.length > 0) {
          simulationResults.criticalHits.side1.push(...side1Crits);
          side1Crits.forEach(crit => {
            logBattle(`Critical hit: ${crit.name} on side 1!`, 'critical');
          });
        }
        
        if (side2Crits.length > 0) {
          simulationResults.criticalHits.side2.push(...side2Crits);
          side2Crits.forEach(crit => {
            logBattle(`Critical hit: ${crit.name} on side 2!`, 'critical');
          });
        }
        
        // Calculate attrition for each side
        const side1Attrition = calculateAttrition(currentSide1Power, side1Ratio, side2Ratio);
        const side2Attrition = calculateAttrition(currentSide2Power, side2Ratio, side1Ratio);
        
        logBattle(`Attrition calculated - Side 1: ${side1Attrition}, Side 2: ${side2Attrition}`);
        
        // Apply casualties to side 1
        let side1UnitCount = countUnits(battleSide1);
        let side1RemovedUnits = 0;
        
        for (const groupId in battleSide1.groups) {
          const group = battleSide1.groups[groupId];
          // Calculate group's share of attrition proportional to its power
          const groupPower = calculateGroupPower(group);
          const groupShare = currentSide1Power > 0 ? groupPower / currentSide1Power : 0;
          const groupAttrition = Math.round(side1Attrition * groupShare);
          
          if (groupAttrition > 0) {
            // Select units to remove
            const { unitsToRemove } = selectUnitsForCasualties(group.units, groupAttrition);
            
            // Remove units
            unitsToRemove.forEach(unitId => {
              delete group.units[unitId];
              side1RemovedUnits++;
              side1Casualties++;
            });
            
            if (unitsToRemove.length > 0) {
              logBattle(`Side 1, Group ${group.name}: ${unitsToRemove.length} units lost`);
            }
          }
        }
        
        // Apply casualties to side 2
        let side2UnitCount = countUnits(battleSide2);
        let side2RemovedUnits = 0;
        
        for (const groupId in battleSide2.groups) {
          const group = battleSide2.groups[groupId];
          // Calculate group's share of attrition proportional to its power
          const groupPower = calculateGroupPower(group);
          const groupShare = currentSide2Power > 0 ? groupPower / currentSide2Power : 0;
          const groupAttrition = Math.round(side2Attrition * groupShare);
          
          if (groupAttrition > 0) {
            // Select units to remove
            const { unitsToRemove } = selectUnitsForCasualties(group.units, groupAttrition);
            
            // Remove units
            unitsToRemove.forEach(unitId => {
              delete group.units[unitId];
              side2RemovedUnits++;
              side2Casualties++;
            });
            
            if (unitsToRemove.length > 0) {
              logBattle(`Side 2, Group ${group.name}: ${unitsToRemove.length} units lost`);
            }
          }
        }
        
        // Recalculate power after casualties
        currentSide1Power = 0;
        for (const groupId in battleSide1.groups) {
          currentSide1Power += calculateGroupPower(battleSide1.groups[groupId]);
        }
        
        currentSide2Power = 0;
        for (const groupId in battleSide2.groups) {
          currentSide2Power += calculateGroupPower(battleSide2.groups[groupId]);
        }
        
        logBattle(`End of tick ${tick} - Power levels: Side 1: ${currentSide1Power.toFixed(1)}, Side 2: ${currentSide2Power.toFixed(1)}`);
        
        // Check for battle end
        const side1Defeated = currentSide1Power <= 0 || countUnits(battleSide1) === 0;
        const side2Defeated = currentSide2Power <= 0 || countUnits(battleSide2) === 0;
        
        if (side1Defeated || side2Defeated) {
          if (side1Defeated && side2Defeated) {
            winner = 0; // Draw
            logBattle("Battle ended in a draw - both sides defeated!", 'important');
          } else if (side1Defeated) {
            winner = 2; // Side 2 wins
            logBattle(`${side2.name} wins the battle!`, 'important');
          } else {
            winner = 1; // Side 1 wins
            logBattle(`${side1.name} wins the battle!`, 'important');
          }
          break;
        }
      }
      
      // If we reached max ticks without a winner
      if (winner === null) {
        if (currentSide1Power > currentSide2Power) {
          winner = 1;
          logBattle(`${side1.name} has advantage after ${battleTickCount} ticks`, 'important');
        } else if (currentSide2Power > currentSide1Power) {
          winner = 2;
          logBattle(`${side2.name} has advantage after ${battleTickCount} ticks`, 'important');
        } else {
          winner = 0; // Draw
          logBattle("Battle appears to be a stalemate after maximum ticks", 'important');
        }
      }
      
      // Update simulation results
      simulationResults.winner = winner;
      simulationResults.side1.finalPower = currentSide1Power;
      simulationResults.side1.casualties = side1Casualties;
      simulationResults.side2.finalPower = currentSide2Power;
      simulationResults.side2.casualties = side2Casualties;
      
      // Add explanations based on battle outcome
      addBattleExplanations();
      
    } catch (error) {
      logBattle(`Simulation error: ${error.message}`, 'error');
      console.error("Battle simulation error:", error);
    }
  }
  
  // Finalize a battle from step mode
  function finalizeBattle(finalTickResult, forcedWinner = null) {
    let winner;
    
    if (forcedWinner !== null) {
      winner = forcedWinner;
    } else if (finalTickResult.defeated.side1 && finalTickResult.defeated.side2) {
      winner = 0; // Draw
    } else if (finalTickResult.defeated.side1) {
      winner = 2; // Side 2 wins
    } else if (finalTickResult.defeated.side2) {
      winner = 1; // Side 1 wins
    } else if (currentTick >= maxTicks) {
      // We've reached max ticks without defeat - determine winner by power
      if (finalTickResult.powers.side1Final > finalTickResult.powers.side2Final) {
        winner = 1;
      } else if (finalTickResult.powers.side2Final > finalTickResult.powers.side1Final) {
        winner = 2;
      } else {
        winner = 0; // Draw
      }
    } else {
      // This shouldn't happen, but just in case
      winner = 0;
    }
    
    // Update simulation results
    simulationResults.winner = winner;
    simulationResults.side1.finalPower = finalTickResult.powers.side1Final;
    simulationResults.side1.casualties = finalTickResult.casualties.side1Total;
    simulationResults.side2.finalPower = finalTickResult.powers.side2Final;
    simulationResults.side2.casualties = finalTickResult.casualties.side2Total;
    
    // Add explanations based on battle outcome
    addBattleExplanations();
    
    // Set stepMode to false since we're done
    stepMode = false;
    
    // Add a message about the battle ending
    if (winner === 1) {
      logBattle(`${side1.name} wins the battle!`, 'important');
    } else if (winner === 2) {
      logBattle(`${side2.name} wins the battle!`, 'important');
    } else {
      logBattle(`The battle ends in a draw!`, 'important');
    }
  }
  
  // Step forward one tick in step mode
  function stepForward() {
    if (stepMode && currentTick < maxTicks) {
      processNextBattleTick();
    }
  }
  
  // Fast forward to the end of the battle
  function fastForward() {
    if (!stepMode || currentTick >= maxTicks) return;
    
    const currentBattleSide1 = JSON.parse(JSON.stringify(
      intermediateResults[intermediateResults.length - 1].sides.side1
    ));
    const currentBattleSide2 = JSON.parse(JSON.stringify(
      intermediateResults[intermediateResults.length - 1].sides.side2
    ));
    
    // Run the remaining ticks
    let remainingTicks = maxTicks - currentTick;
    for (let i = 0; i < remainingTicks; i++) {
      processNextBattleTick();
    }
    
    // Log that we fast-forwarded
    logBattle(`Fast-forwarded battle to conclusion`, 'info');
  }
  
  // Get victory status text
  function getStepStatusText(state) {
    if (!state) return '';
    
    if (state.defeated.side1) {
      return `${side2.name} winning decisively`;
    } else if (state.defeated.side2) {
      return `${side1.name} winning decisively`;
    }
    
    switch (state.winningState) {
      case 1:
        return `${side1.name} currently winning`;
      case 2:
        return `${side2.name} currently winning`;
      case 0:
      default:
        return 'Battle currently even';
    }
  }
  
  // Get victory status color class
  function getStepStatusClass(state) {
    if (!state) return '';
    
    if (state.defeated.side1) {
      return 'side2-winning';
    } else if (state.defeated.side2) {
      return 'side1-winning';
    }
    
    switch (state.winningState) {
      case 1:
        return 'side1-winning';
      case 2:
        return 'side2-winning';
      case 0:
      default:
        return 'even-battle';
    }
  }
  
  function toggleDetailedResults() {
    showingDetailedResults = !showingDetailedResults;
  }
  
  function resetSimulation() {
    simulationResults = null;
    battleLog = [];
    stepMode = false;
    currentTick = 0;
    maxTicks = 0;
    intermediateResults = [];
    currentStepState = null;
  }
</script>

<div class="battle-simulator">
  <h2>Battle Simulator</h2>
  <p class="simulator-intro">
    Test different battle configurations to see how the combat mechanics work. Add units and items to each side, 
    then run the simulation to see the outcome.
  </p>
  
  {#if !simulationResults}
  <div class="simulator-config">
    <div class="simulator-sides">
      <div class="side-config">
        <h3>Side 1: {side1.name}</h3>
        <div class="side-power">Power: {side1.power.toFixed(1)}</div>
        
        <div class="groups-container">
          {#each Object.entries(side1.groups) as [groupId, group]}
            <div class="group-card" class:selected={selectedGroupId === groupId && selectedSide === 'side1'}>
              <div class="group-header">
                <h4>{group.name}</h4>
                <div class="group-power">Power: {group.power.toFixed(1)}</div>
                <button class="select-btn" on:click={() => { selectedSide = 'side1'; selectedGroupId = groupId; }}>
                  Select
                </button>
                <button class="delete-btn" on:click={() => deleteGroup('side1', groupId)}>
                  ✕
                </button>
              </div>
              
              <div class="group-content">
                <div class="unit-list">
                  <strong>Units: {Object.keys(group.units).length}</strong>
                  {#each Object.entries(group.units) as [unitId, unit]}
                    <div class="unit-item">
                      <span class="unit-name">
                        {unit.displayName || getUnitName(unit.type)}
                        {unit.level > 1 ? ` (Lvl ${unit.level})` : ''}
                      </span>
                    </div>
                  {/each}
                </div>
                
                <div class="item-list">
                  <strong>Items: {Object.keys(group.items).length}</strong>
                  {#each Object.entries(group.items) as [itemId, item]}
                    <div class="item-row">
                      <span class="item-name {getRarityClass(ITEMS[item.id]?.rarity)}">
                        {getItemName(item.id)}
                        {item.quantity > 1 ? ` (${item.quantity})` : ''}
                      </span>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {/each}
          
          <button class="add-group-btn" on:click={() => addGroup('side1')}>
            + Add Group
          </button>
        </div>
      </div>
      
      <div class="side-config">
        <h3>Side 2: {side2.name}</h3>
        <div class="side-power">Power: {side2.power.toFixed(1)}</div>
        
        <div class="groups-container">
          {#each Object.entries(side2.groups) as [groupId, group]}
            <div class="group-card" class:selected={selectedGroupId === groupId && selectedSide === 'side2'}>
              <div class="group-header">
                <h4>{group.name}</h4>
                <div class="group-power">Power: {group.power.toFixed(1)}</div>
                <button class="select-btn" on:click={() => { selectedSide = 'side2'; selectedGroupId = groupId; }}>
                  Select
                </button>
                <button class="delete-btn" on:click={() => deleteGroup('side2', groupId)}>
                  ✕
                </button>
              </div>
              
              <div class="group-content">
                <div class="unit-list">
                  <strong>Units: {Object.keys(group.units).length}</strong>
                  {#each Object.entries(group.units) as [unitId, unit]}
                    <div class="unit-item">
                      <span class="unit-name">
                        {unit.displayName || getUnitName(unit.type)}
                        {unit.level > 1 ? ` (Lvl ${unit.level})` : ''}
                      </span>
                    </div>
                  {/each}
                </div>
                
                <div class="item-list">
                  <strong>Items: {Object.keys(group.items).length}</strong>
                  {#each Object.entries(group.items) as [itemId, item]}
                    <div class="item-row">
                      <span class="item-name {getRarityClass(ITEMS[item.id]?.rarity)}">
                        {getItemName(item.id)}
                        {item.quantity > 1 ? ` (${item.quantity})` : ''}
                      </span>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {/each}
          
          <button class="add-group-btn" on:click={() => addGroup('side2')}>
            + Add Group
          </button>
        </div>
      </div>
    </div>
    
    <div class="control-panel">
      <div class="group-editor">
        <h3>Group Editor</h3>
        
        {#if selectedGroupId}
          {#if getSelectedGroup()}
            <div class="editing-group">
              <p>Editing: {getSelectedGroup().name}</p>
            </div>
          
            <div class="editor-section">
              <h4>Add Unit</h4>
              <div class="input-group">
                <label>
                  Unit Type:
                  <select bind:value={selectedUnitType}>
                    {#each availableUnitTypes as unitType}
                      <option value={unitType.id}>{unitType.name}</option>
                    {/each}
                  </select>
                </label>
              </div>
              
              <div class="input-group">
                <label>
                  Unit Level:
                  <input type="number" bind:value={unitLevel} min="1" max="10" />
                </label>
              </div>
              
              <button class="add-btn" on:click={addUnitToGroup}>
                Add Unit
              </button>
            </div>
            
            <div class="editor-section">
              <h4>Add Item</h4>
              <div class="input-group">
                <label>
                  Item:
                  <select bind:value={selectedItemId}>
                    {#each availableItems as item}
                      <option value={item.id}>
                        {item.name} (Power: {item.power})
                      </option>
                    {/each}
                  </select>
                </label>
              </div>
              
              <div class="input-group">
                <label>
                  Quantity:
                  <input type="number" bind:value={itemQuantity} min="1" max="10" />
                </label>
              </div>
              
              <button class="add-btn" on:click={addItemToGroup}>
                Add Item
              </button>
            </div>
          {:else}
            <p>Selected group not found</p>
          {/if}
        {:else}
          <p>Select a group to edit</p>
        {/if}
      </div>
      
      <div class="simulation-controls">
        <h3>Simulation Settings</h3>
        <div class="input-group">
          <label>
            Battle Ticks:
            <input type="number" bind:value={battleTickCount} min="1" max="10" />
          </label>
          <span class="input-help">Higher values simulate longer battles</span>
        </div>
        
        <div class="sim-buttons">
          <button class="simulate-btn" on:click={() => runBattleSimulation(false)} disabled={loading}>
            {loading ? 'Simulating...' : 'Run Full Battle Simulation'}
          </button>
          
          <button class="step-btn" on:click={() => runBattleSimulation(true)} disabled={loading}>
            Start Step-by-Step
          </button>
        </div>
      </div>
    </div>
  </div>
  {:else if stepMode && currentTick < maxTicks && !currentStepState?.defeated.side1 && !currentStepState?.defeated.side2}
  <!-- Step-by-step mode UI -->
  <div class="simulation-results step-mode">
    <h3>Battle In Progress - Tick {currentTick} of {maxTicks}</h3>
    
    <div class="step-status {getStepStatusClass(currentStepState)}">
      {getStepStatusText(currentStepState)}
    </div>
    
    <div class="casualties-summary">
      <div class="side-result">
        <h4>{side1.name}</h4>
        <div>Power: {currentStepState?.powers.side1Final.toFixed(1)} 
          <span class="power-change {currentStepState?.powers.side1Final >= currentStepState?.powers.side1Initial ? 'power-increase' : 'power-decrease'}">
            ({(currentStepState?.powers.side1Final - currentStepState?.powers.side1Initial).toFixed(1)})
          </span>
        </div>
        <div>Casualties This Tick: {currentStepState?.casualties.side1}</div>
        <div>Total Casualties: {currentStepState?.casualties.side1Total}</div>
        {#if currentStepState?.criticalHits.side1.length > 0}
          <div class="critical-hits">
            Critical Hits: {currentStepState.criticalHits.side1.length}
          </div>
        {/if}
      </div>
      
      <div class="side-result">
        <h4>{side2.name}</h4>
        <div>Power: {currentStepState?.powers.side2Final.toFixed(1)}
          <span class="power-change {currentStepState?.powers.side2Final >= currentStepState?.powers.side2Initial ? 'power-increase' : 'power-decrease'}">
            ({(currentStepState?.powers.side2Final - currentStepState?.powers.side2Initial).toFixed(1)})
          </span>
        </div>
        <div>Casualties This Tick: {currentStepState?.casualties.side2}</div>
        <div>Total Casualties: {currentStepState?.casualties.side2Total}</div>
        {#if currentStepState?.criticalHits.side2.length > 0}
          <div class="critical-hits">
            Critical Hits: {currentStepState.criticalHits.side2.length}
          </div>
        {/if}
      </div>
    </div>
    
    <div class="step-controls">
      <button class="step-btn" on:click={stepForward}>
        Next Tick →
      </button>
      <button class="fast-forward-btn" on:click={fastForward}>
        Fast Forward ⏩
      </button>
      <button class="reset-btn" on:click={resetSimulation}>
        Reset
      </button>
    </div>
    
    <div class="battle-progress">
      <div class="progress-bar">
        <div class="progress-fill" style="width: {(currentTick / maxTicks * 100)}%"></div>
      </div>
      <div class="tick-markers">
        {#each Array(maxTicks) as _, i}
          <div class="tick-marker {i < currentTick ? 'completed' : ''}" title="Tick {i+1}"></div>
        {/each}
      </div>
    </div>
    
    {#if showingDetailedResults}
      <div class="battle-log">
        <h4>Battle Log</h4>
        <div class="log-entries">
          {#each battleLog as entry}
            <div class="log-entry {entry.type}">
              {entry.message}
            </div>
          {/each}
        </div>
      </div>
    {/if}
    
    <button class="toggle-btn" on:click={toggleDetailedResults}>
      {showingDetailedResults ? 'Hide Details' : 'Show Battle Details'}
    </button>
  </div>
  {:else}
  <!-- Final results UI -->
  <div class="simulation-results">
    <h3>Battle Results</h3>
    
    <div class="result-summary">
      {#if simulationResults.winner === 1}
        <div class="winner side1-winner">
          Side 1: {side1.name} Wins!
        </div>
      {:else if simulationResults.winner === 2}
        <div class="winner side2-winner">
          Side 2: {side2.name} Wins!
        </div>
      {:else}
        <div class="winner draw">
          Battle Ended in a Draw
        </div>
      {/if}
      
      <div class="casualties-summary">
        <div class="side-result">
          <h4>{side1.name}</h4>
          <div>Initial Power: {simulationResults.side1.initialPower.toFixed(1)}</div>
          <div>Final Power: {simulationResults.side1.finalPower.toFixed(1)}</div>
          <div>Casualties: {simulationResults.side1.casualties}</div>
          {#if simulationResults.criticalHits.side1.length > 0}
            <div class="critical-hits">
              Critical Hits: {simulationResults.criticalHits.side1.length}
            </div>
          {/if}
        </div>
        
        <div class="side-result">
          <h4>{side2.name}</h4>
          <div>Initial Power: {simulationResults.side2.initialPower.toFixed(1)}</div>
          <div>Final Power: {simulationResults.side2.finalPower.toFixed(1)}</div>
          <div>Casualties: {simulationResults.side2.casualties}</div>
          {#if simulationResults.criticalHits.side2.length > 0}
            <div class="critical-hits">
              Critical Hits: {simulationResults.criticalHits.side2.length}
            </div>
          {/if}
        </div>
      </div>
    </div>
    
    <div class="result-actions">
      <button class="toggle-btn" on:click={toggleDetailedResults}>
        {showingDetailedResults ? 'Hide Details' : 'Show Battle Details'}
      </button>
      <button class="reset-btn" on:click={resetSimulation}>
        Reset Simulation
      </button>
    </div>
    
    {#if showingDetailedResults}
      <div class="battle-log">
        <h4>Battle Log</h4>
        <div class="log-entries">
          {#each battleLog as entry}
            <div class="log-entry {entry.type}">
              {entry.message}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
  {/if}
  
  <div class="simulator-footer">
    <h3>How Battle Mechanics Work</h3>
    <div class="mechanics-explanation">
      <p>
        The battle simulator uses Gisaima's actual battle calculations. Here's how it works:
      </p>
      <ol>
        <li><strong>Group Power</strong>: Each group's power is calculated based on its units and items</li>
        <li><strong>Power Ratios</strong>: The relative strength of each side affects casualty rates</li>
        <li><strong>PvP Detection</strong>: If player units are present on both sides, critical hit mechanics are applied</li>
        <li><strong>Critical Hits</strong>: Players can land critical hits which provide protection from attrition</li>
        <li><strong>Attrition</strong>: Each side takes casualties based on their power ratio</li>
        <li><strong>Casualty Selection</strong>: Units are selected for removal based on their type and critical hit status</li>
      </ol>
      <p>
        <strong>Key factors affecting battle outcomes:</strong>
      </p>
      <ul>
        <li>Total power of each side</li>
        <li>Presence of player units (which get special protection)</li>
        <li>Critical hits in PvP battles</li>
        <li>Multiple players on same side creating "combo criticals"</li>
        <li>Battle duration (longer battles increase critical hit chances)</li>
      </ul>
    </div>
  </div>
</div>

<style>
  .battle-simulator {
    background-color: rgba(255, 255, 255, 0.85);
    border-radius: 0.5em;
    border: 0.05em solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.1);
    padding: 1.5em;
    margin: 2em 0;
    color: rgba(0, 0, 0, 0.8);
  }
  
  .battle-simulator h2 {
    color: rgba(0, 0, 0, 0.8);
    margin-top: 0;
    font-size: 1.8em;
    margin-bottom: 0.8em;
    font-family: var(--font-heading);
    font-weight: 600;
  }
  
  .simulator-intro {
    margin-bottom: 1.5em;
  }
  
  .simulator-config {
    display: flex;
    flex-direction: column;
    gap: 1.5em;
  }
  
  .simulator-sides {
    display: flex;
    flex-direction: column;
    gap: 1.5em;
  }
  
  @media (min-width: 768px) {
    .simulator-sides {
      flex-direction: row;
      gap: 2em;
    }
  }
  
  .side-config {
    flex: 1;
    background-color: rgba(0, 0, 0, 0.03);
    border-radius: 0.5em;
    padding: 1em;
  }
  
  .side-config h3 {
    margin-top: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 1.4em;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    padding-bottom: 0.5em;
    margin-bottom: 0.5em;
  }
  
  .side-power {
    font-weight: bold;
    font-size: 1.1em;
    margin-bottom: 1em;
  }
  
  .groups-container {
    display: flex;
    flex-direction: column;
    gap: 1em;
  }
  
  .group-card {
    background-color: white;
    border-radius: 0.5em;
    border: 1px solid rgba(0, 0, 0, 0.1);
    padding: 1em;
    transition: all 0.2s ease;
  }
  
  .group-card.selected {
    box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.5);
    border-color: rgba(66, 133, 244, 0.5);
  }
  
  .group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1em;
  }
  
  .group-header h4 {
    margin: 0;
    flex: 1;
    font-size: 1.1em;
  }
  
  .group-power {
    margin-right: 1em;
    font-size: 0.9em;
    color: rgba(0, 0, 0, 0.6);
  }
  
  .select-btn, .delete-btn {
    padding: 0.2em 0.5em;
    font-size: 0.8em;
    background: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-left: 0.5em;
  }
  
  .select-btn:hover {
    background: rgba(66, 133, 244, 0.1);
    border-color: rgba(66, 133, 244, 0.2);
  }
  
  .delete-btn:hover {
    background: rgba(244, 67, 54, 0.1);
    border-color: rgba(244, 67, 54, 0.2);
    color: rgba(244, 67, 54, 0.8);
  }
  
  .group-content {
    display: flex;
    gap: 1em;
    font-size: 0.9em;
  }
  
  .unit-list, .item-list {
    flex: 1;
  }
  
  .unit-item, .item-row {
    margin-top: 0.5em;
    display: flex;
    align-items: center;
  }
  
  .unit-name, .item-name {
    background: rgba(0, 0, 0, 0.03);
    padding: 0.2em 0.5em;
    border-radius: 0.3em;
    display: inline-block;
    font-size: 0.9em;
    border: 1px solid rgba(0, 0, 0, 0.05);
  }
  
  .item-name.common {
    background: rgba(158, 158, 158, 0.1);
    border-color: rgba(158, 158, 158, 0.3);
  }
  
  .item-name.uncommon {
    background: rgba(76, 175, 80, 0.1);
    border-color: rgba(76, 175, 80, 0.3);
    color: rgba(46, 125, 50, 0.9);
  }
  
  .item-name.rare {
    background: rgba(33, 150, 243, 0.1);
    border-color: rgba(33, 150, 243, 0.3);
    color: rgba(2, 119, 189, 0.9);
  }
  
  .item-name.epic {
    background: rgba(156, 39, 176, 0.1);
    border-color: rgba(156, 39, 176, 0.3);
    color: rgba(123, 31, 162, 0.9);
  }
  
  .add-group-btn {
    background: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.3em;
    padding: 0.7em;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: center;
    color: rgba(0, 0, 0, 0.6);
  }
  
  .add-group-btn:hover {
    background: rgba(0, 0, 0, 0.08);
    color: rgba(0, 0, 0, 0.8);
  }
  
  .control-panel {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5em;
  }
  
  @media (min-width: 768px) {
    .control-panel {
      grid-template-columns: 1fr 1fr;
      gap: 2em;
    }
  }
  
  .group-editor, .simulation-controls {
    background-color: rgba(0, 0, 0, 0.03);
    border-radius: 0.5em;
    padding: 1em;
  }
  
  .group-editor h3, .simulation-controls h3 {
    margin-top: 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    padding-bottom: 0.5em;
    font-size: 1.2em;
    margin-bottom: 1em;
  }
  
  .editor-section {
    margin-bottom: 1.5em;
    padding-bottom: 1.5em;
    border-bottom: 1px dashed rgba(0, 0, 0, 0.1);
  }
  
  .editor-section:last-child {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
  }
  
  .editor-section h4 {
    margin-top: 0;
    margin-bottom: 0.8em;
    font-size: 1em;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .input-group {
    margin-bottom: 1em;
  }
  
  .input-group label {
    display: block;
    margin-bottom: 0.5em;
    color: rgba(0, 0, 0, 0.7);
  }
  
  .input-group select, .input-group input[type="number"] {
    width: 100%;
    padding: 0.5em;
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 0.3em;
  }
  
  .input-help {
    display: block;
    font-size: 0.8em;
    color: rgba(0, 0, 0, 0.5);
    margin-top: 0.3em;
  }
  
  .add-btn, .simulate-btn {
    background-color: rgba(66, 133, 244, 0.1);
    border: 1px solid rgba(66, 133, 244, 0.3);
    color: rgba(66, 133, 244, 0.8);
    padding: 0.7em 1em;
    border-radius: 0.3em;
    cursor: pointer;
    font-weight: bold;
    transition: all 0.2s ease;
    width: 100%;
    margin-top: 0.5em;
  }
  
  .add-btn:hover, .simulate-btn:hover {
    background-color: rgba(66, 133, 244, 0.2);
    color: rgba(66, 133, 244, 1);
  }
  
  .simulate-btn {
    background-color: rgba(66, 133, 244, 0.8);
    color: white;
    font-size: 1.1em;
    padding: 0.8em;
    margin-top: 1.5em;
  }
  
  .simulate-btn:hover {
    background-color: rgba(66, 133, 244, 1);
    color: white;
  }
  
  .simulate-btn:disabled {
    background-color: rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.4);
    cursor: not-allowed;
    border-color: rgba(0, 0, 0, 0.1);
  }
  
  /* Results styling */
  .simulation-results {
    background-color: rgba(255, 255, 255, 0.5);
    border-radius: 0.5em;
    border: 1px solid rgba(0, 0, 0, 0.1);
    padding: 1.5em;
  }
  
  .simulation-results h3 {
    margin-top: 0;
    text-align: center;
    font-size: 1.4em;
    margin-bottom: 1em;
    color: rgba(0, 0, 0, 0.8);
  }
  
  .result-summary {
    display: flex;
    flex-direction: column;
    gap: 1.5em;
    align-items: center;
  }
  
  .winner {
    font-size: 1.5em;
    font-weight: bold;
    text-align: center;
    padding: 0.8em 1.5em;
    border-radius: 0.5em;
    color: white;
    width: 100%;
    max-width: 500px;
  }
  
  .side1-winner {
    background-color: rgba(33, 150, 243, 0.8);
  }
  
  .side2-winner {
    background-color: rgba(244, 67, 54, 0.8);
  }
  
  .draw {
    background-color: rgba(158, 158, 158, 0.8);
  }
  
  .casualties-summary {
    display: flex;
    width: 100%;
    gap: 2em;
    justify-content: center;
    flex-wrap: wrap;
  }
  
  .side-result {
    background-color: white;
    border-radius: 0.5em;
    padding: 1em;
    flex: 1;
    min-width: 200px;
    max-width: 300px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  .side-result h4 {
    margin-top: 0;
    margin-bottom: 0.8em;
    text-align: center;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    padding-bottom: 0.5em;
  }
  
  .critical-hits {
    margin-top: 0.5em;
    color: rgb(156, 39, 176);
    font-weight: bold;
  }
  
  .result-actions {
    display: flex;
    justify-content: center;
    gap: 1em;
    margin-top: 2em;
    flex-wrap: wrap;
  }
  
  .toggle-btn, .reset-btn {
    padding: 0.8em 1.5em;
    border-radius: 0.3em;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .toggle-btn {
    background-color: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.7);
  }
  
  .toggle-btn:hover {
    background-color: rgba(0, 0, 0, 0.08);
    color: rgba(0, 0, 0, 0.9);
  }
  
  .reset-btn {
    background-color: rgba(244, 67, 54, 0.1);
    border: 1px solid rgba(244, 67, 54, 0.3);
    color: rgba(244, 67, 54, 0.8);
  }
  
  .reset-btn:hover {
    background-color: rgba(244, 67, 54, 0.2);
    color: rgba(244, 67, 54, 1);
  }
  
  .battle-log {
    margin-top: 2em;
    background-color: rgba(0, 0, 0, 0.03);
    border-radius: 0.5em;
    padding: 1em;
    border: 1px solid rgba(0, 0, 0, 0.05);
  }
  
  .battle-log h4 {
    margin-top: 0;
    margin-bottom: 1em;
    text-align: center;
  }
  
  .log-entries {
    max-height: 300px;
    overflow-y: auto;
    font-family: monospace;
    background-color: rgba(0, 0, 0, 0.02);
    padding: 0.5em;
    border-radius: 0.3em;
  }
  
  .log-entry {
    padding: 0.3em 0;
    border-bottom: 1px dashed rgba(0, 0, 0, 0.05);
    line-height: 1.4;
    white-space: pre-wrap;
    font-size: 0.9em;
  }
  
  .log-entry:last-child {
    border-bottom: none;
  }
  
  .log-entry.error {
    color: #d32f2f;
  }
  
  .log-entry.important {
    color: #0277bd;
    font-weight: bold;
  }
  
  .log-entry.critical {
    color: #7b1fa2;
    font-weight: bold;
  }
  
  .log-entry.section {
    color: #2e7d32;
    font-weight: bold;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
    margin-top: 0.5em;
    padding-top: 0.8em;
  }
  
  /* Footer section */
  .simulator-footer {
    margin-top: 3em;
    padding: 1em;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
    background-color: rgba(0, 0, 0, 0.02);
    border-radius: 0.5em;
  }
  
  .simulator-footer h3 {
    text-align: center;
    font-size: 1.3em;
    margin-top: 0;
    margin-bottom: 1em;
    color: rgba(0, 0, 0, 0.8);
  }
  
  .mechanics-explanation {
    color: rgba(0, 0, 0, 0.7);
  }
  
  .mechanics-explanation p {
    margin-bottom: 1em;
    line-height: 1.6;
  }
  
  .mechanics-explanation ol, .mechanics-explanation ul {
    padding-left: 1.5em;
    margin-bottom: 1.5em;
  }
  
  .mechanics-explanation li {
    margin-bottom: 0.5em;
    line-height: 1.6;
  }
  
  .mechanics-explanation strong {
    color: rgba(0, 0, 0, 0.8);
  }
  
  /* New styles for step-by-step mode */
  .sim-buttons {
    display: flex;
    gap: 0.8em;
    flex-wrap: wrap;
    margin-top: 1.5em;
  }
  
  .step-btn {
    background-color: rgba(76, 175, 80, 0.8);
    color: white;
    padding: 0.8em 1em;
    border-radius: 0.3em;
    border: none;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s ease;
    flex: 1;
  }
  
  .step-btn:hover {
    background-color: rgba(76, 175, 80, 1);
  }
  
  .fast-forward-btn {
    background-color: rgba(255, 152, 0, 0.8);
    color: white;
    padding: 0.8em 1em;
    border-radius: 0.3em;
    border: none;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .fast-forward-btn:hover {
    background-color: rgba(255, 152, 0, 1);
  }
  
  .step-mode {
    border: 2px solid rgba(0, 0, 0, 0.1);
  }
  
  .step-status {
    text-align: center;
    font-size: 1.2em;
    font-weight: bold;
    padding: 0.5em;
    border-radius: 0.3em;
    margin: 1em 0;
  }
  
  .side1-winning {
    background-color: rgba(33, 150, 243, 0.1);
    color: rgba(33, 150, 243, 0.9);
    border: 1px solid rgba(33, 150, 243, 0.3);
  }
  
  .side2-winning {
    background-color: rgba(244, 67, 54, 0.1);
    color: rgba(244, 67, 54, 0.9);
    border: 1px solid rgba(244, 67, 54, 0.3);
  }
  
  .even-battle {
    background-color: rgba(158, 158, 158, 0.1);
    color: rgba(158, 158, 158, 0.9);
    border: 1px solid rgba(158, 158, 158, 0.3);
  }
  
  .step-controls {
    display: flex;
    gap: 1em;
    justify-content: center;
    margin: 1.5em 0;
  }
  
  .battle-progress {
    margin: 1.5em 0;
  }
  
  .progress-bar {
    width: 100%;
    height: 0.6em;
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 1em;
    overflow: hidden;
    margin-bottom: 0.5em;
  }
  
  .progress-fill {
    height: 100%;
    background-color: rgba(76, 175, 80, 0.7);
    transition: width 0.3s ease;
  }
  
  .tick-markers {
    display: flex;
    width: 100%;
    justify-content: space-between;
  }
  
  .tick-marker {
    width: 0.5em;
    height: 0.5em;
    border-radius: 50%;
    background-color: rgba(0, 0, 0, 0.2);
  }
  
  .tick-marker.completed {
    background-color: rgba(76, 175, 80, 0.7);
  }
  
  .power-change {
    font-size: 0.9em;
    margin-left: 0.3em;
  }
  
  .power-increase {
    color: #4caf50;
  }
  
  .power-decrease {
    color: #f44336;
  }
  
  .simulate-btn {
    flex: 1;
  }
</style>
