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
            gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        
        uniform float u_time;
        uniform vec2 u_resolution;
        
        in vec2 vUv;
        out vec4 fragColor;
        
        float hash12(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * 0.1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
        }
        
        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
                       mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        
        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            mat2 rot = mat2(0.866025, -0.5, 0.5, 0.866025);
            for(int i = 0; i < 5; i++) {
                v += a * noise(p);
                p = rot * p * 2.0;
                a *= 0.5;
            }
            return v;
        }
        
        float stochastic_sparkle(vec2 uv, float density, float time) {
            float temporal_offset = fract(time * 0.1) * 2.39996323; 
            vec2 hash_uv = uv * 1000.0 + vec2(cos(temporal_offset), sin(temporal_offset)) * 10.0;
            float h = hash12(hash_uv);
            float threshold = 1.0 - density;
            return smoothstep(threshold - 0.05, threshold, h);
        }
        
        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution.xy;
            vec2 p = uv * 2.0 - 1.0;
            p.x *= u_resolution.x / u_resolution.y;
            
            float t_slow = u_time * 0.12;
            float t_med = u_time * 0.5;
            float t_fast = u_time * 6.0;
            
            vec2 warp = vec2(fbm(p * 2.0 + t_slow), fbm(p * 2.0 - t_slow + 1.618));
            vec2 p_warped = p + warp * 0.6;
            
            float r_warped = length(p_warped);
            vec2 p_lens = p_warped / (r_warped + 0.15); 
            
            float freq = 20.0 + 8.0 * fbm(p * 1.5 + t_slow);
            
            float valC = cos(p_lens.x * freq + t_med + warp.x * 3.0);
            float maskC = smoothstep(0.0, 0.03, valC);
            
            float angM = 2.09439; 
            vec2 pM = vec2(p_lens.x * cos(angM) - p_lens.y * sin(angM),
                           p_lens.x * sin(angM) + p_lens.y * cos(angM));
            float valM = cos(pM.x * freq - t_med * 1.1 + warp.y * 3.0);
            float maskM = smoothstep(0.0, 0.03, valM);
            
            float angY = 4.18879; 
            vec2 pY = vec2(p_lens.x * cos(angY) - p_lens.y * sin(angY),
                           p_lens.x * sin(angY) + p_lens.y * cos(angY));
            float valY = cos((pY.x + r_warped * 0.8) * freq + t_med * 0.9);
            float maskY = smoothstep(0.0, 0.03, valY);
            
            vec3 neon_c = vec3(0.0, 1.0, 1.0);
            vec3 neon_m = vec3(1.0, 0.0, 1.0);
            vec3 neon_y = vec3(1.0, 1.0, 0.0);
            
            vec3 col = maskC * neon_c + maskM * neon_m + maskY * neon_y;
            
            float overlaps = (maskC * maskM) + (maskM * maskY) + (maskC * maskY);
            col = mix(col, vec3(0.0), smoothstep(0.1, 0.8, overlaps));
            
            float edge_tension = (1.0 - abs(valC)) * (1.0 - abs(valM)) * (1.0 - abs(valY));
            float sparkle_density = smoothstep(0.6, 1.0, edge_tension) * 0.3;
            float sparkle = stochastic_sparkle(p, sparkle_density, t_fast);
            
            vec3 sparkle_col = mix(vec3(1.0), neon_c, maskC);
            sparkle_col = mix(sparkle_col, neon_m, maskM);
            col += sparkle * sparkle_col * 1.5;
            
            float grain = (hash12(uv * u_resolution + t_fast) - 0.5) * 0.12;
            col += grain;
            
            col = max(col, 0.0);
            col = pow(col, vec3(1.1)); 
            
            float vignette = 1.0 - smoothstep(0.4, 2.0, length(p));
            col *= vignette;
            
            fragColor = vec4(col, 1.0);
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
  if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(grid.width, grid.height);
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);