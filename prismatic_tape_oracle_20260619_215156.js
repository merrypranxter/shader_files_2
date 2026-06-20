if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.autoClear = false;

    const fboOpts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      depthBuffer: false
    };

    const w = grid.width;
    const h = grid.height;

    const fboCA = {
      read: new THREE.WebGLRenderTarget(w, h, fboOpts),
      write: new THREE.WebGLRenderTarget(w, h, fboOpts)
    };

    const fboHistory = {
      read: new THREE.WebGLRenderTarget(w, h, fboOpts),
      write: new THREE.WebGLRenderTarget(w, h, fboOpts)
    };

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    const commonVert = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    // 1. CELLULAR AUTOMATA (Dream Intelligence)
    const caMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { u_prev: { value: null }, u_res: { value: new THREE.Vector2(w, h) }, u_time: { value: 0 } },
      vertexShader: commonVert,
      fragmentShader: `
        uniform sampler2D u_prev;
        uniform vec2 u_res;
        uniform float u_time;
        in vec2 vUv;
        out vec4 fragColor;

        void main() {
            vec2 texel = 1.0 / u_res;
            vec4 self = texture(u_prev, vUv);
            vec4 n = texture(u_prev, vUv + vec2(0.0, 1.0) * texel);
            vec4 s = texture(u_prev, vUv + vec2(0.0, -1.0) * texel);
            vec4 e = texture(u_prev, vUv + vec2(1.0, 0.0) * texel);
            vec4 w = texture(u_prev, vUv + vec2(-1.0, 0.0) * texel);
            vec4 lap = n + s + e + w - 4.0 * self;
            
            float da = 1.0; 
            float db = 0.5;
            float feed = 0.0545 + 0.002 * sin(vUv.x * 20.0 + u_time);
            float kill = 0.0620 + 0.002 * cos(vUv.y * 20.0 - u_time);
            
            float a = self.r; 
            float b = self.g;
            float abb = a * b * b;
            
            float nextA = a + (da * lap.r - abb + feed * (1.0 - a));
            float nextB = b + (db * lap.g + abb - (feed + kill) * b);
            
            // Infection / Seeding
            float seed = step(0.9995, fract(sin(dot(vUv, vec2(12.9898, 78.233)) + u_time) * 43758.5453));
            nextB += seed * 0.5;
            
            fragColor = vec4(clamp(nextA, 0.0, 1.0), clamp(nextB, 0.0, 1.0), 0.0, 1.0);
        }
      `
    });

    // 2. SCENE & DATAMOSH (Dream Architecture & Memory)
    const sceneMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { u_prevHistory: { value: null }, u_ca: { value: null }, u_res: { value: new THREE.Vector2(w, h) }, u_time: { value: 0 } },
      vertexShader: commonVert,
      fragmentShader: `
        uniform sampler2D u_prevHistory;
        uniform sampler2D u_ca;
        uniform vec2 u_res;
        uniform float u_time;
        in vec2 vUv;
        out vec4 fragColor;

        float sdBox(vec3 p, vec3 b) {
            vec3 q = abs(p) - b;
            return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
        }

        float map(vec3 p) {
            vec3 q = p;
            q.z = mod(q.z + u_time * 3.0, 12.0) - 6.0;
            
            // Floating Browser Panels
            vec3 bp = q;
            bp.xy = mod(bp.xy + 4.0, 8.0) - 4.0;
            float outer = sdBox(bp, vec3(1.8, 1.2, 0.1));
            float inner = sdBox(bp, vec3(1.6, 1.0, 0.2));
            float window = max(outer, -inner);
            
            // Asemic UI Debris
            vec3 ui = bp;
            ui.x = mod(ui.x + 0.2, 0.4) - 0.2;
            ui.y = mod(ui.y + 0.2, 0.4) - 0.2;
            float glyphs = sdBox(ui, vec3(0.06, 0.02, 0.15));
            float uiBounds = sdBox(bp + vec3(0.0, 1.0, 0.0), vec3(1.4, 0.15, 0.2));
            window = min(window, max(glyphs, uiBounds));
            
            // Op-Art spatial pressure
            window += sin(length(bp.xy) * 25.0 - u_time * 8.0) * 0.04;
            
            // Central Oracle Tunnel
            float tunnel = length(p.xy) - 3.5 + sin(p.z * 6.0 + u_time * 4.0) * 0.3;
            
            return min(window, tunnel);
        }

        vec3 getNormal(vec3 p) {
            vec2 e = vec2(0.01, 0.0);
            return normalize(vec3(
                map(p + e.xyy) - map(p - e.xyy),
                map(p + e.yxy) - map(p - e.yxy),
                map(p + e.yyx) - map(p - e.yyx)
            ));
        }

        void main() {
            vec2 uv = (vUv - 0.5) * 2.0;
            uv.x *= u_res.x / u_res.y;
            
            vec3 ro = vec3(0.0, 0.0, -3.0);
            vec3 rd = normalize(vec3(uv, 1.5));
            
            float d = 0.0;
            vec3 p;
            for(int i = 0; i < 40; i++) {
                p = ro + rd * d;
                float ds = map(p);
                if(ds < 0.01 || d > 20.0) break;
                d += ds;
            }
            
            vec3 n = getNormal(p);
            
            // Structural Color Base
            vec3 structCol = 0.5 + 0.5 * cos(u_time * 0.5 + p.z * 0.5 + dot(n, vec3(0.577)) + vec3(0.0, 2.0, 4.0));
            structCol *= max(0.2, dot(n, normalize(vec3(1.0, 1.0, -1.0))));
            
            // CA State
            vec4 ca = texture(u_ca, vUv);
            
            // Datamosh Flow (Driven by CA and Normals)
            vec2 flow = vec2(n.x, n.y) * 0.015 * (ca.r + 0.5);
            vec4 prev = texture(u_prevHistory, vUv - flow);
            
            // I-Frame Injection (VHS scanline style)
            float scanline = step(0.97, fract(vUv.y * 4.0 - u_time * 0.8));
            float moshBlend = scanline + 0.03; // Always inject a tiny bit of new frame to prevent total melt
            
            fragColor = mix(prev, vec4(structCol, 1.0), moshBlend);
        }
      `
    });

    // 3. POST-PROCESSING (Luminous Risograph, VHS, Cross-Process)
    const postMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { u_history: { value: null }, u_ca: { value: null }, u_res: { value: new THREE.Vector2(w, h) }, u_time: { value: 0 } },
      vertexShader: commonVert,
      fragmentShader: `
        uniform sampler2D u_history;
        uniform sampler2D u_ca;
        uniform vec2 u_res;
        uniform float u_time;
        in vec2 vUv;
        out vec4 fragColor;

        float halftone(vec2 uv, float angle, float lpi) {
            float s = sin(angle), c = cos(angle);
            vec2 rotUV = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
            vec2 grid = fract(rotUV * lpi) - 0.5;
            return length(grid);
        }

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        void main() {
            vec2 uv = vUv;
            
            // VHS Tracking Wobble
            float trackY = fract(u_time * 0.15);
            float trackBand = smoothstep(0.08, 0.0, abs(uv.y - trackY));
            uv.x += sin(uv.y * 150.0 + u_time * 30.0) * 0.015 * trackBand;
            
            // Chromatic Aberration
            float r = texture(u_history, uv + vec2(0.008, 0.0)).r;
            float g = texture(u_history, uv).g;
            float b = texture(u_history, uv - vec2(0.008, 0.0)).b;
            vec3 histCol = vec3(r, g, b);
            
            vec4 ca = texture(u_ca, uv);
            float lum = dot(histCol, vec3(0.299, 0.587, 0.114));
            
            // Luminous Risograph Halftones
            float lpi = 75.0;
            float rad1 = 0.4 - lum * 0.35;
            float rad2 = 0.4 - abs(lum - 0.5) * 0.7;
            float rad3 = 0.4 - (1.0 - lum) * 0.35;
            
            float h1 = smoothstep(rad1, rad1 - 0.05, halftone(uv, 0.261, lpi)); // 15 deg
            float h2 = smoothstep(rad2, rad2 - 0.05, halftone(uv, 0.785, lpi)); // 45 deg
            float h3 = smoothstep(rad3, rad3 - 0.05, halftone(uv, 1.309, lpi)); // 75 deg
            
            // Absolute Color Rules: No neutral darks/lights.
            vec3 baseShadow = vec3(0.15, 0.02, 0.38); // Deep Plum / Indigo
            vec3 ink1 = vec3(1.0, 0.1, 0.5);          // Hot Pink
            vec3 ink2 = vec3(0.0, 0.9, 0.8);          // Neon Cyan / Teal
            vec3 ink3 = vec3(0.9, 1.0, 0.0);          // Acid Yellow
            
            vec3 finalCol = baseShadow;
            
            // Additive Luminous Riso blending
            finalCol += ink1 * h1 * 0.85;
            finalCol += ink2 * h2 * 0.85;
            finalCol += ink3 * h3 * 0.85;
            
            // Structural Color Iridescence (driven by CA)
            vec3 iridescence = 0.5 + 0.5 * cos(u_time * 2.0 + lum * 8.0 + vec3(0.0, 2.0, 4.0));
            finalCol += iridescence * ca.g * 0.6;
            
            // Colored VHS Dropout
            float dropout = step(0.985, hash(uv * vec2(1.0, 50.0) + u_time));
            vec3 dropColor = mix(vec3(1.0, 0.3, 0.0), vec3(0.6, 0.0, 1.0), hash(uv + 1.0)); // Fluo Orange / Ultraviolet
            finalCol = mix(finalCol, dropColor, dropout * trackBand);
            
            // Clamp to avoid pure white/black, enforce tinted bloom
            finalCol = max(finalCol, vec3(0.08, 0.0, 0.2)); // Minimum saturation floor
            finalCol = min(finalCol, vec3(1.0, 0.9, 0.95)); // Warm tinted maximum
            
            fragColor = vec4(finalCol, 1.0);
        }
      `
    });

    const sceneCA = new THREE.Scene();
    sceneCA.add(new THREE.Mesh(geometry, caMat));

    const sceneHistory = new THREE.Scene();
    sceneHistory.add(new THREE.Mesh(geometry, sceneMat));

    const scenePost = new THREE.Scene();
    scenePost.add(new THREE.Mesh(geometry, postMat));

    canvas.__three = {
      renderer, camera,
      caMat, sceneMat, postMat,
      fboCA, fboHistory,
      sceneCA, sceneHistory, scenePost
    };
  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
    return;
  }
}

