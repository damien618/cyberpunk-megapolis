import * as THREE from 'three';
// Shared deterministic, tileable terrain details; no map geometry.
export function makeGrainTexture(maxAniso) {
  const S = 256;
  const c = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  let sd = 90210;
  const r = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < S * S; i++) {
    const v = 200 + r() * 55;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 40; i++) {
    const x = r() * S, y = r() * S, rad = 6 + r() * 26, k = 0.05 + r() * 0.1;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      gr.addColorStop(0, `rgba(0,0,0,${k})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

// A detail texture: four procedural channels in one 512² RGBA tile —
// R undergrowth speckle, G rock striation, B sand ripples, A broad macro
// blotches — all generated, nothing loaded, all tileable (the fbm blends
// four shifted samples by bilinear weights so the result wraps).
export function makeDetailTexture(maxAniso) {
  const S = 512;
  const c = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const hash = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vnoise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return hash(xi, yi) * (1 - u) * (1 - v) + hash(xi + 1, yi) * u * (1 - v)
      + hash(xi, yi + 1) * (1 - u) * v + hash(xi + 1, yi + 1) * u * v;
  };
  const oct = (x, y, n) => {
    let a = 0.5, s = 0;
    for (let o = 0; o < n; o++) { s += a * vnoise(x, y); x *= 2.03; y *= 2.11; a *= 0.5; }
    return s;
  };
  // fbm made periodic over the whole tile.
  const fbm4 = (x, y, n) => {
    const fx = x / S, fy = y / S;
    return (oct(x, y, n) * (1 - fx) * (1 - fy) + oct(x - S, y, n) * fx * (1 - fy)
      + oct(x, y - S, n) * (1 - fx) * fy + oct(x - S, y - S, n) * fx * fy);
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const macro = fbm4(x, y, 3);
      // R: clustered dark speckle the litter layer breaks up with.
      const speck = hash(x * 3.7 + 0.5, y * 3.1 + 1.5);
      img.data[i] = 255 * (speck < 0.16 + macro * 0.3 ? 0.25 + speck * 2 : 0.85 + 0.15 * speck);
      // G and B: bands and ripples, warped by an edge-windowed field so the
      // tile still wraps.
      const win = Math.sin(Math.PI * x / S) * Math.sin(Math.PI * y / S);
      const warp = (fbm4(x, y, 3) - 0.5) * 2 * win;
      img.data[i + 1] = 255 * (0.5 + 0.5 * Math.sin((y / S) * Math.PI * 2 * 9 + warp * 5));
      img.data[i + 2] = 255 * (0.5 + 0.5 * Math.sin(((x + y) * 0.71 / S) * Math.PI * 2 * 6 + warp * 6));
      // A: broad blotches for macro variation.
      img.data[i + 3] = 255 * macro;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

