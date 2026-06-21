(function() {
    return function(ctx, grid, time, repos, input, mouse, canvas, THREE) {
        if (!canvas.__three) {
            try {
                if (!ctx) throw new Error("WebGL 2 context not available");
                
                const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
                const scene = new THREE.Scene();
                const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                const geometry = new THREE.PlaneGeometry(2, 2);
                
                const material = new THREE.ShaderMaterial({
                    glslVersion: THREE.GLSL3,
                    uniforms: {
                        u_time: { value: 0 },
                        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                        u_mouse: { value: new THREE.Vector2(0.5, 0.5) }
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
                        uniform vec2 u_mouse;
                        
                        // Hash functions
                        float hash21(vec2 p) {
                            p = fract(p * vec2(123.34, 345.45));
                            p += dot(p, p + 34.345);
                            return fract(p.x * p.y);
                        }
                        
                        vec2 hash22(vec2 p) {
                            float n = sin(dot(p, vec2(127.1, 311.7)));
                            return fract(vec2(262144.0, 32768.0) * n);
                        }
                        
                        // Noise
                        float noise2d(vec2 p) {
                            vec2 i = floor(p);
                            vec2 f = fract(p);
                            f = f * f * (3.0 - 2.0 * f);
                            float a = hash21(i);
                            float b = hash21(i + vec2(1.0, 0.0));
                            float c = hash21(i + vec2(0.0, 1.0));
                            float d = hash21(i + vec2(1.0, 1.0));
                            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
                        }
                        
                        // OKLab color conversions
                        vec3 srgb_to_linear(vec3 c) {
                            return vec3(
                                c.r <= 0.04045 ? c.r / 12.92 : pow((c.r + 0.055) / 1.055, 2.4),
                                c.g <= 0.04045 ? c.g / 12.92 : pow((c.g + 0.055) / 1.055, 2.4),
                                c.b <= 0.04045 ? c.b / 12.92 : pow((c.b + 0.055) / 1.055, 2.4)
                            );
                        }
                        
                        vec3 linear_to_srgb(vec3 c) {
                            return vec3(
                                c.r <= 0.0031308 ? c.r * 12.92 : 1.055 * pow(abs(c.r), 1.0/2.4) - 0.055,
                                c.g <= 0.0031308 ? c.g * 12.92 : 1.055 * pow(abs(c.g), 1.0/2.4) - 0.055,
                                c.b <= 0.0031308 ? c.b * 12.92 : 1.055 * pow(abs(c.b), 1.0/2.4) - 0.055
                            );
                        }
                        
                        vec3 linear_srgb_to_oklab(vec3 c) {
                            float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
                            float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
                            float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
                            
                            float l_ = l <= 0.0 ? 0.0 : pow(l, 1.0/3.0);
                            float m_ = m <= 0.0 ? 0.0 : pow(m, 1.0/3.0);
                            float s_ = s <= 0.0 ? 0.0 : pow(s, 1.0/3.0);
                            
                            return vec3(
                                0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
                                1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
                                0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
                            );
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
                        
                        vec3 oklabMix(vec3 colA, vec3 colB, float t) {
                            vec3 labA = linear_srgb_to_oklab(srgb_to_linear(colA));
                            vec3 labB = linear_srgb_to_oklab(srgb_to_linear(colB));
                            vec3 mixed = mix(labA, labB, t);
                            return linear_to_srgb(oklab_to_linear_srgb(mixed));
                        }
                        
                        // Iridophore structural color (Bragg reflection)
                        vec3 getIridophoreGlow(vec2 uv, float t) {
                            float drift = sin(t * 0.2 + uv.x * 1.5) * 0.5 + 0.5;
                            float d_nm = mix(190.0, 240.0, drift);
                            float cosTheta = mix(0.75, 1.0, 0.5 + 0.5 * sin(t * 0.4 + uv.y * 2.0));
                            float lambda = 2.88 * d_nm * cosTheta;
                            
                            float r = exp(-0.5 * pow((650.0 - lambda) / 30.0, 2.0));
                            float g = exp(-0.5 * pow((540.0 - lambda) / 30.0, 2.0));
                            float b = exp(-0.5 * pow((450.0 - lambda) / 30.0, 2.0));
                            
                            return vec3(r, g, b) / (max(max(r, g), b) + 0.001);
                        }
                        
                        // Cuttlefish chromatophore grid
                        vec3 sampleChromatophores(vec2 uv, float t, vec3 substrate) {
                            vec2 gridScale = vec2(32.0, 32.0);
                            vec2 g = uv * gridScale;
                            vec2 id = floor(g);
                            vec2 f = fract(g);
                            
                            float minDist = 9.0;
                            vec2 cellId = vec2(0.0);
                            for (int y = -1; y <= 1; y++) {
                                for (int x = -1; x <= 1; x++) {
                                    vec2 neighbor = vec2(float(x), float(y));
                                    vec2 cid = id + neighbor;
                                    vec2 randOffset = hash22(cid);
                                    vec2 center = neighbor + 0.5 + (randOffset - 0.5) * 0.4;
                                    float dist = distance(f, center);
                                    if (dist < minDist) {
                                        minDist = dist;
                                        cellId = cid;
                                    }
                                }
                            }
                            
                            float wave = sin(cellId.x * 0.15 + cellId.y * 0.1 - t * 2.5) * 0.5 + 0.5;
                            wave = smoothstep(0.2, 0.8, wave);
                            
                            vec3 col = substrate;
                            float r0 = 0.16 + 0.04 * hash21(cellId + vec2(12.3, 4.5));
                            
                            vec2 centerPos = 0.5 + (hash22(cellId) - 0.5) * 0.4;
                            float distToCenter = distance(f, centerPos);
                            
                            // Yellow pigment: largest, centered
                            float rY = r0 * (1.0 + 1.2 * wave);
                            float covY = smoothstep(rY, rY * 0.6, distToCenter);
                            col = mix(col, vec3(0.91, 0.72, 0.29), covY * 0.85);
                            
                            // Red pigment: offset
                            float rR = r0 * 0.75 * (1.0 + 1.1 * wave);
                            float distToRed = distance(f, centerPos + vec2(0.06, -0.04));
                            float covR = smoothstep(rR, rR * 0.6, distToRed);
                            col = mix(col, vec3(0.71, 0.31, 0.17), covR * 0.85);
                            
                            // Brown pigment: smallest, centered
                            float rB = r0 * 0.45 * (1.0 + 1.0 * wave);
                            float covB = smoothstep(rB, rB * 0.6, distToCenter);
                            col = mix(col, vec3(0.17, 0.10, 0.07), covB * 0.9);
                            
                            return col;
                        }
                        
                        // Central Reactor (Demoscene + Sacred Geometry)
                        float getCentralReactor(vec2 uv, float t) {
                            vec2 p = uv - vec2(0.5);
                            float dist = length(p);
                            float angle = atan(p.y, p.x);
                            
                            float folds = 8.0;
                            float sector = 2.0 * 3.14159265 / folds;
                            angle = mod(angle + t * 0.15, sector);
                            if (angle > sector * 0.5) angle = sector - angle;
                            
                            vec2 foldedP = vec2(cos(angle), sin(angle)) * dist;
                            float pulse = 0.25 + 0.05 * sin(t * 3.0);
                            
                            float rings = abs(sin(dist * 80.0 - t * 4.0)) - 0.15;
                            rings = smoothstep(0.05, 0.0, rings);
                            
                            float triangles = abs(foldedP.x - foldedP.y * 1.732) - 0.01;
                            triangles = min(triangles, abs(foldedP.x + foldedP.y * 1.732) - 0.01);
                            triangles = smoothstep(0.01, 0.0, triangles);
                            
                            float mask = smoothstep(pulse, pulse - 0.02, dist);
                            return max(rings, triangles) * mask;
                        }
                        
                        // sdBox for popups
                        float sdBox(vec2 p, vec2 b) {
                            vec2 d = abs(p) - b;
                            return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
                        }
                        
                        // Internet Debris
                        vec3 getInternetDebris(vec2 uv, float t, vec3 col) {
                            vec3 result = col;
                            for (int idx = 0; idx < 3; idx++) {
                                float seed = float(idx) * 23.4;
                                vec2 center = vec2(
                                    0.5 + 0.25 * sin(t * 0.3 + seed),
                                    0.5 + 0.25 * cos(t * 0.2 + seed * 1.7)
                                );
                                
                                vec2 d = uv - center;
                                vec2 boxSize = vec2(0.12, 0.08);
                                vec2 q = abs(d) - boxSize;
                                float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
                                
                                float border = smoothstep(0.003, 0.0, abs(dist));
                                float shadow = smoothstep(0.03, 0.0, sdBox(d - vec2(0.012, -0.012), boxSize));
                                float interior = step(dist, 0.0);
                                
                                if (interior > 0.5) {
                                    float titleBar = step(boxSize.y - 0.025, d.y);
                                    vec3 titleColor = vec3(0.5, 0.0, 0.8);
                                    vec3 bodyColor = vec3(0.05, 0.04, 0.12);
                                    
                                    vec3 windowCol = mix(bodyColor, titleColor, titleBar);
                                    
                                    float lines = sin(d.y * 150.0) * 0.5 + 0.5;
                                    float lineMask = step(0.7, lines) * step(abs(d.x), boxSize.x - 0.015) * step(d.y, boxSize.y - 0.03);
                                    windowCol = mix(windowCol, vec3(0.0, 0.95, 0.95), lineMask * 0.7);
                                    
                                    result = mix(result, windowCol, interior);
                                }
                                
                                result = mix(result, vec3(0.02, 0.01, 0.06), shadow * 0.4 * (1.0 - interior));
                                result = mix(result, vec3(1.0, 0.1, 0.6), border);
                            }
                            return result;
                        }
                        
                        // Anamorphic Lens Flare
                        vec3 getAnamorphicFlare(vec2 uv, float t) {
                            float flareY = 0.5 + 0.15 * sin(t * 0.7);
                            float distY = abs(uv.y - flareY);
                            float flareLine = exp(-pow(distY, 2.0) / 0.0003);
                            
                            float r = exp(-pow(uv.x - 0.5 + 0.15, 2.0) / 0.15) * flareLine;
                            float g = exp(-pow(uv.x - 0.5, 2.0) / 0.15) * flareLine;
                            float b = exp(-pow(uv.x - 0.5 - 0.15, 2.0) / 0.15) * flareLine;
                            
                            return vec3(r, g, b) * 1.4;
                        }
                        
                        // Datamosh Warp
                        vec2 datamoshWarp(vec2 uv, float t) {
                            vec2 blockSize = vec2(24.0) / u_resolution;
                            vec2 blockUV = floor(uv / blockSize) * blockSize;
                            
                            float seed = hash21(blockUV + floor(t * 4.0));
                            vec2 drift = (hash22(blockUV) - 0.5) * 0.06;
                            
                            float active = step(0.75, hash21(blockUV * 11.3 + floor(t * 2.0)));
                            return uv + drift * active;
                        }
                        
                        // Halftone Screen
                        float halftoneScreen(vec2 fragCoord, float luma) {
                            float angle = 45.0 * 3.14159265 / 180.0;
                            mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
                            vec2 uv = rot * fragCoord * 0.15;
                            vec2 cell = fract(uv) - 0.5;
                            float dist = length(cell);
                            float dotRadius = sqrt(1.0 - luma) * 0.45;
                            return smoothstep(dotRadius + 0.05, dotRadius - 0.05, dist);
                        }
                        
                        // Barrel Distortion
                        vec2 barrelDistort(vec2 uv, float k1) {
                            vec2 c = uv - 0.5;
                            float r2 = dot(c, c);
                            return c * (1.0 + k1 * r2) + 0.5;
                        }
                        
                        // Render Scene
                        vec3 renderScene(vec2 uv, float t) {
                            vec3 bg = oklabMix(vec3(0.08, 0.02, 0.15), vec3(0.02, 0.12, 0.12), 0.5 + 0.5 * sin(t * 0.4 + uv.x * 2.5 + uv.y * 1.5));
                            vec3 iri = getIridophoreGlow(uv, t);
                            vec3 substrate = oklabMix(bg, iri, 0.35);
                            vec3 skin = sampleChromatophores(uv, t, substrate);
                            
                            float reactorMask = getCentralReactor(uv, t);
                            vec3 reactorColor = oklabMix(vec3(0.9, 0.0, 0.5), vec3(0.0, 0.9, 0.7), 0.5 + 0.5 * sin(t * 1.8 + uv.y * 3.0));
                            skin = mix(skin, reactorColor, reactorMask * 0.85);
                            
                            skin = getInternetDebris(uv, t, skin);
                            
                            vec3 flare = getAnamorphicFlare(uv, t);
                            skin += flare * 0.5;
                            
                            return skin;
                        }
                        
                        // Chromatic Safety Pass
                        vec3 chromaticSafety(vec3 c) {
                            float l = dot(c, vec3(0.299, 0.587, 0.114));
                            vec3 deepIndigo = vec3(0.04, 0.02, 0.15);
                            vec3 deepTeal = vec3(0.01, 0.1, 0.12);
                            vec3 darkBase = mix(deepIndigo, deepTeal, 0.5 + 0.5 * sin(u_time * 0.3));
                            c = mix(darkBase, c, smoothstep(0.0, 0.18, l));
                            
                            vec3 neonCyan = vec3(0.0, 0.95, 0.95);
                            vec3 neonPink = vec3(1.0, 0.0, 0.8);
                            vec3 brightBase = mix(neonCyan, neonPink, 0.5 + 0.5 * sin(u_time * 0.5));
                            c = mix(c, brightBase, smoothstep(0.82, 1.00, l) * 0.3);
                            return c;
                        }
                        
                        void main() {
                            vec2 uv = barrelDistort(vUv, 0.08);
                            vec2 warpedUv = datamoshWarp(uv, u_time);
                            
                            // Chromatic Aberration via 3-sample sRGB offset
                            float aberrationStrength = 0.015;
                            vec2 dir = warpedUv - vec2(0.5);
                            
                            vec3 color;
                            color.r = renderScene(clamp(warpedUv + dir * aberrationStrength, 0.0, 1.0), u_time).r;
                            color.g = renderScene(warpedUv, u_time).g;
                            color.b = renderScene(clamp(warpedUv - dir * aberrationStrength, 0.0, 1.0), u_time).b;
                            
                            // Halftone screen-tone transitions
                            float luma = dot(color, vec3(0.299, 0.587, 0.114));
                            float ht = halftoneScreen(gl_FragCoord.xy, luma);
                            vec3 htColor = mix(vec3(0.05, 0.02, 0.1), vec3(0.9, 0.95, 1.0), ht);
                            
                            float htMask = step(0.6, sin(vUv.x * 10.0 + u_time) * 0.5 + 0.5);
                            color = mix(color, htColor, htMask * 0.5);
                            
                            // CRT Phosphor Triads at subpixel resolution
                            float colStripe = mod(gl_FragCoord.x, 3.0);
                            vec3 stripe = vec3(
                                smoothstep(1.0, 0.0, abs(colStripe - 0.5)),
                                smoothstep(1.0, 0.0, abs(colStripe - 1.5)),
                                smoothstep(1.0, 0.0, abs(colStripe - 2.5))
                            );
                            color *= mix(vec3(1.0), stripe, 0.45);
                            
                            // Scanlines
                            float scanline = 1.0 - 0.25 * (0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159 / 1.5));
                            color *= scanline;
                            
                            // Rolling refresh bar
                            float bar = exp(-pow(fract(vUv.y - u_time * 0.15) - 0.5, 2.0) / 0.008) * 0.12;
                            color *= (1.0 + bar);
                            
                            // Chromatic safety stage
                            color = chromaticSafety(color);
                            
                            fragColor = vec4(color, 1.0);
                        }
                    `
                });
                
                const mesh = new THREE.Mesh(geometry, material);
                scene.add(mesh);
                canvas.__three = { renderer, scene, camera, material };
            } catch (e) {
                console.error("WebGL Initialization Failed:", e);
                return;
            }
        }
        
        const { renderer, scene, camera, material } = canvas.__three;
        if (material && material.uniforms) {
            material.uniforms.u_time.value = time;
            material.uniforms.u_resolution.value.set(grid.width, grid.height);
            if (mouse) {
                material.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
            }
        }
        renderer.setSize(grid.width, grid.height, false);
        renderer.render(scene, camera);
    }
})();