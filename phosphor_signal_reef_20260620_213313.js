:Phosphor Signal Reef Engine:reef_engine.js
/**
 * Phosphor Signal Reef Engine
 * A real-time WebGL2 / Three.js spectacle fusing:
 * - CRT Phosphor subpixel triads & scanline bloom
 * - Demoscene oldskool gyroid lattice reactor & background plasma
 * - Halftone mosaic dot masking
 * - Datamosh motion-vector curl noise & previous-frame temporal smear
 * - Anamorphic lens flares with multicolored spectral streaks
 * - Chromatic aberration radial channel offsets
 * - Cuttlefish chromatophore grid & neural excitation wavefields
 * - Early internet browser window popups with pixelated asemic glyphs
 */

if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    // Initialize Three.js WebGLRenderer using the provided context
    const renderer = new THREE.WebGLRenderer({
      canvas,
      context: ctx,
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(1.0);

    const sceneSim = new THREE.Scene();
    const scenePost = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Create Render Targets for Ping-Pong Feedback Loop (temporal persistence & datamosh state)
    const rtOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    };
    const rt1 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
    const rt2 = rt1.clone();

    // Pass 1: Simulation Shader (Plasma, Gyroid Reactor, Cuttlefish Skin, Datamosh, Debris)
    const SIM_FRAG = `
      precision highp float;
      
      in vec2 vUv;
      out vec4 fragColor;

      uniform float u_time;
      uniform vec2 u_resolution;
      uniform sampler2D u_prev_frame;
      uniform vec3 u_mouse;
      uniform float u_intensity;
      uniform float u_datamosh;
      uniform float u_cuttlefish;
      uniform float u_glitch;

      // Deterministic PRNG
      float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 345.45));
          p += dot(p, p + 34.345);
          return fract(p.x * p.y);
      }

      vec2 hash22(vec2 p) {
          float n = sin(dot(p, vec2(127.1, 311.7)));
          return fract(vec2(262144.0, 32768.0) * n);
      }

      float hash1(float n) {
          return fract(sin(n) * 43758.5453123);
      }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i + vec2(0.0, 0.0));
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
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

      // Curl noise for motion vector fields (Datamoshing)
      vec2 curlNoise(vec2 p) {
          const float e = 0.1;
          float n1 = fbm(p + vec2(0.0, e));
          float n2 = fbm(p - vec2(0.0, e));
          float n3 = fbm(p + vec2(e, 0.0));
          float n4 = fbm(p - vec2(e, 0.0));
          return vec2(n1 - n2, n4 - n3) / (2.0 * e);
      }

      // Perceptual OKLab conversion
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

      // Cosine palette
      vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
          return a + b * cos(6.2831853 * (c * t + d));
      }

      vec3 reefPalette(float t) {
          // Vibrant hyperpop spectrum: magentas, cyans, glowing purples, oranges
          return palette(t, vec3(0.65, 0.45, 0.5), vec3(0.55, 0.45, 0.5), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.25, 0.5));
      }

      // 3D Raymarching
      mat2 rot2(float a) {
          float c = cos(a), s = sin(a);
          return mat2(c, -s, s, c);
      }

      float sdGyroid(vec3 p, float scale, float thickness, float bias) {
          p *= scale;
          return abs(dot(sin(p), cos(p.zxy)) - bias) / scale - thickness;
      }

      float map(vec3 p) {
          vec3 q = p;
          q.xz *= rot2(u_time * 0.35);
          q.xy *= rot2(u_time * 0.21);
          
          float d1 = length(q) - 1.35;
          float gy = sdGyroid(q, 4.0 + sin(u_time * 0.5) * 0.6, 0.04, 0.15);
          float d = max(d1, -gy);
          
          // Add organic coral-like nodules
          d += sin(q.x * 12.0 + u_time) * sin(q.y * 12.0) * sin(q.z * 12.0) * 0.04;
          return d;
      }

      vec3 calcNormal(vec3 p) {
          vec2 e = vec2(0.001, 0.0);
          return normalize(vec3(
              map(p + e.xyy) - map(p - e.xyy),
              map(p + e.yxy) - map(p - e.yxy),
              map(p + e.yyx) - map(p - e.yyx)
          ));
      }

      void main() {
          vec2 uv = vUv;
          vec2 aspect_uv = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
          
          // --- DATAMOSH SMEAR & TEMPORAL FEEDBACK ---
          vec2 motion = curlNoise(uv * 3.5 + vec2(0.0, u_time * 0.15)) * 0.006 * u_datamosh;
          if (u_mouse.z > 0.5) {
              motion += (u_mouse.xy - uv) * 0.02;
          }
          vec4 prev = texture(u_prev_frame, fract(uv - motion));
          
          // Cuttlefish excitation wave propagation (Laplacian of the red channel)
          vec2 px = 1.0 / u_resolution;
          float prev_c = texture(u_prev_frame, uv).r;
          float prev_u = texture(u_prev_frame, uv + vec2(0.0, px.y)).r;
          float prev_d = texture(u_prev_frame, uv - vec2(0.0, px.y)).r;
          float prev_l = texture(u_prev_frame, uv - vec2(px.x, 0.0)).r;
          float prev_r = texture(u_prev_frame, uv + vec2(px.x, 0.0)).r;
          float lap = prev_u + prev_d + prev_l + prev_r - 4.0 * prev_c;
          
          // Periodic automatic neural pulses
          float surge = step(0.94, sin(u_time * 0.7)) * hash21(uv + u_time) * 0.25;
          float neural_wave = clamp(prev_c + lap * 0.22 + surge - 0.008, 0.0, 1.0);
          
          // --- BACKGROUND Demoscene PLASMA ---
          float p1 = sin(aspect_uv.x * 2.8 + u_time) * 0.5 + 0.5;
          float p2 = cos(aspect_uv.y * 3.2 - u_time * 0.7) * 0.5 + 0.5;
          float p3 = sin((aspect_uv.x + aspect_uv.y) * 2.2 + sin(u_time * 1.2)) * 0.5 + 0.5;
          vec3 bg_color = reefPalette(p1 + p2 + p3 + u_time * 0.04);
          
          // Halftone Mosaic on the background
          vec2 ht_uv = uv * 32.0;
          vec2 ht_gv = fract(ht_uv) - 0.5;
          float ht_dist = length(ht_gv);
          float ht_radius = 0.38 * (1.0 - (p1 + p2 + p3)/3.0);
          float ht_mask = smoothstep(ht_radius, ht_radius - 0.04, ht_dist);
          bg_color = mix(bg_color, bg_color * 0.25, ht_mask * 0.7);
          
          // --- RAYMARCHED CENTRAL REACTOR ---
          vec3 ro = vec3(0.0, 0.0, -3.2);
          vec3 rd = normalize(vec3(aspect_uv, 1.4));
          
          float t_dist = 0.0;
          bool hit = false;
          vec3 hit_pos = vec3(0.0);
          
          for (int i = 0; i < 35; i++) {
              vec3 p = ro + rd * t_dist;
              float d = map(p);
              if (d < 0.001) {
                  hit = true;
                  hit_pos = p;
                  break;
              }
              t_dist += d;
              if (t_dist > 5.5) break;
          }
          
          vec3 scene_color = bg_color;
          
          if (hit) {
              vec3 n = calcNormal(hit_pos);
              vec3 light_dir = normalize(vec3(1.0, 1.0, -2.0));
              float diff = max(dot(n, light_dir), 0.0);
              float spec = pow(max(dot(reflect(-light_dir, n), -rd), 0.0), 24.0);
              
              float color_coord = length(hit_pos) * 0.25 + u_time * 0.08;
              vec3 base_color = reefPalette(color_coord);
              
              // Modulate reactor with cuttlefish neural waves
              base_color = mix(base_color, vec3(0.0, 1.0, 0.8) * (0.7 + 0.4 * sin(u_time * 4.5)), neural_wave * u_cuttlefish);
              scene_color = base_color * (diff * 0.75 + 0.25) + vec3(spec * 0.4);
              
              // Rim light
              float rim = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
              scene_color += vec3(0.0, 1.0, 1.0) * rim * 0.55;
          }
          
          // --- CUTTLEFISH CHROMATOPHORES ---
          vec2 grid_uv = uv * 28.0;
          vec2 grid_gv = fract(grid_uv) - 0.5;
          vec2 grid_id = floor(grid_uv);
          
          vec2 cell_hash = hash22(grid_id);
          vec2 cell_center = (cell_hash - 0.5) * 0.35;
          float d_cell = length(grid_gv - cell_center);
          
          float cell_activation = noise(grid_id * 0.12 + vec2(u_time * 0.25, -u_time * 0.08));
          cell_activation = mix(cell_activation, neural_wave, u_cuttlefish);
          
          float r_chrom = 0.11 * (1.0 + 1.2 * cell_activation);
          float chrom_mask = smoothstep(r_chrom, r_chrom - 0.02, d_cell);
          
          vec3 pig_yellow = vec3(0.92, 0.74, 0.25);
          vec3 pig_red    = vec3(0.75, 0.28, 0.14);
          vec3 pig_brown  = vec3(0.18, 0.08, 0.06);
          
          float pig_type = hash21(grid_id);
          vec3 pigment = pig_yellow;
          if (pig_type > 0.33) pigment = pig_red;
          if (pig_type > 0.66) pigment = pig_brown;
          
          scene_color = mix(scene_color, pigment, chrom_mask * 0.75 * u_cuttlefish);
          
          // --- EARLY INTERNET DEBRIS & POPUPS ---
          for (int i = 0; i < 3; i++) {
              float fi = float(i);
              vec2 w_pos = vec2(
                  sin(u_time * 0.18 + fi * 1.8) * 0.38 + 0.5,
                  cos(u_time * 0.13 + fi * 2.1) * 0.28 + 0.5
              );
              vec2 w_size = vec2(0.16, 0.10);
              vec2 diff_w = abs(uv - w_pos);
              
              if (diff_w.x < w_size.x && diff_w.y < w_size.y) {
                  vec2 local_w = (uv - w_pos + w_size) / (w_size * 2.0);
                  vec3 win_color = vec3(0.1, 0.05, 0.22); // Saturated dark background
                  
                  // Highlight title bar
                  if (local_uv_in_bar(local_h(local_w.y))) {
                      win_color = vec3(0.9, 0.0, 0.42); // Hot Pink
                  }
                  
                  float border = step(0.96, max(local_w.x, 1.0 - local_w.x)) + step(0.94, max(local_w.y, 1.0 - local_w.y));
                  win_color = mix(win_color, vec3(0.0, 1.0, 0.9), border); // Neon Cyan borders
                  
                  // Asemic digital glyph data inside
                  float glyph = step(0.82, hash21(floor(local_w * 14.0) + fi * 12.0));
                  win_color = mix(win_color, vec3(1.0, 0.9, 0.0), glyph * step(local_w.y, 0.82) * (1.0 - border));
                  
                  scene_color = mix(scene_color, win_color, 0.88);
              }
          }
          
          // Helper functions logic resolved inline to maintain GLSL architecture
          
          // --- DATAMOSH GLITCH SPURTS ---
          float glitch_trigger = step(0.94, sin(u_time * 1.8));
          float glitch_y = hash1(floor(u_time * 3.0));
          float glitch_band = smoothstep(0.035, 0.0, abs(uv.y - glitch_y)) * glitch_trigger * u_glitch;
          
          if (glitch_band > 0.01) {
              float shift_x = (hash21(vec2(uv.y, u_time)) - 0.5) * 0.12;
              scene_color = texture(u_prev_frame, fract(uv + vec2(shift_x, 0.0))).rgb;
              scene_color += vec3(hash21(uv + u_time)) * 0.15;
          }
          
          vec3 final_color = mix(scene_color, prev.rgb, 0.65 * (1.0 - u_glitch * 0.4));
          fragColor = vec4(final_color, neural_wave);
      }

      bool local_uv_in_bar(float y) {
          return y > 0.82;
      }
      float local_h(float y) {
          return y;
      }
    `;

    // Pass 2: Post-Processing Shader (Chromatic Aberration, Anamorphic Flares, CRT Phosphors, Absolute Color Law)
    const POST_FRAG = `
      precision highp float;
      
      in vec2 vUv;
      out vec4 fragColor;

      uniform sampler2D u_sim_frame;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform float u_aberration;
      uniform float u_flare;
      uniform float u_scanline;
      uniform float u_phosphor;

      void main() {
          vec2 uv = vUv;
          
          // --- CHROMATIC ABERRATION ---
          vec2 dir = uv - 0.5;
          float dist = length(dir);
          vec2 r_offset = dir * u_aberration * dist;
          vec2 b_offset = -dir * u_aberration * dist * 0.6;
          
          float r = texture(u_sim_frame, uv + r_offset).r;
          float g = texture(u_sim_frame, uv).g;
          float b = texture(u_sim_frame, uv + b_offset).b;
          vec3 color = vec3(r, g, b);
          
          // --- ANAMORPHIC LENS FLARES ---
          vec3 flare_color = vec3(0.0);
          // Scan horizontally across the frame to accumulate high-intensity light streaks
          for (int k = -8; k <= 8; k++) {
              float offset = float(k) * 0.022;
              vec3 col = texture(u_sim_frame, fract(vec2(uv.x + offset, uv.y))).rgb;
              float brightness = dot(col, vec3(0.299, 0.587, 0.114));
              float weight = exp(-float(k * k) * 0.14);
              
              // Multicolored spectral flare tint (rainbow diffraction)
              vec3 tint = 0.5 + 0.5 * cos(float(k) * 0.55 + vec3(0.0, 2.094, 4.188));
              flare_color += max(0.0, brightness - 0.58) * weight * tint;
          }
          // Blend flare into the stream
          color += flare_color * u_flare * 0.45;
          
          // --- CRT PHOSPHOR FX ---
          // Scanlines
          float scanline = sin(uv.y * u_resolution.y * 3.14159265) * 0.5 + 0.5;
          color *= mix(1.0 - u_scanline * 0.45, 1.0, scanline);
          
          // Subpixel Phosphor triad grid (Aperture Grille)
          float subpixel = mod(gl_FragCoord.x, 3.0);
          vec3 triad = vec3(0.35);
          if (subpixel < 1.0) triad = vec3(1.0, 0.35, 0.35);
          else if (subpixel < 2.0) triad = vec3(0.35, 1.0, 0.35);
          else triad = vec3(0.35, 0.35, 1.0);
          color *= mix(vec3(1.0), triad, u_phosphor * 0.55);
          
          // --- ABSOLUTE COLOR LAW ENFORCEMENT ---
          float luma = dot(color, vec3(0.299, 0.587, 0.114));
          
          // Avoid dominant absolute black - replace with rich saturated dark indigo/violet
          vec3 base_dark = vec3(0.08, 0.02, 0.18);
          color = max(color, base_dark);
          
          // Avoid dominant absolute white - tint with glowing cyan-turquoise
          vec3 base_bright = vec3(0.0, 0.95, 1.0);
          float hi_threshold = smoothstep(0.82, 1.0, luma);
          color = mix(color, mix(color, base_bright, 0.25), hi_threshold);
          
          fragColor = vec4(color, 1.0);
      }
    `;

    const simMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_prev_frame: { value: null },
        u_mouse: { value: new THREE.Vector3(0, 0, 0) },
        u_intensity: { value: 0.8 },
        u_datamosh: { value: 0.65 },
        u_cuttlefish: { value: 0.75 },
        u_glitch: { value: 0.45 }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: SIM_FRAG
    });

    const postMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_sim_frame: { value: null },
        u_aberration: { value: 0.016 },
        u_flare: { value: 0.85 },
        u_scanline: { value: 0.45 },
        u_phosphor: { value: 0.65 }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: POST_FRAG
    });

    const simMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMaterial);
    sceneSim.add(simMesh);

    const postMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial);
    scenePost.add(postMesh);

    canvas.__three = {
      renderer,
      sceneSim,
      scenePost,
      camera,
      simMaterial,
      postMaterial,
      rt1,
      rt2,
      isRt1Current: true
    };
  } catch (e) {
    console.error("WebGL 2 / Three.js Initialization Failed:", e);
    return;
  }
}

