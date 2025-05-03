/**
 * Monster combat strategy functions
 */

import {
  findPlayerGroupsOnTile,
  findMergeableMonsterGroups
} from '../_monsters.mjs';

// Re-export the imported functions
export { findPlayerGroupsOnTile, findMergeableMonsterGroups };

/**
 * Find other monster groups on tile that could be attacked (not merged with)
 * Used by FERAL personality
 * @param {object} tileData - Data for the current tile
 * @param {string} currentGroupId - ID of the current monster group
 * @returns {Array} Array of attackable monster groups
 */
export function findAttackableMonsterGroups(tileData, currentGroupId) {
  const monsterGroups = [];
  
  if (tileData.groups) {
    Object.entries(tileData.groups).forEach(([groupId, groupData]) => {
      // Check if it's another monster group (and not the current one) that's idle and not in battle
      if (groupId !== currentGroupId && 
          groupData.type === 'monster' && 
          groupData.status === 'idle' && 
          !groupData.inBattle) {
        monsterGroups.push({
          id: groupId,
          ...groupData
        });
      }
    });
  }
  
  return monsterGroups;
}

/**
 * Merge monster groups on the same tile
 * @param {object} db - Firebase database reference
 * @param {string} worldId - World ID
 * @param {object} monsterGroup - The current monster group
 * @param {Array} mergeableGroups - Array of other monster groups to merge with
 * @param {object} updates - Updates object to modify
 * @param {number} now - Current timestamp
 * @returns {object} Action result with merged unit count
 */
export async function mergeMonsterGroupsOnTile(db, worldId, monsterGroup, mergeableGroups, updates, now) {
  if (!mergeableGroups || mergeableGroups.length === 0) {
    return { action: null };
  }
  
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = monsterGroup.tileKey;
  const groupId = monsterGroup.id;
  const basePath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}`;
  const groupPath = `${basePath}/groups/${groupId}`;
  
  // Get all units from mergeable groups
  let allUnits = {...(monsterGroup.units || {})};
  let totalUnitCount = Object.keys(allUnits).length;
  let itemsToAdd = [...(monsterGroup.items || [])];
  
  // Gather units and items from groups being merged
  for (const group of mergeableGroups) {
    if (group.units) {
      allUnits = {...allUnits, ...group.units};
      totalUnitCount += Object.keys(group.units).length;
    }
    
    if (group.items && group.items.length > 0) {
      itemsToAdd = [...itemsToAdd, ...group.items];
    }
    
    // Mark this group for deletion
    updates[`${basePath}/groups/${group.id}`] = null;
  }
  
  // Update the current group with all units and items
  updates[`${groupPath}/units`] = allUnits;
  updates[`${groupPath}/items`] = itemsToAdd;
  
  // Add a message about the merge
  const chatMessageId = `monster_merge_${now}_${groupId}`;
  updates[`worlds/${worldId}/chat/${chatMessageId}`] = {
    text: `${monsterGroup.name || 'Monster group'} has grown in strength, absorbing ${mergeableGroups.length} other monster groups!`,
    type: 'event',
    timestamp: now,
    location: {
      x: parseInt(tileKey.split(',')[0]),
      y: parseInt(tileKey.split(',')[1])
    }
  };
  
  return {
    action: 'merge',
    mergedGroups: mergeableGroups.length,
    totalUnits: totalUnitCount
  };
}

/**
 * Initiate an attack on player groups
 * @param {object} db - Firebase database reference
 * @param {string} worldId - World ID
 * @param {object} monsterGroup - The monster group initiating the attack
 * @param {Array} targetGroups - Array of target player groups
 * @param {object} location - The location coordinates
 * @param {object} updates - Updates object to modify
 * @param {number} now - Current timestamp
 * @returns {object} Action result
 */
export async function initiateAttackOnPlayers(db, worldId, monsterGroup, targetGroups, location, updates, now) {
  const { x, y } = location;
  
  // Choose which player groups to attack (up to 3)
  const targetCount = Math.min(targetGroups.length, 3);

  // Sort by group size or randomly if sizes unknown
  targetGroups.sort((a, b) => (a.units?.length || 1) - (b.units?.length || 1));
  
  const selectedTargets = targetGroups.slice(0, targetCount);
  
  // Create battle ID and prepare battle data
  const battleId = `battle_${now}_${Math.floor(Math.random() * 1000)}`;
  
  // Create enhanced battle object with full units data for each side
  const battleData = {
    id: battleId,
    locationX: x,
    locationY: y,
    targetTypes: ['group'],
    side1: {
      groups: {
        [monsterGroup.id]: {
          type: 'monster',
          race: monsterGroup.race || 'monster',
          units: monsterGroup.units || {} // Include full units data
        }
      },
      name: monsterGroup.name || 'Monster Attack Force'
    },
    side2: {
      groups: selectedTargets.reduce((obj, group) => {
        obj[group.id] = {
          type: group.type || 'player',
          race: group.race || 'unknown',
          units: group.units || {} // Include full units data
        };
        return obj;
      }, {}),
      name: selectedTargets.length === 1 ? 
        (selectedTargets[0].name || 'Defenders') : 'Defending Forces'
    },
    tickCount: 0,
    createdAt: now
  };
  
  // Add battle to the tile
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = `${x},${y}`;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}`] = battleData;
  
  // Update monster group to be in battle
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/inBattle`] = true;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleId`] = battleId;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleSide`] = 1;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleRole`] = 'attacker';
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/status`] = 'fighting';
  
  // Update each target group to be in battle
  for (const target of selectedTargets) {
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/inBattle`] = true;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/battleId`] = battleId;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/battleSide`] = 2;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/battleRole`] = 'defender';
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/status`] = 'fighting';
  }
  
  // Add battle start message to chat
  const targetName = selectedTargets.length > 0 ? 
    (selectedTargets[0].name || `Player group ${selectedTargets[0].id.slice(-4)}`) :
    'Player groups';
    
  const messageId = `monster_attack_${now}_${monsterGroup.id}`;
  updates[`worlds/${worldId}/chat/${messageId}`] = {
    text: `${monsterGroup.name || 'Monsters'} have attacked ${targetName} at (${x}, ${y})!`,
    type: 'event',
    timestamp: now,
    location: { x, y }
  };
  
  return {
    action: 'attack',
    targets: selectedTargets.map(t => t.id),
    battleId
  };
}

