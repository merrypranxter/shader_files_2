if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      context: ctx,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: false
    });

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;

        uniform float u_time;
        uniform vec2 u_resolution;
        uniform vec2 u_mouse;

        in vec2 vUv;
        out vec4 fragColor;

        // ─── Mathematical Utilities ───
        
        float hash21(vec2 p) {
            p = fract(p * vec2(127.1, 311.7));
            p += dot(p, p + 19.19);
            return fract(p.x * p.y);
        }

        vec2 hash22(vec2 p) {
            p = vec2(dot(p, vec2(127.1, 311.7)),
                     dot(p, vec2(269.5, 183.3)));
            return fract(sin(p) * 43758.5453);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            float a = hash21(i);
            float b = hash21(i + vec2(1.0, 0.0));
            float c = hash21(i + vec2(0.0, 1.0));
            float d = hash21(i + vec2(1.0, 1.0));
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 4; i++) {
                v += a * noise(p);
                p *= 2.0;
                a *= 0.5;
            }
            return v;
        }

        vec2 cdiv(vec2 a, vec2 b) {
            float d = dot(b, b);
            return vec2(dot(a, b), a.y*b.x - a.x*b.y) / (d + 1e-6);
        }

        vec3 rotateHue(vec3 color, float angle) {
            vec3 k = vec3(0.57735, 0.57735, 0.57735);
            float cosAngle = cos(angle);
            return color * cosAngle + cross(k, color) * sin(angle) + k * dot(k, color) * (1.0 - cosAngle);
        }

        // ─── Halftone Pattern Generator ───
        
        vec3 applyHalftone(vec2 uv, vec3 color, float time) {
            float density = 90.0 + sin(time * 0.5) * 20.0;
            float c_screen = sin((uv.x * cos(0.26) - uv.y * sin(0.26)) * density) * sin((uv.x * sin(0.26) + uv.y * cos(0.26)) * density);
            float m_screen = sin((uv.x * cos(1.31) - uv.y * sin(1.31)) * density) * sin((uv.x * sin(1.31) + uv.y * cos(1.31)) * density);
            float y_screen = sin(uv.x * density) * sin(uv.y * density);
            
            vec3 finalColor = color;
            finalColor.r = mix(finalColor.r, 0.0, step(0.5, c_screen) * 0.18);
            finalColor.g = mix(finalColor.g, 0.0, step(0.5, m_screen) * 0.18);
            finalColor.b = mix(finalColor.b, 0.0, step(0.5, y_screen) * 0.18);
            return finalColor;
        }

        // ─── Cuttlefish Chromatophore Grid ───
        
        float cuttlefishSkin(vec2 uv, float time) {
            vec2 st = uv * 24.0;
            vec2 ip = floor(st);
            vec2 fp = fract(st);
            float minDist = 1e10;
            float activation = 0.0;
            
            for (int y = -1; y <= 1; y++) {
                for (int x = -1; x <= 1; x++) {
                    vec2 neighbor = vec2(float(x), float(y));
                    vec2 cellId = ip + neighbor;
                    vec2 jitter = hash22(cellId);
                    vec2 pos = neighbor + jitter - fp;
                    float dist = dot(pos, pos);
                    
                    if (dist < minDist) {
                        minDist = dist;
                        float wave = sin(dot(cellId, vec2(0.12, 0.07)) - time * 3.5) * 0.5 + 0.5;
                        activation = wave;
                    }
                }
            }
            
            float r = 0.14 * (1.0 + 1.24 * activation);
            return smoothstep(r, r * 0.5, sqrt(minDist));
        }

        vec3 applyCuttlefishSkin(vec2 uv, vec3 sceneColor, float time) {
            float skinCoverage = cuttlefishSkin(uv, time);
            vec3 yellowPigment = vec3(0.910, 0.722, 0.294); 
            vec3 redPigment    = vec3(0.710, 0.314, 0.165); 
            
            vec3 finalColor = mix(sceneColor, yellowPigment, skinCoverage * 0.65);
            finalColor = mix(finalColor, redPigment, step(0.55, skinCoverage) * 0.45);
            return finalColor;
        }

        // ─── Early Internet Browser Debris ───
        
        float boxSDF(vec2 p, vec2 b, float r) {
            vec2 d = abs(p) - b + r;
            return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
        }

        vec3 renderBrowserDebris(vec2 uv, float time, vec3 baseColor) {
            vec3 col = baseColor;
            
            vec2 center = vec2(sin(time * 0.4) * 0.35, cos(time * 0.3) * 0.25);
            vec2 p = uv - 0.5 - center;
            
            float c = cos(0.08 * time), s = sin(0.08 * time);
            p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
            
            float d = boxSDF(p, vec2(0.24, 0.16), 0.008);
            
            float shadow = smoothstep(0.0, 0.06, boxSDF(p + vec2(0.015, -0.015), vec2(0.24, 0.16), 0.008));
            col = mix(col, vec3(0.03, 0.01, 0.08), (1.0 - shadow) * 0.5);
            
            if (d < 0.0) {
                if (d > -0.004) {
                    col = vec3(0.95, 0.95, 1.0); 
                } else if (p.y > 0.11) {
                    col = mix(vec3(0.6, 0.0, 0.9), vec3(0.0, 0.85, 0.95), (p.x + 0.24) / 0.48);
                } else {
                    vec2 screenGrid = p * 64.0;
                    float dotPattern = sin(screenGrid.x) * sin(screenGrid.y);
                    vec3 halftoneColor = mix(vec3(0.85, 0.12, 0.48), vec3(0.1, 0.92, 0.55), uv.y);
                    col = mix(halftoneColor, vec3(0.08, 0.02, 0.18), step(0.0, dotPattern));
                }
            }
            
            return col;
        }

        // ─── Newton Basin Fractal Core ───
        
        vec3 computeNewtonCore(vec2 uv, float time) {
            vec2 z = (uv - 0.5) * 2.2;
            
            float c = cos(time * 0.12), s = sin(time * 0.12);
            z = vec2(z.x * c - z.y * s, z.x * s + z.y * c);
            
            vec2 roots[3];
            roots[0] = vec2(1.0, 0.0);
            roots[1] = vec2(-0.5, 0.866025);
            roots[2] = vec2(-0.5, -0.866025);
            
            float min_dist = 1e10;
            int root_idx = 0;
            
            for (int i = 0; i < 7; i++) {
                vec2 z2 = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y);
                vec2 z3 = vec2(z2.x*z.x - z2.y*z.y, z2.x*z.y + z2.y*z.x);
                vec2 fz = z3 - vec2(1.0, 0.0);
                vec2 fpz = 3.0 * z2;
                
                z = z - cdiv(fz, fpz);
            }
            
            for (int k = 0; k < 3; k++) {
                float d = length(z - roots[k]);
                if (d < min_dist) {
                    min_dist = d;
                    root_idx = k;
                }
            }
            
            vec3 root_colors[3];
            root_colors[0] = vec3(0.95, 0.15, 0.5); 
            root_colors[1] = vec3(0.0, 0.92, 0.85);  
            root_colors[2] = vec3(0.82, 0.95, 0.1); 
            
            vec3 base_color = root_colors[root_idx];
            float shade = exp(-min_dist * 6.5);
            return mix(base_color, vec3(0.06, 0.03, 0.18), 1.0 - shade);
        }

        // ─── Datamosh Motion-Vector Drag ───
        
        vec2 datamoshFlow(vec2 uv, float time) {
            float n1 = noise(uv * 3.5 + time * 0.18);
            float n2 = noise(uv * 3.5 - time * 0.12 + 8.0);
            return vec2(cos(n1 * 6.283), sin(n2 * 6.283)) * 0.055;
        }

        // ─── Anamorphic Lens Flares ───
        
        vec3 applyAnamorphicFlares(vec2 uv, vec3 color, float time) {
            float flare1 = exp(-pow(uv.y - 0.5, 2.0) / 0.00018);
            float flare2 = exp(-pow(uv.y - 0.28, 2.0) / 0.00008);
            float flare3 = exp(-pow(uv.y - 0.72, 2.0) / 0.0003);
            
            vec3 spectral1 = 0.5 + 0.5 * cos(uv.x * 10.0 + time + vec3(0.0, 2.0, 4.0));
            vec3 spectral2 = 0.5 + 0.5 * cos(uv.x * 7.0 - time * 1.3 + vec3(1.0, 3.0, 5.0));
            vec3 spectral3 = 0.5 + 0.5 * cos(uv.x * 13.0 + time * 0.4 + vec3(2.0, 4.0, 6.0));
            
            vec3 finalColor = color;
            finalColor += spectral1 * flare1 * 0.55;
            finalColor += spectral2 * flare2 * 0.38;
            finalColor += spectral3 * flare3 * 0.45;
            
            return finalColor;
        }

        // ─── Chromatic Safety Pass (No Black / No White) ───
        
        vec3 chromaticSafety(vec3 color, float time) {
            vec3 darkIndigo = vec3(0.047, 0.024, 0.102); 
            float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
            
            vec3 finalColor = mix(darkIndigo, color, smoothstep(0.0, 0.12, luma));
            vec3 neonHighlight = 0.5 + 0.5 * cos(time * 1.5 + vec3(0.0, 2.0, 4.0));
            finalColor = mix(finalColor, neonHighlight, smoothstep(0.82, 1.0, luma) * 0.28);
            
            return finalColor;
        }

        // ─── Scene Assembler ───
        
        vec3 computeScene(vec2 uv, float time) {
            float p1 = sin(uv.x * 5.0 + time) * cos(uv.y * 5.0 - time * 0.4);
            float p2 = cos(uv.x * 2.5 - time * 0.7) * sin(uv.y * 4.5 + time * 1.1);
            vec3 bgPlasma = mix(vec3(0.08, 0.04, 0.18), vec3(0.0, 0.38, 0.58), p1 * 0.5 + 0.5);
            bgPlasma = mix(bgPlasma, vec3(0.48, 0.0, 0.38), p2 * 0.5 + 0.5);
            
            vec3 bg = applyHalftone(uv, bgPlasma, time);
            bg = renderBrowserDebris(uv, time, bg);
            
            vec2 coreUV = uv + datamoshFlow(uv, time);
            vec3 core = computeNewtonCore(coreUV, time);
            
            float mask = smoothstep(0.42, 0.18, distance(uv, vec2(0.5)));
            vec3 scene = mix(bg, core, mask);
            
            scene = mix(scene, applyCuttlefishSkin(uv, scene, time), mask);
            scene = applyAnamorphicFlares(uv, scene, time);
            
            return scene;
        }

        // ─── Barrel Distortion ───
        
        vec2 barrelDistort(vec2 uv, float k1) {
            vec2 c = uv - 0.5;
            float r2 = dot(c, c);
            float k2 = k1 * 0.15;
            return c * (1.0 + k1 * r2 + k2 * r2 * r2) + 0.5;
        }

        void main() {
            vec2 uv_distorted = barrelDistort(vUv, 0.11);
            
            if (uv_distorted.x < 0.0 || uv_distorted.x > 1.0 || uv_distorted.y < 0.0 || uv_distorted.y > 1.0) {
                fragColor = vec4(0.047, 0.024, 0.102, 1.0);
                return;
            }
            
            vec2 dir = uv_distorted - 0.5;
            float ca_amount = 0.014;
            
            vec2 uv_r = uv_distorted + dir * ca_amount;
            vec2 uv_g = uv_distorted;
            vec2 uv_b = uv_distorted - dir * ca_amount;
            
            float r = computeScene(clamp(uv_r, 0.0, 1.0), u_time).r;
            float g = computeScene(clamp(uv_g, 0.0, 1.0), u_time).g;
            float b = computeScene(clamp(uv_b, 0.0, 1.0), u_time).b;
            
            vec3 color = vec3(r, g, b);
            
            // CRT Aperture-Grille subpixel modulation
            float pixel_x = vUv.x * u_resolution.x;
            float col_stripe = mod(pixel_x, 3.0);
            vec3 stripe = vec3(
                smoothstep(1.0, 0.0, abs(col_stripe - 0.5)),
                smoothstep(1.0, 0.0, abs(col_stripe - 1.5)),
                smoothstep(1.0, 0.0, abs(col_stripe - 2.5))
            );
            color *= mix(vec3(1.0), stripe, 0.32);
            
            // Scanline modulation
            float scan = 0.5 + 0.5 * sin(uv_distorted.y * u_resolution.y * 3.14159265);
            color *= mix(1.0, scan, 0.2);
            
            // Rolling refresh bar
            float barPos = fract(u_time * 0.25);
            float d_bar = abs(uv_distorted.y - barPos);
            float bar = exp(-d_bar * d_bar / 0.0025);
            color *= 1.0 + 0.1 * bar;
            
            // Chromatic Safety Pass
            color = chromaticSafety(color, u_time);
            
            fragColor = vec4(color, 1.0);
        }
      `
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
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
  if (material.uniforms.u_mouse) {
    material.uniforms.u_mouse.value.set(
      mouse.x / grid.width,
      1.0 - (mouse.y / grid.height)
    );
  }
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);