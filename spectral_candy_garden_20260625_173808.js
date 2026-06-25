try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    // Clean up previous event listeners if they exist to prevent memory leaks during HMR
    if (canvas.__appState && canvas.__appState.cleanup) {
        canvas.__appState.cleanup();
    }

    // --- STATE MANAGEMENT ---
    const state = {
        reseed: 1.0,
        paletteRegime: 0.0,
        geomanticInt: 0.0,
        crtInt: 1.0,
        clickPulse: 0.0,
        wasPressed: false,
        simW: 128,
        simH: 128
    };

    const keydown = (e) => {
        if (e.code === 'Space') state.reseed = 1.0;
        if (e.code === 'KeyC') state.paletteRegime = (state.paletteRegime + 1.0) % 5.0;
        if (e.code === 'KeyG') state.geomanticInt = state.geomanticInt > 0.5 ? 0.0 : 1.0;
        if (e.code === 'KeyP') state.crtInt = state.crtInt > 0.5 ? 0.0 : 1.0;
    };
    window.addEventListener('keydown', keydown);

    canvas.__appState = {
        state,
        cleanup: () => window.removeEventListener('keydown', keydown)
    };

    // --- THREE.JS INITIALIZATION ---
    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;
        
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneGeometry(2, 2);

        // --- GLSL SHADER CHUNKS ---
        const oklabFns = `
            vec3 linear_srgb_to_oklab(vec3 c) {
                float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
                float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
                float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
                float l_ = pow(max(l, 0.0), 1.0/3.0);
                float m_ = pow(max(m, 0.0), 1.0/3.0);
                float s_ = pow(max(s, 0.0), 1.0/3.0);
                return vec3(
                    0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_,
                    1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_,
                    0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_
                );
            }
            vec3 oklab_to_linear_srgb(vec3 c) {
                float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
                float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
                float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
                float l = l_*l_*l_;
                float m = m_*m_*m_;
                float s = s_*s_*s_;
                return vec3(
                     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                );
            }
            vec3 oklabMix(vec3 c1, vec3 c2, float t) {
                return oklab_to_linear_srgb(mix(linear_srgb_to_oklab(c1), linear_srgb_to_oklab(c2), t));
            }
        `;

        const spectralFns = `
            vec3 wavelengthToRGB(float W) {
                vec3 c = vec3(0.0);
                if (W >= 380.0 && W < 440.0) c = vec3(-(W-440.0)/(440.0-380.0), 0.0, 1.0);
                else if (W >= 440.0 && W < 490.0) c = vec3(0.0, (W-440.0)/(490.0-440.0), 1.0);
                else if (W >= 490.0 && W < 510.0) c = vec3(0.0, 1.0, -(W-510.0)/(510.0-490.0));
                else if (W >= 510.0 && W < 580.0) c = vec3((W-510.0)/(580.0-510.0), 1.0, 0.0);
                else if (W >= 580.0 && W < 645.0) c = vec3(1.0, -(W-645.0)/(645.0-580.0), 0.0);
                else if (W >= 645.0 && W <= 700.0) c = vec3(1.0, 0.0, 0.0);
                float f = 1.0;
                if (W >= 380.0 && W < 420.0) f = 0.3 + 0.7*(W-380.0)/(420.0-380.0);
                else if (W >= 645.0 && W <= 700.0) f = 0.3 + 0.7*(700.0-W)/(700.0-645.0);
                return pow(c * f, vec3(0.8));
            }
            vec3 thinFilm(float thickness, float cosTheta) {
                float n = 1.5; // IOR
                float pathDiff = 2.0 * n * thickness * cosTheta;
                vec3 phase = vec3(0.0, 0.33, 0.67);
                return 0.5 + 0.5 * cos(6.28318 * (pathDiff / vec3(650.0, 510.0, 450.0) + phase));
            }
        `;

        // --- SIMULATION PASS (Abelian Sandpile + WFC State + Afterimage Bleach) ---
        const matSim = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_prevState: { value: null },
                u_resolution: { value: new THREE.Vector2() },
                u_time: { value: 0 },
                u_mouse: { value: new THREE.Vector2() },
                u_mouseDown: { value: 0 },
                u_click: { value: 0 },
                u_reseed: { value: 0 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                precision highp float;
                uniform sampler2D u_prevState;
                uniform vec2 u_resolution;
                uniform float u_time;
                uniform vec2 u_mouse;
                uniform float u_mouseDown;
                uniform float u_click;
                uniform float u_reseed;
                
                in vec2 vUv;
                out vec4 fragColor;

                float hash12(vec2 p) {
                    vec3 p3  = fract(vec3(p.xyx) * .1031);
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.x + p3.y) * p3.z);
                }

                vec4 get(vec2 p) {
                    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return vec4(0.0);
                    return texture(u_prevState, p);
                }

                void main() {
                    vec2 texel = 1.0 / u_resolution;
                    vec4 me = get(vUv);
                    vec4 n  = get(vUv + vec2(0.0, texel.y));
                    vec4 s  = get(vUv - vec2(0.0, texel.y));
                    vec4 e  = get(vUv + vec2(texel.x, 0.0));
                    vec4 w  = get(vUv - vec2(texel.x, 0.0));

                    // R: Grains (Sandpile)
                    float grains = me.r;
                    float outGrains = floor(grains / 4.0) * 4.0;
                    float inGrains = floor(n.r / 4.0) + floor(s.r / 4.0) + floor(e.r / 4.0) + floor(w.r / 4.0);
                    float nextGrains = grains - outGrains + inGrains;

                    // Interaction
                    vec2 aspect = vec2(1.0, u_resolution.y / u_resolution.x);
                    float mDist = length((vUv - u_mouse) * aspect);
                    
                    if (u_mouseDown > 0.5 && mDist < 0.05) nextGrains += 2.0;
                    if (u_click > 0.5 && mDist < 0.1) nextGrains += 50.0;
                    
                    // Continuous slow feed to keep the avalanche alive
                    if (hash12(vUv + u_time) < 0.002) nextGrains += 1.0;

                    // G: WFC / Geomantic Shape ID
                    float shape = me.g;
                    if (outGrains > 0.0) shape = hash12(vUv + u_time * 10.0);
                    if (u_reseed > 0.5) {
                        shape = hash12(vUv * 123.456);
                        nextGrains = floor(hash12(vUv * 789.0) * 5.0);
                    }

                    // B: Afterimage Bleach (Adaptation)
                    float energy = min(nextGrains / 4.0, 1.0);
                    float bleach = mix(me.b, energy, 0.08);

                    // A: Phase / Heat
                    float phase = mod(me.a + 0.01 * nextGrains, 1.0);

                    fragColor = vec4(nextGrains, shape, bleach, phase);
                }
            `
        });

        // --- GRID RENDER PASS (WFC + Spectral Coloring) ---
        const matGrid = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_simState: { value: null },
                u_resolution: { value: new THREE.Vector2() },
                u_simRes: { value: new THREE.Vector2() },
                u_time: { value: 0 },
                u_paletteRegime: { value: 0 },
                u_geomanticInt: { value: 0 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                precision highp float;
                uniform sampler2D u_simState;
                uniform vec2 u_resolution;
                uniform vec2 u_simRes;
                uniform float u_time;
                uniform float u_paletteRegime;
                uniform float u_geomanticInt;
                
                in vec2 vUv;
                out vec4 fragColor;

                ${oklabFns}
                ${spectralFns}

                float drawGeomantic(vec2 local, float id) {
                    float row = floor((1.0 - (local.y * 0.5 + 0.5)) * 4.0);
                    if (row < 0.0 || row > 3.0) return 0.0;
                    float bit = mod(floor(id * 255.0 / pow(2.0, row)), 2.0);
                    vec2 q = vec2(local.x, fract((local.y * 0.5 + 0.5) * 4.0) * 2.0 - 1.0);
                    if (bit < 0.5) {
                        return smoothstep(0.4, 0.2, length(q));
                    } else {
                        return smoothstep(0.4, 0.2, length(q - vec2(0.5, 0.0))) +
                               smoothstep(0.4, 0.2, length(q + vec2(0.5, 0.0)));
                    }
                }

                float drawTruchet(vec2 local, float id) {
                    vec2 uv = local;
                    if (fract(id * 13.5) > 0.5) uv.x = -uv.x;
                    float d1 = length(uv - vec2(1.0, 1.0)) - 0.5;
                    float d2 = length(uv - vec2(-1.0, -1.0)) - 0.5;
                    return smoothstep(0.2, 0.1, abs(d1)) + smoothstep(0.2, 0.1, abs(d2));
                }

                void main() {
                    vec2 gridUv = vUv * u_simRes;
                    vec2 cellId = floor(gridUv);
                    vec2 localUv = fract(gridUv) * 2.0 - 1.0;

                    vec4 state = texture(u_simState, (cellId + 0.5) / u_simRes);
                    float grains = state.r;
                    float shapeId = state.g;
                    float bleach = state.b;
                    float phase = state.a;

                    // Deep saturated background (No black/white)
                    vec3 bg1, bg2;
                    if (u_paletteRegime < 1.0) {
                        bg1 = vec3(0.4, 0.0, 0.8); // Deep Violet
                        bg2 = vec3(0.0, 0.6, 0.8); // Deep Cyan
                    } else if (u_paletteRegime < 2.0) {
                        bg1 = vec3(0.8, 0.0, 0.4); // Hot Pink
                        bg2 = vec3(0.8, 0.4, 0.0); // Orange
                    } else {
                        bg1 = vec3(0.0, 0.8, 0.4); // Acid Green
                        bg2 = vec3(0.0, 0.2, 0.8); // Ultramarine
                    }
                    float bgMix = sin(vUv.x * 3.0 + u_time) * cos(vUv.y * 3.0 - u_time) * 0.5 + 0.5;
                    vec3 baseColor = oklabMix(bg1, bg2, bgMix);

                    // Shape drawing
                    float isGeomantic = step(0.5 + u_geomanticInt * 0.3, fract(shapeId * 7.123));
                    float shapeMask = isGeomantic > 0.5 ? drawGeomantic(localUv, shapeId) : drawTruchet(localUv, shapeId);

                    // Cell Coloring (Spectral + Thin Film)
                    float lambda = 380.0 + mod(grains * 35.0 + u_time * 40.0, 320.0);
                    vec3 cellColor = wavelengthToRGB(lambda) * 1.5;
                    vec3 film = thinFilm(grains * 150.0 + phase * 200.0, 0.8);
                    cellColor = mix(cellColor, film, 0.4);

                    // Combine
                    vec3 finalColor = mix(baseColor, cellColor, shapeMask * min(grains, 1.0));

                    // Afterimage (Opponent color shift)
                    vec3 oppLab = linear_srgb_to_oklab(finalColor);
                    oppLab.y = -oppLab.y; // invert a (green <-> red)
                    oppLab.z = -oppLab.z; // invert b (blue <-> yellow)
                    vec3 oppColor = oklab_to_linear_srgb(oppLab);
                    
                    finalColor = mix(finalColor, oppColor, bleach * 0.85);

                    fragColor = vec4(finalColor, 1.0);
                }
            `
        });

        // --- POST PROCESS PASS (CRT + Bloom + Aberration) ---
        const matPost = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_grid: { value: null },
                u_resolution: { value: new THREE.Vector2() },
                u_time: { value: 0 },
                u_crtInt: { value: 1.0 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                precision highp float;
                uniform sampler2D u_grid;
                uniform vec2 u_resolution;
                uniform float u_time;
                uniform float u_crtInt;

                in vec2 vUv;
                out vec4 fragColor;

                vec2 barrel(vec2 uv, float k) {
                    vec2 c = uv - 0.5;
                    float r2 = dot(c, c);
                    return uv + c * (k * r2 + k * r2 * r2);
                }

                void main() {
                    vec2 uv = vUv;
                    
                    // CRT Distortion & Chromatic Aberration
                    float dist = u_crtInt * 0.08;
                    vec2 uvR = barrel(uv, dist);
                    vec2 uvG = barrel(uv, dist * 1.2);
                    vec2 uvB = barrel(uv, dist * 1.4);

                    // Base Color
                    float r = texture(u_grid, uvR).r;
                    float g = texture(u_grid, uvG).g;
                    float b = texture(u_grid, uvB).b;
                    vec3 col = vec3(r, g, b);

                    // 9-Tap Bloom
                    vec3 bloom = vec3(0.0);
                    vec2 texel = 1.0 / u_resolution;
                    for(float x = -1.0; x <= 1.0; x++) {
                        for(float y = -1.0; y <= 1.0; y++) {
                            vec3 s = texture(u_grid, uvG + vec2(x, y) * texel * 3.0).rgb;
                            bloom += max(s - 0.6, 0.0) * 0.15;
                        }
                    }
                    col += bloom;

                    // Scanlines
                    float scanline = sin(uv.y * u_resolution.y * 1.5) * 0.08 * u_crtInt;
                    col -= scanline;

                    // Saturated Vignette (Deep Purple instead of Black)
                    vec3 vigColor = vec3(0.15, 0.0, 0.3);
                    float vigMask = smoothstep(1.3, 0.4, length(uv - 0.5));
                    col = mix(vigColor, col, vigMask);

                    // Gentle Tone Mapping to prevent white blowouts
                    col = col / (1.0 + col * 0.2);

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        const sceneSim = new THREE.Scene();
        sceneSim.add(new THREE.Mesh(geometry, matSim));

        const sceneGrid = new THREE.Scene();
        sceneGrid.add(new THREE.Mesh(geometry, matGrid));

        const scenePost = new THREE.Scene();
        scenePost.add(new THREE.Mesh(geometry, matPost));

        // Render Targets
        const rtOpts = {
            type: THREE.HalfFloatType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            depthBuffer: false,
            stencilBuffer: false
        };

        const rtGridOpts = {
            ...rtOpts,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter
        };

        canvas.__three = {
            renderer, camera,
            sceneSim, matSim,
            sceneGrid, matGrid,
            scenePost, matPost,
            rtOpts, rtGridOpts,
            rtA: null, rtB: null, rtC: null
        };
    }

    const t3 = canvas.__three;
    const { renderer, camera, sceneSim, matSim, sceneGrid, matGrid, scenePost, matPost } = t3;

    // --- RESIZE HANDLING ---
    renderer.setSize(grid.width, grid.height, false);
    
    // Fixed simulation width for distinct blocky cellular automata logic, dynamic height based on aspect
    const simW = state.simW;
    const simH = Math.floor(simW * (grid.height / grid.width));
    
    if (!t3.rtA || t3.rtA.width !== simW || t3.rtA.height !== simH) {
        if (t3.rtA) t3.rtA.dispose();
        if (t3.rtB) t3.rtB.dispose();
        t3.rtA = new THREE.WebGLRenderTarget(simW, simH, t3.rtOpts);
        t3.rtB = new THREE.WebGLRenderTarget(simW, simH, t3.rtOpts);
        state.reseed = 1.0; // Force reseed on resize to fill new areas
    }

    if (!t3.rtC || t3.rtC.width !== grid.width || t3.rtC.height !== grid.height) {
        if (t3.rtC) t3.rtC.dispose();
        t3.rtC = new THREE.WebGLRenderTarget(grid.width, grid.height, t3.rtGridOpts);
    }

    // --- INTERACTION HANDLING ---
    if (mouse.isPressed && !state.wasPressed) {
        state.clickPulse = 1.0;
    }
    state.wasPressed = mouse.isPressed;

    // --- SIMULATION PASS ---
    matSim.uniforms.u_prevState.value = t3.rtA.texture;
    matSim.uniforms.u_resolution.value.set(simW, simH);
    matSim.uniforms.u_time.value = time;
    matSim.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
    matSim.uniforms.u_mouseDown.value = mouse.isPressed ? 1.0 : 0.0;
    matSim.uniforms.u_click.value = state.clickPulse;
    matSim.uniforms.u_reseed.value = state.reseed;
    
    renderer.setRenderTarget(t3.rtB);
    renderer.render(sceneSim, camera);

    // Swap Sim targets
    const temp = t3.rtA;
    t3.rtA = t3.rtB;
    t3.rtB = temp;

    // --- GRID RENDER PASS ---
    matGrid.uniforms.u_simState.value = t3.rtA.texture;
    matGrid.uniforms.u_resolution.value.set(grid.width, grid.height);
    matGrid.uniforms.u_simRes.value.set(simW, simH);
    matGrid.uniforms.u_time.value = time;
    matGrid.uniforms.u_paletteRegime.value = state.paletteRegime;
    matGrid.uniforms.u_geomanticInt.value = state.geomanticInt;

    renderer.setRenderTarget(t3.rtC);
    renderer.render(sceneGrid, camera);

    // --- POST PROCESS PASS ---
    matPost.uniforms.u_grid.value = t3.rtC.texture;
    matPost.uniforms.u_resolution.value.set(grid.width, grid.height);
    matPost.uniforms.u_time.value = time;
    matPost.uniforms.u_crtInt.value = state.crtInt;

    renderer.setRenderTarget(null);
    renderer.render(scenePost, camera);

    // --- CLEANUP FRAME STATE ---
    state.reseed = 0.0;
    if (state.clickPulse > 0.0) state.clickPulse -= 0.5;

} catch (e) {
    console.error("Feral Generation Failed:", e);
    throw e;
}