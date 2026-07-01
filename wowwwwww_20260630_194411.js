try {
  if (!canvas.__three) {
    if (!ctx) throw new Error("WebGL 2 context not available");

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
      precision highp float;
      in vec2 vUv;
      out vec4 fragColor;

      uniform vec2 u_resolution;
      uniform float u_time;

      #define PI 3.14159265359

      // Bayer 4x4 matrix for Ditherpunk / Pixel Voxel texturing
      const float bayer[16] = float[](
          0., 8., 2., 10.,
          12., 4., 14., 6.,
          3., 11., 1., 9.,
          15., 7., 13., 5.
      );

      float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
      }

      vec2 hash22(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
          p3 += dot(p3, p3.yzx+33.33);
          return fract((p3.xx+p3.yz)*p3.zy);
      }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i + vec2(0.,0.)), hash(i + vec2(1.,0.)), u.x),
                     mix(hash(i + vec2(0.,1.)), hash(i + vec2(1.,1.)), u.x), u.y);
      }

      float fbm(vec2 p) {
          float f = 0.0, amp = 0.5;
          mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
          for(int i=0; i<4; i++) {
              f += amp * noise(p);
              p = rot * p * 2.0;
              amp *= 0.5;
          }
          return f;
      }

      // Cellular structure / Reaction-Diffusion bloom base
      float voronoi(vec2 x, float t) {
          vec2 n = floor(x);
          vec2 f = fract(x);
          float md = 5.0;
          for(int j=-1; j<=1; j++) {
              for(int i=-1; i<=1; i++) {
                  vec2 g = vec2(float(i), float(j));
                  vec2 o = hash22(n + g);
                  o = 0.5 + 0.5 * sin(t + 6.2831 * o);
                  vec2 r = g + o - f;
                  float d = dot(r, r);
                  if(d < md) md = d;
              }
          }
          return sqrt(md);
      }

      // Dihedral group folding (Kaleidoscope Engine)
      vec2 kalFold(vec2 p, float n) {
          float sector = 2.0 * PI / n;
          float a = atan(p.y, p.x);
          float r = length(p);
          float folded = mod(a, sector);
          if (folded > sector / 2.0) folded = sector - folded;
          return vec2(cos(folded), sin(folded)) * r;
      }

      // Nonorientable manifold twist + Dihedral fold
      vec2 warp(vec2 p, float t) {
          float r = length(p);
          float a = atan(p.y, p.x);
          a += sin(r * 3.0 - t) * 1.5;
          p = vec2(cos(a), sin(a)) * r;

          p = kalFold(p, 5.0);
          p = p * 1.5 - vec2(0.4, 0.0);
          p = kalFold(p, 3.0);
          
          return p;
      }

      // Maximalist Candy-Acid Palette
      vec3 candyAcid(float t) {
          t = fract(t);
          vec3 c1 = vec3(1.0, 0.0, 0.6); // hot pink
          vec3 c2 = vec3(0.8, 1.0, 0.0); // neon yellow
          vec3 c3 = vec3(0.2, 1.0, 0.0); // acid green
          vec3 c4 = vec3(0.0, 1.0, 0.8); // cyan
          vec3 c5 = vec3(0.0, 0.3, 1.0); // electric blue
          vec3 c6 = vec3(0.5, 0.0, 1.0); // violet
          vec3 c7 = vec3(1.0, 0.3, 0.0); // orange
          
          float idx = t * 7.0;
          int i = int(idx);
          float f = smoothstep(0.0, 1.0, fract(idx));
          
          if(i == 0) return mix(c1, c2, f);
          if(i == 1) return mix(c2, c3, f);
          if(i == 2) return mix(c3, c4, f);
          if(i == 3) return mix(c4, c5, f);
          if(i == 4) return mix(c5, c6, f);
          if(i == 5) return mix(c6, c7, f);
          return mix(c7, c1, f);
      }

      void main() {
          vec2 uv = vUv * 2.0 - 1.0;
          uv.x *= u_resolution.x / u_resolution.y;

          // Glitch strata (Saccadic Masking / Change Blindness)
          float glitchLine = step(0.96, hash(vec2(floor(u_time * 8.0), floor(uv.y * 30.0))));
          uv.x += glitchLine * 0.04 * sin(u_time * 20.0);

          // Saccadic time gating (discrete jumps + smooth continuous flow)
          float saccadeTime = floor(u_time * 1.5) + smoothstep(0.0, 0.3, fract(u_time * 1.5));
          float cTime = u_time * 0.4;

          // Prism Dispersion / Cauchy Chromatic Aberration
          // Sample the spatial manifold at different scales per wavelength
          vec2 pR = warp(uv * 0.95, saccadeTime);
          vec2 pG = warp(uv * 1.00, saccadeTime);
          vec2 pB = warp(uv * 1.05, saccadeTime);

          // Acoustic Impedance Map / Ultrasound FDTD simulation field
          float zR = voronoi(pR * 2.5, cTime) + fbm(pR * 5.0 - cTime) * 0.8;
          float zG = voronoi(pG * 2.5, cTime) + fbm(pG * 5.0 - cTime) * 0.8;
          float zB = voronoi(pB * 2.5, cTime) + fbm(pB * 5.0 - cTime) * 0.8;

          // High-frequency ultrasound wave propagation
          float wR = sin(length(pR)*40.0 - u_time*15.0);
          float wG = sin(length(pG)*40.0 - u_time*15.0);
          float wB = sin(length(pB)*40.0 - u_time*15.0);

          // Structural Color / Thin Film Interference (Spectral Color mapping)
          vec3 cR = candyAcid(zR * 1.5 + wR * 0.04);
          vec3 cG = candyAcid(zG * 1.5 + wG * 0.04 + 0.15);
          vec3 cB = candyAcid(zB * 1.5 + wB * 0.04 + 0.30);

          vec3 col = vec3(cR.r, cG.g, cB.b);

          // Munker-White / Lateral Inhibition bands (Simultaneous Contrast)
          float stripes = sin(uv.y * 150.0 + fbm(uv * 4.0) * 15.0);
          col *= 0.85 + 0.15 * stripes;

          // Iridescent edge highlights (Fresnel / Bragg Reflection)
          vec3 N = normalize(vec3(dFdx(zG), dFdy(zG), 0.04));
          vec3 V = vec3(0.0, 0.0, 1.0);
          float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
          col += candyAcid(fresnel * 2.5 + u_time) * fresnel * 1.8;

          // Stygian Blue / Impossible Colors (Opponent Process)
          // Creates impossibly dark, saturated voids surrounded by neon halos
          float edge = smoothstep(0.03, 0.10, abs(fract(zG * 3.0) - 0.5));
          vec3 stygian = vec3(0.0, 0.0, 0.05); // Void color
          col = mix(stygian, col, edge);

          // Self-luminous red / White-hot bloom
          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          float glow = smoothstep(0.65, 0.95, lum);
          col += glow * vec3(1.0, 0.4, 0.7) * 1.5;

          // Ditherpunk / Ordered Dithering (Pixel Voxel Engine)
          int bx = int(gl_FragCoord.x) % 4;
          int by = int(gl_FragCoord.y) % 4;
          float ditherVal = (bayer[by * 4 + bx] / 16.0) - 0.5;

          // Ultrasound Speckle Noise
          float speckle = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + u_time) * 43758.5453);
          
          // Apply dither and speckle, then quantize for tactile retro-futurist feel
          col += ditherVal * 0.15 + (speckle - 0.5) * 0.06;
          col = floor(col * 14.0 + 0.5) / 14.0;

          fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
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
  
  if (material && material.uniforms && material.uniforms.u_time) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }

  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);

} catch (e) {
  console.error("WebGL Initialization Failed:", e);
  throw e;
}