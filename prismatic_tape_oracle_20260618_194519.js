try {
  if (!canvas.__three) {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: false, antialias: false });
    renderer.autoClear = false;
    renderer.setPixelRatio(1);

    const w = grid.width;
    const h = grid.height;

    const rtOpts = {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping
    };

    const caRT1 = new THREE.WebGLRenderTarget(w, h, rtOpts);
    const caRT2 = new THREE.WebGLRenderTarget(w, h, rtOpts);
    const mainRT1 = new THREE.WebGLRenderTarget(w, h, rtOpts);
    const mainRT2 = new THREE.WebGLRenderTarget(w, h, rtOpts);

    const quadGeo = new THREE.PlaneGeometry(2, 2);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const vShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    // 1. CELLULAR AUTOMATA PASS (The Machine Mind)
    const caMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { u_tex: { value: null }, u_res: { value: new THREE.Vector2(w, h) }, u_time: { value: 0 } },
      vertexShader: vShader,
      fragmentShader: `
        in vec2 vUv;
        uniform sampler2D u_tex;
        uniform vec2 u_res;
        uniform float u_time;
        out vec4 fragColor;

        void main() {
          vec2 px = 1.0 / u_res;
          vec4 c = texture(u_tex, vUv);
          
          vec4 sum = vec4(0.0);
          float radius = 3.0;
          for(float a = 0.0; a < 6.283; a += 0.785) {
              sum += texture(u_tex, vUv + vec2(cos(a), sin(a)) * px * radius);
          }
          sum /= 8.0;
          
          // Continuous chaotic rule
          float next = fract(sum.r * 1.08 + 0.01);
          
          // Seed logic
          if (u_time < 0.5 || length(vUv - 0.5) < 0.01) {
              next = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
          }
          
          fragColor = vec4(next, sum.r, c.r, 1.0);
        }
      `
    });

    // 2. MAIN SCENE + DATAMOSH FEEDBACK PASS (Dream Physics & Op-Art)
    const mainMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { 
        u_ca: { value: null }, 
        u_prev: { value: null }, 
        u_res: { value: new THREE.Vector2(w, h) }, 
        u_time: { value: 0 } 
      },
      vertexShader: vShader,
      fragmentShader: `
        in vec2 vUv;
        uniform sampler2D u_ca;
        uniform sampler2D u_prev;
        uniform vec2 u_res;
        uniform float u_time;
        out vec4 fragColor;

        mat2 rot(float a) { float s=sin(a), c=cos(a); return mat2(c, -s, s, c); }

        float sdBox( vec3 p, vec3 b ) {
          vec3 q = abs(p) - b;
          return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
        }

        // Structural Color Cosine Palette
        vec3 pal(float t) {
            vec3 a = vec3(0.5, 0.5, 0.5);
            vec3 b = vec3(0.5, 0.5, 0.5);
            vec3 c = vec3(1.0, 1.0, 1.0);
            vec3 d = vec3(0.0, 0.33, 0.67);
            return a + b * cos(6.28318 * (c * t + d));
        }

        float map(vec3 p) {
            vec3 q = p;
            q.z = mod(q.z + u_time * 2.0, 8.0) - 4.0;
            
            // Central Oracle Tunnel
            float dTunnel = -(length(q.xy) - 3.0);
            // Op-Art spatial pressure (vibrating ridges)
            dTunnel += 0.15 * sin(atan(q.y, q.x) * 12.0) * sin(q.z * 15.0 - u_time * 5.0);

            // Floating Internet-Shrine Panels
            vec3 bp = q;
            bp.xy *= rot(p.z * 0.5 + u_time * 0.5);
            bp.x = abs(bp.x) - 1.5;
            bp.y = mod(bp.y, 2.0) - 1.0;
            float dPanels = sdBox(bp, vec3(0.6, 0.4, 0.05)) - 0.05;

            return min(dTunnel, dPanels);
        }

        vec3 calcNormal(vec3 p) {
            vec2 e = vec2(0.01, 0.0);
            return normalize(vec3(
                map(p + e.xyy) - map(p - e.xyy),
                map(p + e.yxy) - map(p - e.yxy),
                map(p + e.yyx) - map(p - e.yyx)
            ));
        }

        void main() {
          vec2 uv = (vUv - 0.5) * 2.0;
          uv.x *= u_res.x / u_res.y;

          // Raymarcher
          vec3 ro = vec3(0.0, 0.0, -3.0);
          vec3 rd = normalize(vec3(uv, 1.5));
          
          float t = 0.0;
          for(int i = 0; i < 60; i++) {
              vec3 p = ro + rd * t;
              float d = map(p);
              if(d < 0.01 || t > 20.0) break;
              t += d * 0.7; // Slow down for op-art ridges
          }

          vec3 sceneCol = vec3(0.0);
          if(t < 20.0) {
              vec3 p = ro + rd * t;
              vec3 n = calcNormal(p);
              float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);
              
              // Structural color based on normal, depth, and time
              sceneCol = pal(p.z * 0.2 + fresnel * 1.5 - u_time * 0.3);
              
              // Op-art moiré on surfaces
              float moire = sin(p.x * 40.0) * sin(p.y * 40.0);
              sceneCol *= 0.8 + 0.2 * moire;
          }

          // DATAMOSH & MEMORY FEEDBACK
          // Use CA state to drive motion vectors (the dream is a liquid memory)
          vec4 caState = texture(u_ca, vUv);
          vec2 flow = (caState.rg * 2.0 - 1.0) * 0.01;
          
          // Add radial pull
          flow -= normalize(vUv - 0.5) * 0.005 * sin(u_time);

          vec2 prevUV = vUv - flow;
          vec3 prevCol = texture(u_prev, prevUV).rgb;

          // Blend current scene with moshed history. 
          // Farther objects melt more (depth-based datamosh)
          float moshFactor = smoothstep(0.0, 20.0, t) * 0.95;
          // Force some trails regardless of depth
          moshFactor = max(moshFactor, 0.75 + 0.2 * caState.b); 

          fragColor = vec4(mix(sceneCol, prevCol, moshFactor), 1.0);
        }
      `
    });

    // 3. POST PASS (Riso, VHS, Strict Color Chemistry)
    const postMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { 
        u_tex: { value: null }, 
        u_res: { value: new THREE.Vector2(w, h) }, 
        u_time: { value: 0 } 
      },
      vertexShader: vShader,
      fragmentShader: `
        in vec2 vUv;
        uniform sampler2D u_tex;
        uniform vec2 u_res;
        uniform float u_time;
        out vec4 fragColor;

        void main() {
          vec2 uv = vUv;

          // VHS Tracking Wobble
          float track = step(0.96, sin(uv.y * 15.0 + u_time * 4.0));
          uv.x += track * 0.015 * sin(u_time * 60.0);
          uv.y += sin(uv.x * 5.0 + u_time) * 0.002;

          // Chromatic Aberration (Signal Bleed)
          vec2 caOffset = vec2(0.006, 0.0) * length(uv - 0.5);
          float r = texture(u_tex, uv + caOffset).r;
          float g = texture(u_tex, uv).g;
          float b = texture(u_tex, uv - caOffset).b;
          vec3 rawCol = vec3(r, g, b);

          // Luma Calculation
          float luma = dot(rawCol, vec3(0.299, 0.587, 0.114));

          // Risograph Halftone (AM Screen)
          float lpi = 110.0;
          float angle = 0.785398; // 45 degrees
          mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
          vec2 hUv = rot * uv * u_res.y * (lpi / 1000.0);
          float dotPattern = sin(hUv.x * 6.283) * sin(hUv.y * 6.283);
          float halftone = step(dotPattern, (luma - 0.4) * 2.5);

          // ABSOLUTE COLOR RULES: Cross-Processing Chemistry
          // No black, no white, no greys. Saturated dream logic only.
          vec3 cShadow = vec3(0.15, 0.0, 0.35); // Deep Indigo/Plum
          vec3 cMid1   = vec3(0.0, 0.3, 0.5);   // Deep Teal
          vec3 cMid2   = vec3(1.0, 0.0, 0.5);   // Hot Pink
          vec3 cHigh1  = vec3(0.0, 1.0, 0.8);   // Neon Cyan
          vec3 cHigh2  = vec3(0.8, 1.0, 0.0);   // Acid Yellow

          // Map luminance to the strict saturated palette
          vec3 finalCol;
          if (luma < 0.25)      finalCol = mix(cShadow, cMid1, luma * 4.0);
          else if (luma < 0.5)  finalCol = mix(cMid1, cMid2, (luma - 0.25) * 4.0);
          else if (luma < 0.75) finalCol = mix(cMid2, cHigh1, (luma - 0.5) * 4.0);
          else                  finalCol = mix(cHigh1, cHigh2, (luma - 0.75) * 4.0);

          // Apply Riso Ink Logic: Halftone dots reveal the deep shadow color
          finalCol = mix(cShadow, finalCol, halftone * 0.85 + 0.15);

          // Colored VHS Dropout Damage (Neon streaks)
          float dropout = step(0.995, fract(sin(dot(uv.yy, vec2(12.9898, 78.233))) * 43758.5453 + u_time));
          finalCol = mix(finalCol, cHigh2, dropout * track);

          // Frame edge burn (Damage Aesthetics)
          float vignette = length(vUv - 0.5);
          finalCol = mix(finalCol, cMid2, smoothstep(0.6, 0.8, vignette));

          fragColor = vec4(finalCol, 1.0);
        }
      `
    });

    const caScene = new THREE.Scene(); caScene.add(new THREE.Mesh(quadGeo, caMat));
    const mainScene = new THREE.Scene(); mainScene.add(new THREE.Mesh(quadGeo, mainMat));
    const postScene = new THREE.Scene(); postScene.add(new THREE.Mesh(quadGeo, postMat));

    canvas.__three = { 
      renderer, camera, 
      caRT1, caRT2, mainRT1, mainRT2, 
      caMat, mainMat, postMat, 
      caScene, mainScene, postScene, 
      pingPong: 0 
    };
  }

  const state = canvas.__three;
  const { renderer, camera, caRT1, caRT2, mainRT1, mainRT2, caMat, mainMat, postMat, caScene, mainScene, postScene } = state;

  renderer.setSize(grid.width, grid.height, false);
  caMat.uniforms.u_res.value.set(grid.width, grid.height);
  mainMat.uniforms.u_res.value.set(grid.width, grid.height);
  postMat.uniforms.u_res.value.set(grid.width, grid.height);

  caMat.uniforms.u_time.value = time;
  mainMat.uniforms.u_time.value = time;
  postMat.uniforms.u_time.value = time;

  const currentCA = state.pingPong ? caRT2 : caRT1;
  const nextCA = state.pingPong ? caRT1 : caRT2;
  const currentMain = state.pingPong ? mainRT2 : mainRT1;
  const nextMain = state.pingPong ? mainRT1 : mainRT2;

  // Pass 1: Cellular Automata
  caMat.uniforms.u_tex.value = currentCA.texture;
  renderer.setRenderTarget(nextCA);
  renderer.render(caScene, camera);

  // Pass 2: Main Scene & Datamosh Feedback
  mainMat.uniforms.u_ca.value = nextCA.texture;
  mainMat.uniforms.u_prev.value = currentMain.texture;
  renderer.setRenderTarget(nextMain);
  renderer.render(mainScene, camera);

  // Pass 3: Post Processing (Riso, VHS, Color Rules) to Screen
  postMat.uniforms.u_tex.value = nextMain.texture;
  renderer.setRenderTarget(null);
  renderer.render(postScene, camera);

  state.pingPong = 1 - state.pingPong;

} catch (e) {
  console.error("Prismatic Tape Oracle initialization failed:", e);
}