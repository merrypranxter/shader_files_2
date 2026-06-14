const { width, height } = grid;
const cx = width / 2;
const cy = height / 2;

// --- STATE INITIALIZATION (Wet Engine / Morphogenesis Protocol) ---
if (!canvas.__botanicalState) {
    canvas.__botanicalState = {
        agents: [],
        phase: 0,
        cycle: 0
    };
    spawnAgents(canvas.__botanicalState, width, height);
}

const state = canvas.__botanicalState;

function spawnAgents(state, w, h) {
    const cx = w / 2;
    const cy = h / 2;
    const arms = 12; // 12-fold Haeckel radial symmetry
    
    for(let i = 0; i < arms; i++) {
        const angle = (i / arms) * Math.PI * 2;
        state.agents.push({
            x: cx + Math.cos(angle) * 5,
            y: cy + Math.sin(angle) * 5,
            angle: angle,
            generation: 0,
            life: 200 + Math.random() * 150,
            thickness: 12 + Math.random() * 6,
            speed: 2.0 + Math.random() * 2.0,
            seed: Math.random() * 1000
        });
    }
}

// --- 1. PHOSPHOR TRAIL / VOID BLOOM BACKGROUND ---
// Fades the previous frame slightly to create motion blur and persistence
ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = `rgba(8, 6, 12, 0.06)`; 
ctx.fillRect(0, 0, width, height);

// --- 2. OP ART MOIRÉ / CYMATIC RINGS ---
// Interference phase fields expanding outward
ctx.save();
ctx.translate(cx, cy);
ctx.rotate(time * 0.1);
ctx.globalCompositeOperation = 'screen';
ctx.strokeStyle = 'rgba(100, 200, 255, 0.015)';
ctx.lineWidth = 1;
ctx.beginPath();
const maxR = Math.max(width, height);
const ringSpacing = 20 + Math.sin(time * 0.5) * 10;
for(let r = (time * 15) % ringSpacing; r < maxR; r += ringSpacing) {
    ctx.moveTo(r, 0);
    ctx.arc(0, 0, r, 0, Math.PI * 2);
}
ctx.stroke();
ctx.restore();

// --- 3. WET ENGINE AGENT UPDATE & DRAW ---
const nextAgents = [];

