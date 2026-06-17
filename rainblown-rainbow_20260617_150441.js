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
        precision highp float;

        in vec2 vUv;
        out vec4 fragColor;

        uniform float u_time;
        uniform vec2 u_resolution;

        #define PI 3.14159265359

        // --- OKLab Color System ---
        vec3 oklch_to_oklab(vec3 lch) {
            return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
        }

        vec3 oklab_to_linear(vec3 c) {
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
            vec3 s2 = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0/2.4)) - 0.055;
            return mix(s1, s2, step(0.0031308, c));
        }

        vec3 getRainbow(float t) {
            float hue = t * PI * 2.0;
            float L = 0.65 + 0.1 * sin(t * 3.0);
            float C = 0.25 + 0.05 * cos(t * 5.0);
            vec3 lch = vec3(L, C, hue);
            return clamp(linear_to_srgb(oklab_to_linear(oklch_to_oklab(lch))), 0.0, 1.0);
        }

        // --- Math & Noise ---
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f*f*(3.0-2.0*f);
            return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x),
                       mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
            float v = 0.0, a = 0.5;
            for(int i=0; i<5; i++) { v += a*noise(p); p*=2.0; a*=0.5; }
            return v;
        }

        // --- Memphis Patterns ---
        float squiggle(vec2 p, float freq, float amp, float t) {
            float y_off = amp * sin(freq * p.x + t);
            return smoothstep(0.05, 0.0, abs(p.y - y_off));
        }
        float dots(vec2 p, float density, float size) {
            vec2 gv = fract(p * density) - 0.5;
            return 1.0 - smoothstep(size - 0.02, size + 0.02, length(gv));
        }

        void main() {
            vec2 uv = (vUv - 0.5) * 2.0;
            uv.x *= u_resolution.x / u_resolution.y;
            
            // Rainblown domain warp
            vec2 rainDir = normalize(vec2(-1.0, 2.0));
            float wind = fbm(uv * 3.0 - rainDir * u_time * 0.8);
            vec2 z = uv * 1.2 + rainDir * wind * 0.5;
            
            float iter = 0.0;
            float trap1 = 1e10; // Mycelial veins
            
            vec2 c = vec2(sin(u_time*0.15), cos(u_time*0.11)) * 0.4;
            
            for(int i=0; i<45; i++) {
                // Burning Ship fold
                z = vec2(abs(z.x), abs(z.y));
                
                // Rotation
                float a = u_time * 0.04 + wind * 0.15;
                float co = cos(a), si = sin(a);
                z = vec2(co*z.x - si*z.y, si*z.x + co*z.y);
                
                // Mandelbox fold
                if (z.x > 1.0) z.x = 2.0 - z.x;
                else if (z.x < -1.0) z.x = -2.0 - z.x;
                if (z.y > 1.0) z.y = 2.0 - z.y;
                else if (z.y < -1.0) z.y = -2.0 - z.y;
                
                // Spherical fold
                float r2 = dot(z,z);
                if (r2 < 0.5) z *= 2.0;
                else if (r2 < 1.0) z /= r2;
                
                z = z * 1.4 + c;
                
                trap1 = min(trap1, abs(z.x - z.y));
                
                if (length(z) > 16.0) break;
                iter++;
            }
            
            float r = length(z);
            float smooth_iter = iter;
            if (r > 1.0) smooth_iter -= log(log(r)) / log(1.4);
            
            // Base rainbow
            vec3 color = getRainbow(smooth_iter * 0.04 - u_time * 0.3 + wind * 0.4);
            
            // Slime Mold / Mycelial Veins
            float vein_mask = exp(-trap1 * 4.0);
            vec3 vein_col = getRainbow(trap1 * 3.0 + u_time * 0.2);
            color = mix(color, vec3(0.02), vein_mask * 0.9); // Dark veins
            color += vein_col * vein_mask * 0.6; // Glowing edges
            
            // XOR-Ghost Manifold (CA glitch)
            ivec2 ip = ivec2(abs(z * 4.0));
            float ca = float((ip.x ^ ip.y) % 7 == 0);
            color = mix(color, vec3(0.9, 0.9, 1.0), ca * 0.25 * exp(-r * 0.05));
            
            // Memphis Overlays mapped to fractal space
            float sq = squiggle(z, 2.0, 0.4, u_time * 4.0);
            float dt = dots(z, 1.2, 0.2);
            
            vec3 memphis_c1 = getRainbow(z.x * 0.15 + 0.4);
            vec3 memphis_c2 = getRainbow(z.y * 0.15 + 0.7);
            
            color = mix(color, memphis_c1, sq * 0.8);
            color = mix(color, memphis_c2, dt * 0.8);
            
            // Rain streaks (macro overlay)
            float streak = fract(dot(vUv, vec2(15.0, -25.0)) + u_time * 3.0);
            streak = smoothstep(0.96, 1.0, streak) * noise(vUv * 60.0 - rainDir * u_time * 15.0);
            color += streak * vec3(0.8, 0.9, 1.0) * 0.7;
            
            // Vignette
            float vig = length(vUv - 0.5) * 2.0;
            color *= 1.0 - pow(vig, 2.5) * 0.5;
            
            fragColor = vec4(color, 1.0);
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
  if (material.uniforms.u_mouse) {
    material.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
  }
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);