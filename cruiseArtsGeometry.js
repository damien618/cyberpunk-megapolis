// Small room-scoped instancing builder. Collision boxes are explicit: ornate
// curved trim never becomes an invisible rectangular obstacle for the capsule.
export function artsBuilder(THREE, originX = 0) {
  const group = new THREE.Group();
  group.position.x = originX;
  const colliders = [], batches = new Map(), lights = [];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.SphereGeometry(1, 12, 8);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
  function material(color, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
  }
  const m = {
    ivory: material(0xede4d2), stone: material(0xc6bba6),
    gold: material(0xc39740, { metalness: 0.48, roughness: 0.3, emissive: 0x36200a, emissiveIntensity: 0.3 }),
    goldLight: material(0xf0d39a, { metalness: 0.3, roughness: 0.3 }),
    red: material(0x661324), velvet: material(0x981f35),
    wood: material(0x473021), black: material(0x15141b),
    light: material(0xffebbc, { emissive: 0xffcf85, emissiveIntensity: 1.5 }),
    // Under a balcony there is nowhere to put a lamp that is not itself under
    // the balcony, and the house only affords eight live point lights at a
    // time. So the soffits are painted cream and carry a little emissive of
    // their own: standing at the back of the parterre and looking up used to
    // give a screen of pure black, which read as a rendering failure.
    soffit: material(0xd3c6ab, { emissive: 0x4a3c2a, emissiveIntensity: 1 }),
  };
  // rz is applied FIRST (three.js composes XYZ as Rx·Ry·Rz), so a cylinder
  // laid on its side with rz = π/2 still turns with its chair when ry follows.
  function item(geo, mat, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) {
    const key = geo.uuid + mat.uuid;
    if (!batches.has(key)) batches.set(key, { geo, mat, items: [] });
    batches.get(key).items.push([x, y, z, sx, sy, sz, ry, rx, rz]);
  }
  // solid: true = wall, 'prop' = furniture, 'floor' = a room's floor,
  // 'step' = a stair tread. The last two are both groundOnly — they carry the
  // player without shoving her capsule sideways — but only a FLOOR stops the
  // camera boom. Treads must not, or the boom snaps in on every stair; a floor
  // must, or looking up drops the camera through it into the hull void.
  function box(mat, x, y, z, w, h, d, solid = false, ry = 0) {
    item(cube, mat, x, y, z, w, h, d, ry);
    if (solid) {
      const hx = (Math.abs(Math.cos(ry))*w + Math.abs(Math.sin(ry))*d)/2;
      const hz = (Math.abs(Math.sin(ry))*w + Math.abs(Math.cos(ry))*d)/2;
      const floor = solid==='floor';
      colliders.push({x0:originX+x-hx,x1:originX+x+hx,y0:y-h/2,y1:y+h/2,z0:z-hz,z1:z+hz,collide:true,prop:solid==='prop',groundOnly:floor||solid==='step',camBlock:floor,tall:h>9});
    }
  }
  function label(text, x, y, z, w, h, ry = 0, dark = false) {
    const c = document.createElement('canvas'); c.width = 1536; c.height = 256;
    const g = c.getContext('2d'); g.fillStyle = dark ? '#291d22' : '#eee8d9'; g.fillRect(0,0,c.width,c.height);
    g.fillStyle = dark ? '#eed6a2' : '#39382f'; g.textAlign='center'; g.textBaseline='middle';
    const lines = text.split('\n');
    lines.forEach((s,i) => { g.font = `${i ? 32 : 50}px Georgia`; g.fillText(s,768,128+(i-(lines.length-1)/2)*66,1450); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:t}));
    p.position.set(x,y,z); p.rotation.y=ry; group.add(p); return p;
  }
  function light(x,y,z,intensity=70,distance=20,color=0xffddb0) {
    const l = new THREE.PointLight(color,intensity,distance,2); l.position.set(x,y,z); group.add(l); lights.push(l); return l;
  }
  function finish() {
    const o = new THREE.Object3D();
    for (const {geo,mat,items} of batches.values()) {
      const mesh = new THREE.InstancedMesh(geo,mat,items.length);
      items.forEach(([x,y,z,sx,sy,sz,ry,rx,rz],i)=>{o.position.set(x,y,z);o.rotation.set(rx,ry,rz||0);o.scale.set(sx,sy,sz);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);});
      mesh.computeBoundingSphere(); group.add(mesh);
    }
    return {group,colliders,lights};
  }
  return {group,colliders,m,box,item,label,light,finish,sphere,cylinder};
}
