try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            context: ctx,
            alpha: true,
            antialias: true,
            preserveDrawingBuffer: false
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneGeometry(2, 2);

        // Render Targets for Ping-Pong FBO and Paint Pass
        const rtParams = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            depthBuffer: false,
            stencilBuffer: false
        };

        const rtPaint = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
        const rtAdaptA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
        const rtAdaptB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);

        const commonVert = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        const paintFrag = `
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform float u_time;
            uniform vec2 u_resolution;
            uniform vec2 u_mouse;

            #define PI 3.14159265359
            #define TAU 6.28318530718

            // Complex Math (domain_coloring)
            vec2 csqr(vec2 z) { return vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y); }
            vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
            vec2 cdiv(vec2 a, vec2 b) { float d = dot(b,b)+1e-8; return vec2(dot(a,b), a.y*b.x - a.x*b.y)/d; }
            vec2 cpow(vec2 z, float n) { float r = length(z); float a = atan(z.y, z.x); return pow(r,n)*vec2(cos(n*a), sin(n*a)); }
            vec2 cexp(vec2 z) { return exp(z.x) * vec2(cos(z.y), sin(z.y)); }

            // Chromostereopsis + Spectral mapping
            vec3 depthToColor(float depth) {
                // Near (0.0) = Hot Pink / Red, Far (1.0) = Cyan / Blue
                vec3 near = vec3(1.0, 0.0, 0.4);
                vec3 far = vec3(0.0, 0.8, 1.0);
                vec3 col = mix(near, far, clamp(depth, 0.0, 1.0));
                
                // Enforce max saturation
                float maxC = max(col.r, max(col.g, col.b));
                if (maxC > 0.0) col /= maxC;
                return col;
            }

            void main() {
                vec2 aspect = u_resolution.xy / min(u_resolution.x, u_resolution.y);
                vec2 uv = (vUv - 0.5) * aspect;
                
                // Slow breathing foveal dilation and tremor
                float breath = sin(u_time * 0.4) * 0.5 + 0.5;
                vec2 fovea = vec2(sin(u_time * 0.7) * 0.04, cos(u_time * 0.5) * 0.04);
                vec2 z = uv - fovea;
                
                // Retinotopic mapping (phosphene_field)
                float r = max(length(z), 1e-6);
                vec2 lp = vec2(log(r), atan(z.y, z.x));
                
                // Pressure pulses
                float pulse = exp(-r * (4.0 - 2.0 * breath)) * (0.5 + 0.5 * sin(u_time * 2.5 - r * 10.0));
                
                // Domain Coloring: Rational function (z^3 - 1) / (z^2 + c)
                vec2 c = vec2(0.4 * cos(u_time * 0.3), 0.3 * sin(u_time * 0.4));
                vec2 w = cdiv(cpow(z, 3.0) - vec2(1.0, 0.0), csqr(z) + c);
                
                // Floating point dementia (Quantization at high pressure)
                float dementia = smoothstep(0.7, 1.0, pulse);
                if (dementia > 0.0) {
                    float levels = exp2(mix(12.0, 2.0, dementia));
                    w = floor(w * levels) / levels;
                }

                float phase = atan(w.y, w.x) / TAU + 0.5;
                float mag = length(w);
                
                // Klüver form constants in log-polar space
                float chirality = sin(u_time * 0.15) > 0.0 ? 1.0 : -1.0;
                float spiral = sin(lp.x * 10.0 + chirality * lp.y * 6.0 - u_time * 2.0);
                float cobweb = sin(lp.x * 15.0) * sin(lp.y * 12.0 + u_time);
                float form = mix(cobweb, spiral, breath);
                
                // Depth assignment for chromostereopsis
                float depth = fract(phase * 3.0 + form * 0.4 + u_time * 0.1);
                vec3 col = depthToColor(depth);
                
                // Magnitude contours (domain coloring)
                float contour = smoothstep(0.8, 1.0, sin(log2(mag + 1e-4) * TAU));
                
                // Intensity shaping
                float intensity = (0.3 + 0.7 * contour) * exp(-r * 0.8) * smoothstep(0.0, 0.08, r);
                intensity += pulse * 0.4;
                
                // Spectral burn / Wet light at peaks
                if (intensity > 0.85) {
                    col = mix(col, vec3(1.0, 0.9, 0.2), (intensity - 0.85) * 6.6); // Acid yellow/white burn
                }

                // NaN purple cracks (floating_point_dementia)
                float crack = smoothstep(0.02, 0.0, abs(fract(phase * 8.0 + spiral) - 0.5));
                if (dementia > 0.4 && crack > 0.5) {
                    col = vec3(0.8, 0.0, 1.0); // Purple infection
                    intensity = 1.0;
                }
                
                fragColor = vec4(col * intensity, 1.0);
            }
        `;

        const adaptFrag = `
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform sampler2D u_paint;
            uniform sampler2D u_adapt;
            uniform float u_dt;

            void main() {
                vec3 paint = texture(u_paint, vUv).rgb;
                vec3 adapt = texture(u_adapt, vUv).rgb;
                
                // Temporal feedback decay (afterimage_painter)
                // tau = 8.0 seconds for luxurious linger
                float decay = exp(-u_dt / 8.0);
                
                // Accumulate bleach/adaptation
                adapt = adapt * decay + paint * 0.06;
                
                fragColor = vec4(min(adapt, vec3(1.0)), 1.0);
            }
        `;

        const compositeFrag = `
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform sampler2D u_paint;
            uniform sampler2D u_adapt;
            uniform vec2 u_resolution;

            void main() {
                vec3 paint = texture(u_paint, vUv).rgb;
                vec3 adapt = texture(u_adapt, vUv).rgb;
                
                // Afterimage logic
                vec3 compColor = vec3(1.0) - adapt; // Complementary ghost
                float adaptStrength = max(adapt.r, max(adapt.g, adapt.b));
                float paintCoverage = max(paint.r, max(paint.g, paint.b));
                
                // Ghost appears where paint fades
                vec3 ghost = compColor * adaptStrength * (1.0 - paintCoverage);
                vec3 finalCol = paint + ghost * 1.5; // Boost ghost slightly
                
                // Edge detection for chromatic aberration (prism_dispersion)
                vec2 texel = 1.0 / u_resolution;
                float l = dot(texture(u_paint, vUv - vec2(texel.x, 0.0)).rgb, vec3(0.333));
                float r = dot(texture(u_paint, vUv + vec2(texel.x, 0.0)).rgb, vec3(0.333));
                float u = dot(texture(u_paint, vUv - vec2(0.0, texel.y)).rgb, vec3(0.333));
                float d = dot(texture(u_paint, vUv + vec2(0.0, texel.y)).rgb, vec3(0.333));
                
                float edge = length(vec2(r - l, d - u));
                
                // Apply CA only at bright edges
                if (edge > 0.05) {
                    vec2 dir = normalize(vUv - 0.5);
                    float disp = edge * 0.02;
                    vec3 ca;
                    ca.r = texture(u_paint, vUv + dir * disp).r;
                    ca.g = paint.g;
                    ca.b = texture(u_paint, vUv - dir * disp).b;
                    finalCol = max(finalCol, ca);
                }
                
                // Vignette
                float dist = length(vUv - 0.5);
                finalCol *= smoothstep(0.8, 0.3, dist);
                
                fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
            }
        `;

        const matPaint = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader: commonVert,
            fragmentShader: paintFrag,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) }
            }
        });

        const matAdapt = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader: commonVert,
            fragmentShader: adaptFrag,
            uniforms: {
                u_paint: { value: null },
                u_adapt: { value: null },
                u_dt: { value: 0.016 }
            }
        });

        const matComposite = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            vertexShader: commonVert,
            fragmentShader: compositeFrag,
            uniforms: {
                u_paint: { value: null },
                u_adapt: { value: null },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
            }
        });

        const mesh = new THREE.Mesh(geometry, matPaint);
        scene.add(mesh);

        canvas.__three = {
            renderer,
            scene,
            camera,
            mesh,
            matPaint,
            matAdapt,
            matComposite,
            rtPaint,
            rtAdapt: [rtAdaptA, rtAdaptB],
            readIdx: 0,
            lastTime: time
        };
    }

    const t = canvas.__three;
    const { renderer, scene, camera, mesh, matPaint, matAdapt, matComposite, rtPaint, rtAdapt } = t;
    
    // Calculate delta time for adaptation decay
    const dt = Math.min(time - t.lastTime, 0.1); // clamp dt to avoid huge jumps
    t.lastTime = time;

    // Handle resizing
    if (renderer.getSize(new THREE.Vector2()).width !== grid.width || renderer.getSize(new THREE.Vector2()).height !== grid.height) {
        renderer.setSize(grid.width, grid.height, false);
        rtPaint.setSize(grid.width, grid.height);
        rtAdapt[0].setSize(grid.width, grid.height);
        rtAdapt[1].setSize(grid.width, grid.height);
        matPaint.uniforms.u_resolution.value.set(grid.width, grid.height);
        matComposite.uniforms.u_resolution.value.set(grid.width, grid.height);
    }

    // 1. Render Phosphene Core to rtPaint
    matPaint.uniforms.u_time.value = time;
    if (mouse.isPressed) {
        matPaint.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
    }
    mesh.material = matPaint;
    renderer.setRenderTarget(rtPaint);
    renderer.render(scene, camera);

    // 2. Render Adaptation (Feedback) to rtAdapt[writeIdx]
    const writeIdx = 1 - t.readIdx;
    matAdapt.uniforms.u_paint.value = rtPaint.texture;
    matAdapt.uniforms.u_adapt.value = rtAdapt[t.readIdx].texture;
    matAdapt.uniforms.u_dt.value = dt;
    mesh.material = matAdapt;
    renderer.setRenderTarget(rtAdapt[writeIdx]);
    renderer.render(scene, camera);

    // 3. Composite to Screen
    matComposite.uniforms.u_paint.value = rtPaint.texture;
    matComposite.uniforms.u_adapt.value = rtAdapt[writeIdx].texture;
    mesh.material = matComposite;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    // Swap ping-pong buffers
    t.readIdx = writeIdx;

} catch (e) {
    console.error("WebGL Initialization or Render Failed:", e);
    throw e;
}