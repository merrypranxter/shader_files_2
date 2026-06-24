if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, grid.width / grid.height, 0.1, 1000);
    camera.position.z = 1;

    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      in vec2 vUv;
      out vec4 fragColor;
      
      uniform float u_time;
      uniform vec2 u_resolution;

      // ─── HASH & NOISE ───────────────────────────────────────────────────────
      float hash(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
      }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      float fbm(vec2 p) {
          float f = 0.0;
          float w = 0.5;
          for(int i = 0; i < 3; i++) {
              f += w * noise(p);
              p *= 2.0;
              w *= 0.5;
          }
          return f;
      }

      // ─── PALETTE ────────────────────────────────────────────────────────────
      vec3 getPalette(float t) {
          t = fract(t);
          float p = t * 5.0;
          float f = smoothstep(0.0, 1.0, fract(p));
          
          vec3 cyan    = vec3(0.0, 0.8, 0.9);
          vec3 violet  = vec3(0.5, 0.0, 0.9);
          vec3 magenta = vec3(0.9, 0.0, 0.5);
          vec3 orange  = vec3(1.0, 0.4, 0.0);
          vec3 acid    = vec3(0.6, 0.9, 0.0);
          
          if (p < 1.0) return mix(cyan, violet, f);
          if (p < 2.0) return mix(violet, magenta, f);
          if (p < 3.0) return mix(magenta, orange, f);
          if (p < 4.0) return mix(orange, acid, f);
          return mix(acid, cyan, f);
      }

      // ─── SDFs ───────────────────────────────────────────────────────────────
      float sdBox(vec2 p, vec2 b) {
          vec2 d = abs(p) - b;
          return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
      }

      float sdHexagon(vec2 p, float s) {
          const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
          p = abs(p);
          p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
          p -= vec2(clamp(p.x, -k.z * s, k.z * s), s);
          return length(p) * sign(p.y);
      }

      // ─── SCENE RENDERER ─────────────────────────────────────────────────────
      vec3 renderScene(vec2 uv, float time) {
          // Heat haze & Schlieren flow background
          vec2 q = uv;
          q.x += fbm(uv * 2.5 + time * 0.25) * 0.15;
          q.y += fbm(uv * 2.5 - time * 0.25) * 0.15;
          
          float heat = fbm(q * 3.0 + time * 0.15);
          vec3 col = getPalette(heat * 0.6 + time * 0.08);
          col *= 0.5 + 0.5 * fbm(uv * 8.0); // Rich midtone texture
          
          // Drifting Glass Panes (Collage Fragments)
          vec2 p1 = uv - vec2(sin(time * 0.3) * 0.4, cos(time * 0.25) * 0.3);
          float a1 = time * 0.15;
          mat2 r1 = mat2(cos(a1), -sin(a1), sin(a1), cos(a1));
          float d1 = sdBox(p1 * r1, vec2(0.25, 0.35)) - 0.08;
          
          vec2 p2 = uv - vec2(cos(time * 0.2) * 0.5, sin(time * 0.3) * 0.2);
          float a2 = -time * 0.1;
          mat2 r2 = mat2(cos(a2), -sin(a2), sin(a2), cos(a2));
          float d2 = sdBox(p2 * r2, vec2(0.35, 0.2)) - 0.12;

          // Glass Refraction & Illumination
          if (d1 < 0.0) {
              vec2 refUV = uv + vec2(0.04) * fbm(uv * 6.0 + time);
              col = getPalette(fbm(refUV * 3.0 - time * 0.1) * 0.6 + 0.3) * 1.15;
              col *= 0.7 + 0.3 * smoothstep(-0.1, 0.0, d1); // Inner shadow
          }
          col += vec3(0.7, 0.9, 1.0) * smoothstep(0.012, 0.0, abs(d1)); // Edge highlight

          if (d2 < 0.0) {
              vec2 refUV = uv - vec2(0.05) * fbm(uv * 5.0 - time);
              vec3 refCol = getPalette(fbm(refUV * 4.0 + time * 0.12) * 0.5 + 0.7) * 1.2;
              col = mix(col, refCol, 0.85);
              col *= 0.75 + 0.25 * smoothstep(-0.1, 0.0, d2);
          }
          col += vec3(0.8, 0.95, 1.0) * smoothstep(0.012, 0.0, abs(d2));
          
          // Central Geomantic Sigil
          mat2 rS = mat2(cos(time * 0.08), -sin(time * 0.08), sin(time * 0.08), cos(time * 0.08));
          vec2 suv = uv * rS;
          
          float hex = sdHexagon(suv, 0.22);
          float circ = length(suv) - 0.22;
          float circ2 = length(suv) - 0.18;
          float diag1 = abs(suv.x + suv.y) * 0.707 - 0.002;
          float diag2 = abs(suv.x - suv.y) * 0.707 - 0.002;
          
          float sigil = abs(hex) - 0.003;
          sigil = min(sigil, abs(circ) - 0.002);
          sigil = min(sigil, abs(circ2) - 0.004);
          
          if(length(suv) < 0.18) {
              sigil = min(sigil, diag1);
              sigil = min(sigil, diag2);
          }
          
          float glow = exp(-sigil * 45.0);
          float core = smoothstep(0.006, 0.0, sigil);
          
          col += vec3(1.0, 0.9, 0.7) * core;
          col += getPalette(time * 0.25 + length(uv)) * glow * 0.5; // Occult luminous bleed
          
          // Subtle White Sparkle Accents
          float sp = noise(uv * 60.0 + time * 1.5);
          if (sp > 0.82) {
              col += vec3(1.0) * pow((sp - 0.82) / 0.18, 3.0) * 0.4;
          }

          return col;
      }

      void main() {
          vec2 uv = (vUv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
          
          vec3 finalColor = vec3(0.0);
          float wSum = 0.0;
          float decay = 0.65;
          float dt = 0.025; // Temporal spread for afterimage trails
          
          // ─── PULFRICH & TEMPORAL MULTI-SAMPLE ───────────────────────────
          // Integrates motion trails and chromatic aberration in one pass
          for(int i = 0; i < 6; i++) {
              float fi = float(i);
              float t = u_time - fi * dt;
              float w = pow(decay, fi);
              
              // Chromatic aberration via temporal offset (moving objects split RGB)
              float tR = t;
              float tG = t - 0.012;
              float tB = t - 0.024;
              
              vec3 cR = renderScene(uv, tR);
              vec3 cG = renderScene(uv, tG);
              vec3 cB = renderScene(uv, tB);
              
              finalColor += vec3(cR.r, cG.g, cB.b) * w;
              wSum += w;
          }
          
          finalColor /= wSum;
          
          // ─── POLISHED ANALOG SCREEN DAMAGE ──────────────────────────────
          // Scanlines
          finalColor *= 0.96 + 0.04 * sin(vUv.y * u_resolution.y * 2.5);
          
          // Soft Vignette
          float vig = length(vUv - 0.5);
          finalColor *= smoothstep(0.85, 0.25, vig);
          
          // Delicate CRT Phosphor Grain
          float grain = fract(sin(dot(vUv + u_time, vec2(12.9898, 78.233))) * 43758.5453);
          finalColor += (grain - 0.5) * 0.05;
          
          fragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader,
      fragmentShader
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
  if (material.uniforms.u_time) {
    material.uniforms.u_time.value = time;
  }
  if (material.uniforms.u_resolution) {
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);