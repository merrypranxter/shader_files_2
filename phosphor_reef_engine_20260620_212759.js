if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
                u_mouse_pressed: { value: 0.0 },
                u_surge: { value: 0.0 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                in vec2 vUv;
                out vec4 fragColor;
                
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform vec2 u_mouse;
                uniform float u_mouse_pressed;
                uniform float u_surge;
                
                // Perceptual noise functions
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }
                
                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    vec2 u = f * f * (3.0 - 2.0 * f);
                    return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                               mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
                }
                
                float fbm(vec2 p) {
                    float v = 0.0;
                    float a = 0.5;
                    for (int i = 0; i < 4; i++) {
                        v += a * noise(p);
                        p *= 2.0;
                        a *= 0.5;
                    }
                    return v;
                }
                
                // Core generator combining multiple repo DNA styles
                vec3 getSignal(vec2 uv, float t, vec2 mouse, float surge) {
                    // 1. Datamosh coordinate distortion (macroblocks + flow field)
                    vec2 blockSize = vec2(16.0) / u_resolution;
                    vec2 blockUv = floor(uv / blockSize) * blockSize;
                    
                    // Motion vector simulation
                    float flowNoiseX = fbm(blockUv * 3.0 + vec2(t * 0.1, 0.0));
                    float flowNoiseY = fbm(blockUv * 3.0 + vec2(0.0, t * 0.12));
                    vec2 flow = vec2(flowNoiseX, flowNoiseY) - 0.5;
                    
                    // Apply block-based datamosh warping based on surge
                    float blockMoshThresh = 0.65 - surge * 0.25;
                    float isMoshBlock = step(blockMoshThresh, hash(blockUv + floor(t * 2.0)));
                    vec2 warpedUv = uv + flow * 0.08 * isMoshBlock * (1.0 + surge * 1.5);
                    
                    // Re-calculate local block UVs on warped coords
                    vec2 localUv = fract(warpedUv / blockSize);
                    
                    // 2. Demoscene Radial Plasma / Tunnel
                    vec2 p = warpedUv - 0.5;
                    p.x *= u_resolution.x / u_resolution.y;
                    float r = length(p);
                    float theta = atan(p.y, p.x);
                    
                    float tunnel = sin(r * (15.0 + surge * 10.0) - theta * 4.0 - t * 2.5);
                    float plasma = sin(warpedUv.x * 8.0 + t) * 0.5 + cos(warpedUv.y * 6.0 - t * 1.2) * 0.5;
                    plasma += sin(length(p * 20.0) - t * 3.0) * 0.3;
                    
                    // Saturated vibrant backgrounds (Absolute Color Law: no black voids!)
                    vec3 bgIndigo = vec3(0.08, 0.02, 0.28); 
                    vec3 bgViolet = vec3(0.35, 0.0, 0.45);
                    vec3 bgTeal = vec3(0.0, 0.25, 0.35);
                    vec3 bg = mix(bgIndigo, bgViolet, sin(plasma * 2.0) * 0.5 + 0.5);
                    bg = mix(bg, bgTeal, cos(tunnel * 3.0) * 0.5 + 0.5);
                    
                    // 3. Cuttlefish Chromatophore Grid
                    vec2 chromGrid = floor(warpedUv * (40.0 - surge * 15.0));
                    vec2 chromLocal = fract(warpedUv * (40.0 - surge * 15.0)) - 0.5;
                    
                    // Biological wave excitation
                    float wave = sin(chromGrid.x * 0.12 + chromGrid.y * 0.08 - t * 4.0) * 0.5 + 0.5;
                    float flicker = noise(chromGrid * 0.15 + t * 2.5);
                    float activation = mix(wave, flicker, 0.35 + surge * 0.4);
                    
                    // Cell radius calculation (elastic expansion up to ~500% area)
                    float baseR = 0.08 + 0.04 * hash(chromGrid);
                    float rMax = baseR * (1.0 + 1.24 * activation);
                    float cellDist = length(chromLocal);
                    float cellMask = smoothstep(rMax, rMax * 0.6, cellDist);
                    
                    // Pigment class selection
                    float pigHash = hash(chromGrid * 1.13);
                    vec3 pigColor = vec3(0.0);
                    if (pigHash < 0.35) {
                        pigColor = vec3(0.95, 0.72, 0.1); // Acid Yellow
                    } else if (pigHash < 0.7) {
                        pigColor = vec3(1.0, 0.25, 0.15); // Vibrant Orange/Coral
                    } else {
                        pigColor = vec3(0.4, 0.02, 0.25); // Deep Burgundy/Plum
                    }
                    
                    // Merge cell chromatophore layer
                    vec3 scene = mix(bg, pigColor, cellMask * 0.88);
                    
                    // 4. Halftone Mosaic overlay (selectively active)
                    float htMask = step(0.65 - surge * 0.15, noise(warpedUv * 4.0 + t * 0.5));
                    vec2 htGrid = fract(warpedUv * 80.0) - 0.5;
                    float htRad = length(htGrid);
                    float luma = dot(scene, vec3(0.299, 0.587, 0.114));
                    float htDot = smoothstep(luma * 0.5, luma * 0.4, htRad);
                    scene = mix(scene, scene * htDot * 1.6, htMask * 0.65);
                    
                    // 5. Early Internet Browser Shards & Asemic UI Debris
                    vec2 uiGridId = floor(warpedUv * 8.0);
                    float uiSeed = hash(uiGridId + floor(t * 1.5));
                    if (uiSeed > 0.86 - surge * 0.1) {
                        vec2 uiLocal = fract(warpedUv * 8.0);
                        // Draw classical Y2K window outline
                        float windowBorder = step(0.04, uiLocal.x) * step(uiLocal.x, 0.96) * step(0.04, uiLocal.y) * step(uiLocal.y, 0.96);
                        float titleBar = step(0.8, uiLocal.y);
                        vec3 windowColor = mix(vec3(0.12, 0.02, 0.32), vec3(0.82, 0.85, 0.95), windowBorder); // Indigo frame, light gray body
                        windowColor = mix(windowColor, vec3(0.0, 0.6, 0.95), titleBar * windowBorder); // Cyan title bar
                        
                        // Asemic lines
                        float linesZone = step(0.1, uiLocal.x) * step(uiLocal.x, 0.9) * step(0.2, uiLocal.y) * step(uiLocal.y, 0.7);
                        float linePattern = step(0.65, sin(uiLocal.y * 70.0 + t * 5.0));
                        windowColor = mix(windowColor, vec3(1.0, 0.0, 0.6), linesZone * linePattern * windowBorder); // Hot pink text debris
                        
                        scene = mix(scene, windowColor, 0.85);
                    }
                    
                    // 6. Anamorphic Lens Flare Lines
                    float flare1 = exp(-pow(warpedUv.y - (0.5 + sin(t * 1.5) * 0.25), 2.0) / 0.001) * (0.8 + 0.2 * sin(t * 6.0));
                    float flare2 = exp(-pow(warpedUv.y - (0.3 + cos(t * 2.0) * 0.15), 2.0) / 0.0004);
                    vec3 flareColor1 = vec3(0.0, 0.95, 1.0) * flare1; // Laser Cyan
                    vec3 flareColor2 = vec3(1.0, 0.05, 0.8) * flare2; // Neon Pink
                    scene += (flareColor1 + flareColor2) * (1.0 + surge * 2.0);
                    
                    // Macroblock boundaries
                    float blockEdge = (1.0 - step(0.03, localUv.x) * step(localUv.x, 0.97) * step(0.03, localUv.y) * step(localUv.y, 0.97)) * isMoshBlock;
                    scene = mix(scene, vec3(0.0, 0.9, 0.95), blockEdge * 0.35); // Cyan boundary highlights
                    
                    return scene;
                }
                
                void main() {
                    vec2 uv = vUv;
                    vec2 center = vec2(0.5);
                    vec2 dir = uv - center;
                    
                    // Radial Chromatic Aberration via multi-sampling
                    float spread = 0.015 + 0.02 * u_surge;
                    vec2 uvR = uv + dir * spread;
                    vec2 uvG = uv;
                    vec2 uvB = uv - dir * spread;
                    
                    float r = getSignal(uvR, u_time, u_mouse, u_surge).r;
                    float g = getSignal(uvG, u_time, u_mouse, u_surge).g;
                    float b = getSignal(uvB, u_time, u_mouse, u_surge).b;
                    vec3 compositeColor = vec3(r, g, b);
                    
                    // CRT Phosphor Triads & Scanlines
                    float scanline = sin(uv.y * u_resolution.y * 3.14159) * 0.5 + 0.5;
                    compositeColor *= mix(0.72, 1.0, scanline);
                    
                    float colIndex = mod(gl_FragCoord.x, 3.0);
                    vec3 phosphorStripe = vec3(
                        smoothstep(1.0, 0.0, abs(colIndex - 0.5)),
                        smoothstep(1.0, 0.0, abs(colIndex - 1.5)),
                        smoothstep(1.0, 0.0, abs(colIndex - 2.5))
                    );
                    compositeColor *= mix(vec3(1.0), phosphorStripe, 0.35);
                    
                    // Soft CRT vignette
                    float vig = smoothstep(1.2, 0.4, length(dir * vec2(1.1, 1.0)));
                    compositeColor *= mix(0.55, 1.0, vig);
                    
                    // ABSOLUTE COLOR LAW: NO BLACK OR WHITE DOMINANCE!
                    float finalLuma = dot(compositeColor, vec3(0.2126, 0.7152, 0.0722));
                    
                    // Chromatic dark & bright bases
                    vec3 chromaticDark = mix(vec3(0.08, 0.02, 0.22), vec3(0.02, 0.15, 0.22), sin(u_time * 0.5) * 0.5 + 0.5);
                    vec3 chromaticBright = mix(vec3(1.0, 0.05, 0.65), vec3(0.0, 0.95, 1.0), cos(u_time * 0.7) * 0.5 + 0.5);
                    
                    vec3 safeColor = mix(chromaticDark, compositeColor, smoothstep(0.0, 0.25, finalLuma));
                    safeColor = mix(safeColor, chromaticBright, smoothstep(0.75, 1.0, finalLuma));
                    
                    // Slightly boost final saturation to ensure visual punch
                    safeColor = mix(vec3(finalLuma), safeColor, 1.35);
                    safeColor = clamp(safeColor, 0.03, 0.97); // Safe limit bounds
                    
                    fragColor = vec4(safeColor, 1.0);
                }
            `
        });
        
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);
        
        canvas.__three = { renderer, scene, camera, material };
    } catch (e) {
        console.error("Phosphor Signal Reef Engine initialization failed:", e);
        return;
    }
}

const { renderer, scene, camera, material } = canvas.__three;
if (material && material.uniforms) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
    
    if (mouse) {
        material.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
        material.uniforms.u_mouse_pressed.value = mouse.isPressed ? 1.0 : 0.0;
    }
    
    // Periodic animation surges (every ~5-8 seconds)
    const surge = Math.max(0.0, Math.sin(time * 0.4) * 0.5 + 0.5);
    material.uniforms.u_surge.value = Math.pow(surge, 3.5); // Fast exponential curve for punchy bursts
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);