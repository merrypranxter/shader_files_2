(function(ctx, grid, time, repos, input, mouse, canvas, THREE) {
    // -------------------------------------------------------------------------
    // "CHROMATOPHORE CODEC SHRINE"
    // A maximalist, full-color, WebGL2 multi-pass generative system.
    // Blends Turing morphogenesis, cuttlefish chromatophores, op-art, 
    // early internet UI debris, datamoshing, and cross-processed damage.
    // ABSOLUTE COLOR RULE: No black, no white, no grayscale.
    // -------------------------------------------------------------------------

    if (!THREE) return;

    // --- INITIALIZATION ---
    if (!canvas.__three) {
        try {
            if (!ctx) throw new Error("WebGL2 context required");

            const renderer = new THREE.WebGLRenderer({ canvas: canvas, context: ctx, alpha: false, antialias: false });
            renderer.autoClear = false;
            
            // Use HalfFloatType for high precision without huge performance hit, crucial for RD and feedback
            const type = THREE.HalfFloatType; 
            const format = THREE.RGBAFormat;
            
            const rtParams = {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.NearestFilter, // Nearest for datamosh blockiness
                wrapS: THREE.ClampToEdgeWrapping,
                wrapT: THREE.ClampToEdgeWrapping,
                format: format,
                type: type,
                depthBuffer: false,
                stencilBuffer: false
            };

            // Double buffers for Ping-Pong
            const rtRD1 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
            const rtRD2 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
            const rtMosh1 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
            const rtMosh2 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
            const rtDraw = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);

            const scene = new THREE.Scene();
            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            const geometry = new THREE.PlaneGeometry(2, 2);

            // --- COMMON GLSL CHUNKS ---
            const glslHeader = `
                precision highp float;
                uniform float u_time;
                uniform vec2 u_resolution;
                in vec2 vUv;
                
                // OKLab perceptual palette generator
                // Generates saturated, luminous colors, avoiding darks/whites
                vec3 oklab_palette(float t) {
                    vec3 a = vec3(0.7, 0.1, 0.1);  // High lightness, slight red bias
                    vec3 b = vec3(0.2, 0.2, 0.2);  // High chroma
                    vec3 c = vec3(1.0, 1.0, 1.0);  // Frequency
                    vec3 d = vec3(0.0, 0.33, 0.67); // Phase
                    
                    // Cosine gradient in an approximate perceptual space
                    vec3 col = a + b * cos(6.28318 * (c * t + d));
                    
                    // Shift hues to hit neon reef colors (magenta, cyan, acid green, orange)
                    return clamp(col, 0.0, 1.0); 
                }
                
                // Hash function
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                }
                
                // 2D Noise
                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    float a = hash(i);
                    float b = hash(i + vec2(1.0, 0.0));
                    float c = hash(i + vec2(0.0, 1.0));
                    float d = hash(i + vec2(1.0, 1.0));
                    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
                }
            `;

            // --- PASS 1: MORPHOGENESIS (Reaction-Diffusion) ---
            // Simulates Gray-Scott with spatial variations for "Zebra waves" and "Labyrinths"
            const matRD = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: { u_time: { value: 0 }, u_resolution: { value: new THREE.Vector2() }, u_tex: { value: null }, u_frame: { value: 0 } },
                vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
                fragmentShader: `
                    ${glslHeader}
                    uniform sampler2D u_tex;
                    uniform int u_frame;
                    out vec4 fragColor;

                    void main() {
                        vec2 px = 1.0 / u_resolution;
                        
                        // Laplcian 3x3 kernel
                        vec2 c = texture(u_tex, vUv).rg;
                        vec2 n = texture(u_tex, vUv + vec2(0.0, px.y)).rg;
                        vec2 s = texture(u_tex, vUv - vec2(0.0, px.y)).rg;
                        vec2 e = texture(u_tex, vUv + vec2(px.x, 0.0)).rg;
                        vec2 w = texture(u_tex, vUv - vec2(px.x, 0.0)).rg;
                        vec2 ne = texture(u_tex, vUv + vec2(px.x, px.y)).rg;
                        vec2 nw = texture(u_tex, vUv + vec2(-px.x, px.y)).rg;
                        vec2 se = texture(u_tex, vUv + vec2(px.x, -px.y)).rg;
                        vec2 sw = texture(u_tex, vUv + vec2(-px.x, -px.y)).rg;
                        
                        vec2 lap = (n + s + e + w) * 0.2 + (ne + nw + se + sw) * 0.05 - c;
                        
                        // Morphogenesis Parameters (spatially varying)
                        float f = 0.035 + 0.01 * sin(vUv.y * 15.0 + u_time * 0.5); // Zebra wave bias
                        float k = 0.060 + 0.005 * noise(vUv * 10.0 - u_time * 0.2); // Labyrinth bias
                        
                        // Central Shrine Anchor (protects center, forces pattern)
                        float dist = length(vUv - 0.5);
                        float anchor = smoothstep(0.3, 0.0, dist);
                        f += anchor * 0.02; // Feed more in center
                        k -= anchor * 0.01;
                        
                        float da = 1.0;
                        float db = 0.5;
                        
                        float a = c.x;
                        float b = c.y;
                        float abb = a * b * b;
                        
                        float nextA = a + (da * lap.x - abb + f * (1.0 - a));
                        float nextB = b + (db * lap.y + abb - (f + k) * b);
                        
                        if (u_frame < 10) {
                            nextA = 1.0;
                            nextB = (hash(vUv * 100.0) > 0.98 || dist < 0.1) ? 1.0 : 0.0;
                        }
                        
                        fragColor = vec4(clamp(nextA, 0.0, 1.0), clamp(nextB, 0.0, 1.0), 0.0, 1.0);
                    }
                `
            });

            // --- PASS 2: DRAW (Shrine, Op-Art, Cuttlefish Chromatophores) ---
            const matDraw = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: { u_time: { value: 0 }, u_resolution: { value: new THREE.Vector2() }, u_rd: { value: null } },
                vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
                fragmentShader: `
                    ${glslHeader}
                    uniform sampler2D u_rd;
                    out vec4 fragColor;
                    
                    // SDFs for UI Debris
                    float sdBox(vec2 p, vec2 b) {
                        vec2 d = abs(p) - b;
                        return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
                    }
                    
                    mat2 rot(float a) {
                        float s = sin(a), c = cos(a);
                        return mat2(c, -s, s, c);
                    }

                    void main() {
                        vec2 uv = vUv;
                        vec2 p = uv * 2.0 - 1.0;
                        p.x *= u_resolution.x / u_resolution.y;
                        
                        vec2 rdState = texture(u_rd, uv).rg;
                        float morpho = rdState.y; // Morphogen B
                        
                        // 1. OP-ART RETINAL ENGINE (Background)
                        float r = length(p);
                        float a = atan(p.y, p.x);
                        // Funnel tunnel + zebra waves
                        float opArt = sin(10.0 / (r + 0.1) - u_time * 2.0 + a * 4.0 + morpho * 10.0);
                        opArt = smoothstep(-0.2, 0.2, opArt);
                        
                        vec3 bgCol = oklab_palette(r * 2.0 - u_time * 0.1);
                        vec3 opCol = mix(vec3(0.9, 0.1, 0.5), vec3(0.1, 0.8, 0.9), opArt); // Hot pink / Cyan
                        
                        // 2. CUTTLEFISH CHROMATOPHORES (Midground)
                        // Quantized grid
                        float cells = 40.0;
                        vec2 gridUv = floor(uv * cells) / cells;
                        vec2 cellLocal = fract(uv * cells) - 0.5;
                        
                        // Sample RD at grid center for neural excitation
                        float excitation = texture(u_rd, gridUv).y;
                        
                        // Passing cloud wave
                        float cloud = sin(gridUv.x * 10.0 - u_time * 3.0) * 0.5 + 0.5;
                        excitation += cloud * 0.2;
                        
                        // Cell radius expands with excitation
                        float cellRadius = 0.1 + 0.8 * excitation;
                        float cellShape = smoothstep(cellRadius, cellRadius - 0.05, length(cellLocal));
                        
                        vec3 cellCol = oklab_palette(gridUv.x * 3.0 + gridUv.y * 2.0 + u_time * 0.5);
                        
                        // 3. EARLY INTERNET UI DEBRIS (Foreground)
                        float uiLayer = 0.0;
                        vec3 uiCol = vec3(0.0);
                        
                        // Floating panels
                        for(float i=0.0; i<5.0; i++) {
                            vec2 pos = vec2(sin(i*2.1 + u_time*0.2), cos(i*3.4 + u_time*0.15)) * 0.6;
                            vec2 boxUv = p - pos;
                            boxUv *= rot(sin(u_time*0.1 + i)*0.2); // slight tilt
                            
                            float d = sdBox(boxUv, vec2(0.3, 0.2));
                            float panel = smoothstep(0.01, 0.0, d);
                            
                            // Fake Chrome Bevel
                            float bevel = smoothstep(0.0, -0.05, d) - smoothstep(-0.05, -0.1, d);
                            
                            if (panel > 0.0) {
                                uiLayer = 1.0;
                                // Content: glitched lines
                                float lines = step(0.5, sin(boxUv.y * 100.0 + u_time * 10.0));
                                uiCol = mix(oklab_palette(i * 0.5), vec3(0.8, 1.0, 0.1), lines * 0.3); // Acid yellow accents
                                uiCol += bevel * vec3(0.2, 0.9, 0.8); // Cyan chrome highlight
                            }
                        }
                        
                        // 4. CENTRAL LIVING CODEC PORTAL (Anchor)
                        float portalDist = length(p);
                        float portalRing = abs(portalDist - 0.5) - 0.05 + morpho * 0.1;
                        float portal = smoothstep(0.02, 0.0, portalRing);
                        if (portal > 0.0) {
                            uiLayer = 1.0;
                            uiCol = mix(vec3(1.0, 0.2, 0.0), vec3(0.5, 0.0, 1.0), sin(a*8.0 - u_time*4.0)*0.5+0.5);
                        }

                        // COMPOSITE
                        vec3 finalCol = mix(bgCol, opCol, 0.5); // Base op-art
                        finalCol = mix(finalCol, cellCol, cellShape * 0.8); // Add cuttlefish
                        finalCol = mix(finalCol, uiCol, uiLayer); // Add UI

                        fragColor = vec4(finalCol, 1.0);
                    }
                `
            });

            // --- PASS 3: DATAMOSH & TEMPORAL GHOSTING ---
            const matMosh = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: { u_time: { value: 0 }, u_resolution: { value: new THREE.Vector2() }, u_draw: { value: null }, u_prev: { value: null } },
                vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
                fragmentShader: `
                    ${glslHeader}
                    uniform sampler2D u_draw;
                    uniform sampler2D u_prev;
                    out vec4 fragColor;

                    void main() {
                        // Macroblock quantization for motion vectors
                        float blocks = 32.0;
                        vec2 blockUv = floor(vUv * blocks) / blocks;
                        
                        // Generate motion vector from noise and time
                        float nx = noise(blockUv * 5.0 + vec2(u_time * 0.5, 0.0));
                        float ny = noise(blockUv * 5.0 + vec2(0.0, u_time * 0.5));
                        vec2 motion = (vec2(nx, ny) - 0.5) * 0.03;
                        
                        // I-Frame / P-Frame logic (periodic overwrite vs smear)
                        float wipe = step(0.95, fract(u_time * 0.5 + vUv.y * 2.0)); // Glitchy vertical wipes
                        
                        vec2 smearUv = vUv - motion;
                        
                        vec4 current = texture(u_draw, vUv);
                        vec4 previous = texture(u_prev, smearUv);
                        
                        // Compression chew: occasionally drop color channels from previous
                        if (hash(blockUv + u_time) > 0.98) {
                            previous.r = previous.g; 
                        }
                        
                        // Mix current and smeared past. 
                        // High persistence = long trails. Wipe = reset.
                        float persistence = 0.85; 
                        vec4 moshed = mix(previous, current, wipe + 0.15);
                        
                        fragColor = moshed;
                    }
                `
            });

            // --- PASS 4: CROSS-PROCESSING, ABERRATION, COLOR ENFORCEMENT ---
            const matPost = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: { u_time: { value: 0 }, u_resolution: { value: new THREE.Vector2() }, u_mosh: { value: null } },
                vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
                fragmentShader: `
                    ${glslHeader}
                    uniform sampler2D u_mosh;
                    out vec4 fragColor;
                    
                    // S-Curve for tone mapping
                    float sCurve(float x, float contrast, float pivot) {
                        float k = max(0.01, contrast);
                        float a = 1.0 / (1.0 + exp(-k * (x - pivot)));
                        float lo = 1.0 / (1.0 + exp(-k * (0.0 - pivot)));
                        float hi = 1.0 / (1.0 + exp(-k * (1.0 - pivot)));
                        return (a - lo) / (hi - lo);
                    }

                    void main() {
                        vec2 uv = vUv;
                        
                        // 1. PHYSICAL CHROMATIC ABERRATION
                        // Radial dispersion from center
                        vec2 dir = uv - 0.5;
                        float dist = length(dir);
                        float dispersion = dist * 0.03 * (1.0 + 0.5 * sin(u_time * 2.0)); // pulses
                        
                        float r = texture(u_mosh, uv - dir * dispersion).r;
                        float g = texture(u_mosh, uv).g;
                        float b = texture(u_mosh, uv + dir * dispersion * 1.5).b; // Asymmetric B shift
                        vec3 col = vec3(r, g, b);
                        
                        // 2. RASTER TEAR / SCANLINES (Colored, not B/W)
                        float scanline = sin(uv.y * u_resolution.y * 0.5) * 0.5 + 0.5;
                        col += scanline * 0.05 * vec3(0.8, 0.1, 0.5); // Hot pink scanline bleed
                        
                        if (hash(vec2(uv.y, u_time)) > 0.99) {
                            col.gb = col.bg; // Horizontal channel rip
                        }

                        // 3. CROSS-PROCESSING CHEMISTRY
                        // Shift shadows to deep teal/violet, highlights to acid yellow/pink
                        col.r = sCurve(col.r, 4.0, 0.45);
                        col.g = sCurve(col.g, 3.0, 0.5);
                        col.b = sCurve(col.b, 5.0, 0.55);
                        
                        // 4. ABSOLUTE COLOR RULE ENFORCEMENT (NO BLACK, NO WHITE)
                        // We map the luma of the current pixel to a safe, highly saturated range
                        float luma = dot(col, vec3(0.299, 0.587, 0.114));
                        
                        vec3 deepShadow = vec3(0.2, 0.0, 0.4);      // Deep Indigo/Plum
                        vec3 midTone = vec3(0.0, 0.8, 0.6);         // Saturated Teal/Emerald
                        vec3 brightHighlight = vec3(1.0, 0.9, 0.0); // Acid Neon Yellow
                        
                        // Construct a new color strictly from saturated palettes based on original luma
                        vec3 safeCol;
                        if (luma < 0.5) {
                            safeCol = mix(deepShadow, midTone, luma * 2.0);
                        } else {
                            safeCol = mix(midTone, brightHighlight, (luma - 0.5) * 2.0);
                        }
                        
                        // Blend original cross-processed color with safe color to retain some detail
                        // while absolutely clamping out blacks and whites.
                        col = mix(col, safeCol, 0.6);
                        
                        // Final clamp to ensure no component hits 0.0 or 1.0 (prevents desaturation to white/black)
                        col = clamp(col, 0.1, 0.95);
                        
                        // Add some vibrant noise (film grain substitute)
                        vec3 noiseCol = vec3(
                            hash(uv + u_time),
                            hash(uv + u_time * 1.1),
                            hash(uv + u_time * 1.2)
                        );
                        col += (noiseCol - 0.5) * 0.08;

                        fragColor = vec4(col, 1.0);
                    }
                `
            });

            // --- MESHES ---
            const meshRD = new THREE.Mesh(geometry, matRD);
            const sceneRD = new THREE.Scene(); sceneRD.add(meshRD);

            const meshDraw = new THREE.Mesh(geometry, matDraw);
            const sceneDraw = new THREE.Scene(); sceneDraw.add(meshDraw);

            const meshMosh = new THREE.Mesh(geometry, matMosh);
            const sceneMosh = new THREE.Scene(); sceneMosh.add(meshMosh);

            const meshPost = new THREE.Mesh(geometry, matPost);
            const scenePost = new THREE.Scene(); scenePost.add(meshPost);

            canvas.__three = {
                renderer, camera,
                rtRD1, rtRD2, rtMosh1, rtMosh2, rtDraw,
                sceneRD, matRD,
                sceneDraw, matDraw,
                sceneMosh, matMosh,
                scenePost, matPost,
                frame: 0
            };
        } catch (e) {
            console.error("Chromatophore Shrine Init Failed:", e);
            return;
        }
    }

    const t = canvas.__three;
    if (!t || !t.renderer) return;

    // Update uniforms
    const res = new THREE.Vector2(grid.width, grid.height);
    
    t.matRD.uniforms.u_time.value = time;
    t.matRD.uniforms.u_resolution.value = res;
    t.matRD.uniforms.u_frame.value = t.frame;

    t.matDraw.uniforms.u_time.value = time;
    t.matDraw.uniforms.u_resolution.value = res;

    t.matMosh.uniforms.u_time.value = time;
    t.matMosh.uniforms.u_resolution.value = res;

    t.matPost.uniforms.u_time.value = time;
    t.matPost.uniforms.u_resolution.value = res;

    t.renderer.setSize(grid.width, grid.height, false);

    // --- RENDER PIPELINE ---

    // 1. Morphogenesis (RD) Ping-Pong (Run a few iterations per frame for stability)
    const rdIters = 4;
    for(let i=0; i<rdIters; i++) {
        const readRD = (t.frame % 2 === 0) ? t.rtRD1 : t.rtRD2;
        const writeRD = (t.frame % 2 === 0) ? t.rtRD2 : t.rtRD1;
        t.matRD.uniforms.u_tex.value = readRD.texture;
        t.renderer.setRenderTarget(writeRD);
        t.renderer.render(t.sceneRD, t.camera);
        t.frame++;
    }
    const currentRD = (t.frame % 2 === 0) ? t.rtRD1 : t.rtRD2;

    // 2. Draw Scene (Op-Art, Cuttlefish, UI)
    t.matDraw.uniforms.u_rd.value = currentRD.texture;
    t.renderer.setRenderTarget(t.rtDraw);
    t.renderer.render(t.sceneDraw, t.camera);

    // 3. Datamosh Feedback Ping-Pong
    const readMosh = (t.frame % 2 === 0) ? t.rtMosh1 : t.rtMosh2;
    const writeMosh = (t.frame % 2 === 0) ? t.rtMosh2 : t.rtMosh1;
    t.matMosh.uniforms.u_draw.value = t.rtDraw.texture;
    t.matMosh.uniforms.u_prev.value = readMosh.texture;
    t.renderer.setRenderTarget(writeMosh);
    t.renderer.render(t.sceneMosh, t.camera);

    // 4. Post-Process (Cross-process, Aberration, Color Clamp) to Screen
    t.matPost.uniforms.u_mosh.value = writeMosh.texture;
    t.renderer.setRenderTarget(null); // Render to canvas
    t.renderer.render(t.scenePost, t.camera);

})(
    typeof ctx !== 'undefined' ? ctx : null,
    typeof grid !== 'undefined' ? grid : { width: 512, height: 512, canvas: null },
    typeof time !== 'undefined' ? time : 0,
    typeof repos !== 'undefined' ? repos : [],
    typeof input !== 'undefined' ? input : "",
    typeof mouse !== 'undefined' ? mouse : { x: 0, y: 0, isPressed: false },
    typeof canvas !== 'undefined' ? canvas : null,
    typeof THREE !== 'undefined' ? THREE : null
);