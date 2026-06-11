const w = 320;
const h = 240;

// Initialize offscreen canvases and agents on first run
if (!canvas.__init_glitchcore) {
    canvas.__opArt = document.createElement('canvas');
    canvas.__opArt.width = w; canvas.__opArt.height = h;
    canvas.__opCtx = canvas.__opArt.getContext('2d', { willReadFrequently: true });
    
    canvas.__stickers = document.createElement('canvas');
    canvas.__stickers.width = w; canvas.__stickers.height = h;
    canvas.__stCtx = canvas.__stickers.getContext('2d', { willReadFrequently: true });
    
    canvas.__comp = document.createElement('canvas');
    canvas.__comp.width = w; canvas.__comp.height = h;
    canvas.__compCtx = canvas.__comp.getContext('2d', { willReadFrequently: true });
    
    canvas.__agents = [];
    const acidColors = ['#ff00ff', '#00ffff', '#bdf20d', '#ff3300', '#7a2cff', '#ffffff'];
    const texts = ["xX_oP_Xx", "RAWR", "glitter.gif", "404", "<3", "ERROR", "loading..."];
    
    for(let i = 0; i < 25; i++) {
        canvas.__agents.push({
            x: Math.random() * w, 
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 4, 
            vy: (Math.random() - 0.5) * 4,
            type: Math.floor(Math.random() * 5),
            color: acidColors[Math.floor(Math.random() * acidColors.length)],
            s: 10 + Math.random() * 20,
            text: texts[Math.floor(Math.random() * texts.length)],
            phase: Math.random() * Math.PI * 2
        });
    }
    canvas.__init_glitchcore = true;
}

const opCtx = canvas.__opCtx;
const stCtx = canvas.__stCtx;
const compCtx = canvas.__compCtx;

// ---------------------------------------------------------
// 1. OP-ART LAYER (Retinal Surrealism / Checker Funnel)
// ---------------------------------------------------------
opCtx.fillStyle = 'black';
opCtx.fillRect(0, 0, w, h);

opCtx.save();
opCtx.translate(w / 2, h / 2);
opCtx.rotate(time * 0.3); // Slow radial hypnosis spin

const rings = 18;
const segments = 24;
const totalPhase = time * 2.5;
const phase = totalPhase % 1;
const intPhase = Math.floor(totalPhase);

for (let r = rings; r > 0; r--) {
    // Continuous perspective warp for infinite tunnel illusion
    let rF = r + phase;
    let radOuter = Math.pow(rF / rings, 2) * 350;
    let radInner = Math.pow(Math.max(0, rF - 1) / rings, 2) * 350;
    
    // Lock color to physical geometry to prevent strobing
    let ringIndex = r - intPhase; 
    
    for (let s = 0; s < segments; s++) {
        let angleStart = (s / segments) * Math.PI * 2;
        let angleEnd = ((s + 1) / segments) * Math.PI * 2;
        
        // Stripe fluid distortion / domain warp
        let twist = Math.sin(time * 1.5 + rF * 0.2) * 0.4;
        
        opCtx.fillStyle = (Math.abs(ringIndex) + s) % 2 === 0 ? 'white' : 'black';
        
        opCtx.beginPath();
        opCtx.arc(0, 0, radOuter, angleStart + twist, angleEnd + twist, false);
        opCtx.arc(0, 0, radInner, angleEnd + twist, angleStart + twist, true);
        opCtx.closePath();
        opCtx.fill();
    }
}
opCtx.restore();

// ---------------------------------------------------------
// 2. MYSPACE STICKER LAYER (Temporal Trails & Blingee Core)
// ---------------------------------------------------------
// Slow fade for ghost-frame trails
stCtx.fillStyle = 'rgba(0, 0, 0, 0.12)'; 
stCtx.fillRect(0, 0, w, h);

