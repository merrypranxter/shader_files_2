if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");
    
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, grid.width / grid.height, 0.1, 1000);
    camera.position.z = 1;
    
    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;
    
    const fragmentShader = `
      in vec2 vUv;
      out vec4 fragColor;
      
      uniform float u_time;
      uniform vec2 u_resolution;
      
      float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      
      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      
      float fbm(vec2 p) {
          float f = 0.0;
          float amp = 0.5;
          for(int i = 0; i < 4; i++) {
              f += amp * noise(p);
              p *= 2.0;
              amp *= 0.5;
          }
          return f;
      }
      
      float sdTriangle( in vec2 p, in vec2 p0, in vec2 p1, in vec2 p2 ) {
          vec2 e0 = p1-p0, e1 = p2-p1, e2 = p0-p2;
          vec2 v0 = p -p0, v1 = p -p1, v2 = p -p2;
          vec2 pq0 = v0 - e0*clamp( dot(v0,e0)/dot(e0,e0), 0.0, 1.0 );
          vec2 pq1 = v1 - e1*clamp( dot(v1,e1)/dot(e1,e1), 0.0, 1.0 );
          vec2 pq2 = v2 - e2*clamp( dot(v2,e2)/dot(e2,e2), 0.0, 1.0 );
          float s = sign( e0.x*e2.y - e0.y*e2.x );
          vec2 d = min(min(vec2(dot(pq0,pq0), s*(v0.x*e0.y-v0.y*e0.x)),
                           vec2(dot(pq1,pq1), s*(v1.x*e1.y-v1.y*e1.x))),
                           vec2(dot(pq2,pq2), s*(v2.x*e2.y-v2.y*e2.x)));
          return -sqrt(d.x)*sign(d.y);
      }
      
      vec4 getDensities(vec2 p, float t) {
          float scale = 1.2;
          vec2 p1 = vec2(0.0, 0.5) * scale;
          vec2 p2 = vec2(-0.433, -0.25) * scale;
          vec2 p3 = vec2(0.433, -0.25) * scale;
          
          float rotT = t * 0.15;
          float c_t = cos(rotT), s_t = sin(rotT);
          mat2 rot = mat2(c_t, -s_t, s_t, c_t);
          vec2 rp = rot * p;
          
          float dTri = sdTriangle(rp, p1, p2, p3);
          float c1 = length(rp - p1);
          float c2 = length(rp - p2);
          float c3 = length(rp - p3);
          
          // Kanizsa Pac-Man cutouts
          float pac = smoothstep(0.25, 0.24, c1) * smoothstep(-0.02, 0.0, dTri);
          pac = max(pac, smoothstep(0.25, 0.24, c2) * smoothstep(-0.02, 0.0, dTri));
          pac = max(pac, smoothstep(0.25, 0.24, c3) * smoothstep(-0.02, 0.0, dTri));
          
          // Pulfrich/Chromadepth rings (lateral offsets mapped to depth)
          float depthR = sin(t * 1.5);
          float depthB = cos(t * 1.2);
          
          vec2 offR = vec2(depthR * 0.15, 0.0);
          vec2 offB = vec2(depthB * 0.15, 0.0);
          
          float rR = length(p - vec2(0.3*cos(t), 0.3*sin(t)) - offR);
          float rB = length(p - vec2(-0.3*cos(t*0.8), -0.3*sin(t*0.9)) - offB);
          
          float ringsR = smoothstep(0.5, 0.0, rR) * (0.5 + 0.5 * sin(rR * 40.0 - t * 5.0));
          float ringsB = smoothstep(0.5, 0.0, rB) * (0.5 + 0.5 * sin(rB * 40.0 + t * 4.0));
          
          // Structural color thickness / Thin-film interference
          float thick = fbm(p * 4.0 + t * 0.3);
          thick += rR * 0.5 + rB * 0.5;
          
          float phase = thick * 12.0 - t * 2.0;
          float iridPink = 0.5 + 0.5 * sin(phase);
          float iridTeal = 0.5 + 0.5 * sin(phase + 2.094);
          float iridYellow = 0.5 + 0.5 * sin(phase + 4.188);
          
          // Simultaneous Contrast Moiré (inside implied triangle)
          float inTri = smoothstep(0.02, -0.02, dTri);
          float stripes = 0.5 + 0.5 * sin(rp.x * 250.0 + rp.y * 120.0 + t * 20.0);
          float moire = inTri * stripes;
          
          float bg = fbm(p * 8.0 - t * 0.1);
          
          // Map features to ink densities
          float pink = pac + ringsR * iridPink + moire * 0.9;
          float teal = (1.0 - pac) * bg * 0.5 + ringsB * iridTeal + inTri * (1.0 - stripes) * 0.9;
          float yellow = ringsR * iridYellow + thick * 0.6 * (1.0 - inTri) + pac * 0.5;
          float navy = ringsB * iridPink * 0.5 + smoothstep(0.02, 0.0, abs(dTri)) * 0.9 + (1.0 - thick) * 0.4 * (1.0 - inTri);
          
          // Vignette
          float mask = smoothstep(1.8, 0.5, length(p));
          
          return clamp(vec4(pink, teal, yellow, navy) * mask, 0.0, 1.0);
      }
      
      vec2 chaos_misreg(float t, float seed) {
          float mag_x = 0.02 + 0.015 * sin(t * 1.3 + seed);
          float mag_y = 0.02 + 0.015 * cos(t * 1.7 + seed * 2.0);
          return vec2(
              mag_x * sin(t * 2.1 + seed * 3.0),
              mag_y * cos(t * 1.9 + seed * 4.0)
          );
      }
      
      float halftone(vec2 uv, float density, float lpi, float angle, float dot_gain) {
          if (density <= 0.01) return 0.0;
          if (density >= 0.99) return 1.0;
          
          float c = cos(angle), s = sin(angle);
          vec2 rot = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
          
          float pattern = (cos(rot.x * lpi * 6.28318) + cos(rot.y * lpi * 6.28318)) * 0.25 + 0.5;
          float threshold = 1.0 - clamp(density * dot_gain, 0.0, 1.0);
          
          return smoothstep(threshold + 0.05, threshold - 0.05, pattern);
      }
      
      void main() {
          vec2 uv = vUv;
          vec2 p = (uv - 0.5) * 2.0;
          p.x *= u_resolution.x / u_resolution.y;
          
          float t = u_time * 0.8;
          float lpi = 90.0; // Dense riso halftone
          
          // Drift offset for each ink
          vec2 off1 = chaos_misreg(t, 1.0);
          vec2 off2 = chaos_misreg(t, 2.0);
          vec2 off3 = chaos_misreg(t, 3.0);
          vec2 off4 = chaos_misreg(t, 4.0);
          
          float d1 = getDensities(p + off1, t).x;
          float d2 = getDensities(p + off2, t).y;
          float d3 = getDensities(p + off3, t).z;
          float d4 = getDensities(p + off4, t).w;
          
          // Aspect-corrected UV for circular halftone dots
          vec2 aspect_uv = vec2(uv.x * u_resolution.x / u_resolution.y, uv.y);
          float local_gain = 1.05 + 0.1 * noise(uv * 10.0 + t);
          
          float h1 = halftone(aspect_uv, d1, lpi, radians(15.0), local_gain);
          float h2 = halftone(aspect_uv, d2, lpi, radians(45.0), local_gain);
          float h3 = halftone(aspect_uv, d3, lpi, radians(75.0), local_gain);
          float h4 = halftone(aspect_uv, d4, lpi, radians(105.0), local_gain);
          
          // Mechanical dropout
          vec2 fragCoord = uv * u_resolution;
          float drop1 = step(0.03, hash(floor(fragCoord * 0.5) + 1.0));
          float drop2 = step(0.03, hash(floor(fragCoord * 0.5) + 2.0));
          float drop3 = step(0.03, hash(floor(fragCoord * 0.5) + 3.0));
          float drop4 = step(0.03, hash(floor(fragCoord * 0.5) + 4.0));
          
          h1 *= drop1;
          h2 *= drop2;
          h3 *= drop3;
          h4 *= drop4;
          
          // RISO Spot Colors
          vec3 inkPink = vec3(1.0, 0.42, 0.71);    // Fluo Pink #FF6BB5
          vec3 inkTeal = vec3(0.0, 0.514, 0.541);  // Teal #00838A
          vec3 inkYellow = vec3(1.0, 0.91, 0.0);   // Yellow #FFE800
          vec3 inkNavy = vec3(0.004, 0.129, 0.412);// Navy #012169
          vec3 paper = vec3(0.961, 0.941, 0.910);  // Cream #F5F0E8
          
          float trans = 0.85; // Translucency multiply factor
          
          // Subtractive multiply blending over paper
          vec3 c1 = mix(vec3(1.0), inkPink, h1 * trans);
          vec3 c2 = mix(vec3(1.0), inkTeal, h2 * trans);
          vec3 c3 = mix(vec3(1.0), inkYellow, h3 * trans);
          vec3 c4 = mix(vec3(1.0), inkNavy, h4 * trans);
          
          vec3 finalColor = paper * c1 * c2 * c3 * c4;
          
          // Paper grain
          float grain = noise(fragCoord * 2.0);
          finalColor *= (0.96 + 0.04 * grain);
          
          fragColor = vec4(finalColor, 1.0);
      }
    `;
    
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader,
      fragmentShader,
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
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);