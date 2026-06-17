if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        
        uniform float u_time;
        uniform vec2 u_resolution;

        // --- OUTSIDER MATH & NOISE ---
        vec2 hash22(vec2 p) {
            p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
            return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
                mix(dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                    dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
                mix(dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                    dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
        }

        float fbm(vec2 p) {
            float f = 0.0;
            float a = 0.5;
            mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
            for(int i = 0; i < 5; i++) {
                f += a * noise(p);
                p = rot * p * 2.0;
                a *= 0.5;
            }
            return f;
        }

        // --- COLOR SYSTEMS: OKLab to sRGB ---
        vec3 oklab_to_srgb(vec3 c) {
            float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
            float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
            float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
            
            float l = l_ * l_ * l_;
            float m = m_ * m_ * m_;
            float s = s_ * s_ * s_;
            
            vec3 rgb = vec3(
                 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
            );
            
            vec3 srgb = mix(
                rgb * 12.92,
                1.055 * pow(max(rgb, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
                step(vec3(0.0031308), rgb)
            );
            return srgb;
        }

        // --- GOLDEN ANGLE PALETTE ---
        vec3 goldenPalette(float id) {
            float hue = fract(id * 0.38196601125); // Golden ratio conjugate
            float hRad = hue * 6.283185307;
            float L = 0.65 + 0.15 * sin(id * 17.0);
            float C = 0.2 + 0.1 * cos(id * 23.0);
            vec3 lab = vec3(L, C * cos(hRad), C * sin(hRad));
            return oklab_to_srgb(lab);
        }

        // --- OUTSIDER ART MARK-MAKING ---
        float crayonGrain(vec2 uv, vec2 dir) {
            float strokes = abs(sin(dot(uv, vec2(-dir.y, dir.x)) * 180.0));
            float wax = pow(strokes, 3.0) * (noise(uv * 300.0) * 0.5 + 0.5);
            return wax;
        }

        // --- NAIVE FUNGI ANATOMY ---
        float sdMushroom(vec2 p, float seed) {
            // Mark Wobble: The pulse of the maker's hand
            p += vec2(noise(p * 15.0 + seed), noise(p * 15.0 - seed)) * 0.05;

            // Asymmetric stipe (stalk)
            float stipe = length(max(abs(p - vec2(0.0, -0.15)) - vec2(0.03, 0.25), 0.0)) - 0.03;

            // Cap with gills (wavy bottom, horror vacui style)
            vec2 cp = p - vec2(0.0, 0.15);
            float cap = length(vec2(cp.x * 1.0, cp.y * 1.5)) - 0.35;
            float gills = -cp.y + 0.05 + sin(cp.x * 50.0) * 0.015 + noise(p * 50.0) * 0.02;
            cap = max(cap, gills);

            return min(stipe, cap);
        }

        void main() {
            vec2 uv = vUv;
            vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 6.0;
            p.y += u_time * 0.3; // Scrolling manuscript

            // 1. FOUND GROUND: Cellular Automata (Rule 90 / Sierpinski) + Text Image
            ivec2 grid = ivec2((uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 150.0 + vec2(0.0, u_time * 15.0));
            int val = grid.x ^ grid.y;
            float ca = float(val % 7 == 0 || val % 13 == 0);
            
            // The Void Rule: Deep purples and blacks as the substrate
            vec3 bg = mix(vec3(0.04, 0.01, 0.06), vec3(0.18, 0.04, 0.25), ca * 0.4);
            bg += noise(p * 100.0) * 0.03; // Paper grain

            // 2. MYCELIAL NETWORK: Domain Warped Voronoi (Slime Mold Veins)
            vec2 pWarped = p + fbm(p * 1.5 - u_time * 0.15) * 2.0;

            vec2 n = floor(pWarped);
            vec2 f = fract(pWarped);
            vec2 mg, mr; float md = 8.0; float id = 0.0;
            
            for(int j = -1; j <= 1; j++) {
                for(int i = -1; i <= 1; i++) {
                    vec2 g = vec2(float(i), float(j));
                    vec2 o = hash22(n + g);
                    o = 0.5 + 0.5 * sin(u_time * 0.5 + 6.2831 * o);
                    vec2 r = g + o - f;
                    float d = dot(r, r);
                    if(d < md) { 
                        md = d; mr = r; mg = g; 
                        id = dot(n + g, vec2(11.3, 31.7)); 
                    }
                }
            }

            // Second pass for borders (Anastomosis / Vein networks)
            md = 8.0;
            for(int j = -2; j <= 2; j++) {
                for(int i = -2; i <= 2; i++) {
                    vec2 g = mg + vec2(float(i), float(j));
                    vec2 o = hash22(n + g);
                    o = 0.5 + 0.5 * sin(u_time * 0.5 + 6.2831 * o);
                    vec2 r = g + o - f;
                    if(dot(mr - r, mr - r) > 0.00001) {
                        md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
                    }
                }
            }

            // 3. VEIN RENDERING (Neon Rule)
            float veinDist = md + noise(p * 40.0) * 0.03; // Crayon wobble on veins
            float veinMask = smoothstep(0.08, 0.02, veinDist);
            vec3 veinColor = oklab_to_srgb(vec3(0.85, 0.1, 0.15)); // Electric Physarum Yellow/Green
            veinColor *= 1.0 + crayonGrain(p, vec2(1.0, 1.0)); // Textural integration

            // 4. FRUITING BODIES (Naive Anatomy + Obsessive Repetition)
            vec2 localP = mr * 2.8; // Scale local space within Voronoi cell
            float mushDist = sdMushroom(localP, id);
            
            // Hard, wobbly outline characteristic of outsider art
            float outline = smoothstep(0.04, 0.0, abs(mushDist));
            float mushMask = smoothstep(0.01, -0.01, mushDist);

            // Coloring and Horror Vacui filling inside the mushroom
            vec3 mushBaseColor = goldenPalette(id);
            
            // Internal Cellular Automata texture (Double Wrong Hybrid)
            ivec2 innerGrid = ivec2(localP * 40.0);
            float innerCA = float((innerGrid.x ^ innerGrid.y) % 5 == 0);
            float hatch = crayonGrain(localP * 5.0, normalize(hash22(vec2(id))));
            
            vec3 mushColor = mix(mushBaseColor * 0.6, mushBaseColor * 1.4, hatch + innerCA * 0.3);

            // 5. SPORES (Fractal Dust)
            float spores = smoothstep(0.97, 1.0, noise(p * 20.0 - vec2(sin(u_time), u_time * 2.0)));
            vec3 sporeColor = oklab_to_srgb(vec3(0.7, 0.2, -0.1)); // Neon Pink

            // 6. COMPOSITING
            vec3 col = bg;
            col = mix(col, veinColor, veinMask * 0.85); // Substrate veins
            col = mix(col, mushColor, mushMask);        // Fruiting bodies
            col = mix(col, vec3(0.05), outline * mushMask); // Dark outlines
            col += sporeColor * spores * 2.0;           // Floating spores

            // Global Crayon / Paper Texture
            col *= 0.85 + 0.15 * noise(vUv * 600.0);

            fragColor = vec4(col, 1.0);
        }
      `
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
  if (material.uniforms.u_time) {
    material.uniforms.u_time.value = time;
  }
  if (material.uniforms.u_resolution) {
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);