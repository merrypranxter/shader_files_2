const { width, height } = grid;

if (!canvas.__fungalState) {
    // FERAL DESIGN BRAIN INIT
    // System: Mycelial Voronoi Minkowski Morphing + Horror Vacui Crayon + Op Art Interference
    const cellSize = 3;
    const cols = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);
    
    // OKLCh to sRGB conversion for perceptually uniform acid palettes
    const oklch2rgb = (L, C, h) => {
        const hr = h * Math.PI / 180;
        const a = C * Math.cos(hr);
        const b = C * Math.sin(hr);
        const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
        const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
        const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
        const l = l_*l_*l_, m = m_*m_*m_, s = s_*s_*s_;
        const r =  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
        const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
        const bl= -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
        const f = x => x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(Math.max(0, x), 1/2.4) - 0.055;
        return [
            Math.max(0, Math.min(255, Math.round(f(r) * 255))),
            Math.max(0, Math.min(255, Math.round(f(g) * 255))),
            Math.max(0, Math.min(255, Math.round(f(bl) * 255)))
        ];
    };

    const sectors = [];
    const numSectors = 7; // Prime number for irregular interference
    const GOLDEN_ANGLE = 137.50776405;
    
    for (let i = 0; i < numSectors; i++) {
        // Acid Neon Palette via Golden Angle
        const [r, g, b] = oklch2rgb(0.75, 0.28, i * GOLDEN_ANGLE);
        // Melanized Barrage Color (Incompatible sector collision)
        const [dr, dg, db] = oklch2rgb(0.25, 0.15, i * GOLDEN_ANGLE + 45);
        // Spore Color
        const [sr, sg, sb] = oklch2rgb(0.9, 0.15, i * GOLDEN_ANGLE + 180);
        
        sectors.push({
            color: `rgba(${r}, ${g}, ${b}, 0.8)`,
            core: `rgba(${r}, ${g}, ${b}, 1.0)`,
            barrage: `rgba(${dr}, ${dg}, ${db}, 0.9)`,
            spore: `rgba(${sr}, ${sg}, ${sb}, 1.0)`
        });
    }

    canvas.__fungalState = {
        spatialGrid: new Int32Array(cols * rows).fill(-1),
        cols, rows, cellSize,
        sectors,
        agents: [],
        spawn: function(x, y, angle, sector, energy, isCord) {
            this.agents.push({
                x, y, px: x, py: y,
                angle, sector, energy,
                isCord,
                speed: isCord ? 2.5 : 1.2,
                wobblePhase: Math.random() * 100,
                dead: false
            });
        }
    };

    // Fill void
    ctx.fillStyle = '#05040a'; // The Ship void-black
    ctx.fillRect(0, 0, width, height);

    // Seed initial spores
    for (let i = 0; i < 40; i++) {
        const sx = width * 0.1 + Math.random() * width * 0.8;
        const sy = height * 0.1 + Math.random() * height * 0.8;
        const s = i % numSectors;
        for (let j = 0; j < 6; j++) {
            canvas.__fungalState.spawn(sx, sy, (Math.PI * 2 / 6) * j, s, 200 + Math.random() * 200, false);
        }
    }
}

const state = canvas.__fungalState;

// 1. Environmental Fade (The Void Rule)
// Slowly decay the canvas to black, leaving ghost trails
ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = 'rgba(5, 4, 10, 0.03)';
ctx.fillRect(0, 0, width, height);

// 2. The Whirring (Op Art Background Interference)
ctx.globalCompositeOperation = 'screen';
ctx.save();
ctx.translate(width / 2, height / 2);
ctx.rotate(time * 0.1);
ctx.beginPath();
const maxRad = Math.max(width, height);
for (let i = 10; i < maxRad; i += 30) {
    ctx.arc(0, 0, i + Math.sin(time * 2 + i * 0.1) * 5, 0, Math.PI * 2);
}
ctx.strokeStyle = 'rgba(0, 245, 255, 0.015)'; // Cyan Whirring
ctx.lineWidth = 1.5;
ctx.stroke();
ctx.restore();

ctx.globalCompositeOperation = 'source-over';

