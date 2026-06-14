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

      #define PI 3.14159265359
      #define TAU 6.28318530718

      // --- [FORBIDDEN MATH & NOISE RITUALS] ---
      float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      float fbm(vec2 p) {
          float v = 0.0; float a = 0.5;
          for (int i = 0; i < 5; i++) {
              v += a * noise(p);
              p *= 2.0;
              a *= 0.5;
          }
          return v;
      }

      // --- [SACRED GEOMETRY SDFs] ---
      float sdBox(vec2 p, vec2 b) {
          vec2 d = abs(p) - b;
          return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
      }

      float vesica(vec2 p, float offset, float radius) {
          float d1 = length(p - vec2(offset, 0.0));
          float d2 = length(p + vec2(offset, 0.0));
          return max(d1 - radius, d2 - radius);
      }

      // --- [LITHOGENESIS & STRUCTURAL COLOR] ---
      vec3 iridescent(float t) {
          // Thin-film interference Bragg reflection approximation
          vec3 a = vec3(0.5);
          vec3 b = vec3(0.5);
          vec3 c = vec3(1.0, 1.0, 1.0);
          vec3 d = vec3(0.0, 0.33, 0.67);
          return a + b * cos(TAU * (c * t + d));
      }

      vec3 acidPalette(float t) {
          vec3 a = vec3(0.5, 0.5, 0.5);
          vec3 b = vec3(0.5, 0.5, 0.5);
          vec3 c = vec3(2.0, 1.0, 0.0);
          vec3 d = vec3(0.50, 0.20, 0.25);
          return a + b * cos(TAU * (c * t + d));
      }

      float stipple(vec2 p, float density, float darkness) {
          vec2 cell = floor(p * density);
          vec2 center = (cell + 0.5) / density;
          float dist = length(p - center);
          float dot_r = darkness * 0.4 / density;
          return smoothstep(dot_r, dot_r * 0.5, dist);
      }

      // --- [THE HOST: TAROT CARD ENGINE] ---
      vec3 cardContent(vec2 p) {
          // Tarot format: 1:1.73 portrait
          vec3 col = vec3(0.96, 0.94, 0.90); // Indie Minimal / Cream ground

          float cardDist = sdBox(p, vec2(0.6, 1.038));
          if (cardDist > 0.0) return vec3(-1.0); // Signal: outside card

          // Outer Border: Distressed Gold Foil
          float b1 = abs(sdBox(p, vec2(0.56, 0.998))) - 0.015;
          float tarnish = fbm(p * 15.0 + u_time * 0.1);
          
          if (b1 < 0.0 && tarnish < 0.65) {
              return iridescent(tarnish * 3.0 + u_time * 0.2) * (0.7 + 0.3 * noise(p * 100.0));
          }

          // Inner Field: The Oracle (Parasite-Host Logic)
          vec2 center = p + vec2(0.0, -0.1);
          float fieldDist = sdBox(center, vec2(0.48, 0.75));
          
          if (fieldDist < 0.0) {
              // The Sacred Threshold
              float vp = vesica(center, 0.15, 0.35);
              
              // Gematria Resonance & Cymatic Chladni Interference
              float f_LOGOS = 373.0 / 20.0;
              float f_YHWH = 26.0 / 5.0;
              float chladni = sin(f_YHWH * center.x * PI) * cos(f_LOGOS * center.y * PI - u_time);
              
              // Parasitic Julia Set (Fat Basilica morphing)
              vec2 z = center * 4.5;
              float iter = 0.0;
              vec2 c = vec2(-0.75, 0.1) + vec2(sin(u_time * 0.2), cos(u_time * 0.3)) * 0.05;
              
              for (int i = 0; i < 15; i++) {
                  z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
                  if (length(z) > 4.0) break;
                  iter++;
              }
              
              float parasite = fract(iter * 0.066 + chladni * 0.4);
              
              if (vp < 0.0) {
                  // Inside the Vesica: Autophagic Memory Splicing
                  vec3 energy = acidPalette(parasite - u_time * 0.4);
                  // Haeckel Stippling logic applied to fractal escape
                  return mix(vec3(0.05, 0.0, 0.1), energy, stipple(center, 90.0, parasite));
              } else {
                  // Outside the Vesica: Botanical Wash Host Tissue
                  float wash = fbm(center * 4.0 + chladni * 0.5);
                  vec3 sage = vec3(0.6, 0.8, 0.7); // Indie Minimal Sage
                  return mix(col, sage, wash * 0.5) - stipple(center, 50.0, wash * 0.3) * 0.2;
              }
          }

          // Title Bar: Curl Noise Aphasia / Broken Signage
          float titleDist = sdBox(p - vec2(0.0, 0.8), vec2(0.48, 0.08));
          if (titleDist < 0.0) {
              float barcode = step(0.5, hash(vec2(floor(p.x * 70.0), 1.0)));
              float rot = fbm(p * 40.0 + u_time * 2.0);
              return mix(col, vec3(0.55, 0.11, 0.11), barcode * step(0.4, rot)); // Dark Oracle Red
          }

          // Base paper texture & faint geometric LSB fossilization
          float paper_noise = hash(p * 300.0) * 0.06;
          return col - paper_noise;
      }

      // --- [THE TANDEM: VHS DAMAGE & RENDER PIPELINE] ---
      vec3 render(vec2 uv) {
          vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.4;
          vec3 c = cardContent(p);
          
          if (c.r < -0.5) {
              // Cosmic Void / Abyssal Rendering
              float void_noise = fbm(p * 2.5 - u_time * 0.05);
              return vec3(0.04, 0.0, 0.08) + vec3(0.15, 0.05, 0.25) * void_noise;
          }
          return c;
      }

      void main() {
          vec2 uv = vUv;
          
          // 1. Mechanical Hesitation & Tape Jitter
          float tracking = step(0.96, sin(uv.y * 15.0 + u_time * 3.0)) * sin(u_time * 25.0) * 0.012;
          tracking += step(0.995, hash(vec2(uv.y, floor(u_time * 12.0)))) * 0.04; // XOR-Ghost tear
          uv.x += tracking;

          // 2. Head-Switching Noise (Bottom of tape)
          if (uv.y < 0.06) {
              float snow = hash(uv * u_time * 113.0);
              fragColor = vec4(vec3(snow) * vec3(0.8, 0.8, 1.0), 1.0);
              return;
          }

          // 3. Print Misregistration / Chroma Bleed
          float bleed = 0.006 + 0.004 * sin(u_time * 1.5);
          float r = render(uv + vec2(bleed, 0.0)).r;
          float g = render(uv).g;
          float b = render(uv - vec2(bleed, 0.0)).b;

          // 4. CRT Phosphor Bloom / Vignette
          vec3 finalCol = vec3(r, g, b);
          float vignette = length(vUv - 0.5) * 1.2;
          finalCol -= vignette * 0.15;

          fragColor = vec4(finalCol, 1.0);
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
  if (material.uniforms.u_time) {
    material.uniforms.u_time.value = time;
  }
  if (material.uniforms.u_resolution) {
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);