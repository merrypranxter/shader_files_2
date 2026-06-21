const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let width, height;
const resize = () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
};
window.addEventListener('resize', resize);
resize();

// System State
const state = {
    time: 0,
    reactorPulse: 0,
    chromaShift: 0,
    artifactBurst: 0,
    pulseSpeed: 0.05
};

function drawBackground() {
    // Phosphor-Grid Background
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, width, height);
    
    // Procedural halftone/phosphor texture
    for (let x = 0; x < width; x += 15) {
        for (let y = 0; y < height; y += 15) {
            const val = Math.sin(x * 0.01 + state.time) * Math.cos(y * 0.01 + state.time);
            ctx.fillStyle = val > 0 ? '#1a0f3d' : '#0a1a33';
            ctx.beginPath();
            ctx.arc(x, y, 2 + Math.abs(val) * 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawCentralReactor() {
    const cx = width / 2;
    const cy = height / 2;
    const r = 150 + Math.sin(state.time * 2) * 50;

    // Layered Phosphor Rings
    for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = i % 2 === 0 ? '#ff00ff' : '#00ffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, r + i * 20, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Chromatic Bloom/Flare
    ctx.shadowBlur = 40;
    ctx.shadowColor = '#ff00ff';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
}

function drawDebris() {
    // Interface debris fragments
    for (let i = 0; i < 10; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        ctx.fillStyle = Math.random() > 0.5 ? '#ff00ff' : '#00ffff';
        ctx.fillRect(x, y, 40, 20);
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(x, y, 40, 20);
    }
}

function drawDatamoshSmear() {
    // Motion vector smear simulation
    const steps = 5;
    for (let i = 0; i < steps; i++) {
        const alpha = 0.1 - (i * 0.02);
        ctx.globalAlpha = alpha;
        ctx.drawImage(canvas, -i * 5, -i * 2);
    }
    ctx.globalAlpha = 1.0;
}

function update(t) {
    state.time = t * 0.001;
    
    drawBackground();
    drawCentralReactor();
    drawDebris();
    drawDatamoshSmear();

    // Color Safety Pass: Prevent pure black/white dominance
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 20 && data[i+1] < 20 && data[i+2] < 20) {
            data[i] = 15; data[i+1] = 5; data[i+2] = 40; // Violet darks
        }
        if (data[i] > 230 && data[i+1] > 230 && data[i+2] > 230) {
            data[i] = 255; data[i+1] = 200; data[i+2] = 255; // Pink-white lights
        }
    }
    ctx.putImageData(imgData, 0, 0);

    requestAnimationFrame(update);
}

update(0);