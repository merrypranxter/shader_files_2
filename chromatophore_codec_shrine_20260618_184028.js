/**
 * CHROMATOPHORE CODEC SHRINE
 * A living early-internet shrine where HTML skin evolves into a cuttlefish chromatophore display,
 * cross-processed in the wrong chemicals, refracted, datamoshed, and infected with Turing morphogenesis.
 * 
 * CORE DIRECTIVE OBSERVED: NO BLACK. NO WHITE. NO GRAYSCALE.
 * Every pixel bleeds saturated, chemically-wrong color.
 */

export default function(ctx, grid, time, repos, input, mouse, canvas, THREE) {
    if (!canvas.__three) {
        try {
            if (!ctx) throw new Error("WebGL 2 context not available");

            const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: false, antialias: false });
            renderer.autoClear = false;

            // FBO Setup for Ping-Pong (Simulation and Datamosh)
            const rtOptions = {
                type: THREE.HalfFloatType,
                format: THREE.RGBAFormat,
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                depthBuffer: false,
                wrapS: THREE.RepeatWrapping,
                wrapT: THREE.RepeatWrapping
            };

            const simA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
            const simB = simA.clone();
            const renderA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
            const renderB = renderA.clone();

            const scene = new THREE.Scene();
            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            const geometry = new THREE.PlaneGeometry(2, 2);

            // 1. MORPHOGENESIS (Reaction-Diffusion) SIMULATION SHADER
            const simMaterial = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_prev: { value: null },
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
                    uniform sampler2D u_prev;
                    uniform vec2 u_res;
                    uniform float u_time;

                    void main() {
                        if (u_time < 0.2) {
                            float n = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
                            fragColor = vec4(1.0, step(0.95, n), 0.0, 1.0);
                            return;
                        }

                        vec2 px = 1.0 / u_res;
                        vec4 c = texture(u_prev, vUv);
                        vec4 n = texture(u_prev, vUv + vec2(0.0, px.y));
                        vec4 s = texture(u_prev, vUv - vec2(0.0, px.y));
                        vec4 e = texture(u_prev, vUv + vec2(px.x, 0.0));
                        vec4 w = texture(u_prev, vUv - vec2(px.x, 0.0));
                        
                        // Laplacian
                        vec2 lap = (n.rg + s.rg + e.rg + w.rg - 4.0 * c.rg);
                        float u = c.r;
                        float v = c.g;
                        
                        // Spatially varying Feed and Kill (Spots + Labyrinths + Worms)
                        float F = 0.024 + 0.012 * sin(vUv.x * 12.0 + u_time * 0.2) * cos(vUv.y * 12.0);
                        float K = 0.055 + 0.006 * sin(u_time * 0.15 + length(vUv - 0.5) * 5.0);
                        
                        // Gray-Scott Equations
                        float du = 0.16 * lap.x - u * v * v + F * (1.0 - u);
                        float dv = 0.08 * lap.y + u * v * v - (F + K) * v;
                        
                        u += du * 1.0;
                        v += dv * 1.0;
                        
                        // Central Living Portal Injection
                        float portal = length(vUv - 0.5);
                        if (portal < 0.08 && fract(u_time * 2.0) < 0.05) {
                            v += 0.4 * smoothstep(0.08, 0.0, portal);
                        }
                        
                        fragColor = vec4(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0), 0.0, 1.0);
                    }
                `
            });

            // 2. MAIN RENDER (Op-Art, Cuttlefish Grid, UI, Datamosh)
            const renderMaterial = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_sim: { value: null },
                    u_prevRender: { value: null },
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
                    uniform sampler2D u_sim;
                    uniform sampler2D u_prevRender;
                    uniform vec2 u_res;
                    uniform float u_time;

                    // Strictly saturated neon reef palette (NO BLACK/WHITE)
                    vec3 getNeonColor(float t) {
                        vec3 c1 = vec3(1.0, 0.0, 0.4); // Hot pink
                        vec3 c2 = vec3(0.0, 0.9, 1.0); // Cyan
                        vec3 c3 = vec3(0.7, 1.0, 0.0); // Acid Green
                        vec3 c4 = vec3(0.5, 0.0, 0.9); // Deep Violet
                        float p = fract(t);
                        if(p < 0.25) return mix(c1, c2, p * 4.0);
                        if(p < 0.50) return mix(c2, c3, (p - 0.25) * 4.0);
                        if(p < 0.75) return mix(c3, c4, (p - 0.50) * 4.0);
                        return mix(c4, c1, (p - 0.75) * 4.0);
                    }

                    // Pseudo-random noise
                    float hash(vec2 p) {
                        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                    }

                    void main() {
                        vec2 uv = vUv;
                        vec2 px = 1.0 / u_res;
                        
                        // Op-Art Retinal Warp (Breathing Funnel)
                        vec2 centered = uv - 0.5;
                        float r = length(centered);
                        float angle = atan(centered.y, centered.x);
                        float opWarp = sin(r * 60.0 - u_time * 4.0 + sin(angle * 12.0 + u_time));
                        vec2 warpedUV = uv + centered * opWarp * 0.015;
                        
                        // Early Internet UI Debris (SDFs)
                        float uiMask = 0.0;
                        vec3 uiColor = vec3(0.0);
                        
                        // Fake browser panel 1
                        vec2 p1 = abs(warpedUV - vec2(0.25, 0.3)) - vec2(0.18, 0.12);
                        float d1 = min(max(p1.x, p1.y), 0.0) + length(max(p1, 0.0));
                        if (abs(d1) < 0.006) { uiMask = 1.0; uiColor = getNeonColor(u_time * 0.1); }
                        
                        // Fake browser panel 2
                        vec2 p2 = abs(warpedUV - vec2(0.75, 0.65)) - vec2(0.15, 0.22);
                        float d2 = min(max(p2.x, p2.y), 0.0) + length(max(p2, 0.0));
                        if (abs(d2) < 0.006) { uiMask = 1.0; uiColor = getNeonColor(u_time * 0.15 + 0.5); }
                        
                        // Glitter Button Strip
                        float strip = abs(warpedUV.x - 0.85) - 0.04;
                        if (strip < 0.0) {
                            if (hash(floor(warpedUV * 150.0) + u_time) > 0.85) {
                                uiMask = 1.0;
                                uiColor = getNeonColor(hash(floor(warpedUV * 50.0)));
                            }
                        }

                        // Central Shrine Portal
                        float portal = abs(length(warpedUV - 0.5) - 0.15);
                        if (portal < 0.015 + 0.01 * sin(angle * 16.0 + u_time * 6.0)) {
                            uiMask = 1.0;
                            uiColor = getNeonColor(u_time * 0.5 + angle);
                        }

                        // Cuttlefish Chromatophore Grid
                        vec2 grid = warpedUV * 90.0;
                        grid.x += step(1.0, mod(grid.y, 2.0)) * 0.5; // Hex-like stagger
                        vec2 cell = floor(grid);
                        vec2 cellUV = fract(grid) - 0.5;
                        
                        // Read RD Morphogenesis state for this cell
                        vec4 cellRD = texture(u_sim, (cell + 0.5) / 90.0);
                        float activation = cellRD.g; // V channel drives muscle expansion
                        
                        // Passing cloud & deimatic flash pulses
                        float pulse = 0.2 * sin(u_time * 8.0 + cell.x * 0.1 - cell.y * 0.1);
                        float radius = 0.08 + 0.45 * activation + pulse;
                        float dotShape = smoothstep(radius, radius - 0.08, length(cellUV));
                        
                        vec3 cellPigment = getNeonColor(activation * 3.0 + u_time * 0.2 + cell.x * 0.02);
                        vec3 subSkin = getNeonColor(cellRD.r * 2.0 - u_time * 0.1 + 0.3);
                        
                        vec3 chromaLayer = mix(subSkin, cellPigment, dotShape);
                        
                        // Layer UI over skin
                        vec3 composited = mix(chromaLayer, uiColor, uiMask);
                        
                        // Datamosh & Temporal Motion Vector Feedback
                        // Compute gradients from RD field to generate motion
                        float dVx = texture(u_sim, uv + vec2(px.x*4.0, 0.0)).g - texture(u_sim, uv - vec2(px.x*4.0, 0.0)).g;
                        float dVy = texture(u_sim, uv + vec2(0.0, px.y*4.0)).g - texture(u_sim, uv - vec2(0.0, px.y*4.0)).g;
                        vec2 motion = vec2(dVx, dVy) * 12.0;
                        
                        // Macroblocking the motion field
                        vec2 blockUV = floor(uv * 30.0) / 30.0;
                        float blockV = texture(u_sim, blockUV).g;
                        
                        // Mosh trigger based on RD inhibitor density and time
                        float moshGate = smoothstep(0.25, 0.45, blockV * (0.5 + 0.5 * sin(u_time * 2.0 + blockUV.x * 15.0)));
                        vec2 moshUV = uv - motion * 0.025 * moshGate;
                        
                        vec4 prevFrame = texture(u_prevRender, moshUV);
                        
                        // Blend current frame with datamoshed history
                        vec3 finalColor = mix(composited, prevFrame.rgb, moshGate * 0.92); // Heavy sticky trails
                        
                        fragColor = vec4(finalColor, 1.0);
                    }
                `
            });

            // 3. OUTPUT SHADER (Chromatic Aberration & Absolute Color Clamp)
            const outputMaterial = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_render: { value: null },
                    u_time: { value: 0 },
                    u_res: { value: new THREE.Vector2(grid.width, grid.height) }
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
                    uniform sampler2D u_render;
                    uniform float u_time;
                    uniform vec2 u_res;

                    // HSV Color Space Conversions for strict safety clamping
                    vec3 rgb2hsv(vec3 c) {
                        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
                        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
                        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
                        float d = q.x - min(q.w, q.y);
                        float e = 1.0e-10;
                        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
                    }
                    vec3 hsv2rgb(vec3 c) {
                        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
                    }

                    // Enforces NO BLACK, NO WHITE, NO GRAYSCALE
                    vec3 safeColor(vec3 col) {
                        vec3 hsv = rgb2hsv(col);
                        // Force high saturation (no grays)
                        hsv.y = clamp(hsv.y, 0.6, 1.0); 
                        // Force value away from pure black/white
                        hsv.z = clamp(hsv.z, 0.25, 0.95); 
                        
                        vec3 safeRGB = hsv2rgb(hsv);
                        
                        // Tint darks to deep indigo/plum instead of black
                        vec3 darkTint = mix(vec3(0.3, 0.0, 0.4), vec3(0.0, 0.3, 0.5), hsv.x);
                        // Tint lights to acid yellow/cyan instead of white
                        vec3 lightTint = mix(vec3(0.8, 1.0, 0.0), vec3(0.0, 1.0, 0.9), hsv.x);
                        
                        float luma = dot(safeRGB, vec3(0.299, 0.587, 0.114));
                        
                        vec3 finalCol = mix(darkTint, safeRGB, smoothstep(0.0, 0.3, luma));
                        finalCol = mix(finalCol, lightTint, smoothstep(0.7, 1.0, luma));
                        
                        return finalCol;
                    }

                    void main() {
                        vec2 uv = vUv;
                        vec2 centered = uv - 0.5;
                        float r = length(centered);
                        
                        // Chromatic Aberration (Lens Dispersion)
                        float disp = 0.02 * r * (1.0 + 0.3 * sin(u_time * 3.0));
                        
                        // Sample multiple times for spectral ghosting
                        float red = texture(u_render, uv - centered * disp).r;
                        float green = texture(u_render, uv).g;
                        float blue = texture(u_render, uv + centered * disp).b;
                        
                        vec3 col = vec3(red, green, blue);
                        
                        // Cross-Processing S-Curve
                        col = col * col * (3.0 - 2.0 * col);
                        
                        // Enforce the strict color rules
                        col = safeColor(col);
                        
                        // Absolute hard clamps to prevent ANY rendering engine defaults from making it black/white
                        col = max(col, vec3(0.1, 0.05, 0.15));
                        col = min(col, vec3(0.95, 0.95, 0.9));
                        
                        fragColor = vec4(col, 1.0);
                    }
                `
            });

            const mesh = new THREE.Mesh(geometry, simMaterial);
            scene.add(mesh);

            canvas.__three = {
                renderer, scene, camera, mesh,
                simMaterial, renderMaterial, outputMaterial,
                simA, simB, renderA, renderB
            };
        } catch (e) {
            console.error("WebGL Initialization Failed:", e);
            return;
        }
    }

    const {
        renderer, scene, camera, mesh,
        simMaterial, renderMaterial, outputMaterial,
        simA, simB, renderA, renderB
    } = canvas.__three;

    // Handle Resize
    if (simA.width !== grid.width || simA.height !== grid.height) {
        simA.setSize(grid.width, grid.height);
        simB.setSize(grid.width, grid.height);
        renderA.setSize(grid.width, grid.height);
        renderB.setSize(grid.width, grid.height);
        
        simMaterial.uniforms.u_res.value.set(grid.width, grid.height);
        renderMaterial.uniforms.u_res.value.set(grid.width, grid.height);
        outputMaterial.uniforms.u_res.value.set(grid.width, grid.height);
    }

    // 1. Simulation Pass (Multiple steps per frame for faster morphogenesis)
    mesh.material = simMaterial;
    simMaterial.uniforms.u_time.value = time;
    let currentSimIn = simA;
    let currentSimOut = simB;
    for (let i = 0; i < 4; i++) {
        simMaterial.uniforms.u_prev.value = currentSimIn.texture;
        renderer.setRenderTarget(currentSimOut);
        renderer.render(scene, camera);
        let temp = currentSimIn;
        currentSimIn = currentSimOut;
        currentSimOut = temp;
    }

    // 2. Render & Datamosh Pass
    mesh.material = renderMaterial;
    renderMaterial.uniforms.u_time.value = time;
    renderMaterial.uniforms.u_sim.value = currentSimIn.texture;
    renderMaterial.uniforms.u_prevRender.value = renderA.texture;
    renderer.setRenderTarget(renderB);
    renderer.render(scene, camera);

    // 3. Output Pass (Chromatic Aberration & Safe Color Clamp)
    mesh.material = outputMaterial;
    outputMaterial.uniforms.u_time.value = time;
    outputMaterial.uniforms.u_render.value = renderB.texture;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    // Swap Render buffers for next frame's datamosh history
    const tempRender = canvas.__three.renderA;
    canvas.__three.renderA = canvas.__three.renderB;
    canvas.__three.renderB = tempRender;
    
    // Save sim state
    canvas.__three.simA = currentSimIn;
    canvas.__three.simB = currentSimOut;
}