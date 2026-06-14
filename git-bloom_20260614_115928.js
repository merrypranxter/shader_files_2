if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");
    
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
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
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;

        uniform float u_time;
        uniform vec2 u_resolution;

        #define PI 3.14159265359
        #define TAU 6.28318530718

        float hash(vec2 p) {
            p = fract(p * vec2(127.1, 311.7));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }

        float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f*f*(3.0-2.0*f);
            return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x),
                       mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y);
        }

        float fbm(vec2 p, float t) {
            float v = 0.0, a = 0.5;
            float s = sin(0.5), c = cos(0.5);
            mat2 r = mat2(c, -s, s, c);
            for(int i=0; i<5; i++) {
                v += a * noise(p);
                p = r * p * 2.0 + vec2(t);
                a *= 0.5;
            }
            return v;
        }

        mat2 rot(float a) {
            float s = sin(a), c = cos(a);
            return mat2(c, -s, s, c);
        }

        vec2 radialFold(vec2 p, float n) {
            float a = atan(p.y, p.x);
            float l = length(p);
            float s = TAU / n;
            a = mod(a + s*0.5, s) - s*0.5;
            return vec2(cos(a), sin(a)) * l;
        }

        vec3 paletteCyber(float t) {
            return vec3(0.5) + vec3(0.5, 0.5, 0.33)*cos(TAU*(vec3(2.0, 1.0, 1.0)*t + vec3(0.5, 0.2, 0.25)));
        }

        vec3 paletteAcid(float t) {
            return vec3(0.5) + vec3(0.5)*cos(TAU*(vec3(1.0)*t + vec3(0.0, 0.33, 0.67)));
        }

        vec3 thinFilm(float d) {
            return 0.5 + 0.5 * cos(TAU * (d * 8.0 * vec3(1.0, 1.2, 1.4) + vec3(0.0, 0.33, 0.67)));
        }

        float getWarpedTime() {
            float t = u_time;
            float q = floor(t * 12.0);
            float h = hash(vec2(q, 1.0));
            if(h > 0.85) t = q / 12.0 + (h - 0.85); 
            return t;
        }

        vec3 map(vec2 uv, float t) {
            vec2 p = uv;
            
            p.x += fbm(uv * 2.5, t * 0.15) * 0.2;
            p.y += fbm(uv * 2.5 + 10.0, t * 0.15) * 0.2;
            
            vec3 col = vec3(0.03, 0.01, 0.05);
            
            float d_grid = length(fract(p * 4.0 + t*0.1) - 0.5) - 0.05;
            float line_grid = smoothstep(0.02, 0.0, abs(d_grid));
            col = mix(col, vec3(0.2, 0.0, 0.3), line_grid * 0.4);
            
            float d_kifs = 1e5;
            vec2 kp = p;
            float scale = 1.0;
            
            float foldCount = 6.0 + 2.0 * floor(mod(t * 0.4, 4.0)); 
            kp = radialFold(kp, foldCount);
            
            for(int i=0; i<4; i++) {
                kp = abs(kp) - vec2(0.1, 0.2) * (1.0 + sin(t*0.5)*0.3);
                kp = rot(t * 0.2 + float(i)*0.4) * kp;
                kp *= 1.3;
                scale *= 1.3;
                
                float d = (length(kp - vec2(0.0, 0.2)) - 0.15) / scale;
                d_kifs = min(d_kifs, d);
            }
            
            vec2 cp = radialFold(p, 12.0);
            float d_core = length(cp - vec2(0.15, 0.0)) - 0.05 + fbm(cp*15.0, t)*0.03;
            float d_center = length(p) - 0.08;
            d_core = min(d_core, d_center);
            
            float wash_kifs = smoothstep(0.03, -0.05, d_kifs);
            float line_kifs = smoothstep(0.004, 0.0, abs(d_kifs)) * 1.5;
            vec3 c_kifs = paletteCyber(length(p) - t * 0.1);
            c_kifs = mix(c_kifs, thinFilm(d_kifs), 0.6); 
            
            col = mix(col, vec3(0.0), smoothstep(0.08, 0.0, d_kifs - 0.04) * 0.8);
            col = mix(col, c_kifs, wash_kifs * 0.85);
            col = mix(col, vec3(0.0, 1.0, 0.8), line_kifs);
            
            float wash_core = smoothstep(0.015, -0.02, d_core);
            float line_core = smoothstep(0.005, 0.0, abs(d_core)) * 2.0;
            vec3 c_core = paletteAcid(atan(p.y, p.x)/TAU + t*0.2);
            
            col = mix(col, vec3(0.0), smoothstep(0.05, 0.0, d_core - 0.02) * 0.9);
            col = mix(col, c_core, wash_core * 0.95);
            col = mix(col, vec3(1.0, 0.0, 0.5), line_core);
            
            float density = 90.0;
            vec2 cell = floor(uv * density);
            vec2 center = (cell + 0.5 + vec2(hash(cell)-0.5, hash(cell+7.0)-0.5)*0.5) / density;
            float stipple = smoothstep(0.4/density, 0.1/density, length(uv - center));
            float darkness = smoothstep(0.0, 0.5, length(p));
            col -= stipple * darkness * wash_kifs * 0.6;
            
            return col;
        }

        void main() {
            vec2 uv = vUv * 2.0 - 1.0;
            uv.x *= u_resolution.x / u_resolution.y;
            
            float t = getWarpedTime();
            
            float shift = 0.006 + 0.01 * fbm(uv * 4.0, t);
            
            vec3 col;
            col.r = map(uv + vec2(shift, 0.0), t).r;
            col.g = map(uv, t).g;
            col.b = map(uv - vec2(shift, 0.0), t).b;
            
            float freq = 130.0;
            mat2 rotScreen = rot(PI / 4.0);
            vec2 hUv = rotScreen * vUv * freq;
            vec2 hCell = fract(hUv) - 0.5;
            float luma = dot(col, vec3(0.299, 0.587, 0.114));
            float dotRadius = luma * 0.55;
            float halftone = smoothstep(dotRadius + 0.1, dotRadius - 0.1, length(hCell));
            
            col += halftone * col * 0.4;
            
            col += (hash(uv * u_time) - 0.5) * 0.08;
            col *= 1.0 - smoothstep(0.5, 1.5, length(uv));
            
            fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
      `
    });
    
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    
    canvas.__three = { renderer, scene, camera, material };
  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
    if (ctx && ctx.fillStyle !== undefined) {
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, grid.width, grid.height);
      ctx.fillStyle = '#ff00ff';
      ctx.font = '14px monospace';
      ctx.fillText("WebGL 2 required for this feral botanical system.", 20, 40);
    }
    return;
  }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms) {
  if (material.uniforms.u_time) material.uniforms.u_time.value = time;
  if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(grid.width, grid.height);
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);