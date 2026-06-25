if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;
        renderer.setPixelRatio(1);

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // FBO Setup
        const fboOpts = {
            type: THREE.HalfFloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            depthBuffer: false,
            stencilBuffer: false
        };

        const flowA = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOpts);
        const flowB = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOpts);
        const mainTarget = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOpts);
        const fbA = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOpts);
        const fbB = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOpts);

        // Common GLSL functions
        const glslHelpers = `
            #define PI 3.14159265359
            vec2 hash22(vec2 p) {
                p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
                return fract(sin(p) * 43758.5453123);
            }
            float hash21(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }
            vec2 cdiv(vec2 a, vec2 b) {
                float d = dot(b,b) + 1e-6;
                return vec2(dot(a,b), a.y*b.x - a.x*b.y) / d;
            }
            vec2 cpow(vec2 z, float n) {
                float r = length(z);
                float th = atan(z.y, z.x);
                return pow(r, n) * vec2(cos(n * th), sin(n * th));
            }
        `;

        // 1. Flow Shader (Schlieren + Advection)
        const flowMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_tPrev: { value: null },
                u_time: { value: 0 },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
                u_mouseDelta: { value: new THREE.Vector2(0, 0) },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            vertexShader: `
                out vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_tPrev;
                uniform float u_time;
                uniform vec2 u_mouse;
                uniform vec2 u_mouseDelta;
                uniform vec2 u_resolution;

                void main() {
                    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
                    vec2 uv = vUv;
                    
                    // Curl noise
                    float t = u_time * 0.3;
                    vec2 curl = vec2(
                        sin(uv.y * 8.0 + t) + cos(uv.x * 4.0 - t),
                        cos(uv.x * 9.0 + t) - sin(uv.y * 6.0 + t)
                    ) * 0.0015;

                    // Mouse interaction
                    vec2 mDist = (uv - u_mouse) * aspect;
                    float mInf = exp(-dot(mDist, mDist) * 300.0);
                    vec2 mForce = u_mouseDelta * mInf * 0.1;

                    vec2 totalVel = curl + mForce;
                    
                    // Advect
                    vec4 advected = texture(u_tPrev, uv - totalVel);
                    
                    // Decay and add pressure/density
                    advected *= 0.98; 
                    advected.z += mInf * length(u_mouseDelta) * 5.0; // pressure
                    advected.xy = mix(advected.xy, totalVel, 0.1);   // velocity memory

                    fragColor = vec4(advected.xyz, 1.0);
                }
            `
        });

        // 2. Main Snakeskin Shader
        const mainMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_tFlow: { value: null },
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_state1: { value: new THREE.Vector3(0, 0, 0) }, // pal, domain, metric
                u_state2: { value: new THREE.Vector3(0, 0, 0) }  // scale, rainbow, afterimage
            },
            vertexShader: `
                out vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_tFlow;
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform vec3 u_state1;
                uniform vec3 u_state2;

                ${glslHelpers}

                vec3 getPalette(float t, int regime) {
                    vec3 a, b, c, d;
                    if (regime == 0) { // Candy Plasma
                        a = vec3(0.5); b = vec3(0.5); c = vec3(1.0); d = vec3(0.0, 0.33, 0.67);
                    } else if (regime == 1) { // Tropical Prism
                        a = vec3(0.6, 0.5, 0.5); b = vec3(0.4, 0.5, 0.5); c = vec3(1.0); d = vec3(0.0, 0.1, 0.2);
                    } else if (regime == 2) { // UV Lagoon
                        a = vec3(0.3, 0.6, 0.7); b = vec3(0.3, 0.4, 0.3); c = vec3(1.0); d = vec3(0.4, 0.6, 0.8);
                    } else { // Acid Interference
                        a = vec3(0.7, 0.8, 0.4); b = vec3(0.3, 0.2, 0.6); c = vec3(1.0); d = vec3(0.1, 0.5, 0.9);
                    }
                    return a + b * cos(6.28318 * (c * t + d));
                }

                void main() {
                    vec4 flow = texture(u_tFlow, vUv);
                    vec2 uv = vUv;
                    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
                    
                    // Warp UV with flow
                    uv += flow.xy * 8.0;

                    // Scale Lattice setup
                    float sFam = u_state2.x;
                    float density = mix(12.0, mix(25.0, 45.0, sFam - 1.0), min(sFam, 1.0));
                    vec2 suv = uv * aspect * density;
                    
                    // Anisotropy based on flow direction to align scales
                    vec2 flowDir = normalize(flow.xy + vec2(0.001));
                    mat2 rot = mat2(flowDir.x, -flowDir.y, flowDir.y, flowDir.x);
                    suv = rot * suv;
                    suv.y *= 1.5; // Stretch scales longitudinally

                    // Voronoi with Imbrication (overlap)
                    vec2 g = floor(suv);
                    vec2 f = fract(suv);
                    vec2 best_p;
                    float best_d = 100.0;
                    vec2 best_id;

                    for(int y=-1; y<=1; y++) {
                        for(int x=-1; x<=1; x++) {
                            vec2 lattice = vec2(x,y);
                            vec2 offset = hash22(g + lattice);
                            // Imbrication shift: push cells downwards so top overlaps bottom
                            offset.y += 0.4;
                            vec2 p = lattice + offset - f;
                            float d = dot(p, p);
                            if(d < best_d) {
                                best_d = d;
                                best_p = p;
                                best_id = g + lattice;
                            }
                        }
                    }

                    // Second pass for edge distance
                    float edge_d = 100.0;
                    for(int y=-2; y<=2; y++) {
                        for(int x=-2; x<=2; x++) {
                            vec2 lattice = vec2(x,y);
                            vec2 offset = hash22(g + lattice);
                            offset.y += 0.4;
                            vec2 p = lattice + offset - f;
                            if(dot(p - best_p, p - best_p) > 0.0001) {
                                float d = dot(0.5*(best_p + p), normalize(p - best_p));
                                edge_d = min(edge_d, d);
                            }
                        }
                    }

                    // Keel Normal & Shading
                    float t_edge = 1.0 - smoothstep(0.0, 0.4, edge_d);
                    float kx = sin(best_p.x * 6.28) * t_edge;
                    float ky = cos(best_p.y * 6.28) * t_edge;
                    vec3 N = normalize(vec3(kx, ky, 1.2));
                    vec3 V = vec3(0.0, 0.0, 1.0);
                    vec3 L = normalize(vec3(0.3, 0.7, 0.8));
                    float spec = pow(max(dot(N, normalize(L + V)), 0.0), 24.0);

                    // Domain Coloring inside scale
                    vec2 z = best_p * 2.0;
                    float phase = 0.0;
                    float mag = length(z);
                    int dom = int(u_state1.y);
                    if (dom == 0) {
                        vec2 w = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y);
                        phase = atan(w.y, w.x);
                    } else if (dom == 1) {
                        vec2 w = cdiv(z - vec2(0.1), z + vec2(0.1));
                        phase = atan(w.y, w.x);
                    } else {
                        phase = z.y * 4.0;
                    }

                    // False Color Metric
                    float metric = 0.0;
                    int fcm = int(u_state1.z);
                    if (fcm == 0) metric = edge_d * 2.0;
                    else if (fcm == 1) metric = mag * 1.5;
                    else metric = flow.z * 0.2;

                    // Palette & Hue Shift
                    int palRegime = int(u_state1.x);
                    float hue_shift = hash21(best_id) * 0.15 + phase * 0.08 + u_time * 0.15 + metric;
                    vec3 baseCol = getPalette(hue_shift, palRegime);

                    // Birefringence / Diffraction (Holographic Foil)
                    float r_int = mix(0.3, 1.5, u_state2.y / 2.0);
                    float gamma = 300.0 + edge_d * 2500.0 * r_int + hash21(best_id)*1500.0;
                    vec3 interference = 0.5 + 0.5 * sin(gamma / vec3(680.0, 530.0, 430.0) * 6.28);
                    
                    // High-freq diffraction on grazing angles
                    float grazing = 1.0 - max(dot(N, V), 0.0);
                    vec3 diffraction = 0.5 + 0.5 * cos(grazing * 50.0 * r_int + vec3(0, 2, 4));

                    // Combine
                    vec3 col = baseCol;
                    col = mix(col, col * interference * 2.0, 0.5 * r_int);
                    col += diffraction * pow(grazing, 3.0) * r_int;
                    col += spec * getPalette(hue_shift + 0.5, palRegime) * 1.5; // Colored specular

                    // Imbrication Shadow (Depth)
                    col *= smoothstep(0.0, 0.25, edge_d) * 0.8 + 0.2;

                    // Deep Crease Colors (No Black)
                    vec3 deepCol;
                    if (palRegime == 0) deepCol = vec3(0.2, 0.0, 0.3); // Wine
                    else if (palRegime == 1) deepCol = vec3(0.3, 0.0, 0.1); // Deep Red
                    else if (palRegime == 2) deepCol = vec3(0.0, 0.1, 0.3); // Indigo
                    else deepCol = vec3(0.0, 0.2, 0.1); // Deep Teal
                    
                    col = mix(deepCol, col, smoothstep(0.0, 0.12, edge_d));

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        // 3. Feedback / Afterimage Shader
        const fbMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_tMain: { value: null },
                u_tPrev: { value: null },
                u_persist: { value: 0 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_tMain;
                uniform sampler2D u_tPrev;
                uniform float u_persist;

                void main() {
                    vec3 mainCol = texture(u_tMain, vUv).rgb;
                    vec3 prevCol = texture(u_tPrev, vUv).rgb;

                    // Complementary afterimage decay
                    float decay = mix(0.75, 0.96, u_persist / 2.0);
                    vec3 complement = max(vec3(1.0) - prevCol, vec3(0.0));
                    
                    // Add a tiny bit of complement to the trail to create a ghost effect
                    vec3 trail = mix(prevCol, complement, 0.03) * decay;
                    
                    // Max blend keeps the brightest glowing parts
                    vec3 blended = max(mainCol, trail);

                    fragColor = vec4(blended, 1.0);
                }
            `
        });

        // 4. Post Shader (Chromostereopsis + CA + Bloom)
        const postMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_tIn: { value: null },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            vertexShader: `
                out vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_tIn;
                uniform vec2 u_resolution;

                void main() {
                    vec2 uv = vUv;
                    vec2 dir = uv - 0.5;
                    float dist = length(dir);

                    vec3 base = texture(u_tIn, uv).rgb;
                    
                    // Chromostereopsis CA: Shift red/blue based on luminance (depth proxy)
                    float luma = dot(base, vec3(0.299, 0.587, 0.114));
                    float ca_amt = 0.008 * luma + 0.003 * dist;

                    float r = texture(u_tIn, uv + dir * ca_amt).r;
                    float g = base.g;
                    float b = texture(u_tIn, uv - dir * ca_amt).b;

                    vec3 col = vec3(r, g, b);

                    // Cheap Bloom
                    vec2 off = 1.5 / u_resolution;
                    vec3 bloom = texture(u_tIn, uv + vec2(off.x, off.y)).rgb +
                                 texture(u_tIn, uv + vec2(-off.x, off.y)).rgb +
                                 texture(u_tIn, uv + vec2(off.x, -off.y)).rgb +
                                 texture(u_tIn, uv + vec2(-off.x, -off.y)).rgb;
                    bloom *= 0.25;
                    col += max(bloom - 0.6, 0.0) * 1.2;

                    // Vignette
                    col *= 1.0 - 0.3 * dist * dist;

                    // ACES Tonemap
                    const float a = 2.51, bb = 0.03, c = 2.43, d = 0.59, e = 0.14;
                    col = clamp((col * (a * col + bb)) / (col * (c * col + d) + e), 0.0, 1.0);

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), flowMat);
        scene.add(quad);

        // State Tracking
        canvas.__state = {
            pal: 0, dom: 0, metric: 0, scale: 0, rainbow: 1, persist: 1,
            pMouse: new THREE.Vector2(0.5, 0.5)
        };

        const handleKey = (e) => {
            const s = canvas.__state;
            if (e.key.toLowerCase() === 'c') s.pal = (s.pal + 1) % 4;
            if (e.key.toLowerCase() === 'd') s.dom = (s.dom + 1) % 3;
            if (e.key.toLowerCase() === 'f') s.metric = (s.metric + 1) % 3;
            if (e.key.toLowerCase() === 's') s.scale = (s.scale + 1) % 3;
            if (e.key.toLowerCase() === 'r') s.rainbow = (s.rainbow + 1) % 3;
            if (e.key.toLowerCase() === 'a') s.persist = (s.persist + 1) % 3;
        };

        if (canvas.__listener) window.removeEventListener('keydown', canvas.__listener);
        canvas.__listener = handleKey;
        window.addEventListener('keydown', handleKey);

        canvas.__three = { 
            renderer, scene, camera, quad, 
            flowA, flowB, mainTarget, fbA, fbB, 
            flowMat, mainMat, fbMat, postMat 
        };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        throw e;
    }
}

const { renderer, scene, camera, quad, flowA, flowB, mainTarget, fbA, fbB, flowMat, mainMat, fbMat, postMat } = canvas.__three;
const state = canvas.__state;

// Mouse Logic
let mX = mouse.x / grid.width;
let mY = 1.0 - mouse.y / grid.height;
let curMouse = new THREE.Vector2(mX, mY);
let mDelta = new THREE.Vector2().subVectors(curMouse, state.pMouse);
state.pMouse.copy(curMouse);

renderer.setSize(grid.width, grid.height, false);

// 1. Flow Pass
quad.material = flowMat;
flowMat.uniforms.u_time.value = time;
flowMat.uniforms.u_mouse.value.copy(curMouse);
flowMat.uniforms.u_mouseDelta.value.copy(mDelta);
flowMat.uniforms.u_tPrev.value = flowA.texture;
renderer.setRenderTarget(flowB);
renderer.render(scene, camera);

// 2. Main Pass
quad.material = mainMat;
mainMat.uniforms.u_time.value = time;
mainMat.uniforms.u_tFlow.value = flowB.texture;
mainMat.uniforms.u_state1.value.set(state.pal, state.dom, state.metric);
mainMat.uniforms.u_state2.value.set(state.scale, state.rainbow, state.persist);
renderer.setRenderTarget(mainTarget);
renderer.render(scene, camera);

// 3. Feedback / Afterimage Pass
quad.material = fbMat;
fbMat.uniforms.u_tMain.value = mainTarget.texture;
fbMat.uniforms.u_tPrev.value = fbA.texture;
fbMat.uniforms.u_persist.value = state.persist;
renderer.setRenderTarget(fbB);
renderer.render(scene, camera);

// 4. Post Pass
quad.material = postMat;
postMat.uniforms.u_tIn.value = fbB.texture;
renderer.setRenderTarget(null); // Screen
renderer.render(scene, camera);

// Ping-pong Swaps
let tempFlow = canvas.__three.flowA;
canvas.__three.flowA = canvas.__three.flowB;
canvas.__three.flowB = tempFlow;

let tempFb = canvas.__three.fbA;
canvas.__three.fbA = canvas.__three.fbB;
canvas.__three.fbB = tempFb;