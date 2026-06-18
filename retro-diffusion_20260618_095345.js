if (!canvas.__failedWebGL && !canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL context not available");

        const renderer = new THREE.WebGLRenderer({ canvas: canvas, context: ctx, alpha: true, antialias: false });
        renderer.autoClear = false;
        
        const rtOptions = {
            type: THREE.FloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            depthBuffer: false,
            stencilBuffer: false
        };
        
        const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
        const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const scene = new THREE.Scene();
        const geometry = new THREE.PlaneGeometry(2, 2);

        const simMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_tex: { value: null },
                u_res: { value: new THREE.Vector2(grid.width, grid.height) },
                u_time: { value: 0 },
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
                in vec2 vUv;
                out vec4 fragColor;
                
                uniform sampler2D u_tex;
                uniform vec2 u_res;
                uniform float u_time;
                uniform vec2 u_mouse;

                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                }

                void main() {
                    vec2 px = 1.0 / u_res;
                    vec2 state = texture(u_tex, vUv).rg;
                    
                    vec2 n = texture(u_tex, vUv + vec2(0.0, px.y)).rg;
                    vec2 s = texture(u_tex, vUv - vec2(0.0, px.y)).rg;
                    vec2 e = texture(u_tex, vUv + vec2(px.x, 0.0)).rg;
                    vec2 w = texture(u_tex, vUv - vec2(px.x, 0.0)).rg;
                    vec2 ne = texture(u_tex, vUv + vec2(px.x, px.y)).rg;
                    vec2 nw = texture(u_tex, vUv + vec2(-px.x, px.y)).rg;
                    vec2 se = texture(u_tex, vUv + vec2(px.x, -px.y)).rg;
                    vec2 sw = texture(u_tex, vUv + vec2(-px.x, -px.y)).rg;

                    // Isotropic Laplacian for Inhibitor (V)
                    vec2 lap = (n + s + e + w) * 0.2 + (ne + nw + se + sw) * 0.05 - state;
                    
                    // Anisotropic Laplacian for Activator (U) - Retrofuturistic Racing Stripes
                    vec2 lap_aniso = (e + w) * 0.3 + (n + s) * 0.1 + (ne + nw + se + sw) * 0.05 - state;

                    float u = state.r;
                    float v = state.g;
                    float uvv = u * v * v;

                    // Morphogenesis Beyond Gray-Scott: Cyclic Symmetry Fold Parameter Map
                    vec2 c = vUv - 0.5;
                    float r = length(c);
                    float a = atan(c.y, c.x);
                    
                    // 7-fold alien cyclic symmetry
                    float sym = sin(a * 7.0 + u_time * 0.5) * cos(a * 3.0 - u_time * 0.3);

                    // Pearson types mapped spatially
                    float F = 0.024 + 0.015 * sym * r;
                    float K = 0.053 + 0.012 * sin(r * 25.0 - u_time * 0.8);

                    // Reaction-Diffusion Update
                    float du = 0.20 * lap_aniso.r - uvv + F * (1.0 - u);
                    float dv = 0.10 * lap.g + uvv - (F + K) * v;

                    float nextU = clamp(u + du, 0.0, 1.0);
                    float nextV = clamp(v + dv, 0.0, 1.0);

                    // Seed initialization and continuous injection
                    if (u_time < 0.1) {
                        nextU = 1.0;
                        nextV = (hash(vUv * 50.0) > 0.99) ? 0.5 : 0.0;
                        if (abs(r - 0.2) < 0.02) nextV = 0.8;
                    }
                    
                    // Slime mold / interactive coupling
                    float dist = length(vUv - u_mouse);
                    if (dist < 0.03) {
                        nextV += 0.2 * exp(-dist * 100.0);
                    }
                    
                    // Wandering attractor (Mythic Attractor logic)
                    vec2 attractor = vec2(0.5) + vec2(cos(u_time * 0.7), sin(u_time * 1.1)) * 0.35;
                    if (length(vUv - attractor) < 0.02) {
                        nextV += 0.1;
                    }

                    fragColor = vec4(nextU, nextV, 0.0, 1.0);
                }
            `
        });

        const displayMaterial = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_tex: { value: null },
                u_res: { value: new THREE.Vector2(grid.width, grid.height) },
                u_time: { value: 0 }
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
                
                uniform sampler2D u_tex;
                uniform vec2 u_res;
                uniform float u_time;

                // Color Systems Repo: OKLab to sRGB perceptual mapping
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

                    vec3 srgb;
                    srgb.r = rgb.r <= 0.0031308 ? rgb.r * 12.92 : 1.055 * pow(max(rgb.r, 0.0), 1.0/2.4) - 0.055;
                    srgb.g = rgb.g <= 0.0031308 ? rgb.g * 12.92 : 1.055 * pow(max(rgb.g, 0.0), 1.0/2.4) - 0.055;
                    srgb.b = rgb.b <= 0.0031308 ? rgb.b * 12.92 : 1.055 * pow(max(rgb.b, 0.0), 1.0/2.4) - 0.055;
                    return srgb;
                }

                vec3 getPaletteColor(float v, float spec) {
                    // Deep saturated void (Indigo)
                    vec3 oklab_void = vec3(0.40, 0.10, -0.15);
                    // Mid frequency (Hot Magenta)
                    vec3 oklab_mid  = vec3(0.60, 0.25, -0.05);
                    // Peak frequency (Neon Orange)
                    vec3 oklab_peak = vec3(0.75, 0.15, 0.15);

                    vec3 oklab_col = mix(oklab_void, oklab_mid, smoothstep(0.1, 0.4, v));
                    oklab_col = mix(oklab_col, oklab_peak, smoothstep(0.4, 0.7, v));

                    vec3 rgb = oklab_to_srgb(oklab_col);

                    // 1970s Paperback Sci-Fi: Chrome Specular Acid Green (NO WHITE)
                    vec3 specColor = oklab_to_srgb(vec3(0.80, -0.20, 0.15));
                    rgb += specColor * spec * 2.0 * smoothstep(0.15, 0.6, v);

                    return rgb;
                }

                void main() {
                    vec2 px = 1.0 / u_res;
                    float v = texture(u_tex, vUv).g;
                    
                    // The Lists: Fractal Optics / Chromatic Glitch Offset
                    float v_offset = texture(u_tex, vUv + vec2(px.x * 6.0, px.y * 3.0)).g;

                    // Faux Normals from Morphogenesis field
                    float vn = texture(u_tex, vUv + vec2(0.0, px.y)).g;
                    float vs = texture(u_tex, vUv - vec2(0.0, px.y)).g;
                    float ve = texture(u_tex, vUv + vec2(px.x, 0.0)).g;
                    float vw = texture(u_tex, vUv - vec2(px.x, 0.0)).g;

                    vec3 normal = normalize(vec3(ve - vw, vn - vs, 0.08));

                    // 1970s Sci-Fi Anisotropic Chrome Specular
                    vec3 lightDir = normalize(vec3(0.6, 0.6, 1.0));
                    vec3 viewDir = vec3(0.0, 0.0, 1.0);
                    vec3 H = normalize(lightDir + viewDir);

                    float NdotH = max(0.0, dot(normal, H));
                    float ax = 0.12; 
                    float ay = 0.75; // Horizontal smear
                    float spec = exp(-pow(acos(NdotH), 2.0) * ( (normal.x*normal.x)/(ax*ax) + (normal.y*normal.y)/(ay*ay) ));
                    spec = max(0.0, spec);

                    // Apply Chromatic Aberration to Palette
                    vec3 col1 = getPaletteColor(v, spec);
                    vec3 col2 = getPaletteColor(v_offset, spec);
                    vec3 color = vec3(col1.r, mix(col1.g, col2.g, 0.5), col2.b);

                    // Pixel_Voxel Repo: Ordered Ditherpunk (Bayer 4x4)
                    int bx = int(gl_FragCoord.x) % 4;
                    int by = int(gl_FragCoord.y) % 4;
                    float bayer[16] = float[16](
                        0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
                       12.0/16.0,  4.0/16.0, 14.0/16.0,  6.0/16.0,
                        3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,
                       15.0/16.0,  7.0/16.0, 13.0/16.0,  5.0/16.0
                    );
                    float dither = bayer[by * 4 + bx] - 0.5;

                    color += dither * 0.25;
                    
                    // Quantize to 8 tone levels to force pixel-art style
                    color = floor(color * 8.0) / 8.0;

                    // DIRECTIVE: NO WHITE NO BLACK - FULL COLOR ONLY
                    color = clamp(color, vec3(0.15), vec3(0.85));

                    fragColor = vec4(color, 1.0);
                }
            `
        });

        const mesh = new THREE.Mesh(geometry, displayMaterial);
        scene.add(mesh);

        canvas.__three = { renderer, scene, camera, mesh, simMaterial, displayMaterial, rtA, rtB, frame: 0 };
    } catch (e) {
        canvas.__failedWebGL = true;
    }
}

