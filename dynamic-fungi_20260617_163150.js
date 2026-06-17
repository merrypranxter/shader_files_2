try {
  // Check if WebGL context exists and Three.js is available
  if (!ctx) throw new Error("Context not provided");
  
  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      in vec2 vUv;
      out vec4 fragColor;
      
      uniform float u_time;
      uniform vec2 u_resolution;

      // --- ALCHEMICAL MATH & NOISE ---
      
      // Hardware entropy/noise
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
      
      float snoise(vec2 v) {
          const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
          vec2 i  = floor(v + dot(v, C.yy));
          vec2 x0 = v - i + dot(i, C.xx);
          vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod289(i);
          vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
          vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
          m = m * m;
          m = m * m;
          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
          vec3 g;
          g.x  = a0.x  * x0.x  + h.x  * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
      }

      float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for(int i = 0; i < 6; i++) {
              v += a * snoise(p);
              p *= 2.01;
              a *= 0.52;
          }
          return v;
      }

      // Mycological Voronoi (Spores / Cleistothecia)
      vec2 random2(vec2 p) {
          return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);
      }
      
      float voronoi(vec2 x) {
          vec2 n = floor(x);
          vec2 f = fract(x);
          float m = 8.0;
          for(int j = -1; j <= 1; j++) {
              for(int i = -1; i <= 1; i++) {
                  vec2 g = vec2(float(i), float(j));
                  vec2 o = random2(n + g);
                  o = 0.5 + 0.5 * sin(u_time * 0.8 + 6.2831 * o); // Bioluminescent pulse
                  vec2 r = g + o - f;
                  float d = dot(r,r);
                  m = min(m, d);
              }
          }
          return sqrt(m);
      }

      // Risograph Halftone Math
      float halftone(vec2 uv, float lpi, float angle) {
          float c = cos(angle), s = sin(angle);
          vec2 rot = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
          vec2 cell = fract(rot * lpi) - 0.5;
          return length(cell);
      }

      void main() {
          vec2 st = vUv * 2.0 - 1.0;
          st.x *= u_resolution.x / u_resolution.y;
          
          // --- DREAM PHYSICS: ONEIROS FLUID & STRUCTURAL COLOR ---
          // Domain warping to simulate affective energy fields
          vec2 q = vec2(fbm(st * 2.5 + u_time * 0.15), fbm(st * 2.5 - u_time * 0.12));
          vec2 r = vec2(fbm(st * 5.0 + q * 3.0 + u_time * 0.2), fbm(st * 5.0 + q * 3.0 - u_time * 0.25));
          float oneiros = fbm(st * 3.0 + r * 4.0);
          
          // Thin-film interference (Bragg's Law adaptation)
          float thickness = 250.0 + oneiros * 650.0; 
          vec3 structuralCol = 0.5 + 0.45 * cos(6.28318 * (thickness / vec3(430.0, 520.0, 680.0)));
          
          // Shift structural color to avoid white/black (Deep Purple to Azure)
          vec3 bgCol = mix(vec3(0.18, 0.05, 0.4), structuralCol, 0.8);

          // --- MYCELIAL NETWORKS: ANASTOMOSIS & HYPHAE ---
          // Ridge noise simulates cord-forming rhizomorphs
          float ridge = 0.0;
          vec2 ruv = st * 3.5 + q * 1.5;
          float amp = 0.5;
          for(int i = 0; i < 5; i++) {
              ridge += amp * (1.0 - abs(snoise(ruv)));
              ruv *= 2.0;
              amp *= 0.5;
          }
          
          // Tubular hyphae structure
          float hyphae = smoothstep(0.35, 0.65, ridge) * smoothstep(0.9, 0.65, ridge);
          // Hyphal colors: Bioluminescent Acid Green to Toxic Orange
          vec3 hyphaeCol = mix(vec3(0.0, 0.85, 0.4), vec3(1.0, 0.5, 0.0), oneiros);
          
          // Add rhythmic Foxfire bioluminescence
          float foxfire = 0.5 + 0.5 * sin(u_time * 2.0 + ridge * 10.0);
          hyphaeCol += vec3(0.2, 0.9, 0.6) * foxfire * 0.4 * hyphae;

          // --- RISOGRAPH REGIME: MISREG_CHAOS & FLUORESCENT_GLOW ---
          // Spore clusters
          float spores = voronoi(st * 12.0 - r + u_time * 0.3);
          float sporeMask = smoothstep(0.45, 0.1, spores) * smoothstep(0.2, 0.8, oneiros);
          
          float lpi = 85.0;
          float dot_gain = 1.15;
          
          // Ink 1: Fluo Pink (45 degrees)
          float ht_pink = halftone(st, lpi, 0.785);
          // Ink 2: Teal (105 degrees) with chaotic animated misregistration
          vec2 misreg = vec2(sin(u_time * 0.4), cos(u_time * 0.27)) * 0.08;
          float ht_teal = halftone(st + misreg, lpi, 1.832);
          
          // Thresholding with dot gain
          float pink_dot = smoothstep(0.35 / dot_gain, 0.05, ht_pink - sporeMask);
          float teal_dot = smoothstep(0.35 / dot_gain, 0.05, ht_teal - (sporeMask * 0.85));
          
          vec3 pinkInk = vec3(1.0, 0.25, 0.65) * pink_dot;
          vec3 tealInk = vec3(0.0, 0.75, 0.85) * teal_dot;
          
          // Screen blend the RISO inks (additive over dark background)
          vec3 sporeCol = 1.0 - (1.0 - pinkInk) * (1.0 - tealInk);

          // --- COMPOSITING ---
          // Screen blend Hyphae over Background
          vec3 finalCol = 1.0 - (1.0 - bgCol) * (1.0 - hyphaeCol * hyphae * 0.9);
          // Screen blend Spores over everything
          finalCol = 1.0 - (1.0 - finalCol) * (1.0 - sporeCol);
          
          // --- SIMULATION HYPOTHESIS ARTIFACTS ---
          // TAA Ghosting / Z-Fight Scanlines
          float scanline = smoothstep(0.85, 1.0, sin(st.y * 200.0 + u_time * 8.0)) * 0.15;
          finalCol += vec3(scanline * 0.8, scanline * 0.2, scanline);
          
          // --- STRICT CONSTRAINTS ENFORCEMENT ---
          // NO BLACK OR WHITE ALLOWED. NO EMPTY SPACE.
          // Map the entire color range into a highly saturated, non-monochrome safe zone.
          // Darkest dark = Rich Indigo. Brightest bright = Vibrant Peach/Pink.
          finalCol = clamp(finalCol, 0.0, 1.0);
          finalCol = mix(vec3(0.08, 0.02, 0.18), vec3(0.98, 0.82, 0.92), finalCol);
          
          fragColor = vec4(finalCol, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader,
      fragmentShader,
      depthWrite: false,
      depthTest: false
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    
    canvas.__three = { renderer, scene, camera, material };
  }

  const { renderer, scene, camera, material } = canvas.__three;
  
  if (material && material.uniforms) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }
  
  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);

} catch (e) {
  console.error("Feral Fungal WebGL Failure:", e);
}