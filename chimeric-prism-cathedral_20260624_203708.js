/**
 * Chimeric Prism Cathedral
 * A maximal optical-art environment fusing glass-patterns, alchemical SDFs, 
 * birefringence, plasma filaments, and chimerical afterimages.
 */

if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        renderer.autoClear = false;

        const sceneCathedral = new THREE.Scene();
        const sceneFeedback = new THREE.Scene();
        const sceneScreen = new THREE.Scene();

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const rtOptions = { 
            type: THREE.FloatType, 
            minFilter: THREE.LinearFilter, 
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat 
        };
        const rtCathedral = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
        const rtFeedbackA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
        const rtFeedbackB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

        const uniforms = {
            u_time: { value: 0 },
            u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
            u_aspect: { value: grid.width / grid.height },
            u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
            u_clickPos: { value: new THREE.Vector2(0.5, 0.5) },
            u_clickTime: { value: -10.0 },
            u_mode: { value: 0.0 },
            u_showGlass: { value: 1.0 },
            u_showSymbols: { value: 1.0 },
            u_chromaDepth: { value: 1.0 },
            u_birefringence: { value: 1.0 }
        };

        const vertexShader = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        // ====================================================================
        // PASS 1: CATHEDRAL (The Core Optical Engine)
        // ====================================================================
        const fragCathedral = `
            in vec2 vUv;
            out vec4 fragColor;

            uniform float u_time;
            uniform vec2 u_resolution;
            uniform float u_aspect;
            uniform vec2 u_mouse;
            uniform vec2 u_clickPos;
            uniform float u_clickTime;
            uniform float u_mode;
            uniform float u_showGlass;
            uniform float u_showSymbols;
            uniform float u_chromaDepth;
            uniform float u_birefringence;

            const float PI = 3.14159265359;

            float hash12(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }

            vec2 hash22(vec2 p) {
                p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
                return -1.0 + 2.0*fract(sin(p)*43758.5453);
            }

            float valueNoise(vec2 p) {
                vec2 i = floor(p), f = fract(p);
                vec2 u = f*f*(3.0-2.0*f);
                return mix(mix(dot(hash22(i+vec2(0.0,0.0)), f-vec2(0.0,0.0)),
                               dot(hash22(i+vec2(1.0,0.0)), f-vec2(1.0,0.0)), u.x),
                           mix(dot(hash22(i+vec2(0.0,1.0)), f-vec2(0.0,1.0)),
                               dot(hash22(i+vec2(1.0,1.0)), f-vec2(1.0,1.0)), u.x), u.y);
            }

            float fbm(vec2 p) {
                float v = 0.0, a = 0.5;
                for (int i=0; i<4; i++) {
                    v += a * valueNoise(p);
                    p = p * 2.0 + vec2(1.7, 9.2);
                    a *= 0.5;
                }
                return v;
            }

            // OKLab conversions for perceptual gradients
            vec3 linear_srgb_to_oklab(vec3 c) {
                float l = 0.4122214708*c.r + 0.5363325363*c.g + 0.0514459929*c.b;
                float m = 0.2119034982*c.r + 0.6806995451*c.g + 0.1073969566*c.b;
                float s = 0.0883024619*c.r + 0.2817188376*c.g + 0.6299787005*c.b;
                float l_ = pow(max(l,0.0), 1.0/3.0);
                float m_ = pow(max(m,0.0), 1.0/3.0);
                float s_ = pow(max(s,0.0), 1.0/3.0);
                return vec3(
                    0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_,
                    1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_,
                    0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_
                );
            }

            vec3 oklab_to_linear_srgb(vec3 c) {
                float l_ = c.x + 0.3963377774*c.y + 0.2158037573*c.z;
                float m_ = c.x - 0.1055613458*c.y - 0.0638541728*c.z;
                float s_ = c.x - 0.0894841775*c.y - 1.2914855480*c.z;
                float l = l_*l_*l_;
                float m = m_*m_*m_;
                float s = s_*s_*s_;
                return vec3(
                     4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
                    -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
                    -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
                );
            }

            vec3 oklabMix(vec3 a, vec3 b, float t) {
                vec3 oa = linear_srgb_to_oklab(a);
                vec3 ob = linear_srgb_to_oklab(b);
                return oklab_to_linear_srgb(mix(oa, ob, t));
            }

            vec3 getPalette(float t) {
                t = fract(t);
                if (u_mode < 0.5) return oklabMix(vec3(0.9, 0.0, 0.5), vec3(0.0, 0.9, 0.8), t);
                if (u_mode < 1.5) return oklabMix(vec3(0.1, 0.0, 0.8), vec3(0.9, 0.5, 0.0), t);
                if (u_mode < 2.5) return oklabMix(vec3(0.8, 0.0, 0.0), vec3(0.6, 1.0, 0.0), t);
                if (u_mode < 3.5) return oklabMix(vec3(0.4, 0.0, 1.0), vec3(0.0, 1.0, 0.9), t);
                return oklabMix(vec3(1.0, 0.0, 0.4), vec3(1.0, 0.6, 0.0), t);
            }

            vec3 wavelengthToRGB(float W) {
                float r = exp(-pow(W - 570.0, 2.0) / 2000.0) + 0.3 * exp(-pow(W - 610.0, 2.0) / 1500.0);
                float g = exp(-pow(W - 545.0, 2.0) / 1500.0);
                float b = exp(-pow(W - 440.0, 2.0) / 1800.0);
                return vec3(r, g, b);
            }

            float sdHexagram(vec2 p, float r) {
                const vec3 k = vec3(-0.5, 0.8660254038, 0.5773502692);
                p = abs(p);
                p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
                p -= 2.0 * min(dot(vec2(k.y, -k.x), p), 0.0) * vec2(k.y, -k.x);
                p -= vec2(clamp(p.x, r * k.z, r * k.y), r);
                return length(p) * sign(p.y);
            }

            float mapCathedral(vec2 p) {
                float d = length(p) - 0.15; 
                float a = atan(p.y, p.x);
                float r = length(p);
                
                for(int i=1; i<=4; i++) {
                    float fi = float(i);
                    float sector = PI / (4.0 + fi);
                    float aMod = mod(a + u_time * 0.05 * fi, sector) - sector/2.0;
                    vec2 pPol = vec2(cos(aMod), sin(aMod)) * r;
                    float dRing = length(pPol - vec2(0.25 * fi, 0.0)) - 0.12 * fi;
                    dRing = max(dRing, abs(pPol.y) - 0.05 * fi);
                    d = min(d, dRing);
                }
                return d;
            }

            void main() {
                vec2 p = (vUv - 0.5) * 2.0;
                p.x *= u_aspect;

                // Mouse Gravity Warp
                vec2 m = (u_mouse - 0.5) * 2.0;
                m.x *= u_aspect;
                float mouseDist = length(p - m);
                p += normalize(p - m) * 0.15 * exp(-mouseDist * 4.0);

                // Base Color Field
                vec3 bg = getPalette(fbm(p * 2.0 + u_time * 0.1));

                // Birefringence / Mineral Thin-Section
                if (u_birefringence > 0.5) {
                    float thick = fbm(p * 4.0 - u_time * 0.15);
                    float retardance = thick * 2500.0;
                    vec3 biref = 0.5 + 0.5 * cos(PI * retardance / vec3(650.0, 510.0, 450.0));
                    bg = mix(bg, biref, 0.6);
                }

                float d = mapCathedral(p);

                // Chromadepth / Shape Color
                vec3 shapeCol = getPalette(fract(d * 3.0 - u_time * 0.4));
                if (u_chromaDepth > 0.5) {
                    float depthHue = smoothstep(-0.6, 0.6, d);
                    shapeCol = oklabMix(vec3(1.0, 0.1, 0.0), vec3(0.0, 0.2, 1.0), depthHue);
                }

                vec3 finalCol = mix(bg, shapeCol, smoothstep(0.02, -0.02, d));

                // Chromostereopsis Pure Red/Blue Edges
                float rimRed = smoothstep(0.02, 0.0, d - 0.015);
                float rimBlue = smoothstep(0.02, 0.0, d + 0.015);
                finalCol = mix(finalCol, vec3(1.0, 0.0, 0.1), rimRed * 0.6);
                finalCol = mix(finalCol, vec3(0.0, 0.1, 1.0), rimBlue * 0.6);

                // Glass Patterns (Hidden Geometric Correlation)
                if (u_showGlass > 0.5) {
                    vec2 p1 = floor(p * 70.0);
                    vec2 p2_uv = p;
                    if (d < 0.0) {
                        float rot = u_time * 0.3;
                        p2_uv = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * p;
                    } else {
                        p2_uv = p + vec2(13.37);
                    }
                    vec2 p2 = floor(p2_uv * 70.0);
                    float dots = clamp(step(0.85, hash12(p1)) + step(0.85, hash12(p2)), 0.0, 1.0);
                    vec3 dotCol = getPalette(hash12(p1) + u_time * 0.1);
                    finalCol = mix(finalCol, dotCol, dots * 0.85);
                }

                // Simultaneous Contrast Vibrating Tiles
                if (abs(d) > 0.15 && abs(d) < 0.25) {
                    vec2 grid = floor(p * 20.0);
                    float checker = mod(grid.x + grid.y, 2.0);
                    vec3 c1 = getPalette(u_time * 0.15);
                    vec3 c2 = getPalette(u_time * 0.15 + 0.5);
                    finalCol = mix(finalCol, mix(c1, c2, checker), 0.4);
                }

                // Prism / Diffraction Ribbons
                float angle = atan(p.y, p.x);
                float prism = sin(angle * 16.0 + u_time * 2.5) * 0.5 + 0.5;
                vec3 prismCol = wavelengthToRGB(400.0 + prism * 350.0);
                finalCol = mix(finalCol, prismCol, 0.4 * smoothstep(0.85, 1.0, prism));

                // Plasma Filaments
                float plasma = 0.0;
                for(float i=1.0; i<=3.0; i+=1.0) {
                    vec2 pp = p * i * 1.5;
                    float line = abs(pp.y + sin(pp.x * 3.0 + u_time * i) * 0.5 + fbm(pp + u_time) * 0.5);
                    plasma += 0.012 / (line + 0.002);
                }
                finalCol = mix(finalCol, vec3(1.0, 0.2, 0.9), clamp(plasma, 0.0, 1.0));

                // Alchemical Symbols
                if (u_showSymbols > 0.5) {
                    float symD = 1.0;
                    for(int i=0; i<6; i++) {
                        float a = float(i) * PI / 3.0 + u_time * 0.15;
                        vec2 pos = vec2(cos(a), sin(a)) * 0.6;
                        symD = min(symD, sdHexagram(p - pos, 0.08));
                    }
                    float symGlow = 0.004 / (abs(symD) + 0.001);
                    finalCol += vec3(1.0, 0.9, 0.1) * symGlow;
                }

                // Impossible Color Seed (Click Ripple)
                float timeSinceClick = u_time - u_clickTime;
                if (timeSinceClick > 0.0 && timeSinceClick < 3.0) {
                    vec2 cp = (u_clickPos - 0.5) * 2.0;
                    cp.x *= u_aspect;
                    float ripD = length(p - cp);
                    float rip = sin(ripD * 50.0 - timeSinceClick * 20.0) * exp(-timeSinceClick * 1.5);
                    vec3 ripCol = wavelengthToRGB(380.0 + (rip * 0.5 + 0.5) * 350.0);
                    finalCol = mix(finalCol, ripCol, exp(-timeSinceClick * 2.0) * smoothstep(1.0, 0.0, ripD));
                }

                fragColor = vec4(finalCol, 1.0);
            }
        `;

        // ====================================================================
        // PASS 2: FEEDBACK (Afterimage Trail Generation)
        // ====================================================================
        const fragFeedback = `
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D tCathedral;
            uniform sampler2D tFeedback;

            void main() {
                vec3 curr = texture(tCathedral, vUv).rgb;
                // Subtle zoom out for flowing trails
                vec2 uvTrail = (vUv - 0.5) * 0.992 + 0.5;
                vec3 prev = texture(tFeedback, uvTrail).rgb;
                
                // Max blending keeps colors vibrant and saturated
                vec3 trail = max(curr, prev * 0.92);
                fragColor = vec4(trail, 1.0);
            }
        `;

        // ====================================================================
        // PASS 3: SCREEN (Chromatic Aberration & Opponent Fatigue)
        // ====================================================================
        const fragScreen = `
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D tCathedral;
            uniform sampler2D tFeedback;
            uniform float u_time;

            void main() {
                vec2 uv = vUv;
                
                // Chromatic Aberration (Radial Shift)
                vec2 dir = normalize(uv - 0.5);
                float dist = length(uv - 0.5);
                float ca_amt = dist * 0.015;
                
                vec3 col;
                col.r = texture(tCathedral, uv + dir * ca_amt).r;
                col.g = texture(tCathedral, uv).g;
                col.b = texture(tCathedral, uv - dir * ca_amt).b;

                // Opponent-Process Fatigue (Chimerical Colors)
                vec3 feed = texture(tFeedback, uv).rgb;
                // Invert hue to get complementary afterimage, but maintain high saturation
                vec3 opponent = vec3(1.0) - feed;
                opponent = mix(opponent, vec3(0.0, 1.0, 0.8), 0.2); // slight turquoise tint
                
                float fatigueAmt = smoothstep(0.4, 0.9, length(feed));
                col = mix(col, opponent, fatigueAmt * 0.35);

                // Enforce "No Dominant Black, No Dominant White" Rule
                col = clamp(col, 0.0, 1.0);
                col = col * 0.82 + 0.12; // Maps [0,1] to [0.12, 0.94]

                fragColor = vec4(col, 1.0);
            }
        `;

        const matCathedral = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3, uniforms: uniforms,
            vertexShader: vertexShader, fragmentShader: fragCathedral
        });

        const matFeedback = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tCathedral: { value: rtCathedral.texture },
                tFeedback: { value: rtFeedbackA.texture }
            },
            vertexShader: vertexShader, fragmentShader: fragFeedback
        });

        const matScreen = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tCathedral: { value: rtCathedral.texture },
                tFeedback: { value: rtFeedbackB.texture },
                u_time: uniforms.u_time
            },
            vertexShader: vertexShader, fragmentShader: fragScreen
        });

        const quad = new THREE.PlaneGeometry(2, 2);
        sceneCathedral.add(new THREE.Mesh(quad, matCathedral));
        sceneFeedback.add(new THREE.Mesh(quad, matFeedback));
        sceneScreen.add(new THREE.Mesh(quad, matScreen));

        const onKeyDown = (e) => {
            const k = e.key.toLowerCase();
            if(k === 'c') uniforms.u_mode.value = (uniforms.u_mode.value + 1.0) % 5.0;
            if(k === 'g') uniforms.u_showGlass.value = 1.0 - uniforms.u_showGlass.value;
            if(k === 'a') uniforms.u_showSymbols.value = 1.0 - uniforms.u_showSymbols.value;
            if(k === 'd') uniforms.u_chromaDepth.value = 1.0 - uniforms.u_chromaDepth.value;
            if(k === 'b') uniforms.u_birefringence.value = 1.0 - uniforms.u_birefringence.value;
        };
        window.addEventListener('keydown', onKeyDown);

        canvas.__three = {
            renderer, camera,
            sceneCathedral, sceneFeedback, sceneScreen,
            rtCathedral, rtFeedbackA, rtFeedbackB,
            uniforms, matFeedback, matScreen,
            wasPressed: false,
            cleanup: () => window.removeEventListener('keydown', onKeyDown)
        };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        return;
    }
}

