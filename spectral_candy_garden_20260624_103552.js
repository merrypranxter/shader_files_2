const gl = ctx;

if (!canvas.__initialized) {
    canvas.__initialized = true;
    canvas.__state = { frame: 0, palette: 0, crt: 1, geo: 1 };
    
    gl.getExtension('EXT_color_buffer_float');
    
    const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
        return s;
    };
    
    const createProg = (vs, fs) => {
        const p = gl.createProgram();
        gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        return p;
    };
    
    const vs = `#version 300 es
    in vec2 position;
    out vec2 vUv;
    void main() {
        vUv = position * 0.5 + 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
    }`;
    
    const fsSim = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;
    uniform sampler2D u_state;
    uniform vec2 u_res;
    uniform vec3 u_mouse;
    uniform float u_time;
    uniform float u_seed;
    uniform float u_init;
    
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    
    void main() {
        if (u_init > 0.5) {
            float g = hash(vUv * 123.4) > 0.99 ? 15.0 : 0.0;
            float t = floor(hash(vUv * 456.7) * 16.0);
            fragColor = vec4(g, t, 0.0, 0.0);
            return;
        }
        
        vec2 texel = 1.0 / u_res;
        vec4 me = texture(u_state, vUv);
        float grains = me.r;
        float tile = me.g;
        float heat = me.b;
        float mem = me.a;
        
        float n = texture(u_state, vUv + vec2(0, texel.y)).r;
        float s = texture(u_state, vUv - vec2(0, texel.y)).r;
        float e = texture(u_state, vUv + vec2(texel.x, 0)).r;
        float w = texture(u_state, vUv - vec2(texel.x, 0)).r;
        
        float topples = floor(grains / 4.0);
        float gain = floor(n/4.0) + floor(s/4.0) + floor(e/4.0) + floor(w/4.0);
        float newGrains = grains - 4.0 * topples + gain;
        
        heat *= 0.98; 
        if(topples > 0.0) heat += 0.4;
        if(gain > 0.0) heat += 0.15;
        
        if(heat > 1.0 && hash(vUv + u_time) < 0.1) {
            tile = floor(hash(vUv + u_time * 1.1) * 16.0);
            heat *= 0.3;
        }
        
        if(hash(vUv + u_seed + u_time) < 0.0001) {
            newGrains += 8.0;
            heat += 1.0;
            mem = 1.0;
        }
        
        if(u_mouse.z > 0.0) {
            if(length(vUv - u_mouse.xy) < 0.04) {
                newGrains += 2.0;
                heat += 0.9;
                mem = 1.0;
            }
        }
        
        mem = max(mem - 0.01, topples > 0.0 ? 1.0 : 0.0);
        fragColor = vec4(newGrains, tile, clamp(heat, 0.0, 1.0), mem);
    }`;

    const fsRender = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;
    uniform sampler2D u_state;
    uniform float u_time;
    uniform vec2 u_res;
    uniform float u_gridSize;
    uniform float u_palette;
    uniform float u_geo;
    
    float lobe(float x, float a, float mu, float sL, float sR) {
        float s = x < mu ? sL : sR;
        float t = (x - mu) / s;
        return a * exp(-0.5 * t * t);
    }
    vec3 wavelengthToXYZ(float l) {
        float x = lobe(l, 1.056, 599.8, 37.9, 31.0) + lobe(l, 0.362, 442.0, 16.0, 26.7) + lobe(l, -0.065, 501.1, 20.4, 26.2);
        float y = lobe(l, 0.821, 568.8, 46.9, 40.5) + lobe(l, 0.286, 530.9, 16.3, 31.1);
        float z = lobe(l, 1.217, 437.0, 11.8, 36.0) + lobe(l, 0.681, 459.0, 26.0, 13.8);
        return vec3(x, y, z);
    }
    vec3 xyzToRGB(vec3 xyz) {
        vec3 rgb = vec3(
            3.2406 * xyz.x - 1.5372 * xyz.y - 0.4986 * xyz.z,
           -0.9689 * xyz.x + 1.8758 * xyz.y + 0.0415 * xyz.z,
            0.0557 * xyz.x - 0.2040 * xyz.y + 1.0570 * xyz.z
        );
        float lift = min(min(rgb.r, rgb.g), min(rgb.b, 0.0));
        rgb -= lift;
        float mx = max(max(rgb.r, rgb.g), max(rgb.b, 1e-6));
        rgb /= mx; 
        return mix(12.92 * rgb, 1.055 * pow(max(rgb,0.0), vec3(1.0/2.4)) - 0.055, step(0.0031308, rgb));
    }
    vec3 spectralColor(float lambda) {
        return xyzToRGB(wavelengthToXYZ(lambda));
    }
    
    vec3 linear_to_oklab(vec3 c) {
        float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
        float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
        float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
        return vec3(
            0.2104542553 * pow(max(l,0.),1./3.) + 0.7936177850 * pow(max(m,0.),1./3.) - 0.0040720468 * pow(max(s,0.),1./3.),
            1.9779984951 * pow(max(l,0.),1./3.) - 2.4285922050 * pow(max(m,0.),1./3.) + 0.4505937099 * pow(max(s,0.),1./3.),
            0.0259040371 * pow(max(l,0.),1./3.) + 0.7827717662 * pow(max(m,0.),1./3.) - 0.8086757660 * pow(max(s,0.),1./3.)
        );
    }
    vec3 oklab_to_linear(vec3 c) {
        float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
        float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
        float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
        float l = l_*l_*l_, m = m_*m_*m_, s = s_*s_*s_;
        return vec3(
             4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
        );
    }
    vec3 oklabMix(vec3 a, vec3 b, float t) {
        return oklab_to_linear(mix(linear_to_oklab(a), linear_to_oklab(b), t));
    }
    
    void main() {
        vec2 cellId = floor(vUv * u_gridSize) / u_gridSize;
        vec2 gridUV = fract(vUv * u_gridSize);
        
        vec4 state = texture(u_state, cellId + 0.5/u_gridSize);
        float grains = state.r;
        float tileIdx = state.g;
        float heat = state.b;
        float mem = state.a;
        
        float t = u_time * 0.15;
        float palOffset = u_palette * 137.5; 
        
        vec3 bg1 = spectralColor(mix(380.0, 700.0, sin(t + vUv.x * 2.0 + palOffset)*0.5+0.5));
        vec3 bg2 = spectralColor(mix(380.0, 700.0, cos(t*1.3 + vUv.y * 2.0 + palOffset)*0.5+0.5));
        vec3 bg3 = spectralColor(mix(380.0, 700.0, sin(t*0.7 - vUv.x + vUv.y + palOffset)*0.5+0.5));
        
        vec3 bg = oklabMix(bg1, bg2, vUv.y);
        bg = oklabMix(bg, bg3, 0.5 + 0.5*sin(vUv.x*5.0 + u_time));
        
        bg = mix(bg, vec3(0.9, 0.05, 0.8), 0.15 * sin(u_time + vUv.y * 10.0));
        bg = mix(bg, vec3(0.05, 0.8, 0.9), 0.15 * cos(u_time + vUv.x * 10.0));
        
        float thickness = 400.0 + grains * 80.0 + heat * 150.0;
        float n_film = 1.45;
        float cosTheta = 0.7 + 0.3 * sin(u_time + cellId.x * 20.0 + cellId.y * 20.0);
        float pathDiff = 2.0 * n_film * thickness * cosTheta;
        
        vec3 structColor = vec3(0.0);
        for(float i=0.; i<4.; i++) {
            float lambda = mix(400.0, 700.0, i/3.0);
            float phase = (pathDiff / lambda) * 6.28318;
            structColor += spectralColor(lambda) * (0.5 + 0.5 * cos(phase));
        }
        structColor /= 4.0;
        
        float type = mod(tileIdx, 4.0);
        vec2 tuv = gridUV;
        if(mod(tileIdx, 2.0) > 0.5) tuv.x = 1.0 - tuv.x;
        if(mod(floor(tileIdx/2.0), 2.0) > 0.5) tuv.y = 1.0 - tuv.y;
        
        float d1 = abs(length(tuv) - 0.5);
        float d2 = abs(length(tuv - 1.0) - 0.5);
        float arc = min(d1, d2);
        float line = smoothstep(0.12, 0.07, arc) - smoothstep(0.07, 0.02, arc); 
        float core = smoothstep(0.03, 0.0, arc); 
        
        float dots = 0.0;
        if (type == 1.0) {
            dots = smoothstep(0.15, 0.1, length(tuv - 0.5)) - smoothstep(0.1, 0.05, length(tuv - 0.5));
        } else if (type == 2.0) {
            dots = smoothstep(0.1, 0.05, length(tuv - vec2(0.5, 0.0))) + smoothstep(0.1, 0.05, length(tuv - vec2(0.0, 0.5)));
        }
        
        float geo = 0.0;
        float geoBits = mod(floor(tileIdx * 7.0 + u_time), 16.0);
        float lineId = floor(gridUV.y * 4.0);
        float isDouble = mod(floor(geoBits / pow(2.0, lineId)), 2.0);
        vec2 cUV = vec2(gridUV.x, fract(gridUV.y * 4.0));
        if(isDouble > 0.5) {
            geo = smoothstep(0.2, 0.1, length(cUV - vec2(0.3, 0.5))) + smoothstep(0.2, 0.1, length(cUV - vec2(0.7, 0.5)));
        } else {
            geo = smoothstep(0.2, 0.1, length(cUV - vec2(0.5, 0.5)));
        }
        
        vec3 finalColor = mix(bg, structColor, 0.3);
        
        float lineLambda = clamp(400.0 + mod(tileIdx * 45.0 + u_time * 60.0, 300.0), 380.0, 700.0);
        vec3 lineColor = spectralColor(lineLambda);
        
        finalColor += lineColor * line * 1.5;
        finalColor += vec3(1.0) * core * 1.5; 
        finalColor += lineColor * dots * 2.0;
        
        vec3 geoColor = spectralColor(clamp(650.0 - heat * 250.0, 380.0, 700.0));
        finalColor += geoColor * geo * mem * u_geo * 1.2;
        
        if (heat > 0.1) {
            vec3 heatCol = spectralColor(clamp(380.0 + heat * 320.0, 380.0, 700.0));
            finalColor += heatCol * heat * 0.4;
        }
        
        if (grains > 0.0) {
            float gT = clamp(grains / 4.0, 0.0, 1.0);
            vec3 grainCol = spectralColor(mix(700.0, 400.0, gT));
            finalColor += grainCol * gT * 1.5;
        }
        
        finalColor = clamp(finalColor, 0.0, 1.0);
        fragColor = vec4(finalColor, 1.0);
    }`;

    const fsAdapt = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;
    uniform sampler2D u_render;
    uniform sampler2D u_prev;
    
    void main() {
        vec3 cur = texture(u_render, vUv).rgb;
        vec3 prev = texture(u_prev, vUv).rgb;
        vec3 adapt = min(prev + cur * 0.15, vec3(1.0));
        adapt *= 0.94; 
        fragColor = vec4(adapt, 1.0);
    }`;

    const fsPost = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;
    
    uniform sampler2D u_render;
    uniform sampler2D u_adapt;
    uniform vec2 u_res;
    uniform float u_time;
    uniform float u_crt;
    
    void main() {
        vec2 c = vUv - 0.5;
        float r2 = dot(c, c);
        vec2 barrelUV = c * (1.0 + 0.12 * r2 + 0.02 * r2 * r2) + 0.5;
        
        if (barrelUV.x < 0.0 || barrelUV.x > 1.0 || barrelUV.y < 0.0 || barrelUV.y > 1.0) {
            fragColor = vec4(0.15, 0.0, 0.2, 1.0); 
            return;
        }
        
        vec2 dir = barrelUV - 0.5;
        float shift = 0.006;
        float r = texture(u_render, barrelUV + dir * shift).r;
        float g = texture(u_render, barrelUV).g;
        float b = texture(u_render, barrelUV - dir * shift).b;
        vec3 cur = vec3(r, g, b);
        
        vec3 adapt = texture(u_adapt, barrelUV).rgb;
        
        vec3 comp = vec3(1.0) - adapt;
        float adaptStr = max(max(adapt.r, adapt.g), adapt.b);
        float cov = max(max(cur.r, cur.g), cur.b);
        vec3 ghost = comp * adaptStr * (1.0 - cov) * 0.8;
        
        vec3 col = cur + ghost;
        
        if (u_crt > 0.5) {
            float maskX = mod(gl_FragCoord.x, 3.0);
            vec3 stripe = vec3(
                smoothstep(1.0, 0.0, abs(maskX - 0.5)),
                smoothstep(1.0, 0.0, abs(maskX - 1.5)),
                smoothstep(1.0, 0.0, abs(maskX - 2.5))
            );
            stripe = mix(vec3(1.0), stripe, 0.4);
            col *= stripe;
            
            float scan = 0.5 + 0.5 * sin(barrelUV.y * u_res.y * 3.1415);
            col *= 1.0 - 0.15 * (1.0 - scan);
            
            float w1 = exp(-pow(barrelUV.y - 0.33, 2.0) / 0.0009);
            float w2 = exp(-pow(barrelUV.y - 0.66, 2.0) / 0.0009);
            col *= 1.0 - 0.15 * (w1 + w2);
        }
        
        float vig = smoothstep(1.2, 0.4, length(c * vec2(1.1, 1.0)));
        col = mix(vec3(0.2, 0.0, 0.3), col, vig); 
        
        col = pow(clamp(col, 0.0, 1.0), vec3(1.0/1.1));
        
        fragColor = vec4(col, 1.0);
    }`;

    canvas.__pSim = createProg(vs, fsSim);
    canvas.__pRender = createProg(vs, fsRender);
    canvas.__pAdapt = createProg(vs, fsAdapt);
    canvas.__pPost = createProg(vs, fsPost);
    
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    canvas.__quad = quad;
    
    canvas.__createFBO = (w, h) => {
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
        return { tex, fbo };
    };
    
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'c') canvas.__state.palette = (canvas.__state.palette + 1) % 5;
        if (e.key.toLowerCase() === 'g') canvas.__state.geo = canvas.__state.geo > 0.5 ? 0.0 : 1.0;
        if (e.key.toLowerCase() === 'p') canvas.__state.crt = canvas.__state.crt > 0.5 ? 0.0 : 1.0;
        if (e.key === ' ') canvas.__state.frame = 0;
    });
}

