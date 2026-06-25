const glslVersion = THREE.GLSL3;

const vertexShader = `
out vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragFlow = `
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D u_read;
uniform vec2 u_mouse;
uniform vec2 u_mouseDelta;
uniform float u_click;
uniform float u_time;
uniform vec2 u_res;

void main() {
    vec2 px = 1.0 / u_res;
    vec2 uv = vUv;

    vec4 c = texture(u_read, uv);
    float pX = texture(u_read, uv + vec2(px.x, 0.0)).r;
    float nX = texture(u_read, uv - vec2(px.x, 0.0)).r;
    float pY = texture(u_read, uv + vec2(0.0, px.y)).r;
    float nY = texture(u_read, uv - vec2(0.0, px.y)).r;

    float lap = pX + nX + pY + nY - 4.0 * c.r;
    float vel = c.g + lap * 0.25; 
    vel *= 0.98; 
    float height = c.r + vel;

    vec2 flow = c.ba;
    vec2 advUV = uv - flow * px * 2.0;
    vec2 advFlow = texture(u_read, advUV).ba;
    flow = mix(flow, advFlow, 0.9) * 0.99;

    float aspect = u_res.x / u_res.y;
    vec2 mUV = uv; mUV.x *= aspect;
    vec2 mMouse = u_mouse; mMouse.x *= aspect;
    float dist = length(mUV - mMouse);
    float mouseForce = exp(-dist * 150.0);

    if (length(u_mouseDelta) > 0.0001) {
        flow += u_mouseDelta * mouseForce * 2.0;
        height += mouseForce * 0.1;
    }
    if (u_click > 0.0) {
        height -= exp(-dist * 400.0) * 1.5;
        flow += normalize(mUV - mMouse + 0.0001) * exp(-dist * 200.0) * 0.5;
    }

    float n1 = sin(uv.y * 5.0 + u_time * 0.5) * cos(uv.x * 3.0) * 0.002;
    float n2 = cos(uv.x * 4.0 - u_time * 0.4) * sin(uv.y * 6.0) * 0.002;
    flow += vec2(n1, n2);

    fragColor = vec4(height, vel, flow);
}
`;

const fragMain = `
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D u_flow;
uniform float u_time;
uniform int u_paletteRegime;
uniform int u_domainStyle;
uniform int u_falseColorMetric;
uniform int u_scaleFamily;
uniform float u_rainbowIntensity;
uniform vec2 u_res;

vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123);
}
float hash12(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
vec2 cpow(vec2 z, float n) {
    float r = length(z); float a = atan(z.y, z.x);
    return pow(r, n) * vec2(cos(n*a), sin(n*a));
}

vec3 getPalette(float t, int regime) {
    t = fract(t);
    vec3 a, b, c, d;
    if (regime == 0) { 
        a=vec3(0.5); b=vec3(0.5); c=vec3(1.0); d=vec3(0.0, 0.33, 0.67);
    } else if (regime == 1) { 
        a=vec3(0.5,0.5,0.5); b=vec3(0.5,0.5,0.5); c=vec3(1.0,1.0,0.5); d=vec3(0.8,0.9,0.3);
    } else if (regime == 2) { 
        a=vec3(0.4,0.1,0.6); b=vec3(0.6,0.2,0.4); c=vec3(1.0,0.5,1.0); d=vec3(0.1,0.2,0.3);
    } else if (regime == 3) { 
        a=vec3(0.8,0.5,0.2); b=vec3(0.2,0.4,0.2); c=vec3(2.0,1.0,1.0); d=vec3(0.0,0.25,0.25);
    } else { 
        a=vec3(0.8,0.8,0.8); b=vec3(0.2,0.2,0.2); c=vec3(1.0,1.0,1.0); d=vec3(0.0,0.33,0.67);
    }
    return clamp(a + b * cos(6.28318 * (c * t + d)), 0.0, 1.0);
}

void main() {
    vec4 flowData = texture(u_flow, vUv);
    float ripple = flowData.r;
    vec2 flowVel = flowData.ba;

    vec2 uv = vUv;
    float aspect = u_res.x / u_res.y;
    uv.x *= aspect;

    float density = 18.0;
    if (u_scaleFamily == 1) density = 30.0;
    if (u_scaleFamily == 2) density = 10.0;

    uv += flowVel * 0.4;

    vec2 p = uv * density;

    vec2 scaleShape = vec2(1.0, 1.5);
    if (u_scaleFamily == 1) scaleShape = vec2(1.5, 0.8);
    if (u_scaleFamily == 2) scaleShape = vec2(1.0, 1.0);

    vec2 cell = floor(p);
    vec2 f = fract(p);

    float maxZ = -999.0;
    float minDist = 999.0;
    vec2 bestCenter = vec2(0.0);
    float bestID = 0.0;
    vec3 bestNormal = vec3(0.0,0.0,1.0);
    vec2 bestDiff = vec2(0.0);

    for(int y=-2; y<=2; y++) {
        for(int x=-2; x<=2; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 pt = hash22(cell + neighbor);
            vec2 center = neighbor + pt;
            vec2 diff = f - center;
            
            float dist = length(diff * scaleShape);
            float z = 1.0 - pow(dist, 1.4);
            z += (cell.y + neighbor.y + pt.y) * 0.2;
            z += ripple * 0.6;

            if(dist < 1.2 && z > maxZ) {
                maxZ = z;
                minDist = dist;
                bestCenter = center;
                bestID = hash12(cell + neighbor);
                bestNormal = normalize(vec3(diff.x * scaleShape.x, diff.y * scaleShape.y, 1.0 - dist));
                bestDiff = diff;
            }
        }
    }

    if (maxZ == -999.0) {
        fragColor = vec4(0.0,0.0,0.0,1.0);
        return;
    }

    vec2 z = bestDiff * 2.0;
    vec2 w = z;
    if (u_domainStyle == 1) w = cpow(z, 3.0) - vec2(1.0,0.0);
    else if (u_domainStyle == 2) w = cmul(z, vec2(cos(u_time), sin(u_time)));
    else if (u_domainStyle == 3) w = cpow(z, 2.0) + vec2(bestID, ripple);

    float phase = atan(w.y, w.x);
    float mag = length(w);

    float metric = 0.0;
    if (u_falseColorMetric == 0) metric = phase / 6.28318 + u_time * 0.15;
    else if (u_falseColorMetric == 1) metric = maxZ * 0.4 - u_time * 0.2;
    else if (u_falseColorMetric == 2) metric = bestID + ripple * 0.5 + u_time * 0.1;
    else if (u_falseColorMetric == 3) metric = length(flowVel) * 8.0 + bestID;

    vec3 baseColor = getPalette(metric, u_paletteRegime);

    float retardance = maxZ * 2.5 * (1.0 + 0.5 * sin(u_time * 0.5 + bestID * 10.0));
    vec3 interference = 0.5 + 0.5 * cos(6.28318 * (retardance * vec3(1.0, 1.1, 1.2) + phase));
    baseColor = mix(baseColor, interference, 0.35);

    float grating = sin(dot(bestNormal.xy, vec2(1.0, 1.0)) * 100.0 + u_time * 8.0);
    vec3 diffColor = getPalette(grating * 0.15 + bestID, int(mod(float(u_paletteRegime + 1), 5.0)));
    float edgeMask = smoothstep(0.5, 0.9, minDist);
    baseColor += diffColor * grating * edgeMask * u_rainbowIntensity * 0.8;

    vec3 lightDir = normalize(vec3(0.3, 0.5, 0.8));
    float diffL = max(dot(bestNormal, lightDir), 0.0);
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 halfDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(bestNormal, halfDir), 0.0), 40.0);

    vec3 finalColor = baseColor * (diffL * 0.7 + 0.3) + spec * vec3(1.0, 0.9, 0.9) * 0.9;

    if (minDist > 0.75) {
        float seam = smoothstep(0.75, 0.95, minDist);
        vec3 seamColor = getPalette(minDist * 8.0 - u_time, u_paletteRegime);
        finalColor += seamColor * seam * u_rainbowIntensity * 1.5;
    }

    fragColor = vec4(finalColor, maxZ);
}
`;

const fragAdapt = `
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D u_main;
uniform sampler2D u_prev;
uniform float u_hold;

void main() {
    vec4 curr = texture(u_main, vUv);
    vec4 prev = texture(u_prev, vUv);
    
    float burnRate = u_hold > 0.0 ? 0.08 : 0.02;
    vec3 adapt = prev.rgb + curr.rgb * burnRate;
    adapt = min(adapt, vec3(1.0));
    adapt *= 0.985; 
    
    fragColor = vec4(adapt, curr.a);
}
`;

const fragPost = `
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D u_main;
uniform sampler2D u_adapt;
uniform float u_afterimagePersist;
uniform vec2 u_res;

