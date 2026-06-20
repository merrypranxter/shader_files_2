try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.setPixelRatio(1.0);

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const rtOpts = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            depthBuffer: false,
            wrapS: THREE.RepeatWrapping,
            wrapT: THREE.RepeatWrapping
        };
        
        const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);

        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_prev: { value: rtA.texture }
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

                uniform float u_time;
                uniform vec2 u_resolution;
                uniform sampler2D u_prev;

                // --- NOISE & MATH ---
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }
                
                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(
                        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
                        f.y
                    );
                }
                
                mat2 rot(float a) {
                    float s = sin(a), c = cos(a);
                    return mat2(c, -s, s, c);
                }

                // --- OKLAB PERCEPTUAL COLOR CHEMISTRY ---
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

                vec3 getColor(float v) {
                    v = fract(v);
                    // Absolute Color Rules: Saturated Shadows to Luminous Highlights
                    vec3 c0 = vec3(0.30,  0.10, -0.15);  // Indigo Shadow
                    vec3 c1 = vec3(0.70,  0.25, -0.05);  // Hot Pink
                    vec3 c2 = vec3(0.85, -0.10,  0.15);  // Acid Yellow
                    vec3 c3 = vec3(0.80, -0.15, -0.10);  // Neon Cyan
                    vec3 c4 = vec3(0.35, -0.15, -0.05);  // Peacock Green Shadow

                    float idx = v * 5.0;
                    float i = floor(idx);
                    float f = smoothstep(0.0, 1.0, fract(idx));

                    vec3 lab;
                    if (i == 0.0) lab = mix(c0, c1, f);
                    else if (i == 1.0) lab = mix(c1, c2, f);
                    else if (i == 2.0) lab = mix(c2, c3, f);
                    else if (i == 3.0) lab = mix(c3, c4, f);
                    else lab = mix(c4, c0, f);

                    // Clamp to prevent any pure black or pure white
                    return clamp(oklab_to_linear_srgb(lab), 0.02, 0.98); 
                }

                // --- SDF ARCHITECTURE ---
                float sdBox(vec2 p, vec2 b) {
                    vec2 d = abs(p) - b;
                    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
                }

                void main() {
                    vec2 uv = vUv;
                    vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);

                    // --- CELLULAR AUTOMATA (WET ENGINE LOGIC) ---
                    vec2 texel = 1.0 / u_resolution;
                    float me = texture(u_prev, uv).a;
                    float sum = 0.0;
                    sum += texture(u_prev, uv + vec2(-1,-1)*texel).a;
                    sum += texture(u_prev, uv + vec2( 0,-1)*texel).a;
                    sum += texture(u_prev, uv + vec2( 1,-1)*texel).a;
                    sum += texture(u_prev, uv + vec2(-1, 0)*texel).a;
                    sum += texture(u_prev, uv + vec2( 1, 0)*texel).a;
                    sum += texture(u_prev, uv + vec2(-1, 1)*texel).a;
                    sum += texture(u_prev, uv + vec2( 0, 1)*texel).a;
                    sum += texture(u_prev, uv + vec2( 1, 1)*texel).a;
                    
                    float avg = sum / 8.0;
                    // Continuous growth rule (Dream-Physics Mitosis)
                    float growth = smoothstep(0.15, 0.3, avg) - smoothstep(0.3, 0.45, avg);
                    float next_ca = clamp(me + (growth * 2.0 - 1.0) * 0.15, 0.0, 1.0);

                    // --- 2.5D DREAM PHYSICS ARCHITECTURE & OP-ART ---
                    vec3 sceneColor = getColor(u_time * 0.02 + length(p));
                    float sceneCA = 0.0;

                    for (float i = 6.0; i >= 1.0; i -= 1.0) {
                        float z = i - fract(u_time * 0.25);
                        float scale = 1.0 / z;
                        vec2 q = p * scale;
                        
                        // Mnemonic Gravity Warping
                        q *= rot(z * 0.2 + u_time * 0.05); 

                        // 1. Central Oracle (Op-Art Interference Rings)
                        float dOracle = length(q) - 0.5;
                        float opArt = sin(dOracle * 80.0 - u_time * 12.0) * sin(q.x * 40.0 + u_time) * sin(q.y * 40.0 - u_time);
                        float oracleMask = smoothstep(0.03*scale, 0.0, dOracle) * step(0.0, opArt);
                        
                        // Structural Color Iridescence Phase
                        float irid = sin(dOracle * 15.0 - u_time * 3.0);
                        
                        if (oracleMask > 0.0) {
                            sceneColor = getColor(z * 0.15 + irid * 0.2 + u_time * 0.1);
                            sceneCA += 0.8 * oracleMask;
                        }

                        // 2. Early-Internet Browser Fragments
                        vec2 bq = q;
                        bq.x = mod(bq.x + 0.8, 1.6) - 0.8;
                        bq.y = mod(bq.y + 0.8, 1.6) - 0.8;
                        bq += vec2(sin(z + u_time), cos(z * 1.3)) * 0.25; // Floating
                        
                        float dBox = sdBox(bq, vec2(0.25, 0.15));
                        float dTitle = sdBox(bq - vec2(0.0, 0.12), vec2(0.23, 0.015));
                        
                        float boxMask = smoothstep(0.02*scale, 0.0, abs(dBox) - 0.005);
                        float titleMask = smoothstep(0.01*scale, 0.0, dTitle);
                        
                        if (boxMask > 0.0 || titleMask > 0.0) {
                            sceneColor = getColor(z * 0.3 + (boxMask > 0.0 ? 0.6 : 0.9));
                            sceneCA += 0.6 * max(boxMask, titleMask);
                        }
                    }

                    // --- DAMAGE AESTHETICS: Dropout Streaks ---
                    float dropout = step(0.98, noise(vec2(uv.y * 50.0, u_time * 10.0))) * noise(vec2(uv.x * 10.0, u_time));
                    if (dropout > 0.5) {
                        sceneColor = getColor(u_time + uv.x); // Colored scars, never white
                        sceneCA += 0.9;
                    }

                    // Inject scene CA into state and decay
                    next_ca = max(next_ca, sceneCA * 0.6);
                    next_ca *= 0.96; // Memory fade

                    // --- DATAMOSH & VHS TAPE MEMORY ---
                    vec2 motionVec = vec2(
                        noise(uv * 6.0 + u_time) - 0.5,
                        noise(uv * 6.0 - u_time + 100.0) - 0.5
                    ) * next_ca * 0.05;

                    // Tape Tracking & Head Switching
                    float trackY = 0.5 + 0.4 * sin(u_time * 0.3);
                    float tracking = smoothstep(0.2, 0.0, abs(uv.y - trackY)) * noise(vec2(u_time * 40.0, uv.y * 100.0)) * 0.04;
                    float headSwitch = step(uv.y, 0.06) * noise(vec2(u_time * 50.0, uv.y * 200.0)) * 0.06;
                    
                    vec2 moshed_uv = fract(uv - motionVec + vec2(tracking + headSwitch, 0.0));

                    // Chroma Bleed (Analog Video Failure)
                    float bleed = 0.01 * (1.0 + next_ca);
                    vec3 prevColor;
                    prevColor.r = texture(u_prev, fract(moshed_uv + vec2(bleed, 0.0))).r;
                    prevColor.g = texture(u_prev, moshed_uv).g;
                    prevColor.b = texture(u_prev, fract(moshed_uv - vec2(bleed, 0.0))).b;

                    // --- COMPOSITING & RISOGRAPH PRINT LOGIC ---
                    // Ghost Story Temporal Echoes
                    float blendFactor = 0.88 - next_ca * 0.35; 
                    vec3 final_rgb = mix(sceneColor, prevColor, clamp(blendFactor, 0.0, 1.0));

                    // Riso Halftone Texture & Multiply Blend
                    float lpi = 130.0;
                    float angle = 0.785398; // 45 deg
                    vec2 rotUV = vec2(uv.x * cos(angle) - uv.y * sin(angle), uv.x * sin(angle) + uv.y * cos(angle));
                    vec2 dotUV = fract(rotUV * lpi) - 0.5;
                    float dotPattern = smoothstep(0.35, 0.0, length(dotUV));
                    
                    // Multiply blend with a saturated "paper" base to avoid neutrals
                    vec3 paper = getColor(0.0); 
                    final_rgb = mix(final_rgb, final_rgb * paper * 2.2, dotPattern * 0.5 * next_ca);

                    // Colored Static (No Grayscale Noise)
                    vec3 coloredStatic = getColor(noise(uv * 400.0 + u_time * 2.0));
                    float staticMask = step(0.92, hash(uv + u_time)) * next_ca;
                    final_rgb = mix(final_rgb, coloredStatic, staticMask);

                    fragColor = vec4(final_rgb, next_ca);
                }
            `
        });

        const copyMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_tex: { value: rtB.texture }
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
                uniform sampler2D u_tex;
                out vec4 fragColor;
                void main() {
                    vec3 c = texture(u_tex, vUv).rgb;
                    
                    // Cross-Processing S-Curve for intense chemical reaction
                    c = c * c * (3.0 - 2.0 * c);
                    
                    // Linear to sRGB conversion
                    c = mix(12.92 * c, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c));
                    
                    fragColor = vec4(c, 1.0);
                }
            `
        });

        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        scene.add(quad);

        canvas.__three = { renderer, scene, camera, material, copyMaterial, rtA, rtB, quad };
    }

    const t = canvas.__three;
    t.renderer.setSize(grid.width, grid.height, false);
    t.material.uniforms.u_time.value = time;
    t.material.uniforms.u_resolution.value.set(grid.width, grid.height);

    // Pass 1: Render Dream Physics & Automata to Buffer B (Reading Buffer A)
    t.material.uniforms.u_prev.value = t.rtA.texture;
    t.quad.material = t.material;
    t.renderer.setRenderTarget(t.rtB);
    t.renderer.render(t.scene, t.camera);

    // Pass 2: Output Buffer B to Screen with Cross-Processing
    t.copyMaterial.uniforms.u_tex.value = t.rtB.texture;
    t.quad.material = t.copyMaterial;
    t.renderer.setRenderTarget(null);
    t.renderer.render(t.scene, t.camera);

    // Ping-Pong Swap
    const temp = t.rtA;
    t.rtA = t.rtB;
    t.rtB = temp;

} catch (e) {
    console.error("Prismatic Tape Oracle initialization failed:", e);
}