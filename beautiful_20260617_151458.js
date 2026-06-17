if (!canvas.__rainblown_math) {
    canvas.__rainblown_math = true;
    
    ctx.fillStyle = '#F5F0E8';
    ctx.fillRect(0, 0, grid.width, grid.height);
    
    const RISO_COLORS = [
        { main: '#FF4C00', mis: '#FFE800' }, // Cherry
        { main: '#0078BF', mis: '#00838A' }, // Ocean
        { main: '#012169', mis: '#FF6BB5' }, // Night
        { main: '#FF4C00', mis: '#FF6BB5' }, // Fluo Glow
        { main: '#1A1A1A', mis: '#FF6BB5' }, // Punk
        { main: '#FF4C00', mis: '#00A95C' }  // Acid
    ];
    
    function hexToRgba(hex, a) {
        let r = parseInt(hex.slice(1,3), 16);
        let g = parseInt(hex.slice(3,5), 16);
        let b = parseInt(hex.slice(5,7), 16);
        return `rgba(${r},${g},${b},${a})`;
    }
    
    function hash(x, y) {
        let a = x * 127.1 + y * 311.7;
        return (Math.sin(a) * 43758.5453123) % 1;
    }
    
    function noise(x, y) {
        let ix = Math.floor(x), iy = Math.floor(y);
        let fx = x - ix, fy = y - iy;
        let u = fx * fx * (3 - 2 * fx);
        let v = fy * fy * (3 - 2 * fy);
        let a = hash(ix, iy), b = hash(ix + 1, iy);
        let c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    
    function fbm(x, y) {
        let v = 0, a = 0.5;
        for (let i = 0; i < 4; i++) {
            v += a * noise(x, y);
            x *= 2; y *= 2; a *= 0.5;
        }
        return v;
    }
    
    function getNewtonVector(x, y, t) {
        let r = Math.sqrt(x*x + y*y);
        let th = Math.atan2(y, x);
        
        let cx = Math.cos(t * 0.4) * 0.6;
        let cy = Math.sin(t * 0.25) * 0.6;
        
        let z4x = Math.pow(r, 4) * Math.cos(4 * th);
        let z4y = Math.pow(r, 4) * Math.sin(4 * th);
        
        let numX = z4x - cx;
        let numY = z4y - cy;
        
        let denR = 4 * Math.pow(r, 3);
        let denTh = 3 * th;
        let denX = denR * Math.cos(denTh);
        let denY = denR * Math.sin(denTh);
        
        let denMagSq = denX*denX + denY*denY;
        if (denMagSq < 0.0001) return {x: 0, y: 0, mag: 0};
        
        let divX = (numX * denX + numY * denY) / denMagSq;
        let divY = (numY * denX - numX * denY) / denMagSq;
        
        let mag = Math.hypot(divX, divY);
        return {x: -divX, y: -divY, mag: mag};
    }
    
    function snap45(x, y, size) {
        let c = 0.70710678, s = 0.70710678;
        let rx = x * c - y * s;
        let ry = x * s + y * c;
        rx = Math.round(rx / size) * size;
        ry = Math.round(ry / size) * size;
        return {
            x: rx * c + ry * s,
            y: -rx * s + ry * c
        };
    }
    
    class Agent {
        constructor(w, h) {
            this.w = w; this.h = h;
            this.reset(true);
        }
        reset(initial = false) {
            if (initial) {
                this.x = Math.random() * this.w;
                this.y = Math.random() * this.h;
            } else {
                if (Math.random() > 0.5) {
                    this.x = Math.random() > 0.5 ? -20 : this.w + 20;
                    this.y = Math.random() * this.h;
                } else {
                    this.x = Math.random() * this.w;
                    this.y = Math.random() > 0.5 ? -20 : this.h + 20;
                }
            }
            this.life = 100 + Math.random() * 250;
            
            let pal = RISO_COLORS[Math.floor(Math.random() * RISO_COLORS.length)];
            this.color = hexToRgba(pal.main, 0.8);
            this.misColor = hexToRgba(pal.mis, 0.6);
            
            this.size = 1.5 + Math.random() * 3.5;
            this.type = Math.random() > 0.85 ? 'squiggle' : 'halftone';
            
            this.lastHx = -999;
            this.lastHy = -999;
            this.lastDrawX = this.x;
            this.lastDrawY = this.y;
            this.birthTime = Math.random() * 1000;
        }
        update(t, ctx) {
            let scale = Math.min(this.w, this.h) / 3;
            let nx = (this.x - this.w/2) / scale;
            let ny = (this.y - this.h/2) / scale;
            
            let nv = getNewtonVector(nx, ny, t);
            
            let angle = Math.PI / 3.5;
            let vx = nv.x * Math.cos(angle) - nv.y * Math.sin(angle);
            let vy = nv.x * Math.sin(angle) + nv.y * Math.cos(angle);
            
            if (nv.mag > 0) {
                vx = (vx / nv.mag) * 2.0;
                vy = (vy / nv.mag) * 2.0;
            }
            
            let wx = fbm(nx * 2 + t * 0.3, ny * 2) * 2 - 1 + 0.6; 
            let wy = fbm(nx * 2, ny * 2 + t * 0.3) * 2 - 1 + 0.6;
            
            let windFactor = Math.min(1.0, nv.mag * 3.0);
            
            this.x += vx + wx * windFactor * 2.5;
            this.y += vy + wy * windFactor * 2.5;
            
            if (nv.mag < 0.03 && Math.random() < 0.05) {
                this.fruit(ctx);
                return;
            }
            
            this.draw(ctx);
            
            this.life--;
            if (this.life <= 0 || this.x < -100 || this.x > this.w+100 || this.y < -100 || this.y > this.h+100) {
                this.reset();
            }
        }
        draw(ctx) {
            if (this.type === 'halftone') {
                let snap = snap45(this.x, this.y, 8);
                if (snap.x !== this.lastHx || snap.y !== this.lastHy) {
                    this.lastHx = snap.x;
                    this.lastHy = snap.y;
                    
                    ctx.globalCompositeOperation = 'multiply';
                    
                    let misOffset = (Math.random() < 0.02) ? 12 : 3; 
                    
                    ctx.fillStyle = this.misColor;
                    ctx.beginPath();
                    ctx.arc(snap.x + misOffset, snap.y + 2, this.size * 0.9, 0, Math.PI*2);
                    ctx.fill();
                    
                    ctx.fillStyle = this.color;
                    ctx.beginPath();
                    ctx.arc(snap.x, snap.y, this.size, 0, Math.PI*2);
                    ctx.fill();
                }
            } else if (this.type === 'squiggle') {
                let speed = Math.hypot(this.x - this.lastDrawX, this.y - this.lastDrawY);
                if (speed > 0.1) {
                    let dirX = (this.x - this.lastDrawX) / speed;
                    let dirY = (this.y - this.lastDrawY) / speed;
                    let perpX = -dirY;
                    let perpY = dirX;
                    
                    let wave = Math.sin(this.life * 0.3 + this.birthTime) * this.size * 2.0;
                    let drawX = this.x + perpX * wave;
                    let drawY = this.y + perpY * wave;
                    
                    ctx.globalCompositeOperation = 'multiply';
                    ctx.strokeStyle = this.color;
                    ctx.lineWidth = this.size * 0.8;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(this.lastDrawX, this.lastDrawY);
                    ctx.lineTo(drawX, drawY);
                    ctx.stroke();
                    
                    this.lastDrawX = drawX;
                    this.lastDrawY = drawY;
                }
            }
        }
        fruit(ctx) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = this.color;
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#1A1A1A'; 
            
            let s = this.size * 6;
            
            if (Math.random() > 0.5) {
                ctx.beginPath();
                ctx.arc(this.x, this.y, s, 0, Math.PI*2);
                ctx.fill();
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.moveTo(this.x, this.y - s);
                ctx.lineTo(this.x + s*0.866, this.y + s*0.5);
                ctx.lineTo(this.x - s*0.866, this.y + s*0.5);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
            
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = this.misColor;
            for(let i=0; i<6; i++) {
                let bx = this.x + (Math.random()-0.5)*s*3;
                let by = this.y + (Math.random()-0.5)*s*3;
                ctx.beginPath();
                ctx.arc(bx, by, this.size*0.8, 0, Math.PI*2);
                ctx.fill();
            }
            
            this.life = 0;
        }
    }
    
    canvas.__agents = [];
    for (let i = 0; i < 1000; i++) {
        canvas.__agents.push(new Agent(grid.width, grid.height));
    }
}

ctx.globalCompositeOperation = 'source-over';
ctx.fillStyle = 'rgba(245, 240, 232, 0.06)';
ctx.fillRect(0, 0, grid.width, grid.height);

let agents = canvas.__agents;
for (let i = 0; i < agents.length; i++) {
    agents[i].w = grid.width;
    agents[i].h = grid.height;
    agents[i].update(time, ctx);
}

ctx.globalCompositeOperation = 'multiply';
ctx.fillStyle = 'rgba(0, 120, 191, 0.02)'; 
let timeOffset = (time * 15) % 20;
for (let x = 0; x < grid.width; x += 20) {
    ctx.fillRect(x + timeOffset, 0, 1, grid.height);
}
for (let y = 0; y < grid.height; y += 20) {
    ctx.fillRect(0, y + timeOffset, grid.width, 1);
}