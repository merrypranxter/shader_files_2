if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        if (!renderer.capabilities.isWebGL2) throw new Error("WebGL 2 required");

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const sceneSim = new THREE.Scene();
        const sceneDisp = new THREE.Scene();

        const rtOpts = {
            type: THREE.HalfFloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            wrapS: THREE.RepeatWrapping,
            wrapT: THREE.RepeatWrapping,
            depthBuffer: false,
            stencilBuffer: false
        };
        
        const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);

        const simMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                uState: { value: rtA.texture },
                uTime: { value: 0 },
                uResolution: { value: new THREE.Vector2(grid.width, grid.height) },
                uMouse: { value: new THREE.Vector2(0.5, 0.5) },
                uMousePressed: { value: 0 }
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

                uniform sampler2D uState;
                uniform float uTime;
                uniform vec2 uResolution;
                uniform vec2 uMouse;
                uniform float uMousePressed;

                float hash(vec2 p) { 
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); 
                }

                // Log-Polar Cortical Dipole (Phosphene / Op Art)
                vec2 corticalDipole(vec2 z, float a, float b) {
                    vec2 za = z + vec2(a, 0.0);
                    vec2 zb = z + vec2(b, 0.0);
                    float denom = dot(zb, zb) + 1e-9;
                    vec2 q = vec2(dot(za, zb), za.y * zb.x - za.x * zb.y) / denom;
                    return vec2(0.5 * log(dot(q, q) + 1e-12), atan(q.y, q.x));
                }

                void main() {
                    vec2 px = 1.0 / uResolution;
                    
                    // Neighborhood sampling
                    vec4 C = texture(uState, vUv);
                    vec4 N = texture(uState, vUv + vec2(0.0, px.y));
                    vec4 S = texture(uState, vUv - vec2(0.0, px.y));
                    vec4 E = texture(uState, vUv + vec2(px.x, 0.0));
                    vec4 W = texture(uState, vUv - vec2(px.x, 0.0));
                    
                    // Laplacian (Diffusion & Lateral Suppression)
                    vec4 lap = N + S + E + W - 4.0 * C;
                    
                    // Cortical Dipole warping for vector field
                    vec2 centered = vUv * 2.0 - 1.0;
                    vec2 dipole = corticalDipole(centered, 0.1, 2.0);
                    
                    // Flow dynamics driven by structure
                    vec2 flow = vec2(cos(dipole.y), sin(dipole.y)) * 0.001 * C.a;
                    flow += vec2(lap.r, lap.g) * 0.005; 
                    
                    vec2 advUv = vUv - flow;
                    
                    // Chromatic Split Advection (Metamerism / Glitchcore)
                    vec2 shift = vec2(C.b - C.r, C.g - C.b) * 0.002;
                    vec4 advC;
                    advC.r = texture(uState, advUv + shift).r;
                    advC.g = texture(uState, advUv).g;
                    advC.b = texture(uState, advUv - shift).b;
                    advC.a = texture(uState, advUv).a;
                    
                    // Gray-Scott Reaction Diffusion (Morphogenesis)
                    float Da = 0.2, Db = 0.1;
                    float f = 0.055, k = 0.062;
                    float a = advC.r;
                    float b = advC.g;
                    float reaction = a * b * b;
                    
                    float newR = a + (Da * lap.r - reaction + f * (1.0 - a));
                    float newG = b + (Db * lap.g + reaction - (k + f) * b);
                    
                    // Continuous Abelian Sandpile Toppling (Self-Organized Criticality)
                    float topples = floor(advC.a / 4.0);
                    float inflow = floor(N.a/4.0) + floor(S.a/4.0) + floor(E.a/4.0) + floor(W.a/4.0);
                    float newA = advC.a - 4.0 * topples + inflow + 0.01; // Rain mode injection
                    
                    // Opponent Color Decay (Afterimage Painter)
                    float newB = mix(advC.b, 1.0 - newR, 0.02);
                    
                    // Interactive Perturbation
                    float dMouse = length(vUv - uMouse);
                    if (uMousePressed > 0.5 && dMouse < 0.03) {
                        newG = 1.0;
                        newA += 4.0;
                    }
                    
                    // Boundary Sink (prevents mass explosion)
                    bool isBoundary = vUv.x < px.x || vUv.x > 1.0 - px.x || vUv.y < px.y || vUv.y > 1.0 - px.y;
                    if (isBoundary) newA = 0.0;
                    
                    // Initialization Spores
                    if(C.r == 0.0 && C.g == 0.0 && C.b == 0.0 && C.a == 0.0) {
                        newR = 1.0;
                        newG = hash(vUv * 1.1) > 0.99 ? 1.0 : 0.0;
                        newA = hash(vUv * 2.2) * 4.0;
                        newB = 0.0;
                    }
                    
                    fragColor = vec4(clamp(newR, 0.0, 1.0), clamp(newG, 0.0, 1.0), clamp(newB, 0.0, 1.0), max(0.0, newA));
                }
            `
        });

        const dispMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                uState: { value: rtA.texture },
                uTime: { value: 0 },
                uResolution: { value: new THREE.Vector2(grid.width, grid.height) }
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

                uniform sampler2D uState;
                uniform float uTime;
                uniform vec2 uResolution;

                // Spectral Color Multi-Lobe Gaussian Fit (CIE 1931)
                float lobe(float l, float alpha, float mu, float sL, float sR) {
                    float t = (l - mu) / (l < mu ? sL : sR);
                    return alpha * exp(-0.5 * t * t);
                }
                float cmfX(float l) { return lobe(l, 1.056, 599.8, 37.9, 31.0) + lobe(l, 0.362, 442.0, 16.0, 26.7) + lobe(l, -0.065, 501.1, 20.4, 26.2); }
                float cmfY(float l) { return lobe(l, 0.821, 568.8, 46.9, 40.5) + lobe(l, 0.286, 530.9, 16.3, 31.1); }
                float cmfZ(float l) { return lobe(l, 1.217, 437.0, 11.8, 36.0) + lobe(l, 0.681, 459.0, 26.0, 13.8); }

                vec3 xyzToLinearRGB(vec3 xyz) {
                    return vec3(
                        3.2406 * xyz.x - 1.5372 * xyz.y - 0.4986 * xyz.z,
                       -0.9689 * xyz.x + 1.8758 * xyz.y + 0.0415 * xyz.z,
                        0.0557 * xyz.x - 0.2040 * xyz.y + 1.0570 * xyz.z
                    );
                }

                vec3 wavelengthToRGB(float lambda) {
                    vec3 rgb = xyzToLinearRGB(vec3(cmfX(lambda), cmfY(lambda), cmfZ(lambda)));
                    float lift = min(min(rgb.r, rgb.g), min(rgb.b, 0.0));
                    rgb -= lift;
                    float denom = max(max(rgb.r, rgb.g), max(rgb.b, 1e-6));
                    return pow(clamp(rgb / denom, 0.0, 1.0), vec3(1.0/2.4));
                }

                // Voronoi Cellular Domains (Opal / Cuttlefish)
                vec2 hash2(vec2 p) {
                    p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
                    return fract(sin(p)*43758.5453);
                }

                float voronoi(vec2 x) {
                    vec2 n = floor(x);
                    vec2 f = fract(x);
                    float res = 8.0;
                    for(int j=-1; j<=1; j++)
                    for(int i=-1; i<=1; i++) {
                        vec2 g = vec2(float(i),float(j));
                        vec2 o = hash2(n + g);
                        o = 0.5 + 0.5*sin(uTime + 6.2831*o);
                        vec2 r = g + o - f;
                        float d = dot(r,r);
                        res = min(res, d);
                    }
                    return sqrt(res);
                }

                // Moiré / Halftone Tension (Glitch Textiles)
                float halftone(vec2 uv, float luma, float freq) {
                    vec2 cell = fract(uv * freq) - 0.5;
                    float dist = length(cell);
                    return smoothstep(luma * 0.7 + 0.1, luma * 0.7 - 0.1, dist);
                }

                void main() {
                    vec4 state = texture(uState, vUv);
                    
                    // Maximalist Acid Palettes (Psychedelic Collage / Glitchcore)
                    vec3 hotPink = vec3(1.0, 0.0, 0.5);
                    vec3 acidGreen = vec3(0.6, 1.0, 0.0);
                    vec3 electricCyan = vec3(0.0, 1.0, 1.0);
                    vec3 neonYellow = vec3(1.0, 0.9, 0.0);
                    vec3 ultraviolet = vec3(0.4, 0.0, 1.0);
                    
                    // Wavelength mapping driven by Sandpile accumulation
                    float lambda = mix(380.0, 700.0, fract(state.a * 0.2 + state.r));
                    vec3 spec = wavelengthToRGB(lambda);
                    
                    vec3 baseColor = mix(state.rgb, spec, 0.7);
                    
                    // Structural Voronoi mapping
                    float v = voronoi(vUv * 8.0 + state.rg * 2.0);
                    
                    // Palette Hierarchy
                    vec3 col = baseColor;
                    if (state.a > 1.0) col = mix(col, hotPink, v);
                    if (state.a > 2.0) col = mix(col, acidGreen, 1.0 - v);
                    if (state.a > 3.0) col = mix(col, neonYellow, state.b);
                    if (state.a > 3.5) col = mix(col, ultraviolet, 0.5);
                    
                    // Moiré Interference & Halftone
                    float luma = dot(col, vec3(0.299, 0.587, 0.114));
                    float ht = halftone(vUv + state.rg * 0.02, luma, 150.0);
                    
                    // Macroblocking / Codec Damage (Damage Aesthetics)
                    vec2 blockUv = floor(vUv * 40.0) / 40.0;
                    float blockNoise = fract(sin(dot(blockUv, vec2(41.3, 289.1))) * 43758.5453);
                    if(blockNoise > 0.985) {
                        col = vec3(1.0) - col; // XOR glitch rupture
                    }
                    
                    // XOR-Ghost Manifold (Alchemical Scripture W-10)
                    ivec2 ipx = ivec2(vUv * uResolution);
                    if (((ipx.x ^ ipx.y) & 127) == 0) {
                        col = mix(col, electricCyan, 0.4);
                    }
                    
                    // CRT Scanlines
                    float scanline = sin(vUv.y * 800.0) * 0.1 + 0.9;
                    col *= scanline;
                    
                    col = mix(col, col * ht, 0.25);
                    
                    // Opponent Color Decay Masking (Afterimage Painter)
                    col = mix(col, vec3(1.0) - col, state.b * 0.15);
                    
                    // Chromatic Aberration & Volumetric Bloom Sampling
                    vec2 px = 1.0 / uResolution;
                    vec3 bloom = vec3(0.0);
                    float wSum = 0.0;
                    for(int i=-3; i<=3; i++) {
                        for(int j=-3; j<=3; j++) {
                            float w = exp(-float(i*i + j*j)/8.0);
                            vec4 s = texture(uState, vUv + vec2(i,j)*px*3.0);
                            bloom += s.rgb * w;
                            wSum += w;
                        }
                    }
                    bloom /= wSum;
                    
                    // Luminous edge highlights (Phosphene / Glitchcore Bloom)
                    float edge = abs(v - 0.5) * 2.0;
                    col += bloom * 0.6;
                    col += electricCyan * smoothstep(0.8, 1.0, edge) * state.a * 0.4;
                    
                    // Organic Vignette
                    float vig = length(vUv - 0.5);
                    col *= smoothstep(0.9, 0.3, vig);
                    
                    fragColor = vec4(col, 1.0);
                }
            `
        });

        const meshSim = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMat);
        sceneSim.add(meshSim);

        const meshDisp = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dispMat);
        sceneDisp.add(meshDisp);

        canvas.__three = { renderer, camera, sceneSim, sceneDisp, simMat, dispMat, rtA, rtB, rtOpts };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        throw e;
    }
}

