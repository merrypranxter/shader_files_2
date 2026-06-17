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

      #define PI 3.14159265359
      #define GOLDEN_ANGLE 137.50776405

      // --- Perceptual Color Math (OKLCh to sRGB) ---
      vec3 oklch_to_srgb(float L, float C, float h) {
          float hr = h * PI / 180.0;
          float a = C * cos(hr);
          float b = C * sin(hr);

          float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
          float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
          float s_ = L - 0.0894841775 * a - 1.2914855480 * b;

          float l = l_*l_*l_;
          float m = m_*m_*m_;
          float s = s_*s_*s_;

          vec3 rgb = vec3(
               4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
              -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
              -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
          );

          vec3 srgb;
          srgb.r = rgb.r <= 0.0031308 ? 12.92 * rgb.r : 1.055 * pow(max(rgb.r, 0.0), 1.0/2.4) - 0.055;
          srgb.g = rgb.g <= 0.0031308 ? 12.92 * rgb.g : 1.055 * pow(max(rgb.g, 0.0), 1.0/2.4) - 0.055;
          srgb.b = rgb.b <= 0.0031308 ? 12.92 * rgb.b : 1.055 * pow(max(rgb.b, 0.0), 1.0/2.4) - 0.055;

          return clamp(srgb, 0.0, 1.0);
      }

      // --- Noise & FBM (Fractal Logic) ---
      vec2 hash22(vec2 p) {
          p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
          return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
      }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix( mix( dot( hash22(i + vec2(0.0,0.0)), f - vec2(0.0,0.0) ),
                           dot( hash22(i + vec2(1.0,0.0)), f - vec2(1.0,0.0) ), u.x),
                      mix( dot( hash22(i + vec2(0.0,1.0)), f - vec2(0.0,1.0) ),
                           dot( hash22(i + vec2(1.0,1.0)), f - vec2(1.0,1.0) ), u.x), u.y);
      }

      float fbm(vec2 p) {
          float f = 0.0;
          float w = 0.5;
          for (int i = 0; i < 5; i++) {
              f += w * noise(p);
              p *= 2.0;
              w *= 0.5;
          }
          return f;
      }

      // --- SDFs ---
      float sdSegment(vec2 p, vec2 a, vec2 b, out float h) {
          vec2 pa = p - a, ba = b - a;
          h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
          return length(pa - ba * h);
      }

      void main() {
          float aspect = u_resolution.x / u_resolution.y;
          vec2 uv = vUv;
          
          // Map to aspect ratio centered at 0.5
          uv.x = (uv.x - 0.5) * aspect + 0.5;
          
          // Dreamtime Bilateral Symmetry
          if (uv.x > 0.5) uv.x = 1.0 - uv.x;

          // Domain Warping: The Ocean/Math (Fractal Mycelium)
          vec2 warp = vec2(fbm(uv * 3.0 + u_time * 0.15), fbm(uv * 3.0 - u_time * 0.12 + 10.0));
          vec2 wuv = uv + warp * 0.08;

          // Nodes: Sporangia (Fruiting Bodies) / Waterholes
          vec2 nodes[6];
          nodes[0] = vec2(0.5, 0.15);
          nodes[1] = vec2(0.5 - 0.25 * aspect, 0.35);
          nodes[2] = vec2(0.5 - 0.15 * aspect, 0.65);
          nodes[3] = vec2(0.5 - 0.40 * aspect, 0.85);
          nodes[4] = vec2(0.5 - 0.35 * aspect, 0.15);
          nodes[5] = vec2(0.5, 0.90);

          // Track connections: Rhizomorphs / Dreaming Tracks
          int tracks[10]; // 5 segments, pairs of node indices
          tracks[0]=0; tracks[1]=1;
          tracks[2]=1; tracks[3]=2;
          tracks[4]=2; tracks[5]=3;
          tracks[6]=3; tracks[7]=5;
          tracks[8]=1; tracks[9]=4;

          float track_dist = 10.0;
          float track_id = 0.0;
          float track_flow = 0.0;
          float track_len = 0.0;

          for (int i = 0; i < 5; i++) {
              vec2 a = nodes[tracks[i*2]];
              vec2 b = nodes[tracks[i*2+1]];
              float h;
              float d = sdSegment(wuv, a, b, h);
              if (d < track_dist) {
                  track_dist = d;
                  track_id = float(i);
                  track_flow = h;
                  track_len = length(b - a);
              }
          }

          // Node distances
          float min_node_dist = 10.0;
          float node_id = 0.0;
          for (int i = 0; i < 6; i++) {
              float d = length(wuv - nodes[i]);
              if (d < min_node_dist) {
                  min_node_dist = d;
                  node_id = float(i);
              }
          }

          // Visual Bible: The Void Rule
          vec3 col = vec3(0.03, 0.01, 0.04);

          // Mycelial Lace Background
          float lace = fbm(wuv * 10.0 - u_time * 0.05);
          col = mix(col, oklch_to_srgb(0.3, 0.1, u_time * 5.0 + lace * 100.0), smoothstep(0.1, 0.4, lace) * 0.5);

          // Cellular Automata Spore Field (Dot Infill)
          float density = 70.0;
          vec2 cell = floor(wuv * density);
          vec2 cell_uv = fract(wuv * density) - 0.5;
          
          // Pseudo-CA Rules (Chaos/Life-like twinkling)
          float ca_n1 = noise(cell + floor(u_time * 6.0));
          float ca_n2 = noise(cell + floor(u_time * 6.0 - 1.0));
          float alive = step(0.4, ca_n1) * step(ca_n2, 0.7); // Edge-of-chaos flicker
          
          float dot_size = 0.35 * alive * smoothstep(0.0, 0.5, fbm(cell * 0.1));
          float dot_mask = smoothstep(dot_size, dot_size - 0.08, length(cell_uv));
          
          // Exclude dots from tracks and nodes
          float void_mask = smoothstep(0.03, 0.06, track_dist) * smoothstep(0.08, 0.12, min_node_dist);
          
          // Color Systems: Golden Angle Palette for Spores
          float spore_hue = mod(cell.x * 11.0 + cell.y * 17.0 + u_time * 15.0, 360.0);
          vec3 dot_col = oklch_to_srgb(0.7, 0.18, spore_hue);
          col = mix(col, dot_col, dot_mask * void_mask);

          // Slime Mold Rhizomorphs (Dreaming Tracks)
          // Cytoplasmic streaming pulse
          float pulse = sin(track_flow * track_len * 40.0 - u_time * 8.0);
          float t_width = 0.012 + 0.004 * pulse;
          float track_mask = smoothstep(t_width, t_width - 0.003, track_dist);
          
          vec3 t_col = oklch_to_srgb(0.65, 0.28, track_id * GOLDEN_ANGLE - u_time * 20.0);
          
          // X-Ray Animal styling: internal structure line
          float t_inner = smoothstep(0.003, 0.001, track_dist) * step(0.0, pulse);
          t_col = mix(t_col, vec3(1.0, 0.95, 0.8), t_inner); // Kaolin white inner
          
          col = mix(col, t_col, track_mask * smoothstep(0.05, 0.08, min_node_dist)); // avoid overlapping node centers

          // Sporangia / Waterholes (Concentric Rings)
          // Dictyostelid cAMP signal waves logic combined with Dreamtime rings
          float ring_sp = 0.02 + 0.005 * sin(u_time * 2.0 + node_id);
          float ring_phase = mod(min_node_dist - u_time * 0.03, ring_sp);
          float ring_mask = smoothstep(0.006, 0.002, abs(ring_phase - ring_sp * 0.5));
          ring_mask *= smoothstep(0.12, 0.02, min_node_dist); // Attenuate outwards
          
          // Slime Mold cAMP Spiral Waves
          float angle = atan(wuv.y - nodes[int(node_id)].y, wuv.x - nodes[int(node_id)].x);
          float camp_wave = sin(min_node_dist * 80.0 - u_time * 10.0 - angle * 2.0);
          ring_mask += smoothstep(0.8, 1.0, camp_wave) * 0.3 * smoothstep(0.12, 0.0, min_node_dist);

          // Center solid dot
          float center_mask = smoothstep(0.015, 0.01, min_node_dist);
          ring_mask = max(ring_mask, center_mask);

          vec3 ring_col = oklch_to_srgb(0.8, 0.3, node_id * GOLDEN_ANGLE + u_time * 40.0);
          
          // X-Ray glow at the core
          ring_col = mix(ring_col, vec3(1.0), center_mask * 0.5 * (0.5 + 0.5*sin(u_time*10.0)));

          col = mix(col, ring_col, clamp(ring_mask, 0.0, 1.0));

          // Vignette
          float vig = length(vUv - 0.5);
          col *= 1.0 - smoothstep(0.4, 0.8, vig);

          fragColor = vec4(col, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader,
      fragmentShader,
      depthWrite: false,
      depthTest: false
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    canvas.__three = { renderer, scene, camera, material };
  } catch (e) {
    console.error("WebGL 2 Initialization Failed:", e);
    return;
  }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms) {
  if (material.uniforms.u_time) material.uniforms.u_time.value = time;
  if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(grid.width, grid.height);
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);