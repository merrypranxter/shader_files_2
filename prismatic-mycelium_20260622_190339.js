/**
 * THE WEIRD CODE GUY - GENERATIVE ART MODULE
 * 
 * CONCEPT: "Mycelial Datamosh Cathedral"
 * A living stained-glass fungus cathedral inside a broken VHS signal.
 * Wave-function-collapse tiles hollowed out by gyroid lattices, 
 * colonized by glowing mycelial networks, viewed through birefringence 
 * and chromatic aberration, collapsing under temporal datamosh smearing.
 */

export function render(ctx, grid, time, repos, input, mouse, canvas, THREE) {
    if (!canvas.__three) {
        try {
            if (!ctx) throw new Error("WebGL 2 context not available");
            
            const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(75, grid.width / grid.height, 0.1, 1000);
            camera.position.z = 5;
            
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
                        gl_Position = vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    #version 300 es
                    precision highp float;

                    in vec2 vUv;
                    out vec4 fragColor;

                    uniform float u_time;
                    uniform vec2 u_resolution;

                    mat2 rot(float a) {
                        float c = cos(a), s = sin(a);
                        return mat2(c, -s, s, c);
                    }

                    float hash31(vec3 p) {
                        return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
                    }

                    // Scene Map
                    // Returns vec2(distance, material_id)
                    vec2 map(vec3 p, float t_eff) {
                        // Wave-Function-Collapse Cell Logic
                        vec3 cellId = floor(p);
                        vec3 local = fract(p) - 0.5;
                        
                        float tHash = hash31(cellId);
                        float flipPhase = floor(t_eff * 0.5 + tHash * 10.0);
                        float tileState = fract(sin(tHash + flipPhase) * 123.456);
                        
                        // Tile rotation animation
                        float flipFract = fract(t_eff * 0.5 + tHash * 10.0);
                        float flipAnim = smoothstep(0.8, 1.0, flipFract);
                        float angle = (floor(tileState * 4.0) + flipAnim) * 1.570796;
                        
                        float c = cos(angle), s = sin(angle);
                        vec3 pLocal = vec3(local.x * c - local.y * s, local.x * s + local.y * c, local.z);
                        
                        // Gyroid Lattice
                        vec3 p_g = (cellId + pLocal + 0.5) * 3.1415;
                        float g = dot(sin(p_g), cos(p_g.zxy));
                        float gyroidSolid = abs(g) - mix(0.1, 0.4, tileState);
                        
                        // Modular Glass Panels with gaps
                        vec3 dBoxVec = abs(pLocal) - 0.48;
                        float dBox = length(max(dBoxVec, 0.0)) + min(max(dBoxVec.x, max(dBoxVec.y, dBoxVec.z)), 0.0);
                        
                        // Glass is solid only inside the box AND inside the gyroid lattice
                        float d_glass = max(dBox, gyroidSolid);
                        
                        // Mycelial Network
                        vec3 q = p + vec3(sin(t_eff * 0.5), cos(t_eff * 0.3), 0.0);
                        float m_g = dot(sin(q * 2.0), cos(q.zxy * 2.0));
                        float d_myc = abs(m_g) - 0.05 + sin(q.x*15.0)*sin(q.y*15.0)*sin(q.z*15.0)*0.015;
                        
                        // Occasional massive fungal bloom overwriting the glass tile
                        if (tileState > 0.9) {
                            d_glass = 999.0;
                            d_myc = length(local) - 0.25 + sin(p.x*10.0 + t_eff)*0.05;
                        }
                        
                        if (d_glass < d_myc) {
                            return vec2(d_glass * 0.5, 1.0 + tileState); // Material 1: Glass
                        } else {
                            return vec2(d_myc * 0.5, 2.0); // Material 2: Mycelium
                        }
                    }

                    vec3 calcNormal(vec3 p, float t_eff) {
                        vec2 e = vec2(0.005, 0.0);
                        vec3 n = normalize(vec3(
                            map(p + e.xyy, t_eff).x - map(p - e.xyy, t_eff).x,
                            map(p + e.yxy, t_eff).x - map(p - e.yxy, t_eff).x,
                            map(p + e.yyx, t_eff).x - map(p - e.yyx, t_eff).x
                        ));
                        // Glass Patterns: Faceted refractive noise
                        float facet = sin(p.x * 20.0) * cos(p.y * 20.0) * sin(p.z * 20.0);
                        return normalize(n + vec3(facet) * 0.05);
                    }

                    void main() {
                        vec2 uv = vUv * 2.0 - 1.0;
                        uv.x *= u_resolution.x / u_resolution.y;
                        
                        // Datamosh: Temporal block quantization
                        vec2 moshGrid = floor(vUv * 16.0) / 16.0;
                        float moshTime = floor(u_time * 4.0) / 4.0;
                        float isMoshed = step(0.75, fract(sin(dot(moshGrid, vec2(12.9898, 78.233)) + moshTime) * 43758.5453));
                        float t_eff = mix(u_time, moshTime, isMoshed);
                        
                        // VHS signal wobble and tearing
                        float wobble = sin(vUv.y * 12.0 + t_eff * 4.0) * 0.005;
                        float tear = step(0.95, sin(vUv.y * 8.0 - t_eff * 15.0)) * 0.03 * sin(t_eff * 30.0);
                        vec2 warpedUV = uv + vec2(wobble + tear, 0.0);
                        
                        // Camera Setup
                        vec3 ro = vec3(0.0, 0.0, t_eff * 1.2);
                        vec3 rd = normalize(vec3(warpedUV, 1.0));
                        
                        mat2 rotX = rot(sin(t_eff * 0.2) * 0.3);
                        mat2 rotY = rot(t_eff * 0.15);
                        rd.yz *= rotX;
                        rd.xz *= rotY;
                        ro.yz *= rotX;
                        ro.xz *= rotY;
                        
                        // Raymarching
                        float t = 0.0;
                        float max_t = 15.0;
                        vec2 res = vec2(0.0);
                        vec3 glow = vec3(0.0);
                        
                        for(int i = 0; i < 120; i++) {
                            vec3 p = ro + rd * t;
                            res = map(p, t_eff);
                            
                            // Accumulate glowing mycelial filaments
                            if (res.y == 2.0) {
                                float dist = abs(res.x);
                                vec3 mColor = mix(vec3(0.0, 1.0, 1.0), vec3(1.0, 0.0, 0.8), sin(p.z * 3.0 - t_eff * 4.0) * 0.5 + 0.5);
                                mColor = mix(mColor, vec3(0.8, 1.0, 0.0), sin(p.x * 4.0 + t_eff * 6.0) * 0.5 + 0.5);
                                glow += mColor * 0.025 / (0.02 + dist * 40.0); 
                            }
                            
                            if(res.x < 0.002 || t > max_t) break;
                            t += res.x * 0.8;
                        }
                        
                        vec3 col = vec3(0.0);
                        
                        // Surface hit
                        if(t < max_t && res.y < 2.0) {
                            vec3 p = ro + rd * t;
                            vec3 n = calcNormal(p, t_eff);
                            vec3 v = -rd;
                            
                            float tileState = res.y - 1.0;
                            float thickness = 0.5 + 0.5 * sin(p.x * 15.0) * cos(p.y * 15.0);
                            
                            // Birefringence: Michel-Levy Interference Colors
                            float retardance = (thickness + tileState) * 3500.0 * (1.0 + 0.5 * dot(n, v));
                            vec3 I = vec3(
                                pow(sin(3.1415 * retardance / 650.0), 2.0),
                                pow(sin(3.1415 * retardance / 550.0), 2.0),
                                pow(sin(3.1415 * retardance / 450.0), 2.0)
                            );
                            I = smoothstep(0.1, 0.9, I);
                            I *= vec3(1.3, 0.9, 1.6); // Candy-acid tint
                            
                            // Specular & Fresnel
                            vec3 l = normalize(vec3(sin(t_eff), 1.0, cos(t_eff)));
                            vec3 h = normalize(l + v);
                            float spec = pow(max(dot(n, h), 0.0), 64.0);
                            float fresnel = pow(1.0 - max(dot(n, v), 0.0), 4.0);
                            
                            // Chromadepth: Warm colors near, cool colors far
                            float z = clamp(t / max_t, 0.0, 1.0);
                            vec3 chromaDepth = mix(vec3(1.0, 0.2, 0.0), vec3(0.0, 0.4, 1.0), z);
                            
                            col = (I * chromaDepth * 1.5) + spec * vec3(1.0, 0.9, 0.8) + fresnel * vec3(0.0, 1.0, 1.0);
                            col += I * 0.15; // Base ambient
                            
                            // Chromatic Aberration at object edges
                            float edge = 1.0 - abs(dot(n, v));
                            vec3 ca = vec3(n.x, n.y, -n.x) * edge * 1.5;
                            col += max(ca, 0.0) * vec3(1.0, 0.0, 0.6);
                        }
                        
                        // Add accumulated volumetric mycelium
                        col += glow;
                        
                        // Depth fog
                        float fog = exp(-t * 0.12);
                        col = mix(vec3(0.02, 0.0, 0.05), col, fog);
                        
                        // VHS Scanlines and Color Bleed
                        float scanline = sin(vUv.y * u_resolution.y * 3.1415) * 0.05;
                        col -= scanline;
                        col.r *= 1.0 + sin(vUv.y * 20.0 + u_time * 10.0) * 0.05;
                        col.b *= 1.0 + cos(vUv.y * 25.0 - u_time * 12.0) * 0.05;
                        
                        fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
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
        if (material.uniforms.u_resolution) {
            material.uniforms.u_resolution.value.set(grid.width, grid.height);
        }
    }

    renderer.setSize(grid.width, grid.height, false);
    renderer.render(scene, camera);
}