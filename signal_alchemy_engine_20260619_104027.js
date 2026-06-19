try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas: canvas, context: ctx, alpha: true, antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Ping-pong buffers for temporal feedback (Datamosh, Slit-scan, Persistence)
        const rtOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType, // Better precision for feedback
            depthBuffer: false,
            stencilBuffer: false
        };
        const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
        const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

        // --- SHADER CHUNKS ---

        const oklabFns = `
            // OKLab conversions for perceptually uniform color math
            vec3 linearSRGB_to_OKLab(vec3 c) {
                float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
                float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
                float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
                float l_ = pow(l, 1.0/3.0);
                float m_ = pow(m, 1.0/3.0);
                float s_ = pow(s, 1.0/3.0);
                return vec3(
                    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
                    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
                    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
                );
            }
            vec3 OKLab_to_linearSRGB(vec3 c) {
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
            float sRGB_to_linear(float x) { return x <= 0.04045 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4); }
            float linear_to_sRGB(float x) { return x <= 0.0031308 ? x * 12.92 : 1.055 * pow(x, 1.0/2.4) - 0.055; }
            vec3 sRGB_to_OKLab(vec3 c) { return linearSRGB_to_OKLab(vec3(sRGB_to_linear(c.r), sRGB_to_linear(c.g), sRGB_to_linear(c.b))); }
            vec3 OKLab_to_sRGB(vec3 c) { vec3 lin = OKLab_to_linearSRGB(c); return vec3(linear_to_sRGB(lin.r), linear_to_sRGB(lin.g), linear_to_sRGB(lin.b)); }
            vec3 oklabMix(vec3 a, vec3 b, float t) { return OKLab_to_sRGB(mix(sRGB_to_OKLab(a), sRGB_to_OKLab(b), t)); }
        `;

        const noiseFns = `
            float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
            float noise(vec2 p) {
                vec2 i = floor(p), f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                           mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
            }
            mat2 rot(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }
        `;

        // --- PASS 1: ENGINE (Fractal, UI, Caustics, Slit-Scan, Datamosh, VHS) ---
        const engineMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_history: { value: null }
            },
            vertexShader: `
                out vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform sampler2D u_history;

                ${noiseFns}

                // --- SDFs & Geometry ---
                float sdBox(vec2 p, vec2 b) { vec2 d = abs(p)-b; return length(max(d,0.0)) + min(max(d.x,d.y),0.0); }
                
                // Mandelbox fold
                void boxFold(inout vec3 z, vec3 r) { z = clamp(z, -r, r) * 2.0 - z; }
                void sphereFold(inout vec3 z, float minR, float maxR) {
                    float r2 = dot(z,z);
                    if(r2 < minR) z *= maxR/minR; else if(r2 < maxR) z *= maxR/r2;
                }
                
                // Central Oracle (Fractal DE)
                vec2 oracleDE(vec3 pos) {
                    vec3 z = pos;
                    float dr = 1.0;
                    float scale = 2.2 + sin(u_time*0.2)*0.2;
                    for(int i=0; i<6; i++) {
                        boxFold(z, vec3(1.0));
                        sphereFold(z, 0.2, 1.0);
                        z = scale * z + pos;
                        dr = dr * abs(scale) + 1.0;
                    }
                    float dist = length(z) / abs(dr);
                    // Add some structural rotation
                    z.xy *= rot(u_time*0.1);
                    return vec2(dist, length(z)); // dist, trap
                }

                vec3 getNormal(vec3 p) {
                    vec2 e = vec2(0.001, 0);
                    return normalize(vec3(
                        oracleDE(p + e.xyy).x - oracleDE(p - e.xyy).x,
                        oracleDE(p + e.yxy).x - oracleDE(p - e.yxy).x,
                        oracleDE(p + e.yyx).x - oracleDE(p - e.yyx).x
                    ));
                }

                // Caustic Voronoi network
                float voronoi(vec3 x) {
                    vec3 p = floor(x), f = fract(x);
                    float res = 100.0;
                    for(int k=-1; k<=1; k++)
                    for(int j=-1; j<=1; j++)
                    for(int i=-1; i<=1; i++) {
                        vec3 b = vec3(float(i), float(j), float(k));
                        vec3 r = vec3(b) - f + vec3(hash(p + b.xy), hash(p + b.yz), hash(p + b.zx));
                        float d = dot(r, r);
                        res = min(res, d);
                    }
                    return sqrt(res);
                }

                void main() {
                    vec2 uv = vUv;
                    vec2 p = (uv - 0.5) * 2.0;
                    p.x *= u_resolution.x / u_resolution.y;

                    // 1. VHS Tracking & Time Jitter
                    float t = u_time;
                    float tracking = step(0.9, fract(uv.y * 2.0 - t * 0.5 + noise(vec2(t))));
                    vec2 vhsUV = uv;
                    vhsUV.x += tracking * (noise(vec2(uv.y * 50.0, t)) - 0.5) * 0.05;
                    
                    // 2. Raymarch Central Oracle
                    vec3 ro = vec3(0.0, 0.0, -3.0);
                    vec3 rd = normalize(vec3(p, 1.5));
                    float d = 0.0, trap = 0.0;
                    vec3 pObj;
                    for(int i=0; i<64; i++) {
                        pObj = ro + rd * d;
                        pObj.xy *= rot(t*0.1);
                        pObj.yz *= rot(t*0.15);
                        vec2 res = oracleDE(pObj);
                        if(res.x < 0.001 || d > 6.0) { trap = res.y; break; }
                        d += res.x;
                    }

                    vec3 color = vec3(0.0);
                    float alpha = 0.0;

                    if(d < 6.0) {
                        // Structural Color (Thin Film) based on normal and viewing angle
                        vec3 n = getNormal(pObj);
                        float viewAngle = max(0.0, dot(n, -rd));
                        float thickness = 400.0 + trap * 100.0 + noise(pObj.xy*5.0)*200.0;
                        float pathDiff = 2.0 * 1.5 * thickness * viewAngle; // n_film = 1.5
                        
                        // Fake spectral interference
                        color.r = 0.5 + 0.5 * cos((pathDiff / 600.0) * 6.28);
                        color.g = 0.5 + 0.5 * cos((pathDiff / 500.0) * 6.28);
                        color.b = 0.5 + 0.5 * cos((pathDiff / 400.0) * 6.28);
                        
                        // Edge bloom
                        color += pow(1.0 - viewAngle, 3.0) * vec3(1.0, 0.2, 0.8);
                        alpha = 1.0;
                    } else {
                        // Active Field: Caustic Network
                        float c = voronoi(vec3(p * 3.0, t * 0.5));
                        c = pow(1.0 - c, 4.0); // sharp ridges
                        color = vec3(c * 0.8, c * 0.2, c * 1.0) * (1.0 - length(p)*0.3);
                        alpha = c * 0.5;
                    }

                    // 3. Early Internet UI Shards (Abstract)
                    vec2 uiP = uv - 0.5;
                    uiP.x += sin(t*0.5)*0.1;
                    float box1 = sdBox(uiP - vec2(0.2, 0.3), vec2(0.15, 0.05));
                    float box2 = sdBox(uiP - vec2(-0.3, -0.2), vec2(0.1, 0.2));
                    if(box1 < 0.0 && box1 > -0.01) color += vec3(0.0, 1.0, 0.5); // Bevel edge
                    if(box2 < 0.0) {
                        color = mix(color, vec3(1.0, 0.0, 0.5), 0.5 + 0.5*sin(uv.y*50.0 - t*10.0)); // Scanline fill
                    }

                    // 4. Temporal Feedback (Slit-Scan & Datamosh)
                    vec4 hist = texture(u_history, vhsUV);
                    
                    // Datamosh: Advect based on spatial gradient of history
                    vec2 flow = vec2(
                        texture(u_history, vhsUV + vec2(0.01, 0.0)).r - texture(u_history, vhsUV - vec2(0.01, 0.0)).r,
                        texture(u_history, vhsUV + vec2(0.0, 0.01)).r - texture(u_history, vhsUV - vec2(0.0, 0.01)).r
                    );
                    vec2 advectUV = vhsUV - flow * 0.02 * sin(t);
                    vec4 moshHist = texture(u_history, advectUV);

                    // Slit-scan: Delay blending based on radial distance
                    float delay = smoothstep(0.0, 1.0, length(p));
                    float blendFactor = mix(0.1, 0.95, delay); // Keep history longer at edges
                    
                    // Inject fresh color into history
                    vec3 finalCol = mix(color, moshHist.rgb, blendFactor);
                    
                    // Prevent total wash-out
                    if(noise(vec2(t*2.0, uv.y)) > 0.98) finalCol = color; // Frame refresh

                    fragColor = vec4(finalCol, 1.0);
                }
            `
        });

        // --- PASS 2: PRINT & ALCHEMY (Cross-Process, Riso, Halftone, Palette Law) ---
        const renderMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_engineTex: { value: null }
            },
            vertexShader: `
                out vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform sampler2D u_engineTex;

                ${oklabFns}
                ${noiseFns}

                // ABSOLUTE COLOR LAW: Get Safe Full-Color (No Black, No White)
                vec3 getSafeColor(float t) {
                    // Shadows: Saturated Indigo/Plum
                    vec3 c0 = vec3(0.15, 0.0, 0.3); // Deep plum
                    vec3 c1 = vec3(0.0, 0.2, 0.5);  // Cobalt/Petrol
                    // Mids: Hot Pink, Orange, Cyan
                    vec3 c2 = vec3(1.0, 0.0, 0.4);  // Hot Pink
                    vec3 c3 = vec3(0.0, 0.9, 0.7);  // Turquoise/Cyan
                    // Highs: Acid Yellow, Neon Green (No White)
                    vec3 c4 = vec3(0.8, 1.0, 0.0);  // Acid Yellow
                    vec3 c5 = vec3(0.0, 1.0, 0.2);  // Neon Green

                    t = clamp(t, 0.0, 1.0);
                    // Remap to ensure we never hit pure 0 or 1 luminance equivalent
                    if (t < 0.2) return oklabMix(c0, c1, t/0.2);
                    if (t < 0.4) return oklabMix(c1, c2, (t-0.2)/0.2);
                    if (t < 0.6) return oklabMix(c2, c3, (t-0.4)/0.2);
                    if (t < 0.8) return oklabMix(c3, c4, (t-0.6)/0.2);
                    return oklabMix(c4, c5, (t-0.8)/0.2);
                }

                void main() {
                    vec2 uv = vUv;
                    float t = u_time;

                    // 1. Physical Chromatic Aberration (Radial Dispersion)
                    vec2 p = uv - 0.5;
                    float dist = length(p);
                    vec2 dir = normalize(p);
                    float caStrength = 0.02 * pow(dist, 2.0); // Stronger at edges
                    
                    float r = texture(u_engineTex, uv + dir * caStrength).r;
                    float g = texture(u_engineTex, uv).g;
                    float b = texture(u_engineTex, uv - dir * caStrength).b;
                    vec3 rawColor = vec3(r, g, b);

                    // 2. Risograph / Halftone Mosaic
                    float luma = dot(rawColor, vec3(0.299, 0.587, 0.114));
                    
                    // Halftone dot size based on luma
                    float freq = 150.0;
                    vec2 rotUV = rot(0.2) * uv; // Screen angle
                    float dotPattern = sin(rotUV.x * freq) * sin(rotUV.y * freq);
                    float halftone = smoothstep(0.0, 0.2, dotPattern + (luma * 2.0 - 1.0));
                    
                    // Riso Misregistration: slight random offset per channel
                    vec2 mOff = vec2(noise(vec2(t)), noise(vec2(t+1.0))) * 0.005;
                    float r_riso = texture(u_engineTex, uv + mOff).r;
                    
                    // Multiply blend style (subtractive) logic mixed with additive
                    float mixLuma = mix(luma, halftone * r_riso, 0.3);

                    // 3. Cross-Processing & Absolute Color Law
                    // Force the raw luminance through our strict OkLab perceptual palette
                    // Add some noise to dither and prevent banding
                    float grain = (hash(uv + t) - 0.5) * 0.1;
                    vec3 finalColor = getSafeColor(mixLuma + grain);

                    // 4. Edge Damage (Vignette but colored)
                    float vignette = 1.0 - smoothstep(0.5, 1.5, dist);
                    // Instead of going to black, blend toward a deep saturated shadow color
                    finalColor = oklabMix(vec3(0.1, 0.0, 0.3), finalColor, vignette);

                    fragColor = vec4(finalColor, 1.0);
                }
            `
        });

        const quadGeo = new THREE.PlaneGeometry(2, 2);
        const engineMesh = new THREE.Mesh(quadGeo, engineMat);
        const renderMesh = new THREE.Mesh(quadGeo, renderMat);
        
        // We use two scenes to separate the compute/feedback step from the final render
        const engineScene = new THREE.Scene();
        engineScene.add(engineMesh);
        
        const renderScene = new THREE.Scene();
        renderScene.add(renderMesh);

        canvas.__three = { 
            renderer, 
            engineScene, 
            renderScene, 
            camera, 
            engineMat, 
            renderMat,
            rtA,
            rtB,
            swap: false
        };
    }

    const { renderer, engineScene, renderScene, camera, engineMat, renderMat, rtA, rtB } = canvas.__three;

    // Update dimensions
    if (renderer.getSize(new THREE.Vector2()).x !== grid.width || renderer.getSize(new THREE.Vector2()).y !== grid.height) {
        renderer.setSize(grid.width, grid.height, false);
        rtA.setSize(grid.width, grid.height);
        rtB.setSize(grid.width, grid.height);
        if (engineMat.uniforms.u_resolution) engineMat.uniforms.u_resolution.value.set(grid.width, grid.height);
        if (renderMat.uniforms.u_resolution) renderMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    }

    // Ping-Pong Feedback Logic
    const readBuffer = canvas.__three.swap ? rtB : rtA;
    const writeBuffer = canvas.__three.swap ? rtA : rtB;

    // 1. Update Engine Uniforms & Render to Write Buffer
    if (engineMat.uniforms.u_time) engineMat.uniforms.u_time.value = time;
    if (engineMat.uniforms.u_history) engineMat.uniforms.u_history.value = readBuffer.texture;
    
    renderer.setRenderTarget(writeBuffer);
    renderer.render(engineScene, camera);

    // 2. Update Render Uniforms & Render to Screen
    if (renderMat.uniforms.u_time) renderMat.uniforms.u_time.value = time;
    if (renderMat.uniforms.u_engineTex) renderMat.uniforms.u_engineTex.value = writeBuffer.texture;
    
    renderer.setRenderTarget(null); // Screen
    renderer.render(renderScene, camera);

    // Swap buffers for next frame
    canvas.__three.swap = !canvas.__three.swap;

} catch (e) {
    console.error("Signal Alchemy Engine Failure:", e);
}