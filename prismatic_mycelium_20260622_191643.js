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
                u_aspect: { value: grid.width / grid.height }
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
                uniform float u_aspect;
                
                // Dave_Hoskins hash functions
                vec3 hash33(vec3 p3) {
                    p3 = fract(p3 * vec3(.1031, .1030, .0973));
                    p3 += dot(p3, p3.yxz+33.33);
                    return fract((p3.xxy + p3.yxx)*p3.zyx);
                }
                
                float hash13(vec3 p3) {
                    p3  = fract(p3 * .1031);
                    p3 += dot(p3, p3.zyx + 31.32);
                    return fract((p3.x + p3.y) * p3.z);
                }
                
                // Main SDF Mapping
                vec2 map(vec3 p) {
                    // WFC Cell logic (macro grid)
                    vec3 id = floor(p * 0.5);
                    vec3 local = fract(p * 0.5) - 0.5;
                    
                    float h = hash13(id);
                    
                    // Gyroid Orientation per cell
                    vec3 gp = p;
                    if (h < 0.2) gp.xy = vec2(gp.y, -gp.x);
                    else if (h < 0.4) gp.yz = vec2(gp.z, -gp.y);
                    else if (h < 0.6) gp.zx = vec2(gp.x, -gp.z);
                    
                    // Gyroid Lattice
                    float g = dot(sin(gp * 3.0), cos(gp.zxy * 3.0));
                    float thick = mix(0.02, 0.15, fract(h * 42.1));
                    float d_gyroid = (abs(g) - thick) / 3.0;
                    
                    // WFC Box boundaries (creates faceted panes / modular panels)
                    float d_box = max(abs(local.x), max(abs(local.y), abs(local.z))) - 0.48;
                    d_gyroid = max(d_gyroid, d_box);
                    
                    // Mycelium Network (growing through the lattice)
                    vec3 q = p * 2.0;
                    // Domain warping to create organic branching
                    q += 0.4 * sin(q.zxy * 2.5 + u_time * 1.5);
                    vec3 fq = fract(q) - 0.5;
                    float d_myc = min(length(fq.xy), min(length(fq.yz), length(fq.zx))) - 0.025;
                    d_myc /= 2.0;
                    
                    float d = min(d_gyroid, d_myc);
                    float mat = (d == d_myc) ? 2.0 : 1.0;
                    
                    return vec2(d, mat);
                }
                
                // Normal Calculation
                vec3 calcNormal(vec3 p) {
                    vec2 e = vec2(0.002, 0.0);
                    return normalize(vec3(
                        map(p + e.xyy).x - map(p - e.xyy).x,
                        map(p + e.yxy).x - map(p - e.yxy).x,
                        map(p + e.yyx).x - map(p - e.yyx).x
                    ));
                }
                
                // Birefringence / Interference Colors
                vec3 birefringence(float retardance) {
                    vec3 a = vec3(0.5, 0.5, 0.5);
                    vec3 b = vec3(0.5, 0.5, 0.5);
                    vec3 c = vec3(1.5, 1.0, 2.0);
                    vec3 d = vec3(0.0, 0.33, 0.67);
                    vec3 col = a + b * cos(6.28318 * (c * retardance + d));
                    return smoothstep(0.1, 0.9, col);
                }
                
                // Raymarching & Shading
                vec3 render(vec3 ro, vec3 rd) {
                    float t = 0.0;
                    float m = -1.0;
                    vec3 p;
                    
                    for(int i = 0; i < 70; i++) {
                        p = ro + rd * t;
                        vec2 res = map(p);
                        if(res.x < 0.002) {
                            m = res.y;
                            break;
                        }
                        if(t > 20.0) break;
                        t += res.x * 0.8;
                    }
                    
                    vec3 col = vec3(0.02, 0.0, 0.05); // Deep violet void
                    
                    if(m > 0.0) {
                        vec3 n = calcNormal(p);
                        vec3 v = -rd;
                        float fresnel = pow(clamp(1.0 - dot(n, v), 0.0, 1.0), 3.0);
                        
                        if(m == 1.0) {
                            // Glass Gyroid Material
                            float thickness = mix(1.0, 5.0, hash13(floor(p * 0.5)));
                            float retardance = fresnel * thickness * 3.0 + u_time * 0.2;
                            vec3 interference = birefringence(retardance);
                            
                            // Chromadepth (Warm near, Cool far)
                            float depthNorm = clamp(t / 15.0, 0.0, 1.0);
                            vec3 chroma = mix(vec3(1.0, 0.1, 0.5), vec3(0.0, 0.5, 1.0), depthNorm);
                            
                            col = mix(interference * 1.5, chroma, 0.4);
                            col += fresnel * vec3(1.0, 0.9, 1.0);
                            
                            // Faceted WFC cell edges
                            vec3 local = fract(p * 0.5) - 0.5;
                            float edgeDist = max(abs(local.x), max(abs(local.y), abs(local.z)));
                            float edge = smoothstep(0.46, 0.48, edgeDist);
                            col += edge * vec3(0.0, 1.0, 0.8) * 1.5;
                            
                            // Voronoi inner cracks
                            vec3 vp = p * 2.0;
                            vec3 vid = floor(vp);
                            vec3 vlocal = fract(vp);
                            float md1 = 10.0;
                            float md2 = 10.0;
                            for(int x=-1; x<=1; x++)
                            for(int y=-1; y<=1; y++)
                            for(int z=-1; z<=1; z++) {
                                vec3 off = vec3(float(x), float(y), float(z));
                                vec3 h3 = hash33(vid + off);
                                float d = length(vlocal - off - h3);
                                if(d < md1) {
                                    md2 = md1;
                                    md1 = d;
                                } else if(d < md2) {
                                    md2 = d;
                                }
                            }
                            float cracks = smoothstep(0.05, 0.0, md2 - md1);
                            col += cracks * vec3(1.0, 0.2, 0.8) * 1.2;
                            
                        } else if(m == 2.0) {
                            // Mycelial Network Material
                            float pulse = 0.5 + 0.5 * sin(p.x * 8.0 + p.y * 8.0 + p.z * 8.0 - u_time * 4.0);
                            vec3 mycCol = mix(vec3(1.0, 0.0, 0.8), vec3(0.5, 1.0, 0.0), pulse); // Hot pink to acid green
                            col = mycCol * (1.2 + 1.5 * pulse);
                            col += fresnel * vec3(1.0);
                        }
                    }
                    
                    // Depth Fog
                    col = mix(col, vec3(0.02, 0.0, 0.05), 1.0 - exp(-0.08 * t));
                    return col;
                }
                
                void main() {
                    vec2 uv = vUv * 2.0 - 1.0;
                    uv.x *= u_aspect;
                    
                    // VHS Wobble
                    float wobble = sin(uv.y * 20.0 + u_time * 15.0) * 0.003;
                    wobble += sin(uv.y * 5.0 - u_time * 5.0) * 0.005;
                    uv.x += wobble;
                    
                    // Datamosh Block Smear
                    float moshTime = floor(u_time * 8.0) / 8.0;
                    vec2 blockUV = floor(vUv * 24.0) / 24.0;
                    float moshRand = fract(sin(dot(blockUV + moshTime, vec2(12.9898, 78.233))) * 43758.5453);
                    
                    if (moshRand > 0.85) {
                        uv += (vec2(fract(moshRand * 13.37), fract(moshRand * 42.11)) - 0.5) * 0.15;
                    }
                    
                    // Signal Tearing
                    float tear = step(0.98, fract(sin(uv.y * 50.0 + u_time) * 4375.54));
                    uv.x += tear * 0.05 * sin(u_time * 20.0);
                    
                    // Camera Setup
                    vec3 ro = vec3(u_time * 0.4, 0.0, u_time * 0.4);
                    vec3 ta = ro + vec3(1.0, 0.3 * sin(u_time * 0.5), 1.0);
                    vec3 forward = normalize(ta - ro);
                    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
                    vec3 up = cross(forward, right);
                    vec3 rd = normalize(forward + uv.x * right + uv.y * up);
                    
                    vec3 col = render(ro, rd);
                    
                    // Datamosh Color Bleed
                    if (moshRand > 0.92) {
                        col.rgb = col.brg * 1.5;
                    }
                    
                    // VHS Scanlines
                    col -= sin(gl_FragCoord.y * 2.0) * 0.05;
                    
                    // CRT Vignette
                    float vig = length(vUv - 0.5);
                    col *= smoothstep(0.8, 0.2, vig);
                    
                    fragColor = vec4(col, 1.0);
                }
            `
        });
        
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);
        
        canvas.__three = { renderer, scene, camera, material };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        return;
    }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms) {
    if (material.uniforms.u_time) material.uniforms.u_time.value = time;
    if (material.uniforms.u_aspect) material.uniforms.u_aspect.value = grid.width / grid.height;
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);