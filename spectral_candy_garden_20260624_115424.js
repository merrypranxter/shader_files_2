if (!canvas.__glState) {
    try {
        if (!(ctx instanceof WebGL2RenderingContext)) throw new Error("WebGL2 is required for Spectral Candy Avalanche Garden.");
        
        ctx.getExtension('EXT_color_buffer_float');
        ctx.getExtension('OES_texture_float_linear');

        const compile = (type, src) => {
            const s = ctx.createShader(type);
            ctx.shaderSource(s, src);
            ctx.compileShader(s);
            if (!ctx.getShaderParameter(s, ctx.COMPILE_STATUS)) {
                console.error(ctx.getShaderInfoLog(s));
            }
            return s;
        };

        const createProg = (vs, fs) => {
            const p = ctx.createProgram();
            ctx.attachShader(p, compile(ctx.VERTEX_SHADER, vs));
            ctx.attachShader(p, compile(ctx.FRAGMENT_SHADER, fs));
            ctx.linkProgram(p);
            return p;
        };

        const createFBO = (w, h, intFmt, fmt, type, filter) => {
            const tex = ctx.createTexture();
            ctx.bindTexture(ctx.TEXTURE_2D, tex);
            ctx.texImage2D(ctx.TEXTURE_2D, 0, intFmt, w, h, 0, fmt, type, null);
            ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, filter);
            ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, filter);
            ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
            ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
            const fbo = ctx.createFramebuffer();
            ctx.bindFramebuffer(ctx.FRAMEBUFFER, fbo);
            ctx.framebufferTexture2D(ctx.FRAMEBUFFER, ctx.COLOR_ATTACHMENT0, ctx.TEXTURE_2D, tex, 0);
            return { fbo, tex, w, h };
        };

        const createPingPong = (w, h, intFmt, fmt, type, filter) => {
            return {
                read: createFBO(w, h, intFmt, fmt, type, filter),
                write: createFBO(w, h, intFmt, fmt, type, filter),
                swap() { let t = this.read; this.read = this.write; this.write = t; }
            };
        };

        const vs = `#version 300 es
        in vec2 position;
        out vec2 vUv;
        void main() {
            vUv = position * 0.5 + 0.5;
            gl_Position = vec4(position, 0.0, 1.0);
        }`;

        const simFs = `#version 300 es
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D u_state;
        uniform float u_time;
        uniform vec2 u_mouse;
        uniform float u_paint;
        uniform float u_burst;
        uniform float u_reseed;
        uniform vec2 u_res;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

        void main() {
            vec2 texel = 1.0 / u_res;
            float own = texture(u_state, vUv).r;
            float n = texture(u_state, vUv + vec2(0.0, texel.y)).r;
            float s = texture(u_state, vUv - vec2(0.0, texel.y)).r;
            float e = texture(u_state, vUv + vec2(texel.x, 0.0)).r;
            float w = texture(u_state, vUv - vec2(texel.x, 0.0)).r;
            
            // Abelian Sandpile rule
            float topples = floor(own / 4.0);
            float gain = floor(n / 4.0) + floor(s / 4.0) + floor(e / 4.0) + floor(w / 4.0);
            float next = own - 4.0 * topples + gain;
            
            // Auto-injectors
            vec2 drop1 = 0.5 + 0.4 * vec2(cos(u_time*0.7), sin(u_time*0.5));
            vec2 drop2 = 0.5 + 0.3 * vec2(sin(u_time*0.4), cos(u_time*0.9));
            vec2 drop3 = vec2(0.5); // Central constant flow
            
            if (length(vUv - drop1) < 0.02) next += 1.0;
            if (length(vUv - drop2) < 0.02) next += 1.0;
            if (length(vUv - drop3) < 0.01) next += 1.0;
            
            // Interaction
            if (u_burst > 0.0 && length(vUv - u_mouse) < 0.1) next += 15.0;
            if (u_paint > 0.0 && length(vUv - u_mouse) < 0.03) next += 2.0;
            
            // Reseed
            if (u_reseed > 0.5) next = floor(hash(vUv + u_time) * 5.0);
            
            next = min(next, 100.0);
            fragColor = vec4(next, 0.0, 0.0, 1.0);
        }`;

        const renderFs = `#version 300 es
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;

        uniform sampler2D u_sim;
        uniform vec2 u_res;
        uniform float u_time;
        uniform float u_geomantic;
        uniform float u_palette;

        // Thin-film structural color interference
        vec3 thinFilm(float d) {
            float n = 1.45;
            float path = 2.0 * n * d;
            float r = pow(sin(3.14159 * path / 630e-9), 2.0);
            float g = pow(sin(3.14159 * path / 530e-9), 2.0);
            float b = pow(sin(3.14159 * path / 460e-9), 2.0);
            return max(vec3(r, g, b), vec3(0.1, 0.0, 0.2));
        }

        // Procedural palettes mapped via OKLab-like saturation boosting
        vec3 getPalette(float t) {
            t = fract(t);
            vec3 c;
            if (u_palette < 0.5) {
                // Candy Spectral
                vec3 a = vec3(0.5); vec3 b = vec3(0.5); vec3 cv = vec3(1.0); vec3 d = vec3(0.0, 0.33, 0.67);
                c = a + b * cos(6.28318 * (cv * t + d));
                c = mix(c, vec3(1.0, 0.2, 0.8), 0.15);
            } else if (u_palette < 1.5) {
                // Opal Beetle
                c = thinFilm(300e-9 + 500e-9 * t);
            } else if (u_palette < 2.5) {
                // Neon Fruit
                c = 0.5 + 0.5 * cos(6.28318 * (1.0 * t + vec3(0.0, 0.1, 0.2)));
                c = mix(c, vec3(1.0, 0.2, 0.5), 0.3);
            } else {
                // Ultraviolet Aquarium
                c = 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.5, 0.6, 0.7)));
                c = mix(c, vec3(0.0, 1.0, 1.0), 0.3);
            }
            float maxC = max(c.r, max(c.g, c.b));
            float minC = min(c.r, min(c.g, c.b));
            c = (c - minC) / (maxC - minC + 0.001);
            return max(c, 0.15); // Prevent any black/muddy outputs
        }

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

        void main() {
            vec2 gridRes = vec2(64.0, floor(64.0 * (u_res.y / u_res.x)));
            vec2 cellF = vUv * gridRes;
            vec2 cellI = floor(cellF);
            vec2 cellUv = fract(cellF);
            
            vec2 texel = 1.0 / gridRes;
            vec2 smUv = (cellI + 0.5) * texel;
            
            float state = texture(u_sim, smUv).r;
            float n = texture(u_sim, smUv + vec2(0.0, texel.y)).r;
            float s = texture(u_sim, smUv + vec2(0.0, -texel.y)).r;
            float e = texture(u_sim, smUv + vec2(texel.x, 0.0)).r;
            float w = texture(u_sim, smUv + vec2(-texel.x, 0.0)).r;
            
            float h = hash(cellI + floor(u_time * 0.1)); // Slow tile mutation
            
            // Quasicrystal background shimmer
            vec2 p = vUv * 20.0;
            float qc = 0.0;
            for(float i=0.0; i<5.0; i++) {
                float a = i * 3.14159 * 0.2;
                vec2 dir = vec2(cos(a), sin(a));
                qc += cos(dot(p, dir) + u_time);
            }
            qc = qc * 0.2 + 0.5;
            
            float filmThickness = 300e-9 + 400e-9 * (sin(vUv.x * 12.0 + u_time) * cos(vUv.y * 15.0 - u_time) * 0.5 + 0.5) + 150e-9 * qc;
            vec3 bgBase = thinFilm(filmThickness);
            vec3 grad = getPalette(vUv.x * 0.5 - vUv.y * 0.3 + u_time * 0.1);
            vec3 bg = mix(bgBase, grad, 0.6);
            
            // WFC Entropy calculation
            float entropy = mod(state + n + s + e + w, 4.0);
            float tileType = floor(mod(h * 10.0 + entropy, 4.0)); // Collapse
            
            // Truchet / Circuit arcs
            float dist = 1.0;
            if (tileType == 0.0) {
                dist = abs(min(length(cellUv - vec2(0.0, 0.0)) - 0.5, length(cellUv - vec2(1.0, 1.0)) - 0.5));
            } else if (tileType == 1.0) {
                dist = abs(min(length(cellUv - vec2(1.0, 0.0)) - 0.5, length(cellUv - vec2(0.0, 1.0)) - 0.5));
            } else if (tileType == 2.0) {
                dist = abs(cellUv.x - 0.5);
            } else {
                dist = abs(cellUv.y - 0.5);
            }
            
            float line = smoothstep(0.15, 0.08, dist);
            float flow = fract(dist * 6.0 - u_time * 3.0);
            float energy = smoothstep(0.5, 0.0, flow) * line;
            
            // Geomantic Dot Glyphs (4-bit encoding)
            float geoFig = floor(mod(state * 11.0 + h * 17.0, 16.0));
            float geoDot = 0.0;
            if (u_geomantic > 0.5) {
                float lineIdx = floor(cellUv.y * 4.0);
                float bit = mod(floor(geoFig / pow(2.0, 3.0 - lineIdx)), 2.0);
                float cy = (lineIdx + 0.5) / 4.0;
                if (bit < 0.5) {
                    geoDot += smoothstep(0.12, 0.08, length(cellUv - vec2(0.5, cy))); // Active
                } else {
                    geoDot += smoothstep(0.12, 0.08, length(cellUv - vec2(0.3, cy))); // Passive
                    geoDot += smoothstep(0.12, 0.08, length(cellUv - vec2(0.7, cy)));
                }
            }
            
            // Golden angle hue shifting
            float goldenHue = fract(state * 0.381966);
            vec3 cellColor = getPalette(goldenHue + u_time * 0.05);
            
            vec3 outColor = bg * 0.5;
            
            // Entropy heatmap underlay
            vec3 heat = vec3(0.05, 0.0, 0.1) + vec3(0.8, 0.2, 0.5) * (entropy / 4.0);
            outColor += heat * 0.3 * (1.0 - line) * (1.0 - geoDot);
            
            // Composite tiles and glyphs
            outColor = mix(outColor, cellColor, line * 0.85);
            outColor += cellColor * energy * 2.0; // Glow
            
            vec3 dotColor = getPalette(goldenHue + 0.5); // Complement
            outColor = mix(outColor, dotColor, geoDot);
            
            // Avalanche flash
            if (state >= 4.0) {
                outColor += vec3(1.0, 0.9, 0.5) * 0.8; 
            }
            
            outColor = max(outColor, vec3(0.1, 0.0, 0.2));
            fragColor = vec4(outColor, 1.0);
        }`;

        const persistFs = `#version 300 es
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D u_render;
        uniform sampler2D u_prev;

        void main() {
            vec3 paint = texture(u_render, vUv).rgb;
            vec3 adapt = texture(u_prev, vUv).rgb;
            adapt += 1.6 * paint * 0.05; // Bleach retina
            adapt *= 0.98; // Relax
            adapt = min(adapt, vec3(1.0));
            fragColor = vec4(adapt, 1.0);
        }`;

        const displayFs = `#version 300 es
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D u_render;
        uniform sampler2D u_adapt;
        uniform vec2 u_res;
        uniform float u_crt;
        uniform float u_time;

        vec2 barrel(vec2 uv, float k) {
            vec2 c = uv - 0.5;
            float r2 = dot(c, c);
            return c * (1.0 + k * r2 + k * 0.15 * r2 * r2) + 0.5;
        }

        void main() {
            vec2 uv = u_crt > 0.5 ? barrel(vUv, 0.1) : vUv;
            if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                fragColor = vec4(0.05, 0.0, 0.15, 1.0);
                return;
            }
            
            // RGB Convergence Error
            vec2 dir = (uv - 0.5) * 0.015 * u_crt;
            vec3 paint;
            paint.r = texture(u_render, uv + dir).r;
            paint.g = texture(u_render, uv).g;
            paint.b = texture(u_render, uv - dir).b;
            
            vec3 adapt = texture(u_adapt, uv).rgb;
            
            // Afterimage math
            vec3 complement = vec3(1.0) - adapt;
            float adaptStrength = max(max(adapt.r, adapt.g), adapt.b);
            float paintCoverage = max(max(paint.r, paint.g), paint.b);
            
            complement = mix(complement, vec3(0.0, 1.0, 1.0), adaptStrength * 0.2); // Avoid muddy ghosts
            vec3 ghost = complement * adaptStrength * (1.0 - paintCoverage);
            
            vec3 finalColor = paint + ghost * 0.8;
            
            // CRT Display layer
            if (u_crt > 0.5) {
                float col = mod(gl_FragCoord.x, 3.0);
                vec3 stripe = vec3(
                    smoothstep(1.0, 0.0, abs(col - 0.5)),
                    smoothstep(1.0, 0.0, abs(col - 1.5)),
                    smoothstep(1.0, 0.0, abs(col - 2.5))
                );
                stripe = mix(vec3(1.0), stripe, 0.5);
                
                float scan = 0.5 + 0.5 * sin(uv.y * u_res.y * 3.14159);
                finalColor *= 1.0 - 0.15 * (1.0 - scan);
                finalColor *= stripe;
            }
            
            // Bloom halation
            vec3 bloom = max(finalColor - 0.6, 0.0);
            finalColor += bloom * 0.5;
            
            // Soft-knee tone mapping
            finalColor = finalColor / (1.0 + finalColor * 0.2); 
            
            fragColor = vec4(finalColor, 1.0);
        }`;

        const simProg = createProg(vs, simFs);
        const renderProg = createProg(vs, renderFs);
        const persistProg = createProg(vs, persistFs);
        const displayProg = createProg(vs, displayFs);

        const quad = ctx.createBuffer();
        ctx.bindBuffer(ctx.ARRAY_BUFFER, quad);
        ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), ctx.STATIC_DRAW);

        const gridW = 64;
        const gridH = Math.floor(64 * (grid.height / grid.width));
        
        const simPP = createPingPong(gridW, gridH, ctx.RGBA16F, ctx.RGBA, ctx.HALF_FLOAT, ctx.NEAREST);
        const renderFBO = createFBO(grid.width, grid.height, ctx.RGBA16F, ctx.RGBA, ctx.HALF_FLOAT, ctx.LINEAR);
        const persistPP = createPingPong(grid.width, grid.height, ctx.RGBA16F, ctx.RGBA, ctx.HALF_FLOAT, ctx.LINEAR);

        canvas.__glState = {
            simProg, renderProg, persistProg, displayProg,
            quad, simPP, renderFBO, persistPP,
            reseed: 1.0,
            geomantic: 1.0,
            palette: 0.0,
            crt: 1.0,
            lastClick: false,
            lastReseedTime: 0,
            gridW, gridH
        };

        // UI Controls
        window.addEventListener('keydown', (e) => {
            const s = canvas.__glState;
            if(e.code === 'Space') s.reseed = 1.0;
            if(e.key === 'c' || e.key === 'C') s.palette = (s.palette + 1.0) % 4.0;
            if(e.key === 'g' || e.key === 'G') s.geomantic = 1.0 - s.geomantic;
            if(e.key === 'p' || e.key === 'P') s.crt = 1.0 - s.crt;
        });

    } catch (e) {
        console.error("WebGL Initialization Failed:", e);
        return;
    }
}

