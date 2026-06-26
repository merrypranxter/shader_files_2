try {
    if (!canvas.__three) {
        if (!ctx) throw new Error("WebGL2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const rtOpts = {
            type: THREE.HalfFloatType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            depthBuffer: false,
            generateMipmaps: false
        };

        const simRT1 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const simRT2 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const fatigueRT1 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const fatigueRT2 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
        const renderRT = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);

        const u_time = { value: 0 };
        const u_mouse = { value: new THREE.Vector4(0, 0, 0, 0) };
        const u_resolution = { value: new THREE.Vector2(grid.width, grid.height) };
        const u_reseed = { value: 0 };
        const u_palette = { value: 0 };
        const u_geo = { value: 1 };
        const u_crt = { value: 1 };

        const quadGeo = new THREE.PlaneGeometry(2, 2);

        const commonGLSL = `
            const mat3 srgb_to_lms = mat3(
                0.4122214708, 0.2119034982, 0.0883024619,
                0.5363325363, 0.6806995451, 0.2817188376,
                0.0514459929, 0.1073969566, 0.6299787005
            );
            const mat3 lms_to_oklab = mat3(
                0.2104542553, 1.9779984951, 0.0259040371,
                0.7936177850, -2.4285922050, 0.7827717662,
                -0.0040720468, 0.4505937099, -0.8086757660
            );
            const mat3 oklab_to_lms = mat3(
                1.0, 0.3963377774, 0.2158037573,
                1.0, -0.1055613458, -0.0638541728,
                1.0, -0.0894841775, -1.2914855480
            );
            const mat3 lms_to_srgb = mat3(
                4.0767416621, -1.2684380046, -0.0041960863,
                -3.3077115913, 2.6097574011, -0.7034186147,
                0.2309699292, -0.3413193965, 1.7076147010
            );

            vec3 srgb_to_oklab(vec3 c) {
                vec3 lms = srgb_to_lms * c;
                lms = sign(lms) * pow(abs(lms), vec3(1.0/3.0));
                return lms_to_oklab * lms;
            }

            vec3 oklab_to_srgb(vec3 c) {
                vec3 lms = oklab_to_lms * c;
                lms = lms * lms * lms;
                return lms_to_srgb * lms;
            }

            vec3 spectral(float nm) {
                float t = clamp((nm - 380.0) / 320.0, 0.0, 1.0);
                vec3 c = vec3(0.0);
                if(t < 0.15) c = vec3(0.5 - t*3.33, 0.0, 1.0);
                else if(t < 0.35) c = vec3(0.0, (t-0.15)*5.0, 1.0);
                else if(t < 0.6) c = vec3(0.0, 1.0, 1.0 - (t-0.35)*4.0);
                else if(t < 0.8) c = vec3((t-0.6)*5.0, 1.0, 0.0);
                else c = vec3(1.0, max(0.0, 1.0 - (t-0.8)*5.0), 0.0);
                return clamp(c, 0.0, 1.0);
            }

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
            }
        `;

        const simMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_prev: { value: null },
                u_resolution, u_mouse, u_time, u_reseed
            },
            vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
            fragmentShader: `
                uniform sampler2D u_prev;
                uniform vec2 u_resolution;
                uniform vec4 u_mouse;
                uniform float u_time;
                uniform float u_reseed;
                in vec2 vUv;
                out vec4 fragColor;
                ${commonGLSL}
                void main() {
                    vec2 px = 1.0 / u_resolution;
                    vec4 c = texture(u_prev, vUv);
                    
                    float r = c.r; 
                    float ent = c.g; 
                    float type = c.b; 

                    float spread = floor(r / 4.0);
                    float next_r = r - spread * 4.0;
                    
                    next_r += floor(texture(u_prev, vUv + vec2(0.0, px.y)).r / 4.0);
                    next_r += floor(texture(u_prev, vUv - vec2(0.0, px.y)).r / 4.0);
                    next_r += floor(texture(u_prev, vUv + vec2(px.x, 0.0)).r / 4.0);
                    next_r += floor(texture(u_prev, vUv - vec2(px.x, 0.0)).r / 4.0);

                    if(u_mouse.z > 0.0 && length(vUv - u_mouse.xy) < 0.02) next_r += 4.0;
                    
                    for(int i=0; i<4; i++) {
                        float a = u_time * 1.5 + float(i) * 1.5707;
                        vec2 p = 0.5 + 0.35 * vec2(cos(a), sin(a*1.3));
                        if(length(vUv - p) < 0.005) next_r += 1.0;
                    }

                    if(u_time < 0.2 || u_reseed > 0.5) {
                        next_r = floor(hash(vUv * (u_time+1.0)) * 5.0);
                        ent = 0.0;
                        type = hash(vUv + 1.0);
                    } else {
                        ent += 0.003 + (spread > 0.0 ? 0.08 : 0.0);
                        if(ent >= 1.0) {
                            ent = 1.0;
                        } else {
                            type = hash(vUv + u_time);
                        }
                    }
                    
                    fragColor = vec4(next_r, ent, type, 1.0);
                }
            `
        });

        const renderMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_sim: { value: null },
                u_time, u_palette, u_geo
            },
            vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
            fragmentShader: `
                uniform sampler2D u_sim;
                uniform float u_time;
                uniform float u_palette;
                uniform float u_geo;
                in vec2 vUv;
                out vec4 fragColor;
                ${commonGLSL}
                void main() {
                    vec2 gridUv = vUv * 24.0;
                    vec2 cid = floor(gridUv);
                    vec2 cfr = fract(gridUv);

                    vec4 simCell = texture(u_sim, (cid + 0.5) / 24.0);
                    vec4 simPx = texture(u_sim, vUv);

                    float grains = simPx.r;
                    float ent = simCell.g;
                    float type = simCell.b;

                    float pOffset = u_palette * 80.0;
                    
                    vec3 bg = spectral(380.0 + pOffset + 160.0 * (0.5 + 0.5*sin(vUv.x*3.0 - u_time*0.5)));
                    bg = max(bg, vec3(0.2, 0.0, 0.4)); // Deep saturated base, no black
                    
                    vec3 col = bg;

                    if (grains > 0.0) {
                        float thick = 300.0 + grains * 120.0;
                        float cosT = max(0.0, 1.0 - length(vUv - 0.5)*1.2);
                        float path = 2.0 * 1.5 * thick * cosT;
                        vec3 structCol = vec3(0.0);
                        for(int i=0; i<3; i++) {
                            float lam = 400.0 + float(i)*100.0;
                            float phase = (path / lam) * 6.28318;
                            structCol += spectral(lam) * (0.5 + 0.5*cos(phase));
                        }
                        vec3 sand = spectral(400.0 + pOffset + grains * 60.0);
                        col = mix(col, clamp(sand + structCol*0.6, 0.0, 1.0), 0.85);
                    }

                    vec2 tuv = cfr;
                    if (type > 0.5) tuv.x = 1.0 - tuv.x;
                    float arc1 = abs(length(tuv) - 0.5);
                    float arc2 = abs(length(tuv - 1.0) - 0.5);
                    float arc = min(arc1, arc2);
                    
                    if (ent < 1.0) {
                        col = mix(col, spectral(700.0 - ent*200.0), 0.6 * smoothstep(0.2, 0.1, arc));
                    } else {
                        float mask = smoothstep(0.12, 0.08, arc);
                        vec3 traceCol = spectral(420.0 + pOffset + type * 140.0);
                        col = mix(col, traceCol, mask);
                    }

                    if (u_geo > 0.5 && ent >= 1.0) {
                        float fig = floor(hash(cid) * 16.0);
                        float row = floor(cfr.y * 4.0);
                        float bit = mod(floor(fig / pow(2.0, 3.0 - row)), 2.0);
                        float d = 1.0;
                        if (bit < 0.5) {
                            d = length(vec2(cfr.x - 0.5, fract(cfr.y * 4.0) - 0.5));
                        } else {
                            d = min(length(vec2(cfr.x - 0.3, fract(cfr.y * 4.0) - 0.5)),
                                    length(vec2(cfr.x - 0.7, fract(cfr.y * 4.0) - 0.5)));
                        }
                        float dMask = smoothstep(0.15, 0.1, d);
                        vec3 dCol = spectral(380.0 + row * 60.0 + pOffset);
                        col = mix(col, vec3(1.0), dMask * 0.85);
                        col += dCol * smoothstep(0.3, 0.1, d) * 1.5;
                    }

                    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
                }
            `
        });

        const fatigueMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_render: { value: null },
                u_prev: { value: null }
            },
            vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
            fragmentShader: `
                uniform sampler2D u_render;
                uniform sampler2D u_prev;
                in vec2 vUv;
                out vec4 fragColor;
                ${commonGLSL}
                void main() {
                    vec4 cur = texture(u_render, vUv);
                    vec4 prev = texture(u_prev, vUv);

                    vec3 labCur = srgb_to_oklab(cur.rgb);
                    vec3 labComp = vec3(max(0.65, 1.0 - labCur.x*0.5), -labCur.y*1.2, -labCur.z*1.2);
                    vec3 srgbComp = clamp(oklab_to_srgb(labComp), 0.0, 1.0);

                    vec3 ghost = mix(prev.rgb, srgbComp, 0.06);
                    float newFatigue = clamp(prev.a * 0.98 + length(cur.rgb)*0.015, 0.0, 1.0);

                    fragColor = vec4(ghost, newFatigue);
                }
            `
        });

        const crtMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_render: { value: null },
                u_fatigue: { value: null },
                u_resolution, u_time, u_crt
            },
            vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
            fragmentShader: `
                uniform sampler2D u_render;
                uniform sampler2D u_fatigue;
                uniform vec2 u_resolution;
                uniform float u_time;
                uniform float u_crt;
                in vec2 vUv;
                out vec4 fragColor;
                void main() {
                    vec2 uv = vUv;
                    vec2 cc = uv - 0.5;
                    float r2 = dot(cc, cc);
                    uv = 0.5 + cc * (1.0 + 0.12 * r2);

                    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                        fragColor = vec4(0.25, 0.0, 0.45, 1.0); // Vibrant boundary
                        return;
                    }

                    float conv = 0.004 * r2 * u_crt;
                    vec3 col;
                    
                    vec4 cR = texture(u_render, uv + vec2(conv, 0.0));
                    vec4 fR = texture(u_fatigue, uv + vec2(conv, 0.0));
                    col.r = mix(cR.r, fR.r, fR.a * smoothstep(1.0, 0.0, length(cR.rgb)));

                    vec4 cG = texture(u_render, uv);
                    vec4 fG = texture(u_fatigue, uv);
                    col.g = mix(cG.g, fG.g, fG.a * smoothstep(1.0, 0.0, length(cG.rgb)));

                    vec4 cB = texture(u_render, uv - vec2(conv, 0.0));
                    vec4 fB = texture(u_fatigue, uv - vec2(conv, 0.0));
                    col.b = mix(cB.b, fB.b, fB.a * smoothstep(1.0, 0.0, length(cB.rgb)));

                    float scan = 0.5 + 0.5 * sin(uv.y * u_resolution.y * 3.1415);
                    col *= mix(1.0, 0.85 + 0.15 * scan, u_crt);

                    float phos = 0.5 + 0.5 * sin(uv.x * u_resolution.x * 3.1415);
                    col *= mix(1.0, 0.9 + 0.1 * phos, u_crt);

                    col += pow(col, vec3(2.0)) * 0.35;

                    float vig = smoothstep(1.1, 0.4, length(cc * 2.0));
                    vec3 vigCol = vec3(0.2, 0.0, 0.4); 
                    col = mix(vigCol, col, vig);

                    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
                }
            `
        });

        const quad = new THREE.Mesh(quadGeo);
        scene.add(quad);

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') u_reseed.value = 1.0;
            if (e.code === 'KeyC') u_palette.value = (u_palette.value + 1) % 5;
            if (e.code === 'KeyG') u_geo.value = 1.0 - u_geo.value;
            if (e.code === 'KeyP') u_crt.value = 1.0 - u_crt.value;
        });

        canvas.__three = {
            renderer, scene, camera, quad,
            simRT1, simRT2, fatigueRT1, fatigueRT2, renderRT,
            simMat, renderMat, fatigueMat, crtMat,
            u_time, u_mouse, u_resolution, u_reseed, u_palette, u_geo, u_crt,
            width: grid.width, height: grid.height
        };
    }

    const app = canvas.__three;

    if (app.width !== grid.width || app.height !== grid.height) {
        app.width = grid.width;
        app.height = grid.height;
        app.simRT1.setSize(grid.width, grid.height);
        app.simRT2.setSize(grid.width, grid.height);
        app.fatigueRT1.setSize(grid.width, grid.height);
        app.fatigueRT2.setSize(grid.width, grid.height);
        app.renderRT.setSize(grid.width, grid.height);
        app.u_resolution.value.set(grid.width, grid.height);
        app.renderer.setSize(grid.width, grid.height, false);
    }

    app.u_time.value = time;
    app.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height, mouse.isPressed ? 1 : 0, 0);

    const { renderer, scene, camera, quad } = app;

    quad.material = app.simMat;
    app.simMat.uniforms.u_prev.value = app.simRT1.texture;
    renderer.setRenderTarget(app.simRT2);
    renderer.render(scene, camera);

    quad.material = app.renderMat;
    app.renderMat.uniforms.u_sim.value = app.simRT2.texture;
    renderer.setRenderTarget(app.renderRT);
    renderer.render(scene, camera);

    quad.material = app.fatigueMat;
    app.fatigueMat.uniforms.u_render.value = app.renderRT.texture;
    app.fatigueMat.uniforms.u_prev.value = app.fatigueRT1.texture;
    renderer.setRenderTarget(app.fatigueRT2);
    renderer.render(scene, camera);

    quad.material = app.crtMat;
    app.crtMat.uniforms.u_render.value = app.renderRT.texture;
    app.crtMat.uniforms.u_fatigue.value = app.fatigueRT2.texture;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    let temp = app.simRT1;
    app.simRT1 = app.simRT2;
    app.simRT2 = temp;

    temp = app.fatigueRT1;
    app.fatigueRT1 = app.fatigueRT2;
    app.fatigueRT2 = temp;

    app.u_reseed.value = 0.0;

} catch (e) {
    console.error("Spectral Candy Avalanche Garden Initialization Failed:", e);
    throw e;
}