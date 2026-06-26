try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    if (!canvas.__three) {
        // --- Initialize Three.js ---
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        // Render targets for ping-pong feedback (Afterimage & Datamosh)
        const rtParams = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType, // Prevents banding in afterimage trails
            depthBuffer: false,
            stencilBuffer: false
        };
        
        let rtFractal = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
        let rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
        let rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);

        // --- GLSL Shaders ---
        const vertexShader = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        const fractalFragmentShader = `
            precision highp float;
            uniform float u_time;
            uniform vec2 u_resolution;
            uniform vec2 u_mouse;
            in vec2 vUv;
            out vec4 fragColor;

            // Complex math helpers
            vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
            
            void main() {
                vec2 p = (vUv - 0.5) * 2.0;
                p.x *= u_resolution.x / u_resolution.y;

                // 1. Julia Portals Setup (4 corners)
                float d1 = length(p - vec2(-1.3, -0.7));
                float d2 = length(p - vec2( 1.3, -0.7));
                float d3 = length(p - vec2(-1.3,  0.7));
                float d4 = length(p - vec2( 1.3,  0.7));
                float pDist = min(min(d1, d2), min(d3, d4));
                float portalMask = 1.0 - smoothstep(0.38, 0.4, pDist);

                // 2. Hypnotic Zoom & Pan (Mandelbrot)
                vec2 startCenter = vec2(-0.5, 0.0);
                vec2 endCenter = vec2(-0.74364388, 0.13182590); // Seahorse Valley
                float cycle = mod(u_time * 0.08, 1.0);
                float tEase = smoothstep(0.0, 1.0, cycle);
                tEase = pow(tEase, 2.0); // Accelerate zoom dive
                
                vec2 target = mix(startCenter, endCenter, tEase);
                float zoom = mix(1.0, 800.0, pow(tEase, 5.0));
                
                // Add slight mouse parallax
                target += (u_mouse - 0.5) * 0.05 / zoom;
                vec2 c_mandel = p / zoom + target;

                // 3. Dual Dynamics: Mandelbrot vs Julia
                vec2 z;
                vec2 c_iter;
                
                if (portalMask > 0.5) {
                    // Inside Portal: Julia Set
                    z = p * 1.5;
                    // Gentle rotation inside portal
                    float a = u_time * 0.2;
                    z = vec2(z.x * cos(a) - z.y * sin(a), z.x * sin(a) + z.y * cos(a));
                    // Julia constant based on current Mandelbrot dive location + mouse
                    c_iter = endCenter + (u_mouse - 0.5) * 0.1 + 0.05 * vec2(cos(u_time), sin(u_time));
                } else {
                    // Outside Portal: Mandelbrot
                    z = vec2(0.0);
                    c_iter = c_mandel;
                }

                // 4. Burning Ship Sparks in Outer Corners
                float cornerMask = smoothstep(0.8, 1.8, length(p)) * (1.0 - portalMask);

                // 5. Fractal Iteration
                float iter = 0.0;
                float max_iter = 200.0;
                float trap = 1e20;
                
                for(float i = 0.0; i < 200.0; i++) {
                    // Inject Burning Ship absolute value folding at the corners
                    if (cornerMask > 0.0) {
                        z = mix(z, vec2(abs(z.x), abs(z.y)), cornerMask * 0.9);
                    }
                    
                    z = cmul(z, z) + c_iter;
                    
                    // Orbit traps: cross-like and concentric
                    trap = min(trap, min(abs(z.x), abs(z.y)));
                    trap = min(trap, length(fract(z * 2.0) - 0.5));
                    
                    if (dot(z, z) > 256.0) break;
                    iter++;
                }

                // 6. Coloring & Optics
                vec3 col = vec3(0.0);
                
                if (iter < max_iter - 1.0) {
                    // Smooth iteration count
                    float sn = iter - log2(log2(max(1.0, dot(z,z)))) / log2(2.0);
                    float phase = atan(z.y, z.x) / 6.28318 + 0.5;

                    // Mesh gradient background for low iteration areas (exterior)
                    vec3 bg = vec3(0.05, 0.0, 0.15);
                    bg += 0.2 * sin(vUv.x * 10.0 + u_time) * vec3(0.8, 0.0, 0.5); // Hot pink
                    bg += 0.2 * cos(vUv.y * 8.0 - u_time) * vec3(0.0, 0.8, 0.9);  // Cyan

                    // Candy-acid spectral palette (Cosine gradient)
                    vec3 a = vec3(0.5, 0.5, 0.5);
                    vec3 b = vec3(0.5, 0.5, 0.5);
                    vec3 cc = vec3(1.0, 1.0, 1.0);
                    vec3 d = vec3(0.8, 0.2, 0.5); // Violet/pink bias
                    vec3 fracCol = a + b * cos(6.28318 * (sn * 0.04 - u_time * 0.2 + d));

                    // Acid green and neon yellow spikes
                    fracCol = mix(fracCol, vec3(0.6, 1.0, 0.0), smoothstep(0.85, 1.0, sin(sn * 0.15)));
                    fracCol = mix(fracCol, vec3(0.0, 1.0, 1.0), smoothstep(0.85, 1.0, cos(sn * 0.2 + 1.0)));

                    // Structural color / Thin-film diffraction on edges (Orbit Trap)
                    vec3 irid = 0.5 + 0.5 * cos(6.28318 * (trap * 4.0 + vec3(0.0, 0.33, 0.67)));
                    fracCol += irid * exp(-trap * 6.0) * 1.5; // White-hot bloom on ridges

                    // Domain coloring contour bands
                    float contour = fract(log(length(z)) * 5.0 - u_time * 0.5);
                    fracCol *= 0.7 + 0.3 * smoothstep(0.4, 0.5, contour);

                    col = mix(bg, fracCol, smoothstep(0.0, 5.0, sn));
                } else {
                    // Crisp black interior
                    col = vec3(0.0, 0.0, 0.02);
                }

                // Portal ring glow
                col += vec3(1.0, 0.2, 0.8) * smoothstep(0.03, 0.0, abs(pDist - 0.4)) * 2.0;

                fragColor = vec4(col, 1.0);
            }
        `;

        const postFragmentShader = `
            precision highp float;
            uniform float u_time;
            uniform vec2 u_resolution;
            uniform sampler2D u_fractal;
            uniform sampler2D u_history;
            in vec2 vUv;
            out vec4 fragColor;

            void main() {
                vec2 uv = vUv;

                // 1. Controlled Datamosh Ripple (triggers every 10s)
                float moshCycle = mod(u_time, 10.0);
                float isMosh = step(9.4, moshCycle); // Active for 0.6s
                
                // Generate blocky motion vectors from the fractal's own luminance
                vec2 blockUv = floor(uv * 40.0) / 40.0;
                vec4 moshSrc = texture(u_fractal, blockUv);
                float luma = dot(moshSrc.rgb, vec3(0.299, 0.587, 0.114));
                vec2 motion = (vec2(luma, moshSrc.b) - 0.5) * 0.08 * isMosh;
                
                // Sample history with motion drift
                vec4 hist = texture(u_history, uv - motion);

                // 2. Chromatic Aberration (stronger at edges)
                float caDist = length(uv - 0.5);
                float caAmt = 0.015 * caDist * caDist; // Quadratic falloff
                
                vec4 curr;
                curr.r = texture(u_fractal, uv + vec2(caAmt, 0.0)).r;
                curr.g = texture(u_fractal, uv).g;
                curr.b = texture(u_fractal, uv - vec2(caAmt, 0.0)).b;
                curr.a = 1.0;

                // 3. VHS Scanlines & Analog Tracking
                float scan = 0.92 + 0.08 * sin(uv.y * u_resolution.y * 2.5);
                curr.rgb *= scan;

                // Tracking tear (occasional horizontal glitch)
                float tear = step(0.995, fract(sin(uv.y * 150.0 + u_time * 15.0) * 43758.5));
                curr.rgb += tear * vec3(0.8) * step(0.8, fract(u_time * 2.3));

                // 4. Retinal Afterimage / Persistence
                // When moshing, hold the history strongly to create smear
                float trail = mix(0.45, 0.96, isMosh); 
                vec4 finalColor = mix(curr, hist, trail);

                // Overexposed white edge bloom cap
                finalColor.rgb += smoothstep(0.8, 1.0, luma) * 0.1;

                fragColor = vec4(finalColor.rgb, 1.0);
            }
        `;

        const blitFragmentShader = `
            precision highp float;
            uniform sampler2D u_tex;
            in vec2 vUv;
            out vec4 fragColor;
            void main() {
                fragColor = texture(u_tex, vUv);
            }
        `;

        // --- Materials ---
        const fractalMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader,
            fragmentShader: fractalFragmentShader,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) }
            },
            depthWrite: false, depthTest: false
        });

        const postMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader,
            fragmentShader: postFragmentShader,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_fractal: { value: null },
                u_history: { value: null }
            },
            depthWrite: false, depthTest: false
        });

        const blitMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader,
            fragmentShader: blitFragmentShader,
            uniforms: { u_tex: { value: null } },
            depthWrite: false, depthTest: false
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        scene.add(mesh);

        // --- Mouse Interaction ---
        let mouseX = 0.5, mouseY = 0.5;
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            mouseX = (e.clientX - rect.left) / rect.width;
            mouseY = 1.0 - ((e.clientY - rect.top) / rect.height);
        });
        canvas.addEventListener('touchmove', (e) => {
            if(e.touches.length > 0) {
                const rect = canvas.getBoundingClientRect();
                mouseX = (e.touches[0].clientX - rect.left) / rect.width;
                mouseY = 1.0 - ((e.touches[0].clientY - rect.top) / rect.height);
            }
        }, {passive: true});

        // --- Save State ---
        canvas.__three = {
            renderer, scene, camera, mesh,
            fractalMat, postMat, blitMat,
            rtFractal, rtA, rtB,
            getMouse: () => [mouseX, mouseY]
        };
    }

    // --- Render Loop ---
    const t3 = canvas.__three;
    const [mx, my] = t3.getMouse();
    
    // 1. Update sizes if canvas resized
    if (t3.renderer.getSize(new THREE.Vector2()).x !== grid.width || 
        t3.renderer.getSize(new THREE.Vector2()).y !== grid.height) {
        t3.renderer.setSize(grid.width, grid.height, false);
        t3.rtFractal.setSize(grid.width, grid.height);
        t3.rtA.setSize(grid.width, grid.height);
        t3.rtB.setSize(grid.width, grid.height);
        t3.fractalMat.uniforms.u_resolution.value.set(grid.width, grid.height);
        t3.postMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    }

    // 2. Render Fractal
    t3.fractalMat.uniforms.u_time.value = time;
    t3.fractalMat.uniforms.u_mouse.value.set(mx, my);
    t3.mesh.material = t3.fractalMat;
    t3.renderer.setRenderTarget(t3.rtFractal);
    t3.renderer.render(t3.scene, t3.camera);

    // 3. Render Post-Processing & Datamosh (reads Fractal + History A, writes to B)
    t3.postMat.uniforms.u_time.value = time;
    t3.postMat.uniforms.u_fractal.value = t3.rtFractal.texture;
    t3.postMat.uniforms.u_history.value = t3.rtA.texture;
    t3.mesh.material = t3.postMat;
    t3.renderer.setRenderTarget(t3.rtB);
    t3.renderer.render(t3.scene, t3.camera);

    // 4. Blit to Screen
    t3.blitMat.uniforms.u_tex.value = t3.rtB.texture;
    t3.mesh.material = t3.blitMat;
    t3.renderer.setRenderTarget(null);
    t3.renderer.render(t3.scene, t3.camera);

    // 5. Swap History Buffers
    let temp = t3.rtA;
    t3.rtA = t3.rtB;
    t3.rtB = temp;

} catch (e) {
    console.error("WebGL 2 / Three.js Initialization Failed:", e);
    throw e;
}