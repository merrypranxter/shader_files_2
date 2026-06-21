if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const fragmentShaderSource = `
      precision highp float;

      in vec2 vUv;
      out vec4 fragColor;

      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec2 u_mouse;
      uniform float u_intensity;
      uniform float u_density;
      uniform float u_motionSpeed;
      uniform float u_chromaticSpread;
      uniform float u_datamoshAmount;
      uniform float u_halftoneScale;
      uniform float u_flareEnergy;
      uniform float u_chromatophoreActivity;

      // --- Helper Functions ---
      float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 345.45));
          p += dot(p, p + 34.345);
          return fract(p.x * p.y);
      }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
              mix(hash(i),             hash(i + vec2(1.0, 0.0)), f.x),
              mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
              f.y
          );
      }

      float hash(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
      }

      float fbm(vec2 p) {
          float sum = 0.0;
          float amp = 0.5;
          float freq = 1.0;
          for (int i = 0; i < 4; i++) {
              sum += amp * noise(p * freq);
              freq *= 2.0;
              amp *= 0.5;
          }
          return sum;
      }

      // --- OKLab Conversions ---
      vec3 rgbToOklab(vec3 c) {
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

      // ─── Background Plasma Reef ──────────────────────────────────────────────
      vec3 getPlasmaReef(vec2 uv, float t) {
          float scale = 4.0;
          float v1 = sin(uv.x * scale + t);
          float v2 = sin(uv.y * scale + t * 1.5);
          float v3 = sin((uv.x + uv.y) * scale + t * 0.8);
          float v4 = sin(sqrt(uv.x * uv.x + uv.y * uv.y) * scale - t * 1.2);
          float p = (v1 + v2 + v3 + v4) * 0.25;

          // Saturated Chromatic Darks and Brights
          vec3 indigo = vec3(0.05, 0.0, 0.15);
          vec3 teal = vec3(0.0, 0.4, 0.35);
          vec3 hotPink = vec3(1.0, 0.0, 0.6);
          vec3 chartreuse = vec3(0.65, 1.0, 0.0);

          vec3 darkBase = oklabMix(indigo, teal, sin(t * 0.2) * 0.5 + 0.5);
          vec3 brightBase = oklabMix(hotPink, chartreuse, p * 0.5 + 0.5);

          return oklabMix(darkBase, brightBase, smoothstep(-0.2, 0.6, p));
      }

      // ─── Central Reactor SDF ─────────────────────────────────────────────────
      vec2 rotateVec(vec2 v, float a) {
          float s = sin(a);
          float c = cos(a);
          return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
      }

      float sdGear(vec2 p, float r, float teeth, float toothHeight, float angle) {
          vec2 pr = rotateVec(p, angle);
          float a = atan(pr.y, pr.x);
          float d = length(pr) - r - sin(a * teeth) * toothHeight;
          return d;
      }

      float sdCuttlefishPupil(vec2 p, float size) {
          float d = length(p) - size;
          float wave = sin(atan(p.y, p.x) * 3.0) * size * 0.25;
          return d + wave;
      }

      vec3 renderReactor(vec2 uv, float t) {
          vec2 p = uv;
          float t_mod = t * u_motionSpeed;
          
          float pulse = 1.0 + 0.15 * sin(t_mod * 3.0) * u_chromatophoreActivity;
          
          float dGear = sdGear(p, 0.35 * pulse, 8.0, 0.04 * pulse, t_mod * 0.5);
          float dPupil = sdCuttlefishPupil(p, 0.16 * pulse);
          
          float glowGear = exp(-abs(dGear) * 20.0) * 1.5;
          float glowPupil = exp(-abs(dPupil) * 30.0) * 2.0;
          
          float hScale = u_halftoneScale * u_density;
          vec2 grid = fract(p * hScale) - 0.5;
          float dotPattern = step(length(grid), 0.35 + 0.15 * sin(t_mod + p.x * 2.0));
          
          vec3 gearColor = getGoldenAngleColor(1.0, t_mod * 0.1);
          vec3 pupilColor = getGoldenAngleColor(4.0, t_mod * 0.1 + 0.5);
          
          vec3 col = vec3(0.0);
          
          if (dGear < 0.0) {
              col = mix(gearColor * 0.3, gearColor * 1.4, dotPattern);
          }
          col += gearColor * glowGear;
          
          if (dPupil < 0.0) {
              col = oklabMix(col, pupilColor * 1.5, 0.8);
          }
          col += pupilColor * ...; // Glow overlay
          col += pupilColor * glow_intensity;
          return col;
      }

      // ─── Datamosh Displacement Field ─────────────────────────────────────────
      vec2 applyDatamosh(vec2 uv, float t) {
          float t_mod = t * u_motionSpeed;
          float blocks = mix(16.0, 64.0, u_density);
          vec2 blockId = floor(uv * blocks) / blocks;
          
          float blockHash = hash21(blockId);
          float burstCycle = sin(t_mod * 0.5) * 0.5 + 0.5;
          float isCorrupted = step(1.0 - u_datamoshAmount * burstCycle, blockHash);
          
          float angle = noise(blockId * 4.0 + t_mod * 0.2) * 6.2831853;
          vec2 motionVec = vec2(cos(angle), sin(angle)) * 0.06 * u_datamoshAmount;
          
          return uv + motionVec * isCorrupted;
      }

      // ─── Full Scene Assembly ─────────────────────────────────────────────────
      vec3 sampleScene(vec2 uv, float t) {
          vec3 bg = renderReefPlasma(uv, t);
          vec3 reactor = renderReactor(uv - vec2(0.5), t);
          return bg + reactor;
      }

      // ─── Chromatic Aberration ────────────────────────────────────────────────
      vec3 applyChromaticAberration(vec2 uv, float t) {
          vec2 toCenter = uv - vec2(0.5);
          vec2 dir = normalize(toCenter + vec2(1e-5));
          float dist = length(toCenter);
          
          float spread = u_chromaticSpread * dist * 0.15;
          
          float r = sampleScene(uv + dir * spread, t).r;
          float g = sampleScene(uv, t).g;
          float b = sampleScene(uv - dir * spread, t).b;
          
          return vec3(r, g, b);
      }

      // ─── Anamorphic Flare ────────────────────────────────────────────────────
      vec3 renderAnamorphicFlare(vec2 uv, float t) {
          float t_mod = t * u_motionSpeed;
          vec2 p = uv - vec2(0.5);
          
          float distToLine = abs(p.y - 0.05 * sin(t_mod * 2.0));
          float flareLine = exp(-distToLine * 120.0) * u_flareEnergy;
          
          vec3 flareColor = getGoldenAngleColor(2.0, t_mod * 0.05) * 1.5;
          vec3 finalFlare = flareColor * flareLine;
          
          for (float k = -3.0; k <= 3.0; k += 1.0) {
              if (k == 0.0) continue;
              vec2 ghostCenter = vec2(k * 0.25 * sin(t_mod * 0.5), 0.05 * sin(t_mod * 2.0));
              float distToGhost = length(p - ghostCenter);
              float ghostGlow = exp(-distToGhost * 35.0) * 0.15 * u_flareEnergy;
              vec3 ghostColor = getGoldenAngleColor(abs(k) * 3.0, t_mod * 0.1);
              finalFlare += ghostColor * ghostGlow;
          }
          
          return finalFlare;
      }

      // ─── Interface Debris ────────────────────────────────────────────────────
      vec3 renderInterfaceDebris(vec2 uv, float t) {
          float t_mod = t * u_motionSpeed;
          vec3 col = vec3(0.0);
          
          for (float i = 1.0; i <= 3.0; i += 1.0) {
              float h = hash21(vec2(i, 42.0));
              vec2 wPos = vec2(
                  sin(t_mod * 0.3 * i + h * 6.28) * 0.4 + 0.5,
                  cos(t_mod * 0.2 * i + h * 3.14) * 0.3 + 0.5
              );
              vec2 wSize = vec2(0.15 + 0.05 * h, 0.1 + 0.05 * h);
              
              vec2 distToBox = abs(uv - wPos) - wSize;
              float boxSDF = max(distToBox.x, distToBox.y);
              
              float borderGlow = exp(-abs(boxSDF) * 150.0) * 1.2;
              vec3 borderColor = getGoldenAngleColor(i * 5.0, t_mod * 0.1);
              col += borderColor * borderGlow;
              
              if (boxSDF < 0.0) {
                  vec2 localUv = (uv - wPos) / wSize;
                  vec2 grid = floor(localUv * 8.0);
                  float blockHash = hash21(grid + i * 17.3);
                  float textMask = step(0.4, blockHash) * step(abs(localUv.y), 0.8) * step(abs(localUv.x), 0.8);
                  col = oklabMix(col, borderColor * 0.6, textMask * 0.3);
              }
          }
          return col;
      }

      // ─── CRT Emulation ───────────────────────────────────────────────────────
      vec3 applyCRT(vec3 color, vec2 uv, float t) {
          float t_mod = t * u_motionSpeed;
          
          float scanline = 0.8 + 0.2 * sin(uv.y * u_resolution.y * 3.14159);
          
          float rollY = fract(uv.y - t_mod * 0.15);
          float rollBar = exp(-abs(rollY - 0.5) * 15.0) * 0.12;
          
          float pixelX = uv.x * u_resolution.x;
          float subpixel = mod(pixelX, 3.0);
          vec3 triad = vec3(0.0);
          if (subpixel < 1.0) triad.r = 1.2;
          else if (subpixel < 2.0) triad.g = 1.2;
          else triad.b = 1.2;
          
          vec3 crtColor = color * scanline * (1.0 + rollBar);
          crtColor = mix(crtColor, crtColor * triad, 0.25 * u_intensity);
          
          return crtColor;
      }

      // ─── Color Safety Pass (Absolute Color Law) ──────────────────────────────
      vec3 colorSafetyStage(vec3 color) {
          vec3 lab = rgbToOklab(color);
          
          float lowL = 0.15;
          float highL = 0.95;
          
          vec3 darkTint = vec3(0.08, 0.0, 0.2);
          vec3 brightTint = vec3(0.85, 0.05, -0.15);
          
          if (lab.x < lowL) {
              float t = smoothstep(0.0, lowL, lab.x);
              lab.x = mix(lowL, lab.x, t);
              lab.yz = mix(darkTint.yz * 0.6, lab.yz, t);
          }
          
          if (lab.x > highL) {
              float t = smoothstep(1.0, highL, lab.x);
              lab.x = mix(highL, lab.x, t);
              lab.yz = mix(brightTint.yz * 0.8, lab.yz, t);
          }
          
          float chroma = length(lab.yz);
          if (chroma < 0.05) {
              float hRad = fract(u_time * 0.05) * 6.2831853;
              lab.yz = vec2(cos(hRad), sin(hRad)) * 0.08;
          }
          
          return oklabToRgb(lab);
      }

      void main() {
          vec2 moshedUv = applyDatamosh(vUv, u_time);
          vec3 sceneCol = applyChromaticAberration(moshedUv, u_time);
          vec3 flareCol = renderAnamorphicFlare(vUv, u_time);
          vec3 debrisCol = renderInterfaceDebris(vUv, u_time);
          
          vec3 finalCol = sceneCol + flareCol + debrisCol;
          finalCol = applyCRT(finalCol, vUv, u_time);
          finalCol = colorSafetyStage(finalCol);
          
          fragColor = vec4(finalCol, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
        u_intensity: { value: 0.8 },
        u_density: { value: 0.75 },
        u_motionSpeed: { value: 1.0 },
        u_chromaticSpread: { value: 0.05 },
        u_datamoshAmount: { value: 0.5 },
        u_halftoneScale: { value: 24.0 },
        u_flareEnergy: { value: 0.8 },
        u_chromatophoreActivity: { value: 0.6 }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: fragmentShaderSource.replace('col += pupilColor * ...; // Glow overlay\n          col += pupilColor * glow_intensity;\n          return col;', 'col += pupilColor * glowPupil; return col;')
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