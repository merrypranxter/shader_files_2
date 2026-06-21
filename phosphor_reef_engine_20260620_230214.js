:Phosphor Signal Reef Engine:phosphor_signal_reef.js
/**
 * Phosphor Signal Reef Engine
 * 
 * ALCHEMICAL & BIOLOGICAL SYSTEM MATRIX:
 * 1. CRT PHOSPHOR FX (crt_phosphor_fx): Emissive subpixel RGB triads, scanline grids, and damper wire shadows.
 * 2. DEMOSCENE SPECTACLE (demoscene_oldskool): A real-time raymarched torus-box fusion reactor.
 * 3. HALFTONE MOSAIC (halftone_mosaic): Dynamic CMYK-style dot-screening layer that reacts to luma.
 * 4. DATAMOSH SMEAR (datamosh): Temporal motion-vector coordinate displacement.
 * 5. CHROMATIC ABERRATION (chromatic_aberration): Radial refractive spectral channel splitting.
 * 6. ANAMORPHIC FLARES (anamorphic_lens_flares): Kinetic horizontal rainbow light beams.
 * 7. CUTTLEFISH CHROMATOPHORES (cuttlefish_chromatics): A live, muscle-actuated cellular pigment grid.
 * 8. GLITCHCORE INTERFACE DEBRIS (glitchcore_style): Asemic window frames and pixel glyph shards.
 * 9. COLOR SYSTEMS (color_systems): Perceptually uniform OKLab colorspace blending for all gradients.
 */

