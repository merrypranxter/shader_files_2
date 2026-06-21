if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: false, antialias: false });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
        u_mouse_pressed: { value: false }
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
        uniform bool u_mouse_pressed;

        // ─── 1. Mathematical Primities & Noise ───
        float hash21(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        vec2 hash22(vec2 p) {
            return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453123);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
                       mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
        }

        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            vec2 shift = vec2(100.0);
            mat2 rot = mat2(0.87758, 0.47942, -0.47942, 0.87758);
            for (int i = 0; i < 3; ++i) {
                v += a * noise(p);
                p = rot * p * 2.0 + shift;
                a *= 0.5;
            }
            return v;
        }

        // ─── 2. Perceptual OKLab Colorspace Conversions ───
        vec3 rgb2oklab(vec3 c) {
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

        vec3 oklab2rgb(vec3 c) {
            float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
            float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
            float s_ = c.x - 0.0894841775 * c.y - 0.0638541728 * c.z;
            float l = l_ * l_ * l_;
            float m = m_ * m_ * m_;
            float s = s_ * s_ * s_;
            return vec3(
                 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
            );
        }

        // ─── 3. Halftone Mosaic Overlay ───
        float getHalftone(vec2 uv, float brightness) {
            vec2 grid = uv * 64.0;
            vec2 f = fract(grid) - 0.5;
            float r = clamp(brightness * 0.45, 0.0, 0.5);
            return smoothstep(r, r - 0.05, length(f));
        }

        // ─── 4. Cuttlefish Chromatophores (Muscle Pixels) ───
        vec3 applyChromatophores(vec2 uv, vec3 baseColor, float t) {
            vec2 gridUv = uv * 24.0;
            vec2 cellId = floor(gridUv);
            vec2 cellFrac = fract(gridUv) - 0.5;
            
            vec2 jitter = hash22(cellId) - 0.5;
            float dist = length(cellFrac - jitter * 0.5);
            
            float wave = sin(length(cellId / 24.0 - vec2(0.5)) * 8.0 - t * 3.0) * 0.5 + 0.5;
            
            float randType = hash21(cellId + 42.1);
            vec3 pigColor = vec3(0.0);
            if (randType < 0.4) {
                pigColor = vec3(0.910, 0.722, 0.294); // yellow
            } else if (randType < 0.75) {
                pigColor = vec3(0.710, 0.314, 0.165); // red
            } else {
                pigColor = vec3(0.165, 0.102, 0.071); // dark brown
            }
            
            float radius = 0.12 * (1.0 + 1.24 * wave);
            float coverage = smoothstep(radius, radius - 0.03, dist);
            
            return mix(baseColor, pigColor, coverage * 0.85);
        }

        // ─── 5. Anamorphic Lens Flares ───
        vec3 getAnamorphicFlares(vec2 uv, float t) {
            float hY = 0.5 + sin(t * 0.5) * 0.15;
            float hStreak = exp(-pow(abs(uv.y - hY) / 0.012, 2.0));
            hStreak *= 0.8 + 0.2 * sin(uv.x * 20.0 - t * 10.0);
            vec3 hColor = vec3(0.0, 0.85, 1.0) * hStreak * 1.6;
            
            float aStreak = exp(-pow(abs(uv.y - uv.x * 0.4 - 0.3 + cos(t * 0.7) * 0.1) / 0.008, 2.0));
            vec3 aColor = vec3(1.0, 0.1, 0.6) * aStreak * 1.3;
            
            return hColor + aColor;
        }

        // ─── 6. Interface Debris (Glitchcore windows & signs) ───
        float drawWindow(vec2 uv, vec2 pos, vec2 size) {
            vec2 d = abs(uv - pos) - size;
            float border = max(d.x, d.y);
            float outer = smoothstep(0.003, 0.0, border);
            float inner = smoothstep(0.003, 0.0, abs(border));
            float titleBar = smoothstep(0.003, 0.0, abs(uv.y - (pos.y + size.y - 0.03))) * step(abs(uv.x - pos.x), size.x);
            return max(inner, titleBar);
        }

        float getInterfaceDebris(vec2 uv, float t) {
            float debris = 0.0;
            vec2 pos1 = vec2(0.3 + sin(t * 0.4) * 0.1, 0.6 + cos(t * 0.5) * 0.1);
            debris = max(debris, drawWindow(uv, pos1, vec2(0.12, 0.08)));
            
            vec2 pos2 = vec2(0.7 + cos(t * 0.3) * 0.1, 0.3 + sin(t * 0.6) * 0.1);
            debris = max(debris, drawWindow(uv, pos2, vec2(0.15, 0.10)));
            
            vec2 mousePos = vec2(0.5 + sin(t * 0.8) * 0.3, 0.5 + cos(t * 0.8) * 0.3);
            float cursor = smoothstep(0.002, 0.0, abs(uv.x - mousePos.x)) * step(abs(uv.y - mousePos.y), 0.03) +
                           smoothstep(0.002, 0.0, abs(uv.y - mousePos.y)) * step(abs(uv.x - mousePos.x), 0.03);
            debris = max(debris, cursor);
            
            return debris;
        }

        // ─── 7. Main Scenic Color Assembly ───
        vec3 getSceneColor(vec2 uv, float t) {
            vec3 darkBlue = vec3(0.04, 0.0, 0.12);
            vec3 brightMagenta = vec3(0.8, 0.0, 0.5);
            vec3 brightCyan = vec3(0.0, 0.8, 0.9);
            
            float nVal = fbm(uv * 4.0 + t * 0.15);
            vec3 base = oklab2rgb(mix(rgb2oklab(darkBlue), rgb2oklab(brightMagenta), nVal));
            base = oklab2rgb(mix(rgb2oklab(base), rgb2oklab(brightCyan), sin(uv.x * 3.0 - t) * 0.5 + 0.5));
            
            vec2 p = uv - 0.5;
            p.x *= u_resolution.x / u_resolution.y;
            float d = length(p);
            float angle = atan(p.y, p.x);
            
            float teeth1 = sin(angle * 16.0 + t * 2.0) * 0.015;
            float ring1 = smoothstep(0.24 + teeth1, 0.23 + teeth1, d) * smoothstep(0.19, 0.20, d);
            
            float teeth2 = sin(angle * 12.0 - t * 3.0) * 0.012;
            float ring2 = smoothstep(0.16 + teeth2, 0.15 + teeth2, d) * smoothstep(0.11, 0.12, d);
            
            float corePulse = 0.07 + 0.012 * sin(t * 5.0);
            float core = smoothstep(corePulse, corePulse - 0.008, d);
            
            float reactorMask = max(ring1, max(ring2, core));
            vec3 reactorColor = oklab2rgb(mix(rgb2oklab(vec3(0.9, 0.05, 0.45)), rgb2oklab(vec3(0.85, 0.9, 0.0)), sin(t * 1.5) * 0.5 + 0.5));
            base = mix(base, reactorColor, reactorMask * 0.9);
            
            float lum = dot(base, vec3(0.299, 0.587, 0.114));
            float halftone = getHalftone(uv, lum);
            base = mix(base, vec3(0.0, 0.95, 0.65), halftone * 0.35);
            
            base = applyChromatophores(uv, base, t);
            base += getAnamorphicFlares(uv, t);
            
            float debris = getInterfaceDebris(uv, t);
            base = mix(base, vec3(0.0, 0.9, 1.0), debris * 0.75);
            
            return base;
        }

        // ─── 8. Main Render Pipeline ───
        void main() {
            vec2 uv = vUv;
            float t = u_time;
            float fi = 1.0;
            
            vec2 blockSize = vec2(24.0) / u_resolution;
            vec2 blockUV   = floor(uv / blockSize) * blockSize;
            float blockSeed = hash21(blockUV * 43.13);
            float moshTimer = mod(t, 6.0);
            float moshActive = smoothstep(4.0, 4.4, moshTimer) * (1.0 - smoothstep(4.8, 5.4, moshTimer));
            vec2 motionVec = vec2(
                noise(blockUV * 4.0 + t * 0.3) - 0.5,
                noise(blockUV * 4.0 - t * 0.25 + 13.0) - 0.5
            ) * 0.18 * step(0.4, hash21(blockUV + floor(t * 1.5))) * moshActive;
            
            vec2 warpedUv = clamp(uv + motionVec, 0.0, 1.0);
            
            vec2 center = vec2(0.5);
            float caAmount = 0.015 * (0.4 + 0.6 * sin(t * 1.8));
            vec2 rUv = center + (warpedUv - center) * (1.0 + caAmount);
            vec2 bUv = center + (warpedUv - center) * (1.0 - caAmount);
            
            float finalR = getSceneColor(rUv, t).r;
            float finalG = getSceneColor(warpedUv, t).g;
            float finalB = getSceneColor(bUv, t).b;
            vec3 finalColor = vec3(finalR, finalG, finalB);
            
            float scanline = sin(warpedUv.y * u_resolution.y * 3.14159) * 0.5 + 0.5;
            finalColor *= mix(1.0, 0.72, scanline);
            
            float colIndex = mod(gl_FragCoord.x, 3.0);
            vec3 mask = vec3(
                smoothstep(1.0, 0.0, abs(colIndex - 0.5)),
                smoothstep(1.0, 0.0, abs(colIndex - 1.5)),
                smoothstep(1.0, 0.0, abs(colIndex - 2.5))
            );
            finalColor *= mix(vec3(1.0), mask, 0.35);
            
            float barPos = fract(t * 0.15);
            float bar = exp(-pow(warpedUv.y - barPos, 2.0) / 0.003);
            finalColor *= 1.0 + 0.2 * bar;
            
            float lum = dot(finalColor, vec3(0.2126, 0.7152, 0.0722));
            
            vec3 shadowColor = vec3(0.05, 0.0, 0.14);
            finalColor = mix(finalColor, shadowColor, smoothstep(0.15, 0.0, lum) * 0.85);
            
            vec3 highlightColor = vec3(1.0, 0.65, 0.5);
            finalColor = mix(finalColor, highlightColor, smoothstep(0.85, 1.0, lum) * 0.75);
            
            vec2 vig = warpedUv * 2.0 - 1.0;
            finalColor *= 1.0 - dot(vig, vig) * 0.25;
            
            fragColor = vec4(finalColor, 1.0);
        }
      `
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    canvas.__three = { renderer, scene, camera, material };
  } catch (e) {
    console.error("WebGL 2 / Three.js Initialization Failed:", e);
    return;
  }
}

const { renderer, scene, camera, material } = canvas.__three;
if (material && material.uniforms) {
  material.uniforms.u_time.value = time;
  material.uniforms.u_resolution.value.set(grid.width, grid.height);
  material.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
  material.uniforms.u_mouse_pressed.value = mouse.isPressed;
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);