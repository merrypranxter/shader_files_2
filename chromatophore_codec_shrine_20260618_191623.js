try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    // Initialize Three.js on the provided canvas and context
    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;

        // Ensure float textures are supported for Reaction-Diffusion stability
        const gl = renderer.getContext();
        gl.getExtension('EXT_color_buffer_float');

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Ping-Pong FBOs for Morphogenesis and Datamosh History
        // R: U (Activator), G: V (Inhibitor), B: Datamosh History, A: Unused
        const fboOptions = {
            width: grid.width,
            height: grid.height,
            type: THREE.FloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            depthBuffer: false,
            stencilBuffer: false
        };

        const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOptions);
        const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOptions);

        // ---------------------------------------------------------------------
        // WET ENGINE: PING-PONG SHADER (Reaction-Diffusion + Datamosh Advection)
        // ---------------------------------------------------------------------
        const simMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_prev: { value: null },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_time: { value: 0 }
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
                uniform sampler2D u_prev;
                uniform vec2 u_resolution;
                uniform float u_time;

                // Pseudo-random noise
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                }

                void main() {
                    vec2 uv = vUv;
                    vec2 px = 1.0 / u_resolution;

                    // 1. DATAMOSH ADVECTION (Motion Vectors based on Morphogenesis gradients)
                    float v_left  = texture(u_prev, uv - vec2(px.x * 2.0, 0.0)).g;
                    float v_right = texture(u_prev, uv + vec2(px.x * 2.0, 0.0)).g;
                    float v_up    = texture(u_prev, uv + vec2(0.0, px.y * 2.0)).g;
                    float v_down  = texture(u_prev, uv - vec2(0.0, px.y * 2.0)).g;
                    
                    vec2 grad = vec2(v_right - v_left, v_up - v_down);
                    
                    // Smear previous history along the gradient (Datamosh trail)
                    vec2 mosh_uv = uv - grad * 0.01 * (1.0 + sin(u_time * 0.5));
                    
                    // 2. REACTION-DIFFUSION (Gray-Scott Morphogenesis)
                    vec4 state = texture(u_prev, uv);
                    float u = state.r;
                    float v = state.g;

                    // 5-point Laplacian
                    float u_lap = texture(u_prev, uv + vec2(px.x, 0.0)).r +
                                  texture(u_prev, uv - vec2(px.x, 0.0)).r +
                                  texture(u_prev, uv + vec2(0.0, px.y)).r +
                                  texture(u_prev, uv - vec2(0.0, px.y)).r - 4.0 * u;
                    
                    float v_lap = texture(u_prev, uv + vec2(px.x, 0.0)).g +
                                  texture(u_prev, uv - vec2(px.x, 0.0)).g +
                                  texture(u_prev, uv + vec2(0.0, px.y)).g +
                                  texture(u_prev, uv - vec2(0.0, px.y)).g - 4.0 * v;

                    // Spatial Feed/Kill map: Creates the "Living Shrine Portal"
                    float dist = length(uv - 0.5);
                    
                    // Center portal: discrete spots. Edges: labyrinthine stripes
                    float F = mix(0.035, 0.022, smoothstep(0.1, 0.45, dist));
                    float k = mix(0.060, 0.051, smoothstep(0.1, 0.45, dist));
                    
                    // Introduce organic asymmetry to the biological field
                    F += 0.002 * sin(uv.x * 20.0 + u_time * 0.5) * cos(uv.y * 20.0);

                    float uvv = u * v * v;
                    float du = 0.16 * u_lap - uvv + F * (1.0 - u);
                    float dv = 0.08 * v_lap + uvv - (F + k) * v;

                    u += du;
                    v += dv;

                    // 3. SEEDING & INITIALIZATION
                    if (u_time < 0.1) {
                        u = 1.0;
                        // Central seed cluster
                        v = (hash(uv * 10.0) > 0.95 && dist < 0.1) ? 1.0 : 0.0;
                    }

                    // 4. HISTORY BUFFER UPDATE
                    float history = texture(u_prev, mosh_uv).b;
                    // Decay history slowly, inject new V structures
                    history = mix(history, v, 0.08);

                    fragColor = vec4(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0), history, 1.0);
                }
            `
        });

        // ---------------------------------------------------------------------
        // SHRINE DISPLAY: MAIN SHADER (Op-Art, UI Debris, Chromatophores, CA)
        // ---------------------------------------------------------------------
        const displayMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_rd: { value: null },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_time: { value: 0 }
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
                uniform sampler2D u_rd;
                uniform vec2 u_resolution;
                uniform float u_time;

                // --- COLOR SYSTEMS: OKLab Transformations ---
                vec3 linear_srgb_to_oklab(vec3 c) {
                    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
                    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
                    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
                    float l_ = pow(l, 1.0/3.0);
                    float m_ = pow(m, 1.0/3.0);
                    float s_ = pow(s, 1.0/3.0);
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

                vec3 oklab_mix(vec3 colA, vec3 colB, float t) {
                    vec3 labA = linear_srgb_to_oklab(colA);
                    vec3 labB = linear_srgb_to_oklab(colB);
                    return oklab_to_linear_srgb(mix(labA, labB, t));
                }

                // --- CANDY-ACID PALETTE (NO BLACK / NO WHITE) ---
                const vec3 C_VOID   = vec3(0.3, 0.0, 0.5);  // Deep Violet (Shadow Replacement)
                const vec3 C_PETROL = vec3(0.0, 0.3, 0.5);  // Petrol Blue
                const vec3 C_CORAL  = vec3(1.0, 0.2, 0.4);  // Neon Coral
                const vec3 C_ACID   = vec3(0.8, 1.0, 0.0);  // Acid Yellow (Highlight Replacement)
                const vec3 C_CYAN   = vec3(0.0, 0.9, 0.9);  // Electric Cyan
                const vec3 C_PLUM   = vec3(0.5, 0.0, 0.4);  // Plum
                const vec3 C_PINK   = vec3(1.0, 0.1, 0.6);  // Hot Pink

                // Signed Distance Functions
                float sdBox(vec2 p, vec2 b) {
                    vec2 d = abs(p) - b;
                    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
                }

                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                }

                // --- SCENE RENDERER ---
                vec3 renderScene(vec2 uv) {
                    vec2 warp_uv = uv;

                    // 1. GLITCHCORE DAMAGE: Compression Macroblocking & Raster Tears
                    // Macroblock quantization
                    vec2 block_uv = floor(warp_uv * 12.0) / 12.0;
                    if (hash(block_uv + floor(u_time * 4.0)) > 0.85) {
                        warp_uv = block_uv; 
                    }
                    // Raster Scanline Tear
                    float tear = step(0.98, hash(vec2(uv.y * 10.0, floor(u_time * 8.0))));
                    warp_uv.x += tear * 0.06 * sin(u_time * 10.0);

                    // 2. OP-ART RETINAL ENGINE: Funnel Tunnels & Zebra Waves
                    warp_uv.x += sin(warp_uv.y * 15.0 + u_time * 2.0) * 0.015;
                    warp_uv.y += cos(warp_uv.x * 15.0 - u_time * 2.0) * 0.015;
                    
                    float dist = length(warp_uv - 0.5);
                    // Radial funnel distortion
                    float op_art = sin(1.0 / (dist + 0.05) * 4.0 - u_time * 3.0 + atan(warp_uv.y - 0.5, warp_uv.x - 0.5) * 2.0);
                    op_art = smoothstep(-0.1, 0.1, op_art);

                    // 3. EARLY-INTERNET UI DEBRIS
                    float ui_mask = 0.0;
                    float ui_lines = 0.0;
                    
                    // Floating Browser Panel 1
                    vec2 p1 = warp_uv - vec2(0.2, 0.3);
                    float d1 = sdBox(p1, vec2(0.12, 0.18));
                    if (d1 < 0.0) ui_mask = 1.0;
                    if (abs(d1) < 0.005) ui_lines = 1.0;

                    // Floating Chrome Panel 2
                    vec2 p2 = warp_uv - vec2(0.8, 0.7);
                    float d2 = sdBox(p2, vec2(0.18, 0.08));
                    if (d2 < 0.0) ui_mask = 1.0;
                    if (abs(d2) < 0.005) ui_lines = 1.0;

                    // Asemic Pixel Glyphs (Text Debris)
                    vec2 text_grid = floor(warp_uv * vec2(80.0, 40.0));
                    float text_noise = hash(text_grid);
                    float text = step(0.65, text_noise) * step(0.2, fract(warp_uv.y * 40.0));
                    if (ui_mask > 0.0 && text > 0.0) ui_lines = 1.0;

                    // 4. CUTTLEFISH CHROMATOPHORES (Quantized Biological Layer)
                    float cells = 45.0;
                    vec2 cell_uv = floor(warp_uv * cells) / cells + (0.5 / cells);
                    vec2 local_uv = fract(warp_uv * cells) - 0.5;

                    // Read Morphogenesis & Datamosh data
                    vec4 rd_data = texture(u_rd, cell_uv);
                    float u_val = rd_data.r; // Substrate
                    float v_val = rd_data.g; // Inhibitor (Pattern)
                    float history = rd_data.b; // Datamosh motion trails

                    // Passing-cloud neural excitation wave
                    float excitation = sin(cell_uv.x * 8.0 - u_time * 5.0 + cell_uv.y * 4.0) * 0.15;
                    float activation = clamp(v_val + excitation, 0.0, 1.0);

                    // Muscle-driven pixel expansion
                    float radius = 0.05 + 0.42 * smoothstep(0.1, 0.6, activation);
                    float chromatophore = 1.0 - smoothstep(radius - 0.08, radius + 0.02, length(local_uv));

                    // 5. CROSS-PROCESSING & COLOR ASSEMBLY
                    // Base Op-Art Field (Deep Violet to Hot Pink)
                    vec3 bg_color = oklab_mix(C_VOID, C_PINK, op_art);
                    
                    // Inject Morphogenesis substrate (Acid Yellow)
                    bg_color = oklab_mix(bg_color, C_ACID, u_val * 0.7);
                    
                    // Inject Datamosh History (Electric Cyan Smears)
                    bg_color = oklab_mix(bg_color, C_CYAN, history * 0.8);

                    // Chromatophore Pigment Cells (Coral to Petrol)
                    vec3 chrom_color = oklab_mix(C_PETROL, C_CORAL, activation);

                    // Composite Background + Chromatophores
                    vec3 final_col = bg_color;
                    final_col = mix(final_col, chrom_color, chromatophore * 0.85);

                    // Composite UI Debris over top
                    if (ui_mask > 0.0) {
                        // Glassy UI backdrop (darken and tint plum)
                        final_col = oklab_mix(final_col, C_PLUM, 0.6); 
                    }
                    // Glowing UI Borders and Text
                    vec3 ui_glow = oklab_mix(C_CYAN, C_ACID, text_noise);
                    final_col = mix(final_col, ui_glow, ui_lines);

                    return final_col;
                }

                void main() {
                    vec2 uv = vUv;
                    
                    // 6. CHROMATIC ABERRATION (Lens Dispersion)
                    float dist = length(uv - 0.5);
                    // Pulsing dispersion based on distance from center portal
                    float dispersion = 0.015 * dist * (1.0 + 0.8 * sin(u_time * 3.0));
                    vec2 dir = normalize(uv - 0.5);

                    // Sample the scene 3 times to separate spectral bands
                    vec3 col;
                    col.r = renderScene(uv - dir * dispersion).r;
                    col.g = renderScene(uv).g;
                    col.b = renderScene(uv + dir * dispersion).b;

                    // 7. FINAL COLOR SAFETY CLAMP (ABSOLUTE RULE: NO BLACK, NO WHITE)
                    // Gamma curve to saturate midtones
                    col = pow(abs(col), vec3(0.85));

                    // Hard clamp away from pure 0.0 and 1.0
                    col = clamp(col, vec3(0.05), vec3(0.95));

                    // Lift any remaining dark shadows into saturated Petrol/Plum
                    float luma = dot(col, vec3(0.299, 0.587, 0.114));
                    col = mix(C_VOID, col, smoothstep(0.0, 0.25, luma));
                    
                    // Pull extreme highlights into Neon Yellow/Pink instead of White
                    col = mix(col, C_ACID, smoothstep(0.85, 1.0, luma));

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        scene.add(quad);

        canvas.__three = { 
            renderer, 
            scene, 
            camera, 
            simMaterial, 
            displayMaterial, 
            rtA, 
            rtB, 
            quad 
        };
    }

    const { renderer, scene, camera, simMaterial, displayMaterial, rtA, rtB, quad } = canvas.__three;
    renderer.setSize(grid.width, grid.height, false);

    // Ensure uniforms are updated
    if (simMaterial.uniforms && simMaterial.uniforms.u_time) {
        simMaterial.uniforms.u_time.value = time;
    }
    if (displayMaterial.uniforms && displayMaterial.uniforms.u_time) {
        displayMaterial.uniforms.u_time.value = time;
    }

    // -------------------------------------------------------------------------
    // RENDER LOOP
    // -------------------------------------------------------------------------
    
    // 1. Run Multiple Reaction-Diffusion Simulation Steps for stability
    const STEPS = 8;
    quad.material = simMaterial;
    
    for (let i = 0; i < STEPS; i++) {
        // Read from A, write to B
        simMaterial.uniforms.u_prev.value = rtA.texture;
        renderer.setRenderTarget(rtB);
        renderer.render(scene, camera);

        // Swap buffers
        const temp = rtA;
        canvas.__three.rtA = rtB;
        canvas.__three.rtB = temp;
    }

    // 2. Render Final Display Shader to Canvas
    quad.material = displayMaterial;
    displayMaterial.uniforms.u_rd.value = canvas.__three.rtA.texture;
    
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

} catch (e) {
    console.error("WebGL Initialization or Render Failed:", e);
    
    // Graceful fallback: Draw a highly saturated error pattern if WebGL fails
    if (ctx && ctx.fillStyle) {
        ctx.fillStyle = "#4B0082"; // Deep Indigo (No Black)
        ctx.fillRect(0, 0, grid.width, grid.height);
        
        ctx.fillStyle = "#FF007F"; // Hot Pink
        ctx.font = "20px monospace";
        ctx.fillText("SHRINE OFFLINE: CODEC FAILURE", 20, grid.height / 2);
    }
}