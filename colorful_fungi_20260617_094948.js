const STATE_KEY = '__fungal_wet_engine_v1';

// Fungal Math & Constants
const GOLDEN_ANGLE = 2.3999632297; // 137.5 degrees in radians
const MAX_HYPHAE = 1500;
const ANASTOMOSIS_DIST = 4.0;
const VOID_BG = 'rgba(5, 5, 5, 0.04)'; // Slow enzymatic decay (white rot lace effect)

// Merry's Core Cosine Palette (Cyan/Magenta structural, Gold/White sacred)
function cosinePalette(t, a, b, c, d) {
    return [
        a[0] + b[0] * Math.cos(6.28318 * (c[0] * t + d[0])),
        a[1] + b[1] * Math.cos(6.28318 * (c[1] * t + d[1])),
        a[2] + b[2] * Math.cos(6.28318 * (c[2] * t + d[2]))
    ];
}

// Thin-film interference structural color (from structural_color repo)
function structuralColor(thickness) {
    // Approximates 2nd cos(θ) = mλ Bragg reflection / thin-film
    const pathDiff = thickness * 1.5; 
    const r = 0.5 + 0.5 * Math.cos(6.28318 * (pathDiff + 0.0));
    const g = 0.5 + 0.5 * Math.cos(6.28318 * (pathDiff + 0.33));
    const b = 0.5 + 0.5 * Math.cos(6.28318 * (pathDiff + 0.67));
    return `rgb(${(r*255)|0}, ${(g*255)|0}, ${(b*255)|0})`;
}

// Pseudo-random hash
function hash(x, y) {
    let p = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return p - Math.floor(p);
}

// Curl noise for Spitzenkörper steering
function curlNoise(x, y, t) {
    const scale = 0.005;
    const n1 = Math.sin(x * scale + t) * Math.cos(y * scale - t);
    const n2 = Math.cos(x * scale * 1.5 - t) * Math.sin(y * scale * 1.5 + t);
    return n1 + n2;
}

if (!canvas[STATE_KEY]) {
    // Initialize Fungal State
    canvas[STATE_KEY] = {
        initialized: false,
        hyphae: [],
        spatialGrid: new Map(),
        lastTime: time
    };
}

const state = canvas[STATE_KEY];

// First frame setup
if (!state.initialized) {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, grid.width, grid.height);

    // Seed Haeckel-style radial burst (Art Forms in Nature)
    const numSpores = 16;
    for (let i = 0; i < numSpores; i++) {
        const angle = (i / numSpores) * Math.PI * 2;
        state.hyphae.push({
            x: grid.width / 2,
            y: grid.height / 2,
            angle: angle,
            speed: 1.5 + hash(i, 1) * 1.0,
            gen: 0,
            energy: 1.0,
            strain: i % 3 // 0: White Rot, 1: Brown Rot, 2: Mycorrhizal
        });
    }
    state.initialized = true;
}

// Enzymatic decay pass (slowly erodes old trails, leaving a ghost structure)
ctx.fillStyle = VOID_BG;
ctx.globalCompositeOperation = 'source-over';
ctx.fillRect(0, 0, grid.width, grid.height);

// Clear spatial grid for anastomosis detection
state.spatialGrid.clear();

const newHyphae = [];
let activeHyphaeCount = 0;

