export default function(ctx, grid, time, repos, input, mouse, canvas, THREE) {
  if (!canvas.__three) {
    try {
      if (!ctx) throw new Error("WebGL 2 context not available");
      
      const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
      const scene = new THREE.Scene();
      
      // Use OrthographicCamera to ensure the plane perfectly fills the view regardless of aspect
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
          in vec2 vUv;
          out vec4 fragColor;
          
          uniform float u_time;
          uniform vec2 u_resolution;

          // SDF Primitives
          float sdCircle( vec2 p, float r ) { return length(p) - r; }

          float sdEquilateralTriangle( in vec2 p, in float r ) {
              const float k = 1.7320508;
              p.x = abs(p.x) - r;
              p.y = p.y + r/k;
              if( p.x + k*p.y > 0.0 ) p = vec2(p.x-k*p.y,-k*p.x-p.y)/2.0;
              p.x -= clamp( p.x, -2.0*r, 0.0 );
              return -length(p)*sign(p.y);
          }

          // Glass Panes
          float pane1(vec2 p, float t) {
              float a = t * 0.3;
              mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
              return sdEquilateralTriangle(rot * p, 0.45);
          }

          float pane2(vec2 p, float t) {
              vec2 offset = vec2(sin(t*0.5)*0.25, cos(t*0.4)*0.25);
              return sdCircle(p - offset, 0.35);
          }

          float pane3(vec2 p, float t) {
              float a = -t * 0.2;
              mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
              vec2 d = abs(rot * p) - vec2(0.35);
              return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
          }

          // Compute normals for refraction
          vec2 getNormal(vec2 p, float t, int id) {
              vec2 eps = vec2(0.005, 0.0);
              float dX, dY;
              if (id == 1) {
                  dX = pane1(p + eps.xy, t) - pane1(p - eps.xy, t);
                  dY = pane1(p + eps.yx, t) - pane1(p - eps.yx, t);
              } else if (id == 2) {
                  dX = pane2(p + eps.xy, t) - pane2(p - eps.xy, t);
                  dY = pane2(p + eps.yx, t) - pane2(p - eps.yx, t);
              } else {
                  dX = pane3(p + eps.xy, t) - pane3(p - eps.xy, t);
                  dY = pane3(p + eps.yx, t) - pane3(p - eps.yx, t);
              }
              return normalize(vec2(dX, dY) + 0.00001);
          }

          // Drifting collage fragments
          float collageFragments(vec2 uv, float t) {
              float f = 0.0;
              for(int i=0; i<4; i++) {
                  float fi = float(i);
                  vec2 p = uv;
                  p.x += sin(t * 0.2 + fi * 1.3) * 0.6;
                  p.y += cos(t * 0.25 + fi * 2.1) * 0.6;
                  
                  float a = t * 0.4 + fi;
                  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
                  p = rot * p;
                  
                  vec2 d = abs(p) - vec2(0.1 + fi*0.05, 0.15 - fi*0.02);
                  float rect = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
                  f += smoothstep(0.01, 0.0, rect) * 0.5;
              }
              return clamp(f, 0.0, 1.0);
          }

          // Background Heat-Haze and Palette
          vec3 getBackground(vec2 uv, float t) {
              // Schlieren flow domain warp
              vec2 flow = vec2(
                  sin(uv.y * 3.0 + t * 0.5) * 0.1 + cos(uv.x * 2.0 - t * 0.3) * 0.1,
                  cos(uv.x * 2.5 + t * 0.4) * 0.1 + sin(uv.y * 4.0 - t * 0.6) * 0.1
              );
              uv += flow;
              
              // Psychedelic Saturated Palette
              vec3 col1 = vec3(0.0, 0.8, 1.0); // Cyan
              vec3 col2 = vec3(0.8, 0.0, 1.0); // Magenta/Violet
              vec3 col3 = vec3(0.6, 1.0, 0.0); // Acid Green
              vec3 col4 = vec3(1.0, 0.3, 0.0); // Warm Orange
              vec3 col5 = vec3(0.1, 0.2, 1.0); // Electric Blue
              
              float mix1 = sin(uv.x * 2.0 + uv.y * 1.5 + t * 0.7) * 0.5 + 0.5;
              float mix2 = cos(uv.x * -1.5 + uv.y * 2.5 - t * 0.9) * 0.5 + 0.5;
              float mix3 = sin(uv.x * 3.0 - uv.y * 2.0 + t * 0.5) * 0.5 + 0.5;
              
              vec3 bg = mix(mix(col1, col2, mix1), mix(col3, col4, mix2), mix3);
              
              float spots = sin(uv.x * 5.0) * cos(uv.y * 5.0);
              bg = mix(bg, col5, smoothstep(0.5, 1.0, spots) * 0.6);
              
              // Integrate drifting fragments
              float frags = collageFragments(uv, t);
              bg = mix(bg, vec3(0.3, 0.0, 0.6), frags); // Dark violet fragments
              
              // White Sparkles
              float spark = fract(sin(dot(uv + t*0.1, vec2(12.9898, 78.233))) * 43758.5453);
              bg += pow(spark, 80.0) * 1.5 * vec3(1.0, 1.0, 1.0);
              
              return bg;
          }

          // Geomantic Sigil
          float sigilLines(vec2 uv, float t) {
              float d = 1.0;
              float eye = abs(length(uv) - 0.08) - 0.003;
              d = min(d, eye);
              float pupil = abs(length(uv) - 0.02) - 0.005;
              d = min(d, pupil);
              
              for(int i=0; i<6; i++) {
                  float a = float(i) * 1.047197 + t * 0.25; 
                  vec2 dir = vec2(cos(a), sin(a));
                  vec2 p = uv - dir * 0.25;
                  
                  float diamond = abs(p.x) + abs(p.y) - 0.015;
                  d = min(d, diamond);
                  
                  float proj = clamp(dot(uv, dir), 0.08, 0.235);
                  vec2 lineP = dir * proj;
                  float lineD = length(uv - lineP) - 0.002;
                  d = min(d, lineD);
              }
              
              float ring = abs(length(uv) - 0.35) - 0.002;
              d = min(d, ring);
              
              return smoothstep(0.006, 0.0, d);
          }

          // Core Renderer
          vec3 renderScene(vec2 uv, float t) {
              vec3 col = getBackground(uv, t);
              
              float d1 = pane1(uv, t);
              float d2 = pane2(uv, t);
              float d3 = pane3(uv, t);
              
              // Back Pane - Violet
              if (d3 < 0.0) {
                  vec2 n = getNormal(uv, t, 3);
                  vec3 n3 = normalize(vec3(n, -d3 * 8.0));
                  vec2 uv_refract = uv + n * 0.08;
                  vec3 refrCol = getBackground(uv_refract, t);
                  float spec = pow(max(dot(reflect(normalize(vec3(-1.0,-1.0,-1.0)), n3), vec3(0,0,1)), 0.0), 32.0);
                  
                  float edge = smoothstep(-0.03, 0.0, d3);
                  vec3 tint = vec3(0.7, 0.4, 1.0);
                  vec3 paneCol = refrCol * tint;
                  paneCol = mix(paneCol, paneCol * 0.5, edge);
                  
                  col = paneCol + spec * 0.8 + smoothstep(-0.01, 0.0, d3) * tint * 0.8;
              }
              
              // Middle Pane - Cyan
              if (d2 < 0.0) {
                  vec2 n = getNormal(uv, t, 2);
                  vec3 n3 = normalize(vec3(n, -d2 * 8.0));
                  vec2 uv_refract = uv + n * 0.06;
                  vec3 refrCol = getBackground(uv_refract, t);
                  float spec = pow(max(dot(reflect(normalize(vec3(1.0,-1.0,-1.0)), n3), vec3(0,0,1)), 0.0), 32.0);
                  
                  float edge = smoothstep(-0.03, 0.0, d2);
                  vec3 tint = vec3(0.2, 0.9, 1.0);
                  vec3 paneCol = refrCol * tint;
                  paneCol = mix(paneCol, paneCol * 0.5, edge);
                  
                  col = paneCol + spec * 0.8 + smoothstep(-0.01, 0.0, d2) * tint * 0.8;
              }
              
              // Front Pane - Warm Orange
              if (d1 < 0.0) {
                  vec2 n = getNormal(uv, t, 1);
                  vec3 n3 = normalize(vec3(n, -d1 * 8.0));
                  vec2 uv_refract = uv + n * 0.04;
                  vec3 refrCol = getBackground(uv_refract, t);
                  float spec = pow(max(dot(reflect(normalize(vec3(0.0,1.0,-1.0)), n3), vec3(0,0,1)), 0.0), 32.0);
                  
                  float edge = smoothstep(-0.03, 0.0, d1);
                  vec3 tint = vec3(1.0, 0.6, 0.2);
                  vec3 paneCol = refrCol * tint;
                  paneCol = mix(paneCol, paneCol * 0.5, edge);
                  
                  col = paneCol + spec * 0.8 + smoothstep(-0.01, 0.0, d1) * tint * 0.8;
              }
              
              // Center Sigil
              float sigil = sigilLines(uv, t);
              float sigilShadow = sigilLines(uv + vec2(0.01, -0.01), t);
              col = mix(col, vec3(0.0), sigilShadow * 0.5);
              col = mix(col, vec3(1.0, 0.95, 0.8), sigil * 0.9);
              
              return col;
          }

          void main() {
              float aspect = u_resolution.x / u_resolution.y;
              vec2 uv = (vUv - 0.5) * 2.0;
              uv.x *= aspect;
              
              float dist = length(uv);
              vec2 dir = normalize(uv + 0.0001);
              
              // Chromatic aberration offsets based on distance
              vec2 offR = dir * dist * 0.015;
              vec2 offG = dir * dist * 0.0;
              vec2 offB = dir * dist * -0.015;
              
              // Pulfrich Effect / Temporal Offset
              float tR = u_time;
              float tG = u_time - 0.08;
              float tB = u_time - 0.16;
              
              // Render channels
              float r = renderScene(uv + offR, tR).r;
              float g = renderScene(uv + offG, tG).g;
              float b = renderScene(uv + offB, tB).b;
              
              vec3 finalColor = vec3(r, g, b);
              
              // CRT / Damage Pass
              float scan = sin(vUv.y * u_resolution.y * 3.14159) * 0.03;
              finalColor -= scan;
              
              float vig = smoothstep(1.3, 0.3, dist);
              finalColor *= vig;
              
              float noise = fract(sin(dot(vUv + u_time, vec2(12.9898, 78.233))) * 43758.5453) * 0.04;
              finalColor += noise;
              
              // Soft contrast boost
              finalColor = smoothstep(0.0, 1.0, finalColor);
              
              fragColor = vec4(finalColor, 1.0);
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
}