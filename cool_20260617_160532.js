try {
  if (!ctx) throw new Error("WebGL 2 context not available");

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, grid.width / grid.height, 0.1, 1000);
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
      #define GOLDEN_ANGLE 2.39996323

      // PRNG
      float hash(vec2 p) { 
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); 
      }

      // 2D Noise
      float noise(vec2 p) {
          vec2 i = floor(p); 
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      // Fractional Brownian Motion for Mycelial Growth
      float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for(int i = 0; i < 6; i++) { 
              v += a * noise(p); 
              p *= 2.0; 
              a *= 0.5; 
          }
          return v;
      }

      // OKLCh to sRGB Conversion (color_systems integration)
      // Ensures perceptually uniform, hyper-saturated colors with ZERO black or white.
      vec3 oklch2srgb(float L, float C, float h) {
          vec3 lab = vec3(L, C * cos(h), C * sin(h));
          float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
          float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
          float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
          
          float l = l_ * l_ * l_; 
          float m = m_ * m_ * m_; 
          float s = s_ * s_ * s_;
          
          vec3 rgb = vec3(
               4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
              -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
              -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
          );
          
          vec3 x1 = rgb * 12.92;
          vec3 x2 = 1.055 * pow(max(rgb, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
          return mix(x1, x2, step(0.0031308, rgb));
      }

      // Structural Color: Thin-Film Interference
      // Maps a simulated film thickness to an iridescent OKLCh spectrum
      vec3 thinFilm(float thickness, float cosTheta) {
          // Optical path difference (2 * n * d * cosTheta)
          float opd = 2.0 * 1.56 * thickness * cosTheta; // 1.56 = refractive index of chitin
          
          // Map OPD to a shifting phase in OKLCh space
          float phase = opd * 0.002;
          
          // Constrain Lightness [0.4, 0.8] and Chroma [0.2, 0.35] to guarantee NO black/white
          float L = 0.6 + 0.2 * sin(phase * 1.5);
          float C = 0.27 + 0.08 * cos(phase * 2.2);
          float h = mod(phase * TAU, TAU);
          
          return oklch2srgb(L, C, h);
      }

      void main() {
          // Aspect-corrected UVs
          vec2 uv = (vUv - 0.5) * (u_resolution.xy / min(u_resolution.x, u_resolution.y));
          float r = length(uv);
          float theta = atan(uv.y, uv.x);

          // 1. Gematria Resonance Fields (LOGOS = 373, ICHTHYS = 1224)
          // Drives the underlying spatial warp
          float freq1 = 373.0 / 150.0;
          float freq2 = 1224.0 / 400.0;
          
          float warp1 = 0.5 + 0.5 * cos(TAU * freq1 * r - u_time * 1.2);
          float warp2 = 0.5 + 0.5 * cos(TAU * freq2 * r + u_time * 0.8);
          vec2 warpedUV = uv + vec2(cos(theta + warp1), sin(theta + warp2)) * 0.15 * warp1;

          // 2. I Ching Bureaucratic Grid (The Host Substrate)
          // 8x8 King Wen matrix mapping
          vec2 gridUV = warpedUV * 8.0;
          vec2 cell = floor(gridUV);
          float hexagram = mod(hash(cell) * 64.0 + u_time * 3.0, 64.0);
          float gridLines = smoothstep(0.02, 0.08, abs(fract(gridUV.x) - 0.5)) * 
                            smoothstep(0.02, 0.08, abs(fract(gridUV.y) - 0.5));

          // 3. Mycelial Anastomosis Network (The Parasite)
          // Domain-warped FBM creates branching, fusing hyphal cords
          vec2 q = vec2(fbm(warpedUV * 4.0 + u_time * 0.15),
                        fbm(warpedUV * 4.0 - u_time * 0.12));
          vec2 c = vec2(fbm(warpedUV * 8.0 + q + u_time * 0.25),
                        fbm(warpedUV * 8.0 - q - u_time * 0.18));
          
          float myceliumDist = fbm(warpedUV * 12.0 + c * 2.5);
          
          // Ridge noise for sharp cords
          float cords = 1.0 - abs(myceliumDist - 0.5) * 2.0;
          cords = pow(cords, 2.8); 
          
          // Anastomosis nodes (dense sporangia where cords fuse)
          float nodes = smoothstep(0.75, 0.95, myceliumDist) * smoothstep(0.6, 0.9, fbm(warpedUV * 25.0));
          cords += nodes * 2.0;

          // 4. Enzymatic Iridescence (Structural Color)
          // Film thickness driven by hexagram state, cord density, and time
          float cosTheta = max(0.1, 1.0 - r * 0.6); // Simulated viewing angle
          float filmThickness = 250.0 + cords * 900.0 + hexagram * 8.0 + u_time * 75.0;
          vec3 iridescence = thinFilm(filmThickness, cosTheta);

          // 5. Substrate (Fibonacci Palette Agar)
          // Golden angle mapped to discrete cellular regions
          float agarCell = floor(fbm(uv * 5.0 + u_time * 0.05) * 15.0);
          float agarHue = mod(agarCell * GOLDEN_ANGLE + u_time * 0.2, TAU);
          
          // Rich, vivid agar colors (No empty space, NO black/white)
          vec3 agarColor = oklch2srgb(0.5 + 0.15 * sin(agarCell + u_time), 0.28, agarHue);

          // 6. Synthesis & Corruption
          // Mycelium dissolves the I Ching grid and converts it to iridescence
          vec3 finalColor = mix(agarColor, iridescence, clamp(cords * 1.8, 0.0, 1.0));
          
          // Embed the grid, but tint it with a complementary dense color (never black)
          vec3 gridTint = oklch2srgb(0.35, 0.2, agarHue + PI); 
          finalColor = mix(gridTint, finalColor, 0.2 + 0.8 * gridLines);

          // Add fungal "spore" noise in the agar
          float spores = smoothstep(0.8, 1.0, hash(uv * 100.0 + u_time)) * (1.0 - clamp(cords, 0.0, 1.0));
          finalColor = mix(finalColor, oklch2srgb(0.7, 0.3, agarHue + 1.0), spores * 0.5);

          // ABSOLUTE ENFORCEMENT: No Black, No White.
          // Constrain final RGB values to a vivid, mid-to-high range.
          finalColor = clamp(finalColor, 0.15, 0.92);

          fragColor = vec4(finalColor, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
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
    if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }

  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);

} catch (e) {
  console.error("Feral WebGL Engine Failure:", e);
}