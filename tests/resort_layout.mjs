import * as L from '../resortLayout.js';
import { POOLS,poolAt } from '../resortPools.js';
let failed=0;
function check(name,ok){console.log(`${ok?'ok  ':'FAIL'} ${name}`);if(!ok)failed++;}
check('12 water bungalows, 6 garden, 4 central',L.BUNGALOWS.length===12&&L.GARDEN_BUNGALOWS.length===6&&L.CENTRAL_BUILDINGS.length===4);
const gallery=L.CENTRAL_BUILDINGS.find(b=>b.kind==='gallery');
check('gallery faces reception on dry raised ground',gallery?.id==='matisse-gallery'&&gallery.x===12&&gallery.z===60&&gallery.yaw===Math.PI&&Math.abs(gallery.y-L.terrainHeight(gallery.x,gallery.z)-.3)<1e-9);
check('gallery approach reserved from planting',[48,50,52,53.5].every(z=>L.pathDistance(12,z)===0&&!L.keepOffBuilt(12,z)));
check('gallery deck and stairs clear avenue',gallery.z-gallery.d/2-gallery.terrace-.83>51.1);
check('three private pools',POOLS.length===3);
check('all arrivals dry and inside bounds',[L.SPAWN,L.FOREST_ARRIVAL].every(p=>L.terrainHeight(p.x,p.z)>0&&p.x<L.BOUNDS.x1&&p.z<L.BOUNDS.z1));
console.log('bungalow depths',JSON.stringify(L.BUNGALOWS.map(b=>[b.id,L.depthAt(b.x,b.z)])));
check('bungalows over lagoon',L.BUNGALOWS.every(b=>L.depthAt(b.x,b.z)>1.4&&L.depthAt(b.x,b.z)<3));
check('garden buildings dry',L.GARDEN_BUNGALOWS.every(b=>L.terrainHeight(b.x,b.z)>1));
check('waterline continuous',[-130,-60,0,60,130].every(x=>Math.abs(L.terrainHeight(x,L.shoreAt(x)-.001)-L.terrainHeight(x,L.shoreAt(x)+.001))<.001));
check('clear avenue and footprints',[...L.BUILDINGS.map(b=>[b.x,b.z]),[0,48],[L.HAMMOCK.x,L.HAMMOCK.z]].every(([x,z])=>!L.keepOffBuilt(x,z)));
for(const b of L.BUNGALOWS){const a=L.localPoint(b,1,2),p=L.toLocal(b,a.x,a.z);check(`${b.id} coordinate frame`,Math.abs(p.x-1)<1e-9&&Math.abs(p.z-2)<1e-9);}
check('pools at expected footprints',POOLS.every(p=>{const c=L.localPoint(p.building,p.lx,p.lz);return poolAt(c.x,c.z)===p&&Math.abs(p.surfaceY-p.bottomY-1.35)<1e-6;}));
check('bounds enclose bungalows',L.BUNGALOWS.every(b=>b.x>L.BOUNDS.x0+10&&b.x<L.BOUNDS.x1-10&&b.z>L.BOUNDS.z0+15));
globalThis.__resortLayoutFailed=failed;
