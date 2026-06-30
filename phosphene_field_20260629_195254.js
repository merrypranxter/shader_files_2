try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneGeometry(2, 2);

        // Ping-pong render targets for temporal afterimage adaptation
        const rtOpts = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            depthBuffer: false,
            stencilBuffer: false
        };
        const rtCore = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const rtAdaptA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const rtAdaptB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);

        const vertexShader = `
            in vec3 position;
            in vec2 uv;
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        // PASS 1: CORE PHOSPHENE & DOMAIN COLORING
        const coreFrag = `
            precision highp float;
            uniform float uTime;
            uniform vec2 uResolution;
            in vec2 vUv;
            out vec4 fragColor;

            #define PI 3.14159265359

            vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
            vec2 cdiv(vec2 a, vec2 b) { float d = dot(b,b) + 1e-8; return vec2(dot(a,b), a.y*b.x - a.x*b.y)/d; }
            vec2 csqr(vec2 z) { return vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y); }

            void main() {
                vec2 uv = vUv;
                vec2 z = uv - 0.5;
                z.x *= uResolution.x / uResolution.y;

                // Organic tremor
                z += vec2(sin(uTime*40.0), cos(uTime*43.0)) * 0.001;

                float r = length(z);
                
                // Radial pressure pulses
                float pressure = exp(-fract(uTime * 0.6 - r * 3.0) * 4.0);

                // Breathing foveal dilation
                float breath = sin(uTime * 0.5) * 0.05;
                r *= (1.0 - breath);

                // Log-polar retinotopic mapping
                float rho = log(r + 1e-4) - uTime * 0.15;
                float theta = atan(z.y, z.x);

                // Occasional chirality flip
                float chiral = sign(sin(uTime * 0.1));
                theta *= mix(1.0, chiral, smoothstep(0.0, 0.1, abs(sin(uTime * 0.1))));

                vec2 lp = vec2(rho, theta);

                // Domain coloring rational function: f(w) = w^3 / (w^2 + c)
                vec2 c = vec2(0.5 * cos(uTime * 0.1), 0.4 * sin(uTime * 0.15));
                vec2 w2 = csqr(lp);
                vec2 w3 = cmul(w2, lp);
                vec2 fz = cdiv(w3, w2 + c);

                float phase = atan(fz.y, fz.x);
                float mag = length(fz);

                // Klüver Form Constants (Spirals, Cobwebs, Grids)
                float spiral = sin(lp.x * 10.0 + lp.y * 6.0);
                float cobweb = sin(lp.x * 18.0) * cos(lp.y * 24.0);
                float tunnel = sin(lp.x * 14.0);
                
                float morph1 = 0.5 + 0.5 * sin(uTime * 0.11);
                float morph2 = 0.5 + 0.5 * cos(uTime * 0.17);
                float form = mix(mix(spiral, cobweb, morph1), tunnel, morph2);
                
                // Embed phase contours into the physical geometry
                form *= 0.8 + 0.2 * sin(phase * 12.0);

                // Wet light intensity
                float intensity = pow(0.5 + 0.5 * form, 2.5);
                intensity += pressure * 0.6 * pow(0.5 + 0.5 * sin(phase * 6.0), 3.0);
                intensity *= exp(-mag * 0.05); // Fade extreme domain warps

                // Spectral False Color Palette (Candy-Acid UV/IR)
                vec3 candy = 0.5 + 0.5 * cos(phase * 1.2 + mag * 1.5 + vec3(0.0, 0.33, 0.67) * PI * 2.0);
                candy = mix(candy, vec3(0.0, 1.0, 0.8), smoothstep(0.7, 1.0, sin(phase * 4.0))); // Cyan blast
                candy = mix(candy, vec3(1.0, 0.0, 0.6), smoothstep(0.7, 1.0, cos(phase * 5.0))); // Hot Pink
                candy = mix(candy, vec3(0.8, 1.0, 0.0), smoothstep(0.8, 1.0, sin(mag * 8.0)));   // Acid Green

                // Chromostereopsis (Naked-eye depth: Near = Red/Pink, Far = Blue/Cyan)
                float depth = clamp(intensity + pressure * 0.5 - r * 1.5, 0.0, 1.0);
                vec3 chromo = mix(vec3(0.0, 0.1, 1.0), vec3(1.0, 0.0, 0.3), depth);

                vec3 col = mix(candy, chromo, 0.65) * intensity;
                
                // Central fovea glow
                col += vec3(1.0, 0.9, 0.7) * exp(-r * 15.0);

                fragColor = vec4(col, depth);
            }
        `;

        // PASS 2: TEMPORAL AFTERIMAGE ADAPTATION
        const adaptFrag = `
            precision highp float;
            uniform sampler2D uCore;
            uniform sampler2D uPrev;
            uniform float uDt;
            in vec2 vUv;
            out vec4 fragColor;

            void main() {
                vec4 core = texture(uCore, vUv);
                vec4 prev = texture(uPrev, vUv);
                
                float tau = 6.0; // 6-second lingering ghost trail
                vec3 decay = prev.rgb * exp(-uDt / tau);
                vec3 burn = core.rgb * 1.2 * uDt; 
                
                fragColor = vec4(clamp(decay + burn, 0.0, 1.0), 1.0);
            }
        `;

        // PASS 3: COMPOSITE (DISPERSION, GLITCH, GHOSTING)
        const compositeFrag = `
            precision highp float;
            uniform sampler2D uCore;
            uniform sampler2D uAdapt;
            uniform vec2 uResolution;
            uniform float uTime;
            in vec2 vUv;
            out vec4 fragColor;

            void main() {
                vec4 core = texture(uCore, vUv);
                vec3 adapt = texture(uAdapt, vUv).rgb;

                vec3 col = core.rgb;

                // Prism Dispersion / Chromatic Aberration on bright structural edges
                vec2 texel = 1.0 / uResolution;
                float dL = texture(uCore, vUv - vec2(texel.x, 0.0)).a;
                float dR = texture(uCore, vUv + vec2(texel.x, 0.0)).a;
                float dD = texture(uCore, vUv - vec2(0.0, texel.y)).a;
                float dU = texture(uCore, vUv + vec2(0.0, texel.y)).a;
                vec2 grad = vec2(dR - dL, dU - dD);
                float edge = length(grad);

                if (edge > 0.05) {
                    vec2 dir = normalize(grad);
                    float disp = 0.008 * edge;
                    float rDisp = texture(uCore, vUv + dir * disp).r;
                    float bDisp = texture(uCore, vUv - dir * disp).b;
                    col.r = max(col.r, rDisp);
                    col.b = max(col.b, bDisp);
                }

                // Complementary Afterimage Ghost
                vec3 complement = vec3(1.0) - adapt;
                float adaptStrength = max(adapt.r, max(adapt.g, adapt.b));
                float coreStrength = max(core.r, max(core.g, core.b));
                vec3 ghost = complement * adaptStrength * (1.0 - coreStrength) * 1.8;
                col += ghost;

                // Floating Point Dementia (Outer field glitch on high pressure pulse)
                float pulse = exp(-fract(uTime * 0.6) * 4.0);
                float rDist = length(vUv - 0.5);
                if (pulse > 0.05 && rDist > 0.35) {
                    vec2 qUv = floor(vUv * 60.0) / 60.0;
                    float h = fract(sin(dot(qUv + uTime, vec2(12.9898, 78.233))) * 43758.5453);
                    if (h > 0.97) {
                        col = mix(col, vec3(0.7, 0.0, 1.0), pulse); // NaN purple cracks
                        col *= step(0.5, fract(vUv.y * 150.0)); // Mantissa stair-steps
                    }
                }

                // Wet specular pop
                col += pow(coreStrength, 6.0) * vec3(1.0, 0.9, 0.8) * 0.4;

                // Luxurious Vignette
                col *= 1.0 - 0.6 * pow(rDist * 2.0, 2.5);

                fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
            }
        `;

        const matCore = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader, fragmentShader: coreFrag,
            uniforms: {
                uTime: { value: 0 },
                uResolution: { value: new THREE.Vector2() }
            },
            depthWrite: false
        });

        const matAdapt = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader, fragmentShader: adaptFrag,
            uniforms: {
                uCore: { value: null },
                uPrev: { value: null },
                uDt: { value: 0 }
            },
            depthWrite: false
        });

        const matComposite = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader, fragmentShader: compositeFrag,
            uniforms: {
                uCore: { value: null },
                uAdapt: { value: null },
                uTime: { value: 0 },
                uResolution: { value: new THREE.Vector2() }
            },
            depthWrite: false
        });

        const sceneCore = new THREE.Scene();
        sceneCore.add(new THREE.Mesh(geometry, matCore));

        const sceneAdapt = new THREE.Scene();
        sceneAdapt.add(new THREE.Mesh(geometry, matAdapt));

        const sceneComposite = new THREE.Scene();
        sceneComposite.add(new THREE.Mesh(geometry, matComposite));

        canvas.__three = {
            renderer, camera,
            rtCore, rtAdaptA, rtAdaptB,
            sceneCore, sceneAdapt, sceneComposite,
            matCore, matAdapt, matComposite,
            lastTime: time
        };
    }

    const t3 = canvas.__three;
    const dt = Math.min(Math.max(time - t3.lastTime, 0.001), 0.1);
    t3.lastTime = time;

    t3.renderer.setSize(grid.width, grid.height, false);

    if (t3.rtCore.width !== grid.width || t3.rtCore.height !== grid.height) {
        t3.rtCore.setSize(grid.width, grid.height);
        t3.rtAdaptA.setSize(grid.width, grid.height);
        t3.rtAdaptB.setSize(grid.width, grid.height);
    }

    // 1. Render Core Phosphene
    t3.matCore.uniforms.uTime.value = time;
    t3.matCore.uniforms.uResolution.value.set(grid.width, grid.height);
    t3.renderer.setRenderTarget(t3.rtCore);
    t3.renderer.render(t3.sceneCore, t3.camera);

    // 2. Render Temporal Adaptation (Ping-Pong)
    t3.matAdapt.uniforms.uDt.value = dt;
    t3.matAdapt.uniforms.uCore.value = t3.rtCore.texture;
    t3.matAdapt.uniforms.uPrev.value = t3.rtAdaptA.texture;
    t3.renderer.setRenderTarget(t3.rtAdaptB);
    t3.renderer.render(t3.sceneAdapt, t3.camera);

    // 3. Render Composite to Screen
    t3.matComposite.uniforms.uTime.value = time;
    t3.matComposite.uniforms.uResolution.value.set(grid.width, grid.height);
    t3.matComposite.uniforms.uCore.value = t3.rtCore.texture;
    t3.matComposite.uniforms.uAdapt.value = t3.rtAdaptB.texture;
    t3.renderer.setRenderTarget(null);
    t3.renderer.render(t3.sceneComposite, t3.camera);

    // Swap Ping-Pong Buffers
    const temp = t3.rtAdaptA;
    t3.rtAdaptA = t3.rtAdaptB;
    t3.rtAdaptB = temp;

} catch (e) {
    console.error("WebGL Initialization Failed:", e);
    throw e;
}