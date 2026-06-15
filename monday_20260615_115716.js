try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("Context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
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

            // --- Hash & Noise ---
            float hash21(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }

            vec2 hash22(vec2 p) {
                p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
                return fract(sin(p) * 43758.5453);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                float a = hash21(i);
                float b = hash21(i + vec2(1.0, 0.0));
                float c = hash21(i + vec2(0.0, 1.0));
                float d = hash21(i + vec2(1.0, 1.0));
                return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
            }

            float fbm(vec2 p) {
                float v = 0.0;
                float a = 0.5;
                mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
                for(int i = 0; i < 5; i++) {
                    v += a * noise(p);
                    p = rot * p * 2.0;
                    a *= 0.5;
                }
                return v;
            }

            // --- Complex Math ---
            vec2 cmul(vec2 a, vec2 b) {
                return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
            }

            // --- Color Systems (OKLab) ---
            vec3 oklch_to_oklab(vec3 c) {
                return vec3(c.x, c.y * cos(c.z), c.y * sin(c.z));
            }

            vec3 oklab_to_linear_srgb(vec3 c) {
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

            float lin2srgb(float x) {
                return x <= 0.0031308 ? x * 12.92 : 1.055 * pow(max(x, 0.0), 1.0 / 2.4) - 0.055;
            }

            vec3 toSRGB(vec3 c) {
                return vec3(lin2srgb(c.r), lin2srgb(c.g), lin2srgb(c.b));
            }

            // --- Structural Color ---
            vec3 thinFilm(float cosTheta, float thickness, float n) {
                float opd = 2.0 * n * thickness * sqrt(max(0.0, 1.0 - pow(sin(acos(cosTheta)) / n, 2.0)));
                vec3 phase = vec3(opd / 650.0, opd / 510.0, opd / 450.0) * PI * 2.0;
                return 0.5 + 0.5 * cos(phase + vec3(0.0, PI, PI)); 
            }

            void main() {
                vec2 uv = vUv * 2.0 - 1.0;
                uv.x *= u_resolution.x / u_resolution.y;
                
                // Anisotropic Rainblown Wind (Domain 15)
                vec2 windDir = normalize(vec2(1.0, -1.5));
                float storm = fbm(uv * 4.0 - windDir * u_time * 2.0);
                vec2 wind = windDir * storm * 0.3;
                
                // Base Coordinates
                vec2 z = uv * 1.5 + wind;
                vec2 c = vec2(-0.75, 0.1) + 0.05 * vec2(cos(u_time * 0.2), sin(u_time * 0.31));
                
                // Fractal Optics & Orbit Traps (Domain 10)
                float trap1 = 1e20;
                float trap2 = 1e20;
                float iter = 0.0;
                vec2 dz = vec2(1.0, 0.0);
                
                for(int i = 0; i < 60; i++) {
                    dz = 2.0 * cmul(z, dz) + vec2(1.0, 0.0);
                    z = cmul(z, z) + c;
                    
                    // Memphis Rhythms - periodic structural rupture
                    z += 0.015 * vec2(sin(z.y * 5.0 + u_time), cos(z.x * 5.0 - u_time));
                    
                    trap1 = min(trap1, abs(z.x + z.y));
                    trap2 = min(trap2, length(fract(z) - 0.5));
                    
                    if(dot(z, z) > 256.0) break;
                    iter++;
                }
                
                float smooth_iter = iter - log2(max(1.0, log2(dot(z, z)))) + 4.0;
                
                // 1970s Sci-Fi Hard Light Normal Mapping
                float hMap = trap1 * 0.6 + trap2 * 0.4 + storm * 0.1;
                vec3 N = normalize(vec3(dFdx(hMap), dFdy(hMap), 0.015));
                
                vec3 V = vec3(0.0, 0.0, 1.0);
                vec3 L = normalize(vec3(1.0, 1.0, 1.5));
                vec3 H = normalize(V + L);
                
                float NdotL = max(0.0, dot(N, L));
                float NdotV = max(0.0, dot(N, V));
                float NdotH = max(0.0, dot(N, H));
                
                // Crystalline Thin Film Iridescence
                float thickness = 200.0 + 500.0 * storm + 300.0 * trap2;
                vec3 irid = thinFilm(NdotV, thickness, 1.54);
                
                // Math Sequence Palette (Golden Angle)
                float hue = mod(smooth_iter * 137.5077 - u_time * 15.0, 360.0);
                vec3 oklch = vec3(0.65 + 0.1 * sin(smooth_iter), 0.22, hue * PI / 180.0);
                vec3 baseColor = toSRGB(oklab_to_linear_srgb(oklch_to_oklab(oklch)));
                
                // Blend Structural Color with Base Math Palette
                vec3 albedo = mix(baseColor, irid, 0.65);
                
                // Chrome Specular BRDF (1970s Sci-Fi)
                float spec = pow(NdotH, 48.0) * 1.5;
                vec3 finalCol = albedo * (NdotL * 0.6 + 0.4) + spec * vec3(1.0, 0.95, 0.85);
                
                // Iteration Bloom
                finalCol += vec3(1.0, 0.4, 0.8) * (0.015 / (trap1 + 0.01));
                
                // Memphis Confetti Storm Overlay
                vec2 conf_uv = uv * 12.0 - windDir * u_time * 4.0;
                vec2 cid = floor(conf_uv);
                vec2 cgv = fract(conf_uv) - 0.5;
                
                if(hash21(cid) > 0.92) {
                    float shapeType = hash21(cid + 1.0);
                    float dShape = 1e20;
                    
                    if(shapeType < 0.33) {
                        dShape = length(cgv) - 0.15; // Dot
                    } else if(shapeType < 0.66) {
                        vec2 d = abs(cgv) - vec2(0.12);
                        dShape = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); // Box
                    } else {
                        vec2 d1 = abs(cgv) - vec2(0.18, 0.05);
                        vec2 d2 = abs(cgv) - vec2(0.05, 0.18);
                        dShape = min(length(max(d1, 0.0)) + min(max(d1.x, d1.y), 0.0),
                                     length(max(d2, 0.0)) + min(max(d2.x, d2.y), 0.0)); // Cross
                    }
                    
                    // Rotate shape slightly
                    float rot = u_time * (hash21(cid) * 2.0 - 1.0);
                    mat2 rMat = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
                    cgv = rMat * cgv;
                    
                    float f = 1.0 - smoothstep(0.0, 0.02, dShape);
                    float outline = smoothstep(0.01, 0.03, dShape) * (1.0 - smoothstep(0.05, 0.07, dShape));
                    
                    vec3 conf_oklch = vec3(0.75, 0.25, hash21(cid + 2.0) * 360.0 * PI / 180.0);
                    vec3 conf_col = toSRGB(oklab_to_linear_srgb(oklch_to_oklab(conf_oklch)));
                    
                    // Shadow
                    float shadow = 1.0 - smoothstep(0.0, 0.1, dShape + 0.05);
                    finalCol = mix(finalCol, finalCol * 0.3, shadow * 0.6);
                    
                    finalCol = mix(finalCol, vec3(0.05), outline);
                    finalCol = mix(finalCol, conf_col, f);
                }
                
                // Rainblown Streaks (Foreground)
                float streaks = fbm(uv * vec2(20.0, 2.0) - windDir * u_time * 5.0);
                finalCol += vec3(0.8, 0.9, 1.0) * smoothstep(0.7, 0.95, streaks) * 0.4;
                
                // Vignette
                float vignette = length(vUv - 0.5);
                finalCol *= smoothstep(0.8, 0.2, vignette);
                
                fragColor = vec4(finalCol, 1.0);
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
        if (material.uniforms.u_resolution.value.x !== grid.width || 
            material.uniforms.u_resolution.value.y !== grid.height) {
            material.uniforms.u_resolution.value.set(grid.width, grid.height);
        }
    }
    
    renderer.setSize(grid.width, grid.height, false);
    renderer.render(scene, camera);

} catch (e) {
    console.error("WebGL initialization failed, falling back to 2D canvas context", e);
    
    // 2D Fallback if WebGL fails
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, grid.width, grid.height);
    
    const cx = grid.width / 2;
    const cy = grid.height / 2;
    
    for (let i = 0; i < 500; i++) {
        const t = time * 0.5 + i * 0.01;
        const r = i * 0.5;
        const x = cx + Math.cos(t * 137.5) * r * Math.sin(t);
        const y = cy + Math.sin(t * 137.5) * r * Math.cos(t);
        
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.1, (500 - i) * 0.02), 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${(i * 137.5) % 360}, 80%, 60%)`;
        ctx.fill();
    }
}