if (!canvas.__three) {
  try {
    if (!ctx || !(ctx instanceof WebGL2RenderingContext)) {
        throw new Error("WebGL 2 context not available");
    }

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Core GLSL Library containing Spectral Color (Wyman fit), OKLab conversions, and Thin-Film interference
    const glslLibrary = `
        const float PI = 3.14159265359;
        const float TAU = 6.28318530718;

        // OKLab Conversions (from color_systems)
        vec3 linear_to_oklab(vec3 c) {
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
        vec3 oklab_to_linear(vec3 c) {
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
        vec3 srgb_to_linear(vec3 c) {
            return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
        }
        vec3 linear_to_srgb(vec3 c) {
            return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
        }

        // Spectral Color Wyman Fit (from spectral_color)
        vec3 spectralColor(float lambda) {
            float x = 1.056 * exp(-0.5 * pow((lambda - 599.8) / (lambda < 599.8 ? 37.9 : 31.0), 2.0))
                    + 0.362 * exp(-0.5 * pow((lambda - 442.0) / (lambda < 442.0 ? 16.0 : 26.7), 2.0))
                    - 0.065 * exp(-0.5 * pow((lambda - 501.1) / (lambda < 501.1 ? 20.4 : 26.2), 2.0));
            float y = 0.821 * exp(-0.5 * pow((lambda - 568.8) / (lambda < 568.8 ? 46.9 : 40.5), 2.0))
                    + 0.286 * exp(-0.5 * pow((lambda - 530.9) / (lambda < 530.9 ? 16.3 : 31.1), 2.0));
            float z = 1.217 * exp(-0.5 * pow((lambda - 437.0) / (lambda < 437.0 ? 11.8 : 36.0), 2.0))
                    + 0.681 * exp(-0.5 * pow((lambda - 459.0) / (lambda < 459.0 ? 26.0 : 13.8), 2.0));
            vec3 xyz = vec3(x, y, z);
            vec3 rgb = vec3(
                 3.2406 * xyz.x - 1.5372 * xyz.y - 0.4986 * xyz.z,
                -0.9689 * xyz.x + 1.8758 * xyz.y + 0.0415 * xyz.z,
                 0.0557 * xyz.x - 0.2040 * xyz.y + 1.0570 * xyz.z
            );
            // Soft gamut clip to preserve extreme saturation
            float lift = min(min(rgb.r, rgb.g), min(rgb.b, 0.0));
            rgb -= lift;
            float mx = max(max(rgb.r, rgb.g), max(rgb.b, 1.0));
            return linear_to_srgb(rgb / mx);
        }

        // Thin-Film Interference (from structural_color)
        vec3 thinFilm(float d) {
            float path = 2.0 * 1.45 * d; // Oil n=1.45
            float r = pow(sin(PI * path / 630.0), 2.0);
            float g = pow(sin(PI * path / 530.0), 2.0);
            float b = pow(sin(PI * path / 460.0), 2.0);
            return vec3(r, g, b);
        }
        
        float hash12(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }
    `;

    // 1. Abelian Sandpile Shader
    const sandpileMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            u_state: { value: null },
            u_res: { value: new THREE.Vector2() },
            u_mouse: { value: new THREE.Vector2() },
            u_mouse_down: { value: 0 },
            u_time: { value: 0 }
        },
        vertexShader: `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D u_state;
            uniform vec2 u_res;
            uniform vec2 u_mouse;
            uniform float u_mouse_down;
            uniform float u_time;
            
            ${glslLibrary}

            void main() {
                vec2 px = 1.0 / u_res;
                vec4 me = texture(u_state, vUv);
                float g = me.r; // Grains
                
                float n = texture(u_state, vUv + vec2(0.0, px.y)).r;
                float s = texture(u_state, vUv - vec2(0.0, -px.y)).r;
                float e = texture(u_state, vUv + vec2(px.x, 0.0)).r;
                float w = texture(u_state, vUv - vec2(-px.x, 0.0)).r;
                
                float topples = floor(g / 4.0);
                g += floor(n/4.0) + floor(s/4.0) + floor(e/4.0) + floor(w/4.0) - 4.0 * topples;

                // Inject grains via mouse
                if (u_mouse_down > 0.0 && length(vUv - u_mouse) < 0.03) {
                    g += 4.0 * hash12(vUv + u_time);
                }
                
                // Random comets (divine data corruption)
                if (hash12(vUv + u_time * 10.0) < 0.00005) {
                    g += 12.0;
                }
                
                // Dissipate slightly to prevent infinite build-up
                g *= 0.999;

                fragColor = vec4(g, me.gba);
            }
        `
    });

    // 2. Main Render Shader (WFC + Geomancy + Sandpile + Spectral)
    const mainMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            u_sandpile: { value: null },
            u_wfc: { value: null },
            u_time: { value: 0 },
            u_res: { value: new THREE.Vector2() }
        },
        vertexShader: `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D u_sandpile;
            uniform sampler2D u_wfc; // r: tile, g: entropy, b: family
            uniform float u_time;
            uniform vec2 u_res;
            
            ${glslLibrary}

            // Draw 4-line Geomantic Dot Figures
            float geomanticDots(vec2 cellUv, int tileId) {
                int row = 3 - int(floor(cellUv.y * 4.0));
                int isDouble = (tileId >> row) & 1;
                
                vec2 localUv = fract(cellUv * vec2(1.0, 4.0));
                localUv.x = localUv.x * 2.0 - 0.5; // center x
                
                float d1 = length(localUv - vec2(0.5, 0.5));
                float d2a = length(localUv - vec2(0.25, 0.5));
                float d2b = length(localUv - vec2(0.75, 0.5));
                
                float r = 0.12;
                float mask = 0.0;
                if (isDouble == 1) {
                    mask = max(1.0 - smoothstep(r-0.03, r+0.03, d2a), 1.0 - smoothstep(r-0.03, r+0.03, d2b));
                } else {
                    mask = 1.0 - smoothstep(r-0.03, r+0.03, d1);
                }
                return mask;
            }

            void main() {
                vec4 wfc = texture(u_wfc, vUv);
                vec4 sand = texture(u_sandpile, vUv);
                float grains = sand.r;
                
                // Base Gradient: Deep Saturated OKLab flow (No black/white void)
                float drift = sin(dot(vUv, vec2(3.1, 2.7)) + u_time * 0.4);
                vec3 oklabBase = vec3(
                    0.65 + 0.1 * sin(u_time * 0.5), 
                    0.15 * sin(u_time * 0.3 + vUv.x * 4.0), 
                    0.15 * cos(u_time * 0.4 + vUv.y * 4.0 + drift)
                );
                vec3 baseColor = linear_to_srgb(oklab_to_linear(oklabBase));
                
                // WFC Geomantic Grid
                vec2 gridUv = vUv * 48.0; // 48x48 WFC grid
                vec2 cellUv = fract(gridUv);
                int tileId = int(wfc.r * 15.0 + 0.5);
                float dots = geomanticDots(cellUv, tileId);
                
                // Colorize tiles by "family" (fire, air, water, earth)
                float familyHue = 400.0 + wfc.b * 80.0; // 400 to ~640nm
                vec3 tileColor = spectralColor(familyHue);
                
                // Entropy heatmap (shows during collapse)
                vec3 heatColor = spectralColor(700.0 - wfc.g * 250.0);
                
                // Sandpile Avalanche Color
                vec3 sandColor = spectralColor(380.0 + mod(grains * 35.0 + u_time * 15.0, 320.0));
                
                // Structural Color Iridescence
                float thickness = 250.0 + grains * 120.0 + wfc.g * 400.0;
                vec3 irid = thinFilm(thickness);
                
                // Composition
                // 1. Blend base with entropy heat
                vec3 color = mix(baseColor, heatColor, wfc.g * 0.6);
                
                // 2. Add Geomantic Dots (glow when collapsed)
                color = mix(color, tileColor * 1.8, dots * (1.0 - wfc.g));
                
                // 3. Add Sandpile Avalanches with Iridescence
                float grainGlow = min(grains * 0.25, 1.2);
                color += sandColor * grainGlow * irid * 1.5;
                
                // Tone mapping to preserve extreme saturation without blowing to pure white
                color = 1.0 - exp(-color * 1.3);
                
                fragColor = vec4(color, 1.0);
            }
        `
    });

    // 3. Afterimage Persistence Shader (Adaptation Buffer)
    const afterimageMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            u_main: { value: null },
            u_prev: { value: null }
        },
        vertexShader: `
            out vec2 vUv;
            void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
        `,
        fragmentShader: `
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D u_main;
            uniform sampler2D u_prev;
            void main() {
                vec3 mainCol = texture(u_main, vUv).rgb;
                vec3 prev = texture(u_prev, vUv).rgb;
                // Accumulate adaptation based on brightness, decay slowly
                vec3 adapt = prev * 0.96 + mainCol * 0.05;
                fragColor = vec4(clamp(adapt, 0.0, 1.0), 1.0);
            }
        `
    });

    // 4. CRT & Composite Shader
    const compositeMat = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            u_main: { value: null },
            u_afterimage: { value: null },
            u_res: { value: new THREE.Vector2() },
            u_time: { value: 0 }
        },
        vertexShader: `
            out vec2 vUv;
            void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
        `,
        fragmentShader: `
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D u_main;
            uniform sampler2D u_afterimage;
            uniform vec2 u_res;
            uniform float u_time;
            
            ${glslLibrary}

            void main() {
                // Barrel Distortion
                vec2 uv = vUv - 0.5;
                float r2 = dot(uv, uv);
                uv = uv * (1.0 + 0.12 * r2 + 0.015 * r2 * r2) + 0.5;
                
                // CRT Vignette boundary
                if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                    // Do not use pure black, use deep saturated void
                    fragColor = vec4(0.05, 0.0, 0.1, 1.0);
                    return;
                }
                
                // RGB Convergence Error (Chromatic Aberration)
                vec2 dir = (uv - 0.5) * 0.012;
                float r = texture(u_main, uv + dir).r;
                float g = texture(u_main, uv).g;
                float b = texture(u_main, uv - dir).b;
                vec3 mainCol = vec3(r, g, b);
                
                // Afterimage Complementary Ghost (OKLab inversion)
                vec3 adapt = texture(u_afterimage, uv).rgb;
                vec3 adaptOk = linear_to_oklab(srgb_to_linear(adapt));
                // Invert Lightness, flip a & b axes
                vec3 compOk = vec3(max(0.3, 1.0 - adaptOk.x), -adaptOk.y, -adaptOk.z);
                vec3 ghost = linear_to_srgb(oklab_to_linear(compOk));
                
                float ghostStrength = max(max(adapt.r, adapt.g), adapt.b);
                float paintCoverage = max(max(mainCol.r, mainCol.g), mainCol.b);
                
                // Ghost only shows where live paint has faded
                vec3 finalCol = mainCol + ghost * ghostStrength * (1.0 - paintCoverage) * 0.9;
                
                // Bloom / Halation (Simple 9-tap)
                vec2 px = 1.0 / u_res;
                vec3 bloom = vec3(0.0);
                for(float x=-1.0; x<=1.0; x++) {
                    for(float y=-1.0; y<=1.0; y++) {
                        vec3 sampleCol = texture(u_main, uv + vec2(x,y)*px*3.0).rgb;
                        bloom += max(sampleCol - 0.6, 0.0);
                    }
                }
                finalCol += (bloom / 9.0) * 0.6;
                
                // CRT Aperture Grille Mask
                float col = mod(gl_FragCoord.x, 3.0);
                vec3 stripe = vec3(
                    smoothstep(1.0, 0.0, abs(col - 0.5)),
                    smoothstep(1.0, 0.0, abs(col - 1.5)),
                    smoothstep(1.0, 0.0, abs(col - 2.5))
                );
                stripe = mix(vec3(1.0), stripe, 0.35); // Mask strength
                
                // Scanlines & Rolling Bar
                float scan = 0.5 + 0.5 * sin(uv.y * u_res.y * PI);
                finalCol *= 1.0 - 0.15 * (1.0 - scan);
                finalCol *= stripe;
                
                float barPos = fract(u_time * 0.2);
                float bar = exp(-pow(uv.y - barPos, 2.0) / 0.005);
                finalCol *= 1.0 + 0.08 * bar;
                
                // Soft Vignette (Colored)
                float vig = smoothstep(1.3, 0.4, length(uv - 0.5) * 1.5);
                finalCol = mix(vec3(0.1, 0.0, 0.2), finalCol, vig);
                
                fragColor = vec4(finalCol, 1.0);
            }
        `
    });

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, compositeMat);
    scene.add(mesh);

    // Render Targets for Ping-Pong and Passes
    const createFBO = (w, h) => new THREE.WebGLRenderTarget(w, h, {
        type: THREE.FloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false
    });

    const createLinearFBO = (w, h) => new THREE.WebGLRenderTarget(w, h, {
        type: THREE.FloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false
    });

    let sandpileA = createFBO(grid.width, grid.height);
    let sandpileB = createFBO(grid.width, grid.height);
    let afterimageA = createLinearFBO(grid.width, grid.height);
    let afterimageB = createLinearFBO(grid.width, grid.height);
    let mainRT = createLinearFBO(grid.width, grid.height);

    // WFC CPU-side Logic (Geomantic Simulation)
    const WFC_SIZE = 48;
    const wfcData = new Float32Array(WFC_SIZE * WFC_SIZE * 4);
    const wfcTex = new THREE.DataTexture(wfcData, WFC_SIZE, WFC_SIZE, THREE.RGBAFormat, THREE.FloatType);
    wfcTex.minFilter = THREE.NearestFilter;
    wfcTex.magFilter = THREE.NearestFilter;
    
    function resetWFC() {
        for(let i=0; i<WFC_SIZE*WFC_SIZE; i++) {
            wfcData[i*4 + 0] = Math.floor(Math.random() * 16); // Tile ID (0-15)
            wfcData[i*4 + 1] = 1.0; // Entropy
            wfcData[i*4 + 2] = Math.floor(Math.random() * 4); // Family (0-3)
            wfcData[i*4 + 3] = 0.0;
        }
    }
    resetWFC();

    function stepWFC() {
        let fullyCollapsed = true;
        for(let i=0; i<WFC_SIZE*WFC_SIZE; i++) {
            if (wfcData[i*4 + 1] > 0.0) {
                fullyCollapsed = false;
                if (Math.random() < 0.05) {
                    wfcData[i*4 + 1] -= 0.05 + Math.random() * 0.1; // Collapse step
                    if (wfcData[i*4 + 1] <= 0.0) {
                        wfcData[i*4 + 1] = 0.0;
                        wfcData[i*4 + 0] = Math.floor(Math.random() * 16); // Finalize tile
                    }
                }
            }
        }
        if (fullyCollapsed && Math.random() < 0.005) { // Reset chance
            resetWFC();
        }
        wfcTex.needsUpdate = true;
    }

    // Pass Rendering Helper
    const quadScene = new THREE.Scene();
    const quadMesh = new THREE.Mesh(geometry, sandpileMat);
    quadScene.add(quadMesh);

    function renderPass(material, target) {
        quadMesh.material = material;
        renderer.setRenderTarget(target);
        renderer.render(quadScene, camera);
    }

    // Mouse Tracking
    const mouseVec = new THREE.Vector2(-1, -1);
    let isMouseDown = 0;
    
    const onMove = (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseVec.x = (e.clientX - rect.left) / rect.width;
        mouseVec.y = 1.0 - (e.clientY - rect.top) / rect.height;
    };
    const onDown = () => isMouseDown = 1;
    const onUp = () => isMouseDown = 0;
    
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchmove', (e) => {
        if(e.touches.length > 0) {
            const rect = canvas.getBoundingClientRect();
            mouseVec.x = (e.touches[0].clientX - rect.left) / rect.width;
            mouseVec.y = 1.0 - (e.touches[0].clientY - rect.top) / rect.height;
        }
    });
    canvas.addEventListener('touchstart', onDown);
    canvas.addEventListener('touchend', onUp);

    // Save to canvas to prevent re-init
    canvas.__three = { 
        renderer, scene, camera, compositeMat, mainMat, sandpileMat, afterimageMat,
        sandpileA, sandpileB, afterimageA, afterimageB, mainRT, stepWFC, wfcTex, mouseVec,
        cleanup: () => {
            canvas.removeEventListener('mousemove', onMove);
            canvas.removeEventListener('mousedown', onDown);
            canvas.removeEventListener('mouseup', onUp);
        }
    };

  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
    // Fallback if WebGL2 fails
    if (ctx && ctx.fillStyle) {
        ctx.fillStyle = '#ff006e';
        ctx.fillRect(0, 0, grid.width, grid.height);
        ctx.fillStyle = '#00f0ff';
        ctx.font = '20px monospace';
        ctx.fillText("WebGL2 Required for Spectral Candy Avalanche Garden", 20, 40);
    }
    return;
  }
}