const { 
    renderer, camera, 
    sceneCathedral, sceneFeedback, sceneScreen, 
    rtCathedral, uniforms, matFeedback, matScreen 
} = canvas.__three;

let { rtFeedbackA, rtFeedbackB } = canvas.__three;

// Update uniforms
uniforms.u_time.value = time;
uniforms.u_resolution.value.set(grid.width, grid.height);
uniforms.u_aspect.value = grid.width / grid.height;

if (mouse.isPressed && !canvas.__three.wasPressed) {
    uniforms.u_clickPos.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
    uniforms.u_clickTime.value = time;
}
canvas.__three.wasPressed = mouse.isPressed;
uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);

renderer.setSize(grid.width, grid.height, false);

// 1. Render Cathedral
renderer.setRenderTarget(rtCathedral);
renderer.render(sceneCathedral, camera);

// 2. Render Feedback (Reads Cathedral + A, Writes to B)
matFeedback.uniforms.tFeedback.value = rtFeedbackA.texture;
renderer.setRenderTarget(rtFeedbackB);
renderer.render(sceneFeedback, camera);

// 3. Render Screen (Reads Cathedral + B, Writes to Screen)
matScreen.uniforms.tFeedback.value = rtFeedbackB.texture;
renderer.setRenderTarget(null);
renderer.render(sceneScreen, camera);

// Swap Ping-Pong Buffers
canvas.__three.rtFeedbackA = rtFeedbackB;
canvas.__three.rtFeedbackB = rtFeedbackA;