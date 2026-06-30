try {
    // Defensively check if THREE is available
    if (typeof THREE === 'undefined') {
        throw new Error("THREE.js is required for The Spectrum Has Already Happened.");
    }

    // Initialize or retrieve the persistent Three.js context
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.autoClear = false;

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Resolution and Ping-Pong Targets for Temporal Feedback & Afterimages
        const w = grid.width;
        const h = grid.height;
        const rtOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType, // Need float for accurate accumulation and HDR bloom
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping
        };
        
        const rtMain = new THREE.WebGLRenderTarget(w, h, rtOptions);
        const rtPing = new THREE.WebGLRenderTarget(w, h, rtOptions);
        const rtPong = new THREE.WebGLRenderTarget(w, h, rtOptions);

        // ---------------------------------------------------------------------
        // PASS 1: THE IMPOSSIBLE PRISM ENGINE (Raymarcher & Dispersion)
        // ---------------------------------------------------------------------
        const matMain = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(w, h) },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
                u_mouse_future: { value: new THREE.Vector2(0.5, 0.5) }
            },
            vertexShader: `
                in vec3 position;
                in vec2 uv;
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
                uniform vec2 u_resolution;
                uniform vec2 u_mouse;
                uniform vec2 u_mouse_future;

                #define MAX_STEPS 50
                #define SURF_DIST 0.001
                #define MAX_DIST 10.0

                // 2D Rotation
                mat2 rot(float a) {
                    float s = sin(a), c = cos(a);
                    return mat2(c, -s, s, c);
                }

                // Simplex Noise
                vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
                float snoise(vec2 v) {
                    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
                    vec2 i  = floor(v + dot(v, C.yy));
                    vec2 x0 = v - i + dot(i, C.xx);
                    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
                    vec4 x12 = x0.xyxy + C.xxzz;
                    x12.xy -= i1;
                    i = mod(i, 289.0);
                    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
                    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
                    m = m*m; m = m*m;
                    vec3 x = 2.0 * fract(p * C.www) - 1.0;
                    vec3 h = abs(x) - 0.5;
                    vec3 ox = floor(x + 0.5);
                    vec3 a0 = x - ox;
                    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
                    vec3 g;
                    g.x  = a0.x  * x0.x  + h.x  * x0.y;
                    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
                    return 130.0 * dot(m, g);
                }

                // Spectral Wavelength to RGB
                vec3 spectralColor(float l) {
                    float r=0.0, g=0.0, b=0.0;
                    if(l < 440.0) { r = -(l - 440.0) / 60.0; b = 1.0; }
                    else if(l < 490.0) { g = (l - 440.0) / 50.0; b = 1.0; }
                    else if(l < 510.0) { g = 1.0; b = -(l - 510.0) / 20.0; }
                    else if(l < 580.0) { r = (l - 510.0) / 70.0; g = 1.0; }
                    else if(l < 645.0) { r = 1.0; g = -(l - 645.0) / 65.0; }
                    else { r = 1.0; }
                    float f = (l < 420.0) ? 0.3 + 0.7*(l-380.0)/40.0 : (l > 645.0) ? 0.3 + 0.7*(700.0-l)/55.0 : 1.0;
                    return pow(vec3(r,g,b)*f, vec3(0.8));
                }

                // SDF Map
                float map(vec3 p) {
                    vec3 q = p;
                    
                    // Color-space morphing: Warp coordinate manifold (Cartesian to Cylindrical)
                    float morph = smoothstep(0.2, 0.8, sin(u_time * 0.4) * 0.5 + 0.5);
                    vec3 cyl = vec3(length(q.xz), q.y, atan(q.z, q.x));
                    q = mix(q, cyl, morph * 0.3); // Partial warp to keep SDF somewhat stable

                    q.xz *= rot(u_time * 0.3);
                    q.xy *= rot(u_time * 0.2);
                    q.xz *= rot(q.y * 0.5 * sin(u_time * 0.5)); // Twist

                    // Faceted Gem (Intersection of Octahedron and Box)
                    float d1 = (abs(q.x) + abs(q.y) + abs(q.z)) - 1.2; 
                    float d2 = length(max(abs(q) - vec3(0.8), 0.0)) - 0.1;
                    float gem = max(d1, d2);

                    // Liquid Blob
                    float liquid = length(p) - 0.9 + 0.1 * snoise(p.xy * 3.0 + u_time);
                    
                    return mix(gem, liquid, 0.5 + 0.5 * sin(u_time * 0.6));
                }

                // Normal with Diffraction Grating Perturbation
                vec3 getNormal(vec3 p) {
                    vec2 e = vec2(0.001, 0);
                    vec3 n = normalize(vec3(
                        map(p + e.xyy) - map(p - e.xyy),
                        map(p + e.yxy) - map(p - e.yxy),
                        map(p + e.yyx) - map(p - e.yyx)
                    ));
                    // High-frequency grating for iridescent scattering
                    vec3 grating = 0.05 * vec3(
                        sin(150.0 * p.x - u_time * 10.0),
                        cos(150.0 * p.y + u_time * 8.0),
                        sin(150.0 * p.z)
                    );
                    return normalize(n + grating);
                }

                // Environment & Lighting
                vec3 getEnv(vec3 p, vec3 dir, float lambda) {
                    vec2 m = u_mouse * 2.0 - 1.0;
                    vec2 m_fut = u_mouse_future * 2.0 - 1.0;
                    
                    // Main Incoming Light Beam
                    vec3 lightPos = vec3(-4.0, m.y * 2.0, m.x * 2.0);
                    vec3 lDir = normalize(lightPos - p);
                    float beam = pow(max(dot(dir, lDir), 0.0), 90.0);

                    // Precognitive Future Ghost Beam
                    vec3 futPos = vec3(-4.0, m_fut.y * 2.0, m_fut.x * 2.0);
                    vec3 fDir = normalize(futPos - p);
                    float futBeam = pow(max(dot(dir, fDir), 0.0), 150.0);

                    // Background Moiré Interference Sheets
                    float moire = sin(dir.x * 60.0 + u_time) * cos(dir.y * 50.0 - u_time * 1.5) * sin(dir.z * 40.0);
                    moire = smoothstep(0.85, 1.0, moire);

                    vec3 col = beam * vec3(5.0); // White hot
                    col += futBeam * vec3(0.5, 0.1, 1.0) * 3.0; // Psychic purple ghost
                    col += moire * 0.6 * spectralColor(lambda);

                    return col;
                }

                void main() {
                    vec2 uv = vUv * 2.0 - 1.0;
                    uv.x *= u_resolution.x / u_resolution.y;
                    
                    // Floating-Point Dementia & Glitch Zones
                    bool isDementia = false;
                    if (vUv.y < 0.15) {
                        float fpZone = smoothstep(0.15, 0.0, vUv.y) * snoise(uv * 5.0 + u_time);
                        if (fpZone > 0.4) {
                            float prec = mix(100.0, 4.0, fpZone);
                            uv = floor(uv * prec) / prec; // Quantize space
                            if (fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) > 0.95) {
                                isDementia = true; // Trigger NaN purple bloom
                            }
                        }
                    }

                    vec3 ro = vec3(0.0, 0.0, 3.5);
                    vec3 rd = normalize(vec3(uv, -1.5));

                    // Primary Raymarch
                    float dO = 0.0;
                    for(int i=0; i<MAX_STEPS; i++) {
                        vec3 p = ro + rd * dO;
                        float dS = map(p);
                        if(dS < SURF_DIST || dO > MAX_DIST) break;
                        dO += dS;
                    }

                    vec3 col = vec3(0.0);

                    if(dO < MAX_DIST) {
                        vec3 p = ro + rd * dO;
                        vec3 n = getNormal(p);

                        // Per-Wavelength Dispersion Loop
                        const int SAMPLES = 8; // Kept reasonable for performance
                        for(int i=0; i<SAMPLES; i++) {
                            float t = float(i) / float(SAMPLES - 1);
                            float lambda = mix(380.0, 700.0, t);
                            
                            // Cauchy Dispersion: n(lambda) = A + B / lambda^2
                            float ior = 1.4 + 0.01 / (t * t + 0.1); 

                            vec3 rdIn = refract(rd, n, 1.0 / ior);
                            if(length(rdIn) < 0.1) rdIn = reflect(rd, n);

                            // Simulate internal travel & exit
                            vec3 pExit = p + rdIn * 1.2; 
                            vec3 nExit = -n; // Approximate backface normal
                            nExit = normalize(nExit + 0.05 * sin(200.0 * pExit)); // Exit diffraction

                            vec3 rdOut = refract(rdIn, nExit, ior);
                            if(length(rdOut) < 0.1) rdOut = reflect(rdIn, nExit);

                            vec3 spec = spectralColor(lambda);
                            col += getEnv(pExit, rdOut, lambda) * spec;
                        }
                        col /= float(SAMPLES);
                        
                        // Surface reflection
                        float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
                        col += fresnel * getEnv(p, reflect(rd, n), 550.0);
                    } else {
                        // Background
                        col = getEnv(ro + rd * 5.0, rd, 550.0);
                    }

                    if (isDementia) col = mix(col, vec3(0.8, 0.0, 1.0), 0.8); // Glitch Prophet override

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        // ---------------------------------------------------------------------
        // PASS 2: TEMPORAL FEEDBACK & AFTERIMAGE (Ping-Pong)
        // ---------------------------------------------------------------------
        const matFeedback = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_main: { value: null },
                u_prev: { value: null },
                u_time: { value: 0 }
            },
            vertexShader: `
                in vec3 position;
                in vec2 uv;
                out vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                precision highp float;
                in vec2 vUv;
                out vec4 fragColor;

                uniform sampler2D u_main;
                uniform sampler2D u_prev;
                uniform float u_time;

                void main() {
                    // Subtle inward drift for temporal trails
                    vec2 dir = vUv - 0.5;
                    vec2 uvOffset = vUv + dir * 0.005 * sin(u_time * 2.0);
                    
                    vec4 curr = texture(u_main, vUv);
                    vec4 prev = texture(u_prev, uvOffset);

                    // Adaptation buffer (exponential moving average)
                    // We store the adaptation state in the RGB channels.
                    vec3 adapt = mix(prev.rgb, curr.rgb, 0.04); // Slow burn-in

                    fragColor = vec4(adapt, 1.0);
                }
            `
        });

        // ---------------------------------------------------------------------
        // PASS 3: POST-PROCESSING (Solarization, Simultaneous Contrast, Halos)
        // ---------------------------------------------------------------------
        const matPost = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_main: { value: null },
                u_adapt: { value: null },
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(w, h) }
            },
            vertexShader: `
                in vec3 position;
                in vec2 uv;
                out vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                precision highp float;
                in vec2 vUv;
                out vec4 fragColor;

                uniform sampler2D u_main;
                uniform sampler2D u_adapt;
                uniform float u_time;
                uniform vec2 u_resolution;

                float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

                // Mantis Vision False Color
                vec3 mantisVision(vec3 c) {
                    return vec3(
                        dot(c, vec3(0.8, -0.2, 0.4)),
                        dot(c, vec3(-0.3, 0.9, 0.4)),
                        dot(c, vec3(0.2, 0.5, -0.2))
                    );
                }

                void main() {
                    vec3 mainCol = texture(u_main, vUv).rgb;
                    vec3 adaptCol = texture(u_adapt, vUv).rgb;

                    // 1. Afterimage Painter (Complementary Ghosts)
                    // Where adaptation is high and current light is low, reveal the ghost
                    vec3 complement = vec3(1.0) - adaptCol;
                    float ghostIntensity = max(0.0, luma(adaptCol) - luma(mainCol) * 2.0);
                    vec3 col = mainCol + complement * ghostIntensity * 1.5;

                    // 2. False Color Periodic Remap
                    float falseColorTrigger = smoothstep(0.7, 0.9, sin(u_time * 0.4));
                    if (falseColorTrigger > 0.0) {
                        col = mix(col, abs(mantisVision(col)), falseColorTrigger);
                    }

                    // 3. Solarization (Sabattier Curve)
                    float L = luma(col);
                    float thresh = 0.5 + 0.1 * sin(u_time);
                    float folded = (L < thresh) ? L : thresh * (1.0 - (L - thresh) / (1.0 - thresh));
                    // Avoid div by zero
                    col = col * (folded / max(L, 0.001)); 

                    // 4. Mackie Lines (Sobel Edge Halos)
                    vec2 px = 1.0 / u_resolution;
                    float tl = luma(texture(u_main, vUv + vec2(-1, 1)*px).rgb);
                    float br = luma(texture(u_main, vUv + vec2(1, -1)*px).rgb);
                    float tr = luma(texture(u_main, vUv + vec2(1, 1)*px).rgb);
                    float bl = luma(texture(u_main, vUv + vec2(-1, -1)*px).rgb);
                    float edge = abs(tl - br) + abs(tr - bl);
                    col += edge * 3.0 * vec3(0.1, 1.0, 0.8); // Acid cyan edge bloom

                    // 5. Simultaneous Contrast Traps
                    // Two identical gray squares in contrasting surrounds
                    float aspect = u_resolution.x / u_resolution.y;
                    vec2 uvA = vUv; uvA.x *= aspect;
                    
                    vec2 sq1 = vec2(0.15 * aspect, 0.85);
                    vec2 sq2 = vec2(0.85 * aspect, 0.85);
                    
                    float d1 = max(abs(uvA.x - sq1.x), abs(uvA.y - sq1.y));
                    float d2 = max(abs(uvA.x - sq2.x), abs(uvA.y - sq2.y));

                    // Wildly different surrounds
                    if (d1 < 0.08 && d1 > 0.03) col = mix(col, vec3(1.0, 0.0, 0.2), 0.9); // Red
                    if (d2 < 0.08 && d2 > 0.03) col = mix(col, vec3(0.0, 1.0, 0.5), 0.9); // Green

                    // Identical core squares
                    if (d1 <= 0.03 || d2 <= 0.03) col = vec3(0.5);

                    // Subtle Grain
                    float grain = fract(sin(dot(vUv, vec2(12.9898, 78.233)) + u_time) * 43758.5453);
                    col += (grain - 0.5) * 0.05;

                    // Vignette
                    float r = length(vUv - 0.5);
                    col *= smoothstep(0.8, 0.3, r);

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        const meshMain = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matMain);
        const meshFeedback = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matFeedback);
        const meshPost = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matPost);

        canvas.__three = {
            renderer, scene, camera,
            rtMain, rtPing, rtPong,
            matMain, matFeedback, matPost,
            meshMain, meshFeedback, meshPost,
            pingPongState: true,
            mouseX: 0.5, mouseY: 0.5,
            mouseVX: 0, mouseVY: 0
        };

        // Mouse Tracking for Precognitive Ghosts
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const nx = (e.clientX - rect.left) / rect.width;
            const ny = 1.0 - (e.clientY - rect.top) / rect.height;
            
            // Calculate velocity
            canvas.__three.mouseVX = nx - canvas.__three.mouseX;
            canvas.__three.mouseVY = ny - canvas.__three.mouseY;
            
            canvas.__three.mouseX = nx;
            canvas.__three.mouseY = ny;
        });
    }

    const t = canvas.__three;

    // Apply velocity decay
    t.mouseVX *= 0.9;
    t.mouseVY *= 0.9;

    // Update Uniforms
    t.matMain.uniforms.u_time.value = time;
    t.matMain.uniforms.u_mouse.value.set(t.mouseX, t.mouseY);
    // Future mouse position (Precognition)
    t.matMain.uniforms.u_mouse_future.value.set(
        t.mouseX + t.mouseVX * 15.0, 
        t.mouseY + t.mouseVY * 15.0
    );

    t.matFeedback.uniforms.u_time.value = time;
    t.matPost.uniforms.u_time.value = time;

    const readBuffer = t.pingPongState ? t.rtPing : t.rtPong;
    const writeBuffer = t.pingPongState ? t.rtPong : t.rtPing;

    // 1. Render Main Scene
    t.scene.clear();
    t.scene.add(t.meshMain);
    t.renderer.setRenderTarget(t.rtMain);
    t.renderer.render(t.scene, t.camera);

    // 2. Render Feedback (Adaptation / Afterimage)
    t.scene.clear();
    t.scene.add(t.meshFeedback);
    t.matFeedback.uniforms.u_main.value = t.rtMain.texture;
    t.matFeedback.uniforms.u_prev.value = readBuffer.texture;
    t.renderer.setRenderTarget(writeBuffer);
    t.renderer.render(t.scene, t.camera);

    // 3. Render Post (Solarization, Halos, Composite) to Screen
    t.scene.clear();
    t.scene.add(t.meshPost);
    t.matPost.uniforms.u_main.value = t.rtMain.texture;
    t.matPost.uniforms.u_adapt.value = writeBuffer.texture;
    t.renderer.setRenderTarget(null);
    t.renderer.render(t.scene, t.camera);

    // Swap buffers
    t.pingPongState = !t.pingPongState;

} catch (e) {
    console.error("The Spectrum Has Already Happened Failed:", e);
    throw e;
}