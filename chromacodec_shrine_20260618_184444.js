if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    renderer.autoClear = false;

    const scene = new THREE.Scene();
    const simScene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // FBO Setup for Ping-Pong (Reaction-Diffusion & Datamosh History)
    const rtOptions = {
      format: THREE.RGBAFormat,
      type: THREE.FloatType, // Required for Reaction-Diffusion precision
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false
    };
    const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
    const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

    // --- SIMULATION SHADER (Morphogenesis + Datamosh Advection) ---
    const simMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_prev: { value: null },
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_frame: { value: 0 }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D u_prev;
        uniform float u_time;
        uniform vec2 u_resolution;
        uniform int u_frame;

        // Gray-Scott Parameters
        const float Du = 0.16;
        const float Dv = 0.08;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

        void main() {
          vec2 px = 1.0 / u_resolution;
          vec2 uv = vUv;

          // Datamosh & Damage Advection (Blocky Vector Field)
          vec2 gridUv = floor(uv * 40.0) / 40.0;
          float n = hash(gridUv + floor(u_time * 4.0));
          vec2 motion = vec2(cos(n * 6.283), sin(n * 6.283)) * 0.003;
          
          // Passing cloud wave advection
          motion.x += sin(uv.y * 15.0 - u_time * 2.0) * 0.001;

          vec2 advectedUv = uv - motion;

          // Reaction-Diffusion Laplacian
          vec4 c = texture(u_prev, advectedUv);
          vec4 n_ = texture(u_prev, advectedUv + vec2(0.0, px.y));
          vec4 s = texture(u_prev, advectedUv - vec2(0.0, px.y));
          vec4 e = texture(u_prev, advectedUv + vec2(px.x, 0.0));
          vec4 w = texture(u_prev, advectedUv - vec2(px.x, 0.0));

          vec2 lap = (n_.rg + s.rg + e.rg + w.rg - 4.0 * c.rg);

          float u = c.r;
          float v = c.g;

          // Spatial parameter variance (Spots & Labyrinths)
          float F = 0.035 + 0.005 * sin(uv.x * 10.0 + u_time * 0.5);
          float K = 0.060 + 0.002 * cos(uv.y * 10.0);

          float uvv = u * v * v;
          float du = Du * lap.x - uvv + F * (1.0 - u);
          float dv = Dv * lap.y + uvv - (F + K) * v;

          u += du;
          v += dv;

          // Seed Morphogenesis
          if (u_frame < 2) {
            u = 1.0;
            v = 0.0;
            if (length(uv - 0.5) < 0.2 || hash(uv * 100.0) > 0.98) {
              v = 1.0;
            }
          } else {
            // Keep portal alive
            if (length(uv - 0.5) < 0.15 && hash(uv + u_time) > 0.99) v = 0.9;
          }

          // Store history for temporal ghosting
          float hist = mix(c.b, v, 0.05);

          fragColor = vec4(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0), hist, 1.0);
        }
      `
    });

    // --- RENDER SHADER (Op-Art, UI, CA, Cross-Processing) ---
    const renderMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_sim: { value: null },
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D u_sim;
        uniform float u_time;
        uniform vec2 u_resolution;

        // ABSOLUTE COLOR RULE: NO BLACK, NO WHITE, NO GRAYSCALE
        vec3 getHyperpopColor(float t) {
          t = fract(t);
          vec3 c1 = vec3(0.2, 0.0, 0.5); // Deep Indigo/Plum (Shadow)
          vec3 c2 = vec3(0.0, 0.5, 0.4); // Emerald/Teal (Shadow)
          vec3 c3 = vec3(0.9, 0.0, 0.6); // Hot Pink (Mid)
          vec3 c4 = vec3(0.0, 0.9, 0.9); // Electric Cyan (Mid)
          vec3 c5 = vec3(1.0, 0.8, 0.0); // Acid Yellow (High)
          vec3 c6 = vec3(1.0, 0.3, 0.4); // Neon Coral (High)
          
          float step = t * 5.0;
          if (step < 1.0) return mix(c1, c2, step);
          if (step < 2.0) return mix(c2, c3, step - 1.0);
          if (step < 3.0) return mix(c3, c4, step - 2.0);
          if (step < 4.0) return mix(c4, c5, step - 3.0);
          return mix(c5, c6, step - 4.0);
        }

        float sdfRect(vec2 p, vec2 size) {
          vec2 d = abs(p) - size;
          return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
        }

        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

        // Core Scene Generator (Returns raw color for CA processing)
        vec3 getScene(vec2 uv) {
          vec4 sim = texture(u_sim, uv);
          vec2 centered = uv - 0.5;
          float r = length(centered);
          float a = atan(centered.y, centered.x);

          // 1. OP-ART ENGINE (Zebra waves + Labyrinths)
          float opArt = sin(r * 60.0 - u_time * 4.0 + sin(a * 12.0) * 2.0);
          opArt = smoothstep(-0.2, 0.2, opArt);
          float bgPattern = mix(opArt, sim.g, 0.6); // Mix with RD inhibitor
          vec3 col = getHyperpopColor(bgPattern + u_time * 0.05);

          // 2. CUTTLEFISH CHROMATOPHORES (Muscle-actuated Grid)
          vec2 cellUv = floor(uv * 70.0) / 70.0;
          vec2 cellFract = fract(uv * 70.0) - 0.5;
          float cellDist = length(cellFract);
          
          // Neural excitation wave (Passing cloud + Disruptive armor)
          float wave = sin(cellUv.x * 20.0 - u_time * 5.0) * cos(cellUv.y * 15.0 + u_time) * 0.5 + 0.5;
          float activation = texture(u_sim, cellUv).g * 1.5 + wave * 0.4;
          
          float chromSize = clamp(activation * 0.45, 0.0, 0.5);
          float chrom = 1.0 - smoothstep(chromSize - 0.05, chromSize + 0.05, cellDist);
          vec3 chromCol = getHyperpopColor(fract(activation + u_time * 0.2));
          col = mix(col, chromCol, chrom * 0.85);

          // 3. EARLY INTERNET UI SHRINE (Floating Panels & Debris)
          // Warp UI UVs with Op-Art field
          vec2 uiUv = uv + vec2(sin(uv.y * 12.0 + u_time), cos(uv.x * 12.0 - u_time)) * 0.015;
          
          // Codec Macroblock UI shifting
          if (texture(u_sim, floor(uv * 12.0) / 12.0).r > 0.6) uiUv.x += 0.03;

          float uiMask = 0.0;
          vec3 uiCol = vec3(0.0);

          // Panel 1 (Top Left)
          float p1 = sdfRect(uiUv - vec2(0.25, 0.75), vec2(0.18, 0.12));
          if (p1 < 0.0) {
            uiMask = 1.0;
            float bevel = smoothstep(-0.02, 0.0, p1) * 0.5 + 0.5;
            uiCol = getHyperpopColor(0.1); // Deep Plum base
            uiCol = mix(uiCol, getHyperpopColor(0.6), bevel * 0.3); // Chrome bevel
            // Asemic Text Debris
            if (p1 < -0.02) {
              float txt = step(0.8, fract(sin(dot(floor(uiUv * 120.0), vec2(12.3, 45.6))) * 4321.0));
              uiCol = mix(uiCol, getHyperpopColor(0.8), txt * 0.7); // Acid Yellow text
            }
          }

          // Panel 2 (Bottom Right)
          float p2 = sdfRect(uiUv - vec2(0.75, 0.25), vec2(0.15, 0.18));
          if (p2 < 0.0) {
            uiMask = 1.0;
            uiCol = getHyperpopColor(0.4); // Electric Cyan
            // Fake Banner Stripes
            float stripes = step(0.5, sin(uiUv.x * 150.0 + uiUv.y * 150.0));
            uiCol = mix(uiCol, getHyperpopColor(0.3), stripes * 0.5);
            if (uiUv.y > 0.38) uiCol = getHyperpopColor(0.9); // Title bar
          }

          // Scrollbar / Glitter strip
          float scroll = sdfRect(uiUv - vec2(0.95, 0.5), vec2(0.015, 0.4));
          if (scroll < 0.0) {
            uiMask = 1.0;
            float glitter = hash(uiUv * 500.0 + u_time);
            uiCol = getHyperpopColor(glitter);
          }

          col = mix(col, uiCol, uiMask);

          // 4. CENTRAL LIVING CODEC PORTAL (Preserved Anchor)
          float portalDist = length(uv - 0.5); // Unwarped
          float portalMask = 1.0 - smoothstep(0.18, 0.2, portalDist);
          
          if (portalMask > 0.0) {
            float portalRD = texture(u_sim, uv).g;
            float rings = sin(portalDist * 80.0 - u_time * 8.0 + portalRD * 12.0);
            rings = smoothstep(0.0, 0.1, rings);
            
            vec3 pCol = getHyperpopColor(fract(portalDist * 2.5 - u_time * 0.3));
            pCol = mix(pCol, getHyperpopColor(0.6), rings); // Cyan/Pink rings
            
            // Inner glowing eye
            if (portalDist < 0.05) pCol = getHyperpopColor(0.8 + sin(u_time)*0.1);
            
            col = mix(col, pCol, portalMask);
          }

          return col;
        }

        void main() {
          vec2 uv = vUv;

          // DAMAGE: Playback Instability & Raster Tears
          if (hash(vec2(floor(u_time * 6.0), 0.0)) > 0.9) {
            uv.y += 0.01 * sin(u_time * 40.0);
          }
          if (hash(vec2(uv.y * 8.0, floor(u_time * 3.0))) > 0.92) {
            uv.x += 0.04 * cos(u_time * 15.0);
          }

          // CHROMATIC ABERRATION (Lens Dispersion)
          vec2 center = vec2(0.5);
          vec2 dir = uv - center;
          float dist = length(dir);
          float caStrength = 0.03 * pow(dist, 2.0) + 0.005; // Coma-like edge tail

          vec3 tapR = getScene(uv - dir * caStrength);
          vec3 tapG = getScene(uv);
          vec3 tapB = getScene(uv + dir * caStrength * 1.5);

          // DAMAGE: Temporal Ghosting (Double-Image Spectral Ghost)
          vec3 ghost = getScene(uv + vec2(0.05, -0.04) * sin(u_time * 0.7));
          tapR = mix(tapR, ghost, 0.15);
          tapB = mix(tapB, ghost, 0.15);

          // CROSS-PROCESSING: Blend shifted channels
          vec3 finalCol = vec3(
            max(tapR.r, max(tapG.r, tapB.r)),
            max(tapR.g, max(tapG.g, tapB.g)),
            max(tapR.b, max(tapG.b, tapB.b))
          );

          // S-Curve Contrast Boost
          finalCol = smoothstep(0.0, 1.0, finalCol);
          finalCol = finalCol * finalCol * (3.0 - 2.0 * finalCol);

          // DAMAGE: Datamosh History Integration
          float simHist = texture(u_sim, uv).b;
          finalCol = mix(finalCol, getHyperpopColor(simHist), 0.2);

          // DAMAGE: Colored Scanlines
          float scan = sin(uv.y * u_resolution.y * 0.6) * 0.5 + 0.5;
          vec3 scanCol = getHyperpopColor(0.05); // Deep Indigo
          finalCol = mix(finalCol, scanCol, scan * 0.15);

          // ========================================================
          // ABSOLUTE COLOR RULE ENFORCEMENT
          // ========================================================
          // 1. Clamp absolute limits to prevent pure black/white
          finalCol = clamp(finalCol, 0.08, 0.92);

          // 2. Prevent Grayscale by boosting Chroma
          float luma = dot(finalCol, vec3(0.2126, 0.7152, 0.0722));
          vec3 chromaVec = finalCol - luma;
          float chromaMag = length(chromaVec);
          
          if (chromaMag < 0.25) {
            // Inject hyper-saturated color if it gets muddy
            vec3 injectedColor = getHyperpopColor(fract(luma * 2.0 + u_time * 0.1));
            finalCol = mix(finalCol, injectedColor, 0.6 - chromaMag * 2.0);
          }

          // Boost remaining chroma and final safety clamp
          finalCol = luma + (finalCol - luma) * 1.6; 
          fragColor = vec4(clamp(finalCol, 0.08, 0.92), 1.0);
        }
      `
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    simScene.add(quad);
    scene.add(quad.clone());

    canvas.__three = { 
      renderer, camera, scene, simScene, simMat, renderMat, 
      rtA, rtB, frame: 0 
    };
  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
    return;
  }
}

