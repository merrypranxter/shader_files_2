try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    // Initialize Three.js environment if it doesn't exist
    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        
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

            #define MAX_STEPS 80
            #define GHOST_STEPS 30
            #define MAX_DIST 20.0
            #define SURF_DIST 0.005
            #define PI 3.14159265359

            mat2 rot(float a) {
                float s = sin(a), c = cos(a);
                return mat2(c, -s, s, c);
            }

            // WFC Entropy / Fungal noise field
            float entropyField(vec3 p) {
                return sin(p.x * 2.0 + u_time) * cos(p.y * 2.0 - u_time) * sin(p.z * 2.0);
            }

            // Triply Periodic Minimal Surfaces (TPMS)
            float map(vec3 p) {
                // Global spatial warp (Datamoshing / Tensor bias)
                p.xy *= rot(p.z * 0.15 + u_time * 0.1);
                
                vec3 q = p * 2.0;

                // 1. Gyroid Labyrinth
                float g1 = dot(sin(q), cos(q.yzx)) / 2.0;
                
                // 2. Schwarz P Lattice
                float g2 = (cos(q.x) + cos(q.y) + cos(q.z)) / 3.0;

                // WFC Collapse: Morph between Gyroid and Schwarz P based on local entropy
                float entropy = entropyField(p);
                float surface = mix(abs(g1) - 0.03, abs(g2) - 0.06, smoothstep(-0.4, 0.4, entropy));

                // 3. Floating Data Cores (Spores)
                vec3 fp = fract(p * 2.0) - 0.5;
                float pulse = 0.02 * sin(u_time * 15.0 + p.z * 10.0 + p.x * 5.0);
                float cores = length(fp) - (0.05 + pulse);

                // 4. Glitch / Signal Dropout (Bureaucratic failure)
                float glitch = sin(p.x * 12.0) * sin(p.y * 12.0) * sin(p.z * 12.0);
                surface = max(surface, glitch - 0.95); // Punch holes in the manifold

                return min(surface, cores) * 0.6; // Conservative step for implicit surfaces
            }

            // Normal calculation
            vec3 getNormal(vec3 p) {
                vec2 e = vec2(0.005, 0.0);
                return normalize(vec3(
                    map(p + e.xyy) - map(p - e.xyy),
                    map(p + e.yxy) - map(p - e.yxy),
                    map(p + e.yyx) - map(p - e.yyx)
                ));
            }

            // Material & Palette (Candy-Acid / Structural Color)
            vec3 getPalette(vec3 p, float t, vec3 n) {
                vec3 fp = fract(p * 2.0) - 0.5;
                float isCore = length(fp) < 0.1 ? 1.0 : 0.0;

                // Base Colors
                vec3 coreCol = vec3(0.0, 1.0, 0.9); // Electric Cyan
                vec3 surfCol = mix(vec3(1.0, 0.0, 0.5), vec3(1.0, 0.8, 0.0), smoothstep(-0.5, 0.5, sin(p.y * 4.0 + u_time))); // Hot Pink to Neon Yellow
                
                vec3 base = mix(surfCol, coreCol, isCore);

                // ChromaDepth: Fade to Ultraviolet in the distance
                base = mix(base, vec3(0.3, 0.0, 0.8), clamp(t / 12.0, 0.0, 1.0));

                // Iridescence / Fresnel
                float fres = pow(1.0 - max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0), 2.0);
                base += fres * vec3(0.5, 0.8, 1.0) * (1.0 - isCore); // Shiny structural edges

                return base;
            }

            void main() {
                // Normalize pixel coordinates
                vec2 uv = (vUv - 0.5) * 2.0;
                uv.x *= u_resolution.x / u_resolution.y;

                // --- VHS Tape Wear & Tracking Error ---
                float trackY = fract(u_time * 0.3);
                float trackBand = smoothstep(0.12, 0.0, abs((vUv.y) - trackY));
                float trackNoise = fract(sin(dot(vUv.yy, vec2(12.9898, 78.233)) + u_time) * 43758.5453);
                uv.x += trackBand * (trackNoise - 0.5) * 0.08;

                // --- Wiggle Stereoscopy (Motion Parallax) ---
                // 6.5 Hz smooth-square wave oscillation
                float freq = 6.5;
                float phase = fract(u_time * freq);
                float wiggle = smoothstep(0.35, 0.5, phase) - smoothstep(0.85, 1.0, phase);
                wiggle = wiggle * 2.0 - 1.0; // Oscillates between -1.0 and 1.0

                float baseline = 0.18; // Hyperstereo baseline
                float focal_dist = 2.5; // Convergence plane

                // Off-axis camera shift
                vec3 ro = vec3(wiggle * baseline, 0.0, u_time * 2.0);
                vec2 uv_shifted = uv;
                uv_shifted.x -= wiggle * (baseline / focal_dist);

                // Lens Distortion (Barrel)
                uv_shifted *= 1.0 + 0.15 * dot(uv_shifted, uv_shifted);

                vec3 rd = normalize(vec3(uv_shifted, 1.0));

                // --- Primary Raymarch ---
                float t = 0.0;
                for(int i = 0; i < MAX_STEPS; i++) {
                    float d = map(ro + rd * t);
                    if(d < SURF_DIST || t > MAX_DIST) break;
                    t += d;
                }

                vec3 col = vec3(0.0);

                if(t < MAX_DIST) {
                    vec3 p = ro + rd * t;
                    vec3 n = getNormal(p);

                    col = getPalette(p, t, n);

                    // Lighting
                    vec3 l = normalize(vec3(0.8, 1.0, -0.5));
                    float diff = max(dot(n, l), 0.0) * 0.7 + 0.3; // Ambient + Diffuse
                    col *= diff;

                    // Depth Fog (Void Bloom)
                    col = mix(col, vec3(0.04, 0.0, 0.08), smoothstep(2.0, 14.0, t));
                } else {
                    col = vec3(0.04, 0.0, 0.08); // Background void
                }

                // --- Chromatic Aberration & Ghost Fringe (Secondary Raymarch) ---
                // Simulating longitudinal CA and VHS chroma bleed via a ghost ray shifted radially/laterally
                vec3 rd_ghost = normalize(vec3(uv_shifted + vec2(0.025, 0.0), 1.0));
                float t_ghost = 0.0;
                for(int i = 0; i < GHOST_STEPS; i++) {
                    float d = map(ro + rd_ghost * t_ghost);
                    if(d < SURF_DIST || t_ghost > MAX_DIST) break;
                    t_ghost += d;
                }
                if (t_ghost < MAX_DIST) {
                    // Extreme magenta/red bleed from the ghost hit
                    float ghost_intensity = exp(-t_ghost * 0.25) * 0.8;
                    col.r += ghost_intensity;
                    col.b += ghost_intensity * 0.5;
                }

                // --- Analog Post-Processing ---
                // Dropout (White noise spikes)
                float dropout = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + u_time * 10.0) * 43758.5453);
                if (dropout > 0.997) col = vec3(1.0);

                // Scanlines & Vignette
                col *= 0.85 + 0.15 * sin(vUv.y * u_resolution.y * 1.5);
                col *= 1.0 - 0.5 * dot(vUv - 0.5, vUv - 0.5);

                // Output
                fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
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

    // Handle resize
    if (renderer.getSize(new THREE.Vector2()).width !== grid.width || 
        renderer.getSize(new THREE.Vector2()).height !== grid.height) {
        renderer.setSize(grid.width, grid.height, false);
        if (material?.uniforms?.u_resolution) {
            material.uniforms.u_resolution.value.set(grid.width, grid.height);
        }
    }

    // Update time
    if (material?.uniforms?.u_time) {
        material.uniforms.u_time.value = time;
    }

    // Render
    renderer.render(scene, camera);

} catch (e) {
    console.error("WebGL Initialization or Render Failed:", e);
}