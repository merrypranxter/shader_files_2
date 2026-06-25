try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    // Initialize or retrieve Three.js state
    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: false, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        const sceneMain = new THREE.Scene();
        const scenePost = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Ping-pong buffers for optical memory / impossible color fatigue
        const rtOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType, // Float for HDR/fatigue math
            depthBuffer: false,
            stencilBuffer: false
        };
        const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
        const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

        // --- MAIN SHADER (Cathedral, Plasma, Birefringence, Glass Patterns) ---
        const mainMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
                u_click_seed: { value: 0 },
                u_prev: { value: null },
                u_palette: { value: 0 },
                u_glass: { value: 1 },
                u_symbols: { value: 1 },
                u_biref: { value: 1 }
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
                uniform vec2 u_resolution;
                uniform vec2 u_mouse;
                uniform float u_click_seed;
                uniform sampler2D u_prev;
                
                uniform float u_palette;
                uniform float u_glass;
                uniform float u_symbols;
                uniform float u_biref;

                #define PI 3.14159265359
                #define TAU 6.28318530718

                // --- PERCEPTUAL COLOR MATH (OKLab / Spectral) ---
                vec3 oklab_to_srgb(vec3 c) {
                    float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
                    float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
                    float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
                    float l = l_*l_*l_;
                    float m = m_*m_*m_;
                    float s = s_*s_*s_;
                    vec3 rgb = vec3(
                         4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                    );
                    vec3 srgb = mix(12.92*rgb, 1.055*pow(max(rgb, 0.0), vec3(1.0/2.4)) - 0.055, step(0.0031308, rgb));
                    return clamp(srgb, 0.0, 1.0);
                }

                // Generates extremely saturated, jewel/neon palettes (NO BLACK/WHITE)
                vec3 getPalette(float t) {
                    float p = mod(u_palette, 5.0);
                    vec3 c = vec3(0.0);
                    if (p < 0.5) { // Candy Prism
                        c = oklab_to_srgb(vec3(0.7, 0.2 * cos(t), 0.2 * sin(t)));
                    } else if (p < 1.5) { // Mineral Slide
                        c = oklab_to_srgb(vec3(0.65, 0.25 * sin(t*1.3), 0.25 * cos(t*0.8)));
                    } else if (p < 2.5) { // Neon Alchemy
                        c = oklab_to_srgb(vec3(0.75, 0.3 * cos(t*2.0), 0.3 * sin(t*1.5)));
                    } else if (p < 3.5) { // UV Aquarium
                        c = oklab_to_srgb(vec3(0.6, 0.15 * sin(t), -0.25 + 0.1*cos(t)));
                    } else { // Plasma Fruit
                        c = oklab_to_srgb(vec3(0.7, 0.25 * cos(t), 0.15 * sin(t*2.0)));
                    }
                    // Prevent dark/muddy or overly bright white
                    return clamp(c, vec3(0.1, 0.0, 0.2), vec3(0.95, 0.9, 1.0));
                }

                // Wavelength to RGB (Simplified for diffraction/birefringence)
                vec3 spectral(float w) {
                    float r = exp(-pow(w - 610.0, 2.0) / 1500.0);
                    float g = exp(-pow(w - 540.0, 2.0) / 1500.0);
                    float b = exp(-pow(w - 440.0, 2.0) / 1500.0);
                    return clamp(vec3(r, g, b) * 1.5, 0.0, 1.0);
                }

                // --- NOISE & SDFS ---
                vec2 hash2(vec2 p) {
                    p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
                    return -1.0 + 2.0*fract(sin(p)*43758.5453123);
                }
                
                float hash12(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p); vec2 f = fract(p);
                    vec2 u = f*f*(3.0-2.0*f);
                    return mix(mix(dot(hash2(i+vec2(0.0,0.0)), f-vec2(0.0,0.0)),
                                   dot(hash2(i+vec2(1.0,0.0)), f-vec2(1.0,0.0)), u.x),
                               mix(dot(hash2(i+vec2(0.0,1.0)), f-vec2(0.0,1.0)),
                                   dot(hash2(i+vec2(1.0,1.0)), f-vec2(1.0,1.0)), u.x), u.y);
                }

                float fbm(vec2 p) {
                    float f = 0.0, a = 0.5;
                    for(int i=0; i<5; i++) { f+=a*noise(p); p*=2.0; a*=0.5; }
                    return f;
                }

                float sdHexagram(vec2 p, float r) {
                    const vec3 k = vec3(-0.5, 0.8660254038, 0.5773502692);
                    p = abs(p);
                    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
                    p -= 2.0 * min(dot(vec2(k.y, -k.x), p), 0.0) * vec2(k.y, -k.x);
                    p -= vec2(clamp(p.x, r * k.z, r * k.y), r);
                    return length(p) * sign(p.y);
                }

                float sdMoon(vec2 p, float d, float ra, float rb) {
                    p.y = abs(p.y);
                    float a = (ra*ra - rb*rb + d*d)/(2.0*d);
                    float b = sqrt(max(ra*ra-a*a,0.0));
                    if(d*(p.x*b-p.y*a) > d*d*max(b-p.y,0.0))
                         return length(p-vec2(a,b));
                    return max( (length(p)-ra), -(length(p-vec2(d,0))-rb));
                }

                // --- MAIN RENDER ---
                void main() {
                    vec2 uv = vUv;
                    vec2 p = uv * 2.0 - 1.0;
                    p.x *= u_resolution.x / u_resolution.y;

                    // Mouse interaction: Space warping
                    vec2 m = u_mouse * 2.0 - 1.0;
                    m.x *= u_resolution.x / u_resolution.y;
                    float mDist = length(p - m);
                    p -= normalize(p - m) * 0.1 * exp(-mDist * 4.0) * sin(u_time * 2.0);

                    // 1. BASE FIELD (Saturated, no void)
                    float baseWarp = fbm(p * 2.0 + u_time * 0.2);
                    vec3 baseCol = getPalette(baseWarp * 3.0 + u_time * 0.1);

                    // 2. CATHEDRAL GEOMETRY (Polar folding)
                    vec2 cp = p;
                    float r = length(cp);
                    float a = atan(cp.y, cp.x);
                    
                    // Alchemical mandala folding
                    float folds = 8.0;
                    float aFold = mod(a + u_time * 0.05, TAU / folds) - PI / folds;
                    vec2 fp = r * vec2(cos(aFold), sin(aFold));
                    
                    // Central Cathedral SDF
                    float d1 = abs(length(fp - vec2(0.4, 0.0)) - 0.2) - 0.02; // Arches
                    float d2 = sdHexagram(cp * (1.0 + 0.2*sin(u_time)), 0.6); // Inner star
                    float d3 = abs(r - 0.8) - 0.05; // Outer ring
                    float dCath = min(min(d1, d2), d3);
                    
                    // Depth Map for Chromostereopsis (passed to alpha)
                    float vDepth = smoothstep(0.5, -0.5, dCath);

                    // 3. BIREFRINGENCE & PRISMS
                    vec3 optCol = baseCol;
                    if (u_biref > 0.5) {
                        // Michel-Lévy Retardance
                        float retardance = abs(dCath) * 3000.0 * (1.0 + 0.5*fbm(p*5.0));
                        vec3 biref = spectral(400.0 + mod(retardance, 300.0));
                        optCol = mix(optCol, biref, smoothstep(0.1, -0.05, dCath));
                    }
                    
                    // Diffraction Grating Fans
                    float grating = sin(r * 400.0 - u_time * 15.0) * sin(a * 40.0);
                    if (grating > 0.8) {
                        vec3 diffColor = spectral(mix(400.0, 700.0, fract(r * 5.0 + u_time)));
                        optCol = mix(optCol, diffColor, 0.6);
                    }

                    // 4. GLASS PATTERNS (Hidden Correlation)
                    if (u_glass > 0.5) {
                        vec2 grid = p * 150.0;
                        float dot1 = step(0.85, hash12(floor(grid)));
                        // Correlate dots where SDF is inside
                        vec2 warpGrid = mix(grid, grid + vec2(1.5, 0.5) * sin(u_time), smoothstep(0.1, -0.1, dCath));
                        float dot2 = step(0.85, hash12(floor(warpGrid)));
                        float glassMask = max(dot1, dot2);
                        // Glass dots act as simultaneous contrast vibrators
                        optCol = mix(optCol, getPalette(baseWarp + 1.5), glassMask * 0.4);
                    }

                    // 5. PLASMA FILAMENTS
                    float f = fbm(p * 4.0 - u_time * 0.4 + fbm(p * 8.0));
                    float plasma = 0.015 / (abs(dCath - f * 0.2) + 0.001);
                    vec3 plasmaCol = getPalette(f * 5.0 - u_time);
                    optCol += plasmaCol * clamp(plasma, 0.0, 1.0);

                    // 6. ALCHEMICAL SYMBOLS
                    if (u_symbols > 0.5) {
                        float dSym = sdMoon(fp - vec2(0.8, 0.0), 0.05, 0.08, 0.06);
                        dSym = min(dSym, length(fp - vec2(0.4, 0.0)) - 0.03); // Sun nodes
                        float symMask = smoothstep(0.01, 0.0, dSym);
                        float symGlow = exp(-dSym * 20.0);
                        vec3 symColor = getPalette(u_time * 2.0);
                        optCol = mix(optCol, symColor, symMask + symGlow * 0.5);
                    }
                    
                    // Click Seed (Impossible Color Bloom)
                    float seedDist = length(uv - u_mouse);
                    float seedRing = smoothstep(u_click_seed, u_click_seed - 0.05, seedDist) - smoothstep(u_click_seed - 0.05, u_click_seed - 0.1, seedDist);
                    if (u_click_seed > 0.0) {
                        optCol = mix(optCol, spectral(mix(700.0, 400.0, seedDist)), seedRing * exp(-u_click_seed*2.0));
                    }

                    // 7. FATIGUE / IMPOSSIBLE COLOR (Feedback)
                    vec3 prev = texture(u_prev, uv).rgb;
                    // Chimerical shift: gently rotate hue of previous frame and blend
                    // This creates glowing complementary afterimages without muddying to gray.
                    vec3 fatigue = oklab_to_srgb(vec3(0.7, -prev.g + 0.5, -prev.b + 0.5)); 
                    vec3 finalCol = mix(optCol, fatigue, 0.15); // Soft memory

                    // Ensure no absolute black/white
                    finalCol = clamp(finalCol, vec3(0.05, 0.0, 0.1), vec3(0.98, 0.95, 1.0));

                    fragColor = vec4(finalCol, vDepth);
                }
            `
        });

        // --- POST SHADER (Aberration, Bloom, Chromostereopsis) ---
        const postMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_scene: { value: null },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_depth_shift: { value: 1 }
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
                uniform sampler2D u_scene;
                uniform vec2 u_resolution;
                uniform float u_depth_shift;

                void main() {
                    vec2 uv = vUv;
                    vec4 sceneData = texture(u_scene, uv);
                    vec3 col = sceneData.rgb;
                    float depth = sceneData.a; // Extracted from Cathedral SDF

                    // 1. Chromostereopsis (Red/Blue depth shifting)
                    if (u_depth_shift > 0.5) {
                        vec2 stereoOffset = vec2(0.006 * depth, 0.0);
                        float r = texture(u_scene, uv + stereoOffset).r;
                        float b = texture(u_scene, uv - stereoOffset).b;
                        col.r = r;
                        col.b = b;
                    }

                    // 2. Chromatic Aberration at high-energy edges
                    vec2 texel = 1.0 / u_resolution;
                    float lum = dot(col, vec3(0.299, 0.587, 0.114));
                    float lumR = dot(texture(u_scene, uv + vec2(texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
                    float lumU = dot(texture(u_scene, uv + vec2(0.0, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
                    vec2 grad = vec2(lumR - lum, lumU - lum);
                    float edge = length(grad);
                    
                    if (edge > 0.05) {
                        vec2 caDir = normalize(grad) * texel * 3.0;
                        col.r = texture(u_scene, uv + caDir).r;
                        col.b = texture(u_scene, uv - caDir).b;
                    }

                    // 3. Colored Bloom
                    vec3 bloom = vec3(0.0);
                    float wSum = 0.0;
                    for(int i=-3; i<=3; i++) {
                        for(int j=-3; j<=3; j++) {
                            vec2 off = vec2(float(i), float(j)) * texel * 2.0;
                            vec3 samp = texture(u_scene, uv + off).rgb;
                            float w = max(samp.r, max(samp.g, samp.b));
                            bloom += samp * (w * w);
                            wSum += (w * w);
                        }
                    }
                    if(wSum > 0.0) col += (bloom / wSum) * 0.3;

                    // 4. Dithering to preserve rich gradients
                    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 0.04 - 0.02;
                    col += dither;

                    // Jewel-toned shadows enforcement
                    col = max(col, vec3(0.1, 0.0, 0.2));

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mainMaterial);
        sceneMain.add(quad);

        const quadPost = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial);
        scenePost.add(quadPost);

        // State & Interaction tracking
        const state = {
            targetMouse: new THREE.Vector2(0.5, 0.5),
            clickSeed: 0,
            palette: 0,
            glass: 1,
            symbols: 1,
            depth: 1,
            biref: 1
        };

        // Attach event listeners to window/canvas
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (key === 'c') state.palette = (state.palette + 1) % 5;
            if (key === 'g') state.glass = state.glass > 0.5 ? 0 : 1;
            if (key === 'a') state.symbols = state.symbols > 0.5 ? 0 : 1;
            if (key === 'd') state.depth = state.depth > 0.5 ? 0 : 1;
            if (key === 'b') state.biref = state.biref > 0.5 ? 0 : 1;
        });

        canvas.addEventListener('pointermove', (e) => {
            const rect = canvas.getBoundingClientRect();
            state.targetMouse.x = (e.clientX - rect.left) / rect.width;
            state.targetMouse.y = 1.0 - (e.clientY - rect.top) / rect.height;
        });

        canvas.addEventListener('pointerdown', () => {
            state.clickSeed = 0.01; // Start ripple
        });

        canvas.__three = { renderer, sceneMain, scenePost, camera, rtA, rtB, mainMaterial, postMaterial, state };
    }

    const { renderer, sceneMain, scenePost, camera, rtA, rtB, mainMaterial, postMaterial, state } = canvas.__three;

    // Update dimensions safely
    if (renderer.getSize(new THREE.Vector2()).x !== grid.width || renderer.getSize(new THREE.Vector2()).y !== grid.height) {
        renderer.setSize(grid.width, grid.height, false);
        rtA.setSize(grid.width, grid.height);
        rtB.setSize(grid.width, grid.height);
        mainMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
        postMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
    }

    // Smooth interaction updates
    mainMaterial.uniforms.u_mouse.value.lerp(state.targetMouse, 0.05);
    
    if (state.clickSeed > 0.0) {
        state.clickSeed += 0.02; // Expand ripple
        if (state.clickSeed > 1.5) state.clickSeed = 0.0;
    }

    // Update Uniforms
    mainMaterial.uniforms.u_time.value = time;
    mainMaterial.uniforms.u_click_seed.value = state.clickSeed;
    mainMaterial.uniforms.u_palette.value = state.palette;
    mainMaterial.uniforms.u_glass.value = state.glass;
    mainMaterial.uniforms.u_symbols.value = state.symbols;
    mainMaterial.uniforms.u_biref.value = state.biref;
    postMaterial.uniforms.u_depth_shift.value = state.depth;

    // PING PONG PASS
    // 1. Render Main Scene (reading rtB) into rtA
    mainMaterial.uniforms.u_prev.value = rtB.texture;
    renderer.setRenderTarget(rtA);
    renderer.render(sceneMain, camera);

    // 2. Render Post Scene (reading rtA) to Screen
    postMaterial.uniforms.u_scene.value = rtA.texture;
    renderer.setRenderTarget(null);
    renderer.render(scenePost, camera);

    // 3. Swap buffers for next frame's memory
    const temp = canvas.__three.rtA;
    canvas.__three.rtA = canvas.__three.rtB;
    canvas.__three.rtB = temp;

} catch (e) {
    console.error("Chimeric Prism Cathedral rendering failed:", e);
}