if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const mainScene = new THREE.Scene();
        const postScene = new THREE.Scene();

        const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, {
            type: THREE.HalfFloatType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping
        });
        const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, {
            type: THREE.HalfFloatType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping
        });

        const geo = new THREE.PlaneGeometry(2, 2);

        const mainMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_mouse: { value: new THREE.Vector2() },
                u_mouse_vel: { value: new THREE.Vector2() },
                u_history: { value: null }
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
                uniform vec2 u_mouse;
                uniform vec2 u_mouse_vel;
                uniform sampler2D u_history;

                #define PI 3.14159265359

                vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
                vec2 cdiv(vec2 a, vec2 b) { float d = dot(b,b)+1e-9; return vec2(dot(a,b), a.y*b.x - a.x*b.y)/d; }
                vec2 cpow(vec2 z, float n) { float r=length(z), t=atan(z.y, z.x); return pow(r,n)*vec2(cos(n*t), sin(n*t)); }

                vec2 kal(vec2 p, float n) {
                    float a = atan(p.y, p.x);
                    float r = length(p);
                    float s = 6.2831853 / n;
                    a = mod(a, s);
                    a = min(a, s - a);
                    return r * vec2(cos(a), sin(a));
                }

                vec3 incal(vec2 uv, vec2 center, float t, bool vacuum) {
                    vec2 z = uv - center;
                    
                    // Retinotopic Kaleidoscope
                    z = kal(z, vacuum ? 5.0 : 6.0);
                    
                    // Log-polar conformal map
                    z = vec2(log(length(z) + 1e-4), atan(z.y, z.x));
                    z.x += t * 0.35; // Forward plunge into the throat
                    z.y += sin(t * 0.2) * 0.5; // Breathing rotation
                    
                    z = exp(z.x) * vec2(cos(z.y), sin(z.y));
                    
                    // Möbius twist logic
                    float twist = t * 0.4;
                    vec2 m_a = vec2(cos(twist), sin(twist));
                    vec2 m_b = vec2(0.5, -0.2);
                    vec2 m_c = vec2(-0.3, 0.4);
                    vec2 m_d = vec2(1.0, 0.0);
                    z = cdiv(cmul(m_a, z) + m_b, cmul(m_c, z) + m_d);
                    
                    // Domain coloring complex function
                    vec2 w = cdiv(cpow(z, 5.0) - vec2(1.0, 0.0), cpow(z, 3.0) + vec2(0.7*cos(t*0.5), 0.7*sin(t*0.5)));
                    
                    float phase = atan(w.y, w.x) / 6.2831853 + 0.5;
                    float mag = length(w);
                    float logmag = log2(mag + 1e-4);
                    
                    // Emerald / Jewel Palette
                    vec3 pal_a = vec3(0.05, 0.55, 0.35);
                    vec3 pal_b = vec3(0.35, 0.45, 0.45);
                    vec3 pal_c = vec3(1.0, 1.0, 1.0);
                    vec3 pal_d = vec3(0.3, 0.15, 0.8); // Emerald to ultraviolet
                    
                    if (vacuum) {
                        // Translated physics inside the bubble
                        pal_a = vec3(0.7, 0.1, 0.4); // Acid pink
                        pal_d = vec3(0.1, 0.7, 0.9); // Cyan translation
                    }
                    
                    vec3 col = pal_a + pal_b * cos(6.2831853 * (pal_c * phase + pal_d));
                    
                    // Sacred engineering inscriptions (Contour rings & branch cuts)
                    float contour = smoothstep(0.0, 0.12, abs(fract(logmag * 2.0) - 0.5));
                    float branch = smoothstep(0.0, 0.05, abs(fract(phase * 6.0) - 0.5));
                    
                    col *= mix(0.2, 1.0, contour);
                    
                    // Out of gamut flashes on the cuts
                    vec3 cut_color = vacuum ? vec3(1.0, 0.9, 0.0) : vec3(0.0, 1.0, 0.7);
                    col += cut_color * (1.0 - branch) * 1.5;
                    
                    return col;
                }

                void main() {
                    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
                    vec2 mouse_uv = (u_mouse - 0.5 * u_resolution) / u_resolution.y;
                    if (length(u_mouse) < 1.0) mouse_uv = vec2(0.0);
                    
                    // Predictive Ghosting (Temporal Desync)
                    vec2 ghost_uv = mouse_uv + (u_mouse_vel / u_resolution.y) * 0.18; // 180ms lead
                    
                    // False Vacuum Decay Front
                    float vacuum_r = mod(u_time * 0.7, 14.0); // Reality transition wave
                    float d_center = length(uv);
                    bool in_vacuum = d_center < vacuum_r;
                    
                    vec3 col_now = incal(uv, mouse_uv, u_time, in_vacuum);
                    vec3 col_ghost = incal(uv, ghost_uv, u_time + 0.18, in_vacuum);
                    
                    if (in_vacuum) {
                        // Alien chemistry inversion
                        col_now = vec3(1.0) - col_now.gbr;
                        col_ghost = vec3(1.0) - col_ghost.gbr;
                    }
                    
                    // Wall plasma fire
                    float wall_dist = abs(d_center - vacuum_r);
                    float wall_fire = exp(-wall_dist * 60.0) + 0.3 * exp(-wall_dist * 12.0);
                    vec3 plasma = vec3(0.8, 1.0, 0.9) * wall_fire * 3.5; // White-hot/cyan plasma front
                    
                    vec3 final_col = mix(col_now, col_ghost, 0.35) + plasma;
                    
                    // Temporal Buffer Feedback / Retinal Afterimage
                    vec2 hist_uv = gl_FragCoord.xy / u_resolution;
                    vec2 cuv = hist_uv - 0.5;
                    hist_uv -= cuv * 0.006; // Radial pull inward for feedback cascade
                    
                    vec3 hist = texture(u_history, hist_uv).rgb;
                    
                    // Additive persistence
                    final_col = max(final_col, hist * 0.85);
                    
                    fragColor = vec4(final_col, 1.0);
                }
            `
        });
        mainScene.add(new THREE.Mesh(geo, mainMat));

        const postMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_scene: { value: null }
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

                uniform sampler2D u_scene;
                uniform vec2 u_resolution;
                uniform float u_time;

                // Floating point dementia quantization
                vec3 quantize(vec3 c, float bits) {
                    float levels = exp2(max(bits, 1.0));
                    return floor(c * levels + 0.5) / levels;
                }

                void main() {
                    vec2 uv = gl_FragCoord.xy / u_resolution;
                    vec2 cuv = uv - 0.5;
                    float r2 = dot(cuv, cuv);
                    
                    // Chromostereopsis CA & Prism Dispersion
                    // Red pushes forward (scales out), Blue recedes (scales in)
                    float ca = 0.014 * r2;
                    vec2 r_uv = uv + cuv * ca;
                    vec2 b_uv = uv - cuv * ca;
                    
                    float r = texture(u_scene, r_uv).r;
                    float g = texture(u_scene, uv).g;
                    float b = texture(u_scene, b_uv).b;
                    
                    vec3 col = vec3(r, g, b);
                    
                    // Floating point dementia at edges
                    float bits = 25.0 - 48.0 * r2;
                    if (bits < 12.0) {
                        col = quantize(col, bits);
                        // NaN purple corruption freckles
                        float n = fract(sin(dot(uv, vec2(12.9898, 78.233)) + u_time) * 43758.5453);
                        if (n > 0.985) col = mix(col, vec3(0.8, 0.0, 1.0), 0.85); 
                    }
                    
                    // Vignette
                    col *= 1.0 - r2 * 1.6;
                    
                    // ACES Tonemap
                    col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);
                    
                    // Gamma correction
                    col = pow(col, vec3(1.0 / 2.2));
                    
                    fragColor = vec4(col, 1.0);
                }
            `
        });
        postScene.add(new THREE.Mesh(geo, postMat));

        canvas.__three = {
            renderer, camera, mainScene, postScene, mainMat, postMat, rtA, rtB,
            mouseState: { px: mouse.x, py: mouse.y, vx: 0, vy: 0, lastTime: time }
        };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        throw e;
    }
}

