export function render(ctx, grid, time, repos, input, mouse, canvas, THREE) {
    if (!canvas.__three) {
        try {
            if (!ctx) throw new Error("WebGL 2 context not available");
            
            const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
            const scene = new THREE.Scene();
            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            
            const material = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_time: { value: 0 },
                    u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                    u_mouse: { value: new THREE.Vector2(0.5, 0.5) }
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
                    precision highp int;

                    in vec2 vUv;
                    out vec4 fragColor;

                    uniform float u_time;
                    uniform vec2 u_resolution;
                    uniform vec2 u_mouse;

                    #define PI 3.14159265359
                    #define TAU 6.28318530718

                    // --- CORE MATH & NOISE ---
                    float hash12(vec2 p) {
                        vec3 p3  = fract(vec3(p.xyx) * .1031);
                        p3 += dot(p3, p3.yzx + 33.33);
                        return fract((p3.x + p3.y) * p3.z);
                    }

                    vec2 hash22(vec2 p) {
                        vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
                        p3 += dot(p3, p3.yzx+33.33);
                        return fract((p3.xx+p3.yz)*p3.zy);
                    }

                    float fbm(vec2 p) {
                        float f = 0.0;
                        float amp = 0.5;
                        mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
                        for(int i=0; i<5; i++) {
                            vec2 i_p = floor(p);
                            vec2 f_p = fract(p);
                            vec2 u = f_p*f_p*(3.0-2.0*f_p);
                            float a = hash12(i_p + vec2(0.0,0.0));
                            float b = hash12(i_p + vec2(1.0,0.0));
                            float c = hash12(i_p + vec2(0.0,1.0));
                            float d = hash12(i_p + vec2(1.0,1.0));
                            float n = mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
                            f += amp * n;
                            p = rot * p * 2.0;
                            amp *= 0.5;
                        }
                        return f;
                    }

                    // --- STRUCTURAL ENGINES ---
                    
                    // 1. Phosphene Field / Cortical Dipole Mapping
                    vec2 cortical_dipole(vec2 uv, float a, float b) {
                        vec2 za = uv + vec2(a, 0.0);
                        vec2 zb = uv + vec2(b, 0.0);
                        float denom = dot(zb, zb) + 1e-9;
                        vec2 q = vec2(dot(za, zb), za.y * zb.x - za.x * zb.y) / denom;
                        float r = max(dot(q, q), 1e-12);
                        return vec2(0.5 * log(r), atan(q.y, q.x));
                    }

                    // 2. Kaleidoscope Engine / Dihedral Symmetry Fold
                    vec2 kal_fold(vec2 p, float n, float rot) {
                        float r = length(p);
                        float a = atan(p.y, p.x) + rot;
                        float sector = TAU / n;
                        a = mod(a, sector);
                        a = min(a, sector - a);
                        return r * vec2(cos(a), sin(a));
                    }

                    // 3. Opal Bragg Diffraction / Voronoi Tissue
                    vec4 voronoi(vec2 x) {
                        vec2 n = floor(x);
                        vec2 f = fract(x);
                        float m_dist = 8.0;
                        vec2 m_point = vec2(0.0);
                        vec2 m_id = vec2(0.0);
                        for(int j=-1; j<=1; j++) {
                            for(int i=-1; i<=1; i++) {
                                vec2 g = vec2(float(i), float(j));
                                vec2 o = hash22(n + g);
                                o = 0.5 + 0.5*sin(u_time * 0.5 + TAU*o); // Living cell wobble
                                vec2 r = g + o - f;
                                float d = dot(r,r);
                                if(d < m_dist) {
                                    m_dist = d;
                                    m_point = r;
                                    m_id = n + g;
                                }
                            }
                        }
                        return vec4(sqrt(m_dist), m_point.x, m_point.y, hash12(m_id));
                    }

                    // 4. I Ching Sandpile / Cellular Automata
                    float i_ching_sandpile(vec2 p) {
                        ivec2 ip = ivec2(abs(p));
                        int v = (ip.x ^ ip.y) & ((ip.x | ip.y) % 64);
                        int moving = int(u_time * 3.0) % 64; // Changing lines
                        v ^= moving;
                        return float(v % 8) / 7.0;
                    }

                    // 5. Glitchcore Text Debris / Terminal Ghosting
                    float text_debris(vec2 p) {
                        vec2 grid = floor(p * vec2(30.0, 50.0));
                        vec2 uv = fract(p * vec2(30.0, 50.0));
                        float n = hash12(grid);
                        float char_active = step(0.4, hash12(grid + floor(u_time * 4.0) * 0.01));
                        
                        // 3x5 matrix font proxy
                        vec2 puv = floor(uv * vec2(3.0, 5.0));
                        float px = step(0.4, hash12(grid * 13.0 + puv));
                        
                        // Horizontal interference banding
                        float band = step(0.8, fbm(vec2(0.0, grid.y * 0.1 + u_time * 0.2)));
                        float visibility = step(0.7, n) * band; 
                        
                        return px * char_active * visibility;
                    }

                    // --- COLOR SYSTEMS ---
                    
                    // Maximalist Acid Candy Palette (Color Cycling)
                    vec3 acid_palette(float t) {
                        // Base cosine palette: hits pinks, cyans, violets
                        vec3 a = vec3(0.5, 0.5, 0.5);
                        vec3 b = vec3(0.5, 0.5, 0.5);
                        vec3 c = vec3(1.0, 1.0, 1.0);
                        vec3 d = vec3(0.00, 0.33, 0.67);
                        vec3 col = a + b * cos(TAU * (c * t + d));
                        
                        col = smoothstep(0.1, 0.9, col);
                        
                        // Acid green / Neon yellow structural spikes
                        float acid = pow(sin(t * TAU * 3.0) * 0.5 + 0.5, 6.0);
                        col = mix(col, vec3(0.8, 1.0, 0.0), acid * 0.6);
                        
                        // Hot pink / Magenta hyperpop punctures
                        float hot = pow(cos(t * TAU * 5.0) * 0.5 + 0.5, 8.0);
                        col = mix(col, vec3(1.0, 0.0, 0.6), hot * 0.7);
                        
                        // Prism dispersion white-hot highlights
                        float flash = pow(sin(t * TAU * 11.0) * 0.5 + 0.5, 20.0);
                        col += vec3(1.0) * flash;
                        
                        return col;
                    }

                    // --- THE SOUP ENGINE ---
                    
                    // Evaluates the entire liquefied repository stack at a point in space and time
                    vec3 sample_soup(vec2 p, float t_offset) {
                        float t = u_time + t_offset;
                        
                        // Glitchcore / Datamosh (Macroblock Chew)
                        vec2 block = floor(p * 12.0) / 12.0;
                        if (hash12(block + floor(t * 4.0)) > 0.85) {
                            p += (hash22(block) - 0.5) * 0.15;
                        }
                        
                        // Phosphene Cortical Dipole Mapping
                        vec2 dp = cortical_dipole(p * 0.5, 0.1, 1.5);
                        
                        // Kaleidoscope Dihedral Fold (D_8 symmetry)
                        dp = kal_fold(dp, 8.0, t * 0.05);
                        
                        // Glitch Textiles / Tension Chaos Warp
                        dp.x += fbm(dp * 4.0 + t) * 0.1;
                        dp.y += fbm(dp * 4.0 - t) * 0.1;
                        
                        // I Ching Sandpile (Fractal Cellular Automata)
                        float sand = i_ching_sandpile(dp * 40.0 - t * 1.5);
                        
                        // Opal Voronoi Bragg Domains
                        vec4 v = voronoi(dp * 6.0 + sand * 2.0);
                        float bragg = sin(v.w * 30.0 + t * 4.0);
                        
                        // Text Debris Contamination
                        float txt = text_debris(p * 2.0 + dp);
                        
                        // Color Cycling / Indexed Palette Lookup
                        float idx = fract(v.x * 2.0 + fbm(dp * 5.0) * 0.5 + bragg * 0.2 + txt * 0.4);
                        vec3 color = acid_palette(idx);
                        
                        // Bitrot Lace / Dropped Thread (Analog Video Damage)
                        float drop = step(0.98, hash12(vec2(floor(p.y * 150.0), floor(t * 10.0))));
                        color = mix(color, vec3(0.02, 0.0, 0.05), drop);
                        
                        // Phosphor Bloom / Halation on cell edges
                        float edge = smoothstep(0.0, 0.05, v.x);
                        color += acid_palette(fract(idx + 0.5)) * edge * 0.6;
                        
                        // Moiré Interference Phase Fields
                        float moire = sin(dp.x * 80.0) * sin(dp.y * 80.0);
                        color = mix(color, vec3(0.05, 0.0, 0.15), smoothstep(0.8, 1.0, moire) * 0.5);
                        
                        return color;
                    }

                    void main() {
                        vec2 uv = vUv;
                        vec2 p = uv * 2.0 - 1.0;
                        p.x *= u_resolution.x / u_resolution.y;
                        
                        // Global camera zoom and pan
                        p *= 1.1 + 0.15 * sin(u_time * 0.15);
                        p += vec2(sin(u_time * 0.1), cos(u_time * 0.12)) * 0.3;
                        
                        // Mouse interaction warp
                        vec2 m = u_mouse * 2.0 - 1.0;
                        m.x *= u_resolution.x / u_resolution.y;
                        p += m * 0.1 * smoothstep(1.0, 0.0, length(p - m));
                        
                        // --- COMPOSITING ---
                        // Chromatic Aberration & Temporal Echo Loop (RGB Phantom / Ghost Frame)
                        // This seamlessly blends spatial prism dispersion with temporal afterimages.
                        vec3 final_color = vec3(0.0);
                        float samples = 3.0;
                        for(float i = 0.0; i < samples; i++) {
                            // Temporal offset (Ghost Frame / Afterimage)
                            float t_off = -i * 0.06;
                            // Spatial offset (Prism Dispersion / Chromatic Shift)
                            vec2 p_off = p * (1.0 + i * 0.02);
                            
                            vec3 c = sample_soup(p_off, t_off);
                            
                            // Channel Split
                            if (i == 0.0) final_color.r += c.r;
                            if (i == 1.0) final_color.g += c.g;
                            if (i == 2.0) final_color.b += c.b;
                        }
                        
                        // Print Artifacts: Halftone Screen (Psychedelic Collage / Xerox)
                        float luma = dot(final_color, vec3(0.299, 0.587, 0.114));
                        vec2 ht_uv = mat2(0.707, -0.707, 0.707, 0.707) * (uv * 400.0);
                        vec2 cell = fract(ht_uv) - 0.5;
                        float dot_rad = sqrt(1.0 - luma) * 0.5;
                        float ht = smoothstep(dot_rad + 0.08, dot_rad - 0.08, length(cell));
                        
                        // Blend Halftone as a subtle CMYK misregistration feel
                        final_color = mix(final_color * 0.6, final_color, ht * 0.8 + 0.2);
                        
                        // Vignette (Op Art / Optical Surrealism depth cue)
                        float vig = 1.0 - 0.3 * dot(p, p);
                        final_color *= vig;
                        
                        // ACES Tonemapping (Photochemical Film Simulation)
                        final_color = clamp((final_color * (2.51 * final_color + 0.03)) / (final_color * (2.43 * final_color + 0.59) + 0.14), 0.0, 1.0);
                        
                        // sRGB Gamma correction
                        final_color = pow(final_color, vec3(1.0 / 2.2));

                        fragColor = vec4(final_color, 1.0);
                    }
                `
            });
            
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
            scene.add(mesh);
            
            canvas.__three = { renderer, scene, camera, material };
        } catch (e) {
            console.error("WebGL Init Failed:", e);
            throw e;
        }
    }
    
    const { renderer, scene, camera, material } = canvas.__three;
    if (material && material.uniforms && material.uniforms.u_time) {
        material.uniforms.u_time.value = time;
        material.uniforms.u_resolution.value.set(grid.width, grid.height);
        material.uniforms.u_mouse.value.set(
            mouse.x / grid.width, 
            1.0 - (mouse.y / grid.height) // Flip Y for WebGL coordinates
        );
    }
    
    renderer.setSize(grid.width, grid.height, false);
    renderer.render(scene, camera);
}