try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    // Initialize Three.js environment if it doesn't exist or canvas changed
    if (!canvas.__three || canvas.__three.canvas !== canvas) {
        // Cleanup previous instances if they exist
        if (canvas.__three) {
            canvas.__three.renderer.dispose();
            canvas.__three.fboA.dispose();
            canvas.__three.fboB.dispose();
        }

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;
        
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        // Ping-pong FBO setup for Datamosh / Temporal Echo
        const fboOpts = {
            type: THREE.HalfFloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: false,
            stencilBuffer: false
        };
        const fboA = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOpts);
        const fboB = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOpts);

        // --- SHADER 1: THE PHOSPHOR REEF ENGINE (Feedback, Geometry, Datamosh, Cuttlefish) ---
        const bufferVert = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        const bufferFrag = `
            precision highp float;
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform float u_time;
            uniform sampler2D u_prev;
            uniform vec2 u_res;

            // COLOR SYSTEMS: OKLab to sRGB conversion for perceptual palettes
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
                return pow(clamp(rgb, 0.0, 1.0), vec3(1.0/2.2));
            }

            vec3 oklch_to_srgb(float L, float C, float h) {
                return oklab_to_srgb(vec3(L, C * cos(h), C * sin(h)));
            }

            mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

            // CRYSTALLINE REPO: Hexagonal Lattice SDF & Birefringence Simulation
            float hexDist(vec2 p) {
                p = abs(p);
                float d = dot(p, normalize(vec2(1.0, 1.7320508)));
                return max(d, p.x);
            }

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }

            void main() {
                vec2 p = vUv * 2.0 - 1.0;
                p.x *= u_res.x / u_res.y;

                // Crystalline Reactor Core Fold
                vec2 cp = p;
                for(int i=0; i<4; i++) {
                    cp = abs(cp) - vec2(0.25, 0.1);
                    cp *= rot(u_time * 0.15 + float(i) * 0.6);
                }
                float crystalDist = hexDist(cp);
                float reactorMask = smoothstep(0.65, 0.6, hexDist(p * rot(u_time * 0.2)));

                // DEMOSCENE OLDSKOOL: Tunneling / Plasma Flow
                float r = length(p);
                float a = atan(p.y, p.x);
                vec2 tunnelUV = vec2(a/6.28318, 0.4/(r + 0.1) + u_time * 0.7);

                // CUTTLEFISH CHROMATICS: Expanding/Contracting Pigment Cells
                vec2 cell = fract(tunnelUV * 16.0) - 0.5;
                vec2 id = floor(tunnelUV * 16.0);
                float neuralPulse = sin(id.x * 15.2 + id.y * 41.6 + u_time * 5.0) * 0.5 + 0.5;
                float chromatophore = smoothstep(0.45 * neuralPulse, 0.35 * neuralPulse, length(cell));

                // Generating Base Palette via OKLCh (High Energy, No Mud)
                float hue = r * 3.0 - u_time * 2.0 + id.x * 0.5;
                vec3 col = oklch_to_srgb(0.65 + 0.2 * sin(u_time), 0.25, hue);

                // Chromatophore Pigment Injection (Complementary Colors)
                vec3 chromCol = oklch_to_srgb(0.8, 0.3, hue + 3.14); 
                col = mix(col, chromCol, chromatophore);

                // Central Reactor Override
                if (reactorMask > 0.0) {
                    float coreHue = u_time * 4.0 + crystalDist * 12.0;
                    vec3 coreCol = oklch_to_srgb(0.8 - crystalDist * 0.6, 0.35, coreHue);
                    
                    // Structural Damage inside reactor
                    float glitchLine = step(0.92, sin(p.y * 120.0 + u_time * 15.0));
                    coreCol = mix(coreCol, vec3(1.0, 0.9, 0.0), glitchLine * 0.6); // Acid yellow flashes
                    
                    col = mix(col, coreCol, reactorMask);
                }

                // GLITCHCORE / EARLY INTERNET: UI Debris & Popups
                vec2 uiUV = vUv;
                vec2 winPos = vec2(0.2 + 0.1 * sin(u_time * 0.5), 0.8 + 0.1 * cos(u_time * 1.3));
                vec2 win = abs(uiUV - winPos);
                if (win.x < 0.18 && win.y < 0.1) {
                    if (win.x > 0.17 || win.y > 0.09) {
                        col = oklch_to_srgb(0.9, 0.2, u_time); // Bright border
                    } else {
                        float lines = step(0.5, fract(uiUV.y * 60.0 - u_time * 3.0));
                        col = oklch_to_srgb(0.4, 0.3, u_time * 6.0) * lines;
                    }
                }

                // DATAMOSH & DAMAGE AESTHETICS: Vector Flow & Temporal Smear
                vec2 flow = vec2(
                    sin(vUv.y * 12.0 + u_time) + cos(vUv.x * 8.0 - u_time),
                    cos(vUv.x * 14.0 - u_time) + sin(vUv.y * 10.0 + u_time)
                ) * 0.005;

                // Macroblock Compression Chew
                vec2 block = floor(vUv * 20.0) / 20.0;
                float glitch = step(0.96, hash(block + floor(u_time * 6.0))); 
                flow += glitch * vec2(0.1 * sin(u_time * 50.0), 0.0); // Sharp horizontal tears

                // Sample previous frame (Temporal Echo)
                vec3 prev = texture(u_prev, vUv - flow).rgb;

                // Feedback Blend: Reactor pushes new info, background holds motion echo
                float feedbackWeight = mix(0.93, 0.5, reactorMask);
                feedbackWeight -= glitch * 0.5; // Glitch violently breaks the feedback loop
                
                col = mix(col, prev, clamp(feedbackWeight, 0.0, 0.99));

                fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
            }
        `;

        // --- SHADER 2: THE SCREEN (CRT, Flares, CA, Halftone, Color Safety) ---
        const screenVert = bufferVert; // Reuse standard vertex

        const screenFrag = `
            precision highp float;
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform sampler2D u_buffer;
            uniform vec2 u_res;
            uniform float u_time;

            void main() {
                vec2 uv = vUv;

                // CRT PHOSPHOR FX: Barrel Distortion
                vec2 dir = uv - 0.5;
                float dist = length(dir);
                vec2 crtUv = uv + dir * dist * dist * 0.18;

                // Out of bounds (Tube Vignette)
                if(crtUv.x < 0.0 || crtUv.x > 1.0 || crtUv.y < 0.0 || crtUv.y > 1.0) {
                    fragColor = vec4(0.1, 0.0, 0.2, 1.0); // Chromatic dark bounds
                    return;
                }

                // CHROMATIC ABERRATION: Radial RGB Splay
                float ca = 0.025 * dist;
                vec3 col;
                col.r = texture(u_buffer, crtUv + dir * ca).r;
                col.g = texture(u_buffer, crtUv).g;
                col.b = texture(u_buffer, crtUv - dir * ca).b;

                // ANAMORPHIC LENS FLARES: Horizontal Spectral Streaks
                vec3 flare = vec3(0.0);
                float wSum = 0.0;
                for(float i = -1.0; i <= 1.0; i += 0.05) {
                    if(abs(i) < 0.01) continue;
                    vec2 sampUv = crtUv + vec2(i * 0.4, 0.0);
                    if(sampUv.x >= 0.0 && sampUv.x <= 1.0) {
                        vec3 s = texture(u_buffer, sampUv).rgb;
                        float luma = dot(s, vec3(0.299, 0.587, 0.114));
                        float w = exp(-abs(i) * 4.0);
                        // Trigger flares only on bright hotspots
                        flare += s * smoothstep(0.7, 1.0, luma) * w;
                        wSum += w;
                    }
                }
                flare /= (wSum + 0.001);
                col += flare * vec3(0.3, 0.8, 1.0) * 1.8; // Cyan/Laser Blue flare tint

                // HALFTONE MOSAIC: Screen-Tone Quantization
                vec2 grid = fract(crtUv * u_res / 4.0);
                float luma = dot(col, vec3(0.299, 0.587, 0.114));
                float ht = smoothstep(0.3, 0.7, length(grid - 0.5) + luma * 0.9);
                
                // Apply halftone selectively in structural bands (Early Internet Layouts)
                float band = step(0.75, sin(crtUv.y * 25.0 + u_time));
                col = mix(col, col * ht * 1.6, band * 0.5);

                // CRT PHOSPHOR FX: Scanlines & RGB Triad Mask
                float scanline = sin(crtUv.y * u_res.y * 1.5) * 0.12 + 0.88;
                float mask = mod(gl_FragCoord.x, 3.0);
                vec3 phosphor = vec3(
                    mask < 1.0 ? 1.0 : 0.65,
                    (mask >= 1.0 && mask < 2.0) ? 1.0 : 0.65,
                    mask >= 2.0 ? 1.0 : 0.65
                );
                col *= scanline * phosphor;

                // COLOR SAFETY: Absolute No Black / No White Rule
                // Darks become Indigo/Plum, Whites become Warm Chartreuse/Peach
                vec3 chromaticDark = vec3(0.12, 0.0, 0.25); 
                vec3 chromaticBright = vec3(1.0, 0.96, 0.85); 
                
                col = max(col, chromaticDark);
                col = min(col, chromaticBright);

                // Final Tube Vignette
                col *= smoothstep(1.1, 0.35, dist);

                fragColor = vec4(col, 1.0);
            }
        `;

        const matBuffer = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_prev: { value: null },
                u_res: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            vertexShader: bufferVert,
            fragmentShader: bufferFrag,
            depthWrite: false,
            depthTest: false
        });

        const matScreen = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_buffer: { value: null },
                u_res: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            vertexShader: screenVert,
            fragmentShader: screenFrag,
            depthWrite: false,
            depthTest: false
        });

        const plane = new THREE.PlaneGeometry(2, 2);
        
        const sceneBuffer = new THREE.Scene();
        sceneBuffer.add(new THREE.Mesh(plane, matBuffer));

        const sceneScreen = new THREE.Scene();
        sceneScreen.add(new THREE.Mesh(plane, matScreen));

        canvas.__three = {
            canvas, renderer, camera,
            fboA, fboB,
            sceneBuffer, sceneScreen,
            matBuffer, matScreen
        };
    }

    const state = canvas.__three;
    
    // Handle resizing
    if (state.fboA.width !== grid.width || state.fboA.height !== grid.height) {
        state.fboA.setSize(grid.width, grid.height);
        state.fboB.setSize(grid.width, grid.height);
        state.renderer.setSize(grid.width, grid.height, false);
        state.matBuffer.uniforms.u_res.value.set(grid.width, grid.height);
        state.matScreen.uniforms.u_res.value.set(grid.width, grid.height);
    }

    // Ping-Pong Swap
    const temp = state.fboA;
    state.fboA = state.fboB;
    state.fboB = temp;

    // PASS 1: The Engine (Datamosh, Feedback, Cuttlefish, Crystalline) -> FBO B
    state.matBuffer.uniforms.u_time.value = time;
    state.matBuffer.uniforms.u_prev.value = state.fboA.texture;
    state.renderer.setRenderTarget(state.fboB);
    state.renderer.render(state.sceneBuffer, state.camera);

    // PASS 2: The Screen (CRT, Flares, Halftone, Color Safety) -> Canvas
    state.matScreen.uniforms.u_time.value = time;
    state.matScreen.uniforms.u_buffer.value = state.fboB.texture;
    state.renderer.setRenderTarget(null);
    state.renderer.render(state.sceneScreen, state.camera);

} catch (err) {
    console.error("Phosphor Signal Reef Engine Initialization Failed:", err);
}