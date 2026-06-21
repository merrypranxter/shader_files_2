if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
        u_intensity: { value: 0.8 },
        u_datamoshAmount: { value: 0.7 },
        u_flareEnergy: { value: 0.85 },
        u_chromaticSpread: { value: 0.6 }
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

        uniform float u_time;
        uniform vec2 u_resolution;
        uniform vec2 u_mouse;
        uniform float u_intensity;
        uniform float u_datamoshAmount;
        uniform float u_flareEnergy;
        uniform float u_chromaticSpread;

        in vec2 vUv;
        out vec4 fragColor;

        // --- MATH & NOISE HELPERS ---
        float hash21(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        vec2 hash22(vec2 p) {
          p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
          return fract(sin(p) * 43758.5453123);
        }

        float noise2d(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
                     mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
        }

        float fbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          for (int i = 0; i < 4; i++) {
            value += amplitude * noise2d(p);
            p *= 2.0;
            amplitude *= 0.5;
          }
          return value;
        }

        // --- COLOR SYSTEMS (OKLab / OKLCh) ---
        vec3 sRGB_to_linear(vec3 c) {
          return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
        }

        vec3 linear_to_sRGB(vec3 c) {
          return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), c));
        }

        vec3 linearSRGB_to_OKLab(vec3 c) {
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

        vec3 oklabMix(vec3 colA, vec3 colB, float t) {
          vec3 labA = linearSRGB_to_OKLab(sRGB_to_linear(colA));
          vec3 labB = linearSRGB_to_OKLab(sRGB_to_linear(colB));
          vec3 mixed = mix(labA, labB, t);
          return linear_to_sRGB(OKLab_to_linearSRGB(mixed));
        }

        // --- BRAGG REFLECTION (IRIDOPHORE GLOW) ---
        vec3 braggColor(float d_nm, float cosTheta) {
          float lambda = 2.0 * 1.44 * d_nm * cosTheta;
          float r = exp(-0.5 * pow((lambda - 650.0) / 30.0, 2.0));
          float g = exp(-0.5 * pow((lambda - 540.0) / 30.0, 2.0));
          float b = exp(-0.5 * pow((lambda - 460.0) / 30.0, 2.0));
          return vec3(r, g, b);
        }

        // --- MONOSPACE ASEMIC GLYPH GENERATION ---
        float glyph(vec2 uv, float seed) {
          vec2 gridIdx = floor(uv * vec2(4.0, 5.0));
          float h = hash21(gridIdx + seed * 13.71);
          return step(0.45, h) * step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        }

        // --- HALFTONE GRID GENERATION ---
        float halftone(vec2 uv, float size, float angle, float threshold) {
          float s = sin(angle);
          float c = cos(angle);
          vec2 rotUv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) * size;
          vec2 gridUv = fract(rotUv) - 0.5;
          float d = length(gridUv);
          return smoothstep(threshold - 0.05, threshold + 0.05, 0.5 - d);
        }

        void main() {
          // Surge moment (peaks every 6 seconds)
          float surge = smoothstep(0.7, 1.0, sin(u_time * 1.047));

          // 1. Barrel Distortion (CRT geometry)
          vec2 uv = vUv;
          vec2 dUV = uv - 0.5;
          float r2 = dot(dUV, dUV);
          uv = dUV * (1.0 + 0.12 * r2 + 0.02 * r2 * r2) + 0.5;

          // Out of bounds checking for CRT frame
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            fragColor = vec4(0.05, 0.01, 0.12, 1.0); // Chromatic dark border
            return;
          }

          // 2. Datamosh Macroblock Warp
          vec2 blockUV = floor(uv * 16.0) / 16.0;
          vec2 blockFrac = fract(uv * 16.0);
          vec2 velocity = vec2(
            noise2d(blockUV * 3.0 + vec2(u_time * 0.15, 0.0)),
            noise2d(blockUV * 3.0 + vec2(0.0, u_time * 0.15))
          ) - 0.5;
          float freeze = step(0.68 - 0.22 * surge, hash21(blockUV + floor(u_time * 1.2)));
          vec2 warpedUv = uv + velocity * 0.09 * freeze * u_datamoshAmount;

          // 3. Central Reactor SDF
          vec2 center = vec2(0.5) + vec2(sin(u_time * 0.8) * 0.08, cos(u_time * 0.6) * 0.05);
          float distToCenter = distance(warpedUv, center);
          
          // Demoscene plasma background
          float plasma = sin(warpedUv.x * 4.0 + u_time) * 0.5 + sin(warpedUv.y * 5.0 - u_time * 0.8) * 0.5;
          plasma += sin(distToCenter * 10.0 - u_time * 1.5) * 0.3;

          vec3 baseDark = vec3(0.08, 0.02, 0.22); // Deep indigo
          vec3 baseBright = vec3(0.0, 0.94, 1.0); // Electric cyan
          vec3 bgPlasma = oklabMix(baseDark, vec3(0.45, 0.0, 0.5), clamp(plasma * 0.5 + 0.5, 0.0, 1.0));

          // 4. Iridophore Bragg reflection layers
          float cosTheta = mix(0.75, 1.0, 0.5 + 0.5 * sin(u_time * 0.6 + warpedUv.y * 3.0));
          vec3 iriGlow = braggColor(mix(190.0, 240.0, sin(u_time * 0.4 + warpedUv.x * 2.0) * 0.5 + 0.5), cosTheta);
          bgPlasma += iriGlow * 0.35;

          // 5. Cuttlefish Chromatophores (Muscle Pigment Cells)
          float cellGridSize = 24.0;
          vec2 cellId = floor(warpedUv * cellGridSize);
          vec2 localCell = fract(warpedUv * cellGridSize) - 0.5;

          float chromatophoreActive = 0.0;
          vec3 pigmentColor = vec3(0.0);

          // Neighbor search for cell coverage
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 neighborId = cellId + vec2(float(x), float(y));
              vec2 jitter = hash22(neighborId) * 0.4;
              vec2 cellCenter = neighborId + 0.5 + jitter;

              float activation = sin(dot(cellCenter, vec2(1.0, 0.3)) * 4.0 - u_time * 3.0) * 0.5 + 0.5;
              activation = mix(activation, noise2d(cellCenter * 2.0 + u_time * 0.5), 0.5);

              float d = distance(warpedUv * cellGridSize, cellCenter);
              float r = 0.25 * (1.0 + 1.25 * activation); // grow with activation

              float cov = smoothstep(r, r * 0.6, d);
              if (cov > chromatophoreActive) {
                chromatophoreActive = cov;
                // Determine pigment class
                float pClass = mod(hash21(neighborId) * 10.0, 3.0);
                if (pClass < 1.0) {
                  pigmentColor = vec3(0.91, 0.72, 0.29); // Yellow
                } else if (pClass < 2.0) {
                  pigmentColor = vec3(0.71, 0.31, 0.16); // Red
                } else {
                  pigmentColor = vec3(0.16, 0.10, 0.07); // Brown/Black
                }
              }
            }
          }

          vec3 skinColor = oklabMix(bgPlasma, pigmentColor, chromatophoreActive * 0.85);

          // 6. Central Reactor (Demoscene geometry)
          float pulse = 0.4 + 0.08 * sin(u_time * 5.0) + 0.06 * surge;
          float ring1 = abs(distToCenter - pulse) - 0.02;
          float ring2 = abs(distToCenter - (pulse - 0.1)) - 0.01;
          
          float reactorMask = smoothstep(0.01, -0.01, ring1) + smoothstep(0.01, -0.01, ring2);
          vec3 reactorColor = oklabMix(skinColor, vec3(1.0, 0.18, 0.59), reactorMask); // Hot pink

          // Rays pulsing outwards
          float rayAngle = atan(warpedUv.y - center.y, warpedUv.x - center.x);
          float rays = sin(rayAngle * 8.0 + u_time * 4.0) * sin(rayAngle * 3.0 - u_time * 2.0);
          rays = smoothstep(0.1, 0.9, rays) * step(distToCenter, pulse * 1.5) * step(0.1, distToCenter);
          reactorColor = oklabMix(reactorColor, vec3(0.66, 1.0, 0.24), rays * 0.5); // Chartreuse

          // 7. Halftone / Mosaic Overlay
          float htVal = halftone(warpedUv, 80.0, 0.26, 0.45); // Screen-tone transition
          reactorColor = mix(reactorColor, vec3(0.1, 0.0, 0.18) * reactorColor, htVal * 0.25);

          // 8. Chromatic Aberration (fringe offset ghosts)
          float abOffset = 0.006 * u_chromaticSpread * (1.0 + 0.5 * surge);
          vec3 abColor;
          abColor.r = reactorColor.r;
          abColor.g = oklabMix(reactorColor, vec3(0.0, 1.0, 0.5), 0.15).g; // Tinted green shift
          abColor.b = oklabMix(reactorColor, vec3(0.5, 0.0, 1.0), 0.25).b; // Tinted violet shift

          // 9. Anamorphic Lens Flares (Compose horizontal laser lines)
          float flare1 = exp(-pow(warpedUv.y - center.y, 2.0) / (0.001 * u_flareEnergy));
          float flare2 = exp(-pow(warpedUv.y - (center.y + sin(u_time)*0.1), 2.0) / (0.0003 * u_flareEnergy));
          vec3 flareGlow = vec3(0.0, 0.94, 1.0) * flare1 * (0.6 + 0.4 * sin(u_time * 10.0))
                         + vec3(1.0, 0.2, 0.8) * flare2 * 0.4;
          abColor += flareGlow * 0.8;

          // 10. Early Internet Browser / UI Popup Debris
          vec2 popupCenter = vec2(0.75, 0.75) + vec2(sin(u_time * 0.4) * 0.05, cos(u_time * 0.3) * 0.05);
          vec2 popupSize = vec2(0.16, 0.12);
          vec2 dPopup = abs(warpedUv - popupCenter) - popupSize;
          float popupInside = step(max(dPopup.x, dPopup.y), 0.0);
          float popupBorder = step(max(dPopup.x, dPopup.y), 0.0) * step(0.0, max(dPopup.x, dPopup.y) + 0.004);

          // Render inside popup
          if (popupInside > 0.5) {
            vec2 textUv = (warpedUv - (popupCenter - popupSize)) / (popupSize * 2.0);
            vec2 glyphGrid = floor(textUv * vec2(15.0, 10.0));
            vec2 glyphFrac = fract(textUv * vec2(15.0, 10.0));
            
            float charMask = glyph(glyphFrac, glyphGrid.x + glyphGrid.y * 13.0 + floor(u_time * 4.0));
            // Keep it colorful
            vec3 popupBg = vec3(0.1, 0.02, 0.2); 
            vec3 textCol = vec3(0.66, 1.0, 0.24); // Chartreuse text
            abColor = mix(popupBg, textCol, charMask * step(0.1, hash21(glyphGrid + floor(u_time * 2.0))));
          }
          abColor = mix(abColor, vec3(1.0, 0.2, 0.8), popupBorder); // Magenta borders

          // 11. Final CRT Phosphor & Scanline Emulation
          float colMask = mod(gl_FragCoord.x, 3.0);
          vec3 phosphorStripe = vec3(
            smoothstep(1.0, 0.0, abs(colMask - 0.5)),
            smoothstep(1.0, 0.0, abs(colMask - 1.5)),
            smoothstep(1.0, 0.0, abs(colMask - 2.5))
          );
          abColor *= mix(vec3(1.0), phosphorStripe, 0.25);

          // Damper Wires
          float w1 = exp(-pow(uv.y - 0.33, 2.0) / 0.0004);
          float w2 = exp(-pow(uv.y - 0.66, 2.0) / 0.0004);
          abColor *= 1.0 - 0.15 * (w1 + w2);

          // Scanline modulation
          float scanline = 0.5 + 0.5 * sin(uv.y * u_resolution.y * 3.14159);
          abColor *= 1.0 - 0.2 * (1.0 - scanline);

          // 12. Absolute Color Law & Safety Pass
          abColor = max(abColor, vec3(0.06, 0.01, 0.15)); // Lift absolute blacks to rich indigo
          abColor = min(abColor, vec3(0.98, 0.95, 0.90)); // Warm clamp highlights

          fragColor = vec4(abColor, 1.0);
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

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms) {
  material.uniforms.u_time.value = time;
  material.uniforms.u_resolution.value.set(grid.width, grid.height);
  if (mouse) {
    material.uniforms.u_mouse.value.set(mouse.x / grid.width, mouse.y / grid.height);
  }
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);