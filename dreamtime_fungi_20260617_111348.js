// THE MYCELIAL DREAMTIME MAP
// A feral fusion of Australian Aboriginal visual grammar (dot painting, 
// concentric rings, meandering tracks, bilateral symmetry) with the 
// biological imperatives of Fungi and Slime Molds (mycelial anastomosis, 
// cAMP signal waves, primordia fruiting bodies).
//
// Rendered using OKLCh perceptual color spaces and Golden Angle harmonies.
//
// [AESTHETIC LAWS APPLIED]
// 1. The Void Rule: Background is Night Fire void (#0A0205).
// 2. The Maximalism Rule: The canvas is not cleared; the country is built up.
// 3. The Mathematics Rule: L-System branching + Reaction-Diffusion spirals.

const GOLDEN_ANGLE = 137.50776405;

// --- MATH & NOISE UTILITIES ---
function fract(x) {
    return x - Math.floor(x);
}

function hash(x, y) {
    return fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
}

// Domain-warped FBM (Fractional Brownian Motion)
function fbm(x, y) {
    let v = 0.0;
    let a = 0.5;
    let px = x, py = y;
    for (let i = 0; i < 5; i++) {
        v += a * Math.sin(px + Math.cos(py));
        let nx = px * 0.866 - py * 0.5;
        let ny = px * 0.5 + py * 0.866;
        px = nx * 2.0; 
        py = ny * 2.0;
        a *= 0.5;
    }
    return v;
}

// --- COLOR SYSTEMS (OKLCh to RGB) ---
function oklch2rgb(L, C, h) {
    let hr = h * Math.PI / 180.0;
    let a = C * Math.cos(hr);
    let b = C * Math.sin(hr);

    let l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    let m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    let s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    let l3 = l_ * l_ * l_;
    let m3 = m_ * m_ * m_;
    let s3 = s_ * s_ * s_;

    let r =  4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
    let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
    let bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

    const gamma = x => x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(Math.max(0, x), 1/2.4) - 0.055;
    
    let R = Math.max(0, Math.min(255, Math.floor(gamma(r) * 255)));
    let G = Math.max(0, Math.min(255, Math.floor(gamma(g) * 255)));
    let B = Math.max(0, Math.min(255, Math.floor(gamma(bl) * 255)));
    
    return `rgb(${R}, ${G}, ${B})`;
}

// --- AGENT CLASSES ---

// Primordium: Waterholes / Fruiting Bodies (Concentric Rings)
class Primordium {
    constructor(x, y, hueBase) {
        this.x = x; 
        this.y = y;
        this.ring = 1;
        this.maxRings = 4 + Math.floor(Math.random() * 4);
        this.dotSize = 2.5 + Math.random();
        this.radius = 6;
        this.hueBase = hueBase;
    }

    update(ctx, state, grid) {
        if (this.ring > this.maxRings) return false;

        let circumference = 2 * Math.PI * this.radius;
        let dotsInRing = Math.floor(circumference / (this.dotSize * 2.5));
        let angleStep = (2 * Math.PI) / dotsInRing;

        // Acrylic Contemporary Palette Logic
        let hue = this.hueBase + this.ring * GOLDEN_ANGLE;
        let color = oklch2rgb(0.7, 0.22, hue);
        
        // Night Fire / Charcoal alternating rings
        if (this.ring % 2 === 0) color = '#1A1A1A'; 
        if (this.ring === this.maxRings) color = oklch2rgb(0.95, 0.05, 90); // Bone white outer boundary

        for(let i = 0; i < dotsInRing; i++) {
            let a = i * angleStep;
            let dx = this.x + Math.cos(a) * this.radius;
            let dy = this.y + Math.sin(a) * this.radius;

            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(dx, dy, this.dotSize, 0, 7); ctx.fill();
            // Bilateral Symmetry
            ctx.beginPath(); ctx.arc(grid.width - dx, dy, this.dotSize, 0, 7); ctx.fill();
        }

        this.ring++;
        this.radius += this.dotSize * 2.8;

        // Spawn new Dreaming Tracks (Hyphae) upon completion
        if (this.ring > this.maxRings && state.hyphae.length < 40) {
            let spawnCount = 1 + Math.floor(Math.random() * 3);
            for(let i = 0; i < spawnCount; i++) {
                let angle = Math.random() * Math.PI * 2;
                let hx = this.x + Math.cos(angle) * this.radius;
                let hy = this.y + Math.sin(angle) * this.radius;
                state.hyphae.push(new Hypha(hx, hy, angle, this.hueBase + GOLDEN_ANGLE));
            }
        }
        return true;
    }
}

// Hypha: Dreaming Tracks / Mycelial Cords (Meandering Lines)
class Hypha {
    constructor(x, y, angle, hue) {
        this.x = x; 
        this.y = y; 
        this.angle = angle; 
        this.hue = hue;
        this.life = 150 + Math.random() * 300;
        this.dotSpacing = 6.0;
        this.dist = 0;
        this.dotSize = 2.0;
        this.color = oklch2rgb(0.65, 0.25, hue);
    }

