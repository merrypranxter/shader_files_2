try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        renderer.setPixelRatio(1);

        const simSize = 128;
        const createTarget = (w, h, format, type, filter) => {
            return new THREE.WebGLRenderTarget(w, h, {
                format: format,
                type: type,
                minFilter: filter,
                magFilter: filter,
                wrapS: THREE.ClampToEdgeWrapping,
                wrapT: THREE.ClampToEdgeWrapping,
                depthBuffer: false
            });
        };

        const simA = createTarget(simSize, simSize, THREE.RGBAFormat, THREE.FloatType, THREE.NearestFilter);
        const simB = simA.clone();
        const renderA = createTarget(grid.width, grid.height, THREE.RGBAFormat, THREE.HalfFloatType, THREE.LinearFilter);
        const renderB = renderA.clone();

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneGeometry(2, 2);

        const commonVert = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const simMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_state: { value: null },
                u_res: { value: new THREE.Vector2(simSize, simSize) },
                u_time: { value: 0 },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
                u_mouse_down: { value: 0 },
                u_click: { value: 0 },
                u_reseed: { value: 0 }
            },
            vertexShader: commonVert,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_state;
                uniform vec2 u_res;
                uniform float u_time;
                uniform vec2 u_mouse;
                uniform float u_mouse_down;
                uniform float u_click;
                uniform float u_reseed;

                float hash12(vec2 p) {
                    vec3 p3  = fract(vec3(p.xyx) * .1031);
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.x + p3.y) * p3.z);
                }

                void main() {
                    vec2 px = 1.0 / u_res;
                    vec4 c = texture(u_state, vUv);
                    vec4 n = texture(u_state, vUv + vec2(0.0, px.y));
                    vec4 s = texture(u_state, vUv - vec2(0.0, px.y));
                    vec4 e = texture(u_state, vUv + vec2(px.x, 0.0));
                    vec4 w = texture(u_state, vUv - vec2(px.x, 0.0));

                    float grains = c.r;
                    float topples = floor(grains / 4.0);
                    float inc = floor(n.r / 4.0) + floor(s.r / 4.0) + floor(e.r / 4.0) + floor(w.r / 4.0);
                    float next_g = grains - 4.0 * topples + inc;

                    if (hash12(vUv + u_time) < 0.005) next_g += 1.0;
                    if (u_mouse_down > 0.5 && length(vUv - u_mouse) < 0.05) next_g += 2.0;
                    if (u_click > 0.5 && length(vUv - u_mouse) < 0.15) next_g += 15.0;

                    if (vUv.x < px.x || vUv.x > 1.0 - px.x || vUv.y < px.y || vUv.y > 1.0 - px.y) next_g = 0.0;

                    float ent = c.g;
                    if (u_reseed > 0.5 || (topples > 0.0 && hash12(vUv + u_time * 1.1) < 0.03)) {
                        ent = 1.0;
                    } else {
                        ent = max(0.0, ent - 0.005 * (1.0 + hash12(vUv * u_time)));
                    }

                    float tile = c.b;
                    if (ent <= 0.0 && c.g > 0.0) {
                        tile = floor(hash12(vUv + u_time * 0.1) * 16.0);
                    }

                    float act = c.a * 0.96;
                    if (topples > 0.0) act = 1.0;

                    fragColor = vec4(next_g, ent, tile, act);
                }
            `
        });

        const colorLib = `
            vec3 wavelengthToRGB(float nm) {
                float r = 0.0, g = 0.0, b = 0.0;
                if (nm >= 380.0 && nm < 440.0) { r = -(nm - 440.0) / 60.0; b = 1.0; }
                else if (nm >= 440.0 && nm < 490.0) { g = (nm - 440.0) / 50.0; b = 1.0; }
                else if (nm >= 490.0 && nm < 510.0) { g = 1.0; b = -(nm - 510.0) / 20.0; }
                else if (nm >= 510.0 && nm < 580.0) { r = (nm - 510.0) / 70.0; g = 1.0; }
                else if (nm >= 580.0 && nm < 645.0) { r = 1.0; g = -(nm - 645.0) / 65.0; }
                else if (nm >= 645.0 && nm <= 700.0) { r = 1.0; }
                float f = 1.0;
                if (nm >= 380.0 && nm < 420.0) f = 0.3 + 0.7 * (nm - 380.0) / 40.0;
                else if (nm >= 645.0 && nm <= 700.0) f = 0.3 + 0.7 * (700.0 - nm) / 55.0;
                return pow(vec3(r, g, b) * f, vec3(0.8));
            }

            vec3 srgbToLinear(vec3 c) {
                vec3 b1 = c / 12.92;
                vec3 b2 = pow((c + 0.055) / 1.055, vec3(2.4));
                return mix(b1, b2, step(0.04045, c));
            }

            vec3 linearToSrgb(vec3 c) {
                vec3 b1 = c * 12.92;
                vec3 b2 = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
                return mix(b1, b2, step(0.0031308, c));
            }

            vec3 srgbToOklab(vec3 c) {
                vec3 lin = srgbToLinear(c);
                float l = 0.4122214708 * lin.r + 0.5363325363 * lin.g + 0.0514459929 * lin.b;
                float m = 0.2119034982 * lin.r + 0.6806995451 * lin.g + 0.1073969566 * lin.b;
                float s = 0.0883024619 * lin.r + 0.2817188376 * lin.g + 0.6299787005 * lin.b;
                float l_ = pow(max(l, 0.0), 1.0/3.0);
                float m_ = pow(max(m, 0.0), 1.0/3.0);
                float s_ = pow(max(s, 0.0), 1.0/3.0);
                return vec3(
                    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
                    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
                    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
                );
            }

            vec3 oklabToSrgb(vec3 c) {
                float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
                float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
                float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
                float l = l_ * l_ * l_;
                float m = m_ * m_ * m_;
                float s = s_ * s_ * s_;
                vec3 lin = vec3(
                     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                );
                return linearToSrgb(clamp(lin, 0.0, 1.0));
            }
        `;

        const renderMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_grid: { value: null },
                u_prev: { value: null },
                u_res: { value: new THREE.Vector2(grid.width, grid.height) },
                u_time: { value: 0 },
                u_colors: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
                u_geomantic: { value: 1 }
            },
            vertexShader: commonVert,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_grid;
                uniform sampler2D u_prev;
                uniform vec2 u_res;
                uniform float u_time;
                uniform vec3 u_colors[4];
                uniform float u_geomantic;

                ${colorLib}

                float get_shape(vec2 cuv, float tile) {
                    float shape = 0.0;
                    if (tile < 4.0) {
                        vec2 p = cuv;
                        if (tile == 1.0) p.x = 1.0 - p.x;
                        else if (tile == 2.0) p.y = 1.0 - p.y;
                        else if (tile == 3.0) p = 1.0 - p;
                        float d1 = length(p) - 0.5;
                        float d2 = length(p - 1.0) - 0.5;
                        shape = max(smoothstep(0.12, 0.06, abs(d1)), smoothstep(0.12, 0.06, abs(d2)));
                    } else if (tile >= 4.0 && tile < 8.0) {
                        if (u_geomantic > 0.5) {
                            float row = floor(cuv.y * 4.0);
                            float ry = fract(cuv.y * 4.0);
                            int type = (int(tile) >> int(row)) & 1;
                            float d = (type == 0) ? length(vec2(cuv.x - 0.5, ry - 0.5)) :
                                      min(length(vec2(cuv.x - 0.3, ry - 0.5)), length(vec2(cuv.x - 0.7, ry - 0.5)));
                            shape = smoothstep(0.18, 0.1, d);
                        } else {
                            float cross = min(abs(cuv.x - 0.5), abs(cuv.y - 0.5)) - 0.1;
                            shape = smoothstep(0.06, 0.0, cross);
                        }
                    } else if (tile >= 8.0 && tile < 12.0) {
                        float dpad = length(cuv - 0.5) - 0.22;
                        float lx = abs(cuv.y - 0.5) - 0.06;
                        float ly = abs(cuv.x - 0.5) - 0.06;
                        shape = smoothstep(0.06, 0.0, dpad);
                        if (tile == 8.0 || tile == 10.0) shape = max(shape, smoothstep(0.03, 0.0, lx));
                        if (tile >= 9.0) shape = max(shape, smoothstep(0.03, 0.0, ly));
                    } else {
                        float cross = min(abs(cuv.x - 0.5), abs(cuv.y - 0.5)) - 0.1;
                        shape = smoothstep(0.06, 0.0, cross);
                    }
                    return shape;
                }

                void main() {
                    vec2 cell_id = floor(vUv * 128.0) / 128.0;
                    vec2 cuv = fract(vUv * 128.0);
                    vec4 gridData = texture(u_grid, cell_id);

                    float grains = gridData.r;
                    float ent = gridData.g;
                    float tile = gridData.b;
                    float act = gridData.a;

                    float shape = get_shape(cuv, tile);
                    float chaos = smoothstep(0.5, 0.2, length(cuv - 0.5) + 0.3 * sin(u_time * 12.0 + vUv.x * 50.0));
                    shape = mix(shape, chaos, ent);

                    float t1 = sin(vUv.x * 2.0 + u_time * 0.2) * 0.5 + 0.5;
                    float t2 = cos(vUv.y * 2.0 - u_time * 0.3) * 0.5 + 0.5;
                    vec3 bg_ok = mix(mix(srgbToOklab(u_colors[0]), srgbToOklab(u_colors[1]), t1),
                                     mix(srgbToOklab(u_colors[2]), srgbToOklab(u_colors[3]), t1), t2);
                    vec3 bg = oklabToSrgb(bg_ok);

                    float film_d = 300.0 + 200.0 * sin(vUv.x * 15.0 + vUv.y * 15.0 + u_time) + 300.0 * ent;
                    float path = 2.0 * 1.45 * film_d;
                    vec3 irid = vec3(pow(sin(3.14159 * path / 630.0), 2.0),
                                     pow(sin(3.14159 * path / 530.0), 2.0),
                                     pow(sin(3.14159 * path / 460.0), 2.0));
                    bg = mix(bg, irid, 0.45);

                    vec3 fg = wavelengthToRGB(mix(380.0, 700.0, clamp(grains / 5.0, 0.0, 1.0)));
                    if (grains >= 4.0) fg = vec3(1.0, 0.8, 0.9) * 2.0;
                    fg += act * vec3(0.5, 0.2, 0.4);

                    vec3 scene = mix(bg, fg, shape);

                    vec3 prev = texture(u_prev, vUv).rgb;
                    vec3 prev_ok = srgbToOklab(prev);
                    prev_ok.yz = -prev_ok.yz; 
                    vec3 ghost = oklabToSrgb(prev_ok);

                    vec3 decayed = prev * 0.88;
                    vec3 final_color = max(scene, decayed + ghost * 0.15 * length(prev));

                    fragColor = vec4(final_color, 1.0);
                }
            `
        });

        const postMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_scene: { value: null },
                u_res: { value: new THREE.Vector2(grid.width, grid.height) },
                u_crt: { value: 1 }
            },
            vertexShader: commonVert,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_scene;
                uniform vec2 u_res;
                uniform float u_crt;

                void main() {
                    vec2 p = vUv * 2.0 - 1.0;
                    float r2 = dot(p, p);
                    vec2 wuv = vUv + p * r2 * 0.04 * u_crt;

                    if (wuv.x < 0.0 || wuv.x > 1.0 || wuv.y < 0.0 || wuv.y > 1.0) {
                        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
                        return;
                    }

                    float ca = 0.005 * u_crt * r2;
                    vec3 col;
                    col.r = texture(u_scene, wuv + vec2(ca, 0)).r;
                    col.g = texture(u_scene, wuv).g;
                    col.b = texture(u_scene, wuv - vec2(ca, 0)).b;

                    vec3 bloom = vec3(0.0);
                    vec2 px = 1.0 / u_res;
                    for(int x=-2; x<=2; x++) {
                        for(int y=-2; y<=2; y++) {
                            vec3 s = texture(u_scene, wuv + vec2(x,y)*px*2.0).rgb;
                            bloom += max(s - 0.75, vec3(0.0));
                        }
                    }
                    col += bloom * 0.12;

                    col *= 1.0 - 0.12 * u_crt * sin(wuv.y * u_res.y * 3.14159);
                    col *= 1.0 - 0.06 * u_crt * sin(wuv.x * u_res.x * 3.14159);
                    col *= 1.0 - 0.4 * r2;

                    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
                }
            `
        });

        const simScene = new THREE.Scene();
        simScene.add(new THREE.Mesh(geometry, simMat));

        const renderScene = new THREE.Scene();
        renderScene.add(new THREE.Mesh(geometry, renderMat));

        const postScene = new THREE.Scene();
        postScene.add(new THREE.Mesh(geometry, postMat));

        canvas.__three = {
            renderer, camera,
            simA, simB, renderA, renderB,
            simScene, renderScene, postScene,
            simMat, renderMat, postMat
        };

        const palettes = [
            [ [0.4, 0.0, 0.8], [0.0, 0.8, 0.8], [1.0, 0.0, 0.5], [1.0, 0.4, 0.0] ], // Spectral Candy
            [ [0.0, 0.2, 0.1], [0.0, 0.6, 0.4], [0.8, 0.0, 0.6], [0.9, 0.7, 0.0] ], // Opal Beetle
            [ [0.2, 0.9, 0.0], [1.0, 0.0, 0.8], [1.0, 0.9, 0.0], [0.0, 0.8, 0.9] ], // Neon Fruit
            [ [0.0, 0.0, 0.4], [0.2, 0.0, 0.8], [0.0, 0.9, 0.9], [0.6, 0.0, 1.0] ]  // UV Aquarium
        ];

        canvas.__state = {
            reseed: 0, click: 0, palette_idx: 0, geomantic: 1, crt: 1,
            palettes: palettes.map(p => p.map(c => new THREE.Vector3(...c)))
        };

        window.addEventListener('keydown', (e) => {
            const st = canvas.__state;
            if (e.code === 'Space') st.reseed = 1;
            if (e.key.toLowerCase() === 'c') st.palette_idx = (st.palette_idx + 1) % 4;
            if (e.key.toLowerCase() === 'g') st.geomantic = 1 - st.geomantic;
            if (e.key.toLowerCase() === 'p') st.crt = 1 - st.crt;
        });

        canvas.addEventListener('mousedown', () => canvas.__state.click = 1);
        canvas.addEventListener('touchstart', () => canvas.__state.click = 1);
    }

    const t = canvas.__three;
    const st = canvas.__state;

    if (t.renderA.width !== grid.width || t.renderA.height !== grid.height) {
        t.renderA.setSize(grid.width, grid.height);
        t.renderB.setSize(grid.width, grid.height);
        t.renderMat.uniforms.u_res.value.set(grid.width, grid.height);
        t.postMat.uniforms.u_res.value.set(grid.width, grid.height);
        t.renderer.setSize(grid.width, grid.height, false);
    }

    t.simMat.uniforms.u_state.value = t.simA.texture;
    t.simMat.uniforms.u_time.value = time;
    t.simMat.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
    t.simMat.uniforms.u_mouse_down.value = mouse.isPressed ? 1 : 0;
    t.simMat.uniforms.u_click.value = st.click;
    t.simMat.uniforms.u_reseed.value = st.reseed;

    t.renderer.setRenderTarget(t.simB);
    t.renderer.render(t.simScene, t.camera);
    let temp = t.simA; t.simA = t.simB; t.simB = temp;

    t.renderMat.uniforms.u_grid.value = t.simA.texture;
    t.renderMat.uniforms.u_prev.value = t.renderA.texture;
    t.renderMat.uniforms.u_time.value = time;
    t.renderMat.uniforms.u_colors.value = st.palettes[st.palette_idx];
    t.renderMat.uniforms.u_geomantic.value = st.geomantic;

    t.renderer.setRenderTarget(t.renderB);
    t.renderer.render(t.renderScene, t.camera);
    temp = t.renderA; t.renderA = t.renderB; t.renderB = temp;

    t.postMat.uniforms.u_scene.value = t.renderA.texture;
    t.postMat.uniforms.u_crt.value = st.crt;
    
    t.renderer.setRenderTarget(null);
    t.renderer.render(t.postScene, t.camera);

    st.click = 0;
    st.reseed = 0;

} catch (e) {
    console.error("WebGL Initialization or Render Failed:", e);
}