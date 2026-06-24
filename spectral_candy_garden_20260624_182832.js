if (!canvas.__candyGarden) {
    try {
        let gl = ctx;
        if (!(gl instanceof WebGL2RenderingContext)) {
            gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
        }
        if (!gl) throw new Error("WebGL2 required");

        gl.getExtension('EXT_color_buffer_float');
        gl.getExtension('OES_texture_float_linear');

        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(s));
            }
            return s;
        };

        const createProgram = (vsSrc, fsSrc) => {
            const p = gl.createProgram();
            gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
            gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
            gl.linkProgram(p);
            return p;
        };

        const createFBO = (w, h) => {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
            return { fbo, tex, w, h };
        };

        const vs = `#version 300 es
        in vec2 a_pos;
        out vec2 vUv;
        void main() {
            vUv = a_pos * 0.5 + 0.5;
            gl_Position = vec4(a_pos, 0.0, 1.0);
        }`;

        const simFs = `#version 300 es
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D u_state;
        uniform vec2 u_res;
        uniform vec2 u_mouse;
        uniform float u_mouse_down;
        uniform float u_click;
        uniform float u_time;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

        void main() {
            ivec2 px = ivec2(gl_FragCoord.xy);
            vec4 st = texelFetch(u_state, px, 0);
            
            float g = st.r;
            float n = texelFetch(u_state, clamp(px + ivec2(0,1), ivec2(0), ivec2(u_res)-1), 0).r;
            float s = texelFetch(u_state, clamp(px + ivec2(0,-1), ivec2(0), ivec2(u_res)-1), 0).r;
            float e = texelFetch(u_state, clamp(px + ivec2(1,0), ivec2(0), ivec2(u_res)-1), 0).r;
            float w = texelFetch(u_state, clamp(px + ivec2(-1,0), ivec2(0), ivec2(u_res)-1), 0).r;

            float topples = floor(g / 4.0);
            float incoming = floor(n/4.) + floor(s/4.) + floor(e/4.) + floor(w/4.);
            
            // Feral mutation: continuous slow energy injection to force avalanches
            float next_g = g - 4.0 * topples + incoming + 0.005;

            float dist = length(vUv - u_mouse);
            if (u_mouse_down > 0.0 && dist < 0.03) {
                next_g += 2.0 * exp(-dist * 200.0);
            }
            if (u_click > 0.0 && dist < 0.1) {
                next_g += 10.0 * exp(-dist * 50.0);
            }

            // WFC/Geomantic proxy state
            float age = st.a + (topples > 0.0 ? 0.1 : 0.001);
            float wfc = st.g + (incoming > 0.0 ? 0.05 : -0.01);
            wfc = fract(wfc);

            // Occasional reset
            if (hash(vUv + u_time) < 0.0001) next_g += 4.0;

            fragColor = vec4(next_g, wfc, st.b, age);
        }`;

        const renderFs = `#version 300 es
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D u_state;
        uniform vec2 u_res;
        uniform float u_time;
        uniform float u_palette;
        uniform float u_geo;

        vec3 oklab_to_srgb(vec3 c) {
            float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
            float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
            float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
            float l = l_*l_*l_;
            float m = m_*m_*m_;
            float s = s_*s_*s_;
            vec3 rgb = vec3(
                4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
               -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
               -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
            );
            vec3 sq1 = sqrt(clamp(rgb, 0.0, 1.0));
            vec3 w2 = step(0.0031308, rgb);
            return mix(rgb * 12.92, 1.055 * pow(clamp(rgb,0.,1.), vec3(1.0/2.4)) - 0.055, w2);
        }

        vec3 oklch_to_oklab(float L, float C, float h) {
            float hr = h * 3.14159265 / 180.0;
            return vec3(L, C * cos(hr), C * sin(hr));
        }

        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

        void main() {
            vec4 st = texture(u_state, vUv);
            float g = st.r;
            float g_mod = mod(g, 4.0);
            
            // Feral saturated palette (no black/white)
            float hue_base = u_time * 10.0 + u_palette * 72.0;
            vec3 lab;
            if (g_mod < 1.0) lab = oklch_to_oklab(0.45, 0.25, hue_base + 300.0); // Violet/Magenta
            else if (g_mod < 2.0) lab = oklch_to_oklab(0.65, 0.20, hue_base + 200.0); // Cyan
            else if (g_mod < 3.0) lab = oklch_to_oklab(0.80, 0.25, hue_base + 140.0); // Acid Green
            else lab = oklch_to_oklab(0.70, 0.25, hue_base + 40.0); // Orange/Coral
            
            if (g >= 4.0) lab = oklch_to_oklab(0.90, 0.20, hue_base + 90.0); // Toppling glow (Neon Yellow)

            vec3 col = oklab_to_srgb(lab);

            // Pseudo-3D plush/candy normals
            float n = texture(u_state, vUv + vec2(0, 1.0/u_res.y)).r;
            float s = texture(u_state, vUv + vec2(0, -1.0/u_res.y)).r;
            float e = texture(u_state, vUv + vec2(1.0/u_res.x, 0)).r;
            float w = texture(u_state, vUv + vec2(-1.0/u_res.x, 0)).r;
            vec3 norm = normalize(vec3(e - w, n - s, 0.5));
            vec3 light = normalize(vec3(0.5, 0.8, 1.0));
            float spec = pow(max(dot(norm, light), 0.0), 16.0);
            col += spec * 0.6 * vec3(0.8, 1.0, 1.0); // Candy gloss

            // Thin-film interference
            float thickness = 300.0 + st.g * 500.0 + st.a * 20.0;
            vec3 film = vec3(
                pow(sin(3.1415 * thickness / 630.0), 2.0),
                pow(sin(3.1415 * thickness / 530.0), 2.0),
                pow(sin(3.1415 * thickness / 460.0), 2.0)
            );
            col = mix(col, film, 0.35);

            // WFC Truchet & Geomantic Overlay
            vec2 grid_uv = vUv * u_res / 24.0;
            vec2 cell_id = floor(grid_uv);
            vec2 cell_fr = fract(grid_uv);
            float hsh = hash(cell_id + floor(u_time * 0.1));

            // Truchet arcs
            vec2 p = cell_fr;
            if (hsh < 0.5) p.x = 1.0 - p.x;
            float d1 = abs(length(p) - 0.5);
            float d2 = abs(length(p - 1.0) - 0.5);
            float arc = smoothstep(0.15, 0.05, min(d1, d2));
            col = mix(col, vec3(1.0, 0.9, 0.2), arc * 0.6); // Gold traces

            // Geomantic dots
            if (u_geo > 0.0) {
                int fig = int(hsh * 16.0);
                float row = floor(cell_fr.y * 4.0);
                int bit = (fig >> int(row)) & 1;
                float cy = (row + 0.5) / 4.0;
                float dots = 0.0;
                if (bit == 0) {
                    dots += smoothstep(0.12, 0.08, length(cell_fr - vec2(0.5, cy)));
                } else {
                    dots += smoothstep(0.12, 0.08, length(cell_fr - vec2(0.3, cy)));
                    dots += smoothstep(0.12, 0.08, length(cell_fr - vec2(0.7, cy)));
                }
                col = mix(col, vec3(0.0, 1.0, 0.8), dots * u_geo * (0.5 + 0.5*sin(u_time*3.0 + hsh*10.0)));
            }

            fragColor = vec4(col, 1.0);
        }`;

        const afterimageFs = `#version 300 es
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D u_render;
        uniform sampler2D u_prev;
        uniform sampler2D u_state;
        
        void main() {
            vec3 cur = texture(u_render, vUv).rgb;
            vec3 prev = texture(u_prev, vUv).rgb;
            float activity = texture(u_state, vUv).r;
            
            // Opponent complement (naive but vivid)
            vec3 comp = vec3(1.0) - cur;
            
            // Decay
            vec3 ghost = prev * 0.96;
            
            // Inject new afterimage where sandpile is active/toppling
            if (activity >= 4.0) {
                ghost = max(ghost, comp * 0.6);
            }
            
            fragColor = vec4(ghost, 1.0);
        }`;

        const postFs = `#version 300 es
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D u_render;
        uniform sampler2D u_afterimage;
        uniform vec2 u_res;
        uniform float u_crt;
        uniform float u_time;

        void main() {
            vec2 uv = vUv;
            vec2 cc = uv - 0.5;
            float r2 = dot(cc, cc);
            vec2 dist_uv = uv + cc * (r2 * 0.12 * u_crt);

            if (dist_uv.x < 0.0 || dist_uv.x > 1.0 || dist_uv.y < 0.0 || dist_uv.y > 1.0) {
                fragColor = vec4(0.1, 0.0, 0.2, 1.0);
                return;
            }

            // Chromatic Aberration
            float ca = 0.003 + 0.005 * u_crt;
            vec3 col;
            col.r = texture(u_render, dist_uv + vec2(ca, 0.0)).r;
            col.g = texture(u_render, dist_uv).g;
            col.b = texture(u_render, dist_uv - vec2(ca, 0.0)).b;

            // Add Afterimage Trails
            vec3 ghost = texture(u_afterimage, dist_uv).rgb;
            col += ghost * 0.8;

            // CRT Phosphor
            float mask = mod(gl_FragCoord.x, 3.0);
            vec3 phosphor = vec3(
                mask < 1.0 ? 1.0 : 0.4,
                mask >= 1.0 && mask < 2.0 ? 1.0 : 0.4,
                mask >= 2.0 ? 1.0 : 0.4
            );
            col *= mix(vec3(1.0), phosphor, u_crt * 0.8);

            // Scanlines
            col *= mix(1.0, 0.85 + 0.15 * sin(dist_uv.y * u_res.y * 3.1415), u_crt);

            // Vignette (Deep saturated magenta/violet, not black)
            vec3 vigColor = vec3(0.3, 0.0, 0.5);
            col = mix(col, vigColor, r2 * 1.2);

            // Soft Bloom constraint
            col = clamp(col, 0.0, 1.0);

            fragColor = vec4(col, 1.0);
        }`;

        const simP = createProgram(vs, simFs);
        const renderP = createProgram(vs, renderFs);
        const afterP = createProgram(vs, afterimageFs);
        const postP = createProgram(vs, postFs);

        const quadObj = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadObj);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

        const drawQuad = (prog) => {
            gl.useProgram(prog);
            gl.bindBuffer(gl.ARRAY_BUFFER, quadObj);
            const loc = gl.getAttribLocation(prog, 'a_pos');
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };

        const w = Math.floor(grid.width);
        const h = Math.floor(grid.height);

        const simFBOs = [createFBO(w, h), createFBO(w, h)];
        const afterFBOs = [createFBO(w, h), createFBO(w, h)];
        const renderFBO = createFBO(w, h);

        // Seed initial state
        const seedData = new Float32Array(w * h * 4);
        for(let i=0; i<w*h*4; i+=4) {
            seedData[i] = Math.random() * 2.0; // Grains
            seedData[i+1] = Math.random();     // WFC state
            seedData[i+2] = Math.random();     // Geo state
            seedData[i+3] = 0.0;               // Age
        }
        gl.bindTexture(gl.TEXTURE_2D, simFBOs[0].tex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.FLOAT, seedData);

        canvas.__candyGarden = {
            gl, simP, renderP, afterP, postP, drawQuad,
            simFBOs, afterFBOs, renderFBO,
            simIdx: 0, afterIdx: 0,
            palette: 0, geo: 1.0, crt: 1.0,
            click: 0.0,
            keydown: (e) => {
                if(e.key === 'c' || e.key === 'C') canvas.__candyGarden.palette = (canvas.__candyGarden.palette + 1) % 5;
                if(e.key === 'g' || e.key === 'G') canvas.__candyGarden.geo = canvas.__candyGarden.geo > 0.0 ? 0.0 : 1.0;
                if(e.key === 'p' || e.key === 'P') canvas.__candyGarden.crt = canvas.__candyGarden.crt > 0.0 ? 0.0 : 1.0;
                if(e.key === ' ') {
                    gl.bindTexture(gl.TEXTURE_2D, canvas.__candyGarden.simFBOs[canvas.__candyGarden.simIdx].tex);
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.FLOAT, seedData);
                }
            },
            mousedown: () => canvas.__candyGarden.click = 1.0
        };

        window.addEventListener('keydown', canvas.__candyGarden.keydown);
        canvas.addEventListener('mousedown', canvas.__candyGarden.mousedown);
        canvas.addEventListener('touchstart', canvas.__candyGarden.mousedown);

    } catch (e) {
        console.error("Candy Garden Init Failed:", e);
        return;
    }
}