if (canvas.__width !== grid.width || canvas.__height !== grid.height) {
    canvas.__width = grid.width;
    canvas.__height = grid.height;
    
    if (canvas.__adaptA) {
        gl.deleteTexture(canvas.__adaptA.tex); gl.deleteFramebuffer(canvas.__adaptA.fbo);
        gl.deleteTexture(canvas.__adaptB.tex); gl.deleteFramebuffer(canvas.__adaptB.fbo);
        gl.deleteTexture(canvas.__renderFBO.tex); gl.deleteFramebuffer(canvas.__renderFBO.fbo);
    } else {
        canvas.__simA = canvas.__createFBO(128, 128);
        canvas.__simB = canvas.__createFBO(128, 128);
    }
    
    canvas.__adaptA = canvas.__createFBO(grid.width, grid.height);
    canvas.__adaptB = canvas.__createFBO(grid.width, grid.height);
    canvas.__renderFBO = canvas.__createFBO(grid.width, grid.height);
}

const drawQuad = (prog) => {
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, canvas.__quad);
    const loc = gl.getAttribLocation(prog, "position");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};

let mx = mouse.x / grid.width;
let my = 1.0 - (mouse.y / grid.height);
let mDown = mouse.isPressed ? 1.0 : 0.0;

gl.viewport(0, 0, 128, 128);
gl.useProgram(canvas.__pSim);
gl.uniform2f(gl.getUniformLocation(canvas.__pSim, "u_res"), 128.0, 128.0);
gl.uniform3f(gl.getUniformLocation(canvas.__pSim, "u_mouse"), mx, my, mDown);
gl.uniform1f(gl.getUniformLocation(canvas.__pSim, "u_time"), time);
gl.uniform1f(gl.getUniformLocation(canvas.__pSim, "u_seed"), Math.random());

