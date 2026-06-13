try {
  if (!canvas.__three) {
    if (!ctx) throw new Error("WebGL 2 context not available");
    
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;
    
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
      #define TAU 6.28318530718

      float hash12(vec2 p) {
          vec3 p3  = fract(vec3(p.xyx) * .1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
      }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f*f*(3.0-2.0*f);
          return mix(mix(hash12(i), hash12(i+vec2(1.0,0.0)), f.x),
                     mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), f.x), f.y);
      }

      vec3 oklch_to_oklab(vec3 lch) {
          return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
      }

      vec3 oklab_to_srgb(vec3 c) {
          float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
          float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
          float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;

          float l = l_ * l_ * l_;
          float m = m_ * m_ * m_;
          float s = s_ * s_ * s_;

          vec3 rgb = vec3(
               4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
              -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
              -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
          );
          
          return clamp(rgb, 0.0, 1.0);
      }

      float sdHexagram(vec2 p, float r) {
          const vec4 k = vec4(-0.5, 0.8660254038, 0.5773502692, 1.7320508076);
          p = abs(p);
          p -= 2.0*min(dot(k.xy, p), 0.0)*k.xy;
          p -= 2.0*min(dot(k.yx, p), 0.0)*k.yx;
          p -= vec2(clamp(p.x, r*k.z, r*k.w), r);
          return length(p)*sign(p.y);
      }

      float turing(vec2 p) {
          float n1 = noise(p * 10.0);
          float n2 = noise(p * 20.0 + n1 * 5.0);
          return smoothstep(0.4, 0.6, n2);
      }

      float optical_engine(vec2 p, float t) {
          float r = length(p);
          float th = atan(p.y, p.x);
          
          float spokes = cos(12.0 * th + sin(r * 10.0 - t * 2.0) * 2.0);
          float mode = cos(6.0 * th) * sin(15.0 * r - t);
          
          float grid1 = sin(p.x * 100.0) * sin(p.y * 100.0);
          float s = sin(t * 0.1);
          float c = cos(t * 0.1);
          vec2 p2 = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
          float grid2 = sin(p2.x * 100.0) * sin(p2.y * 100.0);
          float moire = grid1 * grid2;
          
          float v = spokes * mode + moire * 0.5;
          return smoothstep(0.0, 0.1, v);
      }

      vec3 get_bg(vec2 uv, float t) {
          vec3 void1 = vec3(0.04, 0.0, 0.08); 
          vec3 void2 = vec3(0.18, 0.11, 0.41); 
          float n = noise(uv * 5.0 - t * 0.1);
          vec3 col = mix(void1, void2, n);
          float d = hash12(uv * 200.0 + t);
          if (d > 0.995) col += vec3(0.8);
          return col;
      }

      vec4 draw_card(vec2 uv, float t) {
          float card_h = 0.85;
          float card_w = card_h / 1.73;
          vec2 card_uv = (uv - 0.5) / vec2(card_w, card_h) + 0.5;
          
          float in_card = step(0.0, card_uv.x) * step(card_uv.x, 1.0) * 
                          step(0.0, card_uv.y) * step(card_uv.y, 1.0);
                          
          if (in_card < 0.5) return vec4(0.0); 
          
          float bw = 0.03;
          float edge = min(min(card_uv.x, 1.0 - card_uv.x), min(card_uv.y, 1.0 - card_uv.y));
          float in_outer = step(edge, bw);
          float in_margin = step(edge, bw * 2.0) * (1.0 - in_outer);
          
          vec2 p = (card_uv - 0.5) * vec2(1.0, 1.73);
          
          vec3 bg = vec3(0.05, 0.05, 0.05); 
          vec3 gold = vec3(0.75, 0.65, 0.44);
          vec3 red = vec3(0.8, 0.1, 0.2);
          
          if (in_outer > 0.5) {
              float n = noise(card_uv * 150.0);
              return vec4(mix(gold * 0.4, gold, n), 1.0);
          }
          if (in_margin > 0.5) return vec4(bg, 1.0);
          
          vec3 col = bg;
          
          float tur = turing(p + t * 0.05);
          vec3 acid1 = vec3(1.0, 0.0, 0.5); 
          vec3 acid2 = vec3(0.0, 1.0, 0.8); 
          vec3 acid = mix(acid1, acid2, sin(p.x * 5.0 + t) * 0.5 + 0.5);
          col = mix(col, acid * 0.4, tur); 
          
          float dHex = sdHexagram(p, 0.35);
          float hexLine = smoothstep(0.01, 0.0, abs(dHex));
          hexLine *= noise(p * 80.0 + t) * 0.5 + 0.5;
          
          float inHex = smoothstep(0.01, 0.0, dHex);
          if (inHex > 0.5) {
              float op = optical_engine(p, t);
              float phase = length(p) * 15.0 - t * 2.0;
              vec3 lch = vec3(0.65, 0.25, phase); 
              vec3 irid = oklab_to_srgb(oklch_to_oklab(lch));
              col = mix(col, irid, op);
          }
          
          col = mix(col, gold, hexLine);
          
          float title_bar = step(card_uv.y, 0.12);
          float num_bar = step(0.9, card_uv.y);
          if (title_bar > 0.5 || num_bar > 0.5) {
              col = mix(bg, red * 0.3, noise(p * 30.0));
              float border = max(smoothstep(0.003, 0.0, abs(card_uv.y - 0.12)),
                                 smoothstep(0.003, 0.0, abs(card_uv.y - 0.9)));
              col = mix(col, gold, border);
              
              vec2 tp = p * vec2(1.0, 10.0);
              float text = noise(floor(tp * 20.0));
              if (text > 0.7 && abs(p.x) < 0.3) {
                  col = mix(col, gold, 0.8);
              }
          }
          
          return vec4(col, 1.0);
      }

      void main() {
          vec2 st = gl_FragCoord.xy / u_resolution;
          float aspect = u_resolution.x / u_resolution.y;
          vec2 uv = st;
          uv.x = (uv.x - 0.5) * aspect + 0.5;
          float t = u_time;
          
          float head_switch = 1.0 - smoothstep(0.0, 0.08, st.y);
          if (head_switch > 0.0) {
              float n = hash12(st * vec2(1.0, 100.0) + t);
              uv.x += (n - 0.5) * 0.08 * head_switch;
          }
          
          float tear = smoothstep(0.98, 1.0, sin(uv.y * 13.0 + t)) * 
                       smoothstep(0.98, 1.0, sin(uv.y * 3.0 - t * 0.5));
          uv.x += tear * 0.05 * sin(uv.y * 50.0);
          
          float chrom_off = 0.004 + tear * 0.02;
          
          vec4 c_r = draw_card(uv + vec2(chrom_off, 0.0), t);
          vec4 c_g = draw_card(uv, t);
          vec4 c_b = draw_card(uv - vec2(chrom_off, 0.0), t);
          
          vec3 bg = get_bg(uv, t);
          
          vec3 col;
          col.r = mix(bg.r, c_r.r, c_r.a);
          col.g = mix(bg.g, c_g.g, c_g.a);
          col.b = mix(bg.b, c_b.b, c_b.a);
          
          float grain = hash12(st * 500.0 + t);
          col *= 0.92 + 0.08 * grain;
          
          float scan = sin(st.y * u_resolution.y * PI * 0.5);
          col *= 0.97 + 0.03 * scan;
          
          float vig = length(st - 0.5) * 2.0;
          col *= 1.0 - smoothstep(0.8, 1.5, vig);
          
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
      fragmentShader
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
}