const THE_LISTS_CONCEPTS = [
    "orbit trap shimmer", "ultraviolet shame bleed", "phase desync", 
    "volumetric iteration mist", "bicontinuous labyrinth", "glassy dynamics",
    "pleochroic shift", "Möbius-bound surface light", "recursive signal cannibalism",
    "RGB_phase_bleed", "color_moire_rupture", "hexagonal close-packed structure"
];
console.log("THE-LISTS Concept Seed: " + THE_LISTS_CONCEPTS[Math.floor(Math.random() * THE_LISTS_CONCEPTS.length)]);

if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;
        
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneGeometry(2, 2);

        // Resolution for the simulation grid (WFC + Sandpile)
        const SIM_RES = 256;
        
        const rtParams = {
            type: THREE.FloatType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            stencilBuffer: false,
            depthBuffer: false
        };

        const rtRenderParams = {
            ...rtParams,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter
        };

        const fbos = {
            simA: new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, rtParams),
            simB: new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, rtParams),
            render: new THREE.WebGLRenderTarget(grid.width, grid.height, rtRenderParams),
            adaptA: new THREE.WebGLRenderTarget(grid.width, grid.height, rtRenderParams),
            adaptB: new THREE.WebGLRenderTarget(grid.width, grid.height, rtRenderParams)
        };

        const sharedUniforms = {
            uTime: { value: 0 },
            uResolution: { value: new THREE.Vector2(grid.width, grid.height) },
            uSimRes: { value: new THREE.Vector2(SIM_RES, SIM_RES) },
            uMouse: { value: new THREE.Vector2(0.5, 0.5) },
            uMouseDown: { value: 0 },
            uReseed: { value: 1.0 },
            uRegime: { value: 0.0 },
            uShowGeomantic: { value: 1.0 },
            uShowCRT: { value: 1.0 }
        };

        const vs = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        // --- SIMULATION PASS (Sandpile + WFC Fake) ---
        // r: grains, g: entropy, b: tile type, a: energy/heat
        const simFs = `
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform sampler2D uState;
            uniform vec2 uSimRes;
            uniform vec2 uMouse;
            uniform float uMouseDown;
            uniform float uReseed;
            uniform float uTime;

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
            }

            void main() {
                vec2 texel = 1.0 / uSimRes;
                vec4 state = texture(uState, vUv);
                
                if (uReseed > 0.5) {
                    float initGrains = floor(hash(vUv * 1.1) * 3.0);
                    fragColor = vec4(initGrains, 1.0, 0.0, 0.0);
                    return;
                }

                vec4 N = texture(uState, fract(vUv + vec2(0.0, texel.y)));
                vec4 S = texture(uState, fract(vUv - vec2(0.0, texel.y)));
                vec4 E = texture(uState, fract(vUv + vec2(texel.x, 0.0)));
                vec4 W = texture(uState, fract(vUv - vec2(texel.x, 0.0)));

                // Abelian Sandpile Logic
                float grains = state.r;
                float topples = floor(grains / 4.0);
                float in_N = floor(N.r / 4.0);
                float in_S = floor(S.r / 4.0);
                float in_E = floor(E.r / 4.0);
                float in_W = floor(W.r / 4.0);
                float next_grains = grains - 4.0 * topples + in_N + in_S + in_E + in_W;

                // WFC Entropy Decay
                float entropy = state.g;
                float type = state.b;
                float energy = state.a;
                
                if (entropy > 0.0) {
                    entropy -= 0.005 * (1.0 + hash(vUv)*2.0);
                    if (entropy <= 0.0) {
                        type = floor(hash(vUv * uTime) * 4.0);
                    }
                }

                // Global wave of re-entropy
                if (mod(uTime, 18.0) < 0.1) {
                    entropy = 1.0;
                    next_grains += floor(hash(vUv * uTime) * 2.0);
                }

                // Mouse interaction
                float dist = length(vUv - uMouse);
                if (uMouseDown > 0.5 && dist < 0.04) {
                    next_grains += 3.0;
                    entropy = 1.0;
                    energy = 1.0;
                }

                energy *= 0.95; // decay heat

                fragColor = vec4(next_grains, max(0.0, entropy), type, energy);
            }
        `;

        // --- RENDER PASS (Spectral Color, WFC Tiles, Structural Interference) ---
        const renderFs = `
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform sampler2D uSim;
            uniform vec2 uSimRes;
            uniform float uTime;
            uniform float uRegime;
            uniform float uShowGeomantic;

            // Spectral Color (CIE 1931 approximation)
            float lobe(float x, float a, float mu, float sl, float sr) {
                float s = x < mu ? sl : sr;
                float t = (x - mu) / s;
                return a * exp(-0.5 * t * t);
            }
            vec3 wavelength_to_srgb(float l) {
                float x = lobe(l, 1.056, 599.8, 37.9, 31.0) + lobe(l, 0.362, 442.0, 16.0, 26.7) - lobe(l, 0.065, 501.1, 20.4, 26.2);
                float y = lobe(l, 0.821, 568.8, 46.9, 40.5) + lobe(l, 0.286, 530.9, 16.3, 31.1);
                float z = lobe(l, 1.217, 437.0, 11.8, 36.0) + lobe(l, 0.681, 459.0, 26.0, 13.8);
                vec3 rgb = vec3(
                     3.2406 * x - 1.5372 * y - 0.4986 * z,
                    -0.9689 * x + 1.8758 * y + 0.0415 * z,
                     0.0557 * x - 0.2040 * y + 1.0570 * z
                );
                float m = min(min(rgb.r, rgb.g), rgb.b);
                rgb -= min(m, 0.0);
                float maxC = max(rgb.r, max(rgb.g, rgb.b));
                return maxC > 0.0 ? rgb / maxC : vec3(0.0);
            }

            // OKLab mixing
            vec3 srgb_to_oklab(vec3 c) {
                float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
                float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
                float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
                float l_ = pow(l, 1.0/3.0);
                float m_ = pow(m, 1.0/3.0);
                float s_ = pow(s, 1.0/3.0);
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
                return oklab_to_srgb(mix(srgb_to_oklab(a), srgb_to_oklab(b), t));
            }

            // Thin-film structural color
            vec3 thinFilm(float d, vec3 V, vec3 N) {
                float cosTheta = max(0.0, dot(V, N));
                float path = 2.0 * 1.45 * d * cosTheta;
                return vec3(
                    pow(sin(3.14159 * path / 630.0), 2.0),
                    pow(sin(3.14159 * path / 530.0), 2.0),
                    pow(sin(3.14159 * path / 460.0), 2.0)
                );
            }

            float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

            float geomantic(vec2 local, vec2 cell) {
                float h = hash(cell);
                int bits = int(h * 15.0);
                float mask = 0.0;
                for(int i=0; i<4; i++) {
                    float y = 0.3 - float(i)*0.2;
                    int bit = (bits >> i) & 1;
                    if(bit == 0) {
                        mask += smoothstep(0.08, 0.05, length(local - vec2(0.0, y)));
                    } else {
                        mask += smoothstep(0.08, 0.05, length(local - vec2(-0.15, y)));
                        mask += smoothstep(0.08, 0.05, length(local - vec2(0.15, y)));
                    }
                }
                return mask;
            }

            void main() {
                vec2 cellF = vUv * uSimRes;
                vec2 cell = floor(cellF);
                vec2 local = fract(cellF) - 0.5;

                vec4 sim = texture(uSim, cell / uSimRes);
                float grains = sim.r;
                float entropy = sim.g;
                float type = sim.b;

                // Vibrant Base Background (No Black/White)
                vec3 c1, c2;
                if(uRegime < 0.5) { c1 = vec3(0.4, 0.0, 0.8); c2 = vec3(0.0, 0.8, 0.8); } // Candy
                else if(uRegime < 1.5) { c1 = vec3(0.0, 0.3, 0.5); c2 = vec3(0.0, 0.8, 0.3); } // Opal
                else if(uRegime < 2.5) { c1 = vec3(0.8, 0.0, 0.4); c2 = vec3(0.9, 0.8, 0.0); } // Neon Fruit
                else if(uRegime < 3.5) { c1 = vec3(0.1, 0.0, 0.5); c2 = vec3(0.3, 0.0, 0.9); } // UV
                else { c1 = vec3(0.9, 0.2, 0.0); c2 = vec3(0.1, 0.6, 0.9); } // Solarized

                float mixVal = sin(vUv.x * 3.0 + vUv.y * 2.0 + uTime * 0.2) * 0.5 + 0.5;
                vec3 baseColor = oklab_mix(c1, c2, mixVal);

                vec3 shapeColor = vec3(0.0);
                float shapeMask = 0.0;

                if (entropy > 0.0) {
                    // Heatmap for unresolved regions
                    shapeMask = smoothstep(0.4, 0.3, length(local));
                    shapeColor = wavelength_to_srgb(mix(700.0, 400.0, entropy));
                } else {
                    // Collapsed tiles
                    if (type == 0.0) {
                        float d1 = abs(length(local - vec2(0.5)) - 0.5);
                        float d2 = abs(length(local - vec2(-0.5)) - 0.5);
                        shapeMask = smoothstep(0.1, 0.05, min(d1, d2));
                    } else if (type == 1.0) {
                        float d = min(abs(local.x), abs(local.y));
                        shapeMask = smoothstep(0.1, 0.05, d) + smoothstep(0.15, 0.1, length(local));
                    } else if (type == 2.0 && uShowGeomantic > 0.5) {
                        shapeMask = geomantic(local, cell);
                    } else {
                        float d = abs(length(local) - 0.3);
                        shapeMask = smoothstep(0.1, 0.05, d);
                    }
                    
                    // Spectral color based on grain count & golden angle hue shift
                    float wl = 380.0 + mod(grains * 80.0 + uTime * 20.0, 320.0);
                    shapeColor = wavelength_to_srgb(wl);
                }

                // Structural Color Iridescence overlay
                vec3 N = normalize(vec3(local.x, local.y, 1.0));
                vec3 V = vec3(0.0, 0.0, 1.0);
                float filmThickness = 300.0 + grains * 150.0 + entropy * 200.0;
                vec3 iridescence = thinFilm(filmThickness, V, N);

                vec3 finalColor = mix(baseColor, shapeColor + iridescence * 0.6, shapeMask);
                
                // Add soft grain glow
                finalColor += wavelength_to_srgb(400.0 + grains * 50.0) * 0.15 * grains;

                fragColor = vec4(finalColor, 1.0);
            }
        `;

        // --- ADAPT PASS (Afterimage Ping-Pong) ---
        const adaptFs = `
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uRender;
            uniform sampler2D uAdapt;

            void main() {
                vec3 cur = texture(uRender, vUv).rgb;
                vec3 prev = texture(uAdapt, vUv).rgb;
                // Burn bright colors into adapt buffer, slowly decay
                vec3 newAdapt = clamp(prev * 0.94 + cur * 0.08, 0.0, 1.0);
                fragColor = vec4(newAdapt, 1.0);
            }
        `;

        // --- DISPLAY PASS (CRT + Ghosts) ---
        const crtFs = `
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform sampler2D uRender;
            uniform sampler2D uAdapt;
            uniform vec2 uResolution;
            uniform float uShowCRT;
            uniform float uTime;

            // Fast hue shift for ghosts (keeps saturation high, avoids white)
            vec3 shiftHue(vec3 c, float shift) {
                vec3 p = vec3(0.55735) * dot(vec3(0.55735), c);
                vec3 u = c - p;
                vec3 v = cross(vec3(0.55735), u);
                return p + u * cos(shift) + v * sin(shift);
            }

            vec2 barrel(vec2 uv, float k) {
                vec2 c = uv - 0.5;
                float r2 = dot(c,c);
                return c * (1.0 + k * r2) + 0.5;
            }

            void main() {
                vec2 uv = uShowCRT > 0.5 ? barrel(vUv, 0.15) : vUv;
                
                if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
                    return;
                }

                // Chromatic Aberration
                float conv = uShowCRT > 0.5 ? 0.003 : 0.0;
                vec3 cur;
                cur.r = texture(uRender, uv + vec2(conv, 0)).r;
                cur.g = texture(uRender, uv).g;
                cur.b = texture(uRender, uv - vec2(conv, 0)).b;

                // Afterimage Ghost (Complementary Hue Shift)
                vec3 adapt = texture(uAdapt, uv).rgb;
                vec3 ghost = shiftHue(adapt, 3.14159); // 180 deg shift
                float ghostMask = max(adapt.r, max(adapt.g, adapt.b));
                
                vec3 color = cur + ghost * ghostMask * 0.8;

                if (uShowCRT > 0.5) {
                    // Scanlines
                    float scan = 0.5 + 0.5 * sin(uv.y * uResolution.y * 2.0);
                    color *= mix(1.0, scan, 0.15);

                    // Aperture Grille
                    float mask = mod(gl_FragCoord.x, 3.0);
                    vec3 triad = vec3(mask < 1.0, mask >= 1.0 && mask < 2.0, mask >= 2.0);
                    color *= mix(vec3(1.0), triad, 0.25);
                    
                    // Soft Bloom (Clamped to avoid blowing to white)
                    vec3 bloom = vec3(0.0);
                    vec2 texel = 1.0 / uResolution;
                    for(int x=-2; x<=2; x++){
                        for(int y=-2; y<=2; y++){
                            vec3 s = texture(uRender, uv + vec2(x,y)*texel*2.0).rgb;
                            bloom += max(s - 0.5, 0.0);
                        }
                    }
                    bloom /= 25.0;
                    color = max(color, color + bloom * 0.5); // Max prevents additive blowout to white
                }

                // Soft Vignette (Colored, not black)
                float dist = length(uv - 0.5);
                vec3 vigColor = shiftHue(vec3(0.4, 0.0, 0.6), uTime * 0.1);
                color = mix(color, color * vigColor, smoothstep(0.4, 0.8, dist) * 0.5);

                fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
            }
        `;

        const materials = {
            sim: new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vs, fragmentShader: simFs, uniforms: { ...sharedUniforms, uState: { value: null } } }),
            render: new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vs, fragmentShader: renderFs, uniforms: { ...sharedUniforms, uSim: { value: null } } }),
            adapt: new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vs, fragmentShader: adaptFs, uniforms: { uRender: { value: null }, uAdapt: { value: null } } }),
            display: new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vs, fragmentShader: crtFs, uniforms: { ...sharedUniforms, uRender: { value: null }, uAdapt: { value: null } } })
        };

        const mesh = new THREE.Mesh(geometry, materials.display);
        scene.add(mesh);

        canvas.__three = { renderer, scene, camera, materials, fbos, mesh };

        // Interaction
        if (!canvas.__listenersAdded) {
            canvas.addEventListener('mousemove', (e) => {
                const rect = canvas.getBoundingClientRect();
                sharedUniforms.uMouse.value.set(
                    (e.clientX - rect.left) / rect.width,
                    1.0 - (e.clientY - rect.top) / rect.height
                );
            });
            canvas.addEventListener('mousedown', () => sharedUniforms.uMouseDown.value = 1.0);
            canvas.addEventListener('mouseup', () => sharedUniforms.uMouseDown.value = 0.0);
            canvas.addEventListener('mouseleave', () => sharedUniforms.uMouseDown.value = 0.0);
            
            canvas.addEventListener('touchmove', (e) => {
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                sharedUniforms.uMouse.value.set(
                    (e.touches[0].clientX - rect.left) / rect.width,
                    1.0 - (e.touches[0].clientY - rect.top) / rect.height
                );
                sharedUniforms.uMouseDown.value = 1.0;
            }, { passive: false });
            canvas.addEventListener('touchend', () => sharedUniforms.uMouseDown.value = 0.0);

            window.addEventListener('keydown', (e) => {
                if (e.code === 'Space') sharedUniforms.uReseed.value = 1.0;
                if (e.code === 'KeyC') sharedUniforms.uRegime.value = (sharedUniforms.uRegime.value + 1) % 5;
                if (e.code === 'KeyG') sharedUniforms.uShowGeomantic.value = 1.0 - sharedUniforms.uShowGeomantic.value;
                if (e.code === 'KeyP') sharedUniforms.uShowCRT.value = 1.0 - sharedUniforms.uShowCRT.value;
            });
            canvas.__listenersAdded = true;
        }

    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        return;
    }
}

