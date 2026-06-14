try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL context not available");

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
            precision highp float;
            
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform float u_time;
            uniform vec2 u_resolution;

            #define PI 3.14159265359
            #define TAU 6.28318530718
            #define PHI 1.61803398875

            // --- Feral Math & Noise ---
            float hash21(vec2 p) {
                p = fract(p * vec2(127.34, 311.7));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                float a = hash21(i);
                float b = hash21(i + vec2(1.0, 0.0));
                float c = hash21(i + vec2(0.0, 1.0));
                float d = hash21(i + vec2(1.0, 1.0));
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }

            float fbm(vec2 p) {
                float v = 0.0;
                float a = 0.5;
                mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
                for (int i = 0; i < 5; i++) {
                    v += a * noise(p);
                    p = rot * p * 2.0 + vec2(100.0);
                    a *= 0.5;
                }
                return v;
            }

            // --- Complex Dynamics ---
            vec2 cmul(vec2 a, vec2 b) {
                return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x);
            }
            
            vec2 cdiv(vec2 a, vec2 b) {
                float d = dot(b, b);
                return vec2(dot(a, b), a.y*b.x - a.x*b.y) / (d + 1e-8);
            }

            vec2 cpow(vec2 z, float n) {
                float r = length(z);
                float a = atan(z.y, z.x);
                return pow(r, n) * vec2(cos(n * a), sin(n * a));
            }

            // --- Structural Color (Thin Film Iridescence) ---
            vec3 spectralRGB(float w) {
                float r = clamp(abs(w * 6.0 - 3.0) - 1.0, 0.0, 1.0);
                float g = clamp(2.0 - abs(w * 6.0 - 2.0), 0.0, 1.0);
                float b = clamp(2.0 - abs(w * 6.0 - 4.0), 0.0, 1.0);
                return vec3(r, g, b);
            }

            vec3 thinFilm(float thickness, float cosTheta) {
                float n_film = 1.4;
                float pathDiff = 2.0 * n_film * thickness * cosTheta;
                vec3 color = vec3(0.0);
                // Integrate over visible spectrum (approx)
                for(float i = 0.0; i < 1.0; i += 0.1) {
                    float lambda = mix(400.0, 700.0, i);
                    float phase = (pathDiff / lambda) * TAU;
                    float intensity = 0.5 + 0.5 * cos(phase);
                    color += spectralRGB(i) * intensity;
                }
                return color / 10.0;
            }

            // --- OKLab Color Math ---
            vec3 linear_to_sRGB(vec3 c) {
                vec3 a = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0/2.4)) - 0.055;
                vec3 b = c * 12.92;
                return mix(b, a, step(vec3(0.0031308), c));
            }

            vec3 oklab_to_linear(vec3 c) {
                float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
                float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
                float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
                float l = l_*l_*l_;
                float m = m_*m_*m_;
                float s = s_*s_*s_;
                return vec3(
                    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                   -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                   -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                );
            }

            void main() {
                vec2 uv = (vUv - 0.5) * 2.0;
                uv.x *= u_resolution.x / u_resolution.y;
                
                // 1. Rainblown Domain Warp (Erosion + Gravity)
                // The Thangka is weeping, dripping mathematics.
                float t = u_time * 0.2;
                vec2 warp = vec2(
                    fbm(uv * 2.0 + vec2(0.0, t)),
                    fbm(uv * 3.0 - vec2(t * 1.5, t * 2.0))
                );
                
                // Downward smear intensity based on height
                float rain_intensity = smoothstep(1.0, -1.0, uv.y) * 0.3;
                vec2 warped_uv = uv + warp * rain_intensity * vec2(0.5, 1.5);
                
                // 2. Central Deity: 5-Fold Newton Fractal (z^5 - 1)
                // Symbolizing the 5 Dhyani Buddhas, dissolving into chaos.
                vec2 z = warped_uv * 2.0;
                float iterCount = 0.0;
                const int MAX_ITER = 30;
                float min_dist = 100.0;
                
                for(int i = 0; i < MAX_ITER; i++) {
                    vec2 z4 = cpow(z, 4.0);
                    vec2 z5 = cmul(z4, z);
                    vec2 fz = z5 - vec2(1.0, 0.0);
                    vec2 dfz = 5.0 * z4;
                    
                    vec2 step = cdiv(fz, dfz);
                    
                    // The "Feral" mechanism: Machine hesitation & fungal growth
                    // Injecting curl noise into the complex derivation to rot the edges
                    float rot = fbm(z * 5.0 + t) * TAU;
                    vec2 hesitation = vec2(cos(rot), sin(rot)) * 0.02 * rain_intensity;
                    
                    z -= (step * 0.8) + hesitation;
                    
                    min_dist = min(min_dist, length(step));
                    
                    if(length(step) < 0.01) break;
                    iterCount++;
                }
                
                // 3. Tibetan Thangka Mandala Framing & Cymatics
                // Generating Chladni resonance rings overlaid on the fractal
                float r = length(uv);
                float a = atan(uv.y, uv.x);
                
                // Bessel-like standing wave (Cymatics)
                float chladni = cos(r * 20.0 - u_time * 2.0) * cos(5.0 * a);
                float mandala_ring = smoothstep(0.05, 0.0, abs(fract(r * 4.0 - u_time*0.5) - 0.5));
                
                // Lotus petal stipple (Botanical illustration influence)
                float petals = sin(a * 10.0) * 0.1;
                float lotus_edge = smoothstep(0.02, 0.0, abs(r - 0.8 - petals));
                
                // 4. Structural Color (Rainblown Rainbow)
                // Map the Newton iteration & distance to a physical film thickness
                float thickness = 300.0 + (iterCount / float(MAX_ITER)) * 600.0;
                thickness += fbm(warped_uv * 10.0) * 200.0; // Weathering
                
                // Fake a normal map from the fractal distance for iridescence
                float bump = fbm(z * 20.0);
                vec3 normal = normalize(vec3(dFdx(bump), dFdy(bump), 1.0));
                vec3 view = normalize(vec3(uv, 1.0));
                float cosTheta = max(dot(normal, view), 0.1);
                
                vec3 iridescence = thinFilm(thickness, cosTheta);
                
                // 5. OKLab Harmony Coloring
                // Base colors drawn from Golden Angle dispersion (Color Systems)
                float root_angle = atan(z.y, z.x);
                float hue_angle = (root_angle / TAU) + t * 0.1;
                
                // OKLCh to OKLab
                float L = 0.65 - min_dist * 0.5 + mandala_ring * 0.2;
                float C = 0.15 + (1.0 - iterCount/float(MAX_ITER)) * 0.1;
                vec3 oklab = vec3(
                    L,
                    C * cos(hue_angle * TAU),
                    C * sin(hue_angle * TAU)
                );
                
                vec3 base_color = linear_to_sRGB(oklab_to_linear(oklab));
                
                // 6. Blending the Masterpiece
                // Mix the structural rainbow with the mathematical base
                vec3 final_color = mix(base_color, iridescence * 2.5, 0.6);
                
                // Add the Thangka gold leaf lines (Lotus + Chladni nodes)
                vec3 gold = vec3(1.0, 0.8, 0.3);
                float gold_mask = max(lotus_edge, smoothstep(0.98, 1.0, chladni));
                final_color = mix(final_color, gold, gold_mask * 0.8);
                
                // Add the watercolor wash/stipple paper texture
                float paper = fbm(uv * 50.0);
                final_color *= 0.9 + 0.1 * paper;
                
                // Vignette & Abyssal Void
                float vignette = 1.0 - smoothstep(0.5, 1.5, r);
                final_color *= vignette;
                
                // Glitch Prophet: Handle NaNs gracefully by making them gold dust
                if (isnan(final_color.x)) final_color = gold * hash21(uv + u_time);
                
                fragColor = vec4(final_color, 1.0);
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

} catch (err) {
    console.error("Feral Math Initialization Failed:", err);
}