// marineLife.js — Deserted mountainous island & oceanic fauna (dolphins & orcas)
// for the luxury cruise map (main-CRUISE.js).
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// 1. SPLASH & FOAM SYSTEM
// Pre-allocated pool of foam rings and water spray particles to avoid GC.
// ---------------------------------------------------------------------------
class SplashManager {
  constructor(scene) {
    this.scene = scene;
    this.rings = [];
    this.droplets = [];
    this.maxRings = 24;
    this.maxDroplets = 80;

    // Foam ring texture
    const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 25, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.8, 'rgba(215,240,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(64, 64, 62, 0, Math.PI * 2);
    ctx.fill();
    const ringTex = new THREE.CanvasTexture(c);
    ringTex.colorSpace = THREE.SRGBColorSpace;

    const ringMat = new THREE.MeshBasicMaterial({
      map: ringTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    });

    const ringGeo = new THREE.PlaneGeometry(1, 1);
    ringGeo.rotateX(-Math.PI / 2);

    for (let i = 0; i < this.maxRings; i++) {
      const mesh = new THREE.Mesh(ringGeo, ringMat.clone());
      mesh.visible = false;
      mesh.position.y = 0.08;
      scene.add(mesh);
      this.rings.push({ mesh, active: false, life: 0, maxLife: 1.8, maxScale: 4.0 });
    }

    // Water spray particles
    const dropGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(this.maxDroplets * 3);
    const col = new Float32Array(this.maxDroplets * 3);
    dropGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dropGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const dropMat = new THREE.PointsMaterial({
      size: 0.65,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.dropMesh = new THREE.Points(dropGeo, dropMat);
    scene.add(this.dropMesh);

    for (let i = 0; i < this.maxDroplets; i++) {
      this.droplets.push({
        x: 0, y: -999, z: 0,
        vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1.2,
        active: false,
      });
    }
  }

  triggerSplash(x, z, scale = 3.5, intensity = 1.0) {
    // Find inactive ring
    const ring = this.rings.find(r => !r.active);
    if (ring) {
      ring.active = true;
      ring.life = 0;
      ring.maxLife = 1.4 + scale * 0.12;
      ring.maxScale = scale;
      ring.mesh.position.set(x, 0.08, z);
      ring.mesh.scale.set(0.5, 0.5, 0.5);
      ring.mesh.material.opacity = 0.9;
      ring.mesh.visible = true;
    }

    // Spawn droplet burst
    const numDrops = Math.min(12, Math.floor(6 * intensity));
    let spawned = 0;
    for (const d of this.droplets) {
      if (spawned >= numDrops) break;
      if (!d.active) {
        d.active = true;
        d.x = x + (Math.random() - 0.5) * scale * 0.4;
        d.y = 0.2;
        d.z = z + (Math.random() - 0.5) * scale * 0.4;
        const speed = (2.5 + Math.random() * 4.5) * intensity;
        const angle = Math.random() * Math.PI * 2;
        d.vx = Math.cos(angle) * speed * 0.5;
        d.vy = (3.5 + Math.random() * 4.5) * intensity;
        d.vz = Math.sin(angle) * speed * 0.5;
        d.life = 0;
        d.maxLife = 0.8 + Math.random() * 0.6;
        spawned++;
      }
    }
  }

  update(dt) {
    // Update rings
    for (const r of this.rings) {
      if (!r.active) continue;
      r.life += dt;
      const t = r.life / r.maxLife;
      if (t >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const curScale = 0.5 + (r.maxScale - 0.5) * Math.sin(t * Math.PI * 0.5);
      r.mesh.scale.set(curScale, curScale, curScale);
      r.mesh.material.opacity = (1 - t) * 0.85;
    }

    // Update droplets
    const posAttr = this.dropMesh.geometry.attributes.position;
    const colAttr = this.dropMesh.geometry.attributes.color;
    for (let i = 0; i < this.droplets.length; i++) {
      const d = this.droplets[i];
      if (!d.active) {
        posAttr.setY(i, -999);
        continue;
      }
      d.life += dt;
      if (d.life >= d.maxLife || d.y < 0) {
        d.active = false;
        posAttr.setY(i, -999);
        continue;
      }
      d.vy -= 9.8 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      posAttr.setXYZ(i, d.x, d.y, d.z);
      const alpha = Math.max(0, 1 - d.life / d.maxLife);
      colAttr.setXYZ(i, 0.88 * alpha, 0.94 * alpha, 1.0 * alpha);
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// 2. DESERTED MOUNTAINOUS ISLAND (Île montagneuse déserte)
// ---------------------------------------------------------------------------
export function buildDesertedIsland(scene) {
  const island = new THREE.Group();
  island.name = 'deserted_island';

  // Dimensions of main landmass
  const WIDTH = 920;
  const DEPTH = 780;
  const SEGS_X = 112;
  const SEGS_Z = 96;

  const geo = new THREE.PlaneGeometry(WIDTH, DEPTH, SEGS_X, SEGS_Z);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  // Fractal elevation function
  const heights = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);

    const u = x / 390;
    const v = z / 330;
    const dist = Math.hypot(u, v);
    const angle = Math.atan2(v, u);

    // Natural perturbed coastline shape
    const rCoast = 1.0
      + 0.22 * Math.sin(3.0 * angle + 0.9)
      + 0.15 * Math.cos(5.0 * angle - 1.2)
      + 0.08 * Math.sin(7.0 * angle + 2.3);

    const normDist = dist / rCoast;

    // Volcanic massif components
    // 1. Main soaring volcanic peak (west-center)
    const d1 = Math.hypot(x + 45, z + 25);
    const h1 = 240 * Math.exp(-Math.pow(d1 / 165, 1.85));

    // 2. Secondary eastern craggy peak
    const d2 = Math.hypot(x - 125, z - 20);
    const h2 = 180 * Math.exp(-Math.pow(d2 / 135, 1.75));

    // 3. Southern ridge spine
    const d3 = Math.hypot(x + 20, z - 130);
    const h3 = 135 * Math.exp(-Math.pow(d3 / 115, 1.65));

    // 4. Northwest jagged shoulders
    const d4 = Math.hypot(x + 150, z + 110);
    const h4 = 115 * Math.exp(-Math.pow(d4 / 110, 1.6));

    // 5. High-frequency ridges, erosion valleys and craggy details
    const ridgeA = Math.abs(Math.sin(x * 0.027 + z * 0.022)) * 34;
    const ridgeB = Math.sin(x * 0.054 - z * 0.038) * 16;
    const micro = (Math.sin(x * 0.12 + 1.1) * Math.cos(z * 0.11 - 0.8)) * 6;

    let rawH = h1 + h2 + h3 + h4 + ridgeA + ridgeB + micro;

    // Gentle beach / bay on the south-east coast facing the ship
    if (x > 30 && z > 20) {
      const bayDist = Math.hypot(x - 120, z - 110);
      if (bayDist < 160) {
        rawH *= 0.45 + 0.55 * (bayDist / 160);
      }
    }

    // Shoreline falloff into the ocean
    const falloff = 1.0 - THREE.MathUtils.smoothstep(normDist, 0.62, 1.01);
    let y = rawH * falloff;

    // Submerged skirt
    if (normDist >= 0.96) {
      y = (y - 1.0) - Math.pow((normDist - 0.96) / 0.05, 1.6) * 26;
    } else {
      y = Math.max(-10, y);
    }

    heights[i] = y;
    pos.setY(i, y);
  }

  geo.computeVertexNormals();
  const normals = geo.attributes.normal;

  // Vertex color painting: sand, lush jungle, steep rock cliffs, mountain crags
  const colSand = new THREE.Color(0xd7c49b);
  const colWetSand = new THREE.Color(0x947c54);
  const colJungle = new THREE.Color(0x2d5b24);
  const colJungleLight = new THREE.Color(0x3e722c);
  const colMountainSlope = new THREE.Color(0x4c6138);
  const colCliffDark = new THREE.Color(0x3b3834);
  const colCliffRock = new THREE.Color(0x565048);
  const colGranitePeak = new THREE.Color(0x7b818a);
  const colSummitLight = new THREE.Color(0x9197a0);

  for (let i = 0; i < pos.count; i++) {
    const y = heights[i];
    const ny = normals.getY(i);
    let c = new THREE.Color();

    if (y <= 3.6) {
      // Shoreline & Beach
      const t = THREE.MathUtils.clamp(y / 3.6, 0, 1);
      c.copy(colWetSand).lerp(colSand, t);
    } else if (ny >= 0.65) {
      // Moderate/gentle slopes: coastal jungle -> mountain greenery -> alpine scrub
      if (y < 60) {
        const t = y / 60;
        c.copy(colJungle).lerp(colJungleLight, Math.sin(t * Math.PI));
      } else if (y < 125) {
        const t = (y - 60) / 65;
        c.copy(colJungleLight).lerp(colMountainSlope, t);
      } else if (y < 170) {
        const t = (y - 125) / 45;
        c.copy(colMountainSlope).lerp(colGranitePeak, t);
      } else {
        const t = THREE.MathUtils.clamp((y - 170) / 70, 0, 1);
        c.copy(colGranitePeak).lerp(colSummitLight, t);
      }
    } else {
      // Steep rock cliffs & craggy escarpments
      const cliffFactor = THREE.MathUtils.clamp((0.65 - ny) / 0.45, 0, 1);
      c.copy(colCliffRock).lerp(colCliffDark, cliffFactor);
      if (y > 150) {
        c.lerp(colGranitePeak, 0.45);
      }
    }

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const islandMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.08,
    fog: true,
  });

  const islandMesh = new THREE.Mesh(geo, islandMat);
  islandMesh.receiveShadow = false;
  island.add(islandMesh);

  // Satellite Islet 1: Farallon Nord (steep craggy sea stack)
  const stackGeo = new THREE.ConeGeometry(38, 54, 10);
  stackGeo.translate(0, 22, 0);
  const stackMesh = new THREE.Mesh(stackGeo, islandMat);
  stackMesh.position.set(220, -5, -165);
  stackMesh.scale.set(1.1, 1.0, 0.8);
  stackMesh.rotation.y = 0.7;
  island.add(stackMesh);

  // Satellite Islet 2: Rocher Sud (rocky islet with sand reef)
  const reefGeo = new THREE.ConeGeometry(46, 32, 12);
  reefGeo.translate(0, 12, 0);
  const reefMesh = new THREE.Mesh(reefGeo, islandMat);
  reefMesh.position.set(-210, -4, 175);
  reefMesh.scale.set(1.2, 0.85, 0.9);
  reefMesh.rotation.y = 1.4;
  island.add(reefMesh);

  // Procedural tropical palm clusters along beaches and lower green slopes
  const palmMat = new THREE.MeshStandardMaterial({ color: 0x22551d, roughness: 0.75 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4835, roughness: 0.85 });
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 6, 5);
  trunkGeo.translate(0, 3, 0);
  const frondGeo = new THREE.ConeGeometry(3.2, 1.6, 6);
  frondGeo.translate(0, 6.2, 0);

  const palmGroup = new THREE.Group();
  let palmCount = 0;
  for (let i = 0; i < pos.count; i += 7) {
    const y = heights[i];
    const ny = normals.getY(i);
    const x = pos.getX(i);
    const z = pos.getZ(i);

    if (y >= 1.5 && y <= 26 && ny >= 0.75 && palmCount < 85) {
      const p = new THREE.Group();
      p.position.set(x, y - 0.2, z);
      const s = 0.8 + (Math.sin(i * 13) * 0.5 + 0.5) * 0.6;
      p.scale.set(s, s, s);

      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.rotation.z = (Math.sin(i * 7) * 0.15);
      trunk.rotation.x = (Math.cos(i * 11) * 0.15);
      p.add(trunk);

      const fronds = new THREE.Mesh(frondGeo, palmMat);
      p.add(fronds);

      palmGroup.add(p);
      palmCount++;
    }
  }
  island.add(palmGroup);

  // Distant seabirds circling the high peak
  const birdGeo = new THREE.BufferGeometry();
  const birdPos = new Float32Array([
    -1.4, 0, -0.4,   0, 0, 0.6,   1.4, 0, -0.4
  ]);
  birdGeo.setAttribute('position', new THREE.BufferAttribute(birdPos, 3));
  const birdMat = new THREE.LineBasicMaterial({ color: 0xeef4fa, fog: true });

  const islandBirds = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Line(birdGeo, birdMat);
    const radius = 90 + Math.random() * 50;
    const altitude = 230 + Math.random() * 40;
    const speed = 0.35 + Math.random() * 0.2;
    const phase = (i / 6) * Math.PI * 2;
    island.add(b);
    islandBirds.push({ mesh: b, radius, altitude, speed, phase });
  }

  // Island world position and orientation:
  // Placed at X = -940, Z = 400 (distance ~1020m from ship).
  // Positioned directly off the port beam where pool deck passengers gaze out!
  island.position.set(-940, -1.5, 400);
  island.rotation.y = 0.52;
  scene.add(island);

  return { island, islandBirds };
}

// ---------------------------------------------------------------------------
// 3. DOLPHINS (Dauphins qui sautent)
// ---------------------------------------------------------------------------
function buildDolphinModel() {
  const dolphin = new THREE.Group();

  // 1. Fusiform streamlined body
  const bodyPoints = [
    new THREE.Vector2(0.04, 1.65),  // rostrum tip (beak)
    new THREE.Vector2(0.10, 1.48),  // rostrum base
    new THREE.Vector2(0.24, 1.30),  // melon / forehead
    new THREE.Vector2(0.38, 1.05),  // head
    new THREE.Vector2(0.46, 0.65),  // chest
    new THREE.Vector2(0.49, 0.15),  // mid-body (widest)
    new THREE.Vector2(0.44, -0.40), // rear torso
    new THREE.Vector2(0.32, -0.90), // peduncle start
    new THREE.Vector2(0.18, -1.35), // peduncle mid
    new THREE.Vector2(0.09, -1.68), // flukes mount
  ];

  const bodyGeo = new THREE.LatheGeometry(bodyPoints, 16);
  bodyGeo.rotateX(Math.PI / 2);
  bodyGeo.scale(0.72, 0.96, 1.0); // laterally compressed

  // Countershading vertex colors: oceanic slate-grey back, pearl white belly
  const pos = bodyGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const dorsalCol = new THREE.Color(0x2f465a);
  const ventralCol = new THREE.Color(0xf0f5fa);

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Belly is y < 0, back is y > 0
    let t = THREE.MathUtils.smoothstep(y, -0.15, 0.12);
    // Darker rostrum tip
    if (z > 1.45) t = Math.max(t, 0.65);
    const c = ventralCol.clone().lerp(dorsalCol, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  bodyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const cetaceanMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.28,
    metalness: 0.12,
    fog: true,
  });

