try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL context required");

        const renderer = new THREE.WebGLRenderer({ canvas: canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const rtOpts = {
            type: THREE.FloatType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            wrapS: THREE.RepeatWrapping,
            wrapT: THREE.RepeatWrapping
        };
        
        const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);

        const vertexShader = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        const simFragmentShader = `
            precision highp float;
            in vec2 vUv;
            out vec4 fragColor;

            uniform sampler2D u_state;
            uniform vec2 u_res;
            uniform float u_time;
            uniform int u_frame;

            void main() {
                if (u_frame < 2) {
                    vec2 center = vec2(0.5);
                    float dist = length(vUv - center);
                    float angle = atan(vUv.y - center.y, vUv.x - center.x);
                    float star = sin(angle * 9.0) * 0.15 + 0.25;
                    
                    float u = 1.0;
                    float v = (dist < star || fract(vUv.x * 10.0 + vUv.y * 10.0) < 0.2) ? 1.0 : 0.0;
                    fragColor = vec4(u, v, 0.0, 1.0);
                    return;
                }

                vec2 px = 1.0 / u_res;
                
                vec2 c = texture(u_state, vUv).rg;
                vec2 n = texture(u_state, vUv + vec2(0.0, px.y)).rg;
                vec2 s = texture(u_state, vUv - vec2(0.0, px.y)).rg;
                vec2 e = texture(u_state, vUv + vec2(px.x, 0.0)).rg;
                vec2 w = texture(u_state, vUv - vec2(px.x, 0.0)).rg;
                vec2 ne = texture(u_state, vUv + vec2(px.x, px.y)).rg;
                vec2 nw = texture(u_state, vUv + vec2(-px.x, px.y)).rg;
                vec2 se = texture(u_state, vUv + vec2(px.x, -px.y)).rg;
                vec2 sw = texture(u_state, vUv + vec2(-px.x, -px.y)).rg;
                
                vec2 lap = (n + s + e + w) * 0.2 + (ne + nw + se + sw) * 0.05 - c;
                
                float u = c.r;
                float v = c.g;

                // Crystalline Morphology Overlay via Voronoi distance field
                vec2 g = floor(vUv * 6.0 + u_time * 0.05);
                vec2 f = fract(vUv * 6.0 + u_time * 0.05);
                float minDist = 1.0;
                for(int y=-1; y<=1; y++) {
                    for(int x=-1; x<=1; x++) {
                        vec2 lattice = vec2(float(x), float(y));
                        vec2 offset = fract(sin(vec2(dot(g+lattice, vec2(127.1, 311.7)), dot(g+lattice, vec2(269.5, 183.3)))) * 43758.5453);
                        offset = 0.5 + 0.5 * sin(u_time * 0.4 + 6.2831 * offset);
                        float d = length(lattice + offset - f);
                        minDist = min(minDist, d);
                    }
                }
                
                // Spatially varying Feed and Kill based on crystalline structure
                float F = 0.020 + 0.022 * minDist;
                float k = 0.053 + 0.011 * (1.0 - minDist);

                // Atompunk Starburst Injection (Parasite-Host Logic)
                vec2 center = vec2(0.5);
                vec2 toCenter = vUv - center;
                float angle = atan(toCenter.y, toCenter.x);
                float radius = length(toCenter);
                float starburst = sin(angle * 5.0 - u_time * 0.5) * 0.5 + 0.5;
                
                if (radius < 0.45 && abs(radius - 0.25 - starburst * 0.15) < 0.015) {
                    v += 0.08; 
                }

                // Reaction-Diffusion update
                float uvv = u * v * v;
                float du = 0.20 * lap.r - uvv + F * (1.0 - u);
                float dv = 0.10 * lap.g + uvv - (F + k) * v;
                
                fragColor = vec4(clamp(u + du, 0.0, 1.0), clamp(v + dv, 0.0, 1.0), 0.0, 1.0);
            }
        `;

        const dispFragmentShader = `
            precision highp float;
            in vec2 vUv;
            out vec4 fragColor;

            uniform sampler2D u_state;
            uniform vec2 u_res;
            uniform float u_time;

            float lin2srgb(float x) {
                return x <= 0.0031308 ? x * 12.92 : 1.055 * pow(max(x, 0.0), 1.0/2.4) - 0.055;
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

            vec3 oklch_to_srgb(float L, float C, float h) {
                vec3 lab = vec3(L, C * cos(h), C * sin(h));
                vec3 lin = oklab_to_linear_srgb(lab);
                return vec3(lin2srgb(lin.r), lin2srgb(lin.g), lin2srgb(lin.b));
            }

            void main() {
                vec2 px = 1.0 / u_res;
                
                float u = texture(u_state, vUv).r;
                float v = texture(u_state, vUv).g;

                // Gradient for normal mapping (Retrofuturistic Chrome airbrush effect)
                float dx = texture(u_state, vUv + vec2(px.x, 0.0)).r - texture(u_state, vUv - vec2(px.x, 0.0)).r;
                float dy = texture(u_state, vUv + vec2(0.0, px.y)).r - texture(u_state, vUv - vec2(0.0, px.y)).r;
                vec3 normal = normalize(vec3(dx * 20.0, dy * 20.0, 1.0));

                vec3 lightDir = normalize(vec3(sin(u_time), cos(u_time * 0.8), 1.5));
                float diff = max(dot(normal, lightDir), 0.0);
                
                // Anisotropic Specular Smear
                vec3 viewDir = vec3(0.0, 0.0, 1.0);
                vec3 halfDir = normalize(lightDir + viewDir);
                vec3 tangent = normalize(vec3(1.0, 1.0, 0.0)); // Diagonal smear
                float dotTH = dot(normal, tangent);
                float spec = pow(1.0 - dotTH * dotTH, 8.0) * pow(max(dot(normal, halfDir), 0.0), 12.0);

                // Chromatic Cannibalism - Full Color Palette Mapping (No Black, No White)
                // L strictly between 0.35 and 0.85
                float L = 0.45 + 0.3 * u + 0.1 * diff;
                // C strictly high for full color
                float C = 0.18 + 0.12 * v;
                // Hue shifts dynamically
                float h = v * 5.0 - u_time * 0.3 + u * 2.5 + (vUv.x + vUv.y) * 3.0;

                vec3 baseColor = oklch_to_srgb(L, C, h);

                // Colorful Specular Highlight (Complementary Hue)
                vec3 specColor = oklch_to_srgb(0.75, 0.25, h + 3.1415);
                vec3 finalColor = baseColor + specColor * spec * 0.9;

                // Retro Racing Stripes interacting with the biological field
                float stripe = step(0.6, sin((vUv.x - vUv.y) * 50.0 + u_time * 3.0));
                vec3 stripeColor = oklch_to_srgb(0.6, 0.22, h - 1.5);
                finalColor = mix(finalColor, stripeColor, stripe * 0.4 * v);

                // Strictly clamp to avoid any white or black pixels
                finalColor = clamp(finalColor, 0.05, 0.95);

                fragColor = vec4(finalColor, 1.0);
            }
        `;

        const simMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_state: { value: null },
                u_res: { value: new THREE.Vector2(grid.width, grid.height) },
                u_time: { value: 0 },
                u_frame: { value: 0 }
            },
            vertexShader,
            fragmentShader: simFragmentShader,
            depthWrite: false,
            depthTest: false
        });

        const dispMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_state: { value: null },
                u_res: { value: new THREE.Vector2(grid.width, grid.height) },
                u_time: { value: 0 }
            },
            vertexShader,
            fragmentShader: dispFragmentShader,
            depthWrite: false,
            depthTest: false
        });

        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        scene.add(quad);

        canvas.__three = { renderer, scene, camera, rtA, rtB, simMat, dispMat, quad, frameCount: 0 };
    }

    const t = canvas.__three;
    t.renderer.setSize(grid.width, grid.height, false);
    
    t.simMat.uniforms.u_res.value.set(grid.width, grid.height);
    t.dispMat.uniforms.u_res.value.set(grid.width, grid.height);

    t.quad.material = t.simMat;

    // Run 8 reaction-diffusion steps per frame
    for (let i = 0; i < 8; i++) {
        t.simMat.uniforms.u_time.value = time + i * 0.002;
        t.simMat.uniforms.u_frame.value = t.frameCount;
        t.simMat.uniforms.u_state.value = t.rtA.texture;
        
        t.renderer.setRenderTarget(t.rtB);
        t.renderer.render(t.scene, t.camera);
        
        let temp = t.rtA;
        t.rtA = t.rtB;
        t.rtB = temp;
        
        t.frameCount++;
    }

    // Render resulting state to canvas
    t.quad.material = t.dispMat;
    t.dispMat.uniforms.u_time.value = time;
    t.dispMat.uniforms.u_state.value = t.rtA.texture;
    
    t.renderer.setRenderTarget(null);
    t.renderer.render(t.scene, t.camera);

} catch (e) {
    console.error("Feral RD Initialization Failed:", e);
}