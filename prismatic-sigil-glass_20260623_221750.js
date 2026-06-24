const init = () => {
    if (!canvas.__three) {
        try {
            if (!ctx) throw new Error("WebGL 2 context not available");

            const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: false, antialias: false });
            renderer.autoClear = false;

            const w = grid.width;
            const h = grid.height;

            const targetOpts = {
                type: THREE.HalfFloatType,
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                depthBuffer: false,
                stencilBuffer: false
            };

            const targetScene = new THREE.WebGLRenderTarget(w, h, targetOpts);
            const targetA = new THREE.WebGLRenderTarget(w, h, targetOpts);
            const targetB = new THREE.WebGLRenderTarget(w, h, targetOpts);

            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            const geometry = new THREE.PlaneGeometry(2, 2);

            const vertShader = `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `;

            const matScene = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_time: { value: 0 },
                    u_resolution: { value: new THREE.Vector2(w, h) }
                },
                vertexShader: vertShader,
                fragmentShader: `
                    in vec2 vUv;
                    out vec4 fragColor;
                    uniform float u_time;
                    uniform vec2 u_resolution;

                    vec2 hash22(vec2 p) {
                        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
                        return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
                    }

                    float noise(vec2 p) {
                        vec2 i = floor(p); vec2 f = fract(p);
                        vec2 u = f * f * (3.0 - 2.0 * f);
                        return mix(mix(dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                                       dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
                                   mix(dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                                       dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
                    }

                    float fbm(vec2 p) {
                        float f = 0.0; float a = 0.5;
                        for(int i = 0; i < 5; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
                        return f;
                    }

                    float sdRoundRect(vec2 p, vec2 b, float r) {
                        vec2 d = abs(p) - b + vec2(r);
                        return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
                    }

                    mat2 rot(float a) {
                        float s = sin(a), c = cos(a);
                        return mat2(c, -s, s, c);
                    }

                    float sigil(vec2 p) {
                        p *= 5.0;
                        float d = 1e5;
                        for(int i = 0; i < 4; i++) {
                            float y = float(i) * 0.8 - 1.2;
                            float h = fract(sin(float(i) * 12.34 + floor(u_time * 0.4)) * 432.1);
                            if(h > 0.5) {
                                d = min(d, length(p - vec2(0.0, y)) - 0.15);
                            } else {
                                d = min(d, length(p - vec2(-0.35, y)) - 0.15);
                                d = min(d, length(p - vec2(0.35, y)) - 0.15);
                            }
                        }
                        vec2 q = abs(p * rot(3.14159 / 4.0));
                        float diamond = max(q.x, q.y) - 2.2;
                        d = min(d, abs(diamond) - 0.06);
                        return d;
                    }

                    float map(vec2 p) {
                        vec2 p1 = p - vec2(sin(u_time * 0.25) * 0.15, cos(u_time * 0.2) * 0.08);
                        p1 *= rot(sin(u_time * 0.15) * 0.15);
                        float d1 = sdRoundRect(p1, vec2(0.35, 0.5), 0.06);

                        vec2 p2 = p - vec2(cos(u_time * 0.22) * 0.1, sin(u_time * 0.3) * 0.12);
                        p2 *= rot(cos(u_time * 0.1) * 0.2);
                        float d2 = sdRoundRect(p2, vec2(0.28, 0.55), 0.1);

                        return min(d1, d2);
                    }

                    void main() {
                        vec2 uv = (vUv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);

                        vec2 e = vec2(0.005, 0.0);
                        float d = map(uv);
                        vec2 n = normalize(vec2(
                            map(uv + e.xy) - map(uv - e.xy),
                            map(uv + e.yx) - map(uv - e.yx)
                        ));

                        float refrStrength = smoothstep(0.1, -0.1, d);
                        vec2 bgUV = vUv + n * 0.06 * refrStrength;

                        bgUV += vec2(fbm(bgUV * 3.0 + u_time * 0.1), fbm(bgUV * 3.0 - u_time * 0.12)) * 0.08;

                        vec3 bg1 = mix(vec3(0.0, 0.9, 1.0), vec3(1.0, 0.0, 0.78), fbm(bgUV * 2.0 + u_time * 0.15));
                        vec3 bg2 = mix(vec3(0.36, 0.0, 1.0), vec3(1.0, 0.42, 0.0), fbm(bgUV * 3.5 - u_time * 0.1));
                        vec3 color = mix(bg1, bg2, fbm(bgUV * 4.0));

                        float edge = smoothstep(0.015, 0.0, abs(d));
                        color += vec3(edge) * 0.6; 

                        if (d < 0.0) {
                            color *= 0.8; 
                            color += vec3(0.1, 0.05, 0.2); 
                            
                            float spec = pow(max(dot(n, normalize(vec2(1.0, 1.0))), 0.0), 12.0);
                            color += vec3(1.0) * spec * smoothstep(0.0, -0.05, d);

                            vec2 suv = uv - vec2(sin(u_time * 0.15) * 0.06, cos(u_time * 0.1) * 0.06);
                            float s = sigil(suv);
                            float sEdge = smoothstep(0.02, 0.0, s);
                            float sGlow = smoothstep(0.15, 0.0, s);

                            vec3 sigilCol = mix(vec3(0.0, 1.0, 0.8), vec3(0.66, 1.0, 0.0), fbm(suv * 8.0 + u_time));
                            color += sigilCol * sEdge;
                            color += sigilCol * sGlow * 0.5;
                        }

                        for(int i = 0; i < 4; i++) {
                            float a = u_time * (0.3 + float(i) * 0.15) + float(i) * 1.57;
                            float r = 0.45 + sin(u_time * 0.2 + float(i)) * 0.15;
                            vec2 pFrag = uv - vec2(cos(a), sin(a)) * r;
                            pFrag *= rot(u_time * 0.8 + float(i));
                            float dFrag = sdRoundRect(pFrag, vec2(0.03, 0.06), 0.01);
                            if(dFrag < 0.0) {
                                color = mix(vec3(1.0, 0.3, 0.0), vec3(0.0, 0.8, 1.0), float(i) / 3.0);
                                color += vec3(1.0) * pow(max(dot(normalize(pFrag), normalize(vec2(1.0))), 0.0), 8.0);
                            }
                        }

                        fragColor = vec4(color, 1.0);
                    }
                `
            });

            const matFeedback = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    tScene: { value: null },
                    tPrev: { value: null }
                },
                vertexShader: vertShader,
                fragmentShader: `
                    in vec2 vUv;
                    out vec4 fragColor;
                    uniform sampler2D tScene;
                    uniform sampler2D tPrev;

                    void main() {
                        vec2 uv = vUv;
                        vec3 scene = texture(tScene, uv).rgb;

                        vec2 prevUV = uv - 0.5;
                        float a = 0.003;
                        float s = sin(a), c = cos(a);
                        prevUV = mat2(c, -s, s, c) * prevUV;
                        prevUV *= 0.985; 
                        prevUV += 0.5;

                        vec3 trail = texture(tPrev, prevUV).rgb;

                        float trailR = mix(scene.r, trail.r, 0.6);
                        float trailG = mix(scene.g, trail.g, 0.85);
                        float trailB = mix(scene.b, trail.b, 0.96);

                        fragColor = vec4(trailR, trailG, trailB, 1.0);
                    }
                `
            });

            const matDisplay = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    tAccum: { value: null },
                    u_resolution: { value: new THREE.Vector2(w, h) }
                },
                vertexShader: vertShader,
                fragmentShader: `
                    in vec2 vUv;
                    out vec4 fragColor;
                    uniform sampler2D tAccum;
                    uniform vec2 u_resolution;

                    void main() {
                        vec2 uv = vUv;
                        vec3 color = texture(tAccum, uv).rgb;

                        vec2 dir = uv - 0.5;
                        float dist = length(dir);
                        vec2 caOffset = dir * dist * 0.012;

                        float r = texture(tAccum, uv + caOffset).r;
                        float g = color.g;
                        float b = texture(tAccum, uv - caOffset).b;
                        color = vec3(r, g, b);

                        float scanline = 0.92 + 0.08 * sin(uv.y * u_resolution.y * 2.5);
                        color *= scanline;

                        float vig = smoothstep(0.85, 0.2, dist);
                        color *= vig;

                        color = 1.0 - exp(-color * 1.3);

                        fragColor = vec4(color, 1.0);
                    }
                `
            });

            const sceneMain = new THREE.Scene();
            sceneMain.add(new THREE.Mesh(geometry, matScene));

            const sceneFeedback = new THREE.Scene();
            sceneFeedback.add(new THREE.Mesh(geometry, matFeedback));

            const sceneDisplay = new THREE.Scene();
            sceneDisplay.add(new THREE.Mesh(geometry, matDisplay));

            canvas.__three = {
                renderer,
                targetScene,
                targetA,
                targetB,
                camera,
                sceneMain,
                matScene,
                sceneFeedback,
                matFeedback,
                sceneDisplay,
                matDisplay,
                flip: false
            };
        } catch (e) {
            console.error("WebGL Initialization Failed:", e);
            return;
        }
    }

    const state = canvas.__three;
    const { renderer, targetScene, targetA, targetB, camera, sceneMain, matScene, sceneFeedback, matFeedback, sceneDisplay, matDisplay } = state;

    if (targetScene.width !== grid.width || targetScene.height !== grid.height) {
        renderer.setSize(grid.width, grid.height, false);
        targetScene.setSize(grid.width, grid.height);
        targetA.setSize(grid.width, grid.height);
        targetB.setSize(grid.width, grid.height);
    }

    matScene.uniforms.u_time.value = time;
    matScene.uniforms.u_resolution.value.set(grid.width, grid.height);
    matDisplay.uniforms.u_resolution.value.set(grid.width, grid.height);

    renderer.setRenderTarget(targetScene);
    renderer.render(sceneMain, camera);

    const readTarget = state.flip ? targetA : targetB;
    const writeTarget = state.flip ? targetB : targetA;

    matFeedback.uniforms.tScene.value = targetScene.texture;
    matFeedback.uniforms.tPrev.value = readTarget.texture;
    renderer.setRenderTarget(writeTarget);
    renderer.render(sceneFeedback, camera);

    matDisplay.uniforms.tAccum.value = writeTarget.texture;
    renderer.setRenderTarget(null);
    renderer.render(sceneDisplay, camera);

    state.flip = !state.flip;
};

init();