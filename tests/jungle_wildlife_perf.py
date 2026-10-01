"""The wildlife's headed performance pass in the running jungle map.

Headless Chromium is SwiftShader — useless for fps — so this opens a real,
headed browser (headless=False, the machine's GPU), stands the player at the
reference spots, lets the camera rig settle, then measures four seconds
twice — animals shown, animals hidden — so the difference (fps, p95 frame,
draw calls, triangles) is the wildlife's own, and reads its stats.

    python3 serve.py 8000 &   # if it is not already up
    .venv/bin/python tests/jungle_wildlife_perf.py              # a window, ~1.5 min
    .venv/bin/python tests/jungle_wildlife_perf.py --closeups   # + fox/lizard/frog shots

Budget (WILDLIFE.md): +6 draw calls in any view, 25 k triangles, 0.6 ms of
wildlife.update, and no fps lost. Also saves one screenshot per spot to
scratch/, to be looked at, not only measured.
"""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', ROOT + '/.venv/pw-browsers')
from playwright.sync_api import sync_playwright

SPOTS = [('spawn', -8, -4), ('beach', 10, -8), ('jetty', 0, -30), ('mid-forest', -14, 60),
         ('stream', 26, 80), ('pool', 8, 128)]

# Four seconds of frames: fps, p95 interval, frames over 20 ms, mean draw
# calls and triangles, and the wildlife's own stats.
MEASURE = '''async () => {
  const v = window.__jungle;
  const iv = []; let last = performance.now(), calls = 0, tris = 0, n = 0;
  await new Promise(res => {
    const t0 = last;
    const f = now => {
      iv.push(now - last); last = now;
      calls += v.renderer.info.render.calls; tris += v.renderer.info.render.triangles; n++;
      if (now - t0 < 4000) requestAnimationFrame(f); else res();
    };
    requestAnimationFrame(f);
  });
  iv.shift(); iv.sort((a, b) => a - b);
  const mean = iv.reduce((s, x) => s + x, 0) / iv.length;
  return { fps: +(1000 / mean).toFixed(1), p95: +iv[Math.floor(iv.length * 0.95)].toFixed(1),
           slow: iv.filter(x => x > 20).length, calls: Math.round(calls / n), tris: Math.round(tris / n),
           wl: JSON.parse(JSON.stringify(v.wildlife.stats)) };
}'''