const state = canvas.__glState;
if (!state) return;
const gl = ctx;

// Auto-reseed mechanism every ~18 seconds
if (Math.floor(time) % 18 === 0 && Math.floor(time) > state.lastReseedTime) {
    state.reseed = 1.0;
    state.lastReseedTime = Math.floor(time);
}

let burst = 0.0;
if (mouse.isPressed && !state.lastClick) burst = 1.0;
state.lastClick = mouse.isPressed;

gl.bindBuffer(gl.ARRAY_BUFFER, state.quad);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

// 1. Sim Pass (Sandpile Avalanches)
gl.useProgram(state.simProg);
gl.bindFramebuffer(gl.FRAMEBUFFER, state.simPP.write.fbo);
gl.viewport(0, 0, state.gridW, state.gridH);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, state.simPP.read.tex);
gl.uniform1i(gl.getUniformLocation(state.simProg, "u_state"), 0);
gl.uniform2f(gl.getUniformLocation(state.simProg, "u_res"), state.gridW, state.gridH);
gl.uniform1f(gl.getUniformLocation(state.simProg, "u_time"), time);
gl.uniform2f(gl.getUniformLocation(state.simProg, "u_mouse"), mouse.x / grid.width, 1.0 - mouse.y / grid.height);
gl.uniform1f(gl.getUniformLocation(state.simProg, "u_paint"), mouse.isPressed ? 1.0 : 0.0);
gl.uniform1f(gl.getUniformLocation(state.simProg, "u_burst"), burst);
gl.uniform1f(gl.getUniformLocation(state.simProg, "u_reseed"), state.reseed);
gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
state.simPP.swap();
state.reseed = 0.0;

