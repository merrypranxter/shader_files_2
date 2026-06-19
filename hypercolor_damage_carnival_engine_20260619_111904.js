try {
  if (!ctx) throw new Error("WebGL 2 context not available");

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, context: ctx, alpha: true, antialias: false });
    renderer.setPixelRatio(1.0);
    renderer.autoClear = false;

    const sceneEngine = new THREE.Scene();
    const scenePost = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const rtOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false
    };
    const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
    const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

    const engineShader = {
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_feedback: { value: null }
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

        uniform float u_time;
        uniform vec2 u_resolution;
        uniform sampler2D u_feedback;

        // --- MATH & NOISE (Fractals, Caustics, Datamosh) ---
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f*f*(3.0-2.0*f);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        vec2 fbm2(vec2 p) {
            vec2 f = vec2(0.0);
            float amp = 0.5;
            for(int i=0; i<4; i++) {
                f.x += noise(p) * amp;
                f.y += noise(p + vec2(12.4, 54.1)) * amp;
                p *= 2.0;
                amp *= 0.5;
            }
            return f;
        }

        // --- EARLY INTERNET UI SHARDS ---
        float boxSDF(vec2 p, vec2 b) {
            vec2 d = abs(p) - b;
            return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
        }

        // --- STRUCTURAL COLOR (Thin Film / Iridescence) ---
        vec3 structuralColor(float t) {
            vec3 a = vec3(0.5, 0.5, 0.5);
            vec3 b = vec3(0.5, 0.5, 0.5);
            vec3 c = vec3(1.0, 1.0, 1.0);
            vec3 d = vec3(0.00, 0.33, 0.67);
            return a + b * cos(6.28318 * (c * t + d));
        }

        void main() {
            vec2 uv = vUv;
            vec2 p = uv * 2.0 - 1.0;
            p.x *= u_resolution.x / u_resolution.y;

            // --- SLIT-SCAN TIME RIBBONS ---
            float slit = step(0.85, sin(uv.y * 30.0 + u_time * 2.0));
            vec2 moshUv = uv;
            moshUv.x += slit * 0.04 * sin(u_time * 5.0 + uv.y * 10.0);

            // --- DATAMOSH FLOW FIELD ---
            vec2 flow = fbm2(p * 3.0 - u_time * 0.5) * 2.0 - 1.0;
            moshUv -= flow * 0.008; // Drag pixels
            
            // Boundary wrap for infinite feedback
            moshUv = fract(moshUv);
            vec4 feedback = texture(u_feedback, moshUv);

            // --- FRACTAL ENGINE (Central Damage Carnival Reactor) ---
            vec2 z = p;
            vec2 c = vec2(sin(u_time*0.3), cos(u_time*0.2)) * 0.6;
            float trap = 1e10;
            float causticTrap = 1e10;
            
            for(int i=0; i<7; i++) {
                // z^3 + c (multi-fold Newton/Julia hybrid feel)
                vec2 z2 = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y);
                z = vec2(z2.x*z.x - z2.y*z.y, z2.x*z.y + z2.y*z.x) + c;
                
                trap = min(trap, length(z));
                // Caustic network Voronoi lines
                causticTrap = min(causticTrap, abs(z.x + z.y));
            }

            // --- CAUSTIC NETWORKS & STRUCTURAL COLOR ---
            float causticLine = smoothstep(0.05, 0.0, causticTrap);
            vec3 reactorColor = structuralColor(trap * 2.0 - u_time);
            reactorColor += causticLine * vec3(1.0, 0.2, 0.8); // Hot pink caustics

            // Reactor mask
            float reactorMask = smoothstep(1.5, 0.5, length(p) + noise(p*5.0 + u_time)*0.5);
            vec3 layer = reactorColor * reactorMask;

            // --- EARLY INTERNET UI SHARDS ---
            float angle = atan(p.y, p.x);
            float radius = length(p);
            float shardId = floor(angle * 8.0 / 6.28318);
            vec2 shardP = vec2(fract(angle * 8.0 / 6.28318) - 0.5, radius - 0.8 - sin(u_time * 2.0 + shardId));
            float shardDist = boxSDF(shardP, vec2(0.1, 0.05));
            float shardMask = smoothstep(0.02, 0.0, shardDist);
            
            // UI Shard Glitch Texture
            vec3 shardColor = structuralColor(shardId * 0.3 + u_time) * 1.5;
            // Add fake text lines (Asemic glyphs)
            shardColor *= 0.5 + 0.5 * step(0.5, sin(shardP.x * 100.0) * sin(shardP.y * 200.0));
            
            layer = mix(layer, shardColor, shardMask);

            // --- FEEDBACK BLEND (Motion Blur, Ghosting) ---
            // Decay feedback slightly, pull towards saturated magenta/cyan to prevent black
            vec3 feedbackDecay = mix(feedback.rgb, vec3(0.8, 0.0, 0.5), 0.05);
            
            // Rhythmic Overload Bloom
            float overload = step(0.95, sin(u_time * 3.1415));
            layer += overload * vec3(0.0, 1.0, 0.8) * noise(p * 20.0);

            vec3 finalColor = mix(feedbackDecay, layer, clamp(reactorMask + shardMask + overload, 0.05, 1.0));

            fragColor = vec4(finalColor, 1.0);
        }
      `
    };

    const postShader = {
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_t1: { value: null }
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

        uniform float u_time;
        uniform vec2 u_resolution;
        uniform sampler2D u_t1;

        // --- MATH ---
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        // --- OKLAB COLOR SYSTEMS (Perceptual math) ---
        // Simplified perceptual blending & forcing saturated space
        vec3 rgb2hsv(vec3 c) {
            vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
            vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
            vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
            float d = q.x - min(q.w, q.y);
            float e = 1.0e-10;
            return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
        }
        vec3 hsv2rgb(vec3 c) {
            vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
            vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
            return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        // --- HALFTONE & RISOGRAPH ---
        vec2 rot(vec2 p, float a) {
            float s = sin(a), c = cos(a);
            return vec2(p.x*c - p.y*s, p.x*s + p.y*c);
        }
        float halftone(vec2 p, float angle, float scale) {
            vec2 rp = rot(p, angle) * scale;
            return (sin(rp.x) * sin(rp.y)) * 0.5 + 0.5;
        }

        void main() {
            vec2 uv = vUv;

            // --- VHS ANALOG ARTIFACTS & DAMAGE ---
            // Tracking wobble
            float tracking = step(0.95, sin(uv.y * 5.0 - u_time * 3.0));
            vec2 vhsUv = uv;
            vhsUv.x += tracking * 0.03 * sin(uv.y * 200.0 + u_time);
            
            // Tape Dropout (Scratches)
            float dropout = step(0.99, hash(vec2(uv.y * 100.0, u_time * 10.0)));
            vhsUv.x += dropout * 0.1;

            // --- CHROMATIC ABERRATION & MISREGISTRATION ---
            // Radial displacement
            vec2 p = vhsUv * 2.0 - 1.0;
            vec2 dir = normalize(p);
            float dist = length(p);
            float caStrength = 0.02 + 0.03 * sin(u_time * 2.0);
            
            vec2 uvR = vhsUv + dir * caStrength * dist;
            vec2 uvG = vhsUv;
            vec2 uvB = vhsUv - dir * caStrength * dist;

            // Riso Misregistration offsets
            uvR += vec2(0.005, 0.01);
            uvB -= vec2(0.008, 0.005);

            vec3 rawCol;
            rawCol.r = texture(u_t1, uvR).r;
            rawCol.g = texture(u_t1, uvG).g;
            rawCol.b = texture(u_t1, uvB).b;

            // --- HALFTONE MOSAIC ---
            // Convert to spot-color-like channels
            float htScale = 250.0;
            float dotR = halftone(uv, radians(15.0), htScale);
            float dotG = halftone(uv, radians(45.0), htScale);
            float dotB = halftone(uv, radians(75.0), htScale);

            // Multiply blend halftone dots with image
            vec3 htCol = rawCol;
            htCol.r = mix(htCol.r, dotR, 0.3);
            htCol.g = mix(htCol.g, dotG, 0.3);
            htCol.b = mix(htCol.b, dotB, 0.3);

            // --- CROSS PROCESSING & COLOR LAW ENFORCER ---
            // S-Curve for heavy contrast
            htCol = smoothstep(0.1, 0.9, htCol);

            // Convert to HSV to enforce NO BLACK, NO WHITE, NO GRAY
            vec3 hsv = rgb2hsv(htCol);
            
            // Force high saturation (No Gray)
            hsv.y = max(hsv.y, 0.75); 
            
            // Force luminance bounds (No Black, No White)
            // Map 0.0 -> 0.2, 1.0 -> 0.8
            hsv.z = hsv.z * 0.6 + 0.2; 
            
            vec3 safeCol = hsv2rgb(hsv);

            // Deep Chromatic Shadows & Colored Highlights
            vec3 shadowTint = vec3(0.25, 0.0, 0.45);  // Deep Violet/Indigo
            vec3 highlightTint = vec3(1.0, 0.0, 0.5); // Hot Pink
            // Alternatively, Acid Yellow highlights: vec3(0.9, 1.0, 0.1)
            
            float luma = dot(safeCol, vec3(0.299, 0.587, 0.114));
            
            // Glitchcore / Riso Acid Palette mapping
            vec3 finalCol = mix(shadowTint, safeCol, smoothstep(0.0, 0.4, luma));
            finalCol = mix(finalCol, vec3(0.9, 1.0, 0.0), smoothstep(0.7, 1.0, luma)); // Acid Yellow peaks

            // Add Colored VHS Snow (No white static)
            vec3 snow = vec3(hash(uv + u_time), hash(uv - u_time), hash(uv * 2.0 + u_time));
            finalCol += snow * 0.1 * vec3(1.0, 0.0, 0.8); // Magenta snow

            // Colored dropout streaks
            finalCol = mix(finalCol, vec3(0.0, 1.0, 0.8), dropout); // Cyan scratch

            fragColor = vec4(finalCol, 1.0);
        }
      `
    };

    const engineMat = new THREE.ShaderMaterial(engineShader);
    const postMat = new THREE.ShaderMaterial(postShader);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));

    sceneEngine.add(new THREE.Mesh(plane.geometry, engineMat));
    scenePost.add(new THREE.Mesh(plane.geometry, postMat));

    canvas.__three = { renderer, sceneEngine, scenePost, camera, engineMat, postMat, rtA, rtB };
  }

  const { renderer, sceneEngine, scenePost, camera, engineMat, postMat } = canvas.__three;
  let { rtA, rtB } = canvas.__three;

  renderer.setSize(grid.width, grid.height, false);

  if (engineMat && engineMat.uniforms) {
    engineMat.uniforms.u_time.value = time;
    engineMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    engineMat.uniforms.u_feedback.value = rtB.texture;
  }

  // Pass 1: Render Engine to rtA (using rtB as feedback)
  renderer.setRenderTarget(rtA);
  renderer.render(sceneEngine, camera);

  if (postMat && postMat.uniforms) {
    postMat.uniforms.u_time.value = time;
    postMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    postMat.uniforms.u_t1.value = rtA.texture;
  }

  // Pass 2: Render Post to Screen
  renderer.setRenderTarget(null);
  renderer.render(scenePost, camera);

  // Swap buffers for next frame's feedback
  canvas.__three.rtA = rtB;
  canvas.__three.rtB = rtA;

} catch (e) {
  console.error("Hypercolor Damage Carnival Engine Error:", e);
}