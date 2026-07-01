try {
  if (!ctx) throw new Error("WebGL 2 context not available");
  
  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, grid.width/grid.height, 0.1, 1000);
    camera.position.z = 5;
    
    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    
    const fragmentShader = `
      in vec2 vUv;
      out vec4 fragColor;
      
      uniform vec2 u_resolution;
      uniform float u_time;
      
      const int bayer[16] = int[](
          0, 8, 2, 10,
          12, 4, 14, 6,
          3, 11, 1, 9,
          15, 7, 13, 5
      );

      float hash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float noise(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                         mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                         mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }

      float fbm(vec3 p) {
          float f = 0.0;
          float amp = 0.5;
          for(int i=0; i<4; i++) {
              f += amp * noise(p);
              p *= 2.0;
              amp *= 0.5;
          }
          return f;
      }

      vec2 fold(vec2 p, float n) {
          float r = length(p);
          float a = atan(p.y, p.x);
          float sector = 6.2831853 / n;
          a = mod(a, sector);
          if(a > sector/2.0) a = sector - a;
          return r * vec2(cos(a), sin(a));
      }

      float leniaDensity(vec3 p, float t) {
          p.xy = fold(p.xy, 6.0);
          float angle = p.z * 0.4 + t * 0.3;
          float s = sin(angle), c = cos(angle);
          p.xy = mat2(c, -s, s, c) * p.xy;
          
          float n1 = fbm(p * 1.5 + t * 0.5);
          float n2 = fbm(p * 3.0 - t * 0.2);
          float g = dot(sin(p * 2.0), cos(p.zxy * 2.0));
          float speckle = noise(p * 20.0) * 0.15;
          
          float val = g * 0.4 + n1 * 0.6 - n2 * 0.3 + speckle;
          return smoothstep(0.1, 0.5, val); 
      }

      vec3 spectralToRGB(float lambda) {
          float r = 0.0, g = 0.0, b = 0.0;
          if(lambda >= 380.0 && lambda < 440.0) { r = -(lambda - 440.0) / 60.0; b = 1.0; }
          else if(lambda >= 440.0 && lambda < 490.0) { g = (lambda - 440.0) / 50.0; b = 1.0; }
          else if(lambda >= 490.0 && lambda < 510.0) { g = 1.0; b = -(lambda - 510.0) / 20.0; }
          else if(lambda >= 510.0 && lambda < 580.0) { r = (lambda - 510.0) / 70.0; g = 1.0; }
          else if(lambda >= 580.0 && lambda < 645.0) { r = 1.0; g = -(lambda - 645.0) / 65.0; }
          else if(lambda >= 645.0 && lambda <= 700.0) { r = 1.0; }
          
          float f = 1.0;
          if(lambda < 420.0) f = 0.3 + 0.7 * (lambda - 380.0) / 40.0;
          else if(lambda > 645.0) f = 0.3 + 0.7 * (700.0 - lambda) / 55.0;
          
          return pow(vec3(r, g, b) * f, vec3(0.8));
      }

      vec3 thinFilm(float cosTheta, float thickness) {
          vec3 col = vec3(0.0);
          for(float l = 400.0; l <= 700.0; l += 60.0) {
              float phase = 2.0 * 1.5 * thickness * cosTheta * 6.28318 / l;
              col += spectralToRGB(l) * (0.5 + 0.5 * cos(phase));
          }
          return col / 6.0;
      }

      vec4 marchVolume(vec3 ro, vec3 rd, float t) {
          float tDist = 0.0;
          vec4 sum = vec4(0.0);
          
          for(int i=0; i<40; i++) {
              vec3 p = ro + rd * tDist;
              float dens = leniaDensity(p, t);
              
              if(dens > 0.02) {
                  vec2 e = vec2(0.02, 0.0);
                  vec3 n = normalize(vec3(
                      leniaDensity(p + e.xyy, t) - leniaDensity(p - e.xyy, t),
                      leniaDensity(p + e.yxy, t) - leniaDensity(p - e.yxy, t),
                      leniaDensity(p + e.yyx, t) - leniaDensity(p - e.yyx, t)
                  ));
                  
                  float cosT = max(dot(n, -rd), 0.0);
                  float thickness = 200.0 + 500.0 * fbm(p * 3.0 + t);
                  vec3 color = thinFilm(cosT, thickness);
                  
                  color = mix(color, vec3(1.0, 0.0, 0.5), fbm(p * 2.0) * 0.6);
                  color = mix(color, vec3(0.0, 1.0, 0.8), fbm(p * 4.0 + 10.0) * 0.6);
                  color = mix(color, vec3(1.0, 0.8, 0.0), fbm(p * 1.5 + 5.0) * 0.4);
                  
                  float alpha = dens * 0.5;
                  color *= alpha;
                  
                  sum.rgb += color * (1.0 - sum.a);
                  sum.a += alpha * (1.0 - sum.a);
                  
                  if(sum.a > 0.95) break;
              }
              tDist += 0.08; 
          }
          return sum;
      }

      void main() {
          vec2 uv = vUv;
          vec2 p = (uv - 0.5) * 2.0;
          p.x *= u_resolution.x / u_resolution.y;

          vec3 ro = vec3(0.0, 0.0, 2.8);
          
          float shiftAmount = length(p) * 0.015;
          vec2 dir = normalize(p);
          
          vec3 rdR = normalize(vec3(p - dir * shiftAmount, -1.0));
          vec3 rdG = normalize(vec3(p, -1.0));
          vec3 rdB = normalize(vec3(p + dir * shiftAmount, -1.0));
          
          float t_now = u_time * 0.8;
          float t_future = t_now + 0.35; 
          
          vec4 volNowR = marchVolume(ro, rdR, t_now);
          vec4 volNowG = marchVolume(ro, rdG, t_now);
          vec4 volNowB = marchVolume(ro, rdB, t_now);
          
          vec4 volFut = marchVolume(ro, rdG, t_future);
          
          vec2 hg = fract(p * 12.0 + u_time * 0.1);
          float lines = step(0.92, hg.x) + step(0.92, hg.y);
          vec3 bg = mix(vec3(0.01, 0.01, 0.03), vec3(0.05, 0.1, 0.2), clamp(lines, 0.0, 1.0));
          
          float dots = step(0.92, hg.x) * step(0.92, hg.y);
          bg = mix(bg, vec3(0.0, 1.0, 1.0), dots * (0.5 + 0.5 * sin(u_time * 8.0 + length(p)*15.0)));
          
          vec3 finalColor = bg;
          
          vec3 ghostColor = vec3(0.6, 0.0, 1.0) * volFut.a * 2.0; 
          finalColor = mix(finalColor, ghostColor, volFut.a * 0.4);
          
          vec3 presentColor = vec3(volNowR.r, volNowG.g, volNowB.b);
          float presentAlpha = (volNowR.a + volNowG.a + volNowB.a) / 3.0;
          
          finalColor = mix(finalColor, presentColor, presentAlpha);
          
          float coma = smoothstep(0.4, 1.5, length(p));
          finalColor += vec3(1.0, 0.0, 0.5) * coma * presentAlpha * 0.5;
          
          float lum = dot(finalColor, vec3(0.299, 0.587, 0.114));
          finalColor = mix(vec3(lum), finalColor, 1.6); 
          
          int bx = int(gl_FragCoord.x) % 4;
          int by = int(gl_FragCoord.y) % 4;
          float bayerVal = float(bayer[by * 4 + bx]) / 15.0;
          finalColor += (bayerVal - 0.5) * 0.12;
          
          fragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
      }
    `;
    
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader,
      fragmentShader
    });
    
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    
    canvas.__three = { renderer, scene, camera, material };
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
  
} catch (e) {
  console.error("WebGL Initialization Failed:", e);
  throw e;
}