if (!canvas.__failedWebGL && canvas.__three) {
    const t = canvas.__three;

    if (t.rtA.width !== grid.width || t.rtA.height !== grid.height) {
        t.renderer.setSize(grid.width, grid.height, false);
        t.rtA.setSize(grid.width, grid.height);
        t.rtB.setSize(grid.width, grid.height);
        t.simMaterial.uniforms.u_res.value.set(grid.width, grid.height);
        t.displayMaterial.uniforms.u_res.value.set(grid.width, grid.height);
        t.frame = 0; 
    }

    t.simMaterial.uniforms.u_time.value = time;
    t.displayMaterial.uniforms.u_time.value = time;
    
    let mx = mouse.x / grid.width;
    let my = 1.0 - (mouse.y / grid.height);
    t.simMaterial.uniforms.u_mouse.value.set(mx, my);

    t.mesh.material = t.simMaterial;
    for (let i = 0; i < 10; i++) {
        const read = (t.frame % 2 === 0) ? t.rtA : t.rtB;
        const write = (t.frame % 2 === 0) ? t.rtB : t.rtA;

        t.simMaterial.uniforms.u_tex.value = read.texture;
        t.renderer.setRenderTarget(write);
        t.renderer.render(t.scene, t.camera);
        t.frame++;
    }

    t.mesh.material = t.displayMaterial;
    t.displayMaterial.uniforms.u_tex.value = (t.frame % 2 === 0) ? t.rtA.texture : t.rtB.texture;
    t.renderer.setRenderTarget(null);
    t.renderer.render(t.scene, t.camera);
} else {
    // 2D Canvas Fallback (No Black, No White, Full Color Physarum/Morphogenesis simulation)
    if (!canvas.__fallbackState || canvas.__fallbackState.w !== grid.width || canvas.__fallbackState.h !== grid.height) {
        canvas.__fallbackState = {
            w: grid.width,
            h: grid.height,
            agents: Array.from({ length: 2000 }, () => ({
                x: Math.random() * grid.width,
                y: Math.random() * grid.height,
                angle: Math.random() * Math.PI * 2,
                color: `hsl(${Math.random() * 60 + 280}, 100%, 50%)` // Magenta to Orange
            }))
        };
        ctx.fillStyle = "#4a0080"; // Deep purple void
        ctx.fillRect(0, 0, grid.width, grid.height);
    }

    const state = canvas.__fallbackState;
    
    // Slime mold / Differential growth trails
    ctx.fillStyle = "rgba(74, 0, 128, 0.05)"; // Fade to purple (no black)
    ctx.fillRect(0, 0, grid.width, grid.height);

    const cx = grid.width / 2;
    const cy = grid.height / 2;

    for (let i = 0; i < state.agents.length; i++) {
        let a = state.agents[i];
        
        // Cyclic symmetry flow field
        let dx = a.x - cx;
        let dy = a.y - cy;
        let r = Math.sqrt(dx*dx + dy*dy);
        let ang = Math.atan2(dy, dx);
        
        let targetAngle = ang + Math.sin(r * 0.05 - time * 2.0) * 2.0 + Math.cos(ang * 7.0) * 1.5;
        
        a.angle += (targetAngle - a.angle) * 0.1;
        
        if (mouse.isPressed) {
            let mdx = mouse.x - a.x;
            let mdy = mouse.y - a.y;
            a.angle = Math.atan2(mdy, mdx);
        }

        a.x += Math.cos(a.angle) * 2.0;
        a.y += Math.sin(a.angle) * 2.0;

        if (a.x < 0) a.x = grid.width;
        if (a.x > grid.width) a.x = 0;
        if (a.y < 0) a.y = grid.height;
        if (a.y > grid.height) a.y = 0;

        ctx.fillStyle = a.color;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
}