if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");

    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.autoClear = false;

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const rtOpts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType
    };
    const rtA = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);
    const rtB = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOpts);

    const commonGLSL = `
vec3 oklab_to_linear_srgb(vec3 c) {
    float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
    float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
    float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
    float l = l_ * l_ * l_;
    float m = m_ * m_ * m_;
    float s = s_ * s_ * s_;
    return vec3(
         4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    );
}

vec3 linear_to_srgb(vec3 c) {
    vec3 s1 = c * 12.92;
    vec3 s2 = 1.055 * pow(clamp(c, 0.0, 1.0), vec3(1.0/2.4)) - 0.055;
    return mix(s1, s2, step(0.0031308, c));
}

vec3 oklch_to_srgb(vec3 lch) {
    float L = lch.x; 
    float C = lch.y; 
    float h = lch.z * 3.14159265359 / 180.0;
    return linear_to_srgb(oklab_to_linear_srgb(vec3(L, C * cos(h), C * sin(h))));
}
    `;

    const matScene = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_prev: { value: null },
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
uniform sampler2D u_prev;
uniform vec2 u_resolution;

${commonGLSL}

mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    return (p.x + p.y + p.z - s) * 0.57735027;
}

vec4 map(vec3 p) {
    // Core Reactor (Crystalline / Demoscene)
    vec3 pCore = p;
    pCore.xy *= rot(u_time * 0.5);
    pCore.yz *= rot(u_time * 0.3);
    float dCore = sdOctahedron(pCore, 0.8) + sin(p.x * 10.0 + u_time * 5.0) * 0.05 + sin(p.y * 10.0 + u_time * 5.0) * 0.05;
    
    // Orbiting Rings
    vec3 pRing = p;
    pRing.xz *= rot(-u_time * 0.4);
    pRing.yz *= rot(u_time * 0.2);
    float dRing = sdTorus(pRing, vec2(1.4, 0.05));
    dRing -= sin(pRing.x * 30.0 + u_time * 10.0) * 0.02; // Cuttlefish rippling
    
    // Internet Debris (Floating Windows)
    vec3 pDeb = p;
    pDeb.z += u_time * 2.0;
    pDeb.xy *= rot(u_time * 0.1);
    pDeb = mod(pDeb + 3.0, 6.0) - 3.0;
    float dDeb = sdBox(pDeb, vec3(0.5, 0.4, 0.02));
    
    float d = min(dCore, dRing);
    float id = d == dCore ? 1.0 : 2.0;
    
    if (dDeb < d) { d = dDeb; id = 3.0; }
    
    return vec4(d, id, p.xy);
}

vec3 calcNormal(vec3 p) {
    vec2 e = vec2(0.01, 0.0);
    return normalize(vec3(
        map(p + e.xyy).x - map(p - e.xyy).x,
        map(p + e.yxy).x - map(p - e.yxy).x,
        map(p + e.yyx).x - map(p - e.yyx).x
    ));
}

vec3 wallpaper(vec2 uv) {
    vec2 g = fract(uv * 6.0) - 0.5;
    float cell = length(g);
    float a = sin(u_time * 4.0 + uv.x * 12.0 + uv.y * 12.0);
    float r = 0.2 * (1.0 + 1.24 * a); // Chromatophore expansion
    float mask = smoothstep(r, r - 0.05, cell);
    
    vec3 bgCol = oklch_to_srgb(vec3(0.25, 0.18, 280.0 + uv.y * 30.0));
    vec3 fgCol = oklch_to_srgb(vec3(0.75, 0.25, 340.0 + uv.x * 30.0));
    
    return mix(bgCol, fgCol, mask);
}

