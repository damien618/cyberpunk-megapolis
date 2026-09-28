"""Close-up of one wildlife species, alone on flat ground — no map boot (~15 s).

Renders three instances side by side: idle | moving (gait 1) | alarmed
(mood 1), so the model and its vertex-shader animation can be judged
before the species goes anywhere near a map.

    python3 serve.py 8000 &   # if it is not already up
    .venv/bin/python tests/wildlife_preview.py wildlifeCrab.js CRAB scratch/crab.png
    .venv/bin/python tests/wildlife_preview.py wildlifeCrab.js CRAB scratch/crab_top.png --top
"""
import base64, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', ROOT + '/.venv/pw-browsers')
from playwright.sync_api import sync_playwright

module, export, out = sys.argv[1:4]
top = '--top' in sys.argv
with sync_playwright() as p:
    b = p.chromium.launch(args=['--enable-unsafe-swiftshader', '--use-angle=swiftshader'])
    pg = b.new_page(viewport={'width': 400, 'height': 300})
    pg.set_default_timeout(120000)
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.on('console', lambda m: errs.append(m.text[:300]) if m.type == 'error' else None)
    pg.goto('http://127.0.0.1:8000/index.html', wait_until='domcontentloaded')   # the menu: importmap, no map
    res = pg.evaluate('''async ([module, exp, top]) => {
      const THREE = await import('three');
      const W = await import('/wildlife.js?v=preview' + Date.now());
      const def = (await import('/' + module + '?v=preview' + Date.now()))[exp];
      const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      r.setSize(900, 560); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Scene(); s.background = new THREE.Color(0xcfe2ea);
      s.add(new THREE.HemisphereLight(0xdcecff, 0xc8b48c, 1.1));
      const sun = new THREE.DirectionalLight(0xfff0d4, 2.7); sun.position.set(-0.5, 1.2, -0.7); s.add(sun);
      const { geometry } = def.build();
      const R = geometry.boundingSphere.radius, sc = def.body?.scale ? (def.body.scale[0] + def.body.scale[1]) / 2 : 1;
      const span = R * sc * 2.4;
      s.add(new THREE.Mesh(new THREE.PlaneGeometry(span * 8, span * 8).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xe9d7ae, roughness: 1 })));
      const anim = new THREE.InstancedBufferAttribute(new Float32Array(12), 4);
      geometry.setAttribute('aAnim', anim);
      const m = new THREE.InstancedMesh(geometry, W.makeCreatureMaterial(def), 3);
      const M = new THREE.Matrix4(), S = new THREE.Matrix4().makeScale(sc, sc, sc);
      [-span, 0, span].forEach((x, i) => m.setMatrixAt(i, M.makeRotationY(i === 1 ? 0.5 : 0).multiply(S).setPosition(x, 0, 0)));
      anim.setXYZW(0, 0.0, 0, 0, 0); anim.setXYZW(1, 1.0, 1, 0.2, 1.2); anim.setXYZW(2, 2.0, 0, 1, 0);
      s.add(m);
      const c = new THREE.PerspectiveCamera(40, 900 / 560, span * 0.02, span * 40);
      if (top) c.position.set(span * 0.1, span * 1.9, span * 1.0); else c.position.set(0, span * 0.55, span * 1.9);
      c.lookAt(0, R * sc * 0.4, 0);
      r.render(s, c);
      return { url: r.domElement.toDataURL('image/png'), tris: geometry.attributes.position.count / 3 };
    }''', [module, export, top])
    open(out, 'wb').write(base64.b64decode(res['url'].split(',')[1]))
    b.close()
print(f"{export}: {res['tris']:.0f} triangles -> {out}")
for e in errs[:6]:
    print('ERROR:', e)
sys.exit(1 if errs else 0)
