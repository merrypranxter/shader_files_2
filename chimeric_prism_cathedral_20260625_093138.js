try {
    if (!ctx) throw new Error("WebGL2 context not available");

    if (!canvas.__chimeric) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: false, antialias: false });
        renderer.autoClear = false;

        const sceneA = new THREE.Scene();
        const sceneB = new THREE.Scene();
        const sceneC = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneGeometry(2, 2);

        const rtOptions = {
            type: THREE.HalfFloatType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            depthBuffer: false,
            stencilBuffer: false
        };

        const rtA_read = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
        const rtA_write = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
        const rtScene = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

        const COMMON_GLSL = `
        #define PI 3.14159265359
        #define TAU 6.28318530718

        float hash12(vec2 p) {
            vec3 p3  = fract(vec3(p.xyx) * .1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
        }
        vec2 hash22(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
            p3 += dot(p3, p3.yzx+33.33);
            return fract((p3.xx+p3.yz)*p3.zy);
        }
        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f*f*(3.0-2.0*f);
            return mix(mix(hash12(i+vec2(0,0)), hash12(i+vec2(1,0)), u.x),
                       mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y);
        }
        float fbm(vec2 p) {
            float v = 0.0, a = 0.5;
            for(int i=0; i<5; i++) { v+=a*noise(p); p=p*2.0; a*=0.5; }
            return v;
        }

        vec3 lobe(float x, float a, float mu, float sl, float sr) {
            float s = x < mu ? sl : sr;
            float t = (x - mu) / s;
            return a * exp(-0.5 * t * t);
        }
        vec3 cmf(float l) {
            float x = lobe(l, 1.056, 599.8, 37.9, 31.0) + lobe(l, 0.362, 442.0, 16.0, 26.7) + lobe(l, -0.065, 501.1, 20.4, 26.2);
            float y = lobe(l, 0.821, 568.8, 46.9, 40.5) + lobe(l, 0.286, 530.9, 16.3, 31.1);
            float z = lobe(l, 1.217, 437.0, 11.8, 36.0) + lobe(l, 0.681, 459.0, 26.0, 13.8);
            return vec3(x, y, z);
        }
        vec3 xyz2rgb(vec3 xyz) {
            vec3 rgb;
            rgb.r =  3.2406 * xyz.x - 1.5372 * xyz.y - 0.4986 * xyz.z;
            rgb.g = -0.9689 * xyz.x + 1.8758 * xyz.y + 0.0415 * xyz.z;
            rgb.b =  0.0557 * xyz.x - 0.2040 * xyz.y + 1.0570 * xyz.z;
            return rgb;
        }
        vec3 w2rgb(float l) {
            vec3 rgb = xyz2rgb(cmf(l));
            float lift = min(min(rgb.r, rgb.g), min(rgb.b, 0.0));
            rgb -= lift;
            float mx = max(max(rgb.r, rgb.g), rgb.b);
            if (mx > 0.0) rgb /= mx;
            return clamp(rgb, 0.0, 1.0);
        }
        `;

        const matA = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_buffer: { value: null },
                u_time: { value: 0 },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
                u_clickPos: { value: new THREE.Vector2(-1, -1) },
                u_clickTime: { value: -1000 },
                u_aspect: { value: 1.0 }
            },
            vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
            fragmentShader: `
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D u_buffer;
            uniform float u_time;
            uniform vec2 u_mouse;
            uniform vec2 u_clickPos;
            uniform float u_clickTime;
            uniform float u_aspect;
            ${COMMON_GLSL}

            float sdHexagram(vec2 p, float r) {
                const vec4 k = vec4(-0.5, 0.866025, 0.57735, 1.73205);
                p = abs(p);
                p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
                p -= 2.0 * min(dot(k.yx, p), 0.0) * k.yx;
                p -= vec2(clamp(p.x, r*k.z, r*k.w), r);
                return length(p) * sign(p.y);
            }

            float cathedral(vec2 p) {
                p.x = abs(p.x);
                float d = length(p - vec2(0.0, clamp(p.y, -0.8, 0.4))) - 0.7;
                d = max(d, -(length(p - vec2(0.0, clamp(p.y, -0.8, 0.3))) - 0.6));
                float rose = length(p - vec2(0.0, 0.3)) - 0.25;
                d = min(d, max(rose, -(rose + 0.05)));
                float hex = sdHexagram(p - vec2(0.0, 0.3), 0.15);
                d = min(d, max(hex, -(hex + 0.02)));
                vec2 sp = p - vec2(0.4, -0.3);
                float side = length(sp - vec2(0.0, clamp(sp.y, -0.5, 0.2))) - 0.2;
                side = max(side, -(length(sp - vec2(0.0, clamp(sp.y, -0.5, 0.1))) - 0.15));
                d = min(d, side);
                return d;
            }

            void main() {
                vec2 p = vUv * 2.0 - 1.0;
                p.x *= u_aspect;
                vec4 prev = texture(u_buffer, vUv);

                float dCath = cathedral(p);
                
                // Plasma Filaments crawling along architecture
                float d = abs(dCath) + 0.015 * fbm(p * 25.0 - u_time * 2.0);
                vec2 q = p;
                for(int i=0; i<3; i++) {
                    q = abs(q * 1.5) - vec2(0.15, 0.2);
                    float a = u_time * 0.3 + float(i);
                    q *= mat2(cos(a), -sin(a), sin(a), cos(a));
                    d = min(d, abs(q.x) + 0.02 * fbm(q * 12.0 + u_time));
                }
                float plasma = 0.004 / (d + 0.001);
                vec3 col = w2rgb(400.0 + mod(u_time * 70.0 + fbm(p*5.0)*100.0, 300.0)) * plasma;

                // Attract to mouse
                vec2 m = u_mouse * 2.0 - 1.0;
                m.x *= u_aspect;
                float dMouse = length(p - m);
                col += w2rgb(580.0) * 0.008 / (dMouse + 0.001);

                // Impossible Color Seed (Click Bloom)
                vec2 cp = u_clickPos * 2.0 - 1.0;
                cp.x *= u_aspect;
                float dClick = length(p - cp);
                float clickPuls = exp(-dClick * 30.0) * exp(-(u_time - u_clickTime)*2.5);
                if (clickPuls > 0.01) {
                    col += w2rgb(500.0) * clickPuls * 2.0;
                }

                // Fatigue / Afterimage (Hue shifting opponent process)
                vec3 fatigue = prev.brg; // Non-muddy opponent shift
                vec3 finalCol = mix(prev.rgb, fatigue, 0.03) * 0.96 + col;

                fragColor = vec4(clamp(finalCol, 0.0, 3.0), 1.0);
            }
            `
        });

        const matB = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_params: { value: new THREE.Vector4(1, 1, 1, 1) },
                u_aspect: { value: 1.0 }
            },
            vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
            fragmentShader: `
            in vec2 vUv;
            out vec4 fragColor;
            uniform float u_time;
            uniform vec4 u_params; // x:palette, y:glass, z:alchemy, w:depth
            uniform float u_aspect;
            ${COMMON_GLSL}

            float sdHexagram(vec2 p, float r) {
                const vec4 k = vec4(-0.5, 0.866025, 0.57735, 1.73205);
                p = abs(p);
                p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
                p -= 2.0 * min(dot(k.yx, p), 0.0) * k.yx;
                p -= vec2(clamp(p.x, r*k.z, r*k.w), r);
                return length(p) * sign(p.y);
            }

            float cathedral(vec2 p) {
                p.x = abs(p.x);
                float d = length(p - vec2(0.0, clamp(p.y, -0.8, 0.4))) - 0.7;
                d = max(d, -(length(p - vec2(0.0, clamp(p.y, -0.8, 0.3))) - 0.6));
                float rose = length(p - vec2(0.0, 0.3)) - 0.25;
                d = min(d, max(rose, -(rose + 0.05)));
                float hex = sdHexagram(p - vec2(0.0, 0.3), 0.15);
                d = min(d, max(hex, -(hex + 0.02)));
                vec2 sp = p - vec2(0.4, -0.3);
                float side = length(sp - vec2(0.0, clamp(sp.y, -0.5, 0.2))) - 0.2;
                side = max(side, -(length(sp - vec2(0.0, clamp(sp.y, -0.5, 0.1))) - 0.15));
                d = min(d, side);
                return d;
            }

            vec3 birefringence(float thickness) {
                float gamma = thickness * 3500.0;
                vec3 col = vec3(0.0);
                float sumY = 0.0;
                for(float l = 380.0; l <= 700.0; l += 25.0) {
                    float I = pow(sin(PI * gamma / l), 2.0);
                    vec3 c = xyz2rgb(cmf(l));
                    col += c * I;
                    sumY += c.y;
                }
                return clamp(col / (sumY + 0.001), 0.0, 1.0);
            }

            float dots(vec2 p) {
                vec2 id = floor(p);
                vec2 f = fract(p);
                float d = 1.0;
                for(int y=-1; y<=1; y++) {
                    for(int x=-1; x<=1; x++) {
                        vec2 off = vec2(x, y);
                        vec2 h = hash22(id + off);
                        d = min(d, length(off + h - f));
                    }
                }
                return smoothstep(0.35, 0.1, d);
            }

            vec3 prismBeams(vec2 p, float t) {
                vec3 col = vec3(0.0);
                for(int i=0; i<3; i++) {
                    float a = t * 0.2 + float(i) * PI / 1.5;
                    vec2 dir = vec2(cos(a), sin(a));
                    float dist = abs(dot(p, dir) - sin(t * 0.3 + float(i)) * 0.5);
                    col += w2rgb(430.0) * smoothstep(0.05, 0.01, dist + 0.015);
                    col += w2rgb(530.0) * smoothstep(0.05, 0.01, dist);
                    col += w2rgb(650.0) * smoothstep(0.05, 0.01, dist - 0.015);
                }
                return col;
            }

            void main() {
                vec2 p = vUv * 2.0 - 1.0;
                p.x *= u_aspect;

                // Deep jewel-tone saturated background
                float n = fbm(p * 1.5 + u_time * 0.1);
                vec3 bg = mix(w2rgb(400.0 + n * 120.0), w2rgb(580.0 + n * 100.0), fbm(p * 2.5 - u_time * 0.15));
                bg = clamp(bg, 0.1, 1.0);

                float dCath = cathedral(p);

                // Birefringence inside cathedral
                float stress = 0.08 / (abs(dCath) + 0.001);
                float thickness = fbm(p * 4.0 + u_time * 0.15) * 1.5 + stress;
                vec3 birefCol = birefringence(thickness);

                // Glass Patterns
                vec2 p1 = p * 60.0;
                float angle = smoothstep(0.6, 0.0, dCath) * PI * 0.35;
                mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
                vec2 p2 = (p * rot) * 60.0;
                float gPattern = mix(dots(p1), dots(p1) * dots(p2), u_params.y);
                vec3 glassCol = w2rgb(480.0 + 160.0 * sin(u_time * 0.4)) * gPattern;

                // Chromostereopsis Edges
                vec3 chromo = vec3(0.0);
                float edge = smoothstep(0.02, 0.0, abs(dCath));
                chromo += vec3(1.0, 0.0, 0.0) * edge * smoothstep(0.0, 0.5, sin(p.x * 20.0 + u_time));
                chromo += vec3(0.0, 0.0, 1.0) * edge * smoothstep(0.0, 0.5, cos(p.y * 20.0 - u_time));

                // Prism Beams
                vec3 beams = prismBeams(p, u_time);

                // Simultaneous Contrast Cells
                vec2 id = floor(p * 8.0);
                float check = mod(id.x + id.y, 2.0);
                vec3 simCol = mix(w2rgb(460.0), w2rgb(610.0), check);
                float simMask = smoothstep(0.05, 0.0, abs(length(p) - 1.2)) * fbm(p*10.0);

                vec3 finalCol = bg;
                if (dCath < 0.0) finalCol = mix(finalCol, birefCol, 0.85);
                finalCol += glassCol * 0.7 * u_params.y;
                finalCol += chromo * u_params.w * 1.5;
                finalCol += beams * 0.8;
                finalCol = mix(finalCol, simCol, simMask);

                fragColor = vec4(clamp(finalCol, 0.0, 2.0), 1.0);
            }
            `
        });

        const matC = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_scene: { value: null },
                u_plasma: { value: null },
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2() },
                u_aspect: { value: 1.0 }
            },
            vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
            fragmentShader: `
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D u_scene;
            uniform sampler2D u_plasma;
            uniform float u_time;
            uniform vec2 u_resolution;
            uniform float u_aspect;
            ${COMMON_GLSL}

            void main() {
                vec2 uv = vUv;
                vec2 p = uv * 2.0 - 1.0;
                p.x *= u_aspect;

                // Chromatic Aberration
                vec2 delta = uv - 0.5;
                float dist = length(delta);
                vec2 dir = normalize(delta + 1e-5);
                float caAmt = dist * 0.008;

                vec3 sceneCol;
                sceneCol.r = texture(u_scene, uv + dir * caAmt).r;
                sceneCol.g = texture(u_scene, uv).g;
                sceneCol.b = texture(u_scene, uv - dir * caAmt).b;

                vec4 plasmaCol = texture(u_plasma, uv);

                // Diffraction Grating Fans
                float angle = atan(p.y, p.x);
                float grating = sin(angle * 40.0 + length(p) * 150.0 - u_time * 12.0);
                float diffIntensity = smoothstep(0.3, 1.0, length(plasmaCol.rgb));
                vec3 diffCol = w2rgb(380.0 + (grating * 0.5 + 0.5) * 320.0) * diffIntensity * 0.7;

                vec3 finalCol = sceneCol + plasmaCol.rgb + diffCol;

                // Colored Bloom
                vec3 bloom = vec3(0.0);
                vec2 texel = 1.0 / u_resolution;
                for(float x=-2.0; x<=2.0; x++) {
                    for(float y=-2.0; y<=2.0; y++) {
                        bloom += texture(u_scene, uv + vec2(x,y)*texel*2.5).rgb;
                    }
                }
                bloom /= 25.0;
                finalCol += bloom * 0.4;

                // Tone mapping & Gamma
                finalCol = pow(clamp(finalCol, 0.0, 1.0), vec3(1.0/2.2));

                fragColor = vec4(finalCol, 1.0);
            }
            `
        });

        const meshA = new THREE.Mesh(geometry, matA);
        sceneA.add(meshA);
        const meshB = new THREE.Mesh(geometry, matB);
        sceneB.add(meshB);
        const meshC = new THREE.Mesh(geometry, matC);
        sceneC.add(meshC);

        const state = {
            palette: 1, glass: 1, alchemy: 1, depth: 1, biref: 1,
            clickPos: new THREE.Vector2(-1, -1), clickTime: -1000, wasPressed: false
        };

        if (!window.__chimeric_keys) {
            window.addEventListener('keydown', (e) => {
                if (!canvas.__chimeric) return;
                const s = canvas.__chimeric.state;
                const k = e.key.toLowerCase();
                if (k === 'c') s.palette = (s.palette + 1) % 5;
                if (k === 'g') s.glass = s.glass > 0.5 ? 0.0 : 1.0;
                if (k === 'a') s.alchemy = s.alchemy > 0.5 ? 0.0 : 1.0;
                if (k === 'd') s.depth = s.depth > 0.5 ? 0.0 : 1.0;
                if (k === 'b') s.biref = s.biref > 0.5 ? 0.0 : 1.0;
            });
            window.__chimeric_keys = true;
        }

        canvas.__chimeric = {
            renderer, sceneA, sceneB, sceneC, camera,
            rtA_read, rtA_write, rtScene,
            matA, matB, matC, state,
            width: 0, height: 0
        };
    }

    const app = canvas.__chimeric;
    const { renderer, sceneA, sceneB, sceneC, camera, matA, matB, matC, state } = app;

    if (app.width !== grid.width || app.height !== grid.height) {
        app.width = grid.width;
        app.height = grid.height;
        renderer.setSize(grid.width, grid.height, false);
        app.rtA_read.setSize(grid.width, grid.height);
        app.rtA_write.setSize(grid.width, grid.height);
        app.rtScene.setSize(grid.width, grid.height);
    }

    if (mouse.isPressed && !state.wasPressed) {
        state.clickPos.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
        state.clickTime = time;
    }
    state.wasPressed = mouse.isPressed;

    const aspect = grid.width / grid.height;
    const mUv = new THREE.Vector2(mouse.x / grid.width, 1.0 - mouse.y / grid.height);

    // Pass A (Plasma/Feedback)
    matA.uniforms.u_time.value = time;
    matA.uniforms.u_mouse.value.copy(mUv);
    matA.uniforms.u_clickPos.value.copy(state.clickPos);
    matA.uniforms.u_clickTime.value = state.clickTime;
    matA.uniforms.u_aspect.value = aspect;
    matA.uniforms.u_buffer.value = app.rtA_read.texture;
    renderer.setRenderTarget(app.rtA_write);
    renderer.render(sceneA, camera);

    // Pass B (Scene)
    matB.uniforms.u_time.value = time;
    matB.uniforms.u_aspect.value = aspect;
    matB.uniforms.u_params.value.set(state.palette, state.glass, state.alchemy, state.depth);
    renderer.setRenderTarget(app.rtScene);
    renderer.render(sceneB, camera);

    // Pass C (Post/Composite to Screen)
    matC.uniforms.u_time.value = time;
    matC.uniforms.u_aspect.value = aspect;
    matC.uniforms.u_resolution.value.set(grid.width, grid.height);
    matC.uniforms.u_scene.value = app.rtScene.texture;
    matC.uniforms.u_plasma.value = app.rtA_write.texture;
    renderer.setRenderTarget(null);
    renderer.render(sceneC, camera);

    // Ping-pong swap
    const temp = app.rtA_read;
    app.rtA_read = app.rtA_write;
    app.rtA_write = temp;

} catch (e) {
    console.error("Chimeric Cathedral Error:", e);
}