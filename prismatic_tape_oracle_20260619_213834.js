if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        const sceneCA = new THREE.Scene();
        const sceneRender = new THREE.Scene();
        const scenePost = new THREE.Scene();
        const sceneDisplay = new THREE.Scene();

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const rtOpts = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            wrapS: THREE.RepeatWrapping,
            wrapT: THREE.RepeatWrapping
        };

        const rtCA1 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const rtCA2 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const rtScene = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const rtPost1 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const rtPost2 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);

        const geoQuad = new THREE.PlaneGeometry(2, 2);

        // --- CELLULAR AUTOMATA PASS (Gray-Scott Reaction-Diffusion) ---
        const matCA = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_tex: { value: null },
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
                uniform sampler2D u_tex;
                uniform vec2 u_res;
                uniform float u_time;

                float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

                void main() {
                    vec2 px = 1.0 / u_res;
                    vec4 c = texture(u_tex, vUv);
                    
                    vec4 n = texture(u_tex, vUv + vec2(0.0, px.y));
                    vec4 s = texture(u_tex, vUv - vec2(0.0, px.y));
                    vec4 e = texture(u_tex, vUv + vec2(px.x, 0.0));
                    vec4 w = texture(u_tex, vUv - vec2(px.x, 0.0));
                    vec4 ne = texture(u_tex, vUv + vec2(px.x, px.y));
                    vec4 nw = texture(u_tex, vUv + vec2(-px.x, px.y));
                    vec4 se = texture(u_tex, vUv + vec2(px.x, -px.y));
                    vec4 sw = texture(u_tex, vUv + vec2(-px.x, -px.y));

                    vec4 lap = c * -1.0 + (n + s + e + w) * 0.2 + (ne + nw + se + sw) * 0.05;

                    float feed = 0.055;
                    float kill = 0.062;

                    float da = 1.0 * lap.r - c.r * c.g * c.g + feed * (1.0 - c.r);
                    float db = 0.5 * lap.g + c.r * c.g * c.g - (feed + kill) * c.g;

                    float newA = clamp(c.r + da, 0.0, 1.0);
                    float newB = clamp(c.g + db, 0.0, 1.0);

                    // Keep it alive
                    if(u_time < 0.5 || hash(vUv + u_time) > 0.999) {
                        float dist = length(vUv - 0.5);
                        if(dist < 0.2 || hash(vUv)>0.9) {
                            newA = 1.0;
                            newB = hash(vUv * 10.0);
                        }
                    }

                    fragColor = vec4(newA, newB, 0.0, 1.0);
                }
            `
        });

        // --- MAIN SCENE PASS (Dream Physics, Op-Art, Early Internet) ---
        const matScene = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_caTex: { value: null },
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
                uniform sampler2D u_caTex;
                uniform vec2 u_res;
                uniform float u_time;

                float sdBox(vec2 p, vec2 b) {
                    vec2 d = abs(p) - b;
                    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
                }

                mat2 rot(float a) {
                    float s = sin(a), c = cos(a);
                    return mat2(c, -s, s, c);
                }

                // Structural Color Iridescence
                vec3 iridescence(float t) {
                    vec3 a = vec3(0.5, 0.5, 0.5);
                    vec3 b = vec3(0.5, 0.5, 0.5);
                    vec3 c = vec3(1.0, 1.0, 1.0);
                    vec3 d = vec3(0.0, 0.33, 0.67);
                    return a + b * cos(6.28318 * (c * t + d));
                }

                void main() {
                    vec2 p = vUv * 2.0 - 1.0;
                    p.x *= u_res.x / u_res.y;

                    vec4 ca = texture(u_caTex, vUv);

                    // Mnemonic Gravity (Dream Physics warp)
                    float r = length(p);
                    p *= 1.0 - 0.4 * exp(-r*r*8.0) * ca.g; // CA drives the spatial pull

                    // Log-polar transformation for Op-Art tunnel
                    float a = atan(p.y, p.x);
                    vec2 lp = vec2(log(max(r, 0.001)) - u_time * 0.3, a * 3.0 / 3.14159);
                    
                    // Op-Art vibrating moire corridors
                    float op1 = sin(lp.x * 30.0 + ca.r * 5.0) * cos(lp.y * 30.0 + u_time);
                    float op2 = sin(lp.x * 25.0 - u_time) * cos(lp.y * 25.0);
                    float moire = smoothstep(-0.2, 0.2, op1 * op2);

                    // Background iridescence
                    vec3 col = iridescence(r * 2.0 - u_time * 0.5 + moire * 0.3);

                    // Early Internet Browser Shards
                    vec2 bp = p * rot(u_time * 0.1);
                    bp.y += u_time * 0.15;
                    vec2 id = floor(bp * 1.5);
                    vec2 localBp = fract(bp * 1.5) - 0.5;
                    
                    float win = sdBox(localBp, vec2(0.35, 0.25));
                    float winBorder = abs(win) - 0.015;
                    float chips = sdBox(localBp - vec2(0.2, 0.15), vec2(0.05, 0.02));

                    vec3 winCol = iridescence(id.x * 0.4 + id.y * 0.8 + ca.g);
                    
                    // Layering the impossible architecture
                    if (win < 0.0) {
                        col = mix(col, winCol, 0.8);
                        // Add CA logic to the panels
                        col += ca.r * 0.5 * iridescence(ca.g * 5.0);
                    }
                    if (winBorder < 0.0) col = iridescence(u_time + id.x);
                    if (chips < 0.0) col = vec3(1.0, 0.0, 0.5); // Hot pink accent

                    // Central Retinal Oracle
                    float oracleCore = length(p) - 0.3;
                    float oracleRings = abs(oracleCore) - 0.02;
                    float oraclePulse = sin(oracleCore * 50.0 - u_time * 5.0);
                    
                    if (oracleCore < 0.0) {
                        col = iridescence(length(p) * 5.0 - u_time * 2.0 + ca.r);
                        col *= smoothstep(-0.5, 0.5, oraclePulse);
                    }
                    if (oracleRings < 0.0) col = vec3(0.0, 1.0, 0.8); // Electric cyan

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        // --- POST PASS (Datamosh, VHS, Riso, Cross-Processing, Absolute Color Enforcement) ---
        const matPost = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_scene: { value: null },
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
                uniform sampler2D u_scene;
                uniform sampler2D u_prev;
                uniform vec2 u_res;
                uniform float u_time;

                // --- OKLab Color Math ---
                vec3 linear_srgb_to_oklab(vec3 c) {
                    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
                    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
                    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
                    float l_ = pow(max(l, 0.0), 1.0/3.0);
                    float m_ = pow(max(m, 0.0), 1.0/3.0);
                    float s_ = pow(max(s, 0.0), 1.0/3.0);
                    return vec3(
                        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
                        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
                        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
                    );
                }

                vec3 oklab_to_linear_srgb(vec3 c) {
                    float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
                    float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
                    float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
                    float l = l_ * l_ * l_;
                    float m = m_ * m_ * m_;
                    float s = s_ * s_ * s_;
                    return vec3(
                         4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                    );
                }

                vec3 srgb_to_linear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
                vec3 linear_to_srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0/2.2)); }

                float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

                // Risograph Halftone
                float halftone(vec2 uv, float lpi, float angle) {
                    float s = sin(angle), c = cos(angle);
                    vec2 r = vec2(uv.x*c - uv.y*s, uv.x*s + uv.y*c) * lpi;
                    return 1.0 - smoothstep(0.2, 0.5, length(fract(r) - 0.5));
                }

                void main() {
                    vec2 uv = vUv;

                    // 1. VHS Tracking & Damage
                    float trackY = fract(u_time * 0.15);
                    float trackBand = smoothstep(0.1, 0.0, abs(uv.y - trackY));
                    float wobble = sin(uv.y * 80.0 + u_time * 20.0) * 0.01 * trackBand;
                    uv.x += wobble;

                    float headSwitch = step(0.96, uv.y) * hash(vec2(uv.y, u_time)) * 0.02;
                    uv.x -= headSwitch;

                    // 2. Datamosh (Motion Vector Feedback)
                    vec3 sceneCol = texture(u_scene, uv).rgb;
                    float luma = dot(sceneCol, vec3(0.21, 0.71, 0.07));
                    vec2 flow = vec2(dFdx(luma), dFdy(luma)) * 5.0; // Extract structural flow
                    
                    vec2 fbUv = uv - flow * 0.015 + vec2(0.0, -0.002); // Drag memory upwards
                    vec3 prevCol = texture(u_prev, fbUv).rgb;

                    // I-frame glitch trigger
                    float moshTrig = step(0.85, fract(sin(u_time * 2.0) * 43758.5));
                    vec3 baseCol = mix(sceneCol, prevCol, 0.85 * moshTrig);

                    // 3. Risograph Misregistration & Chromatic Aberration
                    vec2 misreg = vec2(0.006, -0.003) * sin(u_time * 2.0);
                    vec3 rCol = texture(u_scene, fract(uv + misreg)).rgb;
                    vec3 bCol = texture(u_scene, fract(uv - misreg)).rgb;

                    // Simulated Riso Spot Colors (Neon)
                    vec3 spotPink = vec3(1.0, 0.1, 0.6);
                    vec3 spotTeal = vec3(0.0, 0.8, 0.9);
                    vec3 spotYellow = vec3(0.9, 0.9, 0.0);

                    float ht1 = halftone(uv, 90.0, 0.785) * rCol.r;
                    float ht2 = halftone(uv, 90.0, 1.309) * baseCol.g;
                    float ht3 = halftone(uv, 90.0, 1.832) * bCol.b;

                    vec3 risoCol = spotPink * ht1 + spotTeal * ht2 + spotYellow * ht3;
                    
                    // Blend continuous scene with print halftone
                    vec3 comp = mix(baseCol, risoCol, 0.35);

                    // Add colored dropout scars
                    float dropout = step(0.99, hash(vec2(uv.y * 100.0, u_time))) * trackBand;
                    comp = mix(comp, spotPink, dropout); // Scars must be colored!

                    // 4. CROSS-PROCESSING & ABSOLUTE COLOR ENFORCEMENT
                    vec3 ok = linear_srgb_to_oklab(srgb_to_linear(comp));

                    // RULE 1: No black, no white (L in [0.25, 0.85])
                    ok.x = clamp(ok.x, 0.25, 0.85);

                    // RULE 2: No grayscale neutrals (Minimum Chroma C > 0.22)
                    float C = length(ok.yz);
                    if (C < 0.22) {
                        vec2 dir = (C > 0.001) ? (ok.yz / C) : vec2(0.707, -0.707);
                        ok.yz = dir * 0.22;
                    }

                    // RULE 3: Tone-dependent chemistry (Cross-processing)
                    // Shadows get pushed to Indigo / Deep Plum
                    float shadowWeight = smoothstep(0.5, 0.25, ok.x);
                    ok.y += shadowWeight * 0.05; // toward magenta
                    ok.z -= shadowWeight * 0.15; // heavily toward blue

                    // Highlights get pushed to Acid Yellow / Hot Pink
                    float highWeight = smoothstep(0.6, 0.85, ok.x);
                    ok.y += highWeight * 0.12; // toward red/pink
                    ok.z += highWeight * 0.15; // toward yellow

                    // Re-clamp Chroma to prevent HDR explosion
                    C = length(ok.yz);
                    if (C > 0.35) {
                        ok.yz = (ok.yz / C) * 0.35;
                    }

                    fragColor = vec4(linear_to_srgb(oklab_to_linear_srgb(ok)), 1.0);
                }
            `
        });

        const matDisplay = new THREE.ShaderMaterial({
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

        const meshCA = new THREE.Mesh(geoQuad, matCA);
        sceneCA.add(meshCA);

        const meshScene = new THREE.Mesh(geoQuad, matScene);
        sceneRender.add(meshScene);

        const meshPost = new THREE.Mesh(geoQuad, matPost);
        scenePost.add(meshPost);

        const meshDisplay = new THREE.Mesh(geoQuad, matDisplay);
        sceneDisplay.add(meshDisplay);

        canvas.__three = {
            renderer, camera,
            sceneCA, sceneRender, scenePost, sceneDisplay,
            matCA, matScene, matPost, matDisplay,
            rtCA1, rtCA2, rtScene, rtPost1, rtPost2,
            pingCA: true, pingPost: true
        };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        return;
    }
}

