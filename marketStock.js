// Small, reusable pieces of physical stock. All dimensions are metres in the
// market's local plan; the parent group supplies the world-space translation.
import * as THREE from 'three';

export function fillMarketStock({ group, box, label, DX, DZ, MAXANISO }) {
  const root = new THREE.Group();
  root.name = 'Produce, fish and packaged goods';
  root.position.set(DX, 0, DZ);
  group.add(root);

  const material = (color, roughness = 0.7, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const wood = material(0x73513a, 0.86);
  const woodEdge = material(0x9b7251, 0.82);
  const steel = material(0x89939b, 0.34, 0.7);
  const dark = material(0x242c34, 0.54, 0.32);
  const ice = material(0xc9e7ee, 0.22, 0.05);
  const leaves = material(0x2e6632, 0.91);
  const stem = material(0x719146, 0.9);
  function woodGrain(base, streak) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const c = canvas.getContext('2d');
    c.fillStyle = base; c.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 80; i++) {
      const y = (i * 67.31) % 128;
      c.strokeStyle = streak;
      c.globalAlpha = .035 + (i % 7) * .011;
      c.lineWidth = .4 + i % 3;
      c.beginPath(); c.moveTo(-5, y);
      c.bezierCurveTo(125, y + Math.sin(i) * 4,
        360, y - Math.cos(i * 2) * 4, 517, y + Math.sin(i * 3) * 3);
      c.stroke();
    }
    c.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = MAXANISO;
    return tex;
  }
  wood.color.set(0xffffff); wood.map = woodGrain('#77563e', '#27180f');
  woodEdge.color.set(0xffffff);
  woodEdge.map = woodGrain('#ac7f59', '#4c2b17');

  // Shared geometries and materials collapse hundreds of individual items to
  // a few instanced draws, rather than growing the city's already large scene.
  const pending = new Map();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const unitSphere = new THREE.SphereGeometry(1, 12, 9);
  const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const unitCone = new THREE.ConeGeometry(1, 1, 10);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitIcosa = new THREE.IcosahedronGeometry(1, 0);
  function add(key, geometry, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
    const batch = pending.get(key) || { geometry, mat, poses: [] };
    if (!pending.has(key)) pending.set(key, batch);
    e.set(rx, ry, rz); q.setFromEuler(e);
    batch.poses.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)));
  }
  function finish() {
    for (const [key, { geometry, mat, poses }] of pending) {
      const mesh = new THREE.InstancedMesh(geometry, mat, poses.length);
      mesh.name = `Market stock · ${key}`;
      poses.forEach((pose, i) => mesh.setMatrixAt(i, pose));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      root.add(mesh);
    }
  }
  function seeded(n) { return (Math.sin(n * 127.1 + 78.233) * 43758.5453) % 1; }
  function nrand(n) { const v = seeded(n); return v < 0 ? v + 1 : v; }

  // Printed paper and foil labels give each package an actual front face.
  // Everything is authored here, so the shop works fully offline.
  function print(labelText, subtitle, base, accent) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const c = canvas.getContext('2d');
    c.fillStyle = base; c.fillRect(0, 0, 256, 256);
    c.fillStyle = accent; c.fillRect(0, 0, 256, 34);
    c.fillRect(0, 211, 256, 45);
    c.fillStyle = '#fbf5e9'; c.textAlign = 'center';
    c.font = 'bold 47px "Hiragino Sans", "Yu Gothic", sans-serif';
    c.fillText(labelText, 128, 115, 237);
    c.font = 'bold 19px sans-serif'; c.fillText(subtitle, 128, 151, 234);
    c.fillStyle = '#d8d2c4'; c.font = '15px sans-serif';
    c.fillText('日本製  •  こだわりの味', 128, 192, 239);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = MAXANISO;
    return tex;
  }
  const packMats = [
    ['醤油', 'SHOYU RAMEN', '#753a27', '#ddad64'],
    ['味噌', 'MISO RAMEN', '#996b27', '#e0bf71'],
    ['海苔', 'NORI SNACKS', '#284b45', '#84b29b'],
    ['煎餅', 'RICE CRACKERS', '#a45043', '#e5bd94'],
  ].map(([jp, en, base, accent]) => new THREE.MeshStandardMaterial({
    map: print(jp, en, base, accent), roughness: 0.66,
  }));
  const canMats = [
    ['緑茶', 'GREEN TEA', '#386e53', '#8fbf77'],
    ['珈琲', 'COFFEE', '#523e34', '#c9a778'],
    ['桃', 'PEACH SODA', '#b75b78', '#f2b7c1'],
  ].map(([jp, en, base, accent]) => new THREE.MeshStandardMaterial({
    map: print(jp, en, base, accent), roughness: 0.31, metalness: 0.35,
  }));
  const bottleMats = [
    material(0x78a05c, 0.3, 0.04), material(0x9f6549, 0.3, 0.04),
    material(0x8baab1, 0.23, 0.02), material(0xb88048, 0.28, 0.03),
  ];
  const produceMats = {
    tomato: material(0xb93124, 0.37), apple: material(0x9f362d, 0.42),
    citrus: material(0xe59632, 0.62), cabbage: material(0x8aaf5d, 0.88),
    aubergine: material(0x372947, 0.35), carrot: material(0xc77727, 0.67),
    daikon: material(0xd8d5b3, 0.83), pepper: material(0x517e33, 0.51),
  };

  // Timber produce island: visible legs, slatted sides and separate open crates.
  const produceX = -44.98;
  for (const legX of [produceX - 0.47, produceX + 0.47])
    for (const legZ of [-33.9, -30.8])
      box(legX - 0.035, legX + 0.035, 0.07, 0.75, legZ - 0.04, legZ + 0.04, steel);
  box(produceX - 0.56, produceX + 0.56, 0.72, 0.79, -34.1, -30.6, wood);
  box(produceX - 0.54, produceX + 0.54, 0.23, 0.28, -34.0, -30.7, woodEdge);
  const kinds = ['tomato', 'cabbage', 'carrot', 'aubergine',
    'apple', 'citrus', 'daikon', 'pepper'];
  for (let i = 0; i < 8; i++) {
    const cx = produceX + (i % 2 ? 0.277 : -0.277);
    const cz = -33.69 + Math.floor(i / 2) * 0.81;
    const kind = kinds[i];
    const x0 = cx - 0.255, x1 = cx + 0.255;
    const z0 = cz - 0.37, z1 = cz + 0.37;
    box(x0, x1, 0.79, 0.825, z0, z1, woodEdge);
    for (const x of [x0, x1 - 0.027])
      box(x, x + 0.027, 0.825, 0.91, z0, z1, wood);
    for (const z of [z0, z1 - 0.027])
      box(x0, x1, 0.825, 0.91, z, z + 0.027, wood);
    for (let j = 0; j < 9; j++) {
      const x = cx - 0.15 + (j % 3) * 0.15 + (nrand(i * 79 + j) - .5) * .027;
      const z = cz - 0.245 + Math.floor(j / 3) * 0.245;
      const y = 0.91 + (j % 2) * 0.016;
      const jitter = 0.86 + nrand(i * 41 + j) * 0.2;
      if (kind === 'carrot' || kind === 'daikon') {
        const k = kind === 'carrot' ? 'carrot' : 'daikon';
        add(k, unitCone, produceMats[k], x, y + .032, z, .052 * jitter, .20, .052,
          Math.PI / 2, nrand(j + i) * .4, 0);
        add('root greens', unitCone, stem, x, y + .04, z + .1, .046, .11, .046,
          -Math.PI / 2);
      } else {
        const r = kind === 'cabbage' ? .105 : kind === 'aubergine' ? .084 : .069;
        add(kind, unitSphere, produceMats[kind], x, y + r * .72, z,
          r * jitter, kind === 'aubergine' ? r * .83 : r, r * jitter);
        if (kind === 'tomato' || kind === 'aubergine' || kind === 'apple')
          add(`${kind} calyx`, unitCone, leaves, x, y + r * 1.7, z,
            .035, .04, .035);
        if (kind === 'cabbage')
          add('cabbage leaf', unitSphere, leaves, x + .015, y + r * 1.2,
            z + .007, r * .63, .018, r * .7);
      }
    }
    label(`${kind === 'aubergine' ? '茄子' : kind === 'tomato' ? 'トマト' :
      kind === 'cabbage' ? 'キャベツ' : kind === 'carrot' ? '人参' :
      kind === 'apple' ? 'りんご' : kind === 'citrus' ? 'みかん' :
      kind === 'daikon' ? '大根' : 'ピーマン'}  ¥${[198, 260, 158, 220, 248, 280, 170, 180][i]}`,
      .46, .11, cx, 0.98, cz + .34, '#f1dec2', 67);
  }

  // Fish on crushed ice: distinct bodies, tails, fins, gills and eyes.
  function fish(x, y, z, scale, turn = 0) {
    const body = material(0x8da5a8, 0.36, 0.16);
    add('fish body', unitSphere, body, x, y, z, .22 * scale, .065 * scale,
      .088 * scale, 0, turn);
    add('fish belly', unitSphere, ice, x, y - .018 * scale, z + .02 * scale,
      .17 * scale, .047 * scale, .067 * scale, 0, turn);
    add('fish tail', unitCone, body, x + .24 * scale, y, z,
      .08 * scale, .16 * scale, .075 * scale, 0, 0, -Math.PI / 2);
    add('fish eye', unitSphere, dark, x - .15 * scale, y + .025 * scale,
      z + .075 * scale, .012 * scale, .012 * scale, .012 * scale);
    add('fish fin', unitCone, body, x, y + .083 * scale, z,
      .045 * scale, .07 * scale, .018 * scale);
  }
  const fishX = -44.98;
  box(fishX - .57, fishX + .57, .05, .72, -38.25, -34.6, dark);
  box(fishX - .58, fishX + .58, .72, .79, -38.25, -34.6, steel);
  box(fishX - .55, fishX + .55, .79, .89, -38.22, -34.63, ice);
  for (const side of [-1, 1])
    box(fishX + side * .55 - .014, fishX + side * .55 + .014,
      .8, 1.0, -38.22, -34.63, steel);
  for (let i = 0; i < 110; i++) {
    const x = fishX - .50 + nrand(i + 65) * 1.0;
    const z = -38.15 + nrand(i * 3 + 91) * 3.45;
    add('crushed ice', unitIcosa, ice, x, .90, z, .025, .017, .03,
      nrand(i + 9), nrand(i + 23), 0);
  }
  for (let i = 0; i < 12; i++)
    fish(fishX + (i % 2 ? .26 : -.25), .98, -37.95 + Math.floor(i / 2) * .61,
      .86 + nrand(i * 8) * .13, i % 2 ? Math.PI : 0);
  for (let i = 0; i < 6; i++)
    label(`本日鮮魚  ¥${[680, 720, 580][i % 3]}`, .92, .19,
      fishX, 1.19, -37.95 + i * .61, '#e6f8f9', 55);

  // Four shelves of bottled tea, coffee, soda and water. Caps, shoulders and
  // labels are separate parts so the silhouettes read as bottles close up.
  function groceryRack(x, z0, z1, shelfYs, type) {
    for (const xx of [x - .53, x + .53])
      for (const zz of [z0 + .07, z1 - .07])
        box(xx - .024, xx + .024, .05, 2.03, zz - .025, zz + .025, steel);
    for (const y of shelfYs) {
      box(x - .54, x + .54, y, y + .045, z0, z1, steel);
      box(x - .54, x + .54, y + .046, y + .071, z0, z1,
        type === 'snack' ? woodEdge : dark);
      for (const side of [-1, 1])
        box(x + side * .54 - .018, x + side * .54 + .018,
          y + .04, y + .10, z0, z1, dark);
    }
    box(x - .55, x + .55, 2.02, 2.09, z0, z1, dark);
  }
  groceryRack(-41.15, -34.1, -30.6, [.38, .82, 1.26, 1.70], 'drink');
  groceryRack(-41.15, -38.25, -34.6, [.38, .82, 1.26, 1.70], 'can');
  groceryRack(-37.45, -38.25, -32.5, [.38, .82, 1.26, 1.70], 'snack');

  function bottle(x, y, z, style) {
    const body = bottleMats[style];
    add(`bottle ${style}`, unitCylinder, body, x, y + .145, z,
      .064, .25, .064);
    add('bottle shoulder', unitCone, body, x, y + .29, z, .061, .06, .061);
    add(`bottle label ${style}`, unitCylinder, canMats[style % 3],
      x, y + .14, z, .066, .09, .066);
    add('bottle cap', unitCylinder, style === 2 ? ice : dark,
      x, y + .326, z, .034, .028, .034);
  }
  function can(x, y, z, style) {
    add(`can ${style}`, unitCylinder, canMats[style], x, y + .11, z,
      .063, .20, .063);
    add('can lid', unitCylinder, steel, x, y + .214, z,
      .063, .009, .063);
    add('can ring pull', unitSphere, dark, x, y + .221, z,
      .025, .003, .014);
  }
  for (const [type, x, z0, z1] of [
    ['drink', -41.15, -34.1, -30.6], ['can', -41.15, -38.25, -34.6],
    ['snack', -37.45, -38.25, -32.5],
  ]) {
    for (let level = 0; level < 4; level++) {
      const y = [.38, .82, 1.26, 1.70][level] + .071;
      for (let zi = 0, z = z0 + .18; z < z1 - .08; zi++, z += type === 'snack' ? .27 : .20) {
        for (const side of [-1, 1]) {
          const x0 = x + side * .27;
          if (type === 'drink') bottle(x0, y, z, (zi + level) % 4);
          else if (type === 'can') can(x0, y, z, (zi + level) % 3);
          else {
            const style = (zi + level) % 4;
            add(`snack pack ${style}`, unitBox, packMats[style], x0, y + .16, z,
              .20, .29, .12, 0, side < 0 ? .16 : -.16);
          }
        }
      }
    }
  }

  // Rear display case continues the fishmonger area without another fake wall.
  box(-46.5, -43.9, .05, .86, -39.52, -38.75, dark);
  box(-46.51, -43.89, .86, .93, -39.53, -38.74, steel);
  box(-46.47, -43.93, .93, 1.03, -39.49, -38.78, ice);
  for (let i = 0; i < 5; i++) fish(-46.14 + i * .47, 1.1, -39.1, .73);
  label('本日の魚  ·  FRESH FISH', 2.28, .23, -45.2, 1.42,
    -39.49, '#e6f8f9', 53);

  // Illuminated refrigerated wall: narrow doors and stocked interior.
  box(-39.77, -37.98, .05, 2.30, -39.91, -39.32, dark);
  box(-39.7, -38.05, .27, 2.14, -39.31, -39.27, ice);
  for (const yy of [.45, .88, 1.31, 1.74]) {
    box(-39.68, -38.07, yy, yy + .035, -39.30, -39.17, steel);
    for (let i = 0; i < 8; i++) bottle(-39.54 + i * .20, yy + .035,
      -39.23, i % 4);
  }
  for (const xx of [-39.7, -38.86, -38.05])
    box(xx - .016, xx + .016, .16, 2.28, -39.16, -39.1, steel);
  box(-39.72, -38.04, 2.22, 2.27, -39.16, -39.08, ice);

  finish();
}
