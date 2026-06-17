const W = grid.width;
const H = grid.height;

if (!canvas.__feralFungi) {
    ctx.fillStyle = '#05040a';
    ctx.fillRect(0, 0, W, H);

    const hash = (x, y) => {
        let p = x * 127.1 + y * 311.7;
        return (Math.sin(p) * 43758.5453123) % 1.0;
    };

    const noise = (x, y) => {
        let i = Math.floor(x), j = Math.floor(y);
        let f = x - i, g = y - j;
        let u = f * f * (3.0 - 2.0 * f), v = g * g * (3.0 - 2.0 * g);
        let a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };

    const gamma = x => x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055;

    const oklch2rgb = (L, C, h) => {
        let hRad = h * Math.PI / 180.0;
        let a = C * Math.cos(hRad);
        let b = C * Math.sin(hRad);
        let l_ = L + 0.3963377774 * a + 0.2158037573 * b;
        let m_ = L - 0.1055613458 * a - 0.0638541728 * b;
        let s_ = L - 0.0894841775 * a - 1.2914855480 * b;
        let l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
        let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
        let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
        let bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
        return `rgb(${Math.floor(gamma(r) * 255)}, ${Math.floor(gamma(g) * 255)}, ${Math.floor(gamma(bl) * 255)})`;
    };

    class FruitingBody {
        constructor(x, y, hue) {
            this.x = x;
            this.y = y;
            this.hue = hue;
            this.maxR = 15 + Math.random() * 45;
            this.r = 2;
            this.step = 0;
            this.dead = false;
        }
        update(ctx) {
            if (this.r >= this.maxR) {
                this.dead = true;
                return;
            }
            this.step++;
            if (this.step % 4 === 0) {
                this.r += 3.5;
                ctx.beginPath();
                ctx.arc(this.x, this.y, Math.max(0, this.r), 0, Math.PI * 2);
                if ((this.step / 4) % 2 === 0) {
                    ctx.strokeStyle = '#05040a';
                    ctx.lineWidth = 4.0;
                } else {
                    ctx.strokeStyle = oklch2rgb(0.75, 0.35, this.hue + 180); 
                    ctx.lineWidth = 2.0;
                }
                ctx.stroke();
            }
        }
    }

    class Hypha {
        constructor(x, y, angle, gen, hue) {
            this.x = x;
            this.y = y;
            this.angle = angle;
            this.gen = gen;
            this.hue = hue;
            this.life = 100 + Math.random() * 300;
            this.speed = 1.0 + Math.random() * 2.5;
            this.thickness = Math.max(0.5, 6.0 - gen * 0.6);
            this.dead = false;
            this.cord = gen < 2; 
        }
        update(ctx, time, state) {
            if (this.dead) return;
            this.life--;
            
            if (this.life <= 0 || this.x < 0 || this.x > W || this.y < 0 || this.y > H) {
                this.dead = true;
                if (Math.random() < 0.3) {
                    state.fruitingBodies.push(new FruitingBody(this.x, this.y, this.hue));
                }
                return;
            }

            let nx = noise(this.x * 0.005, time * 0.2) * 2 - 1;
            let ny = noise(this.y * 0.005 + 100, time * 0.2) * 2 - 1;
            this.angle += (nx + ny) * 0.15; 

            let px = this.x;
            let py = this.y;
            this.x += Math.cos(this.angle) * this.speed;
            this.y += Math.sin(this.angle) * this.speed;

            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(this.x, this.y);
            ctx.strokeStyle = oklch2rgb(this.cord ? 0.85 : 0.65, 0.3, this.hue);
            ctx.lineWidth = this.thickness;
            ctx.lineCap = 'round';
            ctx.stroke();

            if (Math.random() < 0.15) {
                let pAngle = this.angle + Math.PI / 2;
                let dist = (Math.random() - 0.5) * this.thickness * 4.0;
                let sx = this.x + Math.cos(pAngle) * dist;
                let sy = this.y + Math.sin(pAngle) * dist;
                ctx.fillStyle = oklch2rgb(0.9, 0.2, this.hue + (Math.random() > 0.5 ? 0 : 180));
                ctx.fillRect(sx, sy, 1.5, 1.5);
            }

            if (Math.random() < 0.02 && this.gen < 10) {
                let branchAngle = this.angle + (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 4 + Math.random() * 0.5);
                state.hyphae.push(new Hypha(this.x, this.y, branchAngle, this.gen + 1, this.hue + state.goldenAngle));
            }
        }
    }

    canvas.__feralFungi = {
        hyphae: [],
        fruitingBodies: [],
        goldenAngle: 137.50776405,
        noise: noise,
        oklch2rgb: oklch2rgb,
        Hypha: Hypha,
        FruitingBody: FruitingBody
    };

    for (let i = 0; i < 12; i++) {
        let angle = (Math.PI * 2 / 12) * i;
        canvas.__feralFungi.hyphae.push(new Hypha(W / 2, H / 2, angle, 0, i * 137.50776405));
    }
}

const state = canvas.__feralFungi;

ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = 'rgba(5, 4, 10, 0.015)'; 
ctx.fillRect(0, 0, W, H);

for (let i = 0; i < state.hyphae.length; i++) {
    let h1 = state.hyphae[i];
    if (h1.dead) continue;

    for (let j = i + 1; j < state.hyphae.length; j++) {
        let h2 = state.hyphae[j];
        if (h2.dead) continue;

        let dx = h2.x - h1.x;
        let dy = h2.y - h1.y;
        let distSq = dx * dx + dy * dy;

        if (distSq < 25.0) {
            h1.dead = true;
            h2.dead = true;
            
            state.fruitingBodies.push(new state.FruitingBody(h1.x, h1.y, h1.hue));
            
            let newAngle = (h1.angle + h2.angle) / 2;
            state.hyphae.push(new state.Hypha(h1.x, h1.y, newAngle, Math.min(h1.gen, h2.gen), h1.hue));
            break;
        }
    }
}

for (let i = state.hyphae.length - 1; i >= 0; i--) {
    state.hyphae[i].update(ctx, time, state);
    if (state.hyphae[i].dead) {
        state.hyphae.splice(i, 1);
    }
}

for (let i = state.fruitingBodies.length - 1; i >= 0; i--) {
    state.fruitingBodies[i].update(ctx);
    if (state.fruitingBodies[i].dead) {
        state.fruitingBodies.splice(i, 1);
    }
}

if (state.hyphae.length < 30) {
    let spawnX, spawnY;
    if (state.fruitingBodies.length > 0 && Math.random() > 0.3) {
        let node = state.fruitingBodies[Math.floor(Math.random() * state.fruitingBodies.length)];
        spawnX = node.x;
        spawnY = node.y;
    } else {
        spawnX = Math.random() * W;
        spawnY = Math.random() * H;
    }
    state.hyphae.push(new state.Hypha(spawnX, spawnY, Math.random() * Math.PI * 2, 0, Math.random() * 360));
}