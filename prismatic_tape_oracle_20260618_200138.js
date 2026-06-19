function createPrismaticTapeOracle(ctx, grid, time, repos, input, mouse, canvas, THREE) {
    if (!canvas.__three) {
        try {
            if (!ctx) throw new Error("WebGL 2 context not available");

            const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            
            const scene = new THREE.Scene();
            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

            const w = grid.width;
            const h = grid.height;

            // Ping-Pong FBOs for Logic (Cellular Automata & Flow)
            const rtOpts = {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: THREE.FloatType,
                depthBuffer: false,
                stencilBuffer: false
            };
            const logicA = new THREE.WebGLRenderTarget(w, h, rtOpts);
            const logicB = new THREE.WebGLRenderTarget(w, h, rtOpts);

            // Ping-Pong FBOs for Visuals (Datamosh Memory & Trails)
            const visualA = new THREE.WebGLRenderTarget(w, h, rtOpts);
            const visualB = new THREE.WebGLRenderTarget(w, h, rtOpts);

            const oklabCore = `
                vec3 linear_srgb_to_oklab(vec3 c) {
                    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
                    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
                    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
                    float l_ = pow(max(l, 0.0), 1.0/3.0);
                    float m_ = pow(max(m, 0.0), 1.0/3.0);
                    float s_ = pow(max(s, 0.0), 1.0/3.0);
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
                vec3 linear_to_srgb(vec3 c) {
                    vec3 sq1 = sqrt(c);
                    vec3 sq2 = sqrt(sq1);
                    vec3 sq3 = sqrt(sq2);
                    vec3 srgb = 0.662002687 * sq1 + 0.684122060 * sq2 - 0.323583601 * sq3 - 0.022541147 * c;
                    return clamp(srgb, 0.0, 1.0);
                }
                vec3 oklab_mix(vec3 c1, vec3 c2, float t) {
                    vec3 lab1 = linear_srgb_to_oklab(c1);
                    vec3 lab2 = linear_srgb_to_oklab(c2);
                    return linear_to_srgb(oklab_to_linear_srgb(mix(lab1, lab2, t)));
                }
                // STRICT PALETTE ENFORCER (No Blacks, No Whites, Saturated Only)
                vec3 getSaturatedPalette(float t) {
                    // 0.0: Deep Plum/Indigo, 0.3: Teal, 0.6: Hot Pink, 0.8: Neon Cyan, 1.0: Acid Yellow
                    vec3 c1 = vec3(0.18, 0.02, 0.25); // Plum Indigo
                    vec3 c2 = vec3(0.0, 0.35, 0.45);  // Deep Teal
                    vec3 c3 = vec3(1.0, 0.0, 0.45);   // Hot Pink
                    vec3 c4 = vec3(0.0, 0.95, 0.95);  // Neon Cyan
                    vec3 c5 = vec3(0.85, 1.0, 0.0);   // Acid Yellow
                    
                    t = clamp(t, 0.0, 1.0);
                    if(t < 0.25) return oklab_mix(c1, c2, t * 4.0);
                    if(t < 0.50) return oklab_mix(c2, c3, (t - 0.25) * 4.0);
                    if(t < 0.75) return oklab_mix(c3, c4, (t - 0.50) * 4.0);
                    return oklab_mix(c4, c5, (t - 0.75) * 4.0);
                }
            `;

            // --- LOGIC SHADER (Cellular Automata & Flow) ---
            const logicMaterial = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_time: { value: 0 },
                    u_res: { value: new THREE.Vector2(w, h) },
                    u_state: { value: null }
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
                    uniform vec2 u_res;
                    uniform sampler2D u_state;

                    // Pseudo-random & Noise
                    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
                    float noise(vec2 p) {
                        vec2 i = floor(p), f = fract(p);
                        f = f*f*(3.0-2.0*f);
                        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                                   mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
                    }

                    void main() {
                        vec2 texel = 1.0 / u_res;
                        
                        // Seed condition
                        if (u_time < 0.1) {
                            fragColor = vec4(hash(vUv * 10.0) > 0.6 ? 1.0 : 0.0, 0.0, 0.0, 0.0);
                            return;
                        }

                        vec4 curr = texture(u_state, vUv);
                        
                        // Continuous CA (Lenia-inspired)
                        float sum = 0.0;
                        float weight = 0.0;
                        int r = 3;
                        for(int y = -r; y <= r; y++) {
                            for(int x = -r; x <= r; x++) {
                                float d = length(vec2(x,y));
                                if(d > 0.0 && d <= float(r)) {
                                    float w = exp(-d*d/4.0);
                                    sum += texture(u_state, fract(vUv + vec2(x,y)*texel)).r * w;
                                    weight += w;
                                }
                            }
                        }
                        sum /= weight;
                        
                        // Growth function (bureaucratic failure / fungal bloom)
                        float growth = exp(-pow(sum - 0.25, 2.0) / 0.02) * 2.0 - 0.9;
                        float nextState = clamp(curr.r + growth * 0.1, 0.0, 1.0);
                        
                        // Flow field (Datamosh vectors)
                        float nx = noise(vUv * 3.0 + u_time * 0.2);
                        float ny = noise(vUv * 3.0 - u_time * 0.2 + 100.0);
                        vec2 flow = vec2(nx, ny) * 2.0 - 1.0;
                        
                        // Attract flow towards high CA activity
                        vec2 grad = vec2(
                            texture(u_state, fract(vUv + vec2(texel.x, 0.0))).r - curr.r,
                            texture(u_state, fract(vUv + vec2(0.0, texel.y))).r - curr.r
                        );
                        flow += grad * 5.0;

                        fragColor = vec4(nextState, flow.x, flow.y, curr.a + 0.01);
                    }
                `
            });

            // --- VISUAL SHADER (Raymarching, Riso, VHS, Structural Color) ---
            const visualMaterial = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_time: { value: 0 },
                    u_res: { value: new THREE.Vector2(w, h) },
                    u_logic: { value: null },
                    u_prev_visual: { value: null }
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
                    uniform vec2 u_res;
                    uniform sampler2D u_logic;
                    uniform sampler2D u_prev_visual;

                    ${oklabCore}

                    // 2D Rot
                    mat2 rot(float a) { float s=sin(a), c=cos(a); return mat2(c, -s, s, c); }

                    // SDFs
                    float sdBox(vec3 p, vec3 b) {
                        vec3 q = abs(p) - b;
                        return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
                    }
                    float sdTorus(vec3 p, vec2 t) {
                        vec2 q = vec2(length(p.xy)-t.x,p.z);
                        return length(q)-t.y;
                    }

                    // Scene Map
                    vec2 map(vec3 p) {
                        // Dream Physics: Mnemonic Gravity (Space bending)
                        float warp = sin(p.y * 2.0 + u_time) * 0.2;
                        p.x += warp;

                        // Op-Art Portal (Center)
                        vec3 pPortal = p;
                        pPortal.z += u_time * 0.5;
                        pPortal.z = mod(pPortal.z, 2.0) - 1.0;
                        float portal = sdTorus(pPortal, vec2(1.5, 0.1 + sin(length(p.xy)*10.0 - u_time*5.0)*0.05));
                        
                        // Early Internet Floating Panels
                        vec3 pBox = p;
                        pBox.xy *= rot(u_time * 0.1);
                        pBox.xz = mod(pBox.xz, 4.0) - 2.0;
                        float boxes = sdBox(pBox, vec3(0.6, 0.8, 0.05));
                        // Cutout / Bevel
                        boxes = max(boxes, -sdBox(pBox, vec3(0.5, 0.7, 0.1)));

                        float d = min(portal, boxes);
                        float mat = portal < boxes ? 1.0 : 2.0;
                        return vec2(d, mat);
                    }

                    vec3 calcNormal(vec3 p) {
                        vec2 e = vec2(0.01, 0.0);
                        return normalize(vec3(
                            map(p+e.xyy).x - map(p-e.xyy).x,
                            map(p+e.yxy).x - map(p-e.yxy).x,
                            map(p+e.yyx).x - map(p-e.yyx).x
                        ));
                    }

                    // Structural Color (Iridescence)
                    vec3 structuralColor(float cosTheta, float matID) {
                        float thickness = matID == 1.0 ? 400.0 : 600.0; 
                        float pathDiff = 2.0 * 1.5 * thickness * cosTheta;
                        float phase = fract((pathDiff / 500.0) + u_time*0.1);
                        return getSaturatedPalette(phase);
                    }

                    // Riso Halftone
                    float halftone(vec2 uv, float angle, float lpi) {
                        vec2 rotUV = rot(angle) * uv;
                        vec2 cell = fract(rotUV * lpi) - 0.5;
                        return length(cell);
                    }

                    void main() {
                        vec2 uv = vUv;
                        vec4 logic = texture(u_logic, uv);
                        float caState = logic.r;
                        vec2 flow = logic.gb;

                        // -- 1. DATAMOSH & TEMPORAL GHOSTING --
                        // Warp UVs based on flow, but only where CA is active (Fungal memory growth)
                        vec2 warpUV = uv + flow * 0.02 * caState;
                        // VHS Tracking Tear (Horizontal wobble)
                        float tracking = sin(uv.y * 50.0 - u_time * 10.0) * exp(-pow(fract(u_time*0.5 + uv.y) - 0.5, 2.0)*100.0);
                        warpUV.x += tracking * 0.05;
                        
                        vec3 pastColor = texture(u_prev_visual, warpUV).rgb;

                        // -- 2. 3D DREAM ARCHITECTURE --
                        vec3 ro = vec3(0.0, 0.0, 4.0);
                        vec3 rd = normalize(vec3((uv - 0.5) * 2.0, -1.0));
                        // Slight camera wobble
                        rd.xy *= rot(sin(u_time*0.2)*0.1);

                        float t = 0.0;
                        vec2 res = vec2(0.0);
                        for(int i=0; i<60; i++) {
                            vec3 p = ro + rd * t;
                            res = map(p);
                            if(res.x < 0.01 || t > 10.0) break;
                            t += res.x;
                        }

                        vec3 sceneColor = vec3(0.0);
                        if(t < 10.0) {
                            vec3 p = ro + rd * t;
                            vec3 n = calcNormal(p);
                            float viewAngle = max(0.0, dot(n, -rd));
                            
                            // Base Structural Color
                            sceneColor = structuralColor(viewAngle, res.y);
                            
                            // Op-Art surface pressure
                            float opArt = sin(length(p.xy)*20.0 - u_time*5.0);
                            sceneColor = oklab_mix(sceneColor, getSaturatedPalette(opArt*0.5+0.5), 0.3);
                        } else {
                            // Background Void: Not black, but a deep saturated field
                            float bgPhase = sin(uv.x*5.0 + u_time) * cos(uv.y*3.0 - u_time);
                            sceneColor = getSaturatedPalette(bgPhase * 0.2 + 0.1); // Deep indigos/teals
                        }

                        // Combine 3D with Datamosh Memory
                        // The CA state dictates where memory overwrites reality
                        vec3 blendedScene = oklab_mix(sceneColor, pastColor, clamp(caState * 0.85, 0.0, 0.95));

                        // -- 3. VHS DAMAGE & CHROMA BLEED --
                        // Horizontal sample offset for chromatic aberration
                        float bleedOffset = 0.01 * (1.0 + tracking * 10.0);
                        float r = texture(u_prev_visual, warpUV + vec2(bleedOffset, 0.0)).r;
                        float b = texture(u_prev_visual, warpUV - vec2(bleedOffset, 0.0)).b;
                        blendedScene.r = mix(blendedScene.r, r, 0.5);
                        blendedScene.b = mix(blendedScene.b, b, 0.5);

                        // -- 4. RISOGRAPH PRINT LOGIC --
                        // Deconstruct into 3 "Inks" (Pink, Cyan, Yellow) and print over Deep Indigo paper
                        vec3 inkPink = getSaturatedPalette(0.6);
                        vec3 inkCyan = getSaturatedPalette(0.8);
                        vec3 inkYellow = getSaturatedPalette(1.0);
                        vec3 paperColor = getSaturatedPalette(0.0); // Indigo instead of white

                        // Calculate coverage based on luminance and color proximity
                        float luma = dot(blendedScene, vec3(0.299, 0.587, 0.114));
                        
                        // LPI and Misregistration
                        float lpi = 80.0;
                        vec2 misreg = vec2(sin(u_time), cos(u_time)) * 0.005;

                        float hPink = halftone(uv + misreg, radians(15.0), lpi);
                        float hCyan = halftone(uv - misreg, radians(75.0), lpi);
                        float hYellow = halftone(uv, radians(45.0), lpi);

                        // Thresholding (dot gain)
                        float wPink = step(hPink, luma * 1.2);
                        float wCyan = step(hCyan, (1.0-blendedScene.r) * 1.2);
                        float wYellow = step(hYellow, blendedScene.g * 1.2);

                        // Multiply Blend in Linear Space
                        vec3 finalRiso = paperColor;
                        finalRiso = mix(finalRiso, inkPink, wPink * 0.8);
                        finalRiso = mix(finalRiso, inkCyan, wCyan * 0.8);
                        // Multiply overlap logic simulated via OKLab mix
                        if(wPink > 0.0 && wCyan > 0.0) finalRiso = oklab_mix(inkPink, inkCyan, 0.5);
                        finalRiso = mix(finalRiso, inkYellow, wYellow * 0.8);

                        // -- 5. FINAL CROSS-PROCESSING & ENFORCEMENT --
                        // Ensure the final output strictly adheres to the "No Black/White" rule
                        float finalLuma = dot(finalRiso, vec3(0.2126, 0.7152, 0.0722));
                        vec3 enforcedColor = getSaturatedPalette(finalLuma);
                        
                        // Mix the riso texture back in, but keep it bounded
                        fragColor = vec4(oklab_mix(enforcedColor, finalRiso, 0.4), 1.0);
                    }
                `
            });

            // Output Material (Just copies Visual Buffer to screen)
            const outputMaterial = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: { u_tex: { value: null } },
                vertexShader: `
                    out vec2 vUv;
                    void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
                `,
                fragmentShader: `
                    in vec2 vUv;
                    out vec4 fragColor;
                    uniform sampler2D u_tex;
                    void main() { fragColor = texture(u_tex, vUv); }
                `
            });

            const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
            scene.add(quad);

            canvas.__three = { 
                renderer, scene, camera, quad, 
                logicA, logicB, visualA, visualB, 
                logicMaterial, visualMaterial, outputMaterial,
                pingpong: 0
            };
        } catch (e) {
            console.error("WebGL Initialization Failed:", e);
            return;
        }
    }

    const sys = canvas.__three;
    if (!sys || !sys.logicMaterial) return;

    // 1. Update Logic (CA & Datamosh Vectors)
    const currentLogic = sys.pingpong % 2 === 0 ? sys.logicA : sys.logicB;
    const nextLogic = sys.pingpong % 2 === 0 ? sys.logicB : sys.logicA;
    
    sys.logicMaterial.uniforms.u_time.value = time;
    sys.logicMaterial.uniforms.u_state.value = currentLogic.texture;
    sys.quad.material = sys.logicMaterial;
    sys.renderer.setRenderTarget(nextLogic);
    sys.renderer.render(sys.scene, sys.camera);

    // 2. Update Visuals (Raymarch, Riso, VHS, Ghosting)
    const currentVisual = sys.pingpong % 2 === 0 ? sys.visualA : sys.visualB;
    const nextVisual = sys.pingpong % 2 === 0 ? sys.visualB : sys.visualA;

    sys.visualMaterial.uniforms.u_time.value = time;
    sys.visualMaterial.uniforms.u_logic.value = nextLogic.texture;
    sys.visualMaterial.uniforms.u_prev_visual.value = currentVisual.texture;
    sys.quad.material = sys.visualMaterial;
    sys.renderer.setRenderTarget(nextVisual);
    sys.renderer.render(sys.scene, sys.camera);

    // 3. Render to Screen
    sys.outputMaterial.uniforms.u_tex.value = nextVisual.texture;
    sys.quad.material = sys.outputMaterial;
    sys.renderer.setRenderTarget(null);
    sys.renderer.render(sys.scene, sys.camera);

    sys.pingpong++;
}