const isWebGL = ctx && (ctx.getParameter || ctx.drawArrays);

if (isWebGL && typeof THREE !== 'undefined') {
    if (!canvas.__three) {
        try {
            const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
            const scene = new THREE.Scene();
            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            
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
                    in vec2 vUv;
                    out vec4 fragColor;
                    
                    uniform float u_time;
                    uniform vec2 u_resolution;

                    #define MAGENTA vec3(1.0, 0.0, 0.5)
                    #define CYAN vec3(0.0, 1.0, 1.0)
                    #define LIME vec3(0.7, 1.0, 0.0)
                    #define BLACK vec3(0.05, 0.02, 0.05)
                    #define WHITE vec3(0.95, 0.98, 1.0)

                    float hash(vec2 p) {
                        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                    }
                    
                    float hash1(float n) { 
                        return fract(sin(n)*43758.5453); 
                    }

                    mat2 rot(float a) {
                        float s = sin(a), c = cos(a);
                        return mat2(c, -s, s, c);
                    }

                    float sdHeart(vec2 p) {
                        p.x = abs(p.x);
                        if (p.y + p.x > 1.0) return sqrt(dot(p-vec2(0.25,0.75), p-vec2(0.25,0.75))) - sqrt(2.0)/4.0;
                        return sqrt(min(dot(p-vec2(0.00,1.00), p-vec2(0.00,1.00)), dot(p-0.5*max(p.x+p.y,0.0), p-0.5*max(p.x+p.y,0.0)))) * sign(p.x-p.y);
                    }

                    float sparkle(vec2 p) {
                        float d = length(p);
                        float cross = exp(-abs(p.x)*40.0) + exp(-abs(p.y)*40.0);
                        float core = exp(-d*20.0);
                        return (cross + core) * smoothstep(0.5, 0.0, d);
                    }

                    float opTunnel(vec2 p, float offset) {
                        float r = length(p);
                        float a = atan(p.y, p.x);
                        
                        a += sin(r * 5.0 - u_time * 2.0) * 0.5;
                        vec2 st = vec2(log(r)*6.0 - u_time*4.0 + offset, a * 8.0);
                        
                        float checker = sin(st.x) * cos(st.y);
                        checker += sin(r * 30.0 - u_time * 15.0) * 0.2; 
                        
                        return smoothstep(-0.1, 0.1, checker);
                    }

                    void main() {
                        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
                        vec2 raw_uv = vUv;
                        float t = u_time;

                        // 1. MACROBLOCK COMPRESSION CHEW
                        vec2 block_uv = floor(uv * 24.0) / 24.0;
                        float is_glitch = step(0.92, hash(block_uv + floor(t * 12.0)));
                        vec2 p = mix(uv, uv + vec2(sin(t*20.0)*0.1, cos(t*15.0)*0.1), is_glitch);
                        
                        // 2. HORIZONTAL TEARING
                        float tear = step(0.98, hash(vec2(floor(raw_uv.y * 50.0), floor(t * 15.0))));
                        p.x += tear * (hash1(t) - 0.5) * 0.4;

                        // 3. OP-ART TUNNEL (RGB SPLIT)
                        float tR = opTunnel(p, 0.0);
                        float tG = opTunnel(p * 1.05, 0.1);
                        float tB = opTunnel(p * 1.1, 0.2);
                        
                        vec3 col = BLACK;
                        col = mix(col, MAGENTA, tR);
                        col = mix(col, CYAN, tG * 0.6);
                        col = mix(col, LIME, tB * 0.4);

                        // 4. TEMPORAL ECHO STICKERS (Hearts)
                        for(int i=0; i<6; i++) {
                            float fi = float(i);
                            
                            // Ghost Frame (Temporal Echo)
                            vec2 hp_old = uv;
                            hp_old.x += sin((t-0.15) * 0.8 + fi * 2.1) * 0.8;
                            hp_old.y += fract((t-0.15) * 0.4 + fi * 0.3) * 2.5 - 1.25;
                            hp_old *= rot((t-0.15) * 1.5 + fi);
                            hp_old *= 4.0 + sin((t-0.15) + fi)*1.0;
                            hp_old.y = -hp_old.y + 0.5;
                            float d_old = sdHeart(hp_old);
                            float fill_old = 1.0 - smoothstep(0.0, 0.03, d_old);
                            col = mix(col, CYAN * 0.6, fill_old * 0.6);

                            // Present Frame
                            vec2 hp = uv;
                            hp.x += sin(t * 0.8 + fi * 2.1) * 0.8;
                            hp.y += fract(t * 0.4 + fi * 0.3) * 2.5 - 1.25;
                            hp *= rot(t * 1.5 + fi);
                            hp *= 4.0 + sin(t + fi)*1.0;
                            hp.y = -hp.y + 0.5;
                            hp.x += step(0.95, hash1(fi+t))*0.2; // Stutter

                            float d = sdHeart(hp);
                            float fill = 1.0 - smoothstep(0.0, 0.03, d);
                            float outline = 1.0 - smoothstep(0.0, 0.03, abs(d) - 0.08);
                            float shadow = 1.0 - smoothstep(0.0, 0.1, d - 0.1);
                            
                            vec3 hCol = mod(fi, 2.0) == 0.0 ? MAGENTA : CYAN;
                            if (mod(fi, 3.0) == 0.0) hCol = LIME;
                            
                            col = mix(col, BLACK, shadow * 0.5);
                            col = mix(col, WHITE, outline);
                            col = mix(col, hCol, fill);
                            
                            float high = smoothstep(0.05, 0.0, length(hp - vec2(-0.2, 0.2)));
                            col = mix(col, WHITE, high * fill);
                        }

                        // 5. GLITTER SIGNAL OVERPRINT
                        float glitter_band = step(0.8, sin(uv.y * 10.0 + uv.x * 5.0 - t * 3.0));
                        float raw_glitter = hash(uv * 300.0 + t);
                        vec3 glitter_col = mix(MAGENTA, CYAN, hash1(floor(uv.x*50.0)));
                        col += glitter_band * step(0.8, raw_glitter) * glitter_col * 2.0;

                        float static_glitter = step(0.99, hash(uv * 150.0 + t)) * step(0.5, sin(uv.x * 100.0 + t * 20.0));
                        col += static_glitter * WHITE * 1.5;

                        for(int i=0; i<8; i++) {
                            float fi = float(i) * 1.618;
                            vec2 sp = uv;
                            sp.x += sin(fi * 10.0) * 1.2;
                            sp.y += cos(fi * 10.0) * 1.2;
                            sp *= rot(t * 0.5 + fi);
                            
                            float flash = sin(t * 5.0 + fi * 20.0) * 0.5 + 0.5;
                            float s = sparkle(sp * (5.0 + flash * 5.0));
                            
                            vec3 sCol = mix(CYAN, MAGENTA, fract(fi));
                            col += s * sCol * 2.0;
                        }

                        // 6. TEXT / INTERFACE DEBRIS
                        vec2 box_uv = raw_uv - vec2(0.5, 0.3);
                        box_uv.x += sin(t * 0.5) * 0.2;
                        box_uv.y += cos(t * 0.7) * 0.2;
                        box_uv.x += sin(t * 20.0) * 0.05 * is_glitch; 
                        
                        float box = step(abs(box_uv.x), 0.25) * step(abs(box_uv.y), 0.15);
                        float box_shadow = step(abs(box_uv.x - 0.02), 0.25) * step(abs(box_uv.y + 0.02), 0.15);
                        
                        if (box_shadow > 0.5 && box < 0.5) col = mix(col, BLACK, 0.8);
                        if (box > 0.5) {
                            col = vec3(0.8, 0.8, 0.8); 
                            if (box_uv.y > 0.1) col = vec3(0.0, 0.0, 0.6); 
                            
                            if (box_uv.y < 0.08 && abs(box_uv.x) < 0.23 && box_uv.y > -0.13) {
                                col = WHITE;
                                float lines = step(0.5, sin((box_uv.y - t*0.1) * 100.0));
                                float text_mask = step(0.4, hash(vec2(floor(box_uv.x * 30.0), floor(box_uv.y * 30.0))));
                                if (lines * text_mask > 0.5) col = BLACK;
                                
                                if (hash1(floor(t*2.0)) > 0.8 && abs(box_uv.x) < 0.05 && abs(box_uv.y) < 0.05) col = MAGENTA;
                            }
                        }

                        // 7. CRT CONTOUR & CAPTURE DEGRADATION
                        col -= sin(raw_uv.y * u_resolution.y * 2.0) * 0.05;
                        col.r += is_glitch * 0.2;
                        col.b -= is_glitch * 0.2;

                        float vig = length(raw_uv - 0.5);
                        col *= smoothstep(0.8, 0.2, vig);
                        
                        col = smoothstep(0.0, 1.0, col);
                        col = pow(col, vec3(0.9));

                        fragColor = vec4(col, 1.0);
                    }
                `
            });
            
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
            scene.add(mesh);
            
            canvas.__three = { renderer, scene, camera, material };
        } catch (e) {
            console.error("WebGL 2 Init Failed:", e);
        }
    }

    if (canvas.__three) {
        const { renderer, scene, camera, material } = canvas.__three;
        if (material && material.uniforms && material.uniforms.u_time) {
            material.uniforms.u_time.value = time;
            material.uniforms.u_resolution.value.set(grid.width, grid.height);
        }
        renderer.setSize(grid.width, grid.height, false);
        renderer.render(scene, camera);
    }
} else {
    // 2D Canvas Fallback: MySpace Glitchcore
    ctx.fillStyle = '#050205';
    ctx.fillRect(0, 0, grid.width, grid.height);

    const w = grid.width;
    const h = grid.height;
    const cx = w / 2;
    const cy = h / 2;

    // Op Art Background
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(time * 0.5);
    for (let i = 20; i > 0; i--) {
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0, i * 40 + Math.sin(time * 3 + i) * 20), 0, Math.PI * 2);
        ctx.fillStyle = i % 2 === 0 ? '#ff0080' : '#00ffff';
        if (i % 3 === 0) ctx.fillStyle = '#ccff00';
        ctx.fill();
    }
    ctx.restore();

    // Glitch Slicing
    if (Math.random() > 0.8) {
        const sliceY = Math.random() * h;
        const sliceH = Math.random() * 100;
        const offset = (Math.random() - 0.5) * 100;
        ctx.drawImage(canvas, 0, sliceY, w, sliceH, offset, sliceY, w, sliceH);
    }

    // Floating Hearts
    for (let i = 0; i < 8; i++) {
        let hx = (Math.sin(time + i * 2) * 0.4 + 0.5) * w;
        let hy = ((time * 100 + i * 200) % (h + 200)) - 100;
        let scale = 1 + Math.sin(time * 2 + i) * 0.5;
        
        if (Math.random() > 0.95) hx += (Math.random() - 0.5) * 50; // stutter

        ctx.save();
        ctx.translate(hx, h - hy);
        ctx.scale(scale, scale);
        ctx.rotate(Math.sin(time + i) * 0.5);

        ctx.shadowColor = 'black';
        ctx.shadowBlur = 10;
        
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(0, -15, -20, -15, -20, 0);
        ctx.bezierCurveTo(-20, 15, 0, 20, 0, 30);
        ctx.bezierCurveTo(0, 20, 20, 15, 20, 0);
        ctx.bezierCurveTo(20, -15, 0, -15, 0, 0);
        
        ctx.fillStyle = i % 2 === 0 ? '#ff0080' : '#00ffff';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'white';
        ctx.stroke();
        ctx.restore();
    }

    // Fake Windows Dialog
    const bx = cx + Math.sin(time) * 100 - 150;
    const by = cy + Math.cos(time * 0.8) * 100 - 100;
    
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(bx, by, 300, 150);
    
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000080';
    ctx.fillRect(bx + 3, by + 3, 294, 25);
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 16px monospace';
    ctx.fillText("xXx_ERROR_xXx", bx + 10, by + 20);
    
    ctx.fillStyle = 'black';
    for(let i=0; i<4; i++) {
        if (Math.random() > 0.2) {
            ctx.fillRect(bx + 20, by + 50 + i * 20, 200 + Math.sin(time*10+i)*50, 10);
        }
    }

    // Glitter Noise
    for (let i = 0; i < 500; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        if (Math.random() > 0.5) {
            ctx.fillStyle = 'white';
            ctx.fillRect(x, y, 2, 2);
        }
    }
}