export function render(ctx, grid, time, repos, input, mouse, canvas, THREE) {
  if (!canvas.__three) {
    try {
      if (!ctx) throw new Error("WebGL2 context not available");

      const renderer = new THREE.WebGLRenderer({
        canvas,
        context: ctx,
        alpha: true,
        antialias: true,
      });
      
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 1;

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

        #define PI 3.14159265359
        #define TAU 6.28318530718

        // --- Core Noise & Hashing ---
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), f.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }

        float fbm(vec2 p) {
            float f = 0.0;
            float amp = 0.5;
            for(int i = 0; i < 3; i++) {
                f += amp * noise(p);
                p = mat2(0.8, -0.6, 0.6, 0.8) * p * 2.0;
                amp *= 0.5;
            }
            return f;
        }

        // --- Palette Generator (Candy-Acid / Spectral Color / Palette Cycling) ---
        vec3 candyAcid(float t) {
            t = fract(t);
            vec3 col;
            if(t < 0.166) col = mix(vec3(1.0, 0.0, 0.6), vec3(1.0, 1.0, 0.0), t * 6.0);
            else if(t < 0.333) col = mix(vec3(1.0, 1.0, 0.0), vec3(0.5, 1.0, 0.0), (t - 0.166) * 6.0);
            else if(t < 0.500) col = mix(vec3(0.5, 1.0, 0.0), vec3(0.0, 1.0, 1.0), (t - 0.333) * 6.0);
            else if(t < 0.666) col = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 0.3, 1.0), (t - 0.500) * 6.0);
            else if(t < 0.833) col = mix(vec3(0.0, 0.3, 1.0), vec3(0.6, 0.0, 1.0), (t - 0.666) * 6.0);
            else col = mix(vec3(0.6, 0.0, 1.0), vec3(1.0, 0.0, 0.6), (t - 0.833) * 6.0);
            
            // White-hot / ultraviolet highlights (Op Art / Neon)
            float hl = pow(sin(t * PI * 12.0) * 0.5 + 0.5, 16.0);
            col += vec3(hl);
            return col;
        }

        // --- Spatial Transforms (Kaleidoscope / Phosphene) ---
        vec2 logPolar(vec2 p) {
            float r = max(length(p), 0.001);
            return vec2(log(r), atan(p.y, p.x));
        }

        vec2 fold(vec2 p, float sectors) {
            float a = atan(p.y, p.x);
            float r = length(p);
            float s = TAU / sectors;
            a = mod(a + TAU, TAU);
            a = mod(a, s);
            a = s * 0.5 - abs(a - s * 0.5);
            return vec2(cos(a), sin(a)) * r;
        }

        // --- Cellular Logic (I-Ching / Abelian Sandpile) ---
        float hexagrams(vec2 p) {
            vec2 id = floor(p);
            vec2 lv = fract(p);
            float h = hash(id + floor(u_time * 2.0)); 
            float lineIdx = floor(lv.y * 6.0);
            float bit = step(0.5, fract(h * exp2(lineIdx + 1.0)));
            
            float isBroken = 1.0 - bit;
            float gap = step(abs(lv.x - 0.5), 0.1) * isBroken;
            float barX = step(0.15, lv.x) * step(lv.x, 0.85);
            float barY = step(0.1, fract(lv.y * 6.0)) * step(fract(lv.y * 6.0), 0.9);
            
            return barX * barY * (1.0 - gap);
        }

        // --- Damage Aesthetics (Macroblocking) ---
        vec2 macroblock(vec2 p) {
            float blockSize = 0.15;
            vec2 id = floor(p / blockSize);
            float h = hash(id + floor(u_time * 4.0));
            if(h > 0.95) {
                return p + (hash(id) - 0.5) * 0.08;
            }
            return p;
        }

        // --- Core Rendering Engine ---
        vec3 render(vec2 p) {
            // 1. Glitch Textiles: Tracking Tear & Tape Decay
            float tear = smoothstep(0.8, 1.0, sin(p.y * 5.0 - u_time * 2.0));
            p.x += sin(p.y * 40.0 + u_time * 20.0) * 0.03 * tear;
            
            float tapeDecay = step(0.99, hash(vec2(floor(p.y * 50.0), floor(u_time * 12.0))));
            p.x += tapeDecay * 0.05;

            // 2. Codec Damage
            p = macroblock(p);

            // 3. Kaleidoscope Engine (D_6 Symmetry)
            vec2 pFold = fold(p, 6.0); 
            
            // 4. Prism Dispersion Setup (Raymarching offset proxy)
            vec2 dir = normalize(pFold) * 0.04 * (1.0 + fbm(pFold * 4.0 + u_time));
            
            vec3 col = vec3(0.0);
            float wSum = 0.0;
            
            // 5. Spectral Integration (Metamerism / Chromatic Aberration)
            for(int i = 0; i < 7; i++) {
                float t = float(i) / 6.0;
                vec2 pDisp = pFold + dir * (t - 0.5); 
                
                // 6. Phosphene Field (Log-Polar Cortical Map)
                vec2 lp = logPolar(pDisp);
                lp.x -= u_time * 0.5; // Diving
                lp.y += sin(u_time * 0.2) * 0.5; // Spiral drift
                
                // 7. Fluid Dynamics / Tension Chaos (Domain Warping)
                vec2 warp = vec2(
                    fbm(lp * 3.0 + vec2(u_time * 0.4, 0.0)),
                    fbm(lp * 3.0 - vec2(0.0, u_time * 0.3))
                );
                vec2 lpWarp = lp + warp * 0.5;
                
                // 8. Op Art / Zebra Waves
                float wave = sin(lpWarp.x * 15.0 + sin(lpWarp.y * 10.0));
                
                // 9. I-Ching Hexagrams / Sandpile Fractaling
                float cells = hexagrams(lpWarp * 4.0);
                
                // 10. Reaction-Diffusion Bloom (Opal / Color Cycling)
                float rd = fbm(lpWarp * 5.0 - u_time * 0.6);
                
                // Unified Soup Field
                float f = wave * 0.25 + cells * rd * 0.8 + rd * 0.4;
                
                // Palette Rotation (Color Cycling)
                vec3 spectralColor = candyAcid(f * 1.5 + t * 0.6 + u_time * 0.2);
                
                // 11. Phosphene Cobweb / Scintillating Grid
                float gridX = step(0.92, fract(lpWarp.x * 6.0));
                float gridY = step(0.92, fract(lpWarp.y * 6.0));
                float cobweb = max(gridX, gridY) * 0.5 + (gridX * gridY) * 2.0; 
                spectralColor += vec3(0.1, 1.0, 0.8) * cobweb * rd; 
                
                // Afterimage Painter (Opponent Color Ghosting on edges)
                spectralColor = mix(spectralColor, vec3(1.0) - spectralColor, smoothstep(0.9, 1.0, f));
                
                float weight = 1.0 - abs(t - 0.5); 
                col += spectralColor * weight;
                wSum += weight;
            }
            col /= wSum;
            
            // 12. Psychedelic Collage (Risograph Halftone Artifacts)
            float luma = dot(col, vec3(0.299, 0.587, 0.114));
            vec2 htCell = fract(p * 200.0) - 0.5;
            float radius = sqrt(luma) * 0.6;
            float ht = smoothstep(radius, radius - 0.1, length(htCell));
            
            col = mix(col * ht, col, 0.6); 
            
            return col;
        }

        // --- ACES Tonemapping ---
        vec3 aces(vec3 x) {
            const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
            return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
        }

        void main() {
            vec2 uv = (vUv - 0.5) * 2.0;
            uv.x *= u_resolution.x / u_resolution.y;
            
            // Global Rotation 
            float a = u_time * 0.1;
            float s = sin(a), c = cos(a);
            uv = mat2(c, -s, s, c) * uv;
            
            vec3 col = render(uv);
            
            // Vignette
            float vig = 1.0 - dot(uv, uv) * 0.15;
            col *= vig;
            
            // Tonemap & Gamma
            col = aces(col);
            col = pow(col, vec3(1.0 / 2.2));
            
            fragColor = vec4(col, 1.0);
        }
      `;

      const material = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
          u_time: { value: 0 },
          u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        },
        vertexShader,
        fragmentShader,
        depthWrite: false,
        depthTest: false,
      });

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
      scene.add(mesh);

      canvas.__three = { renderer, scene, camera, material };
    } catch (e) {
      console.error("WebGL Initialization Failed:", e);
      throw e;
    }
  }

  const { renderer, scene, camera, material } = canvas.__three;

  if (material && material.uniforms) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }

  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);
}