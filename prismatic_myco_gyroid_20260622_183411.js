// WIGGLE STEREOSCOPY X VHS X TPMS X WFC
// A maximalist, depth-driven raymarched scene synthesizing multiple repo genomes.
// Wiggle stereoscopy is implemented natively in the raymarching camera using an off-axis projection model.

if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        camera.position.z = 1;
        
        const material = new THREE.ShaderMaterial({
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
                precision highp float;
                in vec2 vUv;
                out vec4 fragColor;
                uniform float u_time;
                uniform vec2 u_resolution;

                // --- Math & Noise (Genome: wave_function_collapse) ---
                float hash13(vec3 p3) {
                    p3  = fract(p3 * .1031);
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.x + p3.y) * p3.z);
                }

                // --- Triply Periodic Minimal Surfaces (Genome: gyroid_lattice) ---
                float tpms_gyroid(vec3 p) {
                    return dot(sin(p), cos(p.zxy));
                }

                vec2 opU(vec2 d1, vec2 d2) {
                    return (d1.x < d2.x) ? d1 : d2;
                }

                // --- Scene Map ---
                vec2 map(vec3 pos) {
                    vec2 res = vec2(1000.0, 0.0);
                    
                    vec3 cell = floor(pos);
                    vec3 local = fract(pos) - 0.5;
                    float h = hash13(cell);
                    
                    // 1. Gyroid Fungal Infill
                    float g = tpms_gyroid(pos * 4.0) / 4.0;
                    float gyroidThick = abs(g) - 0.04;
                    float bound = length(local) - 0.45;
                    float gyroidChunk = max(gyroidThick, bound);
                    if (h > 0.6) res = opU(res, vec2(gyroidChunk, 1.0));
                    
                    // 2. WFC Neon Pipes (Manhattan distance structures)
                    float pipeX = length(local.yz) - 0.04;
                    float pipeY = length(local.xz) - 0.04;
                    float pipeZ = length(local.xy) - 0.04;
                    float pipes = min(pipeX, min(pipeY, pipeZ));
                    if (h > 0.3 && h <= 0.6) res = opU(res, vec2(pipes, 2.0));
                    
                    // 3. Floating Data Crystals (Rotating per cell)
                    if (h > 0.1 && h <= 0.3) {
                        vec3 rLocal = local;
                        float tRot = u_time * (h * 5.0 + 1.0);
                        float c = cos(tRot), s = sin(tRot);
                        rLocal.xz = mat2(c, -s, s, c) * rLocal.xz;
                        rLocal.xy = mat2(c, -s, s, c) * rLocal.xy;
                        vec3 absloc = abs(rLocal);
                        float box = max(absloc.x, max(absloc.y, absloc.z)) - 0.08;
                        res = opU(res, vec2(box, 3.0));
                    }
                    
                    // 4. VHS Magnetic Ribbons (Continuous undulating waves)
                    float ribbon = abs(pos.y + sin(pos.z * 1.5 + u_time * 2.0) * 0.6) - 0.02;
                    ribbon = max(ribbon, abs(pos.x + cos(pos.z * 1.0) * 0.8) - 1.2);
                    res = opU(res, vec2(ribbon, 4.0));
                    
                    // 5. Coma Dust (Genome: chromatic_aberration)
                    vec3 dustPos = fract(pos * 3.0) - 0.5;
                    float dust = length(dustPos) - 0.015;
                    if (h <= 0.1) res = opU(res, vec2(dust, 5.0));
                    
                    return res;
                }

                vec3 calcNormal(vec3 p) {
                    vec2 e = vec2(0.002, 0.0);
                    return normalize(vec3(
                        map(p + e.xyy).x - map(p - e.xyy).x,
                        map(p + e.yxy).x - map(p - e.yxy).x,
                        map(p + e.yyx).x - map(p - e.yyx).x
                    ));
                }

                // --- Material & Color Engine (Genome: chromadepth & chromatic_aberration) ---
                vec3 getMaterialColor(vec3 p, vec3 n, vec3 rd, float t, float mat) {
                    // Depth-to-Hue Mapping
                    float dNorm = clamp(t / 12.0, 0.0, 1.0);
                    
                    vec3 hotPink = vec3(1.0, 0.0, 0.4);
                    vec3 electricBlue = vec3(0.0, 0.5, 1.0);
                    vec3 acidGreen = vec3(0.6, 1.0, 0.0);
                    vec3 neonYellow = vec3(1.0, 1.0, 0.0);
                    
                    vec3 depthCol = mix(hotPink, electricBlue, dNorm);
                    vec3 col = vec3(0.0);
                    
                    if (mat == 1.0) {
                        // Structural Color Iridescence
                        float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
                        vec3 phase = vec3(0.0, 2.094, 4.188); 
                        vec3 irid = 0.5 + 0.5 * cos(6.2831 * (fresnel * 1.2 + dNorm * 2.0 + phase/6.2831));
                        col = mix(depthCol, irid, 0.8) + fresnel * acidGreen;
                    }
                    else if (mat == 2.0) {
                        // Circuit Bloom
                        vec3 neon = mix(electricBlue, neonYellow, step(0.5, fract(sin(floor(p.z)) * 43758.5)));
                        float pulse = sin(p.z * 10.0 - u_time * 8.0) * 0.5 + 0.5;
                        col = neon * (1.0 + pulse * 1.5);
                    }
                    else if (mat == 3.0) {
                        // Dielectric Crystals
                        float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);
                        col = mix(vec3(1.0), acidGreen, fresnel);
                        col *= 1.5; 
                    }
                    else if (mat == 4.0) {
                        // VHS Tape Oxide
                        float scanline = step(0.5, fract(p.z * 15.0 - u_time * 4.0));
                        col = mix(vec3(0.1, 0.0, 0.3), hotPink, scanline);
                        float spec = pow(max(dot(reflect(rd, n), normalize(vec3(1.0, 1.0, -1.0))), 0.0), 32.0);
                        col += spec * vec3(1.0);
                    }
                    else if (mat == 5.0) {
                        // Suspended Particulates
                        col = mix(hotPink, neonYellow, fract(p.x * 10.0)) * 2.0;
                    }
                    
                    return col;
                }

                void main() {
                    vec2 p = (vUv - 0.5) * 2.0;
                    p.x *= u_resolution.x / u_resolution.y;

                    // --- Analog Degradation Pre-Pass (Genome: vhs_analog_artifacts) ---
                    // Head Switching Distortion
                    float headSwitch = step(vUv.y, 0.04);
                    if (headSwitch > 0.5) {
                        p.x += (fract(sin(vUv.y * 200.0 + u_time * 60.0) * 43758.5) - 0.5) * 0.15;
                    }

                    // Tape Tracking Tear
                    float trackY = 0.2 + 0.15 * sin(u_time * 0.3);
                    float trackBand = smoothstep(0.08, 0.0, abs(vUv.y - trackY));
                    p.x += trackBand * (fract(sin(vUv.y * 100.0 + u_time * 50.0) * 43758.5) - 0.5) * 0.1;

                    // --- Wiggle Stereoscopy (Genome: wiggle_stereoscopy) ---
                    // 7Hz stepped toggle between left and right eye
                    float wiggleFreq = 7.0;
                    float eye = step(0.5, fract(u_time * wiggleFreq)) * 2.0 - 1.0; 
                    float baseline = 0.2; // Hyperstereo exaggeration
                    float focal = 1.0;    // Convergence distance
                    
                    // Off-axis projection shift
                    p.x -= eye * baseline * 0.5 / focal;

                    // Camera Kinematics
                    vec3 ro = vec3(0.0, 0.0, u_time * 2.5);
                    ro.x += sin(u_time * 0.4) * 0.4;
                    ro.y += cos(u_time * 0.3) * 0.3;

                    vec3 ta = ro + vec3(0.0, 0.0, 1.0);
                    ta.x += sin(u_time * 0.5) * 0.3;
                    ta.y += cos(u_time * 0.6) * 0.3;

                    vec3 forward = normalize(ta - ro);
                    vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
                    vec3 up = cross(right, forward);

                    // Off-axis origin shift
                    ro += right * eye * baseline * 0.5;
                    vec3 rd = normalize(p.x * right + p.y * up + focal * forward);
                    
                    // --- Raymarching Engine ---
                    float t = 0.0;
                    float mat = 0.0;
                    float glow = 0.0;
                    vec3 rp;
                    
                    for(int i = 0; i < 80; i++) {
                        rp = ro + rd * t;
                        vec2 d = map(rp);
                        
                        // Accumulate volumetric bloom around emissive objects
                        if (d.y == 2.0 || d.y == 3.0 || d.y == 5.0) {
                            glow += 0.015 / (0.02 + d.x * d.x);
                        }
                        
                        if(d.x < 0.002 || t > 15.0) {
                            mat = d.y;
                            break;
                        }
                        t += d.x * 0.6; // Conservative step for TPMS stability
                    }
                    
                    vec3 col = vec3(0.02, 0.0, 0.05); // Abyssal background
                    
                    if (t < 15.0) {
                        vec3 n = calcNormal(rp);
                        col = getMaterialColor(rp, n, rd, t, mat);
                        
                        // Distance fog
                        float fog = clamp(exp(-t * 0.15), 0.0, 1.0);
                        col = mix(vec3(0.02, 0.0, 0.05), col, fog);
                    }
                    
                    // Add accumulated volumetric bloom
                    col += vec3(0.0, 0.8, 1.0) * glow * 0.1;
                    
                    // --- Post-Processing ---
                    // Lateral Chromatic Shift (Simulated Lens Dispersion)
                    float radial = length(vUv - 0.5);
                    col *= mix(vec3(1.0), vec3(1.0, 0.6, 1.4), radial * 0.5);
                    
                    // CRT Scanlines & Vignette
                    col *= 1.0 - 0.1 * sin(vUv.y * u_resolution.y * 3.14159);
                    vec2 vig = vUv * 2.0 - 1.0;
                    col *= 1.0 - dot(vig, vig) * 0.2;
                    
                    // Tape Dropout (White oxide loss sparks)
                    float dropout = hash13(vec3(vUv * u_resolution, u_time * 10.0));
                    if (dropout > 0.997) col = vec3(1.0);
                    
                    // Gamma lift
                    col = pow(col, vec3(0.9)); 
                    
                    fragColor = vec4(col, 1.0);
                }
            `
        });
        
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);
        canvas.__three = { renderer, scene, camera, material };
    } catch(e) {
        console.error("WebGL Initialization Failed:", e);
        return;
    }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms) {
    if (material.uniforms.u_time) material.uniforms.u_time.value = time;
    if (material.uniforms.u_resolution) {
        material.uniforms.u_resolution.value.set(grid.width, grid.height);
    }
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);