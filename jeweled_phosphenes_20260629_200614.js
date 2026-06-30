try {
  if (!canvas.__three) {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.autoClear = false;

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    const rtOptions = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false
    };

    const rtScene = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
    const rtBurnA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
    const rtBurnB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

    const commonGLSL = `
      #define TAU 6.28318530718

      vec2 cmul(vec2 a, vec2 b) { 
        return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); 
      }
      vec2 cdiv(vec2 a, vec2 b) { 
        float d = dot(b,b) + 1e-8; 
        return vec2(dot(a,b), a.y*b.x - a.x*b.y) / d; 
      }
      vec2 cpow(vec2 z, float n) { 
        float r = length(z);
        float t = atan(z.y, z.x); 
        return pow(r, n) * vec2(cos(n*t), sin(n*t)); 
      }
      
      float hash21(vec2 p) { 
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); 
      }

      float lobe(float x, float a, float m, float sl, float sr) {
        float t = (x - m) / (x < m ? sl : sr);
        return a * exp(-0.5 * t * t);
      }

      vec3 wavelengthToRGB(float l) {
        float x = lobe(l, 1.056, 599.8, 37.9, 31.0) + lobe(l, 0.362, 442.0, 16.0, 26.7) + lobe(l, -0.065, 501.1, 20.4, 26.2);
        float y = lobe(l, 0.821, 568.8, 46.9, 40.5) + lobe(l, 0.286, 530.9, 16.3, 31.1);
        float z = lobe(l, 1.217, 437.0, 11.8, 36.0) + lobe(l, 0.681, 459.0, 26.0, 13.8);
        vec3 rgb = mat3(3.2406, -0.9689, 0.0557, -1.5372, 1.8758, -0.2040, -0.4986, 0.0415, 1.0570) * vec3(x,y,z);
        
        float lift = min(min(rgb.r, rgb.g), min(rgb.b, 0.0));
        rgb -= lift;
        float denom = max(max(rgb.r, rgb.g), rgb.b);
        return clamp(rgb / max(denom, 1e-6), 0.0, 1.0);
      }
    `;

    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const matScene = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        uniform float u_time;
        uniform vec2 u_resolution;
        
        ${commonGLSL}

        void main() {
          vec2 uv = vUv * 2.0 - 1.0;
          uv.x *= u_resolution.x / u_resolution.y;

          uv += vec2(sin(u_time * 3.141), cos(u_time * 2.718)) * 0.008;
          
          float r = length(uv);
          float theta = atan(uv.y, uv.x);

          float rho = log(max(r, 1e-6));
          float breath = 1.0 + 0.08 * sin(u_time * 0.6);
          vec2 lp = vec2(rho * breath, theta + u_time * 0.04);

          vec2 z3 = cpow(lp, 3.0) - vec2(1.0, 0.0);
          vec2 z2 = cpow(lp, 2.0) + vec2(0.6 * sin(u_time * 0.25), 0.5 * cos(u_time * 0.18));
          vec2 fz = cdiv(z3, z2);

          float rho_w = length(fz);
          float theta_w = atan(fz.y, fz.x);

          float rings = sin(rho_w * 14.0 - u_time * 1.2);
          float spokes = sin(theta_w * 12.0 + sin(rho_w * 4.0));
          float web = rings * spokes;

          float chirality = sin(u_time * 0.1) > 0.0 ? 1.0 : -1.0;
          float spiralPhase = rho_w * 5.0 + chirality * 7.0 * theta_w - u_time * 2.5;
          float spiral = sin(spiralPhase) + 0.5 * sin(spiralPhase * 2.0);

          float tunnel = sin(rho_w * 20.0 + u_time * 3.0);

          float blend1 = smoothstep(-0.5, 0.5, sin(u_time * 0.15));
          float form = mix(web, spiral, blend1);
          form = mix(form, tunnel, smoothstep(1.5, 3.0, rho_w));

          float t = pow(smoothstep(0.1, 0.85, abs(form)), 1.5);

          float phase = theta_w / TAU + 0.5;
          float lambda = mix(380.0, 700.0, fract(phase + u_time * 0.08));
          vec3 spec = wavelengthToRGB(lambda);

          spec = mix(spec, vec3(1.0, 0.0, 0.6), smoothstep(0.7, 1.0, phase)); 
          spec = mix(spec, vec3(0.0, 0.8, 1.0), smoothstep(0.0, 0.3, phase)); 

          float phaseContours = smoothstep(0.85, 1.0, sin(phase * TAU * 16.0));
          spec += vec3(0.2) * phaseContours;

          float depth = fract(rho_w * 1.2 - u_time * 0.3);
          vec3 stereo = mix(vec3(1.0, 0.0, 0.4), vec3(0.0, 0.4, 1.0), depth); 

          vec3 color = spec * stereo;
          float maxC = max(color.r, max(color.g, color.b));
          if(maxC > 0.0) color /= maxC; 

          color *= t;

          float retinal = smoothstep(0.0, 0.15, r) * (1.0 - smoothstep(0.6, 1.8, r));
          color *= retinal;

          float pulse = exp(-fract(u_time * 0.25) * 6.0);
          if (pulse > 0.02) {
            float bits = mix(18.0, 2.0, pulse * smoothstep(0.3, 1.2, r));
            float levels = exp2(max(1.0, bits));
            color = floor(color * levels) / levels;

            if (hash21(vUv * u_time) > 0.98) {
              color = mix(color, vec3(0.7, 0.0, 1.0), pulse * 0.9);
            }
          }

          fragColor = vec4(color, 1.0);
        }
      `
    });

    const matBurn = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_scene: { value: null },
        u_prev: { value: null }
      },
      vertexShader,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D u_scene;
        uniform sampler2D u_prev;

        void main() {
          vec3 scene = texture(u_scene, vUv).rgb;
          vec3 prev = texture(u_prev, vUv).rgb;

          prev *= 0.985;
          prev.r *= 0.988; 
          prev.b *= 1.002; 

          vec3 burn = min(prev + scene * 0.12, vec3(1.0));
          fragColor = vec4(burn, 1.0);
        }
      `
    });

    const matDisplay = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_scene: { value: null },
        u_burn: { value: null },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D u_scene;
        uniform sampler2D u_burn;
        uniform vec2 u_resolution;

        void main() {
          vec2 uv = vUv;
          vec2 dir = uv - 0.5;
          float r2 = dot(dir, dir);

          float paintCoverage = max(texture(u_scene, uv).r, max(texture(u_scene, uv).g, texture(u_scene, uv).b));
          
          float ca_amt = 0.015 * r2 * smoothstep(0.2, 1.0, paintCoverage);
          vec3 sceneCol;
          sceneCol.r = texture(u_scene, uv + dir * ca_amt).r;
          sceneCol.g = texture(u_scene, uv).g;
          sceneCol.b = texture(u_scene, uv - dir * ca_amt).b;

          vec3 burn = texture(u_burn, uv).rgb;
          vec3 complement = vec3(1.0) - burn;
          float adaptStrength = max(burn.r, max(burn.g, burn.b));
          
          vec3 ghost = complement * adaptStrength * (1.0 - paintCoverage);

          vec3 finalCol = sceneCol + ghost * 1.5;

          finalCol *= 1.0 - 0.35 * r2;
          finalCol = pow(max(finalCol, vec3(0.0)), vec3(1.0 / 1.15));

          fragColor = vec4(finalCol, 1.0);
        }
      `
    });

    const sceneScene = new THREE.Scene();
    sceneScene.add(new THREE.Mesh(geometry, matScene));

    const sceneBurn = new THREE.Scene();
    sceneBurn.add(new THREE.Mesh(geometry, matBurn));

    const sceneDisplay = new THREE.Scene();
    sceneDisplay.add(new THREE.Mesh(geometry, matDisplay));

    canvas.__three = {
      renderer, camera,
      rtScene, rtBurnA, rtBurnB,
      matScene, matBurn, matDisplay,
      sceneScene, sceneBurn, sceneDisplay
    };
  }

  const t = canvas.__three;

  if (t.rtScene.width !== grid.width || t.rtScene.height !== grid.height) {
    t.renderer.setSize(grid.width, grid.height, false);
    t.rtScene.setSize(grid.width, grid.height);
    t.rtBurnA.setSize(grid.width, grid.height);
    t.rtBurnB.setSize(grid.width, grid.height);
    t.matScene.uniforms.u_resolution.value.set(grid.width, grid.height);
    t.matDisplay.uniforms.u_resolution.value.set(grid.width, grid.height);
  }

  t.matScene.uniforms.u_time.value = time;

  t.renderer.setRenderTarget(t.rtScene);
  t.renderer.render(t.sceneScene, t.camera);

  t.matBurn.uniforms.u_scene.value = t.rtScene.texture;
  t.matBurn.uniforms.u_prev.value = t.rtBurnA.texture;
  t.renderer.setRenderTarget(t.rtBurnB);
  t.renderer.render(t.sceneBurn, t.camera);

  t.matDisplay.uniforms.u_scene.value = t.rtScene.texture;
  t.matDisplay.uniforms.u_burn.value = t.rtBurnB.texture;
  t.renderer.setRenderTarget(null);
  t.renderer.render(t.sceneDisplay, t.camera);

  const temp = t.rtBurnA;
  t.rtBurnA = t.rtBurnB;
  t.rtBurnB = temp;

} catch (e) {
  console.error("WebGL Initialization Failed:", e);
  throw e;
}