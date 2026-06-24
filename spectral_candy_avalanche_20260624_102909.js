try {
  if (!canvas.__three) {
    if (!ctx) throw new Error("Context unavailable");
    if (!ctx.getParameter) throw new Error("Not a WebGL context");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    renderer.autoClear = false;

    const fboOpts = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      stencilBuffer: false,
      depthBuffer: false,
      generateMipmaps: false
    };

    const w = grid.width;
    const h = grid.height;

    const simA = new THREE.WebGLRenderTarget(w, h, fboOpts);
    const simB = new THREE.WebGLRenderTarget(w, h, fboOpts);
    const renderFBO = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType
    });

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const scene = new THREE.Scene();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    scene.add(plane);

    // --- SIMULATION SHADER ---
    const simMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_state: { value: simA.texture },
        u_res: { value: new THREE.Vector2(w, h) },
        u_mouse: { value: new THREE.Vector3(0, 0, 0) },
        u_time: { value: 0 },
        u_seed: { value: Math.random() * 1000.0 }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        
        uniform sampler2D u_state;
        uniform vec2 u_res;
        uniform vec3 u_mouse;
        uniform float u_time;
        uniform float u_seed;

        float hash(vec2 p) {
          return fract(sin(dot(p + u_seed, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          vec2 texel = 1.0 / u_res;
          
          vec4 me = texture(u_state, vUv);
          vec4 n = texture(u_state, vUv + vec2(0.0, texel.y));
          vec4 s = texture(u_state, vUv - vec2(0.0, texel.y));
          vec4 e = texture(u_state, vUv + vec2(texel.x, 0.0));
          vec4 w = texture(u_state, vUv - vec2(texel.x, 0.0));

          float mass = me.r;
          
          // Abelian Sandpile logic
          float topples = floor(mass / 4.0);
          float incoming = floor(n.r / 4.0) + floor(s.r / 4.0) + floor(e.r / 4.0) + floor(w.r / 4.0);
          float next_mass = mass - 4.0 * topples + incoming;

          // Continuous background injection (avalanche driver)
          if (hash(vUv + u_time) < 0.001) {
             next_mass += 4.0;
          }

          // Mouse injection
          if (u_mouse.z > 0.0 && length(vUv - u_mouse.xy) < 0.05) {
             next_mass += 5.0;
          }

          // WFC / Geomancy Phase (g)
          float phase = me.g;
          if (topples > 0.0 || incoming > 0.0) {
             // Re-crystallize phase on disturbance
             phase = hash(floor(vUv * 24.0) + u_time * 0.01) * 16.0; 
          }
          
          // Structural Energy (b)
          float energy = me.b;
          energy = mix(energy, next_mass, 0.05);

          // Afterimage Memory (a)
          float memory = me.a;
          memory = mix(memory, next_mass, 0.02) * 0.99;

          fragColor = vec4(next_mass, phase, energy, memory);
        }
      `
    });

    // --- RENDER SHADER ---
    const renderMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_state: { value: simA.texture },
        u_res: { value: new THREE.Vector2(w, h) },
        u_time: { value: 0 }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        
        uniform sampler2D u_state;
        uniform vec2 u_res;
        uniform float u_time;

        // OKLab Conversion
        vec3 linear_srgb_to_oklab(vec3 c) {
            float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
            float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
            float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
            return vec3(
                0.2104542553 * pow(l, 1.0/3.0) + 0.7936177850 * pow(m, 1.0/3.0) - 0.0040720468 * pow(s, 1.0/3.0),
                1.9779984951 * pow(l, 1.0/3.0) - 2.4285922050 * pow(m, 1.0/3.0) + 0.4505937099 * pow(s, 1.0/3.0),
                0.0259040371 * pow(l, 1.0/3.0) + 0.7827717662 * pow(m, 1.0/3.0) - 0.8086757660 * pow(s, 1.0/3.0)
            );
        }
        vec3 oklab_to_linear_srgb(vec3 c) {
            float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
            float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
            float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
            float l = l_*l_*l_; float m = m_*m_*m_; float s = s_*s_*s_;
            return vec3(
                 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
            );
        }
        vec3 oklab_mix(vec3 c1, vec3 c2, float t) {
            vec3 lab1 = linear_srgb_to_oklab(c1);
            vec3 lab2 = linear_srgb_to_oklab(c2);
            return oklab_to_linear_srgb(mix(lab1, lab2, t));
        }

        // Spectral Color (Wyman multi-lobe fit)
        float lobe(float x, float a, float mu, float sl, float sr) {
            float t = (x - mu) / (x < mu ? sl : sr);
            return a * exp(-0.5 * t * t);
        }
        vec3 wavelengthToRGB(float l) {
            float x = lobe(l, 1.056, 599.8, 37.9, 31.0) + lobe(l, 0.362, 442.0, 16.0, 26.7) + lobe(l, -0.065, 501.1, 20.4, 26.2);
            float y = lobe(l, 0.821, 568.8, 46.9, 40.5) + lobe(l, 0.286, 530.9, 16.3, 31.1);
            float z = lobe(l, 1.217, 437.0, 11.8, 36.0) + lobe(l, 0.681, 459.0, 26.0, 13.8);
            vec3 rgb = vec3(
                 3.2406 * x - 1.5372 * y - 0.4986 * z,
                -0.9689 * x + 1.8758 * y + 0.0415 * z,
                 0.0557 * x - 0.2040 * y + 1.0570 * z
            );
            return clamp(rgb, 0.0, 1.0);
        }

        void main() {
            vec4 state = texture(u_state, vUv);
            float mass = state.r;
            float phase = state.g;
            float energy = state.b;
            float memory = state.a;

            // Deep saturated background fields (No black/white)
            vec3 bg1 = vec3(0.51, 0.0, 0.8); // Deep Violet
            vec3 bg2 = vec3(0.0, 0.7, 0.8);  // Deep Turquoise
            vec3 bg = oklab_mix(bg1, bg2, sin(vUv.x * 3.0 + vUv.y * 2.0 + u_time * 0.5) * 0.5 + 0.5);

            // Grid definitions
            float gridSize = 24.0;
            vec2 cellF = vUv * gridSize;
            vec2 cell = floor(cellF);
            vec2 lUv = fract(cellF);

            // WFC / Geomancy Pattern Logic
            float shape = 0.0;
            float isGeomancy = mod(phase, 2.0) > 1.0 ? 1.0 : 0.0;

            if (isGeomancy > 0.5) {
                // Geomantic 4-line dots
                float row = floor(lUv.y * 4.0);
                float bit = mod(floor(phase / pow(2.0, row)), 2.0);
                vec2 center1 = vec2(0.5, (row + 0.5) / 4.0);
                vec2 center2a = vec2(0.3, (row + 0.5) / 4.0);
                vec2 center2b = vec2(0.7, (row + 0.5) / 4.0);
                
                if (bit < 0.5) {
                    shape = 1.0 - smoothstep(0.05, 0.1, length(lUv - center1));
                } else {
                    shape = (1.0 - smoothstep(0.05, 0.1, length(lUv - center2a))) + 
                            (1.0 - smoothstep(0.05, 0.1, length(lUv - center2b)));
                }
            } else {
                // Truchet arcs
                vec2 tuv = lUv;
                if (mod(phase, 4.0) > 2.0) tuv.x = 1.0 - tuv.x;
                float d1 = length(tuv);
                float d2 = length(tuv - vec2(1.0));
                shape = smoothstep(0.1, 0.0, abs(d1 - 0.5)) + smoothstep(0.1, 0.0, abs(d2 - 0.5));
            }

            // Avalanche state highlighting
            float isToppling = mass > 3.9 ? 1.0 : 0.0;
            shape = mix(shape, 1.0, isToppling * 0.5);

            // Spectral Color mapping
            float lambda = 400.0 + mod(energy * 40.0 + phase * 10.0 + u_time * 20.0, 300.0);
            vec3 specCol = wavelengthToRGB(lambda);
            
            // Structural Interference (Thin film)
            float thickness = 300.0 + mass * 80.0;
            vec3 interference = vec3(
                0.5 + 0.5 * cos((thickness / 650.0) * 6.283),
                0.5 + 0.5 * cos((thickness / 530.0) * 6.283),
                0.5 + 0.5 * cos((thickness / 440.0) * 6.283)
            );
            
            vec3 fg = specCol * interference;
            
            // Combine fg and bg
            vec3 finalCol = oklab_mix(bg, fg, clamp(shape + mass * 0.1, 0.0, 1.0));

            // Complementary Afterimage (Memory)
            vec3 ghostLambda = wavelengthToRGB(mod(lambda + 150.0, 300.0) + 400.0);
            finalCol = oklab_mix(finalCol, ghostLambda, clamp(memory * 0.2, 0.0, 0.8));

            fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
        }
      `
    });

    // --- CRT & BLOOM SHADER ---
    const crtMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_render: { value: renderFBO.texture },
        u_res: { value: new THREE.Vector2(w, h) },
        u_time: { value: 0 }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        
        uniform sampler2D u_render;
        uniform vec2 u_res;
        uniform float u_time;

        vec3 oklab_mix_crt(vec3 c1, vec3 c2, float t) {
            return mix(c1, c2, t); // Simplified for final pass speed
        }

        void main() {
            // Barrel distortion
            vec2 c = vUv - 0.5;
            float r2 = dot(c, c);
            vec2 uv = c * (1.0 + 0.12 * r2 + 0.02 * r2 * r2) + 0.5;

            // Vignette boundary
            if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                fragColor = vec4(0.1, 0.0, 0.2, 1.0); // Deep saturated rim, not black
                return;
            }

            // RGB Convergence Error
            vec2 dir = uv - 0.5;
            float conv = 0.008;
            vec3 col;
            col.r = texture(u_render, uv + dir * conv).r;
            col.g = texture(u_render, uv).g;
            col.b = texture(u_render, uv - dir * conv).b;

            // Candy Phosphor Mask (Aperture Grille)
            float stripe = mod(uv.x * u_res.x, 3.0);
            vec3 mask = vec3(
                smoothstep(1.0, 0.0, abs(stripe - 0.5)),
                smoothstep(1.0, 0.0, abs(stripe - 1.5)),
                smoothstep(1.0, 0.0, abs(stripe - 2.5))
            );
            // Don't dim to black, dim to a rich magenta/blue
            mask = mix(vec3(0.6, 0.2, 0.8), mask, 0.6);
            col *= mask * 1.5;

            // Saturated Scanlines
            float scan = 0.5 + 0.5 * sin(uv.y * u_res.y * 3.1415);
            col *= mix(vec3(1.0), vec3(0.9, 0.4, 1.0), 1.0 - scan);

            // Rolling Bar
            float barPos = fract(u_time * 0.2);
            float bar = exp(-abs(uv.y - barPos) * 10.0);
            col += vec3(0.1, 0.0, 0.2) * bar;

            // Soft Vignette (mixes to deep hot pink/violet instead of black)
            float vig = smoothstep(1.2, 0.4, length((uv - 0.5) * vec2(1.1, 1.0)));
            col = oklab_mix_crt(vec3(0.2, 0.0, 0.3), col, vig);

            // Prevent blowing out to pure white (Candy Tone Mapping)
            col = col / (1.0 + col * 0.2);
            col = pow(col, vec3(1.0/1.1)); // slight gamma lift

            fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
      `
    });

    canvas.__three = { renderer, scene, camera, plane, simA, simB, renderFBO, simMat, renderMat, crtMat };
  }

  const t = canvas.__three;
  const { renderer, scene, camera, plane, simMat, renderMat, crtMat } = t;

  // Handle Resize
  if (t.simA.width !== grid.width || t.simA.height !== grid.height) {
    t.simA.setSize(grid.width, grid.height);
    t.simB.setSize(grid.width, grid.height);
    t.renderFBO.setSize(grid.width, grid.height);
    simMat.uniforms.u_res.value.set(grid.width, grid.height);
    renderMat.uniforms.u_res.value.set(grid.width, grid.height);
    crtMat.uniforms.u_res.value.set(grid.width, grid.height);
    renderer.setSize(grid.width, grid.height, false);
  }

  // Update Uniforms
  simMat.uniforms.u_time.value = time;
  renderMat.uniforms.u_time.value = time;
  crtMat.uniforms.u_time.value = time;

  // Mouse handling
  if (mouse && mouse.isPressed) {
    simMat.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - (mouse.y / grid.height), 1.0);
  } else {
    simMat.uniforms.u_mouse.value.z = 0.0;
  }

  // Ping-Pong Simulation (Multiple passes per frame for faster avalanches)
  let currentSim = t.simA;
  let nextSim = t.simB;
  
  for(let i = 0; i < 4; i++) {
      plane.material = simMat;
      simMat.uniforms.u_state.value = currentSim.texture;
      renderer.setRenderTarget(nextSim);
      renderer.render(scene, camera);
      
      let temp = currentSim;
      currentSim = nextSim;
      nextSim = temp;
  }
  
  // Store active sim buffer
  t.simA = currentSim;
  t.simB = nextSim;

  // Render Pass
  plane.material = renderMat;
  renderMat.uniforms.u_state.value = currentSim.texture;
  renderer.setRenderTarget(t.renderFBO);
  renderer.render(scene, camera);

  // CRT / Display Pass to Screen
  plane.material = crtMat;
  crtMat.uniforms.u_render.value = t.renderFBO.texture;
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);

} catch (e) {
  console.error("WebGL Initialization or Render Failed:", e);
}