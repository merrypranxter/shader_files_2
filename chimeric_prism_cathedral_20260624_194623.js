try {
    if (!ctx) throw new Error("WebGL2 context not available");

    const w = grid.width;
    const h = grid.height;

    if (!canvas.__three) {
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const scene = new THREE.Scene();
        const geometry = new THREE.PlaneGeometry(2, 2);

        const rtOpts = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            depthBuffer: false,
            stencilBuffer: false
        };

        const pingRT = new THREE.WebGLRenderTarget(w, h, rtOpts);
        const pongRT = new THREE.WebGLRenderTarget(w, h, rtOpts);
        const mainRT = new THREE.WebGLRenderTarget(w, h, rtOpts);

        const commonGLSL = `
            #define PI 3.14159265359

            vec3 spectralWyman(float l) {
                float x = 1.056*exp(-0.5*pow((l-599.8)/37.9,2.0)) + 0.362*exp(-0.5*pow((l-442.0)/16.0,2.0)) - 0.065*exp(-0.5*pow((l-501.1)/20.4,2.0));
                float y = 0.821*exp(-0.5*pow((l-568.8)/46.9,2.0)) + 0.286*exp(-0.5*pow((l-530.9)/16.3,2.0));
                float z = 1.217*exp(-0.5*pow((l-437.0)/11.8,2.0)) + 0.681*exp(-0.5*pow((l-459.0)/26.0,2.0));
                vec3 rgb = vec3(
                     3.2406*x - 1.5372*y - 0.4986*z,
                    -0.9689*x + 1.8758*y + 0.0415*z,
                     0.0557*x - 0.2040*y + 1.0570*z
                );
                return max(rgb, vec3(0.0));
            }

            float hash21(vec2 p) {
                return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
            }

            mat2 rot(float a) {
                float s = sin(a), c = cos(a);
                return mat2(c, -s, s, c);
            }
        `;

        const plasmaMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tPrev: { value: null },
                uTime: { value: 0 },
                uMouse: { value: new THREE.Vector2(0.5, 0.5) },
                uClick: { value: 0 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                ${commonGLSL}
                uniform sampler2D tPrev;
                uniform float uTime;
                uniform vec2 uMouse;
                uniform float uClick;
                in vec2 vUv;
                out vec4 fragColor;

                void main() {
                    vec4 prev = texture(tPrev, vUv);
                    prev.rgb *= 0.94; 

                    vec2 p = vUv * 2.0 - 1.0;
                    
                    float plasma = 0.0;
                    for(float i = 1.0; i <= 3.0; i += 1.0) {
                        vec2 q = p * (0.8 + i * 0.2);
                        q.x += sin(q.y * 5.0 + uTime * i * 0.5) * 0.2;
                        q.y += cos(q.x * 4.0 - uTime * i * 0.4) * 0.2;
                        plasma += 0.004 / (abs(q.x) + 0.001);
                        plasma += 0.004 / (abs(q.y) + 0.001);
                    }
                    vec3 pCol = spectralWyman(450.0 + fract(uTime * 0.05) * 200.0);
                    prev.rgb += pCol * plasma * 0.6;

                    float dM = length(vUv - uMouse);
                    if (uClick > 0.05 && dM < 0.15) {
                        vec3 opp = vec3(-0.8, 1.5, -0.8); 
                        prev.rgb += opp * smoothstep(0.15, 0.0, dM) * uClick * 2.0;
                    }

                    fragColor = vec4(max(prev.rgb, vec3(0.0)), 1.0);
                }
            `
        });

        const mainMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tPlasma: { value: null },
                uTime: { value: 0 },
                uAspect: { value: w / h },
                uPalette: { value: 0 },
                uGlass: { value: 1 },
                uAlchemy: { value: 1 },
                uBiref: { value: 1 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                ${commonGLSL}
                uniform sampler2D tPlasma;
                uniform float uTime;
                uniform float uAspect;
                uniform float uPalette;
                uniform float uGlass;
                uniform float uAlchemy;
                uniform float uBiref;
                in vec2 vUv;
                out vec4 fragColor;

                float sdTriangle(vec2 p, float r) {
                    const float k = sqrt(3.0);
                    p.x = abs(p.x) - r;
                    p.y = p.y + r/k;
                    if(p.x+k*p.y>0.0) p = vec2(p.x-k*p.y, -k*p.x-p.y)/2.0;
                    p.x -= clamp(p.x, -2.0*r, 0.0);
                    return -length(p)*sign(p.y);
                }

                float sdHexagram(vec2 p, float r) {
                    vec2 q = abs(p);
                    const vec3 k = vec3(-0.5, 0.8660254038, 0.5773502692);
                    q -= 2.0*min(dot(k.xy, q), 0.0)*k.xy;
                    q -= 2.0*min(dot(k.yx, q), 0.0)*k.yx;
                    q -= vec2(clamp(q.x, r*k.z, r*k.y), r);
                    return length(q)*sign(q.y);
                }

                float sdCross(vec2 p, vec2 b) {
                    p = abs(p); p = (p.y>p.x) ? p.yx : p.xy;
                    vec2 q = p - b;
                    float k = max(q.y, q.x);
                    vec2 w = (k>0.0) ? q : vec2(b.y-p.x, -k);
                    return sign(k)*length(max(w,0.0));
                }

                void main() {
                    vec2 uv = vUv * 2.0 - 1.0;
                    uv.x *= uAspect;

                    vec3 col = vec3(0.08, 0.0, 0.22); 

                    float stress = 0.0;
                    vec2 n1 = vec2(sin(uTime), cos(uTime*0.8)) * 0.6;
                    vec2 n2 = vec2(-sin(uTime*0.5), -cos(uTime*1.1)) * 0.6;
                    stress += 0.08 / (length(uv - n1) + 0.05);
                    stress += 0.08 / (length(uv - n2) + 0.05);
                    float gamma = stress * 2200.0 * uBiref;
                    
                    vec3 bCol = vec3(0.0);
                    for(float l = 400.0; l <= 700.0; l += 50.0) {
                        bCol += spectralWyman(l) * pow(sin(PI * gamma / l), 2.0);
                    }
                    bCol /= 7.0;
                    col = max(col, bCol * 1.8);

                    float r = length(uv);
                    float a = atan(uv.y, uv.x);
                    float pShift = uPalette * 0.25;

                    float mandala1 = r + cos(a * 8.0) * 0.15;
                    float mandala2 = r + sin(a * 12.0) * 0.1;
                    float arch1 = abs(fract(mandala1 * 3.5 - uTime * 0.1) - 0.5);
                    float arch2 = abs(fract(mandala2 * 5.0 + uTime * 0.15) - 0.5);

                    vec3 aCol1 = spectralWyman(400.0 + fract(mandala1 + pShift) * 300.0);
                    vec3 aCol2 = spectralWyman(400.0 + fract(mandala2 * 1.5 - pShift) * 300.0);

                    col += aCol1 * smoothstep(0.08, 0.02, arch1);
                    col += aCol2 * smoothstep(0.05, 0.01, arch2);

                    if (uGlass > 0.5) {
                        vec2 gv = fract(uv * 50.0) - 0.5;
                        vec2 id = floor(uv * 50.0);
                        float h = hash21(id);
                        vec2 offset = vec2(0.0);
                        if (h < 0.5) {
                            offset = vec2(cos(a * 8.0), sin(a * 8.0)) * 0.25;
                        }
                        float dotMask = smoothstep(0.35, 0.1, length(gv - offset));
                        col += spectralWyman(500.0 + h * 150.0) * dotMask * 0.9;
                    }

                    float diff = sin(r * 200.0 + a * 20.0 + uTime * 3.0);
                    vec3 diffCol = spectralWyman(400.0 + fract(a / PI + uTime * 0.05) * 300.0);
                    col += diffCol * smoothstep(0.92, 1.0, diff) * 0.5 * smoothstep(0.2, 0.9, r);

                    if (uAlchemy > 0.5) {
                        for(int i = 0; i < 4; i++) {
                            float sa = float(i) * PI / 2.0 + uTime * 0.15;
                            vec2 sp = vec2(cos(sa), sin(sa)) * 0.65;
                            vec2 localP = uv - sp;
                            float la = -uTime * 0.4;
                            localP = rot(la) * localP;

                            float sd = 1.0;
                            if (i == 0) sd = sdTriangle(localP, 0.08);
                            else if (i == 1) sd = sdHexagram(localP, 0.09);
                            else if (i == 2) sd = sdCross(localP, vec2(0.08, 0.02));
                            else sd = abs(length(localP) - 0.08) - 0.01;

                            float cell = smoothstep(0.18, 0.17, length(uv - sp));
                            vec3 cellCol = spectralWyman(700.0 - float(i) * 80.0);
                            col = mix(col, cellCol * 0.4, cell);

                            col += spectralWyman(450.0 + float(i) * 70.0) * smoothstep(0.015, 0.005, abs(sd)) * 1.5;
                        }
                    }

                    float warp = r * 1.5 - uTime * 0.4;
                    mat2 cm = rot(warp);
                    vec2 rgWarp = cm * col.rg;
                    col = mix(col, vec3(abs(rgWarp), col.b), 0.3);

                    vec4 plasma = texture(tPlasma, vUv);
                    col += plasma.rgb;

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        const postMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tMain: { value: null },
                uDepthCA: { value: 1 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tMain;
                uniform float uDepthCA;
                in vec2 vUv;
                out vec4 fragColor;

                void main() {
                    vec3 col = texture(tMain, vUv).rgb;

                    vec2 dir = normalize(vUv - 0.5);
                    float dist = length(vUv - 0.5);
                    float shift = 0.008 * uDepthCA * dist;

                    float r = texture(tMain, vUv + dir * shift).r;
                    float b = texture(tMain, vUv - dir * shift).b;
                    col.r = max(col.r, r);
                    col.b = max(col.b, b);

                    vec3 bloom = vec3(0.0);
                    vec2 tx = 1.0 / vec2(800.0); 
                    bloom += texture(tMain, vUv + vec2(tx.x, tx.y)*3.0).rgb;
                    bloom += texture(tMain, vUv + vec2(-tx.x, -tx.y)*3.0).rgb;
                    bloom += texture(tMain, vUv + vec2(tx.x, -tx.y)*3.0).rgb;
                    bloom += texture(tMain, vUv + vec2(-tx.x, tx.y)*3.0).rgb;
                    bloom *= 0.25;

                    col += bloom * vec3(1.0, 0.4, 0.8) * 0.6;

                    float lum = dot(col, vec3(0.299, 0.587, 0.114));
                    if (lum > 1.2) {
                        col = mix(col, vec3(1.0, 0.2, 0.6), clamp((lum - 1.2)*0.4, 0.0, 1.0));
                    }
                    col = col / (1.0 + lum * 0.15); 

                    col = max(col, vec3(0.05, 0.0, 0.15));

                    fragColor = vec4(col, 1.0);
                }
            `
        });

        const mesh = new THREE.Mesh(geometry, plasmaMat);
        scene.add(mesh);

        const params = {
            palette: 0,
            glass: 1,
            alchemy: 1,
            depth: 1,
            biref: 1,
            click: 0,
            mouseX: 0.5,
            mouseY: 0.5
        };

        const onKeyDown = (e) => {
            const k = e.key.toLowerCase();
            if (k === 'c') params.palette = (params.palette + 1) % 5;
            if (k === 'g') params.glass = 1 - params.glass;
            if (k === 'a') params.alchemy = 1 - params.alchemy;
            if (k === 'd') params.depth = 1 - params.depth;
            if (k === 'b') params.biref = 1 - params.biref;
        };
        
        const onPointerMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            params.mouseX = (e.clientX - rect.left) / rect.width;
            params.mouseY = 1.0 - (e.clientY - rect.top) / rect.height;
        };
        
        const onPointerDown = () => { params.click = 1.0; };

        window.addEventListener('keydown', onKeyDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerdown', onPointerDown);

        canvas.__three = { 
            renderer, scene, camera, mesh, 
            plasmaMat, mainMat, postMat, 
            pingRT, pongRT, mainRT, params,
            cleanup: () => {
                window.removeEventListener('keydown', onKeyDown);
                canvas.removeEventListener('pointermove', onPointerMove);
                canvas.removeEventListener('pointerdown', onPointerDown);
            }
        };
    }

    const t = canvas.__three;
    t.renderer.setSize(w, h, false);
    
    t.plasmaMat.uniforms.uTime.value = time;
    t.plasmaMat.uniforms.uMouse.value.set(t.params.mouseX, t.params.mouseY);
    t.plasmaMat.uniforms.uClick.value = t.params.click;
    t.params.click *= 0.8; 

    t.plasmaMat.uniforms.tPrev.value = t.pingRT.texture;
    t.mesh.material = t.plasmaMat;
    t.renderer.setRenderTarget(t.pongRT);
    t.renderer.render(t.scene, t.camera);

    let temp = t.pingRT;
    t.pingRT = t.pongRT;
    t.pongRT = temp;

    t.mainMat.uniforms.uTime.value = time;
    t.mainMat.uniforms.uAspect.value = w / h;
    t.mainMat.uniforms.uPalette.value = t.params.palette;
    t.mainMat.uniforms.uGlass.value = t.params.glass;
    t.mainMat.uniforms.uAlchemy.value = t.params.alchemy;
    t.mainMat.uniforms.uBiref.value = t.params.biref;
    t.mainMat.uniforms.tPlasma.value = t.pingRT.texture;
    
    t.mesh.material = t.mainMat;
    t.renderer.setRenderTarget(t.mainRT);
    t.renderer.render(t.scene, t.camera);

    t.postMat.uniforms.tMain.value = t.mainRT.texture;
    t.postMat.uniforms.uDepthCA.value = t.params.depth;
    
    t.mesh.material = t.postMat;
    t.renderer.setRenderTarget(null);
    t.renderer.render(t.scene, t.camera);

} catch (e) {
    console.error("Chimeric Prism Cathedral error:", e);
}