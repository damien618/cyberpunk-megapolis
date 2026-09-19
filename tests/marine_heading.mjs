// Run with Node: node tests/marine_heading.mjs
// Exercise the real animation and vendored Three.js without a WebGL context.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const threeUrl = moduleUrl(await readFile(new URL('../vendor/three/three.module.js', import.meta.url), 'utf8'));
const THREE = await import(threeUrl);
const marineSource = await readFile(new URL('../marineLife.js', import.meta.url), 'utf8');
const { updateMarineLife } = await import(moduleUrl(marineSource.replace("from 'three'", `from '${threeUrl}'`)));

const dolphinConfigs = [
  { x: -52, zCenter: 12, rangeZ: 24, period: 4.8, phase: 0.0, maxH: 3.8, scale: 1.05 },
  { x: -58, zCenter: 16, rangeZ: 24, period: 4.8, phase: 0.22, maxH: 4.1, scale: 1.0 },
  { x: -74, zCenter: -10, rangeZ: 32, period: 5.6, phase: 1.8, maxH: 4.8, scale: 1.1, twist: true },
  { x: 18, zCenter: 80, rangeZ: 20, period: 4.2, phase: 2.7, maxH: 3.2, scale: 0.95 },
  { x: -16, zCenter: 84, rangeZ: 20, period: 4.2, phase: 2.95, maxH: 3.4, scale: 0.98 },
  { x: -42, zCenter: -45, rangeZ: 28, period: 5.0, phase: 3.9, maxH: 3.1, scale: 0.92 },
];
const orcaConfigs = [
  { name: 'Titan', scale: 1.02, isMale: true, x: -108, zCenter: 24, rangeZ: 40, period: 8.2, phase: 0.5, breachH: 5.8 },
  { name: 'Luna', scale: 0.84, isMale: false, x: -88, zCenter: 52, rangeZ: 36, period: 7.4, phase: 3.6, breachH: 4.2 },
  { name: 'Echo', scale: 0.54, isMale: false, x: -82, zCenter: 46, rangeZ: 36, period: 7.4, phase: 3.8, breachH: 2.8 },
];
const dolphins = dolphinConfigs.map((cfg, i) => ({
  cfg: { ...cfg, name: `Dolphin ${i + 1}` }, mesh: new THREE.Group(), prevY: -2,
}));
const orcas = orcaConfigs.map(cfg => ({ cfg, mesh: new THREE.Group(), prevY: -3.5 }));
const fauna = { dolphins, orcas, splashMgr: { update() {}, triggerSplash() {} } };
const sample = t => {
  updateMarineLife(0, t, fauna);
  return [...dolphins, ...orcas].map(animal => animal.mesh.position.clone());
};
const epsilon = 0.0001;
let checks = 0;
const directions = new Set();
// Multiple complete swim and breach cycles, including both sides of every
// longitudinal turnaround. Finite differences are independent of the fix.
for (let frame = 1; frame <= 5400; frame++) {
  const t = frame / 30;
  const before = sample(t - epsilon);
  const after = sample(t + epsilon);
  updateMarineLife(1 / 30, t, fauna);
  const animals = [...dolphins, ...orcas];
  for (let i = 0; i < animals.length; i++) {
    const { mesh, cfg } = animals[i];
    const velocity = after[i].sub(before[i]);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
    assert.ok(up.y > 0.55, `${cfg.name}: inverted at ${t}s`);
    assert.ok(forward.y * velocity.y >= -1e-8, `${cfg.name}: pitch opposes ascent/descent at ${t}s`);
    forward.y = velocity.y = 0;
    directions.add(Math.sign(velocity.z));
    assert.ok(forward.normalize().dot(velocity.normalize()) > 0.99999,
      `${cfg.name}: nose does not follow horizontal travel at ${t}s`);
    checks++;
  }
}
assert.ok(directions.has(-1) && directions.has(1), 'Must cover both swimming directions');
console.log(`Marine heading: ${checks} poses passed over 180 seconds for nine cetaceans (heading, pitch, upright).`);
