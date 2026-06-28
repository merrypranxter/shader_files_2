export function render(ctx, grid, time, repos, input, mouse, canvas, THREE) {
  if (!canvas.__three) {
    try {
      if (!ctx) throw new Error("WebGL 2 context not available");

      const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 1;

      const vertexShader = `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `;

      const fragmentShader = `
#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

// --- Complex Math for Domain Coloring ---
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
vec2 cdiv(vec2 a, vec2 b) { float d = dot(b,b)+1e-9; return vec2(dot(a,b), a.y*b.x - a.x*b.y)/d; }
vec2 cexp(vec2 z) { return exp(z.x) * vec2(cos(z.y), sin(z.y)); }

// --- OKLab to sRGB (color_systems + impossible_colors) ---
vec3 oklab_to_srgb(vec3 c) {
    float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
    float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
    float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;

    float l = l_ * l_ * l_;
    float m = m_ * m_ * m_;
    float s = s_ * s_ * s_;

    vec3 rgb = vec3(
         4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    );
    
    vec3 srgb = vec3(
        rgb.r <= 0.0031308 ? 12.92 * rgb.r : 1.055 * pow(max(rgb.r, 0.0), 1.0/2.4) - 0.055,
        rgb.g <= 0.0031308 ? 12.92 * rgb.g : 1.055 * pow(max(rgb.g, 0.0), 1.0/2.4) - 0.055,
        rgb.b <= 0.0031308 ? 12.92 * rgb.b : 1.055 * pow(max(rgb.b, 0.0), 1.0/2.4) - 0.055
    );
    return clamp(srgb, 0.0, 1.0);
}

vec3 oklch_to_oklab(vec3 lch) {
    return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
}

vec3 oklch_to_srgb(vec3 lch) {
    return oklab_to_srgb(oklch_to_oklab(lch));
}

// --- Saturated Perceptual Color Palette ---
vec3 get_vivid_color(float hue_angle) {
    float L = 0.65 + 0.1 * sin(hue_angle * 3.0); 
    float C = 0.25 + 0.05 * cos(hue_angle * 2.0); 
    return oklch_to_srgb(vec3(L, C, hue_angle));
}

// --- Hashing ---
float hash11(float p) {
    p = fract(p * .1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

float hash21(vec2 p) {
    vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// --- Opal / Prism Dispersion Shimmer ---
vec3 opal_shimmer(float r, float a, float t) {
    float n = sin(r * 50.0 - t * 5.0) * cos(a * 30.0 + t * 3.0);
    float h = n * TAU + t;
    return get_vivid_color(h) * abs(n);
}

// --- Procedural Micro-Sigils (sigil_engine) ---
float sigil(vec2 uv, float id, float t) {
    uv = uv * 2.0 - 1.0;
    uv *= 1.5;
    
    float d = 1.0;
    float seed = hash11(id + 1.23);
    
    float angle = (hash11(seed) - 0.5) * 0.5;
    float ca = cos(angle), sa = sin(angle);
    uv = vec2(uv.x*ca - uv.y*sa, uv.x*sa + uv.y*ca);
    
    uv.x = abs(uv.x); // Bilateral symmetry
    
    float breathe = sin(t * 3.0 + seed * TAU) * 0.1;
    
    for(int i=0; i<5; i++) {
        float fi = float(i);
        vec2 p1 = vec2(hash11(seed+fi*0.1), hash11(seed+fi*0.2)*2.0-1.0) * (1.0 + breathe);
        vec2 p2 = vec2(hash11(seed+fi*0.3), hash11(seed+fi*0.4)*2.0-1.0) * (1.0 - breathe);
        
        vec2 pa = uv - p1, ba = p2 - p1;
        float h = clamp( dot(pa,ba)/(dot(ba,ba)+1e-4), 0.0, 1.0 );
        float dist = length( pa - ba*h );
        d = min(d, dist);
    }
    
    float distDot = length(uv - vec2(hash11(seed+0.8), hash11(seed+0.9)*2.0-1.0));
    d = min(d, max(distDot - 0.05, 0.0));
    
    float crisp = smoothstep(0.04, 0.01, d);
    float glass = smoothstep(0.15, 0.0, d) * 0.5;
    
    return crisp + glass;
}

// --- Complex Domain Coloring Background ---
vec3 domain_coloring(vec2 z, float t) {
    float r = length(z);
    float a = atan(z.y, z.x);
    
    float sector = a * 12.0 / TAU;
    float spiral = r * 6.0 - t * 3.0 + sin(sector * PI);
    
    vec2 w = cmul(z, cexp(vec2(0.5 * sin(r*3.0 - t*2.0), spiral)));
    w = cdiv(w + vec2(0.2*cos(t), 0.2*sin(t)), w - vec2(0.2*sin(t), 0.2*cos(t)));
    
    float mag = length(w);
    float phase = atan(w.y, w.x);
    
    float contours = fract(log(mag)*4.0 - t);
    float contourLine = smoothstep(0.1, 0.0, abs(contours - 0.5));
    
    float phaseBands = fract(phase * 12.0 / TAU + t);
    float phaseLine = smoothstep(0.1, 0.0, abs(phaseBands - 0.5));
    
    float h = phase + r*2.0 - t;
    vec3 base = get_vivid_color(h) * (0.3 + 0.2*sin(mag*20.0));
    
    base += contourLine * 0.4 * get_vivid_color(h + PI/2.0);
    base += phaseLine * 0.4 * get_vivid_color(h - PI/2.0);
    
    return base;
}

// --- Astrological Aspect Lines ---
float aspect_lines(vec2 uv, float t) {
    float lineDist = 1.0;
    for(int i=0; i<5; i++) {
        float fi = float(i);
        float a1 = t * (1.0 + fi*0.1) + fi * TAU/5.0;
        float a2 = t * (0.8 - fi*0.1) + (fi+2.0) * TAU/5.0;
        
        vec2 p1 = vec2(cos(a1), sin(a1)) * 0.45;
        vec2 p2 = vec2(cos(a2), sin(a2)) * 0.45;
        
        vec2 pa = uv - p1, ba = p2 - p1;
        float h = clamp( dot(pa,ba)/(dot(ba,ba)+1e-4), 0.0, 1.0 );
        float dist = length( pa - ba*h );
        lineDist = min(lineDist, dist);
    }
    return smoothstep(0.008, 0.002, lineDist);
}

void main() {
    vec2 uv = (vUv - 0.5) * 2.0;
    uv.x *= u_resolution.x / u_resolution.y;
    
    float r = length(uv);
    float a = atan(uv.y, uv.x);
    
    // Background Layer
    vec3 col = domain_coloring(uv * 1.5, u_time);
    col *= smoothstep(0.85 + 0.2, 0.85 - 0.1, r) * 0.5 + 0.5; 
    
    // Mesh Gradients Nebula
    vec3 nebula1 = get_vivid_color(a * 2.0 + u_time);
    vec3 nebula2 = get_vivid_color(r * 4.0 - u_time * 0.5);
    vec3 nebula = mix(nebula1, nebula2, 0.5 + 0.5*sin(a*3.0 + r*5.0));
    col = mix(col, nebula, 0.3 * smoothstep(1.3, 0.85, r));
    
    // Planetary Hours Rotation Offsets
    float t_outer = u_time * (0.05 + 0.02 * sin(u_time * 0.1));
    float t_inner = u_time * (0.08 + 0.03 * cos(u_time * 0.15));
    
    float a_outer = a - t_outer;
    float a_inner = a + t_inner;
    
    float sector_outer = fract(a_outer * 12.0 / TAU);
    float id_outer = floor(a_outer * 12.0 / TAU);
    
    float sector_inner = fract(a_inner * 12.0 / TAU);
    float id_inner = floor(a_inner * 12.0 / TAU);
    
    // Radial Structure
    float R_OUTER = 0.85;
    float R_MID = 0.65;
    float R_INNER = 0.45;
    float R_CORE = 0.2;
    float w = 0.005;
    
    float ringOuter = smoothstep(w, 0.0, abs(r - R_OUTER));
    float ringMid = smoothstep(w, 0.0, abs(r - R_MID));
    float ringInner = smoothstep(w, 0.0, abs(r - R_INNER));
    float ringCore = smoothstep(w, 0.0, abs(r - R_CORE));
    
    float ticksOuter = smoothstep(0.1, 0.0, abs(fract(a_outer * 360.0 / TAU) - 0.5)) * step(R_MID, r) * step(r, R_OUTER);
    float ticksInner = smoothstep(0.1, 0.0, abs(fract(a_inner * 60.0 / TAU) - 0.5)) * step(R_INNER, r) * step(r, R_MID);
    
    float lineOuter = smoothstep(0.48, 0.5, abs(sector_outer - 0.5)) * step(R_MID, r) * step(r, R_OUTER);
    float lineInner = smoothstep(0.47, 0.5, abs(sector_inner - 0.5)) * step(R_INNER, r) * step(r, R_MID);
    
    // Zodiac House Colors
    float breatheOuter = sin(u_time * 2.0 + id_outer * 1.618) * 0.5 + 0.5;
    vec3 c_outer = get_vivid_color(id_outer/12.0 * TAU + u_time*0.5);
    
    float breatheInner = sin(u_time * 3.0 + id_inner * 2.718) * 0.5 + 0.5;
    vec3 c_inner = get_vivid_color(id_inner/12.0 * TAU - u_time*0.8 + 1.0);
    
    // Sigil Overlays
    vec2 sigil_uv_outer = vec2((sector_outer - 0.5)*2.0, (r - (R_OUTER+R_MID)*0.5) / ((R_OUTER-R_MID)*0.5));
    float s_outer = sigil(sigil_uv_outer, id_outer, u_time);
    float flicker_outer = hash11(u_time * 5.0 + id_outer) > 0.8 ? 0.2 : 1.0;
    s_outer *= flicker_outer;
    
    vec2 sigil_uv_inner = vec2((sector_inner - 0.5)*2.0, (r - (R_MID+R_INNER)*0.5) / ((R_MID-R_INNER)*0.5));
    float s_inner = sigil(sigil_uv_inner, id_inner + 100.0, u_time);
    float flicker_inner = hash11(u_time * 4.0 + id_inner) > 0.8 ? 0.2 : 1.0;
    s_inner *= flicker_inner;
    
    // Outer Wheel Compositing
    if (r > R_MID && r <= R_OUTER) {
        col = mix(col, c_outer * 0.15, 0.8);
        col += c_outer * s_outer * (0.8 + breatheOuter*0.8);
        col += vec3(1.0) * ticksOuter * 0.5;
        col += c_outer * lineOuter * 1.5;
        
        // Simultaneous Contrast Halos
        float halo = smoothstep(0.3, 0.5, abs(sector_outer - 0.5));
        vec3 halo_col = get_vivid_color(id_outer/12.0*TAU + PI);
        col += halo_col * halo * 0.6;
        
        // Opal highlights
        col += opal_shimmer(r, a_outer, u_time) * 0.2;
    }
    
    // Inner Wheel Compositing
    if (r > R_INNER && r <= R_MID) {
        col = mix(col, c_inner * 0.15, 0.8);
        col += c_inner * s_inner * (0.8 + breatheInner*0.8);
        col += vec3(1.0) * ticksInner * 0.6;
        col += c_inner * lineInner * 1.5;
        
        float halo = smoothstep(0.35, 0.5, abs(sector_inner - 0.5));
        vec3 halo_col = get_vivid_color(id_inner/12.0*TAU + PI);
        col += halo_col * halo * 0.6;
        
        col += opal_shimmer(r, a_inner, u_time*1.2) * 0.2;
    }
    
    // Structural Glowing Rings
    float rings = ringOuter + ringMid + ringInner + ringCore;
    vec3 ringColor = get_vivid_color(u_time * 0.2) + vec3(0.5);
    col += ringColor * rings * 1.5;
    
    // Orbiting Planetary Moons
    for(int i=0; i<3; i++) {
        float fi = float(i);
        float orbitR = R_OUTER + 0.05 + fi * 0.05;
        float orbitA = u_time * (0.5 - fi*0.2) + fi * 2.0;
        vec2 moonPos = vec2(cos(orbitA), sin(orbitA)) * orbitR;
        float moonDist = length(uv - moonPos);
        float moon = smoothstep(0.02, 0.01, moonDist);
        float moonGlow = smoothstep(0.08, 0.0, moonDist);
        vec3 moonCol = get_vivid_color(fi * TAU/3.0 + u_time);
        col += moonCol * moon * 2.0 + moonCol * moonGlow * 0.5;
    }
    
    // Center Core (Sun/Eye/Aspects)
    if (r < R_INNER) {
        float corePhase = r * 20.0 - u_time * 5.0;
        float coreBands = sin(corePhase)*0.5+0.5;
        vec3 coreCol = get_vivid_color(r * 5.0 + u_time * 0.5);
        
        if (r < R_CORE) {
            float eye = smoothstep(0.1, 0.0, abs(r - R_CORE*0.5 + 0.02*sin(a*5.0+u_time*4.0)));
            col += coreCol * eye * 2.0;
            col += vec3(1.0, 0.9, 0.8) * smoothstep(R_CORE*0.3, 0.0, r) * 2.0;
        } else {
            float opal = smoothstep(0.8, 1.0, sin(a * 8.0 + u_time*2.0 + r*20.0));
            col += coreCol * coreBands * 0.3;
            col += get_vivid_color(a + t_inner) * opal * 0.8;
            
            float alines = aspect_lines(uv, u_time);
            col += vec3(0.0, 1.0, 0.8) * alines * (0.5 + 0.5*sin(u_time*10.0));
        }
    }
    
    // Outer Space Stars
    if (r > R_OUTER) {
        float star = hash21(floor(uv * 100.0));
        if (star > 0.99) {
            float twinkle = sin(u_time * 5.0 + star * 100.0) * 0.5 + 0.5;
            col += vec3(1.0, 0.8, 0.9) * twinkle * smoothstep(0.02, 0.0, length(fract(uv * 100.0) - 0.5));
        }
    }
    
    // Chromatic Eclipse Pulse
    float eclipse = pow(sin(u_time * 0.5)*0.5+0.5, 40.0);
    vec3 eclipseCol = mix(vec3(0.0, 1.0, 1.0), vec3(1.0, 0.0, 0.8), sin(r*20.0 - u_time*15.0)*0.5+0.5);
    col = mix(col, eclipseCol * 2.0, eclipse * (1.0 - smoothstep(0.0, 1.5, r)));
    
    // Vignette
    col *= smoothstep(1.5, 0.5, r);
    
    fragColor = vec4(col, 1.0);
}
      `;

      const material = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
          u_time: { value: 0 },
          u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false
      });

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
      scene.add(mesh);
      canvas.__three = { renderer, scene, camera, material };
    } catch (e) {
      console.error("WebGL Initialization Failed:", e);
      throw e;
    }
  }

  const { renderer, scene, camera, material } = canvas.__three;
  
  if (material && material.uniforms) {
    if (material.uniforms.u_time) material.uniforms.u_time.value = time;
    if (material.uniforms.u_resolution) material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }

  renderer.setSize(grid.width, grid.height, false);
  renderer.render(scene, camera);
}