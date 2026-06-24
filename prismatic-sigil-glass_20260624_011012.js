try {
  if (!ctx) throw new Error("WebGL 2 context not available");

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const sceneFeedback = new THREE.Scene();
    const sceneScreen = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const rtOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      stencilBuffer: false,
      depthBuffer: false
    };

    let rt1 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);
    let rt2 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtOptions);

    const matFeedback = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        tPrev: { value: null }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;

        uniform float u_time;
        uniform vec2 u_resolution;
        uniform sampler2D tPrev;

        // Hash & Noise
        vec2 hash22(vec2 p) {
            p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)));
            return -1.0 + 2.0*fract(sin(p)*43758.5453123);
        }
        
        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f*f*(3.0-2.0*f);
            return mix( mix( dot( hash22(i + vec2(0.0,0.0)), f - vec2(0.0,0.0) ),
                             dot( hash22(i + vec2(1.0,0.0)), f - vec2(1.0,0.0) ), u.x),
                        mix( dot( hash22(i + vec2(0.0,1.0)), f - vec2(0.0,1.0) ),
                             dot( hash22(i + vec2(1.0,1.0)), f - vec2(1.0,1.0) ), u.x), u.y);
        }
        
        float fbm(vec2 p) {
            float f = 0.0;
            float w = 0.5;
            for(int i=0; i<4; i++) {
                f += w * noise(p);
                p *= 2.0;
                w *= 0.5;
            }
            return f;
        }

        // SDFs
        float sdBox( in vec2 p, in vec2 b ) {
            vec2 d = abs(p)-b;
            return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
        }

        float sdHexagon( in vec2 p, in float r ) {
            const vec3 k = vec3(-0.866025404,0.5,0.577350269);
            p = abs(p);
            p -= 2.0*min(dot(k.xy,p),0.0)*k.xy;
            p -= vec2(clamp(p.x, -k.z*r, k.z*r), r);
            return length(p)*sign(p.y);
        }

        float sdEquilateralTriangle( in vec2 p, in float r ) {
            const float k = sqrt(3.0);
            p.x = abs(p.x) - r;
            p.y = p.y + r/k;
            if( p.x+k*p.y>0.0 ) p = vec2(p.x-k*p.y,-k*p.x-p.y)/2.0;
            p.x -= clamp( p.x, -2.0*r, 0.0 );
            return -length(p)*sign(p.y);
        }

        // Temporal Sampling with Pulfrich RGB split
        vec3 getTemporal(sampler2D tex, vec2 uv, float time) {
            vec2 pUV = uv - 0.5;
            float a = 0.02 * sin(time * 0.3);
            mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
            pUV = rot * pUV * 0.993 + 0.5; // Slow outward spiral

            vec3 col;
            vec2 drift = vec2(0.003 * sin(time), 0.003 * cos(time));
            col.r = texture(tex, pUV + drift).r;
            col.g = texture(tex, pUV).g;
            col.b = texture(tex, pUV - drift).b;
            return col;
        }

        // Scene Generation
        vec3 generateScene(vec2 uv, vec2 p, float time) {
            // Schlieren heat haze background
            vec2 flow = p + vec2(fbm(p * 2.0 + time * 0.2), fbm(p * 2.0 - time * 0.3)) * 0.5;
            vec3 bg = mix(vec3(0.1, 0.0, 0.3), vec3(0.0, 0.5, 0.7), fbm(flow * 1.5)); // Violet to Cyan
            bg = mix(bg, vec3(0.9, 0.1, 0.6), smoothstep(0.2, 0.8, fbm(flow * 3.0 + time * 0.5))); // Magenta flow

            // Drifting Collage Fragments
            vec2 fragP = p;
            fragP.y += time * 0.15;
            vec2 cell = floor(fragP * 4.0);
            vec2 localP = fract(fragP * 4.0) - 0.5;
            if (fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453) > 0.85) {
                float dFrag = sdEquilateralTriangle(localP, 0.15);
                bg = mix(bg, vec3(1.0, 0.4, 0.0), smoothstep(0.02, 0.0, dFrag) * 0.6); // Warm orange
            }

            // Central Sigil
            float dCircle = abs(length(p) - 0.35) - 0.005;
            float dTri = abs(sdEquilateralTriangle(p * vec2(1.0, -1.0), 0.25)) - 0.005;
            float dLine = abs(p.x) - 0.005;
            dLine = max(dLine, abs(p.y) - 0.4);

            float sigilMask = smoothstep(0.01, 0.0, min(dCircle, min(dTri, dLine)));
            float glow = 0.003 / max(dCircle, 0.0001) + 0.003 / max(dTri, 0.0001);

            vec3 sigilCol = vec3(0.7, 1.0, 0.0) * sigilMask; // Acid green
            sigilCol += vec3(0.0, 0.8, 1.0) * glow * 0.8;    // Electric blue glow
            bg += sigilCol;

            // Geomantic Dots
            float dDots = length(vec2(abs(p.x) - 0.12, abs(p.y) - 0.2)) - 0.025;
            bg = mix(bg, vec3(1.0, 0.9, 0.8), smoothstep(0.01, 0.0, dDots));

            return bg;
        }

        void main() {
            vec2 uv = vUv;
            vec2 p = uv * 2.0 - 1.0;
            p.x *= u_resolution.x / u_resolution.y;

            // Glass Panes Geometry
            float dPane1 = sdBox(p, vec2(0.45, 0.65)) - 0.05;
            float dPane2 = sdHexagon(p + vec2(0.2 * sin(u_time * 0.6), 0.15 * cos(u_time * 0.4)), 0.35);
            
            float glass1 = smoothstep(0.01, -0.01, dPane1);
            float glass2 = smoothstep(0.01, -0.01, dPane2);

            // Refraction UVs
            vec2 refrUV = uv;
            if (glass1 > 0.5) refrUV += vec2(fbm(p * 3.0 + u_time), fbm(p * 3.0 - u_time)) * 0.04;
            if (glass2 > 0.5) refrUV -= vec2(fbm(p * 4.0 - u_time), fbm(p * 4.0 + u_time)) * 0.03;

            // Base Scene & Temporal Feedback
            vec3 curScene = generateScene(uv, p, u_time);
            vec3 prevNormal = getTemporal(tPrev, uv, u_time);
            vec3 baseColor = mix(curScene, prevNormal, 0.82); // Afterimage decay

            // Apply Refractive Glass
            vec3 finalColor = baseColor;
            if (glass1 > 0.5 || glass2 > 0.5) {
                // Glass refracts the *history* for a temporal phase-shift effect
                vec3 refrColor = getTemporal(tPrev, refrUV, u_time);
                
                vec3 tint = vec3(1.0);
                if (glass1 > 0.5) tint *= vec3(0.8, 0.9, 1.0); // Cyanish pane
                if (glass2 > 0.5) tint *= vec3(1.0, 0.8, 0.9); // Warm pane
                
                finalColor = refrColor * tint;

                // Prismatic Specular Edges
                vec3 prism = 0.5 + 0.5 * cos(u_time * 2.0 + p.xyx * 6.0 + vec3(0,2,4));
                float edge1 = smoothstep(-0.02, 0.0, dPane1) - smoothstep(0.0, 0.02, dPane1);
                float edge2 = smoothstep(-0.02, 0.0, dPane2) - smoothstep(0.0, 0.02, dPane2);
                
                finalColor += prism * edge1 * 1.5;
                finalColor += prism.zyx * edge2 * 1.5;
            }

            fragColor = vec4(finalColor, 1.0);
        }
      `
    });

    const matScreen = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        tInput: { value: null }
      },
      vertexShader: `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        in vec2 vUv;
        out vec4 fragColor;

        uniform float u_time;
        uniform vec2 u_resolution;
        uniform sampler2D tInput;

        void main() {
            vec2 uv = vUv;
            
            // Chromatic Aberration (radial)
            vec2 dir = normalize(uv - 0.5);
            float dist = length(uv - 0.5);
            float ca = 0.006 * dist;

            vec3 col;
            col.r = texture(tInput, uv + dir * ca).r;
            col.g = texture(tInput, uv).g;
            col.b = texture(tInput, uv - dir * ca).b;

            // Subtle CRT Phosphor
            float scan = sin(uv.y * u_resolution.y * 1.5) * 0.02;
            float mask = sin(uv.x * u_resolution.x * 2.0) * 0.015;
            col += scan + mask;

            // Light Analog Noise
            float n = fract(sin(dot(uv + u_time, vec2(12.9898, 78.233))) * 43758.5453);
            col += (n - 0.5) * 0.03;

            // Vignette
            col *= smoothstep(1.0, 0.3, dist);

            // Perceptual Grade (soft contrast)
            col = smoothstep(0.0, 1.0, col);
            col = pow(col, vec3(0.95));

            fragColor = vec4(col, 1.0);
        }
      `
    });

    const geo = new THREE.PlaneGeometry(2, 2);
    const meshFeedback = new THREE.Mesh(geo, matFeedback);
    const meshScreen = new THREE.Mesh(geo, matScreen);

    sceneFeedback.add(meshFeedback);
    sceneScreen.add(meshScreen);

    canvas.__three = { 
      renderer, 
      sceneFeedback, 
      sceneScreen, 
      camera, 
      matFeedback, 
      matScreen, 
      rt1, 
      rt2 
    };
  }

  const { renderer, sceneFeedback, sceneScreen, camera, matFeedback, matScreen, rt1, rt2 } = canvas.__three;

  if (renderer.domElement.width !== grid.width || renderer.domElement.height !== grid.height) {
    renderer.setSize(grid.width, grid.height, false);
    rt1.setSize(grid.width, grid.height);
    rt2.setSize(grid.width, grid.height);
    if (matFeedback?.uniforms?.u_resolution) {
      matFeedback.uniforms.u_resolution.value.set(grid.width, grid.height);
    }
    if (matScreen?.uniforms?.u_resolution) {
      matScreen.uniforms.u_resolution.value.set(grid.width, grid.height);
    }
  }

  if (matFeedback?.uniforms?.u_time) matFeedback.uniforms.u_time.value = time;
  if (matScreen?.uniforms?.u_time) matScreen.uniforms.u_time.value = time;

  if (matFeedback?.uniforms?.tPrev) matFeedback.uniforms.tPrev.value = rt1.texture;
  
  renderer.setRenderTarget(rt2);
  renderer.render(sceneFeedback, camera);

  if (matScreen?.uniforms?.tInput) matScreen.uniforms.tInput.value = rt2.texture;
  renderer.setRenderTarget(null);
  renderer.render(sceneScreen, camera);

  canvas.__three.rt1 = rt2;
  canvas.__three.rt2 = rt1;

} catch (e) {
  console.error("WebGL Initialization or Render Failed:", e);
}