  const bodyMesh = new THREE.Mesh(bodyGeo, cetaceanMat);
  dolphin.add(bodyMesh);

  // 2. Curved falcate dorsal fin
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.quadraticCurveTo(0.25, 0.44, 0.12, 0.48);
  finShape.quadraticCurveTo(-0.06, 0.38, -0.42, 0);
  finShape.closePath();

  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.05, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.02, bevelThickness: 0.02 });
  finGeo.rotateY(Math.PI / 2);
  finGeo.translate(0.025, 0, 0);

  const finMat = new THREE.MeshStandardMaterial({ color: 0x2f465a, roughness: 0.3, metalness: 0.1, fog: true });
  const dorsalFin = new THREE.Mesh(finGeo, finMat);
  dorsalFin.position.set(0, 0.42, 0.05);
  dolphin.add(dorsalFin);

  // 3. Pectoral flippers (Left & Right)
  const flipShape = new THREE.Shape();
  flipShape.moveTo(0, 0);
  flipShape.lineTo(0.55, -0.22);
  flipShape.quadraticCurveTo(0.52, -0.32, 0.38, -0.32);
  flipShape.lineTo(0, -0.12);
  flipShape.closePath();

  const flipGeo = new THREE.ExtrudeGeometry(flipShape, { depth: 0.04, bevelEnabled: false });
  flipGeo.translate(-0.1, 0, 0);

  for (const sx of [-1, 1]) {
    const flipper = new THREE.Mesh(flipGeo, finMat);
    flipper.scale.set(sx * 1.0, 1.0, 1.0);
    flipper.rotation.set(0.12, sx * 0.35, sx * -0.45);
    flipper.position.set(sx * 0.34, -0.16, 0.55);
    dolphin.add(flipper);
  }

  // 4. Articulated Tail & Flukes
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 0, -1.25);

  const flukesShape = new THREE.Shape();
  flukesShape.moveTo(0, 0.05);
  flukesShape.quadraticCurveTo(0.42, 0.18, 0.48, -0.15);
  flukesShape.quadraticCurveTo(0.24, -0.08, 0.04, -0.04);
  flukesShape.lineTo(0, 0);
  flukesShape.lineTo(-0.04, -0.04);
  flukesShape.quadraticCurveTo(-0.24, -0.08, -0.48, -0.15);
  flukesShape.quadraticCurveTo(-0.42, 0.18, 0, 0.05);

  const flukesGeo = new THREE.ExtrudeGeometry(flukesShape, { depth: 0.03, bevelEnabled: false });
  flukesGeo.rotateX(-Math.PI / 2);
  flukesGeo.translate(0, 0, -0.46);
  const flukesMesh = new THREE.Mesh(flukesGeo, finMat);
  tailGroup.add(flukesMesh);

  dolphin.add(tailGroup);
  dolphin.userData.tail = tailGroup;

  return dolphin;
}

