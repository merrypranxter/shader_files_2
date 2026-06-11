try {
  if (!ctx) throw new Error("WebGL 2 context not available");

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.autoClear = false;

    const scene = new THREE.Scene();
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

    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;
      in vec2 vUv;
      out vec4 fragColor;
      
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform sampler2D u_buffer;
      
      float noise(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      
      vec3 oklch_to_oklab(vec3 lch) {
          return vec3(lch.x, lch.y * cos(lch.z * 3.14159265 / 180.0), lch.y * sin(lch.z * 3.14159265 / 180.0));
      }
      
      vec3 oklab_to_linear_srgb(vec3 c) {
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
      
      float linear_to_srgb(float x) {
          return x <= 0.0031308 ? x * 12.92 : 1.055 * pow(max(x, 0.0), 1.0 / 2.4) - 0.055;
      }
      
      vec3 oklch_to_srgb(vec3 lch) {
          vec3 lin = oklab_to_linear_srgb(oklch_to_oklab(lch));
          return vec3(linear_to_srgb(lin.r), linear_to_srgb(lin.g), linear_to_srgb(lin.b));
      }
      
      void main() {
          vec2 uv = vUv;
          float time = u_time * 0.8;
          
          // --- DATABENDING & COMPRESSION MACROBLOCKING ---
          vec2 blockUv = floor(uv * vec2(32.0, 24.0)) / vec2(32.0, 24.0);
          float glitchNoise = noise(blockUv * 8.0 + floor(time * 15.0));
          vec2 warpedUv = uv;
          
          if (glitchNoise > 0.96) {
              warpedUv.x += 0.08 * sin(time * 20.0 + uv.y * 10.0);
              warpedUv.y -= 0.03 * cos(time * 15.0);
          }
          
          // --- VHS TRACKING TEAR ---
          float tear = step(0.992, sin(warpedUv.y * 200.0 + time * 40.0) * cos(warpedUv.y * 47.0 - time * 15.0));
          warpedUv.x += tear * 0.15;
          
          vec2 p = (warpedUv - 0.5) * 2.0;
          p.x *= u_resolution.x / u_resolution.y;
          
          // --- CLASSIC B&W RETINAL OP-ART TUNNEL ---
          float r = length(p);
          float theta = atan(p.y, p.x);
          float spiral = log(r + 0.001) * 6.0 - time * 4.0 + theta * 3.0;
          float bw = step(0.0, sin(spiral * 2.0)); 
          
          // --- EARLY INTERNET "PROGRAM NOT RESPONDING" WINDOW ---
          vec2 winPos = vec2(sin(time * 1.4) * 0.7, cos(time * 1.1) * 0.4);
          vec2 winUv = p - winPos;
          float windowMask = step(abs(winUv.x), 0.35) * step(abs(winUv.y), 0.25);
          float titleBar = step(abs(winUv.x), 0.35) * step(abs(winUv.y - 0.2), 0.05);
          float closeBtn = step(0.28, winUv.x) * step(winUv.x, 0.33) * step(0.17, winUv.y) * step(winUv.y, 0.23);
          
          // Checkerboard abyss inside the window
          float winChecker = step(0.0, sin(winUv.x * 50.0) * sin(winUv.y * 50.0 - time * 12.0));
          
          // --- ACID VIBRATION PALETTE ---
          vec3 acidMagenta = oklch_to_srgb(vec3(0.65, 0.35, 330.0));
          vec3 acidLime    = oklch_to_srgb(vec3(0.85, 0.30, 130.0));
          vec3 cyberCyan   = oklch_to_srgb(vec3(0.75, 0.25, 195.0));
          vec3 hyperYellow = oklch_to_srgb(vec3(0.90, 0.25, 100.0));
          
          vec3 sceneColor = vec3(bw);
          
          // Apply Window Overlay
          if (windowMask > 0.5) {
              sceneColor = mix(vec3(winChecker), acidMagenta, 0.4); // Toxic overlay
              if (titleBar > 0.5) sceneColor = cyberCyan;
              if (closeBtn > 0.5) sceneColor = hyperYellow;
          }
          
          // Chromatic Interference on Op-Art Edges
          float edge = abs(sin(spiral * 2.0));
          if (edge < 0.15 && windowMask < 0.5) {
              sceneColor = mix(sceneColor, acidLime, 1.0 - edge * 6.66);
          }
          
          // --- MYSPACE GLITTER SCRAPING ---
          float sparkle = step(0.993, noise(p * 250.0 + time * 8.0));
          vec3 glitterColor = oklch_to_srgb(vec3(0.9, 0.3, time * 400.0 + r * 200.0)); // Hyperspeed hue cycle
          sceneColor = mix(sceneColor, glitterColor, sparkle);
          
          // Inject Random Color Blocks (Glitchcore)
          if (glitchNoise > 0.88 && windowMask < 0.5) {
              sceneColor = mix(acidMagenta, cyberCyan, fract(p.y * 15.0 + time));
          }
          
          // --- GHOST-FRAME BODY / TEMPORAL ECHO (FEEDBACK) ---
          // Zoom out and twist slightly to create a tumbling, cascading "crashed desktop" trail
          float fbTheta = 0.015 * sin(time * 0.4);
          mat2 fbRot = mat2(cos(fbTheta), -sin(fbTheta), sin(fbTheta), cos(fbTheta));
          vec2 fbUv = uv - 0.5;
          fbUv = fbUv * fbRot;
          fbUv *= 0.985; // Zoom out
          fbUv += 0.5;
          
          // Chromatic Aberration in Feedback
          float ca = 0.005 + 0.03 * tear;
          float prevR = texture(u_buffer, fbUv + vec2(ca, 0.0)).r;
          float prevG = texture(u_buffer, fbUv).g;
          float prevB = texture(u_buffer, fbUv - vec2(ca, 0.0)).b;
          vec3 prevColor = vec3(prevR, prevG, prevB);
          
          // Dynamic Feedback Weight (Datamosh melt vs fresh draw)
          float fbWeight = 0.89;
          if (glitchNoise > 0.98) fbWeight = 0.2; // Sudden break in feedback trail
          
          vec3 finalColor = mix(sceneColor, prevColor, fbWeight);
          
          // --- CRT HEAD SWITCHING NOISE ---
          float headSwitch = step(0.94, uv.y) * noise(uv * vec2(1.0, 80.0) + time * 15.0);
          if (headSwitch > 0.5) {
              finalColor = mix(finalColor, vec3(1.0), 0.6);
          }
          
          fragColor = vec4(finalColor, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_buffer: { value: null }
      },
      vertexShader,
      fragmentShader,
      depthWrite: false,
      depthTest: false
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    canvas.__three = { renderer, scene, camera, material, rtA, rtB };
  }

  const { renderer, scene, camera, material } = canvas.__three;
  let { rtA, rtB } = canvas.__three;

  if (material.uniforms.u_resolution.value.x !== grid.width || material.uniforms.u_resolution.value.y !== grid.height) {
    renderer.setSize(grid.width, grid.height, false);
    rtA.setSize(grid.width, grid.height);
    rtB.setSize(grid.width, grid.height);
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }

  material.uniforms.u_time.value = time;
  material.uniforms.u_buffer.value = rtA.texture;

  // Pass 1: Render scene with feedback to rtB
  renderer.setRenderTarget(rtB);
  renderer.render(scene, camera);

  // Pass 2: Render rtB to screen
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);

  // Swap buffers for the next frame
  canvas.__three.rtA = rtB;
  canvas.__three.rtB = rtA;

} catch (e) {
  console.error("WebGL 2 initialization or render failed:", e);
}