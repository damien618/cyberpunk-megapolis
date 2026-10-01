"""The wildlife's headed performance pass in the running jungle map.

Headless Chromium is SwiftShader — useless for fps — so this opens a real,
headed browser (headless=False, the machine's GPU), stands the player at the
four reference spots, lets the camera rig settle, then averages draw calls
and triangles over four seconds and reads the wildlife's own stats.

    python3 serve.py 8000 &   # if it is not already up
    .venv/bin/python tests/jungle_wildlife_perf.py   # opens a window ~2 min

Budget (WILDLIFE.md): the roster costs +12 draw calls at most, 25 k
triangles, 0.6 ms of wildlife.update. Also saves one screenshot per spot to
scratch/, to be looked at, not only measured.
"""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', ROOT + '/.venv/pw-browsers')
from playwright.sync_api import sync_playwright

SPOTS = [('spawn', -8, -4), ('beach', 10, -8), ('mid-forest', -14, 60), ('pool', 8, 128)]

SAMPLE = '''async ([name, x, z]) => {
  const v = window.__jungle, THREE = v.THREE;
  v.ctrl.rescueTo(new THREE.Vector3(x, v.terrainHeight(x, z) + 1.0, z));
  v.ctrl.vel.set(0, 0, 0);
  return true;
}'''

def main():
    rows = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=['--window-size=1300,850'])
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        page.on('pageerror', lambda e: print('PAGEERROR:', str(e)[:400]))
        page.goto('http://127.0.0.1:8000/index.html?map=jungle', wait_until='domcontentloaded')
        page.wait_for_function('window.__jungle && window.__jungle.wildlife', timeout=300000)
        page.click('#startBtn')       # drop the intro overlay; the view shows
        page.wait_for_timeout(1500)
        for name, x, z in SPOTS:
            page.evaluate(SAMPLE, [name, x, z])
            page.wait_for_timeout(7000)            # the rig settles, the locals wake
            r = page.evaluate('''async () => {
              const v = window.__jungle;
              const N = 20, wait = 200;            // 4 s of samples
              let calls = 0, tris = 0, n = 0;
              for (let i = 0; i < N; i++) {
                await new Promise(res => setTimeout(res, wait));
                calls += v.renderer.info.render.calls;
                tris += v.renderer.info.render.triangles;
                n++;
              }
              return {
                calls: Math.round(calls / n), tris: Math.round(tris / n),
                wildlife: JSON.parse(JSON.stringify(v.wildlife.stats)),
              };
            }''')
            w = r['wildlife']
            per = ' '.join(f"{k}:{v['active']}/{v['visible']}" for k, v in sorted(w['species'].items()))
            rows.append({'spot': name, 'calls': r['calls'], 'tris': r['tris'],
                         'ms': round(w['ms'], 3), 'active': w['active'], 'visible': w['visible'],
                         'per species': per})
            page.screenshot(path=f'{ROOT}/scratch/jungle_wildlife_{name}.png')
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
    print(json.dumps(rows, indent=2))
    worst = max(rows, key=lambda r: r['calls'])
    ms = max(r['ms'] for r in rows)
    print(f"worst draw calls {worst['calls']} at the {worst['spot']}; "
          f"worst wildlife.update {ms:.3f} ms (budget 0.6 ms); "
          f"budget for the roster: baseline + 12 calls / 25 k triangles")

if __name__ == '__main__':
    sys.exit(main())
