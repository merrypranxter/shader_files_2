try {
    if (!ctx) throw new Error("WebGL context not available");

    // --- State & Initialization ---
    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        const sceneMain = new THREE.Scene();
        const scenePost = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        const renderTarget = new THREE.WebGLRenderTarget(grid.width, grid.height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType
        });

        canvas.__state = {
            paletteIdx: 0,
            depthExag: 1.0,
            hiddenCorr: 0.3,
            plasmaInt: 1.0,
            sporeDen: 0.4,
            clickPos: new THREE.Vector2(0.5, 0.5),
            clickTime: -100.0,
            targetDepth: 1.0,
            targetCorr: 0.3,
            targetPlasma: 1.0,
            targetSpore: 0.4
        };

        // --- Keyboard Interaction ---
        if (!canvas.__listenersAdded) {
            window.addEventListener('keydown', (e) => {
                const s = canvas.__state;
                if (!s) return;
                const key = e.key.toLowerCase();
                if (key === 'c') s.paletteIdx = (s.paletteIdx + 1) % 5;
                if (key === 'd') s.targetDepth = s.targetDepth > 1.5 ? 0.2 : s.targetDepth + 0.5;
                if (key === 'h') s.targetCorr = s.targetCorr > 0.8 ? 0.1 : s.targetCorr + 0.3;
                if (key === 'p') s.targetPlasma = s.targetPlasma > 1.5 ? 0.0 : s.targetPlasma + 0.5;
                if (key === 's') s.targetSpore = s.targetSpore > 0.8 ? 0.1 : s.targetSpore + 0.25;
            });
            canvas.addEventListener('pointerdown', (e) => {
                const s = canvas.__state;
                if (!s) return;
                const rect = canvas.getBoundingClientRect();
                s.clickPos.x = (e.clientX - rect.left) / rect.width;
                s.clickPos.y = 1.0 - (e.clientY - rect.top) / rect.height;
                s.clickTime = performance.now() / 1000.0;
                s.targetCorr = 0.9; // pulse reveals hidden patterns
                s.targetPlasma = 2.0; // attracts plasma
            });
            canvas.addEventListener('pointerup', () => {
                const s = canvas.__state;
                if (!s) return;
                s.targetCorr = 0.3;
                s.targetPlasma = 1.0;
            });
            canvas.__listenersAdded = true;
        }

        // --- Main Reef Shader ---
        const mainMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
                u_click_pos: { value: new THREE.Vector2(0.5, 0.5) },
                u_click_time: { value: -100.0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_palette: { value: 0 },
                u_plasma_int: { value: 1.0 },
                u_spore_den: { value: 0.4 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                in vec2 vUv;
                out vec4 fragColor;

                uniform float u_time;
                uniform vec2 u_mouse;
                uniform vec2 u_click_pos;
                uniform float u_click_time;
                uniform vec2 u_resolution;
                uniform float u_palette;
                uniform float u_plasma_int;
                uniform float u_spore_den;

                #define PI 3.14159265359

                // Hash & Noise
                float hash21(vec2 p) {
                    p = fract(p * vec2(123.34, 456.21));
                    p += dot(p, p + 45.32);
                    return fract(p.x * p.y);
                }
                vec2 hash22(vec2 p) {
                    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
                    p3 += dot(p3, p3.yzx+33.33);
                    return fract((p3.xx+p3.yz)*p3.zy);
                }
                float valueNoise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    vec2 u = f*f*(3.0-2.0*f);
                    return mix( mix(hash21(i + vec2(0.0,0.0)), hash21(i + vec2(1.0,0.0)), u.x),
                                mix(hash21(i + vec2(0.0,1.0)), hash21(i + vec2(1.0,1.0)), u.x), u.y);
                }
                float fbm(vec2 p) {
                    float v = 0.0, a = 0.5;
                    for (int i=0; i<5; i++) {
                        v += a * valueNoise(p);
                        p = p * 2.13 + vec2(1.7, 9.2);
                        a *= 0.5;
                    }
                    return v;
                }

                // Voronoi for Birefringent Cellophane
                vec3 voronoi(vec2 x) {
                    vec2 n = floor(x);
                    vec2 f = fract(x);
                    float md = 8.0;
                    vec2 mr;
                    for(int j=-1; j<=1; j++)
                    for(int i=-1; i<=1; i++) {
                        vec2 g = vec2(float(i), float(j));
                        vec2 o = hash22(n + g);
                        o = 0.5 + 0.5*sin(u_time*0.5 + 6.2831*o);
                        vec2 r = g + o - f;
                        float d = dot(r, r);
                        if(d < md) {
                            md = d;
                            mr = r;
                        }
                    }
                    return vec3(sqrt(md), mr);
                }

                // Spectral Color (Wyman 2013 Asymmetric Lobes)
                float lobe(float x, float a, float mu, float sl, float sr) {
                    float s = x < mu ? sl : sr;
                    return a * exp(-0.5 * pow((x - mu)/s, 2.0));
                }
                vec3 wavelengthToRGB(float l) {
                    float x = lobe(l, 1.056, 599.8, 37.9, 31.0) + lobe(l, 0.362, 442.0, 16.0, 26.7) + lobe(l, -0.065, 501.1, 20.4, 26.2);
                    float y = lobe(l, 0.821, 568.8, 46.9, 40.5) + lobe(l, 0.286, 530.9, 16.3, 31.1);
                    float z = lobe(l, 1.217, 437.0, 11.8, 36.0) + lobe(l, 0.681, 459.0, 26.0, 13.8);
                    vec3 c = mat3(3.2406, -0.9689, 0.0557, -1.5372, 1.8758, -0.2040, -0.4986, 0.0415, 1.0570) * vec3(x,y,z);
                    float m = min(min(c.r, c.g), min(c.b, 0.0));
                    c -= m; // Soft clip to preserve hue
                    return pow(clamp(c / max(max(c.r, max(c.g, c.b)), 1e-5), 0.0, 1.0), vec3(1.0/2.2));
                }

                // Michel-Levy Interference
                vec3 michelLevy(float gamma) {
                    vec3 col = vec3(0.0);
                    for(int i=0; i<6; i++) {
                        float l = mix(400.0, 700.0, float(i)/5.0);
                        float I = pow(sin(PI * gamma / l), 2.0);
                        col += I * wavelengthToRGB(l);
                    }
                    return col / 6.0;
                }

                // Alchemical SDFs
                float sdTriangle(vec2 p, float r) {
                    const float k = 1.7320508;
                    p.x = abs(p.x) - r;
                    p.y = p.y + r/k;
                    if(p.x + k*p.y > 0.0) p = vec2(p.x - k*p.y, -k*p.x - p.y)/2.0;
                    p.x -= clamp(p.x, -2.0*r, 0.0);
                    return -length(p)*sign(p.y);
                }
                float sdCross(vec2 p, float s) {
                    p = abs(p);
                    return min(max(p.x-s, p.y-s*0.3), max(p.y-s, p.x-s*0.3));
                }

                // Dynamic Palettes
                vec3 getPalette(float t, vec2 uv) {
                    vec3 a, b, c, d;
                    if(u_palette < 1.0) { // Tropical Alien Lagoon (Hot Pink, Cyan, Mango)
                        a = vec3(0.8, 0.2, 0.5); b = vec3(0.4, 0.8, 0.8); c = vec3(1.0, 1.0, 1.0); d = vec3(0.0, 0.33, 0.67);
                    } else if(u_palette < 2.0) { // Ultraviolet Reef
                        a = vec3(0.5, 0.0, 0.8); b = vec3(0.5, 0.2, 0.9); c = vec3(1.0, 1.0, 1.0); d = vec3(0.3, 0.2, 0.8);
                    } else if(u_palette < 3.0) { // Citrus Plasma
                        a = vec3(0.9, 0.6, 0.1); b = vec3(0.8, 0.9, 0.2); c = vec3(1.0, 1.0, 1.0); d = vec3(0.0, 0.1, 0.2);
                    } else if(u_palette < 4.0) { // Opaline Tidepool
                        a = vec3(0.3, 0.8, 0.7); b = vec3(0.6, 0.9, 0.8); c = vec3(1.0, 1.0, 1.0); d = vec3(0.5, 0.6, 0.7);
                    } else { // Electric Sunset
                        a = vec3(0.9, 0.2, 0.3); b = vec3(0.9, 0.5, 0.1); c = vec3(1.0, 1.0, 1.0); d = vec3(0.0, 0.15, 0.3);
                    }
                    return a + b * cos(6.28318 * (c * t + d + fbm(uv)));
                }

                void main() {
                    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
                    vec2 p = (vUv * 2.0 - 1.0) * aspect;
                    
                    // Interaction Pulse Warp
                    float pTime = u_time - u_click_time;
                    float pDist = length(vUv - u_click_pos);
                    float pulse = exp(-pow(pDist - pTime * 0.5, 2.0) * 50.0) * smoothstep(2.0, 0.0, pTime);
                    p += normalize(vUv - u_click_pos + 0.001) * pulse * 0.1;

                    // Asymmetrical Drift
                    p.x += u_time * 0.08;
                    p.y += sin(u_time * 0.05) * 0.1;

                    // Layer 0: Background Color Space Warp
                    float bgNoise = fbm(p * 0.8 + fbm(p * 0.4 - u_time * 0.1));
                    vec3 col = getPalette(bgNoise + u_time * 0.05, p);
                    
                    // Ensure no dark voids - lift minimum color
                    col = max(col, vec3(0.1, 0.2, 0.3));

                    // Layer 1: Cellophane Birefringence Reef (Voronoi)
                    vec3 v = voronoi(p * 1.5 + fbm(p * 2.0 + u_time * 0.1));
                    float thickness = v.x * 2500.0;
                    vec3 celloCol = michelLevy(thickness);
                    // Edge highlights
                    float celloEdge = smoothstep(0.15, 0.0, v.x);
                    col = mix(col, celloCol * 1.5, celloEdge * 0.6);

                    // Layer 2: Refractive Kelp Ribbons & Diffraction
                    float ribY = p.y + sin(p.x * 1.5 + u_time * 0.4) * 0.4 + fbm(p * 2.0) * 0.3;
                    float ribbon = abs(ribY);
                    float ribMask = smoothstep(0.2, 0.05, ribbon);
                    if (ribMask > 0.0) {
                        // Diffraction Grating Shimmer
                        float grating = fract(ribbon * 40.0 + p.x * 10.0 - u_time * 2.0);
                        vec3 diffCol = wavelengthToRGB(400.0 + 300.0 * grating);
                        // Chromadepth encoding: warm forward, cool back
                        vec3 baseRibCol = wavelengthToRGB(650.0 - ribbon * 1000.0);
                        vec3 finalRib = mix(baseRibCol, diffCol * 2.0, 0.4);
                        col = mix(col, finalRib, ribMask * 0.85);
                    }

                    // Layer 3: Plasma Filaments
                    vec2 plasmaP = p * 2.5;
                    float plNoise = fbm(plasmaP - vec2(u_time * 0.8, 0.0));
                    // Attract to mouse
                    vec2 mP = (u_mouse * 2.0 - 1.0) * aspect;
                    float mAttr = smoothstep(1.5, 0.0, length(p - mP));
                    float plLine = abs(plasmaP.y - plNoise * 1.5 - mAttr * (mP.y * 2.5));
                    float plasmaGlow = 0.015 / max(plLine, 0.001);
                    vec3 plasmaColor = vec3(0.1, 1.0, 0.9) * u_plasma_int;
                    col += plasmaColor * plasmaGlow * smoothstep(0.0, 0.5, fbm(p*5.0));

                    // Layer 4: Alchemical Spores
                    vec2 sp = p * 4.0 + vec2(u_time * 0.2, u_time * 0.1);
                    vec2 sgv = fract(sp) - 0.5;
                    vec2 sid = floor(sp);
                    float sh = hash21(sid);
                    if (sh < u_spore_den) {
                        float sd = 1.0;
                        if (fract(sh * 10.0) < 0.5) sd = sdTriangle(sgv, 0.15);
                        else sd = sdCross(sgv, 0.15);
                        
                        // Simultaneous contrast: Spores are bright orange/magenta to pop against teal/green
                        vec3 sporeCol = mix(vec3(1.0, 0.3, 0.0), vec3(1.0, 0.0, 0.8), fract(sh * 20.0));
                        float sporeMask = smoothstep(0.03, 0.0, sd);
                        float sporeGlow = smoothstep(0.15, 0.0, sd) * 0.5;
                        col = mix(col, sporeCol * 1.5, sporeMask);
                        col += sporeCol * sporeGlow;
                    }

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        // --- Post-Process Shader (Optical FX) ---
        const postMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_mainTex: { value: renderTarget.texture },
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_depth_exag: { value: 1.0 },
                u_hidden_corr: { value: 0.3 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                in vec2 vUv;
                out vec4 fragColor;

                uniform sampler2D u_mainTex;
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform float u_depth_exag;
                uniform float u_hidden_corr;

                float hash21(vec2 p) {
                    p = fract(p * vec2(123.34, 456.21));
                    p += dot(p, p + 45.32);
                    return fract(p.x * p.y);
                }

                void main() {
                    vec3 baseCol = texture(u_mainTex, vUv).rgb;
                    float lum = dot(baseCol, vec3(0.299, 0.587, 0.114));
                    
                    // Chromostereopsis & Chromatic Aberration
                    // Push red forward, blue back based on luminance (depth proxy)
                    float shiftAmt = (lum - 0.5) * 0.015 * u_depth_exag;
                    vec2 dir = normalize(vUv - 0.5 + 0.0001);
                    
                    float r = texture(u_mainTex, vUv + dir * shiftAmt).r;
                    float g = texture(u_mainTex, vUv).g;
                    float b = texture(u_mainTex, vUv - dir * shiftAmt).b;
                    vec3 col = vec3(r, g, b);

                    // Glass Patterns (Hidden Correlation)
                    // Two dot fields, correlated by a hidden spiral structure
                    vec2 noiseUV = vUv * min(u_resolution.x, u_resolution.y) * 0.4;
                    float n1 = hash21(floor(noiseUV));
                    
                    vec2 hiddenWarp = vec2(sin(vUv.y * 15.0 + u_time), cos(vUv.x * 15.0 - u_time)) * 0.05;
                    float n2 = hash21(floor(noiseUV + hiddenWarp * 100.0));
                    
                    float glassDot = mix(n1, n2, u_hidden_corr);
                    // Add subtle glass texture, biased towards ultraviolet/cyan
                    vec3 glassColor = vec3(0.2, 0.8, 1.0) * glassDot * 0.15 * u_hidden_corr;
                    col += glassColor;

                    // Soft Vignette to frame the reef
                    float d = length(vUv - 0.5);
                    col *= smoothstep(0.8, 0.3, d) * 0.2 + 0.8;

                    // Tonemapping to keep colors juicy but unclipped
                    col = col / (1.0 + col * 0.2);

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        const quadGeo = new THREE.PlaneGeometry(2, 2);
        const mainMesh = new THREE.Mesh(quadGeo, mainMat);
        sceneMain.add(mainMesh);
        
        const postMesh = new THREE.Mesh(quadGeo, postMat);
        scenePost.add(postMesh);

        canvas.__three = { renderer, camera, sceneMain, scenePost, renderTarget, mainMat, postMat };
    }

    const { renderer, camera, sceneMain, scenePost, renderTarget, mainMat, postMat } = canvas.__three;
    const s = canvas.__state;

    // --- State Interpolation (Smooth Transitions) ---
    s.depthExag += (s.targetDepth - s.depthExag) * 0.05;
    s.hiddenCorr += (s.targetCorr - s.hiddenCorr) * 0.05;
    s.plasmaInt += (s.targetPlasma - s.plasmaInt) * 0.05;
    s.sporeDen += (s.targetSpore - s.sporeDen) * 0.05;

    // --- Update Uniforms ---
    const resX = grid.width;
    const resY = grid.height;
    
    if (mainMat.uniforms) {
        mainMat.uniforms.u_time.value = time;
        mainMat.uniforms.u_mouse.value.set(mouse.x, mouse.y);
        mainMat.uniforms.u_resolution.value.set(resX, resY);
        mainMat.uniforms.u_click_pos.value.copy(s.clickPos);
        mainMat.uniforms.u_click_time.value = s.clickTime;
        mainMat.uniforms.u_palette.value = s.paletteIdx;
        mainMat.uniforms.u_plasma_int.value = s.plasmaInt;
        mainMat.uniforms.u_spore_den.value = s.sporeDen;
    }

    if (postMat.uniforms) {
        postMat.uniforms.u_time.value = time;
        postMat.uniforms.u_resolution.value.set(resX, resY);
        postMat.uniforms.u_depth_exag.value = s.depthExag;
        postMat.uniforms.u_hidden_corr.value = s.hiddenCorr;
    }

    // --- Render Pipeline ---
    renderer.setSize(resX, resY, false);
    
    // Pass 1: Render Main Reef to RenderTarget
    renderer.setRenderTarget(renderTarget);
    renderer.render(sceneMain, camera);
    
    // Pass 2: Render Post (Optics) to Screen
    renderer.setRenderTarget(null);
    renderer.render(scenePost, camera);

} catch (e) {
    console.error("Chromatic Reef Surge Initialization Failed:", e);
}