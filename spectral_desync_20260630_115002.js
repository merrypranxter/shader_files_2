const { width, height } = grid;

if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const rtOptions = {
            type: THREE.HalfFloatType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping
        };

        const rtA = new THREE.WebGLRenderTarget(width, height, rtOptions);
        const rtB = new THREE.WebGLRenderTarget(width, height, rtOptions);

        const vertexShader = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        // PASS 1: Raymarching, Dispersion, Diffraction, Float Dementia, Afterimage Accumulation
        const fragA = `
            precision highp float;
            in vec2 vUv;
            out vec4 fragColor;

            uniform float u_time;
            uniform vec2 u_resolution;
            uniform vec2 u_mouse;
            uniform vec2 u_mouse_vel;
            uniform sampler2D u_prev;

            #define MAX_STEPS 70
            #define SURF_DIST 0.002
            #define MAX_DIST 20.0

            mat2 rot(float a) {
                float s = sin(a), c = cos(a);
                return mat2(c, -s, s, c);
            }

            vec3 spectral(float x) {
                float t = clamp(x, 0.0, 1.0);
                vec3 c = vec3(0.0);
                c.r = exp(-pow((t - 0.75) * 4.0, 2.0)) + exp(-pow((t - 0.0) * 4.0, 2.0)) * 0.5;
                c.g = exp(-pow((t - 0.5) * 4.0, 2.0));
                c.b = exp(-pow((t - 0.25) * 4.0, 2.0));
                return c;
            }

            float sdOctahedron(vec3 p, float s) {
                p = abs(p);
                return (p.x + p.y + p.z - s) * 0.57735027;
            }

            float smin(float a, float b, float k) {
                float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
                return mix(b, a, h) - k * h * (1.0 - h);
            }

            float map(vec3 p) {
                vec3 q = p;
                q.xy *= rot(u_time * 0.3);
                q.xz *= rot(u_time * 0.4);

                // Impossible Prism Engine (Faceted + Liquid)
                float d1 = sdOctahedron(q, 1.2);
                float d2 = length(q) - 1.0 + 0.15 * sin(8.0 * q.x) * sin(8.0 * q.y) * sin(8.0 * q.z + u_time * 2.0);
                float gem = mix(d1, d2, 0.5 + 0.5 * sin(u_time * 0.8));

                // Simultaneous Contrast Nodes (Floating Traps)
                vec3 np = p;
                np.xz *= rot(-u_time * 0.5);
                np.xy *= rot(u_time * 0.3);
                float nodes = length(vec3(abs(np.x) - 2.8, np.y, np.z)) - 0.25;

                return min(gem, nodes);
            }

            vec3 getNormal(vec3 p) {
                vec2 e = vec2(0.002, 0);
                vec3 n = map(p) - vec3(map(p - e.xyy), map(p - e.yxy), map(p - e.yyx));
                
                // Diffraction Grating (High frequency surface perturbation)
                n += 0.03 * sin(p * 150.0 + u_time * 10.0);
                return normalize(n);
            }

            vec3 getBg(vec3 ro, vec3 rd, float ior) {
                vec3 col = vec3(0.0);
                
                // White-hot incoming beam from the left
                float beam = exp(-pow(rd.y, 2.0) * 15.0 - pow(rd.z, 2.0) * 15.0);
                beam *= smoothstep(-1.0, 0.5, rd.x);
                
                // Moiré interference sheets
                float sheet = sin(rd.x * 60.0 + u_time * 8.0) * sin(rd.y * 50.0 - u_time * 4.0);
                sheet = smoothstep(0.85, 1.0, sheet);

                // Floating Point Dementia (Precision Desert)
                vec3 rdd = rd;
                if (abs(rd.y) > 0.6) {
                    float bits = 12.0 + 10.0 * sin(u_time);
                    rdd = floor(rd * bits) / bits;
                    if (fract(u_time * 5.0 + rdd.x * 10.0) < 0.02) {
                        col += vec3(0.7, 0.0, 1.0) * 0.5; // NaN Purple Bloom
                    }
                }

                // False color hyperspectral contours in the background
                float contour = fract(length(rdd) * 10.0 - u_time);
                col += spectral(fract(rdd.x + rdd.y + u_time * 0.1)) * sheet * 2.5;
                col += vec3(1.0, 0.95, 0.9) * beam * 2.5;
                col += vec3(contour * 0.1);

                return col;
            }

            void main() {
                vec2 uv = (vUv - 0.5) * 2.0;
                uv.x *= u_resolution.x / u_resolution.y;

                // Temporal Desync: Predictive future ghost based on mouse velocity
                vec2 ghost_uv = vUv - u_mouse_vel * 4.0;
                vec4 prev = texture(u_prev, ghost_uv);

                // Mouse interaction warps ray origin
                vec3 ro = vec3(0.0, 0.0, 4.5);
                ro.xy += (u_mouse - 0.5) * 2.0;
                
                vec3 rd = normalize(vec3(uv, -1.5));

                float d0 = 0.0;
                float d;
                vec3 p;
                for(int i = 0; i < MAX_STEPS; i++) {
                    p = ro + rd * d0;
                    d = map(p);
                    if(d < SURF_DIST || d0 > MAX_DIST) break;
                    d0 += d;
                }

                vec3 col = vec3(0.0);

                if(d < SURF_DIST) {
                    vec3 np = p;
                    np.xz *= rot(-u_time * 0.5);
                    np.xy *= rot(u_time * 0.3);
                    float isNode = length(vec3(abs(np.x) - 2.8, np.y, np.z)) - 0.25 < SURF_DIST * 3.0 ? 1.0 : 0.0;

                    if (isNode > 0.5) {
                        // Simultaneous Contrast Trap: Exactly 50% gray, surrounded by violent chroma
                        col = vec3(0.5);
                        vec3 n = getNormal(p);
                        float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);
                        col += spectral(fract(p.x * 2.0 + u_time)) * rim * 1.5;
                    } else {
                        // Impossible Prism Engine: Cauchy Dispersion Refraction
                        vec3 n = getNormal(p);
                        
                        // 16 Wavelength Samples
                        for(int i = 0; i < 16; i++) {
                            float t = float(i) / 15.0;
                            float lambda = mix(400.0, 700.0, 1.0 - t); // Blue bends more
                            // Cauchy approximation: n(L) = A + B / L^2
                            float ior = 1.1 + 0.05 / ((lambda * lambda) * 0.000001); 
                            
                            vec3 rd_refr = refract(rd, n, 1.0 / ior);
                            if (length(rd_refr) < 0.1) rd_refr = reflect(rd, n); // TIR fallback
                            
                            vec3 bgCol = getBg(p, rd_refr, ior);
                            col += bgCol * spectral(t) * 0.12;
                        }
                        
                        // Fresnel Sparkle
                        float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
                        col += vec3(1.0, 0.9, 1.0) * fresnel * 0.8;
                    }
                } else {
                    col = getBg(ro, rd, 1.0);
                }

                // Afterimage Burn-in (Accumulate luma in alpha channel)
                float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
                float burn = prev.a * 0.96 + luma * 0.04;

                // Temporal Complementary Ghost (Opponent process)
                vec3 ghost = (1.0 - prev.rgb) * prev.a * 0.7;
                
                // Precognitive trail mix
                col = mix(col, ghost, 0.35);

                fragColor = vec4(col, burn);
            }
        `;

        // PASS 2: Post-processing, Solarization, Color Space Morphing, Output
        const fragPost = `
            precision highp float;
            in vec2 vUv;
            out vec4 fragColor;

            uniform float u_time;
            uniform vec2 u_resolution;
            uniform sampler2D u_tex;

            // Perceptual OKLCH-ish morph approximation
            vec3 rgb2oklch_approx(vec3 c) {
                float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
                float a = dot(c, vec3(1.0, -0.5, -0.5));
                float b = dot(c, vec3(0.0, 0.866, -0.866));
                float C = length(vec2(a, b));
                float H = atan(b, a);
                return vec3(l, C, H);
            }

            vec3 oklch2rgb_approx(vec3 c) {
                float l = c.x;
                float a = c.y * cos(c.z);
                float b = c.y * sin(c.z);
                vec3 rgb = vec3(l) + vec3(a, -0.5 * a + 0.866 * b, -0.5 * a - 0.866 * b);
                return rgb;
            }

            void main() {
                vec3 col = texture(u_tex, vUv).rgb;
                float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));

                // Mackie Lines (Sobel Edge Detection for Solarization Halos)
                vec2 texel = 1.0 / u_resolution;
                float t00 = texture(u_tex, vUv + vec2(-texel.x, -texel.y)).a;
                float t10 = texture(u_tex, vUv + vec2( 0.0,     -texel.y)).a;
                float t20 = texture(u_tex, vUv + vec2( texel.x, -texel.y)).a;
                float t01 = texture(u_tex, vUv + vec2(-texel.x,  0.0)).a;
                float t21 = texture(u_tex, vUv + vec2( texel.x,  0.0)).a;
                float t02 = texture(u_tex, vUv + vec2(-texel.x,  texel.y)).a;
                float t12 = texture(u_tex, vUv + vec2( 0.0,      texel.y)).a;
                float t22 = texture(u_tex, vUv + vec2( texel.x,  texel.y)).a;

                float gx = t00 + 2.0 * t01 + t02 - t20 - 2.0 * t21 - t22;
                float gy = t00 + 2.0 * t10 + t20 - t02 - 2.0 * t12 - t22;
                float edge = length(vec2(gx, gy));

                // Solarization (Non-monotonic tone reversal on highlights)
                float thresh = 0.65;
                if (luma > thresh) {
                    float over = (luma - thresh) / (1.0 - thresh);
                    col = mix(col, 1.0 - col, over * 0.85); // fold back into negative
                }

                // Apply Mackie line halos (Cyan/Magenta iridescent edges)
                col += vec3(0.0, 1.0, 0.8) * edge * 1.5;

                // Color Space Morphing (Breathes every 10 seconds)
                float morph = smoothstep(0.3, 0.7, sin(u_time * 0.628) * 0.5 + 0.5);
                if (morph > 0.0) {
                    vec3 lch = rgb2oklch_approx(col);
                    lch.z += u_time * 0.5; // Rotate hue in perceptual space
                    lch.y *= 1.2; // Boost chroma
                    vec3 morphed = oklch2rgb_approx(lch);
                    col = mix(col, morphed, morph * 0.6);
                }

                // Additive Bloom Accumulation
                vec3 bloom = vec3(0.0);
                for(int i = -2; i <= 2; i++) {
                    for(int j = -2; j <= 2; j++) {
                        vec3 smp = texture(u_tex, vUv + vec2(i, j) * texel * 2.5).rgb;
                        bloom += max(smp - 0.7, 0.0);
                    }
                }
                col += bloom * 0.12;

                // Subtle Grain
                float grain = fract(sin(dot(vUv * u_time, vec2(12.9898, 78.233))) * 43758.5453);
                col += (grain - 0.5) * 0.04;

                // Vignette
                col *= 1.0 - 0.4 * length(vUv - 0.5);

                // ACES-ish Tonemapping
                col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);

                fragColor = vec4(col, 1.0);
            }
        `;

        const matA = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(width, height) },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
                u_mouse_vel: { value: new THREE.Vector2(0, 0) },
                u_prev: { value: null }
            },
            vertexShader,
            fragmentShader: fragA,
            depthWrite: false,
            depthTest: false
        });

        const matPost = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(width, height) },
                u_tex: { value: null }
            },
            vertexShader,
            fragmentShader: fragPost,
            depthWrite: false,
            depthTest: false
        });

        const sceneA = new THREE.Scene();
        sceneA.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matA));

        const scenePost = new THREE.Scene();
        scenePost.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matPost));

        canvas.__three = {
            renderer, camera, rtA, rtB, sceneA, matA, scenePost, matPost,
            lastMouse: new THREE.Vector2(0.5, 0.5)
        };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        throw e;
    }
}

