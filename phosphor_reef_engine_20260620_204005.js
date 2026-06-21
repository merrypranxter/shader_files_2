if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.setPixelRatio(1.0); // Keep 1.0 for pixel/glitch aesthetics

    // Render Targets for Ping-Pong Feedback (Datamosh / Cuttlefish memory)
    const rtOptions = {
      minFilter: THREE.NearestFilter, // Nearest for datamosh/glitch feel
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType, // Float for accumulation/feedback
      depthBuffer: false,
      stencilBuffer: false
    };
    
    let rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
    let rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    // -------------------------------------------------------------------------
    // PASS 1: REACTOR & FEEDBACK ENGINE (Buffer Shader)
    // Fuses: Sacred Geometry, Hyperbolic Tilings, Mycelial Networks, Datamosh, Cuttlefish, Autostereogram
    // -------------------------------------------------------------------------
    const bufferShader = {
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

        uniform float u_time;
        uniform vec2 u_resolution;
        uniform sampler2D u_prevFrame;

        #define PI 3.14159265359
        #define PHI 1.61803398875

        // ---- THE-LISTS / Math Utilities ----
        vec2 hash22(vec2 p) {
            p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
            return fract(sin(p)*43758.5453);
        }
        float hash12(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        
        // Complex Math for Hyperbolic transformations
        vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
        vec2 cdiv(vec2 a, vec2 b) { float d = dot(b,b); return vec2(dot(a,b), a.y*b.x - a.x*b.y)/d; }
        vec2 conj(vec2 z) { return vec2(z.x, -z.y); }

        // ---- Hyperbolic Geometry (Mobius Transform) ----
        vec2 mobius(vec2 z, vec2 a) {
            // z -> (z - a) / (1 - conj(a)*z)
            vec2 num = z - a;
            vec2 den = vec2(1.0, 0.0) - cmul(conj(a), z);
            return cdiv(num, den);
        }

        // ---- Sacred Geometry SDFs ----
        float sdVesica(vec2 p, float r, float d) {
            p = abs(p);
            float b = sqrt(r*r - d*d);
            return ((p.y-b)*d > p.x*b) ? length(p-vec2(0.0,b)) : length(p-vec2(-d,0.0))-r;
        }

        float flowerOfLife(vec2 p, float r) {
            float d = 100.0;
            // Center + 6 surrounding
            d = min(d, abs(length(p) - r));
            for(int i=0; i<6; i++) {
                float a = float(i) * PI / 3.0;
                vec2 center = vec2(cos(a), sin(a)) * r;
                d = min(d, abs(length(p - center) - r));
            }
            return d;
        }

        // ---- Mycelial Networks (Domain Warped Noise) ----
        float fbm(vec2 p) {
            float f = 0.0;
            float amp = 0.5;
            for(int i=0; i<4; i++) {
                f += amp * abs(fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453) * 2.0 - 1.0);
                p *= 2.0;
                amp *= 0.5;
            }
            return f;
        }

        void main() {
            vec2 uv = vUv;
            vec2 p = (uv - 0.5) * 2.0;
            p.x *= u_resolution.x / u_resolution.y;

            // 1. Hyperbolic Deformation (Pulsing)
            vec2 mobiusParam = vec2(sin(u_time*0.5)*0.3, cos(u_time*0.3)*0.3);
            vec2 hp = mobius(p, mobiusParam);

            // 2. Sacred Geometry Reactor Core
            float fol = flowerOfLife(hp * 2.0, 0.5);
            float vesica = sdVesica(hp * 2.0, 0.6, 0.3);
            float coreDist = min(fol, abs(vesica));
            
            // 3. Mycelial Growth (Anastomosis)
            vec2 myceliumWarp = p + vec2(fbm(p*3.0+u_time), fbm(p*3.0-u_time));
            float hyphae = fbm(myceliumWarp * 10.0);
            float network = smoothstep(0.4, 0.45, hyphae) - smoothstep(0.45, 0.5, hyphae);

            // 4. Autostereogram / Depth Shift
            // Depth map based on SDF and Network
            float depth = 1.0 - clamp(coreDist * 2.0 - network*0.5, 0.0, 1.0);
            float E = 0.1; // Pattern period
            float mu = 0.6; // Depth scale
            float sep = E * (1.0 - mu * depth) / (2.0 - mu * depth);
            
            // 5. Datamosh / Temporal Echo / Motion Vectors
            // Calculate pseudo motion vectors from noise and gradients
            vec2 motionVec = vec2(
                fbm(p * 5.0 + u_time) - 0.5,
                fbm(p * 5.0 - u_time) - 0.5
            ) * 0.02;
            
            // Glitchcore / Early Internet: Periodic macroblock quantization
            vec2 sampleUV = uv;
            if (fract(u_time * 2.0) > 0.8) { // Glitch burst
                float blocks = 32.0;
                sampleUV = floor(sampleUV * blocks) / blocks;
                motionVec *= 5.0; // Exaggerate motion during glitch
            }

            // Apply autostereogram shift to sampling
            vec2 shiftedUV = sampleUV - vec2(sep, 0.0) - motionVec;
            
            // Read previous frame (Temporal Echo)
            vec4 prevFrame = texture(u_prevFrame, shiftedUV);

            // 6. Cuttlefish Chromatics (Chromatophores)
            // Generate cellular spots that expand based on previous frame luminance
            vec2 cellGrid = fract(p * 15.0) - 0.5;
            vec2 cellId = floor(p * 15.0);
            float cellHash = hash12(cellId);
            float prevLum = dot(prevFrame.rgb, vec3(0.299, 0.587, 0.114));
            // Activation grows the pigment sac
            float activation = mix(0.1, 0.9, prevLum + network); 
            float chromatophore = smoothstep(activation, activation - 0.05, length(cellGrid));

            // 7. Assemble the Signal
            // Base color from Sacred Geo / Reactor
            vec3 reactorCol = vec3(0.0);
            reactorCol += vec3(1.0, 0.2, 0.6) * exp(-coreDist * 10.0); // Hot pink core
            reactorCol += vec3(0.1, 0.8, 1.0) * network; // Cyan mycelium
            
            // Inject Cuttlefish pigments (Yellow, Red, Brown -> mapped to our vivid palette)
            vec3 pigmentCol = mix(vec3(0.8, 0.9, 0.0), vec3(0.9, 0.1, 0.2), cellHash);
            reactorCol = mix(reactorCol, pigmentCol, chromatophore * 0.7);

            // Accumulate and Decay (Feedback loop)
            float decay = 0.92; // Phosphor persistence
            vec3 finalColor = max(reactorCol, prevFrame.rgb * decay); // Max blend for trails

            fragColor = vec4(finalColor, 1.0);
        }
      `
    };

    // -------------------------------------------------------------------------
    // PASS 2: DISPLAY & OPTICS (Screen Shader)
    // Fuses: CRT Phosphor, Anamorphic Flares, Chromatic Aberration, Halftone, Glitchcore, Color Systems
    // -------------------------------------------------------------------------
    const screenShader = {
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

        uniform float u_time;
        uniform vec2 u_resolution;
        uniform sampler2D u_buffer;

        // ---- Damage Aesthetics / CRT Geometry ----
        vec2 barrelDistortion(vec2 uv, float k) {
            vec2 p = uv - 0.5;
            float r2 = dot(p, p);
            return p * (1.0 + k * r2) + 0.5;
        }

        // ---- Anamorphic Lens Flares ----
        vec3 anamorphicFlare(sampler2D tex, vec2 uv) {
            vec3 flare = vec3(0.0);
            float samples = 15.0;
            float spread = 0.2;
            for(float i = -samples; i <= samples; i++) {
                float weight = exp(-abs(i) * 0.2);
                vec2 offset = vec2(i * spread / samples, 0.0);
                vec3 s = texture(tex, uv + offset).rgb;
                // Bright pass threshold
                float lum = dot(s, vec3(0.299, 0.587, 0.114));
                flare += s * smoothstep(0.6, 1.0, lum) * weight;
            }
            return flare * vec3(0.1, 0.5, 1.0); // Spectral blue/cyan tint
        }

        // ---- Halftone Mosaic ----
        float halftone(vec2 uv, float lum) {
            vec2 grid = fract(uv * u_resolution.x * 0.2) - 0.5;
            float radius = sqrt(lum) * 0.7;
            return smoothstep(radius, radius - 0.1, length(grid));
        }

        // ---- Early Internet / Glitchcore UI Debris ----
        float uiDebris(vec2 uv) {
            float v = 0.0;
            // Fake window borders
            if (abs(uv.x - 0.1) < 0.002 && uv.y > 0.2 && uv.y < 0.8) v += 1.0;
            if (abs(uv.y - 0.8) < 0.002 && uv.x > 0.1 && uv.x < 0.9) v += 1.0;
            // Blinking cursor/block
            vec2 grid = floor(uv * 20.0);
            if (fract(sin(dot(grid, vec2(12.9898, 78.233))) * 43758.5453 + u_time) > 0.98) v += 1.0;
            return v;
        }

        // ---- Color Systems (OKLab perceptual mapping & Safety) ----
        // Convert to a chromatic dark/bright palette, forbidding pure black/white
        vec3 mapPalette(vec3 col, vec2 uv) {
            float lum = dot(col, vec3(0.299, 0.587, 0.114));
            
            // Chromatic Darks: Indigo, Plum, Peacock Blue
            vec3 dark1 = vec3(0.15, 0.0, 0.3);  // Indigo
            vec3 dark2 = vec3(0.0, 0.2, 0.25);  // Deep Teal
            vec3 dark = mix(dark1, dark2, sin(uv.x * 5.0 + u_time)*0.5+0.5);
            
            // Chromatic Brights: Hot Pink, Electric Cyan, Acid Yellow, Chartreuse
            vec3 bright1 = vec3(1.0, 0.05, 0.5); // Hot Pink
            vec3 bright2 = vec3(0.0, 1.0, 0.8);  // Electric Cyan
            vec3 bright3 = vec3(0.8, 1.0, 0.0);  // Chartreuse
            
            float mixFactor = sin(uv.y * 3.0 - u_time)*0.5+0.5;
            vec3 bright = mix(bright1, mix(bright2, bright3, mixFactor), fract(u_time*0.1));

            // Map luminance to our new colorful range
            vec3 mapped = mix(dark, bright, smoothstep(0.1, 0.9, lum));
            
            // Add original color back slightly for complexity, but tinted
            mapped = mix(mapped, col * vec3(1.2, 0.8, 1.5), 0.3);

            // SAFETY CLAMP: No pure black, no pure white
            return clamp(mapped, vec3(0.1, 0.05, 0.15), vec3(0.95, 0.9, 0.95));
        }

        void main() {
            vec2 uv = vUv;

            // CRT Geometry (Barrel)
            vec2 crtUV = barrelDistortion(uv, 0.15);
            
            // Edge vignette / tube falloff
            if (crtUV.x < 0.0 || crtUV.x > 1.0 || crtUV.y < 0.0 || crtUV.y > 1.0) {
                fragColor = vec4(0.05, 0.0, 0.1, 1.0); // Chromatic dark edge
                return;
            }

            // Chromatic Aberration (Radial)
            vec2 dir = crtUV - 0.5;
            float ca = 0.02 * length(dir);
            float r = texture(u_buffer, crtUV + dir * ca).r;
            float g = texture(u_buffer, crtUV).g;
            float b = texture(u_buffer, crtUV - dir * ca).b;
            vec3 baseCol = vec3(r, g, b);

            // Anamorphic Flares
            vec3 flare = anamorphicFlare(u_buffer, crtUV);
            baseCol += flare * 0.8;

            // Halftone Mosaic Integration
            float lum = dot(baseCol, vec3(0.299, 0.587, 0.114));
            float ht = halftone(crtUV, lum);
            baseCol = mix(baseCol, baseCol * ht * 1.5, 0.3); // Blend halftone texture

            // Glitchcore UI Debris
            float debris = uiDebris(crtUV);
            baseCol = mix(baseCol, vec3(1.0, 0.9, 0.1), debris); // Acid yellow debris

            // Color Systems: Enforce Chromatic Palette (No Black/White)
            vec3 finalCol = mapPalette(baseCol, crtUV);

            // CRT Phosphor Mask & Scanlines
            float scanline = 0.5 + 0.5 * sin(crtUV.y * u_resolution.y * 3.14159);
            finalCol *= mix(0.8, 1.0, scanline);
            
            float triad = mod(gl_FragCoord.x, 3.0);
            vec3 mask = vec3(
                smoothstep(1.0, 0.0, abs(triad - 0.5)),
                smoothstep(1.0, 0.0, abs(triad - 1.5)),
                smoothstep(1.0, 0.0, abs(triad - 2.5))
            );
            // Don't let mask go to pure black
            mask = mix(vec3(1.0), mask, 0.4); 
            finalCol *= mask;

            fragColor = vec4(finalCol, 1.0);
        }
      `
    };

    // Materials
    const bufferMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_prevFrame: { value: null }
      },
      vertexShader: bufferShader.vertexShader,
      fragmentShader: bufferShader.fragmentShader
    });

    const screenMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_buffer: { value: null }
      },
      vertexShader: screenShader.vertexShader,
      fragmentShader: screenShader.fragmentShader
    });

    // Scenes
    const bufferScene = new THREE.Scene();
    const bufferMesh = new THREE.Mesh(geometry, bufferMaterial);
    bufferScene.add(bufferMesh);

    const screenScene = new THREE.Scene();
    const screenMesh = new THREE.Mesh(geometry, screenMaterial);
    screenScene.add(screenMesh);

    // Save to canvas object for persistence
    canvas.__three = {
      renderer,
      camera,
      bufferScene,
      screenScene,
      bufferMaterial,
      screenMaterial,
      rtA,
      rtB
    };
  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
    // Fallback to 2D canvas if WebGL fails (to satisfy output requirements)
    if (ctx && ctx instanceof CanvasRenderingContext2D) {
      ctx.fillStyle = "#ff0080";
      ctx.fillRect(0, 0, grid.width, grid.height);
      ctx.fillStyle = "#00ffff";
      ctx.fillText("WebGL Failed", 20, 20);
    }
    return;
  }
}

const { renderer, camera, bufferScene, screenScene, bufferMaterial, screenMaterial, rtA, rtB } = canvas.__three;

if (bufferMaterial && bufferMaterial.uniforms && bufferMaterial.uniforms.u_time) {
  // Update Uniforms
  bufferMaterial.uniforms.u_time.value = time;
  bufferMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
  bufferMaterial.uniforms.u_prevFrame.value = rtB.texture; // Read from B

  screenMaterial.uniforms.u_time.value = time;
  screenMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
  screenMaterial.uniforms.u_buffer.value = rtA.texture; // Read from A

  // Pass 1: Render Reactor/Feedback to rtA
  renderer.setRenderTarget(rtA);
  renderer.render(bufferScene, camera);

  // Pass 2: Render Screen/Post-FX to Canvas
  renderer.setRenderTarget(null);
  renderer.render(screenScene, camera);

  // Ping-Pong swap
  const temp = canvas.__three.rtA;
  canvas.__three.rtA = canvas.__three.rtB;
  canvas.__three.rtB = temp;
}