function render(ctx, grid, time, repos, input, mouse, canvas, THREE) {
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
                    gl_Position = vec4(position.xy, 0.0, 1.0);
                }
            `;
            
            const fragmentShader = `
                in vec2 vUv;
                out vec4 fragColor;
                uniform float u_time;
                uniform vec2 u_resolution;

                // OKLab <-> sRGB perceptual color conversion
                vec3 oklch_to_oklab(vec3 lch) {
                    return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
                }

                vec3 oklab_to_linear(vec3 c) {
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

                vec3 linear_to_srgb(vec3 c) {
                    vec3 srgb;
                    for(int i=0; i<3; i++) {
                        srgb[i] = c[i] <= 0.0031308 ? c[i] * 12.92 : 1.055 * pow(max(c[i], 0.0), 1.0/2.4) - 0.055;
                    }
                    return srgb;
                }

                vec3 get_color(float L, float C, float h) {
                    // Clamp lightness strictly to avoid any pure black or pure white
                    L = clamp(L, 0.15, 0.85);
                    C = clamp(C, 0.1, 0.35);
                    return linear_to_srgb(oklab_to_linear(oklch_to_oklab(vec3(L, C, h))));
                }

                // Procedural Noise
                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f*f*(3.0-2.0*f);
                    float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
                    float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
                    float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
                    float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
                    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
                }

                float fbm(vec2 p) {
                    float v = 0.0; float a = 0.5;
                    for(int i=0; i<5; i++) {
                        v += a * noise(p);
                        p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.0;
                        a *= 0.5;
                    }
                    return v;
                }

                // Heptagrid (7-fold Islamic Quasiperiodic Scaffold)
                float hgDist(vec2 p, int k, float sp) {
                    float a = float(k) * 3.14159265359 / 7.0;
                    float gamma = float(k + 1) / 14.0;
                    vec2 n = vec2(cos(a), sin(a));
                    float proj = dot(p, n) / sp + gamma;
                    return abs(fract(proj + 0.5) - 0.5) * sp;
                }

                float allDist(vec2 p, float sp) {
                    float d = 1e9;
                    for (int k = 0; k < 7; k++) {
                        d = min(d, hgDist(p, k, sp));
                    }
                    return d;
                }

                // Structural Color: Thin-film interference
                vec3 thin_film(float thickness, float cosTheta) {
                    float n = 1.56; // Chitin refractive index
                    float sinThetaI = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
                    float sinThetaT = sinThetaI / n;
                    float cosThetaT = sqrt(max(0.0, 1.0 - sinThetaT * sinThetaT));
                    float pathDiff = 2.0 * n * thickness * cosThetaT;
                    vec3 phase = vec3(0.0, 0.33, 0.67);
                    return 0.5 + 0.5 * cos(6.28318 * (pathDiff / vec3(650.0, 530.0, 440.0) + phase));
                }

                void main() {
                    vec2 p = (vUv - 0.5) * 2.0;
                    p.x *= u_resolution.x / u_resolution.y;
                    
                    float t = u_time * 0.15;
                    
                    // Parasitic Domain Warp (Enzymes breaking down the geometric structure)
                    vec2 warp1 = vec2(fbm(p * 2.5 + t), fbm(p * 2.5 - t * 0.8 + 10.0));
                    float corruption = fbm(p * 5.0 + warp1 * 3.0);
                    vec2 warpedP = p + warp1 * corruption * 0.5;
                    
                    // Host Structure: Heptagrid
                    float sp = 0.5;
                    float gridD = allDist(warpedP, sp);
                    
                    // Parasite: Mycelial cords invading the host structure
                    float cordWidth = 0.02 + 0.03 * fbm(warpedP * 12.0 - t);
                    float mycelium = smoothstep(cordWidth + 0.05 * corruption, cordWidth - 0.01, gridD);
                    
                    // Anastomosis / Fruiting bodies
                    float nodeField = fbm(warpedP * 15.0 + t);
                    float nodes = smoothstep(0.65, 0.8, nodeField) * exp(-gridD * 20.0);
                    
                    // Enzymatic Decay Background (Host tissue melting)
                    float decay = fbm(p * 4.0 + warp1 * 2.0 - t * 1.5);
                    
                    // Structural Color Iridescence on the fungal armor
                    float thickness = 150.0 + 800.0 * fbm(warpedP * 6.0 + t);
                    vec2 dirP = length(p) > 0.0 ? normalize(p) : vec2(1.0, 0.0);
                    vec2 dirW = length(warp1 - 0.5) > 0.0 ? normalize(warp1 - 0.5) : vec2(0.0, 1.0);
                    float cosT = clamp(abs(dot(dirW, dirP)), 0.0, 1.0);
                    vec3 iridescence = thin_film(thickness, cosT);
                    
                    // Color Palette Math: OKLCh with Golden Angle spacing
                    float baseHue = t + decay * 1.5;
                    
                    // Host tissue color (Digested, warm, filling the void)
                    vec3 hostCol = get_color(0.3 + 0.3 * decay, 0.2, baseHue);
                    
                    // Parasite color (Vibrant, toxic, iridescent)
                    float parasiteHue = baseHue + 2.39996; // Golden angle offset
                    vec3 parasiteCol = get_color(0.5 + 0.2 * sin(gridD * 40.0), 0.3, parasiteHue);
                    parasiteCol = mix(parasiteCol, iridescence, 0.5 * corruption);
                    
                    // Fruiting bodies (Glowing, intense)
                    float nodeHue = parasiteHue + 2.39996;
                    vec3 nodeCol = get_color(0.8, 0.35, nodeHue);
                    
                    // Spores (Dead pixels behaving like pollen)
                    float spores = smoothstep(0.95, 1.0, fract(sin(dot(floor(p * 200.0) + t, vec2(12.9898, 78.233))) * 43758.5453));
                    vec3 sporeCol = get_color(0.7, 0.3, nodeHue + 1.0);
                    
                    // Composition Layering
                    vec3 col = hostCol;
                    col = mix(col, parasiteCol, mycelium);
                    col = mix(col, nodeCol, nodes);
                    col = mix(col, sporeCol, spores * mycelium); // Spores cling to the mycelium
                    
                    // Textile weave tension (Strapwork shadow/highlight artifact)
                    float weave = sin(warpedP.x * 80.0) * sin(warpedP.y * 80.0);
                    col += weave * 0.1 * get_color(0.5, 0.25, parasiteHue + 3.14159);
                    
                    // Hard clamp to ensure absolutely no pure black or white escapes
                    col = clamp(col, 0.1, 0.9);
                    
                    fragColor = vec4(col, 1.0);
                }
            `;
            
            const material = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_time: { value: 0 },
                    u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
                },
                vertexShader: vertexShader,
                fragmentShader: fragmentShader
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
        if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(grid.width, grid.height);
    }
    
    renderer.setSize(grid.width, grid.height, false);
    renderer.render(scene, camera);
}