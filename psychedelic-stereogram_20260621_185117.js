const W = grid.width;
const H = grid.height;

// Initialize or retrieve offscreen buffers to avoid garbage collection overhead
if (!canvas.__stereogramData) {
    const depthCanvas = document.createElement('canvas');
    const wallpaperCanvas = document.createElement('canvas');
    canvas.__stereogramData = {
        depthCanvas,
        depthCtx: depthCanvas.getContext('2d'),
        wallpaperCanvas,
        wallpaperCtx: wallpaperCanvas.getContext('2d'),
        lastTime: 0
    };
}

const { depthCanvas, depthCtx, wallpaperCanvas, wallpaperCtx } = canvas.__stereogramData;

// Dynamically scale stereogram period E based on canvas width
const E = Math.max(110, Math.min(170, Math.floor(W * 0.16)));
const mu = 0.38; // Depth scale (relief intensity)

if (depthCanvas.width !== W || depthCanvas.height !== H) {
    depthCanvas.width = W;
    depthCanvas.height = H;
}

if (wallpaperCanvas.width !== E || wallpaperCanvas.height !== H) {
    wallpaperCanvas.width = E;
    wallpaperCanvas.height = H;
}

// Seedable pseudo-random generator for deterministic noise
function hash(n) {
    return Math.sin(n * 12.13 + 7.89) * 43758.5453 % 1;
}

// 3D rotation helpers for the floating impossible object
function rotate3D(x, y, z, ax, ay) {
    // Rotate X
    let cosX = Math.cos(ax), sinX = Math.sin(ax);
    let y1 = y * cosX - z * sinX;
    let z1 = y * sinX + z * cosX;
    // Rotate Y
    let cosY = Math.cos(ay), sinY = Math.sin(ay);
    let x2 = x * cosY + z1 * sinY;
    let z2 = -x * sinY + z1 * cosY;
    return [x2, y1, z2];
}

// ─── 1. RENDER THE 3D DEPTH MAP (z in [0, 1]) ───────────────────────────────
// We clear the depth canvas to black (depth = 0, representing background)
depthCtx.fillStyle = '#000000';
depthCtx.fillRect(0, 0, W, H);

// Generate geometry representing our floating impossible torus-knot / Klein-bottle hybrid
const spheres = [];
const N = 120; // Number of spheres tracing the knot
const tOffset = time * 0.5;

// Build the Torus Knot (p=3, q=8)
for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const rTorus = 0.44 + 0.12 * Math.cos(8 * t + time);
    const tx = rTorus * Math.cos(3 * t + tOffset);
    const ty = rTorus * Math.sin(3 * t + tOffset);
    const tz = 0.15 * Math.sin(8 * t + time * 1.5);

    const [rx, ry, rz] = rotate3D(tx, ty, tz, time * 0.3, time * 0.25);
    spheres.push({
        x: rx,
        y: ry,
        z: rz,
        r: 0.085 + 0.015 * Math.sin(8 * t + time * 2.0),
        isHollow: false
    });
}

// Add a central pulsing impossible core (hollow sphere)
const [cx, cy, cz] = rotate3D(0, 0, 0, time * 0.15, time * 0.3);
spheres.push({
    x: cx,
    y: cy,
    z: cz + 0.05,
    r: 0.24 + 0.04 * Math.sin(time * 1.8),
    isHollow: true
});

// Sort spheres from deepest to nearest (Painter's Algorithm)
spheres.sort((a, b) => a.z - b.z);

// Draw spheres onto the depth canvas as radial grayscale gradients
const Z_min = -0.7;
const Z_max = 0.7;

