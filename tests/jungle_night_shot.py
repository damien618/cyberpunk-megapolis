"""Render the jungle map at NIGHT headless: shaders compile, the campfire and
its colliders are in, the diurnal animals sleep, and screenshots land in
scratch/ for the eye — the moon over the lagoon, the fire, the forest path
with its fireflies, the falls, and the avatar seated by the fire under her
blanket (through the real game loop, so the seat and camera are the game's).

    python3 serve.py 8000 &   # if it is not already up
    .venv/bin/python tests/jungle_night_shot.py [only-pose-name ...]
"""
import os, sys, base64, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', ROOT + '/.venv/pw-browsers')
from playwright.sync_api import sync_playwright

SHOT = '''([name, x, z, h, lx, ly, lz]) => {
  const v = window.__jungle;
  const y = v.terrainHeight(x, z) + h;
  v.ctrl.rescueTo({ x, y: y - 1.2, z });
  v.updateAtmosphere();
  v.vegetation.update({ x, z }, 0.5);
  v.camera.position.set(x, y, z);
  v.camera.lookAt(lx, ly, lz);
  v.renderer.render(v.scene, v.camera);
  const i = v.renderer.info.render;
  return { name, calls: i.calls, tris: i.triangles,
    data: v.renderer.domElement.toDataURL('image/png') };
}'''

# The campfire is at (-21, 3); the seat log inland of it.
POSES = [
    ['moon_lagoon',  -8,   6, 1.8,  -30, 6, -100],
    ['path_flies',  -14,  60, 1.8,    0, 6, 120],
    ['falls',        10, 128, 2.0,   22, 18, 151],
    ['liner',       -40, -30, 2.0, -150, 10, -620],
]
only = set(sys.argv[1:])

errors = []
os.makedirs(ROOT + '/scratch', exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
    page = browser.new_page(viewport={'width': 960, 'height': 540})
    page.set_default_timeout(240000)
    page.on('console', lambda m: errors.append(m.text) if ('THREE' in m.text or 'shader' in m.text.lower() or m.type == 'error') else None)
    page.on('pageerror', lambda e: errors.append(str(e)))

    page.goto('http://127.0.0.1:8000/index.html?map=jungle&arrival=cruise&time=night',
              wait_until='domcontentloaded')
    for _ in range(300):
        if page.evaluate('() => !!(window.__jungle && window.__jungle.jungleTime === "night")'):
            break
        page.wait_for_timeout(1000)
    page.wait_for_timeout(3000)
    info = page.evaluate('''() => {
      const v = window.__jungle, sp = v.wildlife.debug.species;
      return { time: v.jungleTime, flies: v.fireflies.count,
        asleep: Object.keys(sp).filter(k => sp[k].def.activeRadius < 0),
        fireVisible: v.campfire.group.visible, seat: v.campfire.seat,
        fire: v.campfire.group.position.toArray() };
    }''')
    print(json.dumps(info))
    fx, fy, fz = info['fire']
    POSES += [['fire_wide', fx + 7, fz + 7, 2.2, fx, fy + 0.6, fz],
              ['fire_close', fx + 1.5, fz + 4, 1.4, fx, fy + 0.5, fz]]

    for pose in POSES:
        if only and pose[0] not in only:
            continue
        d = page.evaluate(SHOT, pose)
        open(f"{ROOT}/scratch/jungle_night_{d['name']}.png", 'wb').write(
            base64.b64decode(d['data'].split(',')[1]))
        print(f"{d['name']:12s} calls {d['calls']:4d} tris {d['tris']:8d}")

    if not only or 'seated' in only:
        # Through the game loop: sit, let the rig settle, then shoot.
        page.evaluate('() => window.__jungle.playerReady')
        page.evaluate('() => { const v = window.__jungle; v.sitByFire(); }')
        page.wait_for_timeout(9000)
        st = page.evaluate('''() => { const v = window.__jungle;
          return { mode: v.ctrl.mode, pos: v.ctrl.pos.toArray(), blanket: v.blanket.mesh.visible,
            cloth: v.blanket.ready, clothMs: (() => { const t0 = performance.now();
              v.blanket.fit(v.player, 1 / 60, 100); return +(performance.now() - t0).toFixed(2); })(),
            cam: v.camera.position.toArray() }; }''')
        print('seated', json.dumps(st))
        page.screenshot(path=f'{ROOT}/scratch/jungle_night_seated.png', timeout=240000)
        # A three-quarter view from the fire's side, to see the blanket close.
        d = page.evaluate('''() => { const v = window.__jungle, s = v.campfire.seat;
          v.camera.position.set(s.x - 1.3, s.floorY + 1.15, s.z - 1.5);
          v.camera.lookAt(s.x, s.floorY + 0.75, s.z + 0.1);
          v.renderer.render(v.scene, v.camera);
          return v.renderer.domElement.toDataURL('image/png'); }''')
        open(f'{ROOT}/scratch/jungle_night_seated_front.png', 'wb').write(base64.b64decode(d.split(',')[1]))
        # Close on the blanket: the user's own angle (front right, above),
        # and from behind over her shoulder.
        for name, (dx, dy, dz, ly) in {'blanket_close': (1.0, 1.45, -1.2, 0.9),
                                        'blanket_back': (-0.9, 1.5, 1.3, 0.95)}.items():
            d = page.evaluate('''([dx, dy, dz, ly]) => { const v = window.__jungle, s = v.campfire.seat;
              v.camera.position.set(s.x + dx, s.floorY + dy, s.z + dz);
              v.camera.lookAt(s.x, s.floorY + ly, s.z + 0.1);
              v.renderer.render(v.scene, v.camera);
              return v.renderer.domElement.toDataURL('image/png'); }''', [dx, dy, dz, ly])
            open(f'{ROOT}/scratch/jungle_night_{name}.png', 'wb').write(base64.b64decode(d.split(',')[1]))

    browser.close()

print('errors:', len(errors))
for e in errors[:12]:
    print('  ', e[:300])
