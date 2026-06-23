try {
  // THREE.js Initialization & Caching Guard
  if (!canvas.__three) {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, grid.width / grid.height, 0.1, 1000);
    camera.position.z = 5;

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
      uniform float u_E;
      uniform float u_mu;

      #define MAX_STEPS 120
      #define TAU 6.28318530718

      // ─── TOPOLOGY & SDF MATH ───────────────────────────────────────────────

      mat2 rot(float a) {
          float s = sin(a), c = cos(a);
          return mat2(c, -s, s, c);
      }

      float opSmoothUnion(float d1, float d2, float k) {
          float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
          return mix(d2, d1, h) - k * h * (1.0 - h);
      }

      // Hopf-fibration inspired twisted torus
      float sdHopfTorus(vec3 p, vec2 t, float twists) {
          vec2 q = vec2(length(p.xz) - t.x, p.y);
          float a = atan(p.z, p.x);
          q *= rot(a * twists);
          float bump = sin(a * 7.0 + u_time * 2.0) * 0.04;
          return length(q) - t.y + bump;
      }

      // The Hidden Alien Sticker-Object
      float map(vec3 p) {
          vec3 q = p;
          q.xy *= rot(u_time * 0.15);
          q.yz *= rot(u_time * 0.22);
          
          float gyroid = dot(sin(q * 5.0), cos(q.zxy * 5.0)) * 0.12;
          
          float d1 = sdHopfTorus(q, vec2(0.55, 0.15), 3.0);
          
          vec3 q2 = p;
          q2.xz *= rot(-u_time * 0.3);
          q2.xy *= rot(u_time * 0.1);
          float d2 = sdHopfTorus(q2, vec2(0.35, 0.12), -2.0);
          
          float d = opSmoothUnion(d1, d2, 0.25);
          
          d += gyroid; // Impossible topological folding
          
          float core = length(p) - 0.2;
          d = opSmoothUnion(d, core, 0.3);
          
          return d;
      }

      // Raymarch Depth Map z(x,y)
      float getDepth(vec2 uv) {
          vec2 p = uv * 2.0 - 1.0;
          p.x *= u_resolution.x / u_resolution.y;
          
          vec3 ro = vec3(p * 1.15, 2.5);
          vec3 rd = vec3(0.0, 0.0, -1.0); // Orthographic projection for pure depth
          
          float t = 0.0;
          float z = 0.0;
          for(int i = 0; i < 64; i++) {
              vec3 pos = ro + rd * t;
              float d = map(pos);
              if (d < 0.002) {
                  // Map z to [0.0, 1.0], where 1.0 is nearest
                  z = clamp((pos.z + 1.0) * 0.5, 0.0, 1.0);
                  break;
              }
              t += d;
              if (t > 5.0) break;
          }
          
          // Noise terrain background to prevent flat fusion loss
          if (z == 0.0) {
              float bg = sin(uv.x * 25.0 + u_time) * cos(uv.y * 25.0 - u_time) * 0.04 + 0.04;
              z = bg;
          }
          
          // Soft dome falloff to ground the stereogram edges
          float dome = smoothstep(1.6, 0.0, length(p));
          z *= dome;
          
          return z;
      }

      // ─── ALCHEMICAL WALLPAPER PATTERN ────────────────────────────────────

      float hash3(vec3 p) {
          return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
      }

      vec3 getPattern(vec2 uv) {
          vec2 tUv = uv / u_E;
          float wx = tUv.x * TAU; // Perfectly wrapping horizontal phase
          float wy = tUv.y * TAU * (u_E / u_resolution.y); 
          
          // Quasiperiodic Tiling & Op-Art Moiré
          float m1 = sin(wx * 2.0 + sin(wy * 3.0 + u_time * 0.5));
          float m2 = cos(wy * 3.0 + cos(wx * 2.0 - u_time * 0.35));
          float base = m1 * m2;
          
          // Acid Neon Lisa-Frank-on-Lab-Equipment Palette
          vec3 cCyan = vec3(0.0, 1.0, 0.9);
          vec3 cPink = vec3(1.0, 0.0, 0.6);
          vec3 cLime = vec3(0.6, 1.0, 0.0);
          vec3 cTang = vec3(1.0, 0.4, 0.0);
          vec3 cUV   = vec3(0.4, 0.0, 1.0);
          
          vec3 col = mix(cCyan, cPink, sin(base * PI + wy * 1.5) * 0.5 + 0.5);
          col = mix(col, cLime, cos(base * PI * 1.2 - wx * 1.5) * 0.5 + 0.5);
          
          // Holographic Interference
          float holo = sin(wx * 8.0 + wy * 6.0 + u_time * 2.0) * 
                       cos(wx * 5.0 - wy * 9.0 - u_time * 1.5);
          col += cUV * (holo * 0.4);
          
          // Prismatic Boro-Glass / Chrome Glitter
          vec3 noisePos = vec3(sin(wx * 3.0), cos(wx * 3.0), wy * 3.0);
          float glitter = hash3(noisePos);
          float glitMask = smoothstep(0.7, 1.0, sin(wx * 4.0) * cos(wy * 4.0));
          col += vec3(1.0) * glitter * glitMask * 1.2;
          
          // Candy Enamel Blobs (Reaction-Diffusion Cells)
          float cells = sin(wx * 4.0) * sin(wy * 4.0);
          col *= 0.75 + 0.45 * smoothstep(-0.2, 0.2, cells);
          
          // Weird Glyph-Noise / Fractal Symbols
          vec2 gUv = fract(vec2(tUv.x * 5.0, tUv.y * 5.0 * (u_resolution.y / u_E))) - 0.5;
          float r = length(gUv);
          float a = atan(gUv.y, gUv.x);
          float glyph = smoothstep(0.12, 0.09, abs(r - 0.25 - 0.1 * sin(a * 3.0 + u_time * 1.5)));
          glyph *= smoothstep(0.08, 0.0, abs(gUv.x)) + smoothstep(0.08, 0.0, abs(gUv.y));
          col = mix(col, vec3(1.0, 0.9, 0.0), glyph * 0.85);

          return clamp(col, 0.0, 1.0);
      }

      // ─── MAGIC EYE SOLVE (Thimbleby-Inglis-Witten GPU Approx) ────────────
      
      void main() {
          float xPix = vUv.x * u_resolution.x;
          float yPix = vUv.y * u_resolution.y;
          
          // Chromatic Aberration Vectors: Calculate depth shift per RGB channel
          // This gives the hidden object a toxic holographic 3D sheen
          vec3 uShift = vec3(xPix);
          vec3 offsets = vec3(0.003, 0.0, -0.003); // CA divergence in UV space
          
          for(int i = 0; i < MAX_STEPS; i++) {
              if (uShift.r < u_E) break;
              vec2 sampleUv = vec2(uShift.r / u_resolution.x, vUv.y) + vec2(offsets.r, 0.0);
              float z = getDepth(sampleUv);
              float sep = u_E * (1.0 - u_mu * z) / (2.0 - u_mu * z);
              uShift.r -= max(sep, 1.0);
          }
          
          for(int i = 0; i < MAX_STEPS; i++) {
              if (uShift.g < u_E) break;
              vec2 sampleUv = vec2(uShift.g / u_resolution.x, vUv.y) + vec2(offsets.g, 0.0);
              float z = getDepth(sampleUv);
              float sep = u_E * (1.0 - u_mu * z) / (2.0 - u_mu * z);
              uShift.g -= max(sep, 1.0);
          }
          
          for(int i = 0; i < MAX_STEPS; i++) {
              if (uShift.b < u_E) break;
              vec2 sampleUv = vec2(uShift.b / u_resolution.x, vUv.y) + vec2(offsets.b, 0.0);
              float z = getDepth(sampleUv);
              float sep = u_E * (1.0 - u_mu * z) / (2.0 - u_mu * z);
              uShift.b -= max(sep, 1.0);
          }
          
          // Modulo sample the repeating wallpaper
          float pR = mod(uShift.r, u_E);
          float pG = mod(uShift.g, u_E);
          float pB = mod(uShift.b, u_E);
          
          vec3 col;
          col.r = getPattern(vec2(pR, yPix)).r;
          col.g = getPattern(vec2(pG, yPix)).g;
          col.b = getPattern(vec2(pB, yPix)).b;
          
          // Convergence Dots (Wall-eyed guides)
          if (vUv.y > 0.92) {
              float cx = u_resolution.x * 0.5;
              float cy = u_resolution.y * 0.96;
              float d1 = length(vec2(xPix, yPix) - vec2(cx - u_E * 0.5, cy));
              float d2 = length(vec2(xPix, yPix) - vec2(cx + u_E * 0.5, cy));
              float dotD = min(d1, d2);
              
              if (dotD < 12.0) {
                  float maskOuter = smoothstep(12.0, 9.0, dotD);
                  float maskInner = smoothstep(6.0, 4.0, dotD);
                  col = mix(col, vec3(0.05), maskOuter);
                  col = mix(col, vec3(0.95), maskInner);
              }
          }
          
          fragColor = vec4(col, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_E: { value: 140.0 }, // Pattern period (eye separation px)
        u_mu: { value: 0.45 }  // Depth scale intensity
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
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }

  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);

} catch (e) {
  console.error("WebGL Initialization Failed:", e);
}