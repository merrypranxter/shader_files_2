if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        renderer.autoClear = false;
        
        const depthTarget = new THREE.WebGLRenderTarget(grid.width, grid.height, {
            format: THREE.RGBAFormat,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter
        });
        
        const sceneDepth = new THREE.Scene();
        const sceneStereo = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        const depthMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float u_time;
                uniform vec2 u_resolution;
                in vec2 vUv;
                out vec4 fragColor;
                
                mat2 rot(float a) {
                    float s = sin(a), c = cos(a);
                    return mat2(c, -s, s, c);
                }
                
                float smin(float a, float b, float k) {
                    float h = max(k - abs(a-b), 0.0)/k;
                    return min(a, b) - h*h*k*(1.0/4.0);
                }

                float map(vec3 p) {
                    vec3 bp = p;
                    p.xy *= rot(u_time * 0.4);
                    p.yz *= rot(u_time * 0.3);
                    
                    float sphere = length(p) - 0.65;
                    float gyroid = abs(dot(sin(p * 8.0), cos(p.zxy * 8.0))) - 0.2;
                    gyroid *= 0.125; 
                    float core = max(sphere, gyroid);
                    
                    float r = length(p.xy);
                    float a = atan(p.y, p.x);
                    float c = cos(a * 4.0);
                    float s = sin(a * 4.0);
                    vec3 q = vec3(r - 0.7 - c * 0.15, p.z - s * 0.15, 0.0);
                    float knot = length(q.xy) - 0.06;
                    
                    float d = smin(core, knot, 0.15);
                    
                    d -= 0.015 * sin(25.0*bp.x + u_time)*sin(25.0*bp.y)*sin(25.0*bp.z);
                    
                    return d;
                }

                void main() {
                    vec2 ndc = vUv - 0.5;
                    ndc.x *= u_resolution.x / u_resolution.y;

                    vec3 ro = vec3(0.0, 0.0, 2.4);
                    vec3 rd = normalize(vec3(ndc * 1.1, -1.6));

                    float tNear = 0.5;
                    float tFar  = 4.0;
                    float t = tNear;
                    float hit = -1.0;

                    for (int i = 0; i < 80; i++) {
                        vec3 pos = ro + rd * t;
                        float d = map(pos);
                        if (d < 0.002) { hit = t; break; }
                        t += d;
                        if (t > tFar) break;
                    }

                    float z = 0.0;
                    if (hit > 0.0) {
                        z = 1.0 - (hit - tNear) / (tFar - tNear);
                        z = clamp(z * 1.2, 0.0, 1.0);
                    } else {
                        vec2 tp = ndc * 4.0;
                        tp.y -= u_time * 0.2;
                        float h = sin(tp.x*3.0)*cos(tp.y*3.0) + sin(tp.x*7.0 + u_time)*0.5;
                        z = 0.05 + h * 0.05;
                    }
                    
                    z = clamp(z, 0.0, 1.0);
                    fragColor = vec4(z, z, z, 1.0);
                }
            `
        });
        
        const stereoMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_depthTex: { value: depthTarget.texture },
                u_E: { value: Math.max(100.0, grid.width / 8.0) },
                u_Mu: { value: 0.4 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform sampler2D u_depthTex;
                uniform float u_E;
                uniform float u_Mu;
                
                in vec2 vUv;
                out vec4 fragColor;
                
                vec3 pattern(vec2 uv) {
                    vec2 p = uv * 2.0 - 1.0;
                    float PI = 3.14159265359;
                    
                    float f = 0.0;
                    vec2 q = p;
                    float amp = 0.5;
                    for(int i=0; i<4; i++) {
                        q = vec2(cos(q.y * PI * 4.0 + u_time), sin(q.x * PI * 4.0 - u_time));
                        f += amp * abs(q.x * q.y);
                        amp *= 0.5;
                    }
                    
                    float rd = sin(p.x * PI * 8.0 + f * 10.0) * cos(p.y * PI * 8.0 + f * 10.0);
                    float rdMask = smoothstep(0.0, 0.15, rd) - smoothstep(0.15, 0.3, rd);
                    
                    float r = length(p);
                    float a = atan(p.y, p.x);
                    float moire = sin(r * PI * 20.0 - u_time * 2.0) * sin(a * 12.0 + r * 15.0);
                    
                    vec3 hotPink = vec3(1.0, 0.0, 0.6);
                    vec3 elecCyan = vec3(0.0, 1.0, 0.9);
                    vec3 toxicLime = vec3(0.6, 1.0, 0.0);
                    vec3 tangerine = vec3(1.0, 0.3, 0.0);
                    vec3 uviolet = vec3(0.5, 0.0, 1.0);
                    
                    vec2 dw = p;
                    dw.x += sin(p.y * PI * 2.0 + u_time) * 0.15;
                    dw.y += cos(p.x * PI * 2.0 - u_time) * 0.15;
                    
                    float n1 = sin(dw.x * PI * 4.0) * cos(dw.y * PI * 4.0);
                    float n2 = sin(dw.x * PI * 8.0 + a * 4.0);
                    
                    vec3 color = mix(hotPink, elecCyan, n1 * 0.5 + 0.5);
                    color = mix(color, toxicLime, rdMask);
                    color = mix(color, tangerine, moire * 0.5 + 0.5);
                    
                    vec2 fp = fract(p * 8.0) - 0.5;
                    float glyph = smoothstep(0.25, 0.2, length(fp) + 0.1*sin(6.0*atan(fp.y, fp.x) + u_time*4.0));
                    color = mix(color, uviolet, glyph * 0.9);
                    
                    float holo = sin(r * PI * 30.0 - u_time * 8.0);
                    color += vec3(holo, -holo, holo) * 0.3;
                    
                    float glitter = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
                    color += pow(glitter, 6.0) * 1.5;
                    
                    color += smoothstep(0.85, 1.0, sin(uv.x * PI * 10.0) * sin(uv.y * PI * 10.0)) * 0.4;
                    
                    return clamp(color, 0.0, 1.0);
                }

                void main() {
                    float E = max(u_E, 1.0);
                    float xPix = vUv.x * u_resolution.x;
                    
                    float u = xPix;
                    
                    for (int i = 0; i < 90; i++) {
                        if (u < E) break;
                        float sampleX = clamp(u / u_resolution.x, 0.0, 1.0);
                        float z = texture(u_depthTex, vec2(sampleX, vUv.y)).r;
                        float sep = E * (1.0 - u_Mu * z) / (2.0 - u_Mu * z);
                        sep = max(sep, 1.0);
                        u -= sep;
                    }
                    
                    float pu = u / E;
                    float pv = (vUv.y * u_resolution.y) / E;
                    vec3 col = pattern(vec2(pu, pv));
                    
                    vec2 px = vUv * u_resolution;
                    float cx = u_resolution.x * 0.5;
                    float cy = u_resolution.y * 0.92;
                    float rad = 6.0;
                    float d1 = length(px - vec2(cx - E * 0.5, cy));
                    float d2 = length(px - vec2(cx + E * 0.5, cy));
                    float dotDist = min(d1, d2);
                    float mask = smoothstep(rad + 1.5, rad - 1.5, dotDist);
                    col = mix(col, vec3(0.05), mask);
                    float core = smoothstep(rad * 0.5 + 1.0, rad * 0.5 - 1.0, dotDist);
                    col = mix(col, vec3(0.95), core);
                    
                    fragColor = vec4(col, 1.0);
                }
            `
        });
        
        const plane = new THREE.PlaneGeometry(2, 2);
        sceneDepth.add(new THREE.Mesh(plane, depthMat));
        sceneStereo.add(new THREE.Mesh(plane, stereoMat));
        
        canvas.__three = { renderer, depthTarget, sceneDepth, sceneStereo, camera, depthMat, stereoMat };
    } catch (e) {
        return;
    }
}

const { renderer, depthTarget, sceneDepth, sceneStereo, camera, depthMat, stereoMat } = canvas.__three;

if (depthTarget.width !== grid.width || depthTarget.height !== grid.height) {
    depthTarget.setSize(grid.width, grid.height);
}

if (depthMat && depthMat.uniforms) {
    depthMat.uniforms.u_time.value = time;
    depthMat.uniforms.u_resolution.value.set(grid.width, grid.height);
}

if (stereoMat && stereoMat.uniforms) {
    stereoMat.uniforms.u_time.value = time;
    stereoMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    stereoMat.uniforms.u_E.value = Math.max(100.0, grid.width / 8.0);
}

renderer.setSize(grid.width, grid.height, false);

renderer.setRenderTarget(depthTarget);
renderer.render(sceneDepth, camera);

renderer.setRenderTarget(null);
renderer.render(sceneStereo, camera);