try {
    if (!ctx) throw new Error("WebGL2 context not available");

    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;
        
        let floatType = THREE.HalfFloatType;
        if (renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float')) {
            floatType = THREE.FloatType;
        }

        const createFBO = (w, h, type = floatType) => {
            return new THREE.WebGLRenderTarget(w, h, {
                type: type,
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                wrapS: THREE.ClampToEdgeWrapping,
                wrapT: THREE.ClampToEdgeWrapping
            });
        };

        const rtSandpileA = createFBO(64, 64);
        const rtSandpileB = createFBO(64, 64);
        const rtBeauty = createFBO(grid.width, grid.height);
        const rtFinalA = createFBO(grid.width, grid.height);
        const rtFinalB = createFBO(grid.width, grid.height);

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneGeometry(2, 2);

        // --- Sandpile Simulation Material ---
        const sandpileMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tPrev: { value: null },
                uMouse: { value: new THREE.Vector2(0.5, 0.5) },
                uClick: { value: 0.0 },
                uTime: { value: 0.0 },
                uReseed: { value: 0.0 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D tPrev;
                uniform vec2 uMouse;
                uniform float uClick;
                uniform float uTime;
                uniform float uReseed;

                float hash12(vec2 p) {
                    vec3 p3  = fract(vec3(p.xyx) * .1031);
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.x + p3.y) * p3.z);
                }

                void main() {
                    vec2 texel = 1.0 / 64.0;
                    vec4 state = texture(tPrev, vUv);
                    float g = state.r;

                    float n = texture(tPrev, vUv + vec2(0.0, texel.y)).r;
                    float s = texture(tPrev, vUv - vec2(0.0, texel.y)).r;
                    float e = texture(tPrev, vUv + vec2(texel.x, 0.0)).r;
                    float w = texture(tPrev, vUv - vec2(texel.x, 0.0)).r;

                    float topples = floor(g / 4.0);
                    g += floor(n/4.0) + floor(s/4.0) + floor(e/4.0) + floor(w/4.0) - 4.0 * topples;

                    // Auto-inject grains for constant life
                    if (length(vUv - 0.5) < 0.05 && fract(uTime * 5.0) < 0.1) g += 1.0;
                    if (hash12(vUv + uTime) < 0.001) g += 4.0;

                    // Mouse interaction
                    float dist = length(vUv - uMouse);
                    if (uClick > 0.5 && dist < 0.08) g += 5.0; // Click burst
                    if (uClick > 0.0 && dist < 0.03) g += 1.0; // Drag trail

                    // WFC Collapse wave logic
                    float collapse = state.b;
                    float mn = texture(tPrev, vUv + vec2(0.0, texel.y)).b;
                    float ms = texture(tPrev, vUv - vec2(0.0, texel.y)).b;
                    float me = texture(tPrev, vUv + vec2(texel.x, 0.0)).b;
                    float mw = texture(tPrev, vUv - vec2(texel.x, 0.0)).b;
                    float maxN = max(max(mn, ms), max(me, mw));

                    if (uReseed > 0.5) {
                        collapse = 0.0;
                    } else if (collapse > 0.0) {
                        collapse = min(collapse + 0.015, 1.0);
                    } else if (maxN > 0.05 || length(vUv - 0.5) < 0.05) {
                        if (hash12(vUv + uTime) < 0.3) collapse = 0.02;
                    }

                    fragColor = vec4(g, topples > 0.0 ? 1.0 : state.g * 0.9, collapse, 1.0);
                }
            `
        });

        // --- Beauty Render Material ---
        const beautyMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tSandpile: { value: null },
                uTime: { value: 0.0 },
                uHueOffset: { value: 0.0 },
                uGeomancy: { value: 1.0 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D tSandpile;
                uniform float uTime;
                uniform float uHueOffset;
                uniform float uGeomancy;

                vec3 hash32(vec2 p) {
                    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
                    p3 += dot(p3, p3.yxz+33.33);
                    return fract((p3.xxy+p3.yzz)*p3.zyx);
                }
                
                float snoise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    vec2 u = f*f*(3.0-2.0*f);
                    return mix(mix(hash32(i).x, hash32(i + vec2(1.0, 0.0)).x, u.x),
                               mix(hash32(i + vec2(0.0, 1.0)).x, hash32(i + vec2(1.0, 1.0)).x, u.x), u.y);
                }

                // Spectral Color (Wyman approximation)
                vec3 wavelengthToRGB(float l) {
                    l = mod(l + uHueOffset, 320.0) + 380.0;
                    float x = 1.056 * exp(-0.5 * pow((l - 599.8) / 37.9, 2.0))
                            + 0.362 * exp(-0.5 * pow((l - 442.0) / 16.0, 2.0))
                            - 0.065 * exp(-0.5 * pow((l - 501.1) / 20.4, 2.0));
                    float y = 0.821 * exp(-0.5 * pow((l - 568.8) / 46.9, 2.0))
                            + 0.286 * exp(-0.5 * pow((l - 530.9) / 16.3, 2.0));
                    float z = 1.217 * exp(-0.5 * pow((l - 437.0) / 11.8, 2.0))
                            + 0.681 * exp(-0.5 * pow((l - 459.0) / 26.0, 2.0));
                    vec3 rgb = vec3(
                         3.2406 * x - 1.5372 * y - 0.4986 * z,
                        -0.9689 * x + 1.8758 * y + 0.0415 * z,
                         0.0557 * x - 0.2040 * y + 1.0570 * z
                    );
                    return max(rgb, vec3(0.0));
                }

                // Thin-film Iridescence
                vec3 thinFilm(float d) {
                    float n = 1.45;
                    float path = 2.0 * n * d;
                    float r = pow(sin(3.1415 * path / 630.0), 2.0);
                    float g = pow(sin(3.1415 * path / 530.0), 2.0);
                    float b = pow(sin(3.1415 * path / 460.0), 2.0);
                    return mix(vec3(r, g, b), vec3(0.6, 0.1, 0.7), 0.35); // Ensure lush saturated base
                }

                // OKLab to sRGB
                vec3 oklab_to_srgb(vec3 c) {
                    float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
                    float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
                    float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
                    l = l*l*l; m = m*m*m; s = s*s*s;
                    return vec3(
                         4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                    );
                }

                // Entropy Heatmap Palette
                vec3 heatMap(float t) {
                    vec3 c1 = vec3(0.4, 0.15, -0.2);  // Violet
                    vec3 c2 = vec3(0.6, 0.25, -0.05); // Hot Pink
                    vec3 c3 = vec3(0.8, -0.1, -0.15); // Cyan
                    vec3 c4 = vec3(0.9, 0.1, 0.1);    // Acid Yellow/Green
                    float p = fract(t);
                    vec3 lab;
                    if (p < 0.33) lab = mix(c1, c2, p/0.33);
                    else if (p < 0.66) lab = mix(c2, c3, (p-0.33)/0.33);
                    else lab = mix(c3, c4, (p-0.66)/0.34);
                    return oklab_to_srgb(lab);
                }

                // Tile SDFs
                float d_truchet(vec2 p, float h) {
                    if(fract(h * 13.3) > 0.5) p.x = 1.0 - p.x;
                    float d1 = abs(length(p) - 0.5);
                    float d2 = abs(length(p - 1.0) - 0.5);
                    return min(d1, d2) - 0.15;
                }

                float d_geomancy(vec2 p, float h) {
                    float row = floor(p.y * 4.0);
                    float isTwo = step(0.5, fract(h * (row + 1.0) * 17.7));
                    vec2 cell = vec2(p.x, fract(p.y * 4.0));
                    float d1 = length(cell - vec2(0.35, 0.5));
                    float d2 = length(cell - vec2(0.65, 0.5));
                    float d3 = length(cell - vec2(0.5, 0.5));
                    return (isTwo > 0.5 ? min(d1, d2) : d3) - 0.15;
                }

                float d_circuit(vec2 p, float h) {
                    float d = min(abs(p.x - 0.5), abs(p.y - 0.5));
                    if(fract(h*21.1) > 0.5) d = min(d, length(p - 0.5) - 0.25);
                    return d - 0.08;
                }

                void main() {
                    // Structural Color Background
                    float filmThick = 400.0 + 300.0 * snoise(vUv * 3.0 + uTime * 0.1);
                    vec3 bg = thinFilm(filmThick);
                    bg *= 0.7 + 0.3 * snoise(vUv * 20.0 - uTime * 0.2); // Opal microtexture

                    // Grid Logic
                    vec2 grid_uv = vUv * 24.0;
                    vec2 id = floor(grid_uv);
                    vec2 f = fract(grid_uv);
                    float h = hash32(id).x;

                    vec4 sand = texture(tSandpile, vUv);
                    float grains = sand.r;
                    float collapse = sand.b;

                    vec3 tileColor = vec3(0.0);
                    float tileAlpha = 0.0;

                    float type = mod(floor(h * 10.0), 3.0);
                    if (uGeomancy < 0.5 && type == 1.0) type = 0.0; // Toggle geomancy

                    float d = 1.0;
                    if (type == 0.0) d = d_truchet(f, h);
                    else if (type == 1.0) d = d_geomancy(f, h);
                    else d = d_circuit(f, h);

                    float mask = smoothstep(0.12, 0.0, d);
                    vec3 finalTile = wavelengthToRGB(380.0 + h * 320.0);
                    finalTile = mix(finalTile, vec3(1.0), smoothstep(0.02, 0.0, d)); // Core glow

                    if (collapse < 1.0) {
                        float heat = snoise(id * 0.15 + uTime * 0.4);
                        vec3 hc = heatMap(heat + uTime * 0.2);
                        tileColor = mix(hc, finalTile, collapse);
                        tileAlpha = mix(0.7, mask, collapse);
                    } else {
                        tileColor = finalTile;
                        tileAlpha = mask;
                    }

                    vec3 scene = mix(bg, tileColor, tileAlpha);

                    // Sandpile Energy
                    vec3 paint = vec3(0.0);
                    if (grains > 0.0) {
                        paint = wavelengthToRGB(380.0 + mod(grains * 60.0, 320.0)) * min(grains, 4.0) * 0.35;
                    }

                    fragColor = vec4(scene + paint, 1.0);
                }
            `
        });

        // --- CRT & Persistence Material ---
        const crtMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tBeauty: { value: null },
                tPrev: { value: null },
                uResolution: { value: new THREE.Vector2(grid.width, grid.height) },
                uCrt: { value: 1.0 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D tBeauty;
                uniform sampler2D tPrev;
                uniform vec2 uResolution;
                uniform float uCrt;

                void main() {
                    vec2 uv = vUv;
                    vec2 cc = uv - 0.5;
                    float r2 = dot(cc, cc);
                    uv = uv + cc * (0.12 * r2 + 0.06 * r2 * r2) * uCrt; // Barrel distortion
                    
                    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                        fragColor = vec4(0.2, 0.0, 0.4, 1.0); // Violet vignette edge
                        return;
                    }

                    // RGB Convergence
                    vec2 offset = cc * 0.007 * uCrt;
                    float r = texture(tBeauty, uv + offset).r;
                    float g = texture(tBeauty, uv).g;
                    float b = texture(tBeauty, uv - offset).b;
                    vec3 cur = vec3(r, g, b);

                    vec4 prev = texture(tPrev, vUv); // Undistorted for accurate persistence

                    // Complementary Ghost (Afterimage)
                    vec3 comp = vec3(1.0) - prev.rgb;
                    comp = mix(comp, normalize(comp + 0.1), 0.5); // Keep it saturated
                    vec3 ghost = comp * length(prev.rgb) * 0.18;

                    vec3 scene = cur;
                    vec3 outColor = max(scene, prev.rgb * 0.88); // Persistence
                    outColor += ghost * 0.08;

                    // Scanlines
                    float scan = 0.5 + 0.5 * sin(uv.y * uResolution.y * 3.1415);
                    outColor *= 1.0 - 0.2 * (1.0 - scan) * uCrt;

                    // Bloom
                    vec3 bloom = pow(max(outColor - 0.35, 0.0), vec3(2.0)) * 1.8;
                    outColor += bloom;

                    // Vignette
                    float vig = smoothstep(1.2, 0.2, length(cc * vec2(1.2, 1.0)));
                    outColor = mix(vec3(0.2, 0.0, 0.4), outColor, vig);

                    // Tone mapping (preserve saturation)
                    outColor = outColor / (1.0 + outColor * 0.15);
                    outColor = pow(outColor, vec3(1.0 / 1.1));

                    fragColor = vec4(outColor, 1.0);
                }
            `
        });

        // --- Final Copy to Screen ---
        const copyMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: { tDiffuse: { value: null } },
            vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
            fragmentShader: `in vec2 vUv; out vec4 fragColor; uniform sampler2D tDiffuse; void main() { fragColor = texture(tDiffuse, vUv); }`
        });

        const meshSandpile = new THREE.Mesh(geometry, sandpileMat);
        const sceneSandpile = new THREE.Scene(); sceneSandpile.add(meshSandpile);

        const meshBeauty = new THREE.Mesh(geometry, beautyMat);
        const sceneBeauty = new THREE.Scene(); sceneBeauty.add(meshBeauty);

        const meshCrt = new THREE.Mesh(geometry, crtMat);
        const sceneCrt = new THREE.Scene(); sceneCrt.add(meshCrt);

        const meshCopy = new THREE.Mesh(geometry, copyMat);
        const sceneCopy = new THREE.Scene(); sceneCopy.add(meshCopy);

        canvas.__three = {
            renderer, camera,
            rtSandpileA, rtSandpileB, rtBeauty, rtFinalA, rtFinalB,
            sandpileMat, beautyMat, crtMat, copyMat,
            sceneSandpile, sceneBeauty, sceneCrt, sceneCopy,
            state: {
                mouse: new THREE.Vector2(0.5, 0.5),
                click: 0,
                reseed: 0,
                hueOffset: 0,
                geomancy: 1,
                crt: 1
            }
        };

        // Event Listeners
        const updateMouse = (e) => {
            const rect = canvas.getBoundingClientRect();
            canvas.__three.state.mouse.x = (e.clientX - rect.left) / rect.width;
            canvas.__three.state.mouse.y = 1.0 - (e.clientY - rect.top) / rect.height;
            canvas.__three.state.click = e.buttons > 0 ? 0.5 : 0.0;
        };
        canvas.addEventListener('pointermove', updateMouse);
        canvas.addEventListener('pointerdown', (e) => { updateMouse(e); canvas.__three.state.click = 1.0; });
        canvas.addEventListener('pointerup', () => canvas.__three.state.click = 0.0);

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') canvas.__three.state.reseed = 1.0;
            if (e.code === 'KeyC') canvas.__three.state.hueOffset += 60.0;
            if (e.code === 'KeyG') canvas.__three.state.geomancy = 1.0 - canvas.__three.state.geomancy;
            if (e.code === 'KeyP') canvas.__three.state.crt = 1.0 - canvas.__three.state.crt;
        });
    }

    const {
        renderer, camera,
        rtSandpileA, rtSandpileB, rtBeauty, rtFinalA, rtFinalB,
        sandpileMat, beautyMat, crtMat, copyMat,
        sceneSandpile, sceneBeauty, sceneCrt, sceneCopy,
        state
    } = canvas.__three;

    renderer.setSize(grid.width, grid.height, false);
    crtMat.uniforms.uResolution.value.set(grid.width, grid.height);

    // 1. Sandpile Pass
    sandpileMat.uniforms.tPrev.value = rtSandpileA.texture;
    sandpileMat.uniforms.uMouse.value.copy(state.mouse);
    sandpileMat.uniforms.uClick.value = state.click;
    sandpileMat.uniforms.uTime.value = time;
    sandpileMat.uniforms.uReseed.value = state.reseed;
    renderer.setRenderTarget(rtSandpileB);
    renderer.render(sceneSandpile, camera);
    
    // Swap sandpile
    let temp = rtSandpileA;
    canvas.__three.rtSandpileA = rtSandpileB;
    canvas.__three.rtSandpileB = temp;

    // 2. Beauty Pass
    beautyMat.uniforms.tSandpile.value = canvas.__three.rtSandpileA.texture;
    beautyMat.uniforms.uTime.value = time;
    beautyMat.uniforms.uHueOffset.value = state.hueOffset;
    beautyMat.uniforms.uGeomancy.value = state.geomancy;
    renderer.setRenderTarget(rtBeauty);
    renderer.render(sceneBeauty, camera);

    // 3. CRT & Persistence Pass
    crtMat.uniforms.tBeauty.value = rtBeauty.texture;
    crtMat.uniforms.tPrev.value = rtFinalA.texture;
    crtMat.uniforms.uCrt.value = state.crt;
    renderer.setRenderTarget(rtFinalB);
    renderer.render(sceneCrt, camera);

    // Swap final
    temp = rtFinalA;
    canvas.__three.rtFinalA = rtFinalB;
    canvas.__three.rtFinalB = temp;

    // 4. Output to Screen
    renderer.setRenderTarget(null);
    copyMat.uniforms.tDiffuse.value = canvas.__three.rtFinalA.texture;
    renderer.render(sceneCopy, camera);

    // Reset single-frame states
    state.reseed = 0.0;
    if (state.click > 0.8) state.click = 0.5;

} catch (e) {
    console.error("Spectral Candy Avalanche Garden Initialization Failed:", e);
}