try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const rtOpts = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            depthBuffer: false,
            stencilBuffer: false
        };

        const simA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const simB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const renderFBO = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);

        // PASS 1: Cellular Automata "Mind" (Lenia-lite + Fluid Advection)
        const simMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_prev: { value: null },
                u_res: { value: new THREE.Vector2(grid.width, grid.height) },
                u_time: { value: 0 }
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
                uniform sampler2D u_prev;
                uniform vec2 u_res;
                uniform float u_time;

                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                }

                void main() {
                    vec2 p = 1.0 / u_res;
                    vec4 C = texture(u_prev, vUv);

                    // 9-tap average for continuous cellular automata
                    vec4 sum = vec4(0.0);
                    for(int i=-1; i<=1; i++) {
                        for(int j=-1; j<=1; j++) {
                            sum += texture(u_prev, vUv + vec2(i,j)*p);
                        }
                    }
                    vec4 avg = sum / 9.0;

                    // Activation rule (Dream Logic)
                    float state = C.r;
                    float n = avg.r;
                    if(n > 0.15 && n < 0.35) state += 0.08;
                    else if(n > 0.55) state -= 0.08;

                    // Fluid velocity from gradient of state
                    float dx = texture(u_prev, vUv + vec2(p.x, 0.0)).r - texture(u_prev, vUv - vec2(p.x, 0.0)).r;
                    float dy = texture(u_prev, vUv + vec2(0.0, p.y)).r - texture(u_prev, vUv - vec2(0.0, p.y)).r;
                    vec2 vel = C.zw;
                    vel = mix(vel, vec2(dx, dy) * 4.0, 0.1);

                    // Advection (Memory smear)
                    vec2 advUv = vUv - vel * p * 4.0;
                    float advState = texture(u_prev, advUv).r;
                    state = mix(state, advState, 0.85);

                    // Wandering Dream Seeds (Attractors)
                    vec2 center1 = vec2(0.5) + vec2(sin(u_time*0.4), cos(u_time*0.3)) * 0.35;
                    vec2 center2 = vec2(0.5) + vec2(cos(u_time*0.5), sin(u_time*0.6)) * 0.35;
                    if(length(vUv - center1) < 0.04) state = 1.0;
                    if(length(vUv - center2) < 0.04) state = 1.0;
                    
                    // Initial noise kickstart
                    if(u_time < 0.1) state = hash(vUv * 10.0);

                    state *= 0.985; // Entropy decay

                    fragColor = vec4(clamp(state, 0.0, 1.0), C.g, vel);
                }
            `
        });

        // PASS 2: Dream Architecture & Structural Color (SDF Raymarching)
        const renderMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_sim: { value: null },
                u_res: { value: new THREE.Vector2(grid.width, grid.height) },
                u_time: { value: 0 }
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
                uniform sampler2D u_sim;
                uniform vec2 u_res;
                uniform float u_time;

                mat2 rot(float a) { float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

                float sdBox(vec3 p, vec3 b) {
                    vec3 q = abs(p) - b;
                    return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
                }

                float sdTorus(vec3 p, vec2 t) {
                    vec2 q = vec2(length(p.xz)-t.x, p.y);
                    return length(q)-t.y;
                }

                vec2 map(vec3 p) {
                    vec3 q = p;
                    
                    // Impossible Space: Non-Euclidean folding
                    q.xy = mod(q.xy + 4.0, 8.0) - 4.0;

                    // Op-Art Ripples
                    q.z += sin(length(q.xy) * 8.0 - u_time * 3.0) * 0.15;

                    // Early Internet Browser Panels (Floating shards)
                    float dPanel1 = sdBox(q - vec3(1.5, 1.5, 0.0), vec3(1.2, 0.8, 0.05));
                    dPanel1 = max(dPanel1, -sdBox(q - vec3(1.5, 1.5, 0.0), vec3(1.1, 0.7, 0.2))); 
                    float dPanel2 = sdBox(q - vec3(-2.0, -1.0, 1.0), vec3(0.9, 0.5, 0.05));

                    // Central Prismatic Oracle
                    float dOracle1 = sdTorus(p, vec2(2.2, 0.1));
                    float dOracle2 = sdTorus(p, vec2(1.7, 0.15 + 0.05*sin(u_time*5.0)));
                    float dOracle3 = length(p) - 0.9; // Core sphere

                    float d = min(min(dPanel1, dPanel2), min(min(dOracle1, dOracle2), dOracle3));
                    
                    float id = 0.0;
                    if(d == dOracle1 || d == dOracle2) id = 1.0;
                    else if(d == dOracle3) id = 2.0;
                    else id = 3.0;

                    return vec2(d, id);
                }

                vec3 calcNormal(vec3 p) {
                    vec2 e = vec2(0.01, 0.0);
                    return normalize(vec3(
                        map(p+e.xyy).x - map(p-e.xyy).x,
                        map(p+e.yxy).x - map(p-e.yxy).x,
                        map(p+e.yyx).x - map(p-e.yyx).x
                    ));
                }

                vec3 palette(float t) {
                    // Hyperpop saturated palette (Pink, Teal, Acid Yellow)
                    vec3 a = vec3(0.6, 0.3, 0.6);
                    vec3 b = vec3(0.4, 0.4, 0.4);
                    vec3 c = vec3(1.0, 1.0, 1.0);
                    vec3 d = vec3(0.0, 0.15, 0.4);
                    return a + b * cos(6.28318 * (c * t + d));
                }

                void main() {
                    vec2 p = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);
                    vec4 sim = texture(u_sim, vUv);

                    vec3 ro = vec3(0.0, 0.0, -6.0);
                    vec3 rd = normalize(vec3(p, 1.2));

                    // Cellular Automata warps the camera rays (Dream Physics)
                    rd.xy *= rot(sim.r * 0.4);
                    ro.z += sim.g * 0.5;
                    ro.xy *= rot(sin(u_time * 0.1) * 0.2);

                    float t = 0.0;
                    vec2 res;
                    for(int i=0; i<70; i++) {
                        res = map(ro + rd * t);
                        if(res.x < 0.002 || t > 25.0) break;
                        t += res.x * 0.75; // Safe stepping for warped space
                    }

                    // Base Saturated Void (Deep Indigo)
                    vec3 col = vec3(0.15, 0.0, 0.35); 

                    if(t < 25.0) {
                        vec3 pos = ro + rd * t;
                        vec3 n = calcNormal(pos);
                        vec3 v = -rd;
                        float fresnel = max(0.0, dot(n, v));

                        // Structural Color (Thin-film interference Bragg reflection)
                        float thickness = 300.0 + sim.r * 600.0 + res.y * 150.0;
                        float pathDiff = 2.0 * 1.5 * thickness * fresnel;
                        vec3 interference = 0.5 + 0.5 * cos(6.283 * pathDiff / vec3(600.0, 500.0, 400.0));

                        // Base material color
                        vec3 base = palette(res.y * 0.2 + u_time * 0.15 + pos.z * 0.1);

                        col = mix(base, interference, 0.65);

                        // CA Emissive Logic Bloom
                        col += palette(sim.r + 0.5) * sim.r * 1.8;
                    } else {
                        // Background Op-Art Moiré Field
                        float moire = sin(rd.x * 120.0) * sin(rd.y * 120.0);
                        col = mix(col, vec3(0.8, 0.1, 0.5), moire * 0.25);
                    }

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        // PASS 3: VHS + Risograph + Datamosh + Cross-Process
        const postMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tDiffuse: { value: null },
                u_sim: { value: null },
                u_res: { value: new THREE.Vector2(grid.width, grid.height) },
                u_time: { value: 0 }
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
                uniform sampler2D tDiffuse;
                uniform sampler2D u_sim;
                uniform vec2 u_res;
                uniform float u_time;

                mat2 rot(float a) { float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
                float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }

                void main() {
                    vec4 sim = texture(u_sim, vUv);

                    // 1. Datamosh Displacement (Memory smear)
                    vec2 motion = sim.zw;
                    vec2 moshedUv = vUv + motion * 0.04;

                    // 2. VHS Tracking Tear & Head Switching
                    float tear = step(0.96, sin(vUv.y * 12.0 + u_time * 6.0));
                    moshedUv.x += tear * (hash(vec2(u_time, vUv.y)) - 0.5) * 0.06;
                    float headSwitch = step(0.96, vUv.y) * hash(vUv + u_time);
                    moshedUv.x += headSwitch * 0.03;

                    // 3. Chromatic Aberration & Bleed
                    float caSpread = 0.006 + sim.r * 0.015;
                    vec3 colR = texture(tDiffuse, moshedUv + vec2(caSpread, 0.0)).rgb;
                    vec3 colG = texture(tDiffuse, moshedUv).rgb;
                    vec3 colB = texture(tDiffuse, moshedUv - vec2(caSpread, 0.0)).rgb;
                    vec3 col = vec3(colR.r, colG.g, colB.b);

                    // 4. Cross-Processing (Tone-Dependent Chemistry)
                    float lum = dot(col, vec3(0.299, 0.587, 0.114));
                    vec3 shadowCol = vec3(0.15, 0.0, 0.4); // Deep Plum / Indigo
                    vec3 midCol = vec3(1.0, 0.1, 0.5);     // Hot Pink
                    vec3 highCol = vec3(0.8, 1.0, 0.0);    // Acid Yellow

                    vec3 crossProc = mix(shadowCol, midCol, smoothstep(0.0, 0.5, lum));
                    crossProc = mix(crossProc, highCol, smoothstep(0.5, 1.0, lum));
                    
                    // Blend original with cross-processed chemistry
                    col = mix(col, crossProc, 0.6);

                    // 5. Risograph Halftone Logic & Misregistration
                    // Fluo Pink Ink
                    vec2 htUv1 = (moshedUv + vec2(0.003, -0.002)) * u_res * 0.4;
                    float ht1 = length(fract(htUv1 * rot(0.785)) - 0.5);
                    float ink1 = step(ht1, col.r * 0.8);

                    // Neon Cyan Ink
                    vec2 htUv2 = (moshedUv - vec2(0.004, 0.003)) * u_res * 0.4;
                    float ht2 = length(fract(htUv2 * rot(1.3)) - 0.5);
                    float ink2 = step(ht2, col.b * 0.8);

                    // Acid Yellow Ink
                    vec2 htUv3 = moshedUv * u_res * 0.4;
                    float ht3 = length(fract(htUv3 * rot(0.2)) - 0.5);
                    float ink3 = step(ht3, col.g * 0.8);

                    // Multiply Blend Riso Inks over base color
                    vec3 risoColor = vec3(1.0);
                    risoColor *= mix(vec3(1.0), vec3(1.0, 0.1, 0.6), ink1); // Pink
                    risoColor *= mix(vec3(1.0), vec3(0.0, 0.9, 1.0), ink2); // Cyan
                    risoColor *= mix(vec3(1.0), vec3(0.9, 1.0, 0.0), ink3); // Yellow

                    col = mix(col, col * risoColor * 1.8, 0.5);

                    // 6. VHS Dropout / Damage Noise (Colored!)
                    float dropout = step(0.992, hash(vUv * vec2(1.0, 80.0) + u_time));
                    col = mix(col, vec3(0.0, 1.0, 0.8), dropout); // Dropout is Neon Cyan

                    // 7. Absolute Color Rules Enforcement: Clamp away black and white
                    vec3 darkBound = vec3(0.08, 0.0, 0.2); // Saturated dark
                    vec3 lightBound = vec3(1.0, 0.95, 0.7); // Tinted bright
                    col = clamp(col, darkBound, lightBound);

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        scene.add(quad);

        canvas.__three = { renderer, scene, camera, quad, simMat, renderMat, postMat, simA, simB, renderFBO };
    }

    const { renderer, scene, camera, quad, simMat, renderMat, postMat, renderFBO } = canvas.__three;
    let { simA, simB } = canvas.__three;

    // Handle Resize
    renderer.setSize(grid.width, grid.height, false);
    const res = new THREE.Vector2(grid.width, grid.height);
    
    if (simMat.uniforms.u_res.value.x !== grid.width || simMat.uniforms.u_res.value.y !== grid.height) {
        simA.setSize(grid.width, grid.height);
        simB.setSize(grid.width, grid.height);
        renderFBO.setSize(grid.width, grid.height);
        simMat.uniforms.u_res.value.copy(res);
        renderMat.uniforms.u_res.value.copy(res);
        postMat.uniforms.u_res.value.copy(res);
    }

    // Step 1: Simulate CA into simB reading from simA
    quad.material = simMat;
    simMat.uniforms.u_time.value = time;
    simMat.uniforms.u_prev.value = simA.texture;
    renderer.setRenderTarget(simB);
    renderer.render(scene, camera);

    // Swap A and B
    canvas.__three.simA = simB;
    canvas.__three.simB = simA;
    simA = canvas.__three.simA; // Update local ref

    // Step 2: Render 3D Dream Architecture into renderFBO
    quad.material = renderMat;
    renderMat.uniforms.u_time.value = time;
    renderMat.uniforms.u_sim.value = simA.texture;
    renderer.setRenderTarget(renderFBO);
    renderer.render(scene, camera);

    // Step 3: Post-Process (VHS, Riso, Datamosh, Cross-Process) to Screen
    quad.material = postMat;
    postMat.uniforms.u_time.value = time;
    postMat.uniforms.u_sim.value = simA.texture;
    postMat.uniforms.tDiffuse.value = renderFBO.texture;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

} catch (e) {
    console.error("Prismatic Tape Oracle Initialization Failed:", e);
}