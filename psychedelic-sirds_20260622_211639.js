try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        renderer.autoClear = false;
        
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
            uniform vec2 u_resolution;
            uniform float u_E;
            uniform float u_mu;
            
            const float TAU = 6.28318530718;
            
            // --- NOISE & MATH UTILS ---
            
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
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
                for (int i = 0; i < 5; i++) {
                    v += a * noise(p);
                    p *= 2.0;
                    a *= 0.5;
                }
                return v;
            }
            
            mat2 rot(float a) {
                float c = cos(a), s = sin(a);
                return mat2(c, s, -s, c);
            }
            
            float smin(float a, float b, float k) {
                float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
                return mix(a, b, h) - k * h * (1.0 - h);
            }
            
            // --- HIDDEN 3D SDF OBJECT ---
            
            float getDepth(vec2 uv) {
                // Center and aspect correct
                vec2 p = (uv - 0.5) * 2.0;
                p.x *= u_resolution.x / u_resolution.y;
                
                // Gentle hyper-dimensional wobble
                p.y += sin(u_time * 0.5 + p.x * 2.0) * 0.05;
                p *= rot(u_time * 0.15);
                
                float a = atan(p.y, p.x);
                float r = length(p);
                
                // 1. Twisted 3-lobed Torus Knot
                vec2 q = p * rot(u_time * 0.25);
                float a2 = atan(q.y, q.x);
                float r2 = length(q);
                float knot = abs(r2 - 0.45 - 0.15 * sin(3.0 * a2)) - 0.09;
                
                // 2. Interlocking Hopf Fibration Rings
                float ring1 = abs(length(p - vec2(0.18, 0.0)) - 0.22) - 0.05;
                float ring2 = abs(length(p + vec2(0.18, 0.0)) - 0.22) - 0.05;
                float ring3 = abs(length(p - vec2(0.0, 0.3)) - 0.22) - 0.05;
                float rings = smin(smin(ring1, ring2, 0.06), ring3, 0.06);
                
                // 3. Central Alien Core
                float core = length(p) - 0.15;
                
                // Combine forms
                float d = smin(smin(knot, rings, 0.08), core, 0.12);
                
                // Impossible topological cutouts
                float cut = abs(r - 0.5) - 0.02 + 0.03 * sin(a * 6.0 - u_time * 1.5);
                d = max(d, -cut);
                
                // Gyroid membrane displacement
                float gyroid = dot(sin(p.xyx * 14.0 + u_time), cos(p.yxy * 14.0 - u_time)) * 0.015;
                d += gyroid;
                
                // Map distance to depth z (bulging out toward viewer)
                float inside = clamp(-d, 0.0, 1.0);
                float z = sqrt(clamp(inside * 3.5, 0.0, 1.0)); // Dome falloff
                
                // Background noise terrain (so the flat parts aren't perfectly flat)
                float bg = 0.06 * fbm(p * 6.0 - vec2(0.0, u_time * 0.2));
                
                return clamp(z + bg, 0.0, 1.0);
            }
            
            // --- ACID NEON WALLPAPER PATTERN ---
            
            vec3 getPattern(vec2 uv) {
                // Map uv.x [0,1] to a perfect circle to ensure seamless horizontal tiling
                float angle = uv.x * TAU;
                float radius = 2.0; 
                vec2 p = vec2(cos(angle) * radius, sin(angle) * radius) + vec2(0.0, uv.y * 12.0 - u_time * 0.4);
                
                // Domain Warping / Fluid simulation
                vec2 q = vec2(
                    fbm(p + vec2(0.0, u_time * 0.3)),
                    fbm(p + vec2(5.2, 1.3))
                );
                
                vec2 r = vec2(
                    fbm(p + 4.0 * q + vec2(1.7, 9.2)),
                    fbm(p + 4.0 * q + vec2(8.3, 2.8))
                );
                
                float f = fbm(p + 4.0 * r);
                
                // Acid Palette: Electric Cyan, Hot Pink, Toxic Lime, Molten Tangerine
                vec3 col = mix(
                    vec3(0.0, 0.9, 1.0), 
                    vec3(1.0, 0.1, 0.6), 
                    clamp(r.x * 1.5, 0.0, 1.0)
                );
                
                col = mix(
                    col,
                    vec3(0.7, 1.0, 0.0), 
                    clamp(q.y * 1.5, 0.0, 1.0)
                );
                
                col = mix(
                    col,
                    vec3(1.0, 0.35, 0.0), 
                    clamp(f * f * 2.5, 0.0, 1.0)
                );
                
                // Op-Art Moiré Overlay
                float moire = sin(uv.x * TAU * 16.0 + q.x * 20.0) * sin(uv.y * 80.0 + q.y * 20.0);
                col += moire * 0.18;
                
                // Prismatic Boro-Glass Highlights
                float spec = pow(max(0.0, sin(f * 25.0 + u_time * 2.0)), 5.0);
                col += spec * vec3(0.9, 0.95, 1.0);
                
                // Tiny Fractal Symbols / Reaction-Diffusion Cells (Must be integer multiplier to tile)
                vec2 cellUv = vec2(uv.x * 24.0, uv.y * 36.0);
                vec2 cellId = floor(cellUv);
                vec2 cellFrac = fract(cellUv) - 0.5;
                float cellDist = length(cellFrac - 0.35 * vec2(sin(u_time * 3.0 + cellId.x), cos(u_time * 3.0 + cellId.y)));
                
                // Sharp edges help the eye lock onto the stereogram
                col = mix(col, vec3(0.05, 0.0, 0.1), smoothstep(0.22, 0.18, cellDist));
                col = mix(col, vec3(0.9, 1.0, 0.9), smoothstep(0.12, 0.08, cellDist));
                
                return clamp(col, 0.0, 1.0);
            }
            
            void main() {
                float E = max(u_E, 1.0);
                float xPix = vUv.x * u_resolution.x;
                float yPix = vUv.y;
                
                float u = xPix;
                
                // Stereogram Pass: March left until we fall into the base tile [0, E)
                // Using the strict SIRDS separation equation: sep(z) = E * (1 - mu*z) / (2 - mu*z)
                for (int i = 0; i < 128; i++) {
                    if (u < E) break;
                    float sampleX = clamp(u / u_resolution.x, 0.0, 1.0);
                    float z = getDepth(vec2(sampleX, yPix));
                    
                    float sep = E * (1.0 - u_mu * z) / (2.0 - u_mu * z);
                    sep = max(sep, 1.0);
                    u -= sep;
                }
                
                // Sample the procedurally generated wallpaper
                float pu = fract(u / E);
                vec3 col = getPattern(vec2(pu, yPix));
                
                // Convergence Dots (to help the user view the stereogram)
                float cx = u_resolution.x * 0.5;
                float cy = u_resolution.y * 0.92;
                float d1 = length(gl_FragCoord.xy - vec2(cx - E * 0.5, cy));
                float d2 = length(gl_FragCoord.xy - vec2(cx + E * 0.5, cy));
                float dotDist = min(d1, d2);
                
                float mask = smoothstep(9.0, 7.0, dotDist);
                float core = smoothstep(4.0, 2.0, dotDist);
                
                // Draw dots (black outer ring, white core)
                col = mix(col, vec3(0.05), mask);
                col = mix(col, vec3(0.95), core);
                
                fragColor = vec4(col, 1.0);
            }
        `;
        
        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2() },
                u_E: { value: 140.0 }, // Pattern period / Eye separation
                u_mu: { value: 0.45 }  // Depth scale intensity
            },
            vertexShader,
            fragmentShader
        });
        
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);
        
        canvas.__three = { renderer, scene, camera, material };
    }
    
    const { renderer, scene, camera, material } = canvas.__three;
    
    if (material && material.uniforms) {
        material.uniforms.u_time.value = time;
        material.uniforms.u_resolution.value.set(grid.width, grid.height);
        
        // Adjust period slightly based on screen width to ensure it's comfortable
        // 140px is generally good for desktop, scale down slightly for mobile
        const period = Math.max(80.0, Math.min(160.0, grid.width * 0.15));
        material.uniforms.u_E.value = period;
    }
    
    renderer.setSize(grid.width, grid.height, false);
    renderer.render(scene, camera);
    
} catch (error) {
    console.error("WebGL Initialization Failed:", error);
}