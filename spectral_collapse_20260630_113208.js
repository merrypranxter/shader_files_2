if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL 2 context not available");
    
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.autoClear = false;
    
    const sceneScene = new THREE.Scene();
    const sceneFeedback = new THREE.Scene();
    const scenePost = new THREE.Scene();
    
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    const rtOptions = {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer: false
    };
    
    const w = grid.width;
    const h = grid.height;
    
    const rtScene = new THREE.WebGLRenderTarget(w, h, rtOptions);
    const rtFeedbackA = new THREE.WebGLRenderTarget(w, h, rtOptions);
    const rtFeedbackB = new THREE.WebGLRenderTarget(w, h, rtOptions);
    
    const vertexShader = `
    out vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
    }`;

    const sceneFrag = `
    #version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;

    uniform float u_time;
    uniform vec2 u_resolution;
    uniform vec2 u_mouse;
    uniform vec2 u_future_mouse;

    #define PI 3.14159265359

    mat2 rot(float a) {
        float s=sin(a), c=cos(a);
        return mat2(c, -s, s, c);
    }

    vec3 oklab_to_srgb(vec3 c) {
        float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
        float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
        float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
        l = l*l*l; m = m*m*m; s = s*s*s;
        return vec3(
            +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
        );
    }

    vec3 wavelengthToRGB(float nm) {
        float r = 0.0, g = 0.0, b = 0.0;
        if (nm >= 380.0 && nm < 440.0) { r = -(nm - 440.0) / 60.0; b = 1.0; }
        else if (nm >= 440.0 && nm < 490.0) { g = (nm - 440.0) / 50.0; b = 1.0; }
        else if (nm >= 490.0 && nm < 510.0) { g = 1.0; b = -(nm - 510.0) / 20.0; }
        else if (nm >= 510.0 && nm < 580.0) { r = (nm - 510.0) / 70.0; g = 1.0; }
        else if (nm >= 580.0 && nm < 645.0) { r = 1.0; g = -(nm - 645.0) / 65.0; }
        else if (nm >= 645.0 && nm <= 700.0) { r = 1.0; }
        float f = 1.0;
        if (nm < 420.0) f = 0.3 + 0.7 * (nm - 380.0) / 40.0;
        else if (nm > 645.0) f = 0.3 + 0.7 * (700.0 - nm) / 55.0;
        return pow(vec3(r,g,b) * f, vec3(0.8));
    }

    float sdOctahedron(vec3 p, float s) {
        p = abs(p);
        return (p.x + p.y + p.z - s) * 0.57735027;
    }

    float sdBox(vec3 p, vec3 b) {
        vec3 q = abs(p) - b;
        return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
    }

    float sdTorus(vec3 p, vec2 t) {
        vec2 q = vec2(length(p.xz)-t.x,p.y);
        return length(q)-t.y;
    }

    float sdCross(vec3 p) {
        float da = sdBox(p.xyz, vec3(1e5, 0.2, 0.2));
        float db = sdBox(p.yzx, vec3(0.2, 1e5, 0.2));
        float dc = sdBox(p.zxy, vec3(0.2, 0.2, 1e5));
        return min(da, min(db, dc));
    }

    float map(vec3 p) {
        vec3 q = p;
        
        float r = length(q.xy);
        float theta = atan(q.y, q.x);
        theta += sin(q.z * 1.5 + u_time) * 0.3;
        q.xy = r * vec2(cos(theta), sin(theta));
        
        q.yz *= rot(u_time * 0.2);
        q.xz *= rot(u_time * 0.3);
        
        float morph = smoothstep(-0.5, 0.5, sin(u_time * 0.3));
        float d1 = sdOctahedron(q, 1.2);
        float d2 = sdTorus(q, vec2(1.0, 0.4));
        float base = mix(d1, d2, morph);
        
        float scale = 1.0;
        for(int i=0; i<2; i++) {
            vec3 a = mod(q * scale, 2.0) - 1.0;
            scale *= 3.0;
            vec3 r2 = 1.0 - 3.0 * abs(a);
            float c = sdCross(r2) / scale;
            base = max(base, -c);
        }
        
        float disp = sin(5.0*p.x)*sin(5.0*p.y)*sin(5.0*p.z) * 0.05 * sin(u_time*2.0);
        return base + disp;
    }

    vec3 getNormal(vec3 p) {
        vec2 e = vec2(0.001, 0.0);
        return normalize(vec3(
            map(p + e.xyy) - map(p - e.xyy),
            map(p + e.yxy) - map(p - e.yxy),
            map(p + e.yyx) - map(p - e.yyx)
        ));
    }

    vec3 getEnvironment(vec3 rd, vec3 ro) {
        vec3 bg = vec3(0.0);
        
        vec3 mousePos = vec3((u_mouse.x - 0.5)*10.0, (u_mouse.y - 0.5)*10.0, 0.0);
        vec3 futureMousePos = vec3((u_future_mouse.x - 0.5)*10.0, (u_future_mouse.y - 0.5)*10.0, 0.0);
        
        float beam = pow(max(dot(rd, normalize(mousePos - ro)), 0.0), 60.0);
        float futureBeam = pow(max(dot(rd, normalize(futureMousePos - ro)), 0.0), 120.0);
        
        float mainLight = pow(max(dot(rd, normalize(vec3(-5.0, 0.0, 2.0) - ro)), 0.0), 30.0);
        bg += vec3(1.0, 0.9, 0.8) * mainLight * 2.0;
        
        bg += vec3(1.0, 0.1, 0.6) * beam * 1.5;
        bg += vec3(0.0, 1.0, 0.8) * futureBeam * 2.0; 
        
        float grating = sin(dot(rd.xy, vec2(80.0, 120.0)) + u_time * 8.0) * 
                        cos(dot(rd.yz, vec2(100.0, -50.0)) - u_time * 5.0);
        grating = smoothstep(0.8, 1.0, grating);
        
        float scalarField = fract(sin(dot(rd.xyz, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
        float sweep = smoothstep(0.95, 1.0, sin(rd.y * 15.0 - u_time * 3.0));
        vec3 hyperspectral = wavelengthToRGB(mix(380.0, 700.0, scalarField));
        
        bg += hyperspectral * grating * 2.0;
        bg += hyperspectral * sweep * 1.5;
        
        float thermal = smoothstep(-1.0, 1.0, rd.y + sin(rd.x * 3.0 + u_time) * 0.2);
        vec3 ironbow = mix(vec3(0.1, 0.0, 0.2), vec3(0.8, 0.2, 0.5), thermal);
        bg += ironbow * 0.15;
        
        return bg;
    }

    void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        uv.x *= u_resolution.x / u_resolution.y;

        vec3 ro = vec3(0.0, 0.0, 3.5);
        vec3 rd = normalize(vec3(uv, -1.0));

        float t = 0.0;
        for(int i=0; i<80; i++) {
            float d = map(ro + rd * t);
            if(d < 0.001 || t > 10.0) break;
            t += d;
        }

        vec3 col = vec3(0.0);

        if(t < 10.0) {
            vec3 p = ro + rd * t;
            vec3 n = getNormal(p);
            
            int SAMPLES = 12; 
            for(int i=0; i<SAMPLES; i++) {
                float lambda = mix(380.0, 700.0, float(i)/float(SAMPLES-1));
                float ior = 1.45 + 0.01 / pow(lambda * 0.001, 2.0);
                
                vec3 rd_in = refract(rd, n, 1.0 / ior);
                if(length(rd_in) < 0.01) rd_in = reflect(rd, n);
                
                vec3 exit_p = p + rd_in * 0.6;
                vec3 exit_n = -getNormal(exit_p);
                vec3 rd_out = refract(rd_in, exit_n, ior);
                if(length(rd_out) < 0.01) rd_out = reflect(rd_in, exit_n);
                
                vec3 env = getEnvironment(rd_out, exit_p);
                col += env * wavelengthToRGB(lambda) * (2.0 / float(SAMPLES));
            }
            
            float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
            col += getEnvironment(reflect(rd, n), p) * fresnel * 1.5;
            
        } else {
            col = getEnvironment(rd, ro);
        }

        fragColor = vec4(col, 1.0);
    }`;

    const feedbackFrag = `
    #version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;

    uniform sampler2D u_scene;
    uniform sampler2D u_feedback;
    uniform float u_time;
    uniform float u_dt;

    void main() {
        vec3 scene = texture(u_scene, vUv).rgb;
        
        vec2 c = vUv - 0.5;
        float r = length(c);
        float theta = atan(c.y, c.x);
        theta += u_dt * 0.3;
        r -= u_dt * 0.02;
        vec2 warpedUv = vec2(cos(theta), sin(theta)) * r + 0.5;
        warpedUv += vec2(sin(vUv.y * 15.0 + u_time), cos(vUv.x * 15.0 - u_time)) * 0.001;
        
        vec4 prev = texture(u_feedback, warpedUv);
        
        float luma = dot(scene, vec3(0.2126, 0.7152, 0.0722));
        float adapt = prev.a * exp(-u_dt / 3.0) + luma * 0.08; 
        adapt = clamp(adapt, 0.0, 1.0);
        
        vec3 trail = mix(prev.rgb * 0.96, scene, 0.15);
        trail = max(trail, scene); 
        
        fragColor = vec4(trail, adapt);
    }`;

    const postFrag = `
    #version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 fragColor;

    uniform sampler2D u_feedback;
    uniform sampler2D u_scene;
    uniform float u_time;
    uniform vec2 u_resolution;

    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

    vec3 solarize(vec3 col, float t, float strength) {
        float L = luma(col);
        if(L < t) return col;
        float over = (L - t) / max(1.0 - t, 1e-4);
        float folded = t * (1.0 - over);
        float newL = mix(L, folded, strength);
        return col * (newL / max(L, 1e-4));
    }

    void main() {
        vec2 uv = vUv;
        float aspect = u_resolution.x / u_resolution.y;
        vec2 aspect_uv = (uv - 0.5) * vec2(aspect, 1.0) + 0.5;
        
        float dist = length(uv - 0.5);
        if(dist > 0.4) {
            float dementia = smoothstep(0.4, 0.8, dist);
            float quant = mix(2000.0, 30.0, dementia);
            uv = floor(uv * quant) / quant;
        }
        
        vec4 fb = texture(u_feedback, uv);
        vec3 scene = texture(u_scene, uv).rgb;
        
        vec3 col = fb.rgb;
        float adapt = fb.a;
        
        vec3 complement = vec3(1.0) - fb.rgb; 
        float paintCoverage = max(max(scene.r, scene.g), scene.b);
        vec3 ghost = complement * adapt * (1.0 - paintCoverage) * 1.2; 
        col += ghost;
        
        col = solarize(col, 0.85, 1.0);
        
        vec2 texel = 1.0 / u_resolution;
        float tl = luma(texture(u_feedback, uv + texel * vec2(-1.0, -1.0)).rgb);
        float tc = luma(texture(u_feedback, uv + texel * vec2( 0.0, -1.0)).rgb);
        float tr = luma(texture(u_feedback, uv + texel * vec2( 1.0, -1.0)).rgb);
        float ml = luma(texture(u_feedback, uv + texel * vec2(-1.0,  0.0)).rgb);
        float mr = luma(texture(u_feedback, uv + texel * vec2( 1.0,  0.0)).rgb);
        float bl = luma(texture(u_feedback, uv + texel * vec2(-1.0,  1.0)).rgb);
        float bc = luma(texture(u_feedback, uv + texel * vec2( 0.0,  1.0)).rgb);
        float br = luma(texture(u_feedback, uv + texel * vec2( 1.0,  1.0)).rgb);
        
        float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
        float gy = (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr);
        float edge = abs(gx) + abs(gy);
        
        float brightHalo = edge * 1.5 * step(0.0, gx + gy);
        float darkHalo = edge * 1.5 * step(0.0, -(gx + gy));
        col += vec3(brightHalo) - vec3(darkHalo);
        
        if(dist > 0.45) {
            float noise = fract(sin(dot(uv + u_time, vec2(127.1, 311.7))) * 43758.5453);
            if(noise > 0.995) {
                col = mix(col, vec3(0.8, 0.0, 1.0), 0.9); 
            } else if (noise > 0.99) {
                col = mix(col, vec3(1.0), 0.9); 
            }
        }
        
        vec2 sq1 = aspect_uv - vec2(0.5 - 0.35 * aspect, 0.5);
        vec2 sq2 = aspect_uv - vec2(0.5 + 0.35 * aspect, 0.5);
        
        if(max(abs(sq1.x), abs(sq1.y)) < 0.04) {
            col = vec3(0.5);
        } else if(max(abs(sq1.x), abs(sq1.y)) < 0.06) {
            col = vec3(1.0, 0.8, 0.0);
        }
        
        if(max(abs(sq2.x), abs(sq2.y)) < 0.04) {
            col = vec3(0.5);
        } else if(max(abs(sq2.x), abs(sq2.y)) < 0.06) {
            col = vec3(0.1, 0.0, 0.3);
        }
        
        col *= 1.0 - 0.7 * dist * dist;
        col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);
        
        float grain = fract(sin(dot(uv + u_time, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
        col += grain * 0.05;
        
        fragColor = vec4(col, 1.0);
    }`;

    const matScene = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            u_time: { value: 0 },
            u_resolution: { value: new THREE.Vector2(w, h) },
            u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
            u_future_mouse: { value: new THREE.Vector2(0.5, 0.5) }
        },
        vertexShader,
        fragmentShader: sceneFrag
    });
    
    const matFeedback = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            u_scene: { value: rtScene.texture },
            u_feedback: { value: rtFeedbackA.texture },
            u_time: { value: 0 },
            u_dt: { value: 0.016 }
        },
        vertexShader,
        fragmentShader: feedbackFrag
    });
    
    const matPost = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            u_scene: { value: rtScene.texture },
            u_feedback: { value: rtFeedbackB.texture },
            u_time: { value: 0 },
            u_resolution: { value: new THREE.Vector2(w, h) }
        },
        vertexShader,
        fragmentShader: postFrag
    });
    
    const geo = new THREE.PlaneGeometry(2, 2);
    sceneScene.add(new THREE.Mesh(geo, matScene));
    sceneFeedback.add(new THREE.Mesh(geo, matFeedback));
    scenePost.add(new THREE.Mesh(geo, matPost));
    
    canvas.__three = {
        renderer, camera,
        sceneScene, sceneFeedback, scenePost,
        rtScene, rtFeedbackA, rtFeedbackB,
        matScene, matFeedback, matPost,
        mouse: new THREE.Vector2(0.5, 0.5),
        vel: new THREE.Vector2(0, 0),
        lastTime: time
    };
  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
    throw e;
  }
}