// Process the Wet Engine
for (let i = 0; i < state.hyphae.length; i++) {
    const h = state.hyphae[i];
    if (h.energy <= 0) continue; // Dead hypha

    activeHyphaeCount++;

    // Spitzenkörper steering (environmental sampling)
    const steer = curlNoise(h.x, h.y, time * 0.2);
    h.angle += steer * 0.15;

    // Apical extension
    const nx = h.x + Math.cos(h.angle) * h.speed;
    const ny = h.y + Math.sin(h.angle) * h.speed;

    // Draw hypha
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(nx, ny);

    // Palette mapping based on strain and generation
    let col;
    if (h.strain === 0) {
        // Tetragrammaton Gold/White
        col = cosinePalette(h.gen * 0.1 - time * 0.5, [0.5,0.4,0.1], [0.5,0.4,0.1], [1.0,0.7,0.4], [0.0,0.15,0.2]);
    } else if (h.strain === 1) {
        // The Whirring Cyan
        col = cosinePalette(h.gen * 0.1 + time * 0.2, [0.2,0.5,0.6], [0.2,0.4,0.4], [2.0,1.0,1.0], [0.0,0.25,0.5]);
    } else {
        // Neon Magenta/Purple (The Ship)
        col = cosinePalette(h.gen * 0.05, [0.2,0.1,0.3], [0.2,0.1,0.2], [1.0,1.0,0.5], [0.0,0.33,0.67]);
    }

    // High energy = bright hot tips, fading as they age
    const alpha = Math.max(0.1, h.energy);
    ctx.strokeStyle = `rgba(${(col[0]*255)|0}, ${(col[1]*255)|0}, ${(col[2]*255)|0}, ${alpha})`;
    ctx.lineWidth = Math.max(0.5, 3.0 - h.gen * 0.3);
    ctx.lineCap = 'round';
    
    // Add subtle glow to active tips
    if (h.energy > 0.8) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.globalCompositeOperation = 'lighter';
    } else {
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';
    }
    
    ctx.stroke();

    // Update position
    h.x = nx;
    h.y = ny;
    h.energy -= 0.002; // Metabolic cost

    // Spatial Hashing for Anastomosis (Fusion)
    const cellX = Math.floor(h.x / ANASTOMOSIS_DIST);
    const cellY = Math.floor(h.y / ANASTOMOSIS_DIST);
    const cellKey = `${cellX},${cellY}`;

    if (state.spatialGrid.has(cellKey)) {
        const neighbor = state.spatialGrid.get(cellKey);
        // Self-recognition: fuse if different strain or different branch
        if (neighbor.strain !== h.strain || Math.abs(neighbor.angle - h.angle) > 1.0) {
            
            // Anastomosis Event! Draw Structural Color Bloom (Fruiting Body / Node)
            const bloomRadius = Math.max(2, 12 - h.gen);
            
            ctx.globalCompositeOperation = 'screen';
            ctx.shadowBlur = 0;
            
            // Concentric thin-film layers
            for(let r = bloomRadius; r > 0; r -= 1.5) {
                ctx.beginPath();
                ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
                ctx.fillStyle = structuralColor(r * 0.1 + time);
                ctx.fill();
            }
            
            // Genetic exchange / energy merging
            h.energy = 0; // Terminate this tip, it fused
            neighbor.energy += 0.5; // Boost the survivor
            neighbor.speed *= 1.1; // Cord formation (thickening/speeding up)
        }
    } else {
        state.spatialGrid.set(cellKey, h);
    }

    // Branching (Lateral emergence)
    // Only branch if alive, have energy, and population isn't maxed out
    if (h.energy > 0.2 && state.hyphae.length + newHyphae.length < MAX_HYPHAE) {
        const branchProb = 0.02 + (h.strain === 1 ? 0.03 : 0.0); // Strain 1 branches more
        if (Math.random() < branchProb) {
            // Golden angle branching for optimal space filling
            const dir = Math.random() > 0.5 ? 1 : -1;
            newHyphae.push({
                x: h.x,
                y: h.y,
                angle: h.angle + GOLDEN_ANGLE * dir,
                speed: h.speed * 0.85, // Branches grow slightly slower
                gen: h.gen + 1,
                energy: h.energy * 0.8,
                strain: h.strain
            });
            h.energy *= 0.8; // Cost of branching
        }
    }

    // Boundary wrap (Toroidal manifold mapping)
    if (h.x < 0) h.x += grid.width;
    if (h.x > grid.width) h.x -= grid.width;
    if (h.y < 0) h.y += grid.height;
    if (h.y > grid.height) h.y -= grid.height;
}

// Clean up dead hyphae and append new ones
state.hyphae = state.hyphae.filter(h => h.energy > 0).concat(newHyphae);

// If network dies out, re-seed a new colony somewhere else (Mycelial persistence)
if (activeHyphaeCount < 10) {
    const rx = Math.random() * grid.width;
    const ry = Math.random() * grid.height;
    const newStrain = Math.floor(Math.random() * 3);
    for (let i = 0; i < 8; i++) {
        state.hyphae.push({
            x: rx,
            y: ry,
            angle: (i / 8) * Math.PI * 2 + time,
            speed: 1.2,
            gen: 0,
            energy: 1.0,
            strain: newStrain
        });
    }
}

// Reset composite ops
ctx.globalCompositeOperation = 'source-over';
ctx.shadowBlur = 0;