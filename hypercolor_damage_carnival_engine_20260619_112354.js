try {
  if (!ctx) throw new Error("WebGL2 context not available");

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.autoClear = false;

    const sceneA = new THREE.Scene();
    const sceneB = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType
    });
    
    const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType
    });

    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShaderA = `
      in vec2 vUv;
      out vec4 fragColor;

      uniform float u_time;
      uniform vec2 u_resolution;
      uniform sampler2D tPrev;

      #define PI 3.14159265359

      // Feral Hashing
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

      // Saturated Cosine Palettes (Color Systems / OKLab Vibe)
      vec3 pal(float t) {
        vec3 a = vec3(0.5, 0.5, 0.5);
        vec3 b = vec3(0.5, 0.5, 0.5);
        vec3 c = vec3(1.0, 1.0, 1.0);
        vec3 d = vec3(0.0, 0.33, 0.67);
        return a + b * cos(TAU * (c * t + d));
      }
      vec3 hotPal(float t) {
        return 0.5 + 0.5 * cos(PI * 2.0 * (t + vec3(0.0, 0.15, 0.3)));
      }
      vec3 acidPal(float t) {
        return 0.5 + 0.5 * cos(PI * 2.0 * (t + vec3(0.8, 0.9, 0.2)));
      }

      mat2 rot(float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, -s, s, c);
      }

      // FRACTAL REACTOR (Repo 13 + Structural Color + Caustics)
      vec3 reactor(vec2 uv) {
        vec2 p = uv * 2.0 - 1.0;
        p.x *= u_resolution.x / u_resolution.y;
        float d = 100.0;
        vec3 col = vec3(0.0);
        
        float t = u_time * 0.4;
        vec2 orbit = vec2(sin(t), cos(t)) * 0.1;
        p += orbit;

        for(int i=0; i<6; i++) {
            p = abs(p) - 0.45;
            p *= rot(t * 0.5 + float(i)*0.25);
            p *= 1.35;
            float currentD = length(p);
            d = min(d, currentD);
            
            // Caustic lightning web network
            float caustic = 0.015 / (abs(sin(currentD * 12.0 - u_time * 8.0)) + 0.02);
            col += acidPal(currentD * 0.3 + u_time) * caustic * 0.3;
        }
        
        // Structural color on fractal shell (Iridescence)
        vec3 iridescent = pal(d * 4.0 - u_time * 1.5) * exp(-d * 2.5);
        col += iridescent * 1.5;
        
        // Central core blowout (colored, never white)
        col += hotPal(u_time) * smoothstep(0.2, 0.0, d) * 2.0;
        
        return col;
    }

    // EARLY INTERNET UI SHARDS & GLITCHCORE
    vec4 uiShards(vec2 uv) {
        vec2 grid = uv * 12.0;
        // Orbital rotation
        grid -= 6.0;
        grid *= rot(u_time * 0.3);
        grid += 6.0;
        
        vec2 id = floor(grid);
        vec2 guv = fract(grid) - 0.5;
        
        float h = hash12(id + floor(u_time * 2.0)); // Jittering shards
        if (h > 0.85) {
            vec2 d = abs(guv) - vec2(0.35, 0.15);
            float box = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
            
            if (box < 0.0) {
                float bevel = smoothstep(0.0, -0.05, box) * smoothstep(-0.1, -0.05, box);
                vec3 base = pal(h * 20.0 + u_time);
                // Asemic Text / Broken glyphs
                float text = step(0.6, hash12(floor(guv * 25.0 + u_time * 10.0)));
                vec3 col = mix(base, acidPal(h), text * 0.8);
                col += bevel * hotPal(h + 0.5); // Bevel highlight
                return vec4(col, 1.0);
            }
        }
        return vec4(0.0);
    }

    void main() {
        vec2 uv = vUv;
        
        // SLIT-SCAN TIME RIBBONS & DATAMOSH FLOW
        vec2 flow = vec2(
            sin(uv.y * 20.0 + u_time * 2.0) * cos(uv.x * 8.0 - u_time),
            cos(uv.x * 15.0 - u_time * 1.5) * sin(uv.y * 10.0 + u_time)
        ) * 0.008;
        
        vec2 slitUV = uv;
        float ribbon = step(0.85, fract(uv.x * 8.0 + u_time * 0.3));
        slitUV.y -= ribbon * 0.05 * sin(u_time * 5.0); // Vertical slit-scan tearing
        
        vec4 history = texture(tPrev, fract(slitUV - flow)); // Fractal wrap history
        
        // Generator
        vec3 react = reactor(uv);
        vec4 shards = uiShards(uv + vec2(sin(u_time), cos(u_time))*0.2);
        
        vec3 curr = react;
        curr = mix(curr, shards.rgb, shards.a);
        
        // Glitchcore / Datamosh pixel debris
        float debris = step(0.97, hash12(uv * 150.0 + u_time));
        curr += debris * acidPal(uv.x * 5.0 - u_time);
        
        // Blend with history (Temporal Echo / Smear)
        float motionIntensity = length(flow) * 100.0;
        float feedbackWeight = clamp(0.75 + ribbon * 0.2 - motionIntensity, 0.0, 0.95);
        vec3 outCol = mix(curr, history.rgb, feedbackWeight);
        
        // Rhythmic Overload Rupture
        float rupture = step(0.98, sin(u_time * 3.1415));
        outCol = mix(outCol, curr * 1.5, rupture);

        fragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
      }
    `;

    const fragmentShaderB = `
      in vec2 vUv;
      out vec4 fragColor;

      uniform float u_time;
      uniform vec2 u_resolution;
      uniform sampler2D tInput;

      #define PI 3.14159265359

      float hash12(vec2 p) {
        vec3 p3  = fract(vec3(p.xyx) * .1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      // HSV Conversions for Color Law Enforcement
      vec3 rgb2hsv(vec3 c) {
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        float d = q.x - min(q.w, q.y);
        float e = 1.0e-10;
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
      }
      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }

      void main() {
        vec2 uv = vUv;
        
        // VHS ANALOG ARTIFACTS: Tracking Bands & Head Switching
        float tracking = step(0.92, sin(uv.y * 6.0 - u_time * 4.0));
        vec2 vhsUV = uv;
        vhsUV.x += tracking * (hash12(vec2(uv.y, floor(u_time * 10.0))) - 0.5) * 0.15;
        
        // Head switching tear at bottom
        if(uv.y < 0.08) {
            vhsUV.x += (hash12(vec2(uv.y, u_time)) - 0.5) * 0.25;
        }
        
        // CHROMATIC ABERRATION (Juicy, Radial + Directional)
        vec2 dist = vhsUV - 0.5;
        float abStrength = 0.03 + 0.02 * sin(u_time * 2.0);
        vec2 offsetR = dist * abStrength + vec2(0.015 * sin(u_time), 0.0);
        vec2 offsetB = dist * -abStrength - vec2(0.015 * cos(u_time), 0.0);
        
        float r = texture(tInput, fract(vhsUV + offsetR)).r;
        float g = texture(tInput, fract(vhsUV)).g;
        float b = texture(tInput, fract(vhsUV + offsetB)).b;
        vec3 col = vec3(r, g, b);
        
        // CROSS PROCESSING (Violent Chemistry)
        col.r = smoothstep(0.05, 0.95, col.r);
        col.g = smoothstep(0.0, 0.85, col.g);
        col.b = smoothstep(0.15, 1.0, col.b);
        
        // HALFTONE MOSAIC & RISOGRAPH (Oversized dots + Spot Color Overlaps)
        float lpi = 120.0;
        float angle = PI / 6.0 + u_time * 0.1;
        float s = sin(angle), c = cos(angle);
        vec2 rotUV = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
        vec2 grid = fract(rotUV * lpi) - 0.5;
        
        float dotSize = length(col) * 0.35; 
        float dots = smoothstep(dotSize + 0.1, dotSize, length(grid));
        
        // Riso Spot Colors (Electric Cyan & Fluorescent Pink/Mango)
        vec3 riso1 = vec3(1.0, 0.1, 0.6); 
        vec3 riso2 = vec3(0.0, 0.9, 0.8); 
        
        // Riso Misregistration
        vec3 printCol = mix(col, riso1 * col.r, dots * 0.6);
        printCol = mix(printCol, riso2 * col.b, (1.0 - dots) * 0.6);
        col = mix(col, printCol, 0.8);
        
        // Riso Grain & VHS Snow
        float grain = hash12(uv * u_resolution + u_time * 50.0);
        col += (grain - 0.5) * 0.2;
        
        // COLOR LAW ENFORCEMENT: No Black, No White, Max Saturation
        vec3 hsv = rgb2hsv(col);
        hsv.y = clamp(hsv.y * 1.5 + 0.3, 0.6, 1.0); // Force intense saturation
        col = hsv2rgb(hsv);
        
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        
        // Deep chromatic shadows (Indigo/Violet/Plum)
        vec3 deepShadow = vec3(0.25, 0.0, 0.45); 
        // Colored light highlights (Acid Yellow/Hot Pink/Electric Cyan)
        vec3 brightLight = vec3(1.0, 0.9, 0.1) * step(0.5, fract(u_time * 0.5)) + 
                           vec3(0.0, 1.0, 0.8) * step(fract(u_time * 0.5), 0.5);
                           
        col = mix(deepShadow, col, smoothstep(0.0, 0.25, lum));
        col = mix(col, brightLight, smoothstep(0.85, 1.0, lum));
        
        fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }
    `;

    const matA = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        tPrev: { value: null }
      },
      vertexShader,
      fragmentShader: fragmentShaderA
    });

    const matB = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        tInput: { value: null }
      },
      vertexShader,
      fragmentShader: fragmentShaderB
    });

    const quadA = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matA);
    sceneA.add(quadA);
    
    const quadB = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matB);
    sceneB.add(quadB);

    canvas.__three = { renderer, sceneA, sceneB, camera, rtA, rtB, matA, matB, flip: false };
  }

  const t = canvas.__three;
  if (!t) return;

  t.renderer.setSize(grid.width, grid.height, false);
  t.matA.uniforms.u_resolution.value.set(grid.width, grid.height);
  t.matB.uniforms.u_resolution.value.set(grid.width, grid.height);
  t.matA.uniforms.u_time.value = time;
  t.matB.uniforms.u_time.value = time;

  let readRT = t.flip ? t.rtB : t.rtA;
  let writeRT = t.flip ? t.rtA : t.rtB;

  // Pass 1: Generator & Temporal Datamosh Feedback
  t.matA.uniforms.tPrev.value = readRT.texture;
  t.renderer.setRenderTarget(writeRT);
  t.renderer.render(t.sceneA, t.camera);

  // Pass 2: Print Damage, Chromatic Aberration, Color Law Composite to Screen
  t.matB.uniforms.tInput.value = writeRT.texture;
  t.renderer.setRenderTarget(null);
  t.renderer.render(t.sceneB, t.camera);

  t.flip = !t.flip;
} catch (e) {
  console.error("Carnival Engine Ruptured:", e);
}