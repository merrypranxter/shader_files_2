function(ctx, grid, time, repos, input, mouse, canvas, THREE) {
    if (!canvas.__three) {
        try {
            if (!ctx) throw new Error("WebGL 2 context not available");

            const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
            renderer.setPixelRatio(1.0); // Exact pixel mapping required for stereograms

            // Setup Depth Pass FBO
            const depthTarget = new THREE.WebGLRenderTarget(grid.width, grid.height, {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.RGBAFormat,
                type: THREE.HalfFloatType
            });

            const depthCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            const depthScene = new THREE.Scene();
            
            // Pass 1: SDF Depth Map
            const depthMat = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_time: { value: 0 },
                    u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
                },
                vertexShader: `
                    out vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform float u_time;
                    uniform vec2 u_resolution;
                    in vec2 vUv;
                    out vec4 fragColor;

                    mat2 rot(float a) {
                        float s = sin(a), c = cos(a);
                        return mat2(c, -s, s, c);
                    }

                    // 3D Torus SDF
                    float sdTorus(vec3 p, vec2 t) {
                        vec2 q = vec2(length(p.xz) - t.x, p.y);
                        return length(q) - t.y;
                    }

                    // Alien Sticker-Object / Impossible Topology SDF
                    float map(vec3 p) {
                        float t = u_time * 0.4;
                        
                        // Breathing glyph pulse
                        float pulse = 1.0 + 0.08 * sin(t * 5.0);
                        p /= pulse;

                        // Rotations
                        p.xy *= rot(t);
                        p.yz *= rot(t * 1.3);

                        // Twisted torus knot illusion
                        vec3 q = p;
                        q.xz *= rot(q.y * 3.0 + t * 2.0);
                        float d1 = sdTorus(q, vec2(0.65, 0.25));

                        // Intersecting octahedron core
                        vec3 a = abs(p);
                        float d2 = (a.x + a.y + a.z - 1.2) * 0.57735;

                        // Smooth union to create blobby, organic connections
                        float k = 0.2;
                        float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
                        float d3 = mix(d2, d1, h) - k * h * (1.0 - h);

                        // High-frequency fractal bumps
                        float bumps = sin(p.x * 14.0) * sin(p.y * 14.0) * sin(p.z * 14.0) * 0.04;

                        // Orbiting satellite traps
                        vec3 sq = p;
                        sq.xz *= rot(-t * 2.0);
                        float d4 = length(abs(sq) - vec3(0.85)) - 0.12;

                        return min(d3 + bumps, d4) * pulse;
                    }

                    void main() {
                        vec2 uv = (vUv - 0.5) * 2.0;
                        uv.x *= u_resolution.x / u_resolution.y;

                        vec3 ro = vec3(0.0, 0.0, 3.0);
                        vec3 rd = normalize(vec3(uv, -1.0));

                        float t_dist = 0.0;
                        float d = 0.0;
                        for(int i = 0; i < 80; i++) {
                            vec3 p = ro + rd * t_dist;
                            d = map(p);
                            if(d < 0.002 || t_dist > 6.0) break;
                            t_dist += d;
                        }

                        // Convert hit distance to depth z in [0, 1]
                        float z = 0.0;
                        if(t_dist < 6.0) {
                            z = 1.0 - smoothstep(1.5, 4.0, t_dist);
                            z = pow(z, 0.85); // Dome falloff curve
                        }

                        // Drifting background noise terrain
                        float terrain = (sin(uv.x * 4.0 + u_time * 0.5) * cos(uv.y * 4.0 - u_time * 0.3) + 1.0) * 0.07;
                        z = max(z, terrain);

                        fragColor = vec4(vec3(clamp(z, 0.0, 1.0)), 1.0);
                    }
                `
            });
            const depthQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), depthMat);
            depthScene.add(depthQuad);

            // Pass 2: Autostereogram Generator
            const stereoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            const stereoScene = new THREE.Scene();
            const stereoMat = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_time: { value: 0 },
                    u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                    u_depth: { value: depthTarget.texture },
                    u_E: { value: 128.0 },
                    u_mu: { value: 0.4 }
                },
                vertexShader: `
                    out vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform float u_time;
                    uniform vec2 u_resolution;
                    uniform sampler2D u_depth;
                    uniform float u_E;
                    uniform float u_mu;

                    in vec2 vUv;
                    out vec4 fragColor;

                    float hash(vec2 p) { 
                        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); 
                    }

                    float noise(vec2 p) {
                        vec2 i = floor(p), f = fract(p);
                        f = f * f * (3.0 - 2.0 * f);
                        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
                    }

                    float fbm(vec2 p) {
                        float v = 0.0, a = 0.5;
                        for(int i = 0; i < 5; i++) { 
                            v += a * noise(p); 
                            p *= 2.0; 
                            a *= 0.5; 
                        }
                        return v;
                    }

                    // Acid Neon / Lisa Frank procedural tiled wallpaper
                    vec3 getPattern(vec2 p, float E) {
                        vec2 uv = p / E;
                        
                        // Map uv.x to a circle to guarantee perfect horizontal seamless tiling
                        vec2 st = vec2(cos(uv.x * 6.2831853), sin(uv.x * 6.2831853)) * 0.25;
                        st.y += uv.y * 2.0; // Vertical scale based on pixel ratio

                        float t = u_time * 0.3;

                        // Reaction-diffusion style domain warping
                        vec2 q = vec2(fbm(st + t), fbm(st + vec2(5.2, 1.3) - t));
                        vec2 r = vec2(fbm(st + 4.0 * q + vec2(1.7, 9.2)), fbm(st + 4.0 * q + vec2(8.3, 2.8)));
                        float f = fbm(st + 4.0 * r);

                        // Toxic Psychedelic Palette
                        vec3 c1 = vec3(1.0, 0.0, 0.8); // Ultraviolet / Hot Pink
                        vec3 c2 = vec3(0.0, 1.0, 0.9); // Electric Cyan
                        vec3 c3 = vec3(0.7, 1.0, 0.0); // Toxic Lime
                        vec3 c4 = vec3(1.0, 0.4, 0.0); // Molten Tangerine

                        vec3 col = mix(c1, c2, clamp(q.x * 1.5, 0.0, 1.0));
                        col = mix(col, c3, clamp(r.y * 1.5, 0.0, 1.0));
                        col = mix(col, c4, clamp(f * 1.5, 0.0, 1.0));

                        // Op-art moiré interference lines
                        float moire = sin(st.y * 80.0 + f * 40.0) * cos(st.x * 80.0 + r.x * 40.0);
                        col += smoothstep(0.7, 1.0, moire) * vec3(0.6);

                        // Chrome glitter / Boro-glass sparkle
                        float glitter = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                        col += step(0.96, glitter) * 0.9;

                        // Sticker-like bold cellular borders
                        float edge = fbm(st * 12.0);
                        col *= smoothstep(0.45, 0.55, edge) * 0.7 + 0.3;

                        return clamp(col, 0.0, 1.0);
                    }

                    void main() {
                        float E = max(u_E, 1.0);
                        float u = gl_FragCoord.x;
                        float yPix = gl_FragCoord.y;

                        // GPU Approximation: March leftward until within the first tile [0, E)
                        // This handles the horizontal depth shifts required for brain fusion
                        for(int i = 0; i < 200; i++) {
                            if (u < E) break;
                            float sampleX = clamp(u / u_resolution.x, 0.0, 1.0);
                            float sampleY = vUv.y;
                            float z = texture(u_depth, vec2(sampleX, sampleY)).r;
                            
                            // Separation Equation: sep(z) = E * (1 - mu*z) / (2 - mu*z)
                            float sep = E * (1.0 - u_mu * z) / (2.0 - u_mu * z);
                            sep = max(sep, 1.0);
                            u -= sep;
                        }

                        // Sample the seamless wallpaper pattern
                        vec3 col = getPattern(vec2(u, yPix), E);

                        // Wall-eyed Convergence Dots (Fusion guides)
                        float cx = u_resolution.x * 0.5;
                        float cy = u_resolution.y * 0.92;
                        float d1 = length(gl_FragCoord.xy - vec2(cx - E * 0.5, cy));
                        float d2 = length(gl_FragCoord.xy - vec2(cx + E * 0.5, cy));
                        float dotDist = min(d1, d2);
                        
                        if (dotDist < 8.0) {
                            float mask = smoothstep(8.0, 6.0, dotDist);
                            float core = smoothstep(3.5, 1.5, dotDist);
                            col = mix(col, vec3(0.05), mask); // Dark ring
                            col = mix(col, vec3(0.95), core); // Bright center
                        }

                        fragColor = vec4(col, 1.0);
                    }
                `
            });
            const stereoQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), stereoMat);
            stereoScene.add(stereoQuad);

            canvas.__three = {
                renderer,
                depthTarget,
                depthScene, depthCamera, depthMat,
                stereoScene, stereoCamera, stereoMat
            };
        } catch (e) {
            console.error("WebGL Initialization Failed:", e);
            return;
        }
    }

    const { renderer, depthTarget, depthScene, depthCamera, depthMat, stereoScene, stereoCamera, stereoMat } = canvas.__three;

    // Handle Resize
    if (depthTarget.width !== grid.width || depthTarget.height !== grid.height) {
        renderer.setSize(grid.width, grid.height, false);
        depthTarget.setSize(grid.width, grid.height);
        if(depthMat.uniforms.u_resolution) depthMat.uniforms.u_resolution.value.set(grid.width, grid.height);
        if(stereoMat.uniforms.u_resolution) stereoMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    }

    // Update Time Uniforms
    if (depthMat.uniforms.u_time) depthMat.uniforms.u_time.value = time;
    if (stereoMat.uniforms.u_time) stereoMat.uniforms.u_time.value = time;

    // Pass 1: Render 3D SDF to Depth Target
    renderer.setRenderTarget(depthTarget);
    renderer.render(depthScene, depthCamera);

    // Pass 2: Generate Stereogram using Depth Target
    renderer.setRenderTarget(null);
    renderer.render(stereoScene, stereoCamera);
}