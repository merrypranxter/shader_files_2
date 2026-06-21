if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      in vec2 vUv;
      out vec4 fragColor;

      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec2 u_mouse;
      uniform float u_intensity;
      uniform float u_glitch;

      // ─── Pseudo-random Hash ───
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      // ─── 2D Value Noise ───
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                   mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
      }

      // ─── Fractal Brownian Motion ───
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 3; i++) {
          v += a * noise(p);
          p *= 2.0;
          a *= 0.5;
        }
        return v;
      }

      // ─── Perceptual OKLab ↔ RGB Transformations ───
      vec3 oklab_to_rgb(vec3 c) {
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

      vec3 rgb_to_oklab(vec3 c) {
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

      // ─── 2D Box Signed Distance Field ───
      float sdBox(vec2 p, vec2 b) {
        vec2 d = abs(p) - b;
        return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
      }

      // ─── Core Scene Generator ───
      vec3 getSceneColor(vec2 uv) {
        // 1. Datamosh Macroblock Jitter & Smear
        vec2 blockUv = floor(uv * 18.0) / 18.0;
        vec2 warpedUv = uv;
        if (u_glitch > 0.05) {
          warpedUv += (vec2(hash(blockUv), hash(blockUv + 9.1)) - 0.5) * 0.08 * u_glitch;
        }
        // Continuous P-frame drift
        warpedUv.x += sin(warpedUv.y * 3.0 + u_time) * 0.008 * (u_intensity + u_glitch);

        // 2. Base Perceptual Color Field (Cuttlefish Wave / Plasma)
        float n1 = fbm(warpedUv * 3.2 + u_time * 0.4);
        float n2 = fbm(warpedUv * 5.4 - u_time * 0.3);

        vec3 neonPink = vec3(0.98, 0.02, 0.62);
        vec3 electricCyan = vec3(0.0, 0.93, 1.0);
        vec3 chartreuse = vec3(0.68, 0.98, 0.0);
        vec3 deepPlum = vec3(0.18, 0.0, 0.32);

        vec3 labPink = rgb_to_oklab(neonPink);
        vec3 labCyan = rgb_to_oklab(electricCyan);
        vec3 labChart = rgb_to_oklab(chartreuse);
        vec3 labPlum = rgb_to_oklab(deepPlum);

        vec3 bgLab = mix(mix(labPlum, labCyan, n1), mix(labPink, labChart, n2), 0.5);
        vec3 bgColor = oklab_to_rgb(bgLab);

        // 3. Central Reactor (Demoscene Ornament + Cuttlefish Chromatophore)
        vec2 p = (warpedUv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);

        // Apply Rotation
        float angle = u_time * 0.65;
        mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
        p = rot * p;

        // 6-fold Cyclic Symmetry
        float a = atan(p.y, p.x);
        float r = length(p);
        float segments = 6.0;
        float ma = mod(a, 6.2831853 / segments) - 0.5 * (6.2831853 / segments);
        vec2 symP = r * vec2(cos(ma), sin(ma));

        // Reactor SDF
        float d1 = length(symP) - 0.23;
        float d2 = abs(length(symP - vec2(0.26, 0.0)) - 0.05) - 0.01;
        float d = min(d1, d2);

        // Outer orbiting ring
        float ring = abs(length(p) - 0.36) - 0.01;
        d = min(d, ring);

        // Glow evaluation
        float glow = exp(-28.0 * d);
        vec3 glowColor = oklab_to_rgb(mix(labPink, labCyan, 0.5 + 0.5 * sin(u_time * 2.0 + r * 8.0))) * glow * 1.8;

        vec3 finalColor = bgColor;
        if (d < 0.0) {
          // Chromatophore cells pulsing inside reactor
          float cellPattern = sin(symP.x * 55.0) * cos(symP.y * 55.0);
          float pulse = sin(u_time * 4.5 - r * 15.0);
          float act = smoothstep(0.0, 0.12, cellPattern + pulse);

          vec3 cellColor = mix(neonPink, chartreuse, act);
          finalColor = mix(finalColor, cellColor, 0.75);
        }
        finalColor += glowColor;

        // 4. Anamorphic Lens Flare
        float streak = exp(-160.0 * abs(p.y)) * (1.0 + 0.35 * sin(p.x * 12.0 - u_time * 9.0));
        vec3 flareColor = vec3(
            exp(-90.0 * abs(p.y - 0.007)),
            exp(-90.0 * abs(p.y)),
            exp(-90.0 * abs(p.y + 0.007))
        ) * streak * 2.2;
        finalColor += flareColor * vec3(0.4, 0.85, 1.0);

        // 5. Halftone Mosaic Orbiting Blocks
        float blockSdf = sdBox(symP - vec2(0.34, 0.08), vec2(0.07, 0.04));
        if (blockSdf < 0.0) {
          vec2 halftoneGrid = fract(warpedUv * 110.0) - 0.5;
          float dotRadius = 0.46 * (0.5 + 0.5 * sin(u_time * 3.5 + warpedUv.x * 12.0));
          float dotMask = smoothstep(dotRadius, dotRadius - 0.07, length(halftoneGrid));
          finalColor = mix(finalColor, electricCyan, dotMask * 0.85);
        }

        // 6. Early Internet Popup Debris
        vec2 popupPos = vec2(0.38 * sin(u_time * 0.4), 0.32 * cos(u_time * 0.3));
        float popupSdf = sdBox(p - popupPos, vec2(0.16, 0.11));
        if (popupSdf < 0.0) {
          float border = sdBox(p - popupPos, vec2(0.16, 0.11));
          float inside = sdBox(p - popupPos, vec2(0.15, 0.10));
          float titleBar = sdBox(p - (popupPos + vec2(0.0, 0.085)), vec2(0.15, 0.015));

          if (inside > -0.004) {
            finalColor = neonPink; // Neon pink window frame
          } else if (titleBar < 0.0) {
            finalColor = electricCyan; // Electric cyan title bar
          } else {
            finalColor = oklab_to_rgb(mix(labPlum, labCyan, 0.25));
            // Asemic text lines
            float textLine = step(0.85, sin(p.y * 110.0)) * step(abs(p.x - popupPos.x), 0.11);
            finalColor = mix(finalColor, chartreuse, textLine * 0.35);
          }
        }

        return finalColor;
      }

      void main() {
        float caOffset = 0.005 * u_intensity;

        // Chromatic Aberration sampling
        float r = getSceneColor(vUv + vec2(caOffset, 0.0)).r;
        float g = getSceneColor(vUv).g;
        float b = getSceneColor(vUv - vec2(caOffset, 0.0)).b;
        vec3 finalColor = vec3(r, g, b);

        // CRT Scanline Modulation
        float scanline = 0.65 + 0.35 * sin(vUv.y * u_resolution.y * 3.14159);
        finalColor *= mix(1.0, scanline, 0.22);

        // Subpixel Phosphor Triad Mask
        float colIdx = mod(gl_FragCoord.x, 3.0);
        vec3 triad = vec3(
          smoothstep(1.0, 0.0, abs(colIdx - 0.5)),
          smoothstep(1.0, 0.0, abs(colIdx - 1.5)),
          smoothstep(1.0, 0.0, abs(colIdx - 2.5))
        );
        finalColor *= mix(vec3(1.0), triad, 0.12);

        // Color Safety Pass (Deep chromatic darks, non-blown highlights)
        finalColor = max(finalColor, vec3(0.08, 0.04, 0.12)); // Saturated plum darks
        finalColor = min(finalColor, vec3(0.96, 1.0, 0.96));

        fragColor = vec4(finalColor, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
        u_intensity: { value: 0.8 },
        u_glitch: { value: 0.0 }
      },
      vertexShader,
      fragmentShader
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    canvas.__three = { renderer, scene, camera, material };
  } catch (e) {
    console.error("Phosphor Reef WebGL Initialization Failed:", e);
    return;
  }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms) {
  // Update time
  material.uniforms.u_time.value = time;

  // Sync resolution
  material.uniforms.u_resolution.value.set(grid.width, grid.height);

  // Update mouse
  if (mouse) {
    material.uniforms.u_mouse.value.set(mouse.x / grid.width, mouse.y / grid.height);
  }

  // Periodic visual surge/glitch trigger
  let glitchVal = 0.0;
  if (Math.sin(time * 1.5) > 0.82 && Math.sin(time * 4.0) > 0.0) {
    glitchVal = Math.random() * 0.7 + 0.3;
  }
  material.uniforms.u_glitch.value = glitchVal;
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);