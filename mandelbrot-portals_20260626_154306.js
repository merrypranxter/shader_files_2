try {
  if (!canvas.__three) {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.setPixelRatio(1.0); // Keep 1.0 for feedback stability and performance

    const sceneBuffer = new THREE.Scene();
    const scenePost = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const targetOpts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      stencilBuffer: false,
      depthBuffer: false
    };
    const targetA = new THREE.WebGLRenderTarget(grid.width, grid.height, targetOpts);
    const targetB = new THREE.WebGLRenderTarget(grid.width, grid.height, targetOpts);

    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const bufferFrag = `
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec2 u_mouse;
      uniform sampler2D u_prevFrame;
      
      in vec2 vUv;
      out vec4 fragColor;

      const int MAX_ITER = 150;
      const float BAILOUT = 256.0;

      // Complex Math
      vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
      vec2 csqr(vec2 a) { return vec2(a.x*a.x - a.y*a.y, 2.0*a.x*a.y); }
      
      // Acid Candy Palette
      vec3 acidPalette(float t) {
          vec3 a = vec3(0.5, 0.5, 0.5);
          vec3 b = vec3(0.5, 0.5, 0.5);
          vec3 c = vec3(2.0, 1.0, 0.0);
          vec3 d = vec3(0.5, 0.2, 0.8); // Hot pink, cyan, electric blue
          return a + b * cos(6.28318 * (c * t + d));
      }

      // Structural Color / Thin Film Iridescence
      vec3 thinFilm(float d) {
          return 0.5 + 0.5 * cos(6.28318 * (d * 50.0 + vec3(0.0, 0.33, 0.67)));
      }

      // Mesh Gradient Background
      vec3 meshBg(vec2 uv) {
          vec3 c1 = vec3(1.0, 0.0, 0.5);
          vec3 c2 = vec3(0.0, 1.0, 0.8);
          vec3 c3 = vec3(0.8, 1.0, 0.0);
          float w1 = 1.0 / (length(uv - vec2(-0.5, -0.5)) + 0.1);
          float w2 = 1.0 / (length(uv - vec2(0.5, 0.5)) + 0.1);
          float w3 = 1.0 / (length(uv - vec2(-0.5, 0.5)) + 0.1);
          return (c1*w1 + c2*w2 + c3*w3) / (w1+w2+w3);
      }

      // Hash for noise
      float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
          vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
          vec2 p = (vUv - 0.5) * 2.0 * aspect;
          
          // Hypnotic Breathing Zoom
          // Oscillates zoom factor to avoid f32 breakdown while moving deep
          float zoomPhase = sin(u_time * 0.15);
          float zoom = exp(zoomPhase * 3.0 - 0.5);
          
          // Seahorse Valley target
          vec2 focus = vec2(-0.74364388, 0.1318259);
          // Mouse interaction nudges target
          focus += (u_mouse - 0.5) * 0.1 * zoom;

          vec2 c = p * zoom + focus;
          vec2 z = c;

          // Julia Portals in 4 corners
          vec2 absP = abs(p);
          float dCorner = length(absP - vec2(aspect.x * 0.8, 0.8));
          bool inJulia = false;
          
          if (dCorner < 0.35) {
              inJulia = true;
              z = (p - sign(p) * vec2(aspect.x * 0.8, 0.8)) * 3.5;
              // Gentle rotation inside portal
              float a = u_time * 0.4;
              z = vec2(z.x * cos(a) - z.y * sin(a), z.x * sin(a) + z.y * cos(a));
              c = focus; // Seed Julia with current Mandelbrot center
          }

          float iter = 0.0;
          float trap1 = 1e20; // Point trap
          float trap2 = 1e20; // Cross trap
          vec2 dz = vec2(1.0, 0.0);

          for(int i = 0; i < MAX_ITER; i++) {
              // Secondary Burning Ship sparks (mix in absolute value)
              vec2 z_bs = vec2(abs(z.x), abs(z.y));
              z = mix(z, z_bs, 0.03); // Slight mutation for sparks

              dz = 2.0 * cmul(z, dz) + vec2(1.0, 0.0);
              z = csqr(z) + c;

              trap1 = min(trap1, length(z - vec2(0.5, 0.0)));
              trap2 = min(trap2, min(abs(z.x), abs(z.y)));

              if(dot(z,z) > BAILOUT) break;
              iter++;
          }

          vec3 color = vec3(0.0);
          
          if(iter < float(MAX_ITER)) {
              // Smooth escape time
              float log_zn = log(dot(z,z)) * 0.5;
              float nu = log(log_zn / 0.693147) / 0.693147;
              float smooth_iter = iter + 1.0 - nu;

              // Domain coloring contours
              float angle = atan(z.y, z.x);
              float phase = angle / 6.28318 + 0.5;
              float phaseContour = smoothstep(0.0, 0.1, abs(fract(phase * 16.0) - 0.5));
              float magContour = smoothstep(0.0, 0.1, abs(fract(log_zn * 2.5 - u_time) - 0.5));

              // Base spectral coloring
              color = acidPalette(smooth_iter * 0.03 - u_time * 0.2);

              // Orbit trap overlay
              vec3 trapCol = acidPalette(trap1 * 4.0 + u_time);
              color = mix(color, trapCol, exp(-trap1 * 3.0));

              // Contour bands
              color *= mix(0.6, 1.0, phaseContour * magContour);

              // Recursive filigree / Distance Estimator glow + Iridescence
              float de = sqrt(dot(z,z)/dot(dz,dz)) * log_zn;
              vec3 iri = thinFilm(de);
              color += iri * exp(-de * 80.0) * 1.5; // Glowing crisp edges

              // Blend into mesh gradient background
              float escapeAlpha = smoothstep(0.0, 15.0, smooth_iter);
              vec3 bg = meshBg(p * 0.5 + u_time * 0.1);
              color = mix(bg, color, escapeAlpha);

          } else {
              // Deep interior - Cathedral black with subtle trap glow
              color = vec3(0.02, 0.0, 0.05);
              color += vec3(0.5, 0.1, 0.8) * exp(-trap2 * 4.0) * 0.5;
          }

          // Julia Portal Borders
          if (dCorner < 0.37 && dCorner >= 0.35) {
              float border = smoothstep(0.37, 0.36, dCorner) * smoothstep(0.35, 0.36, dCorner);
              color += acidPalette(u_time) * border * 2.0;
          }

          // Datamosh & Feedback logic
          float moshCycle = mod(u_time, 10.0);
          vec2 prevUV = vUv;

          // Controlled datamosh ripple every 10s
          if (moshCycle > 8.8 && moshCycle < 9.2) {
              float n = hash(vUv * 15.0 + u_time);
              prevUV += (vec2(n) - 0.5) * 0.04 * sin((moshCycle - 8.8) * 3.14159 / 0.4);
          }

          // Gentle zoom drift for afterimage trail
          prevUV = (prevUV - 0.5) * 0.995 + 0.5;

          vec3 prevColor = texture(u_prevFrame, prevUV).rgb;
          
          // Retinal persistence blend
          color = mix(color, prevColor, 0.65);

          fragColor = vec4(color, 1.0);
      }
    `;

    const postFrag = `
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform sampler2D u_tDiffuse;
      
      in vec2 vUv;
      out vec4 fragColor;

      float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
          vec2 uv = vUv;
          vec2 toCenter = uv - 0.5;
          float dist = length(toCenter);

          // Chromatic Aberration (stronger at edges)
          float ca = dist * dist * 0.04;
          vec2 uvR = uv - toCenter * ca;
          vec2 uvB = uv + toCenter * ca;

          float r = texture(u_tDiffuse, uvR).r;
          float g = texture(u_tDiffuse, uv).g;
          float b = texture(u_tDiffuse, uvB).b;
          vec3 col = vec3(r, g, b);

          // VHS Scanline Shimmer
          float scanline = sin(uv.y * u_resolution.y * 1.2) * 0.04;
          col -= scanline;

          // Analog Tracking Bend at bottom
          if (uv.y < 0.06) {
              float bend = sin(uv.y * 80.0 + u_time * 15.0) * 0.015;
              col = texture(u_tDiffuse, vec2(uv.x + bend, uv.y)).rgb;
          }

          // Damage Aesthetics: Occasional color-channel tearing
          if (fract(u_time * 0.2) < 0.03 && uv.y > 0.3 && uv.y < 0.4) {
              float tear = (hash(vec2(u_time, uv.y)) - 0.5) * 0.1;
              col.g = texture(u_tDiffuse, uv + vec2(tear, 0.0)).g;
          }

          // White Edge Bloom (Overexposure)
          vec3 bloom = max(vec3(0.0), col - 0.8) * 0.6;
          col += bloom;

          // Vignette
          col *= smoothstep(0.8, 0.3, dist);

          fragColor = vec4(col, 1.0);
      }
    `;

    const bufferMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vertexShader,
      fragmentShader: bufferFrag,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
        u_prevFrame: { value: null }
      },
      depthWrite: false,
      depthTest: false
    });

    const postMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vertexShader,
      fragmentShader: postFrag,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_tDiffuse: { value: null }
      },
      depthWrite: false,
      depthTest: false
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const bufferMesh = new THREE.Mesh(geometry, bufferMat);
    const postMesh = new THREE.Mesh(geometry, postMat);

    sceneBuffer.add(bufferMesh);
    scenePost.add(postMesh);

    canvas.__three = {
      renderer,
      sceneBuffer,
      scenePost,
      camera,
      bufferMat,
      postMat,
      targetA,
      targetB,
      pingPong: true
    };
  }

  const state = canvas.__three;
  const { renderer, sceneBuffer, scenePost, camera, bufferMat, postMat } = state;

  if (renderer.getSize(new THREE.Vector2()).x !== grid.width || renderer.getSize(new THREE.Vector2()).y !== grid.height) {
    renderer.setSize(grid.width, grid.height, false);
    state.targetA.setSize(grid.width, grid.height);
    state.targetB.setSize(grid.width, grid.height);
    bufferMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    postMat.uniforms.u_resolution.value.set(grid.width, grid.height);
  }

  bufferMat.uniforms.u_time.value = time;
  postMat.uniforms.u_time.value = time;
  
  if (mouse) {
    // Smooth mouse interpolation
    const mx = mouse.x / grid.width;
    const my = 1.0 - (mouse.y / grid.height);
    bufferMat.uniforms.u_mouse.value.x += (mx - bufferMat.uniforms.u_mouse.value.x) * 0.05;
    bufferMat.uniforms.u_mouse.value.y += (my - bufferMat.uniforms.u_mouse.value.y) * 0.05;
  }

  // Ping-pong feedback loop
  const readTarget = state.pingPong ? state.targetA : state.targetB;
  const writeTarget = state.pingPong ? state.targetB : state.targetA;

  bufferMat.uniforms.u_prevFrame.value = readTarget.texture;

  renderer.setRenderTarget(writeTarget);
  renderer.render(sceneBuffer, camera);

  postMat.uniforms.u_tDiffuse.value = writeTarget.texture;

  renderer.setRenderTarget(null);
  renderer.render(scenePost, camera);

  state.pingPong = !state.pingPong;

} catch (e) {
  console.error("Fractal Friday Initialization Failed:", e);
  throw e;
}