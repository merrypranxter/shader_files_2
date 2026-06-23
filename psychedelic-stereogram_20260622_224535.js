try {
  if (!ctx) throw new Error("WebGL 2 context not available");

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.autoClear = false;

    // FBO for the depth map
    const depthTarget = new THREE.WebGLRenderTarget(grid.width, grid.height, {
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping
    });

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    // PASS 1: Raymarched Depth Field
    const depthMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        uResolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        uniform float u_time;
        uniform vec2 uResolution;

        // FBM & Noise
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            f = f*f*(3.0-2.0*f);
            return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                       mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
        }
        float fbm(vec2 p) {
            float v = 0.0, a = 0.5;
            for(int i=0; i<5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
            return v;
        }

        // Alien Sticker-Object / Torus Knot
        float map(vec3 p) {
            // Drifting landscape
            float dGround = p.y + 1.2 - fbm(p.xz * 1.5 + u_time * 0.15) * 0.4;

            // Floating topological anomaly
            vec3 q = p;
            q.y -= 0.1; // float above ground
            float t = u_time * 0.3;
            
            // Hyper-rotations
            mat2 rotXZ = mat2(cos(t), -sin(t), sin(t), cos(t));
            mat2 rotXY = mat2(cos(t*1.3), -sin(t*1.3), sin(t*1.3), cos(t*1.3));
            q.xz *= rotXZ;
            q.xy *= rotXY;

            // Trefoil-ish wrap
            float a = atan(q.z, q.x);
            vec2 tq = vec2(length(q.xz) - 0.55, q.y);
            tq = mat2(cos(a*2.0), -sin(a*2.0), sin(a*2.0), cos(a*2.0)) * tq;
            float dKnot = length(tq - vec2(0.2, 0.0)) - 0.12;

            // Inner core
            float dCore = length(q) - 0.22;
            float obj = min(dKnot, dCore);

            // Gyroid membrane displacement
            float gyr = dot(sin(q*12.0), cos(q.zxy*12.0)) * 0.025;
            obj += gyr;

            return min(dGround, obj);
        }

        void main() {
            vec2 ndc = vUv * 2.0 - 1.0;
            ndc.x *= uResolution.x / uResolution.y;

            vec3 ro = vec3(0.0, 0.5, 3.5);
            vec3 rd = normalize(vec3(ndc, -1.8));

            float t = 0.0;
            for(int i=0; i<70; i++) {
                vec3 p = ro + rd * t;
                float d = map(p);
                if(d < 0.002 || t > 7.0) break;
                t += d;
            }

            // Normalize depth map z(x,y) in [0,1] where 1 is nearest
            float z = 0.0;
            if(t < 7.0) {
                z = smoothstep(6.0, 1.5, t);
            }
            
            // Subtle noise terrain to the depth itself so the wallpaper feels alive
            z += (noise(vUv * 15.0 + u_time*0.1) - 0.5) * 0.03 * z;

            fragColor = vec4(vec3(clamp(z, 0.0, 1.0)), 1.0);
        }
      `
    });

    // PASS 2: Stereogram Wallpaper & Fusion
    const stereoMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        uResolution: { value: new THREE.Vector2(grid.width, grid.height) },
        tDepth: { value: depthTarget.texture },
        u_E: { value: 140.0 }, // Pattern Period (Eye Separation)
        u_mu: { value: 0.45 }  // Depth Scale
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        
        uniform float u_time;
        uniform vec2 uResolution;
        uniform sampler2D tDepth;
        uniform float u_E;
        uniform float u_mu;

        // 3D Hash & Voronoi for Prismatic Boro-Glass Texture
        vec3 hash33(vec3 p) {
            p = vec3(dot(p,vec3(127.1,311.7, 74.7)),
                     dot(p,vec3(269.5,183.3,246.1)),
                     dot(p,vec3(113.5,271.9,124.6)));
            return fract(sin(p)*43758.5453123);
        }

        float voronoi(vec3 x, out vec3 colorSeed) {
            vec3 p = floor(x);
            vec3 f = fract(x);
            float res = 100.0;
            colorSeed = vec3(0.0);
            for(int k=-1; k<=1; k++)
            for(int j=-1; j<=1; j++)
            for(int i=-1; i<=1; i++) {
                vec3 b = vec3(float(i), float(j), float(k));
                vec3 h = hash33(p + b);
                vec3 r = b - f + h;
                float d = dot(r, r);
                if(d < res) {
                    res = d;
                    colorSeed = h;
                }
            }
            return sqrt(res);
        }

        // The Wallpaper: Lisa-Frank-on-lab-equipment energy
        vec3 getPattern(float x, float y) {
            // Map u to tile [0, 1)
            vec2 p = vec2(x / u_E, y / u_E);
            
            // Wrap to cylinder to guarantee flawless horizontal tiling
            float angle = p.x * 6.2831853;
            vec3 pos = vec3(cos(angle), sin(angle), p.y * 6.2831853);

            vec3 cSeed;
            float v = voronoi(pos * 3.5 + u_time * 0.15, cSeed);

            // Enamel/Cell boundaries
            float cellEdge = smoothstep(0.05, 0.15, v);
            float cellCenter = 1.0 - smoothstep(0.0, 0.4, v);

            // Op-Art Moiré / Holographic interference
            float moire = sin(length(pos.xy)*15.0 - u_time*3.0) * sin(pos.z*15.0 + u_time*1.5);

            // Toxic Neon Palette
            vec3 hotPink  = vec3(1.0, 0.0, 0.5);
            vec3 elecCyan = vec3(0.0, 1.0, 0.8);
            vec3 toxLime  = vec3(0.8, 1.0, 0.0);
            vec3 ultraV   = vec3(0.4, 0.0, 1.0);
            vec3 tangerine= vec3(1.0, 0.4, 0.0);

            // Base mix from voronoi cell hash
            vec3 col = mix(hotPink, elecCyan, cSeed.x);
            col = mix(col, toxLime, cSeed.y);
            col = mix(col, ultraV, cSeed.z);
            col = mix(col, tangerine, cellCenter * cSeed.x);

            // Holographic spectral shift overlay
            vec3 holo = 0.5 + 0.5 * cos(u_time + pos.z * 8.0 + vec3(0.0, 2.0, 4.0));
            col += holo * moire * 0.5;

            // Chrome glitter / noise dust
            float glitter = pow(fract(sin(dot(pos, vec3(12.9898, 78.233, 45.164))) * 43758.5453), 25.0);
            col += vec3(glitter) * 2.5;

            // Deepen edges for candy enamel look
            col *= cellEdge;

            // Tiny fractal glyphs inside cells
            float glyph = step(0.9, fract(sin(dot(floor(pos*20.0), vec3(1.2, 3.4, 5.6)))*100.0));
            col += glyph * vec3(0.1, 1.0, 0.6) * cellCenter;

            return clamp(col, 0.0, 1.0);
        }

        void main() {
            float E = max(u_E, 1.0);
            float u = vUv.x * uResolution.x;
            float y = vUv.y * uResolution.y;

            // Per-pixel horizontal shift approximation (SIRDS march)
            // Marches leftwards to find the linked pattern coordinate
            for(int i = 0; i < 90; i++) {
                if (u < E) break;
                float sampleX = clamp(u / uResolution.x, 0.0, 1.0);
                float z = texture(tDepth, vec2(sampleX, vUv.y)).r;
                // Separation equation: sep(z) = E * (1 - mu*z) / (2 - mu*z)
                float sep = E * (1.0 - u_mu * z) / (2.0 - u_mu * z);
                u -= max(sep, 1.0); // Step left by local separation
            }

            // Ensure u wraps correctly into the tile
            float finalU = mod(u, E);
            vec3 col = getPattern(finalU, y);

            // Convergence Dots (Wall-eyed fusion guides)
            float cx = uResolution.x * 0.5;
            float cy = uResolution.y * 0.92;
            float d1 = length(vec2(vUv.x * uResolution.x, y) - vec2(cx - E * 0.5, cy));
            float d2 = length(vec2(vUv.x * uResolution.x, y) - vec2(cx + E * 0.5, cy));

            if (d1 < 7.0 || d2 < 7.0) {
                col = mix(col, vec3(0.0), smoothstep(7.0, 5.0, min(d1, d2))); // Dark ring
                col = mix(col, vec3(1.0), smoothstep(3.5, 1.5, min(d1, d2))); // Light core
            }

            fragColor = vec4(col, 1.0);
        }
      `
    });

    const depthScene = new THREE.Scene();
    depthScene.add(new THREE.Mesh(geometry, depthMat));

    const stereoScene = new THREE.Scene();
    stereoScene.add(new THREE.Mesh(geometry, stereoMat));

    canvas.__three = { renderer, depthTarget, camera, depthMat, stereoMat, depthScene, stereoScene };
  }

  const state = canvas.__three;
  
  if (state.depthMat?.uniforms?.u_time) {
    state.depthMat.uniforms.u_time.value = time;
    state.depthMat.uniforms.uResolution.value.set(grid.width, grid.height);
  }
  if (state.stereoMat?.uniforms?.u_time) {
    state.stereoMat.uniforms.u_time.value = time;
    state.stereoMat.uniforms.uResolution.value.set(grid.width, grid.height);
  }

  state.renderer.setSize(grid.width, grid.height, false);
  state.depthTarget.setSize(grid.width, grid.height);

  // Pass 1: Render hidden depth map to FBO
  state.renderer.setRenderTarget(state.depthTarget);
  state.renderer.render(state.depthScene, state.camera);

  // Pass 2: Render stereogram wallpaper to screen
  state.renderer.setRenderTarget(null);
  state.renderer.render(state.stereoScene, state.camera);

} catch (e) {
  console.error("WebGL Initialization Failed:", e);
}