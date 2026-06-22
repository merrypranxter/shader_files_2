try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        renderer.autoClear = false;

        // Depth Map Render Target (High Precision)
        const depthTarget = new THREE.WebGLRenderTarget(grid.width, grid.height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType
        });

        // --------------------------------------------------------
        // PASS 1: Depth Map (Raymarched SDF Scene)
        // --------------------------------------------------------
        const sceneDepth = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const matDepth = new THREE.ShaderMaterial({
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
                precision highp float;
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

                float map(vec3 p) {
                    // Wavy background terrain
                    float terrain = p.y + 1.2 + sin(p.x * 2.0 + u_time * 0.5) * cos(p.z * 2.0) * 0.25;
                    
                    // Floating impossible object (Alien Torus Knot)
                    vec3 q = p;
                    q.y -= 0.3; // float above ground
                    q.xy *= rot(u_time * 0.3);
                    q.xz *= rot(u_time * 0.5);
                    
                    float a = atan(q.z, q.x);
                    vec2 tq = vec2(length(q.xz) - 0.7, q.y);
                    tq *= rot(a * 2.0 + u_time);
                    
                    // Star-like cross-section
                    float r = 0.25 + 0.06 * sin(atan(tq.y, tq.x) * 5.0);
                    float knot = length(tq) - r;
                    
                    // Inner core sphere
                    float core = length(q) - 0.45 + 0.05 * sin(q.x * 12.0 + u_time * 4.0);
                    
                    // Orbiting rings
                    vec3 oq = p;
                    oq.y -= 0.3;
                    oq.xz *= rot(-u_time * 0.8);
                    oq.yz *= rot(u_time * 0.6);
                    float ring = length(vec2(length(oq.xz) - 1.3, oq.y)) - 0.06;
                    
                    float obj = smin(knot, core, 0.25);
                    obj = smin(obj, ring, 0.15);
                    
                    return min(terrain, obj);
                }

                void main() {
                    vec2 uv = (vUv - 0.5) * 2.0;
                    uv.x *= u_resolution.x / u_resolution.y;

                    vec3 ro = vec3(0.0, 1.2, 4.0);
                    vec3 target = vec3(0.0, 0.0, 0.0);
                    vec3 fwd = normalize(target - ro);
                    vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
                    vec3 up = cross(right, fwd);
                    vec3 rd = normalize(fwd * 1.5 + uv.x * right + uv.y * up);

                    float t = 0.0;
                    float hit = -1.0;
                    for(int i = 0; i < 90; i++) {
                        vec3 p = ro + rd * t;
                        float d = map(p);
                        if(d < 0.005) { hit = t; break; }
                        t += d;
                        if(t > 9.0) break;
                    }

                    float z = 0.0;
                    if(hit > 0.0) {
                        // Map distance to depth [0, 1] (1 is closest to camera)
                        // Smooth falloff to aid stereoscopic fusion
                        z = 1.0 - clamp((hit - 2.0) / 4.5, 0.0, 1.0);
                        z = smoothstep(0.0, 1.0, z); 
                    }
                    
                    fragColor = vec4(vec3(z), 1.0);
                }
            `
        });
        const quadDepth = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matDepth);
        sceneDepth.add(quadDepth);

        // --------------------------------------------------------
        // PASS 2: Stereogram Compose (Wallpaper + Depth Shift)
        // --------------------------------------------------------
        const sceneStereo = new THREE.Scene();
        const matStereo = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_depthTex: { value: depthTarget.texture }
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
                in vec2 vUv;
                out vec4 fragColor;
                
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform sampler2D u_depthTex;

                float hash21(vec2 p) {
                    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                }

                // Generates the vibrant, repeating wallpaper
                vec3 getPattern(vec2 p) {
                    // Wrap X seamlessly using a cylindrical coordinate projection
                    float px = p.x * 6.2831853; 
                    vec3 pos = vec3(cos(px), sin(px), p.y * 3.5);
                    
                    pos.z -= u_time * 0.15;
                    
                    // Domain warping
                    vec3 q = pos;
                    q.x += sin(pos.z * 3.0 + u_time) * 0.3;
                    q.y += cos(pos.x * 2.0 - u_time) * 0.3;
                    
                    float n1 = sin(q.x * 4.0) * cos(q.y * 4.0) * sin(q.z * 4.0);
                    float n2 = sin(q.x * 8.0 - u_time) * cos(q.y * 8.0) * sin(q.z * 8.0);
                    
                    float val = n1 * 0.6 + n2 * 0.4;
                    
                    // Lisa-Frank-on-lab-equipment Palette
                    vec3 col = vec3(0.0);
                    float phase = fract(val * 2.0 + u_time * 0.15 + p.y);
                    
                    vec3 c1 = vec3(1.0, 0.0, 0.8); // Hot Pink
                    vec3 c2 = vec3(0.0, 1.0, 1.0); // Electric Cyan
                    vec3 c3 = vec3(0.4, 0.0, 1.0); // Ultraviolet
                    vec3 c4 = vec3(0.8, 1.0, 0.0); // Toxic Lime
                    vec3 c5 = vec3(1.0, 0.4, 0.0); // Molten Tangerine
                    
                    if (phase < 0.2) col = mix(c1, c2, phase * 5.0);
                    else if (phase < 0.4) col = mix(c2, c3, (phase - 0.2) * 5.0);
                    else if (phase < 0.6) col = mix(c3, c4, (phase - 0.4) * 5.0);
                    else if (phase < 0.8) col = mix(c4, c5, (phase - 0.6) * 5.0);
                    else col = mix(c5, c1, (phase - 0.8) * 5.0);
                    
                    // Op-art moiré / Holographic sheen
                    float moire = sin(p.y * 300.0 + val * 40.0) * cos(p.x * 6.2831853 * 24.0 + val * 40.0);
                    col += vec3(moire * 0.2);
                    
                    // Candy enamel specular highlights
                    float spec = pow(max(0.0, sin(val * 20.0)), 12.0);
                    col += spec * vec3(0.8, 1.0, 1.0);
                    
                    // Chrome glitter
                    float glitter = fract(sin(dot(p, vec2(12.9898, 78.233)) + u_time) * 43758.5453);
                    col += pow(glitter, 28.0) * 1.5 * vec3(1.0, 0.6, 0.9);
                    
                    // Alien sticker glyph-noise (Ensure integer multiplier for seamless X wrap)
                    vec2 gv = fract(vec2(p.x * 24.0, p.y * 24.0));
                    vec2 id = floor(vec2(p.x * 24.0, p.y * 24.0));
                    float glyphBox = step(0.75, hash21(id + floor(u_time * 0.5)));
                    if (glyphBox > 0.0) {
                        float shape = step(0.5, hash21(id + floor(gv * 4.0)));
                        col = mix(col, vec3(0.05, 0.0, 0.15), shape * 0.8);
                    }

                    return col;
                }

                void main() {
                    // The stereogram pattern period (eye separation in pixels)
                    float E = 128.0; 
                    float mu = 0.4;  // Parallax depth scale
                    
                    float xPix = vUv.x * u_resolution.x;
                    float yPix = vUv.y * u_resolution.y;

                    float u = xPix;
                    
                    // March leftwards looking for the corresponding wallpaper pixel
                    // This implements the GPU approximation of the SIRDS algorithm
                    for(int i = 0; i < 120; i++) {
                        if(u < E) break;
                        
                        float sampleX = clamp(u / u_resolution.x, 0.0, 1.0);
                        float z = texture(u_depthTex, vec2(sampleX, vUv.y)).r;
                        
                        float sep = E * (1.0 - mu * z) / (2.0 - mu * z);
                        sep = max(sep, 1.0); // Prevent infinite loops
                        
                        u -= sep;
                    }

                    // Map the found coordinate into the repeating wallpaper tile
                    float pu = fract(u / E);
                    vec3 color = getPattern(vec2(pu, vUv.y));

                    // Convergence dots (to help the brain lock the wall-eyed fusion)
                    float cx = u_resolution.x * 0.5;
                    float cy = u_resolution.y * 0.92;
                    float d1 = length(vec2(xPix, yPix) - vec2(cx - E * 0.5, cy));
                    float d2 = length(vec2(xPix, yPix) - vec2(cx + E * 0.5, cy));
                    float dotDist = min(d1, d2);
                    
                    if (dotDist < 10.0) {
                        color = mix(color, vec3(0.0), smoothstep(10.0, 8.0, dotDist)); // Black outline
                        color = mix(color, vec3(1.0), smoothstep(5.0, 3.0, dotDist));  // White core
                    }

                    fragColor = vec4(color, 1.0);
                }
            `
        });
        const quadStereo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matStereo);
        sceneStereo.add(quadStereo);

        canvas.__three = { renderer, depthTarget, sceneDepth, matDepth, sceneStereo, matStereo, camera };
    }

    const { renderer, depthTarget, sceneDepth, matDepth, sceneStereo, matStereo, camera } = canvas.__three;

    // Handle resizes
    const currentSize = renderer.getSize(new THREE.Vector2());
    if (currentSize.width !== grid.width || currentSize.height !== grid.height) {
        renderer.setSize(grid.width, grid.height, false);
        depthTarget.setSize(grid.width, grid.height);
        matDepth.uniforms.u_resolution.value.set(grid.width, grid.height);
        matStereo.uniforms.u_resolution.value.set(grid.width, grid.height);
    }

    // Update time
    matDepth.uniforms.u_time.value = time;
    matStereo.uniforms.u_time.value = time;

    // Pass 1: Render depth map to texture
    renderer.setRenderTarget(depthTarget);
    renderer.render(sceneDepth, camera);

    // Pass 2: Render stereogram to screen
    renderer.setRenderTarget(null);
    renderer.render(sceneStereo, camera);

} catch (e) {
    console.error("WebGL Initialization Failed:", e);
}