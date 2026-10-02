import * as THREE from 'three';
import { mergeGeometries,mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom } from './resortLayout.js';

// Hibiscus shrubs built like game foliage: a small dark core under ~170
// alpha-cut sprays of leaves. The gaps between sprays show the shaded core, the
// outline is cut out leaf by leaf, and sprays are lit with normals pointing away
// from the shrub centre so the whole mass shades as a volume, not as cards.
export function createResortShrubs(maxAniso) {
  const rnd=seededRandom(30741);
  function texture(size,draw){
    const canvas=Object.assign(document.createElement('canvas'),{width:size,height:size});
    draw(canvas.getContext('2d'),size);
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
    map.anisotropy=maxAniso;return map;
  }
  // Pointed ovate leaf with its base at the origin, growing along +y.
  function leafPath(g,w,h){
    g.beginPath();g.moveTo(0,0);
    g.bezierCurveTo(w*.66,h*.16,w*.36,h*.74,0,h);
    g.bezierCurveTo(-w*.36,h*.74,-w*.66,h*.16,0,0);
  }
  // Leaves carry a slight hue of their own (yellow young growth, blue-green old
  // leaves); the per-instance tint supplies the overall green.
  function leaf(g,x,y,w,h,angle,tone,warm){
    const rgb=t=>`rgb(${Math.round(t*(1+warm*.12))},${t},${Math.round(t*(1-warm*.1))})`;
    // Hard offset shadow, never shadowBlur: blurring many shapes on a 2D canvas
    // runs on the GPU in Chrome and crashed its GPU process (white screen).
    g.save();g.translate(x+2,y+5);g.rotate(angle);g.fillStyle='rgba(0,0,0,.4)';leafPath(g,w,h);g.fill();g.restore();
    g.save();g.translate(x,y);g.rotate(angle);
    const gradient=g.createLinearGradient(-w/2,0,w/2,0);
    gradient.addColorStop(0,rgb(tone-34));gradient.addColorStop(.5,rgb(tone));gradient.addColorStop(1,rgb(tone-16));
    g.fillStyle=gradient;leafPath(g,w,h);g.fill();
    g.strokeStyle=`rgba(240,246,214,${.18+tone/1600})`;g.lineWidth=Math.max(.8,w*.025);
    g.beginPath();g.moveTo(0,h*.02);g.lineTo(0,h*.93);g.stroke();
    for(let k=0;k<5;k++)for(const side of [-1,1]){
      const z=h*(.18+k*.14);g.beginPath();g.moveTo(0,z);
      g.quadraticCurveTo(side*w*.14,z+h*.04,side*w*.3,z+h*.1);g.stroke();
    }
    g.restore();
  }
  // One spray: a curved twig with paired leaves up it and one at the tip, lower
  // leaves darker and shaded toward the base where the shrub closes over them.
  const leafMap=texture(512,(g,S)=>{
    g.clearRect(0,0,S,S);
    const nodes=5,bend=(rnd()-.5)*.25;
    const stem=t=>[S/2+Math.sin(t*2.2)*bend*S,S*.97-t*S*.6];
    g.strokeStyle='rgb(120,104,80)';g.lineWidth=S*.012;g.beginPath();
    for(let t=0;t<=1.001;t+=.1){const [x,y]=stem(t);t?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();
    for(let i=0;i<nodes;i++)for(const side of i===nodes-1?[0]:[-1,1]){
      const t=.1+.9*i/(nodes-1),[x,y]=stem(t);
      const a=-Math.PI/2+side*(.75+rnd()*.5)+(rnd()-.5)*.3,h=S*(.3+rnd()*.08)*(1-t*.2),w=h*(.48+rnd()*.1);
      leaf(g,x,y,w,h,a-Math.PI/2,Math.min(240,170+Math.floor(t*55+rnd()*20)),(rnd()-.4)*2);
    }
    g.globalCompositeOperation='source-atop';
    const shade=g.createLinearGradient(0,S,0,S*.35);
    shade.addColorStop(0,'rgba(10,16,6,.5)');shade.addColorStop(1,'rgba(10,16,6,0)');
    g.fillStyle=shade;g.fillRect(0,0,S,S);g.globalCompositeOperation='source-over';
  });
  // Outer envelope: a low mound with three clumps pushing through it.
  const LOBES=[[1,.32,1,0,.32,0],[.56,.3,.56,.42,.48,-.2],[.5,.28,.5,-.4,.46,.26],[.46,.26,.46,-.12,.58,-.38]];
  function lobe([sx,sy,sz,x,y,z],shrink,detail){
    let g=new THREE.IcosahedronGeometry(1,detail);g.deleteAttribute('normal');g.deleteAttribute('uv');g=mergeVertices(g);
    const p=g.attributes.position;
    for(let i=0;i<p.count;i++){
      const a=p.getX(i),b=p.getY(i),c=p.getZ(i),r=shrink*(1+.07*Math.sin(a*7+c*5+x*9)*Math.sin(b*6+1));
      p.setXYZ(i,x+a*sx*r,y+b*sy*r,z+c*sz*r);
    }
    g.computeVertexNormals();return g;
  }
  // The core sits inside the sprays; it only has to fill the gaps with shade.
  const geometry=mergeGeometries(LOBES.map((l,i)=>lobe(l,.74,i?0:1)));
  const material=new THREE.MeshStandardMaterial({color:0x4a5a3c,roughness:1});
  const cards=[],zAxis=new THREE.Vector3(0,0,1),q=new THREE.Quaternion(),spin=new THREE.Quaternion();
  const centre=new THREE.Vector3(0,.22,0),dir=new THREE.Vector3(),n=new THREE.Vector3(),v=new THREE.Vector3(),sphere=new THREE.Vector3();
  // Stratified, not random: a golden-angle spiral covers each crown evenly and
  // evenly spaced azimuths ring the sides, so no face of the shrub is left bare.
  const plan=[];
  for(const [li,side,top] of [[0,52,38],[1,12,14],[2,12,14],[3,12,14]]){
    for(let j=0;j<side;j++)plan.push([li,j*2.39996+rnd()*.4,-.1+.55*((j*.618034)%1),false]);
    for(let j=0;j<top;j++)plan.push([li,j*2.39996,Math.sqrt((j+.5)/top),true]);
  }
  for(const [li,azimuth,param,crown] of plan){
    const [sx,sy,sz,lx,ly,lz]=LOBES[li];
    if(crown){dir.set(Math.cos(azimuth)*param,0,Math.sin(azimuth)*param);dir.y=Math.sqrt(Math.max(0,1-dir.lengthSq()));}
    else dir.set(Math.cos(azimuth),param,Math.sin(azimuth)).normalize();
    const depth=.96+rnd()*.14,pos=new THREE.Vector3(lx+dir.x*sx*depth,Math.max(.06,ly+dir.y*sy*depth),lz+dir.z*sz*depth);
    n.set(dir.x/sx,dir.y/sy,dir.z/sz).normalize().add(v.set(rnd()-.5,rnd()-.5,rnd()-.5).multiplyScalar(.9)).normalize();
    // No spray lies flat: tilt each one at least ~40° so it still shows from
    // eye height instead of vanishing edge-on into the crown.
    if(n.y>.76){const k=Math.sqrt((1-.76*.76)/Math.max(1e-4,1-n.y*n.y));n.x*=k;n.z*=k;n.y=.76;if(!n.x&&!n.z)n.x=.65;n.normalize();}
    const size=.44+rnd()*.14,card=new THREE.PlaneGeometry(size,size);
    q.setFromUnitVectors(zAxis,n).multiply(spin.setFromAxisAngle(zAxis,rnd()*Math.PI*2));
    card.applyQuaternion(q);card.translate(pos.x,pos.y,pos.z);
    // Volume lighting and baked occlusion: low and deep sprays are darker.
    const p=card.attributes.position,normal=card.attributes.normal,colour=[],shade=.82+rnd()*.18;
    for(let k=0;k<p.count;k++){
      v.fromBufferAttribute(p,k);sphere.subVectors(v,centre).multiply(v.set(1,2.2,1)).normalize();
      v.fromBufferAttribute(normal,k);sphere.multiplyScalar(.75).addScaledVector(v,.25).normalize();
      normal.setXYZ(k,sphere.x,sphere.y,sphere.z);
      const y=p.getY(k),c=shade*(.5+.5*THREE.MathUtils.smoothstep(y,0,.55))*(.75+.25*THREE.MathUtils.smoothstep(depth,.96,1.1));
      colour.push(c,c,c);
    }
    card.setAttribute('color',new THREE.Float32BufferAttribute(colour,3));
    // Wind pivot (the spray centre) and its own flutter phase.
    const phase=rnd()*Math.PI*2;card.setAttribute('spray',new THREE.Float32BufferAttribute(Array(p.count).fill([pos.x,pos.y,pos.z,phase]).flat(),4));
    cards.push(card);
  }
  const leavesGeometry=mergeGeometries(cards);
  const leavesMaterial=new THREE.MeshStandardMaterial({map:leafMap,alphaTest:.42,side:THREE.DoubleSide,vertexColors:true,roughness:.78,color:0xffffff});
  // Wind: slow gusts in the jungle's trade-wind direction lean the whole shrub,
  // and every spray flutters about its own centre with its own phase. The
  // lighting normal tilts with the flutter, so the shading shimmers as leaves
  // turn, and a turned leaf shows its paler underside.
  const wind={uShrubTime:{value:0},uShrubWind:{value:new THREE.Vector2(.82,.57).normalize()}};
  leavesMaterial.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,wind);
    sh.vertexShader='uniform float uShrubTime;uniform vec2 uShrubWind;attribute vec4 spray;varying float vShrubFlutter;\n'+sh.vertexShader
      .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        float shrubFlutter=0.,shrubLean=0.;vec3 shrubWind=vec3(uShrubWind.x,0.,uShrubWind.y);
        #ifdef USE_INSTANCING
        // Instance rotation and scale undone, so every shrub bends downwind.
        shrubWind=normalize(transpose(mat3(instanceMatrix))*shrubWind);
        float shrubSeed=instanceMatrix[3][0]*.13+instanceMatrix[3][2]*.11;
        float shrubGust=.55+.45*sin(uShrubTime*.42+instanceMatrix[3][0]*.021)*sin(uShrubTime*.17+instanceMatrix[3][2]*.017);
        shrubFlutter=shrubGust*(sin(uShrubTime*4.1+spray.w+shrubSeed)*.6+sin(uShrubTime*6.7+spray.w*1.7)*.4);
        shrubLean=shrubGust*(.6+.4*sin(uShrubTime*1.3+shrubSeed));
        #endif
        objectNormal=normalize(objectNormal+shrubWind*shrubFlutter*.45+vec3(0.,shrubFlutter*.2,0.));
        vShrubFlutter=shrubFlutter;`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        float shrubReach=smoothstep(0.,.3,length(transformed-spray.xyz));
        transformed+=(normal*.6+shrubWind)*shrubFlutter*.035*shrubReach;
        transformed.xz+=shrubWind.xz*shrubLean*.03*transformed.y;`);
    // Keep the volume normals on both faces: the default double-sided flip
    // would light every back-facing spray from inside the shrub.
    sh.fragmentShader='varying float vShrubFlutter;\n'+sh.fragmentShader
      .replace('#include <normal_fragment_begin>','float faceDirection=1.0;vec3 normal=normalize(vNormal);vec3 nonPerturbedNormal=normal;')
      .replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.rgb*=1.+.14*vShrubFlutter;');
  };
  leavesMaterial.customProgramCacheKey=()=> 'resort-shrub-sprays-v2';
  return {geometry,material,leavesGeometry,leavesMaterial,update(dt){wind.uShrubTime.value+=dt;}};
}
