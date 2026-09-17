// cruiseArtsTextures.js - High-fidelity procedural PBR textures for Cruise Arts
// Generates luxury opera velvet carpets with normal maps, polished Botticino marble,
// vintage opera playbills, and classical architectural finishes.

export function createArtsTextures(THREE) {
  // Helper to create a CanvasTexture with standard settings
  function createCanvasTexture(width, height, drawFn, isSRGB = true) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    drawFn(ctx, width, height, canvas);
    const tex = new THREE.CanvasTexture(canvas);
    if (isSRGB) tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 16;
    return { tex, canvas };
  }

  // Generate a tangent-space normal map from a grayscale height canvas
  function createNormalMapFromHeight(heightCanvas, strength = 2.2) {
    const w = heightCanvas.width, h = heightCanvas.height;
    const ctx = heightCanvas.getContext('2d');
    const src = ctx.getImageData(0, 0, w, h).data;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    const outCtx = outCanvas.getContext('2d');
    const imgData = outCtx.createImageData(w, h);
    const dst = imgData.data;

    for (let y = 0; y < h; y++) {
      const yPrev = ((y - 1 + h) % h) * w;
      const yNext = ((y + 1) % h) * w;
      const yCurr = y * w;
      for (let x = 0; x < w; x++) {
        const xPrev = (x - 1 + w) % w;
        const xNext = (x + 1) % w;

        // Sample heights from red channel (0..1)
        const hL = src[(yCurr + xPrev) * 4] / 255.0;
        const hR = src[(yCurr + xNext) * 4] / 255.0;
        const hU = src[(yPrev + x) * 4] / 255.0;
        const hD = src[(yNext + x) * 4] / 255.0;

        const dx = (hR - hL) * 0.5 * strength;
        const dy = (hD - hU) * 0.5 * strength;
        const len = Math.hypot(dx, dy, 1.0);

        const idx = (yCurr + x) * 4;
        dst[idx]     = Math.round((-dx / len * 0.5 + 0.5) * 255);
        dst[idx + 1] = Math.round(( dy / len * 0.5 + 0.5) * 255);
        dst[idx + 2] = Math.round((  1.0 / len * 0.5 + 0.5) * 255);
        dst[idx + 3] = 255;
      }
    }
    outCtx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(outCanvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 16;
    return tex;
  }

  // ---------------------------------------------------------------------------
  // 1. Grand Opéra Luxury Velvet Carpet (Moquette d'Apparat Garnier)
  // Deep garnet ground, dense wool pile micro-tufts, antique gold rosette medallions
  // on a delicate ribbon strapwork lattice, and tangible normal relief.
  // ---------------------------------------------------------------------------
  const S = 512;
  const heightCanvas = document.createElement('canvas');
  heightCanvas.width = heightCanvas.height = S;
  const hctx = heightCanvas.getContext('2d');
  hctx.fillStyle = '#808080';
  hctx.fillRect(0, 0, S, S);

  const { tex: carpetDiffTex } = createCanvasTexture(S, S, (g, W, H) => {
    // 1. Rich imperial claret / carmine base with subtle radial depth
    const bg = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.72);
    bg.addColorStop(0, '#5e0f1e');
    bg.addColorStop(0.55, '#4e0a17');
    bg.addColorStop(1, '#420712');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // 2. High-density woven wool pile micro-tufts (avoiding flat plastic shading)
    let seed = 129481;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

    for (let i = 0; i < 9000; i++) {
      const x = rnd() * W, y = rnd() * H;
      const isHigh = rnd() > 0.45;
      const val = isHigh ? 0.22 + rnd() * 0.16 : 0.28 + rnd() * 0.14;
      g.fillStyle = isHigh ? `rgba(168, 48, 70, ${val})` : `rgba(28, 4, 10, ${val})`;
      const sz = 1.4 + rnd() * 1.8;
      g.fillRect(x, y, sz, sz);

      // Micro-bumps on height map
      hctx.fillStyle = isHigh ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.15)';
      hctx.fillRect(x, y, sz, sz);
    }

    // 3. Antique Gold Strapwork Lattice and Medallions
    const drawMedallion = (cx, cy, radius) => {
      // Shaded embossed medallion background
      const rad = g.createRadialGradient(cx, cy, 2, cx, cy, radius);
      rad.addColorStop(0, 'rgba(74, 12, 22, 0.9)');
      rad.addColorStop(0.7, 'rgba(52, 8, 16, 0.85)');
      rad.addColorStop(1, 'rgba(38, 5, 11, 0.4)');
      g.fillStyle = rad;
      g.beginPath();
      g.arc(cx, cy, radius, 0, Math.PI * 2);
      g.fill();

      // Outer beaded gold ring
      g.strokeStyle = 'rgba(216, 174, 88, 0.65)';
      g.lineWidth = 2.4;
      g.beginPath();
      g.arc(cx, cy, radius * 0.86, 0, Math.PI * 2);
      g.stroke();

      // Secondary fine inner ring
      g.strokeStyle = 'rgba(180, 138, 62, 0.45)';
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(cx, cy, radius * 0.95, 0, Math.PI * 2);
      g.stroke();

      // Height for rings
      hctx.strokeStyle = '#c0c0c0';
      hctx.lineWidth = 2.4;
      hctx.beginPath();
      hctx.arc(cx, cy, radius * 0.86, 0, Math.PI * 2);
      hctx.stroke();

      // Beads around perimeter
      const beadCount = 16;
      for (let b = 0; b < beadCount; b++) {
        const ang = (b / beadCount) * Math.PI * 2;
        const bx = cx + Math.cos(ang) * radius * 0.86;
        const by = cy + Math.sin(ang) * radius * 0.86;
        g.fillStyle = 'rgba(240, 204, 118, 0.85)';
        g.beginPath();
        g.arc(bx, by, 2.0, 0, Math.PI * 2);
        g.fill();

        hctx.fillStyle = '#e8e8e8';
        hctx.beginPath();
        hctx.arc(bx, by, 2.0, 0, Math.PI * 2);
        hctx.fill();
      }

      // 8-petal central rosette with palmettes
      for (let p = 0; p < 8; p++) {
        const a = (p / 8) * Math.PI * 2;
        g.save();
        g.translate(cx, cy);
        g.rotate(a);

        // Petal shape
        g.fillStyle = 'rgba(214, 172, 84, 0.65)';
        g.strokeStyle = 'rgba(128, 92, 34, 0.7)';
        g.lineWidth = 1.0;
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(radius * 0.22, radius * 0.32, 0, radius * 0.68);
        g.quadraticCurveTo(-radius * 0.22, radius * 0.32, 0, 0);
        g.fill();
        g.stroke();

        // Inner petal highlight vein
        g.strokeStyle = 'rgba(250, 222, 142, 0.75)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(0, radius * 0.08);
        g.lineTo(0, radius * 0.54);
        g.stroke();

        g.restore();

        // Height for petals
        hctx.save();
        hctx.translate(cx, cy);
        hctx.rotate(a);
        hctx.fillStyle = '#b8b8b8';
        hctx.beginPath();
        hctx.moveTo(0, 0);
        hctx.quadraticCurveTo(radius * 0.22, radius * 0.32, 0, radius * 0.68);
        hctx.quadraticCurveTo(-radius * 0.22, radius * 0.32, 0, 0);
        hctx.fill();
        hctx.restore();
      }

      // Center golden cabochon button
      const cg = g.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, radius * 0.2);
      cg.addColorStop(0, '#fef0c8');
      cg.addColorStop(0.5, '#deb05a');
      cg.addColorStop(1, '#8e6320');
      g.fillStyle = cg;
      g.beginPath();
      g.arc(cx, cy, radius * 0.2, 0, Math.PI * 2);
      g.fill();

      hctx.fillStyle = '#ffffff';
      hctx.beginPath();
      hctx.arc(cx, cy, radius * 0.2, 0, Math.PI * 2);
      hctx.fill();
    };

    // Diagonal lattice connecting medallions
    const drawRibbon = (x0, y0, x1, y1) => {
      g.strokeStyle = 'rgba(196, 152, 70, 0.45)';
      g.lineWidth = 3.2;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();

      g.strokeStyle = 'rgba(242, 210, 130, 0.35)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();

      hctx.strokeStyle = '#a8a8a8';
      hctx.lineWidth = 3.2;
      hctx.beginPath();
      hctx.moveTo(x0, y0);
      hctx.lineTo(x1, y1);
      hctx.stroke();
    };

    // Draw seamless grid: 1 central medallion, 4 corner quarter-medallions, and connecting ribbons
    const half = W / 2;
    drawRibbon(0, 0, W, H);
    drawRibbon(W, 0, 0, H);
    drawRibbon(half, 0, W, half);
    drawRibbon(W, half, half, H);
    drawRibbon(half, H, 0, half);
    drawRibbon(0, half, half, 0);

    // Medallions at center and 4 corners
    const medRadius = W * 0.22;
    drawMedallion(half, half, medRadius);
    drawMedallion(0, 0, medRadius);
    drawMedallion(W, 0, medRadius);
    drawMedallion(0, H, medRadius);
    drawMedallion(W, H, medRadius);

    // Secondary intermediate fleurons at mid-edges
    const subRadius = W * 0.12;
    drawMedallion(half, 0, subRadius);
    drawMedallion(half, H, subRadius);
    drawMedallion(0, half, subRadius);
    drawMedallion(W, half, subRadius);
  });

  const carpetNormTex = createNormalMapFromHeight(heightCanvas, 2.4);

  // Helper to instantiate carpet material with custom tiling
  function getCarpetMaterial(uRepeat = 1, vRepeat = 1) {
    const diff = carpetDiffTex.clone();
    diff.needsUpdate = true;
    diff.repeat.set(uRepeat, vRepeat);

    const norm = carpetNormTex.clone();
    norm.needsUpdate = true;
    norm.repeat.set(uRepeat, vRepeat);

    return new THREE.MeshStandardMaterial({
      map: diff,
      normalMap: norm,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.86,
      metalness: 0.05,
      color: 0xffffff,
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Woven Gold & Garnet Jacquard Border (Galon d'encadrement de moquette)
  // Woven palmette braid in gold and deep crimson for runner edges and stair treads.
  // ---------------------------------------------------------------------------
  const borderHeightCanvas = document.createElement('canvas');
  borderHeightCanvas.width = 128;
  borderHeightCanvas.height = 256;
  const bhctx = borderHeightCanvas.getContext('2d');
  bhctx.fillStyle = '#808080';
  bhctx.fillRect(0, 0, 128, 256);

  const { tex: borderDiffTex } = createCanvasTexture(128, 256, (g, W, H) => {
    // Dark garnet ground with woven edge piping
    g.fillStyle = '#3a0610';
    g.fillRect(0, 0, W, H);

    // Outer dark piping
    g.fillStyle = '#1c0308';
    g.fillRect(0, 0, 8, H);
    g.fillRect(W - 8, 0, 8, H);

    // Golden braided band
    const bg = g.createLinearGradient(12, 0, W - 12, 0);
    bg.addColorStop(0, '#a5792d');
    bg.addColorStop(0.3, '#ecc877');
    bg.addColorStop(0.5, '#fff0be');
    bg.addColorStop(0.7, '#ecc877');
    bg.addColorStop(1, '#a5792d');
    g.fillStyle = bg;
    g.fillRect(12, 0, W - 24, H);

    bhctx.fillStyle = '#b8b8b8';
    bhctx.fillRect(12, 0, W - 24, H);

    // Repeating Greek fret / braided twist in center
    const step = H / 8;
    g.strokeStyle = '#480c16';
    g.lineWidth = 3.5;
    bhctx.strokeStyle = '#e0e0e0';
    bhctx.lineWidth = 3.5;

    for (let i = 0; i <= 8; i++) {
      const y = i * step;
      g.beginPath();
      g.moveTo(20, y);
      g.lineTo(W - 20, y + step * 0.5);
      g.lineTo(20, y + step);
      g.stroke();

      bhctx.beginPath();
      bhctx.moveTo(20, y);
      bhctx.lineTo(W - 20, y + step * 0.5);
      bhctx.lineTo(20, y + step);
      bhctx.stroke();

      // Golden center button
      g.fillStyle = '#fce498';
      g.beginPath();
      g.arc(W / 2, y + step * 0.5, 3.5, 0, Math.PI * 2);
      g.fill();

      bhctx.fillStyle = '#ffffff';
      bhctx.beginPath();
      bhctx.arc(W / 2, y + step * 0.5, 3.5, 0, Math.PI * 2);
      bhctx.fill();
    }
  });

  const borderNormTex = createNormalMapFromHeight(borderHeightCanvas, 2.5);

  function getBorderMaterial(uRepeat = 1, vRepeat = 1) {
    const diff = borderDiffTex.clone();
    diff.needsUpdate = true;
    diff.repeat.set(uRepeat, vRepeat);

    const norm = borderNormTex.clone();
    norm.needsUpdate = true;
    norm.repeat.set(uRepeat, vRepeat);

    return new THREE.MeshStandardMaterial({
      map: diff,
      normalMap: norm,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.82,
      metalness: 0.12,
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Polished Botticino & Griotte Marble Flooring (Petit Hall / Foyer)
  // Warm Italian ivory marble slabs with amber veins, dark Rosso Griotte perimeter
  // inlay band, subtle beveled tile joints, and satin specular reflection.
  // ---------------------------------------------------------------------------
  const marbleHCanvas = document.createElement('canvas');
  marbleHCanvas.width = marbleHCanvas.height = 512;
  const mhctx = marbleHCanvas.getContext('2d');
  mhctx.fillStyle = '#808080';
  mhctx.fillRect(0, 0, 512, 512);

  const { tex: marbleDiffTex } = createCanvasTexture(512, 512, (g, W, H) => {
    // Warm Botticino cream background with subtle natural variation
    const base = g.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, '#f2ece0');
    base.addColorStop(0.35, '#e9dfcc');
    base.addColorStop(0.7, '#f4eee4');
    base.addColorStop(1, '#e3d7c2');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);

    // Marble veins: multiple delicate organic passes
    const drawVein = (points, color, width, blur) => {
      g.save();
      g.strokeStyle = color;
      g.lineWidth = width;
      g.filter = `blur(${blur}px)`;
      g.beginPath();
      g.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        const [x0, y0] = points[i - 1], [x1, y1] = points[i];
        const mx = (x0 + x1) / 2 + (Math.sin(i * 1.7) * 16);
        const my = (y0 + y1) / 2 + (Math.cos(i * 2.1) * 16);
        g.quadraticCurveTo(mx, my, x1, y1);
      }
      g.stroke();
      g.restore();
    };

    // Soft warm grey & golden-amber veins
    drawVein([[0, 80], [140, 190], [280, 240], [420, 390], [512, 450]], 'rgba(164, 142, 118, 0.28)', 6.0, 3);
    drawVein([[0, 80], [140, 190], [280, 240], [420, 390], [512, 450]], 'rgba(128, 108, 88, 0.35)', 2.0, 0);

    drawVein([[120, 0], [210, 110], [330, 210], [480, 260], [512, 280]], 'rgba(182, 156, 126, 0.22)', 5.0, 2);
    drawVein([[120, 0], [210, 110], [330, 210], [480, 260], [512, 280]], 'rgba(142, 116, 88, 0.30)', 1.8, 0);

    drawVein([[0, 380], [110, 320], [240, 350], [380, 480], [410, 512]], 'rgba(152, 132, 110, 0.25)', 4.0, 2);
    drawVein([[0, 380], [110, 320], [240, 350], [380, 480], [410, 512]], 'rgba(118, 98, 78, 0.30)', 1.5, 0);

    // 4 large tile grid with beveled joints
    const tiles = 2, tw = W / tiles, th = H / tiles;
    g.strokeStyle = 'rgba(110, 92, 74, 0.45)';
    g.lineWidth = 2.0;
    mhctx.strokeStyle = '#404040'; // recessed grout
    mhctx.lineWidth = 3.0;

    for (let i = 0; i <= tiles; i++) {
      g.beginPath(); g.moveTo(i * tw, 0); g.lineTo(i * tw, H); g.stroke();
      g.beginPath(); g.moveTo(0, i * th); g.lineTo(W, i * th); g.stroke();

      mhctx.beginPath(); mhctx.moveTo(i * tw, 0); mhctx.lineTo(i * tw, H); mhctx.stroke();
      mhctx.beginPath(); mhctx.moveTo(0, i * th); mhctx.lineTo(W, i * th); mhctx.stroke();
    }
  });

  const marbleNormTex = createNormalMapFromHeight(marbleHCanvas, 1.6);

  function getFoyerMarbleMaterial(uRepeat = 2, vRepeat = 2) {
    const diff = marbleDiffTex.clone();
    diff.needsUpdate = true;
    diff.repeat.set(uRepeat, vRepeat);

    const norm = marbleNormTex.clone();
    norm.needsUpdate = true;
    norm.repeat.set(uRepeat, vRepeat);

    return new THREE.MeshStandardMaterial({
      map: diff,
      normalMap: norm,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.34,
      metalness: 0.08,
      envMapIntensity: 0.85,
    });
  }

  // ---------------------------------------------------------------------------
  // 4. Vintage Opera Bill / Poster Artworks (Palais Garnier & Grand Opéra)
  // Authentic Belle Époque typography and engravings in gilded molded frames.
  // ---------------------------------------------------------------------------
  function getOperaPosterTexture(operaTitle, composer, actInfo, seasonDate) {
    const { tex } = createCanvasTexture(512, 768, (g, W, H) => {
      // Aged parchment ground with subtle vignette
      const bg = g.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, W * 0.75);
      bg.addColorStop(0, '#f9f3e6');
      bg.addColorStop(0.75, '#eee2cb');
      bg.addColorStop(1, '#decab0');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      // Ornate double engraved borders
      g.strokeStyle = '#322319';
      g.lineWidth = 3.0;
      g.strokeRect(18, 18, W - 36, H - 36);

      g.strokeStyle = '#8a6534';
      g.lineWidth = 1.4;
      g.strokeRect(26, 26, W - 52, H - 52);

      // Corner rosettes
      const corner = (cx, cy) => {
        g.fillStyle = '#5c4122';
        g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#c89d4e';
        g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
      };
      corner(26, 26); corner(W - 26, 26); corner(26, H - 26); corner(W - 26, H - 26);

      // Header typography
      g.textAlign = 'center';
      g.fillStyle = '#4a321e';
      g.font = 'bold 22px Georgia, serif';
      g.fillText('ACADÉMIE NATIONALE DE MUSIQUE', W / 2, 70);

      g.fillStyle = '#8a6534';
      g.font = 'italic 18px Georgia, serif';
      g.fillText('— THÉÂTRE DU GRAND OPÉRA —', W / 2, 102);

      // Divider line with gold fleuron
      g.strokeStyle = '#9c7b48';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(W * 0.2, 122); g.lineTo(W * 0.8, 122);
      g.stroke();

      // Main Title
      g.fillStyle = '#22140d';
      g.font = 'bold 64px "Times New Roman", Georgia, serif';
      g.fillText(operaTitle, W / 2, 215);

      // Composer
      g.fillStyle = '#5c4028';
      g.font = 'italic 28px Georgia, serif';
      g.fillText(composer, W / 2, 265);

      // Act & libretto info
      g.fillStyle = '#422c1b';
      g.font = '20px Georgia, serif';
      g.fillText(actInfo, W / 2, 310);

      // Decorative central classical engraving medallion
      const cx = W / 2, cy = 460, r = 110;
      g.strokeStyle = '#5a3d24';
      g.lineWidth = 2.4;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();

      g.strokeStyle = '#c49b4c';
      g.lineWidth = 1.2;
      g.beginPath(); g.arc(cx, cy, r - 6, 0, Math.PI * 2); g.stroke();

      // Lyre / Muse motif in engraving
      g.fillStyle = 'rgba(74, 50, 30, 0.85)';
      g.font = '68px serif';
      g.fillText('𝄞', cx, cy + 24);

      // Bottom season info
      g.fillStyle = '#3a2516';
      g.font = 'bold 21px Georgia, serif';
      g.fillText(seasonDate, W / 2, 630);

      g.font = 'italic 16px Georgia, serif';
      g.fillStyle = '#6a4d30';
      g.fillText('Représentation de Gala · Orchestre & Chœurs du Grand Opéra', W / 2, 665);
      g.fillText('Direction de la Musique et de la Scène', W / 2, 695);
    });
    return tex;
  }

  return {
    carpetDiffTex,
    carpetNormTex,
    borderDiffTex,
    borderNormTex,
    marbleDiffTex,
    marbleNormTex,
    getCarpetMaterial,
    getBorderMaterial,
    getFoyerMarbleMaterial,
    getOperaPosterTexture,
  };
}