const t = canvas.__three;
if (!t) return;

// Handle resize
const w = grid.width;
const h = grid.height;
if (t.renderer.domElement.width !== w || t.renderer.domElement.height !== h) {
  t.renderer.setSize(w, h, false);
  t.fboCA.read.setSize(w, h);
  t.fboCA.write.setSize(w, h);
  t.fboHistory.read.setSize(w, h);
  t.fboHistory.write.setSize(w, h);
  t.caMat.uniforms.u_res.value.set(w, h);
  t.sceneMat.uniforms.u_res.value.set(w, h);
  t.postMat.uniforms.u_res.value.set(w, h);
}

const swap = (fbo) => {
  const temp = fbo.read;
  fbo.read = fbo.write;
  fbo.write = temp;
};

// 1. Update Cellular Automata
t.caMat.uniforms.u_time.value = time;
t.caMat.uniforms.u_prev.value = t.fboCA.read.texture;
t.renderer.setRenderTarget(t.fboCA.write);
t.renderer.render(t.sceneCA, t.camera);
swap(t.fboCA);

// 2. Update Scene & Datamosh History
t.sceneMat.uniforms.u_time.value = time;
t.sceneMat.uniforms.u_ca.value = t.fboCA.read.texture;
t.sceneMat.uniforms.u_prevHistory.value = t.fboHistory.read.texture;
t.renderer.setRenderTarget(t.fboHistory.write);
t.renderer.render(t.sceneHistory, t.camera);
swap(t.fboHistory);

// 3. Final Post-Processing to Screen
t.postMat.uniforms.u_time.value = time;
t.postMat.uniforms.u_ca.value = t.fboCA.read.texture;
t.postMat.uniforms.u_history.value = t.fboHistory.read.texture;
t.renderer.setRenderTarget(null);
t.renderer.render(t.scenePost, t.camera);