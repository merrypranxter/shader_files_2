/**
 * PHOSPHOR SIGNAL REEF ENGINE
 * 
 * A maximum-density generative convergence of:
 * - CRT Phosphor FX (subpixel triad masks, scanlines)
 * - Demoscene Oldskool (SDF raymarching, folded geometry)
 * - Halftone Mosaic (luminance-driven dot clustering)
 * - Datamosh & Damage Aesthetics (temporal feedback, motion vector drift, macroblocks)
 * - Chromatic Aberration & Crystalline (birefringence, spectral split, octahedral lattice)
 * - Anamorphic Lens Flares (horizontal spectral streaks)
 * - Cuttlefish Chromatics (expanding/contracting chromatophore cells)
 * - Color Systems (OKLab perceptual palettes, golden angle hue distribution)
 * - Glitchcore & Early Internet (UI shards, window borders, aggressive pop-ups)
 * - Autostereogram [Extra] (depth-map driven horizontal pattern shifting / Magic Eye logic)
 *
 * ABSOLUTE COLOR LAW: Enforced via OKLab clamping. No pure black, no pure white.
 * Darks are deep indigo/plum. Brights are hot pink/cyan. 
 */

export function render(ctx, grid, time, repos, input, mouse, canvas, THREE) {
    // Defensive check: ensure Three.js is available
    if (!THREE) return;

    // Initialize or retrieve persisted Three.js ecosystem
    if (!canvas.__three) {
        try {
            if (!ctx) throw new Error("WebGL2 context required for Phosphor Signal Reef Engine.");

            const renderer = new THREE.WebGLRenderer({
                canvas: canvas,
                context: ctx,
                alpha: false,
                antialias: false,
                preserveDrawingBuffer: false
            });
            renderer.autoClear = false;

            // Ping-Pong FBOs for temporal datamosh and cuttlefish neural waves
            const rtParams = {
                type: THREE.HalfFloatType,
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                wrapS: THREE.ClampToEdgeWrapping,
                wrapT: THREE.ClampToEdgeWrapping,
                depthBuffer: false,
                stencilBuffer: false
            };
            const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
            const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);

            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            const scene = new THREE.Scene();

            // The Monolithic Reef Shader
            const simMaterial = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_time: { value: 0 },
                    u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                    u_prev: { value: null }
                },
                vertexShader: `
                    in vec2 position;
                    out vec2 vUv;
                    void main() {
                        vUv = position * 0.5 + 0.5;
                        gl_Position = vec4(position, 0.0, 1.0);
                    }
                `,
                fragmentShader: `
                    precision highp float;
                    
                    in vec2 vUv;
                    out vec4 fragColor;
                    
                    uniform float u_time;
                    uniform vec2 u_resolution;
                    uniform sampler2D u_prev;
                    
                    #define PI 3.14159265359
                    
                    // --- COLOR SYSTEMS (OKLab) ---
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
                        vec3 x1 = rgb * 12.92;
                        vec3 x2 = 1.055 * pow(max(rgb, 0.0), vec3(1.0/2.4)) - 0.055;
                        return mix(x1, x2, step(0.0031308, rgb));
                    }
                    
                    vec3 golden_palette(float i) {
                        float h = i * 2.3999632; // Golden angle spread
                        float L = 0.65 + 0.15 * sin(i * 3.14);
                        float C = 0.28; // Hyperpop high chroma
                        return clamp(oklab_to_srgb(vec3(L, C * cos(h), C * sin(h))), 0.0, 1.0);
                    }
                    
                    // --- MATH & GEOMETRY (Demoscene & Crystalline) ---
                    mat2 rot(float a) { float s=sin(a),c=cos(a); return mat2(c,-s,s,c); }
                    
                    float sdBox(vec3 p, vec3 b) { 
                        vec3 q = abs(p) - b; 
                        return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0); 
                    }
                    
                    float sdOctahedron(vec3 p, float s) { 
                        p = abs(p); 
                        return (p.x+p.y+p.z-s)*0.57735027; 
                    }
                    
                    float map(vec3 pos) {
                        vec3 p = pos;
                        p.xy *= rot(u_time * 0.15);
                        p.xz *= rot(u_time * 0.25);
                        
                        // Demoscene Space Folding
                        vec3 q = p;
                        for(int i=0; i<3; i++) {
                            q = abs(q) - 0.45;
                            q.xy *= rot(0.5);
                            q.xz *= rot(0.7);
                        }
                        float frame = sdBox(q, vec3(0.1, 0.7, 0.1));
                        
                        // Crystalline Octahedral Core
                        float core = sdOctahedron(p, 0.8 + 0.15 * sin(u_time * 5.0));
                        
                        // Reef Swarm Nodes
                        vec3 rep = mod(pos + vec3(u_time*0.5), 2.0) - 1.0;
                        float nodes = sdOctahedron(rep, 0.1);
                        
                        return max(min(core, nodes), -frame);
                    }
                    
                    vec3 getNormal(vec3 p) {
                        vec2 e = vec2(0.002, 0.0);
                        return normalize(vec3(
                            map(p + e.xyy) - map(p - e.xyy),
                            map(p + e.yxy) - map(p - e.yxy),
                            map(p + e.yyx) - map(p - e.yyx)
                        ));
                    }
                    
                    void main() {
                        vec2 uv = vUv;
                        vec2 p = (uv - 0.5) * 2.0;
                        p.x *= u_resolution.x / u_resolution.y;
                        
                        // 1. DEMOSCENE RAYMARCHING
                        vec3 ro = vec3(0.0, 0.0, 2.5);
                        vec3 rd = normalize(vec3(p, -1.2));
                        float t = 0.0;
                        float d = 0.0;
                        for(int i=0; i<64; i++) {
                            d = map(ro + rd * t);
                            if(d < 0.001 || t > 5.0) break;
                            t += d;
                        }
                        
                        float depth = 0.0;
                        vec3 sceneCol = vec3(0.0);
                        if(t < 5.0) {
                            depth = 1.0 - (t / 5.0);
                            vec3 hit = ro + rd * t;
                            vec3 n = getNormal(hit);
                            float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
                            sceneCol = golden_palette(depth * 12.0 + u_time * 0.4);
                            sceneCol += fresnel * golden_palette(depth * 4.0 - u_time * 0.2);
                        }
                        
                        // 2. AUTOSTEREOGRAM & CUTTLEFISH CHROMATICS
                        // Autostereogram depth shift (Magic Eye horizontal pattern displacement)
                        float E = 0.04; 
                        float sep = E * (1.0 - 0.8 * depth) / (2.0 - 0.8 * depth);
                        vec2 bg_uv = vec2(fract((uv.x + sep) * 25.0), fract(uv.y * 25.0));
                        
                        // Cuttlefish chromatophore expansion waves
                        float act = sin(u_time * 6.0 + uv.x * 12.0 + uv.y * 18.0) * 0.5 + 0.5;
                        float radius = 0.35 * (1.0 + 1.24 * act);
                        float cell = smoothstep(radius, radius - 0.05, length(bg_uv - 0.5));
                        
                        vec3 iridophore = golden_palette(uv.x * 4.0 + u_time * 0.15);
                        vec3 pigment = golden_palette(uv.y * 5.0 - u_time * 0.3 + 0.5);
                        vec3 bg_col = mix(iridophore, pigment, cell);
                        
                        // Composite 3D over Cuttlefish background
                        vec3 col = mix(bg_col, sceneCol, smoothstep(0.0, 0.02, depth));
                        
                        // 3. DATAMOSH & DAMAGE AESTHETICS & TEMPORAL FEEDBACK
                        vec2 mv = vec2(
                            sin(uv.y * 12.0 + u_time) + cos(uv.x * 18.0 - u_time),
                            cos(uv.x * 14.0 + u_time * 1.3)
                        ) * 0.004;
                        
                        // Glitchcore macroblock quantization
                        vec2 block_uv = floor(uv * 28.0) / 28.0;
                        float block_noise = fract(sin(dot(block_uv, vec2(12.9898, 78.233))) * 43758.5453);
                        if(block_noise > 0.94) {
                            mv += vec2(0.04 * sin(u_time * 20.0), 0.0); // Macroblock shear
                        }
                        
                        // Crystalline Birefringence (Double Refraction in temporal feedback)
                        vec3 prevR = texture(u_prev, uv - mv).rgb;
                        vec3 prevG = texture(u_prev, uv - mv * 1.3).rgb;
                        vec3 prevB = texture(u_prev, uv - mv * 1.6).rgb;
                        vec3 prev = vec3(prevR.r, prevG.g, prevB.b);
                        
                        // Temporal echo / Codec melt
                        float echo_mix = 0.72;
                        if (mod(u_time, 3.5) < 0.15) {
                            echo_mix = 0.97; // Rupture event
                            col += vec3(0.15, 0.0, 0.1); // Toxic candy bloom
                        }
                        col = mix(col, prev, echo_mix);
                        
                        // 4. HALFTONE MOSAIC
                        float luma = dot(col, vec3(0.299, 0.587, 0.114));
                        vec2 ht_uv = fract(uv * 100.0);
                        float ht_dot = smoothstep(0.45, 0.35, length(ht_uv - 0.5) - luma * 0.45);
                        if (block_noise < 0.06) {
                            col = mix(col, golden_palette(luma * 6.0 + u_time), ht_dot);
                        }
                        
                        // 5. EARLY INTERNET & GLITCHCORE UI SHARDS
                        vec2 ui_uv = uv - vec2(0.75, 0.25);
                        float ui_box = max(abs(ui_uv.x) - 0.12, abs(ui_uv.y) - 0.06);
                        if (ui_box < 0.0 && ui_box > -0.01) {
                            col = golden_palette(u_time * 2.5); // Neon window border
                        }
                        
                        // 6. ANAMORPHIC LENS FLARES
                        float flare = exp(-abs(uv.y - 0.5) * 120.0) * smoothstep(1.0, 0.0, abs(uv.x - 0.5));
                        flare += exp(-abs(uv.y - 0.25) * 180.0) * smoothstep(1.0, 0.0, abs(uv.x - 0.8)) * step(0.8, block_noise);
                        col += golden_palette(u_time * 0.7) * flare * 2.0;
                        
                        // 7. CRT PHOSPHOR & SCANLINES
                        float scanline = 0.85 + 0.15 * sin(uv.y * u_resolution.y * PI);
                        float triad = mod(gl_FragCoord.x, 3.0);
                        vec3 phosphor = vec3(triad < 1.0, triad >= 1.0 && triad < 2.0, triad >= 2.0);
                        col *= scanline * (phosphor * 0.6 + 0.4);
                        
                        // 8. ABSOLUTE COLOR LAW (No Black/White Dominance)
                        // Map crushed darks to deep indigo/plum
                        vec3 chromatic_dark = oklab_to_srgb(vec3(0.2, 0.15, -0.15)); 
                        // Map blown whites to hot pink/cyan
                        vec3 chromatic_bright = oklab_to_srgb(vec3(0.9, 0.2, 0.05)); 
                        
                        float final_luma = dot(col, vec3(0.299, 0.587, 0.114));
                        col = mix(chromatic_dark, col, smoothstep(0.0, 0.3, final_luma));
                        col = mix(col, chromatic_bright, smoothstep(0.8, 1.0, final_luma));
                        
                        fragColor = vec4(col, 1.0);
                    }
                `
            });

            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMaterial);
            scene.add(mesh);

            // Copy Shader to render FBO to screen
            const copyMaterial = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: { u_tex: { value: null } },
                vertexShader: `
                    in vec2 position;
                    out vec2 vUv;
                    void main() {
                        vUv = position * 0.5 + 0.5;
                        gl_Position = vec4(position, 0.0, 1.0);
                    }
                `,
                fragmentShader: `
                    precision highp float;
                    in vec2 vUv;
                    out vec4 fragColor;
                    uniform sampler2D u_tex;
                    void main() {
                        fragColor = texture(u_tex, vUv);
                    }
                `
            });
            const copyScene = new THREE.Scene();
            copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMaterial));

            canvas.__three = { renderer, rtA, rtB, camera, scene, copyScene, simMaterial, copyMaterial };
        } catch (e) {
            console.error("Phosphor Signal Reef Engine Initialization Failed:", e);
            return;
        }
    }

    const t = canvas.__three;
    if (!t) return;

    // Handle Resize
    if (t.renderer.getSize(new THREE.Vector2()).x !== grid.width || t.renderer.getSize(new THREE.Vector2()).y !== grid.height) {
        t.renderer.setSize(grid.width, grid.height, false);
        t.rtA.setSize(grid.width, grid.height);
        t.rtB.setSize(grid.width, grid.height);
        t.simMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
    }

    // Update Uniforms
    t.simMaterial.uniforms.u_time.value = time;
    t.simMaterial.uniforms.u_prev.value = t.rtB.texture; // Read from B

    // Render Simulation to A
    t.renderer.setRenderTarget(t.rtA);
    t.renderer.render(t.scene, t.camera);

    // Render A to Screen
    t.copyMaterial.uniforms.u_tex.value = t.rtA.texture;
    t.renderer.setRenderTarget(null);
    t.renderer.render(t.copyScene, t.camera);

    // Swap Ping-Pong Buffers (A becomes the new B)
    const temp = t.rtA;
    t.rtA = t.rtB;
    t.rtB = temp;
}