const t = canvas.__three;
t.renderer.setSize(width, height, false);

if (t.rtA.width !== width || t.rtA.height !== height) {
    t.rtA.setSize(width, height);
    t.rtB.setSize(width, height);
}

// Map mouse to 0..1 coordinates
const currentMouse = new THREE.Vector2(
    mouse.x / width,
    1.0 - mouse.y / height
);

// Calculate smoothed velocity for temporal desync
const vel = currentMouse.clone().sub(t.lastMouse);
t.lastMouse.lerp(currentMouse, 0.1); 

// Update Pass 1 Uniforms
t.matA.uniforms.u_time.value = time;
t.matA.uniforms.u_resolution.value.set(width, height);
t.matA.uniforms.u_mouse.value.copy(currentMouse);
t.matA.uniforms.u_mouse_vel.value.copy(vel);
t.matA.uniforms.u_prev.value = t.rtB.texture;

// Render Pass 1 (Main + Feedback) -> rtA
t.renderer.setRenderTarget(t.rtA);
t.renderer.render(t.sceneA, t.camera);

// Update Pass 2 Uniforms
t.matPost.uniforms.u_time.value = time;
t.matPost.uniforms.u_resolution.value.set(width, height);
t.matPost.uniforms.u_tex.value = t.rtA.texture;

// Render Pass 2 (Post + Solarization) -> Screen
t.renderer.setRenderTarget(null);
t.renderer.render(t.scenePost, t.camera);

// Ping-pong swap
const temp = t.rtA;
t.rtA = t.rtB;
t.rtB = temp;