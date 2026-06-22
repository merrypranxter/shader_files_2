try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: false, antialias: false });
        renderer.autoClear = false;
        renderer.setPixelRatio(1.0);

        const w = grid.width;
        const h = grid.height;

        const sceneTarget = new THREE.WebGLRenderTarget(w, h, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType });
        let readTarget = new THREE.WebGLRenderTarget(w, h, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType });
        let writeTarget = new THREE.WebGLRenderTarget(w, h, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType });

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const quadGeo = new THREE.PlaneGeometry(2, 2);

        // --- PASS 1: WFC Gyroid & Mycelium Raymarcher ---
        const matRay = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(w, h) }
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

                #define PI 3.14159265359

                float hash(vec3 p) {
                    p = fract(p * vec3(123.34, 456.21, 789.12));
                    p += dot(p, p + 45.32);
                    return fract(p.x * p.y * p.z);
                }

                mat2 rot(float a) {
                    float s = sin(a), c = cos(a);
                    return mat2(c, -s, s, c);
                }

                // Scene SDF: WFC Gyroid Cathedral
                float sdScene(vec3 p) {
                    vec3 id = floor(p);
                    vec3 localP = p - (id + 0.5);

                    // WFC Logic: Cells flip and rotate rhythmically
                    float cellHash = hash(id);
                    float flipTimer = floor(u_time * 0.4 + cellHash * 10.0);
                    float flipTarget = hash(id + flipTimer) * PI * 0.5;
                    
                    float ft = fract(u_time * 0.4 + cellHash * 10.0);
                    float fAngle = mix(0.0, flipTarget, smoothstep(0.0, 0.25, ft));

                    if (cellHash < 0.33) {
                        localP.xy *= rot(fAngle);
                    } else if (cellHash < 0.66) {
                        localP.xz *= rot(fAngle);
                    } else {
                        localP.yz *= rot(fAngle);
                    }

                    vec3 rotatedP = (id + 0.5) + localP;
                    vec3 scaledP = rotatedP * PI;
                    
                    // Base Gyroid Glass
                    float g = dot(sin(scaledP), cos(scaledP.yzx)) / PI;
                    float dGlass = abs(g) - 0.12;
                    
                    // Minor voronoi cracking
                    float crack = sin(rotatedP.x*15.) * sin(rotatedP.y*15.) * sin(rotatedP.z*15.);
                    dGlass -= crack * 0.005;

                    return dGlass * 0.35; // Safe step multiplier due to domain warping
                }

                vec3 calcNormal(vec3 p) {
                    vec2 e = vec2(0.002, 0.0);
                    return normalize(vec3(
                        sdScene(p + e.xyy) - sdScene(p - e.xyy),
                        sdScene(p + e.yxy) - sdScene(p - e.yxy),
                        sdScene(p + e.yyx) - sdScene(p - e.yyx)
                    ));
                }

                // Birefringence / Michel-Levy Interference
                vec3 michelLevy(float gamma) {
                    float r = 0.5 + 0.5 * cos(6.28318 * gamma / 650.0);
                    float g = 0.5 + 0.5 * cos(6.28318 * gamma / 510.0 + 0.5);
                    float b = 0.5 + 0.5 * cos(6.28318 * gamma / 440.0 + 1.0);
                    return vec3(r, g, b);
                }

                void main() {
                    vec2 uv = (vUv - 0.5) * 2.0;
                    uv.x *= u_resolution.x / u_resolution.y;

                    // Drifting Camera
                    vec3 ro = vec3(u_time * 0.3, u_time * 0.15, u_time * 0.4);
                    vec3 ww = normalize(vec3(sin(u_time*0.15)*0.4, cos(u_time*0.1)*0.2, 1.0));
                    vec3 uu = normalize(cross(vec3(0,1,0), ww));
                    vec3 vv = cross(ww, uu);
                    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.1 * ww);

                    float t = 0.0;
                    float maxD = 12.0;
                    vec3 p;
                    vec3 glow = vec3(0.0);

                    for (int i = 0; i < 80; i++) {
                        p = ro + rd * t;
                        float d = sdScene(p);

                        // Mycelial Network Volumetrics (Parasitic high-freq gyroid)
                        float mPhase = dot(sin(p * 5.0 + u_time*1.5), cos(p.yzx * 5.0 - u_time));
                        float mDist = abs(mPhase) - 0.18;
                        if (mDist < 0.25) {
                            vec3 mCol = mix(vec3(1.0, 0.0, 0.4), vec3(0.0, 1.0, 0.8), sin(p.y*4.0 + u_time)*0.5+0.5);
                            glow += mCol * exp(-mDist * 22.0) * 0.025;
                        }

                        if (abs(d) < 0.002) break;
                        t += d;
                        if (t > maxD) break;
                    }

                    vec3 color = vec3(0.02, 0.0, 0.05); // Abyssal violet

                    if (t < maxD) {
                        vec3 n = calcNormal(p);
                        vec3 v = -rd;

                        // Chromadepth Mapping
                        float depthNorm = clamp(t / maxD, 0.0, 1.0);
                        vec3 chromaDepth = mix(vec3(1.0, 0.1, 0.2), vec3(0.0, 0.4, 1.0), depthNorm);

                        // Birefringence / Glass Thickness
                        float thickness = pow(1.0 - max(dot(n, v), 0.0), 1.5);
                        float retardance = thickness * 2800.0 + u_time * 300.0;
                        vec3 biref = michelLevy(retardance);

                        // Caustics & Specular
                        vec3 h = normalize(v + normalize(vec3(1.0, 1.5, -0.5)));
                        float spec = pow(max(dot(n, h), 0.0), 64.0);

                        color = mix(chromaDepth, biref, 0.75);
                        color *= (0.4 + 0.6 * max(dot(n, normalize(vec3(1,2,-1))), 0.0));
                        color += spec * vec3(1.0, 0.9, 0.9) * 1.5;
                    }

                    color += glow;
                    color = smoothstep(0.0, 1.2, color); // Tonemap
                    color = pow(color, vec3(0.9)); // Gamma

                    fragColor = vec4(color, 1.0);
                }
            `
        });
        const sceneA = new THREE.Scene();
        sceneA.add(new THREE.Mesh(quadGeo, matRay));

        // --- PASS 2: Datamosh & VHS Analog Artifacts ---
        const matPost = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(w, h) },
                u_scene: { value: null },
                u_prev: { value: null }
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
                uniform sampler2D u_scene;
                uniform sampler2D u_prev;

                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p); vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
                }

                vec2 motionFromLuma(vec2 uv) {
                    float eps = 3.0 / u_resolution.x;
                    float lx1 = dot(texture(u_scene, uv + vec2(eps, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
                    float lx0 = dot(texture(u_scene, uv - vec2(eps, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
                    float ly1 = dot(texture(u_scene, uv + vec2(0.0, eps)).rgb, vec3(0.299, 0.587, 0.114));
                    float ly0 = dot(texture(u_scene, uv - vec2(0.0, eps)).rgb, vec3(0.299, 0.587, 0.114));
                    return vec2(lx1 - lx0, ly1 - ly0);
                }

                void main() {
                    vec2 uv = vUv;

                    // VHS Tracking Error Band
                    float trackY = 0.5 + 0.4 * sin(u_time * 0.6);
                    float trackBand = smoothstep(0.15, 0.0, abs(uv.y - trackY));
                    float trackNoise = (noise(vec2(uv.y * 150.0, u_time * 60.0)) - 0.5) * 0.04 * trackBand;
                    uv.x += trackNoise;

                    // Datamosh Rhythm Trigger
                    float moshCycle = fract(u_time * 0.3);
                    float isMoshing = step(0.75, moshCycle); // Last 25% of cycle is moshed

                    // Macroblock Quantization for Motion Vectors
                    float blockSize = mix(1.0, 24.0, isMoshing) / u_resolution.x;
                    vec2 blockUv = floor(uv / blockSize) * blockSize;
                    
                    // Cross-prediction Bleed
                    vec2 motion = motionFromLuma(blockUv) * 0.04;

                    // Chromatic Aberration (Edge Fringing)
                    float caShift = 0.003 + 0.008 * trackBand;
                    vec4 currentCA = vec4(
                        texture(u_scene, uv + vec2(caShift, 0.0)).r,
                        texture(u_scene, uv).g,
                        texture(u_scene, uv - vec2(caShift, 0.0)).b,
                        1.0
                    );

                    // I-Frame Repeater / Temporal Smear
                    vec4 prev = texture(u_prev, uv - motion * isMoshing);
                    vec4 baseColor = mix(currentCA, prev, isMoshing * 0.94);

                    // Luma Blooming / Saturation Boost
                    float luma = dot(baseColor.rgb, vec3(0.299, 0.587, 0.114));
                    vec3 finalColor = mix(vec3(luma), baseColor.rgb, 1.35);

                    // Scanlines
                    finalColor -= sin(uv.y * u_resolution.y * 3.1415) * 0.04;

                    fragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
                }
            `
        });
        const sceneB = new THREE.Scene();
        sceneB.add(new THREE.Mesh(quadGeo, matPost));

        // --- PASS 3: Copy to Canvas ---
        const matCopy = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: { tDiffuse: { value: null } },
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
                uniform sampler2D tDiffuse;
                void main() {
                    fragColor = texture(tDiffuse, vUv);
                }
            `
        });
        const sceneC = new THREE.Scene();
        sceneC.add(new THREE.Mesh(quadGeo, matCopy));

        canvas.__three = { renderer, sceneTarget, readTarget, writeTarget, camera, sceneA, sceneB, sceneC, matRay, matPost, matCopy };
    }

    const t = canvas.__three;

    if (t.sceneTarget.width !== grid.width || t.sceneTarget.height !== grid.height) {
        t.renderer.setSize(grid.width, grid.height, false);
        t.sceneTarget.setSize(grid.width, grid.height);
        t.readTarget.setSize(grid.width, grid.height);
        t.writeTarget.setSize(grid.width, grid.height);
    }

    // Pass 1: Raymarch -> sceneTarget
    t.matRay.uniforms.u_time.value = time;
    t.matRay.uniforms.u_resolution.value.set(grid.width, grid.height);
    t.renderer.setRenderTarget(t.sceneTarget);
    t.renderer.render(t.sceneA, t.camera);

    // Pass 2: PostProcess (Scene + Prev) -> writeTarget
    t.matPost.uniforms.u_time.value = time;
    t.matPost.uniforms.u_resolution.value.set(grid.width, grid.height);
    t.matPost.uniforms.u_scene.value = t.sceneTarget.texture;
    t.matPost.uniforms.u_prev.value = t.readTarget.texture;
    t.renderer.setRenderTarget(t.writeTarget);
    t.renderer.render(t.sceneB, t.camera);

    // Pass 3: writeTarget -> Canvas
    t.matCopy.uniforms.tDiffuse.value = t.writeTarget.texture;
    t.renderer.setRenderTarget(null);
    t.renderer.render(t.sceneC, t.camera);

    // Swap Ping-Pong Buffers
    const temp = t.readTarget;
    t.readTarget = t.writeTarget;
    t.writeTarget = temp;

} catch (e) {
    console.error("Feral Rendering Engine Fault:", e);
}