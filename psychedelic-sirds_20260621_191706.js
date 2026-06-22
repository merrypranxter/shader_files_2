try {
  if (!ctx) throw new Error("WebGL 2 context not available");

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    renderer.autoClear = false;

    // Render target for the depth map
    const rt = new THREE.WebGLRenderTarget(grid.width, grid.height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    });

    const sceneDepth = new THREE.Scene();
    const sceneStereo = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Pass 1: Depth Map Generator (Raymarched SDF)
    const matDepth = new THREE.ShaderMaterial({
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
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        
        uniform float u_time;
        uniform vec2 u_resolution;

        mat2 rot(float a) {
            float c = cos(a), s = sin(a);
            return mat2(c, -s, s, c);
        }

        // Polynomial smooth min for organic fusion
        float smin(float a, float b, float k) {
            float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
            return mix(b, a, h) - k * h * (1.0 - h);
        }

        float map(vec3 p) {
            vec3 p_obj = p;
            
            // Complex rotation to make it "breathe" and tumble
            p_obj.xz *= rot(u_time * 0.4);
            p_obj.yz *= rot(u_time * 0.25);
            p_obj.xy *= rot(sin(u_time * 0.5) * 0.5);

            float breath = sin(u_time * 1.5) * 0.08;

            // Base Torus
            vec2 q = vec2(length(p_obj.xz) - (0.7 + breath), p_obj.y);
            float torus = length(q) - (0.35 - breath * 0.5);

            // Gyroid subtractive field (Alien topology)
            float gyroid = dot(sin(p_obj * 5.0), cos(p_obj.zxy * 5.0)) / 5.0;
            float obj = max(torus, -gyroid + 0.04);

            // Inner impossible core
            float core = length(p_obj) - 0.25 + sin(p_obj.x*12.0)*sin(p_obj.y*12.0)*sin(p_obj.z*12.0)*0.03;
            obj = smin(obj, core, 0.2);

            // Fractal noise terrain background
            float bg = p.z + 1.5 - sin(p.x*3.0 + u_time*0.5)*cos(p.y*3.0)*0.15;

            // Blend object into the background slightly for seamless stereogram edge fusion
            return smin(obj, bg, 0.4);
        }

        void main() {
            vec2 uv = vUv * 2.0 - 1.0;
            uv.x *= u_resolution.x / u_resolution.y;

            vec3 ro = vec3(0.0, 0.0, 2.0);
            vec3 rd = normalize(vec3(uv, -1.5));

            float t = 0.0;
            for(int i = 0; i < 80; i++) {
                float d = map(ro + rd * t);
                if(d < 0.002) break;
                t += d * 0.8; 
                if(t > 4.0) break;
            }

            // Map ray distance to depth z in [0, 1]
            // Background is around t=3.5, front of object around t=1.0
            float z = 1.0 - clamp((t - 1.0) / 2.5, 0.0, 1.0);
            
            // Smoothstep curve gives the depth a nice bubble-pop feel
            z = smoothstep(0.0, 1.0, z);
            
            fragColor = vec4(vec3(z), 1.0);
        }
      `
    });

    // Pass 2: The GPU Stereogram Solver & Pattern Generator
    const matStereo = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_depthTex: { value: rt.texture },
        u_E: { value: 120.0 }, // Pattern period
        u_mu: { value: 0.45 }  // Depth relief intensity
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
        uniform vec2 u_resolution;
        uniform sampler2D u_depthTex;
        uniform float u_E;
        uniform float u_mu;

        const float TAU = 6.28318530718;

        // 3D Hash for seamless noise
        vec3 hash33(vec3 p) {
            p = fract(p * vec3(443.897, 441.423, 437.195));
            p += dot(p, p.yxz + 19.19);
            return fract((p.xxy + p.yxx) * p.zyx);
        }

        // 3D Cellular noise for Lisa-Frank sticker blobs
        float cellular3D(vec3 p) {
            vec3 n = floor(p);
            vec3 f = fract(p);
            float minDist = 1.0;
            for(int k=-1; k<=1; k++)
            for(int j=-1; j<=1; j++)
            for(int i=-1; i<=1; i++) {
                vec3 g = vec3(float(i), float(j), float(k));
                vec3 o = hash33(n + g);
                // Animate the cells
                vec3 r = g - f + (0.5 + 0.5 * sin(u_time * 1.5 + TAU * o));
                float d = dot(r, r);
                if(d < minDist) minDist = d;
            }
            return minDist;
        }

        // Generates the psychedelic repeating wallpaper
        vec3 pattern(vec2 p) {
            float E = u_E;
            // Map the horizontal coordinate to a circle to guarantee perfect seamless tiling!
            float theta = (p.x / E) * TAU;
            float R = 1.6; 
            
            vec3 pos = vec3(R * cos(theta), R * sin(theta), p.y * 0.008 + u_time * 0.2);
            
            float c1 = cellular3D(pos * 2.0);
            float c2 = cellular3D(pos * 4.0 + vec3(1.0, 2.0, 3.0));
            
            // Acid neon base palette
            vec3 col = vec3(0.5) + 0.5 * cos(TAU * (c1 * vec3(1.0, 1.0, 1.0) + vec3(0.0, 0.33, 0.67)));
            
            // Lisa-Frank toxic sticker colors
            col = mix(col, vec3(1.0, 0.0, 0.7), smoothstep(0.35, 0.2, c1)); // Hot pink
            col = mix(col, vec3(0.0, 1.0, 0.9), smoothstep(0.45, 0.3, c2)); // Electric cyan
            
            // Op-art moiré wavy stripes
            float stripes = sin(pos.x*25.0 + pos.z*18.0) * cos(pos.y*25.0);
            float stripeMask = smoothstep(0.0, 0.1, stripes) * smoothstep(0.7, 0.5, c1);
            col = mix(col, vec3(0.6, 1.0, 0.0), stripeMask); // Toxic lime
            
            // Holographic interference ripples
            float holo = sin(c1 * 60.0 - u_time * 5.0);
            col += vec3(1.0, 0.3, 0.0) * smoothstep(0.85, 1.0, holo); // Molten tangerine
            
            // Candy enamel borders / chromatic lines
            float border = smoothstep(0.12, 0.16, c1) - smoothstep(0.16, 0.20, c1);
            col = mix(col, vec3(0.2, 0.0, 0.5), border);
            
            // Prismatic boro-glass glitter
            float glitter = fract(sin(dot(pos, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            col += vec3(1.0) * pow(glitter, 28.0) * 1.8;
            
            return clamp(col, 0.0, 1.0);
        }

        void main() {
            float E = max(u_E, 1.0);
            float mu = u_mu;
            float xPix = vUv.x * u_resolution.x;
            float yPix = vUv.y * u_resolution.y;
            
            float u = xPix;
            
            // GPU Stereogram Approximation: The Leftward March
            // Marches left in steps of the local separation until entering the first pattern tile [0, E)
            for (int i = 0; i < 120; i++) {
                if (u < E) break;
                float sampleX = clamp(u / u_resolution.x, 0.0, 1.0);
                float z = texture(u_depthTex, vec2(sampleX, vUv.y)).r;
                // The separation equation: sep(z) = E * (1 - mu*z) / (2 - mu*z)
                float sep = E * (1.0 - mu * z) / (2.0 - mu * z);
                sep = max(sep, 1.0);
                u -= sep;
            }
            
            vec3 finalColor = pattern(vec2(u, yPix));
            
            // Convergence guides (two dots) to help the brain fuse the image
            float cx = u_resolution.x * 0.5;
            float cy = u_resolution.y * 0.93;
            float d1 = length(vec2(xPix, yPix) - vec2(cx - E * 0.5, cy));
            float d2 = length(vec2(xPix, yPix) - vec2(cx + E * 0.5, cy));
            float dotDist = min(d1, d2);
            
            if (dotDist < 9.0) {
                float mask1 = smoothstep(9.0, 7.0, dotDist);
                float mask2 = smoothstep(4.0, 2.0, dotDist);
                finalColor = mix(finalColor, vec3(0.02), mask1); // Dark ring
                finalColor = mix(finalColor, vec3(0.98), mask2); // Bright core
            }
            
            fragColor = vec4(finalColor, 1.0);
        }
      `
    });

    sceneDepth.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matDepth));
    sceneStereo.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matStereo));

    canvas.__three = { renderer, rt, sceneDepth, sceneStereo, camera, matDepth, matStereo };
  }

  const { renderer, rt, sceneDepth, sceneStereo, camera, matDepth, matStereo } = canvas.__three;

  // Dynamic eye separation based on screen width (keeps it fusable on all devices)
  let E = grid.width * 0.12;
  E = Math.max(90.0, Math.min(E, 220.0));

  // Update depth pass uniforms
  if (matDepth.uniforms) {
    matDepth.uniforms.u_time.value = time;
    matDepth.uniforms.u_resolution.value.set(grid.width, grid.height);
  }

  // Update stereogram pass uniforms
  if (matStereo.uniforms) {
    matStereo.uniforms.u_time.value = time;
    matStereo.uniforms.u_resolution.value.set(grid.width, grid.height);
    matStereo.uniforms.u_E.value = E;
  }

  renderer.setSize(grid.width, grid.height, false);
  rt.setSize(grid.width, grid.height);

  // Pass 1: Render hidden SDF depth map to FBO
  renderer.setRenderTarget(rt);
  renderer.render(sceneDepth, camera);

  // Pass 2: Render horizontal shift stereogram to screen
  renderer.setRenderTarget(null);
  renderer.render(sceneStereo, camera);

} catch (e) {
  console.error("Stereogram initialization failed:", e);
}