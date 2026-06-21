if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
        u_glitch: { value: 0.0 }
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
        uniform vec2 u_mouse;
        uniform float u_glitch;

        // OKLab / OKLCh conversions
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

        // Noise / FBM generators
        float hash21(vec2 p) {
            p = fract(p * vec2(123.34, 345.45));
            p += dot(p, p + 34.345);
            return fract(p.x * p.y);
        }

        float vnoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash21(i + vec2(0.0, 0.0));
            float b = hash21(i + vec2(1.0, 0.0));
            float c = hash21(i + vec2(0.0, 1.0));
            float d = hash21(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        // Barrel distortion
        vec2 barrelDistort(vec2 uv, float k) {
            vec2 c = uv - 0.5;
            float r2 = dot(c, c);
            return c * (1.0 + k * r2) + 0.5;
        }

        // Cuttlefish chromatophore cells
        float chromatophores(vec2 uv, float time) {
            vec2 g = uv * 35.0;
            vec2 ip = floor(g);
            vec2 fp = fract(g);
            float minDist = 1.0;
            for (int y = -1; y <= 1; y++) {
                for (int x = -1; x <= 1; x++) {
                    vec2 neighbor = vec2(float(x), float(y));
                    vec2 cellId = ip + neighbor;
                    vec2 randPos = vec2(hash21(cellId), hash21(cellId + 7.89));
                    vec2 rPos = neighbor + randPos - fp;
                    float d = length(rPos);
                    minDist = min(minDist, d);
                }
            }
            float wave = sin(uv.x * 6.0 - time * 4.0) * 0.5 + 0.5;
            float threshold = mix(0.12, 0.38, wave);
            return smoothstep(threshold + 0.04, threshold - 0.04, minDist);
        }

        // Halftone dots
        float halftoneDot(vec2 uv, float angle, float scale, float value) {
            float s = sin(angle), c = cos(angle);
            vec2 rotUv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
            vec2 grid = fract(rotUv * scale) - 0.5;
            float r = sqrt(value) * 0.45;
            return smoothstep(r + 0.06, r - 0.06, length(grid));
        }

        // Glitchcore popups
        float drawWindow(vec2 uv, vec2 pos, vec2 size, float time) {
            vec2 d = abs(uv - pos) - size;
            float border = max(d.x, d.y);
            float edge = smoothstep(0.003, -0.003, border);
            float inner = smoothstep(0.003, -0.003, border + 0.005);
            return edge - inner;
        }

        // Datamosh UV Smear
        vec2 datamoshWarp(vec2 uv, float time, float glitch) {
            vec2 blockUV = floor(uv * 24.0) / 24.0;
            float blockSeed = hash21(blockUV + floor(time * 3.0) * 0.1);
            float isSmeared = step(0.68 - glitch * 0.35, blockSeed);
            vec2 offset = vec2(0.0);
            if (isSmeared > 0.5) {
                offset = vec2(
                    vnoise(blockUV * 8.0 + time * 0.5) - 0.5,
                    vnoise(blockUV * 8.0 - time * 0.5) - 0.5
                ) * (0.12 + glitch * 0.18);
            }
            return uv + offset;
        }

        // Main scene render for a single channel
        float getSceneChannel(vec2 uv, float time, float glitch, int channelIdx) {
            vec2 warpedUv = datamoshWarp(uv, time, glitch);
            vec2 p = warpedUv - 0.5;
            float r = length(p);
            float angle = atan(p.y, p.x);
            
            // Demoscene tunnel warp
            float tunnel = sin(14.0 * log(r + 0.02) - time * 5.0 + sin(angle * 5.0 + time));
            float plasma = sin(warpedUv.x * 12.0 + time) * cos(warpedUv.y * 12.0 - time) + sin(r * 24.0 - time * 4.0);
            
            // Cuttlefish chromatophore layers
            float chrom = 0.0;
            if (channelIdx == 0) {
                chrom = chromatophores(warpedUv * 1.3, time * 1.4);
            } else if (channelIdx == 1) {
                chrom = chromatophores(warpedUv + vec2(0.12), time * 1.1 + 1.8);
            } else {
                chrom = chromatophores(warpedUv * 0.85 - vec2(0.08), time * 0.85 + 3.5);
            }
            
            // Combine tunnel + plasma + chromatophores
            float signal = mix(tunnel, plasma, 0.4);
            signal = mix(signal, 1.0 - signal, chrom * 0.75);
            
            // Halftone dot modulation
            float ht = halftoneDot(warpedUv, (15.0 + float(channelIdx) * 30.0) * 3.14159 / 180.0, 45.0, abs(signal));
            signal = mix(signal, -signal * 0.5, ht * 0.45);
            
            // Central reactor core
            float reactor = smoothstep(0.24, 0.21, r);
            signal = mix(signal, sin(time * 8.0 + float(channelIdx) * 2.0) * 0.5 + 0.5, reactor);
            
            // Glitchcore popup frames
            float win1 = drawWindow(warpedUv, vec2(0.5 + 0.12 * sin(time * 0.8), 0.5 + 0.12 * cos(time * 0.6)), vec2(0.16, 0.11), time);
            float win2 = drawWindow(warpedUv, vec2(0.5 - 0.16 * cos(time * 0.4), 0.5 + 0.14 * sin(time * 1.2)), vec2(0.12, 0.16), time);
            signal = mix(signal, 1.0, (win1 + win2) * 0.75);
            
            return clamp(signal * 0.5 + 0.5, 0.0, 1.0);
        }

        // Anamorphic Lens Flare
        vec3 spectralFlare(vec2 uv, vec2 pos, float time) {
            vec2 d = uv - pos;
            float streak = exp(-abs(d.y) * 110.0) * exp(-d.x * d.x * 1.8);
            float hue = fract(d.x * 0.4 + time * 0.15);
            vec3 flareColor = oklab_to_linear_srgb(vec3(0.8, 0.16 * cos(hue * 6.28318), 0.16 * sin(hue * 6.28318)));
            return flareColor * streak * 1.3;
        }

        // Color Safety Stage
        vec3 colorSafety(vec3 rgb) {
            vec3 lab = linear_srgb_to_oklab(rgb);
            
            // Saturated chromatic dark (deep indigo/violet)
            vec3 chromaticDark = linear_srgb_to_oklab(vec3(0.06, 0.01, 0.18));
            // Saturated chromatic bright (neon pink/cyan)
            vec3 chromaticBright = linear_srgb_to_oklab(vec3(1.0, 0.78, 0.92));
            
            if (lab.x < 0.16) {
                float t = smoothstep(0.16, 0.0, lab.x);
                lab = mix(lab, chromaticDark, t * 0.85);
                lab.x = mix(lab.x, 0.16, t);
            }
            if (lab.x > 0.91) {
                float t = smoothstep(0.91, 1.0, lab.x);
                lab = mix(lab, chromaticBright, t * 0.55);
                lab.x = mix(lab.x, 0.91, t);
            }
            
            return oklab_to_linear_srgb(lab);
        }

        void main() {
            vec2 uv = vUv;
            
            // Chromatic Aberration via radial UV offset on barrel-distorted space
            vec2 uvR = barrelDistort(uv + vec2(0.006, 0.0) * (1.0 + u_glitch), 0.08);
            vec2 uvG = barrelDistort(uv, 0.08);
            vec2 uvB = barrelDistort(uv - vec2(0.006, 0.0) * (1.0 + u_glitch), 0.08);
            
            // Render channels
            float r = getSceneChannel(uvR, u_time, u_glitch, 0);
            float g = getSceneChannel(uvG, u_time, u_glitch, 1);
            float b = getSceneChannel(uvB, u_time, u_glitch, 2);
            vec3 col = vec3(r, g, b);
            
            // Add Anamorphic Lens Flares (moving across the screen)
            vec2 flarePos1 = vec2(0.5 + 0.25 * sin(u_time * 0.7), 0.5 + 0.15 * cos(u_time * 1.1));
            vec2 flarePos2 = vec2(0.5 - 0.2 * cos(u_time * 0.5), 0.4 + 0.2 * sin(u_time * 0.9));
            col += spectralFlare(uvG, flarePos1, u_time);
            col += spectralFlare(uvG, flarePos2, u_time * 1.3);
            
            // CRT Scanlines
            float scanline = 0.5 + 0.5 * sin(uvG.y * u_resolution.y * 3.14159265);
            col *= mix(0.75, 1.0, scanline);
            
            // CRT Phosphor Triads
            float pixelX = gl_FragCoord.x;
            int subpixel = int(mod(pixelX, 3.0));
            vec3 triad = vec3(0.35);
            if (subpixel == 0) triad.r = 1.0;
            else if (subpixel == 1) triad.g = 1.0;
            else triad.b = 1.0;
            col *= mix(vec3(1.0), triad, 0.35);
            
            // Color Safety Pass
            col = colorSafety(col);
            
            // Vignette
            vec2 vign = uv - 0.5;
            col *= smoothstep(0.8, 0.3, length(vign));
            
            fragColor = vec4(col, 1.0);
        }
      `
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
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

  // Normalize mouse coordinates to [0, 1]
  const mx = mouse.x / grid.width;
  const my = 1.0 - (mouse.y / grid.height); // Flip Y to match WebGL coordinates
  material.uniforms.u_mouse.value.set(mx, my);

  // Rhythmic show moments + mouse click trigger
  const cycle = time % 6.0;
  let glitch = 0.0;
  if (mouse.isPressed) {
    glitch = 0.85;
  } else if (cycle > 4.5) {
    // Smooth peak between 4.5 and 6.0 seconds
    glitch = Math.sin((cycle - 4.5) * Math.PI / 1.5) * 0.75;
  }
  material.uniforms.u_glitch.value = glitch;
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);