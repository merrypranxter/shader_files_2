function spectralCandyAvalancheGarden(ctx, grid, time, repos, input, mouse, canvas, THREE) {
    const W = grid.width;
    const H = grid.height;
    
    // -------------------------------------------------------------------------
    // 1. INITIALIZATION & DEFENSIVE SETUP
    // -------------------------------------------------------------------------
    if (!canvas.__three) {
        try {
            if (!ctx) throw new Error("WebGL2 context not provided.");
            
            const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
            renderer.autoClear = false;
            renderer.setPixelRatio(1);
            
            const scene = new THREE.Scene();
            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
            scene.add(quad);

            // FBO Setup - FloatType crucial for exact integer sandpile arithmetic
            const createRT = () => new THREE.WebGLRenderTarget(W, H, {
                type: THREE.FloatType,
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                wrapS: THREE.RepeatWrapping,
                wrapT: THREE.RepeatWrapping,
                format: THREE.RGBAFormat
            });

            const rtSimA = createRT();
            const rtSimB = createRT();
            const rtPersistA = createRT();
            const rtPersistB = createRT();
            const rtRender = createRT();

            // WFC Data Texture (64x64)
            const wfcSize = 64;
            const wfcData = new Float32Array(wfcSize * wfcSize * 4);
            // Initialize with high entropy
            for (let i = 0; i < wfcData.length; i += 4) {
                wfcData[i+2] = 1.0; // Entropy
            }
            const wfcTex = new THREE.DataTexture(wfcData, wfcSize, wfcSize, THREE.RGBAFormat, THREE.FloatType);
            wfcTex.minFilter = THREE.NearestFilter;
            wfcTex.magFilter = THREE.NearestFilter;
            wfcTex.needsUpdate = true;

            // -----------------------------------------------------------------
            // 2. SHADER DEFINITIONS
            // -----------------------------------------------------------------
            const commonVert = `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `;

            // Sim Shader: Abelian Sandpile (4-way topple) + Interaction
            const simFrag = `
                in vec2 vUv;
                uniform sampler2D u_sim;
                uniform vec2 u_res;
                uniform vec2 u_mouse;
                uniform bool u_mouse_down;
                uniform float u_time;
                out vec4 fragColor;

                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                }

                void main() {
                    vec2 ts = 1.0 / u_res;
                    float own = texture(u_sim, vUv).r;
                    
                    float topples = floor(own / 4.0);
                    float n = floor(texture(u_sim, vUv + vec2(0.0, ts.y)).r / 4.0);
                    float s = floor(texture(u_sim, vUv + vec2(0.0, -ts.y)).r / 4.0);
                    float e = floor(texture(u_sim, vUv + vec2(ts.x, 0.0)).r / 4.0);
                    float w = floor(texture(u_sim, vUv + vec2(-ts.x, 0.0)).r / 4.0);
                    
                    float next = own - 4.0 * topples + n + s + e + w;
                    
                    // Mouse injection
                    if (u_mouse_down && distance(vUv, u_mouse) < 0.03) {
                        next += 2.0;
                    }

                    // Random cosmic drops (Continuous avalanche trigger)
                    if (hash(vUv + u_time) < 0.0005) {
                        next += 1.0;
                    }

                    fragColor = vec4(next, 0.0, 0.0, 1.0);
                }
            `;

            // Render Shader: WFC Tiles + Structural Color + Spectral Sandpile
            const renderFrag = `
                in vec2 vUv;
                uniform sampler2D u_sim;
                uniform sampler2D u_wfc;
                uniform float u_time;
                uniform vec2 u_res;
                out vec4 fragColor;

                // Color Systems: OKLab Interpolation
                vec3 oklab_to_srgb(vec3 c) {
                    float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
                    float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
                    float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
                    float l = l_*l_*l_; float m = m_*m_*m_; float s = s_*s_*s_;
                    vec3 rgb = vec3(
                         4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                    );
                    return clamp(rgb, 0.0, 1.0);
                }

                // Spectral Color: Wavelength to RGB
                vec3 spectral(float w) {
                    float r = exp(-pow((w - 600.0) / 40.0, 2.0)) + 0.5 * exp(-pow((w - 400.0) / 20.0, 2.0));
                    float g = exp(-pow((w - 530.0) / 40.0, 2.0));
                    float b = exp(-pow((w - 460.0) / 40.0, 2.0));
                    return clamp(vec3(r, g, b), 0.0, 1.0);
                }

                // Structural Color: Thin-film interference
                vec3 thinFilm(float d) {
                    float n = 1.45;
                    float path = 2.0 * n * d;
                    float r = pow(sin(3.14159 * path / 630.0), 2.0);
                    float g = pow(sin(3.14159 * path / 530.0), 2.0);
                    float b = pow(sin(3.14159 * path / 460.0), 2.0);
                    return vec3(r, g, b);
                }

                void main() {
                    // WFC Tile Data
                    vec2 gridUv = vUv * 64.0;
                    ivec2 cellIdx = ivec2(gridUv);
                    vec4 wfc = texelFetch(u_wfc, cellIdx, 0);
                    float tile = wfc.r;
                    float rot = wfc.g;
                    float entropy = wfc.b;
                    int geom = int(wfc.a);

                    // Deep saturated base gradient (No black/white voids)
                    vec3 colA = vec3(0.6, 0.2, -0.2); // OKLab Magenta
                    vec3 colB = vec3(0.7, -0.1, -0.2); // OKLab Cyan
                    vec3 colC = vec3(0.8, 0.1, 0.2); // OKLab Orange
                    vec3 baseLab = mix(mix(colA, colB, vUv.x), colC, sin(u_time * 0.2 + vUv.y * 3.0) * 0.5 + 0.5);
                    vec3 baseCol = oklab_to_srgb(baseLab);

                    // Truchet Geometry
                    vec2 cellUv = fract(gridUv) - 0.5;
                    float a = rot * 1.570796;
                    float c = cos(a), s = sin(a);
                    vec2 st = mat2(c, -s, s, c) * cellUv;

                    float arc1 = abs(length(st - vec2(0.5, 0.5)) - 0.5);
                    float arc2 = abs(length(st - vec2(-0.5, -0.5)) - 0.5);
                    float line = min(arc1, arc2);
                    float mask = smoothstep(0.15, 0.05, line);

                    // Geomantic Figures (4 lines of dots)
                    float gDots = 0.0;
                    if (abs(st.x) < 0.3 && abs(st.y) < 0.4) {
                        for(int i=0; i<4; i++) {
                            float yPos = 0.25 - float(i) * 0.16;
                            int bit = (geom >> (3-i)) & 1;
                            if (abs(st.y - yPos) < 0.04) {
                                if (bit == 0) { // 1 dot
                                    if (abs(st.x) < 0.06) gDots = 1.0;
                                } else { // 2 dots
                                    if (abs(abs(st.x) - 0.12) < 0.06) gDots = 1.0;
                                }
                            }
                        }
                    }

                    // Sandpile Data
                    float grains = texture(u_sim, vUv).r;
                    
                    // Optical Layer (Thin film + spectral)
                    vec3 filmCol = thinFilm(300.0 + grains * 120.0 + u_time * 50.0);
                    vec3 grainCol = spectral(420.0 + min(grains, 4.0) * 60.0);

                    // Entropy Heatmap
                    vec3 heatCol = oklab_to_srgb(vec3(0.5, 0.2, 0.1)) * entropy;

                    // Composite
                    vec3 finalCol = baseCol;
                    finalCol = mix(finalCol, heatCol, entropy * 0.7);
                    
                    // Add WFC Tiles & Geomancy where collapsed
                    float collapsed = 1.0 - entropy;
                    finalCol += mask * filmCol * collapsed;
                    finalCol += gDots * vec3(1.0, 0.9, 0.2) * collapsed;
                    
                    // Add Sandpile Avalanches
                    float activeGrains = smoothstep(0.5, 4.0, grains);
                    finalCol += grainCol * activeGrains * 1.5;

                    fragColor = vec4(finalCol, 1.0);
                }
            `;

            // Persistence Shader: Afterimage Painter Logic
            const persistFrag = `
                in vec2 vUv;
                uniform sampler2D u_render;
                uniform sampler2D u_prev;
                out vec4 fragColor;
                void main() {
                    vec3 cur = texture(u_render, vUv).rgb;
                    vec3 prev = texture(u_prev, vUv).rgb;
                    // Exponential decay for soft persistence
                    fragColor = vec4(max(cur, prev * 0.94), 1.0);
                }
            `;

            // Post Shader: CRT Phosphor, Aberration, Ghosting, Bloom
            const postFrag = `
                in vec2 vUv;
                uniform sampler2D u_render;
                uniform sampler2D u_persist;
                uniform vec2 u_res;
                uniform float u_time;
                out vec4 fragColor;

                // Barrel Distortion
                vec2 barrel(vec2 uv) {
                    vec2 cc = uv - 0.5;
                    float r2 = dot(cc, cc);
                    return uv + cc * (0.1 * r2 + 0.05 * r2 * r2);
                }

                void main() {
                    vec2 uv = barrel(vUv);
                    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
                        return;
                    }

                    // Chromatic Aberration from Render
                    vec2 dir = (uv - 0.5) * 0.015;
                    float r = texture(u_render, uv + dir).r;
                    float g = texture(u_render, uv).g;
                    float b = texture(u_render, uv - dir).b;
                    vec3 baseCol = vec3(r, g, b);

                    // Afterimage Ghosting (Complementary inversion)
                    vec3 persist = texture(u_persist, uv).rgb;
                    // Magenta leaves Cyan, etc.
                    vec3 ghost = (vec3(1.0) - persist) * length(persist) * 0.4;
                    
                    vec3 col = baseCol + ghost;

                    // Bloom (bright pass)
                    vec3 bloom = pow(max(col - 0.7, vec3(0.0)), vec3(2.0)) * 1.5;
                    col += bloom;

                    // CRT Phosphor Mask (Slot Mask style)
                    float slot = mod(gl_FragCoord.x + mod(floor(gl_FragCoord.y / 4.0), 2.0) * 1.5, 3.0);
                    vec3 mask = vec3(
                        smoothstep(1.0, 0.0, abs(slot - 0.5)),
                        smoothstep(1.0, 0.0, abs(slot - 1.5)),
                        smoothstep(1.0, 0.0, abs(slot - 2.5))
                    );
                    mask = mix(vec3(1.0), mask, 0.35); // Keep it glossy, not dark
                    
                    // Scanlines
                    float scanline = sin(uv.y * u_res.y * 3.14159) * 0.05 + 0.95;

                    // Soft Vignette (Colored, not black)
                    float vig = 1.0 - length(uv - 0.5) * 0.5;
                    vec3 vigCol = mix(vec3(0.3, 0.0, 0.4), vec3(1.0), vig);

                    col *= mask * scanline * vigCol;

                    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
                }
            `;

            const createMaterial = (frag) => new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                vertexShader: commonVert,
                fragmentShader: frag,
                uniforms: {
                    u_sim: { value: null },
                    u_wfc: { value: null },
                    u_render: { value: null },
                    u_prev: { value: null },
                    u_persist: { value: null },
                    u_res: { value: new THREE.Vector2(W, H) },
                    u_mouse: { value: new THREE.Vector2(0, 0) },
                    u_mouse_down: { value: false },
                    u_time: { value: 0 }
                },
                depthWrite: false,
                depthTest: false
            });

            const matSim = createMaterial(simFrag);
            const matRender = createMaterial(renderFrag);
            const matPersist = createMaterial(persistFrag);
            const matPost = createMaterial(postFrag);

            canvas.__three = {
                renderer, scene, camera, quad,
                rtSimA, rtSimB, rtPersistA, rtPersistB, rtRender,
                matSim, matRender, matPersist, matPost,
                wfcData, wfcTex, wfcSize
            };
        } catch (e) {
            console.error("Initialization Failed:", e);
            return;
        }
    }

    const sys = canvas.__three;
    if (!sys || !sys.renderer) return;

    // -------------------------------------------------------------------------
    // 3. WFC & GEOMANCY CPU SIMULATION
    // -------------------------------------------------------------------------
    // Pseudo-WFC Collapse: Gradually resolve the field
    let collapsedThisFrame = 0;
    for (let i = 0; i < 150; i++) {
        let x = Math.floor(Math.random() * sys.wfcSize);
        let y = Math.floor(Math.random() * sys.wfcSize);
        let idx = (y * sys.wfcSize + x) * 4;
        
        if (sys.wfcData[idx + 2] > 0.0) { // If entropy > 0
            sys.wfcData[idx] = Math.floor(Math.random() * 4);     // Tile type
            sys.wfcData[idx + 1] = Math.floor(Math.random() * 4); // Rotation
            sys.wfcData[idx + 2] -= 0.05; // Fade entropy
            if (sys.wfcData[idx + 2] <= 0.0) {
                sys.wfcData[idx + 2] = 0.0;
                sys.wfcData[idx + 3] = Math.floor(Math.random() * 16); // Geomantic figure
            }
            collapsedThisFrame++;
        }
    }

    // Periodic Reseed (Every ~15 seconds)
    if (time % 15.0 < 0.05) {
        for (let i = 0; i < sys.wfcData.length; i += 4) {
            sys.wfcData[i + 2] = 1.0; // Reset entropy to max
        }
    }
    
    if (collapsedThisFrame > 0) sys.wfcTex.needsUpdate = true;

    // -------------------------------------------------------------------------
    // 4. UPDATE UNIFORMS
    // -------------------------------------------------------------------------
    const mx = mouse.x / W;
    const my = 1.0 - (mouse.y / H); // flip Y for GL

    sys.matSim.uniforms.u_time.value = time;
    sys.matSim.uniforms.u_mouse.value.set(mx, my);
    sys.matSim.uniforms.u_mouse_down.value = mouse.isPressed;
    sys.matSim.uniforms.u_sim.value = sys.rtSimA.texture;

    sys.matRender.uniforms.u_time.value = time;
    sys.matRender.uniforms.u_sim.value = sys.rtSimB.texture;
    sys.matRender.uniforms.u_wfc.value = sys.wfcTex;

    sys.matPersist.uniforms.u_render.value = sys.rtRender.texture;
    sys.matPersist.uniforms.u_prev.value = sys.rtPersistA.texture;

    sys.matPost.uniforms.u_time.value = time;
    sys.matPost.uniforms.u_render.value = sys.rtRender.texture;
    sys.matPost.uniforms.u_persist.value = sys.rtPersistB.texture;

    // Ensure sizes are correct
    sys.renderer.setSize(W, H, false);
    sys.matSim.uniforms.u_res.value.set(W, H);
    sys.matRender.uniforms.u_res.value.set(W, H);
    sys.matPost.uniforms.u_res.value.set(W, H);

    // -------------------------------------------------------------------------
    // 5. MULTI-PASS RENDER LOOP
    // -------------------------------------------------------------------------
    
    // Pass 1: Sandpile Simulation
    sys.quad.material = sys.matSim;
    sys.renderer.setRenderTarget(sys.rtSimB);
    sys.renderer.render(sys.scene, sys.camera);

    // Pass 2: Render Candy Garden
    sys.quad.material = sys.matRender;
    sys.renderer.setRenderTarget(sys.rtRender);
    sys.renderer.render(sys.scene, sys.camera);

    // Pass 3: Afterimage Persistence
    sys.quad.material = sys.matPersist;
    sys.renderer.setRenderTarget(sys.rtPersistB);
    sys.renderer.render(sys.scene, sys.camera);

    // Pass 4: CRT Post-Processing to Screen
    sys.quad.material = sys.matPost;
    sys.renderer.setRenderTarget(null);
    sys.renderer.render(sys.scene, sys.camera);

    // Ping-Pong Swaps
    let tempSim = sys.rtSimA;
    sys.rtSimA = sys.rtSimB;
    sys.rtSimB = tempSim;

    let tempPersist = sys.rtPersistA;
    sys.rtPersistA = sys.rtPersistB;
    sys.rtPersistB = tempPersist;
}

return spectralCandyAvalancheGarden;