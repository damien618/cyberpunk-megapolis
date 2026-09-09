import * as THREE from 'three';

// Subdivide the untextured car panels once per template, never per instance.
// Weld by position because the source GLBs split vertices at every flat normal.
// Material boundaries remain fixed so glass, lights and body panels still meet.
export function refineCarGeometry(source, iterations = 2) {
  const positions = source.getAttribute('position');
  const vertices = [], remap = [], welded = new Map();
  for (let i = 0; i < positions.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(positions, i);
    const key = [p.x, p.y, p.z].map(v => Math.round(v * 1e5)).join(',');
    if (!welded.has(key)) { welded.set(key, vertices.length); vertices.push(p); }
    remap.push(welded.get(key));
  }
  let points = vertices;
  let faces = [];
  const count = source.index ? source.index.count : positions.count;
  for (let i = 0; i < count; i += 3) {
    const f = [0, 1, 2].map(j => remap[source.index ? source.index.getX(i + j) : i + j]);
    if (new Set(f).size === 3) faces.push(f);
  }
  for (let pass = 0; pass < iterations; pass++) {
    const edges = new Map(), neighbors = points.map(() => new Set());
    const key = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
    for (const [a, b, c] of faces) {
      for (const [u, v, opposite] of [[a,b,c], [b,c,a], [c,a,b]]) {
        const k = key(u,v);
        if (!edges.has(k)) edges.set(k, { u, v, opposite: [] });
        edges.get(k).opposite.push(opposite);
        neighbors[u].add(v); neighbors[v].add(u);
      }
    }
    const boundary = new Set();
    for (const e of edges.values()) if (e.opposite.length !== 2) {
      boundary.add(e.u); boundary.add(e.v);
    }
    const next = points.map((p, i) => {
      const n = neighbors[i].size;
      if (boundary.has(i) || n < 3) return p.clone();
      const beta = n === 3 ? 3 / 16 : 3 / (8 * n);
      const result = p.clone().multiplyScalar(1 - n * beta);
      for (const j of neighbors[i]) result.addScaledVector(points[j], beta);
      // A restrained Loop step rounds the stamped metal without shrinking
      // the greenhouse or erasing the original car's proportions.
      return p.clone().lerp(result, 0.65);
    });
    for (const e of edges.values()) {
      const p = points[e.u].clone().add(points[e.v]).multiplyScalar(0.5);
      if (e.opposite.length === 2) {
        const smooth = points[e.u].clone().add(points[e.v]).multiplyScalar(3 / 8)
          .addScaledVector(points[e.opposite[0]], 1 / 8)
          .addScaledVector(points[e.opposite[1]], 1 / 8);
        p.lerp(smooth, 0.65);
      }
      e.index = next.length; next.push(p);
    }
    const refined = [];
    for (const [a,b,c] of faces) {
      const ab = edges.get(key(a,b)).index, bc = edges.get(key(b,c)).index, ca = edges.get(key(c,a)).index;
      refined.push([a,ab,ca], [ab,b,bc], [ca,bc,c], [ab,bc,ca]);
    }
    points = next; faces = refined;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(p => [p.x,p.y,p.z]), 3));
  geometry.setIndex(faces.flat());
  // The original materials are solid colours. Planar UVs keep the fine paint
  // roughness texture usable after welding and subdivision.
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(points.flatMap(p => [p.x,p.z]), 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
