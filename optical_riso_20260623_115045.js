import * as THREE from 'three';

export function render(ctx, grid, time, repos, input, mouse, canvas, THREE) {
    if (!canvas.__three) {
        try {
            if (!ctx) throw new Error("WebGL 2 context not available");
            
            const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(75, grid.width / grid.height, 0.1, 1000);
            camera.position.z = 1;
            
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
                uniform vec2 u_mouse;

                #define PI 3.14159265359

                // Risograph Standard Inks (Linearized)
                vec3 PAPER      = vec3(0.96, 0.94, 0.91); 
                vec3 INK_PINK   = vec3(1.00, 0.42, 0.71);
                vec3 INK_TEAL   = vec3(0.00, 0.51, 0.54);
                vec3 INK_YELLOW = vec3(1.00, 0.91, 0.00);
                vec3 INK_NAVY   = vec3(0.01, 0.13, 0.41);

                // Noise & Hashes
                float hash(vec2 p) { 
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); 
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
                }

                float fbm(vec2 p) {
                    float f = 0.0;
                    float w = 0.5;
                    for (int i = 0; i < 4; i++) {
                        f += w * noise(p);
                        p *= 2.0;
                        w *= 0.5;
                    }
                    return f;
                }

                vec2 rot(vec2 v, float a) {
                    float c = cos(a), s = sin(a);
                    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
                }

                float sdBox(vec2 p, vec2 b) {
                    vec2 d = abs(p) - b;
                    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
                }

                float sdTriangle(in vec2 p, in vec2 p0, in vec2 p1, in vec2 p2) {
                    vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2;
                    vec2 v0 = p - p0, v1 = p - p1, v2 = p - p2;
                    vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
                    vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
                    vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
                    float s = sign(e0.x * e2.y - e0.y * e2.x);
                    vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                                     vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
                                     vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
                    return -sqrt(d.x) * sign(d.y);
                }

                // Kanizsa shape generator (circle minus wedge)
                float pacmanMask(vec2 p, float r, float angle_center, float aperture) {
                    float dist = length(p);
                    float a = atan(p.y, p.x);
                    float ad = mod(a - angle_center + PI, 2.0 * PI) - PI;
                    float mask = 1.0 - smoothstep(r - 0.01, r, dist);
                    float cutout = smoothstep(aperture - 0.02, aperture, abs(ad));
                    return mask * cutout;
                }

                // Structural Color Palette (Thin Film Interference)
                vec3 thinFilm(float t) {
                    vec3 a = vec3(0.5);
                    vec3 b = vec3(0.5);
                    vec3 c = vec3(1.0);
                    vec3 d = vec3(0.0, 0.33, 0.67);
                    return a + b * cos(6.28318 * (c * t + d));
                }

                // Risograph Halftone Dot
                float halftone(vec2 uv, float lpi, float angle, float gain, float density) {
                    vec2 rot_uv = rot(uv, angle);
                    vec2 cell = fract(rot_uv * lpi) - 0.5;
                    float r = sqrt(density) * 0.707 / gain; 
                    return 1.0 - smoothstep(r - 0.05, r + 0.05, length(cell));
                }

                // Physical Ink Blending (Subtractive Multiply)
                vec3 layer(vec3 base, vec3 ink, float coverage, float transparency) {
                    vec3 blended = mix(base * ink, ink, 1.0 - transparency);
                    return mix(base, blended, coverage);
                }

                // Mechanical Misregistration Jitter
                vec2 chaos_misreg(float t, float speed, float mag) {
                    float x = sin(t * speed) + sin(t * speed * 2.31);
                    float y = cos(t * speed * 1.1) + cos(t * speed * 2.73);
                    return vec2(x, y) * mag;
                }

                void main() {
                    vec2 p = vUv * 2.0 - 1.0;
                    p.x *= u_resolution.x / u_resolution.y;

                    // Risograph Misregistration Offsets
                    vec2 uv_yellow = p + chaos_misreg(u_time, 0.5, 0.015);
                    vec2 uv_pink   = p + chaos_misreg(u_time, 0.6, 0.010);
                    vec2 uv_teal   = p + chaos_misreg(u_time, 0.4, 0.020);
                    vec2 uv_navy   = p + chaos_misreg(u_time, 0.3, 0.005);

                    float d_pink = 0.0;
                    float d_teal = 0.0;
                    float d_yellow = 0.0;
                    float d_navy = 0.0;

                    // Pulfrich Effect: Lateral depth offset
                    float mouse_influence = (u_mouse.x - 0.5) * 2.0;
                    float pulfrich = sin(u_time * 1.5) * 0.08 + mouse_influence * 0.1;

                    // 1. Kanizsa Pac-men (Implied Triangle Base)
                    float R = 0.35;
                    vec2 cp1 = vec2(pulfrich, R);
                    vec2 cp2 = vec2(-R * 0.866 + pulfrich, -R * 0.5);
                    vec2 cp3 = vec2(R * 0.866 + pulfrich, -R * 0.5);

                    float m1 = pacmanMask(uv_pink - cp1, 0.18, -PI/2.0, PI/6.0);
                    float m2 = pacmanMask(uv_pink - cp2, 0.18, PI/6.0, PI/6.0);
                    float m3 = pacmanMask(uv_pink - cp3, 0.18, 5.0*PI/6.0, PI/6.0);
                    float pacmen = max(max(m1, m2), m3);

                    // Chromadepth: Warm colors pop forward
                    d_pink += pacmen * 0.85;
                    d_yellow += pacmen * 0.5;

                    // 2. Implied Upward Triangle (Shifts background laterally to create ghost depth)
                    float tri_dist_up = sdTriangle(p, cp1, cp2, cp3);
                    float tri_mask_up = 1.0 - smoothstep(0.0, 0.02, tri_dist_up);

                    vec2 bg_p = p;
                    bg_p.x += tri_mask_up * pulfrich * 0.6; // Internal depth shift

                    // Background Stress Field & Birefringence Moiré
                    float stress = 0.1 / (length(bg_p - cp1) + 0.02) + 
                                   0.1 / (length(bg_p - cp2) + 0.02) + 
                                   0.1 / (length(bg_p - cp3) + 0.02);
                                   
                    float field = fbm(bg_p * 2.5 + u_time * 0.2) + stress * 0.2;
                    float bg_angle = atan(bg_p.y, bg_p.x);
                    float lines = sin(field * 50.0 + bg_angle * 3.0);

                    float bg_mask = 1.0 - pacmen;
                    d_navy += smoothstep(0.0, 0.2, lines) * 0.6 * bg_mask;
                    d_teal += smoothstep(0.0, 0.2, -lines) * 0.5 * bg_mask;

                    // 3. Drawn Downward Triangle (Structural Color / Thin Film)
                    vec2 tp1 = vec2(0.0, -R);
                    vec2 tp2 = vec2(-R * 0.866, R * 0.5);
                    vec2 tp3 = vec2(R * 0.866, R * 0.5);
                    float tri_dist_down = sdTriangle(p, tp1, tp2, tp3);
                    float tri_mask_down = 1.0 - smoothstep(0.0, 0.015, tri_dist_down);

                    float microtexture = hash(p * 150.0) * 0.15;
                    vec3 struct_color = thinFilm(field * 2.5 - u_time * 0.4 + microtexture);
                    
                    // Convert RGB structural color to CMYK/Riso subtractive densities
                    float s_teal = (1.0 - struct_color.r);
                    float s_pink = (1.0 - struct_color.g);
                    float s_yellow = (1.0 - struct_color.b);

                    d_teal = mix(d_teal, s_teal, tri_mask_down * 0.9);
                    d_pink = mix(d_pink, s_pink, tri_mask_down * 0.9);
                    d_yellow = mix(d_yellow, s_yellow, tri_mask_down * 0.9);

                    // 4. Cellophane Mondrian Overlays (Simultaneous Contrast triggers)
                    vec2 rect_uv1 = rot(p - vec2(-0.5, 0.4), u_time * 0.1);
                    float rect1 = 1.0 - smoothstep(0.0, 0.02, sdBox(rect_uv1, vec2(0.25, 0.15)));
                    d_yellow += rect1 * 0.5;
                    d_pink -= rect1 * 0.3; // Knockout creates contrasting edge

                    vec2 rect_uv2 = rot(p - vec2(0.5, -0.4), -u_time * 0.15);
                    float rect2 = 1.0 - smoothstep(0.0, 0.02, sdBox(rect_uv2, vec2(0.15, 0.35)));
                    d_teal += rect2 * 0.6;
                    d_navy -= rect2 * 0.3;

                    // 5. Floating Chromadepth Particles
                    float dots = 0.0;
                    for(int i = 0; i < 6; i++) {
                        float fi = float(i);
                        vec2 pos = vec2(sin(u_time * 0.6 + fi * 1.3), cos(u_time * 0.4 + fi * 2.1)) * 0.8;
                        pos.x += pulfrich * 1.5; // Exaggerated forward depth
                        float d = length(p - pos);
                        dots += 1.0 - smoothstep(0.015, 0.025, d);
                    }
                    d_pink += dots * 0.9;
                    d_yellow += dots * 0.8;
                    d_navy -= dots; 
                    d_teal -= dots;

                    // --- Render Pipeline ---

                    // Risograph Halftoning (Classic CMYK screen angles)
                    float lpi = 85.0;
                    float h_yellow = halftone(uv_yellow, lpi, 0.000, 1.1, clamp(d_yellow, 0.0, 1.0));
                    float h_teal   = halftone(uv_teal,   lpi, 0.261, 1.1, clamp(d_teal,   0.0, 1.0)); // 15 deg
                    float h_navy   = halftone(uv_navy,   lpi, 0.785, 1.1, clamp(d_navy,   0.0, 1.0)); // 45 deg
                    float h_pink   = halftone(uv_pink,   lpi, 1.309, 1.1, clamp(d_pink,   0.0, 1.0)); // 75 deg

                    // Mechanical Ink Dropout Noise
                    float drop = step(0.06, hash(floor(gl_FragCoord.xy * 0.7)));
                    h_yellow *= drop;
                    h_pink   *= drop;
                    h_teal   *= drop;
                    h_navy   *= drop;

                    // Substrate Base
                    float paper_tex = fbm(p * 80.0);
                    vec3 col = PAPER - vec3(0.03) * paper_tex;

                    // Subtractive Multiply Blending (Lightest to Darkest)
                    col = layer(col, INK_YELLOW, h_yellow, 0.85);
                    col = layer(col, INK_TEAL,   h_teal,   0.85);
                    col = layer(col, INK_PINK,   h_pink,   0.85);
                    col = layer(col, INK_NAVY,   h_navy,   0.90);

                    // Vignette
                    float vig = length(p);
                    col *= smoothstep(2.0, 0.5, vig);

                    fragColor = vec4(col, 1.0);
                }
            `;
            
            const material = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_time: { value: 0 },
                    u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                    u_mouse: { value: new THREE.Vector2(0.5, 0.5) }
                },
                vertexShader,
                fragmentShader,
                depthWrite: false,
                depthTest: false
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
        material.uniforms.u_time.value = time;
        material.uniforms.u_resolution.value.set(grid.width, grid.height);
        
        let mx = 0.5, my = 0.5;
        if (mouse && mouse.isPressed) {
            mx = mouse.x / grid.width;
            my = 1.0 - (mouse.y / grid.height);
        }
        // Smoothly interpolate mouse to avoid jerky pulfrich jumps
        material.uniforms.u_mouse.value.x += (mx - material.uniforms.u_mouse.value.x) * 0.1;
        material.uniforms.u_mouse.value.y += (my - material.uniforms.u_mouse.value.y) * 0.1;
    }
    
    renderer.setSize(grid.width, grid.height, false);
    renderer.render(scene, camera);
}