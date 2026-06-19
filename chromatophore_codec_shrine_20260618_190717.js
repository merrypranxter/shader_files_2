try {
  if (!ctx) throw new Error("WebGL 2 context not available");

  if (!canvas.__three) {
    const renderer = new THREE.WebGLRenderer({ canvas, context: ctx, alpha: true, antialias: false });
    renderer.autoClear = false;

    const rtParams = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      depthBuffer: false
    };

    const rtRD1 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
    const rtRD2 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
    const rtScene1 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);
    const rtScene2 = new THREE.WebGLRenderTarget(grid.width, grid.height, rtParams);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    scene.add(quad);

    const vertexShader = `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const rdFragmentShader = `
      in vec2 vUv;
      out vec4 fragColor;
      uniform sampler2D u_prev;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform int u_frame;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        vec2 px = 1.0 / u_resolution;

        if (u_frame < 5) {
          float u = 1.0;
          float v = step(0.98, hash(vUv + u_time));
          if (length(vUv - 0.5) < 0.15) v = 1.0; 
          fragColor = vec4(u, v, 0.0, 1.0);
          return;
        }

        vec2 C = texture(u_prev, vUv).rg;
        vec2 N = texture(u_prev, vUv + vec2(0.0, px.y)).rg;
        vec2 S = texture(u_prev, vUv - vec2(0.0, px.y)).rg;
        vec2 E = texture(u_prev, vUv + vec2(px.x, 0.0)).rg;
        vec2 W = texture(u_prev, vUv - vec2(px.x, 0.0)).rg;

        vec2 lap = N + S + E + W - 4.0 * C;

        float u = C.x;
        float v = C.y;
        float uvv = u * v * v;

        float r = length(vUv - 0.5);
        float F = mix(0.020, 0.035, r + 0.1 * sin(u_time * 0.5));
        float k = mix(0.050, 0.062, r);

        float Du = 0.16;
        float Dv = 0.08;

        float du = Du * lap.x - uvv + F * (1.0 - u);
        float dv = Dv * lap.y + uvv - (F + k) * v;

        fragColor = vec4(clamp(u + du, 0.0, 1.0), clamp(v + dv, 0.0, 1.0), 0.0, 1.0);
      }
    `;

    const sceneFragmentShader = `
      in vec2 vUv;
      out vec4 fragColor;
      uniform sampler2D u_rd;
      uniform sampler2D u_prev_scene;
      uniform float u_time;
      uniform vec2 u_resolution;

      float sdBox(vec2 p, vec2 b) {
        vec2 d = abs(p) - b;
        return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
      }

      void main() {
        vec2 px = 1.0 / u_resolution;
        vec2 rd = texture(u_rd, vUv).rg;

        float blocks = 50.0;
        vec2 q_uv = floor(vUv * blocks) / blocks;
        vec2 rd_q = texture(u_rd, q_uv).rg;
        
        float dx = texture(u_rd, q_uv + vec2(px.x * 15.0, 0.0)).g - rd_q.g;
        float dy = texture(u_rd, q_uv + vec2(0.0, px.y * 15.0)).g - rd_q.g;
        vec2 mv = vec2(dx, dy) * 8.0;

        float hash = fract(sin(dot(q_uv, vec2(12.9898, 78.233)) + u_time) * 43758.5453);
        float packet_loss = step(0.88, hash);

        vec2 mosh_uv = vUv;
        if (packet_loss > 0.5) {
          mosh_uv -= mv * 0.15;
        }
        vec3 prev_color = texture(u_prev_scene, mosh_uv).rgb;

        vec2 cuv = vUv - 0.5;
        float r = length(cuv);
        float a = atan(cuv.y, cuv.x);

        float funnel = sign(sin(4.0 / (r + 0.05) - u_time * 3.0)) * sign(sin(a * 10.0 + u_time));
        float zebra = sin(vUv.y * 60.0 + sin(vUv.x * 25.0 + u_time) * 6.0 + rd.g * 25.0);

        float win1 = sdBox(cuv, vec2(0.35, 0.40));
        float win2 = sdBox(cuv + vec2(0.2, 0.25), vec2(0.18, 0.12));
        float win3 = sdBox(cuv - vec2(0.25, -0.35), vec2(0.22, 0.06));

        vec2 strip_uv = fract(vUv * vec2(25.0, 6.0)) - 0.5;
        float buttons = sdBox(strip_uv, vec2(0.35, 0.35));

        float c_res = 65.0;
        vec2 c_uv = fract(vUv * c_res) - 0.5;
        vec2 c_id = floor(vUv * c_res) / c_res;
        float c_act = texture(u_rd, c_id).g;
        
        float pulse = 0.5 + 0.5 * sin(u_time * 12.0 + c_id.x * 15.0 + c_id.y * 20.0);
        float c_rad = 0.08 + 0.45 * c_act * pulse;
        float chromato = smoothstep(c_rad, c_rad - 0.05, length(c_uv));

        vec3 col_bg = mix(vec3(0.2, 0.0, 0.4), vec3(0.0, 0.7, 0.9), funnel * 0.5 + 0.5);
        vec3 col_win = mix(vec3(0.9, 0.0, 0.6), vec3(0.8, 1.0, 0.0), zebra * 0.5 + 0.5);

        vec3 scene_col = col_bg;

        if (win1 < 0.0) scene_col = col_win;
        if (win2 < 0.0) scene_col = mix(vec3(0.0, 0.9, 0.4), vec3(1.0, 0.3, 0.0), chromato);
        if (win3 < 0.0) scene_col = mix(vec3(0.6, 0.0, 1.0), vec3(0.0, 1.0, 1.0), step(0.0, buttons));

        float border = smoothstep(0.015, 0.005, abs(win1)) +
                       smoothstep(0.015, 0.005, abs(win2)) +
                       smoothstep(0.015, 0.005, abs(win3));
        scene_col = mix(scene_col, vec3(1.0, 0.1, 0.8), border);

        float portal = smoothstep(0.25, 0.22, r) * smoothstep(0.18, 0.21, r);
        scene_col = mix(scene_col, vec3(0.0, 1.0, 0.6), portal);
        if (r < 0.2) {
          scene_col = mix(vec3(0.8, 0.0, 0.4), vec3(0.1, 0.9, 0.9), chromato);
        }

        float blend = packet_loss * 0.92 + 0.08;
        vec3 final_col = mix(scene_col, prev_color, blend * 0.88);

        fragColor = vec4(final_col, 1.0);
      }
    `;

    const postFragmentShader = `
      in vec2 vUv;
      out vec4 fragColor;
      uniform sampler2D u_scene;
      uniform float u_time;
      uniform vec2 u_resolution;

      void main() {
        vec2 dist = vUv - 0.5;
        float r_len = length(dist);

        float disp = 0.06 * r_len;
        vec3 col;
        col.r = texture(u_scene, vUv + dist * disp).r;
        col.g = texture(u_scene, vUv).g;
        col.b = texture(u_scene, vUv - dist * disp * 1.3).b;

        vec3 ghost = texture(u_scene, vUv + vec2(0.02, 0.0)).rgb;
        col = mix(col, ghost, 0.45 * smoothstep(0.15, 0.85, r_len));

        float luma = dot(col, vec3(0.299, 0.587, 0.114));

        vec3 shadow = vec3(0.3, 0.0, 0.5);
        vec3 mid = vec3(0.0, 0.9, 0.8);
        vec3 high = vec3(1.0, 0.0, 0.6);
        vec3 ultra = vec3(0.9, 1.0, 0.0);

        vec3 mapped = mix(shadow, mid, smoothstep(0.0, 0.35, luma));
        mapped = mix(mapped, high, smoothstep(0.35, 0.7, luma));
        mapped = mix(mapped, ultra, smoothstep(0.7, 1.0, luma));

        col = mix(col, mapped, 0.85);

        float scan = sin(vUv.y * u_resolution.y * 2.5);
        col = mix(col, vec3(0.6, 0.0, 0.9), scan * 0.12);

        col = mix(col, vec3(0.2, 0.0, 0.4), smoothstep(0.5, 1.3, r_len) * 0.6);

        float n_luma = dot(col, vec3(0.299, 0.587, 0.114));
        vec3 chroma = col - n_luma;
        col = n_luma + chroma * 1.4;

        col = clamp(col, vec3(0.15, 0.05, 0.25), vec3(0.95, 0.95, 0.90));

        fragColor = vec4(col, 1.0);
      }
    `;

    const matRD = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_prev: { value: null },
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) },
        u_frame: { value: 0 }
      },
      vertexShader,
      fragmentShader: rdFragmentShader
    });

    const matScene = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_rd: { value: null },
        u_prev_scene: { value: null },
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader,
      fragmentShader: sceneFragmentShader
    });

    const matPost = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        u_scene: { value: null },
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(grid.width, grid.height) }
      },
      vertexShader,
      fragmentShader: postFragmentShader
    });

    canvas.__three = {
      renderer, scene, camera, quad,
      rtRD1, rtRD2, rtScene1, rtScene2,
      matRD, matScene, matPost,
      frame: 0
    };
  }

  const state = canvas.__three;
  state.frame++;
  state.renderer.setSize(grid.width, grid.height, false);

  state.matRD.uniforms.u_time.value = time;
  state.matRD.uniforms.u_frame.value = state.frame;
  state.matRD.uniforms.u_resolution.value.set(grid.width, grid.height);
  
  state.matScene.uniforms.u_time.value = time;
  state.matScene.uniforms.u_resolution.value.set(grid.width, grid.height);
  
  state.matPost.uniforms.u_time.value = time;
  state.matPost.uniforms.u_resolution.value.set(grid.width, grid.height);

  for (let i = 0; i < 4; i++) {
    state.quad.material = state.matRD;
    state.matRD.uniforms.u_prev.value = state.rtRD1.texture;
    state.renderer.setRenderTarget(state.rtRD2);
    state.renderer.render(state.scene, state.camera);

    let tempRD = state.rtRD1;
    state.rtRD1 = state.rtRD2;
    state.rtRD2 = tempRD;
  }

  state.quad.material = state.matScene;
  state.matScene.uniforms.u_rd.value = state.rtRD1.texture;
  state.matScene.uniforms.u_prev_scene.value = state.rtScene1.texture;
  state.renderer.setRenderTarget(state.rtScene2);
  state.renderer.render(state.scene, state.camera);

  let tempScene = state.rtScene1;
  state.rtScene1 = state.rtScene2;
  state.rtScene2 = tempScene;

  state.quad.material = state.matPost;
  state.matPost.uniforms.u_scene.value = state.rtScene1.texture;
  state.renderer.setRenderTarget(null);
  state.renderer.render(state.scene, state.camera);

} catch (e) {
  console.error("WebGL Initialization Failed:", e);
}