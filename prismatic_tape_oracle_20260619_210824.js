try {
    if (!ctx) throw new Error("WebGL2 context not available");

    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;
        
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneGeometry(2, 2);

        const rtOpts = {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            depthBuffer: false,
            stencilBuffer: false
        };

        const fboCA = [
            new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts),
            new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts)
        ];
        const fboScene = [
            new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts),
            new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts)
        ];

        const oklabFns = `
            vec3 srgb_to_linear(vec3 c) {
                return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
            }
            vec3 linear_to_srgb(vec3 c) {
                return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c));
            }
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
            vec3 oklabMix(vec3 a, vec3 b, float t) {
                vec3 labA = linear_srgb_to_oklab(srgb_to_linear(a));
                vec3 labB = linear_srgb_to_oklab(srgb_to_linear(b));
                return linear_to_srgb(oklab_to_linear_srgb(mix(labA, labB, t)));
            }
            float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
            float noise(vec2 p) {
                vec2 i = floor(p); vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x),
                           mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y);
            }
        `;

        const caMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: { u_tex: { value: null }, u_res: { value: new THREE.Vector2(grid.width, grid.height) }, u_time: { value: 0 } },
            vertexShader: `in vec2 position; out vec2 vUv; void main() { vUv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }`,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_tex;
                uniform vec2 u_res;
                uniform float u_time;
                ${oklabFns}
                void main() {
                    if (u_time < 0.1) {
                        float seed = step(0.8, hash(vUv * 100.0 + u_time));
                        fragColor = vec4(seed, 0.0, 0.0, 1.0);
                        return;
                    }
                    vec2 px = 1.0 / u_res;
                    float sum = 0.0;
                    for(int x=-2; x<=2; x++) {
                        for(int y=-2; y<=2; y++) {
                            sum += texture(u_tex, fract(vUv + vec2(x,y)*px)).r;
                        }
                    }
                    float current = texture(u_tex, vUv).r;
                    float growth = exp(-pow(sum - 4.5, 2.0) / 1.5) * 2.0 - 0.8;
                    float next = clamp(current + growth * 0.1, 0.0, 1.0);
                    float age = current > 0.1 ? texture(u_tex, vUv).g + 0.01 : 0.0;
                    fragColor = vec4(next, clamp(age, 0.0, 1.0), sum/25.0, 1.0);
                }
            `
        });

        const sceneMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: { u_ca: { value: null }, u_prev: { value: null }, u_res: { value: new THREE.Vector2(grid.width, grid.height) }, u_time: { value: 0 } },
            vertexShader: `in vec2 position; out vec2 vUv; void main() { vUv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }`,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_ca;
                uniform sampler2D u_prev;
                uniform vec2 u_res;
                uniform float u_time;
                ${oklabFns}
                
                mat2 rot(float a) { float s=sin(a), c=cos(a); return mat2(c, -s, s, c); }
                
                float sdBox(vec2 p, vec2 b) {
                    vec2 d = abs(p) - b;
                    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
                }

                void main() {
                    vec2 uv = vUv;
                    vec2 p = (uv - 0.5) * 2.0;
                    p.x *= u_res.x / u_res.y;
                    
                    vec4 ca = texture(u_ca, uv);
                    
                    // Datamosh Vector Flow from CA gradients
                    float cx = texture(u_ca, fract(uv + vec2(0.01, 0.0))).r;
                    float cy = texture(u_ca, fract(uv + vec2(0.0, 0.01))).r;
                    vec2 flow = vec2(cx - ca.r, cy - ca.r) * 0.05;
                    
                    // Mnemonic Gravity / Impossible Topology
                    float r = length(p);
                    float a = atan(p.y, p.x);
                    vec2 logPolar = vec2(log(r) - u_time*0.1, a*3.0/3.1415 + u_time*0.05);
                    
                    // Op-Art Engine
                    float moire = sin(logPolar.x*30.0 + sin(logPolar.y*15.0 + u_time)) * sin(r*40.0 - u_time*3.0);
                    
                    // Early Internet Browser Fragments
                    vec2 bp = p;
                    bp *= rot(sin(u_time*0.2)*0.2);
                    bp.x += sin(u_time*0.5)*0.3;
                    float dBox = sdBox(bp, vec2(0.6, 0.4));
                    float isBrowser = 1.0 - smoothstep(0.0, 0.02, abs(dBox) - 0.01);
                    float uiDebris = step(0.8, noise(bp * 20.0 + u_time)) * step(dBox, 0.0);
                    
                    // Central Oracle Portal
                    float dPortal = abs(length(p) - 0.5) - 0.02;
                    float isPortal = 1.0 - smoothstep(0.0, 0.03, dPortal);
                    
                    // Structural Color Chemistry
                    vec3 colBase = vec3(0.1, 0.0, 0.2); // Deep Plum
                    vec3 colHigh = vec3(0.0, 1.0, 0.8); // Neon Cyan
                    vec3 colMid  = vec3(1.0, 0.1, 0.6); // Hot Pink
                    
                    float structPhase = r * 5.0 + moire + ca.g * 2.0;
                    vec3 structCol = oklabMix(colMid, colHigh, sin(structPhase)*0.5+0.5);
                    
                    vec3 finalCol = oklabMix(colBase, structCol, clamp(moire + ca.r, 0.0, 1.0));
                    finalCol = oklabMix(finalCol, vec3(0.8, 1.0, 0.0), isBrowser); // Acid Yellow borders
                    finalCol = oklabMix(finalCol, vec3(1.0, 0.2, 0.5), uiDebris);
                    finalCol = oklabMix(finalCol, vec3(0.0, 1.0, 0.8), isPortal);
                    
                    // Temporal Ghosting / Datamosh Feedback
                    vec2 prevUv = fract(uv - flow + (noise(uv*10.0+u_time)-0.5)*0.005);
                    vec4 prev = texture(u_prev, prevUv);
                    
                    float moshFactor = clamp(ca.r * 1.5 + step(0.98, noise(uv*5.0-u_time)), 0.0, 0.95);
                    finalCol = oklabMix(finalCol, prev.rgb, moshFactor * 0.85);
                    
                    fragColor = vec4(finalCol, 1.0);
                }
            `
        });

        const postMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: { u_scene: { value: null }, u_res: { value: new THREE.Vector2(grid.width, grid.height) }, u_time: { value: 0 } },
            vertexShader: `in vec2 position; out vec2 vUv; void main() { vUv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }`,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_scene;
                uniform vec2 u_res;
                uniform float u_time;
                ${oklabFns}
                
                float halftone(vec2 uv, float lpi, float angle, float gain) {
                    float c = cos(angle), s = sin(angle);
                    vec2 rot = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
                    vec2 cell = fract(rot * lpi) - 0.5;
                    float r = 0.38 / gain;
                    return 1.0 - smoothstep(r - 0.04, r + 0.04, length(cell));
                }

                void main() {
                    vec2 uv = vUv;
                    
                    // VHS Tracking & Sync Instability
                    float trackTear = step(0.95, sin(uv.y * 3.0 + u_time * 2.0)) * noise(vec2(u_time*10.0, uv.y*50.0));
                    uv.x += trackTear * 0.05;
                    if(uv.y < 0.08) uv.x += (noise(vec2(uv.y*100.0, u_time*50.0))-0.5)*0.02; // Head switching
                    
                    // Chromatic Aberration / Chroma Bleed
                    vec2 caOffset = vec2(0.008 + trackTear*0.02, 0.0);
                    vec3 sceneC = texture(u_scene, uv).rgb;
                    vec3 sceneL = texture(u_scene, fract(uv - caOffset)).rgb;
                    vec3 sceneR = texture(u_scene, fract(uv + caOffset)).rgb;
                    
                    // Re-assemble with false color chemistry
                    float lum = dot(sceneC, vec3(0.2126, 0.7152, 0.0722));
                    float lumL = dot(sceneL, vec3(0.2126, 0.7152, 0.0722));
                    float lumR = dot(sceneR, vec3(0.2126, 0.7152, 0.0722));
                    
                    // Risograph Logic (No Black/White)
                    vec3 PAPER = vec3(0.05, 0.0, 0.15); // Deep Indigo
                    vec3 INK1  = vec3(1.0, 0.1, 0.5);   // Hot Pink
                    vec3 INK2  = vec3(0.0, 0.9, 0.8);   // Neon Cyan
                    vec3 INK3  = vec3(0.9, 1.0, 0.0);   // Acid Yellow
                    
                    float lpi = 75.0 / (u_res.y / 1000.0);
                    
                    // Misregistration chaos
                    vec2 uvI1 = uv + vec2(sin(u_time)*0.003, cos(u_time*1.2)*0.002);
                    vec2 uvI2 = uv + vec2(cos(u_time*0.8)*0.004, -sin(u_time*0.9)*0.003);
                    vec2 uvI3 = uv;
                    
                    float h1 = halftone(uvI1, lpi, 0.785, clamp(lumL * 1.5, 0.1, 1.5));
                    float h2 = halftone(uvI2, lpi, 1.309, clamp(lumR * 1.5, 0.1, 1.5));
                    float h3 = halftone(uvI3, lpi, 1.832, clamp(lum * 1.2, 0.1, 1.5));
                    
                    // Multiply blend over dark paper
                    vec3 finalCol = PAPER;
                    finalCol = oklabMix(finalCol, INK1, h1 * 0.85);
                    finalCol = oklabMix(finalCol, INK2, h2 * 0.85);
                    finalCol = oklabMix(finalCol, INK3, h3 * 0.85);
                    
                    // Dropout noise (Tape/Print damage)
                    float dropout = step(0.98, hash(uv * 200.0 + u_time));
                    finalCol = oklabMix(finalCol, INK3, dropout); // Colored dropout, never white!
                    
                    // Enforce Cross-Processing Chemistry (Strict Palette Limits)
                    finalCol = clamp(finalCol, 0.0, 1.0);
                    float finalLum = dot(finalCol, vec3(0.2126, 0.7152, 0.0722));
                    vec3 gradeShadow = vec3(0.1, 0.0, 0.3); // Saturated Purple
                    vec3 gradeMid = vec3(1.0, 0.2, 0.4);    // Coral/Pink
                    vec3 gradeHigh = vec3(0.8, 1.0, 0.0);   // Acid Yellow
                    
                    vec3 grade = oklabMix(gradeShadow, gradeMid, smoothstep(0.0, 0.5, finalLum));
                    grade = oklabMix(grade, gradeHigh, smoothstep(0.5, 1.0, finalLum));
                    
                    // Mix native riso with graded chemistry
                    finalCol = oklabMix(finalCol, grade, 0.4);

                    fragColor = vec4(finalCol, 1.0);
                }
            `
        });

        const caScene = new THREE.Scene();
        caScene.add(new THREE.Mesh(geometry, caMat));
        
        const mainScene = new THREE.Scene();
        mainScene.add(new THREE.Mesh(geometry, sceneMat));
        
        const postScene = new THREE.Scene();
        postScene.add(new THREE.Mesh(geometry, postMat));

        canvas.__three = { renderer, camera, caMat, sceneMat, postMat, caScene, mainScene, postScene, fboCA, fboScene, ping: 0 };
    }

    const t = canvas.__three;
    t.renderer.setSize(grid.width, grid.height, false);
    
    t.caMat.uniforms.u_time.value = time;
    t.caMat.uniforms.u_res.value.set(grid.width, grid.height);
    t.caMat.uniforms.u_tex.value = t.fboCA[t.ping].texture;
    t.renderer.setRenderTarget(t.fboCA[1 - t.ping]);
    t.renderer.render(t.caScene, t.camera);

    t.sceneMat.uniforms.u_time.value = time;
    t.sceneMat.uniforms.u_res.value.set(grid.width, grid.height);
    t.sceneMat.uniforms.u_ca.value = t.fboCA[1 - t.ping].texture;
    t.sceneMat.uniforms.u_prev.value = t.fboScene[t.ping].texture;
    t.renderer.setRenderTarget(t.fboScene[1 - t.ping]);
    t.renderer.render(t.mainScene, t.camera);

    t.postMat.uniforms.u_time.value = time;
    t.postMat.uniforms.u_res.value.set(grid.width, grid.height);
    t.postMat.uniforms.u_scene.value = t.fboScene[1 - t.ping].texture;
    t.renderer.setRenderTarget(null);
    t.renderer.render(t.postScene, t.camera);

    t.ping = 1 - t.ping;

} catch (e) {
    console.error("Prismatic Tape Oracle Initialization Failed:", e);
}