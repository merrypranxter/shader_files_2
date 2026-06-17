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
                gl_Position = vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            in vec2 vUv;
            out vec4 fragColor;

            uniform float u_time;
            uniform vec2 u_resolution;

            // --- ALCHEMICAL MATH & HASHES ---
            float hash1(float n) { return fract(sin(n) * 43758.5453123); }
            vec2 hash2(vec2 p) {
                p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
                return fract(sin(p) * 43758.5453);
            }

            // Value Noise
            float vnoise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                float a = hash1(i.x + i.y * 57.0);
                float b = hash1(i.x + 1.0 + i.y * 57.0);
                float c = hash1(i.x + (i.y + 1.0) * 57.0);
                float d = hash1(i.x + 1.0 + (i.y + 1.0) * 57.0);
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }

            // Fractal Brownian Motion (Domain Warping / Fungal Substrate)
            float fbm(vec2 p) {
                float v = 0.0; 
                float a = 0.5;
                for(int i = 0; i < 4; i++) {
                    v += a * vnoise(p);
                    p *= 2.0; 
                    a *= 0.5;
                }
                return v;
            }

            // --- COLOR SYSTEMS (OKLab / Perceptual Math) ---
            vec3 OKLab_to_linearSRGB(vec3 c) {
                float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
                float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
                float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
                float l = l_*l_*l_; 
                float m = m_*m_*m_; 
                float s = s_*s_*s_;
                return vec3(
                     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                );
            }

            vec3 linear_to_sRGB(vec3 c) {
                c = clamp(c, 0.0, 1.0);
                vec3 a = 1.055 * pow(c, vec3(1.0/2.4)) - 0.055;
                vec3 b = c * 12.92;
                b = clamp(b, 0.0, 1.0);
                return mix(a, b, step(c, vec3(0.0031308)));
            }

            vec3 OKLCh_to_sRGB(float L, float C, float h_deg) {
                float h_rad = h_deg * 3.14159265 / 180.0;
                vec3 lab = vec3(L, C * cos(h_rad), C * sin(h_rad));
                return linear_to_sRGB(OKLab_to_linearSRGB(lab));
            }

            // --- FUNGAL / DREAMTIME GEOMETRY ---
            float sdSegment(vec2 p, vec2 a, vec2 b) {
                vec2 pa = p - a, ba = b - a;
                float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0);
                return length(pa - ba*h);
            }

            // Generates nodes (Aethalia / Waterholes) via Golden Angle distribution + Orbit
            vec2 get_node(int i) {
                float fi = float(i);
                float r = 0.55 + 0.1 * sin(fi * 7.3);
                float theta = fi * 137.5077 * 3.14159 / 180.0; // Golden angle spread
                vec2 base = vec2(cos(theta), sin(theta)) * r;
                // Organic drift
                base += vec2(sin(u_time * 0.25 + fi), cos(u_time * 0.2 - fi)) * 0.15;
                return base;
            }

            void main() {
                vec2 uv = vUv * 2.0 - 1.0;
                uv.x *= u_resolution.x / u_resolution.y;
                
                // Slowly rotating manifold (The Motion Rule)
                float rot = u_time * 0.05;
                uv = vec2(uv.x * cos(rot) - uv.y * sin(rot), uv.x * sin(rot) + uv.y * cos(rot));

                // --- DISCRETE CELLULAR QUANTIZATION (The Dot Painting) ---
                // We quantize the continuous SDFs into a jittered grid of spores
                float dot_density = 65.0; 
                vec2 grid_uv = uv * dot_density;
                vec2 id = floor(grid_uv);
                vec2 f = fract(grid_uv) - 0.5;
                
                // Jitter breaks the rigid grid, creating a hand-painted / organic swarm feel
                vec2 jitter = (hash2(id) - 0.5) * 0.5;
                vec2 dot_center_uv = (id + 0.5 + jitter) / dot_density;

                // --- EVALUATE CONTINUOUS FUNGAL LANDSCAPE AT DOT CENTER ---
                float track_dist = 1e10;
                float ring_val = 0.0;
                float active_hue = 0.0;
                float ring_hue = 0.0;
                
                const int NUM_NODES = 8;
                
                for(int i = 0; i < NUM_NODES; i++) {
                    vec2 p1 = get_node(i);
                    vec2 p2 = get_node((i + 1) % NUM_NODES);
                    vec2 p3 = get_node((i + 2) % NUM_NODES); // Anastomosis (cross-connections)
                    
                    // 1. Rhizomorph Tracks (Dreaming Paths)
                    vec2 dir = normalize(p2 - p1);
                    vec2 perp = vec2(-dir.y, dir.x);
                    float t = clamp(dot(dot_center_uv - p1, dir) / length(p2 - p1), 0.0, 1.0);
                    
                    // Meandering / Slime Mold Pathfinding
                    float meander = sin(t * 15.0 + u_time * 1.5 + float(i)) * 0.03;
                    meander += fbm(dot_center_uv * 6.0 - u_time * 0.3) * 0.04;
                    
                    float d = sdSegment(dot_center_uv - perp * meander, p1, p2);
                    
                    // Secondary Anastomosis Track
                    float d2 = sdSegment(dot_center_uv, p1, p3) + fbm(dot_center_uv * 10.0) * 0.02;

                    d = min(d, d2 + 0.015); // Cross tracks are slightly thinner

                    if(d < track_dist) {
                        track_dist = d;
                        active_hue = float(i) * 137.5077; // Golden Angle palette
                    }
                    
                    // 2. Aethalia Rings (Waterholes / Sclerotia)
                    float d_node = length(dot_center_uv - p1);
                    // Organic fractal edge distortion
                    d_node += fbm(dot_center_uv * 20.0 + u_time * 0.4) * 0.02;
                    
                    // Concentric rings (5 rings per node)
                    float r = smoothstep(0.012, 0.0, abs(mod(d_node, 0.04) - 0.02)) * smoothstep(0.22, 0.18, d_node);
                    if(r > ring_val) {
                        ring_val = r;
                        ring_hue = float(i) * 137.5077 + 60.0;
                    }
                }

                // --- RESOLVE DOT COLOR & SIZE (The Wet Engine) ---
                float is_track = smoothstep(0.012, 0.004, track_dist);
                float is_track_border = smoothstep(0.025, 0.012, track_dist) - is_track;
                
                vec3 dot_color = vec3(0.0);
                float dot_radius = 0.0;
                
                float noise_val = fbm(dot_center_uv * 3.0 + u_time * 0.1);

                if (ring_val > 0.1) {
                    // Concentric Rings (Vivid Neon Celebration)
                    dot_color = OKLCh_to_sRGB(0.85, 0.22, ring_hue - u_time * 20.0);
                    dot_radius = 0.45;
                } else if (is_track > 0.1) {
                    // Central Rhizomorph Cords
                    dot_color = OKLCh_to_sRGB(0.9, 0.25, active_hue + u_time * 30.0);
                    dot_radius = 0.42;
                } else if (is_track_border > 0.1) {
                    // Dark Complementary Border (Visual Tension)
                    dot_color = OKLCh_to_sRGB(0.4, 0.15, active_hue + 180.0);
                    dot_radius = 0.35;
                } else {
                    // Infill (Spores / Plasmodium spreading across the country)
                    dot_color = OKLCh_to_sRGB(0.5 + noise_val * 0.3, 0.18, noise_val * 360.0 + u_time * 10.0);
                    dot_radius = 0.15 + noise_val * 0.25;
                    
                    // Lacunarity / Natural Spore Dusting
                    if (hash1(id.x * 17.3 + id.y * 31.7) > 0.45 + noise_val * 0.4) {
                        dot_radius = 0.0; // Empty space
                    }
                }

                // Draw the physical dot
                float dot_shape = smoothstep(dot_radius, dot_radius * 0.7, length(f - jitter));
                
                // The Void / Deep Earth (Night Fire Palette base)
                vec3 bg_color = vec3(0.07, 0.02, 0.03); 
                
                fragColor = vec4(mix(bg_color, dot_color, dot_shape), 1.0);
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
        if (material.uniforms.u_time) material.uniforms.u_time.value = time;
        if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(grid.width, grid.height);
    }

    renderer.setSize(grid.width, grid.height, false);
    renderer.render(scene, camera);

} catch (e) {
    console.error("WebGL Initialization Failed:", e);
}