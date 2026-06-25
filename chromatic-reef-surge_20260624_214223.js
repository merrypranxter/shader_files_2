const gl = ctx;
if (!gl || !gl.createShader) return; // Ensure WebGL2 context

if (!canvas.__reefSys) {
    function compile(gl, type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error("Shader compile error:", gl.getShaderInfoLog(s));
        }
        return s;
    }

    function createProgram(gl, vs, fs) {
        const p = gl.createProgram();
        gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
        gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        return p;
    }

    function createFBO(gl, w, h) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { tex, fbo };
    }

    function createSpectralLUT(gl) {
        const width = 1024;
        const data = new Uint8Array(width * 4);
        
        let Y_INT = 0;
        for (let j = 0; j < 64; j++) {
            const lambda = 380 + (j + 0.5) * (400 / 64);
            Y_INT += 0.821 * Math.exp(-0.5 * Math.pow((lambda - 568.8) / 46.9, 2)) + 
                     0.286 * Math.exp(-0.5 * Math.pow((lambda - 530.9) / 16.3, 2));
        }
        
        for (let i = 0; i < width; i++) {
            const gamma = (i / (width - 1)) * 5500;
            let X = 0, Y = 0, Z = 0;
            for (let j = 0; j < 64; j++) {
                const lambda = 380 + (j + 0.5) * (400 / 64);
                const I = Math.pow(Math.sin((Math.PI * gamma) / lambda), 2);
                const x = 1.056 * Math.exp(-0.5 * Math.pow((lambda - 599.8) / 37.9, 2)) +
                          0.362 * Math.exp(-0.5 * Math.pow((lambda - 442.0) / 16.0, 2)) -
                          0.065 * Math.exp(-0.5 * Math.pow((lambda - 501.1) / 20.4, 2));
                const y = 0.821 * Math.exp(-0.5 * Math.pow((lambda - 568.8) / 46.9, 2)) +
                          0.286 * Math.exp(-0.5 * Math.pow((lambda - 530.9) / 16.3, 2));
                const z = 1.217 * Math.exp(-0.5 * Math.pow((lambda - 437.0) / 11.8, 2)) +
                          0.681 * Math.exp(-0.5 * Math.pow((lambda - 459.0) / 26.0, 2));
                X += I * x; Y += I * y; Z += I * z;
            }
            X /= Y_INT; Y /= Y_INT; Z /= Y_INT;
            
            let r =  3.2406 * X - 1.5372 * Y - 0.4986 * Z;
            let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
            let b =  0.0557 * X - 0.2040 * Y + 1.0570 * Z;
            
            const lift = Math.min(r, g, b, 0);
            r -= lift; g -= lift; b -= lift;
            const denom = Math.max(r, g, b, 1e-6);
            r /= denom; g /= denom; b /= denom;
            
            r = r <= 0.0031308 ? 12.92 * r : 1.055 * Math.pow(r, 1 / 2.4) - 0.055;
            g = g <= 0.0031308 ? 12.92 * g : 1.055 * Math.pow(g, 1 / 2.4) - 0.055;
            b = b <= 0.0031308 ? 12.92 * b : 1.055 * Math.pow(b, 1 / 2.4) - 0.055;
            
            data[i * 4 + 0] = Math.max(0, Math.min(255, r * 255));
            data[i * 4 + 1] = Math.max(0, Math.min(255, g * 255));
            data[i * 4 + 2] = Math.max(0, Math.min(255, b * 255));
            data[i * 4 + 3] = 255;
        }
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
    }

    const vs = `#version 300 es
    in vec2 position;
    out vec2 vUv;
    void main() {
        vUv = position * 0.5 + 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
    }`;

    const fsA = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;

    uniform sampler2D u_prev;
    uniform vec2 u_res;
    uniform float u_time;
    uniform vec2 u_mouse;
    uniform float u_mouse_down;
    uniform float u_pulse;

    float hash12(vec2 p) {
        vec3 p3  = fract(vec3(p.xyx) * .1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }

    float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash12(i), hash12(i+vec2(1.0,0.0)), u.x),
                   mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), u.x), u.y);
    }

    float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for(int i=0; i<3; i++) {
            v += a * noise(p);
            p = p * 2.0 + vec2(1.7, 9.2);
            a *= 0.5;
        }
        return v;
    }

    void main() {
        vec2 uv = vUv;
        vec2 p = uv * 2.0 - 1.0;
        p.x *= u_res.x / u_res.y;
        
        float n1 = fbm(p * 2.0 + u_time * 0.2);
        float n2 = fbm(p * 2.0 - u_time * 0.2);
        vec2 vel = vec2(n1, n2) * 2.0 - 1.0;
        vel *= 0.003;
        
        vec2 m = u_mouse * 2.0 - 1.0;
        m.x *= u_res.x / u_res.y;
        float dMouse = length(p - m);
        
        if(u_mouse_down > 0.5 && dMouse < 0.5) {
            vel += normalize(p - m) * 0.01 * (0.5 - dMouse);
        }
        if(u_pulse > 0.0) {
            float ring = abs(dMouse - (1.0 - u_pulse) * 1.5);
            vel += normalize(p - m) * 0.02 * exp(-ring * 10.0);
        }
        
        vec2 prevUv = uv - vel;
        vec4 prev = texture(u_prev, prevUv);
        prev *= 0.95; 
        
        float spark = 0.0;
        vec2 q = p * 2.0;
        q += vec2(fbm(q + u_time), fbm(q - u_time)) * 1.5;
        
        float d = abs(q.y + sin(q.x * 3.0 + u_time * 5.0) * 0.5);
        d = min(d, abs(q.x + cos(q.y * 4.0 - u_time * 4.0) * 0.5));
        if (d < 0.02) {
            spark = 1.0 * (1.0 - d/0.02);
        }
        if(u_mouse_down > 0.5) {
            float pull = 0.02 / (dMouse + 0.01);
            spark += pull * (d < 0.1 ? 1.0 : 0.0);
        }
        
        vec2 outVel = vel * 20.0 + 0.5;
        fragColor = vec4(clamp(prev.r + spark, 0.0, 1.0), clamp(outVel.x, 0.0, 1.0), clamp(outVel.y, 0.0, 1.0), 1.0);
    }`;

    const fsMain = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;

    uniform sampler2D u_bufferA;
    uniform sampler2D u_spectralLUT;
    uniform vec2 u_res;
    uniform float u_time;
    uniform vec2 u_mouse;
    uniform float u_pulse;

    vec3 getPal(float t, int idx) {
        vec3 c0, c1, c2, c3;
        if (idx == 0) {
            c0 = vec3(1.0, 0.1, 0.5); c1 = vec3(0.0, 1.0, 0.9); c2 = vec3(1.0, 0.5, 0.0); c3 = vec3(0.7, 1.0, 0.0);
        } else if (idx == 1) {
            c0 = vec3(0.5, 0.0, 1.0); c1 = vec3(0.0, 0.4, 1.0); c2 = vec3(0.0, 0.3, 0.4); c3 = vec3(0.0, 0.9, 0.4);
        } else if (idx == 2) {
            c0 = vec3(0.7, 1.0, 0.0); c1 = vec3(0.1, 0.9, 0.8); c2 = vec3(1.0, 0.4, 0.3); c3 = vec3(1.0, 0.0, 0.8);
        } else if (idx == 3) {
            c0 = vec3(0.2, 0.9, 0.8); c1 = vec3(0.6, 0.0, 1.0); c2 = vec3(1.0, 0.2, 0.6); c3 = vec3(0.0, 0.3, 0.5);
        } else {
            c0 = vec3(1.0, 0.0, 0.6); c1 = vec3(1.0, 0.5, 0.0); c2 = vec3(0.6, 0.0, 1.0); c3 = vec3(0.4, 0.0, 0.4);
        }
        if (t < 0.33) return mix(c0, c1, smoothstep(0.0, 0.33, t));
        if (t < 0.66) return mix(c1, c2, smoothstep(0.33, 0.66, t));
        return mix(c2, c3, smoothstep(0.66, 1.0, t));
    }

    vec3 getPalette(float t, float pIdx) {
        t = fract(t);
        int p0 = int(mod(floor(pIdx), 5.0));
        int p1 = int(mod(floor(pIdx) + 1.0, 5.0));
        float f = smoothstep(0.0, 1.0, fract(pIdx));
        return mix(getPal(t, p0), getPal(t, p1), f);
    }

    float hash12(vec2 p) {
        vec3 p3  = fract(vec3(p.xyx) * .1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }
    vec2 hash22(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
        p3 += dot(p3, p3.yzx+33.33);
        return fract((p3.xx+p3.yz)*p3.zy);
    }
    float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash12(i), hash12(i+vec2(1.0,0.0)), u.x),
                   mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for(int i=0; i<3; i++) {
            v += a * noise(p);
            p = p * 2.0 + vec2(1.7, 9.2);
            a *= 0.5;
        }
        return v;
    }

    float sdTriangle(vec2 p, float r) {
        const float k = sqrt(3.0);
        p.x = abs(p.x) - r;
        p.y = p.y + r/k;
        if( p.x+k*p.y > 0.0 ) p = vec2(p.x-k*p.y, -k*p.x-p.y)/2.0;
        p.x -= clamp( p.x, -2.0*r, 0.0 );
        return -length(p)*sign(p.y);
    }
    
    float sdHexagram(vec2 p, float r) {
        const vec4 k = vec4(-0.5,0.8660254038,0.5773502692,1.7320508076);
        p = abs(p);
        p -= 2.0*min(dot(k.xy,p),0.0)*k.xy;
        p -= 2.0*min(dot(k.yx,p),0.0)*k.yx;
        p -= vec2(clamp(p.x,r*k.z,r*k.w),r);
        return length(p)*sign(p.y);
    }
    
    float symbols(vec2 p, float dens) {
        vec2 grid = floor(p * 5.0);
        vec2 local = fract(p * 5.0) - 0.5;
        float h = hash12(grid);
        if(h > dens) return 0.0;
        float a = u_time * (h - 0.5) * 5.0;
        local *= mat2(cos(a), -sin(a), sin(a), cos(a));
        float d = 1.0;
        if(h < 0.1) d = sdTriangle(local, 0.2);
        else if(h < 0.2) d = sdHexagram(local, 0.2);
        else d = abs(length(local) - 0.15) - 0.02; 
        return smoothstep(0.05, 0.0, d);
    }

    float glassPattern(vec2 p) {
        vec2 p1 = p * 40.0;
        vec2 p2 = (p + vec2(sin(p.y*2.0), cos(p.x*2.0))*0.1) * 40.0;
        float d1 = length(fract(p1) - hash22(floor(p1)));
        float d2 = length(fract(p2) - hash22(floor(p2)));
        float dot1 = smoothstep(0.25, 0.15, d1);
        float dot2 = smoothstep(0.25, 0.15, d2);
        return max(dot1, dot2);
    }

    void main() {
        vec2 p = vUv * 2.0 - 1.0;
        p.x *= u_res.x / u_res.y;
        
        float u_palette = u_time * 0.1;
        float u_depth_exag = 0.5 + 0.3 * sin(u_time * 0.2);
        float u_hidden_corr = 0.5 + 0.5 * sin(u_time * 0.15);
        float u_plasma_int = 0.8 + 0.2 * sin(u_time * 0.3);
        float u_symbol_dens = 0.15 + 0.05 * sin(u_time * 0.1);
        
        vec4 bufA = texture(u_bufferA, vUv);
        vec2 flow = (bufA.gb - 0.5) / 20.0;
        float plasma = bufA.r;
        
        vec3 col = vec3(0.0);
        float totAlpha = 0.0;
        
        vec3 baseCol = getPalette(fbm(p * 1.5 + u_time * 0.05) + u_time * 0.1, u_palette);
        
        for(int i=0; i<6; i++) {
            float z = float(i) / 5.0; 
            vec2 q = p + flow * z * 8.0;
            
            vec2 m = u_mouse * 2.0 - 1.0;
            m.x *= u_res.x / u_res.y;
            q += m * z * 0.15;
            
            vec2 warp = vec2(
                fbm(q * 2.0 + z * 5.0 + u_time * 0.15),
                fbm(q * 2.0 - z * 5.0 - u_time * 0.15)
            ) * 2.0 - 1.0;
            
            vec2 qw = q + warp * 0.4;
            
            float d = fbm(qw * 2.5) - 0.5; 
            float ribbon = abs(qw.y + sin(qw.x * 2.5 + u_time)*0.4) - 0.2;
            float bubble = length(fract(qw * 3.0) - 0.5) - 0.25;
            
            d = min(d, min(ribbon, bubble));
            
            if (d < 0.05) {
                float dist = smoothstep(0.05, -0.05, d);
                
                float t_col = fbm(qw) + u_time * 0.1 + z;
                vec3 mainCol = getPalette(t_col, u_palette);
                vec3 edgeCol = getPalette(t_col + 0.5, u_palette);
                
                float thickness = dist * (1.0 - z*0.4) * 4000.0;
                vec3 biCol = texture(u_spectralLUT, vec2(thickness / 5500.0, 0.5)).rgb;
                
                vec3 layerCol = mainCol * biCol * 2.5;
                
                layerCol = mix(layerCol, edgeCol, smoothstep(0.0, 0.04, abs(d)));
                
                vec3 chromaEdge = vec3(1.0, 0.0, 0.0) * smoothstep(0.0, 0.03, d);
                chromaEdge += vec3(0.0, 0.0, 1.0) * smoothstep(0.0, -0.03, d);
                layerCol += chromaEdge * u_depth_exag;
                
                float diff = sin(qw.x * 120.0 + qw.y * 120.0 + u_time * 4.0);
                vec3 diffCol = texture(u_spectralLUT, vec2(fract(diff), 0.5)).rgb;
                layerCol += diffCol * smoothstep(-0.01, 0.03, d) * 0.6;
                
                layerCol += getPalette(z + u_time, u_palette) * plasma * u_plasma_int * 3.0;
                
                float sym = symbols(qw * 1.5 + z * 7.0, u_symbol_dens);
                layerCol += vec3(1.0, 0.9, 0.8) * sym * 2.0;
                
                float gp = glassPattern(qw + z * 10.0);
                layerCol += edgeCol * gp * u_hidden_corr * (1.0 + u_pulse * 2.0);
                
                layerCol += vec3(1.0) * smoothstep(0.03, 0.04, d) * smoothstep(0.05, 0.04, d) * 0.5;
                
                float alpha = dist * 0.4;
                col += layerCol * alpha * (1.0 - totAlpha);
                totAlpha += alpha;
                if (totAlpha > 0.95) break;
            }
        }
        
        col += baseCol * (1.0 - totAlpha);
        
        float rDist = length(p);
        float caShift = rDist * rDist * 0.01;
        col.r *= 1.0 + caShift * 2.0;
        col.b *= 1.0 - caShift * 1.0;
        
        col *= 1.0 - rDist * 0.15;
        
        col = col / (1.0 + col);
        col = pow(col, vec3(1.0/2.2));
        
        fragColor = vec4(col, 1.0);
    }`;

    const progA = createProgram(gl, vs, fsA);
    const progMain = createProgram(gl, vs, fsMain);

    const fbo1 = createFBO(gl, grid.width, grid.height);
    const fbo2 = createFBO(gl, grid.width, grid.height);
    const lutTex = createSpectralLUT(gl);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const locA = gl.getAttribLocation(progMain, "position");
    gl.enableVertexAttribArray(locA);
    gl.vertexAttribPointer(locA, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    canvas.__reefSys = { progA, progMain, fbo1, fbo2, lutTex, vao, ping: true };
}

