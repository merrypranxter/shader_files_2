if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.autoClear = false;

    const sceneSim = new THREE.Scene();
    const sceneDisp = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    camera.position.z = 1;

    // Ping-pong targets for temporal memory, datamoshing, and cuttlefish simulation
    const rtOpts = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false
    };
    const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
    const rtB = rtA.clone();

    // -------------------------------------------------------------------------
    // BUFFER A: THE LIVING PHOSPHOR REEF / DATAMOSH / HYPERBOLIC ENGINE
    // -------------------------------------------------------------------------
    const matSim = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_prev: { value: null },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
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
        uniform sampler2D u_prev;
        uniform vec2 u_resolution;

        // Hash functions
        float hash21(vec2 p) {
            p = fract(p * vec2(127.1, 311.7));
            p += dot(p, p + 19.19);
            return fract(p.x * p.y);
        }
        
        vec2 hash22(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.xx+p3.yz)*p3.zy);
        }

        // Palette generator
        vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
            return a + b * cos(6.28318 * (c * t + d));
        }

        // Hyperbolic Poincaré Fold (Hyperbolic Tilings Repo)
        vec2 poincareFold(vec2 z) {
            for(int i=0; i<6; i++) {
                z = abs(z);
                z -= vec2(0.3, 0.15); // Shift
                float d2 = dot(z,z);
                if(d2 < 0.25) z *= 0.25 / d2; // Inversion across circle
                // Rotate
                float a = 1.1 + sin(u_time * 0.1) * 0.2;
                float c = cos(a), s = sin(a);
                z = vec2(z.x*c - z.y*s, z.x*s + z.y*c);
            }
            return z;
        }

        // Early Internet / Glitchcore UI Debris
        float uiDebris(vec2 p) {
            float d = 1.0;
            for(int i=0; i<4; i++) {
                float fi = float(i);
                vec2 pos = vec2(sin(u_time*0.7+fi), cos(u_time*0.5-fi)) * 0.6;
                vec2 b = abs(p - pos) - vec2(0.1 + fi*0.05, 0.05 + fi*0.02);
                float dist = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0);
                d = min(d, dist);
            }
            return d;
        }

        void main() {
            vec2 uv = vUv;
            vec2 pZ = (uv - 0.5) * 2.0;

            // Demoscene Kaleidoscope Symmetry
            float angle = atan(pZ.y, pZ.x);
            float rad = length(pZ);
            float segments = 6.0;
            angle = mod(angle, 6.28318 / segments);
            angle = abs(angle - 3.14159 / segments);
            vec2 kalZ = rad * vec2(cos(angle), sin(angle));

            // Hyperbolic Reactor Core
            vec2 foldZ = poincareFold(kalZ);
            float hDepth = clamp(length(foldZ), 0.0, 1.0);

            // Datamosh & Compression Damage (Damage Aesthetics)
            vec2 mosh_uv = uv;
            
            // Tape Tracking Tear
            float tear = sin(uv.y * 150.0 + u_time * 12.0) * exp(-fract(u_time * 1.5));
            if (hash21(vec2(floor(uv.y * 50.0), floor(u_time))) > 0.92) {
                mosh_uv.x += tear * 0.08;
            }

            // Macroblock Motion Vectors
            vec2 block = floor(mosh_uv * 32.0) / 32.0;
            vec2 mv = (hash22(block + floor(u_time * 5.0)) - 0.5) * 0.03;
            if (hash21(block + 12.34) > 0.6) mosh_uv -= mv;

            // Autostereogram Depth Shift (Autostereogram Repo)
            float E = 0.06; // Pattern period
            float mu = 0.5; // Depth scale
            float sep = E * (1.0 - mu * hDepth) / (2.0 - mu * hDepth);
            vec2 stereo_uv = vec2(mod(mosh_uv.x - sep + u_time * 0.02, E) / E, mosh_uv.y);

            // Read Feedback Buffers
            vec3 prev = texture(u_prev, mosh_uv).rgb;
            vec3 stereo = texture(u_prev, stereo_uv).rgb;

            // Mix temporal feedback and stereogram
            vec3 col = mix(prev, stereo, 0.08);

            // Inject Demoscene Plasma / Cathedral Energy
            float plasma = sin(foldZ.x * 25.0 + u_time * 2.0) * cos(foldZ.y * 25.0 - u_time);
            vec3 plasmaColor = pal(plasma * 0.5 + u_time * 0.2, 
                                   vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
            
            if (plasma > 0.85) {
                col += plasmaColor * 0.3;
            }

            // UI Shards (Glitchcore / Early Internet)
            if (uiDebris(pZ) < 0.0) {
                col = mix(col, vec3(0.0, 1.0, 0.8), 0.6); // Electric Cyan
            }

            // Cuttlefish Chromatophores (Cuttlefish Chromatics)
            vec2 c_grid = fract(uv * 90.0) - 0.5;
            float act = smoothstep(0.3, 0.8, dot(col, vec3(0.333)));
            float r_spot = 0.25 * (1.0 + 1.24 * act);
            if (length(c_grid) < r_spot && act > 0.1) {
                col = mix(col, vec3(1.0, 0.1, 0.6), 0.4); // Hot Pink Pigment sacs
            }

            // Crystalline Facets (Crystalline Repo)
            float facet = max(abs(kalZ.x) * 1.5 + abs(kalZ.y), abs(kalZ.y) * 1.5 + abs(kalZ.x));
            if (fract(facet * 8.0 - u_time * 1.5) < 0.05) {
                col += vec3(0.8, 1.0, 0.1) * 0.4; // Chartreuse flash
            }

            // Show Moments / Surges
            float surge = pow(sin(u_time * 0.6) * 0.5 + 0.5, 12.0);
            if (surge > 0.1) {
                col += plasmaColor * surge * 0.5;
                if (hash21(uv) > 0.9) col = vec3(1.0, 0.5, 0.0); // Orange glitch pop
            }

            // Decay to Chromatic Dark (Plum/Indigo) - NO PURE BLACK
            col = mix(col, vec3(0.1, 0.0, 0.2), 0.06);
            col = clamp(col, 0.0, 2.0);

            fragColor = vec4(col, 1.0);
        }
      `
    });

    // -------------------------------------------------------------------------
    // BUFFER B: DISPLAY, CRT, ABERRATION, FLARES, HALFTONE, OKLAB COLOR SAFETY
    // -------------------------------------------------------------------------
    const matDisp = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_sim: { value: null },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
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
        uniform sampler2D u_sim;
        uniform vec2 u_resolution;

        // OKLab Color Systems (color_systems repo)
        vec3 srgb_to_linear(vec3 c) {
            return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
        }
        vec3 linear_to_srgb(vec3 c) {
            return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
        }
        vec3 linear_srgb_to_oklab(vec3 c) {
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

        void main() {
            vec2 uv = vUv;

            // CRT Barrel Distortion (crt_phosphor_fx)
            vec2 crt_uv = uv - 0.5;
            float r2 = dot(crt_uv, crt_uv);
            crt_uv *= 1.0 + r2 * 0.12; 
            crt_uv += 0.5;

            // Chromatic Aberration (chromatic_aberration)
            vec2 dir = normalize(crt_uv - 0.5) * (0.008 + r2 * 0.04);
            float r = texture(u_sim, crt_uv - dir).r;
            float g = texture(u_sim, crt_uv).g;
            float b = texture(u_sim, crt_uv + dir).b;
            vec3 col = vec3(r, g, b);

            // Anamorphic Lens Flares (anamorphic_lens_flares)
            vec3 flare = vec3(0.0);
            float w_sum = 0.0;
            for(float i=1.0; i<=12.0; i++) {
                float w = exp(-i * 0.2);
                vec3 s1 = texture(u_sim, crt_uv + vec2(i*0.02, 0.0)).rgb;
                vec3 s2 = texture(u_sim, crt_uv - vec2(i*0.02, 0.0)).rgb;
                // Spectral separation in flares
                flare += max(s1 - 0.5, 0.0) * w * vec3(0.1, 0.6, 1.0); // Laser blue
                flare += max(s2 - 0.5, 0.0) * w * vec3(1.0, 0.2, 0.8); // Hot pink
                w_sum += w * 2.0;
            }
            col += (flare / w_sum) * 1.5;

            // Halftone Mosaic (halftone_mosaic)
            float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
            vec2 ht_grid = fract(crt_uv * vec2(u_resolution.x/u_resolution.y, 1.0) * 180.0) - 0.5;
            float ht_rad = luma * 0.65;
            float ht = smoothstep(ht_rad, ht_rad - 0.1, length(ht_grid));
            
            // Apply halftone to midtones to create texture without destroying highlights
            float ht_mask = smoothstep(0.1, 0.4, luma) * smoothstep(0.9, 0.6, luma);
            col = mix(col, col * ht * 1.8, ht_mask * 0.6);

            // CRT Scanlines & Phosphor Triads (crt_phosphor_fx)
            float scan = sin(crt_uv.y * u_resolution.y * 3.1415) * 0.15 + 0.85;
            float triad = mod(gl_FragCoord.x, 3.0);
            vec3 mask = vec3(triad < 1.0, triad >= 1.0 && triad < 2.0, triad >= 2.0);
            mask = mix(vec3(1.0), mask, 0.45); // Soften the mask so it's not too dark
            col *= scan * mask;

            // Edge clipping (Tube vignette)
            float vig = smoothstep(0.5, 0.45, max(abs(crt_uv.x - 0.5), abs(crt_uv.y - 0.5)));
            col *= vig;

            // -----------------------------------------------------------------
            // ABSOLUTE COLOR LAW: NO BLACK, NO WHITE, FULL CHROMATIC ENERGY
            // -----------------------------------------------------------------
            vec3 lab = linear_srgb_to_oklab(srgb_to_linear(col));
            
            // 1. Lightness Safety (Prevent pure black / pure white)
            lab.x = clamp(lab.x, 0.25, 0.88); 
            
            // 2. Force Chroma (Prevent grayscale/neutral fog)
            float chroma = length(lab.yz);
            if (chroma < 0.15) {
                // Inject vivid hues based on spatial position and time
                float ang = atan(crt_uv.y - 0.5, crt_uv.x - 0.5) + u_time * 0.5;
                lab.y += cos(ang) * 0.18;
                lab.z += sin(ang) * 0.18;
            }
            
            // 3. Chromatic Darks (Map shadows to Indigo/Plum)
            if (lab.x < 0.4) {
                lab.y = mix(lab.y, 0.12, 0.6);  // Push to magenta/red
                lab.z = mix(lab.z, -0.15, 0.6); // Push to blue -> Indigo/Plum
            }

            // Overall saturation boost for Glitchcore/Hyperpop energy
            lab.yz *= 1.25;

            col = linear_to_srgb(oklab_to_linear_srgb(lab));

            // Final safety clamp
            col = clamp(col, 0.0, 1.0);

            fragColor = vec4(col, 1.0);
        }
      `
    });

    sceneSim.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matSim));
    sceneDisp.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matDisp));

    canvas.__three = { 
      renderer, sceneSim, sceneDisp, camera, 
      rtA, rtB, matSim, matDisp, 
      pingpong: 0 
    };
  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
    return;
  }
}

const t = canvas.__three;
if (!t) return;

// Update Uniforms
t.matSim.uniforms.u_time.value = time;
t.matSim.uniforms.u_resolution.value.set(grid.width, grid.height);
t.matDisp.uniforms.u_time.value = time;
t.matDisp.uniforms.u_resolution.value.set(grid.width, grid.height);

// Ping-Pong FBO Logic
const readRT = t.pingpong === 0 ? t.rtA : t.rtB;
const writeRT = t.pingpong === 0 ? t.rtB : t.rtA;

// Pass 1: Render Simulation (Living Reef / Datamosh)
t.matSim.uniforms.u_prev.value = readRT.texture;
t.renderer.setRenderTarget(writeRT);
t.renderer.render(t.sceneSim, t.camera);

// Pass 2: Render Display (CRT, Flares, Aberration, Color Safety)
t.matDisp.uniforms.u_sim.value = writeRT.texture;
t.renderer.setRenderTarget(null);
t.renderer.setSize(grid.width, grid.height, false);
t.renderer.render(t.sceneDisp, t.camera);

// Swap buffers
t.pingpong = 1 - t.pingpong;