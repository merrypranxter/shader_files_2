try {
    // --- INITIALIZATION & BOILERPLATE ---
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Ping-pong render targets for temporal desync & feedback
        const rtOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            depthBuffer: false,
            stencilBuffer: false
        };
        const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
        const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

        // --- SHADER: SIMULATION (THE RITUAL ENGINE) ---
        const simVertexShader = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        const simFragmentShader = `
            in vec2 vUv;
            out vec4 fragColor;

            uniform float u_time;
            uniform vec2 u_resolution;
            uniform vec2 u_mouse;
            uniform vec2 u_pred_mouse;
            uniform sampler2D u_prev;

            #define PI 3.14159265359
            #define TAU 6.28318530718

            // --- COLOR SYSTEMS (OKLab) ---
            vec3 srgb_to_linear(vec3 c) {
                return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
            }
            vec3 linear_to_srgb(vec3 c) {
                return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
            }
            vec3 linear_srgb_to_oklab(vec3 c) {
                float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
                float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
                float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
                float l_ = pow(l, 1.0 / 3.0);
                float m_ = pow(m, 1.0 / 3.0);
                float s_ = pow(s, 1.0 / 3.0);
                return vec3(
                    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
                    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
                    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
                );
            }
            vec3 oklab_to_linear_srgb(vec3 lab) {
                float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
                float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
                float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
                float l = l_ * l_ * l_;
                float m = m_ * m_ * m_;
                float s = s_ * s_ * s_;
                return vec3(
                    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                );
            }
            vec3 oklab_mix(vec3 c1, vec3 c2, float t) {
                vec3 lab1 = linear_srgb_to_oklab(srgb_to_linear(c1));
                vec3 lab2 = linear_srgb_to_oklab(srgb_to_linear(c2));
                return linear_to_srgb(clamp(oklab_to_linear_srgb(mix(lab1, lab2, t)), 0.0, 1.0));
            }

            // --- COMPLEX MATH & TOPOLOGY ---
            vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
            vec2 cdiv(vec2 a, vec2 b) { float d = dot(b,b)+1e-8; return vec2(dot(a,b), a.y*b.x - a.x*b.y)/d; }
            vec2 csqr(vec2 z) { return vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y); }
            vec2 cexp(vec2 z) { return exp(z.x) * vec2(cos(z.y), sin(z.y)); }
            vec2 clog(vec2 z) { return vec2(log(length(z)+1e-8), atan(z.y, z.x)); }
            
            // Hyperbolic Poincare / Schwartz Dipole
            vec2 cortical_dipole(vec2 z, float a, float b) {
                vec2 za = z + vec2(a, 0.0);
                vec2 zb = z + vec2(b, 0.0);
                return clog(cdiv(za, zb));
            }

            // --- KALEIDOSCOPE ENGINE ---
            vec2 kalFold(vec2 z, float n) {
                float a = atan(z.y, z.x);
                float r = length(z);
                float sec = TAU / n;
                a = mod(a, sec);
                a = abs(a - sec/2.0);
                return vec2(cos(a), sin(a)) * r;
            }

            // --- NOISE ---
            float hash21(vec2 p) {
                p = fract(p * vec2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }

            // --- THE RITUAL ENGINE (Möbius + False Vacuum + Dementia) ---
            vec2 ritual_engine(vec2 z, float lambda_offset) {
                // False Vacuum Decay Front
                float front = mod(u_time * 0.2, 3.0);
                float is_false_vacuum = step(front, length(z));
                
                // Kaleidoscope with shifting sector count based on reality state
                float sectors = mix(8.0, 5.0, is_false_vacuum);
                z = kalFold(z, sectors);

                // Floating Point Dementia (Quantization at far UVs)
                float dist = length(z);
                float dementia = smoothstep(1.5, 3.0, dist);
                if (dementia > 0.0) {
                    float bits = mix(24.0, 2.0, dementia);
                    float levels = exp2(bits);
                    z = floor(z * levels) / levels;
                }

                // Complex Domain Coloring & Möbius Twist
                vec2 w = cortical_dipole(z, 0.5 * sin(u_time), 0.5 * cos(u_time));
                w = cmul(w, cexp(vec2(0.0, u_time * 0.2 + lambda_offset)));
                
                // The "Maxin-light" / Incal core (Phylos)
                vec2 incal = cdiv(vec2(1.0, 0.0), z + vec2(0.0, 0.001));
                w += incal * 0.05;

                return w;
            }

            vec3 get_jewel_palette(float phase, float mag) {
                // Astral/Emerald Jewel Palette
                vec3 emerald = vec3(0.0, 1.0, 0.4);
                vec3 hot_pink = vec3(1.0, 0.0, 0.5);
                vec3 cyan = vec3(0.0, 0.8, 1.0);
                vec3 violet = vec3(0.4, 0.0, 1.0);
                vec3 gold = vec3(1.0, 0.8, 0.0);

                float p = fract(phase / TAU + u_time * 0.05);
                vec3 col = oklab_mix(emerald, cyan, smoothstep(0.0, 0.25, p));
                col = oklab_mix(col, hot_pink, smoothstep(0.25, 0.5, p));
                col = oklab_mix(col, violet, smoothstep(0.5, 0.75, p));
                col = oklab_mix(col, gold, smoothstep(0.75, 1.0, p));

                // Branch cuts and contour lines (Domain Coloring)
                float contour = fract(log2(mag) * 5.0 - u_time);
                contour = smoothstep(0.0, 0.1, contour) * smoothstep(1.0, 0.9, contour);
                
                return col * (0.5 + 0.5 * contour);
            }

            void main() {
                vec2 uv = (vUv - 0.5) * 2.0;
                uv.x *= u_resolution.x / u_resolution.y;

                // Temporal Desync / Predictive Ghosting
                vec2 m_uv = (u_mouse - 0.5) * 2.0;
                m_uv.x *= u_resolution.x / u_resolution.y;
                vec2 pm_uv = (u_pred_mouse - 0.5) * 2.0;
                pm_uv.x *= u_resolution.x / u_resolution.y;

                float ghost = exp(-length(uv - pm_uv) * 20.0);
                float real = exp(-length(uv - m_uv) * 40.0);

                // Prism Dispersion (Sample complex engine 3 times for R, G, B)
                vec2 wR = ritual_engine(uv, 0.00);
                vec2 wG = ritual_engine(uv, 0.05);
                vec2 wB = ritual_engine(uv, 0.10);

                float magR = length(wR); float phaseR = atan(wR.y, wR.x);
                float magG = length(wG); float phaseG = atan(wG.y, wG.x);
                float magB = length(wB); float phaseB = atan(wB.y, wB.x);

                vec3 colR = get_jewel_palette(phaseR, magR);
                vec3 colG = get_jewel_palette(phaseG, magG);
                vec3 colB = get_jewel_palette(phaseB, magB);

                vec3 finalCol = vec3(colR.r, colG.g, colB.b);

                // Diffraction Grating Shimmer
                float diffraction = sin(length(uv) * 150.0 - u_time * 10.0);
                finalCol += vec3(0.1, 0.2, 0.3) * diffraction * 0.15;

                // False Vacuum Transition Front Glow
                float front = mod(u_time * 0.2, 3.0);
                float front_glow = exp(-abs(length(uv) - front) * 50.0);
                finalCol += vec3(1.0, 0.2, 0.8) * front_glow; // Hot pink transition

                // Ghost interaction
                finalCol += vec3(0.0, 1.0, 1.0) * ghost * 0.5; // Cyan predictive ghost
                finalCol += vec3(1.0, 1.0, 1.0) * real * 0.8;

                // NaN / Infinity Corruption (Floating Point Dementia)
                if (isnan(magR) || isinf(magR)) {
                    finalCol = vec3(0.8, 0.0, 1.0) * (0.5 + 0.5 * sin(u_time * 10.0)); // Purple pulse
                }

                // Feedback
                vec2 fb_uv = vUv + (uv * 0.002 * sin(u_time)); // Slight zoom/twist
                vec3 prev = texture(u_prev, fb_uv).rgb;
                
                fragColor = vec4(max(finalCol * 0.4, prev * 0.85), 1.0);
            }
        `;

        // --- SHADER: POST-PROCESS (CHROMOSTEREOPSIS & PHOSPHENE) ---
        const postVertexShader = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        const postFragmentShader = `
            in vec2 vUv;
            out vec4 fragColor;

            uniform sampler2D u_tDiffuse;
            uniform float u_time;
            uniform vec2 u_resolution;

            void main() {
                vec2 uv = vUv;
                vec4 tex = texture(u_tDiffuse, uv);
                
                // Chromostereopsis (Naked-eye 3D via longitudinal chromatic aberration)
                // Red advances, Blue recedes. We shift them based on luminosity.
                float lum = dot(tex.rgb, vec3(0.2126, 0.7152, 0.0722));
                vec2 shift = (uv - 0.5) * (lum - 0.5) * 0.015;
                
                float r = texture(u_tDiffuse, uv + shift).r;
                float g = tex.g;
                float b = texture(u_tDiffuse, uv - shift).b;
                vec3 col = vec3(r, g, b);

                // Phosphene Field (Retinal Cobwebs via log-polar mapping)
                vec2 centered = (uv - 0.5) * 2.0;
                centered.x *= u_resolution.x / u_resolution.y;
                float rho = log(length(centered) + 1e-4);
                float theta = atan(centered.y, centered.x);
                
                // Cobweb form constant
                float cobweb = sin(rho * 25.0 + theta * 4.0) * sin(theta * 12.0);
                float phosphene = smoothstep(0.8, 1.0, abs(cobweb));
                
                // Mix in phosphene gently (emerald/gold)
                col += vec3(0.1, 0.8, 0.2) * phosphene * 0.15 * exp(-length(centered)*2.0);

                // Vignette
                float vig = 1.0 - smoothstep(0.5, 1.5, length(centered));
                col *= vig;

                // ACES Tone Mapping
                const float a = 2.51;
                const float bb = 0.03;
                const float c = 2.43;
                const float d = 0.59;
                const float e = 0.14;
                col = clamp((col * (a * col + bb)) / (col * (c * col + d) + e), 0.0, 1.0);

                // sRGB gamma correction
                col = pow(col, vec3(1.0 / 2.2));

                fragColor = vec4(col, 1.0);
            }
        `;

        // --- MATERIAL SETUP ---
        const simMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader: simVertexShader,
            fragmentShader: simFragmentShader,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
                u_pred_mouse: { value: new THREE.Vector2(0.5, 0.5) },
                u_prev: { value: null }
            },
            depthWrite: false,
            depthTest: false
        });

        const postMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader: postVertexShader,
            fragmentShader: postFragmentShader,
            uniforms: {
                u_tDiffuse: { value: null },
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            depthWrite: false,
            depthTest: false
        });

        const quadGeo = new THREE.PlaneGeometry(2, 2);
        const simMesh = new THREE.Mesh(quadGeo, simMaterial);
        const postMesh = new THREE.Mesh(quadGeo, postMaterial);

        // --- TRACKING STATE ---
        const mouseState = {
            pos: new THREE.Vector2(0.5, 0.5),
            lastPos: new THREE.Vector2(0.5, 0.5),
            vel: new THREE.Vector2(0, 0),
            acc: new THREE.Vector2(0, 0)
        };

        canvas.__three = {
            renderer,
            scene,
            camera,
            simMaterial,
            postMaterial,
            simMesh,
            postMesh,
            rtA,
            rtB,
            mouseState,
            pingpong: 0
        };
    }

    const { renderer, scene, camera, simMaterial, postMaterial, simMesh, postMesh, rtA, rtB, mouseState } = canvas.__three;

    // --- UPDATE STATE ---
    // Handle resolution changes
    if (simMaterial.uniforms.u_resolution.value.x !== grid.width || simMaterial.uniforms.u_resolution.value.y !== grid.height) {
        renderer.setSize(grid.width, grid.height, false);
        rtA.setSize(grid.width, grid.height);
        rtB.setSize(grid.width, grid.height);
        simMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
        postMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
    }

    // Temporal Desync / Predictive Mouse Logic
    const currentMouse = new THREE.Vector2(
        mouse.x / grid.width,
        1.0 - (mouse.y / grid.height) // Flip Y for GLSL
    );
    
    // Finite differences with smoothing
    const dt = 0.016; // approx 60fps
    const instVel = new THREE.Vector2().subVectors(currentMouse, mouseState.lastPos).divideScalar(dt);
    const instAcc = new THREE.Vector2().subVectors(instVel, mouseState.vel).divideScalar(dt);
    
    mouseState.vel.lerp(instVel, 0.1);
    mouseState.acc.lerp(instAcc, 0.05);
    mouseState.lastPos.copy(currentMouse);
    mouseState.pos.lerp(currentMouse, 0.3); // Smooth actual mouse

    // Predict future position (uLeadTime approx 0.3s)
    const leadTime = 0.3;
    const predMouse = new THREE.Vector2().copy(mouseState.pos)
        .add(mouseState.vel.clone().multiplyScalar(leadTime))
        .add(mouseState.acc.clone().multiplyScalar(0.5 * leadTime * leadTime));

    // Update Uniforms
    simMaterial.uniforms.u_time.value = time;
    simMaterial.uniforms.u_mouse.value.copy(mouseState.pos);
    simMaterial.uniforms.u_pred_mouse.value.copy(predMouse);
    
    postMaterial.uniforms.u_time.value = time;

    // --- RENDER PASSES ---
    const readRT = canvas.__three.pingpong % 2 === 0 ? rtA : rtB;
    const writeRT = canvas.__three.pingpong % 2 === 0 ? rtB : rtA;

    // 1. Render Simulation to Write Buffer
    simMaterial.uniforms.u_prev.value = readRT.texture;
    scene.clear();
    scene.add(simMesh);
    renderer.setRenderTarget(writeRT);
    renderer.render(scene, camera);

    // 2. Render Post-Process to Screen
    postMaterial.uniforms.u_tDiffuse.value = writeRT.texture;
    scene.clear();
    scene.add(postMesh);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    // Swap buffers
    canvas.__three.pingpong++;

} catch (e) {
    console.error("WebGL Initialization or Render Failed:", e);
    throw e;
}