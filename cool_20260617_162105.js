try {
    if (!ctx) throw new Error("Context not available");

    // Feral Chimera Mechanism: "Mycelial Girih Quasicrystal"
    // Blends: islamic_tiling (pentagrid quasicrystals), mycelial_networks (anastomosis/enzymatic decay),
    // structural_color (thin-film iridescence), and color_systems (perceptual cosine palettes).
    // NO BLACK. NO WHITE. NO EMPTY SPACE.

    if (!grid.canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas: grid.canvas, context: ctx, alpha: false, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        const vertexShader = `
            in vec3 position;
            void main() {
                gl_Position = vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            precision highp float;

            uniform float u_time;
            uniform vec2 u_resolution;
            uniform vec2 u_mouse;
            
            out vec4 fragColor;

            #define PI 3.14159265359
            #define GOLDEN_ANGLE 2.39996322973

            // --------------------------------------------------------
            // 1. NON-LINEAR NOISE & FBM (Morphogenesis / Enzymatic Decay)
            // --------------------------------------------------------
            float hash(vec2 p) {
                p = fract(p * vec2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                float a = hash(i);
                float b = hash(i + vec2(1.0, 0.0));
                float c = hash(i + vec2(0.0, 1.0));
                float d = hash(i + vec2(1.0, 1.0));
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }

            float fbm(vec2 p) {
                float f = 0.0;
                float amp = 0.5;
                for (int i = 0; i < 6; i++) {
                    f += amp * noise(p);
                    p *= 2.01;
                    amp *= 0.52;
                }
                return f;
            }

            // --------------------------------------------------------
            // 2. ISLAMIC GIRIH PENTAGRID (The Geometric Host)
            // --------------------------------------------------------
            float pgD(vec2 p, int k, float sp) {
                float a = float(k) * PI / 5.0;
                float g = float(k + 1) / 10.0;
                return abs(fract(dot(p, vec2(cos(a), sin(a))) / sp + g + 0.5) - 0.5) * sp;
            }

            float pgI(vec2 p, int k, float sp) {
                float a = float(k) * PI / 5.0;
                float g = float(k + 1) / 10.0;
                return floor(dot(p, vec2(cos(a), sin(a))) / sp + g + 0.5);
            }

            float allD(vec2 p, float sp) {
                float d = 1e9;
                for (int k = 0; k < 5; k++) {
                    d = min(d, pgD(p, k, sp));
                }
                return d;
            }

            float sumI(vec2 p, float sp) {
                float s = 0.0;
                for (int k = 0; k < 5; k++) {
                    s += pgI(p, k, sp);
                }
                return s;
            }

            float rosettePot(vec2 p, float sp) {
                float s = 0.0;
                for (int k = 0; k < 5; k++) {
                    float a = float(k) * PI / 5.0;
                    float g = float(k + 1) / 10.0;
                    s += cos((dot(p, vec2(cos(a), sin(a))) / sp + g) * 2.0 * PI);
                }
                return s;
            }

            // --------------------------------------------------------
            // 3. COLOR ALCHEMY (Strictly bounded to avoid Black/White)
            // --------------------------------------------------------
            vec3 safePalette(float t, vec3 base, vec3 amp, vec3 freq, vec3 phase) {
                vec3 col = base + amp * cos(6.28318 * (freq * t + phase));
                // Absolute mathematical guarantee: colors stay between 0.1 and 0.9 luminance
                return clamp(col, 0.1, 0.9);
            }

            void main() {
                vec2 uv = gl_FragCoord.xy / u_resolution.xy;
                vec2 p = (uv - 0.5) * 8.0;
                p.x *= u_resolution.x / u_resolution.y;

                float t = u_time * 0.15;

                // Mouse influence (chemo-attractant drift)
                vec2 m = u_mouse.xy / u_resolution.xy;
                p += (m - 0.5) * 2.0;

                // --- THE INFECTION (Domain Warping) ---
                // Fungal enzymes dissolving the mathematical perfection of the grid
                vec2 warp = vec2(fbm(p + t), fbm(p - t + 10.0));
                vec2 warpedP = p + warp * 1.8;
                
                // Deep recursion warp for substrate
                vec2 hyperWarped = warpedP + vec2(fbm(warpedP * 2.0), fbm(warpedP * 2.0 + 5.0)) * 0.6;

                float sp = 1.6; // Scale of the Girih quasicrystal

                // Topology Data
                float gridDist = allD(hyperWarped, sp);
                float rosettes = rosettePot(hyperWarped, sp);
                float geneticSector = mod(sumI(hyperWarped, sp), 5.0); // 5 distinct fungal sectors

                // --- LAYER 1: THE SUBSTRATE (No Empty Space) ---
                // Reaction-diffusion style enzymatic decay bath
                float decayTexture = fbm(p * 5.0 + warp * 2.5 - t * 2.0);
                float rdPattern = sin(decayTexture * 25.0 + t * 4.0) * 0.5 + 0.5;
                
                // Vibrant, dense background (Deep Purples, Teals, Magentas)
                vec3 substrateCol = safePalette(decayTexture + geneticSector * 0.15, 
                    vec3(0.5, 0.4, 0.6), // Base
                    vec3(0.4, 0.3, 0.3), // Amp
                    vec3(1.0, 1.0, 1.0), // Freq
                    vec3(0.0, 0.33, 0.67) // Phase
                );
                
                // Fold in the reaction-diffusion ridges
                vec3 rdCol = safePalette(rdPattern, 
                    vec3(0.6, 0.5, 0.4), 
                    vec3(0.3, 0.4, 0.4), 
                    vec3(1.0, 1.0, 1.0), 
                    vec3(0.5, 0.2, 0.8)
                );
                substrateCol = mix(substrateCol, rdCol, 0.45);

                // --- LAYER 2: MYCELIAL CORDS (Structural Color) ---
                // The Girih lines acting as pulsating nutrient highways
                float cordPulse = fbm(hyperWarped * 8.0 - t * 5.0);
                float cordWidth = 0.05 + 0.04 * sin(t * 4.0 + geneticSector * GOLDEN_ANGLE);
                
                // Anti-aliased hyphal walls
                float hypha = smoothstep(cordWidth, cordWidth - 0.02, gridDist);
                
                // Anastomosis Glow (fusing points where grid lines cross)
                float nodeGlow = 0.006 / (gridDist * gridDist + 0.002);
                nodeGlow = clamp(nodeGlow, 0.0, 1.0);

                // Thin-film interference / Bragg reflection on the cords
                // Simulating iridescent color shifting based on "thickness" (distance from center)
                float structuralPhase = gridDist * 12.0 + cordPulse + geneticSector * 0.4;
                vec3 cordCol = safePalette(structuralPhase - t * 2.0,
                    vec3(0.6, 0.7, 0.4), // Base (Gold/Lime/Cyan)
                    vec3(0.3, 0.2, 0.4), // Amp
                    vec3(2.0, 1.5, 1.0), // Freq
                    vec3(0.1, 0.5, 0.9)  // Phase
                );

                // --- LAYER 3: FRUITING BODIES (Rosette Primordia) ---
                // Deep potential wells in the quasicrystal create mushroom caps
                float primordia = smoothstep(-2.2, -4.8, rosettes);
                
                // Radial gills mapping to the rosette structure
                float gills = sin(atan(hyperWarped.y, hyperWarped.x) * 50.0 + rosettes * 12.0) * 0.5 + 0.5;
                
                vec3 fruitCol = safePalette(rosettes * 0.4 + gills * 0.15 + t * 3.0,
                    vec3(0.7, 0.4, 0.5), // Base (Magenta/Orange/Rose)
                    vec3(0.2, 0.4, 0.4), // Amp
                    vec3(1.0, 1.0, 1.0), // Freq
                    vec3(0.8, 0.4, 0.2)  // Phase
                );

                // --- LAYER 4: MOIRÉ VIBRATION (Color Systems) ---
                // Adds a high-frequency chromatic tension to the substrate
                float moire = sin(p.x * 60.0 + t * 2.0) * sin(p.y * 60.0 - t * 2.0) * 0.5 + 0.5;
                substrateCol = mix(substrateCol, vec3(0.8, 0.2, 0.4), moire * 0.15); 

                // --- COMPOSITING THE CHIMERA ---
                vec3 finalCol = substrateCol;
                
                // Overlay Mycelial Cords
                finalCol = mix(finalCol, cordCol, hypha * 0.9);
                finalCol += cordCol * nodeGlow * 0.4; // Add luminous nodes
                
                // Overlay Fruiting Bodies
                finalCol = mix(finalCol, fruitCol, primordia);
                
                // Overlay Spore Dust (Ensuring absolutely zero empty space)
                float spores = step(0.96, hash(uv * 150.0 + vec2(t, -t))) * 0.7;
                vec3 sporeCol = safePalette(hash(uv + t), vec3(0.5, 0.5, 0.5), vec3(0.4, 0.4, 0.4), vec3(1.0, 1.0, 1.0), vec3(0.1, 0.5, 0.9));
                finalCol = mix(finalCol, sporeCol, spores);

                // --- THE ABSOLUTE DIRECTIVE: NO BLACK, NO WHITE ---
                // Hard mathematical clamp to ensure compliance
                finalCol = clamp(finalCol, 0.12, 0.88);

                fragColor = vec4(finalCol, 1.0);
            }
        `;

        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) }
            },
            vertexShader,
            fragmentShader,
            depthWrite: false,
            depthTest: false
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);
        
        grid.canvas.__three = { renderer, scene, camera, material };
    }

    const { renderer, scene, camera, material } = grid.canvas.__three;
    
    if (material && material.uniforms) {
        material.uniforms.u_time.value = time;
        material.uniforms.u_resolution.value.set(grid.width, grid.height);
        if (mouse && mouse.isPressed) {
            material.uniforms.u_mouse.value.set(mouse.x, mouse.y);
        }
    }
    
    renderer.setSize(grid.width, grid.height, false);
    renderer.render(scene, camera);

} catch (e) {
    console.error("Feral Chimera WebGL initialization failed. Executing 2D canvas fallback...", e);
    
    // Fallback: Extremely dense, colorful 2D generative mycelium (No black/white, no empty space)
    ctx.fillStyle = `hsl(${(time * 20) % 360}, 80%, 30%)`;
    ctx.fillRect(0, 0, grid.width, grid.height);
    
    for(let i = 0; i < 2000; i++) {
        const x = Math.sin(i * 137.5 + time) * (grid.width/2) * Math.cos(i) + grid.width/2;
        const y = Math.cos(i * 137.5 - time) * (grid.height/2) * Math.sin(i) + grid.height/2;
        
        const r = Math.max(1, (Math.sin(i * 0.1 + time * 2) * 0.5 + 0.5) * 15);
        
        // Ensure lightness is strictly between 20% and 80% to avoid black/white
        const h = (i * 137.5 + time * 50) % 360;
        const s = 70 + (Math.sin(i) * 30);
        const l = 30 + (Math.cos(i * 0.5) * 0.5 + 0.5) * 40;
        
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${h}, ${s}%, ${l}%)`;
        ctx.fill();
        
        if (i > 0 && i % 3 === 0) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            const prevX = Math.sin((i-1) * 137.5 + time) * (grid.width/2) * Math.cos(i-1) + grid.width/2;
            const prevY = Math.cos((i-1) * 137.5 - time) * (grid.height/2) * Math.sin(i-1) + grid.height/2;
            ctx.lineTo(prevX, prevY);
            ctx.strokeStyle = `hsla(${(h + 180) % 360}, 90%, 50%, 0.5)`;
            ctx.lineWidth = Math.max(0.5, r * 0.2);
            ctx.stroke();
        }
    }
}