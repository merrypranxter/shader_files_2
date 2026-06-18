try {
  if (!ctx) throw new Error("WebGL 2 context not available");

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.autoClear = false;

    // Use HalfFloatType for performance and precision in feedback loops
    const fboParams = { 
      type: THREE.HalfFloatType, 
      minFilter: THREE.LinearFilter, 
      magFilter: THREE.LinearFilter, 
      depthBuffer: false,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping
    };
    
    const rtRD1 = new THREE.WebGLRenderTarget(grid.width, grid.height, fboParams);
    const rtRD2 = new THREE.WebGLRenderTarget(grid.width, grid.height, fboParams);
    const rtScene1 = new THREE.WebGLRenderTarget(grid.width, grid.height, fboParams);
    const rtScene2 = new THREE.WebGLRenderTarget(grid.width, grid.height, fboParams);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const sceneRD = new THREE.Scene();
    const sceneMosh = new THREE.Scene();
    const scenePost = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(2, 2);

    const glslHeader = `
      precision highp float;
      uniform float u_time;
      uniform vec2 u_res;
      
      float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      
      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x),
                     mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y);
      }
    `;

    // PASS 1: Morphogenesis (Reaction-Diffusion)
    const matRD = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { u_time: { value: 0 }, u_res: { value: new THREE.Vector2() }, u_prev: { value: null } },
      vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
      fragmentShader: `
        ${glslHeader}
        in vec2 vUv;
        uniform sampler2D u_prev;
        out vec4 fragColor;

        void main() {
            vec2 px = 1.0 / u_res;
            vec2 state = texture(u_prev, vUv).xy;
            
            // 3x3 Laplacian
            vec2 lap = texture(u_prev, vUv + vec2(px.x, 0.0)).xy +
                       texture(u_prev, vUv - vec2(px.x, 0.0)).xy +
                       texture(u_prev, vUv + vec2(0.0, px.y)).xy +
                       texture(u_prev, vUv - vec2(0.0, px.y)).xy -
                       4.0 * state;
                       
            // Anisotropic diffusion (Op-Art zebra waves)
            vec2 dir = normalize(vUv - 0.5 + 0.001);
            float angle = u_time * 0.1 + length(vUv - 0.5) * 5.0;
            vec2 anisoDir = vec2(cos(angle), sin(angle));
            vec2 aniso = texture(u_prev, vUv + anisoDir*px).xy + texture(u_prev, vUv - anisoDir*px).xy - 2.0*state;
            lap += aniso * 0.6;

            // Spatially varying Feed and Kill (Central Portal)
            float dist = length(vUv - 0.5);
            float F = mix(0.024, 0.036, smoothstep(0.4, 0.0, dist)) + 0.002 * noise(vUv * 15.0 - u_time * 0.2);
            float K = mix(0.053, 0.061, smoothstep(0.4, 0.0, dist));

            float u = state.x;
            float v = state.y;
            float uvv = u * v * v;

            float du = 0.16 * lap.x - uvv + F * (1.0 - u);
            float dv = 0.08 * lap.y + uvv - (F + K) * v;

            // Seed initial state
            if (state.x == 0.0 && state.y == 0.0) {
                u = 1.0;
                v = (hash(vUv * 200.0) > 0.98) ? 1.0 : 0.0;
            }

            fragColor = vec4(clamp(u + du, 0.0, 1.0), clamp(v + dv, 0.0, 1.0), 0.0, 1.0);
        }
      `
    });

    // PASS 2: Scene (Cuttlefish + OpArt + UI + Datamosh)
    const matMosh = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { u_time: { value: 0 }, u_res: { value: new THREE.Vector2() }, u_rd: { value: null }, u_prevScene: { value: null } },
      vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
      fragmentShader: `
        ${glslHeader}
        in vec2 vUv;
        uniform sampler2D u_rd;
        uniform sampler2D u_prevScene;
        out vec4 fragColor;

        float sdBox(vec2 p, vec2 b) {
            vec2 d = abs(p) - b;
            return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
        }

        void main() {
            vec2 cUv = vUv - 0.5;
            float r = length(cUv);
            float th = atan(cUv.y, cUv.x);

            // Op-Art Retinal Engine (Funnel Tunnels & Radial Hypnosis)
            float funnel = sin(r * 40.0 - u_time * 5.0 + sin(th * 8.0 + u_time * 2.0) * 2.0);
            vec2 opUv = vUv + cUv * funnel * 0.015;

            // Cuttlefish Chromatophore Grid
            float cells = 80.0;
            vec2 gId = floor(opUv * cells);
            vec2 gUv = fract(opUv * cells) - 0.5;
            vec2 rd = texture(u_rd, gId / cells).xy;

            // Passing-cloud wave excitation
            float wave = sin(gId.x * 0.15 - u_time * 4.0 + gId.y * 0.1);
            float exc = clamp(rd.y * 2.5 + wave * 0.4, 0.0, 1.0);
            float radius = 0.05 + 0.45 * exc;
            float pigment = smoothstep(radius, radius - 0.05, length(gUv));

            // Abstract Early-Internet UI Shrine
            float ui = 0.0;
            
            // Concentric target portals
            float rings = sin(r * 60.0 - u_time * 3.0);
            ui = max(ui, smoothstep(0.1, 0.0, abs(rings)) * step(r, 0.25));

            // Floating beveled window
            vec2 w1Uv = cUv - vec2(0.2 * sin(u_time * 0.7), 0.15 * cos(u_time * 1.1));
            float d1 = sdBox(w1Uv, vec2(0.18, 0.12));
            ui = max(ui, smoothstep(0.01, 0.0, abs(d1))); // Border
            ui = max(ui, smoothstep(0.01, 0.0, abs(d1 + 0.02))); // Bevel

            // Fake banner ad / glitter strip
            vec2 w2Uv = cUv - vec2(-0.1, -0.35);
            float d2 = sdBox(w2Uv, vec2(0.25, 0.04));
            float glitter = step(0.7, hash(floor(opUv * 100.0) + u_time));
            ui = max(ui, smoothstep(0.01, 0.0, abs(d2)) + (1.0 - smoothstep(0.0, 0.01, d2)) * glitter * 0.5);

            // Asemic pixel debris
            float debris = step(0.98, hash(floor(opUv * 120.0) * 1.3 + u_time * 0.1));
            ui = max(ui, debris * step(0.3, r));

            // Base Coloring (pre-OKLab shift)
            vec3 col = vec3(0.0);
            col = mix(col, vec3(1.0, 0.2, 0.6), pigment); 
            col = mix(col, vec3(0.1, 0.9, 0.7), rd.x * (1.0 - pigment)); 
            col = mix(col, vec3(0.9, 0.9, 0.1), ui); 

            // Datamosh & Temporal Feedback
            vec2 blockId = floor(vUv * 30.0) / 30.0;
            float mvX = texture(u_rd, blockId + vec2(0.02, 0.0)).y - texture(u_rd, blockId - vec2(0.02, 0.0)).y;
            float mvY = texture(u_rd, blockId + vec2(0.0, 0.02)).y - texture(u_rd, blockId - vec2(0.0, 0.02)).y;
            vec2 mv = vec2(mvX, mvY) * 0.15;
            
            // Macroblock sliding
            mv += vec2(sin(u_time + blockId.y * 15.0), cos(u_time + blockId.x * 15.0)) * 0.008;

            vec4 prev = texture(u_prevScene, vUv - mv);

            // Mosh trigger (Codec failure)
            float mosh = step(0.85, noise(blockId * 5.0 + u_time * 1.5));
            col = mix(col, prev.rgb, mosh * 0.95); 

            // Temporal ghosting (memory scars)
            col = mix(col, prev.rgb, 0.45);

            // Init state
            if(texture(u_prevScene, vUv).a == 0.0) col = vec3(0.5);

            fragColor = vec4(col, 1.0);
        }
      `
    });

    // PASS 3: Post (Chromatic Aberration, Damage, Cross-Process, OKLab No-Black/White Enforcer)
    const matPost = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { u_time: { value: 0 }, u_res: { value: new THREE.Vector2() }, u_scene: { value: null } },
      vertexShader: `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
      fragmentShader: `
        ${glslHeader}
        in vec2 vUv;
        uniform sampler2D u_scene;
        out vec4 fragColor;

        // OKLab Conversions
        vec3 srgb_to_linear(vec3 c) {
            return mix(c / 12.92, pow(max((c + 0.055) / 1.055, 0.0), vec3(2.4)), step(0.04045, c));
        }

        vec3 linear_to_srgb(vec3 c) {
            return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0/2.4)) - 0.055, step(0.0031308, c));
        }

        vec3 linear_srgb_to_oklab(vec3 c) {
            float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
            float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
            float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
            float l_ = pow(max(l, 0.0), 1.0/3.0);
            float m_ = pow(max(m, 0.0), 1.0/3.0);
            float s_ = pow(max(s, 0.0), 1.0/3.0);
            return vec3(
                0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
                1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
                0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
            );
        }

        vec3 oklab_to_linear_srgb(vec3 c) {
            float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
            float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
            float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
            float l = l_*l_*l_;
            float m = m_*m_*m_;
            float s = s_*s_*s_;
            return vec3(
                 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
            );
        }

        void main() {
            vec2 cUv = vUv - 0.5;
            float dist = length(cUv);

            // Chromatic Aberration (Lens dispersion & coma tails)
            vec2 dir = normalize(cUv + 0.001);
            float ca = 0.025 * dist * (1.0 + 0.8 * sin(u_time * 6.0));
            
            float r = texture(u_scene, vUv + dir * ca).r;
            float g = texture(u_scene, vUv).g;
            float b = texture(u_scene, vUv - dir * ca * 1.5).b; // Asymmetric coma
            vec3 col = vec3(r, g, b);

            // Raster Tears (Playback instability)
            float tear = step(0.985, fract(sin(floor(vUv.y * 45.0) * 17.3 + u_time * 2.0) * 437.1));
            col.rgb += tear * vec3(0.3, -0.2, 0.2);

            // Convert to OKLab for Cross-Processing & No-Black/White Rules
            vec3 lin = srgb_to_linear(clamp(col, 0.0, 1.0));
            vec3 lab = linear_srgb_to_oklab(lin);

            float L = lab.x;
            float a = lab.y;
            float bb = lab.z; 
            float C = sqrt(a*a + bb*bb);
            float h = atan(bb, a);

            // RULE: NO BLACK, NO WHITE, NO GRAYSCALE
            // Clamp Lightness tightly away from 0.0 and 1.0
            L = clamp(L, 0.30, 0.85);
            
            // Force massive saturation (No grayscale anywhere)
            C = max(C, 0.18) * 1.4;

            // Cross-Processing Hue Shift (Tone-dependent)
            // Shadows -> Deep Violet / Plum / Teal (h ~ -1.5 to -0.5)
            // Highlights -> Hot Pink / Acid Yellow / Coral (h ~ 0.0 to 1.5)
            h += mix(-1.4, 1.4, L) + sin(dist * 12.0 - u_time * 1.5) * 0.4;

            lab.x = L;
            lab.y = C * cos(h);
            lab.z = C * sin(h);

            vec3 finalCol = linear_to_srgb(oklab_to_linear_srgb(lab));

            // Ultimate safety clamp to guarantee saturated color everywhere
            finalCol = clamp(finalCol, vec3(0.05, 0.0, 0.15), vec3(0.95, 1.0, 0.95));

            fragColor = vec4(finalCol, 1.0);
        }
      `
    });

    sceneRD.add(new THREE.Mesh(geo, matRD));
    sceneMosh.add(new THREE.Mesh(geo, matMosh));
    scenePost.add(new THREE.Mesh(geo, matPost));

    canvas.__three = { 
      renderer, camera, sceneRD, sceneMosh, scenePost, 
      matRD, matMosh, matPost, 
      rtRD1, rtRD2, rtScene1, rtScene2, 
      frame: 0 
    };
  }

  const t = canvas.__three;
  t.renderer.setSize(grid.width, grid.height, false);

  t.matRD.uniforms.u_time.value = time;
  t.matRD.uniforms.u_res.value.set(grid.width, grid.height);

  t.matMosh.uniforms.u_time.value = time;
  t.matMosh.uniforms.u_res.value.set(grid.width, grid.height);

  t.matPost.uniforms.u_time.value = time;
  t.matPost.uniforms.u_res.value.set(grid.width, grid.height);

  // Ping-Pong RD (8 steps per frame for organic morphogenetic growth)
  for(let i = 0; i < 8; i++) {
    t.matRD.uniforms.u_prev.value = (t.frame % 2 === 0) ? t.rtRD1.texture : t.rtRD2.texture;
    t.renderer.setRenderTarget((t.frame % 2 === 0) ? t.rtRD2 : t.rtRD1);
    t.renderer.render(t.sceneRD, t.camera);
    t.frame++;
  }

  // Ping-Pong Scene & Datamosh
  const currentRD = (t.frame % 2 === 0) ? t.rtRD1.texture : t.rtRD2.texture;
  t.matMosh.uniforms.u_rd.value = currentRD;
  t.matMosh.uniforms.u_prevScene.value = (t.frame % 2 === 0) ? t.rtScene1.texture : t.rtScene2.texture;

  const currentSceneRT = (t.frame % 2 === 0) ? t.rtScene2 : t.rtScene1;
  t.renderer.setRenderTarget(currentSceneRT);
  t.renderer.render(t.sceneMosh, t.camera);

  // Final Post-Process / Color Chemistry
  t.matPost.uniforms.u_scene.value = currentSceneRT.texture;
  t.renderer.setRenderTarget(null);
  t.renderer.render(t.scenePost, t.camera);

  t.frame++;

} catch (e) {
  console.error("Chromatophore Codec Shrine Initialization Failed:", e);
}