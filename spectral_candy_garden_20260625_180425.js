export function render(ctx, grid, time, repos, input, mouse, canvas, THREE) {
    if (!canvas.__three) {
        try {
            if (!ctx) throw new Error("WebGL 2 context not available");

            const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
            renderer.autoClear = false;

            const simResY = 80;
            const simResX = Math.floor(simResY * (grid.width / grid.height));
            
            const rtOpts = {
                type: THREE.HalfFloatType,
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                depthBuffer: false,
                stencilBuffer: false,
                format: THREE.RGBAFormat
            };

            const simA = new THREE.WebGLRenderTarget(simResX, simResY, rtOpts);
            const simB = new THREE.WebGLRenderTarget(simResX, simResY, rtOpts);

            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            const sceneSim = new THREE.Scene();
            const sceneDisp = new THREE.Scene();
            const quadGeo = new THREE.PlaneGeometry(2, 2);

            const simVert = `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `;

            const simFrag = `
                in vec2 vUv;
                out vec4 fragColor;
                
                uniform sampler2D u_sim;
                uniform vec2 u_res;
                uniform vec2 u_mouse;
                uniform float u_mousePress;
                uniform float u_click;
                uniform float u_time;

                void main() {
                    vec2 texel = 1.0 / u_res;
                    vec4 state = texture(u_sim, vUv);
                    
                    float grains = state.r;
                    float energy = state.g;
                    
                    float newGrains = grains;
                    if (grains >= 4.0) newGrains -= 4.0;
                    
                    newGrains += step(4.0, texture(u_sim, vUv + vec2(texel.x, 0.0)).r);
                    newGrains += step(4.0, texture(u_sim, vUv - vec2(texel.x, 0.0)).r);
                    newGrains += step(4.0, texture(u_sim, vUv + vec2(0.0, texel.y)).r);
                    newGrains += step(4.0, texture(u_sim, vUv - vec2(0.0, texel.y)).r);

                    if (u_time < 0.1) {
                        newGrains = floor(fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453) * 6.0);
                        energy = 0.0;
                    }

                    float dist = length(vUv - u_mouse);
                    if (u_mousePress > 0.5 && dist < 0.04) {
                        newGrains += 2.0;
                        energy = 1.0;
                    }
                    if (u_click > 0.5 && dist < 0.08) {
                        newGrains += 8.0;
                        energy = 1.0;
                    }

                    energy = mix(energy, 0.0, 0.03);
                    if (newGrains >= 4.0) energy = 1.0;

                    fragColor = vec4(newGrains, energy, 0.0, 1.0);
                }
            `;

            const dispFrag = `
                in vec2 vUv;
                out vec4 fragColor;

                uniform sampler2D u_sim;
                uniform vec2 u_simRes;
                uniform vec2 u_resolution;
                uniform float u_time;
                uniform float u_geomancy;
                uniform float u_crt;
                uniform int u_palette;

                vec3 srgb_to_oklab(vec3 c) {
                    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
                    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
                    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
                    float l_ = sign(l)*pow(abs(l), 1.0/3.0);
                    float m_ = sign(m)*pow(abs(m), 1.0/3.0);
                    float s_ = sign(s)*pow(abs(s), 1.0/3.0);
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
                    vec3 okA = srgb_to_oklab(a);
                    vec3 okB = srgb_to_oklab(b);
                    return oklab_to_srgb(mix(okA, okB, t));
                }

                void main() {
                    vec2 uv = vUv;
                    vec2 q = uv * 2.0 - 1.0;
                    float r2 = dot(q, q);
                    uv = uv + q * (r2 * 0.04) * u_crt;

                    vec3 cA, cB, cC, cD;
                    if (u_palette == 0) {
                        cA = vec3(0.5, 0.0, 1.0); cB = vec3(0.0, 1.0, 0.8);
                        cC = vec3(1.0, 0.0, 0.5); cD = vec3(0.8, 1.0, 0.0);
                    } else if (u_palette == 1) {
                        cA = vec3(0.0, 0.4, 0.8); cB = vec3(1.0, 0.4, 0.2);
                        cC = vec3(0.2, 0.8, 0.5); cD = vec3(1.0, 0.0, 0.8);
                    } else if (u_palette == 2) {
                        cA = vec3(1.0, 0.2, 0.0); cB = vec3(1.0, 0.8, 0.0);
                        cC = vec3(0.0, 0.8, 1.0); cD = vec3(0.8, 0.0, 1.0);
                    } else if (u_palette == 3) {
                        cA = vec3(0.1, 0.9, 0.5); cB = vec3(0.9, 0.1, 0.9);
                        cC = vec3(0.0, 0.5, 1.0); cD = vec3(1.0, 0.5, 0.0);
                    } else {
                        cA = vec3(0.4, 0.0, 0.6); cB = vec3(0.0, 0.8, 0.4);
                        cC = vec3(1.0, 0.3, 0.3); cD = vec3(0.3, 1.0, 0.9);
                    }

                    float mixX = uv.x + sin(u_time * 0.2) * 0.1;
                    float mixY = uv.y + cos(u_time * 0.25) * 0.1;
                    vec3 top = oklab_mix(cA, cB, clamp(mixX, 0.0, 1.0));
                    vec3 bot = oklab_mix(cC, cD, clamp(mixX, 0.0, 1.0));
                    vec3 bg = oklab_mix(bot, top, clamp(mixY, 0.0, 1.0));

                    vec2 cellUv = fract(uv * u_simRes);
                    vec2 cellId = floor(uv * u_simRes);
                    
                    float epoch = floor(u_time / 16.0);
                    float phase = fract(u_time / 16.0);
                    float h = fract(sin(dot(cellId, vec2(12.9898, 78.233)) + epoch) * 43758.5453);
                    
                    float collapseFront = phase * 1.5 - 0.2;
                    float cellPos = (uv.x + uv.y) * 0.5 + (fract(h * 7.0) * 0.1);

                    float pattern = 0.0;
                    float isEntropy = 0.0;

                    if (cellPos > collapseFront) {
                        isEntropy = 1.0;
                        pattern = fract(sin(dot(cellUv + cellId, vec2(13.1, 71.3)) + u_time * 6.0) * 43758.5453);
                        pattern *= smoothstep(0.0, 0.15, cellPos - collapseFront);
                    } else {
                        if (u_geomancy > 0.5 && h < 0.25) {
                            float row = floor(cellUv.y * 4.0);
                            float bit = mod(floor(h * 1000.0 / pow(2.0, row)), 2.0);
                            vec2 pUv = vec2(cellUv.x, fract(cellUv.y * 4.0));
                            if (bit < 0.5) {
                                pattern += smoothstep(0.25, 0.1, length(pUv - vec2(0.5, 0.5)));
                            } else {
                                pattern += smoothstep(0.25, 0.1, length(pUv - vec2(0.3, 0.5)));
                                pattern += smoothstep(0.25, 0.1, length(pUv - vec2(0.7, 0.5)));
                            }
                        } else {
                            vec2 tUv = cellUv;
                            if (fract(h * 13.3) < 0.5) tUv.x = 1.0 - tUv.x;
                            float d1 = abs(length(tUv) - 0.5);
                            float d2 = abs(length(tUv - 1.0) - 0.5);
                            pattern += smoothstep(0.18, 0.05, min(d1, d2));
                        }
                    }

                    vec2 simOffset = (cellUv - 0.5) * 0.015 * u_crt;
                    vec2 simUv = (cellId + 0.5) / u_simRes;
                    
                    float grains = texture(u_sim, simUv).r;
                    float energy = texture(u_sim, simUv).g;

                    float grainsR = texture(u_sim, simUv + simOffset).r;
                    float grainsB = texture(u_sim, simUv - simOffset).r;
                    vec3 grainColor = vec3(grainsR, grains, grainsB) * 0.3;

                    vec3 cellColor;
                    if (isEntropy > 0.5) {
                        cellColor = mix(vec3(1.0, 0.0, 0.5), vec3(0.0, 1.0, 0.8), pattern);
                    } else {
                        float thickness = 300.0 + grains * 80.0 + pattern * 150.0 + energy * 250.0;
                        vec3 iridescence = vec3(
                            0.5 + 0.5 * cos(thickness * 0.015),
                            0.5 + 0.5 * cos(thickness * 0.011),
                            0.5 + 0.5 * cos(thickness * 0.008)
                        );
                        
                        vec3 okBg = srgb_to_oklab(bg);
                        vec3 compOk = vec3(okBg.x, -okBg.y, -okBg.z);
                        vec3 compCol = oklab_to_srgb(compOk);

                        cellColor = mix(compCol, iridescence, smoothstep(0.0, 0.6, energy));
                        cellColor += iridescence * (grains * 0.2);
                    }

                    vec3 finalColor = mix(bg, cellColor + grainColor, pattern * 0.8 + energy * 0.6);
                    
                    float mask = mod(gl_FragCoord.x, 3.0);
                    vec3 phosphor = vec3(mask < 1.0 ? 1.0 : 0.3, mask >= 1.0 && mask < 2.0 ? 1.0 : 0.3, mask >= 2.0 ? 1.0 : 0.3);
                    finalColor *= mix(vec3(1.0), phosphor, u_crt * 0.4);

                    finalColor *= 1.0 - (sin(uv.y * u_resolution.y * 3.14159) * 0.1 * u_crt);

                    float vig = smoothstep(1.2, 0.2, length(q));
                    vec3 vigColor = vec3(0.2, 0.0, 0.4);
                    finalColor = mix(vigColor, finalColor, vig);

                    fragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
                }
            `;

            const simMat = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_sim: { value: null },
                    u_res: { value: new THREE.Vector2(simResX, simResY) },
                    u_mouse: { value: new THREE.Vector2() },
                    u_mousePress: { value: 0 },
                    u_click: { value: 0 },
                    u_time: { value: 0 }
                },
                vertexShader: simVert,
                fragmentShader: simFrag
            });

            const dispMat = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_sim: { value: null },
                    u_simRes: { value: new THREE.Vector2(simResX, simResY) },
                    u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                    u_time: { value: 0 },
                    u_geomancy: { value: 1.0 },
                    u_crt: { value: 1.0 },
                    u_palette: { value: 0 }
                },
                vertexShader: simVert,
                fragmentShader: dispFrag
            });

            const simMesh = new THREE.Mesh(quadGeo, simMat);
            sceneSim.add(simMesh);

            const dispMesh = new THREE.Mesh(quadGeo, dispMat);
            sceneDisp.add(dispMesh);

            canvas.__three = { 
                renderer, simA, simB, sceneSim, sceneDisp, camera, 
                simMat, dispMat, simResX, simResY, clickPulse: 0 
            };

            canvas.tabIndex = 1;
            canvas.style.outline = 'none';
            canvas.addEventListener('keydown', (e) => {
                if (e.key.toLowerCase() === 'c') dispMat.uniforms.u_palette.value = (dispMat.uniforms.u_palette.value + 1) % 5;
                if (e.key.toLowerCase() === 'g') dispMat.uniforms.u_geomancy.value = 1.0 - dispMat.uniforms.u_geomancy.value;
                if (e.key.toLowerCase() === 'p') dispMat.uniforms.u_crt.value = 1.0 - dispMat.uniforms.u_crt.value;
                if (e.key === ' ') simMat.uniforms.u_time.value = 0.0;
            });
            canvas.addEventListener('mousedown', () => {
                canvas.__three.clickPulse = 1.0;
            });
        } catch (e) {
            console.error("WebGL Initialization Failed:", e);
            throw e;
        }
    }

    const t = canvas.__three;
    if (!t || !t.dispMat || !t.dispMat.uniforms) return;

    t.renderer.setSize(grid.width, grid.height, false);
    t.dispMat.uniforms.u_resolution.value.set(grid.width, grid.height);

    t.simMat.uniforms.u_time.value = time;
    t.dispMat.uniforms.u_time.value = time;

    const mx = mouse.x / grid.width;
    const my = 1.0 - (mouse.y / grid.height);
    t.simMat.uniforms.u_mouse.value.set(mx, my);
    t.simMat.uniforms.u_mousePress.value = mouse.isPressed ? 1.0 : 0.0;

    t.simMat.uniforms.u_click.value = t.clickPulse;
    t.clickPulse = Math.max(0, t.clickPulse - 0.1);

    t.simMat.uniforms.u_sim.value = t.simA.texture;
    t.renderer.setRenderTarget(t.simB);
    t.renderer.render(t.sceneSim, t.camera);

    const temp = t.simA;
    t.simA = t.simB;
    t.simB = temp;

    t.renderer.setRenderTarget(null);
    t.dispMat.uniforms.u_sim.value = t.simA.texture;
    t.renderer.render(t.sceneDisp, t.camera);
}