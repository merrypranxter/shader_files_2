// [THE WEIRD CODE GUY] - FERAL DESIGN-BRAIN: ACTIVE
// MECHANISM: Autophagic Sectoring & Enzymatic Moiré
// BIOLOGY: Mycelial networks don't just grow; they fuse (anastomosis), 
// reject (melanized sector boundaries), and digest (white/brown rot).
// AESTHETIC: Gross-but-cute. Neon plush organisms fighting a turf war in the dark.

const CELL_SIZE = 4;
const MAX_AGENTS = 1200;

// Pseudo-random hash for deterministic chaos
function hash(x, y) {
    let n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
}

// Perceptual-ish neon palette generator (Golden Angle hue distribution)
function getSpeciesColor(species, density, time, isGumball = false) {
    // 137.508 is the Golden Angle, ensuring maximum hue separation per species
    let h = (species * 137.508 + time * 15.0) % 360;
    let s = isGumball ? 100 : 85;
    // Density increases lightness (enzymatic bleaching effect)
    let l = isGumball ? 75 : Math.min(65, 40 + density * 2);
    return `hsl(${h}, ${s}%, ${l}%)`;
}

// Initialize the wet engine state
if (!canvas.__fungal_state || canvas.width !== grid.width || canvas.height !== grid.height) {
    const cols = Math.ceil(grid.width / CELL_SIZE);
    const rows = Math.ceil(grid.height / CELL_SIZE);
    
    canvas.__fungal_state = {
        cols, rows,
        // Grid packs: [Species ID (8 bits)] [Density (24 bits)]
        chemGrid: new Uint32Array(cols * rows),
        agents: [],
        initialized: true
    };

    // Deep humus void background
    ctx.fillStyle = '#050408';
    ctx.fillRect(0, 0, grid.width, grid.height);

    // Inoculate substrate with N distinct species
    const NUM_SPECIES = 7;
    for (let i = 0; i < NUM_SPECIES; i++) {
        let cx = (hash(i, 0) * 0.8 + 0.1) * grid.width;
        let cy = (hash(i, 1) * 0.8 + 0.1) * grid.height;
        
        for (let j = 0; j < 50; j++) {
            canvas.__fungal_state.agents.push(createAgent(cx, cy, i, 0));
        }
    }
}

const state = canvas.__fungal_state;

function createAgent(x, y, species, generation) {
    return {
        x, y,
        px: x, py: y, // Previous pos
        angle: hash(x, y) * Math.PI * 2,
        species,
        generation,
        thickness: Math.max(0.5, 3.5 - generation * 0.4),
        speed: 1.0 + hash(x, y) * 1.5,
        wobble: (hash(y, x) - 0.5) * 0.4,
        active: true
    };
}

// 1. TEMPORAL BLOOM (The Void Rule + Decay)
// We don't clear the screen. We lay down a highly transparent dark wash 
// to create a persistent, glowing history, simulating aging tissue.
ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = 'rgba(5, 4, 8, 0.015)';
ctx.fillRect(0, 0, grid.width, grid.height);

// 2. WET ENGINE SIMULATION (Agents)
let activeCount = 0;
let newAgents = [];

