try {
    if (!ctx) throw new Error("WebGL context not available");

    // Initialize Three.js if not already present on the canvas
    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.setPixelRatio(1);
        renderer.autoClear = false;

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Resolution for the Sandpile/WFC Grid (keeps tiles square)
        const simResX = 128;
        const simResY = Math.max(1, Math.floor(128 * grid.height / grid.width));

        // Render Targets
        const rtOpts = { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false };
        const rtLinear = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };

        const targets = {
            simA: new THREE.WebGLRenderTarget(simResX, simResY, rtOpts),
            simB: new THREE.WebGLRenderTarget(simResX, simResY, rtOpts),
            renderA: new THREE.WebGLRenderTarget(grid.width, grid.height, rtLinear),
            renderB: new THREE.WebGLRenderTarget(grid.width, grid.height, rtLinear),
            afterA: new THREE.WebGLRenderTarget(grid.width, grid.height, rtLinear),
            afterB: new THREE.WebGLRenderTarget(grid.width, grid.height, rtLinear)
        };

        // Shared OKLab & Color Math
        const oklabGLSL = `
            vec3 oklch_to_oklab(vec3 lch) {
                return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
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
            vec3 linear_to_srgb(vec3 c) {
                vec3 a = 12.92 * c;
                vec3 b = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0/2.4)) - 0.055;
                return mix(a, b, step(0.0031308, c));
            }
            vec3 oklch_to_srgb(vec3 lch) {
                return linear_to_srgb(oklab_to_linear_srgb(oklch_to_oklab(lch)));
            }
        `;

        // 1. Simulation Shader: Abelian Sandpile + WFC Entropy
        const simMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                uState: { value: null },
                uGridSize: { value: new THREE.Vector2(simResX, simResY) },
                uMouse: { value: new THREE.Vector2() },
                uMouseDrag: { value: 0 },
                uClick: { value: 0 },
                uSeed: { value: 1 }, // Start with a seed explosion
                uTime: { value: 0 }
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
                
                uniform sampler2D uState;
                uniform vec2 uGridSize;
                uniform vec2 uMouse;
                uniform float uMouseDrag;
                uniform float uClick;
                uniform float uSeed;
                uniform float uTime;
                
                float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
                
                void main() {
                    vec2 texel = 1.0 / uGridSize;
                    vec4 state = texture(uState, vUv);
                    
                    // State: R = grains, G = tile hash, B = age/entropy, A = heat
                    float grains = state.r;
                    float type = state.g;
                    float age = state.b + 0.02; // Age increases
                    float heat = state.a * 0.96; // Heat dissipates
                    
                    // Abelian Sandpile Logic
                    float topples = floor(grains / 4.0);
                    grains -= topples * 4.0;
                    
                    grains += floor(texture(uState, vUv + vec2(0.0, texel.y)).r / 4.0);
                    grains += floor(texture(uState, vUv - vec2(0.0, texel.y)).r / 4.0);
                    grains += floor(texture(uState, vUv + vec2(texel.x, 0.0)).r / 4.0);
                    grains += floor(texture(uState, vUv - vec2(texel.x, 0.0)).r / 4.0);
                    
                    // Interaction
                    float d = length(vUv - uMouse);
                    if (uMouseDrag > 0.5 && d < 0.04) {
                        grains += 2.0;
                        heat = 1.0;
                        age = 0.0;
                    }
                    if (uClick > 0.5 && d < 0.08) {
                        grains += 50.0; // Comet drop
                        heat = 1.0;
                        age = 0.0;
                    }
                    
                    // WFC Collapse & Reseed
                    if (age > 15.0 || uSeed > 0.5) {
                        age = fract(hash(vUv + uTime));
                        type = hash(vUv + age * 13.37);
                        if (uSeed > 0.5) {
                            grains += hash(vUv + 2.0) * 12.0;
                            heat = 1.0;
                        }
                    }
                    
                    if (topples > 0.0) heat = 1.0;
                    
                    fragColor = vec4(grains, type, age, min(heat, 1.0));
                }
            `
        });

        // 2. Render Shader: Translates WFC + Sandpile to Spectral Stained Glass
        const renderMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                uSim: { value: null },
                uGridSize: { value: new THREE.Vector2(simResX, simResY) },
                uTime: { value: 0 },
                uPalette: { value: 0 },
                uGeomantic: { value: 1 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                ${oklabGLSL}
                in vec2 vUv;
                out vec4 fragColor;
                
                uniform sampler2D uSim;
                uniform vec2 uGridSize;
                uniform float uTime;
                uniform int uPalette;
                uniform float uGeomantic;
                
                void main() {
                    vec2 gridUV = vUv * uGridSize;
                    vec2 cellId = floor(gridUV);
                    vec2 cellUv = fract(gridUV);
                    vec2 cuv = cellUv * 2.0 - 1.0;
                    
                    vec4 state = texture(uSim, (cellId + 0.5) / uGridSize);
                    float grains = state.r;
                    float type = state.g;
                    float age = state.b;
                    float heat = state.a;
                    
                    // Procedural SDFs for Tile Shapes
                    float d = 1.0;
                    if (type < 0.25) { // Truchet A
                        d = min(abs(length(cuv - vec2(1.0)) - 1.0), abs(length(cuv - vec2(-1.0)) - 1.0)) - 0.25;
                    } else if (type < 0.5) { // Truchet B
                        d = min(abs(length(cuv - vec2(1.0, -1.0)) - 1.0), abs(length(cuv - vec2(-1.0, 1.0)) - 1.0)) - 0.25;
                    } else if (type < 0.75 && uGeomantic > 0.5) { // Geomantic Dots
                        float row = floor((cuv.y + 1.0) * 2.0);
                        float rowHash = fract(type * 13.37 + row * 1.1);
                        float ypos = (row / 1.5) - 0.75;
                        if (rowHash > 0.5) {
                            d = min(length(cuv - vec2(-0.4, ypos)), length(cuv - vec2(0.4, ypos))) - 0.15;
                        } else {
                            d = length(cuv - vec2(0.0, ypos)) - 0.15;
                        }
                    } else { // Circuit Pads
                        d = min(abs(cuv.x) - 0.15, abs(cuv.y) - 0.15);
                        d = min(d, length(cuv) - 0.35);
                    }
                    
                    float shapeMask = smoothstep(0.08, -0.08, d);
                    
                    // Saturated Base Gradient (NO BLACK)
                    float bgHue = uTime * 0.2 + vUv.x * 3.0 + vUv.y * 2.0;
                    if (uPalette == 1) bgHue += 3.14; // Opal
                    if (uPalette == 2) bgHue *= 0.5;  // Neon Fruit
                    if (uPalette == 3) bgHue = vUv.y * 2.0 + 4.0; // UV Aquarium
                    if (uPalette == 4) bgHue = -bgHue; // Solarized
                    
                    vec3 bgColor = oklch_to_srgb(vec3(0.45 + heat * 0.15, 0.25, bgHue));
                    
                    // Foreground Shape Color (Golden Angle Hue Stepping)
                    float fgHue = bgHue + 2.39996 * (grains + 1.0) + type * 5.0;
                    vec3 fgColor = oklch_to_srgb(vec3(0.75 + heat * 0.2, 0.28, fgHue));
                    
                    // Thin-Film Interference / Structural Iridescence
                    float filmD = age * 300.0 + heat * 400.0 + grains * 150.0;
                    vec3 irid = pow(sin(3.14159 * 2.0 * 1.45 * filmD / vec3(630.0, 530.0, 460.0)), vec3(2.0));
                    fgColor = mix(fgColor, irid, 0.3 + heat * 0.5);
                    
                    vec3 col = mix(bgColor, fgColor, shapeMask);
                    
                    // Heat Edge Glow
                    float edgeGlow = smoothstep(0.15, 0.0, abs(d)) * heat;
                    col += oklch_to_srgb(vec3(0.9, 0.2, fgHue + 1.0)) * edgeGlow;
                    
                    // Entropy Heatmap overlay when age is very low
                    if (age < 2.0) {
                        vec3 heatColor = oklch_to_srgb(vec3(0.8, 0.3, age * 3.0));
                        col = mix(col, heatColor, (2.0 - age) * 0.2);
                    }
                    
                    fragColor = vec4(col, 1.0);
                }
            `
        });

        // 3. Afterimage Shader: Temporal Complementary Ghosts
        const afterMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                uRender: { value: null },
                uPrev: { value: null }
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
                uniform sampler2D uRender;
                uniform sampler2D uPrev;
                
                void main() {
                    vec3 cur = texture(uRender, vUv).rgb;
                    vec3 prev = texture(uPrev, vUv).rgb;
                    
                    // Chromatic permutation for vibrant complementary shift
                    vec3 ghost = prev.brg * 0.93; 
                    
                    // Max blending preserves saturation and prevents gray mud
                    fragColor = vec4(max(cur, ghost), 1.0);
                }
            `
        });

        // 4. CRT Post-Processing Shader
        const postMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                uImage: { value: null },
                uRes: { value: new THREE.Vector2(grid.width, grid.height) },
                uCrt: { value: 1 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                ${oklabGLSL}
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D uImage;
                uniform vec2 uRes;
                uniform float uCrt;
                
                void main() {
                    vec2 q = vUv - 0.5;
                    float r2 = dot(q, q);
                    vec2 uv = vUv;
                    
                    if (uCrt > 0.5) {
                        uv += q * (r2 * 0.12); // Barrel Curvature
                    }
                    
                    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                        // Deep saturated border instead of black
                        fragColor = vec4(oklch_to_srgb(vec3(0.2, 0.15, 5.0)), 1.0); 
                        return;
                    }
                    
                    // RGB Convergence (Chromatic Aberration)
                    float conv = uCrt > 0.5 ? 0.0035 : 0.0;
                    float r = texture(uImage, uv + vec2(conv, 0.0)).r;
                    float g = texture(uImage, uv).g;
                    float b = texture(uImage, uv - vec2(conv, 0.0)).b;
                    vec3 col = vec3(r, g, b);
                    
                    if (uCrt > 0.5) {
                        // Phosphor Mask
                        float mask = sin(uv.x * uRes.x * 2.0) * sin(uv.y * uRes.y * 2.0);
                        col *= mix(0.85, 1.0, mask);
                        
                        // Scanlines
                        float scan = sin(uv.y * uRes.y * 3.14159);
                        col *= mix(0.9, 1.0, scan);
                    }
                    
                    // Soft Saturated Vignette
                    float vig = smoothstep(1.1, 0.3, length(q));
                    vec3 vigColor = oklch_to_srgb(vec3(0.25, 0.2, 4.5));
                    col = mix(vigColor, col, vig);
                    
                    // Candy Bloom
                    float bright = max(max(col.r, col.g), col.b);
                    if (bright > 0.8) {
                        col += col * (bright - 0.8) * 0.6;
                    }
                    
                    fragColor = vec4(col, 1.0);
                }
            `
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
        scene.add(mesh);

        // State Manager
        canvas.__state = {
            palette: 0,
            geomantic: 1,
            crt: 1,
            seed: 1,
            wasPressed: false
        };

        // Input Listeners
        if (!canvas.__keysAttached) {
            window.addEventListener('keydown', (e) => {
                if (!canvas.__state) return;
                const k = e.key.toLowerCase();
                if (e.code === 'Space') canvas.__state.seed = 1;
                if (k === 'c') canvas.__state.palette = (canvas.__state.palette + 1) % 5;
                if (k === 'g') canvas.__state.geomantic = 1 - canvas.__state.geomantic;
                if (k === 'p') canvas.__state.crt = 1 - canvas.__state.crt;
            });
            canvas.__keysAttached = true;
        }

        canvas.__three = {
            renderer, scene, camera, mesh,
            targets, simMat, renderMat, afterMat, postMat
        };
    }

    const { renderer, scene, camera, mesh, targets, simMat, renderMat, afterMat, postMat } = canvas.__three;
    const st = canvas.__state;

    // Handle Resize
    if (renderer.getSize(new THREE.Vector2()).x !== grid.width || renderer.getSize(new THREE.Vector2()).y !== grid.height) {
        renderer.setSize(grid.width, grid.height, false);
        postMat.uniforms.uRes.value.set(grid.width, grid.height);
        
        const newSimY = Math.max(1, Math.floor(128 * grid.height / grid.width));
        targets.simA.setSize(128, newSimY);
        targets.simB.setSize(128, newSimY);
        simMat.uniforms.uGridSize.value.set(128, newSimY);
        renderMat.uniforms.uGridSize.value.set(128, newSimY);
        
        targets.renderA.setSize(grid.width, grid.height);
        targets.renderB.setSize(grid.width, grid.height);
        targets.afterA.setSize(grid.width, grid.height);
        targets.afterB.setSize(grid.width, grid.height);
    }

    // Interaction Logic
    let click = 0, drag = 0;
    if (mouse.isPressed) {
        if (!st.wasPressed) click = 1;
        else drag = 1;
        st.wasPressed = true;
    } else {
        st.wasPressed = false;
    }

    const mx = mouse.x / grid.width;
    const my = 1.0 - (mouse.y / grid.height);

    // 1. Sim Pass
    simMat.uniforms.uState.value = targets.simA.texture;
    simMat.uniforms.uTime.value = time;
    simMat.uniforms.uMouse.value.set(mx, my);
    simMat.uniforms.uMouseDrag.value = drag;
    simMat.uniforms.uClick.value = click;
    simMat.uniforms.uSeed.value = st.seed;
    st.seed = 0; // reset seed trigger

    mesh.material = simMat;
    renderer.setRenderTarget(targets.simB);
    renderer.render(scene, camera);

    // Swap Sim
    let temp = targets.simA;
    targets.simA = targets.simB;
    targets.simB = temp;

    // 2. Render Pass
    renderMat.uniforms.uSim.value = targets.simA.texture;
    renderMat.uniforms.uTime.value = time;
    renderMat.uniforms.uPalette.value = st.palette;
    renderMat.uniforms.uGeomantic.value = st.geomantic;

    mesh.material = renderMat;
    renderer.setRenderTarget(targets.renderA);
    renderer.render(scene, camera);

    // 3. Afterimage Pass
    afterMat.uniforms.uRender.value = targets.renderA.texture;
    afterMat.uniforms.uPrev.value = targets.afterA.texture;

    mesh.material = afterMat;
    renderer.setRenderTarget(targets.afterB);
    renderer.render(scene, camera);

    // Swap Afterimage
    temp = targets.afterA;
    targets.afterA = targets.afterB;
    targets.afterB = temp;

    // 4. Post Pass to Screen
    postMat.uniforms.uImage.value = targets.afterA.texture;
    postMat.uniforms.uCrt.value = st.crt;
    
    mesh.material = postMat;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

} catch (e) {
    console.error("Spectral Candy Avalanche Garden Initialization Failed:", e);
}