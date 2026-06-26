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

                in vec2 vUv;
                out vec4 fragColor;

                uniform float u_time;
                uniform vec2 u_resolution;
                uniform vec2 u_mouse;

                // Simple hash and noise for low-power glitch effects
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    float a = hash(i);
                    float b = hash(i + vec2(1.0, 0.0));
                    float c = hash(i + vec2(0.0, 1.0));
                    float d = hash(i + vec2(1.0, 1.0));
                    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
                }

                // Candy Neon Spectral Palette
                vec3 neon_palette(float t) {
                    t = fract(t);
                    vec3 c1 = vec3(1.0, 0.0, 0.6); // Hot pink
                    vec3 c2 = vec3(0.0, 1.0, 0.9); // Cyan
                    vec3 c3 = vec3(0.8, 1.0, 0.0); // Acid Green
                    vec3 c4 = vec3(0.4, 0.0, 1.0); // Violet
                    
                    float f = fract(t * 4.0);
                    if(t < 0.25) return mix(c1, c2, f);
                    if(t < 0.50) return mix(c2, c3, f);
                    if(t < 0.75) return mix(c3, c4, f);
                    return mix(c4, c1, f);
                }

                // Subordinate mesh gradient background
                vec3 mesh_bg(vec2 uv) {
                    vec2 p1 = vec2(0.2 + sin(u_time)*0.1, 0.3 + cos(u_time)*0.1);
                    vec2 p2 = vec2(0.8 + cos(u_time*1.2)*0.1, 0.7 + sin(u_time*0.8)*0.1);
                    vec2 p3 = vec2(0.5 + sin(u_time*0.7)*0.2, 0.9 + cos(u_time*0.9)*0.1);
                    
                    float w1 = 1.0 / (length(uv - p1) + 0.1);
                    float w2 = 1.0 / (length(uv - p2) + 0.1);
                    float w3 = 1.0 / (length(uv - p3) + 0.1);
                    
                    vec3 c1 = neon_palette(0.1 + u_time * 0.05);
                    vec3 c2 = neon_palette(0.5 + u_time * 0.05);
                    vec3 c3 = neon_palette(0.9 + u_time * 0.05);
                    
                    return (c1*w1 + c2*w2 + c3*w3) / (w1 + w2 + w3) * 0.25; 
                }

                void main() {
                    vec2 uv = vUv;
                    float aspect = u_resolution.x / u_resolution.y;
                    
                    // 1. Datamosh ripple offset (triggers every 10s)
                    float moshtime = mod(u_time, 10.0);
                    if(moshtime > 8.5) {
                        float m_amt = smoothstep(8.5, 10.0, moshtime);
                        vec2 grid = floor(uv * 20.0) / 20.0;
                        uv.x += noise(grid * 15.0 + vec2(u_time, 0.0)) * 0.05 * m_amt;
                        uv.y += noise(grid * 20.0 - vec2(0.0, u_time)) * 0.05 * m_amt;
                    }
                    
                    // 2. Analog VHS tracking bends
                    uv.x += sin(uv.y * 10.0 + u_time * 5.0) * 0.002;
                    if(uv.y > 0.9) {
                        uv.x += (noise(vec2(uv.y * 50.0, u_time * 10.0)) - 0.5) * 0.02;
                    }

                    vec2 p = uv * 2.0 - vec2(1.0, 1.0);
                    p.x *= aspect;
                    
                    // 3. Define structural regions (Mandelbrot + Portals)
                    int f_type = 0; 
                    vec2 c_val = vec2(0.0, 0.0);
                    vec2 z_val = vec2(0.0, 0.0);
                    
                    // Main Mandelbrot breathing zoom (Seahorse Valley target)
                    float zt = mod(u_time * 0.08, 1.0);
                    float ease_zt = zt * zt * (3.0 - 2.0 * zt);
                    float zoom = pow(0.001, ease_zt) * 2.5; 
                    vec2 center = vec2(-0.743643887037151, 0.131825904205330); 
                    
                    // Subtle mouse influence
                    center += (u_mouse * 2.0 - vec2(1.0, 1.0)) * 0.03 * zoom;
                    vec2 m_c = center + p * zoom;
                    
                    // Portal coordinates (adapt to aspect ratio)
                    float portal_r = min(0.35, aspect * 0.4);
                    vec2 tl = vec2(-aspect * 0.7, 0.6);
                    vec2 tr = vec2(aspect * 0.7, 0.6);
                    vec2 bl = vec2(-aspect * 0.7, -0.6);
                    vec2 br = vec2(aspect * 0.7, -0.6);
                    
                    float d_tl = length(p - tl);
                    float d_tr = length(p - tr);
                    float d_bl = length(p - bl);
                    float d_br = length(p - br);
                    
                    float trap = 1000.0;
                    
                    if (d_tl < portal_r) {
                        f_type = 1; // Julia Set
                        z_val = (p - tl) * 2.5 / portal_r;
                        c_val = center + 0.05 * vec2(cos(u_time), sin(u_time)); 
                    } else if (d_tr < portal_r) {
                        f_type = 1; // Julia Set
                        z_val = (p - tr) * 2.5 / portal_r;
                        c_val = center + 0.05 * vec2(sin(u_time), cos(u_time)); 
                    } else if (d_bl < portal_r) {
                        f_type = 2; // Burning Ship
                        c_val = vec2(-1.75, -0.04) + (p - bl) * 0.15 / portal_r;
                        z_val = vec2(0.0, 0.0);
                    } else if (d_br < portal_r) {
                        f_type = 2; // Burning Ship
                        c_val = vec2(-1.75, -0.04) + (p - br) * 0.15 / portal_r;
                        z_val = vec2(0.0, 0.0);
                    } else {
                        f_type = 0; // Mandelbrot
                        c_val = m_c;
                        z_val = vec2(0.0, 0.0);
                    }
                    
                    // 4. Low-Power Fractal Iteration (Max 75 to keep warp safe)
                    const int MAX_ITER = 75;
                    float smooth_iter = 0.0;
                    
                    if (f_type == 0) { 
                        for(int i=0; i<MAX_ITER; i++) {
                            z_val = vec2(z_val.x*z_val.x - z_val.y*z_val.y, 2.0*z_val.x*z_val.y) + c_val;
                            trap = min(trap, length(z_val - vec2(0.5, 0.0))); 
                            if(dot(z_val, z_val) > 16.0) {
                                smooth_iter = float(i) + 1.0 - log2(log2(dot(z_val,z_val)));
                                break;
                            }
                        }
                    } else if (f_type == 1) { 
                        for(int i=0; i<MAX_ITER; i++) {
                            z_val = vec2(z_val.x*z_val.x - z_val.y*z_val.y, 2.0*z_val.x*z_val.y) + c_val;
                            trap = min(trap, abs(z_val.x) + abs(z_val.y)); 
                            if(dot(z_val, z_val) > 16.0) {
                                smooth_iter = float(i) + 1.0 - log2(log2(dot(z_val,z_val)));
                                break;
                            }
                        }
                    } else { 
                        for(int i=0; i<MAX_ITER; i++) {
                            z_val = vec2(abs(z_val.x), abs(z_val.y));
                            z_val = vec2(z_val.x*z_val.x - z_val.y*z_val.y, 2.0*z_val.x*z_val.y) + c_val;
                            trap = min(trap, max(abs(z_val.x), abs(z_val.y))); 
                            if(dot(z_val, z_val) > 16.0) {
                                smooth_iter = float(i) + 1.0 - log2(log2(dot(z_val,z_val)));
                                break;
                            }
                        }
                    }
                    
                    // 5. Coloring & Optics
                    vec3 col = vec3(0.0, 0.0, 0.0);
                    
                    if (smooth_iter > 0.0) {
                        float t = smooth_iter / float(MAX_ITER);
                        vec3 frac_col = neon_palette(t * 4.0 - u_time * 0.3);
                        
                        // Domain coloring contour bands
                        float mag = log(length(z_val));
                        float contour = fract(mag * 4.0 - u_time * 2.0);
                        frac_col *= 0.6 + 0.4 * contour;
                        
                        // Structural color / thin-film diffraction on recursive edges
                        float diff = fract(smooth_iter * 0.15 + u_time * 0.8);
                        frac_col += neon_palette(diff) * 0.5 * exp(-trap * 5.0);
                        
                        vec3 bg_col = mesh_bg(uv);
                        col = mix(bg_col, frac_col, clamp(t * 10.0, 0.0, 1.0));
                    } else {
                        // Interior shading
                        float phase = atan(z_val.y, z_val.x) / 6.28318 + 0.5;
                        col = neon_palette(phase * 3.0 + u_time * 0.2) * 0.15; 
                        col += vec3(1.0, 0.8, 0.2) * exp(-trap * 8.0); // Orbit trap core glow
                    }
                    
                    // Glowing Portal Borders
                    float d_min = min(min(d_tl, d_tr), min(d_bl, d_br));
                    float border = abs(d_min - portal_r);
                    col += neon_palette(u_time * 0.5 + d_min * 2.0) * exp(-border * 45.0);
                    
                    // 6. Post Effects
                    float r_dist = length(vUv - vec2(0.5, 0.5));
                    
                    // Fake Chromatic Aberration via luminance-shifted palette sampling
                    float ca_amt = r_dist * 0.015 * (1.0 + 0.5 * sin(u_time * 3.0));
                    vec3 ca_shift = vec3(
                        neon_palette(smooth_iter / float(MAX_ITER) + ca_amt).r,
                        col.g,
                        neon_palette(smooth_iter / float(MAX_ITER) - ca_amt).b
                    );
                    col = mix(col, ca_shift, smoothstep(0.4, 0.9, r_dist));
                    
                    // VHS Scanlines
                    col -= sin(vUv.y * u_resolution.y * 2.5) * 0.04;
                    
                    // Vignette
                    col *= 1.0 - 0.6 * r_dist * r_dist;
                    
                    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
                }
            `
        });
        
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);
        
        canvas.__three = { renderer, scene, camera, material };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        throw e; 
    }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material?.uniforms?.u_time) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
    if (mouse) {
        material.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
    }
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);