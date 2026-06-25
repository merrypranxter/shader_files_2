try {
  if (!ctx) throw new Error("WebGL2 context not available");

  // State & Params
  const params = {
    palette: 0,
    glass: 1.0,
    symbols: 1.0,
    depth: 1.0,
    biref: 1.0,
    mouse: new THREE.Vector2(0.5, 0.5),
    click: 0.0,
    targetPalette: 0
  };

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    renderer.autoClear = false;

    // FBO Setup for ping-pong fatigue (impossible colors) and post-processing
    const fboOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false
    };
    
    const rtMain = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOptions);
    const rtFatigue1 = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOptions);
    const rtFatigue2 = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOptions);
    
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    // --- MAIN CATHEDRAL SHADER ---
    const mainMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_mouse: { value: params.mouse },
        u_click: { value: 0 },
        u_palette: { value: 0 },
        u_glass: { value: 1.0 },
        u_symbols: { value: 1.0 },
        u_depth: { value: 1.0 },
        u_biref: { value: 1.0 }
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
        
        uniform float u_time;
        uniform vec2 u_resolution;
        uniform vec2 u_mouse;
        uniform float u_click;
        uniform float u_palette;
        uniform float u_glass;
        uniform float u_symbols;
        uniform float u_depth;
        uniform float u_biref;

        #define PI 3.14159265359

        // Hash & Noise
        float hash12(vec2 p) {
            vec3 p3  = fract(vec3(p.xyx) * .1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
        }
        
        vec2 hash22(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
            p3 += dot(p3, p3.yzx+33.33);
            return fract((p3.xx+p3.yz)*p3.zy);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f*f*(3.0-2.0*f);
            float n = mix(mix(hash12(i+vec2(0.0,0.0)), hash12(i+vec2(1.0,0.0)), f.x),
                          mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), f.x), f.y);
            return n;
        }

        float fbm(vec2 p) {
            float v = 0.0; float a = 0.5;
            for(int i=0; i<4; i++) {
                v += a * noise(p);
                p = mat2(0.8, -0.6, 0.6, 0.8) * p * 2.0;
                a *= 0.5;
            }
            return v;
        }

        // Spectral Color Approximation (Wyman et al. 2013)
        vec3 wavelengthToRGB(float lambda) {
            float t1 = (lambda - 442.0) * ((lambda < 442.0) ? 0.0624 : 0.0374);
            float t2 = (lambda - 599.8) * ((lambda < 599.8) ? 0.0264 : 0.0323);
            float t3 = (lambda - 501.1) * ((lambda < 501.1) ? 0.0490 : 0.0382);
            float X  = 0.362 * exp(-0.5 * t1 * t1) + 1.056 * exp(-0.5 * t2 * t2) - 0.065 * exp(-0.5 * t3 * t3);
            
            float t4 = (lambda - 568.8) * ((lambda < 568.8) ? 0.0213 : 0.0247);
            float t5 = (lambda - 530.9) * ((lambda < 530.9) ? 0.0613 : 0.0322);
            float Y  = 0.821 * exp(-0.5 * t4 * t4) + 0.286 * exp(-0.5 * t5 * t5);
            
            float t6 = (lambda - 437.0) * ((lambda < 437.0) ? 0.0845 : 0.0278);
            float t7 = (lambda - 459.0) * ((lambda < 459.0) ? 0.0385 : 0.0725);
            float Z  = 1.217 * exp(-0.5 * t6 * t6) + 0.681 * exp(-0.5 * t7 * t7);
            
            vec3 XYZ = vec3(X, Y, Z);
            mat3 M = mat3(
                 3.2406, -0.9689,  0.0557,
                -1.5372,  1.8758, -0.2040,
                -0.4986,  0.0415,  1.0570
            );
            vec3 rgb = M * XYZ;
            
            // Soft gamut mapping to preserve saturation
            float lift = min(min(rgb.r, rgb.g), min(rgb.b, 0.0));
            rgb -= lift;
            float mx = max(max(rgb.r, rgb.g), max(rgb.b, 1.0));
            return rgb / mx;
        }

        // Palettes
        vec3 getPalette(float t, float p) {
            vec3 a, b, c, d;
            if (p < 0.5) { // Candy Prism
                a = vec3(0.5, 0.5, 0.5); b = vec3(0.5, 0.5, 0.5);
                c = vec3(1.0, 1.0, 1.0); d = vec3(0.00, 0.33, 0.67);
            } else if (p < 1.5) { // Mineral Slide
                a = vec3(0.5, 0.5, 0.8); b = vec3(0.4, 0.4, 0.2);
                c = vec3(1.0, 1.0, 1.0); d = vec3(0.30, 0.20, 0.20);
            } else if (p < 2.5) { // Neon Alchemy
                a = vec3(0.8, 0.2, 0.5); b = vec3(0.2, 0.8, 0.5);
                c = vec3(1.0, 1.0, 1.0); d = vec3(0.00, 0.10, 0.20);
            } else if (p < 3.5) { // Ultraviolet Aquarium
                a = vec3(0.4, 0.1, 0.7); b = vec3(0.3, 0.4, 0.2);
                c = vec3(1.0, 1.0, 1.0); d = vec3(0.50, 0.60, 0.70);
            } else { // Plasma Fruit
                a = vec3(0.9, 0.4, 0.2); b = vec3(0.1, 0.5, 0.8);
                c = vec3(1.0, 1.0, 1.0); d = vec3(0.10, 0.20, 0.30);
            }
            return a + b * cos(2.0 * PI * (c * t + d));
        }

        // SDFs
        float sdHexagram(vec2 p, float r) {
            const vec3 k = vec3(-0.5, 0.8660254038, 0.5773502692);
            p = abs(p);
            p -= 2.0*min(dot(k.xy,p),0.0)*k.xy;
            p -= 2.0*min(dot(k.yx,p),0.0)*k.yx;
            p -= vec2(clamp(p.x,r*k.z,r*k.y),r);
            return length(p)*sign(p.y);
        }

        float sdCircle(vec2 p, float r) {
            return length(p) - r;
        }

        void main() {
            vec2 uv = (vUv - 0.5) * 2.0;
            uv.x *= u_resolution.x / u_resolution.y;
            vec2 m = (u_mouse - 0.5) * 2.0;
            m.x *= u_resolution.x / u_resolution.y;

            // Domain Warping for Base Cathedral Glass
            vec2 q = vec2(fbm(uv + u_time * 0.1), fbm(uv + vec2(5.2, 1.3)));
            vec2 r = vec2(fbm(uv + 4.0 * q + u_time * 0.15), fbm(uv + 4.0 * q + vec2(8.3, 2.8)));
            float warpNoise = fbm(uv + 4.0 * r);

            // Symmetrical Architecture
            float angle = atan(uv.y, uv.x);
            float dist = length(uv);
            
            // Optical Twist
            float twist = sin(dist * 5.0 - u_time + m.x) * 0.2;
            float symAngle = mod(angle + twist + PI/6.0, PI/3.0) - PI/6.0;
            vec2 symUv = dist * vec2(cos(symAngle), sin(symAngle));

            // SDF Geometry
            float dHex = sdHexagram(symUv, 0.6);
            float dRing = abs(dist - 0.8) - 0.05;
            float dCenter = sdCircle(uv, 0.2 + 0.05 * sin(u_time * 2.0));
            
            float dCathedral = min(min(abs(dHex) - 0.02, dRing), abs(dCenter) - 0.01);
            
            // Birefringence / Michel-Levy Interference
            float thickness = smoothstep(0.1, 0.0, dCathedral) + warpNoise * 0.2;
            float retardance = thickness * (2000.0 + 1500.0 * sin(u_time * 0.3 + dist * 5.0)) * u_biref;
            vec3 birefCol = wavelengthToRGB(retardance + 380.0);

            // Base Color Field (Saturated, no black/white)
            float palT = warpNoise * 0.5 + dist * 0.2 - u_time * 0.1;
            vec3 baseCol = getPalette(palT, u_palette);
            
            // Plasma Filaments
            float plasma = 0.0;
            for(float i=1.0; i<=3.0; i++) {
                float filament = sin(dist * 15.0 * i - u_time * 4.0 * i + angle * 4.0 + r.x * 10.0);
                plasma += smoothstep(0.95, 1.0, filament) / i;
            }
            vec3 plasmaCol = getPalette(palT + 0.5, mod(u_palette + 1.0, 5.0)) * plasma * 2.0;

            // Diffraction Grating Fans (Mouse Interaction)
            float dMouse = length(uv - m);
            float grating = sin(dMouse * 150.0 - u_time * 10.0) * 0.5 + 0.5;
            vec3 diffCol = wavelengthToRGB(380.0 + grating * 350.0);
            float diffMask = smoothstep(0.6, 0.0, dMouse) * (1.0 - smoothstep(0.1, 0.0, dMouse));
            
            // Glass Pattern / Hidden Correlation
            vec2 grid1 = uv * 120.0;
            vec2 warpVec = normalize(symUv + 0.01) * smoothstep(0.05, 0.0, dCathedral) * u_glass;
            vec2 grid2 = (uv + warpVec) * 120.0;
            
            float dot1 = step(0.85, hash12(floor(grid1)));
            float dot2 = step(0.85, hash12(floor(grid2) + 12.34));
            float glassDots = max(dot1, dot2);

            // Chromostereopsis Accents
            vec3 stereoCol = mix(vec3(1.0, 0.0, 0.1), vec3(0.0, 0.2, 1.0), sin(dist * 10.0 - u_time) * 0.5 + 0.5);
            float stereoMask = smoothstep(0.03, 0.0, abs(dHex - 0.1)) * u_depth;

            // Alchemical Symbols
            float symbols = 0.0;
            for(int i=0; i<6; i++) {
                float a = float(i) * PI / 3.0 + u_time * 0.2;
                vec2 pos = vec2(cos(a), sin(a)) * 0.8;
                float dSym = sdHexagram((uv - pos) * 5.0, 0.2);
                symbols += smoothstep(0.05, 0.0, abs(dSym) - 0.01);
            }
            vec3 symCol = getPalette(u_time * 0.5, mod(u_palette + 2.0, 5.0));

            // Composition
            vec3 col = baseCol;
            col = mix(col, birefCol, smoothstep(0.1, 0.0, dCathedral) * 0.8);
            col += plasmaCol;
            col = mix(col, diffCol, diffMask * 0.6);
            col = mix(col, col * 1.5, glassDots * u_glass * 0.4);
            col = mix(col, stereoCol, stereoMask);
            col = mix(col, symCol, clamp(symbols * u_symbols, 0.0, 1.0));

            // Impossible Color Seed (Click Bloom)
            float seed = smoothstep(0.5, 0.0, dMouse) * u_click;
            col = mix(col, wavelengthToRGB(700.0 - seed * 300.0), seed * 0.8);

            // Force saturation / Avoid white and black
            col = clamp(col, 0.15, 0.95);
            
            // Simultaneous contrast enhancement (local variance)
            col *= 0.9 + 0.2 * sin(uv.x * 50.0) * sin(uv.y * 50.0);

            fragColor = vec4(col, 1.0);
        }
      `
    });

    // --- FATIGUE / FEEDBACK SHADER ---
    const fatigueMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_main: { value: null },
        u_prev: { value: null }
      },
      vertexShader: `
        out vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D u_main;
        uniform sampler2D u_prev;
        void main() {
            vec4 mainCol = texture(u_main, vUv);
            vec4 prevCol = texture(u_prev, vUv);
            // Exponential moving average for retinal fatigue
            fragColor = mix(prevCol, mainCol, 0.02);
        }
      `
    });

    // --- POST-PROCESS SHADER (Impossible Colors & Chromatic Aberration) ---
    const postMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_main: { value: null },
        u_fatigue: { value: null },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader: `
        out vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D u_main;
        uniform sampler2D u_fatigue;
        uniform vec2 u_resolution;

        void main() {
            vec4 mainCol = texture(u_main, vUv);
            vec4 fatCol = texture(u_fatigue, vUv);

            // Lateral Chromatic Aberration
            vec2 dir = normalize(vUv - 0.5);
            float ca = 0.006;
            vec3 caCol;
            caCol.r = texture(u_main, vUv + dir * ca).r;
            caCol.g = mainCol.g;
            caCol.b = texture(u_main, vUv - dir * ca).b;

            // Opponent Process (Impossible Colors)
            // Subtracting the fatigue pushes the current color into hyper-saturated complementary space
            vec3 finalCol = caCol + (caCol - fatCol.rgb) * 0.8;

            // Colored Bloom Approximation (boost saturation of brights)
            float lum = dot(finalCol, vec3(0.2126, 0.7152, 0.0722));
            vec3 bloom = max(finalCol - 0.5, 0.0) * 1.5;
            finalCol += bloom;

            // Clamp to maintain saturated jewel tones, avoid pure white/black
            finalCol = clamp(finalCol, 0.1, 0.95);
            
            // Saturation boost
            finalCol = mix(vec3(lum), finalCol, 1.3);

            fragColor = vec4(finalCol, 1.0);
        }
      `
    });

    const meshMain = new THREE.Mesh(geometry, mainMat);
    const meshFatigue = new THREE.Mesh(geometry, fatigueMat);
    const meshPost = new THREE.Mesh(geometry, postMat);

    const sceneMain = new THREE.Scene(); sceneMain.add(meshMain);
    const sceneFatigue = new THREE.Scene(); sceneFatigue.add(meshFatigue);
    const scenePost = new THREE.Scene(); scenePost.add(meshPost);

    canvas.__three = {
      renderer, camera,
      rtMain, rtFatigue1, rtFatigue2,
      sceneMain, sceneFatigue, scenePost,
      mainMat, fatigueMat, postMat,
      pingPong: true
    };

    // Event Listeners
    window.addEventListener('mousemove', (e) => {
      params.mouse.x = e.clientX / window.innerWidth;
      params.mouse.y = 1.0 - (e.clientY / window.innerHeight);
    });
    
    window.addEventListener('mousedown', () => params.click = 1.0);
    window.addEventListener('mouseup', () => params.click = 0.0);
    
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'c') params.targetPalette = (params.targetPalette + 1) % 5;
      if (key === 'g') params.glass = params.glass > 0.5 ? 0.0 : 1.0;
      if (key === 'a') params.symbols = params.symbols > 0.5 ? 0.0 : 1.0;
      if (key === 'd') params.depth = params.depth > 0.5 ? 0.0 : 1.0;
      if (key === 'b') params.biref = params.biref > 0.5 ? 0.0 : 1.0;
    });
  }

  const t = canvas.__three;
  
  // Smooth parameter transitions
  params.palette += (params.targetPalette - params.palette) * 0.05;
  
  // Update Uniforms
  if (t.mainMat && t.mainMat.uniforms) {
    t.mainMat.uniforms.u_time.value = time;
    t.mainMat.uniforms.u_mouse.value = params.mouse;
    t.mainMat.uniforms.u_click.value += (params.click - t.mainMat.uniforms.u_click.value) * 0.1;
    t.mainMat.uniforms.u_palette.value = params.palette;
    t.mainMat.uniforms.u_glass.value += (params.glass - t.mainMat.uniforms.u_glass.value) * 0.1;
    t.mainMat.uniforms.u_symbols.value += (params.symbols - t.mainMat.uniforms.u_symbols.value) * 0.1;
    t.mainMat.uniforms.u_depth.value += (params.depth - t.mainMat.uniforms.u_depth.value) * 0.1;
    t.mainMat.uniforms.u_biref.value += (params.biref - t.mainMat.uniforms.u_biref.value) * 0.1;
  }

  // Handle Resize
  if (t.renderer.getSize(new THREE.Vector2()).x !== grid.width || t.renderer.getSize(new THREE.Vector2()).y !== grid.height) {
    t.renderer.setSize(grid.width, grid.height, false);
    t.rtMain.setSize(grid.width, grid.height);
    t.rtFatigue1.setSize(grid.width, grid.height);
    t.rtFatigue2.setSize(grid.width, grid.height);
    t.mainMat.uniforms.u_resolution.value.set(grid.width, grid.height);
    t.postMat.uniforms.u_resolution.value.set(grid.width, grid.height);
  }

  // Ping-Pong Buffers
  const rtFatigueRead = t.pingPong ? t.rtFatigue1 : t.rtFatigue2;
  const rtFatigueWrite = t.pingPong ? t.rtFatigue2 : t.rtFatigue1;

  // Pass 1: Render Main Cathedral
  t.renderer.setRenderTarget(t.rtMain);
  t.renderer.render(t.sceneMain, t.camera);

  // Pass 2: Render Fatigue / Accumulation
  t.fatigueMat.uniforms.u_main.value = t.rtMain.texture;
  t.fatigueMat.uniforms.u_prev.value = rtFatigueRead.texture;
  t.renderer.setRenderTarget(rtFatigueWrite);
  t.renderer.render(t.sceneFatigue, t.camera);

  // Pass 3: Post Process to Screen
  t.postMat.uniforms.u_main.value = t.rtMain.texture;
  t.postMat.uniforms.u_fatigue.value = rtFatigueWrite.texture;
  t.renderer.setRenderTarget(null);
  t.renderer.render(t.scenePost, t.camera);

  // Swap
  t.pingPong = !t.pingPong;

} catch (e) {
  console.error("Chimeric Prism Cathedral Error:", e);
}