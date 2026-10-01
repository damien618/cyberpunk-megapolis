import { terrainHeight } from './resortLayout.js';
import { poolAt } from './resortPools.js';
export function createWaterProbe(ocean,getTime) {
  return (x,z)=>{const pool=poolAt(x,z);if(pool)return {surfaceY:pool.surfaceY,bottomY:pool.bottomY,kind:'pool'};
    const bottomY=terrainHeight(x,z);if(bottomY>=0)return null;
    return {surfaceY:ocean.waterHeightAt(x,z,getTime()),bottomY,kind:'lagoon'};
  };
}