for (let i = 0; i < 4; i++) {
    gl.uniform1f(gl.getUniformLocation(canvas.__pSim, "u_init"), canvas.__state.frame === 0 ? 1.0 : 0.0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, canvas.__simB.fbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, canvas.__simA.tex);
    gl.uniform1i(gl.getUniformLocation(canvas.__pSim, "u_state"), 0);
    drawQuad(canvas.__pSim);
    
    let temp = canvas.__simA;
    canvas.__simA = canvas.__simB;
    canvas.__simB = temp;
    canvas.__state.frame++;
}

gl.viewport(0, 0, grid.width, grid.height);
gl.bindFramebuffer(gl.FRAMEBUFFER, canvas.__renderFBO.fbo);
gl.useProgram(canvas.__pRender);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, canvas.__simA.tex);
gl.uniform1i(gl.getUniformLocation(canvas.__pRender, "u_state"), 0);
gl.uniform1f(gl.getUniformLocation(canvas.__pRender, "u_time"), time);
gl.uniform2f(gl.getUniformLocation(canvas.__pRender, "u_res"), grid.width, grid.height);
gl.uniform1f(gl.getUniformLocation(canvas.__pRender, "u_gridSize"), 128.0);
gl.uniform1f(gl.getUniformLocation(canvas.__pRender, "u_palette"), canvas.__state.palette);
gl.uniform1f(gl.getUniformLocation(canvas.__pRender, "u_geo"), canvas.__state.geo);
drawQuad(canvas.__pRender);

