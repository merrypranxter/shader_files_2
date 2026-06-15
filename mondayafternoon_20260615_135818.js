try {
  if (!canvas.__three) {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, grid.width / grid.height, 0.1, 1000);
    camera.position.z = 1.0;

    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;
      in vec2 vUv;
      out vec4 fragColor;

      uniform float u_time;
      uniform vec2 u_resolution;

      #define PI 3.14159265358979323846
      #define GOLDEN_ANGLE 2.399963229728653

      // FERAL MECHANISM: Topological Hemorrhage + Chrono-Stratigraphic Fluid
      // The math wants to be a perfect Apollonian gasket. The environment wants it to melt.

      // --- OKLab Perceptual Color Math (Repo 7) ---
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

      vec3 linear_to_srgb(vec3 c) {
          vec3 sq1 = sqrt(clamp(c, 0.0, 1.0));
          vec3 sq2 = sqrt(sq1);
          vec3 sq3 = sqrt(sq2);
          return 0.662002687 * sq1 + 0.684122060 * sq2 - 0.323583601 * sq3 - 0.022541147 * c;
      }

      vec3 oklch_to_srgb(float L, float C, float h) {
          vec3 lab = vec3(L, C * cos(h), C * sin(h));
          return linear_to_srgb(oklab_to_linear_srgb(lab));
      }

      // --- Hash & Noise (Rainblown Fluidics) ---
      mat2 rot(float a) {
          float c = cos(a), s = sin(a);
          return mat2(c, -s, s, c);
      }

      vec2 hash2(vec2 p) {
          p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
          return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
      }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                         dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
                     mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                         dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
      }

      float fbm(vec2 p) {
          float f = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
              f += amp * noise(p);
              p = rot(1.23) * p * 2.0;
              amp *= 0.5;
          }
          return f;
      }

      vec2 curl(vec2 p) {
          float e = 0.01;
          float x = fbm(p + vec2(0.0, e)) - fbm(p - vec2(0.0, e));
          float y = fbm(p - vec2(e, 0.0)) - fbm(p + vec2(e, 0.0));
          return vec2(x, -y) / (2.0 * e);
      }

      // --- Kleinian Group / Möbius Inversion (Repo 5) ---
      vec2 cInv(vec2 z, vec2 center, float radius2) {
          vec2 d = z - center;
          float l2 = dot(d, d);
          if (l2 < 0.0001) return z; // avoid forbidden NaN death
          return center + d * radius2 / l2;
      }

      void main() {
          vec2 uv = (vUv - 0.5) * 2.0;
          uv.x *= u_resolution.x / u_resolution.y;

          // Localized Time Warp
          float t = u_time * 0.4;
          float localTime = t + fbm(uv * 3.0 - t) * 1.5;

          // The Rainblown Flow (Domain Warping via Curl Noise)
          vec2 flow = curl(uv * 1.5 + vec2(0.0, localTime * 0.8));
          vec2 z = uv + flow * 0.15;
          
          // Downward gravity drift simulating rain/tears
          z.y += localTime * 0.2;

          // Mathematical Engine: A melting Apollonian Gasket / Kleinian limit set
          float iter = 0.0;
          float orbitTrap = 1e10;
          float spinTrap = 0.0;
          
          vec2 c1 = vec2( 0.8,  0.8);
          vec2 c2 = vec2(-0.8, -0.8);
          vec2 c3 = vec2(-0.8,  0.8);
          vec2 c4 = vec2( 0.8, -0.8);
          float r2 = 1.1;

          for (int i = 0; i < 12; i++) {
              // Fold space
              z = abs(z);
              z -= vec2(0.4);
              
              // Spherical inversion
              float d2 = dot(z, z);
              orbitTrap = min(orbitTrap, d2);
              spinTrap += atan(z.y, z.x);
              
              if (d2 < 0.3) {
                  z *= 3.3333; // Expand
              } else if (d2 < 1.0) {
                  z /= d2; // Invert
              }
              
              // Memphis Design geometric rotation clash
              z *= rot(GOLDEN_ANGLE + localTime * 0.1);
              
              iter += 1.0;
          }

          // --- Structural Color / Iridescence (Repo 1 + Repo 7) ---
          // Hue driven by sequence math and golden angle
          float hue = spinTrap * 0.2 + iter * GOLDEN_ANGLE - localTime * 2.0;
          
          // Thin-film interference simulation mapping to OKLCh Lightness
          float pathDiff = orbitTrap * 12.0;
          float interference = 0.5 + 0.5 * cos(pathDiff * PI * 4.0);
          
          float L = 0.4 + 0.4 * interference; // Lightness oscillates structurally
          float C = 0.15 + 0.15 * fbm(z * 4.0); // Chroma stays high for "neon against void"
          
          vec3 baseColor = oklch_to_srgb(L, C, hue);

          // --- Retinal Surrealism / Op Art Mechanics (Repo 8) ---
          // Stripe fluid distortion
          float moirePhase = length(z) * 15.0 - localTime * 8.0 + fbm(uv * 10.0) * 2.0;
          float moire = sin(moirePhase);
          
          // Sharp black outlines (Structural Contrast)
          float edge = smoothstep(0.1, -0.1, moire);
          float thinEdge = smoothstep(0.8, 0.9, abs(moire));
          
          vec3 finalColor = mix(baseColor, vec3(0.02, 0.01, 0.03), edge * 0.8);
          finalColor = mix(finalColor, vec3(0.9, 0.95, 1.0), thinEdge * 0.5); // Prismatic edge highlight

          // --- I Ching Binary Field Overlay (Repo 6) ---
          // Cellular automaton ghosting in the background
          vec2 grid = floor(uv * 12.0 + flow);
          float hexGhost = step(0.85, fract(sin(dot(grid, vec2(12.9898, 78.233))) * 43758.5453 + localTime));
          finalColor = mix(finalColor, vec3(1.0) - finalColor, hexGhost * 0.15 * interference);

          // Crush darks for "The Ship" / "Void" aesthetic (Repo 3)
          finalColor = pow(finalColor, vec3(1.1)); 

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
    if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }

  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);

} catch (e) {
  console.error("WebGL Initialization or Render Failed:", e);
  
  // Fallback Feral Canvas2D if WebGL fails
  if (ctx && ctx.fillText) {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, grid.width, grid.height);
    ctx.font = '20px monospace';
    ctx.fillStyle = '#FF3366';
    ctx.fillText('TOPOLOGICAL HEMORRHAGE: WEBGL REQUIRED', 20, grid.height / 2);
  }
}