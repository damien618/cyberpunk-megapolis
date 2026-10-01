// Extracted unchanged from marineLife's island; no THREE or scene dependency.
function smooth(x,a,b) {const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
export function islandHeight(x,z) {
  const dist=Math.hypot(x/390,z/330), angle=Math.atan2(z/330,x/390);
  const coast=1+0.22*Math.sin(3*angle+0.9)+0.15*Math.cos(5*angle-1.2)+0.08*Math.sin(7*angle+2.3);
  const n=dist/coast;
  let h=240*Math.exp(-Math.pow(Math.hypot(x+45,z+25)/165,1.85))
    +180*Math.exp(-Math.pow(Math.hypot(x-125,z-20)/135,1.75))
    +135*Math.exp(-Math.pow(Math.hypot(x+20,z-130)/115,1.65))
    +115*Math.exp(-Math.pow(Math.hypot(x+150,z+110)/110,1.6))
    +Math.abs(Math.sin(x*0.027+z*0.022))*34+Math.sin(x*0.054-z*0.038)*16+Math.sin(x*0.12+1.1)*Math.cos(z*0.11-0.8)*6;
  if(x>30&&z>20) {const d=Math.hypot(x-120,z-110);if(d<160)h*=0.45+0.55*(d/160);}
  h*=1-smooth(n,0.62,1.01);
  return n>=0.96 ? Math.max(-45,h-1-Math.pow((n-0.96)/0.05,1.6)*26) : Math.max(-10,h);
}
