if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL context not available");
    
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
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

      // Alchemical Math: Hash & Noise
      float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                     mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
      }

      // OKLab to sRGB (Perceptual Color System)
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
          vec3 srgb = mix(rgb * 12.92, 1.055 * pow(max(rgb, vec3(0.0)), vec3(1.0/2.4)) - 0.055, step(0.0031308, rgb));
          return clamp(srgb, 0.0, 1.0);
      }

      // Early Internet "Text Debris" abstraction
      float text_debris(vec2 p, float t) {
          vec2 grid = floor(p * vec2(30.0, 50.0));
          float n = hash(grid + floor(t * 8.0));
          return step(0.85, n) * step(0.3, hash(vec2(grid.y, 1.0)));
      }

      // Retinal Surrealism: Hyperbolic Moiré Pattern Generator
      float get_pattern(vec2 p, float t) {
          // Macroblocking & Data Rot
          float block_glitch = step(0.96, hash(vec2(floor(p.y * 12.0), floor(t * 3.0))));
          if (block_glitch > 0.5) {
              p.x += (hash(vec2(t)) - 0.5) * 0.8;
              p = floor(p * 15.0) / 15.0;
          }

          // Möbius Transformation (Hyperbolic Tilings)
          vec2 mob = vec2(sin(t * 0.5) * 0.2, cos(t * 0.8) * 0.15);
          vec2 num = p - mob;
          vec2 den = vec2(1.0, 0.0) - vec2(dot(mob, p), mob.x * p.y - mob.y * p.x);
          float den2 = dot(den, den);
          vec2 z = den2 > 1e-12 ? vec2(dot(num, den), num.x * den.y - num.y * den.x) / den2 : p;

          float r = length(z);
          float a = atan(z.y, z.x);

          // Funnel / Tunnel Lens Forms
          float depth = 1.0 / (r + 0.05);
          vec2 tunnel_uv = vec2(a / 3.14159265, depth + t * 0.8);

          // Zebra Waves & Radial Hypnosis
          float stripes = sin(tunnel_uv.x * 40.0 + sin(tunnel_uv.y * 12.0) * 4.0);
          float rings = sin(tunnel_uv.y * 25.0 - t * 4.0);
          float op_art = step(0.0, stripes * rings); 

          // Tiled Surface Patterns (Checkerboard collapse)
          float checker = step(0.0, sin(tunnel_uv.x * 60.0) * sin(tunnel_uv.y * 60.0));
          op_art = mix(op_art, checker, smoothstep(0.0, 1.5, r));

          return op_art;
      }

      void main() {
          vec2 p = vUv * 2.0 - 1.0;
          p.x *= u_resolution.x / u_resolution.y;

          // P-adic Time Leak (Stuttering Frame Echo)
          float t = u_time + 0.3 * sin(u_time * 20.0) * step(0.85, hash(vec2(u_time)));

          // VHS Tracking Error & Tape Wear
          float tracking_tear = step(0.92, sin(p.y * 15.0 + t * 8.0)) * hash(vec2(t, p.y));
          vec2 drift_p = p + vec2(tracking_tear * 0.2 * sin(t * 10.0), 0.0);

          // RGB Phantom / Chromatic Interference Op
          float split_dist = 0.03 * sin(t * 3.0) + 0.08 * step(0.95, hash(vec2(t, 2.0)));
          float col_r = get_pattern(drift_p + vec2(split_dist, 0.0), t);
          float col_g = get_pattern(drift_p, t);
          float col_b = get_pattern(drift_p - vec2(split_dist, 0.0), t);

          // Acid Candy / MySpace Palette via OKLab
          vec3 oklab_pink = vec3(0.65, 0.25, -0.1);  // Hyperpop Magenta
          vec3 oklab_cyan = vec3(0.70, -0.15, -0.05); // Electric Cyan
          
          vec3 final_color = vec3(0.05); // Dark background energy
          final_color = mix(final_color, oklab_to_srgb(oklab_pink), col_r);
          final_color = mix(final_color, oklab_to_srgb(oklab_cyan), col_b);
          // White intersection for maximum contrast
          final_color = mix(final_color, vec3(1.0), col_r * col_g * col_b); 

          // MySpace Glitter / Sparkle Logic
          float glitter_noise = hash(drift_p * 200.0 + t);
          float glitter_mask = step(0.97, glitter_noise) * step(0.15, length(p));
          vec3 glitter_color = mix(vec3(1.0, 0.0, 0.8), vec3(0.0, 1.0, 1.0), hash(p - t));
          final_color = mix(final_color, glitter_color + 1.0, glitter_mask);

          // Text / UI Debris
          float debris = text_debris(drift_p * 1.5, t);
          final_color = mix(final_color, vec3(0.9, 0.9, 1.0), debris * tracking_tear);

          // Invert colors in tracking bands (Cursed Shitpost / Glitch Rot)
          if (tracking_tear > 0.6) {
              final_color = vec3(1.0) - final_color;
          }

          // CRT Scanline Bleed
          float scanline = sin(vUv.y * u_resolution.y * 3.14159);
          final_color -= (scanline * 0.08);

          // Phosphor Vignette
          float vignette = 1.0 - dot(p, p) * 0.25;
          final_color *= vignette;

          fragColor = vec4(final_color, 1.0);
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
    console.error("WebGL 2 initialization failed:", e);
    return;
  }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms) {
  if (material.uniforms.u_time) {
    material.uniforms.u_time.value = time;
  }
  if (material.uniforms.u_resolution) {
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);