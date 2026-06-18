try {
  if (!ctx) throw new Error("WebGL 2 context not available");

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
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
      precision highp float;
      
      in vec2 vUv;
      out vec4 fragColor;
      
      uniform float u_time;
      uniform vec2 u_resolution;

      // ─── MATH & NOISE UTILS ──────────────────────────────────────────
      vec2 hash2(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p) * 43758.5453123);
      }
      
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
        float f = 0.0;
        float amp = 0.5;
        for(int i = 0; i < 5; i++) {
          f += amp * noise(p);
          p *= 2.0;
          amp *= 0.5;
        }
        return f;
      }

      // Curl noise for "Semantic Font Rot" / Fluid distortion
      vec2 curl(vec2 p) {
        float e = 0.05;
        float dx = fbm(p + vec2(e, 0.0)) - fbm(p - vec2(e, 0.0));
        float dy = fbm(p + vec2(0.0, e)) - fbm(p - vec2(0.0, e));
        return vec2(dy, -dx) / (2.0 * e);
      }

      // Voronoi for Mycelial Anastomosis & Sectoring
      vec3 voronoi(vec2 x) {
        vec2 n = floor(x);
        vec2 f = fract(x);
        float F1 = 8.0;
        float F2 = 8.0;
        for(int j = -1; j <= 1; j++) {
          for(int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = hash2(n + g);
            // Wriggling hyphae animation
            o = 0.5 + 0.5 * sin(u_time * 0.8 + 6.28318 * o);
            vec2 r = g + o - f;
            float d = dot(r, r);
            if(d < F1) {
              F2 = F1;
              F1 = d;
            } else if(d < F2) {
              F2 = d;
            }
          }
        }
        return vec3(sqrt(F1), sqrt(F2), F2 - F1);
      }

      // ─── COLOR SYSTEMS (OKLCh to sRGB) ──────────────────────────────
      vec3 oklch_to_srgb(float L, float C, float h) {
        float h_rad = h * 3.14159265359 / 180.0;
        float a = C * cos(h_rad);
        float b = C * sin(h_rad);

        float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
        float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
        float s_ = L - 0.0894841775 * a - 1.2914855480 * b;

        float l3 = l_ * l_ * l_;
        float m3 = m_ * m_ * m_;
        float s3 = s_ * s_ * s_;

        vec3 rgb = vec3(
             4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
            -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
            -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3
        );

        // sRGB Gamma encoding (strict avoidance of clipping where possible)
        return mix(12.92 * rgb, 1.055 * pow(max(rgb, vec3(0.0)), vec3(1.0/2.4)) - 0.055, step(0.0031308, rgb));
      }

      void main() {
        // Aspect ratio correction
        vec2 uv = vUv * 2.0 - 1.0;
        uv.x *= u_resolution.x / u_resolution.y;
        
        // 1. Mycelial Search Space (Domain Warping via Curl)
        vec2 p = uv * 3.0;
        p += curl(p * 1.5 + u_time * 0.2) * 0.6;
        
        // 2. Anastomosis Network (Fungal Fusion)
        vec3 v = voronoi(p * 2.5);
        // v.z (F2 - F1) defines the cell boundaries. We invert it for hyphal cords.
        float hyphae = smoothstep(0.15, 0.0, v.z);
        float nodes = smoothstep(0.4, 0.0, v.x); // Connection points
        
        // 3. Brown Rot Cubical Cracking (Quantized spatial decay)
        vec2 cube_uv = floor(uv * 12.0) / 12.0;
        float decay_front = fbm(cube_uv * 4.0 - u_time * 0.5);
        float brown_rot = smoothstep(0.4, 0.6, decay_front);

        // 4. Gematria Resonance / Structural Color (LOGOS=373, ICHTHYS=1224)
        float r = length(uv);
        float angle = atan(uv.y, uv.x);
        
        // Standing waves based on sacred ratios (3:10 approx)
        float logos = sin(r * 37.3 - u_time * 3.0);
        float ichthys = sin(r * 122.4 + u_time * 2.0);
        float resonance = logos * ichthys;

        // I-Ching Trigram 8-fold Symmetry (Fruiting bodies)
        float bagua = sin(8.0 * angle + u_time);
        float fruiting = smoothstep(0.8, 1.0, bagua * nodes);

        // 5. Assembling the OKLCh Color (Strict: No Black, No White, Full Color)
        // Lightness bounded between 0.4 and 0.75
        float base_L = 0.55 + 0.15 * fbm(p + u_time);
        float L = base_L + hyphae * 0.15 - brown_rot * 0.1;
        L = clamp(L, 0.4, 0.75); // Absolute prohibition of black/white

        // Chroma strictly high for nauseatingly vibrant "slime plastic" look
        float C = 0.22 + 0.1 * resonance + 0.05 * fruiting;
        C = clamp(C, 0.15, 0.35);

        // Hue driven by time, space, and mathematical sequences
        // Base hue drifts over time
        float h = u_time * 45.0 + fbm(p * 0.5) * 360.0;
        
        // Apply Golden Angle (137.508) harmony shifts based on biological features
        h += hyphae * 137.508; 
        
        // Apply Itten's Maximum Vibration Contrast (Complementary +180) at decay fronts
        h += brown_rot * 180.0;
        
        // Thin-film interference iridescence applied to hue
        float thickness = mix(300.0, 800.0, v.x); // 300-800nm
        float cosTheta = abs(dot(normalize(vec3(uv, 1.0)), vec3(0.0, 0.0, 1.0)));
        h += sin(thickness * cosTheta * 0.01) * 90.0;

        // Force maximum vibration (Red-Cyan or Violet-Lime) at the nodes
        if (fruiting > 0.1) {
            h = mix(h, 272.0 + u_time * 100.0, fruiting); // Perceptual Violet spinning
            C = 0.35; // Max chroma
            L = 0.65; // High visibility
        }

        // Final conversion to sRGB
        vec3 finalColor = oklch_to_srgb(L, C, mod(h, 360.0));
        
        fragColor = vec4(finalColor, 1.0);
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
  
  if (material && material.uniforms && material.uniforms.u_time) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }
  
  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);

} catch (e) {
  console.error("WebGL Initialization Failed:", e);
}