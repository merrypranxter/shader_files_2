try {
    if (!ctx) throw new Error("Context not provided");

    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;
        
        // Ping-pong buffers for fluid feedback and optical persistence
        const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            depthBuffer: false
        });
        const rtB = rtA.clone();

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        const sceneRT = new THREE.Scene();
        const sceneScreen = new THREE.Scene();

        // --- MAIN REEF SHADER (Pass 1) ---
        const renderMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
                u_mouse_vel: { value: new THREE.Vector2(0.0, 0.0) },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                t_prev: { value: null },
                u_click_pulse: { value: 0.0 },
                u_palette: { value: 0 },
                u_depth_exag: { value: 1.0 },
                u_hidden_boost: { value: 0.2 },
                u_plasma_int: { value: 0.5 },
                u_symbol_den: { value: 0.3 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                in vec2 vUv;
                out vec4 fragColor;

                uniform float u_time;
                uniform vec2 u_mouse;
                uniform vec2 u_mouse_vel;
                uniform vec2 u_resolution;
                uniform sampler2D t_prev;
                uniform float u_click_pulse;
                uniform int u_palette;
                uniform float u_depth_exag;
                uniform float u_hidden_boost;
                uniform float u_plasma_int;
                uniform float u_symbol_den;

                #define PI 3.14159265359

                // Hash & Noise
                float hash12(vec2 p) {
                    vec3 p3  = fract(vec3(p.xyx) * .1031);
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.x + p3.y) * p3.z);
                }
                
                vec2 hash22(vec2 p) {
                    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
                    p3 += dot(p3, p3.yzx+33.33);
                    return fract((p3.xx+p3.yz)*p3.zy);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    vec2 u = f*f*(3.0-2.0*f);
                    return mix(mix(hash12(i + vec2(0.0,0.0)), hash12(i + vec2(1.0,0.0)), u.x),
                               mix(hash12(i + vec2(0.0,1.0)), hash12(i + vec2(1.0,1.0)), u.x), u.y);
                }

                float fbm(vec2 p) {
                    float v = 0.0;
                    float a = 0.5;
                    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
                    for (int i = 0; i < 5; i++) {
                        v += a * noise(p);
                        p = rot * p * 2.0 + vec2(1.7, 9.2);
                        a *= 0.5;
                    }
                    return v;
                }

                vec2 curlNoise(vec2 p) {
                    float eps = 0.01;
                    float n1 = fbm(p + vec2(0.0, eps));
                    float n2 = fbm(p - vec2(0.0, eps));
                    float n3 = fbm(p + vec2(eps, 0.0));
                    float n4 = fbm(p - vec2(eps, 0.0));
                    return normalize(vec2(n1 - n2, n4 - n3));
                }

                // Palettes (No pure black/white)
                vec3 getBaseColor(float t) {
                    vec3 a, b, c, d;
                    if (u_palette == 0) { // Tropical Candy
                        a = vec3(0.8, 0.4, 0.6); b = vec3(0.4, 0.4, 0.4); c = vec3(1.0, 1.0, 1.0); d = vec3(0.0, 0.33, 0.67);
                    } else if (u_palette == 1) { // Ultraviolet Lagoon
                        a = vec3(0.6, 0.2, 0.8); b = vec3(0.5, 0.3, 0.4); c = vec3(1.0, 1.0, 1.0); d = vec3(0.3, 0.2, 0.8);
                    } else if (u_palette == 2) { // Citrus Plasma
                        a = vec3(0.9, 0.6, 0.3); b = vec3(0.4, 0.5, 0.3); c = vec3(1.0, 1.0, 1.0); d = vec3(0.0, 0.15, 0.4);
                    } else if (u_palette == 3) { // Opaline Tidepool
                        a = vec3(0.3, 0.7, 0.7); b = vec3(0.4, 0.3, 0.5); c = vec3(1.0, 1.0, 1.0); d = vec3(0.5, 0.2, 0.8);
                    } else { // Electric Sunset
                        a = vec3(0.8, 0.3, 0.4); b = vec3(0.5, 0.4, 0.3); c = vec3(1.0, 1.0, 1.0); d = vec3(0.0, 0.1, 0.3);
                    }
                    return a + b * cos(6.28318 * (c * t + d));
                }

                // Birefringence Simulation (Michel-Levy)
                vec3 birefringence(float gamma) {
                    vec3 col = vec3(0.0);
                    col.r = pow(sin(gamma * PI / 610.0), 2.0);
                    col.g = pow(sin(gamma * PI / 540.0), 2.0);
                    col.b = pow(sin(gamma * PI / 460.0), 2.0);
                    return mix(vec3(0.2, 0.1, 0.3), col, 0.85); // Prevent dark spots
                }

                // Alchemical Symbols SDFs
                float sdTriangle(vec2 p, float r) {
                    const float k = sqrt(3.0);
                    p.x = abs(p.x) - r;
                    p.y = p.y + r/k;
                    if( p.x+k*p.y>0.0 ) p = vec2(p.x-k*p.y,-k*p.x-p.y)/2.0;
                    p.x -= clamp( p.x, -2.0*r, 0.0 );
                    return -length(p)*sign(p.y);
                }
                float sdCircle(vec2 p, float r) { return length(p) - r; }

                void main() {
                    vec2 uv = vUv;
                    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
                    vec2 p = (uv - 0.5) * aspect;

                    // Refractive Click Pulse
                    float pulseDist = length(p - (u_mouse - 0.5) * aspect);
                    float pulseWarp = smoothstep(0.1, 0.0, abs(pulseDist - u_click_pulse)) * exp(-u_click_pulse);
                    p += normalize(p - (u_mouse - 0.5) * aspect + 0.001) * pulseWarp * 0.15;

                    // Fluid Drift & Domain Warping
                    vec2 drift = curlNoise(p * 2.0 + u_time * 0.1) * 0.05;
                    p += drift;

                    vec3 finalCol = getBaseColor(fbm(p + u_time * 0.05)); // Base fluid lagoon

                    // Layered Reef Membranes
                    for(float i = 1.0; i <= 3.0; i++) {
                        float z = i * 0.3 * u_depth_exag;
                        vec2 lp = p * (1.0 + z) + vec2(u_time * 0.02 * i, sin(u_time * 0.01 * i));
                        
                        // Membrane SDF
                        float n1 = fbm(lp * 3.0);
                        float n2 = fbm(lp * 3.0 + vec2(5.2, 1.3));
                        float ribbon = abs(fract(lp.y * 2.0 + n1 * 2.0) - 0.5) * 2.0;
                        float thickness = smoothstep(0.4, 0.0, ribbon) * n2;

                        if (thickness > 0.01) {
                            // Birefringence Cellophane
                            float gamma = thickness * 3000.0 * (1.0 + pulseWarp * 2.0);
                            vec3 birefCol = birefringence(gamma);
                            
                            // Diffraction Grating Shimmer
                            float shimmer = pow(sin(lp.x * 150.0 + u_time * 5.0) * 0.5 + 0.5, 4.0);
                            birefCol += vec3(shimmer * 0.3) * getBaseColor(lp.x);

                            // Chromostereopsis Edges (Red pushes forward, Blue recedes)
                            float edge = smoothstep(0.0, 0.1, ribbon) - smoothstep(0.1, 0.2, ribbon);
                            vec3 stereoEdge = vec3(edge * 0.8, 0.0, -edge * 0.8); // Left/Right fake normal
                            birefCol += stereoEdge;

                            finalCol = mix(finalCol, birefCol, thickness * 0.8);
                        }

                        // Plasma Filaments
                        if (u_plasma_int > 0.0) {
                            float plasmaRoute = fbm(lp * 5.0 - u_time * 0.2);
                            float plasmaLine = abs(fract(lp.x * 4.0 + plasmaRoute * 3.0) - 0.5) * 2.0;
                            float plasmaGlow = smoothstep(0.05, 0.0, plasmaLine) * u_plasma_int;
                            vec3 pCol = getBaseColor(i * 0.3 + u_time * 0.1) * 2.0;
                            finalCol += pCol * plasmaGlow * pow(n2, 2.0); // Forking effect
                        }
                    }

                    // Glass Patterns (Hidden Correlation)
                    float boost = u_hidden_boost + pulseWarp * 0.5;
                    if (boost > 0.05) {
                        vec2 gp = p * 80.0;
                        vec2 id = floor(gp);
                        vec2 gv = fract(gp) - 0.5;
                        float h = hash12(id);
                        
                        vec2 shift = vec2(0.0);
                        if (h < boost) {
                            // Secret geometry: hyperbolic saddle correlation
                            shift = vec2(id.x * id.y, id.x*id.x - id.y*id.y) * 0.0005;
                        } else {
                            shift = hash22(id + 1.0) - 0.5;
                        }
                        
                        float dotDist = length(gv - shift);
                        float glassDot = smoothstep(0.3, 0.1, dotDist);
                        finalCol += glassDot * 0.4 * getBaseColor(h + u_time);
                    }

                    // Alchemical Spores
                    if (u_symbol_den > 0.0) {
                        vec2 sp = p * 15.0 + u_time * 0.2;
                        vec2 sid = floor(sp);
                        vec2 sv = fract(sp) - 0.5;
                        float sh = hash12(sid);
                        if (sh < u_symbol_den * 0.2) {
                            float d = 1.0;
                            if (sh < u_symbol_den * 0.05) d = sdTriangle(sv, 0.2);
                            else d = abs(sdCircle(sv, 0.2)) - 0.02;
                            float symAlpha = smoothstep(0.03, 0.0, d);
                            finalCol = mix(finalCol, vec3(0.9, 0.9, 1.0), symAlpha * 0.6);
                        }
                    }

                    // Fluid Feedback Blending
                    vec2 fbUv = uv - drift * 0.02 - u_mouse_vel * 0.05 * smoothstep(0.2, 0.0, length(p - (u_mouse-0.5)*aspect));
                    vec3 prevCol = texture(t_prev, fbUv).rgb;
                    
                    // Prevent black/muddy accumulation
                    finalCol = mix(prevCol, finalCol, 0.15 + pulseWarp * 0.5);
                    finalCol = clamp(finalCol, vec3(0.05, 0.1, 0.2), vec3(1.5)); 

                    fragColor = vec4(finalCol, 1.0);
                }
            `
        });

        // --- POST PROCESS SHADER (Pass 2) ---
        const postMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                t_scene: { value: null },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D t_scene;
                uniform vec2 u_resolution;

                void main() {
                    vec2 uv = vUv;
                    
                    // Chromatic Aberration (Lateral)
                    vec2 center = vec2(0.5);
                    vec2 delta = uv - center;
                    float caStr = length(delta) * 0.015;
                    
                    float r = texture(t_scene, uv + delta * caStr).r;
                    float g = texture(t_scene, uv).g;
                    float b = texture(t_scene, uv - delta * caStr * 0.5).b;
                    
                    vec3 col = vec3(r, g, b);

                    // Purple Fringing on high contrast
                    float lum = dot(col, vec3(0.299, 0.587, 0.114));
                    if (lum > 0.8) {
                        col += vec3(0.3, 0.0, 0.5) * (lum - 0.8) * 2.0;
                    }

                    // Soft Vignette (Colored, not black)
                    float vig = length(delta);
                    col = mix(col, vec3(0.1, 0.0, 0.2), vig * 0.4);

                    // ACES Tonemapping
                    col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        sceneRT.add(new THREE.Mesh(plane.geometry, renderMaterial));
        sceneScreen.add(new THREE.Mesh(plane.geometry, postMaterial));

        canvas.__three = { 
            renderer, sceneRT, sceneScreen, camera, 
            rtA, rtB, renderMaterial, postMaterial,
            state: {
                palette: 0, depthExag: 1.0, hiddenBoost: 0.2, plasmaInt: 0.5, symbolDen: 0.3,
                pulseRadius: 0.0, isPulsing: false,
                lastMouseX: 0.5, lastMouseY: 0.5,
                velX: 0.0, velY: 0.0
            }
        };

        // Event Listeners
        const s = canvas.__three.state;
        
        const handleKeyDown = (e) => {
            const key = e.key.toLowerCase();
            if (key === 'c') s.palette = (s.palette + 1) % 5;
            if (key === 'd') s.depthExag = s.depthExag > 1.5 ? 0.5 : s.depthExag + 0.5;
            if (key === 'h') s.hiddenBoost = s.hiddenBoost > 0.5 ? 0.1 : s.hiddenBoost + 0.2;
            if (key === 'p') s.plasmaInt = s.plasmaInt > 0.8 ? 0.0 : s.plasmaInt + 0.3;
            if (key === 's') s.symbolDen = s.symbolDen > 0.8 ? 0.0 : s.symbolDen + 0.3;
        };

        const handlePointerDown = () => {
            s.isPulsing = true;
            s.pulseRadius = 0.0;
            s.hiddenBoost = Math.min(1.0, s.hiddenBoost + 0.4);
            s.plasmaInt = Math.min(1.0, s.plasmaInt + 0.5);
        };

        const handlePointerUp = () => {
            s.hiddenBoost = Math.max(0.1, s.hiddenBoost - 0.4);
            s.plasmaInt = Math.max(0.0, s.plasmaInt - 0.5);
        };

        // Attach safely
        if (!canvas.__listenersAttached) {
            window.addEventListener('keydown', handleKeyDown);
            canvas.addEventListener('pointerdown', handlePointerDown);
            canvas.addEventListener('pointerup', handlePointerUp);
            canvas.__listenersAttached = true;
        }
    }

    const { 
        renderer, sceneRT, sceneScreen, camera, 
        rtA, rtB, renderMaterial, postMaterial, state 
    } = canvas.__three;

    renderer.setSize(grid.width, grid.height, false);

    // Update Interactions & Physics
    let mx = mouse.x / grid.width;
    let my = 1.0 - (mouse.y / grid.height);
    
    state.velX += (mx - state.lastMouseX - state.velX) * 0.1;
    state.velY += (my - state.lastMouseY - state.velY) * 0.1;
    state.lastMouseX = mx;
    state.lastMouseY = my;

    if (state.isPulsing) {
        state.pulseRadius += 0.02;
        if (state.pulseRadius > 1.5) state.isPulsing = false;
    }

    // Update Render Uniforms
    if (renderMaterial?.uniforms) {
        renderMaterial.uniforms.u_time.value = time;
        renderMaterial.uniforms.u_mouse.value.set(mx, my);
        renderMaterial.uniforms.u_mouse_vel.value.set(state.velX, state.velY);
        renderMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
        renderMaterial.uniforms.t_prev.value = rtA.texture;
        renderMaterial.uniforms.u_click_pulse.value = state.isPulsing ? state.pulseRadius : 0.0;
        renderMaterial.uniforms.u_palette.value = state.palette;
        renderMaterial.uniforms.u_depth_exag.value = state.depthExag;
        renderMaterial.uniforms.u_hidden_boost.value = state.hiddenBoost;
        renderMaterial.uniforms.u_plasma_int.value = state.plasmaInt;
        renderMaterial.uniforms.u_symbol_den.value = state.symbolDen;
    }

    // Pass 1: Render Simulation to RT B
    renderer.setRenderTarget(rtB);
    renderer.render(sceneRT, camera);

    // Pass 2: Post Process to Screen
    if (postMaterial?.uniforms) {
        postMaterial.uniforms.t_scene.value = rtB.texture;
        postMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
    }
    renderer.setRenderTarget(null);
    renderer.render(sceneScreen, camera);

    // Swap Ping-Pong Buffers
    const temp = canvas.__three.rtA;
    canvas.__three.rtA = canvas.__three.rtB;
    canvas.__three.rtB = temp;

} catch (e) {
    console.error("Chromatic Reef Surge failed:", e);
}