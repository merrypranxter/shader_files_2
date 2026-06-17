// THE WEIRD CODE GUY: KIOSHI-ABSORBER-V1 + ALCHEMICAL SCRIPTURE MODULE
// THEME: Tibetan Thangka Style Nebula Formation
// MECHANISM: "Divine Data Corruption" x "Volumetric Gas". 
// A sacred geometric vessel (Mandala SDF) tries to contain a violently expanding, 
// feral interstellar gas cloud. The gas is forced into lotus and square configurations,
// but leaks through hyperbolic domain warping. Structural color iridescence coats the 
// boundaries where the physical gas fights the mathematical constraint.

if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, grid.width/grid.height, 0.1, 1000);
        camera.position.z = 4.5;

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

            // --- ALCHEMICAL COLOR MATH (OKLCh to sRGB) ---
            // Sourced from color_fields & color_systems
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

            vec3 OKLCh_to_sRGB(float L, float C, float h_rad) {
                vec3 lab = vec3(L, C * cos(h_rad), C * sin(h_rad));
                vec3 lin = OKLab_to_linearSRGB(lab);
                // Gamma encode
                vec3 srgb = vec3(
                    lin.r <= 0.0031308 ? lin.r * 12.92 : 1.055 * pow(max(lin.r, 0.0), 1.0/2.4) - 0.055,
                    lin.g <= 0.0031308 ? lin.g * 12.92 : 1.055 * pow(max(lin.g, 0.0), 1.0/2.4) - 0.055,
                    lin.b <= 0.0031308 ? lin.b * 12.92 : 1.055 * pow(max(lin.b, 0.0), 1.0/2.4) - 0.055
                );
                return clamp(srgb, 0.0, 1.0);
            }

            // --- TIBETAN THANGKA PALETTE ---
            // Derived from golden ratio spacing and sacred pigment values
            vec3 getTibetanPalette(float t) {
                t = fract(t);
                // Lapis Lazuli, Cinnabar, Gold, Malachite, Void Purple
                vec3 c1 = OKLCh_to_sRGB(0.45, 0.18, 4.5);  // Deep Blue
                vec3 c2 = OKLCh_to_sRGB(0.55, 0.22, 0.5);  // Red
                vec3 c3 = OKLCh_to_sRGB(0.85, 0.18, 1.3);  // Gold
                vec3 c4 = OKLCh_to_sRGB(0.65, 0.15, 2.5);  // Green
                vec3 c5 = OKLCh_to_sRGB(0.30, 0.20, 5.5);  // Dark Magenta

                float s = 1.0 / 5.0;
                if(t < s) return mix(c1, c2, smoothstep(0.0, s, t));
                if(t < 2.*s) return mix(c2, c3, smoothstep(s, 2.*s, t));
                if(t < 3.*s) return mix(c3, c4, smoothstep(2.*s, 3.*s, t));
                if(t < 4.*s) return mix(c4, c5, smoothstep(3.*s, 4.*s, t));
                return mix(c5, c1, smoothstep(4.*s, 1.0, t));
            }

            // --- STRUCTURAL COLOR (Thin-Film Interference) ---
            vec3 thinFilm(float cosTheta, float thickness, float n) {
                float pathDiff = 2.0 * n * thickness * sqrt(1.0 - pow(sin(acos(cosTheta))/n, 2.0));
                vec3 phase = vec3(0.0, 0.33, 0.67);
                return 0.5 + 0.5 * cos(6.28318 * (pathDiff / 550.0 + phase));
            }

            // --- FERAL MATH / NOISE ---
            mat2 rot(float a) {
                float s = sin(a), c = cos(a);
                return mat2(c, -s, s, c);
            }

            float hash(vec3 p) {
                p = fract(p * vec3(443.897, 397.297, 491.187));
                p += dot(p, p.yxz + 19.19);
                return fract((p.x + p.y) * p.z);
            }

            float vnoise(vec3 p) {
                vec3 i = floor(p);
                vec3 f = fract(p);
                f = f*f*(3.0-2.0*f);
                return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
                               mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
                           mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
                               mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
            }

            float fbm(vec3 p) {
                float v = 0.0, a = 0.5;
                for(int i=0; i<5; i++) {
                    v += a * vnoise(p);
                    p = p * 2.0 + vec3(1.7, 9.2, 3.4);
                    a *= 0.5;
                }
                return v;
            }

            // --- SACRED GEOMETRY (MANDALA SDF) ---
            float sdLotus(vec2 p, float r, float petals) {
                float angle = atan(p.y, p.x);
                float rad = length(p);
                float a = 6.28318 / petals;
                angle = mod(angle + a/2.0, a) - a/2.0;
                vec2 q = vec2(cos(angle), sin(angle)) * rad;
                q.x -= r;
                return length(vec2(q.x, max(0.0, abs(q.y) - 0.15))) - 0.2;
            }

            float getThangkaConstraint(vec3 p) {
                // Hyperbolic folding (Domain 6: Exotic Terror)
                float r2 = dot(p.xy, p.xy);
                vec3 wp = p;
                wp.xy /= (1.0 + r2 * 0.05 * sin(u_time * 0.2));

                float r = length(wp.xy);
                
                // Central Void Deity
                float void_d = length(p) - 0.6;

                // 8-fold Lotus Base
                float lotus = sdLotus(wp.xy, 1.2, 8.0);
                
                // 16-fold Outer Lotus
                float outerLotus = sdLotus(wp.xy * rot(3.14159/8.0), 2.0, 16.0);

                // Celestial Halos
                float halo1 = abs(r - 1.5) - 0.05;
                float halo2 = abs(r - 2.4) - 0.02;

                // Earthly Square Gates (Mandala Box)
                vec2 q = abs(wp.xy * rot(3.14159/4.0));
                float box = max(q.x, q.y) - 1.8;

                // Combine Geometry (Boolean intersections and unions)
                float d = min(halo1, halo2);
                d = min(d, min(lotus, outerLotus));
                d = min(d, box);
                
                // Carve out the center void
                d = max(d, -void_d);
                
                // Confine to a volumetric slab
                d = max(d, abs(p.z) - 0.8);

                return d;
            }

            void main() {
                vec2 uv = (vUv - 0.5) * 2.0;
                uv.x *= u_resolution.x / u_resolution.y;

                // Ray setup
                vec3 ro = vec3(0.0, 0.0, 4.0);
                vec3 rd = normalize(vec3(uv, -1.0));

                // Dithered raymarching to avoid banding in gas
                float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
                
                const int STEPS = 60;
                const float STEP_SZ = 0.08;
                float t = dither * STEP_SZ;

                vec3 color = vec3(0.0);
                float transmittance = 1.0;

                for(int i=0; i<STEPS; i++) {
                    vec3 p = ro + rd * t;
                    
                    // Mandala rotates slowly
                    p.xy *= rot(u_time * 0.1);
                    p.xz *= rot(sin(u_time * 0.05) * 0.3);

                    // 1. Evaluate Sacred Geometry Constraint
                    float tSDF = getThangkaConstraint(p);

                    // 2. Evaluate Feral Gas
                    // Curl noise aphasia - the gas twists space
                    vec3 warp = vec3(fbm(p), fbm(p+1.3), fbm(p+2.7)) * 2.0 - 1.0;
                    float gas = fbm(p * 2.0 + warp * 0.5 - vec3(0.0, 0.0, u_time * 0.5));
                    
                    // 3. Collision: Gas is forced to exist within and tightly around the SDF
                    float aura = exp(-abs(tSDF) * 8.0); // Glows intensely exactly on the geometry lines
                    float volume = smoothstep(0.3, -0.1, tSDF); // Fills the inside
                    
                    // The core mechanism: The gas erodes the geometry
                    float density = (aura * 1.5 + volume * 0.8) * gas;

                    if (density > 0.01) {
                        // Semantic Color Mapping
                        float rad = length(p.xy);
                        float colorIdx = rad * 0.3 + gas * 0.5 - u_time * 0.1;
                        vec3 emit = getTibetanPalette(colorIdx);

                        // Structural Color Iridescence on the geometry boundaries
                        // Fake normal based on position for volumetric iridescence
                        vec3 pseudoNormal = normalize(p + warp*0.1);
                        float viewDot = abs(dot(rd, pseudoNormal));
                        vec3 iridescence = thinFilm(viewDot, 400.0 + gas * 300.0, 1.4);
                        
                        // Mix iridescence heavily on the rigid borders (aura)
                        emit = mix(emit, iridescence * 2.0, aura * 0.7);

                        // Supernova core logic
                        if (rad < 0.8) {
                            emit += vec3(1.0, 0.8, 0.4) * exp(-rad * 4.0) * gas;
                        }

                        // Volumetric integration
                        float absorption = density * 2.5;
                        color += transmittance * emit * density * STEP_SZ * 5.0;
                        transmittance *= exp(-absorption * STEP_SZ);
                    }

                    t += STEP_SZ;
                    if (transmittance < 0.01) break;
                }

                // Deep void background
                vec3 bg = mix(vec3(0.02, 0.01, 0.05), vec3(0.0), length(uv));
                color += transmittance * bg;

                // ACES Filmic Tonemapping
                color = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
                
                fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
            }
        `;

        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            vertexShader,
            fragmentShader,
            depthWrite: false,
            depthTest: false
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);

        canvas.__three = { renderer, scene, camera, material };
    } catch (e) {
        console.error("Feral WebGL Initialization Failed:", e);
        return;
    }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);