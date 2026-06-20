try {
  if (!ctx) throw new Error("WebGL 2 context not available");

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    
    const rtOpts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      stencilBuffer: false,
      depthBuffer: false
    };
    
    const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
    const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
    
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    const vert = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const frag = `
      precision highp float;
      in vec2 vUv;
      out vec4 fragColor;

      uniform sampler2D u_feedback;
      uniform float u_time;
      uniform vec2 u_resolution;

      // ----- COLOR SYSTEMS (OKLab) -----
      vec3 oklab_to_lin(vec3 c) {
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

      vec3 lin2srgb(vec3 c) {
          vec3 a = 12.92 * c;
          vec3 b = 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055;
          return mix(a, b, step(0.0031308, c));
      }

      // ----- STRICT DREAM PHYSICS PALETTE -----
      // i = intensity (0.0 to 1.0)
      // h = hue angle (0.0 to 1.0)
      vec3 getDreamColor(float i, float h) {
          // Map intensity to OKLab Lightness (L)
          // Prevents pure black (min 0.25) and pure white (max 0.85)
          float L = mix(0.25, 0.85, clamp(i, 0.0, 1.0));
          
          // Maintain high chroma to avoid grayscale
          float C = mix(0.12, 0.22, sin(h * 18.8495) * 0.5 + 0.5);
          
          // Cross-processing chemistry: shadows rotate hue differently than highlights
          float hueShift = mix(0.6, 0.0, clamp(i, 0.0, 1.0));
          float finalHue = (h + hueShift) * 6.28318;
          
          vec3 lab = vec3(L, C * cos(finalHue), C * sin(finalHue));
          
          // Convert to sRGB and clamp to avoid HDR blooms going white
          vec3 rgb = lin2srgb(oklab_to_lin(lab));
          return clamp(rgb, 0.05, 0.95);
      }

      float luma(vec3 c) {
          return dot(c, vec3(0.2126, 0.7152, 0.0722));
      }

      // ----- NOISE & SDF -----
      mat2 rot(float a) {
          float s = sin(a), c = cos(a);
          return mat2(c, -s, s, c);
      }

      float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                     mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }

      float sdBox(vec3 p, vec3 b) {
        vec3 q = abs(p) - b;
        return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
      }

      float map(vec3 p) {
          vec3 q = p;
          
          // Dream Architecture Twist
          float twist = sin(q.z * 0.2 + u_time * 0.2) * 0.5;
          q.xy *= rot(twist);
          
          // Cathedral Tunnel (Hexagonal)
          float a = atan(q.y, q.x);
          float r = length(q.xy);
          float hex = cos(floor(0.5 + a / 1.047) * 1.047 - a) * r;
          float tunnel = hex - 3.0 + sin(q.z * 3.0 + u_time) * 0.2;
          tunnel = abs(tunnel) - 0.2; // Hollow walls
          
          // Recursive floating browser panels
          vec3 bp = p;
          bp.z = mod(bp.z + u_time * 1.5, 10.0) - 5.0;
          bp.xy *= rot(u_time * 0.4);
          bp.x = abs(bp.x) - 1.8;
          float panels = sdBox(bp, vec3(0.4, 0.8, 0.05));
          
          return min(tunnel, panels);
      }

      vec3 getNormal(vec3 p) {
          vec2 e = vec2(0.01, 0.0);
          return normalize(vec3(
              map(p + e.xyy) - map(p - e.xyy),
              map(p + e.yxy) - map(p - e.yxy),
              map(p + e.yyx) - map(p - e.yyx)
          ));
      }

      void main() {
          vec2 uv = vUv;
          vec2 aspectUV = uv * vec2(u_resolution.x / u_resolution.y, 1.0);
          
          // 1. VHS Tracking Damage
          vec2 trackUV = uv;
          float trackNoise = noise(vec2(uv.y * 10.0, u_time * 5.0));
          if (trackNoise > 0.8) {
              trackUV.x += (trackNoise - 0.8) * 0.1 * sin(u_time * 10.0);
          }
          // Head switching band
          if (uv.y < 0.05) {
              trackUV.x += hash(uv + u_time) * 0.05;
          }
          
          // 2. Cellular Automata State (Read from feedback alpha)
          float caCount = 0.0;
          vec2 px = 1.0 / u_resolution;
          for(int y=-1; y<=1; y++) {
              for(int x=-1; x<=1; x++) {
                  if(x!=0 || y!=0) {
                      caCount += texture(u_feedback, trackUV + vec2(x,y)*px).a > 0.5 ? 1.0 : 0.0;
                  }
              }
          }
          float selfCA = texture(u_feedback, trackUV).a;
          float nextCA = selfCA;
          if(selfCA > 0.5) {
              if(caCount < 2.0 || caCount > 4.0) nextCA = 0.0;
          } else {
              if(caCount >= 3.0 && caCount <= 4.0) nextCA = 1.0;
          }
          // Random sparks to keep CA alive
          if (hash(trackUV + u_time*1.1) > 0.998) nextCA = 1.0;
          
          // 3. Datamosh Vectors
          vec2 moshVec = vec2(
              noise(trackUV * 10.0 + u_time) - 0.5,
              noise(trackUV * 10.0 - u_time) - 0.5
          ) * 0.02;
          // CA drives datamosh masking
          vec4 prevFrame = texture(u_feedback, trackUV - moshVec * nextCA);
          
          // 4. Raymarching Dream Physics Architecture
          vec3 ro = vec3(0.0, 0.0, -5.0);
          vec2 pUV = (trackUV * 2.0 - 1.0);
          pUV.x *= u_resolution.x / u_resolution.y;
          vec3 rd = normalize(vec3(pUV, 1.5));
          rd.xy *= rot(u_time * 0.05);
          
          float t = 0.0;
          float d = 0.0;
          for(int i=0; i<60; i++) {
              vec3 p = ro + rd * t;
              d = map(p);
              if(d < 0.01 || t > 20.0) break;
              t += d;
          }
          
          vec3 sceneColor;
          vec2 trackAspectUV = trackUV * vec2(u_resolution.x / u_resolution.y, 1.0);
          
          if (t < 20.0) {
              vec3 p = ro + rd * t;
              vec3 n = getNormal(p);
              
              // Lighting
              vec3 L = normalize(vec3(1.0, 1.0, -1.0));
              float diff = max(dot(n, L), 0.0);
              float spec = pow(max(dot(reflect(-L, n), -rd), 0.0), 16.0);
              
              // Op-Art & Structural Color
              float viewAngle = max(dot(n, -rd), 0.0);
              float radial = sin(atan(p.y, p.x) * 8.0 + p.z * 4.0 - u_time * 3.0);
              float moire = sin(length(p.xy) * 20.0 - u_time * 4.0) * radial;
              float structuralHue = viewAngle * 1.5 + p.z * 0.1 + moire * 0.2;
              
              // Riso Halftone Pattern on Surface
              float lpi = 120.0;
              vec2 cell = fract(mat2(0.707, -0.707, 0.707, 0.707) * trackAspectUV * lpi) - 0.5;
              float ht = smoothstep(0.35, 0.15, length(cell));
              
              float intensity = diff * 0.6 + 0.2 + spec * 0.5;
              intensity *= mix(0.8, 1.2, ht);
              
              sceneColor = getDreamColor(intensity, structuralHue);
          } else {
              // Background: Moiré / Cross-Processed Haze
              float bgMoire = sin(length(trackUV - 0.5)*40.0 - u_time) * sin(trackUV.x*50.0);
              float bgHue = trackUV.x + trackUV.y + u_time * 0.1;
              float bgIntensity = 0.4 + 0.2 * bgMoire;
              
              // Secondary background halftone
              float bgLpi = 80.0;
              vec2 bgCell = fract(mat2(0.866, -0.5, 0.5, 0.866) * trackAspectUV * bgLpi) - 0.5;
              float bgHt = smoothstep(0.4, 0.2, length(bgCell));
              bgIntensity *= mix(0.9, 1.1, bgHt);
              
              sceneColor = getDreamColor(bgIntensity, bgHue);
              
              // Blend with datamosh history heavily in background
              sceneColor = mix(sceneColor, prevFrame.rgb, 0.85);
          }
          
          // 5. Rewind scars
          if (fract(u_time * 0.3) < 0.05 && abs(trackUV.y - 0.4) < 0.05) {
              sceneColor = mix(sceneColor, getDreamColor(0.9, trackUV.x * 3.0 - u_time), 0.8);
          }
          
          // 6. Early Internet Shrine (Asemic scrolling marquee)
          vec2 mqUV = trackUV;
          mqUV.x += u_time * 0.2;
          mqUV.x = fract(mqUV.x * 10.0);
          if (trackUV.y > 0.9 && trackUV.y < 0.93) {
              float textBlock = step(0.5, noise(floor(mqUV * vec2(10.0, 1.0))));
              if (textBlock > 0.5) {
                  sceneColor = getDreamColor(0.75, trackUV.x + u_time);
              }
          }
          
          // 7. Chroma Bleed / Ghosting
          vec3 bleedCol = texture(u_feedback, trackUV - vec2(0.015, 0.0)).rgb;
          float lDiff = abs(luma(sceneColor) - luma(bleedCol));
          sceneColor = mix(sceneColor, bleedCol, lDiff * 0.7);
          
          // 8. Floating UI Chips
          float uiHue = u_time * 0.15;
          vec2 uiP = abs(trackUV - vec2(0.2 + sin(u_time*0.5)*0.1, 0.7 + cos(u_time*0.3)*0.1)) - vec2(0.15, 0.1);
          float boxD = length(max(uiP, 0.0)) + min(max(uiP.x, uiP.y), 0.0);
          if (boxD < 0.0 && boxD > -0.01) {
              sceneColor = getDreamColor(0.9, uiHue); // Neon border
          } else if (boxD <= -0.01) {
              float popupMoire = sin(trackUV.x * 100.0) * sin(trackUV.y * 100.0 + u_time * 5.0);
              sceneColor = mix(sceneColor, getDreamColor(0.5 + popupMoire*0.2, uiHue + 0.3), 0.8);
          }
          
          // 9. Cursor Trail (Leaves CA seeds)
          vec2 cursorPos = vec2(0.5 + sin(u_time*1.3)*0.3, 0.5 + cos(u_time*1.7)*0.3);
          vec2 cursorD_vec = (trackUV - cursorPos) * vec2(u_resolution.x / u_resolution.y, 1.0);
          if (length(cursorD_vec) < 0.02) {
              sceneColor = getDreamColor(1.0, u_time);
              nextCA = 1.0;
          }
          
          // 10. Riso Misregistration & Ink Overlaps (Post-FX)
          vec3 c1 = sceneColor;
          vec3 c2 = prevFrame.rgb;
          vec3 risoBlend = getDreamColor(luma(c1 * c2) * 2.0, fract(uiHue + 0.3));
          sceneColor = mix(sceneColor, risoBlend, nextCA * 0.5);
          
          // 11. Tape dropouts (colored bursts)
          if (hash(trackUV + u_time * 2.1) > 0.992) {
              sceneColor = getDreamColor(0.9, hash(trackUV)); 
          }

          fragColor = vec4(sceneColor, nextCA);
      }
    `;

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_feedback: { value: null }
      },
      vertexShader: vert,
      fragmentShader: frag,
      depthWrite: false,
      depthTest: false
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    const blitMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { tDiffuse: { value: null } },
      vertexShader: vert,
      fragmentShader: `
        precision highp float;
        in vec2 vUv;
        uniform sampler2D tDiffuse;
        out vec4 fragColor;
        void main() {
          fragColor = vec4(texture(tDiffuse, vUv).rgb, 1.0);
        }
      `,
      depthWrite: false,
      depthTest: false
    });
    
    const blitScene = new THREE.Scene();
    blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMaterial));

    canvas.__three = { renderer, scene, camera, material, rtA, rtB, ping: 0, blitScene, blitMaterial };
  }

  const sys = canvas.__three;
  if (sys && sys.material && sys.material.uniforms && sys.material.uniforms.u_time) {
    sys.material.uniforms.u_time.value = time;
    sys.material.uniforms.u_resolution.value.set(grid.width, grid.height);
    
    const readRT = sys.ping === 0 ? sys.rtA : sys.rtB;
    const writeRT = sys.ping === 0 ? sys.rtB : sys.rtA;
    
    sys.material.uniforms.u_feedback.value = readRT.texture;
    
    sys.renderer.setSize(grid.width, grid.height, false);
    
    // Pass 1: Render state & scene to writeRT
    sys.renderer.setRenderTarget(writeRT);
    sys.renderer.render(sys.scene, sys.camera);
    
    // Pass 2: Blit writeRT to screen
    sys.blitMaterial.uniforms.tDiffuse.value = writeRT.texture;
    sys.renderer.setRenderTarget(null);
    sys.renderer.render(sys.blitScene, sys.camera);
    
    sys.ping = 1 - sys.ping;
  }
} catch (e) {
  console.error("WebGL 2 / Three.js Initialization Failed:", e);
}