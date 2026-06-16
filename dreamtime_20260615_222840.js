// ASTRAL-DREAMTIME WET ENGINE
// A feral fusion of Australian Aboriginal Dreaming track grammar, 
// Belousov-Zhabotinsky chemical oscillation, and Astral-OS Anu hardware.
// The country is a map. The map is a living, breathing reaction-diffusion organism.

const cx = grid.width / 2;
const cy = grid.height / 2;

// Initialize the deep state (The Underlayer)
if (!canvas.__feralDreamtime) {
    const nodes = [];
    const numNodes = 7;
    
    // Seed waterholes (Laya Centers) in the left hemisphere for bilateral symmetry
    for (let i = 0; i < numNodes; i++) {
        nodes.push({
            x: cx * 0.1 + Math.random() * (cx * 0.8),
            y: grid.height * 0.1 + Math.random() * (grid.height * 0.8),
            r: 15 + Math.random() * 25,
            rings: 3 + Math.floor(Math.random() * 5),
            phase: Math.random() * Math.PI * 2,
            id: i
        });
    }

    // Sort by Y to create a meandering primary track chain
    nodes.sort((a, b) => a.y - b.y);

    const tracks = [];
    for (let i = 0; i < nodes.length - 1; i++) {
        tracks.push({ a: nodes[i], b: nodes[i+1], type: 'primary' });
    }
    // Add a few skip-connections (cross-tracks)
    for (let i = 0; i < nodes.length - 2; i++) {
        if (Math.random() > 0.5) tracks.push({ a: nodes[i], b: nodes[i+2], type: 'secondary' });
    }

    // Generate Dot Field (Anu Bubbles)
    const dots = [];
    const spacing = Math.max(8, Math.sqrt((grid.width * grid.height) / 6000));
    const trackClearance = spacing * 1.8;
    const nodeClearance = spacing * 1.5;

    // Distance to line segment (SDF)
    const sdSegment = (p, a, b) => {
        const pa = { x: p.x - a.x, y: p.y - a.y };
        const ba = { x: b.x - a.x, y: b.y - a.y };
        const h = Math.max(0, Math.min(1, (pa.x * ba.x + pa.y * ba.y) / (ba.x * ba.x + ba.y * ba.y)));
        return Math.hypot(pa.x - ba.x * h, pa.y - ba.y * h);
    };

    for (let y = 0; y < grid.height; y += spacing * 0.866) {
        for (let x = 0; x < cx; x += spacing) { // Only left hemisphere
            const offset = (Math.floor(y / (spacing * 0.866)) % 2) * spacing * 0.5;
            const p = { x: x + offset, y: y };
            
            // Check clearance from nodes
            let minDistToNode = Infinity;
            for (const n of nodes) {
                const d = Math.hypot(p.x - n.x, p.y - n.y) - n.r;
                if (d < minDistToNode) minDistToNode = d;
            }

            // Check clearance from tracks
            let minDistToTrack = Infinity;
            for (const t of tracks) {
                const d = sdSegment(p, t.a, t.b);
                if (d < minDistToTrack) minDistToTrack = d;
            }

            // If in the "country" (open space), add dot
            if (minDistToNode > nodeClearance && minDistToTrack > trackClearance) {
                dots.push({
                    x: p.x, 
                    y: p.y,
                    baseRad: spacing * 0.4,
                    entropy: Math.random()
                });
            }
        }
    }

    canvas.__feralDreamtime = { nodes, tracks, dots, spacing };
}

const state = canvas.__feralDreamtime;

// The Void Rule: Background is near-black, never grey. Motion leaves trails.
ctx.fillStyle = 'rgba(10, 5, 15, 0.15)';
ctx.fillRect(0, 0, grid.width, grid.height);

// Structural Color / Cosine Palette (Acrylic Contemporary + Neon Acid)
// a + b * cos(2PI * (c * t + d))
const getPalette = (t) => {
    const a = [0.6, 0.3, 0.2];
    const b = [0.5, 0.4, 0.3];
    const c = [1.0, 1.0, 1.0];
    const d = [0.0, 0.15, 0.25];
    
    const r = Math.floor((a[0] + b[0] * Math.cos(6.28318 * (c[0] * t + d[0]))) * 255);
    const g = Math.floor((a[1] + b[1] * Math.cos(6.28318 * (c[1] * t + d[1]))) * 255);
    const b_val = Math.floor((a[2] + b[2] * Math.cos(6.28318 * (c[2] * t + d[2]))) * 255);
    return `rgb(${r}, ${g}, ${b_val})`;
};

// Mirroring Function for Bilateral Symmetry
const drawMirrored = (drawFn) => {
    ctx.save();
    drawFn(1); // Left side
    ctx.restore();
    
    ctx.save();
    ctx.translate(grid.width, 0);
    ctx.scale(-1, 1);
    drawFn(-1); // Right side
    ctx.restore();
};

