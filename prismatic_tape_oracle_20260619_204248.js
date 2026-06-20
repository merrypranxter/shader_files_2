export default function(ctx, grid, time, repos, input, mouse, canvas, THREE) {
    if (!canvas.__three) {
        try {
            if (!ctx) throw new Error("WebGL 2 context not available");

            const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
            renderer.autoClear = false;

            const scene = new THREE.Scene();
            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

            // Floating point render targets for CA state and Datamosh feedback
            const rtOptions = {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: THREE.FloatType,
                depthBuffer: false,
                stencilBuffer: false
            };

            const fboStateA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
            const fboStateB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
            const fboColorA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
            const fboColorB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

            const geometry = new THREE.PlaneGeometry(2, 2);

            // COMMON GLSL CHUNKS
            const oklabGLSL = `
                vec3 srgb_to_oklab(vec3 c) {
                    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
                    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
                    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
                    return vec3(
                        0.2104542553 * pow(max(l, 0.0), 1.0/3.0) + 0.7936177850 * pow(max(m, 0.0), 1.0/3.0) - 0.0040720468 * pow(max(s, 0.0), 1.0/3.0),
                        1.9779984951 * pow(max(l, 0.0), 1.0/3.0) - 2.4285922050 * pow(max(m, 0.0), 1.0/3.0) + 0.4505937099 * pow(max(s, 0.0), 1.0/3.0),
                        0.0259040371 * pow(max(l, 0.0), 1.0/3.0) + 0.7827717662 * pow(max(m, 0.0), 1.0/3.0) - 0.8086757660 * pow(max(s, 0.0), 1.0/3.0)
                    );
                }
                vec3 oklab_to_srgb(vec3 c) {
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
                vec3 oklab_mix(vec3 a, vec3 b, float t) {
                    return oklab_to_srgb(mix(srgb_to_oklab(a), srgb_to_oklab(b), t));
                }
                float hash(vec2 p) {
                    p = fract(p * vec2(127.1, 311.7));
                    p += dot(p, p + 45.32);
                    return fract(p.x * p.y);
                }
                float noise(vec2 p) {
                    vec2 i = floor(p); vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
                }
                mat2 rot(float a) {
                    float s = sin(a), c = cos(a);
                    return mat2(c, -s, s, c);
                }
            `;

            // PASS 1: CELLULAR AUTOMATA & DATAMOSH VECTOR ENGINE
            const matState = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: { u_state: { value: null }, u_resolution: { value: new THREE.Vector2() }, u_time: { value: 0 } },
                vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
                fragmentShader: `
                    in vec2 vUv;
                    out vec4 fragColor;
                    uniform sampler2D u_state;
                    uniform vec2 u_resolution;
                    uniform float u_time;
                    ${oklabGLSL}

                    void main() {
                        vec2 texel = 1.0 / u_resolution;
                        float sum = 0.0;
                        for(int y=-1; y<=1; y++) {
                            for(int x=-1; x<=1; x++) {
                                if(x==0 && y==0) continue;
                                sum += texture(u_state, fract(vUv + vec2(x,y)*texel)).r;
                            }
                        }
                        vec4 curr = texture(u_state, vUv);
                        float val = curr.r;

                        // Lenia-lite continuous CA (Dream Physics Logic)
                        float v = sum / 8.0;
                        float growth = exp(-pow(v - 0.28, 2.0) * 80.0);
                        float death = exp(-pow(v - 0.55, 2.0) * 40.0);
                        val = clamp(val + growth * 0.15 - death * 0.08, 0.0, 1.0);
                        
                        // Seed chaos
                        if (hash(vUv * 10.0 + u_time) > 0.995) val = 1.0;
                        val *= 0.98; // Entropy

                        // Datamosh motion vectors driven by CA and Curl Noise
                        float ang = noise(vUv * 4.0 + u_time * 0.3) * 6.2831;
                        vec2 vel = vec2(cos(ang), sin(ang)) * val;

                        fragColor = vec4(val, curr.g + 0.02, vel.x, vel.y);
                    }
                `
            });

            // PASS 2: MASTER OP-ART, RISO & STRUCTURAL COLOR ENGINE
            const matColor = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: { 
                    u_state: { value: null }, 
                    u_prevColor: { value: null }, 
                    u_resolution: { value: new THREE.Vector2() }, 
                    u_time: { value: 0 },
                    u_mouse: { value: new THREE.Vector2() }
                },
                vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
                fragmentShader: `
                    in vec2 vUv;
                    out vec4 fragColor;
                    uniform sampler2D u_state;
                    uniform sampler2D u_prevColor;
                    uniform vec2 u_resolution;
                    uniform float u_time;
                    ${oklabGLSL}

                    float sdBox(vec2 p, vec2 b) {
                        vec2 d = abs(p) - b;
                        return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
                    }

                    vec3 structuralColor(float t) {
                        // Iridescent palette, avoiding grays.
                        vec3 a = vec3(0.6, 0.4, 0.7);
                        vec3 b = vec3(0.5, 0.6, 0.4);
                        vec3 c = vec3(1.0, 1.0, 1.0);
                        vec3 d = vec3(0.0, 0.33, 0.67);
                        vec3 col = a + b * cos(6.28318 * (c * t + d));
                        return clamp(col, 0.1, 0.9);
                    }

                    float halftone(vec2 uv, float lpi, float angle, float threshold) {
                        vec2 rotUV = uv * rot(angle);
                        vec2 cell = fract(rotUV * lpi) - 0.5;
                        float r = threshold * 0.65;
                        return smoothstep(r + 0.05, r - 0.05, length(cell));
                    }

                    void main() {
                        vec4 st = texture(u_state, vUv);
                        vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
                        vec2 p = (vUv * 2.0 - 1.0) * aspect;

                        // VHS Tape Wobble
                        p.x += sin(p.y * 12.0 + u_time * 4.0) * 0.015 * st.r;

                        // Datamosh Vector Read
                        vec2 mosh_uv = vUv - st.ba * 0.008;
                        vec3 prev = texture(u_prevColor, mosh_uv).rgb;

                        // Dream Physics Architecture
                        float d_portal = length(p) - 0.5;
                        vec2 inv_p = p;
                        float structural_t = 0.0;
                        
                        if (d_portal < 0.0) {
                            // Hyperbolic Inversion Tunnel
                            inv_p = p / dot(p, p);
                            inv_p *= rot(u_time * 0.15);
                            structural_t = length(inv_p) * 0.5 - u_time * 0.2;
                        } else {
                            inv_p *= rot(-u_time * 0.05);
                            structural_t = atan(p.y, p.x) / 6.28318 + u_time * 0.1;
                        }

                        // Op-Art Moiré Fields
                        float r1 = sin(length(inv_p) * 35.0 - u_time * 4.0);
                        float r2 = sin(length(inv_p - vec2(0.05)) * 37.0 - u_time * 3.2);
                        float interference = r1 * r2;

                        // Early Internet Asemic UI
                        float d_win1 = sdBox(p - vec2(0.4*sin(u_time*0.7), 0.3*cos(u_time*0.5)), vec2(0.3, 0.2));
                        float d_win2 = sdBox(p - vec2(-0.3*cos(u_time*0.6), -0.2*sin(u_time*0.4)), vec2(0.25, 0.35));
                        float ui_edge = step(abs(d_win1), 0.015) + step(abs(d_win2), 0.015);
                        float ui_fill = step(d_win1, 0.0) * 0.5 + step(d_win2, 0.0) * 0.3;

                        // Composite Structural Luminance
                        float structure = smoothstep(-0.5, 0.5, interference) + ui_edge + ui_fill;
                        structure = fract(structure + st.r * 0.6); // CA infects structure

                        // Risograph Style Logic
                        float lpi = 75.0 + 10.0 * sin(u_time * 0.2);
                        // Misregistration driven by CA state and time
                        vec2 misreg1 = vec2(0.01, 0.005) * st.r * sin(u_time);
                        vec2 misreg2 = vec2(-0.008, 0.01) * (1.0 - st.r) * cos(u_time);

                        float h1 = halftone(vUv, lpi, 0.785, structure); // 45 deg
                        float h2 = halftone(vUv + misreg1, lpi, 1.309, structure * 0.85); // 75 deg
                        float h3 = halftone(vUv + misreg2, lpi, 1.832, structure * 1.15); // 105 deg

                        // Saturated Palette (No Black/White)
                        vec3 paper = vec3(1.0, 0.35, 0.2); // Fluorescent Coral / Mango
                        vec3 ink1 = vec3(0.0, 0.9, 0.9);   // Neon Cyan
                        vec3 ink2 = vec3(1.0, 0.0, 0.6);   // Hot Pink
                        vec3 ink3 = vec3(0.8, 1.0, 0.0);   // Acid Yellow

                        // Subtractive / Multiply Blend
                        vec3 col = paper;
                        col = mix(col, col * ink1, h1);
                        col = mix(col, col * ink2, h2);
                        col = mix(col, col * ink3, h3);

                        // Structural Color Overlay (Prismatic edges)
                        vec3 prism = structuralColor(structural_t);
                        col = oklab_mix(col, prism, ui_edge * 0.8 + step(abs(d_portal), 0.02));

                        // Cross-Processing Tone Curve
                        float lum = dot(col, vec3(0.299, 0.587, 0.114));
                        vec3 shadowColor = vec3(0.0, 0.2, 0.35); // Deep Peacock Green / Petrol
                        vec3 midColor = vec3(0.9, 0.1, 0.5);     // Deep Magenta
                        vec3 highColor = vec3(1.0, 0.85, 0.0);   // Electric Acid Yellow
                        
                        vec3 cross_col = oklab_mix(shadowColor, midColor, smoothstep(0.0, 0.5, lum));
                        cross_col = oklab_mix(cross_col, highColor, smoothstep(0.5, 1.0, lum));
                        
                        // Blend Riso with Cross-Process logic
                        col = oklab_mix(col, cross_col, 0.6);

                        // Temporal Ghosting (Datamosh Memory)
                        float ghost_factor = 0.82 + 0.15 * st.r; // CA drives memory persistence
                        vec3 final_col = oklab_mix(col, prev, ghost_factor);

                        fragColor = vec4(final_col, 1.0);
                    }
                `
            });

            // PASS 3: DISPLAY (VHS Damage, Dropouts, Head Switching, Chromatic Aberration)
            const matDisplay = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: { u_color: { value: null }, u_time: { value: 0 }, u_resolution: { value: new THREE.Vector2() } },
                vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
                fragmentShader: `
                    in vec2 vUv;
                    out vec4 fragColor;
                    uniform sampler2D u_color;
                    uniform float u_time;
                    uniform vec2 u_resolution;
                    ${oklabGLSL}

                    void main() {
                        vec2 uv = vUv;

                        // VHS Head Switching (bottom 6%)
                        if (uv.y < 0.06) {
                            uv.x += (hash(uv.y * 150.0 + u_time * 10.0) - 0.5) * 0.08;
                        }

                        // Chromatic Aberration (Lens / Tape distortion)
                        float ca = 0.004 + 0.003 * sin(u_time * 2.0 + uv.y * 10.0);
                        float r = texture(u_color, fract(uv + vec2(ca, 0.0))).r;
                        float g = texture(u_color, fract(uv)).g;
                        float b = texture(u_color, fract(uv - vec2(ca, 0.0))).b;
                        vec3 col = vec3(r, g, b);

                        // Tape Dropouts (Colored Saturated Streaks, NOT white/black)
                        float drop = hash(vec2(uv.y * 12.0, u_time * 25.0));
                        if (drop > 0.985) {
                            float drop_type = hash(vec2(uv.x, u_time));
                            if (drop_type > 0.66) {
                                col = oklab_mix(col, vec3(0.0, 1.0, 0.8), 0.9); // Neon Cyan
                            } else if (drop_type > 0.33) {
                                col = oklab_mix(col, vec3(1.0, 0.0, 0.6), 0.9); // Hot Pink
                            } else {
                                col = oklab_mix(col, vec3(0.8, 1.0, 0.0), 0.9); // Acid Yellow
                            }
                        }

                        // Absolute Color Rule Enforcement: Clamp to avoid pure black/white
                        // Ensure lowest value is a saturated shadow, highest is tinted
                        col = clamp(col, 0.05, 0.95);
                        
                        // Add a subtle colored VHS noise field (no grayscale noise)
                        vec3 colored_noise = vec3(
                            noise(uv * u_resolution + u_time * 1.1),
                            noise(uv * u_resolution + u_time * 1.2 + 10.0),
                            noise(uv * u_resolution + u_time * 1.3 + 20.0)
                        );
                        col = oklab_mix(col, colored_noise, 0.08);

                        fragColor = vec4(col, 1.0);
                    }
                `
            });

            const meshState = new THREE.Mesh(geometry, matState);
            const sceneState = new THREE.Scene();
            sceneState.add(meshState);

            const meshColor = new THREE.Mesh(geometry, matColor);
            const sceneColor = new THREE.Scene();
            sceneColor.add(meshColor);

            const meshDisplay = new THREE.Mesh(geometry, matDisplay);
            const sceneDisplay = new THREE.Scene();
            sceneDisplay.add(meshDisplay);

            canvas.__three = {
                renderer, camera, 
                sceneState, sceneColor, sceneDisplay,
                matState, matColor, matDisplay,
                fboStateA, fboStateB, fboColorA, fboColorB,
                pingpong: 0
            };
        } catch (e) {
            console.error("Prismatic Tape Oracle Initialization Failed:", e);
            return;
        }
    }

    const sys = canvas.__three;
    const { renderer, camera, sceneState, sceneColor, sceneDisplay, matState, matColor, matDisplay } = sys;

    // Handle Resize
    renderer.setSize(grid.width, grid.height, false);
    const res = new THREE.Vector2(grid.width, grid.height);
    
    sys.fboStateA.setSize(grid.width, grid.height);
    sys.fboStateB.setSize(grid.width, grid.height);
    sys.fboColorA.setSize(grid.width, grid.height);
    sys.fboColorB.setSize(grid.width, grid.height);

    const timeSec = time;

    // Ping-Pong Logic
    const stateRead = sys.pingpong % 2 === 0 ? sys.fboStateA : sys.fboStateB;
    const stateWrite = sys.pingpong % 2 === 0 ? sys.fboStateB : sys.fboStateA;
    const colorRead = sys.pingpong % 2 === 0 ? sys.fboColorA : sys.fboColorB;
    const colorWrite = sys.pingpong % 2 === 0 ? sys.fboColorB : sys.fboColorA;

    // PASS 1: Update State (CA + Datamosh Vectors)
    matState.uniforms.u_state.value = stateRead.texture;
    matState.uniforms.u_time.value = timeSec;
    matState.uniforms.u_resolution.value = res;
    renderer.setRenderTarget(stateWrite);
    renderer.render(sceneState, camera);

    // PASS 2: Master Render (Op-Art, Riso, Cross-Processing, Ghosting)
    matColor.uniforms.u_state.value = stateWrite.texture;
    matColor.uniforms.u_prevColor.value = colorRead.texture;
    matColor.uniforms.u_time.value = timeSec;
    matColor.uniforms.u_resolution.value = res;
    if (mouse && matColor.uniforms.u_mouse) {
        matColor.uniforms.u_mouse.value.set(mouse.x, mouse.y);
    }
    renderer.setRenderTarget(colorWrite);
    renderer.render(sceneColor, camera);

    // PASS 3: Display output to Canvas (VHS, Chromatic Aberration)
    matDisplay.uniforms.u_color.value = colorWrite.texture;
    matDisplay.uniforms.u_time.value = timeSec;
    matDisplay.uniforms.u_resolution.value = res;
    renderer.setRenderTarget(null);
    renderer.render(sceneDisplay, camera);

    // Swap buffers
    sys.pingpong++;
}