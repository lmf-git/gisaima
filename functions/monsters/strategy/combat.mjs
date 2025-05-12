/**
 * Monster combat strategy functions
 */

import {
  findPlayerGroupsOnTile,
  findMergeableMonsterGroups,
  createBattleActionMessage,
  createChatMessagePath,
  generateMonsterId
} from '../_monsters.mjs';

// Re-export the imported functions
export { findPlayerGroupsOnTile, findMergeableMonsterGroups };

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
  const chatMessageId = generateMonsterId('monster_merge', now);
  const location = {
    x: parseInt(tileKey.split(',')[0]),
    y: parseInt(tileKey.split(',')[1])
  };
  
  updates[createChatMessagePath(worldId, chatMessageId)] = {
    text: `${monsterGroup.name || 'Monster group'} has grown in strength, absorbing ${mergeableGroups.length} other monster groups!`,
    type: 'event',
    timestamp: now,
    location
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
    tickCount: 0
  };
  
  // Add battle to the tile
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = `${x},${y}`;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}`] = battleData;
  
  // Update monster group to be in battle
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleId`] = battleId;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleSide`] = 1;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleRole`] = 'attacker';
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/status`] = 'fighting';
  
  // Update each target group to be in battle
  for (const target of selectedTargets) {
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/battleId`] = battleId;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/battleSide`] = 2;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/battleRole`] = 'defender';
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/status`] = 'fighting';
  }
  
  // Add battle start message to chat
  const targetName = selectedTargets.length > 0 ? 
    (selectedTargets[0].name || `Player group ${selectedTargets[0].id.slice(-4)}`) :
    'Player groups';
    
  const messageId = generateMonsterId('monster_attack', now);
  updates[createChatMessagePath(worldId, messageId)] = {
    text: createBattleActionMessage(monsterGroup, 'attack', 'player', targetName, location),
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
  
  // Don't attack monster structures
  if (structure.monster === true) {
    console.log("Skipping attack on monster structure");
    return { action: null, reason: 'monster_structure' };
  }
  
  // Create battle ID and prepare battle data
  const battleId = `battle_${now}_${Math.floor(Math.random() * 1000)}`;
  
  // Create enhanced battle object with full units data
  const battleData = {
    id: battleId,
    locationX: x,
    locationY: y,
    targetTypes: ['structure'],
    structureId: structure.id,
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
        owner: structure.owner || 'unknown'
      }
    },
    tickCount: 0
  };
  
  // Add battle to the tile
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = `${x},${y}`;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}`] = battleData;
  
  // Update monster group to be in battle
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleId`] = battleId;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleSide`] = 1;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleRole`] = 'attacker';
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/status`] = 'fighting';
  
  // Mark structure as in battle
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/structure/battleId`] = battleId;
  
  // Add battle start message to chat
  const structureName = structure.name || structure.type || "Settlement";
  const messageId = generateMonsterId('monster_attack_structure', now);
  updates[createChatMessagePath(worldId, messageId)] = {
    text: createBattleActionMessage(monsterGroup, 'attack', 'structure', structureName, location),
    type: 'event',
    timestamp: now,
    location: { x, y }
  };
  
  console.log(`Monster group ${monsterGroup.id} is attacking structure ${structure.id} (type: ${structure.type}) at (${x}, ${y})`);
  
  return {
    action: 'attack',
    targetStructure: structure.id,
    structureType: structure.type,
    battleId
  };
}

/**
 * Find other monster groups on tile that could be attacked
 * @param {object} tileData - Data for the current tile
 * @param {string} currentGroupId - ID of the current monster group
 * @returns {Array} Array of attackable monster groups
 */
export function findAttackableMonsterGroups(tileData, currentGroupId) {
  const monsterGroups = [];
  
  if (tileData.groups) {
    Object.entries(tileData.groups).forEach(([groupId, groupData]) => {
      // Check if it's another monster group (and not the current one) that's not in battle
      if (groupId !== currentGroupId && 
          groupData.type === 'monster' && 
          groupData.status === 'idle') {
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
  
  // Choose a target monster group (typically just the first one)
  const targetCount = Math.min(targetGroups.length, 1); // Usually just attack one monster group at a time
  const selectedTargets = targetGroups.slice(0, targetCount);
  
  if (selectedTargets.length === 0) {
    return { action: null, reason: 'no_targets' };
  }
  
  // Create battle ID and prepare battle data
  const battleId = `battle_${now}_${Math.floor(Math.random() * 1000)}`;
  
  // Create enhanced battle object with full units data for both monster groups
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
          units: monsterGroup.units || {}
        }
      },
      name: `${monsterGroup.name || 'Feral Monsters'}`
    },
    side2: {
      groups: selectedTargets.reduce((obj, group) => {
        obj[group.id] = {
          type: 'monster',
          race: group.race || 'monster',
          units: group.units || {}
        };
        return obj;
      }, {}),
      name: selectedTargets[0].name || 'Monster Group'
    },
    tickCount: 0,
    monsterVsMonster: true // Flag this as a monster vs monster battle
  };
  
  // Add battle to the tile
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = `${x},${y}`;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battleId}`] = battleData;
  
  // Update attacker monster group to be in battle
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleId`] = battleId;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleSide`] = 1;
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/battleRole`] = 'attacker';
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${monsterGroup.id}/status`] = 'fighting';
  
  // Update defending monster group to be in battle
  for (const target of selectedTargets) {
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/battleId`] = battleId;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/battleSide`] = 2;
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/battleRole`] = 'defender';
    updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${target.id}/status`] = 'fighting';
  }
  
  // Add battle start message to chat
  const targetName = selectedTargets[0].name || "Monster group";
  const messageId = generateMonsterId('monster_attack_monster', now);
  
  updates[createChatMessagePath(worldId, messageId)] = {
    text: createBattleActionMessage(monsterGroup, 'attack', 'monster', targetName, location),
    type: 'event',
    timestamp: now,
    location: { x, y }
  };
  
  return {
    action: 'attack',
    targets: selectedTargets.map(t => t.id),
    battleId,
    targetType: 'monster'
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
 * @returns {object} Action result
 */
export async function joinExistingBattle(db, worldId, monsterGroup, tileData, updates, now) {
  const groupId = monsterGroup.id;
  const chunkKey = monsterGroup.chunkKey;
  const tileKey = monsterGroup.tileKey;
  const groupPath = `worlds/${worldId}/chunks/${chunkKey}/${tileKey}/groups/${groupId}`;
  
  // Get battles on this tile
  const battles = Object.entries(tileData.battles || {})
    .map(([battleId, battle]) => ({ id: battleId, ...battle }));
  
  if (battles.length === 0) return { action: null };
  
  // Choose a random battle to join if multiple
  const battle = battles[Math.floor(Math.random() * battles.length)];
  
  // MODIFIED: Decide which side to join - check for FERAL personality trait
  let joinAttackers = Math.random() < 0.3; // Default 30% chance to join attackers
  
  // Feral personality (or others with randomBattleSides flag) makes truly random choices
  if (monsterGroup.personality?.randomBattleSides) {
    joinAttackers = Math.random() < 0.5; // 50/50 chance for truly random choice
  }
  
  // MODIFIED: If this is a monster vs monster battle, FERAL has higher chance to join attackers
  if (battle.monsterVsMonster && monsterGroup.personality?.canAttackMonsters) {
    joinAttackers = Math.random() < 0.7; // 70% chance to join attackers in monster vs monster
  }
  
  const battleSide = joinAttackers ? 1 : 2;
  
  // Update monster group to join battle
  updates[`${groupPath}/battleId`] = battle.id;
  updates[`${groupPath}/battleSide`] = battleSide;
  updates[`${groupPath}/battleRole`] = 'reinforcement';
  updates[`${groupPath}/status`] = 'fighting';
  
  // Add monster group to battle's side - simply add to the groups object
  const sideKey = battleSide === 1 ? 'side1' : 'side2';
  updates[`worlds/${worldId}/chunks/${chunkKey}/${tileKey}/battles/${battle.id}/${sideKey}/groups/${groupId}`] = {
    type: 'monster',
    race: monsterGroup.race || 'monster',
    units: monsterGroup.units || {}
  };
  
  // Add a chat message about monsters joining the fight
  const groupName = monsterGroup.name || "Monster group";
  const joiningSide = joinAttackers ? "attackers" : "defenders";
  const location = {
    x: parseInt(tileKey.split(',')[0]),
    y: parseInt(tileKey.split(',')[1])
  };
  
  const chatMessageId = generateMonsterId('monster_join_battle', now);
  updates[createChatMessagePath(worldId, chatMessageId)] = {
    text: createBattleActionMessage(monsterGroup, 'join', joiningSide, '', location),
    type: 'event',
    timestamp: now,
    location
  };
  
  return {
    action: 'join_battle',
    battleId: battle.id,
    side: battleSide
  };
}
