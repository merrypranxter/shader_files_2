// Phosphor Signal Reef Engine
// Stateful rendering engine using WebGL2 & Three.js to synthesize a living phosphor reef,
// combining oldschool demoscene visual bravado, cuttlefish skin simulation, anamorphic flares,
// and datamoshed temporal feedback.

if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    // Initialize Three.js on the pre-acquired WebGL2 context
    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      context: ctx,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true
    });
    renderer.setSize(grid.width, grid.height, false);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Dynamic procedural material utilizing GLSL3 for rich colorspace operations
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0.0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
        u_intensity: { value: 0.85 },
        u_density: { value: 0.75 },
        u_chromaticSpread: { value: 0.018 },
        u_datamoshAmount: { value: 0.45 },
        u_halftoneScale: { value: 14.0 }
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
        uniform float u_intensity;
        uniform float u_density;
        uniform float u_chromaticSpread;
        uniform float u_datamoshAmount;
        uniform float u_halftoneScale;

        // --- Perceptual OKLab Colorspace Utilities ---
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

        vec3 getOklchColor(float L, float C, float h) {
            return oklab_to_rgb(vec3(L, C * cos(h), C * sin(h)));
        }

        // --- Math & Noise Generators ---
        float hash21(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
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
            for (int i = 0; i < 4; i++) {
                v += a * noise(p);
                p *= 2.0;
                a *= 0.5;
            }
            return v;
        }

        // --- 3D Demoscene Core (Raymarched Twisted Torus) ---
        float sdTorus(vec3 p, vec2 t) {
            vec2 q = vec2(length(p.xz) - t.x, p.y);
            return length(q) - t.y;
        }

        float map(vec3 p) {
            float t = u_time * 0.8;
            float c = cos(t), s = sin(t);
            p.xy = mat2(c, -s, s, c) * p.xy;
            p.xz = mat2(c, -s, s, c) * p.xz;
            
            // Twist deformation
            float twist = sin(p.y * 3.0 + t) * 0.25;
            p.x += twist;
            
            float d1 = sdTorus(p, vec2(0.7, 0.22));
            float d2 = dot(sin(p * 5.0 + t), cos(p.zxy * 4.0 - t)) * 0.12;
            return d1 + d2;
        }

        vec3 getNormal(vec3 p) {
            vec2 e = vec2(0.002, 0.0);
            return normalize(vec3(
                map(p + e.xyy) - map(p - e.xyy),
                map(p + e.yxy) - map(p - e.yxy),
                map(p + e.yyx) - map(p - e.yyx)
            ));
        }

        // --- Cuttlefish Chromatophore Simulation ---
        float chromatophoreField(vec2 uv, float t) {
            vec2 st = uv * 24.0;
            vec2 ipos = floor(st);
            vec2 fpos = fract(st);
            float min_dist = 1.0;
            
            for (int y = -1; y <= 1; y++) {
                for (int x = -1; x <= 1; x++) {
                    vec2 neighbor = vec2(float(x), float(y));
                    vec2 point = vec2(hash21(ipos + neighbor), hash21(ipos + neighbor + 8.13));
                    
                    // Traveling neural excitation wave
                    float wave = sin(dot(ipos + neighbor, vec2(0.12, 0.08)) - t * 2.5) * 0.5 + 0.5;
                    float radius = 0.15 + 0.35 * wave * u_density;
                    
                    vec2 diff = neighbor + point - fpos;
                    float dist = length(diff);
                    if (dist < radius) {
                        min_dist = min(min_dist, dist / radius);
                    }
                }
            }
            return smoothstep(1.0, 0.1, min_dist);
        }

        // --- Halftone Grid ---
        float halftonePattern(vec2 uv, float scale, float density) {
            vec2 st = uv * scale;
            vec2 fpos = fract(st) - 0.5;
            float r = length(fpos);
            float max_r = 0.45 * density;
            return smoothstep(max_r, max_r - 0.08, r);
        }

        // --- Retro Interface Debris (Asemic Window Panels) ---
        float getUIWindow(vec2 uv, vec2 pos, vec2 size) {
            vec2 d = abs(uv - pos) - size;
            float border = max(d.x, d.y);
            float w = smoothstep(0.003, 0.0, abs(border));
            float title = step(pos.y + size.y - 0.035, uv.y) * step(uv.y, pos.y + size.y) * 
                          step(pos.x - size.x, uv.x) * step(uv.x, pos.x + size.x);
            return max(w, title * 0.4);
        }

        // --- Rendering Pipeline ---
        void main() {
            vec2 uv = vUv;
            float t = u_time;
            
            // 1. Datamosh Macroblock UV Warping
            vec2 blockUV = floor(uv * u_resolution / 16.0) * 16.0 / u_resolution;
            vec2 motion = vec2(
                fbm(blockUV * 3.0 + t * 0.15),
                fbm(blockUV * 3.0 - t * 0.15 + 23.4)
            ) - 0.5;
            vec2 warpedUv = mix(uv, uv + motion * 0.08, u_datamoshAmount);

            // 2. Background Field (Vibrant Chromatic Fluid)
            float plasma = sin(warpedUv.x * 4.0 + t) * 0.5 + sin(warpedUv.y * 3.0 - t) * 0.5;
            vec3 bgBase = getOklchColor(0.25, 0.18, plasma * 3.1415 + t * 0.5);
            // Saturated background darks (plum, deep indigo, turquoise)
            bgBase = mix(bgBase, vec3(0.08, 0.02, 0.15), 0.4); 

            // 3. Halftone Overlay on Background
            float ht = halftonePattern(warpedUv, u_halftoneScale, 0.5 + 0.3 * sin(t));
            bgBase = mix(bgBase, getOklchColor(0.65, 0.22, t * 0.8), ht * 0.25);

            // 4. Raymarching the Phosphor Reactor (Oldskool Demoscene Core)
            vec2 aspectUv = (warpedUv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
            vec3 ro = vec3(0.0, 0.0, 2.2);
            vec3 rd = normalize(vec3(aspectUv, -1.0));
            
            float d = 0.0, dMax = 5.0;
            bool hit = false;
            vec3 p;
            for (int k = 0; k < 64; k++) {
                p = ro + rd * d;
                float h = map(p);
                if (h < 0.001) { hit = true; break; }
                d += h;
                if (d > dMax) break;
            }

            vec3 sceneColor = bgBase;
            if (hit) {
                vec3 n = getNormal(p);
                vec3 lightDir = normalize(vec3(1.0, 1.0, 2.0));
                float diff = max(dot(n, lightDir), 0.0);
                float spec = pow(max(dot(reflect(-lightDir, n), rd), 0.0), 16.0);
                
                // Color mapping using OKLCh (Vibrant neon green, hot pink, orange)
                float colorPhase = sin(p.y * 2.0 + t * 2.0) * 0.5 + 0.5;
                vec3 reactorColor = getOklchColor(0.6, 0.25, colorPhase * 6.2831 + t);
                sceneColor = reactorColor * (diff * 0.8 + spec * 0.5 + 0.2);
            }

            // 5. Cuttlefish Chromatophore Skin Layer
            float skinWave = chromatophoreField(warpedUv, t);
            vec3 skinColor = getOklchColor(0.7, 0.22, sin(t * 0.5) * 3.1415);
            sceneColor = mix(sceneColor, skinColor, skinWave * 0.45 * u_intensity);

            // 6. Anamorphic Lens Flare Axis
            float flareLine = exp(-pow(aspectUv.y - 0.1 * sin(t), 2.0) / 0.0015);
            vec3 flareColor = getOklchColor(0.75, 0.25, aspectUv.x * 2.0 + t);
            sceneColor += flareColor * flareLine * 0.55 * u_intensity;

            // 7. Early Internet Interface Debris (Asemic Window Overlays)
            float ui = getUIWindow(warpedUv, vec2(0.3, 0.7), vec2(0.12, 0.1));
            ui = max(ui, getUIWindow(warpedUv, vec2(0.75, 0.35), vec2(0.15, 0.12)));
            sceneColor = mix(sceneColor, getOklchColor(0.8, 0.2, t), ui * 0.5);

            // 8. Chromatic Aberration Simulation (Prismatic offsets)
            float rShift = u_chromaticSpread * u_intensity;
            float gShift = u_chromaticSpread * 0.5 * u_intensity;
            float bShift = -u_chromaticSpread * 0.7 * u_intensity;
            
            float sceneR = sceneColor.r;
            float sceneG = mix(sceneColor.g, getOklchColor(0.6, 0.2, t).g, gShift);
            float sceneB = mix(sceneColor.b, getOklchColor(0.5, 0.25, t + 2.0).b, bShift);
            vec3 finalComposite = vec3(sceneR, sceneG, sceneB);

            // 9. CRT Phosphor Mask, Scanlines, & Subpixel Shimmer
            float scanline = sin(uv.y * u_resolution.y * 3.14159) * 0.12 + 0.88;
            finalComposite *= scanline;
            
            float phosphor = sin(uv.x * u_resolution.x * 1.5) * 0.08 + 0.92;
            finalComposite *= phosphor;

            // Absolute Color Law Safety stage (No flat/pure black/white dominance)
            finalComposite = max(finalComposite, vec3(0.06, 0.02, 0.1)); // Chromatic darks
            finalComposite = min(finalComposite, vec3(0.96, 0.93, 0.98)); // Colored high-lights

            fragColor = vec4(finalComposite, 1.0);
        }
      `
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    canvas.__three = { renderer, scene, camera, material };
  } catch (e) {
    console.error("WebGL 2 / Three.js initialization failed:", e);
  }
}

// Tick and render loop callback
if (canvas.__three) {
  const { renderer, scene, camera, material } = canvas.__three;

  // Handle resizing dynamically
  if (renderer.domElement.width !== grid.width || renderer.domElement.height !== grid.height) {
    renderer.setSize(grid.width, grid.height, false);
    if (material && material.uniforms.u_resolution) {
      material.uniforms.u_resolution.value.set(grid.width, grid.height);
    }
  }

  // Bind mouse states securely
  if (material && material.uniforms.u_mouse) {
    const mx = mouse.x / grid.width;
    const my = 1.0 - (mouse.y / grid.height);
    material.uniforms.u_mouse.value.set(mx, my);
  }

  // Inject elapsed frames and variables
  if (material && material.uniforms.u_time) {
    material.uniforms.u_time.value = time;
  }

  renderer.render(scene, camera);
}