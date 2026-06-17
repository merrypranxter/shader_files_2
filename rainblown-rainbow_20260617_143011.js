try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL2 context required for feral math engine.");

        const renderer = new THREE.WebGLRenderer({ canvas: canvas, context: ctx, alpha: true, antialias: true });
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const vertexShader = `
            out vec2 vUv;
            void main() {
                vUv = position.xy * 0.5 + 0.5;
                gl_Position = vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            in vec2 vUv;
            out vec4 fragColor;

            uniform float u_time;
            uniform vec2 u_resolution;
            uniform vec2 u_mouse;

            #define PI 3.14159265359
            #define MAX_ITER 60
            #define TOLERANCE 1e-4

            // --- FERAL HASH & NOISE (Mycelial streaming / Wet engine) ---
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                           mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
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

            // Divergence-free curl noise for "rainblown" advection
            vec2 curl(vec2 p) {
                float eps = 0.05;
                float n1 = fbm(p + vec2(0.0, eps));
                float n2 = fbm(p - vec2(0.0, eps));
                float n3 = fbm(p + vec2(eps, 0.0));
                float n4 = fbm(p - vec2(eps, 0.0));
                return vec2(n1 - n2, n4 - n3) / (2.0 * eps);
            }

            // --- COMPLEX MATH (Newton Fractal Core) ---
            vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
            vec2 cdiv(vec2 a, vec2 b) { float d = dot(b,b) + 1e-8; return vec2(dot(a,b), a.y*b.x - a.x*b.y)/d; }
            vec2 cpow(vec2 z, int n) {
                vec2 r = vec2(1.0, 0.0);
                for(int i=0; i<10; i++) {
                    if(i>=n) break;
                    r = cmul(r, z);
                }
                return r;
            }

            // --- OKLAB COLOR SYSTEM (Perceptual Rainbow Mastery) ---
            vec3 oklch_to_oklab(vec3 lch) {
                return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
            }

            vec3 oklab_to_linear_srgb(vec3 c) {
                float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
                float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
                float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
                float l = l_*l_*l_, m = m_*m_*m_, s = s_*s_*s_;
                return vec3(
                     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                );
            }

            vec3 linear_to_srgb(vec3 c) {
                vec3 sq1 = sqrt(clamp(c, 0.0, 1.0));
                vec3 sq2 = sqrt(sq1);
                vec3 sq3 = sqrt(sq2);
                return 0.662002687 * sq1 + 0.684122060 * sq2 - 0.323583601 * sq3 - 0.022541147 * c;
            }

            void main() {
                vec2 uv = vUv;
                vec2 p = (uv - 0.5) * 2.0;
                p.x *= u_resolution.x / u_resolution.y;

                // Drift the domain to simulate falling through the math
                vec2 z = p * 1.5 - vec2(u_time * 0.1, -u_time * 0.3);
                
                // Rainblown wind vector (diagonal sheer)
                vec2 wind = vec2(1.5, -2.5) * 0.15;

                int degree = 5; // Pentagonal symmetry z^5 - 1
                float relax = 0.85 + 0.15 * sin(u_time * 0.5); // Underdamped chaos

                int converge_iter = MAX_ITER;
                vec2 root = vec2(0.0);
                float trap = 100.0;

                // Feral Newton Iteration with Fluid Advection
                for(int i = 0; i < MAX_ITER; i++) {
                    // The "Rainblown" mechanism: actively distort the space during root-seeking
                    // Creates shredded, bleeding basin boundaries.
                    vec2 flow = curl(z * 1.5 + u_time * 0.2);
                    z += (wind + flow * 0.2) * 0.05;

                    vec2 zd = cpow(z, degree);
                    vec2 fz = zd - vec2(1.0, 0.0);
                    vec2 fpz = float(degree) * cpow(z, degree - 1);
                    vec2 step = cdiv(fz, fpz);

                    z -= relax * step;
                    trap = min(trap, length(step));

                    if(length(fz) < TOLERANCE) {
                        converge_iter = i;
                        root = z;
                        break;
                    }
                }

                // 1. Map root angle to hue (Golden Angle distribution)
                float angle = atan(root.y, root.x);
                float hue = angle + u_time * 0.3 + fbm(p * 2.0) * 0.5;

                // 2. Map iterations to lightness & chroma
                float iter_norm = float(converge_iter) / float(MAX_ITER);
                
                // OKLCh: L (lightness 0-1), C (chroma 0-0.4), h (hue in radians)
                float L = 0.85 - iter_norm * 0.7 + exp(-trap * 5.0) * 0.3;
                float C = 0.12 + iter_norm * 0.2 + (1.0 - iter_norm) * 0.15;
                
                vec3 lch = vec3(L, C, hue);
                vec3 baseColor = linear_to_srgb(oklab_to_linear_srgb(oklch_to_oklab(lch)));

                // 3. Memphis Confetti Overlay (Distorted by Rain)
                vec2 memphis_uv = vUv * 20.0;
                memphis_uv += (wind + curl(memphis_uv * 0.05)) * u_time * 5.0; // Advected by storm
                
                vec2 gid = floor(memphis_uv);
                vec2 guv = fract(memphis_uv) - 0.5;
                
                float h_val = hash(gid);
                if(h_val > 0.85) {
                    float d = length(guv) - 0.2;
                    float fill = 1.0 - smoothstep(0.0, 0.05, d);
                    float ring = smoothstep(0.05, 0.0, abs(d) - 0.02);
                    
                    // Clashing neon memphis colors
                    vec3 memphisColor = (h_val > 0.92) ? vec3(1.0, 0.2, 0.4) : vec3(1.0, 0.8, 0.0);
                    
                    // Blend confetti into the rainbow storm
                    baseColor = mix(baseColor, memphisColor, fill * (1.0 - iter_norm * 0.5));
                    baseColor = mix(baseColor, vec3(0.0), ring * 0.8);
                }

                // 4. Rain Streaks / Moiré Interference
                float streak = smoothstep(0.7, 1.0, fbm(vec2(vUv.x * 10.0 + vUv.y * 6.0, vUv.y - u_time * 3.0) * 4.0));
                baseColor += vec3(0.1, 0.4, 0.8) * streak * 0.4;
                
                // Vignette
                float vignette = 1.0 - smoothstep(0.5, 1.5, length(vUv - 0.5));
                baseColor *= vignette;

                fragColor = vec4(clamp(baseColor, 0.0, 1.0), 1.0);
            }
        `;

        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader,
            fragmentShader,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) }
            }
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);

        canvas.__three = { renderer, scene, camera, material };
    }

    const { renderer, scene, camera, material } = canvas.__three;

    if (material && material.uniforms) {
        material.uniforms.u_time.value = time;
        material.uniforms.u_resolution.value.set(grid.width, grid.height);
        if (mouse) {
            material.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - (mouse.y / grid.height));
        }
    }

    renderer.setSize(grid.width, grid.height, false);
    renderer.render(scene, camera);

} catch (err) {
    console.error("Feral brain WebGL execution failed:", err);
}