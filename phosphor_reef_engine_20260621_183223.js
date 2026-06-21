(function() {
    const isWebGL = (ctx && (typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext));
    
    if (isWebGL) {
        if (!canvas.__three) {
            try {
                const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
                const scene = new THREE.Scene();
                const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                
                const geometry = new THREE.PlaneGeometry(2, 2);
                const material = new THREE.ShaderMaterial({
                    glslVersion: THREE.GLSL3,
                    uniforms: {
                        u_time: { value: 0 },
                        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
                        u_intensity: { value: 0.85 },
                        u_mouse: { value: new THREE.Vector2(0.5, 0.5) }
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
                        in vec2 vUv;
                        out vec4 fragColor;
                        
                        uniform float u_time;
                        uniform vec2 u_resolution;
                        uniform float u_intensity;
                        uniform vec2 u_mouse;
                        
                        float hash(vec2 p) {
                            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                        }
                        
                        vec2 hash2(vec2 p) {
                            return vec2(hash(p), hash(p + vec2(1.1, 2.3)));
                        }
                        
                        float noise(vec2 p) {
                            vec2 i = floor(p);
                            vec2 f = fract(p);
                            f = f * f * (3.0 - 2.0 * f);
                            return mix(
                                mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                                mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
                                f.y
                            );
                        }
                        
                        float fbm(vec2 p) {
                            float v = 0.0;
                            float a = 0.5;
                            for (int i = 0; i < 4; i++) {
                                v += a * noise(p);
                                p *= 2.0;
                                a *= 0.5;
                            }
                            return v;
                        }
                        
                        vec3 getPlasma(vec2 uv, float t) {
                            vec2 p = uv - 0.5;
                            float r = length(p);
                            float theta = atan(p.y, p.x);
                            
                            vec2 polar = vec2(1.0 / (r + 0.01) + t * 1.5, theta);
                            
                            float v1 = sin(polar.x + t);
                            float v2 = sin(6.0 * (polar.y - t * 0.3));
                            float v3 = sin(4.0 * polar.x + 4.0 * polar.y + t);
                            float cx = polar.x + sin(t * 0.4);
                            float cy = polar.y + cos(t * 0.3);
                            float v4 = sin(sqrt(cx * cx + cy * cy + 1.0) - t);
                            float plasmaVal = (v1 + v2 + v3 + v4) * 0.25;
                            
                            vec3 colA = vec3(0.05, 0.01, 0.18); 
                            vec3 colB = vec3(0.0, 0.95, 0.85);  
                            vec3 colC = vec3(0.95, 0.05, 0.6);  
                            vec3 colD = vec3(0.8, 0.95, 0.05);  
                            
                            vec3 col = mix(colA, colB, sin(plasmaVal * 3.1415) * 0.5 + 0.5);
                            col = mix(col, colC, cos(plasmaVal * 6.283) * 0.5 + 0.5);
                            col = mix(col, colD, step(0.85, sin(plasmaVal * 10.0)) * 0.4);
                            
                            return col;
                        }
                        
                        vec3 drawChromatophores(vec2 uv, vec3 baseColor, float t) {
                            vec2 g = uv * 35.0;
                            vec2 ip = floor(g);
                            vec2 fp = fract(g);
                            float min_d = 1.0;
                            vec2 closest_cell = vec2(0.0);
                            for (int y = -1; y <= 1; y++) {
                                for (int x = -1; x <= 1; x++) {
                                    vec2 neighbor = vec2(float(x), float(y));
                                    vec2 cell_id = ip + neighbor;
                                    vec2 jitter = hash2(cell_id) * 0.4;
                                    vec2 pos = neighbor + 0.5 + jitter;
                                    float d = length(pos - fp);
                                    if (d < min_d) {
                                        min_d = d;
                                        closest_cell = cell_id;
                                    }
                                }
                            }
                            float wave = sin(closest_cell.x * 0.3 + closest_cell.y * 0.4 - t * 3.5) * 0.5 + 0.5;
                            float p_class = hash(closest_cell);
                            vec3 pigment = vec3(0.0);
                            if (p_class < 0.35) {
                                pigment = vec3(0.91, 0.72, 0.29); 
                            } else if (p_class < 0.7) {
                                pigment = vec3(0.71, 0.31, 0.16); 
                            } else {
                                pigment = vec3(0.16, 0.10, 0.07); 
                            }
                            float r = 0.12 * (1.0 + 1.24 * wave);
                            float mask = smoothstep(r, r - 0.04, min_d);
                            return mix(baseColor, pigment, mask * 0.8);
                        }
                        
                        vec3 applyHalftone(vec2 uv, vec3 color) {
                            vec2 grid = uv * 75.0;
                            vec2 f = fract(grid) - 0.5;
                            float l = dot(color, vec3(0.299, 0.587, 0.114));
                            float r = l * 0.55;
                            float dotMask = smoothstep(r, r - 0.04, length(f));
                            vec3 dotColor = mix(vec3(0.1, 0.02, 0.22), vec3(0.85, 0.9, 0.15), l);
                            return mix(color, dotColor, dotMask * 0.3);
                        }
                        
                        vec3 addFlares(vec2 uv, vec3 color, float t) {
                            float flare1 = exp(-pow(uv.y - 0.5 - 0.08 * sin(t + uv.x * 3.0), 2.0) * 4000.0);
                            float flare2 = exp(-pow(uv.x - 0.5 - 0.08 * cos(t + uv.y * 3.0), 2.0) * 4000.0);
                            vec3 spectrum1 = vec3(sin(t + uv.x * 6.0) * 0.5 + 0.5, sin(t + uv.x * 6.0 + 2.0) * 0.5 + 0.5, sin(t + uv.x * 6.0 + 4.0) * 0.5 + 0.5);
                            vec3 spectrum2 = vec3(sin(t + uv.y * 6.0) * 0.5 + 0.5, sin(t + uv.y * 6.0 + 2.0) * 0.5 + 0.5, sin(t + uv.y * 6.0 + 4.0) * 0.5 + 0.5);
                            color += flare1 * spectrum1 * 0.75 * u_intensity;
                            color += flare2 * spectrum2 * 0.35 * u_intensity;
                            return color;
                        }
                        
                        vec2 datamoshUV(vec2 uv, float t) {
                            vec2 block = floor(uv * 16.0) / 16.0;
                            float h = hash(block + floor(t * 2.5));
                            vec2 offset = vec2(0.0);
                            if (h > 0.88) {
                                offset.x = sin(block.y * 15.0 + t) * 0.06 * u_intensity;
                                offset.y = cos(block.x * 15.0 + t) * 0.02 * u_intensity;
                            }
                            return uv + offset;
                        }
                        
                        vec3 renderScene(vec2 uv, float t) {
                            vec2 moshUV = datamoshUV(uv, t);
                            vec3 color = getPlasma(moshUV, t);
                            color = drawChromatophores(moshUV, color, t);
                            color = applyHalftone(moshUV, color);
                            color = addFlares(moshUV, color, t);
                            return color;
                        }
                        
                        void main() {
                            vec2 uv = vUv;
                            vec2 center = vec2(0.5);
                            vec2 delta = uv - center;
                            vec2 rOffset = delta * (0.012 * u_intensity);
                            
                            float r = renderScene(uv + rOffset, u_time).r;
                            float g = renderScene(uv, u_time).g;
                            float b = renderScene(uv - rOffset, u_time).b;
                            vec3 color = vec3(r, g, b);
                            
                            float scanline = 0.55 + 0.45 * sin(uv.y * u_resolution.y * 3.14159);
                            color *= mix(1.0, scanline, 0.25 * u_intensity);
                            
                            float colIndex = mod(gl_FragCoord.x, 3.0);
                            vec3 stripe = vec3(
                                smoothstep(1.0, 0.0, abs(colIndex - 0.5)),
                                smoothstep(1.0, 0.0, abs(colIndex - 1.5)),
                                smoothstep(1.0, 0.0, abs(colIndex - 2.5))
                            );
                            color *= mix(vec3(1.0), stripe, 0.2 * u_intensity);
                            
                            float barPos = fract(u_time * 0.15);
                            float bar = exp(-pow(uv.y - barPos, 2.0) / 0.004);
                            color *= 1.0 + 0.12 * bar * u_intensity;
                            
                            float luma = dot(color, vec3(0.299, 0.587, 0.114));
                            vec3 darkSafety = vec3(0.06, 0.01, 0.15); 
                            vec3 lightSafety = vec3(0.95, 0.88, 1.0);  
                            color = mix(darkSafety, color, smoothstep(0.0, 0.12, luma));
                            color = mix(color, lightSafety, smoothstep(0.88, 1.0, luma));
                            
                            fragColor = vec4(color, 1.0);
                        }
                    `
                });
                const mesh = new THREE.Mesh(geometry, material);
                scene.add(mesh);
                canvas.__three = { renderer, scene, camera, material };
            } catch (e) {
                console.error("Three.js init failed, falling back to 2D:", e);
                canvas.__three = null;
            }
        }
        
        if (canvas.__three) {
            const { renderer, scene, camera, material } = canvas.__three;
            if (material && material.uniforms) {
                material.uniforms.u_time.value = time;
                material.uniforms.u_resolution.value.set(grid.width, grid.height);
                material.uniforms.u_intensity.value = 0.85 + 0.15 * Math.sin(time * 0.4);
                material.uniforms.u_mouse.value.set(mouse.x / grid.width, 1.0 - mouse.y / grid.height);
            }
            renderer.setSize(grid.width, grid.height, false);
            renderer.render(scene, camera);
            return;
        }
    }
    
    // ─── 2D Canvas Fallback ───────────────────────────────────────────────
    ctx.fillStyle = '#0a0218';
    ctx.fillRect(0, 0, grid.width, grid.height);
    
    // Animated background plasma lines
    ctx.save();
    ctx.globalCompositeBlend = 'screen';
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(255, 0, 128, 0.3)' : 'rgba(0, 255, 200, 0.3)';
        ctx.lineWidth = 15 + 10 * Math.sin(time + i);
        const yOffset = grid.height * 0.1 * Math.sin(time * 0.5 + i);
        ctx.moveTo(0, grid.height * 0.5 + yOffset);
        ctx.bezierCurveTo(
            grid.width * 0.25, grid.height * 0.2 + yOffset,
            grid.width * 0.75, grid.height * 0.8 - yOffset,
            grid.width, grid.height * 0.5 - yOffset
        );
        ctx.stroke();
    }
    ctx.restore();
    
    // Draw rotating oldskool demoscene polygons
    ctx.save();
    ctx.translate(grid.width / 2, grid.height / 2);
    ctx.rotate(time * 0.2);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    const sides = 6;
    const radius = 100 + 40 * Math.sin(time * 2.0);
    for (let j = 0; j <= sides; j++) {
        const angle = (j / sides) * Math.PI * 2;
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    
    // Draw chromatophores (expanding pigment spots)
    const cols = 8;
    const rows = 8;
    const cellW = grid.width / cols;
    const cellH = grid.height / rows;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cx = c * cellW + cellW / 2 + 10 * Math.sin(time + r);
            const cy = r * cellH + cellH / 2 + 10 * Math.cos(time + c);
            const act = 0.5 + 0.5 * Math.sin(time * 3 + r * 0.5 + c * 0.5);
            const size = (cellW * 0.15) * (1.0 + 1.2 * act);
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(0, size), 0, Math.PI * 2);
            ctx.fillStyle = (r + c) % 3 === 0 ? '#e8b84b' : ((r + c) % 3 === 1 ? '#b5502a' : '#2a1a12');
            ctx.fill();
        }
    }
    
    // Anamorphic flare line
    ctx.save();
    const grad = ctx.createLinearGradient(0, 0, grid.width, 0);
    grad.addColorStop(0, 'rgba(0, 255, 255, 0)');
    grad.addColorStop(0.5, 'rgba(255, 0, 255, 0.8)');
    grad.addColorStop(1, 'rgba(255, 255, 0, 0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 8 + 4 * Math.sin(time * 10.0);
    ctx.beginPath();
    ctx.moveTo(0, grid.height / 2);
    ctx.lineTo(grid.width, grid.height / 2);
    ctx.stroke();
    ctx.restore();
    
    // Scanlines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    for (let y = 0; y < grid.height; y += 4) {
        ctx.fillRect(0, y, grid.width, 2);
    }
})();