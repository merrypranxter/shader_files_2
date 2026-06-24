if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform float u_time;
        uniform vec2 u_resolution;
        in vec2 vUv;
        out vec4 fragColor;

        // 2D Rotation Matrix
        mat2 rot(float a) {
            float c = cos(a), s = sin(a);
            return mat2(c, -s, s, c);
        }

        // Hash and Noise functions for fluid / schlieren
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

        float fbm(vec2 p) {
            float f = 0.0;
            float amp = 0.5;
            for (int i = 0; i < 5; i++) {
                f += amp * noise(p);
                p *= 2.0;
                amp *= 0.5;
            }
            return f;
        }

        // Signed Distance Functions
        float sdBox(vec2 p, vec2 b) {
            vec2 d = abs(p) - b;
            return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
        }

        // Background generation: Rich, colorful fluid heat-haze
        vec3 getBackground(vec2 uv, float t) {
            vec2 q = uv;
            
            // Multi-scale fluid distortion
            float f1 = fbm(q * 2.0 + vec2(t * 0.3, t * 0.15));
            float f2 = fbm(q * 3.5 - vec2(t * 0.2, t * 0.25) + vec2(5.2, 1.3));
            q += 0.15 * vec2(f1, f2);

            float f3 = fbm(q * 3.0 + vec2(t * 0.1, t * 0.05));

            // Saturated, balanced palette
            vec3 cCyan = vec3(0.0, 0.8, 0.9);
            vec3 cMagenta = vec3(0.9, 0.1, 0.7);
            vec3 cViolet = vec3(0.5, 0.0, 0.9);
            vec3 cAcid = vec3(0.6, 0.9, 0.0);
            vec3 cOrange = vec3(1.0, 0.5, 0.0);
            vec3 cElectric = vec3(0.0, 0.3, 1.0);

            vec3 col = mix(cCyan, cViolet, smoothstep(0.2, 0.8, f1));
            col = mix(col, cMagenta, smoothstep(0.3, 0.7, f2));
            col = mix(col, cOrange, smoothstep(0.4, 0.8, f3));
            col = mix(col, cAcid, smoothstep(0.6, 1.0, f1 * f2));
            col = mix(col, cElectric, smoothstep(0.5, 0.9, f2 * f3));

            // Subtle schlieren ripple bands
            float ripple = sin(f3 * 25.0) * 0.04;
            col += vec3(ripple);

            return col;
        }

        // Scene SDF Geometry
        float map(vec2 uv, float t) {
            float d = 1e10;

            // Global sigil rotation
            vec2 suv = uv * rot(t * 0.1);

            // Translucent panes / Outer rings
            d = min(d, abs(length(suv) - 0.45) - 0.012);
            d = min(d, abs(length(suv) - 0.40) - 0.004);

            // Inner geomantic star
            vec2 suvRot = suv * rot(3.14159 / 4.0);
            float cross1 = min(sdBox(suv, vec2(0.015, 0.35)), sdBox(suv, vec2(0.35, 0.015)));
            float cross2 = min(sdBox(suvRot, vec2(0.01, 0.25)), sdBox(suvRot, vec2(0.25, 0.01)));
            d = min(d, min(cross1, cross2));

            // Central focus
            d = min(d, abs(length(suv) - 0.12) - 0.015);

            // Geomantic dots (Populus arrangement)
            for(int i = -1; i <= 2; i++) {
                float yOff = -0.15 + float(i) * 0.1;
                vec2 dpL = suv - vec2(-0.06, yOff);
                vec2 dpR = suv - vec2( 0.06, yOff);
                d = min(d, length(dpL) - 0.018);
                d = min(d, length(dpR) - 0.018);
            }

            // Drifting collage fragments
            float t1 = t * 0.3;
            vec2 p1 = uv - vec2(sin(t1) * 0.6, cos(t * 0.25) * 0.5);
            p1 *= rot(t * 0.15);
            d = min(d, sdBox(p1, vec2(0.12, 0.18)) - 0.01);

            float t2 = t * 0.4;
            vec2 p2 = uv - vec2(cos(t2) * -0.5, sin(t * 0.35) * 0.6);
            p2 *= rot(-t * 0.2);
            d = min(d, sdBox(p2, vec2(0.2, 0.08)) - 0.01);

            return d;
        }

        // SDF Normal for refraction
        vec2 getNormal(vec2 uv, float t) {
            vec2 e = vec2(0.002, 0.0);
            return normalize(vec2(
                map(uv + e.xy, t) - map(uv - e.xy, t),
                map(uv + e.yx, t) - map(uv - e.yx, t)
            ));
        }

        // Render the scene at a specific time (allows temporal offset)
        vec3 renderScene(vec2 uv, float t) {
            float d = map(uv, t);
            vec3 col = getBackground(uv, t);

            // Glass Refraction & Lighting
            if (d < 0.0) {
                vec2 n = getNormal(uv, t);
                vec2 refUV = uv + n * 0.06; // Refraction offset
                col = getBackground(refUV, t);
                
                // Glass tint
                col *= vec3(0.95, 0.92, 1.0); 
                
                // Specular highlight
                float spec = pow(max(dot(n, normalize(vec2(1.0, 1.0))), 0.0), 16.0);
                col += spec * vec3(0.7, 0.8, 1.0);
            }

            // Beveled inner edge highlight
            float innerEdge = smoothstep(0.0, -0.01, d) * smoothstep(-0.02, -0.01, d);
            col += innerEdge * vec3(1.0, 0.9, 0.7) * 0.4;

            // Luminous outer glow
            float edgeGlow = exp(-max(d, 0.0) * 35.0);
            col += vec3(0.3, 0.5, 1.0) * edgeGlow * 0.45;
            
            // White sparkle accents on intersections
            float sparkle = exp(-max(d, 0.0) * 120.0) * pow(noise(uv * 25.0 - vec2(t * 2.0, t * 1.5)), 3.0);
            col += vec3(1.0) * sparkle * 1.5;

            return col;
        }

        void main() {
            vec2 baseUv = vUv * 2.0 - 1.0;
            baseUv.x *= u_resolution.x / u_resolution.y;

            // Global schlieren heat-haze distortion
            vec2 haze = vec2(
                fbm(baseUv * 4.0 + vec2(u_time * 0.4, 0.0)),
                fbm(baseUv * 4.0 - vec2(0.0, u_time * 0.35))
            ) * 0.025;

            vec2 uv = baseUv + haze;

            // Pulfrich-style temporal offset & Chromatic Aberration
            float t0 = u_time;
            float t1 = u_time - 0.04;
            float t2 = u_time - 0.08;

            vec2 offR = vec2(0.005, 0.0);
            vec2 offB = vec2(-0.005, 0.0);

            vec3 colR = renderScene(uv + offR, t0);
            vec3 colG = renderScene(uv, t1);
            vec3 colB = renderScene(uv + offB, t2);

            vec3 finalCol = vec3(colR.r, colG.g, colB.b);

            // Mix original color back slightly to keep midtones rich and avoid harsh RGB splitting everywhere
            vec3 blendCol = (colR + colG + colB) / 3.0;
            finalCol = mix(finalCol, blendCol, 0.35);

            // Subtle CRT Phosphor & Light Damage Artifacts
            float scanline = sin(vUv.y * u_resolution.y * 3.14159) * 0.025;
            finalCol -= scanline;

            float n = hash(uv + vec2(u_time, u_time * 0.5));
            finalCol += (n - 0.5) * 0.04;

            // Smooth vignette
            float vig = length(baseUv);
            finalCol *= smoothstep(1.2, 0.4, vig);

            fragColor = vec4(finalCol, 1.0);
        }
      `
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
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
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);