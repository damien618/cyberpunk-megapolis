"""Close-ups of the island's animals in the running jungle map, one PNG each.

wildlife_preview.py shows a species alone on flat ground; this shows it where
it lives — on its sand, by its rock, over its water — framed by a free camera
that follows one individual (the chase rig is switched off for the shot).
Headed (the real GPU): a window opens for about ten seconds per shot.

    python3 serve.py 8000 &   # if it is not already up
    .venv/bin/python tests/wildlife_gallery.py                 # every species
    .venv/bin/python tests/wildlife_gallery.py crab fox:2      # some, fox #2
    .venv/bin/python tests/wildlife_gallery.py crab --rock     # the one nearest a rock
    .venv/bin/python tests/wildlife_gallery.py --wide          # farther framing

Shots land in scratch/gallery_<id>.png. The player stands a few metres
behind the camera, past every species' fear radius, so the animal goes on
with its life; pass --scare to stand it next to the animal instead.
"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', ROOT + '/.venv/pw-browsers')
from playwright.sync_api import sync_playwright

args = [a for a in sys.argv[1:] if not a.startswith('--')]
ROCK, WIDE, SCARE = '--rock' in sys.argv, '--wide' in sys.argv, '--scare' in sys.argv

FRAME = '''([id, idx, rock, wide, scare]) => {
  const v = window.__jungle, THREE = v.THREE, W = v.wildlife;
  const sp = W.debug.species[id];
  if (!sp || !sp.agents.length) return null;
  let a = sp.agents[Math.min(idx, sp.agents.length - 1)];
  if (rock) {
    const R = v.terrain.rockSpots;
    const d = b => Math.min(...R.map(r => Math.hypot(r.x - b.x, r.z - b.z) - r.r));
    a = sp.agents.reduce((m, b) => (d(b) < d(m) ? b : m), sp.agents[0]);
  }
  // Size of the body: the camera stands a few body-lengths off it.
  const g = sp.mesh.geometry; g.computeBoundingBox();
  const bb = g.boundingBox, size = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * a.scale;
  const dist = Math.max(0.7, size * (wide ? 9 : 4.5)), up = dist * 0.45;
  const az = Math.atan2(a.x - v.camera.position.x, a.z - v.camera.position.z) || 0.6;
  // The player: behind the camera and past the fear radius, or at the animal.
  const back = scare ? 1.5 : Math.max(dist + 3, sp.def.fear.radius + 4, sp.def.fear.runRadius + 1);
  const px = a.x - Math.sin(az) * back, pz = a.z - Math.cos(az) * back;
  v.ctrl.rescueTo(new THREE.Vector3(px, v.terrainHeight(px, pz) + 1, pz));
  v.ctrl.vel.set(0, 0, 0);
  window.__galleryAgent = a;
  v.rig.update = () => {
    const b = window.__galleryAgent;
    v.camera.fov = 50; v.camera.updateProjectionMatrix();
    const cx = b.x - Math.sin(az) * dist, cz = b.z - Math.cos(az) * dist;
    const floor = v.terrainHeight(cx, cz) + 0.25;
    v.camera.position.set(cx, Math.max(b.y + up, floor), cz);
    v.camera.lookAt(b.x, b.y + size * 0.15, b.z);
  };
  return { i: a.i, x: +a.x.toFixed(1), z: +a.z.toFixed(1), size: +size.toFixed(2) };
}'''

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False, args=['--window-size=1100,760'])
    page = browser.new_page(viewport={'width': 1024, 'height': 680})
    page.on('pageerror', lambda e: print('PAGEERROR:', str(e)[:300]))
    page.goto('http://127.0.0.1:8000/index.html?map=jungle', wait_until='domcontentloaded')
    page.wait_for_function('window.__jungle && window.__jungle.wildlife', timeout=300000)
    page.click('#startBtn')
    page.wait_for_timeout(1500)
    ids = args or page.evaluate('() => Object.keys(window.__jungle.wildlife.debug.species)')
    for spec in ids:
        sid, _, idx = spec.partition(':')
        info = page.evaluate(FRAME, [sid, int(idx or 0), ROCK, WIDE, SCARE])
        if not info:
            print(sid, ': no such species, or no individuals'); continue
        page.wait_for_timeout(4500)          # the wildlife wakes, the camera holds
        st = page.evaluate('() => { const a = window.__galleryAgent, W = window.__jungle.wildlife;'
                           ' return W.STATE_NAME[a.state] + " sink " + a.sink.toFixed(2); }')
        out = f'{ROOT}/scratch/gallery_{sid}{"_" + idx if idx else ""}.png'
        page.screenshot(path=out)
        print(sid, info, st, '→', os.path.relpath(out, ROOT))
    browser.close()
