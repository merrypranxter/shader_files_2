/**
 * PRISMATIC TAPE ORACLE
 * A generative system fusing dream-physics, early-internet archaeology, 
 * cellular automata, op-art, VHS degradation, and risograph print logic.
 * 
 * Absolute Color Rules Enforced via OKLab cross-processing:
 * No black, no white, no grays. Darks are saturated plums/teals. 
 * Lights are acid yellows/hot pinks.
 */

try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    // Initialize Three.js context if it doesn't exist
    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ 
            canvas, 
            context: ctx, 
            alpha: true, 
            antialias: false,
            powerPreference: "high-performance"
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));

        const sceneSim = new THREE.Scene();
        const sceneDisp = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Ping-Pong FBOs for Cellular Automata & Datamosh Memory
        // Using HalfFloatType for precision in feedback loops without massive overhead
        const rtOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType, 
            depthBuffer: false,
            stencilBuffer: false,
            generateMipmaps: false
        };
        
        const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
        const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

        // --- SHARED SHADER CHUNKS ---
        
        const oklabFns = `
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
                float l = l_*l_*l_;
                float m = m_*m_*m_;
                float s = s_*s_*s_;
                return vec3(
                    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                );
            }
            vec3 getSaturatedColor(float t) {
                float L = 0.6 + 0.2 * sin(t * 2.1);
                float C = 0.25 + 0.1 * cos(t * 3.7);
                float h = t * 6.28318;
                return clamp(oklab_to_linear_srgb(vec3(L, C * cos(h), C * sin(h))), 0.0, 1.0);
            }
            mat2 rot(float a) {
                float s = sin(a), c = cos(a);
                return mat2(c, -s, s, c);
            }
        `;

        // --- SIMULATION SHADER (CA + Raymarching + Datamosh) ---
        const simMat = new THREE.RawShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2() },
                u_prev: { value: null }
            },
            vertexShader: `
                in vec2 position;
                out vec2 vUv;
                void main() {
                    vUv = position * 0.5 + 0.5;
                    gl_Position = vec4(position, 0.0, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                in vec2 vUv;
                out vec4 fragColor;
                
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform sampler2D u_prev;

                ${oklabFns}

                // SDF Primitives
                float sdBox(vec3 p, vec3 b) {
                    vec3 q = abs(p) - b;
                    return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
                }
                
                float sdTorus(vec3 p, vec2 t) {
                    vec2 q = vec2(length(p.xy)-t.x,p.z);
                    return length(q)-t.y;
                }

                // Dream Architecture Map
                vec2 map(vec3 p, float ca_val) {
                    vec3 q = p;
                    
                    // Op-Art Spatial Engine: Warp space with sine fields
                    q.xy += vec2(sin(q.z * 1.5 + u_time), cos(q.z * 1.2 - u_time)) * 0.25;
                    
                    // Infinite folding corridor
                    vec3 id = floor(q / 8.0);
                    q.x = mod(q.x + 4.0, 8.0) - 4.0;
                    q.y = mod(q.y + 4.0, 8.0) - 4.0;
                    q.z = mod(q.z + 4.0, 8.0) - 4.0;
                    
                    // Early-Internet Browser Panels
                    float panel = sdBox(q, vec3(2.5, 1.8, 0.1));
                    float hole = sdBox(q, vec3(2.3, 1.6, 0.2)); // Hollow it out
                    panel = max(panel, -hole);
                    
                    // Central Oracle (Op-Art Ripple Torus)
                    vec3 op = p;
                    op.xy *= rot(u_time * 0.2);
                    op.xz *= rot(u_time * 0.3);
                    float oracle = sdTorus(op, vec2(2.5, 0.8));
                    // Structural op-art pressure rings
                    oracle += sin(length(op.xy) * 15.0 - u_time * 5.0) * 0.1;
                    
                    // Automata integration: CA bulges the geometry
                    panel += ca_val * 0.15;
                    oracle -= ca_val * 0.2;

                    float d = min(panel, oracle);
                    float matId = oracle < panel ? 1.0 : 0.0;
                    
                    return vec2(d, matId);
                }

                vec3 calcNormal(vec3 p, float ca_val) {
                    vec2 e = vec2(0.01, 0.0);
                    return normalize(vec3(
                        map(p+e.xyy, ca_val).x - map(p-e.xyy, ca_val).x,
                        map(p+e.yxy, ca_val).x - map(p-e.yxy, ca_val).x,
                        map(p+e.yyx, ca_val).x - map(p-e.yyx, ca_val).x
                    ));
                }

                // Cellular Automata Logic (Lenia-inspired continuous state)
                float updateCA(vec2 uv) {
                    vec2 texel = 1.0 / u_resolution;
                    float val = texture(u_prev, uv).a;
                    
                    // Sample neighborhood
                    float sum = 0.0;
                    for(int y=-1; y<=1; y++) {
                        for(int x=-1; x<=1; x++) {
                            if(x==0 && y==0) continue;
                            sum += texture(u_prev, fract(uv + vec2(x,y)*texel*2.0)).a;
                        }
                    }
                    float avg = sum / 8.0;
                    
                    // Reaction-diffusion-esque rule
                    float growth = smoothstep(0.2, 0.4, avg) - smoothstep(0.5, 0.8, avg);
                    float next_val = val + (growth * 0.8 - 0.05);
                    
                    // Inject structural noise
                    next_val += sin(uv.x * 50.0 + u_time) * sin(uv.y * 50.0 - u_time) * 0.02;
                    
                    // Bootstrap
                    if (u_time < 0.2) next_val = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
                    
                    return clamp(next_val, 0.0, 1.0);
                }

                void main() {
                    vec2 uv = vUv;
                    float ca_val = updateCA(uv);
                    
                    // Camera Setup
                    vec2 p = (uv - 0.5) * 2.0;
                    p.x *= u_resolution.x / u_resolution.y;
                    
                    vec3 ro = vec3(sin(u_time*0.2)*2.0, cos(u_time*0.15)*2.0, u_time * 2.0);
                    vec3 ta = ro + vec3(0.0, 0.0, 1.0);
                    vec3 ww = normalize(ta - ro);
                    vec3 uu = normalize(cross(ww, vec3(0,1,0)));
                    vec3 vv = normalize(cross(uu, ww));
                    vec3 rd = normalize(p.x*uu + p.y*vv + 1.2*ww);

                    // Raymarch
                    float t = 0.0;
                    float max_d = 40.0;
                    vec2 res = vec2(0.0);
                    float glow = 0.0;
                    
                    for(int i=0; i<60; i++) {
                        vec3 pos = ro + rd * t;
                        res = map(pos, ca_val);
                        if(res.x < 0.01 || t > max_d) break;
                        t += res.x * 0.7; // cautious stepping due to op-art distortion
                        glow += 0.02 / (0.1 + abs(res.x)); // Structural spectral halo
                    }

                    vec3 color = vec3(0.0);
                    
                    if (t < max_d) {
                        vec3 pos = ro + rd * t;
                        vec3 n = calcNormal(pos, ca_val);
                        vec3 v = -rd;
                        
                        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0);
                        
                        if (res.y > 0.5) {
                            // Oracle: Structural Color (Bragg Reflection mimicry)
                            float interference = dot(n, v) * 8.0 + u_time + ca_val * 2.0;
                            color = getSaturatedColor(interference * 0.1);
                            color += getSaturatedColor(interference * 0.3 + 0.5) * fresnel * 2.0;
                        } else {
                            // Browser Panels: Asemic interface fragments + Riso-like flat hues
                            vec2 panelUV = pos.xy * 2.0;
                            float glyphs = step(0.8, fract(panelUV.x * 5.0)) * step(0.8, fract(panelUV.y * 5.0));
                            color = getSaturatedColor(pos.z * 0.1 + u_time * 0.05);
                            color = mix(color, getSaturatedColor(ca_val + 0.5), glyphs * ca_val);
                        }
                        
                        // Atmospheric depth (Colored Fog, no black)
                        float fog = 1.0 - exp(-t * 0.05);
                        vec3 fogColor = getSaturatedColor(u_time * 0.1 + 0.3);
                        color = mix(color, fogColor, fog);
                    } else {
                        // Deep Background: Moiré / Cross-process haze
                        float bgPat = sin(uv.x*50.0 + u_time)*sin(uv.y*50.0 - u_time);
                        color = getSaturatedColor(uv.x + uv.y + bgPat*0.1 + u_time*0.2);
                    }
                    
                    // Add structural glow
                    color += getSaturatedColor(glow * 0.1 + u_time) * glow * 0.05;

                    // --- DATAMOSH / MEMORY SMEAR LAYER ---
                    // Compute motion vector from CA gradient
                    vec2 texel = 1.0 / u_resolution;
                    float ca_dx = texture(u_prev, uv + vec2(texel.x, 0)).a - texture(u_prev, uv - vec2(texel.x, 0)).a;
                    float ca_dy = texture(u_prev, uv + vec2(0, texel.y)).a - texture(u_prev, uv - vec2(0, texel.y)).a;
                    vec2 flow = vec2(ca_dx, ca_dy) * 2.0;
                    
                    // Distort UVs for memory lookup
                    vec2 moshed_uv = uv - flow * texel * 10.0;
                    vec3 mem_color = texture(u_prev, moshed_uv).rgb;
                    
                    // P-Frame Hold Logic: Sometimes keep memory, sometimes update
                    float update_chance = fract(sin(dot(uv, vec2(12.9898, 78.233)) + u_time) * 43758.5453);
                    float hold_factor = smoothstep(0.3, 0.7, ca_val) * 0.85; // High CA = hold memory (smear)
                    
                    // Mix current render with datamoshed past
                    vec3 final_rgb = mix(color, mem_color, hold_factor);

                    fragColor = vec4(final_rgb, ca_val);
                }
            `
        });

        // --- DISPLAY SHADER (VHS, Riso, Spectral Chroma, Cross-Process OKLab) ---
        const dispMat = new THREE.RawShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2() },
                u_tex: { value: null }
            },
            vertexShader: `
                in vec2 position;
                out vec2 vUv;
                void main() {
                    vUv = position * 0.5 + 0.5;
                    gl_Position = vec4(position, 0.0, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                in vec2 vUv;
                out vec4 fragColor;
                
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform sampler2D u_tex;

                ${oklabFns}

                float hash(vec2 p) {
                    p = fract(p * vec2(127.1, 311.7));
                    p += dot(p, p + 45.32);
                    return fract(p.x * p.y);
                }

                // ABSOLUTE COLOR ENFORCER: Cross-Processing + Aesthetic Constraints
                vec3 enforceColorRules(vec3 rgb, vec2 uv) {
                    vec3 lab = linear_srgb_to_oklab(rgb);
                    
                    // 1. NO BLACK / NO WHITE (Clamp Luminance)
                    // L range: 0.25 (deep shadow) to 0.85 (bright highlight)
                    lab.x = clamp(lab.x, 0.25, 0.85);
                    
                    // 2. ENFORCE HIGH SATURATION
                    float C = length(lab.yz);
                    if (C < 0.18) {
                        // Inject vivid color into neutral zones
                        float angle = uv.x * 15.0 - uv.y * 10.0 + u_time * 2.0;
                        lab.y = 0.22 * cos(angle);
                        lab.z = 0.22 * sin(angle);
                    } else {
                        // Boost existing chroma heavily
                        lab.yz *= 1.5; 
                    }
                    
                    // 3. TONE-DEPENDENT CHEMISTRY (Cross-Processing)
                    float currentAngle = atan(lab.z, lab.y);
                    
                    if (lab.x < 0.45) {
                        // Shadows map to indigo, plum, peacock green
                        float targetAngle = -1.0 + 0.5 * sin(uv.x * 4.0 + u_time); 
                        float newAngle = mix(currentAngle, targetAngle, 0.7);
                        float newC = max(C * 1.2, 0.25); 
                        lab.y = newC * cos(newAngle);
                        lab.z = newC * sin(newAngle);
                    } else if (lab.x > 0.7) {
                        // Highlights map to acid yellow, hot pink, neon cyan
                        float targetAngle = 1.5 + 2.5 * cos(uv.y * 6.0 - u_time);
                        float newAngle = mix(currentAngle, targetAngle, 0.6);
                        float newC = max(C * 1.1, 0.2);
                        lab.y = newC * cos(newAngle);
                        lab.z = newC * sin(newAngle);
                    }

                    return clamp(oklab_to_linear_srgb(lab), 0.0, 1.0);
                }

                void main() {
                    vec2 uv = vUv;
                    
                    // --- VHS TRACKING & DAMAGE ---
                    // Horizontal wobble
                    float wobble = sin(uv.y * 40.0 + u_time * 15.0) * exp(-fract(u_time * 1.5) * 4.0);
                    uv.x += wobble * 0.015;
                    
                    // Head-switching band at bottom
                    if (uv.y < 0.05) {
                        uv.x += (hash(uv + u_time) - 0.5) * 0.05;
                    }

                    // --- CHROMATIC ABERRATION (Spectral Prism Fracture) ---
                    vec2 dir = normalize(uv - 0.5);
                    float dist = length(uv - 0.5);
                    vec3 ca_col = vec3(0.0);
                    float w_sum = 0.0;
                    
                    // Multi-sample physical spectral separation
                    for(int i=0; i<6; i++) {
                        float f = float(i)/5.0;
                        float offset = f * 0.06 * dist; // Wider at edges
                        vec2 sample_uv = uv - dir * offset;
                        vec3 s = texture(u_tex, sample_uv).rgb;
                        
                        // Tint samples to mimic structural spectral bands
                        vec3 tint = cos(f * 6.283 + vec3(0.0, 2.09, 4.18)) * 0.5 + 0.5;
                        ca_col += s * tint;
                        w_sum += 1.0;
                    }
                    vec3 baseCol = ca_col / w_sum;

                    // --- RISOGRAPH PRINT LOGIC ---
                    // Halftone screens
                    float lpi = 120.0;
                    float angle1 = 0.785; // 45 deg
                    float angle2 = 1.309; // 75 deg
                    vec2 rot1 = mat2(cos(angle1), -sin(angle1), sin(angle1), cos(angle1)) * uv;
                    vec2 rot2 = mat2(cos(angle2), -sin(angle2), sin(angle2), cos(angle2)) * uv;
                    
                    float dot1 = sin(rot1.x * lpi) * sin(rot1.y * lpi);
                    float dot2 = sin(rot2.x * lpi) * sin(rot2.y * lpi);
                    
                    // Map color channels to ink coverage (simulated misregistration)
                    vec2 misreg = vec2(0.005, -0.003) * sin(u_time);
                    vec3 col_shift = texture(u_tex, uv + misreg).rgb;
                    
                    float ht1 = step(dot1, (baseCol.r - 0.4) * 2.0);
                    float ht2 = step(dot2, (col_shift.b - 0.4) * 2.0);
                    
                    // Define vibrant "inks" and "paper" (No white/black)
                    vec3 ink1 = vec3(0.0, 0.9, 0.8); // Electric Cyan
                    vec3 ink2 = vec3(1.0, 0.0, 0.5); // Fluorescent Pink
                    vec3 paper = vec3(0.9, 1.0, 0.1); // Acid Yellow paper
                    
                    vec3 riso = paper;
                    riso = mix(riso, ink1, ht1 * 0.85);
                    riso = mix(riso, ink2, ht2 * 0.85);
                    // Ink Overlap (Multiply blend)
                    if (ht1 > 0.5 && ht2 > 0.5) riso *= mix(ink1, ink2, 0.5) * 0.6;
                    
                    // Blend Riso print texture with the spectral dream-image
                    vec3 finalCol = mix(baseCol, riso, 0.35);

                    // --- VHS DROPOUT / TAPE SCARS ---
                    float dropout = hash(vec2(floor(uv.y * 300.0), floor(u_time * 20.0)));
                    if (dropout > 0.98) {
                        // Colored dropouts (no pure white)
                        finalCol = getSaturatedColor(uv.x + u_time);
                    }

                    // --- ABSOLUTE COLOR ENFORCEMENT ---
                    finalCol = enforceColorRules(finalCol, uv);

                    fragColor = vec4(finalCol, 1.0);
                }
            `
        });

        const quadGeo = new THREE.BufferGeometry();
        quadGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
            -1, -1,  1, -1,  -1, 1,
            -1,  1,  1, -1,   1, 1
        ]), 2));

        const meshSim = new THREE.Mesh(quadGeo, simMat);
        sceneSim.add(meshSim);

        const meshDisp = new THREE.Mesh(quadGeo, dispMat);
        sceneDisp.add(meshDisp);

        canvas.__three = { renderer, sceneSim, sceneDisp, camera, rtA, rtB, simMat, dispMat };
    }

    const t3 = canvas.__three;
    
    // Handle resizing
    t3.renderer.setSize(grid.width, grid.height, false);
    t3.rtA.setSize(grid.width, grid.height);
    t3.rtB.setSize(grid.width, grid.height);

    // 1. Simulation Pass (CA + Raymarch + Datamosh) -> rtB
    t3.simMat.uniforms.u_time.value = time;
    t3.simMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    t3.simMat.uniforms.u_prev.value = t3.rtA.texture;
    
    t3.renderer.setRenderTarget(t3.rtB);
    t3.renderer.render(t3.sceneSim, t3.camera);

    // 2. Display Pass (Post-FX + Color Enforcement) -> Screen
    t3.dispMat.uniforms.u_time.value = time;
    t3.dispMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    t3.dispMat.uniforms.u_tex.value = t3.rtB.texture;
    
    t3.renderer.setRenderTarget(null);
    t3.renderer.render(t3.sceneDisp, t3.camera);

    // 3. Swap ping-pong buffers
    const temp = t3.rtA;
    t3.rtA = t3.rtB;
    t3.rtB = temp;

} catch (e) {
    console.error("Prismatic Tape Oracle Initialization Failed:", e);
    throw e;
}