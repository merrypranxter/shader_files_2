try {
    if (!ctx) throw new Error("WebGL context not available");
    if (typeof THREE === "undefined") throw new Error("Three.js not available");

    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // FBO Setup for Ping-Ponging
        const fboOpts = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType
        };

        const fbo_ca_A = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOpts);
        const fbo_ca_B = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOpts);
        const fbo_render = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOpts);
        const fbo_mosh_A = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOpts);
        const fbo_mosh_B = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOpts);

        const commonVert = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        // 1. CELLULAR AUTOMATA SHADER (The Machine Mind)
        const caFrag = `
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D u_state;
            uniform vec2 u_res;
            uniform float u_time;

            void main() {
                vec2 texel = 1.0 / u_res;
                float val = texture(u_state, vUv).r;
                
                float sum = 0.0;
                for(int y = -1; y <= 1; y++) {
                    for(int x = -1; x <= 1; x++) {
                        if(x == 0 && y == 0) continue;
                        sum += texture(u_state, fract(vUv + vec2(x, y) * texel)).r;
                    }
                }

                // Continuous CA rule for crystalline logic blooms
                float growth = smoothstep(1.5, 3.0, sum) * smoothstep(4.5, 3.0, sum);
                float decay = 0.06;
                float nextVal = val + growth * 0.15 - decay;

                // Occasional seeding to keep it alive
                float seed = step(0.9995, fract(sin(dot(vUv, vec2(12.9898, 78.233)) + u_time) * 43758.5453));
                nextVal = max(nextVal, seed);

                fragColor = vec4(clamp(nextVal, 0.0, 1.0), 0.0, 0.0, 1.0);
            }
        `;

        // 2. RAYMARCH SHADER (Dream-Physics Architecture & Op-Art)
        const renderFrag = `
            in vec2 vUv;
            out vec4 fragColor;
            uniform float u_time;
            uniform vec2 u_res;
            uniform sampler2D u_ca;

            mat2 rot(float a) {
                float s = sin(a), c = cos(a);
                return mat2(c, -s, s, c);
            }

            float sdBox(vec3 p, vec3 b) {
                vec3 q = abs(p) - b;
                return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
            }

            float sdTorus(vec3 p, vec2 t) {
                vec2 q = vec2(length(p.xz) - t.x, p.y);
                return length(q) - t.y;
            }

            float map(vec3 p) {
                float d = 1000.0;
                vec3 q = p;

                // Infinite folding corridor
                q.z = mod(q.z + u_time * 2.0, 8.0) - 4.0;

                // Op-Art Corridor Walls
                float tunnel = -sdBox(p, vec3(4.0, 3.0, 20.0));
                float moire = sin(p.z * 15.0) * sin(p.x * 15.0 + u_time * 2.0) * sin(p.y * 15.0);
                tunnel += moire * 0.15; // physical op-art pressure fields

                // Central Oracle Portal
                vec3 pTor = q;
                pTor.xy *= rot(u_time * 0.4);
                pTor.xz *= rot(u_time * 0.3);
                float oracle = sdTorus(pTor, vec2(1.8, 0.15));
                pTor.xy *= rot(1.5708);
                oracle = min(oracle, sdTorus(pTor, vec2(1.4, 0.1)));
                
                // Concentric ripples on the oracle
                oracle -= sin(length(pTor.xy) * 30.0 - u_time * 10.0) * 0.02;

                // Floating Browser Panels / Asemic Shards
                vec3 pPan = q;
                pPan.xy *= rot(sin(u_time * 0.5) * 0.2);
                pPan.x = abs(pPan.x) - 2.5;
                float panel = sdBox(pPan, vec3(0.8, 1.2, 0.05));
                float inner = sdBox(pPan + vec3(0.0, 0.0, -0.02), vec3(0.7, 1.1, 0.06));
                
                // Asemic glyph debris inside panels
                vec3 pGlyph = pPan;
                pGlyph.xy = fract(pGlyph.xy * 6.0) - 0.5;
                float glyphs = sdBox(pGlyph, vec3(0.15, 0.15, 0.1));
                glyphs = max(glyphs, sdBox(pPan, vec3(0.65, 1.05, 0.2))); // confine to inner panel
                
                panel = max(panel, -inner); // Hollow out
                panel = min(panel, glyphs);

                d = min(tunnel, oracle);
                d = min(d, panel);

                // CA Displacement
                float ca = texture(u_ca, fract(p.xy * 0.1 + 0.5)).r;
                d -= ca * 0.2;

                return d;
            }

            vec3 calcNormal(vec3 p) {
                vec2 e = vec2(0.01, 0.0);
                return normalize(vec3(
                    map(p + e.xyy) - map(p - e.xyy),
                    map(p + e.yxy) - map(p - e.yxy),
                    map(p + e.yyx) - map(p - e.yyx)
                ));
            }

            void main() {
                vec2 uv = (vUv - 0.5) * 2.0;
                uv.x *= u_res.x / u_res.y;

                vec3 ro = vec3(0.0, 0.0, -3.0);
                vec3 rd = normalize(vec3(uv, 1.0));

                float t = 0.0;
                float d = 0.0;
                for(int i = 0; i < 80; i++) {
                    vec3 p = ro + rd * t;
                    d = map(p);
                    if(d < 0.001 || t > 20.0) break;
                    t += d * 0.8;
                }

                vec3 col = vec3(0.0);
                if(t < 20.0) {
                    vec3 p = ro + rd * t;
                    vec3 n = calcNormal(p);
                    vec3 v = -rd;
                    float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.5);

                    // CA State driving structural color
                    vec2 ca_uv = fract(p.xy * 0.1 + p.z * 0.05);
                    float ca_val = texture(u_ca, ca_uv).r;

                    // Structural Color / Iridescence (Cosine palette)
                    vec3 a = vec3(0.5, 0.5, 0.5);
                    vec3 b = vec3(0.5, 0.5, 0.5);
                    vec3 c = vec3(1.0, 1.0, 1.0);
                    vec3 d_pal = vec3(0.00, 0.33, 0.67);
                    vec3 iridescence = a + b * cos(6.28318 * (c * (fresnel + ca_val + u_time * 0.2) + d_pal));

                    float ao = clamp(map(p + n * 0.5) / 0.5, 0.0, 1.0);
                    
                    // Base material color mapped to normal and position
                    vec3 baseCol = mix(vec3(0.1, 0.3, 0.8), vec3(0.9, 0.1, 0.5), n.y * 0.5 + 0.5);
                    col = mix(baseCol, iridescence, fresnel + ca_val * 0.5);
                    col *= ao;
                    
                    // Depth fog
                    col = mix(col, vec3(0.1, 0.0, 0.3), smoothstep(5.0, 20.0, t));
                }

                fragColor = vec4(col, 1.0);
            }
        `;

        // 3. DATAMOSH & TEMPORAL SHADER
        const datamoshFrag = `
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D u_curr;
            uniform sampler2D u_prev;
            uniform sampler2D u_ca;
            uniform float u_time;

            void main() {
                vec2 uv = vUv;

                // Motion vectors driven by Cellular Automata gradients
                float ca_c = texture(u_ca, uv).r;
                float ca_r = texture(u_ca, fract(uv + vec2(0.01, 0.0))).r;
                float ca_u = texture(u_ca, fract(uv + vec2(0.0, 0.01))).r;
                vec2 motion = vec2(ca_r - ca_c, ca_u - ca_c) * 0.05;

                // VHS Tape Wobble
                float wobble = sin(uv.y * 15.0 + u_time * 3.0) * 0.005 * sin(u_time * 0.8);
                uv.x += wobble;

                vec2 moshed_uv = fract(uv - motion);
                vec4 prev = texture(u_prev, moshed_uv);
                vec4 curr = texture(u_curr, uv);

                // Datamosh logic: keep previous frame if current hasn't changed drastically
                float diff = length(curr.rgb - prev.rgb);
                float threshold = 0.15 + 0.1 * sin(u_time * 0.5);
                float update = smoothstep(threshold - 0.05, threshold + 0.05, diff);

                // Random macroblock glitch to force updates
                float block = step(0.98, fract(sin(dot(floor(uv * 15.0), vec2(12.9898, 78.233)) + u_time) * 43758.5453));
                update = max(update, block);

                vec3 moshed = mix(prev.rgb, curr.rgb, update * 0.8 + 0.1); // Prevent infinite freeze
                fragColor = vec4(moshed, 1.0);
            }
        `;

        // 4. RISOGRAPH, CROSS-PROCESSING, & COLOR ENFORCEMENT SHADER
        const postFrag = `
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D u_moshed;
            uniform float u_time;
            uniform vec2 u_res;

            // OKLab Color Space Functions
            vec3 sRGB_to_linear(vec3 c) {
                vec3 b1 = c / 12.92;
                vec3 b2 = pow((c + 0.055) / 1.055, vec3(2.4));
                return mix(b1, b2, step(0.04045, c));
            }
            
            vec3 linear_to_sRGB(vec3 c) {
                vec3 b1 = c * 12.92;
                vec3 b2 = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
                return mix(b1, b2, step(0.0031308, c));
            }

            vec3 linearSRGB_to_OKLab(vec3 c) {
                float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
                float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
                float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
                float l_ = sign(l)*pow(abs(l), 1.0/3.0);
                float m_ = sign(m)*pow(abs(m), 1.0/3.0);
                float s_ = sign(s)*pow(abs(s), 1.0/3.0);
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

            // Risograph Halftone
            float halftone(vec2 uv, float angle, float lpi, float coverage) {
                float s = sin(angle), c = cos(angle);
                vec2 rot = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
                vec2 cell = fract(rot * lpi) - 0.5;
                float radius = sqrt(clamp(coverage, 0.0, 1.0)) * 0.75;
                return 1.0 - smoothstep(radius - 0.05, radius + 0.05, length(cell));
            }

            void main() {
                vec2 uv = vUv;

                // Chromatic Aberration & Misregistration
                float dist = length(uv - 0.5);
                vec2 offset = (uv - 0.5) * 0.03 * dist * (1.0 + sin(u_time)*0.5);
                
                vec3 col_r = texture(u_moshed, fract(uv + offset)).rgb;
                vec3 col_g = texture(u_moshed, uv).rgb;
                vec3 col_b = texture(u_moshed, fract(uv - offset)).rgb;
                vec3 sceneCol = vec3(col_r.r, col_g.g, col_b.b);

                // Luma for Riso coverage
                float luma = dot(sceneCol, vec3(0.2126, 0.7152, 0.0722));

                // RISOGRAPH INK LOGIC
                // Paper: Acid Yellow
                vec3 paper = vec3(0.87, 1.0, 0.0); 
                // Ink 1: Deep Indigo/Plum (Shadows)
                vec3 ink_indigo = vec3(0.2, 0.0, 0.4); 
                // Ink 2: Hot Pink (Mids)
                vec3 ink_pink = vec3(1.0, 0.1, 0.6); 
                // Ink 3: Electric Cyan (Highs)
                vec3 ink_cyan = vec3(0.0, 1.0, 1.0); 

                float lpi = 90.0;
                float cov_indigo = smoothstep(0.6, 0.0, luma);
                float cov_pink = smoothstep(0.1, 0.8, sceneCol.r) * smoothstep(0.9, 0.3, luma);
                float cov_cyan = smoothstep(0.1, 0.8, sceneCol.b) * smoothstep(0.2, 0.9, luma);

                float ht_indigo = halftone(uv, 0.785, lpi, cov_indigo); // 45 deg
                float ht_pink   = halftone(uv, 1.309, lpi, cov_pink);   // 75 deg
                float ht_cyan   = halftone(uv, 1.832, lpi, cov_cyan);   // 105 deg

                // Subtractive blend
                vec3 c = paper;
                c *= mix(vec3(1.0), ink_indigo, ht_indigo);
                c *= mix(vec3(1.0), ink_pink, ht_pink);
                c *= mix(vec3(1.0), ink_cyan, ht_cyan);

                // Add Colored VHS Tape Damage (Tracking/Dropout)
                float dropout = step(0.98, fract(sin(dot(uv * vec2(1.0, 100.0), vec2(12.9898, 78.233)) + u_time) * 43758.5453));
                vec3 damageColor = mix(vec3(1.0, 0.4, 0.0), vec3(0.0, 1.0, 0.8), fract(u_time * 5.0)); // Coral / Cyan
                c = mix(c, damageColor, dropout * 0.8);

                float tracking = smoothstep(0.0, 0.05, abs(fract(uv.y * 1.5 - u_time * 0.3) - 0.5)) * step(0.9, fract(u_time * 0.4));
                c = mix(c, vec3(1.0, 0.0, 1.0), tracking * 0.4 * fract(sin(uv.x * 500.0)*10.0)); // Magenta tracking scar

                // ABSOLUTE COLOR RULES ENFORCEMENT (OKLab)
                vec3 lab = linearSRGB_to_OKLab(sRGB_to_linear(c));

                // 1. No pure black (L min ~0.25), No pure white (L max ~0.85)
                lab.x = clamp(lab.x, 0.3, 0.85);

                // 2. Ensure high chroma (No grayscale neutrals)
                float chroma = length(lab.yz);
                if(chroma < 0.15) {
                    // Push neutrals into saturated shadow/highlight colors
                    float t = smoothstep(0.3, 0.85, lab.x);
                    // Dark -> Deep Plum/Indigo (a > 0, b < 0)
                    // Light -> Fluorescent Coral / Acid Yellow (a > 0, b > 0)
                    vec2 targetChroma = mix(vec2(0.15, -0.2), vec2(0.15, 0.2), t);
                    lab.yz = mix(lab.yz, targetChroma, 0.6);
                } else {
                    lab.yz *= 1.3; // Over-saturate everything else
                }

                vec3 finalRGB = linear_to_sRGB(OKLab_to_linearSRGB(lab));
                
                // Final safety clamp
                fragColor = vec4(clamp(finalRGB, 0.0, 1.0), 1.0);
            }
        `;

        const createMat = (frag) => new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader: commonVert,
            fragmentShader: frag,
            uniforms: {
                u_time: { value: 0 },
                u_res: { value: new THREE.Vector2(grid.width, grid.height) },
                u_state: { value: null },
                u_ca: { value: null },
                u_curr: { value: null },
                u_prev: { value: null },
                u_moshed: { value: null }
            },
            depthWrite: false,
            depthTest: false
        });

        const caMat = createMat(caFrag);
        const renderMat = createMat(renderFrag);
        const datamoshMat = createMat(datamoshFrag);
        const postMat = createMat(postFrag);

        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        scene.add(quad);

        canvas.__three = {
            renderer, scene, camera, quad,
            caMat, renderMat, datamoshMat, postMat,
            fbo_ca_A, fbo_ca_B, fbo_render, fbo_mosh_A, fbo_mosh_B,
            pingpongCA: true, pingpongMosh: true
        };
    }

    const t = canvas.__three;
    t.renderer.setSize(grid.width, grid.height, false);
    const res = new THREE.Vector2(grid.width, grid.height);

    // Update uniforms
    t.caMat.uniforms.u_time.value = time;
    t.caMat.uniforms.u_res.value = res;
    t.renderMat.uniforms.u_time.value = time;
    t.renderMat.uniforms.u_res.value = res;
    t.datamoshMat.uniforms.u_time.value = time;
    t.postMat.uniforms.u_time.value = time;
    t.postMat.uniforms.u_res.value = res;

    // 1. CA Pass
    t.quad.material = t.caMat;
    t.caMat.uniforms.u_state.value = t.pingpongCA ? t.fbo_ca_A.texture : t.fbo_ca_B.texture;
    t.renderer.setRenderTarget(t.pingpongCA ? t.fbo_ca_B : t.fbo_ca_A);
    t.renderer.render(t.scene, t.camera);
    const currentCA = t.pingpongCA ? t.fbo_ca_B.texture : t.fbo_ca_A.texture;
    t.pingpongCA = !t.pingpongCA;

    // 2. Render Pass
    t.quad.material = t.renderMat;
    t.renderMat.uniforms.u_ca.value = currentCA;
    t.renderer.setRenderTarget(t.fbo_render);
    t.renderer.render(t.scene, t.camera);

    // 3. Datamosh Pass
    t.quad.material = t.datamoshMat;
    t.datamoshMat.uniforms.u_curr.value = t.fbo_render.texture;
    t.datamoshMat.uniforms.u_prev.value = t.pingpongMosh ? t.fbo_mosh_A.texture : t.fbo_mosh_B.texture;
    t.datamoshMat.uniforms.u_ca.value = currentCA;
    t.renderer.setRenderTarget(t.pingpongMosh ? t.fbo_mosh_B : t.fbo_mosh_A);
    t.renderer.render(t.scene, t.camera);
    const currentMosh = t.pingpongMosh ? t.fbo_mosh_B.texture : t.fbo_mosh_A.texture;
    t.pingpongMosh = !t.pingpongMosh;

    // 4. Post Pass (Riso + Cross-Process + Strict Color)
    t.quad.material = t.postMat;
    t.postMat.uniforms.u_moshed.value = currentMosh;
    t.renderer.setRenderTarget(null);
    t.renderer.render(t.scene, t.camera);

} catch (e) {
    console.error("WebGL Initialization Failed:", e);
    throw e;
}