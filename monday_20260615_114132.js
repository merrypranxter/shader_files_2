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
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;

                uniform float u_time;
                uniform vec2 u_resolution;

                #define PI 3.14159265359
                #define TAU 6.28318530718

                // ==========================================
                // MATHEMATICAL SUBSTRATE (Domain 16 / Higher Math)
                // ==========================================
                
                vec2 cMul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
                vec2 cDiv(vec2 a, vec2 b) { float d = dot(b,b); return vec2(a.x*b.x + a.y*b.y, a.y*b.x - a.x*b.y) / d; }

                vec2 mobius(vec2 z, vec2 a, vec2 b, vec2 c, vec2 d) {
                    return cDiv(cMul(a, z) + b, cMul(c, z) + d);
                }

                // ==========================================
                // COLOR ALCHEMY (OKLab / Perceptual Space)
                // ==========================================

                vec3 OKLab_to_linearSRGB(vec3 c) {
                    float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
                    float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
                    float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;

                    float l = l_ * l_ * l_;
                    float m = m_ * m_ * m_;
                    float s = s_ * s_ * s_;

                    return vec3(
                         4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                    );
                }

                float linear_to_sRGB(float x) {
                    return x <= 0.0031308 ? x * 12.92 : 1.055 * pow(max(x, 0.0), 1.0/2.4) - 0.055;
                }

                vec3 OKLab_to_sRGB(vec3 c) {
                    vec3 lin = OKLab_to_linearSRGB(c);
                    return vec3(linear_to_sRGB(lin.r), linear_to_sRGB(lin.g), linear_to_sRGB(lin.b));
                }

                vec3 OKLCh_to_OKLab(vec3 lch) {
                    return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
                }

                // ==========================================
                // FERAL NOISE (Outsider Art / Glitch Prophet)
                // ==========================================

                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    vec2 u = f*f*(3.0-2.0*f);
                    return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                               mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
                }

                float fbm(vec2 p) {
                    float f = 0.0;
                    float a = 0.5;
                    mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
                    for(int i=0; i<6; i++) {
                        f += a * noise(p);
                        p = rot * p * 2.0;
                        a *= 0.5;
                    }
                    return f;
                }

                vec2 wobble(vec2 p) {
                    float wx = noise(p * 15.0) - 0.5;
                    float wy = noise(p * 15.0 + 42.0) - 0.5;
                    return p + vec2(wx, wy) * 0.08;
                }

                // ==========================================
                // STRUCTURAL COLOR (Thin-Film Interference)
                // ==========================================
                
                vec3 thinFilmInterference(float thickness) {
                    // Physics: 2 * n * d * cos(theta) = m * lambda
                    vec3 phase = vec3(0.0, 0.333, 0.666);
                    vec3 freq = vec3(1.0/650.0, 1.0/530.0, 1.0/450.0) * 3.0; 
                    return 0.5 + 0.5 * cos(TAU * (thickness * freq + phase));
                }

                // ==========================================
                // WET ENGINE (Rainblown Anisotropic Field)
                // ==========================================

                vec2 rainWarp(vec2 p, float t) {
                    vec2 wind = vec2(-0.8, -1.2) * t * 0.3;
                    vec2 q = vec2(fbm(p + wind), fbm(p + vec2(5.2, 1.3) + wind));
                    vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) - wind * 1.5),
                                  fbm(p + 4.0 * q + vec2(8.3, 2.8) - wind * 1.5));
                    return p + 2.0 * r;
                }

                // ==========================================
                // GEMATRIA RESONANCE (Sacred Frequencies)
                // ==========================================

                float gematriaField(vec2 p) {
                    float f_YHWH = 26.0 / 15.0;
                    float f_ELOHIM = 86.0 / 30.0;
                    float f_LOGOS = 373.0 / 100.0;
                    
                    float w1 = cos(TAU * f_YHWH * length(p));
                    float w2 = cos(TAU * f_ELOHIM * length(p - vec2(0.5)));
                    float w3 = cos(TAU * f_LOGOS * (p.x * 0.866 + p.y * 0.5));
                    
                    return (w1 + w2 + w3) / 3.0;
                }

                void main() {
                    vec2 p = (vUv - 0.5) * 2.0;
                    p.x *= u_resolution.x / u_resolution.y;
                    
                    // 1. Outsider Art machine hesitation (Pulse of the maker)
                    p = wobble(p * 1.5);
                    
                    // 2. Conformal Mapping (Mobius Collapse)
                    // The poles drift recursively, creating infinite winding
                    vec2 a = vec2(cos(u_time*0.2), sin(u_time*0.2));
                    vec2 b = vec2(0.5 * sin(u_time*0.1), 0.5 * cos(u_time*0.1));
                    vec2 c = vec2(-0.5 * cos(u_time*0.15), 0.5 * sin(u_time*0.15));
                    vec2 d = vec2(cos(u_time*0.3), -sin(u_time*0.3));
                    p = mobius(p, a, b, c, d);
                    
                    // 3. Rainblown Anisotropic Warp (DLA Viscous Fingering)
                    vec2 warped = rainWarp(p, u_time);
                    
                    // 4. Mathematical Substrate (Gyroid + Gematria Resonance)
                    float gyroid = sin(warped.x)*cos(warped.y) + sin(warped.y)*cos(u_time*0.5) + sin(u_time*0.5)*cos(warped.x);
                    float gField = gematriaField(warped * 0.5);
                    float structure = gyroid * 0.5 + gField * 0.5;
                    
                    // 5. Structural Color Translation
                    // Topographic height maps to thin-film nanometer thickness
                    float thickness = 250.0 + (structure * 0.5 + 0.5) * 550.0;
                    vec3 filmColor = thinFilmInterference(thickness);
                    
                    // 6. Golden Angle Math Rainbow (OKLab Perceptual Space)
                    float goldenAngle = 2.39996323; 
                    float hue = length(warped) * 3.0 + u_time * 0.5;
                    vec3 oklch = vec3(0.65 + 0.15 * structure, 0.22 + 0.08 * fbm(p*10.0), hue * goldenAngle);
                    vec3 mathRainbow = OKLab_to_sRGB(OKLCh_to_OKLab(oklch));
                    
                    // 7. Blend vectors (Thermal Bloom & Rain Streaks)
                    float streak = smoothstep(0.2, 0.8, fbm(vec2(warped.x - warped.y, u_time)));
                    vec3 finalColor = mix(filmColor, mathRainbow, streak);
                    
                    // 8. Raindrop Scattering
                    vec2 wind = vec2(-0.8, -1.2) * u_time * 0.3;
                    float drops = smoothstep(0.85, 0.95, fbm(warped * 5.0 + wind));
                    finalColor += drops * OKLab_to_sRGB(OKLCh_to_OKLab(vec3(0.9, 0.15, hue * goldenAngle + PI)));
                    
                    // 9. Glitch Prophet (Chromatic Rupture)
                    float glitch = step(0.98, hash(vec2(u_time, vUv.y * 10.0)));
                    if (glitch > 0.5) {
                        finalColor.r = mix(filmColor, mathRainbow, streak - 0.15).r;
                        finalColor.b = mix(filmColor, mathRainbow, streak + 0.15).b;
                    }

                    // 10. Found Ground (Newspaper/Crayon texture)
                    float grain = noise(vUv * 800.0 + u_time);
                    finalColor *= 0.85 + 0.15 * grain;
                    
                    // Color punch
                    finalColor = smoothstep(0.0, 1.0, finalColor * 1.15);
                    
                    fragColor = vec4(finalColor, 1.0);
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

if (material?.uniforms?.u_time) {
    material.uniforms.u_time.value = time;
}
if (material?.uniforms?.u_resolution) {
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);