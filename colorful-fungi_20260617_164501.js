const w = grid.width;
const h = grid.height;

// RISO Spot Colors (Strictly NO Black or White)
const PALETTE = [
    '#FF4C00', // Fluo Red
    '#FFE800', // Yellow
    '#00A95C', // Green
    '#0078BF', // Blue
    '#FF6BB5', // Fluo Pink
    '#012169', // Navy
    '#DC4E28', // Orange
    '#3D1F6D', // Purple
    '#00838A', // Teal
    '#8B4C2A'  // Brown
];

// Structural Color / Thin Film gradients (simulated)
const INTERFERENCE = ['#0bbfd9', '#7a22e8', '#9fe818', '#e89940', '#e85955'];

// Math Constants from Dream Physics & Color Systems
const GOLDEN_ANGLE = 2.39996322973;
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];

// Pseudo-random noise
function hash(n) { return (Math.sin(n) * 43758.5453123) % 1; }
function noise(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const a = hash(ix + iy * 57);
    const b = hash(ix + 1 + iy * 57);
    const c = hash(ix + (iy + 1) * 57);
    const d = hash(ix + 1 + (iy + 1) * 57);
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

// Initialize Feral State
if (!canvas.__feralState) {
    const agents = [];
    const wells = []; // Mnemonic Gravity Wells

    // Initialize Gravity Wells
    for (let i = 0; i < 5; i++) {
        wells.push({
            x: Math.random() * w,
            y: Math.random() * h,
            mass: 0.5 + Math.random() * 1.5,
            phase: Math.random() * Math.PI * 2
        });
    }

    // Initialize Hyphal Agents
    for (let i = 0; i < 150; i++) {
        agents.push(createAgent(Math.random() * w, Math.random() * h, i));
    }

    canvas.__feralState = {
        agents,
        wells,
        tick: 0,
        primeIndex: 0
    };

    // Prime the canvas to ensure NO EMPTY SPACE (Dense RISO Purple/Navy Substrate)
    ctx.fillStyle = PALETTE[7]; // Purple
    ctx.fillRect(0, 0, w, h);
    
    // Add initial mycelial substrate noise
    for(let x = 0; x < w; x += 20) {
        for(let y = 0; y < h; y += 20) {
            ctx.fillStyle = PALETTE[Math.floor(Math.random() * PALETTE.length)];
            ctx.beginPath();
            ctx.arc(x, y, 15 + Math.random() * 20, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

const state = canvas.__feralState;
state.tick++;

function createAgent(x, y, id) {
    return {
        id: id,
        x: x,
        y: y,
        px: x,
        py: y,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        angle: Math.random() * Math.PI * 2,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        thickness: 1 + Math.random() * 4,
        life: 100 + Math.random() * 300,
        maxLife: 400,
        hetLoci: Math.floor(Math.random() * 5) // For anastomosis compatibility
    };
}

// ============================================================================
// LAYER 1: MNEMONIC RECURSION (DREAM PHYSICS FEEDBACK LOOP)
// ============================================================================
// The dream eats its own history. We scale and rotate slightly towards the center
// to create a gravitational time-loop effect, colored by affective fields.
ctx.save();
ctx.translate(w / 2, h / 2);
// Prime gap pulsation for scaling
const primePulse = PRIMES[state.primeIndex % PRIMES.length] * 0.0001;
if (state.tick % 60 === 0) state.primeIndex++;

ctx.scale(1.002 + primePulse, 1.002 + primePulse);
ctx.rotate(Math.sin(state.tick * 0.01) * 0.003);
ctx.translate(-w / 2, -h / 2);

// Prevent whiteout/blackout by using source-over with a vibrant, semi-transparent tint
ctx.globalAlpha = 0.96;
ctx.drawImage(canvas, 0, 0);
ctx.restore();

// Glaze the substrate to keep colors rich and feral, avoiding black/white
ctx.globalCompositeOperation = 'source-over';
ctx.globalAlpha = 0.03;
ctx.fillStyle = PALETTE[5]; // Navy
ctx.fillRect(0, 0, w, h);
ctx.globalAlpha = 1.0;

// ============================================================================
// LAYER 2: GRAVITY WELLS (AFFECTIVE FIELDS)
// ============================================================================
state.wells.forEach((well, i) => {
    // Wells drift through impossible space
    well.x += Math.sin(state.tick * 0.005 + well.phase) * 2;
    well.y += Math.cos(state.tick * 0.007 + well.phase) * 2;
    
    // Wrap wells
    if (well.x < -100) well.x = w + 100;
    if (well.x > w + 100) well.x = -100;
    if (well.y < -100) well.y = h + 100;
    if (well.y > h + 100) well.y = -100;
});

// ============================================================================
// LAYER 3: MYCELIAL ANASTOMOSIS & ENZYMATIC GROWTH
// ============================================================================
ctx.lineCap = 'round';
ctx.lineJoin = 'round';

for (let i = 0; i < state.agents.length; i++) {
    const a = state.agents[i];
    a.px = a.x;
    a.py = a.y;

    // 1. Spitzenkörper Steering (Noise-based exploration)
    const n = noise(a.x * 0.005, a.y * 0.005 + state.tick * 0.001);
    a.angle += (n - 0.5) * 0.5;

    // 2. Mnemonic Gravity (Attraction to wells)
    let gx = 0, gy = 0;
    state.wells.forEach(well => {
        const dx = well.x - a.x;
        const dy = well.y - a.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 40000) {
            const force = well.mass / Math.max(distSq, 100);
            gx += dx * force;
            gy += dy * force;
        }
    });

    // 3. Velocity Update & Kinematics
    a.vx = Math.cos(a.angle) * 2 + gx * 100;
    a.vy = Math.sin(a.angle) * 2 + gy * 100;
    
    // Limit speed
    const speed = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
    if (speed > 3) {
        a.vx = (a.vx / speed) * 3;
        a.vy = (a.vy / speed) * 3;
    }

    a.x += a.vx;
    a.y += a.vy;
    a.life--;

    // 4. Draw Hyphal Thread (Multiply/Screen style interaction)
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(a.x, a.y);
    ctx.strokeStyle = a.color;
    ctx.lineWidth = a.thickness;
    ctx.stroke();

    // 5. Anastomosis (Fusion & Structural Color Nodes)
    // Check proximity to other agents
    for (let j = i + 1; j < state.agents.length; j++) {
        const b = state.agents[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < 900) { // Close proximity
            // HET Loci self-recognition check
            if (a.hetLoci === b.hetLoci) {
                // Compatible! Fuse and draw a structural color node
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.strokeStyle = INTERFERENCE[state.tick % INTERFERENCE.length];
                ctx.lineWidth = 1;
                ctx.stroke();

                // Draw Thin-Film Interference Halo (Enzymatic bloom)
                if (Math.random() < 0.05) {
                    ctx.globalCompositeOperation = 'color-dodge';
                    const grad = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, 15);
                    grad.addColorStop(0, INTERFERENCE[(i + state.tick) % INTERFERENCE.length]);
                    grad.addColorStop(1, 'transparent');
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(a.x, a.y, Math.max(0.1, 15 * Math.random()), 0, Math.PI * 2);
                    ctx.fill();
                }

                // Redirect angle slightly (network loop closure)
                a.angle = Math.atan2(dy, dx);
            } else {
                // Incompatible! Repel and draw melanized barrier (Dark Brown/Purple)
                a.angle += Math.PI / 2;
                b.angle -= Math.PI / 2;
                
                if (Math.random() < 0.1) {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.fillStyle = PALETTE[9]; // Brown
                    ctx.beginPath();
                    ctx.arc((a.x + b.x)/2, (a.y + b.y)/2, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    // 6. Branching (Mitosis / Apical dominance failure)
    if (Math.random() < 0.01 && state.agents.length < 300) {
        const child = createAgent(a.x, a.y, state.agents.length);
        child.angle = a.angle + (Math.random() > 0.5 ? GOLDEN_ANGLE : -GOLDEN_ANGLE);
        child.color = PALETTE[(PALETTE.indexOf(a.color) + 1) % PALETTE.length];
        child.hetLoci = a.hetLoci;
        state.agents.push(child);
    }

    // 7. Death & Rebirth (Sclerotium wait -> Spore release)
    if (a.life <= 0 || a.x < -50 || a.x > w + 50 || a.y < -50 || a.y > h + 50) {
        // Explode into spores before dying
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = PALETTE[0]; // Fluo Red
        for(let s=0; s<3; s++) {
            ctx.beginPath();
            ctx.arc(a.x + (Math.random()-0.5)*20, a.y + (Math.random()-0.5)*20, Math.random()*5+1, 0, Math.PI*2);
            ctx.fill();
        }
        
        // Respawn
        const newX = Math.random() > 0.5 ? Math.random() * w : (Math.random() > 0.5 ? 0 : w);
        const newY = Math.random() > 0.5 ? Math.random() * h : (Math.random() > 0.5 ? 0 : h);
        state.agents[i] = createAgent(newX, newY, a.id);
    }
}

// Culling excess agents to maintain performance and avoid solid blobs
if (state.agents.length > 200 && state.tick % 10 === 0) {
    state.agents.splice(150, state.agents.length - 150);
}