// THE WEIRD CODE GUY
// "Spectral Candy Avalanche Garden"
// A hybrid WFC-Geomantic-Sandpile running on continuous spectral energy,
// leaving complementary OKLab afterimages on a Trinitron CRT.

try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL2 context not available");

        // We require WebGL2 and Float textures for the simulation buffers.
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.setPixelRatio(1.0); // Keep it crisp for arcade cellular look
        
        if (!renderer.extensions.get('EXT_color_buffer_float')) {
            console.warn("EXT_color_buffer_float not supported, simulation might clamp.");
        }

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneGeometry(2, 2);

        // Simulation resolution (cellular grid size)
        const GRID_SIZE = 128;
        
        const rtParams = {
            width: GRID_SIZE,
            height: GRID_SIZE,
            type: THREE.FloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            depthBuffer: false,
            stencilBuffer: false
        };

        const simA = new THREE.WebGLRenderTarget(GRID_SIZE, GRID_SIZE, rtParams);
        const simB = new THREE.WebGLRenderTarget(GRID_SIZE, GRID_SIZE, rtParams);
        const renderTarget = new THREE.WebGLRenderTarget(GRID_SIZE, GRID_SIZE, rtParams);
        const persistA = new THREE.WebGLRenderTarget(GRID_SIZE, GRID_SIZE, rtParams);
        const persistB = new THREE.WebGLRenderTarget(GRID_SIZE, GRID_SIZE, rtParams);

        // 1. SIMULATION SHADER (Abelian Sandpile + Geomantic Routing)
        // R: Energy, G: Geomantic Tile ID (0-15), B: Entropy (unused here), A: Age
        const simMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_state: { value: null },
                u_res: { value: new THREE.Vector2(GRID_SIZE, GRID_SIZE) },
                u_mouse: { value: new THREE.Vector3(0, 0, 0) },
                u_reseed: { value: 1.0 },
                u_time: { value: 0.0 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_state;
                uniform vec2 u_res;
                uniform vec3 u_mouse;
                uniform float u_reseed;
                uniform float u_time;

                float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }

                void main() {
                    vec2 texel = 1.0 / u_res;
                    vec4 own = texture(u_state, vUv);

                    if (u_reseed > 0.5) {
                        // Seed: random geomantic tile, occasional energy bursts
                        float r = rand(vUv + u_time);
                        float tile = floor(r * 16.0);
                        float energy = (rand(vUv + u_time + 1.0) > 0.995) ? floor(rand(vUv)*80.0) : 0.0;
                        fragColor = vec4(energy, tile, 0.0, 0.0);
                        return;
                    }

                    int tile = int(own.g);
                    // Geomantic routing: 4 lines -> 4 ports (N, E, S, W). 1 = Open, 0 = Blocked.
                    int pN = tile & 1;
                    int pE = (tile >> 1) & 1;
                    int pS = (tile >> 2) & 1;
                    int pW = (tile >> 3) & 1;
                    int ports = pN + pE + pS + pW;

                    float energy = own.r;

                    // Mouse painting
                    float dist = length((vUv - u_mouse.xy) * u_res);
                    if (u_mouse.z > 0.5 && dist < 4.0) {
                        energy += 15.0;
                    }

                    float next_energy = energy;

                    // Topple outward only through open ports
                    if (ports > 0 && energy >= float(ports)) {
                        float topples = floor(energy / float(ports));
                        next_energy -= topples * float(ports);
                    }

                    // Inflow from neighbors (if they toppled AND their port pointing to us is open)
                    // North neighbor (y+1) sends to us if its South port is open
                    vec4 nN = texture(u_state, vUv + vec2(0.0, texel.y));
                    int tN = int(nN.g);
                    int pS_of_N = (tN >> 2) & 1;
                    int ports_N = (tN & 1) + ((tN >> 1) & 1) + pS_of_N + ((tN >> 3) & 1);
                    if (ports_N > 0 && nN.r >= float(ports_N) && pS_of_N == 1) {
                        next_energy += floor(nN.r / float(ports_N));
                    }

                    // South neighbor (y-1) sends if its North port is open
                    vec4 nS = texture(u_state, vUv - vec2(0.0, texel.y));
                    int tS = int(nS.g);
                    int pN_of_S = tS & 1;
                    int ports_S = pN_of_S + ((tS >> 1) & 1) + ((tS >> 2) & 1) + ((tS >> 3) & 1);
                    if (ports_S > 0 && nS.r >= float(ports_S) && pN_of_S == 1) {
                        next_energy += floor(nS.r / float(ports_S));
                    }

                    // East neighbor (x+1) sends if its West port is open
                    vec4 nE = texture(u_state, vUv + vec2(texel.x, 0.0));
                    int tE = int(nE.g);
                    int pW_of_E = (tE >> 3) & 1;
                    int ports_E = (tE & 1) + ((tE >> 1) & 1) + ((tE >> 2) & 1) + pW_of_E;
                    if (ports_E > 0 && nE.r >= float(ports_E) && pW_of_E == 1) {
                        next_energy += floor(nE.r / float(ports_E));
                    }

                    // West neighbor (x-1) sends if its East port is open
                    vec4 nW = texture(u_state, vUv - vec2(texel.x, 0.0));
                    int tW = int(nW.g);
                    int pE_of_W = (tW >> 1) & 1;
                    int ports_W = (tW & 1) + pE_of_W + ((tW >> 2) & 1) + ((tW >> 3) & 1);
                    if (ports_W > 0 && nW.r >= float(ports_W) && pE_of_W == 1) {
                        next_energy += floor(nW.r / float(ports_W));
                    }

                    next_energy = min(next_energy, 200.0); // Cap to avoid float explosion
                    float age = own.a + (next_energy > 0.0 ? 0.01 : 0.0);

                    fragColor = vec4(next_energy, own.g, own.b, age);
                }
            `
        });

        // 2. RENDER SHADER (Structural Color + Geomantic Dots)
        const renderMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_sim: { value: null },
                u_res: { value: new THREE.Vector2(GRID_SIZE, GRID_SIZE) },
                u_time: { value: 0.0 },
                u_geomancy: { value: 1.0 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_sim;
                uniform vec2 u_res;
                uniform float u_time;
                uniform float u_geomancy;

                vec3 wavelengthToRGB(float W) {
                    float R = max(0.0, W < 440. ? -(W-440.)/60. : W < 510. ? 0. : W < 580. ? (W-510.)/70. : W < 645. ? 1. : 1.);
                    float G = max(0.0, W < 440. ? 0. : W < 490. ? (W-440.)/50. : W < 580. ? 1. : W < 645. ? -(W-645.)/65. : 0.);
                    float B = max(0.0, W < 490. ? 1. : W < 510. ? -(W-510.)/20. : 0.);
                    return vec3(R,G,B);
                }

                void main() {
                    vec4 state = texture(u_sim, vUv);
                    float energy = state.r;
                    int tile = int(state.g);
                    float age = state.a;

                    vec2 cell_uv = fract(vUv * u_res);

                    // Spectral candy color
                    float wl = 380.0 + mod(energy * 24.0 + age * 10.0, 320.0);
                    vec3 candy = wavelengthToRGB(wl);

                    // Structural Color (Thin Film Interference)
                    float thickness = 250.0 + energy * 30.0;
                    float viewAngle = abs(sin(vUv.x * 12.0 + u_time) * cos(vUv.y * 12.0 - u_time));
                    float pathDiff = 2.0 * 1.56 * thickness * sqrt(1.0 - pow(sin(viewAngle)/1.56, 2.0));
                    vec3 phase = vec3(0.0, 0.33, 0.67);
                    vec3 iridescence = 0.5 + 0.5 * cos(6.28318 * (pathDiff / 550.0 + phase));
                    
                    candy *= iridescence * 2.0;

                    // Geomantic Glyphs
                    float dot_mask = 0.0;
                    if (u_geomancy > 0.5) {
                        int line_idx = int(floor((1.0 - cell_uv.y) * 4.0));
                        int bit = (tile >> line_idx) & 1;
                        float cy = 1.0 - (float(line_idx) + 0.5) / 4.0;
                        float dy = abs(cell_uv.y - cy);

                        if (bit == 1) {
                            float d = length(vec2(cell_uv.x - 0.5, dy * 4.0));
                            dot_mask += smoothstep(0.25, 0.1, d);
                        } else {
                            float d1 = length(vec2(cell_uv.x - 0.3, dy * 4.0));
                            float d2 = length(vec2(cell_uv.x - 0.7, dy * 4.0));
                            dot_mask += smoothstep(0.25, 0.1, d1) + smoothstep(0.25, 0.1, d2);
                        }
                    }

                    vec3 final_rgb = mix(candy, vec3(1.0, 0.9, 0.8), dot_mask * 0.9); // White hot sparkles
                    
                    // Alpha maps to energy presence + structure
                    float active = smoothstep(0.0, 1.0, energy);
                    float alpha = clamp(active + dot_mask * 0.6, 0.0, 1.0);

                    fragColor = vec4(final_rgb, alpha);
                }
            `
        });

        // 3. PERSISTENCE SHADER (OKLab Complementary Afterimages)
        const persistMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_render: { value: null },
                u_persist: { value: null }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_render;
                uniform sampler2D u_persist;

                vec3 srgb_to_linear(vec3 c) {
                    return vec3(
                        c.r <= 0.04045 ? c.r / 12.92 : pow((c.r + 0.055) / 1.055, 2.4),
                        c.g <= 0.04045 ? c.g / 12.92 : pow((c.g + 0.055) / 1.055, 2.4),
                        c.b <= 0.04045 ? c.b / 12.92 : pow((c.b + 0.055) / 1.055, 2.4)
                    );
                }
                vec3 linear_to_srgb(vec3 c) {
                    return vec3(
                        c.r <= 0.0031308 ? c.r * 12.92 : 1.055 * pow(c.r, 1.0/2.4) - 0.055,
                        c.g <= 0.0031308 ? c.g * 12.92 : 1.055 * pow(c.g, 1.0/2.4) - 0.055,
                        c.b <= 0.0031308 ? c.b * 12.92 : 1.055 * pow(c.b, 1.0/2.4) - 0.055
                    );
                }
                vec3 linear_to_oklab(vec3 c) {
                    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
                    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
                    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
                    float l_ = pow(max(l,0.), 1.0/3.0);
                    float m_ = pow(max(m,0.), 1.0/3.0);
                    float s_ = pow(max(s,0.), 1.0/3.0);
                    return vec3(
                        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
                        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
                        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
                    );
                }
                vec3 oklab_to_linear(vec3 c) {
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

                void main() {
                    vec4 cur = texture(u_render, vUv);
                    vec4 prev = texture(u_persist, vUv);

                    vec3 prev_lin = srgb_to_linear(clamp(prev.rgb, 0.0, 1.0));
                    vec3 prev_ok = linear_to_oklab(prev_lin);

                    // Decay lightness, invert chroma (creates complementary ghost!)
                    prev_ok.x *= 0.94; 
                    prev_ok.y *= -0.96; 
                    prev_ok.z *= -0.96;

                    vec3 ghost_lin = oklab_to_linear(prev_ok);
                    vec3 ghost_srgb = linear_to_srgb(clamp(ghost_lin, 0.0, 1.0));
                    float ghost_a = prev.a * 0.95;

                    // Max composite keeps the brightest vibrant trails
                    vec3 out_rgb = max(cur.rgb, ghost_srgb * ghost_a);
                    float out_a = max(cur.a, ghost_a);

                    fragColor = vec4(out_rgb, out_a);
                }
            `
        });

        // 4. COMPOSITE SHADER (Vivid Background + CRT + Optics)
        const compositeMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_persist: { value: null },
                u_time: { value: 0.0 },
                u_res: { value: new THREE.Vector2() },
                u_crt: { value: 1.0 },
                u_palette: { value: 0.0 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_persist;
                uniform vec2 u_res;
                uniform float u_time;
                uniform float u_crt;
                uniform float u_palette;

                vec3 oklab_to_linear(vec3 c) {
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
                vec3 linear_to_srgb(vec3 c) {
                    return vec3(
                        c.r <= 0.0031308 ? c.r * 12.92 : 1.055 * pow(c.r, 1.0/2.4) - 0.055,
                        c.g <= 0.0031308 ? c.g * 12.92 : 1.055 * pow(c.g, 1.0/2.4) - 0.055,
                        c.b <= 0.0031308 ? c.b * 12.92 : 1.055 * pow(c.b, 1.0/2.4) - 0.055
                    );
                }

                void main() {
                    // Barrel distortion
                    vec2 c = vUv - 0.5;
                    float r2 = dot(c, c);
                    vec2 uv = c * (1.0 + 0.15 * r2) + 0.5;

                    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
                        return;
                    }

                    // Saturated OKLab Background (Never black/white!)
                    float t = u_time * 0.2 + u_palette * 2.39996; // Golden angle shifts
                    float L = 0.35 + 0.1 * sin(uv.x * 3.0 + t);
                    float a = 0.18 * cos(uv.y * 4.0 - t);
                    float b_ = -0.15 + 0.12 * sin(uv.x * uv.y * 5.0 + t);
                    vec3 bg = linear_to_srgb(clamp(oklab_to_linear(vec3(L, a, b_)), 0.0, 1.0));

                    // Chromatic aberration on the simulation layer
                    vec2 dir = uv - 0.5;
                    float shift = 0.004;
                    vec4 pR = texture(u_persist, uv + dir * shift);
                    vec4 pG = texture(u_persist, uv);
                    vec4 pB = texture(u_persist, uv - dir * shift);

                    vec3 persist_rgb = vec3(pR.r, pG.g, pB.b);
                    float persist_a = clamp((pR.a + pG.a + pB.a) / 3.0, 0.0, 1.0);

                    // Composite sim over vivid background
                    vec3 final_color = mix(bg, persist_rgb, persist_a);

                    // CRT Trinitron Aperture Grille
                    if (u_crt > 0.5) {
                        float col = mod(gl_FragCoord.x, 3.0);
                        vec3 mask = vec3(
                            smoothstep(1.0, 0.0, abs(col - 0.5)),
                            smoothstep(1.0, 0.0, abs(col - 1.5)),
                            smoothstep(1.0, 0.0, abs(col - 2.5))
                        );
                        final_color *= mix(vec3(1.0), mask, 0.35);

                        // Scanlines
                        float scan = 0.5 + 0.5 * sin(uv.y * u_res.y * 3.14159);
                        final_color *= 1.0 - 0.2 * (1.0 - scan);

                        // Rolling refresh bar
                        float barPos = fract(u_time * 0.3);
                        float bar = exp(-abs(uv.y - barPos) * 120.0);
                        final_color *= 1.0 + 0.1 * bar;
                    }

                    // Colored Vignette (deep ultraviolet, not black)
                    float vig = smoothstep(1.2, 0.4, length(c * vec2(1.1, 1.0)));
                    vec3 vig_color = vec3(0.15, 0.0, 0.25);
                    final_color = mix(vig_color, final_color, vig);

                    fragColor = vec4(final_color, 1.0);
                }
            `
        });

        const mesh = new THREE.Mesh(geometry, simMaterial);
        scene.add(mesh);

        // Interaction State
        const mouseState = { x: 0.5, y: 0.5, z: 0 };
        let reseedTrigger = 1.0;
        let palettePhase = 0.0;
        let geomancyToggle = 1.0;
        let crtToggle = 1.0;

        const updateMouse = (e) => {
            const rect = canvas.getBoundingClientRect();
            mouseState.x = (e.clientX - rect.left) / rect.width;
            mouseState.y = 1.0 - (e.clientY - rect.top) / rect.height;
        };

        const onPointerDown = (e) => { updateMouse(e); mouseState.z = 1.0; };
        const onPointerMove = (e) => { if(mouseState.z > 0) updateMouse(e); };
        const onPointerUp = () => { mouseState.z = 0.0; };
        
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointerleave', onPointerUp);

        const onKeyDown = (e) => {
            if (e.key === ' ') reseedTrigger = 1.0;
            if (e.key.toLowerCase() === 'c') {
                palettePhase += 1.0;
                const regimes = ["Orbit trap shimmer", "Ultraviolet shame bleed", "Recursive signal cannibalism", "Bicontinuous labyrinth", "Metastable false minima"];
                console.log(`[THE-LISTS] Regime Shift: ${regimes[Math.floor(palettePhase) % regimes.length]}`);
            }
            if (e.key.toLowerCase() === 'g') geomancyToggle = 1.0 - geomancyToggle;
            if (e.key.toLowerCase() === 'p') crtToggle = 1.0 - crtToggle;
        };
        window.addEventListener('keydown', onKeyDown);

        canvas.__three = { 
            renderer, scene, camera, mesh, 
            simA, simB, renderTarget, persistA, persistB,
            simMaterial, renderMaterial, persistMaterial, compositeMaterial,
            mouseState,
            cleanup: () => {
                canvas.removeEventListener('pointerdown', onPointerDown);
                canvas.removeEventListener('pointermove', onPointerMove);
                canvas.removeEventListener('pointerup', onPointerUp);
                canvas.removeEventListener('pointerleave', onPointerUp);
                window.removeEventListener('keydown', onKeyDown);
            }
        };
    }

    const { 
        renderer, scene, camera, mesh, 
        simA, simB, renderTarget, persistA, persistB,
        simMaterial, renderMaterial, persistMaterial, compositeMaterial,
        mouseState 
    } = canvas.__three;

    // Reseed every 18 seconds automatically
    if (time % 18.0 < 0.02) simMaterial.uniforms.u_reseed.value = 1.0;

    // 1. SIM PASS
    simMaterial.uniforms.u_state.value = simA.texture;
    simMaterial.uniforms.u_mouse.value.set(mouseState.x, mouseState.y, mouseState.z);
    simMaterial.uniforms.u_time.value = time;
    mesh.material = simMaterial;
    renderer.setRenderTarget(simB);
    renderer.render(scene, camera);
    
    // Swap Sim
    let tempSim = simA;
    canvas.__three.simA = simB;
    canvas.__three.simB = tempSim;
    simMaterial.uniforms.u_reseed.value = 0.0; // Reset trigger

    // 2. RENDER PASS (Geomancy + Optics)
    renderMaterial.uniforms.u_sim.value = canvas.__three.simA.texture;
    renderMaterial.uniforms.u_time.value = time;
    renderMaterial.uniforms.u_geomancy.value = window.geomancyToggle ?? 1.0;
    mesh.material = renderMaterial;
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);

    // 3. PERSISTENCE PASS (Afterimages)
    persistMaterial.uniforms.u_render.value = renderTarget.texture;
    persistMaterial.uniforms.u_persist.value = persistA.texture;
    mesh.material = persistMaterial;
    renderer.setRenderTarget(persistB);
    renderer.render(scene, camera);

    // Swap Persist
    let tempPersist = persistA;
    canvas.__three.persistA = persistB;
    canvas.__three.persistB = tempPersist;

    // 4. COMPOSITE PASS (Background + CRT to screen)
    renderer.setSize(grid.width, grid.height, false);
    compositeMaterial.uniforms.u_persist.value = canvas.__three.persistA.texture;
    compositeMaterial.uniforms.u_time.value = time;
    compositeMaterial.uniforms.u_res.value.set(grid.width, grid.height);
    compositeMaterial.uniforms.u_crt.value = window.crtToggle ?? 1.0;
    compositeMaterial.uniforms.u_palette.value = window.palettePhase ?? 0.0;
    mesh.material = compositeMaterial;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

} catch (e) {
    console.error("Feral System Failure:", e);
}