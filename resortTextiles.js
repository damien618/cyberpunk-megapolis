import * as THREE from 'three';
import { seededRandom } from './resortLayout.js';

// Original island-inspired prints: kapa-style borders and botanical quilting.
// Colour and fibre relief are separate, keeping the weave subtle under light.
export function createResortTextiles(maxAniso) {
  function canvasMap(draw,size=1024,srgb=true){
    const canvas=Object.assign(document.createElement('canvas'),{width:size,height:size});
    draw(canvas.getContext('2d'),size);
    const map=new THREE.CanvasTexture(canvas);map.wrapS=map.wrapT=THREE.RepeatWrapping;
    map.anisotropy=maxAniso;if(srgb)map.colorSpace=THREE.SRGBColorSpace;return map;
  }
  const weave=canvasMap((g,S)=>{
    const rnd=seededRandom(8302);g.fillStyle='#808080';g.fillRect(0,0,S,S);
    for(let y=0;y<S;y+=4)for(let x=0;x<S;x+=4){
      const v=105+Math.floor(rnd()*40);g.fillStyle=`rgb(${v},${v},${v})`;
      g.fillRect(x,y,3,1);g.fillRect(x+(y%8?2:0),y+1,1,3);
    }
  },512,false);
  weave.repeat.set(8,8);
  function flower(g,x,y,r,color){
    g.save();g.translate(x,y);g.fillStyle=color;
    for(let k=0;k<5;k++){g.rotate(Math.PI*2/5);g.beginPath();g.ellipse(0,-r*.48,r*.30,r*.56,.12,0,Math.PI*2);g.fill();}
    g.fillStyle='#e7c47c';g.beginPath();g.arc(0,0,r*.14,0,Math.PI*2);g.fill();g.restore();
  }
  function print(kind,base,ink){return canvasMap((g,S)=>{
    const rnd=seededRandom(2059);g.fillStyle=base;g.fillRect(0,0,S,S);
    if(kind==='kapa'){
      for(let y=64;y<S;y+=128)for(let x=64;x<S;x+=128){
        g.save();g.translate(x,y);g.strokeStyle=ink;g.lineWidth=4;
        for(const r of [16,31,44]){g.beginPath();g.moveTo(0,-r);g.lineTo(r,0);g.lineTo(0,r);g.lineTo(-r,0);g.closePath();g.stroke();}
        g.restore();
      }
      for(const x of [20,S-20]){g.fillStyle=ink;g.fillRect(x-6,0,12,S);
        for(let y=0;y<S;y+=32){g.beginPath();g.moveTo(x+14,y);g.lineTo(x+30,y+16);g.lineTo(x+14,y+32);g.fill();}}
    }else if(kind==='hibiscus'){
      for(let y=128;y<S;y+=256)for(let x=128;x<S;x+=256){
        flower(g,x,y,78,ink);
        g.strokeStyle=ink;g.lineWidth=3;g.beginPath();g.moveTo(x+35,y+38);g.quadraticCurveTo(x+108,y+50,x+91,y+99);g.stroke();
        g.fillStyle=ink;g.beginPath();g.ellipse(x-65,y+64,17,38,.8,0,Math.PI*2);g.fill();
        g.strokeStyle='rgba(255,244,218,.48)';g.lineWidth=2;g.strokeRect(x-117,y-117,234,234);
      }
    }
    // Fine broken threads and quilting stitches, baked into the colour map.
    for(let i=0;i<14000;i++){g.fillStyle=rnd()>.5?'rgba(255,255,242,.07)':'rgba(45,33,21,.04)';g.fillRect(rnd()*S,rnd()*S,1,2+rnd()*4);}
    g.strokeStyle='rgba(255,248,226,.62)';g.setLineDash([3,5]);g.lineWidth=2;g.strokeRect(9,9,S-18,S-18);
  });}
  const result={};
  for(const [name,kind,base,ink] of [
    ['cotton','plain','#f1e7d1','#ded3bd'],
    ['lagoonCloth','kapa','#286f73','#dfd8b5'],
    ['coralCloth','hibiscus','#c47b66','#f2dfba'],
    ['indigoCloth','hibiscus','#314d68','#c3d5cc'],
    ['sandCloth','kapa','#c8a26b','#715440'],
  ]){
    result[name]=new THREE.MeshPhysicalMaterial({map:print(kind,base,ink),bumpMap:weave,bumpScale:.012,
      roughness:.96,sheen:.65,sheenColor:new THREE.Color(base),sheenRoughness:.85,side:THREE.DoubleSide});
  }
  result.stitch=new THREE.MeshStandardMaterial({color:0xe4cfaa,roughness:1});
  return result;
}
