const FERAL_SNAKESKIN_SYSTEM = (() => {
    // Inject CSS for the UI
    const style = document.createElement('style');
    style.textContent = `
        body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #050505; color: #fff; font-family: monospace; }
        canvas { display: block; width: 100%; height: 100%; }
        #ui-layer { position: absolute; bottom: 20px; left: 20px; z-index: 10; background: rgba(0,0,0,0.7); padding: 15px; border-left: 3px solid #f0f; pointer-events: none; text-shadow: 0 1px 2px #000; }
        .title { color: #0ff; font-weight: bold; margin-bottom: 8px; font-size: 14px; letter-spacing: 1px; }
        .control { font-size: 11px; margin: 4px 0; color: #aaa; }
        .key { color: #ff0; font-weight: bold; }
        .val { color: #fff; }
    `;
    document.head.appendChild(style);

    // Create UI overlay
    const ui = document.createElement('div');
    ui.id = 'ui-layer';
    document.body.appendChild(ui);

    // Create Canvas
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);

    // WebGL2 Context
    let gl;
    try {
        gl = canvas.getContext('webgl2', { antialias: true, depth: false });
        if (!gl) throw new Error("WebGL2 not supported");
    } catch (e) {
        ui.innerHTML = `<div class="title">ERROR</div><div class="control">WebGL2 initialization failed.</div>`;
        return;
    }

    // State
    const state = {
        palette: 0,
        falseColor: 0,
        domain: 0,
        optical: 1.0,
        packing: 0,
        mouse: [0.5, 0.5],
        clickPos: [-1.0, -1.0],
        clickTime: -1000.0,
        time: 0
    };

    const PALETTE_NAMES = ["Candy Prism", "UV Jewel", "Tropical Foil", "Electric Opal", "Neon Mineral"];
    const PACKING_NAMES = ["Diamondback", "Shield Plate", "Elongated", "Hex Grid"];
    const DOMAIN_NAMES = ["Off", "z² + c (Singularities)", "1/z (Poles)", "sin(z) (Phase Bands)"];
    const FALSE_COLOR_NAMES = ["Off", "Edge Normal Map", "Height Topology", "Phase Map"];

    function updateUI() {
        ui.innerHTML = `
            <div class="title">PRISMATIC SCALE MATRIX</div>
            <div class="control"><span class="key">C</span> Palette: <span class="val">${PALETTE_NAMES[state.palette]}</span></div>
            <div class="control"><span class="key">P</span> Packing: <span class="val">${PACKING_NAMES[state.packing]}</span></div>
            <div class="control"><span class="key">D</span> Domain Logic: <span class="val">${DOMAIN_NAMES[state.domain]}</span></div>
            <div class="control"><span class="key">F</span> False Color: <span class="val">${FALSE_COLOR_NAMES[state.falseColor]}</span></div>
            <div class="control"><span class="key">O</span> Optical Intensity: <span class="val">${state.optical.toFixed(1)}x</span></div>
            <div class="control" style="margin-top:8px; color:#666;">Mouse: Steer Optics &nbsp;|&nbsp; Click: Resonance Pulse</div>
        `;
    }
    updateUI();

    // Shaders
    const vsSource = `#version 300 es
        in vec2 position;
        out vec2 vUv;
        void main() {
            vUv = position * 0.5 + 0.5;
            gl_Position = vec4(position, 0.0, 1.0);
        }
    `;

    const fsSource = `#version 300 es
        precision highp float;

        in vec2 vUv;
        out vec4 fragColor;

        uniform float u_time;
        uniform vec2 u_resolution;
        uniform vec2 u_mouse;
        uniform vec2 u_click_pos;
        uniform float u_click_time;
        
        uniform float u_palette;
        uniform float u_false_color;
        uniform float u_domain;
        uniform float u_optical;
        uniform float u_packing;

        const float PI = 3.14159265359;

        // OKLCh to sRGB conversion for vivid, perceptually uniform colors
        vec3 oklch2rgb(float l, float c, float h) {
            float a = c * cos(h);
            float b = c * sin(h);
            float l_ = l + 0.3963377774 * a + 0.2158037573 * b;
            float m_ = l - 0.1055613458 * a - 0.0638541728 * b;
            float s_ = l - 0.0894841775 * a - 1.2914855480 * b;
            float l3 = l_*l_*l_;
            float m3 = m_*m_*m_;
            float s3 = s_*s_*s_;
            vec3 rgb = vec3(
                4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
               -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
               -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3
            );
            vec3 gamma = mix(12.92*rgb, 1.055*pow(max(rgb,0.0),vec3(1.0/2.4))-0.055, step(0.0031308, rgb));
            return clamp(gamma, 0.0, 1.0);
        }

        // Scale Structure Data
        struct Scale {
            float id;
            vec2 local;
            float h;
            float z;
            vec2 cell;
        };

        // Procedural Scale Field Generator
        Scale getScale(vec2 p) {
            Scale best;
            best.z = -1000.0;
            vec2 g = floor(p);
            
            // Search neighborhood for overlapping scales
            for(int y = -2; y <= 1; y++) {
                for(int x = -1; x <= 1; x++) {
                    vec2 cell = g + vec2(float(x), float(y));
                    // Staggered hex-like rows
                    float stagger = mod(cell.y, 2.0) * 0.5;
                    vec2 center = cell + vec2(stagger, 0.0) + 0.5;
                    vec2 local = p - center;

                    float d = 0.0;
                    if(u_packing == 0.0) {
                        // Diamondback
                        d = (abs(local.x) + abs(local.y)) * 0.95;
                    } else if(u_packing == 1.0) {
                        // Shield Plate
                        d = max(abs(local.x)*0.866 + abs(local.y)*0.5, abs(local.y)) * 1.1;
                    } else if(u_packing == 2.0) {
                        // Elongated
                        d = length(local * vec2(0.6, 1.6));
                    } else {
                        // Hex Grid
                        d = length(local * vec2(1.0, 1.2 + 0.2*sin(cell.y)));
                    }

                    // Dome height profile
                    float h = 1.0 - d * 2.0;
                    
                    // Shingle overlap tilt (scales higher in Y overlap scales lower in Y)
                    float z = h - local.y * 1.5;

                    if(z > best.z && h > -0.1) {
                        float id = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
                        best.id = id;
                        best.local = local;
                        best.h = h;
                        best.z = z;
                        best.cell = cell;
                    }
                }
            }
            return best;
        }

        // Height mapper for normal calculation
        float mapH(vec2 p) {
            return getScale(p).h;
        }

        // Palette Selector
        vec3 getPalette(float id, float h_shift) {
            float L = 0.65;
            float C = 0.3;
            float H = id * 6.28 + h_shift;

            if (u_palette == 0.0) { // Candy Prism
                L = 0.7; C = 0.32;
                H = mix(0.0, 2.5, fract(id * 3.14 + h_shift)); 
            } else if (u_palette == 1.0) { // UV Jewel
                L = 0.55; C = 0.35;
                H = mix(4.0, 6.0, fract(id * 7.1 + h_shift)); 
            } else if (u_palette == 2.0) { // Tropical Foil
                L = 0.75; C = 0.28;
                H = mix(1.5, 3.5, fract(id * 1.1 + h_shift)); 
            } else if (u_palette == 3.0) { // Electric Opal
                L = 0.85; C = 0.18;
                H = id * 6.28 + h_shift * 2.0; 
            } else { // Neon Mineral
                L = 0.65; C = 0.3;
                H = mix(0.5, 3.5, fract(id * 5.5 + h_shift)); 
            }
            return oklch2rgb(L, C, H);
        }

        void main() {
            vec2 centerUV = vUv - 0.5;
            centerUV.x *= u_resolution.x / u_resolution.y;

            // Dorsal Ridge Warp: scales are larger in the center
            float dorsalMask = exp(-dot(centerUV.x, centerUV.x) * 8.0);
            vec2 gridUV = centerUV * mix(28.0, 12.0, dorsalMask);
            
            // Flow scales downwards slowly
            gridUV.y -= u_time * 1.5;

            Scale scale = getScale(gridUV);

            // Compute Normals via finite differences on the scale height field
            vec2 e = vec2(0.02, 0.0);
            float h0 = scale.h;
            float hx = clamp(mapH(gridUV + e.xy) - h0, -0.5, 0.5);
            float hy = clamp(mapH(gridUV + e.yx) - h0, -0.5, 0.5);
            vec3 N = normalize(vec3(-hx, -hy, 0.05));

            // Lighting Vectors
            vec3 V = vec3(0.0, 0.0, 1.0);
            vec2 mouseOffset = (u_mouse - 0.5) * 2.0;
            vec3 L = normalize(vec3(mouseOffset.x, -mouseOffset.y, 0.8));
            vec3 H_vec = normalize(L + V);

            float NdotL = max(dot(N, L), 0.0);
            float NdotH = max(dot(N, H_vec), 0.0);
            float NdotV = max(dot(N, V), 0.0);

            // Base Hue & Animation
            float hueShift = u_time * 0.3 + scale.id * 10.0;

            // Click Resonance Pulse
            vec2 clickUV = u_click_pos - 0.5;
            clickUV.x *= u_resolution.x / u_resolution.y;
            float distToClick = length(centerUV - clickUV);
            float rippleTime = u_time - u_click_time;
            float ripple = sin(distToClick * 40.0 - rippleTime * 15.0);
            float rippleMask = exp(-rippleTime * 1.5) * smoothstep(0.6, 0.0, distToClick);
            hueShift += ripple * rippleMask * 3.0;

            // Domain Coloring Logic
            vec2 z_c = scale.local * 3.0;
            float arg = 0.0;
            float mag = 0.0;
            if (u_domain > 0.0) {
                if (u_domain == 1.0) {
                    z_c = vec2(z_c.x*z_c.x - z_c.y*z_c.y, 2.0*z_c.x*z_c.y) + vec2(0.2, 0.3);
                } else if (u_domain == 2.0) {
                    z_c = vec2(z_c.x, -z_c.y) / (dot(z_c, z_c) + 0.05);
                } else if (u_domain == 3.0) {
                    z_c = vec2(sin(z_c.x)*cosh(z_c.y), cos(z_c.x)*sinh(z_c.y));
                }
                arg = atan(z_c.y, z_c.x);
                mag = length(z_c);
                
                hueShift += arg * 0.2;
                hueShift += sin(mag * 8.0) * 0.15;
            }

            // Build Base Color
            vec3 color = getPalette(scale.id, hueShift);

            // False Color Overrides
            if (u_false_color == 1.0) {
                color = oklch2rgb(0.7, 0.3, N.x * 2.0 + N.y * 2.0);
            } else if (u_false_color == 2.0) {
                color = oklch2rgb(0.65, 0.35, scale.h * 15.0 - u_time);
            } else if (u_false_color == 3.0 && u_domain > 0.0) {
                color = mix(color, oklch2rgb(0.8, 0.3, arg), 0.7);
            }

            // Birefringence (Thin-Film Interference)
            float filmThick = scale.h * 800.0 * u_optical;
            vec3 interference = vec3(
                sin(filmThick * 0.010),
                sin(filmThick * 0.013),
                sin(filmThick * 0.016)
            );
            interference = interference * interference;
            color += interference * 0.4 * u_optical * (1.0 - NdotV); // Stronger at grazing angles

            // Diffraction Grating (Holographic Sheen)
            float gratingFreq = 350.0;
            float grating = sin((scale.local.x * 0.866 + scale.local.y * 0.5) * gratingFreq);
            float diff = smoothstep(0.85, 1.0, grating * NdotL * (0.5 + 0.5*sin(u_time)));
            vec3 diffColor = oklch2rgb(0.85, 0.3, scale.local.x * 15.0 - u_time * 3.0);
            color += diffColor * diff * 1.5 * u_optical;

            // Specular Highlight
            float spec = pow(NdotH, 48.0);
            color += vec3(spec) * 0.9 * u_optical;

            // Chromostereopsis (Red/Blue depth fringing on scale slopes)
            float redEdge = max(0.0, dot(N, vec3(1.0, 0.5, 0.0)));
            float blueEdge = max(0.0, dot(N, vec3(-1.0, -0.5, 0.0)));
            color.r += redEdge * 0.3 * u_optical;
            color.b += blueEdge * 0.3 * u_optical;

            // Ambient Occlusion / Imbrication Shadow (Overlaps)
            float ao = smoothstep(-0.1, 0.5, scale.h);
            color *= mix(0.1, 1.0, ao);

            // Scale Seams (Darken deep valleys)
            float seam = smoothstep(0.0, 0.08, scale.h);
            color *= mix(0.05, 1.0, seam);

            // Subtle Vignette
            float vig = 1.0 - dot(centerUV, centerUV) * 0.8;
            color *= vig;

            fragColor = vec4(color, 1.0);
        }
    `;

    // Compile Shader
    function compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    const vs = compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        return;
    }

    // Fullscreen Quad
    const vertices = new Float32Array([
        -1, -1,  1, -1, -1,  1,
        -1,  1,  1, -1,  1,  1
    ]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Uniform Locations
    const locs = {
        time: gl.getUniformLocation(program, "u_time"),
        res: gl.getUniformLocation(program, "u_resolution"),
        mouse: gl.getUniformLocation(program, "u_mouse"),
        clickPos: gl.getUniformLocation(program, "u_click_pos"),
        clickTime: gl.getUniformLocation(program, "u_click_time"),
        palette: gl.getUniformLocation(program, "u_palette"),
        falseColor: gl.getUniformLocation(program, "u_false_color"),
        domain: gl.getUniformLocation(program, "u_domain"),
        optical: gl.getUniformLocation(program, "u_optical"),
        packing: gl.getUniformLocation(program, "u_packing")
    };

    // Event Listeners
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
    });
    window.dispatchEvent(new Event('resize'));

    window.addEventListener('mousemove', (e) => {
        state.mouse[0] = e.clientX / window.innerWidth;
        state.mouse[1] = e.clientY / window.innerHeight;
    });

    window.addEventListener('touchmove', (e) => {
        state.mouse[0] = e.touches[0].clientX / window.innerWidth;
        state.mouse[1] = e.touches[0].clientY / window.innerHeight;
    }, {passive: true});

    window.addEventListener('mousedown', (e) => {
        state.clickPos[0] = e.clientX / window.innerWidth;
        state.clickPos[1] = 1.0 - (e.clientY / window.innerHeight);
        state.clickTime = state.time;
    });

    window.addEventListener('touchstart', (e) => {
        state.clickPos[0] = e.touches[0].clientX / window.innerWidth;
        state.clickPos[1] = 1.0 - (e.touches[0].clientY / window.innerHeight);
        state.clickTime = state.time;
    }, {passive: true});

    window.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        let changed = false;
        if (k === 'c') { state.palette = (state.palette + 1) % 5; changed = true; }
        if (k === 'p') { state.packing = (state.packing + 1) % 4; changed = true; }
        if (k === 'd') { state.domain = (state.domain + 1) % 4; changed = true; }
        if (k === 'f') { state.falseColor = (state.falseColor + 1) % 4; changed = true; }
        if (k === 'o') { 
            state.optical += 0.5; 
            if(state.optical > 2.0) state.optical = 0.5; 
            changed = true; 
        }
        if (changed) updateUI();
    });

    // Render Loop
    let startTime = performance.now();
    function render(now) {
        state.time = (now - startTime) * 0.001;

        gl.useProgram(program);
        gl.uniform1f(locs.time, state.time);
        gl.uniform2f(locs.res, canvas.width, canvas.height);
        gl.uniform2f(locs.mouse, state.mouse[0], state.mouse[1]);
        gl.uniform2f(locs.clickPos, state.clickPos[0], state.clickPos[1]);
        gl.uniform1f(locs.clickTime, state.clickTime);
        
        gl.uniform1f(locs.palette, state.palette);
        gl.uniform1f(locs.falseColor, state.falseColor);
        gl.uniform1f(locs.domain, state.domain);
        gl.uniform1f(locs.optical, state.optical);
        gl.uniform1f(locs.packing, state.packing);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
})();