if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
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
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform float u_time;
            uniform vec2 u_resolution;

            // --- Math & Noise (Gematria & Glitchcore Foundation) ---
            float hash12(vec2 p) {
                vec3 p3  = fract(vec3(p.xyx) * 0.1031);
                p3 += dot(p3, p3.yzx + 33.33);
                return fract((p3.x + p3.y) * p3.z);
            }
            
            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                vec2 u = f*f*(3.0-2.0*f);
                return mix(mix(hash12(i), hash12(i+vec2(1.0,0.0)), u.x),
                           mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), u.x), u.y);
            }

            // --- SDFs (Myspace Bling & Early Internet UI) ---
            float sdBox(vec2 p, vec2 b) {
                vec2 d = abs(p) - b;
                return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
            }
            
            float sdStar(vec2 p, float r) {
                p = abs(p);
                return (p.x + p.y) - r; 
            }

            // --- Color Palettes (Acid Vibration & Hyperpop) ---
            const vec3 hotPink = vec3(1.0, 0.08, 0.58);
            const vec3 electricCyan = vec3(0.0, 1.0, 1.0);
            const vec3 acidLime = vec3(0.62, 1.0, 0.0);
            const vec3 deepViolet = vec3(0.54, 0.0, 1.0);
            const vec3 winGray = vec3(0.75);
            const vec3 winBlue = vec3(0.0, 0.0, 0.65);

            // --- Scene Render (Op-Art & Visual Debris) ---
            vec3 renderScene(vec2 p, float t, out float isWindow) {
                isWindow = 0.0;
                
                // Gematria Frequencies (YHWH = 26, LOGOS = 373)
                float f_YHWH = 26.0;
                float f_LOGOS = 37.3; // Scaled down
                
                // Kaleidoscope fold (Psychedelic Collage)
                vec2 kp = p;
                float a = atan(kp.y, kp.x);
                float r = length(kp);
                float folds = 12.0;
                a = mod(a, 6.28318 / folds);
                a = abs(a - 3.14159 / folds);
                kp = r * vec2(cos(a), sin(a));

                // Op-Art Tunnel (Retinal Surrealism)
                float z = 1.0 / (r + 0.05);
                float spiral = sin(a * 14.0 + z * f_YHWH - t * 6.0);
                float rings = cos(z * f_LOGOS + t * 4.0);
                float moire = sin(kp.x * 150.0) * cos(kp.y * 150.0);
                
                float op = smoothstep(-0.1, 0.1, spiral * rings + moire * 0.4);
                
                // Base Black & White
                vec3 col = mix(vec3(0.02), vec3(0.98), op);
                
                // Myspace Sparkles (Blingee Logic)
                vec2 sp = fract(p * 8.0 + t * 0.3) * 2.0 - 1.0;
                float star = sdStar(sp, 0.08);
                if (star < 0.0 && hash12(floor(p * 8.0 + t * 0.3)) > 0.6) {
                    col = mix(col, vec3(1.0), 0.8);
                }

                // Early Internet UI Debris (Windows 95 style)
                vec2 w1_p = p - vec2(0.5 * sin(t * 0.8), 0.3 * cos(t * 1.2));
                float w1 = sdBox(w1_p, vec2(0.35, 0.25));
                float w1_bar = sdBox(w1_p - vec2(0.0, 0.2), vec2(0.35, 0.05));
                
                if (w1 < 0.0) {
                    isWindow = 1.0;
                    col = winGray;
                    if (w1_bar < 0.0) col = winBlue;
                    
                    // Text / Icon debris inside window
                    vec2 text_uv = floor(w1_p * 40.0);
                    if (w1_bar > 0.0 && abs(w1_p.x) < 0.3 && w1_p.y < 0.1 && hash12(text_uv + t*0.01) > 0.6) {
                        col = vec3(0.0);
                    }
                }
                
                // Secondary Glitched Window
                vec2 w2_p = p - vec2(-0.4 * cos(t * 0.5), -0.4 * sin(t * 1.5));
                float w2 = sdBox(w2_p, vec2(0.2, 0.15));
                if (w2 < 0.0) {
                    isWindow = 1.0;
                    col = electricCyan;
                    if (hash12(floor(w2_p * 20.0 - t * 15.0)) > 0.5) col = deepViolet;
                }

                return col;
            }

            void main() {
                vec2 uv = vUv;
                vec2 p = uv * 2.0 - 1.0;
                p.x *= u_resolution.x / u_resolution.y;
                float t = u_time * 0.6;

                // --- Glitchcore & Analog Damage (VHS / Datamosh) ---
                // Macroblock compression chew
                vec2 block_uv = floor(uv * 24.0) / 24.0;
                float glitch_noise = noise(vec2(block_uv.y * 15.0, t * 8.0));
                float is_glitch = step(0.85, glitch_noise);
                
                // Tracking tear
                float tear = step(0.92, sin(uv.y * 35.0 + t * 20.0)) * sin(t * 40.0) * 0.2;
                vec2 warped_p = p + vec2(tear, 0.0);
                
                // Pixel sorting / horizontal smear
                if (is_glitch > 0.5) {
                    warped_p.x += hash12(block_uv + t) * 0.5 - 0.25;
                }

                // --- Channel Split (RGB Displacement) ---
                float split = 0.03 + 0.15 * is_glitch;
                
                float wR, wG, wB;
                vec3 colR = renderScene(warped_p + vec2(split, 0.0), t, wR);
                vec3 colG = renderScene(warped_p, t, wG);
                vec3 colB = renderScene(warped_p - vec2(split, 0.0), t, wB);
                
                vec3 finalCol = vec3(colR.r, colG.g, colB.b);
                
                // Inject Prismatic Pastel-Neon logic into the B&W Op-Art
                if (is_glitch < 0.5 && wG == 0.0) {
                    float luma = dot(finalCol, vec3(0.299, 0.587, 0.114));
                    vec3 tinted = mix(hotPink * finalCol.r, electricCyan * finalCol.b, sin(p.x * 5.0 + t) * 0.5 + 0.5);
                    finalCol = mix(finalCol, tinted, 0.6);
                }

                // --- Temporal Echo / Overprint Stacking ---
                float wGhost;
                vec3 ghost = renderScene(p * 1.05 + vec2(sin(t)*0.02), t - 0.15, wGhost);
                // Screen blend the ghost frame with high chroma (New Age Glam Fantasy bloom)
                finalCol = 1.0 - (1.0 - finalCol) * (1.0 - ghost * 0.4 * vec3(1.0, 0.4, 0.8));

                // --- CRT Scanlines & Luma Bloom ---
                float scanlines = 0.85 + 0.15 * sin(uv.y * u_resolution.y * 1.5);
                finalCol *= scanlines;
                
                // Halation / Bloom clipping
                float luma = dot(finalCol, vec3(0.299, 0.587, 0.114));
                if (luma > 0.8) {
                    finalCol += hotPink * 0.35; 
                }
                
                // Analog noise veil (Zine / Xerox artifact)
                finalCol += (hash12(uv + t * 10.0) - 0.5) * 0.12;

                // Edge Vignette
                finalCol *= smoothstep(1.5, 0.2, length(uv - 0.5));

                fragColor = vec4(finalCol, 1.0);
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
        console.error("WebGL Initialization Failed:", e);
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