const sys = canvas.__reefSys;

if (canvas.width !== grid.width || canvas.height !== grid.height) {
    canvas.width = grid.width;
    canvas.height = grid.height;
    
    gl.deleteTexture(sys.fbo1.tex);
    gl.deleteFramebuffer(sys.fbo1.fbo);
    gl.deleteTexture(sys.fbo2.tex);
    gl.deleteFramebuffer(sys.fbo2.fbo);
    
    function createFBO(gl, w, h) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { tex, fbo };
    }
    
    sys.fbo1 = createFBO(gl, grid.width, grid.height);
    sys.fbo2 = createFBO(gl, grid.width, grid.height);
}

if (typeof canvas.__prevMouse === 'undefined') canvas.__prevMouse = false;
if (typeof canvas.__pulse === 'undefined') canvas.__pulse = 0;

if (mouse.isPressed && !canvas.__prevMouse) {
    canvas.__pulse = 1.0;
}
canvas.__pulse *= 0.95;
canvas.__prevMouse = mouse.isPressed;

const mX = mouse.x / grid.width;
const mY = 1.0 - mouse.y / grid.height;
const mDown = mouse.isPressed ? 1.0 : 0.0;

// Pass 1: Buffer A
gl.useProgram(sys.progA);
gl.bindFramebuffer(gl.FRAMEBUFFER, sys.ping ? sys.fbo1.fbo : sys.fbo2.fbo);
gl.viewport(0, 0, grid.width, grid.height);

gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, sys.ping ? sys.fbo2.tex : sys.fbo1.tex);
gl.uniform1i(gl.getUniformLocation(sys.progA, "u_prev"), 0);

gl.uniform2f(gl.getUniformLocation(sys.progA, "u_res"), grid.width, grid.height);
gl.uniform1f(gl.getUniformLocation(sys.progA, "u_time"), time);
gl.uniform2f(gl.getUniformLocation(sys.progA, "u_mouse"), mX, mY);
gl.uniform1f(gl.getUniformLocation(sys.progA, "u_mouse_down"), mDown);
gl.uniform1f(gl.getUniformLocation(sys.progA, "u_pulse"), canvas.__pulse);

gl.bindVertexArray(sys.vao);
gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

// Pass 2: Main
gl.useProgram(sys.progMain);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
gl.viewport(0, 0, grid.width, grid.height);

gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, sys.ping ? sys.fbo1.tex : sys.fbo2.tex);
gl.uniform1i(gl.getUniformLocation(sys.progMain, "u_bufferA"), 0);

gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, sys.lutTex);
gl.uniform1i(gl.getUniformLocation(sys.progMain, "u_spectralLUT"), 1);

gl.uniform2f(gl.getUniformLocation(sys.progMain, "u_res"), grid.width, grid.height);
gl.uniform1f(gl.getUniformLocation(sys.progMain, "u_time"), time);
gl.uniform2f(gl.getUniformLocation(sys.progMain, "u_mouse"), mX, mY);
gl.uniform1f(gl.getUniformLocation(sys.progMain, "u_pulse"), canvas.__pulse);

gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

sys.ping = !sys.ping;