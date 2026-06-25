try {
  if (!canvas.__three) {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.setPixelRatio(1.0); // Keep it crunchy for the aesthetic

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const scene = new THREE.Scene();
    const geometry = new THREE.PlaneGeometry(2, 2);

    // --- FBO Setup for Ping-Pong and Passes ---
    const fboConfig = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.NearestFilter, // Chunky pixels for early internet vibe
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType, // Better precision for feedback
      depthBuffer: false,
      stencilBuffer: false
    };

    // CA Brain FBOs
    const caRes = 256;
    let caA = new THREE.WebGLRenderTarget(caRes, caRes, fboConfig);
    let caB = new THREE.WebGLRenderTarget(caRes, caRes, fboConfig);

    // Scene FBO
    const sceneFBO = new THREE.WebGLRenderTarget(grid.width, grid.height, fboConfig);

    // Composite/Feedback FBOs
    let compA = new THREE.WebGLRenderTarget(grid.width, grid.height, fboConfig);
    let compB = new THREE.WebGLRenderTarget(grid.width, grid.height, fboConfig);

    // Initialize CA with noise
    const caInitData = new Uint16Array(caRes * caRes * 4);
    for (let i = 0; i < caInitData.length; i++) {
      caInitData[i] = THREE.DataUtils.toHalfFloat(Math.random());
    }
    const caInitTex = new THREE.DataTexture(caInitData, caRes, caRes, THREE.RGBAFormat, THREE.HalfFloatType);
    caInitTex.needsUpdate = true;

    // --- SHADERS ---

    // 1. Cellular Automata "Brain" Shader (Continuous / Fluid)
    const caMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tState: { value: caInitTex },
        u_time: { value: 0 },
        u_res: { value: new THREE.Vector2(caRes, caRes) }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D tState;
        uniform vec2 u_res;
        uniform float u_time;

        void main() {
          vec2 px = 1.0 / u_res;
          vec4 sum = vec4(0.0);
          // Moore neighborhood read
          for(int y=-1; y<=1; y++) {
            for(int x=-1; x<=1; x++) {
              sum += texture(tState, fract(vUv + vec2(x,y)*px));
            }
          }
          vec4 me = texture(tState, vUv);
          float avg = sum.r / 9.0;
          
          // Continuous rule (Lenia-lite)
          float growth = exp(-pow(avg - 0.25, 2.0) / 0.02) * 2.0 - 1.0;
          float nextState = clamp(me.r + growth * 0.1, 0.0, 1.0);
          
          // Inject noise occasionally
          if(fract(sin(dot(vUv, vec2(12.9898, 78.233)) + u_time)*43758.5453) > 0.99) {
            nextState = 1.0;
          }

          fragColor = vec4(vec3(nextState), 1.0);
        }
      `
    });

    // 2. Scene Shader: Dream Physics Architecture & Op-Art
    const sceneMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_res: { value: new THREE.Vector2(grid.width, grid.height) },
        tCA: { value: null }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        uniform float u_time;
        uniform vec2 u_res;
        uniform sampler2D tCA;

        #define MAX_STEPS 80
        #define SURF_DIST 0.005
        #define MAX_DIST 20.0

        mat2 rot(float a) {
            float s = sin(a), c = cos(a);
            return mat2(c, -s, s, c);
        }

        // Structural Color Cosine Palette (Vivid, no grays)
        vec3 palette(float t) {
            vec3 a = vec3(0.5, 0.5, 0.5);
            vec3 b = vec3(0.5, 0.5, 0.5);
            vec3 c = vec3(1.0, 1.0, 1.0);
            vec3 d = vec3(0.3, 0.2, 0.8); // Acid/Violet bias
            return a + b * cos(6.28318 * (c * t + d));
        }

        float sdBox(vec3 p, vec3 b) {
            vec3 q = abs(p) - b;
            return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
        }

        float sdTorus(vec3 p, vec2 t) {
            vec2 q = vec2(length(p.xy)-t.x,p.z);
            return length(q)-t.y;
        }

        // Dream Physics Map
        vec2 map(vec3 p) {
            vec3 bp = p;
            
            // Spatial anomaly: memory gravity twisting space
            p.xy *= rot(p.z * 0.2 * sin(u_time*0.1));
            
            // Domain repetition for infinite browser-cathedral
            vec3 rp = p;
            rp.z = mod(p.z + u_time, 4.0) - 2.0;
            
            // The Oracle (Central Torus tunnel)
            float dOracle = sdTorus(rp, vec2(1.5, 0.2 + 0.1*sin(p.z*5.0 - u_time*3.0)));
            
            // Floating Browser Panels (Early Internet Fragments)
            vec3 bBoxP = p;
            bBoxP.xy *= rot(u_time * 0.2);
            bBoxP.x = mod(bBoxP.x, 3.0) - 1.5;
            bBoxP.y = mod(bBoxP.y, 3.0) - 1.5;
            bBoxP.z = mod(bBoxP.z + u_time*2.0, 6.0) - 3.0;
            float dPanels = sdBox(bBoxP, vec3(0.6, 0.4, 0.05));
            
            // Op-Art displacement based on CA
            float caVal = texture(tCA, vUv + p.xy*0.1).r;
            float opArt = sin(length(p.xy)*20.0 - u_time*5.0) * 0.05 * caVal;
            
            dOracle += opArt;
            
            float d = min(dOracle, dPanels);
            float mat = d == dOracle ? 1.0 : 2.0;
            return vec2(d, mat);
        }

        vec3 getNormal(vec3 p) {
            vec2 e = vec2(0.001, 0);
            float d = map(p).x;
            vec3 n = d - vec3(
                map(p-e.xyy).x,
                map(p-e.yxy).x,
                map(p-e.yyx).x);
            return normalize(n);
        }

        void main() {
            vec2 uv = (vUv - 0.5) * 2.0;
            uv.x *= u_res.x / u_res.y;

            vec3 ro = vec3(0.0, 0.0, -3.0);
            vec3 rd = normalize(vec3(uv, 1.0));

            float dO = 0.0;
            float mat = 0.0;
            vec3 p;

            for(int i=0; i<MAX_STEPS; i++) {
                p = ro + rd * dO;
                vec2 dS = map(p);
                dO += dS.x;
                mat = dS.y;
                if(dO > MAX_DIST || abs(dS.x) < SURF_DIST) break;
            }

            // Base shadow color (Plum/Indigo)
            vec3 col = vec3(0.15, 0.0, 0.25); 

            if(dO < MAX_DIST) {
                vec3 n = getNormal(p);
                vec3 v = -rd;
                
                // Structural Color & Birefringence
                float ndotv = max(0.0, dot(n, v));
                
                if (mat == 1.0) { // Oracle Tunnel
                    // Interference fringes
                    col = palette(ndotv * 4.0 - u_time*0.5);
                    // Op-Art Moire overlay
                    col *= 0.5 + 0.5 * sin(p.z * 50.0) * sin(p.x * 50.0);
                } else { // Browser Panels
                    // Chromatic dispersion iridescence
                    col = palette(p.x*0.5 + p.y*0.5 + u_time);
                    // Fake UI bevels
                    float bevel = step(0.9, fract(p.x * 4.0)) + step(0.9, fract(p.y * 4.0));
                    col = mix(col, vec3(0.0, 1.0, 0.8), bevel); // Neon cyan borders
                }
                
                // Distance fog (Saturated teal instead of black)
                col = mix(col, vec3(0.0, 0.2, 0.3), dO/MAX_DIST);
            } else {
                // Background: CA driven moire
                float ca = texture(tCA, vUv).r;
                col = mix(vec3(0.3, 0.0, 0.4), vec3(1.0, 0.2, 0.6), ca);
                col += sin(uv.x*100.0)*sin(uv.y*100.0)*0.1;
            }

            fragColor = vec4(col, 1.0);
        }
      `
    });

    // 3. Composite Shader: Datamosh, VHS, Riso, Cross-Process, Color Rules
    const compMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_res: { value: new THREE.Vector2(grid.width, grid.height) },
        tScene: { value: null },
        tPrev: { value: null },
        tCA: { value: null }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        
        uniform float u_time;
        uniform vec2 u_res;
        uniform sampler2D tScene;
        uniform sampler2D tPrev;
        uniform sampler2D tCA;

        // Hash for noise
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

        // Luminance
        float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

        // Risograph Halftone
        float halftone(vec2 uv, float angle, float lpi, float val) {
            float c = cos(angle), s = sin(angle);
            vec2 rot = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
            vec2 grid = fract(rot * lpi) - 0.5;
            float radius = val * 0.7; // dot gain
            return smoothstep(radius, radius - 0.1, length(grid));
        }

        void main() {
            vec2 uv = vUv;
            
            // --- VHS TRACKING & WOBBLE ---
            float trackY = fract(u_time * 0.2);
            float trackBand = smoothstep(0.05, 0.0, abs(uv.y - trackY));
            uv.x += sin(uv.y * 50.0 + u_time * 10.0) * trackBand * 0.02;
            uv.x += sin(uv.y * 5.0) * 0.005; // Base wow/flutter

            // --- DATAMOSH (Temporal Memory) ---
            // Calculate pseudo motion vectors from previous frame luminance
            float px = 1.0 / u_res.x;
            float py = 1.0 / u_res.y;
            float lC = luma(texture(tPrev, uv).rgb);
            float lR = luma(texture(tPrev, uv + vec2(px, 0)).rgb);
            float lU = luma(texture(tPrev, uv + vec2(0, py)).rgb);
            vec2 motion = vec2(lR - lC, lU - lC) * 2.0; // Flow field
            
            // CA mind dictates where datamoshing happens
            float caMask = texture(tCA, uv).r;
            vec2 moshUv = uv - motion * 0.02 * caMask;
            
            // I-Frame stutter (freeze randomly)
            float iFrame = step(0.95, hash(vec2(floor(u_time * 2.0))));
            
            vec3 sceneCol = texture(tScene, uv).rgb;
            vec3 prevCol = texture(tPrev, moshUv).rgb;
            
            // Blend scene and memory
            vec3 baseCol = mix(sceneCol, prevCol, 0.6 * caMask + iFrame * 0.8);

            // --- CHROMATIC ABERRATION & RISO LOGIC ---
            // Treat as misregistered inks
            vec2 misregR = vec2(0.005, 0.002) * sin(u_time);
            vec2 misregG = vec2(-0.003, -0.004) * cos(u_time * 1.2);
            vec2 misregB = vec2(0.002, -0.001);
            
            vec3 rCol = texture(tScene, uv + misregR).rgb;
            vec3 gCol = texture(tScene, uv + misregG).rgb;
            vec3 bCol = texture(tScene, uv + misregB).rgb;
            
            // Halftone screening (AM)
            float lpi = 80.0;
            float htR = halftone(uv, 0.26, lpi, luma(rCol));
            float htG = halftone(uv, 1.30, lpi, luma(gCol));
            float htB = halftone(uv, 1.83, lpi, luma(bCol));

            // Riso Ink Colors (Saturated, no neutrals)
            vec3 inkFluoPink = vec3(1.0, 0.42, 0.71);
            vec3 inkAcidYellow = vec3(0.8, 1.0, 0.0);
            vec3 inkNeonCyan = vec3(0.0, 0.9, 1.0);
            
            // Multiply blend inks
            vec3 risoCol = vec3(1.0);
            risoCol *= mix(vec3(1.0), inkFluoPink, htR);
            risoCol *= mix(vec3(1.0), inkAcidYellow, htG);
            risoCol *= mix(vec3(1.0), inkNeonCyan, htB);
            
            // Blend base continuous color with riso texture
            vec3 finalCol = mix(baseCol, risoCol, 0.4);

            // --- CROSS-PROCESSING & ABSOLUTE COLOR RULES ---
            // Force deep saturated shadows, vibrant mids, tinted highlights
            
            vec3 shadowTarget = vec3(0.1, 0.0, 0.25); // Deep Indigo/Plum
            vec3 midTarget = vec3(0.9, 0.2, 0.5);     // Hot Coral/Pink
            vec3 highTarget = vec3(0.8, 1.0, 0.2);    // Acid Yellow bloom
            
            float lum = luma(finalCol);
            
            // Tone mapping
            if(lum < 0.33) {
                finalCol = mix(shadowTarget, midTarget, lum / 0.33);
            } else if (lum < 0.66) {
                finalCol = mix(midTarget, highTarget, (lum - 0.33) / 0.33);
            } else {
                finalCol = mix(highTarget, inkNeonCyan, (lum - 0.66) / 0.34);
            }
            
            // Add colored tape dropout/scars
            float dropout = step(0.98, hash(vec2(uv.y * 100.0, u_time * 10.0)));
            finalCol = mix(finalCol, vec3(1.0, 0.0, 0.5), dropout * caMask); // Pink dropouts

            // ABSOLUTE CLAMPING (No pure black, no pure white)
            finalCol = max(finalCol, vec3(0.05, 0.0, 0.15)); // Minimum is dark violet
            finalCol = min(finalCol, vec3(1.0, 0.9, 0.95));  // Maximum is pale pink/yellow, not white

            fragColor = vec4(finalCol, 1.0);
        }
      `
    });

    // 4. Output to Screen Shader
    const screenMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tTex: { value: null }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D tTex;
        void main() {
          fragColor = texture(tTex, vUv);
        }
      `
    });

    const mesh = new THREE.Mesh(geometry, caMat); // Material swapped during render loop
    scene.add(mesh);

    canvas.__three = { 
      renderer, scene, camera, mesh, 
      caMat, sceneMat, compMat, screenMat,
      caA, caB, sceneFBO, compA, compB
    };
  }

  const t = canvas.__three;
  
  // Handle resize safely
  if (t.renderer.getSize(new THREE.Vector2()).x !== grid.width || t.renderer.getSize(new THREE.Vector2()).y !== grid.height) {
    t.renderer.setSize(grid.width, grid.height, false);
    t.sceneFBO.setSize(grid.width, grid.height);
    t.compA.setSize(grid.width, grid.height);
    t.compB.setSize(grid.width, grid.height);
    t.sceneMat.uniforms.u_res.value.set(grid.width, grid.height);
    t.compMat.uniforms.u_res.value.set(grid.width, grid.height);
  }

  // Update time
  t.caMat.uniforms.u_time.value = time;
  t.sceneMat.uniforms.u_time.value = time;
  t.compMat.uniforms.u_time.value = time;

  // --- RENDER PIPELINE ---

  // 1. Update Cellular Automata Brain
  t.mesh.material = t.caMat;
  t.caMat.uniforms.tState.value = t.caA.texture;
  t.renderer.setRenderTarget(t.caB);
  t.renderer.render(t.scene, t.camera);
  // Swap CA FBOs
  let tempCa = t.caA; t.caA = t.caB; t.caB = tempCa;

  // 2. Render Dream Physics Architecture
  t.mesh.material = t.sceneMat;
  t.sceneMat.uniforms.tCA.value = t.caA.texture;
  t.renderer.setRenderTarget(t.sceneFBO);
  t.renderer.render(t.scene, t.camera);

  // 3. Composite: Datamosh, VHS, Riso, Colors
  t.mesh.material = t.compMat;
  t.compMat.uniforms.tScene.value = t.sceneFBO.texture;
  t.compMat.uniforms.tPrev.value = t.compA.texture; // Read previous frame
  t.compMat.uniforms.tCA.value = t.caA.texture;
  t.renderer.setRenderTarget(t.compB);
  t.renderer.render(t.scene, t.camera);

  // 4. Draw to Screen
  t.mesh.material = t.screenMat;
  t.screenMat.uniforms.tTex.value = t.compB.texture;
  t.renderer.setRenderTarget(null);
  t.renderer.render(t.scene, t.camera);

  // Swap Composite FBOs for next frame's datamosh memory
  let tempComp = t.compA; t.compA = t.compB; t.compB = tempComp;

} catch (e) {
  console.error("Prismatic Tape Oracle Initialization Failed:", e);
  throw e;
}