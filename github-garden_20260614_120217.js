try {
    if (!ctx) throw new Error("WebGL context not available");

    // Initialize Three.js environment attached to the canvas
    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0)); // Optimize for performance
        
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        camera.position.z = 1;

        // ---------------------------------------------------------------------
        // THE FERAL SHADER: 
        // A synthesis of Botanical Illustration (Haeckel radial folds, stipple),
        // Structural Color (Thin-film interference, Gyroids),
        // Psychedelic Collage (Halftone, CMYK offset, Xerox noise),
        // and Merry's Visual Bible (The Tetragrammaton core, Void background).
        // ---------------------------------------------------------------------
        
        const vertexShader = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            in vec2 vUv;
            out vec4 fragColor;

            uniform float u_time;
            uniform vec2 u_resolution;
            uniform vec2 u_mouse;

            #define PI 3.14159265359
            #define TAU 6.28318530718
            #define MAX_STEPS 100
            #define SURF_DIST 0.001
            #define MAX_DIST 20.0

            // --- REPO: psychedelic_collage (Textures & Noise) ---
            float hash12(vec2 p) {
                vec3 p3  = fract(vec3(p.xyx) * .1031);
                p3 += dot(p3, p3.yzx + 33.33);
                return fract((p3.x + p3.y) * p3.z);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                float res = mix(
                    mix(hash12(i), hash12(i + vec2(1, 0)), f.x),
                    mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
                return res;
            }

            // --- REPO: color_fields (Palettes) ---
            vec3 cosinePalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
                return a + b * cos(TAU * (c * t + d));
            }
            
            vec3 neonAcid(float t) {
                return cosinePalette(t, vec3(0.5), vec3(0.5), vec3(2.0, 1.0, 1.0), vec3(0.5, 0.2, 0.25));
            }
            
            vec3 occultJewel(float t) {
                return cosinePalette(t, vec3(0.4, 0.2, 0.3), vec3(0.4, 0.2, 0.3), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.33, 0.67));
            }

            // --- REPO: structural_color (Physics) ---
            vec3 thinFilmInterference(float cosTheta, float thickness) {
                // Simplified Bragg/Thin-film equation mapping to RGB
                float n_film = 1.56; // Chitin/Silica
                float pathDiff = 2.0 * n_film * thickness * sqrt(1.0 - pow(sin(acos(cosTheta))/n_film, 2.0));
                // Map optical path difference to a spectral palette
                return 0.5 + 0.5 * cos(TAU * (pathDiff * vec3(1.0, 0.5, 0.25) + vec3(0.0, 0.33, 0.67)));
            }

            float gyroid(vec3 p) {
                return dot(sin(p), cos(p.yzx)) / 1.5;
            }

            // --- REPO: botanical_illustration & visual_bible (Geometry) ---
            mat2 rot(float a) {
                float s = sin(a), c = cos(a);
                return mat2(c, -s, s, c);
            }

            vec2 radialFold(vec2 p, float n) {
                float a = atan(p.y, p.x);
                float r = length(p);
                float s = TAU / n;
                a = mod(a + s * 0.5, s) - s * 0.5;
                return vec2(cos(a), sin(a)) * r;
            }

            // Global material ID passing
            float matID = 0.0;

            float map(vec3 p) {
                vec3 bp = p;
                
                // Slow cosmic rotation
                p.yz *= rot(u_time * 0.1);
                p.xz *= rot(u_time * 0.15);

                // 1. The Tetragrammaton Core (Visual Bible)
                vec3 coreP = p;
                coreP.xz = radialFold(coreP.xz, 4.0);
                float core = length(coreP - vec3(0.2, 0.0, 0.0)) - 0.3;
                core += gyroid(coreP * 10.0 - u_time) * 0.05; // Boiling energy

                // 2. Haeckel Radial Petals (Botanical Illustration)
                vec3 petalP = p;
                // Fibonacci/Golden angle inspired fold count shifting over time
                float folds = 7.0 + sin(u_time * 0.05) * 2.0; 
                petalP.xz = radialFold(petalP.xz, folds);
                
                // Morphogenesis: undulating petals
                petalP.y += sin(petalP.x * 5.0 - u_time * 2.0) * 0.2;
                petalP.z += cos(petalP.x * 3.0 + u_time) * 0.1;
                
                float petals = length(vec2(length(petalP.xz) - 1.2, petalP.y)) - 0.05 + petalP.x * 0.05;
                // Add fungal/organic ridging
                petals += gyroid(petalP * 5.0) * 0.08;

                // 3. The Whirring / Halos (Visual Bible)
                vec3 haloP = p;
                haloP.xy *= rot(u_time * 0.5);
                float halo = length(vec2(length(haloP.xy) - 2.0, haloP.z)) - 0.02;

                // Material assignment based on minimum distance
                float d = min(core, min(petals, halo));
                if (d == core) matID = 1.0;
                else if (d == petals) matID = 2.0;
                else matID = 3.0;

                return d;
            }

            vec3 calcNormal(vec3 p) {
                vec2 e = vec2(0.001, 0);
                return normalize(vec3(
                    map(p + e.xyy) - map(p - e.xyy),
                    map(p + e.yxy) - map(p - e.yxy),
                    map(p + e.yyx) - map(p - e.yyx)
                ));
            }

            // --- REPO: botanical_illustration & psychedelic_collage (Render) ---
            float stipple(vec2 p, float density, float darkness) {
                vec2 cell = floor(p * density);
                float ox = hash12(cell + vec2(0.1, 0.2)) - 0.5;
                float oy = hash12(cell + vec2(0.3, 0.7)) - 0.5;
                vec2 center = (cell + 0.5 + vec2(ox, oy) * 0.4) / density;
                float dist = length(p - center);
                float dot_r = darkness * 0.4 / density;
                return smoothstep(dot_r, dot_r * 0.5, dist);
            }

            float halftone(vec2 fragCoord, float freq, float angle, float luma) {
                float rad = radians(angle);
                mat2 rotMat = mat2(cos(rad), -sin(rad), sin(rad), cos(rad));
                vec2 uv = rotMat * fragCoord * freq;
                vec2 cell = fract(uv) - 0.5;
                float dist = length(cell);
                float dotRadius = sqrt(luma) * 0.7; // Inverted luma for CMYK feel
                return smoothstep(dotRadius + 0.1, dotRadius - 0.1, dist);
            }

            void main() {
                // Screen coordinates with CMYK misregistration offset base
                vec2 uv = (vUv - 0.5) * 2.0;
                uv.x *= u_resolution.x / u_resolution.y;
                vec2 fragCoord = vUv * u_resolution;

                // Camera setup
                vec3 ro = vec3(0.0, 0.0, -4.0);
                vec3 rd = normalize(vec3(uv, 1.0));

                // Raymarching
                float d0 = 0.0;
                float hitMat = 0.0;
                vec3 p;
                bool hit = false;
                
                for(int i = 0; i < MAX_STEPS; i++) {
                    p = ro + rd * d0;
                    float dS = map(p);
                    if(dS < SURF_DIST) {
                        hit = true;
                        hitMat = matID;
                        break;
                    }
                    if(d0 > MAX_DIST) break;
                    d0 += dS;
                }

                // Base Paper/Void Background (Psychedelic Collage + Visual Bible)
                // "Aged Newsprint" meets "The Void"
                vec3 C_PAPER = vec3(0.95, 0.92, 0.85);
                vec3 C_VOID = vec3(0.05, 0.04, 0.06);
                float noiseBg = noise(uv * 3.0 + u_time * 0.1);
                vec3 bgCol = mix(C_VOID, C_PAPER * 0.2, noiseBg * 0.5); // Dark, textural void

                vec3 col = bgCol;
                float luma = 0.0;

                if (hit) {
                    vec3 n = calcNormal(p);
                    vec3 v = -rd;
                    float cosTheta = max(0.0, dot(n, v));
                    
                    // Lighting
                    vec3 lightPos = vec3(2.0 * sin(u_time), 3.0, -2.0 * cos(u_time));
                    vec3 l = normalize(lightPos - p);
                    float dif = max(0.0, dot(n, l));
                    float ao = clamp(map(p + n * 0.1) * 10.0, 0.0, 1.0);

                    // Material dispatch
                    if (hitMat == 1.0) {
                        // Tetragrammaton Core: Acid Neon, self-luminous
                        col = neonAcid(p.y * 2.0 + u_time) * (dif + 0.5) * ao;
                    } else if (hitMat == 2.0) {
                        // Haeckel Petals: Structural Color (Thin Film)
                        // Thickness varies organically using gyroid
                        float thickness = 0.5 + 0.5 * gyroid(p * 2.0);
                        col = thinFilmInterference(cosTheta, thickness) * (dif * 0.8 + 0.2) * ao;
                    } else if (hitMat == 3.0) {
                        // The Whirring: Occult Jewel tones
                        col = occultJewel(atan(p.y, p.x) / TAU + u_time) * 1.5;
                    }

                    // --- Botanical Illustration Linework ---
                    // Primary outline (Fresnel edge)
                    float rim = 1.0 - cosTheta;
                    float outline = smoothstep(0.7, 0.8, rim);
                    col = mix(col, vec3(0.05, 0.02, 0.05), outline); // Dark ink outline

                    luma = dot(col, vec3(0.299, 0.587, 0.114));

                    // --- Haeckel Stipple Texture in Shadows ---
                    float darkArea = 1.0 - dif;
                    float stip = stipple(vUv, 150.0, darkArea);
                    col = mix(col, vec3(0.1, 0.05, 0.0), stip * 0.8);
                }

                // --- Psychedelic Collage Post-Processing ---

                // 1. Wet Edge Bloom (Watercolor botanical)
                // Fake sub-surface scattering / aura based on distance
                float aura = exp(-d0 * 0.2) * (1.0 - float(hit));
                col += neonAcid(u_time * 0.5) * aura * 0.5;

                // 2. Halftone Screen (Xerox/Zine artifact)
                // Apply halftone dots to midtones and background
                float ht = halftone(vUv, 120.0, 45.0, luma > 0.0 ? luma : noiseBg * 0.5);
                // Blend halftone over image (Multiply-ish)
                col = mix(col, col * ht, 0.4);

                // 3. Chromatic Aberration & CMYK Misregistration
                // Shift channels slightly based on radial distance
                float shift = 0.005 * length(uv);
                vec3 shiftedCol;
                // Fake sample shifts (since we can't easily multi-pass here, we approximate by shifting the base color calculation based on UVs)
                // Instead of a true multi-pass, we apply a color separation effect to the final computed pixel
                shiftedCol.r = col.r * (1.0 + shift);
                shiftedCol.g = col.g;
                shiftedCol.b = col.b * (1.0 - shift);
                col = mix(col, shiftedCol, 0.8);

                // 4. Paper Grain Overlay
                float grain = noise(fragCoord * 0.5 + u_time * 10.0);
                col += (grain - 0.5) * 0.1;

                // Contrast crush (Xerox artifact)
                col = smoothstep(0.05, 0.95, col);

                fragColor = vec4(col, 1.0);
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
            },
            depthWrite: false,
            depthTest: false
        });

        const geometry = new THREE.PlaneGeometry(2, 2);
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        canvas.__three = { renderer, scene, camera, material };
    }

    const { renderer, scene, camera, material } = canvas.__three;

    // Guard uniforms
    if (material && material.uniforms) {
        if (material.uniforms.u_time) material.uniforms.u_time.value = time;
        if (material.uniforms.u_resolution) {
            material.uniforms.u_resolution.value.set(grid.width, grid.height);
        }
        if (material.uniforms.u_mouse && mouse) {
            material.uniforms.u_mouse.value.set(mouse.x / grid.width, mouse.y / grid.height);
        }
    }

    // Handle resizing natively
    const pixelRatio = renderer.getPixelRatio();
    if (canvas.width !== grid.width * pixelRatio || canvas.height !== grid.height * pixelRatio) {
        renderer.setSize(grid.width, grid.height, false);
    }

    renderer.render(scene, camera);

} catch (e) {
    console.error("Feral Render Engine Failure:", e);
    // Fallback Canvas 2D glitch matrix if WebGL fails
    if (ctx && ctx.fillRect) {
        ctx.fillStyle = '#05040a'; // The Void
        ctx.fillRect(0, 0, grid.width, grid.height);
        for(let i=0; i<1000; i++) {
            ctx.fillStyle = `hsl(${(time * 100 + i) % 360}, 100%, 50%)`; // Acid Neon
            ctx.fillRect(
                Math.random() * grid.width, 
                Math.random() * grid.height, 
                Math.random() * 5, 
                Math.random() * 20
            );
        }
    }
}