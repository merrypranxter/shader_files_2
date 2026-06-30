if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;

        const rtOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            depthBuffer: false,
            stencilBuffer: false
        };

        const rtMain = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
        const rtFeedbackA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
        const rtFeedbackB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneGeometry(2, 2);

        const vertShader = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        const mainFragShader = `
            in vec2 vUv;
            out vec4 fragColor;

            uniform float u_time;
            uniform vec2 u_resolution;
            uniform vec2 u_mouse;

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }

            mat2 rot(float a) {
                float c = cos(a), s = sin(a);
                return mat2(c, -s, s, c);
            }

            float sdOctahedron(vec3 p, float s) {
                p = abs(p);
                return (p.x + p.y + p.z - s) * 0.57735027;
            }

            vec2 map(vec3 p) {
                vec3 q = p;
                
                // Color-space morphing (Coordinate warping)
                float morph = smoothstep(0.3, 0.7, sin(u_time * 0.25) * 0.5 + 0.5);
                float theta = atan(q.z, q.x);
                float r = length(q.xz);
                vec3 cyl = vec3(r * cos(theta + q.y * 0.5), q.y, r * sin(theta + q.y * 0.5));
                q = mix(q, cyl, morph * 0.6);

                q.xy *= rot(u_time * 0.15);
                q.yz *= rot(u_time * 0.22);

                // Main Prism Engine
                float d1 = sdOctahedron(q, 1.4);
                float d2 = length(q) - 1.1;
                float d = mix(d1, d2, 0.5 + 0.5 * sin(u_time * 0.8));

                // Semi-liquid gyroid subtraction
                float g = dot(sin(q * 3.0 + u_time), cos(q.zxy * 3.0)) * 0.15;
                d = max(d, -g);

                vec2 res = vec2(d, 1.0); // 1.0 = Glass Prism

                // Simultaneous Contrast Traps (Identical gray spheres in wild surrounds)
                vec3 n1_pos = p - vec3(-2.2, 1.2, 0.5);
                float n1 = length(n1_pos) - 0.25;
                if (n1 < res.x) res = vec2(n1, 2.0); // 2.0 = Gray Node

                vec3 n2_pos = p - vec3(2.2, -1.2, -0.5);
                float n2 = length(n2_pos) - 0.25;
                if (n2 < res.x) res = vec2(n2, 2.0);

                // Contrast Rings
                float r1 = max(length(n1_pos) - 0.45, -(length(n1_pos) - 0.3));
                if (r1 < res.x) res = vec2(r1, 3.0); // 3.0 = Acid Green

                float r2 = max(length(n2_pos) - 0.45, -(length(n2_pos) - 0.3));
                if (r2 < res.x) res = vec2(r2, 4.0); // 4.0 = Hot Pink

                return res;
            }

            vec3 calcNormal(vec3 p) {
                vec2 e = vec2(0.001, 0.0);
                return normalize(vec3(
                    map(p + e.xyy).x - map(p - e.xyy).x,
                    map(p + e.yxy).x - map(p - e.yxy).x,
                    map(p + e.yyx).x - map(p - e.yyx).x
                ));
            }

            vec3 getBackground(vec3 dir) {
                // White-hot beam entering from left
                float beam = pow(max(dot(dir, normalize(vec3(-1.0, 0.1, 0.0))), 0.0), 80.0);
                // Diffraction grating moire in the void
                float moire = sin(dir.y * 200.0) * sin(dir.z * 200.0 + u_time * 2.0);
                vec3 col = vec3(beam) * 4.0;
                col += vec3(0.02, 0.0, 0.08) * (moire * 0.5 + 0.5);
                return col;
            }

            void main() {
                vec2 uv = vUv;
                
                // Floating Point Dementia (Precision collapse at edges)
                float distCenter = length(uv - 0.5);
                float dementia = smoothstep(0.35, 0.55, distCenter);
                if (dementia > 0.0) {
                    float bits = max(1.0, 10.0 - dementia * 12.0);
                    float levels = exp2(bits);
                    uv = floor(uv * levels) / levels;
                }

                vec2 p = (uv - 0.5) * 2.0;
                p.x *= u_resolution.x / u_resolution.y;

                vec3 ro = vec3(0.0, 0.0, 5.0);
                vec3 rd = normalize(vec3(p, -1.5));

                float t = 0.0;
                vec2 h;
                for(int i = 0; i < 90; i++) {
                    vec3 pos = ro + rd * t;
                    h = map(pos);
                    if(h.x < 0.001 || t > 15.0) break;
                    t += h.x;
                }

                vec3 col = vec3(0.0);

                if(t < 15.0) {
                    vec3 pos = ro + rd * t;
                    vec3 n = calcNormal(pos);

                    if (h.y == 2.0) {
                        // Simultaneous contrast gray node
                        col = vec3(0.5);
                    } else if (h.y == 3.0) {
                        col = vec3(0.1, 1.0, 0.2) * 2.5; // Acid Green
                    } else if (h.y == 4.0) {
                        col = vec3(1.0, 0.0, 0.6) * 2.5; // Hot Pink
                    } else if (h.y == 1.0) {
                        // Per-wavelength dispersion
                        for(int i = 0; i < 16; i++) {
                            float f = float(i) / 15.0;
                            // Cauchy approx: blue bends harder
                            float ior = 1.35 + 0.15 * (1.0 - f); 
                            vec3 refr = refract(rd, n, 1.0 / ior);
                            if (length(refr) == 0.0) refr = reflect(rd, n);

                            // Spectral palette
                            vec3 spec = 0.5 + 0.5 * cos(6.28318 * (f + vec3(0.0, 0.33, 0.67)));
                            
                            // False-color flash (Mantis vision / thermal remap)
                            float falseColor = smoothstep(0.85, 1.0, sin(u_time * 0.4 + f * 3.14));
                            spec = mix(spec, spec.brg * vec3(2.0, 0.5, 1.5), falseColor);

                            // Surface diffraction fringes
                            float diff = sin(dot(pos, vec3(180.0))) * 0.5 + 0.5;
                            vec3 diffCol = 0.5 + 0.5 * cos(6.28318 * (f + vec3(0.0, 0.33, 0.67)) + u_time * 3.0);

                            col += spec * getBackground(refr) * (1.0 / 16.0);
                            col += diffCol * diff * 0.08 * max(0.0, dot(n, normalize(vec3(-1.0, 1.0, 1.0))));
                        }
                        
                        float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
                        col += getBackground(reflect(rd, n)) * fresnel;
                    }
                } else {
                    col = getBackground(rd);
                }

                // NaN purple / Inf white corruption in the precision desert
                if (dementia > 0.0 && hash(uv * u_time) > 0.99 - dementia * 0.02) {
                    col = mix(col, vec3(0.8, 0.0, 1.0), dementia);
                }

                fragColor = vec4(col, 1.0);
            }
        `;

        const feedbackFragShader = `
            in vec2 vUv;
            out vec4 fragColor;

            uniform sampler2D tDiffuse;
            uniform sampler2D tHistory;
            uniform vec2 u_mouse_vel;

            void main() {
                vec4 curr = texture(tDiffuse, vUv);

                // Temporal Desync: Predictive future ghost offsets in direction of velocity
                vec2 ghost_uv = vUv + u_mouse_vel * 0.08;
                vec4 hist = texture(tHistory, ghost_uv);

                // Afterimage Painter: accumulate burn, decay into complementary color
                vec3 adapt = hist.rgb; // Approx adaptation state from history
                vec3 comp = vec3(1.0) - adapt; // Opponent complement

                // Current visual coverage
                float coverage = clamp(dot(curr.rgb, vec3(0.333)), 0.0, 1.0);

                vec3 outCol = curr.rgb;
                
                // Temporal trails / feedback smear
                outCol = max(outCol, hist.rgb * 0.88);

                // Add complementary ghost where current signal is weak
                outCol += comp * 0.25 * (1.0 - coverage);

                fragColor = vec4(outCol, 1.0);
            }
        `;

        const postFragShader = `
            in vec2 vUv;
            out vec4 fragColor;

            uniform sampler2D tDiffuse;
            uniform vec2 u_resolution;
            uniform float u_time;

            void main() {
                vec3 col = texture(tDiffuse, vUv).rgb;

                // Solarization (Sabattier effect) - Non-monotonic tone reversal
                float luma = dot(col, vec3(0.299, 0.587, 0.114));
                float t = 0.55; // Reversal threshold
                float folded = t * (1.0 - clamp((luma - t) / max(1.0 - t, 0.001), 0.0, 1.0));
                float new_luma = mix(luma, folded, smoothstep(t - 0.1, t + 0.1, luma) * 0.9);
                
                if (luma > 0.001) {
                    col *= new_luma / luma;
                }

                // Mackie Lines (Sobel Edge Halos on Solarization boundaries)
                vec2 px = 1.0 / u_resolution;
                float l1 = dot(texture(tDiffuse, vUv + vec2(-1.0, -1.0) * px).rgb, vec3(0.333));
                float l2 = dot(texture(tDiffuse, vUv + vec2(1.0, 1.0) * px).rgb, vec3(0.333));
                float edge = abs(l1 - l2) * 3.0;
                
                // Add cyan/acid-green halos
                col += vec3(edge) * vec3(0.0, 1.0, 0.8);

                // Tone mapping (ACES-ish) & Gamma
                col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
                col = pow(col, vec3(1.0 / 2.2));

                // Vignette
                float r = length(vUv - 0.5);
                col *= 1.0 - 0.5 * r * r;

                // Subtle Grain
                float noise = fract(sin(dot(vUv + u_time, vec2(12.9898, 78.233))) * 43758.5453);
                col += (noise - 0.5) * 0.06;

                fragColor = vec4(col, 1.0);
            }
        `;

        const matMain = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2() },
                u_mouse: { value: new THREE.Vector2() }
            },
            vertexShader: vertShader,
            fragmentShader: mainFragShader,
            depthWrite: false, depthTest: false
        });

        const matFeedback = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tDiffuse: { value: null },
                tHistory: { value: null },
                u_mouse_vel: { value: new THREE.Vector2() }
            },
            vertexShader: vertShader,
            fragmentShader: feedbackFragShader,
            depthWrite: false, depthTest: false
        });

        const matPost = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tDiffuse: { value: null },
                u_resolution: { value: new THREE.Vector2() },
                u_time: { value: 0 }
            },
            vertexShader: vertShader,
            fragmentShader: postFragShader,
            depthWrite: false, depthTest: false
        });

        const sceneMain = new THREE.Scene();
        sceneMain.add(new THREE.Mesh(geometry, matMain));

        const sceneFeedback = new THREE.Scene();
        sceneFeedback.add(new THREE.Mesh(geometry, matFeedback));

        const scenePost = new THREE.Scene();
        scenePost.add(new THREE.Mesh(geometry, matPost));

        canvas.__three = {
            renderer, camera,
            rtMain, rtFeedbackA, rtFeedbackB,
            sceneMain, sceneFeedback, scenePost,
            matMain, matFeedback, matPost,
            mouseState: { px: 0, py: 0, vx: 0, vy: 0 }
        };

    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        throw e;
    }
}

