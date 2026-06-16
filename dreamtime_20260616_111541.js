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

                // Hash function for pseudo-random deterministic placement
                float hash(vec2 p) {
                    vec3 p3  = fract(vec3(p.xyx) * .1031);
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.x + p3.y) * p3.z);
                }

                // SDF for line segments (Dreaming Tracks)
                float sdSegment(vec2 p, vec2 a, vec2 b) {
                    vec2 pa = p - a, ba = b - a;
                    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
                    return length(pa - ba * h);
                }

                // Peter de Jong Attractor displacement (Op Art / Dream Physics affective field)
                vec2 deJong(vec2 p, float t) {
                    float a = 1.4 + sin(t * 0.1) * 0.2;
                    float b = -2.3 + cos(t * 0.13) * 0.2;
                    float c = 2.4 + sin(t * 0.17) * 0.2;
                    float d = -2.1 + cos(t * 0.19) * 0.2;
                    return vec2(sin(a * p.y) - cos(b * p.x),
                                sin(c * p.x) - cos(d * p.y));
                }

                // Dynamic node placement (Waterholes)
                vec2 get_node(int i, float t, float aspect) {
                    float fi = float(i);
                    vec2 base = vec2(
                        (0.2 + 0.6 * hash(vec2(fi, 1.0))) * aspect,
                        0.2 + 0.6 * hash(vec2(fi, 2.0))
                    );
                    // Slow Lissajous orbit
                    vec2 orbit = vec2(
                        sin(t * (0.3 + fi * 0.1) + fi),
                        cos(t * (0.2 + fi * 0.15) + fi * 1.5)
                    ) * 0.1;
                    return base + orbit;
                }

                void main() {
                    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
                    float aspect = u_resolution.x / u_resolution.y;
                    vec2 p = uv;
                    p.x *= aspect;
                    
                    float t = u_time * 0.5;
                    
                    // Retinal Surrealism / Moiré Warp
                    vec2 warp = deJong(p * 3.0, t) * 0.04;
                    vec2 p_warped = p + warp;
                    
                    // Contemporary Acrylic Palette (OKLCh inspired saturation)
                    vec3 deep_red = vec3(0.545, 0.000, 0.000);
                    vec3 vivid_orange = vec3(1.000, 0.420, 0.208);
                    vec3 gold = vec3(1.000, 0.843, 0.000);
                    vec3 bone = vec3(0.961, 0.961, 0.863);
                    vec3 charcoal = vec3(0.110, 0.110, 0.110);
                    
                    // Ground: Earthy red with subtle grain and warp blending
                    float gn = hash(p * 100.0) * 0.05;
                    vec3 col = mix(deep_red * 0.8, vivid_orange * 0.5, length(warp) * 10.0 + gn);
                    
                    const int N_NODES = 8;
                    vec2 nodes[N_NODES];
                    for(int i = 0; i < N_NODES; i++) {
                        nodes[i] = get_node(i, t, aspect);
                    }
                    
                    // Dreaming Tracks
                    float d_track = 1e10;
                    float track_idx = 0.0;
                    
                    // Primary tracks (Minimum spanning tree-like)
                    for(int i = 0; i < N_NODES - 1; i++) {
                        vec2 a = nodes[i];
                        vec2 b = nodes[i+1];
                        vec2 dir = normalize(b - a);
                        vec2 perp = vec2(-dir.y, dir.x);
                        float tlen = length(b - a);
                        float proj = clamp(dot(p - a, dir) / max(tlen, 0.0001), 0.0, 1.0);
                        
                        // Sinusoidal meandering
                        float meander = sin(proj * 3.14159 * 3.0 + t * 4.0 + float(i)) * 0.025;
                        
                        float d = sdSegment(p - perp * meander, a, b);
                        if (d < d_track) {
                            d_track = d;
                            track_idx = float(i);
                        }
                    }
                    
                    // Secondary cross tracks
                    float d_cross = 1e10;
                    for(int i = 0; i < N_NODES - 2; i++) {
                        float d = sdSegment(p, nodes[i], nodes[i+2]);
                        d_cross = min(d_cross, d);
                    }
                    
                    float track_w = 0.012;
                    
                    // Render cross tracks
                    float cross_mask = smoothstep(track_w * 0.6, track_w * 0.3, d_cross);
                    col = mix(col, gold * 0.8, cross_mask * 0.5);
                    
                    // Render primary tracks
                    float track_mask = smoothstep(track_w, track_w * 0.7, d_track);
                    vec3 track_col = mix(gold, vivid_orange, mod(track_idx, 2.0));
                    col = mix(col, track_col, track_mask);
                    
                    // Track borders (Structural color iridescence)
                    float track_border = smoothstep(track_w * 1.8, track_w, d_track) - smoothstep(track_w, track_w * 0.7, d_track);
                    vec3 iridescence = 0.5 + 0.5 * cos(6.28318 * (d_track * 80.0 - t * 2.0 + vec3(0.0, 0.33, 0.67)));
                    col = mix(col, mix(charcoal, iridescence, 0.4), track_border);
                    
                    // Waterholes (Concentric Rings)
                    float ring_sp = 0.035;
                    float d_node = 1e10;
                    for(int i = 0; i < N_NODES; i++) {
                        float d = length(p - nodes[i]);
                        d_node = min(d_node, d);
                        
                        // Ring mask
                        float phase = d - t * 0.02;
                        float r = mod(phase, ring_sp);
                        float ring = smoothstep(0.01, 0.0, min(r, ring_sp - r)) * step(d, ring_sp * 4.5);
                        
                        int m = int(mod(floor(phase / ring_sp), 3.0));
                        vec3 rc = (m == 0) ? gold : (m == 1) ? bone : vivid_orange;
                        
                        // Pulsing core (Bindu / Cymatic focus)
                        float core = smoothstep(0.018, 0.01, d);
                        rc = mix(rc, bone, core * (0.5 + 0.5 * sin(t * 10.0 + float(i))));
                        
                        col = mix(col, rc, ring * step(d, ring_sp * 5.0));
                        col = mix(col, charcoal, core);
                    }
                    
                    // Dot Infill (Country)
                    float safe_zone = smoothstep(track_w * 2.5, track_w * 3.5, d_track) * smoothstep(ring_sp * 4.8, ring_sp * 5.5, d_node);
                    
                    if (safe_zone > 0.01) {
                        float dot_density = 75.0;
                        vec2 d_uv = p_warped * dot_density;
                        vec2 d_id = floor(d_uv);
                        vec2 d_f = fract(d_uv) - 0.5;
                        
                        // Hex packing offset
                        if (mod(d_id.y, 2.0) > 0.5) {
                            d_f.x = fract(d_uv.x + 0.5) - 0.5;
                            d_id.x = floor(d_uv.x + 0.5);
                        }
                        
                        float d_dist = length(d_f);
                        
                        // Cymatic / Lissajous modulation of dot size
                        float lissa = sin(3.0 * 3.14159 * p.x) * sin(2.0 * 3.14159 * p.y + t);
                        float h = hash(d_id);
                        float dot_size = 0.2 + 0.15 * lissa + 0.1 * h;
                        
                        float dot_mask = smoothstep(dot_size, dot_size - 0.06, d_dist) * step(0.1, h);
                        
                        vec3 dc = mix(bone, gold, h);
                        dc = mix(dc, vivid_orange, smoothstep(0.7, 1.0, h));
                        
                        // Shadow/depth for dots
                        float dot_shadow = smoothstep(dot_size + 0.1, dot_size - 0.05, d_dist) * step(0.1, h);
                        col = mix(col, charcoal * 0.5, dot_shadow * safe_zone * 0.5);
                        
                        col = mix(col, dc, dot_mask * safe_zone);
                    }
                    
                    // Op Art / Phase Field Vignette
                    float moire = sin(p.x * 150.0 + t) * sin(p.y * 150.0 - t);
                    float vignette = length(uv - 0.5);
                    col *= 1.0 - 0.1 * moire * smoothstep(0.3, 0.8, vignette);
                    col *= 1.0 - smoothstep(0.5, 1.2, vignette);
                    
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
    if (material.uniforms.u_resolution) {
        material.uniforms.u_resolution.value.set(grid.width, grid.height);
    }
}
renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);