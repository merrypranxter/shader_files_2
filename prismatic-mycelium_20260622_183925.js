try {
  if (!ctx) throw new Error("WebGL2 context not available");

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    renderer.autoClear = false;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const rtParams = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType
    };

    const rtScene = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
    const rtPostA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
    const rtPostB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);

    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const sceneFragmentShader = `
      in vec2 vUv;
      out vec4 fragColor;
      
      uniform float u_time;
      uniform vec2 u_resolution;

      mat2 rot(float a) {
        float c = cos(a), s = sin(a);
        return mat2(c, -s, s, c);
      }

      float hash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
      }

      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i + vec3(0.0,0.0,0.0)), hash(i + vec3(1.0,0.0,0.0)), f.x),
                       mix(hash(i + vec3(0.0,1.0,0.0)), hash(i + vec3(1.0,1.0,0.0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0.0,0.0,1.0)), hash(i + vec3(1.0,0.0,1.0)), f.x),
                       mix(hash(i + vec3(0.0,1.0,1.0)), hash(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);
      }

      float smin(float a, float b, float k) {
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.0 - h);
      }

      vec2 map(vec3 p) {
        // WFC modular layout
        vec3 cell = floor(p * 0.5);
        vec3 local = fract(p * 0.5) - 0.5;
        float wfc = max(abs(local.x), max(abs(local.y), abs(local.z))) - 0.4;

        // Gyroid lattice with glass facets
        vec3 pg = p;
        pg.xy *= rot(p.z * 0.15);
        pg += 0.1 * sin(pg.yzx * 6.0); 
        float gyroid = abs(dot(sin(pg * 2.0), cos(pg.zxy * 2.0))) - 0.15;

        // Mix WFC and Gyroid to create growing/collapsing structure
        float mixF = smoothstep(0.3, 0.7, noise(p * 0.5 + u_time * 0.1));
        float glass = mix(wfc, gyroid, mixF);

        // Mycelial Network
        vec3 pm = p;
        pm.yz *= rot(u_time * 0.1);
        pm += 0.4 * sin(pm.zxy * 2.0 - u_time * 0.8);
        float myc = length(sin(pm * 3.0)) - 0.12;
        myc = smin(myc, length(cos(pm.yzx * 4.5 + u_time * 0.4)) - 0.08, 0.2);
        myc = smin(myc, length(sin(pm.zxy * 6.0 - u_time * 0.6)) - 0.04, 0.1);

        float d = smin(glass, myc, 0.1);
        float mat = (myc < glass) ? 1.0 : 0.0;

        return vec2(d * 0.5, mat);
      }

      vec3 calcNormal(vec3 p) {
        vec2 e = vec2(0.002, 0.0);
        return normalize(vec3(
            map(p + e.xyy).x - map(p - e.xyy).x,
            map(p + e.yxy).x - map(p - e.yxy).x,
            map(p + e.yyx).x - map(p - e.yyx).x
        ));
      }

      void main() {
        vec2 uv = (vUv - 0.5) * 2.0;
        uv.x *= u_resolution.x / u_resolution.y;

        vec3 ro = vec3(u_time * 0.4, sin(u_time * 0.2) * 0.5, u_time * 0.8);
        vec3 rd = normalize(vec3(uv, 0.8));
        rd.xy *= rot(sin(u_time * 0.1) * 0.3);
        rd.xz *= rot(cos(u_time * 0.15) * 0.2);

        float t = 0.0;
        float mat = 0.0;
        float glow = 0.0;

        for(int i = 0; i < 90; i++) {
            vec3 p = ro + rd * t;
            vec2 res = map(p);
            if(res.x < 0.002) { mat = res.y; break; }
            if(t > 12.0) break;
            t += res.x;
            if(res.y > 0.5) glow += 0.005 / (0.005 + abs(res.x)); 
        }

        vec3 col = vec3(0.02, 0.0, 0.05); // Deep violet void

        if(t < 12.0) {
            vec3 p = ro + rd * t;
            vec3 n = calcNormal(p);

            // Birefringence Interference
            float thickness = noise(p * 4.0 + u_time * 0.1) * 2.5;
            float interference = dot(n, -rd) * (thickness * 3.0 + 0.5);
            vec3 biref = 0.5 + 0.5 * cos(6.28318 * (interference * vec3(1.5, 1.2, 0.8) + vec3(0.0, 0.33, 0.67)));

            // Chromadepth (Warm near, Cool far)
            vec3 chroma = 0.5 + 0.5 * cos(6.28318 * (t * 0.15 + vec3(0.0, 0.2, 0.5)));

            if(mat < 0.5) {
                // Stained Glass Cathedral
                col = mix(biref, chroma, 0.4);
                vec3 light = normalize(vec3(1.0, 2.0, -1.0));
                float diff = max(dot(n, light), 0.1);
                float spec = pow(max(dot(reflect(rd, n), light), 0.0), 32.0);
                col = col * diff + spec * vec3(1.0, 0.8, 0.9);
            } else {
                // Glowing Mycelium
                vec3 mycCol = vec3(1.0, 0.0, 0.4); // Hot pink
                mycCol = mix(mycCol, vec3(0.0, 1.0, 0.8), sin(p.x * 5.0 - u_time * 3.0) * 0.5 + 0.5); // Cyan pulses
                mycCol = mix(mycCol, vec3(0.8, 1.0, 0.0), sin(p.y * 4.0 + u_time * 2.0) * 0.5 + 0.5); // Acid green
                col = mycCol * 1.5;
            }
        }

        // Add Mycelial Glow
        col += vec3(1.0, 0.2, 0.6) * glow * 0.15;
        col += vec3(0.1, 0.8, 1.0) * glow * 0.05 * sin(u_time * 2.0);

        // Depth fog
        col = mix(col, vec3(0.02, 0.0, 0.05), 1.0 - exp(-0.04 * t * t));

        fragColor = vec4(col, 1.0);
      }
    `;

    const postFragmentShader = `
      in vec2 vUv;
      out vec4 fragColor;
      
      uniform sampler2D u_scene;
      uniform sampler2D u_prev;
      uniform float u_time;
      uniform vec2 u_resolution;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      void main() {
        vec2 uv = vUv;

        // VHS Tape Wobble & Tearing
        float tear = step(0.98, sin(uv.y * 15.0 + u_time * 10.0)) * sin(u_time * 30.0) * 0.02;
        float wobble = sin(uv.y * 30.0 + u_time * 5.0) * 0.002;
        uv.x += wobble + tear;

        // Datamosh Macroblock Flow
        vec2 blockUV = floor(uv * 40.0) / 40.0;
        float flowNoise = hash(blockUV + floor(u_time * 4.0));
        vec2 flow = vec2(cos(flowNoise * 6.28), sin(flowNoise * 6.28)) * 0.015;

        // Glitch Trigger (Missing I-Frame)
        float glitch = step(0.85, noise(vec2(u_time * 3.0, floor(uv.y * 12.0))));
        glitch *= step(0.5, sin(u_time * 0.5)); // Occurs in bursts

        vec2 prevUV = uv - flow * glitch;
        
        // Chromatic Aberration
        float ca = 0.004 + glitch * 0.01; 
        float r = texture(u_scene, uv + vec2(ca, 0.0)).r;
        float g = texture(u_scene, uv).g;
        float b = texture(u_scene, uv - vec2(ca, 0.0)).b;
        vec3 sceneCol = vec3(r, g, b);

        vec3 prevCol = texture(u_prev, prevUV).rgb;

        // Cross-prediction bleed
        vec3 finalCol = mix(sceneCol, prevCol, glitch * 0.88);

        // I-Frame injection to clear the smear periodically
        float iframe = step(0.95, fract(u_time * 0.15));
        finalCol = mix(finalCol, sceneCol, iframe);

        // VHS Scanlines & Luma edge enhancement
        finalCol *= 0.95 + 0.05 * sin(uv.y * u_resolution.y * 0.6);
        vec3 bleed = texture(u_scene, uv - vec2(0.008, 0.0)).rgb;
        finalCol = mix(finalCol, bleed, 0.2); // Color bleed

        fragColor = vec4(finalCol, 1.0);
      }
    `;

    const copyFragmentShader = `
      in vec2 vUv;
      out vec4 fragColor;
      uniform sampler2D tDiffuse;
      void main() {
        fragColor = texture(tDiffuse, vUv);
      }
    `;

    const sceneMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader,
      fragmentShader: sceneFragmentShader
    });

    const postMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_scene: { value: null },
        u_prev: { value: null }
      },
      vertexShader,
      fragmentShader: postFragmentShader
    });

    const copyMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tDiffuse: { value: null }
      },
      vertexShader,
      fragmentShader: copyFragmentShader
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sceneMaterial);
    scene.add(quad);

    canvas.__three = {
      renderer,
      scene,
      camera,
      quad,
      sceneMaterial,
      postMaterial,
      copyMaterial,
      rtScene,
      rtPostA,
      rtPostB,
      pingPong: true
    };
  }

  const t = canvas.__three;

  if (t.rtScene.width !== grid.width || t.rtScene.height !== grid.height) {
    t.renderer.setSize(grid.width, grid.height, false);
    t.rtScene.setSize(grid.width, grid.height);
    t.rtPostA.setSize(grid.width, grid.height);
    t.rtPostB.setSize(grid.width, grid.height);
    t.sceneMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
    t.postMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
  }

  if (t.sceneMaterial?.uniforms?.u_time) {
    t.sceneMaterial.uniforms.u_time.value = time;
  }
  if (t.postMaterial?.uniforms?.u_time) {
    t.postMaterial.uniforms.u_time.value = time;
  }

  // 1. Render Scene to rtScene
  t.quad.material = t.sceneMaterial;
  t.renderer.setRenderTarget(t.rtScene);
  t.renderer.render(t.scene, t.camera);

  // 2. Render Post-Processing to rtPostB (using rtScene and rtPostA)
  const readBuffer = t.pingPong ? t.rtPostA : t.rtPostB;
  const writeBuffer = t.pingPong ? t.rtPostB : t.rtPostA;

  t.quad.material = t.postMaterial;
  t.postMaterial.uniforms.u_scene.value = t.rtScene.texture;
  t.postMaterial.uniforms.u_prev.value = readBuffer.texture;
  t.renderer.setRenderTarget(writeBuffer);
  t.renderer.render(t.scene, t.camera);

  // 3. Copy Post-Processing result to Screen
  t.quad.material = t.copyMaterial;
  t.copyMaterial.uniforms.tDiffuse.value = writeBuffer.texture;
  t.renderer.setRenderTarget(null);
  t.renderer.render(t.scene, t.camera);

  t.pingPong = !t.pingPong;

} catch (e) {
  console.error("WebGL Initialization Failed:", e);
}