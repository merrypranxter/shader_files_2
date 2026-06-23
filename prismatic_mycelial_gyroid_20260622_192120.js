if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        renderer.setPixelRatio(1.0);
        
        const rt = new THREE.WebGLRenderTarget(grid.width, grid.height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat
        });
        
        const sceneMain = new THREE.Scene();
        const cameraMain = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        const matMain = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: { 
                u_time: { value: 0 }, 
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) } 
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform float u_time;
                uniform vec2 u_resolution;

                vec3 hash33(vec3 p) {
                    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
                             dot(p, vec3(269.5, 183.3, 246.1)),
                             dot(p, vec3(113.5, 271.9, 124.6)));
                    return fract(sin(p) * 43758.5453123);
                }

                float hash13(vec3 p) {
                    p = fract(p * vec3(127.1, 311.7, 74.7));
                    p += dot(p, p.yzx + 33.33);
                    return fract(p.x * p.y);
                }

                float voronoi_edges(vec3 p) {
                    vec3 n = floor(p);
                    vec3 f = fract(p);
                    float d1 = 8.0, d2 = 8.0;
                    for(int k=-1; k<=1; k++) {
                        for(int j=-1; j<=1; j++) {
                            for(int i=-1; i<=1; i++) {
                                vec3 g = vec3(float(i), float(j), float(k));
                                vec3 o = hash33(n + g);
                                o = 0.5 + 0.5 * sin(u_time * 2.0 + 6.2831 * o);
                                vec3 r = g + o - f;
                                float d = dot(r, r);
                                if(d < d1) { d2 = d1; d1 = d; }
                                else if(d < d2) { d2 = d; }
                            }
                        }
                    }
                    return sqrt(d2) - sqrt(d1);
                }

                vec2 map(vec3 p) {
                    vec3 cell = floor(p);
                    vec3 local = fract(p) - 0.5;
                    float rnd = hash13(cell);
                    
                    // Glass Gyroid panels (WFC modular shards)
                    float g = dot(sin(p * 2.0), cos(p.zxy * 2.0)) * 0.5;
                    float thickness = 0.03 + 0.06 * sin(u_time * 1.5 + rnd * 10.0);
                    float glass = abs(g) - thickness;
                    
                    vec3 dBox = abs(local) - 0.42; // Panel gaps
                    float gap = max(dBox.x, max(dBox.y, dBox.z));
                    glass = max(glass, gap);
                    
                    // Mycelium network growing through the glass
                    float v = voronoi_edges(p * 1.5);
                    float myc = v - 0.08 + 0.04 * sin(u_time * 5.0 + p.y * 5.0);
                    myc /= 1.5;
                    
                    if (glass < myc) return vec2(glass, 1.0);
                    return vec2(myc, 2.0);
                }

                vec3 calcNormal(vec3 p) {
                    vec2 e = vec2(0.005, 0.0);
                    return normalize(vec3(
                        map(p + e.xyy).x - map(p - e.xyy).x,
                        map(p + e.yxy).x - map(p - e.yxy).x,
                        map(p + e.yyx).x - map(p - e.yyx).x
                    ));
                }

                vec3 hsv2rgb(vec3 c) {
                    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
                }

                mat2 rot(float a) {
                    float s = sin(a), c = cos(a);
                    return mat2(c, -s, s, c);
                }

                void main() {
                    vec2 uv = vUv * 2.0 - 1.0;
                    uv.x *= u_resolution.x / u_resolution.y;
                    
                    vec3 ro = vec3(u_time * 0.5, u_time * 0.3, u_time * 0.5);
                    vec3 rd = normalize(vec3(uv, 1.0));
                    
                    rd.xy *= rot(sin(u_time * 0.2) * 0.4);
                    rd.xz *= rot(u_time * 0.15);
                    
                    float t = 0.0;
                    float max_t = 15.0;
                    vec2 res = vec2(0.0);
                    
                    for(int i=0; i<100; i++) {
                        vec3 p = ro + rd * t;
                        res = map(p);
                        if(res.x < 0.001 || t > max_t) break;
                        t += res.x * 0.6; 
                    }
                    
                    vec3 col = vec3(0.01, 0.0, 0.03); 
                    
                    if(t < max_t) {
                        vec3 p = ro + rd * t;
                        vec3 n = calcNormal(p);
                        
                        if(res.y == 1.0) {
                            // Glass: Michel-Levy Birefringence
                            float rnd = hash13(floor(p));
                            float retardance = abs(dot(n, rd)) * 5.0 + u_time * 0.5 + rnd * 2.0;
                            vec3 biref = 0.5 + 0.5 * cos(6.28318 * (retardance * vec3(1.0, 1.2, 1.4) + vec3(0.0, 0.33, 0.67)));
                            
                            // Chromadepth shading
                            float depthHue = mix(0.0, 0.66, clamp(t / max_t, 0.0, 1.0));
                            vec3 chroma = hsv2rgb(vec3(depthHue, 0.9, 1.0));
                            
                            float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
                            col = mix(biref, chroma, 0.4) * (0.2 + 0.8 * fresnel);
                            
                            // Sharp caustic highlights
                            vec3 l1 = normalize(vec3(1.0, 2.0, -1.0));
                            col += pow(max(dot(n, l1), 0.0), 32.0) * vec3(1.0, 0.2, 0.8) * 1.5;
                            vec3 l2 = normalize(vec3(-2.0, -1.0, 2.0));
                            col += pow(max(dot(n, l2), 0.0), 32.0) * vec3(0.0, 1.0, 0.5) * 1.5;
                        } else {
                            // Mycelium: Bioluminescent neon acid
                            vec3 baseCol = hsv2rgb(vec3(fract(p.x * 0.1 + p.z * 0.1 + u_time * 0.2), 0.9, 1.0));
                            col = baseCol * 2.0;
                            col *= 1.0 + 0.6 * sin(u_time * 12.0 - length(p) * 8.0);
                            
                            float rim = 1.0 - max(dot(n, -rd), 0.0);
                            col += vec3(0.9, 1.0, 0.1) * pow(rim, 3.0) * 1.5;
                        }
                    }
                    
                    // Abyssal fog integration
                    col = mix(col, vec3(0.01, 0.0, 0.03), smoothstep(0.0, max_t, t));
                    
                    fragColor = vec4(col, 1.0);
                }
            `
        });
        sceneMain.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matMain));
        
        const scenePost = new THREE.Scene();
        const matPost = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: { 
                u_time: { value: 0 }, 
                tDiffuse: { value: rt.texture }, 
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) } 
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform sampler2D tDiffuse;

                float hash12(vec2 p) {
                    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                }

                vec2 hash22(vec2 p) {
                    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.xx + p3.yz) * p3.zy);
                }

                void main() {
                    vec2 uv = vUv;
                    
                    // 1. Datamosh Block Smear
                    float moshtime = floor(u_time * 8.0);
                    vec2 block = floor(uv * 20.0);
                    float moshRand = hash12(block + moshtime);
                    
                    if(moshRand > 0.88) {
                        vec2 moshDir = (hash22(block) - 0.5) * 0.1;
                        uv += moshDir * sin(u_time * 20.0);
                    }
                    
                    // 2. VHS Wobble & Tracking
                    float trackingY = 0.5 + 0.3 * sin(u_time * 0.4);
                    float trackBand = smoothstep(0.1, 0.0, abs(uv.y - trackingY));
                    float wobble = sin(uv.y * 40.0 + u_time * 30.0) * 0.005;
                    uv.x += wobble * trackBand;
                    uv.x += sin(uv.y * 150.0 - u_time * 15.0) * 0.001; 
                    
                    // 3. Chromatic Aberration
                    float shift = 0.006 + 0.015 * trackBand;
                    vec2 dir = normalize(uv - 0.5);
                    
                    float r = texture(tDiffuse, uv + dir * shift).r;
                    float g = texture(tDiffuse, uv).g;
                    float b = texture(tDiffuse, uv - dir * shift).b;
                    
                    vec3 col = vec3(r, g, b);
                    
                    // 4. VHS Tape Grain
                    float noise = (hash12(uv * u_resolution + u_time) - 0.5) * 0.08;
                    col += noise;
                    
                    // 5. CRT Scanlines
                    col *= 0.95 + 0.05 * sin(uv.y * u_resolution.y * 1.5);
                    
                    // 6. Vignette
                    float vig = length(vUv - 0.5);
                    col *= smoothstep(0.8, 0.3, vig);
                    
                    // 7. Saturation Overdrive
                    col = pow(col, vec3(0.8));
                    col *= 1.2;
                    
                    fragColor = vec4(col, 1.0);
                }
            `
        });
        scenePost.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matPost));
        
        canvas.__three = { renderer, sceneMain, matMain, rt, scenePost, matPost, cameraMain };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        return;
    }
}

const { renderer, sceneMain, matMain, rt, scenePost, matPost, cameraMain } = canvas.__three;

if (matMain && matMain.uniforms && matMain.uniforms.u_time) {
    matMain.uniforms.u_time.value = time;
    matMain.uniforms.u_resolution.value.set(grid.width, grid.height);
}

if (matPost && matPost.uniforms && matPost.uniforms.u_time) {
    matPost.uniforms.u_time.value = time;
    matPost.uniforms.u_resolution.value.set(grid.width, grid.height);
}

if (rt.width !== grid.width || rt.height !== grid.height) {
    rt.setSize(grid.width, grid.height);
}

renderer.setSize(grid.width, grid.height, false);

// Pass 1: Draw the Gyroid Glass and Mycelium scene into the FBO
renderer.setRenderTarget(rt);
renderer.render(sceneMain, cameraMain);

// Pass 2: Process the FBO with VHS and Datamosh corruption directly to the canvas
renderer.setRenderTarget(null);
renderer.render(scenePost, cameraMain);