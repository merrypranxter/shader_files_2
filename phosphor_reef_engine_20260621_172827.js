if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
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

        // Sine-based FBM for fast procedural motion vectors
        float fbm(vec2 p) {
            float sum = 0.0;
            float amp = 0.5;
            for (int i = 0; i < 3; i++) {
                sum += amp * (sin(p.x) * cos(p.y));
                p *= 1.7;
                amp *= 0.5;
            }
            return sum * 0.5 + 0.5;
        }

        // Datamosh & motion-vector coordinate warp
        vec2 datamoshWarp(vec2 uv, float t, float surge) {
            vec2 block = floor(uv * 16.0) / 16.0;
            float blockHash = fract(sin(dot(block, vec2(127.1, 311.7))) * 43758.5453);
            
            float angle = fbm(block * 2.0 + t * 0.5) * 6.2831;
            vec2 motion = vec2(cos(angle), sin(angle)) * 0.08 * surge * blockHash;
            
            return uv + motion;
        }

        // Demoscene portal / plasma generator
        vec3 demoscenePortal(vec2 uv, float t) {
            vec2 p = uv - u_mouse;
            float d = length(p);
            float angle = atan(p.y, p.x);
            
            float r = log(d + 0.01);
            float a = angle / 3.14159;
            
            float pattern1 = sin(8.0 * r - 4.0 * a + t * 8.0);
            float pattern2 = cos(5.0 * r + 2.0 * a - t * 5.0);
            
            vec3 col1 = vec3(0.0, 1.0, 0.8); // electric cyan
            vec3 col2 = vec3(1.0, 0.0, 0.5); // hot pink
            
            vec3 portal = mix(col1, col2, pattern1 * 0.5 + 0.5);
            portal += vec3(0.9, 0.8, 0.1) * max(0.0, pattern2); // acid yellow highlights
            
            portal *= smoothstep(0.0, 0.15, d) * smoothstep(0.5, 0.35, d);
            return portal;
        }

        // Cuttlefish chromatophore grid
        vec3 cuttlefishLayer(vec2 uv, float t, vec3 background) {
            vec2 st = uv * 24.0;
            vec2 ipos = floor(st);
            vec2 fpos = fract(st);
            
            float min_dist = 1.0;
            vec2 target_cell = vec2(0.0);
            
            for (int y = -1; y <= 1; y++) {
                for (int x = -1; x <= 1; x++) {
                    vec2 neighbor = vec2(float(x), float(y));
                    vec2 point = vec2(
                        fract(sin(dot(ipos + neighbor, vec2(127.1, 311.7))) * 43758.5453),
                        fract(cos(dot(ipos + neighbor, vec2(269.5, 183.3))) * 43758.5453)
                    );
                    point = 0.5 + 0.5 * sin(t * 2.0 + point * 6.2831);
                    vec2 diff = neighbor + point - fpos;
                    float dist = length(diff);
                    if (dist < min_dist) {
                        min_dist = dist;
                        target_cell = ipos + neighbor;
                    }
                }
            }
            
            float wave = sin(target_cell.x * 0.4 + target_cell.y * 0.3 - t * 4.0) * 0.5 + 0.5;
            float cell_hash = fract(sin(dot(target_cell, vec2(12.9898, 78.233))) * 43758.5453);
            int pigClass = int(mod(cell_hash * 10.0, 3.0));
            
            float r0 = 0.12 + 0.08 * cell_hash;
            float r = r0 * (0.3 + 1.24 * wave);
            
            float disk = smoothstep(r, r * 0.6, min_dist);
            
            vec3 pigColor = vec3(0.0);
            if (pigClass == 0) pigColor = vec3(0.910, 0.722, 0.294); // yellow
            else if (pigClass == 1) pigColor = vec3(0.710, 0.314, 0.165); // red
            else pigColor = vec3(0.165, 0.102, 0.071); // brown
            
            return mix(background, pigColor, disk * 0.85);
        }

        // Early internet popup window debris
        float drawRect(vec2 uv, vec2 center, vec2 size) {
            vec2 d = abs(uv - center) - size;
            return step(max(d.x, d.y), 0.0);
        }

        float drawBorder(vec2 uv, vec2 center, vec2 size, float borderThickness) {
            vec2 d1 = abs(uv - center) - size;
            vec2 d2 = abs(uv - center) - (size - borderThickness);
            return step(max(d1.x, d1.y), 0.0) * (1.0 - step(max(d2.x, d2.y), 0.0));
        }

        vec3 internetDebris(vec2 uv, float t, vec3 background) {
            vec3 col = background;
            
            // Popup 1
            vec2 c1 = vec2(0.3 + 0.1 * sin(t * 0.5), 0.7 + 0.05 * cos(t * 0.7));
            vec2 s1 = vec2(0.12, 0.08);
            float r1 = drawRect(uv, c1, s1);
            float b1 = drawBorder(uv, c1, s1, 0.005);
            
            if (r1 > 0.5) {
                float titleBar = step(c1.y + s1.y - 0.02, uv.y);
                vec3 barColor = vec3(0.1, 0.0, 0.6); // deep indigo
                vec3 bodyColor = vec3(0.8, 0.75, 0.7); // warm grey/beige
                
                col = mix(bodyColor, barColor, titleBar);
                if (b1 > 0.5) col = vec3(1.0, 0.8, 0.0); // acid yellow border
            }
            
            // Popup 2
            vec2 c2 = vec2(0.7 + 0.08 * cos(t * 0.6), 0.4 + 0.1 * sin(t * 0.4));
            vec2 s2 = vec2(0.15, 0.1);
            float r2 = drawRect(uv, c2, s2);
            float b2 = drawBorder(uv, c2, s2, 0.005);
            
            if (r2 > 0.5) {
                float titleBar = step(c2.y + s2.y - 0.02, uv.y);
                vec3 barColor = vec3(0.8, 0.0, 0.5); // hot pink title bar
                vec3 bodyColor = vec3(0.1, 0.1, 0.2); // dark violet body
                
                col = mix(bodyColor, barColor, titleBar);
                if (b2 > 0.5) col = vec3(0.0, 1.0, 0.9); // electric cyan border
            }
            
            return col;
        }

        // Halftone pattern
        float halftonePattern(vec2 uv, float freq, float luma) {
            vec2 st = uv * freq;
            vec2 f = fract(st) - 0.5;
            float r = luma * 0.5;
            return smoothstep(r + 0.05, r - 0.05, length(f));
        }

        // Complete scene evaluator
        vec3 evaluateFullScene(vec2 uv, float t, float surge) {
            vec3 portal = demoscenePortal(uv, t);
            vec3 cuttlefish = cuttlefishLayer(uv, t, portal);
            vec3 internet = internetDebris(uv, t, cuttlefish);
            
            float l = dot(internet, vec3(0.299, 0.587, 0.114));
            vec3 col = internet;
            
            // Add halftone pattern overlay
            float ht = halftonePattern(uv, 40.0, l);
            col = mix(col, col * 0.5, ht * 0.4);
            
            return col;
        }

        // Chromatic aberration renderer
        vec3 renderWithAberration(vec2 uv, float t, float surge) {
            float shift = 0.015 * (1.0 + 2.0 * surge);
            vec2 redUV = uv + vec2(shift, 0.0);
            vec2 greenUV = uv;
            vec2 blueUV = uv - vec2(shift, 0.0);
            
            float r = sRGB_to_OKLab(evaluateScene(redUV, t)).r;
            float g = sRGB_to_OKLab(evaluateScene(greenUV, t)).g;
            float b = sRGB_to_OKLab(evaluateScene(blueUV, t)).b;
            
            return OKLab_to_sRGB(vec3(r, g, b));
        }

        // Linear sRGB to OKLab
        vec3 linearSRGB_to_OKLab(vec3 c) {
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

        // OKLab to linear sRGB
        vec3 OKLab_to_linearSRGB(vec3 c) {
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

        // sRGB gamma (display) to linear sRGB
        float sRGB_to_linear(float x) {
            return x <= 0.04045 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4);
        }

        // Linear sRGB to sRGB gamma
        float linear_to_sRGB(float x) {
            return x <= 0.0031308 ? x * 12.92 : 1.055 * pow(max(x, 0.0), 1.0/2.4) - 0.055;
        }

        // Full pipeline: sRGB to OKLab
        vec3 sRGB_to_OKLab(vec3 c) {
            vec3 lin = vec3(sRGB_to_linear(c.r), sRGB_to_linear(c.g), sRGB_to_linear(c.b));
            return linearSRGB_to_OKLab(lin);
        }

        // Full pipeline: OKLab to sRGB
        vec3 OKLab_to_sRGB(vec3 c) {
            vec3 lin = OKLab_to_linearSRGB(c);
            return vec3(linear_to_sRGB(lin.r), linear_to_sRGB(lin.g), linear_to_sRGB(lin.b));
        }

        // Anamorphic lens flare generator
        vec3 anamorphicFlare(vec2 uv, float t, float surge) {
            vec3 flare = vec3(0.0);
            float y1 = 0.5 + 0.15 * sin(t * 1.5);
            float y2 = 0.3 + 0.25 * cos(t * 0.8);
            
            // Flare 1
            float dist1 = abs(uv.y - y1);
            float intensity1 = exp(-dist1 * dist1 * 250.0);
            vec3 c1 = vec3(
                exp(-pow(dist1 - 0.01, 2.0) * 1000.0),
                exp(-pow(dist1, 2.0) * 1000.0),
                exp(-pow(dist1 + 0.01, 2.0) * 1000.0)
            ) * 0.3 + vec3(0.0, 0.8, 1.0);
            
            flare += c1 * intensity1 * (0.8 + 1.5 * surge);
            
            // Flare 2
            float dist2 = abs(uv.y - y2);
            float intensity2 = exp(-dist2 * dist2 * 400.0);
            vec3 c2 = vec3(1.0, 0.1, 0.6);
            flare += c2 * intensity2 * (0.5 + 1.2 * surge);
            
            return flare;
        }

        // Absolute color law enforcer
        vec3 enforceColorLaw(vec3 color, float t) {
            float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
            if (luma < 0.15) {
                color = mix(vec3(0.05, 0.0, 0.15), color, luma / 0.15); // rich indigo darks
            }
            if (luma > 0.85) {
                vec3 neonHighlight = mix(vec3(1.0, 0.1, 0.6), vec3(0.0, 1.0, 0.9), sin(t) * 0.5 + 0.5);
                color = mix(color, neonHighlight, (luma - 0.85) / 0.15); // neon highlights
            }
            return color;
        }

        // CRT simulation
        vec3 applyCRT(vec3 color, vec2 fragCoord, vec2 resolution, float t) {
            float scanline = sin(fragCoord.y * 1.5 + t * 2.0) * 0.15 + 0.85;
            
            float subpixel = mod(fragCoord.x, 3.0);
            vec3 mask = vec3(0.7);
            if (subpixel < 1.0) mask.r = 1.3;
            else if (subpixel < 2.0) mask.g = 1.3;
            else mask.b = 1.3;
            
            vec2 uv = fragCoord / resolution;
            float vig = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
            vig = clamp(pow(16.0 * vig, 0.25), 0.0, 1.0);
            
            return color * scanline * mask * vig;
        }

        void main() {
            vec2 uv = vUv;
            float t = u_time;
            
            float surge = smoothstep(0.7, 1.0, sin(t * 0.8) * 0.5 + 0.5);
            vec2 warpedUv = datamoshWarp(uv, t, surge);
            vec3 sceneColor = renderWithAberration(warpedUv, t, surge);
            vec3 flareColor = anamorphicFlare(warpedUv, t, surge);
            vec3 finalColor = sceneColor + flareColor;
            
            finalColor = enforceColorLaw(finalColor, t);
            finalColor = applyCRT(finalColor, gl_FragCoord.xy, u_resolution, t);
            
            fragColor = vec4(finalColor, 1.0);
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
  if (material.uniforms.u_time) material.uniforms.u_time.value = time;
  if (material.uniforms.u_resolution) {
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }
  if (material.uniforms.u_mouse) {
    const mx = mouse.x / grid.width;
    const my = 1.0 - (mouse.y / grid.height);
    material.uniforms.u_mouse.value.set(mx, my);
  }
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);