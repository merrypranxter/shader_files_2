if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const sceneDepth = new THREE.Scene();
        const sceneStereo = new THREE.Scene();

        // High-precision target for depth to prevent stair-stepping in the stereogram
        const depthTarget = new THREE.WebGLRenderTarget(grid.width, grid.height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType 
        });

        const vertexShader = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        // PASS 1: The Secret Object (Raymarched Depth Map)
        const depthFragmentShader = `
            in vec2 vUv;
            out vec4 fragColor;
            uniform float u_time;
            uniform vec2 u_resolution;

            mat2 rot(float a) {
                float s = sin(a), c = cos(a);
                return mat2(c, -s, s, c);
            }

            float smin(float a, float b, float k) {
                float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
                return mix(b, a, h) - k * h * (1.0 - h);
            }

            // Strange impossible object: Gyroid-infused Torus Knot
            float map(vec3 p) {
                vec3 q = p;
                q.xy *= rot(u_time * 0.2);
                q.yz *= rot(u_time * 0.3);

                // Trefoil-ish knot
                vec2 tq = vec2(length(q.xz) - 1.2, q.y);
                float a = atan(q.z, q.x);
                float c = cos(a * 2.0), s = sin(a * 2.0);
                tq = mat2(c, -s, s, c) * tq;
                float knot = length(tq) - 0.35 + 0.1 * sin(a * 6.0 + u_time * 2.0);

                // Gyroid parasitic growth
                float gyroid = abs(dot(sin(q * 4.0), cos(q.zxy * 4.0))) * 0.2;
                
                // Hollow core to make the topology weirder
                float core = length(q) - 0.7;

                float obj = smin(knot, length(q) - 0.8 + gyroid, 0.3);
                obj = max(obj, -core);

                // Background noise terrain (the "land" behind the object)
                float terrain = p.z + 1.5 + sin(p.x * 2.0 + u_time) * cos(p.y * 2.0) * 0.3;

                return smin(obj, terrain, 0.5);
            }

            void main() {
                vec2 p = (vUv - 0.5) * 2.0;
                p.x *= u_resolution.x / u_resolution.y;

                vec3 ro = vec3(0.0, 0.0, 3.5);
                vec3 rd = normalize(vec3(p, -1.5));

                float t = 0.0;
                float max_t = 8.0;
                for(int i = 0; i < 80; i++) {
                    vec3 pos = ro + rd * t;
                    float d = map(pos);
                    if(d < 0.001 || t > max_t) break;
                    t += d;
                }

                float z = 0.0;
                if(t < max_t) {
                    // Map depth to [0, 1] where 1 is nearest to the eye
                    z = clamp(1.0 - (t - 2.0) / 3.5, 0.0, 1.0);
                    // Dome the depth slightly to ease eye fusion around steep edges
                    z = pow(z, 0.8);
                }

                fragColor = vec4(vec3(z), 1.0);
            }
        `;

        // PASS 2: Stereogram Brain-Hack (Thimbleby-Inglis-Witten GPU Approximation)
        const stereoFragmentShader = `
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform float u_time;
            uniform vec2 u_resolution;
            uniform sampler2D u_depth;
            uniform float u_period;
            uniform float u_mu;

            // Acid Neon Pattern Generator
            vec3 getPattern(vec2 puv) {
                vec2 fuv = fract(puv);
                float TWO_PI = 6.28318530718;

                // High-frequency boro-glass glitter (crucial for stereogram eye-lock)
                float hf = fract(sin(dot(fuv, vec2(12.9898, 78.233))) * 43758.5453);

                // Undulating Lisa-Frank structural waves
                vec2 q = vec2(
                    sin(fuv.x * TWO_PI * 2.0) + cos(fuv.y * TWO_PI * 3.0),
                    sin(fuv.y * TWO_PI * 2.0) + cos(fuv.x * TWO_PI * 3.0)
                );
                float n = sin(q.x * 2.0 + u_time) * cos(q.y * 2.0 - u_time);

                // Toxic Palette
                vec3 c1 = vec3(0.0, 1.0, 0.8); // Electric Cyan
                vec3 c2 = vec3(1.0, 0.0, 0.6); // Hot Pink
                vec3 c3 = vec3(0.6, 1.0, 0.0); // Toxic Lime
                vec3 c4 = vec3(1.0, 0.4, 0.0); // Molten Tangerine
                vec3 c5 = vec3(0.4, 0.0, 1.0); // Ultraviolet

                vec3 col = mix(c1, c2, sin(n * 3.14 + u_time) * 0.5 + 0.5);
                col = mix(col, c4, sin(q.x * 4.0) * 0.5 + 0.5);

                // Op-art sharp geometric cells to aid depth separation
                vec2 cellUv = fract(fuv * 8.0) - 0.5;
                float cellDist = length(cellUv);
                float cellMask = step(0.35, cellDist) * step(cellDist, 0.45);
                col = mix(col, c3, cellMask);

                // Weird glyph noise in the center of cells
                float glyph = step(0.8, fract(sin(dot(floor(fuv * 8.0), vec2(43.12, 12.33)) + u_time * 0.1) * 43758.5453));
                float inner = step(cellDist, 0.15);
                col = mix(col, c5, inner * glyph);

                // Candy enamel shine
                float shine = smoothstep(0.8, 1.0, sin(fuv.x * TWO_PI * 2.0 + fuv.y * TWO_PI * 2.0));
                col += shine * 0.3;

                // Add the high-frequency lock noise
                col += hf * 0.25;

                // Overclock the vibrancy
                col = pow(clamp(col, 0.0, 1.0), vec3(0.8));

                return col;
            }

            void main() {
                float xpix = vUv.x * u_resolution.x;
                float ypix = vUv.y * u_resolution.y;

                float acc = xpix;
                
                // GPU-friendly per-pixel shift approximation.
                // March leftward by the local separation amount until we hit the anchor tile.
                for(int i = 0; i < 80; i++) {
                    vec2 sampleUv = vec2(acc / u_resolution.x, vUv.y);
                    float z = texture(u_depth, sampleUv).r;
                    
                    // The separation formula: sep(z) = E * (1 - mu*z) / (2 - mu*z)
                    float sep = u_period * (1.0 - u_mu * z) / (2.0 - u_mu * z);
                    
                    if (acc - sep < 0.0) break;
                    acc -= sep;
                }

                // Sample the procedural wallpaper at the anchor coordinate
                vec2 puv = vec2(acc / u_period, ypix / u_period);
                vec3 col = getPattern(puv);

                // Convergence Guide Dots (The Magic Eye helper)
                float cx = u_resolution.x * 0.5;
                float cy = u_resolution.y * 0.92;
                float d1 = length(vec2(xpix - (cx - u_period * 0.5), ypix - cy));
                float d2 = length(vec2(xpix - (cx + u_period * 0.5), ypix - cy));
                float dotMask = 1.0 - smoothstep(4.0, 6.0, min(d1, d2));
                float dotCore = 1.0 - smoothstep(1.0, 3.0, min(d1, d2));

                col = mix(col, vec3(0.1, 0.0, 0.2), dotMask); // dark rim
                col = mix(col, vec3(1.0, 1.0, 0.0), dotCore); // bright core

                fragColor = vec4(col, 1.0);
            }
        `;

        const depthMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            vertexShader,
            fragmentShader: depthFragmentShader
        });
        sceneDepth.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), depthMat));

        const stereoMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_depth: { value: depthTarget.texture },
                u_period: { value: 128.0 },
                u_mu: { value: 0.45 }
            },
            vertexShader,
            fragmentShader: stereoFragmentShader
        });
        sceneStereo.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), stereoMat));

        canvas.__three = { renderer, camera, sceneDepth, sceneStereo, depthTarget, depthMat, stereoMat };
    } catch (e) {
        console.error("Autostereogram WebGL Init Failed:", e);
        return;
    }
}

const { renderer, camera, sceneDepth, sceneStereo, depthTarget, depthMat, stereoMat } = canvas.__three;

// Dynamic eye-separation period based on screen width
const calculatedPeriod = Math.max(80.0, Math.min(160.0, grid.width * 0.15));

if (depthMat?.uniforms?.u_time) {
    depthMat.uniforms.u_time.value = time;
    depthMat.uniforms.u_resolution.value.set(grid.width, grid.height);
}

if (stereoMat?.uniforms?.u_time) {
    stereoMat.uniforms.u_time.value = time;
    stereoMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    stereoMat.uniforms.u_period.value = calculatedPeriod;
}

renderer.setSize(grid.width, grid.height, false);

// Pass 1: Render the 3D depth map to the FBO
renderer.setRenderTarget(depthTarget);
renderer.render(sceneDepth, camera);

// Pass 2: Render the stereogram pattern shift to the screen
renderer.setRenderTarget(null);
renderer.render(sceneStereo, camera);