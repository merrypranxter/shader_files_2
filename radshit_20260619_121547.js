// Prismatic Tape Oracle
// A cohesive generative system fusing dream-physics architecture, cellular automata, 
// op-art, structural color, datamoshing, VHS damage, and risograph print logic.
// All colors are strictly enforced to be saturated (no pure black, no pure white, no neutrals).

const initPrismaticOracle = (ctx, grid, time, repos, input, mouse, canvas, THREE) => {
    // 1. WebGL & Three.js Setup with Context Preservation
    if (!canvas.__three) {
        try {
            if (!ctx) throw new Error("WebGL 2 context not available");

            const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
            // Use FloatType for feedback buffers to preserve data (datamosh/CA)
            const rtOptions = {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: THREE.HalfFloatType || THREE.FloatType, 
                wrapS: THREE.RepeatWrapping,
                wrapT: THREE.RepeatWrapping
            };

            const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
            const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            const sceneBuffer = new THREE.Scene();
            const sceneScreen = new THREE.Scene();
            const geometry = new THREE.PlaneGeometry(2, 2);

            // --- SHADER 1: THE DREAM-PHYSICS ENGINE (BUFFER) ---
            // Handles Raymarching, Cellular Automata, Datamoshing, Op-Art, Structural Color
            const bufferMat = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_time: { value: 0 },
                    u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                    u_feedback: { value: null }
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
                    uniform sampler2D u_feedback;

                    // --- NOISE & MATH ---
                    mat2 rot(float a) {
                        float s = sin(a), c = cos(a);
                        return mat2(c, -s, s, c);
                    }
                    float hash(vec2 p) {
                        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                    }
                    float noise(vec2 p) {
                        vec2 i = floor(p), f = fract(p);
                        f = f*f*(3.0-2.0*f);
                        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                                   mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
                    }

                    // --- DREAM PHYSICS ARCHITECTURE (SDF) ---
                    float sdBox(vec3 p, vec3 b) {
                        vec3 q = abs(p) - b;
                        return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
                    }

                    vec2 map(vec3 p) {
                        vec3 p0 = p;
                        
                        // Kairotempics: Space twists with time
                        p.xy *= rot(p.z * 0.05 + u_time * 0.2);
                        
                        // Impossible Space: Recursive folding
                        p.x = mod(p.x + 4.0, 8.0) - 4.0;
                        p.y = mod(p.y + 4.0, 8.0) - 4.0;

                        // Central Oracle Tunnel
                        float dTunnel = length(p.xy) - 2.5 + sin(p.z * 2.0 - u_time)*0.3;
                        
                        // Early Internet Debris (Floating Browser Panels)
                        vec3 pBox = p0;
                        pBox.z = mod(pBox.z + u_time * 2.0, 10.0) - 5.0;
                        pBox.xy *= rot(u_time * 0.5);
                        float dPanels = sdBox(pBox - vec3(1.5, 0.0, 0.0), vec3(0.8, 0.5, 0.05)) - 0.05;
                        
                        // Glitch Core: Intersecting geometry
                        float dCore = length(pBox + vec3(1.5, 0.0, 0.0)) - 0.6;
                        dPanels = max(dPanels, -dCore); // Hollow out boxes

                        float d = min(dTunnel, dPanels);
                        
                        // Op-Art Pressure Fields (Displacement)
                        float opArt = sin(p.x * 20.0) * sin(p.y * 20.0) * sin(p.z * 10.0);
                        d += opArt * 0.02;

                        return vec2(d, dTunnel < dPanels ? 1.0 : 2.0);
                    }

                    vec3 calcNormal(vec3 p) {
                        vec2 e = vec2(0.01, 0.0);
                        return normalize(vec3(
                            map(p + e.xyy).x - map(p - e.xyy).x,
                            map(p + e.yxy).x - map(p - e.yxy).x,
                            map(p + e.yyx).x - map(p - e.yyx).x
                        ));
                    }

                    // --- STRUCTURAL COLOR (Cosine Palette) ---
                    vec3 structColor(float t) {
                        vec3 a = vec3(0.5);
                        vec3 b = vec3(0.5);
                        vec3 c = vec3(1.0);
                        vec3 d = vec3(0.0, 0.33, 0.67);
                        return a + b * cos(6.28318 * (c * t + d));
                    }

                    void main() {
                        vec2 uv = vUv;
                        vec2 p = (uv - 0.5) * 2.0;
                        p.x *= u_resolution.x / u_resolution.y;

                        // --- CELLULAR AUTOMATA (Lenia-lite continuous CA) ---
                        // Stored in alpha channel of feedback
                        vec2 texel = 1.0 / u_resolution;
                        float caState = texture(u_feedback, uv).a;
                        float neighbors = 0.0;
                        for(float x = -1.0; x <= 1.0; x++) {
                            for(float y = -1.0; y <= 1.0; y++) {
                                if(x!=0.0 || y!=0.0) {
                                    neighbors += texture(u_feedback, fract(uv + vec2(x,y)*texel*2.0)).a;
                                }
                            }
                        }
                        neighbors /= 8.0;
                        // Activation rule: thrive at mid-density, die at extremes
                        float nextCA = caState + (0.1 * (sin(neighbors * 3.1415 * 3.0) - 0.1));
                        nextCA = clamp(nextCA, 0.0, 1.0);
                        if(u_time < 0.2) nextCA = noise(uv * 10.0); // Seed

                        // --- DATAMOSH MEMORY SMEAR ---
                        // Use CA state to drive motion vectors
                        vec2 moshVec = vec2(
                            noise(uv * 5.0 + u_time) - 0.5,
                            noise(uv * 5.0 - u_time) - 0.5
                        ) * 0.02 * nextCA;
                        
                        vec3 prevColor = texture(u_feedback, fract(uv - moshVec)).rgb;

                        // --- RAYMARCHING ---
                        vec3 ro = vec3(0.0, 0.0, -3.0 + u_time * 0.5);
                        vec3 rd = normalize(vec3(p, 1.5));
                        float t = 0.0;
                        float matId = 0.0;
                        vec3 col = vec3(0.0);
                        bool hit = false;

                        for(int i = 0; i < 60; i++) {
                            vec3 pos = ro + rd * t;
                            vec2 res = map(pos);
                            if(res.x < 0.01) {
                                hit = true;
                                matId = res.y;
                                break;
                            }
                            t += res.x * 0.7; // Ray step reduction for folded space
                            if(t > 15.0) break;
                        }

                        if(hit) {
                            vec3 pos = ro + rd * t;
                            vec3 nor = calcNormal(pos);
                            vec3 ref = reflect(rd, nor);
                            
                            // Structural Color / Iridescence
                            float fresnel = pow(1.0 - max(dot(nor, -rd), 0.0), 2.0);
                            vec3 structCol = structColor(fresnel + u_time * 0.1);
                            
                            if(matId == 1.0) {
                                // Tunnel: Moiré banding
                                float moire = sin(pos.z * 40.0) * sin(pos.x * 40.0);
                                col = structCol * (0.5 + 0.5 * moire);
                            } else {
                                // Panels: Glowing edges
                                col = mix(structCol, vec3(1.0, 0.2, 0.6), fresnel);
                            }
                            
                            // Distance fog (colored)
                            col = mix(col, vec3(0.1, 0.0, 0.3), smoothstep(2.0, 15.0, t));
                        }

                        // --- BLEND: Raymarch + Datamosh Ghosting ---
                        // If no hit, show datamoshed background heavily. If hit, blend slightly.
                        float blendFactor = hit ? 0.2 : 0.95;
                        vec3 finalRGB = mix(col, prevColor, blendFactor);

                        // Inject CA visual pulses
                        finalRGB += vec3(0.0, 0.5, 0.5) * nextCA * 0.1;

                        fragColor = vec4(finalRGB, nextCA);
                    }
                `
            });

            // --- SHADER 2: POST-PROCESSING ENGINE (SCREEN) ---
            // Handles VHS, Risograph, Cross-Processing, Chromatic Aberration, Absolute Color Rules
            const screenMat = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_time: { value: 0 },
                    u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                    u_buffer: { value: null }
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
                    uniform sampler2D u_buffer;

                    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
                    float noise(vec2 p) {
                        vec2 i = floor(p), f = fract(p);
                        f = f*f*(3.0-2.0*f);
                        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                                   mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
                    }

                    // --- RISOGRAPH HALFTONE ---
                    float halftone(vec2 uv, float angle, float lpi) {
                        float s = sin(angle), c = cos(angle);
                        vec2 rotUV = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
                        vec2 grid = fract(rotUV * lpi) - 0.5;
                        return smoothstep(0.4, 0.0, length(grid));
                    }

                    // --- OKLAB PERCEPTUAL MAPPING (Color Systems) ---
                    // Enforces absolute color rules: NO black, NO white, NO neutrals.
                    vec3 enforcePalette(vec3 col) {
                        float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
                        
                        // Strict Saturated Palette
                        vec3 shadow1 = vec3(0.1, 0.0, 0.4); // Indigo
                        vec3 shadow2 = vec3(0.0, 0.2, 0.3); // Deep Teal
                        vec3 mid1 = vec3(1.0, 0.1, 0.6);    // Hot Pink
                        vec3 mid2 = vec3(0.0, 0.8, 0.9);    // Electric Cyan
                        vec3 high1 = vec3(0.8, 1.0, 0.0);   // Acid Yellow
                        vec3 high2 = vec3(1.0, 0.4, 0.0);   // Fluorescent Orange

                        // Non-linear, aggressive cross-processing mapping
                        vec3 outCol;
                        if(luma < 0.33) {
                            outCol = mix(shadow1, shadow2, luma * 3.0);
                        } else if(luma < 0.66) {
                            outCol = mix(mid1, mid2, (luma - 0.33) * 3.0);
                        } else {
                            outCol = mix(high1, high2, (luma - 0.66) * 3.0);
                        }

                        // Blend original hue slightly, but clamped to maintain high saturation
                        vec3 mixed = mix(outCol, clamp(col, 0.2, 0.9), 0.4);
                        
                        // Final safety clamp to prevent ANY pure black or white
                        return clamp(mixed, 0.05, 0.95);
                    }

                    void main() {
                        vec2 uv = vUv;
                        
                        // --- VHS TRACKING & DAMAGE ---
                        // Horizontal wobble
                        float wobble = sin(uv.y * 10.0 + u_time * 5.0) * 0.005;
                        wobble += noise(vec2(uv.y * 50.0, u_time * 10.0)) * 0.01;
                        vec2 vhsUV = uv + vec2(wobble, 0.0);
                        
                        // Head switching band at bottom
                        if(vhsUV.y < 0.05) vhsUV.x += hash(vec2(vhsUV.y, u_time)) * 0.05;

                        // Colored Dropout Streaks (Damage Aesthetics)
                        float dropout = step(0.98, hash(vec2(vhsUV.y * 100.0, floor(u_time * 20.0))));
                        vec3 dropoutColor = vec3(1.0, 0.0, 0.8); // Hot pink dropouts, NEVER white

                        // --- CHROMATIC ABERRATION (Misregistration) ---
                        // Read from buffer with offsets
                        float caOff = 0.01 + 0.005 * sin(u_time);
                        float r = texture(u_buffer, vhsUV + vec2(caOff, 0.0)).r;
                        float g = texture(u_buffer, vhsUV).g;
                        float b = texture(u_buffer, vhsUV - vec2(caOff, 0.0)).b;
                        vec3 baseCol = vec3(r, g, b);

                        // --- RISOGRAPH PRINT LOGIC ---
                        // Apply halftone texture based on screen coordinates
                        float lpi = u_resolution.y * 0.15; // Screen-relative dot size
                        float htR = halftone(gl_FragCoord.xy, 0.26, lpi); // 15 deg
                        float htG = halftone(gl_FragCoord.xy, 1.30, lpi); // 75 deg
                        float htB = halftone(gl_FragCoord.xy, 0.00, lpi); // 0 deg
                        
                        // Multiply blend logic (Riso ink overlap)
                        baseCol *= vec3(0.5 + 0.5 * htR, 0.5 + 0.5 * htG, 0.5 + 0.5 * htB);

                        // Add Dropouts
                        baseCol = mix(baseCol, dropoutColor, dropout);

                        // --- CROSS PROCESSING & ABSOLUTE COLOR ENFORCEMENT ---
                        vec3 finalCol = enforcePalette(baseCol);

                        fragColor = vec4(finalCol, 1.0);
                    }
                `
            });

            const meshBuffer = new THREE.Mesh(geometry, bufferMat);
            sceneBuffer.add(meshBuffer);

            const meshScreen = new THREE.Mesh(geometry, screenMat);
            sceneScreen.add(meshScreen);

            canvas.__three = { 
                renderer, 
                camera, 
                sceneBuffer, 
                sceneScreen, 
                bufferMat, 
                screenMat,
                rtA, 
                rtB,
                pingpong: 0
            };
        } catch (e) {
            console.error("WebGL Initialization Failed:", e);
            return;
        }
    }

    const { renderer, camera, sceneBuffer, sceneScreen, bufferMat, screenMat, rtA, rtB } = canvas.__three;

    if (bufferMat && screenMat) {
        // Update dimensions
        renderer.setSize(grid.width, grid.height, false);
        const res = new THREE.Vector2(grid.width, grid.height);
        
        bufferMat.uniforms.u_time.value = time;
        bufferMat.uniforms.u_resolution.value = res;
        screenMat.uniforms.u_time.value = time;
        screenMat.uniforms.u_resolution.value = res;

        // Ping-Pong Logic
        let readTarget = canvas.__three.pingpong % 2 === 0 ? rtA : rtB;
        let writeTarget = canvas.__three.pingpong % 2 === 0 ? rtB : rtA;

        // PASS 1: Render Dream-Physics/CA to Write Target, reading from Read Target
        bufferMat.uniforms.u_feedback.value = readTarget.texture;
        renderer.setRenderTarget(writeTarget);
        renderer.render(sceneBuffer, camera);

        // PASS 2: Render Post-Processing to Screen, reading from Write Target
        screenMat.uniforms.u_buffer.value = writeTarget.texture;
        renderer.setRenderTarget(null);
        renderer.render(sceneScreen, camera);

        // Swap
        canvas.__three.pingpong++;
    }
};

return initPrismaticOracle;