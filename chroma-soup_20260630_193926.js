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
                u_mutation: { value: 0 },
                u_saccade_gate: { value: 0 }
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
                
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform float u_mutation;
                uniform float u_saccade_gate;
                
                in vec2 vUv;
                out vec4 fragColor;
                
                // [SPECTRAL COLOR] Wyman Multi-Lobe Fit (CIE 1931)
                vec3 wavelengthToRGB(float l) {
                    float x = 1.056 * exp(-0.5 * pow((l - 599.8) / (l < 599.8 ? 37.9 : 31.0), 2.0))
                            + 0.362 * exp(-0.5 * pow((l - 442.0) / (l < 442.0 ? 16.0 : 26.7), 2.0))
                            - 0.065 * exp(-0.5 * pow((l - 501.1) / (l < 501.1 ? 20.4 : 26.2), 2.0));
                    float y = 0.821 * exp(-0.5 * pow((l - 568.8) / (l < 568.8 ? 46.9 : 40.5), 2.0))
                            + 0.286 * exp(-0.5 * pow((l - 530.9) / (l < 530.9 ? 16.3 : 31.1), 2.0));
                    float z = 1.217 * exp(-0.5 * pow((l - 437.0) / (l < 437.0 ? 11.8 : 36.0), 2.0))
                            + 0.681 * exp(-0.5 * pow((l - 459.0) / (l < 459.0 ? 26.0 : 13.8), 2.0));
                    
                    vec3 rgb = vec3(
                         3.2406 * x - 1.5372 * y - 0.4986 * z,
                        -0.9689 * x + 1.8758 * y + 0.0415 * z,
                         0.0557 * x - 0.2040 * y + 1.0570 * z
                    );
                    float lift = min(min(rgb.r, rgb.g), min(rgb.b, 0.0));
                    rgb -= lift;
                    float mx = max(max(rgb.r, rgb.g), max(rgb.b, 1e-6));
                    rgb /= mx;
                    return mix(12.92 * rgb, 1.055 * pow(rgb, vec3(1.0/2.4)) - 0.055, step(0.0031308, rgb));
                }
                
                // [ACOUSTIC IMPEDANCE TESSELLATION] Voronoi Tissue Map
                vec2 hash2(vec2 p) {
                    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.xx+p3.yz)*p3.zy);
                }
                
                vec3 voronoi(vec2 x, float mut) {
                    vec2 n = floor(x);
                    vec2 f = fract(x);
                    float md = 8.0, md2 = 8.0;
                    vec2 mr;
                    for(int j=-1; j<=1; j++)
                    for(int i=-1; i<=1; i++) {
                        vec2 g = vec2(float(i), float(j));
                        vec2 o = hash2(n + g + mut);
                        vec2 r = g + o - f;
                        float d = dot(r, r);
                        if(d < md) {
                            md2 = md; md = d; mr = r;
                        } else if(d < md2) {
                            md2 = d;
                        }
                    }
                    return vec3(sqrt(md), sqrt(md2), md2 - md);
                }
                
                // [KALEIDOSCOPE ENGINE] Dihedral Folding
                vec2 kalFold(vec2 p, float n) {
                    float a = atan(p.y, p.x);
                    float r = length(p);
                    float sec = 6.2831853 / n;
                    float f = mod(a, sec);
                    if(f > sec/2.0) f = sec - f;
                    return vec2(cos(f), sin(f)) * r;
                }
                
                // [PRISM DISPERSION] Cauchy Index of Refraction
                float cauchy(float A, float B, float l) {
                    float l_um = l / 1000.0;
                    return A + B / (l_um * l_um);
                }
                
                void main() {
                    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
                    float t = u_time * 0.2;
                    float mut = u_mutation;
                    
                    // [NONORIENTABLE SURFACES] Mobius Twist
                    float angle = atan(uv.y, uv.x);
                    float rad = length(uv);
                    angle += rad * sin(t * 0.5 + mut * 0.1) * 1.5;
                    vec2 p = vec2(cos(angle), sin(angle)) * rad;
                
                    // [KALEIDOSCOPE ENGINE]
                    float sectors = 3.0 + 2.0 * floor(mod(mut, 5.0));
                    p = kalFold(p, sectors);
                    
                    // Advection (Fluid / Tissue)
                    p = p * (1.5 + 0.5 * sin(t * 0.7)) + vec2(t * 0.2, sin(t * 0.3));
                    vec2 p2 = p + vec2(sin(p.y * 3.0 + t), cos(p.x * 3.0 - t)) * 0.5;
                    
                    // [ACOUSTIC IMPEDANCE] Map & Boundaries
                    vec3 v = voronoi(p2 * 3.0, floor(mut));
                    float boundary = smoothstep(0.0, 0.08, v.z);
                    float tissue = v.x;
                    
                    // Speckle Artifact (Continuous, flowing with tissue)
                    float speckle = fract(sin(dot(floor(p2 * 50.0), vec2(12.9898, 78.233))) * 43758.5453);
                    tissue += (speckle - 0.5) * 0.15 * smoothstep(0.0, 0.5, boundary);
                    
                    // Moiré interference / ripples
                    float ripple = sin(length(p2) * 30.0 - t * 8.0);
                    
                    // [STRUCTURAL COLOR] Thin-film interference thickness
                    float thickness = 300.0 + 600.0 * tissue + 300.0 * sin(t * 2.0 + boundary * 8.0) + ripple * 50.0;
                    float cosTheta = mix(0.2, 1.0, length(uv));
                    
                    vec3 color = vec3(0.0);
                    int SAMPLES = 16;
                    
                    // [PRISM DISPERSION] Per-wavelength Integration
                    for(int i = 0; i < SAMPLES; i++) {
                        float l = mix(380.0, 700.0, float(i)/float(SAMPLES-1));
                        float n_film = cauchy(1.4, 0.015, l); 
                        
                        // Dispersive shift for chromatic aberration
                        float dev = (n_film - 1.4) * 5.0;
                        float opd = 2.0 * n_film * (thickness + dev * 100.0) * cosTheta;
                        
                        float phase = (opd / l) * 6.2831853;
                        float interference = 0.5 + 0.5 * cos(phase);
                        
                        // [SACCADIC MASKING] Parity Flip
                        if (mod(floor(mut), 2.0) == 1.0) interference = 1.0 - interference;
                        
                        // [SIMULTANEOUS CONTRAST] Lateral Inhibition (Chubb surround)
                        float chubb = fract(sin(dot(p2 + dev, vec2(12.9898, 78.233))) * 43758.5);
                        float surround = smoothstep(0.1, 0.9, v.y + chubb * 0.2);
                        interference = mix(interference, interference * surround, 1.2 + 0.5 * sin(mut));
                        
                        vec3 spectral = wavelengthToRGB(l);
                        color += spectral * interference;
                    }
                    color /= float(SAMPLES) * 0.4;
                
                    // [IMPOSSIBLE COLORS] Hyperbolic Colors / Candy-Acid Palette Injection
                    float lum = dot(color, vec3(0.299, 0.587, 0.114));
                    color = mix(vec3(lum), color, 1.8 + 0.8 * sin(t + mut));
                    
                    // Emissive Accents (Self-luminous red & Stygian blue)
                    vec3 luminousRed = vec3(1.0, 0.0, 0.4) * smoothstep(0.03, 0.0, v.x); // Hot pink / red
                    vec3 stygianBlue = vec3(0.0, 0.4, 1.0) * smoothstep(0.1, 0.0, boundary); // Electric blue
                    vec3 acidGreen = vec3(0.6, 1.0, 0.0) * smoothstep(0.9, 1.0, tissue); // Acid green
                    vec3 neonYellow = vec3(1.0, 1.0, 0.0) * smoothstep(0.02, 0.0, abs(v.z - 0.1));
                    
                    color += luminousRed * 2.0;
                    color = mix(color, stygianBlue, smoothstep(0.08, 0.0, boundary) * 0.8);
                    color += acidGreen * speckle * 0.8;
                    color += neonYellow * 1.5;
                    
                    // [CHANGE BLINDNESS] Mudsplash during saccade
                    if (u_saccade_gate > 0.01) {
                        float splash = smoothstep(0.8, 0.9, fract(sin(dot(floor(uv * 15.0), vec2(1.0, 7.0))) * 43.0 + mut));
                        color = mix(color, vec3(1.0, 0.0, 1.0), splash * u_saccade_gate * 1.5);
                        color = mix(color, vec3(0.5), u_saccade_gate * 0.5); // Flicker paradigm
                    }
                    
                    // ACES Tonemap
                    color = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
                    
                    fragColor = vec4(color, 1.0);
                }
            `
        });
        
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);
        
        canvas.__three = { renderer, scene, camera, material };
        canvas.__state = { mutation: 0, saccadeGate: 0, lastTime: time };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        throw e;
    }
}

const { renderer, scene, camera, material } = canvas.__three;
const state = canvas.__state;

const dt = Math.min(time - state.lastTime, 0.1);
state.lastTime = time;

// Saccadic Masking Exploits: State mutates only during fast simulated "flicks"
if (Math.random() < 0.015) { 
    state.saccadeGate = 1.0;
    state.mutation += 1.0;
} else {
    state.saccadeGate *= Math.exp(-dt * 15.0); 
}

if (material && material.uniforms) {
    if (material.uniforms.u_time) material.uniforms.u_time.value = time;
    if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(grid.width, grid.height);
    if (material.uniforms.u_mutation) material.uniforms.u_mutation.value = state.mutation;
    if (material.uniforms.u_saccade_gate) material.uniforms.u_saccade_gate.value = state.saccadeGate;
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);