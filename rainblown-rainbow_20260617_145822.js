try {
  if (!canvas.__three) {
    if (!ctx) throw new Error("WebGL context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

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

      // ─── COLOR SYSTEMS (OKLab Perceptual Uniformity) ───────────────
      vec3 OKLab_to_linearSRGB(vec3 c) {
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

      float linear_to_sRGB(float x) {
          return x <= 0.0031308 ? x * 12.92 : 1.055 * pow(max(x, 0.0), 1.0/2.4) - 0.055;
      }

      vec3 OKLab_to_sRGB(vec3 c) {
          vec3 lin = OKLab_to_linearSRGB(c);
          return vec3(linear_to_sRGB(lin.r), linear_to_sRGB(lin.g), linear_to_sRGB(lin.b));
      }

      // ─── MATH & FLUID NOISE ─────────────────────────────────────────
      float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float a = hash(i + vec2(0.0, 0.0));
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 5; i++) {
              v += a * noise(p);
              p *= 2.0;
              a *= 0.5;
          }
          return v;
      }

      vec2 cmul(vec2 a, vec2 b) {
          return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x);
      }

      // ─── MAIN ───────────────────────────────────────────────────────
      void main() {
          // Setup and aspect ratio
          vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
          vec2 z = uv * 2.2;

          // The Wind: Rainblown Fluid Advection
          vec2 wind_dir = normalize(vec2(1.0, -1.2));
          float t = u_time * 0.3;

          // Base Julia Set parameter gently oscillating
          vec2 c = vec2(-0.74, 0.11) + vec2(sin(t*0.6), cos(t*0.4)) * 0.06;

          // Orbit Trap States
          float trap_gumball = 100.0;
          float trap_vein = 100.0;
          vec2 best_cell = vec2(0.0);
          float iter = 0.0;
          float last_n = 0.0;

          // Fractal Iteration
          for(int i = 0; i < 80; i++) {
              // Metric Competition: The fractal space is constantly blown away by the wind
              float n = fbm(z * 2.5 - wind_dir * t * 2.5);
              last_n = n;
              
              // Wind shear creates spatial parameter variation (a hallucinated topology)
              vec2 local_c = c + wind_dir * n * 0.45;

              // Complex squaring + drift
              z = cmul(z, z) + local_c;

              // Memphis Confetti / Slime Mold Orbit Traps
              vec2 cell = fract(z * 1.8) - 0.5;
              float d_dot = length(cell);
              if(d_dot < trap_gumball) {
                  trap_gumball = d_dot;
                  best_cell = cell; // Save local geometry for fake 3D lighting later
              }

              // Slime Mold Anastomosis Veins (Hyperbolic stress lines)
              trap_vein = min(trap_vein, abs(z.x * z.y));

              // Escape condition
              if(dot(z, z) > 64.0) {
                  // Smooth escape calculation
                  iter = float(i) - log2(log2(dot(z,z)));
                  break;
              }
          }

          // Interior check
          if (iter == 0.0) iter = 80.0;

          // ─── MATERIAL ALCHEMY ─────────────────────────────────────────

          // Masks for rendering structures
          float gumball_mask = smoothstep(0.28, 0.05, trap_gumball);
          float vein_mask = smoothstep(0.06, 0.0, trap_vein);

          // Fake 3D Lighting for Gumballs (Candy/Plush look)
          vec2 light_dir = normalize(vec2(1.0, 1.0));
          vec2 normal_approx = normalize(best_cell + 0.0001);
          float diffuse = max(0.0, dot(normal_approx, light_dir));
          float specular = pow(max(0.0, dot(normal_approx, light_dir)), 12.0);

          // Sour Sugar Crust (Glitter mold at the geometric edges)
          float crust = hash(uv * 900.0 + u_time) * smoothstep(0.02, 0.25, trap_gumball) * smoothstep(0.35, 0.15, trap_gumball);

          // ─── OKLAB COLOR MAPPING (Rainbow Mathematical Masterpiece) ───
          
          // Golden Angle Hue Distribution (137.508 deg = 2.3999 rad)
          // Hue drifts based on wind noise, iteration depth, and orbit trap proximity
          float hue = iter * 0.08 + t * 0.9 + trap_gumball * 5.0 - last_n * 2.5;

          // Lightness (L)
          float L = 0.55
                  + 0.30 * gumball_mask * diffuse  // 3D pop on the confetti
                  + 0.20 * specular * gumball_mask // Candy shine
                  - 0.15 * vein_mask               // Deep fungal veins
                  + 0.25 * crust;                  // Sugar crust brightness

          // Chroma (C) - highly saturated neon
          float C = 0.15 + 0.18 * gumball_mask + 0.08 * vein_mask;

          // Convert OKLCh to sRGB
          vec3 oklab = vec3(L, C * cos(hue * 2.3999), C * sin(hue * 2.3999));
          vec3 color = OKLab_to_sRGB(oklab);

          // Rainblown Overlay / Chromatic Smear (Dielectric interference)
          float rain_smear = fbm(uv * vec2(6.0, 30.0) - wind_dir * t * 5.0);
          color += vec3(0.05, 0.20, 0.30) * smoothstep(0.5, 0.95, rain_smear);

          // Fade to deep void background for low iterations
          color *= smoothstep(0.0, 12.0, iter);

          fragColor = vec4(color, 1.0);
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

    const mesh = new THREE.Mesh(geometry, material);
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

} catch (err) {
  console.error("Feral Render Engine Failure:", err);
}