spheres.forEach(s => {
    // Map normalized coordinates to screen pixels
    const screenX = W / 2 + s.x * (W * 0.36);
    const screenY = H / 2 + s.y * (H * 0.36);
    const screenR = s.r * (W * 0.36);

    const valCenter = Math.max(0, Math.min(255, ((s.z + s.r - Z_min) / (Z_max - Z_min)) * 255));
    const valEdge = Math.max(0, Math.min(255, ((s.z - Z_min) / (Z_max - Z_min)) * 255));

    const grad = depthCtx.createRadialGradient(screenX, screenY, 0, screenX, screenY, screenR);
    grad.addColorStop(0, `rgb(${valCenter}, 0, 0)`);
    grad.addColorStop(1, `rgb(${valEdge}, 0, 0)`);

    depthCtx.fillStyle = grad;
    depthCtx.beginPath();
    depthCtx.arc(screenX, screenY, screenR, 0, Math.PI * 2);
    depthCtx.fill();

    if (s.isHollow) {
        // Carve a physical hole in the center of the core
        const holeR = screenR * 0.55;
        const holeGrad = depthCtx.createRadialGradient(screenX, screenY, 0, screenX, screenY, holeR);
        holeGrad.addColorStop(0, 'rgb(0, 0, 0)');
        holeGrad.addColorStop(1, `rgb(${valEdge}, 0, 0)`);

        depthCtx.fillStyle = holeGrad;
        depthCtx.beginPath();
        depthCtx.arc(screenX, screenY, holeR, 0, Math.PI * 2);
        depthCtx.fill();
    }
});

// ─── 2. GENERATE PSYCHEDELIC WALLPAPER PATTERN ──────────────────────────────
// This generates a hyper-detailed, seamless, acid neon pattern on the offscreen wallpaper canvas
wallpaperCtx.fillStyle = '#080015'; // Deep cosmic violet
wallpaperCtx.fillRect(0, 0, E, H);

// Base color-melt gradient
const wallGrad = wallpaperCtx.createLinearGradient(0, 0, E, 0);
wallGrad.addColorStop(0, '#ff007f');   // Hot Pink
wallGrad.addColorStop(0.25, '#7922e8'); // Electric Purple
wallGrad.addColorStop(0.5, '#00f5ff');   // Luminous Cyan
wallGrad.addColorStop(0.75, '#9fe818'); // Toxic Lime
wallGrad.addColorStop(1.0, '#ff007f');
wallpaperCtx.fillStyle = wallGrad;
wallpaperCtx.fillRect(0, 0, E, H);

// High-frequency horizontal moiré ripples
wallpaperCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
wallpaperCtx.lineWidth = 1.5;
for (let y = 0; y < H; y += 8) {
    wallpaperCtx.beginPath();
    const amp = 12;
    const freq = 0.06;
    for (let x = 0; x <= E; x += 2) {
        const dy = amp * Math.sin(x * freq + y * 0.08 + time * 1.5);
        if (x === 0) wallpaperCtx.moveTo(x, y + dy);
        else wallpaperCtx.lineTo(x, y + dy);
    }
    wallpaperCtx.stroke();
}

// Densely scattered neon dots & wraps to ensure seamless tiling
for (let i = 0; i < 45; i++) {
    const x = Math.floor(Math.abs(hash(i * 3.14)) * E * 10) % E;
    const y = Math.floor(Math.abs(hash(i * 7.82)) * H * 10) % H;
    const r = 2.5 + Math.abs(hash(i * 11.1)) * 6.5;
    const color = i % 3 === 0 ? '#ffbe0b' : (i % 3 === 1 ? '#00ffff' : '#ff00ff');

    wallpaperCtx.fillStyle = color;
    // Draw dot and its wrapped neighbors
    for (let offset of [-E, 0, E]) {
        wallpaperCtx.beginPath();
        wallpaperCtx.arc(x + offset, y, r, 0, Math.PI * 2);
        wallpaperCtx.fill();
    }
}

// Draw crisp vertical anchor bars (crucial for easy stereogram lock-on)
wallpaperCtx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
wallpaperCtx.lineWidth = 2.0;
for (let x = 0; x < E; x += 24) {
    wallpaperCtx.beginPath();
    wallpaperCtx.moveTo(x, 0);
    wallpaperCtx.lineTo(x, H);
    wallpaperCtx.stroke();
}

