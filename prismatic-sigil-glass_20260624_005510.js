try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        renderer.autoClear = false;

        const params = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType // Best for HDR/accumulation blending
        };

        const rtMain = new THREE.WebGLRenderTarget(grid.width, grid.height, params);
        const rtAccum0 = new THREE.WebGLRenderTarget(grid.width, grid.height, params);
        const rtAccum1 = new THREE.WebGLRenderTarget(grid.width, grid.height, params);

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geom = new THREE.PlaneGeometry(2, 2);

        const vertexShader = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        // Pass 1: Main Scene - Refraction, Schlieren, Sigils, Glass Panes
        const matMain = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            vertexShader,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform float u_time;
                uniform vec2 u_resolution;

                mat2 rot(float a) {
                    float c = cos(a), s = sin(a);
                    return mat2(c, -s, s, c);
                }

                float ndot(vec2 a, vec2 b) { return a.x*b.x - a.y*b.y; }

                float sdRhombus(vec2 p, vec2 b) {
                    p = abs(p);
                    float h = clamp(ndot(b-2.0*p,b)/dot(b,b), -1.0, 1.0);
                    float d = length( p - 0.5*b*vec2(1.0-h,1.0+h) );
                    return d * sign( p.x*b.y + p.y*b.x - b.x*b.y );
                }

                float sdBox(vec2 p, vec2 b) {
                    vec2 d = abs(p) - b;
                    return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
                }

                float sdLine(vec2 p, vec2 a, vec2 b) {
                    vec2 pa = p - a, ba = b - a;
                    float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0);
                    return length(pa - ba*h);
                }

                vec2 fbm(vec2 p) {
                    float x = sin(p.y * 5.0 + u_time * 0.7) * 0.5 + cos(p.x * 3.0 - u_time * 0.5) * 0.5;
                    float y = cos(p.x * 4.0 + u_time * 0.6) * 0.5 + sin(p.y * 6.0 - u_time * 0.4) * 0.5;
                    return vec2(x, y) * 0.08;
                }

                vec3 getBg(vec2 uv) {
                    vec2 p = uv * 2.0 - 1.0;
                    vec3 c1 = mix(vec3(0.0, 0.8, 1.0), vec3(1.0, 0.0, 0.8), sin(p.x + u_time)*0.5+0.5); // Cyan to Magenta
                    vec3 c2 = mix(vec3(0.7, 1.0, 0.0), vec3(1.0, 0.4, 0.0), cos(p.y - u_time)*0.5+0.5); // Acid Green to Orange
                    float mixFact = sin(length(p)*3.0 - u_time * 1.5) * 0.5 + 0.5;
                    return mix(c1, c2, mixFact);
                }

                float glassSDF(vec2 p) {
                    float d1 = sdRhombus(p, vec2(0.4, 0.8));
                    vec2 p2 = p * rot(u_time * 0.2);
                    float d2 = sdBox(p2, vec2(0.5)) - 0.1;
                    float d3 = sdRhombus(p, vec2(0.3, 0.6));
                    float g1 = max(d1, -d3); 
                    return min(g1, d2);
                }

                float runeSDF(vec2 p) {
                    p.y += sin(u_time) * 0.05;
                    p *= rot(sin(u_time * 0.4) * 0.1);
                    float d = sdLine(p, vec2(0.0, 0.3), vec2(0.0, -0.3));
                    d = min(d, sdLine(p, vec2(0.0, 0.15), vec2(0.15, 0.3)));
                    d = min(d, sdLine(p, vec2(0.0, 0.0), vec2(0.2, 0.1)));
                    d = min(d, sdLine(p, vec2(0.0, -0.15), vec2(-0.15, 0.0)));
                    d = min(d, sdLine(p, vec2(-0.1, -0.3), vec2(0.1, -0.3)));
                    d = min(d, abs(length(p - vec2(0.0, 0.4)) - 0.05));
                    return d;
                }

                void main() {
                    vec2 p = (vUv - 0.5) * 2.0;
                    p.x *= u_resolution.x / u_resolution.y;

                    vec2 bg_uv = vUv + fbm(vUv * 2.0);
                    vec3 col = getBg(bg_uv);

                    float d = glassSDF(p);
                    
                    vec2 eps = vec2(0.005, 0.0);
                    vec3 n = normalize(vec3(
                        glassSDF(p + eps.xy) - glassSDF(p - eps.xy),
                        glassSDF(p + eps.yx) - glassSDF(p - eps.yx),
                        0.15 
                    ));

                    if (d < 0.0) {
                        vec2 refr_uv = bg_uv + n.xy * 0.15;
                        
                        // Chromatic Aberration on refraction
                        float r = getBg(refr_uv + vec2(0.008, 0.0)).r;
                        float g = getBg(refr_uv).g;
                        float b = getBg(refr_uv - vec2(0.008, 0.0)).b;
                        col = vec3(r, g, b);

                        vec3 lightDir = normalize(vec3(sin(u_time), 1.0, cos(u_time)));
                        float spec = pow(max(dot(n, lightDir), 0.0), 32.0);
                        col += spec * vec3(1.0, 0.8, 1.0) * 0.8;

                        float edge = smoothstep(-0.03, 0.0, d);
                        col += edge * vec3(0.0, 1.0, 1.0) * 0.4;
                        col = mix(col, vec3(0.1, 0.0, 0.3), 0.15); // Glass tint
                    } else {
                        float outerEdge = smoothstep(0.02, 0.0, d);
                        col += outerEdge * vec3(1.0, 0.0, 1.0) * 0.3;
                    }

                    // Geomantic Sigil
                    float rd = runeSDF(p);
                    float rGlow = exp(-rd * 25.0);
                    float rCore = smoothstep(0.008, 0.0, rd);
                    col += rGlow * vec3(1.0, 0.6, 0.1) * 0.6;
                    col = mix(col, vec3(1.0, 0.9, 0.8), rCore);

                    // Drifting Collage Fragments
                    vec2 p1 = p * rot(u_time * 0.3) + vec2(sin(u_time*0.5)*1.5, cos(u_time*0.4)*1.5);
                    float f1 = sdBox(p1, vec2(0.1, 0.02));
                    float f1Glow = smoothstep(0.02, 0.0, f1);
                    col = mix(col, vec3(0.0, 1.0, 0.5), f1Glow * 0.8);

                    vec2 p2 = p * rot(-u_time * 0.4) + vec2(cos(u_time*0.6)*1.2, sin(u_time*0.3)*1.2);
                    float f2 = abs(length(p2) - 0.1) - 0.01;
                    float f2Glow = smoothstep(0.01, 0.0, f2);
                    col = mix(col, vec3(1.0, 0.0, 0.5), f2Glow * 0.8);

                    // Sparkle Accents on Glass Edges
                    float sparkle = pow(fract(sin(dot(p + u_time, vec2(12.9898, 78.233))) * 43758.5453), 50.0);
                    col += sparkle * smoothstep(0.05, 0.0, abs(d)) * 1.5;

                    fragColor = vec4(col, 1.0);
                }
            `
        });
        const sceneMain = new THREE.Scene();
        sceneMain.add(new THREE.Mesh(geom, matMain));

        // Pass 2: Post Processing - Pulfrich offset, temporal feedback, CRT damage
        const matPost = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_tNew: { value: null },
                u_tOld: { value: null }
            },
            vertexShader,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_tNew;
                uniform sampler2D u_tOld;
                uniform float u_time;
                uniform vec2 u_resolution;

                void main() {
                    vec2 uv = vUv;
                    vec4 newCol = texture(u_tNew, uv);
                    
                    // Pulfrich motion offset & slight zoom for trails
                    vec2 old_uv = (uv - 0.5) * 0.995 + 0.5; 
                    old_uv += vec2(sin(u_time * 0.5), cos(u_time * 0.3)) * 0.002;

                    // Chromatic aberration on the temporal trail
                    float oldR = texture(u_tOld, old_uv + vec2(0.003, 0.0)).r;
                    float oldG = texture(u_tOld, old_uv).g;
                    float oldB = texture(u_tOld, old_uv - vec2(0.003, 0.0)).b;
                    vec3 oldCol = vec3(oldR, oldG, oldB);

                    // Temporal Accumulation Blend
                    vec3 blended = mix(newCol.rgb, oldCol, 0.78);
                    blended = max(blended, newCol.rgb * 0.5); 

                    // CRT / Polish
                    float scan = 0.97 + 0.03 * sin(uv.y * u_resolution.y * 2.5);
                    blended *= scan;

                    float vig = length(uv - 0.5);
                    blended *= smoothstep(0.85, 0.25, vig);

                    float grain = fract(sin(dot(uv + u_time, vec2(12.9898, 78.233))) * 43758.5453);
                    blended += (grain - 0.5) * 0.03;

                    // Warm lith shadow shift, cyan highlight shift
                    float luma = dot(blended, vec3(0.299, 0.587, 0.114));
                    vec3 shadowTint = vec3(0.1, 0.0, 0.2);
                    vec3 highTint = vec3(0.0, 0.1, 0.1);
                    blended += mix(shadowTint, highTint, luma) * 0.1;

                    fragColor = vec4(blended, 1.0);
                }
            `
        });
        const scenePost = new THREE.Scene();
        scenePost.add(new THREE.Mesh(geom, matPost));

        // Pass 3: Copy to Screen
        const matCopy = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: { u_tex: { value: null } },
            vertexShader,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D u_tex;
                void main() { fragColor = texture(u_tex, vUv); }
            `
        });
        const sceneCopy = new THREE.Scene();
        sceneCopy.add(new THREE.Mesh(geom, matCopy));

        canvas.__three = { renderer, camera, rtMain, rtAccum0, rtAccum1, matMain, matPost, matCopy, sceneMain, scenePost, sceneCopy, flip: false };
    }

    const t = canvas.__three;
    t.renderer.setSize(grid.width, grid.height, false);
    const res = new THREE.Vector2(grid.width, grid.height);

    if (t.rtMain.width !== grid.width || t.rtMain.height !== grid.height) {
        t.rtMain.setSize(grid.width, grid.height);
        t.rtAccum0.setSize(grid.width, grid.height);
        t.rtAccum1.setSize(grid.width, grid.height);
    }

    t.matMain.uniforms.u_time.value = time;
    t.matMain.uniforms.u_resolution.value.copy(res);
    t.matPost.uniforms.u_time.value = time;
    t.matPost.uniforms.u_resolution.value.copy(res);

    let readRT = t.flip ? t.rtAccum1 : t.rtAccum0;
    let writeRT = t.flip ? t.rtAccum0 : t.rtAccum1;

    // 1. Render Main Scene
    t.renderer.setRenderTarget(t.rtMain);
    t.renderer.render(t.sceneMain, t.camera);

    // 2. Render Post & Feedback
    t.matPost.uniforms.u_tNew.value = t.rtMain.texture;
    t.matPost.uniforms.u_tOld.value = readRT.texture;
    t.renderer.setRenderTarget(writeRT);
    t.renderer.render(t.scenePost, t.camera);

    // 3. Render Copy to Screen
    t.matCopy.uniforms.u_tex.value = writeRT.texture;
    t.renderer.setRenderTarget(null);
    t.renderer.render(t.sceneCopy, t.camera);

    t.flip = !t.flip;

} catch (e) {
    console.error("WebGL/Three.js execution failed:", e);
}