const cg = canvas.__candyGarden;
if (!cg) return;

const gl = cg.gl;

// 1. Simulation Pass
gl.bindFramebuffer(gl.FRAMEBUFFER, cg.simFBOs[1 - cg.simIdx].fbo);
gl.viewport(0, 0, grid.width, grid.height);
gl.useProgram(cg.simP);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, cg.simFBOs[cg.simIdx].tex);
gl.uniform1i(gl.getUniformLocation(cg.simP, 'u_state'), 0);
gl.uniform2f(gl.getUniformLocation(cg.simP, 'u_res'), grid.width, grid.height);
gl.uniform2f(gl.getUniformLocation(cg.simP, 'u_mouse'), mouse.x / grid.width, 1.0 - mouse.y / grid.height);
gl.uniform1f(gl.getUniformLocation(cg.simP, 'u_mouse_down'), mouse.isPressed ? 1.0 : 0.0);
gl.uniform1f(gl.getUniformLocation(cg.simP, 'u_click'), cg.click);
gl.uniform1f(gl.getUniformLocation(cg.simP, 'u_time'), time);
cg.drawQuad(cg.simP);
cg.simIdx = 1 - cg.simIdx;
cg.click = Math.max(0.0, cg.click - 0.1);

// 2. Render Pass
gl.bindFramebuffer(gl.FRAMEBUFFER, cg.renderFBO.fbo);
gl.viewport(0, 0, grid.width, grid.height);
gl.useProgram(cg.renderP);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, cg.simFBOs[cg.simIdx].tex);
gl.uniform1i(gl.getUniformLocation(cg.renderP, 'u_state'), 0);
gl.uniform2f(gl.getUniformLocation(cg.renderP, 'u_res'), grid.width, grid.height);
gl.uniform1f(gl.getUniformLocation(cg.renderP, 'u_time'), time);
gl.uniform1f(gl.getUniformLocation(cg.renderP, 'u_palette'), cg.palette);
gl.uniform1f(gl.getUniformLocation(cg.renderP, 'u_geo'), cg.geo);
cg.drawQuad(cg.renderP);

