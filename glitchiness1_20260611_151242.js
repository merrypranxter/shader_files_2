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
                gl_Position = vec4(position.xy, 0.0, 1.0);
            }
        `;
        
        const fragmentShader = `
            in vec2 vUv;
            out vec4 fragColor;
            uniform float u_time;
            uniform vec2 u_resolution;

            float hash(vec2 p) {
                p = fract(p * vec2(127.1, 311.7));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }

            vec3 oklch_to_oklab(vec3 c) {
                return vec3(c.x, c.y * cos(c.z), c.y * sin(c.z));
            }

            vec3 oklab_to_linear_srgb(vec3 c) {
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

            vec3 linear_to_srgb(vec3 c) {
                vec3 a = 12.92 * c;
                vec3 b = 1.055 * pow(clamp(c, vec3(0.0), vec3(1.0)), vec3(1.0/2.4)) - 0.055;
                return mix(a, b, step(0.0031308, c));
            }

            vec3 oklch2rgb(vec3 c) {
                vec3 lab = oklch_to_oklab(c);
                vec3 lin = oklab_to_linear_srgb(lab);
                return linear_to_srgb(clamp(lin, 0.0, 1.0));
            }

            vec3 renderScene(vec2 uv, float t) {
                // 1. Datamosh / Block corruption (Glitch Cookbook)
                vec2 blockUV = floor(uv * 12.0) / 12.0;
                float mosh = fract(sin(dot(blockUV, vec2(12.9898, 78.233)) + floor(t*3.0)) * 43758.5453);
                vec2 p = uv;
                if (mosh > 0.88) {
                    p.x += (fract(sin(mosh * 10.0)*100.0) - 0.5) * 0.2;
                    p.y += (fract(cos(mosh * 10.0)*100.0) - 0.5) * 0.2;
                }

                // 2. Space transform for Op Art (Retinal Surrealism)
                float r = length(p);
                float a = atan(p.y, p.x);
                float z = log(r + 0.001) - t * 0.5;
                float lens = smoothstep(0.0, 0.5, r);
                
                // 3. Gematria Resonance Fields (Values: 26, 86, 373)
                float f1 = sin(length(p - vec2(0.2, 0.3)) * 26.0 - t * 2.0);
                float f2 = sin(length(p - vec2(-0.3, -0.2)) * 86.0 - t * 1.5);
                float f3 = sin(length(p - vec2(0.0, 0.0)) * 37.3 - t * 3.0);
                
                // 4. Op Art Moiré Grid
                float grid1 = sin(p.x * 40.0 + t) * sin(p.y * 40.0 - t);
                float grid2 = sin(p.x * 42.0) * sin(p.y * 42.0); 
                float moire = grid1 * grid2;

                // 5. Combine patterns
                float opPattern = sin(z * 10.0 + a * 4.0 * lens) + (f1 + f2 + f3) * 0.3 + moire * 0.5;
                
                // 6. Color Mapping (OKLCh - Golden Angle Palettes)
                float maskPhase = sin(log(r)*3.0 + a * 2.0 - t * 0.5);
                float isBW = smoothstep(-0.2, 0.2, maskPhase); 
                
                float hueOffset = opPattern * 0.5 + t * 0.1;
                // Golden Angle roughly 137.508 degrees
                float h_deg = mod(floor(hueOffset * 5.0) * 137.508, 360.0);
                vec3 vibrantColor = oklch2rgb(vec3(0.65, 0.25, h_deg * 3.14159 / 180.0));
                
                float bwVal = step(0.0, sin(opPattern * 8.0));
                vec3 bwColor = vec3(bwVal);
                
                vec3 col = mix(vibrantColor, bwColor, isBW);
                
                // 7. MySpace Blingee Sparkles
                float sparkle = 0.0;
                for(int i=0; i<3; i++) {
                    vec2 sp = fract(p * float(i+3) * 1.2 + t * 0.15 * vec2(float(i+1), -float(i+1))) - 0.5;
                    float a_sp = atan(sp.y, sp.x);
                    float r_sp = length(sp);
                    float star = (pow(cos(a_sp * 4.0)*0.5+0.5, 4.0)) * exp(-r_sp * 80.0);
                    sparkle += star;
                }
                col += vec3(sparkle) * vec3(1.0, 0.5, 0.9); 
                
                // 8. Faux Plastic Gem / Crystal (New Age Glam)
                vec2 crysUV = fract(p * 2.0 - t*0.05) - 0.5;
                float dCrys = abs(crysUV.x) + abs(crysUV.y) - 0.15;
                if (dCrys < 0.0) {
                    vec3 prism = oklch2rgb(vec3(0.8, 0.15, (crysUV.x + crysUV.y + t)*10.0));
                    float edge = smoothstep(-0.02, 0.0, dCrys);
                    col = mix(prism, vec3(1.0), edge); 
                }

                // 9. Early Web UI Frame
                vec2 uiBox = abs(p) - vec2(0.6, 0.4);
                float uiDist = length(max(uiBox, 0.0)) + min(max(uiBox.x, uiBox.y), 0.0);
                if (abs(uiDist) < 0.008) {
                    col = vec3(0.8); 
                }
                
                // 10. Text Screen Heartbreak (Terminal Debris)
                vec2 termUV = p - vec2(-0.8, -0.6);
                if (termUV.x > 0.0 && termUV.x < 0.5 && termUV.y > 0.0 && termUV.y < 0.3) {
                    float line = floor(termUV.y * 25.0 + t * 1.5);
                    float charMask = step(0.6, hash(vec2(floor(termUV.x * 35.0), line)));
                    float cursor = step(0.95, termUV.x * 2.0) * step(0.0, sin(t * 8.0));
                    if (charMask > 0.0 || cursor > 0.0) {
                        col = mix(col, vec3(0.0, 1.0, 0.5), 0.9); 
                    }
                }
                
                return col;
            }

            void main() {
                vec2 uv = vUv * 2.0 - 1.0;
                uv.x *= u_resolution.x / u_resolution.y;
                float t = u_time;
                
                // VHS Tracking Error Band
                float trackY = fract(t * 0.4) * 2.0 - 1.0;
                float trackBand = smoothstep(0.2, 0.0, abs(uv.y - trackY));
                
                // Scanline distortion
                float scanline = sin(vUv.y * u_resolution.y * 0.5) * 0.005;
                vec2 distUV = uv + vec2(scanline, 0.0);
                
                // Apply tracking tear
                distUV.x += trackBand * (hash(vec2(distUV.y, t)) - 0.5) * 0.3;

                // Spatio-Temporal RGB Split (Chroma Aberration + Ghost Frame)
                float splitAmount = 0.03 + trackBand * 0.08;
                vec3 col;
                col.r = renderScene(distUV + vec2(splitAmount, 0.0), t).r;
                col.g = renderScene(distUV, t - 0.08).g;
                col.b = renderScene(distUV - vec2(splitAmount, 0.0), t - 0.16).b;
                
                // VHS Dropout (Tape Oxide Defects)
                float dropout = hash(vec2(floor(vUv.y * u_resolution.y / 2.0), floor(t * 15.0)));
                if (dropout > 0.99) {
                    col += vec3(1.0); 
                }
                
                // Halftone / Photocopy Noise Print Artifact
                float luma = dot(col, vec3(0.299, 0.587, 0.114));
                vec2 htUV = gl_FragCoord.xy / 4.0; 
                vec2 htCell = fract(htUV) - 0.5;
                float dotRadius = sqrt(1.0 - luma) * 0.5;
                float halftone = smoothstep(dotRadius + 0.1, dotRadius - 0.1, length(htCell));
                col = mix(col, col * halftone * 1.5, 0.25);
                
                // Halation / Bloom
                if (luma > 0.7) {
                    col += vec3(0.3, 0.1, 0.2); 
                }
                
                // Paper / Film Grain
                float noiseGrain = fract(sin(dot(vUv, vec2(12.9898, 78.233)) + t) * 43758.5453);
                col += (noiseGrain - 0.5) * 0.15;
                
                // CRT Vignette
                float vig = length(vUv - 0.5) * 2.0;
                col *= smoothstep(1.2, 0.5, vig);

                fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
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
        console.error("WebGL Initialization Failed:", e);
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