let { renderer, camera, sceneSim, sceneDisp, simMat, dispMat, rtA, rtB } = canvas.__three;

if (rtA.width !== grid.width || rtA.height !== grid.height) {
    rtA.setSize(grid.width, grid.height);
    rtB.setSize(grid.width, grid.height);
    simMat.uniforms.uResolution.value.set(grid.width, grid.height);
    dispMat.uniforms.uResolution.value.set(grid.width, grid.height);
    renderer.setSize(grid.width, grid.height, false);
}

simMat.uniforms.uTime.value = time;
dispMat.uniforms.uTime.value = time;

const mx = mouse.x / grid.width;
const my = 1.0 - (mouse.y / grid.height);
simMat.uniforms.uMouse.value.set(mx, my);
simMat.uniforms.uMousePressed.value = mouse.isPressed ? 1.0 : 0.0;

// Multi-pass execution for Reaction-Diffusion and Sandpile acceleration
const passes = 4;
for (let i = 0; i < passes; i++) {
    simMat.uniforms.uState.value = rtA.texture;
    renderer.setRenderTarget(rtB);
    renderer.render(sceneSim, camera);
    
    // Ping-pong swap
    let temp = rtA;
    rtA = rtB;
    rtB = temp;
}
canvas.__three.rtA = rtA;
canvas.__three.rtB = rtB;

// Display Pass
dispMat.uniforms.uState.value = rtA.texture;
renderer.setRenderTarget(null);
renderer.render(sceneDisp, camera);