// 2. Render Pass (Geometry + Structural Color)
gl.useProgram(state.renderProg);
gl.bindFramebuffer(gl.FRAMEBUFFER, state.renderFBO.fbo);
gl.viewport(0, 0, grid.width, grid.height);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, state.simPP.read.tex);
gl.uniform1i(gl.getUniformLocation(state.renderProg, "u_sim"), 0);
gl.uniform2f(gl.getUniformLocation(state.renderProg, "u_res"), grid.width, grid.height);
gl.uniform1f(gl.getUniformLocation(state.renderProg, "u_time"), time);
gl.uniform1f(gl.getUniformLocation(state.renderProg, "u_geomantic"), state.geomantic);
gl.uniform1f(gl.getUniformLocation(state.renderProg, "u_palette"), state.palette);
gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

// 3. Persist Pass (Afterimage Adaptation)
gl.useProgram(state.persistProg);
gl.bindFramebuffer(gl.FRAMEBUFFER, state.persistPP.write.fbo);
gl.viewport(0, 0, grid.width, grid.height);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, state.renderFBO.tex);
gl.uniform1i(gl.getUniformLocation(state.persistProg, "u_render"), 0);
gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, state.persistPP.read.tex);
gl.uniform1i(gl.getUniformLocation(state.persistProg, "u_prev"), 1);
gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
state.persistPP.swap();

// 4. Display Pass (CRT + Bloom + Composite)
gl.useProgram(state.displayProg);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
gl.viewport(0, 0, grid.width, grid.height);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, state.renderFBO.tex);
gl.uniform1i(gl.getUniformLocation(state.displayProg, "u_render"), 0);
gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, state.persistPP.read.tex);
gl.uniform1i(gl.getUniformLocation(state.displayProg, "u_adapt"), 1);
gl.uniform2f(gl.getUniformLocation(state.displayProg, "u_res"), grid.width, grid.height);
gl.uniform1f(gl.getUniformLocation(state.displayProg, "u_crt"), state.crt);
gl.uniform1f(gl.getUniformLocation(state.displayProg, "u_time"), time);
gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);