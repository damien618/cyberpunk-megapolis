// level7Apartment.js — Interior building entrance, cyberpunk stairwell,
// upper hallway, and hyper-realistic cozy pink gamer apartment inside LEVEL 07.
import * as THREE from 'three';

export function buildLevel7Interior({ THREE, scene, world, bw, MAXANISO = 8, ctrl, input }) {
  const interiorGroup = new THREE.Group();
  scene.add(interiorGroup);

  // ---------------------------------------------------------------------------
  // Procedural Canvas Textures (PBR & Emissive)
  // ---------------------------------------------------------------------------
  function makeCanvas(w, h, draw) {
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = MAXANISO;
    tex.needsUpdate = true;
    return tex;
  }

  // Stable pseudo-random noise keeps the procedural materials identical after
  // every reload (important for visual comparisons and avoids texture shimmer).
  function seededNoise(seed = 1) {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function roundedBoxGeometry(width, height, depth, radius = 0.08, bevelSegments = 3) {
    const r = Math.min(radius, width / 2, height / 2);
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2 + r, -height / 2);
    shape.lineTo(width / 2 - r, -height / 2);
    shape.quadraticCurveTo(width / 2, -height / 2, width / 2, -height / 2 + r);
    shape.lineTo(width / 2, height / 2 - r);
    shape.quadraticCurveTo(width / 2, height / 2, width / 2 - r, height / 2);
    shape.lineTo(-width / 2 + r, height / 2);
    shape.quadraticCurveTo(-width / 2, height / 2, -width / 2, height / 2 - r);
    shape.lineTo(-width / 2, -height / 2 + r);
    shape.quadraticCurveTo(-width / 2, -height / 2, -width / 2 + r, -height / 2);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.01, depth - radius),
      bevelEnabled: true,
      bevelSize: radius * 0.48,
      bevelThickness: radius * 0.48,
      bevelSegments,
      curveSegments: 3,
    });
    geometry.center();
    geometry.computeVertexNormals();
    return geometry;
  }

  // 1. Neon sign: "未来の部屋" (Room of the Future) / "A BETTER ME TOMORROW"
  const neonKanjiTex = makeCanvas(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#0e0814';
    ctx.fillRect(0, 0, w, h);

    // Neon pink glow layers
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Kanji main line
    const kanji = '未来の部屋';
    ctx.font = 'bold 120px "Hiragino Sans", "PingFang SC", "Yu Gothic", sans-serif';

    // Outer deep glow
    ctx.shadowColor = '#ff1493';
    ctx.shadowBlur = 45;
    ctx.fillStyle = '#ff69b4';
    ctx.fillText(kanji, w / 2, h / 2 - 35);
    ctx.fillText(kanji, w / 2, h / 2 - 35);

    // Mid vibrant glow
    ctx.shadowColor = '#ff2a85';
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#ff80bf';
    ctx.fillText(kanji, w / 2, h / 2 - 35);

    // Core bright hot tube
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(kanji, w / 2, h / 2 - 35);

    // Subtitle English
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ff2a85';
    ctx.fillStyle = '#ffcce6';
    ctx.font = '600 36px "SF Pro Display", -apple-system, sans-serif';
    ctx.fillText('A  B E T T E R  M E  T O M O R R O W', w / 2, h / 2 + 75);

    // Subtle neon glass mounts
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 105, 180, 0.2)';
    ctx.fillRect(w / 2 - 380, h / 2 + 130, 760, 4);
  });

  // 2. Dual Gaming Monitor Wallpapers (Cyberpunk Rainy City & Tech HUD)
  const monitorNoise = seededNoise(42);
  const monitorWallpaperTex = makeCanvas(1024, 512, (ctx, w, h) => {
    // Left display: Cyberpunk City Skyline
    const g1 = ctx.createLinearGradient(0, 0, 0, h);
    g1.addColorStop(0, '#100826');
    g1.addColorStop(0.5, '#2e104d');
    g1.addColorStop(0.85, '#80185e');
    g1.addColorStop(1, '#ff3388');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, w / 2, h);

    // City skyscraper silhouettes on left screen
    ctx.fillStyle = '#090514';
    const towers = [
      [20, 180, 60], [90, 120, 80], [180, 80, 90], [280, 150, 70],
      [360, 100, 85], [455, 200, 50],
    ];
    for (const [tx, ty, tw] of towers) {
      ctx.fillRect(tx, ty, tw, h - ty);
      // Window lights
      ctx.fillStyle = '#ff80bf';
      for (let r = ty + 20; r < h - 20; r += 18) {
        for (let c = tx + 10; c < tx + tw - 10; c += 14) {
          if (monitorNoise() > 0.4) ctx.fillRect(c, r, 5, 8);
        }
      }
      ctx.fillStyle = '#090514';
    }

    // Neon billboards on towers
    ctx.fillStyle = '#00f7ff';
    ctx.fillRect(195, 130, 60, 20);
    ctx.fillStyle = '#ff00aa';
    ctx.fillRect(295, 190, 45, 15);

    // Right display: Streaming / Cyber Audio & Code HUD
    ctx.fillStyle = '#0d0b1a';
    ctx.fillRect(w / 2, 0, w / 2, h);

    // Purple header
    ctx.fillStyle = '#1e1438';
    ctx.fillRect(w / 2 + 15, 20, w / 2 - 30, 40);
    ctx.fillStyle = '#ff69b4';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('● CYBER_OS v4.2 // ONLINE', w / 2 + 35, 46);

    // Code lines / waveform
    ctx.fillStyle = '#00e5ff';
    for (let i = 0; i < 28; i++) {
      const bh = Math.sin(i * 0.4) * 60 + 80;
      ctx.fillRect(w / 2 + 40 + i * 15, h / 2 - bh / 2 + 40, 9, bh);
    }

    // Chat / Stream preview box
    ctx.fillStyle = '#17112b';
    ctx.fillRect(w / 2 + 30, h / 2 + 90, w / 2 - 60, 120);
    ctx.fillStyle = '#ff80bf';
    ctx.font = '16px monospace';
    ctx.fillText('> Good Games · Good Vibes · Chill Stream', w / 2 + 50, h / 2 + 130);
    ctx.fillStyle = '#9b87f5';
    ctx.fillText('> Neon City Night Ambient [384 kbps]', w / 2 + 50, h / 2 + 160);
  });

  // 3. Cute Bunny / Cat Plush Floor Rug (as in reference photo)
  const rugNoise = seededNoise(128);
  const plushRugTex = makeCanvas(1024, 1024, (ctx, w, h) => {
    // Cozy warm cream base
    ctx.fillStyle = '#f5ede8';
    ctx.fillRect(0, 0, w, h);

    // Subtle fur pile texture
    ctx.fillStyle = 'rgba(235, 215, 205, 0.45)';
    for (let i = 0; i < 1800; i++) {
      const rx = rugNoise() * w, ry = rugNoise() * h;
      ctx.fillRect(rx, ry, 3, 3);
    }

    // Big cute rounded bunny/cat silhouette
    ctx.strokeStyle = '#2d2226';
    ctx.lineWidth = 32;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    // Head & body contour
    ctx.arc(w / 2, h / 2 + 80, 290, 0.15 * Math.PI, 0.85 * Math.PI, false);

    // Left cheek & ear
    ctx.lineTo(w / 2 - 270, h / 2 - 40);
    ctx.quadraticCurveTo(w / 2 - 290, h / 2 - 220, w / 2 - 190, h / 2 - 340);
    ctx.quadraticCurveTo(w / 2 - 120, h / 2 - 320, w / 2 - 110, h / 2 - 180);

    // Forehead curve
    ctx.quadraticCurveTo(w / 2, h / 2 - 160, w / 2 + 110, h / 2 - 180);

    // Right ear
    ctx.quadraticCurveTo(w / 2 + 120, h / 2 - 320, w / 2 + 190, h / 2 - 340);
    ctx.quadraticCurveTo(w / 2 + 290, h / 2 - 220, w / 2 + 270, h / 2 - 40);
    ctx.stroke();

    // Cute eyes & sweet expression
    ctx.fillStyle = '#2d2226';
    ctx.beginPath();
    ctx.ellipse(w / 2 - 95, h / 2 + 10, 22, 28, 0, 0, Math.PI * 2);
    ctx.ellipse(w / 2 + 95, h / 2 + 10, 22, 28, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nose & mouth
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2 + 55, 14, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Soft blush cheeks
    ctx.fillStyle = 'rgba(255, 150, 180, 0.55)';
    ctx.beginPath();
    ctx.ellipse(w / 2 - 160, h / 2 + 65, 36, 22, 0, 0, Math.PI * 2);
    ctx.ellipse(w / 2 + 160, h / 2 + 65, 36, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // 4. Framed Poster (Bed): "NIGHT // BIGGER DREAMS"
  const bedPosterTex = makeCanvas(512, 768, (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0d0718');
    bg.addColorStop(0.6, '#3a1152');
    bg.addColorStop(1, '#ff2a85');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Cyber alley architecture
    ctx.fillStyle = '#06030a';
    ctx.fillRect(40, 220, 140, h - 220);
    ctx.fillRect(w - 180, 160, 140, h - 160);

    // Neon signs in alley
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(150, 280, 24, 180);
    ctx.fillStyle = '#ff00aa';
    ctx.fillRect(w - 170, 220, 20, 140);

    // Typography
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 48px "Impact", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('NIGHT', 50, 90);
    ctx.fillStyle = '#ff77aa';
    ctx.fillText('BIGGER', 50, 140);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('DREAMS', 50, 190);
  });

  // 5. Framed Poster (Desk): "GOOD PEOPLE · GOOD GAMES · GOOD LIFE"
  const deskPosterTex = makeCanvas(512, 768, (ctx, w, h) => {
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, w, h);

    // Inner thin border
    ctx.strokeStyle = '#212529';
    ctx.lineWidth = 6;
    ctx.strokeRect(30, 30, w - 60, h - 60);

    // Minimalist stylish typography
    ctx.fillStyle = '#1a1a1a';
    ctx.textAlign = 'center';
    ctx.font = '800 44px "SF Pro Display", -apple-system, sans-serif';
    ctx.fillText('GOOD', w / 2, 210);
    ctx.fillText('PEOPLE', w / 2, 260);

    ctx.fillStyle = '#ff2a85';
    ctx.fillText('GOOD', w / 2, 360);
    ctx.fillText('GAMES', w / 2, 410);

    ctx.fillStyle = '#1a1a1a';
    ctx.fillText('GOOD', w / 2, 510);
    ctx.fillText('LIFE', w / 2, 560);

    // Small heart
    ctx.fillStyle = '#ff2a85';
    ctx.font = '32px sans-serif';
    ctx.fillText('♥', w / 2, 630);
  });

  // 6. Pegboard with gamepads and cables
  const pegboardTex = makeCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#ededed';
    ctx.fillRect(0, 0, w, h);

    // Perforated hole grid
    ctx.fillStyle = '#bbbbbb';
    for (let x = 20; x < w; x += 28) {
      for (let y = 20; y < h; y += 28) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Mounted white game controller 1
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(80, 100, 150, 100, 20);
    ctx.fill();
    ctx.stroke();

    // Thumbsticks & buttons
    ctx.fillStyle = '#ff69b4';
    ctx.beginPath();
    ctx.arc(120, 150, 14, 0, Math.PI * 2);
    ctx.arc(190, 150, 14, 0, Math.PI * 2);
    ctx.fill();

    // Mounted black game controller 2
    ctx.fillStyle = '#222222';
    ctx.beginPath();
    ctx.roundRect(280, 100, 150, 100, 20);
    ctx.fill();
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.arc(320, 150, 14, 0, Math.PI * 2);
    ctx.arc(390, 150, 14, 0, Math.PI * 2);
    ctx.fill();

    // Coiled braided cables hanging below
    ctx.strokeStyle = '#ff3388';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(150, 240);
    ctx.bezierCurveTo(120, 320, 180, 380, 150, 440);
    ctx.stroke();

    ctx.strokeStyle = '#00ffff';
    ctx.beginPath();
    ctx.moveTo(350, 240);
    ctx.bezierCurveTo(380, 320, 320, 380, 360, 440);
    ctx.stroke();
  });

  // 7. Mechanical Keyboard Texture
  const keyboardTex = makeCanvas(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f8f8fa';
    ctx.fillRect(0, 0, w, h);

    // Baseplate border
    ctx.strokeStyle = '#ff69b4';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    // Keycaps with pastel pink and white accents
    const rows = 5, cols = 15;
    const kw = (w - 40) / cols, kh = (h - 40) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isPink = (r === 0 || c === 0 || c === cols - 1 || (r === 4 && c > 4 && c < 10));
        ctx.fillStyle = isPink ? '#ff80bf' : '#ffffff';
        ctx.strokeStyle = '#e0d0d8';
        ctx.lineWidth = 2;
        ctx.fillRect(20 + c * kw + 2, 20 + r * kh + 2, kw - 4, kh - 4);
        ctx.strokeRect(20 + c * kw + 2, 20 + r * kh + 2, kw - 4, kh - 4);
      }
    }
  });

  // 8. Gamer PC Front Fans (3 Circular RGB Rings)
  const pcFrontTex = makeCanvas(256, 768, (ctx, w, h) => {
    ctx.fillStyle = '#08080a';
    ctx.fillRect(0, 0, w, h);

    // Mesh texture dots
    ctx.fillStyle = '#141418';
    for (let x = 8; x < w; x += 10) {
      for (let y = 8; y < h; y += 10) {
        ctx.fillRect(x, y, 4, 4);
      }
    }

    // 3 Glowing circular fans
    const fanYs = [h * 0.22, h * 0.5, h * 0.78];
    const rad = 70;
    for (let i = 0; i < fanYs.length; i++) {
      const fy = fanYs[i];
      const g = ctx.createLinearGradient(w / 2 - rad, fy - rad, w / 2 + rad, fy + rad);
      g.addColorStop(0, '#00ffff');
      g.addColorStop(0.5, '#ff00aa');
      g.addColorStop(1, '#ff3388');

      // Outer glowing ring
      ctx.strokeStyle = g;
      ctx.lineWidth = 14;
      ctx.shadowColor = '#ff2a85';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(w / 2, fy, rad, 0, Math.PI * 2);
      ctx.stroke();

      // Inner hub
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#181822';
      ctx.beginPath();
      ctx.arc(w / 2, fy, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(w / 2, fy, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // 9. Building Entrance Sign: "LEVEL 07 // RESIDENCES"
  const entranceSignTex = makeCanvas(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = '#121318';
    ctx.fillRect(0, 0, w, h);

    // Cyan border glow
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 8;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 24;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    // Main header
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 76px "SF Pro Display", sans-serif';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 16;
    ctx.fillText('LEVEL 07', w / 2, h / 2 - 32);

    // Subtitle
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 36px monospace';
    ctx.shadowBlur = 12;
    ctx.fillText('RESIDENCES // SUITES 701-708', w / 2, h / 2 + 45);
  });

  // 10. Door Number Plaque Maker
  function makeDoorPlateTex(num, label, isOpen = false) {
    return makeCanvas(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#16171d';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = isOpen ? '#ff2a85' : '#444c56';
      ctx.lineWidth = 6;
      ctx.strokeRect(8, 8, w - 16, h - 16);

      // Room number
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isOpen ? '#ffffff' : '#b0b8c0';
      ctx.font = '900 96px "SF Pro Display", sans-serif';
      if (isOpen) {
        ctx.shadowColor = '#ff2a85';
        ctx.shadowBlur = 20;
      }
      ctx.fillText(num, w / 2, h / 2 - 25);

      // Status indicator
      ctx.shadowBlur = 0;
      ctx.font = '600 28px monospace';
      ctx.fillStyle = isOpen ? '#ff69b4' : '#ff3344';
      ctx.fillText(label, w / 2, h / 2 + 55);
    });
  }

  // 11. Top Landing Directional Sign: "◄ RESIDENCES // SUITES 701-704"
  const landingSignTex = makeCanvas(1024, 384, (ctx, w, h) => {
    ctx.fillStyle = '#0e1017';
    ctx.fillRect(0, 0, w, h);

    // Glowing cyan double frame
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 8;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 24;
    ctx.strokeRect(12, 12, w - 24, h - 24);

    // Arrow in bright magenta
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff2a85';
    ctx.font = '900 100px "SF Pro Display", sans-serif';
    ctx.shadowColor = '#ff2a85';
    ctx.shadowBlur = 22;
    ctx.fillText('◄', 45, h / 2 - 25);

    // Main header
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 70px "SF Pro Display", sans-serif';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 18;
    ctx.fillText('RESIDENCES', 150, h / 2 - 25);

    // Subtitle
    ctx.fillStyle = '#00e5ff';
    ctx.font = 'bold 36px monospace';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 14;
    ctx.fillText('SUITES 701 - 704  //  LEVEL 01', 152, h / 2 + 52);
  });

  // 12. Apartment finishes: warm plaster, woven fabric and satin stone tile.
  const wallNoise = seededNoise(704);
  const apartmentWallTex = makeCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#d9d2cf';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 7200; i++) {
      const v = 195 + Math.floor(wallNoise() * 48);
      ctx.fillStyle = `rgba(${v},${v - 5},${v - 8},${0.035 + wallNoise() * 0.055})`;
      const s = 0.6 + wallNoise() * 1.5;
      ctx.fillRect(wallNoise() * w, wallNoise() * h, s, s);
    }
  });
  apartmentWallTex.wrapS = apartmentWallTex.wrapT = THREE.RepeatWrapping;
  apartmentWallTex.repeat.set(3, 3);

  const fabricNoise = seededNoise(1402);
  const pinkFabricTex = makeCanvas(512, 512, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, '#d97796');
    gradient.addColorStop(0.52, '#e58ba7');
    gradient.addColorStop(1, '#bd657f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 900; i++) {
      const x = fabricNoise() * w;
      ctx.strokeStyle = fabricNoise() > 0.5 ? 'rgba(255,225,232,.10)' : 'rgba(80,25,45,.08)';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (fabricNoise() - 0.5) * 14, h);
      ctx.stroke();
    }
    // Broad, soft folds remain readable even at a few metres distance.
    for (let x = -30; x < w + 30; x += 64) {
      const fold = ctx.createLinearGradient(x, 0, x + 52, 0);
      fold.addColorStop(0, 'rgba(70,18,35,.16)');
      fold.addColorStop(0.48, 'rgba(255,238,242,.12)');
      fold.addColorStop(1, 'rgba(70,18,35,.12)');
      ctx.fillStyle = fold;
      ctx.fillRect(x, 0, 52, h);
    }
  });
  pinkFabricTex.wrapS = pinkFabricTex.wrapT = THREE.RepeatWrapping;
  pinkFabricTex.repeat.set(3, 4);

  const floorNoise = seededNoise(2104);
  const floorTileTex = makeCanvas(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#252229';
    ctx.fillRect(0, 0, w, h);
    const tile = w / 2;
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
      const x0 = tx * tile, y0 = ty * tile;
      const base = 31 + Math.floor(floorNoise() * 12);
      ctx.fillStyle = `rgb(${base + 7},${base + 3},${base + 9})`;
      ctx.fillRect(x0 + 7, y0 + 7, tile - 14, tile - 14);
      for (let i = 0; i < 180; i++) {
        const alpha = 0.018 + floorNoise() * 0.03;
        ctx.strokeStyle = `rgba(235,205,220,${alpha})`;
        ctx.lineWidth = 0.5 + floorNoise() * 1.7;
        ctx.beginPath();
        const px = x0 + floorNoise() * tile;
        const py = y0 + floorNoise() * tile;
        ctx.moveTo(px, py);
        ctx.bezierCurveTo(px + 45, py - 18, px + 95, py + 24, px + 145, py + 3);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = '#111015';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(tile, 0); ctx.lineTo(tile, h);
    ctx.moveTo(0, tile); ctx.lineTo(w, tile);
    ctx.stroke();
  });
  floorTileTex.wrapS = floorTileTex.wrapT = THREE.RepeatWrapping;
  floorTileTex.repeat.set(2.5, 2.2);

  // ---------------------------------------------------------------------------
  // Materials Library
  // ---------------------------------------------------------------------------
  const M = {
    darkMetal: new THREE.MeshStandardMaterial({
      color: 0x22242a, roughness: 0.35, metalness: 0.85,
    }),
    cyberGunmetal: new THREE.MeshStandardMaterial({
      color: 0x181a20, roughness: 0.45, metalness: 0.9,
    }),
    wallPanels: new THREE.MeshStandardMaterial({
      color: 0x2d2b33, roughness: 0.65, metalness: 0.15,
    }),
    ceilingMat: new THREE.MeshStandardMaterial({
      color: 0x24222a, roughness: 0.7, metalness: 0.1,
    }),
    apartmentWall: new THREE.MeshStandardMaterial({
      map: apartmentWallTex, color: 0xf0e8e5, roughness: 0.92, metalness: 0.0,
    }),
    apartmentCeiling: new THREE.MeshStandardMaterial({
      color: 0xeee5e2, roughness: 0.95, metalness: 0.0,
    }),
    corridorFloor: new THREE.MeshStandardMaterial({
      color: 0x191a22, roughness: 0.5, metalness: 0.4,
    }),
    aptFloor: new THREE.MeshStandardMaterial({
      map: floorTileTex, color: 0xffffff, roughness: 0.28, metalness: 0.25,
    }),
    windowGlass: new THREE.MeshPhysicalMaterial({
      color: 0x7799aa, transparent: true, opacity: 0.22,
      roughness: 0.05, transmission: 0.95, thickness: 0.1,
    }),
    neonPink: new THREE.MeshStandardMaterial({
      color: 0xff4088, emissive: new THREE.Color(0xff1493), emissiveIntensity: 2.2,
      roughness: 0.2, metalness: 0.1,
    }),
    neonCyan: new THREE.MeshStandardMaterial({
      color: 0x00ffff, emissive: new THREE.Color(0x00e5ff), emissiveIntensity: 2.2,
      roughness: 0.2, metalness: 0.1,
    }),
    neonAmber: new THREE.MeshStandardMaterial({
      color: 0xffa500, emissive: new THREE.Color(0xff8c00), emissiveIntensity: 2.0,
      roughness: 0.2, metalness: 0.1,
    }),
    neonRed: new THREE.MeshStandardMaterial({
      color: 0xff1122, emissive: new THREE.Color(0xff0022), emissiveIntensity: 2.5,
      roughness: 0.2, metalness: 0.1,
    }),
    warmWhiteGlow: new THREE.MeshStandardMaterial({
      color: 0xfff0dd, emissive: new THREE.Color(0xffe4b5), emissiveIntensity: 1.8,
      roughness: 0.3, metalness: 0.1,
    }),
    whiteDesk: new THREE.MeshStandardMaterial({
      color: 0xe8e3e3, roughness: 0.38, metalness: 0.04,
    }),
    whiteLacquer: new THREE.MeshPhysicalMaterial({
      color: 0xeee9e9, roughness: 0.28, metalness: 0.02,
      clearcoat: 0.35, clearcoatRoughness: 0.42,
    }),
    pinkDuvet: new THREE.MeshStandardMaterial({
      map: pinkFabricTex, color: 0xffd1dd, roughness: 0.96, metalness: 0.0,
    }),
    whitePillow: new THREE.MeshStandardMaterial({
      color: 0xf1e5e4, roughness: 0.94, metalness: 0.0,
    }),
    pinkAccent: new THREE.MeshStandardMaterial({
      color: 0xc86e8c, roughness: 0.72, metalness: 0.0,
    }),
    drawerGap: new THREE.MeshStandardMaterial({
      color: 0x7d7378, roughness: 0.55, metalness: 0.25,
    }),
    plantFoliage: new THREE.MeshStandardMaterial({
      color: 0x228833, roughness: 0.6, metalness: 0.05,
    }),
    plantPot: new THREE.MeshStandardMaterial({
      color: 0xe0e0e0, roughness: 0.4, metalness: 0.1,
    }),
    posterBorder: new THREE.MeshStandardMaterial({
      color: 0x111111, roughness: 0.2, metalness: 0.8,
    }),
  };

  // Helper function to build solid boxes (Mesh + physical AABB)
  function createBox(x0, x1, y0, y1, z0, z1, material, {
    collide = true, prop = true, groundOnly = false, isGround = false,
  } = {}) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (isGround) {
      // Direct child of world so groundRayHit will cast down onto it
      world.add(mesh);
    } else {
      interiorGroup.add(mesh);
    }

    if (collide) {
      bw.add({
        x0, x1, y0, y1, z0, z1,
        collide: true,
        prop: (isGround || groundOnly) ? false : prop,
        groundOnly: groundOnly || isGround,
        camBlock: !groundOnly && !isGround,
        tall: h > 9,
      });
    }
    return mesh;
  }

  // ---------------------------------------------------------------------------
  // 1. Ground Floor Entrance (Level 07 Portal at z = 6.8, x ≈ -48.0)
  // ---------------------------------------------------------------------------
  // The entrance sits directly below "LEVEL 07" stencil & industrial canopy
  const ENT_X = -48.0;
  const ENT_Z = 6.85;

  // Door Portal Surround (Cyberpunk Frame)
  createBox(ENT_X - 1.4, ENT_X - 0.9, 0.0, 2.7, ENT_Z - 0.15, ENT_Z + 0.15, M.cyberGunmetal);
  createBox(ENT_X + 0.9, ENT_X + 1.4, 0.0, 2.7, ENT_Z - 0.15, ENT_Z + 0.15, M.cyberGunmetal);
  createBox(ENT_X - 1.4, ENT_X + 1.4, 2.4, 2.7, ENT_Z - 0.15, ENT_Z + 0.15, M.cyberGunmetal);

  // Cyan Neon Perimeter Trims around entrance
  createBox(ENT_X - 0.95, ENT_X - 0.9, 0.0, 2.45, ENT_Z - 0.18, ENT_Z - 0.13, M.neonCyan, { collide: false });
  createBox(ENT_X + 0.9, ENT_X + 0.95, 0.0, 2.45, ENT_Z - 0.18, ENT_Z - 0.13, M.neonCyan, { collide: false });
  createBox(ENT_X - 0.95, ENT_X + 0.95, 2.4, 2.45, ENT_Z - 0.18, ENT_Z - 0.13, M.neonCyan, { collide: false });

  // Backlit Entrance Sign
  const signMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.65),
    new THREE.MeshStandardMaterial({
      map: entranceSignTex, emissive: new THREE.Color(0x00e5ff), emissiveIntensity: 0.9,
      roughness: 0.2,
    }),
  );
  signMesh.position.set(ENT_X, 3.1, ENT_Z - 0.16);
  signMesh.rotation.y = Math.PI;
  interiorGroup.add(signMesh);

  // Keypad & Scanner Terminal
  const keypad = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.35, 0.06),
    new THREE.MeshStandardMaterial({
      color: 0x111111, emissive: new THREE.Color(0x00e5ff), emissiveIntensity: 0.6,
    }),
  );
  keypad.position.set(ENT_X + 1.15, 1.35, ENT_Z - 0.16);
  interiorGroup.add(keypad);

  // Ground Floor Lobby Floor (Walkable, y = 0.02)
  createBox(ENT_X - 1.8, ENT_X + 1.8, -0.05, 0.02, ENT_Z - 0.4, 9.20, M.corridorFloor, { isGround: true });

  // Ground Floor Lobby Side Walls
  createBox(ENT_X - 1.8, ENT_X - 1.4, 0.0, 4.22, ENT_Z, 9.20, M.wallPanels);
  createBox(ENT_X + 1.4, ENT_X + 1.8, 0.0, 4.22, ENT_Z, 9.20, M.wallPanels);

  // Entrance Floor Mat (rubber scraper mat)
  const matMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.85 }),
  );
  matMesh.position.set(ENT_X, 0.025, ENT_Z + 0.8);
  matMesh.rotation.x = -Math.PI / 2;
  interiorGroup.add(matMesh);

  // Entrance Ceiling Light
  const entLight = new THREE.PointLight(0x00e5ff, 1.4, 6);
  entLight.position.set(ENT_X, 2.3, ENT_Z + 1.0);
  interiorGroup.add(entLight);

  // ---------------------------------------------------------------------------
  // 2. Cyberpunk Stairwell (Ascending y: 0.02 -> 4.22)
  // ---------------------------------------------------------------------------
  const STAIR_Z_START = 9.20;
  const STAIR_STEPS = 21;
  const STAIR_RISE = 4.20 / STAIR_STEPS; // 0.20 m per step
  const STAIR_TREAD = 0.24; // 0.24 m run
  const STAIR_X0 = -49.5;
  const STAIR_X1 = -46.5;
  const STAIR_Z_END = STAIR_Z_START + STAIR_STEPS * STAIR_TREAD; // 14.24 m

  // Stairwell Shaft Enclosure Walls
  // Right wall (+X): solid wall running all the way to back wall at 15.95
  createBox(STAIR_X1, STAIR_X1 + 0.35, 0.0, 7.20, STAIR_Z_START - 0.2, 15.95, M.wallPanels);
  // Left wall (-X): only encloses BELOW the stairs up to STAIR_Z_END (14.24) and height 4.22
  // Above 4.22 and beyond STAIR_Z_END, this area is 100% OPEN for the corridor entrance!
  createBox(STAIR_X0 - 0.35, STAIR_X0, 0.0, 4.22, STAIR_Z_START - 0.2, STAIR_Z_END, M.wallPanels);

  // Concrete step solid supporting wedge + Treads
  for (let i = 0; i < STAIR_STEPS; i++) {
    const sz0 = STAIR_Z_START + i * STAIR_TREAD;
    const sz1 = sz0 + STAIR_TREAD;
    const sy0 = -0.1;
    const sy1 = 0.02 + (i + 1) * STAIR_RISE;

    // Metal step tread (groundOnly so player walks smoothly without horizontal capsule catching)
    createBox(STAIR_X0, STAIR_X1, sy1 - STAIR_RISE, sy1, sz0, sz1, M.cyberGunmetal, {
      collide: true, prop: false, groundOnly: true, isGround: true,
    });

    // Neon edge strip along step nosing
    const isAmber = (i % 5 === 0);
    const stripMat = isAmber ? M.neonAmber : M.neonCyan;
    createBox(STAIR_X0 + 0.05, STAIR_X1 - 0.05, sy1 - 0.02, sy1 + 0.005, sz0 - 0.01, sz0 + 0.02, stripMat, {
      collide: false,
    });
  }

  // Staircase Industrial Railing
  // Right side railing (full ascent)
  for (let p = 0; p <= STAIR_STEPS; p += 4) {
    const pz = STAIR_Z_START + p * STAIR_TREAD;
    const py = 0.02 + p * STAIR_RISE;
    createBox(STAIR_X1 - 0.15, STAIR_X1 - 0.09, py, py + 0.95, pz - 0.03, pz + 0.03, M.darkMetal);
  }
  // Left side railing: stops at step 18 (z ≈ 13.52) so the landing turn into the corridor is completely unobstructed!
  for (let p = 0; p <= STAIR_STEPS - 3; p += 4) {
    const pz = STAIR_Z_START + p * STAIR_TREAD;
    const py = 0.02 + p * STAIR_RISE;
    createBox(STAIR_X0 + 0.09, STAIR_X0 + 0.15, py, py + 0.95, pz - 0.03, pz + 0.03, M.darkMetal);
  }

  // Atmospheric Stair Lights
  const stairLight1 = new THREE.PointLight(0x00ffff, 1.2, 7);
  stairLight1.position.set(ENT_X, 1.8, STAIR_Z_START + 1.8);
  interiorGroup.add(stairLight1);

  const stairLight2 = new THREE.PointLight(0xffaa22, 1.4, 7);
  stairLight2.position.set(ENT_X, 3.4, STAIR_Z_START + 3.6);
  interiorGroup.add(stairLight2);

  // Top Stair Landing (y = 4.22)
  const LANDING_Z0 = STAIR_Z_END; // 14.24
  const LANDING_Z1 = 15.95; // 1.71 m deep landing
  createBox(STAIR_X0 - 0.35, STAIR_X1 + 0.35, 4.10, 4.22, LANDING_Z0, LANDING_Z1, M.corridorFloor, {
    isGround: true,
  });

  // Solid North end wall behind top landing (prevents walking forward into void!)
  createBox(STAIR_X0 - 0.35, STAIR_X1 + 0.35, 4.22, 7.20, LANDING_Z1, LANDING_Z1 + 0.25, M.wallPanels);

  // Illuminated Landing Directional Sign ("◄ RESIDENCES // SUITES 701-704")
  const landingSignMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.9),
    new THREE.MeshStandardMaterial({
      map: landingSignTex,
      emissive: new THREE.Color(0x00e5ff),
      emissiveIntensity: 1.6,
      roughness: 0.2,
    }),
  );
  landingSignMesh.position.set((STAIR_X0 + STAIR_X1) / 2, 5.75, LANDING_Z1 - 0.02);
  interiorGroup.add(landingSignMesh);

  // Ceiling beam above corridor entrance archway (y = 6.70 to 7.20)
  createBox(STAIR_X0 - 0.35, STAIR_X0, 6.70, 7.20, LANDING_Z0, LANDING_Z1, M.cyberGunmetal);
  createBox(STAIR_X0 - 0.30, STAIR_X0, 6.67, 6.70, LANDING_Z0, LANDING_Z1, M.neonCyan, { collide: false });

  // Top Landing Ambient Light
  const landingLight = new THREE.PointLight(0x00ffff, 1.5, 6.5);
  landingLight.position.set((STAIR_X0 + STAIR_X1) / 2, 6.0, (LANDING_Z0 + LANDING_Z1) / 2);
  interiorGroup.add(landingLight);

  // ---------------------------------------------------------------------------
  // 3. 1st Floor Hallway / Corridor (y = 4.22 to 7.02)
  // ---------------------------------------------------------------------------
  // Corridor extends from top landing towards -X:
  const CORR_X_START = STAIR_X0; // -49.5
  const CORR_X_END = -56.8; // 7.3 m long hallway
  const CORR_Z0 = LANDING_Z0; // 14.24
  const CORR_Z1 = LANDING_Z1; // 15.95

  // Corridor Floor
  createBox(CORR_X_END - 0.35, CORR_X_START, 4.10, 4.22, CORR_Z0, CORR_Z1, M.corridorFloor, {
    isGround: true,
  });

  // Corridor Ceiling
  createBox(CORR_X_END - 0.35, STAIR_X1 + 0.35, 7.02, 7.30, CORR_Z0, CORR_Z1, M.ceilingMat);

  // Corridor North Wall (along z = CORR_Z1)
  createBox(CORR_X_END - 0.35, CORR_X_START, 4.22, 7.02, CORR_Z1, CORR_Z1 + 0.25, M.wallPanels);

  // Closed Door 702 on North wall
  const door702 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.2), M.cyberGunmetal);
  door702.position.set(-55.2, 5.32, CORR_Z1 - 0.01);
  door702.rotation.y = Math.PI;
  interiorGroup.add(door702);
  const plate702 = new THREE.Mesh(
    new THREE.PlaneGeometry(0.35, 0.18),
    new THREE.MeshBasicMaterial({ map: makeDoorPlateTex('702', 'LOCKED', false) }),
  );
  plate702.position.set(-55.2, 5.8, CORR_Z1 - 0.02);
  plate702.rotation.y = Math.PI;
  interiorGroup.add(plate702);

  // Corridor West End Wall
  createBox(CORR_X_END - 0.25, CORR_X_END, 4.22, 7.02, CORR_Z0, CORR_Z1, M.wallPanels);
  const door703 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.2), M.cyberGunmetal);
  door703.position.set(CORR_X_END + 0.01, 5.32, (CORR_Z0 + CORR_Z1) / 2);
  door703.rotation.y = Math.PI / 2;
  interiorGroup.add(door703);
  const plate703 = new THREE.Mesh(
    new THREE.PlaneGeometry(0.35, 0.18),
    new THREE.MeshBasicMaterial({ map: makeDoorPlateTex('703', 'UTILITY', false) }),
  );
  plate703.position.set(CORR_X_END + 0.02, 5.8, (CORR_Z0 + CORR_Z1) / 2);
  plate703.rotation.y = Math.PI / 2;
  interiorGroup.add(plate703);

  // Corridor South Wall (separating corridor from apartments)
  // Closed Door 701 section
  createBox(-53.2, CORR_X_START, 4.22, 7.02, CORR_Z0 - 0.25, CORR_Z0, M.wallPanels);
  const door701 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.2), M.cyberGunmetal);
  door701.position.set(-51.2, 5.32, CORR_Z0 + 0.01);
  interiorGroup.add(door701);
  const plate701 = new THREE.Mesh(
    new THREE.PlaneGeometry(0.35, 0.18),
    new THREE.MeshBasicMaterial({ map: makeDoorPlateTex('701', 'LOCKED', false) }),
  );
  plate701.position.set(-51.2, 5.8, CORR_Z0 + 0.02);
  interiorGroup.add(plate701);

  // ---------------------------------------------------------------------------
  // 4. Door 704: Player's Apartment Entrance (Open Door!)
  // ---------------------------------------------------------------------------
  // Doorway opening spans X: [-54.6, -53.2] (width 1.4 m, height 2.4 m)
  const DOOR_X0 = -54.6;
  const DOOR_X1 = -53.2;

  // Wall segment west of Door 704
  createBox(CORR_X_END, DOOR_X0, 4.22, 7.02, CORR_Z0 - 0.25, CORR_Z0, M.wallPanels);

  // Lintel above Door 704
  createBox(DOOR_X0, DOOR_X1, 6.52, 7.02, CORR_Z0 - 0.25, CORR_Z0, M.wallPanels);

  // Open Door Leaf (Swung inward into apartment, welcoming the player)
  const openDoorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 2.2, 1.1),
    M.cyberGunmetal,
  );
  openDoorMesh.position.set(DOOR_X1 - 0.15, 5.32, CORR_Z0 - 0.55);
  openDoorMesh.rotation.y = -0.4;
  interiorGroup.add(openDoorMesh);

  // Illuminated Door Plate 704 on right jamb
  const plate704 = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.22),
    new THREE.MeshStandardMaterial({
      map: makeDoorPlateTex('704', 'RESIDENT', true),
      emissive: new THREE.Color(0xff2a85),
      emissiveIntensity: 1.8,
    }),
  );
  plate704.position.set(DOOR_X1 + 0.25, 5.8, CORR_Z0 + 0.02);
  interiorGroup.add(plate704);

  // Warm Pink & Amber light spilling into hallway from Door 704
  const spillLight = new THREE.PointLight(0xff3388, 2.2, 7.5);
  spillLight.position.set((DOOR_X0 + DOOR_X1) / 2, 5.5, CORR_Z0 + 0.5);
  interiorGroup.add(spillLight);

  // Linear Corridor Ceiling Light Strip
  createBox(CORR_X_END + 0.4, CORR_X_START - 0.4, 6.99, 7.02, (CORR_Z0 + CORR_Z1) / 2 - 0.04, (CORR_Z0 + CORR_Z1) / 2 + 0.04, M.warmWhiteGlow, {
    collide: false,
  });
  const corrLight = new THREE.PointLight(0xfff0dd, 1.2, 8);
  corrLight.position.set(-53.0, 6.2, (CORR_Z0 + CORR_Z1) / 2);
  interiorGroup.add(corrLight);

  // ---------------------------------------------------------------------------
  // 5. Player's Apartment (Suite 704)
  // ---------------------------------------------------------------------------
  // Room dimensions:
  const APT_X0 = -59.2;
  const APT_X1 = -51.2;
  const APT_Z0 = 7.10; // Exterior facade side
  const APT_Z1 = CORR_Z0 - 0.25; // ~13.99
  const APT_FLOOR_Y = 4.22;
  const APT_CEIL_Y = 7.02;

  // Apartment Floor (Walkable, raycastable PBR tiles)
  createBox(APT_X0, APT_X1, APT_FLOOR_Y - 0.15, APT_FLOOR_Y, APT_Z0, APT_Z1, M.aptFloor, {
    isGround: true,
  });

  // Apartment Ceiling
  createBox(APT_X0, APT_X1, APT_CEIL_Y, APT_CEIL_Y + 0.25, APT_Z0, APT_Z1, M.apartmentCeiling);

  // Left Wall (West Wall: x = APT_X0)
  createBox(APT_X0 - 0.35, APT_X0, APT_FLOOR_Y, APT_CEIL_Y, APT_Z0, APT_Z1, M.apartmentWall);

  // Right Wall (East Wall: x = APT_X1)
  createBox(APT_X1, APT_X1 + 0.35, APT_FLOOR_Y, APT_CEIL_Y, APT_Z0, APT_Z1, M.apartmentWall);

  // ---------------------------------------------------------------------------
  // 6. Large Panoramic Window (Overlooking Exterior City & Street)
  // ---------------------------------------------------------------------------
  const WIN_X0 = -58.2;
  const WIN_X1 = -52.2;
  const WIN_Z = APT_Z0;
  const SILL_Y = APT_FLOOR_Y + 0.42;
  const LINTEL_Y = APT_CEIL_Y - 0.15;

  // Wall around window
  createBox(APT_X0, WIN_X0, APT_FLOOR_Y, APT_CEIL_Y, WIN_Z - 0.2, WIN_Z + 0.1, M.apartmentWall);
  createBox(WIN_X1, APT_X1, APT_FLOOR_Y, APT_CEIL_Y, WIN_Z - 0.2, WIN_Z + 0.1, M.apartmentWall);
  createBox(WIN_X0, WIN_X1, APT_FLOOR_Y, SILL_Y, WIN_Z - 0.2, WIN_Z + 0.1, M.apartmentWall);
  createBox(WIN_X0, WIN_X1, LINTEL_Y, APT_CEIL_Y, WIN_Z - 0.2, WIN_Z + 0.1, M.apartmentWall);

  // Window Sill Ledge (wooden/metallic shelf)
  createBox(WIN_X0 - 0.05, WIN_X1 + 0.05, SILL_Y - 0.04, SILL_Y, WIN_Z - 0.1, WIN_Z + 0.35, M.whiteDesk, {
    collide: true, prop: true,
  });

  // Black Industrial Window Mullions / Grid
  const mullionMat = M.cyberGunmetal;
  // Frame border
  createBox(WIN_X0, WIN_X1, SILL_Y, SILL_Y + 0.06, WIN_Z - 0.03, WIN_Z + 0.03, mullionMat);
  createBox(WIN_X0, WIN_X1, LINTEL_Y - 0.06, LINTEL_Y, WIN_Z - 0.03, WIN_Z + 0.03, mullionMat);
  createBox(WIN_X0, WIN_X0 + 0.06, SILL_Y, LINTEL_Y, WIN_Z - 0.03, WIN_Z + 0.03, mullionMat);
  createBox(WIN_X1 - 0.06, WIN_X1, SILL_Y, LINTEL_Y, WIN_Z - 0.03, WIN_Z + 0.03, mullionMat);

  // Vertical Mullions (dividing into 3 large floor-to-ceiling glass panes)
  const paneW = (WIN_X1 - WIN_X0) / 3;
  createBox(WIN_X0 + paneW - 0.03, WIN_X0 + paneW + 0.03, SILL_Y, LINTEL_Y, WIN_Z - 0.03, WIN_Z + 0.03, mullionMat);
  createBox(WIN_X0 + 2 * paneW - 0.03, WIN_X0 + 2 * paneW + 0.03, SILL_Y, LINTEL_Y, WIN_Z - 0.03, WIN_Z + 0.03, mullionMat);

  // Transparent Window Glass (Looking out to the rainy 3D city & player's car!)
  const glassMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(WIN_X1 - WIN_X0 - 0.08, LINTEL_Y - SILL_Y - 0.08),
    M.windowGlass,
  );
  glassMesh.position.set((WIN_X0 + WIN_X1) / 2, (SILL_Y + LINTEL_Y) / 2, WIN_Z);
  glassMesh.rotation.y = Math.PI;
  interiorGroup.add(glassMesh);

  // Window Sill Ambient Plant
  const winPlantPot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.22, 16), M.plantPot);
  winPlantPot.position.set(WIN_X0 + 0.5, SILL_Y + 0.11, WIN_Z + 0.15);
  interiorGroup.add(winPlantPot);

  const winPlantFoliage = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), M.plantFoliage);
  winPlantFoliage.position.set(WIN_X0 + 0.5, SILL_Y + 0.32, WIN_Z + 0.15);
  interiorGroup.add(winPlantFoliage);

  // ---------------------------------------------------------------------------
  // 7. The Platform Bed (Left Side - Clean & Cozy, Matching Photo 2)
  // ---------------------------------------------------------------------------
  const BED_X = -56.8;
  const BED_Z = 10.8;
  const BED_W = 2.0; // along X
  const BED_L = 2.3; // along Z
  const BED_BASE_H = 0.42;

  // Platform Base with Drawers
  createBox(
    BED_X - BED_W / 2, BED_X + BED_W / 2,
    APT_FLOOR_Y, APT_FLOOR_Y + BED_BASE_H,
    BED_Z - BED_L / 2, BED_Z + BED_L / 2,
    M.whiteLacquer,
    { collide: true, prop: true },
  );

  // Recessed drawer fronts and slim pulls break up the monolithic bed base.
  for (const dz of [-0.72, 0, 0.72]) {
    createBox(
      BED_X + BED_W / 2 + 0.002, BED_X + BED_W / 2 + 0.018,
      APT_FLOOR_Y + 0.07, APT_FLOOR_Y + BED_BASE_H - 0.06,
      BED_Z + dz - 0.31, BED_Z + dz + 0.31,
      M.whiteDesk,
      { collide: false },
    );
    createBox(
      BED_X + BED_W / 2 + 0.02, BED_X + BED_W / 2 + 0.035,
      APT_FLOOR_Y + BED_BASE_H - 0.12, APT_FLOOR_Y + BED_BASE_H - 0.09,
      BED_Z + dz - 0.13, BED_Z + dz + 0.13,
      M.drawerGap,
      { collide: false },
    );
  }

  // Under-Bed Pink LED Strip (Casting gorgeous floor wash glow)
  createBox(
    BED_X - BED_W / 2 - 0.02, BED_X + BED_W / 2 + 0.02,
    APT_FLOOR_Y + 0.02, APT_FLOOR_Y + 0.06,
    BED_Z - BED_L / 2 - 0.02, BED_Z + BED_L / 2 + 0.02,
    M.neonPink,
    { collide: false },
  );
  const bedFloorLight = new THREE.PointLight(0xff5b91, 0.85, 4.2, 2);
  bedFloorLight.position.set(BED_X, APT_FLOOR_Y + 0.15, BED_Z);
  interiorGroup.add(bedFloorLight);

  // Mattress (Sleek, raycastable top for lying down)
  const MATT_H = 0.22;
  const mattMesh = createBox(
    BED_X - BED_W / 2 + 0.05, BED_X + BED_W / 2 - 0.05,
    APT_FLOOR_Y + BED_BASE_H, APT_FLOOR_Y + BED_BASE_H + MATT_H,
    BED_Z - BED_L / 2 + 0.05, BED_Z + BED_L / 2 - 0.05,
    M.whitePillow,
    { collide: true, prop: true, isGround: true },
  );

  // Rounded woven duvet with a soft foot drape, replacing the former flat slab.
  const DUVET_L = BED_L * 0.72;
  const duvet = new THREE.Mesh(
    roundedBoxGeometry(BED_W - 0.1, 0.13, DUVET_L, 0.09, 4),
    M.pinkDuvet,
  );
  duvet.position.set(
    BED_X,
    APT_FLOOR_Y + BED_BASE_H + MATT_H + 0.055,
    BED_Z - BED_L / 2 + DUVET_L / 2 + 0.04,
  );
  duvet.castShadow = duvet.receiveShadow = true;
  interiorGroup.add(duvet);

  const duvetDrop = new THREE.Mesh(
    roundedBoxGeometry(BED_W - 0.14, 0.43, 0.1, 0.07, 4),
    M.pinkDuvet,
  );
  duvetDrop.position.set(
    BED_X,
    APT_FLOOR_Y + BED_BASE_H + MATT_H - 0.14,
    BED_Z - BED_L / 2 + 0.045,
  );
  duvetDrop.castShadow = true;
  interiorGroup.add(duvetDrop);

  // Plush Pillows (White / Pastel)
  for (const px of [BED_X - 0.5, BED_X + 0.5]) {
    const pillow = new THREE.Mesh(roundedBoxGeometry(0.72, 0.18, 0.46, 0.1, 4), M.whitePillow);
    pillow.position.set(px, APT_FLOOR_Y + BED_BASE_H + MATT_H + 0.09, BED_Z + BED_L / 2 - 0.35);
    pillow.rotation.x = 0.12;
    pillow.rotation.z = px < BED_X ? -0.04 : 0.04;
    pillow.castShadow = true;
    interiorGroup.add(pillow);
  }

  // Bed Headboard with Integrated Pink Cove Glow
  const HEAD_Z = BED_Z + BED_L / 2;
  createBox(
    BED_X - BED_W / 2, BED_X + BED_W / 2,
    APT_FLOOR_Y, APT_FLOOR_Y + 1.15,
    HEAD_Z, HEAD_Z + 0.12,
    M.pinkAccent,
    { collide: true, prop: true },
  );
  // Headboard Cove Light
  createBox(
    BED_X - BED_W / 2, BED_X + BED_W / 2,
    APT_FLOOR_Y + 1.12, APT_FLOOR_Y + 1.16,
    HEAD_Z - 0.02, HEAD_Z + 0.04,
    M.neonPink,
    { collide: false },
  );

  // Bedside Nightstand (White, with cute night lamp & clock)
  const STAND_X = BED_X + BED_W / 2 + 0.35;
  const STAND_Z = HEAD_Z - 0.35;
  createBox(
    STAND_X - 0.25, STAND_X + 0.25,
    APT_FLOOR_Y, APT_FLOOR_Y + 0.55,
    STAND_Z - 0.25, STAND_Z + 0.25,
    M.whiteLacquer,
    { collide: true, prop: true },
  );

  // Glowing Bunny / Cat Night Lamp
  const lampBody = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), M.warmWhiteGlow);
  lampBody.position.set(STAND_X, APT_FLOOR_Y + 0.67, STAND_Z);
  lampBody.scale.set(0.9, 1.15, 0.9);
  interiorGroup.add(lampBody);

  for (const ex of [-0.065, 0.065]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 12), M.warmWhiteGlow);
    ear.position.set(STAND_X + ex, APT_FLOOR_Y + 0.83, STAND_Z);
    ear.rotation.z = ex * 1.8;
    interiorGroup.add(ear);
  }

  const lampLight = new THREE.PointLight(0xffeedd, 1.3, 4);
  lampLight.position.set(STAND_X, APT_FLOOR_Y + 0.72, STAND_Z);
  interiorGroup.add(lampLight);

  // Wall Above Bed: Framed Cyberpunk Poster ("NIGHT BIGGER DREAMS")
  const bedPoster = new THREE.Mesh(
    new THREE.PlaneGeometry(0.75, 1.1),
    new THREE.MeshStandardMaterial({ map: bedPosterTex, roughness: 0.25 }),
  );
  bedPoster.position.set(BED_X - 0.8, APT_FLOOR_Y + 2.0, HEAD_Z - 0.01);
  interiorGroup.add(bedPoster);

  // Wall Above Bed: Pink Neon Sign ("未来の部屋" / "A BETTER ME TOMORROW")
  const neonKanjiMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.8),
    new THREE.MeshStandardMaterial({
      map: neonKanjiTex,
      emissive: new THREE.Color(0xff2a85),
      emissiveIntensity: 1.35,
      roughness: 0.1,
    }),
  );
  neonKanjiMesh.position.set(BED_X + 0.45, APT_FLOOR_Y + 2.0, HEAD_Z - 0.01);
  interiorGroup.add(neonKanjiMesh);

  // Neon Point Light for Kanji Sign
  const kanjiLight = new THREE.PointLight(0xff3f8e, 0.9, 4.2, 2);
  kanjiLight.position.set(BED_X + 0.45, APT_FLOOR_Y + 2.0, HEAD_Z - 0.45);
  interiorGroup.add(kanjiLight);

  // Top Wall Shelf with Cascading Hanging Ivy
  createBox(
    BED_X - BED_W / 2 + 0.2, BED_X + BED_W / 2 - 0.2,
    APT_FLOOR_Y + 2.48, APT_FLOOR_Y + 2.52,
    HEAD_Z - 0.28, HEAD_Z,
    M.whiteDesk,
    { collide: false },
  );
  // Hanging Ivy vines
  for (let iv = 0; iv < 6; iv++) {
    const ivyMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.08, 0.45 + iv * 0.08, 8),
      M.plantFoliage,
    );
    ivyMesh.position.set(BED_X - 0.6 + iv * 0.25, APT_FLOOR_Y + 2.2 - iv * 0.04, HEAD_Z - 0.22);
    interiorGroup.add(ivyMesh);
  }

  // ---------------------------------------------------------------------------
  // 8. The Gamer PC Setup (Right Side, Matching Reference Photo)
  // ---------------------------------------------------------------------------
  const DESK_X = APT_X1 - 0.45; // ~-51.65 (against east wall)
  const DESK_Z = 9.8;
  const DESK_W = 0.85; // along X
  const DESK_L = 2.4; // along Z
  const DESK_H = 0.74;

  // White Desk Tabletop
  createBox(
    DESK_X - DESK_W / 2, DESK_X + DESK_W / 2,
    APT_FLOOR_Y + DESK_H - 0.05, APT_FLOOR_Y + DESK_H,
    DESK_Z - DESK_L / 2, DESK_Z + DESK_L / 2,
    M.whiteDesk,
    { collide: true, prop: true },
  );

  // Drawer reveals and inset metal pulls on the room-facing fronts.
  for (const cabinetZ of [DESK_Z - DESK_L / 2 + 0.275, DESK_Z + DESK_L / 2 - 0.275]) {
    for (const drawerY of [0.14, 0.34, 0.54]) {
      createBox(
        DESK_X - DESK_W / 2 - 0.012, DESK_X - DESK_W / 2 + 0.004,
        APT_FLOOR_Y + drawerY - 0.005, APT_FLOOR_Y + drawerY + 0.012,
        cabinetZ - 0.23, cabinetZ + 0.23,
        M.drawerGap,
        { collide: false },
      );
    }
    createBox(
      DESK_X - DESK_W / 2 - 0.025, DESK_X - DESK_W / 2 - 0.008,
      APT_FLOOR_Y + 0.57, APT_FLOOR_Y + 0.60,
      cabinetZ - 0.09, cabinetZ + 0.09,
      M.cyberGunmetal,
      { collide: false },
    );
  }

  // Under-Desk Pink LED Strip
  createBox(
    DESK_X - DESK_W / 2, DESK_X + DESK_W / 2,
    APT_FLOOR_Y + DESK_H - 0.07, APT_FLOOR_Y + DESK_H - 0.05,
    DESK_Z - DESK_L / 2, DESK_Z + DESK_L / 2,
    M.neonPink,
    { collide: false },
  );
  const deskFloorLight = new THREE.PointLight(0xff5b91, 0.72, 3.8, 2);
  deskFloorLight.position.set(DESK_X - 0.2, APT_FLOOR_Y + 0.35, DESK_Z);
  interiorGroup.add(deskFloorLight);

  // Desk Drawer Cabinets (Left & Right Pedestals)
  createBox(
    DESK_X - DESK_W / 2 + 0.02, DESK_X + DESK_W / 2 - 0.02,
    APT_FLOOR_Y, APT_FLOOR_Y + DESK_H - 0.05,
    DESK_Z - DESK_L / 2, DESK_Z - DESK_L / 2 + 0.55,
    M.whiteDesk,
    { collide: true, prop: true },
  );
  createBox(
    DESK_X - DESK_W / 2 + 0.02, DESK_X + DESK_W / 2 - 0.02,
    APT_FLOOR_Y, APT_FLOOR_Y + DESK_H - 0.05,
    DESK_Z + DESK_L / 2 - 0.55, DESK_Z + DESK_L / 2,
    M.whiteDesk,
    { collide: true, prop: true },
  );

  // Dual Gaming Monitors (Thin bezels on desk mounts)
  const MON_W = 1.45, MON_H = 0.52;
  const monMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(MON_W, MON_H),
    new THREE.MeshStandardMaterial({
      map: monitorWallpaperTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.48,
      roughness: 0.15,
    }),
  );
  monMesh.position.set(DESK_X - 0.08, APT_FLOOR_Y + DESK_H + 0.42, DESK_Z + 0.15);
  monMesh.rotation.y = -Math.PI / 2;
  interiorGroup.add(monMesh);

  // Monitor Stand & Bezel Frame
  const monFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, MON_H + 0.04, MON_W + 0.04),
    M.cyberGunmetal,
  );
  monFrame.position.set(DESK_X - 0.05, APT_FLOOR_Y + DESK_H + 0.42, DESK_Z + 0.15);
  interiorGroup.add(monFrame);

  // Centre bezel, two slim arms and weighted bases make the display read as a
  // pair of real monitors rather than a luminous rectangle on the wall.
  createBox(
    DESK_X - 0.09, DESK_X - 0.045,
    APT_FLOOR_Y + DESK_H + 0.15, APT_FLOOR_Y + DESK_H + 0.69,
    DESK_Z + 0.13, DESK_Z + 0.17,
    M.cyberGunmetal,
    { collide: false },
  );
  for (const mz of [DESK_Z - 0.2, DESK_Z + 0.5]) {
    createBox(
      DESK_X - 0.04, DESK_X,
      APT_FLOOR_Y + DESK_H, APT_FLOOR_Y + DESK_H + 0.19,
      mz - 0.025, mz + 0.025,
      M.cyberGunmetal,
      { collide: false },
    );
    createBox(
      DESK_X - 0.14, DESK_X + 0.06,
      APT_FLOOR_Y + DESK_H, APT_FLOOR_Y + DESK_H + 0.025,
      mz - 0.14, mz + 0.14,
      M.cyberGunmetal,
      { collide: false },
    );
  }

  // Monitor Screen Ambient Light
  const monLight = new THREE.PointLight(0xdca2ff, 0.58, 3.2, 2);
  monLight.position.set(DESK_X - 0.5, APT_FLOOR_Y + DESK_H + 0.45, DESK_Z + 0.15);
  interiorGroup.add(monLight);

  // Gaming PC Chassis (Tempered glass panel + 3 circular RGB fans)
  const PC_Z = DESK_Z - 0.85;
  const pcCase = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.48, 0.48),
    M.cyberGunmetal,
  );
  pcCase.position.set(DESK_X - 0.05, APT_FLOOR_Y + DESK_H + 0.24, PC_Z);
  interiorGroup.add(pcCase);

  // Front RGB Fans Panel
  const pcFrontMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.46),
    new THREE.MeshStandardMaterial({
      map: pcFrontTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.95,
      roughness: 0.1,
    }),
  );
  pcFrontMesh.position.set(DESK_X - 0.18, APT_FLOOR_Y + DESK_H + 0.24, PC_Z);
  pcFrontMesh.rotation.y = -Math.PI / 2;
  interiorGroup.add(pcFrontMesh);

  // RGB Fan Bloom Glow Light
  const pcFanLight = new THREE.PointLight(0x55dfff, 0.55, 2.2, 2);
  pcFanLight.position.set(DESK_X - 0.35, APT_FLOOR_Y + DESK_H + 0.25, PC_Z);
  interiorGroup.add(pcFanLight);

  // Mechanical Keyboard (Pink & White)
  const kbMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.22),
    new THREE.MeshStandardMaterial({
      map: keyboardTex, emissive: new THREE.Color(0xff44aa), emissiveIntensity: 0.6,
    }),
  );
  kbMesh.position.set(DESK_X - 0.25, APT_FLOOR_Y + DESK_H + 0.005, DESK_Z + 0.15);
  kbMesh.rotation.x = -Math.PI / 2;
  kbMesh.rotation.z = Math.PI / 2;
  interiorGroup.add(kbMesh);

  // Ergonomic Gaming Chair (White with pink accents)
  const CHAIR_X = DESK_X - 0.85;
  const CHAIR_Z = DESK_Z + 0.15;
  const chairGroup = new THREE.Group();
  chairGroup.position.set(CHAIR_X, APT_FLOOR_Y, CHAIR_Z);

  // Caster star base + gas lift
  const chairBase = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 5), M.cyberGunmetal);
  chairBase.position.y = 0.08;
  chairGroup.add(chairBase);
  const chairStem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.38, 12), M.cyberGunmetal);
  chairStem.position.y = 0.26;
  chairGroup.add(chairStem);

  // Seat cushion (white & pink)
  const chairSeat = new THREE.Mesh(roundedBoxGeometry(0.54, 0.13, 0.54, 0.08, 3), M.whiteLacquer);
  chairSeat.position.y = 0.48;
  chairGroup.add(chairSeat);

  // High backrest with headrest
  const chairBack = new THREE.Mesh(roundedBoxGeometry(0.48, 0.78, 0.12, 0.1, 4), M.whiteLacquer);
  chairBack.position.set(-0.2, 0.86, 0);
  chairBack.rotation.y = Math.PI / 2;
  chairGroup.add(chairBack);

  // Pink lumbar & side bolster trim
  const chairTrim = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.12), M.neonPink);
  chairTrim.position.set(-0.18, 0.86, 0);
  chairGroup.add(chairTrim);

  // Armrests
  for (const az of [-0.28, 0.28]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.08), M.cyberGunmetal);
    arm.position.set(-0.05, 0.68, az);
    chairGroup.add(arm);
  }
  for (let wi = 0; wi < 5; wi++) {
    const angle = wi * Math.PI * 2 / 5;
    const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), M.cyberGunmetal);
    wheel.position.set(Math.cos(angle) * 0.3, 0.045, Math.sin(angle) * 0.3);
    wheel.scale.set(1.25, 0.65, 0.7);
    chairGroup.add(wheel);
  }
  interiorGroup.add(chairGroup);

  // Pegboard on Wall Above Desk
  const pegboard = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.75),
    new THREE.MeshStandardMaterial({ map: pegboardTex, roughness: 0.5 }),
  );
  pegboard.position.set(APT_X1 - 0.01, APT_FLOOR_Y + 1.85, DESK_Z - 0.5);
  pegboard.rotation.y = -Math.PI / 2;
  interiorGroup.add(pegboard);

  // Framed Typography Poster Above Desk ("GOOD PEOPLE · GOOD GAMES · GOOD LIFE")
  const deskPoster = new THREE.Mesh(
    new THREE.PlaneGeometry(0.65, 0.9),
    new THREE.MeshStandardMaterial({ map: deskPosterTex, roughness: 0.2 }),
  );
  deskPoster.position.set(APT_X1 - 0.01, APT_FLOOR_Y + 1.95, DESK_Z + 0.55);
  deskPoster.rotation.y = -Math.PI / 2;
  interiorGroup.add(deskPoster);

  // Floating Upper Shelf Above Desk with Figurines & Books
  createBox(
    APT_X1 - 0.35, APT_X1,
    APT_FLOOR_Y + 2.38, APT_FLOOR_Y + 2.42,
    DESK_Z - 0.9, DESK_Z + 0.9,
    M.whiteDesk,
    { collide: false },
  );
  // Shelf Underglow LED
  createBox(
    APT_X1 - 0.34, APT_X1 - 0.02,
    APT_FLOOR_Y + 2.36, APT_FLOOR_Y + 2.38,
    DESK_Z - 0.88, DESK_Z + 0.88,
    M.neonPink,
    { collide: false },
  );

  // Cute Pikachu / Anime Figurine on shelf
  const figurine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 0.16, 12),
    new THREE.MeshStandardMaterial({ color: 0xffdd22, roughness: 0.4 }),
  );
  figurine.position.set(APT_X1 - 0.18, APT_FLOOR_Y + 2.5, DESK_Z - 0.35);
  interiorGroup.add(figurine);

  // Properly separated books: the former 16 cm blocks were spaced only 12 cm
  // apart, so their coplanar intersections flickered as the camera moved.
  const bookSpecs = [
    { title: 'NEON', color: '#d9c6ca', ink: '#5b3e49', h: 0.34, t: 0.065 },
    { title: 'TOKYO', color: '#b85f7c', ink: '#ffe9f0', h: 0.31, t: 0.072 },
    { title: 'NIGHT', color: '#211d29', ink: '#ff8fb8', h: 0.36, t: 0.06 },
    { title: 'CITY', color: '#b77a53', ink: '#fff0d9', h: 0.33, t: 0.078 },
    { title: '2064', color: '#8d7585', ink: '#f9d5e2', h: 0.35, t: 0.068 },
  ];
  let bookZ = DESK_Z + 0.33;
  for (const [bi, spec] of bookSpecs.entries()) {
    const spineTex = makeCanvas(128, 512, (ctx, w, h) => {
      ctx.fillStyle = spec.color;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      ctx.fillRect(8, 0, 5, h);
      ctx.fillStyle = 'rgba(20,10,18,.2)';
      ctx.fillRect(w - 12, 0, 4, h);
      ctx.fillStyle = spec.ink;
      ctx.fillRect(20, 38, w - 40, 5);
      ctx.fillRect(20, h - 43, w - 40, 5);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 27px "Geist Mono", monospace';
      ctx.fillText(spec.title, 0, 0);
      ctx.restore();
    });
    spineTex.minFilter = THREE.LinearMipmapLinearFilter;
    spineTex.magFilter = THREE.LinearFilter;

    const book = new THREE.Group();
    const coverMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.color), roughness: 0.72, metalness: 0.02,
    });
    const pageMat = new THREE.MeshStandardMaterial({
      color: 0xd8cec5, roughness: 0.9, metalness: 0.0,
    });

    const pages = new THREE.Mesh(
      new THREE.BoxGeometry(0.145, spec.h - 0.018, spec.t - 0.012),
      pageMat,
    );
    pages.position.x = 0.008;
    book.add(pages);

    // Thin covers overhang the page block without intersecting neighbouring books.
    for (const zSide of [-1, 1]) {
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.17, spec.h, 0.006), coverMat);
      cover.position.z = zSide * (spec.t / 2 - 0.003);
      cover.castShadow = true;
      book.add(cover);
    }

    const spine = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, spec.h - 0.014, spec.t - 0.008),
      new THREE.MeshStandardMaterial({ map: spineTex, roughness: 0.68, metalness: 0.01 }),
    );
    spine.position.x = -0.089;
    book.add(spine);

    book.position.set(
      APT_X1 - 0.265,
      APT_FLOOR_Y + 2.42 + spec.h / 2,
      bookZ + spec.t / 2,
    );
    // A slight lean gives the row a natural silhouette, with real air gaps.
    book.rotation.x = bi === bookSpecs.length - 1 ? -0.08 : (bi - 2) * 0.008;
    book.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.updateMatrix();
      child.matrixAutoUpdate = false;
    });
    book.updateMatrix();
    book.matrixAutoUpdate = false;
    interiorGroup.add(book);
    bookZ += spec.t + 0.018;
  }

  // Solid bookends visually anchor the row and eliminate ambiguous intersections.
  const bookendMat = new THREE.MeshStandardMaterial({
    color: 0xc7a7b2, roughness: 0.42, metalness: 0.38,
  });
  for (const bz of [DESK_Z + 0.31, bookZ + 0.006]) {
    const bookend = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.2, 0.025), bookendMat);
    bookend.position.set(APT_X1 - 0.265, APT_FLOOR_Y + 2.52, bz);
    interiorGroup.add(bookend);
  }

  const shelfPot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, 0.18, 12), M.plantPot);
  shelfPot.position.set(APT_X1 - 0.2, APT_FLOOR_Y + 2.51, DESK_Z - 0.72);
  interiorGroup.add(shelfPot);
  for (let pi = 0; pi < 4; pi++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 6), M.plantFoliage);
    leaf.scale.set(0.38, 1.5, 0.75);
    leaf.position.set(
      APT_X1 - 0.2,
      APT_FLOOR_Y + 2.68 + pi * 0.055,
      DESK_Z - 0.72 + (pi - 1.5) * 0.07,
    );
    leaf.rotation.x = (pi - 1.5) * 0.25;
    interiorGroup.add(leaf);
  }

  // Tall Modern Wardrobe / Storage Cabinet (Far Right Corner)
  createBox(
    APT_X1 - 0.65, APT_X1,
    APT_FLOOR_Y, APT_CEIL_Y,
    DESK_Z + 1.3, APT_Z1,
    M.whiteDesk,
    { collide: true, prop: true },
  );

  // Cabinet door reveals, handles and an apparent open wardrobe niche.
  const wardrobeFrontX = APT_X1 - 0.66;
  for (const wz of [DESK_Z + 1.95, DESK_Z + 2.65, APT_Z1 - 0.05]) {
    createBox(
      wardrobeFrontX - 0.012, wardrobeFrontX + 0.008,
      APT_FLOOR_Y + 0.04, APT_CEIL_Y - 0.04,
      wz - 0.012, wz + 0.012,
      M.drawerGap,
      { collide: false },
    );
  }
  for (const wz of [DESK_Z + 1.6, DESK_Z + 2.3]) {
    createBox(
      wardrobeFrontX - 0.025, wardrobeFrontX - 0.005,
      APT_FLOOR_Y + 1.2, APT_FLOOR_Y + 1.62,
      wz - 0.018, wz + 0.018,
      M.cyberGunmetal,
      { collide: false },
    );
  }

  // ---------------------------------------------------------------------------
  // 9. Floor Center Details: Plush Bunny Rug & Tall Indoor Plant
  // ---------------------------------------------------------------------------
  // Plush Rug (Faithful to photo 2)
  const rugMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 2.1),
    new THREE.MeshStandardMaterial({
      map: plushRugTex, roughness: 0.85, metalness: 0.02,
    }),
  );
  rugMesh.position.set(-54.5, APT_FLOOR_Y + 0.008, 11.2);
  rugMesh.rotation.x = -Math.PI / 2;
  rugMesh.rotation.z = Math.PI / 2;
  interiorGroup.add(rugMesh);

  // Tall Potted Plant (Monstera / Ficus) Near Window
  const plantX = -58.0, plantZ = APT_Z0 + 0.85;
  const potMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.55, 20), M.plantPot);
  potMesh.position.set(plantX, APT_FLOOR_Y + 0.27, plantZ);
  interiorGroup.add(potMesh);

  for (let li = 0; li < 7; li++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), M.plantFoliage);
    leaf.scale.set(1.4, 0.15, 0.9);
    leaf.position.set(
      plantX + Math.sin(li * 1.0) * 0.25,
      APT_FLOOR_Y + 0.65 + li * 0.15,
      plantZ + Math.cos(li * 1.0) * 0.25,
    );
    leaf.rotation.y = li * 0.9;
    leaf.rotation.z = 0.25;
    interiorGroup.add(leaf);
  }

  // ---------------------------------------------------------------------------
  // 10. Room Perimeter LED Cove Lighting & Soothing Ambient
  // ---------------------------------------------------------------------------
  // Ceiling Perimeter Pink LED Cove Strips
  const COVE_Y = APT_CEIL_Y - 0.06;
  createBox(APT_X0, APT_X1, COVE_Y, APT_CEIL_Y, APT_Z0, APT_Z0 + 0.05, M.neonPink, { collide: false });
  createBox(APT_X0, APT_X1, COVE_Y, APT_CEIL_Y, APT_Z1 - 0.05, APT_Z1, M.neonPink, { collide: false });
  createBox(APT_X0, APT_X0 + 0.05, COVE_Y, APT_CEIL_Y, APT_Z0, APT_Z1, M.neonPink, { collide: false });
  createBox(APT_X1 - 0.05, APT_X1, COVE_Y, APT_CEIL_Y, APT_Z0, APT_Z1, M.neonPink, { collide: false });

  // Warm recessed ceiling spots. Visible trim rings anchor the light sources
  // while moderate falloff preserves material colour instead of clipping white.
  const downlightMat = new THREE.MeshStandardMaterial({
    color: 0xfff4eb,
    emissive: new THREE.Color(0xffd7bd),
    emissiveIntensity: 0.8,
    roughness: 0.4,
  });
  for (const [dx, dz] of [[-54.5, 9.5], [-55.5, 12.0], [-57.25, 8.1]]) {
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 24), downlightMat);
    trim.position.set(dx, APT_CEIL_Y - 0.025, dz);
    interiorGroup.add(trim);
  }

  const spot1 = new THREE.PointLight(0xffd8c5, 0.78, 6.2, 2);
  spot1.position.set(-54.5, APT_CEIL_Y - 0.2, 9.5);
  interiorGroup.add(spot1);

  const spot2 = new THREE.PointLight(0xffd8c5, 0.7, 6.2, 2);
  spot2.position.set(-55.5, APT_CEIL_Y - 0.2, 12.0);
  interiorGroup.add(spot2);

  // Ambient pink fill light (soothing, cozy)
  const pinkAmbient = new THREE.PointLight(0xff7a9f, 0.52, 8.0, 2);
  pinkAmbient.position.set(-55.0, APT_FLOOR_Y + 1.8, 10.5);
  interiorGroup.add(pinkAmbient);

  // ---------------------------------------------------------------------------
  // 11. Furniture Interaction Definitions
  // ---------------------------------------------------------------------------
  const apartmentFurniture = [
    {
      type: 'sit',
      label: "S'asseoir au setup gamer",
      approachY: APT_FLOOR_Y,
      triggerDistance: 1.1,
      x: CHAIR_X,
      y: APT_FLOOR_Y + 0.05,
      z: CHAIR_Z,
      yaw: -Math.PI / 2, // facing desk
    },
    {
      type: 'lie',
      label: "S'allonger sur le lit",
      approachY: APT_FLOOR_Y,
      triggerDistance: 1.35,
      x: BED_X,
      y: APT_FLOOR_Y + BED_BASE_H + MATT_H + 0.05,
      z: BED_Z,
      yaw: 0,
    },
  ];

  return {
    interiorGroup,
    apartmentFurniture,
    ENT_X,
    ENT_Z,
    APT_FLOOR_Y,
  };
}
