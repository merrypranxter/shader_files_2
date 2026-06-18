try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ 
            canvas, 
            context: ctx, 
            alpha: true, 
            antialias: false 
        });
        renderer.setPixelRatio(1);

        const SIM_RES = 512;
        const N = SIM_RES * SIM_RES;

        // FBOs
        const posFBOOpts = {
            type: THREE.FloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            depthBuffer: false,
            stencilBuffer: false
        };
        const posFBO1 = new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, posFBOOpts);
        const posFBO2 = new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, posFBOOpts);

        const simFBOOpts = {
            type: THREE.HalfFloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: false,
            stencilBuffer: false
        };
        const simFBO1 = new THREE.WebGLRenderTarget(grid.width, grid.height, simFBOOpts);
        const simFBO2 = new THREE.WebGLRenderTarget(grid.width, grid.height, simFBOOpts);

        const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const quadGeo = new THREE.PlaneGeometry(2, 2);

        // --- 1. Particle Position Update Shader ---
        // Strange Attractors (Peter de Jong / Clifford hybrid)
        const posUpdateMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_pos: { value: null },
                u_time: { value: 0 }
            },
            vertexShader: `
                void main() {
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform sampler2D u_pos;
                uniform float u_time;
                out vec4 fragColor;

                void main() {
                    vec2 uv = gl_FragCoord.xy / ${SIM_RES}.0;
                    vec4 p = texture(u_pos, uv);
                    
                    if (u_time < 0.1 || length(p.xy) > 6.0) {
                        float n1 = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
                        float n2 = fract(sin(dot(uv, vec2(39.346, 11.135))) * 43758.5453);
                        fragColor = vec4((n1-0.5)*5.0, (n2-0.5)*5.0, 0.0, 1.0);
                        return;
                    }
                    
                    vec2 pos = p.xy;
                    
                    // Dynamic Attractor Math
                    float a = 1.4 + sin(u_time * 0.1) * 0.2;
                    float b = -2.3 + cos(u_time * 0.13) * 0.2;
                    float c = 2.4 + sin(u_time * 0.17) * 0.2;
                    float d = -2.1 + cos(u_time * 0.19) * 0.2;
                    
                    vec2 nextPos = vec2(
                        sin(a * pos.y) - cos(b * pos.x),
                        sin(c * pos.x) - cos(d * pos.y)
                    );
                    
                    vec2 vel = nextPos - pos;
                    pos += vel * 0.05; // Fluid integration
                    
                    fragColor = vec4(pos, length(vel), 1.0);
                }
            `
        });
        const posScene = new THREE.Scene();
        posScene.add(new THREE.Mesh(quadGeo, posUpdateMat));

        // --- 2. Reaction-Diffusion Simulation Shader ---
        // Gray-Scott bioluminescence + Advection
        const simUpdateMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_sim: { value: null },
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            vertexShader: `
                void main() {
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform sampler2D u_sim;
                uniform float u_time;
                uniform vec2 u_resolution;
                out vec4 fragColor;

                vec2 hash(vec2 p) {
                    p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
                    return -1.0 + 2.0*fract(sin(p)*43758.5453123);
                }
                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    vec2 u = f*f*(3.0-2.0*f);
                    return mix(mix(dot(hash(i+vec2(0.0,0.0)), f-vec2(0.0,0.0)),
                                   dot(hash(i+vec2(1.0,0.0)), f-vec2(1.0,0.0)), u.x),
                               mix(dot(hash(i+vec2(0.0,1.0)), f-vec2(0.0,1.0)),
                                   dot(hash(i+vec2(1.0,1.0)), f-vec2(1.0,1.0)), u.x), u.y);
                }
                vec2 curl(vec2 p) {
                    float e = 0.01;
                    float dx = (noise(p + vec2(e,0.0)) - noise(p - vec2(e,0.0))) / (2.0*e);
                    float dy = (noise(p + vec2(0.0,e)) - noise(p - vec2(0.0,e))) / (2.0*e);
                    return vec2(dy, -dx);
                }

                void main() {
                    vec2 uv = gl_FragCoord.xy / u_resolution;
                    vec2 texel = 1.0 / u_resolution;
                    
                    if (u_time < 0.1) {
                        fragColor = vec4(1.0, 0.0, 0.0, 0.0);
                        return;
                    }
                    
                    // Advection
                    vec2 vel = curl(uv * 3.0 + u_time * 0.1) * 0.002;
                    vec2 advUv = uv - vel;
                    
                    vec4 c = texture(u_sim, advUv);
                    vec4 l = texture(u_sim, advUv + vec2(-texel.x, 0.0));
                    vec4 r = texture(u_sim, advUv + vec2(texel.x, 0.0));
                    vec4 t = texture(u_sim, advUv + vec2(0.0, texel.y));
                    vec4 b = texture(u_sim, advUv + vec2(0.0, -texel.y));
                    
                    vec4 lap = l + r + t + b - 4.0 * c;
                    
                    float u = c.r;
                    float v = c.g;
                    float uvv = u * v * v;
                    
                    // Spatially varying parameters (Mitosis to Deep Vein)
                    float F = 0.025 + sin(uv.x*10.0 + u_time)*0.005; 
                    float k = 0.055 + cos(uv.y*10.0 - u_time)*0.005;
                    
                    float du = 0.16 * lap.r - uvv + F * (1.0 - u);
                    float dv = 0.08 * lap.g + uvv - (F + k) * v;
                    
                    float nextU = clamp(u + du, 0.0, 1.0);
                    float nextV = clamp(v + dv, 0.0, 1.0);
                    
                    float trace = c.b * 0.96; // Trail decay
                    float glow = c.a * 0.90;  // Glow decay
                    
                    fragColor = vec4(nextU, nextV, trace, glow);
                }
            `
        });
        const simScene = new THREE.Scene();
        simScene.add(new THREE.Mesh(quadGeo, simUpdateMat));

        // --- 3. Particle Render Shader ---
        // Draws attractors into the Sim FBO to seed reaction-diffusion
        const posArray = new Float32Array(N * 3);
        for(let i=0; i<N; i++) {
            posArray[i*3+0] = (i % SIM_RES) / SIM_RES;
            posArray[i*3+1] = Math.floor(i / SIM_RES) / SIM_RES;
            posArray[i*3+2] = 0;
        }
        const particleGeo = new THREE.BufferGeometry();
        particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

        const particleMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_pos: { value: null },
                u_aspect: { value: grid.width / grid.height }
            },
            vertexShader: `
                uniform sampler2D u_pos;
                uniform float u_aspect;
                out float vVel;
                void main() {
                    vec2 uv = position.xy;
                    vec4 p = texture(u_pos, uv);
                    vVel = p.z;
                    vec2 screenPos = p.xy * 0.35;
                    screenPos.x /= u_aspect;
                    gl_Position = vec4(screenPos, 0.0, 1.0);
                    gl_PointSize = 1.0;
                }
            `,
            fragmentShader: `
                precision highp float;
                in float vVel;
                out vec4 fragColor;
                void main() {
                    float intensity = clamp(vVel * 10.0, 0.0, 1.0);
                    // R: u, G: v (seeds coral), B: trace, A: glow
                    fragColor = vec4(0.0, 0.15 * intensity, 0.4 * intensity, 0.1 * intensity);
                }
            `,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneFactor,
            depthTest: false,
            depthWrite: false,
            transparent: true
        });
        const particleScene = new THREE.Scene();
        particleScene.add(new THREE.Points(particleGeo, particleMat));

        // --- 4. Composite Shader ---
        // Tessellation + Apollonian Caskets + Lace + Gematria Rhythms + OKLab Color
        const compMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_sim: { value: null },
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            vertexShader: `
                void main() {
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform sampler2D u_sim;
                uniform float u_time;
                uniform vec2 u_resolution;
                out vec4 fragColor;

                #define TAU 6.28318530718

                // OKLab Color Math
                vec3 oklch_to_oklab(vec3 lch) {
                    return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
                }
                float lin2srgb(float x) {
                    return x <= 0.0031308 ? x * 12.92 : 1.055 * pow(max(x, 0.0), 1.0/2.4) - 0.055;
                }
                vec3 oklab_to_srgb(vec3 c) {
                    float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
                    float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
                    float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
                    float l = l_ * l_ * l_;
                    float m = m_ * m_ * m_;
                    float s = s_ * s_ * s_;
                    vec3 rgb = vec3(
                         4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                    );
                    return vec3(lin2srgb(rgb.r), lin2srgb(rgb.g), lin2srgb(rgb.b));
                }

                // Tessellation Grid
                vec2 hexGrid(vec2 uv, out vec2 id) {
                    vec2 r = vec2(1.0, 1.7320508);
                    vec2 h = r * 0.5;
                    vec2 a = mod(uv, r) - h;
                    vec2 b = mod(uv - h, r) - h;
                    vec2 gv = dot(a,a) < dot(b,b) ? a : b;
                    id = uv - gv;
                    return gv;
                }

                // Apollonian Gasket / Casket Fold
                float apollonian(vec2 p) {
                    float scale = 1.0;
                    for(int i=0; i<4; i++) {
                        p = -1.0 + 2.0 * fract(0.5 * p + 0.5);
                        float r2 = dot(p,p);
                        float k = 1.3 / r2;
                        p *= k;
                        scale *= k;
                        // Lace motif rotation twist
                        float a = 0.3;
                        p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
                    }
                    return length(p) / scale;
                }

                // Gematria Resonance Wave
                float gematria(vec2 p, float val, float t) {
                    return 0.5 + 0.5 * cos(TAU * (val/100.0) * length(p) - t);
                }

                void main() {
                    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
                    
                    // Mnemonic Gravity / Dream Warp
                    vec2 warp = vec2(sin(uv.y * 3.0 + u_time*0.5), cos(uv.x * 3.0 - u_time*0.5)) * 0.06;
                    vec2 wuv = uv + warp;
                    
                    vec2 id;
                    vec2 gv = hexGrid(wuv * 4.0, id);
                    
                    float ap = apollonian(gv * 2.0);
                    
                    // Lace Pattern Topology
                    float hexDist = max(abs(gv.x), abs(gv.x*0.5 + gv.y*0.866));
                    float scallop = 0.03 * sin(atan(gv.y, gv.x) * 12.0 + u_time);
                    float laceEdge = smoothstep(0.40, 0.46, hexDist + scallop);
                    
                    // Gematria Frequencies (YHWH=26, LOGOS=373, UNDERLAYER=123)
                    float g26 = gematria(wuv, 26.0, u_time);
                    float g373 = gematria(wuv, 373.0, u_time * 0.5);
                    float g123 = gematria(gv, 123.0, u_time * 1.5);
                    
                    vec2 screenUV = gl_FragCoord.xy / u_resolution;
                    vec4 sim = texture(u_sim, screenUV);
                    float v = sim.g;     // Reaction-Diffusion Bioluminescence
                    float trace = sim.b; // Attractor Trace
                    
                    float structure = smoothstep(0.01, 0.03, ap) * (1.0 - laceEdge);
                    float lines = 1.0 - structure;
                    
                    // Saturated Chromatic Base Field (NO BLACK, NO WHITE)
                    // L: 0.25 to 0.88, C: 0.18 to 0.35
                    float L = 0.35; 
                    float C = 0.28; 
                    float h = id.x * 0.2 + id.y * 0.4 + u_time * 0.15; 
                    
                    // Modulate by Bioluminescence (Coral spots)
                    L += v * 0.4; 
                    C += v * 0.05; 
                    h += v * 2.5; 
                    
                    // Modulate by Attractor Trace
                    L += trace * 0.35;
                    h += trace * 1.8;
                    
                    // Lace lines pulse
                    L += lines * 0.25 * g26; 
                    C += lines * 0.05;
                    h += lines * 3.14; 
                    
                    // Gematria global overlay
                    L += g373 * 0.08;
                    h += g123 * 0.2;
                    
                    // Strictly clamp to prevent neutrals
                    L = clamp(L, 0.25, 0.88);
                    C = clamp(C, 0.18, 0.35);
                    
                    vec3 oklab = oklch_to_oklab(vec3(L, C, h));
                    vec3 finalColor = oklab_to_srgb(oklab);
                    
                    // Colored Vignette
                    float vig = length(uv);
                    vec3 vigColor = oklab_to_srgb(oklch_to_oklab(vec3(0.3, 0.25, h + 1.0)));
                    finalColor = mix(finalColor, vigColor, smoothstep(0.6, 1.4, vig));
                    
                    fragColor = vec4(finalColor, 1.0);
                }
            `
        });
        const compScene = new THREE.Scene();
        compScene.add(new THREE.Mesh(quadGeo, compMat));

        canvas.__three = {
            renderer,
            posFBOs: [posFBO1, posFBO2],
            simFBOs: [simFBO1, simFBO2],
            posScene, simScene, particleScene, compScene,
            quadCam,
            posUpdateMat, simUpdateMat, particleMat, compMat,
            readPos: 0, readSim: 0
        };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        return;
    }
}

