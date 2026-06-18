if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        const vertexShader = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;
        
        const fragmentShader = `
            in vec2 vUv;
            out vec4 fragColor;
            
            uniform float u_time;
            uniform vec2 u_resolution;
            
            #define PI 3.14159265359
            #define TAU 6.28318530718
            
            float hash(vec2 p) {
                p = fract(p * vec2(127.1, 311.7));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }
            
            vec2 hash2(vec2 p) {
                return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
            }
            
            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                           mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
            }
            
            mat2 rot(float a) {
                float s = sin(a), c = cos(a);
                return mat2(c, -s, s, c);
            }
            
            float fbm(vec2 p) {
                float v = 0.0;
                float a = 0.5;
                mat2 r = rot(0.5);
                for(int i = 0; i < 5; i++) {
                    v += a * noise(p);
                    p = r * p * 2.0 + vec2(1.1, 2.3);
                    a *= 0.5;
                }
                return v;
            }
            
            vec3 oklch_to_oklab(vec3 lch) {
                return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
            }
            
            vec3 oklab_to_srgb(vec3 c) {
                float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
                float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
                float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
                float l = l_ * l_ * l_;
                float m = m_ * m_ * m_;
                float s = s_ * s_ * s_;
                vec3 rgb = vec3(
                     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                );
                return mix(rgb * 12.92, 1.055 * pow(max(rgb, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, rgb));
            }
            
            vec3 spectralColor(float w) {
                float r = 0.0, g = 0.0, b = 0.0;
                if (w >= 380.0 && w < 440.0) { r = -(w - 440.0) / (440.0 - 380.0); b = 1.0; }
                else if (w >= 440.0 && w < 490.0) { g = (w - 440.0) / (490.0 - 440.0); b = 1.0; }
                else if (w >= 490.0 && w < 510.0) { g = 1.0; b = -(w - 510.0) / (510.0 - 490.0); }
                else if (w >= 510.0 && w < 580.0) { r = (w - 510.0) / (580.0 - 510.0); g = 1.0; }
                else if (w >= 580.0 && w < 645.0) { r = 1.0; g = -(w - 645.0) / (645.0 - 580.0); }
                else if (w >= 645.0 && w <= 780.0) { r = 1.0; }
                return clamp(vec3(r, g, b), 0.0, 1.0);
            }
            
            vec3 voronoi(vec2 x) {
                vec2 n = floor(x);
                vec2 f = fract(x);
                float md = 8.0;
                vec2 mr;
                vec2 mc;
                for(int j = -1; j <= 1; j++)
                for(int i = -1; i <= 1; i++) {
                    vec2 g = vec2(float(i), float(j));
                    vec2 o = hash2(n + g);
                    o = 0.5 + 0.5 * sin(u_time * 0.5 + 6.2831 * o);
                    vec2 r = g + o - f;
                    float d = dot(r, r);
                    if(d < md) {
                        md = d;
                        mr = r;
                        mc = n + g;
                    }
                }
                float md2 = 8.0;
                for(int j = -2; j <= 2; j++)
                for(int i = -2; i <= 2; i++) {
                    vec2 g = vec2(float(i), float(j));
                    vec2 o = hash2(n + g);
                    o = 0.5 + 0.5 * sin(u_time * 0.5 + 6.2831 * o);
                    vec2 r = g + o - f;
                    if(dot(r - mr, r - mr) > 0.00001) {
                        md2 = min(md2, dot(0.5 * (mr + r), normalize(r - mr)));
                    }
                }
                return vec3(md, md2, mc.x + mc.y * 37.0);
            }

            void main() {
                vec2 uv = (vUv - 0.5) * 2.0;
                uv.x *= u_resolution.x / u_resolution.y;
                
                vec2 p = uv * 2.5 + vec2(u_time * 0.1, sin(u_time * 0.05));
                
                float f_yhwh = sin(length(p) * 26.0 - u_time * 2.0);
                float f_elohim = sin(length(p + 1.0) * 86.0 + u_time);
                float gField = (f_yhwh + f_elohim) * 0.5;
                
                vec2 q = vec2(fbm(p + u_time * 0.1), fbm(p + vec2(5.2, 1.3) - u_time * 0.1));
                vec2 p_warped = p + q * 1.5 + gField * 0.2;
                
                vec3 v = voronoi(p_warped * 3.0);
                float network = smoothstep(0.12, 0.0, v.y);
                
                vec2 hexUV = fract(p_warped * 8.0);
                float lineIdx = floor(hexUV.y * 6.0);
                float hexVal = floor(hash(floor(p_warped * 8.0)) * 64.0);
                float bit = mod(floor(hexVal / exp2(lineIdx)), 2.0);
                float gap = step(0.35, hexUV.x) * step(hexUV.x, 0.65) * (1.0 - bit);
                float hexMask = (1.0 - gap) * step(0.1, fract(hexUV.y * 6.0));
                
                vec2 cubeGrid = fract(p_warped * 10.0) - 0.5;
                float cubeDist = max(abs(cubeGrid.x), abs(cubeGrid.y));
                float cracks = smoothstep(0.42, 0.5, cubeDist);

                float h_net = v.z * 0.1 + u_time * 0.3;
                vec3 netOklch = vec3(0.6 + 0.15 * sin(u_time), 0.25, h_net);
                vec3 netColor = oklab_to_srgb(oklch_to_oklab(netOklch));
                
                float thickness = 300.0 + 400.0 * q.x;
                float pathDiff = 2.0 * 1.56 * thickness * (1.0 - v.y);
                vec3 irid = vec3(0.0);
                for(float i = 0.0; i < 3.0; i++) {
                    float lambda = 400.0 + i * 130.0;
                    float phase = (pathDiff / lambda) * TAU;
                    irid += spectralColor(lambda) * (0.5 + 0.5 * cos(phase));
                }
                irid /= 3.0;
                netColor = mix(netColor, irid, 0.5);
                
                float h_cell = v.z * 2.39996 + u_time * 0.1;
                vec3 cellOklch = vec3(0.5 + 0.2 * cos(v.x * 15.0 - u_time * 3.0), 0.22, h_cell);
                vec3 cellColor = oklab_to_srgb(oklch_to_oklab(cellOklch));
                
                vec3 hexOklch = vec3(0.7, 0.2, h_cell + PI);
                vec3 hexColor = oklab_to_srgb(oklch_to_oklab(hexOklch));
                
                vec3 crackOklch = vec3(0.4, 0.28, h_net - PI / 2.0);
                vec3 crackColor = oklab_to_srgb(oklch_to_oklab(crackOklch));
                
                vec3 finalColor = cellColor;
                finalColor = mix(finalColor, hexColor, hexMask * 0.4 * (1.0 - network));
                finalColor = mix(finalColor, crackColor, cracks * 0.8 * (1.0 - network));
                finalColor = mix(finalColor, netColor, network);
                
                float spore = step(0.97, hash(uv * 200.0 + u_time));
                vec3 sporeOklch = vec3(0.8, 0.25, 2.8);
                vec3 sporeColor = oklab_to_srgb(oklch_to_oklab(sporeOklch));
                finalColor = mix(finalColor, sporeColor, spore);
                
                finalColor = clamp(finalColor, 0.15, 0.85);
                
                float maxC = max(max(finalColor.r, finalColor.g), finalColor.b);
                float minC = min(min(finalColor.r, finalColor.g), finalColor.b);
                float sat = maxC - minC;
                if (sat < 0.15) {
                    vec3 rescueOklch = vec3(0.6, 0.25, uv.x * 3.0 + u_time);
                    vec3 rescueColor = oklab_to_srgb(oklch_to_oklab(rescueOklch));
                    finalColor = mix(finalColor, rescueColor, 1.0 - (sat / 0.15));
                    finalColor = clamp(finalColor, 0.15, 0.85);
                }
                
                fragColor = vec4(finalColor, 1.0);
            }
        `;
        
        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            vertexShader,
            fragmentShader
        });
        
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);
        canvas.__three = { renderer, scene, camera, material };
    } catch (e) {
        console.error("Fungal WebGL Init Failed:", e);
        return;
    }
}

const { renderer, scene, camera, material } = canvas.__three;
if (material && material.uniforms && material.uniforms.u_time) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
}
renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);