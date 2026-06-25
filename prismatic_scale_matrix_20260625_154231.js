// Prismatic Scale Matrix
// A WebGL2 generative artwork combining snakeskin morphology, 
// domain coloring, false-color optics, diffraction, and birefringence.

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.backgroundColor = '#050505';
canvas.style.display = 'block';
canvas.style.width = '100vw';
canvas.style.height = '100vh';

// Minimal UI overlay for interaction cues
const ui = document.createElement('div');
ui.style.cssText = `
  position: absolute; bottom: 10px; left: 10px; color: #fff; 
  font-family: monospace; font-size: 10px; opacity: 0.5; pointer-events: none;
  text-shadow: 0 1px 2px #000; z-index: 10;
`;
ui.innerHTML = `[DRAG] Light Angle | [CLICK] Pulse | [C] Palette | [F] False Color | [D] Domain Style | [O] Optical Intensity | [P] Scale Packing`;
document.body.appendChild(ui);

const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true });
if (!gl) throw new Error('WebGL2 required');

const VERTEX_SHADER = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;
uniform vec2 u_light_dir;
uniform vec2 u_click_pos;
uniform float u_click_time;

uniform int u_palette;
uniform int u_false_color;
uniform int u_domain;
uniform float u_optical;
uniform int u_packing;

#define PI 3.14159265359
#define TAU 6.28318530718

// --- Math & Complex Plane ---
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
vec2 cdiv(vec2 a, vec2 b) { float d = dot(b,b); return vec2(dot(a,b), a.y*b.x - a.x*b.y)/d; }
vec2 cpow(vec2 z, float n) {
    float r = length(z); float a = atan(z.y, z.x);
    return pow(r, n) * vec2(cos(n*a), sin(n*a));
}

// --- Hash & Noise ---
vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
}
float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// --- Color Systems (OKLCh to sRGB) ---
vec3 oklab_to_linear(vec3 c) {
    float l = c.x * c.x * c.x;
    float m = c.y * c.y * c.y;
    float s = c.z * c.z * c.z;
    return vec3(
         4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    );
}
vec3 linear_to_srgb(vec3 c) {
    vec3 lo = 12.92 * c;
    vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0/2.4)) - 0.055;
    return mix(lo, hi, step(vec3(0.0031308), c));
}
vec3 oklch_to_srgb(float L, float C, float h) {
    float h_rad = h * PI / 180.0;
    vec3 oklab = vec3(L, C * cos(h_rad), C * sin(h_rad));
    float l_ = oklab.x + 0.3963377774 * oklab.y + 0.2158037573 * oklab.z;
    float m_ = oklab.x - 0.1055613458 * oklab.y - 0.0638541728 * oklab.z;
    float s_ = oklab.x - 0.0894841775 * oklab.y - 1.2914855480 * oklab.z;
    return clamp(linear_to_srgb(oklab_to_linear(vec3(l_, m_, s_))), 0.0, 1.0);
}

// --- Palettes ---
vec3 getPalette(int id, float t) {
    t = fract(t);
    float L, C, h;
    if (id == 0) { // Candy Prism
        L = 0.75; C = 0.35; h = t * 360.0;
    } else if (id == 1) { // Ultraviolet Jewel
        L = 0.65; C = 0.35; h = 250.0 + t * 110.0;
    } else if (id == 2) { // Tropical Foil
        L = 0.70; C = 0.30; h = 140.0 + t * 140.0;
    } else if (id == 3) { // Electric Opal
        L = 0.85; C = 0.20; h = t * 360.0;
    } else { // Neon Mineral
        L = 0.70; C = 0.35; h = 30.0 + t * 200.0;
    }
    return oklch_to_srgb(L, C, h);
}

// --- Scale SDFs ---
float scaleShape(vec2 p, int type) {
    if (type == 0) return 1.0 - (abs(p.x)*1.1 + abs(p.y)*0.8); // Diamond
    if (type == 1) return 1.0 - length(p * vec2(1.1, 0.8)); // Rounded/Bead
    // Shield
    return 1.0 - max(abs(p.x)*1.1, length(p * vec2(1.0, 0.6))); 
}

