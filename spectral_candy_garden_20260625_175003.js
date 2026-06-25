if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;

        const sceneCA = new THREE.Scene();
        const sceneDisplay = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const w = grid.width;
        const h = grid.height;

        const rtOptions = {
            type: THREE.HalfFloatType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            format: THREE.RGBAFormat,
            depthBuffer: false,
            stencilBuffer: false
        };

        const rtA = new THREE.WebGLRenderTarget(w, h, rtOptions);
        const rtB = new THREE.WebGLRenderTarget(w, h, rtOptions);

        const matCA = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_state: { value: null },
                u_res: { value: new THREE.Vector2(w, h) },
                u_time: { value: 0 },
                u_mouse: { value: new THREE.Vector4() },
                u_reseed: { value: 1.0 }
            },
            vertexShader: `
                in vec2 position;
                void main() {
                    gl_Position = vec4(position, 0.0, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform sampler2D u_state;
                uniform vec2 u_res;
                uniform float u_time;
                uniform vec4 u_mouse;
                uniform float u_reseed;

                out vec4 fragColor;

                float rand(vec2 n) { 
                    return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); 
                }

                void main() {
                    vec2 uv = gl_FragCoord.xy / u_res;
                    vec2 px = 1.0 / u_res;

                    vec4 c = texture(u_state, uv);
                    vec4 n = texture(u_state, uv + vec2(0.0, px.y));
                    vec4 s = texture(u_state, uv - vec2(0.0, px.y));
                    vec4 e = texture(u_state, uv + vec2(px.x, 0.0));
                    vec4 w = texture(u_state, uv - vec2(px.x, 0.0));

                    float grains = c.r;

                    // Continuous sandpile
                    float threshold = 3.8;
                    float outflow = max(0.0, grains - threshold);
                    grains -= outflow;

                    grains += max(0.0, n.r - threshold) * 0.25;
                    grains += max(0.0, s.r - threshold) * 0.25;
                    grains += max(0.0, e.r - threshold) * 0.25;
                    grains += max(0.0, w.r - threshold) * 0.25;

                    // Moving sources
                    vec2 src1 = vec2(0.5 + 0.4*cos(u_time*0.7), 0.5 + 0.4*sin(u_time*1.1));
                    vec2 src2 = vec2(0.5 + 0.4*sin(u_time*0.5), 0.5 + 0.4*cos(u_time*0.9));
                    if (length(uv - src1) < 0.04) grains += 0.3;
                    if (length(uv - src2) < 0.04) grains += 0.3;

                    // Mouse input
                    if (u_mouse.z > 0.5 && length(uv - u_mouse.xy) < 0.06) {
                        grains += 1.5;
                    }

                    // Dissipate at edges
                    if (uv.x < px.x*2.0 || uv.x > 1.0-px.x*2.0 || uv.y < px.y*2.0 || uv.y > 1.0-px.y*2.0) {
                        grains *= 0.8;
                    }

                    // Tile type (WFC-ish mutations)
                    float type = c.g;
                    if (outflow > 0.1 && rand(uv + u_time) > 0.98) {
                        type = rand(uv * u_time);
                    }

                    // Wavelength / Phase
                    float phase = c.b + outflow * 0.03 + 0.002; 
                    phase = fract(phase);

                    // Afterimage memory
                    float memory = mix(c.a, clamp(grains * 0.4, 0.0, 1.0), 0.03);

                    if (u_reseed > 0.5 || u_time < 0.1) {
                        grains = rand(uv * 2.0) * 4.0;
                        type = rand(uv * 3.0);
                        phase = rand(uv * 4.0);
                        memory = 0.0;
                    }

                    fragColor = vec4(grains, type, phase, memory);
                }
            `
        });

        const matDisplay = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_state: { value: null },
                u_res: { value: new THREE.Vector2(w, h) },
                u_time: { value: 0 },
                u_geomancy: { value: 1.0 },
                u_crt: { value: 1.0 },
                u_palette: { value: 0.0 }
            },
            vertexShader: `
                in vec2 position;
                void main() {
                    gl_Position = vec4(position, 0.0, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform sampler2D u_state;
                uniform vec2 u_res;
                uniform float u_time;
                uniform float u_geomancy;
                uniform float u_crt;
                uniform float u_palette;

                out vec4 fragColor;

                vec3 oklab_to_srgb(vec3 c) {
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

                vec3 spectralColor(float w) {
                    float r=0., g=0., b=0.;
                    if(w<440.) { r=-(w-440.)/60.; b=1.; }
                    else if(w<490.) { g=(w-440.)/50.; b=1.; }
                    else if(w<510.) { g=1.; b=-(w-510.)/20.; }
                    else if(w<580.) { r=(w-510.)/70.; g=1.; }
                    else if(w<645.) { r=1.; g=-(w-645.)/65.; }
                    else { r=1.; }
                    float f = w<420. ? 0.3+0.7*(w-380.)/40. : (w>645. ? 0.3+0.7*(700.-w)/55. : 1.0);
                    return pow(vec3(r,g,b)*f, vec3(0.8));
                }

                vec3 thinFilm(float thickness, vec3 baseColor) {
                    vec3 phase = vec3(0.0, 0.33, 0.67);
                    float pathDiff = 3.0 * thickness; 
                    vec3 interference = 0.5 + 0.5 * cos(6.28318 * (pathDiff / vec3(650.0, 550.0, 450.0) + phase));
                    return baseColor * interference * 2.0;
                }

                float getShape(vec2 cellUv, float type) {
                    float shape = 0.0;
                    if (u_geomancy > 0.5 && type > 0.5) {
                        int fig = int(type * 100.0) % 16;
                        for(int i=0; i<4; i++) {
                            int bit = (fig >> i) & 1;
                            float y = 0.85 - float(i)*0.23;
                            if(bit == 1) {
                                shape += smoothstep(0.12, 0.04, length(cellUv - vec2(0.5, y)));
                            } else {
                                shape += smoothstep(0.12, 0.04, length(cellUv - vec2(0.3, y)));
                                shape += smoothstep(0.12, 0.04, length(cellUv - vec2(0.7, y)));
                            }
                        }
                    } else {
                        vec2 guv = cellUv - 0.5;
                        if (fract(type * 7.0) > 0.5) guv.x = -guv.x;
                        float d1 = length(guv - vec2(0.5)) - 0.5;
                        float d2 = length(guv + vec2(0.5)) - 0.5;
                        shape = smoothstep(0.15, 0.05, abs(d1)) + smoothstep(0.15, 0.05, abs(d2));
                    }
                    return clamp(shape, 0.0, 1.0);
                }

                vec3 renderScene(vec2 uv) {
                    vec4 state = texture(u_state, uv);
                    float grains = state.r;
                    float type = state.g;
                    float phase = state.b;
                    float memory = state.a;

                    vec2 cellUv = fract(uv * 18.0);
                    float shape = getShape(cellUv, type);

                    // Dynamic, saturated background (no black/white)
                    float t = u_time * 0.2;
                    vec3 bgOklab = vec3(
                        0.65 + 0.05 * sin(t * 1.3 + uv.x * 2.0), 
                        0.18 * cos(t * 0.9 + uv.y * 3.0), 
                        0.18 * sin(t * 1.1 - uv.x * 3.0)  
                    );
                    vec3 bg = oklab_to_srgb(bgOklab);

                    // Wavelength mapped color
                    float nm = 380.0 + fract(phase + u_palette * 0.2) * 320.0;
                    vec3 specColor = spectralColor(nm);

                    // Iridescent thin film on the cells
                    float thickness = 300.0 + grains * 120.0;
                    vec3 cellColor = thinFilm(thickness, specColor);

                    float glow = clamp(grains * 0.35, 0.0, 1.0);
                    vec3 fg = mix(bg, cellColor * 2.5, shape * glow);

                    // Complementary afterimage ghost
                    vec3 compOklab = vec3(0.7, -bgOklab.y, -bgOklab.z);
                    vec3 ghost = oklab_to_srgb(compOklab);
                    fg = mix(fg, ghost * 1.8, memory * 0.45);

                    return fg;
                }

                void main() {
                    vec2 uv = gl_FragCoord.xy / u_res;
                    
                    // Barrel distortion
                    vec2 q = uv * 2.0 - 1.0;
                    float r2 = dot(q, q);
                    vec2 buv = uv;
                    if (u_crt > 0.5) {
                        buv = uv + (uv - 0.5) * (r2 * 0.08);
                    }

                    // Chromatic aberration / Convergence
                    float disp = 0.004 * u_crt * r2;
                    float r = renderScene(buv + vec2(disp, 0.0)).r;
                    float g = renderScene(buv).g;
                    float b = renderScene(buv - vec2(disp, 0.0)).b;
                    
                    vec3 col = vec3(r, g, b);

                    // CRT Phosphor
                    if (u_crt > 0.5) {
                        float scan = 0.9 + 0.15 * sin(buv.y * u_res.y * 3.1415);
                        float triad = 0.9 + 0.15 * sin(buv.x * u_res.x * 3.1415);
                        col *= scan * triad * 1.15; 
                    }

                    // Deep colored vignette
                    vec3 vigColor = oklab_to_srgb(vec3(0.35, 0.15, -0.15));
                    col = mix(col, vigColor, smoothstep(0.5, 1.5, r2));

                    // Soft clip to preserve saturation
                    float maxCh = max(max(col.r, col.g), col.b);
                    if (maxCh > 1.0) {
                        col = col / maxCh * (1.0 - exp(-maxCh * 1.5));
                    }

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        const geo = new THREE.PlaneGeometry(2, 2);
        sceneCA.add(new THREE.Mesh(geo, matCA));
        sceneDisplay.add(new THREE.Mesh(geo, matDisplay));

        canvas.__three = { renderer, camera, sceneCA, sceneDisplay, rtA, rtB, matCA, matDisplay };
        canvas.__appState = { reseed: 1.0, geomancy: 1.0, crt: 1.0, palette: 0.0 };

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') canvas.__appState.reseed = 1.0;
            if (e.code === 'KeyC') canvas.__appState.palette = (canvas.__appState.palette + 1.0) % 5.0;
            if (e.code === 'KeyG') canvas.__appState.geomancy = 1.0 - canvas.__appState.geomancy;
            if (e.code === 'KeyP') canvas.__appState.crt = 1.0 - canvas.__appState.crt;
        });

    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        throw e;
    }
}

const { renderer, camera, sceneCA, sceneDisplay, rtA, rtB, matCA, matDisplay } = canvas.__three;
const state = canvas.__appState;

// Resize handling
if (rtA.width !== grid.width || rtA.height !== grid.height) {
    rtA.setSize(grid.width, grid.height);
    rtB.setSize(grid.width, grid.height);
    matCA.uniforms.u_res.value.set(grid.width, grid.height);
    matDisplay.uniforms.u_res.value.set(grid.width, grid.height);
    renderer.setSize(grid.width, grid.height, false);
}

// Update CA uniforms
matCA.uniforms.u_time.value = time;
matCA.uniforms.u_mouse.value.set(
    mouse.x / grid.width,
    1.0 - mouse.y / grid.height,
    mouse.isPressed ? 1.0 : 0.0,
    0.0
);
matCA.uniforms.u_reseed.value = state.reseed;

// Update Display uniforms
matDisplay.uniforms.u_time.value = time;
matDisplay.uniforms.u_geomancy.value = state.geomancy;
matDisplay.uniforms.u_crt.value = state.crt;
matDisplay.uniforms.u_palette.value = state.palette;

// Ping-pong CA pass
matCA.uniforms.u_state.value = rtA.texture;
renderer.setRenderTarget(rtB);
renderer.render(sceneCA, camera);

// Swap buffers
canvas.__three.rtA = rtB;
canvas.__three.rtB = rtA;

// Render to screen
matDisplay.uniforms.u_state.value = rtB.texture;
renderer.setRenderTarget(null);
renderer.render(sceneDisplay, camera);

// Clear single-frame triggers
state.reseed = 0.0;