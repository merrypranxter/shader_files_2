const canvas = document.getElementById('c') || document.createElement('canvas');
if (!document.getElementById('c')) {
    canvas.id = 'c';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.zIndex = '-1';
    document.body.appendChild(canvas);
}

// Feral Design-Brain Activated.
// We are building "THE ANOMALY" (Tarot Card 0).
// Mechanism: Autophagic Memory Splicing + Structural Color + Risograph Misregistration.
// The card is a 2D boundary containing a 3D non-Euclidean manifold.

if (!canvas.__three) {
    try {
        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for heavy shader

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        camera.position.z = 1;

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
            #define PHI 1.61803398875

            // --- COLOR ALCHEMY (OKLab to sRGB) ---
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

                vec3 rgb_clamped = clamp(rgb, 0.0, 1.0);
                return mix(
                    rgb_clamped * 12.92,
                    1.055 * pow(rgb_clamped, vec3(1.0/2.4)) - 0.055,
                    step(0.0031308, rgb_clamped)
                );
            }

            vec3 oklch_to_srgb(float L, float C, float h) {
                float h_rad = h * PI / 180.0;
                return oklab_to_srgb(vec3(L, C * cos(h_rad), C * sin(h_rad)));
            }

            // --- MATHEMATICAL ROTATION ---
            mat2 rot(float a) {
                float s = sin(a), c = cos(a);
                return mat2(c, -s, s, c);
            }

            // --- NOISE & MORPHOGENESIS ---
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f*f*(3.0-2.0*f);
                return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), f.x),
                           mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), f.x), f.y);
            }

            float fbm(vec2 p) {
                float f = 0.0;
                float amp = 0.5;
                for(int i = 0; i < 5; i++) {
                    f += amp * noise(p);
                    p = p * 2.0 + vec2(3.1, 1.4);
                    amp *= 0.5;
                }
                return f;
            }

            // --- SACRED GEOMETRY SDFs ---
            float sdTetrahedron(vec3 p, float r) {
                float md = max(max(-p.x-p.y-p.z, p.x+p.y-p.z), max(-p.x+p.y+p.z, p.x-p.y+p.z));
                return (md - r) / sqrt(3.0);
            }

            float sdMerkaba(vec3 p, float r) {
                float t1 = sdTetrahedron(p, r);
                float t2 = sdTetrahedron(vec3(-p.x, -p.y, p.z), r);
                return min(t1, t2);
            }

            float sdTorus(vec3 p, vec2 t) {
                vec2 q = vec2(length(p.xz)-t.x, p.y);
                return length(q)-t.y;
            }

            // --- 3D SCENE MAP ---
            vec2 map(vec3 p) {
                vec3 q = p;
                
                // Kairotempic Rotation
                q.xy *= rot(u_time * 0.3);
                q.xz *= rot(u_time * 0.4);
                
                // The Deity (Merkaba)
                float d_merkaba = sdMerkaba(q, 0.6 + sin(u_time)*0.05);
                
                // The Orbital Binding (Torus)
                vec3 q_torus = p;
                q_torus.yz *= rot(u_time * 0.2);
                q_torus.xy *= rot(sin(u_time * 0.5));
                float d_torus = sdTorus(q_torus, vec2(1.1, 0.02 + 0.02*sin(u_time*3.0)));
                
                // Metric Competition: Inner void sphere
                float d_void = length(p) - 0.3;
                
                float d = min(max(d_merkaba, -d_void), d_torus);
                
                float mat = d == d_torus ? 2.0 : 1.0;
                return vec2(d, mat);
            }

            // --- NORMAL CALCULATION ---
            vec3 calcNormal(vec3 p) {
                const vec2 e = vec2(1.0, -1.0) * 0.0005;
                return normalize(
                    e.xyy * map(p + e.xyy).x + 
                    e.yyx * map(p + e.yyx).x + 
                    e.yxy * map(p + e.yxy).x + 
                    e.xxx * map(p + e.xxx).x
                );
            }

            // --- TAROT CARD RENDERER ---
            vec3 renderCard(vec2 uv) {
                // Aspect 1:1.73
                vec2 card_uv = (uv - 0.5) * vec2(1.0, 1.73) * 2.5;
                
                // Card boundary (L-infinity norm for sharp edges, slightly rounded)
                vec2 ab = abs(card_uv);
                float card_dist = length(max(ab - vec2(0.95, 1.68), 0.0)) - 0.05;
                
                if (card_dist > 0.0) {
                    // The Void Outside
                    float n = fbm(uv * 10.0 + u_time * 0.1);
                    return oklch_to_srgb(0.1 + n*0.05, 0.05, 260.0);
                }

                // Inner Border System
                float inner_border = length(max(ab - vec2(0.85, 1.58), 0.0)) - 0.02;
                if (inner_border > 0.0) {
                    // Gold border
                    float shimmer = sin(card_uv.x * 20.0 + u_time) * sin(card_uv.y * 20.0 - u_time);
                    return oklch_to_srgb(0.75 + shimmer*0.1, 0.15, 80.0);
                }

                // Morphogenesis Background (Thoth Aethyr Palette)
                vec2 fbm_uv = card_uv * 2.0;
                vec2 q = vec2(fbm(fbm_uv + u_time * 0.2), fbm(fbm_uv + vec2(5.2, 1.3) - u_time * 0.15));
                vec2 r = vec2(fbm(fbm_uv + 4.0 * q + vec2(1.7, 9.2)), fbm(fbm_uv + 4.0 * q + vec2(8.3, 2.8)));
                float n_bg = fbm(fbm_uv + 8.0 * r);
                
                // Dark magenta/blue jewel tones
                vec3 bg_color = oklch_to_srgb(0.2 + n_bg*0.3, 0.15 + n_bg*0.1, 300.0 + n_bg*60.0);

                // Sacred Geometry Halo (2D)
                float halo_dist = length(card_uv);
                float halo = smoothstep(0.8, 0.78, halo_dist) * smoothstep(0.76, 0.78, halo_dist);
                bg_color += oklch_to_srgb(0.9, 0.2, 90.0) * halo * (0.5 + 0.5*sin(u_time*2.0 - atan(card_uv.y, card_uv.x)*5.0));

                // 3D Raymarching Setup
                vec3 ro = vec3(card_uv * 1.5, -4.0); // Orthographic-ish origin
                vec3 rd = normalize(vec3(0.0, 0.0, 1.0));
                
                float t = 0.0;
                vec2 res = vec2(0.0);
                for(int i = 0; i < 40; i++) {
                    vec3 p = ro + rd * t;
                    res = map(p);
                    if(res.x < 0.001 || t > 8.0) break;
                    t += res.x;
                }

                vec3 final_color = bg_color;

                // If Hit 3D Object
                if(t < 8.0) {
                    vec3 p = ro + rd * t;
                    vec3 n = calcNormal(p);
                    vec3 v = -rd;
                    
                    float cosTheta = max(dot(n, v), 0.0);
                    float fresnel = pow(1.0 - cosTheta, 3.0);
                    
                    if (res.y == 1.0) {
                        // Structural Color (Thin-film interference on Merkaba)
                        float thickness = 300.0 + fbm(p.xy * 5.0) * 200.0 + sin(u_time)*50.0;
                        float pathDiff = 2.0 * 1.56 * thickness * cosTheta; // 1.56 = Chitin IOR
                        vec3 phase = vec3(0.0, 0.33, 0.67); // RGB phase shifts
                        vec3 interference = 0.5 + 0.5 * cos(TAU * (pathDiff / vec3(600.0, 500.0, 400.0) + phase));
                        
                        final_color = interference * (0.8 + 0.5 * fresnel);
                    } else {
                        // Glowing Torus (Plasma)
                        final_color = oklch_to_srgb(0.8, 0.2, 195.0) * (1.0 + fresnel * 2.0);
                    }
                }

                // Tarot Overlay: Title Bar
                float title_bar = step(1.3, card_uv.y) * step(card_uv.y, 1.5) * step(abs(card_uv.x), 0.7);
                if (title_bar > 0.0) {
                    final_color = mix(final_color, oklch_to_srgb(0.1, 0.05, 260.0), 0.9);
                    // Fake text (Aphasia curl noise)
                    float txt = step(0.6, noise(card_uv * vec2(50.0, 100.0)));
                    final_color = mix(final_color, oklch_to_srgb(0.8, 0.15, 80.0), txt * 0.5 * step(1.35, card_uv.y) * step(card_uv.y, 1.45));
                }

                // Tarot Overlay: Number (Top Center)
                float num_box = step(-1.5, card_uv.y) * step(card_uv.y, -1.3) * step(abs(card_uv.x), 0.2);
                if (num_box > 0.0) {
                    final_color = oklch_to_srgb(0.8, 0.15, 80.0);
                    // Cutout the "0" (The Fool / The Anomaly)
                    float zero = length(vec2(card_uv.x, card_uv.y + 1.4));
                    if (zero < 0.08 && zero > 0.05) final_color = oklch_to_srgb(0.1, 0.05, 260.0);
                }

                return final_color;
            }

            void main() {
                vec2 uv = vUv;

                // --- DAMAGE AESTHETICS: VHS Tracking Tear ---
                // Bureaucratic failure of the coordinate system
                float tear = step(0.95, sin(uv.y * 12.0 + u_time * 4.0)) * sin(u_time * 15.0) * 0.015;
                float tear2 = step(0.99, sin(uv.y * 50.0 - u_time * 10.0)) * 0.02;
                vec2 base_uv = uv + vec2(tear + tear2, 0.0);

                // --- RISOGRAPH MISREGISTRATION (RGB Split) ---
                // The machine hesitates.
                float misreg_amount = 0.006 + 0.004 * sin(u_time * 2.0);
                vec2 offsetR = vec2(misreg_amount, 0.0);
                vec2 offsetB = vec2(-misreg_amount, 0.0);

                vec3 colR = renderCard(base_uv + offsetR);
                vec3 colG = renderCard(base_uv);
                vec3 colB = renderCard(base_uv + offsetB);

                vec3 final_color = vec3(colR.r, colG.g, colB.b);

                // --- RISOGRAPH HALFTONE (AM Screen proxy) ---
                float luma = dot(final_color, vec3(0.2126, 0.7152, 0.0722));
                float lpi = 150.0;
                mat2 rot45 = rot(PI/4.0);
                vec2 dot_uv = fract(rot45 * uv * lpi) - 0.5;
                float dot_radius = 0.38 * (1.0 - luma);
                float dots = smoothstep(dot_radius, dot_radius - 0.1, length(dot_uv));
                
                // Multiply blend the halftone texture slightly to retain structural color
                final_color = mix(final_color, final_color * dots, 0.15);

                // --- CRT/FILM DAMAGE ---
                // Vignette
                vec2 dc = uv - 0.5;
                final_color *= 1.0 - dot(dc, dc) * 0.8;
                
                // Scanlines
                final_color *= 0.95 + 0.05 * sin(uv.y * u_resolution.y * 0.5);

                // Sensor Noise / Grain
                final_color += (hash(uv + u_time) - 0.5) * 0.06;

                fragColor = vec4(clamp(final_color, 0.0, 1.0), 1.0);
            }
        `;

        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader,
            fragmentShader,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
            },
            depthWrite: false,
            depthTest: false
        });

        const geometry = new THREE.PlaneGeometry(2, 2);
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        canvas.__three = { renderer, scene, camera, material };

        window.addEventListener('resize', () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            renderer.setSize(width, height, false);
            material.uniforms.u_resolution.value.set(width, height);
        });
        
        // Trigger initial resize
        window.dispatchEvent(new Event('resize'));

    } catch (e) {
        console.error("WebGL 2 Initialization Failed:", e);
    }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms && material.uniforms.u_time) {
    material.uniforms.u_time.value = time;
}

if (renderer && scene && camera) {
    renderer.render(scene, camera);
}