const state = canvas.__three;
if (!state) return;

// Handle Resize
if (state.renderer.getSize(new THREE.Vector2()).width !== grid.width || 
    state.renderer.getSize(new THREE.Vector2()).height !== grid.height) {
  state.renderer.setSize(grid.width, grid.height, false);
  state.rtA.setSize(grid.width, grid.height);
  state.rtB.setSize(grid.width, grid.height);
  state.simMat.uniforms.u_resolution.value.set(grid.width, grid.height);
  state.renderMat.uniforms.u_resolution.value.set(grid.width, grid.height);
}

// Ping-Pong Simulation Loop (4 steps per frame for smooth morphogenesis)
for (let i = 0; i < 4; i++) {
  const readTarget = (state.frame % 2 === 0) ? state.rtA : state.rtB;
  const writeTarget = (state.frame % 2 === 0) ? state.rtB : state.rtA;

  state.simMat.uniforms.u_prev.value = readTarget.texture;
  state.simMat.uniforms.u_time.value = time + (i * 0.002);
  state.simMat.uniforms.u_frame.value = state.frame;

  state.renderer.setRenderTarget(writeTarget);
  state.renderer.render(state.simScene, state.camera);
  
  state.frame++;
}

// Final Composite Render to Screen
const finalRead = (state.frame % 2 === 0) ? state.rtA : state.rtB;
state.renderMat.uniforms.u_sim.value = finalRead.texture;
state.renderMat.uniforms.u_time.value = time;

state.scene.children[0].material = state.renderMat;
state.renderer.setRenderTarget(null);
state.renderer.render(state.scene, state.camera);