void main() {
    // Aspect ratio and grid setup
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
    vec2 st = uv * 12.0; // Grid scale
    
    // Imbrication / Staggered Grid Traversal
    vec2 base_id = floor(st);
    
    float max_z = -9999.0;
    vec2 best_local = vec2(0.0);
    vec2 best_id = vec2(0.0);
    float best_height = 0.0;
    float best_d = 0.0;
    
    // Check neighborhood for overlapping scales (back to front)
    for(int y = -2; y <= 2; y++) {
        for(int x = -1; x <= 1; x++) {
            vec2 cell_id = base_id + vec2(float(x), float(y));
            // Stagger rows
            vec2 cell_center = vec2(cell_id.x + mod(cell_id.y, 2.0)*0.5, cell_id.y * 0.65);
            // Jitter for organic feel
            cell_center += (hash22(cell_id) - 0.5) * 0.15;
            
            vec2 local_uv = st - cell_center;
            
            float d = scaleShape(local_uv, u_packing);
            if (d > 0.0) {
                // Add keel (central ridge)
                float keel = 0.25 * exp(-abs(local_uv.x)*12.0);
                float height = d + keel;
                
                // Z-sort: scales lower on Y axis overlap higher ones
                float z = height - cell_id.y * 0.05;
                if (z > max_z) {
                    max_z = z;
                    best_local = local_uv;
                    best_id = cell_id;
                    best_height = height;
                    best_d = d;
                }
            }
        }
    }
    
    // Background void (deep depth tone)
    if (max_z < -9000.0) {
        fragColor = vec4(oklch_to_srgb(0.2, 0.15, 300.0), 1.0);
        return;
    }
    
    // --- Scale Surface Attributes ---
    float cell_hash = hash21(best_id);
    
    // Click Ripple
    vec2 click_st = (u_click_pos - 0.5) * (u_res / min(u_res.x, u_res.y)) * 12.0;
    float dist_to_click = length(vec2(best_id.x + mod(best_id.y, 2.0)*0.5, best_id.y*0.65) - click_st);
    float ripple = 0.0;
    if (u_click_time > 0.0) {
        float t_click = u_time - u_click_time;
        ripple = exp(-dist_to_click * 0.2 - t_click * 2.0) * sin(dist_to_click * 2.0 - t_click * 15.0) * 0.5;
    }
    
    // --- Domain Coloring ---
    vec2 z = best_local * 2.5;
    vec2 w;
    if (u_domain == 0) w = cmul(z, cmul(z, z)) - vec2(1.0, 0.0);
    else if (u_domain == 1) w = cdiv(cmul(z, z) - vec2(1.0, 0.0), cmul(z, z) + vec2(0.5, 0.0));
    else w = vec2(sin(z.x)*cosh(z.y), cos(z.x)*sinh(z.y));
    
    float arg = atan(w.y, w.x);
    float mag = length(w);
    float domain_hue = arg / TAU + 0.5;
    float domain_contour = fract(log(mag) * 3.0);
    
    // --- False Color & Base Color ---
    float color_t = cell_hash + u_time * 0.1 + ripple;
    if (u_false_color == 1) color_t += best_height * 2.0;
    else if (u_false_color == 2) color_t += domain_hue;
    else if (u_false_color == 3) color_t += domain_contour * 0.2;
    
    vec3 base_color = getPalette(u_palette, color_t);
    
    // --- Optics: Birefringence (Michel-Levy) ---
    float retardance = best_height * 2500.0 * u_optical + ripple * 1000.0;
    vec3 biref = 0.5 + 0.5 * cos(TAU * (retardance / vec3(650.0, 530.0, 430.0)));
    base_color = mix(base_color, biref, u_optical * 0.6 * smoothstep(0.2, 0.8, best_height));
    
    // --- Optics: Diffraction Grating ---
    // High frequency grating mapped to viewing angle
    float view_angle = u_light_dir.x * 10.0 + u_light_dir.y * 10.0;
    float grating = sin(dot(best_local, vec2(150.0, 200.0)) + view_angle);
    float diff_intensity = smoothstep(0.85, 1.0, grating) * u_optical;
    vec3 diff_color = getPalette(u_palette, fract(view_angle * 0.1 + cell_hash));
    base_color += diff_color * diff_intensity * 0.8;
    
    // --- Optics: Chromostereopsis (Red/Blue Depth Edges) ---
    // Pure red/blue on extreme edges to force perceptual depth
    float edge_dist = best_d; // 0 at edge, 1 at center
    vec3 chromo = vec3(0.0);
    if (u_optical > 0.0) {
        float r_edge = smoothstep(0.15, 0.0, edge_dist) * smoothstep(0.0, 0.5, best_local.x + best_local.y);
        float b_edge = smoothstep(0.15, 0.0, edge_dist) * smoothstep(0.0, 0.5, -best_local.x - best_local.y);
        base_color = mix(base_color, vec3(1.0, 0.0, 0.0), r_edge * 0.7);
        base_color = mix(base_color, vec3(0.0, 0.0, 1.0), b_edge * 0.7);
    }
    
    // --- Shading & Lighting ---
    // Compute normal from height gradient
    vec2 eps = vec2(0.01, 0.0);
    float dx = scaleShape(best_local + eps, u_packing) + 0.25*exp(-abs(best_local.x + eps.x)*12.0) - best_height;
    float dy = scaleShape(best_local + eps.yx, u_packing) + 0.25*exp(-abs(best_local.x)*12.0) - best_height;
    vec3 N = normalize(vec3(-dx, -dy, 0.05));
    
    vec3 L = normalize(vec3(u_light_dir.x, u_light_dir.y, 1.0));
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 H = normalize(L + V);
    
    // Specular highlight (Prismatic)
    float spec = pow(max(dot(N, H), 0.0), 32.0);
    vec3 spec_color = getPalette((u_palette + 1) % 5, best_height + u_time * 0.2);
    base_color += spec_color * spec * 1.5 * u_optical;
    
    // Imbrication Shadow (darken edges slightly to ground them)
    base_color *= mix(0.4, 1.0, smoothstep(0.0, 0.3, edge_dist));
    
    // Tiny white pinpoint highlight
    float pinpoint = pow(max(dot(N, H), 0.0), 256.0);
    base_color += vec3(pinpoint);
    
    fragColor = vec4(clamp(base_color, 0.0, 1.0), 1.0);
}`;

// WebGL Setup
const program = gl.createProgram();
const vs = gl.createShader(gl.VERTEX_SHADER);
const fs = gl.createShader(gl.FRAGMENT_SHADER);

gl.shaderSource(vs, VERTEX_SHADER);
gl.compileShader(vs);
if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(vs));

gl.shaderSource(fs, FRAGMENT_SHADER);
gl.compileShader(fs);
if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(fs));

gl.attachShader(program, vs);
gl.attachShader(program, fs);
gl.linkProgram(program);
gl.useProgram(program);

// Quad geometry
const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1, -1,  1,
    -1,  1,  1, -1,  1,  1
]), gl.STATIC_DRAW);

const posLoc = gl.getAttribLocation(program, 'position');
gl.enableVertexAttribArray(posLoc);
gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

// Uniforms
const locs = {
    u_res: gl.getUniformLocation(program, 'u_res'),
    u_time: gl.getUniformLocation(program, 'u_time'),
    u_mouse: gl.getUniformLocation(program, 'u_mouse'),
    u_light_dir: gl.getUniformLocation(program, 'u_light_dir'),
    u_click_pos: gl.getUniformLocation(program, 'u_click_pos'),
    u_click_time: gl.getUniformLocation(program, 'u_click_time'),
    u_palette: gl.getUniformLocation(program, 'u_palette'),
    u_false_color: gl.getUniformLocation(program, 'u_false_color'),
    u_domain: gl.getUniformLocation(program, 'u_domain'),
    u_optical: gl.getUniformLocation(program, 'u_optical'),
    u_packing: gl.getUniformLocation(program, 'u_packing')
};

// State
let state = {
    palette: 0,
    falseColor: 1,
    domain: 0,
    optical: 1.0,
    packing: 0,
    lightDir: [0.5, 0.5],
    clickPos: [0.5, 0.5],
    clickTime: -100.0,
    isDragging: false
};

// Interaction
window.addEventListener('resize', resize);
function resize() {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    gl.viewport(0, 0, canvas.width, canvas.height);
}
resize();

window.addEventListener('pointerdown', e => {
    state.isDragging = true;
    state.clickPos = [e.clientX / window.innerWidth, 1.0 - e.clientY / window.innerHeight];
    state.clickTime = performance.now() / 1000.0;
});

window.addEventListener('pointermove', e => {
    if (state.isDragging) {
        state.lightDir = [
            (e.clientX / window.innerWidth) * 2.0 - 1.0,
            (1.0 - e.clientY / window.innerHeight) * 2.0 - 1.0
        ];
    }
});

window.addEventListener('pointerup', () => state.isDragging = false);

window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key === 'c') state.palette = (state.palette + 1) % 5;
    if (key === 'f') state.falseColor = (state.falseColor + 1) % 4;
    if (key === 'd') state.domain = (state.domain + 1) % 3;
    if (key === 'o') state.optical = state.optical > 0.5 ? 0.0 : 1.0;
    if (key === 'p') state.packing = (state.packing + 1) % 3;
});

// Render Loop
function render(now) {
    gl.uniform2f(locs.u_res, canvas.width, canvas.height);
    gl.uniform1f(locs.u_time, now / 1000.0);
    gl.uniform2f(locs.u_mouse, state.lightDir[0], state.lightDir[1]);
    gl.uniform2f(locs.u_light_dir, state.lightDir[0], state.lightDir[1]);
    gl.uniform2f(locs.u_click_pos, state.clickPos[0], state.clickPos[1]);
    gl.uniform1f(locs.u_click_time, state.clickTime);
    
    gl.uniform1i(locs.u_palette, state.palette);
    gl.uniform1i(locs.u_false_color, state.falseColor);
    gl.uniform1i(locs.u_domain, state.domain);
    gl.uniform1f(locs.u_optical, state.optical);
    gl.uniform1i(locs.u_packing, state.packing);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(render);
}
requestAnimationFrame(render);