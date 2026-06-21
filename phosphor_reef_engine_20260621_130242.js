if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        uniform float u_time;
        uniform vec2 u_resolution;
        uniform vec2 u_mouse;

        float hash21(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
                       mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
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
        vec3 linear_to_srgb(vec3 c) {
            return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0/2.4)) - 0.055, step(0.0031308, c));
        }
        vec3 srgb_to_linear(vec3 c) {
            return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
        }
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
        vec3 oklabMix(vec3 colA, vec3 colB, float t) {
            vec3 labA = linearSRGB_to_OKLab(srgb_to_linear(colA));
            vec3 labB = linearSRGB_to_OKLab(srgb_to_linear(colB));
            return linear_to_srgb(OKLab_to_linearSRGB(mix(labA, labB, t)));
        }

        vec3 getBaseColor(vec2 uv, float t) {
            vec3 c_indigo = vec3(0.05, 0.01, 0.15);
            vec3 c_plum = vec3(0.2, 0.02, 0.18);
            vec3 c_cyan = vec3(0.0, 0.9, 1.0);
            vec3 c_pink = vec3(1.0, 0.0, 0.6);
            vec3 c_yellow = vec3(0.9, 0.9, 0.0);
            vec3 c_chartreuse = vec3(0.6, 1.0, 0.0);

            vec2 p = uv - 0.5;
            p.x *= u_resolution.x / u_resolution.y;
            float r = length(p);
            float theta = atan(p.y, p.x);

            vec3 baseCol = oklabMix(c_indigo, c_plum, fbm(uv * 3.0 + t * 0.1));
            float pNoise = fbm(vec2(r * 5.0 - t * 1.5, theta));
            vec3 plasmaCol = oklabMix(c_cyan, c_pink, pNoise);
            baseCol = oklabMix(baseCol, plasmaCol, smoothstep(0.5, 0.1, r));

            // Chromatophores (Cuttlefish grid)
            vec2 gridUv = uv * 32.0;
            vec2 gridId = floor(gridUv);
            vec2 gridFract = fract(gridUv) - 0.5;
            float cellHash = hash21(gridId);
            float cellWave = sin(gridId.x * 0.15 + gridId.y * 0.08 - t * 3.0) * 0.5 + 0.5;
            float cellRadius = 0.12 * (1.0 + 1.24 * cellWave);
            float cellDist = length(gridFract);
            float cellMask = smoothstep(cellRadius, cellRadius * 0.6, cellDist);

            vec3 chromatophoreColor = oklabMix(c_yellow, c_chartreuse, cellHash);
            baseCol = oklabMix(baseCol, chromatophoreColor, cellMask * 0.7);

            // Popups / Early Internet Aesthetic Elements
            for (int k = 1; k <= 3; k++) {
                float fk = float(k);
                vec2 rectCenter = vec2(sin(t * 0.5 + fk) * 0.25 + 0.5, cos(t * 0.3 + fk * 2.0) * 0.25 + 0.5);
                vec2 rectSize = vec2(0.12, 0.08);
                vec2 rectDist = abs(uv - rectCenter) - rectSize;
                float inRect = step(max(rectDist.x, rectDist.y), 0.0);
                float borderRect = step(abs(max(rectDist.x, rectDist.y)), 0.004);
                if (inRect > 0.5) {
                    baseCol = oklabMix(baseCol, c_cyan * (0.8 + 0.2 * sin(t * 5.0 + fk)), 0.6);
                }
                if (borderRect > 0.5) {
                    baseCol = c_pink;
                }
            }
            return baseCol;
        }

        vec2 getWarpedUv(vec2 uv, float t, float surge) {
            vec2 blockSize = vec2(16.0) / u_resolution;
            vec2 blockUV = floor(uv / blockSize) * blockSize;
            float blockSeed = hash21(blockUV + floor(t * 4.0));
            vec2 moshVec = vec2(sin(blockSeed * 6.28), cos(blockSeed * 6.28)) * 0.04 * (0.2 + 0.8 * surge);
            return mix(uv, uv + moshVec, step(0.75, blockSeed));
        }

        vec3 sampleWithAberration(vec2 uv, float t, float surge) {
            float shift = 0.015 * (1.0 + 3.0 * surge);
            vec2 rUv = getWarpedUv(uv + vec2(shift, 0.0), t, surge);
            vec2 gUv = getWarpedUv(uv, t, surge);
            vec2 bUv = getWarpedUv(uv - vec2(shift, 0.0), t, surge);
            float r = getBaseColor(rUv, t).r;
            float g = getBaseColor(gUv, t).g;
            float b = getBaseColor(bUv, t).b;
            return vec3(r, g, b);
        }

        float getHalftone(vec2 uv) {
            vec2 htUv = uv * 60.0;
            vec2 htId = floor(htUv);
            vec2 htFract = fract(htUv) - 0.5;
            float htVal = sin(htId.x * 0.1) * sin(htId.y * 0.1 + u_time) * 0.5 + 0.5;
            float htRadius = 0.4 * htVal;
            return smoothstep(htRadius, htRadius * 0.7, length(htFract));
        }

        vec3 getAnamorphicFlare(vec2 uv, float t, float surge) {
            vec2 p = uv - 0.5;
            p.x *= u_resolution.x / u_resolution.y;
            float f1 = exp(-abs(p.y) * 120.0) * (0.4 + 0.6 * sin(t * 8.0));
            float angle = 0.3;
            float distAng = abs(p.y - p.x * angle - sin(t) * 0.15);
            float f2 = exp(-distAng * 180.0) * 0.5;
            vec3 c_cyan = vec3(0.0, 0.9, 1.0);
            vec3 c_pink = vec3(1.0, 0.0, 0.6);
            return (c_cyan * f1 + c_pink * f2) * (1.0 + 2.0 * surge);
        }

        vec3 applyCRT(vec3 col, vec2 uv, vec2 fragCoord) {
            float scanline = 0.6 + 0.4 * sin(uv.y * u_resolution.y * 3.14159);
            col *= scanline;
            float colIdx = mod(fragCoord.x, 3.0);
            vec3 subpixel = vec3(
                smoothstep(1.0, 0.0, abs(colIdx - 0.5)),
                smoothstep(1.0, 0.0, abs(colIdx - 1.5)),
                smoothstep(1.0, 0.0, abs(colIdx - 2.5))
            );
            col *= mix(vec3(1.0), subpixel * 1.5, 0.45);
            return col;
        }

        void main() {
            vec2 uv = vUv;
            float surge = step(0.82, fract(u_time * 0.18)) * sin(u_time * 15.0);

            vec3 col = sampleWithAberration(uv, u_time, surge);

            // Integrate Halftone logic
            float ht = getHalftone(uv);
            col = mix(col, vec3(0.1, 0.9, 0.5), ht * 0.35);

            // Add Anamorphic Flare
            vec3 flare = getAnamorphicFlare(uv, u_time, surge);
            col += flare;

            // Apply CRT Phosphor
            col = applyCRT(col, uv, gl_FragCoord.xy);

            // Color Safety Stage (No absolute black/white dominance)
            vec3 darkTint = vec3(0.05, 0.01, 0.12);
            col = max(col, darkTint);
            col = min(col, vec3(0.96, 0.95, 0.98));

            fragColor = vec4(col, 1.0);
        }
      `
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    canvas.__three = { renderer, scene, camera, material };
  } catch (e) {
    console.error("Three.js initialization failed", e);
  }
}

if (canvas.__three) {
  const { renderer, scene, camera, material } = canvas.__three;
  if (material && material.uniforms) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
    material.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
  }
  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);
}