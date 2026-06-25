/**
 * Prismatic Scale Matrix
 * A luxurious, holographic, fully-procedural snakeskin shader.
 * Integrates concepts from snakeskin_systems (Voronoi imbrication, keels), 
 * color_systems (OKLab perceptual interpolation, candy/acid palettes),
 * diffraction_grating & birefringence (thin-film interference, spectral rims),
 * and domain_coloring (complex math embedded on the scales).
 * 
 * Controls:
 * - Mouse Drag: Change virtual light angle
 * - Click: Trigger a chromatic shockwave
 * - Keys C, F, D, O, P: Cycle through palettes, false-color modes, 
 *   domain coloring, optical effects, and packing styles.
 */

return function(ctx, grid, time, repos, input, mouse, canvas, THREE) {
    // Initialize Three.js resources only once per canvas
    if (!canvas.__three) {
        try {
            if (!ctx) throw new Error("WebGL2 context not available");

            const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            
            const scene = new THREE.Scene();
            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
            camera.position.z = 1;

            const vertexShader = `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `;

            const fragmentShader = `
                precision highp float;
                
                in vec2 vUv;
                out vec4 fragColor;

                uniform float u_time;
                uniform vec2 u_resolution;
                uniform vec2 u_mouse;
                uniform vec3 u_lightDir;
                uniform vec2 u_clickPos;
                uniform float u_clickTime;
                
                uniform int u_paletteIdx;
                uniform int u_fcIdx;
                uniform int u_dcIdx;
                uniform int u_opticsIdx;
                uniform int u_packingIdx;

                #define PI 3.14159265359
                #define TAU 6.28318530718

                // --- Hash & Noise ---
                vec2 hash22(vec2 p) {
                    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
                    return fract(sin(p) * 43758.5453123);
                }
                float hash21(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }

                // --- Complex Math (Domain Coloring) ---
                vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
                vec2 cdiv(vec2 a, vec2 b) { float d = dot(b,b); return vec2(dot(a,b), a.y*b.x - a.x*b.y)/d; }
                vec2 csqr(vec2 a) { return vec2(a.x*a.x - a.y*a.y, 2.0*a.x*a.y); }

                // --- OKLab Perceptual Color Math ---
                float cbrt_sign(float x) { return sign(x) * pow(abs(x), 1.0/3.0); }
                
                vec3 linear_srgb_to_oklab(vec3 c) {
                    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
                    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
                    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
                    return vec3(
                        0.2104542553 * cbrt_sign(l) + 0.7936177850 * cbrt_sign(m) - 0.0040720468 * cbrt_sign(s),
                        1.9779984951 * cbrt_sign(l) - 2.4285922050 * cbrt_sign(m) + 0.4505937099 * cbrt_sign(s),
                        0.0259040371 * cbrt_sign(l) + 0.7827717662 * cbrt_sign(m) - 0.8086757660 * cbrt_sign(s)
                    );
                }

                vec3 oklab_to_linear_srgb(vec3 c) {
                    float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
                    float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
                    float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
                    float l = l_*l_*l_;
                    float m = m_*m_*m_;
                    float s = s_*s_*s_;
                    return vec3(
                         4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                    );
                }

                vec3 srgb_to_linear(vec3 c) {
                    vec3 b = c / 12.92;
                    vec3 a = pow((c + 0.055) / 1.055, vec3(2.4));
                    return mix(b, a, step(vec3(0.04045), c));
                }

                vec3 linear_to_srgb(vec3 c) {
                    vec3 b = c * 12.92;
                    vec3 a = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0/2.4)) - 0.055;
                    return mix(b, a, step(vec3(0.0031308), c));
                }

                // --- Palettes ---
                vec3 getPalette(int idx, float t) {
                    t = fract(t);
                    vec3 c1, c2, c3, c4;
                    if(idx == 0) { // Candy Prism
                        c1=vec3(1.0,0.1,0.6); c2=vec3(0.1,0.9,1.0); c3=vec3(0.9,1.0,0.1); c4=vec3(0.6,0.0,1.0);
                    } else if(idx == 1) { // UV Jewel
                        c1=vec3(0.5,0.0,1.0); c2=vec3(0.0,0.5,1.0); c3=vec3(1.0,0.0,1.0); c4=vec3(0.2,0.8,1.0);
                    } else if(idx == 2) { // Tropical Foil
                        c1=vec3(1.0,0.3,0.4); c2=vec3(0.0,1.0,0.5); c3=vec3(0.0,0.8,1.0); c4=vec3(1.0,0.8,0.0);
                    } else if(idx == 3) { // Electric Opal
                        c1=vec3(1.0,0.0,1.0); c2=vec3(0.5,1.0,0.0); c3=vec3(0.0,0.6,1.0); c4=vec3(1.0,1.0,1.0);
                    } else { // Neon Mineral
                        c1=vec3(1.0,0.0,0.8); c2=vec3(1.0,0.5,0.0); c3=vec3(0.3,0.0,1.0); c4=vec3(1.0,0.2,0.0);
                    }
                    
                    t *= 4.0;
                    int stepIdx = int(floor(t));
                    float f = fract(t);
                    vec3 a, b;
                    if(stepIdx==0){a=c1;b=c2;} else if(stepIdx==1){a=c2;b=c3;} else if(stepIdx==2){a=c3;b=c4;} else {a=c4;b=c1;}
                    
                    // Interpolate in OKLab space for perceptual smoothness
                    vec3 oklabA = linear_srgb_to_oklab(srgb_to_linear(a));
                    vec3 oklabB = linear_srgb_to_oklab(srgb_to_linear(b));
                    vec3 mixed = mix(oklabA, oklabB, f);
                    return clamp(linear_to_srgb(oklab_to_linear_srgb(mixed)), 0.0, 1.0);
                }

                vec3 getDepthColor(int idx) {
                    if(idx==0) return vec3(0.15, 0.0, 0.3); // Plum
                    if(idx==1) return vec3(0.0, 0.1, 0.2);  // Deep teal
                    if(idx==2) return vec3(0.1, 0.0, 0.2);  // Indigo
                    if(idx==3) return vec3(0.1, 0.0, 0.15); // Dark violet
                    return vec3(0.2, 0.0, 0.1);             // Deep rust/violet
                }

                // --- Spectral Optics ---
                vec3 spectral_color(float w) {
                    return clamp(abs(fract(w + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
                }

                // --- Scale Packing Logic ---
                vec2 g_shapeScale;
                float g_roundness;
                float g_tilt;
                float g_jitter;

                void setupPacking() {
                    if (u_packingIdx == 0) { // Diamondback
                        g_shapeScale = vec2(1.0, 1.5); g_roundness = 1.0; g_tilt = 0.8; g_jitter = 0.2;
                    } else if (u_packingIdx == 1) { // Reticulated
                        g_shapeScale = vec2(1.0, 1.0); g_roundness = 2.0; g_tilt = 0.5; g_jitter = 0.4;
                    } else if (u_packingIdx == 2) { // Beaded
                        g_shapeScale = vec2(1.0, 1.0); g_roundness = 4.0; g_tilt = 0.2; g_jitter = 0.45;
                    } else { // Shield
                        g_shapeScale = vec2(1.5, 0.8); g_roundness = 1.5; g_tilt = 1.2; g_jitter = 0.1;
                    }
                }

                float getScaleHeight(vec2 local) {
                    float r = 0.0;
                    if (u_packingIdx == 0) {
                        r = abs(local.x * g_shapeScale.x) + abs(local.y * g_shapeScale.y); // L1 norm diamond
                    } else if (u_packingIdx == 3) {
                        r = max(abs(local.x * g_shapeScale.x), abs(local.y * g_shapeScale.y)); // L_inf norm plate
                    } else {
                        r = length(local * g_shapeScale); // L2 norm circular
                    }

                    float profile = 1.0 - pow(r, g_roundness);
                    float h = profile + local.y * g_tilt;

                    // Keel ridge
                    float keel = max(1.0 - abs(local.x * 2.5), 0.0);
                    if (u_packingIdx == 0) h += keel * 0.4;
                    if (u_packingIdx == 3) h += keel * 0.15;

                    return h;
                }

                void main() {
                    vec2 uv = (vUv - 0.5) * u_resolution / min(u_resolution.x, u_resolution.y);
                    
                    setupPacking();
                    float gridScale = (u_packingIdx == 2) ? 24.0 : (u_packingIdx == 3 ? 8.0 : 14.0);
                    vec2 p = uv * gridScale;
                    if (u_packingIdx == 0) p.x *= 0.8;
                    if (u_packingIdx == 3) p.x *= 1.5;

                    vec2 cellId = floor(p);
                    
                    float bestH = -9999.0;
                    vec2 bestLocal = vec2(0.0);
                    vec2 bestCenter = vec2(0.0);
                    float bestId = 0.0;

                    // 5x5 Imbrication search
                    for(int y=-2; y<=2; y++) {
                        for(int x=-2; x<=2; x++) {
                            vec2 neighbor = vec2(float(x), float(y));
                            vec2 id = cellId + neighbor;
                            vec2 center = id + 0.5 + hash22(id) * g_jitter;
                            vec2 local = p - center;
                            
                            // Optimization: skip if definitively outside
                            if(length(local * g_shapeScale) > 1.8) continue;
                            
                            float h = getScaleHeight(local);
                            if (h > bestH) {
                                bestH = h;
                                bestLocal = local;
                                bestCenter = center;
                                bestId = hash21(id);
                            }
                        }
                    }

                    // Compute Normal via finite difference
                    vec2 eps = vec2(0.01, 0.0);
                    float h0 = getScaleHeight(bestLocal);
                    float hx = getScaleHeight(bestLocal + eps.xy);
                    float hy = getScaleHeight(bestLocal + eps.yx);
                    vec3 normal = normalize(vec3(h0 - hx, h0 - hy, 0.08));

                    // Edge distance for rims and shadows
                    float rDist = (u_packingIdx == 0) ? (abs(bestLocal.x*g_shapeScale.x) + abs(bestLocal.y*g_shapeScale.y)) : length(bestLocal * g_shapeScale);
                    float edgeDist = 1.0 - rDist;

                    // --- Domain Coloring Math on Scale ---
                    float dcPhase = 0.0;
                    float dcRings = 0.0;
                    if (u_dcIdx > 0) {
                        vec2 z = bestLocal * 3.0;
                        vec2 w = z;
                        if(u_dcIdx == 1) w = csqr(z) + vec2(sin(u_time), cos(u_time))*0.5;
                        else if(u_dcIdx == 2) w = cdiv(z - vec2(0.5,0.0), z + vec2(0.5,0.0));
                        else if(u_dcIdx == 3) w = vec2(sin(z.x)*cosh(z.y), cos(z.x)*sinh(z.y));
                        
                        dcPhase = atan(w.y, w.x) / TAU + 0.5;
                        dcRings = fract(log2(length(w) + 1.0) * 5.0);
                    }

                    // --- False Color Mapping ---
                    float fcVal = 0.0;
                    if (u_fcIdx == 0) fcVal = bestH * 0.5;
                    else if (u_fcIdx == 1) fcVal = bestId;
                    else if (u_fcIdx == 2) fcVal = normal.x * 0.5 + normal.y * 0.5;
                    else if (u_fcIdx == 3) fcVal = bestCenter.y * 0.05 - bestCenter.x * 0.05;

                    float palOffset = fcVal + u_time * 0.15 + (u_dcIdx > 0 ? dcPhase * 0.3 : 0.0);
                    vec3 baseColor = getPalette(u_paletteIdx, palOffset);

                    // --- Domain Coloring Overlay ---
                    if (u_dcIdx > 0) {
                        vec3 dcCol = getPalette(u_paletteIdx, dcPhase - u_time * 0.1);
                        float ringMask = smoothstep(0.0, 0.1, dcRings) * smoothstep(1.0, 0.9, dcRings);
                        baseColor = mix(baseColor, dcCol, ringMask * 0.5);
                    }

                    // --- Optics & Lighting ---
                    vec3 viewDir = vec3(0.0, 0.0, 1.0);
                    vec3 halfVec = normalize(u_lightDir + viewDir);
                    float NdotL = max(dot(normal, u_lightDir), 0.0);
                    float NdotH = max(dot(normal, halfVec), 0.0);
                    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 4.0);

                    vec3 color = baseColor * (0.3 + 0.7 * NdotL);
                    
                    // Specular highlights
                    color += pow(NdotH, 64.0) * vec3(1.0); // Sharp
                    color += pow(NdotH, 12.0) * 0.6 * spectral_color(fract(bestId + u_time*0.1)); // Colored broad

                    // Optics Modes (O key)
                    if (u_opticsIdx == 1 || u_opticsIdx == 3) {
                        // Birefringence / Thin-film interference
                        float thickness = bestH * 3.0 + bestId * 2.0;
                        float gamma = thickness * 400.0; 
                        vec3 interference = vec3(
                            sin(gamma / 600.0)*sin(gamma / 600.0),
                            sin(gamma / 500.0)*sin(gamma / 500.0),
                            sin(gamma / 400.0)*sin(gamma / 400.0)
                        ) * 1.5;
                        color += interference * fresnel;
                    }
                    
                    if (u_opticsIdx == 0 || u_opticsIdx == 3) {
                        // Diffraction Grating Shimmer
                        float grating = sin(dot(bestLocal, vec2(120.0, -60.0)) - u_time * 8.0);
                        float diffAngle = fract(grating * 0.2 + 0.5 + NdotL);
                        vec3 diffColor = spectral_color(diffAngle);
                        color += diffColor * 0.5 * NdotL * smoothstep(0.0, 0.5, edgeDist);
                    }

                    if (u_opticsIdx == 2) {
                        // Maximal spectral rim dispersion
                        float rim = smoothstep(0.3, 0.0, edgeDist);
                        vec3 rimColor = spectral_color(fract(edgeDist * 5.0 - u_time + bestId));
                        color += rim * rimColor * 2.0 * fresnel;
                    }

                    // Chromostereopsis Depth Edge Accents
                    color.r += smoothstep(0.2, 0.8, bestLocal.y) * 0.4 * edgeDist;
                    color.b += smoothstep(-0.2, -0.8, bestLocal.y) * 0.4 * edgeDist;

                    // Click Shockwave Pulse
                    vec2 scaledClick = (u_clickPos - 0.5) * u_resolution / min(u_resolution.x, u_resolution.y) * gridScale;
                    if (u_packingIdx == 0) scaledClick.x *= 0.8;
                    if (u_packingIdx == 3) scaledClick.x *= 1.5;
                    float distToClick = length(bestCenter - scaledClick);
                    float pulseRadius = (u_time - u_clickTime) * 20.0;
                    float pulse = exp(-pow((distToClick - pulseRadius)*1.5, 2.0)) * smoothstep(0.0, 1.0, u_time - u_clickTime);
                    if (u_time - u_clickTime < 3.0) {
                        color += pulse * spectral_color(fract(bestId - u_time));
                    }

                    // Deep gaps
                    float shadow = smoothstep(-0.1, 0.15, edgeDist);
                    color = mix(getDepthColor(u_paletteIdx), color, shadow);

                    // Vignette
                    float vig = length(vUv - 0.5) * 2.0;
                    color *= 1.0 - pow(vig, 3.0) * 0.3;

                    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
                }
            `;

            const material = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                vertexShader,
                fragmentShader,
                uniforms: {
                    u_time: { value: time },
                    u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                    u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
                    u_lightDir: { value: new THREE.Vector3(0.5, 0.5, 1.0).normalize() },
                    u_clickPos: { value: new THREE.Vector2(-99.0, -99.0) },
                    u_clickTime: { value: -999.0 },
                    u_paletteIdx: { value: 0 },
                    u_fcIdx: { value: 0 },
                    u_dcIdx: { value: 0 },
                    u_opticsIdx: { value: 3 },
                    u_packingIdx: { value: 0 }
                },
                depthWrite: false,
                depthTest: false
            });

            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
            scene.add(mesh);
            
            canvas.__three = { renderer, scene, camera, material };

            // Interaction State
            canvas.__lightTheta = Math.PI / 4;
            canvas.__lightPhi = Math.PI / 4;

            // Event Listeners
            if (!canvas.__eventsAttached) {
                canvas.__eventsAttached = true;
                
                let isDragging = false;
                let lastPos = {x: 0, y: 0};

                canvas.addEventListener('pointerdown', e => {
                    isDragging = true;
                    lastPos.x = e.clientX;
                    lastPos.y = e.clientY;
                    
                    const rect = canvas.getBoundingClientRect();
                    const nx = (e.clientX - rect.left) / rect.width;
                    const ny = 1.0 - (e.clientY - rect.top) / rect.height;
                    
                    material.uniforms.u_clickPos.value.set(nx, ny);
                    material.uniforms.u_clickTime.value = performance.now() / 1000.0;
                });

                window.addEventListener('pointerup', () => { isDragging = false; });
                
                window.addEventListener('pointermove', e => {
                    if (isDragging) {
                        const dx = e.clientX - lastPos.x;
                        const dy = e.clientY - lastPos.y;
                        canvas.__lightTheta -= dx * 0.01;
                        canvas.__lightPhi += dy * 0.01;
                        canvas.__lightPhi = Math.max(-Math.PI/2, Math.min(Math.PI/2, canvas.__lightPhi));
                        lastPos.x = e.clientX;
                        lastPos.y = e.clientY;
                    }
                    const rect = canvas.getBoundingClientRect();
                    material.uniforms.u_mouse.value.set(
                        (e.clientX - rect.left) / rect.width,
                        1.0 - (e.clientY - rect.top) / rect.height
                    );
                });

                window.addEventListener('keydown', e => {
                    const k = e.key.toLowerCase();
                    if (k === 'c') material.uniforms.u_paletteIdx.value = (material.uniforms.u_paletteIdx.value + 1) % 5;
                    if (k === 'f') material.uniforms.u_fcIdx.value = (material.uniforms.u_fcIdx.value + 1) % 4;
                    if (k === 'd') material.uniforms.u_dcIdx.value = (material.uniforms.u_dcIdx.value + 1) % 4;
                    if (k === 'o') material.uniforms.u_opticsIdx.value = (material.uniforms.u_opticsIdx.value + 1) % 4;
                    if (k === 'p') material.uniforms.u_packingIdx.value = (material.uniforms.u_packingIdx.value + 1) % 4;
                });
            }
        } catch (e) {
            console.error("WebGL Initialization Failed:", e);
            throw e;
        }
    }

    const { renderer, scene, camera, material } = canvas.__three;

    if (material && material.uniforms) {
        material.uniforms.u_time.value = time;
        material.uniforms.u_resolution.value.set(grid.width, grid.height);
        
        // Update Light Direction based on drag angles
        const theta = canvas.__lightTheta;
        const phi = canvas.__lightPhi;
        material.uniforms.u_lightDir.value.set(
            Math.cos(phi) * Math.sin(theta),
            Math.sin(phi),
            Math.cos(phi) * Math.cos(theta)
        ).normalize();
    }

    renderer.setSize(grid.width, grid.height, false);
    renderer.render(scene, camera);
};