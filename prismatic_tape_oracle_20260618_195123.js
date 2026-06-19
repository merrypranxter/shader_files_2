try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.setPixelRatio(1.0); // Keep it crunchy for datamosh/riso feel
        
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        // --- RENDER TARGETS (Ping-Pong Buffers) ---
        const rtOpts = {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType, // Required for CA and Datamosh precision
            depthBuffer: false
        };
        
        const rtCA = [new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts), new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts)];
        const rtMain = [new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts), new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts)];

        // --- 1. CELLULAR AUTOMATA INTELLIGENCE (Lenia/Reaction-Diffusion Hybrid) ---
        const matCA = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_state: { value: null },
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
                uniform sampler2D u_state;
                uniform vec2 u_res;
                uniform float u_time;

                void main() {
                    vec2 px = 1.0 / u_res;
                    vec3 val = texture(u_state, vUv).rgb;
                    
                    // 3x3 Laplacian
                    vec3 lap = -8.0 * val;
                    for(int y=-1; y<=1; y++) {
                        for(int x=-1; x<=1; x++) {
                            if(x==0 && y==0) continue;
                            lap += texture(u_state, fract(vUv + vec2(x,y)*px)).rgb;
                        }
                    }
                    
                    // Feral Reaction Diffusion
                    float r = val.r; float g = val.g; float b = val.b;
                    float dr = 0.2 * lap.r - r*g*g + 0.054 * (1.0 - r);
                    float dg = 0.1 * lap.g + r*g*g - (0.054 + 0.062) * g;
                    float db = 0.15 * lap.b + r*g*b - 0.06 * b;
                    
                    // Inject Dream Energetics (O-Nodes)
                    vec2 center = vec2(0.5) + vec2(sin(u_time*0.5), cos(u_time*0.3)) * 0.3;
                    float feed = smoothstep(0.05, 0.0, length(vUv - center)) * fract(sin(u_time)*43758.5);
                    
                    fragColor = vec4(clamp(vec3(r+dr, g+dg+feed, b+db), 0.0, 1.0), 1.0);
                }
            `
        });

        // --- 2. THE ORACLE (Dream-Physics Architecture + Datamosh + VHS) ---
        const matMain = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_ca: { value: null },
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
                uniform sampler2D u_ca;
                uniform sampler2D u_prev;
                uniform vec2 u_res;
                uniform float u_time;

                mat2 rot(float a) { float s=sin(a), c=cos(a); return mat2(c, -s, s, c); }
                
                float sdBox(vec3 p, vec3 b) { vec3 d = abs(p) - b; return length(max(d,0.0)) + min(max(d.x,max(d.y,d.z)),0.0); }
                float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xy)-t.x,p.z); return length(q)-t.y; }
                
                float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

                float map(vec3 p) {
                    vec3 p2 = p;
                    // Topology of Impossible Space
                    p2.xy *= rot(p2.z * 0.1 + u_time * 0.2);
                    p2.x = abs(p2.x) - 2.0;
                    
                    // Central Oracle Ring
                    float d1 = sdTorus(p, vec2(2.5, 0.4 + 0.1*sin(p.x*10.0 + u_time)));
                    
                    // Floating Early-Internet Browser Panels
                    vec3 bp = p2;
                    bp.z = mod(bp.z + u_time * 4.0, 15.0) - 7.5;
                    float d2 = sdBox(bp, vec3(1.2, 0.8, 0.05)) - 0.05;
                    float d2_hole = sdBox(bp, vec3(1.0, 0.6, 0.1));
                    d2 = max(d2, -d2_hole);
                    
                    return min(d1, d2);
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
                    vec2 uv = vUv;
                    
                    // VHS Tracking Instability
                    float track = smoothstep(0.8, 1.0, sin(uv.y * 12.0 + u_time * 5.0));
                    uv.x += track * 0.015 * sin(u_time * 20.0);
                    
                    // Cellular Automata state for Datamosh Vectors
                    vec3 ca = texture(u_ca, uv).rgb;
                    vec2 flow = (ca.rg - 0.5) * 0.03;
                    
                    // Raymarching Setup
                    vec2 p = (uv - 0.5) * 2.0;
                    p.x *= u_res.x / u_res.y;
                    vec3 ro = vec3(0.0, 0.0, -4.0);
                    vec3 rd = normalize(vec3(p, 1.5));
                    rd.xy *= rot(u_time * 0.15);
                    
                    float t = 0.0;
                    vec3 pos;
                    for(int i=0; i<45; i++) {
                        pos = ro + rd * t;
                        float d = map(pos);
                        if(d < 0.01 || t > 20.0) break;
                        t += d;
                    }
                    
                    vec3 col = vec3(0.0);
                    if(t < 20.0) {
                        vec3 nor = calcNormal(pos);
                        // Structural Color (Bragg Reflection / Iridescence)
                        float viewAngle = max(0.0, dot(nor, -rd));
                        float phase = pos.z * 0.5 + u_time;
                        col = 0.5 + 0.5 * cos(6.28318 * (viewAngle * 2.0 + phase + vec3(0.0, 0.33, 0.67)));
                        
                        // Op-Art Moiré Contamination
                        float op = sin(pos.x * 30.0) * sin(pos.y * 30.0);
                        col *= 0.7 + 0.3 * op;
                        
                        // Automata Infection
                        col += ca * 0.4;
                    } else {
                        // Background Memory Void
                        col = vec3(0.1, 0.0, 0.2) + ca * 0.3;
                    }
                    
                    // Datamosh I-Frame Prediction Error
                    vec4 prev = texture(u_prev, fract(uv + flow));
                    float iframe = step(0.97, hash(uv * 10.0 + u_time * 0.05)); // Periodic refresh
                    
                    vec3 finalCol = mix(prev.rgb, col, 0.08 + 0.92 * iframe);
                    
                    // VHS Head Switching Noise
                    if (uv.y < 0.05) finalCol += hash(uv + u_time) * 0.5;
                    
                    fragColor = vec4(finalCol, 1.0);
                }
            `
        });

        // --- 3. THE PRINTING PRESS (Risograph + Cross-Processing + Strict Color Rules) ---
        const matComp = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_scene: { value: null },
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
                uniform vec2 u_res;
                uniform float u_time;

                mat2 rot(float a) { float s=sin(a), c=cos(a); return mat2(c, -s, s, c); }
                float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

                // OKLab Interpolation for vibrant, non-muddy blends
                vec3 srgb_to_oklab(vec3 c) {
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
                vec3 oklab_to_srgb(vec3 c) {
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
                vec3 oklab_mix(vec3 colA, vec3 colB, float t) {
                    return clamp(oklab_to_srgb(mix(srgb_to_oklab(colA), srgb_to_oklab(colB), t)), 0.0, 1.0);
                }

                // STRICT NO-BLACK / NO-WHITE COLOR MAPPING
                vec3 enforceAlchemicalPalette(vec3 rgb) {
                    float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
                    float hue = atan(rgb.g - rgb.b, rgb.r - rgb.g);
                    
                    // Shadows: Deep Plum, Peacock Blue, Indigo
                    vec3 shadow1 = vec3(0.2, 0.0, 0.3); // Plum
                    vec3 shadow2 = vec3(0.0, 0.2, 0.3); // Deep Teal
                    vec3 shadow = oklab_mix(shadow1, shadow2, sin(hue)*0.5+0.5);
                    
                    // Midtones: Hot Pink, Coral, Turquoise
                    vec3 mid1 = vec3(1.0, 0.1, 0.5); // Hot Pink
                    vec3 mid2 = vec3(0.1, 0.9, 0.7); // Turquoise
                    vec3 mid = oklab_mix(mid1, mid2, cos(hue)*0.5+0.5);
                    
                    // Highlights: Acid Yellow, Neon Cyan, Fluorescent Coral
                    vec3 high1 = vec3(0.8, 1.0, 0.0); // Acid Yellow
                    vec3 high2 = vec3(0.0, 1.0, 0.9); // Neon Cyan
                    vec3 high = oklab_mix(high1, high2, sin(hue+2.0)*0.5+0.5);
                    
                    // Non-linear S-Curve blending
                    float l1 = smoothstep(0.0, 0.45, lum);
                    float l2 = smoothstep(0.45, 1.0, lum);
                    
                    vec3 finalCol = oklab_mix(shadow, mid, l1);
                    finalCol = oklab_mix(finalCol, high, l2);
                    
                    return finalCol;
                }

                float halftone(vec2 uv, float angle, float lpi) {
                    vec2 p = uv;
                    p.x *= u_res.x / u_res.y;
                    p *= rot(angle);
                    p *= lpi;
                    return sin(p.x * 6.28) * sin(p.y * 6.28);
                }

                void main() {
                    vec2 uv = vUv;
                    
                    // Risograph Misregistration & Chromatic Aberration
                    vec2 drift = vec2(sin(u_time*2.0), cos(u_time*1.5)) * 0.005;
                    float r = texture(u_scene, fract(uv + drift)).r;
                    float g = texture(u_scene, uv).g;
                    float b = texture(u_scene, fract(uv - drift * 0.5)).b;
                    vec3 sceneCol = vec3(r, g, b);
                    
                    // Early Internet UI Fragments (Asemic UI Overlays)
                    float uiFrame = step(abs(uv.x - 0.5), 0.45) * step(abs(uv.y - 0.5), 0.45);
                    float uiFrameIn = step(abs(uv.x - 0.5), 0.44) * step(abs(uv.y - 0.5), 0.44);
                    float uiChip = step(abs(uv.x - 0.8), 0.05) * step(abs(uv.y - 0.2), 0.08);
                    sceneCol += vec3(uiFrame - uiFrameIn) * 0.5;
                    sceneCol += vec3(uiChip) * 0.8;
                    
                    // Apply Halftone Multiply Logic
                    float htR = halftone(uv, 0.26, 90.0); // 15 deg
                    float htG = halftone(uv, 1.30, 90.0); // 75 deg
                    sceneCol.r = mix(sceneCol.r, sceneCol.r * htR, 0.2);
                    sceneCol.g = mix(sceneCol.g, sceneCol.g * htG, 0.2);
                    
                    // Transform to Strict Dream Physics Palette
                    vec3 finalCol = enforceAlchemicalPalette(sceneCol);
                    
                    // Colored VHS Noise / Damage
                    vec3 noiseCol = vec3(
                        hash(uv + u_time),
                        hash(uv + u_time + 1.0),
                        hash(uv + u_time + 2.0)
                    );
                    finalCol = oklab_mix(finalCol, enforceAlchemicalPalette(noiseCol), 0.15);
                    
                    fragColor = vec4(finalCol, 1.0);
                }
            `
        });

        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        
        const sceneCA = new THREE.Scene(); sceneCA.add(quad.clone());
        const sceneMain = new THREE.Scene(); sceneMain.add(quad.clone());
        const sceneComp = new THREE.Scene(); sceneComp.add(quad.clone());
        
        sceneCA.children[0].material = matCA;
        sceneMain.children[0].material = matMain;
        sceneComp.children[0].material = matComp;

        canvas.__three = {
            renderer, camera, 
            sceneCA, sceneMain, sceneComp,
            rtCA, rtMain,
            matCA, matMain, matComp,
            ping: 0
        };
    }

    const { renderer, camera, sceneCA, sceneMain, sceneComp, rtCA, rtMain, matCA, matMain, matComp } = canvas.__three;
    let ping = canvas.__three.ping;
    let pong = 1 - ping;
    canvas.__three.ping = pong;

    renderer.setSize(grid.width, grid.height, false);
    
    const res = new THREE.Vector2(grid.width, grid.height);
    
    // 1. Update Cellular Automata
    matCA.uniforms.u_state.value = rtCA[ping].texture;
    matCA.uniforms.u_res.value = res;
    matCA.uniforms.u_time.value = time;
    renderer.setRenderTarget(rtCA[pong]);
    renderer.render(sceneCA, camera);
    
    // 2. Render Main Scene & Datamosh
    matMain.uniforms.u_ca.value = rtCA[pong].texture;
    matMain.uniforms.u_prev.value = rtMain[ping].texture;
    matMain.uniforms.u_res.value = res;
    matMain.uniforms.u_time.value = time;
    renderer.setRenderTarget(rtMain[pong]);
    renderer.render(sceneMain, camera);
    
    // 3. Composite to Screen (Riso + Color Map)
    matComp.uniforms.u_scene.value = rtMain[pong].texture;
    matComp.uniforms.u_res.value = res;
    matComp.uniforms.u_time.value = time;
    renderer.setRenderTarget(null);
    renderer.render(sceneComp, camera);

} catch (e) {
    console.error("Alchemical Rendering Failure:", e);
}