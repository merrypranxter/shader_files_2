try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;
        renderer.setPixelRatio(1.0); // Keep 1.0 for feedback stability and performance

        const rtOpts = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType, // HDR for bloom and accumulation
            depthBuffer: false,
            stencilBuffer: false
        };

        const rtScene = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const rtFeedbackA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const rtFeedbackB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneGeometry(2, 2);

        const vs = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        const matScene = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            vertexShader: vs,
            fragmentShader: `
                out vec4 fragColor;
                in vec2 vUv;
                uniform float u_time;
                uniform vec2 u_mouse;
                uniform vec2 u_resolution;

                // OKLab to sRGB
                vec3 oklab_to_srgb(vec3 lab) {
                    float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
                    float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
                    float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
                    float l = l_*l_*l_, m = m_*m_*m_, s = s_*s_*s_;
                    return vec3(
                        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                       -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                       -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                    );
                }

                // Saturated candy-acid spectrum
                vec3 spectral(float nm) {
                    float t = clamp((nm - 380.0) / (700.0 - 380.0), 0.0, 1.0);
                    vec3 c = 0.5 + 0.5 * cos(6.28318 * (t * 1.5 + vec3(0.0, 0.33, 0.67)));
                    c = smoothstep(0.05, 0.95, c); // Boost contrast/saturation
                    float falloff = smoothstep(0.0, 0.1, t) * smoothstep(1.0, 0.9, t);
                    return c * falloff;
                }

                mat2 rot(float a) { float s=sin(a), c=cos(a); return mat2(c, -s, s, c); }

                // Semi-liquid morphing SDF
                float map(vec3 p) {
                    vec3 q = p;
                    q.xy *= rot(u_time * 0.2);
                    q.yz *= rot(u_time * 0.33);
                    
                    vec3 ap = abs(q);
                    float d1 = (ap.x + ap.y + ap.z - 1.2) * 0.57735; // Octahedron
                    float d2 = length(q) - 1.0; // Sphere
                    
                    float m = smoothstep(-0.5, 0.5, sin(u_time * 0.6));
                    float d = mix(d1, d2, m);
                    
                    // Liquid displacement
                    d -= sin(p.x * 5.0 + u_time * 1.5) * sin(p.y * 5.0 - u_time) * sin(p.z * 5.0) * 0.08;
                    return d;
                }

                vec3 getNormal(vec3 p) {
                    vec2 e = vec2(0.002, 0.0);
                    return normalize(vec3(
                        map(p+e.xyy) - map(p-e.xyy),
                        map(p+e.yxy) - map(p-e.yxy),
                        map(p+e.yyx) - map(p-e.yyx)
                    ));
                }

                float raySphere(vec3 ro, vec3 rd, float r) {
                    float b = dot(ro, rd);
                    float c = dot(ro, ro) - r*r;
                    float h = b*b - c;
                    if(h < 0.0) return -1.0;
                    return -b + sqrt(h); // Far intersection
                }

                void main() {
                    vec2 uv = (vUv - 0.5) * 2.0;
                    uv.x *= u_resolution.x / u_resolution.y;

                    vec3 ro = vec3(0.0, 0.0, 3.5);
                    vec3 rd = normalize(vec3(uv, -1.8));

                    vec2 mouse = (u_mouse - 0.5) * 2.0;
                    vec3 lightDir = normalize(vec3(-1.0 + mouse.x, mouse.y, -0.5));

                    float t = 0.0;
                    float d = 0.0;
                    for(int i=0; i<70; i++) {
                        vec3 p = ro + rd * t;
                        d = map(p);
                        if(d < 0.001 || t > 6.0) break;
                        t += d;
                    }

                    vec3 col = vec3(0.0);

                    if(d < 0.001) {
                        vec3 p = ro + rd * t;
                        vec3 n = getNormal(p);

                        // 16-sample per-wavelength dispersion
                        for(float i=0.0; i<16.0; i++) {
                            float lambda = mix(380.0, 700.0, i / 15.0);
                            vec3 wl_col = spectral(lambda);

                            // Cauchy dispersion model
                            float ior = 1.15 + 0.03 / pow(lambda / 1000.0, 2.0);

                            vec3 r_dir = refract(rd, n, 1.0 / ior);
                            if (length(r_dir) < 0.1) r_dir = reflect(rd, n); // TIR fallback

                            // Analytic back-face intersection for speed
                            float t_back = raySphere(p, r_dir, 1.25);
                            vec3 p_back = p + r_dir * max(t_back, 0.1);
                            vec3 n_back = -normalize(p_back);

                            vec3 exit_dir = refract(r_dir, n_back, ior);
                            if (length(exit_dir) < 0.1) exit_dir = reflect(r_dir, n_back);

                            // Diffraction grating interference bands
                            float grating = sin(exit_dir.x * 250.0 + u_time * 2.0) * sin(exit_dir.y * 250.0 - u_time);
                            wl_col *= 1.0 + grating * 0.7;

                            // Luminous intensity
                            float intensity = pow(max(dot(exit_dir, lightDir), 0.0), 24.0) * 1.5;
                            intensity += pow(max(dot(exit_dir, -rd), 0.0), 6.0) * 0.3; // Glow

                            col += wl_col * intensity;
                        }
                        col /= 16.0;
                        
                        // Surface Fresnel
                        vec3 ref = reflect(rd, n);
                        col += vec3(0.15) * pow(max(dot(ref, lightDir), 0.0), 12.0);
                    } else {
                        // Background: Domain Coloring & False Color Moiré
                        vec2 z = uv * 2.5;
                        // Complex function f(z) = z^3 - 1
                        vec2 z3 = vec2(z.x*z.x*z.x - 3.0*z.x*z.y*z.y, 3.0*z.x*z.x*z.y - z.y*z.y*z.y);
                        vec2 fz = z3 - vec2(1.0, 0.0);
                        float arg = atan(fz.y, fz.x);
                        float mag = length(fz);

                        float magContour = fract(log2(mag + 1.0) * 5.0 - u_time * 0.8);
                        float ripple = smoothstep(0.0, 0.1, magContour) * smoothstep(1.0, 0.9, magContour);

                        // OKLCh color space morphing
                        vec3 bg = oklab_to_srgb(vec3(0.25 + 0.15 * ripple, 0.18, arg / 6.28318));

                        // White-hot incoming beam
                        float beamDist = abs(uv.y - lightDir.y - sin(uv.x * 3.0 + u_time)*0.15);
                        float beam = exp(-beamDist * 40.0) * smoothstep(-1.0, 0.0, -uv.x);
                        bg += vec3(1.0, 0.9, 0.8) * beam * 0.8;

                        // Simultaneous contrast traps
                        vec2 gv = fract(uv * 6.0) - 0.5;
                        if(abs(gv.x) < 0.08 && abs(gv.y) < 0.08) bg = vec3(0.4); // Pure gray squares

                        col = bg;
                    }

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        const matFeedback = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_scene: { value: null },
                u_prev: { value: null },
                u_mouse_vel: { value: new THREE.Vector2(0, 0) },
                u_time: { value: 0 }
            },
            vertexShader: vs,
            fragmentShader: `
                out vec4 fragColor;
                in vec2 vUv;
                uniform sampler2D u_scene;
                uniform sampler2D u_prev;
                uniform vec2 u_mouse_vel;
                uniform float u_time;

                void main() {
                    // Predictive temporal desync ghosting
                    vec2 offset = u_mouse_vel * 0.06;
                    vec2 dir = vUv - 0.5;
                    offset += dir * 0.003 * sin(u_time * 2.0); // Breathing expansion

                    vec4 curr = texture(u_scene, vUv);
                    vec4 prev = texture(u_prev, clamp(vUv - offset, 0.0, 1.0));

                    // Afterimage burn-in accumulation
                    float burn = max(prev.r, max(prev.g, prev.b));
                    vec3 complement = vec3(1.0) - prev.rgb;
                    float coverage = max(curr.r, max(curr.g, curr.b));
                    
                    // The ghost appears where paint is absent
                    vec3 ghost = complement * burn * 0.06 * (1.0 - coverage);

                    // Additive accumulation in HDR
                    vec3 combined = curr.rgb + prev.rgb * 0.91 + ghost;
                    fragColor = vec4(combined, 1.0);
                }
            `
        });

        const matFinal = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_feedback: { value: null },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_time: { value: 0 }
            },
            vertexShader: vs,
            fragmentShader: `
                out vec4 fragColor;
                in vec2 vUv;
                uniform sampler2D u_feedback;
                uniform vec2 u_resolution;
                uniform float u_time;

                void main() {
                    vec3 col = texture(u_feedback, vUv).rgb;

                    // ACES-ish Tone Mapping to bring HDR to 0..1
                    col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);

                    // Solarization (Sabattier Effect)
                    float luma = dot(col, vec3(0.299, 0.587, 0.114));
                    float t = 0.68;
                    if (luma > t) {
                        float folded = t * (1.0 - (luma - t) / (1.0 - t));
                        col = mix(col, col * (folded / max(luma, 0.001)), 0.85);
                    }

                    // Mackie Lines (Sobel Edge Halos)
                    vec2 px = 1.0 / u_resolution;
                    float l_n = dot(texture(u_feedback, vUv + vec2(0.0, px.y)).rgb, vec3(0.333));
                    float l_s = dot(texture(u_feedback, vUv - vec2(0.0, px.y)).rgb, vec3(0.333));
                    float l_e = dot(texture(u_feedback, vUv + vec2(px.x, 0.0)).rgb, vec3(0.333));
                    float l_w = dot(texture(u_feedback, vUv - vec2(px.x, 0.0)).rgb, vec3(0.333));
                    
                    // Compress taps to avoid HDR blowout on edges
                    l_n = l_n / (l_n + 0.5);
                    l_s = l_s / (l_s + 0.5);
                    l_e = l_e / (l_e + 0.5);
                    l_w = l_w / (l_w + 0.5);
                    
                    float edge = abs(l_n - l_s) + abs(l_e - l_w);
                    col += edge * vec3(0.9, 0.1, 0.7); // Neon magenta halos

                    // Floating Point Dementia (Quantization & Corruption)
                    vec2 aspectUv = (vUv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
                    float dist = length(aspectUv);
                    float bits = 23.0 - log2(max(1.0, dist * 80.0 + u_time * 5.0));
                    
                    if (bits < 6.0) {
                        float levels = exp2(max(1.0, bits));
                        col = floor(col * levels) / levels;
                        // NaN purple / Inf white corruption spikes
                        float noise = fract(sin(dot(vUv, vec2(127.1, 311.7)) + u_time) * 43758.5453);
                        if (noise > 0.985) {
                            col = mix(vec3(0.8, 0.0, 1.0), vec3(1.0), step(0.995, noise));
                        }
                    }

                    // Vignette & Subtle Grain
                    float vig = 1.0 - 0.45 * dot(aspectUv, aspectUv);
                    col *= clamp(vig, 0.0, 1.0);
                    col += (fract(sin(dot(vUv, vec2(12.9898, 78.233)) * u_time) * 43758.5453) - 0.5) * 0.04;

                    // Gamma correction
                    col = pow(max(col, 0.0), vec3(1.0 / 2.2));

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        const sceneScene = new THREE.Scene();
        sceneScene.add(new THREE.Mesh(geometry, matScene));

        const sceneFeedback = new THREE.Scene();
        sceneFeedback.add(new THREE.Mesh(geometry, matFeedback));

        const sceneFinal = new THREE.Scene();
        sceneFinal.add(new THREE.Mesh(geometry, matFinal));

        canvas.__three = {
            renderer, camera,
            rtScene, rtFeedbackA, rtFeedbackB,
            sceneScene, sceneFeedback, sceneFinal,
            matScene, matFeedback, matFinal,
            mousePos: new THREE.Vector2(0.5, 0.5),
            mouseVel: new THREE.Vector2(0, 0)
        };
    }

    const state = canvas.__three;
    const { renderer, camera, sceneScene, sceneFeedback, sceneFinal, matScene, matFeedback, matFinal } = state;

    // Handle resolution changes
    if (state.rtScene.width !== grid.width || state.rtScene.height !== grid.height) {
        state.rtScene.setSize(grid.width, grid.height);
        state.rtFeedbackA.setSize(grid.width, grid.height);
        state.rtFeedbackB.setSize(grid.width, grid.height);
        matScene.uniforms.u_resolution.value.set(grid.width, grid.height);
        matFinal.uniforms.u_resolution.value.set(grid.width, grid.height);
    }

    // Update mouse and velocity for temporal desync
    let targetMouse = new THREE.Vector2(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
    let vel = targetMouse.clone().sub(state.mousePos);
    state.mouseVel.lerp(vel, 0.15); // Smooth velocity
    state.mousePos.copy(targetMouse);

    // Update Uniforms
    matScene.uniforms.u_time.value = time;
    matScene.uniforms.u_mouse.value = state.mousePos;

    matFeedback.uniforms.u_time.value = time;
    matFeedback.uniforms.u_mouse_vel.value = state.mouseVel;
    matFeedback.uniforms.u_scene.value = state.rtScene.texture;
    matFeedback.uniforms.u_prev.value = state.rtFeedbackA.texture;

    matFinal.uniforms.u_time.value = time;
    matFinal.uniforms.u_feedback.value = state.rtFeedbackB.texture;

    // 1. Render Raymarched Scene
    renderer.setRenderTarget(state.rtScene);
    renderer.render(sceneScene, camera);

    // 2. Render Feedback/Temporal Accumulation
    renderer.setRenderTarget(state.rtFeedbackB);
    renderer.render(sceneFeedback, camera);

    // 3. Render Post-Processing to Screen
    renderer.setRenderTarget(null);
    renderer.render(sceneFinal, camera);

    // Ping-Pong Swap
    let temp = state.rtFeedbackA;
    state.rtFeedbackA = state.rtFeedbackB;
    state.rtFeedbackB = temp;

} catch (e) {
    console.error("WebGL Initialization or Render Failed:", e);
    throw e;
}