// All drills. `gym: false` drills are used only by the Eye Check.
import reaction from './drills/reaction.js';
import gonogo from './drills/gonogo.js';
import dynamicAcuity from './drills/dynamicAcuity.js';
import contrast from './drills/contrast.js';
import saccadeId from './drills/saccadeId.js';
import pursuit from './drills/pursuit.js';
import anticipation from './drills/anticipation.js';
import depth from './drills/depth.js';

export const DRILLS = Object.fromEntries([reaction, gonogo, dynamicAcuity, contrast, saccadeId, pursuit, anticipation, depth].map((d) => [d.id, d]));

export function registerDrill(d) { DRILLS[d.id] = d; }

export const gymDrills = () => Object.values(DRILLS).filter((d) => d.gym !== false);
