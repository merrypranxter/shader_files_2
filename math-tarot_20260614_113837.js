// THE ORACLE OF THE DEEP COMPILE
// A feral tarot system combining Gematria resonance frequencies, 
// Op-Art moiré interference, Botanical radial symmetry, 
// and CMY Lithographic misregistration / VHS tracking damage.

const { width: w, height: h } = grid;
const cx = w / 2;
const cy = h / 2;
const t = time;

// --- MATH & NOISE UTILS ---
// Pseudo-random hash
const hash = (x, y) => {
    let p = x * 127.1 + y * 311.7;
    return (Math.sin(p) * 43758.5453123) % 1.0;
};

// Smooth noise
const noise = (x, y) => {
    let ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3.0 - 2.0 * fx);
    fy = fy * fy * (3.0 - 2.0 * fy);
    let a = hash(ix, iy), b = hash(ix + 1, iy);
    let c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};

// --- PALETTES & CONTEXT ---
// From color_fields & tarot_card_aesthetic
const C_VOID   = '#050505'; // Dark Oracle ground
const C_PAPER  = '#F5DEB3'; // Marseille wheat paper
const C_INK    = 'rgba(40, 20, 10, 0.8)'; // Aged brown ink
const C_GOLD   = '#DAA520'; // Amber/Gold skeletal structure

// Lithographic CMY for misregistration (Damage Aesthetics)
const CMY = [
    'rgba(0, 255, 255, 0.6)',   // Cyan
    'rgba(255, 0, 255, 0.6)',   // Magenta
    'rgba(255, 255, 0, 0.6)'    // Yellow
];

// --- CARD GEOMETRY (1 : 1.73 Aspect Ratio) ---
const ch = h * 0.85;
const cw = ch / 1.73;
const left = cx - cw / 2;
const top = cy - ch / 2;
const margin = cw * 0.06;

// Zones
const imgLeft = left + margin;
const imgTop = top + margin;
const imgW = cw - margin * 2;
const imgH = ch * 0.75 - margin; // 75% for image field
const titleTop = imgTop + imgH + margin;
const titleH = ch - (imgH + margin * 3);

// --- 1. THE ABYSS (Background) ---
ctx.fillStyle = C_VOID;
ctx.fillRect(0, 0, w, h);

