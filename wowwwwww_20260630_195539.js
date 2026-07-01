try {
  if (!canvas.__three) {
    if (!ctx) throw new Error("WebGL 2 context not available");
    
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) }
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
        uniform vec2 u_resolution;
        uniform vec2 u_mouse;

        // --- MATH & FOLDING (Kaleidoscope, Non-Orientable Manifolds) ---
        mat2 rot2(float a) {
            float s = sin(a), c = cos(a);
            return mat2(c, -s, s, c);
        }

        vec2 kalFold(vec2 uv, float n) {
            float a = atan(uv.y, uv.x);
            float r = length(uv);
            float sector = 6.2831853 / n;
            float folded = mod(a, sector);
            if (folded > sector / 2.0) folded = sector - folded;
            return vec2(cos(folded), sin(folded)) * r;
        }

        // --- DITHERING & TEXTURE (Ditherpunk, Pixel-Voxel) ---
        const float bayer[16] = float[16](
            0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
           12.0/16.0,  4.0/16.0, 14.0/16.0,  6.0/16.0,
            3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,
           15.0/16.0,  7.0/16.0, 13.0/16.0,  5.0/16.0
        );
        float getBayer(vec2 fc) {
            int x = int(fc.x) % 4;
            int y = int(fc.y) % 4;
            return bayer[y * 4 + x];
        }

        // --- CONTINUOUS CELLULAR AUTOMATA & NOISE (Lenia, Speckle) ---
        float hash(vec2 p) { 
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); 
        }
        
        float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            vec2 u = f*f*(3.0-2.0*f);
            return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), u.x),
                       mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y);
        }
        
        float fbm(vec2 p) {
            float f = 0.0, a = 0.5;
            for(int i=0; i<5; i++) { f += a*noise(p); p*=2.0; a*=0.5; }
            return f;
        }
        
        vec2 random2(vec2 p) {
            return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);
        }
        
        float cellular(vec2 p, float t) {
            vec2 i_st = floor(p);
            vec2 f_st = fract(p);
            float m_dist = 1.0;
            for (int y = -1; y <= 1; y++) {
                for (int x = -1; x <= 1; x++) {
                    vec2 neighbor = vec2(float(x), float(y));
                    vec2 point = random2(i_st + neighbor);
                    point = 0.5 + 0.5 * sin(t + 6.2831 * point);
                    vec2 diff = neighbor + point - f_st;
                    float dist = length(diff);
                    m_dist = min(m_dist, dist);
                }
            }
            return m_dist;
        }

        // --- OPTICS & DISPERSION (Cauchy, Chromatic Aberration) ---
        float cauchy(float lambda) {
            return 1.5 + 0.012 / (lambda * lambda);
        }

        // --- PALETTE (Maximalist Candy-Acid, Hyperbolic Hues) ---
        vec3 candyPalette(float t) {
            // Core spectral base
            vec3 c = 0.5 + 0.5 * cos(6.28318 * (t * vec3(1.0, 0.8, 0.6) + vec3(0.0, 0.33, 0.67)));
            
            // Inject impossible/stygian neon spikes
            float pink = smoothstep(0.7, 1.0, sin(t * 11.0));
            float yellow = smoothstep(0.7, 1.0, sin(t * 17.0 + 1.0));
            float cyan = smoothstep(0.7, 1.0, sin(t * 23.0 + 2.0));
            
            c = mix(c, vec3(1.0, 0.0, 0.6), pink);
            c = mix(c, vec3(0.8, 1.0, 0.0), yellow);
            c = mix(c, vec3(0.0, 1.0, 0.8), cyan);
            
            // White-hot focal highlights
            float white = smoothstep(0.95, 1.0, sin(t * 31.0));
            c = mix(c, vec3(1.0), white);
            
            return c;
        }

        // --- GEOMETRY (SDF Accents) ---
        float sdOctahedron(vec2 p, float s) {
            p = abs(p);
            return (p.x + p.y - s) * 0.7071067;
        }

        // --- THE UNIFIED SOUP ---
        float evaluateSoup(vec2 uv, float t_offset) {
            vec2 p = uv;
            float t = u_time + t_offset;
            
            // Retrocausality & Flash-Lag: time reverses in specific wave bands
            float r = length(p);
            float band = step(0.5, sin(r * 15.0 - t));
            t *= mix(1.0, -0.5, band);
            
            // Non-orientable manifold twist
            float a = atan(p.y, p.x);
            a += sin(r * 4.0 - t * 0.5) * 0.5;
            p = r * vec2(cos(a), sin(a));
            
            // Kaleidoscope breathing
            float nSectors = 6.0 + 2.0 * sin(u_time * 0.2);
            p = kalFold(p, nSectors);
            
            // Domain warping & Reaction-Diffusion flow
            vec2 q = vec2(fbm(p * 3.0 + t * 0.2), fbm(p * 3.0 - t * 0.23));
            vec2 p2 = p + q * 0.5;
            
            // Cellular Speckle (Biological/Ultrasound texture)
            float cell = cellular(p2 * 4.0, t);
            float val = fbm(p2 * 5.0 + cell * 2.0);
            
            // Acoustic impedance high-frequency interference
            val += 0.05 * sin(100.0 * p.x) * cos(100.0 * p.y);
            
            return val;
        }

        void main() {
            vec2 uv = (vUv - 0.5) * 2.0;
            uv.x *= u_resolution.x / u_resolution.y;
            
            // Mouse interaction (steers the optical flow)
            vec2 m = (u_mouse * 2.0 - 1.0);
            vec2 uv_warped = uv - m * 0.1 * (1.0 - length(uv));
            
            // Crisp Geometric Lenses (Refracting the soup)
            float d1 = sdOctahedron(uv_warped * rot2(u_time * 0.2), 0.6);
            float d2 = abs(length(uv_warped) - 0.8) - 0.02;
            
            if (d1 < 0.0) {
                // Internal acoustic ripples inside the octahedron
                uv_warped += 0.05 * normalize(uv_warped) * sin(d1 * 50.0 - u_time * 10.0);
            }
            if (d2 < 0.0) {
                // Magnification ring
                uv_warped *= 0.85;
            }
            
            vec3 col = vec3(0.0);
            float w_sum = 0.0;
            
            vec2 center = vec2(0.0);
            vec2 dir = normalize(uv_warped - center + 1e-5);
            float dist = length(uv_warped - center);
            
            // Per-wavelength Spectral Raymarching (12 samples)
            for(int i = 0; i < 12; i++) {
                // 380nm to 700nm approximation
                float lambda = mix(0.38, 0.7, float(i) / 11.0); 
                float ior = cauchy(lambda);
                
                // Lateral Chromatic Aberration & Coma shift
                float shift = (ior - 1.5) * 0.2 * dist; 
                vec2 sample_uv = uv_warped + dir * shift + vec2(shift * shift) * 0.8;
                
                // Temporal Predictive Ghosting (offset time by wavelength/dispersion)
                float t_offset = shift * 4.0; 
                
                float val = evaluateSoup(sample_uv, t_offset);
                
                // Thin-film interference & Bragg reflection
                float film_thickness = 0.5 + 0.5 * fbm(sample_uv * 8.0 + u_time * 0.1);
                float phase = 6.28318 * (2.0 * ior * film_thickness / lambda);
                float interference = 0.5 + 0.5 * cos(phase);
                
                // Spectral Color Synthesis mapped to Candy-Acid
                vec3 spec_c = candyPalette(val * 1.5 + lambda * 2.0);
                
                float weight = interference * (1.0 + 0.5 * sin(val * 12.0));
                col += spec_c * weight;
                w_sum += weight;
            }
            
            col /= w_sum;
            
            // Ditherpunk / Quantization Matrix
            float bayerVal = getBayer(gl_FragCoord.xy);
            col += (bayerVal - 0.5) * 0.15; 
            
            // Munker-White / Simultaneous Contrast Illusion
            // High-frequency stripe overlay causes perceptual color shifting
            float stripes = step(0.5, fract(uv.y * 50.0 + u_time * 0.5));
            col = mix(col, col * (0.7 + 0.6 * stripes), 0.2);
            
            // Self-Luminous Red overdrive (Hyperbolic saturation)
            col = pow(col, vec3(0.85)); 
            col *= 1.2; 
            
            // Vignette / Shadowing
            float vign = smoothstep(1.5, 0.5, length(uv));
            col *= vign;
            
            // Draw the crisp geometric outlines to anchor the mush
            col = mix(col, vec3(1.0), smoothstep(0.01, 0.0, abs(d1)));
            col = mix(col, vec3(0.0, 1.0, 0.8), smoothstep(0.008, 0.0, abs(d2)));
            
            fragColor = vec4(col, 1.0);
        }
      `
    });
    
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    canvas.__three = { renderer, scene, camera, material };
  }
  
  const { renderer, scene, camera, material } = canvas.__three;
  
  if (material && material.uniforms) {
    if (material.uniforms.u_time) material.uniforms.u_time.value = time;
    if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(grid.width, grid.height);
    if (mouse && material.uniforms.u_mouse) {
      // Smooth mouse interaction mapped to [0, 1]
      material.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
    }
  }
  
  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);

} catch (e) {
  console.error("WebGL Initialization Failed:", e);
  throw e;
}