/**
 * THE ALCHEMICAL STEREOGRAM
 * A Single-Image Stereogram (SIS) generated via a two-pass WebGL2 pipeline.
 * 
 * PASS 1: Raymarches an impossible optical machine (gyroid lattices, birefringent crystals, 
 *         lens arrays) into a high-precision depth map.
 * PASS 2: Executes a backward-tracing stereogram algorithm. The carrier pattern is a living
 *         optical material woven from CRT phosphor triads, Risograph halftones, Michel-Lévy 
 *         interference colors, and Outsider Art horror vacui noise.
 * 
 * CRITICAL OPTICAL FIX: The stereoscopic separation distance is quantized to multiples of 3 pixels.
 * This ensures the RGB phosphor triads in the carrier pattern never break sequence across depth 
 * discontinuities, allowing the brain to fuse the high-frequency CRT mask seamlessly.
 */

if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // High-precision render target for the depth map
        const depthTarget = new THREE.WebGLRenderTarget(grid.width, grid.height, {
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter
        });

        // ---------------------------------------------------------------------
        // PASS 1: DEPTH MAP GENERATOR (THE HIDDEN 3D WORLD)
        // ---------------------------------------------------------------------
        const depthVertexShader = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        const depthFragmentShader = `
            #version 300 es
            precision highp float;
            
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform vec2 u_resolution;
            uniform float u_time;
            
            mat2 rot(float a) {
                float s = sin(a), c = cos(a);
                return mat2(c, -s, s, c);
            }
            
            float sdOctahedron(vec3 p, float s) {
                p = abs(p);
                return (p.x + p.y + p.z - s) * 0.57735027;
            }
            
            float sdGyroid(vec3 p, float scale) {
                p *= scale;
                return abs(dot(sin(p), cos(p.zxy))) / scale;
            }
            
            float map(vec3 p) {
                float d = 100.0;
                
                // Floor and Ceiling (Compression)
                float floor = p.y + 2.5 - sin(p.x * 2.0) * sin(p.z * 2.0) * 0.15;
                float ceiling = 3.5 - p.y - sin(p.x * 3.0) * sin(p.z * 3.0) * 0.1;
                d = min(d, min(floor, ceiling));
                
                // Central Birefringent Crystal
                vec3 pC = p;
                pC.z -= 6.0; 
                pC.y -= 0.5 + sin(u_time * 1.5) * 0.2; // Hovering
                pC.xy *= rot(u_time * 0.3);
                pC.xz *= rot(u_time * 0.5);
                
                float diamond = sdOctahedron(pC, 1.6 + sin(u_time * 2.0) * 0.05);
                
                // Hollow out the crystal with optical channels
                float inner = sdOctahedron(pC, 1.3);
                float holes = min(length(pC.xy) - 0.4, min(length(pC.xz) - 0.4, length(pC.yz) - 0.4));
                diamond = max(diamond, -inner);
                diamond = max(diamond, -holes);
                
                // Spinning inner core
                vec3 pCore = pC;
                pCore.xy *= rot(u_time * 2.0);
                pCore.xz *= rot(u_time * -1.5);
                float core = sdOctahedron(pCore, 0.5);
                diamond = min(diamond, core);
                
                d = min(d, diamond);
                
                // Circular Colonnade (Diffraction Machinery)
                vec3 pCol = p;
                pCol.z -= 6.0;
                float angle = atan(pCol.z, pCol.x);
                float radius = length(pCol.xz);
                
                // 12 pillars
                float aMod = mod(angle, 0.523598) - 0.261799; 
                vec3 pPillar = vec3(cos(aMod) * radius, pCol.y, sin(aMod) * radius);
                pPillar.x -= 3.5; 
                float pillar = length(pPillar.xz) - 0.2;
                
                // Add structural ridges
                pillar -= sin(pPillar.y * 25.0) * 0.03;
                d = min(d, pillar);
                
                // Deep Background: Gyroid Cathedral Wall (Horror Vacui)
                float wall = p.z - 11.0;
                float arches = length(vec2(mod(p.x, 4.0) - 2.0, p.y + 2.5)) - 1.5;
                wall = max(wall, -arches);
                
                // Infest back wall with gyroid lattice
                float gyr = sdGyroid(p, 4.0) - 0.05;
                wall = max(wall, gyr);
                
                d = min(d, wall);
                
                return d;
            }
            
            void main() {
                vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
                
                vec3 ro = vec3(0.0, 0.0, -2.0);
                vec3 rd = normalize(vec3(p, 1.0));
                
                float t = 0.0;
                for(int i = 0; i < 120; i++) {
                    vec3 pos = ro + rd * t;
                    float d = map(pos);
                    if(d < 0.001) break;
                    t += d;
                    if(t > 25.0) break;
                }
                
                // Map depth to [0, 1] where 1 is near, 0 is far
                float z = 1.0 - clamp(t / 25.0, 0.0, 1.0);
                
                // Curve to enhance stereoscopic separation layers
                z = smoothstep(0.0, 0.95, z); 
                
                fragColor = vec4(z, z, z, 1.0);
            }
        `;

        // ---------------------------------------------------------------------
        // PASS 2: STEREOGRAM ENCODER & CARRIER PATTERN
        // ---------------------------------------------------------------------
        const stereoFragmentShader = `
            #version 300 es
            precision highp float;
            
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform sampler2D u_depth;
            uniform vec2 u_resolution;
            uniform float u_time;
            uniform float u_period;
            uniform float u_depth_factor;
            
            // Simplex 3D Noise for seamless cylinder mapping
            vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
            float taylorInvSqrt(float r){return 1.79284291400159 - 0.85373472095314 * r;}
            
            float snoise(vec3 v){ 
                const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
                const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
                vec3 i  = floor(v + dot(v, C.yyy) );
                vec3 x0 = v - i + dot(i, C.xxx) ;
                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min( g.xyz, l.zxy );
                vec3 i2 = max( g.xyz, l.zxy );
                vec3 x1 = x0 - i1 + 1.0 * C.xxx;
                vec3 x2 = x0 - i2 + 2.0 * C.xxx;
                vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
                i = mod(i, 289.0 ); 
                vec4 p = permute( permute( permute( 
                           i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                         + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                         + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
                float n_ = 1.0/7.0;
                vec3  ns = n_ * D.wyz - D.xzx;
                vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
                vec4 x_ = floor(j * ns.z);
                vec4 y_ = floor(j - 7.0 * x_ );
                vec4 x = x_ *ns.x + ns.yyyy;
                vec4 y = y_ *ns.x + ns.yyyy;
                vec4 h = 1.0 - abs(x) - abs(y);
                vec4 b0 = vec4( x.xy, y.xy );
                vec4 b1 = vec4( x.zw, y.zw );
                vec4 s0 = floor(b0)*2.0 + 1.0;
                vec4 s1 = floor(b1)*2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));
                vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
                vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
                vec3 p0 = vec3(a0.xy,h.x);
                vec3 p1 = vec3(a0.zw,h.y);
                vec3 p2 = vec3(a1.xy,h.z);
                vec3 p3 = vec3(a1.zw,h.w);
                vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
                vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                m = m * m;
                return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
            }
            
            // Procedural Carrier Texture
            vec3 generatePattern(vec2 uv, float origX) {
                // Map uv.x seamlessly around a cylinder
                float angle = uv.x * 6.2831853;
                vec3 p3 = vec3(cos(angle), sin(angle), uv.y * 3.0);
                
                // Multi-scale noise for Outsider Art obsessive horror vacui
                float n1 = snoise(p3 * 2.0 + u_time * 0.1);
                float n2 = snoise(p3 * 8.0 - u_time * 0.15);
                float n3 = snoise(p3 * 30.0);
                
                float thickness = n1 * 0.5 + 0.5 + n2 * 0.2 + n3 * 0.05;
                
                // Michel-Lévy interference colors (Birefringence)
                float gamma = thickness * 3.0;
                vec3 spectral = 0.5 + 0.5 * cos(6.28318 * (gamma + vec3(0.0, 0.33, 0.67)));
                spectral = smoothstep(0.0, 1.0, spectral); // Contrast boost
                
                // Risograph Halftone AM Screen
                float lpi = 24.0;
                float hx = uv.x * 6.2831853 * lpi; 
                float hy = uv.y * 6.2831853 * lpi * (u_resolution.y / u_period);
                float dots = sin(hx + n2) * sin(hy + n1);
                float halftone = smoothstep(-0.1, 0.1, dots + n3);
                
                vec3 col = spectral * mix(0.15, 1.0, halftone);
                
                // Outsider Art sharp scribbles
                float scribble = snoise(p3 * 50.0);
                col = mix(col, vec3(0.02, 0.0, 0.05), smoothstep(0.7, 0.8, scribble));
                
                // CRT Phosphor Triads (from crt_phosphor_fx)
                // Using the absolute X coordinate to maintain perfect subpixel registry
                float triad = mod(origX, 3.0);
                vec3 phosphor = vec3(
                    smoothstep(1.0, 0.0, abs(triad - 0.5)),
                    smoothstep(1.0, 0.0, abs(triad - 1.5)),
                    smoothstep(1.0, 0.0, abs(triad - 2.5))
                );
                
                col *= mix(vec3(1.0), phosphor * 2.5, 0.75);
                
                return col;
            }
            
            void main() {
                float period = u_period;
                float curX = gl_FragCoord.x;
                float y = gl_FragCoord.y;
                
                // Backward-tracing stereogram algorithm
                for(int i = 0; i < 60; i++) {
                    if (curX < period) break;
                    
                    // Sample depth at current right-eye position
                    vec2 dUv = vec2(curX / u_resolution.x, y / u_resolution.y);
                    float z1 = texture(u_depth, dUv).r;
                    float sep1 = period - z1 * u_depth_factor;
                    
                    // Refine sample at midpoint for better occlusion/edge handling
                    vec2 dUv2 = vec2((curX - sep1 * 0.5) / u_resolution.x, y / u_resolution.y);
                    float z2 = texture(u_depth, dUv2).r;
                    
                    // CRITICAL: Quantize separation to a multiple of 3 pixels!
                    // This ensures the RGB CRT phosphor triads never break sequence 
                    // across depth discontinuities, allowing perfect stereoscopic fusion.
                    float raw_sep = period - z2 * u_depth_factor;
                    float sep = floor(raw_sep / 3.0) * 3.0;
                    
                    curX -= sep;
                }
                
                curX = mod(curX, period);
                vec2 patternUv = vec2(curX / period, y / u_resolution.y);
                
                // Generate the optical carrier texture
                vec3 col = generatePattern(patternUv, curX);
                
                // Stereogram Focus Guides (two dots at the bottom)
                if (y < 24.0 && y > 12.0) {
                    float midX = u_resolution.x * 0.5;
                    float d1 = length(vec2(gl_FragCoord.x - (midX - period * 0.5), y - 18.0));
                    float d2 = length(vec2(gl_FragCoord.x - (midX + period * 0.5), y - 18.0));
                    if (d1 < 4.0 || d2 < 4.0) {
                        col = vec3(1.0); // White dot
                    } else if (d1 < 6.0 || d2 < 6.0) {
                        col = vec3(0.0); // Black outline
                    }
                }
                
                fragColor = vec4(col, 1.0);
            }
        `;

        const depthMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2() }
            },
            vertexShader: depthVertexShader,
            fragmentShader: depthFragmentShader
        });

        const stereoMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2() },
                u_depth: { value: depthTarget.texture },
                u_period: { value: 120.0 },
                u_depth_factor: { value: 30.0 }
            },
            vertexShader: depthVertexShader,
            fragmentShader: stereoFragmentShader
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), depthMat);
        scene.add(mesh);

        canvas.__three = { renderer, scene, camera, depthTarget, depthMat, stereoMat, mesh };

    } catch (e) {
        console.error("WebGL 2 Initialization Failed:", e);
        return;
    }
}

