try {
  if (!canvas.__three) {
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
      out vec4 fragColor;
      
      uniform float u_time;
      uniform vec2 u_resolution;
      
      #define PI 3.14159265359
      #define TAU 6.28318530718
      
      float hash11(float p) {
          p = fract(p * 0.1031);
          p *= p + 33.33;
          p *= p + p;
          return fract(p);
      }
      
      vec2 hash22(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.xx + p3.yz) * p3.zy);
      }
      
      vec2 hash22_grad(vec2 p) {
          return -1.0 + 2.0 * hash22(p); 
      }
      
      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(dot(hash22_grad(i+vec2(0.0,0.0)), f-vec2(0.0,0.0)), 
                         dot(hash22_grad(i+vec2(1.0,0.0)), f-vec2(1.0,0.0)), u.x),
                     mix(dot(hash22_grad(i+vec2(0.0,1.0)), f-vec2(0.0,1.0)), 
                         dot(hash22_grad(i+vec2(1.0,1.0)), f-vec2(1.0,1.0)), u.x), u.y);
      }
      
      float fbm(vec2 p) {
          float f = 0.0;
          float amp = 0.5;
          mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
          for(int i=0; i<4; i++) {
              f += amp * noise(p);
              p = rot * p * 2.0;
              amp *= 0.5;
          }
          return f;
      }
      
      vec4 voronoi(vec2 x, float jitter, out vec2 mr_out) {
          vec2 n = floor(x);
          vec2 f = fract(x);
          float F1 = 8.0;
          float F2 = 8.0;
          vec2 mr = vec2(0.0);
          vec2 id = vec2(0.0);
          
          for(int j=-1; j<=1; j++)
          for(int i=-1; i<=1; i++) {
              vec2 g = vec2(float(i), float(j));
              vec2 o = hash22(n + g) * jitter;
              vec2 r = g + o - f;
              float d = dot(r, r);
              if(d < F1) {
                  F2 = F1;
                  F1 = d;
                  mr = r;
                  id = n + g;
              } else if(d < F2) {
                  F2 = d;
              }
          }
          mr_out = mr;
          return vec4(sqrt(F1), id.x, id.y, sqrt(F2) - sqrt(F1));
      }
      
      vec3 acidPalette(float t) {
          t = fract(t);
          vec3 col = vec3(0.0);
          
          // Maximalist Candy-Acid Hyperpop Palette Sequence
          if(t < 0.16) col = mix(vec3(1.0, 0.0, 0.5), vec3(0.5, 0.0, 1.0), t/0.16); 
          else if(t < 0.33) col = mix(vec3(0.5, 0.0, 1.0), vec3(0.0, 0.0, 1.0), (t-0.16)/0.17); 
          else if(t < 0.5) col = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), (t-0.33)/0.17); 
          else if(t < 0.66) col = mix(vec3(0.0, 1.0, 1.0), vec3(0.5, 1.0, 0.0), (t-0.5)/0.16); 
          else if(t < 0.83) col = mix(vec3(0.5, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (t-0.66)/0.17); 
          else col = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.5), (t-0.83)/0.17); 
          
          // White-hot highlights (Glitchcore spark)
          col += vec3(1.0) * smoothstep(0.95, 1.0, sin(t * TAU * 10.0));
          return col;
      }
      
      vec3 evaluate(vec2 uv, float t, float dispersion) {
          // 1. Glitchcore / Damage Aesthetics: Macroblock tearing
          float block = step(0.95, hash11(floor(uv.y * 15.0) + floor(t * 4.0)));
          uv.x += block * 0.05 * sin(t * 10.0);
      
          // 2. Kaleidoscope / Phosphene: Dihedral Log-Polar Fold
          float r = length(uv);
          float a = atan(uv.y, uv.x);
          
          float sectors = 10.0;
          float sectorAngle = TAU / sectors;
          a = mod(a + t * 0.05, sectorAngle);
          a = min(a, sectorAngle - a);
          
          float rho = log(max(r, 1e-4));
          vec2 lp = vec2(rho, a);
          
          // Prism Dispersion scaling
          lp *= dispersion;
          
          // Phosphene Tunnel motion
          lp.x -= t * 0.3;
          
          // 3. Fluid / Opal: Domain Warping with FBM
          vec2 q = vec2(fbm(lp * 3.0 + t), fbm(lp * 3.0 - t));
          lp += q * 0.4;
          
          // 4. Voronoi / Opal: Cellular cracks and structure
          vec2 mr;
          vec4 v = voronoi(lp * 6.0, 1.0, mr);
          float cell_hash = hash11(v.y * 13.0 + v.z * 17.0);
          
          // 5. Op-Art & Sandpile: 4-fold symmetry inside cells
          float local_a = atan(mr.y, mr.x);
          float sandpile = cos(local_a * 4.0 + t * 2.0);
          float contour = sin(v.x * 40.0 - t * 8.0 + cell_hash * TAU + sandpile * 2.0);
          
          // 6. Color Cycling / Metamerism: Palette mapping
          float index = fract(contour * 0.1 + cell_hash + t * 0.1 + rho * 0.2);
          
          vec3 baseColor = acidPalette(index);
          
          // Add Voronoi borders (cracks)
          float border = smoothstep(0.0, 0.1, v.w);
          
          // Glowing borders (Glitchcore bloom)
          vec3 borderColor = acidPalette(fract(index + 0.5)); 
          baseColor = mix(baseColor, borderColor * 2.5, border);
          
          // Shadow / False Depth (Op-Art)
          baseColor *= smoothstep(0.0, 0.5, v.x);
          
          // XOR-Ghost Manifold (Alchemical Scripture)
          ivec2 px = ivec2(abs(lp * 100.0));
          float xor_pattern = float((px.x & 255) ^ (px.y & 255)) / 256.0;
          baseColor += vec3(0.2, 0.8, 1.0) * xor_pattern * 0.3;
          
          // Foveal window (Phosphene Field)
          float fovea = smoothstep(0.0, 0.2, r) * (1.0 - smoothstep(1.5, 2.5, r));
          baseColor *= fovea;
          
          return baseColor;
      }
      
      void main() {
          vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
          
          // Cauchy dispersion IORs (Metamerism / Prism)
          float iorR = 1.0;
          float iorG = 1.015;
          float iorB = 1.03;
          
          vec3 colR = evaluate(uv, u_time, iorR);
          vec3 colG = evaluate(uv, u_time, iorG);
          vec3 colB = evaluate(uv, u_time, iorB);
          
          vec3 col = vec3(colR.r, colG.g, colB.b);
          
          // Halftone screen (Psychedelic Collage)
          float luma = dot(col, vec3(0.299, 0.587, 0.114));
          vec2 ht_uv = mat2(0.707, -0.707, 0.707, 0.707) * gl_FragCoord.xy * 0.15;
          vec2 cell = fract(ht_uv) - 0.5;
          float radius = sqrt(1.0 - luma) * 0.6;
          float ht = smoothstep(radius + 0.1, radius - 0.1, length(cell));
          
          col = mix(col * ht, col, 0.7);
          
          // Scanlines (CRT / Damage Aesthetics)
          float scanline = sin(gl_FragCoord.y * 1.5) * 0.05 + 0.95;
          col *= scanline;
          
          // Vignette (Post-finisher)
          float d = length(uv);
          col *= 1.0 - pow(d * 0.7, 2.0) * 0.5;
          
          // ACES tonemapping
          col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);
          
          // Gamma correction
          col = pow(col, vec3(1.0 / 2.2));
          
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
  console.error("WebGL Initialization Failed:", e);
  throw e;
}