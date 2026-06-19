if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.setPixelRatio(1);
        
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneGeometry(2, 2);
        
        // 1. Cellular Automata (Dream Intelligence)
        const caMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_state: { value: null },
                u_res: { value: new THREE.Vector2(256, 256) },
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
                uniform sampler2D u_state;
                uniform vec2 u_res;
                uniform float u_time;
                
                float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
                
                void main() {
                    vec2 pixel = 1.0 / u_res;
                    vec4 c = texture(u_state, vUv);
                    vec4 n = texture(u_state, vUv + vec2(0.0, pixel.y));
                    vec4 s = texture(u_state, vUv - vec2(0.0, pixel.y));
                    vec4 e = texture(u_state, vUv + vec2(pixel.x, 0.0));
                    vec4 w = texture(u_state, vUv - vec2(pixel.x, 0.0));
                    
                    vec4 lap = n + s + e + w - 4.0 * c;
                    
                    // Reaction-diffusion with spatially varying rules
                    float feed = 0.035 + 0.015 * sin(vUv.x * 20.0 + u_time * 0.5);
                    float kill = 0.060 + 0.010 * cos(vUv.y * 20.0 - u_time * 0.4);
                    
                    float a = c.r;
                    float b = c.g;
                    float abb = a * b * b;
                    
                    float da = 1.0;
                    float db = 0.5;
                    
                    float nextA = a + (da * lap.r - abb + feed * (1.0 - a));
                    float nextB = b + (db * lap.g + abb - (feed + kill) * b);
                    
                    // Spontaneous "dream physics" memory injection
                    if(hash(vUv + u_time) > 0.9995) {
                        nextB = 0.9;
                    }
                    
                    fragColor = vec4(clamp(nextA, 0.0, 1.0), clamp(nextB, 0.0, 1.0), 0.0, 1.0);
                }
            `
        });
        const caScene = new THREE.Scene();
        caScene.add(new THREE.Mesh(geometry, caMat));
        
        // 2. Main Scene (Dream-Physics Architecture & Op-Art)
        const sceneMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_ca: { value: null },
                u_time: { value: 0 },
                u_res: { value: new THREE.Vector2(grid.width, grid.height) }
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
                uniform sampler2D u_ca;
                uniform float u_time;
                uniform vec2 u_res;
                
                mat2 rot(float a) {
                    float s = sin(a), c = cos(a);
                    return mat2(c, -s, s, c);
                }
                
                float sdBox(vec3 p, vec3 b) {
                    vec3 q = abs(p) - b;
                    return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
                }
                
                // Early-internet browser panel abstraction
                float sdBrowser(vec3 p, vec2 size) {
                    float d = sdBox(p, vec3(size, 0.05));
                    float header = sdBox(p - vec3(0.0, size.y - 0.1, 0.02), vec3(size.x, 0.1, 0.06));
                    return min(d, header);
                }
                
                // Central Op-Art Oracle
                float sdOracle(vec3 p) {
                    vec3 q = p;
                    q.xy *= rot(q.z * 0.5 + u_time);
                    float d = length(vec2(length(q.xy) - 2.0, q.z)) - 0.2;
                    float pupil = length(p) - 0.5;
                    return min(d, pupil);
                }
                
                float map(vec3 p, out int mat) {
                    mat = 0;
                    vec3 op = p;
                    
                    // Impossible space folding
                    p.xy *= rot(p.z * 0.05 * sin(u_time * 0.2));
                    
                    float oracle = sdOracle(p - vec3(0.0, 0.0, 5.0));
                    
                    // Vibrating radial tunnel
                    float tunnel = 4.0 - length(p.xy) + sin(p.z * 4.0 - u_time * 5.0) * 0.15;
                    
                    // Floating interface shards
                    vec3 bp = op;
                    bp.z = mod(bp.z + u_time * 3.0, 15.0) - 7.5;
                    bp.xy *= rot(bp.z * 0.2);
                    bp.x = abs(bp.x) - 2.5;
                    float panels = sdBrowser(bp, vec2(0.8, 0.6));
                    
                    float d = tunnel;
                    mat = 0;
                    
                    if(oracle < d) { d = oracle; mat = 1; }
                    if(panels < d) { d = panels; mat = 2; }
                    
                    return d;
                }
                
                vec3 calcNormal(vec3 p, int mat) {
                    vec2 e = vec2(0.01, 0.0);
                    int dummy;
                    return normalize(vec3(
                        map(p + e.xyy, dummy) - map(p - e.xyy, dummy),
                        map(p + e.yxy, dummy) - map(p - e.yxy, dummy),
                        map(p + e.yyx, dummy) - map(p - e.yyx, dummy)
                    ));
                }
                
                void main() {
                    vec2 uv = (vUv - 0.5) * 2.0;
                    uv.x *= u_res.x / u_res.y;
                    
                    vec3 ro = vec3(0.0, 0.0, -3.0);
                    vec3 rd = normalize(vec3(uv, 1.0));
                    
                    float t = 0.0;
                    int mat = 0;
                    vec3 p;
                    for(int i=0; i<80; i++) {
                        p = ro + rd * t;
                        float d = map(p, mat);
                        if(d < 0.005) break;
                        t += d * 0.7;
                        if(t > 30.0) break;
                    }
                    
                    // Deep saturated dream-space background
                    vec3 bg = mix(vec3(0.17, 0.0, 0.34), vec3(0.0, 0.3, 0.3), rd.y * 0.5 + 0.5);
                    bg = mix(bg, vec3(1.0, 0.0, 0.46), sin(rd.x * 10.0 + u_time) * 0.2 + 0.2);
                    
                    if(t > 29.0) {
                        fragColor = vec4(bg, 1.0);
                        return;
                    }
                    
                    vec3 n = calcNormal(p, mat);
                    vec3 v = -rd;
                    float ndotv = max(dot(n, v), 0.0);
                    
                    // CA Intelligence mapping
                    vec2 caUV = p.xy * 0.1 + p.z * 0.05;
                    vec4 ca = texture(u_ca, fract(caUV));
                    
                    // Structural Color / Thin-film interference
                    float thickness = 400.0 + 300.0 * ca.g + 100.0 * sin(p.z + u_time);
                    float pathDiff = 2.0 * 1.5 * thickness * sqrt(1.0 - pow(sin(acos(ndotv))/1.5, 2.0));
                    vec3 phase = vec3(0.0, 0.33, 0.67);
                    vec3 irid = 0.5 + 0.5 * cos(6.28318 * (pathDiff / vec3(450.0, 550.0, 650.0) + phase));
                    
                    vec3 baseCol;
                    if (mat == 0) {
                        baseCol = mix(vec3(0.0, 0.3, 0.3), vec3(1.0, 0.0, 0.46), fract(length(p.xy) * 5.0 - u_time * 2.0));
                    } else if (mat == 1) {
                        baseCol = mix(vec3(0.83, 1.0, 0.0), vec3(0.66, 0.0, 1.0), ca.r);
                    } else {
                        baseCol = mix(vec3(0.0, 1.0, 1.0), vec3(1.0, 0.33, 0.33), ca.g);
                    }
                    
                    vec3 finalCol = baseCol * irid;
                    float fog = exp(-t * 0.08);
                    finalCol = mix(bg, finalCol, fog);
                    
                    fragColor = vec4(finalCol, 1.0);
                }
            `
        });
        const sceneScene = new THREE.Scene();
        sceneScene.add(new THREE.Mesh(geometry, sceneMat));
        
        // 3. Post Pass (Datamosh, VHS, Risograph, Cross-Processing)
        const postMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_scene: { value: null },
                u_prev: { value: null },
                u_ca: { value: null },
                u_time: { value: 0 },
                u_res: { value: new THREE.Vector2(grid.width, grid.height) }
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
                uniform sampler2D u_scene;
                uniform sampler2D u_prev;
                uniform sampler2D u_ca;
                uniform float u_time;
                uniform vec2 u_res;
                
                // Color system: Saturated Shadows
                vec3 getDark(float t) {
                    vec3 colors[7] = vec3[](
                        vec3(0.17, 0.0, 0.34), // indigo
                        vec3(0.29, 0.0, 0.20), // plum
                        vec3(0.0, 0.20, 0.30), // petrol blue
                        vec3(0.20, 0.0, 0.40), // deep violet
                        vec3(0.30, 0.0, 0.10), // burgundy
                        vec3(0.0, 0.30, 0.30), // deep teal
                        vec3(0.0, 0.30, 0.20)  // peacock green
                    );
                    float idx = t * 6.0;
                    int i = int(idx);
                    float f = fract(idx);
                    return mix(colors[i], colors[min(i+1, 6)], f);
                }

                // Color system: Colored Light
                vec3 getBright(float t) {
                    vec3 colors[9] = vec3[](
                        vec3(0.83, 1.0, 0.0),  // acid yellow
                        vec3(1.0, 0.33, 0.33), // fluorescent coral
                        vec3(0.0, 1.0, 1.0),   // neon cyan
                        vec3(1.0, 0.0, 0.46),  // hot pink
                        vec3(0.0, 0.33, 1.0),  // electric blue
                        vec3(0.53, 1.0, 0.0),  // chartreuse
                        vec3(1.0, 0.66, 0.0),  // mango
                        vec3(0.66, 0.0, 1.0),  // ultraviolet lavender
                        vec3(1.0, 0.40, 0.0)   // orange
                    );
                    float idx = t * 8.0;
                    int i = int(idx);
                    float f = fract(idx);
                    return mix(colors[i], colors[min(i+1, 8)], f);
                }
                
                // Risograph Halftone
                float halftone(vec2 uv, float lpi, float angle) {
                    float c = cos(angle), s = sin(angle);
                    vec2 rot_uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
                    vec2 cell = fract(rot_uv * lpi) - 0.5;
                    return length(cell);
                }
                
                void main() {
                    vec2 uv = vUv;
                    
                    // VHS Tracking Error
                    float tracking = step(0.98, sin(uv.y * 12.0 - u_time * 4.0));
                    vec2 tc_uv = uv;
                    tc_uv.x += tracking * 0.05 * sin(u_time * 50.0);
                    
                    // Datamosh: Motion vectors from CA
                    vec4 ca = texture(u_ca, fract(uv + u_time * 0.05));
                    vec2 motion = (ca.rg - 0.5) * 0.02;
                    
                    vec3 scene = texture(u_scene, tc_uv).rgb;
                    vec3 prev = texture(u_prev, fract(tc_uv - motion)).rgb;
                    
                    // Codec I-frame prediction failure
                    vec2 blockUV = floor(tc_uv * 40.0) / 40.0;
                    float blockNoise = fract(sin(dot(blockUV, vec2(12.9898, 78.233))) * 43758.5453);
                    float iframe = step(0.92, blockNoise * sin(u_time * 2.0));
                    
                    vec3 blended = mix(scene, prev, iframe * 0.85);
                    
                    // VHS Chroma Bleed
                    vec3 bleed = texture(u_scene, tc_uv - vec2(0.015, 0.0)).rgb;
                    blended.r = mix(blended.r, bleed.r, 0.6);
                    blended.b = mix(blended.b, bleed.b, 0.6);
                    
                    // Risograph Separation & Misregistration
                    float htR = step(halftone(tc_uv, 90.0, 0.26), blended.r);
                    float htG = step(halftone(tc_uv, 90.0, 1.3), blended.g);
                    float htB = step(halftone(tc_uv, 90.0, 0.0), blended.b);
                    
                    vec3 ink1 = vec3(1.0, 0.0, 0.46); // Hot pink
                    vec3 ink2 = vec3(0.83, 1.0, 0.0); // Acid yellow
                    vec3 ink3 = vec3(0.0, 1.0, 1.0);  // Neon cyan
                    
                    vec3 riso = vec3(0.17, 0.0, 0.34); // Indigo paper base
                    riso = mix(riso, ink1, htR * 0.7);
                    riso = mix(riso, ink2, htG * 0.7);
                    riso = mix(riso, ink3, htB * 0.7);
                    
                    vec3 finalCol = mix(blended, riso, 0.3);
                    
                    // Cross-Processing Chemistry & Absolute Color Mapping
                    float luma = dot(finalCol, vec3(0.299, 0.587, 0.114));
                    luma = clamp(luma, 0.1, 0.9); // No pure black/white
                    
                    float darkT = fract(uv.x * 0.3 + uv.y * 0.7 + u_time * 0.05);
                    float brightT = fract(uv.x * -0.5 + uv.y * 0.5 - u_time * 0.08);
                    
                    vec3 targetDark = getDark(darkT);
                    vec3 targetBright = getBright(brightT);
                    
                    vec3 mappedCol = mix(targetDark, targetBright, smoothstep(0.2, 0.8, luma));
                    finalCol = mix(finalCol, mappedCol, 0.7);
                    
                    // VHS Head switching noise at bottom
                    if (uv.y < 0.05) {
                        float hsn = fract(sin(dot(uv + u_time, vec2(12.9898, 78.233))) * 43758.5453);
                        finalCol = mix(finalCol, getBright(hsn), 0.5);
                    }
                    
                    // Physical Damage: Colored dropouts
                    float dropout = step(0.995, fract(sin(dot(uv * u_time, vec2(12.9898, 78.233))) * 43758.5453));
                    finalCol = mix(finalCol, vec3(0.0, 1.0, 1.0), dropout); // Cyan sparks
                    
                    // Final bounds to strictly enforce no black/white
                    finalCol = clamp(finalCol, 0.05, 0.95);
                    
                    fragColor = vec4(finalCol, 1.0);
                }
            `
        });
        const postScene = new THREE.Scene();
        postScene.add(new THREE.Mesh(geometry, postMat));
        
        // Final Output Pass
        const outputMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: { u_tex: { value: null } },
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
                uniform sampler2D u_tex;
                void main() {
                    fragColor = texture(u_tex, vUv);
                }
            `
        });
        const outputScene = new THREE.Scene();
        outputScene.add(new THREE.Mesh(geometry, outputMat));
        
        // FBOs
        const type = THREE.HalfFloatType;
        const opts = { type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
        
        const caFBO1 = new THREE.WebGLRenderTarget(256, 256, opts);
        const caFBO2 = new THREE.WebGLRenderTarget(256, 256, opts);
        const sceneFBO = new THREE.WebGLRenderTarget(grid.width, grid.height, opts);
        const postFBO1 = new THREE.WebGLRenderTarget(grid.width, grid.height, opts);
        const postFBO2 = new THREE.WebGLRenderTarget(grid.width, grid.height, opts);
        
        // Initial Seed Pass for CA
        const seedMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
            fragmentShader: `
                in vec2 vUv; out vec4 fragColor;
                float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
                void main() {
                    fragColor = vec4(hash(vUv), hash(vUv + 1.0), 0.0, 1.0);
                }
            `
        });
        const seedScene = new THREE.Scene();
        seedScene.add(new THREE.Mesh(geometry, seedMat));
        renderer.setRenderTarget(caFBO1);
        renderer.render(seedScene, camera);
        
        canvas.__three = { 
            renderer, camera, 
            caScene, caMat, caFBO1, caFBO2,
            sceneScene, sceneMat, sceneFBO, 
            postScene, postMat, postFBO1, postFBO2,
            outputScene, outputMat,
            pingCA: 0, pingPost: 0 
        };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        return;
    }
}

