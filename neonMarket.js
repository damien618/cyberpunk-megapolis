// Walk-in grocery on the long parking-side facade of Combined_Building_11.
// Coordinates are world metres; the street-facing doorway looks toward +Z.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { loadGuestRig } from './crowd.js?v=20260923-market';
import { fillMarketStock } from './marketStock.js?v=20260923-market';

export async function buildNeonMarket({ scene, world, bw, MAXANISO = 8 }) {
  // Authored in a compact local plan; translate it onto the broad shopfront.
  const DX = 15.4, DZ = -4.5;
  const group = new THREE.Group();
  group.name = 'Konbini Hikari — walk-in market';
  scene.add(group);
  const collisionMeshes = [];
  const batches = new Map();
  const mat = (color, metalness = 0.1, roughness = 0.55, emissive = 0x000000,
    emissiveIntensity = 0) => new THREE.MeshStandardMaterial({
    color, metalness, roughness, emissive, emissiveIntensity,
  });
  const charcoal = mat(0x151b29, 0.55, 0.38);
  const wall = mat(0x242835, 0.12, 0.74);
  const tile = mat(0x343849, 0.25, 0.48);
  const steel = mat(0x788a9e, 0.78, 0.25);
  const shelfMat = mat(0x282f3e, 0.68, 0.35);
  const cyan = mat(0x5af5f9, 0.3, 0.24, 0x08badb, 2.4);
  const pink = mat(0xff6cc9, 0.25, 0.3, 0xe71d89, 2.0);
  const amber = mat(0xffd476, 0.18, 0.4, 0xe78a13, 1.6);
  // no `transmission`: it re-renders the whole city behind the glass (2x draws)
  const glass = new THREE.MeshStandardMaterial({
    // one face per pane (FrontSide on a closed box) and a faint tint: the
    // double-sided 0.33 version stacked four layers and washed the street
    // into a flat blue-grey silhouette
    color: 0xa9cbd6, metalness: 0, roughness: 0.05, envMapIntensity: 0.35,
    transparent: true, opacity: 0.1, depthWrite: false,
  });

  function box(x0, x1, y0, y1, z0, z1, material, { collide = false, ground = false } = {}) {
    x0 += DX; x1 += DX; z0 += DZ; z1 += DZ;
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (ground || material === glass) {
      const mesh = new THREE.Mesh(g, material);
      (ground ? world : group).add(mesh);
    } else {
      const list = batches.get(material) || batches.set(material, []).get(material);
      list.push(g);
    }
    if (collide) {
      bw.add({ x0, x1, y0, y1, z0, z1, collide: true, prop: true,
        groundOnly: false, camBlock: true, tall: y1 - y0 > 9 });
    }
  }

  // Floor overlaps the original street by 4 cm: no step or unsupported seam.
  box(-47.35, -34.35, -0.13, 0.035, -40.15, -27.73, tile, { ground: true });
  // Closed walls and ceiling restore the hollowed ground floor below the
  // original building's upper storeys. Only the centre 2.8 m is open to street.
  box(-47.47, -47.23, 0.02, 3.82, -40.27, -27.82, wall, { collide: true });
  box(-34.47, -34.23, 0.02, 3.82, -40.27, -27.82, wall, { collide: true });
  box(-47.47, -34.23, 0.02, 3.82, -40.30, -40.08, wall, { collide: true });
  box(-47.48, -34.22, 3.72, 3.87, -40.3, -27.77, charcoal);
  // Glass storefront, with an opening x=[-42.50,-39.70].
  for (const [x0, x1] of [[-47.4, -42.5], [-39.7, -34.3]]) {
    box(x0, x1, 0.02, 0.46, -27.86, -27.65, charcoal, { collide: true });
    box(x0, x1, 0.46, 2.75, -27.78, -27.73, glass, { collide: true });
    box(x0, x1, 2.73, 3.70, -27.86, -27.65, charcoal, { collide: true });
    box(x0, x1, 0.45, 0.51, -27.65, -27.59, cyan);
  }
  box(-47.4, -34.3, 3.26, 3.72, -27.67, -27.48, charcoal);
  box(-42.55, -42.45, 0.02, 2.78, -27.70, -27.48, steel);
  box(-39.75, -39.65, 0.02, 2.78, -27.70, -27.48, steel);
  box(-42.5, -39.7, 2.73, 2.80, -27.70, -27.48, cyan);
  box(-47.45, -34.2, 3.57, 3.63, -27.42, -27.34, pink);
  // Doorway threshold and pink/cyan floor wayfinding.
  box(-42.49, -39.71, 0.035, 0.048, -27.80, -27.46, steel);
  for (const x of [-42.34, -39.88])
    box(x, x + 0.055, 0.038, 0.044, -38.7, -27.83, cyan);

  function label(text, w, h, x, y, z, color = '#79faff', size = 47) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const c = canvas.getContext('2d');
    c.fillStyle = '#09111d'; c.fillRect(0, 0, 1024, 256);
    c.strokeStyle = color; c.lineWidth = 9; c.strokeRect(7, 7, 1010, 242);
    c.shadowColor = color; c.shadowBlur = 26;
    c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `700 ${size}px "Hiragino Sans", "Yu Gothic", sans-serif`;
    c.fillText(text, 512, 128, 940);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = MAXANISO;
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true,
      side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.position.set(x + DX, y, z + DZ);
    group.add(mesh);
  }
  label('光 KONBINI · ALIMENTATION', 9.6, 0.41, -40.9, 3.48, -27.32, '#ff72cb', 64);
  label('いらっしゃいませ · BIENVENUE', 6.1, 0.42, -40.9, 3.28, -40.03, '#79faff', 51);
  label('ENTRÉE  /  入口', 2.75, 0.4, -41.1, 2.99, -27.39, '#79faff', 61);

  // An open fruit island, a bed of fresh fish and stocked grocery shelves.
  // The 2.5 m central approach and the aisles remain clear for the camera.
  const rows = [
    { x: -44.98, sections: [
      { name: '青果 · FRUITS ET LÉGUMES', z0: -34.1, z1: -30.6 },
      { name: '鮮魚 · POISSON FRAIS', z0: -38.25, z1: -34.6 }] },
    { x: -41.15, sections: [
      { name: '飲料 · BOISSONS', z0: -34.1, z1: -30.6 },
      { name: 'お茶 · CAFÉ · CONSERVES', z0: -38.25, z1: -34.6 }] },
    { x: -37.45, sections: [
      { name: 'ラーメン · SNACKS', z0: -38.25, z1: -32.5 }] },
  ];
  for (const row of rows) for (const section of row.sections) {
    const { x } = row, { z0, z1 } = section;
    bw.add({ x0: x - 0.59 + DX, x1: x + 0.59 + DX, y0: 0.04,
      y1: x === -44.98 ? 1.25 : 2.09,
      z0: z0 + DZ, z1: z1 + DZ, collide: true, prop: true,
      groundOnly: false, camBlock: true });
    label(section.name, x === -44.98 ? 2.15 : 1.88, 0.30,
      x, x === -44.98 ? 2.45 : 2.31, z1 + 0.015,
      x === -37.45 ? '#ffba9a' : '#b6f8ef', 59);
  }
  fillMarketStock({ group, box, label, DX, DZ, MAXANISO });

  // The rear case and refrigerator remain solid without colliding with the
  // aisle. The front island has no tall wall hiding its produce from the door.
  bw.add({ x0: -46.51 + DX, x1: -43.89 + DX, y0: .05, y1: 1.5,
    z0: -39.53 + DZ, z1: -38.74 + DZ, collide: true, prop: true,
    camBlock: true });
  bw.add({ x0: -39.77 + DX, x1: -37.98 + DX, y0: .05, y1: 2.30,
    z0: -39.91 + DZ, z1: -39.08 + DZ, collide: true, prop: true,
    camBlock: true });

  // Compact checkout to the right of the doorway, off the central route.
  const walnut = mat(0x69503b, 0.04, 0.77);
  box(-37.35, -34.95, 0.04, 1.0, -30.17, -29.37, walnut, { collide: true });
  box(-37.4, -34.9, 1.0, 1.09, -30.23, -29.32, steel);
  box(-36.65, -35.9, 1.10, 1.14, -29.88, -29.47, charcoal);
  box(-36.62, -35.93, 1.14, 1.19, -29.86, -29.49, cyan);
  // Register, card terminal, receipt printer and a small customer basket.
  box(-37.12, -36.72, 1.10, 1.36, -29.94, -29.57, charcoal);
  box(-37.09, -36.75, 1.18, 1.32, -29.56, -29.54, cyan);
  box(-35.56, -35.36, 1.10, 1.21, -29.91, -29.64, charcoal);
  box(-35.54, -35.38, 1.21, 1.23, -29.89, -29.66, pink);
  box(-35.08, -34.88, 1.1, 1.27, -30.13, -29.69, charcoal);
  box(-35.07, -34.89, 1.27, 1.30, -30.13, -29.69, steel);
  label('レジ · CAISSE', 2.23, 0.39, -36.15, 2.83, -27.69, '#ff77c8', 65);

  // Photoscanned Mixamo character already bundled with the game. Retargeted
  // idle keeps his arms down and gives the shopkeeper a natural living pose.
  const vendor = new THREE.Group();
  vendor.name = 'Vendeur japonais · Hikari Konbini';
  vendor.position.set(-36.13 + DX, 0.07, -30.92 + DZ);
  group.add(vendor);
  let vendorMixer = null;
  try {
    const guest = await loadGuestRig({
      model: './glb/visitors/ballroom/Leonard.glb',
      walk: './glb/visitors/ballroom/mixamo-clips.glb',
      idle: './glb/visitors/ballroom/mixamo-clips.glb',
      walkClipName: 'idle', idleClipName: 'idle',
      height: 1.77, recolor: 'keep', retarget: true, lit: true,
    });
    guest.scene.scale.setScalar(1.77 / guest.measured);
    vendor.add(guest.scene);
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(.18, .075),
      new THREE.MeshBasicMaterial({ color: 0xe9debb, side: THREE.DoubleSide }));
    badge.position.set(.11, 1.27, .191);
    vendor.add(badge);
    vendorMixer = new THREE.AnimationMixer(guest.scene);
    const idle = vendorMixer.clipAction(guest.idleClip);
    idle.timeScale = .72;
    idle.play();
  } catch (error) {
    console.warn('[market] shopkeeper model could not load', error);
  }
  bw.add({ x0: -36.57 + DX, x1: -35.69 + DX, y0: 0.06, y1: 2.24,
    z0: -31.23 + DZ, z1: -30.65 + DZ,
    collide: true, prop: true, camBlock: true });

  // Warm, neutral task light makes faces, food and print legible against the
  // cool street. Retain neon only as an accent.
  const lights = [];
  for (const [x, z, color, intensity] of [
    [-44.9, -31.0, 0xffefcf, 12], [-40.6, -35.5, 0xffe5c9, 12],
    [-36.5, -38.2, 0xffe8cf, 11], [-36.1, -29.6, 0xffecda, 11],
    [-41.1, -27.7, 0xff65c8, 1.2],
  ]) {
    const light = new THREE.PointLight(color, intensity, 7.5, 2);
    light.position.set(x + DX, 3.05, z + DZ);
    group.add(light);
    lights.push(light);
    box(x - 0.9, x + 0.9, 3.51, 3.57, z - 0.08, z + 0.08,
      color === 0xff65c8 ? pink : shelfMat);
    box(x - 0.82, x + 0.82, 3.48, 3.51, z - 0.068, z + 0.068,
      color === 0xff65c8 ? pink : mat(0xffedce, 0.05, 0.28,
        0xffefd4, .45));
  }

  for (const [material, geos] of batches) {
    const merged = geos.length === 1 ? geos[0] : BufferGeometryUtils.mergeGeometries(geos, false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, material);
      group.add(mesh);
    }
  }
  return { group, lights, collisionMeshes: [], update: dt => vendorMixer?.update(dt) };
}