void main() {
    vec4 curr = texture(u_main, vUv);
    vec3 adapt = texture(u_adapt, vUv).rgb;

    vec3 complement = vec3(1.0) - adapt;
    float adaptStrength = max(max(adapt.r, adapt.g), adapt.b);
    float paintCov = max(max(curr.r, curr.g), curr.b);
    vec3 ghost = complement * adaptStrength * (1.0 - paintCov) * u_afterimagePersist * 1.5;

    float depth = curr.a;
    vec2 dir = (vUv - 0.5);
    float shift = depth * 0.006;
    
    float r = texture(u_main, vUv + dir * shift).r;
    float b = texture(u_main, vUv - dir * shift).b;
    vec3 baseShifted = vec3(mix(curr.r, r, 0.6), curr.g, mix(curr.b, b, 0.6));
    
    vec3 finalColor = baseShifted + ghost;

    vec2 px = 1.0 / u_res;
    vec3 bloom = vec3(0.0);
    bloom += texture(u_main, vUv + vec2(px.x, px.y)*3.0).rgb;
    bloom += texture(u_main, vUv + vec2(-px.x, -px.y)*3.0).rgb;
    bloom += texture(u_main, vUv + vec2(px.x, -px.y)*3.0).rgb;
    bloom += texture(u_main, vUv + vec2(-px.x, px.y)*3.0).rgb;
    finalColor += (bloom / 4.0) * 0.3;

    float vig = 1.0 - dot(dir, dir) * 1.2;
    finalColor *= clamp(vig, 0.0, 1.0);

    vec3 x = finalColor;
    float a = 2.51, b_ = 0.03, c = 2.43, d = 0.59, e = 0.14;
    finalColor = clamp((x*(a*x+b_))/(x*(c*x+d)+e), 0.0, 1.0);

    fragColor = vec4(finalColor, 1.0);
}
`;

if (!canvas.__three) {
    try {
        if (!ctx) throw new Error("WebGL 2 context not available");
        
        const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
        renderer.setPixelRatio(1.0);
        
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        const geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array([-1,-1,0, 3,-1,0, -1,3,0]);
        const uvs = new Float32Array([0,0, 2,0, 0,2]);
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        
        const createTarget = () => new THREE.WebGLRenderTarget(grid.width, grid.height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            depthBuffer: false
        });
        
        const targets = {
            flow: { read: createTarget(), write: createTarget() },
            main: createTarget(),
            adapt: { read: createTarget(), write: createTarget() }
        };
        
        const materials = {
            flow: new THREE.ShaderMaterial({
                glslVersion,
                uniforms: {
                    u_read: { value: null },
                    u_mouse: { value: new THREE.Vector2() },
                    u_mouseDelta: { value: new THREE.Vector2() },
                    u_click: { value: 0.0 },
                    u_time: { value: 0.0 },
                    u_res: { value: new THREE.Vector2(grid.width, grid.height) }
                },
                vertexShader,
                fragmentShader: fragFlow
            }),
            main: new THREE.ShaderMaterial({
                glslVersion,
                uniforms: {
                    u_flow: { value: null },
                    u_time: { value: 0.0 },
                    u_paletteRegime: { value: 0 },
                    u_domainStyle: { value: 0 },
                    u_falseColorMetric: { value: 0 },
                    u_scaleFamily: { value: 0 },
                    u_rainbowIntensity: { value: 0.5 },
                    u_res: { value: new THREE.Vector2(grid.width, grid.height) }
                },
                vertexShader,
                fragmentShader: fragMain
            }),
            adapt: new THREE.ShaderMaterial({
                glslVersion,
                uniforms: {
                    u_main: { value: null },
                    u_prev: { value: null },
                    u_hold: { value: 0.0 }
                },
                vertexShader,
                fragmentShader: fragAdapt
            }),
            post: new THREE.ShaderMaterial({
                glslVersion,
                uniforms: {
                    u_main: { value: null },
                    u_adapt: { value: null },
                    u_afterimagePersist: { value: 0.9 },
                    u_res: { value: new THREE.Vector2(grid.width, grid.height) }
                },
                vertexShader,
                fragmentShader: fragPost
            })
        };

        const mesh = new THREE.Mesh(geometry, materials.post);
        scene.add(mesh);
        
        canvas.__three = { renderer, scene, camera, mesh, targets, materials };
        canvas.__state = {
            paletteRegime: 0,
            domainStyle: 0,
            falseColorMetric: 0,
            scaleFamily: 0,
            rainbowIntensity: 0.5,
            afterimagePersist: 0.9,
            mouseHold: 0.0,
            clickPulse: 0.0,
            mouse: new THREE.Vector2(0.5, 0.5),
            mouseDelta: new THREE.Vector2(0, 0),
            lastMouse: new THREE.Vector2(0.5, 0.5)
        };
        
        window.addEventListener('keydown', (e) => {
            const s = canvas.__state;
            if (e.key.toLowerCase() === 'c') s.paletteRegime = (s.paletteRegime + 1) % 5;
            if (e.key.toLowerCase() === 'd') s.domainStyle = (s.domainStyle + 1) % 4;
            if (e.key.toLowerCase() === 'f') s.falseColorMetric = (s.falseColorMetric + 1) % 4;
            if (e.key.toLowerCase() === 's') s.scaleFamily = (s.scaleFamily + 1) % 3;
            if (e.key.toLowerCase() === 'r') s.rainbowIntensity = s.rainbowIntensity > 0.8 ? 0.2 : s.rainbowIntensity + 0.3;
            if (e.key.toLowerCase() === 'a') s.afterimagePersist = s.afterimagePersist > 0.8 ? 0.2 : s.afterimagePersist + 0.3;
        });
        
    } catch (e) {
        console.error("Initialization Failed:", e);
        throw e;
    }
}

const { renderer, scene, camera, mesh, targets, materials } = canvas.__three;
const s = canvas.__state;

if (renderer.getSize(new THREE.Vector2()).width !== grid.width || renderer.getSize(new THREE.Vector2()).height !== grid.height) {
    renderer.setSize(grid.width, grid.height, false);
    targets.flow.read.setSize(grid.width, grid.height);
    targets.flow.write.setSize(grid.width, grid.height);
    targets.main.setSize(grid.width, grid.height);
    targets.adapt.read.setSize(grid.width, grid.height);
    targets.adapt.write.setSize(grid.width, grid.height);
    materials.flow.uniforms.u_res.value.set(grid.width, grid.height);
    materials.main.uniforms.u_res.value.set(grid.width, grid.height);
    materials.post.uniforms.u_res.value.set(grid.width, grid.height);
}

let mx = mouse.x / grid.width;
let my = 1.0 - (mouse.y / grid.height);
s.mouse.set(mx, my);
s.mouseDelta.subVectors(s.mouse, s.lastMouse);
s.lastMouse.copy(s.mouse);

if (mouse.isPressed) {
    s.mouseHold = Math.min(s.mouseHold + 0.1, 1.0);
    if (s.mouseHold <= 0.15 && s.mouseHold > 0.05) s.clickPulse = 1.0;
    else s.clickPulse = 0.0;
} else {
    s.mouseHold = 0.0;
    s.clickPulse = 0.0;
}

mesh.material = materials.flow;
materials.flow.uniforms.u_read.value = targets.flow.read.texture;
materials.flow.uniforms.u_mouse.value.copy(s.mouse);
materials.flow.uniforms.u_mouseDelta.value.copy(s.mouseDelta);
materials.flow.uniforms.u_click.value = s.clickPulse;
materials.flow.uniforms.u_time.value = time;
renderer.setRenderTarget(targets.flow.write);
renderer.render(scene, camera);
let temp = targets.flow.read;
targets.flow.read = targets.flow.write;
targets.flow.write = temp;

mesh.material = materials.main;
materials.main.uniforms.u_flow.value = targets.flow.read.texture;
materials.main.uniforms.u_time.value = time;
materials.main.uniforms.u_paletteRegime.value = s.paletteRegime;
materials.main.uniforms.u_domainStyle.value = s.domainStyle;
materials.main.uniforms.u_falseColorMetric.value = s.falseColorMetric;
materials.main.uniforms.u_scaleFamily.value = s.scaleFamily;
materials.main.uniforms.u_rainbowIntensity.value = s.rainbowIntensity;
renderer.setRenderTarget(targets.main);
renderer.render(scene, camera);

mesh.material = materials.adapt;
materials.adapt.uniforms.u_main.value = targets.main.texture;
materials.adapt.uniforms.u_prev.value = targets.adapt.read.texture;
materials.adapt.uniforms.u_hold.value = s.mouseHold;
renderer.setRenderTarget(targets.adapt.write);
renderer.render(scene, camera);
temp = targets.adapt.read;
targets.adapt.read = targets.adapt.write;
targets.adapt.write = temp;

mesh.material = materials.post;
materials.post.uniforms.u_main.value = targets.main.texture;
materials.post.uniforms.u_adapt.value = targets.adapt.read.texture;
materials.post.uniforms.u_afterimagePersist.value = s.afterimagePersist;
renderer.setRenderTarget(null);
renderer.render(scene, camera);