// CRT / Broadcast Signal Failure (Background Noise)
ctx.lineWidth = 1;
for (let y = 0; y < h; y += 3) {
    let n = noise(0, y * 0.1 + t);
    ctx.strokeStyle = `rgba(30, 40, 50, ${0.05 + n * 0.1})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
}

// --- 2. THE PAPER (Card Base) ---
ctx.fillStyle = C_PAPER;
ctx.fillRect(left, top, cw, ch);

// Copy-of-Copy Decay / Toner Drag
ctx.globalCompositeOperation = 'multiply';
for (let i = 0; i < 150; i++) {
    let dx = left + hash(i, 0) * cw;
    let dy = top + hash(i, 1) * ch;
    let dh = hash(i, 2) * ch * 0.5;
    let dw = 1 + hash(i, 4) * 3;
    ctx.fillStyle = `rgba(139, 69, 19, ${hash(i, 3) * 0.08})`; // Faint rust/bone
    ctx.fillRect(dx, dy, dw, dh);
}
ctx.globalCompositeOperation = 'source-over';

// --- 3. THE IMAGE FIELD (Moiré & Resonance) ---
ctx.save();
ctx.beginPath();
ctx.rect(imgLeft, imgTop, imgW, imgH);
ctx.clip();

// Thoth Aethyr Void Background
ctx.fillStyle = '#111115';
ctx.fillRect(imgLeft, imgTop, imgW, imgH);

// Gematria Frequencies
const FREQ_LOGOS = 37.3; // Prime resonance
const FREQ_YHWH = 26.0;  // Fundamental

// Generate Retinal Surrealism Moiré Field
ctx.globalCompositeOperation = 'screen'; // Additive light for CMY

for (let layer = 0; layer < 3; layer++) {
    // Structural Color / Damage: Offset each layer based on time (Misregistration)
    let driftX = Math.sin(t * 1.5 + layer * 2) * 4.0;
    let driftY = Math.cos(t * 1.3 + layer * 2) * 4.0;
    
    ctx.strokeStyle = CMY[layer];
    ctx.lineWidth = 0.6;
    ctx.beginPath();

    let originX = cx + driftX;
    let originY = imgTop + imgH / 2 + driftY;

    // Draw interference rings (Wave trains)
    for (let r = 2; r < imgH * 0.8; r += 3.5) {
        for (let a = 0; a <= Math.PI * 2; a += 0.08) {
            // Apply "Burning Ship" fold logic to space: abs(z)
            let foldedA = Math.abs(Math.sin(a * 4.0));
            
            // Frequency interference (Beat patterns)
            let wave1 = Math.sin(r * (FREQ_YHWH / 100) - t * 2.0);
            let wave2 = Math.cos(a * (FREQ_LOGOS / 10) + t);
            
            // Domain warping (Stripe Fluid Distortion)
            let deform = wave1 * wave2 * 15.0 * foldedA;
            let finalR = r + deform;

            let px = originX + finalR * Math.cos(a + t * 0.1);
            let py = originY + finalR * Math.sin(a - t * 0.05);

            if (a === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
    }
    ctx.stroke();
}
ctx.globalCompositeOperation = 'source-over';

// --- 4. THE SIGIL (Botanical / Sacred Geometry) ---
// Haeckel Radial Symmetry (12-fold)
const drawSigil = (color, weight, scaleMod) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = weight;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    
    let folds = 12;
    let sigilY = imgTop + imgH * 0.5;
    
    for (let i = 0; i < folds; i++) {
        let angle = (i / folds) * Math.PI * 2 + Math.sin(t * 0.2) * 0.5;
        let baseLen = imgW * 0.35 * scaleMod;
        
        // Spine (Primary line)
        let ex = cx + Math.cos(angle) * baseLen;
        let ey = sigilY + Math.sin(angle) * baseLen;
        ctx.moveTo(cx, sigilY);
        ctx.lineTo(ex, ey);
        
        // Radiolaria Lattice (Secondary web)
        let midR = baseLen * 0.6;
        let mx = cx + Math.cos(angle) * midR;
        let my = sigilY + Math.sin(angle) * midR;
        
        let nextA = ((i + 1) / folds) * Math.PI * 2 + Math.sin(t * 0.2) * 0.5;
        let nx = cx + Math.cos(nextA) * midR;
        let ny = sigilY + Math.sin(nextA) * midR;
        
        // Connect struts
        ctx.moveTo(mx, my);
        ctx.quadraticCurveTo(cx, sigilY, nx, ny);
        
        // Terminus pods (Stipple approximation)
        ctx.moveTo(ex, ey);
        ctx.arc(ex, ey, 2 * scaleMod, 0, Math.PI * 2);
    }
    ctx.stroke();

    // Central Void (Eye Iconography)
    ctx.fillStyle = C_VOID;
    ctx.beginPath();
    ctx.arc(cx, sigilY, imgW * 0.08 * scaleMod, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Inner pupil (Gold)
    ctx.fillStyle = C_GOLD;
    ctx.beginPath();
    ctx.arc(cx, sigilY, imgW * 0.02 * scaleMod, 0, Math.PI * 2);
    ctx.fill();
};

// Line hierarchy
drawSigil(C_GOLD, 2.5, 1.0);       // Primary skeleton
drawSigil(C_PAPER, 0.8, 0.95);     // Secondary highlight
drawSigil(C_INK, 0.5, 1.05);       // Faint drop shadow

ctx.restore(); // End image field clip

// --- 5. THE TITLE BAR (Asemic Curl-Noise Typography) ---
ctx.fillStyle = C_VOID;
ctx.fillRect(imgLeft, titleTop, imgW, titleH);

ctx.strokeStyle = C_GOLD;
ctx.lineWidth = 1.5;
ctx.beginPath();

let glyphX = imgLeft + 15;
let glyphTime = t * 0.5;

// Generate semantic infestation / false text
while (glyphX < imgLeft + imgW - 15) {
    let gw = 8 + hash(glyphX, 1) * 12; // Glyph width
    let gh = titleH * 0.5;             // Glyph height
    let gy = titleTop + (titleH - gh) / 2;

    // Curl-noise inspired vector strokes
    let n1 = noise(glyphX * 0.1, glyphTime);
    let n2 = noise(glyphX * 0.2, glyphTime + 10);
    
    ctx.moveTo(glyphX, gy + n1 * gh);
    ctx.lineTo(glyphX + gw / 2, gy + n2 * gh);
    ctx.lineTo(glyphX + gw, gy + hash(glyphX, 2) * gh);
    
    // Crossbars
    if (hash(glyphX, 3) > 0.5) {
        ctx.moveTo(glyphX + gw * 0.2, gy + gh * 0.5);
        ctx.lineTo(glyphX + gw * 0.8, gy + gh * 0.5);
    }

    glyphX += gw + 6 + hash(glyphX, 4) * 8; // Variable kerning
}
ctx.stroke();

// --- 6. ARCANA NUMBER (Top Center) ---
const numW = 40;
const numH = 20;
ctx.fillStyle = C_PAPER;
ctx.fillRect(cx - numW/2, top + margin/3, numW, numH);
ctx.strokeStyle = C_INK;
ctx.lineWidth = 2;
// Draw a Roman Numeral "0" (The Fool / The Void) - represented by a circle/ellipse
ctx.beginPath();
ctx.ellipse(cx, top + margin/3 + numH/2, 6, 8, 0, 0, Math.PI*2);
ctx.stroke();

// --- 7. CARD BORDERS ---
ctx.strokeStyle = C_GOLD;
ctx.lineWidth = 3.0;
ctx.strokeRect(left, top, cw, ch); // Outer

ctx.strokeStyle = C_INK;
ctx.lineWidth = 1.0;
ctx.strokeRect(left + margin*0.5, top + margin*0.5, cw - margin, ch - margin); // Inner

// --- 8. TEMPORAL DAMAGE (VHS Tracking Tear) ---
// Simulates a catastrophic sync failure rolling down the screen
let tearY = (t * 200) % h;
if (hash(t, 10) > 0.3) { // 70% chance to happen this frame
    let tearH = 10 + hash(t, 11) * 40;
    
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, tearY, w, tearH);
    ctx.clip();
    
    // Signal static
    ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + hash(t, 12) * 0.3})`;
    ctx.fillRect(0, tearY, w, tearH);
    
    // RGB split horizontal bands
    for (let i = 0; i < 40; i++) {
        let color = CMY[Math.floor(hash(i, t) * 3)];
        ctx.fillStyle = color;
        let bx = hash(i, 1) * w;
        let by = tearY + hash(i, 2) * tearH;
        let bw = hash(i, 3) * 150;
        ctx.fillRect(bx, by, bw, 2);
    }
    ctx.restore();
}