if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, grid.width / grid.height, 0.1, 1000);
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
            
            #define PI 3.14159265359
            
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
            }
            
            vec2 glitchUV(vec2 p, float t) {
                vec2 gp = p;
                
                // Macroblocking / Candy Crash Compression
                vec2 grid = floor(p * 12.0);
                float blockNoise = hash(grid + floor(t * 6.0));
                if (blockNoise > 0.9) {
                    gp.x += 0.1 * sin(t * 10.0 + grid.y);
                    gp.y += 0.05 * cos(t * 8.0 + grid.x);
                }
                
                // Scanline tear / Horizontal tracking error
                float tear = fract(p.y * 15.0 + t * 2.0);
                if (tear > 0.92) {
                    gp.x += 0.08 * hash(vec2(p.y, floor(t * 10.0)));
                }
                
                return gp;
            }
            
            vec3 getScene(vec2 uv, float t) {
                vec3 col = vec3(0.0);
                
                // 1. Moiré / Checkerboard Background (Optical Illusion)
                vec2 lp = vec2(log(length(uv) + 0.001), atan(uv.y, uv.x));
                float spiral = sin(lp.x * 15.0 - t * 5.0 + lp.y * 4.0);
                float checker = mod(floor(lp.x * 10.0 - t * 2.0) + floor(lp.y * 10.0 / PI), 2.0);
                
                // Cosine Palette Neon (from color_fields)
                vec3 a = vec3(0.5);
                vec3 b = vec3(0.5, 0.5, 0.33);
                vec3 c = vec3(2.0, 1.0, 1.0);
                vec3 d = vec3(0.5, 0.2, 0.25);
                col = a + b * cos(6.2831853 * (c * (checker * 0.2 + spiral * 0.3 + t * 0.1) + d));
                
                // 2. UI Window / Text Debris 1 (Early Internet / Dead Web Nostalgia)
                vec2 winPos = uv - vec2(0.3 * sin(t * 0.8), 0.2 * cos(t * 0.5));
                vec2 winBox = abs(winPos) - vec2(0.4, 0.25);
                float winD = length(max(winBox, 0.0)) + min(max(winBox.x, winBox.y), 0.0);
                if (winD < 0.0) {
                    col = vec3(0.75); // Win95 gray
                    if (winPos.y > 0.15) {
                        col = vec3(0.0, 0.0, 0.6); // Title bar
                    } else {
                        // Text lines / Corrupted HTML marquee
                        vec2 textGrid = floor(winPos * vec2(30.0, 20.0));
                        if (hash(textGrid + floor(t * 2.0)) > 0.5 && fract(winPos.y * 20.0) > 0.4) {
                            col = vec3(0.0);
                        }
                    }
                    if (winPos.x > 0.3 && winPos.y > 0.17) col = vec3(0.8, 0.2, 0.2); // Close button
                    if (abs(winD) < 0.01 || (winPos.y > 0.14 && winPos.y < 0.15)) col *= 0.5; // Inner shadow/bevel
                }
                
                // 3. UI Window / Text Debris 2
                vec2 winPos2 = uv - vec2(-0.4 * cos(t * 0.6), -0.3 * sin(t * 0.9));
                vec2 winBox2 = abs(winPos2) - vec2(0.3, 0.2);
                float winD2 = length(max(winBox2, 0.0)) + min(max(winBox2.x, winBox2.y), 0.0);
                if (winD2 < 0.0) {
                    col = vec3(0.8);
                    if (winPos2.y > 0.1) {
                        col = vec3(0.6, 0.0, 0.4); // Magenta title bar
                    } else {
                        if (length(winPos2 - vec2(-0.15, 0.0)) < 0.05) col = vec3(0.9, 0.8, 0.1); // Warning icon
                        vec2 textGrid = floor(winPos2 * vec2(25.0, 15.0));
                        if (winPos2.x > -0.05 && hash(textGrid + floor(t * 3.0)) > 0.6 && fract(winPos2.y * 15.0) > 0.4) {
                            col = vec3(0.1);
                        }
                    }
                    if (winPos2.x > 0.2 && winPos2.y > 0.12) col = vec3(0.8, 0.2, 0.2);
                    if (abs(winD2) < 0.01) col *= 0.5;
                }
                
                // 4. Floating Stickers / Blinkies (MySpace Profile Bling)
                float starDist = 1.0;
                vec3 stickerCol = vec3(0.0);
                for (int i = 0; i < 8; i++) {
                    float fi = float(i);
                    vec2 pos = vec2(
                        sin(t * 0.3 + fi * 2.1) * 1.5,
                        cos(t * 0.4 + fi * 1.3) * 1.0
                    );
                    vec2 sp = uv - pos;
                    
                    float a = t * 0.5 + fi;
                    float s = sin(a), c = cos(a);
                    sp = mat2(c, -s, s, c) * sp;
                    
                    float r = length(sp);
                    float angle = atan(sp.y, sp.x);
                    
                    float d = 1.0;
                    if (mod(fi, 3.0) == 0.0) {
                        d = r - (0.15 + 0.05 * cos(angle * 5.0)); // 5 point star
                    } else if (mod(fi, 3.0) == 1.0) {
                        d = r - (0.12 + 0.08 * cos(angle * 8.0)); // 8 point burst
                    } else {
                        // Pseudo-heart
                        vec2 hp = sp;
                        hp.y -= 0.05;
                        hp.x = abs(hp.x);
                        d = length(hp - vec2(0.0, max(hp.x, 0.0))) - 0.1;
                    }
                    
                    if (d < 0.0) {
                        // Faux Plastic / Gem / Chrome
                        float bevel = smoothstep(-0.03, 0.0, d);
                        vec3 sc = mix(vec3(0.0, 1.0, 1.0), vec3(1.0, 0.0, 0.8), fract(fi * 0.33));
                        stickerCol = sc * (0.6 + 0.4 * bevel) + vec3(1.0) * pow(1.0 - abs(d + 0.01) * 20.0, 4.0); // Chrome shine
                        starDist = d;
                    }
                    // Layer drop shadow
                    if (d > 0.0 && d < 0.05 && starDist > 0.0) {
                        col *= smoothstep(0.0, 0.05, d); 
                    }
                }
                if (starDist < 0.0) col = stickerCol;
                
                // 5. Glitter / Noise Veil (Glitter Graphics)
                float glitHash = hash(uv * 200.0 + t);
                float glit = step(0.95, glitHash);
                float luma = dot(col, vec3(0.299, 0.587, 0.114));
                
                // Glitter only appears on bright areas or on stickers (Cheap Luxury Logic)
                if (luma > 0.6 || starDist < 0.0) {
                    vec3 glitColor = mix(vec3(1.0), vec3(1.0, 0.5, 0.8), fract(glitHash * 10.0));
                    col += glit * glitColor * (0.5 + 0.5 * sin(t * 15.0 + uv.y * 50.0));
                }
                
                return col;
            }
            
            void main() {
                vec2 uv = vUv;
                vec2 p = (uv - 0.5) * 2.0;
                p.x *= u_resolution.x / u_resolution.y;
                
                float t = u_time;
                
                // Channel Split / RGB Phantom
                vec2 gUV = glitchUV(p, t);
                vec2 gUVR = glitchUV(p + vec2(0.02, 0.0) * sin(t * 3.0), t);
                vec2 gUVB = glitchUV(p - vec2(0.02, 0.0) * cos(t * 2.0), t);
                
                vec3 col;
                col.r = getScene(gUVR, t).r;
                col.g = getScene(gUV, t).g;
                col.b = getScene(gUVB, t).b;
                
                // CRT Contour / Phosphor Bloom / Scanlines
                col *= 0.8 + 0.2 * sin(uv.y * u_resolution.y * PI);
                
                // Vignette / Decay
                col *= smoothstep(1.5, 0.2, length(p));
                
                fragColor = vec4(col, 1.0);
            }
        `;
        
        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            vertexShader,
            fragmentShader,
            depthWrite: false,
            depthTest: false
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

if (material && material.uniforms && material.uniforms.u_time) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
}

camera.aspect = grid.width / grid.height;
camera.updateProjectionMatrix();

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);