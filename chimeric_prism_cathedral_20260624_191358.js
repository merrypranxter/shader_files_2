try {
    if (!ctx) throw new Error("WebGL context not available");

    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        renderer.autoClear = false;

        const sceneMain = new THREE.Scene();
        const sceneFeedback = new THREE.Scene();
        const sceneComposite = new THREE.Scene();

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const rtOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            stencilBuffer: false,
            depthBuffer: false
        };

        const rtMain = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
        const rtPing = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
        const rtPong = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

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
            uniform vec3 u_click;
            uniform float u_palette;
            uniform float u_glass;
            uniform float u_alchemy;
            uniform float u_depth;
            uniform float u_biref;

            #define PI 3.14159265359

            // --- NOISE & MATH ---
            vec2 hash2(vec2 p) {
                p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
                return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(
                    mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)), dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
                    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
                    u.y
                );
            }

            float fbm(vec2 p) {
                float f = 0.0;
                float amp = 0.5;
                for(int i = 0; i < 5; i++) {
                    f += amp * noise(p);
                    p = p * 2.0 + vec2(12.34, 56.78);
                    amp *= 0.5;
                }
                return f;
            }

            mat2 rot(float a) {
                float c = cos(a), s = sin(a);
                return mat2(c, -s, s, c);
            }

            float smin(float a, float b, float k) {
                float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
                return mix(b, a, h) - k * h * (1.0 - h);
            }

            // --- SDFs ---
            float sdHexagram(vec2 p, float r) {
                const vec4 k = vec4(-0.5, 0.8660254038, 0.5773502692, 1.7320508076);
                p = abs(p);
                p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
                p -= 2.0 * min(dot(k.yx, p), 0.0) * k.yx;
                p -= vec2(clamp(p.x, r * k.z, r * k.w), r);
                return length(p) * sign(p.y);
            }

            float sdCircle(vec2 p, float r) {
                return length(p) - r;
            }

            float sdBox(vec2 p, vec2 b) {
                vec2 d = abs(p) - b;
                return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
            }

            // --- COLOR ENGINES ---
            vec3 spectral(float l) {
                float t = (l - 380.0) / 320.0;
                vec3 c = clamp(vec3(
                    1.5 - abs(t * 4.0 - 3.0),
                    1.5 - abs(t * 4.0 - 2.0),
                    1.5 - abs(t * 4.0 - 1.0)
                ), 0.0, 1.0);
                // Ensure saturated, funky colors
                c = mix(c, normalize(c + 0.1) * 1.2, 0.5);
                
                // Palette shifts
                if(u_palette > 0.5 && u_palette < 1.5) c = c.brg; // Mineral Slide
                if(u_palette > 1.5 && u_palette < 2.5) c = c.gbr; // Neon Alchemy
                if(u_palette > 2.5 && u_palette < 3.5) c = vec3(c.r, c.b, c.g*2.0); // UV Aquarium
                if(u_palette > 3.5) c = vec3(c.g, c.r, c.b); // Plasma Fruit
                
                return c;
            }

            vec3 michelLevy(float gamma) {
                vec3 col = vec3(0.0);
                for(int i = 0; i < 5; i++) {
                    float l = mix(400.0, 700.0, float(i)/4.0);
                    float I = pow(sin(PI * gamma / l), 2.0);
                    col += spectral(l) * I;
                }
                return col / 2.5;
            }

            // --- MAIN CATHEDRAL GEOMETRY ---
            float mapCathedral(vec2 p) {
                float d = sdHexagram(p * rot(u_time * 0.1), 0.5);
                
                for(float i=0.; i<6.; i++) {
                    float a = i * PI / 3.0 + u_time * 0.05;
                    vec2 pos = vec2(cos(a), sin(a)) * 0.7;
                    float node = sdCircle(p - pos, 0.15);
                    d = smin(d, node, 0.2);
                }
                
                float arches = abs(length(p) - 0.8) - 0.05;
                arches += sin(atan(p.y, p.x) * 12.0) * 0.05;
                
                return smin(d, arches, 0.1);
            }

            void main() {
                vec2 uv = (vUv - 0.5) * 2.0;
                uv.x *= u_resolution.x / u_resolution.y;

                // Mouse interaction: Prism Lens Warp
                vec2 mouseUV = (u_mouse - 0.5) * 2.0;
                mouseUV.x *= u_resolution.x / u_resolution.y;
                float mouseDist = length(uv - mouseUV);
                uv += normalize(uv - mouseUV) * exp(-mouseDist * 5.0) * 0.1;

                float sdf = mapCathedral(uv);
                
                // 1. Base Field (Color Cycling FBM)
                float baseNoise = fbm(uv * 3.0 + vec2(u_time * 0.1, -u_time * 0.2));
                vec3 col = spectral(400.0 + baseNoise * 300.0);

                // 2. Birefringence (Michel-Levy Bands)
                float gamma = (abs(sdf) + fbm(uv * 5.0)) * 3000.0 * u_biref;
                col = mix(col, michelLevy(gamma), 0.6 * u_biref);

                // 3. Diffraction Grating (Interference Fans)
                float angle = atan(uv.y, uv.x);
                float grating = sin(angle * 50.0 + length(uv) * 20.0 - u_time * 5.0);
                vec3 diff = spectral(400.0 + 300.0 * fract(grating * 0.5 + 0.5));
                float diffMask = smoothstep(0.1, 0.0, abs(sdf + 0.1));
                col += diff * diffMask * 0.8;

                // 4. Plasma Filaments
                float plasmaNoise = fbm(uv * 10.0 - u_time * 2.0);
                float plasmaLine = smoothstep(0.015, 0.0, abs(sdf - plasmaNoise * 0.15));
                vec3 plasmaColor = spectral(700.0 - plasmaNoise * 200.0);
                col += plasmaLine * plasmaColor * 2.0;

                // 5. Glass Patterns (Hidden Correlation)
                vec2 warpUV = uv + normalize(uv) * sin(sdf * 30.0) * 0.03 * u_glass;
                float dotRef = fract(sin(dot(uv * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
                float dotXf  = fract(sin(dot(warpUV * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
                float isDot = mix(dotRef, dotXf, 0.8) > 0.85 ? 1.0 : 0.0;
                vec3 glassColor = spectral(mod(sdf * 200.0 + u_time * 50.0, 300.0) + 400.0);
                col = mix(col, glassColor, isDot * u_glass * 0.8);

                // 6. ChromaDepth & Chromostereopsis
                vec3 cdColor = spectral(700.0 - clamp(sdf * 2.0, 0.0, 1.0) * 300.0);
                col = mix(col, cdColor, u_depth * 0.4);
                
                float edgeR = smoothstep(0.0, 0.02, sdf);
                float edgeB = smoothstep(0.02, 0.0, sdf);
                col += vec3(edgeR, 0.0, edgeB) * u_depth * 0.5;

                // 7. Simultaneous Contrast (Vibrating Borders)
                float borderTile = step(0.5, fract(sdf * 20.0 + angle * 10.0));
                vec3 borderCol = spectral(mod(sdf * 50.0 + borderTile * 150.0, 300.0) + 400.0);
                col = mix(col, borderCol, smoothstep(0.05, 0.0, abs(sdf)) * 0.5);

                // 8. Alchemical Nodes
                if(u_alchemy > 0.5) {
                    float alchDist = 1e5;
                    for(float i=0.; i<3.; i++) {
                        float a = i * PI * 0.666 + u_time * 0.2;
                        vec2 pos = vec2(cos(a), sin(a)) * 0.4;
                        float tri = sdBox(uv - pos, vec2(0.05)); // Simplified symbols
                        alchDist = min(alchDist, tri);
                    }
                    float alchMask = smoothstep(0.01, 0.0, abs(alchDist));
                    col += alchMask * vec3(1.0, 0.8, 0.2) * 1.5;
                }

                // 9. Impossible Color Seed (Click Bloom)
                float clickDist = length(vUv - u_click.xy);
                float clickTime = u_time - u_click.z;
                if(clickTime > 0.0 && clickTime < 3.0) {
                    float ripple = sin(clickDist * 100.0 - clickTime * 20.0);
                    float clickMask = smoothstep(0.3, 0.0, clickDist) * exp(-clickTime * 2.0);
                    vec3 oppColor = vec3(1.0) - col; // Opponent process
                    col = mix(col, oppColor, clickMask * (ripple * 0.5 + 0.5));
                }

                // Prevent dead black/white
                col = max(col, vec3(0.05, 0.0, 0.15)); // Deep indigo shadows
                
                fragColor = vec4(col, 1.0);
            }
        `;

        const feedbackFragShader = `
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform sampler2D tMain;
            uniform sampler2D tPrev;
            uniform float u_time;

            void main() {
                vec4 mainCol = texture(tMain, vUv);
                
                // Plasma trail warp
                vec2 warpUv = vUv + (mainCol.rg - 0.5) * 0.003;
                vec4 prevCol = texture(tPrev, warpUv);

                // Impossible color decay (Opponent process fatigue)
                vec3 opponent = vec3(1.0) - prevCol.rgb;
                vec3 decayedPrev = mix(prevCol.rgb, opponent, 0.02) * 0.96;

                vec3 finalCol = max(mainCol.rgb, decayedPrev);
                
                fragColor = vec4(finalCol, 1.0);
            }
        `;

        const compositeFragShader = `
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform sampler2D tFeedback;
            
            void main() {
                // Chromatic Aberration
                vec2 dir = normalize(vUv - 0.5);
                float dist = length(vUv - 0.5);
                float ca = dist * 0.015;
                
                float r = texture(tFeedback, vUv + dir * ca).r;
                float g = texture(tFeedback, vUv).g;
                float b = texture(tFeedback, vUv - dir * ca).b;
                vec3 col = vec3(r, g, b);

                // Colored Bloom Approximation
                vec3 bloom = vec3(0.0);
                float tot = 0.0;
                for(float x=-2.0; x<=2.0; x++) {
                    for(float y=-2.0; y<=2.0; y++) {
                        vec2 off = vec2(x,y) * 0.005;
                        vec3 s = texture(tFeedback, vUv + off).rgb;
                        bloom += s * s; 
                        tot += 1.0;
                    }
                }
                col += (bloom / tot) * 0.3;

                // Enforce Color Rules (No dominant black/white)
                col = max(col, vec3(0.1, 0.0, 0.2)); // Jewel-toned shadows
                col = min(col, vec3(0.95, 0.9, 0.98)); // Prevent blown-out white
                
                // Tiny Sparkle Highlights
                float sparkle = pow(fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453), 150.0);
                col += vec3(sparkle);

                fragColor = vec4(col, 1.0);
            }
        `;

        const uniforms = {
            u_time: { value: 0 },
            u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
            u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
            u_click: { value: new THREE.Vector3(-1, -1, -100) },
            u_palette: { value: 0.0 },
            u_glass: { value: 1.0 },
            u_alchemy: { value: 1.0 },
            u_depth: { value: 1.0 },
            u_biref: { value: 1.0 }
        };

        const matMain = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader: vertShader,
            fragmentShader: mainFragShader,
            uniforms: uniforms
        });

        const matFeedback = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader: vertShader,
            fragmentShader: feedbackFragShader,
            uniforms: {
                tMain: { value: rtMain.texture },
                tPrev: { value: rtPing.texture },
                u_time: uniforms.u_time
            }
        });

        const matComposite = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader: vertShader,
            fragmentShader: compositeFragShader,
            uniforms: {
                tFeedback: { value: rtPing.texture }
            }
        });

        const geo = new THREE.PlaneGeometry(2, 2);
        
        const meshMain = new THREE.Mesh(geo, matMain);
        sceneMain.add(meshMain);

        const meshFeedback = new THREE.Mesh(geo, matFeedback);
        sceneFeedback.add(meshFeedback);

        const meshComposite = new THREE.Mesh(geo, matComposite);
        sceneComposite.add(meshComposite);

        // State & Event Listeners
        const state = {
            palette: 0,
            glass: 1,
            alchemy: 1,
            depth: 1,
            biref: 1
        };

        if (!canvas.__keydown_added) {
            window.addEventListener('keydown', (e) => {
                const k = e.key.toLowerCase();
                if (k === 'c') state.palette = (state.palette + 1) % 5;
                if (k === 'g') state.glass = state.glass > 0.5 ? 0.0 : 1.0;
                if (k === 'a') state.alchemy = state.alchemy > 0.5 ? 0.0 : 1.0;
                if (k === 'd') state.depth = state.depth > 0.5 ? 0.0 : 1.0;
                if (k === 'b') state.biref = state.biref > 0.5 ? 0.0 : 1.0;
            });
            
            canvas.addEventListener('mousedown', (e) => {
                const rect = canvas.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                const y = 1.0 - (e.clientY - rect.top) / rect.height;
                uniforms.u_click.value.set(x, y, uniforms.u_time.value);
            });
            
            canvas.__keydown_added = true;
        }

        canvas.__three = {
            renderer, sceneMain, sceneFeedback, sceneComposite, camera,
            rtMain, rtPing, rtPong, uniforms, matFeedback, matComposite, state
        };
    }

    const t = canvas.__three;
    const { renderer, sceneMain, sceneFeedback, sceneComposite, camera, rtMain, uniforms, matFeedback, matComposite, state } = t;

    // Update uniforms
    uniforms.u_time.value = time;
    uniforms.u_resolution.value.set(grid.width, grid.height);
    if(mouse.x !== undefined && mouse.y !== undefined) {
        uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
    }
    
    uniforms.u_palette.value += (state.palette - uniforms.u_palette.value) * 0.1;
    uniforms.u_glass.value += (state.glass - uniforms.u_glass.value) * 0.1;
    uniforms.u_alchemy.value += (state.alchemy - uniforms.u_alchemy.value) * 0.1;
    uniforms.u_depth.value += (state.depth - uniforms.u_depth.value) * 0.1;
    uniforms.u_biref.value += (state.biref - uniforms.u_biref.value) * 0.1;

    renderer.setSize(grid.width, grid.height, false);

    // Pass 1: Main Cathedral Scene
    renderer.setRenderTarget(rtMain);
    renderer.render(sceneMain, camera);

    // Pass 2: Feedback & Afterimages (Ping-Pong)
    matFeedback.uniforms.tMain.value = rtMain.texture;
    matFeedback.uniforms.tPrev.value = t.rtPing.texture;
    renderer.setRenderTarget(t.rtPong);
    renderer.render(sceneFeedback, camera);

    // Swap RTs
    let temp = t.rtPing;
    t.rtPing = t.rtPong;
    t.rtPong = temp;

    // Pass 3: Composite to screen
    matComposite.uniforms.tFeedback.value = t.rtPing.texture;
    renderer.setRenderTarget(null);
    renderer.render(sceneComposite, camera);

} catch (e) {
    console.error("WebGL Cathedral Initialization Failed:", e);
}