void main() {
    vec2 uv = vUv;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;
    
    vec3 ro = vec3(0.0, 0.0, 4.0);
    vec3 rd = normalize(vec3(p, -1.5));
    ro.xy *= rot(sin(u_time * 0.3) * 0.3);
    rd.xy *= rot(sin(u_time * 0.3) * 0.3);
    
    float t = 0.0;
    float id = 0.0;
    vec3 pos;
    for(int i = 0; i < 64; i++) {
        pos = ro + rd * t;
        vec4 res = map(pos);
        if(res.x < 0.005) { id = res.y; break; }
        t += res.x;
        if(t > 15.0) break;
    }
    
    // Autostereogram depth shift background
    float depth = 1.0 - clamp(t / 10.0, 0.0, 1.0);
    float E = 0.15;
    float mu = 0.5;
    float sep = E * (1.0 - mu * depth) / (2.0 - mu * depth);
    vec2 shiftUv = vec2(mod(uv.x - sep, E), uv.y);
    
    vec3 col = wallpaper(shiftUv * 10.0);
    
    if (id > 0.0) {
        vec3 n = calcNormal(pos);
        vec3 light = normalize(vec3(1.0, 1.0, 1.0));
        float diff = max(dot(n, light), 0.0);
        float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
        
        if (id == 1.0) {
            vec3 coreCol = oklch_to_srgb(vec3(0.8, 0.22, 160.0 + sin(u_time) * 20.0));
            col = coreCol * diff + vec3(1.0) * fresnel;
        } else if (id == 2.0) {
            vec3 ringCol = oklch_to_srgb(vec3(0.75, 0.25, 45.0));
            col = ringCol * diff + vec3(1.0) * fresnel;
        } else if (id == 3.0) {
            vec3 debCol = oklch_to_srgb(vec3(0.65, 0.2, 230.0));
            float border = step(0.45, max(abs(fract(pos.x * 2.0) - 0.5), abs(fract(pos.y * 2.0) - 0.5)));
            col = mix(debCol, vec3(0.9), border);
        }
    }
    
    // Datamosh & Temporal Damage
    float blockSize = 30.0;
    vec2 blockUV = floor(uv * blockSize) / blockSize;
    float blockHash = fract(sin(dot(blockUV, vec2(12.9898, 78.233))) * 43758.5453);
    
    vec2 motion = vec2(sin(uv.y * 8.0 + u_time), cos(uv.x * 8.0 + u_time)) * 0.002;
    if (blockHash > 0.9) {
        motion += (vec2(fract(blockHash * 13.0), fract(blockHash * 17.0)) - 0.5) * 0.03;
    }
    
    vec3 prev = texture(u_prev, uv - motion).rgb;
    float echo = 0.82;
    
    // Glitchcore rupture
    if (fract(u_time * 1.8) > 0.9) {
        echo = 0.96;
        if (blockHash > 0.6) col.rgb = prev.gbr;
    }
    
    col = mix(col, prev, echo);
    fragColor = vec4(col, 1.0);
}
      `
    });

    const matPost = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_scene: { value: null },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_time: { value: 0 }
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
uniform sampler2D u_scene;
uniform vec2 u_resolution;
uniform float u_time;

${commonGLSL}

vec3 flares(vec2 uv) {
    vec3 f = vec3(0.0);
    float weightSum = 0.0;
    for(int i = 0; i < 20; i++) {
        float xOff = (float(i) - 10.0) * 0.025;
        vec2 suv = uv + vec2(xOff, 0.0);
        vec3 samp = texture(u_scene, suv).rgb;
        float luma = dot(samp, vec3(0.2126, 0.7152, 0.0722));
        float w = smoothstep(0.6, 1.0, luma);
        vec3 tint = oklch_to_srgb(vec3(0.7, 0.25, 200.0 + float(i) * 6.0 + u_time * 50.0));
        f += samp * w * tint * (1.0 - abs(float(i) - 10.0) / 10.0);
        weightSum += 1.0;
    }
    return f / max(weightSum * 0.3, 1.0);
}

vec2 barrel(vec2 uv) {
    vec2 c = uv - 0.5;
    float r2 = dot(c, c);
    return c * (1.0 + 0.15 * r2) + 0.5;
}

vec3 crtMask(vec2 px) {
    float col = mod(px.x, 3.0);
    vec3 mask = vec3(
        smoothstep(1.0, 0.0, abs(col - 0.5)),
        smoothstep(1.0, 0.0, abs(col - 1.5)),
        smoothstep(1.0, 0.0, abs(col - 2.5))
    );
    return mix(vec3(1.0), mask, 0.7);
}

void main() {
    vec2 uv = barrel(vUv);
    
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        fragColor = vec4(oklch_to_srgb(vec3(0.2, 0.15, 280.0)), 1.0);
        return;
    }
    
    // Chromatic Aberration
    vec2 dir = uv - 0.5;
    float ca = 0.02;
    float r = texture(u_scene, uv + dir * ca).r;
    float g = texture(u_scene, uv).g;
    float b = texture(u_scene, uv - dir * ca).b;
    vec3 col = vec3(r, g, b);
    
    // Anamorphic Lens Flares
    col += flares(uv) * 1.8;
    
    // CRT Mask & Scanlines
    vec2 px = uv * u_resolution;
    vec3 mask = crtMask(px);
    float scan = 0.5 + 0.5 * sin(uv.y * u_resolution.y * 3.14159);
    col *= mask;
    col *= mix(1.0, scan, 0.25);
    
    // Color Safety (No pure black/white)
    vec3 dark = oklch_to_srgb(vec3(0.25, 0.18, 300.0)); // Plum
    vec3 bright = oklch_to_srgb(vec3(0.85, 0.2, 190.0)); // Cyan
    
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = max(col, dark * (1.0 - smoothstep(0.0, 0.35, luma)));
    col = min(col, mix(col, bright, smoothstep(0.75, 1.0, luma)));
    
    // Vignette
    float vig = smoothstep(1.2, 0.3, length(uv - 0.5) * 1.5);
    col *= vig;
    
    fragColor = vec4(col, 1.0);
}
      `
    });

    const scene1 = new THREE.Scene();
    const scene2 = new THREE.Scene();
    const mesh1 = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matScene);
    const mesh2 = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matPost);
    scene1.add(mesh1);
    scene2.add(mesh2);

    canvas.__three = { renderer, camera, rtA, rtB, scene1, scene2, matScene, matPost, ping: true };
  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
    return;
  }
}

const { renderer, camera, rtA, rtB, scene1, scene2, matScene, matPost } = canvas.__three;
const ping = canvas.__three.ping;

if (matScene && matScene.uniforms) {
  matScene.uniforms.u_time.value = time;
  matScene.uniforms.u_resolution.value.set(grid.width, grid.height);
  matScene.uniforms.u_prev.value = ping ? rtB.texture : rtA.texture;
}

if (matPost && matPost.uniforms) {
  matPost.uniforms.u_time.value = time;
  matPost.uniforms.u_resolution.value.set(grid.width, grid.height);
  matPost.uniforms.u_scene.value = ping ? rtA.texture : rtB.texture;
}

renderer.setSize(grid.width, grid.height, false);

try {
  renderer.setRenderTarget(ping ? rtA : rtB);
  renderer.render(scene1, camera);

  renderer.setRenderTarget(null);
  renderer.render(scene2, camera);
} catch (e) {
  console.error("Render Loop Failed:", e);
}

canvas.__three.ping = !ping;