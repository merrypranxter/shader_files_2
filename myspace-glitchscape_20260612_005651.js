// KIYOSHI-ABSORBER-V1: HYPERBOLIC MYSPACE GLITCHSCAPE
// A synthesis of early-internet UI debris, reaction-diffusion fungal bloom, 
// kairotempic infinite zoom (feedback chaos), and macroblock corruption.

if (!canvas.__glitchscape) {
    canvas.__glitchscape = {
        agents: [],
        windows: [],
        frame: 0
    };
    
    // Initial clear
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, grid.width, grid.height);
}

const state = canvas.__glitchscape;
state.frame++;

const cx = grid.width / 2;
const cy = grid.height / 2;

// --- 1. KAIROTEMPIC ZOOM FEEDBACK (Temporal Echo & Moiré Tunnel) ---
ctx.save();
ctx.translate(cx, cy);
// Exponential zoom + slight wobble to create a hyperbolic funnel effect
const zoom = 1.015 + Math.sin(time * 0.3) * 0.005;
const rot = Math.cos(time * 0.4) * 0.01;
ctx.scale(zoom, zoom);
ctx.rotate(rot);
ctx.translate(-cx, -cy);

// Base persistence
ctx.globalAlpha = 0.96;
ctx.globalCompositeOperation = 'source-over';
ctx.drawImage(canvas, 0, 0);

// Chromatic Aberration (RGB Split) via offset screen layers
ctx.globalCompositeOperation = 'screen';
ctx.globalAlpha = 0.15;
// Cyan channel push
ctx.drawImage(canvas, 3 * Math.sin(time * 2), 0);
// Magenta channel push
ctx.drawImage(canvas, -3 * Math.sin(time * 2.3), 0);
ctx.restore();

// Entropy darkening to prevent total whiteout
ctx.globalCompositeOperation = 'source-over';
ctx.globalAlpha = 0.05;
ctx.fillStyle = '#050505';
ctx.fillRect(0, 0, grid.width, grid.height);
ctx.globalAlpha = 1.0;

// --- 2. CANDY-CRASH MACROBLOCKING (Compression Artifacts) ---
if (Math.random() < 0.15) {
    const bw = Math.random() * 200 + 20;
    const bh = Math.random() * 50 + 10;
    const bx = Math.random() * grid.width;
    const by = Math.random() * grid.height;
    // Quantized shift
    const shiftX = Math.floor((Math.random() - 0.5) * 5) * 20;
    const shiftY = Math.floor((Math.random() - 0.5) * 2) * 10;
    ctx.drawImage(canvas, bx, by, bw, bh, bx + shiftX, by + shiftY, bw, bh);
}

// --- Helper: Blingee Sparkle ---
const drawSparkle = (x, y, size, hue) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * 3 + x);
    ctx.fillStyle = `hsl(${hue}, 100%, 75%)`;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.quadraticCurveTo(size * 0.2, -size * 0.2, size, 0);
    ctx.quadraticCurveTo(size * 0.2, size * 0.2, 0, size);
    ctx.quadraticCurveTo(-size * 0.2, size * 0.2, -size, 0);
    ctx.quadraticCurveTo(-size * 0.2, -size * 0.2, 0, -size);
    ctx.fill();
    ctx.restore();
};

// --- 3. UI DEBRIS SPAWNING (Semantic Rot) ---
// Windows pop up and are immediately sucked into the feedback tunnel
if (Math.random() < 0.08 && state.windows.length < 15) {
    const isPink = Math.random() > 0.5;
    state.windows.push({
        x: cx + (Math.random() - 0.5) * (grid.width * 0.8),
        y: cy + (Math.random() - 0.5) * (grid.height * 0.8),
        w: 120 + Math.random() * 100,
        h: 60 + Math.random() * 40,
        title: ["ERROR_404", "xX_AnGeL_Xx", "wArNiNg.exe", "fAtAl_lOvE", "</3_bRokEn", "hAcK_tHe_pLaNeT"][Math.floor(Math.random() * 6)],
        hue: isPink ? 320 : 180, // Hyperpop Rupture palette
        life: 0
    });
}

