try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const uniforms = {
            u_time: { value: 0 },
            u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
        };

        const vertexShader = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            precision highp float;

            uniform float u_time;
            uniform vec2 u_resolution;

            in vec2 vUv;
            out vec4 fragColor;

            #define PI 3.14159265359
            #define TAU 6.28318530718
            #define GOLDEN_ANGLE 137.50776405
            
            // Gematria Resonances
            #define LOGOS 373.0
            #define ICHTHYS 1224.0
            #define YHWH 26.0

            // --- COLOR SYSTEMS (OKLCh to sRGB) ---
            vec3 OKLCh_to_OKLab(vec3 lch) {
                return vec3(lch.x, lch.y * cos(lch.z * PI / 180.0), lch.y * sin(lch.z * PI / 180.0));
            }
            
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
            
            vec3 linear_to_sRGB(vec3 c) {
                vec3 srgb;
                for(int i=0; i<3; i++) {
                    srgb[i] = c[i] <= 0.0031308 ? c[i] * 12.92 : 1.055 * pow(max(c[i], 0.0), 1.0/2.4) - 0.055;
                }
                return srgb;
            }
            
            vec3 oklch2srgb(float L, float C, float h) {
                // FERAL CONSTRAINT: NO BLACK, NO WHITE, NO EMPTY GRAY
                // Force Lightness into mid-high range, force Chroma to maximum neon thresholds
                L = clamp(L, 0.35, 0.85);
                C = clamp(C, 0.18, 0.35); 
                vec3 srgb = linear_to_sRGB(OKLab_to_linearSRGB(OKLCh_to_OKLab(vec3(L, C, h))));
                // Hard clamp to avoid invalid display space, but keep it punchy
                return clamp(srgb, 0.0, 1.0);
            }

            // --- NOISE & ALCHEMY ---
            vec2 hash2(vec2 p) {
                p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
                return fract(sin(p)*43758.5453123);
            }
            
            float hash1(float n) { return fract(sin(n) * 43758.5453123); }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f*f*(3.0-2.0*f);
                float a = hash2(i).x;
                float b = hash2(i + vec2(1.0, 0.0)).x;
                float c = hash2(i + vec2(0.0, 1.0)).x;
                float d = hash2(i + vec2(1.0, 1.0)).x;
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }
            
            float fbm(vec2 p) {
                float v = 0.0; float a = 0.5;
                for(int i=0; i<5; i++) {
                    v += a * noise(p); p *= 2.0; a *= 0.5;
                }
                return v;
            }

            // --- WET ENGINE / MORPHOGENESIS (Voronoi Anastomosis) ---
            vec3 voronoi(vec2 x, float t) {
                vec2 n = floor(x);
                vec2 f = fract(x);
                float F1 = 8.0, F2 = 8.0;
                vec2 mr;
                float mhash = 0.0;
                
                for(int j=-1; j<=1; j++)
                for(int i=-1; i<=1; i++) {
                    vec2 g = vec2(float(i), float(j));
                    vec2 o = hash2(n + g);
                    o = 0.5 + 0.5*sin(t + 6.2831*o); 
                    vec2 r = g + o - f;
                    float d = dot(r, r);
                    if(d < F1) {
                        F2 = F1;
                        F1 = d;
                        mr = r;
                        mhash = hash2(n + g).x;
                    } else if(d < F2) {
                        F2 = d;
                    }
                }
                
                float edgeDist = 8.0;
                for(int j=-2; j<=2; j++)
                for(int i=-2; i<=2; i++) {
                    vec2 g = vec2(float(i), float(j));
                    vec2 o = hash2(n + g);
                    o = 0.5 + 0.5*sin(t + 6.2831*o);
                    vec2 r = g + o - f;
                    if(dot(mr - r, mr - r) > 0.00001) {
                        float d = dot(0.5*(mr + r), normalize(r - mr));
                        edgeDist = min(edgeDist, d);
                    }
                }
                return vec3(sqrt(F1), edgeDist, mhash);
            }

            void main() {
                vec2 uv = vUv;
                vec2 p = (uv - 0.5) * u_resolution.x / u_resolution.y;
                float t = u_time * 0.4;

                // 1. I Ching Trigram Vector Field (Kan/Water + Xun/Wind)
                // Downward flow with lateral permeating diffusion
                vec2 kanWater = vec2(sin(p.y * 3.0 + t) * 0.4, -0.7 - 0.2 * cos(p.x * 2.0));
                vec2 xunWind = vec2(0.6 + 0.2 * sin(p.y * 4.0 + t), 0.3 * cos(p.x * 3.0));
                vec2 trigramForce = mix(kanWater, xunWind, 0.5 + 0.5 * sin(t * 0.5));
                
                // 2. Domain Warping (Mycelial search pattern / Enzymatic front)
                vec2 warpedP = p * 5.0 + trigramForce * t * 0.8;
                vec2 q = vec2(fbm(warpedP + vec2(0.0, t*0.3)), fbm(warpedP + vec2(5.2, 1.3)));
                vec2 r = vec2(fbm(warpedP + 4.0*q + vec2(1.7, 9.2)), fbm(warpedP + 4.0*q + vec2(8.3, 2.8)));
                warpedP += 2.5 * r;

                // 3. Fungal Voronoi (Armillaria mellea cord formers)
                vec3 v = voronoi(warpedP * 1.2, t);
                float dCenter = v.x;
                float dEdge = v.y;
                float cellHash = v.z;

                // Thick rhizomorph cords (hyphal superhighways)
                float hyphae = 1.0 - smoothstep(0.0, 0.25, dEdge);
                // Hollow out the cords slightly to create a tubular, wet look
                hyphae *= smoothstep(0.0, 0.1, dEdge); 

                // 4. Gematria Resonance at Anastomosis Nodes
                // Using LOGOS (373) and YHWH (26) frequencies to create standing waves
                float freqLogos = LOGOS / 60.0;
                float freqYhwh = YHWH / 5.0;
                
                // Node pulsation (primordia fruiting bodies)
                float nodePulse = 0.5 + 0.5 * cos(TAU * freqLogos * dCenter - t * 5.0);
                float nodeMask = smoothstep(0.4, 0.0, dCenter);
                float anastomosis = nodeMask * nodePulse;
                
                // Secondary beat pattern
                float beat = 0.5 + 0.5 * cos(TAU * freqYhwh * dEdge + t * 2.0);

                // 5. Structural Color / Thin Film Iridescence
                // Bragg reflection on the slimy hyphal walls: 2nd cos(theta) = m * lambda
                float n_film = 1.56; // Chitin refractive index
                float thickness = 300.0 + 400.0 * fbm(warpedP * 4.0 + t); // 300-700nm variations
                float viewAngle = dEdge * 3.0; // Simulate curved tubular structure
                float pathDiff = 2.0 * n_film * thickness * sqrt(1.0 - pow(sin(viewAngle)/n_film, 2.0));
                vec3 phaseShift = vec3(0.0, 0.33, 0.67);
                vec3 iridescence = 0.5 + 0.5 * cos(TAU * (pathDiff / 550.0 + phaseShift));

                // 6. OKLab Color Alchemy (Gross-but-cute neon plastic slime)
                // Substrate / Nutrient Gradient (Background)
                float bgHue = mod(t * 15.0 + fbm(warpedP * 0.5) * 360.0, 360.0);
                vec3 bgColor = oklch2srgb(0.45 + 0.2 * fbm(r * 3.0), 0.25, bgHue);

                // Hyphal Cords (Fibonacci Golden Angle Math Palette)
                float cordHue = mod(cellHash * GOLDEN_ANGLE * 5.0 + t * 20.0, 360.0);
                vec3 cordColor = oklch2srgb(0.65 + 0.15 * beat, 0.3, cordHue);
                
                // Overlay Structural Color onto cords (metallic/oily sheen)
                cordColor = mix(cordColor, iridescence, 0.6 * hyphae);

                // Fruiting Nodes (Max tension complementary contrast)
                float nodeHue = mod(cordHue + 180.0, 360.0);
                vec3 nodeColor = oklch2srgb(0.85, 0.35, nodeHue); // Hyper bright neon

                // 7. Composition & Mycelial Spore Swarm
                vec3 finalColor = mix(bgColor, cordColor, smoothstep(0.0, 0.8, hyphae * 1.5));
                finalColor = mix(finalColor, nodeColor, anastomosis * (0.5 + 0.5 * hyphae));

                // Add bioluminescent 'foxfire' spores drifting in the nutrient field
                float spores = smoothstep(0.85, 1.0, fbm(p * 25.0 - trigramForce * t * 2.0));
                vec3 sporeColor = oklch2srgb(0.8, 0.25, mod(bgHue + 90.0, 360.0));
                finalColor = mix(finalColor, sporeColor, spores * (1.0 - hyphae));

                // Intense chromatic aberration / saturation push
                finalColor = pow(finalColor, vec3(0.85)); // Contrast curve

                fragColor = vec4(finalColor, 1.0);
            }
        `;

        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: uniforms,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            depthWrite: false,
            depthTest: false
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);

        canvas.__three = { renderer, scene, camera, material };
    }

    const { renderer, scene, camera, material } = canvas.__three;

    if (material && material.uniforms && material.uniforms.u_time) {
        material.uniforms.u_time.value = time;
        material.uniforms.u_resolution.value.set(grid.width, grid.height);
    }

    renderer.setSize(grid.width, grid.height, false);
    renderer.render(scene, camera);

} catch (e) {
    console.error("WebGL Initialization Failed:", e);
}