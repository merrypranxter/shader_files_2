// Phosphor Signal Reef Engine
// A WebGL2 / Three.js Generative Artwork
// Integrating: crt_phosphor_fx, demoscene_oldskool, halftone_mosaic, datamosh, 
// chromatic_aberration, anamorphic_lens_flares, cuttlefish_chromatics, color_systems, 
// glitchcore_style, early_internet_aesthetic, damage_aesthetics, sacred_geometry, 
// THE-LISTS, mycelial_networks.

function initPhosphorSignalReefEngine(ctx, grid, time, repos, input, mouse, canvas, THREE) {
    if (!canvas.__three) {
        try {
            if (!ctx) throw new Error("WebGL2 context not available");

            const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.setSize(grid.width, grid.height, false);

            const scene = new THREE.Scene();
            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

            // Ping-Pong FBOs for Temporal Echo, Datamosh, and Cuttlefish/Mycelial Feedback
            const fboOptions = {
                type: THREE.HalfFloatType,
                format: THREE.RGBAFormat,
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                wrapS: THREE.ClampToEdgeWrapping,
                wrapT: THREE.ClampToEdgeWrapping,
                depthBuffer: false,
                stencilBuffer: false
            };
            
            const targetA = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOptions);
            const targetB = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOptions);

            // --------------------------------------------------------------------------------
            // SHARED GLSL CHUNKS (Color Systems, OKLab, Math)
            // --------------------------------------------------------------------------------
            const glslMathAndColor = `
                #define PI 3.14159265359
                #define TAU 6.28318530718
                #define PHI 1.61803398875
                #define GOLDEN_ANGLE 2.39996322973

                // OKLab Conversions (color_systems)
                vec3 linear_srgb_to_oklab(vec3 c) {
                    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
                    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
                    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
                    float l_ = pow(l, 1.0/3.0);
                    float m_ = pow(m, 1.0/3.0);
                    float s_ = pow(s, 1.0/3.0);
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

                vec3 oklch_to_srgb(float L, float C, float h) {
                    vec3 lab = vec3(L, C * cos(h), C * sin(h));
                    vec3 lin = oklab_to_linear_srgb(lab);
                    // Gamma correction
                    vec3 s1 = lin * 12.92;
                    vec3 s2 = 1.055 * pow(max(lin, vec3(0.0)), vec3(1.0/2.4)) - 0.055;
                    return mix(s1, s2, step(0.0031308, lin));
                }

                // PRNG & Noise (THE-LISTS & damage_aesthetics)
                float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
                float noise(vec2 p) {
                    vec2 i = floor(p), f = fract(p);
                    vec2 u = f*f*(3.0-2.0*f);
                    return mix(mix(hash(i+vec2(0.0,0.0)), hash(i+vec2(1.0,0.0)), u.x),
                               mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y);
                }
                float fbm(vec2 p) {
                    float v = 0.0, a = 0.5;
                    for(int i=0; i<4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
                    return v;
                }
            `;

            // --------------------------------------------------------------------------------
            // BUFFER SHADER: The "Engine" (Datamosh, Cuttlefish, Mycelial, Sacred Geometry)
            // --------------------------------------------------------------------------------
            const bufferMaterial = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_time: { value: 0 },
                    u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                    u_prevFrame: { value: null }
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
                    
                    uniform float u_time;
                    uniform vec2 u_resolution;
                    uniform sampler2D u_prevFrame;

                    ${glslMathAndColor}

                    // Sacred Geometry: Hexagram / Merkaba (sacred_geometry)
                    float sdHexagram(vec2 p, float r) {
                        const vec4 k = vec4(-0.5, 0.8660254038, 0.5773502692, 1.7320508076);
                        p = abs(p);
                        p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
                        p -= 2.0 * min(dot(k.yx, p), 0.0) * k.yx;
                        p -= vec2(clamp(p.x, r * k.z, r * k.w), r);
                        return length(p) * sign(p.y);
                    }

                    // Seed of Life (sacred_geometry)
                    float seedOfLife(vec2 p, float r) {
                        float d = abs(length(p) - r);
                        for(int i=0; i<6; i++) {
                            float ang = float(i) * PI / 3.0 + u_time * 0.2;
                            vec2 c = vec2(cos(ang), sin(ang)) * r;
                            d = min(d, abs(length(p - c) - r));
                        }
                        return d;
                    }

                    void main() {
                        vec2 p = (vUv - 0.5) * (u_resolution / u_resolution.y);
                        float t = u_time;

                        // 1. DATAMOSH & COMPRESSION DAMAGE (datamosh, damage_aesthetics)
                        // Create macroblock grid for motion vectors
                        vec2 block_uv = floor(vUv * 32.0) / 32.0;
                        vec2 flow = vec2(
                            fbm(block_uv * 5.0 + t * 0.5) - 0.5,
                            fbm(block_uv * 5.0 - t * 0.5 + 10.0) - 0.5
                        ) * 0.015;
                        
                        // Horizontal tearing (glitchcore_style)
                        float tear = step(0.98, noise(vec2(vUv.y * 50.0, t * 10.0))) * 0.03;
                        flow.x += tear * sign(sin(t * 20.0));

                        // Demoscene temporal zoom / scroll (demoscene_oldskool)
                        vec2 prev_uv = vUv - flow - (vUv - 0.5) * 0.005;
                        vec3 prev_col = texture(u_prevFrame, prev_uv).rgb;
                        
                        // Chromatic dark feedback decay (No black void)
                        vec3 dark_plum = oklch_to_srgb(0.2, 0.15, 5.5); // Deep Indigo/Plum
                        prev_col = mix(prev_col, dark_plum, 0.04); 

                        // 2. CUTTLEFISH CHROMATOPHORES (cuttlefish_chromatics)
                        // Cellular skin that expands/contracts
                        vec2 cell_uv = p * 25.0;
                        vec2 id = floor(cell_uv);
                        vec2 f_uv = fract(cell_uv) - 0.5;
                        float activation = sin(id.x * 12.3 + id.y * 45.6 + t * 3.0) * 0.5 + 0.5;
                        float chrom_r = 0.15 * (1.0 + 1.24 * activation);
                        float chrom_d = length(f_uv);
                        float chromatophore = smoothstep(chrom_r, chrom_r - 0.05, chrom_d);
                        
                        // Vibrant Palette (color_systems)
                        vec3 chrom_col1 = oklch_to_srgb(0.7, 0.25, 6.0); // Hot Pink
                        vec3 chrom_col2 = oklch_to_srgb(0.8, 0.2, 2.5);  // Acid Green
                        vec3 chrom_color = mix(chrom_col1, chrom_col2, noise(id * 0.1 + t));
                        
                        // 3. MYCELIAL NETWORKS (mycelial_networks)
                        // Branching veins growing outward
                        float r_polar = length(p);
                        float a_polar = atan(p.y, p.x);
                        float mycelium = fbm(vec2(a_polar * 3.0, r_polar * 10.0 - t * 2.0));
                        mycelium = smoothstep(0.6, 0.7, mycelium) * exp(-r_polar * 3.0);
                        vec3 myc_color = oklch_to_srgb(0.85, 0.15, 1.2); // Golden Yellow

                        // 4. SACRED GEOMETRY ANCHOR (sacred_geometry)
                        // Rotating Merkaba (Hexagram)
                        float rot = t * 0.5;
                        vec2 p_rot = vec2(cos(rot)*p.x - sin(rot)*p.y, sin(rot)*p.x + cos(rot)*p.y);
                        float hex_d = sdHexagram(p_rot, 0.3);
                        float hex_line = smoothstep(0.01, 0.002, abs(hex_d));
                        
                        // Seed of life pulsing
                        float seed_d = seedOfLife(p, 0.4 + 0.05 * sin(t * PHI));
                        float seed_line = smoothstep(0.01, 0.002, seed_d);

                        vec3 sacred_color = oklch_to_srgb(0.9, 0.2, 3.5); // Electric Cyan

                        // 5. EARLY INTERNET AESTHETIC DEBRIS (early_internet_aesthetic)
                        // Random popping UI rectangles
                        float ui_box = max(abs(p.x - sin(t)*0.5), abs(p.y - cos(t*1.3)*0.3));
                        float ui_line = smoothstep(0.1, 0.095, ui_box) * smoothstep(0.09, 0.095, ui_box);
                        ui_line *= step(0.95, hash(vec2(floor(t * 4.0)))); // flicker
                        vec3 ui_color = oklch_to_srgb(0.7, 0.25, 0.5); // Orange

                        // COMPOSITE (Maximalist Additive Energy)
                        vec3 final_col = prev_col;
                        final_col = mix(final_col, chrom_color, chromatophore * 0.6);
                        final_col += myc_color * mycelium;
                        final_col += sacred_color * (hex_line + seed_line) * 2.0;
                        final_col += ui_color * ui_line;

                        fragColor = vec4(final_col, 1.0);
                    }
                `
            });

            // --------------------------------------------------------------------------------
            // SCREEN SHADER: The "Lens/Display" (CRT, Flares, Halftone, Chromatic Aberration)
            // --------------------------------------------------------------------------------
            const screenMaterial = new THREE.ShaderMaterial({
                glslVersion: THREE.GLSL3,
                uniforms: {
                    u_time: { value: 0 },
                    u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                    u_buffer: { value: null }
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
                    
                    uniform float u_time;
                    uniform vec2 u_resolution;
                    uniform sampler2D u_buffer;

                    ${glslMathAndColor}

                    void main() {
                        vec2 uv = vUv;
                        vec2 p = (uv - 0.5) * 2.0; // -1 to 1

                        // 1. CRT BARREL DISTORTION (crt_phosphor_fx)
                        float barrel = length(p) * length(p) * 0.05;
                        vec2 crt_uv = uv + p * barrel;

                        // 2. CHROMATIC ABERRATION (chromatic_aberration)
                        // Radial split based on distance from center
                        vec2 dir = normalize(p);
                        float dist = length(p);
                        float ca_amt = 0.015 * dist + 0.005 * sin(u_time * 5.0);
                        
                        vec3 col;
                        col.r = texture(u_buffer, crt_uv + dir * ca_amt).r;
                        col.g = texture(u_buffer, crt_uv).g;
                        col.b = texture(u_buffer, crt_uv - dir * ca_amt).b;

                        // 3. ANAMORPHIC LENS FLARES (anamorphic_lens_flares)
                        // Horizontal blur of bright thresholds
                        vec3 flare = vec3(0.0);
                        float flare_weight = 0.0;
                        for(float i = -1.0; i <= 1.0; i += 0.05) {
                            vec2 samp_uv = crt_uv + vec2(i * 0.15, 0.0);
                            if(samp_uv.x > 0.0 && samp_uv.x < 1.0) {
                                vec3 samp = texture(u_buffer, samp_uv).rgb;
                                float lum = dot(samp, vec3(0.333));
                                if(lum > 0.6) {
                                    float w = exp(-abs(i) * 3.0);
                                    flare += samp * w;
                                    flare_weight += w;
                                }
                            }
                        }
                        if(flare_weight > 0.0) {
                            flare /= flare_weight;
                            // Tint flare Cyan/Magenta
                            vec3 flare_tint = oklch_to_srgb(0.8, 0.2, 4.5 + sin(u_time));
                            col += flare * flare_tint * 0.6;
                        }

                        // 4. HALFTONE MOSAIC (halftone_mosaic)
                        // Apply dot pattern to midtones
                        float lum = dot(col, vec3(0.333));
                        float ht_size = u_resolution.x * 0.2; // Density
                        vec2 ht_uv = fract(crt_uv * ht_size) - 0.5;
                        float ht_dot = length(ht_uv);
                        float ht_mask = smoothstep(lum * 0.6, lum * 0.6 - 0.1, ht_dot);
                        
                        // Inject vivid halftone colors (Magenta/Yellow)
                        vec3 ht_color = oklch_to_srgb(0.7, 0.25, 0.5 + lum * PI);
                        if(lum > 0.2 && lum < 0.8) {
                            col = mix(col, ht_color, ht_mask * 0.3);
                        }

                        // 5. CRT PHOSPHOR FX (crt_phosphor_fx)
                        // Subpixel triad mask
                        float triad = mod(gl_FragCoord.x, 3.0);
                        vec3 phosphor_mask = vec3(
                            step(triad, 1.0),
                            step(1.0, triad) * step(triad, 2.0),
                            step(2.0, triad)
                        );
                        phosphor_mask = mix(vec3(1.0), phosphor_mask, 0.25); // Soften mask
                        
                        // Scanlines
                        float scanline = sin(crt_uv.y * u_resolution.y * PI * 0.5) * 0.1 + 0.9;
                        col *= phosphor_mask * scanline;

                        // Tube Vignette
                        float vig = smoothstep(1.2, 0.5, length(p));
                        col *= vig;

                        // 6. COLOR SAFETY & ENHANCEMENT (glitchcore_style / color_systems)
                        // NO BLACK / NO WHITE LAW.
                        // Convert to OKLab to check lightness and inject chroma
                        vec3 oklab = linear_srgb_to_oklab(col);
                        
                        // If too dark, inject Deep Ultraviolet / Indigo
                        if (oklab.x < 0.25) {
                            float boost = smoothstep(0.25, 0.0, oklab.x);
                            vec3 deep_color = oklch_to_srgb(0.3, 0.2, 5.0); 
                            col = mix(col, deep_color, boost);
                        }
                        
                        // If too bright/white, inject Neon Cyan or Hot Pink
                        if (oklab.x > 0.85) {
                            float boost = smoothstep(0.85, 1.0, oklab.x);
                            vec3 hot_color = oklch_to_srgb(0.85, 0.2, 6.0 + sin(u_time));
                            col = mix(col, hot_color, boost);
                        }

                        // Final saturation boost to ensure it's "Ultra colorful"
                        col = mix(vec3(dot(col, vec3(0.333))), col, 1.3);
                        col = clamp(col, 0.0, 1.0);

                        fragColor = vec4(col, 1.0);
                    }
                `
            });

            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
            scene.add(mesh);

            canvas.__three = { renderer, scene, camera, bufferMaterial, screenMaterial, mesh, targetA, targetB, toggle: true };
        } catch (e) {
            console.error("WebGL Initialization Failed:", e);
            return;
        }
    }

    const { renderer, scene, camera, bufferMaterial, screenMaterial, mesh, targetA, targetB } = canvas.__three;

    // Handle Resize
    if (renderer.domElement.width !== grid.width || renderer.domElement.height !== grid.height) {
        renderer.setSize(grid.width, grid.height, false);
        targetA.setSize(grid.width, grid.height);
        targetB.setSize(grid.width, grid.height);
        bufferMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
        screenMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
    }

    // Determine ping-pong state
    const readTarget = canvas.__three.toggle ? targetA : targetB;
    const writeTarget = canvas.__three.toggle ? targetB : targetA;

    // Update Buffer Uniforms
    if (bufferMaterial && bufferMaterial.uniforms && bufferMaterial.uniforms.u_time) {
        bufferMaterial.uniforms.u_time.value = time;
        bufferMaterial.uniforms.u_prevFrame.value = readTarget.texture;
    }

    // PASS 1: Render Engine/Buffer
    mesh.material = bufferMaterial;
    renderer.setRenderTarget(writeTarget);
    renderer.render(scene, camera);

    // Update Screen Uniforms
    if (screenMaterial && screenMaterial.uniforms && screenMaterial.uniforms.u_time) {
        screenMaterial.uniforms.u_time.value = time;
        screenMaterial.uniforms.u_buffer.value = writeTarget.texture;
    }

    // PASS 2: Render to Screen
    mesh.material = screenMaterial;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    // Swap buffers for next frame
    canvas.__three.toggle = !canvas.__three.toggle;
}