if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;

        const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, {
            type: THREE.HalfFloatType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            depthBuffer: false
        });
        const rtB = rtA.clone();

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const sceneBuffer = new THREE.Scene();
        const sceneDisplay = new THREE.Scene();

        const quadGeo = new THREE.PlaneGeometry(2, 2);

        const matBuffer = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
                u_mouse_vel: { value: new THREE.Vector2(0, 0) },
                u_prev: { value: rtA.texture }
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
                uniform vec2 u_mouse_vel;
                uniform sampler2D u_prev;

                #define MAX_STEPS 64
                #define MAX_DIST 20.0
                #define SURF_DIST 0.002

                mat2 rot(float a) {
                    float s = sin(a), c = cos(a);
                    return mat2(c, -s, s, c);
                }

                vec3 spectralColor(float wl) {
                    float r = max(0.0, 1.0 - abs(wl - 620.0)/80.0) + max(0.0, 1.0 - abs(wl - 400.0)/60.0)*0.6;
                    float g = max(0.0, 1.0 - abs(wl - 530.0)/80.0);
                    float b = max(0.0, 1.0 - abs(wl - 450.0)/80.0);
                    return clamp(vec3(r, g, b), 0.0, 1.0);
                }

                vec3 ironbow(float t) {
                    return clamp(vec3(
                        1.8 * t,
                        2.2 * t * t - 0.4,
                        3.0 * t * t * t - 1.5
                    ) + vec3(0.1, 0.0, 0.4)*(1.0-t), 0.0, 1.0);
                }

                float sdOctahedron(vec3 p, float s) {
                    p = abs(p);
                    return (p.x + p.y + p.z - s) * 0.57735;
                }

                float smin(float a, float b, float k) {
                    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
                    return mix(b, a, h) - k * h * (1.0 - h);
                }

                vec2 map(vec3 p) {
                    vec3 p_orig = p;

                    // Floating Point Dementia (Precision Loss at edges)
                    float dist = length(p);
                    if (dist > 3.5) {
                        float q = exp2(clamp(16.0 - dist * 1.5, 1.0, 16.0));
                        p = floor(p * q) / q;
                    }

                    // Color Space Morphing (Coordinate Twisting)
                    float morph = sin(u_time * 0.2) * 0.5 + 0.5;
                    p.xy *= rot(p.z * 0.25 * morph);
                    p.yz *= rot(u_time * 0.15);
                    p.xz *= rot(u_time * 0.2);

                    float d_oct = sdOctahedron(p, 1.2);
                    float d_sph = length(p) - 1.0;
                    float d_main = mix(d_oct, d_sph, morph);

                    // Semi-liquid facets
                    d_main += sin(p.x * 10.0 + u_time) * sin(p.y * 10.0) * sin(p.z * 10.0) * 0.04;

                    // Predictive Temporal Ghost
                    vec3 ghost_pos = vec3((u_mouse * 2.0 - 1.0) * vec2(u_resolution.x / u_resolution.y, 1.0) * 3.0, 0.0);
                    ghost_pos += vec3(u_mouse_vel * 40.0, 0.0); 
                    float d_ghost = sdOctahedron(p_orig - ghost_pos, 0.25);

                    float d = smin(d_main, d_ghost, 0.3);
                    float id = (d == d_ghost) ? 2.0 : 1.0;

                    return vec2(d, id);
                }

                vec3 getNormal(vec3 p) {
                    vec2 e = vec2(0.002, 0);
                    return normalize(vec3(
                        map(p + e.xyy).x - map(p - e.xyy).x,
                        map(p + e.yxy).x - map(p - e.yxy).x,
                        map(p + e.yyx).x - map(p - e.yyx).x
                    ));
                }

                vec3 getBackground(vec3 dir, vec3 pos) {
                    vec3 c = vec3(0.0);

                    // Moiré interference sheets
                    float m1 = sin(dot(dir, vec3(25.0, 12.0, 8.0)) - u_time * 1.5);
                    float m2 = sin(dot(dir, vec3(8.0, 25.0, 12.0)) + u_time * 2.0);
                    c += vec3(1.0, 0.1, 0.7) * smoothstep(0.85, 1.0, m1 * m2) * 0.6;

                    // White-hot incoming beam
                    float beamY = dir.y * 12.0 + sin(dir.x * 6.0 - u_time * 2.0) * 0.8;
                    float beam = exp(-(beamY * beamY)) * smoothstep(0.6, -0.6, dir.x);
                    c += vec3(1.0, 0.95, 0.9) * beam * 2.0;

                    // Simultaneous Contrast Traps (Nodes)
                    vec2 uv = dir.xy;
                    float d1 = length(uv - vec2(-0.7, 0.5));
                    float d2 = length(uv - vec2(0.7, -0.5));
                    
                    // Node 1: Gray in bright acid green/yellow surround
                    c += vec3(0.5) * smoothstep(0.04, 0.035, d1);
                    c += vec3(0.8, 1.0, 0.0) * exp(-d1 * 18.0) * smoothstep(0.035, 0.04, d1);
                    
                    // Node 2: Gray in dark ultra-violet surround
                    c += vec3(0.5) * smoothstep(0.04, 0.035, d2);
                    c += vec3(0.2, 0.0, 0.8) * exp(-d2 * 18.0) * smoothstep(0.035, 0.04, d2);

                    c += vec3(0.02, 0.01, 0.03); // Deep optical void
                    return c;
                }

                void main() {
                    vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
                    
                    vec3 ro = vec3(0.0, 0.0, 4.0);
                    vec3 rd = normalize(vec3(p, -1.0));

                    // Temporal flow for feedback
                    vec2 flow_uv = vUv + (vUv - 0.5) * 0.003; 
                    vec4 prev = texture(u_prev, flow_uv);

                    float t = 0.0;
                    vec2 h;
                    for(int i = 0; i < MAX_STEPS; i++) {
                        h = map(ro + rd * t);
                        if(h.x < SURF_DIST || t > MAX_DIST) break;
                        t += h.x;
                    }

                    vec3 col = vec3(0.0);

                    if (t < MAX_DIST) {
                        vec3 p_hit = ro + rd * t;
                        vec3 n = getNormal(p_hit);

                        if (h.y == 1.0 || h.y == 2.0) {
                            // Per-wavelength dispersion
                            vec3 refr_col = vec3(0.0);
                            float SAMPLES = 8.0;
                            
                            for(float i = 0.0; i < SAMPLES; i++) {
                                float wl = 380.0 + 320.0 * (i / (SAMPLES - 1.0));
                                vec3 sc = spectralColor(wl);
                                
                                // Cauchy dispersion approximation
                                float ior = 1.35 + 0.025 / ((wl / 1000.0) * (wl / 1000.0));
                                
                                vec3 rd_in = refract(rd, n, 1.0 / ior);
                                if (length(rd_in) == 0.0) rd_in = reflect(rd, n);
                                
                                vec3 p_exit = p_hit + rd_in * 1.5;
                                vec3 n_exit = -n; 
                                vec3 rd_out = refract(rd_in, n_exit, ior);
                                if (length(rd_out) == 0.0) rd_out = reflect(rd_in, n_exit);
                                
                                vec3 bg = getBackground(rd_out, p_exit);
                                
                                // Diffraction Grating Interference
                                float grating = sin(dot(p_hit, vec3(70.0, -40.0, 80.0)) - u_time * 12.0);
                                sc *= 0.6 + 0.6 * grating;
                                
                                refr_col += sc * bg;
                            }
                            col = refr_col / SAMPLES;

                            // False-color thermal mapping on forward-facing facets
                            float heat = max(0.0, dot(n, normalize(vec3(-1.0, 0.5, 0.8))));
                            col += ironbow(heat) * 0.5;

                            // NaN Purple Corruption Bloom
                            if (fract(sin(dot(p_hit.xy, vec2(12.9898, 78.233))) * 43758.5453) > 0.998) {
                                col = vec3(0.9, 0.0, 1.0);
                            }
                        }
                    } else {
                        col = getBackground(rd, ro + rd * MAX_DIST);
                    }

                    // Afterimage adaptation burn-in
                    float luma = dot(col, vec3(0.299, 0.587, 0.114));
                    float burn_rate = 0.09;
                    float adapt_decay = 0.95;
                    float new_adapt = prev.a * adapt_decay + luma * burn_rate;

                    // Temporal accumulation
                    vec3 final_col = mix(col, prev.rgb, 0.78);

                    fragColor = vec4(final_col, new_adapt);
                }
            `
        });

        const matDisplay = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_buffer: { value: rtB.texture }
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

                uniform sampler2D u_buffer;
                uniform vec2 u_resolution;
                uniform float u_time;

                void main() {
                    vec4 buf = texture(u_buffer, vUv);
                    vec3 col = buf.rgb;
                    float adapt = buf.a;

                    // Afterimage Ghosting (Complementary subtraction)
                    vec3 complement = vec3(1.0) - col;
                    col += complement * adapt * 0.55;

                    // Solarization (Sabattier effect curve)
                    float luma = dot(col, vec3(0.299, 0.587, 0.114));
                    float thresh = 0.8;
                    if (luma > thresh) {
                        float fold = thresh - (luma - thresh);
                        col *= (fold / max(luma, 0.001));
                    }

                    // Mackie Lines (Sobel High-pass)
                    vec2 px = 1.0 / u_resolution;
                    float l1 = texture(u_buffer, vUv + vec2(-px.x, 0)).a;
                    float l2 = texture(u_buffer, vUv + vec2(px.x, 0)).a;
                    float l3 = texture(u_buffer, vUv + vec2(0, -px.y)).a;
                    float l4 = texture(u_buffer, vUv + vec2(0, px.y)).a;
                    float edge = abs(l1 - l2) + abs(l3 - l4);
                    
                    // Golden/Acid Mackie Halos
                    col += vec3(1.0, 0.8, 0.1) * edge * 3.5; 

                    // ACES Tone Mapping
                    col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);

                    // Vignette
                    float d = length(vUv - 0.5);
                    col *= smoothstep(0.85, 0.25, d);

                    // Chromatic Shimmer Grain
                    float gR = fract(sin(dot(vUv, vec2(12.9898, 78.233)) + u_time) * 43758.5453);
                    float gG = fract(sin(dot(vUv, vec2(39.346, 11.135)) + u_time) * 43758.5453);
                    float gB = fract(sin(dot(vUv, vec2(73.156, 52.235)) + u_time) * 43758.5453);
                    col += (vec3(gR, gG, gB) - 0.5) * 0.06;

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        sceneBuffer.add(new THREE.Mesh(quadGeo, matBuffer));
        sceneDisplay.add(new THREE.Mesh(quadGeo, matDisplay));

        canvas.__three = {
            renderer, camera,
            sceneBuffer, sceneDisplay,
            matBuffer, matDisplay,
            rtA, rtB,
            vel: new THREE.Vector2(),
            lastMouse: new THREE.Vector2(0.5, 0.5),
            swap: false
        };
    } catch(e) {
        console.error("Initialization Failed:", e);
        throw e;
    }
}

const t = canvas.__three;

if (t.rtA.width !== grid.width || t.rtA.height !== grid.height) {
    t.renderer.setSize(grid.width, grid.height, false);
    t.rtA.setSize(grid.width, grid.height);
    t.rtB.setSize(grid.width, grid.height);
    t.matBuffer.uniforms.u_resolution.value.set(grid.width, grid.height);
    t.matDisplay.uniforms.u_resolution.value.set(grid.width, grid.height);
}

const mx = mouse.x / grid.width;
const my = 1.0 - (mouse.y / grid.height);
const dx = mx - t.lastMouse.x;
const dy = my - t.lastMouse.y;
t.lastMouse.set(mx, my);

t.vel.x += (dx - t.vel.x) * 0.08;
t.vel.y += (dy - t.vel.y) * 0.08;

t.matBuffer.uniforms.u_time.value = time;
t.matBuffer.uniforms.u_mouse.value.set(mx, my);
t.matBuffer.uniforms.u_mouse_vel.value.copy(t.vel);
t.matDisplay.uniforms.u_time.value = time;

const readRT = t.swap ? t.rtB : t.rtA;
const writeRT = t.swap ? t.rtA : t.rtB;

t.matBuffer.uniforms.u_prev.value = readRT.texture;

t.renderer.setRenderTarget(writeRT);
t.renderer.render(t.sceneBuffer, t.camera);

t.matDisplay.uniforms.u_buffer.value = writeRT.texture;
t.renderer.setRenderTarget(null);
t.renderer.render(t.sceneDisplay, t.camera);

t.swap = !t.swap;