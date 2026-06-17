try {
  // THE FERAL FUNGAL ENGINE: ENZYMATIC GEMATRIA ROT
  // Integrating:
  // 1. Mycelial Networks (Branching ridges, Anastomosis nodes, Laccase bleed)
  // 2. Structural Color (Thin-film iridescence on hyphal cords)
  // 3. Gematria Resonance (373 LOGOS & 1224 ICHTHYS domain warping)
  // 4. Color Systems (OKLab perceptual blending, Golden Angle hues)
  // 5. I Ching Fields (6-bit background grid matrix)
  // CONSTRAINT: NO BLACK. NO EMPTY SPACE. ALL VIVID.

  if (!canvas.__three) {
    if (!ctx) throw new Error("WebGL context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    camera.position.z = 1;

    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      in vec2 vUv;
      out vec4 fragColor;

      uniform float u_time;
      uniform vec2 u_resolution;

      #define PI 3.14159265359
      #define TAU 6.28318530718
      #define GOLDEN_ANGLE 2.39996322973

      // --- WEIRD MATH & NOISE ---
      float hash12(vec2 p) {
          vec3 p3  = fract(vec3(p.xyx) * .1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
      }

      vec2 hash22(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.xx+p3.yz)*p3.zy);
      }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash12(i);
          float b = hash12(i + vec2(1.0, 0.0));
          float c = hash12(i + vec2(0.0, 1.0));
          float d = hash12(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
          for(int i = 0; i < 5; i++) {
              v += a * noise(p);
              p = rot * p * 2.0 + vec2(100.0);
              a *= 0.5;
          }
          return v;
      }

      // Fungal Ridge (Differential Growth approximation)
      float ridge(vec2 p) {
          float n = fbm(p);
          return 1.0 - abs(n * 2.0 - 1.0);
      }

      // --- COLOR SYSTEMS ---
      // OKLab to linear sRGB
      vec3 oklab_to_linear(vec3 c) {
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

      vec3 linear_to_srgb(vec3 c) {
          vec3 a = 12.92 * c;
          vec3 b = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - vec3(0.055);
          return mix(a, b, step(vec3(0.0031308), c));
      }

      vec3 oklch_to_srgb(float L, float C, float h) {
          vec3 lab = vec3(L, C * cos(h), C * sin(h));
          return linear_to_srgb(oklab_to_linear(lab));
      }

      // --- STRUCTURAL COLOR ---
      // Thin-film interference iridescence
      vec3 thin_film(float thickness) {
          // Normalize thickness against typical visible wavelengths
          vec3 phase = thickness / vec3(450.0, 550.0, 650.0);
          // Cosine palette for interference fringes
          // Lifted base to avoid black: 0.6 + 0.4 * cos
          return 0.6 + 0.4 * cos(TAU * phase);
      }

      void main() {
          vec2 uv = vUv * 2.0 - 1.0;
          uv.x *= u_resolution.x / u_resolution.y;
          float t = u_time * 0.15;

          // 1. GEMATRIA RESONANCE WARP (373 LOGOS & 1224 ICHTHYS)
          // The fabric of space is warped by mathematical word frequencies
          float r = length(uv);
          vec2 warp = vec2(
              sin((373.0 / 100.0) * r - t * 2.0),
              cos((1224.0 / 300.0) * r + t * 1.5)
          );
          vec2 p = uv + warp * 0.1;

          // 2. I CHING BACKGROUND MATRIX (6-bit semantic font rot)
          // Creates a dense, colorful, non-empty background
          vec2 grid = floor(p * 12.0 + t);
          float hexagram = mod(floor(hash12(grid) * 64.0), 64.0);
          float changing_line = mod(floor(hexagram / 8.0), 2.0);
          
          // Background Color: Vivid OKLCh (L=0.75 to ensure no black, C=0.2 for neon saturation)
          float bg_hue = hash12(grid) * TAU + t;
          vec3 bgColor = oklch_to_srgb(0.75 + 0.1 * changing_line, 0.18, bg_hue);

          // Add Botanical "Wet Edge Bloom" to the background to make it fluid
          float wet_noise = fbm(p * 5.0 - t);
          bgColor = mix(bgColor, oklch_to_srgb(0.85, 0.25, bg_hue + GOLDEN_ANGLE), wet_noise);

          // 3. FUNGAL MORPHOGENESIS (Mycelial Networks)
          // Multi-scale domain-warped ridges simulate anastomosing hyphae
          vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3)));
          vec2 w = p + 1.5 * q;
          
          float h1 = ridge(w * 3.0);
          float h2 = ridge(w * 6.0 + t);
          float h3 = ridge(w * 12.0 - t * 2.0);
          
          // Hyphal cords (thickest where ridges overlap)
          float mycelium = pow(h1 * h2, 0.5) * 1.5 + h3 * 0.2;
          
          // Anastomosis nodes (bright spots where hyphae fuse)
          float nodes = smoothstep(0.7, 0.95, mycelium);

          // 4. ENZYMATIC LACCASE STAINING (Bleed)
          // Fungi digest the I Ching matrix, bleeding aggressive neon colors
          float bleed = smoothstep(0.2, 0.6, mycelium);
          float bleed_hue = fbm(p * 2.0) * TAU + t * 3.0;
          vec3 bleedColor = oklch_to_srgb(0.7, 0.22, bleed_hue);

          // 5. STRUCTURAL COLOR (Iridescence on the fungal armor)
          // Film thickness varies with fungal density and noise
          float thickness = 300.0 + 500.0 * fbm(w * 10.0 + t);
          vec3 iridescentColor = thin_film(thickness);

          // COMPOSITE THE FERAL DESIGN
          // Start with the bright I Ching botanical matrix
          vec3 finalColor = bgColor;
          
          // Blend in the enzymatic bleed (wet edge)
          finalColor = mix(finalColor, bleedColor, bleed * 0.8);
          
          // Overlay the structural color on the dense hyphal cords
          float cord_mask = smoothstep(0.4, 0.8, mycelium);
          finalColor = mix(finalColor, iridescentColor, cord_mask);
          
          // Add intense glowing anastomosis nodes (pure vivid energy)
          vec3 nodeGlow = oklch_to_srgb(0.95, 0.15, bleed_hue - GOLDEN_ANGLE);
          finalColor += nodeGlow * nodes * 1.5;

          // NO BLACK GUARANTEE: Clamp minimum lightness to a bright pastel
          finalColor = max(finalColor, vec3(0.3, 0.2, 0.4)); // Failsafe lift

          // Gamma correction (though OKLab to sRGB handles most of it, a slight pop)
          finalColor = pow(finalColor, vec3(0.9));

          fragColor = vec4(finalColor, 1.0);
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
  }

  const { renderer, scene, camera, material } = canvas.__three;

  if (material && material.uniforms) {
    if (material.uniforms.u_time) material.uniforms.u_time.value = time;
    if (material.uniforms.u_resolution) {
      material.uniforms.u_resolution.value.set(grid.width, grid.height);
    }
  }

  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);

} catch (e) {
  console.error("Feral Fungal Engine Initialization Failed:", e);
  
  // Failsafe 2D fallback just in case WebGL dies, to ensure NO EMPTY SPACE and NO BLACK.
  if (ctx && !ctx.compileShader) {
    const width = grid.width;
    const height = grid.height;
    const imgData = ctx.createImageData(width, height);
    const buf = new Uint32Array(imgData.data.buffer);
    
    for (let i = 0; i < buf.length; i++) {
      const x = i % width;
      const y = Math.floor(i / width);
      const nx = x / width * 10;
      const ny = y / height * 10;
      const v = Math.sin(nx + time) * Math.cos(ny - time);
      
      // Vivid fallback colors (No black)
      const r = Math.floor((Math.sin(v * 5) * 0.5 + 0.5) * 155 + 100);
      const g = Math.floor((Math.cos(v * 3) * 0.5 + 0.5) * 155 + 100);
      const b = Math.floor((Math.sin(v * 7) * 0.5 + 0.5) * 155 + 100);
      
      buf[i] = (255 << 24) | (b << 16) | (g << 8) | r;
    }
    ctx.putImageData(imgData, 0, 0);
  }
}