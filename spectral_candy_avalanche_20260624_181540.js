if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const geometry = new THREE.PlaneGeometry(2, 2);
        const mesh = new THREE.Mesh(geometry);
        scene.add(mesh);

        const getRT = () => new THREE.WebGLRenderTarget(grid.width, grid.height, {
            type: THREE.HalfFloatType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            depthBuffer: false
        });

        const targets = {
            simA: getRT(), simB: getRT(),
            renderFBO: getRT(),
            memA: getRT(), memB: getRT()
        };

        const vs = `
            out vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const oklabGLSL = `
            float cbrt(float x) { return sign(x) * pow(abs(x), 1.0/3.0); }

            vec3 linear_srgb_to_oklab(vec3 c) {
                float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
                float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
                float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
                return vec3(
                    0.2104542553 * cbrt(l) + 0.7936177850 * cbrt(m) - 0.0040720468 * cbrt(s),
                    1.9779984951 * cbrt(l) - 2.4285922050 * cbrt(m) + 0.4505937099 * cbrt(s),
                    0.0259040371 * cbrt(l) + 0.7827717662 * cbrt(m) - 0.8086757660 * cbrt(s)
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
        `;

        const simMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tPrev: { value: null },
                uResolution: { value: new THREE.Vector2(grid.width, grid.height) },
                uMouse: { value: new THREE.Vector2() },
                uMouseDown: { value: 0 },
                uTime: { value: 0 },
                uReseed: { value: 0 }
            },
            vertexShader: vs,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D tPrev;
                uniform vec2 uResolution;
                uniform vec2 uMouse;
                uniform float uMouseDown;
                uniform float uTime;
                uniform float uReseed;

                void main() {
                    vec2 texel = 1.0 / uResolution;
                    float grains = texture(tPrev, vUv).r;
                    
                    float topple = floor(grains / 4.0);
                    float n = floor(texture(tPrev, vUv + vec2(0.0, texel.y)).r / 4.0);
                    float s = floor(texture(tPrev, vUv - vec2(0.0, texel.y)).r / 4.0);
                    float e = floor(texture(tPrev, vUv + vec2(texel.x, 0.0)).r / 4.0);
                    float w = floor(texture(tPrev, vUv - vec2(texel.x, 0.0)).r / 4.0);
                    
                    float next_grains = grains - 4.0 * topple + n + s + e + w;

                    if (uMouseDown > 0.5 && length(vUv - uMouse) < 0.03) {
                        next_grains += 2.0;
                    }
                    
                    vec2 p1 = vec2(0.5 + 0.35 * sin(uTime * 0.7), 0.5 + 0.35 * cos(uTime * 1.1));
                    vec2 p2 = vec2(0.5 + 0.35 * sin(uTime * 1.3), 0.5 + 0.35 * cos(uTime * 0.5));
                    if (length(vUv - p1) < 0.015 || length(vUv - p2) < 0.015) {
                        next_grains += 1.0;
                    }

                    if (uReseed > 0.5) {
                        next_grains = 0.0;
                    }

                    fragColor = vec4(next_grains, 0.0, 0.0, 1.0);
                }
            `
        });

        const renderMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tSim: { value: null },
                uTime: { value: 0 },
                uPalette: { value: 0 },
                uGeomantic: { value: 0 },
                uResolution: { value: new THREE.Vector2(grid.width, grid.height) }
            },
            vertexShader: vs,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D tSim;
                uniform float uTime;
                uniform float uPalette;
                uniform float uGeomantic;
                uniform vec2 uResolution;

                ${oklabGLSL}

                vec3 getPalette(float t, float regime) {
                    float hue = t * 2.39996 + regime * 1.5;
                    float L = 0.65 + 0.15 * sin(t * 3.1415);
                    float C = 0.3;
                    return oklab_to_linear_srgb(vec3(L, C * cos(hue), C * sin(hue)));
                }

                void main() {
                    float grains = texture(tSim, vUv).r;
                    
                    vec2 grid_uv = vUv * 24.0;
                    vec2 id = floor(grid_uv);
                    vec2 gv = fract(grid_uv) - 0.5;
                    float hash = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);

                    float wfc = fract(uTime * 0.06 + vUv.x * 0.2 + vUv.y * 0.1 + hash * 0.2);

                    vec3 color = getPalette(vUv.x + vUv.y * 0.5 + uTime * 0.1, uPalette + 1.0);

                    float entropy = smoothstep(0.0, 0.3, wfc) * (1.0 - smoothstep(0.6, 1.0, wfc));
                    float collapsed = smoothstep(0.4, 0.5, wfc) * (1.0 - smoothstep(0.9, 1.0, wfc));

                    vec3 heatColor = getPalette(hash * 5.0 + uTime * 0.5, uPalette);
                    color = mix(color, heatColor, entropy * 0.7 * (0.5 + 0.5 * sin(hash * 20.0 + uTime * 10.0)));

                    float tile = hash > 0.5 ? 1.0 : -1.0;
                    vec2 arc_uv = gv; arc_uv.x *= tile;
                    float d1 = abs(length(arc_uv - vec2(0.5)) - 0.5);
                    float d2 = abs(length(arc_uv + vec2(0.5)) - 0.5);
                    float arc = smoothstep(0.08, 0.04, min(d1, d2));

                    float dots = 0.0;
                    if (uGeomantic > 0.5) {
                        float row = floor((0.5 - gv.y) * 4.0);
                        if (row >= 0.0 && row <= 3.0) {
                            int bit = int(mod(hash * 16.0 / pow(2.0, row), 2.0));
                            float cy = 0.375 - row * 0.25;
                            if (bit == 0) {
                                dots += smoothstep(0.12, 0.06, length(gv - vec2(0.0, cy)));
                            } else {
                                dots += smoothstep(0.12, 0.06, length(gv - vec2(-0.2, cy)));
                                dots += smoothstep(0.12, 0.06, length(gv - vec2(0.2, cy)));
                            }
                        }
                    }

                    float shape = mix(arc, dots, uGeomantic);
                    vec3 tileColor = getPalette(hash * 10.0, uPalette + 2.0);
                    color = mix(color, tileColor, shape * collapsed);

                    if (grains > 0.0) {
                        float g_norm = clamp(grains, 0.0, 8.0) / 8.0;
                        vec3 sandColor = getPalette(g_norm * 3.0 - uTime * 0.2, uPalette + 3.0);
                        float interference = 0.5 + 0.5 * sin(g_norm * 25.0 - uTime * 4.0);
                        sandColor += interference * vec3(0.2, 0.5, 0.7); 
                        color = mix(color, sandColor, smoothstep(0.0, 0.1, g_norm));
                    }

                    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
                }
            `
        });

        const memMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tRender: { value: null },
                tPrevMem: { value: null }
            },
            vertexShader: vs,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D tRender;
                uniform sampler2D tPrevMem;
                void main() {
                    vec3 current = texture(tRender, vUv).rgb;
                    vec3 prev = texture(tPrevMem, vUv).rgb;
                    fragColor = vec4(mix(prev, current, 0.08), 1.0);
                }
            `
        });

        const postMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                tRender: { value: null },
                tMem: { value: null },
                uResolution: { value: new THREE.Vector2(grid.width, grid.height) },
                uCRT: { value: 1.0 }
            },
            vertexShader: vs,
            fragmentShader: `
                in vec2 vUv;
                out vec4 fragColor;
                uniform sampler2D tRender;
                uniform sampler2D tMem;
                uniform vec2 uResolution;
                uniform float uCRT;

                ${oklabGLSL}

                void main() {
                    vec2 cc = vUv - 0.5;
                    float r2 = dot(cc, cc);
                    vec2 crt_uv = vUv + cc * (r2 * 0.15 * uCRT);

                    if (crt_uv.x < 0.0 || crt_uv.x > 1.0 || crt_uv.y < 0.0 || crt_uv.y > 1.0) {
                        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
                        return;
                    }

                    float ca = 0.004 * uCRT;
                    vec3 render;
                    render.r = texture(tRender, crt_uv + vec2(ca, 0.0)).r;
                    render.g = texture(tRender, crt_uv).g;
                    render.b = texture(tRender, crt_uv - vec2(ca, 0.0)).b;

                    vec3 fatigue = texture(tMem, crt_uv).rgb;
                    vec3 fat_ok = linear_srgb_to_oklab(fatigue);
                    fat_ok.y = -fat_ok.y;
                    fat_ok.z = -fat_ok.z;
                    fat_ok.x = clamp(fat_ok.x * 1.3 + 0.05, 0.0, 1.0);
                    vec3 ghost = oklab_to_linear_srgb(fat_ok);

                    vec3 final = render + ghost * 0.5;

                    if (uCRT > 0.5) {
                        float scanlines = 0.9 + 0.1 * sin(crt_uv.y * uResolution.y * 3.1415);
                        float mask = 0.95 + 0.05 * sin(crt_uv.x * uResolution.x * 3.1415);
                        final *= scanlines * mask;
                    }

                    vec2 texel = 1.0 / uResolution;
                    vec3 bloom = vec3(0.0);
                    bloom += texture(tRender, crt_uv + vec2(texel.x*3.0, 0.0)).rgb;
                    bloom += texture(tRender, crt_uv - vec2(texel.x*3.0, 0.0)).rgb;
                    bloom += texture(tRender, crt_uv + vec2(0.0, texel.y*3.0)).rgb;
                    bloom += texture(tRender, crt_uv - vec2(0.0, texel.y*3.0)).rgb;
                    final += bloom * 0.15;

                    float vig = 1.0 - 0.5 * r2;
                    final *= vig;

                    final = (final * (2.51 * final + 0.03)) / (final * (2.43 * final + 0.59) + 0.14);

                    fragColor = vec4(clamp(final, 0.0, 1.0), 1.0);
                }
            `
        });

        canvas.__three = { renderer, scene, camera, mesh, targets, materials: { simMat, renderMat, memMat, postMat } };

        if (canvas.__keyHandler) {
            window.removeEventListener('keydown', canvas.__keyHandler);
            window.removeEventListener('keyup', canvas.__keyUpHandler);
        }
        canvas.__keys = { palette: 0, geomantic: 0, crt: 1, reseed: 0 };
        canvas.__keyHandler = (e) => {
            const k = e.key.toLowerCase();
            if (k === 'c') canvas.__keys.palette = (canvas.__keys.palette + 1) % 5;
            if (k === 'g') canvas.__keys.geomantic = 1 - canvas.__keys.geomantic;
            if (k === 'p') canvas.__keys.crt = 1 - canvas.__keys.crt;
            if (k === ' ') canvas.__keys.reseed = 1.0;
        };
        canvas.__keyUpHandler = (e) => {
            if (e.key === ' ') canvas.__keys.reseed = 0.0;
        };
        window.addEventListener('keydown', canvas.__keyHandler);
        window.addEventListener('keyup', canvas.__keyUpHandler);
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        return;
    }
}