// Inject shimmering mathematical glyphs
wallpaperCtx.fillStyle = '#ffffff';
wallpaperCtx.font = 'bold 10px monospace';
for (let i = 0; i < 20; i++) {
    const x = Math.floor(Math.abs(hash(i * 13.9)) * E * 10) % E;
    const y = Math.floor(Math.abs(hash(i * 19.3)) * H * 10) % H;
    const glyph = ['+', '×', 'ø', '?', '!', '•', '§', '¶', '‡', '✳'][i % 10];
    for (let offset of [-E, 0, E]) {
        wallpaperCtx.fillText(glyph, x + offset, y);
    }
}

// ─── 3. RENDER THE STEREOGRAM VIA PIXEL-BUFFER SHIFT ────────────────────────
const depthData = depthCtx.getImageData(0, 0, W, H);
const depthPixels = depthData.data;

const wallData = wallpaperCtx.getImageData(0, 0, E, H);
const wallPixels = wallData.data;

const outData = ctx.createImageData(W, H);
const outPixels = outData.data;

// Process each row sequentially (incorporating the left-marching constraint)
for (let y = 0; y < H; y++) {
    const rowOffset = y * W * 4;
    const wallRowOffset = y * E * 4;

    for (let x = 0; x < W; x++) {
        let u = x;

        // March left in steps of local separation
        for (let step = 0; step < 24; step++) {
            if (u < E) break;
            
            const uInt = Math.floor(u);
            const depthIdx = rowOffset + uInt * 4;
            const zVal = depthPixels[depthIdx] / 255.0; // Retrieve depth z ∈ [0, 1]

            // Separation formula: sep = E * (1 - mu * z) / (2 - mu * z)
            const sep = E * (1.0 - mu * zVal) / (2.0 - mu * zVal);
            u -= sep;
        }

        // Sample seamless wallpaper pattern
        const uWall = Math.floor((u % E + E) % E);
        const wallIdx = wallRowOffset + uWall * 4;
        const outIdx = rowOffset + x * 4;

        outPixels[outIdx]     = wallPixels[wallIdx];     // R
        outPixels[outIdx + 1] = wallPixels[wallIdx + 1]; // G
        outPixels[outIdx + 2] = wallPixels[wallIdx + 2]; // B
        outPixels[outIdx + 3] = 255;                     // A
    }
}

// Write the compiled stereogram pixels back to the screen
ctx.putImageData(outData, 0, 0);

// ─── 4. OVERLAY CONVERGENCE DOTS & DIAGNOSTICS ──────────────────────────────
// Render two highly visible, high-contrast alignment dots near the top (y ≈ 95%)
const dotX1 = W / 2 - E / 2;
const dotX2 = W / 2 + E / 2;
const dotY = Math.floor(H * 0.06);

// Draw outer dark rings
ctx.fillStyle = '#000000';
ctx.beginPath();
ctx.arc(dotX1, dotY, 7, 0, Math.PI * 2);
ctx.arc(dotX2, dotY, 7, 0, Math.PI * 2);
ctx.fill();

// Draw glowing cyan cores
ctx.fillStyle = '#00f5ff';
ctx.beginPath();
ctx.arc(dotX1, dotY, 3.5, 0, Math.PI * 2);
ctx.arc(dotX2, dotY, 3.5, 0, Math.PI * 2);
ctx.fill();

// Retinal Diagnostic HUD / Mystical text overlay at the bottom
ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
ctx.font = 'bold 9px monospace';
ctx.textAlign = 'center';
ctx.fillText("RETINAL COHERENCE INTERFACE • LOOK THROUGH THE SCREEN", W / 2, H - 35);
ctx.fillText("THE WALLPAPER IS THE DEPTH • THE DEPTH IS THE MAGIC • THE MAGIC IS THE EYE", W / 2, H - 22);
ctx.fillText(`W: ${W}px | H: ${H}px | E: ${E}px | FUSE DOTS AT TOP`, W / 2, H - 10);

// Draw a subtle neon border around the viewport
ctx.strokeStyle = 'rgba(0, 245, 255, 0.25)';
ctx.lineWidth = 6;
ctx.strokeRect(0, 0, W, H);