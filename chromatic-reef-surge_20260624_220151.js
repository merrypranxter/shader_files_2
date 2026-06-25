const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.backgroundColor = '#050505';
canvas.style.display = 'block';
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let gl;
try {
    gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 not available');
} catch (e) {
    console.error(e);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff0055';
    ctx.font = '20px monospace';
    ctx.fillText('WebGL2 required for Chromatic Reef Surge.', 20, 40);
    throw e;
}

gl.getExtension('EXT_color_buffer_float');
gl.getExtension('OES_texture_float_linear');

const state = {
    palette: 0,
    depth_exag: 0.5,
    corr: 0.0,
    plasma: 1.0,
    spores: 1.0,
    mouse: [0.5, 0.5],
    click: 0.0,
    pulse: 0.0,
    time: 0.0
};

window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'c') state.palette = (state.palette + 1) % 5;
    if (k === 'd') state.depth_exag = state.depth_exag > 1.5 ? 0.2 : state.depth_exag + 0.4;
    if (k === 'h') state.corr = state.corr > 0.8 ? 0.0 : state.corr + 0.3;
    if (k === 'p') state.plasma = state.plasma > 1.5 ? 0.0 : state.plasma + 0.5;
    if (k === 's') state.spores = state.spores > 1.5 ? 0.0 : state.spores + 0.5;
});

window.addEventListener('mousemove', e => {
    state.mouse[0] = e.clientX / window.innerWidth;
    state.mouse[1] = 1.0 - (e.clientY / window.innerHeight);
});

window.addEventListener('touchmove', e => {
    state.mouse[0] = e.touches[0].clientX / window.innerWidth;
    state.mouse[1] = 1.0 - (e.touches[0].clientY / window.innerHeight);
});

window.addEventListener('mousedown', () => { state.click = 1.0; state.pulse = 0.01; });
window.addEventListener('mouseup', () => state.click = 0.0);
window.addEventListener('touchstart', () => { state.click = 1.0; state.pulse = 0.01; });
window.addEventListener('touchend', () => state.click = 0.0);

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initFBOs();
});

const quadVS = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}`;

const commonGLSL = `
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_click;
uniform float u_pulse;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), u.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}

float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = p * 2.0 + vec2(1.7, 9.2);
        a *= 0.5;
    }
    return v;
}

vec3 spectral_cie(float l) {
    float gaussian1 = 1.056 * exp(-0.5 * pow((l - 599.8) / (l < 599.8 ? 37.9 : 31.0), 2.0));
    float gaussian2 = 0.362 * exp(-0.5 * pow((l - 442.0) / (l < 442.0 ? 16.0 : 26.7), 2.0));
    float gaussian3 = -0.065 * exp(-0.5 * pow((l - 501.1) / (l < 501.1 ? 20.4 : 26.2), 2.0));
    float x = gaussian1 + gaussian2 + gaussian3;
    
    float y = 0.821 * exp(-0.5 * pow((l - 568.8) / (l < 568.8 ? 46.9 : 40.5), 2.0))
            + 0.286 * exp(-0.5 * pow((l - 530.9) / (l < 530.9 ? 16.3 : 31.1), 2.0));
            
    float z = 1.217 * exp(-0.5 * pow((l - 437.0) / (l < 437.0 ? 11.8 : 36.0), 2.0))
            + 0.681 * exp(-0.5 * pow((l - 459.0) / (l < 459.0 ? 26.0 : 13.8), 2.0));

    float r =  3.2406 * x - 1.5372 * y - 0.4986 * z;
    float g = -0.9689 * x + 1.8758 * y + 0.0415 * z;
    float b =  0.0557 * x - 0.2040 * y + 1.0570 * z;

    float lift = min(min(r, g), min(b, 0.0));
    r -= lift; g -= lift; b -= lift;
    float denom = max(max(r, g), max(b, 1e-6));
    return vec3(r, g, b) / denom;
}

vec3 getPalette(float t, int idx) {
    vec3 a, b, c, d;
    if (idx == 0) { // Tropical Candy
        a = vec3(0.8, 0.5, 0.6); b = vec3(0.4, 0.4, 0.4); c = vec3(1.0, 1.0, 1.0); d = vec3(0.0, 0.33, 0.67);
    } else if (idx == 1) { // Ultraviolet
        a = vec3(0.5, 0.2, 0.8); b = vec3(0.5, 0.4, 0.2); c = vec3(1.0, 1.0, 1.0); d = vec3(0.3, 0.2, 0.8);
    } else if (idx == 2) { // Citrus
        a = vec3(0.9, 0.6, 0.2); b = vec3(0.2, 0.5, 0.2); c = vec3(1.0, 1.0, 1.0); d = vec3(0.1, 0.2, 0.3);
    } else if (idx == 3) { // Opaline
        a = vec3(0.4, 0.7, 0.8); b = vec3(0.3, 0.3, 0.4); c = vec3(1.0, 1.0, 1.0); d = vec3(0.5, 0.6, 0.7);
    } else { // Electric Sunset
        a = vec3(0.8, 0.3, 0.5); b = vec3(0.4, 0.2, 0.3); c = vec3(1.0, 1.0, 1.0); d = vec3(0.0, 0.15, 0.3);
    }
    return a + b * cos(6.28318 * (c * t + d));
}
`;

const pass1FS = `#version 300 es
${commonGLSL}
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D u_prev;
uniform float u_corr;
uniform float u_plasma;
uniform float u_spores;

