const { width, height } = grid;

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
                u_resolution: { value: new THREE.Vector2(width, height) },
                u_mouse: { value: new THREE.Vector2(mouse.x, mouse.y) }
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
                
                #define PI 3.14159265359
                #define TAU 6.28318530718
                
                // --- Core Feral Math & Noise ---
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }
                
                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    float a = hash(i);
                    float b = hash(i + vec2(1.0, 0.0));
                    float c = hash(i + vec2(0.0, 1.0));
                    float d = hash(i + vec2(1.0, 1.0));
                    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
                }
                
                float fbm(vec2 p) {
                    float v = 0.0;
                    float a = 0.5;
                    for(int i=0; i<5; i++) {
                        v += a * noise(p);
                        p = p * 2.0 + vec2(1.3, 2.9);
                        a *= 0.5;
                    }
                    return v;
                }
                
                // --- Structural Color: Thin Film Interference ---
                vec3 thinFilm(float thickness) {
                    float pathDiff = 3.0 * thickness;
                    vec3 col;
                    col.r = 0.5 + 0.5 * cos((pathDiff / 650.0) * TAU);
                    col.g = 0.5 + 0.5 * cos((pathDiff / 530.0) * TAU);
                    col.b = 0.5 + 0.5 * cos((pathDiff / 440.0) * TAU);
                    return smoothstep(0.1, 0.9, col);
                }
                
                // --- Botanical Illustration: Haeckel Radial Symmetry ---
                vec2 radialFold(vec2 p, float n) {
                    float a = atan(p.y, p.x);
                    float r = length(p);
                    float sector = TAU / n;
                    float fa = mod(a, sector);
                    if (fa > sector * 0.5) fa = sector - fa;
                    return vec2(cos(fa), sin(fa)) * r;
                }
                
                // --- Complex Dynamics ---
                vec2 cmul(vec2 a, vec2 b) {
                    return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x);
                }
                
                float sdBox(vec2 p, vec2 b) {
                    vec2 d = abs(p) - b;
                    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
                }
                
                void main() {
                    vec2 uv = vUv;
                    float t = u_time;
                    
                    // --- Damage Aesthetics: VHS Playback Instability ---
                    if (uv.y < 0.08) {
                        uv.x += (hash(vec2(uv.y * 100.0, t)) - 0.5) * 0.05 * smoothstep(0.08, 0.0, uv.y);
                    }
                    float tear = smoothstep(0.98, 1.0, sin(uv.y * 12.0 - t * 4.0));
                    uv.x += tear * (hash(vec2(t, uv.y)) - 0.5) * 0.04;
                    
                    float aspect = u_resolution.x / u_resolution.y;
                    vec2 cuv = (uv - 0.5) * vec2(aspect, 1.0);
                    
                    // --- Tarot Card Format (1:1.73) ---
                    float cardH = 0.45;
                    float cardW = cardH / 1.73;
                    
                    // Distressed Borders
                    float distEdge = fbm(cuv * 20.0 + t * 0.1) * 0.015;
                    float cardSDF = sdBox(cuv, vec2(cardW, cardH)) - distEdge;
                    float borderSDF = sdBox(cuv, vec2(cardW * 0.92, cardH * 0.95)) - distEdge * 0.5;
                    float fieldSDF = sdBox(cuv, vec2(cardW * 0.85, cardH * 0.88)) - distEdge * 0.2;
                    
                    float mCard = smoothstep(0.005, 0.0, cardSDF);
                    float mBorder = smoothstep(0.005, 0.0, borderSDF);
                    float mField = smoothstep(0.005, 0.0, fieldSDF);
                    
                    // --- Palettes (Dark Oracle / Cosmic Void) ---
                    vec3 voidCol = vec3(0.02, 0.01, 0.02);
                    vec3 paperCol = vec3(0.05, 0.04, 0.04);
                    vec3 goldCol = mix(vec3(0.85, 0.65, 0.25), vec3(0.4, 0.2, 0.05), fbm(cuv * 30.0));
                    
                    // --- Gematria Resonance Background ---
                    float bg_r = length(cuv - vec2(0.0, 0.05));
                    float resonance = 0.0;
                    resonance += cos(26.0 * bg_r * 2.0 - t * 2.0);   // YHWH
                    resonance += cos(86.0 * bg_r * 2.0 - t * 1.5);   // ELOHIM
                    resonance += cos(373.0 * bg_r * 0.5 - t * 1.0);  // LOGOS
                    resonance /= 3.0;
                    
                    vec3 bgCol = mix(vec3(0.05, 0.02, 0.04), vec3(0.2, 0.05, 0.15), resonance * 0.5 + 0.5);
                    bgCol += cos(250.0 * cuv.x) * cos(250.0 * cuv.y) * 0.015; // Op Art Moiré
                    
                    // --- The Dweller (Fractal Entity) ---
                    // Hyperbolic space folding
                    float r2 = dot(cuv, cuv);
                    vec2 warped_uv = cuv / (1.0 - r2 * 2.5);
                    vec2 sym_uv = radialFold(warped_uv, 12.0); // 12-fold Cathedral symmetry
                    
                    vec2 z = sym_uv * 10.0;
                    vec2 c = vec2(-0.7269, 0.1889) + 0.03 * vec2(cos(t * 0.5), sin(t * 0.3)); // San Marco Dragon drift
                    
                    float iter = 0.0;
                    float trap1 = 1e10;
                    float trap2 = 1e10;
                    vec2 dz = vec2(1.0, 0.0);
                    
                    // Escape-time with Distance Estimator & Orbit Traps
                    for(int i=0; i<45; i++) {
                        dz = 2.0 * cmul(z, dz) + vec2(1.0, 0.0);
                        z = cmul(z, z) + c;
                        trap1 = min(trap1, abs(z.x));
                        trap2 = min(trap2, length(z - vec2(1.0, 0.0)));
                        if(dot(z,z) > 256.0) break;
                        iter++;
                    }
                    
                    float de = sqrt(dot(z,z) / dot(dz,dz)) * log(dot(z,z)) * 0.5;
                    
                    float lensMask = smoothstep(0.18, 0.05, r2);
                    float entityMask = smoothstep(0.015, 0.0, de) * lensMask;
                    float bloom = exp(-de * 12.0) * lensMask;
                    float shadow = exp(-de * 3.0) * lensMask;
                    
                    vec3 entityCol = thinFilm(400.0 + trap1 * 800.0 + iter * 12.0);
                    entityCol = mix(entityCol, vec3(1.0, 0.8, 0.3), exp(-trap2 * 8.0)); // Gold core injection
                    
                    // --- Field Composition ---
                    vec3 fieldContent = bgCol;
                    fieldContent = mix(fieldContent, vec3(0.0), shadow * 0.6); // Specimen cast shadow
                    fieldContent = mix(fieldContent, entityCol, entityMask);
                    fieldContent += vec3(0.9, 0.1, 0.5) * bloom * 0.5; // Phosphor/Magenta bloom
                    
                    // --- Eye Iconography (Vesica Piscis) ---
                    vec2 eye_uv = cuv - vec2(0.0, 0.35);
                    float d1 = length(eye_uv - vec2(0.04, 0.0));
                    float d2 = length(eye_uv + vec2(0.04, 0.0));
                    float vesica = smoothstep(0.06, 0.055, d1) * smoothstep(0.06, 0.055, d2);
                    float pupil = smoothstep(0.015, 0.01, length(eye_uv));
                    vec3 eyeCol = mix(goldCol, vec3(0.05), pupil);
                    fieldContent = mix(fieldContent, eyeCol, vesica);
                    
                    // --- Title Bar (Aphasia Text / Generative Rot) ---
                    float titleBarSDF = sdBox(cuv - vec2(0.0, -cardH * 0.75), vec2(cardW * 0.75, cardH * 0.08));
                    float mTitle = smoothstep(0.005, 0.0, titleBarSDF);
                    float textNoise = fbm(vec2(cuv.x * 80.0, cuv.y * 400.0) + t * 0.1);
                    float textMask = smoothstep(0.55, 0.7, textNoise) * mTitle;
                    
                    vec3 titleCol = mix(paperCol, goldCol, mTitle);
                    titleCol = mix(titleCol, vec3(0.05), textMask);
                    fieldContent = mix(fieldContent, titleCol, mTitle);
                    
                    // --- Assemble Tarot Card ---
                    vec3 cardContent = mix(paperCol, goldCol, mBorder);
                    cardContent = mix(cardContent, paperCol, smoothstep(0.005, 0.0, borderSDF + 0.015));
                    cardContent = mix(cardContent, fieldContent, mField);
                    
                    vec3 finalCol = mix(voidCol, cardContent, mCard);
                    
                    // --- Global Damage: Film Grain ---
                    float grain = (hash(uv * 1000.0 + t) - 0.5) * 0.08;
                    finalCol += grain;
                    
                    fragColor = vec4(finalCol, 1.0);
                }
            `
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
    material.uniforms.u_resolution.value.set(width, height);
    if (mouse) {
        material.uniforms.u_mouse.value.set(mouse.x, mouse.y);
    }
}

renderer.setSize(width, height, false);
renderer.render(scene, camera);