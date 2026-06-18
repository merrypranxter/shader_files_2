try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const rtOpts = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            depthBuffer: false,
            stencilBuffer: false
        };

        const fboA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const fboB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const sceneSim = new THREE.Scene();
        const sceneRender = new THREE.Scene();
        const planeGeo = new THREE.PlaneGeometry(2, 2);

        const simVert = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        const simFrag = `
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform sampler2D u_buffer;
            uniform vec2 u_resolution;
            uniform float u_time;
            uniform vec2 u_attractors[5];
            
            // Gematria seeds
            const float BLOOM = 55.0;
            const float RESONANCE = 95.0;
            
            // Curl noise for advection
            vec2 hash22(vec2 p) {
                p = fract(p * vec2(127.1, 311.7));
                p += dot(p, p + 19.19);
                return fract(p.x * p.y);
            }
            float noise(vec2 p) {
                vec2 i = floor(p), f = fract(p);
                vec2 u = f*f*(3.0-2.0*f);
                return mix(mix(hash22(i), hash22(i+vec2(1.0,0.0)), u.x),
                           mix(hash22(i+vec2(0.0,1.0)), hash22(i+vec2(1.0,1.0)), u.x), u.y);
            }
            float psi(vec2 uv, float t) {
                return 1.0 * noise(uv * 3.0 + t * 0.1) + 0.3 * noise(uv * 8.0 - t * 0.2);
            }

            void main() {
                vec2 texel = 1.0 / u_resolution;
                
                // Advection via curl noise (Dream Physics)
                float eps = 0.01;
                float psi_up   = psi(vUv + vec2(0.0, eps), u_time);
                float psi_down = psi(vUv - vec2(0.0, eps), u_time);
                float psi_r    = psi(vUv + vec2(eps, 0.0), u_time);
                float psi_l    = psi(vUv - vec2(eps, 0.0), u_time);
                vec2 vel = vec2(psi_up - psi_down, -(psi_r - psi_l)) / (2.0 * eps);
                
                vec2 advectedUv = vUv - vel * 0.002;
                
                vec4 center = texture(u_buffer, advectedUv);
                vec4 left   = texture(u_buffer, fract(advectedUv - vec2(texel.x, 0.0)));
                vec4 right  = texture(u_buffer, fract(advectedUv + vec2(texel.x, 0.0)));
                vec4 up     = texture(u_buffer, fract(advectedUv + vec2(0.0, texel.y)));
                vec4 down   = texture(u_buffer, fract(advectedUv - vec2(0.0, texel.y)));
                
                float u = center.r;
                float v = center.g;
                
                // Laplacian
                float lapU = (left.r + right.r + up.r + down.r) - 4.0 * u;
                float lapV = (left.g + right.g + up.g + down.g) - 4.0 * v;
                
                // Gray-Scott Reaction-Diffusion (Bioluminescent Labyrinth)
                float uvv = u * v * v;
                float f = 0.022 + 0.015 * sin(u_time * 0.2 + vUv.x * 5.0); // Modulated by BLOOM
                float k = 0.051 + 0.005 * cos(u_time * 0.15);
                
                float du = 0.16 * lapU - uvv + f * (1.0 - u);
                float dv = 0.08 * lapV + uvv - (f + k) * v;
                
                float uNext = clamp(u + du, 0.0, 1.0);
                float vNext = clamp(v + dv, 0.0, 1.0);
                
                // Inject Strange Attractors (Clifford)
                float inject = 0.0;
                for(int i=0; i<5; i++) {
                    vec2 aPos = u_attractors[i] * 0.3 + 0.5; // map to 0-1
                    float d = length(vUv - aPos);
                    inject += exp(-d * d * 5000.0);
                }
                
                vNext = clamp(vNext + inject * 0.5, 0.0, 1.0);
                uNext = clamp(uNext - inject * 0.2, 0.0, 1.0);
                
                // Initialization
                if (u_time < 0.1) {
                    uNext = 1.0;
                    vNext = (length(vUv - 0.5) < 0.05) ? 1.0 : 0.0;
                }
                
                fragColor = vec4(uNext, vNext, vel.x, vel.y);
            }
        `;

        const renderFrag = `
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform sampler2D u_fluid;
            uniform vec2 u_resolution;
            uniform float u_time;
            
            // Gematria Seeds
            const float UNDERLAYER = 121.0;
            const float BLOOM = 55.0;
            const float CASKET = 55.0;
            const float RESONANCE = 95.0;
            const float LACE = 21.0;
            const float ANU = 36.0;
            const float COLOR = 59.0;
            const float PI = 3.14159265359;
            
            // OKLCh to sRGB (Perceptual Color Math)
            vec3 oklch_to_srgb(float L, float C, float h) {
                float h_rad = h * PI / 180.0;
                float a = C * cos(h_rad);
                float b = C * sin(h_rad);
                
                float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
                float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
                float s_ = L - 0.0894841775 * a - 1.2914855480 * b;
                
                float l = l_*l_*l_;
                float m = m_*m_*m_;
                float s = s_*s_*s_;
                
                vec3 rgb = vec3(
                     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                );
                
                // Linear to sRGB Gamma
                vec3 srgb;
                for(int i=0; i<3; i++) {
                    srgb[i] = rgb[i] <= 0.0031308 ? rgb[i] * 12.92 : 1.055 * pow(clamp(rgb[i], 0.0, 1.0), 1.0/2.4) - 0.055;
                }
                return srgb;
            }

            // Hexagonal Tessellation
            vec4 getHex(vec2 p) {
                vec2 s = vec2(1.0, 1.7320508);
                vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
                vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
                return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw);
            }

            // Apollonian Gasket Inversion
            vec3 apollonian(vec2 p) {
                float scale = 1.0;
                float iter = 0.0;
                float d = 1000.0;
                for(int i=0; i<4; i++) {
                    p = -1.0 + 2.0 * fract(p * 0.5 + 0.5);
                    float r2 = dot(p, p);
                    float k = (RESONANCE / 75.0) / r2; // Gematria resonance fold
                    p *= k;
                    scale *= k;
                    iter += 1.0;
                    d = min(d, (length(p) - 0.5) / scale);
                    if(r2 > 1.0) break;
                }
                return vec3(d, iter, scale);
            }

            // FBM for DLA Dendrites
            float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
            float fbm(vec2 p) {
                float f = 0.0, a = 0.5;
                for(int i=0; i<4; i++) {
                    vec2 i_p = floor(p), f_p = fract(p);
                    vec2 u = f_p*f_p*(3.0-2.0*f_p);
                    float n = mix(mix(hash(i_p), hash(i_p+vec2(1.0,0.0)), u.x),
                                  mix(hash(i_p+vec2(0.0,1.0)), hash(i_p+vec2(1.0,1.0)), u.x), u.y);
                    f += n * a; p *= 2.0; a *= 0.5;
                }
                return f;
            }

            void main() {
                vec2 uv = (vUv - 0.5) * u_resolution / min(u_resolution.x, u_resolution.y);
                
                // Read Bioluminescent Fluid
                vec4 fluid = texture(u_fluid, vUv);
                float u = fluid.r; // Activator
                float v = fluid.g; // Inhibitor (Glowing coral)
                
                // Dream Physics Warp
                vec2 warp = uv + 0.05 * vec2(fluid.b, fluid.a) + 0.02 * sin(uv.yx * 10.0 + u_time);
                
                // Tessellation Space
                float zoom = 3.0 + sin(u_time * 0.1);
                vec4 hex = getHex(warp * zoom);
                vec2 hUv = hex.xy;
                vec2 hId = hex.zw;
                
                // Apollonian Casket
                vec3 ap = apollonian(hUv * 2.0);
                float apDist = ap.x;
                float apIter = ap.y;
                
                // Lace Topology
                float angle = atan(hUv.y, hUv.x);
                float scallop = sin(angle * LACE + u_time) * 0.03;
                float laceMask = smoothstep(0.01, 0.005, abs(length(hUv) - 0.45 + scallop));
                float innerLace = smoothstep(0.005, 0.0, abs(apDist) - 0.002);
                
                // DLA Clustering (Dendrites)
                float dlaNoise = fbm(hUv * ANU + u_time * 0.2 - hId * 10.0);
                float dendrite = smoothstep(0.65, 0.75, dlaNoise) * exp(-length(hUv) * 4.0);
                
                // Chromatic Assembly (Strictly NO BLACK, NO WHITE, NO NEUTRALS)
                // Base hue driven by fluid and hex ID
                float H = 260.0 + 80.0 * v + 30.0 * sin(hId.x * 12.3 + hId.y * 45.6) + u_time * 15.0;
                
                // Highlights from Lace, DLA, and Apollonian depth
                float highlight = max(laceMask, max(innerLace, dendrite));
                float depth = apIter / 4.0;
                
                // Shift hue drastically for highlights (Neon Lemon, Acid Green, Hot Pink)
                H += highlight * BLOOM;
                H -= depth * LACE;
                
                // Lightness: Clamp to avoid black/white
                float L = 0.35 + 0.25 * u + 0.25 * highlight + 0.1 * v;
                L = clamp(L, 0.25, 0.85); // Ensures deep colored shadows and colored highlights
                
                // Chroma: Always highly saturated
                float C = 0.2 + 0.1 * v + 0.05 * highlight;
                C = clamp(C, 0.15, 0.35); // Prevents grayscale
                
                // Convert OKLCh to sRGB
                vec3 color = oklch_to_srgb(L, C, H);
                
                // Tinted Bloom / Temporal Glow
                vec3 bloomColor = oklch_to_srgb(clamp(L+0.1, 0.3, 0.8), C, H + 40.0);
                color += bloomColor * v * 0.6;
                color += oklch_to_srgb(0.7, 0.25, H - 90.0) * dendrite * 0.8;
                
                fragColor = vec4(color, 1.0);
            }
        `;

        const simMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_buffer: { value: null },
                u_resolution: { value: new THREE.Vector2() },
                u_time: { value: 0 },
                u_attractors: { value: [...Array(5)].map(() => new THREE.Vector2()) }
            },
            vertexShader: simVert,
            fragmentShader: simFrag
        });

        const renderMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_fluid: { value: null },
                u_resolution: { value: new THREE.Vector2() },
                u_time: { value: 0 }
            },
            vertexShader: simVert,
            fragmentShader: renderFrag
        });

        const meshSim = new THREE.Mesh(planeGeo, simMaterial);
        sceneSim.add(meshSim);

        const meshRender = new THREE.Mesh(planeGeo, renderMaterial);
        sceneRender.add(meshRender);

        canvas.__three = {
            renderer, fboA, fboB, simMaterial, renderMaterial,
            sceneSim, sceneRender, camera,
            attractors: [...Array(5)].map(() => new THREE.Vector2()),
            frameCount: 0
        };
    }

    const t = canvas.__three;
    t.renderer.setSize(grid.width, grid.height, false);
    
    if(t.simMaterial && t.simMaterial.uniforms) {
        t.simMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
        t.simMaterial.uniforms.u_time.value = time;
        
        // Update Clifford Attractors
        let a = 1.7, b = 1.7, c = 0.6, d = 1.2;
        for(let i=0; i<5; i++) {
            let pt = t.attractors[i];
            if (t.frameCount === 0) {
                pt.x = (Math.random() - 0.5) * 2.0;
                pt.y = (Math.random() - 0.5) * 2.0;
            }
            let nx = Math.sin(a * pt.y) + c * Math.cos(a * pt.x);
            let ny = Math.sin(b * pt.x) + d * Math.cos(b * pt.y);
            pt.x = nx; pt.y = ny;
        }
        t.simMaterial.uniforms.u_attractors.value = t.attractors;
        t.simMaterial.uniforms.u_buffer.value = t.fboA.texture;
    }

    t.renderer.setRenderTarget(t.fboB);
    t.renderer.render(t.sceneSim, t.camera);

    let temp = t.fboA;
    t.fboA = t.fboB;
    t.fboB = temp;

    if(t.renderMaterial && t.renderMaterial.uniforms) {
        t.renderMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
        t.renderMaterial.uniforms.u_time.value = time;
        t.renderMaterial.uniforms.u_fluid.value = t.fboA.texture;
    }

    t.renderer.setRenderTarget(null);
    t.renderer.render(t.sceneRender, t.camera);

    t.frameCount++;

} catch (e) {
    console.error("WebGL Initialization Failed:", e);
}