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
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
        u_intensity: { value: 0.6 },
        u_glitch: { value: 0.4 }
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
        uniform vec2  u_resolution;
        uniform vec2  u_mouse;
        uniform float u_intensity;
        uniform float u_glitch;
        
        // ── Noise & Math Utilities ──
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        
        vec2 hash2(vec2 p) {
          return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453123);
        }
        
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        
        float sdBox(vec2 p, vec2 b) {
          vec2 d = abs(p) - b;
          return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
        }
        
        // ── Perceptual Color Palette ──
        vec3 getPalette(float t) {
          vec3 a = vec3(0.5, 0.4, 0.6);
          vec3 b = vec3(0.5, 0.5, 0.4);
          vec3 c = vec3(1.0, 1.0, 1.0);
          vec3 d = vec3(0.0, 0.33, 0.67);
          return clamp(a + b * cos(6.28318 * (c * t + d)), 0.0, 1.0);
        }
        
        // ── Core Procedural Scene Generator ──
        vec3 evaluateScene(vec2 uv, float time) {
          // 1. Background Plasma & Halftone Dots
          float p_noise = noise(uv * 3.5 + vec2(time * 0.15, -time * 0.1));
          vec3 bg_color = getPalette(p_noise + time * 0.04);
          bg_color = mix(vec3(0.04, 0.02, 0.15), bg_color, 0.38); // Saturated chromatic dark base
          
          float grid_size = 55.0;
          vec2 grid_uv = fract(uv * grid_size) - 0.5;
          float dot_radius = 0.38 * (1.0 - p_noise);
          float dot_mask = smoothstep(dot_radius, dot_radius - 0.06, length(grid_uv));
          bg_color = mix(bg_color, vec3(0.92, 0.12, 0.52) * (1.0 - p_noise), dot_mask * 0.28);
          
          // 2. Central Demoscene Reactor
          vec2 p = (uv - 0.5) * 2.0;
          p.x *= u_resolution.x / u_resolution.y;
          
          // Rotate central reactor symmetrically
          float angle = time * 0.35;
          p = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
          
          float r_polar = length(p);
          float theta = atan(p.y, p.x);
          
          // Kaleidoscope segment mirroring
          float segments = 6.0;
          theta = mod(theta, 6.28318 / segments) - 3.14159 / segments;
          p = vec2(cos(theta), sin(theta)) * r_polar;
          
          float wave = sin(p.x * 8.0 + time * 4.0) * 0.5 + 0.5;
          float rings = sin(r_polar * 22.0 - time * 6.0) * 0.5 + 0.5;
          float core_energy = smoothstep(0.68, 0.0, r_polar) * (wave * rings);
          
          vec3 core_color = getPalette(r_polar - time * 0.08);
          core_color = mix(core_color, vec3(0.0, 0.95, 0.85), wave); // Electric cyan highlights
          
          // 3. Cuttlefish Chromatophores (Biological display grid)
          vec2 chromUv = uv * 28.0;
          vec2 id = floor(chromUv);
          vec2 f = fract(chromUv);
          float minDist = 8.0;
          vec2 cellId = vec2(0.0);
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 neighbor = vec2(float(x), float(y));
              vec2 point = hash2(id + neighbor);
              point = 0.5 + 0.3 * sin(time * 2.2 + point * 6.28);
              float d = length(neighbor + point - f);
              if (d < minDist) {
                minDist = d;
                cellId = id + neighbor;
              }
            }
          }
          float cell_hash = hash(cellId);
          float activation = noise(cellId * 0.18 + vec2(time * 0.45, sin(time * 0.25)));
          float r_max = 0.14 + activation * 0.35;
          float cell_mask = smoothstep(r_max, r_max - 0.07, minDist);
          
          vec3 pigment = vec3(0.0);
          if (cell_hash < 0.38) {
            pigment = vec3(0.91, 0.72, 0.29); // Yellow
          } else if (cell_hash < 0.72) {
            pigment = vec3(0.71, 0.31, 0.16); // Red
          } else {
            pigment = vec3(0.16, 0.10, 0.07); // Brown
          }
          
          // 4. Early Internet Asemic UI Debris
          float ui = 0.0;
          vec2 winPos = vec2(sin(time * 0.25) * 0.35, cos(time * 0.18) * 0.22);
          vec2 winSize = vec2(0.42, 0.28);
          float d_box = sdBox(p - winPos, winSize);
          float border = smoothstep(0.006, 0.0, abs(d_box)) * 0.55;
          float title_bar = smoothstep(0.006, 0.0, abs(sdBox(p - winPos - vec2(0.0, winSize.y - 0.04), vec2(winSize.x, 0.04))));
          ui = max(border, title_bar);
          
          // 5. Anamorphic Lens Flares (Composition lines)
          float flare_y = exp(-pow((p.y - sin(time * 0.8) * 0.08) * 40.0, 2.0));
          float flare_x = smoothstep(1.6, 0.0, abs(p.x));
          vec3 flare_color = vec3(0.12, 0.58, 0.98) * flare_y * flare_x * 1.65;
          
          // Composite Layers
          vec3 final_rgb = mix(bg_color, core_color * 1.4, core_energy);
          final_rgb = mix(final_rgb, vec3(0.0, 0.95, 0.82), ui * 0.65); // UI highlight
          final_rgb = mix(final_rgb, pigment, cell_mask * 0.82);        // Chromatophores
          final_rgb += flare_color;                                     // Flares
          
          return final_rgb;
        }
        
        void main() {
          vec2 uv = vUv;
          
          // Macroblock coordinate grid (Datamosh simulation)
          vec2 blockUv = floor(uv * 18.0) / 16.0;
          float blockNoise = noise(blockUv * 7.5 + u_time * 0.45);
          vec2 motion = vec2(noise(blockUv + u_time), noise(blockUv + u_time + 12.0)) - 0.5;
          
          // Dynamic coordinates warping
          vec2 warpedUv = mix(uv, blockUv + motion * 0.14, u_glitch * step(0.44, blockNoise));
          
          // Horizontal VHS tracking error
          float trackingY = fract(u_time * 0.18);
          if (abs(warpedUv.y - trackingY) < 0.045) {
            warpedUv.x += sin(warpedUv.y * 110.0 + u_time * 25.0) * 0.035 * u_glitch;
          }
          
          // Real-time Chromatic Aberration via offset scene evaluation
          vec2 uv_r = warpedUv + vec2(0.012, 0.0) * u_intensity;
          vec2 uv_g = warpedUv;
          vec2 uv_b = warpedUv - vec2(0.012, 0.0) * u_intensity;
          
          float r = evaluateScene(uv_r, u_time).r;
          float g = evaluateScene(uv_g, u_time).g;
          float b = evaluateScene(uv_b, u_time).b;
          vec3 rgb = vec3(r, g, b);
          
          // CRT Scanlines
          float scanline = 0.55 + 0.45 * sin(warpedUv.y * u_resolution.y * 3.14159);
          rgb *= mix(1.0, scanline, 0.32);
          
          // Subpixel RGB Phosphor Mask
          float col_idx = mod(gl_FragCoord.x, 3.0);
          vec3 phosphor = vec3(
            smoothstep(1.0, 0.0, abs(col_idx - 0.5)),
            smoothstep(1.0, 0.0, abs(col_idx - 1.5)),
            smoothstep(1.0, 0.0, abs(col_idx - 2.5))
          );
          rgb *= mix(vec3(1.0), phosphor, 0.38);
          
          // CRT Tube Vignette
          vec2 vig = warpedUv * 2.0 - 1.0;
          float vignette = 1.0 - dot(vig, vig) * 0.22;
          rgb *= vignette;
          
          // Absolute Color Law (Strict range mapping to avoid absolute black/white)
          vec3 chromaticDark = vec3(0.06, 0.03, 0.14);
          rgb = max(rgb, chromaticDark);
          
          vec3 tintedWhite = vec3(0.98, 0.94, 0.90);
          rgb = min(rgb, tintedWhite);
          
          fragColor = vec4(rgb, 1.0);
        }
      `
    });
    
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    canvas.__three = { renderer, scene, camera, material };
  } catch (e) {
    console.error("Three.js/WebGL2 Setup Failed:", e);
    return;
  }
}

const { renderer, scene, camera, material } = canvas.__three;
if (material && material.uniforms) {
  material.uniforms.u_time.value = time;
  material.uniforms.u_resolution.value.set(grid.width, grid.height);
  material.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - (mouse.y / grid.height));
  
  // High-energy reactive pacing
  material.uniforms.u_intensity.value = 0.55 + 0.3 * Math.sin(time * 0.8) + (mouse.isPressed ? 0.15 : 0.0);
  material.uniforms.u_glitch.value = 0.32 + 0.25 * Math.sin(time * 2.2) * Math.cos(time * 0.6) + (mouse.isPressed ? 0.35 : 0.0);
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);