canvas.__agents.forEach(a => {
    a.phase += 0.1;
    // Jittery cursor-swarm movement
    a.x += a.vx + Math.sin(a.phase) * 1.5;
    a.y += a.vy + Math.cos(a.phase * 0.8) * 1.5;
    
    // Screen wrap
    if(a.x < -30) a.x = w + 30;
    if(a.x > w + 30) a.x = -30;
    if(a.y < -30) a.y = h + 30;
    if(a.y > h + 30) a.y = -30;
    
    stCtx.fillStyle = a.color;
    stCtx.strokeStyle = a.color;
    stCtx.lineWidth = 2;
    stCtx.shadowColor = a.color;
    stCtx.shadowBlur = 10;
    
    stCtx.save();
    stCtx.translate(a.x, a.y);
    stCtx.rotate(Math.sin(time + a.phase) * 0.5);
    
    // Pulse animation
    let pulse = 1 + Math.sin(time * 6 + a.phase) * 0.15;
    stCtx.scale(pulse, pulse);
    
    if (a.type === 0) { // Star
        stCtx.beginPath();
        for(let j = 0; j < 5; j++) {
            let ang1 = j * Math.PI * 0.4 - Math.PI/2;
            let ang2 = ang1 + Math.PI * 0.2;
            stCtx.lineTo(Math.cos(ang1) * a.s, Math.sin(ang1) * a.s);
            stCtx.lineTo(Math.cos(ang2) * a.s * 0.4, Math.sin(ang2) * a.s * 0.4);
        }
        stCtx.closePath();
        stCtx.fill();
    } else if (a.type === 1) { // Heart
        stCtx.beginPath();
        let hs = a.s * 0.5;
        stCtx.arc(-hs, 0, hs, Math.PI, 0);
        stCtx.arc(hs, 0, hs, Math.PI, 0);
        stCtx.lineTo(0, a.s);
        stCtx.closePath();
        stCtx.fill();
    } else if (a.type === 2) { // Win95 Error Box (UI Relic)
        stCtx.shadowBlur = 0; 
        stCtx.fillStyle = '#c0c0c0';
        stCtx.fillRect(-a.s, -a.s*0.6, a.s*2, a.s*1.2);
        stCtx.fillStyle = '#ffffff';
        stCtx.fillRect(-a.s, -a.s*0.6, a.s*2, 2);
        stCtx.fillRect(-a.s, -a.s*0.6, 2, a.s*1.2);
        stCtx.fillStyle = '#808080';
        stCtx.fillRect(-a.s, a.s*0.6-2, a.s*2, 2);
        stCtx.fillRect(a.s-2, -a.s*0.6, 2, a.s*1.2);
        stCtx.fillStyle = '#000080'; // Title bar
        stCtx.fillRect(-a.s+2, -a.s*0.6+2, a.s*2-4, a.s*0.4);
        stCtx.fillStyle = 'white';
        stCtx.font = 'bold 8px monospace';
        stCtx.textAlign = 'left';
        stCtx.fillText("404", -a.s+4, -a.s*0.3);
    } else if (a.type === 3) { // Text Debris
        stCtx.textAlign = 'center';
        stCtx.textBaseline = 'middle';
        stCtx.font = 'bold ' + Math.floor(a.s) + 'px "Comic Sans MS", Impact, sans-serif';
        stCtx.fillText(a.text, 0, 0);
    } else { // Sparkle Cross
        stCtx.beginPath();
        stCtx.moveTo(0, -a.s); stCtx.lineTo(0, a.s);
        stCtx.moveTo(-a.s, 0); stCtx.lineTo(a.s, 0);
        stCtx.moveTo(-a.s*0.3, -a.s*0.3); stCtx.lineTo(a.s*0.3, a.s*0.3);
        stCtx.moveTo(-a.s*0.3, a.s*0.3); stCtx.lineTo(a.s*0.3, -a.s*0.3);
        stCtx.stroke();
    }
    stCtx.restore();
});
stCtx.shadowBlur = 0; 

// ---------------------------------------------------------
// 3. COMPOSITE & GLITCH PASS (VHS + RGB Split + Datamosh)
// ---------------------------------------------------------
compCtx.globalCompositeOperation = 'source-over';
compCtx.drawImage(canvas.__opArt, 0, 0);
compCtx.globalCompositeOperation = 'screen';
compCtx.drawImage(canvas.__stickers, 0, 0);

