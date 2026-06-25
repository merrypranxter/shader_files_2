if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        const fs = `
        in vec2 vUv;
        out vec4 fragColor;
        
        uniform float u_time;
        uniform vec2 u_resolution;
        uniform vec2 u_mouse;
        uniform float u_click;
        uniform int u_colorMode;
        uniform int u_domainMode;
        uniform int u_falseColorMetric;
        uniform float u_exaggerateChroma;
        uniform int u_sliceMode;
        uniform int u_plasma;

        #define PI 3.14159265359

        vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
        vec2 cdiv(vec2 a, vec2 b) { float d = dot(b,b); return vec2(dot(a,b), a.y*b.x - a.x*b.y)/d; }
        vec2 cpow(vec2 z, float n) { float r=length(z); float a=atan(z.y,z.x); return pow(r,n)*vec2(cos(n*a), sin(n*a)); }
        vec2 csqr(vec2 z) { return vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y); }

        float gyroid(vec3 p) {
            return dot(sin(p), cos(p.yzx));
        }

        float map(vec3 p) {
            float scale = 1.8;
            p *= scale;
            float g = gyroid(p);
            float thickness = 0.15 + 0.15 * sin(u_time * 0.4);
            float d = abs(g) - thickness;
            
            if (u_sliceMode > 0) {
                float slice = p.z + p.x - (sin(u_time)*3.0);
                d = max(d, slice);
            }
            return d / scale * 0.45;
        }

        vec3 calcNormal(vec3 p) {
            vec2 e = vec2(0.01, 0.0);
            return normalize(vec3(
                map(p + e.xyy) - map(p - e.xyy),
                map(p + e.yxy) - map(p - e.yxy),
                map(p + e.yyx) - map(p - e.yyx)
            ));
        }

        vec3 palette(float t, int mode) {
            vec3 a, b, c, d;
            if (mode == 0) {
                a = vec3(0.8, 0.5, 0.7); b = vec3(0.5, 0.4, 0.6); c = vec3(1.0); d = vec3(0.0, 0.33, 0.67);
            } else if (mode == 1) {
                a = vec3(0.4, 0.7, 0.6); b = vec3(0.3, 0.6, 0.5); c = vec3(1.0); d = vec3(0.2, 0.5, 0.8);
            } else if (mode == 2) {
                a = vec3(0.7, 0.3, 0.6); b = vec3(0.6, 0.2, 0.5); c = vec3(1.0); d = vec3(0.1, 0.4, 0.9);
            } else if (mode == 3) {
                a = vec3(0.5, 0.2, 0.8); b = vec3(0.4, 0.6, 0.7); c = vec3(1.0); d = vec3(0.4, 0.0, 0.7);
            } else {
                a = vec3(0.8, 0.4, 0.3); b = vec3(0.7, 0.5, 0.2); c = vec3(1.0); d = vec3(0.0, 0.15, 0.3);
            }
            return clamp(a + b * cos(6.28318 * (c * t + d)), 0.0, 1.0);
        }

        vec3 domainColor(vec3 p, vec3 n) {
            vec2 z;
            vec3 absN = abs(n);
            if (absN.x > absN.y && absN.x > absN.z) z = p.yz;
            else if (absN.y > absN.x && absN.y > absN.z) z = p.zx;
            else z = p.xy;
            
            z *= 2.0;
            vec2 w = z;
            
            if (u_domainMode == 0) w = cpow(z, 3.0) - vec2(1.0, 0.0);
            else if (u_domainMode == 1) w = cdiv(cpow(z, 3.0) - vec2(1.0, 0.0), csqr(z) + vec2(0.4, 0.3));
            else if (u_domainMode == 2) w = vec2(sin(z.x)*cosh(z.y), cos(z.x)*sinh(z.y));
            
            float arg = atan(w.y, w.x);
            float mag = length(w);
            float hue = arg / (2.0 * PI) + 0.5;
            
            float logmag = log2(mag + 1.0);
            float contour = fract(logmag * 2.0);
            contour = 0.8 + 0.2 * smoothstep(0.0, 0.1, abs(contour - 0.5));
            
            return palette(hue + u_time * 0.05, u_colorMode) * contour;
        }

        void main() {
            vec2 uv = (vUv - 0.5) * 2.0;
            uv.x *= u_resolution.x / u_resolution.y;
            
            vec3 ro = vec3(u_time*0.4, u_time*0.2, -3.0 + u_time*0.8);
            vec3 rd = normalize(vec3(uv, 1.0));
            
            float mx = (u_mouse.x - 0.5) * PI * 2.0;
            float my = (u_mouse.y - 0.5) * PI;
            mat2 rx = mat2(cos(mx), -sin(mx), sin(mx), cos(mx));
            mat2 ry = mat2(cos(my), -sin(my), sin(my), cos(my));
            rd.yz *= ry;
            rd.xz *= rx;
            
            float t = 0.0;
            float max_t = 30.0;
            vec3 p;
            float glow = 0.0;
            
            for (int i = 0; i < 80; i++) {
                p = ro + rd * t;
                float d = map(p);
                if (d < 0.005 || t > max_t) break;
                t += d;
                glow += 0.015 / (0.01 + abs(d));
            }
            
            vec3 col = vec3(0.0);
            
            if (t < max_t) {
                vec3 n = calcNormal(p);
                
                float metric = 0.0;
                if (u_falseColorMetric == 0) metric = t * 0.05;
                else if (u_falseColorMetric == 1) metric = length(n.xy);
                else if (u_falseColorMetric == 2) metric = dot(sin(p*4.0), cos(p.yzx*4.0));
                else if (u_falseColorMetric == 3) metric = abs(n.y);
                
                vec3 baseCol = domainColor(p, n);
                vec3 falseCol = palette(metric + u_time * 0.1, u_colorMode);
                
                float gamma = t * 0.2 + dot(n, -rd) * 3.0;
                vec3 shimmer = palette(gamma, (u_colorMode + 1) % 5);
                
                col = mix(baseCol, falseCol, 0.5);
                col = mix(col, shimmer, 0.4);
                
                float depthHue = clamp(1.0 - t/max_t, 0.0, 1.0);
                vec3 chromaD = palette(depthHue, (u_colorMode + 2) % 5);
                col = mix(col, chromaD, 0.2);
                
                if (u_plasma > 0) {
                    float pl = sin(p.x*8.0 + u_time*3.0)*sin(p.y*8.0)*sin(p.z*8.0);
                    col += vec3(0.1, 0.8, 1.0) * smoothstep(0.8, 1.0, pl) * 2.0;
                }
                
                float pulse = smoothstep(0.8, 1.0, sin(length(p - ro) * 2.0 - u_time * 10.0)) * u_click;
                col += palette(length(p), (u_colorMode + 3) % 5) * pulse * 2.0;

                vec3 l = normalize(vec3(sin(u_time), 1.5, cos(u_time)));
                float ex = u_exaggerateChroma * 0.5 + 0.1;
                vec3 nR = normalize(n + vec3(ex, 0.0, 0.0));
                vec3 nB = normalize(n - vec3(ex, 0.0, 0.0));
                
                vec3 diff = vec3(max(dot(nR, l), 0.0), max(dot(n, l), 0.0), max(dot(nB, l), 0.0));
                vec3 spec = vec3(
                    pow(max(dot(reflect(-l, nR), -rd), 0.0), 32.0),
                    pow(max(dot(reflect(-l, n), -rd), 0.0), 32.0),
                    pow(max(dot(reflect(-l, nB), -rd), 0.0), 32.0)
                );
                float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
                
                col = col * (diff * 0.7 + 0.3) + spec * 0.8 + fresnel * palette(u_time*0.2, u_colorMode);
                
                float fog = exp(-t * 0.08);
                vec3 bg = palette(rd.y * 0.5 + 0.5 + u_time*0.05, u_colorMode) * 0.25;
                bg += palette(length(uv) + u_time*0.1, (u_colorMode + 1) % 5) * 0.15;
                col = mix(bg, col, fog);
            } else {
                col = palette(rd.y * 0.5 + 0.5 + u_time*0.05, u_colorMode) * 0.25;
                col += palette(length(uv) + u_time*0.1, (u_colorMode + 1) % 5) * 0.15;
            }
            
            col += palette(t * 0.1, u_colorMode) * glow * 0.05;
            
            col = col / (1.0 + col);
            col = pow(col, vec3(1.0/2.2));
            
            fragColor = vec4(col, 1.0);
        }`;

        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2() },
                u_mouse: { value: new THREE.Vector2() },
                u_click: { value: 0 },
                u_colorMode: { value: 0 },
                u_domainMode: { value: 0 },
                u_falseColorMetric: { value: 0 },
                u_exaggerateChroma: { value: 0.0 },
                u_sliceMode: { value: 0 },
                u_plasma: { value: 1 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: fs
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);
        
        canvas.__three = { renderer, scene, camera, material };
        canvas.__state = {
            colorMode: 0,
            domainMode: 0,
            falseColorMetric: 0,
            exaggerateChroma: 0.0,
            sliceMode: 0,
            plasma: 1
        };

        const keyHandler = (e) => {
            const s = canvas.__state;
            const k = e.key.toLowerCase();
            if(k === 'c') s.colorMode = (s.colorMode + 1) % 5;
            if(k === 'd') s.domainMode = (s.domainMode + 1) % 3;
            if(k === 'f') s.falseColorMetric = (s.falseColorMetric + 1) % 4;
            if(k === 'x') s.exaggerateChroma = s.exaggerateChroma > 0.5 ? 0.0 : 1.0;
            if(k === 'g') s.sliceMode = s.sliceMode > 0 ? 0 : 1;
            if(k === 'p') s.plasma = s.plasma > 0 ? 0 : 1;
        };
        window.addEventListener('keydown', keyHandler);
        canvas.__keyHandler = keyHandler;

    } catch (e) {
        return;
    }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
    
    let mx = mouse.x / grid.width;
    let my = mouse.y / grid.height;
    if (mx === 0 && my === 0) { mx = 0.5; my = 0.5; }
    material.uniforms.u_mouse.value.set(mx, my);
    
    material.uniforms.u_click.value = mouse.isPressed ? 1.0 : 0.0;
    
    const s = canvas.__state;
    material.uniforms.u_colorMode.value = s.colorMode;
    material.uniforms.u_domainMode.value = s.domainMode;
    material.uniforms.u_falseColorMetric.value = s.falseColorMetric;
    material.uniforms.u_exaggerateChroma.value = s.exaggerateChroma;
    material.uniforms.u_sliceMode.value = s.sliceMode;
    material.uniforms.u_plasma.value = s.plasma;
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);