const sys = canvas.__three;

if (sys.rtScene.width !== grid.width || sys.rtScene.height !== grid.height) {
    sys.rtScene.setSize(grid.width, grid.height);
    sys.rtFeedbackA.setSize(grid.width, grid.height);
    sys.rtFeedbackB.setSize(grid.width, grid.height);
    sys.matScene.uniforms.u_resolution.value.set(grid.width, grid.height);
    sys.matPost.uniforms.u_resolution.value.set(grid.width, grid.height);
}

let targetMouseX = mouse.x / grid.width;
let targetMouseY = 1.0 - (mouse.y / grid.height);
if (!mouse.isPressed) {
    targetMouseX = 0.5 + 0.3 * Math.sin(time * 0.7);
    targetMouseY = 0.5 + 0.3 * Math.cos(time * 0.5);
}

sys.vel.x = (targetMouseX - sys.mouse.x) * 0.1 + sys.vel.x * 0.9;
sys.vel.y = (targetMouseY - sys.mouse.y) * 0.1 + sys.vel.y * 0.9;
sys.mouse.x = targetMouseX;
sys.mouse.y = targetMouseY;

let futureX = sys.mouse.x + sys.vel.x * 20.0;
let futureY = sys.mouse.y + sys.vel.y * 20.0;

let dt = time - sys.lastTime;
if (dt <= 0) dt = 0.016;
sys.lastTime = time;

sys.matScene.uniforms.u_time.value = time;
sys.matScene.uniforms.u_mouse.value.set(sys.mouse.x, sys.mouse.y);
sys.matScene.uniforms.u_future_mouse.value.set(futureX, futureY);

sys.matFeedback.uniforms.u_time.value = time;
sys.matFeedback.uniforms.u_dt.value = dt;
sys.matFeedback.uniforms.u_feedback.value = sys.rtFeedbackA.texture;

sys.matPost.uniforms.u_time.value = time;
sys.matPost.uniforms.u_feedback.value = sys.rtFeedbackB.texture;

sys.renderer.setRenderTarget(sys.rtScene);
sys.renderer.render(sys.sceneScene, sys.camera);

sys.renderer.setRenderTarget(sys.rtFeedbackB);
sys.renderer.render(sys.sceneFeedback, sys.camera);

sys.renderer.setRenderTarget(null);
sys.renderer.render(sys.scenePost, sys.camera);

let temp = sys.rtFeedbackA;
sys.rtFeedbackA = sys.rtFeedbackB;
sys.rtFeedbackB = temp;