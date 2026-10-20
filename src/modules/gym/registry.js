// All drills. `gym: false` drills are used only by the Eye Check.
// Gym order follows the product list; MOT is last and marked low priority.
import reaction from './drills/reaction.js';
import gonogo from './drills/gonogo.js';
import dynamicAcuity from './drills/dynamicAcuity.js';
import contrast from './drills/contrast.js';
import saccadeId from './drills/saccadeId.js';
import saccadeSnap from './drills/saccadeSnap.js';
import pursuit from './drills/pursuit.js';
import peripheral from './drills/peripheral.js';
import nearFar from './drills/nearFar.js';
import visualSpan from './drills/visualSpan.js';
import anticipation from './drills/anticipation.js';
import visualSearch from './drills/visualSearch.js';
import mot from './drills/mot.js';
import depth from './drills/depth.js';

const ALL = [saccadeSnap, pursuit, dynamicAcuity, contrast, peripheral, nearFar, visualSpan, gonogo, anticipation, visualSearch, mot, reaction, saccadeId, depth];

export const DRILLS = Object.fromEntries(ALL.map((d) => [d.id, d]));

export const gymDrills = () => ALL.filter((d) => d.gym !== false);

export const strobeDrills = () => ALL.filter((d) => d.strobeOk && d.gym !== false);
