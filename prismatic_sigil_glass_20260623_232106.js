if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: false, antialias: false });
    renderer.autoClear = false;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    const rtOpts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    };

    const rtScene = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
    const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
    const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);

    const commonVert = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const matScene = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader: commonVert,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        uniform float u_time;
        uniform vec2 u_resolution;

        // Fast 3D Hash & Noise for Schlieren Flow
        float hash(vec3 p) {
            p = fract(p * 0.3183099 + 0.1);
            p *= 17.0;
            return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        float noise(vec3 x) {
            vec3 i = floor(x);
            vec3 f = fract(x);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(hash(i + vec3(0.0,0.0,0.0)), hash(i + vec3(1.0,0.0,0.0)), f.x),
                           mix(hash(i + vec3(0.0,1.0,0.0)), hash(i + vec3(1.0,1.0,0.0)), f.x), f.y),
                       mix(mix(hash(i + vec3(0.0,0.0,1.0)), hash(i + vec3(1.0,0.0,1.0)), f.x),
                           mix(hash(i + vec3(0.0,1.0,1.0)), hash(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);
        }

        float fbm(vec3 p) {
            float f = 0.0;
            float w = 0.5;
            for(int i = 0; i < 4; i++) {
                f += w * noise(p);
                p *= 2.0;
                w *= 0.5;
            }
            return f;
        }

        // Rich, midtone-heavy palette: Cyan, Magenta, Violet, Acid Green, Orange, Electric Blue
        vec3 getPalette(float v) {
            v = fract(v * 1.5);
            vec3 c1 = vec3(0.0, 0.8, 0.9); // Cyan
            vec3 c2 = vec3(0.9, 0.1, 0.8); // Magenta
            vec3 c3 = vec3(0.4, 0.1, 0.9); // Violet
            vec3 c4 = vec3(0.6, 0.9, 0.1); // Acid Green
            vec3 c5 = vec3(0.9, 0.4, 0.1); // Warm Orange
            vec3 c6 = vec3(0.1, 0.3, 1.0); // Electric Blue

            vec3 col = mix(c1, c2, smoothstep(0.0, 0.2, v));
            col = mix(col, c3, smoothstep(0.2, 0.4, v));
            col = mix(col, c4, smoothstep(0.4, 0.6, v));
            col = mix(col, c5, smoothstep(0.6, 0.8, v));
            col = mix(col, c6, smoothstep(0.8, 1.0, v));
            return col;
        }

        // SDF Primitives
        float sdOctagon(vec2 p, float r) {
            const vec3 k = vec3(-0.9238795325, 0.3826834323, 0.4142135623);
            p = abs(p);
            p -= 2.0 * min(dot(vec2(k.x, k.y), p), 0.0) * vec2(k.x, k.y);
            p -= 2.0 * min(dot(vec2(-k.x, k.y), p), 0.0) * vec2(-k.x, k.y);
            p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
            return length(p) * sign(p.y);
        }

        // Complex Layered Glass Map
        float map(vec2 p) {
            float d1 = abs(length(p) - 0.35) - 0.015;
            float d2 = sdOctagon(p, 0.25) - 0.01;
            float d3 = (abs(p.x) + abs(p.y)) * 0.7071 - 0.1;

            // Drifting Collage Fragments
            vec2 pF1 = p - vec2(sin(u_time * 0.4) * 0.4, cos(u_time * 0.3) * 0.4);
            pF1 = mat2(cos(u_time), -sin(u_time), sin(u_time), cos(u_time)) * pF1;
            float frag1 = sdOctagon(pF1, 0.06);

            vec2 pF2 = p - vec2(cos(u_time * 0.5) * -0.5, sin(u_time * 0.2) * 0.5);
            pF2 = mat2(cos(-u_time * 1.2), -sin(-u_time * 1.2), sin(-u_time * 1.2), cos(-u_time * 1.2)) * pF2;
            float frag2 = (abs(pF2.x) + abs(pF2.y)) * 0.7071 - 0.05;

            return min(d1, min(d2, min(d3, min(frag1, frag2))));
        }

        vec3 getNormal(vec2 p) {
            vec2 e = vec2(0.002, 0.0);
            return normalize(vec3(
                map(p + e.xy) - map(p - e.xy),
                map(p + e.yx) - map(p - e.yx),
                0.03 // Soft bevel slope
            ));
        }

        void main() {
            vec2 uv = vUv;
            vec2 p = (uv - 0.5) * (u_resolution.xy / u_resolution.y);

            // Schlieren Flow (Heat Haze)
            vec2 flow = vec2(
                fbm(vec3(p * 3.0, u_time * 0.15)),
                fbm(vec3(p * 3.0 + 10.0, u_time * 0.2))
            ) * 2.0 - 1.0;

            vec2 bgUv = p + flow * 0.06;

            float d = map(p);
            vec3 n = getNormal(p);

            vec3 col = vec3(0.0);

            if (d < 0.0) {
                // Inside glass: Refraction + Chromatic Aberration
                float vR = fbm(vec3((bgUv + n.xy * 0.15) * 2.0, u_time * 0.1));
                float vG = fbm(vec3((bgUv + n.xy * 0.10) * 2.0, u_time * 0.1));
                float vB = fbm(vec3((bgUv + n.xy * 0.05) * 2.0, u_time * 0.1));

                col.r = getPalette(vR).r;
                col.g = getPalette(vG).g;
                col.b = getPalette(vB).b;

                // Specular Highlights
                float spec = pow(max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0), 32.0);
                col += spec * vec3(1.0, 0.9, 0.8) * 1.5;
                col *= 0.85; // Glass tint
            } else {
                // Background Flow
                float vBg = fbm(vec3(bgUv * 2.0, u_time * 0.1));
                col = getPalette(vBg);
            }

            // Glass Rim
            float rim = smoothstep(0.008, 0.0, abs(d));
            col += rim * vec3(0.8, 0.9, 1.0);

            // Geomantic Sigils
            float sigilGlow = 0.0;
            vec2 sp = p;
            float pulse = 0.8 + 0.2 * sin(u_time * 2.0);

            for(int i=0; i<4; i++) {
                float y = 0.06 - float(i)*0.04;
                if (i == 0 || i == 3) {
                    sigilGlow += 0.0005 / (pow(length(sp - vec2(-0.025, y)), 1.5) + 0.001);
                    sigilGlow += 0.0005 / (pow(length(sp - vec2(0.025, y)), 1.5) + 0.001);
                } else {
                    sigilGlow += 0.0005 / (pow(length(sp - vec2(0.0, y)), 1.5) + 0.001);
                }
            }
            sigilGlow += 0.0003 / (abs(sdOctagon(sp, 0.1)) + 0.001);
            col += sigilGlow * vec3(0.7, 1.0, 0.9) * pulse * 0.6;

            fragColor = vec4(col, 1.0);
        }
      `
    });

    const matFeedback = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tScene: { value: null },
        tOld: { value: null },
        u_time: { value: 0 }
      },
      vertexShader: commonVert,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D tScene;
        uniform sampler2D tOld;
        uniform float u_time;

        void main() {
            vec4 curr = texture(tScene, vUv);
            
            // Pulfrich motion offset & slight zoom for afterimage trails
            vec2 offset = vec2(sin(u_time * 1.3) * 0.002, cos(u_time * 1.1) * 0.001);
            vec2 oldUv = (vUv - 0.5) * 0.995 + 0.5 + offset;
            
            vec4 old = texture(tOld, oldUv);
            vec3 blended = max(curr.rgb, old.rgb * 0.90);
            
            fragColor = vec4(blended, 1.0);
        }
      `
    });

    const matOutput = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tFeedback: { value: null },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_time: { value: 0 }
      },
      vertexShader: commonVert,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D tFeedback;
        uniform vec2 u_resolution;
        uniform float u_time;

        void main() {
            vec2 uv = vUv;
            vec2 dir = uv - 0.5;
            float dist = length(dir);
            
            // Lateral Chromatic Aberration
            float ca = 0.008 * dist;
            float r = texture(tFeedback, uv + dir * ca).r;
            float g = texture(tFeedback, uv).g;
            float b = texture(tFeedback, uv - dir * ca).b;
            vec3 col = vec3(r, g, b);

            // CRT Phosphor Mask & Scanlines
            float scan = 0.95 + 0.05 * sin(uv.y * u_resolution.y * 2.0);
            float mask = 0.97 + 0.03 * sin(uv.x * u_resolution.x * 2.0);
            col *= scan * mask;

            // Subtle Vignette
            col *= smoothstep(0.9, 0.3, dist);

            // Mild CRT Light Damage (flickering tracking line)
            float line = exp(-pow((uv.y - fract(u_time * 0.15)) * 30.0, 2.0));
            col += line * 0.03 * vec3(1.0, 0.8, 0.9);

            fragColor = vec4(col, 1.0);
        }
      `
    });

    const mesh = new THREE.Mesh(geometry, matScene);
    scene.add(mesh);

    canvas.__three = { 
      renderer, scene, camera, mesh, 
      matScene, matFeedback, matOutput, 
      rtScene, rtA, rtB, currentRt: 'A' 
    };

  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
    return;
  }
}

const { 
  renderer, scene, camera, mesh, 
  matScene, matFeedback, matOutput, 
  rtScene, rtA, rtB 
} = canvas.__three;

if (!matScene || !matScene.uniforms) return;

// Handle Resizing
if (rtScene.width !== grid.width || rtScene.height !== grid.height) {
  renderer.setSize(grid.width, grid.height, false);
  rtScene.setSize(grid.width, grid.height);
  rtA.setSize(grid.width, grid.height);
  rtB.setSize(grid.width, grid.height);
  matScene.uniforms.u_resolution.value.set(grid.width, grid.height);
  matOutput.uniforms.u_resolution.value.set(grid.width, grid.height);
}

// Update Uniforms
matScene.uniforms.u_time.value = time;
matFeedback.uniforms.u_time.value = time;
matOutput.uniforms.u_time.value = time;

// Pass 1: Render Base Scene
mesh.material = matScene;
renderer.setRenderTarget(rtScene);
renderer.render(scene, camera);

// Pass 2: Temporal Feedback & Pulfrich offset
mesh.material = matFeedback;
matFeedback.uniforms.tScene.value = rtScene.texture;
matFeedback.uniforms.tOld.value = canvas.__three.currentRt === 'A' ? rtB.texture : rtA.texture;
const targetRt = canvas.__three.currentRt === 'A' ? rtA : rtB;
renderer.setRenderTarget(targetRt);
renderer.render(scene, camera);

// Pass 3: Post-processing (CRT, Aberration) to Screen
mesh.material = matOutput;
matOutput.uniforms.tFeedback.value = targetRt.texture;
renderer.setRenderTarget(null);
renderer.render(scene, camera);

// Swap feedback buffers
canvas.__three.currentRt = canvas.__three.currentRt === 'A' ? 'B' : 'A';