    update(ctx, state, grid, time) {
        if (this.life <= 0) return false;

        let v = 1.5;
        // FBM Domain Warped Meander
        let n = fbm(this.x * 0.015, this.y * 0.015 + time * 0.2);
        this.angle += (n - 0.5) * 0.4;

        this.x += Math.cos(this.angle) * v;
        this.y += Math.sin(this.angle) * v;
        this.dist += v;

        if (this.dist >= this.dotSpacing) {
            this.dist = 0;
            ctx.fillStyle = this.color;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.dotSize, 0, 7); ctx.fill();
            // Bilateral Symmetry
            ctx.beginPath(); ctx.arc(grid.width - this.x, this.y, this.dotSize, 0, 7); ctx.fill();

            // L-System Branching
            if (Math.random() < 0.015 && state.hyphae.length < 50) {
                state.hyphae.push(new Hypha(this.x, this.y, this.angle + 0.6, this.hue + GOLDEN_ANGLE));
                this.angle -= 0.6;
            }

            // Node Formation (Primordia / Waterholes)
            if (Math.random() < 0.004 && state.primordia.length < 12) {
                state.primordia.push(new Primordium(this.x, this.y, this.hue));
                return false; // Hypha terminates into a fruiting body
            }
        }

        this.life--;
        
        // Out of bounds check (only simulate left half due to symmetry)
        if (this.x < 0 || this.x > grid.width/2 || this.y < 0 || this.y > grid.height) return false;

        return true;
    }
}

// --- MAIN RENDER LOGIC ---

if (!canvas.__mycelialDreamtime) {
    ctx.fillStyle = '#0A0205'; // The Void / Night Fire Black
    ctx.fillRect(0, 0, grid.width, grid.height);
    
    canvas.__mycelialDreamtime = {
        hyphae: [],
        primordia: [],
        time: 0,
        baseHue: Math.random() * 360
    };
    
    // Seed initial nodes
    canvas.__mycelialDreamtime.primordia.push(new Primordium(grid.width * 0.25, grid.height * 0.5, canvas.__mycelialDreamtime.baseHue));
    canvas.__mycelialDreamtime.primordia.push(new Primordium(grid.width * 0.25, grid.height * 0.2, canvas.__mycelialDreamtime.baseHue + GOLDEN_ANGLE));
    canvas.__mycelialDreamtime.primordia.push(new Primordium(grid.width * 0.25, grid.height * 0.8, canvas.__mycelialDreamtime.baseHue - GOLDEN_ANGLE));
}

const state = canvas.__mycelialDreamtime;
state.time += 0.016;

// 1. Spore Field / cAMP Signal Waves (Background Dot Infill)
// Drops hundreds of tiny dots per frame, mapped to Slime Mold chemical spiral logic
let cx = grid.width / 2;
let cy = grid.height / 2;

for (let i = 0; i < 600; i++) {
    let x = Math.random() * cx; // Calculate left side only
    let y = Math.random() * grid.height;

    let dx = x - cx;
    let dy = y - cy;
    let dist = Math.hypot(dx, dy);
    let angle = Math.atan2(dy, dx);
    
    // X-Ray Animal / Gill Structure Logic
    let gills = Math.abs(Math.sin(angle * 12.0 + fbm(x * 0.01, y * 0.01) * 3.0));
    
    // cAMP Spiral Waves
    let wave = Math.sin(dist * 0.04 - state.time * 4.0 + angle * 3.0);
    
    // Combine to find active "spore" zones
    let tension = gills * wave * fbm(x * 0.03, y * 0.03 + state.time);
    
    if (tension > 0.3) {
        // Earthy Ochre & Bone White Palette
        let hue = state.baseHue + (wave > 0.8 ? 90 : 30);
        let lum = wave > 0.8 ? 0.85 : 0.4;
        let chr = wave > 0.8 ? 0.05 : 0.18;
        
        ctx.fillStyle = oklch2rgb(lum, chr, hue);
        
        // Draw tiny dot
        ctx.fillRect(x, y, 1.5, 1.5);
        // Bilateral Symmetry mirror
        ctx.fillRect(grid.width - x, y, 1.5, 1.5);
    }
}

// 2. Update and Draw Primordia (Concentric Rings)
// Process backwards for safe removal
for (let i = state.primordia.length - 1; i >= 0; i--) {
    let p = state.primordia[i];
    // Only update every few frames so rings grow deliberately
    if (Math.random() < 0.2) {
        let alive = p.update(ctx, state, grid);
        if (!alive) state.primordia.splice(i, 1);
    }
}

// 3. Update and Draw Hyphae (Dreaming Tracks)
for (let i = state.hyphae.length - 1; i >= 0; i--) {
    let alive = state.hyphae[i].update(ctx, state, grid, state.time);
    if (!alive) state.hyphae.splice(i, 1);
}

// 4. Ecosystem Resurrection
// If the fungal network dies out, drop a new spore to restart the cycle
if (state.hyphae.length === 0 && state.primordia.length === 0) {
    let nx = Math.random() * (grid.width * 0.4) + (grid.width * 0.05);
    let ny = Math.random() * (grid.height * 0.8) + (grid.height * 0.1);
    state.primordia.push(new Primordium(nx, ny, state.baseHue + state.time * 50.0));
}