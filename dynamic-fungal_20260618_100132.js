if (!canvas.__feralFungiState) {
    const GOLDEN_ANGLE = 2.39996322973;
    const PRIME_GAPS = [1, 2, 2, 4, 2, 4, 2, 4, 6, 2, 6, 4, 2, 4];
    
    // Strict clamp to absolutely forbid black and white (keep between 30 and 225)
    const clampC = (v) => Math.max(30, Math.min(225, Math.floor(v * 255)));

    // OKLab to RGB for perceptual, vibrant, non-muddy colors
    const oklabToRgb = (L, a, b, alpha = 1.0) => {
        let l_ = L + 0.3963377774 * a + 0.2158037573 * b;
        let m_ = L - 0.1055613458 * a - 0.0638541728 * b;
        let s_ = L - 0.0894841775 * a - 1.2914855480 * b;
        let l = l_*l_*l_, m = m_*m_*m_, s = s_*s_*s_;
        let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
        let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
        let bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
        
        const f = x => x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(Math.max(x, 0), 1/2.4) - 0.055;
        return `rgba(${clampC(f(r))}, ${clampC(f(g))}, ${clampC(f(bl))}, ${alpha})`;
    };

    // Structural Color (Thin Film Interference - Bragg Reflection)
    const getStructuralColor = (thickness_nm, angle, alpha = 1.0) => {
        const n_film = 1.56; // Chitin refractive index
        const pathDiff = 2.0 * n_film * thickness_nm * Math.cos(angle);
        const r = 0.5 + 0.5 * Math.cos((pathDiff / 650.0) * Math.PI * 2);
        const g = 0.5 + 0.5 * Math.cos((pathDiff / 530.0) * Math.PI * 2);
        const b = 0.5 + 0.5 * Math.cos((pathDiff / 450.0) * Math.PI * 2);
        return `rgba(${clampC(r)}, ${clampC(g)}, ${clampC(b)}, ${alpha})`;
    };

    // Generate Golden Angle Sequence Palette (color_systems)
    const generatePalette = (count) => {
        let p = [];
        for (let i = 0; i < count; i++) {
            let L = 0.65 + 0.1 * Math.sin(i); 
            let C = 0.22 + 0.05 * Math.cos(i * 2);
            let h = i * GOLDEN_ANGLE;
            p.push(oklabToRgb(L, C * Math.cos(h), C * Math.sin(h)));
        }
        return p;
    };

    class HyphalAgent {
        constructor(x, y, angle, strategy) {
            this.x = x;
            this.y = y;
            this.px = x;
            this.py = y;
            this.vx = Math.cos(angle);
            this.vy = Math.sin(angle);
            this.strategy = strategy; // 'cord' (rhizomorph) or 'lace' (white rot)
            this.age = 0;
            this.gen = 0;
            this.primeIdx = Math.floor(Math.random() * PRIME_GAPS.length);
            
            if (strategy === 'cord') {
                this.life = 400 + Math.random() * 200;
                this.thickness = 5 + Math.random() * 6;
                this.speed = 0.8 + Math.random() * 0.5;
                this.color = state.palette[Math.floor(Math.random() * 5)]; // Lower indices
                this.branchRate = 0.01;
            } else {
                this.life = 150 + Math.random() * 150;
                this.thickness = 1 + Math.random() * 2;
                this.speed = 2.0 + Math.random() * 1.5;
                this.color = state.palette[5 + Math.floor(Math.random() * 7)]; // Higher indices
                this.branchRate = 0.05;
            }
        }

        update(time, mouse) {
            this.px = this.x;
            this.py = this.y;
            this.age++;
            this.life--;

            // Gematria Resonance & I Ching Trigram Forces
            // 26 = YHWH, 13 = AHAVAH (Love)
            const resonance = Math.sin(time * (13.0 / 26.0) * Math.PI); 
            const hexagram = Math.floor(time * 2.0) % 64;
            
            // Vector field driven by incommensurate frequencies (Book of Shaders / Gematria)
            let nx = Math.sin(this.x * 0.005 + time) + Math.cos(this.y * 0.008 - time * 0.5);
            let ny = Math.cos(this.x * 0.007 - time) + Math.sin(this.y * 0.006 + time * 0.5);
            
            // Chemotaxis towards mouse (nutrient source)
            if (mouse.isPressed) {
                let dx = mouse.x - this.x;
                let dy = mouse.y - this.y;
                let dist = Math.sqrt(dx*dx + dy*dy) + 1;
                nx += (dx / dist) * 2.0;
                ny += (dy / dist) * 2.0;
                this.life += 0.5; // Nutrients extend life
            }

            this.vx += nx * 0.1;
            this.vy += ny * 0.1;
            
            // Normalize & apply speed
            let mag = Math.sqrt(this.vx*this.vx + this.vy*this.vy) + 0.001;
            this.vx = (this.vx / mag) * this.speed;
            this.vy = (this.vy / mag) * this.speed;

            this.x += this.vx;
            this.y += this.vy;

            // Branching using Prime Gaps
            if (Math.random() < this.branchRate && state.agents.length < 2000) {
                let splitAngle = PRIME_GAPS[this.primeIdx] * 0.15 * resonance;
                this.primeIdx = (this.primeIdx + 1) % PRIME_GAPS.length;
                
                let currentAngle = Math.atan2(this.vy, this.vx);
                let newAgent = new HyphalAgent(this.x, this.y, currentAngle + splitAngle, this.strategy);
                newAgent.gen = this.gen + 1;
                newAgent.thickness = Math.max(0.5, this.thickness * 0.8);
                state.agents.push(newAgent);
                
                // Diverge original
                let newAngle = currentAngle - splitAngle;
                this.vx = Math.cos(newAngle) * this.speed;
                this.vy = Math.sin(newAngle) * this.speed;
            }

            // Wrap around screen
            if (this.x < 0) { this.x = grid.width; this.px = this.x; }
            if (this.x > grid.width) { this.x = 0; this.px = this.x; }
            if (this.y < 0) { this.y = grid.height; this.py = this.y; }
            if (this.y > grid.height) { this.y = 0; this.py = this.y; }
        }

        draw(ctx, time) {
            // Draw main hypha
            ctx.beginPath();
            ctx.moveTo(this.px, this.py);
            ctx.lineTo(this.x, this.y);
            ctx.lineWidth = this.thickness;
            ctx.strokeStyle = this.color;
            ctx.lineCap = 'round';
            ctx.stroke();

            // Stipple / Spore generation (Botanical illustration motif)
            if (Math.random() < 0.02) {
                let sporeDist = this.thickness * 2 + Math.random() * 10;
                let sporeAngle = Math.random() * Math.PI * 2;
                let sx = this.x + Math.cos(sporeAngle) * sporeDist;
                let sy = this.y + Math.sin(sporeAngle) * sporeDist;
                
                // Structural color spores
                let nm = 300 + (this.age % 400); // 300-700nm
                ctx.fillStyle = getStructuralColor(nm, 0, 0.8);
                ctx.beginPath();
                ctx.arc(sx, sy, Math.random() * 2.5 + 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // Initialize State
    canvas.__feralFungiState = {
        agents: [],
        palette: generatePalette(12),
        initialized: true
    };

    const state = canvas.__feralFungiState;

    // Seed initial agents
    for (let i = 0; i < 150; i++) {
        let angle = i * GOLDEN_ANGLE;
        let r = Math.random() * 100;
        let x = grid.width / 2 + Math.cos(angle) * r;
        let y = grid.height / 2 + Math.sin(angle) * r;
        state.agents.push(new HyphalAgent(x, y, angle, i % 3 === 0 ? 'cord' : 'lace'));
    }

    // Fill initial canvas to eradicate empty space
    for (let x = 0; x < grid.width; x += 20) {
        for (let y = 0; y < grid.height; y += 20) {
            ctx.fillStyle = getStructuralColor(400 + Math.random()*300, Math.random(), 1.0);
            ctx.fillRect(x, y, 20, 20);
        }
    }
}

const state = canvas.__feralFungiState;

// 1. Substrate Feedback Loop (No Empty Space, Fungal Decay)
// We scale and rotate slightly to create an expanding, living substrate
ctx.save();
ctx.translate(grid.width / 2, grid.height / 2);
ctx.scale(1.002, 1.002);
ctx.rotate(Math.sin(time * 0.1) * 0.001);
ctx.translate(-grid.width / 2, -grid.height / 2);
ctx.globalAlpha = 0.98;
ctx.globalCompositeOperation = 'source-over';
ctx.drawImage(canvas, 0, 0);
ctx.restore();

// 2. Laccase/Lignin Enzymatic Wash (Prevents black/white, keeps it vibrant)
ctx.globalAlpha = 1.0;
ctx.globalCompositeOperation = 'overlay';
let washL = 0.55 + 0.1 * Math.sin(time * 0.3);
let washH = time * 0.5;
// Generating a vibrant OKLab wash color
let l_ = washL + 0.396 * (0.15 * Math.cos(washH)) + 0.215 * (0.15 * Math.sin(washH));
let m_ = washL - 0.105 * (0.15 * Math.cos(washH)) - 0.063 * (0.15 * Math.sin(washH));
let s_ = washL - 0.089 * (0.15 * Math.cos(washH)) - 1.291 * (0.15 * Math.sin(washH));
let lr = l_*l_*l_, mg = m_*m_*m_, sb = s_*s_*s_;
let r = Math.max(30, Math.min(225, Math.floor((4.076*lr - 3.307*mg + 0.230*sb)*255)));
let g = Math.max(30, Math.min(225, Math.floor((-1.268*lr + 2.609*mg - 0.341*sb)*255)));
let b = Math.max(30, Math.min(225, Math.floor((-0.004*lr - 0.703*mg + 1.707*sb)*255)));

ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.03)`;
ctx.fillRect(0, 0, grid.width, grid.height);

// 3. Process Agents
ctx.globalCompositeOperation = 'source-over';

for (let i = state.agents.length - 1; i >= 0; i--) {
    let agent = state.agents[i];
    agent.update(time, mouse);
    agent.draw(ctx, time);

    // Anastomosis (Mycelial Network Fusion)
    // Check against a random other agent for performance, rather than N^2
    if (Math.random() < 0.1 && state.agents.length > 1) {
        let other = state.agents[Math.floor(Math.random() * state.agents.length)];
        let dx = agent.x - other.x;
        let dy = agent.y - other.y;
        let distSq = dx*dx + dy*dy;
        
        if (distSq < 2500 && distSq > 100) { // between 10 and 50 px
            // Draw fusion bridge with structural color
            ctx.beginPath();
            ctx.moveTo(agent.x, agent.y);
            ctx.quadraticCurveTo(
                agent.x + dx * 0.5 + Math.cos(time)*10, 
                agent.y + dy * 0.5 + Math.sin(time)*10, 
                other.x, other.y
            );
            
            // Calculate structural color based on distance and time
            let thickness_nm = 300 + (distSq % 400);
            let angle = Math.atan2(dy, dx);
            
            // Structural color formula embedded directly to ensure no white/black
            const pathDiff = 2.0 * 1.56 * thickness_nm * Math.cos(angle);
            const cr = Math.max(30, Math.min(225, Math.floor((0.5 + 0.5 * Math.cos(pathDiff / 650.0 * 6.28)) * 255)));
            const cg = Math.max(30, Math.min(225, Math.floor((0.5 + 0.5 * Math.cos(pathDiff / 530.0 * 6.28)) * 255)));
            const cb = Math.max(30, Math.min(225, Math.floor((0.5 + 0.5 * Math.cos(pathDiff / 450.0 * 6.28)) * 255)));
            
            ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.6)`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            // Exchange energy
            if (agent.life < other.life) agent.life += 5;
        }
    }

    if (agent.life <= 0) {
        state.agents.splice(i, 1);
    }
}

// 4. Maintain ecosystem balance (Reseeding)
while (state.agents.length < 400) {
    // Seed from boundaries or mouse
    let x, y;
    if (Math.random() < 0.5 && mouse.isPressed) {
        x = mouse.x + (Math.random() - 0.5) * 50;
        y = mouse.y + (Math.random() - 0.5) * 50;
    } else {
        x = Math.random() < 0.5 ? 0 : grid.width;
        y = Math.random() * grid.height;
    }
    let angle = Math.random() * Math.PI * 2;
    state.agents.push(new HyphalAgent(x, y, angle, Math.random() < 0.3 ? 'cord' : 'lace'));
}