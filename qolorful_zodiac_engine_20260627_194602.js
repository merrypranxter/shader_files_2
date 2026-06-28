/**
 * Qolorful Zodiac Chromatic Engine
 * A high-impact, generative WebGL2 shader artwork.
 * 
 * Features:
 * - Alien color-theory machine using OKLCh perceptual color space
 * - 12-sector Zodiac mandala with procedural SDF sigils
 * - Counter-rotating planetary hours ring
 * - Opal/iridescent core and phase-modulated domain coloring background
 * - Periodic "eclipse pulses" and simultaneous contrast halos
 */

if (!canvas.__three) {
    try {
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

            #define PI 3.14159265359
            #define TWO_PI 6.28318530718
            #define GOLDEN_ANGLE 2.39996322973

            // --- Math & Noise ---
            float hash(float n) { return fract(sin(n)*43758.5453123); }
            
            vec2 hash2(vec2 p) {
                p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
                return -1.0 + 2.0*fract(sin(p)*43758.5453123);
            }

            float noise(vec2 p) {
                const float K1 = 0.366025404;
                const float K2 = 0.211324865;
                vec2 i = floor(p + (p.x+p.y)*K1);
                vec2 a = p - i + (i.x+i.y)*K2;
                float m = step(a.y, a.x);
                vec2 o = vec2(m, 1.0-m);
                vec2 b = a - o + K2;
                vec2 c = a - 1.0 + 2.0*K2;
                vec3 h = max(0.5 - vec3(dot(a,a), dot(b,b), dot(c,c)), 0.0);
                vec3 n = h*h*h*h*vec3(dot(a,hash2(i+0.0)), dot(b,hash2(i+o)), dot(c,hash2(i+1.0)));
                return dot(n, vec3(70.0));
            }

            float fbm(vec2 p) {
                float f = 0.0; float w = 0.5;
                for(int i=0; i<4; i++) { f += w*noise(p); p *= 2.0; w *= 0.5; }
                return f;
            }

            // --- Complex Plane ---
            vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
            vec2 cdiv(vec2 a, vec2 b) { float d = dot(b,b); return vec2(dot(a,b), a.y*b.x - a.x*b.y) / d; }

            // --- SDFs ---
            float sdLine(vec2 p, vec2 a, vec2 b) {
                vec2 pa = p - a, ba = b - a;
                float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
                return length(pa - ba*h);
            }

            // --- Color Space: OKLab to sRGB ---
            vec3 oklab_to_srgb(vec3 c) {
                float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
                float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
                float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
                
                float l = l_*l_*l_;
                float m = m_*m_*m_;
                float s = s_*s_*s_;
                
                vec3 rgb = vec3(
                     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                );
                
                vec3 srgb;
                srgb.r = rgb.r <= 0.0031308 ? rgb.r * 12.92 : 1.055 * pow(max(rgb.r, 0.0), 1.0/2.4) - 0.055;
                srgb.g = rgb.g <= 0.0031308 ? rgb.g * 12.92 : 1.055 * pow(max(rgb.g, 0.0), 1.0/2.4) - 0.055;
                srgb.b = rgb.b <= 0.0031308 ? rgb.b * 12.92 : 1.055 * pow(max(rgb.b, 0.0), 1.0/2.4) - 0.055;
                return clamp(srgb, 0.0, 1.0);
            }

            vec3 oklch_to_srgb(float L, float C, float h) {
                return oklab_to_srgb(vec3(L, C * cos(h), C * sin(h)));
            }

            void main() {
                vec2 uv = (vUv - 0.5) * 2.0;
                uv.x *= u_resolution.x / u_resolution.y;
                
                // Base Polar Coordinates
                float r = length(uv);
                float theta = atan(uv.y, uv.x);
                
                vec3 finalColor = vec3(0.0);
                float t = u_time * 0.5;

                // --- 1. Background Domain Coloring (r > 0.95) ---
                vec2 z = uv * 1.5;
                z = cmul(z, z) + vec2(0.5*cos(t*0.4), 0.5*sin(t*0.5));
                float vortex = 1.0 / (length(z) + 0.1);
                float rot = vortex + t*0.2;
                z *= mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
                
                float bg_angle = atan(z.y, z.x);
                float bg_rad = length(z);
                
                float bg_L = 0.3 + 0.15 * sin(bg_rad * 10.0 - t * 2.0);
                float bg_C = 0.2 + 0.1 * cos(bg_angle * 3.0);
                float bg_H = bg_angle + t * 0.3;
                
                vec3 bg_color = oklch_to_srgb(bg_L, bg_C, bg_H);
                
                // Contour lines for domain coloring
                float contours = smoothstep(0.9, 1.0, sin(bg_rad * 40.0 - t * 5.0));
                bg_color += contours * oklch_to_srgb(0.8, 0.15, bg_H + PI) * 0.3;
                
                finalColor = bg_color;

                // --- 2. Outer Zodiac Ring (0.6 < r < 0.92) ---
                float z_outer = 0.92;
                float z_inner = 0.6;
                float z_mask = smoothstep(z_outer+0.01, z_outer, r) * smoothstep(z_inner-0.01, z_inner, r);
                
                if (z_mask > 0.0) {
                    float z_theta = theta - t * 0.15; // CW rotation
                    float sec_float = (z_theta / TWO_PI) * 12.0;
                    float sec = floor(sec_float);
                    float sec_f = fract(sec_float);
                    
                    // Sector Base Color (Golden Angle harmony)
                    float sec_hue = sec * GOLDEN_ANGLE + t * 0.2;
                    float sec_L = 0.55 + 0.1 * sin(t * 3.0 + sec); // Breathing
                    vec3 sec_color = oklch_to_srgb(sec_L, 0.25, sec_hue);
                    
                    // Sector borders (Simultaneous Contrast Halos)
                    float border = smoothstep(0.02, 0.0, min(sec_f, 1.0 - sec_f));
                    sec_color = mix(sec_color, oklch_to_srgb(0.9, 0.3, sec_hue + PI), border);

                    // Procedural Sigil Generator
                    float d_sig = 1e5;
                    vec2 p_sigil = vec2((sec_f - 0.5) * r * (TWO_PI / 12.0), r - (z_inner + z_outer)*0.5);
                    p_sigil *= 14.0; // scale up local coords
                    
                    float h1 = hash(sec * 1.13);
                    float h2 = hash(sec * 2.27);
                    float h3 = hash(sec * 3.31);
                    float h4 = hash(sec * 4.43);
                    
                    // Center stem
                    d_sig = min(d_sig, sdLine(p_sigil, vec2(0.0, -1.0), vec2(0.0, 1.0)));
                    
                    // Mirrored branches
                    vec2 p_sym = vec2(abs(p_sigil.x), p_sigil.y);
                    d_sig = min(d_sig, sdLine(p_sym, vec2(0.0, 0.4*h1), vec2(0.8, 0.8*h2)));
                    d_sig = min(d_sig, sdLine(p_sym, vec2(0.0, -0.5*h3), vec2(0.6, -0.8*h4)));
                    
                    // Floating dots / arcs
                    d_sig = min(d_sig, abs(length(p_sym - vec2(0.5, 0.0)) - 0.2*h1));
                    
                    float sig_mask = smoothstep(0.1, 0.03, d_sig);
                    float sig_glow = exp(-d_sig * 8.0) * 0.5;
                    
                    // Flicker effect
                    float flicker = 0.7 + 0.3 * sin(t * 15.0 + sec * 43.0);
                    vec3 sigil_color = oklch_to_srgb(0.95, 0.15, sec_hue - PI/2.0); // Electric contrasting hue
                    
                    sec_color = mix(sec_color, sigil_color, (sig_mask + sig_glow) * flicker);
                    
                    finalColor = mix(finalColor, sec_color, z_mask);
                }

                // --- 3. Degree Ticks Ring (0.92 < r < 0.95) ---
                float tick_mask = smoothstep(0.95, 0.94, r) * smoothstep(0.92, 0.93, r);
                if (tick_mask > 0.0) {
                    float ticks = sin(theta * 360.0 + t);
                    float tick_val = smoothstep(0.5, 0.9, ticks);
                    vec3 tick_color = oklch_to_srgb(0.8, 0.3, theta * 4.0 - t);
                    finalColor = mix(finalColor, tick_color * tick_val, tick_mask);
                }

                // --- 4. Planetary Hours Ring (0.25 < r < 0.58) ---
                float p_outer = 0.58;
                float p_inner = 0.25;
                float p_mask = smoothstep(p_outer+0.01, p_outer, r) * smoothstep(p_inner-0.01, p_inner, r);
                
                if (p_mask > 0.0) {
                    float p_theta = theta + t * 0.25; // CCW rotation
                    float p_sec_float = (p_theta / TWO_PI) * 7.0; // 7 planetary hours
                    float p_sec = floor(p_sec_float);
                    float p_sec_f = fract(p_sec_float);
                    
                    float p_hue = p_sec * (TWO_PI/7.0) - t * 0.4;
                    vec3 p_color = oklch_to_srgb(0.45 + 0.1*sin(r*20.0), 0.3, p_hue);
                    
                    // Inner concentric grooves
                    float grooves = abs(sin((r - p_inner) * 60.0));
                    p_color *= 0.7 + 0.3 * smoothstep(0.8, 1.0, grooves);
                    
                    // Planetary dots
                    float dot_r = (p_inner + p_outer) * 0.5;
                    vec2 p_local = vec2((p_sec_f - 0.5) * r * (TWO_PI / 7.0), r - dot_r);
                    float p_dot = smoothstep(0.04, 0.02, length(p_local));
                    p_color = mix(p_color, oklch_to_srgb(0.9, 0.2, p_hue + PI), p_dot);
                    
                    finalColor = mix(finalColor, p_color, p_mask);
                }

                // --- 5. Core Sun/Eye (r < 0.23) ---
                float c_mask = smoothstep(0.24, 0.23, r);
                if (c_mask > 0.0) {
                    // Opal / Iridescence distortion
                    vec2 core_uv = uv + 0.05 * fbm(uv * 10.0 - t);
                    float core_r = length(core_uv);
                    float irid = fbm(core_uv * 15.0 + t);
                    
                    float core_hue = core_r * 15.0 - t * 3.0 + irid * TWO_PI;
                    vec3 core_color = oklch_to_srgb(0.7 + 0.2*sin(core_r*20.0 - t*4.0), 0.25, core_hue);
                    
                    // Center Pupil
                    float pupil = smoothstep(0.06, 0.04, length(core_uv * vec2(1.0, 2.5))); // Cat eye
                    core_color = mix(core_color, vec3(0.05, 0.0, 0.1), pupil);
                    
                    finalColor = mix(finalColor, core_color, c_mask);
                }

                // --- 6. Impossible Colors / Boundary Halos ---
                // Add searing high-chroma lines between major sections
                float b1 = exp(-abs(r - 0.92) * 300.0);
                float b2 = exp(-abs(r - 0.6) * 300.0);
                float b3 = exp(-abs(r - 0.58) * 300.0);
                float b4 = exp(-abs(r - 0.25) * 300.0);
                float boundaries = max(max(b1, b2), max(b3, b4));
                
                vec3 boundary_color = oklch_to_srgb(0.95, 0.35, theta * 3.0 + t * 5.0);
                finalColor = mix(finalColor, boundary_color, boundaries * 0.8);

                // --- 7. Eclipse Pulse ---
                // Periodic white-hot flash compressing all hues
                float pulse = exp(-fract(u_time * 0.08) * 15.0);
                vec3 pulse_color = oklch_to_srgb(0.95, 0.15, theta + PI);
                
                // Radial shockwave
                float shock = exp(-abs(r - fract(u_time * 0.5) * 2.0) * 10.0);
                pulse += shock * 0.2;
                
                finalColor = mix(finalColor, pulse_color, pulse * smoothstep(1.5, 0.0, r));

                // Vignette & output
                float vignette = 1.0 - smoothstep(0.5, 1.5, length(vUv - 0.5) * 2.0);
                fragColor = vec4(finalColor * vignette, 1.0);
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

        const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(plane);

        canvas.__three = { renderer, scene, camera, material };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        throw e;
    }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);