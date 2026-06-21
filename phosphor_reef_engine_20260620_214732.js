/**
 * Phosphor Signal Reef Engine
 * A collision of phosphor, datamosh, halftone, and cuttlefish chromatics.
 */

if (!canvas.__three) {
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: false, antialias: false });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    // Core Shader: A hybrid of CRT phosphor, datamosh, and halftone-mosaic logic
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_intensity: { value: 0.8 },
      },
      vertexShader: `
        in vec2 a_position;
        out vec2 v_uv;
        void main() {
          v_uv = a_position * 0.5 + 0.5;
          gl_Position = vec4(a_position, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        in vec2 v_uv;
        out vec4 fragColor;
        uniform float u_time;
        uniform vec2 u_resolution;
        uniform float u_intensity;

        // Hash for noise
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        void main() {
            vec2 uv = v_uv;
            // 1. Datamosh-like temporal smear
            vec2 shift = vec2(sin(uv.y * 10.0 + u_time), cos(uv.x * 10.0 + u_time)) * 0.005;
            
            // 2. Phosphor triad simulation
            float col = mod(gl_FragCoord.x, 3.0);
            vec3 phosphor = vec3(
                step(0.0, col) * step(col, 1.0),
                step(1.0, col) * step(col, 2.0),
                step(2.0, col) * step(col, 3.0)
            );

            // 3. Halftone/Mosaic structure
            vec2 grid = floor(uv * 120.0);
            float dotPattern = length(fract(uv * 120.0) - 0.5);
            float halftone = smoothstep(0.4, 0.35, dotPattern);

            // 4. Color System: Chroma Reef (No Black/White void)
            vec3 color = vec3(
                0.5 + 0.5 * sin(u_time + uv.xyx * 5.0 + vec3(0, 2, 4)),
                0.5 + 0.5 * cos(u_time + uv.yxx * 3.0 + vec3(1, 3, 5))
            );

            // 5. Composite
            vec3 final = color * phosphor * halftone;
            
            // Safety: No black/white dominance
            final = mix(final, vec3(0.1, 0.05, 0.2), 0.1); 
            final = clamp(final, 0.05, 0.95);

            fragColor = vec4(final, 1.0);
        }
      `
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    canvas.__three = { renderer, scene, camera, material };
  } catch (e) {
    console.error("WebGL Init Failed", e);
    return;
  }
}

const { renderer, scene, camera, material } = canvas.__three;
if (material?.uniforms?.u_time) {
  material.uniforms.u_time.value = time;
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);