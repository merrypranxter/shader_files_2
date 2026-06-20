/**
 * PRISMATIC TAPE ORACLE
 * A dream-physics environment behaving as a haunted browser window and a broken VHS tape.
 * 
 * Fuses:
 * - Cellular Automata (Lenia-lite continuous feedback on the green channel)
 * - Datamosh (Motion-vector driven UV distortion of the feedback buffer)
 * - Op-Art (Moiré tunnels, radial pressure fields)
 * - Early Internet Shrine (Asemic UI, floating browser panels, recursive chips)
 * - VHS / Damage (Tracking wobble, colored dropouts, head-switching)
 * - Structural Color (Bragg reflection iridescence on highlights)
 * - Risograph Style (Halftone dot modulation, misregistration sampling)
 * - Cross-Processing / Color Systems (Strict OKLab perceptual blending, NO pure black/white)
 */

(function() {
    // Acquire context and dimensions
    const width = grid.width;
    const height = grid.height;
    
    if (!canvas.__three) {
        try {
            if (!ctx) throw new Error("WebGL2 context not available");

            const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
            renderer.setPixelRatio(1.0);
            renderer.setSize(width, height, false);

            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

            // Ping-pong FBOs for Datamosh & Cellular Automata
            const rtOptions = {
                format: THREE.RGBAFormat,
                type: THREE.FloatType, 
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                wrapS: THREE.RepeatWrapping,
                wrapT: THREE.RepeatWrapping
            };
            const rtA = new THREE.WebGLRenderTarget(width, height, rtOptions);
            const rtB = rtA.clone();

            const geometry = new THREE.PlaneGeometry(2, 2);

            // ========================================================================
            // BUFFER A: THE ENGINE
            // Handles CA, Datamosh Memory, Op-Art Spatial Fields, and Dream Architecture
            // Output: R (Structure), G (Automata State), B (Material ID), A (Glitch Phase)
            // ========================================================================
            const bufferMaterial = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_time: { value: 0 },
                    u_resolution: { value: new THREE.Vector2(width, height) },
                    u_feedback: { value: null }
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
                    uniform sampler2D u_feedback;

                    // 2D Signed Distance Functions
                    float sdBox(vec2 p, vec2 b) {
                        vec2 d = abs(p) - b;
                        return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
                    }

                    mat2 rot(float a) {
                        float s = sin(a), c = cos(a);
                        return mat2(c, -s, s, c);
                    }

                    void main() {
                        vec2 texel = 1.0 / u_resolution;
                        vec4 past = texture(u_feedback, vUv);
                        
                        // 1. CELLULAR AUTOMATA (Lenia-lite)
                        // Sample ring neighborhood
                        float sum = 0.0;
                        float w_sum = 0.0;
                        for(float x = -2.0; x <= 2.0; x++) {
                            for(float y = -2.0; y <= 2.0; y++) {
                                float w = exp(-(x*x+y*y)/3.0);
                                sum += texture(u_feedback, vUv + vec2(x,y)*texel*2.0).g * w;
                                w_sum += w;
                            }
                        }
                        float avg = sum / w_sum;
                        // Growth rule: Bell curve centered at 0.28
                        float growth = exp(-pow(avg - 0.28, 2.0) / 0.015) * 2.0 - 1.0;
                        float new_ca = clamp(past.g + growth * 0.08, 0.0, 1.0);
                        new_ca *= 0.995; // Slight decay to prevent total saturation

                        // 2. DATAMOSH MEMORY
                        // Compute pseudo-gradient of the CA field to drive motion vectors
                        float g_r = texture(u_feedback, vUv + vec2(texel.x*2.0, 0.0)).g;
                        float g_l = texture(u_feedback, vUv - vec2(texel.x*2.0, 0.0)).g;
                        float g_t = texture(u_feedback, vUv + vec2(0.0, texel.y*2.0)).g;
                        float g_b = texture(u_feedback, vUv - vec2(0.0, texel.y*2.0)).g;
                        vec2 grad = vec2(g_r - g_l, g_t - g_b);
                        
                        vec2 moshed_uv = vUv - grad * 0.06 + vec2(sin(u_time*0.1), cos(u_time*0.15))*0.001;
                        vec4 moshed_state = texture(u_feedback, moshed_uv);

                        // 3. DREAM PHYSICS ARCHITECTURE & OP-ART
                        vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution) / min(u_resolution.x, u_resolution.y);
                        p += (new_ca - 0.5) * 0.1; // CA visually distorts geometry

                        float struct_val = moshed_state.r * 0.98; // Fade old structure
                        float mat_val = moshed_state.b;
                        float glitch_phase = moshed_state.a;

                        // Central Oracle Portal (Radial Op-Art)
                        float d_oracle = length(p) - 0.5 + sin(atan(p.y, p.x)*6.0 + u_time*2.0)*0.04;
                        if(d_oracle < 0.0) {
                            // Infinite tunnel moiré
                            float tunnel = sin(1.0 / (length(p) + 0.01) * 15.0 - u_time * 8.0);
                            float radial = sin(atan(p.y, p.x) * 12.0 + length(p) * 20.0);
                            struct_val = smoothstep(-0.1, 0.1, tunnel * radial);
                            mat_val = 0.2 + new_ca * 0.2; 
                        } else if(d_oracle < 0.03) {
                            // Glowing Portal Rim
                            struct_val = 1.0;
                            mat_val = 0.8;
                        }

                        // Floating Browser Panels (Asemic UI Shrine)
                        vec2 p_panel = p - vec2(0.5 * sin(u_time*0.6), 0.4 * cos(u_time*0.4));
                        p_panel *= rot(sin(u_time*0.2)*0.5);
                        float d_panel = sdBox(p_panel, vec2(0.3, 0.2));
                        
                        if(d_panel < 0.0) {
                            float bevel = sdBox(p_panel, vec2(0.28, 0.18));
                            if(bevel > 0.0) {
                                struct_val = 0.9; // Bevel
                                mat_val = 0.9;
                            } else {
                                // Asemic Glyphs / UI logic
                                float ui = step(0.8, sin(p_panel.y * 120.0 + u_time * 6.0)) * step(0.5, sin(p_panel.x * 60.0));
                                ui += step(0.95, sin(p_panel.x * 250.0)) * step(0.8, cos(p_panel.y * 150.0));
                                struct_val = mix(new_ca, ui, 0.6);
                                mat_val = 0.5;
                            }
                        }

                        // Recursive Cursed Chips (Fractal details)
                        vec2 p2 = p;
                        float fold_id = 0.0;
                        for(int i=0; i<3; i++) {
                            if(p2.x > p2.y) p2.xy = p2.yx;
                            p2.y = abs(p2.y) - 0.25;
                            p2 *= rot(0.5 + u_time*0.1);
                            fold_id += 1.0;
                        }
                        if(sdBox(p2, vec2(0.08, 0.02)) < 0.0) {
                            struct_val = step(0.5, sin(p2.x * 300.0 - u_time * 15.0));
                            mat_val = fold_id * 0.2;
                        }

                        // Temporal Ghosting / I-Frame Refresh
                        // Periodically flush the screen to prevent total soup, acting like an I-Frame
                        float iframe = step(0.995, sin(u_time * 0.4 - length(p)*3.0));
                        if(iframe > 0.5 || u_time < 0.1) {
                            float noise_val = fract(sin(dot(vUv + u_time, vec2(12.9898, 78.233))) * 43758.5453);
                            new_ca = noise_val;
                            struct_val = noise_val;
                            mat_val = fract(noise_val * 13.0);
                        }

                        glitch_phase = fract(glitch_phase + 0.01 + grad.x);

                        fragColor = vec4(struct_val, new_ca, mat_val, glitch_phase);
                    }
                `
            });

            // ========================================================================
            // COMPOSITE: THE LENS
            // Handles OKLab Color Systems, VHS Tracking, Riso Misreg/Halftone, Structural Color
            // ========================================================================
            const compositeMaterial = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_time: { value: 0 },
                    u_resolution: { value: new THREE.Vector2(width, height) },
                    u_buffer: { value: null }
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
                    uniform sampler2D u_buffer;

                    // --- OKLAB COLOR MATH ---
                    vec3 srgb_to_linear(vec3 c) {
                        vec3 bLess = c / 12.92;
                        vec3 bMore = pow((c + 0.055) / 1.055, vec3(2.4));
                        return mix(bLess, bMore, step(0.04045, c));
                    }
                    vec3 linear_to_srgb(vec3 c) {
                        vec3 bLess = c * 12.92;
                        vec3 bMore = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
                        return mix(bLess, bMore, step(0.0031308, c));
                    }
                    vec3 linear_srgb_to_oklab(vec3 c) {
                        float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
                        float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
                        float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
                        float l_ = sign(l)*pow(abs(l), 1.0/3.0);
                        float m_ = sign(m)*pow(abs(m), 1.0/3.0);
                        float s_ = sign(s)*pow(abs(s), 1.0/3.0);
                        return vec3(
                            0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
                            1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
                            0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
                        );
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
                    vec3 oklab_mix(vec3 a, vec3 b, float t) {
                        vec3 oA = linear_srgb_to_oklab(srgb_to_linear(a));
                        vec3 oB = linear_srgb_to_oklab(srgb_to_linear(b));
                        vec3 oM = mix(oA, oB, clamp(t, 0.0, 1.0));
                        return clamp(linear_to_srgb(oklab_to_linear_srgb(oM)), 0.0, 1.0);
                    }

                    // --- PALETTE SYSTEM (NO PURE BLACK/WHITE) ---
                    vec3 get_palette(float mat, float luma, float ca) {
                        // Saturated Shadows
                        vec3 s1 = vec3(0.165, 0.0, 0.302); // Deep Plum
                        vec3 s2 = vec3(0.0, 0.2, 0.302);   // Peacock Teal
                        
                        // Vivid Mids
                        vec3 m1 = vec3(1.0, 0.0, 0.4);     // Hot Pink
                        vec3 m2 = vec3(0.0, 1.0, 1.0);     // Electric Cyan
                        
                        // Luminous Highs (Tinted bloom, never white)
                        vec3 h1 = vec3(0.8, 1.0, 0.0);     // Chartreuse
                        vec3 h2 = vec3(1.0, 0.4, 0.0);     // Neon Orange
                        
                        float t = fract(mat * 3.1415 + u_time * 0.05);
                        
                        vec3 shadow = oklab_mix(s1, s2, smoothstep(0.2, 0.8, t));
                        vec3 mid    = oklab_mix(m1, m2, smoothstep(0.2, 0.8, fract(t + 0.5)));
                        vec3 high   = oklab_mix(h1, h2, smoothstep(0.2, 0.8, fract(t + ca)));
                        
                        // Cross-Processing response curve
                        if(luma < 0.5) return oklab_mix(shadow, mid, luma * 2.0);
                        return oklab_mix(mid, high, (luma - 0.5) * 2.0);
                    }

                    void main() {
                        // 1. VHS TRACKING WOBBLE
                        float wobble = sin(vUv.y * 15.0 + u_time * 12.0) * step(0.95, sin(u_time * 2.5)) * 0.02;
                        wobble += sin(vUv.y * 50.0 - u_time * 20.0) * step(0.98, sin(u_time * 7.0)) * 0.04;
                        vec2 vhs_uv = vUv + vec2(wobble, 0.0);

                        // 2. RISO MISREGISTRATION & CHROMA BLEED
                        // Sample channels with slight spatial and temporal offset
                        vec2 misreg = vec2(0.005 * sin(u_time * 1.7), 0.004 * cos(u_time * 2.3));
                        
                        vec4 s_c = texture(u_buffer, vhs_uv);
                        vec4 s_l = texture(u_buffer, vhs_uv - misreg);
                        vec4 s_r = texture(u_buffer, vhs_uv + misreg);
                        
                        // Map structure to color via cross-processing rules
                        vec3 col_c = get_palette(s_c.b, s_c.r, s_c.g);
                        vec3 col_l = get_palette(s_l.b, s_l.r, s_l.g);
                        vec3 col_r = get_palette(s_r.b, s_r.r, s_r.g);
                        
                        // Chromatic Aberration recombine
                        vec3 final_color = vec3(col_l.r, col_c.g, col_r.b);

                        // 3. STRUCTURAL COLOR IRIDESCENCE
                        // Bragg reflection simulated via distance from center + CA state
                        float view_angle = sin(length(vUv - 0.5) * 15.0 - u_time * 1.5 + s_c.g * 5.0) * 0.5 + 0.5;
                        vec3 iridescent = 0.5 + 0.5 * cos(6.28318 * (view_angle + vec3(0.0, 0.33, 0.67)));
                        // Boost iridescence saturation
                        iridescent = mix(vec3(dot(iridescent, vec3(0.33))), iridescent, 1.5);
                        
                        // Apply iridescence only to highlights
                        float luma = dot(final_color, vec3(0.299, 0.587, 0.114));
                        final_color = oklab_mix(final_color, iridescent, smoothstep(0.5, 1.0, luma) * 0.6);

                        // 4. RISO HALFTONE
                        float lpi = u_resolution.y * 0.3; // Dense dot screen
                        float angle = 0.785398; // 45 degrees
                        vec2 rot_uv = vec2(vUv.x * cos(angle) - vUv.y * sin(angle), vUv.x * sin(angle) + vUv.y * cos(angle));
                        vec2 cell = fract(rot_uv * lpi) - 0.5;
                        
                        // Inverse luma drives dot size (darker = bigger dots)
                        float radius = 0.45 * (1.0 - luma);
                        float ht = smoothstep(radius + 0.1, radius - 0.1, length(cell));
                        
                        // Multiply blend with a saturated dark ink (Plum) instead of black
                        vec3 ink_dark = vec3(0.165, 0.0, 0.302);
                        final_color = oklab_mix(ink_dark, final_color, ht * 0.85 + 0.15);

                        // 5. COLORED DAMAGE / DROPOUTS
                        float dropout_noise = fract(sin(dot(floor(vUv * vec2(15.0, 150.0)) + u_time, vec2(12.9898, 78.233))) * 43758.5453);
                        float dropout_mask = step(0.993, dropout_noise) * step(0.85, sin(vUv.y * 8.0 + u_time * 2.0));
                        if (dropout_mask > 0.0) {
                            // Dropouts blast in neon Cyan or Magenta
                            final_color = fract(u_time * 15.0) > 0.5 ? vec3(0.0, 1.0, 1.0) : vec3(1.0, 0.0, 0.4);
                        }

                        // Head switching noise at bottom
                        if (vUv.y < 0.03) {
                            float head_noise = fract(sin(dot(vUv * 500.0 + u_time, vec2(12.9898, 78.233))) * 43758.5);
                            final_color = oklab_mix(final_color, vec3(0.4, 0.0, 1.0), head_noise * 0.5); // Ultraviolet static
                        }

                        fragColor = vec4(final_color, 1.0);
                    }
                `
            });

            const bufferScene = new THREE.Scene();
            bufferScene.add(new THREE.Mesh(geometry, bufferMaterial));

            const compositeScene = new THREE.Scene();
            compositeScene.add(new THREE.Mesh(geometry, compositeMaterial));

            canvas.__three = { 
                renderer, camera, rtA, rtB, 
                bufferScene, compositeScene, 
                bufferMaterial, compositeMaterial, 
                pingPong: true 
            };
        } catch (e) {
            console.error("WebGL Initialization Failed:", e);
            return;
        }
    }

    const { renderer, camera, rtA, rtB, bufferScene, compositeScene, bufferMaterial, compositeMaterial } = canvas.__three;

    // Update uniforms
    bufferMaterial.uniforms.u_time.value = time;
    bufferMaterial.uniforms.u_resolution.value.set(width, height);
    
    compositeMaterial.uniforms.u_time.value = time;
    compositeMaterial.uniforms.u_resolution.value.set(width, height);

    // Ping-Pong FBO logic
    const readRT = canvas.__three.pingPong ? rtA : rtB;
    const writeRT = canvas.__three.pingPong ? rtB : rtA;

    // Pass previous frame as feedback
    bufferMaterial.uniforms.u_feedback.value = readRT.texture;
    
    // Render Buffer A (The Engine)
    renderer.setRenderTarget(writeRT);
    renderer.render(bufferScene, camera);

    // Render Composite (The Lens) to screen
    renderer.setRenderTarget(null);
    compositeMaterial.uniforms.u_buffer.value = writeRT.texture;
    renderer.render(compositeScene, camera);

    // Swap buffers for next frame
    canvas.__three.pingPong = !canvas.__three.pingPong;
})();