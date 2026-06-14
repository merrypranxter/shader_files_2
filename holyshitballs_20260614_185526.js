function sketch({ ctx, grid, time, canvas, THREE }) {
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
                    gl_Position = vec4(position, 1.0);
                }
            `;
            
            const fragmentShader = `
                in vec2 vUv;
                out vec4 fragColor;

                uniform float u_time;
                uniform float u_aspect;

                #define PI 3.14159265359
                #define TAU 6.28318530718

                // ─── 1. ENTROPY & RAINBLOWN DISTORTION (THE-LISTS / Glitch) ───
                float noise(vec2 p) {
                    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                }

                float fbm(vec2 p) {
                    float f = 0.0;
                    float a = 0.5;
                    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
                    for(int i=0; i<5; i++) {
                        f += a * noise(p);
                        p = r * p * 2.0;
                        a *= 0.5;
                    }
                    return f;
                }

                // ─── 2. PERCEPTUAL COLOR (color_systems) ───
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
                    return vec3(
                        rgb.r <= 0.0031308 ? rgb.r * 12.92 : 1.055 * pow(max(rgb.r, 0.0), 1.0/2.4) - 0.055,
                        rgb.g <= 0.0031308 ? rgb.g * 12.92 : 1.055 * pow(max(rgb.g, 0.0), 1.0/2.4) - 0.055,
                        rgb.b <= 0.0031308 ? rgb.b * 12.92 : 1.055 * pow(max(rgb.b, 0.0), 1.0/2.4) - 0.055
                    );
                }

                vec3 oklch_to_oklab(vec3 lch) {
                    return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
                }

                // ─── 3. STRUCTURAL COLOR (structural_color) ───
                vec3 wavelengthToRGB(float W) {
                    vec3 c = vec3(0.0);
                    if (W >= 380.0 && W < 440.0) c = vec3(-(W-440.0)/60.0, 0.0, 1.0);
                    else if (W >= 440.0 && W < 490.0) c = vec3(0.0, (W-440.0)/50.0, 1.0);
                    else if (W >= 490.0 && W < 510.0) c = vec3(0.0, 1.0, -(W-510.0)/20.0);
                    else if (W >= 510.0 && W < 580.0) c = vec3((W-510.0)/70.0, 1.0, 0.0);
                    else if (W >= 580.0 && W < 645.0) c = vec3(1.0, -(W-645.0)/65.0, 0.0);
                    else if (W >= 645.0 && W <= 780.0) c = vec3(1.0, 0.0, 0.0);
                    
                    float i = 1.0;
                    if (W < 420.0) i = 0.3 + 0.7*(W-380.0)/40.0;
                    else if (W > 700.0) i = 0.3 + 0.7*(780.0-W)/80.0;
                    return c * i;
                }

                vec3 thinFilm(float thickness) {
                    vec3 color = vec3(0.0);
                    float n_film = 1.5; // Iridescent chitin/oil
                    float pathDiff = 2.0 * n_film * thickness;
                    
                    for(float i=0.0; i<15.0; i++) {
                        float lambda = 380.0 + (i / 14.0) * 400.0;
                        float phase = (pathDiff / lambda) * TAU;
                        float intensity = 0.5 + 0.5 * cos(phase);
                        color += wavelengthToRGB(lambda) * intensity;
                    }
                    return color / 4.5;
                }

                // ─── 4. SACRED GEOMETRY & FRACTALS ───
                vec2 radialFold(vec2 p, float n) {
                    float a = atan(p.y, p.x);
                    float r = length(p);
                    float s = TAU / n;
                    float fa = mod(a + s*0.5, s) - s*0.5;
                    return vec2(cos(fa), sin(fa)) * r;
                }

                float sdTriangle(vec2 p, float r) {
                    const float k = 1.7320508;
                    p.x = abs(p.x) - r;
                    p.y = p.y + r / k;
                    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
                    p.x -= clamp(p.x, -2.0 * r, 0.0);
                    return -length(p) * sign(p.y);
                }

                float sriYantra(vec2 p) {
                    float d = 1e5;
                    for(int i=0; i<9; i++) {
                        float fi = float(i);
                        float rad = 0.15 + fi * 0.02;
                        float dir = mod(fi, 2.0) == 0.0 ? 1.0 : -1.0;
                        vec2 tp = p;
                        tp.y += dir * 0.04 * (fi - 4.0); 
                        tp.y *= dir; 
                        float t = sdTriangle(tp, rad);
                        d = min(d, abs(t) - 0.002);
                    }
                    return d;
                }

                // Bessel Mode Cymatics
                float cymatics(vec2 p) {
                    float r = length(p);
                    float th = atan(p.y, p.x);
                    float k = 40.0;
                    float m = 8.0;
                    float x = k * r;
                    float J = sqrt(2.0 / (PI * max(x, 0.001))) * cos(x - m*PI/2.0 - PI/4.0);
                    return J * cos(m * th - u_time*1.5);
                }

                // Flame Motif via Julia Set Escape Trap
                float juliaRing(vec2 p) {
                    float a = atan(p.y, p.x);
                    float r = length(p);
                    vec2 z = vec2(a * 4.0, (r - 0.5) * 20.0);
                    vec2 c = vec2(-0.7269, 0.1889) + vec2(sin(u_time*0.5), cos(u_time*0.7)) * 0.05;
                    float trap = 1e5;
                    for(int i=0; i<12; i++) {
                        z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
                        trap = min(trap, abs(z.y));
                        if(dot(z,z) > 16.0) break;
                    }
                    return trap;
                }

                void main() {
                    vec2 uv = vUv * 2.0 - 1.0;
                    uv.x *= u_aspect;
                    
                    // Divine Data Corruption (Glitch)
                    float glitch = step(0.98, fract(sin(u_time * 12.0) * 43758.5));
                    if (glitch > 0.5) {
                        uv.x += (fract(sin(uv.y * 100.0 + u_time) * 43758.5) - 0.5) * 0.1;
                    }

                    // Rainblown Watercolor Distortion
                    vec2 suv = uv;
                    float smear_time = u_time * 0.5;
                    for(int i=0; i<4; i++) {
                        float n = fbm(suv * 4.0 - vec2(smear_time * 0.3, smear_time));
                        suv += vec2(0.04, -0.08) * n; // Gravity/wind sag
                    }

                    float r_suv = length(suv);
                    float r_uv = length(uv);

                    // ─── BUILD THICKNESS MAP ───
                    float thickness = 400.0 + u_time * 50.0; 

                    // Center Cymatics
                    float cyma = cymatics(suv);
                    thickness += cyma * 150.0;

                    // Center Sri Yantra
                    float sy = sriYantra(suv);
                    thickness += smoothstep(0.02, 0.0, sy) * 250.0;

                    // Outer Julia Flame Ring
                    if (r_suv > 0.3 && r_suv < 0.7) {
                        float jr = juliaRing(suv);
                        thickness += smoothstep(0.15, 0.0, jr) * 200.0;
                    }

                    // Border Lotus Petals (16-fold Haeckel)
                    vec2 puv = radialFold(suv, 16.0);
                    puv.y -= 0.75;
                    puv.x = abs(puv.x);
                    float petal = length(puv - vec2(0.06, 0.0)) + length(puv - vec2(-0.06, 0.0)) - 0.18;
                    petal = max(petal, puv.y - 0.12);
                    thickness += smoothstep(0.03, 0.0, abs(petal)) * 300.0;

                    // ─── COLOR SYNTHESIS ───
                    vec3 struct_col = thinFilm(thickness);

                    // OKLab Golden Angle Rainbow
                    float angle = atan(suv.y, suv.x);
                    vec3 lch = vec3(0.65, 0.16, angle * 180.0/PI + u_time * 15.0);
                    vec3 rainbow = oklab_to_srgb(oklch_to_oklab(lch));

                    // Wet Blend
                    vec3 col = mix(rainbow, struct_col, 0.65);

                    // ─── CRISP ANCHOR LINES (The Math) ───
                    float sy_c = sriYantra(uv);
                    float cyma_c = cymatics(uv);
                    float jr_c = juliaRing(uv);
                    
                    vec2 puv_c = radialFold(uv, 16.0);
                    puv_c.y -= 0.75; puv_c.x = abs(puv_c.x);
                    float petal_c = max(length(puv_c - vec2(0.06, 0.0)) + length(puv_c - vec2(-0.06, 0.0)) - 0.18, puv_c.y - 0.12);

                    float lines = smoothstep(0.005, 0.0, sy_c) + 
                                  smoothstep(0.05, 0.0, jr_c) * (r_uv > 0.35 && r_uv < 0.65 ? 1.0 : 0.0) +
                                  smoothstep(0.005, 0.0, abs(petal_c));

                    vec3 gold = vec3(0.85, 0.65, 0.15);
                    vec3 ink = vec3(0.1, 0.05, 0.05);
                    
                    // Stippled ink threshold
                    col = mix(col, gold, lines * 0.6);
                    col = mix(col, ink, lines * smoothstep(0.4, 0.8, fbm(uv*15.0))); 

                    // ─── BOTANICAL PAPER BASE ───
                    vec3 paper = vec3(0.96, 0.87, 0.70);
                    float mask = smoothstep(0.85, 0.92, r_suv);
                    col = mix(col, paper, mask);

                    // Wash / Stipple Texture
                    col *= 0.85 + 0.15 * fbm(uv * 200.0);

                    // Vignette
                    col *= 1.0 - 0.3 * dot(uv, uv);

                    fragColor = vec4(col, 1.0);
                }
            `;
            
            const material = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_time: { value: 0 },
                    u_aspect: { value: grid.width / grid.height }
                },
                vertexShader,
                fragmentShader
            });
            
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
            scene.add(mesh);
            
            canvas.__three = { renderer, scene, camera, material };
        } catch (e) {
            console.error("WebGL Init failed", e);
            return;
        }
    }

    const { renderer, scene, camera, material } = canvas.__three;
    
    if (material && material.uniforms) {
        material.uniforms.u_time.value = time;
        material.uniforms.u_aspect.value = grid.width / grid.height;
    }

    renderer.setSize(grid.width, grid.height, false);
    renderer.render(scene, camera);
}