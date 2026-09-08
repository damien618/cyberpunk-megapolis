// Five machines out of the Voyages extraordinaires, modelled on the novels and
// on Hetzel's engravings (Neuville, Riou, Benett, Roux) rather than on any film.
// What each engraving insists on, and what the models therefore have to show:
//
//   Nautilus       a spindle of riveted plate — "deux cônes réunis par un
//                  cylindre" — with the ram spur, the pilot cage forward of
//                  the lantern, the salon panels amidships, the four-blade
//                  screw and rudder aft, and the dinghy sunk in the platform.
//   Albatros       a 30 m boat deck on a slender hull, 37 masts carrying 74
//                  counter-rotating lift screws (15 a side, 7 taller down the
//                  centre line), a propulsive screw at each end, ram bow.
//   Géant d'acier  sheet steel, dark green and oddly mottled; the trunk is
//                  half-curled "en manière d'énorme corne d'abondance" with
//                  the tip UP because the trunk IS the funnel; gilt tusks like
//                  scythes; an Indian turret with lenticular ports and a
//                  rounded dome; a brocade caparison with fringe; and two
//                  pagoda houses on wheels behind it.
//   Épouvante     a 10 m greenish fusiform hull, road wheels, wings that
//                  deploy from the flanks, a screw at each end, no smoke.
//   Projectile     an aluminium ogive with rivet bands, lens ports and the
//                  buffered base, on its cradle.
//
// References:
//   https://jules-verne.net/exposer-l-oeuvre/les-expositions-pedagogiques/les-machines-de-jules-verne/
//   https://www.gutenberg.org/files/5095/5095-h/5095-h.htm
//   https://fr.wikisource.org/wiki/La_Maison_%C3%A0_vapeur
//   https://fr.wikisource.org/wiki/Ma%C3%AEtre_du_monde
export function buildVerneMuseum({ THREE, G, M, box, shape, prop, atY, scene, floor }) {
  // -------------------------------------------------------------------------
  // Surface. Flat colours are what made these read as toys: at arm's length a
  // hull has to show its strakes and rivets, an elephant its enamel and its
  // brocade. Every map here is drawn once and shared by all five models.
  // -------------------------------------------------------------------------
  function paint(W, H, draw, rx = 1, ry = 1) {
    const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    draw(canvas.getContext('2d'), W, H);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 8;
    return t;
  }
  // Plate seams with a rivet line down each, and a slightly different tone per
  // strake so the hull does not read as one extruded tube.
  function platedTex(base, seam, rivet, strake) {
    return paint(256, 256, (c, W, H) => {
      c.fillStyle = base; c.fillRect(0, 0, W, H);
      const rows = 8, h = H / rows;
      for (let r = 0; r < rows; r++) {
        c.fillStyle = strake[r % strake.length];
        c.fillRect(0, r * h, W, h);
        c.strokeStyle = seam; c.lineWidth = 2;
        c.beginPath(); c.moveTo(0, r * h + 0.5); c.lineTo(W, r * h + 0.5); c.stroke();
        c.fillStyle = rivet;
        for (let x = 6; x < W; x += 16) {
          c.beginPath(); c.arc(x, r * h + 5, 1.6, 0, 7); c.fill();
          c.beginPath(); c.arc(x, r * h + h - 5, 1.6, 0, 7); c.fill();
        }
        // Butt straps: the vertical joins between plates in a strake.
        c.strokeStyle = seam; c.lineWidth = 1.2;
        for (let x = (r % 2) * 32; x < W; x += 64) {
          c.beginPath(); c.moveTo(x, r * h); c.lineTo(x, (r + 1) * h); c.stroke();
        }
      }
    }, 3, 2);
  }
  const steelTex = platedTex('#5d6d74', '#3a464c', '#8d9aa0',
    ['#5d6d74', '#57666d', '#617178', '#59686f']);
  // The elephant is plate too — painted dark green and, as Verne has it,
  // "bizarrement tacheté" — so it gets the same seams under the mottling.
  const hideTex = paint(256, 256, (c, W, H) => {
    c.fillStyle = '#2f4239'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * W, y = Math.random() * H, r = 5 + Math.random() * 16;
      c.fillStyle = i % 3 ? 'rgba(24,38,32,0.55)' : 'rgba(64,86,70,0.40)';
      c.beginPath(); c.ellipse(x, y, r, r * 0.7, Math.random() * 3, 0, 7); c.fill();
    }
    const rows = 6, h = H / rows;
    for (let r = 0; r < rows; r++) {
      c.strokeStyle = 'rgba(18,30,26,0.75)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, r * h + 0.5); c.lineTo(W, r * h + 0.5); c.stroke();
      c.fillStyle = 'rgba(126,146,128,0.55)';
      for (let x = 8; x < W; x += 20) { c.beginPath(); c.arc(x, r * h + 6, 1.8, 0, 7); c.fill(); }
    }
  }, 2, 2);
  // Caparison: crimson ground, gold lattice, a medallion in every repeat.
  const brocadeTex = paint(256, 256, (c, W, H) => {
    c.fillStyle = '#8d2030'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#d8ae5c'; c.lineWidth = 3;
    for (let i = -W; i < W * 2; i += 42) {
      c.beginPath(); c.moveTo(i, 0); c.lineTo(i + W, H); c.stroke();
      c.beginPath(); c.moveTo(i + W, 0); c.lineTo(i, H); c.stroke();
    }
    for (let y = 32; y < H; y += 64) for (let x = 32; x < W; x += 64) {
      c.fillStyle = '#e6c884';
      c.beginPath(); c.arc(x, y, 11, 0, 7); c.fill();
      c.fillStyle = '#8d2030';
      c.beginPath(); c.arc(x, y, 5.5, 0, 7); c.fill();
    }
    c.fillStyle = '#c9d3d8'; // silver filigree, as the novel specifies
    for (let x = 0; x < W; x += 16) c.fillRect(x + 5, H - 14, 6, 3);
  }, 2, 1);
  const aluTex = paint(256, 256, (c, W, H) => {
    c.fillStyle = '#c8cdcc'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 700; i++) {
      const x = Math.random() * W;
      c.strokeStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.07})`;
      c.lineWidth = 0.6 + Math.random();
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x + (Math.random() - 0.5) * 6, H); c.stroke();
    }
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * W;
      c.strokeStyle = `rgba(120,132,136,${0.05 + Math.random() * 0.08})`;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
    }
  }, 2, 1);
  // Robur's aerial ship is built of gelatinised paper fibre — pale, not metal.
  const deckTex = paint(256, 256, (c, W, H) => {
    c.fillStyle = '#c6b795'; c.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 14) {
      c.fillStyle = ['#c9ba98', '#c1b18e', '#cdbe9d', '#bdad8a'][(y / 14) % 4 | 0];
      c.fillRect(0, y, W, 13);
      c.strokeStyle = 'rgba(120,104,78,0.5)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke();
    }
  }, 3, 3);
  const wagonTex = paint(256, 256, (c, W, H) => {
    c.fillStyle = '#6b4324'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      c.strokeStyle = `rgba(${40 + Math.random() * 50},${24 + Math.random() * 30},10,0.35)`;
      c.lineWidth = 0.8 + Math.random() * 1.6;
      const x = Math.random() * W;
      c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + 8, H / 3, x - 8, H * 0.7, x, H); c.stroke();
    }
    c.strokeStyle = '#c69a4e'; c.lineWidth = 4;
    c.strokeRect(16, 16, W - 32, H - 32);
  }, 2, 1);
  const spindleTex = paint(256, 256, (c, W, H) => {
    c.fillStyle = '#4a5f4c'; c.fillRect(0, 0, W, H);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.14)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.02)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 64) {
      c.strokeStyle = 'rgba(28,40,30,0.8)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke();
      c.fillStyle = 'rgba(150,166,150,0.5)';
      for (let x = 10; x < W; x += 22) { c.beginPath(); c.arc(x, y + 7, 1.7, 0, 7); c.fill(); }
    }
  }, 2, 1);

  // These cases are lit by one warm point light and nothing else — no
  // environment map — so metalness above about a half turns every hull into a
  // black mirror. The models are painted-metal miniatures, not raw chrome:
  // keep the maps bright and let roughness do the work.
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const steel = std({ map: steelTex, color: 0xe4eef2, metalness: 0.34, roughness: 0.44 });
  const steelDark = std({ color: 0x6c7d85, metalness: 0.3, roughness: 0.5 });
  const gunmetal = std({ color: 0x55636b, metalness: 0.32, roughness: 0.52 });
  const gilt = std({ color: 0xd7ad5b, metalness: 0.72, roughness: 0.3 });
  const giltDark = std({ color: 0xa8863c, metalness: 0.62, roughness: 0.42 });
  const hide = std({ map: hideTex, color: 0xdff0e4, metalness: 0.14, roughness: 0.55 });
  const brocade = std({ map: brocadeTex, roughness: 0.78 });
  const alu = std({ map: aluTex, color: 0xf6f8f7, metalness: 0.42, roughness: 0.34 });
  // Robur builds in compressed, gelatinised paper fibre, not in metal.
  const paperHull = std({ color: 0xbaa987, roughness: 0.66, metalness: 0.05 });
  const timber = std({ map: wagonTex, roughness: 0.6 });
  const deckPaper = std({ map: deckTex, roughness: 0.72 });
  const spindle = std({ map: spindleTex, color: 0xd8e6d6, metalness: 0.22, roughness: 0.46 });
  const ivory = std({ color: 0xe8dab8, roughness: 0.62 });
  const ink = std({ color: 0x122d32, roughness: 0.6 });
  const felt = std({ color: 0x1e3a34, roughness: 0.95 });
  const iron = std({ color: 0x23282c, metalness: 0.4, roughness: 0.6 });
  const lens = std({
    color: 0xa8cfe0, metalness: 0.1, roughness: 0.06,
    transparent: true, opacity: 0.42, depthWrite: false,
  });
  const steam = std({ color: 0xf2f4f2, transparent: true, opacity: 0.3, depthWrite: false });
  const brass = M.brass;

  // -------------------------------------------------------------------------
  // Geometry kit. The hulls are solids of revolution and must be lathed: a
  // scaled sphere gives an egg, and an egg is what made the Nautilus and the
  // Épouvante read as bath toys.
  // -------------------------------------------------------------------------
  function latheX(profile, segments = 26) {
    const g = new THREE.LatheGeometry(
      profile.map(([r, t]) => new THREE.Vector2(Math.max(r, 0.0001), t - 0.5)), segments);
    g.rotateZ(-Math.PI / 2);          // lathe axis now runs along +X
    return g;
  }
  function latheY(profile, segments = 30) {
    return new THREE.LatheGeometry(
      profile.map(([r, t]) => new THREE.Vector2(Math.max(r, 0.0001), t)), segments);
  }
  // A propeller blade rooted at the origin, spanning +Y, pitch already baked in
  // so a single Euler angle can swing it round the shaft.
  function bladeGeo(chord, thick, pitch) {
    const g = new THREE.BoxGeometry(thick, 1, chord);
    g.rotateY(pitch); g.translate(0, 0.5, 0);
    return g;
  }
  // The same, lying down: spans +X, for the lift screws on Robur's masts.
  function liftBladeGeo(chord, thick, pitch) {
    const g = new THREE.BoxGeometry(1, thick, chord);
    g.rotateX(pitch); g.translate(0.5, 0, 0);
    return g;
  }

  const hullNautilus = latheX([
    [0.05, 0], [0.10, 0.02], [0.18, 0.06], [0.29, 0.12], [0.39, 0.20], [0.455, 0.29],
    [0.49, 0.40], [0.50, 0.50], [0.49, 0.60], [0.46, 0.69], [0.40, 0.78], [0.31, 0.86],
    [0.20, 0.93], [0.10, 0.975], [0.03, 1.0],
  ]);
  const hullAlbatros = latheX([
    [0.02, 0], [0.14, 0.03], [0.26, 0.08], [0.36, 0.15], [0.44, 0.24], [0.48, 0.34],
    [0.50, 0.46], [0.50, 0.60], [0.48, 0.72], [0.44, 0.82], [0.36, 0.90], [0.24, 0.96],
    [0.10, 0.995], [0.02, 1.0],
  ]);
  const hullSpindle = latheX([
    [0.02, 0], [0.11, 0.04], [0.23, 0.10], [0.35, 0.18], [0.44, 0.28], [0.49, 0.39],
    [0.50, 0.50], [0.49, 0.61], [0.44, 0.72], [0.35, 0.82], [0.23, 0.90], [0.11, 0.96],
    [0.02, 1.0],
  ]);
  // Both run head (t = 0, −X) to rump (t = 1, +X): the shoulder is the full
  // end, and the barrel tapers aft, which is the way the animal is built.
  const bodyElephant = latheX([
    [0.30, 0], [0.42, 0.05], [0.48, 0.14], [0.50, 0.28], [0.50, 0.46], [0.48, 0.62],
    [0.44, 0.76], [0.37, 0.87], [0.26, 0.95], [0.08, 1.0],
  ]);
  const headElephant = latheX([
    [0.12, 0], [0.30, 0.05], [0.42, 0.14], [0.48, 0.28], [0.50, 0.45], [0.49, 0.62],
    [0.45, 0.78], [0.38, 0.90], [0.28, 1.0],
  ]);
  // The obus: 2.7 m across, 3.6 m tall, an ogival cap, a base flange.
  const shellProjectile = latheY([
    [0, 0], [0.40, 0], [0.46, 0.012], [0.47, 0.045], [0.465, 0.075], [0.47, 0.10],
    [0.47, 0.52], [0.465, 0.60], [0.445, 0.68], [0.41, 0.755], [0.35, 0.825],
    [0.27, 0.882], [0.18, 0.932], [0.10, 0.972], [0.035, 0.995], [0, 1],
  ]);
  const domeTurret = latheY([                       // Indian dome over the howdah
    [0.50, 0], [0.49, 0.10], [0.46, 0.22], [0.40, 0.38], [0.31, 0.55], [0.22, 0.70],
    [0.13, 0.83], [0.06, 0.93], [0.02, 1.0],
  ], 20);
  const screwBlade = bladeGeo(0.075, 0.014, 0.42);
  const liftBlade = liftBladeGeo(0.030, 0.006, 0.38);

  // -------------------------------------------------------------------------
  // Placement helpers.
  // -------------------------------------------------------------------------
  const sph = (mat, x, y, z, a, b, c) => shape(G.sphere, mat, x, y, z, a, b, c);
  const cyl = (mat, x, y, z, a, b, c, rot = {}) => shape(G.cyl32, mat, x, y, z, a, b, c, rot);
  const bx = (mat, x, y, z, a, b, c, rot = {}) => shape(G.box, mat, x, y, z, a, b, c, rot);
  // A tapered tube through points in the XY plane, offset in Z. Verne's trunk
  // and tusks are curves; a stack of spheres reads as a caterpillar.
  function chainXY(mat, pts, z = 0) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0, r0] = pts[i], [x1, y1, r1] = pts[i + 1];
      const dx = x1 - x0, dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      cyl(mat, (x0 + x1) / 2, (y0 + y1) / 2, z, r0 + r1, len, r0 + r1,
        { rz: Math.atan2(-dx, dy) });
      sph(mat, x1, y1, z, r1 * 2, r1 * 2, r1 * 2);
    }
  }
  // Marine screw on an axis along X. `dir` is the way the boss faces, so a bow
  // screw fairs forward and a stern screw aft instead of both pointing astern.
  function marineScrew(mat, x, y, z, radius, dir = -1, blades = 4) {
    shape(G.cone, mat, x, y, z, 0.085, 0.11, 0.085, { rz: dir * Math.PI / 2 });
    cyl(mat, x, y, z, 0.07, 0.05, 0.07, { rz: Math.PI / 2 });
    for (let i = 0; i < blades; i++)
      shape(screwBlade, mat, x, y, z, 1, radius, 1, { rx: (i / blades) * Math.PI * 2 });
  }
  // One of Robur's 37 masts: a shaft carrying two counter-turning lift screws.
  // The blade geometry already spans +X, so only its span is scaled — scaling
  // across the baked-in pitch would shear the blade instead of twisting it.
  function liftMast(x, z, height, radius) {
    cyl(steelDark, x, height / 2, z, 0.016, height, 0.016);
    // Three blades to a screw. Two sit in line and read as a crossbar, which
    // turned the whole ship into a row of signposts.
    for (const [lift, phase] of [[height - 0.075, 0], [height + 0.01, Math.PI / 3]]) {
      cyl(gilt, x, lift, z, 0.030, 0.022, 0.030);
      for (let i = 0; i < 3; i++)
        shape(liftBlade, gilt, x, lift, z, radius, 1, 1,
          { ry: phase + i * Math.PI * 2 / 3 });
    }
  }
  // Spoked wheel, axle along Z.
  function wheel(x, y, z, diameter, width) {
    cyl(iron, x, y, z, diameter, width, diameter, { rx: Math.PI / 2 });
    cyl(gunmetal, x, y, z, diameter * 0.84, width * 1.25, diameter * 0.84, { rx: Math.PI / 2 });
    cyl(gilt, x, y, z, diameter * 0.2, width * 1.5, diameter * 0.2, { rx: Math.PI / 2 });
    for (let i = 0; i < 6; i++)
      bx(gilt, x, y, z, 0.012, diameter * 0.78, 0.012, { rz: (i / 6) * Math.PI });
  }

  // -------------------------------------------------------------------------
  // The exhibits.
  // -------------------------------------------------------------------------
  const exhibits = [
    [-6.5, 6, '01  NAUTILUS', 'Vingt Mille Lieues sous les mers · 1869–1870', 'Sous-marin électrique du capitaine Nemo.', 'Éperon, salon à hublots et hélice propulsive.'],
    [6.5, 6, '02  ALBATROS', 'Robur-le-Conquérant · 1886', 'Navire aérien soutenu par des hélices.', 'Trente-sept mâts portent soixante-quatorze rotors.'],
    [-6.5, 12.5, '03  LE GÉANT D’ACIER', 'La Maison à vapeur · 1880', 'Un éléphant de tôle mû par la vapeur.', 'Il remorque deux pagodes roulantes à travers l’Inde.'],
    [6.5, 12.5, '04  L’ÉPOUVANTE', 'Maître du monde · 1904', 'La machine de Robur voyage sur terre,', 'sur l’eau, sous l’eau et dans les airs.'],
    [0, 10, '05  LE PROJECTILE LUNAIRE', 'De la Terre à la Lune · 1865', 'Une capsule-obus en aluminium, lancée', 'par le canon géant Columbiad.'],
  ];
  function panel(x, y, z, w, h, lines, ry = 0) {
    const canvas = Object.assign(document.createElement('canvas'), { width: 1024, height: 384 });
    const c = canvas.getContext('2d');
    c.fillStyle = '#112b30'; c.fillRect(0, 0, 1024, 384);
    c.strokeStyle = '#be9958'; c.lineWidth = 5; c.strokeRect(14, 14, 996, 356);
    c.strokeStyle = 'rgba(190,153,88,0.45)'; c.lineWidth = 1.5; c.strokeRect(24, 24, 976, 336);
    c.textAlign = 'center';
    lines.forEach((line, i) => {
      c.fillStyle = i === 0 ? '#f0cb83' : '#eee4cf';
      c.font = i === 0 ? 'bold 49px Georgia' : '30px sans-serif';
      c.fillText(line, 512, 83 + i * 76, 945);
    });
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture });
    // Labels are decorative: keep their planes out of horizontal collision boxes.
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z); mesh.rotation.y = ry; scene.add(mesh);
  }

  // --- 01 · Nautilus -------------------------------------------------------
  function buildNautilus() {
    const L = 3.05, D = 0.38, Y = 0.16;
    shape(hullNautilus, steel, 0, Y, 0, L, D, D);
    // Riveted strake bands, and the raised platform Nemo walks on.
    for (const x of [-1.05, -0.55, 0, 0.55, 1.02])
      cyl(steelDark, x, Y, 0, D * 0.995, 0.012, D * 0.995, { rz: Math.PI / 2 });
    bx(steelDark, -0.05, Y + D / 2 - 0.012, 0, 2.05, 0.03, 0.155);
    bx(steel, -0.05, Y + D / 2 - 0.004, 0, 1.95, 0.02, 0.12);
    // The spur: a ram forged onto the stem, and the stem itself is faired.
    shape(G.cone, steelDark, L / 2 - 0.02, Y, 0, 0.10, 0.30, 0.10, { rz: -Math.PI / 2 });
    shape(G.cone, gilt, L / 2 + 0.12, Y, 0, 0.045, 0.10, 0.045, { rz: -Math.PI / 2 });
    // Pilot cage forward, lantern immediately abaft it — both small, as drawn.
    bx(steelDark, 0.60, Y + 0.215, 0, 0.20, 0.09, 0.155);
    sph(steelDark, 0.60, Y + 0.255, 0, 0.20, 0.09, 0.155);
    for (const zz of [-0.08, 0.08]) for (const dx of [-0.05, 0.05])
      sph(lens, 0.60 + dx, Y + 0.235, zz, 0.045, 0.05, 0.02);
    sph(lens, 0.71, Y + 0.235, 0, 0.03, 0.05, 0.09);
    cyl(steelDark, 0.36, Y + 0.20, 0, 0.13, 0.05, 0.13);
    sph(brass, 0.36, Y + 0.235, 0, 0.13, 0.10, 0.13);
    sph(M.lamp, 0.40, Y + 0.235, 0, 0.06, 0.075, 0.075);
    // The dinghy sits in a well let into the platform.
    bx(steelDark, -0.62, Y + D / 2 - 0.02, 0, 0.42, 0.035, 0.18);
    shape(G.lifeboat, steelDark, -0.62, Y + D / 2 + 0.015, 0, 0.15, 0.09, 0.38,
      { ry: Math.PI / 2 });
    // Salon panels: the great oval lights amidships, in heavy brass frames.
    for (const zz of [-1, 1]) for (const dx of [-0.30, 0.02]) {
      sph(brass, dx, Y + 0.01, zz * (D / 2 - 0.01), 0.30, 0.19, 0.03);
      sph(lens, dx, Y + 0.01, zz * (D / 2 + 0.005), 0.25, 0.145, 0.03);
    }
    // Diving planes, rudder, and the screw in its aperture. The planes are
    // small fins on the quarters: at 20 cm they read as shelves bolted on.
    for (const zz of [-1, 1])
      bx(steel, -1.14, Y - 0.01, zz * 0.14, 0.15, 0.014, 0.13, { ry: zz * 0.12 });
    bx(steelDark, -1.36, Y + 0.10, 0, 0.22, 0.24, 0.018);
    bx(steelDark, -1.36, Y - 0.09, 0, 0.18, 0.16, 0.018);
    marineScrew(brass, -1.52, Y, 0, 0.145);
    // Cradle: two brass rings standing on the case, not a hovering hull. The
    // ring encircles the hull, so its axis lies along X — G.torus is a
    // horizontal ring at rest, which is a whole quarter-turn away from that.
    for (const dx of [-0.72, 0.62])
      shape(G.torus, brass, dx, Y, 0, 0.44, 0.44, 0.44, { rz: Math.PI / 2 });
  }

  // --- 02 · Albatros -------------------------------------------------------
  function buildAlbatros() {
    const L = 3.10, Y = 0.10;
    shape(hullAlbatros, paperHull, 0, Y, 0, L, 0.22, 0.44);
    bx(deckPaper, 0, Y + 0.11, 0, L * 0.92, 0.022, 0.42);
    // Bulwark and stanchions round the deck edge.
    for (const zz of [-1, 1]) {
      bx(paperHull, 0, Y + 0.145, zz * 0.21, L * 0.90, 0.05, 0.016);
      for (let x = -1.34; x <= 1.35; x += 0.335)
        cyl(gilt, x, Y + 0.185, zz * 0.21, 0.012, 0.10, 0.012);
      bx(gilt, 0, Y + 0.235, zz * 0.21, L * 0.88, 0.012, 0.012);
    }
    // Ram bow and the sternpost, both drawn straight out of a ship's lines.
    shape(G.cone, paperHull, L / 2 - 0.02, Y + 0.03, 0, 0.10, 0.26, 0.10, { rz: -Math.PI / 2 });
    bx(paperHull, -L / 2 + 0.10, Y + 0.10, 0, 0.22, 0.16, 0.02);
    // Three deckhouses, in the gaps between the centre-line masts.
    for (const dx of [-0.66, 0.22, 1.10]) {
      bx(ivory, dx, Y + 0.175, 0, 0.32, 0.10, 0.28);
      sph(ivory, dx, Y + 0.222, 0, 0.32, 0.075, 0.28);
      for (const zz of [-1, 1]) for (const w of [-0.09, 0, 0.09])
        bx(lens, dx + w, Y + 0.185, zz * 0.142, 0.055, 0.04, 0.008);
    }
    // 37 masts: fifteen a side, seven taller down the centre line, each with
    // its pair of counter-rotating screws — Verne's seventy-four. They have to
    // stand well clear of the deck and swing a long blade, or the ship reads
    // as a row of little tables instead of a forest of rotors.
    for (let i = 0; i < 15; i++) {
      const x = -1.40 + i * 0.20;
      for (const zz of [-1, 1]) liftMast(x, zz * 0.155, 0.34, 0.115);
    }
    for (let i = 0; i < 7; i++) liftMast(-1.32 + i * 0.44, 0, 0.52, 0.145);
    // Propulsive screws fore and aft, on their outriggers.
    for (const sx of [-1, 1]) {
      bx(steelDark, sx * 1.60, Y + 0.02, 0, 0.14, 0.05, 0.05);
      marineScrew(gilt, sx * 1.70, Y + 0.02, 0, 0.13, sx);
    }
    // Rudder.
    bx(ivory, -1.44, Y + 0.20, 0, 0.24, 0.20, 0.016);
    // She is the only one of the five that is shown flying, so she is the only
    // one on stems: they run from the case top up to the keel.
    for (const dx of [-0.9, 0.8]) {
      cyl(brass, dx, -0.20, 0, 0.05, 0.40, 0.05);
      cyl(brass, dx, -0.02, 0, 0.13, 0.03, 0.13);
    }
  }

  // --- 03 · Le Géant d'acier ----------------------------------------------
  // The whole train is 27 m of road: elephant, then two houses. It only fits a
  // 3.8 m case at about 1:8, so every part below is laid out from one set of
  // stations rather than eyeballed — an elephant drawn to its own scale beside
  // toy wagons is exactly what made this exhibit read as a nursery toy.
  function buildSteamGiant() {
    const HX = -1.34;                 // head centre; the elephant heads toward −X
    const BX = -0.66;                 // body centre
    const BY = 0.56;                  // body axis height
    shape(bodyElephant, hide, BX, BY, 0, 0.86, 0.50, 0.50);
    shape(headElephant, hide, HX, BY + 0.05, 0, 0.48, 0.42, 0.38);
    sph(hide, HX + 0.08, BY + 0.20, 0, 0.28, 0.20, 0.30);       // domed forehead
    // A neck, or the head and the barrel merge into one tube and the animal
    // loses the joint that tells you which end is which.
    cyl(hide, HX + 0.26, BY + 0.04, 0, 0.34, 0.30, 0.40, { rz: Math.PI / 2 });
    for (const zz of [-1, 1]) {
      // Ears: two great riveted plates hinged off the skull, gilt at the rim.
      sph(giltDark, HX + 0.05, BY + 0.02, zz * 0.185, 0.32, 0.40, 0.055);
      sph(hide, HX + 0.06, BY + 0.02, zz * 0.205, 0.28, 0.35, 0.035);
      // Eyes, in gilt sockets.
      sph(gilt, HX - 0.13, BY + 0.10, zz * 0.135, 0.07, 0.07, 0.07);
      sph(ink, HX - 0.155, BY + 0.10, zz * 0.138, 0.05, 0.05, 0.05);
    }
    // Tusks "comme deux faux menaçantes", and the trunk half-curled with its
    // tip in the air: the trunk IS the funnel, and the steam comes out of it.
    for (const zz of [-1, 1]) chainXY(gilt, [
      [HX - 0.17, 0.43, 0.026], [HX - 0.26, 0.37, 0.021], [HX - 0.35, 0.34, 0.016],
      [HX - 0.44, 0.35, 0.011], [HX - 0.51, 0.40, 0.007], [HX - 0.55, 0.46, 0.004],
    ], zz * 0.125);
    chainXY(hide, [
      [HX - 0.16, 0.58, 0.072], [HX - 0.23, 0.48, 0.065], [HX - 0.29, 0.37, 0.058],
      [HX - 0.35, 0.27, 0.050], [HX - 0.42, 0.20, 0.043], [HX - 0.50, 0.19, 0.036],
      [HX - 0.56, 0.24, 0.030], [HX - 0.59, 0.33, 0.025], [HX - 0.57, 0.41, 0.020],
      [HX - 0.52, 0.47, 0.016],
    ]);
    // "Un tourbillon aigu de vapeur s'échappait de sa trompe" — one plume,
    // overlapping puffs off the tip. Spaced out they are just floating balls.
    for (let i = 0; i < 4; i++) {
      const s = 0.042 + i * 0.017;
      sph(steam, HX - 0.525 + i * 0.006, 0.50 + i * 0.038, 0, s, s, s);
    }
    // Legs: columns of plate with a joint band and a broad foot. The forward
    // pair is advanced and the after pair trailing — the thing is walking.
    for (const zz of [-1, 1]) for (const [lx, lean] of [[-1.06, 0.11], [-0.36, -0.09]]) {
      cyl(hide, lx, 0.18, zz * 0.18, 0.18, 0.36, 0.18, { rz: lean });
      cyl(giltDark, lx - lean * 0.14, 0.27, zz * 0.18, 0.195, 0.032, 0.195);
      cyl(iron, lx + lean * 0.09, 0.045, zz * 0.18, 0.215, 0.09, 0.215);
      cyl(gunmetal, lx + lean * 0.09, 0.012, zz * 0.18, 0.23, 0.028, 0.23);
    }
    sph(hide, -0.22, BY, 0, 0.22, 0.34, 0.30);                  // quarters
    chainXY(hide, [[-0.17, 0.62, 0.026], [-0.11, 0.52, 0.020], [-0.08, 0.42, 0.014]]);
    // Caparison: brocade over the back and down the flanks, silver-and-gold
    // filigree at the hem, and a fringe of twisted tassels.
    for (const zz of [-1, 1]) {
      bx(brocade, BX, BY - 0.02, zz * 0.253, 0.78, 0.30, 0.03);
      bx(gilt, BX, BY - 0.165, zz * 0.258, 0.80, 0.03, 0.032);
      for (let i = 0; i < 8; i++) {
        const tx = BX - 0.34 + i * 0.098;
        cyl(gilt, tx, BY - 0.205, zz * 0.258, 0.02, 0.055, 0.02);
        sph(gilt, tx, BY - 0.242, zz * 0.258, 0.032, 0.04, 0.032);
      }
    }
    bx(brocade, BX, BY + 0.245, 0, 0.78, 0.03, 0.50);
    // The howdah: a glazed kiosk — "de larges verres lenticulaires, pareils
    // aux hublots d'une cabine de navire" — under a rounded Indian dome.
    // Beads of glass stuck on the outside of a drum read as barnacles, so the
    // glass is a band and the colonnettes stand in front of it.
    cyl(timber, BX, BY + 0.31, 0, 0.34, 0.13, 0.34);
    cyl(lens, BX, BY + 0.345, 0, 0.42, 0.15, 0.42);
    cyl(gilt, BX, BY + 0.262, 0, 0.46, 0.03, 0.46);
    cyl(gilt, BX, BY + 0.424, 0, 0.46, 0.03, 0.46);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      cyl(gilt, BX + Math.cos(a) * 0.208, BY + 0.345, Math.sin(a) * 0.208,
        0.035, 0.15, 0.035);
    }
    shape(domeTurret, gilt, BX, BY + 0.43, 0, 0.44, 0.23, 0.44);
    sph(gilt, BX, BY + 0.675, 0, 0.05, 0.07, 0.05);
    // Drawbar to the train.
    bx(steelDark, -0.06, 0.28, 0, 0.26, 0.045, 0.055);
    // Two pagoda houses: panelled sides, gold-framed lights, upturned eaves,
    // and the verandah on the after end of the second, as Benett draws it.
    for (const [wx, veranda] of [[0.30, false], [1.22, true]]) {
      bx(iron, wx, 0.145, 0, 0.80, 0.035, 0.42);
      for (const sx of [-1, 1]) for (const zz of [-1, 1])
        wheel(wx + sx * 0.26, 0.09, zz * 0.225, 0.17, 0.045);
      bx(timber, wx, 0.345, 0, 0.76, 0.34, 0.44);
      bx(gilt, wx, 0.178, 0, 0.80, 0.028, 0.47);
      bx(gilt, wx, 0.512, 0, 0.80, 0.028, 0.47);
      for (const zz of [-1, 1]) for (const w of [-0.24, 0, 0.24]) {
        bx(gilt, wx + w, 0.36, zz * 0.223, 0.15, 0.19, 0.012);
        bx(lens, wx + w, 0.36, zz * 0.229, 0.12, 0.16, 0.012);
      }
      // Pagoda roof in two tiers. A lathed cone over a rectangular house is a
      // fairground parasol; a real one is hipped, so it is built as setback
      // slabs with the eaves turned up at the corners.
      bx(timber, wx, 0.535, 0, 0.90, 0.022, 0.56);
      bx(gilt, wx, 0.548, 0, 0.92, 0.014, 0.58);
      bx(timber, wx, 0.575, 0, 0.78, 0.045, 0.48);
      bx(timber, wx, 0.607, 0, 0.66, 0.035, 0.40);
      bx(gilt, wx, 0.626, 0, 0.68, 0.012, 0.42);
      bx(timber, wx, 0.652, 0, 0.52, 0.042, 0.32);
      bx(timber, wx, 0.682, 0, 0.38, 0.030, 0.24);
      bx(gilt, wx, 0.700, 0, 0.30, 0.016, 0.18);
      for (const sx of [-1, 1]) for (const zz of [-1, 1])
        bx(gilt, wx + sx * 0.44, 0.566, zz * 0.27, 0.13, 0.014, 0.10,
          { rz: sx * 0.42, rx: -zz * 0.36 });
      cyl(gilt, wx, 0.722, 0, 0.05, 0.05, 0.05);
      sph(gilt, wx, 0.755, 0, 0.055, 0.075, 0.055);
      if (veranda) {
        bx(timber, wx + 0.50, 0.178, 0, 0.24, 0.035, 0.42);
        for (const zz of [-1, 1]) {
          for (const w of [0.42, 0.60]) cyl(gilt, wx + w, 0.255, zz * 0.19, 0.014, 0.13, 0.014);
          bx(gilt, wx + 0.51, 0.315, zz * 0.19, 0.22, 0.014, 0.014);
        }
        bx(gilt, wx + 0.60, 0.255, 0, 0.014, 0.13, 0.38);
      }
      bx(steelDark, wx - 0.46, 0.19, 0, 0.14, 0.032, 0.05);
    }
  }

  // --- 04 · L'Épouvante ----------------------------------------------------
  function buildTerror() {
    const L = 2.62, Y = 0.20;
    shape(hullSpindle, spindle, 0, Y, 0, L, 0.32, 0.42);
    // Chine strake and the plated skirt over the wheel arches.
    for (const zz of [-1, 1]) bx(gunmetal, 0, Y - 0.05, zz * 0.20, L * 0.72, 0.03, 0.035);
    // Road wheels, half buried in the flanks as Roux draws them.
    for (const sx of [-1, 1]) for (const zz of [-1, 1])
      wheel(sx * 0.66, Y - 0.11, zz * 0.185, 0.30, 0.06);
    // The wings: they come out of the flanks, ribbed, with a slight dihedral.
    for (const zz of [-1, 1]) {
      bx(spindle, -0.10, Y + 0.03, zz * 0.42, 0.58, 0.022, 0.62, { rx: zz * 0.14 });
      bx(gunmetal, -0.10, Y + 0.035, zz * 0.42, 0.60, 0.014, 0.05, { rx: zz * 0.14 });
      for (const w of [-0.18, 0, 0.18])
        bx(gunmetal, -0.10 + w, Y + 0.042, zz * 0.42, 0.02, 0.012, 0.60, { rx: zz * 0.14 });
      bx(gunmetal, 0.16, Y + 0.03, zz * 0.24, 0.10, 0.03, 0.16, { ry: zz * 0.5 });
    }
    // Conning cupola amidships, and the ventilators either side of it.
    cyl(gunmetal, 0.12, Y + 0.15, 0, 0.30, 0.07, 0.26);
    sph(lens, 0.12, Y + 0.19, 0, 0.28, 0.16, 0.24);
    cyl(gilt, 0.12, Y + 0.185, 0, 0.31, 0.012, 0.27);
    for (const zz of [-1, 1]) cyl(gunmetal, -0.30, Y + 0.17, zz * 0.09, 0.05, 0.09, 0.05);
    // A screw at each end and the rudder aft — no funnel, and no smoke: Verne
    // is explicit that the thing gives off "ni vapeur, ni fumée, ni odeur".
    marineScrew(gunmetal, L / 2 - 0.06, Y, 0, 0.13, 1);
    marineScrew(gunmetal, -L / 2 + 0.06, Y, 0, 0.13, -1);
    bx(gunmetal, -1.16, Y + 0.14, 0, 0.20, 0.22, 0.016);
    bx(gunmetal, -1.16, Y - 0.10, 0, 0.16, 0.14, 0.016);
    // No cradle: on the road she stands on her own wheels.
  }

  // --- 05 · Le projectile lunaire -----------------------------------------
  function buildProjectile() {
    const H = 1.06, D = 0.66;
    shape(shellProjectile, alu, 0, 0.05, 0, D, H, D);
    // Rivet bands round the shell, and the heavy base flange.
    for (const yy of [0.12, 0.30, 0.48, 0.62]) {
      cyl(alu, 0, 0.05 + yy, 0, D * 0.955, 0.022, D * 0.955);
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        sph(alu, Math.cos(a) * D * 0.48, 0.05 + yy, Math.sin(a) * D * 0.48,
          0.022, 0.022, 0.022);
      }
    }
    cyl(gunmetal, 0, 0.045, 0, D * 1.06, 0.05, D * 1.06);
    cyl(alu, 0, 0.085, 0, D * 1.02, 0.035, D * 1.02);
    // Lenticular ports: three round the wall, one in the cap. The port's axis
    // must point out along the radius, and rx tips the disc onto +Z, so the
    // yaw that follows has to be π/2 − a, not −a, or every light faces the
    // tangent and you look straight through the shell.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;   // one opposite the hatch
      const cx = Math.cos(a), cz = Math.sin(a);
      const yaw = Math.PI / 2 - a;
      cyl(brass, cx * D * 0.47, 0.44, cz * D * 0.47, 0.19, 0.03, 0.19,
        { rx: Math.PI / 2, ry: yaw });
      cyl(lens, cx * D * 0.485, 0.44, cz * D * 0.485, 0.155, 0.03, 0.155,
        { rx: Math.PI / 2, ry: yaw });
      for (let k = 0; k < 8; k++) {
        const b = (k / 8) * Math.PI * 2;
        sph(brass, cx * D * 0.48 + -cz * Math.cos(b) * 0.085,
          0.44 + Math.sin(b) * 0.085, cz * D * 0.48 + cx * Math.cos(b) * 0.085,
          0.02, 0.02, 0.02);
      }
    }
    cyl(brass, 0, 0.05 + H * 0.955, 0, 0.13, 0.03, 0.13);
    cyl(lens, 0, 0.05 + H * 0.965, 0, 0.10, 0.03, 0.10);
    // The hatch, with its hinges and its dogs.
    cyl(alu, 0, 0.30, D * 0.475, 0.28, 0.028, 0.30, { rx: Math.PI / 2 });
    cyl(brass, 0, 0.30, D * 0.487, 0.30, 0.014, 0.32, { rx: Math.PI / 2 });
    for (const dx of [-0.11, 0.11]) bx(brass, dx, 0.30, D * 0.50, 0.045, 0.05, 0.02);
    // Cradle: three padded arms on a felted plinth.
    cyl(felt, 0, 0.02, 0, D * 1.35, 0.04, D * 1.35);
    cyl(gilt, 0, 0.042, 0, D * 1.38, 0.012, D * 1.38);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.9;
      bx(brass, Math.cos(a) * D * 0.62, 0.10, Math.sin(a) * D * 0.62,
        0.05, 0.12, 0.05, { ry: -a });
    }
  }

  const builders = [buildNautilus, buildAlbatros, buildSteamGiant, buildTerror, buildProjectile];
  // How high the model's own datum floats over the case top. A machine that
  // has feet or road wheels stands on the case; one that swims or flies is
  // carried, and carries its own mount. Every model was floating on two brass
  // stems before, which turned a walking elephant into a hovering one.
  const CASE_TOP = 1.142;
  const LIFT = [0.06, 0.40, 0, 0.06, 0];

  exhibits.forEach(([x, z, title, book, line1, line2], index) => {
    const width = index === 4 ? 2.5 : 3.8;
    prop(() => atY(floor, x, z, 0, () => {
      box(ink, 0, .10, 0, width + .16, .20, 2.16);
      box(M.darkWood, 0, .58, 0, width, .96, 2);
      box(brass, 0, 1.06, 0, width + .10, .055, 2.10);
      box(ink, 0, 1.11, 0, width, .045, 2);
      // Gilt fillet along the case, and a felt bed under the model.
      for (const zz of [-1, 1]) box(brass, 0, .995, zz * 1.002, width - .04, .014, .014);
      for (const side of [-1, 1]) box(brass, side * (width / 2 - .12), .58, -1.012, .025, .76, .025);
      box(felt, 0, CASE_TOP - .006, 0, width - .30, .012, 1.70);
      atY(floor + CASE_TOP + LIFT[index], 0, 0, 0, builders[index]);
    }));
    panel(x, floor + .65, z - 1.025, width - .34, .68, [title, book, line1, line2], Math.PI);
    panel(x, floor + .65, z + 1.025, width - .34, .68, [title, book, line1, line2]);
    const light = new THREE.PointLight(0xffdca0, 8, 6, 2);
    light.position.set(x, floor + 3.8, z); scene.add(light);
  });
  // Signs face arrivals from either end. The centre aisle stays four metres wide.
  panel(0, floor + 4.15, 2.22, 7, 1.45, ['JULES VERNE', 'LE CABINET DES VOYAGES EXTRAORDINAIRES', 'Cinq machines · cinq rêves de voyage', 'Maquettes inspirées des romans']);
  panel(0, floor + 4.15, 17.78, 7, 1.45, ['JULES VERNE', 'LE CABINET DES VOYAGES EXTRAORDINAIRES', 'Explorez les inventions en miniature', 'Sous la mer · sur terre · dans les airs'], Math.PI);
  return exhibits;
}
