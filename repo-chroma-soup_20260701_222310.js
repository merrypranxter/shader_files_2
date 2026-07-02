if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

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
      #version 300 es
      precision highp float;

      in vec2 vUv;
      out vec4 fragColor;

      uniform float u_time;
      uniform vec2 u_resolution;

      // --- Mathematical Primitives (Gematria / Sandpile Base) ---
      
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      float noise(vec3 x) {
        vec3 p = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        vec2 uv = (p.xy + vec2(37.0, 239.0) * p.z) + f.xy;
        vec2 rg = fract(cos(uv * vec2(12.9898, 78.233)) * 43758.5453);
        return mix(rg.x, rg.y, f.z);
      }

      mat2 rot(float a) {
        float c = cos(a), s = sin(a);
        return mat2(c, -s, s, c);
      }

      // --- The Unified Field (The Coherent Soup) ---
      // Blends Non-orientable topologies, Abelian Sandpile thresholds, 
      // Mineral fibrous growth, and Gematria resonance cycles.
      
      vec4 getSoup(vec2 p, float tOffset) {
        float t = u_time * 0.2 + tOffset;

        // Non-orientable warp: Mobius/Klein coordinate folding
        float r = length(p);
        float a = atan(p.y, p.x);
        float twist = a + sin(r * 4.0 - t * 2.0) * 0.6;
        p = r * vec2(cos(twist), sin(twist));

        float f = 0.0;
        float amp = 0.5;
        vec2 shift = vec2(0.0);
        float mineralFiber = 0.0;

        for(int i = 0; i < 6; i++) {
            vec3 p3 = vec3(p * 2.0 + shift, t + float(i) * 0.15);
            float n = noise(p3);

            // Gematria 9-cycle & Sandpile 4-threshold logic
            float steps = (mod(float(i), 2.0) < 0.5) ? 9.0 : 4.0;
            float stepped = floor(n * steps) / steps;

            // Emulsify smooth fluid dynamics with stepped computational states
            float layer = mix(n, stepped, 0.4);
            f += amp * layer;

            // Mineral Fibers: Chatoyant high-frequency striations along the flow
            mineralFiber += sin(p.x * 40.0 + p.y * 40.0) * amp * 0.15;

            // Vector field curl advection (organic swarm/weather behavior)
            float angle = n * 6.2831853;
            shift += vec2(cos(angle), sin(angle)) * 0.35 * amp;

            p *= rot(0.73); // Golden-angle-ish rotation
            p *= 1.6;
            amp *= 0.5;
        }

        return vec4(f, shift.x, shift.y, mineralFiber);
      }

      // --- Maximalist Candy-Acid Palette ---
      
      vec3 acidColor(float v) {
        float phase = fract(v * 1.5 - u_time * 0.1);
        
        vec3 hotPink    = vec3(1.0, 0.0, 0.6);
        vec3 acidGreen  = vec3(0.6, 1.0, 0.0);
        vec3 cyan       = vec3(0.0, 0.9, 1.0);
        vec3 violet     = vec3(0.5, 0.0, 1.0);
        vec3 orange     = vec3(1.0, 0.4, 0.0);

        vec3 c = mix(hotPink, acidGreen, smoothstep(0.0, 0.2, phase));
        c = mix(c, cyan, smoothstep(0.2, 0.4, phase));
        c = mix(c, violet, smoothstep(0.4, 0.6, phase));
        c = mix(c, orange, smoothstep(0.6, 0.8, phase));
        c = mix(c, hotPink, smoothstep(0.8, 1.0, phase));

        return c;
      }

      void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        uv.x *= u_resolution.x / u_resolution.y;

        // --- Psychedelic Collage: CMYK Misregistration ---
        float glitchOff = 0.015 + 0.01 * sin(u_time * 3.0 + length(uv) * 12.0);

        vec4 soupR = getSoup(uv + vec2(glitchOff, 0.0), 0.0);
        vec4 soupG = getSoup(uv + vec2(-glitchOff * 0.5, glitchOff * 0.866), 0.05);
        vec4 soupB = getSoup(uv + vec2(-glitchOff * 0.5, -glitchOff * 0.866), 0.1);

        // Map scalar soup to acid colors
        vec3 col;
        col.r = acidColor(soupR.x * 2.5).r;
        col.g = acidColor(soupG.x * 2.5).g;
        col.b = acidColor(soupB.x * 2.5).b;

        // --- Birefringence / Michel-Lévy Interference Fringes ---
        // Retardance = thickness * delta_n. Intensity = sin^2(pi * retardance / lambda)
        float retardance = soupR.x * 3500.0; // 0 to 3500nm
        vec3 lambda = vec3(650.0, 510.0, 440.0); // RGB wavelengths
        vec3 interference = pow(sin(3.14159 * retardance / lambda), vec3(2.0));

        // Blend interference based on vector field intensity
        float flowInt = length(vec2(soupR.y, soupR.z));
        col = mix(col, interference, smoothstep(0.1, 0.45, flowInt));

        // --- Minerals: Chatoyancy Fibers ---
        col += vec3(soupR.w, soupG.w, soupB.w) * 2.5;

        // --- Abelian Sandpile: Cellular Cracks ---
        float steps = 9.0; // Gematria 9-cycle base
        float edge = fract(soupR.x * steps + u_time * 0.5);
        float crack = smoothstep(0.0, 0.04, edge) * smoothstep(1.0, 0.96, edge);
        col = mix(vec3(1.0, 0.95, 1.0), col, crack); // White-hot structural fractures

        // --- Psychedelic Collage: Halftone Moiré ---
        float luma = dot(col, vec3(0.299, 0.587, 0.114));
        mat2 rotHT = rot(0.785398); // 45 degree screen angle
        vec2 hGrid = rotHT * gl_FragCoord.xy * 0.22;
        float htDot = length(fract(hGrid) - 0.5) * 2.0;
        float htMask = smoothstep(luma * 1.6, luma * 1.6 - 0.2, htDot);
        
        // Multiply blend the halftone (simulating physical ink)
        col = mix(col, col * vec3(0.15, 0.0, 0.3), htMask * 0.65);

        // --- Analog Film Sim: Grain & Halation ---
        float grain = (hash(gl_FragCoord.xy + u_time) - 0.5) * 0.18;
        col += grain;

        // --- Chromadepth / Edge Vignette ---
        float r = length(uv);
        col *= smoothstep(1.6, 0.35, r);

        // --- Global Bloom / Spectral Glow ---
        vec3 glowColor = vec3(1.0, 0.1, 0.9);
        col += glowColor * exp(-r * r * 6.0) * 0.45 * (0.5 + 0.5 * sin(u_time * 4.0));

        // Overdrive saturation to cement the maximalist look
        col = mix(vec3(luma), col, 1.4);

        fragColor = vec4(col, 1.0);
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
  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
    throw e;
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