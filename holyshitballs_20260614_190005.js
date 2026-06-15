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
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        #version 300 es
        precision highp float;
        
        uniform float u_time;
        uniform vec2 u_resolution;
        
        out vec4 fragColor;
        
        #define PI 3.14159265359
        #define TAU 6.28318530718
        
        // --- OKLab & Colors ---
        vec3 oklab_to_srgb(vec3 c) {
            float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
            float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
            float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
            float l = l_*l_*l_;
            float m = m_*m_*m_;
            float s = s_*s_*s_;
            vec3 rgb = vec3(
                 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
            );
            vec3 mixFactor = step(rgb, vec3(0.0031308));
            vec3 higher = 1.055 * pow(max(rgb, vec3(0.0)), vec3(1.0/2.4)) - 0.055;
            vec3 lower = rgb * 12.92;
            return mix(higher, lower, mixFactor);
        }
        
        vec3 oklch2rgb(float L, float C, float h) {
            float hr = h * PI / 180.0;
            return oklab_to_srgb(vec3(L, C * cos(hr), C * sin(hr)));
        }
        
        // --- Noise ---
        float random(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }
        
        float noise(vec2 st) {
            vec2 i = floor(st);
            vec2 f = fract(st);
            float a = random(i);
            float b = random(i + vec2(1.0, 0.0));
            float c = random(i + vec2(0.0, 1.0));
            float d = random(i + vec2(1.0, 1.0));
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }
        
        float fbm(vec2 st) {
            float value = 0.0;
            float amplitude = 0.5;
            vec2 shift = vec2(100.0);
            for (int i = 0; i < 5; i++) {
                value += amplitude * noise(st);
                st = st * 2.0 + shift;
                amplitude *= 0.5;
            }
            return value;
        }
        
        // --- Complex Math ---
        vec2 cpow3(vec2 z) {
            return vec2(z.x*z.x*z.x - 3.0*z.x*z.y*z.y, 3.0*z.x*z.x*z.y - z.y*z.y*z.y);
        }
        vec2 cpow2(vec2 z) {
            return vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y);
        }
        vec2 cdiv(vec2 a, vec2 b) {
            float d = dot(b, b);
            return vec2(dot(a, b), a.y*b.x - a.x*b.y) / d;
        }
        mat2 rot(float a) {
            float s = sin(a), c = cos(a);
            return mat2(c, -s, s, c);
        }
        
        // --- SDFs ---
        float sdHexagram(vec2 p, float r) {
            const vec4 k = vec4(-0.5, 0.8660254038, 0.5773502692, 1.7320508076);
            p = abs(p);
            p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
            p -= 2.0 * min(dot(k.yx, p), 0.0) * k.yx;
            p -= vec2(clamp(p.x, r * k.z, r * k.w), r);
            return length(p) * sign(p.y);
        }
        
        void main() {
            vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / min(u_resolution.x, u_resolution.y);
            float t = u_time * 0.5;
            
            // 1. Rainblown Domain Warping
            vec2 flow = vec2(0.0, -1.0) * t * 0.5;
            vec2 warpUV = uv;
            float n1 = fbm(uv * 3.0 + flow);
            float n2 = fbm(uv * 5.0 - flow * 0.5 + n1);
            warpUV.y += n2 * 0.15; // Rain dripping
            warpUV.x += (fbm(uv * 4.0 + t*0.2) - 0.5) * 0.1; // Wind shear
            
            // 2. Paper & Background (Botanical Watercolor + Newton Fractal)
            vec3 paper = vec3(0.96, 0.92, 0.84);
            vec2 z = warpUV * 3.0;
            float iter = 0.0;
            for(int i = 0; i < 15; i++) {
                vec2 z3 = cpow3(z);
                vec2 fz = z3 - vec2(1.0, 0.0);
                vec2 fpz = 3.0 * cpow2(z);
                // Anisotropic relaxation (wind-blown math)
                z -= cdiv(fz, fpz) * vec2(0.8, 0.2); 
                if(length(fz) < 0.05) break;
                iter++;
            }
            
            float root_angle = atan(z.y, z.x) * 180.0 / PI;
            // Golden angle (137.5) palettes for the fractal wash
            float hueBase = root_angle + iter * 15.0 + t * 20.0;
            vec3 fractal_wash = oklch2rgb(0.85 - iter*0.02, 0.15, hueBase);
            vec3 col = mix(paper, fractal_wash, 0.6);
            
            // 3. Central Mandala (Cymatics + Tibetan Lotus)
            float r = length(uv);
            float th = atan(uv.y, uv.x);
            
            // 8-fold Lotus
            float petals = 8.0;
            float lotus_r = 0.55 + 0.08 * abs(cos(petals * th * 0.5));
            // Cymatic ripple on boundary
            lotus_r += 0.015 * cos(r * 80.0 - t * 5.0) * cos(8.0 * th);
            
            float d_lotus = r - lotus_r;
            float lotus_mask = smoothstep(0.01, -0.01, d_lotus);
            
            if (d_lotus < 0.05) {
                // Wet edge bloom
                float wet_edge = exp(-abs(d_lotus) * 40.0);
                
                // Gematria Resonance Field inside Lotus
                float freq = 26.0; // YHWH / God
                float wave = 0.5 + 0.5 * cos(TAU * freq * r - t * 4.0);
                
                // Structural Color Iridescence (Thin film)
                float path_diff = r * 3.0 + wave * 0.5;
                vec3 irid = 0.5 + 0.5 * cos(TAU * path_diff + vec3(0.0, 0.33, 0.67));
                
                // Lapis Lazuli and Emerald (Tibetan colors)
                vec3 inner_col = oklch2rgb(0.5 + wave*0.2, 0.2, 240.0 - wave*60.0);
                
                vec3 lotus_fill = inner_col * irid;
                
                // Blend with wet edge
                col = mix(col, lotus_fill, lotus_mask);
                col = mix(col, vec3(0.15, 0.05, 0.0), wet_edge * 0.8); // Ink outline
            }
            
            // 4. Sacred Geometry Core (Hexagram / Merkaba)
            vec2 core_uv = uv * rot(t * 0.5);
            float d_hex = sdHexagram(core_uv, 0.22);
            float hex_line = smoothstep(0.008, 0.0, abs(d_hex));
            float hex_mask = smoothstep(0.01, -0.01, d_hex);
            
            if (d_hex < 0.02) {
                float core_wave = 0.5 + 0.5 * cos(TAU * 137.5 * r - t * 6.0); // Golden angle cymatics
                vec3 gold = oklch2rgb(0.8, 0.2, 70.0 + core_wave * 30.0);
                col = mix(col, gold, hex_mask * 0.9);
            }
            // Gold/Amber lines
            col = mix(col, vec3(1.0, 0.8, 0.2), hex_line);
            
            // 5. Divine Data Corruption / Rainblown Glitch
            float streak = fbm(vec2(uv.x * 30.0, uv.y * 2.0 + t * 2.0));
            float glitch = smoothstep(0.85, 0.98, streak) * (0.5 + 0.5 * sin(uv.y * 150.0));
            vec3 glitch_col = oklch2rgb(0.7, 0.25, 320.0); // Magenta/Pink
            col = mix(col, glitch_col, glitch * 0.6);
            
            // 6. Stipple / Lycopodium Powder
            vec2 cell = floor(uv * 400.0);
            float stipple = random(cell);
            col *= 1.0 - (stipple * 0.1 * smoothstep(0.8, 0.2, r)); // More stipple at edges
            
            // Vignette
            col *= 1.0 - 0.5 * dot(uv, uv);
            
            fragColor = vec4(col, 1.0);
        }
      `
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    
    canvas.__three = { renderer, scene, camera, material };
  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
  }
}

if (canvas.__three) {
  const { renderer, scene, camera, material } = canvas.__three;
  if (material && material.uniforms && material.uniforms.u_time) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }
  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);
}