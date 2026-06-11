try {
  // Check if WebGL context and Three.js are available
  if (!canvas.__three) {
    if (!ctx) throw new Error("WebGL 2 context not available");
    
    // Initialize Renderer using the provided context
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    
    // Setup Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    // -------------------------------------------------------------------------
    // THE ALCHEMICAL SHADER
    // A chimera of Cymatics (Bessel functions), Moiré interference, Lace topology, 
    // Golden Angle OKLab color harmonies, Shoegaze halation, and Datamosh damage.
    // -------------------------------------------------------------------------
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
      uniform vec2 u_mouse;
      
      #define PI 3.14159265359
      
      // [COLOR SYSTEMS REPO] OKLCh to OKLab for perceptual uniformity
      vec3 oklch_to_oklab(float L, float C, float h) {
          return vec3(L, C * cos(h), C * sin(h));
      }

      // [COLOR SYSTEMS REPO] OKLab to linear sRGB
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

      // [COLOR SYSTEMS REPO] Linear sRGB to display sRGB
      vec3 linear_to_srgb(vec3 c) {
          c = clamp(c, 0.0, 1.0);
          vec3 higher = 1.055 * pow(c, vec3(1.0/2.4)) - vec3(0.055);
          vec3 lower = c * 12.92;
          return mix(higher, lower, step(c, vec3(0.0031308)));
      }

      // [COLOR SYSTEMS REPO] Golden Angle Harmony Palette
      vec3 get_golden_color(float index) {
          float h = index * 2.3999632; // 137.5 degrees in radians
          float L = 0.70 + 0.15 * sin(index * 1.618); // Value tension
          float C = 0.25 + 0.1 * cos(index * 2.718);  // High chroma for acid/neon vibe
          return linear_to_srgb(oklab_to_linear_srgb(oklch_to_oklab(L, C, h)));
      }

      // [CYMATICS REPO] Approximate Bessel function standing waves
      float cymatic(vec2 p, float freq, float m, float t) {
          float r = max(length(p), 0.001);
          float th = atan(p.y, p.x);
          float radial = cos(freq * r - (m * PI * 0.5) - PI * 0.25 + t) / sqrt(r + 0.1);
          float angular = cos(m * th + t * 0.5);
          return radial * angular;
      }

      // [MOIRÉ REPO] Interference engine combining Faraday hexagons & Chladni modes
      float get_field(vec2 p) {
          // Domain warp for Rococo asymmetry
          vec2 p_w = p + vec2(sin(p.y * 4.0 + u_time), cos(p.x * 4.0 - u_time)) * 0.05;
          
          // Hexagonal Faraday base
          float hex = cos(p_w.x * 12.0) + cos((p_w.x * 0.5 + p_w.y * 0.866) * 12.0) + cos((p_w.x * 0.5 - p_w.y * 0.866) * 12.0);
          
          // Beating Chladni modes
          float c1 = cymatic(p_w, 20.0, 3.0, u_time * 1.2);
          float c2 = cymatic(p_w * 1.2, 28.0, 5.0, -u_time * 0.9);
          
          // Moiré multiplicative interference
          return hex * 0.2 + c1 * c2 * 3.0;
      }

      // Maps scalar interference field to rich visual structure
      vec3 color_map(float v) {
          float val = abs(v);
          float scaled = val * 6.0 + u_time * 0.8;
          float idx = floor(scaled);
          float fract_v = smoothstep(0.3, 0.7, fract(scaled));
          
          vec3 c1 = get_golden_color(idx);
          vec3 c2 = get_golden_color(idx + 1.0);
          vec3 col = mix(c1, c2, fract_v);
          
          // [LACE PATTERNS REPO] Negative space becomes the pattern
          float hole = smoothstep(0.8, 1.0, sin(val * 40.0)); 
          col *= (1.0 - hole * 0.85); // Puncture the filigree
          
          // [SHOEGAZE REPO] Milky highlights
          float highlight = smoothstep(0.0, 0.15, val);
          col = mix(vec3(0.95, 0.92, 0.88), col, highlight);
          
          return col;
      }

      void main() {
          vec2 uv = vUv * 2.0 - 1.0;
          uv.x *= u_resolution.x / u_resolution.y;
          
          vec2 mouse = u_mouse * 2.0 - 1.0;
          mouse.x *= u_resolution.x / u_resolution.y;
          
          vec2 warped_uv = uv;
          
          // [DAMAGE AESTHETICS REPO] Datamosh predictive block melt
          vec2 block_uv = floor(uv * 20.0) / 20.0;
          float block_noise = fract(sin(dot(block_uv, vec2(12.9898, 78.233))) * 43758.5453);
          if (block_noise > 0.96) {
              warped_uv.y += u_time * 0.15 * block_noise; // Melt downward
          }
          
          // Interactive attractor distortion
          float d_mouse = length(uv - mouse);
          float mouse_warp = exp(-d_mouse * 3.0) * 0.5;
          warped_uv += normalize(uv - mouse + 0.001) * mouse_warp * sin(u_time * 4.0);
          
          // [SHOEGAZE REPO] Chromatic aberration / color bleed
          vec2 offset = normalize(warped_uv) * 0.02 * (1.0 + mouse_warp * 2.0);
          
          float vR = get_field(warped_uv + offset);
          float vG = get_field(warped_uv);
          float vB = get_field(warped_uv - offset);
          
          vec3 cR = color_map(vR);
          vec3 cG = color_map(vG);
          vec3 cB = color_map(vB);
          
          vec3 col = vec3(cR.r, cG.g, cB.b);
          
          // [SHOEGAZE REPO] Halation / Film overspill bloom
          float v_blur = get_field(warped_uv * 0.5);
          vec3 bloom = color_map(v_blur) * vec3(1.0, 0.4, 0.8); // Hot pink/magenta bias
          col += bloom * 0.4;
          
          // [DAMAGE AESTHETICS REPO] Film grain clumps
          float grain = fract(sin(dot(vUv * 1000.0 + u_time, vec2(12.9898, 78.233))) * 43758.5453);
          col += (grain - 0.5) * 0.15;
          
          // [DAMAGE AESTHETICS REPO] CRT Scanline raster
          float scanline = sin(vUv.y * u_resolution.y * 1.5);
          col -= scanline * 0.05;
          
          // Gentle vignette
          float vig = length(vUv - 0.5);
          col *= smoothstep(0.8, 0.2, vig);
          
          fragColor = vec4(col, 1.0);
      }
    `;
    
    // Compile Shader
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) }
      },
      depthWrite: false,
      depthTest: false
    });
    
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    
    // Store instances to avoid re-initialization
    canvas.__three = { renderer, scene, camera, material };
  }
  
  // Render loop execution
  const { renderer, scene, camera, material } = canvas.__three;
  
  if (material && material.uniforms) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
    
    if (mouse.isPressed) {
      // Direct interaction
      material.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - (mouse.y / grid.height));
    } else {
      // Autonomous drift behavior when unperturbed
      const driftX = 0.5 + Math.sin(time * 0.4) * 0.3;
      const driftY = 0.5 + Math.cos(time * 0.25) * 0.3;
      material.uniforms.u_mouse.value.set(driftX, driftY);
    }
  }
  
  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);
  
} catch (error) {
  console.error("WebGL 2 / Three.js Initialization Failed:", error);
}