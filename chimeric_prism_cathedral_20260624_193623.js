try {
  if (!ctx) throw new Error("WebGL 2 context not available");

  // Cleanup previous instance if it exists to support hot-reloading
  if (canvas.__three) {
    if (canvas.__three.handlers) {
      window.removeEventListener('keydown', canvas.__three.handlers.keydown);
    }
    canvas.__three.renderer.dispose();
  }

  const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Ping-pong render targets for state/accumulation (Impossible Colors & Plasma Trails)
  const rtOptions = {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat
  };
  const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
  const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

  const vertexShader = `
    out vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `;

  // State Shader: Handles mouse interactions, fatigue accumulation, and plasma trails
  const stateMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      u_prev: { value: null },
      u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
      u_click: { value: 0 },
      u_aspect: { value: grid.width / grid.height }
    },
    vertexShader,
    fragmentShader: `
      precision highp float;
      in vec2 vUv;
      out vec4 fragColor;
      uniform sampler2D u_prev;
      uniform vec2 u_mouse;
      uniform float u_click;
      uniform float u_aspect;

      void main() {
        vec4 prev = texture(u_prev, vUv);
        prev *= 0.97; // Slower decay for persistent afterimages

        vec2 p = (vUv - 0.5) * vec2(u_aspect, 1.0);
        vec2 m = (u_mouse - 0.5) * vec2(u_aspect, 1.0);
        float d = length(p - m);

        // Seed burst for impossible color fatigue
        if (u_click > 0.5) {
          prev.r += exp(-d * 60.0) * 0.8;
        }
        // Continuous plasma trail
        prev.g += exp(-d * 200.0) * 0.15;

        fragColor = clamp(prev, 0.0, 1.0);
      }
    `
  });

  // Main Shader: The Chimeric Prism Cathedral
  const mainMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      u_time: { value: 0 },
      u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
      u_aspect: { value: grid.width / grid.height },
      u_state: { value: null },
      u_palette: { value: 0 },
      u_glass: { value: 1.0 },
      u_alchemy: { value: 1.0 },
      u_depth: { value: 1.0 },
      u_biref: { value: 1.0 }
    },
    vertexShader,
    fragmentShader: `
      precision highp float;
      in vec2 vUv;
      out vec4 fragColor;
      
      uniform float u_time;
      uniform vec2 u_mouse;
      uniform float u_aspect;
      uniform sampler2D u_state;
      
      uniform int u_palette;
      uniform float u_glass;
      uniform float u_alchemy;
      uniform float u_depth;
      uniform float u_biref;

      #define PI 3.14159265359

      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }

      vec3 rgb2hsv(vec3 c) {
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        float d = q.x - min(q.w, q.y);
        float e = 1.0e-10;
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
      }

      vec2 hash2(vec2 p) {
        p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
        return fract(sin(p)*43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(dot(hash2(i)-0.5, f), dot(hash2(i+vec2(1,0))-0.5, f-vec2(1,0)), u.x),
                   mix(dot(hash2(i+vec2(0,1))-0.5, f-vec2(0,1)), dot(hash2(i+vec2(1,1))-0.5, f-vec2(1,1)), u.x), u.y);
      }

      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for(int i=0; i<5; i++) { v+=a*noise(p); p=mat2(0.8,-0.6,0.6,0.8)*p*2.0; a*=0.5; }
        return v;
    }

      // SDFs for Alchemical Geometry
      float sdHexagram(vec2 p, float r) {
        const vec4 k = vec4(-0.5, 0.8660254038, 0.5773502692, 1.7320508076);
        p = abs(p);
        p -= 2.0*min(dot(k.xy,p),0.0)*k.xy;
        p -= 2.0*min(dot(k.yx,p),0.0)*k.yx;
        p -= vec2(clamp(p.x,r*k.z,r*k.w),r);
        return length(p)*sign(p.y);
      }

      float sdCircle(vec2 p, float r) { return length(p) - r; }

      float sdEquilateralTriangle(vec2 p, float r) {
        const float k = sqrt(3.0);
        p.x = abs(p.x) - r;
        p.y = p.y + r/k;
        if( p.x+k*p.y>0.0 ) p = vec2(p.x-k*p.y,-k*p.x-p.y)/2.0;
        p.x -= clamp( p.x, -2.0*r, 0.0 );
        return -length(p)*sign(p.y);
      }

      // Michel-Levy Interference Colors
      vec3 michel_levy(float gamma) {
        float r = pow(sin(PI * gamma / 650.0), 2.0);
        float g = pow(sin(PI * gamma / 530.0), 2.0);
        float b = pow(sin(PI * gamma / 440.0), 2.0);
        return vec3(r, g, b);
      }

      // Diffraction Grating Spectral Ribbon
      vec3 spectral(float t) {
        float r = smoothstep(0.5, 0.0, t) + smoothstep(0.8, 1.0, t);
        float g = smoothstep(0.0, 0.5, t) * smoothstep(1.0, 0.5, t);
        float b = smoothstep(0.5, 1.0, t);
        return clamp(vec3(r, g, b), 0.0, 1.0);
      }

      // Rich Saturated Palettes
      vec3 getPalette(float t, int pal) {
        t = fract(t);
        if (pal == 0) return hsv2rgb(vec3(t, 0.9, 0.9)); // Candy Prism
        if (pal == 1) return hsv2rgb(vec3(t*0.5 + 0.4, 1.0, 0.8)); // Mineral Slide
        if (pal == 2) return hsv2rgb(vec3(t*0.3 + 0.8, 1.0, 1.0)); // Neon Alchemy
        if (pal == 3) return hsv2rgb(vec3(t*0.3 + 0.5, 1.0, 0.9)); // UV Aquarium
        if (pal == 4) return hsv2rgb(vec3(t*0.4 + 0.1, 0.9, 0.9)); // Plasma Fruit
        return vec3(1.0);
      }

      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        p.x *= u_aspect;
        
        // Interactive bend
        vec2 m = (u_mouse - 0.5) * vec2(u_aspect, 1.0);
        p += (p - m) * exp(-length(p - m) * 10.0) * 0.1;

        // Cathedral Mandala Fold
        float a = atan(p.y, p.x);
        float r_len = length(p);
        float sym = 6.0;
        float a_fold = mod(a, 2.0*PI/sym) - PI/sym;
        vec2 p_fold = r_len * vec2(cos(a_fold), sin(a_fold));

        // Hidden Alchemical Geometry
        float d_hex = sdHexagram(p_fold, 0.5);
        float d_circ = abs(sdCircle(p, 0.7)) - 0.05;
        float d_tri = sdEquilateralTriangle(p_fold - vec2(0.0, 0.35), 0.12);
        float d_geom = min(min(d_hex, d_circ), d_tri);

        // Glass Patterns (Hidden Correlation)
        float twist = (u_glass > 0.5) ? smoothstep(0.1, -0.1, d_geom) * 0.4 : 0.0;
        mat2 rot = mat2(cos(twist), -sin(twist), sin(twist), cos(twist));
        vec2 p_voronoi = rot * p * 15.0;

        // Voronoi Cellular Structure
        vec2 n = floor(p_voronoi);
        vec2 f = fract(p_voronoi);
        float m_dist = 8.0;
        float cell_hash = 0.0;
        for(int j=-1; j<=1; j++)
        for(int i=-1; i<=1; i++) {
            vec2 g = vec2(float(i),float(j));
            vec2 o = hash2(n + g);
            vec2 r = g + o - f;
            float d = dot(r,r);
            if(d < m_dist) { m_dist = d; cell_hash = o.x; }
        }

        // Birefringence / Cell Coloring
        vec3 cell_col;
        if (u_biref > 0.5) {
            float gamma = cell_hash * 4000.0 + u_time * 300.0;
            cell_col = michel_levy(gamma);
            cell_col = mix(cell_col, getPalette(cell_hash, u_palette), 0.4);
        } else {
            cell_col = getPalette(cell_hash + u_time * 0.05, u_palette);
        }

        // Base composition (Rich deep background)
        vec3 bg = getPalette(u_time*0.03 + r_len*0.3, u_palette);
        bg = hsv2rgb(vec3(rgb2hsv(bg).x, 1.0, 0.3)); // Dark jewel-tone
        vec3 col = mix(bg, cell_col, 0.85);

        // Simultaneous Contrast Cell Borders
        float edge = smoothstep(0.04, 0.0, sqrt(m_dist));
        vec3 border_col = getPalette(fract(cell_hash * 17.0), u_palette);
        col = mix(col, border_col, edge);

        // Vibrating Aura
        float aura = sin(d_geom * 60.0 - u_time * 8.0);
        vec3 aura_col = getPalette(fract(d_geom * 3.0), u_palette);
        col = mix(col, aura_col, smoothstep(0.08, 0.0, d_geom) * (aura * 0.5 + 0.5));

        // ChromaDepth & Chromostereopsis Edges
        if (u_depth > 0.5) {
            float edge_red = smoothstep(0.02, 0.0, d_geom);
            float edge_blue = smoothstep(0.02, 0.0, d_geom - 0.02);
            col = mix(col, vec3(1.0, 0.0, 0.2), edge_red * 0.7);
            col = mix(col, vec3(0.0, 0.2, 1.0), edge_blue * 0.7);
            
            float z = 1.0 - r_len + d_geom;
            vec3 cd_col = hsv2rgb(vec3((1.0 - clamp(z, 0.0, 1.0)) * 0.75, 1.0, 0.85));
            col = mix(col, cd_col, 0.35);
        }

        // Alchemical Symbol Nodes
        if (u_alchemy > 0.5) {
            float sym_glow = exp(-d_tri * 35.0);
            col += getPalette(u_time*0.15, u_palette) * sym_glow * 0.9;
            col = mix(col, vec3(1.0, 0.9, 0.1), smoothstep(0.015, 0.0, d_tri));
        }

        // Prism Beams & Diffraction Fans
        for(float i=0.0; i<3.0; i++) {
            float ba = u_time * 0.12 * (i+1.0);
            vec2 pb = mat2(cos(ba), -sin(ba), sin(ba), cos(ba)) * p;
            float bd = abs(pb.x + sin(pb.y*4.0)*0.1) - 0.03;
            float diff = sin(pb.y * 120.0 - u_time * 12.0) * 0.5 + 0.5;
            vec3 bc = spectral(fract(pb.y * 2.5 + u_time*0.6 + i*0.4));
            col += bc * exp(-bd * 90.0) * diff * 0.95;
        }

        // Plasma Filaments
        float pl_fbm = fbm(p * 2.5 + u_time);
        float pl_d = abs(p_fold.x - pl_fbm * 0.7);
        col += getPalette(fract(u_time*0.25), u_palette) * (0.015 / (pl_d + 0.001));

        // State Feedback (Impossible Colors & Plasma Trails)
        vec4 state = texture(u_state, vUv);
        if (state.r > 0.0) {
            // Perceptual Complement (Hue shift 180 deg)
            vec3 hsv = rgb2hsv(col);
            hsv.x = fract(hsv.x + 0.5); 
            hsv.y = 1.0; 
            vec3 comp = hsv2rgb(hsv);
            col = mix(col, comp, state.r);
        }
        col += getPalette(fract(u_time*0.6), u_palette) * state.g * 2.5;

        // Enforce Strict Color Rules (No dominant black/white, high saturation)
        vec3 hsv_final = rgb2hsv(col);
        hsv_final.y = clamp(hsv_final.y, 0.65, 1.0); // Rich saturation
        hsv_final.z = clamp(hsv_final.z, 0.15, 0.95); // Avoid pure black/white
        col = hsv2rgb(hsv_final);

        fragColor = vec4(col, 1.0);
      }
    `
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  scene.add(quad);

  // Interaction handlers
  const handlers = {
    keydown: (e) => {
      if (!canvas.__three) return;
      const t = canvas.__three;
      const key = e.key.toLowerCase();
      if (key === 'c') t.mainMat.uniforms.u_palette.value = (t.mainMat.uniforms.u_palette.value + 1) % 5;
      if (key === 'g') t.mainMat.uniforms.u_glass.value = 1.0 - t.mainMat.uniforms.u_glass.value;
      if (key === 'a') t.mainMat.uniforms.u_alchemy.value = 1.0 - t.mainMat.uniforms.u_alchemy.value;
      if (key === 'd') t.mainMat.uniforms.u_depth.value = 1.0 - t.mainMat.uniforms.u_depth.value;
      if (key === 'b') t.mainMat.uniforms.u_biref.value = 1.0 - t.mainMat.uniforms.u_biref.value;
    }
  };
  window.addEventListener('keydown', handlers.keydown);

  canvas.__three = { renderer, scene, camera, quad, stateMat, mainMat, rtA, rtB, tick: 0, handlers };
} catch (e) {
  console.error("WebGL Initialization Failed:", e);
  return;
}

