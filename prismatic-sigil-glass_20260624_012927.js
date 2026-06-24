if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.autoClear = false;

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    const rtOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false
    };

    const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
    const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

    const bufferScene = new THREE.Scene();
    const bufferMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
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
        in vec2 vUv;
        out vec4 fragColor;

        uniform float u_time;
        uniform vec2 u_resolution;
        uniform sampler2D u_prev;

        const float PI = 3.14159265359;

        mat2 rot(float a) {
            float s = sin(a), c = cos(a);
            return mat2(c, -s, s, c);
        }

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }

        float fbm(vec2 p) {
            float f = 0.0;
            float a = 0.5;
            for(int i = 0; i < 5; i++) {
                f += a * noise(p);
                p = rot(0.5) * p * 2.0;
                a *= 0.5;
            }
            return f;
        }

        vec3 getPalette(float t) {
            t = fract(t) * 6.0;
            int i = int(t);
            float f = smoothstep(0.0, 1.0, fract(t));
            vec3 c0, c1;
            if(i == 0) { c0 = vec3(0.0, 0.8, 0.9); c1 = vec3(0.9, 0.1, 0.8); }      // Cyan to Magenta
            else if(i == 1) { c0 = vec3(0.9, 0.1, 0.8); c1 = vec3(0.5, 0.0, 0.9); } // Magenta to Violet
            else if(i == 2) { c0 = vec3(0.5, 0.0, 0.9); c1 = vec3(0.6, 0.9, 0.1); } // Violet to Acid Green
            else if(i == 3) { c0 = vec3(0.6, 0.9, 0.1); c1 = vec3(1.0, 0.5, 0.0); } // Acid Green to Orange
            else if(i == 4) { c0 = vec3(1.0, 0.5, 0.0); c1 = vec3(0.1, 0.3, 1.0); } // Orange to Electric Blue
            else { c0 = vec3(0.1, 0.3, 1.0); c1 = vec3(0.0, 0.8, 0.9); }            // Electric Blue to Cyan
            return mix(c0, c1, f);
        }

        float sdHexagon(vec2 p, float r) {
            const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
            p = abs(p);
            p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
            p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
            return length(p) * sign(p.y);
        }

        float sdSegment(vec2 p, vec2 a, vec2 b) {
            vec2 pa = p - a, ba = b - a;
            float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
            return length(pa - ba * h);
        }

        float sdBindrune(vec2 p) {
            float d = sdSegment(p, vec2(0.0, 0.35), vec2(0.0, -0.35));
            d = min(d, sdSegment(p, vec2(0.0, 0.2), vec2(0.2, 0.35)));
            d = min(d, sdSegment(p, vec2(0.0, 0.2), vec2(-0.2, 0.35)));
            d = min(d, sdSegment(p, vec2(0.0, 0.0), vec2(0.2, -0.2)));
            d = min(d, sdSegment(p, vec2(0.0, 0.0), vec2(-0.2, -0.2)));
            d = min(d, abs(length(p) - 0.45));
            return d - 0.008;
        }

        float mapGlass(vec2 p) {
            float d1 = sdHexagon(p, 0.65);
            float d2 = sdHexagon(p * rot(u_time * 0.1), 0.5);
            float layer1 = max(d1, -d2);

            vec2 p2 = p * rot(-u_time * 0.15);
            float d3 = dot(abs(p2), vec2(1.0)) - 0.3;
            float d4 = dot(abs(p2), vec2(1.0)) - 0.18;
            float layer2 = max(d3, -d4);

            return min(layer1, layer2);
        }

        vec2 getFlow(vec2 p) {
            return vec2(
                fbm(p * 2.0 + u_time * 0.1),
                fbm(p * 2.0 - u_time * 0.15)
            );
        }

        vec3 getBackground(vec2 p, vec2 flow) {
            float bgPattern = fbm(p * 3.0 + flow + u_time * 0.05);
            vec3 col = getPalette(bgPattern - u_time * 0.1);
            
            // Sparkles
            float sparkles = pow(hash(p * 10.0 + u_time), 150.0);
            col += sparkles * vec3(1.0);
            
            return mix(col, vec3(0.05, 0.02, 0.1), 0.4);
        }

        void main() {
            vec2 uv = vUv;
            vec2 p = (uv - 0.5) * (u_resolution.x / u_resolution.y);
            p *= 2.0;

            vec2 flow = getFlow(p);
            vec3 bgColor = getBackground(p, flow);

            // Previous frame sampling with Pulfrich-style depth warp
            vec2 prevUV = uv + (0.5 - uv) * 0.004 + flow * 0.003;
            vec4 prevData = texture(u_prev, prevUV);
            vec3 prevColor = prevData.rgb;
            float prevMask = prevData.a;

            // Glass rendering
            float dGlass = mapGlass(p);
            float glassMask = smoothstep(0.015, -0.015, dGlass);

            float eps = 0.002;
            float nx = mapGlass(p + vec2(eps, 0.0)) - mapGlass(p - vec2(eps, 0.0));
            float ny = mapGlass(p + vec2(0.0, eps)) - mapGlass(p - vec2(0.0, eps));
            vec2 normal = normalize(vec2(nx, ny) + 0.0001);

            vec2 pRefr = p + normal * 0.15 * glassMask;
            
            // Chromatic Aberration in refraction
            vec3 glassColor;
            glassColor.r = getBackground(pRefr + normal * 0.015, flow).r;
            glassColor.g = getBackground(pRefr, flow).g;
            glassColor.b = getBackground(pRefr - normal * 0.015, flow).b;
            
            // Internal reflection / specular highlight
            float spec = pow(max(dot(normal, normalize(vec2(1.0, 1.0))), 0.0), 32.0);
            glassColor += spec * vec3(1.0, 0.9, 0.9) * glassMask;

            // Central Sigil
            float dRune = sdBindrune(p * 1.3);
            float runeMask = smoothstep(0.02, 0.0, dRune);
            vec3 runeColor = mix(vec3(1.0, 0.9, 0.7), getPalette(u_time), 0.3);
            glassColor = mix(glassColor, runeColor, runeMask);

            // Drifting Fragments
            float dFrags = 100.0;
            for(float i = 0.0; i < 4.0; i++) {
                float t = u_time * 0.3 + i * 1.618;
                vec2 pos = vec2(sin(t)*1.2, cos(t*1.4)*0.8);
                dFrags = min(dFrags, sdHexagon((p - pos) * rot(t), 0.06 + sin(i)*0.02));
            }
            float fragMask = smoothstep(0.01, 0.0, dFrags);
            vec3 fragColor = getPalette(u_time * 0.5 + p.x);
            glassColor = mix(glassColor, fragColor, fragMask);

            float currentMask = max(max(glassMask, runeMask), fragMask);

            // Combine with temporal feedback (Afterimage trails)
            vec3 decayedPrev = prevColor * 0.88;
            float decayedPrevMask = prevMask * 0.88;

            vec3 finalColor = mix(bgColor, decayedPrev, decayedPrevMask);
            finalColor = mix(finalColor, glassColor, currentMask);

            float outMask = max(currentMask, decayedPrevMask);

            fragColor = vec4(finalColor, outMask);
        }
      `
    });

    bufferScene.add(new THREE.Mesh(geometry, bufferMat));

    const screenScene = new THREE.Scene();
    const screenMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_texture: { value: null }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;

        uniform float u_time;
        uniform vec2 u_resolution;
        uniform sampler2D u_texture;

        void main() {
            vec2 uv = vUv;
            
            // Subtle Barrel Distortion
            vec2 cc = uv - 0.5;
            float dist = dot(cc, cc);
            vec2 distortedUV = uv + cc * (dist * 0.08);

            // Chromatic Aberration near edges
            float caAmt = dist * 0.015;
            float r = texture(u_texture, distortedUV + vec2(caAmt, 0.0)).r;
            float g = texture(u_texture, distortedUV).g;
            float b = texture(u_texture, distortedUV - vec2(caAmt, 0.0)).b;
            vec3 col = vec3(r, g, b);

            // Subtle Phosphor / CRT Scanlines
            float scan = 0.5 + 0.5 * sin(uv.y * u_resolution.y * 1.5);
            col *= mix(1.0, scan, 0.04);

            // Noise / Light Damage
            float noise = fract(sin(dot(uv + u_time, vec2(12.9898, 78.233))) * 43758.5453);
            col += (noise - 0.5) * 0.025;

            // Vignette
            col *= smoothstep(0.7, 0.2, dist);

            fragColor = vec4(col, 1.0);
        }
      `
    });

    screenScene.add(new THREE.Mesh(geometry, screenMat));

    canvas.__three = {
      renderer,
      camera,
      bufferScene,
      bufferMat,
      screenScene,
      screenMat,
      rtA,
      rtB,
      pingpong: true,
      width: grid.width,
      height: grid.height
    };
  } catch (e) {
    console.error("Initialization Failed:", e);
    return;
  }
}

const app = canvas.__three;
const width = grid.width;
const height = grid.height;

if (app.width !== width || app.height !== height) {
  app.renderer.setSize(width, height, false);
  app.rtA.setSize(width, height);
  app.rtB.setSize(width, height);
  app.width = width;
  app.height = height;
}

app.bufferMat.uniforms.u_time.value = time;
app.bufferMat.uniforms.u_resolution.value.set(width, height);
app.bufferMat.uniforms.u_prev.value = app.pingpong ? app.rtA.texture : app.rtB.texture;

app.renderer.setRenderTarget(app.pingpong ? app.rtB : app.rtA);
app.renderer.render(app.bufferScene, app.camera);

app.screenMat.uniforms.u_time.value = time;
app.screenMat.uniforms.u_resolution.value.set(width, height);
app.screenMat.uniforms.u_texture.value = app.pingpong ? app.rtB.texture : app.rtA.texture;

app.renderer.setRenderTarget(null);
app.renderer.render(app.screenScene, app.camera);

app.pingpong = !app.pingpong;