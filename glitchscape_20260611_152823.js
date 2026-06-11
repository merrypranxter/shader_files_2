if (!canvas.__three) {
  try {
    if (!ctx) throw new Error("WebGL context not available");
    
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    camera.position.z = 1;
    
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
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
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform float u_time;
        uniform vec2 u_resolution;

        float hash12(vec2 p) {
            vec3 p3  = fract(vec3(p.xyx) * .1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f*f*(3.0-2.0*f);
            return mix(mix(hash12(i), hash12(i+vec2(1.0,0.0)), f.x),
                       mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), f.x), f.y);
        }

        vec3 palette(float t) {
            vec3 a = vec3(0.5, 0.5, 0.5);
            vec3 b = vec3(0.5, 0.5, 0.5);
            vec3 c = vec3(2.0, 1.0, 1.0);
            vec3 d = vec3(0.5, 0.2, 0.25);
            return a + b * cos(6.28318 * (c * t + d));
        }

        float sdStar5(in vec2 p, in float r, in float rf) {
            const vec2 k1 = vec2(0.809016994375, -0.587785252292);
            const vec2 k2 = vec2(-k1.x,k1.y);
            p.x = abs(p.x);
            p -= 2.0*max(dot(k1,p),0.0)*k1;
            p -= 2.0*max(dot(k2,p),0.0)*k2;
            p.x = abs(p.x);
            p.y -= r;
            vec2 ba = rf*vec2(-k1.y,k1.x) - vec2(0,1);
            float h = clamp( dot(p,ba)/dot(ba,ba), 0.0, r );
            return length(p-ba*h) * sign(p.y*ba.x-p.x*ba.y);
        }

        float sdBox( in vec2 p, in vec2 b ) {
            vec2 d = abs(p)-b;
            return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
        }

        float tunnel(vec2 p, float timeOffset) {
            float r = length(p);
            float a = atan(p.y, p.x);
            float z = 0.5 / (r + 0.05) + u_time * 1.5 + timeOffset;
            float twist = a + sin(z * 0.2) * 2.0;
            float val = sin(z * 10.0) * sin(twist * 12.0);
            return step(0.0, val);
        }

        void main() {
            vec2 crtUV = vUv - 0.5;
            float rsq = dot(crtUV, crtUV);
            crtUV *= 1.0 + rsq * 0.15;
            crtUV += 0.5;
            
            if (crtUV.x < 0.0 || crtUV.x > 1.0 || crtUV.y < 0.0 || crtUV.y > 1.0) {
                fragColor = vec4(0.0, 0.0, 0.0, 1.0);
                return;
            }

            vec2 uv = (crtUV - 0.5) * 2.0;
            uv.x *= u_resolution.x / u_resolution.y;
            
            vec2 p = uv;
            
            float blockNoise = noise(floor(p * 12.0) + u_time * 2.0);
            if (blockNoise > 0.8) {
                p.x += (hash12(floor(p * 12.0)) - 0.5) * 0.3;
                p.y -= u_time * 0.15; 
            }
            
            float rowNoise = noise(vec2(floor(crtUV.y * 60.0), u_time * 15.0));
            if (rowNoise > 0.85) {
                p.x += sin(u_time * 50.0) * 0.08;
            }
            
            float r_val = tunnel(p, 0.0);
            float g_val = tunnel(p, rowNoise > 0.8 ? 0.05 : 0.0);
            float b_val = tunnel(p, rowNoise > 0.8 ? 0.1 : 0.0);
            
            vec3 opColor = vec3(r_val, g_val, b_val);
            
            float bwMask = smoothstep(0.9, 0.3, length(uv));
            if (blockNoise < 0.7) {
                opColor = mix(opColor, vec3(tunnel(p, 0.0)), bwMask);
            }

            vec3 finalColor = opColor;
            
            float sparkleHash = hash12(p * 400.0 + u_time);
            float sparkle = step(0.99, sparkleHash);
            vec3 glitterColor = palette(p.x + p.y - u_time) * 2.5; 
            finalColor = mix(finalColor, glitterColor, sparkle);
            
            vec2 stP = uv;
            stP.y -= u_time * 0.4; 
            vec2 id = floor(stP * 3.5);
            vec2 localP = fract(stP * 3.5) - 0.5;
            float starHash = hash12(id + 123.45);
            
            if (starHash > 0.7) {
                float t = u_time * (starHash > 0.85 ? 3.0 : -3.0);
                mat2 rot = mat2(cos(t), -sin(t), sin(t), cos(t));
                vec2 rotP = rot * localP;
                
                float dStar = sdStar5(rotP, 0.25, 0.45);
                float starMask = smoothstep(0.02, 0.01, dStar);
                float outline = smoothstep(0.05, 0.02, dStar);
                
                vec3 starCol = palette(starHash * 20.0 + u_time * 0.5);
                
                finalColor = mix(finalColor, vec3(0.0), outline);
                finalColor = mix(finalColor, starCol, starMask);
            }
            
            vec2 winP = uv - vec2(0.6*sin(u_time*0.3), -0.4*cos(u_time*0.5));
            float dWin = sdBox(winP, vec2(0.45, 0.3));
            float winMask = smoothstep(0.01, 0.0, dWin);
            float winOutline = smoothstep(0.03, 0.01, dWin);
            
            if (winOutline > 0.0 && winMask == 0.0) {
                finalColor *= 0.3; 
            }
            
            if (winMask > 0.0) {
                finalColor = vec3(0.8); 
                
                float dTitle = sdBox(winP - vec2(0.0, 0.23), vec2(0.43, 0.05));
                float titleMask = smoothstep(0.01, 0.0, dTitle);
                finalColor = mix(finalColor, vec3(0.0, 0.0, 0.6), titleMask);
                
                vec2 innerP = winP;
                float innerNoise = noise(innerP * 40.0 - u_time * 5.0);
                if (innerNoise > 0.4) {
                    finalColor = mix(finalColor, palette(innerP.y * 5.0 + u_time), innerNoise);
                }
                
                float dXBtn = sdBox(winP - vec2(0.38, 0.23), vec2(0.03, 0.03));
                if (dXBtn < 0.0) finalColor = vec3(0.8, 0.1, 0.1);
                
                finalColor = mix(finalColor, vec3(0.0), smoothstep(0.0, 0.01, abs(dWin)));
            }
            
            float scanline = sin(crtUV.y * u_resolution.y * 3.14159);
            finalColor -= scanline * 0.1;
            
            float px = mod(gl_FragCoord.x, 3.0);
            if (px < 1.0) finalColor *= vec3(1.0, 0.8, 0.8);
            else if (px < 2.0) finalColor *= vec3(0.8, 1.0, 0.8);
            else finalColor *= vec3(0.8, 0.8, 1.0);
            
            float vig = length(crtUV - 0.5) * 2.0;
            finalColor *= 1.0 - pow(vig, 2.5) * 0.6;
            
            finalColor = smoothstep(0.0, 1.0, finalColor);
            
            fragColor = vec4(finalColor, 1.0);
        }
      `
    });
    
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    
    canvas.__three = { renderer, scene, camera, material };
  } catch (e) {
    console.error("WebGL Initialization Failed:", e);
    return;
  }
}

const { renderer, scene, camera, material } = canvas.__three;

if (material && material.uniforms) {
  if (material.uniforms.u_time) material.uniforms.u_time.value = time;
  if (material.uniforms.u_resolution) {
    material.uniforms.u_resolution.value.set(grid.width, grid.height);
  }
}

renderer.setSize(grid.width, grid.height, false);
renderer.render(scene, camera);