if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;

        // Depth Target (NearestFilter prevents interpolated ghosting at sharp depth edges)
        const depthTarget = new THREE.WebGLRenderTarget(grid.width, grid.height, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType
        });

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const sceneDepth = new THREE.Scene();
        const sceneStereo = new THREE.Scene();

        // Pass 1: Depth Map (SDF Raymarching)
        const depthMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                uTime: { value: 0 },
                uResolution: { value: new THREE.Vector2(grid.width, grid.height) }
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
                uniform float uTime;
                uniform vec2 uResolution;

                mat2 rot(float a) {
                    float c = cos(a), s = sin(a);
                    return mat2(c, -s, s, c);
                }

                // Alien Torus-Knot / Klein-bottle hybrid + Gyroid + Terrain
                float map(vec3 p) {
                    vec3 q = p;
                    q.xy *= rot(uTime * 0.1);
                    q.xz *= rot(uTime * 0.15);
                    
                    // Base Torus
                    float r = length(q.xy) - 0.8;
                    float a = atan(q.y, q.x);
                    float d = length(vec2(r, q.z)) - 0.35;
                    
                    // Hopf/Torus twist
                    d -= 0.12 * sin(a * 6.0 + q.z * 10.0 + uTime * 1.5);
                    
                    // Gyroid carving (impossible topology)
                    float gyroid = dot(sin(p * 5.0), cos(p.zxy * 5.0)) / 5.0;
                    d = max(d, -gyroid - 0.05);
                    
                    // Pulsing inner metaball core
                    float core = length(p) - 0.3 + 0.06 * sin(p.x*12.0 - uTime)*sin(p.y*12.0)*sin(p.z*12.0);
                    d = min(d, core);
                    
                    // Floating undulating ground plane
                    float ground = p.y + 1.5 + 0.15 * sin(p.x*2.5 + uTime) * cos(p.z*2.5 - uTime);
                    d = min(d, ground);
                    
                    return d;
                }

                void main() {
                    vec2 p = (vUv - 0.5) * 2.0;
                    p.x *= uResolution.x / uResolution.y;
                    
                    vec3 ro = vec3(0.0, 0.0, 3.5);
                    vec3 rd = normalize(vec3(p, -1.5));
                    
                    float t = 0.0;
                    for(int i = 0; i < 90; i++) {
                        float d = map(ro + rd * t);
                        if(d < 0.001 || t > 10.0) break;
                        t += d * 0.7; // conservative step to prevent gyroid overshooting
                    }
                    
                    float z = 0.0;
                    if(t < 10.0) {
                        // Map distance to depth [0,1] where 1 is nearest
                        z = 1.0 - clamp((t - 1.8) / 2.5, 0.0, 1.0);
                    }
                    
                    // Background deep void noise
                    float bg = 0.05 + 0.05 * sin(vUv.x*15.0 + uTime) * cos(vUv.y*15.0 - uTime);
                    z = max(z, bg);
                    
                    // Vignette edge falloff to ensure clean borders
                    z *= smoothstep(1.5, 0.8, length(p));
                    
                    fragColor = vec4(vec3(z), 1.0);
                }
            `
        });
        sceneDepth.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), depthMaterial));

        // Pass 2: Stereogram Assembly & Pattern Generation
        const stereoMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                uTime: { value: 0 },
                uResolution: { value: new THREE.Vector2(grid.width, grid.height) },
                tDepth: { value: depthTarget.texture },
                uE: { value: 128.0 }, // Eye separation (pattern period)
                uMu: { value: 0.4 }   // Depth scale factor
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
                
                uniform sampler2D tDepth;
                uniform float uTime;
                uniform vec2 uResolution;
                uniform float uE;
                uniform float uMu;

                const float TAU = 6.28318530718;

                // Insane Acid-Neon / Lisa-Frank / Op-Art generator
                vec3 getPattern(vec2 puv) {
                    // Map 2D pattern UVs to a 3D cylinder to ensure PERFECT horizontal seamless wrapping.
                    // This prevents the visual seam that ruins stereogram fusion at the tile boundary.
                    vec3 p3 = vec3(sin(puv.x * TAU), cos(puv.x * TAU), puv.y * 2.0);
                    vec3 c = vec3(0.0);
                    
                    // Reaction-diffusion / domain warping
                    for(int i = 0; i < 3; i++) {
                        p3 += 0.2 * vec3(sin(p3.y*3.1 + uTime*0.4), cos(p3.z*2.3 - uTime*0.3), sin(p3.x*2.7));
                        p3 *= 1.35;
                        c += sin(vec3(p3.x, p3.y, p3.z) * 2.5 + vec3(0.0, 2.1, 4.2)) * 0.3;
                    }
                    c += 0.5;
                    
                    // Toxic neon palettes
                    vec3 pink = vec3(1.0, 0.0, 0.7);
                    vec3 cyan = vec3(0.0, 1.0, 0.9);
                    vec3 lime = vec3(0.7, 1.0, 0.0);
                    vec3 ultraviolet = vec3(0.4, 0.0, 1.0);
                    
                    c = mix(c, pink, sin(p3.x * 5.0 + p3.y * 3.0)*0.5+0.5);
                    c = mix(c, cyan, cos(p3.z * 4.0 - p3.x * 4.0)*0.5+0.5);
                    c = mix(c, lime, sin(p3.y * 6.0 + uTime*0.8)*0.5+0.5);
                    
                    // Op-art moiré interference
                    float moire = sin(length(p3)*9.0 - uTime*1.5) * cos(p3.x*7.0) * sin(p3.z*7.0);
                    c += moire * 0.25;
                    
                    // Prismatic boro-glass iridescence overlay
                    vec3 irid = 0.5 + 0.5 * cos(TAU * (length(p3)*1.5 + puv.y*2.0 - uTime*0.5 + vec3(0.0, 0.33, 0.67)));
                    c = mix(c, irid, 0.3);
                    
                    // Tiny recursive glyphs / alien stickers (fract is naturally seamless at integers)
                    vec2 guv = fract(puv * 8.0) - 0.5; 
                    float glyph = length(max(abs(guv) - 0.2, 0.0)) - 0.05 + 0.1 * sin(atan(guv.y, guv.x)*5.0 + uTime*2.0);
                    float glyphOutline = smoothstep(0.03, 0.0, abs(glyph));
                    float glyphFill = smoothstep(0.0, -0.03, glyph);
                    c = mix(c, ultraviolet, glyphOutline);
                    c = mix(c, vec3(1.0, 0.3, 0.0), glyphFill); // Molten tangerine
                    
                    // Chrome glitter scatter
                    float glitter = fract(sin(dot(p3, vec3(12.989, 78.233, 45.164))) * 43758.5453);
                    c += pow(glitter, 25.0) * 1.8;
                    
                    return clamp(c, 0.0, 1.0);
                }

                void main() {
                    float ypix = vUv.y * uResolution.y;
                    float xpix = vUv.x * uResolution.x;
                    
                    // GPU per-pixel pattern-shift approximation (Thimbleby-Inglis-Witten inspired)
                    float acc = xpix;
                    
                    // Walk left to find the anchor tile
                    for(int i = 0; i < 150; i++) {
                        vec2 sampleUv = vec2(acc / uResolution.x, vUv.y);
                        float z = texture(tDepth, sampleUv).r;
                        float sep = uE * (1.0 - uMu * z) / (2.0 - uMu * z);
                        if(acc - sep < 0.0) break;
                        acc -= sep;
                    }
                    
                    // Map leftover 'acc' to pattern UV
                    vec2 puv = vec2(acc / uE, ypix / uE);
                    vec3 col = getPattern(puv);
                    
                    // Convergence / Eye-fusion dots (Half the fun is teaching the brain to see it)
                    float cx = uResolution.x * 0.5;
                    float cy = uResolution.y * 0.92;
                    float d1 = length(vec2(xpix, ypix) - vec2(cx - uE * 0.5, cy));
                    float d2 = length(vec2(xpix, ypix) - vec2(cx + uE * 0.5, cy));
                    float dotDist = min(d1, d2);
                    
                    if(dotDist < 12.0) {
                        float ring = smoothstep(12.0, 9.0, dotDist) * smoothstep(5.0, 7.0, dotDist);
                        float core = smoothstep(5.0, 3.0, dotDist);
                        col = mix(col, vec3(0.05, 0.0, 0.15), ring); // Dark UV ring
                        col = mix(col, vec3(0.8, 1.0, 0.0), core);   // Toxic lime core
                    }
                    
                    fragColor = vec4(col, 1.0);
                }
            `
        });
        sceneStereo.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), stereoMaterial));

        canvas.__three = {
            renderer,
            depthTarget,
            sceneDepth,
            sceneStereo,
            camera,
            depthMaterial,
            stereoMaterial
        };
    } catch (e) {
        console.error("Psychedelic Stereogram WebGL init failed:", e);
        return;
    }
}

const state = canvas.__three;
if (state && state.depthMaterial && state.stereoMaterial) {
    state.renderer.setSize(grid.width, grid.height, false);
    state.depthTarget.setSize(grid.width, grid.height);
    
    // Scale pattern period dynamically but keep it large enough to fuse
    const eyeSep = Math.max(90.0, Math.min(140.0, grid.width / 6.0));
    
    state.depthMaterial.uniforms.uResolution.value.set(grid.width, grid.height);
    state.stereoMaterial.uniforms.uResolution.value.set(grid.width, grid.height);
    state.stereoMaterial.uniforms.uE.value = eyeSep;
    
    state.depthMaterial.uniforms.uTime.value = time;
    state.stereoMaterial.uniforms.uTime.value = time;

    // Pass 1: Render Hidden 3D Object to Depth Target
    state.renderer.setRenderTarget(state.depthTarget);
    state.renderer.render(state.sceneDepth, state.camera);

    // Pass 2: Render Final Stereogram Wallpaper
    state.renderer.setRenderTarget(null);
    state.renderer.render(state.sceneStereo, state.camera);
}