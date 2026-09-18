import { artsBuilder } from './cruiseArtsGeometry.js?v=20260916-garnier';
import { createArtsTextures } from './cruiseArtsTextures.js?v=20260917-opera-lux';

// The ship's theatre, inside the hull, aft of the gallery's foyer.
//
// The old room was a Garnier: 48 m across, 58 long, 20 high, three tiers and
// a fly tower. Nothing of that size goes into a 34 m hull with 6.7 m between
// the tank top and the promenade deck, which is why it used to live a
// kilometre to starboard behind a fade. This is what a liner actually
// carries: 30 m across, 22 long, one balcony, and a stage you could put a
// quartet or a conjuror on. It is reached on foot, from the foyer, and that
// is worth more than the extra two tiers.
//
// Second pass. The room was the right SIZE and the wrong BUILDING: flat
// crimson slabs, a rectangular hole where the proscenium should be, and a
// chair that was a box with a board behind it — set, on top of everything
// else, back to front, so the entire house sat with its shoulders to the
// stage. What that pass adds is the Garnier itself, and none of it costs a
// metre of the hull:
//
//   * every chair is TURNED to face downstage centre and the rows are dished,
//   * the seats are buttoned velvet on gilt frames — capitonné, painted in a
//     canvas so a 20 cm diamond survives at a metre,
//   * the walls are crimson damask in marble pilasters under a gilt cornice,
//   * the opening is arched, with the spandrel and the moulding cut as flat
//     shapes rather than approximated with a staircase of boxes,
//   * the ceiling carries a painted medallion, and the lustre hangs in it.
export function buildCruiseOpera(THREE) {
  const b = artsBuilder(THREE, 0), { m, box, item, label, light, group } = b;
  const artTex = createArtsTextures(THREE);
  const F = 1.9, C = 7.45;                  // parterre floor, ceiling
  const Z0 = -48, Z1 = -70, HW = 15;        // entrance, aft wall, half width
  const MID = (Z0 + Z1) / 2, LEN = Z0 - Z1;
  const BY = 4.5, BD = 2.8;                 // balcony floor, the arms' width
  // The fore end is DEEPER than the arms. At the arms' 2.8 m it held a rail,
  // two rows of fauteuils and nothing else: the front row's knees were inside
  // the balustrade and the cross aisle between the rows was 54 cm of capsule
  // travel, which is a gap you shuffle through rather than a passage.
  //
  // 4.4 m fixed the cross aisle and left 33 cm at the balustrade, which is
  // knee room and not a passage — and the walk along the front of a balcony,
  // over the house, is the one people actually want. This is set out for TWO
  // passages of a full metre of capsule travel: the promenade at the rail and
  // the cross aisle between the rows, with the rows and their clearances
  // between them. 1.84 + 0.70 + 1.84 + 0.70 + 0.30 = 5.38, plus the rail's own
  // house-side face. The 5.6 m of overhang falls over the three REAR rows of
  // the stalls under a 2.27 m soffit, which is where a balcony belongs.
  const BF = 5.6;                           // ...the fore end's own depth
  const PZ = -62.6, SY = 2.7;               // proscenium, stage floor
  const OW = 5.5, OT = 6.0;                 // opening half width, head
  const FOCUS = PZ - 1.2;                   // downstage centre: what a chair looks at

  // ---- Painted surfaces ---------------------------------------------------
  // Flat colour is what made the first room read as a school hall. A Garnier
  // is damask, capitonné and gilding, and all three of those are PATTERN, not
  // hue. One 256² canvas each, drawn so the tile is seamless, and the whole
  // lot costs four textures.
  const tex = (draw, repeat = 1, S = 256) => {
    const c = document.createElement('canvas'); c.width = c.height = S;
    draw(c.getContext('2d'), S);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    return t;
  };
  const surface = (map, extra = {}) =>
    new THREE.MeshStandardMaterial({ map, roughness: 0.85, ...extra });

  // Capitonné. Diamonds on a 45° lattice: a soft highlight puffs each one, the
  // seams are drawn in shadow, and a gilt button sits at every crossing. The
  // lattice repeats every S/3 in both axes, so the tile joins invisibly.
  const tuftDraw = (g, S) => {
    g.fillStyle = '#6b1020'; g.fillRect(0, 0, S, S);
    const d = S / 3, h = d / 2, n = Math.round(S / h);
    for (let p = -2; p <= n + 2; p++) for (let q = -2; q <= n + 2; q++) {
      if (!((p + q) % 2)) continue;                    // diamond centres only
      const x = p * h, y = q * h;
      const gr = g.createRadialGradient(x, y - h * 0.2, 1, x, y, h * 1.2);
      gr.addColorStop(0, 'rgba(176,54,72,0.50)');
      gr.addColorStop(0.6, 'rgba(140,30,50,0.24)');
      gr.addColorStop(1, 'rgba(96,14,30,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, h * 1.2, 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(52,6,18,0.7)'; g.lineWidth = Math.max(1.5, S / 110);
    for (let k = -4; k <= 10; k++) {
      g.beginPath(); g.moveTo(-S, -S + k * d); g.lineTo(2 * S, 2 * S + k * d); g.stroke();
      g.beginPath(); g.moveTo(-S, S + k * d); g.lineTo(2 * S, -2 * S + k * d); g.stroke();
    }
    for (let p = -2; p <= n + 2; p++) for (let q = -2; q <= n + 2; q++) {
      if ((p + q) % 2) continue;                       // crossings: the buttons
      const x = p * h, y = q * h, r = S / 64;
      g.fillStyle = 'rgba(40,4,14,0.8)';
      g.beginPath(); g.arc(x, y + r * 0.35, r * 1.25, 0, 7); g.fill();
      const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.4, 0, x, y, r);
      gr.addColorStop(0, '#f4dc9c'); gr.addColorStop(1, '#9d7526');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  };

  // Crimson silk damask: four pomegranate motifs to the tile, gold on red.
  const damaskDraw = (g, S) => {
    g.fillStyle = '#6d1122'; g.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += S / 8) {
      g.fillStyle = 'rgba(255,190,190,0.022)'; g.fillRect(x, 0, S / 16, S);
    }
    const motif = (cx, cy, s) => {
      g.save(); g.translate(cx, cy); g.scale(s, s);
      g.strokeStyle = 'rgba(198,160,88,0.55)'; g.fillStyle = 'rgba(186,146,74,0.26)';
      g.lineWidth = 2.4;
      g.beginPath(); g.ellipse(0, 0, 12, 19, 0, 0, 7); g.fill(); g.stroke();
      for (const sx of [-1, 1]) {
        g.beginPath(); g.moveTo(0, 16);
        g.quadraticCurveTo(sx * 26, 11, sx * 17, -15);
        g.quadraticCurveTo(sx * 9, -1, 0, 11);
        g.fill(); g.stroke();
      }
      g.beginPath(); g.arc(0, -25, 4.5, 0, 7); g.fill();
      g.beginPath(); g.moveTo(-9, 22); g.quadraticCurveTo(0, 30, 9, 22); g.stroke();
      g.restore();
    };
    const q = S / 4, s = S / 150;
    for (const cx of [q, 3 * q]) for (const cy of [q, 3 * q]) motif(cx, cy, s);
  };

  // Parquet: the stalls floor and the stage, laid in narrow boards.
  const woodDraw = (g, S) => {
    g.fillStyle = '#4d3118'; g.fillRect(0, 0, S, S);
    const n = 6, w = S / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = `rgba(${66 + Math.random() * 34 | 0},${42 + Math.random() * 22 | 0},20,0.5)`;
      g.fillRect(i * w, 0, w, S);
      g.strokeStyle = 'rgba(28,14,6,0.7)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(i * w, 0); g.lineTo(i * w, S); g.stroke();
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(40,22,10,${0.10 + Math.random() * 0.12})`;
        g.lineWidth = 1;
        const y = Math.random() * S;
        g.beginPath(); g.moveTo(i * w, y); g.bezierCurveTo(
          i * w + w * 0.3, y + 6, i * w + w * 0.7, y - 6, i * w + w, y + 2); g.stroke();
      }
    }
  };

  // The ceiling medallion. Not a fresco of anybody in particular — a painted
  // sky opening on the gods, which is what every one of them is: a lit centre,
  // a ring of figures suggested in rose and azure, and gilt ribbons between.
  const frescoDraw = (g, S) => {
    const R = S / 2;
    g.fillStyle = '#20406b'; g.fillRect(0, 0, S, S);
    let gr = g.createRadialGradient(R, R, R * 0.04, R, R, R);
    gr.addColorStop(0, '#fff3cd'); gr.addColorStop(0.22, '#f4d79a');
    gr.addColorStop(0.45, '#9fc0dd'); gr.addColorStop(0.78, '#456a99');
    gr.addColorStop(1, '#22406a');
    g.fillStyle = gr; g.beginPath(); g.arc(R, R, R, 0, 7); g.fill();
    // Clouds, then eight figures in the ring, then the ribbons over them.
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * 7, r = R * (0.25 + Math.random() * 0.6);
      const x = R + Math.cos(a) * r, y = R + Math.sin(a) * r, s = R * (0.05 + Math.random() * 0.13);
      const c = g.createRadialGradient(x, y, 0, x, y, s);
      c.addColorStop(0, `rgba(255,245,225,${0.16 + Math.random() * 0.2})`);
      c.addColorStop(1, 'rgba(255,240,220,0)');
      g.fillStyle = c; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
    }
    const robes = ['#d8657a', '#e6a24b', '#7fb6c9', '#b98fc4', '#e0d07a', '#cf7b58', '#8fc39a', '#dd9aa8'];
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + 0.2, r = R * 0.6;
      const x = R + Math.cos(a) * r, y = R + Math.sin(a) * r;
      g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2);
      g.fillStyle = robes[i];
      g.beginPath(); g.ellipse(0, R * 0.05, R * 0.075, R * 0.13, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,236,214,0.92)';
      g.beginPath(); g.arc(0, -R * 0.08, R * 0.037, 0, 7); g.fill();
      g.fillStyle = `${robes[i]}bb`;
      g.beginPath(); g.ellipse(R * 0.1, -R * 0.02, R * 0.09, R * 0.035, 0.6, 0, 7); g.fill();
      g.restore();
    }
    g.strokeStyle = 'rgba(214,176,96,0.85)';
    for (const [rr, lw] of [[0.94, S / 48], [0.86, S / 120], [0.36, S / 100]]) {
      g.lineWidth = lw; g.beginPath(); g.arc(R, R, R * rr, 0, 7); g.stroke();
    }
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12;
      g.save(); g.translate(R, R); g.rotate(a);
      g.fillStyle = 'rgba(226,190,110,0.8)';
      g.beginPath(); g.ellipse(R * 0.9, 0, R * 0.035, R * 0.012, 0, 0, 7); g.fill();
      g.restore();
    }
  };

  // A painted backcloth for the stage: a moonlit garden, because the room is
  // most often looked at from the stalls with nothing on.
  const clothDraw = (g, S) => {
    const sky = g.createLinearGradient(0, 0, 0, S);
    sky.addColorStop(0, '#111f3e'); sky.addColorStop(0.55, '#2a4f72');
    sky.addColorStop(0.72, '#5a7f8c'); sky.addColorStop(1, '#1d3226');
    g.fillStyle = sky; g.fillRect(0, 0, S, S);
    const mg = g.createRadialGradient(S * 0.7, S * 0.22, 2, S * 0.7, S * 0.22, S * 0.2);
    mg.addColorStop(0, 'rgba(255,248,220,0.95)'); mg.addColorStop(1, 'rgba(255,248,220,0)');
    g.fillStyle = mg; g.beginPath(); g.arc(S * 0.7, S * 0.22, S * 0.2, 0, 7); g.fill();
    g.fillStyle = 'rgba(12,22,18,0.85)';
    for (let i = 0; i < 14; i++) {
      const x = (i / 13) * S, h = S * (0.16 + Math.abs(Math.sin(i * 2.3)) * 0.14);
      g.beginPath(); g.moveTo(x - S * 0.06, S * 0.74);
      g.quadraticCurveTo(x, S * 0.74 - h, x + S * 0.06, S * 0.74); g.fill();
    }
    g.fillStyle = 'rgba(10,18,14,0.92)'; g.fillRect(0, S * 0.73, S, S * 0.27);
    for (let i = 0; i < 200; i++) {
      g.fillStyle = `rgba(255,255,240,${Math.random() * 0.7})`;
      g.fillRect(Math.random() * S, Math.random() * S * 0.5, 1.5, 1.5);
    }
  };

  const tuftTex = tex(tuftDraw), damaskTex = tex(damaskDraw);
  // A box's UVs run 0..1 over every face whatever the face measures, so ONE
  // damask material stretches a 40 cm motif to five metres on a wall and
  // squashes it to nothing on a rail. Each surface gets its own tiling: the
  // canvas is shared, only the repeat differs.
  const tiled = (t, u, v, extra) => {
    const c = t.clone(); c.needsUpdate = true; c.repeat.set(u, v);
    return surface(c, extra);
  };
  const M = {
    tuft: surface(tuftTex, { roughness: 0.92 }),
    tuftWide: tiled(tuftTex, 14, 0.9, { roughness: 0.92 }),
    damask: tiled(damaskTex, 16, 4, { roughness: 0.88 }),        // the long walls
    damaskEnd: tiled(damaskTex, 20, 4, { roughness: 0.88 }),     // fore and aft
    damaskFlank: tiled(damaskTex, 7, 4, { roughness: 0.88 }),    // proscenium
    damaskPanel: tiled(damaskTex, 2, 2.5, { roughness: 0.88 }),  // loges
    damaskRail: tiled(damaskTex, 14, 0.5, { roughness: 0.88 }),  // balcony front
    damaskWide: tiled(damaskTex, 0.45, 0.45, { roughness: 0.88 }),  // shape-cut
    parquet: surface(tex(woodDraw, 7), { roughness: 0.62 }),
    stageBoards: surface(tex(woodDraw, 5), { roughness: 0.7, color: 0x9a8f80 }),
    velvet: new THREE.MeshStandardMaterial({ color: 0x6d1122, roughness: 0.95 }),
    carpet: artTex.getCarpetMaterial(1.2, 1.2),
    carpetBorder: artTex.getBorderMaterial(1, 4),
    marble: new THREE.MeshStandardMaterial({ color: 0xe6dcc6, roughness: 0.42 }),
    frame: m.gold, gilt: m.goldLight, wood: m.wood,
  };
  // Low-poly stand-ins for the trim: a chair carries three turned parts and
  // there are three hundred chairs, so 16-sided rods were 110k triangles of
  // arm rest.
  const rod = new THREE.CylinderGeometry(1, 1, 1, 8);
  // The scallops on the pelmet are seen end on and from a metre away when you
  // stand on the stage: at eight sides they were pink zigzag bunting.
  const disc = new THREE.CylinderGeometry(1, 1, 1, 24);
  const ring = new THREE.TorusGeometry(1, 0.055, 6, 28);

  // ---- Shell --------------------------------------------------------------
  box(M.parquet, 0, F - 0.15, MID, 2 * HW, 0.3, LEN, 'floor');
  box(m.ivory, 0, C + 0.15, MID, 2 * HW, 0.3, LEN, true);
  for (const side of [-1, 1])
    box(M.damask, side * HW, (F + C) / 2, MID, 0.4, C - F, LEN, true);
  box(M.damaskEnd, 0, (F + C) / 2, Z1, 2 * HW, C - F, 0.4, true);
  // Fore wall, outboard of the foyer's own doorway surround.
  for (const sx of [-1, 1])
    box(M.damaskEnd, sx * (HW + 6) / 2, (F + C) / 2, Z0, HW - 6, C - F, 0.4, true);

  // Carpet: the cross aisle at the back, the centre aisle, and the two side
  // aisles under the balcony arms. Authentic Garnier luxury Axminster carpet
  // with woven gold braid edging and normal relief.
  const runner = (x, z, w, d) => {
    const isAlongZ = w < d;
    const uRep = Math.max(1, Math.round(w / 1.15));
    const vRep = Math.max(1, Math.round(d / 1.15));
    const cMat = artTex.getCarpetMaterial(uRep, vRep);
    box(cMat, x, F + 0.012, z, w, 0.024, d);
    if (isAlongZ) {
      for (const sx of [-1, 1]) {
        const bx = x + sx * (w / 2 - 0.06);
        box(M.carpetBorder, bx, F + 0.019, z, 0.11, 0.025, d);
        box(M.gilt, x + sx * (w / 2 - 0.008), F + 0.022, z, 0.02, 0.026, d);
      }
    } else {
      for (const sz of [-1, 1]) {
        const bz = z + sz * (d / 2 - 0.06);
        // The quarter turn is there to run the braid ALONG the strip, and
        // box() turns the geometry, not the map: give it the dimensions it
        // has before the turn, or a 28 m band becomes a 28 m spear down the
        // centre line that skewers the foyer and the gallery beyond it.
        box(M.carpetBorder, x, F + 0.019, bz, 0.11, 0.025, w, false, Math.PI / 2);
        box(M.gilt, x, F + 0.022, z + sz * (d / 2 - 0.008), w, 0.026, 0.02);
      }
    }
  };
  runner(0, Z0 - 1.8, 2 * HW - 1.6, 3.0);
  runner(0, Z0 - 8.5, 1.24, 10.6);
  for (const side of [-1, 1]) runner(side * 11.25, Z0 - 8.0, 2.4, 11.6);

  // ---- Wall treatment -----------------------------------------------------
  // Marble pilasters on a dado, damask between them, a gilt cornice over the
  // lot. The bays are set out at 2.6 m, which is what carries the eye aft.
  const cornice = (x, y, z, w, h, d) => {
    box(M.frame, x, y, z, w, h, d);
    box(M.gilt, x, y + h / 2 + 0.05, z, w + 0.12, 0.1, d + 0.12);
  };
  const pilaster = (x, z, y0, y1, w, d, ry) => {
    const h = y1 - y0;
    box(M.marble, x, (y0 + y1) / 2, z, w, h, d, false, ry);
    box(M.frame, x, y0 + 0.14, z, w + 0.14, 0.28, d + 0.1, false, ry);      // base
    box(M.frame, x, y1 - 0.2, z, w + 0.2, 0.3, d + 0.14, false, ry);        // capital
    box(M.gilt, x, y1 - 0.36, z, w + 0.1, 0.07, d + 0.08, false, ry);
  };
  const sconce = (x, y, z, ry) => {
    const s = Math.sin(ry), c = Math.cos(ry);
    const px = (o) => x + o * s, pz = (o) => z + o * c;   // o = out of the wall
    box(M.frame, x, y, z, 0.26, 0.9, 0.12, false, ry);
    for (const k of [-1, 0, 1]) {
      const ox = k * 0.22 * c, oz = -k * 0.22 * s;
      item(rod, M.frame, px(0.18) + ox, y + 0.28, pz(0.18) + oz, 0.035, 0.34, 0.035);
      item(b.sphere, m.light, px(0.18) + ox, y + 0.52, pz(0.18) + oz, 0.05, 0.09, 0.05);
    }
  };
  for (const side of [-1, 1]) {
    const xw = side * (HW - 0.22), ry = -side * Math.PI / 2;
    for (let z = Z0 - 1.3; z > PZ + 0.6; z -= 2.6) {
      pilaster(xw, z, F, C - 0.5, 0.34, 0.5, 0);
      box(M.gilt, xw - side * 0.06, F + 1.05, z - 1.3, 0.12, 0.09, 2.0);   // dado rail
      box(M.wood, xw - side * 0.02, F + 0.5, z - 1.3, 0.1, 1.0, 2.0);      // dado panel
      if (z < Z0 - 9.8 && z > PZ + 2) sconce(xw - side * 0.2, F + 2.1, z - 1.3, ry);
    }
    cornice(xw - side * 0.08, C - 0.35, MID, 0.24, 0.26, LEN - 0.4);
  }
  cornice(0, C - 0.35, Z0 - 0.3, 2 * HW - 0.6, 0.26, 0.24);

  // ---- Balcony: a horseshoe on the fore end and the two sides -------------
  const bz0 = Z0 - 0.2, bz1 = Z0 - 9.4;     // how far aft the side arms reach
  // Keep the wall-side edge at x = ±14.8 and open the flights generously
  // toward the room. The original 1.5 m stair only worked when a test placed
  // the capsule exactly on its centre line; a real approach from the side
  // aisle caught the row of newels.
  const STAIR_INNER = HW - 2.45, STAIR_OUTER = HW - 0.2;
  const STAIR_W = STAIR_OUTER - STAIR_INNER;
  const STAIR_X = (STAIR_INNER + STAIR_OUTER) / 2;
  const STAIR_RAIL_X = STAIR_INNER - 0.02;
  const soffit = (x, z, w, d) => {
    box(M.parquet, x, BY - 0.15, z, w, 0.3, d, 'floor');
    box(m.soffit, x, BY - 0.33, z, w, 0.05, d);
  };
  soffit(0, bz0 - BF / 2, 2 * HW, BF);                             // the fore end
  for (const side of [-1, 1])
    soffit(side * (HW - BD / 2), (bz0 + bz1) / 2, BD, bz0 - bz1);  // the two arms
  // Gilt coffers on the underside, so the soffit is not a blank cream board.
  // A rib may only run where there is a soffit to carry it: the full width
  // over the fore end, and nothing but the two arms aft of it — a full-width
  // rib down there hangs across the open house at 4.13 m with no board above.
  for (let z = bz0 - 0.5; z > bz1; z -= 1.15) {
    if (z >= bz0 - BF) {
      box(M.frame, 0, BY - 0.37, z, 2 * HW, 0.06, 0.09);
      for (let x = -13.8; x <= 13.8; x += 1.38) box(M.frame, x, BY - 0.37, z, 0.09, 0.06, 1.1);
    } else {
      for (const side of [-1, 1])
        box(M.frame, side * (HW - BD / 2), BY - 0.37, z, BD, 0.06, 0.09);
    }
  }

  // Balcony runners: authentic velvet runner along the promenade, cross-aisle and arms
  const balconyRunner = (x, z, w, d) => {
    const isAlongZ = w < d;
    const uRep = Math.max(1, Math.round(w / 1.15));
    const vRep = Math.max(1, Math.round(d / 1.15));
    const cMat = artTex.getCarpetMaterial(uRep, vRep);
    box(cMat, x, BY + 0.012, z, w, 0.024, d);
    if (isAlongZ) {
      for (const sx of [-1, 1]) {
        const bx = x + sx * (w / 2 - 0.06);
        box(M.carpetBorder, bx, BY + 0.019, z, 0.11, 0.025, d);
        box(M.gilt, x + sx * (w / 2 - 0.008), BY + 0.022, z, 0.02, 0.026, d);
      }
    } else {
      for (const sz of [-1, 1]) {
        const bz = z + sz * (d / 2 - 0.06);
        // Pre-turn dimensions, as in runner() above.
        box(M.carpetBorder, x, BY + 0.019, bz, 0.11, 0.025, w, false, Math.PI / 2);
        box(M.gilt, x, BY + 0.022, z + sz * (d / 2 - 0.008), w, 0.026, 0.02);
      }
    }
  };
  balconyRunner(0, bz0 - BF + 0.85, 2 * (HW - BD) - 0.8, 1.15);
  balconyRunner(0, bz0 - 1.95, 2 * (HW - BD) - 0.8, 1.05);
  for (const side of [-1, 1]) balconyRunner(side * (HW - BD / 2), (bz0 + bz1) / 2, 1.25, bz0 - bz1);

  // Its front. The structural rail is one solid box — the capsule and the
  // camera boom both need a straight edge to work against — and everything
  // else hangs on the house side of it: plinth, damask ground, gilt medallions
  // and a moulded cap. Ornament that the player can walk into is a bug.
  const rail = (x, z, w, d, faceX, faceZ) => {
    box(M.frame, x, BY + 0.42, z, w, 0.84, d, true);
    box(M.damaskRail, x + faceX * 0.13, BY + 0.44, z + faceZ * 0.13, w - 0.04, 0.6, d, false);
    box(M.wood, x - faceX * 0.14, BY + 0.42, z - faceZ * 0.14, w - 0.04, 0.64, d * 0.7, false);
    box(M.gilt, x + faceX * 0.15, BY + 0.9, z + faceZ * 0.15, w + 0.12, 0.14, d + 0.12);
    box(M.frame, x + faceX * 0.15, BY + 0.06, z + faceZ * 0.15, w + 0.08, 0.14, d + 0.1);
    const along = w > d ? 'x' : 'z', n = Math.floor((w > d ? w : d) / 1.3);
    for (let i = 0; i < n; i++) {
      const t = ((i + 0.5) / n - 0.5) * (along === 'x' ? w : d);
      const mx = along === 'x' ? x + t : x + faceX * 0.2;
      const mz = along === 'x' ? z + faceZ * 0.2 : z + t;
      item(b.sphere, M.frame, mx, BY + 0.44, mz, 0.14, 0.21, 0.14);
      item(b.sphere, M.gilt, mx, BY + 0.44, mz, 0.075, 0.115, 0.075);
    }
  };
  rail(0, bz0 - BF, 2 * (HW - BD), 0.22, 0, -1);
  // The side guards begin at the actual front edge of the void, not at the
  // fore wall. Continuing them over the solid horseshoe floor partitioned the
  // balcony and made the seats unreachable from either stair.
  const balconyFrontZ = bz0 - BF;
  for (const side of [-1, 1])
    rail(side * (HW - BD), (balconyFrontZ + bz1) / 2,
      0.22, balconyFrontZ - bz1, -side, 0);

  // Close the short back edge beside each stair with an OPEN guard. Using the
  // balcony's opaque panel here made the landing look closed from below. The
  // top bar is the collider; the slim lower bar and balusters show the guard
  // without visually sealing the stair mouth.
  const landingGuardInner = HW - BD;
  const landingGuardOuter = STAIR_INNER - 0.08;
  for (const side of [-1, 1]) {
    const gx = side * (landingGuardInner + landingGuardOuter) / 2;
    const gw = landingGuardOuter - landingGuardInner;
    box(M.gilt, gx, BY + 0.88, bz1, gw, 0.1, 0.12, true);
    box(M.frame, gx, BY + 0.43, bz1, gw, 0.07, 0.09);
    for (let i = 0; i <= 2; i++) {
      const x = landingGuardInner + gw * i / 2;
      box(M.frame, side * x, BY + 0.46, bz1, 0.07, 0.88, 0.08);
    }
  }

  // Boxes along the arms, the one piece of Garnier that survives the cut:
  // gilt columns, a draped front, and a crowned canopy over each.
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const z = bz0 - 1.4 - i * 2.1, x = side * (HW - 0.55);
    for (const dz of [-0.95, 0.95]) {
      item(rod, M.frame, x, (BY + C) / 2 + 0.2, z + dz, 0.11, C - BY - 0.5, 0.11);
      item(rod, M.gilt, x, C - 0.62, z + dz, 0.17, 0.16, 0.17);
      item(rod, M.gilt, x, BY + 0.34, z + dz, 0.17, 0.16, 0.17);
    }
    box(M.damaskPanel, side * (HW - 0.28), BY + 1.5, z, 0.14, 2.1, 1.7);
    box(M.tuft, side * (HW - 0.42), BY + 1.2, z, 0.1, 1.4, 1.5);
    // Canopy: a pelmet with a swagged velvet valance under it.
    box(M.frame, side * (HW - 0.5), C - 0.5, z, 0.9, 0.16, 2.0);
    for (let k = 0; k < 7; k++) {
      const u = k / 6;
      item(b.sphere, M.velvet, side * (HW - 0.45), C - 0.72 - Math.sin(u * Math.PI) * 0.22,
        z - 0.9 + u * 1.8, 0.16, 0.2, 0.2);
    }
    item(b.sphere, M.gilt, side * (HW - 0.5), C - 0.3, z, 0.18, 0.22, 0.18);
  }

  // ---- Two flights up to it, hard against the side walls ------------------
  // They climb FORWARD, from the back of the stalls up to the aft end of each
  // arm. Built the other way round the head of the flight landed four metres
  // aft of the balcony and you arrived nowhere.
  //
  // The head is pinned to the arm's aft edge and the flight is set out
  // BACKWARDS from it, 30 cm to the tread. At the old 34 cm going the bottom
  // step finished 17 cm from the proscenium's flank wall: there was no floor
  // at the foot to stand on and turn, so you mounted the flight by scuffing
  // sideways onto whichever tread you happened to be beside. 30 cm leaves a
  // metre of parquet across the full width of the stair — a foot landing you
  // arrive at, turn in, and climb.
  const TREAD = 0.3, RISERS = 13;
  const treadZ = i => bz1 - 0.185 - (RISERS - 1 - i) * TREAD;  // head meets the arm
  const treadY = i => F + (i + 1) * (BY - F) / RISERS;
  for (const side of [-1, 1]) {
    const x = side * STAIR_X;
    for (let i = 0; i < RISERS; i++) {
      const top = treadY(i), z = treadZ(i);
      box(M.wood, x, top - 0.12, z, STAIR_W, 0.24, 0.37, 'step');
      box(M.carpet, x, top + 0.012, z, STAIR_W - 0.34, 0.03, 0.33);
      // Polished brass stair carpet rod securing the runner on each step
      item(rod, M.gilt, x, top + 0.026, z - 0.12, 0.022, STAIR_W - 0.30, 0.022, 0, 0, Math.PI / 2);
      for (const sf of [-1, 1])
        item(b.sphere, M.frame, x + sf * (STAIR_W - 0.30) / 2, top + 0.026, z - 0.12, 0.042, 0.042, 0.042);
      // Leave the first and last tread visually open. These balusters are
      // intentionally decorative: the former solid metre-high box on EVERY
      // tread was the invisible wall that stopped a non-centred approach.
      if (i > 0 && i < RISERS - 1 && i % 2 === 0)
        item(rod, M.gilt, side * STAIR_RAIL_X, top + 0.38, z, 0.055, 0.76, 0.055);
    }
    // One continuous raked handrail, inset from both ends so neither the foot
    // nor the balcony landing reads as closed. A cylinder is visual trim only;
    // the wide stair and its treads define the playable route.
    const railI0 = 1, railI1 = RISERS - 2;
    const railY0 = treadY(railI0) + 0.78, railY1 = treadY(railI1) + 0.78;
    const railZ0 = treadZ(railI0), railZ1 = treadZ(railI1);
    const railLen = Math.hypot(railY1 - railY0, railZ1 - railZ0);
    item(rod, M.gilt, side * STAIR_RAIL_X, (railY0 + railY1) / 2,
      (railZ0 + railZ1) / 2, 0.075, railLen, 0.075,
      0, Math.atan2(railZ1 - railZ0, railY1 - railY0));
  }

  // ---- The chairs ---------------------------------------------------------
  // A fauteuil, nine instanced parts: plinth, sprung seat with a rolled front
  // edge, buttoned back, a gilt crest rail over it and two arms with turned
  // rolls. The whole thing is built about its own centre and THEN turned, so
  // a chair at the end of a row looks where the singers are instead of at the
  // side wall. Only the plinth collides — the rest would shave the aisle.
  //
  // The turn is damped to 55 %: this house is 30 m wide and 15 deep, and the
  // true bearing to downstage centre from the end of the back row is 43°,
  // which reads as a chair that has been knocked over sideways.
  // Every chair also files where a body goes on it: the middle of the
  // cushion, its top, and which way the chair was turned. That list is the
  // whole of the seating plan — the player's prompt and the audience that
  // fills the house for the kabuki both read it and neither one re-derives
  // the geometry, so a chair cannot move without its sitter moving with it.
  const seats = [];
  const chair = (x, z, y, tier = 'parterre') => {
    const a = Math.atan2(x, z - FOCUS) * 0.55;
    // Plinth top is y+0.30, the sprung cushion over it is 18 cm centred at
    // y+0.45, so the surface a body rests on is y+0.54.
    seats.push({ x, y: y + 0.54, z, yaw: a, floorY: y, tier });
    const s = Math.sin(a), c = Math.cos(a);
    const px = (ox, oz) => x + ox * c + oz * s;
    const pz = (ox, oz) => z - ox * s + oz * c;
    box(M.wood, px(0, 0), y + 0.15, pz(0, 0), 0.54, 0.3, 0.5, 'prop', a);
    box(M.tuft, px(0, 0), y + 0.45, pz(0, 0), 0.58, 0.18, 0.52, false, a);
    item(rod, M.velvet, px(0, -0.25), y + 0.45, pz(0, -0.25), 0.09, 0.58, 0.09,
      a, 0, Math.PI / 2);
    box(M.tuft, px(0, 0.21), y + 0.84, pz(0, 0.21), 0.56, 0.62, 0.12, false, a);
    item(rod, M.frame, px(0, 0.21), y + 1.16, pz(0, 0.21), 0.034, 0.6, 0.034,
      a, 0, Math.PI / 2);
    for (const ox of [-0.3, 0.3]) {
      box(M.wood, px(ox, 0.06), y + 0.6, pz(ox, 0.06), 0.07, 0.34, 0.07, false, a);
      item(rod, M.wood, px(ox, -0.04), y + 0.72, pz(ox, -0.04), 0.038, 0.44, 0.038,
        a + Math.PI / 2, 0, Math.PI / 2);
    }
  };

  // Parterre: nine dished rows of twenty-eight, a centre aisle, side aisles
  // under the arms. The dish (R = 60 m) is gentle — a 30 m row on a true
  // 15 m radius would put its ends inside the proscenium wall.
  //
  // The rows stop at x = ±9.6, not ±11.4. The stair's balustrade stands at
  // ±12.53, so the old row left 1.28 m of parquet between the last armrest
  // and it — you went up that aisle sideways, and the only way onto the
  // flight was to squeeze past the newels. Four seats a row buys a 2.6 m
  // promenade, which is what a side aisle feeding a staircase has to be.
  for (let r = 0; r < 9; r++) {
    const zr = Z0 - 3.4 - r * 1.0;
    for (let i = -17; i <= 17; i++) {
      if (i === 0) continue;
      const x = i * 0.66 + (i > 0 ? 0.33 : -0.33);
      if (Math.abs(x) > 9.6) continue;
      chair(x, zr - x * x / 120, F);
    }
  }
  // Balcony: two rows across the fore end. Set out from the PASSAGES rather
  // than from the balcony's front edge — a metre of capsule travel along the
  // balustrade, a metre between the rows, 0.30 m behind the back row. The
  // outer chairs are omitted at each end so the two arm promenades open
  // straight into both of them.
  for (const zr of [bz0 - 3.15, bz0 - 0.65]) {
    for (let i = -16; i <= 16; i++) {
      if (i === 0) continue;
      const x = i * 0.66 + (i > 0 ? 0.33 : -0.33);
      if (Math.abs(x) > 10.0) continue;
      chair(x, zr, BY, 'balcony');
    }
  }

  // ---- Proscenium, arch, curtain and stage --------------------------------
  // AZ is the arch's own plane: the house face of the proscenium wall (which
  // is 0.5 thick about PZ) plus enough to keep the plates out of it.
  const AH = 1.75, AY = OT - AH, AZ = PZ + 0.33;
  box(M.stageBoards, 0, SY - 0.15, (PZ + Z1) / 2, 22, 0.3, PZ - Z1, 'floor');
  for (const sx of [-1, 1]) {
    box(M.damaskFlank, sx * (HW + OW) / 2, (F + C) / 2, PZ, HW - OW, C - F, 0.5, true);
    // The jambs: a fluted marble column on a gilt base, under a gilt capital.
    box(M.frame, sx * (OW + 0.2), (F + OT) / 2, AZ - 0.06, 0.4, OT - F, 0.4);
    item(rod, M.marble, sx * (OW + 0.62), (F + OT) / 2 - 0.1, AZ + 0.06,
      0.26, OT - F - 0.5, 0.26);
    item(rod, M.gilt, sx * (OW + 0.62), F + 0.16, AZ + 0.06, 0.34, 0.32, 0.34);
    item(rod, M.gilt, sx * (OW + 0.62), OT - 0.62, AZ + 0.06, 0.34, 0.3, 0.34);
    pilaster(sx * (OW + 1.9), PZ + 0.32, F, C - 0.5, 0.5, 0.36, 0);
    // Inside the opening: at x = 8 they climbed straight into the proscenium
    // wall, which runs from 5.5 out to the ship's side.
    for (let i = 0; i < 4; i++)
      box(M.wood, sx * 3.8, SY - 0.1 - i * 0.2, PZ + 0.5 + i * 0.42, 2.2, 0.2, 0.46, 'step');
  }
  box(m.gold, 0, OT + 0.2, AZ - 0.06, 2 * OW + 0.8, 0.4, 0.4);
  box(M.damaskFlank, 0, (OT + C) / 2 + 0.2, PZ, 2 * OW + 0.8, C - OT - 0.4, 0.5, true);

  // The arch. A rectangular hole in a red wall is a garage door; the structure
  // above OT is already solid, so the curve is cut as two flat plates hung on
  // the house side of the opening — a spandrel that takes its corners off, and
  // the moulding that rings it. Boxes could only have staircased it.
  const arc = (kx, ky, t0, t1, n) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = t0 + (t1 - t0) * i / n;
      out.push(new THREE.Vector2(Math.cos(t) * (OW + kx), AY + Math.sin(t) * (AH + ky)));
    }
    return out;
  };
  const plate = (pts, mat, z, renderOrder = 0) => {
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), mat);
    mesh.position.z = z; mesh.renderOrder = renderOrder; group.add(mesh); return mesh;
  };
  plate([new THREE.Vector2(-OW, OT + 0.04), new THREE.Vector2(OW, OT + 0.04),
    ...arc(0, 0, 0, Math.PI, 40)], M.damaskWide, AZ);
  plate([...arc(0.34, 0.34, -0.2, Math.PI + 0.2, 42),
    ...arc(-0.2, -0.2, Math.PI + 0.2, -0.2, 42)], m.gold, AZ + 0.1);
  // Keystone and the two masks that sit on the haunches.
  box(M.frame, 0, OT + 0.28, AZ + 0.04, 0.7, 0.8, 0.34);
  item(b.sphere, M.gilt, 0, OT + 0.3, AZ + 0.16, 0.24, 0.3, 0.2);
  for (const sx of [-1, 1]) {
    item(b.sphere, M.gilt, sx * 3.9, OT - 0.62, AZ + 0.16, 0.2, 0.26, 0.17);
    item(rod, M.gilt, sx * 3.9, OT - 0.3, AZ + 0.16, 0.09, 0.4, 0.09, 0, 0, sx * 0.5);
  }

  // The curtain, drawn back: two gathered legs on tie-backs, and a swagged
  // valance across the head. Lobes, not slabs — a flat box reads as a wall.
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const x = sx * (OW - 0.28 - k * 0.3), w = 0.24 - k * 0.028;
      item(rod, M.velvet, x, (SY + OT) / 2 - 0.1 - k * 0.06, PZ - 0.6 - k * 0.1,
        w, OT - SY - 0.2 - k * 0.12, w * 0.8);
    }
    item(rod, M.gilt, sx * (OW - 0.9), SY + 1.5, PZ - 0.7, 0.42, 0.16, 0.34,
      0, 0, Math.PI / 2);
    item(b.sphere, M.gilt, sx * (OW - 1.25), SY + 1.28, PZ - 0.7, 0.1, 0.18, 0.1);
    box(M.frame, sx * (OW - 0.75), SY + 0.06, PZ - 0.62, 1.7, 0.12, 0.4);
  }
  // The pelmet: a buttoned velvet band with a scalloped edge under it. Hung
  // as a row of spheres this read, from the stage a metre and a half away, as
  // a string of pink balloons — the scallops are discs seen face on instead.
  box(M.tuftWide, 0, OT - 0.26, PZ - 0.68, 2 * OW - 0.2, 0.58, 0.34);
  const SN = 44, SW = (2 * OW - 0.2) / SN;
  for (let i = 0; i <= SN; i++) {
    const x = -OW + 0.1 + i * SW, u = i / SN;
    const deep = 0.06 + 0.15 * Math.sin(u * Math.PI * 4) ** 2;
    item(disc, M.velvet, x, OT - 0.46 - deep, PZ - 0.68, 0.2, 0.3, 0.2, 0, Math.PI / 2);
    item(b.sphere, M.gilt, x, OT - 0.66 - deep, PZ - 0.7, 0.035, 0.06, 0.035);
  }
  for (let k = 0; k <= 4; k++) {                       // tassels at the swag joins
    const x = -OW + 0.1 + k * (2 * OW - 0.2) / 4;
    item(b.sphere, M.gilt, x, OT - 0.66, PZ - 0.74, 0.1, 0.2, 0.1);
    item(rod, M.gilt, x, OT - 0.95, PZ - 0.74, 0.07, 0.36, 0.07);
  }
  box(M.frame, 0, OT + 0.02, PZ - 0.68, 2 * OW - 0.2, 0.16, 0.42);

  // Stage: the backcloth, wings, and the footlights in their gilt trough.
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(19, OT - SY + 0.4),
    new THREE.MeshStandardMaterial({ map: tex(clothDraw, 1, 512), roughness: 1 }));
  cloth.position.set(0, (SY + OT) / 2 + 0.2, Z1 + 0.22);
  group.add(cloth);
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++)
    box(m.black, sx * (7.2 - k * 0.5), (SY + OT) / 2, PZ - 2.4 - k * 2.0, 2.6, OT - SY, 0.18);
  box(M.frame, 0, SY + 0.1, PZ - 1.35, 2 * OW - 0.6, 0.2, 0.34);
  // Their own material, not the house's: when the kabuki starts the lustre
  // goes out and the float has to come UP, and one shared emissive cannot do
  // both at once.
  const footlightMat = new THREE.MeshStandardMaterial({
    color: 0xffebbc, emissive: 0xffcf85, emissiveIntensity: 1.5, roughness: 0.7,
  });
  for (let i = 0; i < 11; i++)
    item(b.sphere, footlightMat, -4.7 + i * 0.94, SY + 0.18, PZ - 1.35, 0.11, 0.1, 0.09);

  // ---- Ceiling and the lustre ---------------------------------------------
  const CZ = Z0 - 7.4;
  // Gilt ribs, then the painted medallion the lustre hangs out of.
  // Ribs in two runs, fore and aft of the medallion: laid straight across they
  // hung BELOW the painting and cut it into slices.
  for (const [za, zb] of [[Z0 - 0.4, CZ + 3.4], [CZ - 3.4, PZ]])
    for (let x = -12; x <= 12; x += 4)
      box(M.gilt, x, C - 0.03, (za + zb) / 2, 0.1, 0.055, za - zb);
  for (let z = Z0 - 1.5; z > PZ; z -= 2.6) {
    if (Math.abs(z - CZ) < 3.4) continue;
    box(M.gilt, 0, C - 0.03, z, 2 * HW - 0.5, 0.055, 0.1);
  }
  const fresco = new THREE.Mesh(new THREE.CircleGeometry(2.75, 48),
    new THREE.MeshStandardMaterial({
      map: tex(frescoDraw, 1, 512), roughness: 0.95,
      emissive: 0xffffff, emissiveIntensity: 0.22,
    }));
  fresco.material.emissiveMap = fresco.material.map;
  fresco.position.set(0, C - 0.02, CZ); fresco.rotation.x = Math.PI / 2;
  group.add(fresco);
  item(ring, M.frame, 0, C - 0.06, CZ, 2.86, 2.86, 2.86, 0, Math.PI / 2);
  item(ring, M.gilt, 0, C - 0.1, CZ, 1.5, 1.5, 1.5, 0, Math.PI / 2);

  // A lustre in a 5.5 m room is a ceiling rose with drops, not a Garnier
  // wedding cake: it hangs 1.25 m and the audience still walks under it.
  item(rod, M.frame, 0, C - 0.35, CZ, 0.12, 0.7, 0.12);
  item(b.sphere, M.gilt, 0, C - 0.72, CZ, 0.3, 0.34, 0.3);
  for (let tier = 0; tier < 3; tier++) {
    const r = 1.5 - tier * 0.42, y = C - 0.82 - tier * 0.38, n = 16 - tier * 4;
    item(ring, M.frame, 0, y, CZ, r, r, r, 0, Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const a = i * 2 * Math.PI / n, cx = Math.cos(a) * r, cz = CZ + Math.sin(a) * r;
      item(rod, M.gilt, cx, y + 0.14, cz, 0.035, 0.2, 0.035);
      item(b.sphere, m.light, cx, y + 0.3, cz, 0.09, 0.17, 0.09);
      item(b.sphere, M.gilt, cx, y - 0.16, cz, 0.05, 0.14, 0.05);   // crystal drop
    }
  }
  item(b.sphere, m.light, 0, C - 1.9, CZ, 0.22, 0.3, 0.22);

  // ---- Light --------------------------------------------------------------
  // Dimmer than the first pass by a third. At 260 the lustre bleached every
  // gilt surface in the room to white and the carpet to salmon — a Garnier is
  // a DARK room with bright metal in it, not an evenly lit one.
  light(0, C - 1.2, CZ, 160, 26);
  light(0, C - 0.9, Z0 - 15, 100, 22);
  light(0, OT - 0.6, PZ - 2.6, 95, 16, 0xfff0d6);
  for (const side of [-1, 1]) light(side * (HW - 3.4), BY - 0.9, (bz0 + bz1) / 2, 42, 11);

  label('GRAND OPÉRA · LE THÉÂTRE DU BORD', 0, BY + 1.6, Z0 - 0.24, 6, 0.6, Math.PI, true);
  label('← GALERIE DES NYMPHÉAS', 0, F + 2.6, Z0 - 0.24, 4.6, 0.5, Math.PI, true);

  // What the kabuki needs to take the room over: the seating plan, the four
  // house lamps, and every surface that carries its own emissive — a Garnier
  // is lit as much by gilt and painted sky as by its lustre, and blacking
  // out the lamps alone left the ceiling glowing over a dark house.
  const built = b.finish();
  return {
    ...built,
    seats,
    houseLights: built.lights.slice(),
    houseGlow: [m.light, m.soffit, fresco.material],
    footlightMat,
    // The stage, in world coordinates, for whatever is performing on it.
    stage: {
      y: SY, front: PZ, back: Z1, halfWidth: OW, top: OT,
      centre: FOCUS, clothZ: Z1 + 0.22, archZ: AZ, floorY: F, houseZ0: Z0,
    },
  };
}