/**
 * Initiate an attack on a player structure
 * @param {object} db - Firebase database reference
 * @param {string} worldId - World ID
 * @param {object} monsterGroup - The monster group initiating the attack
 * @param {object} structure - Target structure
 * @param {object} location - The location coordinates
 * @param {object} updates - Updates object to modify
 * @param {number} now - Current timestamp
 * @returns {object} Action result
 */
export async function initiateAttackOnStructure(db, worldId, monsterGroup, structure, location, updates, now) {
  const { x, y } = location;
  
  // Create battle ID and prepare battle data
  const battleId = `battle_${now}_${Math.floor(Math.random() * 1000)}`;
  
  // Create enhanced battle object with full units data
  const battleData = {
    id: battleId,
    locationX: x,
    locationY: y,
    targetTypes: ['structure'],
    structureId: structure.id,
    structurePower: structure.defensePower || 20, // Default structure defense power
    side1: {
      groups: {
        [monsterGroup.id]: {
          type: 'monster',
          race: monsterGroup.race || 'monster',
          units: monsterGroup.units || {} // Include full units data
        }
      },
      name: monsterGroup.name || 'Monster Attack Force'
    },
    side2: {
      groups: {},
      name: structure.name || 'Structure Defenses',
      structureInfo: {
        id: structure.id,
        name: structure.name || 'Structure',
        type: structure.type || 'unknown',
        owner: structure.owner || 'unknown',
        defensePower: structure.defensePower || 20
      }
    },
    tickCount: 0,
    createdAt: now
  };
  
  // Add battle to the tile
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = `${x},${y}`;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}`] = battleData;
  
  // Update monster group to be in battle
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/inBattle`] = true;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleId`] = battleId;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleSide`] = 1;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleRole`] = 'attacker';
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/status`] = 'fighting';
  
  // Mark structure as in battle
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/inBattle`] = true;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/battleId`] = battleId;
  
  // Add battle start message to chat
  const structureName = structure.name || structure.type || "Settlement";
  const messageId = `monster_attack_structure_${now}_${monsterGroup.id}`;
  updates[`worlds/${worldId}/chat/${messageId}`] = {
    text: `${monsterGroup.name || 'Monsters'} are attacking ${structureName} at (${x}, ${y})!`,
    type: 'event',
    timestamp: now,
    location: { x, y }
  };
  
  return {
    action: 'attack',
    targetStructure: structure.id,
    battleId
  };
}