for (let i = 0; i < state.agents.length; i++) {
    let a = state.agents[i];
    if (!a.active) continue;
    activeCount++;

    // Kinematics
    a.px = a.x;
    a.py = a.y;
    a.angle += a.wobble + (Math.sin(time * 2.0 + a.x * 0.01) * 0.1);
    a.x += Math.cos(a.angle) * a.speed;
    a.y += Math.sin(a.angle) * a.speed;

    // Boundary death
    if (a.x < 0 || a.x >= grid.width || a.y < 0 || a.y >= grid.height) {
        a.active = false;
        continue;
    }

    // Grid interaction
    let cx = Math.floor(a.x / CELL_SIZE);
    let cy = Math.floor(a.y / CELL_SIZE);
    let idx = cx + cy * state.cols;
    let cell = state.chemGrid[idx];
    
    let cellSpecies = cell >>> 24;
    let cellDensity = cell & 0xFFFFFF;

    ctx.lineWidth = a.thickness;
    ctx.lineCap = 'round';

    if (cellDensity === 0) {
        // EXPLORATION: Empty substrate. Claim it.
        state.chemGrid[idx] = (a.species << 24) | 1;
        
        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = getSpeciesColor(a.species, 1, time);
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(a.x, a.y);
        ctx.stroke();

        // Branching mechanism (McCabe-like stochastic branching)
        if (hash(a.x, time) < 0.02 && state.agents.length + newAgents.length < MAX_AGENTS) {
            newAgents.push(createAgent(a.x, a.y, a.species, a.generation + 1));
            a.angle += (hash(a.y, time) > 0.5 ? 1 : -1) * (Math.PI / 4); // Branch angle
        }

    } else if (cellSpecies === a.species) {
        // ANASTOMOSIS: Fusion with self/kin.
        state.chemGrid[idx] = (a.species << 24) | Math.min(cellDensity + 1, 0xFFFFFF);
        
        if (cellDensity > 2 && hash(a.x, a.y) < 0.3) {
            // Draw "Gumball" Anastomosis Node
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = getSpeciesColor(a.species, cellDensity, time, true);
            ctx.beginPath();
            ctx.arc(a.x, a.y, a.thickness * 1.8, 0, Math.PI * 2);
            ctx.fill();
            
            // Loop closure: agent terminates into the network
            a.active = false;
        } else {
            // Thicken the cord (resource superhighway)
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = getSpeciesColor(a.species, cellDensity, time);
            ctx.beginPath();
            ctx.moveTo(a.px, a.py);
            ctx.lineTo(a.x, a.y);
            ctx.stroke();
        }

    } else {
        // SECTOR BOUNDARY: Collision with foreign species. Melanization!
        // The hostile coordinate logic creates jagged, dark scar tissue.
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#000000'; // Pure melanin black
        ctx.lineWidth = a.thickness * 2.5;
        
        // Jagged scar mechanism
        let scarX = a.x + (hash(time, a.x) - 0.5) * 8;
        let scarY = a.y + (hash(time, a.y) - 0.5) * 8;
        
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(scarX, scarY);
        ctx.stroke();

        // Also draw a dark red/purple necrotic halo
        ctx.fillStyle = 'rgba(40, 0, 20, 0.4)';
        ctx.beginPath();
        ctx.arc(scarX, scarY, a.thickness * 3, 0, Math.PI*2);
        ctx.fill();

        a.active = false; // Die on impact
    }
}

// 3. RE-INOCULATION (Spore drop)
// If the network stagnates, drop new spores to keep the system alive
if (activeCount < MAX_AGENTS * 0.2) {
    let species = Math.floor(hash(time, 0) * 7);
    let x = hash(time, 1) * grid.width;
    let y = hash(time, 2) * grid.height;
    newAgents.push(createAgent(x, y, species, 0));
    
    // Spore visual
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI*2);
    ctx.fill();
}

// Merge new agents and filter dead ones
state.agents = state.agents.concat(newAgents).filter(a => a.active);

// 4. ENZYMATIC DECAY (Substrate Rot)
// Periodically rot the background based on chemical density
ctx.globalCompositeOperation = 'overlay';
for (let i = 0; i < 40; i++) {
    let idx = Math.floor(hash(time, i) * state.chemGrid.length);
    let cell = state.chemGrid[idx];
    let density = cell & 0xFFFFFF;
    
    if (density > 5) {
        let cx = (idx % state.cols) * CELL_SIZE;
        let cy = Math.floor(idx / state.cols) * CELL_SIZE;
        
        if (hash(cx, cy) > 0.5) {
            // White Rot: Lignin peroxidase bleaching (Cyan/White radial glow)
            let grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, CELL_SIZE * 4);
            grad.addColorStop(0, 'rgba(180, 255, 255, 0.15)');
            grad.addColorStop(1, 'rgba(180, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, CELL_SIZE * 4, 0, Math.PI*2);
            ctx.fill();
        } else {
            // Brown Rot: Cellulose removal leading to cubical cracking
            ctx.fillStyle = 'rgba(30, 10, 5, 0.8)';
            let shrink = hash(cx, time) * 2;
            ctx.fillRect(cx + shrink, cy + shrink, CELL_SIZE * 2 - shrink*2, CELL_SIZE * 2 - shrink*2);
            // Draw the crack
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(cx, cy, CELL_SIZE*2, CELL_SIZE*2);
        }
    }
}