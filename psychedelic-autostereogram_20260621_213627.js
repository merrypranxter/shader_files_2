try {
  if (!ctx) throw new Error("WebGL 2 context not available");

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    renderer.autoClear = false;

    const depthTarget = new THREE.WebGLRenderTarget(grid.width, grid.height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType
    });

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const sharedVertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const depthScene = new THREE.Scene();
    const depthMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader: sharedVertexShader,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        uniform vec2 u_resolution;
        uniform float u_time;

        mat2 rot(float a) {
            float s = sin(a), c = cos(a);
            return mat2(c, -s, s, c);
        }

        float sdImpossibleKnot(vec3 p) {
            p.xy *= rot(u_time * 0.2);
            p.xz *= rot(u_time * 0.15);
            
            float r = length(p.xy);
            float a = atan(p.y, p.x);
            
            vec2 q = vec2(r - 0.65, p.z);
            q *= rot(a * 3.0 + u_time * 0.8);
            
            float baseTorus = length(q) - 0.25;
            
            float gyroid = dot(sin(p * 5.0), cos(p.zxy * 5.0));
            float detail = dot(sin(p * 12.0), cos(p.zxy * 12.0));
            
            float shape = baseTorus + gyroid * 0.06 + detail * 0.015;
            
            float core = length(p) - 0.35;
            core += dot(sin(p * 8.0), cos(p.zxy * 8.0)) * 0.04;
            
            return min(shape, core) * 0.6;
        }

        void main() {
            vec2 uv = (vUv - 0.5) * 2.0;
            uv.x *= u_resolution.x / u_resolution.y;
            
            vec3 ro = vec3(0.0, 0.0, 2.8);
            vec3 rd = normalize(vec3(uv, -1.0));
            
            float t = 0.0;
            float z = 0.0;
            
            for(int i = 0; i < 80; i++) {
                vec3 p = ro + rd * t;
                float d = sdImpossibleKnot(p);
                if(d < 0.002) {
                    z = clamp(1.0 - (t - 1.5) / 2.2, 0.1, 0.95);
                    break;
                }
                t += d;
                if(t > 4.5) break;
            }
            
            if (z == 0.0) {
                float bgNoise = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
                z = 0.02 + bgNoise * 0.03 + (1.0 - vUv.y) * 0.05;
            }
            
            fragColor = vec4(z, z, z, 1.0);
        }
      `
    });
    depthScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), depthMaterial));

    const stereoScene = new THREE.Scene();
    const stereoMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_depthTex: { value: depthTarget.texture },
        u_E: { value: 128.0 },
        u_mu: { value: 0.55 }
      },
      vertexShader: sharedVertexShader,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        
        uniform sampler2D u_depthTex;
        uniform vec2 u_resolution;
        uniform float u_time;
        uniform float u_E;
        uniform float u_mu;

        vec3 hsv2rgb(vec3 c) {
            vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
            vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
            return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        vec2 hash22(vec2 p) {
            p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
            return fract(sin(p) * 43758.5453);
        }

        float voronoi(vec2 x) {
            vec2 n = floor(x);
            vec2 f = fract(x);
            float md = 8.0;
            for(int j = -1; j <= 1; j++)
            for(int i = -1; i <= 1; i++) {
                vec2 g = vec2(float(i), float(j));
                vec2 o = hash22(n + g);
                o = 0.5 + 0.5 * sin(u_time * 2.0 + 6.2831853 * o);
                vec2 r = g + o - f;
                float d = dot(r, r);
                if(d < md) md = d;
            }
            return sqrt(md);
        }

        vec3 acidWallpaper(vec2 uv) {
            vec2 p = uv * 6.0;
            
            float moire = sin(length(uv * 18.0) * 25.0 - u_time * 4.0) * cos(uv.x * 35.0 + uv.y * 25.0);
            
            float v = voronoi(p * 2.5);
            
            float glitter = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
            
            float hue = uv.x * 2.5 + uv.y * 1.5 - v * 0.6 + u_time * 0.3;
            vec3 col = hsv2rgb(vec3(hue, 0.85, 1.0));
            
            float blob = smoothstep(0.45, 0.15, v);
            col = mix(col, vec3(0.6, 1.0, 0.0), blob * 0.85); 
            
            col += moire * 0.35 * vec3(1.0, 0.0, 0.8); 
            
            vec2 fp = fract(p * 3.0) - 0.5;
            float glyphSeed = floor(p.x * 3.0) + floor(p.y * 3.0) * 10.0;
            float glyph = step(0.7, fract(sin(glyphSeed + floor(u_time)) * 123.45));
            float symbol = smoothstep(0.18, 0.1, abs(max(abs(fp.x), abs(fp.y)) - 0.25)) * glyph;
            col = mix(col, vec3(0.0, 1.0, 1.0), symbol); 
            
            vec3 noiseCol = vec3(
                fract(sin(dot(uv, vec2(1.0, 2.0))) * 43758.0),
                fract(sin(dot(uv, vec2(3.0, 4.0))) * 43758.0),
                fract(sin(dot(uv, vec2(5.0, 6.0))) * 43758.0)
            );
            col = mix(col, noiseCol, 0.35); 
            
            return clamp(col, 0.0, 1.0);
        }

        void main() {
            float E = u_E;
            float mu = u_mu;
            
            float xPix = vUv.x * u_resolution.x;
            float yPix = vUv.y;
            
            float u = xPix;
            
            for (int i = 0; i < 160; i++) {
                if (u < E) break;
                float sampleX = clamp(u / u_resolution.x, 0.0, 1.0);
                float z = texture(u_depthTex, vec2(sampleX, vUv.y)).r;
                float sep = E * (1.0 - mu * z) / (2.0 - mu * z);
                sep = max(sep, 1.0);
                u -= sep;
            }
            
            vec2 patternUV = vec2(u / E, vUv.y * (u_resolution.y / E));
            
            vec3 col = acidWallpaper(patternUV);
            
            float cx = u_resolution.x * 0.5;
            float cy = u_resolution.y * 0.92;
            float r = 7.0;
            
            float d1 = length(vec2(xPix, vUv.y * u_resolution.y) - vec2(cx - E * 0.5, cy));
            float d2 = length(vec2(xPix, vUv.y * u_resolution.y) - vec2(cx + E * 0.5, cy));
            float dotDist = min(d1, d2);
            
            float mask = smoothstep(r + 2.0, r - 1.0, dotDist);
            col = mix(col, vec3(0.0), mask);
            float core = smoothstep(r * 0.4 + 1.0, r * 0.4 - 1.0, dotDist);
            col = mix(col, vec3(1.0), core);
            
            fragColor = vec4(col, 1.0);
        }
      `
    });
    stereoScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), stereoMaterial));

    canvas.__three = { renderer, depthTarget, depthScene, stereoScene, camera, depthMaterial, stereoMaterial };
  }

  const { renderer, depthTarget, depthScene, stereoScene, camera, depthMaterial, stereoMaterial } = canvas.__three;

  if (depthMaterial && depthMaterial.uniforms && depthMaterial.uniforms.u_time) {
    depthMaterial.uniforms.u_time.value = time;
    depthMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
  }

  if (stereoMaterial && stereoMaterial.uniforms && stereoMaterial.uniforms.u_time) {
    stereoMaterial.uniforms.u_time.value = time;
    stereoMaterial.uniforms.u_resolution.value.set(grid.width, grid.height);
    stereoMaterial.uniforms.u_E.value = Math.max(80.0, Math.min(180.0, grid.width / 8.0));
  }

  renderer.setSize(grid.width, grid.height, false);

  renderer.setRenderTarget(depthTarget);
  renderer.render(depthScene, camera);

  renderer.setRenderTarget(null);
  renderer.render(stereoScene, camera);

} catch (e) {
  console.error("WebGL Initialization or Render Failed:", e);
}