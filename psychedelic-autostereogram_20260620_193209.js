if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.autoClear = false;

    const depthTarget = new THREE.WebGLRenderTarget(grid.width, grid.height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    });

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const sceneDepth = new THREE.Scene();
    const sceneStereo = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(2, 2);

    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const depthFragmentShader = `
      in vec2 vUv;
      out vec4 fragColor;
      uniform float u_time;
      uniform vec2 u_resolution;

      mat2 rot(float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, -s, s, c);
      }

      float smin(float a, float b, float k) {
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.0 - h);
      }

      float map(vec3 p) {
        vec3 q = p;
        q.xy *= rot(u_time * 0.2);
        q.yz *= rot(u_time * 0.3);

        // Impossible Torus Knot / Alien Object
        float a = atan(q.z, q.x);
        vec2 t_q = vec2(length(q.xz) - 1.0, q.y);
        t_q *= rot(a * 2.0);
        float d1 = length(t_q) - 0.3;

        // Core anomaly
        float d2 = length(p) - 0.5 + sin(u_time * 2.0) * 0.05;

        // Orbiting gyroid-membrane satellites
        vec3 p3 = p;
        p3.xz *= rot(-u_time * 0.8);
        p3.xy *= rot(u_time * 0.4);
        float d3 = length(p3 - vec3(1.2, 0.0, 0.0)) - 0.2;
        float gyroid = abs(dot(sin(p3 * 8.0), cos(p3.zxy * 8.0))) / 8.0;
        d3 = max(d3, 0.05 - gyroid);

        float obj = smin(smin(d1, d2, 0.5), d3, 0.4);

        // Smooth background terrain (depth buffer needs smooth low-freq backdrops)
        float bg = p.z + 1.2 + sin(p.x * 2.0 + u_time) * cos(p.y * 2.0) * 0.2;

        return min(obj, bg);
      }

      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        p.x *= u_resolution.x / u_resolution.y;

        vec3 ro = vec3(0.0, 0.0, -3.5);
        vec3 rd = normalize(vec3(p, 1.5));

        float dO = 0.0;
        for(int i = 0; i < 80; i++) {
          vec3 pos = ro + rd * dO;
          float dS = map(pos);
          if(dS < 0.001 || dO > 10.0) break;
          dO += dS;
        }

        float z = 0.0;
        if(dO < 10.0) {
          // Normalize depth into [0, 1] range for the stereogram shift
          z = smoothstep(5.0, 1.5, dO);
        }

        fragColor = vec4(vec3(z), 1.0);
      }
    `;

    const stereoFragmentShader = `
      in vec2 vUv;
      out vec4 fragColor;
      uniform sampler2D u_depthTex;
      uniform float u_time;
      uniform vec2 u_resolution;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p.xy + p.z);
          p *= 2.0;
          a *= 0.5;
        }
        return v;
      }

      vec3 acidPattern(vec2 uv) {
        // Map horizontal UV to a cylinder to ensure perfect seamless tiling
        float theta = uv.x * 6.2831853;
        float scale = 2.0;
        vec3 pos = vec3(cos(theta) * scale, sin(theta) * scale, uv.y * 12.0);
        float t = u_time * 0.2;

        // Domain warping for Lisa Frank / Reaction-Diffusion feel
        float n1 = noise(pos.xy * 2.0 + t);
        float n2 = noise(pos.yz * 3.0 - t);
        vec3 warp = pos + vec3(n1, n2, noise(pos.zx)) * 1.5;

        float f = fbm(warp * 2.0);

        // Toxic Neon Palette
        vec3 c1 = vec3(0.0, 1.0, 0.9); // Electric Cyan
        vec3 c2 = vec3(1.0, 0.0, 0.8); // Hot Pink
        vec3 c3 = vec3(0.7, 1.0, 0.0); // Toxic Lime
        vec3 c4 = vec3(1.0, 0.4, 0.0); // Molten Tangerine
        vec3 c5 = vec3(0.5, 0.0, 1.0); // Ultraviolet

        vec3 col = mix(c1, c2, smoothstep(0.2, 0.8, n1));
        col = mix(col, c3, smoothstep(0.3, 0.7, n2));
        col = mix(col, c4, smoothstep(0.4, 0.9, f));
        col = mix(col, c5, smoothstep(0.6, 1.0, n1 * f));

        // Op-art moiré interference
        float moire = sin(warp.x * 25.0) * sin(warp.y * 25.0) * sin(warp.z * 25.0);
        col *= 0.6 + 0.4 * smoothstep(-0.2, 0.2, moire);

        // Boro-glass chromatic glitter (high-frequency anchors for stereogram fusion)
        float glit = fract(sin(dot(floor(uv * vec2(200.0, 200.0)), vec2(12.9898, 78.233))) * 43758.5453);
        if(glit > 0.96) col += vec3(0.8, 0.9, 1.0) * (glit - 0.96) * 20.0;

        // Alien glyph noise patches
        vec2 id = floor(vec2(theta * 8.0, uv.y * 20.0));
        float glyph = hash(id + floor(u_time * 1.5));
        if(glyph > 0.85) {
          vec2 gv = fract(vec2(theta * 8.0, uv.y * 20.0)) - 0.5;
          float d = max(abs(gv.x), abs(gv.y));
          if(abs(d - 0.2) < 0.05) col = mix(col, vec3(1.0), 0.9);
        }

        return col;
      }

      float depthAt(float xpix, float ypix) {
        vec2 uv = vec2(xpix, ypix) / u_resolution;
        return texture(u_depthTex, uv).r;
      }

      void main() {
        float E = 140.0; // Eye separation / Pattern period
        float mu = 0.4;  // Depth scale

        float xpix = vUv.x * u_resolution.x;
        float ypix = vUv.y * u_resolution.y;

        float acc = xpix;

        // GPU Stereogram Approximation: walk left to anchor
        for(int i = 0; i < 64; i++) {
          float z = depthAt(acc, ypix);
          float sep = E * (1.0 - mu * z) / (2.0 - mu * z);
          if (acc - sep < 0.0) break;
          acc -= sep;
        }

        // Sample the procedural wallpaper
        vec2 puv = vec2(acc / E, ypix / E);
        vec3 col = acidPattern(puv);

        // Convergence dots (Magic Eye guides)
        float cx = u_resolution.x * 0.5;
        float cy = u_resolution.y * 0.92;
        float d1 = length(vec2(xpix, ypix) - vec2(cx - E * 0.5, cy));
        float d2 = length(vec2(xpix, ypix) - vec2(cx + E * 0.5, cy));

        float d = min(d1, d2);
        if(d < 12.0) col = vec3(0.1);
        if(d < 8.0) col = vec3(0.0, 1.0, 0.8);
        if(d < 4.0) col = vec3(1.0);

        fragColor = vec4(col, 1.0);
      }
    `;

    const depthMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2() }
      },
      vertexShader,
      fragmentShader: depthFragmentShader
    });

    const stereoMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2() },
        u_depthTex: { value: depthTarget.texture }
      },
      vertexShader,
      fragmentShader: stereoFragmentShader
    });

    sceneDepth.add(new THREE.Mesh(geo, depthMat));
    sceneStereo.add(new THREE.Mesh(geo, stereoMat));

    canvas.__three = { renderer, camera, sceneDepth, sceneStereo, depthMat, stereoMat, depthTarget };
  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
    return;
  }
}

const { renderer, camera, sceneDepth, sceneStereo, depthMat, stereoMat, depthTarget } = canvas.__three;

if (depthTarget.width !== grid.width || depthTarget.height !== grid.height) {
  renderer.setSize(grid.width, grid.height, false);
  depthTarget.setSize(grid.width, grid.height);
}

depthMat.uniforms.u_time.value = time;
depthMat.uniforms.u_resolution.value.set(grid.width, grid.height);

stereoMat.uniforms.u_time.value = time;
stereoMat.uniforms.u_resolution.value.set(grid.width, grid.height);

renderer.setRenderTarget(depthTarget);
renderer.render(sceneDepth, camera);

renderer.setRenderTarget(null);
renderer.render(sceneStereo, camera);