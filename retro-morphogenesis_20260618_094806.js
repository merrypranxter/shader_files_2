/**
 * The Weird Code Guy presents: "AUTOPHAGIC CHROME RETRO-TISSUE"
 * 
 * A feral blend of:
 * - 1970s Paperback Sci-Fi (impossible chrome smears, warm amber light, racing stripes)
 * - Belousov-Zhabotinsky / Gray-Scott Morphogenesis (reaction-diffusion autophagic growth)
 * - Lenia (continuous CA ghost trails / memory channels)
 * - Color Systems (OKLab perceptual mapping for maximum vibrance, NO black/white)
 * 
 * Mechanism: The spaceship's auto-repair nanites have suffered a bureaucratic failure.
 * Instead of steel, they are growing a living, breathing, hyper-colored Turing pattern
 * that constantly rusts and reforms its own chrome shell.
 */

try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL 2 context not available");

        // Initialize Three.js with the provided WebGL2 context
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        renderer.autoClear = false;

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Fixed simulation resolution for stable Turing pattern wavelengths
        const SIM_RES = 1024;
        
        const rtOptions = {
            type: THREE.HalfFloatType, // Safe fallback for FloatType
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            wrapS: THREE.RepeatWrapping, // Toroidal boundary conditions
            wrapT: THREE.RepeatWrapping,
            depthBuffer: false,
            stencilBuffer: false
        };

        const rtA = new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, rtOptions);
        const rtB = new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, rtOptions);

        const quadGeometry = new THREE.PlaneGeometry(2, 2);

        // -------------------------------------------------------------------------
        // SIMULATION SHADER: Anisotropic Gray-Scott + Lenia Memory Trail + Flow Field
        // -------------------------------------------------------------------------
        const simMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_state: { value: null },
                u_res: { value: new THREE.Vector2(SIM_RES, SIM_RES) },
                u_time: { value: 0 },
                u_mouse: { value: new THREE.Vector3(0, 0, 0) }
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
                
                uniform sampler2D u_state;
                uniform vec2 u_res;
                uniform float u_time;
                uniform vec3 u_mouse;

                // Feral noise for advection (wind/exhaust pushing the biology)
                float hash(vec2 p) {
                    p = fract(p * vec2(127.1, 311.7));
                    p += dot(p, p + 45.32);
                    return fract(p.x * p.y);
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

                void main() {
                    vec2 px = 1.0 / u_res;
                    
                    // Advection flow field (the "exhaust plume" logic)
                    float n = noise(vUv * 4.0 + u_time * 0.15);
                    vec2 flow = vec2(0.0015, 0.0) + vec2(cos(n * 6.28), sin(n * 6.28)) * 0.0008;
                    
                    // Mouse repulsion flow
                    vec2 mouseDir = vUv - u_mouse.xy;
                    float mouseDist = length(mouseDir);
                    if (u_mouse.z > 0.5) {
                        flow += normalize(mouseDir) * exp(-mouseDist * 15.0) * 0.008;
                    }

                    vec2 uv = vUv - flow; // Read upstream

                    // 9-point Karl Sims Laplacian
                    vec4 c = texture(u_state, uv);
                    vec4 n_ = texture(u_state, uv + vec2(0.0, px.y));
                    vec4 s_ = texture(u_state, uv - vec2(0.0, px.y));
                    vec4 e_ = texture(u_state, uv + vec2(px.x, 0.0));
                    vec4 w_ = texture(u_state, uv - vec2(px.x, 0.0));
                    vec4 ne = texture(u_state, uv + vec2(px.x, px.y));
                    vec4 nw = texture(u_state, uv + vec2(-px.x, px.y));
                    vec4 se = texture(u_state, uv + vec2(px.x, -px.y));
                    vec4 sw = texture(u_state, uv + vec2(-px.x, -px.y));

                    vec4 lap = (n_ + s_ + e_ + w_) * 0.2 + (ne + nw + se + sw) * 0.05 - c;

                    float u = c.r;
                    float v = c.g;
                    float memory = c.b;

                    // Spatially varying F and k to create U-skate, spots, and labyrinths simultaneously
                    // Creates a "biological weather front"
                    float F = 0.025 + 0.015 * sin(vUv.y * 3.14 + u_time * 0.05);
                    float k = 0.053 + 0.012 * cos(vUv.x * 3.14 - u_time * 0.03);

                    float uvv = u * v * v;
                    
                    // Anisotropic diffusion bias (stripes stretch horizontally)
                    float du = 0.16 * lap.r + 0.02 * (e_.r + w_.r - 2.0 * u) - uvv + F * (1.0 - u);
                    float dv = 0.08 * lap.g + 0.01 * (e_.g + w_.g - 2.0 * v) + uvv - (F + k) * v;

                    u += du;
                    v += dv;

                    // Lenia-style memory trace (phosphorescent ghost channel)
                    memory = memory * 0.98 + v * 0.05;

                    // Initial / periodic seeding
                    if (u_time < 0.1 || (fract(u_time * 0.1) < 0.01 && noise(vUv * 100.0) > 0.9)) {
                        u = 1.0;
                        v = (noise(vUv * 50.0 + u_time) > 0.6) ? 0.8 : 0.0;
                    }

                    // Mouse injection
                    if (u_mouse.z > 0.5 && mouseDist < 0.03) {
                        v += 0.5;
                    }

                    fragColor = vec4(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0), clamp(memory, 0.0, 1.0), 1.0);
                }
            `
        });

        // -------------------------------------------------------------------------
        // DISPLAY SHADER: 1970s Sci-Fi Airbrush + OKLab Perceptual Coloring
        // -------------------------------------------------------------------------
        const dispMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_state: { value: null },
                u_res: { value: new THREE.Vector2(1, 1) },
                u_time: { value: 0 }
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
                
                uniform sampler2D u_state;
                uniform vec2 u_res;
                uniform float u_time;

                // OKLab to sRGB (from color_systems repo) for maximum vibrance without clipping
                vec3 oklab_to_srgb(vec3 c) {
                    float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
                    float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
                    float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
                    float l = l_ * l_ * l_;
                    float m = m_ * m_ * m_;
                    float s = s_ * s_ * s_;
                    vec3 rgb = vec3(
                         4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                    );
                    vec3 g;
                    for(int i=0; i<3; i++) {
                        g[i] = rgb[i] <= 0.0031308 ? rgb[i] * 12.92 : 1.055 * pow(max(rgb[i], 0.0), 1.0/2.4) - 0.055;
                    }
                    return g;
                }

                void main() {
                    vec2 px = 1.0 / u_res;
                    
                    vec4 state = texture(u_state, vUv);
                    float v = state.g;
                    float memory = state.b;

                    // Calculate surface normal from V concentration gradients
                    float vx = texture(u_state, vUv + vec2(px.x, 0.0)).g;
                    float vy = texture(u_state, vUv + vec2(0.0, px.y)).g;
                    vec3 normal = normalize(vec3(v - vx, v - vy, 0.012)); // 0.012 controls bump height

                    // 1970s Paperback Sci-Fi Lighting System
                    vec3 light1 = normalize(vec3(1.0, 0.8, 0.6));  // Warm primary star (Amber)
                    vec3 light2 = normalize(vec3(-1.0, -0.4, 0.9)); // Cold gas giant fill (Blue/Cyan)

                    // OKLab Palette (No White, No Black. Full saturation)
                    // Deep Indigo -> Hot Magenta -> Vivid Gold
                    vec3 col0 = vec3(0.35, 0.12, -0.22); // Dark Indigo
                    vec3 col1 = vec3(0.68, 0.26, -0.08); // Hot Magenta
                    vec3 col2 = vec3(0.88, 0.12, 0.22);  // Vivid Gold

                    float t = clamp(v * 2.8, 0.0, 1.0);
                    vec3 oklab = mix(mix(col0, col1, t * 2.0), mix(col1, col2, (t - 0.5) * 2.0), step(0.5, t));
                    vec3 baseColor = oklab_to_srgb(oklab);

                    // Diffuse lighting
                    float diff1 = max(0.0, dot(normal, light1));
                    float diff2 = max(0.0, dot(normal, light2));

                    // Anisotropic Specular (Chrome Smear from 1970s_paperback_scifi)
                    vec3 viewDir = vec3(0.0, 0.0, 1.0);
                    vec3 half1 = normalize(light1 + viewDir);
                    // Smear specular along horizontal axis
                    float spec1 = pow(max(0.0, 1.0 - abs(dot(normal, half1))), 18.0);
                    
                    vec3 half2 = normalize(light2 + viewDir);
                    float spec2 = pow(max(0.0, dot(normal, half2)), 8.0);

                    // Compose lighting
                    vec3 finalColor = baseColor * (diff1 * vec3(1.0, 0.6, 0.2) + diff2 * vec3(0.1, 0.7, 0.9) + 0.4);
                    
                    // Add bright colored speculars (avoiding pure white)
                    finalColor += spec1 * vec3(0.95, 0.85, 0.2) * 1.2;
                    finalColor += spec2 * vec3(0.2, 0.8, 0.9) * 0.5;

                    // Retrofuturistic Racing Stripe
                    // A bold neon band cutting through the biological tissue
                    float stripeMask = step(0.75, fract(vUv.x * 6.0 + vUv.y * 3.0 - u_time * 0.15));
                    vec3 stripeColor = vec3(0.0, 0.9, 0.8); // Electric Cyan
                    // Stripe gets corroded by the V morphogen
                    finalColor = mix(finalColor, stripeColor * (0.6 + 0.4 * diff1), stripeMask * 0.6 * (1.0 - v));

                    // Lenia memory trail (Phosphorescent green ghosting in the valleys)
                    vec3 trailColor = vec3(0.5, 0.95, 0.1); 
                    finalColor += memory * trailColor * 0.8 * (1.0 - v);

                    // NO BLACK, NO WHITE directive enforcement
                    // Clamp lightness strictly to prevent #000000 or #FFFFFF
                    finalColor = clamp(finalColor, vec3(0.05, 0.02, 0.15), vec3(0.98, 0.92, 0.88));

                    fragColor = vec4(finalColor, 1.0);
                }
            `
        });

        const simMesh = new THREE.Mesh(quadGeometry, simMaterial);
        const dispMesh = new THREE.Mesh(quadGeometry, dispMaterial);

        const simScene = new THREE.Scene();
        simScene.add(simMesh);

        const dispScene = new THREE.Scene();
        dispScene.add(dispMesh);

        canvas.__three = {
            renderer, scene: dispScene, camera, 
            simScene, simMaterial,
            dispMaterial,
            rtA, rtB
        };
    }

    const { renderer, scene, camera, simScene, simMaterial, dispMaterial } = canvas.__three;
    let { rtA, rtB } = canvas.__three;

    // Handle resize
    renderer.setSize(grid.width, grid.height, false);
    
    // Update uniforms
    if (simMaterial && simMaterial.uniforms) {
        simMaterial.uniforms.u_time.value = time;
        // Map mouse coordinates to [0, 1] UV space, invert Y
        const mx = mouse.x / grid.width;
        const my = 1.0 - (mouse.y / grid.height);
        const mPressed = mouse.isPressed ? 1.0 : 0.0;
        simMaterial.uniforms.u_mouse.value.set(mx, my, mPressed);
    }
    
    if (dispMaterial && dispMaterial.uniforms) {
        dispMaterial.uniforms.u_time.value = time;
        dispMaterial.uniforms.u_res.value.set(grid.width, grid.height);
    }

    // Ping-pong reaction-diffusion simulation (8 steps per frame for organic speed)
    for (let i = 0; i < 8; i++) {
        simMaterial.uniforms.u_state.value = rtA.texture;
        renderer.setRenderTarget(rtB);
        renderer.render(simScene, camera);
        
        // Swap buffers
        const temp = rtA;
        rtA = rtB;
        rtB = temp;
    }
    
    // Save swapped buffers back to persistent state
    canvas.__three.rtA = rtA;
    canvas.__three.rtB = rtB;

    // Render final display to screen
    dispMaterial.uniforms.u_state.value = rtA.texture;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

} catch (e) {
    console.error("WebGL Initialization or Render Failed:", e);
}