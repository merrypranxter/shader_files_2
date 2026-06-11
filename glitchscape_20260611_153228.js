try {
  // Defensive check for the WebGL2 context
  if (!ctx) throw new Error("WebGL 2 context not available");

  // Avoid re-initializing Three.js on every frame
  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ 
      canvas, 
      context: ctx, 
      alpha: true, 
      antialias: true 
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    // Feral GLSL Shader: Op-Art meets MySpace Glitchcore
    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      in vec2 vUv;
      out vec4 fragColor;

      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec2 u_mouse;

      #define PI 3.14159265359
      #define TAU 6.28318530718

      // --- Noise & Hash Functions ---
      float hash12(vec2 p) {
          vec3 p3  = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
      }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
                     mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      // --- Retinal Surrealism: Op-Art Space Warp ---
      float opArt(vec2 uv, float t) {
          vec2 p = uv * 2.0 - 1.0;
          
          // Domain warp (Stripe-Fluid Distortion)
          p.x += sin(p.y * 4.0 + t) * 0.15;
          p.y += cos(p.x * 4.0 - t) * 0.15;
          
          float r = length(p);
          float a = atan(p.y, p.x);
          
          // Funnel / Tunnel inversion
          float z = 1.0 / (r + 0.1); 
          float spiral = sin(8.0 * a - t * 4.0 + z * 4.0);
          float rings = sin(24.0 * r - t * 6.0);
          
          // Moiré phase interference
          float val = step(0.0, spiral * rings);
          
          // Radial Hypnosis strobe flip
          if (fract(r * 2.0 - t * 0.5) > 0.5) val = 1.0 - val;
          
          return val;
      }

      // --- Web 1.0 / MySpace Sparkle ---
      float sparkle(vec2 uv, vec2 pos, float size, float t) {
          vec2 p = (uv - pos) / size;
          // Spin
          float c = cos(t), s = sin(t);
          p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
          
          float d = length(p);
          float crossLine = min(abs(p.x), abs(p.y));
          
          float star = smoothstep(0.15, 0.0, crossLine) * smoothstep(1.0, 0.0, d);
          float core = smoothstep(0.2, 0.0, d);
          return max(star, core);
      }

      // --- Hyperpop / Acid Palettes ---
      vec3 getPalette(float i) {
          float m = mod(i, 5.0);
          if(m == 0.0) return vec3(1.0, 0.08, 0.58); // Hot Pink
          if(m == 1.0) return vec3(0.0, 1.0, 1.0);   // Electric Cyan
          if(m == 2.0) return vec3(0.72, 0.96, 0.14); // Toxic Lime
          if(m == 3.0) return vec3(0.54, 0.0, 1.0);  // Blacklight Violet
          return vec3(1.0, 1.0, 1.0);                // Pearl White
      }

      // --- Interface Debris & Floating Windows ---
      vec3 drawUI(vec2 uv, float t, vec3 bg) {
          vec3 col = bg;
          
          for(float i=0.0; i<4.0; i+=1.0) {
              // Glitched motion path
              float mt = t * 0.4 + i * 2.618;
              vec2 pos = vec2(sin(mt)*0.7, cos(mt*0.7)*0.7);
              
              // Candy-Crash Compression Jump
              if(fract(mt * 3.0) > 0.85) pos.x += 0.2 * sin(t*10.0);
              
              vec2 size = vec2(0.25, 0.15);
              vec2 d = abs((uv * 2.0 - 1.0) - pos) - size;
              float dist = max(d.x, d.y);
              
              if(dist < 0.0) {
                  // Inside window
                  col = vec3(0.75, 0.75, 0.8); // Win95 Grey
                  
                  // Title bar
                  vec2 winUv = (uv * 2.0 - 1.0) - pos;
                  if(winUv.y > size.y - 0.06) {
                      col = getPalette(i); // Colorful title bars
                  } else {
                      // Text Debris (Semantic Font Rot)
                      float txt = step(0.6, sin(winUv.y * 150.0) * sin(winUv.x * 60.0 + t*5.0));
                      if(txt > 0.0 && winUv.x > -size.x + 0.05 && winUv.y < size.y - 0.1) {
                          col = vec3(0.0);
                      }
                      // Fake Error Icon
                      if(length(winUv - vec2(-size.x + 0.1, 0.0)) < 0.04) {
                          col = vec3(1.0, 0.0, 0.0);
                      }
                  }
              } else if (dist < 0.04 && (uv * 2.0 - 1.0).x > pos.x && (uv * 2.0 - 1.0).y < pos.y) {
                  // Drop shadow (Multiplied, creating false depth)
                  col *= 0.3;
              }
          }
          return col;
      }

      // --- Main Render Pass ---
      vec3 render(vec2 uv, float t) {
          // 1. Macroblock Breakup (Candy-Crash)
          vec2 grid = floor(uv * 25.0);
          if(hash12(grid + floor(t * 8.0)) > 0.92) {
              uv.x += (hash12(grid)-0.5) * 0.1;
          }
          
          // 2. VHS Tracking Tear
          float yTear = fract(uv.y * 3.0 + t * 0.5);
          if(yTear > 0.85) {
              uv.x += (noise(vec2(uv.y * 50.0, t * 10.0)) - 0.5) * 0.15;
          }

          // 3. Op-Art B&W Base
          float bw = opArt(uv, t);
          vec3 col = vec3(bw);

          // 4. Interface Debris
          col = drawUI(uv, t, col);

          // 5. MySpace Glitter / Sparkle Swarm
          vec2 mapUv = uv * 2.0 - 1.0;
          for(float i=0.0; i<25.0; i+=1.0) {
              vec2 sPos = vec2(hash12(vec2(i, 1.0))*2.0-1.0, hash12(vec2(i, 2.0))*2.0-1.0);
              // Drift
              sPos += vec2(sin(t*0.4+i), cos(t*0.6+i)) * 0.3;
              
              // Glitch stutter position
              if(hash12(sPos + floor(t*6.0)) > 0.8) sPos.y -= 0.15;
              
              float s = sparkle(mapUv, sPos, 0.06 + hash12(vec2(i,3.0))*0.08, t*2.0 + i);
              vec3 sCol = getPalette(i + floor(t));
              
              // Additive blend for light-based sparkles
              col = mix(col, sCol, s);
          }

          return col;
      }

      void main() {
          vec2 uv = vUv;
          float t = u_time;
          
          // --- Dynamic Glitch Intensity (The Feral Engine) ---
          float gInt = smoothstep(0.5, 1.0, noise(vec2(t * 2.5, 0.0)));
          
          // --- RGB Phantom / Channel Split ---
          vec2 rOff = vec2(0.015, 0.0) * gInt;
          vec2 gOff = vec2(-0.008, 0.01) * gInt;
          vec2 bOff = vec2(0.0, -0.015) * gInt;
          
          // Sample offset channels
          vec3 finalCol;
          finalCol.r = render(uv + rOff, t).r;
          finalCol.g = render(uv + gOff, t).g;
          finalCol.b = render(uv + bOff, t).b;
          
          // --- VHS Bloom Contamination ---
          // Multi-tap sample for soft, luminous overflow
          vec3 bloom = vec3(0.0);
          float bSpread = 0.01 + 0.02 * gInt;
          bloom += render(uv + vec2(bSpread, 0.0), t);
          bloom += render(uv - vec2(bSpread, 0.0), t);
          bloom += render(uv + vec2(0.0, bSpread), t);
          bloom += render(uv - vec2(0.0, bSpread), t);
          finalCol += bloom * 0.2; // Additive bloom
          
          // --- CRT Scanline Raster ---
          finalCol -= sin(uv.y * u_resolution.y * PI) * 0.06;
          
          // --- Vignette / Cathode Tube Edge ---
          vec2 vigUv = uv * 2.0 - 1.0;
          finalCol *= 1.0 - dot(vigUv, vigUv) * 0.25;
          
          fragColor = vec4(finalCol, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_mouse: { value: new THREE.Vector2(0, 0) }
      },
      depthWrite: false,
      depthTest: false
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    canvas.__three = { renderer, scene, camera, material };
  }

  const { renderer, scene, camera, material } = canvas.__three;

  // Guard uniform updates safely
  if (material?.uniforms) {
    if (material.uniforms.u_time) material.uniforms.u_time.value = time;
    if (material.uniforms.u_resolution) {
      material.uniforms.u_resolution.value.set(grid.width, grid.height);
    }
    if (material.uniforms.u_mouse) {
      material.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
    }
  }

  // Handle resizing
  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);

} catch (e) {
  console.error("WebGL 2 Initialization or Render Failed:", e);
}