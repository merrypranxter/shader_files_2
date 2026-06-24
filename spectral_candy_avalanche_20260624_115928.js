/**
 * Spectral Candy Avalanche Garden
 * A feral design-brain fusion of:
 * - Abelian Sandpile (avalanche logic)
 * - Wave Function Collapse (hallucinated tile geometry)
 * - Geomantic Figures (symbolic SDF rendering)
 * - Structural Color & Thin-Film Interference (saturated void background)
 * - Afterimage Painter (temporal complementary ghosts)
 * - CRT Phosphor FX (display distortion and scanlines)
 * - Color Systems (OKLab perceptual gradients, golden-angle spectral palettes)
 */

if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;
        renderer.setPixelRatio(1.0); // Keep 1.0 for pixel-perfect CRT mask

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // --- Render Targets (Ping-Pong) ---
        const rtParams = {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            wrapS: THREE.RepeatWrapping,
            wrapT: THREE.RepeatWrapping,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            depthBuffer: false,
            stencilBuffer: false
        };

        const simA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
        const simB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
        const adaptA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
        const adaptB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
        
        const drawTex = new THREE.WebGLRenderTarget(grid.width, grid.height, {
            ...rtParams, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter
        });

        // --- Shared GLSL Chunks ---
        const oklabChunk = `
            vec3 srgb_to_linear(vec3 c) {
                return vec3(
                    c.r <= 0.04045 ? c.r / 12.92 : pow((c.r + 0.055) / 1.055, 2.4),
                    c.g <= 0.04045 ? c.g / 12.92 : pow((c.g + 0.055) / 1.055, 2.4),
                    c.b <= 0.04045 ? c.b / 12.92 : pow((c.b + 0.055) / 1.055, 2.4)
                );
            }
            vec3 linear_to_srgb(vec3 c) {
                return vec3(
                    c.r <= 0.0031308 ? c.r * 12.92 : 1.055 * pow(c.r, 1.0/2.4) - 0.055,
                    c.g <= 0.0031308 ? c.g * 12.92 : 1.055 * pow(c.g, 1.0/2.4) - 0.055,
                    c.b <= 0.0031308 ? c.b * 12.92 : 1.055 * pow(c.b, 1.0/2.4) - 0.055
                );
            }
            vec3 oklab_to_linear_srgb(vec3 c) {
                float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
                float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
                float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
                float l = l_*l_*l_, m = m_*m_*m_, s = s_*s_*s_;
                return vec3(
                     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                );
            }
            vec3 oklab_to_srgb(vec3 c) {
                return linear_to_srgb(oklab_to_linear_srgb(c));
            }
        `;

        const thinFilmChunk = `
            vec3 thinFilm(float d) {
                float path = 2.0 * 1.45 * d; 
                float r = pow(sin(3.14159 * path / 630e-9), 2.0);
                float g = pow(sin(3.14159 * path / 530e-9), 2.0);
                float b = pow(sin(3.14159 * path / 460e-9), 2.0);
                return vec3(r, g, b);
            }
        `;

        // --- 1. Simulation Shader (Sandpile + WFC Entropy) ---
        const simMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_sim: { value: null },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_time: { value: 0 },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
                u_mouseDown: { value: 0 },
                u_reseed: { value: 1 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_sim;
                uniform vec2 u_resolution;
                uniform float u_time;
                uniform vec2 u_mouse;
                uniform float u_mouseDown;
                uniform float u_reseed;

                float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

                void main() {
                    vec2 texel = 1.0 / u_resolution;
                    
                    if (u_reseed > 0.5) {
                        float h = hash(vUv + u_time);
                        fragColor = vec4(floor(h * 6.0), hash(vUv * 2.0), 0.0, 1.0);
                        return;
                    }

                    vec4 state = texture(u_sim, vUv);
                    vec4 N = texture(u_sim, fract(vUv + vec2(0, texel.y)));
                    vec4 S = texture(u_sim, fract(vUv - vec2(0, texel.y)));
                    vec4 E = texture(u_sim, fract(vUv + vec2(texel.x, 0)));
                    vec4 W = texture(u_sim, fract(vUv - vec2(texel.x, 0)));

                    // r: Grains, g: Geomantic/WFC ID, b: Heat/Energy, a: Void
                    float grains = state.r;
                    float outGrains = floor(grains / 4.0);
                    float inGrains = floor(N.r / 4.0) + floor(S.r / 4.0) + floor(E.r / 4.0) + floor(W.r / 4.0);
                    float newGrains = grains - 4.0 * outGrains + inGrains;

                    // Continuous systemic rain (Entropy injection)
                    if (hash(vUv + u_time * 0.1) < 0.005) newGrains += 1.0;

                    // Interaction
                    if (u_mouseDown > 0.5 && distance(vUv, u_mouse) < 0.03) {
                        newGrains += 4.0;
                    }

                    // Hallucinated WFC state shift based on avalanche heat
                    float newGlyph = state.g;
                    if (outGrains > 0.0 || inGrains > 0.0) {
                        newGlyph = fract(state.g + 0.0625 * outGrains + hash(vUv)*0.01);
                    }

                    // Structural heat dissipates slowly, spikes on topple
                    float heat = state.b * 0.98 + outGrains * 0.2 + inGrains * 0.05;

                    fragColor = vec4(newGrains, newGlyph, heat, 1.0);
                }
            `
        });

        // --- 2. Draw Shader (Visualizing the Garden) ---
        const drawMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_sim: { value: null },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_gridSize: { value: new THREE.Vector2(48.0, 48.0 * (grid.height/grid.width)) },
                u_time: { value: 0 },
                u_paletteRegime: { value: 0 },
                u_geomanticIntensity: { value: 1 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_sim;
                uniform vec2 u_resolution;
                uniform vec2 u_gridSize;
                uniform float u_time;
                uniform float u_paletteRegime;
                uniform float u_geomanticIntensity;

                ${oklabChunk}
                ${thinFilmChunk}

                void main() {
                    vec2 gridUv = vUv * u_gridSize;
                    vec2 cellId = floor(gridUv);
                    vec2 cellUv = fract(gridUv);
                    
                    // Sample simulation state
                    vec4 state = texture(u_sim, (cellId + 0.5) / u_gridSize);
                    
                    // Saturated Void Background (Thin Film over OKLab Gradient)
                    float hBase = vUv.x * 2.0 - vUv.y * 1.5 + u_time * 0.2 + u_paletteRegime * 1.375;
                    vec3 baseColor = oklab_to_srgb(vec3(0.65 + 0.1*sin(u_time), 0.2 * cos(hBase), 0.2 * sin(hBase)));
                    
                    vec3 iridescence = thinFilm(300e-9 + state.b * 600e-9 + vUv.x * 200e-9);
                    baseColor = mix(baseColor, iridescence, 0.5 + 0.5 * sin(state.b * 5.0));

                    // Shape construction: Geomantic Glyphs (4-line dot figures)
                    int fig = int(state.g * 16.0);
                    float dGlyph = 1.0;
                    for(int i=0; i<4; i++) {
                        // Extract bit i
                        float bit = mod(floor(float(fig) / pow(2.0, float(i))), 2.0);
                        float y = 0.2 + float(i)*0.2;
                        if (bit > 0.5) {
                            dGlyph = min(dGlyph, length(cellUv - vec2(0.3, y)) - 0.05);
                            dGlyph = min(dGlyph, length(cellUv - vec2(0.7, y)) - 0.05);
                        } else {
                            dGlyph = min(dGlyph, length(cellUv - vec2(0.5, y)) - 0.05);
                        }
                    }

                    // Shape construction: Truchet Arcs (WFC hallucination)
                    float r1 = length(cellUv - vec2(0.0, 0.0)) - 0.5;
                    float r2 = length(cellUv - vec2(1.0, 1.0)) - 0.5;
                    float dTruchet = min(abs(r1), abs(r2));
                    dTruchet = abs(dTruchet) - 0.04;

                    // Combine shapes
                    float d = min(mix(1.0, dGlyph, u_geomanticIntensity), dTruchet);

                    // Colorize shapes based on Sandpile grains and spectral logic
                    float hShape = state.r * 0.4 + u_time * 0.8 + u_paletteRegime * 2.1;
                    vec3 shapeColor = oklab_to_srgb(vec3(0.85, 0.25 * cos(hShape), 0.25 * sin(hShape)));

                    // Avalanche Flash
                    if (state.r >= 4.0) shapeColor = vec3(1.0); // White hot spark on topple

                    float alpha = smoothstep(0.06, 0.0, d);
                    vec3 finalColor = mix(baseColor, shapeColor, alpha);

                    // Cell bloom / heat glow
                    finalColor += shapeColor * state.b * 0.6;

                    // Grid lines
                    vec2 gridLines = smoothstep(0.0, 0.02, cellUv) * smoothstep(1.0, 0.98, cellUv);
                    finalColor *= 0.9 + 0.1 * min(gridLines.x, gridLines.y);

                    fragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
                }
            `
        });

        // --- 3. Adaptation / Afterimage Shader ---
        const adaptMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_draw: { value: null },
                u_adapt: { value: null }
            },
            vertexShader: `
                out vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_draw;
                uniform sampler2D u_adapt;

                void main() {
                    vec3 cur = texture(u_draw, vUv).rgb;
                    vec3 prev = texture(u_adapt, vUv).rgb;
                    
                    // Temporal adaptation (burn and relax)
                    // Fast burn, slow decay
                    vec3 next = prev * 0.98 + cur * 0.08;
                    fragColor = vec4(clamp(next, 0.0, 1.0), 1.0);
                }
            `
        });

        // --- 4. Composite Shader (CRT, Bloom, Convergence, Ghosts) ---
        const compositeMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_draw: { value: null },
                u_adapt: { value: null },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_time: { value: 0 },
                u_crtIntensity: { value: 1 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_draw;
                uniform sampler2D u_adapt;
                uniform vec2 u_resolution;
                uniform float u_time;
                uniform float u_crtIntensity;

                ${oklabChunk}

                vec2 barrel(vec2 uv, float k) {
                    vec2 c = uv - 0.5;
                    float r2 = dot(c, c);
                    return c * (1.0 + k * r2 + 0.05 * r2 * r2) + 0.5;
                }

                void main() {
                    vec2 crtUv = mix(vUv, barrel(vUv, 0.15), u_crtIntensity);

                    // Saturated border, absolutely no black void
                    if (crtUv.x < 0.0 || crtUv.x > 1.0 || crtUv.y < 0.0 || crtUv.y > 1.0) {
                        float hBorder = u_time * 0.1;
                        fragColor = vec4(oklab_to_srgb(vec3(0.4, 0.15*cos(hBorder), 0.15*sin(hBorder))), 1.0);
                        return;
                    }

                    // RGB Convergence Error
                    vec2 dir = crtUv - 0.5;
                    float conv = 0.008 * u_crtIntensity;
                    vec3 cur;
                    cur.r = texture(u_draw, crtUv + dir * conv).r;
                    cur.g = texture(u_draw, crtUv).g;
                    cur.b = texture(u_draw, crtUv - dir * conv).b;

                    // Afterimage Ghosting (Complementary)
                    vec3 adapt = texture(u_adapt, crtUv).rgb;
                    vec3 comp = vec3(1.0) - adapt; 
                    float adaptStr = max(max(adapt.r, adapt.g), adapt.b);
                    float paintCov = max(max(cur.r, cur.g), cur.b);
                    vec3 ghost = comp * adaptStr * (1.0 - paintCov) * 1.5;

                    vec3 scene = clamp(cur + ghost, 0.0, 1.0);

                    // Bloom (9-tap box blur approx)
                    vec3 bloom = vec3(0.0);
                    vec2 texel = 1.0 / u_resolution;
                    for(float x=-1.0; x<=1.0; x++) {
                        for(float y=-1.0; y<=1.0; y++) {
                            vec3 smp = texture(u_draw, crtUv + vec2(x,y)*texel*3.0).rgb;
                            bloom += max(smp - 0.5, 0.0); // Only bloom bright parts
                        }
                    }
                    scene += (bloom / 9.0) * 0.8;

                    // Slot Mask (CRT Phosphor)
                    if (u_crtIntensity > 0.5) {
                        float slotH = 6.0;
                        float row = floor(gl_FragCoord.y / slotH);
                        float stagger = mod(row, 2.0) * 1.5;
                        float col = mod(gl_FragCoord.x + stagger, 3.0);
                        vec3 stripe = vec3(
                            smoothstep(1.0, 0.0, abs(col - 0.5)),
                            smoothstep(1.0, 0.0, abs(col - 1.5)),
                            smoothstep(1.0, 0.0, abs(col - 2.5))
                        );
                        scene *= mix(vec3(1.0), stripe, 0.4);
                        
                        // Scanlines
                        scene *= 1.0 - 0.15 * sin(crtUv.y * u_resolution.y * 3.1415);
                    }

                    // Colored Vignette
                    float vig = length(vUv - 0.5);
                    vec3 vigColor = oklab_to_srgb(vec3(0.3, 0.15*sin(u_time), 0.15*cos(u_time)));
                    scene = mix(scene, vigColor, smoothstep(0.4, 1.2, vig));

                    fragColor = vec4(clamp(scene, 0.0, 1.0), 1.0);
                }
            `
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMat);
        scene.add(mesh);

        // State & Input management
        canvas.__three = { 
            renderer, scene, camera, 
            simA, simB, adaptA, adaptB, drawTex,
            simMat, drawMat, adaptMat, compositeMat,
            pingPong: true,
            frame: 0
        };

        // Keyboard listeners for interaction
        window.addEventListener('keydown', (e) => {
            if (e.key === ' ') simMat.uniforms.u_reseed.value = 1.0;
            if (e.key.toLowerCase() === 'c') drawMat.uniforms.u_paletteRegime.value += 1.0;
            if (e.key.toLowerCase() === 'g') drawMat.uniforms.u_geomanticIntensity.value = 1.0 - drawMat.uniforms.u_geomanticIntensity.value;
            if (e.key.toLowerCase() === 'p') compositeMat.uniforms.u_crtIntensity.value = 1.0 - compositeMat.uniforms.u_crtIntensity.value;
        });

        // Mouse click for "grain comet"
        canvas.addEventListener('mousedown', () => {
            simMat.uniforms.u_mouseDown.value = 1.0;
            // Inject a massive burst on click handled in shader by rapid accumulation
        });
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        return;
    }
}

const t = canvas.__three;
const { renderer, scene, camera } = t;

// Update uniforms
t.simMat.uniforms.u_time.value = time;
t.simMat.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
t.simMat.uniforms.u_mouseDown.value = mouse.isPressed ? 1.0 : 0.0;

t.drawMat.uniforms.u_time.value = time;
t.drawMat.uniforms.u_resolution.value.set(grid.width, grid.height);
t.drawMat.uniforms.u_gridSize.value.set(48.0, 48.0 * (grid.height / grid.width));

t.compositeMat.uniforms.u_time.value = time;
t.compositeMat.uniforms.u_resolution.value.set(grid.width, grid.height);

// 1. Sim Pass (Ping Pong)
t.simMat.uniforms.u_sim.value = t.pingPong ? t.simA.texture : t.simB.texture;
renderer.setRenderTarget(t.pingPong ? t.simB : t.simA);
renderer.render(new THREE.Scene().add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), t.simMat)), camera);
t.simMat.uniforms.u_reseed.value = 0.0; // Turn off reseed after first frame/trigger

// 2. Draw Pass
t.drawMat.uniforms.u_sim.value = t.pingPong ? t.simB.texture : t.simA.texture;
renderer.setRenderTarget(t.drawTex);
renderer.render(new THREE.Scene().add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), t.drawMat)), camera);

// 3. Adapt/Afterimage Pass (Ping Pong)
t.adaptMat.uniforms.u_draw.value = t.drawTex.texture;
t.adaptMat.uniforms.u_adapt.value = t.pingPong ? t.adaptA.texture : t.adaptB.texture;
renderer.setRenderTarget(t.pingPong ? t.adaptB : t.adaptA);
renderer.render(new THREE.Scene().add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), t.adaptMat)), camera);

// 4. Composite Pass (To Screen)
t.compositeMat.uniforms.u_draw.value = t.drawTex.texture;
t.compositeMat.uniforms.u_adapt.value = t.pingPong ? t.adaptB.texture : t.adaptA.texture;
renderer.setRenderTarget(null);
renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);

t.pingPong = !t.pingPong;
t.frame++;