const sys = canvas.__three;
if (!sys) return;

sys.renderer.setSize(grid.width, grid.height, false);

// 1. Evolve Cellular Automata
const caRead = sys.pingCA ? sys.rtCA1 : sys.rtCA2;
const caWrite = sys.pingCA ? sys.rtCA2 : sys.rtCA1;
sys.matCA.uniforms.u_time.value = time;
sys.matCA.uniforms.u_tex.value = caRead.texture;
sys.matCA.uniforms.u_res.value.set(grid.width, grid.height);
sys.renderer.setRenderTarget(caWrite);
sys.renderer.render(sys.sceneCA, sys.camera);
sys.pingCA = !sys.pingCA;

// 2. Render Main Dream Physics Scene
sys.matScene.uniforms.u_time.value = time;
sys.matScene.uniforms.u_caTex.value = caWrite.texture;
sys.matScene.uniforms.u_res.value.set(grid.width, grid.height);
sys.renderer.setRenderTarget(sys.rtScene);
sys.renderer.render(sys.sceneRender, sys.camera);

// 3. Post-Process (Datamosh, VHS, Riso, Strict Color Rules)
const postRead = sys.pingPost ? sys.rtPost1 : sys.rtPost2;
const postWrite = sys.pingPost ? sys.rtPost2 : sys.rtPost1;
sys.matPost.uniforms.u_time.value = time;
sys.matPost.uniforms.u_scene.value = sys.rtScene.texture;
sys.matPost.uniforms.u_prev.value = postRead.texture;
sys.matPost.uniforms.u_res.value.set(grid.width, grid.height);
sys.renderer.setRenderTarget(postWrite);
sys.renderer.render(sys.scenePost, sys.camera);
sys.pingPost = !sys.pingPost;

// 4. Output to Canvas
sys.matDisplay.uniforms.u_tex.value = postWrite.texture;
sys.renderer.setRenderTarget(null);
sys.renderer.render(sys.sceneDisplay, sys.camera);