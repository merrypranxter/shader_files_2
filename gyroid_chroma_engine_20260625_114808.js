if (!canvas.__appState) {
    canvas.__appState = {
        colorMode: 0,
        domainMode: 0,
        falseColorMetric: 0,
        stereoExaggeration: 0.0,
        sliceMode: 0,
        plasma: 1
    };
    canvas.__keydownListener = (e) => {
        const key = e.key.toLowerCase();
        const state = canvas.__appState;
        if(key === 'c') state.colorMode = (state.colorMode + 1) % 5;
        if(key === 'd') state.domainMode = (state.domainMode + 1) % 4;
        if(key === 'f') state.falseColorMetric = (state.falseColorMetric + 1) % 3;
        if(key === 'x') state.stereoExaggeration = state.stereoExaggeration > 0.0 ? 0.0 : 1.0;
        if(key === 'g') state.sliceMode = state.sliceMode === 0 ? 1 : 0;
        if(key === 'p') state.plasma = state.plasma === 0 ? 1 : 0;
    };
    window.addEventListener('keydown', canvas.__keydownListener);
}

if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.autoClear = false;
        
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        const sceneUniforms = {
            u_time: { value: 0 },
            u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
            u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
            u_colorMode: { value: 0 },
            u_domainMode: { value: 0 },
            u_falseColorMetric: { value: 0 },
            u_stereoExaggeration: { value: 0.0 },
            u_sliceMode: { value: 0 },
            u_plasma: { value: 1 }
        };
        
        const sceneMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: sceneUniforms,
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                out vec4 fragColor;
                in vec2 vUv;
                
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform vec2 u_mouse;
                uniform int u_colorMode;
                uniform int u_domainMode;
                uniform int u_falseColorMetric;
                uniform float u_stereoExaggeration;
                uniform int u_sliceMode;
                uniform int u_plasma;
                
                #define PI 3.14159265359
                
                vec2 c_mul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
                vec2 c_div(vec2 a, vec2 b) { float d = dot(b,b); return vec2(dot(a,b), a.y*b.x - a.x*b.y)/(d + 0.0001); }
                vec2 c_pow(vec2 z, float n) { float r = length(z); float a = atan(z.y, z.x); return pow(r, n) * vec2(cos(n*a), sin(n*a)); }
                
                float gyroid(vec3 p) {
                    return dot(sin(p), cos(p.yzx));
                }
                
                float map(vec3 p) {
                    vec3 q = p;
                    float scale = 2.0 + 0.1 * sin(u_time * 0.3);
                    q *= scale;
                    float g = gyroid(q);
                    float d = abs(g) - 0.15; 
                    
                    if (u_sliceMode == 1) {
                        float slice = abs(fract(p.y * 2.0 - u_time * 0.5) - 0.5) - 0.1;
                        d = max(d, slice);
                    }
                    
                    return d / scale * 0.6; 
                }
                
                vec3 calcNormal(vec3 p) {
                    vec2 e = vec2(0.002, 0.0);
                    return normalize(vec3(
                        map(p + e.xyy) - map(p - e.xyy),
                        map(p + e.yxy) - map(p - e.yxy),
                        map(p + e.yyx) - map(p - e.yyx)
                    ));
                }
                
                void main() {
                    vec2 uv = (vUv - 0.5) * 2.0;
                    uv.x *= u_resolution.x / u_resolution.y;
                    
                    vec2 m = (u_mouse - 0.5) * 2.0;
                    
                    vec3 ro = vec3(0.0, 0.0, 2.0 + u_time * 0.6);
                    ro.xy += m * 0.5; 
                    
                    vec3 ta = ro + vec3(0.0, 0.0, 1.0);
                    ta.xy += m * 0.2; 
                    
                    ro.x += sin(u_time * 0.2) * 0.5;
                    ro.y += cos(u_time * 0.25) * 0.5;
                    
                    vec3 ww = normalize(ta - ro);
                    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
                    vec3 vv = normalize(cross(uu, ww));
                    
                    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.0 * ww);
                    
                    float t = 0.0;
                    float d = 0.0;
                    vec3 p;
                    float glow = 0.0;
                    
                    for(int i = 0; i < 90; i++) {
                        p = ro + rd * t;
                        d = map(p);
                        
                        if (u_plasma == 1) {
                            vec2 filament = p.xy - vec2(sin(p.z * 1.5 + u_time), cos(p.z * 1.2 - u_time)) * 0.6;
                            float dist = length(filament);
                            glow += 0.005 / (0.01 + dist * dist);
                            
                            vec2 filament2 = p.xy - vec2(cos(p.z * 1.1 + u_time*1.2), sin(p.z * 1.4 - u_time*0.8)) * 0.5;
                            float dist2 = length(filament2);
                            glow += 0.004 / (0.01 + dist2 * dist2);
                        }
                        
                        if(d < 0.002 || t > 12.0) {
                            break;
                        }
                        t += d;
                    }
                    
                    vec3 col = vec3(0.0);
                    
                    if(t < 12.0) {
                        vec3 n = calcNormal(p);
                        
                        vec2 z;
                        if(u_domainMode == 0) z = p.xy;
                        else if (u_domainMode == 1) z = vec2(dot(n, uu), dot(n, vv)) * 3.0;
                        else if (u_domainMode == 2) z = vec2(atan(p.y, p.x), p.z);
                        else z = p.yz;
                        
                        vec2 w;
                        if(u_domainMode == 0) w = c_pow(z, 3.0) - vec2(1.0, 0.0);
                        else if (u_domainMode == 1) w = c_div(c_pow(z, 2.0) - vec2(1.0, 0.0), c_pow(z, 2.0) + vec2(0.4, 0.3));
                        else if (u_domainMode == 2) w = vec2(sin(z.x)*cosh(z.y), cos(z.x)*sinh(z.y));
                        else w = c_mul(z, vec2(cos(u_time), sin(u_time)));
                        
                        float phase = atan(w.y, w.x);
                        float mag = length(w);
                        
                        float metric = 0.0;
                        if(u_falseColorMetric == 0) metric = phase / PI;
                        else if(u_falseColorMetric == 1) metric = log(mag + 1.0);
                        else metric = fract(p.z * 1.5 - u_time * 0.2);
                        
                        vec3 baseCol;
                        if(u_colorMode == 0) { 
                            vec3 c1 = vec3(1.0, 0.0, 0.5); 
                            vec3 c2 = vec3(0.0, 1.0, 1.0); 
                            vec3 c3 = vec3(1.0, 1.0, 0.0); 
                            float mt = metric * 2.0;
                            baseCol = mix(c1, c2, 0.5 + 0.5 * sin(mt * PI));
                            baseCol = mix(baseCol, c3, smoothstep(0.8, 1.0, sin(phase * 5.0)));
                        } else if(u_colorMode == 1) { 
                            float thickness = 1.0 - abs(dot(rd, n));
                            float gamma = thickness * 2500.0 * (0.5 + 0.5 * sin(metric * PI));
                            vec3 interference = 0.5 + 0.5 * cos(PI * gamma / vec3(600.0, 530.0, 440.0));
                            baseCol = mix(vec3(0.0, 0.8, 0.3), vec3(0.0, 0.2, 0.9), 0.5 + 0.5 * sin(gamma/500.0));
                            baseCol = mix(baseCol, vec3(1.0, 0.0, 0.1), interference.r);
                            baseCol = max(baseCol, interference);
                        } else if(u_colorMode == 2) { 
                            float u = fract(metric * 0.5 + u_time * 0.2);
                            baseCol = vec3(
                                smoothstep(0.7, 0.0, abs(u - 0.2)),
                                smoothstep(0.7, 0.0, abs(u - 0.5)),
                                smoothstep(0.7, 0.0, abs(u - 0.8))
                            );
                            baseCol = mix(baseCol, vec3(0.6, 0.0, 1.0), smoothstep(0.4, 0.0, abs(u - 0.9)));
                            baseCol += vec3(0.8, 1.0, 0.0) * smoothstep(0.9, 1.0, sin(phase * 3.0));
                        } else if(u_colorMode == 3) { 
                            baseCol = mix(vec3(0.1, 0.0, 0.4), vec3(0.0, 0.5, 0.5), 0.5 + 0.5 * sin(mag * 5.0));
                            baseCol += vec3(1.0, 0.0, 0.8) * smoothstep(0.8, 1.0, sin(phase * 8.0));
                        } else { 
                            baseCol = mix(vec3(0.0, 0.8, 0.8), vec3(1.0, 0.4, 0.3), 0.5 + 0.5 * sin(p.z * PI + u_time));
                            baseCol = mix(baseCol, vec3(1.0, 0.6, 0.0), smoothstep(0.7, 1.0, cos(phase * 4.0)));
                        }
                        
                        baseCol = max(baseCol, vec3(0.05, 0.0, 0.15));
                        
                        float depthHue = clamp(t / 10.0, 0.0, 1.0);
                        vec3 depthCol = mix(vec3(1.0, 0.0, 0.1), vec3(0.0, 0.1, 1.0), depthHue);
                        baseCol = mix(baseCol, depthCol, u_stereoExaggeration * 0.7);
                        
                        vec3 ld = normalize(vec3(sin(u_time), 1.0, cos(u_time)));
                        float diff = max(dot(n, ld), 0.0);
                        vec3 halfVec = normalize(ld - rd);
                        float spec = pow(max(dot(n, halfVec), 0.0), 64.0);
                        
                        float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
                        vec3 rainbow = 0.5 + 0.5 * cos(PI * (fresnel * 3.0 + vec3(0.0, 0.33, 0.67)));
                        
                        col = baseCol * (diff * 0.7 + 0.3);
                        col += rainbow * fresnel * 2.0;
                        col += spec * vec3(1.0, 0.9, 0.8) * 1.5;
                        
                        col = mix(col, vec3(0.05, 0.0, 0.15), clamp(t / 12.0, 0.0, 1.0));
                    } else {
                        col = mix(vec3(0.05, 0.0, 0.15), vec3(0.2, 0.0, 0.1), uv.y * 0.5 + 0.5);
                    }
                    
                    if (u_plasma == 1) {
                        col += vec3(0.0, 0.8, 1.0) * glow * 0.15;
                        col += vec3(1.0, 0.0, 0.5) * glow * 0.08;
                    }
                    
                    fragColor = vec4(col, 1.0);
                }
            `
        });
        
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sceneMaterial);
        scene.add(quad);
        
        const renderTarget = new THREE.WebGLRenderTarget(grid.width, grid.height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType
        });
        
        const postScene = new THREE.Scene();
        const postUniforms = {
            tDiffuse: { value: renderTarget.texture },
            u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
        };
        
        const postMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: postUniforms,
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                out vec4 fragColor;
                in vec2 vUv;
                
                uniform sampler2D tDiffuse;
                uniform vec2 u_resolution;
                
                vec3 aces(vec3 x) {
                    float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
                    return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
                }
                
                void main() {
                    vec2 uv = vUv;
                    
                    vec2 offset = (uv - 0.5) * 0.012;
                    float r = texture(tDiffuse, uv + offset).r;
                    float g = texture(tDiffuse, uv).g;
                    float b = texture(tDiffuse, uv - offset).b;
                    vec3 col = vec3(r, g, b);
                    
                    vec3 bloom = vec3(0.0);
                    vec2 texel = 1.0 / u_resolution;
                    float weightSum = 0.0;
                    for(float x = -2.0; x <= 2.0; x++) {
                        for(float y = -2.0; y <= 2.0; y++) {
                            vec3 s = texture(tDiffuse, uv + vec2(x, y) * texel * 3.0).rgb;
                            float w = exp(-(x*x + y*y) * 0.2);
                            bloom += max(s - 0.8, 0.0) * w;
                            weightSum += w;
                        }
                    }
                    col += (bloom / weightSum) * 1.5;
                    
                    col = aces(col);
                    col = pow(col, vec3(1.0 / 2.2));
                    
                    float dist = length(uv - 0.5);
                    col *= smoothstep(0.8, 0.25, dist);
                    
                    fragColor = vec4(col, 1.0);
                }
            `
        });
        
        const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial);
        postScene.add(postQuad);
        
        canvas.__three = { renderer, scene, camera, renderTarget, postScene, sceneUniforms, postUniforms };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        return;
    }
}

