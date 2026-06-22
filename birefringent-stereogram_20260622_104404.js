if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneGeometry(2, 2);

        // Pass 1: Depth Map Generator (The Hidden Impossible Machine)
        const depthTarget = new THREE.WebGLRenderTarget(grid.width, grid.height, {
            type: THREE.HalfFloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: false,
            stencilBuffer: false
        });

        const depthMaterial = new THREE.ShaderMaterial({
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
                in vec2 vUv;
                out vec4 fragColor;
                
                uniform float u_time;
                uniform vec2 u_resolution;

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
                    vec3 bp = p;
                    
                    // Rotate the entire spatial manifold slowly
                    p.xy *= rot(u_time * 0.1);
                    p.xz *= rot(u_time * 0.15);
                    
                    // Central birefringent crystal
                    float crystal = sdOctahedron(p, 1.5) - 0.15;
                    
                    // Hollow out the crystal for nested discovery
                    float crystalInner = sdOctahedron(p, 1.2);
                    crystal = max(crystal, -crystalInner);
                    
                    // Inner dense core
                    float core = sdOctahedron(p, 0.6);
                    crystal = min(crystal, core);
                    
                    // Gyroid lattice (phosphor matrix) interpenetrating the crystal
                    float gyroid = sdGyroid(p, 3.5) - 0.05;
                    
                    // Bound the gyroid to a sphere
                    float sphere = length(p) - 2.8;
                    float boundedGyroid = max(gyroid, sphere);
                    
                    // Combine core artifact
                    float machine = min(crystal, boundedGyroid);
                    
                    // Orbital rings (diffraction machinery)
                    vec3 rp1 = p;
                    rp1.xy *= rot(u_time * 0.6);
                    float ring1 = length(vec2(length(rp1.xy) - 3.4, rp1.z)) - 0.08;
                    
                    vec3 rp2 = p;
                    rp2.yz *= rot(-u_time * 0.4);
                    float ring2 = length(vec2(length(rp2.yz) - 4.0, rp2.x)) - 0.05;
                    
                    float objects = min(machine, min(ring1, ring2));
                    
                    // Deep background topography
                    float backdrop = 5.0 - bp.z + sin(bp.x * 1.2 + u_time) * cos(bp.y * 1.2) * 0.6;
                    
                    return min(objects, backdrop);
                }

                void main() {
                    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
                    
                    vec3 ro = vec3(0.0, 0.0, -6.0);
                    vec3 rd = normalize(vec3(uv, 1.0));
                    
                    float t = 0.0;
                    for(int i = 0; i < 120; i++) {
                        vec3 p = ro + rd * t;
                        float d = map(p);
                        if(d < 0.001 || t > 15.0) break;
                        t += d;
                    }
                    
                    // Normalize depth for the stereogram encoder
                    // t ranges roughly from 4.0 (front of crystal) to 11.0 (backdrop)
                    float depth = clamp(1.0 - (t - 4.0) / 7.0, 0.0, 1.0);
                    
                    // Apply a power curve to enhance the 3D pop and sharpen depth edges
                    depth = pow(depth, 1.3);
                    
                    fragColor = vec4(depth, depth, depth, 1.0);
                }
            `
        });

        // Pass 2: Autostereogram Encoder & Carrier Texture Generator
        const stereoMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_depthMap: { value: depthTarget.texture },
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_patternWidth: { value: 120.0 },
                u_amplitude: { value: 36.0 }
            },
            vertexShader: `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                
                uniform sampler2D u_depthMap;
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform float u_patternWidth;
                uniform float u_amplitude;

                // Hash function for cellular noise
                vec2 hash2(vec2 p) {
                    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
                    return fract(sin(p) * 43758.5453123);
                }

                // Voronoi distance field (Birefringent polarization domains)
                float voronoi(vec2 x) {
                    vec2 n = floor(x);
                    vec2 f = fract(x);
                    float md = 8.0;
                    for(int j = -1; j <= 1; j++) {
                        for(int i = -1; i <= 1; i++) {
                            vec2 g = vec2(float(i), float(j));
                            vec2 o = hash2(n + g);
                            // Animate the domains slightly
                            o = 0.5 + 0.5 * sin(u_time * 0.3 + 6.28318 * o);
                            vec2 r = g + o - f;
                            float d = dot(r, r);
                            if(d < md) md = d;
                        }
                    }
                    return sqrt(md);
                }

                // The Carrier Texture: A living optical material
                vec3 getCarrier(vec2 px) {
                    vec2 uv = px / u_patternWidth;
                    uv.y *= u_patternWidth / u_resolution.y; // Maintain physical aspect ratio
                    
                    // Multi-scale polarization domains
                    float v1 = voronoi(uv * 3.0);
                    float v2 = voronoi(uv * 6.0 + v1 * 0.5);
                    
                    // Michel-Lévy interference calculation (Structural color proxy)
                    float gamma = v2 * 2.5 + sin(uv.y * 12.0) * 0.15 + u_time * 0.1;
                    vec3 color = 0.5 + 0.5 * cos(6.28318 * (gamma * vec3(1.0, 0.75, 0.45) + vec3(0.0, 0.33, 0.67)));
                    
                    // Diffraction grating micro-lines
                    float grating = sin(px.y * 0.4 + px.x * 0.15);
                    color *= mix(0.8, 1.2, smoothstep(-0.1, 0.1, grating));
                    
                    // CRT Phosphor triad mask (RGB pixel structure)
                    float triad = mod(px.x, 3.0);
                    vec3 mask = vec3(
                        smoothstep(1.0, 0.0, abs(triad - 0.5)),
                        smoothstep(1.0, 0.0, abs(triad - 1.5)),
                        smoothstep(1.0, 0.0, abs(triad - 2.5))
                    );
                    color *= mix(vec3(1.0), mask, 0.65); // 65% opacity phosphor overlay
                    
                    // High-frequency perceptual grit (Crucial for stereogram eye-locking)
                    float grit = fract(sin(dot(px, vec2(12.9898, 78.233))) * 43758.5453);
                    color *= mix(0.85, 1.15, step(0.5, grit));
                    
                    // Normalize and boost contrast
                    return smoothstep(0.0, 1.0, color * 1.1);
                }

                void main() {
                    vec2 px = gl_FragCoord.xy;
                    float x = px.x;
                    float y = px.y;
                    
                    // Stereogram Traceback Algorithm (GPU Ray-casting)
                    // Walks leftwards, accumulating shifts based on the depth map.
                    // This links the current pixel to its master color in the 0..patternWidth strip.
                    for(int i = 0; i < 50; i++) {
                        if (x < u_patternWidth) break;
                        
                        // Sample depth at the current traced coordinate
                        vec2 sampleUv = vec2(x, y) / u_resolution;
                        float d = texture(u_depthMap, sampleUv).r;
                        
                        // Shift calculation: Closer objects (higher d) repeat closer together
                        float shift = u_patternWidth - d * u_amplitude;
                        x -= shift;
                    }
                    
                    // Wrap the coordinate to safely sample the base carrier strip
                    x = mod(x, u_patternWidth);
                    
                    vec3 color = getCarrier(vec2(x, y));
                    
                    // Magic Eye Alignment Dots (Aids the viewer in fusing the stereogram)
                    vec2 center = u_resolution * 0.5;
                    float dotY = u_resolution.y * 0.06;
                    float d1 = length(px - vec2(center.x - u_patternWidth * 0.5, dotY));
                    float d2 = length(px - vec2(center.x + u_patternWidth * 0.5, dotY));
                    
                    if (min(d1, d2) < 6.0) {
                        color = vec3(1.0); // White inner dot
                    } else if (min(d1, d2) < 9.0) {
                        color = vec3(0.0); // Black outline
                    }
                    
                    fragColor = vec4(color, 1.0);
                }
            `
        });

        const sceneDepth = new THREE.Scene();
        sceneDepth.add(new THREE.Mesh(geometry, depthMaterial));

        const sceneStereo = new THREE.Scene();
        sceneStereo.add(new THREE.Mesh(geometry, stereoMaterial));

        canvas.__three = { 
            renderer, 
            sceneDepth, 
            sceneStereo, 
            camera, 
            depthMaterial, 
            stereoMaterial, 
            depthTarget 
        };

    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        return;
    }
}

const { renderer, sceneDepth, sceneStereo, camera, depthMaterial, stereoMaterial, depthTarget } = canvas.__three;

const w = grid.width;
const h = grid.height;

renderer.setSize(w, h, false);

if (depthTarget.width !== w || depthTarget.height !== h) {
    depthTarget.setSize(w, h);
}

// Update Uniforms
if (depthMaterial?.uniforms?.u_time) {
    depthMaterial.uniforms.u_time.value = time;
    depthMaterial.uniforms.u_resolution.value.set(w, h);
}

if (stereoMaterial?.uniforms?.u_time) {
    stereoMaterial.uniforms.u_time.value = time;
    stereoMaterial.uniforms.u_resolution.value.set(w, h);
    
    // Calculate responsive pattern width and amplitude
    // Pattern width typically works best around 100-150 pixels for most screens
    const patternWidth = Math.max(120.0, w / 14.0);
    stereoMaterial.uniforms.u_patternWidth.value = patternWidth;
    stereoMaterial.uniforms.u_amplitude.value = patternWidth * 0.35; // 35% depth extrusion
}

// Pass 1: Render the hidden impossible machine geometry to the depth map
renderer.setRenderTarget(depthTarget);
renderer.clear();
renderer.render(sceneDepth, camera);

// Pass 2: Render the stereoscopic carrier texture using the depth map
renderer.setRenderTarget(null);
renderer.clear();
renderer.render(sceneStereo, camera);