// --- 4. EVOLVE & DRAW WINDOWS ---
state.windows.forEach((win, i) => {
    win.life += 0.02;
    
    // Orbital drift
    win.x += Math.sin(time * 2 + i) * 1.5;
    win.y += Math.cos(time * 2 + i) * 1.5;

    ctx.save();
    ctx.translate(win.x, win.y);
    
    // Glitch jitter
    if (Math.random() < 0.1) ctx.translate((Math.random() - 0.5) * 15, 0);

    // Base window (Win95 aesthetic)
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(-win.w/2, -win.h/2, win.w, win.h);
    
    // 3D Bevel
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-win.w/2, win.h/2); ctx.lineTo(-win.w/2, -win.h/2); ctx.lineTo(win.w/2, -win.h/2); ctx.stroke();
    ctx.strokeStyle = '#808080';
    ctx.beginPath(); ctx.moveTo(-win.w/2, win.h/2); ctx.lineTo(win.w/2, win.h/2); ctx.lineTo(win.w/2, -win.h/2); ctx.stroke();

    // Title bar
    ctx.fillStyle = `hsl(${win.hue}, 100%, 45%)`;
    ctx.fillRect(-win.w/2 + 3, -win.h/2 + 3, win.w - 6, 18);

    // Title Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(win.title, -win.w/2 + 8, -win.h/2 + 16);

    // Body Text
    ctx.fillStyle = '#000000';
    ctx.font = '10px monospace';
    ctx.fillText("sys_failure_0x", -win.w/2 + 12, 5);
    ctx.fillText("abandon_ship", -win.w/2 + 12, 20);

    // Occasional sparkle
    if (Math.random() < 0.3) {
        drawSparkle(-win.w/2 + 5, -win.h/2 + 5, 20, win.hue);
    }

    ctx.restore();

    // The window hemorrhages "Mold Agents" (DLA clustering)
    if (Math.random() < 0.2) {
        state.agents.push({
            x: win.x + (Math.random() - 0.5) * win.w,
            y: win.y + (Math.random() - 0.5) * win.h,
            vx: 0, vy: 0,
            hue: win.hue + (Math.random() - 0.5) * 30,
            size: Math.random() * 4 + 1.5,
            life: 80
        });
    }

    // Die after lifespan
    if (win.life > 1) state.windows.splice(i, 1);
});

// --- 5. MYSPACE TEXT STAMPS (Ironic Sincerity) ---
if (Math.random() < 0.05) {
    ctx.save();
    ctx.translate(cx + (Math.random() - 0.5) * grid.width * 0.8, cy + (Math.random() - 0.5) * grid.height * 0.8);
    ctx.rotate((Math.random() - 0.5) * 0.8);
    ctx.font = 'italic bold 36px "Comic Sans MS", cursive, sans-serif';
    const txt = ["*~mAgIc~*", "RAWWR xD", "pLz rEpLy", "bRoKeN", "</3", "tOp_8"][Math.floor(Math.random() * 6)];
    
    // Drop shadow
    ctx.fillStyle = '#000000';
    ctx.fillText(txt, 4, 4);
    // Neon fill
    ctx.fillStyle = `hsl(${Math.random() > 0.5 ? 320 : 180}, 100%, 65%)`;
    ctx.fillText(txt, 0, 0);
    ctx.restore();
}

// --- 6. EVOLVE & DRAW MOLD AGENTS (Dashed Moiré Trails) ---
ctx.globalCompositeOperation = 'screen';
for (let i = state.agents.length - 1; i >= 0; i--) {
    const a = state.agents[i];

    // Divergence-free curl noise approximation
    const n = Math.sin(a.x * 0.015 + time * 1.2) + Math.cos(a.y * 0.018 - time * 0.9);
    a.vx += Math.cos(n * Math.PI * 2) * 0.8;
    a.vy += Math.sin(n * Math.PI * 2) * 0.8;

    // Organic friction
    a.vx *= 0.88;
    a.vy *= 0.88;

    // Subtle orbital pull towards center
    const dx = cx - a.x;
    const dy = cy - a.y;
    a.vx += dy * 0.002;
    a.vy -= dx * 0.002;

    const prevX = a.x;
    const prevY = a.y;
    a.x += a.vx;
    a.y += a.vy;

    // Draw dashed trail. When zoomed by the feedback loop, 
    // these dashed lines expand into massive, vibrating moiré grids.
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(a.x, a.y);
    ctx.strokeStyle = `hsl(${a.hue}, 100%, 60%)`;
    ctx.lineWidth = a.size;
    ctx.lineCap = 'round';
    // The dash array creates the "quantized/digital" texture
    ctx.setLineDash([a.size * 2, a.size * 2.5]);
    ctx.stroke();

    a.life--;
    if (a.life <= 0) {
        state.agents.splice(i, 1);
    }
}
// Clean up line dash for other rendering passes
ctx.setLineDash([]);
ctx.globalCompositeOperation = 'source-over';