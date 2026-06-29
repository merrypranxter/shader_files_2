if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        camera.position.z = 1;

        const vertexShader = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            precision highp float;
            
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform float u_time;
            uniform vec2 u_resolution;
            
            // Fast hash for electrostatic grain
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }
            
            // 2D Rotation matrix
            mat2 rot(float a) {
                float s = sin(a);
                float c = cos(a);
                return mat2(c, -s, s, c);
            }
            
            // Feral Hyperbolic Gyroid Field
            float field(vec2 p, float t_slow, float t_med) {
                vec2 q = p;
                float d = 0.0;
                float amp = 0.5;
                float freq = 1.0;
                
                for(int i = 0; i < 6; i++) {
                    // Machine hesitation phase (medium scale)
                    float phase = t_slow + float(i) * 1.61803398875;
                    
                    // Vector advection
                    vec2 shift = vec2(sin(q.y * freq + phase), cos(q.x * freq - phase));
                    
                    // Hyperbolic/Poincare tear (creates infinite density folds)
                    float r2 = dot(q, q);
                    q += shift * (0.2 + 0.1 / (r2 + 0.05));
                    
                    // Rotational warp
                    q *= rot(t_slow * 0.15 + float(i));
                    q *= 1.35;
                    
                    // Accumulate gyroid ridges
                    d += abs(sin(q.x) * cos(q.y)) * amp;
                    
                    amp *= 0.65;
                    freq *= 1.25;
                    
                    // Flow bias
                    q.x += t_med * 0.2;
                }
                return d;
            }
            
            // Screen blend for glowing neon ink
            vec3 screenBlend(vec3 a, vec3 b) {
                return vec3(1.0, 1.0, 1.0) - (vec3(1.0, 1.0, 1.0) - a) * (vec3(1.0, 1.0, 1.0) - b);
            }
            
            void main() {
                // Aspect correct UV
                vec2 uv = vUv * 2.0 - vec2(1.0, 1.0);
                uv.x *= u_resolution.x / u_resolution.y;
                uv *= 1.2;
                
                // 3 Simultaneous Time Scales
                float t_slow = u_time * 0.08; // Global drift
                float t_med  = u_time * 0.40; // Structural flow
                float t_fast = u_time * 2.50; // High-frequency shimmer & iridescence
                
                // Chromatic Aberration / CMY Misregistration offsets
                vec2 dir = normalize(uv + vec2(0.001, 0.001));
                vec2 offC = dir * 0.030 * sin(t_fast);
                vec2 offM = dir * -0.020 * cos(t_fast * 1.3);
                vec2 offY = vec2(0.015, -0.015) * sin(t_fast * 0.8);
                
                // Sample fields per color channel
                float fC = field(uv + offC, t_slow, t_med);
                float fM = field(uv + offM, t_slow, t_med);
                float fY = field(uv + offY, t_slow, t_med);
                
                // Compute structural normal from the Magenta field for physical depth
                vec2 e = vec2(0.01, 0.0);
                float fMx = field(uv + offM + vec2(e.x, e.y), t_slow, t_med);
                float fMy = field(uv + offM + vec2(e.y, e.x), t_slow, t_med);
                vec3 n = normalize(vec3(fMx - fM, fMy - fM, 0.15));
                
                // Palette
                vec3 neonCyan = vec3(0.0, 1.0, 0.94);
                vec3 neonMag  = vec3(1.0, 0.0, 0.80);
                vec3 neonYel  = vec3(0.8, 1.0, 0.00);
                vec3 voidBlk  = vec3(0.02, 0.01, 0.03);
                
                vec3 col = voidBlk;
                
                // Map fields to interference contours (Fast scale shimmering)
                float cC = smoothstep(0.4, 0.6, sin(fC * 18.0 - t_fast) * 0.5 + 0.5);
                float cM = smoothstep(0.4, 0.6, sin(fM * 18.0 + t_fast * 1.1) * 0.5 + 0.5);
                float cY = smoothstep(0.7, 0.9, sin(fY * 12.0) * 0.5 + 0.5);
                
                // Composite via Screen Blend
                col = screenBlend(col, neonCyan * cC);
                col = screenBlend(col, neonMag  * cM);
                col = screenBlend(col, neonYel  * cY);
                
                // Specular Glint (Wet/Glossy physical finish)
                vec3 lightDir = normalize(vec3(sin(t_slow), cos(t_slow), 1.0));
                float spec = pow(max(dot(n, lightDir), 0.0), 24.0);
                col += neonYel * spec * 1.2;
                
                // Fibrous internal structure
                float fiber = sin(uv.x * 80.0 + fC * 10.0) * cos(uv.y * 80.0 + fM * 10.0);
                col *= mix(0.8, 1.0, smoothstep(-1.0, 1.0, fiber));
                
                // CRT / Print Artifacts
                vec2 fragCoord = vUv * u_resolution;
                float maskX = mod(fragCoord.x, 3.0);
                vec3 mask = vec3(
                    smoothstep(1.0, 0.0, abs(maskX - 0.5)),
                    smoothstep(1.0, 0.0, abs(maskX - 1.5)),
                    smoothstep(1.0, 0.0, abs(maskX - 2.5))
                );
                float slotY = fract(fragCoord.y / 6.0);
                float slot = smoothstep(0.0, 0.15, slotY) * smoothstep(1.0, 0.85, slotY);
                mask *= mix(0.4, 1.0, slot);
                
                // Apply shadow mask
                col *= mix(vec3(1.0, 1.0, 1.0), mask, 0.7);
                
                // Scanlines
                float scan = 0.5 + 0.5 * sin(fragCoord.y * 3.14159265);
                col *= mix(1.0, scan, 0.25);
                
                // Electrostatic Grain
                float noiseVal = hash(vUv * 150.0 + vec2(t_fast, t_fast));
                col += (noiseVal - 0.5) * 0.12 * neonCyan;
                
                // Vignette falloff
                vec2 centerDist = vUv - vec2(0.5, 0.5);
                float vig = 1.0 - dot(centerDist, centerDist) * 1.8;
                col *= clamp(vig, 0.0, 1.0);
                
                // Strict clamping before output
                col = clamp(col, vec3(0.0, 0.0, 0.0), vec3(1.0, 1.0, 1.0));
                fragColor = vec4(col.r, col.g, col.b, 1.0);
            }
        `;

        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader,
            fragmentShader,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            depthWrite: false,
            depthTest: false
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);

        canvas.__three = { renderer, scene, camera, material };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        throw e;
    }
}

const { renderer, scene, camera, material } = canvas.__three;
if (material && material.uniforms) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);