const sys = canvas.__three;
if (sys) {
    const w = grid.width;
    const h = grid.height;
    sys.renderer.setSize(w, h, false);
    
    if (sys.sandpileA.width !== w || sys.sandpileA.height !== h) {
        sys.sandpileA.setSize(w, h);
        sys.sandpileB.setSize(w, h);
        sys.afterimageA.setSize(w, h);
        sys.afterimageB.setSize(w, h);
        sys.mainRT.setSize(w, h);
    }

    sys.stepWFC();

    // 1. Sandpile Pass (Ping-Pong)
    sys.sandpileMat.uniforms.u_state.value = sys.sandpileA.texture;
    sys.sandpileMat.uniforms.u_res.value.set(w, h);
    sys.sandpileMat.uniforms.u_mouse.value.copy(sys.mouseVec);
    sys.sandpileMat.uniforms.u_mouse_down.value = mouse.isPressed ? 1.0 : 0.0;
    sys.sandpileMat.uniforms.u_time.value = time;
    sys.quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2,2), sys.sandpileMat);
    sys.renderer.setRenderTarget(sys.sandpileB);
    sys.renderer.render(new THREE.Scene().add(sys.quadMesh), sys.camera);
    // Swap Sandpile
    let temp = sys.sandpileA; sys.sandpileA = sys.sandpileB; sys.sandpileB = temp;

    // 2. Main Render Pass
    sys.mainMat.uniforms.u_sandpile.value = sys.sandpileA.texture;
    sys.mainMat.uniforms.u_wfc.value = sys.wfcTex;
    sys.mainMat.uniforms.u_time.value = time;
    sys.mainMat.uniforms.u_res.value.set(w, h);
    sys.quadMesh.material = sys.mainMat;
    sys.renderer.setRenderTarget(sys.mainRT);
    sys.renderer.render(new THREE.Scene().add(sys.quadMesh), sys.camera);

    // 3. Afterimage Pass (Ping-Pong)
    sys.afterimageMat.uniforms.u_main.value = sys.mainRT.texture;
    sys.afterimageMat.uniforms.u_prev.value = sys.afterimageA.texture;
    sys.quadMesh.material = sys.afterimageMat;
    sys.renderer.setRenderTarget(sys.afterimageB);
    sys.renderer.render(new THREE.Scene().add(sys.quadMesh), sys.camera);
    // Swap Afterimage
    temp = sys.afterimageA; sys.afterimageA = sys.afterimageB; sys.afterimageB = temp;

    // 4. Composite & CRT Pass (To Screen)
    sys.compositeMat.uniforms.u_main.value = sys.mainRT.texture;
    sys.compositeMat.uniforms.u_afterimage.value = sys.afterimageA.texture;
    sys.compositeMat.uniforms.u_res.value.set(w, h);
    sys.compositeMat.uniforms.u_time.value = time;
    sys.renderer.setRenderTarget(null);
    sys.renderer.render(sys.scene, sys.camera);
}