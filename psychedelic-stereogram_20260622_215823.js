if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, grid.width / grid.height, 0.1, 1000);
        camera.position.z = 5;
        
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
                in vec2 vUv;
                out vec4 fragColor;
                uniform float u_time;
                uniform vec2 u_resolution;
                
                #define TWO_PI 6.28318530718
                
                mat2 rot(float a) {
                    float s = sin(a), c = cos(a);
                    return mat2(c, -s, s, c);
                }
                
                float sdTorus(vec3 p, vec2 t) {
                    vec2 q = vec2(length(p.xz) - t.x, p.y);
                    return length(q) - t.y;
                }
                
                float map(vec3 p) {
                    p.xy *= rot(u_time * 0.3);
                    p.xz *= rot(u_time * 0.2);
                    
                    // Klein-bottle / Torus knot hybrid
                    float d1 = sdTorus(p, vec2(0.4, 0.12));
                    vec3 p2 = p;
                    p2.yz *= rot(1.5708);
                    p2.xy *= rot(0.7853);
                    float d2 = sdTorus(p2, vec2(0.4, 0.12));
                    
                    float d = min(d1, d2);
                    
                    // subtract inner core to make it an impossible shell
                    d = max(d, -(length(p) - 0.28));
                    
                    // Add SDF Metaballs
                    float d3 = length(p - vec3(sin(u_time)*0.3, cos(u_time*1.2)*0.3, sin(u_time*0.7)*0.3)) - 0.15;
                    float k = 0.15;
                    float h = clamp(0.5 + 0.5 * (d - d3) / k, 0.0, 1.0);
                    d = mix(d, d3, h) - k * h * (1.0 - h);
                    
                    // Add gyroid displacement for impossible topology texture
                    float gyroid = dot(sin(p * 14.0), cos(p.zxy * 14.0)) * 0.025;
                    return d + gyroid;
                }
                
                float fbmTerrain(vec2 p) {
                    float f = 0.0;
                    float a = 0.5;
                    for(int i = 0; i < 4; i++) {
                        f += a * sin(p.x + sin(p.y));
                        p = mat2(0.8, -0.6, 0.6, 0.8) * p * 2.0;
                        a *= 0.5;
                    }
                    return f;
                }
                
                float getDepth(vec2 uv) {
                    vec3 ro = vec3(uv * 2.0 - 1.0, 1.0);
                    ro.x *= u_resolution.x / u_resolution.y;
                    vec3 rd = vec3(0.0, 0.0, -1.0);
                    
                    float t = 0.0;
                    float z = 0.0;
                    for(int i = 0; i < 50; i++) {
                        vec3 p = ro + rd * t;
                        float d = map(p);
                        if(d < 0.002) {
                            z = clamp(1.0 - (t - 0.5), 0.0, 1.0);
                            break;
                        }
                        t += d;
                        if(t > 2.0) break;
                    }
                    
                    // Background noise terrain
                    if(z == 0.0) {
                        float n = fbmTerrain(uv * 8.0 + u_time * 0.2);
                        z = 0.15 + n * 0.1;
                    }
                    
                    // Falloff dome to prevent edge tearing and force fusion focus
                    float dome = 1.0 - length(uv * 2.0 - 1.0);
                    z *= smoothstep(0.0, 0.4, dome);
                    
                    return z;
                }
                
                vec3 pattern(vec2 tile_uv, vec2 screen_uv) {
                    // tile_uv mapped to a cylinder to wrap seamlessly in X
                    float angle = tile_uv.x * TWO_PI;
                    vec3 p = vec3(cos(angle), sin(angle), tile_uv.y * 3.0 - u_time * 0.15);
                    
                    vec3 q = p * 2.0;
                    float f = 0.0;
                    float amp = 0.5;
                    for(int i = 0; i < 5; i++) {
                        q = q * 1.6 + sin(q.yzx * 2.2 + u_time * 0.3);
                        f += length(sin(q)) * amp;
                        amp *= 0.5;
                    }
                    
                    // Acid neon palette
                    vec3 col1 = vec3(1.0, 0.0, 0.43); // Hot pink
                    vec3 col2 = vec3(0.0, 1.0, 0.8);  // Toxic lime/cyan
                    vec3 col3 = vec3(1.0, 0.74, 0.04); // Molten tangerine
                    vec3 col4 = vec3(0.4, 0.0, 1.0);  // Ultraviolet
                    
                    float mix1 = sin(f * 12.0) * 0.5 + 0.5;
                    float mix2 = cos(f * 9.0 + p.z * 4.0) * 0.5 + 0.5;
                    vec3 c = mix(mix(col1, col2, mix1), mix(col3, col4, mix2), sin(f * 5.0) * 0.5 + 0.5);
                    
                    // Op-art moiré lines / prismatic boro-glass
                    float lines = sin(f * 60.0);
                    c *= smoothstep(-0.3, 0.3, lines) * 0.4 + 0.6;
                    
                    // Holographic glitter interference
                    vec2 gpos = floor(p.xy * 80.0);
                    float glitter = fract(sin(dot(gpos, vec2(12.9898, 78.233))) * 43758.5453);
                    if(glitter > 0.92) {
                        c += vec3(0.8, 1.0, 0.9) * (glitter - 0.92) * 12.0;
                    }
                    
                    // Weird glyph-noise / tiny fractal symbols
                    vec2 glyph_uv = fract(tile_uv * 14.0);
                    vec2 glyph_id = floor(tile_uv * 14.0);
                    float glyph_hash = fract(sin(dot(glyph_id, vec2(17.1, 31.7))) * 43758.5453);
                    if(glyph_hash > 0.8) {
                        float d = length(abs(glyph_uv - 0.5) - 0.15 * glyph_hash);
                        float ring = smoothstep(0.04, 0.0, abs(d - 0.1));
                        c = mix(c, vec3(0.0, 1.0, 0.9), ring);
                    }
                    
                    return pow(c, vec3(0.85)); // Candy enamel pop
                }
                
                void main() {
                    // Pattern period roughly matching eye separation
                    float E = clamp(u_resolution.x * 0.12, 80.0, 160.0);
                    float mu = 0.4;
                    
                    float x = gl_FragCoord.x;
                    float y = gl_FragCoord.y;
                    float u = x;
                    
                    // Stereogram per-pixel depth shift march
                    for(int i = 0; i < 80; i++) {
                        if(u < E) break;
                        vec2 sample_uv = vec2(u, y) / u_resolution;
                        float z = getDepth(sample_uv);
                        float sep = E * (1.0 - mu * z) / (2.0 - mu * z);
                        u -= sep;
                    }
                    
                    vec2 tile_uv = vec2(u / E, y / u_resolution.y);
                    vec3 color = pattern(tile_uv, gl_FragCoord.xy / u_resolution);
                    
                    // Convergence dots (wall-eyed fusion aids)
                    vec2 center = u_resolution * 0.5;
                    vec2 dot1 = vec2(center.x - E * 0.5, u_resolution.y * 0.92);
                    vec2 dot2 = vec2(center.x + E * 0.5, u_resolution.y * 0.92);
                    float d1 = length(gl_FragCoord.xy - dot1);
                    float d2 = length(gl_FragCoord.xy - dot2);
                    
                    if(d1 < 10.0 || d2 < 10.0) {
                        color = mix(color, vec3(0.05), 0.9); // Dark outline
                        if(d1 < 4.0 || d2 < 4.0) color = vec3(0.95); // Bright core
                    }
                    
                    fragColor = vec4(color, 1.0);
                }
            `
        });
        
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);
        canvas.__three = { renderer, scene, camera, material };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
    }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms && material.uniforms.u_time) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);