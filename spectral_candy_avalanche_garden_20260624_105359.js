try {
  if (!ctx) throw new Error("WebGL context not available");

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Check for float texture support needed for FBOs
    const gl = renderer.getContext();
    if (!gl.getExtension('EXT_color_buffer_float')) {
      console.warn("EXT_color_buffer_float not supported, falling back to HalfFloatType");
    }

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    // Render targets for ping-pong
    const rtParams = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false
    };
    
    const rtSimA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
    const rtSimB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
    const rtAfterA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
    const rtAfterB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);

    // WFC CPU Data Texture
    const wfcSize = 64;
    const wfcData = new Uint8Array(wfcSize * wfcSize * 4);
    const wfcTex = new THREE.DataTexture(wfcData, wfcSize, wfcSize, THREE.RGBAFormat, THREE.UnsignedByteType);
    wfcTex.minFilter = THREE.NearestFilter;
    wfcTex.magFilter = THREE.NearestFilter;
    wfcTex.needsUpdate = true;

    // Common Vertex Shader
    const vs = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    // 1. Simulation Pass (Sandpile + Fluid energy)
    const fsSim = `
      in vec2 vUv;
      out vec4 fragColor;
      uniform sampler2D u_sim;
      uniform vec2 u_res;
      uniform vec2 u_mouse;
      uniform float u_mouseDown;
      uniform float u_time;

      float rand(vec2 co) {
          return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        vec2 texel = 1.0 / u_res;
        vec4 state = texture(u_sim, vUv);
        float grains = state.r;
        float energy = state.g;

        float outGrains = floor(grains / 4.0);
        float inGrains = 
            floor(texture(u_sim, vUv + vec2(texel.x, 0.0)).r / 4.0) +
            floor(texture(u_sim, vUv - vec2(texel.x, 0.0)).r / 4.0) +
            floor(texture(u_sim, vUv + vec2(0.0, texel.y)).r / 4.0) +
            floor(texture(u_sim, vUv - vec2(0.0, texel.y)).r / 4.0);

        float nextGrains = grains - 4.0 * outGrains + inGrains;
        float nextEnergy = energy * 0.96 + outGrains * 0.8;

        // Auto emitters (wandering)
        vec2 p1 = vec2(0.5 + 0.3 * cos(u_time * 0.7), 0.5 + 0.3 * sin(u_time * 1.1));
        vec2 p2 = vec2(0.5 + 0.4 * sin(u_time * 0.5), 0.5 + 0.2 * cos(u_time * 1.3));
        if (distance(vUv, p1) < 0.015) nextGrains += 1.0 + rand(vUv+u_time);
        if (distance(vUv, p2) < 0.015) nextGrains += 1.0 + rand(vUv-u_time);

        // Mouse injection
        if (u_mouseDown > 0.5 && distance(vUv, u_mouse) < 0.04) {
            nextGrains += 3.0 * rand(vUv + u_time);
            nextEnergy += 1.0;
        }

        fragColor = vec4(nextGrains, min(nextEnergy, 5.0), 0.0, 1.0);
      }
    `;

    // 2. Render + Afterimage Pass (The Candy Garden)
    const fsRender = `
      in vec2 vUv;
      out vec4 fragColor;
      
      uniform sampler2D u_sim;
      uniform sampler2D u_wfc;
      uniform sampler2D u_after;
      uniform float u_time;
      uniform vec2 u_res;
      uniform float u_geomancy;
      uniform float u_palette;

      const float PI = 3.14159265359;

      // OKLab Conversions
      vec3 sRGB_to_linear(vec3 c) {
          vec3 b1 = c / 12.92;
          vec3 b2 = pow((c + 0.055) / 1.055, vec3(2.4));
          return mix(b1, b2, step(vec3(0.04045), c));
      }
      vec3 linear_to_sRGB(vec3 c) {
          vec3 b1 = c * 12.92;
          vec3 b2 = 1.055 * pow(c, vec3(1.0/2.4)) - 0.055;
          return mix(b1, b2, step(vec3(0.0031308), c));
      }
      vec3 linearSRGB_to_OKLab(vec3 c) {
          float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
          float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
          float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
          l = pow(max(l, 0.0), 1.0/3.0);
          m = pow(max(m, 0.0), 1.0/3.0);
          s = pow(max(s, 0.0), 1.0/3.0);
          return vec3(
              0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
              1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
              0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
          );
      }
      vec3 OKLab_to_linearSRGB(vec3 c) {
          float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
          float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
          float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
          float l = l_ * l_ * l_;
          float m = m_ * m_ * m_;
          float s = s_ * s_ * s_;
          return vec3(
               4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
              -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
              -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
          );
      }
      vec3 oklabMix(vec3 c1, vec3 c2, float t) {
          vec3 l1 = linearSRGB_to_OKLab(sRGB_to_linear(c1));
          vec3 l2 = linearSRGB_to_OKLab(sRGB_to_linear(c2));
          return clamp(linear_to_sRGB(OKLab_to_linearSRGB(mix(l1, l2, t))), 0.0, 1.0);
      }

      // Spectral Color (Wyman et al. 2013 fit)
      float lobe(float x, float alpha, float mu, float sL, float sR) {
          float s = x < mu ? sL : sR;
          float t = (x - mu) / s;
          return alpha * exp(-0.5 * t * t);
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
          float lift = min(min(rgb.r, rgb.g), min(rgb.b, 0.0));
          rgb -= lift;
          float denom = max(max(rgb.r, rgb.g), max(rgb.b, 1.0));
          rgb = clamp(rgb / denom, 0.0, 1.0);
          return linear_to_sRGB(rgb);
      }

      // Thin-film interference
      vec3 thinFilm(float d) {
          float n = 1.45; 
          float path = 2.0 * n * d; 
          float r = pow(sin(PI * path / 630.0), 2.0);
          float g = pow(sin(PI * path / 530.0), 2.0);
          float b = pow(sin(PI * path / 460.0), 2.0);
          return vec3(r, g, b);
      }

      float sdArc(vec2 p, vec2 center, float r, float w) {
          return abs(length(p - center) - r) - w;
      }

      float truchet(vec2 uv, float type, float w) {
          if (type < 0.25) {
              return min(sdArc(uv, vec2(0.0), 0.5, w), sdArc(uv, vec2(1.0), 0.5, w));
          } else if (type < 0.5) {
              return min(sdArc(uv, vec2(1.0, 0.0), 0.5, w), sdArc(uv, vec2(0.0, 1.0), 0.5, w));
          } else if (type < 0.75) {
              return min(abs(uv.x - 0.5) - w, abs(uv.y - 0.5) - w);
          } else {
              return length(uv - vec2(0.5)) - w * 2.0;
          }
      }

      float geomancy(vec2 uv, float id, float w) {
          int val = int(id * 15.0);
          float d = 1.0;
          for(int i=0; i<4; i++) {
              float lineY = 0.2 + float(i)*0.2;
              int bit = (val >> (3-i)) & 1;
              if (bit == 1) {
                  d = min(d, length(uv - vec2(0.5, lineY)) - w);
              } else {
                  d = min(d, length(uv - vec2(0.3, lineY)) - w);
                  d = min(d, length(uv - vec2(0.7, lineY)) - w);
              }
          }
          return d;
      }

      vec3 getPaletteColor(float idx, float t) {
          if (idx < 0.5) { // Candy Spectral
              vec3 c1 = vec3(0.9, 0.0, 0.5); // Magenta
              vec3 c2 = vec3(0.0, 0.8, 0.9); // Cyan
              vec3 c3 = vec3(1.0, 0.7, 0.0); // Neon Yellow
              vec3 c4 = vec3(0.5, 0.0, 1.0); // Violet
              if (t < 0.33) return oklabMix(c1, c2, t*3.0);
              if (t < 0.66) return oklabMix(c2, c3, (t-0.33)*3.0);
              return oklabMix(c3, c4, (t-0.66)*3.0);
          } else if (idx < 1.5) { // Opal Beetle
              vec3 c1 = vec3(0.0, 0.9, 0.4); // Acid Green
              vec3 c2 = vec3(0.0, 0.5, 0.8); // Teal
              vec3 c3 = vec3(0.6, 0.0, 0.8); // Purple
              vec3 c4 = vec3(1.0, 0.3, 0.4); // Coral
              if (t < 0.33) return oklabMix(c1, c2, t*3.0);
              if (t < 0.66) return oklabMix(c2, c3, (t-0.33)*3.0);
              return oklabMix(c3, c4, (t-0.66)*3.0);
          } else { // Neon Fruit
              vec3 c1 = vec3(1.0, 0.3, 0.0); // Orange
              vec3 c2 = vec3(0.6, 1.0, 0.0); // Lime
              vec3 c3 = vec3(1.0, 0.0, 0.6); // Hot Pink
              vec3 c4 = vec3(0.0, 0.9, 0.7); // Turquoise
              if (t < 0.33) return oklabMix(c1, c2, t*3.0);
              if (t < 0.66) return oklabMix(c2, c3, (t-0.33)*3.0);
              return oklabMix(c3, c4, (t-0.66)*3.0);
          }
      }

      void main() {
        // WFC Grid
        float gridSize = 64.0;
        vec2 gridUv = floor(vUv * gridSize) / gridSize;
        vec2 cellUv = fract(vUv * gridSize);
        
        vec4 wfc = texture(u_wfc, gridUv);
        vec4 sim = texture(u_sim, vUv);
        
        float tileType = wfc.r;
        float geomType = wfc.g;
        float collapse = wfc.b;
        
        float grains = sim.r;
        float energy = sim.g;

        // Base gradient (never black/white)
        float baseT = fract(vUv.x * 0.5 + vUv.y * 0.5 + u_time * 0.1);
        vec3 baseColor = getPaletteColor(u_palette, baseT);
        
        // Heatmap for uncollapsed regions
        vec3 heatColor = oklabMix(vec3(0.0, 0.8, 0.9), vec3(1.0, 0.0, 0.5), fract(grains * 0.1 + u_time));
        baseColor = mix(heatColor, baseColor, collapse);

        // Tile Shapes
        float lineW = 0.08 + 0.04 * sin(u_time * 2.0 + grains);
        float dTile = truchet(cellUv, tileType, lineW);
        float dGeom = geomancy(cellUv, geomType, 0.05);

        // Structural Color & Spectral mapping
        float thickness = 300.0 + grains * 40.0 + energy * 80.0 + collapse * 200.0;
        vec3 iridescence = thinFilm(thickness);
        vec3 spectral = wavelengthToRGB(380.0 + mod(grains * 15.0 + energy * 50.0 + u_time * 60.0, 320.0));

        vec3 tileColor = mix(spectral, iridescence, 0.5) * (1.0 + energy * 0.5);
        vec3 geomColor = wavelengthToRGB(600.0 - mod(geomType * 300.0 + u_time*50.0, 200.0));

        float maskTile = smoothstep(0.03, 0.0, dTile) * collapse;
        float maskGeom = smoothstep(0.02, 0.0, dGeom) * collapse * u_geomancy;

        vec3 sceneColor = baseColor;
        sceneColor = mix(sceneColor, tileColor, maskTile);
        sceneColor = mix(sceneColor, geomColor, maskGeom);

        // Add energy glow
        sceneColor += iridescence * energy * 0.3;

        // Afterimage Persistence (Ping-Pong)
        vec3 prev = texture(u_after, vUv).rgb;
        
        // Complementary Ghost (Hue Shift / Colored Invert)
        vec3 comp = vec3(1.0) - prev;
        // Tint to keep it saturated
        comp = oklabMix(comp, getPaletteColor(u_palette, fract(u_time * 0.05)), 0.3);
        
        float sceneMax = max(sceneColor.r, max(sceneColor.g, sceneColor.b));
        float decay = 0.92;
        vec3 ghost = comp * decay * (1.0 - sceneMax);

        fragColor = vec4(clamp(sceneColor + ghost, 0.0, 1.0), 1.0);
      }
    `;

    // 3. Post Pass (CRT, Bloom, Vignette)
    const fsPost = `
      in vec2 vUv;
      out vec4 fragColor;
      uniform sampler2D u_image;
      uniform float u_time;
      uniform vec2 u_res;
      uniform float u_crt;

      void main() {
        vec2 c = vUv - 0.5;
        float r2 = dot(c, c);
        
        // Barrel Distortion
        vec2 distUv = vUv + c * (0.1 * r2 + 0.05 * r2 * r2);
        
        if (distUv.x < 0.0 || distUv.x > 1.0 || distUv.y < 0.0 || distUv.y > 1.0) {
            fragColor = vec4(0.2, 0.0, 0.3, 1.0); // Deep purple border
            return;
        }

        // RGB Convergence
        float conv = 0.008 * u_crt;
        vec3 col;
        col.r = texture(u_image, distUv + c * conv).r;
        col.g = texture(u_image, distUv).g;
        col.b = texture(u_image, distUv - c * conv).b;

        // Simple Bloom
        vec2 texel = 1.0 / u_res;
        vec3 bloom = vec3(0.0);
        for(int x=-2; x<=2; x++) {
            for(int y=-2; y<=2; y++) {
                vec3 s = texture(u_image, distUv + vec2(x,y)*texel*2.0).rgb;
                bloom += max(s - 0.6, 0.0);
            }
        }
        col += (bloom / 25.0) * 1.2;

        // CRT Phosphor Mask (Dot Triad)
        float mask = mod(gl_FragCoord.x, 3.0);
        vec3 triad = vec3(mask < 1.0, mask >= 1.0 && mask < 2.0, mask >= 2.0);
        triad = mix(vec3(1.0), triad, u_crt * 0.4);
        col *= triad;

        // Scanlines
        col *= mix(1.0, 0.85 + 0.15 * sin(distUv.y * u_res.y * 1.5), u_crt);

        // Colored Vignette (NO BLACK)
        float v = smoothstep(1.3, 0.4, length(c * 2.0));
        vec3 vigColor = vec3(0.25, 0.0, 0.4); // Rich plum
        col = mix(vigColor, col, v);

        fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }
    `;

    // Setup Scenes & Materials
    const quadGeo = new THREE.PlaneGeometry(2, 2);

    const matSim = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vs,
      fragmentShader: fsSim,
      uniforms: {
        u_sim: { value: null },
        u_res: { value: new THREE.Vector2(grid.width, grid.height) },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
        u_mouseDown: { value: 0.0 },
        u_time: { value: 0 }
      }
    });

    const matRender = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vs,
      fragmentShader: fsRender,
      uniforms: {
        u_sim: { value: null },
        u_wfc: { value: wfcTex },
        u_after: { value: null },
        u_time: { value: 0 },
        u_res: { value: new THREE.Vector2(grid.width, grid.height) },
        u_geomancy: { value: 1.0 },
        u_palette: { value: 0.0 }
      }
    });

    const matPost = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vs,
      fragmentShader: fsPost,
      uniforms: {
        u_image: { value: null },
        u_time: { value: 0 },
        u_res: { value: new THREE.Vector2(grid.width, grid.height) },
        u_crt: { value: 1.0 }
      }
    });

    const sceneSim = new THREE.Scene();
    sceneSim.add(new THREE.Mesh(quadGeo, matSim));

    const sceneRender = new THREE.Scene();
    sceneRender.add(new THREE.Mesh(quadGeo, matRender));

    const scenePost = new THREE.Scene();
    scenePost.add(new THREE.Mesh(quadGeo, matPost));

    // App State
    const appState = {
      palette: 0,
      geomancy: 1.0,
      crt: 1.0,
      wfcTimer: 0,
      resetWfc: () => {
        for(let i=0; i<wfcSize*wfcSize*4; i+=4) {
          wfcData[i+2] = 0; // collapse state
        }
        wfcTex.needsUpdate = true;
      }
    };

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      if(e.key === 'c' || e.key === 'C') appState.palette = (appState.palette + 1) % 3;
      if(e.key === 'g' || e.key === 'G') appState.geomancy = appState.geomancy > 0.5 ? 0.0 : 1.0;
      if(e.key === 'p' || e.key === 'P') appState.crt = appState.crt > 0.5 ? 0.0 : 1.0;
      if(e.key === ' ') appState.resetWfc();
    });

    canvas.__three = {
      renderer, camera,
      sceneSim, sceneRender, scenePost,
      matSim, matRender, matPost,
      rtSimA, rtSimB, rtAfterA, rtAfterB,
      wfcData, wfcTex, wfcSize, appState
    };
  }

  const t3 = canvas.__three;
  const { renderer, camera, sceneSim, sceneRender, scenePost, matSim, matRender, matPost, wfcData, wfcTex, wfcSize, appState } = t3;

  // Handle Resize
  if (renderer.getSize(new THREE.Vector2()).x !== grid.width || renderer.getSize(new THREE.Vector2()).y !== grid.height) {
    renderer.setSize(grid.width, grid.height, false);
    t3.rtSimA.setSize(grid.width, grid.height);
    t3.rtSimB.setSize(grid.width, grid.height);
    t3.rtAfterA.setSize(grid.width, grid.height);
    t3.rtAfterB.setSize(grid.width, grid.height);
    matSim.uniforms.u_res.value.set(grid.width, grid.height);
    matRender.uniforms.u_res.value.set(grid.width, grid.height);
    matPost.uniforms.u_res.value.set(grid.width, grid.height);
  }

  // Update CPU WFC Logic
  let allCollapsed = true;
  for (let k = 0; k < 40; k++) {
    const idx = Math.floor(Math.random() * wfcSize * wfcSize) * 4;
    if (wfcData[idx + 2] < 255) {
      wfcData[idx + 2] = Math.min(255, wfcData[idx + 2] + 25);
      if (wfcData[idx + 2] === 255) {
        wfcData[idx + 0] = Math.floor(Math.random() * 4) / 4.0 * 255; // Tile 0-3
        wfcData[idx + 1] = Math.floor(Math.random() * 16) / 16.0 * 255; // Geomancy 0-15
      }
      allCollapsed = false;
      wfcTex.needsUpdate = true;
    }
  }
  
  if (allCollapsed) {
    appState.wfcTimer++;
    if (appState.wfcTimer > 600) { // ~10 seconds at 60fps
      appState.resetWfc();
      appState.wfcTimer = 0;
    }
  } else {
    appState.wfcTimer = 0;
  }

  // Pass 1: Sim (Sandpile)
  matSim.uniforms.u_time.value = time;
  matSim.uniforms.u_mouse.value.set(mouse.x, mouse.y);
  matSim.uniforms.u_mouseDown.value = mouse.isPressed ? 1.0 : 0.0;
  matSim.uniforms.u_sim.value = t3.rtSimA.texture;
  renderer.setRenderTarget(t3.rtSimB);
  renderer.render(sceneSim, camera);

  // Pass 2: Render & Afterimage Persistence
  matRender.uniforms.u_time.value = time;
  matRender.uniforms.u_sim.value = t3.rtSimB.texture;
  matRender.uniforms.u_after.value = t3.rtAfterA.texture;
  matRender.uniforms.u_geomancy.value = appState.geomancy;
  matRender.uniforms.u_palette.value = appState.palette;
  renderer.setRenderTarget(t3.rtAfterB);
  renderer.render(sceneRender, camera);

  // Pass 3: Post (Screen)
  matPost.uniforms.u_time.value = time;
  matPost.uniforms.u_image.value = t3.rtAfterB.texture;
  matPost.uniforms.u_crt.value = appState.crt;
  renderer.setRenderTarget(null);
  renderer.render(scenePost, camera);

  // Swap FBOs
  let tempSim = t3.rtSimA; t3.rtSimA = t3.rtSimB; t3.rtSimB = tempSim;
  let tempAfter = t3.rtAfterA; t3.rtAfterA = t3.rtAfterB; t3.rtAfterB = tempAfter;

} catch (e) {
  console.error("Generative Garden Error:", e);
}