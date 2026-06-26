// Fractal Friday: Candy-Acid Mandelbrot with Julia Portals & Datamosh
// Optimized for Low-Power Hardware: Capped iterations, single fractal pass, simple ping-pong FBO.

if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({
      canvas,
      context: ctx,
      alpha: true,
      antialias: false, // Disabled for performance
      preserveDrawingBuffer: false 
    });
    
    // Cap FBO resolution to ensure smooth 60fps on older devices
    const MAX_FBO_SIZE = 800;
    const fboW = Math.min(grid.width, MAX_FBO_SIZE);
    const fboH = Math.min(grid.height, MAX_FBO_SIZE);

    const fboOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType // Fastest type
    };

    const fbo = [
      new THREE.WebGLRenderTarget(fboW, fboH, fboOptions),
      new THREE.WebGLRenderTarget(fboW, fboH, fboOptions)
    ];

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    // --- PASS 1: FRACTAL & FEEDBACK ---
    // Calculates Mandelbrot, Julia portals, Burning Ship sparks, and temporal datamosh
    const fractalMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_res: { value: new THREE.Vector2(fboW, fboH) },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
        u_prev: { value: null }
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
        uniform vec2 u_res;
        uniform vec2 u_mouse;
        uniform sampler2D u_prev;
        
        in vec2 vUv;
        out vec4 fragColor;
        
        // Complex math
        vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
        
        // Candy-acid spectral palette
        vec3 palette(float t) {
            vec3 a = vec3(0.5, 0.4, 0.6);
            vec3 b = vec3(0.5, 0.6, 0.4);
            vec3 c = vec3(2.0, 1.0, 1.0);
            vec3 d = vec3(0.0, 0.33, 0.67);
            return a + b * cos(6.28318 * (c * t + d));
        }

        void main() {
            vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
            vec2 rawUv = vUv;
            
            // Slow breathing zoom into Seahorse Valley
            float zoomPhase = mod(u_time * 0.15, 12.0);
            float zoom = 2.5 * pow(0.75, zoomPhase);
            vec2 c = uv * zoom + vec2(-0.745, 0.113); 
            vec2 z = vec2(0.0);
            
            // --- Portals (Julia Sets in corners) ---
            vec2 pUv = abs(uv) - vec2(0.6, 0.35);
            float pD = length(pUv);
            bool isPortal = pD < 0.15;
            
            if (isPortal) {
                // Julia mode
                z = (pUv / 0.15) * 1.5;
                // Gentle rotation
                float a = u_time * 0.3;
                z = vec2(z.x * cos(a) - z.y * sin(a), z.x * sin(a) + z.y * cos(a));
                // Mouse drives Julia constant
                c = (u_mouse - 0.5) * 2.5; 
            }
            
            // --- Burning Ship Sparks ---
            bool isShip = uv.y < -0.3 && abs(uv.x) < 0.2 && !isPortal;

            // --- Optimized Iteration (Max 35 loops) ---
            float n = 0.0;
            float trap = 100.0;
            float maxIter = 35.0;
            
            for (float i = 0.0; i < 35.0; i++) {
                if (isShip) z = vec2(abs(z.x), abs(z.y));
                z = cmul(z, z) + c;
                
                // Orbit trap (cardioid/lines)
                trap = min(trap, abs(z.x * z.y) + length(z)*0.1);
                
                if (dot(z, z) > 16.0) break;
                n += 1.0;
            }
            
            vec3 col = vec3(0.0);
            
            // --- Escape Time & Domain Coloring ---
            if (n < maxIter) {
                // Smooth iteration
                float log_zn = log(dot(z,z)) * 0.5;
                float nu = log(log_zn / 0.693147) / 0.693147;
                n = n - nu;
                
                float angle = atan(z.y, z.x) / 6.28318 + 0.5;
                float mag = log(length(z) + 1.0);
                
                // Color cycling
                float t = n * 0.04 - u_time * 0.4 + angle * 0.5;
                col = palette(t);
                
                // Op-art contour bands
                float contours = smoothstep(0.8, 1.0, sin(mag * 20.0 - u_time * 2.0));
                col += contours * 0.3;
                
                // Orbit trap glow (neon yellow/pink)
                col = mix(col, vec3(1.0, 0.9, 0.1), smoothstep(0.0, 0.05, trap) * 0.8);
            } else {
                // Interior: crisp dark with faint pulse
                col = vec3(0.02, 0.0, 0.05) * (0.5 + 0.5 * sin(u_time));
            }
            
            // Portal borders
            if (isPortal) {
                float border = smoothstep(0.13, 0.15, pD);
                col += vec3(0.0, 1.0, 0.8) * border;
            }

            // --- Datamosh & Afterimage ---
            float dmPhase = mod(u_time, 10.0);
            float dmActive = step(8.5, dmPhase); // Active for 1.5s every 10s
            
            // Use fractal 'z' value as a motion vector for the smear
            vec2 motion = z * 0.003 * dmActive;
            motion = floor(motion * 30.0) / 30.0; // Blocky datamosh scars
            
            // Slight inward zoom for retinal persistence trail
            vec2 prevUv = rawUv - motion - (rawUv - 0.5) * 0.004;
            vec3 prevCol = texture(u_prev, prevUv).rgb;
            
            // Additive blend with decay
            col = mix(col, prevCol, 0.75 - 0.2 * dmActive);

            fragColor = vec4(col, 1.0);
        }
      `
    });

    // --- PASS 2: POST PROCESSING ---
    // Chromatic aberration, VHS scanlines, vignette
    const postMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_tex: { value: null },
        u_res: { value: new THREE.Vector2(grid.width, grid.height) },
        u_time: { value: 0 }
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
        
        uniform sampler2D u_tex;
        uniform vec2 u_res;
        uniform float u_time;
        
        in vec2 vUv;
        out vec4 fragColor;
        
        void main() {
            vec2 uv = vUv;
            
            // Chromatic Aberration (stronger at edges)
            vec2 toCenter = uv - 0.5;
            float dist = dot(toCenter, toCenter);
            vec2 caOffset = toCenter * dist * 0.05;
            
            float r = texture(u_tex, uv - caOffset).r;
            float g = texture(u_tex, uv).g;
            float b = texture(u_tex, uv + caOffset).b;
            vec3 col = vec3(r, g, b);
            
            // Overexposed edge bloom
            float luma = dot(col, vec3(0.299, 0.587, 0.114));
            col += smoothstep(0.8, 1.0, luma) * vec3(0.4, 0.2, 0.6);
            
            // VHS Scanline Shimmer
            float scanline = sin(uv.y * u_res.y * 0.6) * 0.03;
            col -= scanline;
            
            // Analog tracking bend (bottom edge)
            float track = step(0.95, fract(uv.y * 3.0 + u_time * 0.8)) * 0.1;
            col += track * texture(u_tex, uv + vec2(0.02, 0.0)).rgb * 0.3;
            
            // Vignette
            col *= 1.0 - dist * 1.2;
            
            fragColor = vec4(col, 1.0);
        }
      `
    });

    const fractalScene = new THREE.Scene();
    fractalScene.add(new THREE.Mesh(geometry, fractalMat));

    const postScene = new THREE.Scene();
    postScene.add(new THREE.Mesh(geometry, postMat));

    canvas.__three = { 
      renderer, 
      camera, 
      fbo, 
      fractalScene, 
      postScene, 
      fractalMat, 
      postMat,
      ping: 0 
    };
  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
    throw e;
  }
}

