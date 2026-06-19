const W = grid.width;
const H = grid.height;

if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.setPixelRatio(1.0);
        renderer.setSize(W, H, false);
        renderer.autoClear = false;

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const rtOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            depthBuffer: false,
            stencilBuffer: false
        };

        const fboA = new THREE.WebGLRenderTarget(W, H, rtOptions);
        const fboB = new THREE.WebGLRenderTarget(W, H, rtOptions);

        const vertexShader = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            in vec2 vUv;
            out vec4 fragColor;

            uniform vec2 u_resolution;
            uniform float u_time;
            uniform sampler2D u_prevFrame;

            #define PI 3.14159265359
            #define TAU 6.28318530718

            // --- HASH & NOISE (The Glitchcore / Dream Physics Entropy) ---
            float hash1(float n) { return fract(sin(n) * 43758.5453123); }
            float hash2(vec2 p) {
                p = fract(p * vec2(127.1, 311.7));
                p += dot(p, p + 17.5);
                return fract(p.x * p.y);
            }
            float noise(vec2 p) {
                vec2 i = floor(p); vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x),
                           mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
            }

            // --- OKLAB COLOR SCIENCE (Absolute Color Rules) ---
            vec3 srgb_to_oklab(vec3 c) {
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

            vec3 oklab_to_srgb(vec3 c) {
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

            vec3 oklab_mix(vec3 a, vec3 b, float t) {
                return mix(a, b, t);
            }

            // --- CROSS-PROCESSING CHEMISTRY & STRUCTURAL COLOR ---
            // Guarantees no black, no white, pure saturated fever-dream colors
            vec3 getFeralColor(float t, float phase) {
                t = fract(t);
                
                // Base Palette (No Neutrals)
                vec3 c_plum = srgb_to_oklab(vec3(0.3, 0.0, 0.4));
                vec3 c_indigo = srgb_to_oklab(vec3(0.1, 0.0, 0.6));
                vec3 c_peacock = srgb_to_oklab(vec3(0.0, 0.4, 0.4));
                
                vec3 c_hotpink = srgb_to_oklab(vec3(1.0, 0.0, 0.5));
                vec3 c_coral = srgb_to_oklab(vec3(1.0, 0.3, 0.2));
                
                vec3 c_acidyellow = srgb_to_oklab(vec3(0.8, 1.0, 0.0));
                vec3 c_neoncyan = srgb_to_oklab(vec3(0.0, 1.0, 0.9));
                vec3 c_ultraviolet = srgb_to_oklab(vec3(0.5, 0.0, 1.0));

                // Dynamic tone mapping based on phase
                vec3 dark = oklab_mix(c_plum, c_indigo, sin(phase)*0.5+0.5);
                vec3 mid = oklab_mix(c_peacock, c_hotpink, cos(phase*1.618)*0.5+0.5);
                vec3 light = oklab_mix(c_acidyellow, c_neoncyan, sin(phase*2.718)*0.5+0.5);
                
                // Add structural iridescence to mids
                mid = oklab_mix(mid, c_ultraviolet, sin(t * TAU + phase)*0.5+0.5);

                vec3 res;
                if (t < 0.5) {
                    res = oklab_mix(dark, mid, smoothstep(0.0, 0.5, t));
                } else {
                    res = oklab_mix(mid, light, smoothstep(0.5, 1.0, t));
                }
                
                return oklab_to_srgb(res);
            }

            // --- DREAM PHYSICS ARCHITECTURE & EARLY INTERNET SHRINE ---
            float sdBox(vec2 p, vec2 b) {
                vec2 d = abs(p) - b;
                return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
            }

            float mapScene(vec2 p, float time) {
                // Kairotempics: Nonlinear time warping
                float k_time = time + 0.5 * sin(time * 0.5);
                
                // Mnemonic Gravity: Space bends towards the center
                float r = length(p);
                p *= 1.0 - 0.3 * exp(-r * 2.0) * sin(k_time);
                
                // Hyperbolic folding
                p = p / (1.0 + 0.2 * r * r * cos(k_time * 0.3));

                // Central Oracle (Retinal Surrealism)
                float oracle = abs(length(p) - 0.5) - 0.05;
                // Op-Art Ripple
                oracle += 0.02 * sin(length(p) * 60.0 - k_time * 8.0);

                // Floating Browser Panels (Asemic Web Shrine)
                mat2 rot = mat2(cos(k_time*0.2), -sin(k_time*0.2), sin(k_time*0.2), cos(k_time*0.2));
                vec2 bp = (rot * p) * 2.0;
                bp = mod(bp + 1.0, 2.0) - 1.0; // recursive grid
                
                float panels = sdBox(bp, vec2(0.4, 0.3));
                // Beveled inner UI chips
                panels = max(panels, -(sdBox(bp + vec2(0.1*sin(k_time), 0.0), vec2(0.2, 0.1))));

                // Combine topology
                return min(oracle, panels);
            }

            void main() {
                vec2 px = 1.0 / u_resolution;
                
                // --- VHS & DAMAGE MEMORY (Horizontal Tear & Tracking) ---
                vec2 uv = vUv;
                float tear = step(0.97, fract(uv.y * 4.0 + u_time * 0.2));
                float trackingWobble = sin(uv.y * 15.0 + u_time * 5.0) * 0.003;
                uv.x += trackingWobble + tear * 0.05 * hash1(u_time + uv.y);
                
                // Space setup
                vec2 p = uv * 2.0 - 1.0;
                p.x *= u_resolution.x / u_resolution.y;

                // --- CELLULAR AUTOMATA INTELLIGENCE (Lenia / Brain's Brain Hybrid) ---
                vec3 histCenter = texture(u_prevFrame, uv).rgb;
                vec3 histN1 = texture(u_prevFrame, uv + vec2(1.0, 1.0) * px * 2.0).rgb;
                vec3 histN2 = texture(u_prevFrame, uv + vec2(-1.0, -1.0) * px * 2.0).rgb;
                vec3 histN3 = texture(u_prevFrame, uv + vec2(-1.0, 1.0) * px * 2.0).rgb;
                vec3 histN4 = texture(u_prevFrame, uv + vec2(1.0, -1.0) * px * 2.0).rgb;
                vec3 histAvg = (histN1 + histN2 + histN3 + histN4) * 0.25;
                
                // CA Activation delta
                float ca_delta = length(histAvg - histCenter);
                float ca_growth = exp(-pow(ca_delta * 10.0 - 1.0, 2.0)); // Gaussian growth

                // --- DATAMOSH (Temporal Drag & Vector Failure) ---
                float lumaC = dot(histCenter, vec3(0.333));
                float lumaR = dot(texture(u_prevFrame, uv + vec2(3.0, 0.0) * px).rgb, vec3(0.333));
                float lumaU = dot(texture(u_prevFrame, uv + vec2(0.0, 3.0) * px).rgb, vec3(0.333));
                vec2 motion = vec2(lumaR - lumaC, lumaU - lumaC);
                
                // Warp history UV by motion + CA growth + Dream Physics
                vec2 moshUV = uv - motion * 0.1 - p * 0.002 * sin(u_time);
                vec3 moshHistory = texture(u_prevFrame, moshUV).rgb;

                // --- CHROMATIC ABERRATION & STRUCTURAL SCENE ---
                // Evaluate scene 3 times for spectral edge separation
                float ca_shift = 0.01 + 0.05 * tear + 0.02 * ca_growth;
                float dR = mapScene(p + vec2(ca_shift, 0.0), u_time);
                float dG = mapScene(p, u_time + 0.05);
                float dB = mapScene(p - vec2(ca_shift, 0.0), u_time + 0.1);

                // Op-Art spatial engine (Moiré bands)
                float moire = sin(length(p) * 40.0 - u_time * 3.0) * cos(p.x * 30.0 + p.y * 30.0);

                // Map distances + CA + Moiré to Absolute Colors
                float valR = fract(dR * 4.0 + moire * 0.2 + ca_growth * 0.5);
                float valG = fract(dG * 4.0 + moire * 0.2 + ca_growth * 0.5);
                float valB = fract(dB * 4.0 + moire * 0.2 + ca_growth * 0.5);

                vec3 colR = getFeralColor(valR, u_time * 0.1);
                vec3 colG = getFeralColor(valG, u_time * 0.1 + 2.0);
                vec3 colB = getFeralColor(valB, u_time * 0.1 + 4.0);

                // Prismatic structural color composition
                vec3 sceneColor = vec3(colR.r, colG.g, colB.b);
                
                // Re-map the raw RGB through the color engine to absolutely forbid neutrals
                float sceneLuma = dot(sceneColor, vec3(0.333));
                vec3 feralScene = getFeralColor(sceneLuma, length(p) + u_time);

                // --- RISOGRAPH PRINT LOGIC ---
                // AM Halftone Grid
                float lpi = 90.0;
                float angle = 0.785398; // 45 degrees
                vec2 rotUV = vec2(uv.x * cos(angle) - uv.y * sin(angle), uv.x * sin(angle) + uv.y * cos(angle));
                vec2 cell = fract(rotUV * lpi) - 0.5;
                float dotGain = 1.1 + 0.2 * noise(uv * 10.0 + u_time); // Ink slur / wetness
                float radius = 0.38 / dotGain;
                float halftone = 1.0 - smoothstep(radius - 0.08, radius + 0.08, length(cell));

                // Risograph Multiply Blend (Dark ink on Bright paper)
                vec3 inkDark = getFeralColor(0.1, u_time * 0.5); // Deep saturated shadow
                vec3 inkLight = getFeralColor(0.9, -u_time * 0.3); // Neon bright
                vec3 risoColor = mix(inkLight, inkDark, halftone * sceneLuma);

                // --- FINAL COMPOSITING (Ghost Story Temporal Echoes) ---
                // Mix the spatial scene with the riso layer and the datamoshed history
                vec3 combined = mix(feralScene, risoColor, 0.35 + 0.15 * sin(u_time));
                
                // Feedback loop logic
                float feedbackWeight = 0.7 + 0.2 * sin(u_time * 0.4);
                vec3 outputColor = mix(combined, moshHistory, feedbackWeight);

                // Dropout damage (colored, not white)
                float dropout = step(0.99, hash2(uv * vec2(1.0, 100.0) + u_time));
                outputColor = mix(outputColor, getFeralColor(1.0, uv.y * 10.0), dropout);

                // Hard clamp to guarantee no true black/white escape
                outputColor = clamp(outputColor, 0.02, 0.98);

                fragColor = vec4(outputColor, 1.0);
            }
        `;

        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(W, H) },
                u_prevFrame: { value: null }
            },
            vertexShader,
            fragmentShader,
            depthWrite: false,
            depthTest: false
        });

        const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(plane);

        canvas.__three = { renderer, scene, camera, material, fboA, fboB, ping: 0 };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        return;
    }
}

const sys = canvas.__three;
if (!sys) return;

const { renderer, scene, camera, material, fboA, fboB } = sys;

// Update uniforms
if (material && material.uniforms) {
    material.uniforms.u_time.value = time;
    if (material.uniforms.u_resolution.value.x !== W || material.uniforms.u_resolution.value.y !== H) {
        material.uniforms.u_resolution.value.set(W, H);
        fboA.setSize(W, H);
        fboB.setSize(W, H);
        renderer.setSize(W, H, false);
    }
}

// Ping-Pong FBO Logic for Datamosh / CA Feedback
const sourceFbo = sys.ping === 0 ? fboA : fboB;
const targetFbo = sys.ping === 0 ? fboB : fboA;

material.uniforms.u_prevFrame.value = sourceFbo.texture;

// Render to target FBO
renderer.setRenderTarget(targetFbo);
renderer.render(scene, camera);

// Render to Screen
renderer.setRenderTarget(null);
renderer.render(scene, camera);

// Swap
sys.ping = 1 - sys.ping;