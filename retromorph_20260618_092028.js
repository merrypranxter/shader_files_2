try {
  if (!canvas.__three) {
    if (!ctx) throw new Error("WebGL2 context not available");

    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      context: ctx,
      alpha: true,
      antialias: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;
      in vec2 vUv;
      out vec4 fragColor;
      
      uniform float u_time;
      uniform vec2 u_resolution;

      // --------------------------------------------------------
      // VIBRANT PALETTE - STRICTLY NO BLACK, NO WHITE
      // --------------------------------------------------------
      vec3 getColor(float v) {
          v = fract(v);
          vec3 c1 = vec3(1.0, 0.0, 0.4); // Hot Pink
          vec3 c2 = vec3(1.0, 0.5, 0.0); // Neon Orange
          vec3 c3 = vec3(0.2, 0.9, 0.1); // Acid Green
          vec3 c4 = vec3(0.0, 0.7, 1.0); // Electric Blue
          vec3 c5 = vec3(0.6, 0.0, 0.9); // Deep Violet
          
          if(v < 0.2) return mix(c1, c2, v * 5.0);
          if(v < 0.4) return mix(c2, c3, (v - 0.2) * 5.0);
          if(v < 0.6) return mix(c3, c4, (v - 0.4) * 5.0);
          if(v < 0.8) return mix(c4, c5, (v - 0.6) * 5.0);
          return mix(c5, c1, (v - 0.8) * 5.0);
      }

      // --------------------------------------------------------
      // MORPHOGENESIS ENGINE (Multi-Scale Cellular Turing Fake)
      // --------------------------------------------------------
      float turing(vec2 p, float t) {
          float val = 0.0;
          float amp = 1.0;
          vec2 shift = vec2(0.0);
          
          // Cyclic symmetry fold (Radiolarian / Diatom biology)
          float angle = atan(p.y, p.x);
          float r = length(p);
          angle += sin(r * 2.5 - t * 0.4) * 0.5;
          p = vec2(cos(angle), sin(angle)) * r;

          for (int i = 0; i < 6; i++) {
              p += shift;
              float n = sin(p.x) * cos(p.y);
              val += n * amp;
              
              // Growth tensor / anisotropic drift
              shift = vec2(cos(n + t), sin(n - t)) * 0.45;
              
              // Scale and twist
              p = p * 1.6 + vec2(t * 0.15);
              
              // Cellular folding (creates sharp, tissue-like boundaries)
              p = abs(p) - 0.5; 
              
              amp *= 0.65;
          }
          return val;
      }

      void main() {
          // Setup coordinates
          vec2 uv = (vUv - 0.5) * 2.0;
          uv.x *= u_resolution.x / u_resolution.y;
          
          float t = u_time * 0.4;
          
          // Retrofuturistic coordinate warping (Racing Stripes meeting biological growth)
          vec2 warpedUV = uv + vec2(sin(uv.y * 4.0 + t), cos(uv.x * 4.0 - t)) * 0.15;
          
          // Generate the morphogenesis field
          float field = turing(warpedUV * 3.5, t);
          
          // Calculate gradients for 3D structure (Chrome shine on biological surface)
          float e = 0.015;
          float fx = turing((warpedUV + vec2(e, 0.0)) * 3.5, t);
          float fy = turing((warpedUV + vec2(0.0, e)) * 3.5, t);
          vec3 normal = normalize(vec3(fx - field, fy - field, 0.18));
          
          // Lighting setup
          vec3 lightDir = normalize(vec3(1.0, 1.0, 0.8));
          vec3 viewDir = vec3(0.0, 0.0, 1.0);
          vec3 halfVector = normalize(lightDir + viewDir);
          
          // Diffuse component (mapped to hue shifting instead of black shadows)
          float diff = max(dot(normal, lightDir), 0.0);
          
          // Anisotropic Specular Smear (1970s Sci-Fi Chrome signature)
          vec3 tangent = normalize(vec3(-normal.y, normal.x, 0.0));
          float aniso = pow(max(1.0 - abs(dot(halfVector, tangent)), 0.0), 12.0);
          
          // Determine base and shadow colors from the biological field
          vec3 baseColor = getColor(field * 0.4 + t * 0.1);
          vec3 shadowColor = getColor(field * 0.4 + t * 0.1 + 0.55); // Opposite side of color wheel
          
          // Blend colors based on geometry
          vec3 color = mix(shadowColor, baseColor, diff * 0.8 + 0.2);
          
          // Add specular shine (Using vibrant color, NOT white)
          vec3 specColor = getColor(field * 0.3 - t * 0.2); 
          color += aniso * specColor * 0.9;
          
          // Moiré interference overlay (Retrofuturistic technology texture)
          float moire = sin(warpedUV.x * 90.0 + field * 6.0) * sin(warpedUV.y * 90.0 + field * 6.0);
          vec3 moireColor = getColor(field + 0.3);
          color = mix(color, moireColor, smoothstep(0.8, 1.0, moire) * 0.5);
          
          // Saturation boost to guarantee full, vivid color
          float lum = dot(color, vec3(0.299, 0.587, 0.114));
          color = mix(vec3(lum), color, 1.4);
          
          // ENFORCE NO BLACK, NO WHITE CONSTRAINT
          // Clamp to a range that prevents any channel from hitting 0.0 or 1.0
          color = clamp(color, 0.1, 0.9);
          
          fragColor = vec4(color, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      depthWrite: false,
      depthTest: false
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    canvas.__three = { renderer, scene, camera, material };
  }

  const { renderer, scene, camera, material } = canvas.__three;

  if (material && material.uniforms) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }

  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);

} catch (e) {
  console.error("Feral Morphogenesis WebGL Initialization Failed:", e);
}