const imgData = compCtx.getImageData(0, 0, w, h);
const d = imgData.data;
const out = compCtx.createImageData(w, h);
const od = out.data;

// Analog video tracking tear
const trackingTearY = Math.floor((time * 80) % h);
const tearHeight = 15 + Math.sin(time * 5) * 10;
const tearShift = Math.floor(Math.sin(time * 15) * 20);

// Chromatic separation width pulsing with time
const rgbOffset = 2 + Math.floor(Math.abs(Math.sin(time * 4)) * 5);

for (let y = 0; y < h; y++) {
    let shift = 0;
    if (y > trackingTearY && y < trackingTearY + tearHeight) {
        shift = tearShift;
        if (Math.random() < 0.3) shift += (Math.random() - 0.5) * 15; // Jitter
    }
    
    // Screen curvature / CRT scanline warping
    shift += Math.floor(Math.sin(y * 0.03 + time * 4) * 3);

    for (let x = 0; x < w; x++) {
        let sx = x + shift;
        if (sx < 0) sx += w;
        if (sx >= w) sx -= w;
        
        let idx = (y * w + sx) * 4;
        let idxR = (y * w + ((sx - rgbOffset + w) % w)) * 4;
        let idxB = (y * w + ((sx + rgbOffset) % w)) * 4;
        let outIdx = (y * w + x) * 4;
        
        // Apply RGB split
        od[outIdx]     = d[idxR];       // R
        od[outIdx + 1] = d[idx + 1];    // G
        od[outIdx + 2] = d[idxB + 2];   // B
        od[outIdx + 3] = 255;           // Alpha
    }
}

// Macroblocking / Candy Crash Compression
const numBlocks = 12;
for(let i = 0; i < numBlocks; i++) {
    if(Math.random() < 0.3) continue;
    let bx = Math.floor(Math.random() * (w - 32));
    let by = Math.floor(Math.random() * (h - 32));
    let bw = 16 + Math.floor(Math.random() * 32);
    let bh = 8 + Math.floor(Math.random() * 24);
    
    // Copy from adjacent corrupted memory sector
    let ox = Math.floor((Math.random() - 0.5) * 40);
    let oy = Math.floor((Math.random() - 0.5) * 20);
    let invert = Math.random() < 0.15; // Rare toxic inversion
    
    for(let y = 0; y < bh; y++) {
        for(let x = 0; x < bw; x++) {
            if (by + y >= h || bx + x >= w) continue;
            let srcX = Math.min(w - 1, Math.max(0, bx + x + ox));
            let srcY = Math.min(h - 1, Math.max(0, by + y + oy));
            
            let dstIdx = ((by + y) * w + (bx + x)) * 4;
            let srcIdx = (srcY * w + srcX) * 4;
            
            if (invert) {
                od[dstIdx]     = 255 - od[srcIdx];
                od[dstIdx + 1] = 255 - od[srcIdx + 1];
                od[dstIdx + 2] = 255 - od[srcIdx + 2];
            } else {
                od[dstIdx]     = od[srcIdx];
                od[dstIdx + 1] = od[srcIdx + 1];
                od[dstIdx + 2] = od[srcIdx + 2];
            }
        }
    }
}

compCtx.putImageData(out, 0, 0);

// Phosphor scanlines overlay
compCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
for(let y = 0; y < h; y += 2) {
    compCtx.fillRect(0, y, w, 1);
}

// ---------------------------------------------------------
// 4. RENDER TO MAIN CANVAS (Scaled for low-res charm)
// ---------------------------------------------------------
ctx.imageSmoothingEnabled = false; 
ctx.fillStyle = '#050505';
ctx.fillRect(0, 0, grid.width, grid.height);

const scale = Math.max(grid.width / w, grid.height / h);
const drawW = w * scale;
const drawH = h * scale;
const drawX = (grid.width - drawW) / 2;
const drawY = (grid.height - drawH) / 2;

ctx.drawImage(canvas.__comp, drawX, drawY, drawW, drawH);