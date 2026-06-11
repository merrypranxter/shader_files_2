// Initialize persistent state for floating windows and sparkles
if (!canvas.__glitchState) {
    canvas.__glitchState = {
        stars: Array.from({length: 45}, () => ({
            x: Math.random() * grid.width,
            y: Math.random() * grid.height,
            size: Math.random() * 18 + 5,
            phase: Math.random() * Math.PI * 2,
            speed: Math.random() * 0.15 + 0.05
        })),
        windows: Array.from({length: 5}, () => ({
            x: Math.random() * grid.width,
            y: Math.random() * grid.height,
            w: Math.random() * 150 + 120,
            h: Math.random() * 100 + 80,
            color: ['#FF1493', '#00FFFF', '#39FF14', '#FF00FF'][Math.floor(Math.random()*4)],
            text: ["<3", "RAW", "x_x", "404", "GLITCH"][Math.floor(Math.random()*5)]
        }))
    };
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, grid.width, grid.height);
}

const state = canvas.__glitchState;
const w = grid.width;
const h = grid.height;

// 1. Feedback Loop (Temporal Echo & Datamosh)
// Scales and rotates the canvas slightly, drawing it back onto itself to create infinite tunnels
ctx.globalCompositeOperation = 'source-over';
ctx.globalAlpha = 0.88;
ctx.translate(w/2, h/2);
ctx.rotate(Math.sin(time * 0.4) * 0.02);
ctx.scale(1.02 + Math.sin(time * 1.5) * 0.02, 1.02 + Math.cos(time * 1.2) * 0.02);
ctx.translate(-w/2, -h/2);
ctx.drawImage(canvas, 0, Math.sin(time * 5) * 2); 
ctx.setTransform(1, 0, 0, 1, 0, 0);
ctx.globalAlpha = 1.0;

// Darken slightly to prevent blown out white accumulation
ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
ctx.fillRect(0, 0, w, h);

// 2. Moiré Interference Pattern (Optical Illusion Core)
ctx.globalCompositeOperation = 'difference';
ctx.lineWidth = 3;

// Vertical wavy lines
ctx.beginPath();
for (let i = 0; i < w; i += 12) {
    ctx.moveTo(i, 0);
    ctx.lineTo(i + Math.sin(time * 3 + i * 0.01) * 25, h);
}
ctx.strokeStyle = '#FFFFFF';
ctx.stroke();

// Rotated intersecting lines for Moiré
ctx.beginPath();
let angle = Math.sin(time * 0.5) * 0.15;
let cosA = Math.cos(angle), sinA = Math.sin(angle);
for (let i = -w; i < w * 2; i += 12) {
    let x1 = i, y1 = -h;
    let x2 = i, y2 = h * 2;
    
    // Rotate points around center
    let rx1 = cosA*(x1-w/2) - sinA*(y1-h/2) + w/2;
    let ry1 = sinA*(x1-w/2) + cosA*(y1-h/2) + h/2;
    let rx2 = cosA*(x2-w/2) - sinA*(y2-h/2) + w/2;
    let ry2 = sinA*(x2-w/2) + cosA*(y2-h/2) + h/2;

    ctx.moveTo(rx1, ry1);
    ctx.lineTo(rx2, ry2);
}
// Apply RGB split to the Moiré
ctx.strokeStyle = '#00FFFF'; // Cyan
ctx.stroke();
ctx.translate(6, 6);
ctx.strokeStyle = '#FF00FF'; // Magenta
ctx.stroke();
ctx.setTransform(1, 0, 0, 1, 0, 0);

// 3. Concentric Glitch Targets
ctx.globalCompositeOperation = 'screen';
let cx = w/2 + Math.sin(time * 1.1) * 150;
let cy = h/2 + Math.cos(time * 1.4) * 150;

for (let i = 0; i < 12; i++) {
    let radius = (time * 200 + i * 45) % (w * 0.9);
    let split = Math.sin(time * 12 + i) * 18; // RGB separation amount
    
    ctx.lineWidth = 8 + Math.sin(time * 6 + i) * 6;

    // Red/Pink channel
    ctx.beginPath();
    ctx.arc(cx + split, cy, Math.max(0.1, radius), 0, Math.PI * 2);
    ctx.strokeStyle = '#FF1493'; 
    ctx.stroke();

    // Cyan channel
    ctx.beginPath();
    ctx.arc(cx, cy + split, Math.max(0.1, radius), 0, Math.PI * 2);
    ctx.strokeStyle = '#00FFFF'; 
    ctx.stroke();

    // Acid Green channel
    ctx.beginPath();
    ctx.arc(cx - split, cy - split, Math.max(0.1, radius), 0, Math.PI * 2);
    ctx.strokeStyle = '#39FF14'; 
    ctx.stroke();
    
    // Inner Black & White optical core
    ctx.globalCompositeOperation = 'difference';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0.1, radius * 0.85), 0, Math.PI * 2);
    ctx.strokeStyle = (i % 2 === 0) ? '#FFFFFF' : '#000000';
    ctx.stroke();
    ctx.globalCompositeOperation = 'screen';
}

