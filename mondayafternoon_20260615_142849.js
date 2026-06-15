try {
    if (!canvas.__three) {
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
            uniform float u_time;
            uniform vec2 u_resolution;
            
            in vec2 vUv;
            out vec4 fragColor;

            #define PI 3.14159265359

            // --- PERCEPTUAL COLOR MATH (OKLCh to sRGB) ---
            // From color_systems repo: Perceptually uniform color spaces
            vec3 oklch_to_oklab(vec3 lch) {
                return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
            }
            
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
            
            float linear_to_srgb_channel(float x) {
                return x <= 0.0031308 ? x * 12.92 : 1.055 * pow(max(x, 0.0), 1.0/2.4) - 0.055;
            }
            
            vec3 oklch_to_srgb(vec3 lch) {
                vec3 lin = oklab_to_linear_srgb(oklch_to_oklab(lch));
                return vec3(linear_to_srgb_channel(lin.r), linear_to_srgb_channel(lin.g), linear_to_srgb_channel(lin.b));
            }

            // --- WEIRD MATH UTILS ---
            mat2 rot(float a) {
                float s = sin(a), c = cos(a);
                return mat2(c, -s, s, c);
            }

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                           mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
            }

            // FBM for "Rainblown" turbulence
            float fbm(vec2 p) {
                float v = 0.0;
                float a = 0.5;
                for (int i = 0; i < 5; i++) {
                    v += a * noise(p);
                    p = p * 2.0 * rot(0.5);
                    a *= 0.5;
                }
                return v;
            }

            // Memphis Design Squiggle (Structural Pattern)
            float squiggle(vec2 p, float row, float freq, float amp, float t) {
                float y_off = amp * sin(freq * p.x + t + row * 2.39996);
                return smoothstep(0.02, 0.0, abs(p.y - row - y_off));
            }

            void main() {
                vec2 uv = (vUv - 0.5) * 2.0;
                uv.x *= u_resolution.x / u_resolution.y;
                
                vec2 p_orig = uv;
                vec2 p = uv;

                // 1. RAINBLOWN WIND MECHANISM (Domain Warping / Fluid Dynamics)
                float t = u_time * 0.15;
                vec2 warp = vec2(fbm(p * 2.5 + t), fbm(p * 2.5 - t + 10.0));
                p += (warp - 0.5) * 0.6; // Distort the mathematical space

                // 2. KLEINIAN HYPERBOLIC FOLDING
                float trap = 100.0;
                float scale = 1.0;
                
                for (int i = 0; i < 6; i++) {
                    p = abs(p) - vec2(0.4, 0.3); // Fold
                    p *= rot(u_time * 0.05 + 0.15 * float(i)); // Twist
                    
                    float r2 = dot(p, p);
                    // Mobius Circle Inversion
                    float k = 1.1 / max(r2, 0.08); 
                    p *= k;
                    scale *= k;
                    
                    trap = min(trap, length(p));
                }

                // 3. STRUCTURAL COLOR (Iridescence via Fibonacci / Golden Angle)
                // Golden angle = 137.508 deg = 2.39996 rad
                float hue_idx = trap * 3.0 + warp.x * 2.0;
                float h = hue_idx * 2.39996 + u_time * 0.5; 
                
                // Thin-film interference simulation (Lightness & Chroma oscillation)
                float interference = sin(trap * 25.0 - u_time * 2.0);
                float l = 0.55 + 0.2 * interference; // Brightness bands
                float c = 0.18 + 0.12 * fbm(p_orig * 2.0); // Vibrant neon chroma

                vec3 color = oklch_to_srgb(vec3(l, c, h));

                // 4. RETINAL SURREALISM (Op Art / Moiré Overlay)
                // High frequency interference pattern based on the folded space
                float moire = sin(length(p) * 40.0 / scale) * 0.5 + 0.5;
                color *= mix(1.0, moire, 0.4); // Blend optical vibration

                // 5. MEMPHIS DESIGN INFECTION (Squiggles and Confetti)
                // Distorted by the rainblown wind
                float sq = 0.0;
                for(float r = -1.0; r <= 1.0; r += 0.25) {
                    sq = max(sq, squiggle(p_orig * 1.5 + warp * 0.5, r, 6.0, 0.15, u_time * 2.0));
                }

                // I Ching / CA style confetti
                vec2 gv = fract((p_orig + warp*0.2) * 12.0) - 0.5;
                vec2 id = floor((p_orig + warp*0.2) * 12.0);
                float dot_mask = step(length(gv), 0.2 * hash(id + floor(u_time * 4.0))); // Glitchy blinking

                // Apply structural B&W contrast over the color engine
                color = mix(color, vec3(0.02), sq); // Deep void squiggles
                color = mix(color, vec3(0.98), dot_mask * smoothstep(0.4, 0.6, warp.y)); // Rainblown bright confetti

                // Deep void vignette (Merry's Visual Bible)
                float vig = 1.0 - smoothstep(0.3, 1.8, length(uv));
                color *= vig;

                // Glitch Artifacts (NaN/Inf protection and crunch)
                if (isnan(color.r) || isinf(color.r)) color = vec3(1.0, 0.0, 0.5); // Acid pink error catch

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

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);

        canvas.__three = { renderer, scene, camera, material };
    }

    const { renderer, scene, camera, material } = canvas.__three;

    if (material && material.uniforms) {
        if (material.uniforms.u_time) material.uniforms.u_time.value = time;
        if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(grid.width, grid.height);
    }

    renderer.setSize(grid.width, grid.height, false);
    renderer.render(scene, camera);

} catch (e) {
    console.error("Feral WebGL Engine Initialization Failed:", e);
}