const { renderer, scene, camera, depthTarget, depthMat, stereoMat, mesh } = canvas.__three;

if (depthMat && stereoMat) {
    // Determine the optimal stereogram pattern period based on screen width.
    // Must be a multiple of 3 to align with the RGB phosphor triads.
    let targetPeriod = Math.floor((grid.width * 0.12) / 3.0) * 3.0;
    let period = Math.max(90.0, Math.min(300.0, targetPeriod));

    // Update Uniforms
    depthMat.uniforms.u_time.value = time;
    depthMat.uniforms.u_resolution.value.set(grid.width, grid.height);

    stereoMat.uniforms.u_time.value = time;
    stereoMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    stereoMat.uniforms.u_period.value = period;
    stereoMat.uniforms.u_depth_factor.value = period * 0.35; // 35% depth pop-out

    // Handle resizing
    renderer.setSize(grid.width, grid.height, false);
    if (depthTarget.width !== grid.width || depthTarget.height !== grid.height) {
        depthTarget.setSize(grid.width, grid.height);
    }

    // Pass 1: Render the hidden 3D depth map to the framebuffer
    mesh.material = depthMat;
    renderer.setRenderTarget(depthTarget);
    renderer.render(scene, camera);

    // Pass 2: Render the stereogram encoding to the screen
    mesh.material = stereoMat;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
}