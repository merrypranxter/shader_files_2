try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, grid.width / grid.height, 0.1, 1000);
        camera.position.z = 1;

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
            #define TAU 6.28318530718

            // --- Hash & Noise ---
            float hash11(float p) { return fract(sin(p)*43758.5453123); }
            float hash21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123); }
            vec2 hash22(vec2 p) {
                vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
                p3 += dot(p3, p3.yzx + 33.33);
                return fract((p3.xx+p3.yz)*p3.zy);
            }

            float fbm(vec2 p) {
                float f = 0.0;
                float w = 0.5;
                for(int i=0; i<4; i++) {
                    f += w * hash21(p);
                    p *= 2.0;
                    w *= 0.5;
                }
                return f;
            }

            // --- Complex Domain Math ---
            vec2 cMul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
            vec2 cDiv(vec2 a, vec2 b) { float d = dot(b,b); return vec2(dot(a,b), a.y*b.x - a.x*b.y) / (d + 1e-6); }
            vec2 cExp(vec2 z) { return exp(z.x) * vec2(cos(z.y), sin(z.y)); }

            // --- OKLCh Color Space (Perceptual Uniformity) ---
            vec3 oklch(float L, float C, float h) {
                float a = C * cos(h);
                float b = C * sin(h);
                float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
                float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
                float s_ = L - 0.0894841775 * a - 1.2914855480 * b;
                float l = l_*l_*l_;
                float m = m_*m_*m_;
                float s = s_*s_*s_;
                vec3 rgb = vec3(
                     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                );
                return mix(12.92*rgb, 1.055*pow(max(rgb,0.0), vec3(1.0/2.4)) - 0.055, step(0.0031308, rgb));
            }

            // --- Spectral Iridescence (Opal/Prism) ---
            vec3 spectral(float t) {
                vec3 c = 0.5 + 0.5 * cos(TAU * (t + vec3(0.0, 0.33, 0.67)));
                return pow(c, vec3(1.8)) * 2.0; // Boosted for synthetic neon pop
            }

            // --- Procedural Sigil Engine ---
            float sigil(vec2 p, float seed) {
                float d = 100.0;
                vec2 pos = p;
                for(int i=0; i<5; i++) {
                    float fi = float(i);
                    vec2 offset = hash22(vec2(seed, fi)) * 0.5 - 0.25;
                    float angle = hash11(seed + fi * 1.3) * PI;
                    float s = sin(angle), c = cos(angle);
                    pos = abs(pos) - offset;
                    pos = vec2(pos.x*c - pos.y*s, pos.x*s + pos.y*c);
                    
                    float box = length(max(abs(pos) - 0.08, 0.0));
                    float ring = abs(length(pos) - 0.12);
                    float dots = length(pos - vec2(0.1)) - 0.02;
                    
                    float choice = hash11(seed + fi * 2.7);
                    if(choice < 0.33) d = min(d, box);
                    else if(choice < 0.66) d = min(d, ring);
                    else d = min(d, dots);
                }
                return smoothstep(0.03, 0.005, d);
            }

            void main() {
                vec2 uv = vUv * 2.0 - 1.0;
                uv.x *= u_resolution.x / u_resolution.y;
                
                float t = u_time * 0.3;
                
                // Chromatic Eclipse Pulse
                float eclipse = exp(-pow(fract(t * 0.25) * 10.0 - 5.0, 2.0)); 
                
                // Space Distortion
                vec2 z = uv * (2.2 - eclipse * 0.5) + eclipse * 0.1 * vec2(sin(uv.y*10.0+u_time), cos(uv.x*10.0-u_time));
                float r = length(z);
                float theta = atan(z.y, z.x);
                
                // --- Background: Domain Coloring / Candy Nebula ---
                vec2 c = cMul(z, z) + vec2(sin(t), cos(t*1.3));
                vec2 fz = cDiv(cExp(cMul(z, vec2(0.0, 1.0))), z + vec2(0.5*sin(t), 0.5*cos(t)));
                float arg = atan(fz.y, fz.x);
                float mag = length(fz);
                
                float meshNoise = fbm(z * 2.0 + t);
                float bgHue = arg + t + meshNoise * PI;
                vec3 color = oklch(0.4 + 0.3 * sin(mag*10.0 - u_time*5.0), 0.2 + 0.1*meshNoise, bgHue);
                
                // --- Zodiac Outer Ring (12 Houses) ---
                float rOutIn = 0.65;
                float rOutOut = 0.95;
                
                float outerRot = theta - t * 0.5;
                float outerSectorFloat = outerRot * 12.0 / TAU;
                float outerSector = floor(outerSectorFloat);
                float outerLocalTheta = mod(outerRot, TAU/12.0) - TAU/24.0;
                float outerEdge = abs(outerLocalTheta) / (TAU/24.0);
                
                if (r > rOutIn && r < rOutOut) {
                    float h = bgHue + outerSector * (TAU/12.0);
                    float L = 0.65 + 0.15 * sin(r * 30.0 - u_time * 5.0);
                    float C = 0.28 + 0.08 * cos(outerSector * 13.7 + u_time);
                    
                    // Simultaneous Contrast Halos (impossible color bleed at edges)
                    float halo = smoothstep(0.85, 1.0, outerEdge);
                    h += halo * PI; // Push to complement
                    L += halo * 0.25;
                    C += halo * 0.1;
                    
                    vec3 ringCol = oklch(L, C, h);
                    
                    // Opal Bragg Diffraction Iridescence
                    float bragg = cos(r * 80.0 - u_time * 15.0 + theta * 8.0);
                    ringCol += spectral(bragg * 0.5 + t) * smoothstep(0.9, 1.0, sin(r*50.0)) * 0.5;
                    
                    // Micro-Sigils
                    vec2 sigilP = vec2(outerLocalTheta * r * 5.0, (r - (rOutIn+rOutOut)*0.5) * 8.0);
                    float sig = sigil(sigilP, outerSector + 42.0);
                    
                    // False-color perceptual inversion for glyphs
                    vec3 sigilCol = oklch(0.95, 0.35, h - PI/2.0);
                    ringCol = mix(ringCol, sigilCol, sig);
                    
                    // Rotating Degree Ticks
                    float tickMask = smoothstep(rOutOut - 0.05, rOutOut, r);
                    float ticks = step(0.8, fract(outerRot * 360.0 / TAU));
                    ringCol = mix(ringCol, vec3(1.0), ticks * tickMask * (1.0 - halo));
                    
                    color = ringCol;
                }
                
                // --- Inner Ring (Planetary Hours - 7 Segments) ---
                float rInIn = 0.35;
                float rInOut = 0.60;
                
                float innerRot = theta + t * 0.8;
                float innerSector = floor(innerRot * 7.0 / TAU);
                float innerLocalTheta = mod(innerRot, TAU/7.0) - TAU/14.0;
                
                if (r > rInIn && r < rInOut) {
                    float h = bgHue - innerSector * (TAU/7.0) * 2.0 + PI;
                    float L = 0.7 + 0.1 * sin(u_time * 4.0 + innerSector);
                    
                    vec3 ringCol = oklch(L, 0.3, h);
                    
                    vec2 sigilP = vec2(innerLocalTheta * r * 6.0, (r - (rInIn+rInOut)*0.5) * 10.0);
                    float sig = sigil(sigilP, innerSector + 100.0);
                    ringCol = mix(ringCol, vec3(0.05, 0.0, 0.1), sig); // Abyssal logic
                    
                    color = ringCol;
                }
                
                // --- Core (Opal Plasma Eye) ---
                if (r < 0.32) {
                    float corePhase = atan(z.y, z.x) + u_time * 2.0;
                    float plasma = sin(r * 50.0 - u_time * 12.0 + sin(corePhase * 6.0) * 2.5);
                    float h = u_time * 2.0 + r * 10.0;
                    
                    color = oklch(0.8 + 0.2*plasma, 0.25, h);
                    color += spectral(r * 10.0 - t) * 0.4;
                    
                    // Pupil
                    float pupil = smoothstep(0.1, 0.08, r);
                    color = mix(color, vec3(0.02, 0.0, 0.05), pupil);
                    
                    // Core Rays
                    float rays = smoothstep(0.9, 1.0, sin(theta * 24.0 + u_time * 5.0));
                    color += rays * oklch(0.9, 0.2, h + PI) * smoothstep(0.1, 0.32, r) * 0.5;
                }
                
                // --- Structural Boundaries ---
                float b1 = smoothstep(0.015, 0.0, abs(r - rInIn));
                float b2 = smoothstep(0.015, 0.0, abs(r - rInOut));
                float b3 = smoothstep(0.015, 0.0, abs(r - rOutIn));
                float b4 = smoothstep(0.015, 0.0, abs(r - rOutOut));
                float borders = max(max(b1, b2), max(b3, b4));
                color = mix(color, vec3(0.02, 0.0, 0.08), borders);
                
                // --- Eclipse Pulse Override ---
                vec3 eclipseCol = oklch(0.9, 0.3, theta + t * 5.0); // White-hot cyan/pink
                color = mix(color, eclipseCol, eclipse * 0.85);
                
                // Global Bloom / Glow
                color += spectral(r * 2.0 - t) * smoothstep(1.5, 0.0, r) * 0.2;
                
                // Vignette
                color *= smoothstep(2.5, 0.8, r);
                
                fragColor = vec4(color, 1.0);
            }
        `;

        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            vertexShader,
            fragmentShader,
            transparent: true,
            depthWrite: false
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);
        
        canvas.__three = { renderer, scene, camera, material };
    }

    const { renderer, scene, camera, material } = canvas.__three;
    
    if (material && material.uniforms) {
        material.uniforms.u_time.value = time;
        material.uniforms.u_resolution.value.set(grid.width, grid.height);
    }
    
    renderer.setSize(grid.width, grid.height, false);
    renderer.render(scene, camera);

} catch (e) {
    console.error("Qolorful Zodiac Chromatic Engine Initialization Failed:", e);
    throw e;
}