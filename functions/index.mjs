import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { joinWorld } from './actions/joinWorld.mjs';
export { spawnPlayer } from './actions/spawnPlayer.mjs';
export { mobiliseUnits } from './actions/mobilise.mjs';
export { demobiliseUnits } from './actions/demobilise.mjs';
export { moveGroup } from './actions/move.mjs';
export { cancelMove } from './actions/cancelMove.mjs';
export { attack } from './actions/attack.mjs';
export { joinBattle } from './actions/joinBattle.mjs';
export { fleeBattle } from './actions/fleeBattle.mjs';
export { startGathering } from './actions/gather.mjs';
export { buildStructure } from './actions/build.mjs';
export { startStructureUpgrade, startBuildingUpgrade } from './actions/upgrade.mjs';
export { startCrafting, cancelCrafting } from './actions/craft.mjs';

export { processGameTicks } from './tick.mjs';