const t = canvas.__three;

t.renderer.setSize(grid.width, grid.height, false);
t.rtA.setSize(grid.width, grid.height);
t.rtB.setSize(grid.width, grid.height);

const ms = t.mouseState;
const dt = Math.max(0.001, time - ms.lastTime);
const vx = (mouse.x - ms.px) / dt;
const vy = (mouse.y - ms.py) / dt;

ms.vx = ms.vx * 0.8 + vx * 0.2;
ms.vy = ms.vy * 0.8 + vy * 0.2;
ms.px = mouse.x;
ms.py = mouse.y;
ms.lastTime = time;

if (t.mainMat && t.mainMat.uniforms) {
    t.mainMat.uniforms.u_time.value = time;
    t.mainMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    t.mainMat.uniforms.u_mouse.value.set(mouse.x, grid.height - mouse.y);
    t.mainMat.uniforms.u_mouse_vel.value.set(ms.vx, -ms.vy);
    t.mainMat.uniforms.u_history.value = t.rtA.texture;
}

if (t.postMat && t.postMat.uniforms) {
    t.postMat.uniforms.u_time.value = time;
    t.postMat.uniforms.u_resolution.value.set(grid.width, grid.height);
}

t.renderer.setRenderTarget(t.rtB);
t.renderer.render(t.mainScene, t.camera);

if (t.postMat && t.postMat.uniforms) {
    t.postMat.uniforms.u_scene.value = t.rtB.texture;
}

t.renderer.setRenderTarget(null);
t.renderer.render(t.postScene, t.camera);

const temp = t.rtA;
t.rtA = t.rtB;
t.rtB = temp;