const { renderer, camera, fbo, fractalScene, postScene, fractalMat, postMat } = canvas.__three;
let ping = canvas.__three.ping;
let pong = 1 - ping;

// Update Uniforms safely
if (fractalMat && fractalMat.uniforms) {
  fractalMat.uniforms.u_time.value = time;
  // Map mouse smoothly, defaulting to center if not pressed
  let targetX = mouse.isPressed ? mouse.x / grid.width : 0.5 + Math.sin(time*0.5)*0.2;
  let targetY = mouse.isPressed ? 1.0 - (mouse.y / grid.height) : 0.5 + Math.cos(time*0.3)*0.2;
  
  // Simple easing for mouse
  let curM = fractalMat.uniforms.u_mouse.value;
  curM.x += (targetX - curM.x) * 0.1;
  curM.y += (targetY - curM.y) * 0.1;
}

if (postMat && postMat.uniforms) {
  postMat.uniforms.u_time.value = time;
  postMat.uniforms.u_res.value.set(grid.width, grid.height);
}

// Pass 1: Render Fractal to FBO B, reading from FBO A
fractalMat.uniforms.u_prev.value = fbo[ping].texture;
renderer.setRenderTarget(fbo[pong]);
renderer.render(fractalScene, camera);

// Pass 2: Render FBO B to Screen with Post-FX
postMat.uniforms.u_tex.value = fbo[pong].texture;
renderer.setRenderTarget(null);
renderer.setSize(grid.width, grid.height, false);
renderer.render(postScene, camera);

// Swap buffers
canvas.__three.ping = pong;