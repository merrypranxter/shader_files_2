function runNeonSerpent(ctx, grid, time, repos, input, mouse, canvas, THREE) {
    const gl = ctx;
    if (!gl || !(gl instanceof WebGL2RenderingContext)) {
        console.error("Neon Serpent requires a WebGL2 context.");
        return;
    }

    if (!canvas.__neonSerpentState) {
        // --- WebGL2 Setup & Shaders ---
        const ext = gl.getExtension('EXT_color_buffer_float');
        gl.getExtension('OES_texture_float_linear');

        const compileShader = (type, source) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };

        const createProgram = (vsSrc, fsSrc) => {
            const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
            const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
            const prog = gl.createProgram();
            gl.attachShader(prog, vs);
            gl.attachShader(prog, fs);
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
                console.error(gl.getProgramInfoLog(prog));
            }
            return prog;
        };

        const vsQuad = `#version 300 es
        in vec2 position;
        out vec2 vUv;
        void main() {
            vUv = position * 0.5 + 0.5;
            gl_Position = vec4(position, 0.0, 1.0);
        }`;

        const fsFlow = `#version 300 es
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        
        uniform sampler2D u_prevFlow;
        uniform vec2 u_mouse;
        uniform vec2 u_mouseDir;
        uniform float u_time;
        uniform vec2 u_resolution;

        vec2 curl(vec2 p, float t) {
            float x = sin(p.y * 4.0 + t) + cos(p.y * 1.5 - t * 0.5);
            float y = cos(p.x * 4.0 - t) + sin(p.x * 1.5 + t * 0.5);
            return vec2(x, y);
        }

        void main() {
            vec2 uv = vUv;
            vec2 px = 1.0 / u_resolution;
            
            vec2 vel = texture(u_prevFlow, uv).xy;
            vec2 advectedUV = uv - vel * px * 2.0;
            vec3 flowData = texture(u_prevFlow, advectedUV).xyz;
            
            vec2 flow = flowData.xy;
            float density = flowData.z;

            flow += curl(uv * 3.0, u_time) * 0.005;

            float aspect = u_resolution.x / u_resolution.y;
            float d = length((uv - u_mouse) * vec2(aspect, 1.0));
            float mouseForce = exp(-d * 150.0);
            
            flow += u_mouseDir * mouseForce * 3.0;
            density += mouseForce * length(u_mouseDir) * 15.0;

            flow *= 0.98;
            density *= 0.96;

            fragColor = vec4(flow, density, 1.0);
        }`;

        const fsMain = `#version 300 es
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;

        uniform sampler2D u_flow;
        uniform sampler2D u_prevMain;
        uniform float u_time;
        uniform vec2 u_resolution;

        uniform int u_pal;
        uniform int u_dom;
        uniform int u_fc;
        uniform int u_scale;
        uniform float u_rb;
        uniform float u_aft;

        vec2 hash22(vec2 p) {
            p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
            return fract(sin(p) * 43758.5453123);
        }

        float hash12(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        vec3 getPalette(float t, int idx) {
            vec3 a, b, c, d;
            if (idx == 0) {
                a = vec3(0.6, 0.2, 0.7); b = vec3(0.4, 0.5, 0.3);
                c = vec3(1.0, 1.0, 1.0); d = vec3(0.0, 0.33, 0.67);
            } else if (idx == 1) {
                a = vec3(0.7, 0.4, 0.4); b = vec3(0.3, 0.6, 0.5);
                c = vec3(1.0, 1.0, 0.5); d = vec3(0.8, 0.2, 0.5);
            } else if (idx == 2) {
                a = vec3(0.2, 0.4, 0.8); b = vec3(0.2, 0.5, 0.2);
                c = vec3(1.0, 1.0, 1.0); d = vec3(0.1, 0.5, 0.9);
            } else {
                a = vec3(0.8, 0.6, 0.4); b = vec3(0.2, 0.4, 0.4);
                c = vec3(1.0, 1.0, 1.0); d = vec3(0.0, 0.4, 0.8);
            }
            vec3 col = a + b * cos(6.28318 * (c * t + d));
            float maxC = max(col.r, max(col.g, col.b));
            return col / (maxC + 0.001); 
        }

        void main() {
            vec2 uv = vUv;
            vec3 flowData = texture(u_flow, uv).xyz;
            vec2 flow = flowData.xy;
            float densityFlow = flowData.z;

            vec2 warpedUV = uv + flow * 0.05;

            float density = 25.0;
            if (u_scale == 1) density = 45.0;
            if (u_scale == 2) density = 12.0;

            vec2 grid = warpedUV * density;
            grid.y += sin(grid.x * 0.3 + u_time * 0.5) * 0.8; 
            vec2 cell = floor(grid);

            float maxHeight = -1.0;
            vec2 bestLocal = vec2(0.0);
            float bestID = 0.0;

            for (int y = -2; y <= 2; y++) {
                for (int x = -2; x <= 2; x++) {
                    vec2 neighbor = vec2(float(x), float(y));
                    vec2 offset = hash22(cell + neighbor);
                    vec2 center = cell + neighbor + 0.5 + (offset - 0.5) * 0.7;
                    vec2 local = grid - center;

                    if (u_scale == 0) {
                        local.y *= 1.4; 
                    } else if (u_scale == 1) {
                        local = mat2(0.707, -0.707, 0.707, 0.707) * local; 
                        local.y *= 1.2;
                    } else {
                        local.x *= 1.3; 
                    }

                    float h = 1.0 - (pow(local.x, 2.0) + pow(local.y + 0.3, 2.0));
                    h += neighbor.y * 0.35; 
                    h += 0.4 * exp(-30.0 * local.x * local.x); 
                    h += 0.15 * exp(-50.0 * pow(abs(local.x) - 0.4, 2.0)); 

                    if (h > maxHeight) {
                        maxHeight = h;
                        bestLocal = local;
                        bestID = hash12(cell + neighbor);
                    }
                }
            }

            float height = clamp(maxHeight, 0.0, 1.0);
            
            float lx = bestLocal.x;
            float ly = bestLocal.y;
            float absx = abs(lx);
            float signx = sign(lx);

            float dhdx = -2.0 * lx 
                         - 0.4 * 60.0 * lx * exp(-30.0 * lx * lx)
                         - 0.15 * 100.0 * (absx - 0.4) * signx * exp(-50.0 * pow(absx - 0.4, 2.0));
            float dhdy = -2.0 * (ly + 0.3);

            if (u_scale == 0) dhdy *= 1.4;
            if (u_scale == 2) dhdx *= 1.3;

            vec3 N = normalize(vec3(-dhdx, -dhdy, 2.0));
            vec3 V = vec3(0.0, 0.0, 1.0);
            float NdV = max(dot(N, V), 0.0);

            float baseVal = bestID * 8.0 + u_time * 0.4 + densityFlow * 0.2;
            
            // Color Space Warp / Non-linear chroma bend
            baseVal += sin(baseVal * 3.14) * 0.5;

            if (u_fc == 1) baseVal += height * 4.0;
            if (u_fc == 2) baseVal += NdV * 3.0;

            float angle = atan(bestLocal.y, bestLocal.x);
            float rad = length(bestLocal);
            if (u_dom == 1) baseVal += sin(angle * 6.0 + u_time);
            if (u_dom == 2) baseVal += fract(rad * 10.0 - u_time * 2.0);

            vec3 color = getPalette(baseVal * 0.15, u_pal);

            vec3 depthShift = getPalette(baseVal * 0.15 + height * 0.6, u_pal);
            color = mix(color, depthShift, 0.6);

            float interference = sin(height * 60.0 - u_time * 12.0 + NdV * 20.0);
            vec3 spectralColor = getPalette(interference * 0.5 + 0.5, (u_pal + 1) % 4);
            color = mix(color, spectralColor, pow(1.0 - NdV, 1.5) * u_rb);

            float grating = sin((bestLocal.x + bestLocal.y) * 400.0);
            color += vec3(grating * 0.15) * u_rb * (1.0 - NdV);

            color.r += dhdx * 0.15;
            color.b -= dhdx * 0.15;

            vec3 L = normalize(vec3(0.4, 0.6, 1.0));
            float diff = max(dot(N, L), 0.0);
            float spec = pow(max(dot(reflect(-L, N), V), 0.0), 48.0);

            vec3 shadow = getPalette(baseVal * 0.15 + 0.5, u_pal) * 0.2;
            color = color * (diff * 0.8 + 0.2) + spec * 0.9 * spectralColor;
            color = mix(shadow, color, smoothstep(-0.3, 0.5, maxHeight));

            vec3 prevMain = texture(u_prevMain, vUv).rgb;
            vec3 complement = vec3(1.0) - prevMain;
            float compMax = max(complement.r, max(complement.g, complement.b));
            if (compMax > 0.0) complement /= compMax;

            float flowMag = length(flow);
            color = mix(color, complement, u_aft * smoothstep(0.0, 0.4, flowMag));

            fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
        }`;

        const fsPost = `#version 300 es
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        
        uniform sampler2D u_main;
        uniform vec2 u_resolution;

        void main() {
            vec2 uv = vUv;
            vec2 px = 1.0 / u_resolution;

            float ca = 2.5;
            float r = texture(u_main, uv + vec2(px.x * ca, 0.0)).r;
            float g = texture(u_main, uv).g;
            float b = texture(u_main, uv - vec2(px.x * ca, 0.0)).b;
            vec3 col = vec3(r, g, b);

            vec3 bloom = vec3(0.0);
            for(float x = -2.0; x <= 2.0; x++) {
                for(float y = -2.0; y <= 2.0; y++) {
                    bloom += texture(u_main, uv + vec2(x, y) * px * 2.0).rgb;
                }
            }
            bloom /= 25.0;
            col += bloom * 0.4;

            float d = length(uv - 0.5);
            col *= smoothstep(0.85, 0.2, d);

            fragColor = vec4(col, 1.0);
        }`;

        const progFlow = createProgram(vsQuad, fsFlow);
        const progMain = createProgram(vsQuad, fsMain);
        const progPost = createProgram(vsQuad, fsPost);

        const createPingPong = (w, h) => {
            const type = ext ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
            const internalFormat = ext ? gl.RGBA16F : gl.RGBA8;
            const makeFBO = () => {
                const tex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, gl.RGBA, type, null);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                const fbo = gl.createFramebuffer();
                gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
                return { tex, fbo };
            };
            return { read: makeFBO(), write: makeFBO(), w, h };
        };

        const quadVAO = gl.createVertexArray();
        gl.bindVertexArray(quadVAO);
        const quadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,  1, -1,  -1, 1,
            -1,  1,  1, -1,   1, 1
        ]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        canvas.__neonSerpentState = {
            progFlow, progMain, progPost,
            quadVAO,
            ppFlow: createPingPong(grid.width, grid.height),
            ppMain: createPingPong(grid.width, grid.height),
            lastMouse: { x: mouse.x, y: mouse.y },
            params: { pal: 0, dom: 0, fc: 0, scale: 0, rb: 1.0, aft: 0.3 }
        };

        if (!canvas.__neonSerpentKeys) {
            window.addEventListener('keydown', (e) => {
                if (!canvas.__neonSerpentState) return;
                const p = canvas.__neonSerpentState.params;
                const k = e.key.toLowerCase();
                if (k === 'c') p.pal = (p.pal + 1) % 4;
                if (k === 'd') p.dom = (p.dom + 1) % 3;
                if (k === 'f') p.fc = (p.fc + 1) % 3;
                if (k === 's') p.scale = (p.scale + 1) % 3;
                if (k === 'r') p.rb = p.rb > 0.5 ? 0.2 : 1.0;
                if (k === 'a') p.aft = p.aft > 0.1 ? 0.0 : 0.5;
            });
            canvas.__neonSerpentKeys = true;
        }
    }

    const state = canvas.__neonSerpentState;

    if (state.ppFlow.w !== grid.width || state.ppFlow.h !== grid.height) {
        // Simple resize handling: just re-init next frame
        canvas.__neonSerpentState = null;
        return;
    }

    const setUniforms = (prog, uniforms) => {
        gl.useProgram(prog);
        for (let [name, val] of Object.entries(uniforms)) {
            const loc = gl.getUniformLocation(prog, name);
            if (loc === null) continue;
            if (Array.isArray(val)) {
                if (val.length === 2) gl.uniform2f(loc, val[0], val[1]);
                if (val.length === 3) gl.uniform3f(loc, val[0], val[1], val[2]);
            } else if (typeof val === 'number') {
                if (Number.isInteger(val) && !name.startsWith('u_time') && !name.startsWith('u_rb') && !name.startsWith('u_aft')) {
                    gl.uniform1i(loc, val);
                } else {
                    gl.uniform1f(loc, val);
                }
            }
        }
    };

    const mx = mouse.x / grid.width;
    const my = 1.0 - (mouse.y / grid.height);
    const lmx = state.lastMouse.x / grid.width;
    const lmy = 1.0 - (state.lastMouse.y / grid.height);
    const dx = mouse.isPressed ? (mx - lmx) : 0.0;
    const dy = mouse.isPressed ? (my - lmy) : 0.0;
    state.lastMouse = { x: mouse.x, y: mouse.y };

    gl.bindVertexArray(state.quadVAO);

    // Pass 1: Flow
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.ppFlow.write.fbo);
    gl.viewport(0, 0, grid.width, grid.height);
    setUniforms(state.progFlow, {
        u_time: time,
        u_resolution: [grid.width, grid.height],
        u_mouse: [mx, my],
        u_mouseDir: [dx, dy]
    });
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.ppFlow.read.tex);
    gl.uniform1i(gl.getUniformLocation(state.progFlow, "u_prevFlow"), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Pass 2: Main Snakeskin
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.ppMain.write.fbo);
    setUniforms(state.progMain, {
        u_time: time,
        u_resolution: [grid.width, grid.height],
        u_pal: state.params.pal,
        u_dom: state.params.dom,
        u_fc: state.params.fc,
        u_scale: state.params.scale,
        u_rb: state.params.rb,
        u_aft: state.params.aft
    });
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.ppFlow.write.tex);
    gl.uniform1i(gl.getUniformLocation(state.progMain, "u_flow"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.ppMain.read.tex);
    gl.uniform1i(gl.getUniformLocation(state.progMain, "u_prevMain"), 1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Pass 3: Post
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    setUniforms(state.progPost, {
        u_resolution: [grid.width, grid.height]
    });
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.ppMain.write.tex);
    gl.uniform1i(gl.getUniformLocation(state.progPost, "u_main"), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Swap buffers
    let tmp = state.ppFlow.read;
    state.ppFlow.read = state.ppFlow.write;
    state.ppFlow.write = tmp;

    tmp = state.ppMain.read;
    state.ppMain.read = state.ppMain.write;
    state.ppMain.write = tmp;
}