// 3. Afterimage Pass
gl.bindFramebuffer(gl.FRAMEBUFFER, cg.afterFBOs[1 - cg.afterIdx].fbo);
gl.viewport(0, 0, grid.width, grid.height);
gl.useProgram(cg.afterP);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, cg.renderFBO.tex);
gl.uniform1i(gl.getUniformLocation(cg.afterP, 'u_render'), 0);
gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, cg.afterFBOs[cg.afterIdx].tex);
gl.uniform1i(gl.getUniformLocation(cg.afterP, 'u_prev'), 1);
gl.activeTexture(gl.TEXTURE2);
gl.bindTexture(gl.TEXTURE_2D, cg.simFBOs[cg.simIdx].tex);
gl.uniform1i(gl.getUniformLocation(cg.afterP, 'u_state'), 2);
cg.drawQuad(cg.afterP);
cg.afterIdx = 1 - cg.afterIdx;

// 4. Post Pass to Screen
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
gl.viewport(0, 0, grid.width, grid.height);
gl.useProgram(cg.postP);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, cg.renderFBO.tex);
gl.uniform1i(gl.getUniformLocation(cg.postP, 'u_render'), 0);
gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, cg.afterFBOs[cg.afterIdx].tex);
gl.uniform1i(gl.getUniformLocation(cg.postP, 'u_afterimage'), 1);
gl.uniform2f(gl.getUniformLocation(cg.postP, 'u_res'), grid.width, grid.height);
gl.uniform1f(gl.getUniformLocation(cg.postP, 'u_crt'), cg.crt);
gl.uniform1f(gl.getUniformLocation(cg.postP, 'u_time'), time);
cg.drawQuad(cg.postP);