const t = canvas.__three;
if (!t) return;

// Resize handling
t.renderer.setSize(grid.width, grid.height, false);
if (t.rtA.width !== grid.width || t.rtA.height !== grid.height) {
  t.rtA.setSize(grid.width, grid.height);
  t.rtB.setSize(grid.width, grid.height);
  t.stateMat.uniforms.u_aspect.value = grid.width / grid.height;
  t.mainMat.uniforms.u_aspect.value = grid.width / grid.height;
}

// Update Inputs
const mx = mouse.x / grid.width;
const my = 1.0 - mouse.y / grid.height;

t.stateMat.uniforms.u_mouse.value.set(mx, my);
t.stateMat.uniforms.u_click.value = mouse.isPressed ? 1.0 : Math.max(0.0, t.stateMat.uniforms.u_click.value - 0.05);
t.mainMat.uniforms.u_time.value = time;
t.mainMat.uniforms.u_mouse.value.set(mx, my);

// Pass 1: Render State (Ping-Pong)
const readRT = t.tick % 2 === 0 ? t.rtA : t.rtB;
const writeRT = t.tick % 2 === 0 ? t.rtB : t.rtA;

t.stateMat.uniforms.u_prev.value = readRT.texture;
t.quad.material = t.stateMat;
t.renderer.setRenderTarget(writeRT);
t.renderer.render(t.scene, t.camera);

// Pass 2: Render Main Composite to Screen
t.mainMat.uniforms.u_state.value = writeRT.texture;
t.quad.material = t.mainMat;
t.renderer.setRenderTarget(null);
t.renderer.render(t.scene, t.camera);

t.tick++;