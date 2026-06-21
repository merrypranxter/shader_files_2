const canvas = grid.canvas;
const ctx = canvas.getContext('2d');
const w = grid.width;
const h = grid.height;

// Phosphor Reef State
let field = new Float32Array(w * h * 4); // R=Activator, G=Pigment, B=Edge, A=Glow
let prevField = new Float32Array(w * h * 4);

function init() {
    for (let i = 0; i < field.length; i += 4) {
        field[i] = Math.random();
        field[i + 1] = Math.random();
    }
}
init();

function draw() {
    // 1. Phosphor Reef Physics (Excitable Medium + Cuttlefish Skin Logic)
    let nextField = new Float32Array(field.length);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let i = (y * w + x) * 4;
            // Simple Laplacian-based wave propagation
            let lap = (
                (field[((y - 1 + h) % h * w + x) * 4] + 
                 field[((y + 1) % h * w + x) * 4] + 
                 field[(y * w + (x - 1 + w) % w) * 4] + 
                 field[(y * w + (x + 1) % w) * 4] - 4 * field[i])
            );
            nextField[i] = field[i] + lap * 0.2 + Math.sin(time + x * 0.05) * 0.01;
            nextField[i + 1] = field[i + 1] * 0.95 + field[i] * 0.1;
        }
    }
    field = nextField;

    // 2. Render Layered Display
    // Background: Chromatic Darks (Peacock/Violet)
    ctx.fillStyle = `rgb(30, 0, 60)`;
    ctx.fillRect(0, 0, w, h);

    for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
            let i = (y * w + x) * 4;
            let act = field[i];
            let hue = (field[i + 1] * 360 + time * 20) % 360;
            
            // Chromatophore pigment disk
            let r = act * 6;
            ctx.fillStyle = `hsl(${hue}, 80%, 60%)`;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();

            // Halftone/Mosaic overlay
            if (x % 16 === 0 && y % 16 === 0) {
                ctx.fillStyle = `rgba(255, 255, 255, 0.2)`;
                ctx.fillRect(x, y, 2, 2);
            }
        }
    }

    // 3. Chromatic Aberration & Lens Flare (Final Finisher)
    // Draw ghosts of the frame
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
    ctx.fillRect(5, 0, w, h);
    ctx.fillStyle = 'rgba(255, 0, 255, 0.1)';
    ctx.fillRect(-5, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    // Lens Flare (Anamorphic Streak)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h/2 + Math.sin(time)*50);
    ctx.lineTo(w, h/2 - Math.sin(time)*50);
    ctx.stroke();

    // CRT Scanlines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    for (let y = 0; y < h; y += 2) {
        ctx.fillRect(0, y, w, 1);
    }
}

draw();