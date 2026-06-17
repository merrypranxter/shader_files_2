if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");

        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
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

            uniform float u_time;
            uniform vec2 u_resolution;

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }

            vec2 hash22(vec2 p) {
                p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
                return fract(sin(p) * 43758.5453);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                           mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
            }

            float fbm(vec2 p) {
                float v = 0.0, a = 0.5;
                for (int i = 0; i < 5; i++) {
                    v += a * noise(p);
                    p = p * 2.0 + vec2(1.3, -0.8);
                    a *= 0.5;
                }
                return v;
            }

            float voronoi(vec2 x) {
                vec2 n = floor(x);
                vec2 f = fract(x);
                float m = 8.0;
                for (int j = -1; j <= 1; j++) {
                    for (int i = -1; i <= 1; i++) {
                        vec2 g = vec2(float(i), float(j));
                        vec2 o = hash22(n + g);
                        o = 0.5 + 0.5 * sin(u_time * 0.3 + 6.2831853 * o);
                        vec2 r = g - f + o;
                        float d = dot(r, r);
                        if (d < m) m = d;
                    }
                }
                return sqrt(m);
            }

            float density(vec2 p) {
                float t_slow = u_time * 0.02;

                vec2 q = vec2(fbm(p * 2.0 + t_slow), fbm(p * 2.0 - t_slow + 4.2));
                vec2 r = vec2(fbm(p * 4.0 + q * 2.5), fbm(p * 4.0 + q * 2.5 + 3.8));

                float v = voronoi(p * 3.0 + r * 1.5);
                float topo = sin(v * 35.0) * 0.5 + 0.5;
                float pulp = fbm(p * 15.0 + r * 3.0);

                float void_field = fbm(p * 1.5 + q);
                float voids = smoothstep(0.45, 0.65, void_field);
                float edge = smoothstep(0.40, 0.45, void_field) - smoothstep(0.45, 0.50, void_field);

                float mat = (topo * 0.6 + pulp * 0.4) * 2.5;
                mat = mat * voids + edge * 0.8;

                return clamp(mat, 0.0, 1.0);
            }

            float halftone(vec2 uv, float lpi, float angle) {
                float c = cos(angle), s = sin(angle);
                vec2 rot = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
                vec2 cell = fract(rot * lpi) - 0.5;
                float bleed = 0.06 * fbm(uv * lpi * 2.0);
                return length(cell) + bleed;
            }

            void main() {
                vec2 uv = vUv;
                float aspect = u_resolution.x / u_resolution.y;
                vec2 p = uv * vec2(aspect, 1.0);

                float misreg = 0.02 + 0.01 * sin(u_time * 0.5);
                vec2 offC = vec2(misreg, 0.0) * sin(u_time * 0.1);
                vec2 offM = vec2(-misreg * 0.5, misreg * 0.866) * cos(u_time * 0.13);
                vec2 offY = vec2(-misreg * 0.5, -misreg * 0.866) * sin(u_time * 0.17);

                float dC = density(p + offC);
                float dM = density(p + offM);
                float dY = density(p + offY);

                float lpi = 110.0;
                float dotC = halftone(p + offC, lpi, 0.785398); 
                float dotM = halftone(p + offM, lpi, 1.308996); 
                float dotY = halftone(p + offY, lpi, 1.832595); 

                float t_fast = u_time * 4.0;
                float dropC = step(0.06, hash(p * 100.0 + t_fast));
                float dropM = step(0.06, hash(p * 100.0 + t_fast + 1.1));
                float dropY = step(0.06, hash(p * 100.0 + t_fast + 2.2));

                float dot_gain = 1.3;
                float inkC = smoothstep(dotC, dotC - 0.04, dC * dot_gain) * dropC;
                float inkM = smoothstep(dotM, dotM - 0.04, dM * dot_gain) * dropM;
                float inkY = smoothstep(dotY, dotY - 0.04, dY * dot_gain) * dropY;

                vec3 CYAN = vec3(0.0, 1.0, 1.0);
                vec3 MAGENTA = vec3(1.0, 0.0, 1.0);
                vec3 YELLOW = vec3(1.0, 1.0, 0.0);

                vec3 col = vec3(0.0);
                
                float base_glow = (dC + dM + dY) * 0.333;
                col += vec3(0.02, 0.05, 0.08) * base_glow * base_glow;

                col += CYAN * inkC;
                col += MAGENTA * inkM;
                col += YELLOW * inkY;

                float grain = hash(gl_FragCoord.xy + u_time) * 0.15 + 0.85;
                col *= grain;

                float vignette = 1.0 - smoothstep(0.4, 1.5, length(uv - 0.5));
                col *= vignette;

                fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
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
    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        return;
    }
}

const { renderer, scene, camera, material } = canvas.__three;
if (material && material.uniforms && material.uniforms.u_time) {
    material.uniforms.u_time.value = time;
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);