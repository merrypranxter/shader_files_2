if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        renderer.autoClear = false;

        const W = grid.width;
        const H = grid.height;

        const rtOpts = {
            type: THREE.FloatType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat
        };

        const caFBO1 = new THREE.WebGLRenderTarget(W, H, rtOpts);
        const caFBO2 = new THREE.WebGLRenderTarget(W, H, rtOpts);
        const mainFBO1 = new THREE.WebGLRenderTarget(W, H, rtOpts);
        const mainFBO2 = new THREE.WebGLRenderTarget(W, H, rtOpts);

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const scene = new THREE.Scene();
        const geometry = new THREE.PlaneGeometry(2, 2);

        // --- CELLULAR AUTOMATA (Brian's Brain Variant) ---
        const caMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_state: { value: null },
                u_resolution: { value: new THREE.Vector2(W, H) },
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
                uniform vec2 u_resolution;
                uniform float u_time;
                
                void main() {
                    if (u_time < 0.1) {
                        float rndInit = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
                        fragColor = vec4(rndInit > 0.9 ? 1.0 : 0.0, 0.0, 0.0, 1.0);
                        return;
                    }

                    vec2 texel = 1.0 / u_resolution;
                    float me = texture(u_state, vUv).r;
                    float neighbors = 0.0;
                    
                    for(float i=-1.0; i<=1.0; i++) {
                        for(float j=-1.0; j<=1.0; j++) {
                            if(i==0.0 && j==0.0) continue;
                            float n = texture(u_state, fract(vUv + vec2(i, j)*texel)).r;
                            if(n > 0.4 && n < 0.6) neighbors += 1.0;
                        }
                    }
                    
                    float next = me;
                    if (me < 0.1) {
                        if (neighbors >= 2.0 && neighbors <= 3.0) next = 0.5;
                    } else if (me < 0.6) {
                        next = 1.0;
                    } else {
                        next = 0.0;
                    }
                    
                    // Continuous noise seeding to keep the organism alive
                    float rnd = fract(sin(dot(vUv + u_time, vec2(12.9898, 78.233))) * 43758.5453);
                    if (rnd > 0.999) next = 0.5;
                    
                    fragColor = vec4(next, 0.0, 0.0, 1.0);
                }
            `
        });

        // --- DREAM PHYSICS ARCHITECTURE & DATAMOSH ---
        const mainMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_ca_tex: { value: null },
                u_prev_tex: { value: null },
                u_resolution: { value: new THREE.Vector2(W, H) },
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
                uniform sampler2D u_ca_tex;
                uniform sampler2D u_prev_tex;
                uniform vec2 u_resolution;
                uniform float u_time;
                
                const float PI = 3.14159265359;
                
                mat2 rot(float a) {
                    float s = sin(a), c = cos(a);
                    return mat2(c, -s, s, c);
                }
                
                float sdBox(vec3 p, vec3 b) {
                    vec3 q = abs(p) - b;
                    return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
                }
                
                float opSmoothUnion( float d1, float d2, float k ) {
                    float h = clamp( 0.5 + 0.5*(d2-d1)/k, 0.0, 1.0 );
                    return mix( d2, d1, h ) - k*h*(1.0-h);
                }
                
                vec2 map(vec3 p) {
                    // Central Oracle Portal (Op-Art rings)
                    vec3 pTorus = p;
                    pTorus.xy *= rot(u_time * 0.2);
                    vec2 qT = vec2(length(pTorus.xy) - 2.0, pTorus.z);
                    float dPortal = length(qT) - 0.3 + sin(atan(pTorus.y, pTorus.x) * 10.0 + u_time * 5.0) * 0.05;
                    
                    // Floating Browser Panels (Early Internet relics)
                    vec3 pBox = p;
                    pBox.z = mod(pBox.z + u_time, 8.0) - 4.0;
                    
                    float a = atan(pBox.y, pBox.x);
                    float r = length(pBox.xy);
                    float n = 5.0;
                    a = mod(a + PI/n, 2.0*PI/n) - PI/n;
                    pBox.x = r * cos(a);
                    pBox.y = r * sin(a);
                    
                    pBox.x -= 2.5; 
                    pBox.xy *= rot(u_time * 0.5 + p.z * 0.2);
                    
                    float dPanels = sdBox(pBox, vec3(0.6, 0.9, 0.05)) - 0.05; // Beveled edges
                    
                    // Impossible Tunnel (Moiré Corridors)
                    float dTunnel = -length(p.xy) + 4.0 + sin(p.z * 2.0 + u_time) * 0.5;
                    
                    float d = opSmoothUnion(dPortal, dPanels, 0.5);
                    d = min(d, dTunnel);
                    
                    float mat = 0.0;
                    if (d == dPortal) mat = 1.0;
                    else if (d == dPanels) mat = 2.0;
                    else mat = 3.0;
                    
                    return vec2(d, mat);
                }
                
                vec3 calcNormal(vec3 p) {
                    const vec2 e = vec2(1.0,-1.0)*0.0005;
                    return normalize( e.xyy*map( p + e.xyy ).x + 
                                      e.yyx*map( p + e.yyx ).x + 
                                      e.yxy*map( p + e.yxy ).x + 
                                      e.xxx*map( p + e.xxx ).x );
                }
                
                float hash(float n) { return fract(sin(n) * 1e4); }
                float hash(vec2 p) { return fract(1e4 * sin(17.0 * p.x + p.y * 0.1) * (0.1 + abs(sin(p.y * 13.0 + p.x)))); }
                float noise(vec3 x) {
                    const vec3 step = vec3(110, 241, 171);
                    vec3 i = floor(x);
                    vec3 f = fract(x);
                    float n = dot(i, step);
                    vec3 u = f * f * (3.0 - 2.0 * f);
                    return mix(mix(mix( hash(n + dot(step, vec3(0, 0, 0))), hash(n + dot(step, vec3(1, 0, 0))), u.x),
                                   mix( hash(n + dot(step, vec3(0, 1, 0))), hash(n + dot(step, vec3(1, 1, 0))), u.x), u.y),
                               mix(mix( hash(n + dot(step, vec3(0, 0, 1))), hash(n + dot(step, vec3(1, 0, 1))), u.x),
                                   mix( hash(n + dot(step, vec3(0, 1, 1))), hash(n + dot(step, vec3(1, 1, 1))), u.x), u.y), u.z);
                }
                
                void main() {
                    vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution) / min(u_resolution.x, u_resolution.y);
                    
                    vec3 ro = vec3(0.0, 0.0, -4.0 + u_time * 0.5);
                    vec3 rd = normalize(vec3(p, 1.5));
                    
                    ro.xy += vec2(sin(u_time*0.2), cos(u_time*0.3)) * 0.5;
                    rd.xy *= rot(sin(u_time*0.15)*0.2);
                    
                    float t = 0.0;
                    float mat = 0.0;
                    vec3 pos;
                    for(int i=0; i<80; i++) {
                        pos = ro + rd * t;
                        vec2 res = map(pos);
                        if(res.x < 0.01) {
                            mat = res.y;
                            break;
                        }
                        t += res.x * 0.7;
                        if(t > 30.0) break;
                    }
                    
                    vec3 baseColor = vec3(0.0);
                    float caState = 0.0;
                    
                    if (t < 30.0) {
                        vec3 n = calcNormal(pos);
                        vec3 v = -rd;
                        float cosTheta = max(0.0, dot(n, v));
                        
                        // Structural Color (Thin Film Interference & Iridescence)
                        vec3 a = vec3(0.5);
                        vec3 b = vec3(0.5);
                        vec3 c = vec3(1.0);
                        vec3 d = vec3(0.0, 0.33, 0.67);
                        float filmThick = 3.0 + sin(pos.z * 3.0 + u_time) * 1.5;
                        vec3 structColor = a + b * cos(6.28318 * (c * (cosTheta * filmThick) + d));
                        
                        // Cellular Automata Infection Mapping
                        vec2 caUV = fract(pos.xy * 0.15 + pos.z * 0.1);
                        caState = texture(u_ca_tex, caUV).r;
                        
                        vec3 caGlow = vec3(0.0);
                        if (caState > 0.4 && caState < 0.6) {
                            caGlow = vec3(0.0, 1.0, 0.8) * 1.5; // Neon Cyan circuit
                        } else if (caState > 0.9) {
                            caGlow = vec3(1.0, 0.0, 0.5) * 1.5; // Hot Pink logic
                        }
                        
                        // Op-Art Moiré & Radial Tunnel Patterns
                        float opArt = 0.0;
                        if (mat == 3.0) {
                            opArt = sin(pos.z * 20.0 - u_time * 10.0) * sin(atan(pos.y, pos.x) * 20.0);
                            opArt = smoothstep(-0.1, 0.1, opArt);
                        }
                        
                        baseColor = structColor + caGlow + opArt * vec3(0.8, 0.2, 1.0);
                        
                        // Memory / Indigo Fog (No Black/White)
                        float fog = exp(-t * 0.08);
                        baseColor = mix(vec3(0.15, 0.0, 0.35), baseColor, fog); 
                    } else {
                        // Saturated Void
                        baseColor = vec3(0.15, 0.0, 0.35);
                    }
                    
                    // Datamosh & Temporal Motion Vector Feedback
                    vec2 screenUV = vUv;
                    vec2 motion = vec2(sin(screenUV.y * 15.0 + u_time), cos(screenUV.x * 15.0 + u_time)) * 0.005;
                    motion += (caState - 0.5) * 0.02;
                    
                    float moshing = step(0.65, noise(vec3(screenUV * 8.0, u_time)));
                    vec3 prevColor = texture(u_prev_tex, fract(screenUV - motion * moshing)).rgb;
                    
                    vec3 finalColor = mix(baseColor, prevColor, moshing * 0.85);
                    fragColor = vec4(finalColor, 1.0);
                }
            `
        });

        // --- CROSS-PROCESSING, VHS DAMAGE & RISOGRAPH LOGIC ---
        const postMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_main_tex: { value: null },
                u_resolution: { value: new THREE.Vector2(W, H) },
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
                uniform sampler2D u_main_tex;
                uniform vec2 u_resolution;
                uniform float u_time;
                
                float srgb_to_linear(float x) { return x <= 0.04045 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4); }
                vec3 sRGB_to_linear(vec3 c) { return vec3(srgb_to_linear(c.r), srgb_to_linear(c.g), srgb_to_linear(c.b)); }
                float linear_to_srgb(float x) { return x <= 0.0031308 ? x * 12.92 : 1.055 * pow(max(x,0.0), 1.0/2.4) - 0.055; }
                vec3 linear_to_sRGB(vec3 c) { return vec3(linear_to_srgb(c.r), linear_to_srgb(c.g), linear_to_srgb(c.b)); }

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

                void main() {
                    vec2 uv = vUv;
                    float t = u_time;

                    // VHS Tracking Error & Wobble Band
                    float trackY = 0.5 + 0.4 * sin(t * 0.4);
                    float trackBand = smoothstep(0.15, 0.0, abs(uv.y - trackY));
                    float wobble = (fract(sin(dot(uv.yy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.05 * trackBand;
                    vec2 warpedUV = uv + vec2(wobble, 0.0);

                    // Head Switching Pulse
                    if (warpedUV.y < 0.04) {
                        warpedUV.x += (fract(sin(uv.y * 100.0 + t) * 43758.5453) - 0.5) * 0.03;
                    }

                    // Chromatic Aberration & Edge Spectrum Separation
                    float caSpread = 0.003 + 0.015 * trackBand;
                    vec3 color;
                    color.r = texture(u_main_tex, fract(warpedUV + vec2(caSpread, 0.0))).r;
                    color.g = texture(u_main_tex, fract(warpedUV)).g;
                    color.b = texture(u_main_tex, fract(warpedUV - vec2(caSpread, 0.0))).b;

                    // Tape Dropout (Colored, No Pure White)
                    float doNoise = fract(sin(dot(warpedUV * vec2(1.0, 100.0) + t, vec2(12.9898, 78.233))) * 43758.5453);
                    float dropout = step(0.98, doNoise);
                    vec3 dropColor = mix(vec3(1.0, 0.0, 0.5), vec3(0.0, 1.0, 0.8), fract(t*10.0));
                    color = mix(color, dropColor, dropout * 0.8);

                    // OKLab Cross-Processing (Strict Color Constraints)
                    vec3 linColor = sRGB_to_linear(color);
                    vec3 ok = linear_srgb_to_oklab(linColor);

                    // Force Shadows to Indigo/Peacock
                    float shadowW = 1.0 - smoothstep(0.0, 0.4, ok.x);
                    ok.y += 0.06 * shadowW; 
                    ok.z -= 0.18 * shadowW; 

                    // Force Highlights to Acid Yellow / Fluorescent Coral
                    float highW = smoothstep(0.6, 1.0, ok.x);
                    ok.y += 0.12 * highW; 
                    ok.z += 0.18 * highW; 

                    // Ensure No Grayscale Neutrals (Inject Chroma)
                    float chroma = length(ok.yz);
                    if (chroma < 0.08) {
                        ok.y += 0.12 * sin(t * 2.0 + uv.x * 10.0);
                        ok.z += 0.12 * cos(t * 2.0 + uv.y * 10.0);
                    }
                    ok.yz *= 1.5; // Saturate heavily

                    // Enforce No Pure Black, No Pure White
                    ok.x = clamp(ok.x, 0.25, 0.85);

                    vec3 crossColor = linear_to_sRGB(oklab_to_linear_srgb(ok));

                    // Risograph Halftone Overlay & Misregistration Grain
                    float rotAngle = 0.7853; 
                    float s = sin(rotAngle), c = cos(rotAngle);
                    vec2 rotUV = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
                    vec2 grid = fract(rotUV * 120.0 * vec2(u_resolution.x/u_resolution.y, 1.0)) - 0.5;
                    float dotPattern = length(grid);
                    float noiseVal = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
                    float risoTex = smoothstep(0.4, 0.5, dotPattern + noiseVal * 0.3);
                    
                    crossColor *= (0.85 + 0.15 * risoTex);

                    fragColor = vec4(clamp(crossColor, 0.0, 1.0), 1.0);
                }
            `
        });

        const mesh = new THREE.Mesh(geometry, caMat);
        scene.add(mesh);

        canvas.__three = { renderer, scene, camera, mesh, caMat, mainMat, postMat, caFBO1, caFBO2, mainFBO1, mainFBO2 };
        canvas.__ping = 0;
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        return;
    }
}

const { renderer, scene, camera, mesh, caMat, mainMat, postMat, caFBO1, caFBO2, mainFBO1, mainFBO2 } = canvas.__three;

if (renderer.domElement.width !== grid.width || renderer.domElement.height !== grid.height) {
    renderer.setSize(grid.width, grid.height, false);
    caFBO1.setSize(grid.width, grid.height);
    caFBO2.setSize(grid.width, grid.height);
    mainFBO1.setSize(grid.width, grid.height);
    mainFBO2.setSize(grid.width, grid.height);
    caMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    mainMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    postMat.uniforms.u_resolution.value.set(grid.width, grid.height);
}

const caNext = 1 - canvas.__ping;

// 1. Cellular Automata Pass
caMat.uniforms.u_time.value = time;
caMat.uniforms.u_state.value = (canvas.__ping === 0) ? caFBO1.texture : caFBO2.texture;
mesh.material = caMat;
renderer.setRenderTarget((caNext === 0) ? caFBO1 : caFBO2);
renderer.render(scene, camera);

// 2. Main Raymarch + Datamosh Memory Pass
mainMat.uniforms.u_time.value = time;
mainMat.uniforms.u_ca_tex.value = (caNext === 0) ? caFBO1.texture : caFBO2.texture;
mainMat.uniforms.u_prev_tex.value = (canvas.__ping === 0) ? mainFBO1.texture : mainFBO2.texture;
mesh.material = mainMat;
renderer.setRenderTarget((caNext === 0) ? mainFBO1 : mainFBO2);
renderer.render(scene, camera);

// 3. Post-Process (VHS, Riso, Color Rules) to Screen
postMat.uniforms.u_time.value = time;
postMat.uniforms.u_main_tex.value = (caNext === 0) ? mainFBO1.texture : mainFBO2.texture;
mesh.material = postMat;
renderer.setRenderTarget(null);
renderer.render(scene, camera);

canvas.__ping = caNext;