gl.bindFramebuffer(gl.FRAMEBUFFER, canvas.__adaptB.fbo);
gl.useProgram(canvas.__pAdapt);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, canvas.__renderFBO.tex);
gl.uniform1i(gl.getUniformLocation(canvas.__pAdapt, "u_render"), 0);
gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, canvas.__adaptA.tex);
gl.uniform1i(gl.getUniformLocation(canvas.__pAdapt, "u_prev"), 1);
drawQuad(canvas.__pAdapt);

let tempA = canvas.__adaptA;
canvas.__adaptA = canvas.__adaptB;
canvas.__adaptB = tempA;

gl.bindFramebuffer(gl.FRAMEBUFFER, null);
gl.useProgram(canvas.__pPost);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, canvas.__renderFBO.tex);
gl.uniform1i(gl.getUniformLocation(canvas.__pPost, "u_render"), 0);
gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, canvas.__adaptA.tex);
gl.uniform1i(gl.getUniformLocation(canvas.__pPost, "u_adapt"), 1);
gl.uniform2f(gl.getUniformLocation(canvas.__pPost, "u_res"), grid.width, grid.height);
gl.uniform1f(gl.getUniformLocation(canvas.__pPost, "u_time"), time);
gl.uniform1f(gl.getUniformLocation(canvas.__pPost, "u_crt"), canvas.__state.crt);
drawQuad(canvas.__pPost);