const sys = canvas.__three;
sys.renderer.setSize(grid.width, grid.height, false);

// 1. Cellular Automata Evolution
const curCA = sys.pingCA === 0 ? sys.caFBO1 : sys.caFBO2;
const nextCA = sys.pingCA === 0 ? sys.caFBO2 : sys.caFBO1;
sys.caMat.uniforms.u_state.value = curCA.texture;
sys.caMat.uniforms.u_time.value = time;
sys.renderer.setRenderTarget(nextCA);
sys.renderer.render(sys.caScene, sys.camera);
sys.pingCA = 1 - sys.pingCA;

// 2. Dream-Physics Scene Render
sys.sceneMat.uniforms.u_ca.value = nextCA.texture;
sys.sceneMat.uniforms.u_time.value = time;
sys.sceneMat.uniforms.u_res.value.set(grid.width, grid.height);
sys.renderer.setRenderTarget(sys.sceneFBO);
sys.renderer.render(sys.sceneScene, sys.camera);

// 3. Post-Processing (Datamosh, VHS, Riso, Chemistry)
const curPost = sys.pingPost === 0 ? sys.postFBO1 : sys.postFBO2;
const nextPost = sys.pingPost === 0 ? sys.postFBO2 : sys.postFBO1;
sys.postMat.uniforms.u_scene.value = sys.sceneFBO.texture;
sys.postMat.uniforms.u_prev.value = curPost.texture;
sys.postMat.uniforms.u_ca.value = nextCA.texture;
sys.postMat.uniforms.u_time.value = time;
sys.postMat.uniforms.u_res.value.set(grid.width, grid.height);
sys.renderer.setRenderTarget(nextPost);
sys.renderer.render(sys.postScene, sys.camera);
sys.pingPost = 1 - sys.pingPost;

// 4. Output to Screen
sys.outputMat.uniforms.u_tex.value = nextPost.texture;
sys.renderer.setRenderTarget(null);
sys.renderer.render(sys.outputScene, sys.camera);