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
        u_intensity: { value: 0.8 },
        u_glitch: { value: 0.5 }
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
        uniform float u_intensity;
        uniform float u_glitch;

        // --- HASH & NOISE UTILITIES ---
        float hash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 19.19);
          return fract(p.x * p.y);
        }

        vec2 hash22(vec2 p) {
          p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
          return fract(sin(p) * 43758.5453);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p *= 2.0;
            a *= 0.5;
          }
          return v;
        }

        // --- OKLAB COLOR SPACE TRANSFORMS ---
        vec3 linearSRGB_to_OKLab(vec3 c) {
          float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
          float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
          float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;

          float l_ = sign(l) * pow(abs(l), 1.0/3.0);
          float m_ = sign(m) * pow(abs(m), 1.0/3.0);
          float s_ = sign(s) * pow(abs(s), 1.0/3.0);

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
          vec3 labA = linearSRGB_to_OKLab(colA);
          vec3 labB = linearSRGB_to_OKLab(colB);
          return OKLab_to_linearSRGB(mix(labA, labB, t));
        }

        // --- MAIN GEOMETRY AND SYNTHESIS ---
        void main() {
          // 1. Curved Screen Barrel Distortion (CRT geometry)
          vec2 uv = vUv - 0.5;
          float r2 = dot(uv, uv);
          vec2 distortedUV = uv * (1.0 + 0.15 * r2 + 0.05 * r2 * r2) + 0.5;

          // Out-of-bounds screen edge mask
          if (distortedUV.x < 0.0 || distortedUV.x > 1.0 || distortedUV.y < 0.0 || distortedUV.y > 1.0) {
            fragColor = vec4(0.02, 0.01, 0.05, 1.0);
            return;
          }

          // 2. Datamosh / Macroblock Displacement
          float glitchPulse = step(0.8, sin(u_time * 1.5)) * u_glitch;
          vec2 blockId = floor(distortedUV * 24.0);
          vec2 blockOffset = (hash22(blockId + floor(u_time * 8.0)) - 0.5) * 0.06 * glitchPulse;
          vec2 sampleUV = clamp(distortedUV + blockOffset, 0.0, 1.0);

          // Coordinates in aspect-corrected space
          vec2 p = sampleUV - 0.5;
          p.x *= u_resolution.x / u_resolution.y;
          float rad = length(p);
          float theta = atan(p.y, p.x);

          // 3. Chromatic Palette definitions (sRGB)
          vec3 c_indigo   = vec3(0.05, 0.01, 0.18);
          vec3 c_violet   = vec3(0.18, 0.02, 0.25);
          vec3 c_cyan     = vec3(0.00, 0.85, 1.00);
          vec3 c_magenta  = vec3(1.00, 0.00, 0.75);
          vec3 c_yellow   = vec3(0.95, 0.90, 0.10);
          vec3 c_teal     = vec3(0.02, 0.45, 0.40);
          vec3 c_orange   = vec3(1.00, 0.45, 0.10);

          // 4. Background Field (Plasma & Cuttlefish Wavefield)
          float wave1 = sin(rad * 12.0 - u_time * 2.5 + theta * 3.0);
          float wave2 = cos(p.x * 10.0 + sin(u_time + p.y * 8.0));
          float bgMix = smoothstep(-0.5, 0.5, wave1 * wave2);
          vec3 bgCol = oklabMix(c_indigo, c_violet, bgMix);
          bgCol = oklabMix(bgCol, c_teal, fbm(p * 3.0 + u_time * 0.2));

          // 5. Central Reactor Core (SDF + Demoscene Portal)
          float pulse = 0.35 + 0.08 * sin(u_time * 4.0 + rad * 5.0);
          // Modulate core edge with gear teeth
          float teeth = cos(theta * 10.0 - u_time * 3.0) * 0.03;
          float coreDist = rad - pulse - teeth;
          float coreMask = smoothstep(0.01, -0.01, coreDist);

          vec3 coreCol = oklabMix(c_magenta, c_yellow, 0.5 + 0.5 * sin(u_time * 2.0 + rad * 15.0));
          coreCol = oklabMix(coreCol, c_cyan, smoothstep(0.1, -0.1, abs(rad - 0.2)));

          // Combine Core and Background
          vec3 finalScene = mix(bgCol, coreCol, coreMask);

          // 6. Cuttlefish Chromatophores (Voronoi Grid Overlay)
          vec2 g = sampleUV * 30.0;
          vec2 g_id = floor(g);
          vec2 g_f = fract(g);
          float minCellDist = 8.0;
          vec2 nearestCellId = vec2(0.0);
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 neighbor = vec2(float(x), float(y));
              vec2 cellPoint = hash22(g_id + neighbor);
              // Animate cell pulsation
              cellPoint = 0.5 + 0.4 * sin(u_time * 1.5 + cellPoint * 6.283);
              float d = length(neighbor + cellPoint - g_f);
              if (d < minCellDist) {
                minCellDist = d;
                nearestCellId = g_id + neighbor;
              }
            }
          }
          float cellActivation = noise(nearestCellId * 0.4 + u_time);
          float cellRadius = 0.12 + 0.28 * cellActivation;
          float chromatophoreMask = smoothstep(cellRadius, cellRadius - 0.06, minCellDist);
          vec3 chromCol = oklabMix(c_orange, c_magenta, cellActivation);
          
          finalScene = mix(finalScene, chromCol, chromatophoreMask * 0.65);

          // 7. Halftone / Mosaic Interference Pattern
          vec2 halftoneGrid = sampleUV * u_resolution.x / 14.0;
          // Rotate grid 30 degrees to minimize moire alignment artifacts
          float hCos = 0.866; float hSin = 0.5;
          vec2 rotHalftone = vec2(halftoneGrid.x * hCos - halftoneGrid.y * hSin, halftoneGrid.x * hSin + halftoneGrid.y * hCos);
          vec2 h_f = fract(rotHalftone) - 0.5;
          float luma = dot(finalScene, vec3(0.299, 0.587, 0.114));
          float dotRadius = 0.45 * (1.0 - luma);
          float halftoneMask = smoothstep(dotRadius, dotRadius - 0.15, length(h_f));
          
          // Inject halftone dots as deep colorful punctures
          finalScene = mix(finalScene, c_indigo * 0.4, halftoneMask * 0.45);

          // 8. Early Internet / Glitchcore Debris (Floating UI Windows & Glyphs)
          float uiSeed = hash21(floor(sampleUV * 6.0) + floor(u_time * 1.5));
          float uiMask = step(0.97 - 0.04 * glitchPulse, uiSeed);
          vec2 localUI = fract(sampleUV * 6.0);
          float uiBorder = step(0.05, localUI.x) * step(0.05, localUI.y) * step(localUI.x, 0.95) * step(localUI.y, 0.95);
          vec3 uiColor = oklabMix(c_yellow, c_cyan, hash21(vec2(uiSeed)));
          uiColor = mix(uiColor * 0.5, uiColor, uiBorder);
          
          finalScene = mix(finalScene, uiColor, uiMask * 0.7);

          // 9. Anamorphic Lens Flare Line (Horizontal Laser)
          float flareY = 0.5 + 0.12 * sin(u_time * 0.5);
          float flareDist = abs(sampleUV.y - flareY);
          float flareLine = exp(-pow(flareDist / 0.015, 2.0));
          vec3 flareColor = vec3(
            exp(-pow((flareDist - 0.008) / 0.01, 2.0)),
            exp(-pow(flareDist / 0.01, 2.0)),
            exp(-pow((flareDist + 0.008) / 0.01, 2.0))
          ) * c_cyan * 1.5;

          finalScene += flareColor * flareLine * u_intensity;

          // 10. Chromatic Aberration (Radial Shift)
          float aberr = 0.018 * u_intensity;
          vec2 radialDir = normalize(sampleUV - 0.5);
          float rChan = mix(finalScene.r, mix(finalScene, c_magenta, 0.2).r, step(0.5, hash21(sampleUV + radialDir * aberr)));
          float gChan = finalScene.g;
          float bChan = mix(finalScene.b, mix(finalScene, c_cyan, 0.2).b, step(0.5, hash21(sampleUV - radialDir * aberr)));
          vec3 compositeScene = vec3(rChan, gChan, bChan);

          // 11. CRT Phosphor Mask, Scanlines, and Final Color Safety
          // Non-black/non-white safety clamp to preserve rich chromatic darks
          compositeScene = clamp(compositeScene, vec3(0.08, 0.02, 0.12), vec3(0.94, 0.90, 0.95));

          // Scanline modulation
          float scanline = 0.7 + 0.3 * sin(distortedUV.y * u_resolution.y * 3.14159);
          compositeScene *= scanline;

          // Subpixel aperture grille phosphor mask
          float subpixel = mod(gl_FragCoord.x, 3.0);
          vec3 phosphorMask = vec3(
            smoothstep(1.2, 0.0, abs(subpixel - 0.5)),
            smoothstep(1.2, 0.0, abs(subpixel - 1.5)),
            smoothstep(1.2, 0.0, abs(subpixel - 2.5))
          );
          compositeScene *= mix(vec3(1.0), phosphorMask, 0.35);

          // Rolling refresh bar (subtle brightness lift)
          float refreshBar = fract(u_time * 0.25);
          float barDist = abs(distortedUV.y - refreshBar);
          float barGlow = exp(-pow(barDist / 0.04, 2.0)) * 0.12;
          compositeScene += vec3(barGlow);

          fragColor = vec4(compositeScene, 1.0);
        }
      `
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    canvas.__three = { renderer, scene, camera, material };
  } catch (e) {
    console.error("WebGL Initialisation Failed:", e);
  }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms) {
  material.uniforms.u_time.value = time;
  material.uniforms.u_resolution.value.set(grid.width, grid.height);
  material.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - (mouse.y / grid.height));
  material.uniforms.u_intensity.value = mouse.isPressed ? 1.0 : 0.75;
  material.uniforms.u_glitch.value = 0.3 + 0.7 * Math.sin(time * 0.8) * Math.cos(time * 2.3);
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);