// ---------------------------------------------------------------------------
// 4. ORCAS (Orques / Épaulards - Épaulard mâle, femelle et petit)
// ---------------------------------------------------------------------------
function buildOrcaModel(scale = 1.0, isMale = true) {
  const orca = new THREE.Group();

  // Torpedo heavy cetacean body
  const bodyPoints = [
    new THREE.Vector2(0.12, 4.4),   // blunt rounded snout
    new THREE.Vector2(0.52, 4.0),   // rounded head
    new THREE.Vector2(0.92, 3.3),   // melon / forehead
    new THREE.Vector2(1.18, 2.2),   // pectoral girdle
    new THREE.Vector2(1.34, 0.8),   // max chest girth
    new THREE.Vector2(1.26, -0.7),  // dorsal fin base
    new THREE.Vector2(1.02, -2.1),  // aft torso
    new THREE.Vector2(0.68, -3.2),  // peduncle start
    new THREE.Vector2(0.38, -3.9),  // narrow peduncle
    new THREE.Vector2(0.15, -4.35), // flukes mount
  ];

  const bodyGeo = new THREE.LatheGeometry(bodyPoints, 20);
  bodyGeo.rotateX(Math.PI / 2);
  bodyGeo.scale(0.82, 1.0, 1.0);

  // Iconic Orca coloration: obsidian black with pure white belly & eye patches
  const pos = bodyGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const blackCol = new THREE.Color(0x0c0d10);
  const whiteCol = new THREE.Color(0xffffff);
  const saddleCol = new THREE.Color(0x454b54);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    let c = blackCol.clone();

    // 1. Brilliant white underside (belly & throat)
    if (y < -0.15 && z > -2.6 && z < 4.2) {
      const edge = Math.abs(x) / (1.2 * Math.cos(Math.max(-1.5, Math.min(1.5, z * 0.3))));
      if (edge < 0.65) {
        c.copy(whiteCol);
      }
    }

    // 2. Iconic white oval eye patches (behind and above eye)
    if (z > 3.0 && z < 3.85 && y > 0.22 && y < 0.68 && Math.abs(x) > 0.52) {
      c.copy(whiteCol);
    }

    // 3. Flank white saddle patches (lateral rear)
    if (z > -2.5 && z < -1.1 && y > -0.35 && y < 0.45 && Math.abs(x) > 0.65) {
      c.copy(whiteCol);
    }

    // 4. Grey saddle patch behind dorsal fin
    if (z > -1.6 && z < -0.7 && y > 0.75 && Math.abs(x) < 0.55) {
      c.copy(saddleCol);
    }

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  bodyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const orcaMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.22,
    metalness: 0.12,
    fog: true,
  });

  const bodyMesh = new THREE.Mesh(bodyGeo, orcaMat);
  orca.add(bodyMesh);

  // Dorsal fin: male has towering 1.9m fin, female has 1.1m curved fin
  const dorsalH = isMale ? 1.95 : 1.15;
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(0, 0);
  if (isMale) {
    // Tall, iconic triangular blade of the bull orca
    dorsalShape.lineTo(0.12, dorsalH * 0.95);
    dorsalShape.quadraticCurveTo(0.04, dorsalH, -0.10, dorsalH * 0.95);
    dorsalShape.lineTo(-0.75, 0);
  } else {
    // Graceful falcate curved fin of female orca
    dorsalShape.quadraticCurveTo(0.35, dorsalH * 0.9, 0.15, dorsalH);
    dorsalShape.quadraticCurveTo(-0.15, dorsalH * 0.75, -0.65, 0);
  }
  dorsalShape.closePath();

  const dorsalGeo = new THREE.ExtrudeGeometry(dorsalShape, { depth: 0.12, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.04, bevelThickness: 0.04 });
  dorsalGeo.rotateY(Math.PI / 2);
  dorsalGeo.translate(0.06, 0, 0);

  const blackMat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.22, metalness: 0.12, fog: true });
  const dorsalMesh = new THREE.Mesh(dorsalGeo, blackMat);
  dorsalMesh.position.set(0, 1.25, -0.55);
  orca.add(dorsalMesh);

  // Pectoral flippers: large, rounded paddles
  const flipShape = new THREE.Shape();
  flipShape.moveTo(0, 0);
  flipShape.quadraticCurveTo(1.2, -0.1, 1.35, -0.75);
  flipShape.quadraticCurveTo(0.85, -1.05, 0, -0.45);
  flipShape.closePath();

  const flipGeo = new THREE.ExtrudeGeometry(flipShape, { depth: 0.08, bevelEnabled: false });
  flipGeo.translate(-0.2, 0, 0);

  for (const sx of [-1, 1]) {
    const flipper = new THREE.Mesh(flipGeo, blackMat);
    flipper.scale.set(sx * 1.0, 1.0, 1.0);
    flipper.rotation.set(0.18, sx * 0.32, sx * -0.55);
    flipper.position.set(sx * 0.88, -0.38, 1.4);
    orca.add(flipper);
  }

  // Articulated tail & large flukes
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 0, -3.2);

  const flukesShape = new THREE.Shape();
  flukesShape.moveTo(0, 0.1);
  flukesShape.quadraticCurveTo(1.05, 0.35, 1.25, -0.42);
  flukesShape.quadraticCurveTo(0.65, -0.22, 0.08, -0.10);
  flukesShape.lineTo(0, 0);
  flukesShape.lineTo(-0.08, -0.10);
  flukesShape.quadraticCurveTo(-0.65, -0.22, -1.25, -0.42);
  flukesShape.quadraticCurveTo(-1.05, 0.35, 0, 0.1);

  const flukesGeo = new THREE.ExtrudeGeometry(flukesShape, { depth: 0.08, bevelEnabled: false });
  flukesGeo.rotateX(-Math.PI / 2);
  flukesGeo.translate(0, 0, -1.15);

  const flukesMesh = new THREE.Mesh(flukesGeo, blackMat);
  tailGroup.add(flukesMesh);

  orca.add(tailGroup);
  orca.userData.tail = tailGroup;

  // Blowhole mist spray cone (activated when surfacing)
  const mistGeo = new THREE.ConeGeometry(0.65, 3.2, 8);
  mistGeo.translate(0, 1.6, 0);
  const mistMat = new THREE.MeshBasicMaterial({
    color: 0xe8f4ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: true,
  });
  const mistMesh = new THREE.Mesh(mistGeo, mistMat);
  mistMesh.position.set(0, 1.25, 2.4);
  mistMesh.rotation.x = -0.25;
  orca.add(mistMesh);
  orca.userData.mist = mistMesh;

  orca.scale.set(scale, scale, scale);
  return orca;
}