const { renderer, scene, camera, mesh, targets, materials } = canvas.__three;
const { simMat, renderMat, memMat, postMat } = materials;

if (targets.simA.width !== grid.width || targets.simA.height !== grid.height) {
    Object.values(targets).forEach(rt => rt.setSize(grid.width, grid.height));
    simMat.uniforms.uResolution.value.set(grid.width, grid.height);
    renderMat.uniforms.uResolution.value.set(grid.width, grid.height);
    postMat.uniforms.uResolution.value.set(grid.width, grid.height);
    renderer.setSize(grid.width, grid.height, false);
}

simMat.uniforms.uTime.value = time;
simMat.uniforms.uMouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
simMat.uniforms.uMouseDown.value = mouse.isPressed ? 1.0 : 0.0;
simMat.uniforms.uReseed.value = canvas.__keys.reseed;

renderMat.uniforms.uTime.value = time;
renderMat.uniforms.uPalette.value = canvas.__keys.palette;
renderMat.uniforms.uGeomantic.value = canvas.__keys.geomantic;

postMat.uniforms.uCRT.value = canvas.__keys.crt;

// 1. Sim Pass
simMat.uniforms.tPrev.value = targets.simA.texture;
mesh.material = simMat;
renderer.setRenderTarget(targets.simB);
renderer.render(scene, camera);

// 2. Render Pass
renderMat.uniforms.tSim.value = targets.simB.texture;
mesh.material = renderMat;
renderer.setRenderTarget(targets.renderFBO);
renderer.render(scene, camera);

// 3. Memory Pass
memMat.uniforms.tRender.value = targets.renderFBO.texture;
memMat.uniforms.tPrevMem.value = targets.memA.texture;
mesh.material = memMat;
renderer.setRenderTarget(targets.memB);
renderer.render(scene, camera);

// 4. Post Pass
postMat.uniforms.tRender.value = targets.renderFBO.texture;
postMat.uniforms.tMem.value = targets.memB.texture;
mesh.material = postMat;
renderer.setRenderTarget(null);
renderer.render(scene, camera);

// Ping-Pong
let temp = targets.simA; targets.simA = targets.simB; targets.simB = temp;
temp = targets.memA; targets.memA = targets.memB; targets.memB = temp;