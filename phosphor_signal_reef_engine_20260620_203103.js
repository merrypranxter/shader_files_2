try {
  if (!ctx) throw new Error("WebGL2 context not available");

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.autoClear = false;

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    const rtParams = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: false
    };
    
    const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
    const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);

    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    // --- PASS A: The Phosphor Reef Engine (Base Geometry, Datamosh, Feedback) ---
    const fragmentShaderA = `
      in vec2 vUv;
      out vec4 fragColor;
      
      uniform float uTime;
      uniform sampler2D uPrev;
      uniform vec2 uRes;

      // PRNGs
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      float hash21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec2 hash22(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.xx + p3.yz) * p3.zy);
      }

      // Hyperbolic / Mobius Inversion
      vec2 cInvert(vec2 z, vec2 c, float r2) {
        vec2 d = z - c;
        return c + d * (r2 / max(dot(d, d), 0.00001));
      }

      // SDF Box
      float sdBox(vec2 p, vec2 b) {
        vec2 d = abs(p) - b;
        return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
      }

      void main() {
        vec2 uv = vUv;
        vec2 p = (uv - 0.5) * (uRes.x / uRes.y);

        // 1. Autostereogram Wallpaper Shift
        float patternPeriod = 0.15;
        float stereogramDepth = sin(p.y * 15.0 + uTime) * 0.02 + sin(p.x * 5.0 - uTime) * 0.01;
        vec2 stereoUv = uv;
        stereoUv.x = mod(stereoUv.x + stereogramDepth, patternPeriod) / patternPeriod;

        // 2. Cuttlefish Chromatophores
        vec2 cGrid = floor(stereoUv * 12.0);
        vec2 cFract = fract(stereoUv * 12.0) - 0.5;
        // Neural excitation wave
        float cAct = sin(uTime * 5.0 + hash21(cGrid) * 6.28 + length(p)*10.0) * 0.5 + 0.5;
        float cRad = 0.1 * (1.0 + 3.0 * cAct);
        float chromato = smoothstep(cRad, cRad * 0.8, length(cFract));
        
        // Cuttlefish colors: Yellow to Red to Brownish-Plum
        vec3 chromCol = mix(vec3(1.0, 0.8, 0.0), vec3(0.9, 0.1, 0.3), cAct);
        chromCol = mix(vec3(0.1, 0.0, 0.3), chromCol, chromato); // Indigo substrate

        // 3. Hyperbolic Demoscene Reactor (Fractal Dust / Kleinian Limit Set vibe)
        vec2 hp = p;
        float scale = 1.0;
        for(int i = 0; i < 5; i++) {
            hp = abs(hp) - 0.15;
            float r2 = dot(hp, hp);
            float k = 0.6 / max(r2, 0.02);
            hp *= k;
            scale *= k;
            
            float a = uTime * 0.15 + float(i);
            float s = sin(a), c = cos(a);
            hp = vec2(hp.x * c - hp.y * s, hp.x * s + hp.y * c);
        }
        float reactorDist = length(hp) / scale;
        float reactorMask = smoothstep(0.05, 0.01, reactorDist);
        vec3 reactorCol = vec3(
            sin(reactorDist * 50.0 - uTime * 10.0) * 0.5 + 0.5,
            cos(reactorDist * 40.0 + uTime * 8.0) * 0.5 + 0.5,
            sin(reactorDist * 30.0) * 0.5 + 0.5
        );
        // Boost reactor colors to neon
        reactorCol = smoothstep(0.2, 0.8, reactorCol) * vec3(0.0, 1.0, 0.8);

        // 4. Early Internet Debris (Glitchcore Windows)
        float winMask = 0.0;
        vec3 winCol = vec3(0.0);
        for(int i = 0; i < 4; i++) {
            float fi = float(i);
            float wHash = hash(fi + floor(uTime * 1.5));
            vec2 wPos = vec2(sin(wHash * 15.0), cos(wHash * 22.0)) * 0.7;
            vec2 wSize = vec2(0.1 + wHash * 0.1, 0.08 + hash(fi + 1.0) * 0.1);
            
            float wSdf = sdBox(p - wPos, wSize);
            if(wSdf < 0.0) {
                winMask = 1.0;
                float headerSdf = sdBox(p - wPos - vec2(0.0, wSize.y - 0.02), vec2(wSize.x, 0.02));
                if(headerSdf < 0.0) {
                    winCol = vec3(1.0, 0.0, 0.5); // Hot pink header
                } else {
                    winCol = vec3(0.1, 0.8, 1.0); // Cyan body
                }
            }
        }

        // 5. Datamosh / Temporal Echo Feedback
        vec2 moshGrid = floor(uv * vec2(32.0, 24.0)) / vec2(32.0, 24.0);
        vec2 mv = (hash22(moshGrid + floor(uTime * 3.0)) - 0.5) * 0.015;

        // Glitchcore rupture (periodic spikes)
        float glitchBurst = step(0.9, hash(floor(uTime * 6.0)));
        if (glitchBurst > 0.5) {
            mv.x += (hash(uv.y * 50.0) - 0.5) * 0.1; // Horizontal tearing
            mv *= 3.0;
        }

        vec2 fbUv = uv - mv;
        // Zoom into center for feedback tunnel
        fbUv = (fbUv - 0.5) * 0.98 + 0.5;
        // Rotational drift
        float driftAngle = 0.02 * sin(uTime);
        fbUv -= 0.5;
        fbUv = vec2(fbUv.x * cos(driftAngle) - fbUv.y * sin(driftAngle), 
                    fbUv.x * sin(driftAngle) + fbUv.y * cos(driftAngle));
        fbUv += 0.5;

        vec3 prev = texture(uPrev, fbUv).rgb;

        // Composite Base
        vec3 finalCol = chromCol;
        finalCol = mix(finalCol, reactorCol, reactorMask);
        finalCol = mix(finalCol, winCol, winMask);

        // Feedback Blend (Temporal Smear)
        float feedbackWeight = 0.85 + 0.1 * sin(uTime * 2.0);
        finalCol = mix(finalCol, prev, feedbackWeight);

        fragColor = vec4(finalCol, 1.0);
      }
    `;

    // --- PASS B: The Finisher (CRT, Halftone, Aberration, Flares, Color Law) ---
    const fragmentShaderB = `
      in vec2 vUv;
      out vec4 fragColor;
      
      uniform sampler2D uBuffer;
      uniform float uTime;
      uniform vec2 uRes;

      void main() {
        vec2 uv = vUv;

        // 1. CRT Barrel Distortion
        vec2 cc = uv - 0.5;
        float r2 = dot(cc, cc);
        vec2 crtUv = uv + cc * (r2 * 0.2);

        // Border check (chromatic darks, no black)
        if (crtUv.x < 0.0 || crtUv.x > 1.0 || crtUv.y < 0.0 || crtUv.y > 1.0) {
            fragColor = vec4(0.1, 0.0, 0.2, 1.0); // Deep plum border
            return;
        }

        // 2. Chromatic Aberration (Radial + Edge bias)
        float caStrength = 0.03 * r2;
        vec2 caDir = normalize(cc);
        
        float r = texture(uBuffer, crtUv + caDir * caStrength).r;
        float g = texture(uBuffer, crtUv).g;
        float b = texture(uBuffer, crtUv - caDir * caStrength).b;
        vec3 col = vec3(r, g, b);

        // 3. Anamorphic Lens Flares (Horizontal spread)
        vec3 flare = vec3(0.0);
        float flareWeight = 0.0;
        for(int i = -15; i <= 15; i++) {
            float fi = float(i);
            vec2 fUv = crtUv + vec2(fi * 0.02, 0.0);
            if(fUv.x >= 0.0 && fUv.x <= 1.0) {
                vec3 s = texture(uBuffer, fUv).rgb;
                float lum = dot(s, vec3(0.299, 0.587, 0.114));
                float w = smoothstep(0.6, 1.0, lum) * exp(-abs(fi) * 0.15);
                flare += s * w;
                flareWeight += w;
            }
        }
        if(flareWeight > 0.0) {
            flare = (flare / flareWeight) * vec3(0.0, 1.0, 0.8); // Electric cyan flare
            col += flare * 0.8;
        }

        // 4. Halftone Mosaic Overlay
        vec2 htGrid = fract(crtUv * uRes * 0.2) - 0.5;
        float htLum = dot(col, vec3(0.299, 0.587, 0.114));
        float htDot = smoothstep(0.35, 0.2, length(htGrid) - htLum * 0.5);
        col = mix(col * 0.5, col * 1.5, htDot * 0.4);

        // 5. Damage Aesthetics: Head Switching Noise & Tape Skew
        if (crtUv.y < 0.08) {
            float noise = fract(sin(dot(crtUv * uTime, vec2(12.9898, 78.233))) * 43758.5453);
            vec3 staticCol = vec3(noise * 0.9, noise * 0.2, noise * 0.8); // Magenta static
            col = mix(col, staticCol, 0.7);
            
            crtUv.x += (noise - 0.5) * 0.05; // Skew
            col.r = texture(uBuffer, crtUv).r; // Chroma bleed
        }

        // 6. CRT Phosphor Triads & Scanlines
        float scanline = sin(crtUv.y * uRes.y * 3.0) * 0.15 + 0.85;
        col *= scanline;

        float subx = mod(gl_FragCoord.x, 3.0);
        vec3 triad = vec3(
            subx < 1.0 ? 1.0 : 0.6,
            (subx >= 1.0 && subx < 2.0) ? 1.0 : 0.6,
            subx >= 2.0 ? 1.0 : 0.6
        );
        col *= triad;

        // 7. ABSOLUTE COLOR LAW: NO BLACK, NO WHITE DOMINANCE
        float finalLuma = dot(col, vec3(0.299, 0.587, 0.114));
        
        vec3 darkBase = vec3(0.15, 0.0, 0.3);   // Deep Indigo/Plum
        vec3 midBase1 = vec3(0.0, 0.9, 1.0);    // Electric Cyan
        vec3 midBase2 = vec3(1.0, 0.0, 0.6);    // Hot Pink
        vec3 highBase = vec3(0.8, 1.0, 0.0);    // Chartreuse
        
        float tCycle = uTime * 0.5;
        vec3 currentMid = mix(midBase1, midBase2, sin(tCycle) * 0.5 + 0.5);
        
        vec3 safeCol;
        if(finalLuma < 0.3) {
            safeCol = mix(darkBase, currentMid, finalLuma / 0.3);
        } else if(finalLuma < 0.7) {
            safeCol = mix(currentMid, highBase, (finalLuma - 0.3) / 0.4);
        } else {
            safeCol = mix(highBase, vec3(1.0, 0.4, 0.0), (finalLuma - 0.7) / 0.3); // Bright Orange top
        }

        // Force vivid perceptual remapping
        col = mix(col, safeCol, 0.85);

        // Absolute clamping to prevent void black or blown white
        col = max(col, vec3(0.05, 0.0, 0.15));
        col = min(col, vec3(0.95, 1.0, 0.95));

        fragColor = vec4(col, 1.0);
      }
    `;

    const matA = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader: fragmentShaderA,
      uniforms: {
        uTime: { value: 0 },
        uPrev: { value: null },
        uRes: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      depthWrite: false,
      depthTest: false
    });

    const matB = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader: fragmentShaderB,
      uniforms: {
        uTime: { value: 0 },
        uBuffer: { value: null },
        uRes: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      depthWrite: false,
      depthTest: false
    });

    const plane = new THREE.PlaneGeometry(2, 2);
    
    const sceneA = new THREE.Scene();
    sceneA.add(new THREE.Mesh(plane, matA));
    
    const sceneB = new THREE.Scene();
    sceneB.add(new THREE.Mesh(plane, matB));

    canvas.__three = { renderer, camera, sceneA, sceneB, matA, matB, rtA, rtB };
  }

  const { renderer, camera, sceneA, sceneB, matA, matB, rtA, rtB } = canvas.__three;

  // Handle Resize
  if (renderer.getSize(new THREE.Vector2()).x !== grid.width || renderer.getSize(new THREE.Vector2()).y !== grid.height) {
    renderer.setSize(grid.width, grid.height, false);
    rtA.setSize(grid.width, grid.height);
    rtB.setSize(grid.width, grid.height);
    matA.uniforms.uRes.value.set(grid.width, grid.height);
    matB.uniforms.uRes.value.set(grid.width, grid.height);
  }

  // Ping-Pong FBO Swap
  canvas.__three.rtA = rtB;
  canvas.__three.rtB = rtA;

  // Pass A: Compute Engine & Feedback
  matA.uniforms.uTime.value = time;
  matA.uniforms.uPrev.value = rtA.texture;
  renderer.setRenderTarget(rtB);
  renderer.render(sceneA, camera);

  // Pass B: Finisher & Color Law
  matB.uniforms.uTime.value = time;
  matB.uniforms.uBuffer.value = rtB.texture;
  renderer.setRenderTarget(null);
  renderer.render(sceneB, camera);

} catch (e) {
  console.error("Phosphor Signal Reef Engine failed:", e);
}