// ---------------------------------------------------------------------------
// 5. MARINE LIFE CONTROLLER & ANIMATION SYSTEM
// ---------------------------------------------------------------------------
export function createMarineFauna(scene) {
  const splashMgr = new SplashManager(scene);

  // Pod of 6 Dolphins
  const dolphins = [];
  const dolphinConfigs = [
    // 1 & 2: Synchronized pair leaping on port flank (overlooked from pool deck!)
    { x: -52, zCenter: 12, rangeZ: 24, speedZ: 5.5, period: 4.8, phase: 0.0, maxH: 3.8, scale: 1.05 },
    { x: -58, zCenter: 16, rangeZ: 24, speedZ: 5.5, period: 4.8, phase: 0.22, maxH: 4.1, scale: 1.0 },

    // 3: Acrobatic high leaper further off port beam
    { x: -74, zCenter: -10, rangeZ: 32, speedZ: 6.2, period: 5.6, phase: 1.8, maxH: 4.8, scale: 1.1, twist: true },

    // 4 & 5: Bow wave surfers riding ahead of the cruise ship
    { x: 18, zCenter: 80, rangeZ: 20, speedZ: 5.0, period: 4.2, phase: 2.7, maxH: 3.2, scale: 0.95 },
    { x: -16, zCenter: 84, rangeZ: 20, speedZ: 5.0, period: 4.2, phase: 2.95, maxH: 3.4, scale: 0.98 },

    // 6: Playful wake surfer in the mid wake
    { x: -42, zCenter: -45, rangeZ: 28, speedZ: 4.8, period: 5.0, phase: 3.9, maxH: 3.1, scale: 0.92 },
  ];

  for (const cfg of dolphinConfigs) {
    const mesh = buildDolphinModel();
    mesh.scale.set(cfg.scale, cfg.scale, cfg.scale);
    scene.add(mesh);
    dolphins.push({
      mesh,
      cfg,
      prevY: -2.0,
      jumpTimer: 0,
      splashedIn: false,
      splashedOut: false,
    });
  }

  // Pod of 3 Orcas: Titan (Bull), Luna (Female), Echo (Calf)
  const orcas = [];
  const orcaConfigs = [
    // Titan: 8.8m Bull Orca, 1.95m dorsal fin, high breaching jumps & dorsal roll
    { name: 'Titan', scale: 1.02, isMale: true, x: -108, zCenter: 24, rangeZ: 40, period: 8.2, phase: 0.5, breachH: 5.8 },

    // Luna: 7.2m Female Orca, graceful dorsal slicing rolls & surface breaches
    { name: 'Luna', scale: 0.84, isMale: false, x: -88, zCenter: 52, rangeZ: 36, period: 7.4, phase: 3.6, breachH: 4.2 },

    // Echo: 4.6m Calf Orca, closely accompanying Luna
    { name: 'Echo', scale: 0.54, isMale: false, x: -82, zCenter: 46, rangeZ: 36, period: 7.4, phase: 3.8, breachH: 2.8 },
  ];

  for (const cfg of orcaConfigs) {
    const mesh = buildOrcaModel(cfg.scale, cfg.isMale);
    scene.add(mesh);
    orcas.push({
      mesh,
      cfg,
      prevY: -3.5,
      blowTimer: 0,
      splashedIn: false,
      splashedOut: false,
    });
  }

  return { splashMgr, dolphins, orcas };
}