// 1. Draw Dreaming Tracks (Mycelial Tendrils)
drawMirrored((side) => {
    state.tracks.forEach((track, i) => {
        const dist = Math.hypot(track.b.x - track.a.x, track.b.y - track.a.y);
        const steps = Math.floor(dist / 5);
        const freq = 0.05;
        
        ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
            const progress = s / steps;
            const px = track.a.x + (track.b.x - track.a.x) * progress;
            const py = track.a.y + (track.b.y - track.a.y) * progress;
            
            // Meandering sine wave deviation
            const meander = Math.sin(progress * Math.PI * 4 + time * 2.0 + i) * 
                            (track.type === 'primary' ? 8 : 4);
            
            // Perpendicular vector
            const dx = track.b.x - track.a.x;
            const dy = track.b.y - track.a.y;
            const len = Math.hypot(dx, dy);
            const nx = -dy / len;
            const ny = dx / len;
            
            const fx = px + nx * meander;
            const fy = py + ny * meander;
            
            if (s === 0) ctx.moveTo(fx, fy);
            else ctx.lineTo(fx, fy);
        }
        
        // Multi-layered track rendering (Turing-like borders)
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Deep Red/Ochre Border
        ctx.lineWidth = track.type === 'primary' ? 12 : 6;
        ctx.strokeStyle = 'rgba(139, 0, 0, 0.8)';
        ctx.stroke();
        
        // Vivid Orange Core
        ctx.lineWidth = track.type === 'primary' ? 6 : 2;
        ctx.strokeStyle = 'rgba(255, 107, 53, 0.9)';
        ctx.stroke();
        
        // Gold Energy Pulse
        ctx.setLineDash([10, 15]);
        ctx.lineDashOffset = -time * 30;
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#FFD700';
        ctx.stroke();
        ctx.setLineDash([]);
    });
});

// 2. Draw Waterholes (Concentric Laya Centers)
drawMirrored((side) => {
    state.nodes.forEach((n) => {
        for (let r = n.rings; r > 0; r--) {
            const rad = (n.r / n.rings) * r;
            
            // Alternating colors based on ring index and time (Acrylic Contemporary palette)
            const ringPhase = r * 0.2 - time * 0.5 + n.phase;
            const colorT = 0.5 + 0.5 * Math.sin(ringPhase);
            
            ctx.beginPath();
            
            // Dash the outer rings (Night Fire ceremony style)
            if (r === n.rings) {
                ctx.setLineDash([5, 8]);
                ctx.lineDashOffset = time * 20 * (r % 2 === 0 ? 1 : -1);
            } else {
                ctx.setLineDash([]);
            }
            
            ctx.arc(n.x, n.y, rad, 0, Math.PI * 2);
            ctx.lineWidth = state.spacing * 0.4;
            ctx.strokeStyle = getPalette(colorT + n.id * 0.1);
            ctx.stroke();
            
            // Fill inner core (Anu Singularity)
            if (r === 1) {
                ctx.fillStyle = '#FFFACD'; // Cream white
                ctx.fill();
            }
        }
        ctx.setLineDash([]);
    });
});

// 3. Draw Dot Infill (Belousov-Zhabotinsky oscillating field)
drawMirrored((side) => {
    state.dots.forEach((dot) => {
        // BZ Chemical Oscillator Math (Barkley model approximation via wave interference)
        const dx = dot.x - cx;
        const dy = dot.y - cy;
        const angle = Math.atan2(dy, dx);
        const dist = Math.hypot(dx, dy);
        
        // Spiral wave formula: sin(kr - wt + m*theta)
        const spiral1 = Math.sin(dist * 0.02 - time * 1.5 + angle * 3);
        const spiral2 = Math.sin(dot.x * 0.03 + time) * Math.cos(dot.y * 0.03 - time * 0.8);
        
        // Combine into a scalar field [-1, 1]
        const field = (spiral1 + spiral2) * 0.5;
        
        // Map field to dot radius (breathing dots)
        const rad = dot.baseRad * (0.3 + 0.7 * Math.abs(field));
        
        // Map field to color (Structural color interference)
        // High field = Gold/Orange, Low field = Deep Red/Purple
        const colorT = dot.entropy * 0.2 + field * 0.4 + time * 0.1;
        
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, Math.max(0.1, rad), 0, Math.PI * 2);
        ctx.fillStyle = getPalette(colorT);
        ctx.fill();
    });
});

// Post-Processing: Glitch Prophet (Forbidden Math Overlay)
// Occasional systemic horizontal shifting to represent dimensional tearing
if (Math.random() > 0.95) {
    const sliceY = Math.random() * grid.height;
    const sliceH = Math.random() * 20;
    const shiftX = (Math.random() - 0.5) * 10;
    ctx.drawImage(canvas, 0, sliceY, grid.width, sliceH, shiftX, sliceY, grid.width, sliceH);
}