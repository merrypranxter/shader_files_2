if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.autoClear = false;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const fboOpts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false
    };
    
    const fboA = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOpts);
    const fboB = new THREE.WebGLRenderTarget(grid.width, grid.height, fboOpts);

    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const bufferAFrag = `
      precision highp float;
      in vec2 vUv;
      out vec4 fragColor;
      
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform sampler2D u_prev;

      // Hashing & Noise (Glitchcore / Datamosh / Procedural Gen)
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
        return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
                   mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      mat2 rot(float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, -s, s, c);
      }

      // Hyperbolic Tiling Fold (Poincare approx via inversion)
      vec2 hypFold(vec2 p) {
        for(int i = 0; i < 4; i++) {
            p = abs(p) - 0.4;
            float r2 = dot(p, p);
            p = p * 1.3 / max(r2, 0.15);
            p *= rot(u_time * 0.1);
        }
        return p;
      }

      // Crystalline SDF (Octahedron/Diamond Reactor)
      float sdCrystal(vec3 p) {
        p.xy *= rot(u_time * 0.4);
        p.yz *= rot(u_time * 0.6);
        p = abs(p);
        float d1 = (p.x + p.y + p.z - 1.2) * 0.57735;
        float d2 = max(p.x, max(p.y, p.z)) - 0.8;
        return max(d1, d2);
      }

      // Early Internet Window Shard
      float sdWindow(vec2 p, vec2 center, vec2 size) {
        vec2 d = abs(p - center) - size;
        return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
      }

      void main() {
        vec2 uv = vUv;
        vec2 p = (uv - 0.5) * 2.0;
        p.x *= u_resolution.x / u_resolution.y;

        // Datamosh & Damage Analytics
        vec2 mv = vec2(noise(uv * 10.0 + u_time), noise(uv * 10.0 - u_time)) * 0.005;
        
        // Macroblock Snapping
        vec2 blockUV = floor(uv * 30.0) / 30.0;
        float moshTrigger = step(0.92, hash12(blockUV + floor(u_time * 3.0)));
        
        // Horizontal Tearing
        float tear = step(0.97, hash12(vec2(0.0, floor(uv.y * 15.0 + u_time * 2.0))));
        vec2 sampleUV = uv - mv;
        sampleUV.x += tear * 0.05 * sin(u_time * 15.0);
        sampleUV = mix(sampleUV, blockUV, moshTrigger);
        
        vec3 prev = texture(u_prev, sampleUV).rgb;

        vec3 scene = vec3(0.0);

        // 1. Hyperbolic Background Field
        vec2 hp = hypFold(p * (0.8 + 0.2 * sin(u_time * 0.5)));
        scene += vec3(0.1, 0.4, 0.8) * length(hp) * 0.3;
        scene += vec3(0.8, 0.1, 0.5) * abs(sin(hp.x * 10.0));

        // 2. Cuttlefish Chromatics (Cellular Skin)
        vec2 cid = floor(p * 6.0);
        vec2 cf = fract(p * 6.0);
        float cellD = 1.0;
        for(int y = -1; y <= 1; y++) {
            for(int x = -1; x <= 1; x++) {
                vec2 off = vec2(float(x), float(y));
                vec2 h = hash22(cid + off);
                vec2 pos = off + h;
                float r = 0.15 + 0.35 * sin(u_time * 4.0 + h.x * 10.0);
                float dist = length(cf - pos);
                cellD = min(cellD, smoothstep(r, r - 0.05, dist));
            }
        }
        scene = mix(scene, vec3(1.0, 0.8, 0.1), 1.0 - cellD);

        // 3. Crystalline Reactor (Raymarched Center)
        vec3 ro = vec3(0.0, 0.0, 3.0);
        vec3 rd = normalize(vec3(p, -1.5));
        float t = 0.0;
        float d = 0.0;
        float pulse = 1.0 + 0.15 * sin(u_time * 6.0);
        for(int i = 0; i < 40; i++) {
            vec3 pos = ro + rd * t;
            d = sdCrystal(pos / pulse) * pulse;
            if(d < 0.01 || t > 6.0) break;
            t += d;
        }

        if(d < 0.01) {
            vec3 pos = ro + rd * t;
            vec2 e = vec2(0.01, 0.0);
            vec3 n = normalize(vec3(
                sdCrystal((pos + e.xyy)/pulse) - sdCrystal((pos - e.xyy)/pulse),
                sdCrystal((pos + e.yxy)/pulse) - sdCrystal((pos - e.yxy)/pulse),
                sdCrystal((pos + e.yyx)/pulse) - sdCrystal((pos - e.yyx)/pulse)
            ));
            // Bragg Diffraction / Iridescence
            vec3 irid = 0.5 + 0.5 * cos(u_time * 2.0 + dot(n, vec3(1.0, 1.5, 2.0)) * 3.0 + vec3(0, 2, 4));
            scene = mix(scene, irid, 0.9);
            // Internal flare
            scene += vec3(1.0, 0.2, 0.5) * pow(max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0), 16.0) * 2.0;
        }

        // 4. Early Internet UI Debris
        vec2 winCenter = vec2(sin(u_time * 1.1) * 0.8, cos(u_time * 0.7) * 0.6);
        float winD = sdWindow(p, winCenter, vec2(0.3, 0.2));
        if(winD < 0.0) {
            scene = mix(scene, vec3(0.0, 1.0, 0.8), 0.7); // Cyan block
            if(abs(winD) < 0.02) scene = vec3(1.0, 0.0, 0.5); // Magenta border
            // Asemic text lines inside window
            float textLine = step(0.8, sin((p.y - winCenter.y) * 100.0));
            scene = mix(scene, vec3(0.1, 0.0, 0.3), textLine * step(abs(p.x - winCenter.x), 0.25));
        }

        // Temporal Feedback Composite (Demoscene Motion Blur & Ghosting)
        float feedback = 0.85 + 0.1 * sin(u_time * 1.5);
        vec3 finalCol = mix(scene, prev, feedback);

        // Glitchcore Rupture (Sudden invert)
        if(step(0.995, hash12(vec2(u_time, uv.y))) > 0.5) {
            finalCol = vec3(1.0) - finalCol;
        }

        fragColor = vec4(finalCol, 1.0);
      }
    `;

    const postFrag = `
      precision highp float;
      in vec2 vUv;
      out vec4 fragColor;
      
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform sampler2D u_buffer;

      // Color Systems: OKLab conversions for perceptual safety
      vec3 linear_srgb_to_oklab(vec3 c) {
          float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
          float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
          float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
          float l_ = pow(max(l, 0.0), 1.0/3.0);
          float m_ = pow(max(m, 0.0), 1.0/3.0);
          float s_ = pow(max(s, 0.0), 1.0/3.0);
          return vec3(
              0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_,
              1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_,
              0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_
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
               4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
              -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
              -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
          );
      }

      vec3 enforceColorSafety(vec3 col) {
          vec3 lab = linear_srgb_to_oklab(col);
          
          // ABSOLUTE COLOR LAW: No pure black, no pure white
          lab.x = clamp(lab.x, 0.25, 0.85); 
          
          // Boost Chroma massively
          lab.y *= 1.8;
          lab.z *= 1.8;
          
          // Continuous hue rotation to keep it alive
          float theta = u_time * 0.15;
          float cs = cos(theta), sn = sin(theta);
          vec2 rot = vec2(lab.y * cs - lab.z * sn, lab.y * sn + lab.z * cs);
          lab.y = rot.x; 
          lab.z = rot.y;

          vec3 rgb = oklab_to_linear_srgb(lab);
          return clamp(rgb, 0.0, 1.0);
      }

      void main() {
        vec2 uv = vUv;
        vec2 px = gl_FragCoord.xy;

        // 1. Chromatic Aberration (Radial)
        vec2 dir = normalize(uv - 0.5);
        float dist = length(uv - 0.5);
        float ca = 0.02 * dist * (1.0 + sin(u_time * 4.0) * 0.5);
        vec3 col;
        col.r = texture(u_buffer, uv + dir * ca).r;
        col.g = texture(u_buffer, uv).g;
        col.b = texture(u_buffer, uv - dir * ca).b;

        // 2. Anamorphic Lens Flares (Horizontal & Vertical Streaks)
        vec3 flare = vec3(0.0);
        float w = 0.0;
        for(float i = -15.0; i <= 15.0; i += 1.0) {
            vec2 fuvX = uv + vec2(i * 0.02, 0.0);
            if(fuvX.x > 0.0 && fuvX.x < 1.0) {
                vec3 s = texture(u_buffer, fuvX).rgb;
                float luma = dot(s, vec3(0.299, 0.587, 0.114));
                flare += s * smoothstep(0.6, 1.0, luma) * (1.0 - abs(i)/15.0);
                w += 1.0;
            }
        }
        if(w > 0.0) flare /= w;
        col += flare * vec3(0.1, 0.8, 1.0) * 1.5; // Cyan bias

        // 3. Halftone Mosaic
        float luma = dot(col, vec3(0.299, 0.587, 0.114));
        float dotP = sin(px.x * 0.6) * sin(px.y * 0.6);
        float ht = smoothstep(luma - 0.15, luma + 0.15, dotP * 0.5 + 0.5);
        col = mix(col, col * 0.4, ht * 0.6);

        // 4. CRT Phosphor Triads & Scanlines
        float triad = mod(px.x, 3.0);
        vec3 mask = vec3(
            smoothstep(1.0, 0.0, abs(triad - 0.0)),
            smoothstep(1.0, 0.0, abs(triad - 1.0)),
            smoothstep(1.0, 0.0, abs(triad - 2.0))
        );
        col *= mix(vec3(1.0), mask, 0.7);
        float scan = 0.5 + 0.5 * sin(uv.y * u_resolution.y * 1.2 - u_time * 8.0);
        col *= mix(1.0, scan, 0.25);

        // 5. Color Safety (Perceptual vividness, block black/white)
        col = enforceColorSafety(col);

        // 6. Chromatic Vignette / Phosphor Glow Base
        float vig = 1.0 - smoothstep(0.4, 1.5, dist);
        col *= vig;
        
        // Prevent darks from ever being pure black - enforce deep indigo/plum
        vec3 deepChromaticDark = vec3(0.15, 0.0, 0.3); // Plum/Indigo
        col = max(col, deepChromaticDark);

        fragColor = vec4(col, 1.0);
      }
    `;

    const matA = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_prev: { value: null }
      },
      vertexShader,
      fragmentShader: bufferAFrag,
      depthWrite: false,
      depthTest: false
    });

    const matPost = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_buffer: { value: null }
      },
      vertexShader,
      fragmentShader: postFrag,
      depthWrite: false,
      depthTest: false
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matA);
    scene.add(quad);

    canvas.__three = { renderer, scene, camera, fboA, fboB, matA, matPost, quad, pingpong: 0 };
  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
    return;
  }
}

const t = canvas.__three;

t.renderer.setSize(grid.width, grid.height, false);

t.matA.uniforms.u_time.value = time;
t.matA.uniforms.u_resolution.value.set(grid.width, grid.height);

t.matPost.uniforms.u_time.value = time;
t.matPost.uniforms.u_resolution.value.set(grid.width, grid.height);

const readFBO = t.pingpong % 2 === 0 ? t.fboA : t.fboB;
const writeFBO = t.pingpong % 2 === 0 ? t.fboB : t.fboA;

// Pass 1: Render Scene + Feedback to Write FBO
t.matA.uniforms.u_prev.value = readFBO.texture;
t.quad.material = t.matA;
t.renderer.setRenderTarget(writeFBO);
t.renderer.render(t.scene, t.camera);

// Pass 2: Render Post to Screen
t.matPost.uniforms.u_buffer.value = writeFBO.texture;
t.quad.material = t.matPost;
t.renderer.setRenderTarget(null);
t.renderer.render(t.scene, t.camera);

t.pingpong++;