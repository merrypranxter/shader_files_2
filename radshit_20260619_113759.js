try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas: canvas, context: ctx, alpha: true, antialias: false });
        renderer.setPixelRatio(1.0); // Keep 1.0 for crunchier pixels and performance

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const sceneCA = new THREE.Scene();
        const sceneMain = new THREE.Scene();
        const scenePost = new THREE.Scene();

        const geometry = new THREE.PlaneGeometry(2, 2);

        // FBO Setup - HalfFloat for precision in CA and datamosh without breaking mobile
        const fboOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping
        };

        const caFBO1 = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOptions);
        const caFBO2 = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOptions);
        const mainFBO1 = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOptions);
        const mainFBO2 = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOptions);

        // --- CA PASS (Reaction Diffusion / Hidden Machine Mind) ---
        const caMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_prevCA: { value: null },
                u_res: { value: new THREE.Vector2(grid.width, grid.height) },
                u_time: { value: 0 }
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
                uniform sampler2D u_prevCA;
                uniform vec2 u_res;
                uniform float u_time;

                float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

                void main() {
                    vec2 texel = 1.0 / u_res;
                    vec4 s = texture(u_prevCA, vUv);
                    
                    // 9-tap blur
                    vec4 avg = vec4(0.0);
                    for(int i=-1; i<=1; i++) {
                        for(int j=-1; j<=1; j++) {
                            avg += texture(u_prevCA, vUv + vec2(i,j)*texel);
                        }
                    }
                    avg /= 9.0;

                    // Gray-Scott Reaction Diffusion with spatially varying feed/kill
                    float f = 0.045 + vUv.y * 0.02;
                    float k = 0.060 + vUv.x * 0.01;
                    
                    float a = s.r;
                    float b = s.g;
                    float abb = a * b * b;
                    
                    float nextA = a + (1.0 * (avg.r - a) - abb + f * (1.0 - a));
                    float nextB = b + (0.5 * (avg.g - b) + abb - (k + f) * b);

                    // Keep it alive with noise pulses
                    if (hash(vUv + u_time) > 0.995) nextB += 0.1;

                    // Init
                    if (u_time < 0.5) {
                        nextA = 1.0;
                        nextB = (hash(vUv * 10.0) > 0.9) ? 1.0 : 0.0;
                    }

                    fragColor = vec4(clamp(nextA, 0.0, 1.0), clamp(nextB, 0.0, 1.0), 0.0, 1.0);
                }
            `
        });
        const meshCA = new THREE.Mesh(geometry, caMat);
        sceneCA.add(meshCA);

        // --- MAIN PASS (Dream Architecture, Op-Art, Datamosh, VHS) ---
        const mainMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_prevMain: { value: null },
                u_ca: { value: null },
                u_res: { value: new THREE.Vector2(grid.width, grid.height) },
                u_time: { value: 0 }
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
                uniform sampler2D u_prevMain;
                uniform sampler2D u_ca;
                uniform vec2 u_res;
                uniform float u_time;

                float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
                
                vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
                    return a + b * cos(6.28318 * (c * t + d));
                }

                float sdBox(vec2 p, vec2 b) {
                    vec2 d = abs(p) - b;
                    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
                }

                void main() {
                    vec2 p = (vUv - 0.5) * 2.0;
                    p.x *= u_res.x / u_res.y;
                    
                    vec4 ca = texture(u_ca, vUv);
                    float t = u_time * 0.3;

                    vec3 col = vec3(0.0);
                    
                    // Op-Art Radial Tunnel (Background)
                    float r = length(p);
                    float a = atan(p.y, p.x);
                    float spiral = sin(15.0 * log(r + 0.1) - a * 5.0 - t * 10.0);
                    float moire = sin(p.x * 40.0) * sin(p.y * 40.0 + t * 5.0);
                    float tunnel = mix(spiral, moire, ca.r);
                    
                    vec3 tunnelCol = palette(r * 1.5 - t + ca.g, vec3(0.5), vec3(0.5), vec3(1.0, 1.0, 0.5), vec3(0.8, 0.9, 0.3));
                    col = mix(tunnelCol * 0.5, tunnelCol * 1.2, step(0.0, tunnel));

                    // Impossible Browser Cathedral (Fractal Windows)
                    float depthMask = 0.0;
                    for(float i = 0.0; i < 4.0; i++) {
                        float scale = fract(t * 0.5 + i / 4.0);
                        float weight = smoothstep(0.0, 0.1, scale) * smoothstep(1.0, 0.8, scale);
                        vec2 sp = p / (scale * 2.5);
                        
                        float ang = sin(t * 0.5 + i) * 0.3;
                        mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
                        sp *= rot;

                        float dOuter = sdBox(sp, vec2(1.2, 0.8));
                        float dInner = sdBox(sp, vec2(1.1, 0.7));

                        if (dOuter < 0.0 && dInner > 0.0) {
                            // Window Frame
                            float bevel = step(0.8, sin((sp.x + sp.y) * 40.0));
                            vec3 frameCol = palette(i + t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
                            col = mix(col, frameCol * mix(0.6, 1.2, bevel), weight);
                            depthMask = scale;
                        } else if (dInner < 0.0) {
                            // Window Content: Early Internet Grid + Text Asemic
                            float grid = step(0.95, sin(sp.x * 30.0)) + step(0.95, sin(sp.y * 30.0));
                            float text = step(0.8, sin(sp.y * 80.0 + t * 10.0)) * step(0.2, sin(sp.x * 20.0 + hash(vec2(sp.y))*10.0));
                            vec3 contentCol = palette(length(sp) - t, vec3(0.6), vec3(0.5), vec3(1.0, 1.0, 0.5), vec3(0.8, 0.2, 0.5));
                            contentCol = mix(contentCol, vec3(1.0, 0.2, 0.6), grid);
                            contentCol = mix(contentCol, vec3(0.1, 0.9, 0.8), text * ca.r);
                            col = mix(col, contentCol, weight);
                            depthMask = scale;
                        }
                    }

                    // Datamosh & VHS Feedback
                    vec2 flow = (ca.rg - 0.5) * 0.015;
                    vec2 prevUv = vUv + flow;

                    // VHS Tracking Error & Head Switching
                    float track = smoothstep(0.95, 1.0, sin(vUv.y * 4.0 - t * 15.0));
                    prevUv.x += track * (hash(vec2(vUv.y * 100.0, t)) - 0.5) * 0.08;
                    if (vUv.y < 0.08) { // Head switching pulse at bottom
                        prevUv.x += sin(vUv.y * 200.0 + t * 50.0) * 0.05;
                    }

                    vec3 prevCol = texture(u_prevMain, prevUv).rgb;

                    // Datamosh Hold: freeze frame based on CA
                    float mosh = smoothstep(0.4, 0.7, ca.g + sin(t*2.0)*0.2);
                    col = mix(col, prevCol, mosh * 0.92);

                    fragColor = vec4(col, 1.0);
                }
            `
        });
        const meshMain = new THREE.Mesh(geometry, mainMat);
        sceneMain.add(meshMain);

        // --- POST PASS (OKLab Color Rules, Chromatic Aberration, Riso Halftone) ---
        const postMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_main: { value: null },
                u_res: { value: new THREE.Vector2(grid.width, grid.height) },
                u_time: { value: 0 }
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
                uniform sampler2D u_main;
                uniform vec2 u_res;
                uniform float u_time;

                // --- OKLab Conversions ---
                vec3 srgb_to_linear(vec3 c) {
                    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
                }
                vec3 linear_to_srgb(vec3 c) {
                    return mix(c * 12.92, 1.055 * pow(abs(c), vec3(1.0/2.4)) - 0.055, step(0.0031308, c));
                }
                vec3 linear_srgb_to_oklab(vec3 c) {
                    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
                    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
                    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
                    float l_ = pow(max(l, 0.0), 1.0/3.0);
                    float m_ = pow(max(m, 0.0), 1.0/3.0);
                    float s_ = pow(max(s, 0.0), 1.0/3.0);
                    return vec3(
                        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
                        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
                        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
                    );
                }
                vec3 oklab_to_linear_srgb(vec3 c) {
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

                // Halftone dot
                float halftone(vec2 uv, float lpi, float angle) {
                    float c = cos(angle), s = sin(angle);
                    vec2 rot = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
                    vec2 cell = fract(rot * lpi) - 0.5;
                    return 1.0 - smoothstep(0.2, 0.35, length(cell));
                }

                void main() {
                    // 1. Chromatic Aberration (Structural Edge Fringes)
                    vec2 dir = normalize(vUv - 0.5);
                    float dist = length(vUv - 0.5);
                    float shift = 0.008 * dist * (1.0 + sin(u_time * 2.0));
                    
                    float r = texture(u_main, vUv + dir * shift).r;
                    float g = texture(u_main, vUv).g;
                    float b = texture(u_main, vUv - dir * shift).b;
                    vec3 col = vec3(r, g, b);

                    // 2. Cross-Processing & Strict Palette Enforcement (OKLab)
                    vec3 lab = linear_srgb_to_oklab(srgb_to_linear(col));
                    
                    // ABSOLUTE COLOR RULES: No pure black, no pure white.
                    lab.x = mix(0.25, 0.85, clamp(lab.x, 0.0, 1.0)); 

                    // Ensure everything has chroma (no grayscale neutrals)
                    float C = length(lab.yz);
                    if (C < 0.15) {
                        lab.y += 0.15; // Push towards warm/magenta
                        lab.z -= 0.10; // Push towards blue
                    }

                    // Tone-dependent chemistry:
                    // Shadows -> Indigo / Plum / Deep Teal
                    float shadow = smoothstep(0.45, 0.25, lab.x);
                    lab.y += shadow * 0.12; // push magenta
                    lab.z -= shadow * 0.20; // push deep blue

                    // Highlights -> Acid Yellow / Neon Cyan / Hot Pink
                    float high = smoothstep(0.65, 0.85, lab.x);
                    lab.y -= high * 0.10; // push green/cyan
                    lab.z += high * 0.22; // push yellow

                    // Global saturation push
                    lab.yz *= 1.4;

                    col = linear_to_srgb(oklab_to_linear_srgb(lab));

                    // 3. Risograph Print Logic (Spot Color Overlaps)
                    // Apply fluorescent halftone overlays that multiply blend
                    float aspect = u_res.x / u_res.y;
                    vec2 hUv = vec2(vUv.x * aspect, vUv.y);
                    
                    float ht1 = halftone(hUv, 120.0, 0.785); // 45 deg
                    float ht2 = halftone(hUv + vec2(0.005), 120.0, 1.309); // 75 deg
                    
                    // Multiply blend with spot colors (Neon Cyan & Hot Pink)
                    vec3 spot1 = vec3(0.0, 1.0, 1.0); // Cyan
                    vec3 spot2 = vec3(1.0, 0.1, 0.6); // Hot Pink
                    
                    col *= mix(vec3(1.0), spot1, ht1 * 0.25);
                    col *= mix(vec3(1.0), spot2, ht2 * 0.25);

                    // Slight paper texture / CRT grain
                    float grain = fract(sin(dot(vUv, vec2(12.9898, 78.233)) + u_time) * 43758.5453);
                    col += (grain - 0.5) * 0.05;

                    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
                }
            `
        });
        const meshPost = new THREE.Mesh(geometry, postMat);
        scenePost.add(meshPost);

        canvas.__three = { 
            renderer, camera, sceneCA, sceneMain, scenePost, 
            caFBO1, caFBO2, mainFBO1, mainFBO2, 
            caMat, mainMat, postMat,
            pingpong: 0 
        };
    }

    const sys = canvas.__three;
    const timeSec = time;

    // Resize handling
    if (sys.renderer.getSize(new THREE.Vector2()).x !== grid.width) {
        sys.renderer.setSize(grid.width, grid.height, false);
        sys.caFBO1.setSize(grid.width, grid.height);
        sys.caFBO2.setSize(grid.width, grid.height);
        sys.mainFBO1.setSize(grid.width, grid.height);
        sys.mainFBO2.setSize(grid.width, grid.height);
        sys.caMat.uniforms.u_res.value.set(grid.width, grid.height);
        sys.mainMat.uniforms.u_res.value.set(grid.width, grid.height);
        sys.postMat.uniforms.u_res.value.set(grid.width, grid.height);
    }

    // Determine read/write buffers
    const caRead = sys.pingpong % 2 === 0 ? sys.caFBO1 : sys.caFBO2;
    const caWrite = sys.pingpong % 2 === 0 ? sys.caFBO2 : sys.caFBO1;
    const mainRead = sys.pingpong % 2 === 0 ? sys.mainFBO1 : sys.mainFBO2;
    const mainWrite = sys.pingpong % 2 === 0 ? sys.mainFBO2 : sys.mainFBO1;

    // 1. CA Pass
    sys.caMat.uniforms.u_prevCA.value = caRead.texture;
    sys.caMat.uniforms.u_time.value = timeSec;
    sys.renderer.setRenderTarget(caWrite);
    sys.renderer.render(sys.sceneCA, sys.camera);

    // 2. Main Pass
    sys.mainMat.uniforms.u_prevMain.value = mainRead.texture;
    sys.mainMat.uniforms.u_ca.value = caWrite.texture;
    sys.mainMat.uniforms.u_time.value = timeSec;
    sys.renderer.setRenderTarget(mainWrite);
    sys.renderer.render(sys.sceneMain, sys.camera);

    // 3. Post Pass (To Screen)
    sys.postMat.uniforms.u_main.value = mainWrite.texture;
    sys.postMat.uniforms.u_time.value = timeSec;
    sys.renderer.setRenderTarget(null);
    sys.renderer.render(sys.scenePost, sys.camera);

    sys.pingpong++;

} catch (e) {
    console.error("Prismatic Tape Oracle Initialization Failed:", e);
}