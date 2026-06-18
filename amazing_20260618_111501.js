try {
    // ─── INITIALIZATION & PERSISTENCE GUARD ──────────────────────────────────
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            context: ctx,
            alpha: false,
            antialias: false,
            preserveDrawingBuffer: false
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(grid.width, grid.height, false);
        renderer.autoClear = false;

        // ─── PING-PONG FRAMEBUFFERS FOR WET ENGINE ───────────────────────────
        const rtParams = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType, // High precision for reaction-diffusion
            depthBuffer: false,
            stencilBuffer: false,
            generateMipmaps: false
        };
        const fboA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
        const fboB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const scene = new THREE.Scene();
        const quadGeo = new THREE.PlaneGeometry(2, 2);

        // ─── SHADER 1: THE WET ENGINE (SIMULATION) ───────────────────────────
        // Fuses Tessellation, Apollonian Gaskets, DLA curl-growth, Gematria, and Strange Attractors
        const simShader = `
            precision highp float;
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform sampler2D u_backbuffer;
            uniform float u_time;
            uniform vec2 u_resolution;
            
            #define PI 3.14159265359
            #define TAU 6.28318530718
            
            // Gematria Values (Resonance Frequencies)
            const float YHWH = 26.0;
            const float LOGOS = 373.0;
            const float BEREISHIT = 913.0;
            
            // Hash / Noise
            vec2 hash22(vec2 p) {
                vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
                p3 += dot(p3, p3.yzx + 33.33);
                return fract((p3.xx+p3.yz)*p3.zy) * 2.0 - 1.0;
            }
            
            // Tessellation: p6m Symmetry Fold (Hex/Tri Lattice)
            vec2 foldP6m(vec2 p) {
                p = abs(p);
                const float sqrt3 = 1.73205080757;
                if (p.y > p.x * sqrt3) p = vec2(p.x * sqrt3 + p.y, p.x - p.y * sqrt3) * 0.5;
                p = abs(p);
                if (p.y > p.x * sqrt3) p = vec2(p.x * sqrt3 + p.y, p.x - p.y * sqrt3) * 0.5;
                return abs(p);
            }
            
            // Recursive Apollonian Gasket (The Casket)
            vec3 apollonian(vec2 p, float t) {
                float scale = 1.0;
                float d = 1e6;
                vec2 orbit = vec2(0.0);
                
                for(int i=0; i<6; i++) {
                    p = -1.0 + 2.0 * fract(p * 0.5 + 0.5); // Domain warp
                    float r2 = dot(p,p);
                    float k = 1.3 / r2; // Inversion
                    p *= k;
                    scale *= k;
                    orbit += p;
                    
                    // Lace Pattern Modulation: Scalloped edges based on frequency
                    float lace = 0.05 * sin(p.x * 12.0 + t) * cos(p.y * 12.0 - t);
                    d = min(d, (length(p) - 0.4 + lace) / scale);
                }
                return vec3(d, orbit);
            }
            
            // Strange Attractor Advection Field (Clifford + De Jong hybrid)
            vec2 attractorField(vec2 p, float t) {
                float a = 1.4, b = 1.7, c = 1.4, d = 1.5;
                vec2 v1 = vec2(sin(a*p.y) + c*cos(a*p.x), sin(b*p.x) + d*cos(b*p.y));
                vec2 v2 = vec2(sin(a*p.y) - cos(b*p.x), sin(c*p.x) - cos(d*p.y));
                return mix(v1, v2, sin(t*0.1)*0.5+0.5);
            }

            void main() {
                vec2 uv = vUv;
                vec2 p = (uv * 2.0 - 1.0) * (u_resolution.xy / min(u_resolution.x, u_resolution.y));
                
                // Dream Physics: Kairotempics Warp (Non-linear space-time)
                float warpTime = u_time * 0.2;
                p *= 1.0 + 0.1 * sin(length(p) * 3.0 - warpTime);
                
                // Fold into Tessellation
                vec2 foldedP = foldP6m(p * 1.5 + warpTime * 0.2);
                
                // Evaluate Apollonian Casket
                vec3 apol = apollonian(foldedP, u_time);
                float sdf = apol.x;
                
                // Gematria Resonance Interference
                float freq1 = YHWH / 100.0;
                float freq2 = LOGOS / 200.0;
                float resonance = cos(sdf * freq1 * TAU - u_time) * cos(sdf * freq2 * TAU + u_time);
                
                // Curl Noise / DLA Dendrite Vector (Gradient of SDF)
                vec2 eps = vec2(0.002, 0.0);
                float dx = apollonian(foldedP + eps.xy, u_time).x - apollonian(foldedP - eps.xy, u_time).x;
                float dy = apollonian(foldedP + eps.yx, u_time).x - apollonian(foldedP - eps.yx, u_time).x;
                vec2 curl = vec2(dy, -dx); // Perpendicular to gradient -> flows along edges
                
                // Combine Curl with Strange Attractor for fluid advection
                vec2 attr = attractorField(p * 2.0, u_time);
                vec2 advection = (curl * 0.003) + (attr * 0.001);
                
                // Sample previous frame (Reaction-Diffusion feedback)
                vec2 texel = 1.0 / u_resolution;
                vec4 prev = texture(u_backbuffer, uv - advection);
                
                // Diffusion (Laplacian approx)
                vec4 n = texture(u_backbuffer, uv + vec2(0.0, texel.y));
                vec4 s = texture(u_backbuffer, uv - vec2(0.0, texel.y));
                vec4 e = texture(u_backbuffer, uv + vec2(texel.x, 0.0));
                vec4 w = texture(u_backbuffer, uv - vec2(texel.x, 0.0));
                vec4 blur = (n + s + e + w) * 0.25;
                
                // Bioluminescent Injection (Gray-Scott / Kuramoto hybrid driver)
                // Inject energy at casket boundaries modulated by Gematria resonance
                float inject = smoothstep(0.02, 0.00, abs(sdf)) * (0.5 + 0.5 * resonance);
                
                // FitzHugh-Nagumo style excitation/recovery
                float u = prev.r; // Excitation
                float v = prev.g; // Recovery
                float phase = prev.b; // Kuramoto Phase
                
                float nextU = mix(u, blur.r, 0.2) + inject * 0.5 - v * 0.05;
                float nextV = mix(v, blur.g, 0.1) + u * u * 0.1;
                
                // Phase coupling (Kuramoto)
                float nextPhase = phase + 0.05 + (blur.b - phase) * 0.1 + inject * 0.2;
                
                // Decay and clamp
                nextU = clamp(nextU * 0.98, 0.0, 1.0);
                nextV = clamp(nextV * 0.95, 0.0, 1.0);
                nextPhase = fract(nextPhase);
                
                fragColor = vec4(nextU, nextV, nextPhase, 1.0);
            }
        `;

        // ─── SHADER 2: RENDER COMPOSITE & COLOR ALCHEMY ──────────────────────
        // Converts simulation state to perceptual OKLab colors. STRICT NO BLACK/WHITE.
        const renderShader = `
            precision highp float;
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform sampler2D u_fluid;
            uniform float u_time;
            
            #define PI 3.14159265359
            
            // OKLCh to sRGB Conversion (Color Systems Repo)
            // L: 0..1, C: 0..0.4, h: 0..2PI
            vec3 oklch2srgb(float L, float C, float h) {
                // CLAMPING TO ENFORCE RULE: Absolutely no black, no white, no neutrals.
                L = clamp(L, 0.30, 0.85); // Shadows stay colored/deep, highlights stay colored
                C = clamp(C, 0.12, 0.35); // Force high saturation

                float a = C * cos(h);
                float b = C * sin(h);

                float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
                float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
                float s_ = L - 0.0894841775 * a - 1.2914855480 * b;

                float l3 = l_*l_*l_;
                float m3 = m_*m_*m_;
                float s3 = s_*s_*s_;

                vec3 rgb = vec3(
                     4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
                    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
                    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3
                );

                // sRGB Gamma
                vec3 srgb = mix(
                    12.92 * rgb,
                    1.055 * pow(max(rgb, vec3(0.0)), vec3(1.0/2.4)) - 0.055,
                    step(0.0031308, rgb)
                );
                return clamp(srgb, 0.0, 1.0);
            }

            void main() {
                // Chromatic Aberration Sampling
                float ca = 0.003;
                float r_u = texture(u_fluid, vUv + vec2(ca, 0.0)).r;
                float g_u = texture(u_fluid, vUv).r;
                float b_u = texture(u_fluid, vUv - vec2(ca, 0.0)).r;
                
                vec4 fluid = texture(u_fluid, vUv);
                float energy = (r_u + g_u + b_u) / 3.0; // Smoothed excitation
                float recovery = fluid.g;
                float phase = fluid.b;
                
                // Color Mapping (Harmony Algebra)
                // Base hue drifts slowly. Golden angle (2.4 rad) used for contrast.
                float baseHue = u_time * 0.1 + phase * PI;
                float hue = baseHue + energy * 2.39996; // Shift hue based on energy
                
                // Map energy to Lightness (0.3 to 0.85 to avoid black/white)
                // Deep background is saturated violet/indigo (L=0.3, high C)
                // Peaks are neon cyan/lemon/pink (L=0.85, high C)
                float lightness = mix(0.35, 0.85, energy);
                float chroma = mix(0.20, 0.35, recovery + energy);
                
                vec3 color = oklch2srgb(lightness, chroma, hue);
                
                // Additive Tinted Bloom (No white bloom)
                float bloomIntensity = smoothstep(0.5, 1.0, energy);
                vec3 bloomColor = oklch2srgb(0.7, 0.3, hue + 1.0); // Offset hue for bloom
                color += bloomColor * bloomIntensity * 0.5;

                fragColor = vec4(color, 1.0);
            }
        `;

        // ─── MATERIALS & MESH ────────────────────────────────────────────────
        const simMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_backbuffer: { value: null },
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: simShader
        });

        const renderMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_fluid: { value: null },
                u_time: { value: 0 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: renderShader
        });

        const mesh = new THREE.Mesh(quadGeo, renderMaterial);
        scene.add(mesh);

        // Store state
        canvas.__three = {
            renderer,
            scene,
            camera,
            simMaterial,
            renderMaterial,
            mesh,
            fboA,
            fboB,
            pingPong: true
        };
    }

    // ─── RENDER LOOP ─────────────────────────────────────────────────────────
    const state = canvas.__three;
    const { renderer, scene, camera, simMaterial, renderMaterial, mesh, fboA, fboB } = state;

    // Handle Resize
    if (renderer.getSize(new THREE.Vector2()).x !== grid.width || renderer.getSize(new THREE.Vector2()).y !== grid.height) {
        renderer.setSize(grid.width, grid.height, false);
        fboA.setSize(grid.width, grid.height);
        fboB.setSize(grid.width, grid.height);
        simMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
    }

    // 1. SIMULATION PASS (Ping-Pong)
    const readFBO = state.pingPong ? fboA : fboB;
    const writeFBO = state.pingPong ? fboB : fboA;

    simMaterial.uniforms.u_backbuffer.value = readFBO.texture;
    simMaterial.uniforms.u_time.value = time;
    mesh.material = simMaterial;
    
    renderer.setRenderTarget(writeFBO);
    renderer.render(scene, camera);

    // 2. RENDER PASS (To Screen)
    renderMaterial.uniforms.u_fluid.value = writeFBO.texture;
    renderMaterial.uniforms.u_time.value = time;
    mesh.material = renderMaterial;
    
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    // Swap buffers
    state.pingPong = !state.pingPong;

} catch (e) {
    console.error("Chromatic Underlayer initialization failed:", e);
}