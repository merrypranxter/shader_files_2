if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Ping-pong FBOs for Temporal Datamoshing & Persistence
        const rtOpts = {
            type: THREE.HalfFloatType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat
        };
        const rtMain = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);

        const sceneMain = new THREE.Scene();
        const scenePost = new THREE.Scene();
        const sceneCopy = new THREE.Scene();

        const quadGeom = new THREE.PlaneGeometry(2, 2);

        // PASS 1: The Cathedral (Raymarched Gyroid + WFC Tiles + Mycelium)
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
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform float u_time;
                uniform vec2 u_resolution;

                mat2 rot(float a) { float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
                float hash13(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
                vec3 hash33(vec3 p) {
                    return fract(sin(vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)))) * 43758.5453);
                }

                vec2 map(vec3 p) {
                    vec3 pG = p;
                    pG.xy *= rot(u_time * 0.1);
                    pG.yz *= rot(u_time * 0.07);

                    // Gyroid Lattice
                    float dG = abs(dot(sin(pG * 2.0), cos(pG.zxy * 2.0))) / 2.0 - 0.05;

                    // Mycelium Network (Intersecting cylindrical grid)
                    vec3 pM = p * 3.0;
                    pM.xy *= rot(u_time * 0.15);
                    pM += sin(pM.zxy * 2.0 + u_time) * 0.2; // organic crawl
                    vec3 q = fract(pM) - 0.5;
                    float dM = min(min(length(q.xy), length(q.yz)), length(q.zx)) - 0.04;
                    dM /= 3.0;

                    // Let mycelium colonize the gyroid
                    if (dM < dG) return vec2(dM, 1.0);
                    return vec2(dG, 0.0);
                }

                vec3 calcNormal(vec3 p) {
                    vec2 e = vec2(0.005, 0.0);
                    return normalize(vec3(
                        map(p + e.xyy).x - map(p - e.xyy).x,
                        map(p + e.yxy).x - map(p - e.yxy).x,
                        map(p + e.yyx).x - map(p - e.yyx).x
                    ));
                }

                void main() {
                    vec2 uv = (vUv - 0.5) * vec2(u_resolution.x/u_resolution.y, 1.0);
                    vec3 ro = vec3(0.0, 0.0, u_time * 1.2);
                    vec3 rd = normalize(vec3(uv, 1.0));
                    rd.xy *= rot(u_time * 0.1);
                    rd.xz *= rot(sin(u_time * 0.2) * 0.2);

                    float t = 0.0;
                    float mat = 0.0;
                    vec3 p;
                    for(int i=0; i<90; i++) {
                        p = ro + rd * t;
                        vec2 res = map(p);
                        if(res.x < 0.002) { mat = res.y; break; }
                        t += res.x * 0.8;
                        if(t > 15.0) break;
                    }

                    vec3 col = vec3(0.02, 0.0, 0.05); // Void contrast

                    if(t < 15.0) {
                        vec3 n = calcNormal(p);
                        vec3 v = -rd;

                        if(mat > 0.5) {
                            // MYCELIUM: Candy-acid neon, pulsing and crawling
                            float crawl = fract(p.z * 2.0 + p.x * 1.0 - u_time * 3.0 + hash13(floor(p*5.0))*2.0);
                            vec3 base = 0.5 + 0.5 * cos(6.28318 * (p.z * 0.2 + vec3(0.8, 0.1, 0.5))); // Pink/Cyan/Lime
                            col = base * 3.0 * step(0.3, crawl);
                            col += vec3(0.2, 0.8, 1.0) * pow(1.0 - max(dot(n, v), 0.0), 3.0); // Rim light
                        } else {
                            // GYROID LATTICE: WFC Stained Glass Logic
                            // Quantize space to create "tiles" that dictate glass properties
                            vec3 cellId = floor(p * 1.5);
                            float flip = floor(u_time * 1.0 + hash13(cellId) * 10.0);
                            vec3 cellHash = hash33(cellId + flip);

                            // Facet the normals based on the WFC cell
                            n = normalize(n + (cellHash - 0.5) * 0.4);

                            float interference = max(dot(n, v), 0.0);
                            
                            // Birefringence / Thin-film interference
                            vec3 irid = 0.5 + 0.5 * cos(6.28318 * (interference * 4.0 + cellHash.x * 2.0 + vec3(0.0, 0.33, 0.67)));

                            // Chromadepth: Warm near, Cool far
                            vec3 depthCol = 0.5 + 0.5 * cos(6.28318 * (t * 0.05 + vec3(0.0, 0.2, 0.4)));

                            col = irid * depthCol * 2.0;

                            // Specular highlight
                            vec3 ref = reflect(-v, n);
                            col += pow(max(dot(ref, normalize(vec3(1.0, 1.0, -1.0))), 0.0), 32.0) * vec3(1.0, 0.9, 0.8) * 2.0;

                            // Stained glass lead (dark cell borders)
                            vec3 pFract = fract(p * 1.5);
                            float edge = min(min(pFract.x, 1.0-pFract.x), min(pFract.y, 1.0-pFract.y));
                            edge = min(edge, min(pFract.z, 1.0-pFract.z));
                            col *= smoothstep(0.0, 0.05, edge);
                        }
                    }

                    // Deep fog
                    col = mix(col, vec3(0.02, 0.0, 0.05), smoothstep(0.0, 15.0, t));

                    fragColor = vec4(col, 1.0);
                }
            `
        });
        sceneMain.add(new THREE.Mesh(quadGeom, matMain));

        // PASS 2: Datamosh, VHS, Chromatic Aberration & Feedback
        const matPost = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_tNew: { value: null },
                u_tOld: { value: null }
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
                uniform sampler2D u_tNew;
                uniform sampler2D u_tOld;
                uniform float u_time;
                uniform vec2 u_resolution;

                float hash21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
                vec2 hash22(vec2 p) { return fract(sin(vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)))) * 43758.5453); }

                void main() {
                    vec2 uv = vUv;

                    // Barrel distortion
                    vec2 c = uv - 0.5;
                    float r2 = dot(c, c);
                    vec2 uvD = uv + c * (0.1 * r2 + 0.05 * r2 * r2);
                    if(uvD.x < 0.0 || uvD.x > 1.0 || uvD.y < 0.0 || uvD.y > 1.0) {
                        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
                        return;
                    }

                    // Datamosh logic
                    vec2 block = floor(uvD * 30.0) / 30.0;
                    float moshHash = hash21(block + floor(u_time * 3.0));
                    float isMosh = step(0.92, moshHash); // ~8% chance to freeze/smear a block

                    vec2 mv = (hash22(block) - 0.5) * 0.04;
                    vec2 uvMosh = uvD - mv * isMosh;

                    // Read previous frame for datamosh & trails
                    vec3 moshCol = texture(u_tOld, uvMosh).rgb;

                    // Chromatic Aberration & Edge Tear on new frame
                    float tear = step(0.95, hash21(vec2(u_time, floor(uvD.y * 50.0)))) * 0.02 * sin(u_time * 20.0);
                    vec2 offset = vec2(0.005 + tear, 0.0);
                    vec3 baseCol;
                    baseCol.r = texture(u_tNew, uvD + offset).r;
                    baseCol.g = texture(u_tNew, uvD).g;
                    baseCol.b = texture(u_tNew, uvD - offset).b;

                    // Apply datamosh override
                    vec3 finalCol = mix(baseCol, moshCol, isMosh * 0.95);

                    // Afterglow / Feedback persistence
                    finalCol = max(finalCol, moshCol * 0.85);

                    // VHS Rolling Bar
                    float bar = exp(-pow(fract(uv.y * 1.2 - u_time * 0.5) - 0.5, 2.0) * 80.0);
                    finalCol += vec3(bar * 0.1);

                    // Scanlines
                    finalCol *= 0.9 + 0.1 * sin(uv.y * u_resolution.y * 2.0);

                    // Vignette
                    finalCol *= 1.0 - 0.5 * r2;

                    fragColor = vec4(finalCol, 1.0);
                }
            `
        });
        scenePost.add(new THREE.Mesh(quadGeom, matPost));

        // PASS 3: Copy to Canvas
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
                uniform sampler2D tDiffuse;
                out vec4 fragColor;
                void main() {
                    fragColor = texture(tDiffuse, vUv);
                }
            `
        });
        sceneCopy.add(new THREE.Mesh(quadGeom, matCopy));

        canvas.__three = {
            renderer, camera,
            rtMain, rtA, rtB,
            sceneMain, scenePost, sceneCopy,
            matMain, matPost, matCopy
        };
    } catch (e) {
        console.error("Feral WebGL init failed:", e);
        return;
    }
}

const t = canvas.__three;
if (!t) return;

// Dynamic Resizing
const currentSize = t.renderer.getSize(new THREE.Vector2());
if (currentSize.width !== grid.width || currentSize.height !== grid.height) {
    t.renderer.setSize(grid.width, grid.height, false);
    t.rtMain.setSize(grid.width, grid.height);
    t.rtA.setSize(grid.width, grid.height);
    t.rtB.setSize(grid.width, grid.height);
    t.matMain.uniforms.u_resolution.value.set(grid.width, grid.height);
    t.matPost.uniforms.u_resolution.value.set(grid.width, grid.height);
}

// Time update
t.matMain.uniforms.u_time.value = time;
t.matPost.uniforms.u_time.value = time;

// 1. Render Cathedral to rtMain
t.renderer.setRenderTarget(t.rtMain);
t.renderer.render(t.sceneMain, t.camera);

// 2. Render Datamosh/VHS to rtB (reading rtMain and rtA)
t.matPost.uniforms.u_tNew.value = t.rtMain.texture;
t.matPost.uniforms.u_tOld.value = t.rtA.texture;
t.renderer.setRenderTarget(t.rtB);
t.renderer.render(t.scenePost, t.camera);

// 3. Copy final output to screen
t.matCopy.uniforms.tDiffuse.value = t.rtB.texture;
t.renderer.setRenderTarget(null);
t.renderer.render(t.sceneCopy, t.camera);

// 4. Ping-Pong Buffer Swap
const temp = t.rtA;
t.rtA = t.rtB;
t.rtB = temp;