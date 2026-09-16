import { artsBuilder } from './cruiseArtsGeometry.js?v=20260916-garnier';

// The Monet gallery, built INSIDE the hull.
//
// Aft of the atrium and under the casino the ship is a solid block from the
// tank top to the promenade deck: 34 m across, 6.7 m deep, and sixty-odd
// metres of it. The gallery and the opera are cut out of that block, which is
// the whole point of this rewrite — they used to be a second copy of the map
// a kilometre to starboard, reached through a fade, because a 24 x 46 x 7.3 m
// hall is a museum that happens to float. At a liner's scale it fits, and a
// room you can walk into needs no crossing.
//
// The room runs from z = -7.3 (where the atrium's flight comes down) aft to
// z = -44, 20 m across and 5.55 m under the beams. main-CRUISE.js hangs the
// flight from the atrium inside it; this module is the shell, the pictures
// and the light.
export function buildMonetGallery(THREE, works) {
  const b = artsBuilder(THREE, 0), { m, box, item, label, light, group } = b;
  const F = 1.9, C = 7.45;                 // floor top, ceiling underside
  const Z0 = -7.3, Z1 = -44, HW = 10;      // entrance end, far end, half width
  const WELL = [2.8, 7.2], WZ = -12.0;     // the stair well's mouth in the ceiling
  const MID = (Z0 + Z1) / 2, LEN = Z0 - Z1;

  box(m.stone, 0, F - 0.15, MID, 2 * HW, 0.3, LEN, 'floor');
  // Ceiling, cut around the well: the flight from the atrium passes through it.
  box(m.ivory, 0, C + 0.15, (WZ + Z1) / 2, 2 * HW, 0.3, WZ - Z1, true);
  box(m.ivory, (WELL[0] - HW) / 2, C + 0.15, (Z0 + WZ) / 2,
    WELL[0] + HW, 0.3, Z0 - WZ, true);
  box(m.ivory, (WELL[1] + HW) / 2, C + 0.15, (Z0 + WZ) / 2,
    HW - WELL[1], 0.3, Z0 - WZ, true);

  for (const side of [-1, 1]) {
    box(m.ivory, side * HW, (F + C) / 2, MID, 0.4, C - F, LEN, true);
    box(m.stone, side * (HW - 0.29), F + 0.22, MID, 0.12, 0.44, LEN);
    box(m.goldLight, side * (HW - 0.29), C - 0.38, MID, 0.12, 0.1, LEN);
  }
  // Far end, with the doorway through to the foyer.
  for (const sx of [-1, 1])
    box(m.ivory, sx * (HW + 3) / 2, (F + C) / 2, Z1, HW - 3, C - F, 0.4, true);
  box(m.ivory, 0, (F + 3.2 + C) / 2, Z1, 6, C - F - 3.2, 0.4, true);
  // Entrance end. The flight does not come through it — it comes down THROUGH
  // the ceiling, out of the atrium, inside the room. That is the whole point:
  // from the third tread the hall is already in front of you.
  box(m.wood, 0, (F + C) / 2, Z0, 2 * HW, C - F, 0.4, true);

  label('CLAUDE MONET\nLes Nymphéas · variations sur un jardin d’eau',
    0, F + 2.9, Z0 - 0.22, 7, 1.1, Math.PI);
  label('OPÉRA · SALLE DE SPECTACLE →', 0, F + 3.55, Z1 + 0.24, 5.4, 0.62);

  const loading = [];
  works.forEach((w, i) => {
    const side = i < 4 ? -1 : 1, z = -22 - (i % 4) * 6;
    const ratio = w.width / w.height;
    let height = 2.9, width = height * ratio;
    if (width > 6.4) { width = 6.4; height = width / ratio; }
    const ry = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    box(m.wood, side * (HW - 0.32), F + 2.05, z, 0.18, height + 0.22, width + 0.22);
    box(m.goldLight, side * (HW - 0.44), F + 2.05, z, 0.10, height + 0.12, width + 0.12);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const art = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    art.position.set(side * (HW - 0.51), F + 2.05, z); art.rotation.y = ry;
    group.add(art);
    loading.push(new Promise(resolve => new THREE.TextureLoader().load(
      `./textures/cruise-monet/${w.file}`, tex => {
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
        mat.map = tex; mat.needsUpdate = true; resolve(w.file);
      }, undefined, () => { console.error('[cruise arts] missing painting', w.file); resolve(null); })));
    label(`Claude Monet · ${w.title}\n${w.date} · ${w.museum}`,
      side * (HW - 0.54), F + 0.52, z, Math.min(width, 4.6), 0.4, ry);
    box(m.light, side * (HW - 1.05), C - 0.45, z, 0.16, 0.07, Math.max(width, 2.4));
  });

  // A bench to each bay, off the centreline so the aisle stays clear.
  for (const z of [-25, -31, -37]) {
    box(m.wood, 0, F + 0.27, z, 0.8, 0.3, 2.1, 'prop');
    box(m.wood, 0, F + 0.44, z, 1.04, 0.06, 2.4);
    box(m.stone, 0, F + 0.51, z, 0.98, 0.11, 2.34, 'prop');
    box(m.light, 0, C - 0.32, z, 5, 0.06, 5);
    light(0, C - 1.2, z, 55, 15, 0xfff3da);
  }

  // The foyer, four metres of it. It used to be fourteen, with colonnades;
  // every metre of that was a metre the auditorium did not have.
  const FZ0 = -44, FZ1 = -48, FHW = 6;
  box(m.ivory, 0, F - 0.15, (FZ0 + FZ1) / 2, 2 * FHW, 0.3, FZ0 - FZ1, 'floor');
  box(m.ivory, 0, C + 0.15, (FZ0 + FZ1) / 2, 2 * FHW, 0.3, FZ0 - FZ1, true);
  for (const side of [-1, 1]) {
    box(m.red, side * FHW, (F + C) / 2, (FZ0 + FZ1) / 2, 0.35, C - F, FZ0 - FZ1, true);
    box(m.gold, side * (FHW - 0.2), C - 0.5, (FZ0 + FZ1) / 2, 0.22, 0.22, FZ0 - FZ1);
    for (const z of [FZ0 - 1, FZ1 + 1]) {
      item(b.cylinder, m.ivory, side * (FHW - 0.55), (F + C) / 2, z, 0.26, (C - F) / 2, 0.26);
      for (const y of [F + 0.15, C - 0.2]) box(m.gold, side * (FHW - 0.55), y, z, 0.74, 0.24, 0.74);
    }
  }
  box(m.red, 0, F + 0.012, (FZ0 + FZ1) / 2, 3.6, 0.02, FZ0 - FZ1);
  // Its own end wall, with the opera's doors standing open in it.
  for (const sx of [-1, 1])
    box(m.ivory, sx * (FHW + 2.6) / 2, (F + C) / 2, FZ1, FHW - 2.6, C - F, 0.35, true);
  box(m.ivory, 0, (F + 3.4 + C) / 2, FZ1, 5.2, C - F - 3.4, 0.35, true);
  for (const sx of [-1, 1]) {
    box(m.wood, sx * 2.3, F + 1.7, FZ1 - 0.75, 0.16, 3.4, 1.6, true);
    box(m.gold, sx * 2.22, F + 1.7, FZ1 - 0.75, 0.07, 3.1, 1.35);
  }
  label('LE GRAND OPÉRA\nArchitecture inspirée du Palais Garnier',
    0, F + 3.9, FZ1 + 0.2, 5, 0.75, 0, true);
  label('← NYMPHÉAS', 0, F + 3.9, FZ0 - 0.2, 4, 0.55, Math.PI);
  light(0, C - 1.1, (FZ0 + FZ1) / 2, 90, 14);
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5;
    item(b.sphere, m.light, Math.cos(a) * 1.1, C - 0.85, (FZ0 + FZ1) / 2 + Math.sin(a) * 1.1,
      0.11, 0.22, 0.11);
  }
  return { ...b.finish(), ready: Promise.all(loading) };
}
