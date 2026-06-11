if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
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
                uniform float u_time;
                uniform vec2 u_resolution;

                // --- Noise & Math ---
                float hash1(float n) { return fract(sin(n) * 43758.5453123); }
                float hash21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
                               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
                }

                // --- Op-Art Zeno Tunnel ---
                vec3 opArtLayer(vec2 p, float t) {
                    float r = length(p);
                    float a = atan(p.y, p.x);
                    
                    // Infinite descent subdivision
                    float z = 0.5 / (r + 0.01) + t * 3.0;
                    float th = a * 5.0 / 3.14159 + sin(z * 0.2 + t); // Twist
                    
                    float chk = mod(floor(z) + floor(th), 2.0);
                    return vec3(chk);
                }

                // --- MySpace Motifs ---
                float heart(vec2 p, vec2 center, float size) {
                    p = (p - center) / size;
                    p.y -= 0.2; 
                    p.x *= 1.2; 
                    float x2 = p.x * p.x;
                    float y2 = p.y * p.y;
                    float val = x2 + y2 - 1.0;
                    return step(val * val * val - x2 * y2 * p.y, 0.0);
                }

                float star(vec2 p, vec2 center, float size) {
                    p = (p - center) / size;
                    float a = atan(p.x, p.y);
                    float r = length(p);
                    float m = abs(mod(a, 1.2566) - 0.6283);
                    float d = r * cos(m - 0.3);
                    return step(d, 0.2);
                }

                float sparkle(vec2 p, vec2 center, float size, float t) {
                    p = (p - center) / size;
                    float d = length(p);
                    float cross1 = max(0.0, 1.0 - abs(p.x)*15.0) * max(0.0, 1.0 - abs(p.y)*15.0);
                    float cross2 = max(0.0, 1.0 - abs(p.x+p.y)*10.0) * max(0.0, 1.0 - abs(p.x-p.y)*10.0);
                    return (cross1 + cross2) * smoothstep(1.0, 0.0, d) * (0.5 + 0.5 * sin(t));
                }

                // --- UI Artifacts ---
                vec4 errorWindow(vec2 p, vec2 center, float t) {
                    vec2 size = vec2(0.35, 0.2);
                    vec2 d = abs(p - center) - size;
                    if (max(d.x, d.y) < 0.0) {
                        vec3 col = vec3(0.75, 0.75, 0.8);
                        
                        // Fake 90s Bevel
                        if (p.x > center.x + size.x - 0.02 || p.y < center.y - size.y + 0.02) col *= 0.5;
                        if (p.x < center.x - size.x + 0.02 || p.y > center.y + size.y - 0.02) col *= 1.3;
                        
                        // Title bar
                        if (p.y > center.y + size.y - 0.05) {
                            col = vec3(0.0, 0.0, 0.6); 
                            // Red X button
                            if (p.x > center.x + size.x - 0.05 && p.x < center.x + size.x - 0.01 &&
                                p.y > center.y + size.y - 0.04 && p.y < center.y + size.y - 0.01) {
                                col = vec3(0.8, 0.1, 0.1);
                            }
                        } else {
                            // Text lines (Ransom note / broken font logic)
                            if (p.y < center.y + 0.05 && p.y > center.y - 0.1 && abs(p.x - center.x) < 0.25) {
                                float line_y = fract((p.y - center.y) * 15.0);
                                float line_id = floor((p.y - center.y) * 15.0);
                                if (line_y > 0.3 && hash1(line_id + floor(p.x * 12.0)) > 0.3) {
                                    col = vec3(0.0);
                                }
                            }
                            // OK Button
                            if (p.y < center.y - 0.12 && p.y > center.y - 0.18 && abs(p.x - center.x) < 0.1) {
                                col = vec3(0.85);
                                if (abs(p.x - center.x) > 0.09 || p.y < center.y - 0.17) col *= 0.5;
                                if (abs(p.x - center.x) < 0.09 && p.y > center.y - 0.13) col *= 1.2;
                            }
                        }
                        return vec4(col, 1.0);
                    }
                    return vec4(0.0);
                }

                void main() {
                    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
                    vec2 p = (vUv - 0.5) * aspect;
                    float t = u_time;
                    
                    // --- Tracking Tear & Glitch Geometry ---
                    vec2 g_uv = p;
                    if (hash1(floor(t * 8.0)) > 0.85) {
                        if (sin(vUv.y * 30.0 + t * 40.0) > 0.8) {
                            g_uv.x += 0.05 * hash1(vUv.y);
                        }
                    }
                    
                    // Macroblocking
                    float block = floor(vUv.y * 12.0) + floor(vUv.x * 12.0);
                    if (hash1(block + floor(t * 6.0)) > 0.95) {
                        g_uv += vec2(0.08, -0.05);
                    }
                    
                    // Chromatic Aberration
                    float r_shift = 0.015 * sin(t * 15.0);
                    float b_shift = -0.015 * cos(t * 18.0);
                    if (hash1(t * 3.0) > 0.9) { r_shift = 0.08; b_shift = -0.08; }
                    
                    // --- Render Base Op-Art ---
                    vec3 col = vec3(0.0);
                    col.r = opArtLayer(g_uv + vec2(r_shift, 0.0), t).r;
                    col.g = opArtLayer(g_uv, t).g;
                    col.b = opArtLayer(g_uv + vec2(b_shift, 0.0), t).b;
                    
                    // --- Acid Cyberdelic Tinting ---
                    vec3 acidPink = vec3(1.0, 0.1, 0.8);
                    vec3 acidCyan = vec3(0.0, 1.0, 0.9);
                    vec3 acidLime = vec3(0.7, 1.0, 0.0);
                    
                    float colorZone = noise(g_uv * 3.0 + t * 0.5);
                    vec3 acidTint = mix(acidPink, acidCyan, smoothstep(0.3, 0.7, colorZone));
                    acidTint = mix(acidTint, acidLime, smoothstep(0.4, 0.6, noise(g_uv * 4.0 - t)));
                    
                    // Tint the white parts of the checkerboard to create chromatic interference
                    col = mix(col, col * acidTint * 1.8, 0.7);

                    // --- Stars ---
                    for (int i = 0; i < 6; i++) {
                        float st = t * (0.4 + float(i)*0.05) + float(i)*2.7;
                        vec2 s_pos = vec2(cos(st)*0.8, sin(st*0.7)*0.6) * aspect;
                        if (star(g_uv, s_pos, 0.08 + 0.03*sin(t+float(i))) > 0.5) {
                            vec3 s_col = mix(acidLime, acidCyan, hash1(float(i)*1.5));
                            float glit = hash21(floor(g_uv * 150.0) - floor(t * 10.0));
                            s_col *= (0.8 + 0.6 * step(0.7, glit)); // Glitter logic
                            col = mix(col, s_col, 0.95);
                        }
                    }

                    // --- Hearts ---
                    for (int i = 0; i < 6; i++) {
                        float ht = t * (0.5 + float(i)*0.1) + float(i)*1.3;
                        vec2 h_pos = vec2(sin(ht)*0.7, cos(ht*0.9)*0.5) * aspect;
                        if (heart(g_uv, h_pos, 0.1 + 0.04*sin(t+float(i))) > 0.5) {
                            vec3 h_col = mix(acidPink, vec3(1.0, 0.2, 0.2), hash1(float(i)));
                            float glit = hash21(floor(g_uv * 200.0) + floor(t * 15.0));
                            h_col *= (0.7 + 0.6 * step(0.75, glit));
                            col = mix(col, h_col, 0.95);
                        }
                    }
                    
                    // --- Windows Error Cascade ---
                    float cascade_t = mod(t * 6.0, 25.0);
                    for (int i = 0; i < 25; i++) {
                        if (float(i) > cascade_t) break;
                        vec2 w_pos = vec2(-0.5 * aspect.x + float(i)*0.06, 0.5 - float(i)*0.06);
                        vec4 w_col = errorWindow(g_uv, w_pos, t);
                        if (w_col.a > 0.5) {
                            col = w_col.rgb;
                            // Occasional glitch inside window
                            if (hash1(float(i) + t * 2.0) > 0.97) col.gb *= 0.2;
                        }
                    }
                    
                    // --- Blingee Sparkles ---
                    for (int i = 0; i < 20; i++) {
                        float st = t + float(i) * 2.1;
                        vec2 sp_pos = vec2(hash1(float(i))-0.5, hash1(float(i)+10.0)-0.5) * 2.5;
                        sp_pos.y -= st * 0.3; 
                        sp_pos = mod(sp_pos + 1.0, 2.0) - 1.0;
                        sp_pos *= aspect;
                        
                        float sp = sparkle(g_uv, sp_pos, 0.08, st * 6.0);
                        col += sp * mix(vec3(1.0), acidPink, hash1(float(i)*3.0));
                    }
                    
                    // --- VHS Overlay ---
                    col *= 1.0 - 0.15 * sin(vUv.y * u_resolution.y * 3.14159); // Scanlines
                    col += 0.08 * hash21(vUv * t); // Noise
                    
                    // Vignette
                    col *= 1.0 - pow(length(vUv - 0.5) * 1.4, 3.0);
                    
                    fragColor = vec4(col, 1.0);
                }
            `
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);
        canvas.__three = { renderer, scene, camera, material };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        return;
    }
}

const { renderer, scene, camera, material } = canvas.__three;
if (material && material.uniforms) {
    if (material.uniforms.u_time) material.uniforms.u_time.value = time;
    if (material.uniforms.u_resolution) {
        material.uniforms.u_resolution.value.set(grid.width, grid.height);
    }
}
renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);