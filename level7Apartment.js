// level7Apartment.js — Interior building entrance, cyberpunk stairwell,
// upper hallway, and hyper-realistic cozy pink gamer apartment inside LEVEL 07.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export function buildLevel7Interior({ THREE, scene, world, bw, MAXANISO = 8, ctrl, input }) {
  const interiorGroup = new THREE.Group();
  const collisionMeshes = [];
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

  // 8. Gamer PC Front: smoked tempered glass over a vertical stack of three
  // RGB fans. The canvas aspect (1:2.5) matches the glass panel exactly, so
  // the fans stay round instead of the ellipses the old square panel stretched
  // them into, and the same texture doubles as the emissive map — the glow
  // then follows the rings instead of flooding the whole front white.
  const pcFrontTex = makeCanvas(256, 640, (ctx, w, h) => {
    const glass = ctx.createLinearGradient(0, 0, w, h);
    glass.addColorStop(0, '#101017');
    glass.addColorStop(0.5, '#08080c');
    glass.addColorStop(1, '#0d0d13');
    ctx.fillStyle = glass;
    ctx.fillRect(0, 0, w, h);

    const fanR = w * 0.36;
    for (const [fy, cA, cB] of [
      [h * 0.19, '#2ae0ff', '#7a5bff'],
      [h * 0.50, '#8a5bff', '#ff45a8'],
      [h * 0.81, '#ff45a8', '#ff7a55'],
    ]) {
      // Blades first: the lit ring then reads as the frame around them rather
      // than a neon hoop floating on black.
      ctx.save();
      ctx.translate(w / 2, fy);
      for (let b = 0; b < 9; b++) {
        ctx.rotate((Math.PI * 2) / 9);
        ctx.beginPath();
        ctx.moveTo(0, -fanR * 0.2);
        ctx.quadraticCurveTo(fanR * 0.5, -fanR * 0.62, fanR * 0.9, -fanR * 0.08);
        ctx.lineTo(fanR * 0.18, fanR * 0.12);
        ctx.closePath();
        ctx.fillStyle = b % 2 ? 'rgba(48,48,60,0.95)' : 'rgba(33,33,43,0.95)';
        ctx.fill();
      }
      ctx.restore();

      const ring = ctx.createLinearGradient(w / 2 - fanR, fy - fanR, w / 2 + fanR, fy + fanR);
      ring.addColorStop(0, cA);
      ring.addColorStop(1, cB);
      ctx.strokeStyle = ring;
      ctx.lineWidth = w * 0.05;
      ctx.shadowColor = cB;
      ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(w / 2, fy, fanR, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#16161e';
      ctx.beginPath(); ctx.arc(w / 2, fy, fanR * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(206,222,255,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(w / 2, fy, fanR * 0.25, 0, Math.PI * 2); ctx.stroke();
    }

    // Raking reflection on the glass. Kept faint: it is emissive too, and a
    // bright streak here is exactly the white slab this panel used to be.
    const sheen = ctx.createLinearGradient(0, 0, w * 1.3, h * 0.45);
    sheen.addColorStop(0, 'rgba(188,206,255,0.09)');
    sheen.addColorStop(0.4, 'rgba(188,206,255,0.0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
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
  // Monstera blade for the floor plant. Painted stalk-down so the canvas
  // bottom is the petiole join and the top the drawn-out tip, which lets the
  // sprite pivot sit on the stem. The fenestrations are cut out of the alpha
  // only after the veins and the margin are painted, so each hole keeps a lit
  // inner rim instead of the flat silhouette edge a pre-cut path would give.
  const monsteraLeafTex = makeCanvas(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const bladePath = () => {
      ctx.beginPath();
      ctx.moveTo(cx, h * 0.96);                                              // petiole join
      ctx.bezierCurveTo(w * 0.30, h * 0.95, w * 0.11, h * 0.80, w * 0.10, h * 0.55);
      ctx.bezierCurveTo(w * 0.09, h * 0.27, w * 0.31, h * 0.10, cx, h * 0.04); // drawn-out tip
      ctx.bezierCurveTo(w * 0.69, h * 0.10, w * 0.91, h * 0.27, w * 0.90, h * 0.55);
      ctx.bezierCurveTo(w * 0.89, h * 0.80, w * 0.70, h * 0.95, cx, h * 0.96);
      ctx.closePath();
    };

    bladePath();
    const blade = ctx.createLinearGradient(0, 0, 0, h);
    blade.addColorStop(0, '#1d5226');     // tip, turned away from the room
    blade.addColorStop(0.35, '#3d8f3f');
    blade.addColorStop(0.75, '#2e7132');
    blade.addColorStop(1, '#18441f');     // shaded throat above the petiole
    ctx.fillStyle = blade;
    ctx.fill();

    // Waxy sheen across the blade: the flat fill alone read as cut cardboard.
    ctx.save();
    bladePath();
    ctx.clip();
    const sheen = ctx.createLinearGradient(w * 0.15, h, w * 0.8, 0);
    sheen.addColorStop(0, 'rgba(200,234,172,0.0)');
    sheen.addColorStop(0.45, 'rgba(200,234,172,0.18)');
    sheen.addColorStop(0.75, 'rgba(200,234,172,0.0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Midrib, then one lateral running out into each lobe.
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(186,220,158,0.32)';
    ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(cx, h * 0.93); ctx.lineTo(cx, h * 0.08); ctx.stroke();
    ctx.lineWidth = 1.7;
    for (let i = 0; i < 6; i++) {
      const y0 = h * (0.855 - i * 0.15);
      const halfW = w * (0.36 - i * 0.045);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx, y0);
        ctx.quadraticCurveTo(cx + s * halfW * 0.55, y0 - h * 0.035, cx + s * halfW, y0 - h * 0.085);
        ctx.stroke();
      }
    }

    // Darker margin, painted before the cuts so the splits bite through it.
    bladePath();
    ctx.strokeStyle = 'rgba(15,48,23,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // The openings. Deep wedges bitten in from the margin towards the midrib
    // are what make a monstera read as a monstera — a ring of round holes on
    // its own looked like leopard print from above — with a couple of slender
    // fenestrations stranded between them. The wedge mouths are kept to half
    // the gap between apexes, or the blade shreds into straps.
    const openings = [];
    for (const s of [-1, 1]) {
      for (const [ty, mouth] of [[0.80, 0.045], [0.65, 0.046], [0.50, 0.046], [0.35, 0.040], [0.22, 0.032]]) {
        openings.push(() => {
          ctx.beginPath();
          ctx.moveTo(cx + s * w * 0.09, h * ty);                  // apex by the midrib
          ctx.lineTo(cx + s * w * 0.62, h * (ty - 0.04 - mouth));
          ctx.lineTo(cx + s * w * 0.62, h * (ty - 0.04));         // mouth past the margin
          ctx.closePath();
        });
      }
      for (const ty of [0.725, 0.575]) {
        openings.push(() => {
          ctx.beginPath();
          ctx.ellipse(cx + s * w * 0.15, h * ty, w * 0.05, h * 0.016, -s * 0.35, 0, Math.PI * 2);
        });
      }
    }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    for (const path of openings) { path(); ctx.fill(); }
    // source-atop rims each cut on the blade side only; the half of the stroke
    // that falls inside the opening is discarded, so the edge stays crisp.
    ctx.globalCompositeOperation = 'source-atop';
    ctx.strokeStyle = 'rgba(20,58,28,0.8)';
    ctx.lineWidth = 2.5;
    for (const path of openings) { path(); ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over';
  });

  // Heart-shaped pothos blade for the window-sill plant: same stalk-down
  // convention, no fenestrations, one pale variegation wash.
  const pothosLeafTex = makeCanvas(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const bladePath = () => {
      ctx.beginPath();
      ctx.moveTo(cx, h * 0.97);
      ctx.bezierCurveTo(w * 0.24, h * 0.88, w * 0.04, h * 0.60, w * 0.10, h * 0.32);
      ctx.bezierCurveTo(w * 0.17, h * 0.08, w * 0.40, h * 0.10, cx, h * 0.04);
      ctx.bezierCurveTo(w * 0.60, h * 0.10, w * 0.83, h * 0.08, w * 0.90, h * 0.32);
      ctx.bezierCurveTo(w * 0.96, h * 0.60, w * 0.76, h * 0.88, cx, h * 0.97);
      ctx.closePath();
    };
    bladePath();
    const blade = ctx.createLinearGradient(0, 0, 0, h);
    blade.addColorStop(0, '#2b6f31');
    blade.addColorStop(0.5, '#4aa64c');
    blade.addColorStop(1, '#24602a');
    ctx.fillStyle = blade;
    ctx.fill();
    ctx.save();
    bladePath();
    ctx.clip();
    ctx.fillStyle = 'rgba(214,240,176,0.30)';
    ctx.beginPath();
    ctx.ellipse(cx + w * 0.16, h * 0.42, w * 0.20, h * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(206,236,180,0.55)';
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(cx, h * 0.92); ctx.lineTo(cx, h * 0.12); ctx.stroke();
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const y0 = h * (0.84 - i * 0.17);
      const halfW = w * (0.36 - i * 0.06);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx, y0);
        ctx.quadraticCurveTo(cx + s * halfW * 0.5, y0 - h * 0.04, cx + s * halfW, y0 - h * 0.12);
        ctx.stroke();
      }
    }
    bladePath();
    ctx.strokeStyle = 'rgba(18,54,26,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // Matte glaze shared by both planters: wheel-thrown rings plus clay speckle,
  // painted at its final colour so the material needs no tint.
  const ceramicPotTex = makeCanvas(256, 256, (ctx, w, h) => {
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#f4eee7');
    base.addColorStop(0.55, '#e5dcd1');
    base.addColorStop(1, '#c9bdb0');   // canvas bottom is the pot's foot
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const rnd = seededNoise(5521);
    ctx.strokeStyle = 'rgba(158,144,129,0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const y = (i / 26) * h + rnd() * 3;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rnd() > 0.6 ? 'rgba(122,106,92,0.30)' : 'rgba(255,252,246,0.35)';
      ctx.fillRect(rnd() * w, rnd() * h, 1.4, 1.4);
    }
  });

  // Potting soil: dark, dry and grainy so a pot never reads as an empty cup.
  const soilTex = makeCanvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#2b2018';
    ctx.fillRect(0, 0, w, h);
    const rnd = seededNoise(3312);
    for (let i = 0; i < 1500; i++) {
      const g = rnd();
      ctx.fillStyle = g > 0.86 ? '#5a4531' : (g > 0.5 ? '#3a2b20' : '#1c150f');
      const s = 1 + rnd() * 2.4;
      ctx.fillRect(rnd() * w, rnd() * h, s, s);
    }
  });

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
    // Real plants (floor monstera, sill pothos). The maps carry the colour,
    // so every tint stays at or below 1 — brightening a leaf map washes the
    // green out under this room's pink cove light.
    plantCeramic: new THREE.MeshPhysicalMaterial({
      map: ceramicPotTex, roughness: 0.55, metalness: 0.02,
      clearcoat: 0.28, clearcoatRoughness: 0.55,
    }),
    plantSoil: new THREE.MeshStandardMaterial({
      map: soilTex, roughness: 0.98, metalness: 0.0,
    }),
    plantStem: new THREE.MeshStandardMaterial({
      color: 0x417539, roughness: 0.9, metalness: 0.0,
    }),
    monsteraLeaf: new THREE.MeshStandardMaterial({
      map: monsteraLeafTex, alphaTest: 0.45, side: THREE.DoubleSide,
      roughness: 0.54, metalness: 0.0,
    }),
    pothosLeaf: new THREE.MeshStandardMaterial({
      map: pothosLeafTex, alphaTest: 0.45, side: THREE.DoubleSide,
      roughness: 0.6, metalness: 0.0,
    }),
    posterBorder: new THREE.MeshStandardMaterial({
      color: 0x111111, roughness: 0.2, metalness: 0.8,
    }),
  };

  // Helper function to build solid boxes (Mesh + physical AABB)
  function createBox(x0, x1, y0, y1, z0, z1, material, {
    collide = true, prop = true, groundOnly = false, isGround = false, ceiling = false,
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
      // The controller's swept rays must see the same solids as its AABBs.
      // Floors/treads remain ground-only so their risers do not stop the climb.
      if (!groundOnly && !isGround) collisionMeshes.push(mesh);
      bw.add({
        x0, x1, y0, y1, z0, z1,
        collide: true,
        prop: (isGround || groundOnly) ? false : prop,
        groundOnly: groundOnly || isGround,
        ceiling,
        camBlock: !groundOnly && !isGround,
        tall: h > 9,
      });
    }
    return mesh;
  }

  // Shared builder for the apartment's two real plants. Both are the same
  // archetype — a glazed pot, dark soil, a fan of arching petioles and one
  // alpha-cut blade at each petiole tip — so only the scale, the arc and the
  // leaf sprite differ. Stems merge into a single mesh and blades into a
  // single InstancedMesh, so a whole plant costs two draw calls no matter how
  // many leaves it carries.
  function buildPottedPlant({
    x, y, z,                     // pot foot, standing on the floor or the sill
    potTop, potBottom, potH,
    leafMaterial, leafW, leafH,
    stemCount, stemRadius, minLen, maxLen,
    spread,                      // furthest a petiole tip reaches from the axis
    facing = 0, arc = Math.PI * 2,
    droop = 0.6,
    seed = 1,
  }) {
    const rnd = seededNoise(seed);
    const UP = new THREE.Vector3(0, 1, 0);

    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(potTop, potBottom, potH, 24),
      M.plantCeramic,
    );
    pot.position.set(x, y + potH / 2, z);
    pot.castShadow = true;
    pot.receiveShadow = true;
    interiorGroup.add(pot);

    // A thrown lip: without it the open-ended cone reads as a paper cup.
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(potTop, potTop * 0.055, 8, 24),
      M.plantCeramic,
    );
    lip.position.set(x, y + potH, z);
    lip.rotation.x = -Math.PI / 2;
    lip.castShadow = true;
    interiorGroup.add(lip);

    // Soil mounds just proud of the rim and sinks into the closed pot body, so
    // the only ceramic left showing above it is the wall thickness at the lip.
    const soilY = y + potH + potH * 0.02;
    const soil = new THREE.Mesh(
      new THREE.CylinderGeometry(potTop * 0.93, potTop * 0.88, potH * 0.14, 24),
      M.plantSoil,
    );
    soil.position.set(x, soilY - potH * 0.07, z);
    soil.receiveShadow = true;
    interiorGroup.add(soil);

    const stemGeos = [];
    const placements = [];
    // A folded, drooping blade rather than a flat card. Real leaves cup along
    // the midrib, and — more importantly — a plane caught edge-on collapses to
    // a one-pixel line, which a fan of flat sprites hits from half the room.
    const leafGeo = new THREE.PlaneGeometry(leafW, leafH, 4, 4);
    leafGeo.translate(0, leafH / 2, 0);   // pivot at the petiole, not the centre
    const leafPos = leafGeo.attributes.position;
    for (let vi = 0; vi < leafPos.count; vi++) {
      const u = leafPos.getX(vi) / (leafW / 2);   // -1..1 across the blade
      const v = leafPos.getY(vi) / leafH;         //  0..1 petiole to tip
      leafPos.setZ(vi, -leafH * (0.09 * u * u + 0.07 * v * v));
    }
    leafPos.needsUpdate = true;
    leafGeo.computeVertexNormals();

    for (let si = 0; si < stemCount; si++) {
      const t = stemCount === 1 ? 0.5 : si / (stemCount - 1);
      const az = facing + (t - 0.5) * arc + (rnd() - 0.5) * (arc / stemCount);
      const dirX = Math.cos(az), dirZ = Math.sin(az);
      const len = minLen + (maxLen - minLen) * rnd();
      const lenNorm = maxLen > minLen ? (len - minLen) / (maxLen - minLen) : 1;
      // Short petioles stay upright in the crown and long ones arch away, which
      // is what gives a monstera its silhouette; an even fan read as a parasol.
      const reach = spread * (0.12 + 0.88 * lenNorm) * (0.65 + 0.5 * rnd());

      const points = [];
      for (let sg = 0; sg <= 4; sg++) {
        const u = sg / 4;
        points.push(new THREE.Vector3(
          x + dirX * (potTop * 0.28 + reach * u * u),
          // Rises fast, then flattens — the petiole arches without flopping.
          soilY + len * Math.sin(u * Math.PI * 0.46),
          z + dirZ * (potTop * 0.28 + reach * u * u),
        ));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      stemGeos.push(new THREE.TubeGeometry(curve, 12, stemRadius * (0.8 + 0.4 * rnd()), 5, false));

      // The blade keeps falling away from the tip instead of standing upright
      // on it, so bend the end tangent outwards and down before using it as
      // the leaf's long axis; the width axis is then horizontal by
      // construction and the face turns up towards the room.
      const forward = curve.getTangentAt(1).normalize().add(
        new THREE.Vector3(dirX * 0.3, -droop * (0.35 + rnd() * 0.9), dirZ * 0.3),
      ).normalize();
      const side = new THREE.Vector3().crossVectors(forward, UP);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0); else side.normalize();
      const normal = new THREE.Vector3().crossVectors(side, forward);

      placements.push({
        position: curve.getPointAt(1),
        basis: new THREE.Matrix4().makeBasis(side, forward, normal),
        axis: forward,
        roll: (rnd() - 0.5) * 0.7,
        scale: 0.78 + lenNorm * 0.42,   // the long petioles carry the big blades
        tint: 0.74 + rnd() * 0.26,
      });
    }

    const stems = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(stemGeos, false), M.plantStem);
    stems.castShadow = true;
    interiorGroup.add(stems);

    const blades = new THREE.InstancedMesh(leafGeo, leafMaterial, placements.length);
    const _bQuat = new THREE.Quaternion();
    const _bRoll = new THREE.Quaternion();
    const _bScale = new THREE.Vector3();
    const _bMat4 = new THREE.Matrix4();
    const _bColor = new THREE.Color();
    placements.forEach((leaf, i) => {
      _bQuat.setFromRotationMatrix(leaf.basis);
      _bRoll.setFromAxisAngle(leaf.axis, leaf.roll);
      _bQuat.premultiply(_bRoll);
      _bScale.setScalar(leaf.scale);
      blades.setMatrixAt(i, _bMat4.compose(leaf.position, _bQuat, _bScale));
      blades.setColorAt(i, _bColor.setScalar(leaf.tint));
    });
    blades.instanceMatrix.needsUpdate = true;
    if (blades.instanceColor) blades.instanceColor.needsUpdate = true;
    blades.castShadow = true;
    interiorGroup.add(blades);

    return { pot, stems, blades };
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
  createBox(ENT_X - 1.8, ENT_X - 1.4, 0.0, 7.02, ENT_Z, 9.20, M.wallPanels);
  createBox(ENT_X + 1.4, ENT_X + 1.8, 0.0, 7.02, ENT_Z, 9.20, M.wallPanels);
  createBox(ENT_X - 1.8, ENT_X + 1.8, 2.7, 7.02, ENT_Z - 0.15, ENT_Z + 0.15, M.wallPanels);

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
  // Close the full height alongside the flight. Only the landing beyond
  // STAIR_Z_END opens sideways into the corridor.
  createBox(STAIR_X0 - 0.35, STAIR_X0, 0.0, 7.20, STAIR_Z_START - 0.2, STAIR_Z_END, M.wallPanels);
  createBox(ENT_X - 1.8, ENT_X + 1.8, 7.02, 7.30, ENT_Z, STAIR_Z_END, M.ceilingMat, { ceiling: true });

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
  landingSignMesh.rotation.y = Math.PI;
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
  createBox(CORR_X_END - 0.35, STAIR_X1 + 0.35, 7.02, 7.30, CORR_Z0, CORR_Z1, M.ceilingMat, { ceiling: true });

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
  createBox(APT_X0, APT_X1, APT_FLOOR_Y - 0.15, APT_FLOOR_Y, APT_Z0, CORR_Z0, M.aptFloor, {
    isGround: true,
  });

  // Apartment Ceiling
  createBox(APT_X0, APT_X1, APT_CEIL_Y, APT_CEIL_Y + 0.25, APT_Z0, CORR_Z0, M.apartmentCeiling, { ceiling: true });

  // Left Wall (West Wall: x = APT_X0)
  createBox(APT_X0 - 0.35, APT_X0, APT_FLOOR_Y, APT_CEIL_Y, APT_Z0, CORR_Z0, M.apartmentWall);

  // Right Wall (East Wall: x = APT_X1)
  createBox(APT_X1, APT_X1 + 0.35, APT_FLOOR_Y, APT_CEIL_Y, APT_Z0, APT_Z1, M.apartmentWall);

  // The apartment extends west of the corridor: its rear wall must continue
  // to the room's corner, not stop at the corridor's end wall.
  createBox(APT_X0, CORR_X_END, APT_FLOOR_Y, APT_CEIL_Y, APT_Z1, CORR_Z0, M.apartmentWall);

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
  // A closed pane needs both a solid collision volume and visible geometry
  // from either side; the former single-sided plane could be walked through.
  createBox(WIN_X0, WIN_X1, SILL_Y, LINTEL_Y, WIN_Z - 0.02, WIN_Z + 0.02, M.windowGlass);

  // Window Sill Plant — a small pothos in a glazed cup, replacing the green
  // sphere that read as a tennis ball on a mug. Its fan only opens towards the
  // room (arc under a half turn, facing +Z): the ledge is 0.45 m deep and the
  // glass sits at WIN_Z, so a full round of blades would push through the pane.
  buildPottedPlant({
    x: WIN_X0 + 0.5, y: SILL_Y, z: WIN_Z + 0.22,
    potTop: 0.11, potBottom: 0.082, potH: 0.19,
    leafMaterial: M.pothosLeaf, leafW: 0.125, leafH: 0.15,
    stemCount: 17, stemRadius: 0.0055, minLen: 0.09, maxLen: 0.24,
    spread: 0.145, facing: Math.PI / 2, arc: 2.7, droop: 0.45,
    seed: 4231,
  });

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

  // Bedside Nightstand (White lacquer, with a warm bedside lamp)
  const STAND_X = BED_X + BED_W / 2 + 0.35;
  const STAND_Z = HEAD_Z - 0.35;
  createBox(
    STAND_X - 0.25, STAND_X + 0.25,
    APT_FLOOR_Y, APT_FLOOR_Y + 0.55,
    STAND_Z - 0.25, STAND_Z + 0.25,
    M.whiteLacquer,
    { collide: true, prop: true },
  );

  // Bedside Lamp: ceramic base, brass stem, linen shade. The previous bunny
  // was a bare emissive sphere with a 1.3-intensity near-white point light on
  // top of the nightstand, which clipped the lacquer to pure white and washed
  // the pink cove out of the corner.
  const LAMP_Y = APT_FLOOR_Y + 0.55;         // nightstand top
  const lampCeramic = new THREE.MeshStandardMaterial({
    color: 0xdcb4a2, roughness: 0.52, metalness: 0.03,
  });
  const lampBrass = new THREE.MeshStandardMaterial({
    color: 0xc79a55, roughness: 0.3, metalness: 0.85,
  });
  // The shade is lit from inside, so it glows on its own, but stays under the
  // bloom threshold (0.82): the lamp should read warm, not flare.
  const lampShadeMat = new THREE.MeshStandardMaterial({
    color: 0xf2d6ae, emissive: new THREE.Color(0xffae66), emissiveIntensity: 0.62,
    roughness: 0.86, metalness: 0.0, side: THREE.DoubleSide,
  });

  // Turned ceramic body (lathe profile: foot, belly, neck)
  const lampBody = new THREE.Mesh(
    new THREE.LatheGeometry([
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.066, 0.0),
      new THREE.Vector2(0.078, 0.028),
      new THREE.Vector2(0.083, 0.062),
      new THREE.Vector2(0.066, 0.113),
      new THREE.Vector2(0.038, 0.152),
      new THREE.Vector2(0.03, 0.17),
    ], 24),
    lampCeramic,
  );
  lampBody.position.set(STAND_X, LAMP_Y, STAND_Z);
  lampBody.castShadow = true;
  interiorGroup.add(lampBody);

  const lampStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.009, 0.009, 0.12, 10),
    lampBrass,
  );
  lampStem.position.set(STAND_X, LAMP_Y + 0.225, STAND_Z);
  interiorGroup.add(lampStem);

  const lampShade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.102, 0.144, 0.17, 28, 1, true),
    lampShadeMat,
  );
  lampShade.position.set(STAND_X, LAMP_Y + 0.335, STAND_Z);
  interiorGroup.add(lampShade);

  // Brass rings top and bottom hide the shade's open edges
  for (const [ry, rr] of [[0.25, 0.144], [0.42, 0.102]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.004, 6, 28), lampBrass);
    ring.position.set(STAND_X, LAMP_Y + ry, STAND_Z);
    ring.rotation.x = Math.PI / 2;
    interiorGroup.add(ring);
  }

  const lampBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 12, 10),
    new THREE.MeshStandardMaterial({
      color: 0xffe2bb, emissive: new THREE.Color(0xffc98c), emissiveIntensity: 0.8,
      roughness: 0.35,
    }),
  );
  lampBulb.position.set(STAND_X, LAMP_Y + 0.3, STAND_Z);
  interiorGroup.add(lampBulb);

  // Diffuser across the shade's top opening. A standing player looks down into
  // the shade from above, and the bare bulb flared through the bloom pass.
  const lampDiffuser = new THREE.Mesh(
    new THREE.CircleGeometry(0.1, 24),
    new THREE.MeshStandardMaterial({
      color: 0xffeacb, emissive: new THREE.Color(0xffc490), emissiveIntensity: 0.42,
      roughness: 0.9, side: THREE.DoubleSide,
    }),
  );
  lampDiffuser.position.set(STAND_X, LAMP_Y + 0.405, STAND_Z);
  lampDiffuser.rotation.x = -Math.PI / 2;
  interiorGroup.add(lampDiffuser);

  // Warm tungsten glow. Unlike the room's other lamps this one sits 0.35 m
  // from the surface it lights, and quadratic decay over that distance either
  // clips the lacquer to white or leaves the bed unlit — so this one is
  // linear, which holds a readable pool on the nightstand and still reaches
  // the pillows. It hangs high in the shade to keep the ceramic neck out of
  // the near field.
  const lampLight = new THREE.PointLight(0xffab5e, 0.36, 3.4, 1);
  lampLight.position.set(STAND_X, LAMP_Y + 0.38, STAND_Z);
  interiorGroup.add(lampLight);

  // ---------------------------------------------------------------------------
  // 7b. Accent Wall Behind the Bed
  // ---------------------------------------------------------------------------
  // The poster, the neon sign and the plant shelf used to float in mid-air at
  // the headboard's depth, all facing +Z — towards the door. Walking past them
  // culled their only side, so the sign vanished and left the bare vines
  // hanging in the void. They now hang on a real slatted panel and face the
  // room instead.
  const PANEL_Z0 = HEAD_Z + 0.13;            // panel face, towards the room
  const PANEL_Z1 = HEAD_Z + 0.31;
  const MOUNT_Z = PANEL_Z0 - 0.005;          // where frames sit against it

  const slatPanelTex = makeCanvas(512, 512, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#3a2739');
    grad.addColorStop(1, '#241a2a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const SLATS = 16, pitch = w / SLATS;
    const noise = seededNoise(4211);
    for (let i = 0; i < SLATS; i++) {
      const x = i * pitch;
      // Rounded slat: bright edge catching the cove light, shaded groove.
      const face = ctx.createLinearGradient(x, 0, x + pitch, 0);
      face.addColorStop(0.0, '#241a2a');
      face.addColorStop(0.22, '#4a3348');
      face.addColorStop(0.55, '#3b2a3c');
      face.addColorStop(0.88, '#221826');
      face.addColorStop(1.0, '#140e18');
      ctx.fillStyle = face;
      ctx.fillRect(x, 0, pitch - 1.5, h);
      // Vertical grain so the slats do not read as flat bands.
      ctx.globalAlpha = 0.16;
      for (let g = 0; g < 26; g++) {
        ctx.strokeStyle = noise() > 0.5 ? '#6a4d68' : '#150f1a';
        ctx.lineWidth = 0.6 + noise();
        const gx = x + 2 + noise() * (pitch - 5);
        ctx.beginPath();
        ctx.moveTo(gx, noise() * h * 0.3);
        ctx.lineTo(gx + (noise() - 0.5) * 3, h - noise() * h * 0.3);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  });
  slatPanelTex.wrapS = slatPanelTex.wrapT = THREE.RepeatWrapping;
  slatPanelTex.repeat.set(2, 1);

  createBox(
    BED_X - 1.3, BED_X + 1.3,
    APT_FLOOR_Y, APT_CEIL_Y,
    PANEL_Z0, PANEL_Z1,
    new THREE.MeshStandardMaterial({
      map: slatPanelTex, color: 0xffffff, roughness: 0.74, metalness: 0.12,
    }),
    { collide: true, prop: true },
  );
  // Painted skin on the door side: the slats belong to the bed nook, and the
  // bare panel read as a black slab from the entrance.
  createBox(
    BED_X - 1.3, BED_X + 1.3,
    APT_FLOOR_Y, APT_CEIL_Y,
    PANEL_Z1, PANEL_Z1 + 0.03,
    M.apartmentWall,
    { collide: false },
  );
  // Pink reveal where the partition meets the ceiling, matching the cove strips
  createBox(
    BED_X - 1.3, BED_X + 1.3,
    APT_CEIL_Y - 0.05, APT_CEIL_Y,
    PANEL_Z1 + 0.03, PANEL_Z1 + 0.06,
    M.neonPink,
    { collide: false },
  );

  // Wall Above Bed: Framed Cyberpunk Poster ("NIGHT BIGGER DREAMS")
  // Both frames hang in the 1.6 m band between the headboard top and the
  // plant shelf, side by side, so the cascading ivy above only brushes their
  // upper edge instead of dangling across the artwork.
  const POSTER_X = BED_X - 0.82, POSTER_Y = APT_FLOOR_Y + 1.73;
  const POSTER_W = 0.70, POSTER_H = 1.0;
  createBox(
    POSTER_X - POSTER_W / 2 - 0.035, POSTER_X + POSTER_W / 2 + 0.035,
    POSTER_Y - POSTER_H / 2 - 0.035, POSTER_Y + POSTER_H / 2 + 0.035,
    MOUNT_Z - 0.03, PANEL_Z0,
    M.posterBorder,
    { collide: false },
  );
  const bedPoster = new THREE.Mesh(
    new THREE.PlaneGeometry(POSTER_W, POSTER_H),
    new THREE.MeshStandardMaterial({ map: bedPosterTex, roughness: 0.25 }),
  );
  bedPoster.position.set(POSTER_X, POSTER_Y, MOUNT_Z - 0.032);
  bedPoster.rotation.y = Math.PI;                 // face the room, not the door
  interiorGroup.add(bedPoster);

  // Wall Above Bed: Pink Neon Sign ("未来の部屋" / "A BETTER ME TOMORROW")
  const KANJI_X = BED_X + 0.45, KANJI_Y = APT_FLOOR_Y + 1.68;
  const KANJI_W = 1.6, KANJI_H = 0.8;
  // Brushed dark bezel: the sign is a light box on the panel, so it keeps an
  // edge instead of reading as a glowing rectangle pasted on the wall.
  createBox(
    KANJI_X - KANJI_W / 2 - 0.04, KANJI_X + KANJI_W / 2 + 0.04,
    KANJI_Y - KANJI_H / 2 - 0.04, KANJI_Y + KANJI_H / 2 + 0.04,
    MOUNT_Z - 0.05, PANEL_Z0,
    M.posterBorder,
    { collide: false },
  );
  const neonKanjiMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(KANJI_W, KANJI_H),
    new THREE.MeshStandardMaterial({
      map: neonKanjiTex,
      emissive: new THREE.Color(0xff2a85),
      emissiveMap: neonKanjiTex,       // only the tubing glows, not the backing
      emissiveIntensity: 1.35,
      roughness: 0.1,
    }),
  );
  neonKanjiMesh.position.set(KANJI_X, KANJI_Y, MOUNT_Z - 0.052);
  neonKanjiMesh.rotation.y = Math.PI;
  interiorGroup.add(neonKanjiMesh);

  // Neon Point Light for Kanji Sign
  const kanjiLight = new THREE.PointLight(0xff3f8e, 0.9, 4.2, 2);
  kanjiLight.position.set(KANJI_X, KANJI_Y, MOUNT_Z - 0.45);
  interiorGroup.add(kanjiLight);

  // ---------------------------------------------------------------------------
  // 7c. Shelf Planters with Cascading Ivy
  // ---------------------------------------------------------------------------
  const SHELF_TOP_Y = APT_FLOOR_Y + 2.52;
  createBox(
    BED_X - 0.85, BED_X + 0.85,
    APT_FLOOR_Y + 2.48, SHELF_TOP_Y,
    MOUNT_Z - 0.26, PANEL_Z0,
    M.whiteDesk,
    { collide: false },
  );
  // Shelf underside LED. M.warmWhiteGlow (emissive 1.8) blew out into a white
  // bar here and drowned the foliage, so this strip is its own dim material.
  createBox(
    BED_X - 0.8, BED_X + 0.8,
    APT_FLOOR_Y + 2.468, APT_FLOOR_Y + 2.48,
    MOUNT_Z - 0.2, MOUNT_Z - 0.08,
    new THREE.MeshStandardMaterial({
      color: 0xffeccd, emissive: new THREE.Color(0xffd7a5), emissiveIntensity: 0.42,
      roughness: 0.4,
    }),
    { collide: false },
  );

  // Ivy leaf sprite: a five-lobed silhouette with veins, alpha-cut. Replaces
  // six untextured cones that read as green tubes from across the room.
  const ivyLeafTex = makeCanvas(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    ctx.beginPath();
    ctx.moveTo(cx, h * 0.95);
    ctx.bezierCurveTo(w * 0.17, h * 0.80, w * 0.02, h * 0.54, w * 0.13, h * 0.35);
    ctx.bezierCurveTo(w * 0.23, h * 0.21, w * 0.33, h * 0.31, w * 0.39, h * 0.22);
    ctx.bezierCurveTo(w * 0.44, h * 0.08, w * 0.56, h * 0.08, w * 0.61, h * 0.22);
    ctx.bezierCurveTo(w * 0.67, h * 0.31, w * 0.77, h * 0.21, w * 0.87, h * 0.35);
    ctx.bezierCurveTo(w * 0.98, h * 0.54, w * 0.83, h * 0.80, cx, h * 0.95);
    ctx.closePath();
    const blade = ctx.createLinearGradient(0, h * 0.08, 0, h);
    blade.addColorStop(0, '#2c6f36');
    blade.addColorStop(0.5, '#47a84e');
    blade.addColorStop(1, '#215c2c');
    ctx.fillStyle = blade;
    ctx.fill();
    ctx.strokeStyle = 'rgba(16,52,24,0.9)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(196,230,176,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, h * 0.90); ctx.lineTo(cx, h * 0.24); ctx.stroke();
    for (const [vx, vy] of [[0.22, 0.44], [0.78, 0.44], [0.33, 0.29], [0.67, 0.29]]) {
      ctx.beginPath(); ctx.moveTo(cx, h * 0.64); ctx.lineTo(w * vx, h * vy); ctx.stroke();
    }
  });

  const ivyPotMat = new THREE.MeshStandardMaterial({
    color: 0xc98c6a, roughness: 0.62, metalness: 0.03,
  });
  const ivyStemMat = new THREE.MeshStandardMaterial({
    color: 0x2f6b34, roughness: 0.82, metalness: 0.0,
  });
  const ivyLeafMat = new THREE.MeshStandardMaterial({
    map: ivyLeafTex, alphaTest: 0.45, side: THREE.DoubleSide,
    roughness: 0.68, metalness: 0.0,
  });

  const ivyRnd = seededNoise(7714);
  const stemGeos = [];
  const leafPlacements = [];
  const leafGeo = new THREE.PlaneGeometry(0.085, 0.102);
  leafGeo.translate(0, -0.047, 0);               // pivot at the stalk, not the centre

  for (const potDX of [-0.55, 0.0, 0.55]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.046, 0.1, 14), ivyPotMat);
    pot.position.set(BED_X + potDX, SHELF_TOP_Y + 0.05, MOUNT_Z - 0.135);
    pot.castShadow = true;
    interiorGroup.add(pot);
    const soil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.012, 14),
      new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.95 }),
    );
    soil.position.set(BED_X + potDX, SHELF_TOP_Y + 0.101, MOUNT_Z - 0.135);
    interiorGroup.add(soil);

    for (const side of [-1, 1]) {
      const x0 = BED_X + potDX + side * 0.045;
      // Long enough to cascade, short enough that at most a leaf or two
      // drapes over the top edge of a frame.
      const length = 0.34 + ivyRnd() * 0.26;
      const drift = side * (0.05 + ivyRnd() * 0.09);
      const points = [];
      for (let sg = 0; sg <= 4; sg++) {
        const t = sg / 4;
        points.push(new THREE.Vector3(
          x0 + drift * t * t,
          SHELF_TOP_Y + 0.09 - t * length,
          // out over the shelf lip, then falling back against the panel
          MOUNT_Z - 0.135 - Math.sin(t * Math.PI * 0.85) * 0.06 - t * 0.02,
        ));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      stemGeos.push(new THREE.TubeGeometry(curve, 12, 0.007, 5, false));

      const leaves = 6 + Math.floor(ivyRnd() * 3);
      for (let li = 0; li < leaves; li++) {
        const t = 0.1 + (li / leaves) * 0.88;
        const at = curve.getPointAt(t);
        const flip = li % 2 === 0 ? 1 : -1;
        leafPlacements.push({
          position: at.clone().add(new THREE.Vector3(flip * 0.028, -0.01, -0.012)),
          rotation: new THREE.Euler(
            -0.25 + ivyRnd() * 0.5,
            flip * (0.35 + ivyRnd() * 0.5),
            flip * (0.5 + ivyRnd() * 0.45),
          ),
          scale: 0.78 + ivyRnd() * 0.34,
          // Below 1 only: brightening the map washed the green out under the
          // room's pink light.
          tint: 0.72 + ivyRnd() * 0.26,
        });
      }
    }
  }

  // One merged mesh for every stem and one instanced mesh for every leaf: the
  // whole plant costs two draw calls instead of one per piece.
  const ivyStems = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(stemGeos, false), ivyStemMat);
  interiorGroup.add(ivyStems);

  const ivyLeaves = new THREE.InstancedMesh(leafGeo, ivyLeafMat, leafPlacements.length);
  const _leafMat4 = new THREE.Matrix4();
  const _leafQuat = new THREE.Quaternion();
  const _leafScale = new THREE.Vector3();
  const _leafColor = new THREE.Color();
  leafPlacements.forEach((leaf, i) => {
    _leafQuat.setFromEuler(leaf.rotation);
    _leafScale.setScalar(leaf.scale);
    ivyLeaves.setMatrixAt(i, _leafMat4.compose(leaf.position, _leafQuat, _leafScale));
    ivyLeaves.setColorAt(i, _leafColor.setScalar(leaf.tint));
  });
  ivyLeaves.instanceMatrix.needsUpdate = true;
  if (ivyLeaves.instanceColor) ivyLeaves.instanceColor.needsUpdate = true;
  ivyLeaves.castShadow = true;
  interiorGroup.add(ivyLeaves);

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
    // A screen emits its own picture: without an emissiveMap the white
    // emissive washed over the wallpaper and bloom clipped both panels to a
    // blank slab. The map drives the emission, so only the neon in the image
    // blooms and the dark sky stays dark.
    new THREE.MeshStandardMaterial({
      map: monitorWallpaperTex,
      emissiveMap: monitorWallpaperTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.0,
      roughness: 0.18,
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
  const monLight = new THREE.PointLight(0xc189ff, 0.52, 3.2, 2);
  monLight.position.set(DESK_X - 0.5, APT_FLOOR_Y + DESK_H + 0.45, DESK_Z + 0.15);
  interiorGroup.add(monLight);

  // Gaming PC Chassis — a white mid-tower standing on the desk, proportioned
  // like the reference (210 x 480 x 450 mm) so the fan stack sits on the
  // narrow front face. The old case was a dark half-cube whose square panel
  // squashed three round fans into ellipses.
  const PC_Z = DESK_Z - 0.85;
  const PC_D = 0.45, PC_H = 0.48, PC_W = 0.21;   // depth (X), height (Y), width (Z)
  const PC_CX = DESK_X + 0.02;
  const PC_CY = APT_FLOOR_Y + DESK_H + PC_H / 2;
  const pcCase = new THREE.Mesh(new THREE.BoxGeometry(PC_D, PC_H, PC_W), M.whiteLacquer);
  pcCase.position.set(PC_CX, PC_CY, PC_Z);
  pcCase.castShadow = true;
  interiorGroup.add(pcCase);

  // Tempered glass front, inset so the white chassis frames it on all four
  // sides — the bezel is geometry, not painted into the emissive map.
  const pcFrontMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(PC_W * 0.84, PC_H * 0.92),
    new THREE.MeshStandardMaterial({
      map: pcFrontTex,
      emissiveMap: pcFrontTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.15,
      roughness: 0.12,
      metalness: 0.1,
    }),
  );
  pcFrontMesh.position.set(PC_CX - PC_D / 2 - 0.004, PC_CY, PC_Z);
  pcFrontMesh.rotation.y = -Math.PI / 2;
  interiorGroup.add(pcFrontMesh);

  // Top vent strip and the power button, so the white box has a front and a
  // back rather than reading as a blank carton.
  createBox(
    PC_CX - PC_D / 2 + 0.05, PC_CX + PC_D / 2 - 0.05,
    PC_CY + PC_H / 2, PC_CY + PC_H / 2 + 0.004,
    PC_Z - PC_W / 2 + 0.03, PC_Z + PC_W / 2 - 0.03,
    M.drawerGap,
    { collide: false },
  );
  const pcPower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.004, 12),
    new THREE.MeshStandardMaterial({
      color: 0xdff4ff, emissive: new THREE.Color(0x35c8ff), emissiveIntensity: 1.4,
      roughness: 0.3,
    }),
  );
  pcPower.rotation.z = Math.PI / 2;
  pcPower.position.set(PC_CX - PC_D / 2 - 0.002, PC_CY + PC_H / 2 - 0.03, PC_Z + PC_W * 0.3);
  interiorGroup.add(pcPower);

  // RGB spill onto the desk. Violet rather than cyan: it now has to agree with
  // the ring gradients, which run cyan at the top to coral at the bottom.
  const pcFanLight = new THREE.PointLight(0x9a6bff, 0.5, 2.6, 2);
  pcFanLight.position.set(PC_CX - PC_D / 2 - 0.12, PC_CY, PC_Z);
  interiorGroup.add(pcFanLight);

  // Mechanical Keyboard (Pink & White)
  const kbMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.22),
    new THREE.MeshStandardMaterial({
      map: keyboardTex, emissive: new THREE.Color(0xff44aa), emissiveIntensity: 0.18,
      roughness: 0.55,
    }),
  );
  // Keys run along Z (0.46 of them) and the board is 0.22 deep in X, so its
  // near edge — the one the wrists come to rest on — is at KB_X - 0.11.
  const KB_X = DESK_X - 0.25, KB_Y = APT_FLOOR_Y + DESK_H + 0.005, KB_Z = DESK_Z + 0.15;
  kbMesh.position.set(KB_X, KB_Y, KB_Z);
  kbMesh.rotation.x = -Math.PI / 2;
  kbMesh.rotation.z = Math.PI / 2;
  interiorGroup.add(kbMesh);

  // Ergonomic Gaming Chair (White with pink accents)
  // Pulled up to the desk: at the old 0.85 m the cushion stopped 15 cm short of
  // the desk edge, which put the keyboard a good 20 cm beyond her fingertips.
  // 0.70 tucks the front of the cushion just under the overhang — the cushion
  // surface clears the desk underside by a quarter of a metre — and the knees
  // go into the well between the two drawer pedestals rather than against them.
  const CHAIR_X = DESK_X - 0.70;
  const CHAIR_Z = DESK_Z + 0.15;
  // Cushion surface over the floor. It used to be 58 cm, which is a bar stool,
  // not a desk chair: the legs had to plunge 41° below the horizontal to put
  // the soles on the floor, and the thighs went straight through the front lip
  // of the cushion on the way down. 45 cm still left the thigh 2.3 cm inside
  // that lip — measured on the skinned mesh, not on the bones, which clear it
  // either way. 42 cm takes the thigh down to 5° and lifts it clear.
  const CHAIR_SEAT_H = 0.42;
  // Front-to-back depth of the cushion, nominal: the bevel adds 3.8 cm to it.
  // 54 cm of seat under a 46 cm thigh is a bench — the surplus is all in front
  // of the knee, which is exactly where a thigh on its way down meets it. A
  // real task chair is shorter in the seat than it is wide, so this one is too.
  const CHAIR_SEAT_D = 0.46;
  const chairGroup = new THREE.Group();
  chairGroup.name = 'Level7_GamerChair';
  chairGroup.position.set(CHAIR_X, APT_FLOOR_Y, CHAIR_Z);

  // Caster star base + gas lift. The hub was 0.32, which reached 3 cm past the
  // heel of a seated player — her slipper stood inside the plate. 0.26 puts
  // its rim behind the heel and still carries the five casters.
  const chairBase = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 5), M.cyberGunmetal);
  chairBase.position.y = 0.08;
  chairGroup.add(chairBase);
  const chairStem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.26, 12), M.cyberGunmetal);
  chairStem.position.y = 0.20;
  chairGroup.add(chairStem);

  // Seat cushion (white & pink)
  const chairSeat = new THREE.Mesh(roundedBoxGeometry(CHAIR_SEAT_D, 0.13, 0.54, 0.08, 3), M.whiteLacquer);
  chairSeat.name = 'Level7_GamerSeat';
  // The seated pose anchors its pelvis above the cushion SURFACE, not the
  // floor, and roundedBoxGeometry's bevel stands proud of the nominal box — so
  // place the cushion by its own bounding box rather than by its centre.
  chairSeat.geometry.computeBoundingBox();
  chairSeat.position.y = CHAIR_SEAT_H - chairSeat.geometry.boundingBox.max.y;
  chairGroup.add(chairSeat);
  const CHAIR_SEAT_Y = APT_FLOOR_Y + CHAIR_SEAT_H;

  // High backrest with headrest. Its front face used to stand only 14 cm
  // behind the middle of the cushion, and a seated pelvis carries about that
  // much buttock behind the hip joint — so the back of her top grazed it at
  // 0.3 mm whatever the pose did. Moved back until its REAR face lines up with
  // the back of the cushion, which is where a shell backrest belongs anyway.
  const chairBack = new THREE.Mesh(roundedBoxGeometry(0.48, 0.78, 0.12, 0.1, 4), M.whiteLacquer);
  chairBack.name = 'Level7_GamerBackrest';
  chairBack.position.set(-0.25, 0.83, 0);
  chairBack.rotation.y = Math.PI / 2;
  chairGroup.add(chairBack);

  // Pink lumbar & side bolster trim
  const chairTrim = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.12), M.neonPink);
  chairTrim.position.set(-0.23, 0.83, 0);
  chairGroup.add(chairTrim);

  // Armrests, a hand's width over the cushion now that the cushion is lower.
  for (const az of [-0.28, 0.28]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.08), M.cyberGunmetal);
    arm.position.set(-0.05, 0.64, az);
    chairGroup.add(arm);
  }
  for (let wi = 0; wi < 5; wi++) {
    // Offset half a spoke: with the star starting at 0 one caster pointed
    // straight at the desk and parked itself under her heel. The gap does.
    const angle = wi * Math.PI * 2 / 5 + Math.PI / 5;
    const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), M.cyberGunmetal);
    wheel.position.set(Math.cos(angle) * 0.3, 0.045, Math.sin(angle) * 0.3);
    wheel.scale.set(1.25, 0.65, 0.7);
    chairGroup.add(wheel);
  }
  interiorGroup.add(chairGroup);

  // Fingerprint of the chair this browser actually built. Two sessions are
  // editing this file and main.js pins it with a ?v= tag, so a page can end up
  // running a new pose against an old chair with nothing on screen to say so.
  // Read off the built meshes, not off the constants, so it cannot lie.
  chairGroup.updateMatrixWorld(true);
  console.log('[chair] ' + JSON.stringify({
    seatTop: +(new THREE.Box3().setFromObject(chairSeat).max.y - APT_FLOOR_Y).toFixed(3),
    seatDepth: +(() => { const b = new THREE.Box3().setFromObject(chairSeat);
      return b.max.x - b.min.x; })().toFixed(3),
    backrestFront: +(new THREE.Box3().setFromObject(chairBack).max.x - CHAIR_X).toFixed(3),
    baseRadius: +chairBase.geometry.parameters.radiusTop.toFixed(3),
  }));

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

  // Tall Potted Monstera Near Window. The seven flattened spheres it replaces
  // stacked into a green corkscrew from across the room; this is fourteen
  // fenestrated blades on arching petioles instead. Spread stays at 0.38 so the
  // widest blade stops ~0.15 m short of the window mullions at APT_Z0.
  const plantX = -58.0, plantZ = APT_Z0 + 0.85;
  buildPottedPlant({
    x: plantX, y: APT_FLOOR_Y, z: plantZ,
    potTop: 0.26, potBottom: 0.195, potH: 0.5,
    leafMaterial: M.monsteraLeaf, leafW: 0.34, leafH: 0.4,
    stemCount: 14, stemRadius: 0.014, minLen: 0.34, maxLen: 0.9,
    spread: 0.38, droop: 0.55,
    seed: 9137,
  });

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
      // The pose shifts the hips `back` behind this anchor, so offset the
      // anchor forward by the same amount plus 2 cm: the hip joint then lands
      // just ahead of the cushion's centre, which puts the sitting flesh in
      // the middle of it and leaves the thighs supported to the front lip.
      x: CHAIR_X + 0.12,
      y: CHAIR_SEAT_Y,
      z: CHAIR_Z,
      yaw: Math.PI / 2, // avatar forward is +Z: rotate it toward the desk at +X
      // A stable three-quarter shot keeps the complete seated silhouette in
      // view. The generic 1.72 m sitting boom put a wide-angle lens almost in
      // her lap; the near thigh then looked twice as large as the torso and
      // gave the impression that the avatar had been scaled down.
      camera: {
        distance: 2.75,
        lookHeight: 0.82,
        yaw: -0.68,
        pitch: -0.08,
      },
      // Somebody at a keyboard does not sit the way they sit in an armchair.
      pose: {
        // Femoral head over the cushion, sitting flesh included. Stated rather
        // than measured: the generic measurement saturates its own search
        // window on this rig and comes back with the clamp, 22 cm, which is a
        // pelvis floating a hand's width over the seat.
        // 0.13 put the girl's sitting flesh 1.8 mm over the cushion and the
        // man's 9 mm inside it — the two rigs carry different amounts of it
        // under the joint and one number cannot satisfy both exactly. 0.135
        // splits the difference at ±5 mm, which on either rig reads as weight
        // resting on upholstery.
        hipRise: 0.135,
        // Feet forward, under the desk. The shared default tucks them BEHIND
        // the knees, which over a caster base stands a heel on a wheel — and
        // nobody at a keyboard sits with their feet under the chair anyway.
        shinLean: THREE.MathUtils.degToRad(14),
        // Forward on the cushion instead of 16 cm back into the shell — the
        // backrest is then a hand's width clear of her shoulder blades rather
        // than swallowing them.
        back: -0.10,
        // Into the screens, not reclined away from them. NEGATIVE is forward
        // on this spine — the sign is the opposite of the thigh's, which is
        // why the lounge pose's -5° was never the recline its name claims.
        // Measured: -5° carries the shoulders 2.7 cm ahead of the pelvis, +6°
        // takes them 3.7 cm behind it, so -9° is a shade under 7° of forward
        // trunk and leaves the shoulder blades a clear 20 cm off the backrest.
        lean: THREE.MathUtils.degToRad(-9),
        // Wrists on the near edge of the keyboard, a knuckle's height over the
        // keys so the hands drape onto them instead of through them. World
        // space: the board does not move when the body does.
        hands: {
          l: new THREE.Vector3(KB_X - 0.10, KB_Y + 0.045, KB_Z - 0.12),
          r: new THREE.Vector3(KB_X - 0.10, KB_Y + 0.045, KB_Z + 0.12),
        },
        // Elbows down and a little out, the way they hang off a desk. The
        // default pole is straight out sideways, which at this height splays
        // them level with the shoulders.
        elbowPole: new THREE.Vector3(0.45, -1, 0),
        handKey: 'seatedKeyboard',
      },
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
    collisionMeshes,
    apartmentFurniture,
    ENT_X,
    ENT_Z,
    APT_FLOOR_Y,
    // The room's own envelope, so callers can ask "is the player home?"
    // without a second copy of these numbers drifting out of step.
    apartmentBounds: {
      x0: APT_X0, x1: APT_X1,
      y0: APT_FLOOR_Y, y1: APT_CEIL_Y,
      z0: APT_Z0, z1: APT_Z1,
    },
  };
}
