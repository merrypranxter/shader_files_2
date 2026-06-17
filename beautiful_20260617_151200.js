export function render(ctx, grid, time, repos, input, mouse, canvas, THREE) {
  if (!canvas.__three) {
    try {
      if (!ctx) throw new Error("WebGL 2 context not available");
      
      const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
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
        uniform vec2 u_mouse;
        
        vec3 OKLab_to_linearSRGB(vec3 c) {
            float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
            float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
            float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
            float l = l_*l_*l_;
            float m = m_*m_*m_;
            float s = s_*s_*s_;
            return vec3(
                 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
            );
        }
        
        float linear_to_sRGB(float x) {
            x = clamp(x, 0.0, 1.0);
            return x <= 0.0031308 ? x * 12.92 : 1.055 * pow(x, 1.0/2.4) - 0.055;
        }
        
        vec3 OKLab_to_sRGB(vec3 c) {
            vec3 lin = OKLab_to_linearSRGB(c);
            return vec3(linear_to_sRGB(lin.r), linear_to_sRGB(lin.g), linear_to_sRGB(lin.b));
        }
        
        vec3 OKLCh_to_OKLab(vec3 lch) {
            return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
        }
        
        float hash(vec2 p) { 
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); 
        }
        
        float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            vec2 u = f*f*(3.0-2.0*f);
            return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
                       mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
        }
        
        float fbm(vec2 p) {
            float v = 0.0, a = 0.5;
            for(int i=0; i<5; i++) { v+=a*noise(p); p*=2.0; a*=0.5; }
            return v;
        }
        
        vec2 cmul(vec2 a, vec2 b) { 
            return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); 
        }
        
        vec2 cdiv(vec2 a, vec2 b) { 
            float d = dot(b,b); 
            return vec2(dot(a,b), a.y*b.x - a.x*b.y)/(d+1e-8); 
        }
        
        float squiggle_line(vec2 p, float row, float freq, float amp, float t) {
            float y_off = amp * sin(freq * p.x + t + row * 2.39996);
            return smoothstep(0.02, 0.0, abs(p.y - row - y_off));
        }
        
        void main() {
            vec2 uv = vUv;
            vec2 p = (uv - 0.5) * vec2(u_resolution.x/u_resolution.y, 1.0) * 3.0;
            
            float t = u_time * 0.15;
            float c = cos(t), s = sin(t);
            p = vec2(c*p.x - s*p.y, s*p.x + c*p.y);
            p *= (0.7 + 0.3 * sin(u_time * 0.1));
            
            float w1 = fbm(p * 1.5 + u_time * 0.4);
            float w2 = fbm(p * 1.5 - u_time * 0.3 + 10.0);
            vec2 wind = vec2(w1, w2) * 2.0 - 1.0;
            wind += vec2(0.8, 1.0) + (u_mouse - 0.5) * 1.5; 
            
            vec2 z = p;
            float iter = 50.0;
            
            for(int i=0; i<50; i++) {
                vec2 z2 = cmul(z, z);
                vec2 z4 = cmul(z2, z2);
                vec2 z5 = cmul(z4, z);
                
                vec2 f = z5 - vec2(1.0, 0.0);
                vec2 fp = 5.0 * z4;
                
                vec2 step = cdiv(f, fp);
                
                z = z - step + wind * 0.025 * (1.0 - float(i)/50.0);
                
                if (length(step) < 0.005) {
                    iter = float(i);
                    break;
                }
            }
            
            vec3 col;
            if (iter >= 49.0) {
                col = vec3(0.05) + 0.03 * fbm(p * 10.0);
            } else {
                float root_angle = atan(z.y, z.x);
                float hue_base = (root_angle / 6.28318) + 0.5;
                
                float h = hue_base * 360.0 + u_time * 12.0;
                float C = 0.16 + 0.04 * sin(iter * 0.8); 
                float L = 0.65 - 0.008 * iter;
                
                col = OKLab_to_sRGB(OKLCh_to_OKLab(vec3(L, C, h * 3.14159/180.0)));
            }
            
            vec2 overlay_p = p + wind * 0.15;
            vec3 overlayCol = col;
            float alpha = 0.0;
            
            for(int i=0; i<8; i++) {
                float row = -2.5 + float(i) * 0.6;
                float sq = squiggle_line(overlay_p, row, 3.5, 0.12, u_time * 1.5);
                if (sq > 0.0) {
                    float sq_h = float(i) * 51.4 + u_time * 20.0;
                    overlayCol = OKLab_to_sRGB(OKLCh_to_OKLab(vec3(0.7, 0.16, sq_h * 3.14159/180.0)));
                    alpha = max(alpha, sq);
                }
            }
            
            vec2 dot_gv = fract(overlay_p * 4.5) - 0.5;
            vec2 dot_id = floor(overlay_p * 4.5);
            if (hash(dot_id) > 0.72) {
                float d = length(dot_gv);
                float fill = 1.0 - smoothstep(0.12, 0.14, d);
                float ring = smoothstep(0.14, 0.16, d) * (1.0 - smoothstep(0.18, 0.20, d));
                if (fill > 0.0) {
                    overlayCol = vec3(1.0, 0.8, 0.0); 
                    alpha = max(alpha, fill);
                }
                if (ring > 0.0) {
                    overlayCol = vec3(0.0); 
                    alpha = max(alpha, ring);
                }
            }
            
            col = mix(col, overlayCol, alpha);
            
            float lpi = 110.0;
            vec2 ht_cell = fract(vec2(uv.x - uv.y, uv.x + uv.y) * 0.707 * lpi) - 0.5;
            float ht = smoothstep(0.35, 0.15, length(ht_cell));
            
            vec3 paper = vec3(0.96, 0.94, 0.91);
            vec3 ink = 1.0 - col; 
            ink *= (0.65 + 0.35 * ht); 
            col = paper * (1.0 - ink); 
            
            col *= 1.0 - 0.35 * length(uv - 0.5);
            
            fragColor = vec4(col, 1.0);
        }
      `;

      const material = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader,
        fragmentShader,
        uniforms: {
          u_time: { value: 0 },
          u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
          u_mouse: { value: new THREE.Vector2(0.5, 0.5) }
        },
        depthWrite: false,
        depthTest: false
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
    if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(grid.width, grid.height);
    if (material.uniforms.u_mouse && mouse) {
      material.uniforms.u_mouse.value.x += (mouse.x / grid.width - material.uniforms.u_mouse.value.x) * 0.05;
      material.uniforms.u_mouse.value.y += (1.0 - mouse.y / grid.height - material.uniforms.u_mouse.value.y) * 0.05;
    }
  }

  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);
}