try {
  if (!canvas.__three) {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const fragmentShader = `
      in vec2 vUv;
      out vec4 fragColor;
      
      uniform float u_time;
      uniform vec2 u_resolution;

      #define TAU 6.28318530718
      #define PI 3.14159265359

      float hash11(float p) { return fract(sin(p)*43758.5453); }
      float hash21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      mat2 rot(float a) { float s=sin(a), c=cos(a); return mat2(c, -s, s, c); }

      // Complex math for domain coloring
      vec2 c_mul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
      vec2 c_div(vec2 a, vec2 b) { float d = dot(b,b); return vec2(dot(a,b), a.y*b.x - a.x*b.y) / (d + 1e-8); }

      // OKLab to sRGB for perceptually uniform, electric colors
      vec3 oklab_to_srgb(vec3 c) {
          float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
          float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
          float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
          
          float l = l_ * l_ * l_;
          float m = m_ * m_ * m_;
          float s = s_ * s_ * s_;
          
          vec3 lin = vec3(
               4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
              -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
              -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
          );
          
          return vec3(
              lin.r <= 0.0031308 ? lin.r * 12.92 : 1.055 * pow(max(lin.r, 0.0), 1.0/2.4) - 0.055,
              lin.g <= 0.0031308 ? lin.g * 12.92 : 1.055 * pow(max(lin.g, 0.0), 1.0/2.4) - 0.055,
              lin.b <= 0.0031308 ? lin.b * 12.92 : 1.055 * pow(max(lin.b, 0.0), 1.0/2.4) - 0.055
          );
      }

      vec3 oklch_to_srgb(float L, float C, float h) {
          return oklab_to_srgb(vec3(L, C * cos(h), C * sin(h)));
      }

      // Opal/Prism Iridescence
      vec3 iridescence(float t) {
          vec3 a = vec3(0.5);
          vec3 b = vec3(0.5);
          vec3 c = vec3(1.0);
          vec3 d = vec3(0.0, 0.33, 0.67);
          return a + b * cos(TAU * (c * t + d));
      }

      // Procedural micro-sigils
      float sigil(vec2 p, float id) {
          p *= 10.0;
          float d = 1e9;
          float h1 = hash11(id * 13.1);
          float h2 = hash11(id * 27.5);
          float h3 = hash11(id * 39.7);
          float h4 = hash11(id * 51.3);
          
          p.x = abs(p.x); // Mirror symmetry
          
          float arc_r = 1.2 + 0.3 * h1;
          float arc = abs(length(p) - arc_r) - 0.04;
          arc = max(arc, p.y - (h2 * 2.0 - 1.0)); 
          d = min(d, arc);
          
          vec2 dp = p;
          dp *= rot(PI/4.0 * floor(h3 * 3.0));
          float diamond = abs(max(abs(dp.x), abs(dp.y)) - (0.3 + 0.2*h4)) - 0.04;
          d = min(d, diamond);
          
          if (h1 > 0.5) {
              float vline = max(abs(p.x) - 0.03, abs(p.y) - 1.5);
              d = min(d, vline);
          }
          if (h2 > 0.5) {
              float hline = max(abs(p.y - (h3 * 2.0 - 1.0)) - 0.03, abs(p.x) - 0.8);
              d = min(d, hline);
          }
          
          float dot_d = length(p - vec2(0.5 + h4, h1 * 2.0 - 1.0)) - 0.12;
          d = min(d, dot_d);
          
          float icirc = abs(length(p - vec2(0.0, h3 * 1.5 - 0.75)) - 0.2) - 0.03;
          d = min(d, icirc);

          return d;
      }

      void main() {
          vec2 uv = (vUv - 0.5) * 2.0;
          uv.x *= u_resolution.x / u_resolution.y;
          uv *= 1.1; 
          
          float r = length(uv);
          float theta = atan(uv.y, uv.x);
          
          vec3 final_col = vec3(0.0);
          
          // 1. Background Domain Coloring & Mesh Gradient (The Abyss)
          vec2 bg_z = uv * 2.5;
          bg_z *= rot(u_time * 0.05);
          bg_z += vec2(sin(bg_z.y * 2.0 + u_time), cos(bg_z.x * 2.0 - u_time)) * 0.2;
          vec2 bg_w = c_div(c_mul(bg_z, bg_z) + vec2(0.5, 0.0), bg_z - vec2(0.5, 0.0));
          float bg_arg = atan(bg_w.y, bg_w.x);
          float bg_mag = length(bg_w);
          
          vec2 mg_uv = uv * rot(u_time * 0.03);
          float mg_1 = sin(mg_uv.x * 2.0 + u_time) * cos(mg_uv.y * 2.5 - u_time*0.8);
          float mg_2 = sin(mg_uv.y * 1.5 - u_time*1.2) * cos(mg_uv.x * 3.0 + u_time*0.5);
          vec3 mg_col = oklch_to_srgb(0.4 + 0.2 * mg_1, 0.25, mg_2 * TAU + u_time * 0.2);
          
          vec3 bg_base = oklch_to_srgb(0.5 + 0.2 * sin(bg_mag * 4.0 - u_time), 0.2, bg_arg + u_time * 0.2);
          float nebula = sin(bg_z.x * 3.0) * cos(bg_z.y * 3.0 + u_time) * 0.5 + 0.5;
          bg_base += nebula * vec3(0.2, 0.0, 0.3);
          
          float contour = smoothstep(0.05, 0.0, abs(fract(bg_mag * 3.0 - u_time * 0.5) - 0.5));
          bg_base = mix(bg_base, iridescence(bg_arg), contour * 0.8);
          vec3 bg_col = mix(bg_base, mg_col, 0.5);
          
          // 2. Outer Tick Ring [0.95, 1.0]
          float outer_tick_mask = smoothstep(1.0, 0.995, r) * smoothstep(0.95, 0.955, r);
          float ticks360 = smoothstep(0.5, 1.0, sin(theta * 360.0));
          float ticks72 = smoothstep(0.8, 1.0, sin(theta * 72.0));
          float tick_val = max(ticks360 * 0.3, ticks72);
          vec3 outer_tick_col = mix(vec3(0.02, 0.0, 0.05), vec3(0.0, 1.0, 0.8), tick_val);
          float dots = smoothstep(0.95, 1.0, sin(theta * 24.0 - u_time * 2.0));
          outer_tick_col = mix(outer_tick_col, vec3(1.0, 0.2, 0.8), dots * smoothstep(0.97, 0.98, r));
          
          // 3. Outer Zodiac Ring [0.65, 0.95]
          float outer_a = theta - u_time * 0.05;
          float sector = floor(outer_a * 12.0 / TAU);
          float local_a = mod(outer_a, TAU/12.0) - TAU/24.0;
          float sector_phase = sin(u_time * 2.0 + sector * 1.618);
          float h_outer = sector * (TAU / 12.0) + u_time * 0.5;
          
          vec3 sector_col = oklch_to_srgb(0.7 + 0.1*sector_phase, 0.28, h_outer);
          
          // Simultaneous contrast halo
          float sector_halo = smoothstep(0.08, 0.0, abs(local_a));
          vec3 comp_col = oklch_to_srgb(0.7, 0.3, h_outer + PI);
          sector_col = mix(sector_col, comp_col, sector_halo * 0.6);
          
          // Sigils in outer ring
          vec2 sigil_p = vec2(local_a * r, r - 0.8);
          float d_sigil = sigil(sigil_p, sector);
          float flicker = hash11(u_time * 8.0 + sector);
          float crisp = smoothstep(0.015, 0.0, d_sigil);
          float refract_d = sin(d_sigil * 40.0 - u_time * 10.0);
          float sigil_mask = mix(crisp, smoothstep(0.7, 0.9, refract_d) * smoothstep(1.0, 0.0, d_sigil), step(0.95, flicker));
          
          vec3 sigil_iri = iridescence(d_sigil * 20.0 - u_time);
          vec3 final_sigil_col = mix(sigil_iri, vec3(1.0), crisp);
          sector_col = mix(sector_col, final_sigil_col, sigil_mask);
          
          // Sector borders & impossible color edge ringing
          float border = smoothstep(0.005, 0.0, abs(local_a));
          sector_col = mix(sector_col, vec3(0.05, 0.0, 0.1), border);
          float ringing = sin(abs(local_a) * 400.0) * exp(-abs(local_a) * 50.0);
          sector_col += ringing * vec3(0.2, 0.5, 1.0);
          
          // Hyper saturation pop
          float hyper = step(0.98, hash11(u_time + sector));
          vec3 hyper_col = oklch_to_srgb(0.7, 0.4, h_outer + PI/2.0);
          sector_col = mix(sector_col, hyper_col, hyper);
          
          // 4. Inner Planetary Ring [0.4, 0.65]
          float inner_a = theta + u_time * 0.08;
          float inner_sector = floor(inner_a * 7.0 / TAU);
          float inner_local_a = mod(inner_a, TAU/7.0) - TAU/14.0;
          float h_inner = inner_sector * (TAU / 7.0) - u_time * 0.8;
          
          vec3 inner_col = oklch_to_srgb(0.65, 0.3, h_inner);
          float inner_halo = smoothstep(0.1, 0.0, abs(inner_local_a));
          vec3 inner_comp = oklch_to_srgb(0.65, 0.3, h_inner + PI);
          inner_col = mix(inner_col, inner_comp, inner_halo * 0.6);
          
          float wave = sin(r * 100.0 - u_time * 10.0 + inner_sector);
          inner_col += 0.15 * wave * vec3(1.0, 0.5, 0.8);
          
          float inner_glyph = abs(length(vec2(inner_local_a * r, r - 0.525)) - 0.06) - 0.005;
          vec2 dot_p = vec2(inner_local_a * r, r - 0.525) - 0.06 * vec2(cos(u_time * 3.0), sin(u_time * 3.0));
          float inner_dot = length(dot_p) - 0.015;
          inner_col = mix(inner_col, vec3(1.0), smoothstep(0.005, 0.0, inner_glyph));
          inner_col = mix(inner_col, vec3(1.0, 0.0, 0.5), smoothstep(0.005, 0.0, inner_dot));
          
          float inner_border = smoothstep(0.005, 0.0, abs(inner_local_a));
          inner_col = mix(inner_col, vec3(0.0, 0.0, 0.05), inner_border);
          
          // 5. Core Sun/Eye [0.0, 0.4]
          vec2 core_uv = uv * rot(u_time * 0.2);
          float core_a = atan(core_uv.y, core_uv.x);
          float core_r = length(core_uv);
          
          float plasma = sin(15.0 * core_r - u_time * 8.0 + 4.0 * sin(6.0 * core_a + u_time * 2.0));
          vec3 core_col = oklch_to_srgb(0.7 + 0.2 * plasma, 0.28, core_r * 25.0 - u_time * 3.0);
          
          float pupil_r = 0.08 + 0.01 * sin(u_time * 10.0);
          float pupil = smoothstep(pupil_r + 0.02, pupil_r, core_r);
          core_col = mix(core_col, vec3(0.01, 0.0, 0.05), pupil);
          
          float iris = smoothstep(0.9, 1.0, sin(core_a * 40.0 + u_time * 5.0)) * smoothstep(0.2, 0.08, core_r);
          core_col = mix(core_col, vec3(1.0, 0.8, 0.0), iris);
          
          float opal = smoothstep(0.9, 1.0, sin(core_r * 150.0 + u_time * 12.0));
          core_col += opal * iridescence(core_a + u_time);
          
          // Compositing
          final_col = bg_col;
          float mask_outer_tick = smoothstep(1.0, 0.995, r) * smoothstep(0.95, 0.955, r);
          final_col = mix(final_col, outer_tick_col, mask_outer_tick);
          
          float mask_outer = smoothstep(0.95, 0.945, r) * smoothstep(0.65, 0.655, r);
          final_col = mix(final_col, sector_col, mask_outer);
          
          float mask_inner = smoothstep(0.65, 0.645, r) * smoothstep(0.4, 0.405, r);
          final_col = mix(final_col, inner_col, mask_inner);
          
          float mask_core = smoothstep(0.4, 0.395, r);
          final_col = mix(final_col, core_col, mask_core);
          
          // Ring separators
          float sep1 = smoothstep(0.005, 0.0, abs(r - 0.95));
          float sep2 = smoothstep(0.005, 0.0, abs(r - 0.65));
          float sep3 = smoothstep(0.005, 0.0, abs(r - 0.4));
          final_col = mix(final_col, vec3(0.0, 0.0, 0.1), max(sep1, max(sep2, sep3)));
          
          // 6. Eclipse Pulse (Chromatic Compression)
          float eclipse_val = pow(max(0.0, sin(u_time * 0.4)), 80.0);
          vec3 eclipse_color = mix(vec3(0.0, 1.0, 1.0), vec3(1.0, 0.2, 0.8), length(uv));
          final_col = mix(final_col, eclipse_color * 2.0, eclipse_val * smoothstep(1.5, 0.0, r));
          final_col += pow(max(0.0, sin(u_time * 0.4)), 200.0) * vec3(2.0);
          
          // Overall Bloom Glow
          float glow = exp(-r * 2.5);
          final_col += glow * 0.15 * vec3(0.5, 0.1, 1.0);
          
          fragColor = vec4(clamp(final_col, 0.0, 1.0), 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: fragmentShader
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    canvas.__three = { renderer, scene, camera, material };
  }

  const { renderer, scene, camera, material } = canvas.__three;
  if (material && material.uniforms) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }

  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);
} catch (e) {
  console.error("WebGL Initialization Failed:", e);
  throw e;
}