const t3 = canvas.__three;
const { 
    renderer, posFBOs, simFBOs, 
    posScene, simScene, particleScene, compScene, 
    quadCam, posUpdateMat, simUpdateMat, particleMat, compMat 
} = t3;

// Handle Resizing
if (simFBOs[0].width !== grid.width || simFBOs[0].height !== grid.height) {
    simFBOs[0].setSize(grid.width, grid.height);
    simFBOs[1].setSize(grid.width, grid.height);
}
renderer.setSize(grid.width, grid.height, false);

let readP = t3.readPos;
let writeP = 1 - readP;
let readS = t3.readSim;
let writeS = 1 - readS;

const aspect = grid.width / grid.height;

// 1. Update Strange Attractors
posUpdateMat.uniforms.u_pos.value = posFBOs[readP].texture;
posUpdateMat.uniforms.u_time.value = time;
renderer.setRenderTarget(posFBOs[writeP]);
renderer.render(posScene, quadCam);

// 2. Update Reaction-Diffusion
simUpdateMat.uniforms.u_sim.value = simFBOs[readS].texture;
simUpdateMat.uniforms.u_time.value = time;
simUpdateMat.uniforms.u_resolution.value.set(grid.width, grid.height);
renderer.setRenderTarget(simFBOs[writeS]);
renderer.render(simScene, quadCam);

// 3. Draw Particles into Simulation FBO (Additive)
particleMat.uniforms.u_pos.value = posFBOs[writeP].texture;
particleMat.uniforms.u_aspect.value = aspect;
renderer.autoClear = false;
renderer.render(particleScene, quadCam);
renderer.autoClear = true;

// 4. Composite to Screen
compMat.uniforms.u_sim.value = simFBOs[writeS].texture;
compMat.uniforms.u_time.value = time;
compMat.uniforms.u_resolution.value.set(grid.width, grid.height);
renderer.setRenderTarget(null);
renderer.render(compScene, quadCam);

// Swap buffers
t3.readPos = writeP;
t3.readSim = writeS;