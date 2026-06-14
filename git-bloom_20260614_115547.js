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
      precision highp float;

      in vec2 vUv;
      out vec4 fragColor;

      uniform float u_time;
      uniform vec2 u_resolution;

      #define PI 3.141592653589793
      #define TAU 6.283185307179586

      // --- Hash & Noise (merrys_visual_bible) ---
      float hash21(vec2 p) {
          p = fract(p * vec2(127.34, 311.7));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
      }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 5; i++) {
              v += a * noise(p);
              p = p * 2.0 + vec2(1.7, 9.2);
              a *= 0.5;
          }
          return v;
      }

      // --- Domain Warping: The Ocean / Math ---
      vec2 warp(vec2 p) {
          float t = u_time * 0.2;
          vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(t, 0.0)));
          vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2)), fbm(p + 4.0 * q + vec2(8.3, 2.8)));
          return p + r * 0.5;
      }

      // --- Palettes: Neon Acid & Tetragrammaton (color_fields / visual_bible) ---
      vec3 paletteNeon(float t) {
          return vec3(0.5) + vec3(0.5) * cos(TAU * (vec3(1.0, 1.0, 1.0) * t + vec3(0.0, 0.33, 0.67)));
      }

      vec3 paletteTetragrammaton(float t) {
          return vec3(0.5, 0.4, 0.1) + vec3(0.5, 0.4, 0.1) * cos(TAU * (vec3(1.0, 0.7, 0.4) * t + vec3(0.0, 0.15, 0.20)));
      }

      // --- Structural Color: Thin Film Interference (structural_color) ---
      vec3 wavelengthToRGB(float W) {
          vec3 c = vec3(0.0);
          if (W >= 380.0 && W < 440.0) c = vec3(-(W-440.0)/(440.0-380.0), 0.0, 1.0);
          else if (W >= 440.0 && W < 490.0) c = vec3(0.0, (W-440.0)/(490.0-440.0), 1.0);
          else if (W >= 490.0 && W < 510.0) c = vec3(0.0, 1.0, -(W-510.0)/(510.0-490.0));
          else if (W >= 510.0 && W < 580.0) c = vec3((W-510.0)/(580.0-510.0), 1.0, 0.0);
          else if (W >= 580.0 && W < 645.0) c = vec3(1.0, -(W-645.0)/(645.0-580.0), 0.0);
          else if (W >= 645.0 && W <= 780.0) c = vec3(1.0, 0.0, 0.0);
          return c;
      }

      vec3 thinFilm(float cosTheta, float thickness, float n_film) {
          vec3 color = vec3(0.0);
          float pathDiff = 2.0 * n_film * thickness * cosTheta;
          for(float i = 0.0; i < 6.0; i++) {
              float lambda = mix(400.0, 700.0, i / 5.0);
              float phase = (pathDiff / lambda) * TAU;
              float intensity = 0.5 + 0.5 * cos(phase);
              color += wavelengthToRGB(lambda) * intensity;
          }
          return color / 6.0;
      }

      // --- Geometry & Symmetry (botanical_illustration) ---
      vec2 radialFold(vec2 p, float n) {
          float a = atan(p.y, p.x);
          float r = length(p);
          float s = TAU / n;
          float fa = mod(a, s);
          if (fa > s * 0.5) fa = s - fa;
          return vec2(cos(fa), sin(fa)) * r;
      }

      vec2 rotate(vec2 p, float a) {
          float c = cos(a), s = sin(a);
          return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
      }

      float sdRosePetal(vec2 p, float plen, float pw) {
          float ex = p.x / plen;
          float ey = p.y / pw;
          float d = length(vec2(ex, ey)) - 1.0;
          d = max(d, -p.x); // flat base
          float notch = length(p - vec2(plen, 0.0)) - 0.15 * plen;
          d = max(d, -notch);
          return d * min(plen, pw);
      }

      float sdStamen(vec2 p) {
          return length(p) - 0.015;
      }

      float stipple(vec2 p, float density, float darkness) {
          vec2 cell = floor(p * density);
          float ox = hash21(cell + vec2(0.1, 0.2)) - 0.5;
          float oy = hash21(cell + vec2(0.3, 0.7)) - 0.5;
          vec2 center = (cell + 0.5 + vec2(ox, oy) * 0.4) / density;
          float dist = length(p - center);
          float dot_r = darkness * 0.5 / density;
          return smoothstep(dot_r, dot_r * 0.5, dist);
      }

      void main() {
          vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
          
          // 1. The Void Rule (merrys_visual_bible)
          vec3 col = vec3(0.03, 0.01, 0.06); 
          
          // 2. Global Domain Warp (The Ocean Math)
          vec2 wuv = warp(uv * 1.5);
          float r = length(uv);
          
          // 3. The Whirring / Botanical Layers
          // Draw from back to front
          for (int i = 7; i >= 1; i--) {
              float fi = float(i);
              float fold = 4.0 + fi * 2.0; // 6, 8, 10, 12, 14, 16, 18
              float scale = 0.12 + fi * 0.12; 
              
              // Counter-rotating rings (The Whirring)
              float rotSpeed = 0.15 / fi * (mod(fi, 2.0) == 0.0 ? 1.0 : -1.0);
              vec2 pUv = rotate(uv, u_time * rotSpeed + fi * 1.618);
              
              vec2 sym = radialFold(pUv, fold);
              
              // Organic displacement
              float disp = fbm(sym * 6.0 - u_time * 0.4) * 0.06 * fi;
              sym.y += disp;
              sym.x += disp * 0.3;
              
              float d = sdRosePetal(sym - vec2(scale * 0.2, 0.0), scale, scale * 0.45);
              
              if (d < 0.04) {
                  // Pseudo 3D normal for structural color
                  float nx = clamp(d / (scale * 0.45), -1.0, 1.0);
                  float ny = sqrt(1.0 - nx*nx);
                  float cosTheta = ny;
                  
                  // Structural Color (Thin Film)
                  float thickness = 250.0 + 500.0 * fbm(wuv * 3.0 + fi - u_time * 0.1);
                  vec3 irid = thinFilm(cosTheta, thickness, 1.56); // Chitin refractive index
                  
                  // Base Color (Neon)
                  vec3 baseCol = paletteNeon(r * 1.5 + fi * 0.15 - u_time * 0.2);
                  
                  // Mix iridescence
                  vec3 petalCol = mix(baseCol, irid * 1.8, 0.65);
                  
                  // Watercolor wet edge bloom & wash
                  float wetEdge = smoothstep(-0.06, 0.0, d) * smoothstep(0.02, -0.01, d);
                  petalCol += wetEdge * vec3(1.0, 0.5, 0.9) * 1.2;
                  
                  // Haeckel Stipple
                  float stippleVal = stipple(uv, 120.0, smoothstep(-0.1, 0.0, d) * 0.8);
                  petalCol -= stippleVal * 0.4;
                  
                  // Linework hierarchy (Primary outline)
                  float outline = smoothstep(0.002, 0.0, abs(d));
                  petalCol = mix(petalCol, vec3(1.0, 0.9, 0.6), outline);
                  
                  // Cast shadow
                  float shadow = smoothstep(0.0, 0.08, d) * 0.7;
                  
                  float alpha = smoothstep(0.0, -0.005, d);
                  col = mix(col * (1.0 - shadow), petalCol, alpha);
              }
          }
          
          // 4. Stamen Cluster (Fibonacci packing / Golden Angle)
          for (int i = 0; i < 45; i++) {
              float fi = float(i);
              float r_stamen = 0.16 * sqrt(fi / 45.0);
              float theta = fi * 2.399963229728653; // Golden angle
              vec2 pos = vec2(cos(theta), sin(theta)) * r_stamen;
              
              pos += vec2(sin(u_time * 1.5 + fi), cos(u_time * 1.5 + fi)) * 0.008;
              
              float d = sdStamen(uv - pos);
              float outline = smoothstep(0.002, 0.0, abs(d));
              float fill = smoothstep(0.0, -0.002, d);
              
              vec3 stamenCol = vec3(1.0, 0.85, 0.2); // Gold
              stamenCol = mix(stamenCol, vec3(1.0), outline);
              
              float shadow = smoothstep(0.0, 0.02, d) * 0.6;
              col = mix(col * (1.0 - shadow), stamenCol, fill);
          }
          
          // 5. Tetragrammaton Core
          vec2 t_uv = rotate(uv, u_time * 0.6);
          vec2 t_sym = radialFold(t_uv, 4.0);
          float coreD = max(abs(t_sym.x) - 0.04, abs(t_sym.y) - 0.04);
          coreD = max(coreD, length(uv) - 0.12);
          
          if (coreD < 0.02) {
              float outline = smoothstep(0.002, 0.0, abs(coreD));
              float fill = smoothstep(0.0, -0.002, coreD);
              vec3 coreCol = paletteTetragrammaton(r * 5.0 - u_time);
              coreCol = mix(coreCol, vec3(1.0), outline);
              
              float shadow = smoothstep(0.0, 0.04, coreD) * 0.5;
              col = mix(col * (1.0 - shadow), coreCol, fill);
          }
          
          // Tonemapping (ACES Approximation)
          col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);
          
          // Vignette
          col *= 1.0 - smoothstep(0.6, 1.5, length(uv));
          
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
    if (material.uniforms.u_time) material.uniforms.u_time.value = time;
    if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }
  
  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);

} catch (e) {
  console.error("Feral Botanical Shader Error:", e);
}