from resort_harness import resort_page, check
with resort_page() as (page, errors):
    failed = page.evaluate("async () => { await import('/tests/resort_layout.mjs'); return window.__resortLayoutFailed; }")
    check('layout contracts', failed == 0)
    # Evaluate the actual GLSL seabed on the GPU, encoded in two byte channels.
    drift = page.evaluate('''() => {
      const v=window.__resort,T=v.THREE,L=v.layout;
      const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=1;
      const material=new T.ShaderMaterial({uniforms:{p:{value:new T.Vector2()}},
        vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader:`uniform vec2 p; ${L.bedGLSL} void main(){float n=floor(-bedHeight(p)/64.0*65535.0+.5);gl_FragColor=vec4(floor(n/256.0)/255.0,mod(n,256.0)/255.0,0.0,1.0);}`});
      const mesh=new T.Mesh(new T.PlaneGeometry(2,2),material);scene.add(mesh);
      const target=new T.WebGLRenderTarget(1,1),pixel=new Uint8Array(4);let drift=0;
      const old=v.renderer.getRenderTarget();v.renderer.setRenderTarget(target);
      for(const x of [-150,-75,0,75,150])for(const z of [-190,-100,-40,-10]){
        material.uniforms.p.value.set(x,z);v.renderer.render(scene,camera);v.renderer.readRenderTargetPixels(target,0,0,1,1,pixel);
        drift=Math.max(drift,Math.abs((pixel[0]*256+pixel[1])/65535*64-L.depthAt(x,z)));
      }
      v.renderer.setRenderTarget(old);target.dispose();material.dispose();mesh.geometry.dispose();return drift;
    }''')
    print('maximum CPU/GPU depth drift:', drift)
    check('CPU/GPU depth agreement within 1 cm', drift < .01)