// 3. Horror Vacui Maintenance
// If the network dies down, spontaneously generate new spores in empty spaces
if (state.agents.length < 300) {
    for (let i = 0; i < 5; i++) {
        const rx = Math.random() * width;
        const ry = Math.random() * height;
        const idx = Math.floor(rx / state.cellSize) + Math.floor(ry / state.cellSize) * state.cols;
        if (idx >= 0 && idx < state.spatialGrid.length && state.spatialGrid[idx] === -1) {
            const sector = Math.floor(Math.random() * state.sectors.length);
            state.spawn(rx, ry, Math.random() * Math.PI * 2, sector, 150, false);
        }
    }
}

// 4. Agent Processing (Mycelial Growth, Anastomosis, Sectoring)
const nextAgents = [];
ctx.lineCap = 'round';
ctx.lineJoin = 'round';

for (let i = 0; i < state.agents.length; i++) {
    const a = state.agents[i];
    if (a.dead) continue;

    a.px = a.x;
    a.py = a.y;

    // Wobble (Outsider Art Crayon Pulse)
    a.wobblePhase += 0.2;
    const wobbleAmt = a.isCord ? 0.1 : 0.4;
    a.angle += (Math.sin(a.wobblePhase) + Math.cos(a.wobblePhase * 0.618)) * wobbleAmt;

    a.x += Math.cos(a.angle) * a.speed;
    a.y += Math.sin(a.angle) * a.speed;
    a.energy -= 1;

    // Bounds check
    if (a.x < 0 || a.x > width || a.y < 0 || a.y > height || a.energy <= 0) {
        a.dead = true;
        continue;
    }

    // Spatial Hash Collision (Anastomosis & Barrage)
    const gx = Math.floor(a.x / state.cellSize);
    const gy = Math.floor(a.y / state.cellSize);
    const gIdx = gx + gy * state.cols;

    let collided = false;

    if (gIdx >= 0 && gIdx < state.spatialGrid.length) {
        const cellData = state.spatialGrid[gIdx];

        if (cellData === -1) {
            // Empty space: claim it
            state.spatialGrid[gIdx] = a.sector;
        } else if (cellData === a.sector) {
            // Anastomosis (Self-recognition -> Fusion -> Loop formation)
            // Draw bright fusion node
            ctx.fillStyle = state.sectors[a.sector].core;
            ctx.beginPath();
            ctx.arc(a.x, a.y, a.isCord ? 3 : 1.5, 0, Math.PI * 2);
            ctx.fill();
            
            // Reorient and potentially form a cord (superhighway)
            a.angle += Math.PI * (Math.random() > 0.5 ? 0.25 : -0.25);
            if (!a.isCord && Math.random() < 0.1) {
                a.isCord = true;
                a.energy += 50; // Boost energy for cord
            }
            collided = true;
        } else {
            // Sector Boundary (Incompatible -> Barrage Line / Melanin Scar)
            // Op Art Retinal Interference: Draw concentric circles of clashing colors
            ctx.save();
            const rad = a.isCord ? 8 : 4;
            for (let r = rad; r > 0; r -= 2) {
                ctx.fillStyle = (r / 2) % 2 === 0 ? state.sectors[a.sector].barrage : state.sectors[cellData].spore;
                ctx.beginPath();
                ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();

            // Scribe a harsh, dark jagged line to mark the territory boundary
            ctx.strokeStyle = state.sectors[a.sector].barrage;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(a.px, a.py);
            ctx.lineTo(a.x + (Math.random() - 0.5) * 10, a.y + (Math.random() - 0.5) * 10);
            ctx.stroke();

            a.dead = true;
            collided = true;
        }
    }

    if (!a.dead) {
        // Draw Mycelial Thread (Outsider Crayon Mark)
        // Draw multiple offset strokes for a waxy, vibrating look
        ctx.strokeStyle = state.sectors[a.sector].color;
        ctx.lineWidth = a.isCord ? 2.5 : 0.8;
        
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(a.x, a.y);
        ctx.stroke();

        // Chromatic interference edge (Op Art)
        if (a.isCord) {
            ctx.strokeStyle = state.sectors[a.sector].spore;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(a.px + 1.5, a.py + 1.5);
            ctx.lineTo(a.x + 1.5, a.y + 1.5);
            ctx.stroke();
        }

        // Branching (Horror Vacui)
        if (!collided && Math.random() < 0.04 && state.agents.length < 2500) {
            const splitAngle = a.angle + (Math.random() > 0.5 ? 0.6 : -0.6);
            state.spawn(a.x, a.y, splitAngle, a.sector, a.energy * 0.8, false);
            a.energy *= 0.8; // Share energy
        }

        nextAgents.push(a);
    }
}

state.agents = nextAgents;