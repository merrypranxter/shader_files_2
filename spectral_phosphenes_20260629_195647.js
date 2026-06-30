if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;
        
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        const rtOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType
        };
        
        const rtCore = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
        const rtAdaptA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
        const rtAdaptB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
        
        const coreMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: { 
                uTime: { value: 0 }, 
                uResolution: { value: new THREE.Vector2() } 
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                out vec4 fragColor;
                uniform float uTime;
                uniform vec2 uResolution;

                #define PI 3.14159265359

                vec2 cdiv(vec2 a, vec2 b) { 
                    float d = dot(b,b)+1e-8; 
                    return vec2(dot(a,b), a.y*b.x - a.x*b.y)/d; 
                }
                vec2 cpow(vec2 z, float n) { 
                    float r = length(z); 
                    float a = atan(z.y, z.x); 
                    return pow(r, n) * vec2(cos(n*a), sin(n*a)); 
                }

                vec2 to_log_polar(vec2 uv, vec2 center) {
                    vec2 d = uv - center;
                    float r = max(length(d), 1e-6);
                    return vec2(log(r), atan(d.y, d.x));
                }

                vec3 acid_palette(float t) {
                    vec3 a = vec3(0.5);
                    vec3 b = vec3(0.5);
                    vec3 c = vec3(1.0, 1.0, 0.5);
                    vec3 d = vec3(0.8, 0.9, 0.3);
                    vec3 col = a + b * cos(2.0 * PI * (c * t + d));
                    col = mix(col, vec3(1.0, 0.1, 0.7), smoothstep(0.7, 1.0, sin(t * PI * 7.0))); 
                    col = mix(col, vec3(0.1, 1.0, 0.9), smoothstep(0.7, 1.0, cos(t * PI * 5.0))); 
                    col = mix(col, vec3(0.9, 1.0, 0.1), smoothstep(0.8, 1.0, sin(t * PI * 11.0))); 
                    return col;
                }

                void main() {
                    vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);
                    
                    // Luxurious foveal breathing & tremor
                    float tremor = sin(uTime * 10.0) * 0.002;
                    float breath = sin(uTime * 0.3) * 0.12;
                    vec2 center = vec2(tremor, tremor * cos(uTime * 8.0));
                    
                    vec2 lp = to_log_polar(uv, center);
                    float r = length(uv - center);
                    
                    // Floating Point Dementia cracks at extreme edges or intense pulses
                    float pulse = smoothstep(0.85, 1.0, sin(uTime * 0.6 - r * 3.0));
                    float q_level = mix(10000.0, 8.0, smoothstep(1.2, 2.5, r) * pulse);
                    if (q_level < 50.0) {
                        lp = floor(lp * q_level + 0.5) / q_level;
                    }
                    
                    // Domain Coloring: rational function evaluation
                    vec2 c_val = vec2(sin(uTime * 0.15), cos(uTime * 0.22)) * 0.7;
                    vec2 w = cdiv(cpow(lp, 4.0) - vec2(1.0, 0.0), cpow(lp, 2.0) + c_val);
                    
                    float phase = atan(w.y, w.x);
                    float mag = length(w);
                    
                    // Phosphene Forms
                    float chirality = sign(sin(uTime * 0.08)); 
                    float t_val = uTime * 1.2;
                    
                    float spiral = sin(lp.x * 6.0 + lp.y * 8.0 * chirality - t_val);
                    float cobweb = sin(lp.x * 14.0 - t_val) * sin(lp.y * 18.0);
                    float grid = sin(lp.x * 20.0 + phase) * sin(lp.y * 20.0 - phase);
                    
                    // Morphing blend of geometries
                    float form = mix(spiral, cobweb, 0.5 + 0.5 * sin(uTime * 0.25));
                    form = mix(form, grid, smoothstep(2.0, 4.0, mag));
                    
                    // Phase contours tinting webs and tunnel ribs
                    float contour = smoothstep(0.8, 1.0, sin(phase * 10.0));
                    form *= (0.7 + 0.5 * contour);
                    
                    // Chromostereopsis Depth mapping
                    float depth = smoothstep(0.0, 2.5, r + mag * 0.2);
                    vec3 nearCol = vec3(1.0, 0.05, 0.4); // Saturated hot pink / red
                    vec3 farCol = vec3(0.0, 0.7, 1.0);   // Saturated cyan / blue
                    vec3 baseCol = mix(nearCol, farCol, depth);
                    
                    // False color palette mapped from complex phase
                    vec3 specCol = acid_palette(phase / (2.0 * PI) + 0.5 - uTime * 0.1);
                    
                    vec3 finalCol = mix(baseCol, specCol, 0.65);
                    
                    // High contrast wet light intensity
                    float intensity = abs(form) * exp(-r * (0.9 - breath));
                    intensity = pow(intensity, 1.2); 
                    
                    // NaN Purple Cracks
                    if (q_level < 15.0 && fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) > 0.98) {
                        finalCol = vec3(0.8, 0.0, 1.0); 
                        intensity = 1.5; 
                    }
                    
                    // Max saturation enforcement for Chromostereopsis pop
                    float maxC = max(finalCol.r, max(finalCol.g, finalCol.b));
                    if (maxC > 0.0) finalCol /= maxC;
                    
                    fragColor = vec4(finalCol * intensity, 1.0);
                }
            `
        });
        
        const adaptMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: { 
                uCore: { value: null }, 
                uPrev: { value: null }, 
                uResolution: { value: new THREE.Vector2() } 
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                out vec4 fragColor;
                uniform sampler2D uCore;
                uniform sampler2D uPrev;
                uniform vec2 uResolution;

                void main() {
                    vec2 uv = gl_FragCoord.xy / uResolution;
                    vec3 core = texture(uCore, uv).rgb;
                    vec3 prev = texture(uPrev, uv).rgb;
                    
                    // Burn rate into adaptation buffer
                    vec3 burn = core * 0.06;
                    
                    // Decay: ~0.995 per frame for 4-10s lingering trails
                    float decay = 0.995;
                    
                    vec3 adapt = prev * decay + burn;
                    fragColor = vec4(min(adapt, vec3(1.0)), 1.0);
                }
            `
        });
        
        const compMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: { 
                uCore: { value: null }, 
                uAdapt: { value: null }, 
                uResolution: { value: new THREE.Vector2() } 
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                out vec4 fragColor;
                uniform sampler2D uCore;
                uniform sampler2D uAdapt;
                uniform vec2 uResolution;

                void main() {
                    vec2 uv = gl_FragCoord.xy / uResolution;
                    vec2 dir = uv - 0.5;
                    float d = length(dir);
                    
                    // Dispersion only at brightest edges
                    vec3 coreCenter = texture(uCore, uv).rgb;
                    float luma = dot(coreCenter, vec3(0.299, 0.587, 0.114));
                    float edgeDetect = smoothstep(0.5, 1.0, luma) * d;
                    
                    float ca_amt = 0.01 * edgeDetect;
                    vec3 core;
                    core.r = texture(uCore, uv + dir * ca_amt).r;
                    core.g = coreCenter.g;
                    core.b = texture(uCore, uv - dir * ca_amt).b;
                    
                    vec3 adapt = texture(uAdapt, uv).rgb;
                    
                    // Afterimage Painter Logic: Complementary Ghost
                    vec3 comp = vec3(1.0) - adapt;
                    // Shift the ghost colors slightly to keep it in the acid/candy realm
                    comp = mix(comp, vec3(comp.b, comp.r, comp.g), 0.4);
                    
                    float adaptStrength = max(adapt.r, max(adapt.g, adapt.b));
                    float coreCoverage = max(core.r, max(core.g, core.b));
                    
                    // Ghost shows where paint has faded
                    vec3 ghost = comp * adaptStrength * smoothstep(0.3, 0.0, coreCoverage) * 1.8;
                    
                    vec3 finalCol = core + ghost;
                    
                    // Wet light bloom
                    vec3 bloom = vec3(0.0);
                    vec2 px = 1.0 / uResolution;
                    bloom += texture(uCore, uv + vec2(px.x, px.y)*4.0).rgb;
                    bloom += texture(uCore, uv + vec2(-px.x, -px.y)*4.0).rgb;
                    bloom += texture(uCore, uv + vec2(-px.x, px.y)*4.0).rgb;
                    bloom += texture(uCore, uv + vec2(px.x, -px.y)*4.0).rgb;
                    
                    finalCol += (bloom / 4.0) * 0.5 * smoothstep(0.6, 1.0, coreCoverage);
                    
                    // Vignette
                    finalCol *= 1.0 - 0.5 * d * d;
                    
                    fragColor = vec4(finalCol, 1.0);
                }
            `
        });
        
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        scene.add(quad);
        
        canvas.__three = { renderer, scene, camera, quad, coreMat, adaptMat, compMat, rtCore, rtAdaptA, rtAdaptB };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        throw e;
    }
}

const t3 = canvas.__three;
t3.renderer.setSize(grid.width, grid.height, false);

if (t3.rtCore.width !== grid.width || t3.rtCore.height !== grid.height) {
    t3.rtCore.setSize(grid.width, grid.height);
    t3.rtAdaptA.setSize(grid.width, grid.height);
    t3.rtAdaptB.setSize(grid.width, grid.height);
}

const res = new THREE.Vector2(grid.width, grid.height);

// 1. Core Pass
if (t3.coreMat && t3.coreMat.uniforms) {
    t3.coreMat.uniforms.uTime.value = time;
    t3.coreMat.uniforms.uResolution.value.copy(res);
}
t3.quad.material = t3.coreMat;
t3.renderer.setRenderTarget(t3.rtCore);
t3.renderer.render(t3.scene, t3.camera);

// 2. Adaptation / Burn Pass
if (t3.adaptMat && t3.adaptMat.uniforms) {
    t3.adaptMat.uniforms.uCore.value = t3.rtCore.texture;
    t3.adaptMat.uniforms.uPrev.value = t3.rtAdaptA.texture;
    t3.adaptMat.uniforms.uResolution.value.copy(res);
}
t3.quad.material = t3.adaptMat;
t3.renderer.setRenderTarget(t3.rtAdaptB);
t3.renderer.render(t3.scene, t3.camera);

// 3. Composite Pass (CA + Dispersion + Afterimage)
if (t3.compMat && t3.compMat.uniforms) {
    t3.compMat.uniforms.uCore.value = t3.rtCore.texture;
    t3.compMat.uniforms.uAdapt.value = t3.rtAdaptB.texture;
    t3.compMat.uniforms.uResolution.value.copy(res);
}
t3.quad.material = t3.compMat;
t3.renderer.setRenderTarget(null);
t3.renderer.render(t3.scene, t3.camera);

// Swap ping-pong buffers for temporal feedback
const temp = t3.rtAdaptA;
t3.rtAdaptA = t3.rtAdaptB;
t3.rtAdaptB = temp;