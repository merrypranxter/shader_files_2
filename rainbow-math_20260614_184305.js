try {
  if (!ctx) throw new Error("WebGL 2 context not available");

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, context: ctx, alpha: true, antialias: true });
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
      precision highp float;
      
      in vec2 vUv;
      out vec4 fragColor;
      
      uniform float u_time;
      uniform vec2 u_resolution;

      #define PI 3.14159265359
      #define TAU 6.28318530718

      // --- Noise & Entropy (THE-LISTS: Archive Rot, Fluid Dynamics) ---
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p *= 2.0;
          a *= 0.5;
        }
        return v;
      }

      // --- Cymatics: Bessel Standing Wave Approx ---
      float bessel(float x) {
        return sqrt(2.0 / (PI * max(x, 0.001))) * cos(x - 0.785398);
      }

      // --- Structural Color: Thin Film Interference ---
      vec3 thinFilmIridescence(float thickness) {
        // Bragg reflection approximation via phase shift
        vec3 phase = vec3(0.0, 0.33, 0.67);
        return 0.5 + 0.5 * cos(TAU * (thickness / vec3(400.0, 500.0, 600.0) + phase));
      }

      // --- Mathematical Core: Julia Set + Sacred Geometry Fold ---
      vec4 mathCore(vec2 uv, float t) {
        // Sacred Geometry Fold (6-fold symmetry)
        float angle = atan(uv.y, uv.x);
        float radius = length(uv);
        float symmetry = 6.0;
        float sector = TAU / symmetry;
        angle = mod(angle, sector);
        angle = abs(angle - sector / 2.0);
        vec2 foldedUV = radius * vec2(cos(angle), sin(angle));

        // Cymatic Ripple Injection
        float cymatic = bessel(radius * 15.0 - t * 3.0);
        foldedUV += cymatic * 0.015;

        // Julia Set Iteration (San Marco Dragon base, drifting)
        vec2 z = foldedUV * 2.2;
        vec2 c = vec2(-0.7269, 0.1889) + 0.06 * vec2(cos(t * 0.4), sin(t * 0.3));
        
        vec2 dz = vec2(1.0, 0.0);
        float iter = 0.0;
        float trap = 1000.0;

        for (int i = 0; i < 64; i++) {
          dz = 2.0 * vec2(z.x * dz.x - z.y * dz.y, z.x * dz.y + z.y * dz.x) + vec2(1.0, 0.0);
          z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
          
          // Orbit Trap (cross)
          trap = min(trap, min(abs(z.x), abs(z.y)));
          
          if (dot(z, z) > 256.0) break;
          iter++;
        }

        // Distance Estimator
        float d2 = dot(z, z);
        float de = sqrt(max(d2 / dot(dz, dz), 0.0)) * log(max(d2, 1.0)) * 0.5;
        
        // Smooth Iteration
        float smooth_iter = iter - log2(log2(max(d2, 1.0))) + 4.0;

        return vec4(de, trap, smooth_iter, cymatic);
      }

      void main() {
        vec2 uv = (vUv - 0.5) * 2.0;
        uv.x *= u_resolution.x / u_resolution.y;

        float t = u_time * 0.4;

        // --- Rainblown Distortion (Fluid Dynamics & Paper Misregistration) ---
        vec2 wind = vec2(0.8, -1.5) * t;
        float rainNoise = fbm(uv * 4.0 + wind);
        
        // Moisture map: determines where the math "melts"
        float moisture = smoothstep(0.2, 0.8, fbm(uv * 1.5 - wind * 0.4));
        
        vec2 wetUV = uv;
        // Gravity drip
        wetUV.y += moisture * rainNoise * 0.3;
        // Wind shear
        wetUV.x -= moisture * fbm(uv * 6.0 + t) * 0.15;

        // Chromatic Glitch / Print Misregistration
        float glitchSpread = moisture * 0.04;
        vec2 uvR = mix(uv, wetUV + vec2(glitchSpread, 0.0), moisture);
        vec2 uvG = mix(uv, wetUV - vec2(glitchSpread * 0.5, glitchSpread), moisture * 0.9);
        vec2 uvB = mix(uv, wetUV + vec2(0.0, glitchSpread), moisture * 1.1);

        vec4 coreR = mathCore(uvR, t);
        vec4 coreG = mathCore(uvG, t);
        vec4 coreB = mathCore(uvB, t);

        // --- Botanical Aesthetics & Color Systems ---
        // Base Paper: Warm wheat/cream
        vec3 paper = vec3(0.96, 0.92, 0.85);

        // Linework Hierarchy (DE based)
        float lineR = smoothstep(0.015, 0.0, coreR.x);
        float lineG = smoothstep(0.015, 0.0, coreG.x);
        float lineB = smoothstep(0.015, 0.0, coreB.x);

        // Watercolor Wash (Orbit trap based)
        float washR = smoothstep(0.15, 0.0, coreR.y);
        float washG = smoothstep(0.15, 0.0, coreG.y);
        float washB = smoothstep(0.15, 0.0, coreB.y);

        // Wet Edge Bloom (Botanical)
        float edgeBloom = smoothstep(0.0, 0.05, coreG.y) * smoothstep(0.15, 0.1, coreG.y);

        // Structural Color Iridescence (in the puddles)
        float thickness = 250.0 + coreG.z * 15.0 + rainNoise * 300.0;
        vec3 iridescence = thinFilmIridescence(thickness);

        // --- Compositing ---
        vec3 finalColor = paper;

        // Subtractive CMYK-like ink blending for washes
        vec3 washColor = vec3(1.0 - washR, 1.0 - washG, 1.0 - washB);
        finalColor *= mix(vec3(1.0), washColor, 0.7);

        // Add wet edge bloom (dark crimson/brown deposition)
        finalColor = mix(finalColor, vec3(0.3, 0.1, 0.1), edgeBloom * moisture * 0.8);

        // Inject Structural Color into the wettest parts
        finalColor = mix(finalColor, iridescence, moisture * washG * 0.8);

        // Apply harsh linework
        vec3 inkColor = vec3(1.0 - lineR, 1.0 - lineG, 1.0 - lineB);
        finalColor *= mix(vec3(1.0), inkColor, 0.85);

        // Ultraviolet Shame Bleed (THE-LISTS: Emotional Light)
        vec3 uvBleed = vec3(0.5, 0.0, 1.0) * smoothstep(0.02, 0.08, coreB.y) * moisture;
        finalColor = max(finalColor, uvBleed * 0.6);

        // Cymatic Resonance Texture
        finalColor *= 1.0 - 0.12 * abs(coreG.w);

        // Dither/Grain (Glitch Aesthetics)
        float grain = (hash(gl_FragCoord.xy + t) - 0.5) * 0.08;
        finalColor += grain;

        // Perceptual Contrast Boost
        finalColor = smoothstep(0.0, 1.0, finalColor);
        finalColor = pow(finalColor, vec3(0.9)); // Slight gamma correction

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
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }

  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);

} catch (e) {
  console.error("Feral Math Initialization Failed:", e);
}