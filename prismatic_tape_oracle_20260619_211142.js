try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.setPixelRatio(1.0); // Keep it sharp and feral

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Ping-Pong FBOs for Datamosh / Cellular Automata Memory
        const fboOpts = {
            type: THREE.FloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            wrapS: THREE.RepeatWrapping,
            wrapT: THREE.RepeatWrapping
        };
        const fboA = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOpts);
        const fboB = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOpts);

        // --- THE ORACLE ENGINE (BUFFER SHADER) ---
        // Handles Dream Physics, Op-Art, Cellular Automata, and Datamosh
        const bufferMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_history: { value: null }
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

                uniform float u_time;
                uniform vec2 u_resolution;
                uniform sampler2D u_history;

                // Feral Hash & Noise
                float hash(vec2 p) {
                    p = fract(p * vec2(127.1, 311.7));
                    p += dot(p, p + 45.32);
                    return fract(p.x * p.y);
                }
                
                vec2 hash2(vec2 p) {
                    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
                }

                // SDFs for Impossible Space
                float sdBox(vec2 p, vec2 b) {
                    vec2 d = abs(p) - b;
                    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
                }

                // Structural Color Palette (Cos)
                vec3 structColor(float t) {
                    vec3 a = vec3(0.5, 0.5, 0.5);
                    vec3 b = vec3(0.5, 0.5, 0.5);
                    vec3 c = vec3(1.0, 1.0, 1.0);
                    vec3 d = vec3(0.0, 0.33, 0.67);
                    return a + b * cos(6.28318 * (c * t + d));
                }

                void main() {
                    vec2 uv = vUv;
                    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
                    vec2 p = (uv - 0.5) * aspect;

                    // 1. VHS Tape Wobble & Tracking Error
                    float wobble = sin(uv.y * 50.0 + u_time * 10.0) * 0.002 * noise(vec2(u_time * 5.0, uv.y * 2.0));
                    if (fract(u_time * 0.2) < 0.1 && abs(uv.y - fract(u_time * 0.5)) < 0.05) {
                        wobble += (hash(uv * u_time) - 0.5) * 0.05; // Horizontal tearing
                    }
                    vec2 wobbled_uv = fract(uv + vec2(wobble, 0.0));

                    // 2. Cellular Automata Intelligence (Read History)
                    vec2 texel = 1.0 / u_resolution;
                    float ca_sum = 0.0;
                    for(int x = -1; x <= 1; x++) {
                        for(int y = -1; y <= 1; y++) {
                            if(x == 0 && y == 0) continue;
                            ca_sum += texture(u_history, wobbled_uv + vec2(x, y) * texel).g; // Use Green channel for CA state
                        }
                    }
                    vec4 hist = texture(u_history, wobbled_uv);
                    float ca_state = hist.g;
                    // B3/S23 continuous approximation
                    float next_ca = ca_state + 0.15 * (smoothstep(2.5, 3.5, ca_sum) - smoothstep(3.5, 4.5, ca_sum) - ca_state);
                    next_ca = clamp(next_ca, 0.0, 1.0);

                    // 3. Datamosh Motion Vector Engine
                    vec2 mv = vec2(
                        noise(p * 3.0 + u_time * 0.5) - 0.5,
                        noise(p * 3.0 - u_time * 0.4 + 10.0) - 0.5
                    ) * 0.02 * (1.0 + ca_state); // CA controls datamosh speed
                    
                    vec4 moshed_hist = texture(u_history, fract(wobbled_uv - mv));

                    // 4. Dream-Physics Architecture & Op-Art
                    float oracle_sdf = length(p) - 0.25 + 0.05 * sin(atan(p.y, p.x) * 8.0 + u_time * 2.0);
                    float radial_op = sin(log(length(p) + 0.01) * 40.0 - u_time * 8.0);
                    
                    vec2 panel_p = fract(p * 2.0 + vec2(u_time * 0.1, -u_time * 0.05)) - 0.5;
                    float panel_sdf = sdBox(panel_p, vec2(0.3)) - 0.05;

                    vec3 sceneColor = vec3(0.0);
                    float new_structure = 0.0;

                    // Central Oracle Portal
                    if (oracle_sdf < 0.0) {
                        new_structure = 1.0;
                        sceneColor = structColor(radial_op * 0.5 + u_time * 0.2);
                        sceneColor *= smoothstep(0.0, 0.1, abs(radial_op)); // Moiré ridges
                    } 
                    // Floating Interface Panels
                    else if (panel_sdf < 0.0 && noise(p * 10.0 + u_time) > 0.4) {
                        new_structure = 1.0;
                        float structural_thickness = abs(panel_sdf) * 50.0;
                        sceneColor = structColor(structural_thickness - u_time);
                        // Early internet window bevels
                        if (abs(panel_sdf) < 0.02) sceneColor = vec3(1.0); 
                    }

                    // 5. Synthesis: Mix Memory with New Architecture
                    vec3 final_rgb;
                    if (new_structure > 0.5) {
                        final_rgb = mix(sceneColor, moshed_hist.rgb, 0.2); // Retain slight memory
                    } else {
                        // Decay and mutate the datamosh void
                        final_rgb = moshed_hist.rgb * 0.98 + vec3(0.01); 
                        final_rgb += next_ca * structColor(u_time * 0.1) * 0.05; // CA blooms color
                    }

                    fragColor = vec4(final_rgb.r, next_ca, final_rgb.b, 1.0);
                }
            `
        });

        // --- THE PRINT & DAMAGE POST-PROCESS (DISPLAY SHADER) ---
        // Enforces Absolute Color Rules, Risograph Halftoning, and Chromatic Aberration
        const displayMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_texture: { value: null }
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

                uniform float u_time;
                uniform vec2 u_resolution;
                uniform sampler2D u_texture;

                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                }

                // Perceptual Luminance
                float getLuma(vec3 c) {
                    return dot(c, vec3(0.2126, 0.7152, 0.0722));
                }

                // ABSOLUTE COLOR LAW ENFORCER
                // Maps any luminance value to a strictly saturated, non-neutral palette.
                vec3 applyColorLaws(float lum, vec2 uv) {
                    // Allowed Shadows (Indigo, Plum, Petrol, Deep Teal)
                    vec3 shadow1 = vec3(0.10, 0.04, 0.25); // Indigo/Plum
                    vec3 shadow2 = vec3(0.02, 0.16, 0.22); // Petrol/Teal
                    vec3 shadow = mix(shadow1, shadow2, sin(uv.x * 10.0 + u_time) * 0.5 + 0.5);

                    // Allowed Midtones (Magenta, Chartreuse, Electric Blue, Coral)
                    vec3 mid1 = vec3(0.9, 0.1, 0.5); // Hot Pink / Magenta
                    vec3 mid2 = vec3(0.2, 0.8, 0.9); // Electric Cyan
                    vec3 mid = mix(mid1, mid2, cos(uv.y * 10.0 - u_time) * 0.5 + 0.5);

                    // Allowed Highlights (Acid Yellow, Neon Cyan, Fluorescent Orange)
                    vec3 high1 = vec3(0.95, 1.0, 0.0); // Acid Yellow
                    vec3 high2 = vec3(1.0, 0.4, 0.1);  // Fluo Orange
                    vec3 high = mix(high1, high2, sin((uv.x + uv.y) * 5.0) * 0.5 + 0.5);

                    // Cross-Processing Tone Mapping
                    vec3 color;
                    if (lum < 0.4) {
                        color = mix(shadow, mid, smoothstep(0.0, 0.4, lum));
                    } else {
                        color = mix(mid, high, smoothstep(0.4, 1.0, lum));
                    }

                    // Force extreme saturation (Kill any accidental grays)
                    float maxC = max(max(color.r, color.g), color.b);
                    float minC = min(min(color.r, color.g), color.b);
                    if (maxC - minC < 0.3) {
                        color = mix(color, mid, 0.6); // Push back to vivid midtone
                    }

                    return color;
                }

                // Risograph Halftone Screen
                float halftone(vec2 uv, float lpi, float angle) {
                    float s = sin(angle), c = cos(angle);
                    vec2 rotUV = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
                    vec2 grid = fract(rotUV * lpi) - 0.5;
                    return 1.0 - length(grid) * 2.0; // Circular dot
                }

                void main() {
                    vec2 uv = vUv;

                    // Chromatic Aberration (Spectral Edge Separation)
                    float ca_offset = 0.008 * (1.0 + sin(u_time * 2.0));
                    vec2 dir = normalize(uv - 0.5);
                    
                    float r = texture(u_texture, uv + dir * ca_offset).r;
                    float g = texture(u_texture, uv).g;
                    float b = texture(u_texture, uv - dir * ca_offset).b;
                    
                    vec3 rawColor = vec3(r, g, b);
                    float lum = getLuma(rawColor);

                    // Enforce Absolute Color Rules (Cross-Processing Engine)
                    vec3 legalColor = applyColorLaws(lum, uv);

                    // Risograph Logic (Misregistered Overlaps)
                    float lpi = 120.0;
                    float h_cyan = halftone(uv + vec2(0.002, 0.0), lpi, 0.261); // 15 deg
                    float h_pink = halftone(uv - vec2(0.002, 0.001), lpi, 1.309); // 75 deg
                    float h_yell = halftone(uv, lpi, 0.0); // 0 deg

                    // Simulate ink multiplication (subtractive blend over the legal color base)
                    // We use the halftone dots to modulate the intensity and create optical mixing
                    vec3 risoTint = vec3(1.0);
                    risoTint *= mix(vec3(1.0), vec3(0.0, 1.0, 1.0), smoothstep(0.2, 0.5, h_cyan * lum));
                    risoTint *= mix(vec3(1.0), vec3(1.0, 0.0, 0.6), smoothstep(0.3, 0.6, h_pink * lum));
                    risoTint *= mix(vec3(1.0), vec3(1.0, 1.0, 0.0), smoothstep(0.4, 0.7, h_yell * lum));

                    // Combine the structural dream-color with the risograph texture
                    vec3 finalColor = legalColor * risoTint;

                    // Ensure NO PURE BLACK OR WHITE escapes
                    finalColor = clamp(finalColor, 0.05, 0.95);
                    
                    // Add saturated colored noise (no grayscale noise)
                    vec3 coloredNoise = vec3(
                        hash(uv + u_time),
                        hash(uv + u_time * 1.1),
                        hash(uv + u_time * 1.2)
                    );
                    finalColor = mix(finalColor, applyColorLaws(coloredNoise.r, uv), 0.08);

                    fragColor = vec4(finalColor, 1.0);
                }
            `
        });

        const quadGeo = new THREE.PlaneGeometry(2, 2);
        
        // Two meshes: one for ping-pong buffering, one for screen display
        const pingpongMesh = new THREE.Mesh(quadGeo, bufferMat);
        const displayMesh = new THREE.Mesh(quadGeo, displayMat);
        
        scene.add(pingpongMesh);
        scene.add(displayMesh);

        canvas.__three = { renderer, scene, camera, bufferMat, displayMat, fboA, fboB, pingpongMesh, displayMesh, pingpong: 0 };
    }

    const { renderer, scene, camera, bufferMat, displayMat, fboA, fboB, pingpongMesh, displayMesh } = canvas.__three;

    // Handle Resize
    if (renderer.domElement.width !== grid.width || renderer.domElement.height !== grid.height) {
        renderer.setSize(grid.width, grid.height, false);
        fboA.setSize(grid.width, grid.height);
        fboB.setSize(grid.width, grid.height);
        bufferMat.uniforms.u_resolution.value.set(grid.width, grid.height);
        displayMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    }

    // Ping-Pong Logic (The Feral Memory Loop)
    const currentFBO = canvas.__three.pingpong % 2 === 0 ? fboA : fboB;
    const nextFBO = canvas.__three.pingpong % 2 === 0 ? fboB : fboA;

    // PASS 1: Oracle Engine (Buffer)
    bufferMat.uniforms.u_time.value = time;
    bufferMat.uniforms.u_history.value = currentFBO.texture;
    
    pingpongMesh.visible = true;
    displayMesh.visible = false;
    renderer.setRenderTarget(nextFBO);
    renderer.render(scene, camera);

    // PASS 2: Print & Damage (Screen)
    displayMat.uniforms.u_time.value = time;
    displayMat.uniforms.u_texture.value = nextFBO.texture;

    pingpongMesh.visible = false;
    displayMesh.visible = true;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    // Advance generation
    canvas.__three.pingpong++;

} catch (e) {
    console.error("Prismatic Tape Oracle Initialization Failed:", e);
}