const { renderer, scene, camera, renderTarget, postScene, sceneUniforms, postUniforms } = canvas.__three;

if (sceneUniforms) {
    sceneUniforms.u_time.value = time;
    sceneUniforms.u_resolution.value.set(grid.width, grid.height);
    sceneUniforms.u_mouse.value.set(mouse.x / grid.width, mouse.y / grid.height);
    
    const state = canvas.__appState;
    sceneUniforms.u_colorMode.value = state.colorMode;
    sceneUniforms.u_domainMode.value = state.domainMode;
    sceneUniforms.u_falseColorMetric.value = state.falseColorMetric;
    sceneUniforms.u_stereoExaggeration.value = state.stereoExaggeration;
    sceneUniforms.u_sliceMode.value = state.sliceMode;
    sceneUniforms.u_plasma.value = state.plasma;
}

if (postUniforms) {
    postUniforms.u_resolution.value.set(grid.width, grid.height);
}

if (renderTarget.width !== grid.width || renderTarget.height !== grid.height) {
    renderTarget.setSize(grid.width, grid.height);
    renderer.setSize(grid.width, grid.height, false);
}

renderer.setRenderTarget(renderTarget);
renderer.render(scene, camera);

renderer.setRenderTarget(null);
renderer.render(postScene, camera);