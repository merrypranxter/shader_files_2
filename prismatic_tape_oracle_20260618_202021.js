try {
  if (!ctx) throw new Error("WebGL2 context required");

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      context: ctx,
      alpha: true,
      antialias: false,
      powerPreference: "high-performance"
    });
    renderer.autoClear = false;

    // Use FloatType for feedback buffers to prevent precision loss in CA/Datamosh
    const rtOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping
    };

    const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
    const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    // --- COMMON GLSL CHUNKS ---
    const oklabFns = `
      vec3 linear_srgb_to_oklab(vec3 c) {
        float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
        float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
        float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
        float l_ = pow(l, 1.0/3.0);
        float m_ = pow(m, 1.0/3.0);
        float s_ = pow(s, 1.0/3.0);
        return vec3(
          0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
          1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
          0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
        );
      }
      vec3 oklab_to_linear_srgb(vec3 c) {
        float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
        float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
        float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
        float l = l_ * l_ * l_;
        float m = m_ * m_ * m_;
        float s = s_ * s_ * s_;
        return vec3(
          4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
         -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
         -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
        );
      }
      vec3 oklab_mix(vec3 colA, vec3 colB, float t) {
        vec3 labA = linear_srgb_to_oklab(colA);
        vec3 labB = linear_srgb_to_oklab(colB);
        return oklab_to_linear_srgb(mix(labA, labB, t));
      }
    `;

    const noiseFns = `
      float hash12(vec2 p) {
        vec3 p3  = fract(vec3(p.xyx) * .1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      vec2 hash22(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
        p3 += dot(p3, p3.yzx+33.33);
        return fract((p3.xx+p3.yz)*p3.zy);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash12(i + vec2(0.0,0.0)), hash12(i + vec2(1.0,0.0)), u.x),
                   mix(hash12(i + vec2(0.0,1.0)), hash12(i + vec2(1.0,1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float f = 0.0; float a = 0.5;
        for(int i=0; i<4; i++) { f += a*noise(p); p *= 2.0; a *= 0.5; }
        return f;
      }
      mat2 rot(float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, -s, s, c);
      }
    `;

    // --- SIMULATION SHADER (Raymarch + CA + Datamosh + Dream Physics) ---
    const simMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_res: { value: new THREE.Vector2(grid.width, grid.height) },
        u_prev: { value: null }
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
        uniform sampler2D u_prev;

        ${noiseFns}

        // Palette for structural color / Bragg reflection
        vec3 cosPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
          return a + b * cos(6.28318 * (c * t + d));
        }

        // Dream Physics Topology
        float sdBox(vec3 p, vec3 b) {
          vec3 q = abs(p) - b;
          return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
        }
        
        float sdTorus(vec3 p, vec2 t) {
          vec2 q = vec2(length(p.xz)-t.x,p.y);
          return length(q)-t.y;
        }

        float opArtField(vec3 p) {
          // Moiré / vibrating phase field
          return sin(length(p.xy)*25.0 - u_time*4.0) * 0.03;
        }

        vec2 map(vec3 p) {
          vec3 pOrig = p;
          
          // Kairotempics: Space bends with time and memory
          float t = u_time * 0.2;
          p.xy *= rot(sin(p.z * 0.1 + t) * 0.5);
          
          // Central Oracle Portal
          vec3 pTorus = p;
          pTorus.xy *= rot(u_time * 0.5);
          float dOracle = sdTorus(pTorus, vec2(1.5, 0.3)) + opArtField(pOrig);
          
          // Floating Browser Fragments (Early Internet Shrine)
          vec3 pBox = pOrig;
          pBox.z += u_time;
          pBox.xy = fract(pBox.xy * 0.5 + 0.5) * 2.0 - 1.0; 
          pBox.xy *= rot(pBox.z * 0.2);
          float dPanels = sdBox(pBox, vec3(0.6, 0.4, 0.05));
          dPanels = max(dPanels, -sdBox(pBox, vec3(0.5, 0.3, 0.2))); // hollow out
          
          // Identity topology: recursive intersection
          float d = min(dOracle, dPanels);
          
          // ID 1.0 for Oracle, 2.0 for Panels
          float id = d == dOracle ? 1.0 : 2.0;
          return vec2(d, id);
        }

        vec3 calcNormal(vec3 p) {
          vec2 e = vec2(0.01, 0.0);
          return normalize(vec3(
            map(p+e.xyy).x - map(p-e.xyy).x,
            map(p+e.yxy).x - map(p-e.yxy).x,
            map(p+e.yyx).x - map(p-e.yyx).x
          ));
        }

        void main() {
          vec2 uv = vUv;
          vec2 p = (uv - 0.5) * 2.0;
          p.x *= u_res.x / u_res.y;

          // --- DATAMOSH & VHS MEMORY (UV Warping on previous frame) ---
          vec2 flow = hash22(uv * 5.0 + u_time*0.1) - 0.5;
          // Tape wobble
          float wobble = sin(uv.y * 10.0 + u_time * 5.0) * 0.005;
          // Prediction smear
          vec2 moshUV = uv - flow * 0.015 * (sin(u_time*0.5)*0.5+0.5);
          moshUV.x += wobble;
          
          vec4 prev = texture(u_prev, fract(moshUV));

          // --- CELLULAR AUTOMATA (Reaction-Diffusion style intelligence) ---
          vec2 texel = 1.0 / u_res;
          vec4 n = texture(u_prev, fract(uv + vec2(0.0, texel.y)));
          vec4 s = texture(u_prev, fract(uv - vec2(0.0, texel.y)));
          vec4 e = texture(u_prev, fract(uv + vec2(texel.x, 0.0)));
          vec4 w = texture(u_prev, fract(uv - vec2(texel.x, 0.0)));
          vec4 laplace = n + s + e + w - 4.0 * prev;
          
          // CA state evolution (stored in rgb, acting like chemical concentrations)
          vec4 caState = prev + laplace * 0.2;
          caState += (caState * (1.0 - caState)) * 0.05; // Non-linear growth

          // --- RAYMARCHING THE DREAM ARCHITECTURE ---
          vec3 ro = vec3(0.0, 0.0, 4.0);
          vec3 rd = normalize(vec3(p, -1.5));
          
          float t_d = 0.0;
          vec2 res = vec2(0.0);
          for(int i=0; i<64; i++) {
            vec3 pos = ro + rd * t_d;
            res = map(pos);
            if(res.x < 0.01 || t_d > 10.0) break;
            t_d += res.x * 0.7; // slow march for op-art
          }

          vec4 sceneColor = vec4(0.0);
          
          if(t_d < 10.0) {
            vec3 pos = ro + rd * t_d;
            vec3 N = calcNormal(pos);
            vec3 V = -rd;
            
            // Structural Color / Thin Film Interference
            float viewAngle = max(0.0, dot(N, V));
            float thickness = 400.0 + sin(pos.x*5.0 + u_time)*100.0;
            float pathDiff = 2.0 * 1.5 * thickness * viewAngle; // n=1.5
            
            // Bragg reflection palette
            vec3 structCol = cosPalette(
              pathDiff * 0.001 + u_time*0.1,
              vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67)
            );
            
            // Anisotropic glints
            float glint = pow(max(0.0, sin(dot(N, vec3(0.0,1.0,0.0))*20.0)), 10.0);
            
            sceneColor.rgb = structCol + glint * vec3(1.0, 0.0, 0.5);
            sceneColor.a = 1.0;
            
            // Dream Logic: Objects dissolve based on CA state
            float dissolve = fbm(pos.xy * 10.0 + u_time);
            if(dissolve < caState.r * 0.5) sceneColor.a = 0.0;
          }

          // Composite: Scene over CA/Datamosh background
          // Decay background slightly to prevent whiteout
          vec4 bg = caState * 0.98; 
          
          // Inject new energy into CA
          if(length(p) > 1.5 && hash12(uv + u_time) > 0.99) {
             bg.rgb += vec3(0.5, 0.2, 0.8);
          }

          vec4 finalColor = mix(bg, sceneColor, sceneColor.a);
          
          fragColor = finalColor;
        }
      `
    });

    // --- COMPOSITE SHADER (Riso + CrossProcess + Analog Damage + Color Rules) ---
    const dispMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_res: { value: new THREE.Vector2(grid.width, grid.height) },
        u_simTex: { value: null }
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
        uniform sampler2D u_simTex;

        ${oklabFns}
        ${noiseFns}

        // Risograph Halftone
        float halftone(vec2 uv, float lpi, float angle) {
          float c = cos(angle), s = sin(angle);
          vec2 rotUV = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
          vec2 cell = fract(rotUV * lpi) - 0.5;
          return length(cell) * 2.0; // 0 to 1 distance from center
        }

        void main() {
          vec2 uv = vUv;
          
          // --- VHS CHROMA BLEED & TRACKING TEAR ---
          float tear = step(0.95, sin(uv.y * 15.0 + u_time * 10.0)) * 
                       noise(vec2(u_time * 50.0, uv.y)) * 0.05;
          vec2 readUV = uv + vec2(tear, 0.0);
          
          // Chroma smear (sample horizontally)
          vec4 sim = texture(u_simTex, readUV);
          vec4 simR = texture(u_simTex, readUV + vec2(0.01, 0.0));
          vec4 simL = texture(u_simTex, readUV - vec2(0.01, 0.0));
          
          // Mix luma from center, chroma smeared
          float luma = dot(sim.rgb, vec3(0.299, 0.587, 0.114));
          vec3 smeared = vec3(simL.r, sim.g, simR.b);
          vec3 baseColor = mix(sim.rgb, smeared, 0.6);

          // --- RISOGRAPH INK LOGIC ---
          // Emulate spot colors via thresholding + halftone
          float ht1 = halftone(uv, 80.0, 0.785); // 45 deg
          float ht2 = halftone(uv, 80.0, 1.309); // 75 deg
          
          // Misregistration
          vec2 misreg = vec2(0.005, -0.003) * sin(u_time);
          float luma2 = dot(texture(u_simTex, readUV + misreg).rgb, vec3(0.299, 0.587, 0.114));
          
          float ink1Coverage = smoothstep(0.6, 0.4, ht1 - luma*0.5);
          float ink2Coverage = smoothstep(0.6, 0.4, ht2 - (1.0-luma2)*0.5);

          // --- CROSS-PROCESSING & ABSOLUTE COLOR RULES ---
          // NO black, NO white, NO grayscale.
          // Shadows: Deep Indigo/Plum
          // Mids: Peacock Green / Teal
          // Highs: Hot Pink / Acid Yellow
          
          vec3 shadowCol = vec3(0.15, 0.0, 0.35); // Deep Plum/Indigo
          vec3 midCol    = vec3(0.0, 0.6, 0.5);   // Peacock Teal
          vec3 highCol   = vec3(1.0, 0.0, 0.5);   // Hot Pink
          vec3 acidCol   = vec3(0.8, 1.0, 0.0);   // Acid Yellow

          // Map luminance to saturated palette via OKLab
          vec3 cpColor;
          if (luma < 0.5) {
            cpColor = oklab_mix(shadowCol, midCol, luma * 2.0);
          } else {
            cpColor = oklab_mix(midCol, highCol, (luma - 0.5) * 2.0);
          }
          
          // Apply Riso Ink 2 (Acid Yellow) as a misregistered overprint
          vec3 finalColor = oklab_mix(cpColor, acidCol, ink2Coverage * 0.6);
          
          // --- ANALOG DAMAGE (COLORED) ---
          // Dropout streaks (colored, not white)
          float dropout = step(0.98, hash12(vec2(uv.y * 100.0, floor(u_time * 20.0))));
          finalColor = mix(finalColor, vec3(0.0, 1.0, 1.0), dropout * 0.8); // Neon cyan damage
          
          // Head switching noise at bottom
          if (uv.y < 0.05) {
             float noiseVal = noise(uv * 200.0 + u_time * 10.0);
             finalColor = mix(finalColor, vec3(1.0, 0.4, 0.0), noiseVal * 0.5); // Orange noise
          }

          // Force minimum saturation/brightness to avoid pure black
          finalColor = max(finalColor, vec3(0.05, 0.0, 0.1)); 
          // Prevent pure white
          finalColor = min(finalColor, vec3(1.0, 0.9, 0.95));

          fragColor = vec4(finalColor, 1.0);
        }
      `
    });

    const simScene = new THREE.Scene();
    const simMesh = new THREE.Mesh(geometry, simMat);
    simScene.add(simMesh);

    const dispScene = new THREE.Scene();
    const dispMesh = new THREE.Mesh(geometry, dispMat);
    dispScene.add(dispMesh);

    canvas.__three = {
      renderer, camera,
      rtA, rtB,
      simMat, dispMat,
      simScene, dispScene,
      ping: true
    };
  }

  const t = canvas.__three;
  
  // Resize handling
  if (t.renderer.getSize(new THREE.Vector2()).x !== grid.width || 
      t.renderer.getSize(new THREE.Vector2()).y !== grid.height) {
    t.renderer.setSize(grid.width, grid.height, false);
    t.rtA.setSize(grid.width, grid.height);
    t.rtB.setSize(grid.width, grid.height);
    t.simMat.uniforms.u_res.value.set(grid.width, grid.height);
    t.dispMat.uniforms.u_res.value.set(grid.width, grid.height);
  }

  // 1. Simulation Pass (Feedback)
  const currentRT = t.ping ? t.rtA : t.rtB;
  const nextRT = t.ping ? t.rtB : t.rtA;
  
  t.simMat.uniforms.u_time.value = time;
  t.simMat.uniforms.u_prev.value = currentRT.texture;
  
  t.renderer.setRenderTarget(nextRT);
  t.renderer.render(t.simScene, t.camera);

  // 2. Display Pass (Post-Processing)
  t.dispMat.uniforms.u_time.value = time;
  t.dispMat.uniforms.u_simTex.value = nextRT.texture;
  
  t.renderer.setRenderTarget(null);
  t.renderer.render(t.dispScene, t.camera);

  // Swap buffers
  t.ping = !t.ping;

} catch (e) {
  console.error("Prismatic Tape Oracle initialization failed:", e);
}