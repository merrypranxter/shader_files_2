if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, grid.width / grid.height, 0.1, 1000);
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
      uniform vec2 u_mouse;
      
      // Hash and noise functions for fungal anastomosis
      vec2 hash2(vec2 p) {
          return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
      }
      
      // Worley noise generating the mycelial network (from Mycelial Networks repo)
      float fungalNetwork(vec2 x) {
          vec2 n = floor(x);
          vec2 f = fract(x);
          float F1 = 8.0;
          float F2 = 8.0;
          for(int j = -1; j <= 1; j++) {
              for(int i = -1; i <= 1; i++) {
                  vec2 g = vec2(float(i), float(j));
                  vec2 o = hash2(n + g);
                  // Animate the network nodes
                  o = 0.5 + 0.5 * sin(u_time * 0.8 + 6.2831 * o);
                  vec2 r = g - f + o;
                  float d = dot(r, r);
                  if(d < F1) {
                      F2 = F1;
                      F1 = d;
                  } else if(d < F2) {
                      F2 = d;
                  }
              }
          }
          // The difference between the first and second closest points creates the hyphal walls
          return F2 - F1;
      }
      
      // Risograph Halftone dot function (from Risograph Style repo)
      float halftone(vec2 uv, float lpi, float angle) {
          float c = cos(angle), s = sin(angle);
          vec2 rot = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
          vec2 cell = fract(rot * lpi) - 0.5;
          return length(cell);
      }
      
      void main() {
          vec2 p = vUv * 2.0 - 1.0;
          p.x *= u_resolution.x / u_resolution.y;
          
          // Simulation Hypothesis: Memory Pressure & TAA Ghosting Glitch
          float glitch = step(0.98, fract(sin(u_time * 5.0 + p.y * 20.0) * 43758.5));
          vec2 warped_p = p + vec2(glitch * 0.1 * sin(u_time * 10.0), 0.0);
          
          // Domain warping for fluid organic flow
          vec2 q = warped_p;
          q.x += 0.4 * sin(warped_p.y * 2.5 + u_time * 0.3 + u_mouse.x * 2.0);
          q.y += 0.4 * cos(warped_p.x * 2.5 - u_time * 0.4 + u_mouse.y * 2.0);
          
          // Fungal Anastomosis with Z-Fighting Artifacts
          float hA = fungalNetwork(q * 3.5);
          float hB = fungalNetwork(q * 3.5 + vec2(0.03)); 
          float z_fight = step(0.5, fract(warped_p.x * 200.0 + warped_p.y * 200.0 + u_time * 15.0));
          // Glitch heavily intersects the hyphal walls
          float hyphae = mix(hA, hB, z_fight * smoothstep(0.1, 0.4, hA)); 
          
          // Secondary detail layer
          hyphae += 0.4 * fungalNetwork(q * 7.0 - vec2(u_time * 0.2));
          
          // Structural Color (Thin Film Interference / Bragg Reflection)
          float thickness = 200.0 + hyphae * 600.0; // 200-800nm
          float n_film = 1.56; // Refractive index of Chitin
          float cosT = clamp(1.0 - hyphae * 1.5, 0.0, 1.0); 
          float pathDiff = 2.0 * n_film * thickness * sqrt(1.0 - pow(sin(acos(cosT))/n_film, 2.0));
          // Cosine palette mapping wavelength interference
          vec3 structColor = 0.5 + 0.5 * cos(6.28318 * (pathDiff / vec3(650.0, 510.0, 450.0)));
          
          // Risograph Halftone Processing & Misregistration
          float lpi = 65.0 + u_mouse.y * 50.0; // Interactive LPI
          
          // Misregistration drift simulating mechanical slip
          vec2 drift1 = vec2(0.03 * sin(u_time * 1.2), 0.02 * cos(u_time * 0.8));
          vec2 drift2 = vec2(-0.02 * cos(u_time * 1.1), 0.03 * sin(u_time * 0.9));
          vec2 drift3 = vec2(0.025 * sin(u_time * 0.7), -0.02 * cos(u_time * 1.3));
          
          // Spot Colors (NO BLACK OR WHITE)
          vec3 c_paper = vec3(0.24, 0.12, 0.43); // Deep Purple paper base
          vec3 c_p = vec3(1.0, 0.42, 0.71);      // Fluo Pink
          vec3 c_g = vec3(0.0, 0.66, 0.36);      // Acid Green
          vec3 c_y = vec3(1.0, 0.91, 0.0);       // Yellow
          
          // Background Grid (Simulation void state underlying the paper)
          float bg_grid = max(
              smoothstep(0.92, 0.98, fract(p.x * 12.0 + u_time * 0.5)),
              smoothstep(0.92, 0.98, fract(p.y * 12.0 - u_time * 0.5))
          );
          c_paper = mix(c_paper, vec3(0.8, 0.1, 0.5), bg_grid * 0.5); // Magenta grid
          
          // Halftone screens at specific Riso angles (45, 75, 105 degrees)
          float dot1 = halftone(warped_p + drift1, lpi, 0.785);
          float dot2 = halftone(warped_p + drift2, lpi, 1.309);
          float dot3 = halftone(warped_p + drift3, lpi, 1.832);
          
          float r1 = 0.38 / 1.15; // Dot radius with simulated dot gain
          
          // Threshold structural color into discrete ink channels
          float ink1_mask = step(dot1, structColor.r * r1 * 1.8);
          float ink2_mask = step(dot2, structColor.g * r1 * 1.8);
          float ink3_mask = step(dot3, structColor.b * r1 * 1.8);
          
          vec3 final = c_paper;
          
          // Subtractive-style layering but brightened to avoid dark mud
          final = mix(final, c_p, ink1_mask * 0.85);
          final = mix(final, c_g, ink2_mask * 0.85);
          final = mix(final, c_y, ink3_mask * 0.85);
          
          // Overlap mixing (Riso Multiply effect, translating to rich secondary colors)
          if (ink1_mask * ink2_mask > 0.0) final = mix(final, vec3(0.1, 0.5, 0.8), 0.8); // Pink+Green -> Intense Cyan
          if (ink2_mask * ink3_mask > 0.0) final = mix(final, vec3(0.6, 0.9, 0.1), 0.8); // Green+Yellow -> Toxic Lime
          if (ink1_mask * ink3_mask > 0.0) final = mix(final, vec3(0.9, 0.3, 0.1), 0.8); // Pink+Yellow -> Vivid Orange
          if (ink1_mask * ink2_mask * ink3_mask > 0.0) final = vec3(0.7, 0.1, 0.3);      // All three -> Rich Crimson
          
          // ENFORCE ABSOLUTELY NO BLACK OR WHITE
          final = clamp(final, vec3(0.15, 0.1, 0.2), vec3(0.9, 0.85, 0.85));
          
          fragColor = vec4(final, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_mouse: { value: new THREE.Vector2(0, 0) }
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
    console.error("WebGL Initialization Failed:", e);
    return;
  }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms) {
  material.uniforms.u_time.value = time;
  material.uniforms.u_resolution.value.set(grid.width, grid.height);
  
  // Smooth mouse tracking for the feral simulation interactions
  const targetMouseX = mouse.x / grid.width;
  const targetMouseY = mouse.y / grid.height;
  material.uniforms.u_mouse.value.x += (targetMouseX - material.uniforms.u_mouse.value.x) * 0.1;
  material.uniforms.u_mouse.value.y += (targetMouseY - material.uniforms.u_mouse.value.y) * 0.1;
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);