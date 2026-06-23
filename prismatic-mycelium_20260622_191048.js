try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;
        renderer.setPixelRatio(1.0);

        const rtMain = new THREE.WebGLRenderTarget(grid.width, grid.height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType
        });
        const rtAccum0 = new THREE.WebGLRenderTarget(grid.width, grid.height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType
        });
        const rtAccum1 = new THREE.WebGLRenderTarget(grid.width, grid.height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType
        });

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const scene = new THREE.Scene();
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        scene.add(quad);

        const mainMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_aspect: { value: grid.width / grid.height }
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
                uniform float u_aspect;

                mat2 rot(float a) {
                    float s = sin(a), c = cos(a);
                    return mat2(c, -s, s, c);
                }

                float hash(vec3 p) {
                    p = fract(p * vec3(127.1, 311.7, 74.7));
                    p += dot(p, p.yxz + 19.19);
                    return fract(p.x * p.y * p.z);
                }

                float fbm(vec3 p) {
                    float f = 0.0;
                    f += 0.5000 * hash(p); p *= 2.02;
                    f += 0.2500 * hash(p); p *= 2.03;
                    f += 0.1250 * hash(p);
                    return f;
                }

                vec2 map(vec3 p) {
                    vec3 cell = floor(p * 1.5);
                    vec3 q = fract(p * 1.5) - 0.5;
                    
                    // Wave Function Collapse - Fake State Mutation
                    float state = hash(cell + floor(u_time * 0.2));
                    
                    if (state > 0.5) q.xy = vec2(-q.y, q.x);
                    if (fract(state * 13.7) > 0.5) q.yz = vec2(-q.z, q.y);
                    if (fract(state * 29.3) > 0.5) q.zx = vec2(-q.x, q.z);

                    // Gyroid Lattice
                    float g = dot(sin(p * 3.0 + u_time * 0.4), cos(p.zxy * 3.0 - u_time * 0.2)) / 3.0;
                    float glass = abs(g) - 0.08;

                    // Mycelial Network through the WFC cells
                    float myc = length(q.xy) - 0.015;
                    myc = min(myc, length(q.yz) - 0.015);
                    myc = min(myc, length(q.zx) - 0.015);
                    
                    // Nodes
                    myc = min(myc, length(q) - 0.04);
                    
                    // Fungal Pulsing & Crawling
                    myc -= 0.008 * sin(p.x * 25.0 - u_time * 6.0) * cos(p.y * 25.0 + u_time * 4.0);

                    // Break the glass with the fungus
                    glass = max(glass, -myc - 0.02);

                    if (myc < glass) return vec2(myc, 1.0);
                    return vec2(glass, 0.0);
                }

                vec3 calcNormal(vec3 p) {
                    vec2 e = vec2(0.002, 0.0);
                    return normalize(vec3(
                        map(p + e.xyy).x - map(p - e.xyy).x,
                        map(p + e.yxy).x - map(p - e.yxy).x,
                        map(p + e.yyx).x - map(p - e.yyx).x
                    ));
                }

                void main() {
                    vec2 p = vUv * 2.0 - 1.0;
                    p.x *= u_aspect;

                    vec3 ro = vec3(u_time * 0.2, u_time * 0.15, u_time * 0.4);
                    vec3 rd = normalize(vec3(p, 1.0));
                    rd.xy *= rot(u_time * 0.1);
                    rd.xz *= rot(u_time * 0.15);

                    float t = 0.0;
                    float mat = 0.0;
                    float glow = 0.0;
                    float mycoGlow = 0.0;

                    for (int i = 0; i < 90; i++) {
                        vec2 res = map(ro + rd * t);
                        if (res.x < 0.001) {
                            mat = res.y;
                            break;
                        }
                        t += res.x * 0.65;
                        if (t > 12.0) break;
                        
                        if (res.y == 1.0) {
                            mycoGlow += 0.01 / (1.0 + abs(res.x) * 40.0);
                        } else {
                            glow += 0.003 / (1.0 + abs(res.x) * 25.0);
                        }
                    }

                    vec3 col = vec3(0.0);

                    if (t < 12.0) {
                        vec3 pos = ro + rd * t;
                        vec3 n = calcNormal(pos);
                        vec3 v = -rd;

                        if (mat == 0.0) {
                            // Birefringence Glass
                            float thickness = t * 0.15 + glow * 1.5;
                            float delta_n = 0.04 + 0.02 * fbm(pos * 5.0);
                            float gamma = thickness * delta_n * 4000.0;
                            
                            // Michel-Levy Interference Colors (Acid Palette)
                            vec3 interference = 0.5 + 0.5 * cos(6.28318 * (gamma * vec3(0.001, 0.0012, 0.0015) + vec3(0.0, 0.33, 0.67)));
                            interference = pow(interference, vec3(1.8));

                            // Chromadepth
                            vec3 chroma = mix(vec3(1.0, 0.0, 0.4), vec3(0.0, 0.8, 1.0), clamp(t / 8.0, 0.0, 1.0));
                            
                            float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.0);
                            col = mix(interference, chroma, 0.4) * (0.3 + 0.7 * fresnel);
                            
                            // Caustic Highlights
                            col += vec3(1.0) * pow(max(dot(reflect(-v, n), normalize(vec3(1.0, 1.0, -1.0))), 0.0), 64.0);
                        } else {
                            // Mycelial Network
                            vec3 cell = floor(pos * 1.5);
                            float state = hash(cell);
                            vec3 mycoBase = 0.5 + 0.5 * cos(6.28318 * (state + vec3(0.0, 0.33, 0.67)));
                            mycoBase = max(mycoBase, vec3(0.2)); 
                            
                            float pulse = 0.5 + 0.5 * sin(pos.z * 15.0 - u_time * 12.0);
                            col = mycoBase * (1.5 + pulse * 2.5);
                        }
                    }

                    // Volumetric Fog & Glow
                    col += vec3(1.0, 0.0, 0.6) * glow * 0.8;
                    col += vec3(0.0, 1.0, 0.8) * mycoGlow * 1.2;
                    col = mix(col, vec3(0.05, 0.0, 0.1), 1.0 - exp(-0.04 * t * t));

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        const postMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                tDiffuse: { value: null },
                tPrev: { value: null }
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
                uniform sampler2D tDiffuse;
                uniform sampler2D tPrev;

                float hash2(vec2 p) {
                    vec3 p3  = fract(vec3(p.xyx) * .1031);
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.x + p3.y) * p3.z);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    vec2 u = f*f*(3.0-2.0*f);
                    return mix(mix(hash2(i + vec2(0.0,0.0)), hash2(i + vec2(1.0,0.0)), u.x),
                               mix(hash2(i + vec2(0.0,1.0)), hash2(i + vec2(1.0,1.0)), u.x), u.y);
                }

                void main() {
                    // Macroblock Grid for Datamosh
                    vec2 block = floor(vUv * vec2(48.0, 27.0)) / vec2(48.0, 27.0);
                    
                    // Motion Vector Field
                    float nAngle = noise(block * 8.0 + u_time * 0.3) * 6.28318;
                    vec2 mv = vec2(cos(nAngle), sin(nAngle)) * 0.015;

                    // Periodic Datamosh Burst (I-Frame drop simulation)
                    float burst = pow(sin(u_time * 1.5), 12.0); 
                    mv *= burst;

                    // VHS Tape Wobble
                    float wobble = noise(vec2(vUv.y * 15.0, u_time * 8.0)) * 0.003;
                    wobble += (hash2(vec2(vUv.y * 100.0, u_time)) - 0.5) * 0.002;
                    vec2 distortedUv = vUv + vec2(wobble, 0.0);

                    // Sample Previous and Current
                    vec2 prevUv = clamp(distortedUv - mv, 0.0, 1.0);
                    vec3 prev = texture(tPrev, prevUv).rgb;
                    vec3 curr = texture(tDiffuse, distortedUv).rgb;

                    // I-Frame injection logic
                    float diff = distance(curr, prev);
                    float isIFrame = step(mod(u_time, 2.0), 0.1); 
                    float update = clamp(isIFrame + step(0.4, diff), 0.0, 1.0);

                    // Moshed Base
                    vec3 moshCol = mix(prev, curr, update);

                    // Chromatic Aberration & Raw VHS
                    float caShift = 0.004 * (1.0 + sin(u_time * 5.0 + vUv.y * 15.0));
                    vec3 rawVhs;
                    rawVhs.r = texture(tDiffuse, clamp(distortedUv + vec2(caShift, 0.0), 0.0, 1.0)).r;
                    rawVhs.g = texture(tDiffuse, distortedUv).g;
                    rawVhs.b = texture(tDiffuse, clamp(distortedUv - vec2(caShift, 0.0), 0.0, 1.0)).b;

                    // Blend Raw VHS and Moshed Glitch based on temporal burst
                    float moshAmount = smoothstep(0.0, 1.0, noise(vec2(u_time * 0.5, 0.0)));
                    vec3 finalCol = mix(rawVhs, moshCol, moshAmount * 0.85);

                    // Scanlines
                    finalCol *= 0.95 + 0.05 * sin(vUv.y * u_resolution.y * 2.5);

                    // Vignette
                    float vig = length(vUv - 0.5);
                    finalCol *= smoothstep(0.8, 0.2, vig);

                    // Candy Acid Contrast
                    finalCol = pow(finalCol, vec3(0.9));
                    finalCol *= 1.1;

                    fragColor = vec4(finalCol, 1.0);
                }
            `
        });

        const copyMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: { tMap: { value: null } },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                in vec2 vUv;
                uniform sampler2D tMap;
                out vec4 fragColor;
                void main() {
                    fragColor = texture(tMap, vUv);
                }
            `
        });

        canvas.__three = { 
            renderer, scene, camera, quad, mainMat, postMat, copyMat, 
            rtMain, rtAccum0, rtAccum1, pingpong: 0 
        };
    }

    const { 
        renderer, scene, camera, quad, mainMat, postMat, copyMat, 
        rtMain, rtAccum0, rtAccum1 
    } = canvas.__three;

    const currentSize = renderer.getSize(new THREE.Vector2());
    if (currentSize.width !== grid.width || currentSize.height !== grid.height) {
        renderer.setSize(grid.width, grid.height, false);
        rtMain.setSize(grid.width, grid.height);
        rtAccum0.setSize(grid.width, grid.height);
        rtAccum1.setSize(grid.width, grid.height);
        mainMat.uniforms.u_aspect.value = grid.width / grid.height;
        postMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    }

    mainMat.uniforms.u_time.value = time;
    postMat.uniforms.u_time.value = time;

    // 1. Render 3D Scene
    quad.material = mainMat;
    renderer.setRenderTarget(rtMain);
    renderer.render(scene, camera);

    // 2. Ping-Pong Post Processing (Datamosh / VHS)
    const readRT = canvas.__three.pingpong % 2 === 0 ? rtAccum0 : rtAccum1;
    const writeRT = canvas.__three.pingpong % 2 === 0 ? rtAccum1 : rtAccum0;

    quad.material = postMat;
    postMat.uniforms.tDiffuse.value = rtMain.texture;
    postMat.uniforms.tPrev.value = readRT.texture;
    renderer.setRenderTarget(writeRT);
    renderer.render(scene, camera);

    // 3. Render to Screen
    quad.material = copyMat;
    copyMat.uniforms.tMap.value = writeRT.texture;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    canvas.__three.pingpong++;

} catch (e) {
    console.error("WebGL Initialization or Render Failed:", e);
}