def main():
    rows = []
    closeups = '--closeups' in sys.argv
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=['--window-size=1300,850'])
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        page.on('pageerror', lambda e: print('PAGEERROR:', str(e)[:400]))
        page.goto('http://127.0.0.1:8000/index.html?map=jungle', wait_until='domcontentloaded')
        page.wait_for_function('window.__jungle && window.__jungle.wildlife', timeout=300000)
        page.click('#startBtn')       # drop the intro overlay; the view shows
        page.wait_for_timeout(1500)
        for name, x, z in SPOTS:
            page.evaluate('''([x, z]) => { const v = window.__jungle;
              v.ctrl.rescueTo(new v.THREE.Vector3(x, v.terrainHeight(x, z) + 1.0, z)); v.ctrl.vel.set(0, 0, 0); }''', [x, z])
            page.wait_for_timeout(7000)            # the rig settles, the locals wake
            on = page.evaluate(MEASURE)
            page.screenshot(path=f'{ROOT}/scratch/jungle_wildlife_{name}.png')
            # The same view with the animals hidden: the difference is theirs.
            page.evaluate('() => { window.__jungle.wildlife.group.visible = false; }')
            page.wait_for_timeout(500)
            off = page.evaluate(MEASURE)
            page.evaluate('() => { window.__jungle.wildlife.group.visible = true; }')
            w = on['wl']
            rows.append({'spot': name, 'fps': f"{on['fps']} / {off['fps']}", 'p95 ms': f"{on['p95']} / {off['p95']}",
                         'slow frames': on['slow'], 'calls': f"+{on['calls'] - off['calls']} ({on['calls']})",
                         'tris': f"+{(on['tris'] - off['tris']) / 1000:.1f} k", 'update ms': round(w['ms'], 3),
                         'drawn': ' '.join(f"{k}:{v['visible']}" for k, v in sorted(w['species'].items()) if v['visible'])})
            print(json.dumps(rows[-1]))
        if not closeups:
            browser.close()
            return report(rows)
        # A close look at one fox: stand next to its home, catch it alert,
        # then again once it has trotted off into the undergrowth and calmed.
        page.evaluate('''async () => {
          const v = window.__jungle, THREE = v.THREE;
          const a = v.wildlife.debug.species.fox.agents[0];
          window.__fx = a;
          v.ctrl.rescueTo(new THREE.Vector3(
            a.home.x + 2.2, v.terrainHeight(a.home.x + 2.2, a.home.z) + 1, a.home.z));
          v.ctrl.vel.set(0, 0, 0);
        }''')
        page.wait_for_timeout(1200)
        page.screenshot(path=f'{ROOT}/scratch/jungle_wildlife_closeup_fox_alert.png')
        page.wait_for_timeout(14000)
        page.screenshot(path=f'{ROOT}/scratch/jungle_wildlife_closeup_fox_calm.png')
        st = page.evaluate('''() => {
          const a = window.__fx;
          return { state: a.state, x: +a.x.toFixed(1), z: +a.z.toFixed(1) };
        }''')
        print('closeup fox after the scare:', json.dumps(st))
        # A close look at one lizard: stand next to its home, catch it frozen
        # mid-alert (it stares at you), then again once it is back out.
        page.evaluate('''async () => {
          const v = window.__jungle, THREE = v.THREE;
          const a = v.wildlife.debug.species.lizard.agents[0];
          window.__lz = a;
          v.ctrl.rescueTo(new THREE.Vector3(
            a.home.x + 1.6, v.terrainHeight(a.home.x + 1.6, a.home.z) + 1, a.home.z));
          v.ctrl.vel.set(0, 0, 0);
        }''')
        page.wait_for_timeout(900)
        page.screenshot(path=f'{ROOT}/scratch/jungle_wildlife_closeup_alert.png')
        page.wait_for_timeout(19000)
        page.screenshot(path=f'{ROOT}/scratch/jungle_wildlife_closeup_calm.png')
        st = page.evaluate('''() => {
          const a = window.__lz;
          return { state: a.state, sink: +a.sink.toFixed(2), x: +a.x.toFixed(1), z: +a.z.toFixed(1) };
        }''')
        print('closeup lizard after the scare:', json.dumps(st))
        # A close look at one frog: stand by its rock, catch it flat and
        # staring, then again once it has hopped into the pool and gone under.
        page.evaluate('''async () => {
          const v = window.__jungle, THREE = v.THREE;
          const a = v.wildlife.debug.species.frog.agents[0];
          window.__fg = a;
          v.ctrl.rescueTo(new THREE.Vector3(
            a.home.x + 1.6, v.terrainHeight(a.home.x + 1.6, a.home.z) + 1, a.home.z));
          v.ctrl.vel.set(0, 0, 0);
        }''')
        page.wait_for_timeout(1200)
        page.screenshot(path=f'{ROOT}/scratch/jungle_wildlife_closeup_frog_alert.png')
        page.wait_for_timeout(9000)
        page.screenshot(path=f'{ROOT}/scratch/jungle_wildlife_closeup_frog_hiding.png')
        st = page.evaluate('''() => {
          const a = window.__fg;
          return { state: a.state, sink: +a.sink.toFixed(2), x: +a.x.toFixed(1), z: +a.z.toFixed(1) };
        }''')
        print('closeup frog after the scare:', json.dumps(st))
        browser.close()
    return report(rows)

def report(rows):
    calls = max(int(r['calls'].split()[0][1:]) for r in rows)
    ms = max(r['update ms'] for r in rows)
    print(f"worst: +{calls} draw calls for the animals in a view (budget +6), "
          f"wildlife.update {ms:.3f} ms (budget 0.6 ms)")

if __name__ == '__main__':
    sys.exit(main())
