if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");
    
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    const fragmentShader = `
      out vec4 fragColor;
      in vec2 vUv;
      
      uniform float u_time;
      uniform vec2 u_resolution;

      const float PI = 3.14159265359;

      // Noise & Hash Functions
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float hash1(float n) { return fract(sin(n)*43758.5453); }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      // Early Internet Window Cascade Logic
      vec2 winCascade(vec2 uv, float t) {
          float id = floor(t * 3.0);
          vec2 offset = vec2(hash1(id)*1.5 - 0.75, hash1(id+10.0)*1.5 - 0.75);
          vec2 boxUv = uv - offset;
          
          float winW = 0.4;
          float winH = 0.3;
          float titleH = 0.05;
          
          float isBox = step(abs(boxUv.x), winW) * step(abs(boxUv.y), winH);
          float isTitle = isBox * step(winH - titleH, boxUv.y);
          float isBody = isBox * (1.0 - isTitle);
          
          float activeCas = step(0.4, hash1(id+20.0));
          
          vec2 newUv = uv;
          // Body repeats (tiled background logic)
          newUv = mix(newUv, fract(boxUv * 4.0) - 0.5, isBody * activeCas);
          // Title bar distorts to a solid color line
          newUv = mix(newUv, vec2(0.0), isTitle * activeCas);
          
          return newUv;
      }

      // Optical Illusion Pattern (Spiral / Grid Morph)
      float illusion(vec2 uv, float t) {
          float r = length(uv);
          float a = atan(uv.y, uv.x);
          
          // Archimedean spiral
          float s = sin(60.0 * r - 6.0 * a - t * 10.0);
          
          // Concentric grid interference
          float g = sin(80.0 * uv.x) * sin(80.0 * uv.y);
          
          // Morphing between spiral and grid
          float morph = 0.5 + 0.5 * sin(t * 0.5);
          float v = mix(s, g, morph);
          
          return smoothstep(-0.15, 0.15, v);
      }

      void main() {
          vec2 uv = vUv;
          vec2 centerUv = uv * 2.0 - 1.0;
          centerUv.x *= u_resolution.x / u_resolution.y;
          
          float t = u_time;
          
          // 1. VHS Tracking Tear
          float tearY = hash1(floor(t * 6.0));
          float isTear = step(0.93, 1.0 - abs(uv.y - tearY));
          centerUv.x += isTear * (hash(vec2(t, uv.y)) - 0.5) * 0.6;
          
          // 2. Window Cascades
          vec2 cascUv = winCascade(centerUv, t);
          
          // 3. Datamosh Macroblocking
          vec2 blockUv = floor(cascUv * 25.0) / 25.0;
          float moshTrigger = step(0.75, hash(blockUv + floor(t * 4.0)));
          vec2 moshOffset = vec2(noise(blockUv * 12.0), noise(blockUv * 22.0)) * 2.0 - 1.0;
          vec2 finalUv = mix(cascUv, cascUv + moshOffset * 0.4, moshTrigger);
          
          // 4. Base Optical Illusion (B&W)
          float m = illusion(finalUv, t);
          vec3 baseCol = vec3(m); 
          
          // 5. MySpace Hyperpop Palette
          vec3 colA = vec3(0.5);
          vec3 colB = vec3(0.5);
          vec3 colC = vec3(1.0);
          vec3 colD = vec3(0.8, 0.1, 0.6); // Hot Pink & Cyan
          vec3 neonCol = colA + colB * cos(PI * 2.0 * (colC * (length(finalUv) - t * 0.4) + colD));
          
          // Toxic accents (Acid Lime & Electric Cyan)
          neonCol = mix(neonCol, vec3(0.0, 1.0, 0.9), step(0.9, sin(finalUv.x * 15.0 + t)));
          neonCol = mix(neonCol, vec3(0.8, 1.0, 0.0), step(0.95, sin(finalUv.y * 25.0 - t)));
          
          // 6. Chromatic Aberration (RGB Split)
          float shift = 0.05 * hash1(floor(t * 8.0));
          float rM = illusion(finalUv + vec2(shift, 0.0), t);
          float bM = illusion(finalUv - vec2(shift, 0.0), t);
          vec3 glitchCol = vec3(rM, m, bM);
          
          // 7. Spatial Masking (B&W vs Color)
          float zoneMask = noise(finalUv * 2.5 + t * 0.3);
          vec3 compCol = mix(baseCol, neonCol, smoothstep(0.35, 0.65, zoneMask));
          
          // Apply RGB Glitch
          compCol = mix(compCol, glitchCol, step(0.65, zoneMask) * moshTrigger);
          
          // 8. Missing Texture Checkerboard
          vec2 checkUv = floor(finalUv * 12.0);
          float check = mod(checkUv.x + checkUv.y, 2.0);
          vec3 missingTex = mix(vec3(0.0), vec3(1.0, 0.0, 1.0), check);
          compCol = mix(compCol, missingTex, step(0.96, noise(finalUv * 3.0 - t)));
          
          // 9. MySpace Glitter / Sparkle
          float sparkleNoise = hash(finalUv * 150.0 + t);
          float sparkle = step(0.97, sparkleNoise);
          float twinkle = 0.5 + 0.5 * sin(t * 25.0 + sparkleNoise * 100.0);
          compCol += sparkle * twinkle * vec3(1.0, 0.4, 0.9) * 2.0;
          
          // 10. Fake UI Cursor
          float cursorX = fract(t * 0.6) * 3.0 - 1.5;
          float cursorY = sin(t * 3.0) * 0.8;
          vec2 cursorUv = finalUv - vec2(cursorX, cursorY);
          float cursor = step(abs(cursorUv.x), 0.03) * step(abs(cursorUv.y), 0.05);
          compCol = mix(compCol, vec3(1.0), cursor);
          
          // 11. CRT Textures & Vignette
          float scanline = sin(uv.y * 600.0);
          compCol -= scanline * 0.04;
          
          float vignette = length(uv - 0.5);
          compCol *= smoothstep(0.85, 0.2, vignette);
          
          fragColor = vec4(compCol, 1.0);
      }
    `;
    
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: fragmentShader
    });
    
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    
    canvas.__three = { renderer, scene, camera, material };
  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
    return;
  }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms) {
  if (material.uniforms.u_time) material.uniforms.u_time.value = time;
  if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(grid.width, grid.height);
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);