if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    
    // Screen-aligned orthographic setup
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
        u_mouse_pressed: { value: 0 },
        u_intensity: { value: 0.8 },
        u_datamosh: { value: 0.65 },
        u_chroma_aberration: { value: 0.5 }
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
        uniform vec2 u_resolution;
        uniform vec2 u_mouse;
        uniform float u_mouse_pressed;
        uniform float u_intensity;
        uniform float u_datamosh;
        uniform float u_chroma_aberration;

        const float PI = 3.14159265359;

        // ─── OKLAB COLOR CONVERSIONS ───
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

        // ─── NOISE & FBM ───
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
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

        // ─── RAYMARCHED SIGNAL REEF SDF ───
        float sdTorus(vec3 p, vec2 t) {
          vec2 q = vec2(length(p.xz) - t.x, p.y);
          return length(q) - t.y;
        }

        float gyroid(vec3 p) {
          return dot(sin(p), cos(p.zxy));
        }

        float map(vec3 p, float t) {
          float c = cos(t * 0.3), s = sin(t * 0.3);
          p.xy *= mat2(c, -s, s, c);
          p.xz *= mat2(c, s, -s, c);
          
          float reefTorus = sdTorus(p, vec2(1.1, 0.35));
          float microReef = gyroid(p * 5.0 + sin(t * 1.5) * 0.3) * 0.12;
          float spikes = sin(p.x * 12.0) * sin(p.y * 12.0) * sin(p.z * 12.0) * 0.04;
          
          return reefTorus + microReef + spikes;
        }

        vec3 calcNormal(vec3 p, float t) {
          vec2 e = vec2(0.001, 0.0);
          return normalize(vec3(
            map(p + e.xyy, t) - map(p - e.xyy, t),
            map(p + e.yxy, t) - map(p - e.yxy, t),
            map(p + e.yyx, t) - map(p - e.yyx, t)
          ));
        }

        // ─── CUTTLEFISH CHROMATOPHORES (Skin Simulation) ───
        vec3 applyChromatophores(vec2 uv, vec3 baseColor, float t) {
          vec2 gridScale = vec2(28.0);
          vec2 gId = floor(uv * gridScale);
          vec2 gUv = fract(uv * gridScale) - 0.5;
          
          vec2 jitter = (vec2(hash(gId), hash(gId + 11.4)) - 0.5) * 0.35;
          vec2 cellCenter = jitter;
          
          float wave = sin(length(gId - gridScale * 0.5) * 0.35 - t * 3.5) * 0.5 + 0.5;
          float activation = mix(0.12, 0.85, wave);
          
          float r0 = 0.14;
          float r = r0 * (1.0 + 1.24 * activation);
          
          float dist = length(gUv - cellCenter);
          float mask = smoothstep(r, r * 0.65, dist);
          
          float pigRand = hash(gId * 9.1);
          vec3 pigmentColor;
          if (pigRand < 0.38) {
            pigmentColor = vec3(0.92, 0.70, 0.22); // yellow
          } else if (pigRand < 0.72) {
            pigmentColor = vec3(0.78, 0.28, 0.12); // red
          } else {
            pigmentColor = vec3(0.18, 0.08, 0.15); // deep purple/brown
          }
          
          return mix(baseColor, baseColor * pigmentColor * 1.6, mask * 0.82);
        }

        // ─── HALFTONE SCREENING ───
        vec3 applyHalftone(vec2 uv, vec3 color) {
          float scale = 110.0;
          vec2 grid = uv * scale;
          vec2 f = fract(grid) - 0.5;
          float l = dot(color, vec3(0.299, 0.587, 0.114));
          float r = sqrt(clamp(1.0 - l, 0.0, 1.0)) * 0.45;
          float dist = length(f);
          float dotMask = smoothstep(r + 0.06, r - 0.06, dist);
          
          vec3 dotColor = vec3(0.04, 0.0, 0.08); // deep violet dots
          return mix(color, dotColor, dotMask * 0.35);
        }

        // ─── ANAMORPHIC LENS FLARES ───
        vec3 applyFlares(vec2 uv, float t) {
          float flareY = 0.5 + sin(t * 0.4) * 0.12;
          float dist = abs(uv.y - flareY);
          float beam = exp(-dist * 350.0) * 0.75;
          
          vec3 spectralColor = vec3(
            sin(uv.x * 3.5 + t * 1.8) * 0.5 + 0.5,
            sin(uv.x * 3.5 + t * 1.8 + 2.09) * 0.5 + 0.5,
            sin(uv.x * 3.5 + t * 1.8 + 4.18) * 0.5 + 0.5
          );
          return spectralColor * beam * (sin(t * 2.5) * 0.15 + 0.85);
        }

        // ─── DATAMOSH & TRACKING COORD WARPING ───
        vec2 applyDatamosh(vec2 uv, float t) {
          vec2 blockSize = vec2(16.0) / u_resolution;
          vec2 blockUV = floor(uv / blockSize) * blockSize;
          
          float blockSeed = hash(blockUV + floor(t * 3.0));
          float drop = step(0.88 - 0.1 * u_datamosh, blockSeed);
          
          float mX = fbm(blockUV * 4.5 + t * 0.4) * 2.0 - 1.0;
          float mY = fbm(blockUV * 4.5 - t * 0.4) * 2.0 - 1.0;
          vec2 motion = vec2(mX, mY) * 0.08 * drop * u_datamosh;
          
          return uv + motion;
        }

        void main() {
          vec2 rawUv = vUv;
          float t = u_time;

          // 1. Datamosh coordinate distortion
          vec2 warpedUv = applyDatamosh(rawUv, t);
          vec2 p = (warpedUv - 0.5) * 2.0;
          p.x *= u_resolution.x / u_resolution.y;

          // 2. Background Plasma field (Never black, never white)
          float plasmaVal = fbm(vec2(p * 1.8 + vec2(sin(t * 0.2), cos(t * 0.15))));
          vec3 bgColA = vec3(0.12, 0.0, 0.22); // deep indigo
          vec3 bgColB = vec3(0.0, 0.25, 0.32); // deep peacock teal
          vec3 bgPlasma = mix(bgColA, bgColB, plasmaVal);
          
          // Saturated bright strands in background
          float strand = sin(p.y * 4.0 + sin(p.x * 3.0 + t)) * 0.5 + 0.5;
          bgPlasma += vec3(0.8, 0.1, 0.5) * exp(-pow(strand - 0.5, 2.0) * 12.0) * 0.35;

          // 3. Chromatic Aberrant Raymarching
          vec3 ro = vec3(0.0, 0.0, -3.0);
          
          // Separate ray direction offsets per channel
          float chromaOffset = 0.015 * u_chroma_aberration;
          vec3 rdR = normalize(vec3(p + vec2(chromaOffset, 0.0), 1.6));
          vec3 rdG = normalize(vec3(p, 1.6));
          vec3 rdB = normalize(vec3(p - vec2(chromaOffset, 0.0), 1.6));

          float dR = 0.0, dG = 0.0, dB = 0.0;
          bool hitR = false, hitG = false, hitB = false;

          // March Red
          for(int step = 0; step < 24; step++) {
            vec3 pos = ro + rdR * dR;
            float d = map(pos, t);
            if(d < 0.001) { hitR = true; break; }
            dR += d;
            if(dR > 5.0) break;
          }
          // March Green
          for(int step = 0; step < 24; step++) {
            vec3 pos = ro + rdG * dG;
            float d = map(pos, t);
            if(d < 0.001) { hitG = true; break; }
            dG += d;
            if(dG > 5.0) break;
          }
          // March Blue
          for(int step = 0; step < 24; step++) {
            vec3 pos = ro + rdB * dB;
            float d = map(pos, t);
            if(d < 0.001) { hitB = true; break; }
            dB += d;
            if(dB > 5.0) break;
          }

          // Composite raymarch outputs
          vec3 rColor = bgPlasma;
          vec3 gColor = bgPlasma;
          vec3 bColor = bgPlasma;

          if(hitR) {
            vec3 norm = calcNormal(ro + rdR * dR, t);
            float diff = max(dot(norm, normalize(vec3(1.0, 1.0, -1.0))), 0.0);
            float rim = pow(1.0 - max(dot(norm, -rdR), 0.0), 3.0);
            rColor = mix(vec3(0.95, 0.12, 0.45), vec3(1.0, 0.8, 0.2), diff) + vec3(0.9, 0.2, 0.6) * rim;
          }
          if(hitG) {
            vec3 norm = calcNormal(ro + rdG * dG, t);
            float diff = max(dot(norm, normalize(vec3(1.0, 1.0, -1.0))), 0.0);
            float rim = pow(1.0 - max(dot(norm, -rdG), 0.0), 3.0);
            gColor = mix(vec3(0.1, 0.85, 0.95), vec3(0.2, 1.0, 0.5), diff) + vec3(0.1, 0.9, 0.7) * rim;
          }
          if(hitB) {
            vec3 norm = calcNormal(ro + rdB * dB, t);
            float diff = max(dot(norm, normalize(vec3(1.0, 1.0, -1.0))), 0.0);
            float rim = pow(1.0 - max(dot(norm, -rdB), 0.0), 3.0);
            bColor = mix(vec3(0.5, 0.1, 0.9), vec3(0.9, 0.1, 0.6), diff) + vec3(0.6, 0.2, 0.9) * rim;
          }

          vec3 finalCore = vec3(rColor.r, gColor.g, bColor.b);

          // 4. Cuttlefish chromatophore overlay
          finalCore = applyChromatophores(warpedUv, finalCore, t);

          // 5. Halftone screening
          finalCore = applyHalftone(warpedUv, finalCore);

          // 6. Anamorphic lens flare
          finalCore += applyFlares(warpedUv, t);

          // 7. CRT simulation (Subpixel RGB grid, Scanlines, Refresh bar)
          float col_idx = mod(gl_FragCoord.x, 3.0);
          vec3 phosphor = vec3(
            smoothstep(1.0, 0.0, abs(col_idx - 0.5)),
            smoothstep(1.0, 0.0, abs(col_idx - 1.5)),
            smoothstep(1.0, 0.0, abs(col_idx - 2.5))
          );
          phosphor = mix(vec3(1.0), phosphor, 0.65 * u_intensity);

          float scanline = 0.85 + 0.15 * sin(gl_FragCoord.y * 1.6);
          float refreshBar = exp(-pow(warpedUv.y - fract(t * 0.18), 2.0) * 450.0) * 0.18;

          finalCore = finalCore * scanline * phosphor + vec3(refreshBar);

          // 8. CRT Barrel & Vignette
          vec2 vig = warpedUv * 2.0 - 1.0;
          float vignette = 1.0 - dot(vig, vig) * 0.22;
          finalCore *= vignette;

          // 9. ABSOLUTE COLOR LAW: remap extreme blacks and whites to chromatic darks/brights
          float luma = dot(finalCore, vec3(0.299, 0.587, 0.114));
          if(luma < 0.1) {
            finalCore = mix(vec3(0.12, 0.0, 0.25), finalCore, luma * 10.0);
          }
          if(luma > 0.9) {
            finalCore = mix(finalCore, vec3(0.95, 0.85, 0.98), (luma - 0.9) * 10.0);
          }

          fragColor = vec4(finalCore, 1.0);
        }
      `
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    
    canvas.__three = { renderer, scene, camera, material };
  } catch (e) {
    console.error("WebGL 2 / Three.js setup failed:", e);
    return;
  }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms) {
  if (material.uniforms.u_time) material.uniforms.u_time.value = time;
  if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(grid.width, grid.height);
  if (material.uniforms.u_mouse) material.uniforms.u_mouse.value.set(mouse.x / grid.width, mouse.y / grid.height);
  if (material.uniforms.u_mouse_pressed) material.uniforms.u_mouse_pressed.value = mouse.isPressed ? 1.0 : 0.0;
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);