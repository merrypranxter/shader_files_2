try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
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

            // OKLCh to sRGB conversion for hyper-vivid, perceptually uniform colors
            vec3 oklch_to_srgb(vec3 lch) {
                float L = lch.x;
                float C = lch.y;
                float h = lch.z;
                
                float a = C * cos(h);
                float b = C * sin(h);
                
                float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
                float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
                float s_ = L - 0.0894841775 * a - 1.2914855480 * b;
                
                float l = l_ * l_ * l_;
                float m = m_ * m_ * m_;
                float s = s_ * s_ * s_;
                
                vec3 rgb = vec3(
                     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                );
                
                vec3 srgb = vec3(
                    rgb.r <= 0.0031308 ? rgb.r * 12.92 : 1.055 * pow(max(rgb.r, 0.0), 1.0/2.4) - 0.055,
                    rgb.g <= 0.0031308 ? rgb.g * 12.92 : 1.055 * pow(max(rgb.g, 0.0), 1.0/2.4) - 0.055,
                    rgb.b <= 0.0031308 ? rgb.b * 12.92 : 1.055 * pow(max(rgb.b, 0.0), 1.0/2.4) - 0.055
                );
                return clamp(srgb, 0.0, 1.0);
            }

            // Pseudo-random hashing
            vec2 hash22(vec2 p) {
                vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
                p3 += dot(p3, p3.yzx + 33.33);
                return fract((p3.xx + p3.yz) * p3.zy);
            }
            
            float hash12(vec2 p) {
                vec3 p3  = fract(vec3(p.xyx) * 0.1031);
                p3 += dot(p3, p3.yzx + 33.33);
                return fract((p3.x + p3.y) * p3.z);
            }

            // Fractional Brownian Motion (FBM)
            float noise(vec2 x) {
                vec2 i = floor(x);
                vec2 f = fract(x);
                f = f * f * (3.0 - 2.0 * f);
                float a = hash12(i);
                float b = hash12(i + vec2(1.0, 0.0));
                float c = hash12(i + vec2(0.0, 1.0));
                float d = hash12(i + vec2(1.0, 1.0));
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }
            
            float fbm(vec2 x) {
                float v = 0.0;
                float a = 0.5;
                vec2 shift = vec2(100.0, 100.0);
                for (int i = 0; i < 5; ++i) {
                    v += a * noise(x);
                    x = x * 2.0 + shift;
                    a *= 0.5;
                }
                return v;
            }

            // Voronoi generating Mycelial Anastomosis (Fusion) networks
            vec4 voronoi(vec2 x, float t) {
                vec2 n = floor(x);
                vec2 f = fract(x);
                float m_dist = 8.0;
                vec2 m_point;
                vec2 m_cell;
                
                for(int j = -1; j <= 1; j++) {
                    for(int i = -1; i <= 1; i++) {
                        vec2 g = vec2(float(i), float(j));
                        vec2 o = hash22(n + g);
                        o = 0.5 + 0.5 * sin(t + 6.2831853 * o);
                        vec2 r = g + o - f;
                        float d = dot(r, r);
                        if(d < m_dist) {
                            m_dist = d;
                            m_point = r;
                            m_cell = n + g;
                        }
                    }
                }
                
                float m_edge = 8.0;
                for(int j = -2; j <= 2; j++) {
                    for(int i = -2; i <= 2; i++) {
                        vec2 g = vec2(float(i), float(j));
                        vec2 o = hash22(n + g);
                        o = 0.5 + 0.5 * sin(t + 6.2831853 * o);
                        vec2 r = g + o - f;
                        if(dot(r - m_point, r - m_point) > 0.00001) {
                            m_edge = min(m_edge, dot(0.5 * (m_point + r), normalize(r - m_point)));
                        }
                    }
                }
                return vec4(sqrt(m_dist), m_edge, m_cell.x, m_cell.y);
            }
            
            void main() {
                vec2 uv = (vUv - 0.5) * (u_resolution.x / u_resolution.y);
                uv *= 2.5; 
                
                float t = u_time * 0.4;
                
                // Cognitive breach / Semantic rot: controlled math failure
                vec2 glitchUV = mix(uv, floor(uv * 12.0) / 12.0, 0.12 * smoothstep(0.7, 1.0, sin(t * 3.0)));
                
                // Organic Domain Warping (Chemotaxis gradients)
                vec2 q = vec2(fbm(glitchUV * 1.5 + t * 0.2), fbm(glitchUV * 1.5 - t * 0.3));
                vec2 r = vec2(fbm(glitchUV * 3.0 + q + t * 0.15), fbm(glitchUV * 3.0 - q - t * 0.1));
                vec2 warpedUV = glitchUV + r * 1.2;
                
                // Multi-scale Fungal Web
                vec4 vMacro = voronoi(warpedUV * 2.5, t);
                vec4 vMicro = voronoi(warpedUV * 6.0 + q, t * 1.5);
                
                // L-system inspired scale blending
                float scaleMask = smoothstep(0.3, 0.7, fbm(uv * 2.0 - t * 0.1));
                float edgeDist = mix(vMicro.y, vMacro.y, scaleMask);
                float cellDist = mix(vMicro.x, vMacro.x, scaleMask);
                vec2 cellId = mix(vMicro.zw, vMacro.zw, scaleMask);
                
                // --- LAYER 1: Iridescent Nutrient Agar (Thin-Film Structural Color) ---
                // No black allowed: Lightness (L) is kept high.
                float thickness = 300.0 + 700.0 * cellDist + 300.0 * r.x;
                float phase = thickness * 0.015 + t;
                vec3 gelLCh = vec3(
                    0.68 + 0.12 * sin(phase * 1.5),         // High lightness
                    0.28 + 0.06 * cos(phase * 2.5),         // High chroma
                    phase * 2.0 + cellId.x * 2.39996        // Golden angle hue distribution
                );
                vec3 gelColor = oklch_to_srgb(gelLCh);
                
                // --- LAYER 2: Enzymatic Decay Halo ---
                float hyphaeWidth = mix(0.06, 0.18, q.y);
                float haloMask = smoothstep(hyphaeWidth * 4.0, 0.0, edgeDist);
                // Complementary hue offset (PI radians)
                vec3 haloColor = oklch_to_srgb(vec3(0.85, 0.20, gelLCh.z + 3.14159));
                
                // --- LAYER 3: Fleshy / Gummy Mycelial Walls ---
                float hyphaeMask = smoothstep(hyphaeWidth, hyphaeWidth * 0.2, edgeDist);
                vec3 hyphaeLCh = vec3(
                    0.80 + 0.15 * fbm(uv * 15.0),           // Textured lightness
                    0.32,                                   // Max vividness
                    cellId.y * 2.39996 - t * 1.5            // Opposing hue spiral
                );
                vec3 hyphaeColor = oklch_to_srgb(hyphaeLCh);
                
                // --- LAYER 4: Bioluminescent Spores / Primordia ---
                float sporeMask = smoothstep(0.18, 0.0, cellDist) * smoothstep(0.3, 0.8, hash12(cellId));
                vec3 sporeLCh = vec3(
                    0.98,                                   // Blindingly bright
                    0.35,                                   // Neon saturation
                    cellId.x * cellId.y + t * 4.0           // Rapid color cycling
                );
                vec3 sporeColor = oklch_to_srgb(sporeLCh);
                
                // --- COMPOSITING ---
                vec3 finalColor = mix(gelColor, haloColor, haloMask * 0.6);
                finalColor = mix(finalColor, hyphaeColor, hyphaeMask);
                finalColor = mix(finalColor, sporeColor, sporeMask);
                
                // Add an overall microscopic structural interference sheen
                float pseudoNormal = fbm(uv * 25.0 + t);
                finalColor += 0.15 * oklch_to_srgb(vec3(0.9, 0.25, pseudoNormal * 15.0 - t * 2.0));
                
                // Enforce "No Black" constraint explicitly
                finalColor = max(finalColor, vec3(0.15, 0.05, 0.25)); 
                
                fragColor = vec4(finalColor, 1.0);
            }
        `;

        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            glslVersion: THREE.GLSL3,
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
    
    if (material && material.uniforms && material.uniforms.u_time) {
        material.uniforms.u_time.value = time;
        material.uniforms.u_resolution.value.set(grid.width, grid.height);
    }
    
    renderer.setSize(grid.width, grid.height, false);
    renderer.render(scene, camera);

} catch (e) {
    console.error("WebGL Initialization Failed:", e);
}