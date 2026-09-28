"""Render the jungle map headless and check the reworked tender: the module
builds, the boat floats on its sea (the ocean plus its own lee swell,
seaAt, agrees with where it sits) and visibly rides it, gently, there is
enough geometry drawn, and screenshots land in scratch/ for the eye to judge.

    python3 serve.py 8000 &   # if it is not already up
    .venv/bin/python tests/jungle_tender_shot.py
"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', ROOT + '/.venv/pw-browsers')
from playwright.sync_api import sync_playwright

SHOT = '''([name, x, y, z, lx, ly, lz]) => {
  const v = window.__jungle;
  v.camera.position.set(x, y, z);
  v.camera.lookAt(lx, ly, lz);
  v.renderer.render(v.scene, v.camera);
  return true;
}'''

PROBE = '''() => {
  const v = window.__jungle;
  if (!v.tender || !v.tenderCtl) return { exists: false };
  let meshes = 0;
  v.tender.traverse(m => { if (m.isMesh) meshes++; });
  // Settle the floatation on the real surface at a fixed instant, then ask
  // the sea what it was doing there: the two must agree.
  // The sea here is the ocean plus the tender's own lee swell (seaAt).
  // Over 30 s of motion, also record how much the boat actually moves:
  // it must visibly ride the swell, and never throw itself about.
  const t0 = 12.5;
  let yMin = Infinity, yMax = -Infinity, pMax = 0, rMax = 0;
  for (let i = 0; i < 1875; i++) {
    v.tenderCtl.update(t0 + i * 0.016, 0.016);
    if (i < 240) continue;                    // let the springs settle
    const q = v.tender.position.y, r = v.tender.rotation;
    yMin = Math.min(yMin, q); yMax = Math.max(yMax, q);
    pMax = Math.max(pMax, Math.abs(r.x)); rMax = Math.max(rMax, Math.abs(r.z));
  }
  const p = v.tender.position;
  const seaHere = v.tenderCtl.seaAt(p.x, p.z, t0 + 1874 * 0.016);
  const bb = new v.THREE.Box3().setFromObject(v.tender);
  return { exists: true, meshes, y: p.y, seaHere, heaveRange: yMax - yMin, pMax, rMax,
           pitch: v.tender.rotation.x, roll: v.tender.rotation.z,
           draft: seaHere - bb.min.y };
}'''

POSES = [
    ['bow',   -40.2, 1.9, -36.8, -36.9, 0.5, -29.5],  # over the jetty head, 3/4 bow
    ['jetty', -40.6, 1.9, -27.5, -36.8, 0.5, -29.6],  # along the rail, port side
    ['stern', -33.6, 1.6, -22.6, -36.7, 0.6, -26.8],  # aft quarter: outboard, awning
    ['graze', -31.2, 0.75, -33.5, -36.9, 0.3, -29.6], # from the water, near the surface
    ['wide',  -14.0, 12.0, 0.0, -37.0, 0.0, -30.0],   # high, the cove in context
]

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
    page = browser.new_page(viewport={'width': 960, 'height': 540})
    page.on('console', lambda m: errors.append(m.text) if 'THREE' in m.text or 'shader' in m.text.lower() else None)
    page.on('pageerror', lambda e: errors.append(str(e)))

    def defer(route):
        r = route.fetch()
        body = r.text().replace('\nanimate();', '\nwindow.__testAnimate = animate;')
        route.fulfill(response=r, body=body, content_type='text/javascript')

    page.route('**/main-JUNGLE.js*', defer)
    page.goto('http://127.0.0.1:8000/index.html?map=jungle')
    page.wait_for_function('window.__jungle && window.__jungle.tenderCtl', timeout=300000)
    page.wait_for_timeout(3500)   # textures in, so the shots are fair
    page.click('#startBtn')       # drop the intro overlay; the loop stays paused
    page.wait_for_timeout(500)

    # Warm-up frame compiles every program once; errors land in the console.
    page.evaluate('() => { const v = window.__jungle; v.renderer.render(v.scene, v.camera); }')
    page.wait_for_timeout(500)

    probe = page.evaluate(PROBE)
    for pose in POSES:
        page.evaluate(SHOT, pose)
        page.wait_for_timeout(120)
        page.screenshot(path=os.path.join(ROOT, 'scratch', f'jungle_tender_{pose[0]}.png'))
    browser.close()

print(f"tender meshes: {probe.get('meshes', 0)}")
if probe.get('exists'):
    print(f"tender heave y: {probe['y']:+.3f} m   sea says: {probe['seaHere']:+.3f} m")
    print(f"pitch {probe['pitch']:+.4f} rad   roll {probe['roll']:+.4f} rad   draft {probe['draft']:.2f} m")
    print(f"over 27 s: heave {probe['heaveRange']*100:.1f} cm peak-to-peak   "
          f"max pitch {probe['pMax']*57.3:.2f} deg   max roll {probe['rMax']*57.3:.2f} deg")

bad = [e for e in errors if 'THREE' in e or 'shader' in e.lower() or 'Error' in e]
for e in bad[:12]:
    print('ERROR:', e[:500])
ok = (probe.get('exists') and probe.get('meshes', 0) >= 30
      and abs(probe['y'] - probe['seaHere']) <= 0.05
      and abs(probe['pitch']) <= 0.12 and abs(probe['roll']) <= 0.12
      and probe['draft'] >= 0.25
      and 0.03 <= probe['heaveRange'] <= 0.25       # it rides the swell...
      and 0.004 <= probe['rMax'] <= 0.07             # ...and rolls, gently
      and probe['pMax'] <= 0.05
      and not bad)
print('PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
