try {
  if (!canvas.__three) {
    if (!ctx) throw new Error("WebGL2 context not available");

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

      #define PI 3.14159265358979323846

      // ==========================================
      // MATH & COMPLEX ALGEBRA (Kleinian Groups)
      // ==========================================
      vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
      vec2 cdiv(vec2 a, vec2 b) { float d = dot(b,b); return vec2(dot(a,b), a.y*b.x - a.x*b.y)/d; }
      vec2 cinv(vec2 z) { return vec2(z.x, -z.y) / dot(z,z); }

      // ==========================================
      // OKLAB PERCEPTUAL COLOR (Color Systems)
      // ==========================================
      vec3 oklab_to_linear(vec3 c) {
          float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
          float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
          float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
          float l = l_*l_*l_; float m = m_*m_*m_; float s = s_*s_*s_;
          return vec3(
               4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
              -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
              -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
          );
      }
      float srgb_gamma(float x) {
          return x <= 0.0031308 ? x * 12.92 : 1.055 * pow(max(x, 0.0), 1.0/2.4) - 0.055;
      }
      vec3 oklab_to_srgb(vec3 c) {
          vec3 lin = oklab_to_linear(c);
          return vec3(srgb_gamma(lin.r), srgb_gamma(lin.g), srgb_gamma(lin.b));
      }

      // ==========================================
      // NOISE & ADVECTION (Continuous CA / Wet Engine)
      // ==========================================
      vec2 hash2(vec2 p) {
          p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
          return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
      }
      float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(dot(hash2(i+vec2(0.0,0.0)), f-vec2(0.0,0.0)), 
                         dot(hash2(i+vec2(1.0,0.0)), f-vec2(1.0,0.0)), u.x),
                     mix(dot(hash2(i+vec2(0.0,1.0)), f-vec2(0.0,1.0)), 
                         dot(hash2(i+vec2(1.0,1.0)), f-vec2(1.0,1.0)), u.x), u.y);
      }
      vec2 curl(vec2 p) {
          float e = 0.01;
          float n1 = noise(p + vec2(e, 0.0));
          float n2 = noise(p - vec2(e, 0.0));
          float n3 = noise(p + vec2(0.0, e));
          float n4 = noise(p - vec2(0.0, e));
          return vec2(n3 - n4, -(n1 - n2)) / (2.0 * e);
      }

      // ==========================================
      // STRUCTURAL COLOR (Thin Film Interference)
      // ==========================================
      vec3 spectral_color(float w) {
          // Map 400-700nm to an OKLCh spiral (Golden Angle inspired)
          float h = (w - 400.0) / 300.0 * PI * 2.0; 
          float C = 0.18 + 0.1 * sin(w * 0.05); // High Chroma
          float L = 0.65 + 0.1 * cos(w * 0.02); // Perceptually bright
          vec3 lab = vec3(L, C * cos(h), C * sin(h));
          return oklab_to_srgb(lab);
      }

      // ==========================================
      // I CHING HEXAGRAM LOGIC
      // ==========================================
      float getBit(int n, int i) {
          return mod(floor(float(n) / pow(2.0, float(i))), 2.0);
      }

      void main() {
          vec2 uv = vUv * 2.0 - 1.0;
          uv.x *= u_resolution.x / u_resolution.y;
          
          vec2 z = uv;
          float t = u_time * 0.15;
          
          // 1. WET ENGINE ADVECTION (Rainblown effect)
          // Directional wind + curl noise fluid turbulence
          vec2 wind = vec2(1.5, -1.0) * t;
          z += curl(z * 1.5 + wind) * 0.3;
          z += curl(z * 3.0 - wind * 0.5) * 0.15;
          
          // 2. KLEINIAN / MÖBIUS FRACTAL SCAFFOLD
          // Dynamic Möbius transformation parameters
          vec2 a = vec2(cos(t), sin(t));
          vec2 b = vec2(sin(t*1.3), cos(t*0.8));
          vec2 c = vec2(-sin(t*0.7), cos(t*1.1));
          vec2 d = vec2(cos(t*0.9), -sin(t*1.5));
          
          float iter_acc = 0.0;
          float min_dist = 100.0;
          vec2 orbit = z;
          
          for(int i = 0; i < 10; i++) {
              // Möbius Transform: f(z) = (az+b)/(cz+d)
              orbit = cdiv(cmul(a, orbit) + b, cmul(c, orbit) + d);
              
              // Apollonian Inversion Fold
              float r2 = dot(orbit, orbit);
              if (r2 < 1.1) {
                  orbit = orbit / r2 * 1.1;
              }
              
              // Chiral Hemorrhage / Domain Warp
              orbit.x = abs(orbit.x) - 0.4;
              orbit = cmul(orbit, vec2(cos(0.4), sin(0.4)));
              
              // Melt the math with CA-like feedback
              orbit += curl(orbit * 5.0 + u_time) * 0.02;
              
              iter_acc += exp(-length(orbit));
              min_dist = min(min_dist, length(orbit));
          }
          
          // 3. STRUCTURAL COLOR (Thin Film Interference)
          // Map mathematical strain to physical film thickness
          float thickness = 200.0 + iter_acc * 120.0 + noise(z * 8.0) * 150.0;
          float n_film = 1.33 + 0.2 * sin(u_time * 2.0 + min_dist * 5.0); // Refractive index variance
          
          vec3 structural_col = vec3(0.0);
          for(int i = 0; i < 6; i++) {
              float lambda = 400.0 + float(i) * 60.0; // Sample across visible spectrum
              float pathDiff = 2.0 * n_film * thickness;
              float phase = (pathDiff / lambda) * PI * 2.0;
              float intensity = 0.5 + 0.5 * cos(phase);
              structural_col += spectral_color(lambda) * intensity;
          }
          structural_col /= 6.0;
          
          // 4. RETINAL SURREALISM / OP ART (Chromatic Cannibalism)
          // Moiré interference grid cutting through the fluid
          float grid_x = sin(orbit.x * 60.0);
          float grid_y = sin(orbit.y * 60.0);
          float moire = smoothstep(0.0, 0.15, abs(grid_x * grid_y) - 0.05);
          
          // 5. I CHING HEXAGRAM GLITCH
          // Encode spatial coordinates into a 6-bit state
          int hexVal = int(mod(floor(uv.x * 5.0) + floor(uv.y * 5.0) + u_time * 5.0, 64.0));
          int lineIdx = int(mod(floor(orbit.y * 12.0), 6.0));
          float isYang = getBit(hexVal, lineIdx);
          
          // 6. SYNTHESIS & THE VOID RULE
          // The Void Rule: Background must be near-black void.
          vec3 final_color = mix(vec3(0.01, 0.01, 0.02), structural_col, moire);
          
          // Apply I Ching glitch as structural gold/neon highlights
          if (abs(orbit.x) < 0.15 && isYang > 0.5) {
              final_color = mix(final_color, vec3(1.0, 0.8, 0.1), 0.85); // Tetragrammaton Gold
          }
          
          // Radial Hypnosis / The Whirring
          float radial = sin(length(uv) * 30.0 - u_time * 8.0 + iter_acc * 2.0);
          float radial_mask = smoothstep(0.8, 1.0, radial) * exp(-length(uv) * 3.0);
          final_color += vec3(0.0, 0.9, 1.0) * radial_mask; // Neon Cyan pop
          
          // Deep Abyss Vignette
          float vignette = smoothstep(2.2, 0.4, length(uv));
          final_color *= vignette;
          
          // Gamma correction for WebGL output
          fragColor = vec4(pow(final_color, vec3(1.0/2.2)), 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      depthWrite: false,
      depthTest: false
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    canvas.__three = { renderer, scene, camera, material };
  }

  const { renderer, scene, camera, material } = canvas.__three;

  if (material && material.uniforms) {
    if (material.uniforms.u_time) {
      material.uniforms.u_time.value = time;
    }
    if (material.uniforms.u_resolution) {
      material.uniforms.u_resolution.value.set(grid.width, grid.height);
    }
  }

  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);

} catch (e) {
  console.error("Feral Mathematical Masterpiece Failed:", e);
}