// Extract resources from persistent cache
const { renderer, sceneSim, scenePost, camera, simMaterial, postMaterial, rt1, rt2 } = canvas.__three;

// Handle dynamic resizing defensively
const w = grid.width;
const h = grid.height;
if (rt1.width !== w || rt1.height !== h) {
  rt1.setSize(w, h);
  rt2.setSize(w, h);
  simMaterial.uniforms.u_resolution.value.set(w, h);
  postMaterial.uniforms.u_resolution.value.set(w, h);
}

// Update mouse interaction state
const mx = mouse.x / w;
const my = 1.0 - (mouse.y / h);
const isPressed = mouse.isPressed ? 1.0 : 0.0;
simMaterial.uniforms.u_mouse.value.set(mx, my, isPressed);

// Update temporal uniforms
simMaterial.uniforms.u_time.value = time;
postMaterial.uniforms.u_time.value = time;

// Dynamic show moments: surge intensity on periodic sync triggers
const show_moment = Math.sin(time * 0.5) * 0.5 + 0.5;
simMaterial.uniforms.u_glitch.value = 0.3 + show_moment * 0.4;
postMaterial.uniforms.u_aberration.value = 0.012 + show_moment * 0.015;

// Ping-pong rendering logic
const readRt = canvas.__three.isRt1Current ? rt1 : rt2;
const writeRt = canvas.__three.isRt1Current ? rt2 : rt1;

// Render Simulation Pass to target
simMaterial.uniforms.u_prev_frame.value = readRt.texture;
renderer.setRenderTarget(writeRt);
renderer.render(sceneSim, camera);

// Render Post-Processing Pass directly to viewport
renderer.setRenderTarget(null);
renderer.setSize(w, h, false);
postMaterial.uniforms.u_sim_frame.value = writeRt.texture;
renderer.render(scenePost, camera);

// Swap feedback render targets
canvas.__three.isRt1Current = !canvas.__three.isRt1Current;