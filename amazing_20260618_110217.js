if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL2 context required");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: false, antialias: false });
        
        const rtOpts = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            depthBuffer: false,
            stencilBuffer: false
        };
        
        const fboA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const fboB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        scene.add(quad);
        
        const simMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_tex: { value: null },
                u_res: { value: new THREE.Vector2(grid.width, grid.height) },
                u_time: { value: 0 },
                u_mouse: { value: new THREE.Vector2(-1, -1) },
                u_frame: { value: 0 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                in vec2 vUv;
                out vec4 fragColor;

                uniform sampler2D u_tex;
                uniform vec2 u_res;
                uniform float u_time;
                uniform vec2 u_mouse;
                uniform float u_frame;

                // Gematria Frequencies
                const float f_UNDERLAYER = 1.23;
                const float f_DREAM = 0.41;
                const float f_BLOOM = 0.57;
                const float f_CASKET = 0.59;
                const float f_ANU = 0.36;

                // Hex Grid Tessellation
                vec2 hexGrid(vec2 uv, out vec2 id) {
                    vec2 r = vec2(1.0, 1.73205081);
                    vec2 h = r * 0.5;
                    vec2 a = mod(uv, r) - h;
                    vec2 b = mod(uv - h, r) - h;
                    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
                    id = uv - gv;
                    return gv;
                }

                // Apollonian Casket SDF (Recursive IFS)
                float casketSDF(vec2 p, float t) {
                    p = p * 2.5;
                    float scale = 1.0;
                    for(int i = 0; i < 4; i++) {
                        p = abs(p) - 0.5 - 0.1 * sin(t * f_DREAM);
                        float d2 = dot(p, p);
                        float k = 1.2 / clamp(d2, 0.1, 1.0);
                        p *= k;
                        scale *= k;
                        float a = f_CASKET + t * 0.1;
                        p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
                    }
                    return length(p) / scale;
                }

                // Strange Attractor (Clifford)
                float attractor(vec2 uv, float t) {
                    vec2 p = vec2(0.0);
                    float a = 1.4 + 0.2 * sin(t * f_BLOOM);
                    float b = 1.6 + 0.2 * cos(t * f_ANU);
                    float c = 1.0;
                    float d = 0.7;
                    float minDist = 1e5;
                    for(int i = 0; i < 45; i++) {
                        p = vec2(sin(a * p.y) + c * cos(a * p.x),
                                 sin(b * p.x) + d * cos(b * p.y));
                        minDist = min(minDist, length(uv - p * 0.4));
                    }
                    return exp(-minDist * 80.0);
                }

                // DLA Growth via Domain Warped Ridge Noise
                vec2 hash2(vec2 p) {
                    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
                    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
                }
                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    vec2 u = f * f * (3.0 - 2.0 * f);
                    return mix(mix(dot(hash2(i), f),
                                   dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
                               mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                                   dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
                }
                float fbm(vec2 p) {
                    float f = 0.0; float w = 0.5;
                    for(int i = 0; i < 4; i++) {
                        f += w * noise(p);
                        p *= 2.0; w *= 0.5;
                    }
                    return f;
                }
                float dla(vec2 p, float t) {
                    vec2 q = vec2(fbm(p + t * 0.1), fbm(p + vec2(5.2, 1.3)));
                    float n = fbm(p * 4.0 + q * 2.0);
                    n = 1.0 - abs(n); // Ridge
                    return smoothstep(0.7, 1.0, n);
                }

                // Lace Network Topology
                float lace(vec2 p) {
                    vec2 id;
                    vec2 gv = hexGrid(p * 8.0, id);
                    float d = length(gv) - 0.35;
                    float bridges = abs(gv.x * gv.y) - 0.015;
                    return max(d, -bridges);
                }

                // Divergence-free Curl Velocity for Advection
                vec2 curlVelocity(vec2 p, float t) {
                    float eps = 0.01;
                    float n1 = fbm(p + vec2(0.0, eps) + t * 0.1) - fbm(p - vec2(0.0, eps) + t * 0.1);
                    float n2 = fbm(p + vec2(eps, 0.0) + t * 0.1) - fbm(p - vec2(eps, 0.0) + t * 0.1);
                    return vec2(n1, -n2) / (2.0 * eps);
                }

                void main() {
                    vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
                    
                    // Mnemonic Gravity Warp
                    vec2 wp = p;
                    wp += 0.05 * vec2(sin(wp.y * 5.0 + u_time * f_UNDERLAYER), cos(wp.x * 5.0 - u_time * f_DREAM));
                    
                    vec2 id;
                    vec2 gv = hexGrid(wp * 3.0, id);
                    
                    float d_casket = casketSDF(gv, u_time);
                    float d_dla = dla(gv * 2.0, u_time);
                    float d_lace = lace(wp);
                    float att = attractor(wp, u_time);
                    
                    // Advection-Diffusion: shift lookup UV by curl velocity
                    vec2 texel = 1.0 / u_res;
                    vec2 advUv = vUv - curlVelocity(wp, u_time) * texel * 2.0;
                    
                    vec4 state = texture(u_tex, advUv);
                    float u = state.r;
                    float v = state.g;
                    float phase = state.b;
                    float trail = state.a;
                    
                    // 9-point Laplacian
                    vec4 stateL = texture(u_tex, advUv + vec2(texel.x, 0.0));
                    vec4 stateR = texture(u_tex, advUv - vec2(texel.x, 0.0));
                    vec4 stateU = texture(u_tex, advUv + vec2(0.0, texel.y));
                    vec4 stateD = texture(u_tex, advUv - vec2(0.0, texel.y));
                    vec4 stateUL = texture(u_tex, advUv + vec2(-texel.x, texel.y));
                    vec4 stateUR = texture(u_tex, advUv + vec2(texel.x, texel.y));
                    vec4 stateDL = texture(u_tex, advUv + vec2(-texel.x, -texel.y));
                    vec4 stateDR = texture(u_tex, advUv + vec2(texel.x, -texel.y));

                    vec4 lap = 0.2 * (stateL + stateR + stateU + stateD) + 
                               0.05 * (stateUL + stateUR + stateDL + stateDR) - state;
                               
                    // Reaction-Diffusion (Gray-Scott) modulated by geometry
                    float Du = 0.2;
                    float Dv = 0.1;
                    
                    float geoMap = smoothstep(0.1, 0.0, d_casket) + d_dla;
                    float holeMap = smoothstep(0.05, 0.0, d_lace);
                    
                    float F = 0.035 + 0.015 * geoMap - 0.01 * holeMap + 0.005 * sin(u_time);
                    float k = 0.060 - 0.005 * geoMap + 0.015 * holeMap;
                    
                    float uvv = u * v * v;
                    float du = Du * lap.r - uvv + F * (1.0 - u);
                    float dv = Dv * lap.g + uvv - (F + k) * v;
                    
                    u = clamp(u + du, 0.0, 1.0);
                    v = clamp(v + dv, 0.0, 1.0);
                    
                    // Kuramoto Phase Synchronization
                    float natural_freq = 0.02 + 0.03 * v;
                    float k_sync = 0.05;
                    float dPhase = natural_freq + k_sync * (
                        sin(stateL.b * 6.283 - phase * 6.283) +
                        sin(stateR.b * 6.283 - phase * 6.283) +
                        sin(stateU.b * 6.283 - phase * 6.283) +
                        sin(stateD.b * 6.283 - phase * 6.283)
                    ) / 6.283;
                    phase = fract(phase + dPhase);
                    
                    // Fitzhugh-Nagumo styled geometry injection
                    if (att > 0.5) v = min(v + 0.1, 1.0);
                    
                    float pulse = 0.5 + 0.5 * sin(length(gv) * 20.0 - u_time * 2.0);
                    if (pulse > 0.98 && d_casket < 0.05) v = min(v + 0.1, 1.0);
                    
                    if (u_mouse.x > 0.0) {
                        vec2 mPos = (u_mouse - 0.5) * 2.0 * (u_res / min(u_res.x, u_res.y));
                        if (length(p - mPos) < 0.05) v = 1.0;
                    }
                    
                    // Genesis seeding
                    if (u_frame < 5.0) {
                        u = 1.0;
                        v = length(gv) < 0.1 ? 1.0 : 0.0;
                        phase = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
                        trail = 0.0;
                    }
                    
                    // Temporal decay trail
                    trail = trail * 0.95 + att * 0.05 + v * 0.02;
                    
                    fragColor = vec4(u, v, phase, trail);
                }
            `
        });
        
        const compMat = new THREE.ShaderMaterial({
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
                precision highp float;
                in vec2 vUv;
                out vec4 fragColor;
                
                uniform sampler2D u_tex;
                uniform vec2 u_res;
                uniform float u_time;

                const float f_UNDERLAYER = 1.23;
                const float f_DREAM = 0.41;

                // OKLab to sRGB
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
                    
                    return vec3(
                        rgb.r <= 0.0031308 ? rgb.r * 12.92 : 1.055 * pow(max(rgb.r, 0.0), 1.0/2.4) - 0.055,
                        rgb.g <= 0.0031308 ? rgb.g * 12.92 : 1.055 * pow(max(rgb.g, 0.0), 1.0/2.4) - 0.055,
                        rgb.b <= 0.0031308 ? rgb.b * 12.92 : 1.055 * pow(max(rgb.b, 0.0), 1.0/2.4) - 0.055
                    );
                }

                vec3 oklch_to_srgb(float L, float C, float h) {
                    vec3 lab = vec3(L, C * cos(h), C * sin(h));
                    return oklab_to_srgb(lab);
                }

                void main() {
                    vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
                    
                    // Chromatic aberration sampling
                    float d = length(vUv - 0.5);
                    vec2 offset = normalize(vUv - 0.5) * 0.004 * d;
                    
                    vec4 stateR = texture(u_tex, vUv + offset);
                    vec4 stateG = texture(u_tex, vUv);
                    vec4 stateB = texture(u_tex, vUv - offset);
                    
                    float u = stateG.r;
                    float v = stateG.g;
                    float phase = stateG.b;
                    float trail = stateG.a;
                    
                    // Perceptual color mapping - Absolutely NO black or white
                    // L: 0.3 to 0.85 
                    float L = 0.35 + 0.3 * (1.0 - u) + 0.2 * v + 0.15 * trail;
                    L = clamp(L, 0.3, 0.85);
                    
                    // C: highly saturated, 0.15 to 0.35
                    float C = 0.18 + 0.15 * v + 0.08 * sin(phase * 6.283);
                    C = clamp(C, 0.15, 0.35);
                    
                    // Hue mapping
                    // Base: deep violet/cobalt (approx 4.5 rad) to teal (3.5 rad)
                    float baseH = 4.5 + 0.5 * sin(u_time * 0.1);
                    float h = baseH + 2.0 * v - 1.5 * trail + 0.8 * phase;
                    
                    // Gematria harmonic bands (UNDERLAYER = 12.3)
                    h += 0.4 * sin(length(p) * 12.3 - u_time);
                    
                    // Tessellation and Lace Topology Overlays
                    vec2 wp = p + 0.05 * vec2(sin(p.y * 5.0 + u_time * f_UNDERLAYER), cos(p.x * 5.0 - u_time * f_DREAM));
                    vec2 r_hex = vec2(1.0, 1.73205081);
                    vec2 h_hex = r_hex * 0.5;
                    
                    // Tessellation Edge
                    vec2 a = mod(wp * 3.0, r_hex) - h_hex;
                    vec2 b = mod(wp * 3.0 - h_hex, r_hex) - h_hex;
                    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
                    float edge = smoothstep(0.4, 0.5, length(gv));
                    
                    h = mix(h, 1.0, edge * 0.5); // Shift towards orange/gold
                    L = mix(L, 0.75, edge * 0.5);
                    
                    // Lace Mask
                    vec2 a_lace = mod(wp * 8.0, r_hex) - h_hex;
                    vec2 b_lace = mod(wp * 8.0 - h_hex, r_hex) - h_hex;
                    vec2 gv_lace = dot(a_lace, a_lace) < dot(b_lace, b_lace) ? a_lace : b_lace;
                    float d_lace = length(gv_lace) - 0.35;
                    float bridges = abs(gv_lace.x * gv_lace.y) - 0.015;
                    float lc = max(d_lace, -bridges);
                    float laceMask = smoothstep(0.05, 0.0, lc);
                    
                    // Apply lace mask to Color
                    L = mix(L, 0.8, laceMask * 0.3);
                    C = mix(C, 0.1, laceMask * 0.5);
                    h = mix(h, 2.5, laceMask * 0.5); // Shift towards acid green/cyan
                    
                    vec3 color = oklch_to_srgb(L, C, h);
                    
                    // Add Chromatic Aberration fringes from offset samples
                    color.r += stateR.g * 0.2;
                    color.b += stateB.g * 0.2;
                    
                    // Clamp to ensure absolutely no pure black/white/gray
                    color = clamp(color, 0.02, 0.98);
                    
                    fragColor = vec4(color, 1.0);
                }
            `
        });
        
        canvas.__three = { renderer, scene, camera, quad, simMat, compMat, fboA, fboB, flip: false, frame: 0, width: grid.width, height: grid.height };
    } catch (e) {
        console.error("Initialization failed:", e);
        return;
    }
}

