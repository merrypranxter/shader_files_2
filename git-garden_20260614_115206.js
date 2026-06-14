try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ 
            canvas, 
            context: ctx, 
            alpha: true, 
            antialias: true 
        });
        
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        const vertexShader = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            in vec2 vUv;
            out vec4 fragColor;

            uniform float u_time;
            uniform vec2 u_resolution;

            #define PI 3.14159265359
            #define TAU 6.28318530718

            // ─── ALCHEMICAL MATH & NOISE ─────────────────────────────────────────
            
            mat2 rot(float a) {
                float s = sin(a), c = cos(a);
                return mat2(c, -s, s, c);
            }

            vec2 hash22(vec2 p) {
                vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
                p3 += dot(p3, p3.yzx + 33.33);
                return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix( mix( dot( hash22(i + vec2(0.0,0.0)), f - vec2(0.0,0.0) ),
                                 dot( hash22(i + vec2(1.0,0.0)), f - vec2(1.0,0.0) ), u.x),
                            mix( dot( hash22(i + vec2(0.0,1.0)), f - vec2(0.0,1.0) ),
                                 dot( hash22(i + vec2(1.0,1.0)), f - vec2(1.0,1.0) ), u.x), u.y);
            }

            // Multi-scale Turing-like FBM
            float fbm(vec2 p) {
                float f = 0.0;
                float amp = 0.5;
                mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
                for(int i = 0; i < 6; i++) {
                    f += amp * noise(p);
                    p = m * p;
                    amp *= 0.5;
                }
                return f;
            }

            // Domain Warping - The Ocean/Math Phenomenon
            float fbmWarp(vec2 p) {
                vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
                vec2 r = vec2(
                    fbm(p + 4.0 * q + vec2(1.7, 9.2) + u_time * 0.15), 
                    fbm(p + 4.0 * q + vec2(8.3, 2.8) - u_time * 0.12)
                );
                return fbm(p + 4.0 * r);
            }

            // ─── COLOR SYSTEMS & PALETTES ────────────────────────────────────────
            
            vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
                return a + b * cos(TAU * (c * t + d));
            }

            // The Tetragrammaton (Sacred Geometry Core)
            vec3 palTetragrammaton(float t) {
                return palette(t, vec3(0.5, 0.4, 0.1), vec3(0.5, 0.4, 0.1), vec3(1.0, 0.7, 0.4), vec3(0.0, 0.15, 0.20));
            }

            // Neon Acid (Maximalist Cyber-Botanical)
            vec3 palNeonAcid(float t) {
                return palette(t, vec3(0.5), vec3(0.5, 0.5, 0.33), vec3(2.0, 1.0, 1.0), vec3(0.5, 0.2, 0.25));
            }

            // Structural Color (Thin Film Interference / Spectral Rainbow)
            vec3 palThinFilm(float t) {
                return palette(t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
            }

            // ─── FORMAL GRAMMARS ─────────────────────────────────────────────────

            // Haeckel Radial Symmetry Fold
            vec2 radialFold(vec2 p, float n) {
                float a = atan(p.y, p.x);
                float r = length(p);
                float s = TAU / n;
                float fa = mod(a + s * 0.5, s) - s * 0.5;
                return vec2(cos(fa), sin(fa)) * r;
            }

            // Aboriginal Dreamtime Stipple / Dot Infill
            float stipple(vec2 p, float density, float darkness) {
                vec2 cell = floor(p * density);
                vec2 local = fract(p * density) - 0.5;
                vec2 shift = hash22(cell) * 0.4; // Poisson-ish jitter
                float dist = length(local - shift);
                float dot_r = darkness * 0.4;
                return smoothstep(dot_r, dot_r * 0.5, dist);
            }

            void main() {
                vec2 uv = vUv * 2.0 - 1.0;
                uv.x *= u_resolution.x / u_resolution.y;

                float r = length(uv);
                float a = atan(uv.y, uv.x);

                // 1. THE VOID RULE - Near-black background, deep cosmic purple
                vec3 col = vec3(0.02, 0.01, 0.03); 

                // 2. ABORIGINAL DREAMING TRACKS & THE WHIRRING (Background Layer)
                // Meandering lines intersecting concentric rings
                float aNoise = fbm(vec2(a * 4.0, r * 3.0 - u_time * 0.2));
                float tracks = smoothstep(0.98, 1.0, sin(a * 16.0 + aNoise * 5.0));
                
                float ringDist = r + fbm(uv * 3.0 + u_time * 0.1) * 0.15;
                float rings = smoothstep(0.04, 0.0, abs(fract(ringDist * 10.0 - u_time * 0.4) - 0.5));
                
                vec3 bgGlow = palNeonAcid(r * 2.0 + u_time * 0.1);
                col = mix(col, bgGlow, (tracks + rings) * 0.3 * smoothstep(1.5, 0.2, r));

                // Dot field infill
                float dots = stipple(uv * rot(u_time * 0.05), 80.0, 0.8 + 0.2 * sin(u_time));
                col = mix(col, vec3(1.0, 0.8, 0.4), dots * 0.25 * smoothstep(1.2, 0.4, r));


                // 3. THE OCEAN / MATH HEIGHTFIELD (Normal estimation for Structural Color)
                float hMap = fbmWarp(uv * 3.0 - u_time * 0.3);
                vec2 eps = vec2(0.01, 0.0);
                float hX = fbmWarp((uv + eps.xy) * 3.0 - u_time * 0.3);
                float hY = fbmWarp((uv + eps.yx) * 3.0 - u_time * 0.3);
                vec3 normal = normalize(vec3(hX - hMap, hY - hMap, 0.1));
                float cosTheta = dot(normal, vec3(0.0, 0.0, 1.0));
                
                // Base iridescence derived from thin-film Bragg reflection
                vec3 iridescence = palThinFilm(cosTheta * 4.0 + r * 3.0 - u_time * 0.6);


                // 4. HAECKEL / BOTANICAL ILLUSTRATION (Outer Petals, 8-fold)
                vec2 p8 = radialFold(uv * rot(u_time * 0.1), 8.0);
                // Morphing teardrop petal
                float petalShape8 = length(p8 - vec2(0.4, 0.0)) * 2.0 + hMap * 0.4;
                float petalMask8 = smoothstep(0.7, 0.65, petalShape8);
                
                // Wet Edge Bloom (Watercolor capillary action)
                float wetEdge8 = smoothstep(0.55, 0.68, petalShape8) * smoothstep(0.75, 0.68, petalShape8);
                vec3 edgeCol8 = palNeonAcid(cosTheta * 2.0 + u_time);
                
                vec3 layer8 = mix(iridescence, edgeCol8, wetEdge8 * 1.5);
                
                // X-Ray Animal / Diatom Ribs (Internal Structure)
                float costae = smoothstep(0.92, 0.98, cos(atan(p8.y, p8.x) * 24.0));
                float spine8 = smoothstep(0.015, 0.0, abs(p8.y));
                layer8 = mix(layer8, vec3(0.05, 0.02, 0.1), costae * 0.4);
                layer8 = mix(layer8, palTetragrammaton(r), spine8);

                // Linework Hierarchy (Primary outline)
                float outline8 = smoothstep(0.63, 0.65, petalShape8) * smoothstep(0.67, 0.65, petalShape8);
                layer8 = mix(layer8, vec3(0.9, 0.9, 1.0), outline8);

                // Cast shadow over void
                col = mix(col, vec3(0.0), smoothstep(0.75, 0.65, petalShape8) * 0.6);
                col = mix(col, layer8, petalMask8);


                // 5. REDOUTE ROSE / WET WASH (Inner Petals, 5-fold)
                vec2 p5 = radialFold(uv * rot(-u_time * 0.25), 5.0);
                float petalShape5 = length(p5 - vec2(0.2, 0.0)) * 2.5 + hMap * 0.25;
                float petalMask5 = smoothstep(0.5, 0.45, petalShape5);
                
                float wetEdge5 = smoothstep(0.35, 0.48, petalShape5) * smoothstep(0.55, 0.48, petalShape5);
                vec3 edgeCol5 = palTetragrammaton(cosTheta + u_time * 0.8);

                vec3 layer5 = mix(palThinFilm(cosTheta * 5.0 - u_time * 1.2), edgeCol5, wetEdge5 * 2.0);
                
                float outline5 = smoothstep(0.43, 0.45, petalShape5) * smoothstep(0.47, 0.45, petalShape5);
                layer5 = mix(layer5, vec3(0.1, 0.0, 0.05), outline5);

                col = mix(col, vec3(0.0), smoothstep(0.55, 0.45, petalShape5) * 0.8);
                col = mix(col, layer5, petalMask5);


                // 6. THE TETRAGRAMMATON (Sacred Core, 4-fold)
                vec2 p4 = radialFold(uv * rot(u_time * 0.4), 4.0);
                // Box-like core structure
                float coreShape = max(abs(p4.x - 0.06), abs(p4.y)) * 5.0 + fbm(uv * 15.0) * 0.15;
                float coreMask = smoothstep(0.4, 0.35, coreShape);
                
                vec3 coreCol = palTetragrammaton(r * 8.0 - u_time * 2.0);
                // Self-luminous core (Lit from below)
                coreCol += vec3(1.0, 0.95, 0.8) * smoothstep(0.15, 0.0, coreShape) * 1.5;
                
                float coreOutline = smoothstep(0.33, 0.35, coreShape) * smoothstep(0.37, 0.35, coreShape);
                coreCol = mix(coreCol, vec3(1.0), coreOutline);

                col = mix(col, vec3(0.0), smoothstep(0.45, 0.35, coreShape) * 0.9);
                col = mix(col, coreCol, coreMask);

                // 7. POST-PROCESSING (Vignette & Tonemapping)
                col *= smoothstep(1.6, 0.4, r); // Vignette
                col = pow(col, vec3(0.85)); // Slight gamma lift for the neons

                fragColor = vec4(col, 1.0);
            }
        `;

        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader,
            fragmentShader,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            depthWrite: false,
            depthTest: false
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);

        canvas.__three = { renderer, scene, camera, material };
    }

    const { renderer, scene, camera, material } = canvas.__three;

    if (material && material.uniforms) {
        material.uniforms.u_time.value = time;
        material.uniforms.u_resolution.value.set(grid.width, grid.height);
    }

    renderer.setSize(grid.width, grid.height, false);
    renderer.render(scene, camera);

} catch (e) {
    console.error("Feral Shader Initialization Failed:", e);
}