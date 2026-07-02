function(ctx, grid, time, repos, input, mouse, canvas, THREE) {
    if (!canvas.__three) {
        try {
            if (!ctx) throw new Error("WebGL 2 context not available");
            
            const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
            const scene = new THREE.Scene();
            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
            camera.position.z = 1;
            
            const vertexShader = `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `;
            
            const fragmentShader = `
                precision highp float;
                
                in vec2 vUv;
                out vec4 fragColor;
                
                uniform float u_time;
                uniform vec2 u_resolution;
                uniform vec2 u_mouse;
                
                #define PI 3.14159265359
                #define TAU 6.28318530718
                
                // HASH & NOISE (Damage Aesthetics / Procedural)
                float hash12(vec2 p) {
                    vec3 p3  = fract(vec3(p.xyx) * .1031);
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.x + p3.y) * p3.z);
                }
                
                float vnoise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    vec2 u = f*f*(3.0-2.0*f);
                    return mix(mix(hash12(i + vec2(0.0,0.0)), hash12(i + vec2(1.0,0.0)), u.x),
                               mix(hash12(i + vec2(0.0,1.0)), hash12(i + vec2(1.0,1.0)), u.x), u.y);
                }
                
                float fbm(vec2 p) {
                    float f = 0.0;
                    float amp = 0.5;
                    mat2 m = mat2(0.8, -0.6, 0.6, 0.8);
                    for(int i = 0; i < 5; i++) {
                        f += amp * vnoise(p);
                        p = m * p * 2.03;
                        amp *= 0.5;
                    }
                    return f;
                }
                
                // SPACE TRANSFORMS (Phosphene Field & Kaleidoscope Engine)
                vec2 toLogPolar(vec2 p) {
                    float r = max(length(p), 1e-6);
                    float a = atan(p.y, p.x);
                    return vec2(log(r), a);
                }
                
                vec2 kaleidoscope(vec2 p, float sectors) {
                    float a = atan(p.y, p.x);
                    float r = length(p);
                    float sector = TAU / sectors;
                    a = mod(a, sector);
                    a = abs(a - sector/2.0);
                    return r * vec2(cos(a), sin(a));
                }
                
                // SYMBOLIC MATRICES (I-Ching Fields)
                float hexagram(vec2 p, float seed) {
                    vec2 grid = floor(p);
                    vec2 local = fract(p);
                    if (local.x < 0.25 || local.x > 0.75 || local.y < 0.1 || local.y > 0.9) return 0.0;
                    
                    float lineIdx = floor((local.y - 0.1) / 0.8 * 6.0);
                    float lineLocalY = fract((local.y - 0.1) / 0.8 * 6.0);
                    if (lineLocalY < 0.2 || lineLocalY > 0.8) return 0.0;
                    
                    float bit = mod(floor(hash12(grid + seed) * 64.0 / exp2(lineIdx)), 2.0);
                    float gap = step(0.45, local.x) * step(local.x, 0.55);
                    float broken = (1.0 - bit) * gap;
                    
                    return 1.0 - broken;
                }
                
                // CANDY-ACID PALETTE (Psychedelic Collage / Glitchcore Style)
                vec3 acidPalette(float t) {
                    vec3 a = vec3(0.5, 0.5, 0.5);
                    vec3 b = vec3(0.5, 0.5, 0.5);
                    vec3 c = vec3(1.0, 1.0, 1.0);
                    vec3 d = vec3(0.0, 0.33, 0.67);
                    vec3 col = a + b * cos(TAU * (c * t + d));
                    
                    // Hyperpop neon injections
                    col = mix(col, vec3(1.0, 0.0, 0.4), smoothstep(0.7, 1.0, sin(TAU * t)));
                    col = mix(col, vec3(0.0, 1.0, 0.8), smoothstep(0.7, 1.0, sin(TAU * t + 2.0)));
                    col = mix(col, vec3(0.8, 1.0, 0.0), smoothstep(0.7, 1.0, sin(TAU * t + 4.0)));
                    return col;
                }
                
                // COMPUTATIONAL SOUP FIELD (Abelian Sandpile / Op Art)
                float computeField(vec2 p, float t) {
                    float f = fbm(p * 2.0 + t * 0.2);
                    // Sandpile-like quantized terraces
                    float terraces = floor(f * 6.0) / 6.0;
                    // Moiré interference
                    float moire = sin(p.x * 40.0) * sin(p.y * 40.0) * 0.05;
                    return terraces + moire + fbm(p * 10.0) * 0.1;
                }
                
                // NORMAL MAPPING FOR TACTILITY
                vec3 getNormal(vec2 p, float t) {
                    vec2 e = vec2(0.01, 0.0);
                    float d = computeField(p, t);
                    float dx = computeField(p + e.xy, t) - d;
                    float dy = computeField(p + e.yx, t) - d;
                    return normalize(vec3(dx, dy, 0.03));
                }
                
                void main() {
                    vec2 uv = (vUv - 0.5) * 2.0;
                    uv.x *= u_resolution.x / u_resolution.y;
                    float t = u_time * 0.2;
                    
                    // Interaction
                    vec2 m = (u_mouse - 0.5) * 2.0;
                    m.x *= u_resolution.x / u_resolution.y;
                    
                    // Macro Domain Warp
                    vec2 warp = vec2(fbm(uv * 1.5 + t), fbm(uv * 1.5 - t));
                    vec2 p = uv + warp * 0.2 - m * 0.1;
                    
                    // Kaleidoscope & Log-Polar Tunnel
                    float sectors = 6.0 + 2.0 * sin(t * 0.5);
                    p = kaleidoscope(p, sectors);
                    vec2 lp = toLogPolar(p);
                    lp.x += t * 2.0;
                    lp.y += sin(t) * 0.5;
                    
                    // Normals & Lighting (Diamond Fire / Dispersive Caustics)
                    vec3 nor = getNormal(lp, t);
                    vec3 lightDir = normalize(vec3(sin(t), cos(t), 1.0));
                    float spec = pow(max(dot(reflect(-lightDir, nor), vec3(0.0, 0.0, 1.0)), 0.0), 32.0);
                    float diff = max(dot(nor, lightDir), 0.0);
                    
                    // I-Ching Overlays
                    float hex = hexagram(lp * vec2(3.0, 6.0) + vec2(t * 1.5, 0.0), floor(t * 2.0));
                    
                    // Chromatic Dispersion & Color Cycling (Prism Dispersion)
                    vec3 color = vec3(0.0);
                    for(int i = 0; i < 3; i++) {
                        float offset = float(i) * 0.015 * sin(t * 3.0);
                        vec2 sp = lp + vec2(offset, offset);
                        
                        float field = computeField(sp, t);
                        float index = field + hex * 0.15 + t * 0.5 + offset * 5.0;
                        
                        vec3 sampleCol = acidPalette(index);
                        
                        if(i == 0) color.r = sampleCol.r;
                        else if(i == 1) color.g = sampleCol.g;
                        else color.b = sampleCol.b;
                    }
                    
                    // Blend lighting (Afterimage / Bloom)
                    color = color * (0.5 + 0.5 * diff) + acidPalette(t + 0.5) * spec * 1.5;
                    
                    // Glitch & Damage (Compression Blocks / Channel Swap)
                    vec2 blockUV = floor(vUv * 20.0) / 20.0;
                    if (hash12(blockUV + floor(t * 15.0)) > 0.96) {
                        color = color.brg; // RGB channel swap
                        color += 0.2; // Flash
                    }
                    
                    // CRT Scanlines
                    color -= sin(vUv.y * u_resolution.y * 1.5) * 0.04;
                    
                    // Vignette
                    float vignette = 1.0 - smoothstep(0.4, 1.5, length(uv));
                    color *= vignette;
                    
                    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
                }
            `;
            
            const material = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_time: { value: 0 },
                    u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                    u_mouse: { value: new THREE.Vector2(0.5, 0.5) }
                },
                vertexShader,
                fragmentShader
            });
            
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
            scene.add(mesh);
            canvas.__three = { renderer, scene, camera, material };
        } catch (e) {
            console.error("WebGL Initialization Failed:", e);
            throw e;
        }
    }
    
    const { renderer, scene, camera, material } = canvas.__three;
    
    if (material && material.uniforms) {
        if (material.uniforms.u_time) {
            material.uniforms.u_time.value = time;
        }
        if (material.uniforms.u_resolution) {
            material.uniforms.u_resolution.value.set(grid.width, grid.height);
        }
        if (material.uniforms.u_mouse) {
            let targetX = mouse.x / grid.width;
            let targetY = 1.0 - mouse.y / grid.height;
            if (isNaN(targetX)) targetX = 0.5;
            if (isNaN(targetY)) targetY = 0.5;
            material.uniforms.u_mouse.value.x += (targetX - material.uniforms.u_mouse.value.x) * 0.1;
            material.uniforms.u_mouse.value.y += (targetY - material.uniforms.u_mouse.value.y) * 0.1;
        }
    }
    
    renderer.setSize(grid.width, grid.height, false);
    renderer.render(scene, camera);
}