const sys = canvas.__three;

// Handle canvas resize dynamically
if (sys.width !== grid.width || sys.height !== grid.height) {
    sys.width = grid.width;
    sys.height = grid.height;
    sys.renderer.setSize(grid.width, grid.height, false);
    sys.fboA.setSize(grid.width, grid.height);
    sys.fboB.setSize(grid.width, grid.height);
    sys.simMat.uniforms.u_res.value.set(grid.width, grid.height);
    sys.compMat.uniforms.u_res.value.set(grid.width, grid.height);
}

// Map inputs to uniforms
sys.simMat.uniforms.u_time.value = time;
sys.compMat.uniforms.u_time.value = time;
sys.simMat.uniforms.u_frame.value = sys.frame;

if (mouse.isPressed) {
    sys.simMat.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
} else {
    sys.simMat.uniforms.u_mouse.value.set(-1.0, -1.0);
}

// Ping-pong FBOs
const readFBO = sys.flip ? sys.fboB : sys.fboA;
const writeFBO = sys.flip ? sys.fboA : sys.fboB;

// Pass 1: Simulate RD + Attractors + Geometry
sys.quad.material = sys.simMat;
sys.simMat.uniforms.u_tex.value = readFBO.texture;
sys.renderer.setRenderTarget(writeFBO);
sys.renderer.render(sys.scene, sys.camera);

// Pass 2: Composite and Map to OKLab Colorspace
sys.quad.material = sys.compMat;
sys.compMat.uniforms.u_tex.value = writeFBO.texture;
sys.renderer.setRenderTarget(null);
sys.renderer.render(sys.scene, sys.camera);

// Iterate state
sys.flip = !sys.flip;
sys.frame++;