// 4. MySpace Debris (Pop-up Windows & Sparkles)
ctx.globalCompositeOperation = 'source-over';
state.windows.forEach((win, i) => {
    // Float around
    win.x += Math.sin(time * 2.5 + i) * 4;
    win.y += Math.cos(time * 1.8 + i) * 4;
    
    // Glitch teleport
    if (Math.random() < 0.015) {
        win.x = (Math.random() - 0.2) * w;
        win.y = (Math.random() - 0.2) * h;
    }

    // Windows 95 style base
    ctx.fillStyle = '#C0C0C0';
    ctx.fillRect(win.x, win.y, win.w, win.h);
    
    // 3D borders
    ctx.fillStyle = '#FFF';
    ctx.fillRect(win.x, win.y, win.w, 2);
    ctx.fillRect(win.x, win.y, 2, win.h);
    ctx.fillStyle = '#808080';
    ctx.fillRect(win.x + win.w - 2, win.y, 2, win.h);
    ctx.fillRect(win.x, win.y + win.h - 2, win.w, 2);
    
    // Title bar
    ctx.fillStyle = win.color;
    ctx.fillRect(win.x + 2, win.y + 2, win.w - 4, 18);
    
    // Title Text
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(win.text, win.x + 6, win.y + 15);
    
    // X button
    ctx.fillStyle = '#C0C0C0';
    ctx.fillRect(win.x + win.w - 18, win.y + 4, 14, 14);
    ctx.fillStyle = '#000';
    ctx.fillText("X", win.x + win.w - 15, win.y + 15);

    // Inner content: Op-art checkerboard
    ctx.fillStyle = '#000';
    ctx.fillRect(win.x + 2, win.y + 20, win.w - 4, win.h - 22);
    ctx.fillStyle = '#FFF';
    for(let cx = 0; cx < win.w - 4; cx += 10) {
        for(let cy = 0; cy < win.h - 22; cy += 10) {
            if ((cx/10 + cy/10) % 2 === 0) {
                ctx.fillRect(win.x + 2 + cx, win.y + 20 + cy, 10, 10);
            }
        }
    }
});

// Glitter Sparkles
state.stars.forEach((star, i) => {
    star.phase += star.speed;
    let s = star.size * (0.5 + 0.5 * Math.sin(star.phase));
    
    ctx.save();
    ctx.translate(star.x, star.y);
    ctx.rotate(time * 2 + star.phase);
    
    ctx.shadowBlur = 20;
    ctx.shadowColor = (i % 2 === 0) ? '#FF1493' : '#00FFFF';
    
    // Draw 4-point star
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(s*0.2, -s*0.2, s, 0);
    ctx.quadraticCurveTo(s*0.2, s*0.2, 0, s);
    ctx.quadraticCurveTo(-s*0.2, s*0.2, -s, 0);
    ctx.quadraticCurveTo(-s*0.2, -s*0.2, 0, -s);
    
    ctx.fillStyle = '#FFF';
    ctx.fill();
    ctx.restore();
    
    // Drift
    star.x += Math.sin(time + star.phase) * 2;
    star.y += Math.cos(time + star.phase) * 2;
    
    // Wrap around screen
    if (star.x < -50) star.x = w + 50;
    if (star.x > w + 50) star.x = -50;
    if (star.y < -50) star.y = h + 50;
    if (star.y > h + 50) star.y = -50;
});

// 5. Horizontal Tearing / Block Glitch
if (Math.random() < 0.45) {
    let numTears = Math.floor(Math.random() * 6) + 1;
    for(let i=0; i<numTears; i++) {
        let sliceY = Math.random() * h;
        let sliceH = Math.random() * 50 + 5;
        let shiftX = (Math.random() - 0.5) * 200;
        
        // Draw image slice shifted (simulating datamosh/sync loss)
        ctx.drawImage(canvas, 
            0, sliceY, w, sliceH,
            shiftX, sliceY, w, sliceH
        );
        
        // Invert colors of the tear randomly
        if (Math.random() < 0.35) {
            ctx.globalCompositeOperation = 'difference';
            ctx.fillStyle = '#FFF';
            ctx.fillRect(shiftX, sliceY, w, sliceH);
            ctx.globalCompositeOperation = 'source-over';
        }
        
        // Add solid neon RGB noise blocks
        if (Math.random() < 0.25) {
            ctx.fillStyle = ['#FF1493', '#00FFFF', '#39FF14'][Math.floor(Math.random()*3)];
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillRect(shiftX, sliceY, w, sliceH);
            ctx.globalCompositeOperation = 'source-over';
        }
    }
}

// 6. Scrolling Marquee Text 
ctx.globalCompositeOperation = 'difference';
let fontSize = Math.max(30, w / 15);
ctx.font = `bold ${fontSize}px sans-serif`;
let txt = " RAW_DATA // xXx_GLITCH_xXx // ";
let txtW = ctx.measureText(txt).width;
let txtX = -(time * 250) % txtW;

ctx.fillStyle = '#FFF';
ctx.fillText(txt + txt + txt, txtX, h - 30);

// 7. CRT Scanlines
ctx.globalCompositeOperation = 'multiply';
ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
for(let i = 0; i < h; i += 4) {
    ctx.fillRect(0, i, w, 2);
}
ctx.globalCompositeOperation = 'source-over';