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
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;

        in vec2 vUv;
        out vec4 fragColor;

        uniform float u_time;
        uniform vec2 u_resolution;

        // --- Noise & Utils ---
        float hash(vec2 p) { 
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); 
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), f.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }

        float fbm(vec2 p) {
            float f = 0.0;
            f += 0.500 * noise(p); p *= 2.01;
            f += 0.250 * noise(p); p *= 2.02;
            f += 0.125 * noise(p);
            return f;
        }

        mat2 rot(float a) {
            float s = sin(a), c = cos(a);
            return mat2(c, -s, s, c);
        }

        // --- SDFs ---
        float sdCircle(vec2 p, float r) {
            return length(p) - r;
        }

        float sdEqTriangle(vec2 p, float r) {
            const float k = sqrt(3.0);
            p.x = abs(p.x) - r;
            p.y = p.y + r/k;
            if( p.x + k*p.y > 0.0 ) p = vec2(p.x-k*p.y,-k*p.x-p.y)/2.0;
            p.x -= clamp( p.x, -2.0*r, 0.0 );
            return -length(p)*sign(p.y);
        }

        // --- Structural Color ---
        vec3 wavelengthToRGB(float W) {
            float r = 0.0, g = 0.0, b = 0.0;
            if (W >= 380.0 && W < 440.0) { r = -(W - 440.0) / (440.0 - 380.0); b = 1.0; }
            else if (W >= 440.0 && W < 490.0) { g = (W - 440.0) / (490.0 - 440.0); b = 1.0; }
            else if (W >= 490.0 && W < 510.0) { g = 1.0; b = -(W - 510.0) / (510.0 - 490.0); }
            else if (W >= 510.0 && W < 580.0) { r = (W - 510.0) / (580.0 - 510.0); g = 1.0; }
            else if (W >= 580.0 && W < 645.0) { r = 1.0; g = -(W - 645.0) / (645.0 - 580.0); }
            else if (W >= 645.0 && W <= 780.0) { r = 1.0; }
            
            float factor = 1.0;
            if (W >= 380.0 && W < 420.0) factor = 0.3 + 0.7*(W - 380.0) / (420.0 - 380.0);
            else if (W >= 700.0 && W <= 780.0) factor = 0.3 + 0.7*(780.0 - W) / (780.0 - 700.0);
            
            return vec3(r, g, b) * factor;
        }

        vec3 thinFilm(float thickness) {
            vec3 col = vec3(0.0);
            float n = 1.4; 
            for(int i = 0; i < 8; i++) {
                float fi = float(i);
                float lambda = mix(400.0, 700.0, fi/7.0);
                float pathDiff = 2.0 * n * thickness;
                float phase = (pathDiff / lambda) * 6.28318;
                col += wavelengthToRGB(lambda) * (0.5 + 0.5*cos(phase));
            }
            return col / 8.0;
        }

        // --- Riso Inks ---
        const vec3 INK_FLUO_PINK = vec3(1.0, 0.420, 0.710);
        const vec3 INK_YELLOW    = vec3(1.0, 0.910, 0.0);
        const vec3 INK_TEAL      = vec3(0.0, 0.514, 0.541);
        const vec3 INK_PURPLE    = vec3(0.239, 0.122, 0.427);
        const vec3 PAPER         = vec3(0.96, 0.94, 0.91);

        // --- Separation ---
        void separate(vec3 color, out float cPink, out float cYellow, out float cTeal, out float cPurple) {
            float k = 1.0 - max(color.r, max(color.g, color.b));
            float c = (1.0 - color.r - k) / (1.0 - k + 0.0001);
            float m = (1.0 - color.g - k) / (1.0 - k + 0.0001);
            float y = (1.0 - color.b - k) / (1.0 - k + 0.0001);
            
            cTeal   = pow(clamp(c, 0.0, 1.0), 0.8);
            cPink   = pow(clamp(m, 0.0, 1.0), 0.8);
            cYellow = pow(clamp(y, 0.0, 1.0), 0.8);
            cPurple = pow(clamp(k, 0.0, 1.0), 0.9);
        }

        // --- Halftone ---
        float halftone(vec2 uv, float lpi, float angle, float density) {
            float c = cos(angle), s = sin(angle);
            vec2 rot_uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
            rot_uv *= lpi * 3.14159265;
            float dot_val = (sin(rot_uv.x) * sin(rot_uv.y)) * 0.5 + 0.5;
            float adjusted_density = clamp(density * 1.15, 0.0, 1.0);
            return smoothstep(1.0 - adjusted_density - 0.1, 1.0 - adjusted_density + 0.1, dot_val);
        }

        // --- Scene ---
        vec3 renderScene(vec2 uv) {
            vec3 col = vec3(0.0);
            
            // Pulfrich lateral offsets mapping to Chromadepth
            float l_bg   = sin(u_time * 1.1) * 0.02;
            float l_mid  = sin(u_time * 1.3 + 1.0) * 0.05;
            float l_near = sin(u_time * 1.5 + 2.0) * 0.09;
            
            // Background Sunburst (Simultaneous Contrast + Cool Colors Receding)
            vec2 bg_uv = uv + vec2(l_bg, 0.0);
            float angle = atan(bg_uv.y, bg_uv.x);
            float rays = sin(angle * 30.0 + u_time * 1.5);
            vec3 bg = mix(vec3(0.0, 0.1, 0.4), vec3(0.0, 0.4, 0.6), step(0.0, rays));
            col = bg;
            
            // Floating Birefringence Shards (Structural Color)
            float dCryst = 1e5;
            for(int i=0; i<6; i++) {
                float fi = float(i);
                vec2 pos = vec2(sin(u_time * 0.2 + fi * 1.3)*0.8, cos(u_time * 0.3 + fi * 2.1)*0.8);
                pos.x += l_mid;
                vec2 p = uv - pos;
                p *= rot(u_time * 0.5 + fi);
                float hex = max(abs(p.x), abs(p.x*0.5 + p.y*0.866)) - 0.15;
                dCryst = min(dCryst, hex);
            }
            vec3 crystCol = thinFilm(fbm(uv * 5.0 + u_time) * 2000.0 + 500.0);
            float shardEdge = smoothstep(0.0, 0.01, dCryst) - smoothstep(0.01, 0.02, dCryst);
            col = mix(col, vec3(0.1), shardEdge);
            col = mix(col, crystCol, 1.0 - smoothstep(0.01, 0.02, dCryst));
            
            // Kanizsa Pac-men (Mid-depth, Hot Orange)
            vec2 k_uv = uv + vec2(l_mid, 0.0);
            float k_tri = sdEqTriangle(k_uv, 0.4);
            float pac1 = sdCircle(k_uv - vec2(0.0, 0.4618), 0.2); 
            float pac2 = sdCircle(k_uv - vec2(-0.4, -0.2309), 0.2);
            float pac3 = sdCircle(k_uv - vec2(0.4, -0.2309), 0.2);
            float pacmen = min(pac1, min(pac2, pac3));
            pacmen = max(pacmen, -k_tri); 
            vec3 pacCol = vec3(1.0, 0.5, 0.0); 
            col = mix(col, pacCol, 1.0 - smoothstep(0.0, 0.01, pacmen));
            
            // Implied Triangle Content (Chromadepth Tunnel)
            vec2 t_uv = uv + vec2(l_near, 0.0);
            float innerTri = sdEqTriangle(t_uv, 0.4);
            
            float t_rad = length(t_uv);
            float tunnel = fract(1.0 / (t_rad + 0.05) + u_time * 2.0);
            float depthMap = clamp(t_rad * 2.5, 0.0, 1.0);
            vec3 depthCol = mix(vec3(0.0, 0.2, 0.8), vec3(1.0, 0.1, 0.5), depthMap);
            
            // Moiré overlay inside triangle (Visual Vibration)
            float moire = sin(t_uv.x * 200.0) * sin(t_uv.y * 200.0 + u_time * 10.0);
            depthCol += moire * 0.25;
            
            col = mix(col, depthCol * tunnel, 1.0 - smoothstep(0.0, 0.01, innerTri));
            
            // Floating Iridescent Orb in center
            vec2 orb_uv = uv + vec2(sin(u_time * 2.5)*0.15, 0.0); 
            float orb = sdCircle(orb_uv, 0.12);
            vec3 orbCol = thinFilm(length(orb_uv)*4000.0 - u_time * 600.0);
            col = mix(col, orbCol, 1.0 - smoothstep(0.0, 0.01, orb));
            
            float orbRing = abs(orb) - 0.005;
            col = mix(col, vec3(1.0, 0.9, 0.0), 1.0 - smoothstep(0.0, 0.01, orbRing));
            
            return col;
        }

        void main() {
            vec2 uv = vUv * 2.0 - 1.0;
            uv.x *= u_resolution.x / u_resolution.y;
            
            // Render the raw optical illusion scene
            vec3 sceneColor = renderScene(uv);
            
            // Riso Separation
            float cPink, cYellow, cTeal, cPurple;
            separate(sceneColor, cPink, cYellow, cTeal, cPurple);
            
            vec2 aspect_uv = vUv;
            aspect_uv.x *= u_resolution.x / u_resolution.y;
            
            // Animated Misregistration (Chaos Mode)
            float drift_t = u_time * 0.5;
            vec2 misPink   = vec2(sin(drift_t * 1.3), cos(drift_t * 1.7)) * 0.008;
            vec2 misYellow = vec2(sin(drift_t * 1.1 + 2.0), cos(drift_t * 1.5 + 1.0)) * 0.005;
            vec2 misTeal   = vec2(sin(drift_t * 1.4 + 4.0), cos(drift_t * 1.2 + 3.0)) * 0.006;
            vec2 misPurple = vec2(sin(drift_t * 0.9 + 1.0), cos(drift_t * 1.6 + 5.0)) * 0.007;

            vec2 uvPink   = aspect_uv + misPink;
            vec2 uvYellow = aspect_uv + misYellow;
            vec2 uvTeal   = aspect_uv + misTeal;
            vec2 uvPurple = aspect_uv + misPurple;
            
            float lpi = 85.0; 
            
            // Halftone Pass
            float hPink   = halftone(uvPink, lpi, radians(15.0), cPink);
            float hYellow = halftone(uvYellow, lpi, radians(75.0), cYellow);
            float hTeal   = halftone(uvTeal, lpi, radians(105.0), cTeal);
            float hPurple = halftone(uvPurple, lpi, radians(45.0), cPurple);
            
            // Mechanical dropout
            float drop = step(0.04, hash(vUv * u_resolution + u_time));
            hPink *= drop; 
            hYellow *= drop; 
            hTeal *= drop; 
            hPurple *= drop;
            
            // Multiply Blend (Subtractive)
            vec3 T_Pink   = mix(vec3(1.0), INK_FLUO_PINK, hPink * 0.85);
            vec3 T_Yellow = mix(vec3(1.0), INK_YELLOW, hYellow * 0.85);
            vec3 T_Teal   = mix(vec3(1.0), INK_TEAL, hTeal * 0.85);
            vec3 T_Purple = mix(vec3(1.0), INK_PURPLE, hPurple * 0.95);
            
            vec3 finalCol = PAPER * T_Teal * T_Pink * T_Yellow * T_Purple;
            
            // Paper grain
            finalCol -= noise(vUv * u_resolution * 0.5) * 0.05;
            
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

if (material && material.uniforms && material.uniforms.u_time) {
  material.uniforms.u_time.value = time;
  material.uniforms.u_resolution.value.set(grid.width, grid.height);
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);