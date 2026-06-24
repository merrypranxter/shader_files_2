export default function(ctx, grid, time, repos, input, mouse, canvas, THREE) {
    if (!canvas.__three) {
        try {
            if (!ctx) throw new Error("WebGL 2 context not available");
            
            const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
            renderer.autoClear = false;
            
            const scene = new THREE.Scene();
            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
            scene.add(mesh);
            
            const simParams = {
                type: THREE.FloatType,
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.RGBAFormat,
                wrapS: THREE.RepeatWrapping,
                wrapT: THREE.RepeatWrapping
            };
            
            const renderParams = {
                type: THREE.FloatType,
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat
            };
            
            const simTargetA = new THREE.WebGLRenderTarget(64, 64, simParams);
            const simTargetB = new THREE.WebGLRenderTarget(64, 64, simParams);
            const renderTarget = new THREE.WebGLRenderTarget(grid.width, grid.height, renderParams);
            const afterTargetA = new THREE.WebGLRenderTarget(grid.width, grid.height, renderParams);
            const afterTargetB = new THREE.WebGLRenderTarget(grid.width, grid.height, renderParams);
            
            const commonVert = `
                out vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `;
            
            const simMat = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_prevState: { value: null },
                    u_resolution: { value: new THREE.Vector2(64, 64) },
                    u_mouse: { value: new THREE.Vector2() },
                    u_mouseClicked: { value: 0 },
                    u_time: { value: 0 },
                    u_seed: { value: 0 }
                },
                vertexShader: commonVert,
                fragmentShader: `
                    in vec2 vUv;
                    uniform sampler2D u_prevState;
                    uniform vec2 u_resolution;
                    uniform vec2 u_mouse;
                    uniform float u_mouseClicked;
                    uniform float u_time;
                    uniform float u_seed;
                    out vec4 fragColor;
                    
                    void main() {
                        vec2 texel = 1.0 / u_resolution;
                        
                        vec4 self = texture(u_prevState, vUv);
                        vec4 N = texture(u_prevState, fract(vUv + vec2(0.0, texel.y)));
                        vec4 S = texture(u_prevState, fract(vUv - vec2(0.0, texel.y)));
                        vec4 E = texture(u_prevState, fract(vUv + vec2(texel.x, 0.0)));
                        vec4 W = texture(u_prevState, fract(vUv - vec2(texel.x, 0.0)));
                        
                        float grains = self.r;
                        float toppled = floor(grains / 4.0);
                        grains -= toppled * 4.0;
                        grains += floor(N.r / 4.0) + floor(S.r / 4.0) + floor(E.r / 4.0) + floor(W.r / 4.0);
                        
                        float energy = self.b * 0.95;
                        energy += toppled * 0.6;
                        
                        vec2 p1 = vec2(0.5) + vec2(sin(u_time*0.4), cos(u_time*0.5)) * 0.35;
                        vec2 p2 = vec2(0.5) + vec2(cos(u_time*0.7), sin(u_time*0.3)) * 0.35;
                        if (length(vUv - p1) < 0.03 || length(vUv - p2) < 0.03) {
                            grains += 1.0;
                            energy += 0.2;
                        }
                        
                        if (u_mouseClicked > 0.5 && length(vUv - u_mouse) < 0.08) {
                            grains += 3.0;
                            energy += 1.5;
                        }
                        
                        float tile = self.g;
                        
                        if (u_time < 0.2 || u_seed > 0.0 || mod(u_time, 20.0) < 0.02) {
                            vec2 p = vUv * 64.0;
                            tile = fract(sin(dot(floor(p), vec2(12.9898,78.233))) * 43758.5453);
                            grains = step(0.95, fract(sin(dot(floor(p), vec2(39.346,11.135))) * 43758.5453)) * 4.0;
                            energy = 0.0;
                        } else if (energy > 4.0) {
                            tile = fract(tile + 0.17);
                            energy *= 0.5;
                        }
                        
                        float phase = fract(self.a + 0.003 + energy * 0.02);
                        
                        fragColor = vec4(grains, tile, energy, phase);
                    }
                `
            });
            
            const renderMat = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_state: { value: null },
                    u_time: { value: 0 },
                    u_resolution: { value: new THREE.Vector2() },
                    u_paletteMode: { value: 0 },
                    u_geomanticMode: { value: 1.0 }
                },
                vertexShader: commonVert,
                fragmentShader: `
                    in vec2 vUv;
                    uniform sampler2D u_state;
                    uniform float u_time;
                    uniform vec2 u_resolution;
                    uniform int u_paletteMode;
                    uniform float u_geomanticMode;
                    out vec4 fragColor;
                    
                    vec3 oklch_to_srgb(vec3 c) {
                        float L = c.x; float C = c.y; float h = c.z;
                        float a = C * cos(h); float b = C * sin(h);
                        float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
                        float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
                        float s_ = L - 0.0894841775 * a - 1.2914855480 * b;
                        float l = l_*l_*l_; float m = m_*m_*m_; float s = s_*s_*s_;
                        vec3 rgb = vec3(
                             4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
                        );
                        return vec3(
                            rgb.r <= 0.0031308 ? 12.92 * rgb.r : 1.055 * pow(clamp(rgb.r,0.,1.), 1.0/2.4) - 0.055,
                            rgb.g <= 0.0031308 ? 12.92 * rgb.g : 1.055 * pow(clamp(rgb.g,0.,1.), 1.0/2.4) - 0.055,
                            rgb.b <= 0.0031308 ? 12.92 * rgb.b : 1.055 * pow(clamp(rgb.b,0.,1.), 1.0/2.4) - 0.055
                        );
                    }
                    
                    vec3 getBaseLCh(float t) {
                        if (u_paletteMode == 0) return vec3(0.65, 0.28, t); 
                        if (u_paletteMode == 1) return vec3(0.7, 0.2, t * 2.0); 
                        if (u_paletteMode == 2) return vec3(0.75, 0.3, t * 0.5); 
                        if (u_paletteMode == 3) return vec3(0.55, 0.25, t + 4.0); 
                        return vec3(0.8, 0.22, t * 1.5 + 2.0); 
                    }
                    
                    void main() {
                        float GRID = 64.0;
                        vec2 gridUv = vUv * GRID;
                        vec2 localUv = fract(gridUv) - 0.5;
                        
                        vec4 state = texture(u_state, vUv);
                        float grains = state.r;
                        float tileType = state.g;
                        float energy = state.b;
                        float phase = state.a;
                        
                        float bgHue = u_time * 0.3 + vUv.x * 2.5 + vUv.y * 2.0;
                        vec3 baseColor = oklch_to_srgb(getBaseLCh(bgHue));
                        
                        int tType = int(mod(tileType * 100.0, 4.0));
                        if (u_geomanticMode < 0.5 && tType == 2) tType = 0;
                        
                        float d = 1.0;
                        if (tType == 0) { 
                            float flip = step(0.5, fract(tileType * 13.13));
                            vec2 p = localUv;
                            if (flip > 0.5) p.x = -p.x;
                            float d1 = abs(length(p - vec2(0.5)) - 0.5);
                            float d2 = abs(length(p + vec2(0.5)) - 0.5);
                            d = min(d1, d2);
                        } else if (tType == 1) { 
                            d = min(abs(localUv.x), abs(localUv.y));
                            if (length(localUv) < 0.18) d = 1.0; 
                            if (fract(tileType * 7.7) > 0.5) d = min(d, length(localUv)); 
                        } else if (tType == 2) { 
                            float lineY = floor((localUv.y + 0.5) * 4.0);
                            float val = fract(tileType * (lineY + 1.0) * 7.123);
                            int dots = val > 0.5 ? 2 : 1;
                            float cy = (lineY + 0.5)/4.0 - 0.5;
                            if (dots == 1) {
                                d = length(localUv - vec2(0.0, cy));
                            } else {
                                d = min(length(localUv - vec2(-0.2, cy)), length(localUv - vec2(0.2, cy)));
                            }
                        } else { 
                            float bx = abs(localUv.x) - 0.3;
                            float by = abs(localUv.y) - 0.3;
                            d = abs(max(bx, by));
                        }
                        
                        float thickness = 0.08 + 0.04 * sin(u_time * 4.0 + energy * 2.0);
                        float mask = smoothstep(0.06, 0.0, abs(d - thickness));
                        if (tType == 2) mask = smoothstep(0.12, 0.05, d); 
                        
                        float heatHue = bgHue + 3.1415; 
                        vec3 heatColor = oklch_to_srgb(vec3(0.85, 0.3, heatHue - energy * 0.5));
                        baseColor = mix(baseColor, heatColor, clamp(energy * 0.3, 0.0, 1.0));
                        
                        vec3 grainColor = oklch_to_srgb(vec3(0.85, 0.35, grains * 1.57 + u_time * 2.0));
                        vec3 finalColor = mix(baseColor, grainColor, mask * clamp(grains * 0.5 + 0.2, 0.0, 1.0));
                        
                        float film = 300.0 + 600.0 * phase;
                        vec3 filmColor = vec3(
                            pow(sin(3.1415 * 2.0 * 1.45 * film / 630.0), 2.0),
                            pow(sin(3.1415 * 2.0 * 1.45 * film / 530.0), 2.0),
                            pow(sin(3.1415 * 2.0 * 1.45 * film / 460.0), 2.0)
                        );
                        finalColor += filmColor * 0.4 * clamp(energy, 0.0, 1.0);
                        
                        fragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
                    }
                `
            });
            
            const afterimageMat = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_render: { value: null },
                    u_prev: { value: null },
                    u_decay: { value: 0.92 }
                },
                vertexShader: commonVert,
                fragmentShader: `
                    in vec2 vUv;
                    uniform sampler2D u_render;
                    uniform sampler2D u_prev;
                    uniform float u_decay;
                    out vec4 fragColor;
                    void main() {
                        vec3 cur = texture(u_render, vUv).rgb;
                        vec3 prev = texture(u_prev, vUv).rgb;
                        fragColor = vec4(max(cur, prev * u_decay), 1.0);
                    }
                `
            });
            
            const compositeMat = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_render: { value: null },
                    u_afterimage: { value: null },
                    u_resolution: { value: new THREE.Vector2() },
                    u_time: { value: 0 },
                    u_crtIntensity: { value: 1.0 }
                },
                vertexShader: commonVert,
                fragmentShader: `
                    in vec2 vUv;
                    uniform sampler2D u_render;
                    uniform sampler2D u_afterimage;
                    uniform vec2 u_resolution;
                    uniform float u_time;
                    uniform float u_crtIntensity;
                    out vec4 fragColor;
                    
                    void main() {
                        vec2 c = vUv - 0.5;
                        float r2 = dot(c, c);
                        vec2 crtUv = c * (1.0 + 0.12 * r2 + 0.01 * r2 * r2) + 0.5;
                        
                        if (crtUv.x < 0.0 || crtUv.x > 1.0 || crtUv.y < 0.0 || crtUv.y > 1.0) {
                            fragColor = vec4(0.15, 0.0, 0.25, 1.0); 
                            return;
                        }
                        
                        float conv = 0.003;
                        vec3 cur;
                        cur.r = texture(u_render, crtUv + c * conv).r;
                        cur.g = texture(u_render, crtUv).g;
                        cur.b = texture(u_render, crtUv - c * conv).b;
                        
                        vec3 adapt = texture(u_afterimage, crtUv).rgb;
                        vec3 comp = vec3(1.0) - adapt;
                        float adaptStrength = max(adapt.r, max(adapt.g, adapt.b));
                        float paintCoverage = max(cur.r, max(cur.g, cur.b));
                        vec3 ghost = comp * adaptStrength * (1.0 - paintCoverage);
                        
                        vec3 finalCol = cur + ghost * 0.8;
                        
                        if (u_crtIntensity > 0.5) {
                            float px = mod(gl_FragCoord.x, 3.0);
                            vec3 mask = vec3(
                                smoothstep(1.0, 0.0, abs(px - 0.5)),
                                smoothstep(1.0, 0.0, abs(px - 1.5)),
                                smoothstep(1.0, 0.0, abs(px - 2.5))
                            );
                            mask = mix(vec3(1.0), mask, 0.4);
                            finalCol *= mask;
                            
                            float scanline = 0.5 + 0.5 * sin(crtUv.y * u_resolution.y * 3.1415);
                            finalCol *= mix(1.0, scanline, 0.2);
                        }
                        
                        vec3 bloom = vec3(0.0);
                        vec2 texel = 1.0 / u_resolution;
                        for(int x=-2; x<=2; x++){
                            for(int y=-2; y<=2; y++){
                                vec3 s = texture(u_render, crtUv + vec2(float(x),float(y))*texel*2.0).rgb;
                                bloom += max(s - 0.6, vec3(0.0));
                            }
                        }
                        finalCol += (bloom / 25.0) * 1.5;
                        
                        float vig = smoothstep(1.1, 0.3, length(c * vec2(1.0, 1.0)));
                        finalCol = mix(vec3(0.1, 0.0, 0.2), finalCol, vig);
                        
                        fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
                    }
                `
            });
            
            const appState = {
                paletteMode: 0,
                geomanticMode: 1.0,
                crtIntensity: 1.0,
                seedTrigger: 1.0
            };
            
            if (!window.__candyAvalancheListener) {
                window.__candyAvalancheListener = (e) => {
                    if (e.code === 'Space') appState.seedTrigger = 1.0;
                    if (e.code === 'KeyC') appState.paletteMode = (appState.paletteMode + 1) % 5;
                    if (e.code === 'KeyG') appState.geomanticMode = appState.geomanticMode > 0.5 ? 0.0 : 1.0;
                    if (e.code === 'KeyP') appState.crtIntensity = appState.crtIntensity > 0.5 ? 0.0 : 1.0;
                };
                window.addEventListener('keydown', window.__candyAvalancheListener);
            }
            
            canvas.__three = { 
                renderer, scene, camera, mesh, 
                simTargetA, simTargetB, 
                renderTarget, afterTargetA, afterTargetB,
                simMat, renderMat, afterimageMat, compositeMat,
                appState
            };
        } catch (e) {
            console.error("WebGL Initialization Failed:", e);
            return;
        }
    }
    
    const sys = canvas.__three;
    if (!sys || !sys.simMat || !sys.simMat.uniforms) return;
    
    if (sys.renderTarget.width !== grid.width || sys.renderTarget.height !== grid.height) {
        sys.renderer.setSize(grid.width, grid.height, false);
        sys.renderTarget.setSize(grid.width, grid.height);
        sys.afterTargetA.setSize(grid.width, grid.height);
        sys.afterTargetB.setSize(grid.width, grid.height);
    }
    
    let mx = mouse.x;
    let my = mouse.y;
    if (mx > 1.0 || mx < 0.0) { mx = (mx + 1) * 0.5; my = (my + 1) * 0.5; }
    
    sys.simMat.uniforms.u_time.value = time;
    sys.simMat.uniforms.u_mouse.value.set(mx, my);
    sys.simMat.uniforms.u_mouseClicked.value = mouse.isPressed ? 1.0 : 0.0;
    sys.simMat.uniforms.u_seed.value = sys.appState.seedTrigger;
    
    sys.renderMat.uniforms.u_time.value = time;
    sys.renderMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    sys.renderMat.uniforms.u_paletteMode.value = sys.appState.paletteMode;
    sys.renderMat.uniforms.u_geomanticMode.value = sys.appState.geomanticMode;
    
    sys.compositeMat.uniforms.u_time.value = time;
    sys.compositeMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    sys.compositeMat.uniforms.u_crtIntensity.value = sys.appState.crtIntensity;
    
    // 1. Sim Pass
    sys.mesh.material = sys.simMat;
    sys.simMat.uniforms.u_prevState.value = sys.simTargetA.texture;
    sys.renderer.setRenderTarget(sys.simTargetB);
    sys.renderer.render(sys.scene, sys.camera);
    
    // 2. Render Pass
    sys.mesh.material = sys.renderMat;
    sys.renderMat.uniforms.u_state.value = sys.simTargetB.texture;
    sys.renderer.setRenderTarget(sys.renderTarget);
    sys.renderer.render(sys.scene, sys.camera);
    
    // 3. Afterimage Pass
    sys.mesh.material = sys.afterimageMat;
    sys.afterimageMat.uniforms.u_render.value = sys.renderTarget.texture;
    sys.afterimageMat.uniforms.u_prev.value = sys.afterTargetA.texture;
    sys.renderer.setRenderTarget(sys.afterTargetB);
    sys.renderer.render(sys.scene, sys.camera);
    
    // 4. Composite Pass (Screen)
    sys.mesh.material = sys.compositeMat;
    sys.compositeMat.uniforms.u_render.value = sys.renderTarget.texture;
    sys.compositeMat.uniforms.u_afterimage.value = sys.afterTargetB.texture;
    sys.renderer.setRenderTarget(null);
    sys.renderer.render(sys.scene, sys.camera);
    
    // Swap Targets
    let temp = sys.simTargetA;
    sys.simTargetA = sys.simTargetB;
    sys.simTargetB = temp;
    
    temp = sys.afterTargetA;
    sys.afterTargetA = sys.afterTargetB;
    sys.afterTargetB = temp;
    
    sys.appState.seedTrigger = 0.0;
}