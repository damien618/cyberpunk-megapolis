import { artsBuilder } from './cruiseArtsGeometry.js?v=20260916-garnier';
import { createArtsTextures } from './cruiseArtsTextures.js?v=20260917-opera-lux';

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
  const artTex = createArtsTextures(THREE);
  const F = 1.9, C = 7.45;                 // floor top, ceiling underside
  const Z0 = -7.3, Z1 = -44, HW = 10;      // entrance end, far end, half width
  const WELL = [2.8, 7.2], WZ = -12.0;     // the stair well's mouth in the ceiling
  const MID = (Z0 + Z1) / 2, LEN = Z0 - Z1;

  box(m.stone, 0, F - 0.15, MID, 2 * HW, 0.3, LEN, 'floor');
  // The floor of a painting gallery is never a white slab. Marmottan, Orsay,
  // the Denon rooms: oak parquet laid point de Hongrie at 45 degrees, with a
  // darker stained frieze running round the room against the skirting — warm
  // enough to sit under the Nymphéas, quiet enough not to compete with them.
  // tools/make_gallery_floor.py bakes both tiles; they are seamless, so the
  // repeat below is simply metres / tile size and may be fractional.
  const loading = [];
  const floorLoader = new THREE.TextureLoader();
  const PTILE = 1.697, BTILE_W = 0.85, BTILE_L = 1.92;
  const floorTex = (file, rx, ry, srgb) => {
    const t = floorLoader.load(`./textures/cruise-monet/${file}`);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 16;
    t.repeat.set(rx, ry);
    return t;
  };
  loading.push(new Promise(resolve => floorLoader.load(
    './textures/cruise-monet/floor_parquet_diffuse.webp',
    () => resolve('floor_parquet'), undefined,
    () => { console.error('[cruise arts] missing parquet texture'); resolve(null); })));

  const BW = 0.85;                          // width of the frieze
  const IX = HW - 0.35, IZ0 = Z0 - 0.2, IZ1 = Z1 + 0.2;  // inside the skirting
  const FWX = IX - BW, FZA = IZ0 - BW, FZB = IZ1 + BW;   // the parquet field
  const parquet = new THREE.MeshStandardMaterial({
    map: floorTex('floor_parquet_diffuse.webp', 2 * FWX / PTILE, (FZA - FZB) / PTILE, true),
    normalMap: floorTex('floor_parquet_normal.webp', 2 * FWX / PTILE, (FZA - FZB) / PTILE),
    roughnessMap: floorTex('floor_parquet_rough.webp', 2 * FWX / PTILE, (FZA - FZB) / PTILE),
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 1, metalness: 0, envMapIntensity: 0.6,
  });
  // Boards of the frieze run along their own strip, so the two orientations
  // need their own repeat; the end strips are the same material turned 90°.
  const borderMat = (len) => new THREE.MeshStandardMaterial({
    map: floorTex('floor_border_diffuse.webp', 1, len / BTILE_L, true),
    normalMap: floorTex('floor_border_normal.webp', 1, len / BTILE_L),
    roughnessMap: floorTex('floor_border_rough.webp', 1, len / BTILE_L),
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 1, metalness: 0, envMapIntensity: 0.6,
  });
  const friezeLong = borderMat(IZ0 - IZ1), friezeEnd = borderMat(2 * FWX);
  // 12 mm slabs centred on the floor plane: half of each is buried in the
  // structural slab, so the walking surface stays exactly at F.
  box(parquet, 0, F, (FZA + FZB) / 2, 2 * FWX, 0.012, FZA - FZB);
  for (const sx of [-1, 1])
    box(friezeLong, sx * (IX - BW / 2), F, (IZ0 + IZ1) / 2, BW, 0.012, IZ0 - IZ1);
  for (const [zc] of [[IZ0 - BW / 2], [IZ1 + BW / 2]])
    box(friezeEnd, 0, F, zc, BW, 0.012, 2 * FWX, false, Math.PI / 2);
  // A brass fillet across each end hides the cut ends of the herringbone.
  // Do not run matching fillets down the long sides: at this grazing camera
  // angle those two hairline boxes alias into apparent bars suspended across
  // the gallery and visually continue out of the foyer portal.
  for (const zc of [FZA + 0.015, FZB - 0.015])
    box(m.goldLight, 0, F + 0.002, zc, 2 * FWX + 0.06, 0.01, 0.03);
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

  works.forEach((w, i) => {
    // Seven metres between centres leaves a visible reveal even around the
    // widest 6.4 m canvases (6.62 m including their timber surround).
    const side = i < 4 ? -1 : 1, z = -19 - (i % 4) * 7;
    const ratio = w.width / w.height;
    let height = 2.9, width = height * ratio;
    if (width > 6.4) { width = 6.4; height = width / ratio; }
    const ry = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    box(m.wood, side * (HW - 0.32), F + 2.05, z, 0.18, height + 0.22, width + 0.22);
    box(m.goldLight, side * (HW - 0.44), F + 2.05, z, 0.10, height + 0.12, width + 0.12);
    // The canvas must react to the gallery lighting.  MeshBasicMaterial made
    // every reproduction a self-lit white rectangle, so turning the room down
    // could never produce the contrast of a real exhibition space.
    // A little of the canvas's own light. Museum lighting puts the picture at
    // the top of the luminance order and leaves the room below it, and an omni
    // point light cannot do that here: the illuminance it drops on plaster a
    // metre away always beats what reaches a dark Nymphéas two metres below,
    // so chasing the ratio with intensity only burned a pool into the cimaise.
    // A quarter of self-illumination puts the painting where a gallery puts
    // it, and the rails above can then stay gentle. The canvas still takes the
    // room's light on top of it, so turning the gallery down still tells.
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.92, metalness: 0,
      emissive: 0xffffff, emissiveIntensity: 0.27,
    });
    const art = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    art.position.set(side * (HW - 0.51), F + 2.05, z); art.rotation.y = ry;
    group.add(art);
    loading.push(new Promise(resolve => new THREE.TextureLoader().load(
      `./textures/cruise-monet/${w.file}`, tex => {
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
        mat.map = tex; mat.emissiveMap = tex; mat.needsUpdate = true; resolve(w.file);
      }, undefined, () => { console.error('[cruise arts] missing painting', w.file); resolve(null); })));
    label(`Claude Monet · ${w.title}\n${w.date} · ${w.museum}`,
      side * (HW - 0.54), F + 0.52, z, Math.min(width, 4.6), 0.4, ry);
    // A slim rail above each work. It is an accent now, not the instrument
    // that lights the painting: turned up it wrote a blown pool onto the
    // cimaise above every frame, and the ceiling with it.
    // A spotlight would be the real instrument, but main-CRUISE.js copies
    // every room light into a PointLight pool, so aiming is not available.
    box(m.light, side * (HW - 1.3), C - 0.45, z, 0.16, 0.07, Math.max(width, 2.4));
    light(side * (HW - 1.45), C - 0.85, z, 13, 5.4, 0xffe7c2);
  });

  const laylight = new THREE.MeshStandardMaterial({
    color: 0xfff1d8, emissive: 0xffe2b4, emissiveIntensity: 0.62, roughness: 0.9,
  });

  // Grand museum tufted banquettes (banquettes capitonnées d'exposition)
  // in deep burgundy velvet/leather with turned mahogany legs, brass sabots,
  // welted borders, embedded 3D tuft buttons, double-sided central backrest
  // and rolled armrest bolsters with brass rosettes.
  const texLoader = new THREE.TextureLoader();
  const tuftTex = texLoader.load('./textures/cruise-monet/tufted_diffuse.webp', tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 4);
    tex.needsUpdate = true;
  });
  const tuftBump = texLoader.load('./textures/cruise-monet/tufted_bump.webp', tex => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 4);
    tex.needsUpdate = true;
  });
  loading.push(new Promise(resolve => {
    texLoader.load('./textures/cruise-monet/tufted_diffuse.webp', () => resolve('tufted_diffuse'), undefined, () => resolve(null));
  }));

  const tuftMat = new THREE.MeshStandardMaterial({
    map: tuftTex,
    bumpMap: tuftBump,
    bumpScale: 0.035,
    roughness: 0.72,
    metalness: 0.06,
  });

  const buttonMat = new THREE.MeshStandardMaterial({
    color: 0x1d050a,
    roughness: 0.35,
    metalness: 0.25,
  });

  const mahoganyMat = new THREE.MeshStandardMaterial({
    color: 0x341b12,
    roughness: 0.42,
    metalness: 0.1,
  });

  for (const z of [-25, -31, -37]) {
    // 1. Turned legs & brass sabots (6 legs per bench)
    for (const lx of [-0.48, 0.48]) {
      for (const lz of [z - 1.05, z, z + 1.05]) {
        // Brass ferrule / sabot on the floor
        item(b.cylinder, m.gold, lx, F + 0.03, lz, 0.042, 0.06, 0.042);
        // Turned dark mahogany leg
        item(b.cylinder, mahoganyMat, lx, F + 0.14, lz, 0.036, 0.16, 0.036);
        // Gilded brass collar under apron
        item(b.cylinder, m.gold, lx, F + 0.225, lz, 0.042, 0.015, 0.042);
      }
    }

    // 2. Base apron / ceinture en acajou mouluré avec filet doré
    box(mahoganyMat, 0, F + 0.26, z, 1.14, 0.06, 2.38);
    box(m.gold, 0, F + 0.235, z, 1.16, 0.012, 2.40);

    // 3. Matelas d'assise capitonné (Main tufted seat cushion)
    box(tuftMat, 0, F + 0.295, z, 1.16, 0.02, 2.40);
    box(tuftMat, 0, F + 0.395, z, 1.14, 0.18, 2.38);
    box(tuftMat, 0, F + 0.49, z, 1.16, 0.02, 2.40);

    // 4. Physical 3D Tufting Buttons on seat surface
    for (const sx of [-1, 1]) {
      for (const bx of [sx * 0.38, sx * 0.22]) {
        for (let k = -4; k <= 4; k++) {
          const bz = z + k * 0.22;
          item(b.sphere, buttonMat, bx, F + 0.495, bz, 0.016, 0.010, 0.016);
        }
      }
    }

    // 5. Dossier central double-face capitonné (Dos-à-dos)
    box(tuftMat, 0, F + 0.65, z, 0.22, 0.30, 1.90);
    // Top roll bolster along Z
    item(b.cylinder, tuftMat, 0, F + 0.81, z, 0.115, 1.90, 0.115, 0, Math.PI / 2);
    // Tufting buttons on both flanks of the backrest
    for (const sx of [-1, 1]) {
      for (let k = -3; k <= 3; k++) {
        const bz = z + k * 0.24;
        const isOffset = Math.abs(k) % 2 === 1;
        item(b.sphere, buttonMat, sx * 0.115, F + (isOffset ? 0.72 : 0.60), bz, 0.010, 0.016, 0.016);
      }
    }
    // End posts of the backrest (turned wood with polished brass spheres)
    for (const zEnd of [z - 0.95, z + 0.95]) {
      item(b.cylinder, mahoganyMat, 0, F + 0.65, zEnd, 0.04, 0.34, 0.04);
      item(b.cylinder, m.gold, 0, F + 0.82, zEnd, 0.046, 0.018, 0.046);
      item(b.sphere, m.gold, 0, F + 0.855, zEnd, 0.042, 0.042, 0.042);
    }

    // 6. Traversins / Accoudoirs cylindriques aux extrémités (End Bolsters)
    for (const zEnd of [z - 1.08, z + 1.08]) {
      item(b.cylinder, tuftMat, 0, F + 0.54, zEnd, 0.075, 1.06, 0.075, 0, 0, Math.PI / 2);
      for (const sx of [-1, 1]) {
        item(b.cylinder, m.gold, sx * 0.535, F + 0.54, zEnd, 0.038, 0.012, 0.038, 0, 0, Math.PI / 2);
      }
    }

    // 7. Colliders (furniture prop)
    box(m.wood, 0, F + 0.25, z, 1.16, 0.50, 2.40, 'prop');
    box(m.wood, 0, F + 0.65, z, 0.24, 0.34, 1.90, 'prop');

    // 8. The laylight over the banquette. A luminous ceiling is the right
    // instrument for this room — the Orangerie lights its Nymphéas through a
    // zenithal velum — but at the emissive of a bare lamp these pools clipped
    // to pure white, two and a half times the luminance of the canvases, and
    // twenty-five square metres of that hangs in the eye of anyone sitting
    // under it. Turned down and glazed with bars, it reads as daylight coming
    // through the deck above, and the pictures come back to the front.
    box(laylight, 0, C - 0.32, z, 5, 0.06, 5);
    for (const o of [-1.25, 0, 1.25]) {
      box(m.goldLight, o, C - 0.37, z, 0.05, 0.05, 5);
      box(m.goldLight, 0, C - 0.37, z + o, 5, 0.05, 0.05);
    }
    for (const sd of [-1, 1]) {
      box(m.gold, sd * 2.5, C - 0.375, z, 0.09, 0.07, 5.09);
      box(m.gold, 0, C - 0.375, z + sd * 2.5, 5.09, 0.07, 0.09);
    }
    light(0, C - 2.4, z, 6, 12, 0xfff3da);
  }

  // -------------------------------------------------------------------------
  // The foyer (petit hall) : Vestibule d'Honneur de l'Opéra Garnier.
  // Four metres between the Monet hall (z = -44) and the Grand Opéra (z = -48).
  // Replaces the former primitive slabs with an opulent classical foyer:
  // Botticino marble floor, luxury garnet/gold opera runner, molded mahogany
  // wainscoting with crimson damask and fluted marble pilasters, two grand
  // marble consoles with bronze busts, candelabras & framed Belle Époque
  // posters, an 8-arm crystal chandelier, and an ornate double-doored portal
  // framed with draped velvet portières.
  // -------------------------------------------------------------------------
  const FZ0 = -44, FZ1 = -48, FHW = 6;
  const FMID_Z = (FZ0 + FZ1) / 2, FLEN = FZ0 - FZ1;

  // 1. Flooring: Polished Botticino marble slabs with dark Griotte marble perimeter
  const foyerMarble = artTex.getFoyerMarbleMaterial(3, 2);
  box(foyerMarble, 0, F - 0.15, FMID_Z, 2 * FHW, 0.3, FLEN, 'floor');
  box(m.ivory, 0, C + 0.15, FMID_Z, 2 * FHW, 0.3, FLEN, true); // ceiling slab

  // Dark marble perimeter border band against side walls
  for (const sx of [-1, 1]) {
    box(m.red, sx * (FHW - 0.35), F + 0.002, FMID_Z, 0.7, 0.008, FLEN);
    box(m.gold, sx * (FHW - 0.7), F + 0.004, FMID_Z, 0.04, 0.012, FLEN);
  }

  // Central luxury opera runner (aligned with the Monet central axis and Opera aisle)
  const RUNNER_W = 3.2;
  const foyerCarpet = artTex.getCarpetMaterial(3, 4);
  const foyerBorder = artTex.getBorderMaterial(1, 4);
  box(foyerCarpet, 0, F + 0.012, FMID_Z, RUNNER_W, 0.024, FLEN);

  // Woven gold jacquard borders and brass edge flats along the runner
  for (const sx of [-1, 1]) {
    const bx = sx * (RUNNER_W / 2 - 0.07);
    box(foyerBorder, bx, F + 0.02, FMID_Z, 0.14, 0.025, FLEN);
    box(m.gold, sx * (RUNNER_W / 2 - 0.01), F + 0.022, FMID_Z, 0.025, 0.026, FLEN);
  }
  // Polished brass threshold flats at transitions
  for (const zc of [FZ0, FZ1]) {
    box(m.gold, 0, F + 0.022, zc, RUNNER_W + 0.04, 0.026, 0.06);
  }

  // 2. Side Walls & Classical Architecture
  // Dark French mahogany wainscoting (soubassement), crimson damask tapestry above,
  // and fluted marble pilasters with Corinthian gilded capitals.
  const wainscotMat = m.wood;
  const damaskWallMat = m.red;
  for (const side of [-1, 1]) {
    const xw = side * FHW;
    // Structural outer wall collider
    box(m.stone, xw, (F + C) / 2, FMID_Z, 0.4, C - F, FLEN, true);

    // Mahogany soubassement up to y = F + 1.25
    box(wainscotMat, side * (FHW - 0.16), F + 0.625, FMID_Z, 0.08, 1.25, FLEN);
    // Skirting plinth
    box(wainscotMat, side * (FHW - 0.18), F + 0.14, FMID_Z, 0.12, 0.28, FLEN);
    // Molded dado rail with gilt fillet
    box(m.gold, side * (FHW - 0.18), F + 1.25, FMID_Z, 0.12, 0.06, FLEN);

    // Recessed molded wainscot panels (caissons de boiserie)
    for (let k = -1; k <= 1; k++) {
      const pz = FMID_Z + k * 1.2;
      box(m.stone, side * (FHW - 0.18), F + 0.72, pz, 0.06, 0.78, 0.95);
      box(m.gold, side * (FHW - 0.19), F + 0.72, pz, 0.03, 0.74, 0.91);
      box(wainscotMat, side * (FHW - 0.17), F + 0.72, pz, 0.04, 0.68, 0.85);
    }

    // Upper wall in crimson damask tapestry
    box(damaskWallMat, side * (FHW - 0.16), F + 1.25 + (C - F - 1.25) / 2, FMID_Z,
      0.06, C - F - 1.25, FLEN);

    // Gilded modillion cornice along ceiling
    box(m.gold, side * (FHW - 0.18), C - 0.25, FMID_Z, 0.24, 0.28, FLEN);
    box(m.goldLight, side * (FHW - 0.22), C - 0.38, FMID_Z, 0.14, 0.08, FLEN);

    // Fluted marble pilasters with gilded Corinthian capital & base
    for (const zPil of [FZ0 + 0.4, FZ1 - 0.4]) {
      const px = side * (FHW - 0.26);
      item(b.cylinder, m.ivory, px, (F + C) / 2, zPil, 0.24, C - F - 0.9, 0.24);
      // Gilded base
      box(m.gold, px, F + 0.22, zPil, 0.55, 0.44, 0.55);
      box(m.ivory, px, F + 0.48, zPil, 0.50, 0.10, 0.50);
      // Gilded Corinthian capital
      box(m.gold, px, C - 0.36, zPil, 0.58, 0.36, 0.58);
      box(m.goldLight, px, C - 0.52, zPil, 0.52, 0.08, 0.52);
    }
  }

  // 3. Furniture & Decor: Consoles d'Apparat, Busts, Candelabras & Framed Posters
  for (const side of [-1, 1]) {
    const cx = side * (FHW - 0.65);
    const cz = FMID_Z;

    // Console table in carved gilded wood and Botticino marble top (height = F + 0.95, width = 2.2, depth = 0.65)
    box(m.ivory, cx, F + 0.94, cz, 0.65, 0.08, 2.2, 'prop'); // marble top
    box(m.gold, cx, F + 0.88, cz, 0.62, 0.06, 2.16);         // gilded frieze
    // 4 fluted gilded legs with acanthus knees and brass sabots
    for (const dz of [-0.95, 0.95]) {
      for (const dx of [-0.22, 0.22]) {
        item(b.cylinder, m.gold, cx + dx, F + 0.44, cz + dz, 0.055, 0.82, 0.055);
        item(b.cylinder, m.goldLight, cx + dx, F + 0.04, cz + dz, 0.07, 0.08, 0.07);
        item(b.sphere, m.gold, cx + dx, F + 0.83, cz + dz, 0.08, 0.08, 0.08);
      }
    }
    // Curved stretcher with central gilded urn finial
    box(m.gold, cx, F + 0.16, cz, 0.42, 0.04, 1.9);
    item(b.sphere, m.gold, cx, F + 0.26, cz, 0.10, 0.16, 0.10);

    // Console accessories:
    if (side < 0) {
      // Left side: Classical Sculpted Bronze Bust on pedestal
      box(m.ivory, cx, F + 1.05, cz, 0.34, 0.14, 0.34);
      box(m.gold, cx, F + 1.14, cz, 0.30, 0.05, 0.30);
      item(b.cylinder, m.stone, cx, F + 1.25, cz, 0.10, 0.18, 0.10);
      box(m.stone, cx, F + 1.44, cz, 0.24, 0.22, 0.46);
      item(b.cylinder, m.stone, cx, F + 1.58, cz, 0.08, 0.12, 0.08);
      item(b.sphere, m.stone, cx, F + 1.70, cz, 0.12, 0.15, 0.12);
      item(b.sphere, m.stone, cx, F + 1.74, cz, 0.14, 0.11, 0.16);

      // Pair of 3-branch gilded candelabras flanking the bust
      for (const dz of [-0.68, 0.68]) {
        item(b.cylinder, m.gold, cx, F + 1.15, cz + dz, 0.035, 0.34, 0.035);
        for (const oz of [-0.14, 0, 0.14]) {
          item(b.cylinder, m.gold, cx, F + 1.34, cz + dz + oz, 0.018, 0.12, 0.018);
          item(b.sphere, m.light, cx, F + 1.44, cz + dz + oz, 0.04, 0.08, 0.04);
        }
      }
      // Open Opera Guestbook (livre d'or)
      box(m.wood, cx + 0.08, F + 0.99, cz - 0.32, 0.28, 0.02, 0.36);
      box(m.ivory, cx + 0.08, F + 1.01, cz - 0.32, 0.26, 0.02, 0.34);
    } else {
      // Right side: Classical Sculpted Urn / Vase
      box(m.ivory, cx, F + 1.05, cz, 0.36, 0.14, 0.36);
      item(b.cylinder, m.gold, cx, F + 1.18, cz, 0.12, 0.14, 0.12);
      item(b.sphere, m.stone, cx, F + 1.38, cz, 0.22, 0.28, 0.22);
      item(b.cylinder, m.stone, cx, F + 1.54, cz, 0.16, 0.12, 0.16);
      item(b.sphere, m.gold, cx, F + 1.62, cz, 0.07, 0.07, 0.07);

      // Pair of gilded candelabras
      for (const dz of [-0.68, 0.68]) {
        item(b.cylinder, m.gold, cx, F + 1.15, cz + dz, 0.035, 0.34, 0.035);
        for (const oz of [-0.14, 0, 0.14]) {
          item(b.cylinder, m.gold, cx, F + 1.34, cz + dz + oz, 0.018, 0.12, 0.018);
          item(b.sphere, m.light, cx, F + 1.44, cz + dz + oz, 0.04, 0.08, 0.04);
        }
      }
    }

    // Grand Gilded Framed Vintage Opera Posters on wall above each console
    const posterY = F + 2.85;
    const posterW = 1.45, posterH = 2.15;
    const posterZ = cz;
    const posterX = side * (FHW - 0.22);
    const posterRy = side < 0 ? Math.PI / 2 : -Math.PI / 2;

    box(m.gold, posterX, posterY, posterZ, 0.08, posterH + 0.28, posterW + 0.28);
    box(m.goldLight, posterX + side * 0.01, posterY, posterZ, 0.08, posterH + 0.14, posterW + 0.14);
    box(m.wood, posterX + side * 0.02, posterY, posterZ, 0.07, posterH, posterW);

    const posterTex = side < 0
      ? artTex.getOperaPosterTexture('FAUST', 'Charles Gounod', 'Grand Opéra en 5 Actes', 'Saison Lyrique 1875')
      : artTex.getOperaPosterTexture('AÏDA', 'Giuseppe Verdi', 'Opéra en 4 Actes', 'Représentation Extraordinaire');
    const posterMat = new THREE.MeshStandardMaterial({
      map: posterTex,
      roughness: 0.68,
      metalness: 0.02,
    });
    const posterMesh = new THREE.Mesh(new THREE.PlaneGeometry(posterW - 0.04, posterH - 0.04), posterMat);
    posterMesh.position.set(posterX - side * 0.03, posterY, posterZ);
    posterMesh.rotation.y = posterRy;
    group.add(posterMesh);

    // Flanking crystal wall sconces (appliques à pampilles)
    for (const dz of [-1.15, 1.15]) {
      const sx = side * (FHW - 0.24);
      const sy = F + 2.45;
      const sz = cz + dz;
      box(m.gold, sx, sy, sz, 0.10, 0.44, 0.14);
      item(b.cylinder, m.gold, sx - side * 0.12, sy + 0.08, sz, 0.03, 0.22, 0.03);
      item(b.sphere, m.light, sx - side * 0.12, sy + 0.22, sz, 0.06, 0.12, 0.06);
      item(b.sphere, m.goldLight, sx - side * 0.12, sy - 0.08, sz, 0.035, 0.11, 0.035);
    }
  }

  // 4. The Grand Opera Portal at FZ1 = -48 (replaces crude blocks)
  // Clear passage width 4.8 m, height 3.4 m.
  for (const sx of [-1, 1]) {
    // Structural partition wall
    box(m.ivory, sx * (FHW + 2.4) / 2, (F + C) / 2, FZ1, FHW - 2.4, C - F, 0.45, true);
    // Molded jamb pilaster
    box(m.stone, sx * 2.52, F + 1.7, FZ1, 0.32, 3.4, 0.52);
    box(m.gold, sx * 2.52, F + 0.18, FZ1, 0.38, 0.36, 0.58);
    box(m.gold, sx * 2.52, F + 3.32, FZ1, 0.38, 0.24, 0.58);
  }
  // Overhead lintel / entablature
  box(m.ivory, 0, (F + 3.4 + C) / 2, FZ1, 4.8, C - F - 3.4, 0.45, true);
  box(m.gold, 0, F + 3.48, FZ1 + 0.12, 5.2, 0.18, 0.55);
  box(m.stone, 0, F + 3.75, FZ1 + 0.08, 5.4, 0.36, 0.50);
  box(m.gold, 0, F + 3.96, FZ1 + 0.14, 5.6, 0.14, 0.56);

  // Grand carved cartouche / pediment over the door
  label('LE GRAND OPÉRA · SALLE GARNIER\nAcadémie Nationale de Musique',
    0, F + 4.35, FZ1 + 0.28, 5.2, 0.75, 0, true);

  // Authentic Paneled Double Doors (folded open against reveals into the Opera)
  for (const sx of [-1, 1]) {
    const doorAngle = sx * 0.28;
    const doorX = sx * 2.38;
    const doorZ = FZ1 - 0.85;

    // Door leaf stile & rail frame in French polished walnut
    box(m.wood, doorX, F + 1.7, doorZ, 0.14, 3.3, 1.72, true, doorAngle);
    // Brass kickplate along bottom
    box(m.gold, doorX - sx * 0.08, F + 0.22, doorZ, 0.03, 0.42, 1.68, false, doorAngle);
    // Recessed panels with beveled bead molding (3 pairs of caissons)
    for (let row = 0; row < 3; row++) {
      const py = F + 0.75 + row * 0.95;
      for (const dz of [-0.38, 0.38]) {
        box(m.stone, doorX - sx * 0.08, py, doorZ + dz, 0.025, 0.78, 0.58, false, doorAngle);
        box(m.gold, doorX - sx * 0.09, py, doorZ + dz, 0.015, 0.72, 0.52, false, doorAngle);
        box(m.wood, doorX - sx * 0.075, py, doorZ + dz, 0.02, 0.66, 0.46, false, doorAngle);
      }
    }
    // Polished brass classical lever handle & backplate
    box(m.gold, doorX - sx * 0.12, F + 1.15, doorZ + 0.65, 0.05, 0.28, 0.08, false, doorAngle);
    item(b.cylinder, m.gold, doorX - sx * 0.16, F + 1.15, doorZ + 0.65, 0.02, 0.12, 0.02, 0, 0, Math.PI / 2);
  }

  // Luxurious Velvet Portières (grand draped entrance curtains)
  for (const sx of [-1, 1]) {
    const drapeX = sx * 2.22;
    const drapeZ = FZ1 + 0.16;
    for (let k = 0; k < 4; k++) {
      const fx = drapeX + sx * (k * 0.08);
      const fz = drapeZ + (k % 2 ? 0.04 : -0.04);
      const rad = 0.14 - k * 0.02;
      item(b.cylinder, m.velvet, fx, F + 1.7, fz, rad, 3.3, rad * 0.85);
    }
    // Braided gold tie-back cord and tassel
    item(b.cylinder, m.gold, drapeX, F + 1.45, drapeZ, 0.045, 0.42, 0.045, 0, 0, Math.PI / 2);
    item(b.sphere, m.gold, drapeX - sx * 0.08, F + 1.32, drapeZ, 0.09, 0.16, 0.09);
    item(b.cylinder, m.gold, drapeX - sx * 0.08, F + 1.12, drapeZ, 0.05, 0.26, 0.05);
  }
  // Gilded curtain pole spanning top of portal with sphere finials
  item(b.cylinder, m.gold, 0, F + 3.42, FZ1 + 0.18, 0.048, 5.0, 0.048, 0, 0, Math.PI / 2);
  for (const sx of [-1, 1]) {
    item(b.sphere, m.gold, sx * 2.55, F + 3.42, FZ1 + 0.18, 0.11, 0.11, 0.11);
  }

  // 5. Portal from Monet Gallery at FZ0 = -44
  for (const sx of [-1, 1]) {
    box(m.stone, sx * 3.1, F + 1.7, FZ0, 0.28, 3.4, 0.44);
    box(m.gold, sx * 3.1, F + 3.35, FZ0, 0.32, 0.18, 0.48);
  }
  box(m.gold, 0, F + 3.45, FZ0 - 0.08, 6.2, 0.16, 0.44);
  label('← GALERIE DES NYMPHÉAS\nCollection Claude Monet',
    0, F + 3.95, FZ0 - 0.22, 4.8, 0.65, Math.PI, true);

  // 6. Ceiling Coffers & 8-Arm Crystal Chandelier
  for (const o of [-2.4, 0, 2.4]) {
    box(m.gold, o, C - 0.06, FMID_Z, 0.12, 0.08, FLEN);
  }
  // FZ0 is the gallery side (-44) and FZ1 the opera side (-48): move toward
  // the foyer's centre, not away from it.  The opposite signs put two full
  // width gilt bars outside the vestibule, across the adjoining rooms.
  for (const zc of [FZ0 - 1.2, FMID_Z, FZ1 + 1.2]) {
    box(m.gold, 0, C - 0.06, zc, 2 * FHW, 0.08, 0.12);
  }
  item(b.cylinder, m.gold, 0, C - 0.08, FMID_Z, 1.35, 0.08, 1.35);
  item(b.cylinder, m.ivory, 0, C - 0.12, FMID_Z, 0.95, 0.06, 0.95);

  // Magnificent 8-Arm Crystal & Brass Chandelier
  item(b.cylinder, m.gold, 0, C - 0.45, FMID_Z, 0.045, 0.65, 0.045);
  item(b.sphere, m.gold, 0, C - 0.82, FMID_Z, 0.24, 0.28, 0.24);
  item(b.cylinder, m.gold, 0, C - 0.92, FMID_Z, 0.85, 0.06, 0.85);

  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const ax = Math.cos(a) * 0.95;
    const az = FMID_Z + Math.sin(a) * 0.95;

    item(b.cylinder, m.gold, ax * 0.55, C - 0.96, FMID_Z + (az - FMID_Z) * 0.55, 0.03, 0.65, 0.03,
      a, 0, Math.PI / 2);
    item(b.sphere, m.gold, ax, C - 0.94, az, 0.07, 0.04, 0.07);
    item(b.cylinder, m.ivory, ax, C - 0.82, az, 0.024, 0.18, 0.024);
    item(b.sphere, m.light, ax, C - 0.70, az, 0.048, 0.10, 0.048);
    item(b.sphere, m.goldLight, ax, C - 1.08, az, 0.042, 0.16, 0.042);
    item(b.sphere, m.light, ax, C - 1.18, az, 0.025, 0.04, 0.025);
  }
  item(b.sphere, m.goldLight, 0, C - 1.25, FMID_Z, 0.14, 0.22, 0.14);

  // Warm radiant light from the chandelier
  light(0, C - 1.2, FMID_Z, 80, 14, 0xffe6be);
  return { ...b.finish(), ready: Promise.all(loading) };
}
