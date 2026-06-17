if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

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
      in vec2 vUv;
      out vec4 fragColor;

      uniform float u_time;
      uniform vec2 u_resolution;

      #define PI 3.14159265359
      #define TAU 6.28318530718

      // --- OKLab Color Space Functions ---
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

      vec3 linear_to_srgb(vec3 c) {
          vec3 s1 = c * 12.92;
          vec3 s2 = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
          return mix(s1, s2, step(vec3(0.0031308), c));
      }

      vec3 oklch_to_srgb(float L, float C, float h) {
          vec3 oklab = vec3(L, C * cos(h), C * sin(h));
          return linear_to_srgb(oklab_to_linear_srgb(oklab));
      }

      // --- Noise & Math Helpers ---
      vec2 hash2(vec2 p) {
          p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
          return fract(sin(p) * 43758.5453123);
      }

      float hash1(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash1(i);
          float b = hash1(i + vec2(1.0, 0.0));
          float c = hash1(i + vec2(0.0, 1.0));
          float d = hash1(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for(int i = 0; i < 4; i++) {
              v += a * noise(p);
              p *= 2.0;
              a *= 0.5;
          }
          return v;
      }

      vec2 fold(vec2 p, float n) {
          float a = atan(p.y, p.x);
          float r = length(p);
          float s = TAU / n;
          a = mod(a + s * 0.5, s) - s * 0.5;
          return vec2(cos(a), sin(a)) * r;
      }

      // --- Fungal/Cellular Voronoi ---
      // Returns: x = min dist, y = distance to edge, z = cell id
      vec3 voronoi(vec2 x) {
          vec2 n = floor(x);
          vec2 f = fract(x);
          float m = 8.0;
          vec2 mg, mr;
          
          for(int j = -1; j <= 1; j++) {
              for(int i = -1; i <= 1; i++) {
                  vec2 g = vec2(float(i), float(j));
                  vec2 o = hash2(n + g);
                  // Animate the cells slightly
                  o = 0.5 + 0.5 * sin(u_time * 0.5 + 6.2831 * o);
                  vec2 r = g + o - f;
                  float d = dot(r, r);
                  if(d < m) {
                      m = d;
                      mr = r;
                      mg = g;
                  }
              }
          }
          
          float md = 8.0;
          for(int j = -2; j <= 2; j++) {
              for(int i = -2; i <= 2; i++) {
                  vec2 g = mg + vec2(float(i), float(j));
                  vec2 o = hash2(n + g);
                  o = 0.5 + 0.5 * sin(u_time * 0.5 + 6.2831 * o);
                  vec2 r = g + o - f;
                  if(dot(mr - r, mr - r) > 0.00001) {
                      md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
                  }
              }
          }
          return vec3(sqrt(m), md, hash1(n + mg));
      }

      void main() {
          vec2 uv = (vUv - 0.5) * 2.0;
          uv.x *= u_resolution.x / u_resolution.y;

          // 1. Domain Warping (Reaction-Diffusion / Mycelial Growth feel)
          vec2 q = vec2(fbm(uv * 2.0 + u_time * 0.2), fbm(uv * 2.0 - u_time * 0.15));
          vec2 warpedUV = uv + q * 0.8;

          // 2. Fungal Cell Matrix (Voronoi)
          vec3 v = voronoi(warpedUV * 4.0 + u_time * 0.1);
          float cellDist = v.x;
          float edgeDist = v.y;
          float cellId = v.z;

          // 3. Structural Color / Thin-Film Iridescence (Slime Layer)
          // Using edge distance as a fake normal/view angle
          float thickness = 200.0 + 600.0 * fbm(warpedUV * 5.0 + cellId);
          float cosTheta = clamp(edgeDist * 2.0, 0.0, 1.0);
          // 2 * n * d * cos(theta) = m * lambda
          vec3 interferencePath = 2.0 * 1.33 * thickness * cosTheta * vec3(1.0/400.0, 1.0/500.0, 1.0/600.0);
          vec3 iridescence = 0.5 + 0.5 * cos(TAU * interferencePath);

          // 4. OKLab Candy/Neon Palette Generation (NO BLACK ALLOWED)
          // L is clamped extremely high (0.7 - 0.95) to ensure zero empty/dark space
          float hueBase = cellId * TAU + u_time * 0.4;
          vec3 cellColor = oklch_to_srgb(0.75, 0.25, hueBase);
          vec3 wallColor = oklch_to_srgb(0.95, 0.35, hueBase + PI); // Complementary neon walls

          // Mix cell fluid with iridescence
          vec3 fluidColor = mix(cellColor, iridescence, 0.6 * (1.0 - cosTheta));
          
          // Smoothly mix walls and cells
          float wallMask = smoothstep(0.08, 0.0, edgeDist);
          vec3 baseFungalColor = mix(fluidColor, wallColor, wallMask);

          // 5. Mycelial Cords / Rhizomorphs (Nutrient Superhighways)
          // Using overlapping sine waves driven by Gematria/I-Ching frequency logic
          float cordFreq1 = 26.0 / 5.0; // YHWH resonance
          float cordFreq2 = 54.0 / 8.0; // LOVE resonance
          float cord1 = smoothstep(0.04, 0.0, abs(sin(warpedUV.x * cordFreq1 + u_time) * cos(warpedUV.y * cordFreq2 - u_time)));
          float cord2 = smoothstep(0.03, 0.0, abs(sin(warpedUV.y * cordFreq1 - u_time * 1.2) * cos(warpedUV.x * cordFreq2 + u_time * 0.8)));
          
          float cordMask = max(cord1, cord2) * smoothstep(0.3, 0.7, noise(warpedUV * 3.0));
          vec3 cordColor = oklch_to_srgb(0.9, 0.3, u_time * 0.5); // Sweeping neon cyan/lime
          
          vec3 compositeColor = mix(baseFungalColor, cordColor, cordMask * 0.9);

          // 6. Haeckel-style Radial Fruiting Body (Gematria/I-Ching Bloom)
          // Slowly drifting and spinning across the space
          vec2 bloomUV = uv + vec2(sin(u_time * 0.2) * 0.5, cos(u_time * 0.15) * 0.3);
          // 8-fold symmetry (Bagua / I-Ching)
          vec2 symUV = fold(bloomUV, 8.0);
          float bloomDist = length(symUV);
          
          // Standing wave interference (Gematria Genesis resonance)
          float bloomRings = 0.5 + 0.5 * cos(TAU * 15.0 * bloomDist - u_time * 3.0);
          // Petal shaping
          float petals = smoothstep(0.1, 0.08, length(symUV - vec2(0.2, 0.0)));
          float bloomCore = smoothstep(0.3, 0.0, bloomDist);
          
          float bloomMask = max(petals, bloomCore) * smoothstep(0.5, 0.2, bloomDist);
          
          vec3 bloomColor = oklch_to_srgb(0.85, 0.3, bloomDist * 10.0 - u_time * 2.0);
          bloomColor = mix(bloomColor, vec3(1.0), bloomRings * 0.5); // White hot ring highlights
          
          compositeColor = mix(compositeColor, bloomColor, bloomMask * 0.9);

          // 7. Final Polish: Ensure absolute maximalism and zero darkness
          // Clamp minimum lightness to a pastel/neon baseline
          compositeColor = max(compositeColor, oklch_to_srgb(0.6, 0.2, uv.x + uv.y + u_time));

          fragColor = vec4(compositeColor, 1.0);
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
  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
    return;
  }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms) {
  if (material.uniforms.u_time) material.uniforms.u_time.value = time;
  if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(grid.width, grid.height);
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);