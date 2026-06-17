// ✦ THE WEIRD CODE GUY ✦
// [SYSTEM BOOT] FERAL MYCELIAL INTELLIGENCE OVERRIDE
// Blending: Mycelial Networks + I-Ching Fields + Shiny Structures + Color Systems + Retrofuturism

function feralMycelialIChing(ctx, grid, time, repos, input, mouse, canvas) {
    // Ensure we have a 2D context
    if (!ctx || !ctx.fillRect) return;

    const W = grid.width;
    const H = grid.height;

    // --- COLOR SYSTEMS & PALETTES ---
    // IQ Cosine Palette: Neon Acid (Electric, Rave, Cyberpunk)
    const getNeonAcid = (t) => {
        const a = [0.5, 0.5, 0.5];
        const b = [0.5, 0.5, 0.33];
        const c = [2.0, 1.0, 1.0];
        const d = [0.5, 0.2, 0.25];
        const r = a[0] + b[0] * Math.cos(6.28318 * (c[0] * t + d[0]));
        const g = a[1] + b[1] * Math.cos(6.28318 * (c[1] * t + d[1]));
        const b_ = a[2] + b[2] * Math.cos(6.28318 * (c[2] * t + d[2]));
        return { r: r * 255, g: g * 255, b: b_ * 255 };
    };

    // Toxic Growth / Cosmic Void background blend
    const bgDark = `rgba(10, 0, 21, 0.08)`;

    // --- FERAL MATH UTILS ---
    const hash21 = (x, y) => {
        let p = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        return p - Math.floor(p);
    };

    // --- SYSTEM INITIALIZATION ---
    if (!canvas.__feralMycelium) {
        // 1. Initialize I-Ching Hexagram Nodes (King Wen sequence logic, warped grid)
        const nodes = [];
        const cols = 8;
        const rows = 8;
        const padX = W * 0.15;
        const padY = H * 0.15;
        const stepX = (W - padX * 2) / (cols - 1);
        const stepY = (H - padY * 2) / (rows - 1);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                // Retrofuturistic CRT distortion / topological warp
                const nx = padX + c * stepX + (hash21(c, r) - 0.5) * stepX * 0.8;
                const ny = padY + r * stepY + (hash21(r, c) - 0.5) * stepY * 0.8;
                
                nodes.push({
                    x: nx,
                    y: ny,
                    hexVal: Math.floor(Math.random() * 64), // 6-bit state
                    integrity: 1.0, // 1.0 = pure data, 0.0 = consumed by slime
                    glitchPhase: Math.random() * Math.PI * 2
                });
            }
        }

        // 2. Initialize Physarum (Slime Mold) Agents
        const agents = [];
        const numAgents = 150;
        for (let i = 0; i < numAgents; i++) {
            agents.push({
                x: W * 0.5 + (Math.random() - 0.5) * 20,
                y: H * 0.5 + (Math.random() - 0.5) * 20,
                angle: Math.random() * Math.PI * 2,
                energy: 1.0,
                gen: 0, // generation
                colorOffset: Math.random()
            });
        }

        canvas.__feralMycelium = {
            nodes,
            agents,
            spores: [], // Glitter ecology
            lastTime: time
        };
        
        // Initial clear
        ctx.fillStyle = '#05000a';
        ctx.fillRect(0, 0, W, H);
    }

    const state = canvas.__feralMycelium;
    const dt = Math.min(time - state.lastTime, 0.1);
    state.lastTime = time;

    // --- RENDER PIPELINE: HOST ENVIRONMENT ---
    // 1. Draw quiet host surface (CRT/Moiré decay)
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = bgDark;
    ctx.fillRect(0, 0, W, H);

    // Occasional CRT scanline / Moiré architecture
    if (Math.random() < 0.3) {
        ctx.fillStyle = `rgba(40, 255, 100, 0.01)`;
        ctx.fillRect(0, Math.random() * H, W, 2);
    }

    // --- RENDER PIPELINE: I-CHING NODES (DIVINE DATA CORRUPTION) ---
    ctx.lineWidth = 2;
    state.nodes.forEach((node, i) => {
        // Draw Hexagrams
        const size = 15;
        const lineH = 3;
        const gap = 2;
        
        // Glitch aesthetics
        let drawX = node.x;
        let drawY = node.y;
        if (node.integrity < 0.5) {
            drawX += (Math.random() - 0.5) * (1.0 - node.integrity) * 5;
            drawY += (Math.random() - 0.5) * (1.0 - node.integrity) * 5;
        }

        ctx.save();
        ctx.translate(drawX, drawY);
        
        // Pulse rotation based on integrity
        if (node.integrity < 0.8) {
            ctx.rotate(Math.sin(time * 10 + node.glitchPhase) * (1.0 - node.integrity) * 0.2);
        }

        for (let l = 0; l < 6; l++) {
            const isYang = (node.hexVal & (1 << l)) !== 0;
            const yPos = (5 - l) * (lineH + gap) - (3 * (lineH + gap));
            
            // Color based on consumption
            if (node.integrity > 0.9) {
                ctx.fillStyle = `rgba(200, 200, 220, 0.4)`; // Bone and rust / monochrome ink
            } else {
                const c = getNeonAcid(time * 0.1 + node.integrity);
                ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${1.0 - node.integrity + 0.2})`;
            }

            if (isYang) {
                // Solid line
                ctx.fillRect(-size, yPos, size * 2, lineH);
            } else {
                // Broken line (Yin)
                ctx.fillRect(-size, yPos, size * 0.8, lineH);
                ctx.fillRect(size * 0.2, yPos, size * 0.8, lineH);
            }
        }
        ctx.restore();
        
        // Node recovery (slowly fights back against slime)
        if (node.integrity < 1.0) node.integrity += 0.001;
    });

    // --- RENDER PIPELINE: SLIME MOLD / MYCELIAL AGENTS ---
    // Shine is a structure: Matte host + brilliant veins
    ctx.globalCompositeOperation = 'screen';
    
    for (let i = state.agents.length - 1; i >= 0; i--) {
        const agent = state.agents[i];
        
        // 1. SENSE & STEER (Chemotaxis towards data)
        let bestNode = null;
        let minDist = Infinity;
        
        state.nodes.forEach(node => {
            const d = Math.hypot(node.x - agent.x, node.y - agent.y);
            // Attracted to uncorrupted data
            if (d < 150 && node.integrity > 0.2 && d < minDist) {
                minDist = d;
                bestNode = node;
            }
        });

        if (bestNode) {
            const targetAngle = Math.atan2(bestNode.y - agent.y, bestNode.x - agent.x);
            // Steer
            const angleDiff = targetAngle - agent.angle;
            agent.angle += Math.sign(angleDiff) * 0.1;
            
            // Consume & Corrupt (Anastomosis with Data)
            if (minDist < 10) {
                bestNode.integrity -= 0.05;
                agent.energy += 0.1;
                // XOR bit flip (Divine Data Corruption)
                if (Math.random() < 0.1) {
                    bestNode.hexVal ^= (1 << Math.floor(Math.random() * 6));
                    
                    // Spawn Glitter Spore (Quantum Dust)
                    state.spores.push({
                        x: bestNode.x, y: bestNode.y,
                        vx: (Math.random() - 0.5) * 4,
                        vy: (Math.random() - 0.5) * 4,
                        life: 1.0,
                        c: getNeonAcid(Math.random())
                    });
                }
            }
        } else {
            // Wander (Brownian motion / Curl noise proxy)
            agent.angle += (Math.random() - 0.5) * 0.5;
        }

        // 2. MOVE
        const speed = (2.0 + agent.energy) * (mouse.isPressed ? 3.0 : 1.0);
        const nx = agent.x + Math.cos(agent.angle) * speed;
        const ny = agent.y + Math.sin(agent.angle) * speed;

        // 3. DRAW VEIN (SHINE STRUCTURE)
        const ageT = time * 0.2 + agent.colorOffset;
        const c = getNeonAcid(ageT);
        const thickness = Math.max(0.5, 3.0 - agent.gen * 0.5);

        // Layer 1: Dark/Matte Halo (Residue)
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = `rgba(10, 20, 10, 0.1)`;
        ctx.lineWidth = thickness * 4;
        ctx.beginPath(); ctx.moveTo(agent.x, agent.y); ctx.lineTo(nx, ny); ctx.stroke();

        // Layer 2: Colored Gel (Wet shine)
        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, 0.6)`;
        ctx.lineWidth = thickness * 1.5;
        ctx.beginPath(); ctx.moveTo(agent.x, agent.y); ctx.lineTo(nx, ny); ctx.stroke();

        // Layer 3: Brilliant Core (Nerve/Fiber-optic)
        ctx.strokeStyle = `rgba(255, 255, 255, 0.9)`;
        ctx.lineWidth = thickness * 0.4;
        ctx.beginPath(); ctx.moveTo(agent.x, agent.y); ctx.lineTo(nx, ny); ctx.stroke();

        agent.x = nx;
        agent.y = ny;
        agent.energy -= 0.005;

        // 4. BRANCHING (Apical dominance failure)
        if (Math.random() < 0.02 && agent.energy > 0.5 && state.agents.length < 400) {
            agent.energy *= 0.5;
            state.agents.push({
                x: agent.x, y: agent.y,
                angle: agent.angle + (Math.random() > 0.5 ? 0.8 : -0.8),
                energy: agent.energy,
                gen: agent.gen + 1,
                colorOffset: agent.colorOffset + 0.1
            });
            
            // Kintsugi seam spark at branch point
            ctx.fillStyle = `rgba(255, 255, 200, 0.8)`;
            ctx.beginPath(); ctx.arc(agent.x, agent.y, 2, 0, Math.PI*2); ctx.fill();
        }

        // 5. DEATH (Sclerotium formation)
        if (agent.energy <= 0 || agent.x < 0 || agent.x > W || agent.y < 0 || agent.y > H) {
            state.agents.splice(i, 1);
        }
    }

    // --- RENDER PIPELINE: GLITTER ECOLOGY (SPORES) ---
    // Blue-noise style particulate shine
    ctx.globalCompositeOperation = 'screen';
    for (let i = state.spores.length - 1; i >= 0; i--) {
        const sp = state.spores[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vx *= 0.95; // Friction
        sp.vy *= 0.95;
        sp.life -= 0.02;

        // Twinkle
        const twinkle = Math.sin(time * 20 + sp.x) * 0.5 + 0.5;
        
        ctx.fillStyle = `rgba(${sp.c.r}, ${sp.c.g}, ${sp.c.b}, ${sp.life * twinkle})`;
        ctx.fillRect(sp.x, sp.y, 1.5, 1.5);

        if (sp.life <= 0) state.spores.splice(i, 1);
    }

    // Mouse Interaction: Spawns new invasive tendrils
    if (mouse.isPressed && Math.random() < 0.5) {
        state.agents.push({
            x: mouse.x, y: mouse.y,
            angle: Math.random() * Math.PI * 2,
            energy: 2.0,
            gen: 0,
            colorOffset: Math.random()
        });
    }

    // Reset composite mode
    ctx.globalCompositeOperation = 'source-over';
}

return feralMycelialIChing;