/**
 * Initiate an attack on other monster groups
 * @param {object} db - Firebase database reference
 * @param {string} worldId - World ID
 * @param {object} monsterGroup - The monster group initiating the attack
 * @param {Array} targetGroups - Array of target monster groups
 * @param {object} location - The location coordinates
 * @param {object} updates - Updates object to modify
 * @param {number} now - Current timestamp
 * @returns {object} Action result
 */
export async function initiateAttackOnMonsters(db, worldId, monsterGroup, targetGroups, location, updates, now) {
  const { x, y } = location;
  
  // Choose which monster groups to attack (up to 2)
  const targetCount = Math.min(targetGroups.length, 2);
  
  // Random selection for more unpredictable behavior
  targetGroups.sort(() => Math.random() - 0.5);
  const selectedTargets = targetGroups.slice(0, targetCount);
  
  // Create battle ID and prepare battle data
  const battleId = `battle_${now}_${Math.floor(Math.random() * 1000)}`;
  
  // Create enhanced battle object with full units data for each side
  const battleData = {
    id: battleId,
    locationX: x,
    locationY: y,
    targetTypes: ['monster_group'],
    side1: {
      groups: {
        [monsterGroup.id]: {
          type: 'monster',
          race: monsterGroup.race || 'monster',
          units: monsterGroup.units || {} // Include full units data
        }
      },
      name: monsterGroup.name || 'Feral Attackers'
    },
    side2: {
      groups: selectedTargets.reduce((obj, group) => {
        obj[group.id] = {
          type: 'monster',
          race: group.race || 'monster',
          units: group.units || {} // Include full units data
        };
        return obj;
      }, {}),
      name: selectedTargets.length === 1 ? 
        (selectedTargets[0].name || 'Defenders') : 'Defending Monsters'
    },
    monsterVsMonster: true, // Mark this as monster vs monster battle
    tickCount: 0,
    createdAt: now
  };
  
  // Add battle to the tile
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = `${x},${y}`;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}`] = battleData;
  
  // Update monster group to be in battle
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/inBattle`] = true;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleId`] = battleId;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleSide`] = 1;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleRole`] = 'attacker';
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/status`] = 'fighting';
  
  // Update each target group to be in battle
  for (const target of selectedTargets) {
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/inBattle`] = true;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/battleId`] = battleId;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/battleSide`] = 2;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/battleRole`] = 'defender';
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/status`] = 'fighting';
  }
  
  // Add battle start message to chat
  const targetName = selectedTargets.length > 0 ? 
    (selectedTargets[0].name || `Monster group`) :
    'Monster groups';
    
  const messageId = `monster_attack_monster_${now}_${monsterGroup.id}`;
  updates[`worlds/${worldId}/chat/${messageId}`] = {
    text: `${monsterGroup.name || 'Feral monsters'} have attacked ${targetName} at (${x}, ${y})!`,
    type: 'event',
    timestamp: now,
    location: { x, y }
  };
  
  return {
    action: 'attack',
    targets: selectedTargets.map(t => t.id),
    battleId,
    monsterVsMonster: true
  };
}

/**
 * Join an existing battle on this tile
 * @param {object} db - Firebase database reference
 * @param {string} worldId - World ID
 * @param {object} monsterGroup - The monster group joining the battle
 * @param {object} tileData - Data for the current tile
 * @param {object} updates - Updates object to modify
 * @param {number} now - Current timestamp
 * @param {boolean} randomSides - Whether this monster might join a random side (FERAL personality)
 * @returns {object} Action result
 */
export async function joinExistingBattle(db, worldId, monsterGroup, tileData, updates, now, randomSides = false) {
  const groupId = monsterGroup.id;
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = monsterGroup.tileKey;
  const groupPath = `worlds/${