for (let i = 0; i < state.agents.length; i++) {
    const a = state.agents[i];
    a.life--;
    
    const px = a.x;
    const py = a.y;
    
    // Normalized coordinates for field math
    const nx = (a.x - cx) / (width / 2);
    const ny = (a.y - cy) / (height / 2);
    const r = Math.sqrt(nx * nx + ny * ny);
    const theta = Math.atan2(ny, nx);
    
    // A. Gematria / Cymatic Field Steering
    const symTheta = Math.cos(12.0 * theta);
    // 3.73 = LOGOS, 0.86 = ELOHIM (Sacred Ratios)
    const interference = Math.sin(3.73 * r - time) * Math.cos(0.86 * r + time) * symTheta;
    
    // B. Clifford Attractor Field (Organic Morphogenesis)
    const ax = nx * 3.0;
    const ay = ny * 3.0;
    const cl_nx = Math.sin(-1.4 * ay) + 1.0 * Math.cos(-1.4 * ax);
    const cl_ny = Math.sin(1.6 * ax) + 0.7 * Math.cos(1.6 * ay);
    const cliffordAngle = Math.atan2(cl_ny, cl_nx);
    
    let cDiff = cliffordAngle - a.angle;
    while (cDiff > Math.PI) cDiff -= Math.PI * 2;
    while (cDiff < -Math.PI) cDiff += Math.PI * 2;
    
    // Combine forces
    a.angle += interference * 0.15 + cDiff * 0.05 + 0.08 * Math.sin(a.seed + time * 2.0);
    
    // C. Radial Hypnosis Bounds (keep inside frame)
    const angleFromCenter = Math.atan2(ny, nx);
    if (r < 0.1) {
        let rDiff = angleFromCenter - a.angle;
        while (rDiff > Math.PI) rDiff -= Math.PI * 2;
        while (rDiff < -Math.PI) rDiff += Math.PI * 2;
        a.angle += rDiff * 0.1;
    } else if (r > 0.8) {
        let pullDiff = (angleFromCenter + Math.PI) - a.angle;
        while (pullDiff > Math.PI) pullDiff -= Math.PI * 2;
        while (pullDiff < -Math.PI) pullDiff += Math.PI * 2;
        a.angle += pullDiff * 0.08;
    }
    
    // Move
    a.x += Math.cos(a.angle) * a.speed;
    a.y += Math.sin(a.angle) * a.speed;
    
    // D. Color Algebra (Toxic Growth / Fungal Iridescence)
    const hue_t = a.generation * 0.15 + time * 0.2 + a.angle * 0.2;
    const cr = Math.floor(255 * (0.5 + 0.5 * Math.cos(6.283 * (hue_t + 0.4))));
    const cg = Math.floor(255 * (0.5 + 0.5 * Math.cos(6.283 * (hue_t + 0.2))));
    const cb = Math.floor(255 * (0.5 + 0.5 * Math.cos(6.283 * (hue_t + 0.8))));
    
    // E. Botanical Illustration Linework Hierarchy
    
    // Layer 1: Wet Edge Bloom (Capillary bleed)
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(a.x, a.y);
    ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.05)`;
    ctx.lineWidth = a.thickness * 4.0;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Layer 2: Watercolor Wash
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(a.x, a.y);
    ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.3)`;
    ctx.lineWidth = a.thickness * 1.5;
    ctx.stroke();

    // Layer 3: Primary Ink Linework
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(a.x, a.y);
    ctx.strokeStyle = `rgba(10, 5, 20, 0.85)`;
    ctx.lineWidth = a.thickness * 0.25;
    ctx.stroke();
    
    // Layer 4: Stipple Texture
    if (Math.random() < 0.15) {
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, 0.8)`;
        const ox = (Math.random() - 0.5) * a.thickness * 3;
        const oy = (Math.random() - 0.5) * a.thickness * 3;
        ctx.beginPath();
        ctx.arc(a.x + ox, a.y + oy, Math.random() * 1.0 + 0.5, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // F. Flower of Life Rosette Nodes
    if (Math.random() < 0.003) {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(time);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.4)`;
        ctx.lineWidth = 0.5;
        for(let k = 0; k < 6; k++) {
            ctx.rotate(Math.PI / 3);
            ctx.beginPath();
            ctx.arc(a.thickness * 1.5, 0, a.thickness * 1.5, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }
    
    // G. Fractal Branching & Lifecycle
    if (a.life > 0) {
        nextAgents.push(a);
        
        // Spawn new branches using the Golden Angle (137.5 degrees)
        if (Math.random() < 0.02 && a.generation < 6 && state.agents.length < 1200) {
            const phiAngle = 2.39996; 
            const dir = Math.random() < 0.5 ? 1 : -1;
            nextAgents.push({
                x: a.x,
                y: a.y,
                angle: a.angle + dir * phiAngle,
                generation: a.generation + 1,
                life: a.life * 0.8,
                thickness: a.thickness * 0.75,
                speed: a.speed * 0.9,
                seed: Math.random() * 1000
            });
        }
    } else {
        // Death -> Spore / Bindu
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.thickness * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 215, 0, 0.9)`; // Sacred Gold
        ctx.fill();
        ctx.strokeStyle = `rgba(0, 0, 0, 0.8)`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }
}

state.agents = nextAgents;

// --- 4. CIVILIZATIONAL RESET (Sinking of Atlantis) ---
if (state.agents.length === 0) {
    state.phase++;
    if (state.phase > 80) { // Pause before respawn
        spawnAgents(state, width, height);
        state.phase = 0;
        state.cycle++;
        
        // Burn-through Flash
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(0, 0, width, height);
    }
}

// --- 5. GLITCH PROPHET (VHS Damage Aesthetics) ---
if (Math.random() < 0.02) {
    const tearY = Math.floor(Math.random() * height);
    const tearH = Math.floor(Math.random() * (height * 0.08) + 5);
    const shiftX = Math.floor((Math.random() - 0.5) * (width * 0.04));
    
    try {
        const slice = ctx.getImageData(0, tearY, width, tearH);
        ctx.putImageData(slice, shiftX, tearY);
        
        // Chroma Bleed on the torn scanline
        ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255, 0, 100, 0.15)' : 'rgba(0, 255, 200, 0.15)';
        ctx.globalCompositeOperation = 'screen';
        ctx.fillRect(shiftX, tearY, width, tearH);
        ctx.globalCompositeOperation = 'source-over';
    } catch(e) {
        // Failsafe for cross-origin taint in some environments
    }
}