const sys = canvas.__three;
if (sys && sys.matMain && sys.matFeedback && sys.matPost) {
    const { renderer, camera, sceneMain, sceneFeedback, scenePost, matMain, matFeedback, matPost, mouseState } = sys;

    // Handle Resize
    if (sys.rtMain.width !== grid.width || sys.rtMain.height !== grid.height) {
        sys.rtMain.setSize(grid.width, grid.height);
        sys.rtFeedbackA.setSize(grid.width, grid.height);
        sys.rtFeedbackB.setSize(grid.width, grid.height);
        renderer.setSize(grid.width, grid.height, false);
    }

    // Mouse velocity calculation for precognitive ghosts
    const mx = mouse.x / grid.width;
    const my = 1.0 - (mouse.y / grid.height);
    
    mouseState.vx = (mx - mouseState.px) * 0.1 + mouseState.vx * 0.9;
    mouseState.vy = (my - mouseState.py) * 0.1 + mouseState.vy * 0.9;
    mouseState.px = mx;
    mouseState.py = my;

    // Update Uniforms
    matMain.uniforms.u_time.value = time;
    matMain.uniforms.u_resolution.value.set(grid.width, grid.height);
    matMain.uniforms.u_mouse.value.set(mx, my);

    matFeedback.uniforms.u_mouse_vel.value.set(mouseState.vx, mouseState.vy);

    matPost.uniforms.u_time.value = time;
    matPost.uniforms.u_resolution.value.set(grid.width, grid.height);

    // Pass 1: Render Main SDF Scene
    renderer.setRenderTarget(sys.rtMain);
    renderer.render(sceneMain, camera);

    // Pass 2: Temporal Feedback & Afterimage 
    matFeedback.uniforms.tDiffuse.value = sys.rtMain.texture;
    matFeedback.uniforms.tHistory.value = sys.rtFeedbackA.texture;
    renderer.setRenderTarget(sys.rtFeedbackB);
    renderer.render(sceneFeedback, camera);

    // Pass 3: Post-processing (Solarization, Mackie Lines, Bloom)
    matPost.uniforms.tDiffuse.value = sys.rtFeedbackB.texture;
    renderer.setRenderTarget(null);
    renderer.render(scenePost, camera);

    // Swap Feedback Buffers
    const temp = sys.rtFeedbackA;
    sys.rtFeedbackA = sys.rtFeedbackB;
    sys.rtFeedbackB = temp;
}