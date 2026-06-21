// PHOSPHOR SIGNAL REEF ENGINE — Fused Alchemical Masterpiece by The Weird Code Guy
// Fusing: cuttlefish_chromatics (live display stack) + vhs_analog_artifacts (signal decay)
// + color_systems (perceptual OKLab spaces) + glitchcore_style (hyperpop rupture energy)

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
        u_intensity: { value: 0.85 }
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

        // ─── Mathematical Noise & PRNG ───
        float hash21(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise2d(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
                       mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.x);
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

        // ─── Early Internet / Glitchcore Window SDF ───
        float sdRoundBox(vec2 p, vec2 b, vec4 r) {
            vec2 q = abs(p) - b + vec2(r.x, r.y);
            return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r.x;
        }

        vec3 drawWindow(vec2 uv, vec2 pos, vec2 size, vec3 baseColor, float t) {
            vec2 p = uv - pos;
            float angle = sin(t * 0.4 + pos.x) * 0.08;
            float cosA = cos(angle);
            float sinA = sin(angle);
            p = vec2(p.x * cosA - p.y * sinA, p.x * sinA + p.y * cosA);

            float d = sdRoundBox(p, size, vec4(0.008, 0.008, 0.008, 0.008));
            float border = smoothstep(0.004, 0.0, abs(d));
            float fill = step(d, 0.0);

            float headerY = size.y - 0.035;
            float isHeader = step(headerY, p.y) * step(p.y, size.y) * step(abs(p.x), size.x);

            float pattern = sin((p.x - p.y) * 90.0) * 0.5 + 0.5;
            pattern = step(0.82, pattern);

            vec3 winColor = mix(baseColor, vec3(0.05, 0.05, 0.15), isHeader);
            winColor = mix(winColor, vec3(0.95, 0.95, 0.95), border);
            winColor = mix(winColor, vec3(0.9, 0.1, 0.5), fill * (1.0 - isHeader) * pattern * 0.25);

            return winColor * fill;
        }

        vec3 compositeWindows(vec2 uv, vec3 currentColor, float t) {
            // Window 1: hot pink/cyan internet relic
            vec2 pos1 = vec2(0.28, 0.65) + vec2(cos(t * 0.8) * 0.08, sin(t * 0.6) * 0.06);
            vec3 w1 = drawWindow(uv, pos1, vec2(0.18, 0.12), vec3(0.05, 0.35, 0.55), t);
            if (length(w1) > 0.0) currentColor = mix(currentColor, w1, 0.9);

            // Window 2: acid yellow/magenta system pop-up
            vec2 pos2 = vec2(0.72, 0.35) + vec2(sin(t * 1.1) * 0.1, cos(t * 0.7) * 0.07);
            vec3 w2 = drawWindow(uv, pos2, vec2(0.16, 0.1), vec3(0.45, 0.05, 0.35), t * 1.4);
            if (length(w2) > 0.0) currentColor = mix(currentColor, w2, 0.9);

            return currentColor;
        }

        // ─── Demoscene Gear / Central Reactor SDF ───
        float sdGear(vec2 p, float r, float t) {
            float angle = atan(p.y, p.x) + t;
            float d = length(p);
            float gear = r + 0.06 * sin(angle * 8.0) + 0.015 * sin(angle * 24.0);
            return d - gear;
        }

        // ─── Cuttlefish Chromatics Layer ───
        vec3 applyChromatophores(vec2 uv, vec3 baseColor, float t) {
            vec2 gridUv = uv * 20.0;
            vec2 cellId = floor(gridUv);
            vec2 localUv = fract(gridUv) - 0.5;

            vec2 jitter = (vec2(hash21(cellId), hash21(cellId + 7.3)) - 0.5) * 0.25;
            float dist = length(localUv - jitter);

            float wave = fbm(cellId * 0.18 + vec2(t * 0.45, sin(t * 0.25) * 0.15));
            float activation = smoothstep(0.35, 0.65, wave);

            float r0 = 0.08 + 0.18 * hash21(cellId + 1.5);
            float r = r0 * (1.0 + 1.24 * activation);

            float mask = smoothstep(r, r - 0.04, dist);

            float classHash = hash21(cellId * 3.1);
            vec3 pigColor = vec3(0.910, 0.722, 0.294); // yellow
            if (classHash > 0.35) pigColor = vec3(0.710, 0.314, 0.165); // red
            if (classHash > 0.72) pigColor = vec3(0.165, 0.102, 0.071); // dark brown

            return mix(baseColor, pigColor, mask * 0.8);
        }

        // ─── Demoscene Plasma Background ───
        vec3 sampleBackground(vec2 uv, float t) {
            vec2 p = uv - 0.5;
            float r = length(p);
            float theta = atan(p.y, p.x);

            float v1 = sin(r * 12.0 - t * 2.5);
            float v2 = sin(theta * 6.0 + t * 1.2);
            float v3 = sin(p.x * 8.0 + p.y * 8.0 + t * 1.8);
            float plasmaValue = (v1 + v2 + v3) / 3.0;

            vec3 col1 = vec3(0.03, 0.0, 0.12); // Deep indigo dark
            vec3 col2 = vec3(0.95, 0.02, 0.45); // Hyperpop pink
            vec3 col3 = vec3(0.0, 0.95, 0.8);   // Electric cyan

            vec3 plasma = mix(col1, col2, smoothstep(-0.6, 0.6, plasmaValue));
            plasma = mix(plasma, col3, smoothstep(0.15, 0.85, sin(r * 7.0 - t)));

            return plasma;
        }

        // ─── Unified Scene Compositor ───
        vec3 getCompositeScene(vec2 uv, float t) {
            // 1. Datamosh Macroblock coordinate distortion
            vec2 dUv = uv;
            vec2 blockUv = floor(uv * 20.0) / 20.0;
            float moshTrigger = step(0.84, noise2d(blockUv + floor(t * 1.3) * 11.4));
            vec2 motionVec = vec2(noise2d(blockUv + t * 0.4), noise2d(blockUv - t * 0.3)) - 0.5;
            dUv = mix(uv, uv + motionVec * 0.14 * u_intensity, moshTrigger);

            // 2. Generate Background Plasma
            vec3 scene = sampleBackground(dUv, t);

            // 3. Apply Cuttlefish Chromatophores
            scene = applyChromatophores(dUv, scene, t);

            // 4. Apply Halftone Mosaic overlays
            vec2 rotUv = vec2(dUv.x * 0.707 - dUv.y * 0.707, dUv.x * 0.707 + dUv.y * 0.707);
            float halftoneGrid = sin(rotUv.x * 140.0) * sin(rotUv.y * 140.0);
            float sceneLuma = dot(scene, vec3(0.299, 0.587, 0.114));
            float dotSize = smoothstep(0.0, 1.0, sceneLuma);
            float halftoneMask = step(halftoneGrid, dotSize * 2.0 - 1.0);
            scene = mix(scene, scene * 0.25, halftoneMask * 0.4 * u_intensity);

            // 5. Composite Browser Windows / Interface Debris
            scene = compositeWindows(dUv, scene, t);

            // 6. Central Reactor (SDF Gear)
            vec2 p = dUv - 0.5;
            float dReactor = sdGear(p, 0.16 + 0.02 * sin(t * 3.5), t * 1.3);
            float reactorBorder = smoothstep(0.007, 0.0, abs(dReactor));
            float reactorFill = step(dReactor, 0.0);

            vec3 reactorCol = mix(vec3(0.95, 0.05, 0.35), vec3(0.0, 0.9, 0.95), sin(length(p) * 35.0 - t * 7.0) * 0.5 + 0.5);
            reactorCol += vec3(0.85, 0.85, 0.05) * (sin(atan(p.y, p.x) * 12.0 + t * 8.0) * 0.5 + 0.5);

            scene = mix(scene, reactorCol, reactorFill);
            scene = mix(scene, vec3(0.95, 0.95, 0.9), reactorBorder);

            return scene;
        }

        // ─── Anamorphic Lens Flares ───
        vec3 drawFlares(vec2 p, float t) {
            float flare1 = exp(-abs(p.y - 0.08 * sin(t)) * 110.0) * exp(-abs(p.x) * 0.7);
            float flare2 = exp(-abs(p.y + 0.12 * cos(t * 1.2)) * 75.0) * exp(-abs(p.x) * 1.1);

            vec3 c1 = vec3(0.5) + 0.5 * cos(t + p.x * 3.5 + vec3(0.0, 2.0, 4.0));
            vec3 c2 = vec3(0.5) + 0.5 * cos(t * 1.4 + p.x * 2.8 + vec3(1.5, 3.5, 5.5));

            return (flare1 * c1 + flare2 * c2) * 1.35;
        }

        void main() {
            vec2 centerDist = vUv - 0.5;
            float distLength = length(centerDist);
            vec2 abDir = normalize(centerDist + 0.0001);

            // Prismatic Chromatic Aberration
            float abStrength = 0.022 * u_intensity * (0.25 + distLength);
            vec2 redUv = vUv - abDir * abStrength;
            vec2 greenUv = vUv;
            vec2 blueUv = vUv + abDir * abStrength * 0.65;

            float r = getCompositeScene(redUv, u_time).r;
            float g = getCompositeScene(greenUv, u_time).g;
            float b = getCompositeScene(blueUv, u_time).b;
            vec3 color = vec3(r, g, b);

            // Inject Anamorphic Beams
            vec2 p = vUv - 0.5;
            vec3 flares = drawFlares(p, u_time);
            color += flares * u_intensity;

            // CRT Phosphor Triad Mask
            float subpx = mod(gl_FragCoord.x, 3.0);
            vec3 phosphorMask = vec3(1.0);
            if (subpx < 1.0) {
                phosphorMask = vec3(1.5, 0.35, 0.35);
            } else if (subpx < 2.0) {
                phosphorMask = vec3(0.35, 1.5, 0.35);
            } else {
                phosphorMask = vec3(0.35, 0.35, 1.5);
            }

            // Analog scanlines
            float scanline = 0.78 + 0.22 * sin(gl_FragCoord.y * 1.6 + u_time * 4.5);
            phosphorMask *= scanline;

            color = mix(color, color * phosphorMask, 0.35 * u_intensity);

            // ─── COLOR SAFETY STAGE (No Absolute Black / White Dominance) ───
            float luma = dot(color, vec3(0.299, 0.587, 0.114));

            vec3 chromaticDark = vec3(0.04, 0.0, 0.14); // Indigo dark
            if (luma < 0.16) {
                color = mix(chromaticDark, color, luma / 0.16);
            }

            vec3 neonLight = vec3(0.98, 0.92, 0.45); // Saturated neon glow
            if (luma > 0.82) {
                color = mix(color, neonLight, (luma - 0.82) / 0.18);
            }

            fragColor = vec4(color, 1.0);
        }
      `
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    canvas.__three = { renderer, scene, camera, material };
  } catch (e) {
    console.error("WebGL Initialization Failed inside Phosphor Reef Engine:", e);
    return;
  }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms) {
  if (material.uniforms.u_time) material.uniforms.u_time.value = time;
  if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(grid.width, grid.height);
  if (material.uniforms.u_mouse) material.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
  if (material.uniforms.u_intensity) material.uniforms.u_intensity.value = 0.85 + 0.15 * Math.sin(time * 0.5);
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);