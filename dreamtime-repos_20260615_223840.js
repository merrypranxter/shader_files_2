if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({
      canvas,
      context: ctx,
      alpha: true,
      antialias: true
    });
    
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      in vec2 vUv;
      out vec4 fragColor;

      uniform float u_time;
      uniform vec2 u_resolution;

      // ─── ALCHEMICAL NOISE ENGINE ───────────────────────────────────────────
      
      vec2 hash22(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.xx + p3.yz) * p3.zy);
      }
      
      float hash12(vec2 p) {
        vec3 p3  = fract(vec3(p.xyx) * .1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash12(i);
        float b = hash12(i + vec2(1.0, 0.0));
        float c = hash12(i + vec2(0.0, 1.0));
        float d = hash12(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      
      float fbm(vec2 p) {
        float f = 0.0;
        float amp = 0.5;
        for(int i = 0; i < 4; i++) {
          f += amp * noise(p);
          p *= 2.0;
          amp *= 0.5;
        }
        return f;
      }

      // ─── COLOR PROTOCOLS ───────────────────────────────────────────────────
      
      vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
        return a + b * cos(6.2831853 * (c * t + d));
      }
      
      // Neon Cyberpunk Acid (Parasite/BZ Spirals)
      vec3 neonAcid(float t) {
        return palette(t, vec3(0.5), vec3(0.5), vec3(2.0, 1.0, 1.0), vec3(0.5, 0.2, 0.25));
      }
      
      // Post-1971 Acrylic Contemporary (Host/Dreamtime Map)
      vec3 acrylicContemporary(float t) {
        return palette(t, vec3(0.6, 0.3, 0.2), vec3(0.4, 0.3, 0.2), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.1, 0.2));
      }

      // ─── LIVING DREAMTIME TOPOLOGY ─────────────────────────────────────────
      
      vec3 scene(vec2 p) {
        // Morphogenesis domain warp (Fluid advection memory)
        vec2 warp = vec2(fbm(p * 2.5 + u_time * 0.15), fbm(p * 2.5 - u_time * 0.12 + 10.0));
        vec2 p_warp = p + warp * 0.4;

        // Waterhole nodes (Poisson-ish drifting centers)
        const int NUM_NODES = 10;
        vec2 nodes[NUM_NODES];
        for(int i = 0; i < NUM_NODES; i++) {
          float fi = float(i);
          vec2 seed = hash22(vec2(fi, 1.618)); // Golden ratio offset
          nodes[i] = vec2(
            sin(u_time * 0.1 + seed.x * 6.28) * 1.8,
            cos(u_time * 0.13 + seed.y * 6.28) * 1.0
          );
        }

        // Compute Vietoris-Rips / Voronoi graph distances
        float d1 = 1e20;
        float d2 = 1e20;
        int closest_node = 0;
        vec2 closest_pos = vec2(0.0);

        for(int i = 0; i < NUM_NODES; i++) {
          float d = length(p_warp - nodes[i]);
          if(d < d1) {
            d2 = d1;
            d1 = d;
            closest_node = i;
            closest_pos = nodes[i];
          } else if(d < d2) {
            d2 = d;
          }
        }

        // 1. Dreaming Tracks (Voronoi edges forming the country network)
        float edge_dist = d2 - d1;
        float track_mask = smoothstep(0.07, 0.015, edge_dist); 
        
        // 2. Waterholes (Belousov-Zhabotinsky Spirals acting as Parasites)
        float angle = atan(p_warp.y - closest_pos.y, p_warp.x - closest_pos.x);
        float spiral_arms = 3.0;
        float phase = d1 * 25.0 + angle * spiral_arms - u_time * 2.0;
        float rings = smoothstep(0.1, 0.8, sin(phase));
        float waterhole_mask = smoothstep(0.4, 0.15, d1); 
        
        // 3. Country Infill (Quasicrystal Dot Painting)
        // Projects 5-fold Penrose interference onto the canvas
        vec2 dot_uv = p * 60.0 + warp * 4.0; 
        float quasi = 0.0;
        for(int i = 0; i < 5; i++) {
          float a = float(i) * 3.14159265 / 5.0;
          vec2 dir = vec2(cos(a), sin(a));
          quasi += cos(dot(dot_uv, dir) + u_time * 1.5 * sin(a));
        }
        
        // Turing field modulates the dot density (Morphogenesis)
        float turing_field = fbm(p * 4.0 - u_time * 0.05);
        float threshold = 1.0 + 3.0 * turing_field;
        float qc_dots = smoothstep(threshold, threshold + 0.5, quasi);

        // ─── ALCHEMICAL COMPOSITION ──────────────────────────────────────────
        
        vec3 bg_color = vec3(0.04, 0.01, 0.02); // Void black
        vec3 col = bg_color;

        // Base infill: 5-fold quasiperiodic dots mapped to Acrylic Earth tones
        vec3 dot_color = acrylicContemporary(turing_field * 2.0 + length(p) * 0.4);
        float country_mask = (1.0 - waterhole_mask) * (1.0 - track_mask);
        col = mix(col, dot_color, qc_dots * country_mask * 0.95);

        // Meandering Tracks: Neon Acid cutting through the Earth palette
        vec3 track_color = neonAcid(edge_dist * 3.0 - u_time * 0.25);
        float dash = smoothstep(0.1, 0.6, sin(edge_dist * 60.0 + u_time * 4.0));
        col = mix(col, track_color, track_mask * (0.5 + 0.5 * dash));

        // Nodes: Excitable media spirals blooming at the waterholes
        float node_seed = float(closest_node) * 0.213;
        vec3 spiral_color = neonAcid(d1 * 2.5 + u_time * 0.15 + node_seed);
        float core = smoothstep(0.05, 0.0, d1);
        spiral_color += core * vec3(1.0, 0.9, 0.8); // White-hot center
        col = mix(col, spiral_color, waterhole_mask * rings);

        return col;
      }

      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        p.x *= u_resolution.x / u_resolution.y;

        // Paper Misregistration / Chromatic Aberration via FBM
        float shift = 0.008 * fbm(p * 8.0 + u_time * 0.5);
        vec2 offsetR = vec2(shift, 0.0);
        vec2 offsetB = vec2(-shift, shift * 0.5);

        // Sample the scene at different offsets for RGB channels
        float r = scene(p + offsetR).r;
        float g = scene(p).g;
        float b = scene(p + offsetB).b;

        vec3 col = vec3(r, g, b);

        // Void Vignette (Visual Bible Rule 1)
        float vig = 1.0 - smoothstep(0.6, 1.8, length(p));
        col *= vig;

        fragColor = vec4(col, 1.0);
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
  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
    return;
  }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material?.uniforms?.u_time) {
  material.uniforms.u_time.value = time;
  material.uniforms.u_resolution.value.set(grid.width, grid.height);
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);