float sdCross(vec2 p, float s) {
    vec2 b = vec2(s, s*0.25);
    p = abs(p); p = (p.y>p.x) ? p.yx : p.xy;
    vec2 q = p - b;
    float k = max(q.y,q.x);
    vec2 w = (k>0.0) ? q : vec2(b.y-p.x,-k);
    return sign(k)*length(max(w,0.0));
}

void main() {
    vec2 uv = vUv;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 aUv = vec2(uv.x * aspect, uv.y);
    vec2 aMouse = vec2(u_mouse.x * aspect, u_mouse.y);
    
    // Fluid advection drift
    vec2 flow = vec2(noise(uv * 4.0 + u_time * 0.2), noise(uv * 4.0 - u_time * 0.2 + 10.0)) - 0.5;
    vec2 prevUv = uv - flow * 0.003;
    
    vec2 md = aUv - aMouse;
    float mdL = length(md);
    
    if (u_click > 0.5) {
        prevUv += normalize(md) * exp(-mdL * 15.0) * 0.015;
    }
    
    if (u_pulse > 0.0) {
        float ring = smoothstep(0.03, 0.0, abs(mdL - u_pulse));
        prevUv -= normalize(md) * ring * 0.03;
    }

    vec3 col = texture(u_prev, prevUv).rgb * 0.94; // Persistence fade

    // Plasma Filaments
    if (u_plasma > 0.0) {
        float p = 0.0;
        for(int i=0; i<3; i++) {
            vec2 puv = aUv * (2.0 + float(i));
            puv.y += u_time * (0.3 + float(i)*0.1);
            puv.x += sin(puv.y * 2.0 + u_time) * 0.2;
            float n = fbm(puv * 2.0);
            p += 0.003 / (abs(puv.x - 1.5 + n) + 0.002);
        }
        col += vec3(0.2, 0.8, 1.0) * p * u_plasma;
    }

    // Alchemical Spores
    if (u_spores > 0.0) {
        vec2 suv = aUv * 8.0;
        suv.x += u_time * 0.15;
        suv.y += sin(suv.x * 0.5) * 0.5;
        vec2 id = floor(suv);
        vec2 gv = fract(suv) - 0.5;
        if (hash(id * 13.37) > 0.85) {
            float d = sdCross(gv, 0.12);
            float glow = exp(-abs(d) * 25.0);
            col += vec3(0.9, 0.3, 0.7) * glow * u_spores * (0.5 + 0.5*sin(u_time * 2.0 + id.x));
        }
    }

    // Glass Patterns (Hidden Correlation)
    if (u_corr > 0.0) {
        vec2 guv = uv * 120.0;
        float dot1 = step(0.85, hash(floor(guv)));
        float c = cos(0.5), s = sin(0.5);
        vec2 rguv = vec2(c*guv.x - s*guv.y, s*guv.x + c*guv.y) * 1.05;
        float dot2 = step(0.85, hash(floor(rguv)));
        float glass = mix(dot1, dot2, u_corr);
        float reveal = smoothstep(0.4, 0.0, abs(mdL - u_pulse));
        col += vec3(0.1, 0.9, 0.6) * glass * reveal * 0.8;
    }

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const pass2FS = `#version 300 es
${commonGLSL}
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D u_feedback;
uniform int u_palette;
uniform float u_depth_exag;

void main() {
    vec2 uv = vUv;
    vec3 col = vec3(0.0);

    // Deep fluid background (Color Space Warp)
    float bgNoise = fbm(uv * 1.5 + u_time * 0.08);
    col = getPalette(bgNoise + u_time * 0.04, u_palette);
    col = clamp(col, 0.1, 0.85); // Avoid pure black/white

    vec2 refractUV = uv;
    float totalEdge = 0.0;

    // Asymmetric translucent membranes
    for(int i = 1; i <= 5; i++) {
        float fi = float(i);
        vec2 p = uv * (0.8 + fi * 0.25);
        p.y += sin(p.x * 2.5 + u_time * 0.15 * fi) * 0.25;
        p.x += cos(p.y * 1.8 - u_time * 0.1 * fi) * 0.2;

        float thick = fbm(p * 2.5);
        float mask = smoothstep(0.35, 0.65, thick);

        if (mask > 0.0) {
            // Birefringence (Michel-Levy interference)
            float retardance = thick * 1800.0; 
            vec3 interference = spectral_cie(retardance);

            // Diffraction Grating (Shimmering edges)
            float edge = smoothstep(0.4, 0.5, thick) - smoothstep(0.5, 0.6, thick);
            float diff = sin(thick * 250.0) * 0.5 + 0.5;
            vec3 diffCol = spectral_cie(400.0 + diff * 350.0);

            // Chromadepth encoding
            vec3 depthCol = getPalette(fi / 5.0, (u_palette + 2) % 5);
            vec3 layerCol = mix(interference, depthCol, 0.6) + diffCol * edge * 1.2;

            // Chromostereopsis (Red advances, Blue recedes on edges)
            layerCol += vec3(edge * u_depth_exag, 0.0, edge * (1.0 - u_depth_exag));

            col = mix(col, layerCol, mask * 0.75);

            // Accumulate refraction
            float eps = 0.01;
            float dx = fbm(p + vec2(eps, 0.0)) - fbm(p - vec2(eps, 0.0));
            float dy = fbm(p + vec2(0.0, eps)) - fbm(p - vec2(0.0, eps));
            refractUV += vec2(dx, dy) * 0.04 * mask;
            totalEdge += edge;
        }
    }

    // Blend Feedback Layer (Plasma, Spores, Glass Patterns)
    vec2 dir = normalize(uv - 0.5);
    float dist = length(uv - 0.5);
    
    // Chromatic Aberration on energetic feedback layer
    float shift = dist * 0.008 + totalEdge * 0.005;
    float fbR = texture(u_feedback, refractUV + dir * shift).r;
    float fbG = texture(u_feedback, refractUV).g;
    float fbB = texture(u_feedback, refractUV - dir * shift).b;
    vec3 fbCol = vec3(fbR, fbG, fbB);

    col = col + fbCol * 1.2;

    // Simultaneous Contrast (Local saturation boost)
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 1.25);

    // Impossible Colors (Complement fatigue halo on bright spots)
    vec3 comp = vec3(1.0) - col;
    col += comp * smoothstep(0.8, 1.0, lum) * 0.2;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
    }
    return s;
}

function createProgram(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compileShader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compileShader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    return p;
}

const prog1 = createProgram(quadVS, pass1FS);
const prog2 = createProgram(quadVS, pass2FS);

const quadBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

let fbos = [];
function initFBOs() {
    fbos.forEach(f => { gl.deleteFramebuffer(f.fbo); gl.deleteTexture(f.tex); });
    fbos = [0, 1].map(() => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, canvas.width, canvas.height, 0, gl.RGBA, gl.HALF_FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { fbo, tex };
    });
}
initFBOs();

let pingPong = 0;

function setUniforms(p) {
    gl.uniform1f(gl.getUniformLocation(p, "u_time"), state.time);
    gl.uniform2f(gl.getUniformLocation(p, "u_resolution"), canvas.width, canvas.height);
    gl.uniform2f(gl.getUniformLocation(p, "u_mouse"), state.mouse[0], state.mouse[1]);
    gl.uniform1f(gl.getUniformLocation(p, "u_click"), state.click);
    gl.uniform1f(gl.getUniformLocation(p, "u_pulse"), state.pulse);
    gl.uniform1i(gl.getUniformLocation(p, "u_palette"), state.palette);
    gl.uniform1f(gl.getUniformLocation(p, "u_depth_exag"), state.depth_exag);
    gl.uniform1f(gl.getUniformLocation(p, "u_corr"), state.corr);
    gl.uniform1f(gl.getUniformLocation(p, "u_plasma"), state.plasma);
    gl.uniform1f(gl.getUniformLocation(p, "u_spores"), state.spores);
}

function render(t) {
    state.time = t * 0.001;
    if (state.pulse > 0.0) {
        state.pulse += 0.015;
        if (state.pulse > 1.5) state.pulse = 0.0;
    }

    gl.bindVertexArray(vao);

    // Pass 1: Feedback
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[1 - pingPong].fbo);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog1);
    setUniforms(prog1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fbos[pingPong].tex);
    gl.uniform1i(gl.getUniformLocation(prog1, "u_prev"), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Pass 2: Main Render to Screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog2);
    setUniforms(prog2);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fbos[1 - pingPong].tex);
    gl.uniform1i(gl.getUniformLocation(prog2, "u_feedback"), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    pingPong = 1 - pingPong;
    requestAnimationFrame(render);
}

requestAnimationFrame(render);