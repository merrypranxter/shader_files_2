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
        u_mouse: { value: new THREE.Vector2(mouse.x, mouse.y) },
        u_intensity: { value: 0.8 },
        u_density: { value: 0.75 },
        u_chromaticSpread: { value: 0.6 },
        u_datamoshAmount: { value: 0.5 },
        u_glitchBurst: { value: 0.0 },
        u_chromatophoreActivity: { value: 0.7 },
        u_halftoneScale: { value: 1.0 },
        u_pulse: { value: 0.0 }
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
        uniform float u_intensity;
        uniform float u_density;
        uniform float u_chromaticSpread;
        uniform float u_datamoshAmount;
        uniform float u_glitchBurst;
        uniform float u_chromatophoreActivity;
        uniform float u_halftoneScale;
        uniform float u_pulse;

        const float PI = 3.14159265359;
        const float TAU = 6.28318530718;

        float hash21(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        vec2 hash22(vec2 p) {
            p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
            return fract(sin(p) * 43758.5453123);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            float a = hash21(i);
            float b = hash21(i + vec2(1.0, 0.0));
            float c = hash21(i + vec2(0.0, 1.0));
            float d = hash21(i + vec2(1.0, 1.0));
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            vec2 shift = vec2(100.0);
            mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
            for (int i = 0; i < 4; i++) {
                v += a * noise(p);
                p = rot * p * 2.0 + shift;
                a *= 0.5;
            }
            return v;
        }

        vec3 linear_srgb_to_oklab(vec3 c) {
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

        vec3 oklab_to_linear_srgb(vec3 c) {
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

        vec3 oklch_to_oklab(vec3 lch) {
            return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
        }

        vec3 oklab_to_srgb(vec3 c) {
            vec3 lin = oklab_to_linear_srgb(c);
            return pow(max(lin, 0.0), vec3(1.0 / 2.2));
        }

        vec3 oklch_rainbow(float t, float chroma, float lightness) {
            float hue = t * TAU;
            vec3 lch = vec3(lightness, chroma, hue);
            return oklab_to_srgb(oklch_to_oklab(lch));
        }

        vec2 barrel(vec2 uv, float k1) {
            vec2 c = uv - 0.5;
            float r2 = dot(c, c);
            float k2 = k1 * 0.15;
            return c * (1.0 + k1 * r2 + k2 * r2 * r2) + 0.5;
        }

        vec2 datamosh_warp(vec2 uv, float time) {
            vec2 block_size = vec2(16.0) / u_resolution;
            vec2 block_uv = floor(uv / block_size) * block_size;
            float block_hash = hash21(block_uv + floor(time * 4.0));
            float is_corrupt = step(1.0 - u_datamoshAmount * 0.6, hash21(block_uv));
            float flow_angle = fbm(block_uv * 3.0 + time * 0.1) * TAU;
            vec2 flow_dir = vec2(cos(flow_angle), sin(flow_angle));
            float smear_len = fbm(block_uv * 5.0 - time * 0.2) * 0.08 * u_datamoshAmount;
            vec2 offset = flow_dir * smear_len * is_corrupt;
            return clamp(uv - offset, 0.0, 1.0);
        }

        float halftone_dot(vec2 fragCoord, float intensity, float angle, float scale) {
            float rad = angle * 0.0174532925;
            mat2 rot = mat2(cos(rad), -sin(rad), sin(rad), cos(rad));
            vec2 rotated = rot * fragCoord;
            float size = 8.0 * scale * u_halftoneScale;
            vec2 grid = fract(rotated / size) - 0.5;
            float radius = sqrt(clamp(intensity, 0.0, 1.0)) * 0.71;
            float d = length(grid);
            return smoothstep(radius + 0.05, radius - 0.05, d);
        }

        vec3 apply_halftone(vec2 fragCoord, vec3 color) {
            float k = 1.0 - max(max(color.r, color.g), color.b);
            vec3 cmy = (1.0 - color - k) / max(1.0 - k, 1e-4);
            float c_dot = halftone_dot(fragCoord, cmy.r, 15.0, 1.0);
            float m_dot = halftone_dot(fragCoord, cmy.g, 75.0, 1.0);
            float y_dot = halftone_dot(fragCoord, cmy.b, 0.0, 1.0);
            float k_dot = halftone_dot(fragCoord, k, 45.0, 0.8);
            vec3 paper = vec3(0.96, 0.94, 0.88);
            vec3 col = paper;
            col *= mix(vec3(1.0), vec3(0.0, 1.0, 1.0), c_dot);
            col *= mix(vec3(1.0), vec3(1.0, 0.0, 1.0), m_dot);
            col *= mix(vec3(1.0), vec3(1.0, 1.0, 0.0), y_dot);
            col *= mix(vec3(1.0), vec3(0.0), k_dot);
            return col;
        }

        vec3 chromatophore_layer(vec2 uv, vec3 substrate, float time) {
            vec2 st = uv * 32.0;
            vec2 ip = floor(st);
            vec2 fp = fract(st);
            float min_dist = 1.0;
            vec2 closest_id = vec2(0.0);
            for (int y = -1; y <= 1; y++) {
                for (int x = -1; x <= 1; x++) {
                    vec2 neighbor = vec2(float(x), float(y));
                    vec2 cell_id = ip + neighbor;
                    vec2 jitter = hash22(cell_id);
                    vec2 center = neighbor + jitter;
                    float d = length(center - fp);
                    if (d < min_dist) {
                        min_dist = d;
                        closest_id = cell_id;
                    }
                }
            }
            float wave = sin(closest_id.x * 0.15 - time * 2.0) * cos(closest_id.y * 0.15 + time * 1.5);
            float act = smoothstep(-0.5, 0.5, wave + (noise(closest_id * 0.4 + time * 0.5) - 0.5) * 0.8);
            act *= u_chromatophoreActivity;
            float r0 = 0.15 + 0.1 * hash21(closest_id);
            float radius = r0 * (1.0 + 1.24 * act);
            float p_hash = hash21(closest_id + 7.13);
            vec3 pig_col;
            if (p_hash < 0.4) {
                pig_col = vec3(0.910, 0.722, 0.294);
            } else if (p_hash < 0.75) {
                pig_col = vec3(0.710, 0.314, 0.165);
            } else {
                pig_col = vec3(0.165, 0.102, 0.071);
            }
            if (p_hash >= 0.75) {
                pig_col = mix(pig_col, vec3(0.769, 0.118, 0.227), u_glitchBurst);
            }
            float disk = smoothstep(radius, radius * 0.6, min_dist);
            return mix(substrate, pig_col, disk * 0.85);
        }

        float sdReactor(vec2 p, float time) {
            float angle = atan(p.y, p.x);
            float r = length(p);
            float gear = sin(angle * 12.0 + time * 3.0) * 0.04;
            float pulse = sin(time * 4.0) * 0.05 * u_pulse;
            float d1 = abs(r - (0.4 + gear + pulse)) - 0.02;
            float tentacle = sin(angle * 5.0 - r * 8.0 + time * 4.0) * 0.08 * (1.0 + u_pulse);
            float d2 = length(p + vec2(cos(angle), sin(angle)) * tentacle) - 0.12;
            return min(d1, d2);
        }

        vec3 render_reactor(vec2 uv, float time) {
            vec2 p = (uv - 0.5) * 2.0;
            p.x *= u_resolution.x / u_resolution.y;
            float d_red   = sdReactor(p + vec2(0.008, 0.0) * u_chromaticSpread, time);
            float d_green = sdReactor(p, time);
            float d_blue  = sdReactor(p - vec2(0.008, 0.0) * u_chromaticSpread, time);
            float edge_r = smoothstep(0.04, -0.04, d_red);
            float edge_g = smoothstep(0.04, -0.04, d_green);
            float edge_b = smoothstep(0.04, -0.04, d_blue);
            vec3 reactor_mask = vec3(edge_r, edge_g, edge_b);
            float glow = exp(-max(d_green, 0.0) * 12.0) * 0.8;
            vec3 glow_col = oklch_rainbow(time * 0.15, 0.35, 0.7) * glow;
            float plasma_t = uv.x * 4.0 + sin(uv.y * 3.0 + time) * 2.0;
            vec3 plasma_col = oklch_rainbow(plasma_t, 0.3, 0.6);
            return mix(glow_col, plasma_col, reactor_mask) + glow_col * 0.5;
        }

        vec3 anamorphic_flare(vec2 uv, float time, float intensity) {
            float y_center = 0.5 + sin(time * 0.8) * 0.15;
            float dist_y = abs(uv.y - y_center);
            float streak = exp(-dist_y * dist_y / 0.00002) * 1.5;
            float glow = exp(-dist_y * dist_y / 0.001) * 0.4;
            float flare = (streak + glow) * intensity;
            float dx = abs(uv.x - 0.5);
            vec3 flare_col = oklch_rainbow(uv.x * 2.0 + time, 0.25, 0.7);
            float horiz_fade = exp(-dx * dx / 0.12);
            return flare_col * flare * horiz_fade;
        }

        vec3 apply_browser_debris(vec2 uv, vec3 color, float time) {
            for (int i = 0; i < 3; i++) {
                float fi = float(i);
                vec2 pos = vec2(
                    0.5 + sin(time * 0.5 + fi * 2.3) * 0.25,
                    0.5 + cos(time * 0.4 + fi * 1.7) * 0.2
                );
                vec2 size = vec2(0.12, 0.08);
                vec2 d = abs(uv - pos) - size;
                float box = max(d.x, d.y);
                if (box < 0.0) {
                    float header_y = pos.y + size.y - size.y * 0.25;
                    if (uv.y > header_y) {
                        color = oklch_rainbow(fi * 0.3 + time * 0.5, 0.35, 0.6);
                    } else {
                        float dither = step(0.5, fract((uv.x - uv.y) * 40.0));
                        vec3 content_col = mix(vec3(0.12, 0.08, 0.15), vec3(0.85, 0.75, 0.9), dither);
                        color = content_col;
                    }
                    if (box > -0.003) {
                        color = vec3(0.9, 0.8, 1.0);
                    }
                } else if (box < 0.015) {
                    color *= 0.65;
                }
            }
            return color;
        }

        vec3 apply_crt_mask(vec2 fragCoord, vec3 color) {
            float col = mod(fragCoord.x, 3.0);
            vec3 stripe = vec3(
                smoothstep(1.0, 0.0, abs(col - 0.5)),
                smoothstep(1.0, 0.0, abs(col - 1.5)),
                smoothstep(1.0, 0.0, abs(col - 2.5))
            );
            color *= mix(vec3(1.0), stripe, 0.45 * u_intensity);
            float scan = sin(fragCoord.y * 3.14159265) * 0.5 + 0.5;
            color *= mix(1.0, scan, 0.35 * u_intensity);
            float y = fragCoord.y / u_resolution.y;
            float w1 = exp(-pow(y - 0.33, 2.0) / 0.0009);
            float w2 = exp(-pow(y - 0.66, 2.0) / 0.0009);
            color *= 1.0 - 0.15 * (w1 + w2) * u_intensity;
            return color;
        }

        vec3 color_safety(vec3 col) {
            float lum = dot(col, vec3(0.299, 0.587, 0.114));
            vec3 deep_dark = vec3(0.04, 0.02, 0.08);
            col = mix(deep_dark, col, smoothstep(0.0, 0.15, lum));
            vec3 bright_highlight = vec3(0.95, 0.9, 1.0);
            col = mix(col, bright_highlight, smoothstep(0.85, 1.0, lum));
            return col;
        }

        void main() {
            vec2 uv = barrel(vUv, 0.12 * u_intensity);
            vec2 mosh_uv = datamosh_warp(uv, u_time);
            
            float plasma_t = mosh_uv.x * 3.0 + sin(mosh_uv.y * 4.0 + u_time * 0.5) * 1.5;
            vec3 bg_color = oklch_rainbow(plasma_t * 0.25, 0.3, 0.45);
            
            vec2 fragCoord = uv * u_resolution;
            vec3 halftone_bg = apply_halftone(fragCoord, bg_color);
            vec3 mixed_bg = mix(bg_color, halftone_bg, u_density);
            
            vec3 skin_color = chromatophore_layer(mosh_uv, mixed_bg, u_time);
            vec3 reactor = render_reactor(uv, u_time);
            
            vec2 p = (uv - 0.5) * 2.0;
            p.x *= u_resolution.x / u_resolution.y;
            float reactor_d = sdReactor(p, u_time);
            float reactor_mask = smoothstep(0.04, -0.04, reactor_d);
            vec3 final_color = mix(skin_color, reactor, reactor_mask);
            
            vec3 flare = anamorphic_flare(uv, u_time, 0.8 * u_intensity);
            final_color += flare;
            
            final_color = apply_browser_debris(uv, final_color, u_time);
            final_color = apply_crt_mask(fragCoord, final_color);
            final_color = color_safety(final_color);
            
            fragColor = vec4(final_color, 1.0);
        }
      `
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    canvas.__three = { renderer, scene, camera, material };
  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
    return;
  }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms) {
  material.uniforms.u_time.value = time;
  material.uniforms.u_resolution.value.set(grid.width, grid.height);
  material.uniforms.u_mouse.value.set(mouse.x, mouse.y);

  const cycle = mod(time, 4.0);
  const is_glitch_burst = step(3.6, cycle);
  const glitch_scale = Math.sin(smoothstep(3.6, 4.0, cycle) * Math.PI);

  material.uniforms.u_glitchBurst.value = is_glitch_burst * glitch_scale;
  material.uniforms.u_pulse.value = 0.5 + 0.5 * Math.sin(time * 6.0);

  material.uniforms.u_intensity.value = 0.75 + 0.25 * Math.sin(time * 0.5);
  material.uniforms.u_density.value = 0.6 + 0.4 * Math.cos(time * 0.3);
  material.uniforms.u_chromaticSpread.value = 0.5 + 0.5 * Math.sin(time * 0.8);
  material.uniforms.u_datamoshAmount.value = 0.4 + 0.4 * Math.sin(time * 0.2);
  material.uniforms.u_chromatophoreActivity.value = 0.6 + 0.4 * Math.cos(time * 0.4);
  material.uniforms.u_halftoneScale.value = 1.0 + 0.5 * Math.sin(time * 0.1);
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);

function mod(n, m) {
  return ((n % m) + m) % m;
}

function step(edge, x) {
  return x >= edge ? 1.0 : 0.0;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

function clamp(x, minVal, maxVal) {
  return Math.min(Math.max(x, minVal), maxVal);
}