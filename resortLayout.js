// Metres; pure functions shared by the renderer, scatter and movement tests.
export const SEA_Y = 0, SHORE_Z = 0, DECK_Y = 1.35;
export const BOUNDS = { x0: -170, x1: 170, z0: -190, z1: 90 };
export const SPAWN = { x: 10, z: 26, yaw: 0 };
export const FOREST_GATE = { x: 135, z: 48, r: 3 };
export const FOREST_ARRIVAL = { x: 128, z: 48, yaw: Math.PI / 2 };
export const HAMMOCK = { x: -24, z: 14, y: 2.0, yaw: Math.PI / 2, returnX: -24, returnZ: 17 };
export const HAMMOCK_PALMS = [{ x: -27, z: 14, h: 10, ry: Math.PI / 2, rx: -0.08 }, { x: -21, z: 14, h: 11, ry: -Math.PI / 2, rx: -0.08 }];
export const BOARDWALK_POINTS = [
  [[-57, 15], [-55, -12], [-66, -44], [-79, -78], [-75, -116], [-65, -139]],
  [[54, 15], [53, -12], [64, -44], [78, -78], [76, -116], [65, -139]],
];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function smoothstep(x, a, b) { const t = clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); }
export function shoreAt(x) { return 2 + 5*Math.cos(x*0.012) + 1.1*Math.sin(x*0.036); }
export function bedHeight(x, z) {
  const d = Math.max(0, shoreAt(x)-z);
  return -(1.6*smoothstep(d,0,30) + .009*Math.max(0,d-30) + Math.max(0,d-155)*.08);
}
export function terrainHeight(x, z) {
  const d = z-shoreAt(x);
  if (d < 0) return bedHeight(x,z);
  return 1.95*smoothstep(d,0,30) + Math.max(0,z-68)*0.075;
}
export function depthAt(x,z) { return Math.max(0,SEA_Y-terrainHeight(x,z)); }
export function terrainSlope(x,z) { return Math.hypot(terrainHeight(x+0.5,z)-terrainHeight(x-0.5,z),terrainHeight(x,z+0.5)-terrainHeight(x,z-0.5)); }
export const bedGLSL = `
float shoreDist(vec2 p) { return 2.0+5.0*cos(p.x*0.012)+1.1*sin(p.x*0.036); }
float bedHeight(vec2 p) { float d=max(0.0,shoreDist(p)-p.y); return -(1.6*smoothstep(0.0,30.0,d)+0.009*max(0.0,d-30.0)+max(0.0,d-155.0)*0.08); }`;
export function catmull(points, segments=100) {
  const out=[];
  for(let k=0;k<=segments;k++) {
    const u=k/segments*(points.length-1), i=Math.min(points.length-2,Math.floor(u)),t=u-i;
    const a=points[Math.max(0,i-1)],b=points[i],c=points[i+1],d=points[Math.min(points.length-1,i+2)];
    out.push([0,1].map(j=>0.5*(2*b[j]+(-a[j]+c[j])*t+(2*a[j]-5*b[j]+4*c[j]-d[j])*t*t+(-a[j]+3*b[j]-3*c[j]+d[j])*t*t*t)));
  }
  return out;
}
export const BOARDWALKS = BOARDWALK_POINTS.map(p=>catmull(p));
export function pathDistance(x,z) {
  // Garden avenue, reception forecourt and the route back to the forest.
  const avenue=Math.hypot(Math.max(-100-x,0,x-100),z-48);
  const forest=Math.hypot(Math.max(100-x,0,x-FOREST_GATE.x),z-48);
  const galleryApproach=Math.hypot(x-12,Math.max(48-z,0,z-53.5));
  return Math.min(avenue,forest,galleryApproach,Math.hypot(x-10,Math.max(24-z,0,z-48)));
}
function frame(p,i) {
  const [x,z]=p[i], [ax,az]=p[i-1],[bx,bz]=p[i+1];
  const length=Math.hypot(bx-ax,bz-az);
  return {x,z,nx:-(bz-az)/length,nz:(bx-ax)/length};
}
export const BUNGALOWS = BOARDWALKS.flatMap((p,arm)=>[30,41,52,64,76,88].map((k,j)=> {
  const f=frame(p,k), side=(j%2===0?1:-1),nx=f.nx*side,nz=f.nz*side;
  const premium=(arm===0 && j===5)||(arm===1 && (j===4||j===5));
  return {id:`water-${arm*6+j+1}`,kind:'water',premium,x:f.x+nx*13,z:f.z+nz*13,y:DECK_Y,
    yaw:Math.atan2(nx,nz),w:premium?8:6,d:8,terrace:premium?5:4,branch:{x:f.x,z:f.z}};
}));
// Fixed reservation: the first standard room reached from the western pier.
export const PLAYER_BUNGALOW_ID = 'water-1';
export const PLAYER_BUNGALOW = BUNGALOWS.find(b=>b.id===PLAYER_BUNGALOW_ID);
export const GARDEN_BUNGALOWS = [-95,-62,-29,37,70,103].map((x,i)=>({id:`garden-${i+1}`,kind:'garden',premium:false,x,z:65,y:terrainHeight(x,65)+0.3,yaw:Math.PI,w:6,d:8,terrace:3}));
export const CENTRAL_BUILDINGS = [
  {id:'reception',kind:'reception',x:12,z:35,y:2.1,yaw:0,w:14,d:10,terrace:3},
  {id:'restaurant',kind:'restaurant',x:-103,z:24,y:1.9,yaw:0,w:20,d:12,terrace:4},
  {id:'bar',kind:'bar',x:101,z:24,y:1.9,yaw:0,w:12,d:9,terrace:4},
  {id:'matisse-gallery',kind:'gallery',x:12,z:60,y:terrainHeight(12,60)+.3,yaw:Math.PI,w:9,d:8,terrace:2.5},
];
export const BUILDINGS = [...BUNGALOWS,...GARDEN_BUNGALOWS,...CENTRAL_BUILDINGS];
export function localPoint(b,x,z) { const c=Math.cos(b.yaw),s=Math.sin(b.yaw); return {x:b.x+c*x+s*z,z:b.z-s*x+c*z}; }
export function toLocal(b,x,z) { const c=Math.cos(b.yaw),s=Math.sin(b.yaw),dx=x-b.x,dz=z-b.z; return {x:c*dx-s*dz,z:s*dx+c*dz}; }
export function keepOffBuilt(x,z) {
  if (pathDistance(x,z)<3.1 || Math.hypot(x-HAMMOCK.x,z-HAMMOCK.z)<5 || Math.hypot(x-SPAWN.x,z-SPAWN.z)<3) return false;
  if (BOARDWALK_POINTS.some(p=>Math.abs(x-p[0][0])<3.0&&z>0&&z<33))return false;
  if (GARDEN_BUNGALOWS.some(b=>Math.abs(x-b.x)<1.8&&z>47&&z<61))return false;
  return BUILDINGS.every(b=> {const p=toLocal(b,x,z); return Math.abs(p.x)>b.w/2+2 || p.z < -b.d/2-2 || p.z>b.d/2+b.terrace+2;});
}
export function seededRandom(seed) { let s=seed>>>0; return ()=>((s=(s*1664525+1013904223)>>>0)/4294967296); }