const t = canvas.__three;
if (!t) return;

// Update uniforms
t.materials.sim.uniforms.uTime.value = time;
t.materials.render.uniforms.uTime.value = time;
t.materials.display.uniforms.uTime.value = time;

// 1. Sim Pass (Sandpile + WFC)
t.materials.sim.uniforms.uState.value = t.fbos.simA.texture;
t.mesh.material = t.materials.sim;
t.renderer.setRenderTarget(t.fbos.simB);
t.renderer.render(t.scene, t.camera);
// Swap Sim
const tempSim = t.fbos.simA;
t.fbos.simA = t.fbos.simB;
t.fbos.simB = tempSim;
t.materials.sim.uniforms.uReseed.value = 0.0; // Turn off reseed after 1 frame

// 2. Render Pass
t.materials.render.uniforms.uSim.value = t.fbos.simA.texture;
t.mesh.material = t.materials.render;
t.renderer.setRenderTarget(t.fbos.render);
t.renderer.render(t.scene, t.camera);

// 3. Adapt Pass (Afterimage)
t.materials.adapt.uniforms.uRender.value = t.fbos.render.texture;
t.materials.adapt.uniforms.uAdapt.value = t.fbos.adaptA.texture;
t.mesh.material = t.materials.adapt;
t.renderer.setRenderTarget(t.fbos.adaptB);
t.renderer.render(t.scene, t.camera);
// Swap Adapt
const tempAdapt = t.fbos.adaptA;
t.fbos.adaptA = t.fbos.adaptB;
t.fbos.adaptB = tempAdapt;

// 4. Display Pass (CRT + Composite)
t.materials.display.uniforms.uRender.value = t.fbos.render.texture;
t.materials.display.uniforms.uAdapt.value = t.fbos.adaptA.texture;
t.mesh.material = t.materials.display;
t.renderer.setRenderTarget(null);
t.renderer.setSize(grid.width, grid.height, false);
t.renderer.render(t.scene, t.camera);