// Ensure the Three.js namespace is clean and reusable
if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        const scene = new THREE.Scene();
        
        // Orthographic camera for fullscreen shader pass
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Custom Shader Material using GLSL 3.0
        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
                u_intensity: { value: 0.7 },
                u_halftone_scale: { value: 24.0 },
                u_datamosh_strength: { value: 0.05 },
                u_chromatic_spread: { value: 0.02 }
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
                uniform vec2  u_resolution;
                uniform vec2  u_mouse;
                uniform float u_intensity;
                uniform float u_halftone_scale;
                uniform float u_datamosh_strength;
                uniform float u_chromatic_spread;

                const float PI = 3.14159265359;
                const float TAU = 6.28318530718;

                // ─── OKLAB PERCEPTUAL COLOR MATH ───
                vec3 linearSRGB_to_OKLab(vec3 c) {
                    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
                    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
                    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
                    float l_ = pow(max(l, 0.0), 1.0/3.0);
                    float m_ = pow(max(m, 0.0), 1.0/3.0);
                    float s_ = pow(max(s, 0.0), 1.0/3.0);
                    return vec3(
                        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
                        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
                        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
                    );
                }

                vec3 OKLab_to_linearSRGB(vec3 c) {
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

                float sRGB_to_linear(float x) {
                    return x <= 0.04045 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4);
                }

                float linear_to_sRGB(float x) {
                    return x <= 0.0031308 ? x * 12.92 : 1.055 * pow(max(x, 0.0), 1.0/2.4) - 0.055;
                }

                vec3 sRGB_to_OKLab(vec3 c) {
                    vec3 lin = vec3(sRGB_to_linear(c.r), sRGB_to_linear(c.g), sRGB_to_linear(c.b));
                    return linearSRGB_to_OKLab(lin);
                }

                vec3 OKLab_to_sRGB(vec3 c) {
                    vec3 lin = OKLab_to_linearSRGB(c);
                    return vec3(linear_to_sRGB(lin.r), linear_to_sRGB(lin.g), linear_to_sRGB(lin.b));
                }

                vec3 oklabMix(vec3 colA, vec3 colB, float t) {
                    vec3 labA = sRGB_to_OKLab(colA);
                    vec3 labB = sRGB_to_OKLab(colB);
                    return OKLab_to_sRGB(mix(labA, labB, t));
                }

                // ─── NOISE & HARMONIC FIELDS ───
                float hash21(vec2 p) {
                    p = fract(p * vec2(123.34, 456.21));
                    p += dot(p, p + 45.32);
                    return fract(p.x * p.y);
                }

                vec2 hash22(vec2 p) {
                    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
                    return fract(sin(p) * 43758.5453);
                }

                float noise2d(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    float a = hash21(i + vec2(0.0, 0.0));
                    float b = hash21(i + vec2(1.0, 0.0));
                    float c = hash21(i + vec2(0.0, 1.0));
                    float d = hash21(i + vec2(1.0, 1.0));
                    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
                }

                float fbm2d(vec2 p) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    for (int i = 0; i < 4; i++) {
                        value += amplitude * noise2d(p);
                        p *= 2.0;
                        amplitude *= 0.5;
                    }
                    return value;
                }

                // ─── BACKGROUND PLASMA REEF FIELD ───
                vec3 getPlasmaField(vec2 uv, float t) {
                    float v1 = sin(uv.x * 8.0 + t);
                    float v2 = sin(8.0 * (uv.y * sin(t * 0.5) + uv.x * cos(t * 0.33)) + t);
                    float cx = uv.x + 0.5 * sin(t * 0.2);
                    float cy = uv.y + 0.5 * cos(t * 0.3);
                    float v3 = sin(sqrt(64.0 * (cx*cx + cy*cy) + 1.0) - t);
                    float v = (v1 + v2 + v3) / 3.0;

                    // Saturated chromatic darks & vivid brights
                    vec3 c1 = vec3(0.9, 0.0, 0.55); // hot pink
                    vec3 c2 = vec3(0.0, 0.85, 0.9); // electric cyan
                    vec3 c3 = vec3(0.4, 0.0, 0.8);  // ultraviolet/purple
                    vec3 c4 = vec3(0.05, 0.1, 0.3); // deep cobalt

                    vec3 col = oklabMix(c4, c1, sin(v * PI) * 0.5 + 0.5);
                    col = oklabMix(col, c2, cos(v * PI) * 0.5 + 0.5);
                    col = oklabMix(col, c3, sin(v * 0.5 * PI) * 0.5 + 0.5);
                    return col;
                }

                // ─── DEMOSCENE RAYMARCHED REACTOR ───
                float sdTorus(vec3 p, vec2 t) {
                    vec2 q = vec2(length(p.xz) - t.x, p.y);
                    return length(q) - t.y;
                }

                float sdBox(vec3 p, vec3 b) {
                    vec3 q = abs(p) - b;
                    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
                }

                mat2 rot2d(float a) {
                    float c = cos(a), s = sin(a);
                    return mat2(c, -s, s, c);
                }

                float mapScene(vec3 p, float t) {
                    vec3 p1 = p;
                    p1.xz *= rot2d(t * 0.8);
                    p1.xy *= rot2d(t * 0.5);
                    float d1 = sdTorus(p1, vec2(0.85, 0.12));

                    vec3 p2 = p;
                    p2.yz *= rot2d(t * 1.1);
                    p2.xz *= rot2d(-t * 0.4);
                    float d2 = sdBox(p2, vec3(0.35));

                    return min(d1, d2);
                }

                vec3 getSceneColor(vec2 uv, float t, out float hitDepth) {
                    vec2 p = (uv - 0.5) * 2.0;
                    vec3 ro = vec3(0.0, 0.0, -3.0);
                    vec3 rd = normalize(vec3(p, 1.4));

                    float dist = 0.0;
                    bool hit = false;
                    for (int i = 0; i < 32; i++) {
                        vec3 pos = ro + rd * dist;
                        float d = mapScene(pos, t);
                        if (d < 0.001) {
                            hit = true;
                            break;
                        }
                        dist += d;
                        if (dist > 4.5) break;
                    }

                    if (hit) {
                        hitDepth = dist;
                        vec3 pos = ro + rd * dist;
                        vec3 eps = vec3(0.002, 0.0, 0.0);
                        vec3 nor = normalize(vec3(
                            mapScene(pos + eps.xyy, t) - mapScene(pos - eps.xyy, t),
                            mapScene(pos + eps.yxy, t) - mapScene(pos - eps.yxy, t),
                            mapScene(pos + eps.yyx, t) - mapScene(pos - eps.yyx, t)
                        ));

                        float diff = max(0.0, dot(nor, normalize(vec3(1.0, 2.0, -1.0))));
                        float rim = pow(1.0 - max(0.0, dot(nor, -rd)), 4.0);
                        
                        // Saturated core colors
                        vec3 neonColor = oklabMix(vec3(0.95, 0.0, 0.55), vec3(0.0, 0.95, 0.85), sin(pos.y * 4.0 + t * 2.0) * 0.5 + 0.5);
                        return neonColor * (diff * 0.5 + rim * 0.9 + 0.1);
                    }
                    hitDepth = -1.0;
                    return vec3(0.0);
                }

                // ─── CUTTLEFISH CHROMATOPHORES ───
                vec3 applyChromatophores(vec2 uv, vec3 baseColor, float t) {
                    vec2 st = uv * 36.0;
                    vec2 ip = floor(st);
                    vec2 fp = fract(st) - 0.5;

                    float min_d = 10.0;
                    vec2 best_cell = vec2(0.0);

                    for (int y = -1; y <= 1; y++) {
                        for (int x = -1; x <= 1; x++) {
                            vec2 neighbor = vec2(float(x), float(y));
                            vec2 cell_id = ip + neighbor;
                            vec2 jitter = hash22(cell_id) * 0.45;
                            vec2 diff = neighbor + jitter - fp;
                            float d = length(diff);
                            if (d < min_d) {
                                min_d = d;
                                best_cell = cell_id;
                            }
                        }
                    }

                    // Neural excitation wave rippling dynamically
                    float excitation = sin(length(best_cell / 36.0 - vec2(0.5)) * 14.0 - t * 4.5) * 0.5 + 0.5;

                    float r0 = 0.14 + 0.07 * hash21(best_cell);
                    float r = r0 * (1.0 + 1.24 * excitation);
                    float cov = smoothstep(r, r * 0.65, min_d);

                    float p_hash = hash21(best_cell + 47.91);
                    vec3 pigment = vec3(0.0);
                    if (p_hash < 0.35) {
                        pigment = vec3(0.95, 0.75, 0.2); // yellow
                    } else if (p_hash < 0.7) {
                        pigment = vec3(0.85, 0.15, 0.1); // red
                    } else {
                        pigment = vec3(0.18, 0.06, 0.22); // deep violet-brown
                    }

                    return mix(baseColor, baseColor * pigment * 1.6, cov * 0.8 * u_intensity);
                }

                // ─── HALFTONE MOSAIC ───
                vec3 applyHalftone(vec2 uv, vec3 color, float scale) {
                    float size = scale / u_resolution.x;
                    vec2 g = uv / size;
                    vec2 f = fract(g) - 0.5;

                    float l = dot(color, vec3(0.299, 0.587, 0.114));
                    float r = sqrt(1.0 - l) * 0.48;

                    float d = length(f);
                    float dotMask = smoothstep(r, r - 0.06, d);

                    vec3 dotColor = vec3(0.05, 0.02, 0.15); // rich dark indigo
                    return mix(color, dotColor, dotMask * 0.7 * u_intensity);
                }

                // ─── ANAMORPHIC LENS FLARE ───
                vec3 getAnamorphicFlare(vec2 uv, float t) {
                    float flareY = 0.5 + 0.08 * sin(t * 0.4);
                    float dist = abs(uv.y - flareY);
                    float streak = exp(-dist * dist / 0.00015);

                    float x_wave = uv.x + sin(t * 0.8) * 0.15;
                    vec3 rainbow = 0.5 + 0.5 * cos(TAU * (x_wave + vec3(0.0, 0.33, 0.66)));

                    return rainbow * streak * 0.9 * u_intensity;
                }

                // ─── ASEMIC INTERFACE DEBRIS ───
                float sdBox2d(vec2 p, vec2 b) {
                    vec2 d = abs(p) - b;
                    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
                }

                vec3 applyInterfaceDebris(vec2 uv, vec3 color, float t) {
                    // Floating window-pane shards
                    for (int i = 0; i < 3; i++) {
                        float fi = float(i);
                        vec2 pos = vec2(
                            0.5 + 0.3 * sin(t * 0.3 + fi * 1.5),
                            0.5 + 0.2 * cos(t * 0.4 + fi * 2.3)
                        );
                        vec2 size = vec2(0.12, 0.08) * (1.0 + 0.3 * sin(t + fi));
                        
                        vec2 p = uv - pos;
                        p *= rot2d(t * 0.1 + fi);
                        float d = sdBox2d(p, size);
                        
                        // Render glowing window-frame borders
                        float border = smoothstep(0.004, 0.0, abs(d));
                        vec3 frameColor = oklabMix(vec3(0.0, 0.95, 0.9), vec3(0.95, 0.0, 0.65), sin(t + fi) * 0.5 + 0.5);
                        color = mix(color, frameColor, border * 0.8 * u_intensity);
                    }
                    return color;
                }

                // ─── CRT PHOSPHOR & DAMAGE SYSTEMS ───
                vec3 applyCRT(vec3 col, vec2 uv, vec2 fragCoord, float t) {
                    // Vertical subpixel RGB stripes
                    float subpixel = mod(fragCoord.x, 3.0);
                    vec3 stripe = vec3(
                        smoothstep(1.0, 0.0, abs(subpixel - 0.5)),
                        smoothstep(1.0, 0.0, abs(subpixel - 1.5)),
                        smoothstep(1.0, 0.0, abs(subpixel - 2.5))
                    );
                    col *= mix(vec3(1.0), stripe, 0.35);

                    // Scanlines
                    float scan = sin(uv.y * u_resolution.y * PI) * 0.5 + 0.5;
                    col *= mix(0.72, 1.0, scan);

                    // Physical Damper wires
                    float w1 = exp(-pow(uv.y - 0.33, 2.0) / 0.0008);
                    float w2 = exp(-pow(uv.y - 0.66, 2.0) / 0.0008);
                    col *= (1.0 - 0.18 * (w1 + w2));

                    return col;
                }

                // ─── ABSOLUTE COLOR LAW (NO BLACK/WHITE DOMINANCE) ───
                vec3 colorSafetyStage(vec3 col, float t) {
                    float l = dot(col, vec3(0.299, 0.587, 0.114));

                    // Chromatic deep darks (No flat black)
                    vec3 deepIndigo = vec3(0.08, 0.02, 0.16);
                    vec3 deepTeal = vec3(0.01, 0.08, 0.14);
                    vec3 chromaticDark = mix(deepIndigo, deepTeal, sin(t) * 0.5 + 0.5);

                    // Chromatic neon highlights (No flat white)
                    vec3 neonPink = vec3(0.98, 0.05, 0.6);
                    vec3 neonYellow = vec3(0.92, 0.95, 0.05);
                    vec3 chromaticLight = mix(neonPink, neonYellow, cos(t * 1.5) * 0.5 + 0.5);

                    if (l < 0.15) {
                        col = mix(chromaticDark, col, l / 0.15);
                    }
                    if (l > 0.85) {
                        col = mix(col, chromaticLight, (l - 0.85) / 0.15);
                    }

                    return col;
                }

                void main() {
                    vec2 uv = vUv;
                    float t = u_time;

                    // ─── DATAMOSH / MOTION VECTOR WARP ───
                    float warpX = fbm2d(uv * 3.5 + vec2(0.0, t * 0.18));
                    float warpY = fbm2d(uv * 3.5 - vec2(t * 0.18, 0.0));
                    vec2 datamoshUV = uv + vec2(warpX - 0.5, warpY - 0.5) * u_datamosh_strength * u_intensity;

                    // ─── CHROMATIC ABERRATION ───
                    float spread = u_chromatic_spread * u_intensity;
                    vec2 rUV = clamp(datamoshUV + vec2(spread, 0.0), 0.0, 1.0);
                    vec2 gUV = clamp(datamoshUV, 0.0, 1.0);
                    vec2 bUV = clamp(datamoshUV - vec2(spread, 0.0), 0.0, 1.0);

                    // ─── COMPOSITE EVALUATION ───
                    // Red Channel
                    vec3 rBase = getPlasmaField(rUV, t);
                    float rHit;
                    vec3 rScene = getSceneColor(rUV, t, rHit);
                    if (rHit > 0.0) rBase = rScene;
                    rBase = applyChromatophores(rUV, rBase, t);
                    rBase = applyInterfaceDebris(rUV, rBase, t);

                    // Green Channel
                    vec3 gBase = getPlasmaField(gUV, t);
                    float gHit;
                    vec3 gScene = getSceneColor(gUV, t, gHit);
                    if (gHit > 0.0) gBase = gScene;
                    gBase = applyChromatophores(gUV, gBase, t);
                    gBase = applyInterfaceDebris(gUV, gBase, t);

                    // Blue Channel
                    vec3 bBase = getPlasmaField(bUV, t);
                    float bHit;
                    vec3 bScene = getSceneColor(bUV, t, bHit);
                    if (bHit > 0.0) bBase = bScene;
                    bBase = applyChromatophores(bUV, bBase, t);
                    bBase = applyInterfaceDebris(bUV, bBase, t);

                    // Assemble chromatic-aberrated signal
                    vec3 finalCol = vec3(rBase.r, gBase.g, bBase.b);

                    // Apply Halftone Mosaic (reacts to luminance)
                    finalCol = applyHalftone(gUV, finalCol, u_halftone_scale);

                    // Add Anamorphic Lens Flare
                    finalCol += getAnamorphicFlare(gUV, t);

                    // Apply CRT Phosphor Scanline Matrix
                    finalCol = applyCRT(finalCol, gUV, gl_FragCoord.xy, t);

                    // Final Color Safety Pass
                    finalCol = colorSafetyStage(finalCol, t);

                    fragColor = vec4(finalCol, 1.0);
                }
            `
        });

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);

        canvas.__three = { renderer, scene, camera, material };
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        return;
    }
}

// Retrieve cached Three.js objects
const { renderer, scene, camera, material } = canvas.__three;

// Modulate global intensity dynamically (with peak surges every 6 seconds)
const cycle = time % 6.0;
const surge = Math.exp(-Math.pow(cycle - 1.0, 2.0) / 0.06); // sharp surge peak at 1s
const computedIntensity = 0.35 + 0.65 * surge;

// Update uniform values safely
if (material && material.uniforms) {
    if (material.uniforms.u_time) material.uniforms.u_time.value = time;
    if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(grid.width, grid.height);
    if (material.uniforms.u_intensity) material.uniforms.u_intensity.value = computedIntensity;
    if (material.uniforms.u_mouse) {
        if (mouse.isPressed) {
            material.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
        } else {
            // Idle breathing path
            material.uniforms.u_mouse.value.set(
                0.5 + 0.15 * Math.sin(time * 0.7),
                0.5 + 0.15 * Math.cos(time * 0.5)
            );
        }
    }
}

// Render the scene to the WebGL canvas
renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);