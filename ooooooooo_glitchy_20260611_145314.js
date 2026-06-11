try {
  if (!ctx) throw new Error("WebGL context not provided");

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      context: ctx,
      alpha: true,
      antialias: true,
    });
    
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, grid.width / grid.height, 0.1, 100);
    camera.position.z = 1;

    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float u_time;
      uniform vec2 u_resolution;
      in vec2 vUv;
      out vec4 fragColor;

      #define PI 3.14159265359

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
        f = f * f * (3.0 - 2.0 * f);
        float a = hash12(i);
        float b = hash12(i + vec2(1.0, 0.0));
        float c = hash12(i + vec2(0.0, 1.0));
        float d = hash12(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i=0; i<5; i++) {
          v += a * noise(p);
          p *= 2.0;
          a *= 0.5;
        }
        return v;
      }

      // Halftone Screen (Psychedelic Collage / Riso)
      float halftone(vec2 uv, float angle, float freq) {
        mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
        vec2 p = rot * uv * freq;
        return sin(p.x) * sin(p.y);
      }

      vec3 scene(vec2 uv) {
        vec2 p = uv * 2.0 - 1.0;
        p.x *= u_resolution.x / u_resolution.y;

        // Gematria Resonance Warp (Logos 373 / Ichthys 1224)
        float g_warp = sin(length(p) * 37.3 - u_time) * cos(atan(p.y, p.x) * 12.24 + u_time * 0.5);
        p += g_warp * 0.06 * (1.0 + 0.5 * sin(u_time * 0.2));

        float r = length(p);
        float a = atan(p.y, p.x);

        // Op Art Checker Funnel
        float spiral = sin(8.0 / (r + 0.01) - u_time * 4.0) * sin(a * 14.0 + u_time * 1.5);
        float op_art = step(0.0, spiral);

        // Mycelial Network Rot (Brown Rot / Enzymatic Pattern)
        float rot_field = fbm(p * 3.5 - u_time * 0.3 + fbm(p * 8.0));
        float sector_boundary = smoothstep(0.48, 0.5, rot_field) - smoothstep(0.52, 0.54, rot_field);
        
        vec3 col = vec3(op_art);

        // Myspace Acid / Hyperpop Candy Broadcast Intrusion
        if (rot_field > 0.45) {
            float t = fbm(p * 12.0 + u_time);
            vec3 neon_pink = vec3(1.0, 0.078, 0.576); // Hot Pink
            vec3 neon_cyan = vec3(0.0, 1.0, 1.0);     // Electric Cyan
            vec3 gold      = vec3(0.79, 0.66, 0.18);  // Alchemical Gold
            
            col = mix(neon_pink, neon_cyan, smoothstep(0.3, 0.7, t));
            
            // Anastomosis sector boundaries turn gold
            col = mix(col, gold, sector_boundary * 1.5);

            // Riso Halftone misregistration artifact
            float ht = halftone(uv, 0.785, 180.0);
            col *= smoothstep(-0.5, 0.5, ht + 0.2);

            // Myspace Glitter / Sparkle Masks
            float spark = step(0.95, hash12(floor(p * 150.0) - floor(u_time * 15.0)));
            col += spark * vec3(1.0, 0.9, 0.9) * 2.0; // Overbloom sparkles
        }

        return col;
      }

      void main() {
        vec2 uv = vUv;

        // VHS Tracking Error & Time Base Correction Jitter
        float tracking = step(0.96, sin(uv.y * 4.0 + u_time * 8.0)) * (hash12(vec2(uv.y, u_time)) - 0.5) * 0.12;
        uv.x += tracking;

        // Glitchcore: Candy-Crash Compression (Macroblock Breakup)
        vec2 block = floor(uv * 28.0) / 28.0;
        float moshing = step(0.88, hash12(block + floor(u_time * 5.0)));
        vec2 d_uv = mix(uv, block + (hash22(block) - 0.5) * 0.1, moshing);

        // Chromatic Aberration / RGB Channel Split
        float split = 0.015 + 0.06 * moshing + abs(tracking);
        float r_col = scene(d_uv + vec2(split, 0.0)).r;
        float g_col = scene(d_uv).g;
        float b_col = scene(d_uv - vec2(split, 0.0)).b;

        vec3 finalColor = vec3(r_col, g_col, b_col);

        // Semantic Font Rot / Terminal Debris
        float text_band = step(0.98, hash12(vec2(floor(uv.y * 30.0), 1.0)));
        float text_hash = hash12(floor(uv * vec2(80.0, 30.0)) + floor(u_time * 8.0));
        vec3 text_color = vec3(0.0, 1.0, 0.5); // Phosphor green
        finalColor = mix(finalColor, text_color, text_band * step(0.7, text_hash));

        // CRT Scanlines & Luma Blooming
        finalColor -= sin(uv.y * u_resolution.y * 1.5) * 0.06;
        
        // Myspace Blingee Frame (Tiled Sticker Wallpaper Logic)
        float border_x = abs(vUv.x - 0.5) * 2.0;
        float border_y = abs(vUv.y - 0.5) * 2.0;
        float frame_mask = step(0.9, max(border_x, border_y));
        
        float frame_sparkle = step(0.8, hash12(vUv * 90.0 + u_time * 2.0)) * frame_mask;
        vec3 frame_color = mix(finalColor, vec3(1.0, 0.0, 0.8), frame_mask * 0.4);
        finalColor = mix(finalColor, frame_color, frame_mask);
        finalColor += frame_sparkle * vec3(1.0, 0.8, 1.0); // Pinkish diamonds

        // Vignette (Analog Lens Fade)
        float vig = length(vUv - 0.5) * 2.0;
        finalColor *= 1.0 - smoothstep(0.8, 1.5, vig);

        fragColor = vec4(finalColor, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      glslVersion: THREE.GLSL3,
      depthWrite: false,
      depthTest: false
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    canvas.__three = { renderer, scene, camera, material };
  }

  const { renderer, scene, camera, material } = canvas.__three;

  if (material && material.uniforms) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }

  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);

} catch (e) {
  console.error("Feral Glitchscape failed to compile/render:", e);
}