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
      precision highp float;
      in vec2 vUv;
      out vec4 fragColor;
      uniform float u_time;
      uniform vec2 u_resolution;

      #define PI 3.14159265359

      // ─── Outsider Art / Feral Noise Mechanics ─────────────────────────────
      float hash(vec2 p) { 
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); 
      }
      
      float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      
      float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 6; i++) { 
              v += a * noise(p); 
              p *= 2.0; 
              a *= 0.5; 
          }
          return v;
      }

      // ─── Color Systems (OKLab) ────────────────────────────────────────────
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

          vec3 srgb = vec3(
              rgb.r <= 0.0031308 ? rgb.r * 12.92 : 1.055 * pow(max(rgb.r, 0.0), 1.0/2.4) - 0.055,
              rgb.g <= 0.0031308 ? rgb.g * 12.92 : 1.055 * pow(max(rgb.g, 0.0), 1.0/2.4) - 0.055,
              rgb.b <= 0.0031308 ? rgb.b * 12.92 : 1.055 * pow(max(rgb.b, 0.0), 1.0/2.4) - 0.055
          );
          return clamp(srgb, 0.0, 1.0);
      }

      // ─── Mathematical Masterpiece (Quasicrystal Lattices) ─────────────────
      float quasicrystal(vec2 p, float t) {
          float sum = 0.0;
          const int N = 7; // 7-fold sacred geometry
          for(int i = 0; i < N; i++) {
              float a = PI * float(i) / float(N);
              vec2 dir = vec2(cos(a), sin(a));
              // Prime-gap phase shifting
              float phase = t * (1.0 + 0.15 * float(i));
              sum += cos(dot(p, dir) * 12.0 + phase);
          }
          return sum / float(N);
      }

      // ─── Structural Color (Thin-Film Interference) ────────────────────────
      vec3 thinFilm(float thickness, float cosTheta) {
          float n = 1.33; // Wet/water index
          float sinThetaI2 = 1.0 - cosTheta * cosTheta;
          float sinThetaT2 = sinThetaI2 / (n * n);
          float cosThetaT = sqrt(max(0.0, 1.0 - sinThetaT2));
          float pathDiff = 2.0 * n * thickness * cosThetaT;
          
          vec3 phase = vec3(0.0, 0.33, 0.67); // RGB shift
          return 0.5 + 0.5 * cos(PI * 2.0 * (pathDiff + phase));
      }

      void main() {
          vec2 uv = vUv * 2.0 - 1.0;
          uv.x *= u_resolution.x / u_resolution.y;
          
          float t = u_time * 0.3;
          
          // ─── 1. The "Rainblown" Mechanism (Shear & Advection) ─────────────
          vec2 windDir = normalize(vec2(1.5, -2.0));
          vec2 wind = windDir * t * 2.0;
          
          // Stretch coordinates to create violent rain streaks
          mat2 rot = mat2(windDir.x, -windDir.y, windDir.y, windDir.x);
          vec2 streakP = rot * uv;
          streakP.x *= 0.08; // Extreme anisotropic stretching
          float streaks = fbm(streakP * 30.0 - vec2(t * 4.0, 0.0));
          
          // Outsider Art Wobble: The canvas itself trembles
          vec2 wobble = vec2(noise(uv * 80.0), noise(uv * 80.0 + 13.0)) * 0.015;
          
          // Advect the UVs through the storm
          vec2 warped = uv + windDir * streaks * 0.4 + wobble;
          warped += vec2(fbm(warped * 4.0 + t), fbm(warped * 4.0 - t)) * 0.15;

          // ─── 2. The Mathematical Foundation ───────────────────────────────
          // Layered quasicrystals at golden ratio (1.618) intervals
          float q1 = quasicrystal(warped, t);
          float q2 = quasicrystal(warped * 1.618 + windDir * streaks, t * 0.8);
          float field = (q1 + q2 * 0.6) * fbm(warped * 5.0);

          // ─── 3. Topography & Normal Calculation ───────────────────────────
          vec2 eps = vec2(0.005, 0.0);
          float dx = quasicrystal(warped + eps.xy, t) * fbm((warped + eps.xy) * 5.0) - field;
          float dy = quasicrystal(warped + eps.yx, t) * fbm((warped + eps.yx) * 5.0) - field;
          vec3 normal = normalize(vec3(dx, dy, 0.12)); // Z-depth defines ruggedness

          // ─── 4. The Rainbow (Structural Color + OKLab) ────────────────────
          vec3 view = vec3(0.0, 0.0, 1.0);
          float cosTheta = max(dot(normal, view), 0.0);
          
          // Fluid thickness driven by the rain streaks and the crystal lattice
          float thickness = 350.0 + 700.0 * (streaks * 0.6 + field * 0.4 + 0.5);
          vec3 iridescence = thinFilm(thickness / 1000.0, cosTheta);
          
          // OKLCh perceptual color wheel spinning through the chaos
          float hue = fract(field * 1.5 + t * 0.1 + streaks * 0.5);
          float L = 0.6 + 0.15 * streaks;
          float C = 0.2 + 0.1 * fbm(warped * 12.0);
          float h_rad = hue * PI * 2.0;
          vec3 oklab = vec3(L, C * cos(h_rad), C * sin(h_rad));
          vec3 baseColor = oklab_to_srgb(oklab);
          
          vec3 color = mix(baseColor, iridescence, 0.65); // Wet, iridescent blend

          // ─── 5. 1970s Paperback Chrome Speculars ──────────────────────────
          vec3 lightDir = normalize(vec3(-1.0, 1.5, 1.2));
          vec3 H = normalize(view + lightDir);
          float NdotH = max(dot(normal, H), 0.0);
          
          // Anisotropic smear along the wind direction (Foss/Berkey style)
          float sinTL = length(cross(vec3(windDir, 0.0), lightDir));
          float anisoSpec = pow(max(0.0, 1.0 - sinTL * (1.0 - NdotH)), 14.0);
          
          vec3 chromeF0 = vec3(0.95, 0.93, 0.88); // Silver/Chrome
          vec3 specular = chromeF0 * anisoSpec * (1.0 + streaks * 2.0);
          
          // Warm amber/gold highlight cutting through the storm
          color += specular * vec3(1.0, 0.7, 0.3) * 1.5; 

          // ─── 6. Glitch & Decay (Silicon Necrosis) ─────────────────────────
          float glitch = step(0.98, noise(vec2(uv.y * 60.0, t * 15.0)));
          color = mix(color, vec3(1.0, 0.05, 0.4), glitch * 0.6); // Aggressive magenta tear

          // Atmospheric depth & Vignette
          float vignette = 1.0 - length(uv) * 0.45;
          color *= smoothstep(0.0, 0.6, vignette);
          
          // Final contrast pop
          color = smoothstep(0.0, 1.0, color);
          
          fragColor = vec4(color, 1.0);
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
  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
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