// Frame update for all marine life & island details
export function updateMarineLife(dt, t, fauna, islandData) {
  if (!fauna) return;
  const { splashMgr, dolphins, orcas } = fauna;

  // 1. Update Splashes & Foam
  splashMgr.update(dt);

  // 2. Update Dolphins (Porpoising & synchronized jumping)
  for (const d of dolphins) {
    const cfg = d.cfg;
    const cycleT = ((t + cfg.phase) % cfg.period) / cfg.period;

    // Jump window: 0 to 0.42 of cycle is airborne/surfacing; remainder is underwater swim
    let y = 0;
    let vy = 0;
    const jumpFrac = 0.42;

    if (cycleT < jumpFrac) {
      // Leap trajectory (smooth parabola above sea level)
      const u = cycleT / jumpFrac; // 0 to 1
      y = cfg.maxH * Math.sin(u * Math.PI) - 0.4;
      vy = Math.cos(u * Math.PI);
    } else {
      // Submerged swimming glide
      const u = (cycleT - jumpFrac) / (1 - jumpFrac);
      y = -1.6 - Math.sin(u * Math.PI) * 1.2;
      vy = -Math.cos(u * Math.PI) * 0.5;
    }

    // Dynamic forward motion along ship
    const zOffset = Math.sin((t * 0.35 + cfg.phase)) * cfg.rangeZ;
    const z = cfg.zCenter + zOffset;
    const x = cfg.x + Math.sin(t * 0.25 + cfg.phase) * 3.5;

    d.mesh.position.set(x, y, z);

    // Pitch follows velocity tangent (nose up exiting, horizontal at apex, nose down entering)
    const pitch = THREE.MathUtils.clamp(-vy * 0.48, -0.65, 0.65);
    d.mesh.rotation.x = pitch;

    // Heading slightly angled forward (+Z) with wave sway
    const yaw = Math.sin(t * 0.4 + cfg.phase) * 0.12;
    d.mesh.rotation.y = yaw;

    // Roll / banking during turn or twist
    if (cfg.twist && cycleT < jumpFrac) {
      d.mesh.rotation.z = Math.sin((cycleT / jumpFrac) * Math.PI * 2) * 0.6;
    } else {
      d.mesh.rotation.z = Math.sin(t * 0.8 + cfg.phase) * 0.15;
    }

    // Tail flex animation
    if (d.mesh.userData.tail) {
      const tailBeat = cycleT < jumpFrac
        ? Math.sin((cycleT / jumpFrac) * Math.PI) * 0.35 // arched in air
        : Math.sin(t * 6.5 + cfg.phase) * 0.45;          // swimming stroke
      d.mesh.userData.tail.rotation.x = tailBeat;
    }

    // Trigger splash on surface breach & re-entry
    if (d.prevY < 0 && y >= 0) {
      splashMgr.triggerSplash(x, z, 3.2, 1.0);
    } else if (d.prevY > 0 && y <= 0) {
      splashMgr.triggerSplash(x, z, 3.6, 1.2);
    }
    d.prevY = y;
  }

  // 3. Update Orcas (Magnificent breach, dorsal roll, blowhole spout)
  for (const o of orcas) {
    const cfg = o.cfg;
    const cycleT = ((t + cfg.phase) % cfg.period) / cfg.period;

    let y = 0;
    let vy = 0;
    const surfaceFrac = 0.45;

    if (cycleT < surfaceFrac) {
      const u = cycleT / surfaceFrac;
      // Parabolic surfacing / breaching arc
      y = cfg.breachH * Math.sin(u * Math.PI) - 1.2;
      vy = Math.cos(u * Math.PI);
    } else {
      // Cruising under the waves
      const u = (cycleT - surfaceFrac) / (1 - surfaceFrac);
      y = -3.8 - Math.sin(u * Math.PI) * 1.6;
      vy = -Math.cos(u * Math.PI) * 0.4;
    }

    const zOffset = Math.sin((t * 0.22 + cfg.phase)) * cfg.rangeZ;
    const z = cfg.zCenter + zOffset;
    const x = cfg.x + Math.sin(t * 0.18 + cfg.phase) * 4.5;

    o.mesh.position.set(x, y, z);

    // Tangent pitch
    const pitch = THREE.MathUtils.clamp(-vy * 0.42, -0.55, 0.55);
    o.mesh.rotation.x = pitch;

    // Body roll: Bull orca tilts to 35° during high breach displaying its white belly!
    if (cfg.isMale && cycleT < surfaceFrac) {
      const rollFrac = Math.sin((cycleT / surfaceFrac) * Math.PI);
      o.mesh.rotation.z = rollFrac * 0.52;
    } else {
      o.mesh.rotation.z = Math.sin(t * 0.5 + cfg.phase) * 0.12;
    }

    // Tail motion
    if (o.mesh.userData.tail) {
      const tailBeat = cycleT < surfaceFrac
        ? Math.sin((cycleT / surfaceFrac) * Math.PI) * 0.32
        : Math.sin(t * 3.8 + cfg.phase) * 0.42;
      o.mesh.userData.tail.rotation.x = tailBeat;
    }

    // Blowhole mist vapor
    if (o.mesh.userData.mist) {
      // Blow mist right when head breaks the surface
      if (cycleT > 0.08 && cycleT < 0.26 && y > 0.2) {
        const mistT = (cycleT - 0.08) / 0.18;
        o.mesh.userData.mist.material.opacity = Math.sin(mistT * Math.PI) * 0.75;
        const ms = 0.8 + mistT * 0.6;
        o.mesh.userData.mist.scale.set(ms, ms, ms);
      } else {
        o.mesh.userData.mist.material.opacity = 0;
      }
    }

    // Giant splash on breach & entry
    if (o.prevY < 0.2 && y >= 0.2) {
      splashMgr.triggerSplash(x, z, 5.5 * cfg.scale, 1.6);
    } else if (o.prevY > 0.2 && y <= 0.2) {
      splashMgr.triggerSplash(x, z, 7.2 * cfg.scale, 2.0);
    }
    o.prevY = y;
  }

  // 4. Update Distant Island Birds
  if (islandData?.islandBirds) {
    for (const b of islandData.islandBirds) {
      b.phase += dt * b.speed;
      const bx = Math.cos(b.phase) * b.radius;
      const bz = Math.sin(b.phase) * b.radius;
      const by = b.altitude + Math.sin(b.phase * 2.2) * 8;
      b.mesh.position.set(bx, by, bz);
      b.mesh.rotation.y = -b.phase + Math.PI / 2;
      b.mesh.rotation.z = Math.sin(t * 4.5 + b.phase) * 0.25;
    }
  }
}
