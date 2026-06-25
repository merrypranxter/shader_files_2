try {
  if (!canvas.__three) {
    if (!ctx) throw new Error("WebGL2 context required for feral material rendering.");

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
      out vec4 fragColor;
      in vec2 vUv;
      
      uniform float u_time;
      uniform vec2 u_resolution;

      // Feral Hash
      float hash(vec2 p) { 
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123); 
      }

      // Raw noise (Bilinear interpolation on hash grid)
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      // Fractional Brownian Motion (Substrate domain)
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for(int i = 0; i < 6; i++) { 
          v += a * noise(p); 
          p *= 2.01; 
          a *= 0.5; 
        }
        return v;
      }

      void main() {
        // Normalize coordinates & aspect ratio
        vec2 p = vUv * 2.0 - 1.0;
        p.x *= u_resolution.x / u_resolution.y;

        // THREE SIMULTANEOUS TIME SCALES
        float t_slow = u_time * 0.05;  // Global tectonic drift
        float t_med  = u_time * 0.25;  // Structural crystallization
        float t_fast = u_time * 4.0;   // High-frequency enzymatic shimmer

        // 1. SLOW GLOBAL DRIFT: Mycelial Domain Warp
        // Warping the coordinate space before feeding it into the fractal
        vec2 warp = vec2(fbm(p * 1.5 + t_slow), fbm(p * 1.5 - t_slow + 33.3));
        vec2 z = p + (warp - 0.5) * 0.8;

        // 2. MEDIUM STRUCTURAL MOTION: Hyperbolic KIFS Rot
        float trapC = 1e10;
        float trapM = 1e10;
        float trapY = 1e10;
        float accum = 0.0;

        vec2 c_param = vec2(sin(t_med * 0.8), cos(t_med * 1.1)) * 0.3;

        for (int i = 0; i < 14; i++) {
          // Box fold (Crystalline fracturing)
          z = abs(z) - vec2(0.05, 0.1);

          // Twist (Gyroid/Attractor drift)
          float a = t_med + float(i) * 0.15;
          float cs = cos(a), sn = sin(a);
          z *= mat2(cs, -sn, sn, cs);

          // Sphere fold (Mandelbox metric competition)
          float r2 = dot(z, z);
          if (r2 < 0.02) {
            z *= 50.0;
          } else if (r2 < 0.4) {
            z /= r2;
          }

          // Scale and shift
          z = z * 1.15 - c_param;

          // Track metric traps for CMY mapping
          trapC = min(trapC, abs(z.x * z.y));            // Rectilinear faults
          trapM = min(trapM, abs(length(z) - 0.25));     // Spherical shells
          trapY = min(trapY, length(z - warp));          // Hostile coordinates
          accum += exp(-length(z));
        }

        // 3. FAST DETAIL SHIMMER: Laccase Stain / Grain / Interference
        float grain = hash(gl_FragCoord.xy + t_fast);
        float shimmer = 0.8 + 0.2 * grain;

        // Enzymatic high-frequency texture (Reaction-Diffusion approximation)
        float hf_noise = fbm(z * 3.0 + t_fast * 0.2);
        float interference = sin(z.x * 15.0) * cos(z.y * 15.0);

        // Signal extraction (Quantized Laplacians / Hallucinated Biology)
        float valC = smoothstep(0.15, 0.0, trapC) * (0.6 + 0.4 * hf_noise);
        float valM = smoothstep(0.8, 0.0, trapM) * (0.5 + 0.5 * interference);
        float valY = smoothstep(0.5, 0.0, trapY) * clamp(accum * 0.08, 0.0, 1.0);

        // VOID BLACK + NEON CMY ASSEMBLY
        vec3 col = vec3(0.0);
        col += vec3(0.0, 1.0, 1.0) * valC; // Neon Cyan
        col += vec3(1.0, 0.0, 1.0) * valM; // Neon Magenta
        col += vec3(1.0, 1.0, 0.0) * valY; // Neon Yellow

        // Apply shimmer, organic attenuation, and deep contrast
        col *= shimmer;
        col = pow(col, vec3(1.4)); // Push shadows to true void black

        // Structural vignetting (focus the microscope)
        float edge = length(p);
        col *= 1.0 - smoothstep(0.6, 1.8, edge);

        fragColor = vec4(col, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      }
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    canvas.__three = { renderer, scene, camera, material };
  }

  const { renderer, scene, camera, material } = canvas.__three;

  if (material?.uniforms) {
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
  console.error("Feral Lithogenesis Pipeline Failed:", e);
  throw e;
}