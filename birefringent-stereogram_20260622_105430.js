try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;

        // ---------------------------------------------------------------------
        // PASS 1: THE ABYSSAL DEPTH MAP (Lithogenesis + Gyroid Labyrinths)
        // ---------------------------------------------------------------------
        const depthTarget = new THREE.WebGLRenderTarget(grid.width, grid.height, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            depthBuffer: false,
            stencilBuffer: false
        });

        const depthScene = new THREE.Scene();
        const depthCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        const depthMaterial = new THREE.ShaderMaterial({
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
                in vec2 vUv;
                out vec4 fragColor;
                uniform float u_time;
                uniform vec2 u_resolution;

                mat2 rot(float a) {
                    float s = sin(a), c = cos(a);
                    return mat2(c, -s, s, c);
                }

                float sdOctahedron(vec3 p, float s) {
                    p = abs(p);
                    return (p.x + p.y + p.z - s) * 0.57735027;
                }
                
                float sdBox(vec3 p, vec3 b) {
                    vec3 q = abs(p) - b;
                    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
                }

                float map(vec3 p) {
                    vec3 q = p;
                    q.z += u_time * 2.5; // Descent into the machine

                    // Machine hesitation / Glitch Prophet
                    float glitch = step(0.95, sin(u_time * 12.0 + q.y * 8.0)) * 0.3;
                    q.x += glitch;

                    // The Gyroid Manifold (Repo: gyroid_lattice)
                    vec3 pt = q;
                    pt.xy *= rot(pt.z * 0.05 + sin(u_time * 0.1) * 0.2);
                    float tunnel = 4.0 - length(pt.xy) + 0.8 * dot(sin(pt * 1.5), cos(pt.zxy * 1.5));

                    // Birefringent Crystalline Core (Repo: birefringence)
                    vec3 pc = q;
                    pc.z = mod(pc.z, 8.0) - 4.0;
                    pc.xy *= rot(u_time * 0.4 + q.z * 0.1);
                    pc.yz *= rot(u_time * 0.3);
                    float crystal = sdOctahedron(pc, 1.2 + 0.2 * sin(u_time * 2.0));

                    // Bureaucratic Framework (Repo: outsider_art_style - Horror Vacui frames)
                    vec3 pb = q;
                    pb.z = mod(pb.z, 4.0) - 2.0;
                    pb.xy *= rot(0.785398); // 45 degrees
                    float rings = max(sdBox(pb, vec3(2.5, 2.5, 0.1)), -sdBox(pb, vec3(2.3, 2.3, 0.2)));

                    return min(min(tunnel, crystal), rings);
                }

                void main() {
                    vec2 uv = (vUv - 0.5) * 2.0;
                    uv.x *= u_resolution.x / u_resolution.y;
                    
                    vec3 ro = vec3(0.0, 0.0, -2.0);
                    vec3 rd = normalize(vec3(uv, 1.2)); // Slight FOV distortion

                    float t = 0.0;
                    for(int i = 0; i < 90; i++) {
                        vec3 p = ro + rd * t;
                        float d = map(p);
                        if(d < 0.01) break;
                        t += d;
                        if(t > 30.0) { t = 30.0; break; }
                    }

                    // Depth fossilization: Map to [0, 1] where 1 is close
                    float depth = 1.0 - clamp(t / 25.0, 0.0, 1.0);
                    
                    // Strata Ribbons / Quantized Laplacians
                    depth = floor(depth * 35.0) / 35.0;

                    // Rolling bar heartbeat (Repo: crt_phosphor_fx)
                    float bar = smoothstep(0.98, 1.0, sin(vUv.y * 10.0 - u_time * 4.0));
                    depth += bar * 0.02;

                    fragColor = vec4(vec3(depth), 1.0);
                }
            `
        });
        
        const depthMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), depthMaterial);
        depthScene.add(depthMesh);

        // ---------------------------------------------------------------------
        // PASS 2: THE AUTOSTEREOGRAM DECODER (Phosphor Lattice + Riso Punk)
        // ---------------------------------------------------------------------
        const stereoScene = new THREE.Scene();
        const stereoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const stereoMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_depth: { value: depthTarget.texture }
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
                
                uniform sampler2D u_depth;
                uniform float u_time;
                uniform vec2 u_resolution;

                // Feral Hash
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                }

                // The Living Optical Material (Structural Color + Phosphor Triads)
                vec3 getPattern(vec2 uv) {
                    // Map uv.x to a cylinder to ensure seamless tiling of the carrier texture
                    float angle = uv.x * 6.2831853;
                    vec3 p3 = vec3(cos(angle), sin(angle), uv.y * 6.0 + u_time * 0.15);
                    
                    // Mycological Voronoi Minkowski morphing
                    float n = 0.0;
                    float a = 0.5;
                    for(int i = 0; i < 4; i++) {
                        n += a * sin(p3.x * 6.0 + sin(p3.y * 4.0) + p3.z * 5.0);
                        p3 *= 1.7;
                        p3.xy = vec2(p3.x * 0.8 - p3.y * 0.6, p3.x * 0.6 + p3.y * 0.8);
                        a *= 0.5;
                    }
                    n = smoothstep(-0.6, 0.6, n);

                    // RISO_PUNK + ACID Palette
                    vec3 colNavy = vec3(0.004, 0.129, 0.412);
                    vec3 colPink = vec3(1.0, 0.420, 0.710);
                    vec3 colAcid = vec3(0.0, 0.663, 0.361);
                    vec3 colCream = vec3(0.961, 0.941, 0.910);

                    // Michel-Levy Interference distribution
                    vec3 color = mix(colNavy, colPink, smoothstep(0.2, 0.5, n));
                    color = mix(color, colAcid, smoothstep(0.6, 0.8, n));
                    color = mix(color, colCream, smoothstep(0.85, 1.0, n));

                    // Aperture Grille / Phosphor Triads (Repo: crt_phosphor_fx)
                    float triad = mod(uv.x * 120.0, 3.0);
                    vec3 phosphor = vec3(
                        smoothstep(1.2, 0.0, abs(triad - 0.5)),
                        smoothstep(1.2, 0.0, abs(triad - 1.5)),
                        smoothstep(1.2, 0.0, abs(triad - 2.5))
                    );

                    // XOR-Ghost Manifold (W-10) - Bitwise steganography
                    uint ix = uint(uv.x * 600.0);
                    uint iy = uint(uv.y * 600.0);
                    uint xor_val = ix ^ iy;
                    float xor_f = float(xor_val % 7u) / 6.0;
                    
                    // Multiply Blend (Repo: risograph_style)
                    color *= mix(vec3(1.0), phosphor, 0.75);
                    color += xor_f * 0.15 * colPink;

                    // Outsider Art Wobble / Crayon Grain
                    float grain = hash(uv * 500.0);
                    color *= (0.85 + 0.15 * grain);

                    return color;
                }

                void main() {
                    // Stereogram Mechanics
                    float P = 0.12; // Base pattern width (12% of screen)
                    float depth_factor = 0.04; // Maximum parallax shift

                    float u = vUv.x;
                    float v = vUv.y;

                    // SIRDS Backward Raytrace approximation
                    // Trace back to the original pattern strip [0, P)
                    for(int i = 0; i < 40; i++) {
                        if (u < P) break;
                        
                        // Read depth at current location
                        float d = texture(u_depth, vec2(u, v)).r;
                        
                        // Shift backwards by the modulated period
                        u -= (P - d * depth_factor);
                    }

                    // Safety wrap to ensure we land perfectly in the tile space
                    u = mod(u, P);

                    // Normalize into [0, 1] texture space for the pattern generator
                    vec2 pattern_uv = vec2(u / P, v);
                    vec3 col = getPattern(pattern_uv);

                    // Scanline / CRT Vignette damage over the final stereogram
                    float scan = sin(vUv.y * u_resolution.y * 3.14159) * 0.04;
                    float vig = 1.0 - smoothstep(0.5, 1.5, length(vUv - 0.5));
                    
                    fragColor = vec4((col - scan) * vig, 1.0);
                }
            `
        });

        const stereoMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), stereoMaterial);
        stereoScene.add(stereoMesh);

        canvas.__three = { 
            renderer, 
            depthScene, depthCamera, depthTarget, depthMaterial,
            stereoScene, stereoCamera, stereoMaterial 
        };
    }

    const { 
        renderer, 
        depthScene, depthCamera, depthTarget, depthMaterial,
        stereoScene, stereoCamera, stereoMaterial 
    } = canvas.__three;

    // Update dimensions
    renderer.setSize(grid.width, grid.height, false);
    depthTarget.setSize(grid.width, grid.height);

    // Update state
    depthMaterial.uniforms.u_time.value = time;
    depthMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
    
    stereoMaterial.uniforms.u_time.value = time;
    stereoMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);

    // Render Sequence
    // 1. Generate the hidden 3D topography
    renderer.setRenderTarget(depthTarget);
    renderer.render(depthScene, depthCamera);

    // 2. Transduce the depth map into the optical stereogram lattice
    renderer.setRenderTarget(null);
    renderer.render(stereoScene, stereoCamera);

} catch (e) {
    console.error("Feral Lithogenesis Failed:", e);
}