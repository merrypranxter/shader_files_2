try {
    if (!ctx) throw new Error("WebGL2 context not available");

    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        renderer.setPixelRatio(dpr);

        const rtOptions = {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            depthBuffer: false,
            stencilBuffer: false
        };

        const rtColorOptions = {
            ...rtOptions,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter
        };

        const w = Math.floor(grid.width * dpr);
        const h = Math.floor(grid.height * dpr);

        const state = {
            simA: new THREE.WebGLRenderTarget(w, h, rtOptions),
            simB: new THREE.WebGLRenderTarget(w, h, rtOptions),
            colorA: new THREE.WebGLRenderTarget(w, h, rtColorOptions),
            colorB: new THREE.WebGLRenderTarget(w, h, rtColorOptions),
            camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
            scene: new THREE.Scene(),
            geometry: new THREE.PlaneGeometry(2, 2),
            keys: { space: 0, c: 0, g: 0, p: 1 },
            paletteMode: 0.0,
            geomancyOnly: 0.0,
            crtIntensity: 1.0,
            reseed: 0.0,
            mouseClick: 0.0
        };

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') state.reseed = 1.0;
            if (e.code === 'KeyC') state.paletteMode = (state.paletteMode + 1.0) % 5.0;
            if (e.code === 'KeyG') state.geomancyOnly = state.geomancyOnly > 0.5 ? 0.0 : 1.0;
            if (e.code === 'KeyP') state.crtIntensity = state.crtIntensity > 0.5 ? 0.0 : 1.0;
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') state.reseed = 0.0;
        });

        const vs = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        state.simMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_sim: { value: null },
                u_resolution: { value: new THREE.Vector2(w, h) },
                u_time: { value: 0 },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
                u_click: { value: 0 },
                u_reseed: { value: 0 }
            },
            vertexShader: vs,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_sim;
                uniform vec2 u_resolution;
                uniform float u_time;
                uniform vec2 u_mouse;
                uniform float u_click;
                uniform float u_reseed;

                float hash12(vec2 p) {
                    vec3 p3  = fract(vec3(p.xyx) * 0.1031);
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.x + p3.y) * p3.z);
                }

                void main() {
                    vec2 texel = 1.0 / u_resolution;
                    vec4 data = texture(u_sim, vUv);
                    
                    float grains = data.r;
                    float n = texture(u_sim, vUv + vec2(0.0, texel.y)).r;
                    float s = texture(u_sim, vUv - vec2(0.0, texel.y)).r;
                    float e = texture(u_sim, vUv + vec2(texel.x, 0.0)).r;
                    float w = texture(u_sim, vUv - vec2(texel.x, 0.0)).r;

                    float topples = floor(grains / 4.0);
                    float new_grains = grains - 4.0 * topples + floor(n/4.0) + floor(s/4.0) + floor(e/4.0) + floor(w/4.0);

                    vec2 id = floor(vUv * 64.0);
                    
                    // Continuous avalanche seeding
                    if (hash12(id + floor(u_time * 2.0)) < 0.0005) {
                        new_grains += 1.0;
                    }

                    // Mouse interaction
                    if (u_click > 0.5 && length(vUv - u_mouse) < 0.03) {
                        new_grains += 2.0;
                    }

                    // Reseed WFC/Sandpile
                    if (u_reseed > 0.5) {
                        new_grains = hash12(vUv * 100.0) > 0.9 ? 4.0 : 0.0;
                    }

                    fragColor = vec4(new_grains, data.g, data.b, data.a);
                }
            `
        });

        state.colorMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_sim: { value: null },
                u_prevColor: { value: null },
                u_resolution: { value: new THREE.Vector2(w, h) },
                u_time: { value: 0 },
                u_paletteMode: { value: 0 },
                u_geomancyOnly: { value: 0 }
            },
            vertexShader: vs,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_sim;
                uniform sampler2D u_prevColor;
                uniform vec2 u_resolution;
                uniform float u_time;
                uniform float u_paletteMode;
                uniform float u_geomancyOnly;

                float hash12(vec2 p) {
                    vec3 p3  = fract(vec3(p.xyx) * 0.1031);
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.x + p3.y) * p3.z);
                }

                vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
                    return a + b * cos(6.28318 * (c * t + d));
                }

                vec3 thinFilm(float d) {
                    float n = 1.45;
                    float path = 2.0 * n * d;
                    float r = pow(sin(3.14159 * path / 630.0), 2.0);
                    float g = pow(sin(3.14159 * path / 530.0), 2.0);
                    float b = pow(sin(3.14159 * path / 460.0), 2.0);
                    return vec3(r, g, b);
                }

                void main() {
                    float grains = texture(u_sim, vUv).r;

                    // Deep saturated background, avoiding black/white
                    vec3 bgA = palette(vUv.y + u_time * 0.1, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.3, 0.2, 0.8));
                    vec3 bgB = palette(vUv.x - u_time * 0.1, vec3(0.6), vec3(0.4), vec3(1.0), vec3(0.8, 0.1, 0.5));
                    vec3 bg = mix(bgA, bgB, 0.5 + 0.5 * sin(u_time * 0.3 + length(vUv - 0.5) * 4.0));

                    float gridRes = 64.0;
                    vec2 gv = fract(vUv * gridRes);
                    vec2 id = floor(vUv * gridRes);

                    float h = hash12(id);
                    float shape = 0.0;

                    float cycle = mod(u_time * 0.5 - (id.x * 0.02 + id.y * 0.02), 20.0);
                    
                    if (cycle < 2.0) {
                        // Entropy heatmap (shimmering noise before collapse)
                        shape = hash12(gv + u_time) * 0.8;
                    } else {
                        // Collapsed WFC Geometry
                        if (u_geomancyOnly > 0.5 || h < 0.33) {
                            // Geomantic figures
                            float row = floor(gv.y * 4.0);
                            float hrow = hash12(id + row * 12.3);
                            float cy = (row + 0.5) / 4.0;
                            if (hrow < 0.5) {
                                shape = smoothstep(0.15, 0.05, length(gv - vec2(0.5, cy)));
                            } else {
                                shape = smoothstep(0.15, 0.05, length(gv - vec2(0.3, cy))) + 
                                        smoothstep(0.15, 0.05, length(gv - vec2(0.7, cy)));
                            }
                        } else if (h < 0.66) {
                            // Truchet arcs
                            float d1 = length(gv - vec2(0.0, 0.0));
                            float d2 = length(gv - vec2(1.0, 1.0));
                            shape = max(smoothstep(0.15, 0.05, abs(d1 - 0.5)), 
                                        smoothstep(0.15, 0.05, abs(d2 - 0.5)));
                        } else {
                            // Circuit traces
                            if (hash12(id + 1.0) < 0.5) {
                                shape = smoothstep(0.15, 0.05, abs(gv.x - 0.5));
                            } else {
                                shape = smoothstep(0.15, 0.05, abs(gv.y - 0.5));
                            }
                            shape += smoothstep(0.2, 0.05, length(gv - vec2(0.5, 0.5)));
                        }
                    }

                    // Structural Color from sandpile grains
                    float thickness = 200.0 + grains * 150.0 + u_paletteMode * 120.0;
                    vec3 structCol = thinFilm(thickness);
                    
                    // Boost saturation
                    float maxC = max(structCol.r, max(structCol.g, structCol.b));
                    if(maxC > 0.0) structCol /= maxC;

                    vec3 curCol = mix(bg, structCol, shape);

                    // Avalanche highlights
                    if (grains >= 4.0) {
                        curCol += vec3(0.9, 0.9, 1.0) * shape; 
                    }

                    // Temporal Afterimage Logic
                    vec4 prev = texture(u_prevColor, vUv);
                    vec3 prevCol = prev.rgb;
                    float fatigue = prev.a;

                    float intensity = dot(curCol, vec3(0.299, 0.587, 0.114));
                    fatigue = mix(fatigue, intensity, 0.05);

                    // True opponent complement
                    vec3 complement = vec3(1.0) - curCol; 
                    vec3 displayCol = mix(curCol, complement, fatigue * 0.85);

                    vec3 finalCol = mix(displayCol, prevCol, 0.85);

                    fragColor = vec4(finalCol, fatigue);
                }
            `
        });

        state.postMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_color: { value: null },
                u_resolution: { value: new THREE.Vector2(w, h) },
                u_crtIntensity: { value: 1 }
            },
            vertexShader: vs,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_color;
                uniform vec2 u_resolution;
                uniform float u_crtIntensity;

                void main() {
                    vec2 uv = vUv;
                    
                    // Barrel distortion
                    vec2 crt_uv = uv - 0.5;
                    float r2 = dot(crt_uv, crt_uv);
                    crt_uv *= 1.0 + 0.1 * r2 * u_crtIntensity;
                    crt_uv += 0.5;

                    // Deep saturated vignette boundary
                    if (crt_uv.x < 0.0 || crt_uv.x > 1.0 || crt_uv.y < 0.0 || crt_uv.y > 1.0) {
                        fragColor = vec4(0.8, 0.0, 0.5, 1.0); // Hot pink/magenta border
                        return;
                    }

                    // Chromatic aberration
                    float ca = 0.004 * u_crtIntensity;
                    float r = texture(u_color, crt_uv + vec2(ca, 0.0)).r;
                    float g = texture(u_color, crt_uv).g;
                    float b = texture(u_color, crt_uv - vec2(ca, 0.0)).b;
                    vec3 col = vec3(r, g, b);

                    // Bloom approximation
                    vec2 texel = 1.0 / u_resolution;
                    vec3 bloom = vec3(0.0);
                    for(int i=-2; i<=2; i++){
                        for(int j=-2; j<=2; j++){
                            vec3 smp = texture(u_color, crt_uv + vec2(i,j)*texel*2.0).rgb;
                            bloom += max(smp - 0.6, 0.0);
                        }
                    }
                    col += (bloom / 25.0) * 1.2;

                    // CRT Scanlines & Phosphor
                    float scanline = sin(crt_uv.y * u_resolution.y * 1.5) * 0.08 * u_crtIntensity;
                    float phosphor = sin(crt_uv.x * u_resolution.x * 1.5) * 0.06 * u_crtIntensity;
                    col -= scanline + phosphor;

                    // Saturated Vignette
                    float vig = smoothstep(1.0, 0.2, length(crt_uv - 0.5));
                    vec3 vigColor = vec3(0.4, 0.0, 0.6); // Deep violet
                    col = mix(vigColor, col, vig);

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        state.mesh = new THREE.Mesh(state.geometry, state.simMat);
        state.scene.add(state.mesh);

        canvas.__three = state;
        canvas.__three.renderer = renderer;
    }

    const st = canvas.__three;
    const { renderer, simA, simB, colorA, colorB, camera, scene, simMat, colorMat, postMat } = st;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(grid.width * dpr);
    const h = Math.floor(grid.height * dpr);

    if (simA.width !== w || simA.height !== h) {
        simA.setSize(w, h);
        simB.setSize(w, h);
        colorA.setSize(w, h);
        colorB.setSize(w, h);
        simMat.uniforms.u_resolution.value.set(w, h);
        colorMat.uniforms.u_resolution.value.set(w, h);
        postMat.uniforms.u_resolution.value.set(w, h);
    }

    // Handle inputs
    st.mouseClick = mouse.isPressed ? 1.0 : 0.0;
    
    // Multi-pass sandpile simulation for fast avalanches
    st.mesh.material = simMat;
    simMat.uniforms.u_time.value = time;
    simMat.uniforms.u_mouse.value.set(mouse.x, mouse.y);
    simMat.uniforms.u_click.value = st.mouseClick;
    simMat.uniforms.u_reseed.value = st.reseed;

    let currentSim = simA;
    let nextSim = simB;
    for (let i = 0; i < 4; i++) {
        simMat.uniforms.u_sim.value = currentSim.texture;
        renderer.setRenderTarget(nextSim);
        renderer.render(scene, camera);
        let temp = currentSim;
        currentSim = nextSim;
        nextSim = temp;
    }

    // Color and afterimage pass
    st.mesh.material = colorMat;
    colorMat.uniforms.u_time.value = time;
    colorMat.uniforms.u_sim.value = currentSim.texture;
    colorMat.uniforms.u_prevColor.value = colorA.texture;
    colorMat.uniforms.u_paletteMode.value = st.paletteMode;
    colorMat.uniforms.u_geomancyOnly.value = st.geomancyOnly;

    renderer.setRenderTarget(colorB);
    renderer.render(scene, camera);

    // Swap color buffers
    let tempColor = colorA;
    st.colorA = colorB;
    st.colorB = tempColor;

    // Post processing to screen
    st.mesh.material = postMat;
    postMat.uniforms.u_color.value = st.colorA.texture;
    postMat.uniforms.u_crtIntensity.value = st.crtIntensity;

    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, grid.width, grid.height);
    renderer.render(scene, camera);

} catch (e) {
    console.error("Spectral Candy Avalanche Garden Initialization Failed:", e);
}